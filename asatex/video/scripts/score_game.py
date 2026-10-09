#!/usr/bin/env python3
"""¿DÓNDE ESTÁ PANTY DE RED? 遊戲版配樂 —— 程式合成，版權乾淨。

120 BPM、C 大調 marimba，和弦一小節一個：C → Am → F → G → C。
音效事件全部用影格編號寫，和 src/game/world.ts 的時間軸一一對應。

    python3 scripts/score_game.py   →  public/score_game.wav
"""
import wave
from pathlib import Path

import numpy as np

SR, FPS, DUR = 48000, 30, 10.0
N = int(SR * DUR)
rng = np.random.default_rng(1012)
L = np.zeros(N)
R = np.zeros(N)


def t(n):
    return np.arange(n) / SR


def at(frame):
    return int(round(frame / FPS * SR))


def add(sig, frame, gain=1.0, pan=0.0):
    i = at(frame)
    sig = sig[: max(0, N - i)]
    a = (pan + 1) * np.pi / 4
    L[i:i + len(sig)] += sig * gain * np.cos(a)
    R[i:i + len(sig)] += sig * gain * np.sin(a)


def env(n, attack=0.002, decay=0.2):
    e = np.exp(-t(n) / decay)
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(float)
    m = np.convolve(m, np.hanning(64) / np.hanning(64).sum(), mode="same")
    return np.fft.irfft(X * m, len(x))


def room(x, wet=0.22, d=0.07, fb=0.5):
    n = int(d * SR)
    y = np.zeros(len(x) + n * 10)
    y[: len(x)] += x
    for k in range(1, 10):
        y[k * n: k * n + len(x)] += x * wet * fb ** k
    return y


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ── 音色 ──────────────────────────────────────────────────────
def marimba(m, dur=0.45):
    n = int(dur * SR)
    f = hz(m)
    x = t(n)
    s = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.22) + 0.35 * np.sin(2 * np.pi * f * 3.93 * x) * np.exp(-x / 0.05)
    click = bandpass(rng.standard_normal(n), 1500, 5000) * env(n, 0.0003, 0.003) * 0.15
    return (s + click) * env(n, 0.002, 10)


def bass(m, dur):
    n = int(dur * SR)
    x = t(n)
    s = np.sin(2 * np.pi * hz(m) * x)
    return np.tanh(s * 1.8) * env(n, 0.005, dur * 0.55) * 0.9


def kick():
    n = int(0.3 * SR)
    x = t(n)
    f = 50 + 70 * np.exp(-x / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.12)


def hat():
    n = int(0.05 * SR)
    return bandpass(rng.standard_normal(n), 7000, 15000) * env(n, 0.0005, 0.012) * 0.6


def clap():
    n = int(0.2 * SR)
    s = bandpass(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for k in (0, 0.01, 0.02):
        i = int(k * SR)
        e[i:] += np.exp(-t(n - i) / 0.03)
    return s * e * 0.5


def chip(m, dur=0.12, duty=0.3):
    """遊戲音效用的脈衝波（金幣、跳躍）。"""
    n = int(dur * SR)
    ph = (hz(m) * t(n)) % 1
    s = np.where(ph < duty, 1.0, -1.0) * 0.5
    return np.convolve(s, np.ones(6) / 6, mode="same") * env(n, 0.001, dur * 0.5)


def coin(m):
    a = chip(m, 0.07)
    b = chip(m + 5, 0.32)
    return np.concatenate([a, b])


def slide(m0, m1, dur, duty=0.5):
    n = int(dur * SR)
    f = hz(m0) * (hz(m1) / hz(m0)) ** np.linspace(0, 1, n)
    ph = np.cumsum(f) / SR % 1
    s = np.where(ph < duty, 1.0, -1.0) * 0.4
    return np.convolve(s, np.ones(8) / 8, mode="same") * env(n, 0.003, dur)


def boing(m=60):
    n = int(0.22 * SR)
    x = t(n)
    f = hz(m) * (1 + 0.6 * np.exp(-x / 0.05)) * (1 + 0.05 * np.sin(2 * np.pi * 14 * x))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.09)


def pop_():
    n = int(0.08 * SR)
    x = t(n)
    f = 900 * np.exp(-x / 0.02) + 200
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.025)


def thud(gain=1.0):
    n = int(0.45 * SR)
    x = t(n)
    f = 45 + 50 * np.exp(-x / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16)
    dust = bandpass(rng.standard_normal(n), 300, 3000) * env(n, 0.001, 0.05) * 0.5
    return np.tanh((body + dust) * 2) * gain


def whoosh(frames, lo=500, hi=5000):
    n = int(frames / FPS * SR)
    return bandpass(rng.standard_normal(n), lo, hi) * np.sin(np.linspace(0, np.pi, n)) ** 2


def sparkle(ms, step=0.035, gain=0.5):
    out = np.zeros(int((len(ms) * step + 0.6) * SR))
    for k, m in enumerate(ms):
        c = chip(m + 12, 0.08, 0.5)
        s = marimba(m + 12, 0.5) * 0.6
        s[: len(c)] += c * 0.3
        i = int(k * step * SR)
        out[i:i + len(s)] += s
    return room(out * gain, 0.3)


# ── 音樂：marimba 琶音＋貝斯＋輕鼓 ───────────────────────────
CHORDS = [(48, [0, 4, 7]), (45, [0, 3, 7]), (41, [0, 4, 7]), (43, [0, 4, 7]), (48, [0, 4, 7])]  # C Am F G C
PATTERN = [0, 2, 1, 2, 3, 2, 1, 2]  # 和弦音索引（第 3 個 = 高八度根音）
for bar, (root, tri) in enumerate(CHORDS):
    tones = [root + 24 + tri[0], root + 24 + tri[1], root + 24 + tri[2], root + 36 + tri[0]]
    for k in range(8 if bar == 4 else 16):  # 最後一小節後半交給過關旋律
        f = bar * 60 + k * 7.5
        m = tones[PATTERN[k % 8]]
        add(marimba(m), f, 0.32 if k % 2 == 0 else 0.22, -0.25 if k % 2 else 0.25)
    if bar >= 1:  # 第 1 小節只有 marimba，海豚出生後貝斯進來
        for b in (0, 30):
            add(bass(root, 0.95), bar * 60 + b, 0.38)

for f in range(75, 226, 15):
    add(kick(), f, 0.5)
for f in range(90, 226, 30):
    add(clap(), f, 0.28)
for f in range(75, 226, 7):
    add(hat(), f + 0.5, 0.18, 0.3)

# ── 音效（影格對應 world.ts）──────────────────────────────────
add(whoosh(8, 800, 6000), 7, 0.3)                   # 任務卡
add(slide(84, 60, 0.18), 15, 0.18)                  # 圖釘下墜
add(thud(0.5), 21, 0.6)                             # 圖釘著地
add(marimba(79, 0.5), 21, 0.3)
add(whoosh(8, 600, 4000), 30, 0.25)                 # 收集欄
add(pop_(), 45, 0.6)                                # 海豚出生
for k in range(10):                                 # Dijkstra 擴散：上行小音
    add(chip(72 + k * 2, 0.04, 0.5), 48 + k * 1.2, 0.12, -0.5 + k * 0.1)
add(coin(84), 60, 0.25)                             # 路線鎖定
add(slide(67, 79, 0.16), 66, 0.22)                  # ¡VAMOS!
for f in range(75, 180, 7):                         # 尾鰭彈跳的步伐
    if all(abs(f - c) > 4 for c in (90, 120, 150)):
        add(pop_()[: int(0.04 * SR)], f + 3, 0.18)
for c in (90, 120, 150):                            # 轉角大跳
    add(boing(62), c - 5, 0.45)
for p, m in zip((105, 135, 165), (72, 76, 79)):     # 撿取：C → E → G
    add(coin(m), p, 0.33)
add(sparkle([72, 76, 79, 84]), 175, 0.6)            # 湊滿一打：和弦
add(marimba(84, 0.8), 180, 0.35)                    # 到站
add(sparkle([79, 84, 88]), 182, 0.4)                # ¡1 DOCENA!
add(slide(88, 64, 0.2), 195, 0.15)                  # 紙箱下墜
add(thud(1.0), 201, 0.8)                            # 紙箱著地
add(sparkle([72, 76, 79, 84, 88, 91], 0.045, 0.6), 210, 0.7)   # 開箱
add(whoosh(8, 1500, 9000), 225, 0.35)               # 道具卡翻面
add(slide(60, 84, 0.4, 0.25), 240, 0.12)            # 屬性條灌滿
add(thud(1.2), 255, 0.8)                            # ×100 蓋章
for k, m in enumerate((84, 88, 91, 96)):
    add(coin(m), 256 + k * 1.5, 0.15, -0.3 + k * 0.2)
for m in (60, 64, 67):                              # ¡MISIÓN CUMPLIDA! 號角
    add(chip(m + 12, 0.5, 0.25), 258, 0.12)
add(whoosh(10, 300, 3000), 268, 0.35)               # 拉遠
for k, m in enumerate((72, 76, 79, 84)):            # 過關旋律
    add(marimba(m, 0.7) + np.pad(chip(m, 0.14, 0.5) * 0.3, (0, int(0.56 * SR))), 274 + k * 3.75, 0.35)
add(bass(36, 1.2), 274, 0.4)
add(boing(55), 287, 0.4)                            # 海豚落地
add(sparkle([84, 88, 91, 96], 0.05, 0.5), 290, 0.6) # 收尾閃光

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89
fade = int(0.1 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = Path(__file__).resolve().parent.parent / "public" / "score_game.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(out)
