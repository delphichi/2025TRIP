#!/usr/bin/env python3
"""PANTY DE RED 配樂 —— 全部用程式合成，版權乾淨，每個音都對準影格。

120 BPM、30 fps：1 拍 = 15 格 = 0.5 秒。事件表直接用影格編號寫，
和 src/timeline.ts 的鏡頭時間一一對應。

    python3 scripts/score.py   →  public/score.wav（48 kHz 立體聲）
"""
from pathlib import Path
import numpy as np

SR = 48000
FPS = 30
DUR = 10.0
N = int(SR * DUR)
rng = np.random.default_rng(2603)
L = np.zeros(N)
R = np.zeros(N)


def t(n):
    return np.arange(n) / SR


def at(frame):
    return int(round(frame / FPS * SR))


def add(sig, frame, gain=1.0, pan=0.0):
    """pan：-1 左、+1 右（等功率）。"""
    i = at(frame) if not isinstance(frame, float) or frame >= 0 else 0
    sig = sig[: max(0, N - i)]
    a = (pan + 1) * np.pi / 4
    L[i:i + len(sig)] += sig * gain * np.cos(a)
    R[i:i + len(sig)] += sig * gain * np.sin(a)


def env(n, attack=0.002, decay=0.2):
    x = t(n)
    e = np.exp(-x / decay)
    a = int(attack * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def bandpass(x, lo, hi):
    """以 FFT 做頻段遮罩 —— 離線合成，夠用且乾淨。"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(float)
    # 邊緣柔化，避免振鈴
    m = np.convolve(m, np.hanning(64) / np.hanning(64).sum(), mode="same")
    return np.fft.irfft(X * m, len(x))


def reverb(x, wet=0.25, size=0.08, fb=0.55):
    """幾條梳狀濾波疊起來的小房間殘響。"""
    out = x.copy()
    for k, d in enumerate([size, size * 1.37, size * 1.71, size * 2.13]):
        n = int(d * SR)
        y = np.zeros(len(x) + n * 12)
        y[: len(x)] += x
        for i in range(1, 12):
            y[i * n: i * n + len(x)] += x * (fb ** i) * (0.9 if k % 2 else 1.0)
        out = np.pad(out, (0, len(y) - len(out)))
        out += (y - np.pad(x, (0, len(y) - len(x)))) * wet / 4
    return out


# ── 音色 ──────────────────────────────────────────────────────
def heel():
    """高跟鞋落地：高頻雜訊瞬態 + 木質低頻「叩」+ 小房間。"""
    n = int(0.09 * SR)
    noise = bandpass(rng.standard_normal(n), 1800, 7000) * env(n, 0.0005, 0.012)
    tok = np.sin(2 * np.pi * 210 * t(n)) * env(n, 0.0005, 0.03) * 0.7
    tick = np.sin(2 * np.pi * 3400 * t(n)) * env(n, 0.0002, 0.006) * 0.5
    return reverb(noise * 1.4 + tok + tick, wet=0.5, size=0.045, fb=0.45)


def ting(f0=2637.0, decay=0.55):
    """鑽石閃光：非諧和泛音的鐘聲。"""
    n = int(decay * 4 * SR)
    x = t(n)
    s = sum(a * np.sin(2 * np.pi * f0 * r * x) * np.exp(-x / (decay / r ** 0.6))
            for r, a in [(1, 1), (2.76, .45), (5.4, .25), (8.93, .12)])
    s *= env(n, 0.001, 10)
    return reverb(s * 0.5, wet=0.35, size=0.07, fb=0.6)


def kick(gain=1.0):
    n = int(0.42 * SR)
    x = t(n)
    f = 45 + 95 * np.exp(-x / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, 0.001, 0.16)
    click = bandpass(rng.standard_normal(n), 2000, 6000) * env(n, 0.0002, 0.004) * 0.4
    return np.tanh((s + click) * 1.6) * gain


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return bandpass(rng.standard_normal(n), 7000, 16000) * env(n, 0.0005, 0.06 if open_ else 0.012) * 0.6


def snare():
    n = int(0.3 * SR)
    body = np.sin(2 * np.pi * 190 * t(n)) * env(n, 0.001, 0.05)
    noise = bandpass(rng.standard_normal(n), 1200, 9000) * env(n, 0.001, 0.09)
    return reverb(body * 0.6 + noise * 0.9, wet=0.3, size=0.06)


def shutter():
    n = int(0.09 * SR)
    a = bandpass(rng.standard_normal(n), 2500, 9000) * env(n, 0.0003, 0.006)
    s = a.copy()
    k = int(0.035 * SR)
    s[k:] += a[: n - k] * 0.8
    return s


def impact():
    """重拍：次低頻下潛 + 高通碎片 + 長殘響。"""
    n = int(1.6 * SR)
    x = t(n)
    f = 38 + 60 * np.exp(-x / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.55)
    crash = bandpass(rng.standard_normal(n), 3000, 14000) * env(n, 0.001, 0.45) * 0.35
    tail = reverb(crash, wet=0.4, size=0.09)
    return np.pad(np.tanh(sub * 1.8) * 0.9, (0, len(tail) - n)) + tail


def stamp():
    n = int(0.5 * SR)
    thud = np.sin(2 * np.pi * 80 * t(n)) * env(n, 0.001, 0.07)
    paper = bandpass(rng.standard_normal(n), 300, 2500) * env(n, 0.001, 0.03) * 0.7
    return np.tanh((thud + paper) * 2.0)


def flip():
    n = int(0.03 * SR)
    return bandpass(rng.standard_normal(n), 2500, 8000) * env(n, 0.0002, 0.004) * 0.8


def riser(frames):
    n = int(frames / FPS * SR)
    x = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    # 由低往高掃頻：分段帶通拼接
    seg = n // 12
    out = np.zeros(n)
    for i in range(12):
        lo = 400 * 2 ** (i * 0.42)
        a, b = i * seg, min(n, (i + 1) * seg + seg // 2)
        piece = bandpass(noise[a:b], lo, lo * 3) * np.hanning(b - a)
        out[a:b] += piece
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (x * 2.5)) / SR) * 0.25
    return (out * 0.8 + tone) * x ** 2


def whoosh(frames, lo=500, hi=6000):
    n = int(frames / FPS * SR)
    s = bandpass(rng.standard_normal(n), lo, hi)
    return s * np.sin(np.linspace(0, np.pi, n)) ** 2


def pad():
    """A 小調九和弦鋪底：去諧鋸齒波 + 低通，從暗慢慢打開。"""
    x = t(N)
    notes = [110.0, 164.81, 261.63, 329.63, 493.88]   # A2 E3 C4 E4 B4
    s = np.zeros(N)
    for f in notes:
        for d in (-0.12, 0.0, 0.11):
            ph = (f * (1 + d / 100)) * x
            s += (2 * (ph % 1) - 1) / len(notes) / 3
    lo = onepole_lp(s, 500)
    hi = onepole_lp(s, 2200)
    open_ = np.clip((x - 1.0) / 1.0, 0, 1)                  # 2 秒（亮相）時打開
    out = lo * (1 - open_) + hi * open_
    vol = np.clip(x / 0.8, 0, 1) * (1 - np.clip((x - 9.3) / 0.7, 0, 1) * 0.6)
    dip = 1 - 0.5 * np.exp(-((x - 1.95) / 0.06) ** 2)         # 重拍前抽空
    return out * vol * dip * 0.22


def bass_note(f, frames):
    n = int(frames / FPS * SR)
    x = t(n)
    s = np.tanh(np.sin(2 * np.pi * f * x) * 2.2) * env(n, 0.004, frames / FPS * 0.6)
    return onepole_lp(s, 700)


# ── 編排（影格）───────────────────────────────────────────────
pd = pad()
L += pd
R += pd

HEEL = heel()
for f, g, p in [(0, 1.0, 0), (15, .9, -.2), (30, .8, .2), (45, .85, -.1), (60, 1.0, 0), (90, .8, .1),
                (120, .8, 0), (135, .7, 0), (150, .7, 0), (165, .7, 0), (180, .9, 0), (210, .6, 0), (285, 1.0, 0)]:
    add(HEEL, f, g * 0.9, p)

# 閃光
add(ting(2637), 0, 0.55)
add(ting(3136), 15, 0.32, -0.5)
add(ting(3520), 15.5, 0.28, 0.5)
for i, f in enumerate([90, 93, 96, 99, 102, 105, 108]):          # 沿腿往上的琶音
    add(ting([1760, 2093, 2349, 2637, 3136, 3520, 4186][i], 0.35), f, 0.22, -0.3 + i * 0.1)
for f in (120, 135, 150):
    add(ting(2349, 0.4), f + 1, 0.2)
add(ting(3136, 0.5), 212, 0.3, 0.4)
add(ting(2637, 0.6), 262, 0.3, 0.3)
add(ting(2637, 1.1), 290, 0.55)

# 織網：riser + 吸入，在 f59 收乾淨，把力氣留給 f60
r = riser(28)
r[-int(0.04 * SR):] *= np.linspace(1, 0, int(0.04 * SR))
add(r, 31, 0.5)

# 重拍
for f in (60, 180, 255):
    add(impact(), f, 0.9)

# 鼓組：亮相到百打
K = kick()
for f in range(60, 256, 15):
    if 180 < f < 225:
        add(kick(0.6), f, 0.6)       # 規格段收一點，「穩」
    else:
        add(K, f, 0.85)
for f in range(60 + 7, 225, 15):     # 反拍 hi-hat
    add(hat(), f + 0.5, 0.35, 0.3)
for f in range(225, 248, 2):         # 12 顆點：十六分音符
    add(hat(), f, 0.42, -0.3 + (f - 225) / 40)
S = snare()
for f in (67, 75, 105):
    add(S, f, 0.42)
SH = shutter()
for f in (120, 135, 150):
    add(SH, f, 0.5, 0.2)
add(snare(), 165, 0.5)
add(hat(True), 165, 0.4)

# 貝斯：亮相與三色段的八分音符
for i, f in enumerate(range(60, 180, 7)):
    add(bass_note(55.0 if (f // 30) % 4 != 3 else 49.0, 7), f, 0.32)

# 規格
add(stamp(), 180, 0.7)
for i in range(8):
    add(flip(), 182 + i * 1.5, 0.35, -0.4 + i * 0.1)
add(whoosh(6, 800, 5000), 195, 0.25)
add(whoosh(10, 1500, 9000), 208, 0.3, 0.5)

# 轉場
add(whoosh(9, 400, 4000), 216, 0.45, -0.3)
add(whoosh(5, 600, 6000), 265, 0.35)
add(whoosh(8, 300, 2500), 268, 0.3)

# ── 母帶 ─────────────────────────────────────────────────────
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.15)                     # 柔和限幅
mix /= np.max(np.abs(mix)) / 0.89             # 約 -1 dBFS
fade = int(0.08 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]

out = Path(__file__).resolve().parent.parent / "public" / "score.wav"
pcm = (mix * 32767).astype("<i2")
import wave
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(out, f"{DUR}s", f"peak {np.max(np.abs(mix)):.2f}")
