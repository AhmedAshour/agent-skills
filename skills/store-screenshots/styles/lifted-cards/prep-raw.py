#!/usr/bin/env python3
"""Lifted-cards style: clean simulator captures into the store-kit raw dir and pick the cards each frame lifts.

    python3 prep-raw.py --root=<repo> [--src=/tmp/raw]

Reads <repo>/app_store/screenshot-tool/lift.json, writes:
  <rawDir>/<folder>/<screen>.png      cleaned captures (rawDir from store-kit.json)
  app_store/screenshot-tool/lift.js    window.LIFT = { sets, langSet, side, focus }  (read by template.html)
  app_store/screenshot-tool/lift-debug.jpg   every capture with its numbered card candidates

lift.json (see lift.example.json):
  sets        {"en": "", "ar": "ar-SA"}   capture prefix -> raw folder ('' = fallback for every locale)
  langSet     {"ar": "ar", "fa": "en"}    template ?lang -> set (default: first set)
  files       {"en_welcome": "en_6"}      capture file overrides (no .png)
  devGear     true                        paint out the Expo dev-client tools button (top right)
  statusBar   {"donor": "en_today", "screens": ["today"]}  paste a correct status bar strip
  lift        {"today": [0, 1], "fixes": {"en": [2, 3], "ar": [1, 2]}, "exam": [[72, 470, 1062, 239]]}
              per screen: candidate numbers from lift-debug.jpg (same for all sets, or per set),
              or explicit [x, y, w, h] boxes in capture pixels.
Screen order comes from captions.json (the template alternates the tilt by position).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

arg = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
ROOT = os.path.abspath(arg('root', '.'))
TOOL = os.path.join(ROOT, 'app_store/screenshot-tool')
cfg = json.load(open(os.path.join(TOOL, 'lift.json')))
kit = json.load(open(os.path.join(ROOT, 'app_store/store-kit.json'))) if os.path.exists(os.path.join(ROOT, 'app_store/store-kit.json')) else {}
RAW = os.path.join(ROOT, kit.get('rawDir', 'app_store/raw'))
SRC = arg('src', cfg.get('src', '/tmp/raw'))
SCREENS = [s['screen'] for s in json.load(open(os.path.join(TOOL, 'captions.json')))['screens']]
SETS = cfg['sets']
near = lambda a, b, tol=10: sum(abs(a[k] - b[k]) for k in range(3)) <= tol


def clean(im, screen):
    px = im.load(); W, H = im.size
    if cfg.get('devGear', True):  # Expo dev-client tools button: row colour left of it, then lift its shadow
        x0, y0, y1 = int(W * 0.788), int(H * 0.0515), int(H * 0.1316)
        for y in range(y0, y1):
            c = px[x0 - 5, y]
            for x in range(x0, W): px[x, y] = c
        for y in range(y1 - 10, int(H * 0.168)):
            for x in range(x0 - 10, W):
                a = px[x, y]
                ok = [b for b in (px[W - 1 - x, y], px[x0 - 15, y]) if all(0 <= b[k] - a[k] < 40 for k in range(3))]
                if ok: px[x, y] = min(ok, key=sum)
    sb = cfg.get('statusBar')
    if sb and screen in sb.get('screens', []):
        donor = Image.open(f"{SRC}/{sb['donor']}.png").convert('RGB')
        im.paste(donor.crop((0, 0, W, int(H * 0.057))), (0, 0))
    return im


def candidates(im):
    """Cards on a plain background: row runs that differ from it, in two columns, with their x-extent."""
    W, H = im.size; px = im.load(); bg = px[10, int(H * 0.57)]; found = []
    for x in (int(W * 0.083), int(W * 0.92)):
        start = None
        for y in range(int(H * 0.126), int(H * 0.985)):
            if not near(px[x, y], bg):
                start = y if start is None else start
            elif start is not None:
                if y - start >= 120: found.append((start, y))
                start = None
    boxes = []
    for y0, y1 in sorted(found):
        if any(min(y1, b[1] + b[3]) - max(y0, b[1]) > 0.7 * (y1 - y0) for b in boxes): continue
        mid = (y0 + y1) // 2
        l = next((x for x in range(W // 2) if not near(px[x, mid], bg)), 0)
        r = next((x for x in range(W - 1, W // 2, -1) if not near(px[x, mid], bg)), W - 1) + 1
        boxes.append([l, y0, r - l, y1 - y0])
    return sorted(boxes, key=lambda b: b[1])


focus, tiles = {}, []
font = ImageFont.load_default()
for s, folder in SETS.items():
    out = os.path.join(RAW, folder); os.makedirs(out, exist_ok=True); focus[s] = {}
    for sc in SCREENS:
        name = cfg.get('files', {}).get(f'{s}_{sc}', f'{s}_{sc}')
        path = f'{SRC}/{name}.png'
        if not os.path.exists(path): print('missing capture', path); continue
        im = clean(Image.open(path).convert('RGB'), sc)
        im.save(os.path.join(out, f'{sc}.png'))
        cand = candidates(im)
        pick = cfg.get('lift', {}).get(sc, [])
        if isinstance(pick, dict): pick = pick.get(s, [])
        focus[s][sc] = [p if isinstance(p, list) else cand[p] for p in pick if isinstance(p, list) or p < len(cand)]
        dbg = im.copy(); d = ImageDraw.Draw(dbg)
        for i, (x, y, w, h) in enumerate(cand):
            chosen = [x, y, w, h] in focus[s][sc]
            d.rectangle((x, y, x + w, y + h), outline=(220, 30, 30) if chosen else (40, 90, 255), width=8)
            d.rectangle((x, y, x + 90, y + 70), fill=(220, 30, 30) if chosen else (40, 90, 255))
            d.text((x + 22, y + 8), str(i), fill='white', font=font.font_variant(size=56) if hasattr(font, 'font_variant') else font)
        tiles.append((f'{s}_{sc}', dbg.resize((241, 524))))

side = {sc: 0 if not any(focus[s].get(sc) for s in focus) else (1 if i % 2 == 0 else -1) for i, sc in enumerate(SCREENS)}
lift = {'sets': SETS, 'langSet': cfg.get('langSet', {}), 'side': side, 'focus': focus}
with open(os.path.join(TOOL, 'lift.js'), 'w') as fh:
    fh.write('// written by prep-raw.py (lifted-cards style) — do not edit; change lift.json and rerun\n')
    fh.write(f'window.LIFT = {json.dumps(lift)};\n')
cols = len(SCREENS)
sheet = Image.new('RGB', (cols * 245, ((len(tiles) + cols - 1) // cols) * 540), (140, 140, 140))
for i, (label, t) in enumerate(tiles):
    sheet.paste(t, ((i % cols) * 245, (i // cols) * 540)); ImageDraw.Draw(sheet).text(((i % cols) * 245 + 4, (i // cols) * 540 + 526), label, fill='white')
sheet.save(os.path.join(TOOL, 'lift-debug.jpg'), quality=80)
print(json.dumps(focus))
