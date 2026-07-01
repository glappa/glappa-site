#!/usr/bin/env bash
#
# run-search-local.sh — Glappa-Suche (SearXNG + 90er-Style) LOKAL testen.
#
# Fuer jede Maschine mit Docker — nicht der VPS, keine Domain, kein TLS
# noetig. Startet SearXNG + einen kleinen nginx-Proxy, der dieselbe
# Style-Injection macht wie Apache/mod_substitute auf search.glappa.de
# (siehe apache/search.glappa.de.conf), sodass die lokale Version optisch
# identisch aussieht.
#
# Voraussetzung: Docker + docker compose (v2) installiert und der Docker-
# Daemon laeuft.
#
# Aufruf (aus _docker/):
#   bash run-search-local.sh            # hochfahren
#   bash run-search-local.sh --stop     # runterfahren
#   bash run-search-local.sh --logs     # Logs streamen (Ctrl-C zum Beenden)
#   bash run-search-local.sh --status   # Container-Status

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

COMPOSE_FILE="docker-compose.search-local.yml"
SETTINGS="searxng-local/settings.yml"
URL="http://localhost:8890/"

G='\033[1;32m'; C='\033[1;36m'; Y='\033[1;33m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }

MODE="${1:-up}"

case "$MODE" in
    --stop|stop)
        docker compose -f "$COMPOSE_FILE" down
        exit 0
        ;;
    --logs|logs)
        docker compose -f "$COMPOSE_FILE" logs -f
        exit 0
        ;;
    --status|status)
        docker compose -f "$COMPOSE_FILE" ps
        exit 0
        ;;
esac

command -v docker >/dev/null 2>&1 || { echo "Docker fehlt — https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose (v2) fehlt."; exit 1; }

# ── secret_key nur beim allerersten Start generieren ───────────────────
if grep -q "REPLACE_ME_OPENSSL_RAND_HEX_32" "$SETTINGS" 2>/dev/null; then
    say "Generiere lokalen secret_key (einmalig, nur fuer diese Instanz)…"
    SECRET="$(openssl rand -hex 32)"
    sed -i "s|REPLACE_ME_OPENSSL_RAND_HEX_32|${SECRET}|" "$SETTINGS"
    ok "secret_key gesetzt."
fi

say "Starte SearXNG + Glappa-Style-Proxy lokal…"
docker compose -f "$COMPOSE_FILE" up -d

say "Warte auf Startup…"
for _ in $(seq 1 15); do
    if curl -fsS --max-time 2 "$URL" -o /dev/null 2>/dev/null; then
        echo
        echo -e "${B}════════════════════════════════════════════════${X}"
        ok "Läuft: $URL"
        echo -e "${B}════════════════════════════════════════════════${X}"
        echo "  Stoppen:  bash run-search-local.sh --stop"
        echo "  Logs:     bash run-search-local.sh --logs"
        exit 0
    fi
    sleep 2
done

warn "Nach 30s noch nicht erreichbar unter $URL — Logs pruefen:"
warn "  bash run-search-local.sh --logs"
exit 1
