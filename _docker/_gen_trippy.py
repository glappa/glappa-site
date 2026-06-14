"""
_gen_trippy.py v2 — erzeugt ~120 GARANTIERT eindeutige Varianten der b*.gif
anime-girl bounces. Jede Variante kombiniert:
  - 1-2 Farb-/Style-Effekte (hue, posterize, vapor, glitch, ...)
  - 1 Accessoire/Decoration (crown/halo/horns/bow/hat/glasses/sparkles/glow/bubble)
  - Eindeutiger Seed -> einzigartige Parameter (Farbe, Position, ...)

Output: img/gif/bx001.gif ... bx120.gif
"""
import os, glob, random, hashlib
import numpy as np
from PIL import Image, ImageSequence, ImageDraw, ImageFilter, ImageChops, ImageFont


# ────────────────────────────── helpers ─────────────────────────────
def coalesce(gif_path):
    """Read animated gif as standalone-rendered RGBA frames (PIL handles
    disposal automatically)."""
    im = Image.open(gif_path)
    dur = im.info.get('duration', 100)
    loop = im.info.get('loop', 0)
    frames = [np.array(fr.convert('RGBA')) for fr in ImageSequence.Iterator(im)]
    return frames, dur, loop


def save_gif(frames, out_path, dur=100, loop=0):
    pal = []
    for arr in frames:
        img = Image.fromarray(arr, mode='RGBA')
        alpha = img.split()[3]
        rgb = img.convert('RGB')
        p = rgb.quantize(colors=255, method=Image.MEDIANCUT)
        mask = alpha.point(lambda a: 255 if a < 128 else 0).convert('1')
        p.paste(255, mask)
        p.info['transparency'] = 255
        pal.append(p)
    pal[0].save(out_path, save_all=True, append_images=pal[1:],
                duration=dur, loop=loop, transparency=255, disposal=2)


def with_pil(arr, draw_fn):
    """Open arr as PIL RGBA, run draw_fn(draw, img), return numpy."""
    img = Image.fromarray(arr, mode='RGBA')
    draw = ImageDraw.Draw(img, mode='RGBA')
    draw_fn(draw, img)
    return np.array(img)


def find_head_center(arr):
    """Approx topmost non-transparent center column."""
    alpha = arr[..., 3]
    mask = alpha > 50
    if not mask.any():
        return arr.shape[1] // 2, 10
    rows = np.where(mask.any(axis=1))[0]
    top = rows[0]
    # Center column of top 8 rows
    cols = np.where(mask[top:top+8].any(axis=0))[0]
    cx = (cols[0] + cols[-1]) // 2 if len(cols) else arr.shape[1] // 2
    return cx, max(0, top)


# ───────────────────────── color / style effects ────────────────────
def hue_shift(arr, deg):
    if deg == 0: return arr
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    mx = np.maximum.reduce([r, g, b]).astype(np.float32)
    mn = np.minimum.reduce([r, g, b]).astype(np.float32)
    diff = mx - mn
    sat_mask = diff > 0
    rr = (mx - r.astype(np.float32)) / np.where(diff == 0, 1, diff)
    gg = (mx - g.astype(np.float32)) / np.where(diff == 0, 1, diff)
    bb = (mx - b.astype(np.float32)) / np.where(diff == 0, 1, diff)
    h = np.where(r == mx, bb - gg, np.where(g == mx, 2 + rr - bb, 4 + gg - rr))
    h = ((h / 6.0) + deg / 360.0) % 1.0
    s = np.where(mx == 0, 0, diff / np.where(mx == 0, 1, mx))
    v = mx / 255.0
    i = (h * 6).astype(np.int32)
    f = h * 6 - i
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    i = i % 6
    nr = np.choose(i, [v, q, p, p, t, v])
    ng = np.choose(i, [t, v, v, q, p, p])
    nb = np.choose(i, [p, p, t, v, v, q])
    apply = sat_mask & (a > 30)
    out = arr.copy()
    out[..., 0] = np.where(apply, (nr * 255).clip(0, 255), arr[..., 0])
    out[..., 1] = np.where(apply, (ng * 255).clip(0, 255), arr[..., 1])
    out[..., 2] = np.where(apply, (nb * 255).clip(0, 255), arr[..., 2])
    return out.astype(np.uint8)


def mirror(arr): return arr[:, ::-1].copy()
def invert(arr):
    out = arr.copy(); out[..., :3] = 255 - out[..., :3]; return out
def posterize(arr, levels=4):
    out = arr.copy(); step = 256 // levels
    out[..., :3] = (out[..., :3] // step) * step
    return out

def rgb_split(arr, dx=3):
    out = arr.copy()
    out[..., 0] = np.roll(arr[..., 0], -dx, axis=1)
    out[..., 2] = np.roll(arr[..., 2], dx, axis=1)
    transp = arr[..., 3:4] < 30
    out[..., :3] = np.where(transp, 0, out[..., :3])
    return out

def channel_mix(arr, mode='vaporwave'):
    out = arr.copy().astype(np.float32)
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    if mode == 'vaporwave':
        out[..., 0] = (r * 0.9 + b * 0.3).clip(0, 255)
        out[..., 1] = (g * 0.5 + b * 0.2).clip(0, 255)
        out[..., 2] = (b * 0.9 + r * 0.2).clip(0, 255)
    elif mode == 'thermal':
        lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255.0
        out[..., 0] = (lum * 255).clip(0, 255)
        out[..., 1] = (np.where(lum < 0.5, 0, (lum - 0.5) * 510)).clip(0, 255)
        out[..., 2] = (np.where(lum < 0.7, 0, (lum - 0.7) * 850)).clip(0, 255)
    elif mode == 'duotone':
        lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255.0
        out[..., 0] = lum * 255 * 0.6 + (1 - lum) * 100
        out[..., 1] = lum * 255 * 0.9 + (1 - lum) * 30
        out[..., 2] = lum * 100 + (1 - lum) * 200
    elif mode == 'sepia':
        lum = (r * 0.3 + g * 0.59 + b * 0.11)
        out[..., 0] = (lum * 1.05).clip(0, 255)
        out[..., 1] = (lum * 0.85).clip(0, 255)
        out[..., 2] = (lum * 0.55).clip(0, 255)
    elif mode == 'matrix':
        lum = (r * 0.3 + g * 0.59 + b * 0.11)
        out[..., 0] = 0
        out[..., 1] = lum.clip(0, 255)
        out[..., 2] = (lum * 0.3).clip(0, 255)
    elif mode == 'cyber':
        lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255.0
        out[..., 0] = (np.where(lum > 0.5, lum * 255, 50)).clip(0, 255)
        out[..., 1] = (np.where(lum > 0.5, 50, lum * 100)).clip(0, 255)
        out[..., 2] = (np.where(lum > 0.5, 255, lum * 200)).clip(0, 255)
    return out.clip(0, 255).astype(np.uint8)


# ───────────────────────── overlay effects (NEW) ────────────────────
def add_crown(arr, color=(255, 215, 0), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = max(2, top - 12)
        # 3 spikes
        for dx in (-14, 0, 14):
            d.polygon([(cx+dx-6, y+12), (cx+dx, y), (cx+dx+6, y+12)], fill=color)
        # band
        d.rectangle([cx-20, y+10, cx+20, y+15], fill=tuple(c*7//10 for c in color))
        # jewel
        d.ellipse([cx-3, y+3, cx+3, y+9], fill=(255, 50, 100))
    return with_pil(arr, draw)


def add_halo(arr, color=(255, 255, 100), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = max(0, top - 12)
        # outer ring
        d.ellipse([cx-25, y-2, cx+25, y+8], outline=color, width=3)
        # inner soft glow
        c2 = tuple(min(255, c+40) for c in color)
        d.ellipse([cx-21, y+1, cx+21, y+6], outline=c2, width=1)
    return with_pil(arr, draw)


def add_devil_horns(arr, color=(220, 0, 0), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = max(0, top + 2)
        d.polygon([(cx-18, y+14), (cx-12, y-8), (cx-6, y+14)], fill=color)
        d.polygon([(cx+6, y+14), (cx+12, y-8), (cx+18, y+14)], fill=color)
    return with_pil(arr, draw)


def add_bow(arr, color=(255, 80, 180), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = max(0, top - 3)
        d.polygon([(cx-18, y), (cx, y+10), (cx-18, y+18)], fill=color)
        d.polygon([(cx+18, y), (cx, y+10), (cx+18, y+18)], fill=color)
        d.ellipse([cx-5, y+5, cx+5, y+15], fill=tuple(c*7//10 for c in color))
    return with_pil(arr, draw)


def add_party_hat(arr, color=(50, 180, 255), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = max(2, top - 22)
        # cone
        d.polygon([(cx-12, top+2), (cx, y), (cx+12, top+2)], fill=color)
        # tip pompom
        d.ellipse([cx-4, y-6, cx+4, y+2], fill=(255, 220, 50))
        # bands
        for i in range(2):
            yy = y + 8 + i*6
            d.line([(cx-9+i*2, yy), (cx+9-i*2, yy)], fill=(255, 255, 255), width=2)
    return with_pil(arr, draw)


def add_glasses(arr, color=(0, 0, 0), seed=0):
    cx, top = find_head_center(arr)
    def draw(d, img):
        y = top + 25  # eye level (approx)
        # two lenses
        d.ellipse([cx-22, y, cx-6, y+12], fill=color)
        d.ellipse([cx+6, y, cx+22, y+12], fill=color)
        # bridge
        d.line([(cx-6, y+6), (cx+6, y+6)], fill=color, width=2)
        # tiny highlights
        d.ellipse([cx-18, y+2, cx-15, y+5], fill=(255, 255, 255))
        d.ellipse([cx+10, y+2, cx+13, y+5], fill=(255, 255, 255))
    return with_pil(arr, draw)


def add_sparkles(arr, color=(255, 255, 200), n=14, seed=0):
    rng = np.random.default_rng(seed)
    H, W = arr.shape[:2]
    def draw(d, img):
        for _ in range(n):
            x = rng.integers(2, W-2)
            y = rng.integers(2, H-2)
            r = int(rng.integers(2, 5))
            # 4-pointed star = ellipse + perpendicular
            d.ellipse([x-r, y-1, x+r, y+1], fill=color)
            d.ellipse([x-1, y-r, x+1, y+r], fill=color)
    return with_pil(arr, draw)


def add_outline_glow(arr, color=(255, 0, 255), thickness=3):
    img = Image.fromarray(arr, 'RGBA')
    alpha = img.split()[3]
    expanded = alpha.filter(ImageFilter.MaxFilter(2*thickness+1))
    edge = ImageChops.subtract(expanded, alpha)
    edge_np = np.array(edge)
    mask = edge_np > 30
    out = arr.copy()
    out[..., 0] = np.where(mask, color[0], out[..., 0])
    out[..., 1] = np.where(mask, color[1], out[..., 1])
    out[..., 2] = np.where(mask, color[2], out[..., 2])
    out[..., 3] = np.where(mask, 220, out[..., 3])
    return out


def add_speech_bubble(arr, text='?', color=(255, 255, 255), seed=0):
    cx, top = find_head_center(arr)
    bx = cx + 25
    by = max(2, top - 8)
    def draw(d, img):
        # bubble body
        d.rounded_rectangle([bx, by, bx+30, by+18], radius=8,
                            fill=color, outline=(0, 0, 0), width=2)
        # tail
        d.polygon([(bx+4, by+14), (bx-5, by+22), (bx+10, by+15)],
                  fill=color, outline=(0, 0, 0))
        # text
        try:
            font = ImageFont.load_default()
            d.text((bx+10, by+3), text, fill=(0, 0, 0), font=font)
        except:
            d.text((bx+10, by+3), text, fill=(0, 0, 0))
    return with_pil(arr, draw)


def add_neon_aura(arr, color=(0, 255, 255), thickness=6):
    """Glowing aura around figure (soft outer-glow)."""
    img = Image.fromarray(arr, 'RGBA')
    alpha = img.split()[3]
    expanded = alpha.filter(ImageFilter.MaxFilter(2*thickness+1))
    blurred = expanded.filter(ImageFilter.GaussianBlur(thickness))
    edge_np = np.array(blurred)
    mask = (edge_np > 30) & (np.array(alpha) < 30)
    # intensity proportional to blur value
    intensity = edge_np / 255.0
    out = arr.copy()
    out[..., 0] = np.where(mask, color[0], out[..., 0])
    out[..., 1] = np.where(mask, color[1], out[..., 1])
    out[..., 2] = np.where(mask, color[2], out[..., 2])
    out[..., 3] = np.where(mask, (intensity * 200).clip(0, 220).astype(np.uint8),
                          out[..., 3])
    return out


def add_mole(arr, color=(60, 30, 30), seed=0):
    """Tiny mole on cheek."""
    cx, top = find_head_center(arr)
    side = 1 if (seed % 2) else -1
    x = cx + side * 18
    y = top + 35
    def draw(d, img):
        d.ellipse([x-2, y-2, x+2, y+2], fill=color)
    return with_pil(arr, draw)


def add_eye_mask(arr, color=(255, 0, 100), seed=0):
    """Lone-ranger style eye mask."""
    cx, top = find_head_center(arr)
    y = top + 25
    def draw(d, img):
        d.rectangle([cx-24, y, cx+24, y+10], fill=color)
        # eye holes
        d.ellipse([cx-18, y+1, cx-8, y+9], fill=(0, 0, 0, 0))
        d.ellipse([cx+8, y+1, cx+18, y+9], fill=(0, 0, 0, 0))
    return with_pil(arr, draw)


# ─────────────────────────── pipeline ───────────────────────────────
def apply_pipeline(frames, effects):
    out = []
    for f in frames:
        orig_alpha = f[..., 3].copy()
        x = f
        for fn, kwargs in effects:
            x = fn(x, **kwargs)
        out.append(x)
    return out


# ─────────────────────── recipe definitions ────────────────────────
ACCESSORIES = [
    ('crown',    add_crown,        [(255,215,0), (255,80,255), (200,255,150), (255,180,50), (200,180,255)]),
    ('halo',     add_halo,         [(255,255,100), (255,255,255), (100,255,200), (255,180,255)]),
    ('horns',    add_devil_horns,  [(220,0,0), (255,0,150), (180,0,255), (0,180,0)]),
    ('bow',      add_bow,          [(255,80,180), (100,200,255), (255,180,50), (0,255,150)]),
    ('hat',      add_party_hat,    [(50,180,255), (255,80,180), (180,255,50), (255,180,50), (200,100,255)]),
    ('glasses',  add_glasses,      [(0,0,0), (255,0,0), (0,200,0), (50,50,150)]),
    ('eyemask',  add_eye_mask,     [(255,0,100), (0,0,0), (50,50,150), (180,0,255)]),
    ('mole',     add_mole,         [(60,30,30), (180,50,50)]),
]
GLOWS = [
    ('aura',  add_neon_aura,   [(0,255,255), (255,0,255), (255,255,0), (0,255,0), (255,80,0)]),
    ('edge',  add_outline_glow,[(255,0,255), (0,255,255), (255,255,255), (255,0,0), (0,255,0)]),
]
COLOR_STYLES = [
    ('hue', hue_shift, [{'deg': d} for d in (40, 80, 120, 160, 200, 240, 280, 320)]),
    ('vapor', channel_mix, [{'mode': 'vaporwave'}]),
    ('thermal', channel_mix, [{'mode': 'thermal'}]),
    ('matrix', channel_mix, [{'mode': 'matrix'}]),
    ('sepia', channel_mix, [{'mode': 'sepia'}]),
    ('cyber', channel_mix, [{'mode': 'cyber'}]),
    ('duotone', channel_mix, [{'mode': 'duotone'}]),
    ('posterize', posterize, [{'levels': l} for l in (2, 3, 4, 5)]),
    ('mirror', mirror, [{}]),
    ('rgb_split', rgb_split, [{'dx': 3}, {'dx': 5}]),
    ('invert', invert, [{}]),
]


def make_recipes(target_count=80):
    """Reine Color-/Style-Effekte ohne overlays/Accessoires.
    Unique-Combos durch (effect, hue, modifier)-Tupel."""
    recipes = []
    rng = random.Random(2026)
    seen_keys = set()

    while len(recipes) < target_count:
        steps = []
        label_parts = []

        # 1) Primary color-style (immer)
        cs_name, cs_fn, cs_params = rng.choice(COLOR_STYLES)
        cs_kw = rng.choice(cs_params)
        steps.append((cs_fn, cs_kw))
        label_parts.append(cs_name + '_' + str(list(cs_kw.values())[0]) if cs_kw else cs_name)

        # 2) Optionaler zweiter Style (40%, anderer als primary)
        if rng.random() < 0.40:
            others = [s for s in COLOR_STYLES if s[0] != cs_name]
            cs2_name, cs2_fn, cs2_params = rng.choice(others)
            cs2_kw = rng.choice(cs2_params)
            steps.append((cs2_fn, cs2_kw))
            label_parts.append(cs2_name + '_' + str(list(cs2_kw.values())[0]) if cs2_kw else cs2_name)

        key = '|'.join(label_parts)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        recipes.append((key[:60], steps))

    return recipes


# ───────────────────────────── main ─────────────────────────────────
def main():
    os.makedirs('img/gif', exist_ok=True)
    sources = sorted([s for s in glob.glob('img/gif/b*.gif')
                      if os.path.basename(s).replace('b','').replace('.gif','').isdigit()])
    print(f'sources: {len(sources)}')

    recipes = make_recipes(target_count=120)
    print(f'unique recipes: {len(recipes)}')

    targets = []
    rng = random.Random(42)
    for i, rec in enumerate(recipes):
        src = sources[i % len(sources)]
        targets.append((src, rec))
    rng.shuffle(targets)

    ok = 0
    for idx, (src, (label, effects)) in enumerate(targets, 1):
        fname = f'img/gif/bx{idx:03d}.gif'
        try:
            frames, dur, loop = coalesce(src)
            out = apply_pipeline(frames, effects)
            save_gif(out, fname, dur=dur, loop=loop)
            ok += 1
            if idx % 10 == 0 or idx <= 5:
                base = os.path.basename(src)
                print(f'  {fname}  <- {base} [{label[:40]}]')
        except Exception as e:
            print(f'  FAIL {fname}: {e}')

    print(f'\n--> {ok} unique GIFs generated')


if __name__ == '__main__':
    main()
