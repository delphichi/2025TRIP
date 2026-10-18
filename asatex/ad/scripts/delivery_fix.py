"""《Delivery》第二集主場景圖：orig.webp → escena.png（2 倍，給 Remotion 用）＋ fixed.png（原尺寸預覽）。
在紙箱朝鏡頭那一面（手的上方）貼一張白底圓角 Asatex 貼紙：logo 用 showroom/logo.png，
再乘上箱面原本的明暗、微微模糊，讓它像本來就貼在箱子上。
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

PUB = Path(__file__).resolve().parent.parent / "public"
D = PUB / "delivery"
# 先放大 2 倍再貼，logo 細節才不會糊掉
im = Image.open(D / "orig.webp").convert("RGB")
im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
base = np.asarray(im).astype(float)

# 貼紙位置（2 倍圖座標）：箱子正面原圖 x 120–222、手從 y≈703 開始遮
X0, Y0, W, H = 282, 1314, 140, 94
K = 8  # 先放大 8 倍畫，縮回來邊緣才平滑
st = Image.new("RGBA", (W * K, H * K), (0, 0, 0, 0))
d = ImageDraw.Draw(st)
d.rounded_rectangle([0, 0, W * K - 1, H * K - 1], radius=10 * K, fill=(250, 248, 242, 255))
logo = Image.open(PUB / "showroom" / "logo.png").convert("RGBA")
lh = int((H - 8) * K)
logo = logo.resize((int(logo.width * lh / logo.height), lh), Image.LANCZOS)
st.alpha_composite(logo, ((W * K - logo.width) // 2, (H * K - lh) // 2))
st = st.resize((W, H), Image.LANCZOS).rotate(-1.5, resample=Image.BICUBIC, expand=False)

# 箱面明暗：用貼紙範圍原本的亮度（大範圍模糊）當光照，貼紙乘上去
s = np.asarray(st).astype(float)
rgb, a = s[..., :3], s[..., 3:] / 255
patch = base[Y0:Y0 + H, X0:X0 + W]
lum = gaussian_filter(patch @ [0.299, 0.587, 0.114], 12)
shade = (lum / lum.max())[..., None] * 0.25 + 0.75  # 只帶一點箱面明暗，logo 才清楚
warm = np.array([1.0, 0.97, 0.92])  # 傍晚暖光
rgb = rgb * shade * warm
out = base.copy()
out[Y0:Y0 + H, X0:X0 + W] = patch * (1 - a) + rgb * a
res = Image.fromarray(out.clip(0, 255).astype(np.uint8))
# 只在貼紙附近輕微模糊，跟原圖的柔焦一致
blur = res.filter(ImageFilter.GaussianBlur(0.7))
m = Image.new("L", res.size, 0)
ImageDraw.Draw(m).rounded_rectangle([X0 - 3, Y0 - 3, X0 + W + 3, Y0 + H + 3], radius=14, fill=255)
res = Image.composite(blur, res, m.filter(ImageFilter.GaussianBlur(2)))
res.save(D / "escena.png")
res.resize((res.width // 2, res.height // 2), Image.LANCZOS).save(D / "fixed.png")
print("ok", D / "escena.png")
