#!/usr/bin/env bash
#
# glappa-watchdog.sh — passt auf, dass der Downloader (app.py auf :8080)
# erreichbar BLEIBT, und holt ihn zurueck, wenn nicht.
#
# Laeuft auf dem VPS jede Minute per systemd-Timer (glappa-watchdog.timer),
# eingerichtet von restart.sh (ensure_watchdog). Manuell:
#
#   sudo bash _docker/glappa-watchdog.sh            # ein Durchlauf
#   sudo bash _docker/glappa-watchdog.sh --status   # nur nachsehen, nichts tun
#   sudo bash _docker/glappa-watchdog.sh --log      # Watchdog-Log verfolgen
#
# ── Warum das noetig ist ────────────────────────────────────────────
# `restart: always` in Compose greift nur, wenn der PROZESS stirbt. Der
# Ausfall, den man im Browser als "The connection has timed out" sieht, ist
# aber meist der stille: Container laeuft, Port ist gebunden, nur der
# Python-Server nimmt nichts mehr an. Fuer Docker ist alles in Ordnung.
#
# Drei Schichten haengen deshalb ineinander:
#   1. app.py klopft sich selbst ab und beendet sich bei Stillstand
#      (_selfheal_loop) -> Docker startet neu. Schnellster Weg.
#   2. Docker-HEALTHCHECK (home/healthcheck.py) faerbt den Container rot.
#   3. DIESES Skript prueft von AUSSERHALB des Containers — es merkt auch,
#      was Schicht 1+2 prinzipiell nicht sehen koennen: Container weg,
#      Docker-Daemon weg, Port-Weiterleitung kaputt, Server neu gebootet.
#
# Eskalation (bei aufeinanderfolgenden Fehlversuchen, ~60s Abstand):
#   2x  -> docker restart glappa          (schnell, ~5s Ausfall)
#   4x  -> docker compose up -d --force-recreate glappa  (Container + Ports neu)
#   6x+ -> ganzer Stack 'up -d' + ALARM ins Log (dann stimmt etwas Groesseres)
#
# VOR jedem Eingriff schreibt der Watchdog eine Diagnose ins Log (Container-
# Status, ExitCode, OOMKilled, RestartCount, freier Speicher, letzte
# Container-Logzeilen). Genau die fehlt sonst hinterher, um zu verstehen,
# WARUM der Dienst weg war — ein Neustart wischt die Spuren weg.

set -uo pipefail    # KEIN -e: ein Watchdog darf an keinem Fehler sterben

SELF="$(readlink -f "$0")"
PROJECT="${GLAPPA_PROJECT:-$(dirname "$(dirname "$SELF")")}"
COMPOSE="${GLAPPA_COMPOSE:-$PROJECT/_docker/docker-compose.vps.yml}"
SERVICE="${GLAPPA_SERVICE:-glappa}"
CONTAINER="${GLAPPA_CONTAINER:-glappa}"
PORT="${GLAPPA_PORT:-8080}"

# Lokale Pruefung: geht direkt an den veroeffentlichten Port des Containers.
URL="${GLAPPA_URL:-https://127.0.0.1:$PORT/healthz}"
# Oeffentliche Pruefung: derselbe Weg, den ein Browser nimmt (DNS, Firewall,
# Port-Weiterleitung). Wird erst zur Bewertung herangezogen, NACHDEM sie
# einmal funktioniert hat — auf manchen Netzen kommt ein Server ueber seine
# eigene oeffentliche Adresse nicht zu sich selbst zurueck, und daraus darf
# kein Dauer-Neustart werden.
PUBLIC_URL="${GLAPPA_PUBLIC_URL:-https://home.glappa.de:$PORT/healthz}"

TIMEOUT="${GLAPPA_TIMEOUT:-12}"
MAX_LOG_BYTES="${GLAPPA_MAX_LOG_BYTES:-5242880}"   # 5 MB, dann kuerzen

# Ablage fuer Zaehler + Log. Als root die Systempfade, sonst ins Home —
# so laesst sich das Skript auch mal ohne sudo testen.
if [ -w /var/lib ] 2>/dev/null; then
    STATE_DIR="${GLAPPA_STATE_DIR:-/var/lib/glappa-watchdog}"
    LOG="${GLAPPA_WATCHDOG_LOG:-/var/log/glappa-watchdog.log}"
else
    STATE_DIR="${GLAPPA_STATE_DIR:-$HOME/.glappa-watchdog}"
    LOG="${GLAPPA_WATCHDOG_LOG:-$HOME/glappa-watchdog.log}"
fi
mkdir -p "$STATE_DIR" 2>/dev/null
FAIL_FILE="$STATE_DIR/fails"
PUBFAIL_FILE="$STATE_DIR/public-fails"
PUBSEEN_FILE="$STATE_DIR/public-worked-once"

DOCKER="docker"
if ! docker ps >/dev/null 2>&1; then
    DOCKER="sudo docker"
fi

log() {
    local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$line"
    echo "$line" >> "$LOG" 2>/dev/null
}

# Log nicht ins Unendliche wachsen lassen (der Watchdog schreibt jahrelang).
trim_log() {
    local size
    size=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_LOG_BYTES" ]; then
        tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
        log "Log gekuerzt (war $size Bytes)."
    fi
}

read_count() { cat "$1" 2>/dev/null | tr -dc '0-9' | head -c 4; }

# ── Eine HTTP-Anfrage, egal ob curl oder nur python3 da ist ─────────
# -k / unverified: das Cert lautet auf home.glappa.de, lokal fragen wir
# 127.0.0.1 an. Es geht hier um "antwortet der Dienst", nicht um TLS-Guete.
probe() {
    local url="$1"
    if command -v curl >/dev/null 2>&1; then
        local code
        code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$url" 2>/dev/null)
        [ "$code" = "200" ]
        return $?
    fi
    python3 - "$url" "$TIMEOUT" <<'PY' >/dev/null 2>&1
import ssl, sys, urllib.request
url, t = sys.argv[1], float(sys.argv[2])
ctx = ssl._create_unverified_context()
try:
    with urllib.request.urlopen(url, timeout=t, context=ctx) as r:
        sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
PY
}

container_field() { $DOCKER inspect -f "$1" "$CONTAINER" 2>/dev/null; }

# ── Diagnose: das, was nach einem Neustart unwiederbringlich weg ist ──
diagnose() {
    log "── Diagnose ─────────────────────────────────────────"
    log "Container-Status : $(container_field '{{.State.Status}}')"
    log "  gestartet      : $(container_field '{{.State.StartedAt}}')"
    log "  ExitCode       : $(container_field '{{.State.ExitCode}}')  OOMKilled: $(container_field '{{.State.OOMKilled}}')  Restarts: $(container_field '{{.RestartCount}}')"
    log "  Health         : $(container_field '{{if .State.Health}}{{.State.Health.Status}}{{else}}(kein healthcheck){{end}}')"
    local hc
    hc=$(container_field '{{if .State.Health}}{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{end}}{{end}}' | tail -c 600)
    [ -n "$hc" ] && log "  Healthcheck-Log: $hc"
    log "Speicher         : $(free -m 2>/dev/null | awk '/^Mem:/{print "gesamt "$2"M, benutzt "$3"M, frei "$4"M, verfuegbar "$7"M"}')"
    log "Last/Uptime      : $(uptime 2>/dev/null | sed 's/^ *//')"
    log "Port $PORT        : $(ss -ltnp 2>/dev/null | grep -E "[:.]$PORT([[:space:]]|$)" | head -3 | tr '\n' ' ')"
    # Kernel-OOM-Killer: der haeufigste Grund, warum ein Container ohne
    # eigenes Zutun verschwindet. dmesg braucht root.
    local oom
    oom=$(dmesg -T 2>/dev/null | grep -i 'killed process' | tail -3)
    [ -n "$oom" ] && log "OOM-Killer       : $oom"
    log "── letzte Container-Logzeilen ───────────────────────"
    $DOCKER logs --tail 40 "$CONTAINER" 2>&1 | tail -40 | sed 's/^/    /' | tee -a "$LOG"
    log "─────────────────────────────────────────────────────"
}

# ── Status-Modus: nur nachsehen ─────────────────────────────────────
if [ "${1:-}" = "--status" ]; then
    echo "Projekt   : $PROJECT"
    echo "Compose   : $COMPOSE"
    echo "Log       : $LOG"
    _f=$(read_count "$FAIL_FILE"); echo "Fehler in Folge: ${_f:-0}"
    echo -n "lokal  ($URL): ";        probe "$URL"        && echo "OK" || echo "FEHLER"
    echo -n "oeffentlich ($PUBLIC_URL): "; probe "$PUBLIC_URL" && echo "OK" || echo "FEHLER"
    echo
    $DOCKER ps --filter "name=^${CONTAINER}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    echo "── letzte Watchdog-Meldungen ──"
    tail -n 20 "$LOG" 2>/dev/null || echo "(noch kein Log)"
    exit 0
fi

if [ "${1:-}" = "--log" ]; then
    tail -n 50 -F "$LOG"
    exit 0
fi

trim_log

# ── 1. Ist der Container ueberhaupt da? ─────────────────────────────
# Wenn nicht (geloescht, Deploy abgebrochen, Server frisch gebootet und
# Docker startete ohne ihn), hilft kein 'restart' — dann muss 'up -d' her.
STATUS="$(container_field '{{.State.Status}}')"
if [ -z "$STATUS" ] || [ "$STATUS" != "running" ]; then
    log "Container '$CONTAINER' ist ${STATUS:-nicht vorhanden} — starte Stack per 'up -d'."
    [ -n "$STATUS" ] && diagnose
    ( cd "$PROJECT" && $DOCKER compose -f "$COMPOSE" up -d 2>&1 | tail -5 | while IFS= read -r l; do log "  $l"; done )
    echo 0 > "$FAIL_FILE"
    exit 0
fi

# ── 2. Antwortet der Dienst? ────────────────────────────────────────
FAILS=$(read_count "$FAIL_FILE"); FAILS=${FAILS:-0}

if probe "$URL"; then
    if [ "$FAILS" -gt 0 ]; then
        log "Dienst wieder erreichbar (nach $FAILS Fehlversuch(en))."
    fi
    echo 0 > "$FAIL_FILE"

    # ── 2b. Von aussen auch? ────────────────────────────────────────
    # Lokal gesund, oeffentlich nicht: dann liegt es nicht am Programm,
    # sondern an der Port-Veroeffentlichung (docker-proxy/iptables) —
    # ein force-recreate legt genau die neu an.
    if probe "$PUBLIC_URL"; then
        touch "$PUBSEEN_FILE" 2>/dev/null
        echo 0 > "$PUBFAIL_FILE"
    elif [ -f "$PUBSEEN_FILE" ]; then
        PF=$(read_count "$PUBFAIL_FILE"); PF=${PF:-0}; PF=$((PF + 1))
        echo "$PF" > "$PUBFAIL_FILE"
        log "oeffentlich NICHT erreichbar ($PF/5), lokal aber schon: $PUBLIC_URL"
        if [ "$PF" -ge 5 ]; then
            log "-> Port-Weiterleitung verdaechtig, Container wird neu erzeugt."
            diagnose
            ( cd "$PROJECT" && $DOCKER compose -f "$COMPOSE" up -d --force-recreate "$SERVICE" 2>&1 | tail -5 | while IFS= read -r l; do log "  $l"; done )
            echo 0 > "$PUBFAIL_FILE"
        fi
    fi
    exit 0
fi

# ── 3. Kein Puls -> zaehlen und eskalieren ──────────────────────────
FAILS=$((FAILS + 1))
echo "$FAILS" > "$FAIL_FILE"
log "Dienst antwortet nicht ($FAILS. Versuch): $URL"

case "$FAILS" in
    1)
        # Einmal daneben kann auch der naechtliche Auto-Restart sein
        # (cron 00:00) — noch eine Runde abwarten.
        ;;
    2)
        diagnose
        log "-> docker restart $CONTAINER"
        $DOCKER restart "$CONTAINER" >/dev/null 2>&1 \
            && log "   Neustart abgesetzt." || log "   Neustart FEHLGESCHLAGEN."
        ;;
    3)
        log "-> warte, ob der Neustart greift."
        ;;
    4)
        diagnose
        log "-> Neustart hat nicht gereicht: force-recreate von '$SERVICE'."
        ( cd "$PROJECT" && $DOCKER compose -f "$COMPOSE" up -d --force-recreate "$SERVICE" 2>&1 | tail -8 | while IFS= read -r l; do log "  $l"; done )
        ;;
    5)
        log "-> warte, ob force-recreate greift."
        ;;
    *)
        # Ab hier stimmt etwas Groesseres. Alle 4 Runden (~4 Min) den
        # ganzen Stack anstupsen und laut ins Log schreiben. Absichtlich
        # KEIN 'systemctl restart docker': das wuerde die dauerhafte
        # Shell-VM (glappa-shell-persistent) mit abraeumen.
        if [ $(( (FAILS - 6) % 4 )) -eq 0 ]; then
            log "ALARM: seit $FAILS Versuchen (~$FAILS Min) tot. Stack wird angestossen."
            diagnose
            ( cd "$PROJECT" && $DOCKER compose -f "$COMPOSE" up -d 2>&1 | tail -8 | while IFS= read -r l; do log "  $l"; done )
        fi
        ;;
esac

exit 0
