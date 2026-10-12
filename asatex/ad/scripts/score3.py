"""Panty de Red CK2603L 分解說明廣告：配樂＋音效＋旁白混音，一支腳本做完。

優雅極簡的科技感：玻璃鈴聲（閃鑽）、低頻重擊（爆開／組回）、介面提示音（標註線）、計數聲（0→100）。
時間表與 src/Exploded.tsx 的 SHOTS 相同。旁白在 public/ck/vo/（Piper es_MX-ald-medium）。
輸出 public/ck/mix.wav（48 kHz 立體聲，31 秒）。執行：python3 scripts/score3.py
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 31.0
N = int(SR * DUR)
rng = np.random.default_rng(23)
PUB = Path(__file__).resolve().parent.parent / "public" / "ck"

CUTS = [3.0, 5.5, 9.0, 12.5, 15.3, 21.4, 23.9, 27.4]
EXPLODE = 5.85   # 部件分開
REASSEMBLE = 21.4
CALLOUTS = [6.6, 7.0, 7.4]
COUNT = (24.6, 26.0)  # 0→100
VO = [("k1", 0.4), ("k2", 3.2), ("k3", 5.7), ("k4", 9.2), ("k5", 12.6), ("k6f", 15.4), ("k7", 21.6), ("k8f", 24.0), ("k9", 27.6)]

L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def add(sig, at, pan=0.0, gain=1.0, bus=None):
    i = int(round(at * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    (bus or (L, R))[0][i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    (bus or (L, R))[1][i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(freq, sec, dt=0.0):
    ph = freq * (1 + dt) * t_axis(sec) + rng.random()
    return 2 * (ph - np.floor(ph + 0.5))


def bell(note, sec=2.2, g=1.0):
    t = t_axis(sec)
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 6)
    return x * np.exp(-t * 2.2) * np.minimum(1, t / 0.002) * 0.25 * g


def pad(notes, sec, gain=0.4, bright=1400, a=1.2):
    out = np.zeros(int(SR * sec))
    for n in notes:
        for dt in (-0.004, 0.0, 0.005):
            out += saw(hz(n), sec, dt)
    t = t_axis(sec)
    e = np.minimum(1, t / a) * np.minimum(1, (sec - t) / 0.8)
    return filt(out / (len(notes) * 3), "low", bright) * e * gain


def sub_hit(g=1.0, sec=2.4):
    t = t_axis(sec)
    f = 32 + 60 * np.exp(-t * 7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.0)
    air = filt(rng.standard_normal(len(t)), "high", 5000) * np.exp(-t * 5) * 0.25
    return np.tanh(1.6 * (s + air)) * g


def whoosh(sec=0.45, g=1.0):
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    for k in range(0, len(n), 1200):
        c = 800 + 6000 * np.sin(np.pi * k / len(n))
        y[k : k + 1200] = filt(n[k : k + 1200], "band", [c * 0.6, c * 1.5])
    return y * np.sin(np.pi * t / sec) ** 2 * 0.45 * g


def blip(freq=1800, sec=0.09, g=1.0):
    t = t_axis(sec)
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 45) * 0.3 * g


def tick(g=1.0):
    t = t_axis(0.03)
    return filt(rng.standard_normal(len(t)), "high", 4000) * np.exp(-t * 200) * 0.4 * g


def pulse(note, sec):
    t = t_axis(sec)
    x = np.sin(2 * np.pi * hz(note) * t) + 0.3 * saw(hz(note), sec)
    return filt(x, "low", 400) * np.exp(-t * 6) * 0.5


# 和聲：D 大七 → B 小七 → G 大七 → A 掛四，優雅、帶點懸疑
CH = [[50, 57, 61, 66, 69], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 62, 64]]
for k in range(8):
    t0 = k * 3.9
    add(pad(CH[k % 4], 4.4, gain=0.38, bright=1100 + 200 * (k % 3)), t0)
# 低頻脈動（每 0.625 秒，96 bpm），開場後進來
for k in range(int((DUR - 3.0) / 0.625)):
    tt = 3.0 + k * 0.625
    if REASSEMBLE - 0.3 < tt < REASSEMBLE + 0.6:
        continue
    root = CH[int(tt // 3.9) % 4][0] - 12
    add(pulse(root, 0.4), tt, gain=0.5 if k % 2 == 0 else 0.3)
# 開場閃鑽：一串玻璃鈴
for k, n in enumerate([86, 90, 93, 98, 93, 97, 102, 98]):
    add(bell(n, g=0.9), 0.15 + k * 0.33, pan=(-0.5 if k % 2 else 0.5))
# 閃鑽特寫：鈴聲＋閃光
for k, n in enumerate([93, 98, 102, 105, 98, 102]):
    add(bell(n, 2.6, g=1.0), 9.3 + k * 0.55, pan=(0.4 if k % 2 else -0.4))
# 爆開與組回
add(sub_hit(1.2), EXPLODE)
add(whoosh(0.8, 1.3), EXPLODE - 0.5, pan=-0.3)
add(sub_hit(1.0), REASSEMBLE)
add(whoosh(0.6, 1.1), REASSEMBLE - 0.45, pan=0.3)
for c in CALLOUTS:
    add(blip(2200), c, pan=0.2)
    add(blip(3300, g=0.6), c + 0.06, pan=0.2)
# 網格描線：一串細密的滴答
for k in range(36):
    add(tick(0.6), 12.7 + k * 0.07, pan=np.sin(k) * 0.6)
# 纖維分開：上行掃頻；彈性示範：彈簧聲
t = t_axis(1.2)
add(np.sin(2 * np.pi * np.cumsum(300 + 900 * t) / SR) * np.exp(-((t - 0.6) ** 2) / 0.08) * 0.18, 16.6)
t = t_axis(1.4)
add(np.sin(2 * np.pi * (220 * t + 30 * np.sin(2 * np.pi * 6 * t) / (2 * np.pi * 6))) * np.exp(-t * 2.5) * 0.25, 19.4)
# 顏色切換：三個鈴
for k, n in enumerate([81, 85, 88]):
    add(bell(n, 1.6, 0.9), 22.0 + k * 0.6)
# 計數 0→100：越來越快的滴答，到 100 一聲鈴
cnt = np.linspace(0, 1, 26) ** 0.6
for c in cnt:
    add(tick(0.8), COUNT[0] + c * (COUNT[1] - COUNT[0]))
add(bell(98, 2.0, 1.0), COUNT[1])
# 轉場呼嘯
for c in CUTS:
    if abs(c - REASSEMBLE) > 0.1:
        add(whoosh(0.4, 0.7), c - 0.3, pan=(0.4 if int(c * 10) % 2 else -0.4))
# 結尾：主和弦＋高音鈴
add(sub_hit(0.8), 27.4)
add(pad([50, 57, 62, 66, 69, 73], 3.6, gain=0.55, bright=2200, a=0.3), 27.4)
for k, n in enumerate([86, 90, 93, 97]):
    add(bell(n, 2.4, 0.8), 27.5 + k * 0.18)

# 殘響
ir = filt(rng.standard_normal(int(SR * 2.2)) * np.exp(-t_axis(2.2) * 2.6), "low", 7000)
peak = max(np.abs(L).max(), np.abs(R).max())
wl, wr = fftconvolve(L, ir)[:N], fftconvolve(R, ir[::-1])[:N]
music = np.stack([L / peak + 0.3 * wl / np.abs(wl).max(), R / peak + 0.3 * wr / np.abs(wr).max()], 1)
music /= np.abs(music).max()


# 旁白＋ducking
def read(path):
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
        return x.reshape(-1, w.getnchannels())[:, 0]


vo = np.zeros(N)
for name, at in VO:
    v = read(PUB / "vo" / f"{name}.wav")
    v = v / (np.abs(v).max() + 1e-9) * 0.9
    i = int(at * SR)
    v = v[: N - i]
    vo[i : i + len(v)] += v
env = np.zeros(N)
e = 0.0
for i in range(0, N, 64):
    target = 1.0 if np.abs(vo[i : i + 64]).max() > 0.02 else 0.0
    k = np.exp(-64 / (0.03 * SR)) if target > e else np.exp(-64 / (0.35 * SR))
    e = target + (e - target) * k
    env[i : i + 64] = e
gain = 1 - 0.55 * env
mix = music * 0.85 * gain[:, None] + vo[:, None]
tail = int(1.2 * SR)
mix[-tail:] *= (np.linspace(1, 0, tail) ** 1.5)[:, None]
mix = np.tanh(1.2 * mix / np.abs(mix).max())
mix = mix / np.abs(mix).max() * 10 ** (-1 / 20)
with wave.open(str(PUB / "mix.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", PUB / "mix.wav")
