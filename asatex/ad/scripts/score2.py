"""ASATEX 3D 展示間廣告配樂：明亮的流行電子（120 bpm，D 大調），numpy 合成，剪接點對齊 src/Showroom.tsx 的 SHOTS。

輸出 public/showroom/score.wav（48 kHz 立體聲，30 秒）。執行：python3 scripts/score2.py
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
BAR = 2.0
rng = np.random.default_rng(11)
OUT = Path(__file__).resolve().parent.parent / "public" / "showroom" / "score.wav"

CUTS = [3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 26]  # 換鏡頭的時間（秒）

L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def add(sig, at, pan=0.0, gain=1.0):
    i = int(round(at * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(freq, sec, detune=0.0):
    ph = freq * (1 + detune) * t_axis(sec) + rng.random()
    return 2 * (ph - np.floor(ph + 0.5))


def kick(g=1.0):
    t = t_axis(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    return np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)) * g


def clap(g=1.0):
    t = t_axis(0.3)
    n = filt(rng.standard_normal(len(t)), "band", [900, 3500])
    e = np.exp(-t * 18) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 30) * (t > 0.012) + 0.5 * np.exp(-np.maximum(0, t - 0.024) * 30) * (t > 0.024)
    return n * e * 0.6 * g


def hat(g=1.0, open_=False):
    t = t_axis(0.25 if open_ else 0.06)
    n = filt(rng.standard_normal(len(t)), "high", 7000)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.35 * g


def bass(note, sec):
    t = t_axis(sec)
    x = saw(hz(note), sec) * 0.6 + np.sin(2 * np.pi * hz(note) * t)
    x = filt(x, "low", 600)
    return np.tanh(1.5 * x) * np.minimum(1, t / 0.005) * np.exp(-t * 3) * 0.55


def stab(notes, sec=0.32, bright=2400):
    out = np.zeros(int(SR * sec))
    for n in notes:
        for dt in (-0.006, 0.0, 0.006):
            out += saw(hz(n), sec, dt)
    t = t_axis(sec)
    return filt(out / (len(notes) * 3), "low", bright) * np.exp(-t * 9)


def pluck(note, sec=0.18):
    t = t_axis(sec)
    x = saw(hz(note), sec) + 0.5 * np.sin(2 * np.pi * hz(note) * 2 * t)
    return filt(x, "low", 3200) * np.exp(-t * 16) * 0.35


def pad(notes, sec, gain=0.5, bright=1500):
    out = np.zeros(int(SR * sec))
    for n in notes:
        for dt in (-0.004, 0.0, 0.005):
            out += saw(hz(n), sec, dt)
    t = t_axis(sec)
    e = np.minimum(1, t / 0.6) * np.minimum(1, (sec - t) / 0.4)
    return filt(out / (len(notes) * 3), "low", bright) * e * gain


def riser(sec):
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    for k in range(0, len(n), 2400):
        c = 400 + 9000 * (k / len(n)) ** 2
        y[k : k + 2400] = filt(n[k : k + 2400], "band", [c * 0.7, min(c * 1.3, 20000)])
    return y * (t / sec) ** 2 * 0.6


def swoosh(sec=0.3):
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    for k in range(0, len(n), 1200):
        c = 1500 + 6000 * (k / len(n))
        y[k : k + 1200] = filt(n[k : k + 1200], "band", [c * 0.6, c * 1.4])
    return y * np.sin(np.pi * t / sec) ** 2 * 0.5


def impact(g=1.0):
    t = t_axis(1.6)
    f = 30 + 70 * np.exp(-t * 8)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.5)
    n = filt(rng.standard_normal(len(t)), "high", 3000) * np.exp(-t * 6) * 0.3
    return np.tanh(1.8 * (s + n)) * g


# D 大調：D – A – Bm – G，每小節一個和弦
CH = [[62, 66, 69], [61, 64, 69], [62, 66, 71], [62, 67, 71]]
ROOT = [38, 33, 35, 31]


def chord_at(t):
    return int(t // BAR) % 4


# 前奏 0–3：鋪底＋琶音，3 秒前上升
for b in range(int(3 / BAR) + 1):
    add(pad([n - 12 for n in CH[b % 4]] + CH[b % 4], BAR + 0.3, gain=0.45, bright=900), b * BAR)
for k in range(int(3 / (BEAT / 2))):
    tt = k * BEAT / 2
    c = CH[chord_at(tt)]
    add(pluck(c[k % 3] + 12), tt, pan=(-0.4 if k % 2 else 0.4), gain=0.7)
add(riser(1.2), 1.8)

# 3–7：大鼓進來，一拍一下；7 秒前小鼓加速
for k in range(int(4 / BEAT)):
    tt = 3 + k * BEAT
    add(kick(0.9), tt)
    add(hat(0.8), tt + BEAT / 2)
    add(bass(ROOT[chord_at(tt)], BEAT * 0.9), tt + BEAT / 2, gain=0.8)
    if k % 2:
        add(clap(0.8), tt)
for k in range(8):
    add(clap(0.25 + 0.08 * k), 6 + k * 0.125)
add(riser(1.0), 6.0)
for b in range(int(3 / BAR), int(7 / BAR) + 1):
    add(pad(CH[b % 4], BAR + 0.2, gain=0.35, bright=1600), b * BAR)

# 7–17：完整律動（商品快剪），每 1 秒一次剪接
for k in range(int(10 / BEAT)):
    tt = 7 + k * BEAT
    c = chord_at(tt)
    add(kick(1.0), tt)
    add(hat(0.9, open_=True), tt + BEAT / 2, pan=0.2)
    add(hat(0.6), tt + BEAT / 4, pan=-0.3)
    add(hat(0.6), tt + 3 * BEAT / 4, pan=-0.3)
    add(bass(ROOT[c], BEAT * 0.45), tt + BEAT / 2)
    add(bass(ROOT[c] + 12, BEAT * 0.2), tt + 3 * BEAT / 4, gain=0.6)
    if k % 2:
        add(clap(1.0), tt)
    add(stab(CH[c]), tt + BEAT / 2, gain=0.55, pan=(0.25 if k % 2 else -0.25))
    for s4 in range(4):
        add(pluck(CH[c][(k + s4) % 3] + 12), tt + s4 * BEAT / 4, pan=(-0.5 if s4 % 2 else 0.5), gain=0.45)

# 17–21：升降大遠景，衝擊＋減半律動
add(impact(1.0), 17)
for k in range(int(4 / BEAT)):
    tt = 17 + k * BEAT
    c = chord_at(tt)
    if k % 2 == 0:
        add(kick(0.8), tt)
    add(hat(0.5), tt + BEAT / 2)
for b in range(int(17 / BAR), int(21 / BAR) + 1):
    add(pad([n - 12 for n in CH[b % 4]] + CH[b % 4], BAR + 0.3, gain=0.55, bright=2200), b * BAR)
add(riser(1.5), 19.5)

# 21–26：旁白段，律動回來但收一點
for k in range(int(5 / BEAT)):
    tt = 21 + k * BEAT
    c = chord_at(tt)
    add(kick(0.85), tt)
    add(hat(0.6, open_=True), tt + BEAT / 2)
    add(bass(ROOT[c], BEAT * 0.45), tt + BEAT / 2, gain=0.8)
    if k % 2:
        add(clap(0.8), tt)
    add(stab(CH[c], bright=1600), tt + BEAT / 2, gain=0.35)
add(riser(1.0), 25.0)

# 26–30：結尾，衝擊＋主和弦延長
add(impact(1.1), 26)
add(kick(1.0), 26)
add(pad([50, 57, 62, 66, 69, 74], 4.0, gain=0.7, bright=2600), 26)
for k, n in enumerate([74, 78, 81, 86]):
    add(pluck(n, 0.5), 26 + k * 0.125, gain=0.6)

# 每個剪接點一聲輕呼嘯
for c in CUTS:
    add(swoosh(0.3), c - 0.22, pan=(0.5 if c % 2 else -0.5), gain=0.55)

# 殘響、母帶
ir = rng.standard_normal(int(SR * 1.4)) * np.exp(-t_axis(1.4) * 4.0)
ir = filt(ir, "low", 6000)
wl, wr = fftconvolve(L, ir)[:N], fftconvolve(R, ir[::-1])[:N]
peak = max(np.abs(L).max(), np.abs(R).max())
wl, wr = wl / (np.abs(wl).max() + 1e-9), wr / (np.abs(wr).max() + 1e-9)
ml, mr = L / peak + 0.18 * wl, R / peak + 0.18 * wr
tail = int(1.0 * SR)
ml[-tail:] *= np.linspace(1, 0, tail) ** 1.5
mr[-tail:] *= np.linspace(1, 0, tail) ** 1.5
st = np.stack([ml, mr], 1)
st = np.tanh(1.5 * st / np.abs(st).max())
st = st / np.abs(st).max() * 10 ** (-1 / 20)
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("wrote", OUT)
