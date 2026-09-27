#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 phase/themes/<name>.css 注入 HTML（或從 HTML 移除）。

可重複執行：注入時用標記包起來，再次套用會先移除舊的，不會層層疊加。

用法：
  python3 phase/scripts/apply_theme.py --theme swiss --target dca/index.html
  python3 phase/scripts/apply_theme.py --theme none  --target dca/index.html   # 還原
  python3 phase/scripts/apply_theme.py --list
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
THEMES = ROOT / "phase" / "themes"
BEGIN = "<!-- visual-world:begin -->"
END = "<!-- visual-world:end -->"


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def available() -> list[str]:
    return sorted(p.stem for p in THEMES.glob("*.css"))


def read_meta(css: str) -> dict:
    """取出 /*! theme-meta ... theme-meta */ 裡的 JSON。"""
    m = re.search(r"/\*!\s*theme-meta\s*(\{.*?\})\s*theme-meta\s*\*/", css, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as exc:
        die(f"theme-meta 不是合法 JSON：{exc}")


def strip_theme(html: str) -> tuple[str, bool]:
    """移除既有的注入區塊。回傳 (新內容, 是否有移除)。"""
    pattern = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", re.S)
    out, n = pattern.subn("", html)
    return out, n > 0


def inject(html: str, css: str, name: str) -> str:
    block = f'{BEGIN}\n<style data-visual-world="{name}">\n{css}\n</style>\n{END}\n'
    if "</head>" not in html:
        die("目標 HTML 沒有 </head>，不知道要注入到哪裡")
    return html.replace("</head>", block + "</head>", 1)


def main() -> None:
    ap = argparse.ArgumentParser(description="套用 / 移除視覺世界主題")
    ap.add_argument("--theme", "-t", help="主題名稱；none 代表移除")
    ap.add_argument("--target", "-f", action="append", default=[],
                    help="要套用的 HTML，可重複給")
    ap.add_argument("--list", action="store_true", help="列出可用主題")
    args = ap.parse_args()

    if args.list:
        for n in available():
            meta = read_meta((THEMES / f"{n}.css").read_text(encoding="utf-8"))
            print(f"  {n:<10} {meta.get('title','')}  （世界 {meta.get('world','?')}）")
        return

    if not args.theme:
        ap.error("需要 --theme（或用 --list）")
    if not args.target:
        ap.error("需要至少一個 --target")

    name = args.theme.strip().lower()
    css = ""
    if name != "none":
        path = THEMES / f"{name}.css"
        if not path.is_file():
            die(f"沒有這個主題：{name}。可用：{', '.join(available())}")
        css = path.read_text(encoding="utf-8")

    for t in args.target:
        p = ROOT / t if not Path(t).is_absolute() else Path(t)
        if not p.is_file():
            die(f"找不到檔案：{p}")
        html = p.read_text(encoding="utf-8")
        html, removed = strip_theme(html)
        if name == "none":
            p.write_text(html, encoding="utf-8")
            print(f"  {'✅ 已移除主題' if removed else '—  本來就沒有主題'}：{t}")
            continue
        p.write_text(inject(html, css, name), encoding="utf-8")
        print(f"  ✅ 套用 {name}{'（覆蓋舊主題）' if removed else ''}：{t}")


if __name__ == "__main__":
    main()
