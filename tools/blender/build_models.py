"""Baut alle Blender-Modelle und schreibt secret/glappa64-models.g64m.

Aufruf (Windows):
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background ^
      --factory-startup --python tools\\blender\\build_models.py

Danach wird in secret/glappa64.html automatisch MODEL_BYTES und die ?v=-Nummer
der Modelldatei nachgezogen, damit der Ladebalken stimmt und Browser-Caches die
neue Datei auch wirklich holen.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import g64_build as B          # noqa: E402
import g64_export              # noqa: E402
import cats                    # noqa: E402
import kappi                   # noqa: E402
import props                   # noqa: E402

OUT = os.path.join(ROOT, 'secret', 'glappa64-models.g64m')
HTML = os.path.join(ROOT, 'secret', 'glappa64.html')


def patch_html(size):
    """MODEL_BYTES und ?v= in der Ladeseite nachziehen."""
    with open(HTML, encoding='utf-8', newline='') as f:
        s = f.read()
    before = s
    s = re.sub(r"var MODEL_BYTES = \d+;", f"var MODEL_BYTES = {size};", s, count=1)

    def bump(m):
        return f"var MODELS_SRC = 'glappa64-models.g64m?v={int(m.group(1)) + 1}';"

    s = re.sub(r"var MODELS_SRC = 'glappa64-models\.g64m\?v=(\d+)';", bump, s, count=1)
    if s != before:
        with open(HTML, 'w', encoding='utf-8', newline='') as f:
            f.write(s)
        v = re.search(r"glappa64-models\.g64m\?v=(\d+)", s).group(1)
        print(f'  glappa64.html: MODEL_BYTES={size}, ?v={v}')


def main():
    B.clear()
    objs = cats.build_all() + kappi.build_all() + props.build_all()
    print(f'{len(objs)} Teile gebaut:')
    parts, size = g64_export.export(OUT, objs)
    patch_html(size)
    print(f'  -> {OUT}')


main()
