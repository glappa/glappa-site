#!/usr/bin/env bash
#
# vps-deploy.sh — auf dem VPS ausfuehren NACHDEM ~/glappa-site/ per scp da liegt.
#
# Macht:
#   1) Pre-flight checks
#   2) Docker installieren (falls fehlt)
#   3) Alten youtube-downloader.service stoppen + disablen
#   4) Letsencrypt-Certs verifizieren
#   5) Container bauen + starten (Port 8080, SSL via /etc/letsencrypt)
#   6) Cron einrichten fuer Mitternacht-Restart
#   7) Verify
#
# Aufruf:   bash vps-deploy.sh
# Update:   bash vps-deploy.sh        (laeuft komplett idempotent durch)

set -euo pipefail

PROJECT="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
OLD_SVC="youtube-downloader.service"
DOMAIN="home.glappa.de"
PORT=8080

# ── Helpers ─────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

echo
echo -e "${B}=== Glappa VPS-Deploy ===${X}"
echo "Projekt: $PROJECT"
echo "Domain:  $DOMAIN  (Port $PORT)"
echo "Host:    $(hostname) ($(uname -srm))"
echo

cd "$PROJECT"

# ── 1) Pre-flight ───────────────────────────────────────────────────
for f in docker-compose.vps.yml Dockerfile requirements.txt home/app.py; do
    [ -f "$f" ] || { err "FEHLT: $f"; exit 1; }
done
ok "Alle benoetigten Dateien vorhanden."

# ── 2) Docker installieren ──────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    say "Installiere Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y docker.io docker-compose-v2
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER"
    warn "Docker installiert + dich zur docker-Gruppe hinzugefuegt."
    warn "Logout + Login (oder 'newgrp docker') und dieses Skript NOCHMAL ausfuehren."
    exit 0
fi
ok "Docker: $(docker --version)"

if ! docker compose version >/dev/null 2>&1; then
    say "Installiere Compose-Plugin..."
    sudo apt-get update -qq
    sudo apt-get install -y docker-compose-v2 || sudo apt-get install -y docker-compose-plugin
fi
ok "Compose: $(docker compose version | head -1)"

# Pruefen ob sudo fuer docker noetig
SUDO=""
if ! docker ps >/dev/null 2>&1; then
    if ! id -nG "$USER" | tr ' ' '\n' | grep -qw docker; then
        sudo usermod -aG docker "$USER"
        warn "User zur docker-Gruppe hinzugefuegt. 'newgrp docker' oder relogin."
    fi
    SUDO="sudo"
    warn "docker braucht aktuell sudo (Gruppenmitgliedschaft greift erst nach Login)."
fi

# ── 3) Letsencrypt-Certs ────────────────────────────────────────────
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
if sudo test -d "$CERT_DIR" && sudo test -f "$CERT_DIR/cert.pem"; then
    ok "Letsencrypt-Certs fuer $DOMAIN gefunden: $CERT_DIR"
else
    warn "Keine Certs unter $CERT_DIR — Container faehrt Plain-HTTP auf :$PORT."
    warn "Fuer HTTPS:  sudo certbot certonly --standalone -d $DOMAIN"
fi

# ── 4) Alten Service stoppen + disablen ─────────────────────────────
if sudo systemctl list-unit-files | grep -q "^${OLD_SVC}"; then
    if sudo systemctl is-active --quiet "$OLD_SVC"; then
        say "Stoppe alten $OLD_SVC..."
        sudo systemctl stop "$OLD_SVC"
        ok "Gestoppt."
    fi
    if sudo systemctl is-enabled --quiet "$OLD_SVC" 2>/dev/null; then
        say "Disable Autostart von $OLD_SVC..."
        sudo systemctl disable "$OLD_SVC"
        ok "Disabled (Unit-File bleibt, kann wieder enabled werden)."
    fi
else
    ok "Kein alter $OLD_SVC vorhanden."
fi

# Port frei?
sleep 1
if sudo ss -tlnp 2>/dev/null | grep -qE ":${PORT}[[:space:]]"; then
    err "Port $PORT noch belegt von:"
    sudo ss -tlnp | grep -E ":${PORT}[[:space:]]"
    exit 1
fi
ok "Port $PORT ist frei."

# ── 5) cookies/-Ordner pruefen ──────────────────────────────────────
mkdir -p cookies
if [ ! -s cookies/youtube.txt ]; then
    warn "cookies/youtube.txt fehlt oder ist leer."
    warn "Manche YouTube-Videos werden Bot-Check werfen bis du sie hochlaedst:"
    warn "  scp dein/cookies.txt ${USER}@$(hostname -I | awk '{print $1}'):${PROJECT}/cookies/youtube.txt"
fi

# ── 6) Container bauen + starten ────────────────────────────────────
say "Baue + starte Container (kann beim ersten Mal 3-5 Minuten dauern)..."
$SUDO docker compose -f docker-compose.vps.yml up -d --build

sleep 5
echo
$SUDO docker compose -f docker-compose.vps.yml ps

# ── 7) Cron fuer Mitternacht-Restart ────────────────────────────────
LOG_FILE="$HOME/glappa-restart.log"
CRON_TAG="# glappa-site daily restart"
CRON_LINE="0 0 * * * cd $PROJECT && ${SUDO:+sudo }docker compose -f docker-compose.vps.yml restart >> $LOG_FILE 2>&1  $CRON_TAG"

( crontab -l 2>/dev/null | grep -v "$CRON_TAG" ; echo "$CRON_LINE" ) | crontab -

sudo systemctl enable --now cron >/dev/null 2>&1 || true
ok "Cron-Eintrag gesetzt (jede Nacht 00:00). Log: $LOG_FILE"
echo "  $(crontab -l | grep glappa-site)"

# ── 8) Verify ───────────────────────────────────────────────────────
echo
say "Schneller Erreichbarkeits-Test..."
sleep 3
if curl -ksI --max-time 5 "https://127.0.0.1:${PORT}/" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
    ok "HTTPS auf :${PORT} antwortet."
elif curl -sI --max-time 5 "http://127.0.0.1:${PORT}/" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
    ok "HTTP auf :${PORT} antwortet (Container ist auf Plain-HTTP — Certs fehlen?)."
else
    warn "Noch keine Antwort auf :${PORT}. Logs anschauen:"
    warn "  $SUDO docker compose -f docker-compose.vps.yml logs -f"
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo -e "  ${G}${B}Deploy fertig.${X}"
echo
echo "  Live URL:        https://${DOMAIN}:${PORT}/"
echo "  24/7 aktiv:      ja (restart: unless-stopped)"
echo "  Tgl. Restart:    00:00 Uhr per cron"
echo
echo "  Befehle:"
echo "    Status:        $SUDO docker compose -f docker-compose.vps.yml ps"
echo "    Logs:          $SUDO docker compose -f docker-compose.vps.yml logs -f"
echo "    Restart:       $SUDO docker compose -f docker-compose.vps.yml restart"
echo "    Stoppen:       $SUDO docker compose -f docker-compose.vps.yml down"
echo "    Update Code:   bash vps-deploy.sh   (laeuft idempotent durch)"
echo
echo "  Wenn alter Service zurueck soll:"
echo "    docker compose down + sudo systemctl enable --now $OLD_SVC"
echo "═══════════════════════════════════════════════════════════"
