#!/usr/bin/env bash
#
# setup-search-apache.sh — search.glappa.de hinter Apache als Reverse-Proxy.
#
# Architektur:
#   Apache (auf :80/:443) ── Reverse-Proxy ──► SearXNG (127.0.0.1:8888 Container)
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
    echo "SearXNG (Docker):"
    $DSUDO docker compose -f "$COMPOSE_FILE" ps searxng 2>/dev/null || true
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

# Statisches Asset-Verzeichnis fuer glappa-style.css (90er Override)
sudo mkdir -p /var/www/search-static
if [ -f "$PROJECT/searxng-static/glappa-style.css" ]; then
    sudo cp "$PROJECT/searxng-static/glappa-style.css" /var/www/search-static/
    sudo chown -R www-data:www-data /var/www/search-static
    ok "glappa-style.css nach /var/www/search-static/ deployed"
fi

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

# certbot-renewal cron pruefen (certbot installiert die selbst)
echo
if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
    ok "certbot-renewal Timer aktiv (Letsencrypt erneuert sich automatisch)"
fi

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "  ${G}${B}Fertig.${X}"
echo
echo "  URL:               https://$DOMAIN/"
echo "  SearXNG-Container: $SEARXNG_HOST_PORT (intern, nur localhost)"
echo "  Apache vhost:      /etc/apache2/sites-available/search.glappa.de.conf"
echo "  Cert:              /etc/letsencrypt/live/$DOMAIN/"
echo
echo "  Status:            bash setup-search-apache.sh --status"
echo "  Apache reload:     sudo systemctl reload apache2"
echo "  Apache logs:       sudo tail -f /var/log/apache2/$DOMAIN-error.log"
echo "  SearXNG logs:      docker compose -f $COMPOSE_FILE logs -f searxng"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
