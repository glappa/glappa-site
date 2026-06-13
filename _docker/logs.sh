#!/usr/bin/env bash
#
# logs.sh — Live-Logs vom Glappa-Container.
#
# Aufruf:
#   bash logs.sh                # auto-detect compose-file, tail 50, follow
#   bash logs.sh --local        # forciere docker-compose.yml
#   bash logs.sh --vps          # forciere docker-compose.vps.yml
#   bash logs.sh --errors       # nur ERROR/Traceback/Bot-Check Zeilen
#   bash logs.sh --tail 200     # mehr Backlog
#   bash logs.sh --since 1h     # letzte Stunde

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

COMPOSE=""
TAIL=50
SINCE=""
ERRORS=0

while [ $# -gt 0 ]; do
    case "$1" in
        --local)   COMPOSE="docker-compose.yml"; shift ;;
        --vps)     COMPOSE="docker-compose.vps.yml"; shift ;;
        --errors)  ERRORS=1; shift ;;
        --tail)    TAIL="$2"; shift 2 ;;
        --since)   SINCE="$2"; shift 2 ;;
        *)         echo "Unbekannt: $1" >&2; exit 1 ;;
    esac
done

# Auto-detect Compose-file
if [ -z "$COMPOSE" ]; then
    if grep -qi microsoft /proc/version 2>/dev/null && [ -f docker-compose.yml ]; then
        COMPOSE="docker-compose.yml"
    elif [ -f docker-compose.vps.yml ]; then
        COMPOSE="docker-compose.vps.yml"
    else
        COMPOSE="docker-compose.yml"
    fi
fi

SUDO=""
docker ps >/dev/null 2>&1 || SUDO="sudo"

# Container existiert?
if ! $SUDO docker ps --format '{{.Names}}' | grep -q '^glappa$'; then
    echo "✗ Container 'glappa' laeuft nicht." >&2
    echo "  Status:  $SUDO docker compose -f $COMPOSE ps" >&2
    exit 1
fi

CMD=( $SUDO docker compose -f "$COMPOSE" logs -f --tail "$TAIL" )
[ -n "$SINCE" ] && CMD+=( --since "$SINCE" )

echo "── Live-Logs (Ctrl+C zum beenden) — compose: $COMPOSE ──"
echo

if [ "$ERRORS" = "1" ]; then
    exec "${CMD[@]}" 2>&1 | grep --line-buffered -iE 'error|traceback|exception|bot-check|sign in|fail|warn'
else
    exec "${CMD[@]}"
fi
