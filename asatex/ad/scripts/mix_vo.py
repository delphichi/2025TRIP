"""把西班牙文旁白混進配樂：旁白出現時配樂自動壓低（ducking），輸出 public/trailer/mix.wav。

旁白來源：Piper TTS（免費、本機）聲音 es_MX-ald-medium，降 3 個半音＋低音、壓縮、殘響處理，
檔案在 public/trailer/vo/。換成付費配音時，只要換掉這些 wav、重跑本腳本。
執行：python3 scripts/score.py && python3 scripts/mix_vo.py
"""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "public" / "trailer"
SR = 48000

# 旁白時間點（秒），對齊 src/Trailer.tsx 的時間表
CUES = [
    ("v1.wav", 0.7),     # En el corazón del desierto de Atacama...
    ("v2.wav", 4.1),     # existe un lugar, donde todo se encuentra.
    ("v3.wav", 10.55),   # Asatex.（logo 爆出後）
    ("v45f.wav", 21.95), # Lo que usted necesite, lo encontramos.
    ("v67f.wav", 24.1),  # Proveedores de calidad, al mejor precio.
    ("v8.wav", 26.6),    # Visítenos. Zofri, Iquique.
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
