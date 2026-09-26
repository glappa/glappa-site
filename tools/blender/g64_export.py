"""Blender-Seite der Pipeline: Objekte -> G64M.

Laeuft nur in Blender (braucht bpy). Jedes Mesh-Objekt wird zu einem Teil;
der Objektname ist der Teilname im Spiel (z. B. 'astro.head').

Wichtig fuer das Rig: exportiert werden LOKALE Koordinaten. Der Objekt-Ursprung
ist damit genau der Gelenkpunkt, um den drawPlayer() das Teil dreht.

Achsen: Blender ist Z-oben und die Figur schaut nach -Y; das Spiel ist Y-oben
und die Figur schaut nach +Z. Die Drehung (x, y, z) -> (x, z, -y) leistet genau
das und hat Determinante +1, laesst den Umlaufsinn der Dreiecke also in Ruhe.
"""

import bpy
import mathutils

import g64m


def _axis(v):
    """Blender (Z-oben, Blick -Y) -> Spiel (Y-oben, Blick +Z)."""
    return (v[0], v[2], -v[1])


def _colors(mesh):
    """Liefert eine Funktion loop_index -> (r, g, b) oder None."""
    ca = mesh.color_attributes
    if not ca:
        return None
    lay = ca.active_color or ca[0]
    dom, data = lay.domain, lay.data
    if dom == 'POINT':
        vi = [l.vertex_index for l in mesh.loops]
        return lambda li: data[vi[li]].color[:3]
    return lambda li: data[li].color[:3]


def _uvs(mesh):
    lay = mesh.uv_layers.active
    if not lay:
        return None
    data = lay.data
    return lambda li: (data[li].uv[0], data[li].uv[1])


def part_from_object(obj, depsgraph, name=None):
    """Baut aus einem Mesh-Objekt einen g64m.Part (indiziert, dedupliziert)."""
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    try:
        mesh.calc_loop_triangles()
        try:
            normals = mesh.corner_normals          # Blender 4.1+: geteilte Normalen
            nrm_of = lambda li: normals[li].vector
        except AttributeError:                      # aeltere Versionen
            mesh.calc_normals_split()
            nrm_of = lambda li: mesh.loops[li].normal

        # Drehung/Skalierung des Objekts mitnehmen, Verschiebung NICHT
        # (der Ursprung bleibt der Gelenkpunkt).
        basis = obj.matrix_basis.to_3x3()
        nmat = basis.inverted_safe().transposed()
        col_of, uv_of = _colors(mesh), _uvs(mesh)

        pos, nrm, col, uv, idx = [], [], [], ([] if uv_of else None), []
        seen = {}
        for tri in mesh.loop_triangles:
            for li in tri.loops:
                v = basis @ mesh.vertices[mesh.loops[li].vertex_index].co
                n = (nmat @ mathutils.Vector(nrm_of(li))).normalized()
                p3, n3 = _axis(v), _axis(n)
                c3 = col_of(li) if col_of else (1.0, 1.0, 1.0)
                t2 = uv_of(li) if uv_of else (0.0, 0.0)
                key = (tuple(round(x, 5) for x in p3), tuple(round(x, 4) for x in n3),
                       tuple(round(x, 4) for x in c3), tuple(round(x, 4) for x in t2))
                j = seen.get(key)
                if j is None:
                    j = seen[key] = len(pos) // 3
                    pos.extend(p3); nrm.extend(n3); col.extend(c3)
                    if uv is not None:
                        uv.extend(t2)
                idx.append(j)
        return g64m.Part(name or obj.name, pos, nrm, col, uv, idx)
    finally:
        ev.to_mesh_clear()


def export(path, objects=None, verbose=True):
    """Schreibt alle Mesh-Objekte (Standard: die der aktuellen Szene) nach path."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objs = objects if objects is not None else [o for o in bpy.context.scene.objects if o.type == 'MESH']
    parts = [part_from_object(o, depsgraph) for o in objs]
    size = g64m.write(path, parts)
    if verbose:
        for p in parts:
            print(f'  {p.name:22s} {p.vert_count:5d} Ecken  {p.tri_count:5d} Dreiecke')
        tris = sum(p.tri_count for p in parts)
        print(f'  -> {len(parts)} Teile, {tris} Dreiecke, {size/1024:.1f} KB')
    return parts, size
