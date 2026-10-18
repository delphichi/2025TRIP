"""對嘴資料：把配音音量算成每格（30 fps）0–1 的嘴巴開合 → src/<名稱>Env.ts。
用法：python3 scripts/lipsync_env.py rosado/vo_fast stick   → src/stickEnv.ts（export const ENV: Record<檔名, number[]>）
"""
import glob, json, os, sys, wave
import numpy as np

src, name = sys.argv[1], sys.argv[2]
FPS = 30
out = {}
for f in sorted(glob.glob(f"public/{src}/*.wav")):
    if os.path.basename(f).startswith("._"):
        continue
    w = wave.open(f); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float)
    hop = sr // FPS
    rms = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop + 1, hop)])
    v = np.clip(rms / (np.percentile(rms, 95) + 1e-9), 0, 1)
    v = np.where(v < 0.12, 0, v)  # 小聲＝閉嘴
    v = np.convolve(v, [0.25, 0.5, 0.25], "same")  # 不要每格亂跳
    out[os.path.splitext(os.path.basename(f))[0]] = [round(float(a), 2) for a in v]
path = f"src/{name}Env.ts"
with open(path, "w") as fp:
    fp.write("// 自動產生（scripts/lipsync_env.py）：每句配音每格的嘴巴開合 0–1\n")
    fp.write("export const ENV: Record<string, number[]> = " + json.dumps(out) + ";\n")
print("ok", path, {k: len(v) for k, v in out.items()})
