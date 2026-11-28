# Trace the user's monkey into layered vector paths: body parts + separate sunglasses.
import subprocess, re, json
import numpy as np
from PIL import Image
from collections import deque
from parts import part_masks, OX, OY

src = np.array(Image.open("monkey-ref.png").convert("RGB")).astype(float)
H, W = src.shape[:2]

def flood_bg(img):
    dark = img.sum(2) < 70; bg = np.zeros((H, W), bool); q = deque()
    for x in range(W): q.extend(((0, x), (H - 1, x)))
    for y in range(H): q.extend(((y, 0), (y, W - 1)))
    while q:
        y, x = q.popleft()
        if 0 <= y < H and 0 <= x < W and dark[y, x] and not bg[y, x]:
            bg[y, x] = True; q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    return bg
char = ~flood_bg(src)

PAL = {"ink": (12, 9, 7), "white": (248, 248, 248), "peach": (248, 182, 130), "peachD": (222, 140, 92), "brown": (142, 64, 16), "brownD": (108, 44, 10)}
names = list(PAL); P = np.array([PAL[n] for n in names], float)
def classes(img):
    lab = ((img[:, :, None, :] - P[None, None]) ** 2).sum(3).argmin(2)
    return {n: (lab == i) & char for i, n in enumerate(names)}

# --- sunglasses mask (crop coords -> full)
yy, xx = np.mgrid[0:H, 0:W]
def circ(cx, cy, r): return (xx - (cx + OX)) ** 2 + (yy - (cy + OY)) ** 2 <= r * r
region = circ(201, 227, 57) | circ(343, 227, 57) | ((xx >= 104 + OX) & (xx <= 446 + OX) & (yy >= 207 + OY) & (yy <= 241 + OY))
c0 = classes(src)
gl = region & (c0["ink"] | c0["white"] | (src.sum(2) < 330))   # lens, frame, glints (+ antialias)
def dilate(m, r):
    o = m.copy()
    for _ in range(r):
        n = o.copy(); n[1:] |= o[:-1]; n[:-1] |= o[1:]; n[:, 1:] |= o[:, :-1]; n[:, :-1] |= o[:, 1:]; o = n
    return o
gl = dilate(gl, 2) & region

# --- inpaint the face under the sunglasses (diffuse surrounding colours inward)
img = src.copy(); unknown = gl.copy()
for _ in range(200):
    if not unknown.any(): break
    known = ~unknown; acc = np.zeros_like(img); cnt = np.zeros((H, W))
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        sh_k = np.roll(np.roll(known, dy, 0), dx, 1); sh_i = np.roll(np.roll(img, dy, 0), dx, 1)
        acc += sh_i * sh_k[..., None]; cnt += sh_k
    fill = unknown & (cnt > 0)
    img[fill] = acc[fill] / cnt[fill][:, None]; unknown &= ~fill
cls = classes(img)
cls_src = c0

def trace(mask):
    if mask.sum() < 30: return None
    with open("t.pbm", "wb") as f:
        f.write(b"P4\n%d %d\n" % (W, H)); f.write(np.packbits(mask, axis=1).tobytes())
    subprocess.run(["potrace", "t.pbm", "-b", "svg", "-o", "t.svg", "--flat", "-t", "8", "-a", "1.0", "-O", "0.4", "-u", "1"], check=True)
    svg = open("t.svg").read()
    return re.search(r'<g transform="([^"]+)"', svg).group(1), " ".join(re.findall(r' d="([^"]+)"', svg))

def layers_for(m, c):
    colored = c["brown"] | c["brownD"] | c["peach"] | c["peachD"]
    spec = [("w", char, "#fbfbfb"), ("k", char & ~c["white"], "#0b0806"), ("b", colored, "var(--fur)"),
            ("bd", c["brownD"], "var(--fur-d)"), ("p", c["peach"] | c["peachD"], "var(--face)"), ("pd", c["peachD"], "var(--face-d)")]
    out = []
    for k, lm, fill in spec:
        r = trace(lm & m)
        if r: out.append({"k": k, "fill": fill, "tr": r[0], "d": r[1]})
    return out

raw = part_masks((H, W)); out = {"parts": {}, "bbox": {}}
for part, m in raw.items():
    md = dilate(m, 3) & char
    if part == "torso": md &= ~(raw["armL"] | raw["armR"])   # arms are redrawn as vector limbs
    out["parts"][part] = layers_for(md, cls if part == "head" else cls_src)
    ys, xs = np.where(md); out["bbox"][part] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
# sunglasses: ink frame + white glints from the original pixels
g = []
for k, lm, fill in [("k", gl & ~cls_src["white"], "#0b0806"), ("w", gl & cls_src["white"], "#fbfbfb")]:
    r = trace(lm)
    if r: g.append({"k": k, "fill": fill, "tr": r[0], "d": r[1]})
out["glasses"] = g
ys, xs = np.where(gl); out["bbox"]["glasses"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
json.dump(out, open("monkey-trace2.json", "w"))
print(out["bbox"]); print({k: sum(len(l["d"]) for l in v) for k, v in out["parts"].items()}, sum(len(l["d"]) for l in g))
