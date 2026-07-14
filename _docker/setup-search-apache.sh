#!/usr/bin/env bash
#
# setup-search-apache.sh — Deploy-Allrounder fuer den VPS.
#
# Ein Aufruf zieht den neuesten Stand von GitHub und faehrt ALLES sauber neu
# hoch, sodass die Aenderungen live sichtbar sind:
#   1. git reset --hard origin/main          (neuester Code)            [Step 0]
#   2. Apache-Reverse-Proxy fuer search.glappa.de + Cert            [Steps 1-7]
#   3. SearXNG-Container neu starten                                   [Step 8]
#   4. Glappa-App (YT-Downloader) Image NEU BAUEN + starten          [Step 8b]
#
# Architektur:
#   Apache (auf :80/:443) ── Reverse-Proxy ──► SearXNG (127.0.0.1:8888 Container)
#   Glappa-App (home.glappa.de:8080) laeuft als eigener Container (glappa).
#
# Apache laeuft weiter fuer alle bestehenden vhosts, wir fuegen NUR einen
# zusaetzlichen vhost search.glappa.de.conf hinzu. Andere Sites sind
# unangetastet.
#
# Aufruf:
#   bash setup-search-apache.sh
#   bash setup-search-apache.sh --status   # nur Status zeigen
#
# Idempotent: kann mehrfach laufen.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
PROJECT="$(pwd)"
DOMAIN="search.glappa.de"
EMAIL="lex@glappa.de"
SEARXNG_HOST_PORT="127.0.0.1:8888"
COMPOSE_FILE="docker-compose.vps.yml"

# Pfad + Hash DIESES Scripts — fuer den Selbst-Update-Reexec in Step 0.
# (Wenn der git pull eine neue Version des Scripts bringt, muessen wir mit ihr
# neu starten, sonst laeuft die alte, schon geladene Version ohne neue Steps.)
# WICHTIG: aus dem bereits absoluten $PROJECT bauen — $0 ist relativ und wir
# haben oben schon ins Script-Verzeichnis ge-cd't, ein readlink -f "$0" wuerde
# hier ins Leere zeigen und (mit set -e) das Script lautlos beenden.
SELF="$PROJECT/$(basename "$0")"
SELF_HASH_BEFORE="$(sha256sum "$SELF" 2>/dev/null | cut -d' ' -f1 || true)"

# ── Farben ─────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }
hr()   { echo "───────────────────────────────────────────────────────────"; }

# Sudo nur wenn docker nicht ohne läuft
DSUDO=""
if command -v docker >/dev/null 2>&1 && ! docker ps >/dev/null 2>&1; then
    DSUDO="sudo"
fi

# ── Status-Modus ───────────────────────────────────────────────────
if [ "${1:-}" = "--status" ] || [ "${1:-}" = "status" ]; then
    echo "Apache: $(systemctl is-active apache2)"
    echo "Glappa-App + SearXNG (Docker):"
    $DSUDO docker compose -f "$COMPOSE_FILE" ps glappa searxng 2>/dev/null || true
    echo
    echo "Apache vhost aktiv?"
    ls -l /etc/apache2/sites-enabled/ | grep search.glappa.de || echo "  (nicht enabled)"
    echo
    echo "Cert:"
    sudo ls -l /etc/letsencrypt/live/$DOMAIN/ 2>/dev/null || echo "  (kein Cert)"
    echo
    echo "Smoke-Test:"
    curl -sI https://$DOMAIN/ 2>&1 | head -3 || true
    exit 0
fi

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "${B}  search.glappa.de hinter Apache aufsetzen${X}"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo "  Projekt:   $PROJECT"
echo "  Domain:    $DOMAIN"
echo "  SearXNG:   $SEARXNG_HOST_PORT (intern via Apache)"
echo

# ── 0) Neueste Git-Aenderungen holen ───────────────────────────────
hr
say "0) Neueste Git-Aenderungen holen (origin/main)"

REPO_ROOT="$(cd "$PROJECT/.." && pwd)"
if [ -d "$REPO_ROOT/.git" ]; then
    # Ownership-Fix: sonst scheitert git an root-eigener settings.yml
    # (vom SearXNG-Container angelegt) mit "unable to unlink".
    if find "$REPO_ROOT" -not -user "$(id -un)" -print -quit 2>/dev/null | grep -q .; then
        say "Korrigiere Datei-Ownership (sudo chown)…"
        sudo chown -R "$(id -un):$(id -gn)" "$REPO_ROOT"
    fi
    if git -C "$REPO_ROOT" fetch origin 2>/dev/null \
       && git -C "$REPO_ROOT" reset --hard origin/main >/dev/null 2>&1; then
        ok "Repo aktualisiert → $(git -C "$REPO_ROOT" rev-parse --short HEAD) $(git -C "$REPO_ROOT" log -1 --format='%s' | cut -c1-50)"
    else
        warn "Git-Update fehlgeschlagen — nutze aktuellen Working-Tree-Stand"
    fi
    # settings.yml nach reset wieder lesbar fuer den Container machen
    chmod a+r "$REPO_ROOT/_docker/searxng/settings.yml" 2>/dev/null || true

    # Selbst-Update: Hat der Pull DIESES Script veraendert? Dann mit der neuen
    # Version neu starten — sonst laeuft die bereits geladene alte Version
    # weiter und neue Schritte (z.B. 8b App-Rebuild) wuerden fehlen.
    # GLAPPA_DEPLOY_REEXEC verhindert eine Endlosschleife.
    if [ "${GLAPPA_DEPLOY_REEXEC:-}" != "1" ]; then
        SELF_HASH_AFTER="$(sha256sum "$SELF" 2>/dev/null | cut -d' ' -f1 || true)"
        if [ -n "$SELF_HASH_AFTER" ] && [ "$SELF_HASH_AFTER" != "$SELF_HASH_BEFORE" ]; then
            ok "Deploy-Script wurde aktualisiert — starte mit neuer Version neu…"
            export GLAPPA_DEPLOY_REEXEC=1
            exec bash "$SELF" "$@"
        fi
    fi
else
    warn "Kein .git in $REPO_ROOT — ueberspringe Git-Update"
fi

# ── 1) Pre-flight ──────────────────────────────────────────────────
hr
say "1) Pre-flight"

for f in "$COMPOSE_FILE" "apache/search.glappa.de.conf" "searxng/settings.yml"; do
    [ -f "$f" ] || { err "FEHLT: $PROJECT/$f"; exit 1; }
done
ok "Alle noetigen Files vorhanden"

command -v docker >/dev/null 2>&1 || { err "Docker fehlt"; exit 1; }
ok "Docker da: $(docker --version | head -1)"

if ! command -v apache2 >/dev/null 2>&1; then
    say "Installiere Apache"
    sudo apt-get update -qq
    sudo apt-get install -y apache2
fi
ok "Apache da"

if ! command -v certbot >/dev/null 2>&1; then
    say "Installiere certbot + apache-plugin"
    sudo apt-get update -qq
    sudo apt-get install -y certbot python3-certbot-apache
fi
ok "certbot da"

# DNS-Check
if command -v dig >/dev/null 2>&1; then
    RES="$(dig +short "$DOMAIN" | tail -1)"
    SELF="$(curl -s --max-time 3 https://api.ipify.org || echo '')"
    if [ -n "$RES" ] && [ "$RES" = "$SELF" ]; then
        ok "DNS: $DOMAIN → $RES (matched VPS-IP)"
    elif [ -n "$RES" ]; then
        warn "DNS: $DOMAIN → $RES, VPS: $SELF — passt nicht zusammen!"
    else
        err "$DOMAIN loest keine IP auf. A-Record setzen + propagieren lassen."
        exit 1
    fi
fi

# ── 2) Caddy/alte SearXNG aufraeumen ───────────────────────────────
echo
hr
say "2) Alte Caddy/SearXNG-Container aufraeumen"

if docker ps -a --format '{{.Names}}' | grep -q '^caddy$'; then
    $DSUDO docker rm -f caddy >/dev/null
    ok "Alten caddy-Container entfernt"
fi
# searxng wird neu gestartet weil sich die Port-Mappings geaendert haben
if docker ps -a --format '{{.Names}}' | grep -q '^searxng$'; then
    $DSUDO docker rm -f searxng >/dev/null
    ok "Alten searxng-Container entfernt (kommt mit neuem Port-Mapping wieder)"
fi
# Caddy-Volumes weg (nicht mehr gebraucht — geben Disk frei)
for vol in docker_caddy-data docker_caddy-config docker_caddy-logs; do
    if $DSUDO docker volume ls -q | grep -q "^$vol\$"; then
        $DSUDO docker volume rm "$vol" >/dev/null 2>&1 || true
    fi
done
ok "Caddy-Volumes entfernt"

# ── 3) settings.yml Ownership fix + Secret ─────────────────────────
echo
hr
say "3) SearXNG settings.yml"

SETTINGS="$PROJECT/searxng/settings.yml"
if [ ! -w "$SETTINGS" ]; then
    sudo chown "$(id -u):$(id -g)" "$SETTINGS"
fi
sudo chmod 644 "$SETTINGS"

if grep -q "REPLACE_ME_OPENSSL_RAND_HEX_32" "$SETTINGS"; then
    SECRET="$(openssl rand -hex 32)"
    sed -i "s|REPLACE_ME_OPENSSL_RAND_HEX_32|${SECRET}|" "$SETTINGS"
    ok "Frischer secret_key gesetzt"
else
    ok "secret_key war schon gesetzt"
fi

# ── 4) Apache hochfahren ───────────────────────────────────────────
echo
hr
say "4) Apache starten + Module aktivieren"

sudo systemctl enable apache2 >/dev/null 2>&1 || true
if ! systemctl is-active --quiet apache2; then
    sudo systemctl start apache2
fi
ok "Apache laeuft: $(systemctl is-active apache2)"

say "Aktiviere Module: ssl proxy proxy_http proxy_wstunnel headers rewrite substitute filter deflate"
sudo a2enmod ssl proxy proxy_http proxy_wstunnel headers rewrite substitute filter deflate >/dev/null
ok "Module aktiv"

# Webroot-Ordner fuer ACME-Challenge
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/html/.well-known

# Statische Assets, die per mod_substitute in jede SearXNG-HTML-Response
# injiziert werden:
#   glappa-style.css  90er-Retro-Theme (Default)
#   glappa-clean.css  cleane Themes (Dunkel + Hell)
#   glappa-theme.js   Design-Umschalter (localStorage) + Panel auf /preferences
#   glappa-search.js  Dateiformat-Filter fuer die Bilder-Suche
sudo mkdir -p /var/www/search-static
for asset in glappa-style.css glappa-clean.css glappa-theme.js glappa-search.js; do
    if [ -f "$PROJECT/searxng-static/$asset" ]; then
        sudo cp "$PROJECT/searxng-static/$asset" /var/www/search-static/
        ok "$asset nach /var/www/search-static/ deployed"
    else
        warn "FEHLT: $PROJECT/searxng-static/$asset — Theme-Umschalter braucht alle 4 Assets"
    fi
done
sudo chown -R www-data:www-data /var/www/search-static

# ── 5) Initialer :80-only vhost (fuer ACME) ────────────────────────
echo
hr
say "5) Apache vhost (:80 only) installieren fuer ACME-Challenge"

# Wenn schon ein voller vhost mit SSL drin ist (re-run), nichts machen
if sudo test -f "/etc/apache2/sites-available/search.glappa.de.conf" && \
   sudo grep -q "SSLEngine on" /etc/apache2/sites-available/search.glappa.de.conf; then
    ok "vhost existiert bereits (mit SSL) — kein Init noetig"
else
    sudo tee /etc/apache2/sites-available/search.glappa.de.conf > /dev/null <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot /var/www/html
    Alias /.well-known/acme-challenge/ /var/www/html/.well-known/acme-challenge/
    <Directory /var/www/html/.well-known/acme-challenge/>
        Require all granted
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/$DOMAIN-error.log
    CustomLog \${APACHE_LOG_DIR}/$DOMAIN-access.log combined
</VirtualHost>
EOF
    sudo a2ensite search.glappa.de.conf >/dev/null
    sudo apache2ctl configtest
    sudo systemctl reload apache2
    ok "Init-vhost (:80) aktiv"
fi

# ── 6) Letsencrypt-Cert holen (falls noch nicht da) ────────────────
echo
hr
say "6) Letsencrypt-Cert via webroot"

if sudo test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    ok "Cert existiert bereits: /etc/letsencrypt/live/$DOMAIN/"
else
    sudo certbot certonly --webroot -w /var/www/html \
        -d "$DOMAIN" \
        --non-interactive --agree-tos \
        --email "$EMAIL" \
        --keep-until-expiring
    ok "Cert geholt"
fi

# Standard SSL-Options-Datei sicherstellen
if [ ! -f /etc/letsencrypt/options-ssl-apache.conf ]; then
    say "Lege options-ssl-apache.conf an (von certbot mitgeliefert)"
    sudo apt-get install -y python3-certbot-apache >/dev/null 2>&1 || true
fi

# ── 7) Voller vhost (:80 + :443) ───────────────────────────────────
echo
hr
say "7) Vollstaendigen vhost installieren (mit Reverse-Proxy)"

sudo cp "$PROJECT/apache/search.glappa.de.conf" /etc/apache2/sites-available/
if sudo apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
    sudo systemctl reload apache2
    ok "Apache reload OK"
else
    err "apache2ctl configtest FAILED:"
    sudo apache2ctl configtest
    exit 1
fi

# ── 8) SearXNG-Container starten ───────────────────────────────────
echo
hr
say "8) SearXNG-Container starten (auf $SEARXNG_HOST_PORT)"

$DSUDO docker compose -f "$COMPOSE_FILE" pull searxng
$DSUDO docker compose -f "$COMPOSE_FILE" up -d searxng

sleep 3
$DSUDO docker compose -f "$COMPOSE_FILE" ps searxng

# Warten bis der Container Anfragen bedient
for i in $(seq 1 10); do
    if curl -fsS --max-time 3 "http://$SEARXNG_HOST_PORT/" -o /dev/null 2>/dev/null; then
        ok "searxng intern erreichbar"
        break
    fi
    sleep 2
done

# ── 8b) Glappa-App-Container (YT-Downloader) neu bauen + starten ────
echo
hr
say "8b) Glappa-App neu bauen + starten (home.glappa.de:8080)"

# WICHTIG: Der App-Code wird per 'COPY . /app/glappa-site/' fest ins Image
# gebacken (siehe _docker/Dockerfile). Ein 'git pull' (Step 0) allein reicht
# darum NICHT — ohne Neubau laeuft weiter der alte Stand im Container.
# --build erzwingt den Image-Neubau; Docker invalidiert den COPY-Layer
# automatisch, sobald sich Dateien geaendert haben.
#
# Vorher Port 8080 ZUVERLAESSIG freiraeumen, sonst scheitert 'up' an
# "bind: address already in use" und der alte Stand laeuft einfach weiter.
# Drei moegliche Blockierer werden abgeraeumt:
#   a) der per Name bekannte 'glappa'-Container,
#   b) ein anders benannter Alt-Container, der Host-Port 8080 veroeffentlicht
#      (frueheres Compose-Projekt / manuelles 'docker run'),
#   c) ein Nicht-Docker-Hostprozess auf 8080 (z.B. der alte
#      youtube-downloader.service / ein direkt gestartetes app.py),
#      den 'docker rm' NICHT erwischt.
say "Port 8080 freiraeumen (alten Container/Prozess beenden)…"

# a) bekannter Container
$DSUDO docker rm -f glappa >/dev/null 2>&1 || true

# b) jeder laufende Container, der Host-Port 8080 publisht
PORT_HOGS="$($DSUDO docker ps -q --filter "publish=8080" 2>/dev/null || true)"
if [ -n "$PORT_HOGS" ]; then
    warn "Weitere Container belegen Port 8080 — werden entfernt:"
    $DSUDO docker ps --filter "publish=8080" --format '   - {{.Names}} ({{.Image}})' || true
    $DSUDO docker rm -f $PORT_HOGS >/dev/null 2>&1 || true
fi

# c) Nicht-Docker-Hostprozess auf 8080 (ss bevorzugt, fuser als Fallback)
HOST_PIDS="$(sudo ss -ltnHp "sport = :8080" 2>/dev/null \
              | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u | tr '\n' ' ' || true)"
if [ -z "${HOST_PIDS// /}" ] && command -v fuser >/dev/null 2>&1; then
    HOST_PIDS="$(sudo fuser 8080/tcp 2>/dev/null \
                  | tr -s ' ' '\n' | grep -E '^[0-9]+$' | tr '\n' ' ' || true)"
fi
if [ -n "${HOST_PIDS// /}" ]; then
    warn "Host-Prozess(e) belegen Port 8080 (PID:${HOST_PIDS}) — werden beendet"
    # Falls es der alte systemd-Dienst ist: sauber stoppen + deaktivieren.
    for svc in youtube-downloader glappa-downloader glappa-app glappa; do
        if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
            sudo systemctl disable --now "$svc" >/dev/null 2>&1 || true
            warn "systemd-Dienst '$svc' gestoppt + deaktiviert"
        fi
    done
    # Was dann noch haengt, hart beenden.
    sudo kill $HOST_PIDS >/dev/null 2>&1 || true
    sleep 1
    sudo kill -9 $HOST_PIDS >/dev/null 2>&1 || true
fi
ok "Port 8080 frei"

$DSUDO docker compose -f "$COMPOSE_FILE" up -d --build glappa
ok "glappa-Container neu gebaut + gestartet"

# Alte, jetzt unbenutzte (dangling) Images aufraeumen -> gibt Disk frei.
# Fasst nur ungetaggte Layer an, nichts Laufendes.
$DSUDO docker image prune -f >/dev/null 2>&1 || true

sleep 3
$DSUDO docker compose -f "$COMPOSE_FILE" ps glappa

# Warten bis die App lokal antwortet. -k: das Cert ist fuer home.glappa.de
# ausgestellt, nicht fuer 127.0.0.1 -> Zertifikatspruefung ueberspringen.
# Fallback auf http, falls der Container (dev) ohne SSL hochkam.
for i in $(seq 1 10); do
    if curl -fsSk --max-time 3 "https://127.0.0.1:8080/" -o /dev/null 2>/dev/null \
       || curl -fsS  --max-time 3 "http://127.0.0.1:8080/"  -o /dev/null 2>/dev/null; then
        ok "glappa-App intern erreichbar"
        break
    fi
    sleep 2
done

# ── 9) Verify ──────────────────────────────────────────────────────
echo
hr
say "9) Verify"

if curl -fsS --max-time 8 "http://$SEARXNG_HOST_PORT/" -o /dev/null; then
    ok "Intern:   http://$SEARXNG_HOST_PORT/  →  200"
else
    err "Intern: searxng auf $SEARXNG_HOST_PORT antwortet nicht"
fi

if curl -fsS --max-time 8 "https://$DOMAIN/" -o /dev/null; then
    ok "Extern:   https://$DOMAIN/  →  200"
else
    warn "Extern: https://$DOMAIN antwortet noch nicht — Apache-Logs anschauen:"
    warn "  sudo tail -f /var/log/apache2/$DOMAIN-error.log"
fi

if curl -fsSk --max-time 8 "https://127.0.0.1:8080/" -o /dev/null 2>/dev/null \
   || curl -fsS --max-time 8 "http://127.0.0.1:8080/" -o /dev/null 2>/dev/null; then
    ok "App:      home.glappa.de:8080  →  200"
else
    warn "App: home.glappa.de:8080 antwortet nicht — Logs anschauen:"
    warn "  $DSUDO docker compose -f $COMPOSE_FILE logs --tail=50 glappa"
fi

# certbot-renewal cron pruefen (certbot installiert die selbst)
echo
if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
    ok "certbot-renewal Timer aktiv (Letsencrypt erneuert sich automatisch)"
fi

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "  ${G}${B}Fertig.${X}"
echo
echo "  Search-URL:        https://$DOMAIN/"
echo "  App-URL:           https://home.glappa.de:8080/  (YT-Downloader)"
echo "  SearXNG-Container: $SEARXNG_HOST_PORT (intern, nur localhost)"
echo "  Apache vhost:      /etc/apache2/sites-available/search.glappa.de.conf"
echo "  Cert:              /etc/letsencrypt/live/$DOMAIN/"
echo
echo "  Status:            bash setup-search-apache.sh --status"
echo "  App neu bauen:     $DSUDO docker compose -f $COMPOSE_FILE up -d --build glappa"
echo "  App logs:          $DSUDO docker compose -f $COMPOSE_FILE logs -f glappa"
echo "  Apache reload:     sudo systemctl reload apache2"
echo "  Apache logs:       sudo tail -f /var/log/apache2/$DOMAIN-error.log"
echo "  SearXNG logs:      $DSUDO docker compose -f $COMPOSE_FILE logs -f searxng"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
