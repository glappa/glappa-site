#!/usr/bin/env python3
"""
Container-Healthcheck fuer app.py (Downloader auf :8080).

Wird vom HEALTHCHECK in _docker/docker-compose.vps.yml aufgerufen und
entscheidet, ob Docker den Container als "healthy" fuehrt. Der Host-
Watchdog (_docker/glappa-watchdog.sh) liest genau diesen Status mit.

Bewusst ohne Fremd-Bibliothek (kein curl/requests im Image noetig) und
bewusst gegen /healthz statt gegen / — die Startseite rendert ein
Template und faerbt einen Haenger im Server erst spaeter ein.

HTTPS zuerst (so laeuft es auf dem VPS mit den Letsencrypt-Certs),
danach HTTP: fehlen die Certs, faellt app.py in den Plain-Modus zurueck,
und dann soll der Healthcheck NICHT dauerhaft rot stehen — sonst startet
der Watchdog einen laufenden Dienst im Kreis neu.

Exit 0 = gesund, Exit 1 = nicht gesund.
"""
import json
import os
import ssl
import sys
import urllib.request

PORT    = os.environ.get('DOWNLOADER_PORT', '8080')
TIMEOUT = float(os.environ.get('HEALTHCHECK_TIMEOUT', '8'))

# Cert lautet auf home.glappa.de, angefragt wird 127.0.0.1 -> Pruefung aus.
# Das ist hier unbedenklich: die Verbindung verlaesst den Container nicht.
_CTX = ssl._create_unverified_context()


def probe(url: str):
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT, context=_CTX) as r:
            return r.status, r.read(4096)
    except Exception as e:
        return None, f'{type(e).__name__}: {e}'


for scheme in ('https', 'http'):
    status, body = probe(f'{scheme}://127.0.0.1:{PORT}/healthz')
    if status == 200:
        # Threadzahl mitloggen: `docker inspect` hebt die letzten
        # Healthcheck-Ausgaben auf, damit sieht man im Nachhinein, ob vor
        # einem Ausfall die Threads weggelaufen sind.
        try:
            d = json.loads(body)
            print(f"ok threads={d.get('threads')} jobs={d.get('jobs')} "
                  f"lock={d.get('jobs_lock')} uptime={d.get('uptime')}")
        except Exception:
            print('ok')
        sys.exit(0)
    print(f'{scheme}: {status or body}')

sys.exit(1)
