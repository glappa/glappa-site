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

# ── Alles stoppen: Compose-Stack + ALLES auf Port 8080 ─────────────
# Sorgt fuer einen wirklich sauberen Neustart (kein Namens-/Port-
# Konflikt) und faehrt ALLE Container des Stacks runter — inkl. searxng.
echo -e "${C}→${X} stoppe & entferne Compose-Stack (glappa, searxng, …)..."
$SUDO docker compose -f "$COMPOSE" down --remove-orphans || true

echo -e "${C}→${X} raeume Port 8080 frei (Container + Host-Prozesse)..."
# 1) (fremde) Container, die den Host-Port 8080 veroeffentlichen, weg
PORT_CTRS=$($SUDO docker ps -aq --filter "publish=8080" 2>/dev/null || true)
if [ -n "$PORT_CTRS" ]; then
    echo -e "   ${Y}•${X} stoppe/entferne Container auf :8080 → $(echo "$PORT_CTRS" | tr '\n' ' ')"
    $SUDO docker rm -f $PORT_CTRS >/dev/null 2>&1 || true
fi
# 2) Host-Prozesse, die noch auf :8080 lauschen, beenden (fuser, sonst ss)
if command -v fuser >/dev/null 2>&1; then
    $SUDO fuser -k 8080/tcp >/dev/null 2>&1 || true
elif command -v ss >/dev/null 2>&1; then
    PIDS=$($SUDO ss -ltnp 2>/dev/null | awk '$4 ~ /:8080$/' \
             | grep -oP 'pid=\K[0-9]+' | sort -u || true)
    if [ -n "$PIDS" ]; then
        echo -e "   ${Y}•${X} beende Host-Prozesse auf :8080 → $(echo "$PIDS" | tr '\n' ' ')"
        for p in $PIDS; do $SUDO kill    "$p" 2>/dev/null || true; done
        sleep 1
        for p in $PIDS; do $SUDO kill -9 "$p" 2>/dev/null || true; done
    fi
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
