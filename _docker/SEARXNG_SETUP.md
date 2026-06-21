# search.glappa.de — Setup-Anleitung

SearXNG (private Meta-Suchmaschine) hinter Caddy als TLS-Reverse-Proxy auf dem VPS.

```
glappa.de              (statisch, FTP)  ── home/search.html  ┐
                                                              │
                                                              │ GET ?q=...
                                                              ▼
search.glappa.de:443   (VPS, Caddy)     ── TLS + reverse_proxy
                                         │
                                         ▼
searxng:8080           (VPS, intern)    ── Suchergebnisse
```

`home.glappa.de:8080` bleibt unangetastet (eigener Container, eigene Letsencrypt-Certs via `app.py`).

---

## TL;DR (2 Schritte)

**1) Auf dem VPS** (per SSH einloggen, dann):

```bash
curl -fsSL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/install-searxng.sh | bash
```

Das holt das Repo selbst von GitHub (klont `~/glappa-site/` oder pullt main), installiert Docker/UFW-Regeln/SearXNG/Caddy, holt Letsencrypt-Cert, verifiziert — alles in einem Rutsch.

**2) Lokal** — `home/search.html` + `home/search.css` per FTP nach `glappa.de/home/` hochladen (Static-Only-Workflow wie immer).

Fertig. Aufrufen unter `https://search.glappa.de/` oder via Formular auf `glappa.de/home/search.html`.

---

## Voraussetzung

Vor dem `install-searxng.sh`-Lauf muss beim DNS-Provider für `glappa.de` ein A-Record existieren:

```
search.glappa.de   A   <IP deines VPS>
```

Aktuelle VPS-IP rausfinden (auf dem VPS):
```bash
curl -s https://api.ipify.org && echo
```

Propagation prüfen (kann 5-30 min dauern):
```bash
dig +short search.glappa.de
```

Ohne korrekten A-Record kann Caddy kein Letsencrypt-Cert holen — das Script warnt aber explizit.

---

## Was das Setup-Script (`vps-search-setup.sh`) macht

| Schritt | Was |
|---|---|
| 1 | Pre-flight: Docker, docker compose, Config-Files vorhanden, DNS löst auf VPS-IP auf |
| 2 | UFW-Firewall: Regeln für 22 (SSH), 80 (HTTP/ACME), 443 (HTTPS+UDP), 8080 (home-app) |
| 3 | Port-Konflikt-Check: meckert wenn nginx/apache/certbot Port 80 oder 443 belegen |
| 4 | `secret_key` in `searxng/settings.yml` generiert (`openssl rand -hex 32`) wenn noch Placeholder drin |
| 5 | `docker compose pull searxng caddy` + `up -d` |
| 6 | Wartet bis zu 60s auf "certificate obtained" im Caddy-Log |
| 7 | `curl https://search.glappa.de/` — verifiziert Erreichbarkeit |
| 8 | Cron-Eintrag für nächtlichen Restart um 00:05 |

Idempotent — kann mehrfach laufen, macht keinen Schaden.

### Sub-Modi

```bash
bash vps-search-setup.sh           # Vollständiges Setup
bash vps-search-setup.sh --status  # Container-Status + letzte Log-Zeilen
bash vps-search-setup.sh --logs    # docker compose logs -f (Ctrl-C zum Beenden)
```

---

## Files-Übersicht

```
_docker/
├── docker-compose.vps.yml     # glappa + searxng + caddy + Netzwerk + Volumes
├── install-searxng.sh         # ONE-LINER ENTRYPOINT — klont Repo, ruft setup
├── vps-search-setup.sh        # Eigentlicher Setup-Workflow
├── caddy/
│   └── Caddyfile              # TLS + reverse_proxy für search.glappa.de
└── searxng/
    └── settings.yml           # SearXNG-Config (secret_key wird automatisch gesetzt)

home/
├── search.html                # Such-Portal-Seite (statisch, lädt auf FTP)
└── search.css                 # Standalone Styles (lädt home.css davor)
```

## Updates ausrollen

Code in main mergen, dann auf dem VPS:

```bash
cd ~/glappa-site && git pull origin main
bash _docker/vps-search-setup.sh
```

Oder noch kürzer (rerun des install-Scripts — pullt automatisch und ruft setup):
```bash
curl -fsSL https://raw.githubusercontent.com/glappa/glappa-site/main/_docker/install-searxng.sh | bash
```

---

## Troubleshooting

| Symptom | Vermutlich | Fix |
|---|---|---|
| Script: `DNS loest noch keine IP auf` | A-Record fehlt oder nicht propagiert | DNS-Eintrag setzen, 5-30 min warten, `dig +short search.glappa.de` |
| Script: `Port 80/443 belegt von ...` | nginx, apache oder certbot --standalone hängt da | `sudo systemctl stop nginx` etc., dann Script erneut |
| Caddy-Log: `could not get certificate` | DNS zeigt nicht auf VPS, oder Port 80 nicht von außen erreichbar | DNS prüfen, Firewall beim Provider (Hetzner/etc.) prüfen |
| SearXNG zeigt nur `Forbidden` | secret_key noch der Placeholder | Script erneut laufen lassen, generiert ihn dann |
| Form auf glappa.de macht nichts | Browser blockt Mixed Content | Form-action muss `https://` sein — Check in `home/search.html` |
| Suchergebnisse leer | SearXNG-Engines noch nicht warm, oder Ratelimit von Google etc. | 30s warten, andere Engines probieren |
| `home.glappa.de:8080` down | Caddy hat App-Container nicht gebrochen, aber prüfe | `docker compose -f docker-compose.vps.yml ps glappa` |

### Wenn certbot bisher die `home.glappa.de`-Certs erneuert

Wenn dein cron `certbot renew` mit `--standalone` läuft, kollidiert das mit Caddy auf Port 80.

**Option A:** Renewal auf `--webroot` umstellen:
```bash
sudo certbot certonly --webroot -w /var/www/html -d home.glappa.de
```

**Option B:** Caddy auch die `home.glappa.de`-Certs holen lassen — dann in `caddy/Caddyfile`:
```
home.glappa.de {
    # nur Cert holen, kein reverse_proxy (App läuft auf :8080)
    respond "moved to :8080" 301 {
        Location https://home.glappa.de:8080{uri}
    }
}
```

---

## Update / Neustart

```bash
# SearXNG-Image updaten
docker compose -f docker-compose.vps.yml pull searxng
docker compose -f docker-compose.vps.yml up -d searxng

# Caddyfile bearbeitet → reload ohne Downtime
docker compose -f docker-compose.vps.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# Alles down + up
docker compose -f docker-compose.vps.yml down
docker compose -f docker-compose.vps.yml up -d
```

---

## Sicherheits-Hinweise

- `searxng/settings.yml` enthält den `secret_key` und wird per `chmod 600` auf dem VPS geschützt.
- `sync-restart-vps.ps1` überschreibt die VPS-Version von `settings.yml` **nicht**, wenn sie schon existiert — der Secret bleibt also beim re-syncen erhalten.
- `limiter: false` in SearXNG = kein Rate-Limit auf User-Anfragen. Wenn du die Suche öffentlich bewirbst, auf `true` stellen + Redis-Service hinzufügen.
- Caddy setzt sinnvolle Default-Security-Headers; zusätzliche Headers stehen im Caddyfile.
