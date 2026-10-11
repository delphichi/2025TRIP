#!/usr/bin/env python3
"""《今天，先別把自己摺壞》15 秒紙雕預告 —— 分鏡腳本產生器。

從 5–6 分鐘的劇本剪出 15 秒：只賣「前提＋角色＋承諾＋一個笑點」。
紙雕零件（分層投影、切口受光、紙纖維、紙盒外框）沿用 build_storyboard.py，
這裡加上兩個紙偶角色：小沐（關節用兩腳釘固定的剪紙人偶）與折折（帶摺痕的紙鹿）。

    python3 living-system/build_teaser.py  →  living-system/分鏡腳本-摺壞預告.html
"""
import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("paper", HERE / "build_storyboard.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)
cut, defs, finish, box_frame, wave, badge, arrow = P.cut, P.defs, P.finish, P.box_frame, P.wave, P.badge, P.arrow
stem_d, leaf_d = P.stem_d, P.leaf_d
PAPER, SAND, INK, NIGHT, SERIF = P.PAPER, P.SAND, P.INK, P.NIGHT, P.SERIF
ROOT, GREEN, TERRA, WATER, GOLD, SAGE, DEEP = P.ROOT, P.GREEN, P.TERRA, P.WATER, P.GOLD, P.SAGE, P.DEEP

OUT = HERE / "分鏡腳本-摺壞預告.html"
FPS = 30
LIGHT = "#F6C85F"      # 窗戶暖光
CORAL = "#E58C6E"      # 小沐的毛衣
SKIN = "#F2C9A0"
HAIR = "#2B2522"
DEER = "#FBF7F0"
DEER2 = "#E9DFCF"
WALL = "#E9DCC6"
DESK = "#B8895A"
MIDNIGHT = "#1E2A3E"
BRAD = "#C9A24A"       # 兩腳釘

# 全片核心記憶點（劇本原文）
MEMO = [("本", "找到方向", ROOT), ("能", "盤點能力", GREEN), ("身", "照顧自己", TERRA), ("脈", "根據回饋調整", WATER), ("留", "保留有用的成果", GOLD)]


def frame(u, body, bg=PAPER, fiber=True):
    return (f'<div class="frame" style="background:{bg}"><svg viewBox="0 0 1080 1920" width="1080" height="1920">'
            f'{defs(u)}{body}{finish(u) if fiber else ""}</svg></div>')


def card(x, y, lines, u, size=56, w=None, rot=-1.5, color=PAPER, ink=INK, who=None):
    """對白紙卡：白紙＋投影，說話的人名用小色條標在左上。"""
    w = w or max(len(t) for t in lines) * size + 90
    h = len(lines) * size * 1.35 + 70
    out = [f'<g transform="translate({x - w / 2} {y}) rotate({rot} {w / 2} {h / 2})">', cut(f"M0,0 H{w} V{h} H0Z", color, 2, u)]
    if who:
        out.append(cut(f"M24,-22 H{24 + len(who) * 34 + 30} V18 H24Z", INK, 1, u)
                   + f'<text x="{39}" y="7" font-family="{SERIF}" font-weight="900" font-size="30" fill="{PAPER}">{who}</text>')
    for k, t in enumerate(lines):
        out.append(f'<text x="{w / 2}" y="{58 + size * .95 + k * size * 1.35:.0f}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="{size}" fill="{ink}">{t}</text>')
    out.append("</g>")
    return "".join(out)


# ── 角色 ──────────────────────────────────────────────────────
def brad(x, y):
    return f'<circle cx="{x}" cy="{y}" r="6" fill="{BRAD}" stroke="#7a5a1a" stroke-width="1.5"/>'


def mu(x, y, s, u, pose="stand", face="open", seated=False):
    """小沐：剪紙人偶，肩、肘用兩腳釘固定 —— 動畫時每段手臂繞釘子旋轉。原點在腳底。"""
    # 左手臂兩段的角度（度，0 = 向右、90 = 向上）；右手臂左右鏡射
    a1, a2 = {"stand": (-110, -95), "crumple": (-40, 15), "stretch": (115, 100), "sit": (-60, -5)}[pose]
    out = [f'<g transform="translate({x} {y}) scale({s})">']
    if not seated:
        out.append(cut("M-34,0 V-120 H-6 V0Z", "#3A4A66", 2, u) + cut("M6,0 V-120 H34 V0Z", "#3A4A66", 2, u))
        out.append(cut("M-44,0 H-4 V-14 H-44Z", INK, 2, u) + cut("M4,0 H44 V-14 H4Z", INK, 2, u))
    body_y = -10 if seated else -120
    out.append(f'<g transform="translate(0 {body_y})">')
    out.append(cut("M-62,0 Q-70,-120 -48,-170 L48,-170 Q70,-120 62,0Z", CORAL, 3, u))
    # 手臂：肩→肘→手，兩段紙條
    for side in (-1, 1):
        b1, b2 = (a1, a2) if side < 0 else (180 - a1, 180 - a2)
        sx, sy = side * 46, -150
        ex, ey = sx + 70 * math.cos(math.radians(b1)), sy - 70 * math.sin(math.radians(b1))
        hx, hy = ex + 64 * math.cos(math.radians(b2)), ey - 64 * math.sin(math.radians(b2))
        def strip(ax, ay, bx, by, w=26):
            nx, ny = -(by - ay), bx - ax
            L = math.hypot(nx, ny) or 1
            nx, ny = nx / L * w / 2, ny / L * w / 2
            return f"M{ax + nx:.0f},{ay + ny:.0f} L{bx + nx:.0f},{by + ny:.0f} L{bx - nx:.0f},{by - ny:.0f} L{ax - nx:.0f},{ay - ny:.0f}Z"
        out.append(cut(strip(sx, sy, ex, ey), CORAL, 3, u) + cut(strip(ex, ey, hx, hy, 22), CORAL, 3, u))
        out.append(cut(f"M{hx + 15},{hy} A15,15 0 1 0 {hx - 15},{hy} A15,15 0 1 0 {hx + 15},{hy}Z", SKIN, 3, u))
        out.append(brad(sx, sy) + brad(ex, ey))
    # 頭：臉、鮑伯頭、瀏海、耳後的鉛筆
    out.append(cut("M-6,-170 V-186 H6 V-170Z", SKIN, 2, u))
    out.append(cut("M54,-250 A54,58 0 1 0 -54,-250 A54,58 0 1 0 54,-250Z", SKIN, 3, u))
    out.append(cut("M-66,-232 Q-72,-320 0,-318 Q72,-320 66,-232 L52,-232 Q48,-280 10,-282 Q-40,-270 -50,-240 L-50,-210 L-66,-210Z", HAIR, 3, u))
    out.append(cut("M62,-268 L96,-306 L104,-298 L70,-260Z", GOLD, 3, u))
    if face == "open":
        out.append(f'<circle cx="-18" cy="-246" r="6" fill="{INK}"/><circle cx="20" cy="-246" r="6" fill="{INK}"/>'
                   f'<path d="M-10,-218 Q2,-208 14,-218" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    elif face == "tired":
        out.append(f'<path d="M-26,-244 h16 M12,-244 h16" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
                   f'<path d="M-8,-214 h18" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    elif face == "upset":
        out.append(f'<path d="M-28,-252 l14,6 M28,-252 l-14,6" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
                   f'<circle cx="-18" cy="-238" r="5" fill="{INK}"/><circle cx="20" cy="-238" r="5" fill="{INK}"/>'
                   f'<path d="M-12,-210 Q2,-222 16,-210" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    out.append(f'<circle cx="-34" cy="-226" r="9" fill="#F29C8E" opacity=".6"/><circle cx="36" cy="-226" r="9" fill="#F29C8E" opacity=".6"/>')
    out.append("</g></g>")
    return "".join(out)


def deer(x, y, s, u, wink=False, head_only=False):
    """折折：紙鹿，多面體摺紙造型，身上留著摺痕，鹿角是兩根小樹枝。原點在腳底。"""
    crease = f'stroke="{INK}" stroke-opacity=".18" stroke-width="2" fill="none"'
    out = [f'<g transform="translate({x} {y}) scale({s})">']
    if not head_only:
        for lx in (-58, -30, 34, 60):
            out.append(cut(f"M{lx - 7},0 L{lx - 4},-96 L{lx + 6},-96 L{lx + 7},0Z", DEER2, 2, u, f'stroke="{INK}" stroke-opacity=".35" stroke-width="2"'))
        out.append(cut("M-80,-90 L-40,-150 L50,-150 L84,-96 L40,-80 L-50,-78Z", DEER, 3, u))
        out.append(cut("M-40,-150 L50,-150 L40,-80 L-50,-78Z", DEER2, 3, u, 'opacity=".55"'))
        out.append(f'<path d="M-40,-150 L-50,-78 M50,-150 L40,-80 M-80,-90 L84,-96" {crease}/>')
        out.append(cut("M-84,-96 L-104,-118 L-88,-88Z", DEER2, 2, u))
        out.append(cut("M40,-150 L70,-226 L96,-220 L76,-146Z", DEER, 3, u))  # 脖子
    hx, hy = (84, -238) if not head_only else (0, 0)
    out.append(f'<g transform="translate({hx} {hy})">')
    # 鹿角：小樹枝
    out.append(f'<g filter="url(#d2-{u})" stroke="{ROOT}" stroke-width="7" stroke-linecap="round" fill="none">'
               '<path d="M-6,-24 L-18,-78 M-14,-60 L-36,-74 M-16,-50 L-4,-70"/><path d="M14,-24 L22,-82 M20,-62 L42,-76 M20,-48 L8,-66"/></g>')
    out.append(cut("M-28,-26 L30,-30 L58,6 L20,26 L-24,10Z", DEER, 3, u))
    out.append(cut("M-28,-26 L-56,-44 L-40,-12Z", DEER2, 3, u))
    out.append(f'<path d="M30,-30 L20,26 M-28,-26 L20,26" {crease}/>')
    out.append(f'<circle cx="54" cy="6" r="6" fill="{INK}"/>')
    if wink:
        out.append(f'<path d="M4,-6 q8,8 16,0" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    else:
        out.append(f'<circle cx="12" cy="-6" r="6" fill="{INK}"/><circle cx="14" cy="-8" r="2" fill="#fff"/>')
    out.append("</g></g>")
    return "".join(out)


# ── 場景零件 ──────────────────────────────────────────────────
def house(x, y, w, h, roof, u, depth=2, lit=(1, 1)):
    win = ""
    for i in range(lit[0]):
        for j in range(lit[1]):
            wx = x + w * (i + 1) / (lit[0] + 1) - 12
            wy = y - h + 30 + j * 46
            win += f'<rect x="{wx:.0f}" y="{wy:.0f}" width="24" height="30" rx="3" fill="{LIGHT}"/>'
    return (cut(f"M{x},{y} V{y - h} H{x + w} V{y}Z", PAPER, depth, u)
            + cut(f"M{x - 10},{y - h + 4} L{x + w / 2},{y - h - w * .45} L{x + w + 10},{y - h + 4}Z", roof, depth, u) + win)


def skyline(y, u, depth=1, color="#3A4E6B", seed=3):
    import random
    r = random.Random(seed)
    d = f"M-20,2000 L-20,{y}"
    x = -20
    while x < 1100:
        w = r.randint(60, 130)
        h = r.randint(40, 200)
        d += f" L{x},{y - h} L{x + w},{y - h}"
        if r.random() < .35:
            d += f" L{x + w / 2:.0f},{y - h - 50}"
        x += w
        d += f" L{x},{y - h}"
    return cut(d + f" L1100,{y} L1100,2000Z", color, depth, u)


def train(x, y, u, s=1.0, smoke=False):
    out = [f'<g transform="translate({x} {y}) scale({s})">']
    for k, c in enumerate((TERRA, GOLD, GREEN)):
        bx = -k * 130
        out.append(cut(f"M{bx - 56},0 V-66 H{bx + 56} V0Z", c, 3, u))
        out.append(f'<rect x="{bx - 36}" y="-52" width="28" height="22" rx="3" fill="{LIGHT}"/><rect x="{bx + 6}" y="-52" width="28" height="22" rx="3" fill="{LIGHT}"/>')
        out.append(cut(f"M{bx - 30},4 A14,14 0 1 0 {bx - 2},4 A14,14 0 1 0 {bx - 30},4Z M{bx + 2},4 A14,14 0 1 0 {bx + 30},4 A14,14 0 1 0 {bx + 2},4Z", INK, 2, u))
    out.append(cut("M56,-66 L80,-66 L80,-96 L56,-96Z", TERRA, 3, u))
    if smoke:
        out.append("".join(cut(f"M{60 + k * 22},{-120 - k * 40} a{18 + k * 6},{16 + k * 5} 0 1 0 1,0Z", "#5a5a5a", 2, u) for k in range(3)))
    out.append("</g>")
    return "".join(out)


def scissors(x, y, s, u, ang=0, open_=18):
    blade = "M0,0 L250,-14 L262,0 L250,8Z"
    return (f'<g transform="translate({x} {y}) scale({s}) rotate({ang})">'
            f'<g transform="rotate({-open_ / 2})">{cut(blade, "#C9CDD2", 3, u)}{cut("M0,0 L-60,26 A34,30 0 1 1 -110,8 L-50,-6Z", TERRA, 3, u)}</g>'
            f'<g transform="rotate({open_ / 2})">{cut("M0,0 L250,14 L262,0 L250,-8Z", "#B8BDC3", 3, u)}{cut("M0,0 L-60,-26 A34,30 0 1 0 -110,-8 L-50,6Z", TERRA, 3, u)}</g>'
            f'<circle r="9" fill="{BRAD}" stroke="{INK}" stroke-width="2"/></g>')


def door(x, y, color, label, u, open_=0.0, inner=""):
    """紙門：拱形門框，門板以左緣為鉸鏈打開（寬度隨角度縮短）。"""
    w, h = 170, 300
    frame_d = f"M{x},{y} V{y - h + w / 2} A{w / 2},{w / 2} 0 0 1 {x + w},{y - h + w / 2} V{y}Z"
    leaf_w = w * math.cos(math.radians(open_ * 80))
    leaf_d2 = f"M{x},{y} V{y - h + 30} L{x + leaf_w},{y - h + 30 + open_ * 20} V{y - open_ * 20}Z"
    return (cut(frame_d, "#fbf7f0", 2, u)
            + f'<g clip-path="none">{inner}</g>'
            + cut(leaf_d2, color, 3, u)
            + f'<text x="{x + w / 2}" y="{y + 70}" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="64" fill="{INK}">{label}</text>')


# ── 十個關鍵格 ────────────────────────────────────────────────
def k1():
    u = "t1"
    cut_line = f'<path d="M180,1100 L180,980 L300,980 L300,900 L390,850 L480,900 L480,1010 L560,1010" fill="none" stroke="{INK}" stroke-width="4" stroke-dasharray="10 10" opacity=".5"/>'
    body = (f'<rect width="1080" height="1920" fill="#0f0e0d"/>'
            + cut("M140,640 L960,600 L980,1380 L120,1420Z", "#fbf7f0", 3, u)
            + cut("M560,1010 L640,1010 L640,880 L720,840 L800,880 L800,1100 L900,1100 L900,1390 L560,1406Z", "#f1e8d8", 1, u, 'opacity=".9"')
            + cut_line
            + scissors(570, 1012, 1.0, u, -18, 22)
            + badge(240, 760, 1) + arrow("M640,1060 L860,1060", u))
    return frame(u, body, "#0f0e0d")


def k2():
    u = "t2"
    body = (f'<rect width="1080" height="1920" fill="{MIDNIGHT}"/>'
            + skyline(1100, u, 1, "#2E3F57", 5)
            + house(140, 1240, 170, 230, TERRA, u, 2, (2, 3))
            + house(380, 1260, 150, 300, GREEN, u, 2, (2, 4))
            + house(600, 1240, 190, 220, ROOT, u, 2, (3, 3))
            + house(830, 1260, 140, 260, GOLD, u, 2, (2, 3))
            + cut(wave(1380, 26, 5, 8), WATER, 3, u) + cut(wave(1470, 20, 5, 9), "#3F6B90", 3, u)
            + train(620, 1330, u, .9)
            + box_frame(u, SAND)
            + badge(980, 1000, 2))
    return frame(u, body, MIDNIGHT)


def desk_scene(u, face="tired", pose="sit", crumple=False, smoke=False):
    cal = (f'<g transform="translate(640 330) rotate(3)">{cut("M0,0 H330 V230 H0Z", "#fbf7f0", 2, u)}{cut("M0,0 H330 V54 H0Z", TERRA, 1, u)}'
           f'<text x="165" y="128" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="40" fill="{INK}">創意節，</text>'
           f'<text x="165" y="186" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="40" fill="{TERRA}">倒數三天！</text></g>')
    clock = (f'<g transform="translate(250 430)">{cut("M70,0 A70,70 0 1 0 -70,0 A70,70 0 1 0 70,0Z", "#fbf7f0", 2, u)}'
             f'<path d="M0,0 L0,-50 M0,0 L36,20" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
             f'<path d="M-90,-30 A95,95 0 0 1 -30,-90" fill="none" stroke="#fff" stroke-width="5" opacity=".6"/></g>')
    books = "".join(cut(f"M{120 + k * 4},{1350 - k * 52} H{360 - k * 10} V{1350 - (k + 1) * 52 + 6} H{120 + k * 4}Z", c, 2, u)
                    for k, c in enumerate((WATER, GREEN, TERRA, GOLD, ROOT)))
    papers = "".join(cut(f"M{x},{y} l40,-14 l26,30 l-12,34 l-44,6 l-20,-30Z", "#fbf7f0", 3, u) for x, y in ((520, 1440), (720, 1470), (860, 1420), (640, 1520)))
    phone = (cut("M820,1300 H900 V1440 H820Z", INK, 2, u) + f'<rect x="836" y="1318" width="48" height="16" rx="2" fill="none" stroke="#fff" stroke-width="2"/>'
             f'<rect x="838" y="1320" width="8" height="12" fill="#E5484D"/>')
    window = (cut("M120,180 H560 V700 H120Z", MIDNIGHT, 1, u)
              + f'<circle cx="440" cy="300" r="40" fill="#F4E4B0"/>'
              + cut("M120,180 H560 V700 H120Z M140,200 H330 V430 H140Z M350,200 H540 V430 H350Z M140,450 H330 V680 H140Z M350,450 H540 V680 H350Z", "#fbf7f0", 2, u, 'fill-rule="evenodd"'))
    return (f'<rect width="1080" height="1920" fill="{WALL}"/>'
            + window + cal + clock
            + mu(560, 1220, 1.15, u, pose, face, seated=True)
            + cut("M-20,1240 H1100 V1980 H-20Z", DESK, 3, u)
            + books + papers + phone
            + (train(560, 1560, u, .55, smoke) if smoke else "")
            + cut("M960,1340 h70 l-8,110 h-54Z", "#d9ecf2", 2, u, 'opacity=".9"'))


def k3():
    u = "t3"
    body = desk_scene(u, "tired") + box_frame(u) + badge(250, 560, 3) + arrow("M330,430 A80,80 0 1 1 250,350", u)
    return frame(u, body, WALL)


def k4():
    u = "t4"
    ball = cut("M520,1020 l50,-30 l40,26 l10,50 l-40,40 l-56,-6 l-24,-44Z", "#fbf7f0", 4, u)
    body = (desk_scene(u, "upset", "crumple", smoke=True) + ball
            + box_frame(u)
            + card(540, 1660, ["為什麼事情", "反而越來越亂？"], u, 62, who="小沐")
            + badge(980, 1500, 4))
    return frame(u, body, WALL)


def k5():
    u = "t5"
    ball = cut("M380,1180 l90,-60 l90,20 l40,90 l-30,100 l-110,40 l-100,-40 l-30,-100Z", "#fbf7f0", 3, u)
    creases = f'<path d="M470,1120 L520,1240 L440,1320 M560,1140 L520,1240 L600,1290" stroke="{INK}" stroke-opacity=".2" stroke-width="3" fill="none"/>'
    body = (f'<rect width="1080" height="1920" fill="{WALL}"/>'
            + cut("M-20,1300 H1100 V1980 H-20Z", DESK, 3, u)
            + ball + creases
            + deer(540, 1150, 2.1, u, head_only=True)
            + f'<path d="M400,1000 l-40,-40 M700,1000 l40,-40 M550,900 l0,-60" stroke="{GOLD}" stroke-width="8" stroke-linecap="round"/>'
            + box_frame(u)
            + card(540, 300, ["我是折折。"], u, 84, who="折折")
            + card(540, 560, ["專門幫助那些", "快把自己摺壞的人。"], u, 50, rot=1)
            + badge(820, 1130, 5))
    return frame(u, body, WALL)


def k6():
    u = "t6"
    compass = (cut("M0,-44 A44,44 0 1 0 0,44 A44,44 0 1 0 0,-44Z", "#fbf7f0", 2, u)
               + f'<path d="M0,-34 L10,0 L0,34 L-10,0Z" fill="{TERRA}"/>')
    inner = f'<g transform="translate({100 + 85} {1100 - 120})">{compass}</g>'
    doors = door(100, 1100, ROOT, "本", u, 1.0, inner)
    for k, (t, _m, c) in enumerate(MEMO[1:], 1):
        doors += door(100 + k * 178, 1100, c, t, u, 0)
    body = (f'<rect width="1080" height="1920" fill="#E8DCC4"/>'
            + cut(wave(1230, 16, 6, 21), SAND, 1, u)
            + doors
            + mu(200, 1640, .8, u, "stand", "open") + deer(420, 1640, .9, u)
            + box_frame(u)
            + card(540, 260, ["本：找到方向"], u, 80, color=ROOT, ink=PAPER)
            + badge(150, 640, 6) + arrow("M285,800 L440,800", u))
    return frame(u, body, "#E8DCC4")


def k7():
    u = "t7"
    cells = "".join(f'<rect x="{430 + k * 58}" y="900" width="44" height="140" rx="6" fill="{LIGHT if k < 3 else "#d8cdb8"}"/>' for k in range(4))
    body = (f'<rect width="1080" height="1920" fill="#F2E6CF"/>'
            + cut("M400,860 H680 V1080 H400Z M680,930 H710 V1010 H680Z", "#fbf7f0", 3, u, 'fill-rule="nonzero"') + cells
            + mu(540, 1560, 1.0, u, "stretch", "open")
            + P.sun(820, 560, 62, u)
            + box_frame(u)
            + card(540, 260, ["身：照顧自己"], u, 80, color=TERRA, ink=PAPER)
            + badge(930, 970, 7))
    return frame(u, body, "#F2E6CF")


def k8():
    u = "t8"
    tries = "".join(f'<g transform="translate({190 + k * 250} 640) rotate({(-6, 4, -3)[k]})">{cut("M0,0 H190 V120 H0Z", c, 2, u)}'
                    f'<text x="95" y="84" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="60" fill="#fff">{t}</text></g>'
                    for k, (t, c) in enumerate((("1 ✗", "#8a8a8a"), ("2 ✗", "#8a8a8a"), ("3 ✓", GREEN))))
    track = (cut("M-20,1240 Q540,1140 1100,1240 L1100,1290 Q540,1190 -20,1290Z", ROOT, 2, u)
             + "".join(f'<rect x="{x}" y="{1200 + abs(540 - x) * .18:.0f}" width="16" height="70" fill="{INK}" opacity=".4"/>' for x in range(20, 1080, 70)))
    body = (f'<rect width="1080" height="1920" fill="#DCE8EE"/>'
            + cut(wave(1500, 30, 5, 31), WATER, 2, u) + cut(wave(1600, 20, 5, 32), "#3F6B90", 3, u)
            + track + train(640, 1200, u, 1.0)
            + tries
            + box_frame(u)
            + card(540, 260, ["脈：根據回饋調整"], u, 76, color=WATER, ink=PAPER)
            + badge(140, 1100, 8))
    return frame(u, body, "#DCE8EE")


def k9():
    u = "t9"
    body = (f'<rect width="1080" height="1920" fill="{MIDNIGHT}"/>'
            + f'<circle cx="820" cy="420" r="60" fill="#F4E4B0"/>'
            + skyline(980, u, 1, "#2E3F57", 5) + skyline(1080, u, 2, "#3A5070", 9)
            + house(100, 1240, 170, 240, TERRA, u, 3, (2, 3)) + house(330, 1260, 150, 310, GREEN, u, 3, (2, 4))
            + house(560, 1240, 190, 230, ROOT, u, 3, (3, 3)) + house(800, 1260, 160, 280, GOLD, u, 3, (2, 3))
            + cut("M-20,1300 Q540,1230 1100,1300 L1100,1330 Q540,1260 -20,1330Z", "#fbf7f0", 3, u)
            + train(520, 1290, u, .8)
            + cut(wave(1420, 30, 5, 41), WATER, 3, u) + cut(wave(1530, 22, 5, 42), "#3F6B90", 4, u)
            + "".join(cut(leaf_d(x, 1880, 220, 70, a), DEEP, 4, u) for x, a in ((80, -70), (1000, -110), (180, -50)))
            + deer(930, 1010, .45, u)
            + box_frame(u)
            + f'<g transform="translate(110 220) rotate(-1.5)">{cut("M0,0 H860 V330 H0Z", "#fbf7f0", 3, u)}</g>'
            + f'<text x="540" y="360" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="96" fill="{INK}" letter-spacing="4">今天，</text>'
            + f'<text x="540" y="490" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="96" fill="{INK}" letter-spacing="4">先別把自己摺壞</text>'
            + badge(980, 760, 9))
    return frame(u, body, MIDNIGHT)


def k10():
    u = "t10"
    body = (f'<rect width="1080" height="1920" fill="#0f0e0d"/>'
            + cut("M-20,1320 L300,1320 L380,1240 L460,1320 L1100,1320 L1100,1980 L-20,1980Z", "#1d1b19", 2, u)
            + deer(380, 1240, .9, u, wink=True)
            + card(540, 760, ["明天記得睡覺。"], u, 76, color="#1d1b19", ink=PAPER, who="折折")
            + f'<text x="540" y="1620" text-anchor="middle" font-family="{SERIF}" font-weight="900" font-size="56" fill="{PAPER}" opacity=".5" letter-spacing="20">喀嚓</text>'
            + badge(860, 1200, 10))
    return frame(u, body, "#0f0e0d")


SHOTS = [
    dict(n="S1", name="剪出一座城市", f=(0, 60), frames=[(k1, 30), (k2, 54)], el="開場",
         visual="全黑。一張白紙展開，剪刀喀嚓、喀嚓沿著屋頂線剪過去。紙房子一層層站起來，窗戶亮起暖黃色的光，藍色紙河流過，小火車沿軌道前進。",
         motion=["① f0–30 剪刀沿虛線前進（每拍剪一下，刀刃開合 22°），剪過的地方紙片翹起",
                 "② f34–56 房子以底邊為鉸鏈一棟棟立起（立體書動作），窗戶依序亮燈；火車由右往左開"],
         trans="一隻手伸進畫面把城市攤平 → 鏡頭拉遠，原來是書桌上的設計圖",
         sound="剪刀喀嚓（每拍一聲）；紙張立起的「啪」；木琴主旋律第一句"),
    dict(n="S2", name="越努力越亂", f=(60, 135), frames=[(k3, 90), (k4, 124)], el="混亂",
         visual="書桌：堆高的課本、揉掉的紙、快沒電的手機、日曆寫著「創意節，倒數三天！」。窗外日夜交替，小沐熬夜熬到眼睛變成一條線。火車機關卡住冒煙，她把紙揉成一團。",
         motion=["③ 時鐘指針飛轉、窗外月亮與太陽交替（f60–100 每 4 格換一次）——時間加速",
                 "畫面越來越擠：紙片從四周堆進來，景深層數變少（劇本：前半段的世界越來越扁平擁擠）",
                 "④ f108 火車卡住冒煙；f116 小沐雙手往內揉，紙團成形（手臂繞兩腳釘旋轉）"],
         trans="喀嚓——整個畫面停住",
         sound="節奏加快：時鐘滴答、紙片碰撞、機械卡住的「喀啦」；f116 揉紙聲"),
    dict(n="S3", name="折折登場", f=(135, 195), frames=[(k5, 170)], el="折折",
         visual="靜止的畫面裡，紙團動了一下。一隻帶摺痕的紙鹿從紙團裡探出頭，鹿角像兩根小樹枝。紙卡：「我是折折。」「專門幫助那些快把自己摺壞的人。」",
         motion=["f135 全畫面凍結（音樂停），只剩紙團輕輕抖兩下",
                 "⑤ f150 紙團沿摺痕撐開，鹿頭像立體書一樣翻出來；鹿角最後「彈」出來",
                 "f160 第一張卡「我是折折。」，f175 第二張卡斜斜疊上"],
         trans="鹿角輕輕一頂，紙門一扇扇打開",
         sound="完全安靜 0.5 秒 → 紙團窸窣 → 鹿角彈出的輕響；溫暖的弦樂進來"),
    dict(n="S4", name="五扇紙門", f=(195, 315), frames=[(k6, 215), (k7, 262), (k8, 290)], el="五元",
         visual="五扇顏色不同的紙門：本、能、身、脈、留。每扇門打開都是劇本裡的一站，各給 0.8 秒——本：指南針與分岔路；能：三個紙偶一起動；身：電池一格格亮起，小沐伸懶腰；脈：火車試了三次終於通過；留：紙種子長成小樹。",
         motion=["⑥ 每 24 格開一扇門：門板以左緣為鉸鏈打開（門寬隨角度縮短），裡面的小場景從門後立起",
                 "記憶點紙卡蓋在畫面上方（劇本〈全片核心記憶點〉原文），卡片顏色＝那扇門的顏色",
                 "⑦ 身：電量格每 4 格亮一格，小沐雙手往上伸展",
                 "⑧ 脈：「1 ✗」「2 ✗」兩張灰卡快速蓋上，「3 ✓」綠卡蓋上時火車通過"],
         trans="第五扇門（留）開完，所有門往後倒下，變成整座紙城市的街道",
         sound="每開一扇門一聲木琴（音階往上爬：Do Re Mi Sol La）；脈第三次成功時一聲清脆的「叮」（劇本：不要英雄配樂）"),
    dict(n="S5", name="城市動起來", f=(315, 390), frames=[(k9, 350)], el="片名",
         visual="夜裡的紙城市終於有了層次：遠景兩層剪影、中景亮燈的房子、火車開過橋、前景的葉子。折折躲在屋頂上。片名紙卡：「今天，先別把自己摺壞」。",
         motion=["f315 窗戶一盞接一盞亮起（每 3 格一盞，由左到右）",
                 "⑨ 鏡頭緩慢推進，前、中、遠景以不同速度移動（多層視差）；f340 片名卡由上方垂下、晃兩下停住"],
         trans="燈全熄，只剩屋頂上的折折",
         sound="開場旋律回來，節奏更完整（劇本：前後呼應）"),
    dict(n="S6", name="明天記得睡覺", f=(390, 450), frames=[(k10, 420)], el="笑點",
         visual="全黑，屋頂剪影上只剩折折。對白卡：「明天記得睡覺。」折折偷偷眨一下眼。喀嚓——結束。",
         motion=["f396 對白卡出現；⑩ f420 折折眨眼（眼睛換成一道彎線，3 格）",
                 "f436 喀嚓：畫面像紙被剪刀從中間剪開，左右兩半往外掉，剩全黑 10 格"],
         trans="結尾",
         sound="f396 折折一句話的字卡音（輕敲）；f436 剪刀喀嚓——全片最後一個聲音"),
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
    col = {"開場": INK, "混亂": "#8a4a3a", "折折": "#b8a88e", "五元": GREEN, "片名": MIDNIGHT, "笑點": "#0f0e0d"}
    s = [f'<svg viewBox="0 0 {W} {H}" class="tl" role="img" aria-label="十五秒節奏圖">']
    for sec in range(16):
        x = sec * FPS * px
        s.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + 56}" stroke="currentColor" stroke-opacity="{.45 if sec % 5 == 0 else .15}"/>')
        if sec % 5 == 0 and sec < 15:
            s.append(f'<text x="{x + 3:.1f}" y="{top - 10}" class="tl-t">{sec}s</text>')
    for sh in SHOTS:
        a, b = sh["f"]
        s.append(f'<rect x="{a * px + 1:.1f}" y="{top + 4}" width="{(b - a) * px - 2:.1f}" height="40" rx="4" fill="{col[sh["el"]]}"/>')
        s.append(f'<text x="{(a + b) / 2 * px:.1f}" y="{top + 29}" text-anchor="middle" class="tl-s">{sh["n"]} {sh["el"]}</text>')
    for k, (t, _m, c) in enumerate(MEMO):
        x = (195 + k * 24 + 12) * px
        s.append(f'<circle cx="{x:.1f}" cy="{top + 54}" r="5" fill="{c}"/>')
    pts = [(0, .3), (55, .5), (60, .45), (130, .95), (135, .1), (170, .45), (195, .55), (315, .85), (370, 1), (390, .3), (420, .5), (436, .9), (449, 0)]
    y0, hh = H - 6, 46
    d = " ".join(f"{'M' if i == 0 else 'L'}{f * px:.1f},{y0 - v * hh:.1f}" for i, (f, v) in enumerate(pts))
    s.append(f'<path d="{d}" fill="none" stroke="{TERRA}" stroke-width="2.5"/><text x="4" y="{y0 - hh - 2}" class="tl-t">情緒</text></svg>')
    return "".join(s)


KEEP = [
    ("第一幕 剪出城市、越努力越亂", "保留", "前提：觀眾要先看到「努力卻越來越亂」，後面的方法才有意義"),
    ("第一幕 折折從紙團裡出現", "保留", "角色：預告最需要記住的就是這隻紙鹿"),
    ("第二幕 生命工作室、五個空格", "濃縮", "改成五扇紙門，省掉工作室與紙飛機列車"),
    ("第三～七幕 本能身脈留五站", "濃縮", "每站 0.8 秒，只留最有畫面的一個動作＋〈核心記憶點〉原句"),
    ("第八幕 調整與驗證按鈕", "省略", "15 秒放不下第七個概念；正片再講。結尾不提，避免變成名詞清單"),
    ("第九幕 創意節成功", "濃縮", "只留「城市亮燈、火車過橋」的結果畫面，不演過程"),
    ("終幕 世界地圖、摺成書", "省略", "預告不收尾——把答案留給正片"),
    ("終幕 「明天記得睡覺。」喀嚓", "保留", "最好的笑點，正好當預告的最後一拍"),
]


def build():
    keep = "".join(f'<tr><td>{a}</td><td><span class="st {"ok" if b == "保留" else "warn" if b == "濃縮" else "cut"}">{b}</span></td><td>{c}</td></tr>' for a, b, c in KEEP)
    cast = (f'<svg viewBox="-60 -480 1240 520" class="cast" role="img" aria-label="角色：小沐四個姿勢與折折">'
            + defs("cast")
            + mu(80, 0, .95, "cast", "stand", "open") + mu(320, 0, .95, "cast", "crumple", "upset")
            + mu(560, 0, .95, "cast", "stretch", "open") + mu(780, 0, .95, "cast", "stand", "tired")
            + deer(1010, 0, 1.1, "cast")
            + "".join(f'<text x="{x}" y="34" text-anchor="middle" font-family="{SERIF}" font-size="24" fill="{INK}">{t}</text>'
                      for x, t in ((80, "小沐・站立"), (320, "揉紙（生氣）"), (560, "伸展"), (780, "熬夜"), (1060, "折折")))
            + "</svg>")
    css = P.BASE_CSS + f"""
:root{{--red:{TERRA};--cream:{PAPER};--card:#fbf7f0;--line:#e3d6c0}}
body{{font-family:'Noto Serif TC','Noto Sans TC',serif}}
h1{{font-family:'Noto Serif TC',serif;font-weight:900;letter-spacing:.04em}} h1 em{{color:{TERRA};font-style:normal}}
.cast{{width:100%;height:auto;display:block;background:{PAPER};border:1px solid var(--line);border-radius:8px;margin:10px 0}}
.keep td{{vertical-align:top;font-size:14px}} .keep td:first-child{{width:auto;white-space:nowrap}}"""
    shots = "".join(shot_html(s) for s in SHOTS)
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>摺壞預告 紙雕分鏡</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
<style>{css}</style></head><body><main>
<div class="kicker">PAPER-CUT TEASER STORYBOARD · v1 待確認</div>
<h1>今天，<br><em>先別把自己摺壞</em></h1>
<ul class="meta"><li>15 秒預告</li><li>9:16 · 1080×1920</li><li>30 fps · 450 格</li><li>6 鏡 · 10 個關鍵格</li><li>國高中生・親子</li></ul>

<h2>怎麼做 <small>HOW</small></h2>
<p class="lead">5–6 分鐘的故事塞不進 15 秒——硬塞只會變成快轉的幻燈片。15 秒該做的是<b>預告</b>：
讓人看懂<b>前提</b>（越努力越亂）、記住<b>角色</b>（從紙團裡冒出來的紙鹿）、知道<b>承諾</b>（五扇門、一套方法），再用<b>一個笑點</b>收尾。</p>
<div class="insight">結構就是劇本本身的弧線，只是每段只留一個畫面：<b>亂 → 停 → 門 → 亮 → 笑</b>。
最大的情緒落差放在 4.5 秒：揉紙的最高點突然「喀嚓」全靜止，紙鹿才出現——這一秒的安靜是整支預告的鉤子。</div>
<h3>劇本取捨</h3>
<table class="keep"><tr><td><b>劇本段落</b></td><td></td><td><b>理由</b></td></tr>{keep}</table>

<h3>角色：剪紙人偶</h3>
<p>兩個角色都做成<b>剪紙人偶</b>：每個部位是一張獨立的紙，關節用金色兩腳釘固定，動畫時手臂就繞著釘子旋轉——
這是傳統剪紙動畫的做法，也正好符合劇本備註要的「手工製作的微小誤差」。小沐的毛衣是珊瑚色，刻意不用五元的任何一色，讓她在每一站都跳得出來。
折折是多面體摺紙造型，身上的摺痕用細線留著，鹿角是兩根小樹枝（褐色＝本的顏色）。</p>
{cast}

<h3>紙雕手法</h3>
<p>沿用上一份分鏡的七個做法（分層投影、切口受光、紙纖維、一拍兩格、立體書鉸鏈、多層視差）。這支多了兩件事：
<b>前亂後清</b>——混亂段落景深只剩一兩層、紙片擠滿畫面，城市亮燈時回到四層景深（劇本備註的要求）；
<b>對白用紙卡</b>——預告不配音，每句台詞是一張帶人名色條的紙卡，字都取自劇本原句。</p>

<h2>節奏圖 <small>TIMING</small></h2>
{timeline()}
<p>小色點是五扇門各自打開的時間（每 24 格一扇）。情緒曲線在 4.5 秒（揉紙→喀嚓）掉到最低，再從五扇門一路爬到片名。</p>

<h2>分鏡 <small>SHOTS</small></h2>
<p><span class="note">藍色編號與虛線</span>是動態註記，對應各鏡「動態」欄的圈號，不會出現在成片裡。</p>
{shots}

<h2>待你確認 <small>DECISIONS</small></h2>
<div class="q">
<div><b>15 秒做成「預告」，而不是把全片壓縮，可以嗎？</b><span>我取捨的原則見上面的表格。調整與驗證兩個按鈕在預告裡省略，留給正片。</span></div>
<div><b>比例：9:16 直式？</b><span>國高中生多在 Shorts／Reels 看到預告。若要放在正片前或課堂投影，16:9 我會重新構圖。</span></div>
<div><b>角色造型可以嗎？</b><span>小沐（珊瑚色毛衣、鮑伯頭、耳後一支鉛筆）和折折（摺痕紙鹿、樹枝鹿角）都是我依劇本描述畫的第一版。若已有角色設定稿，請給我，我照稿畫。</span></div>
<div><b>對白用紙卡、不配音？</b><span>我這裡無法錄製人聲。字卡全部取自劇本原句；之後若有配音檔，可以直接替換、不用改畫面。</span></div>
<div><b>配樂照劇本備註：木琴＋剪刀、紙張音效，程式合成？</b><span>喀嚓聲會出現三次：開場剪紙、4.5 秒凍結、最後一格。</span></div>
</div>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT, f"{len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
