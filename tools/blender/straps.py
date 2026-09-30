"""Hosentraeger fuer Kappi - reine Geometrie, ohne Blender nutzbar.

Vorher waren die Traeger nur auf den Rumpf gemalt (Flaechen mit 0,12 < |x| < 0,2). Bei 12 Segmenten trifft das
je Ring mal eine Flaeche, mal keine - hinten wurden daraus zackige Flecken statt Streifen. Jetzt ist jeder Traeger
ein eigenes flaches Band, das knapp ueber der Rumpfform liegt: hinten aus der Hose hoch, ueber die Schulter und
vorn bis in den Latz (zu den Knoepfen).

Koordinaten wie in kappi.py: Blender, Z oben, die Figur schaut nach -Y (hinten = +Y).
"""

import math

X_MID, WIDTH, LIFT = 0.155, 0.062, 0.012   # Mitte des Traegers, Breite, Abstand zur Rumpfform
Z_BACK, Z_FRONT, SAMPLES = -0.06, 0.16, 22  # Anfang hinten (in der Hose), Ende vorn (im Latz), Punkte je Kante


def _lerp_profile(profile, z):
    """rx, ry der Drehflaeche bei Hoehe z (zwischen den Ringen linear wie im Mesh)."""
    for (za, xa, ya), (zb, xb, yb) in zip(profile, profile[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return xa + (xb - xa) * t, ya + (yb - ya) * t
    return 0.0, 0.0


def _crest(profile, x):
    """Hoechster Punkt, an dem die Rumpfform noch bis x reicht (dort geht der Traeger ueber die Schulter)."""
    for (za, xa, _), (zb, xb, _) in zip(profile, profile[1:]):
        if xa >= x > xb:
            return za + (zb - za) * (xa - x) / (xa - xb)
    raise ValueError('Traeger liegt ausserhalb des Rumpfes')


def _surface(profile, x, z, side):
    rx, ry = _lerp_profile(profile, z)
    return (x, side * ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)), z)


def _normal(profile, p):
    x, y, z = p
    f = lambda zz: (x / _lerp_profile(profile, zz)[0]) ** 2 + (y / _lerp_profile(profile, zz)[1]) ** 2
    rx, ry = _lerp_profile(profile, z)
    e = 1e-4
    n = (2 * x / rx ** 2, 2 * y / ry ** 2, (f(z + e) - f(z - e)) / (2 * e))
    ln = math.sqrt(sum(c * c for c in n))
    return (n[0] / ln, n[1] / ln, n[2] / ln)


def _edge(profile, x):
    """Kante des Traegers bei x: hinten hoch, ueber die Schulter, vorn runter - gleichmaessig nach Bogenlaenge."""
    top = _crest(profile, x)
    fine = [_surface(profile, x, Z_BACK + (top - Z_BACK) * i / 400, 1) for i in range(401)]
    fine += [_surface(profile, x, top - (top - Z_FRONT) * i / 400, -1) for i in range(1, 401)]
    acc = [0.0]
    for a, b in zip(fine, fine[1:]):
        acc.append(acc[-1] + math.dist(a, b))
    out, j = [], 0
    for i in range(SAMPLES):
        s = acc[-1] * i / (SAMPLES - 1)
        while j < len(acc) - 2 and acc[j + 1] < s:
            j += 1
        t = (s - acc[j]) / max(1e-9, acc[j + 1] - acc[j])
        a, b = fine[j], fine[j + 1]
        out.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return out


def straps(profile, color):
    """Beide Traeger als (verts, faces, face_cols, vert_normals): Deckband plus schmale Seitenwaende (Vierecke)."""
    verts, faces, cols, nrms = [], [], [], []

    def quad(a, b, c, d, na, nb, nc, nd):
        i = len(verts)
        verts.extend([a, b, c, d]); nrms.extend([na, nb, nc, nd])
        faces.append((i, i + 1, i + 2, i + 3)); cols.append(color)

    for side in (-1, 1):
        lo, hi, nn = [], [], []   # je Kante (innen, aussen): auf der Rumpfform / angehoben / Normalen
        for x in (X_MID - WIDTH / 2, X_MID + WIDTH / 2):
            e = [(side * p[0], p[1], p[2]) for p in _edge(profile, x)]
            n = [_normal(profile, p) for p in e]
            lo.append(e); nn.append(n)
            hi.append([tuple(p[k] + q[k] * LIFT for k in range(3)) for p, q in zip(e, n)])
        for i in range(SAMPLES - 1):
            quad(hi[0][i], hi[1][i], hi[1][i + 1], hi[0][i + 1], nn[0][i], nn[1][i], nn[1][i + 1], nn[0][i + 1])
            for k, sgn in ((0, -1), (1, 1)):     # Seitenwaende: Ebene x = konst., zeigen quer nach aussen
                wn = (side * sgn, 0.0, 0.0)
                quad(lo[k][i], hi[k][i], hi[k][i + 1], lo[k][i + 1], wn, wn, wn, wn)
    return _orient(verts, faces, nrms), faces, cols, nrms


def _orient(verts, faces, nrms):
    """Umlaufsinn je Flaeche so drehen, dass er zur Normale passt (nach aussen)."""
    for fi, f in enumerate(faces):
        a, b, c = (verts[i] for i in f[:3])
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        cr = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        n = nrms[f[0]]
        if cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0:
            faces[fi] = tuple(reversed(f))
    return verts
