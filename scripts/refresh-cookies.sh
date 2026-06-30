#!/usr/bin/env bash
#
# refresh-cookies.sh — frische Firefox-Cookies fuer den Downloader extrahieren.
#
# Nutze das, wenn der Downloader plotzlich "YouTube Bot-Check" wirft:
#   bash scripts/refresh-cookies.sh
#
# Liest Cookies aus dem aktiven Firefox-Profil, schreibt nur die YouTube/Google
# Cookies als Netscape-Datei nach ./cookies/youtube.txt. Sync zu WSL passiert
# automatisch falls /mnt/c verfuegbar ist.

set -euo pipefail
# Liegt in scripts/ — eine Ebene hoch ins Projekt-Root (cookies/ liegt dort)
cd "$(dirname "$(readlink -f "$0")")/.."

if ! python -c "import yt_dlp" 2>/dev/null; then
    echo "yt-dlp fehlt: pip install yt-dlp" >&2
    exit 1
fi

mkdir -p cookies
PYTHONIOENCODING=utf-8 python - <<'PY'
from yt_dlp.cookies import extract_cookies_from_browser
class L:
    def debug(self,*a,**k):pass
    def info(self,*a,**k):pass
    def warning(self,*a,**k):pass
    def error(self,*a,**k):pass

jar = extract_cookies_from_browser('firefox', logger=L())
keep, drop = [], 0
for c in jar:
    d = (c.domain or '').lstrip('.')
    if 'youtube.com' in d or 'google.com' in d or 'googlevideo.com' in d:
        keep.append(c)
    else:
        drop += 1

jar._cookies = {}
for c in keep: jar.set_cookie(c)

out = 'cookies/youtube.txt'
jar.save(out, ignore_discard=True, ignore_expires=True)
import os
print(f'OK - {len(keep)} Cookies (youtube/google) -> {out} ({os.path.getsize(out)} bytes)')
PY

# Auto-sync nach WSL wenn das passt
if grep -qi microsoft /proc/version 2>/dev/null; then
    : # wir laufen in WSL, kein Sync noetig
elif command -v wsl.exe >/dev/null 2>&1 || command -v wsl >/dev/null 2>&1; then
    echo "→ sync nach WSL ~/glappa-site/cookies/ ..."
    wsl -d Ubuntu -e bash -c "cp /mnt/c/Users/Prieb/glappa-site/cookies/youtube.txt ~/glappa-site/cookies/ && echo '  ✓ synced'"
fi

echo "Fertig. yt-dlp im Container greift die neue Datei sofort beim naechsten Request."
