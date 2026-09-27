#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""驗證主題宣告的對比度與色彩分離度。不合格就以非零碼結束。

每個主題的 CSS 檔開頭有一段 theme-meta JSON，列出：
  checks       —— 文字／圖形對背景的 WCAG 對比，各自帶 min（正文 4.5、圖形物件 3.0）
  separations  —— 相鄰資料系列的 OKLab ΔE，常視覺底線 15

用法：
  python3 phase/scripts/check_contrast.py              # 驗全部
  python3 phase/scripts/check_contrast.py --theme swiss
  python3 phase/scripts/check_contrast.py --md          # 輸出 Markdown（給 job summary）
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
THEMES = ROOT / "phase" / "themes"


def _srgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def luminance(h: str) -> float:
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in _srgb(h)]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    l1, l2 = sorted((luminance(a), luminance(b)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def oklab(h: str) -> tuple[float, float, float]:
    r, g, b = (x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in _srgb(h))
    l = (0.4122 * r + 0.5364 * g + 0.0514 * b) ** (1 / 3)
    m = (0.2119 * r + 0.6807 * g + 0.1074 * b) ** (1 / 3)
    s = (0.0883 * r + 0.2818 * g + 0.6300 * b) ** (1 / 3)
    return (0.2105 * l + 0.7936 * m - 0.0041 * s,
            1.9780 * l - 2.4286 * m + 0.4506 * s,
            0.0259 * l + 0.7828 * m - 0.8086 * s)


def delta_e(a: str, b: str) -> float:
    A, B = oklab(a), oklab(b)
    return 100 * math.sqrt(sum((x - y) ** 2 for x, y in zip(A, B)))


def read_meta(path: Path) -> dict:
    m = re.search(r"/\*!\s*theme-meta\s*(\{.*?\})\s*theme-meta\s*\*/",
                  path.read_text(encoding="utf-8"), re.S)
    return json.loads(m.group(1)) if m else {}


def main() -> None:
    ap = argparse.ArgumentParser(description="驗證主題色票")
    ap.add_argument("--theme", "-t", help="只驗一個主題；省略就全部")
    ap.add_argument("--md", action="store_true", help="輸出 Markdown 表格")
    args = ap.parse_args()

    names = [args.theme] if args.theme else sorted(p.stem for p in THEMES.glob("*.css"))
    failures: list[str] = []
    lines: list[str] = []

    for name in names:
        path = THEMES / f"{name}.css"
        if not path.is_file():
            print(f"❌ 沒有這個主題：{name}", file=sys.stderr)
            sys.exit(1)
        meta = read_meta(path)
        if not meta:
            print(f"⚠️  {name}：沒有 theme-meta，跳過")
            continue

        title = meta.get("title", name)
        head = f"### {title}（`{name}`）"
        rows = []

        for c in meta.get("checks", []):
            got, need = contrast(c["fg"], c["bg"]), c["min"]
            ok = got >= need
            if not ok:
                failures.append(f"{name}：{c['what']} {c['fg']} on {c['bg']} = {got:.2f}:1，需 {need}")
            rows.append(("對比", c["what"], f"`{c['fg']}` / `{c['bg']}`",
                         f"{got:.2f}:1", f"≥{need}", "✅" if ok else "❌"))

        for s in meta.get("separations", []):
            got, need = delta_e(s["a"], s["b"]), s["min"]
            ok = got >= need
            if not ok:
                failures.append(f"{name}：{s['what']} ΔE {got:.1f}，需 {need}")
            rows.append(("分離度", s["what"], f"`{s['a']}` ↔ `{s['b']}`",
                         f"ΔE {got:.1f}", f"≥{need}", "✅" if ok else "❌"))

        if args.md:
            lines.append(head)
            lines.append("")
            lines.append("| 類型 | 項目 | 色 | 實測 | 門檻 | |")
            lines.append("|---|---|---|---|---|---|")
            lines += ["| " + " | ".join(r) + " |" for r in rows]
            lines.append("")
        else:
            print(f"\n{title}（{name}）")
            for kind, what, colors, got, need, mark in rows:
                print(f"  {mark} {kind:<4} {what:<34} {got:>10}  需 {need}")

    if args.md:
        print("\n".join(lines))

    if failures:
        msg = "\n".join(f"  - {f}" for f in failures)
        print(f"\n❌ {len(failures)} 項不合格：\n{msg}", file=sys.stderr)
        sys.exit(1)
    print(f"\n✅ {len(names)} 套主題全部通過", file=sys.stderr if args.md else sys.stdout)


if __name__ == "__main__":
    main()
