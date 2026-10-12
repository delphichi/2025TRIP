"""把傳單照片裡的黑色網襪重新上色成紅色、膚色（第 7 格三色用）。免費版：純影像處理。
網襪區＝暗網線與膚色交錯的區域；大面積純黑（鞋子、裙子）先排除。輸出 public/ck/legs_rojo.jpg、legs_piel.jpg。
限制：陰影側的腿邊緣會留一點黑；要完美請改用 FAL nano-banana 圖片編輯（約 $0.08／張）。
"""
from PIL import Image
import numpy as np
from scipy.ndimage import uniform_filter, binary_dilation, binary_opening, gaussian_filter

src = Image.open("public/ck/legs.jpg").convert("RGB")
im = np.asarray(src).astype(float)
lum = im @ [0.299, 0.587, 0.114]
m = uniform_filter(lum, 7)
v = np.sqrt(np.maximum(uniform_filter(lum**2, 7) - m**2, 0))
bright_frac = uniform_filter((lum > 90).astype(float), 13)
dark_frac = uniform_filter((lum < 60).astype(float), 13)
zone = (bright_frac > 0.18) & (dark_frac > 0.18) & (v > 20)
zone = gaussian_filter(binary_opening(zone, iterations=2).astype(float), 3) > 0.5
zone &= ~binary_dilation(uniform_filter(lum, 21) < 50, iterations=16)
w = gaussian_filter(np.clip((110 - lum) / 90, 0, 1) * zone, 0.6)


def recolor(target, base, gain, name):
    shade = (base + lum / 120 * gain)[..., None] * np.array(target, float)
    out = im * (1 - w[..., None]) + np.clip(shade, 0, 255) * w[..., None]
    Image.fromarray(out.astype(np.uint8)).save(name, quality=92)


recolor((200, 22, 30), 0.45, 1.0, "public/ck/legs_rojo.jpg")
recolor((196, 150, 112), 0.62, 0.9, "public/ck/legs_piel.jpg")
print("ok")
