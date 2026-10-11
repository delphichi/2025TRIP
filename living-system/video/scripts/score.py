#!/usr/bin/env python3
"""《今天，先別把自己摺壞》預告配樂 —— 程式合成，版權乾淨，每個音對準影格。

照劇本〈音樂與音效〉備註：開場木琴＋剪刀＋紙張摩擦；混亂時節奏加快、時鐘滴答、機械卡住；
凍結時全靜；五扇門用音階往上爬；脈第三次成功只用一個清脆音；結尾回到開場旋律，最後一聲喀嚓。

    python3 scripts/score.py  →  public/score.wav
"""
import wave
from pathlib import Path

import numpy as np

SR, FPS, DUR = 48000, 30, 15.0
N = int(SR * DUR)
rng = np.random.default_rng(426)
L = np.zeros(N)
R = np.zeros(N)


def t(n):
    return np.arange(n) / SR


def add(sig, frame, gain=1.0, pan=0.0):
    i = int(round(frame / FPS * SR))
    if i >= N:
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
    """木琴：基音＋第 3 泛音，敲擊瞬間帶一點木頭雜音。"""
    n = int(dur * SR)
    f, x = hz(m), t(n)
    s = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.16) + 0.4 * np.sin(2 * np.pi * f * 3.0 * x) * np.exp(-x / 0.04)
    s += bp(rng.standard_normal(n), 2000, 7000) * env(n, 0.0003, 0.004) * 0.15
    return room(s * env(n, 0.001, 10) * 0.8, 0.2)


def pluck(m, dur=0.3):
    n = int(dur * SR)
    x = t(n)
    return np.sin(2 * np.pi * hz(m) * x) * np.exp(-x / 0.07) * 0.6


def pad(ms, dur, cutoff=900):
    n = int(dur * SR)
    x = t(n)
    s = sum((2 * ((hz(m) * (1 + d) * x) % 1) - 1) for m in ms for d in (-0.002, 0.002)) / (len(ms) * 2)
    X = np.fft.rfft(s)
    f = np.fft.rfftfreq(n, 1 / SR)
    s = np.fft.irfft(X / (1 + (f / cutoff) ** 4), n)
    e = np.minimum(1, x / 0.4) * np.minimum(1, (dur - x) / 0.5)
    return s * e * 0.5


def bass(m, dur):
    n = int(dur * SR)
    x = t(n)
    return np.tanh(np.sin(2 * np.pi * hz(m) * x) * 1.6) * env(n, 0.005, dur * 0.5) * 0.8


def snip(gain=1.0):
    """剪刀喀嚓：兩次金屬刃口的咬合＋短促的金屬餘響。"""
    n = int(0.25 * SR)
    x = t(n)
    out = np.zeros(n)
    for k, off in enumerate((0.0, 0.028)):
        i = int(off * SR)
        clk = bp(rng.standard_normal(n - i), 2500, 9000) * env(n - i, 0.0002, 0.006)
        out[i:] += clk * (1.0 if k else 0.7)
    ring = (np.sin(2 * np.pi * 3200 * x) + 0.6 * np.sin(2 * np.pi * 4710 * x)) * np.exp(-x / 0.05) * 0.15
    return (out + ring) * gain


def rustle(dur=0.25, lo=1500, hi=7000):
    n = int(dur * SR)
    grains = np.zeros(n)
    for _ in range(int(dur * 120)):
        i = rng.integers(0, n - 200)
        grains[i:i + 200] += rng.standard_normal(200) * np.hanning(200) * rng.uniform(0.2, 1)
    return bp(grains, lo, hi) * np.sin(np.linspace(0, np.pi, n)) * 0.8


def paper_pop():
    n = int(0.2 * SR)
    x = t(n)
    thump = np.sin(2 * np.pi * np.cumsum(140 + 260 * np.exp(-x / 0.01)) / SR) * env(n, 0.001, 0.04)
    out = thump * 0.8
    r = rustle(0.12, 2000, 8000)
    out[: len(r)] += r * 0.4
    return out


def tick():
    n = int(0.04 * SR)
    return np.sin(2 * np.pi * 1800 * t(n)) * env(n, 0.0005, 0.006) + bp(rng.standard_normal(n), 3000, 8000) * env(n, 0.0003, 0.003) * 0.3


def thud(g=1.0):
    n = int(0.3 * SR)
    x = t(n)
    return np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-x / 0.03)) / SR) * env(n, 0.001, 0.08) * g


def crunch(dur=0.35):
    n = int(dur * SR)
    s = bp(rng.standard_normal(n), 200, 2500) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * t(n))))
    return s * env(n, 0.002, dur * 0.6)


def whoosh(frames, lo=400, hi=4000):
    n = int(frames / FPS * SR)
    return bp(rng.standard_normal(n), lo, hi) * np.sin(np.linspace(0, np.pi, n)) ** 2


def boing(m=67):
    n = int(0.25 * SR)
    x = t(n)
    f = hz(m) * (1 + 0.5 * np.exp(-x / 0.04)) * (1 + 0.04 * np.sin(2 * np.pi * 16 * x))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.1)


def chime(ms, step=0.04, g=0.5):
    out = np.zeros(int((len(ms) * step + 0.8) * SR))
    for k, m in enumerate(ms):
        s = xylo(m + 12, 0.7)
        i = int(k * step * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * g


# ── S1 0–54：開場旋律（木琴，八分音符 7.5 格）──────────────────
MELODY = [67, 72, 76, 79, 76, 72, 74]
add(rustle(0.35, 800, 5000), 0, 0.5)
for k, m in enumerate(MELODY):
    add(xylo(m), 2 + k * 7.5, 0.42, -0.2 + k * 0.06)
for f in (10, 16, 22, 28):
    add(snip(0.55), f, 1.0, 0.3)
for k in range(5):
    add(paper_pop(), 28 + k * 3, 0.45, -0.4 + k * 0.2)
for k in range(8):
    add(pluck(84 + (0, 2, 4, 7, 9, 12, 7, 4)[k]), 38 + k * 2, 0.22, 0.3)
add(whoosh(10, 300, 2500), 44, 0.3)

# ── S2 54–126：越努力越亂（節奏加快、滴答、卡住、揉紙）─────────
for f in np.arange(56, 124, 3.75):
    k = int((f - 56) / 3.75)
    add(xylo(72 + (0, 3, 7, 10, 12, 10, 7, 3)[k % 8] + (k // 8) * 2, 0.25), f, 0.22 + k * 0.004, -0.3 if k % 2 else 0.3)
for f in range(56, 126, 4):
    add(tick(), f, 0.35, 0.5)
for k in range(10):
    add(thud(0.6), 54 + 4 + (k + 1) * 6 + 4, 0.35, -0.5 + k * 0.1)
add(crunch(0.45), 94, 0.5)
for k in range(8):
    add(rustle(0.08, 1200, 6000), 102 + k * 1.5, 0.5)
add(bass(41, 0.9), 96, 0.35)

# ── S3 126–210：喀嚓 → 全靜 → 紙鹿 ────────────────────────────
add(snip(1.0), 126, 1.0)
add(rustle(0.12, 1000, 5000), 132, 0.4)
add(rustle(0.12, 1000, 5000), 137, 0.4)
add(whoosh(10, 300, 3000), 140, 0.4)
add(paper_pop(), 152, 0.7)
add(chime([72, 76, 79]), 153, 0.5)
add(boing(70), 158, 0.45)
add(pad([53, 60, 65, 69], 2.0, 700), 152, 0.35)
add(tick(), 162, 0.3)
add(tick(), 172, 0.3)
add(xylo(77, 0.6), 162, 0.25)
add(xylo(81, 0.6), 172, 0.25)

# ── S4 210–332：五扇門，音階往上爬 Do Re Mi Sol La ─────────────
for k in range(5):
    add(paper_pop(), 210 + k * 1.5, 0.25, -0.4 + k * 0.2)
SCALE = [72, 74, 76, 79, 81]
CHORD = [[60, 64, 67], [62, 65, 69], [60, 64, 67], [59, 62, 67], [57, 60, 64]]
for k, start in enumerate((222, 244, 266, 288, 310)):
    add(whoosh(8, 500, 4500), start, 0.35)
    add(xylo(SCALE[k], 0.8), start + 3, 0.55)
    add(pad(CHORD[k], 0.75, 1100), start + 3, 0.25)
    add(bass(SCALE[k] - 36, 0.7), start + 3, 0.3)
for k in range(8):                                  # 本：指南針越轉越慢
    add(tick(), 225 + k * (1 + k * 0.35), 0.22)
for f in range(247, 266, 4):                        # 能：齒輪
    add(tick(), f, 0.2, -0.3)
for k in range(4):                                  # 身：充電
    add(pluck(76 + k * 4, 0.25), 270 + k * 4, 0.35)
add(thud(0.8), 291, 0.5)                            # 脈：失敗兩次
add(thud(0.8), 295, 0.5)
add(xylo(88, 1.0), 299, 0.55)                       # 第三次成功：只要一個清脆音
add(paper_pop(), 317, 0.4)                          # 留：種子落土
add(chime([72, 76, 79, 84], 0.06, 0.45), 320, 0.6)

# ── S5 332–390：開場旋律回來，更完整 ──────────────────────────
for k, m in enumerate(MELODY + [79]):
    add(xylo(m, 0.6), 334 + k * 7.5, 0.45)
add(pad([60, 64, 67, 71], 1.9, 1200), 334, 0.32)
add(bass(48, 0.9), 334, 0.32)
add(bass(53, 0.9), 364, 0.32)
for k in range(10):
    add(pluck(84 + (0, 4, 7, 12)[k % 4], 0.2), 334 + k * 2, 0.16, -0.5 + k * 0.1)
add(thud(0.5), 346, 0.4)

# ── S6 390–450：熄燈、一句話、眨眼、喀嚓 ──────────────────────
add(tick(), 392, 0.5)
add(xylo(72, 1.2), 400, 0.3)
add(chime([84, 91], 0.05, 0.3), 424, 0.5)
add(snip(1.0), 436, 1.0)
add(whoosh(10, 200, 2000), 437, 0.3)

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89
fade = int(0.05 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = Path(__file__).resolve().parent.parent / "public" / "score.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(out)
