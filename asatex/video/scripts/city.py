#!/usr/bin/env python3
"""把靜態城市（街廓、海、碼頭、店面）輸出成一張 SVG —— 影片裡只載入一次，
會動的東西（車、船、雲影、標籤、角色、HUD）全部在 React 活動層。

    python3 scripts/city.py   →  public/city.svg（地圖座標 -600..2800 × -600..3800）
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from build_storyboard_game import world  # noqa: E402

body = world("city", static=True)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-600 -600 3400 4400" width="3400" height="4400">'
       f'<rect x="-600" y="-600" width="3400" height="4400" fill="#F4EFE6"/>{body}</svg>')
out = Path(__file__).resolve().parents[1] / "public" / "city.svg"
out.write_text(svg, encoding="utf-8")
print(out, f"{len(svg) / 1024:.0f} KB")
