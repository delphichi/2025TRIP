"""短劇背景音庫（numpy 合成，免授權）→ public/sfx/*.wav（48 kHz 單聲道）。
配樂：club_beat（124 BPM 舞曲，夜店）、club_muffled（同一首隔牆悶聲，房間）、pluck（100 BPM 輕快撥弦，日常）
環境：crowd（夜店人聲）、mall（商場人聲＋腳步）、birds（住宅區鳥叫）
音效：whoosh（換場）、sparkle（閃亮）、ding（手機通知）、cash（收銀）、doorbell（門鈴）
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(3)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def save(name, x, peak=0.9):
    x = x / (np.abs(x).max() + 1e-9) * peak
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print("✓", name, f"{len(x) / SR:.1f}s")


def add(buf, sig, at):
    i = int(at * SR); j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def saw(f, sec):
    ph = (np.cumsum(np.full(int(SR * sec), f) / SR)) % 1
    return 2 * ph - 1


def note(n):  # MIDI → Hz
    return 440 * 2 ** ((n - 69) / 12)


# ── 舞曲 124 BPM，Am–F–C–G，40 秒 ──
BPM = 124; beat = 60 / BPM; DUR = 40
mix = np.zeros(int(SR * DUR))
kick = np.sin(2 * np.pi * np.cumsum(np.interp(t(0.35), [0, 0.06, 0.35], [130, 55, 42])) / SR) * np.exp(-t(0.35) * 9)
clap = filt(rng.normal(0, 1, int(SR * 0.18)), "bandpass", [900, 3000]) * np.exp(-t(0.18) * 22)
hat = filt(rng.normal(0, 1, int(SR * 0.05)), "highpass", 7000) * np.exp(-t(0.05) * 70)
roots = [57, 53, 48, 55]  # A F C G
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
nb = int(DUR / beat)
for b in range(nb):
    at = b * beat; bar = (b // 4) % 4
    add(mix, kick * 0.9, at)
    if b % 2 == 1:
        add(mix, clap * 0.35, at)
    add(mix, hat * 0.25, at + beat / 2)
    # 反拍貝斯
    bs = filt(saw(note(roots[bar] - 12), beat / 2 * 0.9), "lowpass", 380) * np.exp(-t(beat / 2 * 0.9) * 4)
    add(mix, bs * 0.45, at + beat / 2)
    # 每拍琶音
    arp = chords[bar][b % 3] + 12
    pl = filt(saw(note(arp), 0.18), "lowpass", 2600) * np.exp(-t(0.18) * 18)
    add(mix, pl * 0.12, at + beat * 0.75)
    if b % 4 == 0:  # 每小節鋪一個和弦墊
        pad = sum(filt(saw(note(n) * d, beat * 4), "lowpass", 1200) for n in chords[bar] for d in (0.997, 1.003))
        add(mix, pad * np.interp(t(beat * 4), [0, 0.3, beat * 4 - 0.2, beat * 4], [0, 1, 1, 0]) * 0.04, at)
save("club_beat", mix, 0.8)
save("club_muffled", filt(mix, "lowpass", 320, 4) + filt(mix, "bandpass", [60, 120]) * 0.6, 0.8)  # 隔牆：只剩低頻

# ── 撥弦配樂 100 BPM，C–G–Am–F（Karplus-Strong），40 秒 ──
def pluck(f, sec, damp=0.996):
    n = int(SR / f); buf = rng.uniform(-1, 1, n); out = np.zeros(int(SR * sec))
    for i in range(len(out)):
        out[i] = buf[i % n]
        buf[i % n] = damp * 0.5 * (buf[i % n] + buf[(i + 1) % n])
    return out


BPM2 = 100; b2 = 60 / BPM2
mix = np.zeros(int(SR * DUR))
prog = [[48, 52, 55, 60], [43, 47, 50, 55], [45, 48, 52, 57], [41, 45, 48, 53]]
cache = {}
for b in range(int(DUR / b2)):
    at = b * b2; ch = prog[(b // 4) % 4]
    for k, n in enumerate(ch if b % 2 == 0 else ch[1:]):  # 掃弦
        key = (n, b % 2)
        if key not in cache:
            cache[key] = pluck(note(n + 12), 1.2) * (1 if b % 2 == 0 else 0.6)
        add(mix, cache[key] * 0.3, at + k * 0.018)
    shk = filt(rng.normal(0, 1, int(SR * 0.06)), "highpass", 5000) * np.exp(-t(0.06) * 50)
    add(mix, shk * 0.12, at + b2 / 2)
    add(mix, kick * 0.35, at if b % 2 == 0 else at + 99)
save("pluck", mix, 0.8)

# ── 環境音 ──
def babble(sec, n=14, lo=250, hi=2500):
    x = np.zeros(int(SR * sec))
    for _ in range(n):  # 一群人在講話：帶通雜訊 × 4–6 Hz 音節包絡
        syl = np.clip(np.sin(2 * np.pi * rng.uniform(3.5, 6) * t(sec) + rng.uniform(0, 6)), 0, 1) ** 2
        slow = np.clip(np.sin(2 * np.pi * rng.uniform(0.1, 0.3) * t(sec) + rng.uniform(0, 6)), 0, 1)
        c = rng.uniform(400, 1400)
        x += filt(rng.normal(0, 1, len(x)), "bandpass", [max(lo, c * 0.6), min(hi, c * 1.6)]) * syl * slow
    return x


save("crowd", babble(40, 24) + filt(rng.normal(0, 1, SR * 40), "lowpass", 400) * 0.3, 0.7)
mall = babble(40, 16)
for k in range(70):  # 遠處腳步
    add(mall, filt(rng.normal(0, 1, int(SR * 0.04)), "bandpass", [200, 900]) * np.exp(-t(0.04) * 60) * 2, rng.uniform(0, 39.5))
save("mall", mall, 0.6)
birds = filt(rng.normal(0, 1, SR * 40), "lowpass", 300) * 0.15
for k in range(45):  # 啾啾
    at = rng.uniform(0, 39); f0 = rng.uniform(2600, 4200)
    for j in range(rng.integers(1, 4)):
        d = rng.uniform(0.06, 0.12)
        fr = np.interp(t(d), [0, d], [f0, f0 * rng.uniform(1.15, 1.5)])
        add(birds, np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t(d) / d) * 0.5, at + j * 0.14)
save("birds", birds, 0.6)

# ── 音效 ──
d = 0.5
sweep = np.interp(t(d), [0, d], [250, 3500])
wh = np.zeros(int(SR * d))
for i in range(0, len(wh), 1200):  # 掃頻帶通雜訊
    seg = filt(rng.normal(0, 1, 2400), "bandpass", [sweep[i] * 0.7, sweep[i] * 1.3])[:1200]
    wh[i:i + len(seg)] += seg[: len(wh) - i]
save("whoosh", wh * np.sin(np.pi * t(d) / d) ** 1.5, 0.8)
sp = np.zeros(int(SR * 0.9))
for k in range(9):
    f0 = rng.uniform(2500, 6500); a = k * 0.06
    add(sp, np.sin(2 * np.pi * f0 * t(0.4)) * np.exp(-t(0.4) * 12) * rng.uniform(0.4, 1), a)
save("sparkle", sp, 0.7)
bell = lambda f, s, dec: (np.sin(2 * np.pi * f * t(s)) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t(s))) * np.exp(-t(s) * dec)
dg = np.zeros(int(SR * 0.8)); add(dg, bell(1318, 0.6, 7), 0); add(dg, bell(1760, 0.6, 7), 0.11)
save("ding", dg, 0.7)
cs = np.zeros(int(SR * 1.0))
add(cs, filt(rng.normal(0, 1, int(SR * 0.05)), "bandpass", [1500, 5000]) * np.exp(-t(0.05) * 60), 0)
add(cs, bell(2093, 0.9, 5) + bell(2637, 0.9, 5) * 0.7, 0.06)
save("cash", cs, 0.7)
db = np.zeros(int(SR * 1.6)); add(db, bell(659, 1.0, 3.5), 0); add(db, bell(523, 1.2, 3.0), 0.45)
save("doorbell", db, 0.7)
