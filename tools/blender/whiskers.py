"""Schnurrhaare fuer Kappi im 64er-Stil - reine Geometrie, ohne Blender nutzbar.

Je Seite drei kraeftige, spitz zulaufende Haare im Faecher (oben, Mitte, unten), leicht nach hinten gestrichen
und zur Spitze hin haengend. Querschnitt ist eine Raute (von vorn und von der Seite sichtbar), unten etwas
dunkler gefaerbt - der schattierte Look der Konsolen-Figuren. Zusammen 72 Dreiecke (vorher: duenne Draehte).

Koordinaten wie im Kopf von kappi.py: Blender, Z oben, die Figur schaut nach -Y. Die Wurzel steckt in der Schnauze.
"""

import math

WHITE = (0xf4 / 255, 0xf4 / 255, 0xfa / 255)
SHADE = (0xc6 / 255, 0xca / 255, 0xd8 / 255)

FAN = [(0.22, 0.25), (0.0, 0.28), (-0.22, 0.24)]   # (Neigung nach oben in rad, Laenge) - oben, Mitte, unten


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def whisker(side, k):
    """Ein Haar: Liste von Dreiecken ((a, b, c), farbe), nach aussen gerichtet."""
    tilt, length = FAN[k]
    root = (side * 0.16, -0.385, -0.222 - 0.032 * k)
    d = (side * math.cos(tilt), 0.24, math.sin(tilt))
    n = math.sqrt(_dot(d, d))
    d = (d[0] / n, d[1] / n, d[2] / n)

    def center(t):
        return (root[0] + d[0] * length * t, root[1] + d[1] * length * t, root[2] + d[2] * length * t - 0.035 * t * t)

    def ring(t, h, w):
        c = center(t)
        return [(c[0], c[1], c[2] + h), (c[0], c[1] - w, c[2]), (c[0], c[1], c[2] - h), (c[0], c[1] + w, c[2])], c

    r0, c0 = ring(0.0, 0.02, 0.011)
    r1, c1 = ring(0.55, 0.012, 0.007)
    tip = center(1.0)
    tris = []

    def add(a, b, c, axis):
        nrm = _cross(_sub(b, a), _sub(c, a))
        mid = ((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3)
        if _dot(nrm, _sub(mid, axis)) < 0:          # Umlaufsinn so, dass die Flaeche nach aussen zeigt
            b, c = c, b
            nrm = (-nrm[0], -nrm[1], -nrm[2])
        tris.append(((a, b, c), SHADE if nrm[2] < 0 else WHITE))

    mid_axis = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2)
    tip_axis = ((c1[0] + tip[0]) / 2, (c1[1] + tip[1]) / 2, (c1[2] + tip[2]) / 2)
    for i in range(4):
        j = (i + 1) % 4
        add(r0[i], r0[j], r1[j], mid_axis)
        add(r0[i], r1[j], r1[i], mid_axis)
        add(r1[i], r1[j], tip, tip_axis)
    return tris


def all_whiskers():
    """Alle sechs Haare als (verts, faces, face_cols) fuer mesh_from in Blender."""
    verts, faces, cols = [], [], []
    for side in (-1, 1):
        for k in range(3):
            for (a, b, c), col in whisker(side, k):
                faces.append((len(verts), len(verts) + 1, len(verts) + 2))
                verts += [a, b, c]
                cols.append(col)
    return verts, faces, cols
