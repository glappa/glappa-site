#!/usr/bin/env bash
#
# setup-home-apache.sh — ALL-IN-ONE Deploy fuer home.glappa.de.
#
# Ein einziger Befehl holt den neusten Stand von GitHub und macht alles live:
#   - statische Seite (~/glappa-site/) via Apache auf :443
#   - Downloader (Flask app.py) als Container neu gebaut + gestartet auf :8080
#   - SearXNG-Container neu gestartet (zieht ggf. neue settings.yml)
#
# Aufruf (auf dem VPS):
#   bash _docker/setup-home-apache.sh        # holt selbst git pull + restartet
#
# Macht idempotent:
#   0) Neuster Stand von GitHub (git pull, re-exec falls sich das Skript aendert)
#   1) Pre-flight (Apache da, Repo da, Cert da)
#   2) Permissions: www-data muss /home/glappa/glappa-site lesen koennen
#      (per ACL falls verfuegbar, sonst chmod o+rX)
#   3) Alte home.glappa.de vhosts disablen + backuppen
#   4) Neuen vhost installieren (DocumentRoot=~/glappa-site)
#   5) Apache configtest + reload
#   6) Downloader (:8080) + SearXNG Container neu bauen & starten
#   7) Verify
#
# Damit reicht EIN Aufruf um sowohl die statische Seite als auch den
# Downloader/SearXNG auf den neusten GitHub-Stand zu bringen.

set -euo pipefail

SELF="$(readlink -f "$0")"
cd "$(dirname "$SELF")"
PROJECT="$(pwd)"
SITE_ROOT="$(cd .. && pwd)"   # = ~/glappa-site
DOMAIN="home.glappa.de"
VHOST_NAME="home.glappa.de.conf"
APACHE_USER="www-data"
COMPOSE_FILE="$PROJECT/docker-compose.vps.yml"
DL_PORT=8080                  # Downloader (Flask app.py)
SEARX_ADDR="127.0.0.1:8888"   # SearXNG (lokal, Apache proxied davor)

G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }
hr()   { echo "───────────────────────────────────────────────────────────"; }

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "${B}  home.glappa.de — DocumentRoot = ${SITE_ROOT}${X}"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo

# ── 0) Neuster Stand von GitHub ────────────────────────────────
hr
say "0) Neuster Stand von GitHub"

# GLAPPA_NO_PULL verhindert eine Endlosschleife: nach einem Pull, der dieses
# Skript selbst veraendert hat, exec'en wir uns einmal neu (bash liest Skripte
# zur Laufzeit nach — sonst liefe eine gemischte Alt/Neu-Version).
if [ -n "${GLAPPA_NO_PULL:-}" ]; then
    ok "Bereits aktualisiert (Re-Exec) — ueberspringe git pull"
elif [ -d "$SITE_ROOT/.git" ] && command -v git >/dev/null 2>&1; then
    BEFORE="$(git -C "$SITE_ROOT" rev-parse HEAD 2>/dev/null || echo none)"
    if git -C "$SITE_ROOT" pull --ff-only; then
        AFTER="$(git -C "$SITE_ROOT" rev-parse HEAD 2>/dev/null || echo none)"
        ok "Repo aktuell ($AFTER)"
        if [ "$BEFORE" != "$AFTER" ]; then
            ok "Neuer Code geholt — starte Skript mit aktueller Version neu"
            export GLAPPA_NO_PULL=1
            exec bash "$SELF" "$@"
        fi
    else
        warn "git pull fehlgeschlagen (lokale Aenderungen/offline?) — fahre mit aktuellem Stand fort"
    fi
else
    warn "Kein git-Repo unter $SITE_ROOT oder git fehlt — ueberspringe Pull"
fi

# ── 1) Pre-flight ──────────────────────────────────────────────
echo
hr
say "1) Pre-flight"

[ -d "$SITE_ROOT" ] || { err "$SITE_ROOT existiert nicht"; exit 1; }
[ -f "$SITE_ROOT/index.html" ] || { err "$SITE_ROOT/index.html fehlt"; exit 1; }
[ -f "$PROJECT/apache/$VHOST_NAME" ] || { err "$PROJECT/apache/$VHOST_NAME fehlt"; exit 1; }
ok "Repo + vhost-Template gefunden"

command -v apache2 >/dev/null 2>&1 || { err "Apache fehlt"; exit 1; }
ok "Apache da"

if ! sudo test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    err "Kein Letsencrypt-Cert unter /etc/letsencrypt/live/$DOMAIN/"
    err "Cert muss vorher existieren (vom App-Setup) oder neu geholt werden via:"
    err "  sudo certbot certonly --webroot -w /var/www/html -d $DOMAIN"
    exit 1
fi
ok "Cert fuer $DOMAIN vorhanden"

# ── 2) Permissions: www-data muss lesen koennen ─────────────────
echo
hr
say "2) Permissions fuer $APACHE_USER"

# Apache als www-data muss durch /home/glappa hindurch (exec) und in
# /home/glappa/glappa-site/ lesen koennen. Auf Ubuntu Default ist
# /home/<user>/ aber 0750 — www-data ist drinnen blockiert.
HOME_DIR="$(cd "$SITE_ROOT/.." && pwd)"

if command -v setfacl >/dev/null 2>&1; then
    say "ACL-Modus (setfacl ist da)"
    sudo setfacl -m "u:${APACHE_USER}:x"  "$HOME_DIR"
    sudo setfacl -R -m "u:${APACHE_USER}:rX" "$SITE_ROOT"
    sudo setfacl -d -m "u:${APACHE_USER}:rX" "$SITE_ROOT" 2>/dev/null || true
    ok "ACL: $APACHE_USER hat Read auf $SITE_ROOT (+ Traverse auf $HOME_DIR)"
else
    say "Kein setfacl — installiere acl-Paket"
    if sudo apt-get install -y acl >/dev/null 2>&1; then
        sudo setfacl -m "u:${APACHE_USER}:x"  "$HOME_DIR"
        sudo setfacl -R -m "u:${APACHE_USER}:rX" "$SITE_ROOT"
        sudo setfacl -d -m "u:${APACHE_USER}:rX" "$SITE_ROOT" 2>/dev/null || true
        ok "ACL gesetzt (acl-Paket nachinstalliert)"
    else
        warn "ACL-Install fehlgeschlagen — Fallback auf chmod"
        sudo chmod o+x "$HOME_DIR"
        sudo chmod -R o+rX "$SITE_ROOT"
        ok "chmod o+rX gesetzt (alle Linux-User koennen lesen — auf single-user VPS unkritisch)"
    fi
fi

# Test: kann www-data wirklich lesen?
if sudo -u "$APACHE_USER" test -r "$SITE_ROOT/index.html"; then
    ok "Test: $APACHE_USER kann index.html lesen"
else
    err "$APACHE_USER kann $SITE_ROOT/index.html NICHT lesen — Permissions fehlerhaft"
    sudo -u "$APACHE_USER" ls -la "$SITE_ROOT/index.html" || true
    exit 1
fi

# ── 3) Backup + alte vhosts disablen ───────────────────────────
echo
hr
say "3) Alte $DOMAIN vhosts backuppen + disablen"

BACKUP_DIR="/etc/apache2/glappa-backups"
sudo mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"

# Alle bestehenden vhost-files die diese Domain anfassen
EXISTING_VHOSTS=()
for f in /etc/apache2/sites-available/*.conf; do
    [ -f "$f" ] || continue
    if sudo grep -qE "^\s*ServerName\s+${DOMAIN}\s*$" "$f" 2>/dev/null; then
        EXISTING_VHOSTS+=("$f")
    fi
done

if [ ${#EXISTING_VHOSTS[@]} -gt 0 ]; then
    for f in "${EXISTING_VHOSTS[@]}"; do
        base="$(basename "$f")"
        if [ "$base" = "$VHOST_NAME" ]; then
            sudo cp "$f" "$BACKUP_DIR/${base}.${TS}.bak"
            ok "Backup: $base → $BACKUP_DIR/${base}.${TS}.bak"
            # Wird gleich ersetzt
        else
            sudo cp "$f" "$BACKUP_DIR/${base}.${TS}.bak"
            sudo a2dissite "$base" >/dev/null 2>&1 || true
            ok "Disabled + Backup: $base"
        fi
    done
else
    ok "Keine bestehenden $DOMAIN-vhosts gefunden"
fi

# ── 4) Neuen vhost installieren ─────────────────────────────────
echo
hr
say "4) Installiere $VHOST_NAME"

# DocumentRoot in der Config dynamisch ersetzen (falls Repo woanders liegt)
sudo cp "$PROJECT/apache/$VHOST_NAME" /etc/apache2/sites-available/
if [ "$SITE_ROOT" != "/home/glappa/glappa-site" ]; then
    warn "Repo liegt unter $SITE_ROOT (nicht /home/glappa/glappa-site) — passe vhost an"
    sudo sed -i "s|/home/glappa/glappa-site|${SITE_ROOT}|g" "/etc/apache2/sites-available/$VHOST_NAME"
fi
sudo a2ensite "$VHOST_NAME" >/dev/null
ok "vhost $VHOST_NAME enabled"

# ── 5) Apache-Module ────────────────────────────────────────────
# proxy/proxy_http/proxy_wstunnel: fuer /api/chat, /api/counter/ und
# /api/shell/ws (real-shell, WebSocket-Upgrade zu shellgate). a2enmod
# ist idempotent — bereits aktive Module hier erneut zu nennen ist ein No-Op.
say "Aktiviere Module: ssl headers rewrite expires proxy proxy_http proxy_wstunnel"
sudo a2enmod ssl headers rewrite expires proxy proxy_http proxy_wstunnel >/dev/null
ok "Module aktiv"

# ── 5) configtest + reload ──────────────────────────────────────
echo
hr
say "5) Apache config test + reload"

if sudo apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
    sudo systemctl reload apache2
    ok "Apache reloaded"
else
    err "Apache configtest FAILED:"
    sudo apache2ctl configtest
    exit 1
fi

# ── 6) Downloader (:8080) + SearXNG Container neu bauen & starten ─
echo
hr
say "6) Downloader (:$DL_PORT) + SearXNG neu bauen & starten"

if ! command -v docker >/dev/null 2>&1; then
    warn "Docker fehlt — ueberspringe Container. Erstinstallation via:  bash _docker/vps-deploy.sh"
elif [ ! -f "$COMPOSE_FILE" ]; then
    warn "Compose-Datei fehlt: $COMPOSE_FILE — ueberspringe Container"
else
    # docker braucht evtl. sudo (wenn User nicht in der docker-Gruppe ist)
    DOCKER_SUDO=""
    docker ps >/dev/null 2>&1 || DOCKER_SUDO="sudo"

    # Compose v2 (docker compose) bevorzugt, sonst v1 (docker-compose)
    COMPOSE_BIN="docker compose"
    $DOCKER_SUDO docker compose version >/dev/null 2>&1 || COMPOSE_BIN="docker-compose"

    say "Baue + starte Container neu (glappa rebuild aus aktuellem Code)..."
    # Alten glappa-Container gezielt entfernen: laeuft er noch unter diesem
    # Namen aus einem frueheren Start / anderen Compose-Projekt, scheitert
    # 'up' sonst am Name-Konflikt und der veraltete Container laeuft einfach
    # weiter. Gleiches Muster wie in setup-search-apache.sh.
    $DOCKER_SUDO docker rm -f glappa >/dev/null 2>&1 || true
    if $DOCKER_SUDO $COMPOSE_BIN -f "$COMPOSE_FILE" up -d --build; then
        ok "Container gebaut + gestartet (Downloader :$DL_PORT)"
        # SearXNG explizit neu starten, damit es eine evtl. neue settings.yml
        # (per Volume gemountet -> 'up' allein startet dafuer nicht neu) zieht.
        if $DOCKER_SUDO docker ps -a --format '{{.Names}}' | grep -q '^searxng$'; then
            $DOCKER_SUDO $COMPOSE_BIN -f "$COMPOSE_FILE" restart searxng >/dev/null \
                && ok "SearXNG neu gestartet" \
                || warn "SearXNG-Restart fehlgeschlagen"
        else
            warn "SearXNG-Container nicht gefunden — wurde via 'up' gestartet (siehe oben)"
        fi
        # Chat-Modelle fuer glappa-chat (Ollama) ziehen — idempotent, laedt
        # nur beim ersten Mal wirklich runter. Zwei Modelle: SMART (grosse,
        # komplexe Anfragen) + FAST (kurze/simple Anfragen, s. app.py).
        CHAT_MODEL="$(grep -oE 'GLAPPA_CHAT_MODEL=[^ ]+' "$COMPOSE_FILE" | head -1 | cut -d= -f2)"
        CHAT_MODEL="${CHAT_MODEL:-qwen2.5:14b}"
        CHAT_MODEL_FAST="$(grep -oE 'GLAPPA_CHAT_MODEL_FAST=[^ ]+' "$COMPOSE_FILE" | head -1 | cut -d= -f2)"
        CHAT_MODEL_FAST="${CHAT_MODEL_FAST:-qwen3:4b-instruct-2507-q4_K_M}"
        if $DOCKER_SUDO docker ps --format '{{.Names}}' | grep -q '^glappa-ollama$'; then
            for m in "$CHAT_MODEL" "$CHAT_MODEL_FAST"; do
                say "Ziehe Chat-Modell $m (erster Lauf laedt ggf. mehrere GB)..."
                $DOCKER_SUDO docker exec glappa-ollama ollama pull "$m" \
                    && ok "Chat-Modell $m bereit" \
                    || warn "Modell-Pull fuer $m fehlgeschlagen — glappa-chat meldet dann 'Modell fehlt'"
            done
            # BEIDE Modelle direkt vorwaermen, damit nicht der erste Chat-/
            # Agent-User nach dem Deploy den Modell-Ladevorgang (Kaltstart,
            # beim 14b-Modell 30-60s+) abwartet. app.py pinnt beide Modelle
            # per Request-keep_alive 24h — der Warmup hier ueberbrueckt die
            # Zeit bis zur ersten echten Anfrage. --keepalive braucht eine
            # neuere ollama-CLI; Fallback ohne Flag (dann gilt 30m aus env,
            # die erste echte Anfrage pinnt danach sowieso auf 24h).
            for m in "$CHAT_MODEL_FAST" "$CHAT_MODEL"; do
                say "Waerme Modell $m vor (14b kann 1-2 min dauern)..."
                { $DOCKER_SUDO docker exec glappa-ollama ollama run --keepalive 24h "$m" "Sag nur: OK" >/dev/null 2>&1 \
                    || $DOCKER_SUDO docker exec glappa-ollama ollama run "$m" "Sag nur: OK" >/dev/null 2>&1; } \
                    && ok "Modell $m vorgewaermt (im RAM)" \
                    || warn "Warmup fuer $m fehlgeschlagen — erster Chat laedt das Modell selbst"
            done
        else
            warn "glappa-ollama-Container laeuft nicht — glappa-chat bleibt offline"
        fi
        echo
        $DOCKER_SUDO $COMPOSE_BIN -f "$COMPOSE_FILE" ps || true
    else
        err "Container-Build/-Start fehlgeschlagen — siehe Ausgabe oben"
        warn "Logs:  $DOCKER_SUDO $COMPOSE_BIN -f $COMPOSE_FILE logs --tail 50"
    fi
fi

# ── 7) Verify ───────────────────────────────────────────────────
echo
hr
say "7) Verify"

sleep 2
HTTP="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$DOMAIN/" || echo "000")"
if [ "$HTTP" = "200" ]; then
    ok "https://$DOMAIN/  →  HTTP 200"
else
    warn "https://$DOMAIN/  →  HTTP $HTTP"
fi

# Mit Browser-UA testen ob index.html aus dem Repo kommt
TITLE="$(curl -fsS --max-time 8 -A "Mozilla/5.0" "https://$DOMAIN/" 2>/dev/null | grep -oE '<title>[^<]+</title>' | head -1)"
if [ -n "$TITLE" ]; then
    ok "Content: $TITLE"
fi

# Geschuetzte Pfade muessen 403/404 liefern
for blocked in "/_docker/" "/.git/config"; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "https://$DOMAIN${blocked}" || echo "000")"
    if [ "$code" = "403" ] || [ "$code" = "404" ]; then
        ok "Block: ${blocked} → $code"
    else
        warn "${blocked} → $code (sollte 403/404 sein!)"
    fi
done

# Downloader (:8080) erreichbar? (app.py spricht HTTPS, Fallback HTTP)
if command -v docker >/dev/null 2>&1 && [ -f "$COMPOSE_FILE" ]; then
    DL="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 8 "https://127.0.0.1:${DL_PORT}/" 2>/dev/null || echo 000)"
    [ "$DL" = "000" ] && DL="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${DL_PORT}/" 2>/dev/null || echo 000)"
    if [ "$DL" = "200" ] || [ "$DL" = "301" ] || [ "$DL" = "302" ]; then
        ok "Downloader :$DL_PORT  →  HTTP $DL"
    else
        warn "Downloader :$DL_PORT  →  HTTP $DL (Container noch am Hochfahren? Logs checken)"
    fi

    # SearXNG (lokal auf $SEARX_ADDR) erreichbar?
    SX="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://${SEARX_ADDR}/" 2>/dev/null || echo 000)"
    if [ "$SX" = "200" ] || [ "$SX" = "302" ]; then
        ok "SearXNG $SEARX_ADDR  →  HTTP $SX"
    else
        warn "SearXNG $SEARX_ADDR  →  HTTP $SX (Container noch am Hochfahren?)"
    fi
fi

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "  ${G}${B}Fertig — alles auf dem neusten GitHub-Stand & live.${X}"
echo
echo "  https://$DOMAIN/        → ~/glappa-site/index.html (statisch, Apache)"
echo "  https://$DOMAIN:$DL_PORT/   → Downloader (Flask app.py) — neu gebaut & gestartet"
echo "  https://search.glappa.de/ → SearXNG (neu gestartet)"
echo
echo "  Deploy ab jetzt:   bash _docker/setup-home-apache.sh"
echo "                     (holt git pull + baut/restartet alles selbst)"
echo
echo "  Backup alter Configs:  $BACKUP_DIR/"
echo "  Apache-Logs:           sudo tail -f /var/log/apache2/$DOMAIN-error.log"
echo "  Container-Logs:        ${DOCKER_SUDO:+$DOCKER_SUDO }${COMPOSE_BIN:-docker compose} -f $COMPOSE_FILE logs -f"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
