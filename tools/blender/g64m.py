"""G64M - kompaktes Modellformat fuer SUPER GLAPPA 64.

Die Engine (secret/glappa64.js) zeichnet ausschliesslich nicht-indizierte Dreiecke
mit je Position, Normale, Vertexfarbe und UV. Dieses Format speichert dieselben
Daten indiziert und quantisiert; der Lader im Spiel faltet sie beim Start wieder
auf die flachen Float32-Puffer auf, die `upload()` erwartet. Dadurch muss am
Renderer nichts geaendert werden.

Aufbau (little endian):

  'G64M'            4 B   Magic
  uint16 version    = 1
  uint16 partCount
  Verzeichnis, je Teil:
    uint16 nameLen, name (utf-8), auf 4 B aufgefuellt
    uint32 flags          Bit 0 = UVs vorhanden, Bit 1 = 32-Bit-Indizes
    float32[6] bbox       minx,miny,minz, maxx,maxy,maxz (zum Entquantisieren)
    uint32 vertCount, uint32 triCount, uint32 offset

  Datenblock je Teil (jedes Feld auf 4 B ausgerichtet):
    int16[3n]  pos   in die bbox normiert
    int16[3n]  nrm   x32767
    uint8[3n]  col   0..255
    int16[2n]  uv    x1024   (nur wenn Bit 0)
    uint16|uint32[3t] idx
"""

import struct

MAGIC = b'G64M'
VERSION = 1
F_UV = 1
F_IDX32 = 2
UV_SCALE = 1024.0


def _pad4(b: bytearray) -> None:
    while len(b) % 4:
        b.append(0)


class Part:
    """Ein Teilmesh. pos/nrm je 3 Werte, col je 3 (0..1), uv je 2 - alles pro Vertex."""

    def __init__(self, name, pos, nrm, col, uv, idx):
        self.name = name
        self.pos, self.nrm, self.col, self.uv, self.idx = pos, nrm, col, uv, idx
        n = len(pos) // 3
        assert len(nrm) == 3 * n and len(col) == 3 * n, f'{name}: Feldlaengen passen nicht'
        assert uv is None or len(uv) == 2 * n, f'{name}: UV-Laenge passt nicht'
        assert len(idx) % 3 == 0, f'{name}: Indizes nicht durch 3 teilbar'
        assert n > 0 and idx, f'{name}: leer'
        assert max(idx) < n, f'{name}: Index zeigt ins Leere'
        self.vert_count, self.tri_count = n, len(idx) // 3

    def bbox(self):
        p = self.pos
        lo = [min(p[i::3]) for i in range(3)]
        hi = [max(p[i::3]) for i in range(3)]
        # entartete Achsen (flache Teile) nicht auf 0 laufen lassen
        for i in range(3):
            if hi[i] - lo[i] < 1e-6:
                lo[i] -= 5e-4
                hi[i] += 5e-4
        return lo, hi

    def encode(self):
        lo, hi = self.bbox()
        b = bytearray()
        for i, v in enumerate(self.pos):
            a = i % 3
            q = (v - lo[a]) / (hi[a] - lo[a]) * 65535.0 - 32768.0
            b += struct.pack('<h', max(-32768, min(32767, int(round(q)))))
        _pad4(b)
        for v in self.nrm:
            b += struct.pack('<h', max(-32767, min(32767, int(round(v * 32767.0)))))
        _pad4(b)
        for v in self.col:
            b.append(max(0, min(255, int(round(v * 255.0)))))
        _pad4(b)
        flags = 0
        if self.uv is not None:
            flags |= F_UV
            for v in self.uv:
                q = int(round(v * UV_SCALE))
                b += struct.pack('<h', max(-32768, min(32767, q)))
            _pad4(b)
        if self.vert_count > 65535:
            flags |= F_IDX32
            for v in self.idx:
                b += struct.pack('<I', v)
        else:
            for v in self.idx:
                b += struct.pack('<H', v)
        _pad4(b)
        return flags, lo, hi, bytes(b)


def write(path, parts):
    """Schreibt die Teile nach path und liefert die Dateigroesse."""
    enc = [p.encode() for p in parts]
    head = bytearray(MAGIC + struct.pack('<HH', VERSION, len(parts)))
    entries = bytearray()
    for p, (flags, lo, hi, _) in zip(parts, enc):
        nb = p.name.encode('utf-8')
        entries += struct.pack('<H', len(nb)) + nb
        while len(entries) % 4:
            entries.append(0)
        entries += struct.pack('<I', flags)
        entries += struct.pack('<6f', *lo, *hi)
        entries += struct.pack('<III', p.vert_count, p.tri_count, 0)   # offset spaeter
    # Offsets nachtragen: dafuer die Positionen der offset-Felder erneut ablaufen
    out = bytearray(head + entries)
    while len(out) % 4:
        out.append(0)
    cur = len(out)
    pos = len(head)
    for p, (flags, lo, hi, data) in zip(parts, enc):
        nb = p.name.encode('utf-8')
        pos += 2 + len(nb)
        pos += (-pos) % 4
        pos += 4 + 24 + 8          # flags + bbox + vertCount/triCount
        struct.pack_into('<I', out, pos, cur)
        pos += 4
        out += data
        cur = len(out)
    with open(path, 'wb') as f:
        f.write(out)
    return len(out)


def read(path):
    """Liest eine G64M-Datei zurueck (zum Pruefen ohne Blender)."""
    raw = open(path, 'rb').read()
    assert raw[:4] == MAGIC, 'kein G64M'
    ver, n = struct.unpack_from('<HH', raw, 4)
    assert ver == VERSION, f'Version {ver} unbekannt'
    o, parts = 8, []
    for _ in range(n):
        (ln,) = struct.unpack_from('<H', raw, o)
        name = raw[o + 2:o + 2 + ln].decode('utf-8')
        o += 2 + ln
        o += (-o) % 4
        (flags,) = struct.unpack_from('<I', raw, o); o += 4
        bb = struct.unpack_from('<6f', raw, o); o += 24
        vc, tc, off = struct.unpack_from('<III', raw, o); o += 12
        parts.append({'name': name, 'flags': flags, 'bbox': bb,
                      'vertCount': vc, 'triCount': tc, 'offset': off})
    return parts, raw
