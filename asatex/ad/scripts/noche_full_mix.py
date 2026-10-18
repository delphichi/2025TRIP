"""Nochebuena 完整 60 秒：環境音＋效果音＋配樂（numpy 合成），時間點對齊 src/NochebuenaFull.tsx 的剪接表 T。
規則（分鏡表備註）：開場只有電話、鍵盤、冷氣；夢裡幾乎無聲；30 秒換上睡衣時配樂才第一次完整進來。
輸出 public/noche/full_mix.wav（48 kHz 立體聲）。執行：python3 scripts/noche_full_mix.py
"""
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

SR, DUR = 48000, 60.0
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(5)
OUT = Path(__file__).resolve().parent.parent / "public" / "noche" / "full_mix.wav"
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


# ── 第一幕（同試片）──
add(np.sin(2 * np.pi * 880 * t(0.08)) * env(int(SR * .08)) * 0.15, 0.02)
add(filt(noise(3.0), "lowpass", 600) * env(int(SR * 3), 0.3, 0.3) * 0.02, 0.0)
hum = np.sin(2 * np.pi * 60 * t(5.8)) * 0.4 + filt(noise(5.8), "lowpass", 300) * 1.2
add(hum * np.interp(t(5.8), [0, 3.6, 5.2, 5.8], [0.025, 0.03, 0.08, 0.0]), 3.0)
for k in range(46):
    at = 3.15 + k * 0.085 + rng.uniform(-0.02, 0.02)
    if 5.2 < at < 5.6: continue
    if at > 6.9: break
    add(filt(noise(0.02), "bandpass", [1800, 5200]) * env(int(SR * .02), .001, .015), at, rng.uniform(-.2, .2), 0.12)
add(np.sin(2 * np.pi * 620 * t(0.06)) * env(int(SR * .06)) * 0.12, 7.0)
add(filt(noise(0.18), "lowpass", 180) * env(int(SR * .18), .002, .15), 7.62, g=0.5)

# ── 第二幕：夢（8–21s）低沉長音、開門聲、心跳 ──
dl = 13.0
drone = np.sin(2 * np.pi * 55 * t(dl)) + 0.5 * np.sin(2 * np.pi * 82.5 * t(dl)) + 0.3 * np.sin(2 * np.pi * 110.3 * t(dl))
add(drone * np.interp(t(dl), [0, 0.8, 12.2, 13.0], [0, 0.06, 0.06, 0]), 8.0)
f0 = np.interp(t(0.9), [0, 0.9], [420, 260])
creak = np.sin(2 * np.pi * np.cumsum(f0) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t(0.9)))
add(filt(creak, "bandpass", [200, 1400]) * env(int(SR * .9), .05, .3) * 0.12, 8.9, -0.1)
for k, at in enumerate([19.4, 19.8, 20.3]):  # 心跳越來越快，然後全靜
    beat = np.sin(2 * np.pi * 52 * t(0.16)) * np.exp(-t(0.16) * 22)
    add(beat, at, g=0.45); add(beat, at + 0.22, g=0.3)

# ── 第三幕：驚醒（21s）倒抽一口氣 ──
add(filt(noise(0.5), "bandpass", [600, 3500]) * np.interp(t(0.5), [0, .08, .5], [0, 1, 0]), 21.0, g=0.18)
add(filt(noise(2.0), "lowpass", 300) * 0.03, 21.0)

# ── 第四幕：跑步、街道、開門、家裡的笑聲 ──
add(filt(noise(3.5), "lowpass", 700) * 0.035, 23.0)  # 街道底噪
for k in range(11):
    add(filt(noise(0.05), "lowpass", 260) * env(int(SR * .05), .001, .04), 23.1 + k * 0.3, (-1) ** k * 0.2, 0.35)
add(filt(noise(0.35), "bandpass", [300, 1600]) * env(int(SR * .35), .01, .25), 26.6, g=0.12)  # 開門
murmur = filt(noise(15.5), "bandpass", [250, 1200])
add(murmur * np.interp(t(15.5), [0, 0.8, 15, 15.5], [0, 0.03, 0.03, 0]), 26.6)
for at in [27.2, 35.0, 36.4, 37.9]:  # 笑聲（短促的明亮雜訊脈衝）
    for k in range(5):
        add(filt(noise(0.09), "bandpass", [700, 2400]) * env(int(SR * .09), .01, .06), at + k * 0.13, rng.uniform(-.4, .4), 0.08)
add(sum(np.sin(2 * np.pi * fr * t(0.7)) * np.exp(-t(0.7) * 9) for fr in [2350, 3120, 4410]) * 0.07, 40.6)  # 碰杯

# ── 配樂：30s 換上睡衣才完整進來（D 大調，84 bpm，I–V–vi–IV）──
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
start, end = 30.0, 59.6
bar = 4 * B; nb = int((end - start) / bar) + 1
for b in range(nb):
    t0 = start + b * bar
    if t0 > end: break
    ch = CH[b % 4]
    gain = np.interp(t0, [30, 33, 46, 50.5, 51, 56, 59], [0.6, 1.0, 1.0, 1.25, 0.6, 0.55, 0.4])
    add(pad([c - 12 for c in ch], bar + 0.4, 0.05 * gain), t0)
    add(piano(ch[0] - 24, bar, 0.16 * gain), t0)
    for k, m in enumerate([ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]):
        add(piano(m, 1.2, 0.09 * gain), t0 + k * B / 2, pan=(k % 3 - 1) * 0.3)
add(pad([74, 78, 81], 3.6, 0.06), 56.2)
add(piano(62, 3.5, 0.22) + 0, 56.2)

# ── 第五幕：午夜鐘聲（44.5s 起）＋夏夜蟲鳴（42–55s）──
for k in range(4):
    x = t(2.5); bell = sum(a * np.sin(2 * np.pi * fr * x) for fr, a in [(523, 1), (1046, .5), (1570, .3), (2093, .15)]) * np.exp(-x * 1.8)
    add(bell, 44.5 + k * 0.9, pan=0.15, g=0.08)
cr = np.zeros(int(SR * 13))
for k in range(60):
    at = rng.uniform(0, 12.8); x = t(0.12)
    chirp = np.sin(2 * np.pi * 4300 * x) * (np.sin(2 * np.pi * 40 * x) > 0) * env(len(x), .005, .03)
    i = int(at * SR); cr[i:i + len(chirp)] += chirp[: len(cr) - i]
add(cr * 0.012, 42.0, pan=0.3)

mix = np.stack([L, R], 1)
mix /= max(1.0, np.abs(mix).max() / 0.85)
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("✓", OUT)
