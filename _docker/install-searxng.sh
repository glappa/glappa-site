#!/usr/bin/env bash
#
# install-searxng.sh — One-Liner-Installer fuer search.glappa.de auf einem VPS.
#
# Holt sich das Repo selbst von GitHub, ruft dann vps-search-setup.sh
# (das den eigentlichen Setup-Workflow macht).
#
# Aufruf direkt vom VPS:
#   curl -fsSL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/install-searxng.sh | bash
#
# Oder als Datei:
#   wget https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/install-searxng.sh
#   bash install-searxng.sh
#
# Macht idempotent:
#   1) Installiert git, curl, openssl falls fehlen
#   2) Klont Repo nach ~/glappa-site/ (oder pullt main wenn schon da)
#   3) Ruft _docker/vps-search-setup.sh auf (Docker, UFW, Caddy, SearXNG)

set -euo pipefail

REPO_URL="https://github.com/glappa/glappa-site.git"
REPO_BRANCH="main"
TARGET="$HOME/glappa-site"

# ── Farben ──────────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

echo
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo -e "${B}  Glappa Search — One-Liner Installer${X}"
echo -e "${B}════════════════════════════════════════════════════════════${X}"
echo "  Repo:    $REPO_URL  (branch: $REPO_BRANCH)"
echo "  Target:  $TARGET"
echo "  Host:    $(hostname) ($(uname -srm))"
echo

# ── 0) Sanity: nicht als root laufen ────────────────────────────────
if [ "$(id -u)" = "0" ]; then
    err "Bitte NICHT als root laufen lassen — Docker-Volumes und ~/glappa-site"
    err "wuerden dann root gehoeren. Stattdessen als normaler User mit sudo-Rechten:"
    err "  curl ... | bash      (als User, nicht root)"
    exit 1
fi

# ── 1) Basis-Tools ──────────────────────────────────────────────────
say "1) Basis-Tools (git, curl, openssl)"

NEED_PKGS=()
command -v git     >/dev/null 2>&1 || NEED_PKGS+=(git)
command -v curl    >/dev/null 2>&1 || NEED_PKGS+=(curl)
command -v openssl >/dev/null 2>&1 || NEED_PKGS+=(openssl)

if [ ${#NEED_PKGS[@]} -gt 0 ]; then
    say "Installiere: ${NEED_PKGS[*]}"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq
        sudo apt-get install -y "${NEED_PKGS[@]}"
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y "${NEED_PKGS[@]}"
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y "${NEED_PKGS[@]}"
    else
        err "Kein bekannter Package-Manager (apt/dnf/yum). Bitte manuell installieren: ${NEED_PKGS[*]}"
        exit 1
    fi
fi
ok "git, curl, openssl da."

# ── 2) Repo klonen oder pullen ──────────────────────────────────────
say "2) Repo holen"

if [ -d "$TARGET/.git" ]; then
    cd "$TARGET"
    REMOTE_URL="$(git config --get remote.origin.url || echo '')"
    if [ "$REMOTE_URL" != "$REPO_URL" ]; then
        warn "Vorhandenes Repo in $TARGET zeigt auf '$REMOTE_URL' (statt $REPO_URL)."
        warn "Setze remote.origin.url um."
        git remote set-url origin "$REPO_URL"
    fi

    # Lokale Mods? Wir wollen pullen ohne was kaputt zu machen.
    if ! git diff --quiet || ! git diff --cached --quiet; then
        TS="$(date +%Y%m%d-%H%M%S)"
        warn "Lokale Aenderungen erkannt — werden in branch backup-$TS gestasht."
        git stash push -u -m "install-searxng.sh auto-stash $TS" || true
    fi

    say "git fetch + checkout $REPO_BRANCH"
    git fetch origin "$REPO_BRANCH"
    git checkout "$REPO_BRANCH"
    git reset --hard "origin/$REPO_BRANCH"
    ok "Repo aktualisiert auf $(git rev-parse --short HEAD)"
else
    if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
        err "$TARGET existiert und ist nicht leer und kein git-Repo."
        err "Entweder $TARGET wegmachen, oder install-searxng.sh manuell von dort starten."
        exit 1
    fi
    say "git clone $REPO_URL"
    git clone --branch "$REPO_BRANCH" "$REPO_URL" "$TARGET"
    cd "$TARGET"
    ok "Repo geklont nach $TARGET ($(git rev-parse --short HEAD))"
fi

# ── 3) Setup-Script aufrufen ────────────────────────────────────────
SETUP="$TARGET/_docker/vps-search-setup.sh"
if [ ! -f "$SETUP" ]; then
    err "$SETUP fehlt im Repo. Branch $REPO_BRANCH unvollstaendig?"
    exit 1
fi

chmod +x "$SETUP"

echo
echo -e "${B}────────────────────────────────────────────────────────────${X}"
echo -e "${B}  Uebergebe an vps-search-setup.sh...${X}"
echo -e "${B}────────────────────────────────────────────────────────────${X}"
echo

bash "$SETUP"
