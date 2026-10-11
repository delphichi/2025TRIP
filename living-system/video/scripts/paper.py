#!/usr/bin/env python3
"""紙纖維浮雕貼圖：雜訊 → 沿纖維方向拉長 → 以左上方光源打出浮雕。
整片只算一次，在畫面最上層以 multiply 疊加。  →  public/fiber.png"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(11)
W, H = 1080, 1920
base = np.zeros((H, W))
for scale, amp in ((1, .5), (3, .3), (9, .2)):
    n = rng.normal(0, 1, (H // scale + 1, W // scale + 1))
    im = Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype("uint8")).resize((W, H), Image.BICUBIC)
    base += np.asarray(im, float) / 255 * amp
# 纖維：少量細長亮線，方向接近水平
fib = Image.new("L", (W, H), 0)
px = fib.load()
for _ in range(2600):
    x, y = rng.integers(0, W), rng.integers(0, H)
    ang = rng.normal(0, .5)
    L = rng.integers(10, 40)
    for t in range(L):
        xx, yy = int(x + t * np.cos(ang)), int(y + t * np.sin(ang))
        if 0 <= xx < W and 0 <= yy < H:
            px[xx, yy] = 255
fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(.7)), float) / 255
h = base + fib * .35
gy, gx = np.gradient(h)
light = -(gx * -0.7 + gy * -0.7) * 6  # 光從左上
img = np.clip(232 + light * 60 + (h - h.mean()) * 30, 150, 255).astype("uint8")
out = Path(__file__).resolve().parents[1] / "public" / "fiber.png"
Image.fromarray(img, "L").save(out, optimize=True)
print(out, img.min(), img.mean().round(1), img.max())
