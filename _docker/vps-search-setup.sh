#!/usr/bin/env bash
#
# vps-search-setup.sh — Setup für search.glappa.de auf dem VPS.
#
# Macht idempotent:
#   1) Pre-flight (Docker, docker-compose, alle Files da)
#   2) Firewall: UFW-Regeln fuer 80/443 (und 8080 fuer home.glappa.de)
#   3) Port-Konflikt-Check (was haengt auf 80/443?)
#   4) SearXNG secret_key generieren wenn noch der Placeholder drin ist
#   5) Container pullen + starten (searxng + caddy)
#   6) Warten bis Letsencrypt-Cert geholt ist
#   7) Verify (docker ps + curl auf https://search.glappa.de)
#   8) Cron-Eintrag fuer Mitternacht-Restart (analog zur glappa-app)
#
# Aufruf:
#   bash vps-search-setup.sh           # full setup
#   bash vps-search-setup.sh --status  # nur Status anzeigen
#   bash vps-search-setup.sh --logs    # docker logs streamen
#
# Voraussetzung: Du hast vorher per scp / sync-restart-vps.ps1
# alle Files nach ~/glappa-site/ gepusht.

set -euo pipefail

PROJECT="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
SEARCH_DOMAIN="search.glappa.de"
APP_DOMAIN="home.glappa.de"
APP_PORT=8080
COMPOSE_FILE="docker-compose.vps.yml"

# ── Farben ──────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }
hr()   { echo "───────────────────────────────────────────────────────────"; }

cd "$PROJECT"

# ── Mode-Switch ─────────────────────────────────────────────────────
MODE="${1:-setup}"

# Sudo nur wenn docker nicht ohne läuft
SUDO=""
if command -v docker >/dev/null 2>&1 && ! docker ps >/dev/null 2>&1; then
    SUDO="sudo"
fi

if [ "$MODE" = "--status" ] || [ "$MODE" = "status" ]; then
    $SUDO docker compose -f "$COMPOSE_FILE" ps
    echo
    say "Letzte 5 Caddy-Log-Zeilen:"
    $SUDO docker compose -f "$COMPOSE_FILE" logs --tail 5 caddy 2>/dev/null || true
    echo
    say "Letzte 5 SearXNG-Log-Zeilen:"
    $SUDO docker compose -f "$COMPOSE_FILE" logs --tail 5 searxng 2>/dev/null || true
    exit 0
fi

if [ "$MODE" = "--logs" ] || [ "$MODE" = "logs" ]; then
    $SUDO docker compose -f "$COMPOSE_FILE" logs -f caddy searxng
    exit 0
fi

# ── Setup ───────────────────────────────────────────────────────────
echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "${B}  Glappa Search — VPS-Setup${X}"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo "  Projekt:        $PROJECT"
echo "  Such-Domain:    https://$SEARCH_DOMAIN"
echo "  App-Domain:     https://$APP_DOMAIN:$APP_PORT  (bleibt unangetastet)"
echo "  Host:           $(hostname) ($(uname -srm))"
echo
hr

# ── 1) Pre-flight ───────────────────────────────────────────────────
say "1) Pre-flight Checks"

for f in "$COMPOSE_FILE" "caddy/Caddyfile" "searxng/settings.yml"; do
    if [ ! -f "$f" ]; then
        err "FEHLT: $PROJECT/$f"
        err "Erst Files vom Laptop pushen:  .\\sync-restart-vps.ps1"
        exit 1
    fi
done
ok "Alle Config-Files vorhanden."

if ! command -v docker >/dev/null 2>&1; then
    err "Docker fehlt. Installation:"
    err "  sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2"
    err "  sudo systemctl enable --now docker"
    err "  sudo usermod -aG docker \$USER  &&  newgrp docker"
    exit 1
fi
ok "Docker: $(docker --version | head -1)"

if ! docker compose version >/dev/null 2>&1; then
    err "docker compose v2 fehlt. Installation:"
    err "  sudo apt-get install -y docker-compose-v2 || sudo apt-get install -y docker-compose-plugin"
    exit 1
fi
ok "Compose: $(docker compose version | head -1)"

# DNS-Lookup für search.glappa.de
if command -v dig >/dev/null 2>&1; then
    RESOLVED="$(dig +short "$SEARCH_DOMAIN" | tail -1)"
    if [ -z "$RESOLVED" ]; then
        warn "$SEARCH_DOMAIN loest noch keine IP auf — DNS-A-Record gesetzt?"
        warn "Caddy wird kein Letsencrypt-Cert holen koennen bis das funktioniert."
    else
        SELF_IP="$(curl -s --max-time 3 https://api.ipify.org || echo unknown)"
        ok "$SEARCH_DOMAIN → $RESOLVED  (VPS:  $SELF_IP)"
        if [ "$SELF_IP" != "unknown" ] && [ "$RESOLVED" != "$SELF_IP" ]; then
            warn "DNS zeigt nicht auf diesen VPS! Caddy wird scheitern beim ACME-Challenge."
        fi
    fi
fi

echo
hr

# ── 2) Firewall (UFW) ───────────────────────────────────────────────
say "2) Firewall-Regeln"

if command -v ufw >/dev/null 2>&1; then
    UFW_STATUS="$(sudo ufw status | head -1)"
    if echo "$UFW_STATUS" | grep -q "inactive"; then
        warn "UFW ist inaktiv — Regeln werden gesetzt aber nicht erzwungen."
        warn "Aktivieren:  sudo ufw enable  (Vorsicht: vorher SSH-Port 22 freigeben!)"
    fi

    # SSH NICHT vergessen (sonst sperrst du dich aus)
    sudo ufw allow 22/tcp comment 'SSH' >/dev/null 2>&1 || true

    sudo ufw allow 80/tcp                 comment 'Caddy HTTP / ACME-Challenge' >/dev/null 2>&1 || true
    sudo ufw allow 443/tcp                comment 'Caddy HTTPS'                 >/dev/null 2>&1 || true
    sudo ufw allow 443/udp                comment 'Caddy HTTP/3'                >/dev/null 2>&1 || true
    sudo ufw allow "${APP_PORT}/tcp"      comment 'home.glappa.de app'          >/dev/null 2>&1 || true
    ok "UFW-Regeln gesetzt: 22, 80, 443 (tcp+udp), $APP_PORT"

    echo
    sudo ufw status numbered | grep -E "(22|80|443|$APP_PORT)" || true
else
    warn "ufw nicht installiert. Falls iptables/nftables benutzt wird — manuell pruefen:"
    warn "  Inbound TCP 80, 443, $APP_PORT muessen erreichbar sein."
    warn "  Inbound UDP 443 fuer HTTP/3 ist nice-to-have."
fi

echo
hr

# ── 3) Port-Konflikte ───────────────────────────────────────────────
say "3) Port-Konflikt-Check"

check_port() {
    local port="$1"
    local label="$2"
    local owner
    owner="$(sudo ss -tlnp 2>/dev/null | awk -v p=":$port " '$4 ~ p {print $0; exit}')"
    if [ -n "$owner" ]; then
        # Filtere docker-proxy — das ist OK wenn unser Container schon laeuft
        if echo "$owner" | grep -q docker-proxy; then
            ok "Port $port ($label): docker-proxy (vermutlich unser Container — OK)"
        else
            err "Port $port ($label) belegt von:"
            echo "  $owner"
            return 1
        fi
    else
        ok "Port $port ($label): frei"
    fi
    return 0
}

CONFLICT=0
check_port 80  "HTTP / ACME"   || CONFLICT=1
check_port 443 "HTTPS"         || CONFLICT=1

if [ "$CONFLICT" -ne 0 ]; then
    err "Port-Konflikt — bitte erst stoppen, was Port 80/443 belegt."
    err "Beispiele:  sudo systemctl stop nginx   /   sudo systemctl stop apache2"
    err "Wenn certbot --standalone die home.glappa.de-Certs erneuert: auf --webroot umstellen."
    exit 1
fi

echo
hr

# ── 4) SearXNG Secret ──────────────────────────────────────────────
say "4) SearXNG secret_key"

SETTINGS="searxng/settings.yml"
if grep -q "REPLACE_ME_OPENSSL_RAND_HEX_32" "$SETTINGS"; then
    SECRET="$(openssl rand -hex 32)"
    sed -i "s|REPLACE_ME_OPENSSL_RAND_HEX_32|${SECRET}|" "$SETTINGS"
    ok "Frischer secret_key generiert + in $SETTINGS eingesetzt."
else
    ok "secret_key war schon gesetzt — nicht angefasst."
fi

# Sicherheit: world-readable wäre schlecht
chmod 600 "$SETTINGS" 2>/dev/null || true

echo
hr

# ── 5) Container starten ────────────────────────────────────────────
say "5) searxng + caddy starten"

$SUDO docker compose -f "$COMPOSE_FILE" pull searxng caddy
$SUDO docker compose -f "$COMPOSE_FILE" up -d searxng caddy

sleep 3
$SUDO docker compose -f "$COMPOSE_FILE" ps searxng caddy

echo
hr

# ── 6) Warten auf Letsencrypt ───────────────────────────────────────
say "6) Warte auf Letsencrypt-Cert (max 60s)"

for i in $(seq 1 12); do
    if $SUDO docker compose -f "$COMPOSE_FILE" logs caddy 2>/dev/null | grep -q "certificate obtained"; then
        ok "Caddy hat Letsencrypt-Cert geholt."
        break
    fi
    sleep 5
    echo -n "."
done
echo

# ── 7) Verify ───────────────────────────────────────────────────────
say "7) Erreichbarkeits-Test"

if curl -fsS --max-time 8 "https://${SEARCH_DOMAIN}/" -o /dev/null; then
    ok "https://${SEARCH_DOMAIN}/  antwortet ✓"
else
    warn "https://${SEARCH_DOMAIN}/  noch nicht erreichbar."
    warn "Logs anschauen:  bash vps-search-setup.sh --logs"
fi

# Plus: dass home.glappa.de noch da ist
if curl -ksS --max-time 5 "https://127.0.0.1:${APP_PORT}/" -o /dev/null; then
    ok "https://${APP_DOMAIN}:${APP_PORT}/  noch immer up ✓"
else
    warn "https://${APP_DOMAIN}:${APP_PORT}/  antwortet nicht — Container down?"
fi

echo
hr

# ── 8) Cron fuer Mitternacht-Restart ────────────────────────────────
say "8) Cron-Eintrag fuer naechtlichen Restart"

LOG_FILE="$HOME/glappa-search-restart.log"
CRON_TAG="# glappa-search daily restart"
CRON_LINE="5 0 * * * cd $PROJECT && ${SUDO:+sudo }docker compose -f $COMPOSE_FILE restart searxng caddy >> $LOG_FILE 2>&1  $CRON_TAG"

( crontab -l 2>/dev/null | grep -v "$CRON_TAG" ; echo "$CRON_LINE" ) | crontab -
ok "Cron gesetzt (00:05 Uhr). Log: $LOG_FILE"

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "  ${G}${B}Setup fertig.${X}"
echo
echo "  URLs:"
echo "    SearXNG-UI:    https://${SEARCH_DOMAIN}/"
echo "    Glappa-Form:   https://glappa.de/home/search.html"
echo "    YT-App:        https://${APP_DOMAIN}:${APP_PORT}/"
echo
echo "  Befehle:"
echo "    Status:        bash vps-search-setup.sh --status"
echo "    Logs:          bash vps-search-setup.sh --logs"
echo "    Caddy reload:  $SUDO docker compose -f $COMPOSE_FILE exec caddy caddy reload --config /etc/caddy/Caddyfile"
echo "    SearXNG up:    $SUDO docker compose -f $COMPOSE_FILE pull searxng && $SUDO docker compose -f $COMPOSE_FILE up -d searxng"
echo "    Stop all:      $SUDO docker compose -f $COMPOSE_FILE down"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
