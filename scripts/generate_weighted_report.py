#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
市值加權動能報表  scripts/generate_weighted_report.py
=====================================================================
9/6 用 2026-02-27 資料回測真實 SPMO 3 月調倉時發現的落差：MU/GOOGL/JNJ
分數排名夠高、會進我們的 Top 20，但真實基金權重最大的 NVDA（#1，~9%）
跟 AVGO（#3，7.19%）分數只排 #64/#69——因為真實 Invesco SPMO 的持股
權重 = momentum score × market cap，不是純分數排名。我們原本的 SPMO
Top 10（generate_daily_report.py 的 spmo_momentum_html）完全沒有市值
這個變數，抓得到「誰該進榜」，抓不到「誰的權重該最大」。

這支腳本產生一份獨立新報表（不動 daily-latest.html / daily-v2-latest.html
原本的排名邏輯），把「不加權排名」跟「market cap 加權排名」並排比較，
只對 SPMO score 做（12-1 動能 ÷ 年化波動）——這是真實驗證過落差的地方。

9/7 跟使用者確認過：point（V1 既有分數）刻意不加權。SPMO 天生要回答
「這支基金該持有多少」，真實持股權重本來就是 score × market cap，
不加權會跟真實基金對不起來；但 V1/V2（Sector Map、Opportunity Radar、
Price Lag、Capital Acceleration、Rotation Radar）回答的是「這檔股票
值不值得研究」，不是「投組該怎麼分配」——加市值權重反而會系統性把
AAPL/MSFT/NVDA 這種巨頭往前推，蓋掉真正有意思的中小型股訊號，違背
這些工具原本要抓「不對稱機會」的目的。板塊層的資料源（sector ETF）
本身在建構時也已經是市值加權，不需要再疊一層。之前這裡曾經多做一個
point 加權區塊驗證「V1 加權後是不是也不同」，結論確認會、而且落差更大
（NVDA/MSFT 從分數排名 #78/#84 直接衝上加權榜第 2/3 名）——但那只是
驗證用的探索，不該留在正式報表裡跟這裡的結論互相矛盾，所以移除。

加權方法（簡化版，不是真實 SPMO 完整方法論）：
  1. 先用純分數排序，取前 POOL_SIZE 檔當「入選池」（模擬真實指數的
     選股步驟——選誰進榜，只看動能分數）
  2. 入選池裡再用 max(score, 0) × market_cap 算權重、正規化成 100%
     （模擬真實指數的加權步驟——權重看分數 × 市值）
  3. 沒有市值資料的股票，該分析裡誠實排除，不用其他數字硬湊
沒有做的簡化：真實指數還有單一持股上限（5%）、換股緩衝規則（避免
每次都 100% 換血）、float-adjusted market cap（不是總市值）——這裡
不重現，報表裡會註明。

市值本身是 scripts/market_cap_snapshot.py 抓「現在」的快照，不是任何
歷史回放日期當天的真實市值（市值變化比動能分數慢很多，除非增減資/
股票分割，拿現在市值近似歷史日期是可接受的簡化，這裡誠實揭露，不假裝
是精確值）。

輸出：
  sector-rotation/reports/weighted-momentum-{date}.html
  sector-rotation/reports/weighted-momentum-latest.html
"""
import os
import sys
import csv
import glob
from datetime import datetime, timezone
from html import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_daily_report as gdr  # noqa: E402  重用 CSS / load_json

DATA_DIR = "data/sector_rotation"
REPORTS_DIR = "sector-rotation/reports"
MARKET_CAP_CSV = os.path.join(DATA_DIR, "market_cap_latest.csv")

POOL_SIZE = 100  # 模擬真實 SPMO 約 100 檔持股的入選池大小
TOP_N = 10

SCORE_DEFS = [
    ("spmo_score", "📐 SPMO Score（12-1 動能 ÷ 年化波動）",
     "9/6 用 2026-02-27 資料回測真實 SPMO 3 月調倉驗證過這裡的落差：MU/GOOGL/JNJ 分數排名高、"
     "會進榜；但真實權重最大的 NVDA/AVGO 分數只排 #64/#69——市值夠大，加權後權重照樣衝到最前面。"),
]


def load_market_caps():
    if not os.path.exists(MARKET_CAP_CSV):
        return {}
    caps = {}
    with open(MARKET_CAP_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                caps[row["symbol"]] = float(row["market_cap_usd"])
            except (KeyError, ValueError):
                continue
    return caps


def _latest_as_of():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "[0-9]" * 8 + "_all.csv")))
    if not files:
        return None
    stamp = os.path.basename(files[-1])[:8]
    return f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"


def load_all_rows(as_of):
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def compute_weighted_ranking(rows, score_field, market_caps, pool_size=POOL_SIZE, top_n=TOP_N):
    """回傳 dict：unweighted_top / weighted_top / pool_size_actual / pool_missing_cap。
    weighted_top 只從「純分數選出的入選池」裡再用 score×cap 排，不是全市場重選——
    這樣才對應真實指數「先選股、再加權」兩階段，不是一步到位用市值蓋過動能。"""
    scored = []
    for r in rows:
        raw = r.get(score_field)
        if raw in (None, ""):
            continue
        try:
            score = float(raw)
        except (TypeError, ValueError):
            continue
        scored.append({"symbol": r.get("symbol"), "sector": r.get("sector"),
                        "score": score, "cap": market_caps.get(r.get("symbol"))})
    scored.sort(key=lambda r: -r["score"])
    unweighted_top = scored[:top_n]

    pool = scored[:pool_size]
    pool_with_cap = [r for r in pool if r["cap"]]
    missing = len(pool) - len(pool_with_cap)
    total_raw = sum(max(r["score"], 0) * r["cap"] for r in pool_with_cap)
    for r in pool_with_cap:
        raw_w = max(r["score"], 0) * r["cap"]
        r["weight_pct"] = (raw_w / total_raw * 100) if total_raw > 0 else 0.0
    weighted_top = sorted(pool_with_cap, key=lambda r: -r["weight_pct"])[:top_n]

    unweighted_rank = {r["symbol"]: i + 1 for i, r in enumerate(scored)}
    for r in weighted_top:
        r["score_rank"] = unweighted_rank.get(r["symbol"])

    return {
        "unweighted_top": unweighted_top,
        "weighted_top": weighted_top,
        "pool_size_actual": len(pool),
        "pool_missing_cap": missing,
    }


def comparison_html(result, score_label):
    uw, w = result["unweighted_top"], result["weighted_top"]
    if not uw:
        return '<p class="empty">今日沒有這個分數的資料</p>'
    if not w:
        return (f'<p class="empty">入選池 {result["pool_size_actual"]} 檔裡有 '
                f'{result["pool_missing_cap"]} 檔沒有市值資料，加權版算不出來——'
                f'先跑 scripts/market_cap_snapshot.py</p>')

    def _row_uw(i, r):
        return (f'<tr><td class="n dim">{i}</td><td><b>{escape(r["symbol"] or "")}</b></td>'
                f'<td class="dim">{escape((r["sector"] or "")[:20])}</td>'
                f'<td class="n">{r["score"]:.2f}</td></tr>')

    def _row_w(i, r):
        moved = r.get("score_rank")
        moved_str = f'（分數排名 #{moved}）' if moved else '（分數排名 &gt;100，不在入選池前段）'
        return (f'<tr><td class="n dim">{i}</td><td><b>{escape(r["symbol"] or "")}</b></td>'
                f'<td class="dim">{escape((r["sector"] or "")[:20])}</td>'
                f'<td class="n">{r["weight_pct"]:.2f}%</td>'
                f'<td class="dim" style="font-size:11px;">{moved_str}</td></tr>')

    uw_rows = "".join(_row_uw(i, r) for i, r in enumerate(uw, 1))
    w_rows = "".join(_row_w(i, r) for i, r in enumerate(w, 1))
    missing_note = (f' · 入選池 {result["pool_size_actual"]} 檔中有 {result["pool_missing_cap"]} '
                     f'檔沒有市值資料，已排除' if result["pool_missing_cap"] else '')
    return f'''
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <h4 style="margin:0 0 8px;font-size:13px;">不加權（純 {score_label} 排名）</h4>
        <table style="font-size:12px;">
          <thead><tr><th>#</th><th>Symbol</th><th>Sector</th><th class="n">Score</th></tr></thead>
          <tbody>{uw_rows}</tbody>
        </table>
      </div>
      <div>
        <h4 style="margin:0 0 8px;font-size:13px;">市值加權（score × market cap，入選池前 {result["pool_size_actual"]} 檔內再排）</h4>
        <table style="font-size:12px;">
          <thead><tr><th>#</th><th>Symbol</th><th>Sector</th><th class="n">權重</th><th></th></tr></thead>
          <tbody>{w_rows}</tbody>
        </table>
      </div>
    </div>
    <div class="dim" style="font-size:11px;margin-top:10px;">入選池：純分數前 {POOL_SIZE} 檔（模擬真實指數的選股步驟）{missing_note}</div>
    '''


CSS_EXTRA = '''
  .empty { text-align:center; padding:16px; color:var(--muted,#6b7280); font-style:italic; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; padding:6px 8px; background:#f9fafb; font-size:10.5px; text-transform:uppercase;
       color:var(--muted,#6b7280); border-bottom:2px solid var(--line,#e2e5ea); }
  td { padding:5px 8px; border-bottom:1px solid var(--line,#e2e5ea); }
  td.n { text-align:right; font-variant-numeric:tabular-nums; }
  .dim { color:var(--muted,#6b7280); font-size:12px; }
'''


def render(as_of):
    all_rows = load_all_rows(as_of)
    market_caps = load_market_caps()
    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    cards = []
    for field, label, note in SCORE_DEFS:
        result = compute_weighted_ranking(all_rows, field, market_caps)
        cards.append(f'''
  <div class="card">
    <div class="card-h">{label}<span class="n">Top {TOP_N}</span></div>
    <div class="card-b">
      <p class="dim" style="font-size:12px;margin:0 0 12px;">{note}</p>
      {comparison_html(result, label.split("（")[0])}
    </div>
  </div>''')

    cap_note = (f'{len(market_caps)} 檔有市值資料' if market_caps
                else '⚠️ 還沒有市值資料（先跑 scripts/market_cap_snapshot.py），下面兩個區塊都算不出加權版')

    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>市值加權動能比較 · {as_of}</title>
<style>{gdr.CSS if hasattr(gdr, "CSS") else ""}{CSS_EXTRA}</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">US</div>
    <div class="htitle">
      <span class="tag">加權 vs 不加權 · 實驗版</span>
      <h1>⚖️ 市值加權動能比較 · {as_of}</h1>
      <p>9/6 用 2026-02-27 資料回測真實 SPMO 3 月調倉發現：我們的分數排名能抓到「誰該入選」（MU/GOOGL/JNJ
         都命中），但抓不到「誰的權重該最大」（真實權重最大的 NVDA/AVGO 分數只排 #64/#69）——因為真實指數
         權重 = 動能分數 × 市值，不是純分數排名。這份報表把 SPMO 的兩種排法並排比較。9/7 跟使用者確認過：
         V1/V2（daily-latest.html / daily-v2-latest.html 的 Sector Map / Opportunity Radar / Price Lag /
         Rotation Radar 等）刻意不加權——它們回答「值不值得研究」，不是「該持有多少」，加市值權重反而會
         把 AAPL/MSFT/NVDA 這種巨頭往前推、蓋掉真正有意思的中小型股訊號，違背這些工具的目的。
         獨立新報表，不影響 daily-latest.html / daily-v2-latest.html 原本的排名。</p>
    </div>
  </div>

  <div class="card">
    <div class="card-h">市值資料狀態<span class="n">{cap_note}</span></div>
    <div class="card-b"><p class="dim" style="font-size:12px;margin:0;">
      市值來自 scripts/market_cap_snapshot.py 抓「現在」的快照，不是任何歷史日期當天的真實市值——
      市值變化比動能分數慢很多（除非增減資/股票分割），拿現在市值近似歷史日期是可接受的簡化，不是精確值。
      這版加權也沒有真實 SPMO 的單一持股 5% 上限、換股緩衝規則、float-adjusted market cap，
      是簡化版，用來回答「市值這個變數本身會不會讓排名不同」，不是要重現真實基金的精確持股。
    </p></div>
  </div>

  {"".join(cards)}

  <div class="foot">
    產生時間 {gen_ts} ·
    <a href="daily-latest.html">看美股報表</a> · <a href="daily-v2-latest.html">看美股 V2 報表</a>
    <br><br>
    <span style="color:#94a3b8;">投資有風險 · 本報告為系統化訊號記錄 · 不構成投資建議</span>
  </div>

</div>
</body>
</html>'''

    os.makedirs(REPORTS_DIR, exist_ok=True)
    dated_path = os.path.join(REPORTS_DIR, f"weighted-momentum-{as_of}.html")
    latest_path = os.path.join(REPORTS_DIR, "weighted-momentum-latest.html")
    with open(dated_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)
    return dated_path, latest_path


def main():
    as_of = _latest_as_of()
    if not as_of:
        sys.exit("❌ 沒有任何 {date}_all.csv，先跑 sector_rotation_screener.py")
    dated, latest = render(as_of)
    print(f"✅ 產生 {dated}")
    print(f"✅ 覆寫 {latest}")


if __name__ == "__main__":
    main()
