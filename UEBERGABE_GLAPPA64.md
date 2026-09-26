# SUPER GLAPPA 64 – Übergabe für die nächste Sitzung

> Stand: 2026-09-26 abends (Arbeit vom 25./26.09.). Diese Datei zuerst lesen, dann `LEVEL_DESIGN_TODO.md`.
> Spiel: `secret/glappa64.html` + `secret/glappa64.js` (eigene WebGL-Engine, eine JS-Datei).

## 0. Wichtigster Punkt: NICHTS davon ist committet oder deployed

| Datei | Status |
|---|---|
| `secret/glappa64.js` | geändert – **JS `?v=97`**, `RAW_BYTES = 856314` |
| `secret/glappa64.html` | geändert (Modell-Lader, Versionen, Figurenwahl-Raster, Mehrspieler-Abschnitt, Steuerungshilfe) |
| `secret/glappa64-models.g64m` | **neu** – Blender-Modelle, **`?v=9`**, `MODEL_BYTES = 85100` |
| `tools/blender/*.py` | **neu** – Blender-Pipeline |
| `tools/pruefung/erreichbarkeit.js` | **neu** – Prüfwerkzeug für Physik-Änderungen |
| `_docker/mpgate/` | **neu** – Mehrspieler-Raumserver (`server.py`, `Dockerfile`, `requirements.txt`, `test_protokoll.py`) |
| `_docker/docker-compose.vps.yml` | geändert – Dienst `mpgate` (nur `127.0.0.1:8768`) |
| `_docker/apache/home.glappa.de.conf` | **gemischt!** Von dieser Arbeit sind nur 2 Abschnitte: `<Location "/api/mp/ws">` (hinter `/api/shell/ws`) und `SetEnvIf … "^/api/mp/" pgp_dontlog`. Der `/backup/`-Block und die übrigen Änderungen darin sind **vom User** → beim Commit `git add -p` |
| `.claude/launch.json` | geändert – Eintrag `glappa-mp` (lokaler Raumserver) |
| `LEVEL_DESIGN_TODO.md` | geändert – Luftphysik-Entscheidung eingetragen |
| `UEBERGABE_GLAPPA64.md` | diese Datei |

**Nicht von dieser Arbeit, NICHT mit committen** (lagen schon vorher offen im Baum): die übrigen Abschnitte in
`_docker/apache/home.glappa.de.conf` (s. o.), `_docker/glappa-watchdog.sh`, `scripts/README.md`, `scripts/auto-refresh-cookies.sh`, `scripts/refresh-cookies.sh`,
`_docker/apache/onion.conf`, `glappa-site/`, `scripts/vps-image-backup.sh`, `scripts/yt-selftest.sh`.

Commit nur auf ausdrücklichen Wunsch (Arbeitsweise: direkt auf `main`, siehe Memory „Single-branch workflow“).
Deploy wie bisher: VPS `cd ~/glappa-site && git pull --ff-only` (DocumentRoot = Repo, kein root nötig).
`tools/blender/__pycache__/` entsteht bei jedem Build – nicht committen.

---

## 1. Was fertig ist (und wo es steht)

### 1.1 Blender-Pipeline (die Engine hatte vorher KEINEN Modell-Lader)
- **Bauen:**
  ```
  "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python tools/blender/build_models.py
  ```
  Schreibt `secret/glappa64-models.g64m` und zieht `MODEL_BYTES` + `?v=` in der HTML **selbst** nach.
- **Dateien:** `g64m.py` (Format: indiziert, Position int16 in bbox quantisiert, Normale int16, Farbe uint8, UV optional),
  `g64_export.py` (Blender→G64M, dreht Z-oben/Blick −Y auf Spiel Y-oben/Blick +Z), `g64_build.py` (Bauwerkzeug:
  `lathe`, `sweep` mit ovalen Querschnitten + `hard`-Kanten, `flatten_bottom`, `ellipsoid`, `disc`, `cuboid`, `star`,
  `place`, `paint`, `merge`), `cats.py` (Arme/Beine/Schweife der 4 Katzen), `kappi.py` (5. Figur komplett),
  `props.py` (Schild-Korpus), `build_models.py` (Einstieg).
- **Im Spiel:** Ladebildschirm holt die Datei parallel zum Skript → `window.G64_MODELS`; `MODELS` (GPU) +
  `MODEL_CPU` (flache Arrays) in glappa64.js direkt hinter `build()`. **Fehlt die Datei, läuft alles prozedural weiter.**
- **Namenskonvention:** `<katze>.<teil>` ersetzt das Teil samt `<katze>.<teil>.glow`; Teile: head, body, arm, leg, tail, lids.
  Ursprung jedes Teils = Rig-Gelenk. **Kopf-Ursprung = Augenhöhe** (Lider werden von dort senkrecht skaliert = Blinzeln).
- **Requisiten:** `bakeModel(g, name, matrix)` backt ein Blender-Teil in die statische Levelgeometrie (kein eigener Draw-Call).
- **Fallen:** Bei `sweep` ist der 2. Radius, sobald der Pfad nach vorn knickt, die **Höhe** (nicht die Tiefe) – sonst werden
  Stiefel zu Kugeln. Farbfunktionen haben die Signatur `color(anteil_0_1, punkt)`. `merge()` übernimmt KEINE Modifier –
  Fasen per `bevel()` (bmesh) direkt ins Mesh.

### 1.2 Blender-MCP
- Server `blender` (`uvx mcp-for-blender`; `blender-mcp` ist nur eine Umleitung) ist in `~/.claude.json` fürs Projekt
  eingetragen, Addon in Blender 5.1.2 installiert und dauerhaft aktiv. **Seit dem Neustart sind die `mcp__blender__*`-Werkzeuge
  da.** Damit sie etwas tun: Blender öffnen → `N` → Reiter „MCP for Blender“ → **Start MCP Server**.
- Die Pipeline braucht das MCP NICHT (läuft headless). MCP ist für interaktives Modellieren/Nachsehen.

### 1.3 Figuren
- **Katzen** (Knuddel, Sphinx, Astro, Neon): Arme, Beine, Schweife aus Blender (durchgehende Flächen statt Kugel-Stapel,
  Manschetten mit harter Kante, Stiefel mit flacher Sohle). **Köpfe und Körper sind noch prozedural.**
- **Kappi** (5. Figur, `blenderOnly: true` in `CAT_DEFS`): nach den Maßen eines SM64-Referenzmodells (Kopf 43 % der Höhe),
  Dicken nach Front-/Seitenbild. Rig: `legX .155, legY .672, bodyY .887, armX .32, armY 1.078, headY 1.63, headZ .03,
  tailY .66, tailZ -.24`. Nur in der Figurenwahl, wenn die Modelldatei geladen ist. Figurenwahl-Raster: `--n = CATS.length`.
  Kopf hat 952 Dreiecke (Augen/Barthaare als Geometrie) – könnte man noch senken.

### 1.4 Physik (auf Wunsch „nicht so schnell, wie SM64, Dreifachsprung viel zu hoch“)
- `AIR_THRUST` 1,5 statt 2,3 (war die Ursache der 34-m-Dreifachsprünge), `AIR_DRAG = RUN`, `LONG_GRAV` 0,5,
  `RUN` 27 E/F (11,1 m/s), Anlauf `GROUND_ACC 42` + `ACC_FADE 0.65` (voll nach 0,43 s), **Bremsen unverändert straff**
  (User-Wunsch 21.09. „nicht rutschig“ – nicht zurückdrehen), `JUMP_K 0.86` über `jv()` für alle eigenen Absprünge
  (Federn/Gegner-Abpraller absichtlich NICHT). Schwellen relativ zu `RUN`.
- `MOVES` neu gemessen, `g64.measure()` → alle `diff` = 0. Details + Tabelle alt/neu: `LEVEL_DESIGN_TODO.md` → Entscheidungen.
- **Erreichbarkeit geprüft:** 20 feste Sterne + 1038 Münzen in 21 Welten → nichts verloren (Treffer waren Fehlalarme,
  mit echter Physik widerlegt). Garten-Tipps von Hand durchgespielt: Bäckerdach per Dreifachsprung (24/28 m Anlauf),
  Mühlen-Münze: vom Südhang z=90 Richtung Mühle, nach ~0,43 s springen → wird Doppelsprung → greift Kante 9,7 m.
- **Seitsalto repariert:** `SIDEFLIP_WINDOW` 0,3 s ab Kehrtwende, `SKID_GRACE` 0,12 s, Tastatur: bei W+S / A+D
  gewinnt die zuletzt gedrückte (`lastAxis` im Input-Modul). Vorher nur 2–6 Frames Fenster.

### 1.5 Animationen (nach Video der User-Aufnahme, SM64-Bewegungen)
In `drawPlayer`: Laufen mit 0,42 Vorlage, Bein hinten weit ausgeschlagen + gestaucht (Knie-Illusion `legSYL/legSYR`),
Rumpfdrehung `bodyYaw` (Schultern drehen mit), Kopf hält gegen; Einzelsprung rechte Faust hoch (`armOutR 0.3`),
linkes Knie hoch; Doppelsprung Arme T-förmig; Rückwärts-/Seitsalto Arme hoch → T, Beine gestreckt; Dreifach eingerollt,
öffnet sich im letzten Viertel; nach Salto/Doppelsprung Landung mit kurz ausgebreiteten Armen (0,4 s).
`armOutR` wird jetzt OBEN bei `legL…` deklariert (vorher weiter unten → würde TDZ-Fehler geben).

### 1.6 Schilder
Korpus `sign.body` aus Blender (`props.py`, Brett 1,72×0,96×0,18 vor Vierkant-Pfosten mit Spitze, SM64-Verhältnisse),
per `bakeModel` eingebacken; Vorderseite `MESH.signFace` + Textur `signFaceTex(lines, stars)` über `L.decals`
(bleibt im Röhren-Filter scharf). Titel automatisch `signTitle(speaker, text)`; Überschreiben mit
`K.talker(x,y,z,'Schild',text,{ title, ry })`. Schild schaut zum Spawn (`signFacing`). Maße in `props.py` und
`SIGN_Y/SIGN_FRONT` im JS müssen zusammenpassen.

### 1.7 Hocke, Krabbeln, Beinfeger (nach Video 2, fertig 2026-09-26)
- **B in der Hocke/beim Krabbeln = Beinfeger** wie im Original (vorher: normale Schlagkombi): `pl.sweepT` (`SWEEP_DUR` 0,5 s),
  trifft **rundum** (`hitInFront(SWEEP_R, true, true)`, neuer Schalter `all`), auf der Stelle, kein Sprung währenddessen.
  Pose: seitlich flach (`rz`), gestrecktes Bein (`legOutR`), eine volle Drehung (`spin`), Hüllkurve `sweepE` blendet die Hocke aus/ein.
  Getestet: Grummel direkt HINTER dem Spieler wird getroffen.
- **Hocke:** Hände seitlich am Kopf hoch (Ziel −2,7 / armOut 0,45 statt Arme vor den Knien), Beine etwas weiter (`cSplay 0,5`).
- **Krabbeln:** Rumpf fast waagrecht (`rx 1,38`), Höhe aus der Beinlänge (`dy = −0,3 − legY·0,45`), Kopf hoch (`headTilt −1,5`),
  Hände greifen abwechselnd vorn, Beine schräg nach hinten und gestaucht.
- Steuerungshilfe im Pausenmenü nennt den Beinfeger. Nicht umgesetzt: Rutschtritt aus dem Hock-Rutscher (im Original eigener Move).

### 1.8 Mehrspieler (fertig und lokal Ende-zu-Ende getestet 2026-09-26)
- **Server** `_docker/mpgate/server.py`: reiner Verteiler, Räume (5 Zeichen, ohne I/O/0/1) nur im Speicher, max. 8 Spieler,
  leere Räume leben 15 min, Drossel 40 Nachrichten/s, Origin-Prüfung (`MP_ORIGINS`), keine IP-/Namens-Logs.
  `rejoin: true` belebt einen Raum nach Server-Neustart wieder (automatisches Wiederverbinden und `?raum=`-Links; von Hand
  getippte unbekannte Codes bleiben ein Fehler). Test: `python _docker/mpgate/test_protokoll.py` → **17/17**.
- **Client** (`glappa64.js`): `drawPlayer` rechnet nur noch die Pose; gezeichnet wird in `drawPose(G, P, FIG)` – dieselbe
  Funktion zeichnet Mitspieler. `pl.netPose` (Felder = `POSE_KEYS`) geht 15×/s raus; `Net` (Modul vor `drawPlayer`) mischt
  empfangene Posen 110 ms verzögert, Drehwinkel über `angDiff`. Namensschild über `drawSign` (scharf im Röhren-Filter),
  Schatten für Mitspieler. Sterne: `collectStar` → `Net.star`; beim Beitreten schickt jeder seine Sterne, der Raum hält die
  Vereinigung, alle schreiben sie in ihren Spielstand. Wiederverbinden bis 5× mit steigender Wartezeit.
- **Oberfläche:** Pausenmenü „~ Mehrspieler ~" (Name, Raum erstellen, Code + Beitreten, Link kopieren, Verlassen, Mitspielerliste
  mit Welt). Adresszeile bekommt `?raum=CODE`; wer den Link öffnet, tritt nach dem Start automatisch bei.
- Tippen in Eingabefeldern ist keine Spieleingabe mehr (vorher wechselte „C" beim Namen-Tippen den Bildfilter).
- **v1 bewusst NICHT synchron:** Gegner, Münzen, Schalter, Kisten, Spieler-Kollision, Chat.
- Debug: `g64.Net.debug()` zeigt Verbindung, Raum und was von wem angekommen ist.

---

## 2. Offene Aufgaben (Reihenfolge = Vorschlag)

### 2.0 Mehrspieler live schalten (braucht root → macht der User)
Auf dem VPS, nachdem der Stand gepusht ist, **ein Befehl** (fragt nach dem sudo-Passwort):
```
cd ~/glappa-site && bash _docker/setup-home-apache.sh
```
Der macht selbst `git pull`, installiert `_docker/apache/home.glappa.de.conf` als Vhost, `configtest` + Reload und
`docker compose -f docker-compose.vps.yml up -d --build` – damit startet auch der neue Dienst `mpgate`.
`mod_proxy_wstunnel` ist schon aktiv (shellgate). Prüfen: `docker ps` zeigt `glappa-mpgate`; im Spiel Pausenmenü →
„Raum erstellen" → Code erscheint.
Ohne diese Schritte zeigt das Spiel online nur „Mehrspieler-Server nicht erreichbar." – alles andere läuft normal.

### 2.x ERLEDIGT 2026-09-26: Hocke-Moves (2.1) und Mehrspieler (2.2) – siehe 1.7/1.8. Die folgenden zwei Abschnitte sind nur noch Hintergrund.

### 2.1 Krabbeln, Tritt und Schlag in der Hocke „genau wie im Original“ (User-Wunsch, noch nicht angefangen)
- Referenzvideo: `C:\Users\Prieb\AppData\Local\Packages\Microsoft.ScreenSketch_8wekyb3d8bbwe\TempState\Recordings\20260925-2149-36.2265802.mp4`
  (37 s, 726×498, SM64 Bob-omb-Schlachtfeld). **Mario ist nur ~30 px groß** → mit ffmpeg um die Figur zuschneiden und
  vergrößern (`crop`/`scale`), mit 10–15 fps; Kontaktbögen per `tile` (Schrift-Einblendung `drawtext` geht NICHT, Fontconfig fehlt).
- Zu sehen: Hocken, Krabbeln, Beinfeger in der Hocke (Drehung am Boden), Rutschtritt, Schläge.
- Im Code: Krabbel-Pose in `drawPlayer` (Zweig `pl.grounded && (pl.crawl || pl.forceCrouch)`), Hocke über `crouchK`,
  Angriff `attack`/`hitInFront`/`startDive`, Schlag-Posen über `pl.punchN`/`pExt`. Prüfen, ob B in der Hocke überhaupt
  einen eigenen Angriff auslöst (im Original: Beinfeger im Stand-Hocken, Rutschtritt aus dem Lauf).
- Arbeitsweise, die gut funktioniert hat: Video-Abschnitte ansehen → Posen umbauen → **Posen-Tafel rendern**
  (siehe 3.3) und gegen die Videobilder halten.

### 2.2 Multiplayer (entschieden, noch nicht angefangen)
**Entscheidungen des Users:** eigene Engine behalten · Koop mit **gemeinsamem Fortschritt** · **Räume per Code**.
SM64-/sm64coopdx-Code kommt nicht in Frage (eigenes Spiel bleibt eigenes Spiel).

**Server – nach vorhandenem Muster `shellgate`/`displaygate`:**
- Neuer Ordner `_docker/mpgate/` mit `Dockerfile`, `requirements.txt` (`websockets`), `server.py` (asyncio).
- Dienst in `_docker/docker-compose.vps.yml`, Port **nur** `127.0.0.1:8768:8768` (8765 shellgate, 8766/8767 displaygate belegt).
- Apache in `_docker/apache/home.glappa.de.conf` (wie `/api/shell/ws`):
  `<Location "/api/mp/ws"> ProxyPass "ws://127.0.0.1:8768/" retry=0 timeout=3600 … </Location>`.
  `mod_proxy_wstunnel` ist schon aktiv (shellgate läuft). **Apache-Änderung + Reload braucht root → macht der User.**
- Server-Regeln: Raum-Code 5 Zeichen `[A-Z0-9]`, max. 8 Spieler, Name ≤ 16 Zeichen (filtern), Nachrichten ≤ 2 KB,
  ≤ 30 Nachrichten/s je Verbindung, leere Räume verfallen, **keine IPs loggen** (wie PGP-Chat).
  Raum hält Mitglieder + Stern-Menge (Vereinigung).

**Protokoll (JSON):** `join{room|new, name, cat}` → `welcome{id, room, players, stars}`; `st{level, pose[], pos, face}` ~15 Hz;
`join/leave{id}`; `star{id}` → an alle.

**Client (glappa64.js):**
- **Pose statt Rohzustand senden:** `drawPlayer` in zwei Teile trennen – Posenberechnung (bleibt) und
  `drawPose(G, pose, opts)` (die `part(...)`-Aufrufe am Ende). Die fertige Pose (Beine/Arme/Kopf/Schweif/Rumpf,
  `rx/rz/spin/dy`, Stauchung, Lider, Figur-ID) als kompaktes Array senden; fremde Spieler nur mit `drawPose` zeichnen.
  Grund: `drawPlayer` hängt an vielen Modulvariablen (`crouchK`, `turnRate`, `faceLast`, `zzz`), die fremde Spieler sonst verstellen.
- Zwischenpuffer ~100 ms, Winkel mit Winkel-Lerp.
- Nur Spieler in derselben Welt zeichnen; Namensschild über dem Kopf per `signTexture` + `drawSign` (scharf im Filter).
- Pausenmenü: Abschnitt „Mehrspieler“ (Name, Raum erstellen → Code anzeigen, Beitreten, Verlassen); Link `glappa64.html?raum=CODE`.
- Sterne: `collectStar` → an Server; empfangene Sterne im lokalen Spielstand eintragen (ohne Stern-Filmchen, nur Hinweis
  „<Name> hat einen Stern!“). Beim Beitreten Vereinigung der Sterne aller Mitglieder.
- v1 bewusst NICHT: Gegner/Münzen/Schalter synchronisieren, Spieler-Kollision, Chat.
- Lokal testen: Server lokal starten (über `.claude/launch.json` + `preview_start`, nicht per Bash), zwei Browser-Tabs =
  zwei Spieler; auf `localhost` direkt `ws://localhost:8768` statt `/api/mp/ws`.

### 2.3 Kleinere Punkte
- Köpfe + Körper der 4 Katzen nach Blender (Körper hat sichtbare Naht zwischen Brust- und Hüft-Ellipsoid).
- Kappis Kopf-Budget senken (952 Dreiecke).
- Wandsprung-Schacht im Gym neu messen (Kommentar bei `MAX_KICKS` ist als veraltet markiert).
- Donald-Duck-Mod wurde abgelehnt (s. 4); angeboten: eine **eigene** Enten-Figur über die Pipeline.

---

## 3. Testen

### 3.1 Lokal
- Server: `.claude/launch.json` → `glappa-static` (Port 8098) mit `preview_start`. Aufruf
  `http://localhost:8098/secret/glappa64.html?debug` (Testlevel: `&gym`). Nicht per `file://` (Modelldatei per fetch).
- Konsole zeigt pro Aufruf 2× 404 für `secret/mp3/*.mp3` und `localhost:8080`-Fehler – alt, harmlos.

### 3.2 Test-Haken und Fallen (`?debug` → `window.g64`)
- Start: `g64.start(); g64.advance(1,{a:true})` → Modus `iris` löst sich **nur mit echter Zeit** (≈4 s warten), danach
  `g64.advance` bis `mode === 'play'`; `g64.Dialog.close()`.
- Eingaben immer als Objekt übergeben (`{}` = nichts), sonst liest `advance` die echte Tastatur.
  Format: `{ my:-1 }` = Stick vor, `jump/jumpP`, `z` = ducken. Stick ist kamerarelativ: `cam.yaw = 0` → `my:-1` = −z,
  `cam.yaw = -π/2` → `my:-1` = +x.
- `g64.measure()` = Messtabelle (`diff` muss 0 sein); `g64.setCat(i)`, `g64.CATS`, `g64.FilterPick.set('aus')`,
  `g64.renderOnce()`, `g64.enterLevel(key)`, `g64.levels`, `g64.Input.poll()`.
- Bild abgreifen: `renderOnce()` und `canvas#gl.toDataURL` **im selben JS-Aufruf** (sonst leerer Puffer).
  Vorher/Nachher-Vergleich: Bild in `localStorage` legen, neu laden, nebeneinander auf ein Overlay-Canvas malen.
- Posen-Tafel: `pl` per `Object.assign` in den Zustand setzen (`action`, `vel`, `flip`, `walk`, `speed`, `grounded`),
  **ohne** `advance` direkt `renderOnce()` – Kamera vorher per `advance` einschwingen lassen.
- Nach JS-Änderungen: `SRC ?v=` hochzählen **und** `RAW_BYTES` (Bytegröße der JS) setzen.
- Heredocs mit Umlauten/Sonderzeichen scheitern in Git-Bash öfter → Patch-Skripte als Datei schreiben.

### 3.2b Mehrspieler lokal testen
- Raumserver: `preview_start` mit `glappa-mp` (Port 8768). Auf `localhost` verbindet das Spiel direkt mit `ws://localhost:8768/`.
- Zwei Spieler = zwei Browser-Tabs. **Beide teilen `localStorage`** → Namen vor dem Laden per `localStorage.setItem('glappa64-name', …)`
  setzen. Hintergrund-Tabs haben `innerWidth 0` → vor Bildaufnahmen `resize_window` auf den Tab.
- Frames per `g64.advance` treiben, dazwischen `await new Promise(r => setTimeout(r, 200))`, damit WebSocket-Nachrichten
  verarbeitet werden. Posen gehen nur, solange Frames laufen (verdeckte Tabs ohne rAF senden nichts).

### 3.3 Physik geändert? Dann
1. `g64.measure()` → `MOVES` übernehmen, 2. `tools/pruefung/erreichbarkeit.js` alt/neu laufen lassen (Anleitung im Dateikopf),
3. Treffer mit echter Physik (`g64.advance`) gegenprüfen, 4. Dorfbewohner-Tipps prüfen, die bestimmte Sprünge nennen.

---

## 4. Rechtliche Linie (vom User akzeptiert)
- Keine Nintendo-/Disney-Assets ins Spiel (Modelle, Texturen, Stimmen, Namen). Das Spiel ist öffentlich auf glappa.de,
  und `LEVEL_DESIGN_TODO.md` fordert „eigene oder freie Assets“.
- Erlaubt und so gemacht: aus Referenzen **Maße/Proportionen ablesen** (Mario-Rip, Schild-Rip) und **Bewegungen nachbauen**
  (Videos). Abgelehnt: Mario-Modell einbauen, Donald-Duck-Mod (Smhedgehog, sm64coopdx) einbauen.
- Referenzdateien des Users: `N:\Downloads\Nintendo 64 - Super Mario 64 - Playable Characters - Mario\`,
  `N:\Downloads\Nintendo 64 - Super Mario 64 - Map Objects - Sign\`, `N:\Downloads\[CS] Smhedgehog's Low-Poly Donald Duck\`,
  Video 1 (Animationen): `…\Recordings\20260925-2136-38.3795504.mp4`.
