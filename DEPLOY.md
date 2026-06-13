# Webserver-Deploy (Drag & Drop)

Die `glappa-site/`-Struktur **spiegelt 1:1 deinen Webserver** (glappa.de).
Du kannst den kompletten Inhalt von `glappa-site/` direkt per FTP/Filemanager
auf den Webserver hochladen (Drag-and-Drop) — vorhandene Dateien werden
überschrieben.

## Was geht hoch

Alles in `glappa-site/` **außer** dem `_docker/`-Ordner.

```
glappa-site/
├── _docker/         <-- !!! NICHT hochladen — Container-Setup für VPS !!!
├── coursor/         hoch
├── home/            hoch (Heat-Death-Page + cs.mp4)
├── img/             hoch (alle Asset-GIFs)
├── mp3/             hoch
├── mp4/             hoch
├── secret/          hoch (pilzskip.html + Chaos-GIFs)
├── animail1.gif     hoch
├── background.gif   hoch
├── bounce.html      hoch
├── favicon.ico      hoch
├── index.html       hoch
├── microsofthappening.gif  hoch
├── page1.html       hoch
├── pra.gif          hoch
├── script.js        hoch
├── sh.gif           hoch
├── style.css        hoch
├── tboi-isaac.gif   hoch
└── tux_computer_dig_md_clr.gif  hoch
```

## NICHT anfassen auf dem Webserver

Diese Dateien/Ordner sind auf glappa.de und gehören dahin — überschreib sie nicht:

- `.well-known/`         (Letsencrypt)
- `_private/`, `_vti_*`  (FrontPage-Cruft)
- `desktop.ini`
- `internexg3tq4al2si.txt`  (irgendein Verify-Token)
- `test/`

## Workflow im FileZilla / WinSCP / Web-Filemanager

1. Öffne `C:\Users\Prieb\glappa-site\` im File-Explorer
2. Wähle alles aus **außer** `_docker/`  (Strg+A, dann Strg+Klick auf `_docker`)
3. Drag nach `glappa.de/` (Webserver-Root)
4. Confirm Überschreiben

Fertig.

## Was ist `_docker/`?

Das ist der **Container-Stuff** — nur für lokales Entwickeln (WSL) und den
VPS-Deploy (home.glappa.de). Auf glappa.de (Webhoster) braucht's nichts davon.

Drin liegen:
- `Dockerfile`, `docker-compose*.yml`, `requirements.txt` (Container-Build)
- `docker/nginx.conf`, `docker/supervisord.conf` (Service-Configs)
- `cookies/youtube.txt` (sensitive! YouTube-Session)
- Scripts: `restart.sh`, `logs.sh`, `vps-deploy.sh`, `refresh-cookies.sh`,
  `sync-restart-vps.ps1` etc.

## Container starten (für VPS oder lokales Testen)

Aus `_docker/`:
```bash
cd _docker
docker compose up -d --build       # local-dev (Port 8099 + 8090)
# ODER
docker compose -f docker-compose.vps.yml up -d --build   # VPS (Port 8080 mit SSL)
```

## Wenn du was änderst

1. HTML/CSS/JS/Bilder in `glappa-site/` editieren
2. Drag-and-drop nach glappa.de
3. Browser hard-refresh (Strg+F5) — Cache-bust ist auf `?v=5` gesetzt
