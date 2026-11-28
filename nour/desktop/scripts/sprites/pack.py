"""Pack rendered frames into WebP sprite sheets + atlas.json (one sheet per sequence)."""
import json, os, sys, math
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
meta = json.load(open(os.path.join(src, "meta.json")))
FW, FH = meta["frame"]["w"], meta["frame"]["h"]
# crop every frame to the union of visible pixels (keeps all frames aligned, drops empty margins)
x0, y0, x1, y1 = FW, FH, 0, 0
for name, s in meta["sequences"].items():
    for i in range(s["frames"]):
        bb = Image.open(os.path.join(src, name, f"{i:03d}.png")).getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if bb: x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
x0, y0 = max(0, x0 - 2), max(0, y0 - 2); x1, y1 = min(FW, x1 + 2), min(FH, y1 + 2)
fw, fh = x1 - x0, y1 - y0
atlas = {"version": 1, "frame": {"w": fw, "h": fh}, "sequences": {}, "mouth": None}
total = 0
for name, s in meta["sequences"].items():
    n = s["frames"]; cols = min(8, n); rows = math.ceil(n / cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i in range(n):
        im = Image.open(os.path.join(src, name, f"{i:03d}.png")).convert("RGBA").crop((x0, y0, x1, y1))
        sheet.paste(im, ((i % cols) * fw, (i // cols) * fh))
    out = os.path.join(dst, f"{name}.webp")
    sheet.save(out, "WEBP", quality=86, method=6, alpha_quality=92)
    total += os.path.getsize(out)
    entry = {k: v for k, v in s.items() if k not in ("mouth", "mouthAnchors")} | {"sheet": f"{name}.webp", "cols": cols}
    if s.get("mouthAnchors"): entry["mouthAnchors"] = [[round(a[0] - x0, 1), round(a[1] - y0, 1), a[2]] for a in s["mouthAnchors"]]
    atlas["sequences"][name] = entry
m = meta["mouth"]; mw, mh = m["w"], m["h"]
ms = Image.new("RGBA", (mw * len(m["order"]), mh), (0, 0, 0, 0))
for i, k in enumerate(m["order"]):
    im = Image.open(os.path.join(src, "_mouth", f"{k}.png")).convert("RGBA").resize((mw, mh), Image.LANCZOS)
    ms.paste(im, (i * mw, 0))
ms.save(os.path.join(dst, "mouth.webp"), "WEBP", quality=95, method=6, alpha_quality=100)
atlas["mouth"] = {"sheet": "mouth.webp", "w": mw, "h": mh, "cx": m["cx"], "cy": m["cy"], "visemes": m["order"]}
json.dump(atlas, open(os.path.join(dst, "atlas.json"), "w"))
print(f"\npacked {len(atlas['sequences'])} sheets, {total/1024:.0f} KB")
