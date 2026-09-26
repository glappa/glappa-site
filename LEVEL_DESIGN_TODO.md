# SM64 Reborn – Level-Design To-Do

> Übergabe an Claude Code. Diese Datei gehört ins Wurzelverzeichnis des Projekts.
> Quelle: das Dokument „Level-Design To-Do (Mario-64-Stil)“.
>
> **Projekt in diesem Repo:** SUPER GLAPPA 64 – `secret/glappa64.html` + `secret/glappa64.js`
> (eigene WebGL-Engine ohne Bibliotheken, alle Sounds per WebAudio, eine JS-Datei).
> Fundstellen unten nennen Funktions-/Konstantennamen in `secret/glappa64.js` (Zeilennummern wandern zu schnell).

## Arbeitsanweisung für Claude Code

1. Lies zuerst das Projekt (Engine, Ordnerstruktur, vorhandene Systeme, README/CLAUDE.md) und gleiche es mit dieser Liste ab.
2. Hake Punkte, die schon umgesetzt sind, hier ab (`- [x]`) und notiere kurz, wo im Code sie liegen.
3. Arbeite die offenen Punkte in der Reihenfolge der Phasen ab (Phase 1 zuerst). Pro Punkt: kleiner, sauberer Commit, Code kurz und lesbar halten.
4. Keine riesigen Umbauten ohne Rückfrage. Wenn eine Entscheidung offen ist (z. B. Werte, Stil), einen sinnvollen Standard wählen und in `## Entscheidungen` unten notieren.
5. Nach jeder Phase: Build/Tests laufen lassen und diese Datei aktualisieren.
6. Rechtlicher Hinweis: Mechaniken nachbauen ist ok. Keine Original-Assets (Modelle, Texturen, Musik, Sounds, Namen/Logos) von Nintendo verwenden – eigene oder freie Assets nutzen.

---

## Phase 1 – Moveset & Game Feel (Basis für alles)

Level werden für Bewegungen gebaut. Erst das Moveset tunen, dann Level bauen.

| Bewegung | Eingabe | Wofür Level sie brauchen | Stand im Code |
| --- | --- | --- | --- |
| Laufen analog (Schleichen/Gehen/Rennen) | Stick | Schmale Stege, schlafende Gegner | ✅ Tempo folgt dem Stick (`top = RUN * mag`), Gangart `pl.gait` ('sneak' < `GAIT_SNEAK` < 'walk' < `GAIT_WALK` < 'run') mit eigener Schleich-Pose; Tastatur: **G** halten = schleichen |
| Sprung, Doppel-, Dreifachsprung | A im Rhythmus beim Rennen | Höhe gewinnen | ✅ `updatePlayer` (Sprungkette über `CHAIN_WINDOW`) |
| Salto rückwärts | Ducken + A | Hohe Kante direkt über Spieler | ✅ `updatePlayer` (`'backflip'`) |
| Seitensalto | Richtungswechsel + A | Hoher Sprung nach Wende | ✅ `updatePlayer` (`pl.skid` + A → `'sideflip'`) |
| Weitsprung | Rennen + Ducken + A | Große Lücken | ✅ `updatePlayer` (`'long'`, `LONG_WINDOW`) |
| Wandsprung | A bei Wandkontakt | Schluchten, Abkürzungen | ✅ `updatePlayer` (`pl.wallT` → `'wallkick'`); begrenzt über `MAX_KICKS`/`KICK_FALLOFF`/`canWallKick`: max. 4 pro Flug, jeder ×0,8 schwächer, dieselbe Wand nie zweimal hintereinander (Schacht endet bei ~15 m) |
| Stampfattacke | In der Luft Ducken | Pfähle, Schalter, Boss-Schwachpunkte | ✅ `updatePlayer` (`'pound'`), Landung in `onLand` |
| Schlag / Tritt / Hechtsprung | B | Gegner, Kisten | ✅ `attack`, `hitInFront`, `startDive` |
| Kante festhalten & hangeln | automatisch | Kanten hochziehen, Deckengitter | ✅ Greifen `tryLedgeGrab`, Hochziehen `updateLedge`, Kanten-Hilfe `tryMantle`, Hangeln (Stick seitlich, `SHIMMY` 1,8 m/s, über Blockfugen via `ledgeAt`); Deckengitter → Phase 4 |
| Greifen & Werfen | B nahe Objekt | Bomben werfen, Boss schleudern | ✅ Knallkisten: `pickUp`/`throwHold`/`dropHold`; Boss → Phase 5 |
| Schwimmen | A im Wasser | Wasserlevel, Luftvorrat | ✅ `updatePlayer` (`'swim'`), Luft über `updateAir` |
| Rutschen | steile Flächen | Rutschbahnen, Eis | ✅ Rutschbahn (`ramp(..., {chute})`), Eis (`tag 'ice'`), steile Rampen ab 44° (`STEEP`, `steepDown`) – bergauf hinein bremst die Schwerkraft, dann geht es bergab |

- [ ] Alle Bewegungen implementieren und in einem leeren Test-Level („Gym“) tunen
  - Alle Bewegungen der Tabelle sind drin; Gym `buildGym` (nur über `?gym`, mit `?debug&gym` + `g64.measure()` zum Nachmessen). Luftphysik entschieden 2026-09-25 (siehe Entscheidungen)
- [x] Trägheit (spürbares Beschleunigen/Bremsen)
  - `GROUND_ACC`/`GROUND_BRAKE`/`OVER_BRAKE`/`SKID_BRAKE` + Kehrtwenden-Rutscher (`pl.skid`), Eis extra glatt. Werte hat der User am 2026-09-21 bewusst straff gewünscht („zu rutschig“) – nicht zurückdrehen.
- [x] Coyote Time + automatisches Hochziehen an Kanten
  - Coyote Time: `pl.coyote` (0,06 s nach dem Verlassen einer Kante darf man noch springen). Kanten-Hilfe `tryMantle`: liegt die Oberkante zwischen Fuß und `GRAB_LO` und drückt der Stick dagegen, zieht Glappo sich selbst hoch (kurze Kletteranimation). Höhere Kanten (`GRAB_LO`…`GRAB_HI`) werden wie bisher gegriffen (`tryLedgeGrab`), Stick zur Wand zieht hoch
- [x] Fallschaden nur ab großer Höhe; Stampfattacke vor Landung verhindert ihn
  - `FALL_HURT` = 15 m → 2 Segmente, `FALL_HURT_BIG` = 30 m → 4 Segmente; gemessen vom Gipfel (`pl.fallTop`, jeder neue Absprung/Kantengriff/Wasser setzt ihn neu). `onLand` → `hardLanding` (kurz auf dem Hosenboden, kein Rückstoß). Kein Schaden mit Stampfer, ins Wasser, auf Federn und Rutschbahnen. Im Gym geprüft: 12 m nichts, 16 m −2, 31 m −4, Stampfer aus 20 m nichts
- [x] Lebensenergie: 8 Segmente, Münzen heilen, Luftvorrat unter Wasser
  - 8 Segmente (`Power`, `run.health`), Münzen heilen (`addCoins`). Luft wie im Genre-Vorbild über dieselbe Anzeige: `updateAir` – Kopf unter Wasser = alle `AIR_STEP` (3 s) ein Segment weg (Blubbern + Blasen), an der Oberfläche schwimmend alle `AIR_REFILL` (0,4 s) eins zurück, bei 0 ertrinkt man; die Anzeige bleibt unter Wasser sichtbar (`Power.hold`)
- [x] Messtabelle: Höhe/Weite jeder Bewegung in Welt-Einheiten (als Konstanten im Code)
  - `MOVES` (Meter, gemessen, nicht geschätzt); `measureMoves` = `g64.measure()` fährt jede Bewegung mit der echten Physik im Gym ab und meldet die Abweichung zur Tabelle (`diff`)
- [x] Level-Raster aus diesen Werten ableiten (z. B. Lücke = 80 % Weitsprung)
  - `GRID` (direkt unter `MOVES`): Stufe, Sprung-Kante, Greif-Kante, Salto-Höhe, Dreifachsprung-Höhe, Laufsprung-/Weitsprung-Lücke, Wandsprung-Schacht, Kriechhöhe – alles `FAIR` = 80 % des Messwerts. Das Gym baut seine Stationen genau daraus (`buildGym`)
- [x] Blob-Schatten direkt unter dem Spieler
  - `shadowAt` (schrumpft mit der Höhe), Aufruf in `render` für Spieler, Gegner, Sterne
- [x] Partikel: Staub beim Landen, Funken beim Schlagen, Wasser, Lava
  - `burst`/`dust`/`sparkle`/`jumpRing`; Landestaub in `onLand`, Treffer-Funken in `hitInFront`, Spritzer/Blasen beim Schwimmen in `updatePlayer`, Glut in `burnPlayer`
- [x] Sound + Stimme für jede Aktion
  - Klänge (`Snd.*`, alles live per WebAudio): Sprünge, Salti, Schläge, Hechtsprung, Stampfer, Greifen/Klettern, Schwimmen, Treffer, Bonk – neu: Schritte je Gangart und Boden (`Snd.step`, Schleichen lautlos), Landen (`Snd.land`), Kehrtwende (`Snd.skid`), Rutschen (`Snd.scrape`), Hangeln, Blubbern/Luftholen unter Wasser
  - Stimme `Snd.voice(name)`: eigene Katzen-Silben per Formant-Synthese (`VOICE`, `FORMANT`), je Figur etwas andere Tonhöhe (`VOICE_PITCH`); Lautstärke offline gegen die Sprung-Klänge abgeglichen. **Nicht mit dem Ohr abgenommen** – bitte einmal anhören

## Phase 2 – Kamera

- [ ] Verfolgerkamera, frei drehbar in festen Schritten (45°) + Zoom
  - Verfolgen, stufenlos drehen und Zoom (Mausrad) gibt es (`updateCamera`), 45°-Schritte fehlen
- [ ] Kamera-Zonen mit fester Perspektive für enge Stellen/Boss-Arenen
- [x] Kamera weicht Wänden aus
  - `updateCamera`: Strahl gegen große Wände/Gebäude (`CAM_HIT`, `rayBox`), nie unter den Boden
- [ ] Intro-Kameraflug beim Levelstart (zeigt Wahrzeichen + Missionsziel)
  - bisher nur Levelname-Einblendung (`showCourse`)
- [ ] Kurzer Kameraschwenk, wenn ein Stern erscheint

## Phase 3 – Kernsysteme (Sterne, Münzen, Objekte)

**Sterne:** 7 pro Level (6 Missionen + 100-Münzen-Stern). Mission wird vor Betreten gewählt, Name ist ein Hinweis.

- [ ] Stern-Auswahl-Menü (Name, gesammelt ja/nein)
  - Pause zeigt alle Sterne mit Namen/Hinweis (`openPause`), eine Auswahl vor dem Betreten gibt es nicht
- [ ] Stern-Spawn: fest platziert / nach Boss / nach Schaltern / nach 8 roten Münzen / bei 100 Münzen
  - fest (`K.star`), nach 8 roten Münzen und bei 50 Münzen (`collectCoin`/`addCoins`), nach Aufträgen (`K.quest`); Boss/Schalter/100 fehlen
- [ ] Beim Einsammeln: Jingle, Pose, Speichern, zurück in den Hub
  - Jingle, Siegerpose, Speichern ✅ (`collectStar`, `StarFx`); man bleibt aber im Level
- [ ] Level-Varianten je Mission (Objekte an/aus pro Stern-Nummer)
- [ ] Speichersystem (Sterne, Münzrekord, freigeschaltete Türen/Mützen)
  - Sterne + Sterntür in `localStorage` (`state`, `save`); Münzrekord/Mützen fehlen

**Münzen:** Gelb = 1, Rot = 2 (genau 8 pro Level → Stern), Blau = 5 (von großen Gegnern / blauer Schalter, zeitlich begrenzt). 50 Münzen = 1-Up, 100 = Stern.

- [x] Münzen inkl. roter Münzen mit steigender Tonhöhe (1–8)
  - `collectCoin`, `Snd.red(n)` (Tonleiter C5…C6), Wertigkeit 1/2/5; rote Münzen bisher nur im Schlossgarten
- [x] Blauer Schalter mit Timer + Tick-Geräusch
  - `pressSwitch`/`updateSwitch` (12 s, Tick wird am Ende schneller)

**Objekte & Power-Ups:**

- [ ] Kanone (wird durch NPC geöffnet, freies Zielen, Flug)
- [ ] 1-Up-Pilze (auch fliehende, auch durch Reihenfolge-Trigger)
- [ ] Kisten / !-Blöcke mit Inhalt (Münzen, 1-Up, Mütze, Panzer)
  - es gibt Schatzkisten mit Münzen (`CHEST_TAKE`), keine Blöcke zum Aufschlagen
- [ ] Panzer zum Surfen auf Wasser und Lava
- [ ] Mützen: Flügel (Fliegen), Metall (unverwundbar, sinkt), Unsichtbar (durch Gitter) – freigeschaltet über Schalter in Geheimleveln

## Phase 4 – Hindernis-Baukasten

Jedes Hindernis: einführen (sicher) → variieren → mit Gefahr kombinieren.

- [x] Bewegliche Plattformen (linear, Kreis)
  - `Level.mover(..., fn(t))` beliebige Bahn, nimmt den Spieler mit (`updateMovers`), Schwung beim Absprung (`pl.carry`)
- [ ] Kippende / wippende Plattformen
- [ ] Zerfallende / sinkende Plattformen
  - verwandt: Blink-Plattformen (`Level.blinker`) und Kolben (`'piston'`)
- [ ] Rotierende Objekte (Balken, Zahnräder)
  - rotierende Spirale in der Fraktalwelt, Zahnräder im Uhrwerk sind Deko
- [ ] Förderbänder / Strömungen
  - Förderband ✅ (`tag 'conveyor'`), Strömungen fehlen
- [x] Rutschen
  - `ramp(..., { chute: true })`, Bauchrutscher mit Bande (`updatePlayer`)
- [ ] Stangen, Seile, Deckengitter
- [x] Trampoline / Federn
  - `tag 'awning'`/`'bouncy'` (+ `bounce`-Stärke) in `onLand`
- [ ] Windzonen
- [ ] Wasser mit Luftblasen
- [ ] Lava (Spieler springt brennend hoch, 3 Segmente Schaden) und Treibsand
  - Lava ✅ (`burnPlayer`: 3 Segmente, hochspringen, in der Luft lenkbar), Treibsand fehlt
- [ ] Rollende Felsen, Zerquetscher
  - rollende Kugeln ✅ (`makeRoller`), Zerquetscher fehlen
- [ ] Schalter mit temporären Wegen
- [ ] Pfähle für Stampfattacke

## Phase 5 – Gegner & Bosse

| Muster | Verhalten | Besiegen durch |
| --- | --- | --- |
| Patrouille | Pfad ablaufen, bei Sicht verfolgen | Draufspringen, Schlag |
| Kamikaze | Rennt auf Spieler zu, explodiert | Greifen & werfen / ausweichen |
| Angekettet | Angriff im Radius | Nur ausweichen |
| Zerquetscher | Fällt/kippt um | Ausweichen, dann auf Rücken stampfen |
| Schubser | Stößt von Plattformen | Zurückstoßen (z. B. in Lava) |
| Schläfer | Wacht bei lauten Schritten auf | Heranschleichen |
| Geist | Nur von hinten verwundbar | Von hinten schlagen |
| Flieger/Werfer | Wirft von oben | Draufspringen / ausweichen |
| Unterwasser-Lauerer | Schießt aus Versteck | Ausweichen |

Vorhanden (`make*`/`upd*`): Grummel (Patrouille), Knallkiste (Kamikaze, greifbar), Stachler, Flatterling, Hüpfer, Geist, schüchterner Geist (`makeShyGhost`), Virus, Wurm, Pop-up, Spam-Mail, Bug, rollende Kugel.

- [ ] Gegner-Basisklasse: Erkennungsradius, Tempo, Angriff, Schwachstelle, Münzbelohnung
  - Gegner sind einfache Objekte mit `type` + eigener `upd*`-Funktion, keine gemeinsame Basis
- [ ] Jeder Gegner: Warn-Animation + eigener Sound
- [ ] Boss-System: 3 Treffer/Phasen, eigene Arena am Wahrzeichen, Dialog vor/nach Kampf
- [ ] Boss-Idee Wurf: Boss greifen und werfen; Endboss: am Schwanz packen, drehen, gegen Bomben am Arenarand schleudern
- [ ] Gegner nie direkt am Levelstart (außer harmlose)

## Phase 6 – Hub-Welt (Schloss)

- [x] Level-Eingänge als Bilder/Portale mit Themen-Vorschau
  - Gemälde mit generierten Vorschaubildern (`ArtGen`, `PAINTINGS`, `PAINT_ROOMS`/`buildPaintRoom`), Reinspringen (`enterPainting`)
- [ ] Stern-Türen (z. B. 1, 3, 8, 30, 50, 70), immer 2–3 Level gleichzeitig offen
  - bisher eine Sterntür (4 Sterne → Obergeschoss, `useStarDoor`)
- [ ] Stockwerke: EG (leicht), Keller (mittel), 1. Stock (schwer), Turm (Finale); Schlüssel nach Boss-Leveln
  - Stockwerke gibt es (`hall`, `keller`, `og` mit Turm, `hof`; Rückwege über `HOME`), Schlüssel fehlen
- [ ] Hub verändert sich nach Bossen (z. B. Wasser ablassen öffnet Bereich)
- [ ] 3–5 versteckte Eingänge zu Geheimleveln
- [x] Außenbereich mit Geheimnissen (z. B. fangbares Tier gibt Stern)
  - Schlossgarten: Toasti fangen (`updToast`/`catchToast`), scheue Hühner (`c.flee`), Sonnenstrahl (`sunTrigger`), Nische hinter dem Wasserfall
- [x] NPCs mit Tipps
  - wandernde Bewohner mit Dialogen (`K.life.npc`, `L.talkers`), Schilder (`K.talker`)
- [x] Pausemenü mit Stern-Zähler und Level-Übersicht
  - `openPause`: Zähler, Sternliste mit Fundort-Hinweisen, „Zurück“-Knopf

## Phase 7 – Level bauen (15 Hauptlevel + 3 Boss-Level + Geheimlevel)

Themen-Vorlage (eigene Namen verwenden):

| # | Thema | Kern-Idee |
| --- | --- | --- |
| 1 | Wiese + Berg | Tutorial, Berg als Wahrzeichen, Boss oben, Rennen |
| 2 | Schwebende Festung | Vertikaler Aufstieg, Zerquetscher |
| 3 | Piratenbucht | Unterwasser, Schiff taucht in Mission 2 auf |
| 4 | Schneeberg | Start oben, Rutsche im Inneren, NPC-Rennen |
| 5 | Geisterhaus | Innenlevel, Rätsel, Geister-Gegner |
| 6 | Höhle | Labyrinth, Giftgas, unterirdischer See |
| 7 | Lava | Schubser-Gegner, Panzer-Surfen, Vulkan innen |
| 8 | Wüste | Pyramide, Treibsand, Wirbelsturm |
| 9 | Hafen | Strömungen, zweiter Level-Teil nach Boss |
| 10 | Schneemann | Eis-Physik, Wind |
| 11 | Wasserpegel | Einstiegshöhe/Schalter setzen den Wasserstand |
| 12 | Hoher Berg | Pilzplattformen, Wind, geheime Rutsche |
| 13 | Größenwechsel | Gleiche Insel groß und klein |
| 14 | Uhrwerk | Uhrzeit beim Betreten = Geschwindigkeit |
| 15 | Himmel | Fliegender Teppich auf fester Route, Finale |

Vorhandene Welten (Stand vor dieser Liste, noch nicht nach der Master-Checkliste gebaut): Terminal-Tal, Video-Bucht (Wrack, Schwimmen), Hüpfburg (Eis, Rodelbahn), Spuk-Home, Uhrwerk (echte Uhrzeit), Fraktalwelt, Pilzwald, Neon-Disco, Wüstenstadt (Pyramide) + Schlossräume.

Pro Level – Master-Checkliste (für jedes Level kopieren):

**Konzept**
- [ ] Thema in einem Satz + Farbpalette
- [ ] Einzigartige Kern-Idee
- [ ] Wahrzeichen, vom Start aus sichtbar
- [ ] 2–3 Bewegungen, die das Level besonders fordert

**Layout**
- [ ] Kompakt: Start bis Wahrzeichen 60–120 s
- [ ] 3–5 Zonen mit eigenem Charakter
- [ ] Hauptweg + mind. 2 Nebenwege, keine leeren Sackgassen, Schleifen statt Enden
- [ ] Starke Vertikalität, Finale oben
- [ ] Mind. eine Welt-Veränderung (Wasser, Größe, Missions-Variante)
- [ ] Auffangnetz unter schweren Stellen, nur wenige tödliche Abgründe
- [ ] Mind. eine Profi-Abkürzung (Wandsprung/Weitsprung)
- [ ] Erst Graybox, nur mit Moveset testen, dann Grafik

**Inhalt**
- [ ] 6 Missionen mit Hinweis-Namen, mind. 5 verschiedene Typen (Boss, Rennen, 8 rote Münzen, 5 Geheimschalter, Kanone, Kletter-Challenge, NPC-Aufgabe, Puzzle, Innenraum)
- [ ] Stern 1 leicht und führt durchs halbe Level
- [ ] 8 rote Münzen (2–3 gut versteckt), 120–150 Münzen gesamt, Münzreihen als Wegweiser
- [ ] 3–5 Hindernistypen, 3–4 Gegnertypen passend zum Thema
- [ ] Kanone, mind. 3 1-Ups, ein Bereich nur mit Mütze erreichbar
- [ ] NPC mit Dialog oder Aufgabe
- [ ] In den ersten 10 Sekunden passiert etwas

**Gefühl**
- [ ] Intro-Kameraflug, Kamera-Zonen an engen Stellen
- [ ] Musik + Variationen (Wasser, Innen, Boss)
- [ ] Mind. 2 lustige Momente/Interaktionen

**Test**
- [ ] 3+ Playtests mit neuen Spielern
- [ ] 2–5 Minuten pro normalem Stern
- [ ] Todesstellen geprüft und fair gemacht

## Phase 8 – Schwierigkeitskurve

| Phase | Level | Sterne nötig | Fokus |
| --- | --- | --- | --- |
| Erdgeschoss | 1–4 | 0–12 | Grundbewegungen |
| Keller | 5–8 | 12–30 | Gegner-Kombis, Innenlevel |
| 1. Stock | 9–12 | 30–50 | Präzision, neue Physik |
| Turm | 13–15 | 50–70 | Timing, tödliche Abgründe |
| Finale | Boss 3 | 70 | Alles kombiniert |

- [ ] Insgesamt 120 Sterne, 70 für das Ende nötig
  - aktuell 41 Sterne (`STARS`, davon 4 in Staub II), 4 für die Sterntür
- [ ] Jeden Stern mit Schwierigkeit 1–5 bewerten (Datei/Tabelle im Projekt)
- [ ] Debug-Werkzeuge: Level-Auswahl, Stern-Cheat, Todes-Heatmap-Logging
  - `?debug` gibt `window.g64` (Level betreten, Sterne setzen, Frames von Hand schalten), aber ohne Oberfläche und ohne Heatmap

---

## Entscheidungen

(Claude Code trägt hier getroffene Standard-Entscheidungen ein.)

- **Ablage:** Diese Liste liegt im Wurzelverzeichnis des Repos `glappa-site`; das Spiel selbst liegt unter `secret/`. Achtung: Das Repo ist auf dem VPS der DocumentRoot – nach einem Push ist die Datei öffentlich lesbar (wie `README.md`).
- **Commits:** nur lokal auf `main`, kein Push – der Spielstand war bis 2026-09-23 bewusst noch nicht auf GitHub.
- **Einheiten:** 1 Welt-Einheit = 1 Meter. Glappo ist 2,2 m groß; die Physik rechnet in „64er-Einheiten pro Frame“ (`UF` = 0,4125 m/s) und läuft mit 120 Schritten/s.
- **Trägheit:** bleibt so straff, wie der User sie am 2026-09-21 eingestellt hat.
- **Gym:** nur über `?gym` erreichbar (kein Eingang im Spiel), „Zurück“ führt in den Schlossgarten. 1-m-Raster, Linien alle 5 m, Messlatten 12 m. Die Messbahn `x = -10` bleibt frei, dort misst `g64.measure()`.
- **Messbedingungen `MOVES`:** voller Anlauf, Stick die ganze Zeit in Sprungrichtung, Landung auf gleicher Höhe. Das ist die *maximale* Reichweite – das Raster zieht davon 20 % ab (`FAIR` = 0,8).
- **Fallschaden:** ab 15 m (2 Segmente), ab 30 m (4). Ein Dreifachsprung (8 m) tut nie weh; die Burgtürme und Terrassen (20–30 m) schon. Kein Schaden mit Stampfer, ins Wasser, auf Federn, Rutschbahnen und zu steilen Hängen.
- **Luft:** dieselbe Anzeige wie die Energie (wie im Genre-Vorbild): 3 s pro Segment unter Wasser, auffüllen nur schwimmend an der Oberfläche (0,4 s pro Segment) – das heilt dort auch Treffer-Schaden. Watend im flachen Wasser passiert nichts.
- **Kanten-Hilfe:** nur mit Stick zur Kante, nicht an Zaunlatten und schmalen Kanten (< 0,54 m).
- **Gangarten:** Schwellen 35 % / 75 % von `RUN`; Tastatur: G halten = schleichen (Strg/Alt kollidieren mit Browser-Kürzeln).
- **Steile Hänge:** rutschen ab 44°. Die steilste begehbare Rampe in den bestehenden Welten hat 41° (nachgemessen), dort ändert sich nichts. Neue Level: Hang ≥ 45° bauen, wenn man dort nicht hochlaufen soll.
- **Stimme:** keine Worte, nur Katzen-Silben (eigene Synthese, keine Samples) – so gibt es keine Nähe zu Original-Stimmen. Hängt am Sound-Schalter.
- **Luftphysik & Tempo – entschieden 2026-09-25** (User: „nicht so schnell, wie im Super Mario 64, der Dreifachsprung geht viel zu hoch – muss genervt werden“). Umgesetzt in `secret/glappa64.js` beim Spieler-Block:
  - **Luftschub wie im Vorbild:** `AIR_THRUST` = 1,5 E/F² (vorher 2,3). Die Luftgrenze `AIR_DRAG` ist jetzt gleich `RUN` – in der Luft wird man höchstens so schnell wie im Lauf, die Sprungkette schaukelt sich nicht mehr auf. Das war der Kern von „zu schnell“: Doppel-/Dreifachsprung flogen 25/34 m weit.
  - **Weitsprung mit halber Schwerkraft** wie im Vorbild (`LONG_GRAV`): er ist jetzt der weiteste Sprung (14,9 m).
  - **Lauftempo** `RUN` = 27 E/F = 11,1 m/s (Vorbild 32 = 13,2 m/s).
  - **Anlauf** wie im Vorbild geformt (kräftiger Antritt, der nachlässt, `GROUND_ACC`/`ACC_FADE`): volles Tempo nach 0,43 s statt 0,15 s. **Bremsen unverändert straff** (0,1 s) – der Wunsch „nicht rutschig“ vom 2026-09-21 gilt weiter.
  - **Sprungkraft** `JUMP_K` = 0,86 auf alle eigenen Absprünge (`jv()`): Höhe ×0,74, Flugzeit ×0,86, Verhältnisse zwischen den Bewegungen bleiben. Dreifachsprung 8,06 → 5,95 m. Federn und Gegner-Abpraller sind absichtlich nicht betroffen.
  - Schwellen (Rutscher, Weitsprung, Dreifachsprung) hängen jetzt relativ an `RUN` statt an festen E/F-Werten.

  | | Laufsprung | Doppel | Dreifach | Weitsprung | Seitsalto | Wandsprung |
  | --- | --- | --- | --- | --- | --- | --- |
  | vorher | 4,2 m / 13,7 m | 7,1 / 24,9 | 8,1 / 34,2 | 1,5 / 11,0 | 6,5 / 13,6 | 6,5 / 18,0 |
  | jetzt (Höhe / Weite) | 2,95 / 7,7 | 4,35 / 9,7 | 5,95 / 11,5 | 2,24 / 14,9 | 4,8 / 7,7 | 4,8 / 10,4 |

  `MOVES` neu gemessen, `g64.measure()` meldet überall `diff` 0. **Erreichbarkeit geprüft:** alle 20 festen Sterne in 21 Welten per Graphensuche mit alter und neuer Tabelle durchgerechnet – keiner geht verloren. Drei Sterne erfasst das Modell grundsätzlich nicht (Uhrspitze: Kolben; Teppich: fliegender Teppich; Wasserfall: Rampen) und wurden von Hand nachgesehen: Stufen ≤ 2,5 m, per Kantengriff (bis 4,5 m über den Füßen) bzw. Doppelsprung aus dem Stand (3,4 m) machbar. Die Pilztreppe am Wasserfall (+2,4 m je Stufe) geht jetzt nicht mehr mit einfachem Hüpfen, sondern mit Hochziehen.
  - **Nicht nachgemessen:** Wandsprung-Schacht im Gym (alte Gipfelwerte im Code als veraltet markiert).

## Fortschritt

(Claude Code trägt hier nach jeder Phase ein, was erledigt ist.)

- 2026-09-23: Abgleich mit dem Stand von SUPER GLAPPA 64 (Commit `b29538c`).
- 2026-09-23 – **Phase 1** bis auf das Tuning der Luftphysik erledigt (je ein Commit): Bewegungs-Gym, Messtabelle `MOVES` + Messbank, Level-Raster `GRID` + Gym-Stationen, Fallschaden, Luftvorrat, Kanten-Hilfe, Hangeln, Gangarten, Rutschen auf steilen Hängen (dabei Fehler behoben: bergauf in eine Rutsche rutschte man im Bogen bergauf weiter), Klänge für Schritte/Landen/Kehrtwende/Rutschen/Hangeln, Stimme.
  - Tests (kein Build-System im Projekt): `node --check`; `g64.measure()` = alle 11 Bewegungen stimmen mit `MOVES` überein; jede neue Mechanik im Gym per `g64.advance` durchgespielt; Rauchtest über alle 30 Orte (bauen, betreten, 4 s laufen/springen/schlagen) ohne Fehler und ohne kaputte Positionen.
