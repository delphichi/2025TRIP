"""Nochebuena 開場 10 秒環境音：電話鈴、鍵盤、冷氣、掛電話、趴桌悶響、夢的低鳴、開門聲。
時間點對齊 src/Nochebuena.tsx 的剪接表（30 fps）。輸出 public/noche/sfx.wav（48 kHz 立體聲）。
執行：python3 scripts/noche_sfx.py
"""
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

SR, DUR = 48000, 10.0
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(3)
OUT = Path(__file__).resolve().parent.parent / "public" / "noche" / "sfx.wav"


def add(sig, at, pan=0.0, g=1.0):
    i = int(at * SR); j = min(N, i + len(sig)); sig = sig[: j - i] * g
    L[i:j] += sig * (1 - max(pan, 0)); R[i:j] += sig * (1 + min(pan, 0))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def env(n, a=0.005, r=0.05):
    e = np.ones(n); ka, kr = int(a * SR), int(r * SR)
    e[:ka] = np.linspace(0, 1, ka); e[-kr:] = np.linspace(1, 0, kr); return e


t = lambda s: np.arange(int(SR * s)) / SR

# 媽媽那頭：電話被接起的小提示音（0.0s）
add(np.sin(2 * np.pi * 880 * t(0.08)) * env(int(SR * .08)) * 0.15, 0.02)
# 客廳：很輕的暖色室內底噪（0–3s）
room = filt(rng.normal(0, 1, int(SR * 3.0)), "lowpass", 600) * 0.02
add(room * env(len(room), 0.3, 0.3), 0.0)

# 辦公室：冷氣嗡嗡聲（3–8.8s，結尾漸大）
hum_len = 5.8
hum = (np.sin(2 * np.pi * 60 * t(hum_len)) * 0.4 + filt(rng.normal(0, 1, int(SR * hum_len)), "lowpass", 300) * 1.2)
grow = np.interp(t(hum_len), [0, 3.6, 5.2, 5.8], [0.025, 0.03, 0.08, 0.0])
add(hum * grow, 3.0)
# 鍵盤聲：講電話時還在打字
for k in range(46):
    at = 3.15 + k * 0.085 + rng.uniform(-0.02, 0.02)
    if 5.2 < at < 5.6:
        continue
    if at > 6.9:
        break
    c = filt(rng.normal(0, 1, int(SR * 0.02)), "bandpass", [1800, 5200]) * env(int(SR * 0.02), 0.001, 0.015)
    add(c, at, pan=rng.uniform(-0.2, 0.2), g=0.12)
# 掛電話的短音（7.0s）
add(np.sin(2 * np.pi * 620 * t(0.06)) * env(int(SR * .06)) * 0.12, 7.0)
# 頭趴到桌上的悶響（7.6s）
th = filt(rng.normal(0, 1, int(SR * 0.18)), "lowpass", 180) * env(int(SR * 0.18), 0.002, 0.15)
add(th, 7.62, g=0.5)

# 夢：低沉長音（8.0–10s）
dl = 2.0
drone = (np.sin(2 * np.pi * 55 * t(dl)) + 0.5 * np.sin(2 * np.pi * 82.5 * t(dl)) + 0.3 * np.sin(2 * np.pi * 110.3 * t(dl)))
add(drone * np.interp(t(dl), [0, 0.8, 2.0], [0, 0.07, 0.06]), 8.0)
# 開門聲：門軸吱呀（8.9s）
cr_len = 0.9
f0 = np.interp(t(cr_len), [0, cr_len], [420, 260])
creak = np.sin(2 * np.pi * np.cumsum(f0) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t(cr_len)))
add(filt(creak, "bandpass", [200, 1400]) * env(int(SR * cr_len), 0.05, 0.3) * 0.12, 8.9, pan=-0.1)

mix = np.stack([L, R], 1)
mix /= max(1.0, np.abs(mix).max() / 0.9)
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("✓", OUT)
