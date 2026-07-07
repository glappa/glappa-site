# v86 — echtes Linux im Browser (Befehl `boot-linux` im Terminal)

x86-PC-Emulator in WebAssembly, bootet ein echtes Mini-Linux komplett
client-seitig. Eingebunden in `terminal.html` (Befehl `boot-linux`).

## Dateien & Herkunft

| Datei        | Was                                    | Quelle                              |
|--------------|----------------------------------------|-------------------------------------|
| `libv86.js`  | v86-Engine (JS-Teil)                   | https://copy.sh/v86/build/libv86.js |
| `v86.wasm`   | v86-Engine (WASM-Teil)                 | https://copy.sh/v86/build/v86.wasm  |
| `seabios.bin`| SeaBIOS (System-BIOS)                  | https://copy.sh/v86/bios/seabios.bin|
| `vgabios.bin`| VGA-BIOS                               | https://copy.sh/v86/bios/vgabios.bin|
| `linux4.iso` | Mini-Linux (Kernel 4.16 + BusyBox)     | https://i.copy.sh/linux4.iso        |

WICHTIG: Engine, BIOS und WASM muessen aus DEMSELBEN Build stammen —
die npm-Paket-Version (jsdelivr) bootete mit diesen BIOS-Dateien NICHT
(schwarzer Schirm, CPU im HLT). Beim Aktualisieren immer alle vier
Engine-/BIOS-Dateien zusammen von copy.sh ziehen.

Lizenzen: v86 = BSD-2-Clause (github.com/copy/v86), SeaBIOS/VGABIOS =
LGPL, Linux-Image = GPL (Quellen ueber das v86-Projekt).

Debug: Die laufende VM haengt an `window.GLAPPA_LINUX`
(z.B. `GLAPPA_LINUX.keyboard_send_text('ls\n')` in der Browser-Konsole).
