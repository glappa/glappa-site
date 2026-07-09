# xterm.js — echter Terminal-Emulator fuer shell.html ("real-shell")

Wird NUR von `shell.html` benutzt (nicht von `terminal.html` — das
Uebungs-Terminal und die v86-Linux-VM haben ihren eigenen, einfachen
Zeilen-Renderer, siehe `v86/README.md`). shell.html braucht einen
ECHTEN Terminal-Emulator, weil dort eine ECHTE Bash-Session (Docker-
Container auf dem VPS, siehe `_docker/shellgate/`) laeuft: Cursor-
Bewegung, Vollbild-Programme (vim, htop), Tab-Vervollstaendigungs-
Menues usw. kann ein simpler Zeilen-Renderer nicht sauber darstellen.

## Dateien & Herkunft

| Datei          | Was                         | Quelle (npm-Standard-CDN)                                        |
|----------------|------------------------------|-------------------------------------------------------------------|
| `xterm.js`     | Terminal-Emulator (UMD)     | https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/lib/xterm.js      |
| `xterm.css`    | Terminal-Styling            | https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/css/xterm.css     |
| `addon-fit.js` | Auto-Resize an Container    | https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.11.0/lib/addon-fit.js |

Beide Pakete sind offizielle, signierte npm-Releases des xterm.js-
Projekts (u.a. genutzt von VS Code). `//# sourceMappingURL`-Kommentare
wurden entfernt (die .map-Dateien werden nicht mitgeliefert, sonst
gaebe es unnoetige 404en im Server-Log). Lizenz: MIT.

Beim Aktualisieren: neue Version auf https://www.npmjs.com/package/@xterm/xterm
pruefen, dieselben zwei Dateien (`lib/xterm.js`, `css/xterm.css`) plus
`lib/addon-fit.js` von jsdelivr neu ziehen und hier ersetzen.
