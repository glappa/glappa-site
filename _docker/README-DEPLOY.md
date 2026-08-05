# Glappa.de Deployment

Ein Container, zwei Dienste: **nginx** liefert die statische Seite auf `:80`, **gunicorn + Flask** läuft die YouTube-Downloader-App auf `:8090`. Beides wird von `supervisord` am Leben gehalten, `tini` ist PID 1.

## Lokal starten (Docker)

```bash
# im glappa-site/ Ordner
docker compose up -d --build
```

Dann:
- Statische Seite: <http://localhost:8099/>
- Downloader-App:  <http://localhost:8090/>

Stoppen:
```bash
docker compose down
```

Logs:
```bash
docker compose logs -f
```

## Lokal ohne Docker (Dev)

```bash
pip install -r requirements.txt
# ffmpeg muss auf dem PATH sein (Windows: winget install Gyan.FFmpeg)

# statische Seite (Python http.server)
python -m http.server 8099 --directory .

# in zweitem Terminal die App
python home/app.py
```

Die App erkennt automatisch, ob die Letsencrypt-Certs vorhanden sind:
- Mit Certs → HTTPS auf `:8080` (Production)
- Ohne Certs → Plain HTTP auf `:8090` (Dev / Container)

Env-Overrides: `DOWNLOADER_HOST`, `DOWNLOADER_PORT`, `DOWNLOAD_DIR`.

## Production auf einem VPS

```bash
git clone … && cd glappa-site
docker compose up -d --build
```

Davor brauchst du einen Reverse-Proxy (Caddy oder Traefik), der:
- `glappa.de` → `localhost:8099`
- `home.glappa.de` → `localhost:8090`

routet und TLS terminiert.

### Caddy-Beispiel (`/etc/caddy/Caddyfile`)
```
glappa.de {
    reverse_proxy localhost:8099
}

home.glappa.de {
    reverse_proxy localhost:8090
}
```

Caddy holt die Letsencrypt-Certs automatisch. Die in `app.py` eingebaute SSL-Logik kann dann aus bleiben (sie greift sowieso nur, wenn die Cert-Pfade existieren).

## Was im Container drin ist

- `python:3.12-slim`
- `ffmpeg` (für moviepy MP3-Konvertierung)
- `nginx`, `supervisord`, `tini`
- Python: flask, pytubefix, moviepy, gunicorn (pinned in `requirements.txt`)
- Volume `glappa-downloads` → `/downloads` (überlebt Restarts)

## Updates

Code ändern → `docker compose up -d --build`. Das Layer-Caching auf `requirements.txt` sorgt dafür, dass Python-Deps nur neu installiert werden, wenn sich die Datei ändert.

## Damit `:8080` erreichbar bleibt (Watchdog)

`restart: always` allein reicht nicht: Docker startet nur neu, wenn der
**Prozess stirbt**. Der Ausfall, den man im Browser als *„The connection has
timed out"* sieht, ist meist der stille — Container läuft, Port ist gebunden,
nur der Python-Server nimmt nichts mehr an. Für Docker ist dann alles in
Ordnung. Deshalb hängen drei Schichten ineinander:

| Schicht | Wo | Merkt was | Reaktion |
|---|---|---|---|
| 1. Selbstheilung | `home/app.py` (`_selfheal_loop`) | Server antwortet sich alle 30 s selbst nicht mehr (3×) oder die Threadzahl läuft weg | Prozess beendet sich → Docker startet neu (~5 s) |
| 2. Healthcheck | `home/healthcheck.py`, im Compose | `/healthz` antwortet nicht | Container wird `unhealthy` (sichtbar in `docker ps`) |
| 3. Watchdog | `_docker/glappa-watchdog.sh` (systemd-Timer, jede Minute) | Container weg, Docker weg, Port-Weiterleitung kaputt, Server neu gebootet | 2× Fehler → `docker restart`, 4× → `force-recreate`, 6×+ → ganzer Stack + ALARM ins Log |

Eingerichtet wird Schicht 3 automatisch von `restart.sh` auf dem VPS
(`ensure_watchdog`, idempotent) — abschaltbar mit `--no-watchdog`.

```bash
# Nachsehen, wie es dem Dienst geht
sudo bash _docker/glappa-watchdog.sh --status

# Watchdog-Protokoll (wer hat wann warum neu gestartet)
sudo bash _docker/glappa-watchdog.sh --log
sudo systemctl status glappa-watchdog.timer
```

**Vor** jedem Eingriff schreibt der Watchdog eine Diagnose ins Log
(`/var/log/glappa-watchdog.log`): Container-Status, ExitCode, `OOMKilled`,
RestartCount, freier Speicher, OOM-Killer-Meldungen aus `dmesg` und die
letzten Container-Logzeilen. Genau die Spuren wischt ein Neustart sonst weg —
nach dem nächsten Ausfall steht dort, **warum** der Dienst weg war.

Der Puls-Endpunkt selbst ist aufrufbar und verrät den inneren Zustand:

```bash
curl -sk https://home.glappa.de:8080/healthz
# {"ok":true,"uptime":8134.2,"threads":11,"jobs":3,"jobs_lock":"free"}
```

Steigt `threads` über Tage in die Hunderte, leckt etwas Verbindungen —
`SELFHEAL_THREADS_WARN` (Default 250) schreibt dann eine Warnung ins
Container-Log, bei `SELFHEAL_THREADS_MAX` (600) startet der Dienst sich neu.

## Hinweis zum YOUTUBE-MP3-Link

Die Home-Seite (`home/index.html`) hat eine kleine Hostname-Erkennung:
- `localhost` / `127.0.0.1` / Private IPs → Link zeigt auf `http://<host>:8090/`
- alles andere → Link zeigt auf `https://home.glappa.de:8080`

Wenn du auf einer dritten Domain deployst, passe das IIFE am Ende von `home/index.html` an.
