#!/usr/bin/env python3
"""把 src/ 裡用到的字（台詞、紙卡、標題）抽出來，向 Google Fonts 要 Noto Serif TC 子集 → public/*.woff2"""
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
chars = set()
for p in (ROOT / "src").rglob("*.tsx"):
    for s in re.findall(r"[ -￿]", p.read_text(encoding="utf-8")):
        chars.add(s)
chars |= set("0123456789+-=x?!.,:;/() ")
text = "".join(sorted(chars))
(ROOT / "public" / "glyphs.txt").write_text(text, encoding="utf-8")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"}
for w in ("700", "900"):
    url = "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@" + w + "&text=" + urllib.parse.quote(text)
    css = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read().decode()
    src = re.search(r"url\((https://[^)]+)\)", css).group(1)
    data = urllib.request.urlopen(urllib.request.Request(src, headers=UA)).read()
    (ROOT / "public" / f"noto-serif-tc-{w}.woff2").write_bytes(data)
    print(w, len(data) // 1024, "KB", len(text), "glyphs")
