# Hinweise fuer Claude (glappa-site)

- Zuerst `UEBERGABE_GLAPPA64.md` lesen (Spiel: `secret/glappa64.html` + `secret/glappa64.js`).
- **Erst testen, dann committen** (Wunsch des Users): Nichts committen oder pushen, bevor der User lokal getestet und OK gesagt hat.
  - Cloud-Sitzung: Aenderungen als Patch schicken - `glappa64-<thema>.patch`, erste Zeile `Basis: <commit>`, danach
    `git diff --cached --binary` (neue Dateien vorher stagen). Der User laedt ihn herunter und doppelklickt `test-lokal.bat`
    (neuester Patch aus Downloads -> Testkopie `..\glappa-test` -> Server auf 127.0.0.1:8097 -> Browser). Vorher selbst testen.
  - Lokale Sitzung: im Arbeitsbaum testen lassen (`.claude/launch.json` -> `glappa-static`, Port 8098).
