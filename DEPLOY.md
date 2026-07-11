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
├── coursor/         hoch (WoW-Cursor)
├── home/            hoch (Heat-Death-Page + cs.mp4 + home.css)
├── img/             hoch
│   ├── gif/         hoch (ALLE animierten .gif Assets in einem Ordner)
│   ├── bingus.png   hoch
│   └── _spiney_capped.png  hoch
├── mp3/             hoch
├── mp4/             hoch
├── secret/          hoch (nur pilzskip.html — GIFs liegen jetzt in img/gif/)
├── xterm/           <-- NICHT hochladen — nur fuer shell.html, s.u.
├── bounce.html      hoch
├── favicon.ico      hoch (Browser-Konvention bleibt im Root)
├── index.html       hoch
├── page1.html       hoch
├── script.js        hoch
├── shell.html       <-- NICHT hochladen — s.u.
├── style.css        hoch
└── terminal.html    hoch
```

**shell.html + xterm/ bewusst NICHT auf glappa.de:** Die echte Shell
braucht den shellgate-Dienst, den es NUR auf home.glappa.de gibt (das
Repo direkt als DocumentRoot, kein separates Hochladen noetig — landet
dort automatisch mit `git pull`/`restart.sh --pull`). Auf glappa.de
(reines FTP-Static-Hosting) wuerde die Seite eh nur "nicht verfuegbar"
zeigen — sie dort erst gar nicht abzulegen haelt die Sache etwas
unauffaelliger (kein Eintrag in irgendeinem FTP-Verzeichnis, den
jemand zufaellig findet). Der Befehl `terminal-boot` im Terminal ist
zudem bewusst nirgends gelistet (nicht in `help`, nicht in der Tab-
Vervollstaendigung) — nur wer ihn kennt, kommt hin.

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
