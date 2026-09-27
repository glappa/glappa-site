"""Das Schloss im Schlossgarten (wird per bakeModel() in die Levelgeometrie eingebacken).

Eigenes Modell, angelehnt an den Aufbau eines 64er-Schlosses (nur Proportionen und Anordnung
abgeschaut, keine Geometrie/Textur uebernommen): heller Steinbau mit Sockel, Gurtgesims und
Kranzgesims, Reihen von Bogenfenstern, grosses Walmdach aus Ziegelreihen mit Gauben, Ziergiebel
ueber dem Portal, hoher Mittelturm mit Zinnenkranz und Pyramidendach, runde Tuerme mit Kegeldach.

Die Grundflaechen passen EXAKT zu den Kollisionsquadern in buildGarden() (glappa64.js):
  Hauptbau  x -13..13, z -58..-38 (Spiel), Hoehe 18
  Mittelturm 8 x 8 um (0, -50), 18..32
  Vordertuerme  (+-17, -44) r 4,5, h 22     Aussentuerme (+-27, -40) r 3,5, h 15
  Mauern     x 13..27 / -27..-13, z -44..-40, h 11
  Ruecktuerme (+-12,5, -57,5) r 2,6, h 24 (neu)
Buntglasfenster und Tor zeichnet weiter das Spiel selbst (Vorspann-Kamera, Tuer-Interaktion).

Modellursprung = Spielpunkt (0, 0, -48). Hier wird in SPIEL-Achsen gebaut (x rechts, y hoch,
z nach vorn zum Spieler) und erst beim Anlegen nach Blender umgerechnet: (x, y, z) -> (x, -z, y).
"""

import math

import g64_build as B

ORIGIN_Z = -48.0

WALL = B.hexc('#e8dfcf')
WALL_SH = B.hexc('#d6cbb6')
TRIM = B.hexc('#c4b69c')
PLINTH = B.hexc('#a89b86')
ROOF_A = B.hexc('#cf5528')
ROOF_B = B.hexc('#b4441f')
RIDGE = B.hexc('#8c3417')
GLASS = B.hexc('#2b2440')
FRAME = B.hexc('#f6f1e6')
POLE = B.hexc('#7a7a80')
GOLD = B.hexc('#f2c230')
DARK = B.hexc('#4a3a2c')

_parts = []


def bl(p):
    """Spielkoordinate (relativ zum Ursprung) -> Blender."""
    return (p[0], -p[2], p[1])


def gz(z):
    """Spiel-z (absolut) -> relativ zum Modellursprung."""
    return z - ORIGIN_Z


def box(c, size, col, rot=0.0):
    """Quader: Mitte c (Spiel), Groesse (Breite x, Hoehe y, Tiefe z), Drehung um die Hochachse."""
    ob = B.cuboid('b', (size[0], size[2], size[1]), col)
    B.place(ob, bl(c), (0, 0, rot))
    _parts.append(ob)
    return ob


def mesh(verts_game, faces, cols):
    """Freie Form direkt in Spielkoordinaten (Flaechen gegen den Uhrzeigersinn von aussen)."""
    ob = B.mesh_from('m', [bl(v) for v in verts_game], faces, cols, [False] * len(faces))
    _parts.append(ob)
    return ob


def cyl(c, r0, r1, y0, y1, col, segs=16):
    """Zylinder/Kegelstumpf um die Hochachse bei c=(x, z)."""
    prof = [(y0, r0, r0), (y1, r1, r1)] if r1 > 1e-6 else [(y0, r0, r0), (y1, 0.0, 0.0)]
    ob = B.lathe('c', prof, segs=segs, color=col, seam_smooth=False)
    B.place(ob, bl((c[0], 0, c[1])))
    _parts.append(ob)
    return ob


def disc_up(c, r, y, col, segs=16):
    """Waagrechte Deckelscheibe (nach oben) bei c=(x, z) in Hoehe y."""
    vs = [(c[0], y, c[1])] + [(c[0] + math.cos(a) * r, y, c[1] + math.sin(a) * r)
                             for a in (i / segs * math.tau for i in range(segs))]
    return mesh(vs, [(0, 1 + (i + 1) % segs, 1 + i) for i in range(segs)], [col] * segs)


def arch_window(c, w, h, rot=0.0, depth=0.1):
    """Bogenfenster: heller Rahmen, dunkles Glas, oben ein Halbrund. c = Mitte der Unterkante,
    liegt direkt VOR der Wand (Normale zeigt in Blickrichtung rot: 0 = nach +z)."""
    ca, sa = math.cos(rot), math.sin(rot)

    def at(dx, dy, dz):
        # lokale (quer, hoch, raus) -> Spiel
        return (c[0] + dx * ca + dz * sa, c[1] + dy, c[2] - dx * sa + dz * ca)

    def arch(wid, hei, raus, col, segs=8):
        r = wid / 2
        pts = [at(-r, 0, raus), at(r, 0, raus), at(r, hei - r, raus)]
        top = [at(math.cos(i / segs * math.pi) * r, hei - r + math.sin(i / segs * math.pi) * r, raus) for i in range(1, segs)]
        pts += top + [at(-r, hei - r, raus)]
        n = len(pts)
        # Faecher um die Mitte der Oberkante-Linie
        center = at(0, (hei - r) * 0.5, raus)
        vs = [center] + pts
        faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
        return mesh(vs, faces, [col] * n)

    arch(w + 0.36, h + 0.18, depth, FRAME)
    arch(w, h, depth + 0.03, GLASS)
    # Fensterbank
    box(at(0, -0.08, depth + 0.08), (w + 0.6, 0.16, 0.34), TRIM, rot)


def ring_merlons(c, r, y, n, size=(0.9, 1.0, 0.7), col=WALL_SH):
    """Zinnenkranz um einen runden Turm."""
    for i in range(n):
        a = (i + 0.5) / n * math.tau
        box((c[0] + math.sin(a) * r, y + size[1] / 2, c[1] + math.cos(a) * r), size, col, a)


def row_merlons(x0, x1, z, y, step=2.2, size=(1.1, 1.1, 0.8), col=WALL_SH, axis='x'):
    n = max(1, int(round((x1 - x0) / step)))
    for i in range(n + 1):
        t = x0 + (x1 - x0) * i / n
        box((t, y + size[1] / 2, z) if axis == 'x' else (z, y + size[1] / 2, t), size, col, 0 if axis == 'x' else math.pi / 2)


def hip_roof(x0, x1, z0, z1, y0, ridge_y, ridge_half, strips=7):
    """Walmdach aus Ziegelreihen (abwechselnd zwei Rottoene) + First.
    Grundrechteck x0..x1, z0..z1 in Hoehe y0, First laeuft in x-Richtung (Laenge 2*ridge_half)."""
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    base = [(x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0)]           # vorn links, vorn rechts, hinten rechts, hinten links
    rA, rB = (cx - ridge_half, ridge_y, cz), (cx + ridge_half, ridge_y, cz)
    faces_def = [
        (base[0], base[1], rB, rA),       # vorn
        (base[2], base[3], rA, rB),       # hinten
        (base[1], base[2], rB, rB),       # rechts (Dreieck)
        (base[3], base[0], rA, rA),       # links (Dreieck)
    ]
    for (a, b, cT, dT) in faces_def:
        for s in range(strips):
            t0, t1 = s / strips, (s + 1) / strips
            lerp = lambda p, q, t: tuple(p[i] + (q[i] - p[i]) * t for i in range(3))
            p0, p1 = lerp(a, dT, t0), lerp(b, cT, t0)
            p2, p3 = lerp(b, cT, t1), lerp(a, dT, t1)
            col = ROOF_A if s % 2 == 0 else ROOF_B
            if cT == dT and t1 >= 1:
                mesh([p0, p1, p2], [(0, 1, 2)], [col])
            else:
                mesh([p0, p1, p2, p3], [(0, 1, 2, 3)], [col])
    # First
    box(((rA[0] + rB[0]) / 2, ridge_y + 0.15, cz), (2 * ridge_half + 0.4, 0.3, 0.5), RIDGE)


def pyramid_roof(c, half, y0, apex, strips=5):
    x0, x1, z0, z1 = c[0] - half, c[0] + half, c[1] - half, c[1] + half
    hip_roof(x0, x1, z0, z1, y0, apex, 0.001, strips)


def cone_roof(c, r, y0, h, segs=16):
    """Kegeldach mit zwei Ziegelreihen-Toenen und kleinem Knauf."""
    rings = 4
    for i in range(rings):
        ra, rb = r * (1 - i / rings), r * (1 - (i + 1) / rings)
        ya, yb = y0 + h * i / rings, y0 + h * (i + 1) / rings
        cyl(c, ra, rb, ya, yb, ROOF_A if i % 2 == 0 else ROOF_B, segs)
    cyl(c, 0.18, 0.1, y0 + h - 0.3, y0 + h + 1.2, GOLD, 6)


def round_tower(c, r, h, roof_h, win_rows, face_rot):
    """Runder Turm: Sockel, Schaft, Gurtband, Fenster zur Vorderseite, Kranz + Zinnen, Kegeldach, Fahnenmast."""
    cyl(c, r + 0.35, r + 0.25, 0, 1.2, PLINTH)
    cyl(c, r, r, 1.2, h, WALL)
    cyl(c, r + 0.12, r + 0.12, h * 0.5 - 0.2, h * 0.5 + 0.2, TRIM)
    cyl(c, r + 0.6, r + 0.6, h, h + 0.5, TRIM)
    disc_up(c, r + 0.6, h + 0.5, WALL_SH)
    ring_merlons(c, r + 0.25, h + 0.5, max(8, int(r * 3)))
    for y in win_rows:
        a = face_rot
        arch_window((c[0] + math.sin(a) * (r + 0.02), y, c[1] + math.cos(a) * (r + 0.02)), 1.0, 1.9, a, 0.06)
    cone_roof(c, r + 0.9, h + 1.4, roof_h)
    # Mast fuer die wehende Fahne (die zeichnet das Spiel)
    top = h + 1.4 + roof_h
    cyl(c, 0.07, 0.07, top + 1.0, top + 3.4, POLE, 5)


def build():
    _parts.clear()
    FZ = gz(-38.0)     # Vorderseite Hauptbau (relativ, = +10)
    BZ = gz(-58.0)     # Rueckseite (= -10)

    # ── Hauptbau ──
    box((0, 9, 0), (26, 18, 20), WALL)
    box((0, 0.6, 0), (26.7, 1.2, 20.7), PLINTH)                 # Sockel
    box((0, 8.2, 0), (26.5, 0.45, 20.5), TRIM)                  # Gurtgesims (unter dem Buntglasfenster, das bei 8,9 m beginnt)
    box((0, 17.6, 0), (27.4, 0.8, 21.4), TRIM)                  # Kranzgesims
    for x in (-12.9, 12.9):                                      # Eckquader (Lisenen)
        for z in (FZ - 0.1, BZ + 0.1):
            box((x, 9, z), (1.0, 17, 1.0), WALL_SH)
    # Fenster vorn: zwei Reihen, je Seite zwei (Mitte bleibt fuer Tor + Buntglas frei)
    for x in (-10.4, -6.6, 6.6, 10.4):
        arch_window((x, 3.4, FZ), 1.4, 2.6)
        arch_window((x, 11.2, FZ), 1.4, 2.8)
    # Fenster hinten und an den Seiten (vorderer Seitenteil steckt hinter den Mauern)
    for x in (-9, -3, 3, 9):
        arch_window((x, 3.4, BZ), 1.4, 2.6, math.pi)
        arch_window((x, 11.2, BZ), 1.4, 2.8, math.pi)
    for side in (-1, 1):
        for z in (-6.5, -1.5, 3.0):
            for y in (3.4, 11.2):
                if z > 2 and y < 11:
                    continue          # unten vorn stehen die Verbindungsmauern davor
                arch_window((side * 13.0, y, z), 1.4, 2.6, side * math.pi / 2)

    # ── Portal: Pfeiler + Bogenbalken um das Tor (Tor selbst zeichnet das Spiel) ──
    for x in (-3.1, 3.1):
        box((x, 3.3, FZ + 0.35), (0.9, 6.6, 0.7), WALL_SH)
        box((x, 6.8, FZ + 0.4), (1.2, 0.5, 0.8), TRIM)
    box((0, 7.3, FZ + 0.35), (7.2, 0.8, 0.7), TRIM)
    box((0, 0.12, FZ + 1.4), (7.5, 0.24, 2.4), PLINTH)          # flache Schwelle (keine Stufe -> keine Kollision noetig)

    # ── Walmdach mit Gauben und Ziergiebel ──
    hip_roof(-13.9, 13.9, BZ - 0.9, FZ + 0.9, 18.0, 27.0, 5.5)
    for x in (-8.0, 8.0):                                        # Gauben auf der Vorderseite
        gy, gzf = 20.6, FZ - 2.2
        box((x, gy, gzf - 0.6), (2.4, 2.4, 2.4), WALL)
        arch_window((x, gy - 0.9, gzf + 0.62), 1.0, 1.5, 0.0, 0.04)
        mesh([(x - 1.5, gy + 1.2, gzf + 0.8), (x + 1.5, gy + 1.2, gzf + 0.8), (x, gy + 2.6, gzf + 0.8),
              (x - 1.5, gy + 1.2, gzf - 2.2), (x + 1.5, gy + 1.2, gzf - 2.2), (x, gy + 2.6, gzf - 2.2)],
             [(0, 1, 2), (1, 4, 5, 2), (3, 0, 2, 5), (4, 3, 5)], [ROOF_B, ROOF_A, ROOF_A, ROOF_B])
    # Ziergiebel ueber dem Portal (Dreieck vor der Dachflaeche, mit Gesimsleisten und goldenem Stern)
    gw, gy0, gy1, gzf = 6.0, 18.0, 24.2, FZ + 0.25
    mesh([(-gw, gy0, gzf), (gw, gy0, gzf), (0, gy1, gzf), (-gw, gy0, gzf - 4.5), (gw, gy0, gzf - 4.5), (0, gy1, gzf - 4.5)],
         [(0, 1, 2), (1, 4, 5, 2), (3, 0, 2, 5)], [WALL, WALL_SH, WALL_SH])
    for s in (-1, 1):   # Giebel-Dachkanten
        mesh([(0, gy1 + 0.35, gzf + 0.5), (s * (gw + 0.7), gy0 - 0.2, gzf + 0.5), (s * (gw + 0.7), gy0 - 0.2, gzf - 4.8), (0, gy1 + 0.35, gzf - 4.8)],
             [(0, 1, 2, 3) if s > 0 else (3, 2, 1, 0)], [RIDGE])
    star_ob = B.star('s', 1.1, 0.12, GOLD)
    B.place(star_ob, bl((0, 20.4, gzf + 0.1)))
    _parts.append(star_ob)

    # ── Mittelturm ──
    tz = gz(-50.0)
    box((0, 25, tz), (8, 14, 8), WALL)
    box((0, 18.4, tz), (8.6, 0.8, 8.6), TRIM)
    box((0, 32.2, tz), (9.2, 0.6, 9.2), TRIM)
    for a in (0.0, math.pi / 2, math.pi, -math.pi / 2):
        s, c = math.sin(a), math.cos(a)
        arch_window((s * 4.02, 25.0, tz + c * 4.02), 1.3, 3.0, a)
    for side in range(4):   # Zinnen auf allen vier Kanten
        a = side * math.pi / 2
        for i in range(4):
            t = -3.6 + i * 2.4
            s, c = math.sin(a), math.cos(a)
            box((s * 4.3 + c * t, 33.0, tz + c * 4.3 - s * t), (1.1, 1.0, 0.7), WALL_SH, a)
    pyramid_roof((0, tz), 4.9, 33.5, 43.5)
    cyl((0, tz), 0.2, 0.12, 43.2, 44.6, GOLD, 6)
    cyl((0, tz), 0.08, 0.08, 44.6, 47.5, POLE, 5)

    # ── runde Tuerme ──
    for s in (-1, 1):
        round_tower((s * 17.0, gz(-44.0)), 4.5, 22.0, 8.5, (8.0, 15.0), 0.0)
        round_tower((s * 27.0, gz(-40.0)), 3.5, 15.0, 6.5, (6.5,), 0.0)
        round_tower((s * 12.5, gz(-57.5)), 2.6, 24.0, 7.0, (12.0, 19.0), math.pi)

    # ── Verbindungsmauern mit Wehrgang-Zinnen ──
    for s in (-1, 1):
        box((s * 20, 5.5, gz(-42.0)), (14, 11, 4), WALL)
        box((s * 20, 0.6, gz(-42.0)), (14.4, 1.2, 4.4), PLINTH)
        box((s * 20, 10.8, gz(-42.0)), (14.3, 0.4, 4.3), TRIM)
        row_merlons(s * 13.8, s * 26.2, gz(-40.4), 11.0)
        row_merlons(s * 13.8, s * 26.2, gz(-43.6), 11.0)
        for x in (s * 16.2, s * 20.0, s * 23.8):
            arch_window((x, 4.5, gz(-40.0)), 1.1, 2.0)

    return B.merge('castle.body', list(_parts))


def build_all():
    return [build()]
