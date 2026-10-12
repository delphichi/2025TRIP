#!/usr/bin/env python3
"""《每次都說明天開始的男孩》90 秒紙雕動畫 —— 分鏡腳本產生器。

16:9（1920×1080）。紙雕零件沿用 living-system/build_storyboard.py（分層投影、切口受光、紙纖維），
這支另外加上「光」：午後斜射的光束、夜裡的冷光、檯燈的暖光、清晨的金光——參考圖迷人的地方就在光。

    python3 tomorrow/build_storyboard.py  →  tomorrow/分鏡腳本.html
"""
import importlib.util
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("paper", HERE.parent / "living-system" / "build_storyboard.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)
cut, badge, arrow = P.cut, P.badge, P.arrow
SERIF = P.SERIF

OUT = HERE / "分鏡腳本.html"
W, H = 1920, 1080
FPS = 24

# ── 色票：取自參考圖的光與材質（淡藍灰牆、暖木、橘紅點綴）──────
WALL = "#D9E1DF"
WALL2 = "#C3CDCB"
CEIL = "#E8E3D8"
FLOOR = "#9C8068"
FLOOR2 = "#86694F"
WOOD = "#D8B88A"
WOOD2 = "#B48E66"
BED = "#3E4352"
BLANKET = "#E9E2D3"
ORANGE = "#E0663A"
MUSTARD = "#D9B44A"
INK = "#2A2522"
PAPER = "#FBF7F0"
CALRED = "#D6453A"
HOODIE = "#4F7FA6"
SKIN = "#F2D4B0"
HAIR = "#3B2A20"
SAGE = "#8FA98B"
NOTE = "#1f7ae0"


# ── 基本：畫布、光、紙纖維 ────────────────────────────────────
def defs(u):
    return (P.defs(u)[:-7]
            + f'<filter id="soft-{u}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>'
            f'<linearGradient id="beam-{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9B8" stop-opacity=".95"/><stop offset="1" stop-color="#FFD58A" stop-opacity=".15"/></linearGradient>'
            f'<linearGradient id="dawn-{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD1A6" stop-opacity=".95"/><stop offset="1" stop-color="#FFB98A" stop-opacity=".12"/></linearGradient>'
            f'<linearGradient id="moon-{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFD3FF" stop-opacity=".55"/><stop offset="1" stop-color="#9DB6E8" stop-opacity=".05"/></linearGradient>'
            f'<radialGradient id="lamp-{u}"><stop offset="0" stop-color="#FFE2A0" stop-opacity=".95"/><stop offset=".45" stop-color="#FFC970" stop-opacity=".35"/><stop offset="1" stop-color="#FFC970" stop-opacity="0"/></radialGradient>'
            "</defs>")


def finish(u):
    return (f'<rect width="{W}" height="{H}" filter="url(#fiber-{u})" style="mix-blend-mode:multiply" opacity=".28"/>'
            f'<rect width="{W}" height="{H}" fill="url(#vig-{u})"/>')


def frame(u, body, bg=WALL):
    return (f'<div class="frame" style="background:{bg}"><svg viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'{defs(u)}{body}{finish(u)}</svg></div>')


def light(u, mode):
    """整格的光：day 午後斜陽、night 夜、lamp 夜＋檯燈、dawn 清晨、dim 白天但被紙堆遮暗。"""
    beam = "M45,190 L232,236 L1080,972 L540,1000Z"
    patch = "M560,770 L990,760 L1090,990 L520,1000Z"
    out = ""
    if mode in ("day", "dim"):
        out += f'<path d="{beam}" fill="url(#beam-{u})" filter="url(#soft-{u})" style="mix-blend-mode:screen" opacity="{.75 if mode == "day" else .35}"/>'
        out += f'<path d="{patch}" fill="#FFE6B0" filter="url(#soft-{u})" style="mix-blend-mode:screen" opacity="{.45 if mode == "day" else .2}"/>'
        if mode == "dim":
            out += f'<rect width="{W}" height="{H}" fill="#5a4a3a" style="mix-blend-mode:multiply" opacity=".35"/>'
    elif mode == "dawn":
        out += f'<path d="M45,200 L232,250 L1180,920 L660,960Z" fill="url(#dawn-{u})" filter="url(#soft-{u})" style="mix-blend-mode:screen" opacity=".8"/>'
        out += f'<rect width="{W}" height="{H}" fill="#FFD9B8" style="mix-blend-mode:multiply" opacity=".18"/>'
    elif mode in ("night", "lamp"):
        out += f'<rect width="{W}" height="{H}" fill="#1d2a45" style="mix-blend-mode:multiply" opacity=".62"/>'
        out += f'<path d="{beam}" fill="url(#moon-{u})" filter="url(#soft-{u})" style="mix-blend-mode:screen" opacity=".55"/>'
        if mode == "lamp":
            out += f'<ellipse cx="600" cy="580" rx="460" ry="330" fill="url(#lamp-{u})" style="mix-blend-mode:screen" opacity=".7"/>'
    return out


# ── 房間（單點透視的紙模型）────────────────────────────────────
def room(u, books_on_desk=True, guitar=True, shoes=True, diary=True, window_sky="#F6E7C8"):
    o = []
    o.append(cut("M-80,-20 H2000 L1620,90 L300,90Z", CEIL, 1, u))
    o.append(cut("M300,90 H1620 V700 H300Z", WALL, 1, u))
    o.append(cut("M-80,-20 L300,90 L300,700 L-80,1100Z", WALL2, 2, u))
    o.append(cut("M1620,90 L2000,-20 L2000,1100 L1620,700Z", WALL2, 2, u))
    o.append(cut("M300,700 H1620 L2000,1100 H-80Z", FLOOR, 1, u))
    for k in range(1, 9):  # 地板木紋
        x0 = 300 + k * 1320 / 9
        x1 = -80 + k * 2080 / 9
        o.append(f'<path d="M{x0:.0f},700 L{x1:.0f},1100" stroke="{FLOOR2}" stroke-width="3" opacity=".6"/>')
    # 窗（左牆）
    o.append(cut("M40,180 L232,232 L232,522 L40,562Z", window_sky, 2, u))
    o.append(f'<path d="M40,180 L232,232 L232,522 L40,562Z M136,206 L136,542 M40,370 L232,377" fill="none" stroke="{PAPER}" stroke-width="12"/>')
    # 後牆：層架、海報
    o.append(cut("M420,300 H760 V318 H420Z", PAPER, 2, u))
    for k, (c, h) in enumerate([(CALRED, 70), (SAGE, 82), (MUSTARD, 64), (HOODIE, 76), (WOOD2, 70)]):
        o.append(cut(f"M{440 + k * 34},300 V{300 - h} H{468 + k * 34} V300Z", c, 1, u))
    o.append(cut("M880,330 H1220 V540 H880Z", "#2F4A5E", 2, u))
    o.append(cut("M900,520 L980,420 L1040,480 L1100,400 L1200,520Z", MUSTARD, 1, u))
    o.append(f'<circle cx="1150" cy="380" r="22" fill="{PAPER}" opacity=".8"/>')
    # 床（右後）
    o.append(cut("M1120,600 H1600 V780 H1120Z", WOOD, 3, u))
    o.append(cut("M1130,560 H1590 V640 H1130Z", BED, 3, u))
    o.append(cut("M1300,540 H1600 V650 H1300Z", BLANKET, 3, u))
    o.append(cut("M1140,520 Q1160,490 1230,500 Q1270,520 1250,560 H1150Z", PAPER, 3, u))
    o.append(cut("M1160,690 H1290 V730 H1160Z M1420,690 H1550 V730 H1420Z", WOOD2, 2, u))
    # 書桌（左前）
    o.append(cut("M400,640 H880 V676 H400Z", WOOD, 3, u))
    o.append(cut("M420,676 H446 V900 H420Z M834,676 H860 V900 H834Z", WOOD2, 3, u))
    o.append(cut("M700,676 H834 V780 H700Z", WOOD, 3, u))
    o.append(cut("M752,720 H784 V734 H752Z", MUSTARD, 1, u))
    # 檯燈
    o.append(cut("M470,640 H530 V628 H470Z", PAPER, 3, u))
    o.append(f'<g filter="url(#d3-{u})" stroke="{PAPER}" stroke-width="9" fill="none" stroke-linecap="round"><path d="M500,630 L470,520 L560,470"/></g>')
    o.append(cut("M540,450 L620,470 L600,520 L520,500Z", PAPER, 3, u))
    if books_on_desk:
        o.append(cut("M600,640 L760,640 L752,622 L608,622Z", PAPER, 3, u))
        o.append(cut("M604,622 H756 V614 H604Z", HOODIE, 3, u))
    if diary:
        o.append(cut("M780,640 L860,640 L854,628 L786,628Z", ORANGE, 3, u))
    if guitar:
        o.append(f'<g transform="rotate(-12 1720 760)">'
                 + cut("M1700,420 H1740 V640 H1700Z", WOOD2, 3, u)
                 + cut("M1720,640 m-70,0 a70,80 0 1 0 140,0 a70,80 0 1 0 -140,0Z M1720,780 m-90,0 a90,95 0 1 0 180,0 a90,95 0 1 0 -180,0Z", ORANGE, 3, u)
                 + f'<circle cx="1720" cy="720" r="22" fill="{INK}"/></g>')
    if shoes:
        o.append(cut("M540,940 q10,-34 60,-30 l40,14 q30,4 30,22 Z M640,948 q10,-30 56,-28 l40,12 q28,6 28,22 Z", PAPER, 3, u))
    return "".join(o)


# ── 角色 ──────────────────────────────────────────────────────
def zhe(x, y, s, u, pose="stand", face="open", rot=0):
    """小哲：剪紙人偶（肩肘兩腳釘）。pose：stand / sit / point / reach / write。原點在腳底。"""
    a = {"stand": (-105, -95), "sit": (-60, -10), "point": (20, 10), "reach": (100, 95), "write": (-40, 20), "hug": (-60, 20)}[pose]
    seated = pose in ("sit", "write")
    out = [f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">']
    if not seated:
        out.append(cut("M-32,0 V-120 H-6 V0Z", "#3A3A44", 2, u) + cut("M6,0 V-120 H32 V0Z", "#3A3A44", 2, u))
        out.append(cut("M-42,0 H-4 V-14 H-42Z", PAPER, 2, u) + cut("M4,0 H42 V-14 H4Z", PAPER, 2, u))
    by = -10 if seated else -120
    out.append(f'<g transform="translate(0 {by})">')
    out.append(cut("M-60,0 Q-66,-120 -46,-170 L46,-170 Q66,-120 60,0Z", HOODIE, 3, u))
    out.append(cut("M-30,-170 Q0,-140 30,-170Z", "#3E6A92", 3, u))
    for side in (-1, 1):
        b1, b2 = a if side < 0 else (180 - a[0], 180 - a[1])
        if pose == "point" and side > 0:
            b1, b2 = (-75, -90)
        sx, sy = side * 44, -150
        ex, ey = sx + 68 * math.cos(math.radians(b1)), sy - 68 * math.sin(math.radians(b1))
        hx, hy = ex + 62 * math.cos(math.radians(b2)), ey - 62 * math.sin(math.radians(b2))
        def strip(ax, ay, bx, by_, w=24):
            nx, ny = -(by_ - ay), bx - ax
            L = math.hypot(nx, ny) or 1
            nx, ny = nx / L * w / 2, ny / L * w / 2
            return f"M{ax + nx:.0f},{ay + ny:.0f} L{bx + nx:.0f},{by_ + ny:.0f} L{bx - nx:.0f},{by_ - ny:.0f} L{ax - nx:.0f},{ay - ny:.0f}Z"
        out.append(cut(strip(sx, sy, ex, ey), HOODIE, 3, u) + cut(strip(ex, ey, hx, hy, 20), HOODIE, 3, u))
        out.append(cut(f"M{hx + 14},{hy} A14,14 0 1 0 {hx - 14},{hy} A14,14 0 1 0 {hx + 14},{hy}Z", SKIN, 3, u))
        out.append(f'<circle cx="{sx}" cy="{sy}" r="5.5" fill="#C9A24A"/><circle cx="{ex:.0f}" cy="{ey:.0f}" r="5.5" fill="#C9A24A"/>')
    out.append(cut("M-6,-170 V-184 H6 V-170Z", SKIN, 2, u))
    out.append(cut("M50,-246 A50,56 0 1 0 -50,-246 A50,56 0 1 0 50,-246Z", SKIN, 3, u))
    # 亂翹的短髮
    out.append(cut("M-56,-240 Q-64,-300 -20,-312 L-8,-328 L4,-310 L22,-326 L28,-306 Q66,-300 56,-246 L44,-262 Q20,-284 -14,-276 Q-40,-268 -44,-236Z", HAIR, 3, u))
    if face == "open":
        out.append(f'<circle cx="-16" cy="-244" r="5.5" fill="{INK}"/><circle cx="18" cy="-244" r="5.5" fill="{INK}"/>'
                   f'<path d="M-8,-216 Q2,-208 12,-216" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    elif face == "tired":
        out.append(f'<path d="M-24,-242 h14 M10,-242 h14" stroke="{INK}" stroke-width="5" stroke-linecap="round"/><path d="M-6,-214 h14" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    elif face == "shock":
        out.append(f'<circle cx="-16" cy="-246" r="8" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="18" cy="-246" r="8" fill="#fff" stroke="{INK}" stroke-width="3"/>'
                   f'<circle cx="-16" cy="-246" r="3" fill="{INK}"/><circle cx="18" cy="-246" r="3" fill="{INK}"/><ellipse cx="2" cy="-214" rx="8" ry="10" fill="{INK}"/>')
    elif face == "smile":
        out.append(f'<path d="M-24,-246 q8,-8 16,0 M10,-246 q8,-8 16,0" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
                   f'<path d="M-12,-220 Q2,-206 16,-220" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    out.append("</g></g>")
    return "".join(out)


def cal(x, y, s, u, rot=0, text="明天", depth=2):
    """一張桌曆紙：紅色頁首＋字。"""
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            + cut("M-36,-44 H36 V44 H-36Z", PAPER, depth, u)
            + cut("M-36,-44 H36 V-24 H-36Z", CALRED, 1, u)
            + f'<circle cx="-16" cy="-34" r="3" fill="{PAPER}"/><circle cx="16" cy="-34" r="3" fill="{PAPER}"/>'
            + (f'<text x="0" y="16" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="{26 if len(text) <= 2 else 15}" fill="{INK}">{text}</text>' if text and "/" not in text else "")
            + ("".join(f'<text x="0" y="{4 + k * 22}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="{17 if k else 20}" fill="{INK}">{ln}</text>'
                       for k, ln in enumerate(text.split("/"))) if "/" in text else "")
            + "</g>")


def mister(x, y, s, u, pages=12, open_=0.0, bend=0, face="smile", arm="down", hat=True):
    """明天先生：日曆摺成的紙人。pages 越多身體越高；open_ 打開胸前那頁露出紙條；bend 頭撞到天花板時彎下來。"""
    bh = 60 + pages * 12
    o = [f'<g transform="translate({x} {y}) scale({s})">']
    # 摺紙腿（之字形）
    for lx in (-40, 40):
        o.append(f'<path d="M{lx},0 l-14,-20 l28,-20 l-28,-20 l28,-20 l-14,-20" fill="none" stroke="{PAPER}" stroke-width="20" stroke-linejoin="round" filter="url(#d2-{u})"/>')
        o.append(f'<path d="M{lx},0 l-14,-20 l28,-20 l-28,-20 l28,-20 l-14,-20" fill="none" stroke="{CALRED}" stroke-width="3" stroke-linejoin="round" opacity=".6"/>')
    # 身體：一疊日曆
    top = -100 - bh
    o.append(cut(f"M-90,-100 V{top} H90 V-100Z", PAPER, 3, u))
    for k in range(int(pages)):
        yy = -100 - (k + 1) * (bh / pages)
        o.append(f'<path d="M-90,{yy:.0f} H90" stroke="{INK}" stroke-opacity=".12" stroke-width="2"/>')
    # 胸前那頁（可打開）
    fx = -70
    fw = 140 * (1 - open_ * 0.85)
    o.append(cut(f"M{fx},{top + 30} H{fx + fw:.0f} V{top + 200} H{fx}Z", PAPER, 3, u))
    o.append(cut(f"M{fx},{top + 30} H{fx + fw:.0f} V{top + 64} H{fx}Z", CALRED, 2, u))
    if open_ < 0.3:
        o.append(f'<text x="0" y="{top + 58}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="24" fill="{PAPER}">十月</text>'
                 f'<text x="0" y="{top + 168}" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="900" font-size="92" fill="{INK}">13</text>')
    else:
        notes = ["開始讀書", "每天運動", "早點睡覺", "學好英文", "整理房間"]
        for k, t in enumerate(notes):
            o.append(f'<g transform="translate({-20 + (k % 2) * 10} {top + 90 + k * 34}) rotate({(-4, 3, -2, 4, -3)[k]})">'
                     + cut("M0,-22 H150 V8 H0Z", "#FFF6D6", 2, u)
                     + f'<text x="10" y="1" font-family="{SERIF}" font-weight="700" font-size="22" fill="{INK}">{t}</text></g>')
    # 手臂
    arm_d = {"down": "M-90,{t} l-40,60 l-10,70", "up": "M90,{t} l50,-60 l20,-70", "open": "M90,{t} l70,10 l60,-20"}
    o.append(f'<path d="{arm_d["down"].format(t=top + 60)}" fill="none" stroke="{PAPER}" stroke-width="22" stroke-linejoin="round" filter="url(#d2-{u})"/>')
    o.append(f'<path d="{arm_d[arm if arm != "down" else "down"].format(t=top + 60).replace("M-90", "M90").replace("l-40,60 l-10,70", "l40,60 l10,70") if arm == "down" else arm_d[arm].format(t=top + 60)}" fill="none" stroke="{PAPER}" stroke-width="22" stroke-linejoin="round" filter="url(#d2-{u})"/>')
    # 頭（彎腰時繞頸部旋轉）
    o.append(f'<g transform="rotate({bend} 0 {top})">')
    o.append(cut(f"M-60,{top} V{top - 120} H60 V{top}Z", PAPER, 3, u))
    o.append(cut(f"M-60,{top - 120} H60 V{top - 96} H-60Z", CALRED, 2, u))
    o.append(f'<circle cx="-28" cy="{top - 108}" r="5" fill="{PAPER}"/><circle cx="28" cy="{top - 108}" r="5" fill="{PAPER}"/>')
    if face == "smile":
        o.append(f'<circle cx="-22" cy="{top - 62}" r="7" fill="{INK}"/><circle cx="22" cy="{top - 62}" r="7" fill="{INK}"/>'
                 f'<path d="M-34,{top - 80} l20,-6 M34,{top - 80} l-20,-6" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
                 f'<path d="M-20,{top - 34} Q0,{top - 20} 20,{top - 34}" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>')
    else:
        o.append(f'<circle cx="-22" cy="{top - 60}" r="7" fill="{INK}"/><circle cx="22" cy="{top - 60}" r="7" fill="{INK}"/>'
                 f'<path d="M-16,{top - 28} Q0,{top - 38} 16,{top - 28}" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>')
    if hat:
        o.append(cut(f"M-74,{top - 118} L0,{top - 214} L74,{top - 118}Z", "#EDE5D5", 3, u))
        o.append(f'<text x="0" y="{top - 140}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="34" fill="{CALRED}">明天</text>')
    o.append("</g></g>")
    return "".join(o)


def mountain(u, level=1.0, seed=3):
    """日曆紙山：level 0–1 決定堆多高。"""
    r = random.Random(seed)
    top = 1020 - 620 * level
    d = f"M-60,1100 L-60,{top + 320} Q300,{top + 60} 700,{top} Q1100,{top - 20} 1400,{top + 140} Q1700,{top + 260} 1980,{top + 300} L1980,1100Z"
    out = [cut(d, "#F1EADB", 3, u)]
    for k in range(int(70 * level)):
        x = r.uniform(-20, 1940)
        yy = r.uniform(top + 40, 1080)
        if yy < top + (abs(x - 700) / 900) * 260:
            continue
        out.append(cal(x, yy, r.uniform(.7, 1.15), u, r.uniform(-35, 35),
                       r.choice(["明天", "明天", "下週", "星期一", "星期三", "明天", ""]), 3))
    return "".join(out)


def box(x, y, label, color, u, items=2):
    out = [cut(f"M{x - 130},{y} V{y - 150} H{x + 130} V{y}Z", "#D9B98E", 3, u),
           cut(f"M{x - 130},{y - 150} L{x - 160},{y - 200} L{x - 100},{y - 200} L{x - 80},{y - 150}Z M{x + 130},{y - 150} L{x + 160},{y - 200} L{x + 100},{y - 200} L{x + 80},{y - 150}Z", "#C9A579", 3, u)]
    for k in range(items):
        out.append(cal(x - 40 + k * 40, y - 170 + k * 6, .8, u, (-12, 8, -4)[k % 3], ""))
    out.append(cut(f"M{x - 110},{y - 110} H{x + 110} V{y - 50} H{x - 110}Z", color, 2, u))
    out.append(f'<text x="{x}" y="{y - 68}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="{30 if len(label) <= 4 else 24}" fill="{PAPER}">{label}</text>')
    return "".join(out)


def subtitle(text, who=None, y=1000):
    w = len(text) * 40 + (len(who) * 30 + 40 if who else 0) + 60
    return (f'<g><rect x="{960 - w / 2}" y="{y - 52}" width="{w}" height="72" rx="10" fill="#000" opacity=".55"/>'
            f'<text x="960" y="{y}" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="40" fill="#fff">'
            + (f'<tspan fill="#FFD58A">{who}：</tspan>' if who else "") + f"{text}</text></g>")


def pop_lines(x, y, r=60):
    return "".join(f'<path d="M{x + math.cos(a) * r:.0f},{y + math.sin(a) * r:.0f} l{math.cos(a) * 30:.0f},{math.sin(a) * 30:.0f}" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
                   for a in [math.radians(d) for d in (-150, -110, -70, -30)])


def bed_lying(u):
    """小哲躺在床上（把站立人偶轉 90° 放在床上）。"""
    return (zhe(1560, 590, .78, u, "stand", "tired", rot=-90)
            + cut("M1340,548 Q1470,530 1600,548 V650 H1340Z", BLANKET, 3, u))


# ── 十三個關鍵格 ──────────────────────────────────────────────
def k1():
    u = "a"
    body = (room(u) + bed_lying(u) + light(u, "day")
            + cal(690, 560, 1.4, u, -8) + pop_lines(690, 560, 80)
            + subtitle("今天有點累……明天再寫吧。", "小哲")
            + badge(690, 420, 1) + arrow("M690,620 L690,540", u))
    return frame(u, body)


def k2():
    u = "b"
    rain = "".join(cal(x, y, 1.1, u, r) for x, y, r in ((860, 380, -14), (1040, 260, 10), (1240, 420, -6), (700, 300, 18), (1420, 300, 6)))
    body = (room(u) + zhe(980, 960, 1.1, u, "point", "open") + light(u, "day")
            + cal(640, 600, 1.0, u, -8) + cal(600, 900, 1.0, u, 12)
            + rain
            + subtitle("英文、運動、吉他……明天全部開始！", "小哲")
            + badge(1560, 230, 2) + arrow("M1500,240 L1300,300", u))
    return frame(u, body)


def k3():
    u = "c"
    pieces = (cal(980, 700, 1.4, u, -20, "") + cal(820, 820, 1.2, u, 30, "") + cal(1150, 860, 1.2, u, -40, "")
              + f'<g transform="rotate(-8 980 760)" opacity=".92">{mister(980, 960, .82, u, 6, arm="down", hat=False)}</g>')
    body = (room(u, books_on_desk=False) + bed_lying(u) + pieces + light(u, "night")
            + badge(1200, 360, 3) + arrow("M800,860 Q840,760 900,720", u) + arrow("M1180,900 Q1120,800 1060,760", u))
    return frame(u, body)


def k4():
    u = "d"
    body = (room(u) + zhe(560, 990, 1.05, u, "stand", "shock") + mister(1080, 1000, 1.25, u, 18, open_=1, arm="open") + light(u, "night")
            + subtitle("我是明天先生。你沒做完的事，全部都交給我保管！", "明天先生")
            + badge(1340, 300, 4))
    return frame(u, body)


def k5():
    u = "e"
    body = (room(u) + mountain(u, .55, 5) + light(u, "dim")
            + f'<g transform="translate(1560 160)"><rect x="-120" y="-50" width="240" height="90" rx="10" fill="{INK}" opacity=".75"/>'
            f'<text x="0" y="12" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="44" fill="{PAPER}">星期三</text></g>'
            + badge(300, 420, 5) + arrow("M200,640 Q400,560 600,420", u))
    return frame(u, body)


def k6():
    u = "f"
    body = (room(u) + mountain(u, .95, 7) + zhe(820, 470, 1.0, u, "reach", "open")
            + cal(930, 220, 2.2, u, 6, "下週/一定開始") + light(u, "dim")
            + badge(1080, 200, 6))
    return frame(u, body)


def k7():
    u = "g"
    body = (room(u) + mountain(u, .95, 7) + mister(1380, 900, 1.25, u, 30, bend=34, face="worry", arm="down", hat=True)
            + zhe(700, 470, .8, u, "stand", "shock") + light(u, "dim")
            + subtitle("我不是一直在計畫，怎麼反而什麼都沒做？", "小哲")
            + badge(1560, 120, 7))
    return frame(u, body)


def k8():
    u = "h"
    sleeve = lambda ax, ay, bx, by: (f'<path d="M{ax},{ay} L{bx},{by}" stroke="{HOODIE}" stroke-width="120" stroke-linecap="round" filter="url(#d4-{u})"/>')
    creases = "".join(f'<path d="{d}" fill="none" stroke="{INK}" stroke-opacity=".10" stroke-width="3"/>'
                      for d in ("M600,560 L820,700 L760,880", "M1320,540 L1100,660 L1180,890", "M700,520 L960,600 L1240,520"))
    body = (f'<rect width="{W}" height="{H}" fill="{WALL}"/>'
            + mountain(u, .6, 9)
            + f'<rect width="{W}" height="{H}" fill="#1d2a45" style="mix-blend-mode:multiply" opacity=".7"/>'
            + f'<ellipse cx="960" cy="640" rx="760" ry="460" fill="url(#lamp-{u})" style="mix-blend-mode:screen" opacity=".55"/>'
            + sleeve(300, 1180, 520, 760) + sleeve(1620, 1180, 1400, 760)
            + cut("M560,500 L1350,520 L1370,900 L570,880Z", "#FFF6D6", 3, u) + creases
            + f'<text x="965" y="740" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="110" fill="{INK}">數學：第一題</text>'
            + cut("M490,700 a64,64 0 1 0 128,0 a64,64 0 1 0 -128,0Z", SKIN, 4, u) + cut("M1302,700 a64,64 0 1 0 128,0 a64,64 0 1 0 -128,0Z", SKIN, 4, u)
            + f'<ellipse cx="960" cy="700" rx="520" ry="300" fill="#FFD58A" style="mix-blend-mode:soft-light" opacity=".6"/>'
            + subtitle("我只要先寫第一題。", "小哲")
            + badge(1500, 440, 8) + arrow("M420,620 L540,620", u) + arrow("M1500,620 L1380,620", u))
    return frame(u, body)


def k9():
    u = "i"
    lines = "".join(f'<path d="M520,{360 + k * 70} H1420" stroke="{INK}" stroke-opacity=".18" stroke-width="3"/>' for k in range(8))
    body = (f'<rect width="{W}" height="{H}" fill="{WOOD}"/>'
            + cut("M440,200 H1480 V960 H440Z", PAPER, 3, u) + lines
            + f'<text x="540" y="330" font-family="{SERIF}" font-weight="900" font-size="54" fill="{INK}">1.</text>'
            + f'<text x="620" y="330" font-family="Montserrat,sans-serif" font-weight="700" font-size="54" fill="{INK}">3x + 5 = 20</text>'
            + f'<text x="620" y="420" font-family="Montserrat,sans-serif" font-weight="600" font-size="50" fill="#555">3x = 1<tspan fill="#bbb" text-decoration="line-through">4</tspan>5</text>'
            + f'<text x="620" y="500" font-family="Montserrat,sans-serif" font-weight="600" font-size="50" fill="#555">x = 5</text>'
            + f'<g transform="translate(860 540) rotate(-38)">' + cut("M0,-14 H360 V14 H0Z", MUSTARD, 4, u) + cut("M0,-14 L-50,0 L0,14Z", "#E8D3B0", 4, u)
            + f'<path d="M-50,0 l14,-4 l0,8Z" fill="{INK}"/></g>'
            + f'<g transform="translate(1600 180)">' + cut("M-50,0 L50,0 L30,-60 L-30,-60Z", PAPER, 3, u) + "</g>"
            + f'<ellipse cx="1600" cy="200" rx="360" ry="260" fill="url(#lamp-{u})" style="mix-blend-mode:screen"/>'
            + f'<rect width="{W}" height="{H}" fill="#2a2016" style="mix-blend-mode:multiply" opacity=".22"/>'
            + f'<text x="1640" y="120" font-family="{SERIF}" font-weight="900" font-size="64" fill="{INK}">叮！</text>'
            + badge(380, 520, 9))
    return frame(u, body)


def k10():
    u = "j"
    plane = f'<g transform="translate(1280 300) rotate(-12)">' + cut("M0,0 L140,30 L0,60 L30,30Z", PAPER, 4, u) + cut("M30,30 L140,30 L0,60Z", "#EDE5D5", 4, u) + "</g>"
    body = (room(u) + mountain(u, .6, 9) + zhe(640, 900, 1.0, u, "sit", "smile") + mister(1300, 960, 1.1, u, 26, arm="up")
            + plane + f'<path d="M1240,360 Q1180,420 1120,380" fill="none" stroke="{PAPER}" stroke-width="4" stroke-dasharray="10 12"/>'
            + light(u, "lamp")
            + subtitle("那……今天是不是有一件事，不用交給我了？", "明天先生")
            + badge(1460, 230, 10))
    return frame(u, body)


def k11():
    u = "k"
    body = (room(u) + mountain(u, .25, 11)
            + box(560, 960, "現在開始", "#4E7D63", u) + box(960, 980, "可以放掉", "#8A8A8A", u) + box(1360, 960, "排到可行的日子", HOODIE, u)
            + zhe(1700, 990, .95, u, "hug", "open") + cal(1630, 830, 1.0, u, -10, "明天")
            + light(u, "dawn")
            + badge(960, 640, 11) + arrow("M1620,800 Q1500,700 1400,760", u))
    return frame(u, body)


def k12():
    u = "l"
    blank = f'<g transform="translate(250 480) rotate(-6) scale(.8)">' + cut("M-46,-56 H46 V56 H-46Z", PAPER, 3, u) + cut("M-46,-56 H46 V-30 H-46Z", CALRED, 1, u) + f'<text x="0" y="36" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="64" fill="{INK}">?</text></g>'
    body = (room(u, books_on_desk=True) + mister(150, 560, .42, u, 4, arm="up", hat=True) + blank
            + zhe(640, 900, 1.0, u, "write", "open")
            + light(u, "dawn")
            + subtitle("你可以幫我提醒，明天還有新的事情。", "小哲")
            + badge(420, 220, 12))
    return frame(u, body)


def k13():
    u = "m"
    bird = f'<g transform="translate(1180 230) rotate(-10)">' + cut("M0,0 L-80,-40 L-20,-6 L-60,-80 L10,-10 L70,-24 L30,8 L90,0 L20,22Z", PAPER, 3, u) + "</g>"
    inner = f'<g transform="translate(560 260) scale(.42)">{room(u)}{zhe(640, 900, 1.0, u, "write", "open")}{mister(150, 560, .42, u, 4, arm="up")}</g>'
    body = (f'<rect width="{W}" height="{H}" fill="#2a2522"/>' + cut("M540,240 H1380 V740 H540Z", WALL, 3, u) + inner
            + light(u, "dawn") + bird
            + f'<text x="960" y="860" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="44" fill="{PAPER}">只要做一件，今天真的做得到的事。</text>'
            + f'<text x="960" y="960" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="64" fill="{PAPER}" letter-spacing="6">每次都說明天開始的男孩</text>'
            + badge(1460, 260, 13))
    return frame(u, body, "#2a2522")


# ── 分鏡表 ────────────────────────────────────────────────────
SHOTS = [
    dict(n="S1", name="第一個明天", t=(0, 4), act="一", light="day", frames=[(k1, 2.8)],
         visual="開場不慢慢鋪陳：一秒內就看到房間全景，午後陽光從左牆的窗斜射進來，落在地板上。小哲躺在床上盯著桌上的習題。",
         motion=["0:00 房間全景，光束裡有浮塵慢慢飄（唯一一直在動的東西，讓靜止的紙景有空氣）",
                 "① 0:01.5 台詞「今天有點累……明天再寫吧。」；0:02.5 習題闔上——啪！一張紙日曆從書裡彈出來，旋轉落在桌上，四條速度線"],
         sound="啪：紙張彈開＋木琴一個上揚音（之後每個「明天」都用同一個音，觀眾會開始期待它）"),
    dict(n="S2", name="啪！啪！啪！", t=(4, 15), act="一", light="day", frames=[(k2, 12.5)],
         visual="手機上的運動影片（插入特寫）→「好！明天開始運動！」第二張日曆落在鞋子旁。接著他指著英文書、吉他：「英文、運動、吉他……明天全部開始！」日曆一張接一張從天花板落下。",
         motion=["0:04–0:07 手機特寫：紙手機螢幕上一個剪紙小人在跑步",
                 "② 0:10–0:12 三連啪：日曆卡在節拍上掉落，每張落地都彈一下",
                 "0:12–0:15 旁白「小哲不是沒有計畫。／他的計畫，全部都在明天。」鏡頭緩慢推近桌上那疊日曆"],
         sound="輕快木琴＋彈跳節奏；三連啪落在三個拍子上"),
    dict(n="S3", name="日曆站起來", t=(15, 21), act="二", light="night", frames=[(k3, 18)],
         visual="夜。房間轉成冷藍色，月光從窗戶斜照。桌上的日曆開始自己動：一張摺成手臂、一張摺成腿、厚厚的紙頁疊成身體。",
         motion=["③ 照劇本製作指引：不直接切成完整角色，讓紙片在鏡頭前一張張摺起、插接（每 2 格動一次）",
                 "最後一張紙摺成帽子戴上，帽子上寫著「明天」"],
         sound="紙張摺疊的清脆聲，一聲接一聲加快；組好時一聲低音大提琴（幽默，不恐怖）"),
    dict(n="S4", name="明天先生", t=(21, 30), act="二", light="night", frames=[(k4, 26)],
         visual="仰角。明天先生低頭看小哲：「聽說，你有很多事情要交給我？」他得意地打開胸前那頁，裡面塞滿紙條：開始讀書、每天運動、早點睡覺、學好英文、整理房間。",
         motion=["④ 胸前的日曆頁像門一樣打開，五張紙條依序彈出",
                 "<b>規則在這裡交代清楚</b>：小哲脫口而出「那……明天再說好了」，明天先生當場「咻」地長高一截——之後每次長高，觀眾都知道為什麼",
                 "0:28「是啊！而且我每天都會幫你收新的！」再長高一截"],
         sound="長高的「咻」用滑音笛；台詞間留空拍給笑點"),
    dict(n="S5", name="日子一天天過去", t=(30, 38), act="三", light="dim", frames=[(k5, 34)],
         visual="鏡頭固定不動，光束像日晷一樣掃過房間：白天、夜晚、白天……日曆一張張增加，從桌面漫到床鋪、地板。牆角的字卡翻著星期一、星期二、星期三。",
         motion=["⑤ 定格手法：每一格多一兩張紙（劇本製作指引），光束角度每 0.25 秒變一次",
                 "房間越來越暗：紙堆擋住光，地板上的光斑變小"],
         sound="紙張拍打、翻頁，加入機械般的節奏；時鐘滴答越來越快"),
    dict(n="S6", name="下週一定開始", t=(38, 44), act="三", light="dim", frames=[(k6, 41)],
         visual="快速插入：找不到數學作業、吉他被壓在下面、運動鞋只露出兩個角。小哲爬上紙山，抓住最上面一張日曆——「下週一定開始」。",
         motion=["三個 0.6 秒的插入鏡頭（作業、吉他、鞋）",
                 "⑥ 爬紙山：紙堆在腳下塌陷、滑動；抓到那張日曆時拉成特寫"],
         sound="紙山崩塌的沙沙聲"),
    dict(n="S7", name="怎麼反而什麼都沒做", t=(44, 48), act="三", light="dim", frames=[(k7, 46)],
         visual="小哲站在紙山頂上低頭看房間。明天先生已經高到頭撞天花板、彎著腰：「嗯……你交給我的工作，好像真的有點多。」",
         motion=["⑦ 音樂停：只剩紙張緩緩飄落（每 3 格落一張）",
                 "明天先生的頭沿著天花板彎下來，帽子被擠歪"],
         sound="全片第一次安靜。只有紙張落下的細聲"),
    dict(n="S8", name="數學：第一題", t=(48, 55), act="四", light="lamp", frames=[(k8, 51)],
         visual="小哲坐在紙山中央，看見角落一張被壓住的小紙條，撿起來慢慢攤平：「數學：第一題」。檯燈亮起，房間第一次有暖色的光。",
         motion=["⑧ 雙手把皺紙條往兩邊攤平（皺摺線一條條消失）",
                 "「我不需要今天把全部事情做完。／我只要先寫第一題。」"],
         sound="紙條攤平的輕響；檯燈開關「喀」"),
    dict(n="S9", name="第一題", t=(55, 64), act="四", light="lamp", frames=[(k9, 60)],
         visual="俯拍特寫，全片最慢的一段：鉛筆寫下第一行、停一下、擦掉一個錯的數字、重新計算——寫完。叮！一盞小紙燈亮了。",
         motion=["⑨ 和前半段的快速剪接相反：一個鏡頭 9 秒不切，鉛筆每 2 格前進一點",
                 "擦掉的「4」用橡皮擦屑表現；寫完後停半秒才「叮」"],
         sound="鉛筆沙沙聲；音樂暫停半秒，再一個清脆的木琴音（劇本：成功提示）"),
    dict(n="S10", name="不用交給我了", t=(64, 70), act="四", light="lamp", frames=[(k10, 67)],
         visual="小哲露出一點笑容：「原來開始，沒有我想的那麼難。」明天先生身上的一張日曆飄下來，摺成一架小紙飛機。「那……今天是不是有一件事，不用交給我了？」「對。這一件，今天就做完了。」",
         motion=["⑩ 日曆從明天先生身上剝離、在空中摺成紙飛機（6 格完成），沿虛線滑翔",
                 "明天先生縮矮一截——規則反過來：做完一件，他就變小一點"],
         sound="紙飛機滑翔的輕柔風聲"),
    dict(n="S11", name="三個紙盒", t=(70, 80), act="五", light="dawn", frames=[(k11, 75)],
         visual="清晨，金色的光重新照進房間。小哲把紙山裡的日曆一張張拿出來，分進三個紙盒：「現在開始」「可以放掉」「排到可行的日子」。他沒有一口氣做完所有事，只是清出桌面、收好吉他，在日記寫下「今天：數學第一題。」",
         motion=["⑪ 每張日曆被拿起、看一眼、丟進其中一個紙盒（每個約 0.8 秒），盒子上的字卡要讓觀眾看清楚",
                 "紙山逐漸變矮，地板的光斑一格一格變大"],
         sound="開場旋律回來，速度稍慢；每張日曆落進盒子一聲輕敲"),
    dict(n="S12", name="空白的日曆", t=(80, 86), act="五", light="dawn", frames=[(k12, 83)],
         visual="明天先生縮成小小的紙人，坐在窗台上。「你以後不用幫我保管這麼多事了。」「那我以後要做什麼？」「你可以幫我提醒，明天還有新的事情。」他拿出一張空白日曆，上面只有一個問號。",
         motion=["⑫ 明天先生從大縮到小：身體的日曆頁一頁頁翻走",
                 "空白日曆翻過來，問號露出"],
         sound="溫暖的木琴＋弦樂"),
    dict(n="S13", name="結尾", t=(86, 90), act="五", light="dawn", frames=[(k13, 88.5)],
         visual="鏡頭拉遠，房間變成黑暗中的一個紙模型。桌前的小哲正在寫下一題，窗台上的明天先生看著窗外，一隻紙鳥飛過。只留一句字幕，接片名。",
         motion=["⑬ 拉遠：整個房間縮成畫面中央的紙盒（像參考圖那樣是一個實體模型）",
                 "字幕只留一句：「只要做一件，今天真的做得到的事。」接片名"],
         sound="開場旋律完整收尾；最後一個音是 S1 那個「明天」音的反向（下行），故事完成一個循環"),
]


def shot_html(sh):
    a, b = sh["t"]
    thumbs = "".join(f'<figure><div class="thumb">{fn()}</div><figcaption>{int(t // 60)}:{t % 60:04.1f}</figcaption></figure>' for fn, t in sh["frames"])
    li = "".join(f"<li>{m}</li>" for m in sh["motion"])
    return f'''<article class="shot"><header><span class="sn">{sh["n"]}</span><h3>{sh["name"]}</h3>
<span class="time">第{sh["act"]}幕 · {a // 60}:{a % 60:02d}–{b // 60}:{b % 60:02d} · {b - a} 秒 · 光：{LIGHT_NAME[sh["light"]]}</span></header>
<div class="body"><div class="thumbs">{thumbs}</div><dl><dt>畫面</dt><dd>{sh["visual"]}</dd><dt>動態</dt><dd><ul>{li}</ul></dd>
<dt>聲音</dt><dd>{sh["sound"]}</dd></dl></div></article>'''


LIGHT_NAME = {"day": "午後斜陽", "night": "夜・月光", "dim": "被紙堆遮暗", "lamp": "檯燈暖光", "dawn": "清晨金光"}
LIGHT_COLOR = {"day": "#E8B65A", "night": "#3A4E78", "dim": "#8A7560", "lamp": "#E9A23B", "dawn": "#F0A07A"}


def timeline():
    Wt, Ht, top = 1000, 170, 30
    px = Wt / 90
    s = [f'<svg viewBox="0 0 {Wt} {Ht}" class="tl" role="img" aria-label="90 秒節奏與光線">']
    for sec in range(0, 91, 5):
        x = sec * px
        s.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + 88}" stroke="currentColor" stroke-opacity="{.45 if sec % 15 == 0 else .15}"/>')
        if sec % 15 == 0 and sec < 90:
            s.append(f'<text x="{x + 3:.1f}" y="{top - 10}" class="tl-t">{sec // 60}:{sec % 60:02d}</text>')
    for sh in SHOTS:
        a, b = sh["t"]
        s.append(f'<rect x="{a * px + 1:.1f}" y="{top + 4}" width="{(b - a) * px - 2:.1f}" height="34" rx="4" fill="#2A2522"/>')
        if b - a >= 4:
            s.append(f'<text x="{(a + b) / 2 * px:.1f}" y="{top + 26}" text-anchor="middle" class="tl-s">{sh["n"]}</text>')
        s.append(f'<rect x="{a * px:.1f}" y="{top + 42}" width="{(b - a) * px:.1f}" height="14" fill="{LIGHT_COLOR[sh["light"]]}"/>')
    # 紙堆高度（雜亂程度）
    pts = [(0, .05), (4, .1), (15, .25), (21, .3), (30, .4), (38, .85), (44, 1), (48, 1), (64, .9), (70, .8), (80, .3), (90, .15)]
    y0, hh = Ht - 8, 60
    d = " ".join(f"{'M' if i == 0 else 'L'}{t * px:.1f},{y0 - v * hh:.1f}" for i, (t, v) in enumerate(pts))
    s.append(f'<path d="{d}" fill="none" stroke="{CALRED}" stroke-width="2.5"/><text x="4" y="{y0 - hh - 2}" class="tl-t">日曆數量</text></svg>')
    return "".join(s)


CHANGES = [
    ("開場先鋪陳房間，再說「明天再寫吧」", "一秒內看到全景，2.5 秒就「啪」", "短影音觀眾一兩秒內決定要不要滑走；第一個笑點要在這之前"),
    ("明天先生每次收新事情就長高", "第一次出場時，讓小哲脫口說「明天再說」，他當場長高", "規則一出場就交代清楚，後面每次長高觀眾都知道為什麼，也才會好笑"),
    ("—", "做完第一題後，明天先生縮矮一截", "把規則反過來用：做完一件，他就變小一點，結尾縮成小紙人才有來由"),
    ("三種日曆標籤一閃而過", "做成三個紙盒，每張日曆被丟進其中一個", "這是全片最實用、最值得收藏的方法，要讓觀眾看清楚"),
    ("結尾：兩句旁白＋兩句字幕＋一行片尾小字", "保留旁白兩句；字幕只留「只要做一件，今天真的做得到的事。」；刪掉「你不必今天改變整個人生。」與片尾小字", "五句話講同一件事會互相稀釋，留白比較有力"),
]

PLATES = [
    ("房間・午後", "S1、S2、S5–S7",
     "A handmade paper-craft diorama of a small teenager's bedroom, photographed like a stop-motion film set. One-point perspective, wide shot. Pale blue-grey paper walls, warm light-wood paper furniture: a study desk with a paper desk lamp on the left, a single bed with a cream blanket at the back right, a wall shelf with a few paper books, an acoustic guitar leaning on the right wall, sneakers under the desk, a window on the left wall. Late-afternoon sunlight streams through the window in a soft diagonal beam with floating dust, warm golden light on the floor, soft realistic shadows, slight depth of field, visible paper fibre and cut edges. No people, no text, no logos. 16:9.",
     "手工紙雕微縮模型：一間青少年的小臥室，像定格動畫片場那樣拍攝。單點透視全景。淡藍灰紙牆、淺色木紋紙家具：左邊書桌和紙檯燈，右後方鋪米白被子的單人床，牆上層架有幾本紙書，右牆靠著一把木吉他，書桌下一雙運動鞋，左牆一扇窗。午後陽光從窗戶斜射進來，光束裡有浮塵，地板上暖金色的光斑，柔和真實的陰影，淺景深，看得見紙纖維和切口。不要人物、不要文字、不要標誌。16:9。"),
    ("房間・夜", "S3、S4", "Same paper-craft bedroom at night: cool blue moonlight through the left window in a faint diagonal beam, the room in deep blue shadow, desk lamp off. Same layout, camera and props as the daytime plate. No people, no text. 16:9.",
     "同一間紙雕臥室的夜晚：冷藍月光從左窗斜照進來，房間沉在深藍的陰影裡，檯燈關著。格局、鏡位、道具都和白天那張一樣。不要人物、不要文字。16:9。"),
    ("房間・檯燈", "S8–S10", "Same paper-craft bedroom at night, only the paper desk lamp is on, casting a warm pool of light over the desk and the floor nearby; the rest of the room fades into blue darkness. Same layout and camera. No people, no text. 16:9.",
     "同一間紙雕臥室的夜晚，只有紙檯燈亮著，在書桌和附近地板投下一圈暖光，房間其餘部分淡入藍色黑暗。格局和鏡位不變。不要人物、不要文字。16:9。"),
    ("房間・清晨", "S11–S13", "Same paper-craft bedroom at dawn: soft peach-gold morning light enters through the left window at a low angle, long gentle shadows, a calm and fresh mood. Same layout and camera. No people, no text. 16:9.",
     "同一間紙雕臥室的清晨：柔和的蜜桃金色晨光從左窗低角度照進來，影子拉得很長，氣氛平靜清新。格局和鏡位不變。不要人物、不要文字。16:9。"),
]


def build():
    changes = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a, b, c in CHANGES)
    plates = "".join(
        f'<div class="plate"><b>{n}</b><span class="use">用於 {use}</span><details><summary>提示詞（英文送出，中文對照）</summary>'
        f'<p class="en">{en}</p><p>{zh}</p></details></div>' for n, use, en, zh in PLATES)
    lights = "".join(f'<span class="lt"><i style="background:{LIGHT_COLOR[k]}"></i>{v}</span>' for k, v in LIGHT_NAME.items())
    cast = (f'<svg viewBox="0 -560 1900 600" class="cast" role="img" aria-label="角色">' + P.defs("cast")
            + zhe(120, 0, .95, "cast", "stand", "open") + zhe(380, 0, .95, "cast", "point", "open") + zhe(640, 0, .95, "cast", "reach", "shock")
            + zhe(900, 0, .95, "cast", "sit", "smile")
            + mister(1180, 0, .55, "cast", 6) + mister(1430, 0, .55, "cast", 20, open_=1, arm="open") + mister(1720, 0, .55, "cast", 34, bend=30, face="worry")
            + "".join(f'<text x="{x}" y="34" text-anchor="middle" font-family="{SERIF}" font-size="26" fill="{INK}">{t}</text>'
                      for x, t in ((120, "小哲・站"), (380, "指"), (640, "伸手（驚）"), (900, "坐（笑）"), (1180, "明天先生・初登場"), (1430, "打開胸前那頁"), (1720, "太高，撞到天花板")))
            + "</svg>")
    css = P.BASE_CSS + f"""
:root{{--red:{CALRED};--cream:#F4EFE6;--card:#FBF7F0;--line:#e3d6c0}}
body{{font-family:'Noto Serif TC','Noto Sans TC',serif}}
h1{{font-family:'Noto Serif TC',serif;font-weight:900;letter-spacing:.03em}} h1 em{{color:{CALRED};font-style:normal}}
.thumb{{width:384px;aspect-ratio:16/9}} .frame{{width:1920px;height:1080px;transform:scale(.2)}}
.thumbs{{flex-direction:column}}
.cast{{width:100%;height:auto;display:block;background:#F4EFE6;border:1px solid var(--line);border-radius:8px;margin:10px 0}}
.chg td{{vertical-align:top;font-size:14px}} .chg td:first-child{{width:auto;color:var(--mute)}}
.lts{{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:14px;margin:8px 0}} .lt i{{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:6px}}
.plates{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}}
.plate{{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 14px;min-width:0}}
.plate .use{{display:block;font-size:13px;color:var(--mute);margin:2px 0 6px}} .plate p{{font-size:13.5px;line-height:1.6;margin:8px 0 0}} .plate .en{{font-family:Montserrat,system-ui,sans-serif}}
@media (max-width:760px){{ .thumb{{width:288px}} .frame{{transform:scale(.15)}} }}"""
    shots = "".join(shot_html(s) for s in SHOTS)
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>每次都說明天開始的男孩 分鏡</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;700&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>{css}</style></head><body><main>
<div class="kicker">PAPER-CRAFT SHORT · STORYBOARD v1 待確認</div>
<h1>每次都說<br><em>明天</em>開始的男孩</h1>
<ul class="meta"><li>90 秒</li><li>16:9 · 1920×1080</li><li>24 fps · 動作一拍兩格</li><li>13 鏡 · 13 個關鍵格</li><li>國高中生・成人</li></ul>

<h2>和劇本不同的地方 <small>CHANGES</small></h2>
<p>以下是我在分鏡裡做的調整，都是建議，你不同意的我改回原劇本。</p>
<table class="chg"><tr><td><b>原劇本</b></td><td><b>分鏡</b></td><td><b>理由</b></td></tr>{changes}</table>

<h2>光是主角 <small>LIGHT</small></h2>
<p class="lead">參考圖迷人的地方是光：從窗戶斜射進來的陽光、柔和的實體陰影、空氣裡的浮塵。所以這支片用<b>光的變化</b>來講故事，和劇本的情緒走同一條線。</p>
<div class="lts">{lights}</div>
<p>午後的陽光（輕鬆）→ 夜裡的冷光（明天先生出現）→ 光束像日晷一樣掃過、被紙堆擋暗（拖延堆積）→ 一盞檯燈（第一題）→ 清晨的金光（重新開始）。
畫面最暗的時刻正是日曆最多的時刻；第一道暖光出現在小哲動筆的那一刻。</p>

<h2>角色 <small>CAST</small></h2>
<p>小哲是剪紙人偶（肩肘用兩腳釘，和前一支同一套做法），藍色帽 T。明天先生是一疊桌曆：身體的頁數就是他收了多少個「明天」，所以<b>長高＝頁數變多</b>；胸前那頁寫著明天的日期，可以像門一樣打開。</p>
{cast}

<h2>節奏 <small>TIMING</small></h2>
{timeline()}
<p>上排是鏡頭，中間色條是光線，紅線是日曆的數量：在 0:44–0:48 達到最高，正是全片唯一完全安靜的時刻。之後一路下降，和光線一起變亮。</p>

<h2>分鏡 <small>SHOTS</small></h2>
<p><span class="note">藍色編號與虛線</span>是動態註記，對應各鏡「動態」欄的圈號；黑底字幕條是暫定位置。關鍵格是用來確認構圖和光線的示意，正式畫面的房間會換成下面的 AI 底圖。</p>
{shots}

<h2>製作方式：AI 底圖＋程式紙偶 <small>PRODUCTION</small></h2>
<p>房間用 nano-banana-2 生成四張底圖（同一間房、同一個鏡位、四種光），讓房間有真實的光影；小哲、明天先生、會堆積的日曆、紙盒、紙飛機則用程式做成紙偶疊上去，陰影方向對齊底圖的光源。角色每一格都一致，日曆上的「明天」也一定寫對。</p>
<p>參考圖只拿來當光線和材質的參考：提示詞描述的是我們自己的房間，不照抄參考圖的閣樓和擺設。</p>
<div class="plates">{plates}</div>
<p>這四張要在 GitHub 上跑 FAL 的 Action 生成（我這裡連不到 fal.ai）。建議先跑「房間・午後」一張，確認風格後再跑其他三張，並用第一張當參考圖，讓四張的格局一致。</p>

<h2>待你確認 <small>DECISIONS</small></h2>
<div class="q">
<div><b>五項劇本調整，哪些接受？</b><span>見最上面的表格。特別是結尾字幕刪減、和「做完一件，明天先生就變小」這個新增規則。</span></div>
<div><b>比例：16:9 橫式可以嗎？</b><span>參考圖是橫的，90 秒適合 YouTube 和課堂播放。要放短影音平台，我會另外剪一支 30 秒的直式版本，從三連啪剪到第一題。</span></div>
<div><b>房間要什麼樣子？</b><span>提示詞目前寫的是一般青少年臥室。如果你想要台灣公寓的房間（鋁窗、上下鋪），或保留參考圖那種斜屋頂閣樓的感覺，告訴我，我改提示詞。</span></div>
<div><b>旁白和台詞要配音嗎？</b><span>這支有不少對白。我這裡無法錄人聲，可以先用字幕做一版；有配音檔之後再放進去，不用改畫面。</span></div>
<div><b>可以先跑一張「房間・午後」底圖嗎？</b><span>這是整支片的風格基準，看到它再決定其他三張。</span></div>
</div>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
