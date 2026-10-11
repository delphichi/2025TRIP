#!/usr/bin/env python3
"""《活著的系統》15 秒紙雕風格動畫 —— 分鏡腳本產生器。

每個關鍵格都用 1080×1920 座標畫出真實的紙雕構圖：分層紙張、依深度加深的投影、
紙纖維質感、切口邊緣受光。正式製作時用的就是同一套 SVG 手法，所以這份分鏡也是製作規格。

    python3 living-system/build_storyboard.py  →  living-system/分鏡腳本-紙雕.html
"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "asatex"))
from build_storyboard import CSS as BASE_CSS  # noqa: E402  （共用分鏡頁版型）

OUT = HERE / "分鏡腳本-紙雕.html"
FPS, BEAT = 30, 20  # 90 BPM：一拍 20 格

# ── 紙色：五元各有一種紙 ──────────────────────────────────────
PAPER = "#F3EBDD"
SAND = "#E6D6BC"
INK = "#2A2522"
ROOT = "#7A5236"     # 本：根
GREEN = "#4E7D63"    # 能：枝葉
TERRA = "#C8664A"    # 身：土地、房子、真實條件
WATER = "#4F7FA6"    # 脈：水流、回饋
GOLD = "#E0A93B"     # 留：果實、累積
SAGE = "#9DB592"
DEEP = "#2F5546"
SKY = "#CFDDE3"
NIGHT = "#2E3F57"
SOIL = ["#C9A27A", "#B0855E", "#94694A", "#7A5338"]
SERIF = "'Noto Serif TC', 'Songti TC', serif"
NOTE = "#1f7ae0"

ELEMENTS = [("本", ROOT, "讓我們知道為何出發"), ("能", GREEN, "讓我們具有實現的可能"), ("身", TERRA, "讓我們承認真實的條件"),
            ("脈", WATER, "讓我們持續感知、調整與演化"), ("留", GOLD, "讓努力不只發生一次，而能成為未來的基礎")]


# ── 紙雕基本零件 ──────────────────────────────────────────────
def defs(u):
    """深度 1–4 的投影（越靠前，影子越遠越柔）、紙纖維、暗角。"""
    sh = "".join(
        f'<filter id="d{d}-{u}" x="-20%" y="-20%" width="140%" height="150%">'
        f'<feDropShadow dx="{2 + d * 3}" dy="{4 + d * 5}" stdDeviation="{3 + d * 2.5}" flood-color="#3b2a1a" flood-opacity="{.22 + d * .05:.2f}"/></filter>'
        for d in range(1, 5))
    return (f'<defs>{sh}'
            f'<filter id="fiber-{u}" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency=".9 .6" numOctaves="3" seed="7" result="n"/>'
            f'<feDiffuseLighting in="n" lighting-color="#fff" surfaceScale="1.4" result="l"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>'
            f'</filter>'
            f'<radialGradient id="vig-{u}" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a1a0a" stop-opacity=".28"/></radialGradient>'
            f'<marker id="arr-{u}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="{NOTE}"/></marker>'
            f'</defs>')


def cut(d, fill, depth, u, extra=""):
    """一張剪好的紙：填色 + 投影 + 切口受光的細亮邊。"""
    return (f'<g filter="url(#d{depth}-{u})"><path d="{d}" fill="{fill}" {extra}/>'
            f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" transform="translate(-1 -1)"/></g>')


def finish(u):
    """整格疊上紙纖維與暗角 —— 一層就夠，不用每張紙各算一次。"""
    return (f'<rect width="1080" height="1920" filter="url(#fiber-{u})" style="mix-blend-mode:multiply" opacity=".32"/>'
            f'<rect width="1080" height="1920" fill="url(#vig-{u})"/>')


def box_frame(u, color=SAND):
    """紙盒外框：最上層，影子落進盒內，整個畫面像一個立體紙盒。"""
    d = "M-20,-20 H1100 V1940 H-20Z M70,70 H1010 V1850 H70Z"
    return cut(d, color, 3, u, 'fill-rule="evenodd"')


def wave(y, amp, n, seed, x0=-40, x1=1120):
    r = random.Random(seed)
    pts = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        pts.append((x, y + r.uniform(-amp, amp)))
    d = f"M{x0},2000 L{pts[0][0]:.0f},{pts[0][1]:.0f}"
    for i in range(1, len(pts)):
        (ax, ay), (bx, by) = pts[i - 1], pts[i]
        d += f" Q{ax + (bx - ax) * .5:.0f},{ay - amp * .6:.0f} {bx:.0f},{by:.0f}"
    return d + f" L{x1},2000Z"


def gear(cx, cy, r, teeth, rot=0, hole=.32):
    pts = []
    for k in range(teeth):
        a0 = 2 * math.pi * k / teeth + math.radians(rot)
        w = math.pi / teeth
        for a, rr in [(a0 - w * .55, r * .82), (a0 - w * .32, r), (a0 + w * .32, r), (a0 + w * .55, r * .82)]:
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
    h = r * hole
    return d + f" M{cx + h},{cy} A{h},{h} 0 1 0 {cx - h},{cy} A{h},{h} 0 1 0 {cx + h},{cy}Z"


def leaf_d(x, y, L, W, ang):
    a = math.radians(ang)
    def p(u, v):
        return x + u * math.cos(a) - v * math.sin(a), y + u * math.sin(a) + v * math.cos(a)
    t = p(L, 0)
    c1 = p(L * .45, -W)
    c2 = p(L * .45, W)
    return f"M{x:.1f},{y:.1f} Q{c1[0]:.1f},{c1[1]:.1f} {t[0]:.1f},{t[1]:.1f} Q{c2[0]:.1f},{c2[1]:.1f} {x:.1f},{y:.1f}Z"


def stem_d(x0, y0, x1, y1, w0, w1, bend=0):
    """有粗細變化的莖：左右兩條二次曲線包起來。"""
    mx, my = (x0 + x1) / 2 + bend, (y0 + y1) / 2
    return (f"M{x0 - w0 / 2},{y0} Q{mx - (w0 + w1) / 4},{my} {x1 - w1 / 2},{y1} "
            f"L{x1 + w1 / 2},{y1} Q{mx + (w0 + w1) / 4},{my} {x0 + w0 / 2},{y0}Z")


def tag(x, y, title, sub, color, u, rot=-2, w=640):
    """吊牌：彩色紙條＋白紙卡，標題用襯線粗體。"""
    h = 200 if sub else 130
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            + cut(f"M0,0 H{w} V{h} H0Z", PAPER, 2, u)
            + cut(f"M0,0 H34 V{h} H0Z", color, 1, u)
            + f'<circle cx="{w - 36}" cy="34" r="10" fill="{SAND}" stroke="{INK}" stroke-opacity=".3" stroke-width="2"/>'
            f'<text x="66" y="92" font-family="{SERIF}" font-weight="900" font-size="{min(72, (w - 110) / len(title)):.0f}" fill="{INK}">{title}</text>'
            + (f'<text x="68" y="158" font-family="{SERIF}" font-weight="600" font-size="36" fill="{INK}" opacity=".75">{sub}</text>' if sub else "")
            + "</g>")


def boat(x, y, label, color, u, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            + cut("M-60,0 L60,0 L42,26 L-42,26Z", PAPER, 2, u)
            + cut("M0,-4 L0,-78 L46,-6Z", color, 2, u)
            + cut("M-4,-4 L-4,-62 L-38,-6Z", SAND, 1, u)
            + f'<text x="0" y="66" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="40" fill="{INK}">{label}</text>'
            "</g>")


def crane(x, y, s, color, u, rot=0):
    d = "M0,0 L-70,-46 L-18,-8 L-60,-90 L6,-14 L60,-30 L22,4 L84,-10 L18,18 Z"
    return f'<g transform="translate({x} {y}) scale({s}) rotate({rot})">{cut(d, color, 3, u)}</g>'


def sun(x, y, r, u):
    rays = "".join(
        f"M{x + (r + 14) * math.cos(a):.0f},{y + (r + 14) * math.sin(a):.0f} L{x + (r + 46) * math.cos(a + .08):.0f},{y + (r + 46) * math.sin(a + .08):.0f} L{x + (r + 46) * math.cos(a - .08):.0f},{y + (r + 46) * math.sin(a - .08):.0f}Z "
        for a in [i * math.pi / 6 for i in range(12)])
    return cut(rays, GOLD, 1, u) + cut(f"M{x + r},{y} A{r},{r} 0 1 0 {x - r},{y} A{r},{r} 0 1 0 {x + r},{y}Z", GOLD, 2, u)


def cloud(x, y, s, u, depth=1):
    d = (f"M{x - 90 * s},{y} a{40 * s},{40 * s} 0 0 1 {50 * s},{-40 * s} a{55 * s},{55 * s} 0 0 1 {95 * s},{-12 * s} "
         f"a{40 * s},{40 * s} 0 0 1 {45 * s},{52 * s}Z")
    return cut(d, "#fbf7f0", depth, u)


def badge(x, y, n):
    return (f'<g transform="translate({x} {y})"><circle r="40" fill="{NOTE}"/>'
            f'<text y="16" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="800" font-size="46" fill="#fff">{n}</text></g>')


def arrow(d, u):
    return f'<path d="{d}" fill="none" stroke="{NOTE}" stroke-width="9" stroke-dasharray="20 14" stroke-linecap="round" marker-end="url(#arr-{u})"/>'


def frame(u, body, bg=PAPER):
    return (f'<div class="frame" style="background:{bg}"><svg viewBox="0 0 1080 1920" width="1080" height="1920">'
            f'{defs(u)}{body}{finish(u)}</svg></div>')


# ── 場景零件 ──────────────────────────────────────────────────
GROUND = 1180


def soil(u, top=GROUND):
    return "".join(cut(wave(top + i * 120, 22, 6, 30 + i), c, 4 - i if i < 3 else 1, u) for i, c in enumerate(SOIL))


def roots(u, grow=1.0, x=540, y=GROUND + 10):
    r = random.Random(4)
    paths = []
    def branch(x0, y0, ang, L, w, depth):
        if depth == 0 or L < 30:
            return
        x1 = x0 + L * math.cos(math.radians(ang)) * grow
        y1 = y0 + L * math.sin(math.radians(ang)) * grow
        cx = (x0 + x1) / 2 + r.uniform(-30, 30)
        paths.append(f'<path d="M{x0:.0f},{y0:.0f} Q{cx:.0f},{(y0 + y1) / 2:.0f} {x1:.0f},{y1:.0f}" stroke-width="{w:.0f}"/>')
        for da in (-28, 26):
            branch(x1, y1, ang + da + r.uniform(-10, 10), L * .68, w * .62, depth - 1)
    branch(x, y, 90, 230, 30, 5)
    return (f'<g filter="url(#d2-{u})" fill="none" stroke="{ROOT}" stroke-linecap="round">{"".join(paths)}</g>')


def hills(u):
    return (cut(wave(880, 40, 4, 11), SAGE, 1, u)
            + cut(wave(980, 50, 5, 12), "#7FA17F", 2, u)
            + cut(wave(1090, 30, 5, 13), GREEN, 3, u))


def house(x, y, u, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            + cut("M-60,0 V-70 H60 V0Z", PAPER, 2, u)
            + cut("M-78,-66 L0,-130 L78,-66Z", TERRA, 3, u)
            + cut("M-14,0 V-40 H14 V0Z", INK, 1, u, 'opacity=".7"')
            + "</g>")


def tree(u, x=540, y=GROUND, h=520, leaves=1.0, bend=0, fruits=0, falling=0):
    out = [cut(stem_d(x, y, x + bend * .6, y - h, 46, 14, bend), DEEP, 3, u)]
    specs = [(-1, .32, 170, 64, -150), (1, .44, 180, 66, -30), (-1, .58, 160, 58, -140), (1, .7, 150, 54, -40),
             (-1, .82, 120, 46, -125), (1, .9, 110, 42, -55), (0, 1.0, 90, 36, -90)]
    n = int(round(len(specs) * leaves))
    for k, (side, t, L, W, ang) in enumerate(specs[:n]):
        bx = x + bend * .6 * t + (bend * .3 * t * (1 - t))
        by = y - h * t
        col = GREEN if k % 2 == 0 else "#5E9474"
        out.append(cut(leaf_d(bx, by, L, W, ang + bend * .08), col, 3, u))
        out.append(f'<path d="M{bx:.0f},{by:.0f} L{bx + L * .8 * math.cos(math.radians(ang + bend * .08)):.0f},{by + L * .8 * math.sin(math.radians(ang + bend * .08)):.0f}" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>')
    for k in range(fruits):
        side, t, L, W, ang = specs[k]
        fx = x + bend * .6 * t + L * .55 * math.cos(math.radians(ang))
        fy = y - h * t + L * .55 * math.sin(math.radians(ang)) + 40
        out.append(cut(f"M{fx + 30},{fy} A30,30 0 1 0 {fx - 30},{fy} A30,30 0 1 0 {fx + 30},{fy}Z", GOLD, 4, u))
    return "".join(out)


def caption(text, u, y=200, size=64, sub=None):
    return (f'<text x="540" y="{y}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="{size}" fill="{INK}" letter-spacing="4">{text}</text>'
            + (f'<text x="540" y="{y + 70}" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="40" fill="{INK}" opacity=".7" letter-spacing="2">{sub}</text>' if sub else ""))


# ── 十個關鍵格 ────────────────────────────────────────────────
def k1():
    u = "a"
    body = (f'<rect width="1080" height="1920" fill="{NIGHT}"/>'
            + cut(wave(1500, 30, 5, 2), "#3A4E6B", 1, u)
            + cut(gear(430, 900, 230, 12, 8), TERRA, 3, u)
            + cut(gear(700, 1120, 160, 9, 4), GOLD, 3, u)
            + cut(gear(700, 720, 120, 8, 10), SAND, 2, u)
            + box_frame(u)
            + f'<rect x="120" y="150" width="840" height="200" rx="10" fill="{PAPER}" filter="url(#d2-{u})"/>'
            + caption("生命不是一個", u, 238, 70) + caption("待修好的機器", u, 318, 70)
            + arrow("M300,660 A220,220 0 0 1 560,700", u) + badge(260, 640, 1))
    return frame(u, body)


def k2():
    u = "b"
    body = (f'<rect width="1080" height="1920" fill="{NIGHT}"/>'
            + cut(wave(1500, 30, 5, 2), "#3A4E6B", 1, u)
            # 齒輪裂開、往兩側倒下
            + f'<g transform="rotate(-24 300 1100) translate(-120 120)">{cut(gear(430, 900, 230, 12, 8), TERRA, 2, u)}</g>'
            + f'<g transform="rotate(30 820 1200) translate(140 160)">{cut(gear(700, 1120, 160, 9, 4), GOLD, 2, u)}</g>'
            # 中央長出新芽
            + cut(stem_d(540, 1240, 548, 980, 26, 10, 10), DEEP, 3, u)
            + cut(leaf_d(546, 1000, 130, 52, -150), GREEN, 3, u) + cut(leaf_d(548, 1010, 140, 56, -30), "#5E9474", 3, u)
            + box_frame(u)
            + f'<rect x="120" y="150" width="840" height="200" rx="10" fill="{PAPER}" filter="url(#d2-{u})"/>'
            + caption("而是一個", u, 238, 70) + caption("演化的系統", u, 318, 78)
            + badge(540, 880, 2) + arrow("M380,1250 L230,1380", u) + arrow("M700,1250 L860,1380", u))
    return frame(u, body)


def k3():
    u = "c"
    body = (f'<rect width="1080" height="1920" fill="{SKY}"/>'
            + soil(u, 760)
            + roots(u, 1.0, 540, 790)
            + cut(stem_d(540, 790, 545, 560, 30, 12, 8), DEEP, 3, u)
            + cut(leaf_d(544, 590, 130, 50, -150), GREEN, 3, u) + cut(leaf_d(545, 600, 140, 54, -30), "#5E9474", 3, u)
            + box_frame(u)
            + tag(220, 150, "本｜找到根本", "讓我們知道為何出發", ROOT, u)
            + badge(860, 1180, 3) + arrow("M860,1250 L860,1560", u))
    return frame(u, body)


def k4():
    u = "d"
    body = (f'<rect width="1080" height="1920" fill="{SKY}"/>'
            + cloud(300, 560, 1.2, u) + sun(820, 540, 70, u)
            + tree(u, h=560, leaves=.57)
            + soil(u)
            + box_frame(u)
            + tag(220, 150, "能｜建立能力", "讓我們具有實現的可能", GREEN, u)
            + badge(300, 820, 4) + arrow("M300,880 Q360,760 440,720", u))
    return frame(u, body)


def k5():
    u = "e"
    body = (f'<rect width="1080" height="1920" fill="{SKY}"/>'
            + cloud(260, 600, 1.1, u) + sun(840, 520, 66, u)
            + hills(u) + house(860, 1060, u, .9)
            + tree(u, h=600, leaves=1.0)
            + soil(u)
            + box_frame(u)
            + tag(170, 150, "身｜在真實條件下行動", "讓我們承認真實的條件", TERRA, u, w=740)
            + badge(140, 980, 5) + arrow("M140,1040 L330,1040", u) + arrow("M980,1040 L800,1040", u))
    return frame(u, body)


def river(u, cx=540, cy=1330, rx=430, ry=130):
    ring = (f"M{cx - rx},{cy} A{rx},{ry} 0 1 0 {cx + rx},{cy} A{rx},{ry} 0 1 0 {cx - rx},{cy}Z "
            f"M{cx - rx + 80},{cy} A{rx - 80},{ry - 36} 0 1 1 {cx + rx - 80},{cy} A{rx - 80},{ry - 36} 0 1 1 {cx - rx + 80},{cy}Z")
    return cut(ring, WATER, 2, u, 'fill-rule="evenodd"')


def k6():
    u = "f"
    steps = [("覺知", 180, 1300, TERRA), ("選擇", 400, 1440, GREEN), ("行動", 700, 1450, ROOT), ("回饋", 900, 1300, GOLD), ("調整", 560, 1210, WATER)]
    wind = "".join(f'<path d="M{x},{y} q80,-30 160,0 t160,0" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".85" filter="url(#d1-{u})"/>' for x, y in [(110, 760), (160, 900)])
    body = (f'<rect width="1080" height="1920" fill="{SKY}"/>'
            + cloud(820, 560, 1.0, u) + hills(u) + house(880, 1060, u, .8)
            + soil(u)
            + river(u)
            + tree(u, h=600, leaves=1.0, bend=60)
            + wind
            + "".join(boat(x, y, t, c, u, .9) for t, x, y, c in steps)
            + box_frame(u)
            + tag(170, 150, "脈｜持續變化與回饋", "讓我們持續感知、調整與演化", WATER, u, w=740)
            + badge(980, 1330, 6) + arrow("M900,1210 A420,120 0 0 0 220,1220", u) + badge(120, 820, 7))
    return frame(u, body)


def k7():
    u = "g"
    sprouts = "".join(cut(stem_d(x, GROUND + 30, x + 2, GROUND - 60, 12, 6, 4), DEEP, 2, u) + cut(leaf_d(x + 2, GROUND - 50, 60, 24, -140), GREEN, 2, u)
                      + cut(leaf_d(x + 2, GROUND - 46, 64, 24, -40), "#5E9474", 2, u) for x in (260, 820))
    falling = (cut("M330,1050 A30,30 0 1 0 270,1050 A30,30 0 1 0 330,1050Z", GOLD, 4, u)
               + f'<path d="M300,920 L300,1000" stroke="{GOLD}" stroke-width="6" stroke-dasharray="4 12" stroke-linecap="round"/>')
    body = (f'<rect width="1080" height="1920" fill="#E9D9B8"/>'
            + hills(u) + tree(u, h=600, leaves=1.0, fruits=5)
            + soil(u) + sprouts + falling
            + box_frame(u)
            + tag(150, 150, "留｜保留真正有價值的成果", "讓努力不只發生一次，而能成為未來的基礎", GOLD, u, w=780)
            + badge(300, 860, 8) + badge(820, 1060, 9))
    return frame(u, body)


def book(u, cx=540, y=1420, w=860):
    left = f"M{cx},{y} L{cx - w / 2},{y - 40} L{cx - w / 2 - 30},{y + 260} L{cx},{y + 300}Z"
    right = f"M{cx},{y} L{cx + w / 2},{y - 40} L{cx + w / 2 + 30},{y + 260} L{cx},{y + 300}Z"
    lines = "".join(f'<path d="M{cx - 40 - k * 70},{y + 40 + k * 2} L{cx - 60 - k * 70},{y + 250 + k * 6}" stroke="{INK}" stroke-opacity=".08" stroke-width="3"/>' for k in range(5))
    return cut(left, "#fbf7f0", 3, u) + cut(right, "#f6efe2", 3, u) + lines


def k8():
    u = "h"
    s = .6
    # 地面以上的場景（裁到地平線），縮小後立在書頁中縫上
    scene = (f'<clipPath id="above-{u}"><rect x="40" y="380" width="1000" height="{GROUND - 380 + 20}"/></clipPath>'
             f'<g clip-path="url(#above-{u})">' + hills(u) + house(860, 1060, u, .9) + tree(u, h=600, leaves=1.0, fruits=4) + "</g>"
             + cut(f"M40,{GROUND} H1040 V{GROUND + 40} H40Z", SOIL[1], 2, u))
    body = (f'<rect width="1080" height="1920" fill="{SKY}"/>'
            + sun(820, 470, 60, u)
            + book(u, y=1380)
            + f'<g transform="translate({540 - 540 * s} {1390 - (GROUND + 40) * s}) scale({s})">{scene}</g>'
            + crane(300, 760, 1.0, PAPER, u, -12) + crane(560, 600, 1.2, GOLD, u, -6) + crane(800, 720, .9, TERRA, u, -18)
            + box_frame(u)
            + caption("逐步增加", u, 250, 70) + caption("有效選擇", u, 340, 70)
            + badge(980, 560, 10) + arrow("M640,640 L860,420", u))
    return frame(u, body)


def k9():
    u = "i"
    tags = "".join(
        f'<g transform="translate({140 + i * 170} {1240}) rotate({(-3, 2, -1, 3, -2)[i]})">'
        + cut("M0,0 H140 V160 H0Z", c, 2, u)
        + f'<text x="70" y="108" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="84" fill="#fff">{t}</text></g>'
        for i, (t, c, _s) in enumerate(ELEMENTS))
    body = (f'<rect width="1080" height="1920" fill="{PAPER}"/>'
            + cut(wave(1560, 26, 5, 41), SAGE, 1, u) + cut(wave(1660, 30, 5, 42), GREEN, 2, u) + cut(wave(1760, 20, 5, 43), DEEP, 3, u)
            + crane(820, 520, .8, GOLD, u, -10)
            + box_frame(u)
            + f'<text x="540" y="780" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="150" fill="{INK}" letter-spacing="10">活著的系統</text>'
            + f'<text x="540" y="880" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="34" fill="{INK}" opacity=".7" letter-spacing="1">從覺知、能力、身體與變化，到財富與自由的生活設計</text>'
            + tags
            + f'<text x="540" y="1500" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="34" fill="{INK}" opacity=".8" letter-spacing="1">調，讓我們適應變化　驗，讓我們不被錯誤的信念帶偏</text>'
            + badge(140, 1180, 11))
    return frame(u, body)


def k10():
    u = "j"
    body = (f'<rect width="1080" height="1920" fill="{PAPER}"/>'
            + cut(wave(1560, 26, 5, 41), SAGE, 1, u) + cut(wave(1660, 30, 5, 42), GREEN, 2, u) + cut(wave(1760, 20, 5, 43), DEEP, 3, u)
            + crane(820, 520, .8, GOLD, u, -10)
            + box_frame(u)
            + f'<text x="540" y="700" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="120" fill="{INK}" letter-spacing="8">活著的系統</text>'
            + f'<g transform="translate(120 820)">{cut("M0,0 H840 V300 H0Z", "#fbf7f0", 2, u)}</g>'
            + f'<text x="540" y="935" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="52" fill="{INK}">讓每一步努力，</text>'
            + f'<text x="540" y="1025" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="52" fill="{INK}">都逐漸成為下一步</text>'
            + f'<text x="540" y="1105" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="60" fill="{GOLD}">自由的條件。</text>'
            + badge(140, 820, 12))
    return frame(u, body)


SHOTS = [
    dict(n="S1", name="不是機器", f=(0, 60), frames=[(k1, 24), (k2, 54)], el="—",
         visual="深藍紙盒裡，三個紙齒輪咬合轉動，上方紙卡寫「生命不是一個待修好的機器」。齒輪忽然卡住、裂開往兩側倒下，中間冒出一株新芽——紙卡換成「而是一個活著的系統」。",
         motion=["① f0–36 齒輪以「一拍兩格」的定格節奏轉動（每 2 格才動一次，手作感的關鍵）",
                 "② f36 卡住：齒輪抖 3 次，f42 裂開沿鉸鏈往兩側倒下（像立體書收合），f48 新芽從中間像立體書一樣「站起來」",
                 "紙卡翻面換字：沿上緣翻轉 180°，正反面兩句話"],
         trans="新芽是全片的主角，鏡頭沿著它往下鑽進土裡",
         sound="齒輪的木質喀噠聲（每 2 格一下）；f42 紙張撕裂；f48 紙張彈起「啪」；音樂盒第一個音"),
    dict(n="S2", name="本｜找到根本", f=(60, 120), frames=[(k3, 100)], el="本",
         visual="鏡頭下搖到地底：四層深淺不同的土壤紙片疊出剖面，褐色的根從新芽底下一路往下分岔。左上吊牌「本｜找到根本」。",
         motion=["③ 根以「描線生長」：每一段沿路徑畫出，分岔處停半拍再長（f64–110）",
                 "四層土壤前後錯開移動（多層視差：越前面的層移動越多）",
                 "吊牌從上方垂下、晃兩下才停（鐘擺式阻尼）"],
         trans="鏡頭再往上搖回地面，莖跟著往上長",
         sound="土壤沙沙聲；根每分岔一次一聲低音木琴；吊牌落下的紙片聲"),
    dict(n="S3", name="能・身", f=(120, 195), frames=[(k4, 150), (k5, 182)], el="能 身",
         visual="莖往上長、葉子一片一片像立體書往外翻開（能：能力一點一點長出來）。接著後方三層山丘、房子、太陽從兩側滑入——樹不是長在真空裡，而是長在真實的地形與條件中（身）。",
         motion=["④ 葉子：以葉柄為鉸鏈，從貼平（rotateY 90°）翻開到 0°，每片間隔半拍、左右交替",
                 "⑤ 山丘三層由左右兩側滑入，越遠的層越慢、越模糊（景深）；房子與太陽像立體書從頁面立起",
                 "吊牌在 f165 從「能」換成「身」：舊牌被往上抽走、新牌垂下"],
         trans="風吹起來，接 S4",
         sound="每翻開一片葉子一聲紙張翻動；山丘滑入的紙板摩擦聲"),
    dict(n="S4", name="脈｜持續變化與回饋", f=(195, 285), frames=[(k6, 250)], el="脈",
         visual="樹根周圍浮出一圈藍色紙河，五艘紙船繞著它循環：覺知 → 選擇 → 行動 → 回饋 → 調整——這就是書裡的運作循環。一陣風把樹吹彎，樹再慢慢回正（調：保留方向、改變方法）。",
         motion=["⑥ 紙河由一點往兩側展開成環（f195–210），五艘紙船依序從水面立起，沿橢圓軌道順時針航行一圈",
                 "⑦ f240 一陣風（白色紙條飄過），樹彎 12°、葉子翻動；f258 起像彈簧一樣慢慢回正——不是硬撐，是調整",
                 "船經過正前方時放大、經過後方時縮小並被樹擋住（假 3D 前後關係）"],
         trans="風停，樹梢開始結果",
         sound="流水聲（低音量鋪底）；風聲一次；船每經過正前方一聲輕鈴"),
    dict(n="S5", name="留｜保留成果", f=(285, 345), frames=[(k7, 320)], el="留",
         visual="背景轉成暖金色。樹上的葉子之間結出金色紙果實。果實熟了落進土裡，土裡冒出兩株新芽——成果被保留下來，成為下一輪的起點（保留 → 再演化）。",
         motion=["⑧ 果實「啪」地一顆一顆鼓起來：每拍一顆，壓扁 → 回彈",
                 "⑨ f320、f330 兩顆果實落下（自由落體＋落地壓扁），落點各長出一株小芽（和 S1 新芽同一個動作，縮小版）"],
         trans="鏡頭開始往後拉",
         sound="果實鼓起的紙球聲；落地「咚」；新芽冒出時重複 S1 的音樂盒動機"),
    dict(n="S6", name="自由・結尾", f=(345, 450), frames=[(k8, 370), (k9, 405), (k10, 435)], el="本 能 身 脈 留",
         visual="鏡頭拉遠：原來整座樹、山、房子都立在一本攤開的立體書上。三隻紙鶴從書頁飛出——選擇空間變大了。最後是書名「活著的系統」、五張彩色紙卡（本 能 身 脈 留）與「調・驗」，收在書末那句話。",
         motion=["⑩ f345–375 鏡頭拉遠到 0.62 倍，書頁從畫面下方升起；三隻紙鶴依序從書頁摺起、拍翅飛出畫面上方",
                 "⑪ f390 書名逐字蓋上（每字 3 格）；五張紙卡由左到右像撲克牌一樣翻開，每張的顏色就是那一元在片中的紙色",
                 "⑫ f420 最後一句：「讓每一步努力，都逐漸成為下一步自由的條件。」「自由的條件」用金色；最後 10 格靜止"],
         trans="結尾",
         sound="紙鶴拍翅（紙張快速抖動）；書名每蓋一字一聲輕敲；最後一句時音樂收在大三和弦"),
]


def shot_html(sh):
    a, b = sh["f"]
    thumbs = "".join(f'<figure><div class="thumb">{fn()}</div><figcaption>f{f} · {f / FPS:.2f}s</figcaption></figure>' for fn, f in sh["frames"])
    li = "".join(f"<li>{m}</li>" for m in sh["motion"])
    return f'''<article class="shot"><header><span class="sn">{sh["n"]}</span><h3>{sh["name"]}</h3>
<span class="time">{a / FPS:.1f}–{b / FPS:.1f}s · f{a}–{b - 1} · {(b - a) / FPS:.1f}s</span></header>
<div class="body"><div class="thumbs">{thumbs}</div><dl><dt>畫面</dt><dd>{sh["visual"]}</dd><dt>動態</dt><dd><ul>{li}</ul></dd>
<dt>轉場</dt><dd>{sh["trans"]}</dd><dt>聲音</dt><dd>{sh["sound"]}</dd></dl></div></article>'''


def timeline():
    W, H, top = 1000, 150, 30
    px = W / 450
    col = {"—": NIGHT, "本": ROOT, "能 身": GREEN, "脈": WATER, "留": GOLD, "本 能 身 脈 留": TERRA}
    s = [f'<svg viewBox="0 0 {W} {H}" class="tl" role="img" aria-label="十五秒節奏圖">']
    for sec in range(16):
        x = sec * FPS * px
        s.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + 56}" stroke="currentColor" stroke-opacity="{.45 if sec % 5 == 0 else .15}"/>')
        if sec % 5 == 0 and sec < 15:
            s.append(f'<text x="{x + 3:.1f}" y="{top - 10}" class="tl-t">{sec}s</text>')
    for sh in SHOTS:
        a, b = sh["f"]
        s.append(f'<rect x="{a * px + 1:.1f}" y="{top + 4}" width="{(b - a) * px - 2:.1f}" height="40" rx="4" fill="{col[sh["el"]]}"/>')
        s.append(f'<text x="{(a + b) / 2 * px:.1f}" y="{top + 29}" text-anchor="middle" class="tl-s">{sh["n"]} {sh["name"].split("｜")[0]}</text>')
    pts = [(0, .35), (36, .5), (48, .7), (60, .4), (120, .5), (195, .6), (240, .85), (285, .6), (330, .7), (375, .9), (420, 1), (449, .7)]
    y0, hh = H - 6, 50
    d = " ".join(f"{'M' if i == 0 else 'L'}{f * px:.1f},{y0 - v * hh:.1f}" for i, (f, v) in enumerate(pts))
    s.append(f'<path d="{d}" fill="none" stroke="{TERRA}" stroke-width="2.5"/><text x="4" y="{y0 - hh - 2}" class="tl-t">情緒</text></svg>')
    return "".join(s)


TECH = [
    ("分層紙張", "每個物件是一張剪好的紙（SVG 形狀），依前後放在 4 個深度層。所有紙都只有平塗色——紙雕的質感不是畫出來的，是靠下面三件事「照」出來的。"),
    ("依深度變化的投影", "越靠前的紙，影子離得越遠、越柔、越深（深度 1 → 4：位移 5 → 17px、模糊 5.5 → 13px）。這是讓平面看起來有厚度的最關鍵一步。"),
    ("切口受光", "每張紙左上緣描一道 2px 半透明白邊，模擬光打在紙的切口上。少了它，紙看起來像色塊；有了它，才像剪出來的。"),
    ("紙纖維＋暗角", "整格疊一層程式產生的紙纖維浮雕（乘法混合 32%）和四角微暗——一層就夠，不用每張紙各算一次。"),
    ("定格節奏", "動作以「一拍兩格」播放（每 2 格才更新一次，等於 15 張/秒），每次更新紙張再隨機抖 ±0.5px、±0.3°。這是定格動畫的手作感來源；全片 30fps 輸出，鏡頭移動保持平順。"),
    ("立體書式的動作", "東西不是淡入，而是「站起來」：葉子、房子、紙船、紙鶴都以一條邊為鉸鏈，從貼平翻轉到立起，像打開立體書。"),
    ("多層視差＋景深", "鏡頭移動時，越前面的層移動越多；最遠的山丘加 1–2px 模糊。紙盒外框永遠在最前面，畫面像在看一個立體紙盒。"),
]


def build():
    pal = "".join(f'<div><i style="background:{c}"></i><p><b>{t}</b><br><code>{c}</code><br>{s}</p></div>' for t, c, s in ELEMENTS)
    pal += "".join(f'<div><i style="background:{c}"></i><p><b>{n}</b><br><code>{c}</code><br>{u}</p></div>' for c, n, u in [(PAPER, "紙底", "背景、卡片"), (SAND, "紙盒", "外框"), (NIGHT, "夜藍", "開場機器"), (INK, "墨", "文字")])
    tech = "".join(f"<div><b>{a}</b><p>{b}</p></div>" for a, b in TECH)
    css = BASE_CSS + f"""
:root{{--red:{TERRA};--cream:{PAPER};--card:#fbf7f0;--line:#e3d6c0}}
body{{font-family:'Noto Serif TC','Noto Sans TC',serif}}
h1{{font-family:'Noto Serif TC',serif;font-weight:900;letter-spacing:.04em}} h1 em{{color:{GOLD}}}
.tech{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}
.tech div{{background:var(--card);border:1px solid var(--line);border-left:6px solid {TERRA};padding:12px 16px;border-radius:4px}}
.tech p{{margin:4px 0 0;font-size:15px}}
.cmp td{{vertical-align:top;font-size:14px}}"""
    shots = "".join(shot_html(s) for s in SHOTS)
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>活著的系統 紙雕分鏡</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
<style>{css}</style></head><body><main>
<div class="kicker">PAPER-CUT MOTION STORYBOARD · v1 待確認</div>
<h1>活著的系統<br><em>15 秒紙雕動畫</em></h1>
<ul class="meta"><li>9:16 · 1080×1920</li><li>30 fps · 450 格</li><li>90 BPM · 1 拍 = 20 格</li><li>6 鏡 · 10 個關鍵格</li><li>動作一拍兩格（定格感）</li></ul>

<h2>怎麼做 <small>HOW</small></h2>
<p class="lead">十五秒放不下整本書。我只留一條主線：<b>一株植物從齒輪裡長出來，依序長出「本、能、身、脈、留」</b>——
這是書裡把生命從「機器」換成「活著的系統」最直接的畫面，也剛好是紙雕最擅長的東西：會一層一層長出來。</p>
<div class="insight"><b>五元各有一種紙</b>：本＝根的褐、能＝葉的綠、身＝土地與房子的赤陶、脈＝水的藍、留＝果實的金。
結尾五張紙卡用同樣五個顏色——觀眾不必讀字，也已經在片中看過每一張。</div>
<table class="cmp"><tr><td><b>書裡的概念</b></td><td><b>畫面</b></td></tr>
<tr><td>生命不是待修好的機器</td><td>齒輪卡住、裂開，中間長出新芽</td></tr>
<tr><td>本：方向與根本</td><td>地底的根</td></tr>
<tr><td>能：可以動用的能力</td><td>莖與一片片展開的葉</td></tr>
<tr><td>身：真實的身體與環境</td><td>樹所在的地形、房子、太陽</td></tr>
<tr><td>脈：覺知 → 選擇 → 行動 → 回饋 → 調整</td><td>繞著樹流動的紙河、五艘紙船</td></tr>
<tr><td>調：保留方向、改變方法</td><td>樹被風吹彎、慢慢回正</td></tr>
<tr><td>留 → 再演化</td><td>果實落地，長出新芽</td></tr>
<tr><td>自由：增加有效選擇</td><td>拉遠是一本立體書，紙鶴飛出</td></tr></table>

<h3>紙雕質感的七個做法</h3>
<div class="tech">{tech}</div>

<h3>工具建議：Remotion（程式動畫）</h3>
<p>和前兩支一樣用 Remotion：上面七個做法都是 SVG／CSS 能精確控制的東西，中文字每一格都正確。
AI 影片模型（Kling、Seedance）能做出很像真紙的質感，但<b>中文字幾乎一定會寫錯</b>，而且五元的顏色與順序無法逐格控制——只適合拿來做沒有文字的空景。</p>

<h3>色票</h3><div class="pal">{pal}</div>

<h2>節奏圖 <small>TIMING</small></h2>
{timeline()}
<p>節奏比前兩支慢：90 BPM、一拍 20 格。紙雕的魅力在「看它長出來」，太快會變成幻燈片。最高點放在 14 秒的書末那句話。</p>

<h2>分鏡 <small>SHOTS</small></h2>
<p><span class="note">藍色編號與虛線</span>是動態註記，對應各鏡「動態」欄的圈號，不會出現在成片裡。</p>
{shots}

<h2>待你確認 <small>DECISIONS</small></h2>
<div class="q">
<div><b>主線用「一株植物長出五元」可以嗎？</b><span>另一個方向是「一個紙人沿著循環走一圈」，比較像在講故事，但五元會變成路標，比較難一眼看懂。</span></div>
<div><b>比例：9:16 直式？</b><span>沿用前兩支。如果要放 YouTube 或簡報，16:9 我會重新構圖（橫的畫面更適合把山丘和河流拉寬）。</span></div>
<div><b>字幕都取自書中文字，可以嗎？</b><span>吊牌標題是第三章五元的原標題（如「身｜在真實條件下行動」），副標取自〈結語〉五句；開頭「生命不是一個待修好的機器」是結語標題，「而是一個演化的系統」節錄自〈核心主張〉；S6「逐步增加有效選擇」節錄自原理七；最後一句是全書末句原文。只有節錄、沒有改寫。</span></div>
<div><b>動作用「一拍兩格」的定格節奏？</b><span>手作感比較強；如果你想要更滑順，可以改成每格都動，紙張質感不變。</span></div>
<div><b>配樂：程式合成的音樂盒＋紙張音效？</b><span>音樂盒音色配紙雕最自然，紙張翻動、撕裂、彈起的聲音都會對準畫面。</span></div>
</div>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
