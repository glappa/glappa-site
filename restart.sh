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
#   bash restart.sh --pull     (vorher 'git pull' — neuesten Code holen)

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

# ── Farben + Helpers ────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}•${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

# ── Args / Auto-detect ──────────────────────────────────────────────
COMPOSE=""
BUILD="--build"
PULL=0
for arg in "$@"; do
    case "$arg" in
        --local)    COMPOSE="docker-compose.yml" ;;
        --vps)      COMPOSE="docker-compose.vps.yml" ;;
        --no-build) BUILD="" ;;
        --pull)     PULL=1 ;;
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
# SUDO       → fuer docker (nur wenn der User docker nicht ohne sudo darf)
# HOST_SUDO  → fuer Host-Operationen (systemctl, fuser, kill, ss).
#              Unabhaengig von SUDO: docker laeuft oft passwortlos (docker-
#              Gruppe), aber der Prozess der :8080 haelt gehoert evtl. root.
#              Genau das war der Bug — fuser ohne sudo killt root-Prozesse
#              nicht, der Port bleibt belegt und 'up' scheitert.
SUDO=""
if ! docker ps >/dev/null 2>&1; then
    SUDO="sudo"
fi
HOST_SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    HOST_SUDO="sudo"
fi

# ── Host-Ports aus der Compose-Datei lesen ("8080:8080" → 8080) ─────
mapfile -t HOST_PORTS < <(grep -oE '"[0-9]+:[0-9]+"' "$COMPOSE" 2>/dev/null \
                            | tr -d '"' | cut -d: -f1 | sort -un)
[ "${#HOST_PORTS[@]}" -eq 0 ] && HOST_PORTS=(8080)

echo
echo -e "${B}=== Glappa Restart ===${X}"
echo "Location:   ${LOC:-auto}"
echo "Compose:    $COMPOSE"
echo "Build:      ${BUILD:-(nein, nur restart)}"
echo "Ports:      ${HOST_PORTS[*]}"
echo

# ── Optional: Code aktualisieren ────────────────────────────────────
if [ "$PULL" = "1" ]; then
    say "git pull..."
    git pull --ff-only || warn "git pull fehlgeschlagen — fahre mit lokalem Stand fort."
fi

# ── Hilfsfunktionen: Port-Freigabe ──────────────────────────────────

# Prueft ob ein TCP-Port gerade belauscht wird.
port_in_use() {
    local p="$1"
    if command -v ss >/dev/null 2>&1; then
        $HOST_SUDO ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"
    elif command -v fuser >/dev/null 2>&1; then
        $HOST_SUDO fuser "${p}/tcp" >/dev/null 2>&1
    else
        return 1   # kein Tool da → optimistisch annehmen, dass frei ist
    fi
}

# Stoppt + disabled den alten youtube-downloader.service (den Vorgaenger,
# den der Container ersetzt). Solange der laeuft — und mit Restart=always
# nach einem Kill sofort neu startet — bleibt :8080 belegt.
stop_old_service() {
    local svc="youtube-downloader.service"
    command -v systemctl >/dev/null 2>&1 || return 0
    if $HOST_SUDO systemctl list-unit-files 2>/dev/null | grep -q "^${svc}"; then
        if $HOST_SUDO systemctl is-active --quiet "$svc" 2>/dev/null; then
            warn "stoppe + disable alten $svc (belegt :8080, startet sonst neu)..."
            $HOST_SUDO systemctl disable --now "$svc" >/dev/null 2>&1 || true
        fi
    fi
}

# Raeumt jeden konfigurierten Host-Port frei: erst Container die ihn
# veroeffentlichen, dann lauschende Host-Prozesse (mit sudo!).
free_ports() {
    # Einen evtl. uebrig gebliebenen Container 'glappa' wegraeumen
    $SUDO docker rm -f glappa >/dev/null 2>&1 || true

    local p ctrs pids pid
    for p in "${HOST_PORTS[@]}"; do
        # 1) (fremde) Container, die diesen Host-Port veroeffentlichen
        ctrs=$($SUDO docker ps -aq --filter "publish=$p" 2>/dev/null || true)
        if [ -n "$ctrs" ]; then
            warn "entferne Container auf :$p → $(echo "$ctrs" | tr '\n' ' ')"
            $SUDO docker rm -f $ctrs >/dev/null 2>&1 || true
        fi
        # 2) Host-Prozesse, die noch auf dem Port lauschen, beenden
        if command -v fuser >/dev/null 2>&1; then
            $HOST_SUDO fuser -k "${p}/tcp" >/dev/null 2>&1 || true
        elif command -v ss >/dev/null 2>&1; then
            pids=$($HOST_SUDO ss -ltnp 2>/dev/null \
                     | awk -v port=":$p" '$4 ~ port"$"' \
                     | grep -oP 'pid=\K[0-9]+' | sort -u || true)
            if [ -n "$pids" ]; then
                warn "beende Host-Prozesse auf :$p → $(echo "$pids" | tr '\n' ' ')"
                for pid in $pids; do $HOST_SUDO kill    "$pid" 2>/dev/null || true; done
                sleep 1
                for pid in $pids; do $HOST_SUDO kill -9 "$pid" 2>/dev/null || true; done
            fi
        fi
    done
}

# ── Alles stoppen: Compose-Stack runter ─────────────────────────────
say "stoppe & entferne Compose-Stack (glappa, searxng, …)..."
$SUDO docker compose -f "$COMPOSE" down --remove-orphans || true

# ── Build ZUERST (langsam), dann Port freiraeumen ───────────────────
# Reihenfolge ist wichtig: Wuerden wir vor dem Build freiraeumen, koennte
# waehrend der ~Sekunden Buildzeit der alte Service den Port wieder
# greifen. Also: bauen → unmittelbar davor freiraeumen → starten.
if [ -n "$BUILD" ]; then
    say "rebuild image..."
    $SUDO docker compose -f "$COMPOSE" build
fi

say "raeume Ports frei (${HOST_PORTS[*]})..."
stop_old_service
free_ports

# Verifizieren — und bis zu 3x nachlegen falls noch belegt.
busy=()
for attempt in 1 2 3; do
    busy=()
    for p in "${HOST_PORTS[@]}"; do
        port_in_use "$p" && busy+=("$p")
    done
    [ "${#busy[@]}" -eq 0 ] && break
    warn "noch belegt: ${busy[*]} — versuche erneut ($attempt/3)..."
    stop_old_service
    free_ports
    sleep 1
done

if [ "${#busy[@]}" -ne 0 ]; then
    err "Port(s) ${busy[*]} weiterhin belegt. Wer haelt sie:"
    for p in "${busy[@]}"; do
        $HOST_SUDO ss -ltnp 2>/dev/null | grep -E "[:.]${p}([[:space:]]|\$)" || true
    done
    err "Bitte den Prozess manuell beenden und restart.sh erneut starten."
    exit 1
fi
ok "Ports frei."

# ── Start ───────────────────────────────────────────────────────────
say "start..."
$SUDO docker compose -f "$COMPOSE" up -d --remove-orphans

# ── Health warten ───────────────────────────────────────────────────
echo
say "warte auf Healthcheck..."
STATUS="starting"
for i in $(seq 1 20); do
    STATUS=$($SUDO docker inspect --format '{{.State.Health.Status}}' glappa 2>/dev/null || echo "starting")
    [ "$STATUS" = "healthy" ] && break
    [ "$STATUS" = "unhealthy" ] && { err "unhealthy"; break; }
    sleep 2
done
ok "Status: $STATUS"

echo
$SUDO docker compose -f "$COMPOSE" ps

# ── Logs (live, Ctrl+C zum verlassen) ───────────────────────────────
echo
echo -e "${B}── Live-Logs (Ctrl+C zum beenden) ──${X}"
echo
exec $SUDO docker compose -f "$COMPOSE" logs -f --tail 30
