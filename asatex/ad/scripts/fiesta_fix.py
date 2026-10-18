"""EP3 Halloween 主場景：orig.webp → escena.png（2 倍）＋ escena_dark.png（關燈版：全黑，只剩閨蜜的螢光網襪發藍光）。
網襪＝閨蜜身上（Vision 去背遮罩，右半、腰以下）比周圍亮、偏白的細線；地毯的白花紋不在人身上所以不會被抓到。
需要先跑去背：cutout public/fiesta/escena.png /tmp/x.png public/fiesta/mask.png（scratchpad 的 swift 小工具）。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter

D = Path(__file__).resolve().parent.parent / "public" / "fiesta"
if sys.argv[1:] == ["base"]:
    im = Image.open(D / "orig.webp").convert("RGB")
    im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2)).save(D / "escena.png")
    print("ok base")
    sys.exit()

im = np.asarray(Image.open(D / "escena.png").convert("RGB")).astype(float)
H, W, _ = im.shape
person = np.asarray(Image.open(D / "mask.png").convert("L").resize((W, H))).astype(float) / 255
yy, xx = np.mgrid[0:H, 0:W]
region = person * (xx > 620) * (yy > 1330)  # 閨蜜（右邊）腰以下（原圖 x>310、y>665）
lum = im @ [0.299, 0.587, 0.114]
sat = im.max(2) - im.min(2)
mesh = np.clip((lum - gaussian_filter(lum, 5) - 6) / 30, 0, 1) * np.clip((90 - sat) / 50, 0, 1) * region
mesh = np.clip(gaussian_filter(mesh, 0.8) * 1.6, 0, 1)

GLOW = np.array([90, 225, 255])  # 螢光藍
dark = im * 0.10 + np.array([2, 3, 10])  # 關燈：只留一點點藍黑環境光
glow = mesh[..., None] * GLOW + gaussian_filter(mesh, 6)[..., None] * GLOW * 0.9 + gaussian_filter(mesh, 22)[..., None] * GLOW * 0.5
out = 255 - (255 - dark) * (255 - np.clip(glow, 0, 255)) / 255  # screen 疊加
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(D / "escena_dark.png")
print("ok dark", round(mesh.sum() / 1000), "k px")
