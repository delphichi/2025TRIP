#!/usr/bin/env python3
"""ASATEX PANTY DE RED — 10 秒動態分鏡腳本產生器。

讀 素材/ 裡的切圖，產出單一自含 HTML（圖片以 data URI 內嵌），
每格分鏡都是 1080×1920 座標系畫的真實構圖，縮放顯示 —— 這份分鏡同時就是設計規格。

    python3 asatex/build_storyboard.py   →  asatex/分鏡腳本.html
"""
import base64, io, math
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSET = HERE / "素材"
OUT = HERE / "分鏡腳本.html"

# ── 色票（從產品頁取樣） ──────────────────────────────────────
RED = "#9c0c0c"      # ASATEX 紅：LOGO 字、型號牌
RED_HI = "#d81f26"   # 產品紅：暗底上的紅網（#9c0c0c 在墨黑上對比不足）
INK = "#141414"      # 墨黑
CREAM = "#f4eee2"    # 米白底
GOLD = "#e4d2a8"     # 香檳金：膠囊字、徽章
GOLD_D = "#8a6a48"   # 古金：米白底上的副標（4.29:1）
SKIN = "#c39470"     # 膚色 PIEL
NOTE = "#1f7ae0"     # 分鏡註記（不是畫面內容）
FONT = "Montserrat, 'Liberation Sans', Arial, sans-serif"

FPS, BPM = 30, 120
BEAT = FPS * 60 // BPM  # 15 格


def uri(path, fmt="PNG", quality=86, max_w=None):
    im = Image.open(path).convert("RGB")
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, fmt, **({"quality": quality} if fmt == "JPEG" else {}))
    mime = "jpeg" if fmt == "JPEG" else "png"
    return f"data:image/{mime};base64," + base64.b64encode(buf.getvalue()).decode()


HERO = uri(ASSET / "02b-主視覺-腿部-去字.png", "JPEG")
LOGO = uri(ASSET / "01-logo-吉祥物.png")
_lg = Image.open(ASSET / "01-logo-吉祥物.png").convert("RGB")
LOGO_BG = "#%02x%02x%02x" % _lg.getpixel((4, _lg.height // 2))
ORIG = uri(ASSET / "00-原始產品頁.png", "JPEG", 82, 540)


def tc(f):
    return f"{f / FPS:.2f}s"


# ── SVG 小零件 ────────────────────────────────────────────────
def glint(x, y, s, color="#fff", glow=GOLD, streak=0, uid="g"):
    """4 芒星 + 水平變形光暈：全片唯一的「發光」語彙。"""
    k = s * 0.11
    star = (f"M0,{-s} Q{k},{-k} {s},0 Q{k},{k} 0,{s} Q{-k},{k} {-s},0 Q{-k},{-k} 0,{-s}Z")
    small = s * 0.45
    k2 = small * 0.12
    star2 = (f"M0,{-small} Q{k2},{-k2} {small},0 Q{k2},{k2} 0,{small} Q{-k2},{k2} {-small},0 Q{-k2},{-k2} 0,{-small}Z")
    out = [f'<g transform="translate({x},{y})">',
           f'<circle r="{s * .55}" fill="url(#glow-{uid})"/>']
    if streak:
        out.append(f'<ellipse rx="{streak}" ry="{max(3, s * .045)}" fill="url(#streak-{uid})"/>')
    out += [f'<path d="{star2}" fill="{color}" opacity=".75" transform="rotate(45)"/>',
            f'<path d="{star}" fill="{color}"/>', "</g>"]
    return "".join(out)


def defs(uid, glow=GOLD):
    return (f'<defs><radialGradient id="glow-{uid}"><stop offset="0" stop-color="{glow}" stop-opacity=".9"/>'
            f'<stop offset=".35" stop-color="{glow}" stop-opacity=".25"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>'
            f'<linearGradient id="streak-{uid}"><stop offset="0" stop-color="{glow}" stop-opacity="0"/>'
            f'<stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></linearGradient>'
            f'<marker id="arr-{uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10z" fill="{NOTE}"/></marker></defs>')


def mesh(color, d, w, clip=None, hi=None, x0=0, y0=0, W=1080, H=1920, sets="AB"):
    """菱形網眼：兩組 ±45° 平行線。d = 垂直間距，w = 線寬。"""
    step = d * math.sqrt(2)
    lines = []
    for s in sets:
        c = -H
        while c < W + H:
            if s == "A":   # x - y = c
                p = (x0 + c - 200, y0 - 200, x0 + c + H + 200, y0 + H + 200)
            else:          # x + y = c
                p = (x0 + c + 200, y0 - 200, x0 + c - H - 200, y0 + H + 200)
            lines.append(p)
            c += step
    body = "".join(f'<line x1="{a:.0f}" y1="{b:.0f}" x2="{e:.0f}" y2="{f:.0f}"/>' for a, b, e, f in lines)
    g = f'<g stroke="{color}" stroke-width="{w}" stroke-linecap="round"{f" clip-path=url(#{clip})" if clip else ""}>{body}</g>'
    if hi:
        g += (f'<g stroke="{hi}" stroke-width="{max(1, w * .22)}" opacity=".55" transform="translate({-w * .18},{-w * .18})"'
              f'{f" clip-path=url(#{clip})" if clip else ""}>{body}</g>')
    return g


def badge(x, y, n, uid):
    return (f'<g transform="translate({x},{y})"><circle r="42" fill="{NOTE}"/>'
            f'<text y="17" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="50" fill="#fff">{n}</text></g>')


def arrow(d, uid):
    return (f'<path d="{d}" fill="none" stroke="{NOTE}" stroke-width="9" stroke-dasharray="20 14" '
            f'stroke-linecap="round" marker-end="url(#arr-{uid})"/>')


def text(x, y, s, size, weight=800, fill=INK, anchor="start", ls=0, extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}" {extra}>{s}</text>')


def frame(uid, bg, svg, html_under=""):
    return (f'<div class="frame" style="background:{bg}">{html_under}'
            f'<svg viewBox="0 0 1080 1920" width="1080" height="1920">{defs(uid)}{svg}</svg></div>')


# ── 十個關鍵格 ────────────────────────────────────────────────
def k1():
    u = "k1"
    return frame(u, f"radial-gradient(circle at 50% 46%, #1d1b18 0%, {INK} 55%, #050505 100%)",
                 glint(540, 880, 230, streak=520, uid=u)
                 + badge(150, 1700, 1, u))


def k2():
    u = "k2"
    svg = mesh(GOLD, 128, 3, sets="A").replace(f'stroke="{GOLD}"', f'stroke="{GOLD}" opacity=".85"', 1)
    # 第二組線正在由右上往左下畫：越後面的線越短，線頭帶亮點
    step = 128 * math.sqrt(2)
    c, i = 0.0, 0
    heads = []
    segs = []
    while c < 1080 + 1920:
        sx, sy = (c, 0) if c <= 1080 else (1080, c - 1080)
        full = min(sx, 1920 - sy) * math.sqrt(2)
        prog = max(0, min(1, 1.35 - i * 0.075))
        L = full * prog / math.sqrt(2)
        ex, ey = sx - L, sy + L
        if prog > 0:
            segs.append(f'<line x1="{sx:.0f}" y1="{sy:.0f}" x2="{ex:.0f}" y2="{ey:.0f}"/>')
            if prog < 1:
                heads.append(f'<circle cx="{ex:.0f}" cy="{ey:.0f}" r="9" fill="#fff"/>')
        c += step
        i += 1
    svg += f'<g stroke="{GOLD}" stroke-width="3" opacity=".85">{"".join(segs)}</g>' + "".join(heads)
    # 三顆鑽石落在交點上（開場那三道光原來是網上的鑽）
    for (x, y, s) in [(543, 906, 80), (362, 543, 46), (724, 1268, 54)]:
        svg += glint(x, y, s, uid=u)
    svg += f'<rect x="452" y="815" width="181" height="181" transform="rotate(45 543 906)" fill="none" stroke="{NOTE}" stroke-width="7" stroke-dasharray="18 12"/>'
    svg += badge(150, 1700, 2, u) + badge(930, 200, 3, u)
    return frame(u, INK, svg)


def hero(shift_y, uid, extra):
    # 主視覺 600×1256 → 高度填滿再放大 1.08 供上搖；右側米白延伸
    h = 1920 * 1.08
    w = 600 * h / 1256
    img = (f'<div style="position:absolute;inset:0;background:linear-gradient(90deg,#efe7da,#f3ece1 60%,#f6f0e6)"></div>'
           f'<img src="{HERO}" style="position:absolute;left:-70px;top:{shift_y}px;height:{h:.0f}px;width:{w:.0f}px">')
    return frame(uid, CREAM, extra, img)


def vertical_title(red_on=True):
    # 直排大標：由下往上讀，貼右緣
    t = (f'<g transform="translate(877 1540) rotate(-90)">'
         + text(0, 0, "PANTY", 196, 900, INK, ls=-4)
         + text(0, 182, "DE " + (f'<tspan fill="{RED}">RED</tspan>' if red_on else "RED"), 196, 900, INK, ls=-4)
         + "</g>")
    return t


def k3():
    u = "k3"
    svg = (f'<image href="{LOGO}" x="742" y="58" width="300" height="129"/>'
           + vertical_title()
           + arrow("M960,300 L960,560", u) + badge(960, 240, 4, u)
           + arrow("M300,1780 C320,1500 360,1200 420,900", u) + badge(240, 1830, 5, u))
    return hero(-192, u, svg)


def k4():
    u = "k4"
    sparks = [(540, 1490, 30), (512, 1300, 38), (470, 1120, 46), (430, 940, 56), (388, 760, 70)]
    svg = (f'<image href="{LOGO}" x="742" y="58" width="300" height="129"/>' + vertical_title()
           + "".join(glint(x, y, s, streak=s * 2.4, uid=u) for x, y, s in sparks)
           + f'<rect x="0" y="1560" width="1080" height="360" fill="url(#fade-{u})"/>'
           + text(540, 1748, "BRILLA A CADA PASO", 56, 300, GOLD_D, "middle", 11)
           + f'<line x1="250" y1="1790" x2="830" y2="1790" stroke="{GOLD_D}" stroke-width="3"/>'
           + badge(150, 690, 6, u))
    fade = (f'<defs><linearGradient id="fade-{u}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{CREAM}" stop-opacity="0"/><stop offset=".45" stop-color="{CREAM}" stop-opacity=".92"/>'
            f'<stop offset="1" stop-color="{CREAM}"/></linearGradient></defs>')
    return hero(0, u, fade + svg)


def color_card(uid, name, idx, bg, strand, hi, label_fill, base_fill=None):
    svg = ""
    if base_fill:
        svg += f'<rect width="1080" height="1920" fill="{base_fill}"/>'
    svg += f'<g transform="rotate(8 540 960)">{mesh(strand, 170, 30, hi=hi)}</g>'
    svg += glint(540 + 120, 960 - 190, 150, streak=420, uid=uid)
    svg += glint(300, 1420, 60, uid=uid) + glint(860, 470, 44, uid=uid)
    svg += f'<rect y="1380" width="1080" height="540" fill="url(#base-{uid})"/>'
    svg = (f'<defs><linearGradient id="base-{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg}" stop-opacity="0"/>'
           f'<stop offset=".55" stop-color="{bg}" stop-opacity=".92"/><stop offset="1" stop-color="{bg}"/></linearGradient></defs>') + svg
    svg += text(70, 1780, name, 300, 900, label_fill, ls=-8)
    svg += text(80, 150, f"{idx:02d} / 03", 46, 700, label_fill, ls=6)
    return frame(uid, bg, svg)


def k5():
    return color_card("k5", "ROJO", 2, INK, RED_HI, "#ff8a8f", CREAM)


def k6():
    u = "k6"
    panels = [("NEGRO", None, "#161616", "#5a5a5a", INK, "skin"),
              ("ROJO", INK, RED_HI, "#ff8a8f", CREAM, None),
              ("PIEL", INK, SKIN, "#f0d2b8", CREAM, None)]
    svg = (f'<defs><linearGradient id="skin-{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ab88"/>'
           f'<stop offset="1" stop-color="#a87650"/></linearGradient>'
           + "".join(f'<clipPath id="p{i}-{u}"><rect x="{i * 360}" y="0" width="360" height="1920"/></clipPath>' for i in range(3))
           + "</defs>")
    for i, (name, bg, strand, hi, lab, base) in enumerate(panels):
        fill = f"url(#skin-{u})" if base else bg
        svg += f'<rect x="{i * 360}" y="0" width="360" height="1920" fill="{fill}"/>'
        svg += f'<g clip-path="url(#p{i}-{u})"><g transform="rotate(8 540 960)">{mesh(strand, 120, 20, hi=hi)}</g></g>'
        svg += glint(i * 360 + 180, 960 + (i - 1) * 140, 70, uid=u)
    svg += f'<rect x="0" y="1640" width="1080" height="280" fill="{INK}"/><line x1="0" y1="1640" x2="1080" y2="1640" stroke="{GOLD}" stroke-width="6"/>'
    for i, (name, *_r) in enumerate(panels):
        svg += text(i * 360 + 180, 1810, name, 88, 900, CREAM, "middle")
    svg += "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="1640" stroke="{GOLD}" stroke-width="6"/>' for x in (360, 720))
    svg += arrow("M180,560 L340,560", u) + arrow("M900,560 L740,560", u) + badge(540, 560, 7, u)
    return frame(u, INK, svg)


def k7():
    u = "k7"
    svg = (f'<g opacity=".9">{mesh("#262626", 120, 14)}</g>'
           + f'<rect width="1080" height="1920" fill="url(#vig-{u})"/>'
           + "".join(f'<rect x="{90 + i * 300}" y="520" width="300" height="22" fill="{c}"/>' for i, c in enumerate(["#3a3a3a", RED_HI, SKIN]))
           + f'<g transform="rotate(-3 540 840)"><rect x="110" y="760" width="860" height="160" rx="30" fill="{RED}"/>'
           + text(540, 870, "MODELO #CK2603L", 84, 800, CREAM, "middle") + "</g>"
           + text(540, 1090, f'<tspan fill="{GOLD}">98%</tspan> NYLON · <tspan fill="{GOLD}">2%</tspan> SPANDEX', 54, 700, CREAM, "middle", 2)
           + f'<rect x="90" y="1230" width="900" height="130" rx="65" fill="#0b0b0b" stroke="{GOLD}" stroke-width="5"/>'
           + text(540, 1311, "CON BRILLOS DE DIAMANTE", 44, 800, GOLD, "middle", 1)
           + glint(150, 1295, 34, uid=u) + glint(930, 1295, 34, uid=u) + glint(975, 1240, 70, streak=180, uid=u)
           + badge(1000, 720, 8, u) + badge(540, 1170, 9, u) + badge(1000, 1410, 10, u))
    svg = (f'<defs><radialGradient id="vig-{u}"><stop offset=".3" stop-color="{INK}" stop-opacity=".2"/>'
           f'<stop offset="1" stop-color="{INK}" stop-opacity=".95"/></radialGradient></defs>') + svg
    return frame(u, INK, svg)


def k8():
    u = "k8"
    cx, cy, R = 540, 820, 330
    cols = [INK] * 6 + [RED] * 3 + [SKIN] * 3
    svg = f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#d9cfbd" stroke-width="4" stroke-dasharray="4 16"/>'
    for i, c in enumerate(cols):
        a = -math.pi / 2 + i * 2 * math.pi / 12
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        if i == 11:   # 第 12 顆正在落下
            svg += f'<circle cx="{x:.0f}" cy="{y - 150:.0f}" r="50" fill="{c}" opacity=".18"/>'
            svg += f'<circle cx="{x:.0f}" cy="{y - 80:.0f}" r="50" fill="{c}" opacity=".35"/>'
            svg += f'<circle cx="{x:.0f}" cy="{y - 18:.0f}" r="52" fill="{c}"/>'
        else:
            svg += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="52" fill="{c}"/>'
    svg += text(cx, cy + 70, "12", 240, 900, INK, "middle", -6)
    svg += text(cx, cy + 150, "= 1 DOCENA", 52, 700, GOLD_D, "middle", 6)
    rows = [("NEGRO", "6", INK), ("ROJO", "3", RED), ("PIEL", "3", SKIN)]
    for j, (n, q, c) in enumerate(rows):
        y = 1400 + j * 120
        svg += f'<circle cx="300" cy="{y - 18}" r="30" fill="{c}"/>'
        svg += text(360, y, n, 56, 700, INK, ls=4) + text(800, y, f"× {q}", 56, 800, INK, "end")
    svg += badge(880, 380, 11, u)
    return frame(u, CREAM, svg)


def k9():
    u = "k9"
    svg = (f'<circle cx="540" cy="900" r="560" fill="none" stroke="{GOLD}" stroke-width="3" opacity=".25"/>'
           f'<circle cx="540" cy="900" r="480" fill="none" stroke="{GOLD}" stroke-width="6" opacity=".45"/>'
           f'<circle cx="540" cy="900" r="390" fill="#0c0c0c" stroke="{GOLD}" stroke-width="12"/>'
           f'<circle cx="540" cy="900" r="360" fill="none" stroke="{GOLD}" stroke-width="3" opacity=".6"/>'
           + text(540, 930, "100", 300, 900, GOLD, "middle", -10)
           + text(540, 1060, "DOCENAS", 100, 900, GOLD, "middle")
           + text(540, 1135, "POR CAJA", 50, 700, CREAM, "middle", 6)
           + glint(830, 640, 90, streak=260, uid=u)
           + text(540, 1560, "6 + 3 + 3 = 1 DOCENA", 50, 700, "#bdb3a2", "middle", 4)
           + badge(160, 380, 12, u))
    return frame(u, f"radial-gradient(circle at 50% 47%, #24211c, {INK} 60%)", svg)


def k10():
    u = "k10"
    svg = (f'<rect x="-400" y="0" width="260" height="1920" transform="rotate(20 540 960) translate(980 0)" fill="url(#sweep-{u})"/>'
           f'<image href="{LOGO}" x="150" y="700" width="780" height="336"/>'
           + glint(842, 885, 80, streak=220, uid=u)
           + text(540, 1210, "PANTY DE RED", 64, 900, INK, "middle", 2)
           + text(540, 1280, "MODELO #CK2603L", 42, 700, RED, "middle", 6)
           + badge(160, 560, 13, u))
    svg = (f'<defs><linearGradient id="sweep-{u}"><stop offset="0" stop-color="#fff" stop-opacity="0"/>'
           f'<stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>') + svg
    return frame(u, LOGO_BG, svg)


# ── 分鏡表 ────────────────────────────────────────────────────
SHOTS = [
    dict(n="S1", name="一點光", f=(0, 30), frames=[(k1, 8)], energy="靜",
         visual="全黑。畫面中央一顆 4 芒鑽石光，帶一道水平變形光暈。什麼都還沒出現 —— 觀眾只聽到一聲鞋跟落地。",
         motion=["① f0 鑽石光 0→1.4→1.0（6 格，彈性過衝），同時旋轉 45°；光暈由中心向左右拉開 520px",
                 "f15（第 2 拍）左上、右下再各亮一顆小光 —— 一拍一顆，「每一步都是一拍」從第一秒就建立"],
         trans="不轉場，直接接 S2：三顆光不動，網從它們身上長出來",
         sound="f0 高跟鞋落地（乾、近、帶短殘響）＋高頻「叮」；f15 第二聲鞋跟"),
    dict(n="S2", name="織網", f=(30, 60), frames=[(k2, 48)], energy="蓄",
         visual="香檳金細線以 45° 一條接一條掃過全黑畫面，接著反方向第二組線交織 —— 菱形網眼成形，三顆光原來是網上的鑽。",
         motion=["② f30 第一組斜線由左上掃入，每條線 6 格畫完、彼此錯開 1 格（線性速度 + 末端急停）",
                 "f45 第二組由右上反向掃入，線頭帶白色亮點 —— 這就是「RED」（網）",
                 "③ f52–59 鏡頭急推進中央那格網眼（放大 1→12 倍，expo-in），網眼的洞變成下一鏡的窗口"],
         trans="穿網：從網眼的洞直接進入 S3（形狀匹配轉場），最後 2 格吸入",
         sound="兩段上升 whoosh 疊成 riser，f58 反向鈸吸入，把力氣留給下一拍"),
    dict(n="S3", name="亮相", f=(60, 120), frames=[(k3, 80), (k4, 110)], energy="爆",
         visual="主視覺腿部照片填滿畫面。「PANTY / DE RED」直排巨字貼右緣由下往上讀，RED 用品牌紅。右上角品牌 LOGO。後半段鑽石沿小腿一路往上亮，副標「BRILLA A CADA PASO」浮出。",
         motion=["f60 全片第一個重拍：照片由 1.25 彈到 1.0（spring：damping 14／stiffness 260），2 格 30% 白閃＋8px 鏡頭震動 8 格衰減",
                 "④ 大標逐字砸入，切在八分音符上：PANTY f60 → DE f67 → RED f75，每個字帶 2 格預備壓縮（0.96）再落下，套動態模糊",
                 "⑤ 全程緩慢上搖（Tilt Up）：鞋跟 → 膝蓋，位移 192px，3% 推近 —— 視線跟著腿往上走",
                 "⑥ f90 起鑽石由腳踝往膝蓋依序閃，每 3 格一顆 —— 光在腿上「走路」；副標字距由 0.6em 收到 0.2em，下方金線畫出"],
         trans="f119 最後一顆膝蓋上的鑽石放大到填滿畫面 → 白閃，硬切 S4",
         sound="f60 低頻重擊＋鞋跟；f67、f75 兩聲中鼓對應 DE、RED；f90 上行閃爍琶音"),
    dict(n="S4", name="三色", f=(120, 180), frames=[(k5, 135), (k6, 170)], energy="閃",
         visual="三個顏色各占一拍、全螢幕硬切：網眼特寫鋪滿畫面，色名用超大字壓在底部。第四拍三色收成直立三聯屏。",
         motion=["f120 NEGRO：黑網疊在膚色上（就是穿上的樣子）→ f135 ROJO：紅網在墨黑上 → f150 PIEL：膚色網在墨黑上",
                 "每格網眼都朝同一斜向漂移（視差），切換時速度不斷 —— 換的是顏色，不是動作，眼睛不會斷",
                 "每拍一顆大鑽石在交點上閃；色名由下方遮罩升起 8 格",
                 "⑦ f165 三張色卡從左右擠進來排成三聯屏（expo-out 10 格），金色分隔線同時畫下"],
         trans="三聯屏往上壓縮成畫面頂端一條三色細條，留在 S5 當色彩索引",
         sound="每拍一聲軍鼓＋相機快門；f165 三聯屏合起時一聲金屬「鏘」"),
    dict(n="S5", name="規格", f=(180, 225), frames=[(k7, 215)], energy="穩",
         visual="墨黑底、暗網緩慢漂移。品牌紅型號牌、成分比例、鑽石膠囊三段式堆疊 —— 批發買家要抄下來的資訊，全片最好讀的一格。",
         motion=["⑧ f180 型號牌像印章蓋下：1.6→1.0、-4° 斜放、2 格定格＋震動；「#CK2603L」八個字元逐一翻牌落定（每 1.5 格一個）",
                 "⑨ f195 數字跳表：0→98% 與 0→2%（expo-out 12 格），單位字不動、只有數字在跑",
                 "⑩ f210 鑽石膠囊由右滑入，兩端 ✦ 迸出閃光，一道香檳金光從左掃過字面（f212–222）"],
         trans="膠囊的光掃到右端時，整格往左推出，S6 從右推入（8 格，兩格同速 —— 像同一條輸送帶）",
         sound="f180 蓋章悶響；翻牌每字一聲細碎的「答」；f210 閃爍"),
    dict(n="S6", name="一打 × 100", f=(225, 270), frames=[(k8, 247), (k9, 265)], energy="爆",
         visual="12 顆色點像時鐘刻度順時針落位：6 黑、3 紅、3 膚 —— 一打的配色組成一眼看懂。接著整圈收縮爆開成「100 DOCENAS POR CAJA」金色徽章。",
         motion=["⑪ f225–247 十二顆點以十六分音符落下（每 2 格一顆），每顆落點小回彈；中央數字跟著 1→12 跳，最後補上「= 1 DOCENA」",
                 "f240 下方三列圖例依序滑入：NEGRO × 6 ／ ROJO × 3 ／ PIEL × 3",
                 "⑫ f255 全片第三個重拍：十二顆點同時吸進中心 → 金色徽章炸開，「100」以里程表滾動 1→100（10 格），兩圈震波往外擴散淡出"],
         trans="徽章縮小飛向畫面中央上方、化成 LOGO 上方的一點光 → S7",
         sound="十二聲急促的 hi-hat；f255 重擊＋次低頻下潛"),
    dict(n="S7", name="落款", f=(270, 300), frames=[(k10, 290)], energy="收",
         visual="回到米白。ASATEX LOGO 置中，吉祥物輕彈兩下。下方 PANTY DE RED 與型號。一道光斜掃過 LOGO，最後停在 X 上一顆鑽石光 —— 和開場第一格同一顆光。",
         motion=["f270 LOGO 1.08→1.0 落定；吉祥物擠壓伸展彈兩次（全片唯一允許彈跳的元素）",
                 "f272 標語「ELEGANCIA QUE TE ACOMPAÑA」字距收合進場",
                 "⑬ f280–292 斜向光帶掃過 LOGO，在 X 上收成 4 芒鑽石光；最後 8 格靜止"],
         trans="最後一格的鑽石光 = 第一格的鑽石光 → 可無縫循環播放（Reels／限動常被重播）",
         sound="f285 最後一聲鞋跟＋叮，殘響拖到結尾"),
]


def timeline():
    W, H, top = 1000, 190, 34
    px = W / 300
    col = {"靜": "#3a3a3a", "蓄": "#6b5a3c", "爆": RED, "閃": "#b0623a", "穩": "#545454", "收": "#9a8a6a"}
    s = [f'<svg viewBox="0 0 {W} {H}" class="tl" role="img" aria-label="十秒節奏圖：二十拍、七個鏡頭、三個重拍">']
    for b in range(21):
        x = b * BEAT * px
        bar = b % 4 == 0
        s.append(f'<line x1="{x:.1f}" y1="{top - (8 if bar else 0)}" x2="{x:.1f}" y2="{top + 70}" stroke="currentColor" stroke-opacity="{.5 if bar else .18}"/>')
        if bar and b < 20:
            s.append(f'<text x="{x + 3:.1f}" y="{top - 12}" class="tl-t">第 {b // 4 + 1} 小節 · {b // 2}s</text>')
    for sh in SHOTS:
        a, b = sh["f"]
        s.append(f'<rect x="{a * px + 1:.1f}" y="{top + 6}" width="{(b - a) * px - 2:.1f}" height="40" rx="4" fill="{col[sh["energy"]]}"/>')
        s.append(f'<text x="{(a + b) / 2 * px:.1f}" y="{top + 31}" text-anchor="middle" class="tl-s">{sh["n"]} {sh["name"]}</text>')
    hits = [0, 15, 30, 45, 67, 75, 90, 120, 135, 150, 165, 195, 210, 270, 285]
    big = [60, 180, 255]
    for f in hits:
        s.append(f'<path d="M{f * px:.1f},{top + 52} l-5,9 h10z" fill="currentColor" fill-opacity=".55"/>')
    for f in big:
        s.append(f'<path d="M{f * px:.1f},{top + 50} l-9,15 h18z" fill="{RED}"/>')
    for f in range(225, 248, 2):
        s.append(f'<circle cx="{f * px:.1f}" cy="{top + 58}" r="2.2" fill="currentColor" fill-opacity=".55"/>')
    # 張力曲線
    pts = [(0, .12), (30, .2), (55, .55), (60, 1), (100, .78), (120, .85), (135, .7), (150, .8), (165, .75),
           (180, .9), (210, .55), (225, .62), (250, .8), (255, 1), (270, .45), (299, .2)]
    y0, hh = H - 8, 66
    d = " ".join(f"{'M' if i == 0 else 'L'}{f * px:.1f},{y0 - v * hh:.1f}" for i, (f, v) in enumerate(pts))
    s.append(f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="2.5" stroke-linejoin="round"/>')
    s.append(f'<text x="4" y="{y0 - hh - 4}" class="tl-t">張力</text>')
    s.append("</svg>")
    return "".join(s)


def shot_html(sh):
    a, b = sh["f"]
    thumbs = "".join(
        f'<figure><div class="thumb">{fn()}</div><figcaption>f{f} · {tc(f)}</figcaption></figure>'
        for fn, f in sh["frames"])
    li = "".join(f"<li>{m}</li>" for m in sh["motion"])
    return f'''
<article class="shot">
  <header><span class="sn">{sh["n"]}</span><h3>{sh["name"]}</h3>
    <span class="time">{a / FPS:.1f}–{b / FPS:.1f}s · f{a}–{b - 1} · 第 {a // BEAT + 1}–{b // BEAT} 拍 · {(b - a) / FPS:.1f}s</span></header>
  <div class="body">
    <div class="thumbs">{thumbs}</div>
    <dl>
      <dt>畫面</dt><dd>{sh["visual"]}</dd>
      <dt>動態</dt><dd><ul>{li}</ul></dd>
      <dt>轉場</dt><dd>{sh["trans"]}</dd>
      <dt>聲音</dt><dd>{sh["sound"]}</dd>
    </dl>
  </div>
</article>'''


ASSETS = [
    ("01-logo-吉祥物.png", "LOGO＋吉祥物＋標語", "502×216", "warn", "S7 置中只能放大到 ~1.5 倍，再大會糊；有向量檔（AI／SVG／PDF）請給我"),
    ("02b-主視覺-腿部-去字.png", "主視覺腿部（已去掉右側文字）", "600×1256", "warn", "9:16 滿版已是 1.65 倍放大，推鏡上限約 1.1 倍；要特寫建議用 nano-banana-2 重生 4K 版"),
    ("03-標題-PANTY_DE_RED.png", "主標", "435×196", "code", "不用截圖 —— 用字體重排，才能逐字砸入且任何尺寸都銳利"),
    ("04-副標-BRILLA.png", "副標＋金線", "480×68", "code", "同上，字距動畫需要真文字"),
    ("05-型號牌-CK2603L.png", "型號牌", "430×66", "code", "重建成向量，字元才能逐一翻牌"),
    ("06-成分.png", "98% NYLON · 2% SPANDEX", "388×38", "code", "數字要跳表，必須是真文字"),
    ("07-鑽石膠囊.png", "CON BRILLOS DE DIAMANTE", "520×60", "code", "重建，光掃效果用遮罩"),
    ("08-色樣-NEGRO.png", "色樣 黑", "178×230", "code", "太小無法全螢幕。改程式畫網眼：無限解析度、可漂移、可控鑽石位置"),
    ("09-色樣-ROJO.png", "色樣 紅", "178×230", "code", "同上"),
    ("10-色樣-PIEL.png", "色樣 膚", "173×230", "code", "同上"),
    ("11-配色數量.png", "每打配色 6／3／3", "292×174", "code", "改成 S6 的時鐘環 —— 這組數字是全頁最有動畫價值的資料"),
    ("12-徽章-100DOCENAS.png", "100 DOCENAS POR CAJA", "218×218", "code", "重建，里程表滾動"),
    ("13-特點列.png", "四個特點圖示", "1086×192", "cut", "10 秒放不下。「鑽石」已在 S5 交代，其餘三個是通用形容詞，刪掉不損資訊"),
]
STATUS = {"ok": ("直接用", "ok"), "warn": ("可用·有上限", "warn"), "code": ("改為程式重建", "code"), "cut": ("刪除", "cut")}


def asset_rows():
    out = []
    for f, what, size, st, note in ASSETS:
        lab, cls = STATUS[st]
        img = uri(ASSET / f, "JPEG", 80, 220)
        out.append(f'<tr><td><img src="{img}" alt=""></td><td><b>{what}</b><small>{f} · {size}</small></td>'
                   f'<td><span class="st {cls}">{lab}</span></td><td>{note}</td></tr>')
    return "".join(out)


PALETTE = [(RED, "ASATEX 紅", "LOGO、型號牌、RED"), (RED_HI, "產品紅", "暗底上的紅網"), (INK, "墨黑", "主文字、暗場"),
           (CREAM, "米白", "亮場底色"), (GOLD, "香檳金", "鑽石光、徽章、網線"), (GOLD_D, "古金", "米白上的副標 4.3:1"),
           (SKIN, "膚色", "PIEL")]

CSS = f"""
:root{{--ink:{INK};--cream:{CREAM};--red:{RED};--gold:{GOLD};--gold-d:{GOLD_D};--note:{NOTE};--line:#d8cfbf;--mute:#6b6459;--card:#fbf8f2}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--cream);color:var(--ink);font:16px/1.65 "Noto Sans TC","PingFang TC","Microsoft JhengHei",{FONT}}}
main{{max-width:1120px;margin:0 auto;padding:40px 20px 80px}}
h1{{font:900 clamp(34px,6vw,64px)/1 {FONT};letter-spacing:-.02em;margin:0}}
h1 em{{font-style:normal;color:var(--red)}}
h2{{font-size:22px;margin:56px 0 14px;padding-top:14px;border-top:3px solid var(--ink);display:flex;gap:12px;align-items:baseline}}
h2 small{{font:700 13px {FONT};letter-spacing:.14em;color:var(--mute)}}
.kicker{{font:700 13px {FONT};letter-spacing:.2em;color:var(--red);margin-bottom:10px}}
.meta{{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0;list-style:none}}
.meta li{{font:700 13px {FONT};padding:5px 11px;border:1.5px solid var(--ink);border-radius:999px}}
.lead{{font-size:19px;max-width:62ch}}
.insight{{background:var(--ink);color:var(--cream);padding:22px 24px;border-radius:6px;margin:16px 0}}
.insight b{{color:var(--gold)}}
.src{{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start}}
.src img{{width:100%;border-radius:4px;border:1px solid var(--line)}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
td{{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:middle}}
td:first-child{{width:96px}} td img{{width:84px;height:56px;object-fit:cover;border-radius:3px;display:block}}
td small{{display:block;color:var(--mute);font-size:12px}}
.st{{font-size:12px;font-weight:700;padding:3px 8px;border-radius:3px;white-space:nowrap}}
.st.ok{{background:#dfeedd}} .st.warn{{background:#f6e3b5}} .st.code{{background:#e4e8f3}} .st.cut{{background:#eee;text-decoration:line-through;color:#777}}
.pal{{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}}
.pal div{{border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--card);font-size:13px}}
.pal i{{display:block;height:54px}} .pal p{{margin:0;padding:7px 9px}} .pal code{{font-size:12px;color:var(--mute)}}
.type{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:12px}}
.type div{{background:var(--card);border:1px solid var(--line);padding:14px 16px;border-radius:4px}}
.tl{{width:100%;height:auto;color:var(--ink);display:block}}
.tl-t{{font:600 10px {FONT};fill:currentColor;opacity:.6}} .tl-s{{font:800 11px {FONT};fill:#fff}}
.legend{{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--mute);margin-top:6px}}
.shot{{background:var(--card);border:1px solid var(--line);border-radius:6px;margin:18px 0;overflow:hidden}}
.shot>header{{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 14px;padding:14px 18px;border-bottom:1px solid var(--line)}}
.sn{{font:900 15px {FONT};background:var(--ink);color:var(--cream);padding:3px 9px;border-radius:3px}}
.shot h3{{margin:0;font-size:21px}} .time{{font:600 13px {FONT};color:var(--mute);font-variant-numeric:tabular-nums}}
.body{{display:grid;grid-template-columns:auto 1fr;gap:22px;padding:18px}}
.thumbs{{display:flex;gap:12px;align-items:flex-start}}
figure{{margin:0}} figcaption{{font:700 12px {FONT};color:var(--mute);margin-top:6px;text-align:center}}
.thumb{{width:216px;aspect-ratio:9/16;position:relative;overflow:hidden;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.15),0 6px 18px rgba(0,0,0,.12)}}
.frame{{position:absolute;left:0;top:0;width:1080px;height:1920px;transform:scale(.2);transform-origin:0 0;overflow:hidden}}
.frame svg{{position:absolute;inset:0}}
dl{{margin:0;display:grid;grid-template-columns:44px 1fr;gap:8px 12px;font-size:15px}}
dt{{font-weight:700;color:var(--red)}} dd{{margin:0}} dd ul{{margin:0;padding-left:18px}} dd li{{margin-bottom:4px}}
.rules{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}
.rules div{{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--ink);padding:12px 16px;border-radius:4px}}
.rules div.no{{border-left-color:var(--red)}} .rules b{{display:block;margin-bottom:4px}}
.rules ul{{margin:0;padding-left:18px;font-size:14px}}
.q{{counter-reset:q}} .q div{{counter-increment:q;background:var(--card);border:1px solid var(--line);padding:14px 16px 14px 56px;border-radius:4px;margin:10px 0;position:relative}}
.q div::before{{content:counter(q);position:absolute;left:16px;top:13px;width:28px;height:28px;border-radius:50%;background:var(--red);color:#fff;font:800 15px/28px {FONT};text-align:center}}
.q b{{display:block}} .q span{{color:var(--mute);font-size:14px}}
.note{{color:var(--note);font-weight:700}}
@media (max-width:760px){{
  .src{{grid-template-columns:1fr}} .src img{{max-width:220px}}
  .body{{grid-template-columns:1fr}} .thumbs{{overflow-x:auto}}
  .thumb{{width:162px}} .frame{{transform:scale(.15)}}
  td:nth-child(4){{display:none}}
}}
"""


def build():
    pal = "".join(f'<div><i style="background:{h}"></i><p><b>{n}</b><br><code>{h}</code><br>{u}</p></div>' for h, n, u in PALETTE)
    shots = "".join(shot_html(s) for s in SHOTS)
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PANTY DE RED 分鏡</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;600;700;800;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><main>
<div class="kicker">ASATEX · MOTION STORYBOARD · v1 待確認</div>
<h1>PANTY DE <em>RED</em><br>十秒動態分鏡</h1>
<ul class="meta"><li>9:16 · 1080×1920</li><li>30 fps · 300 格</li><li>120 BPM · 1 拍 = 15 格</li><li>20 拍 · 5 小節</li><li>7 鏡 · 13 個動態點</li></ul>

<h2>素材分析 <small>SOURCE ANALYSIS</small></h2>
<div class="src"><img src="{ORIG}" alt="原始產品頁">
<div>
<div class="insight">這張不是消費者廣告，是<b>批發型錄</b>。「每打 6 黑 3 紅 3 膚」「100 打一箱」「型號 #CK2603L」是買家下單時要抄的資訊。
所以這支片的張力要用來<b>把規格送進眼睛</b>，不是只拍漂亮的腿 —— 規格那幾秒必須是全片最好讀的畫面。</div>
<p>頁面上有三樣東西值得做成動畫，其他都是靜態排版：</p>
<ul>
<li><b>網眼本身</b>：菱形格是兩組斜線交織 —— 可以「織」出來，也可以穿過網眼轉場。這是這個產品獨有的轉場工具。</li>
<li><b>鑽石閃光</b>：產品賣點就是「會閃」，閃光天生適合卡在拍點上。</li>
<li><b>6 + 3 + 3 = 12</b>：一打的配色組成是全頁唯一的資料，12 剛好是時鐘的刻度數。</li>
</ul>
<p>文案保留西班牙文（目標市場是拉丁美洲）。底部四個特點圖示刪掉 —— 十秒放不下，其中「鑽石」已在規格段交代。</p>
</div></div>

<h3>素材盤點（已切好，存在 <code>asatex/素材/</code>）</h3>
<table>{asset_rows()}</table>

<h3>色票（從原圖取樣）</h3>
<div class="pal">{pal}</div>
<div class="type">
<div><b style="font:900 30px {FONT}">PANTY DE RED</b><br>Montserrat Black 900 —— 最接近原頁的幾何粗黑體，大標、色名、數字</div>
<div><b style="font:300 22px {FONT};letter-spacing:.2em;color:{GOLD_D}">BRILLA A CADA PASO</b><br>Montserrat Light 300，字距 0.2em —— 副標、標語，與大標同一家族</div>
</div>

<h2>概念 <small>CONCEPT</small></h2>
<p class="lead"><b>「每一步都是一拍。」</b>副標 BRILLA A CADA PASO（每一步都閃耀）直接變成剪輯法則：
高跟鞋落地聲就是節拍器，每一個切點、每一顆鑽石閃光都落在鞋跟敲地的那一格。
開場由一顆光織出整張網，鏡頭穿過網眼進入產品；結尾 LOGO 上的光和開場第一格是同一顆 —— 首尾相接，可以無縫循環。</p>

<h2>節奏圖 <small>BEAT MAP</small></h2>
{timeline()}
<div class="legend"><span><b style="color:{RED}">▲</b> 重拍（全片只有三個：f60 亮相、f180 蓋章、f255 百打）</span><span>▲ 一般拍點</span><span>• 十六分音符（12 顆點落下）</span><span><b style="color:{RED}">—</b> 張力曲線</span></div>
<p>張力的來源是<b>對比</b>，不是一直滿檔：靜（S1）→ 蓄（S2）→ 爆（S3）→ 閃（S4）→ 穩（S5）→ 爆（S6）→ 收（S7）。S5 刻意降下來讓型號被讀清楚，S6 的爆點才有落差。</p>

<h2>分鏡 <small>SHOTS</small></h2>
<p><span class="note">藍色虛線箭頭與編號</span>是動態註記，對應各鏡「動態」欄的圈號，不會出現在成片裡。</p>
{shots}

<h2>動態語言 <small>MOTION SYSTEM</small></h2>
<div class="rules">
<div><b>落點</b><ul><li>所有重要動作落在 15 格（拍）或 7–8 格（半拍）的倍數上</li><li>重擊前 2 格預備壓縮（0.96）、重擊後 2 格定格 —— 讓眼睛「感覺到」撞擊</li></ul></div>
<div><b>曲線</b><ul><li>進場 expo-out 8–12 格；重擊用 spring（damping 14 / stiffness 260，有過衝）</li><li>退場永遠比進場快：6 格 expo-in</li><li>只有網線用線性 —— 它要像被抽出來的線</li></ul></div>
<div><b>克制</b><ul><li>鏡頭震動全片只用三次，就在三個重拍上；用多了就不再有感覺</li><li>發光只有一種：4 芒鑽石＋水平光暈，不加泛光濾鏡</li></ul></div>
<div class="no"><b>不做</b><ul><li>3D 翻轉、粒子噴泉、彩虹漸層、文字彈跳（吉祥物例外）</li><li>不用截圖文字 —— 所有字都用字體重排，任何尺寸都銳利</li></ul></div>
</div>

<h2>待你確認 <small>DECISIONS</small></h2>
<div class="q">
<div><b>比例：先做 9:16 直式，可以嗎？</b><span>主視覺是直幅的腿，直式最不浪費；投放 Reels／TikTok／WhatsApp 狀態都是直式。要 16:9 或 1:1 我會另外改構圖，不是直接裁切。</span></div>
<div><b>音樂：有沒有指定曲目？</b><span>分鏡依 120 BPM 設計。我這裡沒有授權音樂來源 —— 你給一首 120 BPM 左右的曲子，我把剪輯點對到它的拍子；沒有的話我先出無聲版，拍點已經切好，之後配樂直接對得上。</span></div>
<div><b>LOGO 有向量檔嗎？</b><span>目前只有從圖上切的 502px 點陣圖，結尾放大 1.5 倍已是上限。有 AI／SVG／PDF 會清楚很多。</span></div>
<div><b>主視覺要不要重生高解析版？</b><span>原圖 600px 寬，推鏡最多 1.1 倍。若要 S3 做更大的推近或腳踝特寫，可以用之前做的 FAL Action 跑 nano-banana-2 edit 生 4K 版（會花 FAL 費用）。不重生也能做，只是推鏡幅度小一點。</span></div>
<div><b>製作工具：Remotion（程式動畫），可以嗎？</b><span>這支片九成是文字、數字、網眼和光 —— 用程式做每格都可控、字永遠銳利、型號不會被 AI 畫錯。AI 影片模型（Kling／Seedance）適合拍「腿在走路」那種實拍感畫面，但會把 #CK2603L 這種字寫壞，所以只建議用在主視覺。</span></div>
</div>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
