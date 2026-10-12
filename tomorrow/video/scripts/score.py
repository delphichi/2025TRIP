#!/usr/bin/env python3
"""《每次都說明天開始的男孩》90 秒配樂 —— 程式合成，版權乾淨，每個音對準畫面。

主題：每次出現「明天」都是同一個上揚的木琴三音（觀眾會開始期待它）；
結尾最後一個音是它的反向（下行），故事完成一個循環。
0:44–0:48 全片第一次安靜；第一題寫完前音樂暫停半秒，再一聲「叮」。

    python3 scripts/score.py  →  public/score.wav
"""
import wave
from pathlib import Path

import numpy as np

SR, DUR = 48000, 90.0
N = int(SR * DUR)
rng = np.random.default_rng(1014)
L = np.zeros(N)
R = np.zeros(N)


def t(n):
    return np.arange(n) / SR


def add(sig, sec, gain=1.0, pan=0.0):
    i = int(round(sec * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i]
    a = (pan + 1) * np.pi / 4
    L[i:i + len(sig)] += sig * gain * np.cos(a)
    R[i:i + len(sig)] += sig * gain * np.sin(a)


def env(n, a=0.002, d=0.2):
    e = np.exp(-t(n) / d)
    k = max(1, int(a * SR))
    e[:k] *= np.linspace(0, 1, k)
    return e


def bp(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(float)
    m = np.convolve(m, np.hanning(64) / np.hanning(64).sum(), mode="same")
    return np.fft.irfft(X * m, len(x))


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def room(x, wet=0.25, d=0.06, fb=0.5):
    n = int(d * SR)
    y = np.zeros(len(x) + n * 10)
    y[: len(x)] += x
    for k in range(1, 10):
        y[k * n: k * n + len(x)] += x * wet * fb ** k
    return y


# ── 音色 ──────────────────────────────────────────────────────
def xylo(m, dur=0.5):
    n = int(dur * SR)
    f, x = hz(m), t(n)
    s = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.16) + 0.4 * np.sin(2 * np.pi * f * 3.0 * x) * np.exp(-x / 0.04)
    s += bp(rng.standard_normal(n), 2000, 7000) * env(n, 0.0003, 0.004) * 0.15
    return room(s * 0.8, 0.2)


def pluck(m, dur=0.3):
    n = int(dur * SR)
    x = t(n)
    return np.sin(2 * np.pi * hz(m) * x) * np.exp(-x / 0.07) * 0.6


def pizz(m, dur=0.35):
    """低音撥弦：基音＋二倍音，快速衰減。"""
    n = int(dur * SR)
    x = t(n)
    f = hz(m)
    return (np.sin(2 * np.pi * f * x) + 0.35 * np.sin(4 * np.pi * f * x)) * np.exp(-x / 0.11) * env(n, 0.003, 10) * 0.8


def pad(ms, dur, cutoff=900, att=0.4, rel=0.5):
    n = int(dur * SR)
    x = t(n)
    s = sum((2 * ((hz(m) * (1 + d) * x) % 1) - 1) for m in ms for d in (-0.002, 0.002)) / (len(ms) * 2)
    X = np.fft.rfft(s)
    f = np.fft.rfftfreq(n, 1 / SR)
    s = np.fft.irfft(X / (1 + (f / cutoff) ** 4), n)
    e = np.minimum(1, x / att) * np.minimum(1, (dur - x) / rel)
    return s * np.clip(e, 0, 1) * 0.5


def bass(m, dur):
    n = int(dur * SR)
    x = t(n)
    return np.tanh(np.sin(2 * np.pi * hz(m) * x) * 1.6) * env(n, 0.005, dur * 0.5) * 0.8


def rustle(dur=0.25, lo=1500, hi=7000, density=120):
    n = int(dur * SR)
    grains = np.zeros(n)
    for _ in range(max(1, int(dur * density))):
        i = rng.integers(0, max(1, n - 200))
        grains[i:i + 200] += rng.standard_normal(200)[: n - i] * np.hanning(200)[: n - i] * rng.uniform(0.2, 1)
    return bp(grains, lo, hi) * np.sin(np.linspace(0, np.pi, n)) * 0.8


def paper_pop():
    n = int(0.2 * SR)
    x = t(n)
    thump = np.sin(2 * np.pi * np.cumsum(140 + 260 * np.exp(-x / 0.01)) / SR) * env(n, 0.001, 0.04)
    out = thump * 0.8
    r = rustle(0.12, 2000, 8000)
    out[: len(r)] += r * 0.4
    return out


def fold():
    """紙張摺疊的清脆一聲。"""
    n = int(0.09 * SR)
    return bp(rng.standard_normal(n), 2500, 9000) * env(n, 0.0005, 0.012) + bp(rng.standard_normal(n), 400, 1500) * env(n, 0.001, 0.02) * 0.4


def tick(f0=1800):
    n = int(0.04 * SR)
    return np.sin(2 * np.pi * f0 * t(n)) * env(n, 0.0005, 0.006) + bp(rng.standard_normal(n), 3000, 8000) * env(n, 0.0003, 0.003) * 0.3


def thud(g=1.0):
    n = int(0.3 * SR)
    x = t(n)
    return np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-x / 0.03)) / SR) * env(n, 0.001, 0.08) * g


def whoosh(dur, lo=400, hi=4000):
    n = int(dur * SR)
    return bp(rng.standard_normal(n), lo, hi) * np.sin(np.linspace(0, np.pi, n)) ** 2


def slide(m0, m1, dur=0.35):
    """滑音笛：長高的「咻」。"""
    n = int(dur * SR)
    x = t(n)
    f = hz(m0) * (hz(m1) / hz(m0)) ** (x / dur)
    vib = 1 + 0.01 * np.sin(2 * np.pi * 7 * x)
    s = np.sin(2 * np.pi * np.cumsum(f * vib) / SR)
    return s * np.minimum(1, x / 0.02) * np.minimum(1, (dur - x) / 0.05) * 0.5


def scratch(dur, rate=9):
    """鉛筆在紙上：帶通雜訊＋一筆一筆的起伏。"""
    n = int(dur * SR)
    x = t(n)
    am = 0.55 + 0.45 * np.abs(np.sin(np.pi * rate * x + rng.uniform(0, 3)))
    return bp(rng.standard_normal(n), 2500, 8000) * am * np.minimum(1, x / 0.03) * np.minimum(1, (dur - x) / 0.03) * 0.5


def rub(dur):
    n = int(dur * SR)
    x = t(n)
    return bp(rng.standard_normal(n), 300, 2200) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * x)) * np.minimum(1, (dur - x) / 0.05) * 0.6


def click():
    n = int(0.05 * SR)
    return bp(rng.standard_normal(n), 1000, 6000) * env(n, 0.0002, 0.004) + np.sin(2 * np.pi * 900 * t(n)) * env(n, 0.0005, 0.01) * 0.5


def chime(ms, step=0.04, g=0.5):
    out = np.zeros(int((len(ms) * step + 0.9) * SR))
    for k, m in enumerate(ms):
        s = xylo(m + 12, 0.8)
        i = int(k * step * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * g


def ashita(sec, g=0.5):
    """「明天」的聲音：紙張彈開＋上揚的三個音。"""
    add(paper_pop(), sec, 0.7)
    for k, m in enumerate((79, 84, 88)):
        add(xylo(m, 0.5), sec + k * 0.055, g * (0.8 + k * 0.1), -0.2 + k * 0.2)


# ── 主旋律（C 大調，120 BPM，一拍 0.5 秒）─────────────────────────
THEME = [(0, 72), (1, 76), (1.5, 79), (2, 84), (3, 79), (4, 76), (4.5, 74), (5, 72), (6, 74), (7, 67)]
CHORDS = [48, 53, 55, 48]  # 每兩拍一個根音：C F G C


def theme(start, beat=0.5, gain=0.26, bars=1, bassg=0.22):
    for b in range(bars):
        off = start + b * 8 * beat
        for pos, m in THEME:
            add(xylo(m, 0.5), off + pos * beat, gain, 0.15)
        for k, r in enumerate(CHORDS):
            add(pizz(r, 0.4), off + k * 2 * beat, bassg, -0.25)
            add(pizz(r + 7, 0.3), off + (k * 2 + 1) * beat, bassg * 0.7, -0.25)


# ── S1 0–4：房間的空氣，2.58 秒第一個「明天」────────────────────
add(pad([60, 64, 67], 4.0, 700, 1.0, 1.0), 0, 0.18)
add(rustle(0.4, 800, 4000, 60), 0.2, 0.15)
ashita(62 / 24)

# ── S2 4–15：手機、三連啪、旁白 ─────────────────────────────────
theme(4.0, bars=2, gain=0.22)
ashita(4 + 53 / 24, 0.45)
for s in (10.42, 10.92, 11.42):
    ashita(s, 0.5)
    add(thud(0.8), s, 0.35)
for s in (11.72, 11.92, 12.12, 12.27):
    add(paper_pop(), s, 0.35, 0.3)
theme(12.0, bars=1, gain=0.16, bassg=0.15)
add(pad([60, 65, 69], 3.0, 800), 12.0, 0.15)

# ── S3 15–21：夜，日曆在抖、一張張摺起來 ─────────────────────────
add(pad([48, 55, 63], 6.0, 500, 1.0, 1.0), 15.0, 0.22)
for k in range(12):
    add(rustle(0.06, 2500, 7000, 300), 15.6 + k * 0.09, 0.22, -0.3)
add(whoosh(0.3, 600, 3000), 16.67, 0.3)
add(thud(0.5), 17.0, 0.4)
s = 17.2
gap = 0.32
while s < 20.2:
    add(fold(), s, 0.55, rng.uniform(-0.5, 0.5))
    s += gap
    gap = max(0.07, gap * 0.9)
add(bass(36, 1.2), 20.3, 0.5)
add(chime([72, 79]), 20.3, 0.35)

# ── S4 21–31：明天先生（撥弦低音走路）──────────────────────────
WALK = [36, 43, 39, 43, 36, 43, 41, 43]
for k in range(19):
    add(pizz(WALK[k % 8], 0.35), 21.0 + k * 0.5, 0.3, -0.2)
for k, m in enumerate((67, 70, 72, 75)):
    add(xylo(m, 0.4), 22.0 + k * 1.0, 0.12, 0.3)
add(rustle(0.3, 600, 3000), 24.6, 0.4)  # 胸前那頁打開
for k in range(5):
    add(paper_pop(), 24.6 + 2 * (0.3 + 0.13 * k), 0.4, -0.4 + k * 0.2)
    add(xylo(72 + (0, 2, 4, 5, 7)[k], 0.3), 24.6 + 2 * (0.3 + 0.13 * k), 0.2)
add(slide(60, 79, 0.35), 29.0, 0.5)  # 說「明天」→ 長高
ashita(29.0, 0.35)
add(slide(64, 84, 0.3), 30.2, 0.45)
for k in range(4):
    add(pizz(WALK[k] + 2, 0.35), 29.5 + k * 0.5, 0.3, -0.2)

# ── S5 31–38：日子一天天過去（滴答越來越快，音一路往上爬）──────────
s = 31.0
gap = 0.5
while s < 38.0:
    add(tick(1800 if int(s * 4) % 2 else 1400), s, 0.3, 0.4)
    s += gap
    gap = max(0.17, gap * 0.95)
for k in range(28):
    sec = 31.0 + k * 0.25
    add(rustle(0.08, 1500, 7000, 200), sec, 0.18, rng.uniform(-0.6, 0.6))
    add(xylo(60 + (k % 4) * 3 + k // 4, 0.25), sec, 0.1 + k * 0.004, 0.2)
for d in range(3):
    add(pad([48 + d * 2, 55 + d * 2, 60 + d * 2], 2.3, 600), 31.0 + d * 56 / 24, 0.16)
    add(bass(36 + d * 2, 0.8), 31.0 + d * 56 / 24, 0.3)

# ── S6 38–44：三個插入、爬紙山、「下週一定開始」───────────────────
for k in range(3):
    add(whoosh(0.15, 800, 5000), 38.0 + k * 0.667, 0.35)
    add(rustle(0.5, 1000, 6000, 260), 38.02 + k * 0.667, 0.5, (-0.4, 0.4, 0)[k])
for k in range(10):
    add(rustle(0.14, 400, 3000, 200), 40.0 + k * 0.23, 0.45, -0.3 + k * 0.06)
    add(thud(0.4), 40.0 + k * 0.23, 0.25)
for k in range(9):
    add(pizz(43 + k, 0.3), 40.0 + k * 0.25, 0.25)
ashita(42.4, 0.5)
add(pad([55, 62, 67], 1.6, 900), 42.4, 0.15)

# ── S7 44–48：全片第一次安靜 ────────────────────────────────────
for k in range(6):
    add(rustle(0.4, 2000, 6000, 30), 44.3 + k * 0.62, 0.08, rng.uniform(-0.7, 0.7))

# ── S8 48–55：撿起紙條、攤平；52.5 檯燈「喀」────────────────────
add(pad([57, 60, 64], 4.6, 600, 1.5, 0.5), 48.0, 0.14)
add(rustle(0.3, 1500, 6000), 49.2, 0.35)
add(rustle(1.3, 1000, 6000, 160), 50.7, 0.4)
add(click(), 52.5, 0.7)
add(pad([60, 64, 67, 71], 2.6, 1100, 0.6, 0.4), 52.5, 0.2)
add(xylo(72, 1.0), 53.0, 0.15)
add(xylo(76, 1.0), 54.0, 0.12)

# ── S9 55–64：第一題（音樂退到最低，只剩鉛筆）──────────────────────
add(pad([48, 55, 64], 5.4, 500, 1.0, 1.0), 55.0, 0.1)
add(scratch(1.6), 55.6, 0.5, 0.1)
add(rub(0.6), 57.7, 0.4, 0.1)
add(scratch(0.5), 58.5, 0.5, 0.1)
add(scratch(1.3), 59.3, 0.5, 0.1)
add(xylo(88, 1.2), 61.5, 0.55)  # 叮！
add(chime([84, 91], 0.05, 0.3), 61.52, 0.4)
add(pad([60, 64, 67, 72], 2.5, 1300), 61.5, 0.2)

# ── S10 64–70：笑、紙飛機 ──────────────────────────────────────
add(pad([60, 64, 69], 6.0, 1100, 1.0, 1.0), 64.0, 0.2)
for k, m in enumerate((72, 76, 79, 76, 81, 79)):
    add(xylo(m, 0.6), 64.3 + k * 0.5, 0.14, 0.2)
add(rustle(0.4, 2000, 8000, 200), 67.25, 0.4)
add(whoosh(1.6, 500, 3500), 67.6, 0.3)
add(slide(76, 64, 0.3), 68.8, 0.35)  # 做完一件，他就變小一點

# ── S11 70–80：清晨，三個紙盒（開場旋律回來，稍慢）────────────────
theme(70.6, beat=0.6, bars=1, gain=0.22)
theme(75.4, beat=0.6, bars=1, gain=0.18)
add(pad([60, 64, 67], 5.0, 900, 1.5, 1.0), 70.0, 0.15)
BOX_NOTE = [72, 67, 76]
for i, b in enumerate([0, 2, 1, 0, 1, 2, 2, 0, 1]):
    s0 = 70 + (26 + i * 16) / 24
    add(whoosh(0.4, 900, 4000), s0, 0.18, 0.5 - b * 0.4)
    add(thud(0.4), s0 + 0.5, 0.3)
    add(xylo(BOX_NOTE[b], 0.3), s0 + 0.5, 0.2, -0.5 + b * 0.5)
add(scratch(1.7, 11), 77.33, 0.5)
add(whoosh(0.4, 2000, 6000), 79.2, 0.25)

# ── S12 80–86：空白的日曆 ──────────────────────────────────────
add(pad([60, 65, 69, 72], 6.0, 1000, 1.0, 1.0), 80.0, 0.2)
for k in range(4):
    add(rustle(0.25, 2000, 8000), 80.2 + k * 0.25, 0.3, 0.3)
for k, m in enumerate((72, 74, 76, 79, 77, 76)):
    add(xylo(m, 0.7), 80.6 + k * 0.85, 0.13, -0.2)
add(rustle(0.2, 1500, 6000), 84.6, 0.35)
add(xylo(79, 0.6), 84.75, 0.3)  # 問號：上揚的兩個音
add(xylo(86, 0.8), 84.95, 0.3)

# ── S13 86–90：拉遠，主旋律收尾，最後是「明天」的反向 ───────────────
add(pad([48, 60, 64, 67], 4.0, 1000, 0.5, 1.2), 86.0, 0.25)
add(whoosh(1.8, 200, 2000), 86.0, 0.25)
for pos, m in THEME[:6]:
    add(xylo(m, 0.6), 86.2 + pos * 0.36, 0.2, 0.15)
for k, m in enumerate((88, 84, 79)):
    add(xylo(m, 1.6 if k == 2 else 0.6), 88.4 + k * 0.28, 0.42 - k * 0.04, 0.2 - k * 0.2)
for k in range(5):
    add(rustle(0.08, 1500, 5000), 86.9 + k * 0.5, 0.1, 0.4)

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = Path(__file__).resolve().parent.parent / "public" / "score.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(out)
