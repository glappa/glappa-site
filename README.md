<!-- ╔═══════════════════════════════════════════════════════════╗ -->
<!--                  G L A P P A . D E                          -->
<!-- ╚═══════════════════════════════════════════════════════════╝ -->

<div align="center">

```
 #####  #          #    ######  ######     #        ######  #######
#     # #         # #   #     # #     #   # #       #     # #
#       #        #   #  #     # #     #  #   #      #     # #
#  #### #       #     # ######  ######  #     #     #     # #####
#     # #       ####### #       #       ####### ### #     # #
#     # #       #     # #       #       #     # ### #     # #
 #####  ####### #     # #       #       #     # ### ######  #######
```

### ✦ ★ ✦ &nbsp; E I N E &nbsp; K L E I N E &nbsp; 9 0 ' s &nbsp; W E B S E I T E &nbsp; ✦ ★ ✦

![Best Viewed In Netscape 4](https://img.shields.io/badge/BEST_VIEWED_IN-NETSCAPE_4-ff00ff?style=for-the-badge)
![Under Construction](https://img.shields.io/badge/STATUS-UNDER_CONSTRUCTION-ffff00?style=for-the-badge)
![No Tracking](https://img.shields.io/badge/NO_TRACKING-NO_ADS-00ff00?style=for-the-badge)
![Powered by Dial-Up](https://img.shields.io/badge/POWERED_BY-DIAL--UP-00ffff?style=for-the-badge)

**🌐 [glappa.de](https://glappa.de) &nbsp;•&nbsp; [home.glappa.de](https://home.glappa.de) &nbsp;•&nbsp; [search.glappa.de](https://search.glappa.de)**

`▀▄▀▄▀▄ WELCOME 2 THE WEB ▄▀▄▀▄▀` &nbsp; `( ͡° ͜ʖ ͡°) RAISE UR DONGERS` &nbsp; `sudo rm -rf /langeweile`

</div>

---

## 🛸 Was ist Glappa?

Glappa ist eine handgemachte **Retro-Web-1.0-Spielwiese** im Stil der späten 90er /
frühen 2000er — Neon, Sternenhimmel, animierte GIFs, „Under Construction"-Schilder,
Klick-Sounds und ein Glitzer-Cursor. Dahinter steckt aber echte Technik: ein
In-Browser-Terminal mit Boot-Animation, ein Musik-Player mit Fraktal-Visualizer,
ein eigener YouTube-Downloader und eine selbst-gehostete, werbefreie Suchmaschine.

> ★ KEINE WERBUNG ★ KEIN TRACKING ★ NUR VIBES ★

---

## 🗺️ Was kann man hier alles machen? — Übersicht

| &nbsp; | Seite | Was du dort machen kannst |
|:---:|:---|:---|
| 🏠 | **[Glappa](https://glappa.de)** | Der Startpunkt — Neon-Hub mit Besucherzähler, zufälligen Lauftext-Sprüchen & Glitzer-Cursor |
| 💻 | **[Terminal](https://glappa.de/terminal.html)** | Retro-Boot-Animation (BIOS-Beeps, Festplatten-Sound, XP-Startchime) → eingeschränkte In-Browser-Bash |
| 📼 | **[Video](https://glappa.de/page1.html)** | „Was machst du hier?" — die Video-Ecke |
| 🟣 | **[Bounce](https://glappa.de/bounce.html)** | Bouncy Balls Forever — der hypnotische DVD-Logo-Bildschirmschoner |
| 🎵 | **[Tunes](https://home.glappa.de/home/tunes.html)** | Musik-Player für eigene Dateien + Winamp-Spektrum & Mandelbrot-Fraktal-Visualizer |
| ⬇️ | **[YT.DL](https://home.glappa.de:8080/)** | YouTube-Videos als **MP3** oder **MP4** herunterladen — danach direkt „In Tunes öffnen" |
| 🔍 | **[Search](https://search.glappa.de/)** | Eigene SearXNG-Metasuche im 90er-Skin — werbefrei, kein Tracking |
| 🍄 | **[SUPER Secret Page](https://glappa.de/secret/pilzskip.html)** | „Du hast es gefunden." — Zugangscode erforderlich 😉 |
| 🌡️ | **[Heat Death](https://home.glappa.de/home/index.html)** | Countdown bis zum Hitzetod des Universums |

---

## ✨ Die Features im Detail

### 💻 Terminal — `glappa.de/terminal.html`
Beim Öffnen bootet ein simuliertes Retro-System:
- **BIOS-POST-Beeps**, **RAM-Counter** (0 → 32768 KB) und **Festplatten-Spin-up-Sound** (alles per Web Audio API synthetisiert — keine Audio-Dateien!)
- **Windows-XP-Style Klick-Sounds** bei jedem Tastendruck + Start-Chime
- Danach eine **eingeschränkte Bash** nur für diese Session — probier `help`, `ls`, `whoami`, `reboot` …

### 🎵 Tunes — `home.glappa.de/home/tunes.html`
Ein vollwertiger In-Browser-Musik-Player:
- Eigene Dateien per Button oder **Drag & Drop** laden (MP3 / WAV / OGG / FLAC / M4A …)
- **Spektrum-Visualizer** im Winamp-Look + **Mandelbrot-Fraktal-Visualizer** (audio-reaktiv: Bass treibt den Zoom, Höhen die Farbe)
- Playlist mit Suche, **Shuffle** & **Repeat**

### ⬇️ YT.DL — `home.glappa.de:8080`
- YouTube-Link einfügen → als **MP3** oder **MP4** herunterladen (yt-dlp + ffmpeg)
- Nach dem Download führt ein Link **direkt in den Tunes-Player**, um die Datei reinzuziehen

### 🔍 Search — `search.glappa.de`
- Selbst-gehostete **[SearXNG](https://github.com/searxng/searxng)**-Metasuche, komplett im Glappa-Neon-Skin
- **Kein Tracking, keine Werbung**, Ergebnisse aus vielen Quellen
- Bilder-Suche als Kachel-Raster, Kategorien, Sprach-/Zeit-/Safe-Search-Filter

---

## 🧰 Technik & Hosting

```
   Internet
      │
      ├─ glappa.de ............ Webhoster (statische Seiten) → leitet auf home.glappa.de
      │
      └─ VPS (Apache + Docker)
          ├─ home.glappa.de ... statische Seiten (Terminal, Tunes, Bounce, …)
          │                     + /api/counter → Besucherzähler (Flask)
          ├─ :8080 ............ YT.DL Downloader (Flask, yt-dlp, ffmpeg)
          └─ search.glappa.de . SearXNG-Container (Reverse-Proxy via Apache)
```

- **Frontend:** handgeschriebenes HTML / CSS / Vanilla-JS — eine zentrale `script.js` (Navigation, Counter, Lauftext, Glitzer-Cursor)
- **Backend:** Python / Flask (`home/app.py`) — YouTube-Downloader + server-seitiger Besucherzähler
- **Suche:** SearXNG im Docker-Container, 90er-Skin via `_docker/searxng-static/glappa-style.css` (per Apache `mod_substitute` injiziert)
- **Deployment:** Docker Compose (`_docker/docker-compose.vps.yml`) + Setup-Skripte (`_docker/setup-search-apache.sh`)
- Läuft sogar auf einer **UGREEN NAS** — siehe `docker-compose.nas.yml` & `nas-deploy.sh`

---

<div align="center">

### ✦ Du bist Besucher Nr. `0000001` ✦

`★ THANX 4 VISITING ★` &nbsp; `★ HONK IF U LOVE GIFS ★` &nbsp; `★ GLAPPA APPROVED ★`

**Copyright © Glappa** &nbsp;·&nbsp; *Best viewed in 800×600* &nbsp;·&nbsp; `┬─┬ ノ( ゜-゜ノ) PUT IT BACK`

![Made with Recycled Pixels](https://img.shields.io/badge/MADE_WITH-100%25_RECYCLED_PIXELS-ff66cc?style=flat-square)
![Hugs Not Drugs](https://img.shields.io/badge/HUGS-NOT_DRUGS-00ff00?style=flat-square)
![Y2K Ready](https://img.shields.io/badge/Y2K-READY-ffff00?style=flat-square)

</div>
