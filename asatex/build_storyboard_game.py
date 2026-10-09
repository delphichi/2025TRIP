#!/usr/bin/env python3
"""ASATEX PANTY DE RED — 遊戲版 10 秒分鏡「¿DÓNDE ESTÁ PANTY DE RED?」

地圖語彙取自使用者貼的 North Studio 活地圖規格（瑞士製圖風、三組旋轉街廓、彈簧圖釘、
Dijkstra 最短路徑小人、臨界阻尼鏡頭、車／船／雲影），改編成一支「找貨」任務的遊戲短片。

世界用 2000×3000 的地圖座標畫一次，每個關鍵格只是不同的鏡頭（中心＋縮放）——
和正式製作時「靜態城市快取一次、活動圖層疊在上面」的做法一致。

    python3 asatex/build_storyboard_game.py   →  asatex/分鏡腳本-遊戲版.html
"""
import math
import random
from pathlib import Path

from PIL import Image

from build_storyboard import (ASSET, CSS, HERO, INK, NOTE, RED, RED_HI, SKIN, GOLD,
                              arrow, badge, defs, glint, uri)

HERE = Path(__file__).resolve().parent
OUT = HERE / "分鏡腳本-遊戲版.html"
FPS, BEAT = 30, 15

def uri_rgba(path):
    """保留透明度（build_storyboard.uri 會轉成 RGB，透明處變黑）。"""
    import base64
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()


LOGO_N = uri_rgba(ASSET / "14-logo-ASAHI-ZOFRI.png")
_ln = Image.open(ASSET / "14-logo-ASAHI-ZOFRI.png")
LOGO_N_AR = _ln.height / _ln.width

# ── 地圖色票（參考規格）＋品牌色 ──────────────────────────────
PAPER = "#F4EFE6"
SAND = "#EADFCF"
CASING = "#D9CFBF"
WATER = "#9CC9E6"
PARK = "#BFE3C3"
PIN = RED_HI          # 參考規格是番茄紅 #FF5A3C；改用產品紅，維持品牌一致
NAVY = "#1d2433"
KRAFT = "#c9a06a"
DISPLAY = "'Bricolage Grotesque', 'Montserrat', sans-serif"
MONO = "'Geist Mono', 'DejaVu Sans Mono', monospace"
BRAND = "Montserrat, 'Liberation Sans', sans-serif"

# ── 世界：三個區、三組不同角度的街廓 ──────────────────────────
DISTRICTS = [
    # name, clip polygon, rotation, origin, cell, gap
    ("PUERTO", [(380, 120), (900, 120), (900, 1680), (380, 1680)], -14, (640, 900), 150, 30),
    ("ZOFRI", [(940, 120), (2100, 120), (2100, 1690), (940, 1690)], 0, (940, 150), 170, 36),
    ("CENTRO", [(380, 1730), (2100, 1730), (2100, 3100), (380, 3100)], 22, (1250, 2400), 140, 30),
]
# 路徑（ZOFRI 區街道中線 + 大道），各段長度約略相等 → 小人等速走、轉角都落在拍點
SPAWN = (1110, 1710)
C1 = (1280, 1710)
C2 = (1280, 1340)
C3 = (1620, 1340)
TARGET = (1620, 1000)
ROUTE = [SPAWN, C1, C2, C3, TARGET]
ROUTE_T = [75, 90, 120, 150, 180]           # 到達各點的影格
STORE = (1638, 848, 134, 134)                # 目標店面街廓（ZOFRI i=4, j=4）
PIN_AT = (1705, 900)
GEMS = [("NEGRO", INK, (1280, 1525), 105, 6), ("ROJO", RED_HI, (1450, 1340), 135, 3), ("PIEL", SKIN, (1620, 1170), 165, 3)]
BOX_AT = (1690, 1040)


def rot(p, ang, c):
    a = math.radians(ang)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


def world(uid, route_done=0.0, show_route=False, flood=None, extra=""):
    """整張城市（地圖座標）。route_done：已走過的比例，route 前方畫虛線。"""
    rnd = random.Random(2603)
    out = [f'<defs><filter id="blur-{uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>']
    for k, (name, poly, *_r) in enumerate(DISTRICTS):
        pts = " ".join(f"{x},{y}" for x, y in poly)
        out.append(f'<clipPath id="d{k}-{uid}"><polygon points="{pts}"/></clipPath>')
    out.append("</defs>")
    # 陸地 = 街道白
    out.append(f'<rect x="-600" y="-600" width="3400" height="4400" fill="#fff"/>')
    for k, (name, poly, ang, org, cell, gap) in enumerate(DISTRICTS):
        blocks = []
        for i in range(-14, 15):
            for j in range(-14, 15):
                x, y = org[0] + i * cell + gap / 2, org[1] + j * cell + gap / 2
                if name == "ZOFRI" and (x, y) == (STORE[0], STORE[1]):
                    continue  # 店面另外畫
                fill = PARK if rnd.random() < 0.07 else SAND
                blocks.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{cell - gap}" height="{cell - gap}" rx="10" fill="{fill}" stroke="{CASING}" stroke-width="3"/>')
        out.append(f'<g clip-path="url(#d{k}-{uid})"><g transform="rotate({ang} {org[0]} {org[1]})">{"".join(blocks)}</g></g>')
    # 目標店面：2.5D 擠出，屋頂品牌紅
    x, y, w, h = STORE
    out.append(f'<rect x="{x}" y="{y + 14}" width="{w}" height="{h}" rx="10" fill="#b9ab95" stroke="{INK}" stroke-width="3"/>'
               f'<rect x="{x}" y="{y - 10}" width="{w}" height="{h}" rx="10" fill="{SAND}" stroke="{INK}" stroke-width="3"/>'
               f'<rect x="{x + 16}" y="{y + 6}" width="{w - 32}" height="34" rx="6" fill="{RED}"/>'
               f'<text x="{x + w / 2}" y="{y + 31}" text-anchor="middle" font-family="{MONO}" font-size="20" font-weight="700" fill="#fff" letter-spacing="2">ASATEX</text>')
    # 海岸（伊基克在太平洋岸）＋ 碼頭
    out.append(f'<path d="M-600,-600 L430,-600 C350,200 480,620 400,1050 S300,1750 430,2250 S360,3000 410,3800 L-600,3800Z" fill="{WATER}" stroke="#86b9da" stroke-width="4"/>')
    out.append(f'<rect x="230" y="880" width="200" height="40" rx="6" fill="{SAND}" stroke="{CASING}" stroke-width="3"/>'
               f'<rect x="250" y="1300" width="170" height="34" rx="6" fill="{SAND}" stroke="{CASING}" stroke-width="3"/>')
    for wx, wy in [(120, 600), (220, 1500), (90, 2100), (260, 2600), (150, 400)]:
        out.append(f'<path d="M{wx},{wy} q14,-10 28,0 q14,10 28,0" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>')
    # 船（航行中，尾跡）
    out.append(f'<g transform="translate(250 1180) rotate(-8)"><path d="M-14,60 L0,0 L14,60" fill="none" stroke="#fff" stroke-width="4" opacity=".8"/>'
               f'<path d="M-16,-30 L16,-30 L12,26 L-12,26Z" fill="#fff" stroke="{INK}" stroke-width="3"/><rect x="-8" y="-18" width="16" height="22" fill="{PIN}" stroke="{INK}" stroke-width="2"/></g>')
    # 車
    for cx, cy, col, ang in [(1000, 1710, INK, 0), (1560, 1704, PIN, 0), (920, 600, "#fff", 90), (1450, 760, PARK, 90), (920, 1400, "#fff", 90), (1900, 1716, NAVY, 0)]:
        out.append(f'<g transform="translate({cx} {cy}) rotate({ang})"><rect x="-22" y="-11" width="44" height="22" rx="7" fill="{col}" stroke="{INK}" stroke-width="3"/><rect x="4" y="-7" width="10" height="14" rx="2" fill="#cfe6f5"/></g>')
    # 路徑
    if show_route:
        pts = ROUTE
        seglens = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
        total = sum(seglens)
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        done = total * route_done
        out.append(f'<path d="{d}" fill="none" stroke="{PIN}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".25" stroke-dasharray="{done} {total}"/>')
        # 前方：從目前位置到終點的虛線
        acc, rest = 0.0, []
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            L = seglens[i]
            if acc + L >= done:
                if not rest:
                    t = (done - acc) / L
                    rest.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                rest.append(b)
            acc += L
        if len(rest) > 1 and route_done < 1:
            d2 = "M" + " L".join(f"{x:.0f},{y:.0f}" for x, y in rest)
            out.append(f'<path d="{d2}" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round" stroke-dasharray="2 24"/>')
    # Dijkstra 擴散
    if flood is not None:
        sx, sy = SPAWN
        for i in range(0, 8):
            for j in range(0, 10):
                nx, ny = 940 + i * 170, 150 + j * 170
                d = abs(nx - sx) + abs(ny - sy)
                if d < flood:
                    age = (flood - d) / flood
                    r = 12 if flood - d < 140 else 8
                    col = PIN if flood - d < 140 else INK
                    out.append(f'<circle cx="{nx}" cy="{ny}" r="{r}" fill="{col}" opacity="{max(.25, 1 - age * .9):.2f}"/>')
        for i in range(0, 8):
            nx = 940 + i * 170
            d = abs(nx - sx)
            if d < flood:
                out.append(f'<circle cx="{nx}" cy="1710" r="9" fill="{INK}" opacity=".5"/>')
    # 標籤：Geist Mono 小寫大寫
    for txt, x, y, ang, size in [("OCÉANO PACÍFICO", 160, 1900, -90, 30), ("PUERTO", 560, 380, -14, 30),
                                  ("ZOFRI · ZONA FRANCA", 1180, 230, 0, 30), ("CENTRO", 1100, 2150, 22, 30),
                                  ("MUELLE", 250, 860, 0, 22), ("AV. ZOFRI", 1700, 1700, 0, 22)]:
        out.append(f'<text x="{x}" y="{y}" transform="rotate({ang} {x} {y})" font-family="{MONO}" font-size="{size}" '
                   f'font-weight="600" letter-spacing="5" fill="{INK}" opacity=".55">{txt}</text>')
    # 雲影
    for cx, cy, rx, ry in [(800, 700, 260, 130), (1700, 2100, 320, 150), (1300, 1250, 200, 90)]:
        out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#46392b" opacity=".09" filter="url(#blur-{uid})"/>')
    out.append(extra)
    return "".join(out)


# ── 角色與道具（地圖座標或螢幕座標皆可，原點在腳底） ──────────
def mascot(x, y, s=1.0, wave=0, hop=0, squash=1.0, face=1):
    """ASATEX 吉祥物（紅海獅＋水手帽），依 LOGO 重畫成可動的貼紙風向量角色。"""
    sh = f'<ellipse cx="0" cy="0" rx="{30 * (1 - hop / 160)}" ry="{8 * (1 - hop / 160)}" fill="{INK}" opacity=".2"/>'
    body = (f'<g transform="translate(0 {-hop}) scale({face * (2 - squash)} {squash})">'
            f'<path d="M-24,-10 L-46,-2 L-38,-20Z" fill="{RED}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="M-26,-8 C-34,-40 -18,-80 6,-82 C32,-84 38,-52 30,-30 C26,-14 14,-4 0,-4 Z" fill="#c4161c" stroke="{INK}" stroke-width="3.5"/>'
            f'<ellipse cx="6" cy="-30" rx="13" ry="19" fill="#fff"/>'
            f'<g transform="rotate({-wave * 2} 26 -34)"><ellipse cx="34" cy="-20" rx="7" ry="16" transform="rotate(-25 34 -20)" fill="#c4161c" stroke="{INK}" stroke-width="3"/></g>'
            f'<circle cx="14" cy="-62" r="8" fill="#fff" stroke="{INK}" stroke-width="2"/><circle cx="16" cy="-62" r="4" fill="{INK}"/>'
            f'<path d="M-8,-76 Q8,-102 30,-80 Z" fill="#fff" stroke="{INK}" stroke-width="3"/>'
            f'<path d="M-6,-80 Q8,-96 26,-82" fill="none" stroke="{NAVY}" stroke-width="8"/>'
            "</g>")
    return f'<g transform="translate({x} {y}) scale({s})">{sh}{body}</g>'


def pin(x, y, s=1.0, squash=1.0, ripple=0):
    rip = "".join(f'<ellipse cx="0" cy="0" rx="{r}" ry="{r * .35}" fill="none" stroke="{PIN}" stroke-width="4" opacity="{op}"/>'
                  for r, op in ([(40 + ripple * 30, .6), (70 + ripple * 50, .3)] if ripple else []))
    head = (f'<g transform="scale({2 - squash} {squash})"><path d="M0,0 C-10,-26 -34,-40 -34,-66 A34,34 0 1 1 34,-66 C34,-40 10,-26 0,0Z" '
            f'fill="{PIN}" stroke="{INK}" stroke-width="5"/><circle cx="0" cy="-66" r="12" fill="#fff" stroke="{INK}" stroke-width="3"/></g>')
    return f'<g transform="translate({x} {y}) scale({s})">{rip}{head}</g>'


def gem(x, y, col, s=1.0, uid="g", glow=True):
    """收集品：菱形網眼色票。"""
    d = 34
    lines = "".join(f'<line x1="{-d + k * 12}" y1="{-d}" x2="{-d + k * 12 + 2 * d}" y2="{d}" stroke="{INK if col != INK else "#555"}" stroke-width="2" opacity=".55"/>'
                    f'<line x1="{-d + k * 12}" y1="{d}" x2="{-d + k * 12 + 2 * d}" y2="{-d}" stroke="{INK if col != INK else "#555"}" stroke-width="2" opacity=".55"/>' for k in range(-6, 6))
    return (f'<g transform="translate({x} {y}) scale({s})"><clipPath id="gc-{uid}"><path d="M0,{-d} L{d},0 L0,{d} L{-d},0Z"/></clipPath>'
            f'<path d="M0,{-d - 8} L{d + 8},0 L0,{d + 8} L{-d - 8},0Z" fill="#fff" stroke="{INK}" stroke-width="4"/>'
            f'<path d="M0,{-d} L{d},0 L0,{d} L{-d},0Z" fill="{col}"/><g clip-path="url(#gc-{uid})">{lines}</g>'
            + (glint(14, -18, 16, uid=uid) if glow else "") + "</g>")


def box(x, y, s=1.0, open_=0.0, uid="b"):
    lid = (f'<path d="M-60,-70 L{-60 - 50 * open_},{-70 - 40 * open_} L{-10 - 20 * open_},{-100 - 30 * open_} L0,-70Z" fill="#b8884f" stroke="{INK}" stroke-width="4"/>'
           f'<path d="M60,-70 L{60 + 50 * open_},{-70 - 40 * open_} L{10 + 20 * open_},{-100 - 30 * open_} L0,-70Z" fill="#b8884f" stroke="{INK}" stroke-width="4"/>')
    return (f'<g transform="translate({x} {y}) scale({s})"><ellipse cx="0" cy="6" rx="80" ry="16" fill="{INK}" opacity=".2"/>'
            f'<path d="M-60,-70 L60,-70 L60,0 L-60,0Z" fill="{KRAFT}" stroke="{INK}" stroke-width="4"/>'
            f'<path d="M60,-70 L82,-84 L82,-14 L60,0Z" fill="#a97f4c" stroke="{INK}" stroke-width="4"/>'
            f'<rect x="-46" y="-50" width="92" height="28" fill="{RED}"/>'
            f'<text x="0" y="-30" text-anchor="middle" font-family="{MONO}" font-weight="700" font-size="17" fill="#fff" letter-spacing="1">100 DOC.</text>'
            f'{lid}</g>')


def cam(cx, cy, z, inner, sx=540, sy=960):
    return f'<g transform="translate({sx} {sy}) scale({z}) translate({-cx} {-cy})">{inner}</g>'


# ── HUD（螢幕座標）────────────────────────────────────────────
def banner(slide=0, count=None):
    c = "" if count is None else (
        f'<g transform="translate(840 150)"><text x="0" y="0" text-anchor="middle" font-family="{MONO}" font-size="28" font-weight="700" letter-spacing="3" fill="{INK}" opacity=".6">DOCENA</text>'
        f'<text x="0" y="62" text-anchor="middle" font-family="{MONO}" font-size="58" font-weight="700" fill="{INK}">{count}/12</text></g>')
    return (f'<g transform="translate(0 {-slide})">'
            f'<rect x="60" y="88" width="960" height="230" rx="40" fill="{INK}"/>'
            f'<rect x="60" y="76" width="960" height="230" rx="40" fill="{PAPER}" stroke="{INK}" stroke-width="5"/>'
            f'<rect x="100" y="110" width="170" height="44" rx="22" fill="{INK}"/>'
            f'<text x="185" y="141" text-anchor="middle" font-family="{MONO}" font-size="24" font-weight="700" letter-spacing="4" fill="{PAPER}">MISIÓN</text>'
            f'<text x="100" y="222" font-family="{DISPLAY}" font-weight="800" font-size="62" fill="{INK}" letter-spacing="-1">ENCUENTRA</text>'
            f'<text x="100" y="282" font-family="{BRAND}" font-weight="900" font-size="52" fill="{INK}">PANTY DE <tspan fill="{RED}">RED</tspan></text>'
            f'<rect x="440" y="110" width="230" height="44" rx="10" fill="{RED}"/>'
            f'<text x="555" y="142" text-anchor="middle" font-family="{BRAND}" font-weight="800" font-size="28" fill="#fff">#CK2603L</text>'
            f'{c}</g>')


def inventory(got=(False, False, False), active=None, slide=0):
    """三張收集卡（改編自參考規格的三張辦公室卡），白色底板滑到目前那張。"""
    out = [f'<g transform="translate(0 {slide})">',
           f'<rect x="40" y="1548" width="1000" height="300" rx="40" fill="{INK}"/>',
           f'<rect x="40" y="1536" width="1000" height="300" rx="40" fill="{PAPER}" stroke="{INK}" stroke-width="5"/>']
    if active is not None:
        out.append(f'<rect x="{62 + active * 322}" y="1556" width="312" height="262" rx="28" fill="#fff" stroke="{INK}" stroke-width="3"/>')
    for i, (name, col, _p, _t, q) in enumerate(GEMS):
        x = 62 + i * 322
        ok = got[i]
        out.append(f'<g transform="translate({x + 54} {1626})">'
                   + (gem(0, 0, col, 0.62, uid=f"inv{i}{active}{ok}", glow=False) if ok else
                      f'<path d="M0,-34 L34,0 L0,34 L-34,0Z" fill="none" stroke="{INK}" stroke-width="4" stroke-dasharray="8 8" opacity=".4"/>')
                   + "</g>")
        out.append(f'<text x="{x + 104}" y="1640" font-family="{DISPLAY}" font-weight="800" font-size="46" fill="{INK}">{name}</text>'
                   f'<text x="{x + 26}" y="1716" font-family="{MONO}" font-size="26" font-weight="600" letter-spacing="2" fill="{INK}" opacity=".7">{q} UNIDADES</text>'
                   f'<circle cx="{x + 38}" cy="1772" r="9" fill="{"#2f9e57" if ok else "#c9bfae"}"/>'
                   f'<text x="{x + 56}" y="1781" font-family="{MONO}" font-size="26" font-weight="700" letter-spacing="2" fill="{INK}" opacity="{1 if ok else .45}">{"LISTO" if ok else "PENDIENTE"}</text>')
    out.append("</g>")
    return "".join(out)


def frame(uid, svg, bg=PAPER):
    grain = (f'<filter id="grain-{uid}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/>'
             f'<feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.17  0 0 0 0 0.13  0 0 0 .5 0"/></filter>')
    return (f'<div class="frame" style="background:{bg}"><svg viewBox="0 0 1080 1920" width="1080" height="1920">{defs(uid)}'
            f'<defs>{grain}</defs>{svg}<rect width="1080" height="1920" filter="url(#grain-{uid})" opacity=".18"/></svg></div>')


def bubble(x, y, txt, size=44):
    w = len(txt) * size * 0.62 + 50
    return (f'<g transform="translate({x} {y})"><path d="M{-w / 2},-70 h{w} a14,14 0 0 1 14,14 v46 a14,14 0 0 1 -14,14 h{-w / 2 + 24} l-24,22 l-6,-22 h{-w / 2 + 6} a14,14 0 0 1 -14,-14 v-46 a14,14 0 0 1 14,-14z" '
            f'fill="#fff" stroke="{INK}" stroke-width="4"/><text x="0" y="-18" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="{size}" fill="{INK}">{txt}</text></g>')


def burst(x, y, txt, size=64, col=PIN):
    return (f'<g transform="translate({x} {y}) rotate(-6)"><rect x="{-len(txt) * size * .32 - 30}" y="-60" width="{len(txt) * size * .64 + 60}" height="88" rx="18" fill="{col}" stroke="{INK}" stroke-width="5"/>'
            f'<text x="0" y="2" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="{size}" fill="#fff">{txt}</text></g>')


# ── 關鍵格 ────────────────────────────────────────────────────
def k1():
    u = "q1"
    w = world(u, extra=pin(*PIN_AT, s=1.0, squash=.8, ripple=1))
    svg = cam(1150, 1450, .52, w) + banner()
    svg += arrow("M520,600 L520,760", u) + badge(460, 560, 1, u) + badge(980, 380, 2, u)
    return frame(u, svg)


def k2():
    u = "q2"
    w = world(u, flood=900, extra=pin(*PIN_AT) + mascot(*SPAWN, s=1.1, squash=.85)
              + f'<circle cx="{SPAWN[0]}" cy="{SPAWN[1] - 40}" r="70" fill="none" stroke="#fff" stroke-width="10" opacity=".8"/>')
    svg = cam(1350, 1300, .62, w) + banner(count=0) + inventory()
    svg += badge(130, 1060, 3, u)
    return frame(u, svg)


def k3():
    u = "q3"
    w = world(u, show_route=True, route_done=0, extra=pin(*PIN_AT) + mascot(*SPAWN, s=1.1)
              + "".join(gem(*p, c, .8, uid=f"{u}{n}") for n, c, p, _t, _q in GEMS))
    svg = cam(1380, 1330, .66, w) + banner(count=0) + inventory()
    svg += bubble(540 + (SPAWN[0] - 1380) * .66, 960 + (SPAWN[1] - 1330) * .66 - 90, "¡VAMOS!")
    svg += badge(160, 980, 4, u)
    return frame(u, svg)


def k4():
    u = "q4"
    z, cx, cy = 1.0, 1450, 1250
    w = world(u, show_route=True, route_done=.36, extra=pin(*PIN_AT)
              + "".join(gem(*p, c, .8, uid=f"{u}{n}") for n, c, p, _t, _q in GEMS[1:])
              + mascot(1280, 1525, s=1.15, squash=.9))
    # 收集品沿弧線飛向 HUD 的 NEGRO 卡
    sx, sy = 540 + (1280 - cx) * z, 960 + (1525 - cy) * z
    trail = "".join(gem(sx + (116 - sx) * t, sy + (1626 - sy) * t - math.sin(t * math.pi) * 380, INK, .8 - t * .2, uid=f"{u}t{k}", glow=False)
                    .replace("<g transform", f'<g opacity="{.25 + t * .75:.2f}" transform', 1) for k, t in enumerate([.25, .5, .72]))
    svg = cam(cx, cy, z, w) + trail + banner(count=6) + inventory((True, False, False), active=0)
    svg += burst(sx + 40, sy - 210, "+6", 70)
    svg += badge(980, 1460, 5, u) + badge(140, 860, 6, u)
    return frame(u, svg)


def k5():
    u = "q5"
    z, cx, cy = 1.25, 1620, 1170
    w = world(u, show_route=True, route_done=.73, extra=pin(*PIN_AT) + gem(*GEMS[2][2], SKIN, .8, uid=f"{u}p")
              + mascot(*C3, s=1.1, hop=40, squash=1.12)
              + f'<path d="M{C3[0] - 60},{C3[1] - 10} q-20,-40 0,-80" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round" opacity=".5"/>')
    svg = cam(cx, cy, z, w) + banner(count=9) + inventory((True, True, False), active=1)
    svg += badge(330, 1180, 7, u)
    return frame(u, svg)


def k6():
    u = "q6"
    z, cx, cy = 1.9, 1660, 960
    w = world(u, show_route=True, route_done=1, extra=pin(*PIN_AT, squash=.78, ripple=1) + mascot(*TARGET, s=1.2, wave=55))
    svg = cam(cx, cy, z, w) + banner(count=12) + inventory((True, True, True), active=2)
    svg += burst(540, 1430, "¡1 DOCENA!", 66, "#2f9e57")
    svg += badge(980, 1180, 8, u) + badge(170, 520, 9, u)
    return frame(u, svg)


def k7():
    u = "q7"
    z, cx, cy = 2.0, 1680, 960
    rays = "".join(f'<line x1="0" y1="0" x2="{math.cos(a) * 260:.0f}" y2="{math.sin(a) * 260:.0f}" stroke="{GOLD}" stroke-width="10" stroke-linecap="round" opacity=".8"/>'
                   for a in [math.radians(d) for d in range(-160, -10, 25)])
    w = world(u, show_route=True, route_done=1, extra=pin(*PIN_AT) + mascot(TARGET[0] - 50, TARGET[1] + 10, s=1.2, wave=40)
              + f'<g transform="translate({BOX_AT[0]} {BOX_AT[1] - 90})">{rays}</g>'
              + box(*BOX_AT, s=1.0, open_=1, uid=u)
              + "".join(f'<circle cx="{BOX_AT[0] + dx}" cy="{BOX_AT[1] + 4}" r="{r}" fill="#fff" stroke="{INK}" stroke-width="3" opacity=".9"/>' for dx, r in [(-96, 14), (-118, 9), (100, 13), (124, 8)]))
    svg = cam(cx, cy, z, w)
    svg += glint(540 + (BOX_AT[0] - cx) * z, 960 + (BOX_AT[1] - 200 - cy) * z, 90, streak=260, uid=u)
    svg += f'<g opacity=".5">{inventory((True, True, True), active=2, slide=160)}</g>'
    svg += badge(860, 700, 10, u) + badge(220, 1300, 11, u)
    return frame(u, svg)


def loot_card(stat=1.0, stamp=False, uid="c"):
    x, y, w, h = 120, 300, 840, 1300
    clip = f'<clipPath id="lc-{uid}"><rect x="{x + 30}" y="{y + 30}" width="{w - 60}" height="620" rx="24"/></clipPath>'
    out = [f'<defs>{clip}</defs>',
           f'<rect x="{x}" y="{y + 16}" width="{w}" height="{h}" rx="48" fill="{INK}"/>',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="48" fill="{PAPER}" stroke="{INK}" stroke-width="6"/>',
           f'<rect x="{x + 14}" y="{y + 14}" width="{w - 28}" height="{h - 28}" rx="38" fill="none" stroke="{GOLD}" stroke-width="6"/>',
           f'<image href="{HERO}" x="{x + 30}" y="{y - 120}" width="{w - 60}" height="{(w - 60) * 1256 / 600}" clip-path="url(#lc-{uid})" preserveAspectRatio="xMidYMin slice"/>',
           f'<rect x="{x + 50}" y="{y + 50}" width="300" height="56" rx="28" fill="{INK}"/>',
           f'<text x="{x + 200}" y="{y + 88}" text-anchor="middle" font-family="{MONO}" font-size="24" font-weight="700" letter-spacing="3" fill="{GOLD}">✦ LEGENDARIO</text>',
           f'<text x="{x + 50}" y="{y + 730}" font-family="{BRAND}" font-weight="900" font-size="84" fill="{INK}" letter-spacing="-2">PANTY DE <tspan fill="{RED}">RED</tspan></text>',
           f'<rect x="{x + 50}" y="{y + 762}" width="390" height="62" rx="14" fill="{RED}"/>',
           f'<text x="{x + 245}" y="{y + 804}" text-anchor="middle" font-family="{BRAND}" font-weight="800" font-size="34" fill="#fff">MODELO #CK2603L</text>',
           f'<text x="{x + 470}" y="{y + 804}" font-family="{MONO}" font-size="24" font-weight="700" letter-spacing="2" fill="{INK}" opacity=".7">✦ BRILLOS DE DIAMANTE</text>']
    for k, (lab, v) in enumerate([("NYLON", 98), ("SPANDEX", 2)]):
        yy = y + 890 + k * 86
        out.append(f'<text x="{x + 50}" y="{yy}" font-family="{MONO}" font-size="30" font-weight="700" letter-spacing="3" fill="{INK}">{lab}</text>'
                   f'<rect x="{x + 260}" y="{yy - 30}" width="440" height="36" rx="18" fill="#e3d9c8" stroke="{INK}" stroke-width="3"/>'
                   f'<rect x="{x + 263}" y="{yy - 27}" width="{max(10, 434 * v / 100 * stat):.0f}" height="30" rx="15" fill="{RED if k == 0 else GOLD}"/>'
                   f'<text x="{x + w - 50}" y="{yy}" text-anchor="end" font-family="{MONO}" font-size="32" font-weight="700" fill="{INK}">{round(v * stat)}%</text>')
    for k, (n, c, *_r) in enumerate(GEMS):
        out.append(gem(x + 90 + k * 110, y + 1110, c, .7, uid=f"{uid}c{k}", glow=False))
    out.append(f'<text x="{x + 50}" y="{y + 1200}" font-family="{MONO}" font-size="26" font-weight="700" letter-spacing="2" fill="{INK}" opacity=".7">6 + 3 + 3 = 1 DOCENA</text>')
    if stamp:
        out.append(f'<g transform="translate({x + w - 140} {y + 1150}) rotate(-12)"><circle r="150" fill="{INK}" stroke="{GOLD}" stroke-width="10"/>'
                   f'<text y="-6" text-anchor="middle" font-family="{BRAND}" font-weight="900" font-size="104" fill="{GOLD}">×100</text>'
                   f'<text y="56" text-anchor="middle" font-family="{MONO}" font-weight="700" font-size="26" letter-spacing="2" fill="{PAPER}">DOCENAS/CAJA</text></g>')
        out.append(burst(540, 250, "¡ENCONTRADO!", 76, PIN))
    return "".join(out)


def dimmed_map(u, z=2.0, cx=1680, cy=960, dim=.62):
    w = world(u, show_route=True, route_done=1, extra=pin(*PIN_AT) + box(*BOX_AT, open_=1, uid=u) + mascot(TARGET[0] - 50, TARGET[1] + 10, s=1.2))
    return cam(cx, cy, z, w) + f'<rect width="1080" height="1920" fill="{INK}" opacity="{dim}"/>'


def k8():
    u = "q8"
    svg = dimmed_map(u) + loot_card(stat=.55, uid=u)
    svg += badge(980, 1250, 12, u) + badge(120, 420, 13, u)
    return frame(u, svg)


def k9():
    u = "q9"
    svg = dimmed_map(u) + loot_card(stat=1, stamp=True, uid=u)
    svg += badge(980, 1420, 14, u)
    return frame(u, svg)


def k10():
    u = "q10"
    w = world(u, show_route=True, route_done=1, extra=pin(*PIN_AT))
    lw = 640
    svg = (cam(1300, 1400, .5, w) + f'<rect width="1080" height="1920" fill="{PAPER}" opacity=".82"/>'
           f'<image href="{LOGO_N}" x="{540 - lw / 2}" y="560" width="{lw}" height="{lw * LOGO_N_AR:.0f}"/>'
           + mascot(540, 560 + lw * LOGO_N_AR + 150, s=1.4, wave=50)
           + f'<text x="540" y="1340" text-anchor="middle" font-family="{BRAND}" font-weight="600" font-size="38" letter-spacing="7" fill="{NAVY}">ELEGANCIA QUE TE ACOMPAÑA</text>'
           f'<text x="540" y="1410" text-anchor="middle" font-family="{BRAND}" font-weight="800" font-size="42" letter-spacing="3" fill="{RED}">PANTY DE RED · #CK2603L</text>'
           + glint(540 + 70, 610, 50, streak=200, uid=u) + badge(160, 470, 15, u))
    return frame(u, svg)


# ── 分鏡表 ────────────────────────────────────────────────────
SHOTS = [
    dict(n="S1", name="活地圖・接任務", f=(0, 45), frames=[(k1, 22)], energy="引",
         visual="俯瞰 ZOFRI（伊基克自由貿易區）插畫地圖：沙色街廓分三區、各自不同角度，白色街道帶細邊、左側太平洋、薄荷綠公園。車在跑、船在開、雲影飄過——第一格就是活的。任務卡從上方滑入：MISIÓN · ENCUENTRA PANTY DE RED · #CK2603L。",
         motion=["f0 鏡頭由 0.46 緩推到 0.52（臨界阻尼 k24），活動圖層：車沿大道等速、船帶尾跡、三團雲影各自漂",
                 "② f8 任務卡由上方彈入（貼紙風：墨黑硬陰影 +12px），型號晶片最後蓋上",
                 "① f15 目標圖釘從天而降：彈簧 k260／d15，f22 觸地壓扁 0.8 → 回彈，兩圈漣漪擴散"],
         trans="f30 下方收集欄滑上來，畫面同時往 ZOFRI 區推近，直接接 S2",
         sound="f0 輕快 marimba 進拍；f22 圖釘「咚」＋漣漪水聲；f30 UI 滑入「咻」"),
    dict(n="S2", name="尋路", f=(45, 75), frames=[(k2, 58), (k3, 68)], energy="蓄",
         visual="吉祥物在大道上「噗」一聲出生。路網上的交叉點由它開始一圈圈亮起——Dijkstra 演算法正在搜尋，前緣紅、走過的轉墨黑。搜到目標後，最短路線鎖定成虛線，三顆網眼色票落在路上。",
         motion=["③ f45 吉祥物出生：縮放 0 → 1.25 → 1，白色衝擊環擴散",
                 "f48–60 擴散波：交叉點依距離依序點亮（前緣 r12 紅點，後方 r8 墨點淡出）——把演算法畫出來，就是遊戲的「讀取中」",
                 "④ f60 最短路徑鎖定：虛線由起點畫到終點（8 格），三顆收集品依序蹦出來排在路上",
                 "f66 對話泡「¡VAMOS!」彈出，吉祥物預備下蹲（anticipation）"],
         trans="f75 吉祥物起步，鏡頭開始跟——不切鏡，直接進 S3",
         sound="f48 雷達掃描音上行；f60 鎖定「叮叮」；f66 可愛短語音感的「嘿」用合成音高滑音代替"),
    dict(n="S3", name="出發・收集", f=(75, 180), frames=[(k4, 105), (k5, 150)], energy="衝",
         visual="吉祥物沿最短路徑走，前方虛線被一節一節吃掉。每個轉角跳一下，每段中間撿一顆色票：黑 +6、紅 +3、膚 +3。色票沿弧線飛進下方收集欄，白色底板滑到剛收到的那張卡上，右上計數 0 → 6 → 9 → 12。",
         motion=["步伐：起步與到站緩入緩出，中段等速；每步 1/8 拍，身體上下 6px、左右擠壓 0.94 ↔ 1.06",
                 "⑦ 轉角跳躍：f90、f120、f150 三個拍點，拋物線高 70px、離地前壓扁 1.12、空中拉長、落地再壓一次，影子跟著縮放",
                 "⑤ 撿取：f105、f135、f165 三個拍點。凍結 2 格（hit-stop）→ 色票沿弧線飛向收集卡（10 格）→ 卡片狀態由 PENDIENTE 變 LISTO、底板滑過去（彈簧）",
                 "計數器每跳一次就「打一下」：放大 1.25 → 1，數字 +6／+3／+3 的浮字往上飄",
                 "⑥ 鏡頭：臨界阻尼彈簧 k24 同時框住小人和目標，走越近縮放越大（1.0 → 1.25 → 1.6），並在行進方向預留 15% 前視空間"],
         trans="f180 到站，緩停；鏡頭的推近剛好在這一拍到位",
         sound="腳步每 1/8 拍一聲「啵」；轉角「boing」；撿取音 C5 → E5 → G5 一路往上，第三顆湊成大三和弦"),
    dict(n="S4", name="到站・開箱", f=(180, 225), frames=[(k6, 188), (k7, 205)], energy="爆",
         visual="鏡頭推到店門口（屋頂寫 ASATEX）。吉祥物揮手，圖釘再壓一次、漣漪擴散，三張卡全亮——「¡1 DOCENA!」。一只寫著 100 DOC. 的紙箱從天而降，蓋子彈開，金色光束和鑽石光往上噴。",
         motion=["⑧ f180 到站：揮手 3 下（鰭肢繞肩旋轉 ±55°），圖釘第二次壓扁＋漣漪",
                 "⑨ f182 「¡1 DOCENA!」綠色貼紙斜著蓋上，收集欄完成光掃過三張卡",
                 "f185–210 鏡頭推到 2.0（k24 臨界阻尼，不過衝——地圖不能晃）",
                 "⑩ f195 紙箱落下：彈簧 k260／d15，f201 觸地＋塵土四顆＋全片第一次螢幕震動（6px）",
                 "⑪ f210 蓋子兩片彈開，光束 6 道放射，鑽石光（和 v1 同一種 4 芒星）從箱口升起；收集欄往下退場"],
         trans="f225 道具卡從箱子裡翻出來，蓋滿畫面，地圖壓暗留在後面",
         sound="f180 到站鐘聲；f201 紙箱悶響；f210 寶箱開啟的上行閃光琶音"),
    dict(n="S5", name="道具卡", f=(225, 270), frames=[(k8, 245), (k9, 262)], energy="峰",
         visual="遊戲道具卡：上半部是主視覺腿部照片，金邊框、「✦ LEGENDARIO」稀有度標籤。下面是產品名、紅色型號牌、BRILLOS DE DIAMANTE。屬性條：NYLON 98、SPANDEX 2——成分就是道具屬性。三顆色票排成一列：6 + 3 + 3 = 12。最後「×100 DOCENAS/CAJA」徽章像堆疊數量一樣蓋上，頂端「¡ENCONTRADO!」。",
         motion=["⑫ f225 道具卡從箱口翻出：Y 軸 90° → 0°、由小放大，金邊框描一圈光",
                 "f236 文字逐層進場：名稱 → 型號牌 → 鑽石標籤，每層錯開 3 格",
                 "⑬ f240 屬性條灌滿：NYLON 0 → 98（12 格），SPANDEX 0 → 2，數字跟著跳",
                 "⑭ f255 全片最大的一拍：×100 徽章蓋章（1.6 → 1、旋轉 -20° → -12°、凍結 2 格、震動 10px）；f258 「¡ENCONTRADO!」貼紙彈上頂端"],
         trans="f270 道具卡縮小飛向畫面上方，鏡頭同時拉遠到整張地圖",
         sound="f225 卡片翻面「唰」；f240 屬性條灌滿的上行掃頻；f255 重擊＋金幣聲＋短號角"),
    dict(n="S6", name="過關", f=(270, 300), frames=[(k10, 290)], energy="收",
         visual="地圖拉遠成全景，走過的路線變成一條實線留在地圖上，整張地圖被米白紙蓋住大半。ASAHI LTDA ZOFRI 圓形 LOGO 落在中央，吉祥物從下方跳上來揮手（地圖上的角色走進品牌裡）。標語與型號。",
         motion=["f270 鏡頭從 2.0 拉遠到 0.5（臨界阻尼，最後 6 格才收），米白紙層淡入 82%",
                 "f274 LOGO 1.12 → 1 彈性落定；f278 吉祥物從畫面下方跳進來，落地壓扁後揮手",
                 "⑮ f284 標語字距收合進場；f290 LOGO 上一顆鑽石光收尾，最後 8 格靜止"],
         trans="結尾",
         sound="f274 過關短旋律（大三和弦琶音）；f290 叮，殘響到結尾"),
]


def timeline():
    W, H, top = 1000, 190, 34
    px = W / 300
    col = {"引": "#6b7c8f", "蓄": "#6b5a3c", "衝": "#b0623a", "爆": RED, "峰": RED, "收": "#9a8a6a"}
    s = [f'<svg viewBox="0 0 {W} {H}" class="tl" role="img" aria-label="十秒節奏圖">']
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
    marks = {"hop": [90, 120, 150], "pick": [105, 135, 165], "big": [22, 201, 255], "beat": [8, 30, 45, 60, 66, 180, 210, 225, 240, 274, 290]}
    for f in marks["beat"]:
        s.append(f'<path d="M{f * px:.1f},{top + 52} l-5,9 h10z" fill="currentColor" fill-opacity=".5"/>')
    for f in marks["hop"]:
        s.append(f'<path d="M{f * px:.1f},{top + 50} q6,-10 12,0" transform="translate(-6 8)" fill="none" stroke="currentColor" stroke-width="2"/>')
    for f in marks["pick"]:
        s.append(f'<path d="M{f * px:.1f},{top + 50} l7,7 l-7,7 l-7,-7z" fill="#2f9e57"/>')
    for f in marks["big"]:
        s.append(f'<path d="M{f * px:.1f},{top + 50} l-9,15 h18z" fill="{RED}"/>')
    pts = [(0, .3), (22, .55), (45, .4), (60, .6), (75, .5), (105, .68), (135, .76), (165, .85), (180, .9), (201, .95),
           (225, .8), (255, 1), (270, .5), (299, .3)]
    y0, hh = H - 8, 66
    d = " ".join(f"{'M' if i == 0 else 'L'}{f * px:.1f},{y0 - v * hh:.1f}" for i, (f, v) in enumerate(pts))
    s.append(f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="2.5" stroke-linejoin="round"/><text x="4" y="{y0 - hh - 4}" class="tl-t">張力</text></svg>')
    return "".join(s)


def shot_html(sh):
    a, b = sh["f"]
    thumbs = "".join(f'<figure><div class="thumb">{fn()}</div><figcaption>f{f} · {f / FPS:.2f}s</figcaption></figure>' for fn, f in sh["frames"])
    li = "".join(f"<li>{m}</li>" for m in sh["motion"])
    return f'''<article class="shot"><header><span class="sn">{sh["n"]}</span><h3>{sh["name"]}</h3>
<span class="time">{a / FPS:.1f}–{b / FPS:.1f}s · f{a}–{b - 1} · 第 {a // BEAT + 1}–{b // BEAT} 拍 · {(b - a) / FPS:.1f}s</span></header>
<div class="body"><div class="thumbs">{thumbs}</div><dl><dt>畫面</dt><dd>{sh["visual"]}</dd><dt>動態</dt><dd><ul>{li}</ul></dd>
<dt>轉場</dt><dd>{sh["trans"]}</dd><dt>聲音</dt><dd>{sh["sound"]}</dd></dl></div></article>'''


MAPPING = [
    ("瑞士製圖風：米白紙 #F4EFE6＋細顆粒、沙色街廓 #EADFCF、白街細邊 #D9CFBF、薄荷公園 #BFE3C3", "整張遊戲世界", "採用"),
    ("三組旋轉街網", "PUERTO −14°／ZOFRI 0°／CENTRO 22° 三區", "採用"),
    ("彎曲河流＋橋", "改成太平洋海岸＋碼頭——伊基克是港市，沒有河", "改編"),
    ("Geist Mono 小字大寫地名", "地名與 HUD 數字", "採用"),
    ("番茄紅圖釘 #FF5A3C 描墨邊", "改用產品紅 #d81f26，維持品牌色；墨邊保留", "改編"),
    ("圖釘彈簧落下 k260／d15、壓扁、漣漪", "S1 標出目標店面、S4 到站再壓一次；紙箱落地同一組彈簧", "採用"),
    ("小人走 Dijkstra 最短路徑，緩入緩出、轉角跳、前方虛線、到站揮手", "主角換成 ASATEX 吉祥物；搜尋過程畫出來當「讀取」", "採用"),
    ("鏡頭框住小人與目標、到站推近（臨界阻尼 k24）", "S3–S4 鏡頭；S6 反向拉遠", "採用"),
    ("車在跑、船在開、雲影飄", "整片背景活動圖層", "採用"),
    ("三張辦公室卡＋白色底板滑到目前那張；Open／Closed", "三張色票收集卡（NEGRO 6／ROJO 3／PIEL 3），狀態 PENDIENTE／LISTO", "改編"),
    ("Bricolage Grotesque 800 大字", "遊戲層標題（MISIÓN、¡VAMOS!、¡ENCONTRADO!）；產品資訊仍用 Montserrat", "採用"),
    ("靜態城市快取成點陣圖、活動層疊上去", "製作時同樣做法：城市先算繪一次成圖，只動角色、車、船、雲、HUD", "採用"),
    ("hover／點擊、拖曳慣性、每 4–5 秒巡迴、Intl 時區、DPR 上限、離開畫面暫停、減少動態", "影片沒有互動與即時時間", "不適用"),
    ("North Studio 字標、地址、email、© 列", "影片裡沒有對應內容", "不適用"),
]
GAME_TO_PRODUCT = [
    ("任務目標", "MODELO #CK2603L", "批發買家本來就是拿型號找貨"),
    ("三顆收集品", "NEGRO／ROJO／PIEL 三色", "每撿一顆就是看一次顏色"),
    ("計數器 0 → 12", "每打 6 + 3 + 3", "數字跳動本身就在教配色比例"),
    ("寶箱", "100 DOCENAS POR CAJA", "開箱＝一箱的量"),
    ("道具屬性條", "98% NYLON · 2% SPANDEX", "成分變成可以「比較」的屬性"),
    ("稀有度 LEGENDARIO", "CON BRILLOS DE DIAMANTE", "賣點變成稀有度"),
    ("關卡地點", "ZOFRI 伊基克自由貿易區", "取自新 LOGO 的 ASAHI LTDA ZOFRI"),
]


def build():
    rows = "".join(f'<tr><td>{a}</td><td>{b}</td><td><span class="st {"ok" if c == "採用" else "warn" if c == "改編" else "cut"}">{c}</span></td></tr>' for a, b, c in MAPPING)
    g2p = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>" for a, b, c in GAME_TO_PRODUCT)
    shots = "".join(shot_html(s) for s in SHOTS)
    pal = "".join(f'<div><i style="background:{h}"></i><p><b>{n}</b><br><code>{h}</code><br>{u}</p></div>' for h, n, u in [
        (PAPER, "紙", "地圖底、HUD 卡"), (SAND, "街廓", "建築"), (CASING, "街邊", "白街的細邊"), (WATER, "海", "太平洋"),
        (PARK, "公園", "綠地"), (PIN, "產品紅", "圖釘、浮字"), (RED, "ASATEX 紅", "型號、屋頂"), (INK, "墨", "描邊、硬陰影"), (GOLD, "香檳金", "稀有度、光")])
    mascot_demo = (f'<svg viewBox="-120 -250 760 290" class="cast" role="img" aria-label="吉祥物四個姿勢">'
                   f'{mascot(0, 0, 1.2)}{mascot(170, 0, 1.2, squash=.82)}{mascot(340, 0, 1.2, hop=60, squash=1.14)}{mascot(510, 0, 1.2, wave=55)}'
                   + "".join(f'<text x="{x}" y="34" text-anchor="middle" font-family="{MONO}" font-size="16" fill="{INK}">{t}</text>' for x, t in [(0, "站立"), (170, "預備・壓扁"), (340, "跳躍・拉長"), (510, "揮手")])
                   + "</svg>")
    props = (f'<svg viewBox="-80 -140 820 180" class="cast" role="img" aria-label="道具">{pin(0, 20, .9)}{pin(130, 20, .9, squash=.78, ripple=1)}'
             f'{gem(280, -30, INK, 1, "pa")}{gem(380, -30, RED_HI, 1, "pb")}{gem(480, -30, SKIN, 1, "pc")}{box(610, 20, .8, 0.6, "pd")}</svg>')
    css = CSS + f""".cast{{width:100%;max-width:760px;height:auto;display:block;background:{PAPER};border:1px solid var(--line);border-radius:8px;margin:10px 0}}
table.map td:first-child{{width:auto}} .g2p td{{vertical-align:top}}
h1{{font-family:'Bricolage Grotesque',Montserrat,sans-serif}}"""
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PANTY DE RED 遊戲版分鏡</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Geist+Mono:wght@400;600;700&family=Montserrat:wght@300;600;700;800;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">
<style>{css}</style></head><body><main>
<div class="kicker">ASATEX · GAME MOTION STORYBOARD · v1 待確認</div>
<h1>¿DÓNDE ESTÁ<br>PANTY DE <em>RED</em>?</h1>
<ul class="meta"><li>9:16 · 1080×1920</li><li>30 fps · 300 格</li><li>120 BPM</li><li>6 鏡 · 10 個關鍵格</li><li>3 跳 · 3 撿 · 3 重拍</li></ul>

<h2>想法匯集 <small>IDEAS</small></h2>
<p class="lead">我把你貼的英文規格（North Studio 頁尾的活地圖）當成<b>這支片的遊戲世界</b>，中文指示才是任務本身。
那份規格裡最有遊戲感的東西——彈簧圖釘、走最短路徑的小人、跟著跑的鏡頭、會動的城市——剛好可以變成一個「找貨」關卡。</p>
<div class="insight">遊戲設計的關鍵：<b>每一個遊戲機制都要背一個產品事實</b>。批發買家本來就在「找型號、湊一打、確認一箱多少」，
這支片把這件事做成一場任務 —— 玩法不是裝飾，是把規格送進眼睛的方式。</div>
<table class="g2p"><tr><td><b>遊戲機制</b></td><td><b>對應產品資訊</b></td><td><b>為什麼成立</b></td></tr>{g2p}</table>

<h3>參考規格怎麼用（逐項）</h3>
<table class="map"><tr><td><b>參考規格</b></td><td><b>在這支片裡</b></td><td></td></tr>{rows}</table>

<h2>角色與道具 <small>CAST</small></h2>
<p>吉祥物依 ASAHI LTDA ZOFRI LOGO 上的紅色海獅＋水手帽，重畫成可以動的貼紙風向量角色（墨色描邊、四個基本姿勢）。<b>這是品牌角色，要你點頭才能用</b>——見最後「待你確認」。</p>
{mascot_demo}
<p>道具：目標圖釘（落地壓扁＋漣漪）、三顆網眼色票、100 打紙箱。</p>
{props}
<h3>色票</h3><div class="pal">{pal}</div>
<div class="type">
<div><b style="font:800 30px 'Bricolage Grotesque',sans-serif">¡ENCONTRADO!</b><br>Bricolage Grotesque 800 —— 遊戲層：任務、對話泡、過關</div>
<div><b style="font:700 22px 'Geist Mono',monospace;letter-spacing:.12em">ZOFRI · 6/12</b><br>Geist Mono —— 地名、HUD 數字、狀態</div>
<div><b style="font:900 26px Montserrat">PANTY DE RED</b><br>Montserrat 900 —— 產品層：與 v1 一致，產品資訊永遠用這套</div>
</div>

<h2>節奏圖 <small>BEAT MAP</small></h2>
{timeline()}
<div class="legend"><span><b style="color:{RED}">▲</b> 重拍：f22 圖釘、f201 紙箱、f255 ×100</span><span>⌒ 轉角跳</span><span><b style="color:#2f9e57">◆</b> 撿取</span><span>▲ 一般拍點</span></div>
<p>遊戲節奏的核心是<b>每一拍都有一件事</b>：S3 裡轉角跳（f90/120/150）和撿取（f105/135/165）交錯，三秒半裡每半秒一個回饋。三個重拍分給「開始」「到手」「規格」。</p>

<h2>分鏡 <small>SHOTS</small></h2>
<p><span class="note">藍色編號</span>是動態註記，對應各鏡「動態」欄的圈號，不會出現在成片裡。</p>
{shots}

<h2>遊戲手感 <small>GAME FEEL</small></h2>
<div class="rules">
<div><b>彈簧（沿用參考規格的數值）</b><ul><li>圖釘、紙箱、徽章：k260／d15 —— 有彈性、會過衝</li><li>鏡頭：k24 臨界阻尼（d ≈ 9.8）—— 跟得上但絕不晃，地圖晃會暈</li></ul></div>
<div><b>打擊感</b><ul><li>撿取與蓋章凍結 2 格（hit-stop）</li><li>震動只有兩次：紙箱落地 6px、×100 蓋章 10px</li><li>每次數字變動都「打一下」：1.25 → 1</li></ul></div>
<div><b>角色</b><ul><li>預備 → 動作 → 收尾：起跳前壓扁、空中拉長、落地再壓</li><li>影子跟高度縮放，跳躍才有「離地」的感覺</li><li>鏡頭在行進方向留 15% 前視空間</li></ul></div>
<div><b>聲音回饋</b><ul><li>撿取音 C → E → G 往上爬，第三顆剛好湊成和弦 —— 耳朵也在數</li><li>腳步每 1/8 拍，轉角「boing」落在拍上</li></ul></div>
<div class="no"><b>不做</b><ul><li>不加血條、分數、計時器等和產品無關的遊戲元素</li><li>不讓地圖旋轉、不做 3D 視角 —— 製圖風要平</li><li>產品文字不用遊戲字體</li></ul></div>
</div>

<h2>待你確認 <small>DECISIONS</small></h2>
<div class="q">
<div><b>英文那段我理解成「風格參考」，不是要我做 North Studio 頁尾，對嗎？</b><span>如果你其實也要那個網頁頁尾，告訴我，那是另一件獨立的工作。</span></div>
<div><b>吉祥物可以重畫成會動的角色嗎？</b><span>依 LOGO 上的紅海獅＋水手帽重畫（上面「角色」那排）。這是品牌角色，造型若有官方設定稿請給我，我照稿畫。</span></div>
<div><b>地點用 ZOFRI（伊基克）可以嗎？</b><span>取自新 LOGO 的「ASAHI LTDA ZOFRI」。地圖是插畫風格的示意，不是真實街道，也不標任何真實地址。</span></div>
<div><b>圖釘用產品紅 #d81f26，不用參考規格的番茄紅？</b><span>番茄紅偏橘，和 ASATEX 的紅放在同一畫面會打架。</span></div>
<div><b>比例、配樂照 v1：直式 9:16、程式合成配樂（這次改成輕快的遊戲感 marimba）？</b><span>其他沿用上一支的設定，確認後直接出 MP4。</span></div>
</div>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
