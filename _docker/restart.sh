#!/usr/bin/env bash
#
# restart.sh — Container nach Code-Aenderung neu bauen + starten + Logs zeigen.
#
# Erkennt selbst ob du auf WSL/lokal oder auf VPS bist und nimmt
# entsprechend docker-compose.yml bzw. docker-compose.vps.yml.
#
# Aufruf:
#   bash restart.sh           (auto-detect)
#   bash restart.sh --local   (forciere docker-compose.yml)
#   bash restart.sh --vps     (forciere docker-compose.vps.yml)
#   bash restart.sh --no-build (nur restart, kein rebuild — schneller)

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

# ── Farben ──────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'

# ── Args / Auto-detect ──────────────────────────────────────────────
COMPOSE=""
BUILD="--build"
for arg in "$@"; do
    case "$arg" in
        --local)    COMPOSE="docker-compose.yml" ;;
        --vps)      COMPOSE="docker-compose.vps.yml" ;;
        --no-build) BUILD="" ;;
        *)          echo "Unbekanntes Flag: $arg" >&2; exit 1 ;;
    esac
done

if [ -z "$COMPOSE" ]; then
    if grep -qi microsoft /proc/version 2>/dev/null && [ -f docker-compose.yml ]; then
        COMPOSE="docker-compose.yml"
        LOC="WSL/lokal"
    elif [ -f docker-compose.vps.yml ]; then
        COMPOSE="docker-compose.vps.yml"
        LOC="VPS"
    else
        COMPOSE="docker-compose.yml"
        LOC="(default)"
    fi
fi

# ── Sudo-Check ──────────────────────────────────────────────────────
SUDO=""
if ! docker ps >/dev/null 2>&1; then
    SUDO="sudo"
fi

echo
echo -e "${B}=== Glappa Restart ===${X}"
echo "Location:   ${LOC:-auto}"
echo "Compose:    $COMPOSE"
echo "Build:      ${BUILD:-(nein, nur restart)}"
echo

# ── Stop alten Container falls einer laeuft ─────────────────────────
if $SUDO docker ps --format '{{.Names}}' | grep -q '^glappa$'; then
    echo -e "${C}→${X} alter Container laeuft, hole ihn weg..."
fi

# ── Build + Start ───────────────────────────────────────────────────
echo -e "${C}→${X} ${BUILD:+rebuild + }start..."
$SUDO docker compose -f "$COMPOSE" up -d $BUILD

# ── Health warten ───────────────────────────────────────────────────
echo
echo -e "${C}→${X} warte auf Healthcheck..."
for i in $(seq 1 20); do
    STATUS=$($SUDO docker inspect --format '{{.State.Health.Status}}' glappa 2>/dev/null || echo "starting")
    [ "$STATUS" = "healthy" ] && break
    [ "$STATUS" = "unhealthy" ] && { echo -e "${R}✗${X} unhealthy"; break; }
    sleep 2
done
echo -e "${G}✓${X} Status: $STATUS"

echo
$SUDO docker compose -f "$COMPOSE" ps

# ── Logs (live, Ctrl+C zum verlassen) ───────────────────────────────
echo
echo -e "${B}── Live-Logs (Ctrl+C zum beenden) ──${X}"
echo
exec $SUDO docker compose -f "$COMPOSE" logs -f --tail 30
