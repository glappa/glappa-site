#!/usr/bin/env bash
#
# deploy-from-github.sh — Pull glappa-site vom GitHub-Repo und Container neu bauen.
#
# Wird auf der VPS ausgeführt. Idempotent: erste Ausführung klont das Repo,
# weitere fetchen und resetten hart auf origin/main.
#
# Aufruf direkt (User auf der VPS):
#   curl -sL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/deploy-from-github.sh | bash
#
# Aufruf via SSH (von lokal aus):
#   ssh glappa@45.142.115.252 'curl -sL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/deploy-from-github.sh | bash'

set -euo pipefail

REPO_URL="https://github.com/glappa/glappa-site.git"
DIR="$HOME/glappa-site"
COMPOSE_FILE="docker-compose.vps.yml"
BRANCH="main"

G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

echo
echo -e "${B}=== Glappa Deploy-from-GitHub ===${X}"
echo "Repo:   $REPO_URL ($BRANCH)"
echo "Ziel:   $DIR"
echo "Host:   $(hostname)"
echo

# ── 1) Sanity: git + docker vorhanden? ──────────────────────────────
for cmd in git docker; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "$cmd ist nicht installiert. Bitte erst nachholen."
        exit 1
    fi
done

# ── 2) Repo klonen oder hard-sync auf origin/$BRANCH ────────────────
if [ -d "$DIR/.git" ]; then
    say "Repo da, fetch + hard-reset auf origin/$BRANCH..."
    cd "$DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
    git clean -fd -e 'cookies' -e '_docker/cookies'  # nichts antasten was lokal mounted ist
else
    say "Klone $REPO_URL -> $DIR..."
    git clone --branch "$BRANCH" "$REPO_URL" "$DIR"
    cd "$DIR"
fi
ok "Repo auf Stand: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# ── 3) Cookies-Hinweis (für YT-Downloader) ──────────────────────────
COOKIE_FILE="$DIR/_docker/cookies/youtube.txt"
mkdir -p "$DIR/_docker/cookies"
if [ ! -s "$COOKIE_FILE" ]; then
    warn "Keine YouTube-Cookies unter _docker/cookies/youtube.txt — YT-Bot-Check"
    warn "kann zuschlagen. Hochladen z.B. per:"
    warn "  scp youtube.txt glappa@$(hostname -I | awk '{print $1}'):$COOKIE_FILE"
else
    ok "Cookies vorhanden: $COOKIE_FILE"
fi

# ── 4) Container bauen + starten ────────────────────────────────────
cd "$DIR/_docker"
chmod +x restart.sh vps-deploy.sh logs.sh 2>/dev/null || true

SUDO=""
if ! docker ps >/dev/null 2>&1; then SUDO="sudo"; fi

say "Container bauen + starten (Build kann 2-5 Min dauern beim ersten Mal)..."
$SUDO docker compose -f "$COMPOSE_FILE" up -d --build

# ── 5) Verify ───────────────────────────────────────────────────────
sleep 4
echo
$SUDO docker compose -f "$COMPOSE_FILE" ps
echo

say "Schneller Erreichbarkeits-Test..."
if curl -ksI --max-time 5 "https://127.0.0.1:8080/" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
    ok "HTTPS auf :8080 antwortet."
elif curl -sI --max-time 5 "http://127.0.0.1:8080/" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
    ok "HTTP auf :8080 antwortet (kein SSL — Letsencrypt-Certs fehlen)."
else
    warn "Noch keine Antwort auf :8080. Logs anschauen:"
    warn "  $SUDO docker compose -f $DIR/_docker/$COMPOSE_FILE logs -f"
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo -e "  ${G}${B}Deploy fertig.${X}"
echo
echo "  Container-Status:  $SUDO docker compose -f $DIR/_docker/$COMPOSE_FILE ps"
echo "  Logs streamen:     $SUDO docker compose -f $DIR/_docker/$COMPOSE_FILE logs -f"
echo "  Restart:           $SUDO docker compose -f $DIR/_docker/$COMPOSE_FILE restart"
echo
echo "  Nochmal pullen + rebuild:"
echo "    curl -sL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/deploy-from-github.sh | bash"
echo "═══════════════════════════════════════════════════════════"
