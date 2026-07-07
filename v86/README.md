# v86 — echtes Linux DIREKT im Terminal (Befehl `boot-linux`)

x86-PC-Emulator in WebAssembly, bootet ein echtes Mini-Linux komplett
client-seitig. Kein Overlay/eigener Bildschirm: die Konsole laeuft
SERIELL (`console=ttyS0`) — Kernel-Log und Shell erscheinen als
Zeilenstrom im normalen Terminal-Output von `terminal.html`, Eingaben
gehen aus der normalen Eingabezeile per `serial0_send` an die Gast-Shell.
`exit-linux` (oder Strg+C) pausiert die VM, `boot-linux` setzt fort.

## Dateien & Herkunft

| Datei         | Was                                   | Quelle                               |
|---------------|---------------------------------------|--------------------------------------|
| `libv86.js`   | v86-Engine (JS-Teil)                  | https://copy.sh/v86/build/libv86.js  |
| `v86.wasm`    | v86-Engine (WASM-Teil)                | https://copy.sh/v86/build/v86.wasm   |
| `seabios.bin` | SeaBIOS (System-BIOS)                 | https://copy.sh/v86/bios/seabios.bin |
| `vgabios.bin` | VGA-BIOS                              | https://copy.sh/v86/bios/vgabios.bin |
| `bzimage.bin` | Linux-Kernel 4.16.13 (i686) mit ein-  | /boot/bzImage aus                    |
|               | gebautem BusyBox-initramfs            | https://i.copy.sh/linux4.iso         |

WICHTIG: Engine, BIOS und WASM muessen aus DEMSELBEN Build stammen —
die npm-Paket-Version (jsdelivr) bootete mit diesen BIOS-Dateien NICHT
(schwarzer Schirm, CPU im HLT). Beim Aktualisieren immer alle vier
Engine-/BIOS-Dateien zusammen von copy.sh ziehen.

Der Kernel wird DIREKT gebootet (`bzimage` + `cmdline` in terminal.html)
statt ueber das ISO — nur so kontrollieren wir die Kernel-Parameter
(`console=ttyS0` fuer die serielle Konsole). Das initramfs steckt im
bzImage selbst, ein separates initrd gibt es nicht.

Lizenzen: v86 = BSD-2-Clause (github.com/copy/v86), SeaBIOS/VGABIOS =
LGPL, Linux/BusyBox = GPL (Quellen ueber das v86-Projekt).

Debug: Die laufende VM haengt an `window.GLAPPA_LINUX`
(z.B. `GLAPPA_LINUX.serial0_send('ls\n')` in der Browser-Konsole).
Achtung beim Testen: In unsichtbaren/minimierten Tabs drosselt Chrome
die Timer — die VM kriecht dann (~210k statt ~80M Instruktionen/s) und
der Boot scheint zu haengen. Fenster sichtbar machen, dann rennt er.
