"""ASATEX 史詩預告片配樂：全部用 numpy 合成，音效點精準對齊畫面（時間表與 src/Trailer.tsx 的 T 相同）。

輸出 public/trailer/score.wav（48 kHz 立體聲，30 秒）。
執行：python3 scripts/score.py
"""
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 30.0
BEAT = 0.5  # 120 bpm
N = int(SR * DUR)
rng = np.random.default_rng(7)
OUT = Path(__file__).resolve().parent.parent / "public" / "trailer" / "score.wav"

# 與 Trailer.tsx 同一張時間表（秒）
HIT1 = 3.5        # 第一張字卡結束的重擊
RISE = (7.0, 9.5) # 上升音
SUCK = (9.5, 10.0)  # 爆點前的靜默
DROP = 10.0       # logo 爆出
MONT = (12.0, 22.0)  # 商品快剪，每 1 秒一格
PROMISE = [22.0, 23.0, 24.0, 25.0]
FINAL = 26.0

L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def add(sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def saw(freq, sec, detune=0.0):
    t = t_axis(sec)
    ph = (freq * (1 + detune)) * t + rng.random()
    return 2 * (ph - np.floor(ph + 0.5))


def env(sec, a, d, sustain=0.0, curve=4.0):
    t = t_axis(sec)
    e = np.minimum(1.0, t / max(a, 1e-4))
    rel = np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e * (sustain + (1 - sustain) * rel)


def hz(note):  # MIDI → Hz
    return 440.0 * 2 ** ((note - 69) / 12)


D1, A1, D2, F2, A2, D3, F3, A3, D4, F4, A4, Fs3, Fs4 = 26, 33, 38, 41, 45, 50, 53, 57, 62, 65, 69, 54, 66


# ── 樂器 ──
def boom(sec=3.0, f0=70, f1=28):
    t = t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    click = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 40) * 0.6
    return np.tanh(1.6 * (s + click))


def braam(sec=3.2, root=D1):
    out = np.zeros(int(SR * sec))
    for n, g in [(root, 1.0), (root + 12, 0.8), (root + 19, 0.55), (root + 24, 0.35)]:
        for dt in (-0.006, 0.0, 0.007):
            out += saw(hz(n), sec, dt) * g
    t = t_axis(sec)
    # 濾波器隨時間打開再關上，做出銅管「嗚哇」的咆哮
    cut = 180 + 1400 * np.exp(-((t - 0.35) ** 2) / 0.08)
    y = np.zeros_like(out)
    for k in range(0, len(out), 2400):
        seg = out[k : k + 2400]
        y[k : k + 2400] = lp(seg, float(cut[k]), 2)
    y = np.tanh(2.2 * y / np.max(np.abs(y)))
    return y * env(sec, 0.04, sec * 0.8, 0.0, 2.2)


def taiko(gain=1.0, pitch=1.0):
    sec = 0.9
    t = t_axis(sec)
    f = (95 * pitch) * np.exp(-t * 9) + 52 * pitch
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    skin = bp(rng.standard_normal(len(t)), 200, 1800) * np.exp(-t * 30) * 0.5
    return np.tanh(2.0 * (body + skin)) * gain


def riser(sec):
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    for k in range(0, len(n), 2400):
        c = 300 + 7000 * (k / len(n)) ** 2
        y[k : k + 2400] = bp(n[k : k + 2400], c * 0.7, min(c * 1.4, 20000))
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (3 * t / sec)) / SR) * 0.35
    return (y * 0.8 + tone) * (t / sec) ** 2.2


def whoosh(sec=0.45):
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    for k in range(0, len(n), 1200):
        c = 600 + 5000 * np.sin(np.pi * k / len(n))
        y[k : k + 1200] = bp(n[k : k + 1200], c * 0.6, c * 1.5)
    return y * np.sin(np.pi * t / sec) ** 2


def pad(notes, sec, a=1.5, gain=1.0, bright=900):
    out = np.zeros(int(SR * sec))
    for n in notes:
        for dt in (-0.004, 0.0, 0.005):
            out += saw(hz(n), sec, dt)
    out = lp(out, bright, 2) / (len(notes) * 3)
    t = t_axis(sec)
    e = np.minimum(1, t / a) * np.minimum(1, (sec - t) / 0.6)
    return out * e * gain


def choir(notes, sec, a=0.8, gain=1.0):
    """鋸齒波通過「啊」的母音共振峰，做出合唱團的感覺"""
    src = np.zeros(int(SR * sec))
    for n in notes:
        for dt in (-0.008, -0.003, 0.0, 0.004, 0.009):
            src += saw(hz(n), sec, dt) * (1 + 0.01 * np.sin(2 * np.pi * 5.2 * t_axis(sec) + rng.random() * 6))
    y = bp(src, 650, 950) * 1.0 + bp(src, 1050, 1300) * 0.7 + bp(src, 2600, 3100) * 0.25
    y /= np.max(np.abs(y))
    t = t_axis(sec)
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, sec - t) / 1.2)
    return y * e * gain


def pluck(freq, sec=0.22):
    t = t_axis(sec)
    x = saw(freq, sec) + saw(freq, sec, 0.004)
    return lp(x, 2200) * np.exp(-t * 14) * 0.5


# ── 編排 ──
# 第一幕：低頻嗡鳴＋心跳般的太鼓
add(pad([D1 + 12, A1 + 12, D2 + 12], SUCK[0], a=3.0, gain=0.42, bright=380), 0.0)
add(np.sin(2 * np.pi * hz(D1) * t_axis(SUCK[0])) * np.minimum(1, t_axis(SUCK[0]) / 2) * 0.3, 0.0)
add(boom(3.0), 0.05, gain=0.8)
for k in range(7):
    add(taiko(0.28 + 0.03 * k, 0.8), 0.5 + k * 1.0, pan=(-0.2 if k % 2 else 0.2))
add(braam(3.5, D1), HIT1, gain=0.9)
add(boom(2.5), HIT1, gain=0.9)
# 加速的鼓＋上升音
for i, tt in enumerate(np.concatenate([np.arange(7.0, 8.5, 0.5), np.arange(8.5, 9.25, 0.25), np.arange(9.25, 9.5, 0.125)])):
    add(taiko(0.5 + 0.06 * i, 1.0), tt, pan=(-0.3 if i % 2 else 0.3))
add(riser(RISE[1] - RISE[0]), RISE[0], gain=0.7)
# 第二幕：爆點
add(braam(4.0, D1), DROP, gain=1.25)
add(boom(3.5, 90, 26), DROP, gain=1.3)
add(choir([D3, A3, D4, F4], 2.6, a=0.15, gain=0.55), DROP)
add(hp(rng.standard_normal(int(SR * 2.5)), 4000) * env(2.5, 0.005, 2.0, 0, 3) * 0.35, DROP)  # 鈸
# 商品快剪：弦樂斷奏＋每拍太鼓＋每次轉場的呼嘯
arp = [D3, F3, A3, D4, A3, F3, D3, A2]
arp2 = [D3, F3, A3, D4, F4, D4, A3, F3]
step = BEAT / 4
for b in range(int((MONT[1] - MONT[0]) / BEAT)):
    t0 = MONT[0] + b * BEAT
    seq = arp if (b // 4) % 2 == 0 else arp2
    for s in range(4):
        add(pluck(hz(seq[(b * 4 + s) % 8])), t0 + s * step, pan=(-0.35 if s % 2 else 0.35), gain=0.55)
    add(taiko(0.9 if b % 2 == 0 else 0.55, 1.0 if b % 2 == 0 else 1.35), t0)
for k in range(10):
    add(whoosh(0.4), MONT[0] + k - 0.32, pan=(0.6 if k % 2 else -0.6), gain=0.5)
    if k:
        add(boom(0.9, 80, 40), MONT[0] + k, gain=0.35)
add(pad([D2, A2, D3, F3], MONT[1] - MONT[0], a=1.0, gain=0.55, bright=1200), MONT[0])
add(choir([D3, F3, A3], MONT[1] - MONT[0], a=2.0, gain=0.22), MONT[0])
# 承諾：每句一記重擊
for i, tt in enumerate(PROMISE):
    add(braam(1.6, D1 if i % 2 == 0 else A1 - 12), tt, gain=0.75)
    add(boom(1.4), tt, gain=0.8)
    add(taiko(1.0, 0.7), tt)
add(riser(0.9), FINAL - 0.9, gain=0.6)
# 結尾：轉成 D 大調的英雄和弦，慢慢收掉
add(boom(4.0, 90, 26), FINAL, gain=1.3)
add(braam(4.0, D1), FINAL, gain=1.0)
add(choir([D3, Fs3, A3, D4, Fs4], DUR - FINAL, a=0.25, gain=0.6), FINAL)
add(pad([D2, A2, D3, Fs3, A3], DUR - FINAL, a=0.2, gain=0.6, bright=1500), FINAL)

# 殘響：合成的指數衰減脈衝響應
ir_len = int(SR * 2.6)
ir_t = np.arange(ir_len) / SR
irL = rng.standard_normal(ir_len) * np.exp(-ir_t * 2.8)
irR = rng.standard_normal(ir_len) * np.exp(-ir_t * 2.8)
irL, irR = lp(irL, 5000), lp(irR, 5000)
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
wetL /= np.max(np.abs(wetL)) + 1e-9
wetR /= np.max(np.abs(wetR)) + 1e-9
dry = max(np.max(np.abs(L)), np.max(np.abs(R)))
mixL = L / dry + 0.32 * wetL
mixR = R / dry + 0.32 * wetR

# 爆點前的靜默：把殘響也吸掉
i0, i1 = int(SUCK[0] * SR), int(SUCK[1] * SR)
fade = np.ones(N)
fade[i0 - 2400 : i0] = np.linspace(1, 0, 2400)
fade[i0:i1] = 0
mixL *= fade
mixR *= fade
# 片尾淡出
tail = int(1.2 * SR)
mixL[-tail:] *= np.linspace(1, 0, tail) ** 1.5
mixR[-tail:] *= np.linspace(1, 0, tail) ** 1.5

# 母帶：柔性限幅到 -1 dBFS
st = np.stack([mixL, mixR], axis=1)
st = np.tanh(1.35 * st / np.max(np.abs(st)))
st = st / np.max(np.abs(st)) * 10 ** (-1 / 20)
pcm = (st * 32767).astype("<i2")

OUT.parent.mkdir(parents=True, exist_ok=True)
import wave

with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT, f"{DUR:.1f}s")
