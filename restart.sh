#!/usr/bin/env bash
#
# restart.sh — Container nach Code-Aenderung neu bauen + starten + Logs zeigen.
#
# Erkennt selbst ob du auf WSL/lokal oder auf VPS bist und nimmt
# entsprechend docker-compose.yml bzw. _docker/docker-compose.vps.yml.
#
# Aufruf:
#   bash restart.sh           (auto-detect)
#   bash restart.sh --local   (forciere docker-compose.yml)
#   bash restart.sh --vps     (forciere _docker/docker-compose.vps.yml)
#   bash restart.sh --no-build (nur restart, kein rebuild — schneller)
#   bash restart.sh --pull     (vorher 'git pull' — neuesten Code holen)
#   bash restart.sh --no-cron  (den taeglichen Auto-Restart-Cron nicht setzen)
#   bash restart.sh -logs      (NICHTS neu starten — nur die Live-Logs
#                               ALLER laufenden Container zeigen)
#   bash restart.sh --log-link (NICHTS neu starten — Klick-Log des
#                               Link-Kuerzers live verfolgen: wer hat wann
#                               welchen /s/-Link gedrueckt. Webansicht mit
#                               denselben Daten: https://home.glappa.de/s/stats)
#
# Nach jedem Restart (und im -logs-Modus) folgt das Skript den Logs *aller*
# laufenden Container — nicht nur dem eigenen Compose-Stack. So sieht man auch
# Nachbar-Container (z. B. searxng), die in keiner docker-compose.yml stehen.
#
# Auf dem VPS richtet das Skript ausserdem einen cron ein, der den Container
# jede Nacht um 00:00 neu startet (idempotent — legt nichts doppelt an).

set -euo pipefail
SELF="$(readlink -f "$0")"
cd "$(dirname "$SELF")"
PROJECT="$(pwd)"
LOG_FILE="$HOME/glappa-restart.log"

# ── Farben + Helpers ────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}•${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

TAIL=50   # wieviele alte Zeilen pro Container beim Anhaengen zeigen

# ── Alle laufenden Container live verfolgen ─────────────────────────
# 'docker compose logs' zeigt nur den eigenen Stack (hier bloss 'glappa').
# Fuer "alles" haengen wir uns an JEDEN laufenden Container und praefixen
# jede Zeile mit dem farbigen Container-Namen, damit man sieht wer spricht.
# Ctrl+C beendet alle Streams zugleich.
follow_all_logs() {
    local names
    mapfile -t names < <($SUDO docker ps --format '{{.Names}}' | sort)
    if [ "${#names[@]}" -eq 0 ]; then
        warn "keine laufenden Container gefunden."
        return 0
    fi
    say "folge Logs von: ${names[*]}"
    echo

    # Namen auf gleiche Breite auffuellen -> saubere Spalten.
    local w=0 n
    for n in "${names[@]}"; do [ "${#n}" -gt "$w" ] && w="${#n}"; done

    local pids=()
    # Beim Verlassen (Ctrl+C / Fehler) alle Hintergrund-Streams abraeumen.
    trap 'kill "${pids[@]}" 2>/dev/null; trap - INT TERM EXIT' INT TERM EXIT
    for n in "${names[@]}"; do
        local label
        label=$(printf "%-${w}s" "$n")
        # sed -u = ungepuffert, damit Zeilen sofort erscheinen (kein Blockpuffer).
        $SUDO docker logs -f --tail "$TAIL" "$n" 2>&1 \
            | sed -u "s/^/$(printf '%b' "${C}${label}${X} | ")/" &
        pids+=($!)
    done
    wait
}

# ── Args / Auto-detect ──────────────────────────────────────────────
# Die VPS-Compose-Datei wird in _docker/ gepflegt (inkl. ollama-Service
# + OLLAMA_URL fuer den glappa-chat). Die alte Kopie im Projektroot
# kannte kein Ollama — ein Restart damit stellte glappa in ein eigenes
# Docker-Netz und der Chat sagte nur noch "GLAPPA-BOT ist offline" (503).
VPS_COMPOSE="_docker/docker-compose.vps.yml"
[ -f "$VPS_COMPOSE" ] || VPS_COMPOSE="docker-compose.vps.yml"

COMPOSE=""
BUILD="--build"
PULL=0
CRON=1
LOGS_ONLY=0
LOG_LINK=0
for arg in "$@"; do
    case "$arg" in
        --local)      COMPOSE="docker-compose.yml" ;;
        --vps)        COMPOSE="$VPS_COMPOSE" ;;
        --no-build)   BUILD="" ;;
        --pull)       PULL=1 ;;
        --no-cron)    CRON=0 ;;
        -logs|--logs) LOGS_ONLY=1 ;;
        --log-link|-log-link) LOG_LINK=1 ;;
        *)            echo "Unbekanntes Flag: $arg" >&2; exit 1 ;;
    esac
done

if [ -z "$COMPOSE" ]; then
    if grep -qi microsoft /proc/version 2>/dev/null && [ -f docker-compose.yml ]; then
        COMPOSE="docker-compose.yml"
        LOC="WSL/lokal"
    elif [ -f "$VPS_COMPOSE" ]; then
        COMPOSE="$VPS_COMPOSE"
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

# ── --log-link: Klick-Log des Link-Kuerzers live verfolgen ──────────
# Formatierung laeuft IM Container (python ist dort sicher da, auf dem
# Host nicht unbedingt). tail -F uebersteht auch das Log-Trimmen von
# app.py (_short_log_click ersetzt das File per os.replace).
if [ "$LOG_LINK" = "1" ]; then
    if ! $SUDO docker ps --format '{{.Names}}' | grep -qx glappa; then
        err "Container 'glappa' laeuft nicht — erst 'bash restart.sh' ausfuehren."
        exit 1
    fi
    echo
    echo -e "${B}── Link-Kuerzer Klick-Log (live, Ctrl+C zum Beenden) ──${X}"
    echo -e "Webansicht mit Passwort: ${C}https://home.glappa.de/s/stats${X}"
    echo
    exec $SUDO docker exec -it glappa python -u -c '
import json, subprocess, sys
open("/downloads/shortlinks.log", "a").close()
p = subprocess.Popen(["tail", "-n", "30", "-F", "/downloads/shortlinks.log"],
                     stdout=subprocess.PIPE, text=True)
fmt = "%-19s  /s/%-6s  %-15s %-2s  -> %s"
for line in p.stdout:
    line = line.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except ValueError:
        print(line)
        continue
    print(fmt % (e.get("ts", "?"), e.get("code", "?"),
                 e.get("ip", "?"), e.get("cc") or "--", e.get("url", "")[:70]))
    extra = []
    if e.get("ua"):
        extra.append("Browser: " + e.get("ua")[:70])
    if e.get("ref"):
        extra.append("Von: " + e.get("ref")[:70])
    if extra:
        print(" " * 24 + " | ".join(extra))
    sys.stdout.flush()
'
fi

# ── -logs: nichts neu starten, nur die Logs ALLER Container folgen ──
if [ "$LOGS_ONLY" = "1" ]; then
    echo
    echo -e "${B}── Live-Logs aller Container (Ctrl+C zum beenden) ──${X}"
    echo
    follow_all_logs
    exit 0
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
if [ "$COMPOSE" = "$VPS_COMPOSE" ] && [ "$CRON" = "1" ]; then
    echo "Auto-Neust: taeglich 00:00 via cron (--no-cron schaltet ab)"
fi
echo

# ── Optional: Code aktualisieren ────────────────────────────────────
# WICHTIG: bash hat restart.sh schon vollstaendig eingelesen, BEVOR wir
# hier ankommen. Ein "git pull" holt zwar neue Datei-INHALTE auf die
# Platte, aber Aenderungen AM SKRIPT SELBST (z.B. neue Funktionen wie
# build_shell_guest_image) wuerden in DIESEM Lauf trotzdem ignoriert —
# bash liest den geaenderten Text erst beim NAECHSTEN Aufruf. Das hat
# genau einen Deploy kaputt gemacht (Server-Code war schon neu, aber
# restart.sh lief noch mit der alten Build-Logik). Fix: nach einem
# Pull, der tatsaechlich was geaendert hat, uns selbst per exec neu
# starten — GLAPPA_RESTART_NO_PULL verhindert eine Pull-Endlosschleife.
if [ "$PULL" = "1" ]; then
    if [ -n "${GLAPPA_RESTART_NO_PULL:-}" ]; then
        say "bereits aktualisiert (Re-Exec) — ueberspringe erneuten git pull"
    else
        say "git pull..."
        BEFORE_PULL="$(git rev-parse HEAD 2>/dev/null || echo none)"
        if git pull --ff-only; then
            AFTER_PULL="$(git rev-parse HEAD 2>/dev/null || echo none)"
            if [ "$BEFORE_PULL" != "$AFTER_PULL" ]; then
                ok "Neuer Code geholt ($BEFORE_PULL -> $AFTER_PULL) — starte restart.sh neu, um ihn zu nutzen"
                export GLAPPA_RESTART_NO_PULL=1
                exec bash "$SELF" "$@"
            fi
        else
            warn "git pull fehlgeschlagen — fahre mit lokalem Stand fort."
        fi
    fi
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

# Synct den Apache-vhost (_docker/apache/home.glappa.de.conf) + noetige
# Module, damit ein reines "restart.sh --pull" auch NEUE Proxy-Regeln
# (z.B. /api/shell/ws fuer real-shell) tatsaechlich live schaltet — sonst
# haette nur setup-home-apache.sh den vhost synchronisiert, und
# restart.sh haette den Docker-Stack zwar aktualisiert, aber Apache
# haette weiter die ALTE Config gefahren. Idempotent, nur auf dem VPS
# (COMPOSE = VPS_COMPOSE), und bricht den Rest des Deploys NICHT ab,
# wenn hier was schiefgeht (Container-Restart ist trotzdem wichtiger).
sync_apache_vhost() {
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    command -v apache2 >/dev/null 2>&1 || { warn "Apache nicht installiert — ueberspringe vhost-Sync."; return 0; }
    local vhost_src="_docker/apache/home.glappa.de.conf"
    [ -f "$vhost_src" ] || return 0

    say "synce Apache-vhost (home.glappa.de) + Module..."
    $HOST_SUDO cp "$vhost_src" /etc/apache2/sites-available/home.glappa.de.conf
    $HOST_SUDO a2ensite home.glappa.de.conf >/dev/null 2>&1 || true
    # proxy_wstunnel: fuer /api/shell/ws (real-shell). setenvif: fuer das
    # Log-Opt-out des PGP-Chats (SetEnvIf pgp_dontlog). a2enmod ist idempotent
    # — bereits aktive Module hier nochmal zu nennen ist ein No-Op.
    $HOST_SUDO a2enmod ssl headers rewrite expires proxy proxy_http proxy_wstunnel setenvif >/dev/null 2>&1 || true

    if $HOST_SUDO apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
        $HOST_SUDO systemctl reload apache2 && ok "Apache-vhost synced + reloaded"
    else
        warn "Apache configtest fehlgeschlagen — vhost NICHT reloaded, alte Config laeuft weiter."
        warn "Pruefen mit:  sudo apache2ctl configtest"
    fi
}

# Baut das GAST-Image (glappa-shellvm:latest), aus dem shellgate pro
# Sitzung Container erzeugt. MUSS explizit gebaut werden: im Compose ist
# shellvm nur als Bauplan (mit profiles:) hinterlegt, aber "docker compose
# build" ueberspringt Services mit inaktivem Profil — dadurch existierte
# das Image nie und shellgate scheiterte zur Laufzeit mit ImageNotFound
# (und versuchte es sinnlos von Docker Hub zu ziehen). Direkt bauen
# umgeht die Compose-Profil-Eigenheiten komplett. Nur auf dem VPS.
build_shell_guest_image() {
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    [ -f "_docker/shellvm/Dockerfile" ] || return 0
    say "baue Gast-Image glappa-shellvm:latest (real-shell)..."
    if $SUDO docker build -t glappa-shellvm:latest _docker/shellvm; then
        ok "Gast-Image glappa-shellvm:latest gebaut"
    else
        warn "Gast-Image-Build fehlgeschlagen — real-shell startet keine Sitzungen (ImageNotFound)."
    fi
}

# Baut das EGRESS-Proxy-Image (glappa-shell-egress:latest) — Tor + privoxy +
# dnscrypt-proxy. shellgate haengt den Gast an ein internes Netz OHNE Internet
# und laesst ihn NUR ueber diesen Proxy raus (Anti-Tracking: Ausgang via Tor,
# DNS via DoH). Wie beim Gast-Image steht es NICHT im Compose (kein Service),
# also hier direkt bauen. Nur auf dem VPS.
build_shell_egress_image() {
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    [ -f "_docker/shell-egress/Dockerfile" ] || return 0
    say "baue Egress-Image glappa-shell-egress:latest (Tor+privoxy+dnscrypt)..."
    if $SUDO docker build -t glappa-shell-egress:latest _docker/shell-egress; then
        ok "Egress-Image glappa-shell-egress:latest gebaut"
    else
        warn "Egress-Image-Build fehlgeschlagen — real-shell hat dann keinen Ausgang (fail-closed)."
    fi
}

# Legt das interne Gast-Netz glappa-shell-lan an, falls es noch fehlt. Im
# Compose ist es als external deklariert — Compose uebernimmt kein Netz,
# das jemand anderes (shellgate zur Laufzeit, per docker-py) angelegt hat
# ("incorrect label com.docker.compose.network", hat den zweiten VPS-Deploy
# gebrochen). external heisst aber auch: 'up' bricht ab, wenn das Netz noch
# GAR NICHT existiert (allererster Start auf frischem Host). Deshalb hier
# anlegen, mit denselben Eigenschaften wie shellgate/server.py:
# ensure_networks() — internal (Gast hat KEIN direktes Internet), Subnetz
# waehlt Docker selbst. Idempotent, nur auf dem VPS.
ensure_shell_lan_network() {
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    if ! $SUDO docker network inspect glappa-shell-lan >/dev/null 2>&1; then
        say "lege internes Gast-Netz glappa-shell-lan an (im Compose external)..."
        $SUDO docker network create --internal glappa-shell-lan >/dev/null
        ok "Netz glappa-shell-lan angelegt"
    fi
}

# Warnt fruehzeitig, wenn _docker/.env (SHELL_PASSWORD_HASH fuer real-shell)
# fehlt — sonst crashed der shellgate-Container beim Start mit einer
# kryptischen Python-Fehlermeldung ohne ersichtlichen Grund.
check_shell_env() {
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    [ -f "_docker/shellgate/server.py" ] || return 0   # Feature noch nicht im Checkout
    if [ ! -f "_docker/.env" ] || ! grep -q "^SHELL_PASSWORD_HASH=.\+" "_docker/.env" 2>/dev/null; then
        warn "_docker/.env fehlt oder SHELL_PASSWORD_HASH ist leer — shellgate (real-shell) startet dann NICHT."
        warn "Einmalig einrichten:  cp _docker/.env.example _docker/.env  &&  Hash eintragen."
    fi
}

# Stellt sicher, dass ein cron-Eintrag den Container jede Nacht 00:00 neu
# startet — damit der taegliche Restart auch ohne vps-deploy.sh existiert.
# Idempotent (legt nichts doppelt an), nur auf dem VPS sinnvoll.
ensure_daily_restart_cron() {
    [ "$CRON" = "1" ] || return 0
    [ "$COMPOSE" = "$VPS_COMPOSE" ] || return 0
    command -v crontab >/dev/null 2>&1 || return 0
    local tag="# glappa-site daily restart"
    local line="0 0 * * * cd $PROJECT && ${SUDO:+sudo }docker compose -f $COMPOSE restart >> $LOG_FILE 2>&1  $tag"
    # Bestehendes crontab ZUERST komplett einlesen, dann schreiben — so gibt
    # es kein gleichzeitiges Lesen/Schreiben und keine fremden Eintraege gehen
    # verloren.
    local existing
    existing="$(crontab -l 2>/dev/null || true)"
    if printf '%s\n' "$existing" | grep -qxF "$line"; then
        return 0   # existiert schon in aktueller Form → nichts tun
    fi
    # Selber Tag, anderer Inhalt (z. B. alter Compose-Pfad) → ersetzen.
    existing="$(printf '%s\n' "$existing" | grep -vF "$tag" || true)"
    if { [ -n "$existing" ] && printf '%s\n' "$existing"; printf '%s\n' "$line"; } | crontab - 2>/dev/null; then
        $HOST_SUDO systemctl enable --now cron >/dev/null 2>&1 || true
        ok "taeglicher Auto-Restart 00:00 eingerichtet (cron). Log: $LOG_FILE"
    else
        warn "cron nicht setzbar (crontab fehlt/kein Zugriff) — daily restart uebersprungen."
    fi
}

# ── Apache-vhost synchronisieren (NEUE Proxy-Regeln aus dem Repo live
#    schalten) + auf fehlenden real-shell-Passwort-Hash hinweisen ──────
sync_apache_vhost
check_shell_env

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
    # Gast-Image separat bauen — compose ueberspringt es (Profil), s.o.
    build_shell_guest_image
    # Egress-Proxy-Image separat bauen (steht wie der Gast nicht im Compose).
    build_shell_egress_image
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
ensure_shell_lan_network
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

# ── Taeglichen Auto-Restart (cron) sicherstellen ────────────────────
# Muss VOR dem 'exec logs' passieren — exec ersetzt den Prozess, danach
# laeuft nichts mehr.
ensure_daily_restart_cron

# ── Logs (live, Ctrl+C zum verlassen) — ALLE Container ──────────────
echo
echo -e "${B}── Live-Logs aller Container (Ctrl+C zum beenden) ──${X}"
echo
follow_all_logs
