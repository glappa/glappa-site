"""Die vier Katzen: Arme, Beine, Schweife.

Masse und Farben sind aus CAT_DEFS in secret/glappa64.js uebernommen, damit die
Teile exakt auf dieselben Gelenkpunkte (rig) passen und sich die Animation in
drawPlayer() nicht aendert. Der Unterschied liegt in der Bauart:

  vorher   Schulterkugel + Zylinder + Manschette + Pfotenkugel: vier geschlossene
           Huellen, die sich durchdringen - sichtbare Naehte, halbe Dreiecke innen
  jetzt    ein durchgehender Koerper - gleiche Polygonklasse, aber eine Silhouette,
           die man lesen kann

Damit ein Glied nicht wie ein Schlauch wirkt, braucht das Profil Kontrast. Jedes
Glied folgt derselben Abfolge:

    Ballen (Schulter/Huefte)  ->  schlanker Schaft  ->  Einschnuerung am Gelenk
    ->  Manschette, die aufweitet  ->  runde Pfote  ->  Kuppe

Die Einschnuerung vor der Pfote ist der wichtigste Punkt: erst dadurch liest sich
die Pfote als eigener Koerperteil statt als dickes Schlauchende.

Koordinaten: Blender ist Z-oben und die Figur schaut nach -Y.
Spiel-Y ist also Blender-Z, Spiel-Z (vorn) ist Blender-(-Y).
"""

import math

import g64_build as B

SEGS = 10         # Rundum-Unterteilung; das Original liegt bei 5-6, bleibt also 64er-Klasse


def _tail_path(n, r0, length, curl, taper=0.9):
    """Der Schweif wie in catTail(): n Glieder, jedes um curl weiter geneigt.

    Statt n Zylindern mit einer Kugel an jedem Knick wird daraus EIN Pfad - der
    Schweif bekommt eine glatte Linie statt einer Beule an jedem Gelenk.
    """
    pts, x, y, z, a, r = [], 0.0, 0.0, 0.0, 0.0, r0
    pts.append(((0.0, 0.0, -r0 * 0.45), 0.0))            # gerundeter Ansatz
    pts.append(((0.0, 0.0, -r0 * 0.15), r0 * 0.86))
    pts.append(((0.0, 0.0, 0.0), r0))
    for k in range(n):
        ang = curl(k) if callable(curl) else curl
        # im Spiel kippt das Glied von +Y nach +Z; hier also von +Z nach -Y
        y -= math.sin(a) * length
        z += math.cos(a) * length
        a += ang
        r *= taper
        pts.append(((x, y, z), r))
    return pts


def _tip(pts, tip_r):
    """Setzt eine runde Keule ans Ende (wie die Spitzenkugel im Original).

    Vor der Keule wird kurz eingeschnuert, sonst verschmilzt sie mit dem Schweif.
    """
    (px, py, pz), r_end = pts[-1]
    (qx, qy, qz), _ = pts[-2]
    dx, dy, dz = px - qx, py - qy, pz - qz
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    dx, dy, dz = dx / L, dy / L, dz / L

    def at(d, r):
        return ((px + dx * d, py + dy * d, pz + dz * d), r)

    out = list(pts)
    out[-1] = ((px, py, pz), r_end * 0.78)               # Einschnuerung
    out.append(at(tip_r * 0.55, tip_r))
    out.append(at(tip_r * 1.05, tip_r * 0.92))
    out.append(at(tip_r * 1.55, 0.0))
    return out


def _band(stops):
    """Farbe nach Hoehe: stops = [(z_ab, farbe), ...] von oben nach unten.

    Die Schwellen stammen aus den Manschetten- und Stiefelzylindern in CAT_DEFS,
    damit die Farbkante genau dort sitzt wie in der prozeduralen Fassung.
    """
    def f(_t, p):
        for z0, c in stops:
            if p[2] >= z0:
                return c
        return stops[-1][1]
    return f


def _arm(top_r, shaft, wrist_z, cuff_r, paw_z, paw_r, end_z, fwd=0.02):
    """Arm: Schulterballen -> Schaft -> Handgelenk einschnueren -> Manschette -> Pfote.

    Die Manschette springt auf einer sehr kurzen Strecke auf und wird flach
    schattiert (siehe hard). Diese harte Ringkante ist der Unterschied zwischen
    "Handschuh" und "weisse Beule am Schlauchende".
    """
    pts = [((0, 0, top_r * 0.95), 0.0),
           ((0, 0, top_r * 0.70), top_r * 0.62),
           ((0, 0, top_r * 0.38), top_r * 0.91),
           ((0, 0, 0.0), top_r)]
    pts += [((0, 0, z), r) for z, r in shaft]
    pts.append(((0, 0, wrist_z), cuff_r * 0.70))                 # Handgelenk
    w = len(pts) - 1                                             # hier die harte Kante
    pts.append(((0, -fwd * 0.2, wrist_z - 0.013), cuff_r))       # Manschette
    pts.append(((0, -fwd * 0.5, wrist_z - 0.052), cuff_r * 0.99))
    pts.append(((0, -fwd, paw_z), (paw_r, paw_r * 1.06)))        # Pfote
    d = paw_z - end_z
    pts.append(((0, -fwd - d * 0.4, paw_z - d * 0.66), (paw_r * 0.70, paw_r * 0.76)))
    pts.append(((0, -fwd - d * 0.7, end_z), 0.0))
    return pts, (w,)


def _leg(top_r, shaft, cuff_z, cuff_r, shaft_end_z, foot_z, foot_w, foot_h, toe_y, sole_z):
    """Bein: Hueftballen -> Schenkel -> Stiefelmanschette -> gerader Schaft -> Fuss.

    Wichtig: sobald der Pfad nach vorn abknickt, ist der ZWEITE Radius die Hoehe
    (nicht die Tiefe) - ein Fuss braucht dort also einen KLEINEN Wert, sonst wird
    aus dem Stiefel eine Kugel. Die Sohle wird anschliessend flach gedrueckt.
    """
    pts = [((0, 0, top_r * 0.95), 0.0),
           ((0, 0, top_r * 0.70), top_r * 0.62),
           ((0, 0, top_r * 0.38), top_r * 0.91),
           ((0, 0, 0.0), top_r)]
    pts += [((0, 0, z), r) for z, r in shaft]
    pts.append(((0, 0, cuff_z), cuff_r * 0.76))                  # Knoechel einschnueren
    w = len(pts) - 1
    pts.append(((0, 0, cuff_z - 0.014), cuff_r))                 # Manschette springt auf
    pts.append(((0, 0, shaft_end_z), cuff_r * 0.98))             # gerader Stiefelschaft
    pts.append(((0, -toe_y * 0.30, foot_z), (foot_w, foot_h)))   # Rist, flach
    pts.append(((0, -toe_y * 0.78, foot_z - 0.012), (foot_w * 0.94, foot_h * 0.88)))
    pts.append(((0, -toe_y, foot_z - 0.020), (foot_w * 0.72, foot_h * 0.66)))
    pts.append(((0, -toe_y - 0.045, foot_z - 0.028), 0.0))       # Zehenkuppe
    return pts, (w,), sole_z


# ---------------------------------------------------------------------------
# Die vier Entwuerfe
# ---------------------------------------------------------------------------

def knuddel():
    SK, CREAM = B.hexc('#74d45a'), B.hexc('#ecfbdc')
    col = _band([(-0.245, SK), (-9, CREAM)])              # Pfote ab y=-0.32
    arm, arm_h = _arm(0.088, [(-0.09, 0.076), (-0.17, 0.067)], -0.232, 0.088, -0.322, 0.090, -0.408)
    leg, leg_h, sole = _leg(0.125, [(-0.11, 0.113), (-0.20, 0.104)], -0.268, 0.120,
                            -0.330, -0.386, 0.122, 0.070, 0.180, -0.452)
    tail = _tip(_tail_path(9, 0.075, 0.12, 0.23), 0.078)
    return [
        B.sweep('knuddel.arm', arm, SEGS, col, arm_h),
        B.flatten_bottom(B.sweep('knuddel.leg', leg, SEGS, col, leg_h), sole),
        B.sweep('knuddel.tail', tail, SEGS, lambda t, _p: CREAM if t > 0.87 else SK),
    ]


def sphinx():
    """Nacktkatze: lange Glieder mit Ellenbogen bzw. Knie, daher ein Knick im Schaft."""
    SK, HI = B.hexc('#74c85f'), B.hexc('#a8e68c')
    col = _band([(-0.495, SK), (-9, HI)])                 # Pfote ab y=-0.55
    colL = _band([(-0.54, SK), (-9, HI)])                 # Fuss ab y=-0.595
    arm, arm_h = _arm(0.082, [(-0.10, 0.068), (-0.20, 0.058), (-0.27, 0.061), (-0.36, 0.051), (-0.45, 0.047)],
                      -0.492, 0.062, -0.556, 0.066, -0.622)
    leg, leg_h, sole = _leg(0.11, [(-0.12, 0.099), (-0.24, 0.087), (-0.31, 0.089), (-0.41, 0.073)],
                            -0.498, 0.078, -0.545, -0.592, 0.082, 0.050, 0.175, -0.645)
    tail = _tip(_tail_path(12, 0.05, 0.1, lambda k: 0.1 if k < 6 else 0.22, 0.93), 0.046)
    return [
        B.sweep('sphinx.arm', arm, SEGS, col, arm_h),
        B.flatten_bottom(B.sweep('sphinx.leg', leg, SEGS, colL, leg_h), sole),
        B.sweep('sphinx.tail', tail, SEGS, SK),
    ]


def astro():
    SK, SUIT, GLOVE = B.hexc('#82da66'), B.hexc('#7550d8'), B.hexc('#f4f4fa')
    HI = B.hexc('#c0f39e')
    arm_col = _band([(-0.232, SUIT), (-9, GLOVE)])        # Manschette y=-0.30..-0.23
    leg_col = _band([(-0.258, SUIT), (-9, GLOVE)])        # Stiefelschaft ab y=-0.26
    arm, arm_h = _arm(0.096, [(-0.10, 0.082), (-0.18, 0.070)], -0.226, 0.090, -0.320, 0.092, -0.438)
    leg, leg_h, sole = _leg(0.112, [(-0.12, 0.101), (-0.20, 0.091)], -0.252, 0.106,
                            -0.330, -0.418, 0.115, 0.072, 0.205, -0.500)
    tail = _tip(_tail_path(8, 0.065, 0.12, 0.24), 0.068)
    return [
        B.sweep('astro.arm', arm, SEGS, arm_col, arm_h),
        B.flatten_bottom(B.sweep('astro.leg', leg, SEGS, leg_col, leg_h), sole),
        B.sweep('astro.tail', tail, SEGS, lambda t, _p: HI if t > 0.87 else SK),
    ]


def neon():
    """Neon traegt Leuchtringe: die kommen in eigene .glow-Teile, die unbeleuchtet gezeichnet werden."""
    SK, NEON, CYAN, DARK = B.hexc('#2f8a60'), B.hexc('#8dff5a'), B.hexc('#63f7ff'), B.hexc('#0f2a1f')
    arm_col = _band([(-0.282, SK), (-9, DARK)])           # dunkle Pfote ab y=-0.35
    leg_col = _band([(-0.434, SK), (-9, DARK)])           # dunkler Fuss ab y=-0.50
    arm, arm_h = _arm(0.086, [(-0.11, 0.073), (-0.21, 0.061)], -0.276, 0.078, -0.352, 0.080, -0.430)
    leg, leg_h, sole = _leg(0.106, [(-0.15, 0.097), (-0.30, 0.085)], -0.428, 0.092,
                            -0.478, -0.522, 0.100, 0.062, 0.180, -0.566)
    tail = _tip(_tail_path(10, 0.06, 0.11, 0.22), 0.062)
    # Leuchtringe sitzen auf der Manschette bzw. dem Stiefelschaft
    ring_arm = [((0, 0, -0.300), 0.0), ((0, 0, -0.293), 0.083), ((0, 0, -0.275), 0.083), ((0, 0, -0.268), 0.0)]
    ring_leg = [((0, 0, -0.452), 0.0), ((0, 0, -0.445), 0.100), ((0, 0, -0.427), 0.100), ((0, 0, -0.420), 0.0)]
    tail_glow = _tip(_tail_path(10, 0.062, 0.11, 0.22), 0.064)[-4:]
    return [
        B.sweep('neon.arm', arm, SEGS, arm_col, arm_h),
        B.sweep('neon.arm.glow', ring_arm, SEGS, NEON),
        B.flatten_bottom(B.sweep('neon.leg', leg, SEGS, leg_col, leg_h), sole),
        B.sweep('neon.leg.glow', ring_leg, SEGS, NEON),
        B.sweep('neon.tail', tail, SEGS, SK),
        B.sweep('neon.tail.glow', tail_glow, SEGS, CYAN),
    ]


ALL = [knuddel, sphinx, astro, neon]


def build_all():
    """Baut alle Teile in die aktuelle Szene und liefert die Objekte in Reihenfolge."""
    out = []
    for f in ALL:
        out.extend(f())
    return out
