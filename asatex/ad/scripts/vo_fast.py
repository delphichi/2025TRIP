"""配音整體加速（不改音高）：public/<集>/vo/*.wav → public/<集>/vo_fast/*.wav，並印出可直接貼進 .tsx 的 dur。
用法：python3 scripts/vo_fast.py compras 1.1
FB / IG 短影音要 30 秒內，台詞加速 10% 聽起來只是比較有活力。
"""
import subprocess
import sys
from pathlib import Path

ep, rate = sys.argv[1], float(sys.argv[2])
src = Path(__file__).resolve().parent.parent / "public" / ep / "vo"
dst = src.parent / "vo_fast"
dst.mkdir(exist_ok=True)
dur = {}
for f in sorted(src.glob("*.wav")):
    if f.name.startswith("._"):
        continue
    out = dst / f.name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-af", f"atempo={rate}", "-ar", "48000", "-ac", "1", str(out)], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout
    dur[f.stem] = round(float(d), 2)
print("dur: { " + ", ".join(f"{k}: {v}" for k, v in dur.items()) + " },")
