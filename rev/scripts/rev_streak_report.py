#!/usr/bin/env python3
"""★★★ 全市場月營收 YoY 連續成長統計 → HTML + CSV 報表

   讀 raw/rev_hist_36m.json（rev_bulk.py --history 36 產生）與最新的 raw/rev_bulk_*.json，
   對每一家算三個數字：
     ① 最近連續正成長月數
     ② 最近 36 個月內正成長月數
     ③ 最近連續負成長月數

   ★★ 資料來源全部是官方 bulk 端點，不用 FinMind、沒有配額（#529）。
   用法：python3 scripts/tw/rev_streak_report.py [--out path/index.html]
"""
import sys, json, csv, pathlib, datetime as dt

D   = pathlib.Path(__file__).parent
RAW = D/"raw"
OUT = pathlib.Path(sys.argv[sys.argv.index("--out")+1]) if "--out" in sys.argv else D/"rev_streak.html"

# ★ 不要寫死 36 —— workflow 可以指定回溯月數，寫死會在 months≠36 時直接失敗
HS = sorted(RAW.glob("rev_hist_*m.json"),
            key=lambda p: int(p.stem.split("_")[-1][:-1]), reverse=True)
if not HS:
    sys.exit("★★ 缺 raw/rev_hist_*m.json ⇒ 先跑 python3 scripts/tw/rev_bulk.py --history 36")
HIST = json.loads(HS[0].read_text())
MONTHS = int(HIST.get("months") or 36)

BULKS = sorted(RAW.glob("rev_bulk_*.json"))
BULK  = json.loads(BULKS[-1].read_text()) if BULKS else {}

def _ordk(t):
    y, m = t.split("/"); return int(y)*12 + int(m)

def streak(mm):
    """★ 與 body_check.py 的 streak() 同一套規則 —— 改這裡也要改那裡"""
    ser = [v for _, v in sorted(((t, v) for t, v in mm.items() if v is not None),
                                key=lambda x: _ordk(x[0]))]
    if len(ser) < 6: return None
    cp = cn = 0
    for v in reversed(ser):
        if v > 0: cp += 1
        else: break
    for v in reversed(ser):
        if v <= 0: cn += 1
        else: break
    return cp, sum(1 for v in ser if v > 0), cn, len(ser), ser[-1]

NAME = HIST.get("name") or {}
rows = []
for c, mm in (HIST.get("yoy") or {}).items():
    s = streak(mm)
    if not s: continue
    b = BULK.get(c, {})
    rows.append(dict(code=c, name=b.get("name") or NAME.get(c) or "—",
                     market=b.get("market") or "—", ind=b.get("ind") or "—",
                     cp=s[0], pos36=s[1], cn=s[2], n=s[3], last=round(s[4], 2),
                     rev=(round(b["rev"]/1e5, 2) if b.get("rev") else None)))
rows.sort(key=lambda r: (-r["cp"], -r["pos36"], r["cn"], r["code"]))

ymraw = str(HIST.get("latest") or "")
ym = f"民國 {ymraw[:3]} 年 {int(ymraw[3:]):02d} 月" if len(ymraw) == 5 else ymraw
ts = dt.datetime.now().strftime("%Y-%m-%d %H:%M")

csvp = OUT.with_suffix(".csv")
OUT.parent.mkdir(parents=True, exist_ok=True)
with csvp.open("w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["股票代號","公司名稱","市場","產業","最近連續正成長月數",
                "36個月內正成長月數","最近連續負成長月數","有效月數","最新月YoY%","當月營收(億)"])
    for r in rows:
        w.writerow([r["code"], r["name"], r["market"], r["ind"], r["cp"],
                    r["pos36"], r["cn"], r["n"], r["last"], r["rev"] if r["rev"] is not None else ""])

TPL = (D/"rev_streak_tpl.html").read_text()
html = (TPL.replace("__DATA__", json.dumps(rows, ensure_ascii=False))
           .replace("__YM__", ym).replace("__TS__", ts)
           .replace("__N__", str(len(rows))).replace("__M__", str(MONTHS))
           .replace("__CSV__", csvp.name))
OUT.write_text(html)

d = {}
for r in rows: d[r["cp"]] = d.get(r["cp"], 0) + 1
print(f"★★ {len(rows)} 家　資料年月 {ym}")
print(f"   連續正成長 ≥12 月：{sum(1 for r in rows if r['cp']>=12):>4} 家")
print(f"   連續正成長 ≥6  月：{sum(1 for r in rows if r['cp']>=6):>4} 家")
print(f"   {MONTHS} 月內正成長 ≥{int(MONTHS*0.9)}：{sum(1 for r in rows if r['pos36']>=int(MONTHS*0.9)):>4} 家")
print(f"   連續負成長 ≥6  月：{sum(1 for r in rows if r['cn']>=6):>4} 家")
print(f"✓ {OUT}　({OUT.stat().st_size:,} bytes)")
print(f"✓ {csvp}")
