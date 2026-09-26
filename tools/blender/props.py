"""Requisiten fuer die Welten (werden per bakeModel() in die Levelgeometrie eingebacken).

Holzschild: Verhaeltnisse von einem 64er-Schild abgelesen (nur Masse, keine
Geometrie/Textur uebernommen): Brett 1,8 : 1, Dicke ~1/9 der Breite, sitzt VOR
dem Pfosten, der oben spitz ueber das Brett hinausragt. Hoehe hier 2,4 m wie die
bisherige Kollision der Schilder.

Die Vorderseite mit dem Text ist KEIN Teil dieses Modells - die zeichnet das
Spiel als eigene Flaeche mit einer Textur je Schild (L.decals), damit die Schrift
auch unter dem Roehren-Filter scharf bleibt.

Koordinaten: Blender Z-oben, vorn ist -Y (im Spiel +Z). Ursprung = Fusspunkt des Pfostens.
"""

import bmesh

import g64_build as B

# Masse in Metern; muessen zu SIGN_* in secret/glappa64.js passen
H = 2.4                       # Pfostenspitze
BOARD_W, BOARD_H, BOARD_D = 1.72, 0.96, 0.18
BOARD_Z = 1.72                # Brettmitte (unten 1,24, oben 2,20)
BOARD_Y = -0.17               # Brettmitte in der Tiefe (Vorderseite bei -0,26)
POST = 0.2

WOOD = B.hexc('#8a5a2b')
POST_C = B.hexc('#6b4214')
POST_TIP = B.hexc('#553310')


def bevel(obj, width, segments=1):
    """Kanten abfasen (direkt im Mesh, damit merge() sie mitnimmt - Modifier gingen dort verloren)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=width, segments=segments, affect='EDGES', profile=0.5)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def sign_body():
    board = B.place(bevel(B.cuboid('board', (BOARD_W, BOARD_D, BOARD_H), WOOD), 0.03), (0, BOARD_Y, BOARD_Z))
    post = B.place(B.cuboid('post', (POST, POST, H - 0.18 + 0.2), POST_C), (0, 0, (H - 0.18 - 0.2) / 2))
    tip = B.lathe('tip', [(H - 0.18, POST * 0.71, POST * 0.71), (H, 0.0, 0.0)], segs=4, color=POST_TIP)
    B.place(tip, rot=(0, 0, 0.785398))     # vierseitige Spitze deckungsgleich zum Vierkant
    return B.merge('sign.body', [board, post, tip])


def build_all():
    return [sign_body()]
