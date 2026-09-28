"""Kappi - fuenfte Spielfigur, gebaut nach den Proportionen einer echten N64-Figur.

Vorlage war ein Referenzmodell aus dem Vorbild; daraus wurden NUR Masse abgelesen
(Gelenkhoehen, Kopfgroesse, Polygonbudget), keine Geometrie und keine Texturen.
Figur, Farben und Details sind eigene: eine gruene Alien-Katze wie der Rest der
Familie, mit Kappe, Latzhose, Handschuhen und Stiefeln.

Gemessene Verhaeltnisse (Hoehe 154 Einheiten mit Kappe) und was daraus hier wird:

    Kopf         84..148   -> 43 % der Hoehe, 45 % so breit wie hoch
    Hals         86        -> Kopf sitzt tief, fast ohne Hals
    Schulter     81, x 19.75
    Huefte       50.5, x 10.5
    Knie 28.25, Knoechel 11.5
    Budget       ~750 Dreiecke fuer die ganze Figur

Das Geheimnis des 64er-Looks ist der riesige Kopf auf kurzem Koerper. Die
Katzen im Spiel haben Kopfbreite 0,74 m, Kappi 0,90 m - bei fast gleicher
Gesamthoehe.

Koordinaten wie ueberall: Blender Z-oben, die Figur schaut nach -Y. Jedes Teil
hat seinen Ursprung im Gelenk, um das drawPlayer() es dreht. Der Kopf hat seinen
Ursprung auf Augenhoehe - die Lider werden im Spiel von dort aus senkrecht
aufgezogen (Blinzeln), sie muessen also dort sitzen.
"""

import math

import g64_build as B
from cats import _arm, _leg, _tail_path, _tip, _band
from whiskers import all_whiskers

# Masse im Spiel (m), abgeleitet aus dem Referenzskelett mit k = 2,05 / 154
# Dicken nach Front-/Seitenansicht der Vorlage (2026-09-25): Bauch 0,31 H breit / 0,25 H tief, Aermel 0,095 H,
# Handschuh 0,13 H, Bein 0,136 H, Schuh 0,15 x 0,13 x 0,26 H. Mit dem dickeren Bauch sitzen die Schultern weiter
# aussen (sonst stecken die Arme im Bauch), die Beine fast aneinander wie im Vorbild.
RIG = {'legX': 0.155, 'legY': 0.672, 'bodyY': 0.887, 'armX': 0.32, 'armY': 1.078,
       'headY': 1.63, 'headZ': 0.03, 'tailY': 0.66, 'tailZ': -0.22}

SK = B.hexc('#7ed36a')        # Fell
HI = B.hexc('#c4f2a8')        # Schnauze, Schweifspitze
PINK = B.hexc('#ff8fb8')
CAP = B.hexc('#2f8fe8')       # Kappe
CAP_D = B.hexc('#2270c0')     # Schirm, etwas dunkler
GOLD = B.hexc('#ffd23a')
SHIRT = B.hexc('#ff8a2a')
PANTS = B.hexc('#2e3a58')
GLOVE = B.hexc('#f6f6fb')
BOOT = B.hexc('#7a3222')

EYE_X, EYE_Y = 0.155, -0.338  # Augenmitte (Kopf-lokal); Augenhoehe ist z = 0
# Die Augen selbst sind KEINE Geometrie mehr: wie bei den 64er-Figuren malt das Spiel sie flach auf den Kopf
# (Textur, Blinzeln = anderes Bild; siehe FaceDecal in glappa64.js). Die Lider bleiben als Teil erhalten, weil
# das Spiel eine Figur nur mit allen Teilen anbietet.


def _lid(side):
    """Lid: etwas groesser als der Augapfel und davor, Mitte auf z = 0 (siehe Modulkopf)."""
    lid = B.ellipsoid('lid', (0.126, 0.056, 0.156), 10, 5, SK)
    return B.place(lid, (side * EYE_X, EYE_Y - 0.006, 0.0), (0, 0, side * 0.32))


def _ear(side):
    outer = B.lathe('eo', [(0.0, 0.13, 0.06), (0.14, 0.085, 0.042), (0.28, 0.0, 0.0)], segs=6, color=SK)
    inner = B.place(B.lathe('ei', [(0.02, 0.075, 0.018), (0.2, 0.0, 0.0)], segs=6, color=PINK), (0, -0.035, 0))
    ear = B.merge('ear', [outer, inner])
    # steckt oben durch die Kappe (Ohrloecher) statt seitlich aus dem Rand wie ein Horn
    return B.place(ear, (side * 0.265, 0.06, 0.30), (0.08, side * 0.34, 0))


def _cap_back(dome):
    """Kappe hinten tiefer ziehen, wie eine echte Schirmmuetze: vorn bleibt der Rand ueber den Augen,
    hinten reicht er bis in den Nacken. Sonst schaut aus der Spielkamera (die meist hinter der Figur
    haengt) ein kahler gruener Hinterkopf unter einem Kaeppchen hervor."""
    me = dome.data
    for v in me.vertices:
        x, y, z = v.co
        if z > 0.33:
            continue
        back = max(0.0, y / 0.40) ** 1.3          # 0 vorn/seitlich .. 1 ganz hinten (+Y)
        w = min(1.0, (0.33 - z) / 0.23)            # unterster Ring voll, nach oben auslaufend
        v.co.z = z - 0.2 * back * w
        grow = 1 + 0.07 * back * w                 # tiefer hinten ist der Schaedel breiter -> Kappe mitwachsen
        v.co.x, v.co.y = x * grow, y * grow
    me.update()


def head():
    parts = [
        B.place(B.ellipsoid('skull', (0.448, 0.40, 0.425), 12, 9, SK), (0, 0, -0.085)),
    ]
    for s in (-1, 1):
        parts.append(B.place(B.ellipsoid('cheek', (0.2, 0.17, 0.155), 8, 5, SK), (s * 0.235, -0.17, -0.235)))
        parts.append(_ear(s))
    wv, wf, wc = all_whiskers()      # drei kraeftige, spitze Schnurrhaare je Seite (whiskers.py)
    parts.append(B.mesh_from('whiskers', wv, wf, wc, [False] * len(wf)))
    parts.append(B.place(B.ellipsoid('muzzle', (0.2, 0.13, 0.12), 10, 5, HI), (0, -0.325, -0.245)))
    parts.append(B.place(B.ellipsoid('nose', (0.052, 0.036, 0.036), 6, 4, PINK), (0, -0.452, -0.175)))

    # Kappe: liegt eng am Oberkopf an (Rand nur ~4 cm ueber dem Schaedel), sonst wird ein Helm daraus.
    # Der Schirm sitzt knapp UEBER den Augen (Augen reichen bis z = 0,148) - wie im Vorbild beruehrt
    # er sie gerade eben, statt sie halb zu verdecken.
    dome = B.lathe('dome', [(0.10, 0.44, 0.40), (0.18, 0.43, 0.39), (0.26, 0.39, 0.355),
                            (0.33, 0.32, 0.29), (0.39, 0.22, 0.20), (0.43, 0.11, 0.10), (0.445, 0.0, 0.0)],
                   segs=12, color=CAP)
    _cap_back(dome)
    brim = B.place(B.ellipsoid('brim', (0.33, 0.25, 0.03), 10, 4, CAP_D, smooth=False), (0, -0.32, 0.135))
    emblem = B.place(B.star('emblem', 0.095, 0.018, GOLD), (0, -0.362, 0.27), (-0.5, 0, 0))
    parts += [dome, brim, emblem]
    return B.merge('kappi.head', parts)


def lids():
    return B.merge('kappi.lids', [_lid(-1), _lid(1)])


def body():
    """Rumpf: runder Bauch, schmale Schultern. Latzhose und Traeger werden aufgemalt."""
    torso = B.lathe('torso', [(-0.30, 0, 0), (-0.285, 0.15, 0.13), (-0.24, 0.255, 0.21), (-0.16, 0.30, 0.25),
                              (-0.07, 0.31, 0.262), (0.03, 0.30, 0.25), (0.12, 0.285, 0.225),
                              (0.19, 0.26, 0.20), (0.235, 0.20, 0.16), (0.26, 0.13, 0.11),
                              (0.30, 0.115, 0.10), (0.33, 0, 0)], segs=12, color=SHIRT)

    def cloth(c, n):
        x, y, z = c
        if z > 0.235:
            return SK                                          # Hals
        if z < -0.02:
            return PANTS                                       # Hose
        if n[1] < -0.3 and z < 0.17:
            return PANTS                                       # Latz vorn: ganze Vorderseite unter der Brust
        if 0.12 < abs(x) < 0.2:
            return PANTS                                       # Traeger vorn und hinten
        return SHIRT

    B.paint(torso, cloth)
    buttons = [B.place(B.ellipsoid('btn', (0.046, 0.024, 0.046), 6, 4, GOLD), (s * 0.15, -0.2, 0.135)) for s in (-1, 1)]
    return B.merge('kappi.body', [torso] + buttons)


def arm():
    """Aermel bis zum Handgelenk, dann grosse weisse Handschuhe wie im Vorbild."""
    path, hard = _arm(0.105, [(-0.10, 0.096), (-0.22, 0.09), (-0.31, 0.085)],
                      -0.35, 0.115, -0.47, 0.13, -0.60, fwd=0.02)
    return B.sweep('kappi.arm', path, 10, _band([(-0.354, SHIRT), (-9, GLOVE)]), hard)


def leg():
    """Hosenbein bis zur Stiefelmanschette, dann ein dicker Stiefel mit flacher Sohle."""
    path, hard, sole = _leg(0.14, [(-0.14, 0.135), (-0.30, 0.128), (-0.42, 0.122)], -0.47, 0.14,
                            -0.53, -0.585, 0.158, 0.10, 0.30, -0.672)
    return B.flatten_bottom(B.sweep('kappi.leg', path, 10, _band([(-0.474, PANTS), (-9, BOOT)]), hard), sole)


def tail():
    path = _tip(_tail_path(9, 0.085, 0.12, 0.22), 0.088)
    return B.sweep('kappi.tail', path, 8, lambda t, _p: HI if t > 0.87 else SK)


def build_all():
    return [head(), lids(), body(), arm(), leg(), tail()]
