# noVNC — VNC-Client fuer desktop.html ("desktop-boot")

Wird NUR von `desktop.html` benutzt (GUI-Anzeige der Gast-VM). Zeigt den
Xvnc-Framebuffer der Gast-VM (siehe `_docker/shellvm/`, `_docker/displaygate/`)
im Browser an und leitet Maus/Tastatur zurueck — reines RFB-Protokoll ueber
WebSocket, kein Plugin.

## Dateien & Herkunft

| Ordner            | Was                                    | Quelle                                                        |
|--------------------|-----------------------------------------|-----------------------------------------------------------------|
| `core/`            | RFB-Client (ES-Module, kein Build noetig) | https://github.com/novnc/noVNC (Tag `v1.4.0`, `core/`-Ordner) |
| `vendor/pako/lib/`  | gzip-Dekompression (Abhaengigkeit von `core/inflator.js`) | dieselbe Quelle, `vendor/pako/lib/`                |

Offizieller GitHub-Release-Tarball, unveraendert kopiert (keine eigenen
Patches). Lizenz: `core/` unter MPL-2.0 (siehe `LICENSE.txt`), `vendor/pako`
unter MIT (siehe `vendor/pako/LICENSE`) — beide Nutzung als unveraenderte
Bibliothek erlauben.

Einbindung als natives ES-Modul (kein Bundler noetig):
```html
<script type="module">
  import RFB from './novnc/core/rfb.js';
</script>
```
Die relativen Importe in `core/*.js` (u.a. `../vendor/pako/...`) erwarten
genau diese Ordnerstruktur — beim Aktualisieren IMMER `core/` und
`vendor/pako/` zusammen aus demselben Release ersetzen, nie einzeln.

Beim Aktualisieren: neuen Tag auf https://github.com/novnc/noVNC/releases
pruefen, Tarball laden, `core/` + `vendor/pako/lib/` + `LICENSE.txt` hier
ersetzen (Rest des Repos — `app/`, `tests/`, `docs/` — wird nicht gebraucht,
das ist nur die fertige Demo-UI bzw. Tooling von noVNC selbst).
