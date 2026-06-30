# scripts/

Hilfs- und Deploy-Skripte. Alle gehen davon aus, dass sie aus diesem
`scripts/`-Ordner liegen und wechseln selbst ins Projekt-Root — du kannst
sie also von ueberall aufrufen, der Aufruf-Pfad bleibt `scripts/<name>`.

> Der **Neustart** laeuft ueber `restart.sh` im Projekt-Root (eine Ebene
> hoeher) — das ist das Skript fuer den taeglichen Gebrauch.

| Skript | Wofuer |
| --- | --- |
| `deploy.sh` | Erstinstallation/Setup auf WSL oder Bare-Metal-VPS (Docker installieren, bauen, starten). `bash scripts/deploy.sh` |
| `vps-deploy.sh` | VPS-Deploy (home.glappa.de): alten youtube-downloader.service stoppen, Certs pruefen, Container bauen, Cron setzen. `bash scripts/vps-deploy.sh` |
| `nas-deploy.sh` | Deploy auf der UGREEN NAS. `bash scripts/nas-deploy.sh` |
| `refresh-cookies.sh` | Frische Firefox-Cookies fuer den YouTube-Downloader ziehen (manuell). `bash scripts/refresh-cookies.sh` |
| `auto-refresh-cookies.sh` | Dasselbe automatisch per Cron (liest Windows-Firefox-Profil in WSL). |
| `sync-restart-vps.ps1` | Von Windows aus: Code per scp zum VPS pushen + dort `restart.sh` triggern. |
