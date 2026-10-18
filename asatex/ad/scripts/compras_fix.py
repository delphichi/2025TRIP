"""購物袋短劇主場景圖修正：orig.webp → fixed.png（原尺寸）＋ escena.png（2 倍，給 Remotion 用）。
1. 兩個購物袋「POR SU COMPRAS」→「POR SUS COMPRAS」：從同一個袋子複製 S 字貼在 SU 後面，字型和印刷質感一致。
2. 左上直立招牌上像 Target 商標的紅圈：用周圍顏色補掉。
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import binary_dilation, gaussian_filter, label

D = Path(__file__).resolve().parent.parent / "public" / "compras"
orig = np.asarray(Image.open(D / "orig.webp").convert("RGB")).astype(float)
im = orig.copy()
lum = orig @ [0.299, 0.587, 0.114]


def border(a):
    return np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])


def paste_s(src, dx, dy, gain=1.0):
    """把 src 方框裡的 S 字（只取最大一塊，去掉旁邊字母殘筆）只加深地貼到 (dx, dy) 位移處。"""
    x0, y0, x1, y1 = src
    g, gl = orig[y0:y1, x0:x1], lum[y0:y1, x0:x1]
    bg, tx = np.median(border(gl)), np.percentile(gl, 5)
    a = np.clip((bg - gl) / (bg - tx), 0, 1)
    lab, n = label(a > 0.35)
    big = np.argmax([(lab == i).sum() for i in range(1, n + 1)]) + 1
    a = (np.clip(a * gain, 0, 1) * binary_dilation(lab == big, iterations=2))[..., None]
    ink = g[gl <= np.percentile(gl, 8)].mean(0)
    tbg = np.median(border(lum[y0 + dy:y1 + dy, x0 + dx:x1 + dx]))
    ink = ink * min(1, tbg / bg)  # 目標處在陰影裡，墨色跟著暗
    t = im[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
    im[y0 + dy:y1 + dy, x0 + dx:x1 + dx] = np.minimum(t, t * (1 - a) + ink * a)


def patch_circle(cx, cy, r):
    """圓形範圍用周圍顏色多尺度補色，邊緣柔接。"""
    global im
    H, W, _ = im.shape
    yy, xx = np.mgrid[0:H, 0:W]
    hole = (xx - cx) ** 2 + (yy - cy) ** 2 < r ** 2
    known = (~hole).astype(float)
    fill = im.copy()  # 洞外保持原圖，柔邊混合時才不會混進黑色
    done = np.zeros((H, W), bool)
    for sig in [3, 6, 12, 24]:
        k = gaussian_filter(known, sig)
        v = np.dstack([gaussian_filter(im[..., c] * known, sig) for c in range(3)])
        ok = (k > 1e-3) & ~done & hole
        fill[ok] = v[ok] / k[ok][:, None]
        done |= ok
    soft = gaussian_filter(hole.astype(float), 3)[..., None]
    im = im * (1 - soft) + fill * soft


paste_s((127, 929, 147, 967), 33, 0)            # 左袋
paste_s((301, 907, 321, 951), 32, -4, gain=1.6)  # 右袋：這行是斜的，往右上，陰影裡加深
patch_circle(125, 236, 22)                       # 紅圈商標
out = Image.fromarray(im.clip(0, 255).astype(np.uint8))
out.save(D / "fixed.png")
w, h = out.size
out.resize((w * 2, h * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2)).save(D / "escena.png")
print("ok", D / "escena.png")
