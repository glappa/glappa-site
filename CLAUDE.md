# Hinweise fuer Claude (glappa-site)

- Zuerst `UEBERGABE_GLAPPA64.md` lesen (Spiel: `secret/glappa64.html` + `secret/glappa64.js`).
- **Alle Aenderungen direkt auf GitHub schreiben** (Wunsch des Users, 2026-09-28): fertig getestete Aenderungen committen
  und auf `main` pushen (der VPS holt `main`). Danach dem User die VPS-Zeile nennen:
  `ssh -i ~/.ssh/glappa_vps_ed25519 glappa@45.142.115.252 "cd ~/glappa-site && git pull --ff-only"`.
- Vorher selbst testen (Headless-Chromium, siehe Uebergabe 3.x). `test-lokal.bat` bleibt fuer den User zum Ausprobieren
  eines Patches (neuester `glappa64-*.patch` aus Downloads -> Testkopie `..\glappa-test` -> 127.0.0.1:8097).
- Private Dateien des Users nie mit committen (Liste in der Uebergabe, Abschnitt 0).
