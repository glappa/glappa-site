# SUPER GLAPPA 64 – Übergabe für die nächste Sitzung

> Stand: 2026-09-28. Diese Datei zuerst lesen, dann `LEVEL_DESIGN_TODO.md`.
> Spiel: `secret/glappa64.html` + `secret/glappa64.js` (eigene WebGL-Engine, eine JS-Datei).

## 0. Stand: alles committet und live

- Commits auf `main`: `2ea610a` (Modelle, Physik, Kappi, Animationen, Schilder, Mehrspieler-Client), danach der
  Peer-to-Peer-Umbau (Mehrspieler ohne eigenen Server, siehe 1.8). `3b37241` (Raumserver `mpgate`) ist damit wieder
  rückgebaut: `_docker/mpgate/`, Compose-Dienst, Apache-Abschnitte und `launch.json`-Eintrag sind raus.
- Live: https://home.glappa.de/secret/glappa64.html (VPS: `cd ~/glappa-site && git pull --ff-only`, DocumentRoot = Repo,
  **kein root nötig**). Aktuell **JS `?v=169`** (2026-10-01), Modelle `?v=15` (`MODEL_BYTES = 230816`).

**Nicht von dieser Arbeit, NICHT mit committen** (liegen offen im Baum, gehören dem User): der `/backup/`-Block und die
`.py`-Sperre in `_docker/apache/home.glappa.de.conf`, `_docker/glappa-watchdog.sh`, `scripts/README.md`,
`scripts/auto-refresh-cookies.sh`, `scripts/refresh-cookies.sh`, `_docker/apache/onion.conf`, `glappa-site/`,
`scripts/vps-image-backup.sh`, `scripts/yt-selftest.sh`.

Commit nur auf ausdrücklichen Wunsch (Arbeitsweise: direkt auf `main`, siehe Memory „Single-branch workflow“).
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

### 1.8 Mehrspieler – Peer-to-Peer, KEIN eigener Server (2026-09-26)
- **Warum so:** Der erste Ansatz (Raumserver `mpgate` hinter Apache) brauchte root für den Vhost und kam online nie an
  („Mehrspieler-Server nicht erreichbar“). Auf Wunsch des Users läuft jetzt **nichts** mehr auf dem VPS dafür.
- **Wie:** Wer „Raum erstellen“ drückt, dessen Browser **ist** der Raum (Gastgeber, Spieler-ID 1). Gäste verbinden sich per
  WebRTC-DataChannel direkt mit ihm (Stern-Topologie, der Gastgeber reicht Posen/Sterne weiter). Bibliothek: **PeerJS 1.5.5**,
  unverändert im Repo `secret/vendor/peerjs-1.5.5.min.js` (+ `LICENSE.txt`, MIT; sha512 gegen npm geprüft), wird erst beim
  ersten Mehrspieler-Klick nachgeladen. Zum Finden dient der **öffentliche PeerJS-Vermittler** `0.peerjs.com`; STUN Google
  (`ICE_SERVERS` im Net-Modul). Raum-Code = Peer-ID `glappa64-<CODE>`.
- **KEIN TURN-Relais (Stand 2026-09-27):** Die PeerJS-Relais `eu-0/us-0.turn.peerjs.com` haben keine Adresse mehr (DNS ohne
  A-Eintrag), `openrelay.metered.ca` und `freestun.net` antworten auch nicht. Folge: Es klappt nur, was sich per STUN direkt
  durchstechen lässt (meist Heimnetz↔Heimnetz). Mobilfunk-/Firmen-NAT, manche VPNs, WLANs ohne mDNS/Hairpin → keine Verbindung.
  Das Spiel sagt das jetzt ehrlich (`NO_DIRECT`) statt „Raum gibt es nicht“. **Offen: User entscheidet über ein Relais**
  (siehe 2.0). Ein TURN-Zugang wäre nur ein Eintrag in `ICE_SERVERS`.
- **Gastgeber prüft wie früher der Server:** Namen säubern, Stern-IDs `^[A-Za-z0-9_-]{1,32}$`, Posen (Level/Figur per Regex,
  genau `POSE_KEYS.length` endliche Zahlen), Drossel 40 Nachrichten/s je Gast, max. 8 Spieler, gemeinsame Sterne = Vereinigung.
  Gäste prüfen eingehende Posen/Sterne ebenfalls (der Gastgeber ist auch nur ein Browser).
- **Lebensdauer:** Der Raum lebt, solange der Gastgeber-Tab offen ist. Sitzung je Tab in `sessionStorage` `glappa64-mp`
  (`{code, role}`): Neuladen **und Rückkehr aus einem Webseiten-Bild** (Portal verlässt die Seite!) → nach dem Start geht es mit
  derselben Rolle weiter, der Gastgeber übernimmt seinen Code wieder (Vermittler gibt die ID evtl. erst nach Sekunden frei →
  4 Versuche à 2 s, danach als Gast beitreten). Gäste fassen per `setTimeout` (läuft auch im Hintergrund-Tab) bis ~2,5 min nach
  (`RETRY_WAIT`), im Menü mit „Abbrechen“. „Verlassen“ als Gastgeber schickt `end` → Gäste sehen es sofort.
  Meldungen: unbekannter Code → „Diesen Raum gibt es nicht (mehr)“ (~0,5 s); Gastgeber gefunden, aber ICE scheitert →
  `NO_DIRECT` (nach 15 s oder sofort bei `negotiation-failed`); Browser ohne `RTCPeerConnection` → `NO_RTC`.
- **Datenschutz:** Mitspieler (und der Vermittler) sehen die IP-Adresse – steht als Hinweis im Pausenmenü (`.mp-note`).
- **Protokoll (JSON über DataChannel):** Gast→Gastgeber `join{name,cat,stars}`, `st{lv,c,p}`, `star{id}`;
  Gastgeber→Gast `welcome{id,room,stars,players}`, `join{id,name,cat}`, `leave{id}`, `st{id,lv,c,p}`, `stars{ids,by}`,
  `error{msg}`, `end`.
- **Client-Rest unverändert:** `drawPlayer` rechnet die Pose, `drawPose(G, P, FIG)` zeichnet (auch Mitspieler); `pl.netPose`
  (Felder = `POSE_KEYS`) 15×/s, 110 ms Verzögerung, Winkel über `angDiff`, Namensschild per `drawSign`, Schatten.
  API von `Net` gleich geblieben (`connect('NEW')` = Gastgeber, `connect(code)` = Gast, `autoJoin`, `leave`, `star`, `debug`).
- **Oberfläche:** Pausenmenü „~ Mehrspieler ~" (Name, Raum erstellen, Code + Beitreten, Link kopieren, Verlassen, Liste mit Welt).
  Adresszeile bekommt `?raum=CODE`; wer den Link öffnet, tritt nach dem Start automatisch bei.
- **v1 bewusst NICHT synchron:** Gegner, Münzen, Schalter, Kisten, Spieler-Kollision, Chat. Gastgeber-Wechsel (Raum
  überlebt das Weggehen des Gastgebers) gibt es nicht.
- Debug: `g64.Net.debug()` → `role` (host/guest), `room`, `status`, `peer`, `guests`, `retry`, `ice`, `session`, `rtc`, `others`.

### 1.10 Kern-Bewegungen komplett + Hocke wie im Vorbild (2026-09-27)
- **Hocke war ein Klumpen:** eine alte Stauchung (`pl.squash` → 0,7 beim Hocken) wirkte ZUSÄTZLICH zur Hocken-Pose →
  Kopfmitte bei 42 % der Standhöhe, Figur 120 % breit. Stauchung raus; Pose nach Video 2 neu (von hinten + Seite):
  Vorlage 0,42 rad (Po nach hinten), Kopf tiefer zwischen die Schultern (`cSink` −0,17), Fäuste vor/neben dem Gesicht
  (Arm Weltlage −2,5, `armOut` 0,52), Spreizung 0,4, Schwanz seitlich am Boden. Kappi-Kopfmitte jetzt 1,04 m (Stand 1,63).
- **Neu: Rutschtritt** (`slidekick` → einmal abprallen → `kickslide`): B im Hock-Rutscher ab `SLIDEKICK_MIN` 3,5 m/s,
  Hopser `12 E/F`, mind. Lauftempo, lenkt nicht, trifft einmal (`pl.skHit`, `hitInFront(1.8, true)`), A beim Ausrutschen =
  Abrollen. Gemessen: ~7,2 m ab Hock-Beginn aus vollem Lauf.
- **Neu: Bremsrutscher** beim Loslassen aus ≥ 60 % Lauftempo: nur Pose/Staub/Geräusch (`pl.brakeT`, 0,3 s), Bremsweg
  unverändert 0,43 m (User wollte 21.09. „nicht rutschig“).
- **Neu im Leerlauf:** Fuß tippen (`IDLE_KINDS` jetzt 5, Einschlafen ab 23 s). **Stern-Tanz:** eine Drehung + Hopser, dann Faust hoch.
- Schon vorhanden (geprüft): Gehen/Rennen/Schleichen nach Stick-Ausschlag, Krabbeln, Einzel-/Doppel-/Dreifachsprung,
  Rückwärts-/Seitsalto, Weitsprung, Wandsprung, Stampfer, Schlag-Kombo, Sprungtritt, Hechtsprung + Abrollen, Beinfeger,
  Kehrtwenden-Rutscher, Kurvenlage, Umschauen/Strecken/Schlafen, Knallkisten greifen/werfen (einen Bowser gibt es nicht).
- `g64.measure()` danach: alle `diff` = 0 (keine gemessene Bewegung verändert).

### 1.11 Animationen nach Video 3/4 + Rückwärts-Weitsprung (BLJ) (2026-09-27)
- Videos: `…\Recordings60927-0050-36.4834232.mp4` (Hocke nah, Beinfeger, Krabbeln, Bremsen, Rennen, Landung) und
  `…60927-0053-28.3100043.mp4` (BLJs von vorn, Einzelsprünge von der Seite). Frames per ffmpeg `crop`+`tile`.
- **Hocke** Vorlage 0,72 rad (Seitenansicht zeigt ~45–55° Buckel), Faust vor dem Gesicht (Arm Weltlage −2,3).
- **Beinfeger** jetzt Liegestütz (rx 1,05, Arme senkrecht zum Boden), gestrecktes Bein flach nach hinten-außen, eine Drehung.
- **Krabbeln** rx 1,15 (vorher 1,38), Höhe aus Beinlänge, Hände vorn am Boden, Kopf hoch.
- **Bremsen** 0,75 s: Phase 1 zurückgelehnt rutschen, Fäuste vorn; Phase 2 nach vorn nachkippen (`brkA`/`brkB`).
- **Kehrtwende** Arme T; **Rennen** Ellbogen außen (`armOut` bis 0,6), Fäuste eher vorn; **Stand** Arme weiter weg.
- **Landung** nach Dreifach/Salto/Doppel: T-Pose halten (`tHold` 0,8/0,6/0,45 s), dann sinken.
- **Einzelsprung** fallend: Faust nach vorn, anderer Arm zurück, Beine angewinkelt hinten, leichte Vorlage.
- **Weitsprung** rx 0,62 (vorher 1,15 = Hechtsprung-Look), Arme seitlich ausgebreitet, Knie angezogen.
- **BLJ:** Weitsprung auch mit Rückwärts-Tempo (≤ −`BLJ_MIN` 1,5), Tempo ×1,5 nur nach vorn gedeckelt. Flach bleibt es
  begrenzt (Luft zieht zurück). **Treppen-Trick** (Tag `stair`, A gehalten): Landung auf/Einflug in eine Stufe = sofort
  nächster BLJ (`bljAgain`, flach mit `BLJ_STAIR_VY` 3 m/s), über Treppen keine Luftbremse → Hallentreppe: 5 → 180 m/s in
  9 Stufen, Deckel `BLJ_MAX` 250. Bonk-Rückprall auf 12 m/s gedeckelt. Treppen: Halle (10 Stufen), Turm (og), Terrasse.

### 1.12 PvP, Mitspieler-Liste, Vollbild, Titel + Vorspann (2026-09-27)
- **PvP** (Gastgeber-Schalter `#mpPvp`, Vorgabe an): Angreifer erkennt Treffer an der gezeichneten Mitspieler-Position
  (`Net.targets()`, `pvpHit`), schickt `{t:'hit', to, k:'w'|'s', d, x, z}`; Gastgeber prüft (`plausible`: PvP an, gleiche
  Welt, < 8 m, Drossel) und reicht weiter; Opfer: `hitByPlayer` (zum Angreifer drehen, `hurtPlayer`, hart = auf den Rücken
  landen `pl.knockHard` → `pl.knock` 0,6 s, danach 1,6 s unverwundbar). Treffer: Schlag 1, Tritt/Sprungtritt 2 (hart),
  Beinfeger 1 (hart), Rutschtritt 2, Hechtsprung 2, Stampfer 3 (Umkreis 2,8 m), Draufspringen 1 + Abfedern.
  Posen tragen `hp` mit. Getestet mit zwei Tabs (Schlag → 8→7, Rückstoß, Unverwundbarkeit; harter Treffer → Rückenlage).
- **Mitspieler-Liste** `#mpHud` (Modul `Lobby`, oben links, glappa.de-Stil), Tab klappt ein (localStorage `glappa64-lobby`).
- **Vollbild** `#btnFull`: Fullscreen-API + `navigator.keyboard.lock` (W/Q/A/S/D/E/R/T/N; Esc bewusst NICHT, sonst
  bricht die Esc-Pausen-Logik) → Strg+W/Q gesperrt mit Hinweis; sonst `beforeunload`-Rückfrage im Vollbild (nicht bei
  Links/Portalen: `leavingOnPurpose`).
- **Titel** (Video 20260927-0153, SM64-Ablauf, alles eigen): `renderMenu` statt Schloss – Kachelwand `MenuBg` (eigenes
  „SUPER GLAPPA 64“-Logo), großer Kopf der gewählten Figur `TitleHead` (folgt Zeiger, am Gesicht ziehen, federt),
  PRESS START unten links, glappa.de-Glitzerspur (`body.on-title .sparkle`). PRESS START: Kopf dreht weg, Dateifenster
  zoomt auf (`files-in`). Dateiauswahl ebenfalls vor der Kachelwand.
- **Vorspann** `Intro`: neue Datei (`!state.intro`) = Weißblende → Himmel+Meer (Canvas-Malerei) mit Glappas Brief
  (~8 s) → Kameraflug `FLY` (Catmull-Rom, 14 s: Himmel, Dach, Buntglasfenster, Tor, Garten), Wolki (`MESH.wolki`) fliegt
  voraus → Ankunft 4,8 s: UFO (`MESH.ufo`/`ufoGlow`) + Strahl beamt die Figur auf `SPOT` [0,0,41,5] (Münze am Weg!),
  Nahaufnahme, Schwenk hinter die Figur → Wolkis Begrüßung. Vorhandene Datei: nur Ankunft. Überspringen: A/Enter/Klick.
  Portal-Rückkehr und `?gym` laufen wie vorher über die Iris.
- Falle: innere Funktionen NICHT `draw` nennen (verdeckt die globale draw → Endlosrekursion, „Maximum call stack“).

### 1.13 Schloss, Garten nach Vorbild-Karte, Weitsprung, PvP-Fix (2026-09-27)
- **Schloss** ist jetzt ein Blender-Modell `castle.body` (`tools/blender/castle.py`, 4931 Dreiecke, eigener Entwurf; die
  Rip-Dateien in `N:\Downloads\…Peach's Castle Exterior` dienten NUR als Vorlage für Aufbau/Proportionen, nichts davon
  ist eingebaut). Hauptbau mit Sockel, Gurtgesims (y 8,2 – unter dem Buntglasfenster), Fensterreihen, Walmdach mit Gauben
  und Stern-Giebel, Mittelturm mit Zinnen + Pyramidendach, 6 Rundtürme (2 davon neu hinten), Verbindungsmauern.
  Einbau in `buildGarden`: `bakeModel(g, 'castle.body', M4.from(0, 0, -48))`; Kollision sind weiter die alten Quader
  (Modell ist genau darauf gebaut); ohne Modelldatei die alte Quader-Fassung. Fahnen: `flagAt()` (4 Glieder, `K.anim`).
  Buntglasfenster + Tor bleiben prozedural.
- **Garten** nach der Vorbild-Karte: Burggraben in **U-Form** (`MOAT`, vorn x ±38, Arme x ±32..38 bis z −64,
  Ufer entlang `RIM`), **Wasserfall hinten links** aus einer Felsstufe (x −41..−29, z −77..−64, oben 3 Münzen) in den
  linken Arm, **Sandweg-Schleife** `LOOP` um die große Wiese (Ellipse um (0, 29), 27×22 m; Blumen/Gras meiden ihn über
  `onLoop` – `avoid`-Listen von `K.flowers`/`K.tufts` nehmen jetzt auch Funktionen), ferne Hügel als runde Kuppen.
- **Weitsprung** wie im Vorbild: beim Absprung `pl.longFast` (Tempo > 24 m/s) → flach gestreckt, Arme voraus; langsam /
  rückwärts → schräg (~60°), Hände unter der Brust. Nach der Landung 0,28 s Hocke (`landLong`). Messwerte unverändert.
- **PvP-Fix**: Wer im Pausenmenü steht, war unverwundbar und eingefroren – bei zwei Fenstern an einem Rechner ist das
  Fenster ohne Fokus IMMER pausiert (Maus weg). Jetzt läuft die Welt im Mehrspieler auch im Pausenmenü weiter (ohne
  Eingaben, `live()` in `frame`), `hitByPlayer` wirkt auch dort. Getestet mit zwei Tabs, beide Richtungen.
- **Mitspieler sind fest**: `Net.bodies()` (auch ohne PvP) → man schiebt sich aus dem anderen heraus (Radius 2·R·0,95)
  und federt auf seinem Kopf ab. Hintergrund: Im Nutzer-Video stand die Astro-Katze genau hinter Kappi → sah aus wie
  „Kappi mit vier Ohren“.
- **Kappi**: Kappe hinten bis in den Nacken gezogen (`_cap_back`, vorher kahler grüner Hinterkopf aus der Spielkamera),
  Ohren stecken oben durch die Kappe statt seitlich wie Hörner.
- Falle beim Testen: Der Browser cached `glappa64.html` selbst → nach Änderungen mit `&nc=<Zeit>` laden, sonst läuft
  heimlich die alte `?v=`-Fassung. Vor Figuren/Schildern ist B „reden“, nicht „schlagen“ (Wolki steht bei (5, 30)).

### 1.14 Musik je Welt + Gnarp-Stimme (2026-09-27)
- **Musik**: statt einer 8-Takt-Schleife 22 eigene Stücke (`TRACKS` im Snd-Modul, alle Melodien eigene Kompositionen):
  title, garden, hall, og, keller, hof, desert, dust, terminal, video, aquarium, bounce, spuk, uhrwerk, fraktal, pilz,
  neon, verlies, bibliothek, musik, spiel, sternwarte. Engine `MUS`: Synth-Instrumente (Glocke, Celesta, Spieluhr,
  Marimba, Xylophon, Kalimba, Harfe, Zupf, Cembalo, Pizzicato, E-Piano/Steeldrum per FM, Flöte/Lead mit Vibrato, Chip-
  Pulse, Blech, Streicher, Pad, Chor, Orgel, Bässe) + Schlagzeug, gemeinsamer Hall (Faltung) und Tiefpass 7 kHz.
  Klangfarben nach den SM64-Klängen des Users NUR vermessen (Spektrogramme: Sinusglocken mit Echo, Blechsätze,
  Harfen-Glissando, Vibrato, 16-kHz-Abtastung) – keine Datei eingebaut.
- Notation je Stück: Takte mit `|`, je Schritt Note/`-`/`.`; Akkorde je Takt (`C,G` = halbe); Stimmen `P` (Melodie,
  `bass` Stufen R 3 5 7 8 `<`, `arp`, `stab`, `pad`, `res`, `in`), Schlagzeug `D`. Prüfskript im Kopf der Übergabe
  nachbauen: Taktlängen, Noten, Akkorde (alle 22 fehlerfrei).
- Auswahl: `wantedSong()` jedes Bild → `Snd.song({id, duck, muffle})`; Bilderzimmer `bild_X` spielen X gedämpft
  (Tiefpass 900 Hz), Pause = 35 %, Stern-Fanfare `Snd.duckMusic(2,6)`, Tab versteckt = aus. `gain` je Stück offline
  auf gleichen Pegel gemessen (`Snd.renderSong(id, sek)`), Musik-Bus 0,13 (unter Stimme/Klängen).
- **Musik ist jetzt Vorgabe an**; alte Einstellungen einmalig umgestellt (`opts.mv = 2`).
- **Stimme im Gnarp-Stil** (Vorlage mp3 des Users vermessen): Grundton 100–330 Hz mit Gleitern, Knarren per Unterton
  und AM mit halber Frequenz, Nasal-Band 3,7 kHz, Klangregler. Bandenergien per ffmpeg-Bandpass gegen die Vorlage
  abgeglichen (alle Bänder ±3 dB). `VOICE` kennt Silbenlisten (`star` = „gnarp gnarp“). Test: `Snd.voiceOffline(name)`.
- Testfalle: versteckter Browser-Pane drosselt Timer → Musik dort nicht in Echtzeit prüfbar, dafür `renderSong`.

### 1.15 Titelkopf zum Verformen (2026-09-27, nach Video 20260927-1043)
- `TitleHead`: Stelle packen (nächster Eckpunkt unter dem Zeiger, bei Überdeckung der vorderste) und ziehen – nur die
  Umgebung folgt (Glocke mit harter Grenze, `REACH2` = 0,2², max. Zug `MAX_D` 2,2 Kopf-Einheiten). Loslassen = gedämpfte
  Feder mit Nachwippen; mehrere Stellen gleichzeitig (`pulls`, max. 8). Rechte Maustaste = bleibt stehen, Doppelklick =
  alles zurück. Beim Ziehen steht der Kopf still und die Augen bleiben offen.
- Umsetzung: Eckpunkte je Bild auf der CPU verschoben (eigene DYNAMIC_DRAW-Puffer, Farben/UV vom normalen Mesh),
  Normalen = Ruhe-Normale + Änderung der Flächennormale. Dafür behalten die Figuren `CAT.cpu.head/headGlow`
  (prozedurale Köpfe über `Geo`, Blender-Köpfe aus `MODEL_CPU`). Umrechnung Zeiger ↔ Kopf ohne Matrix-Umkehrung,
  weil die Titelkamera achsparallel bei z = 9 sitzt (`TitleHead.cam(fov, aspect)` aus `renderMenu`).
- Test: `g64.TitleHead.test.pick(x, y)` + synthetische PointerEvents auf `#titleScreen`.
- **Lebhaftes Gesicht** (Video 20260927-1053): `features()` findet Pupillen (dunkle Eckpunkte vorn; bei Neon die
  leuchtenden Augäpfel im Leucht-Teil), Ohrspitzen, Schnurrhaar-Spitzen (äußerster Punkt vorn unten) und Kinn in den
  Eckpunkten (`CAT.cpu.head` trägt dafür jetzt auch Farben). Daran hängen „Muskeln“ mit vorberechneten Einflusslisten
  (`sparse`): Pupillen folgen dem Zeiger, Ohren zucken, Schnurrhaare wackeln, Kinn fällt beim Erschrecken.
  Kopf dreht weit mit (±1 rad), Stupser (kurzer Klick) = Stauchfeder + Augen zukneifen + Quäken; nach 9 s ohne
  Eingabe döst er (Kopf sackt, Lider zu, Atmen, Z-Blasen `MESH.zee`), jede Bewegung weckt ihn mit Ruck
  (weite Augen, Ohren hoch, Streckung, `Snd.voice('hoi')` nur wenn `Snd.ready()`).
- **Mund** (nur Titel): eigenes Mesh je Bild (`buildMouth`), liegt auf der Schnauze unter der Nase (Höhe aus einem
  Oberflächenraster `surfaceGrid` der vordersten Kopfdreiecke, geht beim Ziehen mit). Formen `MOUTH` [halbe Breite,
  Öffnung, Lächeln, Schiefe, rund]: Ruhe = Lächeln, Maus bewegt = Grinsen mit Zunge, angefasst = fragend-schief
  (+ Kopf kippt, `st.tilt`), Stupser = „o“, nach weitem Ziehen = Lachen, Dösen = fast zu, Aufwachen = „O“.

### 1.16 Alien-Katzen sprechen in Zip-Lauten (2026-09-28, ersetzt die Sprachausgabe)
- Die eSpeak-Sprachausgabe ist auf Wunsch des Users **komplett entfernt** (Worker `secret/vendor/mespeak-de-worker.js`,
  Lizenzdatei und `tools/tts/` gelöscht, `Snd.say/ttsPreload/ttsOffline` weg). Zwischenstand vorher: Vocoder-Roboterstimme.
- Jetzt: NPC-Katzen (`CAT_VOICES`, Stimme aus dem Namen: `catVoice` → `{ hz, dur, rate }`) machen beim Tippen der
  Zeile kurze Zip-Silben (`Snd.zip(stimme)`). Auf ausdrücklichen Wunsch sind es die **echten Silben aus der mp3 des
  Users** („Alien Speaking Meme“, N:\Downloads; eine erste synthetische Nachbildung war ihm zu künstlich): 20 Silben der
  ersten Alien-Stimme (0,4–8,3 s), Hintergrundmusik je Silbe aus den Pausen davor/danach gemessen und spektral
  abgezogen, Pegel angeglichen → `secret/glappa64-zip.mp3` (50 KB, 60 ms Stille zwischen den Silben; Grenzen sucht
  `zipScan` nach dem Dekodieren). Lädt bei der ersten Nutzeraktion (`Snd.unlock`). Tonlage je Katze = Abspielrate
  `hz/300`, Silbe zufällig (nie zweimal dieselbe). `ZIP_VOL` 0,22 ≈ 3 dB über dem Ruf `yay`.
  Test: `await Snd.zipOffline(6, { hz: 300 })` → `{ buf, clips: 20 }`. Andere Sprecher (Wolki, Schilder) = Tipp-Blips.
  Hinweis: Das ist fremdes Meme-Audio im öffentlichen Spiel (User wollte es so; kein Nintendo-/Disney-Material).
  Werkzeuge zum Neuschneiden lagen nur im Scratchpad (Spektral-Abzug + Schnitt in Node) – bei Bedarf neu schreiben.
- Eigene Stimmen gesetzt: Frostkönig tief (`hz` 150), Schneehase hoch (380).

### 1.17 Bounce-Berg als Kurs + Gelände-Engine (2026-09-28)
- **Gelände-Raster** `HField` (bei `topAt`): Zellen in zwei Dreiecke geteilt, Bild = Kollision; `L.surface(S, tag)` trägt
  es als einen Pseudo-Quader mit `b.hf` ein. Angepasst: `groundAt`, `pushOut` (→ `hfPush`: Proben am Rand, Wand ab
  `stepTop + HF_LIP`), Decke nur bei `overlay`-Flächen (Unterkante `thick`), Kantengriff ignoriert Gelände,
  `steepDown` → `hfSteep` (≥ 44° oder Material `chute` = rutschen), `gtagOf` = Material unter dem Spieler (Schritte
  `snow`/`ice`), Kamera `camReach` + `hfRay`, Schatten liegt schräg auf dem Hang. Textur dreiseitig projiziert
  (`draw(..., { tri })`, Shader `uTri`), Inselrand fürs Bild auf eine glatte Linie gezogen (`mesh(..., warp)`).
- **Kurs-System** (`COURSES`): Sprung ins Bild → `CourseSel` (#courseSel) → `enterCourse(key, m)` baut die Welt für
  Mission m neu (`courseMission`, `dropLevel` gibt Puffer frei) → `Flyby` (Kameraflug + Titelkarte; der Flug nur beim ersten Betreten je Datei, `state.flags.flyby_<kurs>`,
  danach nur die Titelkarte) → Spiel. Nach jedem
  Stern `exitCourse` → vors Bild (`backSpot`). Rote Münzen je Besuch (`L.redStar`, `L.redN`), 100 Münzen je Besuch
  (`L.coins100`, `L.coinN`), Pause zeigt beides. `state.flags` (neu, wird gespeichert) für geöffnete Kanone.
- **Bounce-Berg** (`buildBounce`, Bauplan `BB`, feste Teile einmal in `bbCache()`): Schneeinsel über Wolkenmeer
  (`voidY` −22), Kegelberg (Mitte (0, −30), Gipfel 40 m) mit Spiralweg (`bbPath(t)`), Lücke im Süden = Rodelbahn
  (`SLIDE`, `bbSlide`: Höhen per Mindest-/Höchstgefälle, am Berg Schneegrat, draußen Stelzen, Ende auf dem Eissee),
  Wolkeninsel (dünne Fläche), Gletscherspalte mit Sims, Eisbeißer-Pferch, Iglu, Kanonengrube. Himmel `cloudsea` (neu).
  M1 Frostkönig (von hinten packen, Wurf auf den Gipfel = Treffer, 3×) · M2 Flitz (27,4 s; mit sauberem Laufen ~24 s) ·
  M3 Rodelbahn (~11 s, Stick vor = schneller, <9,9 s = 1-Up) · M4 Pfahl 3× stampfen → Eisbeißer zertrümmert das Gitter ·
  M5 Kanone (trifft bei 1,0–1,2 rad) · M6 8 rote Münzen · 100 Münzen (153 im Level). Neue Sterne: `eisbeisser`,
  `wolkeninsel`, `bounceRot`, `bounce100` (alte IDs `bounce`/`rodel`/`rennen` bleiben).
- Geprüft mit echter Physik: Weg hinauf, Rodelbahn bis auf den See, Boss 3 Treffer → Stern → zurück vors Bild,
  Wettlauf gewonnen/verloren, Kanone auf der Insel gelandet, Eisbeißer befreit, alle Missionen bauen fehlerfrei.

### 1.18 Türen wie im Vorbild (2026-09-28, nach Video des Users)
- `castleDoor` backt nur noch Rahmen/Bogen; die Flügel sind beweglich (`doorWingMesh`, `L.doorFx`, `drawDoorFx`) und
  `castleDoor` liefert das Tür-Objekt, das als `.fx` an Tür-Daten hängt (Hub-Türen, Zimmer-Rückwege, Halle ↔ Garten,
  Sternwarte, Welt-Ausgänge `K.exit`, Wüstenstadt). Option `bare` = nur Flügel (Gartentor, Welt-Tore).
- `DoorSeq` (mode `'door'`): vor die Tür, Hand an den Knauf (`pl.doorReach`), rechter Flügel schwingt vom Spieler weg,
  hindurch, Sternblende auf die Figur; im neuen Raum schaut die Kamera auf die Ankunftstür (nächste `doorFx` zur
  Ankunftsstelle), Figur tritt heraus, Flügel fällt zu, Kamera schwenkt hinter sie. Ohne Ankunftstür (vor einem Bild):
  nur Blende. Die Sterntür (Obergeschoss) und die Finaltür haben ihren eigenen Ablauf behalten.

### 1.19 Sterben, aus dem Bild, Sternwahl wie im Video (2026-09-28, Cloud-Sitzung)
- **Keine Ausgangstüren** in den Gemälde-Welten (lokal schon erledigt). **Kurs** = `courseOf(key)`: Welt hinter einem Gemälde
  (HOME → `bild_*`), Unterwelten zählen zur Welt (dust → desert). Pausenknopf dort „Kurs verlassen“ → `leaveCourse()`.
- **Sterben** (`loseLife`): Figur kippt nach hinten um (Pose in `drawPlayer`, `pl.dieT`), Kamera rückt näher (`updateCamera`,
  `dk`), nach 1,5 s schließt sich die Blende als böse Katzenfratze (`Iris.close(x, y, d, true)`), 0,45 s schwarz. Im Kurs
  danach `PaintOut 'fly'` (auch Bounce-Berg), sonst Startpunkt wie früher. Doppelter Aufruf zieht nur ein Leben ab.
- **PaintOut** (Modus `out`): `fly` = klein und ausgestreckt aus dem Bild, wächst, landet bäuchlings, bleibt 0,9 s liegen,
  rappelt sich auf; `hop` (Kurs verlassen und nach jedem Stern in JEDER Gemälde-Welt außer dem 50-Münzen-Stern, über
  `exitCourse`) = hüpft heraus, landet auf den Füßen. Feste Kamera = Spielkamera nach der Landung (nahtlos). Pose über
  `pl.pose`; `place()` rechnet die Körpermitte gegen den Drehpunkt von `drawPose` (1,1 m über den Füßen).
- **Sternwahl** `CourseSel` jetzt im Stil des Videos und für alle Gemälde-Welten: weißer Schirm, Sterne drehen sich
  (WebGL in `CourseSel.render`, geholte golden, gesperrte blass ohne Nummer), Nummern + Name + Hinweis + 100-Münzen-Zeile
  und rundes „KURS n“-Emblem als HTML (`#courseSel`). Kurse (`COURSES`) behalten ihre Logik (sichtbar = geholte + so viele
  weitere, Welt je Mission, danach `Flyby`); alte Welten zeigen alle Sterne, Wahl ändert nichts (`arriveIn`).
  A/Enter/Klick = los → Weißblende (`.white-in`) ins Level; Z/Esc = zurück vors Bild. Kursnummer = Index in `PAINTINGS`
  + 1, Wüstenstadt 9. Sternliste je Welt: `courseStars(world)` (auch Sterntafel).
- Test-Haken: `g64.PaintOut.start(kurs, 'fly'|'hop')`, `g64.CourseSel.open(kurs, cb)`, `g64.loseLife()`, `g64.leaveCourse()`,
  `g64.Iris`. Headless-Chromium läuft ~5× langsamer als Echtzeit → Bilder per `advance` + `toDataURL` im selben Aufruf.
- Bekannt: Im Rechnerraum läuft ein Käfer (-7, -20) nah am Landeplatz und kann die gelandete Figur treffen.

### 1.20 Türen, Sternwahl, ZIP-Sätze, Fallschrei (2026-09-28, nach Videos des Users)
- **Türen:** hinter offenen Flügeln nur Schwarz wie im Vorbild (`drawDoorHole`: Stencil – Öffnung schwarz malen, dort Tiefe
  auf ganz hinten, Stencil löschen; Kontext jetzt mit `stencil: true`). Es öffnet der Flügel auf der Seite, auf der die
  Figur steht (links ODER rechts); bei der Ankunft derselbe Flügel von der anderen Seite. Nach dem Hereinkommen (1,0 s)
  sofort weiterspielen: kein Schwenk hinter die Figur, die normale Kamera übernimmt genau die Lage der Szenen-Kamera
  (`finish` rechnet yaw/pitch/dist daraus), der Flügel fällt im Hintergrund zu (`C` in `DoorSeq`).
- **Sternwahl:** Ducken (Z/Shift) verlässt sie nicht mehr, nur Esc/Pause. Hintergrund = Bild des Kurses (blass unter
  weißem Schleier, treibt langsam), Name/Hinweis auf dunkler Tafel, Sterngröße aus der Bildschirmgröße.
- **Alien-Katzen:** pro Satz einmal „ZIP ZIP ZIP“ (`Snd.zips`: drei Silben aus `glappa64-zip.mp3` in Aufnahme-Reihenfolge,
  reiht sich hinter die vorige ein; `Snd.zipStop` bei neuer Zeile), ausgelöst beim Tippen am Satzanfang (`sentenceStarts`).
- **Fallschrei:** `VOICE.fall` (Katzenstimme), ab `FALL_SCREAM` 8 m freiem Fall einmal je Sturz (nicht Stampfer/Hecht/
  Kanone). Die Mario-Aufnahme des Users wurde nur VERMESSEN (2,75 s, 440→710→~560→470 Hz), nicht eingebaut – rechtliche
  Linie (Abschnitt 4). Silben-Eintrag hat jetzt optional ein 6. Feld „volle Lautstärke bis“ (Vorgabe 0,65).

### 1.21 HUD aufgeräumt, Einstellungen im Pausenmenü (2026-09-28)
- Oben rechts keine Knöpfe mehr; nur auf Touch-Geräten der Pause-Knopf (`body.touch-ui`, gesetzt beim ersten Tippen).
- Pausenmenü „~ Einstellungen ~“: Soundeffekte / Musik / Vollbild als Knöpfe mit „an/aus“ (`onOff` in `syncButtons`,
  `syncFull`) und „Steuerung“ (`#btnCtrl`), das die Steuerungs-Tabelle `#controls` auf- und zuklappt; beim Öffnen der
  Pause ist sie immer zu (`showControls(false)` in `openPause`).

### 1.22 Kappi überarbeitet, Titelkopf mit festen Griffpunkten (2026-09-28)
- **Modell ohne Blender geändert** (Cloud-Sitzung): `secret/glappa64-models.g64m` direkt gepatcht (Lesen/Schreiben über
  `tools/blender/g64m.py`, bitgenau geprüft). `kappi.py` ist angepasst, ein neuer Blender-Build liefert dasselbe:
  Latz färbt jetzt die ganze Vorderseite unter der Brust (vorher orange Flecken neben den Trägern); Augen sind keine
  Geometrie mehr; Schnurrhaare aus `tools/blender/whiskers.py` (reine Geometrie, ohne bpy nutzbar): je Seite drei
  kräftige, spitze, leicht hängende Haare im Fächer, unten dunkler (72 Dreiecke). Kopf 952 → 768 Dreiecke.
- **Augen wie bei Mario 64** (`eyes2d` in `CAT_DEFS`): `FaceDecal` tastet einmal die vordersten Fell-Dreiecke des Kopfes ab,
  legt eine Fläche knapp davor (Normalen wie der runde Schädel) und malt die Augen als Textur mit Fell-Hintergrund
  (offen / halb / zu = Blinzeln). `drawEyes(G, hm, bl, o)` ersetzt die vier Lider-Aufrufe (Figur, Mitspieler, Figurenwahl,
  Titel). Die Lider bleiben im Modell (sonst bietet das Spiel Kappi nicht an), werden bei `eyes2d` aber nicht gezeichnet.
- **Mund** (`mouth` in `CAT_DEFS`): schwarzes Loch auf der Schnauze, geht auf, solange die eigene Figur ruft
  (`Snd.mouth()` aus der Dauer der letzten `Snd.voice`-Silbe, leicht flatternd). Nur die eigene Figur.
- **Titelkopf**: greifen nur an festen Stellen wie im Vorbild – Kappe/Oberkopf (Radius 0,6, wirkt nur über dem Schirm,
  damit die aufgemalten Augen stehen bleiben), linkes/rechtes Ohr (0,26), Mund (0,24) (`handles`, `pullW`). Über einem
  Griffpunkt zeigt der Zeiger eine Hand. Test: `g64.TitleHead.test.handles()` liefert die Bildschirmpunkte.

### 1.23 Kappi rot, Träger als Bänder, Mitspieler mit Mund und eigener Farbe (2026-09-30)
- **Anzug rot** (`#e8322a`, vorher orange `#ff8a2a`). **Träger** sind keine aufgemalten Flächen mehr (bei 12 Segmenten
  wurden hinten Zacken daraus), sondern eigene Bänder aus `tools/blender/straps.py` (ohne bpy nutzbar): hinten aus der
  Hose, über die Schulter, vorn bis in den Latz. `kappi.py` nutzt es; die G64M wurde ohne Blender gepatcht (Rumpf 312 → 564
  Dreiecke).
- **Mund für Mitspieler**: die Mundform (`m0..m4`, `PL_MOUTH`) steckt jetzt in der Pose (`POSE_KEYS`), `drawPose` zeichnet
  ihn. Posen älterer Versionen (ohne Mund) werden in `cleanState` mit `PL_MOUTH.rest` aufgefüllt.
- **Mehrere Kappis**: der eigene bleibt rot, jeder Mitspieler mit Kappi bekommt eine freie Anzugfarbe (`SUIT_COLS`: grün,
  blau, pink, gelb, lila, türkis, weiß; `suitVariant` färbt nur die roten Eckpunkte von Rumpf und Ärmeln um). Zip und die
  anderen Figuren bleiben, wie sie sind.
- **Kellergewölbe**: über den vier Türen keine Gewölberippe mehr (lief quer durchs Namensschild).

### 1.24 Start-Taste statt PRESS-START-Kasten, Mund nie über der Nase (2026-10-01)
- Titel: statt des großen Kastens nur die Taste – `Leertaste` am PC, blauer `A`-Knopf bei Controller oder Handy
  (`#titleScreen[data-dev]`, gesetzt im Titel-Zweig der Eingabe aus `Input.st.device` + `(pointer: coarse)`).
  Unter 600 px Breite mittig über dem Besuchszähler (unten links lag sie dort auf dem Zähler).
- Mund: `features()` misst jetzt `F.noseLow` (tiefster Eckpunkt in Nasenfarbe); `buildMouth` schiebt einen weit
  offenen Mund (O beim Erschrecken/Staunen, Schreien im Spiel) als Ganzes nach unten, statt ihn über die Nase wachsen zu lassen.
  Nachgebessert (`?v=167`): Abstand 0,025 zur Nasen-Unterkante (zählt nur direkt unter der Nase), höchstens 0,03 nach
  unten schieben, den Rest weniger weit öffnen (ganz unten stach die Schnauzenkante durch); Abstand zur Haut wächst mit
  der Hangneigung. Test: Zeiger ganz oben (Kopf schaut hoch) + `TitleHead.test.st.startle = g64.clock`.

- Sternwarte: die Tür zurück in die Schlosshalle stand mit 5 m Rahmen in einer 8 m breiten Öffnung (links/rechts je
  1,5 m Lücke, Fackeln frei in der Luft). Seitenwände reichen jetzt bis an den Rahmen, der Sturz ist rahmenbreit (`?v=166`).

### 1.25 Sternvitrine in der Schlosshalle neu (2026-10-01, `?v=168`)
- Glasschrank rechts vom Eingang (`buildHall`, `drawVitrine`): Sockel mit Schubladen, Pilaster mit Goldkapitellen,
  Goldrahmen mit Rosetten, Gesims mit Stern-Wappen (MESH.star), Zähltafel `got / 45` (Textur nur bei Änderung neu),
  Samt mit Sternenhimmel, 5 Regalböden × 9 Podeste. Jeder Stern hat einen festen Platz (Reihenfolge `STARS`):
  gefunden = golden, wiegt sich, blitzt ab und zu; fehlend = lila Umriss. Glasscheibe mit Reflexen in `L.drawAlpha`.
- Test: nach dem Laden ~1 s warten (sonst setzt der Ladevorgang den Garten zurück), `g64.state.stars[id] = true`,
  `g64.enterLevel('hall')`, Kamera per Flyby auf `[14, 3, 13] → [14, 2.8, 19]`.

### 1.26 Trip-Stillstand weich + Fraktal-Schleier zur Musik (2026-10-01, `?v=169`)
- Gilt in Trip-Welten (`fraktal` trip 1, `bild_fraktal` = Regenbogensaal trip 0,7). Ablauf nach `pl.idleT`: Drift 2→9 s,
  Höhepunkt (`Skybox.lsd`) 8→14 s, **Fraktal-Schleier** 14→24 s. Alle drei folgen weichen Federn (`follow`, kritisch
  gedämpft, ω 2,2–2,6): raus in ~2 s statt vorher linear 0,4 s. Kein Trip bei offenem Dialog.
- **Farbflackern behoben**: der Shader drehte den Farbton um `uTrip * uTime * 0.35` – bei jeder Änderung von `uTrip`
  (Ein-/Ausblenden) sprang die Farbe um mehrere rad pro Bild. Jetzt `uTripPh`, auf der CPU aufsummiert.
- `FracVeil`: eigene Leinwand `.frac-veil` (z-index 840: über HUD/Touch/Figur, unter Dialog 850/Pause), halbe Auflösung,
  Julia-Menge mit c auf der Hauptkardioide, wächst vom Rand mit ausgefranster Front zu. Musik: `Snd.musicLevels()`
  (Analyser zwischen `fanG` und `musicBus`), je Band auf seine eigene Spanne normiert; Bass = Zoom-Stoß/Ringe/Aufleuchten,
  Mitten = Formtempo, Höhen = Funkeln. Ohne Musik 120-bpm-Puls.
- Test: `g64.enterLevel('bild_fraktal'); g64.Flyby.start(g64.cur, '', '', true)`, Titel ausblenden, `g64.pl.idleT = 30`,
  Werte in `g64.tripSp` (d/p/f) und `g64.FracVeil.au`; Bild per `page.screenshot` (Schleier ist eigene Leinwand).

### 1.9 Handy: Hoch- und Querformat (2026-09-27)
- Hochformat war kaum spielbar: fester senkrechter Blickwinkel 0,95 rad → bei 375×812 nur ~26° waagrecht. Jetzt `fovFor(aspect)`
  (bei `toScreen`): waagrecht mind. `H_FOV_MIN` 0,9 rad, senkrecht gedeckelt auf 1,5 rad → Hochformat 86°/47°, Querformat
  unverändert 54°/96°.
- Touch-Knöpfe: bei ≤ 600 px Breite kleinerer Knüppel + Knöpfe rechts gestapelt (vorher lag Z über dem Knüppel), Dialog und
  Hinweise über den Knopf-Block geschoben. Knüppel-Weg aus der echten Größe (`travel`).
- Geprüft per `resize_window` 375×812 (mit Touch-Emulation) und 812×375: keine Überlappung, Titel/Dateiwahl/Pause passen.

---

## 2. Offene Aufgaben (Reihenfolge = Vorschlag)

### 2.0 Mehrspieler: Relais fehlt (Entscheidung des Users offen)
Ohne Relais bleibt die Verbindung zwischen verschiedenen Netzen Glückssache. Optionen:
1. **TURN-Zugang bei einem Anbieter** (User legt Konto an, Zugangsdaten in `ICE_SERVERS`; stehen dann im Seitenquelltext).
2. **Öffentliches Nachrichten-Relais** (z. B. öffentlicher MQTT-Broker per WebSocket) als Rückfall, verschlüsselt mit dem
   Raum-Code – nichts auf dem VPS. Mein Test der Broker wurde am 27.09. von der Sicherheitsprüfung blockiert → nur mit
   ausdrücklichem OK des Users angehen.
3. **coturn auf dem VPS** (widerspricht „nichts auf dem Server“, braucht root + UDP-Ports).
- Hintergrund-Tabs senden keine Posen (kein requestAnimationFrame) – im Browser normal, Gastgeber sollte im Vordergrund spielen.

### 2.x ERLEDIGT 2026-09-26: Hocke-Moves und Mehrspieler – siehe 1.7/1.8.

### 2.3 Kleinere Punkte
- Köpfe + Körper der 4 Katzen nach Blender (Körper hat sichtbare Naht zwischen Brust- und Hüft-Ellipsoid).
- Kappis Kopf-Budget weiter senken (jetzt 768 Dreiecke).
- Wandsprung-Schacht im Gym neu messen (Kommentar bei `MAX_KICKS` ist als veraltet markiert).
- Donald-Duck-Mod wurde abgelehnt (s. 4); angeboten: eine **eigene** Enten-Figur über die Pipeline.

---

## 3. Testen

### 3.1 Lokal
- Server: `.claude/launch.json` → `glappa-static` (Port 8098) mit `preview_start`. Aufruf
  `http://localhost:8098/secret/glappa64.html?debug` (Testlevel: `&gym`). Nicht per `file://` (Modelldatei per fetch).
- Konsole zeigt pro Aufruf 2× 404 für `secret/mp3/*.mp3` und `localhost:8080`-Fehler – alt, harmlos.

- Cloud-Sitzung (Linux): `python3 -m http.server 8098`, Playwright (`playwright-core` im Scratchpad) mit
  `executablePath: '/opt/pw-browsers/chromium'`, `args: ['--enable-unsafe-swiftshader']` – **ohne** `--use-gl=angle`
  (hängt). Software-Grafik: im Schlossgarten ~7 s pro Bild, `g64.advance` also sparsam; lieber echte Zeit laufen lassen.

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

### 3.2a Kurs und Türen testen (2026-09-28)
- `g64.enterCourse('bounce', m)` (m = 0…5), `g64.Flyby.skip()`; Figuren unter `g64.cur.king/chomp/racer/cannon`.
  Freie Kamera für Bilder: `cur.flyby = [[0, pos, look], [100, pos, look]]; Flyby.start(cur, '', '')`, ein Frame, Bild.
- Fallen: Nach `start()` kommt der Wolki-Dialog **zeitversetzt** (setTimeout) und frisst die nächste B-Taste; nach einem
  Sturz ins Wolkenmeer ebenso („Autsch!“). Vor Eingaben `while (g64.Dialog.open) g64.Dialog.close()`.
  Blende (Iris) läuft über echte Zeit (Türen, Kurs verlassen): nach dem Auslösen ~1 s echt warten.
- Hintergrund-Tab hat `innerWidth 0` → vor Bildern `resize_window 1280x720`. Bilder/Audio aus dem Browser: kleiner
  POST-Empfänger (node, Port 8097, CORS `*`), `canvas.toDataURL` im selben Aufruf wie `renderOnce()`.

### 3.2b Mehrspieler lokal testen
- Kein eigener Server nötig: `glappa-static` reicht, die Verbindung läuft auch lokal über den öffentlichen PeerJS-Vermittler
  (Internet nötig). **Zwei Tabs im selben Browser beweisen nichts über NAT** (Verbindung über lokale Kandidaten).
- NAT-Ausfall nachstellen: im Gast-Tab VOR dem Start `window.RTCPeerConnection = class extends Orig { constructor(c, ...r)
  { super({ ...(c || {}), iceServers: [], iceTransportPolicy: 'relay' }, ...r); } }` → muss nach 15 s `NO_DIRECT` zeigen.
  Browser ohne WebRTC: `window.RTCPeerConnection = undefined` → `NO_RTC`. Zwei Spieler = zwei Browser-Tabs: Tab A `g64.Net.connect('NEW')`, Tab B `…?debug&raum=<CODE>` oder
  `g64.Net.connect('<CODE>')`.
- **Beide Tabs teilen `localStorage`** (Name + Spielstand!) → Namen per `g64.Net.setName(…)` direkt vor dem Verbinden setzen.
  Hintergrund-Tabs haben `innerWidth 0` → vor Bildaufnahmen `tabs_select`/`resize_window`.
- Frames per `g64.advance` treiben, dazwischen `await new Promise(r => setTimeout(r, 200))`, damit Nachrichten ankommen.
  Posen und das automatische Nachfassen (`tick`) laufen nur, solange Frames laufen.
- Am 26.09. so geprüft: Beitritt per Link, Posen in beide Richtungen, Sterne in beide Richtungen, Gastgeber lädt neu
  (gleicher Code, Gast verbindet sich selbst wieder), Gastgeber verlässt (Gast bekommt sofort Bescheid), falscher Code.

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
