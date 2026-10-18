"""Nochebuena 30 秒寫實版：環境音＋效果音＋配樂（numpy 合成），時間點對齊 src/NochebuenaReal.tsx。
配樂在 16s 媽媽遞睡衣時第一次完整進來。輸出 public/noche/real_mix.wav（48 kHz 立體聲）。
"""
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

SR, DUR = 48000, 30.0
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
OUT = Path(__file__).resolve().parent.parent / "public" / "noche" / "real_mix.wav"
t = lambda s: np.arange(int(SR * s)) / SR


def add(sig, at, pan=0.0, g=1.0):
    i = int(at * SR); j = min(N, i + len(sig))
    if j <= i: return
    sig = sig[: j - i] * g
    L[i:j] += sig * (1 - max(pan, 0)); R[i:j] += sig * (1 + min(pan, 0))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def env(n, a=0.005, r=0.05):
    e = np.ones(n); ka, kr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:ka] = np.linspace(0, 1, ka); e[-kr:] = np.linspace(1, 0, kr); return e


def noise(sec): return rng.normal(0, 1, int(SR * sec))


# 客廳暖底噪（0–2.5）
add(filt(noise(2.6), "lowpass", 600) * env(int(SR * 2.6), 0.3, 0.3) * 0.02, 0.0)
# 辦公室：冷氣嗡嗡＋鍵盤（2.5–6.5）
hum = np.sin(2 * np.pi * 60 * t(4.0)) * 0.4 + filt(noise(4.0), "lowpass", 300) * 1.2
add(hum * np.interp(t(4.0), [0, 2.5, 3.6, 4.0], [0.025, 0.03, 0.05, 0.0]), 2.5)
for k in range(28):
    at = 2.6 + k * 0.085 + rng.uniform(-0.02, 0.02)
    if 3.3 < at < 4.5: continue
    add(filt(noise(0.02), "bandpass", [1800, 5200]) * env(int(SR * .02), .001, .015), at, rng.uniform(-.2, .2), 0.1)
# 夢（6.5–12）：低沉長音＋開門吱聲＋心跳
dl = 5.8
drone = np.sin(2 * np.pi * 55 * t(dl)) + 0.5 * np.sin(2 * np.pi * 82.5 * t(dl)) + 0.3 * np.sin(2 * np.pi * 110.3 * t(dl))
add(drone * np.interp(t(dl), [0, 0.6, 5.2, 5.8], [0, 0.06, 0.06, 0]), 6.3)
f0 = np.interp(t(0.9), [0, 0.9], [420, 260])
creak = np.sin(2 * np.pi * np.cumsum(f0) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t(0.9)))
add(filt(creak, "bandpass", [200, 1400]) * env(int(SR * .9), .05, .3) * 0.12, 6.8, -0.1)
for at in [10.9, 11.3, 11.7]:
    beat = np.sin(2 * np.pi * 52 * t(0.16)) * np.exp(-t(0.16) * 22)
    add(beat, at, g=0.45); add(beat, at + 0.22, g=0.3)
# 驚醒（12）倒抽一口氣
add(filt(noise(0.5), "bandpass", [600, 3500]) * np.interp(t(0.5), [0, .08, .5], [0, 1, 0]), 12.0, g=0.18)
# 街道＋跑步（13.5–16）
add(filt(noise(2.6), "lowpass", 700) * 0.035, 13.5)
for k in range(8):
    add(filt(noise(0.05), "lowpass", 260) * env(int(SR * .05), .001, .04), 13.6 + k * 0.3, (-1) ** k * 0.2, 0.35)
add(filt(noise(0.35), "bandpass", [300, 1600]) * env(int(SR * .35), .01, .25), 16.0, g=0.12)  # 開門
# 家裡人聲底＋笑聲＋碰杯（19.5–25.5）
murmur = filt(noise(6.2), "bandpass", [250, 1200])
add(murmur * np.interp(t(6.2), [0, 0.6, 5.8, 6.2], [0, 0.03, 0.03, 0]), 19.4)
for at in [20.4, 22.0]:
    for k in range(5):
        add(filt(noise(0.09), "bandpass", [700, 2400]) * env(int(SR * .09), .01, .06), at + k * 0.13, rng.uniform(-.4, .4), 0.08)
add(sum(np.sin(2 * np.pi * fr * t(0.7)) * np.exp(-t(0.7) * 9) for fr in [2350, 3120, 4410]) * 0.07, 24.0)

# 配樂：16s 起（D 大調，84 bpm，I–V–vi–IV）
BPM = 84; B = 60 / BPM
CH = [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def piano(m, sec, g=1.0):
    x = t(sec); f = hz(m)
    s = np.sin(2 * np.pi * f * x) + 0.4 * np.sin(4 * np.pi * f * x) + 0.15 * np.sin(6 * np.pi * f * x)
    return s * np.exp(-x * 2.2) * env(len(x), .004, .2) * g
def pad(ms, sec, g=1.0):
    x = t(sec)
    s = sum(np.sin(2 * np.pi * hz(m) * x) + 0.5 * np.sin(2 * np.pi * hz(m) * 1.003 * x) for m in ms)
    return filt(s, "lowpass", 1400) * env(len(x), 0.6, 0.8) * g
start, end = 16.0, 29.6
bar = 4 * B
for b in range(int((end - start) / bar) + 1):
    t0 = start + b * bar
    if t0 > end - 1: break
    ch = CH[b % 4]
    gain = np.interp(t0, [16, 19, 24, 25.5, 28], [0.6, 1.0, 1.2, 0.7, 0.5])
    add(pad([c - 12 for c in ch], bar + 0.4, 0.05 * gain), t0)
    add(piano(ch[0] - 24, bar, 0.16 * gain), t0)
    for k, m in enumerate([ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]):
        add(piano(m, 1.2, 0.09 * gain), t0 + k * B / 2, pan=(k % 3 - 1) * 0.3)
add(pad([74, 78, 81], 3.4, 0.06), 26.4)
add(piano(62, 3.3, 0.22), 26.4)

mix = np.stack([L, R], 1)
mix /= max(1.0, np.abs(mix).max() / 0.85)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("✓", OUT)
