"""Bauwerkzeug fuer die Figurenteile.

Leitgedanke: im Spiel entsteht ein Arm heute aus Kugel + Zylinder + Kugel, die sich
durchdringen - man sieht die Naehte. Hier wird stattdessen EINE durchgehende
Rotationsflaeche erzeugt. Gleiche Polygonklasse, aber eine echte Silhouette.

Koordinaten: Blender ist Z-oben, die Figur schaut nach -Y. Der Exporter dreht das
auf das Y-oben-System des Spiels. Gliedmassen haengen also in -Z.

Farben liegen auf der CORNER-Domain und werden pro Flaeche gesetzt - das gibt
harte Farbkanten wie im Vorbild statt weicher Verlaeufe.
"""

import math

import bpy


def clear():
    """Leere Szene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_from(name, verts, faces, face_cols, smooth):
    """Erzeugt ein Objekt. face_cols: je Flaeche (r,g,b). smooth: je Flaeche bool."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p, sm in zip(me.polygons, smooth):
        p.use_smooth = sm
    ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
    for p, c in zip(me.polygons, face_cols):
        for li in p.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def hexc(h):
    """'#aabbcc' -> (r, g, b) in 0..1 - exakt wie hex() in der Engine, ohne Gamma."""
    return (int(h[1:3], 16) / 255, int(h[3:5], 16) / 255, int(h[5:7], 16) / 255)


def lathe(name, profile, segs=10, color=None, seam_smooth=True):
    """Rotationsflaeche um die Z-Achse.

    profile: Liste (z, rx, ry) von unten nach oben. rx/ry = 0 erzeugt einen Pol
             (rundes Ende statt Deckel).
    color:   (r,g,b) oder Funktion (z_mitte) -> (r,g,b) fuer Farbbaender.
    """
    verts, faces, cols, smooth = [], [], [], []
    rings = []
    for (z, rx, ry) in profile:
        if rx <= 1e-6 or ry <= 1e-6:
            rings.append(('pole', len(verts), z))
            verts.append((0.0, 0.0, z))
        else:
            rings.append(('ring', len(verts), z))
            for j in range(segs):
                a = j / segs * math.tau
                verts.append((math.cos(a) * rx, math.sin(a) * ry, z))

    def col_at(i, zm):
        if color is None:
            return (1.0, 1.0, 1.0)
        if not callable(color):
            return color
        return color(i / max(1, len(rings) - 1), (0.0, 0.0, zm))

    for i in range(len(rings) - 1):
        (ka, ba, za), (kb, bb, zb) = rings[i], rings[i + 1]
        zm = (za + zb) / 2
        c = col_at(i, zm)
        if ka == 'pole' and kb == 'ring':
            for j in range(segs):                       # unterer Pol: umgekehrt, sonst zeigt der Deckel nach innen
                faces.append((ba, bb + (j + 1) % segs, bb + j))
                cols.append(c); smooth.append(seam_smooth)
        elif ka == 'ring' and kb == 'pole':
            for j in range(segs):
                faces.append((ba + j, ba + (j + 1) % segs, bb))
                cols.append(c); smooth.append(seam_smooth)
        elif ka == 'ring' and kb == 'ring':
            for j in range(segs):
                k = (j + 1) % segs
                faces.append((ba + j, ba + k, bb + k, bb + j))
                cols.append(c); smooth.append(True)
    return mesh_from(name, verts, faces, cols, smooth)


def sweep(name, path, segs=8, color=None, hard=()):
    """Roehre entlang eines Pfades. path: Liste ((x,y,z), radius).

    radius ist eine Zahl (rund) oder (breite_x, tiefe_y) fuer ovale Querschnitte -
    ein Stiefel ist schmaler als tief.

    hard: Indizes von Abschnitten, die flach schattiert werden. Dort entsteht eine
    sichtbare Kante - genau das macht aus einer weichen Ausbuchtung eine
    Stiefelmanschette. Der Querschnitt steht immer senkrecht auf der
    Laufrichtung (paralleler Transport), damit sich die Roehre in Kurven nicht verdreht.
    """
    import mathutils
    pts = [mathutils.Vector(p) for p, _ in path]
    rads = [(r, r) if isinstance(r, (int, float)) else tuple(r) for _, r in path]
    n = len(pts)
    tangents = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tangents.append(t.normalized())

    # Referenzachse X: damit ist der erste Radius immer die Breite (links/rechts)
    # und der zweite die Tiefe (vorn/hinten) - unabhaengig davon, wie der Pfad laeuft.
    up = mathutils.Vector((1.0, 0.0, 0.0))
    ref = up - tangents[0] * up.dot(tangents[0])
    if ref.length < 1e-4:
        ref = mathutils.Vector((0.0, 1.0, 0.0))
    ref.normalize()

    verts, faces, cols, smooth = [], [], [], []
    frames = []
    for i in range(n):
        if i > 0:                                   # paralleler Transport
            t0, t1 = tangents[i - 1], tangents[i]
            ax = t0.cross(t1)
            if ax.length > 1e-6:
                ang = math.atan2(ax.length, t0.dot(t1))
                ref = (mathutils.Matrix.Rotation(ang, 3, ax.normalized()) @ ref).normalized()
        b = tangents[i].cross(ref).normalized()
        frames.append((ref.copy(), b))

    for i, (p, (rx, ry)) in enumerate(zip(pts, rads)):
        u, v = frames[i]
        if rx <= 1e-6 or ry <= 1e-6:
            verts.append(tuple(p))
        else:
            for j in range(segs):
                a = j / segs * math.tau
                verts.append(tuple(p + u * (math.cos(a) * rx) + v * (math.sin(a) * ry)))

    def is_pole(i):
        return rads[i][0] <= 1e-6 or rads[i][1] <= 1e-6

    def base_of(i):
        b = 0
        for k in range(i):
            b += 1 if is_pole(k) else segs
        return b

    def col_at(i):
        """Farbe fuer den Abschnitt i: color(anteil_0_bis_1, mittelpunkt)."""
        if color is None:
            return (1.0, 1.0, 1.0)
        if not callable(color):
            return color
        m = (pts[i] + pts[i + 1]) / 2
        return color(i / max(1, n - 1), (m.x, m.y, m.z))

    for i in range(n - 1):
        ba, bb = base_of(i), base_of(i + 1)
        c = col_at(i)
        sm = i not in hard
        if is_pole(i):
            for j in range(segs):
                faces.append((ba, bb + (j + 1) % segs, bb + j)); cols.append(c); smooth.append(sm)
        elif is_pole(i + 1):
            for j in range(segs):
                faces.append((ba + j, ba + (j + 1) % segs, bb)); cols.append(c); smooth.append(sm)
        else:
            for j in range(segs):
                k = (j + 1) % segs
                faces.append((ba + j, ba + k, bb + k, bb + j)); cols.append(c); smooth.append(sm)
    return mesh_from(name, verts, faces, cols, smooth)


def join(name, objs):
    """Mehrere Objekte zu einem Teil verschmelzen (Ursprung bleibt am Nullpunkt)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name
    return ob


def flatten_bottom(obj, z, tol=1e-4):
    """Druckt alles unterhalb von z auf die Ebene z.

    Eine Roehre endet sonst rund - ein Stiefel sieht damit aus wie ein Ball.
    Mit flacher Sohle steht die Figur auf dem Boden statt darauf zu balancieren.
    Die entstandenen Sohlenflaechen werden flach schattiert, damit die Kante
    zwischen Sohle und Rist sichtbar bleibt.
    """
    me = obj.data
    for v in me.vertices:
        if v.co.z < z:
            v.co.z = z
    for p in me.polygons:
        if all(me.vertices[i].co.z <= z + tol for i in p.vertices):
            p.use_smooth = False
    me.update()
    return obj


# ---------------------------------------------------------------------------
# Grundkoerper fuer Koepfe und Details. Alle bauen um den Nullpunkt und werden
# dann per place() gedreht und verschoben - so bleibt jede Form lesbar.
# ---------------------------------------------------------------------------

def place(obj, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Dreht (Euler XYZ, Bogenmass) und verschiebt die Geometrie selbst, nicht das Objekt.

    Der Exporter nimmt lokale Koordinaten; darum muss die Lage in den Eckpunkten
    stecken, nicht im Objekt-Transform.
    """
    import mathutils
    m = mathutils.Matrix.Translation(loc) @ mathutils.Euler(rot, 'XYZ').to_matrix().to_4x4()
    obj.data.transform(m)
    obj.data.update()
    return obj


def ellipsoid(name, radii, segs=10, rings=6, color=(1, 1, 1), smooth=True):
    """Ellipsoid um den Nullpunkt (Radien x, y, z)."""
    rx, ry, rz = radii
    verts, faces = [(0.0, 0.0, -rz)], []
    for i in range(1, rings):
        th = math.pi * i / rings
        z, s = -math.cos(th) * rz, math.sin(th)
        for j in range(segs):
            a = j / segs * math.tau
            verts.append((math.cos(a) * rx * s, math.sin(a) * ry * s, z))
    top = len(verts)
    verts.append((0.0, 0.0, rz))

    def ring(i):
        return 1 + (i - 1) * segs

    for j in range(segs):                                  # unterer Pol
        faces.append((0, ring(1) + (j + 1) % segs, ring(1) + j))
    for i in range(1, rings - 1):
        a, b = ring(i), ring(i + 1)
        for j in range(segs):
            k = (j + 1) % segs
            faces.append((a + j, a + k, b + k, b + j))
    last = ring(rings - 1)
    for j in range(segs):                                  # oberer Pol
        faces.append((last + j, last + (j + 1) % segs, top))
    return mesh_from(name, verts, faces, [color] * len(faces), [smooth] * len(faces))


def disc(name, rx, rz, segs=10, color=(1, 1, 1)):
    """Flache Ellipse in der XZ-Ebene, zeigt nach -Y (nach vorn, zur Kamera der Figur)."""
    verts = [(0.0, 0.0, 0.0)] + [(math.cos(j / segs * math.tau) * rx, 0.0, math.sin(j / segs * math.tau) * rz)
                                 for j in range(segs)]
    faces = [(0, 1 + j, 1 + (j + 1) % segs) for j in range(segs)]
    return mesh_from(name, verts, faces, [color] * segs, [False] * segs)


def cuboid(name, size, color=(1, 1, 1)):
    """Quader um den Nullpunkt, flach schattiert."""
    x, y, z = size[0] / 2, size[1] / 2, size[2] / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_from(name, v, f, [color] * 6, [False] * 6)


def star(name, R, depth, color=(1, 1, 1)):
    """Fuenfzackiger Stern in der XZ-Ebene, vorne bei -Y, mit etwas Dicke."""
    rim = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = R if i % 2 == 0 else R * 0.44
        rim.append((math.cos(a) * r, 0.0, math.sin(a) * r))
    verts = [(0.0, -depth, 0.0), (0.0, depth * 0.3, 0.0)] + rim
    faces = []
    for i in range(10):
        a, b = 2 + i, 2 + (i + 1) % 10
        faces.append((0, b, a))       # Vorderseite (nach -Y)
        faces.append((1, a, b))       # Rueckseite
    return mesh_from(name, verts, faces, [color] * len(faces), [False] * len(faces))


def paint(obj, fn):
    """Faerbt Flaechen nach Lage um: fn(mitte, normale) -> (r,g,b) oder None (unveraendert).

    Damit lassen sich Latz, Traeger und Muster auf eine fertige Form legen, ohne
    die Form dafuer zu zerschneiden.
    """
    me = obj.data
    ca = me.color_attributes['Col']
    for p in me.polygons:
        c = fn(tuple(p.center), tuple(p.normal))
        if c is None:
            continue
        for li in p.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)
    return obj


def merge(name, objs):
    """Fuegt mehrere Objekte zu EINEM Teil zusammen (per bmesh, ohne Operator-Kontext)."""
    import bmesh
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    for o in objs:
        m = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if m.users == 0:
            bpy.data.meshes.remove(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob
