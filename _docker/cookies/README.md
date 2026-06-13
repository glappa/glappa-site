# YouTube-Cookies fuer yt-dlp

Damit der Downloader im Container Videos laden kann, die YouTube als
"Bot-Verdacht" markiert hat, brauchst du **deine eingeloggten YouTube-Cookies**
als Netscape-Format-Datei hier drin.

## So gehts (einmalig, ~1 Minute)

### 1) Firefox-Extension installieren
[**Get cookies.txt LOCALLY**](https://addons.mozilla.org/de/firefox/addon/cookies-txt/) — Open-Source, liest nur lokal, schickt nichts irgendwohin.

### 2) Cookies exportieren
1. Geh in Firefox auf <https://www.youtube.com> und **logge dich ein**.
2. Klick auf das Extension-Icon (Keks-Symbol oben rechts).
3. Wähle **"Current Site"** → es wird `youtube.com_cookies.txt` heruntergeladen.

### 3) Datei hier reinlegen + umbenennen

Speicher die heruntergeladene Datei als:

```
glappa-site/cookies/youtube.txt
```

(genau dieser Dateiname, sonst greifts nicht).

### 4) Container neu starten

In WSL:

```bash
cd ~/glappa-site
docker compose restart    # oder: docker compose up -d
```

Done. Klick im Downloader auf "Preview" — sollte jetzt durchkommen, auch fuer
Bot-flagged Videos.

## Was wenn die Cookies ablaufen?

YouTube-Session-Cookies halten ein paar Wochen bis Monate. Wenn der Bot-Error
wiederkommt, einfach Schritt 2-3 wiederholen.

## Privacy

- Die Datei landet **nur im Container** und **nur lesbar (`:ro`)**.
- Sie wird **nicht ins Git-Repo committed** (siehe `.gitignore`).
- Sie enthaelt deine YouTube-Session — **nicht teilen, nicht hochladen**.
