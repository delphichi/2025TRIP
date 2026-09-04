#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股板塊研究日報產生器  scripts/generate_daily_report_tw.py
======================================================
Phase 1 範圍：讀 tw_scorecard_latest.json + tw_latest.json + 當日 tw_{date}_all.csv ·
產出跟美股版視覺語言一致（同一套 .card/.card-h/.card-b/.dow/.pv/.exp CSS）的 HTML 報告。
沒有 Layer 1.5 供應鏈次產業、象限/健康度分類、S1-S5 感測器（Phase 2）。

輸出：
  sector-rotation/reports/daily-tw-YYYY-MM-DD.html   當日快照
  sector-rotation/reports/daily-tw-latest.html        最新版（覆寫）

用法：
  python scripts/generate_daily_report_tw.py
"""
import os
import sys
import json
import csv
from datetime import datetime, timezone
from html import escape

DATA_DIR = "data/sector_rotation"
REPORTS_DIR = "sector-rotation/reports"

SCORECARD = os.path.join(DATA_DIR, "tw_scorecard_latest.json")
STAGE2 = os.path.join(DATA_DIR, "tw_latest.json")


def load_json(p):
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def num(v, d=2, pct=False, sign=False):
    if v is None:
        return "—"
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    if v != v:  # NaN
        return "—"
    s = f"{v:+.{d}f}" if sign else f"{v:.{d}f}"
    return s + ("%" if pct else "")


def ntd_amount(v_million):
    """金額顯示：輸入單位是 NT$ 百萬元（inst_*_est_NTD_M 這類欄位的單位）。
    >=100（=1億）用「億元」、否則用「萬元」——比股數更容易讀出資金規模大小。"""
    if v_million is None:
        return "—"
    try:
        v = float(v_million)
    except (TypeError, ValueError):
        return "—"
    if v != v:  # NaN
        return "—"
    sign = "+" if v > 0 else ("" if v == 0 else "-")
    av = abs(v)
    if av >= 100:
        return f"{sign}{av / 100:.2f}億元"
    return f"{sign}{av * 100:.0f}萬元"


DOW_META = {
    "多頭": ("📈", "dow-long"),
    "空頭": ("📉", "dow-short"),
    "收斂": ("🔺", "dow-squeeze"),
    "擴散": ("🔻", "dow-broaden"),
}


def dow_cell(r):
    st = r.get("trend_state") or ""
    pat = r.get("trend_pattern") or ""
    sig = r.get("trend_signal") or ""
    if not st or st == "資料不足":
        return '<td><span class="dow-none">—</span></td>'
    emo, cls = DOW_META.get(st, ("", "dow-none"))
    title = pat + (" · " + sig if sig else "")
    sig_html = f'<span class="dow-sig">{escape(sig)}</span>' if sig else ""
    return f'<td><span class="dow {cls}" title="{escape(title)}">{emo} {escape(st)}</span>{sig_html}</td>'


def pv_cell(r):
    v = r.get("pv_verdict") or ""
    if not v or v == "資料不足":
        return '<td><span style="color:var(--muted)">—</span></td>'
    cls = "pv-neutral"
    if "完美多頭" in v or "健康多頭" in v or "底部" in v:
        cls = "pv-strong"
    elif "頂部背離" in v or "中期出貨" in v or "量能背離" in v:
        cls = "pv-warn"
    elif "量能衰竭" in v or "主升段結束" in v or "主力出貨" in v or "熊市" in v or "弱勢" in v:
        cls = "pv-weak"
    elif "反彈初期" in v:
        cls = "pv-early"
    return f'<td><span class="pv {cls}">{escape(v)}</span></td>'


def exp_cell(r):
    v = (r.get("explosive_verdict") or "").strip()
    if not v:
        return '<td><span style="color:var(--muted)">—</span></td>'
    cls = "exp-none"
    if "暴漲中" in v:
        cls = "exp-boom"
    elif "潛在暴漲" in v:
        cls = "exp-cand"
    elif "追高" in v:
        cls = "exp-risk"
    return f'<td><span class="exp {cls}">{escape(v)}</span></td>'


def top_stock_row(r):
    sid = escape(str(r.get("stock_id", "")))
    name = escape((r.get("stock_name") or "")[:20])
    sector = escape(r.get("sector", ""))
    pt = num(r.get("point"), 1)
    vp = num(r.get("vp_score_stock"), 0)
    c4 = num(r.get("cum_ret_4w"), 1, pct=True, sign=True)
    c26 = num(r.get("cum_ret_26w"), 1, pct=True, sign=True)
    alert = r.get("stock_gap_alert") or ""
    alert_html = f'<span class="alert">{escape(alert)}</span>' if alert else ""
    inst = r.get("inst_total_net_20d_est_NTD_M")
    inst_html = ntd_amount(inst)
    inst_cls = "up" if (inst is not None and inst == inst and inst > 0) else (
        "down" if (inst is not None and inst == inst and inst < 0) else "flat")
    vlink = (f'<a href="../../valuation/index.html?ticker={sid}.TW" target="_blank" '
             f'title="開啟估值分析器（新分頁）" '
             f'style="text-decoration:none;margin-left:3px;font-size:10px;opacity:0.7;">📊</a>')
    return f'''
        <tr>
          <td><b>{sid}</b>{vlink} <span class="dim">{name}</span></td>
          <td>{sector}</td>
          <td class="n">{pt}</td>
          <td class="n">{vp}</td>
          <td class="n">{c4}</td>
          <td class="n">{c26}</td>
          <td>{alert_html}</td>
          {dow_cell(r)}
          {pv_cell(r)}
          {exp_cell(r)}
          <td class="n {inst_cls}">{inst_html}</td>
        </tr>'''


def sector_row(r):
    sec = escape(r.get("sector", ""))
    pt = num(r.get("point"), 1)
    acc = r.get("acceleration")
    acc_str = num(acc, 1, sign=True) if acc is not None else "—"
    acc_cls = "up" if (acc is not None and acc == acc and acc > 0) else (
        "down" if (acc is not None and acc == acc and acc < 0) else "flat")
    breadth = r.get("breadth_pct")
    breadth_str = f"{breadth:.0f}%" if breadth is not None and breadth == breadth else "—"
    n = r.get("stock_count", 0)
    inst = r.get("inst_net_20d_est_NTD_M")
    inst_html = ntd_amount(inst)
    inst_cls = "up" if (inst is not None and inst == inst and inst > 0) else (
        "down" if (inst is not None and inst == inst and inst < 0) else "flat")
    cpd_html = cpd_cell(r)
    return f'''
        <tr>
          <td><b>{sec}</b> <span class="dim">n={n}</span></td>
          <td class="n">{pt}</td>
          <td class="n {acc_cls}">{acc_str}</td>
          <td class="n">{breadth_str}</td>
          <td class="n {inst_cls}">{inst_html}</td>
          {cpd_html}
        </tr>'''


CPD_META = {
    "🚀 Confirmed": "cpd-confirmed",
    "💰 Capital Leading": "cpd-leading",
    "⚠️ Price Leading": "cpd-warn",
    "❄️ Weak": "cpd-weak",
}


def cpd_cell(r):
    q = r.get("cpd_quadrant")
    cpd = r.get("cpd")
    if not q or q != q:
        return '<td><span class="dow-none">—</span></td>'
    cls = CPD_META.get(q, "cpd-weak")
    cpd_str = num(cpd, 2, sign=True) if cpd is not None else ""
    return f'<td><span class="cpd {cls}" title="CPD = Z(法人金額) - Z(SectorPoint)：{cpd_str}">{escape(q)}</span></td>'


def cpd_matrix_html(rows_sorted):
    """四象限分組卡：💰 Capital Leading 是狩獵區（資金已進、價格尚未反映）；
    🚀 Confirmed 資金價格同步；⚠️ Price Leading 價格已動法人沒跟，追高風險；
    ❄️ Weak 都沒動靜。每個象限內依 |CPD| 由大到小排（背離越明顯排越前面）。
    """
    buckets = {"💰 Capital Leading": [], "🚀 Confirmed": [], "⚠️ Price Leading": [], "❄️ Weak": []}
    for r in rows_sorted:
        q = r.get("cpd_quadrant")
        if q in buckets:
            buckets[q].append(r)

    def _cpd(r):
        try:
            return abs(float(r.get("cpd")))
        except (TypeError, ValueError):
            return 0.0

    for q in buckets:
        buckets[q].sort(key=_cpd, reverse=True)

    col_cls = {"💰 Capital Leading": "leading", "🚀 Confirmed": "confirmed",
               "⚠️ Price Leading": "warn", "❄️ Weak": "weak"}
    cols = []
    for label, items in buckets.items():
        lis = "".join(
            f'<li><b>{escape(r.get("sector",""))}</b> '
            f'<span>point {num(r.get("point"),1)} · {ntd_amount(r.get("inst_net_20d_est_NTD_M"))}</span></li>'
            for r in items
        ) or '<li class="empty">今日無</li>'
        cols.append(f'''
        <div class="cpdcol {col_cls[label]}">
          <h4>{label}<span class="cnt">{len(items)}</span></h4>
          <ul>{lis}</ul>
        </div>''')
    return "".join(cols)


def load_all_stocks(as_of):
    """讀當日 tw_{date}_all.csv（全股票池），給暴漲候選池 + 法人資金榜用"""
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"tw_{stamp}_all.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def explosive_pool_html(all_rows):
    buckets = {"🚀 暴漲中": [], "🎯 潛在暴漲": [], "🔥 追高風險": []}
    for r in all_rows:
        v = (r.get("explosive_verdict") or "").strip()
        if v in buckets:
            buckets[v].append(r)

    def _f(r, k):
        try:
            return float(r.get(k) or 0)
        except (TypeError, ValueError):
            return 0

    buckets["🚀 暴漲中"].sort(key=lambda r: -_f(r, "point"))
    buckets["🎯 潛在暴漲"].sort(key=lambda r: -_f(r, "point"))
    buckets["🔥 追高風險"].sort(key=lambda r: -_f(r, "cum_ret_26w"))

    cols = []
    col_cls = {"🚀 暴漲中": "boom", "🎯 潛在暴漲": "cand", "🔥 追高風險": "risk"}
    for label, rows in buckets.items():
        items = "".join(
            f'<li><b>{escape(r.get("stock_id",""))}</b> '
            f'<span class="sec">{escape((r.get("stock_name") or "")[:12])}</span>'
            f'<span>{num(r.get("cum_ret_4w"), 1, pct=True, sign=True)}</span></li>'
            for r in rows[:8]
        ) or '<li class="empty">今日無</li>'
        cols.append(f'''
        <div class="expcol {col_cls[label]}">
          <h4>{label}<span class="cnt">{len(rows)}</span></h4>
          <ul>{items}</ul>
        </div>''')
    return "".join(cols)


def inst_flow_leaderboard_html(all_rows, top_n=10):
    def _f(r, k):
        try:
            return float(r.get(k) or 0)
        except (TypeError, ValueError):
            return None

    scored = [(r, _f(r, "inst_total_net_20d_est_NTD_M")) for r in all_rows]
    scored = [(r, v) for r, v in scored if v is not None]
    inflow = sorted(scored, key=lambda x: -x[1])[:top_n]
    outflow = sorted(scored, key=lambda x: x[1])[:top_n]

    def _rows(items):
        return "".join(
            f'''<tr>
              <td><b>{escape(r.get("stock_id",""))}</b> <span class="dim">{escape((r.get("stock_name") or "")[:16])}</span></td>
              <td>{escape(r.get("sector",""))}</td>
              <td class="n {'up' if v > 0 else 'down'}">{ntd_amount(v)}</td>
            </tr>''' for r, v in items
        ) or '<tr><td colspan="3" class="empty">資料不足</td></tr>'

    return f'''
  <div class="card">
    <div class="card-h">💵 三大法人 20 日淨買賣 Top {top_n}<span class="n">依金額排序</span></div>
    <div class="card-b" style="padding:0;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
        <div>
          <table><thead><tr><th>淨買超</th><th>Sector</th><th class="n">20d 淨買（金額）</th></tr></thead>
          <tbody>{_rows(inflow)}</tbody></table>
        </div>
        <div>
          <table><thead><tr><th>淨賣超</th><th>Sector</th><th class="n">20d 淨賣（金額）</th></tr></thead>
          <tbody>{_rows(outflow)}</tbody></table>
        </div>
      </div>
    </div>
  </div>'''


CSS = '''
  :root {
    --navy:#1b2a4a; --navy-d:#0f1930; --gold:#c9a24b; --gold-l:#e8d9ae;
    --bg:#f4f5f7; --card:#ffffff; --line:#e2e5ea;
    --text:#2a2f3a; --muted:#6b7280;
    --green:#1e8449; --red:#c0392b; --amber:#d97706; --blue:#2563eb;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; padding:24px; background:var(--bg);
    font-family:"PingFang TC","Microsoft JhengHei","Noto Sans TC",-apple-system,sans-serif;
    color:var(--text); line-height:1.55;
  }
  .sheet { max-width:1180px; margin:0 auto; }
  .up { color:var(--green); font-weight:700; }
  .down { color:var(--red); font-weight:700; }
  .flat { color:var(--muted); font-weight:600; }
  .dim { color:var(--muted); font-size:12px; }
  .header {
    background:var(--card); border-radius:10px; padding:22px 26px;
    box-shadow:0 1px 3px rgba(0,0,0,.06); margin-bottom:14px;
    display:flex; align-items:center; gap:20px; flex-wrap:wrap;
  }
  .logo {
    width:56px; height:56px; border-radius:50%;
    background:linear-gradient(135deg,var(--navy),var(--navy-d));
    display:flex; align-items:center; justify-content:center;
    color:var(--gold-l); font-weight:800; font-size:22px; border:2px solid var(--gold);
  }
  .htitle { flex:1; min-width:280px; }
  .htitle .tag {
    display:inline-block; background:var(--navy); color:var(--gold-l);
    font-size:11px; padding:2px 10px; border-radius:12px; margin-bottom:6px; letter-spacing:1px;
  }
  .htitle h1 { margin:0 0 6px 0; font-size:22px; color:var(--navy); }
  .htitle p { margin:0; font-size:13px; color:var(--muted); }
  .tldr {
    background:linear-gradient(90deg,#0f1930,#1b2a4a); color:#fef3c7;
    padding:16px 22px; border-radius:10px; margin-bottom:14px;
    font-size:14px; line-height:1.7; border-left:4px solid var(--gold);
  }
  .tldr b { color:#fff; }
  .snap {
    display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
    gap:10px; margin-bottom:14px;
  }
  .snap-cell {
    background:var(--card); padding:12px 14px; border-radius:8px;
    box-shadow:0 1px 3px rgba(0,0,0,.05);
  }
  .snap-cell .l { font-size:10.5px; color:var(--muted); letter-spacing:.5px; text-transform:uppercase; }
  .snap-cell .v { font-size:20px; font-weight:800; color:var(--navy); margin-top:2px; }
  .snap-cell .s { font-size:11px; color:var(--muted); margin-top:2px; }
  .card {
    background:var(--card); border-radius:10px; overflow:hidden; margin-bottom:14px;
    box-shadow:0 1px 3px rgba(0,0,0,.06);
  }
  .card-h {
    background:var(--navy); color:#fff; padding:10px 18px; font-size:13.5px; font-weight:700;
    letter-spacing:.5px; display:flex; justify-content:space-between; align-items:center;
  }
  .card-h .n { background:var(--gold); color:var(--navy-d); font-size:11px; padding:2px 8px; border-radius:10px; }
  .card-b { padding:14px 18px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th {
    text-align:left; padding:8px 10px; background:#f9fafb; color:var(--muted);
    font-size:10.5px; text-transform:uppercase; letter-spacing:.5px;
    border-bottom:2px solid var(--line); font-weight:600;
  }
  td { padding:7px 10px; border-bottom:1px solid var(--line); }
  td.n { text-align:right; font-variant-numeric:tabular-nums; }
  tr:last-child td { border-bottom:none; }
  .empty { text-align:center; padding:16px; color:var(--muted); font-style:italic; }
  .alert { background:#fef3c7; color:#92400e; padding:1px 8px; border-radius:10px; font-size:11px; }
  .dow {
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
    white-space:nowrap;
  }
  .dow-long { background:#dcfce7; color:#166534; }
  .dow-short { background:#fee2e2; color:#991b1b; }
  .dow-squeeze { background:#fef3c7; color:#92400e; }
  .dow-broaden { background:#ede9fe; color:#6d28d9; }
  .dow-none { color:#94a3b8; font-size:10px; }
  .dow-sig { font-size:10px; color:var(--muted); margin-left:4px; }
  .pv {
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
    white-space:nowrap;
  }
  .pv-strong { background:#dcfce7; color:#166534; border:1px solid #86efac; }
  .pv-warn { background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
  .pv-weak { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
  .pv-early { background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; }
  .pv-neutral { background:#f3f4f6; color:#6b7280; }
  .exp {
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;
    white-space:nowrap;
  }
  .exp-boom { background:#fef3c7; color:#92400e; border:1px solid #fbbf24; }
  .exp-cand { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; }
  .exp-risk { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
  .exp-none { color:#94a3b8; }
  .cpd {
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
    white-space:nowrap;
  }
  .cpd-confirmed { background:#dcfce7; color:#166534; border:1px solid #86efac; }
  .cpd-leading { background:#fef3c7; color:#92400e; border:1px solid #fbbf24; }
  .cpd-warn { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
  .cpd-weak { background:#f3f4f6; color:#6b7280; }
  .cpdcols { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media(max-width:640px) { .cpdcols { grid-template-columns:1fr; } }
  .cpdcol { background:#f9fafb; border-radius:8px; padding:10px 12px; border-left:3px solid var(--muted); }
  .cpdcol.leading { border-left-color:#f59e0b; background:#fffbeb; }
  .cpdcol.confirmed { border-left-color:#22c55e; background:#f0fdf4; }
  .cpdcol.warn { border-left-color:#ef4444; background:#fef2f2; }
  .cpdcol.weak { border-left-color:#94a3b8; background:#f9fafb; }
  .cpdcol h4 { margin:0 0 6px 0; font-size:13px; color:var(--navy); }
  .cpdcol .cnt { font-size:11px; color:var(--muted); margin-left:6px; }
  .cpdcol ul { margin:0; padding-left:0; list-style:none; font-size:12px; }
  .cpdcol li { padding:2px 0; display:flex; justify-content:space-between; }
  .cpdcol .empty { color:var(--muted); font-style:italic; font-size:11px; }
  .expcols { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
  @media(max-width:800px) { .expcols { grid-template-columns:1fr; } }
  .expcol { background:#f9fafb; border-radius:8px; padding:10px 12px; border-left:3px solid var(--muted); }
  .expcol.boom { border-left-color:#f59e0b; background:#fffbeb; }
  .expcol.cand { border-left-color:#3b82f6; background:#eff6ff; }
  .expcol.risk { border-left-color:#ef4444; background:#fef2f2; }
  .expcol h4 { margin:0 0 6px 0; font-size:13px; color:var(--navy); }
  .expcol .cnt { font-size:11px; color:var(--muted); margin-left:6px; }
  .expcol ul { margin:0; padding-left:0; list-style:none; font-size:12px; }
  .expcol li { padding:2px 0; display:flex; justify-content:space-between; }
  .expcol .sec { color:var(--muted); font-size:10.5px; }
  .expcol .empty { color:var(--muted); font-style:italic; font-size:11px; }
  .foot {
    background:var(--card); border-radius:10px; padding:16px 20px;
    margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    text-align:center; font-size:12px; color:var(--muted);
  }
  .foot a { color:var(--navy); text-decoration:none; border-bottom:1px dotted var(--navy); }
'''


def render(scorecard, stage2):
    as_of = scorecard.get("as_of_date")
    rows = scorecard.get("rows") or []
    rows_sorted = sorted(rows, key=lambda r: -(r.get("point") or 0))
    market = scorecard.get("market_snapshot") or {}
    market_label = "TAIEX（官方指數）" if market.get("proxy") == "TAIEX" else "0050（TAIEX 代理）"
    all_rows = load_all_stocks(as_of)
    top_stocks = (stage2.get("top3", {}) or {}).get("composite", [])

    sector_rows_html = "".join(sector_row(r) for r in rows_sorted) \
        or '<tr><td colspan="6" class="empty">今日無板塊資料</td></tr>'

    # 排序：先依板塊（跟上面 📊 板塊表同一個 point 排名順序），同板塊內再依「個股 20 日
    # 全部成交金額」由大到小——這是市場關注度/熱度（誰在被交易），跟「法人 20d」欄位
    # 顯示的三大法人淨買賣金額是兩回事，不能拿法人金額當排序（法人淨額可能很小，但
    # 整體成交金額很大，那還是一支值得注意的熱門股）。
    sector_rank = {r.get("sector"): i for i, r in enumerate(rows_sorted)}

    def _top_stock_sort_key(r):
        sec_rank = sector_rank.get(r.get("sector"), len(sector_rank))
        try:
            trade_value = float(r.get("trade_value_20d_est_NTD_M"))
        except (TypeError, ValueError):
            trade_value = float("-inf")
        if trade_value != trade_value:  # NaN
            trade_value = float("-inf")
        return (sec_rank, -trade_value)

    top_stocks_sorted = sorted(top_stocks, key=_top_stock_sort_key)[:60]
    top_rows_html = "".join(top_stock_row(r) for r in top_stocks_sorted) \
        or '<tr><td colspan="11" class="empty">今日無個股資料</td></tr>'

    leader = rows_sorted[0] if rows_sorted else None
    laggard = rows_sorted[-1] if rows_sorted else None
    tldr_parts = []
    if leader:
        tldr_parts.append(f"領先板塊：{leader['sector']}（point {num(leader.get('point'),1)}）")
    if laggard and laggard is not leader:
        tldr_parts.append(f"落後板塊：{laggard['sector']}（point {num(laggard.get('point'),1)}）")
    tldr = " · ".join(tldr_parts) if tldr_parts else "資料不足"

    failed = scorecard.get("failed_tickers") or []
    budget = scorecard.get("request_budget_used")
    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>台股板塊研究日報 · {as_of}</title>
<style>{CSS}</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">TW</div>
    <div class="htitle">
      <span class="tag">PHASE 1 · BETA</span>
      <h1>台股板塊研究日報 · {as_of}</h1>
      <p>資料源：FinMind · 官方 industry_category 粗分類（無供應鏈次產業細分，Phase 2 補）·
         股票池 {len(rows) and sum(int(r.get("stock_count",0)) for r in rows)} 檔（市值前 100 大）</p>
    </div>
  </div>

  <div class="tldr"><b>TL;DR</b>　{escape(tldr)}</div>

  <div class="snap">
    <div class="snap-cell">
      <div class="l">{market_label}</div>
      <div class="v">{num(market.get("price"), 2)}</div>
      <div class="s">60d {num(market.get("vs_60d_pct"), 2, pct=True, sign=True)} · {market.get("trend_label","—")}</div>
    </div>
    <div class="snap-cell">
      <div class="l">股票池</div>
      <div class="v">{sum(int(r.get("stock_count",0)) for r in rows) if rows else "—"}</div>
      <div class="s">{len(rows)} 個 industry_category</div>
    </div>
    <div class="snap-cell">
      <div class="l">FinMind 額度用量</div>
      <div class="v">{budget if budget is not None else "—"}</div>
      <div class="s">/ 300 次/小時 · 失敗 {len(failed)} 檔</div>
    </div>
  </div>

  <div class="card">
    <div class="card-h">📊 板塊（TWSE/TPEx 官方分類）· 依 point 排序<span class="n">{len(rows)}</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector</th><th class="n">Point</th>
              <th class="n" title="今日 point - 過去 5 日 point 均值 · 首次執行前 5 天沒歷史資料會是 —">加速度</th>
              <th class="n" title="板塊內 4W 累報 > 0 的股票比例">寬度</th>
              <th class="n" title="板塊內所有個股三大法人 20 日淨買賣加總（依最新收盤價換算金額）">法人 20d 淨買（金額）</th>
              <th title="CPD = Z(法人金額) - Z(SectorPoint)，跨板塊橫斷面相對排名，非嚴謹統計顯著性。💰 Capital Leading = 資金先進、價格尚未反映（狩獵區）">CPD 象限</th></tr>
        </thead>
        <tbody>{sector_rows_html}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-h">🧭 資金-價格背離象限（CPD）<span class="n" title="CPD = Z(法人金額) - Z(SectorPoint)，跨今日全部板塊做橫斷面相對排名">跨板塊相對排名</span></div>
    <div class="card-b">
      <div class="cpdcols">{cpd_matrix_html(rows_sorted)}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-h">💥 暴漲候選池（全股票池）</div>
    <div class="card-b">
      <div class="expcols">{explosive_pool_html(all_rows)}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-h">🏆 各板塊 Top 3（板塊 → 20D 全部成交金額排序）<span class="n">{len(top_stocks_sorted)}</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Symbol / Name</th><th>Sector</th><th class="n">Point</th><th class="n">vp</th>
              <th class="n">4W</th><th class="n">26W</th><th>Alert</th>
              <th title="Dow Theory 頭頭低/底底高">Dow</th><th>量價象限</th><th>暴漲判定</th>
              <th class="n" title="三大法人 20 日淨買賣（依最新收盤價換算金額）">法人 20d</th></tr>
        </thead>
        <tbody>{top_rows_html}</tbody>
      </table>
    </div>
  </div>

  {inst_flow_leaderboard_html(all_rows)}

  <div class="foot">
    產生時間 {gen_ts} · Phase 1（Layer 0-3，官方粗分類）· Layer 1.5 供應鏈次產業 + S1-S5 感測器留 Phase 2 ·
    <a href="daily-latest.html">看美股板塊報表</a>
    <br><br>
    <span style="color:#94a3b8;">投資有風險 · 本報告為系統化訊號記錄 · 不構成投資建議</span>
  </div>

</div>
</body>
</html>'''

    os.makedirs(REPORTS_DIR, exist_ok=True)
    dated_path = os.path.join(REPORTS_DIR, f"daily-tw-{as_of}.html")
    latest_path = os.path.join(REPORTS_DIR, "daily-tw-latest.html")
    with open(dated_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)
    return dated_path, latest_path


def main():
    scorecard = load_json(SCORECARD)
    if not scorecard:
        sys.exit(f"❌ 沒 {SCORECARD} · 先跑 tw_sector_pipeline.py")
    stage2 = load_json(STAGE2) or {}
    dated, latest = render(scorecard, stage2)
    print(f"✅ 產生 {dated}")
    print(f"✅ 覆寫 {latest}")


if __name__ == "__main__":
    main()
