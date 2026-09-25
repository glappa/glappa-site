<div align="center">

# ✦ ★ ✦ &nbsp; G L A P P A . D E &nbsp; ✦ ★ ✦

`▀▄▀▄▀▄ WELCOME 2 THE WEB ▄▀▄▀▄▀`

![Best Viewed In Netscape 4](https://img.shields.io/badge/BEST_VIEWED_IN-NETSCAPE_4-ff00ff?style=for-the-badge)
![Under Construction](https://img.shields.io/badge/STATUS-UNDER_CONSTRUCTION-ffff00?style=for-the-badge)
![No Tracking](https://img.shields.io/badge/NO_TRACKING-NO_ADS-00ff00?style=for-the-badge)

**🌐 [glappa.de](https://glappa.de) &nbsp;•&nbsp; [home.glappa.de](https://home.glappa.de) &nbsp;•&nbsp; [search.glappa.de](https://search.glappa.de)**

</div>

---

Eine handgemachte Retro-Webseite im Stil der späten 90er — Neon, animierte GIFs,
Klick-Sounds und ein Glitzer-Cursor. Keine Werbung, kein Tracking, nur Vibes.

## 🗺️ Seiten

| &nbsp; | Seite | Was es ist |
|:---:|:---|:---|
| 🏠 | **[Start](https://glappa.de)** | Neon-Hub mit Besucherzähler und Glitzer-Cursor |
| 💻 | **[Terminal](https://glappa.de/terminal.html)** | Boot-Animation und eine kleine Browser-Shell |
| 🟣 | **[Bounce](https://glappa.de/bounce.html)** | DVD-Logo-Bildschirmschoner |
| 🎵 | **[Tunes](https://home.glappa.de/home/tunes.html)** | Musik-Player mit Spektrum- und Fraktal-Visualizer |
| ⬇️ | **[YT.DL](https://home.glappa.de:8080/)** | YouTube-Videos als MP3 oder MP4 laden |
| 🔍 | **[Search](https://search.glappa.de/)** | Eigene SearXNG-Suche im 90er-Skin |
| 📼 | **[Video](https://glappa.de/page1.html)** | Die Video-Ecke |
| 🌡️ | **[Heat Death](https://home.glappa.de/home/index.html)** | Countdown bis zum Hitzetod des Universums |
| 🍄 | **[Secret](https://glappa.de/secret/pilzskip.html)** | „Du hast es gefunden." — Code erforderlich 😉 |

## 🧰 Technik

```
   Internet
      │
      ├─ glappa.de ........... statisch, leitet auf home.glappa.de
      └─ VPS (Apache + Docker)
          ├─ home.glappa.de .. Seiten + /api/counter
          ├─ :8080 ........... YT.DL Downloader
          └─ search.glappa.de  SearXNG
```

- **Frontend:** HTML, CSS und Vanilla-JS von Hand, zentrale `script.js`
- **Backend:** Python / Flask (`home/app.py`) — Downloader und Besucherzähler
- **Suche:** SearXNG im Container, Skin per Apache `mod_substitute` injiziert
- **Deploy:** Docker Compose in `_docker/`, Skripte in `scripts/` — siehe [DEPLOY.md](DEPLOY.md)

---

<div align="center">

### ✦ Du bist Besucher Nr. `0000001` ✦

`★ THANX 4 VISITING ★` &nbsp; `★ HONK IF U LOVE GIFS ★`

**Copyright © Glappa** &nbsp;·&nbsp; *Best viewed in 800×600* &nbsp;·&nbsp; `┬─┬ ノ( ゜-゜ノ) PUT IT BACK`

</div>
