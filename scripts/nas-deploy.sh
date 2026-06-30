#!/usr/bin/env bash
#
# nas-deploy.sh — auf der UGREEN NAS per SSH ausfuehren
#
# Einmalige Einrichtung:
#   1. Per SSH auf die NAS verbinden:
#        ssh root@<NAS-IP>
#   2. Repo klonen (einmalig):
#        cd /mnt/user/appdata && git clone https://github.com/glappa/glappa-site.git
#   3. In den Ordner wechseln und Skript starten:
#        cd glappa-site && bash scripts/nas-deploy.sh
#
# Update (nach Code-Aenderungen):
#        cd /mnt/user/appdata/glappa-site && git pull && bash scripts/nas-deploy.sh

set -euo pipefail

# ── Pfade ────────────────────────────────────────────────────────────
# UGREEN NAS: Daten liegen auf /volume1 oder /volume2
# Passe DATA_DIR an falls dein Volume anders heisst.
DATA_DIR="/volume1/glappa-site-data"
COOKIES_DIR="$DATA_DIR/cookies"
DOWNLOADS_DIR="$DATA_DIR/downloads"
# Liegt in scripts/ — eine Ebene hoch ins Projekt-Root (Dockerfile, app.py ...)
PROJECT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"

PORT_WEB=8099    # Webseite  → http://<NAS-IP>:8099
PORT_API=8090    # Downloader→ http://<NAS-IP>:8090

# ── Farben ───────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

echo
echo -e "${B}=== Glappa NAS-Deploy ===${X}"
echo "Projekt: $PROJECT"
echo "Daten:   $DATA_DIR"
echo "Ports:   Web=$PORT_WEB  API=$PORT_API"
echo

cd "$PROJECT"

# ── 1) Docker pruefen ────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    err "Docker nicht gefunden."
    err "Bitte Docker ueber das UGREEN App Center installieren."
    exit 1
fi
ok "Docker: $(docker --version)"

if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose Plugin fehlt."
    err "Bitte Docker ueber das UGREEN App Center aktualisieren."
    exit 1
fi
ok "Compose: $(docker compose version | head -1)"

# ── 2) Daten-Ordner anlegen ──────────────────────────────────────────
say "Lege Daten-Ordner an..."
mkdir -p "$COOKIES_DIR" "$DOWNLOADS_DIR"
ok "Ordner bereit: $DATA_DIR"

if [ ! -s "$COOKIES_DIR/youtube.txt" ]; then
    warn "cookies/youtube.txt fehlt — YouTube-Downloads laufen ohne Cookies."
    warn "Optional: Netscape-Format-Cookie-Datei hierhin kopieren:"
    warn "  scp youtube.txt root@<NAS-IP>:$COOKIES_DIR/youtube.txt"
fi

# ── 3) Compose-Datei fuer NAS schreiben ─────────────────────────────
say "Schreibe docker-compose.run.yml..."
cat > "$PROJECT/docker-compose.run.yml" <<COMPOSE
services:
  glappa:
    build: .
    image: glappa:latest
    container_name: glappa
    ports:
      - "${PORT_WEB}:80"
      - "${PORT_API}:8090"
    environment:
      - YT_COOKIE_FILE=/cookies/youtube.txt
    volumes:
      - ${DOWNLOADS_DIR}:/downloads
      - ${COOKIES_DIR}:/cookies
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1/', timeout=3).status==200 else 1)"]
      interval: 30s
      timeout: 5s
      retries: 3
COMPOSE
ok "docker-compose.run.yml geschrieben."

# ── 4) Container bauen + starten ─────────────────────────────────────
say "Baue Image und starte Container (erster Build: ~5 Minuten)..."
docker compose -f docker-compose.run.yml up -d --build

sleep 4
echo
docker compose -f docker-compose.run.yml ps

# ── 5) Erreichbarkeitstest ───────────────────────────────────────────
echo
say "Teste Erreichbarkeit..."
sleep 3
if curl -s --max-time 5 "http://127.0.0.1:${PORT_WEB}/" | grep -qi "glappa\|html" 2>/dev/null; then
    ok "Webseite antwortet auf Port ${PORT_WEB}."
else
    warn "Noch keine Antwort — Container startet noch oder Fehler:"
    warn "  docker compose -f $PROJECT/docker-compose.run.yml logs -f"
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo -e "  ${G}${B}Deploy fertig.${X}"
echo
NAS_IP=$(hostname -I | awk '{print $1}')
echo "  Webseite:    http://${NAS_IP}:${PORT_WEB}/"
echo "  Downloader:  http://${NAS_IP}:${PORT_API}/"
echo "  Daten:       $DATA_DIR"
echo
echo "  Befehle:"
echo "    Logs:      docker compose -f $PROJECT/docker-compose.run.yml logs -f"
echo "    Neustart:  docker compose -f $PROJECT/docker-compose.run.yml restart"
echo "    Stoppen:   docker compose -f $PROJECT/docker-compose.run.yml down"
echo "    Update:    git pull && bash scripts/nas-deploy.sh"
echo "═══════════════════════════════════════════════════════════"
