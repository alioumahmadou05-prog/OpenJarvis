# Part map for the user's monkey image (crop coordinates: full image offset 340,340)
from PIL import Image, ImageDraw
import numpy as np, sys
OX, OY = 340, 340
PARTS = {  # polygons in crop coords, assigned in this priority order
  "head":  [(0,0),(585,0),(585,362),(0,362)],
  "tail":  [(459,395),(585,395),(585,660),(422,660),(422,604),(446,588),(459,560)],
  "armL":  [(55,450),(152,450),(150,520),(156,586),(140,614),(55,614)],
  "armR":  [(388,450),(459,450),(459,560),(446,588),(422,604),(392,614),(398,520)],
  "legL":  [(90,596),(292,596),(292,750),(90,750)],
  "legR":  [(292,596),(440,596),(440,750),(292,750)],
}
def part_masks(shape):
    H, W = shape
    taken = np.zeros((H, W), bool); out = {}
    for name, poly in PARTS.items():
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon([(x + OX, y + OY) for x, y in poly], fill=255)
        m = (np.array(m) > 0) & ~taken; taken |= m; out[name] = m
    out["torso"] = ~taken
    return out
if __name__ == "__main__":
    im = np.array(Image.open("monkey-ref.png").convert("RGB"))
    pm = part_masks(im.shape[:2])
    col = {"head": (255,80,80), "tail": (80,255,80), "armL": (80,80,255), "armR": (255,255,80), "legL": (255,80,255), "legR": (80,255,255), "torso": (255,160,40)}
    ov = im.astype(float).copy()
    for k, m in pm.items(): ov[m] = ov[m] * .55 + np.array(col[k]) * .45
    Image.fromarray(ov.astype(np.uint8)).crop((340, 340, 925, 1090)).save("partmap.png")
