#!/usr/bin/env bash
#
# setup-home-apache.sh — home.glappa.de:443 von Apache direkt aus
# ~/glappa-site/ servieren lassen.
#
# Aufruf (auf dem VPS):
#   cd ~/glappa-site && git pull && bash _docker/setup-home-apache.sh
#
# Macht idempotent:
#   1) Pre-flight (Apache da, Repo da, Cert da)
#   2) Permissions: www-data muss /home/glappa/glappa-site lesen koennen
#      (per ACL falls verfuegbar, sonst chmod o+rX)
#   3) Alte home.glappa.de vhosts disablen + backuppen
#   4) Neuen vhost installieren (DocumentRoot=~/glappa-site)
#   5) Apache configtest + reload
#   6) Verify
#
# Danach reicht `git pull origin main` auf dem VPS um die Site zu deployen.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
PROJECT="$(pwd)"
SITE_ROOT="$(cd .. && pwd)"   # = ~/glappa-site
DOMAIN="home.glappa.de"
VHOST_NAME="home.glappa.de.conf"
APACHE_USER="www-data"

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

# ── 1) Pre-flight ──────────────────────────────────────────────
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
say "Aktiviere Module: ssl headers rewrite expires"
sudo a2enmod ssl headers rewrite expires >/dev/null
ok "Module aktiv"

# ── 6) configtest + reload ──────────────────────────────────────
echo
hr
say "6) Apache config test + reload"

if sudo apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
    sudo systemctl reload apache2
    ok "Apache reloaded"
else
    err "Apache configtest FAILED:"
    sudo apache2ctl configtest
    exit 1
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

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "  ${G}${B}Fertig.${X}"
echo
echo "  https://$DOMAIN/        → ~/glappa-site/index.html (statisch)"
echo "  https://$DOMAIN:8080/   → unangetastet (Flask app.py / YouTube)"
echo
echo "  Deploy ab jetzt:   cd ~/glappa-site && git pull origin main"
echo "                     (kein zusaetzlicher Sync noetig)"
echo
echo "  Backup alter Configs:  $BACKUP_DIR/"
echo "  Logs:                  sudo tail -f /var/log/apache2/$DOMAIN-error.log"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
