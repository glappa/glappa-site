#!/usr/bin/env bash
#
# auto-refresh-cookies.sh — laeuft im WSL-Cron, liest Cookies direkt aus
# dem Windows-Firefox-Profil und legt sie ins ~/glappa-site/cookies/.
# Voraussetzung: Firefox darf zu, muss nicht laufen (sqlite-db wird gelesen).
#
# Cron-Aufruf alle 6h (via deploy/cron-Setup):
#   0 */6 * * * bash /home/glappa/glappa-site/scripts/auto-refresh-cookies.sh >> /tmp/cookie-refresh.log 2>&1

set -e
# Liegt in scripts/ — eine Ebene hoch ins Projekt-Root (cookies/ liegt dort)
cd "$(dirname "$(readlink -f "$0")")/.."

# Aktives Firefox-Profil suchen (jenes mit der neuesten cookies.sqlite mtime)
PROFILE_DIR=$(ls -dt /mnt/c/Users/Prieb/AppData/Roaming/Mozilla/Firefox/Profiles/*.default-release 2>/dev/null | head -1)
if [ -z "$PROFILE_DIR" ]; then
    # Fallback: irgendein Profil mit cookies.sqlite, neueste mtime
    PROFILE_DIR=$(ls -dt /mnt/c/Users/Prieb/AppData/Roaming/Mozilla/Firefox/Profiles/*/ 2>/dev/null | \
                  while read -r d; do
                    [ -f "$d/cookies.sqlite" ] && echo "$(stat -c %Y "$d/cookies.sqlite") $d"
                  done | sort -rn | head -1 | awk '{print $2}')
fi

if [ -z "$PROFILE_DIR" ] || [ ! -f "$PROFILE_DIR/cookies.sqlite" ]; then
    echo "[$(date)] FEHLER: kein Firefox-Profil mit cookies.sqlite gefunden" >&2
    exit 1
fi

mkdir -p cookies
PYTHONIOENCODING=utf-8 python3 - "$PROFILE_DIR" <<'PY'
import sys, os
from yt_dlp.cookies import extract_cookies_from_browser

class L:
    def debug(self,*a,**k): pass
    def info(self,*a,**k): pass
    def warning(self,*a,**k): pass
    def error(self,*a,**k): pass

profile = sys.argv[1]
jar = extract_cookies_from_browser('firefox', profile=profile, logger=L())

keep = [c for c in jar
        if any(d in (c.domain or '').lstrip('.')
               for d in ('youtube.com','google.com','googlevideo.com'))]
jar._cookies = {}
for c in keep: jar.set_cookie(c)

out = 'cookies/youtube.txt'
jar.save(out, ignore_discard=True, ignore_expires=True)
print(f"[{__import__('datetime').datetime.now():%Y-%m-%d %H:%M:%S}] "
      f"refreshed {len(keep)} cookies -> {out} ({os.path.getsize(out)} bytes)")
PY
