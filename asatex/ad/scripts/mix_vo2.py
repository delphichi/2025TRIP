"""（3D 展示間版）把西班牙文旁白混進配樂：旁白出現時配樂自動壓低（ducking），輸出 public/trailer/mix.wav。

旁白來源：Piper TTS（免費、本機）聲音 es_MX-ald-medium，不降音、只做 EQ＋壓縮（商業廣告要清楚），
檔案在 public/showroom/vo/。換成付費配音時，只要換掉這些 wav、重跑本腳本。
執行：python3 scripts/score2.py && python3 scripts/mix_vo2.py
"""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "public" / "showroom"
SR = 48000

# 旁白時間點（秒），對齊 src/Trailer.tsx 的時間表
CUES = [
    ("c1.wav", 2.6),     # Todo lo que usted busca, en un solo lugar.
    ("c2.wav", 5.5),     # Asatex.
    ("c3f.wav", 21.2),   # Lo que usted necesite, lo encontramos.
    ("c4f.wav", 23.8),   # Proveedores de calidad, al mejor precio.
    ("c5.wav", 26.6),    # Visítenos. Zofri, Iquique.
]
VO_GAIN = 1.0
MUSIC_GAIN = 0.8
DUCK = 0.45  # 旁白時配樂降到 45%


def read(path):
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR, path
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
        return x.reshape(-1, w.getnchannels())


music = read(ROOT / "score.wav")
n = len(music)
vo = np.zeros(n)
for name, at in CUES:
    v = read(ROOT / "vo" / name)[:, 0]
    v = v / (np.max(np.abs(v)) + 1e-9) * 0.9
    i = int(at * SR)
    v = v[: n - i]
    vo[i : i + len(v)] += v

# 旁白包絡 → 平滑（起 30 ms、放 350 ms）→ ducking 增益
level = np.abs(vo)
env = np.zeros(n)
a_up, a_dn = np.exp(-1 / (0.03 * SR)), np.exp(-1 / (0.35 * SR))
e = 0.0
for i in range(0, n, 64):  # 每 64 個取樣更新一次，夠用也夠快
    target = 1.0 if level[i : i + 64].max() > 0.02 else 0.0
    k = a_up**64 if target > e else a_dn**64
    e = target + (e - target) * k
    env[i : i + 64] = e
gain = 1 - (1 - DUCK) * env

mix = music * MUSIC_GAIN * gain[:, None] + vo[:, None] * VO_GAIN
mix = np.tanh(1.2 * mix / np.max(np.abs(mix)))
mix = mix / np.max(np.abs(mix)) * 10 ** (-1 / 20)

with wave.open(str(ROOT / "mix.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", ROOT / "mix.wav")
