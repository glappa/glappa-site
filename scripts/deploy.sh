#!/usr/bin/env bash
#
# deploy.sh — Universelles Setup+Deploy fuer glappa-site.
#
# Funktioniert auf:
#   - WSL2 Ubuntu (mit oder ohne systemd)
#   - Bare-Metal Ubuntu/Debian VPS
#
# Was es macht (idempotent, kann mehrfach laufen):
#   1) Installiert docker.io + docker-compose-v2 falls nicht da
#   2) Aktiviert systemd in WSL falls noetig (einmaliger Restart)
#   3) Startet Docker-Daemon
#   4) Fuegt aktuellen User zur docker-Gruppe hinzu
#   5) Baut und startet den Container (docker compose up -d --build)
#   6) Wartet auf Healthcheck, druckt Status + URLs
#
# Aufruf:   bash scripts/deploy.sh
# Update:   bash scripts/deploy.sh        (laeuft einfach nochmal durch)
# Stop:     docker compose down           (im Projektordner)

set -euo pipefail

# Liegt in scripts/ — eine Ebene hoch ins Projekt-Root (Dockerfile, compose ...)
cd "$(dirname "$(readlink -f "$0")")/.."
PROJECT_DIR="$(pwd)"

# ── Helpers ──────────────────────────────────────────────────────
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; C='\033[1;36m'; B='\033[1m'; X='\033[0m'
say()  { echo -e "${C}→${X} $*"; }
ok()   { echo -e "${G}✓${X} $*"; }
warn() { echo -e "${Y}⚠${X} $*"; }
err()  { echo -e "${R}✗${X} $*" >&2; }

echo
echo -e "${B}=== Glappa-Site Deploy ===${X}"
echo "Projekt: $PROJECT_DIR"
echo "Host:    $(hostname) ($(uname -srm))"
echo

# ── 1) OS-Check ─────────────────────────────────────────────────
if ! command -v apt-get >/dev/null 2>&1; then
    err "Dieses Skript erwartet ein apt-basiertes System (Ubuntu/Debian)."
    err "Manueller Build: 'docker compose up -d --build'"
    exit 1
fi

IS_WSL=0
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=1
    ok "Erkannt: WSL2 ($(grep -ohi 'microsoft.*' /proc/version | head -1))"
else
    ok "Erkannt: native Linux"
fi

# ── 2) Docker installieren falls noetig ─────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    say "Installiere Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y docker.io docker-compose-v2
    ok "Docker installiert."
else
    ok "Docker bereits installiert ($(docker --version))"
fi

# Compose-Plugin sicherstellen
if ! docker compose version >/dev/null 2>&1; then
    say "Installiere Compose-Plugin (v2)..."
    sudo apt-get update -qq
    sudo apt-get install -y docker-compose-v2 || sudo apt-get install -y docker-compose-plugin
fi
ok "Compose-Plugin: $(docker compose version 2>&1 | head -1)"

# Alte kaputte v1 entsorgen (urllib3-Bug)
if command -v docker-compose >/dev/null 2>&1; then
    warn "Alte 'docker-compose' v1 erkannt (urllib3-Bug). Entferne..."
    sudo apt-get remove -y docker-compose 2>/dev/null || true
fi

# ── 3) systemd-Check (WSL2 ggf. aktivieren) ─────────────────────
if ! pidof systemd >/dev/null 2>&1; then
    if [ "$IS_WSL" = "1" ]; then
        warn "WSL2 hat noch kein systemd aktiv."
        NEED_WRITE=1
        if [ -f /etc/wsl.conf ] && grep -q '^\s*systemd\s*=\s*true' /etc/wsl.conf; then
            NEED_WRITE=0
        fi
        if [ "$NEED_WRITE" = "1" ]; then
            say "Schreibe systemd=true nach /etc/wsl.conf..."
            sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
            ok "/etc/wsl.conf gesetzt."
        fi
        echo
        echo "═══════════════════════════════════════════════════════════"
        echo -e "  ${B}WSL muss EINMAL neu gestartet werden:${X}"
        echo "    1) exit                       # raus aus diesem Terminal"
        echo "    2) (Windows PowerShell)  wsl --shutdown"
        echo "    3) wsl wieder starten und:    bash scripts/deploy.sh"
        echo "═══════════════════════════════════════════════════════════"
        exit 0
    else
        err "systemd laeuft nicht und das ist kein WSL."
        err "Auf einem normalen Server sollte systemd laufen. Bitte manuell starten."
        exit 1
    fi
fi
ok "systemd laeuft (PID $(pidof systemd))"

# ── 4) Docker-Daemon aktivieren (nur wenn noch nicht aktiv) ──────
if systemctl is-active --quiet docker 2>/dev/null; then
    ok "Docker-Daemon laeuft schon."
else
    say "Aktiviere Docker-Daemon (braucht sudo)..."
    sudo systemctl enable --now docker
    ok "Docker-Daemon aktiv."
fi

# ── 5) User in docker-Gruppe ─────────────────────────────────────
SUDO=""
if ! id -nG "$USER" | tr ' ' '\n' | grep -qw docker; then
    say "Fuege '$USER' zur docker-Gruppe hinzu..."
    sudo usermod -aG docker "$USER"
    warn "Gruppenmitgliedschaft greift erst nach Logout+Login."
    warn "Fuer diesen Run benutzen wir sudo fuer docker-Befehle."
    SUDO="sudo"
else
    ok "User '$USER' ist in der docker-Gruppe."
fi

# ── 6) Build & Start ─────────────────────────────────────────────
say "Baue Image und starte Container..."
echo
$SUDO docker compose up -d --build

echo
say "Warte auf Healthcheck..."
for i in $(seq 1 30); do
    STATUS=$($SUDO docker inspect --format '{{.State.Health.Status}}' glappa 2>/dev/null || echo "noch nicht da")
    if [ "$STATUS" = "healthy" ]; then
        ok "Container ist healthy."
        break
    fi
    sleep 2
done

# ── 6b) Port-Konflikt-Check (nur in WSL relevant) ────────────────
# WSL2 forwarded Container-Ports automatisch zu Windows-localhost, ABER nur
# wenn auf Windows-Seite nichts anderes bereits den Port belegt. Falls doch
# (typisch: ein vergessener 'python -m http.server' vom Dev-Test), kollidiert
# es und Firefox sieht "connection refused". Hier ein freundlicher Hinweis.
if [ "$IS_WSL" = "1" ] && command -v powershell.exe >/dev/null 2>&1; then
    for port in 8099 8090; do
        WIN_HOLDER=$(powershell.exe -NoProfile -Command "
            \$c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                  Where-Object { \$_.OwningProcess -ne 0 } | Select-Object -First 1
            if (\$c) {
                \$p = Get-Process -Id \$c.OwningProcess -ErrorAction SilentlyContinue
                if (\$p -and \$p.ProcessName -notlike '*vmmem*' -and \$p.ProcessName -ne 'System') {
                    Write-Host (\"\$(\$p.Id) \$(\$p.ProcessName)\")
                }
            }
        " 2>/dev/null | tr -d '\r' | head -1)
        if [ -n "$WIN_HOLDER" ]; then
            warn "Port $port wird auf Windows von Prozess belegt: $WIN_HOLDER"
            warn "  -> blockiert evtl. den WSL-Container. Falls Firefox nicht connecten kann:"
            warn "     powershell.exe -Command 'Stop-Process -Id <PID> -Force'"
        fi
    done
fi

# ── 7) Status + URLs ─────────────────────────────────────────────
echo
$SUDO docker compose ps
echo

# IP fuer VPS rausfinden (Bind-Address der Public-Schnittstelle)
HOST_IP="localhost"
if [ "$IS_WSL" = "0" ]; then
    EXT=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -n "$EXT" ] && HOST_IP="$EXT"
fi

echo "═══════════════════════════════════════════════════════════"
echo -e "  ${G}${B}Glappa laeuft.${X}"
echo
echo -e "  ${B}Statische Seiten:${X}"
echo "    http://$HOST_IP:8099/                  (Index)"
echo "    http://$HOST_IP:8099/page1.html         (Video)"
echo "    http://$HOST_IP:8099/bounce.html        (Bounce)"
echo "    http://$HOST_IP:8099/secret/pilzskip.html (Secret)"
echo "    http://$HOST_IP:8099/home/              (Home)"
echo
echo -e "  ${B}Downloader-App:${X}"
echo "    http://$HOST_IP:8090/"
echo
echo -e "  ${B}Befehle:${X}"
echo "    Logs:        $SUDO docker compose logs -f"
echo "    Stoppen:     $SUDO docker compose down"
echo "    Update:      bash scripts/deploy.sh    (rebuild + restart)"
echo "═══════════════════════════════════════════════════════════"
