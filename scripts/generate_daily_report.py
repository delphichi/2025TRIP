#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_daily_report.py · 每日板塊研究報告產生器
======================================================
讀 scorecard_latest.json + latest.json + backtests_pattern.json · 產出 HTML 報告

輸出：
  sector-rotation/reports/daily-YYYY-MM-DD.html   當日快照
  sector-rotation/reports/daily-latest.html       最新版（覆寫）

用法：
  python scripts/generate_daily_report.py
"""
import os, sys, json, csv
from datetime import datetime, timezone
from html import escape

DATA_DIR = "data/sector_rotation"
REPORTS_DIR = "sector-rotation/reports"

SCORECARD = os.path.join(DATA_DIR, "scorecard_latest.json")
STAGE2    = os.path.join(DATA_DIR, "latest.json")
PATTERN   = os.path.join(DATA_DIR, "backtests_pattern.json")

QUADRANT_ORDER = ["leading", "weakening", "improving", "lagging"]
QUADRANT_META = {
    "leading":   ("🟢", "領先",  "資金持續流入、動能未退"),
    "weakening": ("🟠", "減弱",  "高位但動能見頂"),
    "improving": ("🔵", "改善",  "落後翻轉候選"),
    "lagging":   ("🔴", "落後",  "資金持續流出"),
}
HEALTH_ORDER = ["overheated", "sweet_spot", "early_reversal", "coiling", "cold", "neutral"]
HEALTH_META = {
    "overheated":     ("🔥", "過熱"),
    "sweet_spot":     ("✨", "甜蜜點"),
    "early_reversal": ("🌱", "反轉初期"),
    "coiling":        ("💤", "蓄勢"),
    "cold":           ("🧊", "冷凍"),
    "neutral":        ("➡️", "中性"),
}


def load_json(p):
    if not os.path.exists(p):
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_csv_verdicts(as_of):
    """
    讀 YYYYMMDD_all.csv · 抽 explosive_verdict != "" 的股票
    回傳 dict {verdict: [rows]} · 已排序 · verdict 為 🚀/🎯/🔥 三類
    """
    if not as_of:
        return {}
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        return {}
    buckets = {"🚀 暴漲中": [], "🎯 潛在暴漲": [], "🔥 追高風險": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                v = (r.get("explosive_verdict") or "").strip()
                if v in buckets:
                    buckets[v].append(r)
    except Exception:
        return {}
    # 排序：暴漲中 by point desc · 潛在 by point desc · 追高 by 26W desc
    def _f(x, k):
        try: return float(x.get(k) or 0)
        except: return 0
    buckets["🚀 暴漲中"].sort(key=lambda r: -_f(r, "point"))
    buckets["🎯 潛在暴漲"].sort(key=lambda r: -_f(r, "point"))
    buckets["🔥 追高風險"].sort(key=lambda r: -_f(r, "cum_ret_26w"))
    return buckets


def bucket_by(rows, key):
    out = {}
    for r in rows:
        v = r.get(key)
        if v is None: continue
        out.setdefault(v, []).append(r)
    return out


def strong_buy_stocks(stage2):
    """從 stage 2 composite tab 抽 strong_buy · 去 dedup by symbol"""
    if not stage2 or "top3" not in stage2:
        return []
    seen = {}
    for tab in ["composite", "4w", "13w", "26w", "cms_a"]:
        for r in stage2["top3"].get(tab, []):
            s = r.get("symbol")
            if s in seen: continue
            if (r.get("composite_rank_in_sector") == 1
                    and (r.get("vp_score_stock") or 0) >= 95
                    and r.get("stock_gap_alert") != "吃老本"):
                seen[s] = r
    # 排：sector 內 point 高的先
    return sorted(seen.values(), key=lambda x: -(x.get("point") or 0))


def explosive_stocks(stage2):
    """explosive rule · 從 all tabs 去 dedup"""
    if not stage2 or "top3" not in stage2:
        return []
    seen = {}
    for tab in ["composite", "4w", "13w", "26w", "cms_a"]:
        for r in stage2["top3"].get(tab, []):
            s = r.get("symbol")
            if s in seen: continue
            surp_sum = (r.get("surprise_l1") or 0) + (r.get("surprise_l2") or 0)
            if ((r.get("vp_score_stock") or 0) >= 95
                    and r.get("stock_gap_alert") == "剛爆發"
                    and surp_sum >= 30
                    and (r.get("composite_rank_in_sector") or 999) <= 10
                    and (r.get("cum_ret_26w") or 0) <= 50):
                r["_surp_sum"] = round(surp_sum, 1)
                seen[s] = r
    return sorted(seen.values(), key=lambda x: -x.get("_surp_sum", 0))


def make_tldr(scorecard, sb_stocks, exp_stocks, biggest):
    """自動產生一句話 TL;DR"""
    leading = [r for r in scorecard["rows"] if r.get("quadrant") == "leading"]
    lagging = [r for r in scorecard["rows"] if r.get("quadrant") == "lagging"]
    sweet = [r for r in scorecard["rows"] if r.get("health_key") == "sweet_spot"]
    cold  = [r for r in scorecard["rows"] if r.get("health_key") == "cold"]

    parts = []
    if leading:
        top_names = "、".join([r["sector_name"] for r in leading[:3]])
        parts.append(f"領先：{top_names}")
    if lagging:
        bot_names = "、".join([r["sector_name"] for r in lagging[:3]])
        parts.append(f"落後：{bot_names}")
    if biggest:
        sign = "+" if biggest["acceleration"] > 0 else ""
        parts.append(f"最大位移 {biggest['sector_name']} ({sign}{biggest['acceleration']:.1f})")

    signal_line = ""
    if sb_stocks or exp_stocks:
        n = len(sb_stocks) + len(exp_stocks)
        signal_line = f"訊號共 {n} 支（💎 strong_buy {len(sb_stocks)} + 🚀 explosive {len(exp_stocks)}）"
    return "· ".join(parts) + (" · " + signal_line if signal_line else "")


def render(scorecard, stage2, pattern):
    as_of = scorecard["as_of_date"]
    # 【v6】讀 all.csv 拿全 universe explosive_verdict
    exp_buckets = load_all_csv_verdicts(as_of)
    market_ctx = scorecard.get("market_context") or {}
    biggest = scorecard.get("quadrant_biggest_mover")
    rows = scorecard["rows"]

    # 分四象限
    quad_buckets = bucket_by(rows, "quadrant")
    for k in quad_buckets:
        quad_buckets[k].sort(key=lambda r: -abs(r.get("acceleration") or 0))
    # 健康度分佈
    health_buckets = bucket_by(rows, "health_key")

    # 排序 rows by pct_90d desc
    rows_by_pct = sorted(rows, key=lambda r: -(r.get("pct_90d") or -1))

    sb_stocks = strong_buy_stocks(stage2)
    exp_stocks = explosive_stocks(stage2)
    tldr = make_tldr(scorecard, sb_stocks, exp_stocks, biggest)

    # 11-sample 統計（backtests_pattern）
    p1y = (pattern or {}).get("1y") or {}
    sb_stats = p1y.get("strong_buy") or {}
    exp_stats = p1y.get("strong_buy_explosive") or {}

    # ---------- helpers for HTML ----------
    def num(v, d=2, pct=False, sign=False):
        if v is None: return "—"
        try:
            v = float(v)
        except Exception:
            return str(v)
        s = f"{v:+.{d}f}" if sign else f"{v:.{d}f}"
        return s + ("%" if pct else "")

    def sector_chip(r, big_sector=None):
        name = escape(r.get("sector_name", ""))
        acc = r.get("acceleration") or 0
        sign = "+" if acc > 0 else ""
        emoji = r.get("health_emoji") or ""
        is_big = r.get("sector") == big_sector
        cls = "chip big" if is_big else "chip"
        return f'<span class="{cls}">{emoji} {name}<span class="chip-acc">{sign}{acc:.1f}</span></span>'

    def quad_block(key):
        emoji, zh, desc = QUADRANT_META[key]
        items = quad_buckets.get(key, [])
        big_sec = biggest["sector"] if biggest else None
        chips = "".join(sector_chip(r, big_sec) for r in items) if items else '<span class="dim">—</span>'
        return f'''
        <div class="quad quad-{key}">
          <div class="q-head"><span class="q-emoji">{emoji}</span><b>{zh}</b><span class="q-tag">{escape(desc)}</span></div>
          <div class="q-body">{chips}</div>
        </div>'''

    def health_line():
        # 計 count per tag
        counts = {k: len(health_buckets.get(k, [])) for k in HEALTH_ORDER}
        chips = []
        for k in HEALTH_ORDER:
            emoji, zh = HEALTH_META[k]
            c = counts.get(k, 0)
            if c == 0: continue
            names = "、".join(r["sector_name"] for r in health_buckets[k])
            chips.append(f'<span class="hchip hchip-{k}" title="{escape(names)}">{emoji} {zh} · <b>{c}</b></span>')
        return " ".join(chips)

    # Dow Theory 呈現 · 4 個狀態 + 訊號 + 訊號衝突警示
    DOW_META = {
        "多頭": ("📈", "dow-long"),
        "空頭": ("📉", "dow-short"),
        "收斂": ("🔺", "dow-squeeze"),
        "擴散": ("🔻", "dow-broaden"),
    }
    def dow_cell(r, tag):
        st = r.get("trend_state") or ""
        pat = r.get("trend_pattern") or ""
        sig = r.get("trend_signal") or ""
        if not st or st == "資料不足":
            return '<td><span class="dow-none">—</span></td>'
        emo, cls = DOW_META.get(st, ("", "dow-none"))
        title = pat + (" · " + sig if sig else "")
        # 訊號衝突警示：
        #   💎/🚀 但 Dow 說 🔻 擴散喇叭（頂區徵兆）→ ⚠ 頂區
        #   💎/🚀 但 Dow 說 📉 空頭 → ⚠ 訊號衝突
        conflict = ""
        if tag in ("💎", "🚀"):
            if st == "擴散":
                conflict = '<span class="dow-conflict" title="動能訊號 + Dow 擴散喇叭 = 頂區警訊">⚠ 頂區</span>'
            elif st == "空頭":
                conflict = '<span class="dow-conflict" title="動能訊號 + Dow 空頭 = 訊號衝突">⚠ 衝突</span>'
        sig_html = f'<span class="dow-sig">{escape(sig)}</span>' if sig else ""
        return f'<td><span class="dow {cls}" title="{escape(title)}">{emo} {escape(st)}</span>{sig_html}{conflict}</td>'

    # 暴漲判定 cell（顯 emoji badge）
    def exp_cell(r):
        v = (r.get("explosive_verdict") or "").strip()
        if not v:
            return '<td><span style="color:var(--text-dim)">—</span></td>'
        cls = "exp-none"
        if "暴漲中" in v: cls = "exp-boom"
        elif "潛在暴漲" in v: cls = "exp-cand"
        elif "追高" in v: cls = "exp-risk"
        return f'<td><span class="exp {cls}">{escape(v)}</span></td>'

    # 量價象限 verdict cell
    def pv_cell(r):
        v = r.get("pv_verdict") or ""
        if not v or v == "資料不足":
            return '<td><span style="color:var(--text-dim)">—</span></td>'
        cls = "pv-neutral"
        if "完美多頭" in v or "健康多頭" in v or "底部" in v: cls = "pv-strong"
        elif "頂部背離" in v or "中期出貨" in v or "量能背離" in v: cls = "pv-warn"
        elif "量能衰竭" in v or "主升段結束" in v or "主力出貨" in v or "熊市" in v or "弱勢" in v: cls = "pv-weak"
        elif "反彈初期" in v: cls = "pv-early"
        s4 = r.get("pv_state_4w") or "—"
        s13 = r.get("pv_state_13w") or "—"
        s26 = r.get("pv_state_26w") or "—"
        title = f"4W:{s4} · 13W:{s13} · 26W:{s26}"
        return f'<td><span class="pv {cls}" title="{escape(title)}">{escape(v)}</span></td>'

    def sb_row(r, tag="💎"):
        sector = escape(r.get("sector", ""))
        symbol = escape(r.get("symbol", ""))
        name = escape((r.get("name") or "")[:30])
        pt = num(r.get("point"), 1)
        vp = num(r.get("vp_score_stock"), 0)
        c4 = num(r.get("cum_ret_4w"), 1, pct=True, sign=True)
        c26 = num(r.get("cum_ret_26w"), 1, pct=True, sign=True)
        surp = f"L1+L2 {r.get('_surp_sum', 0):.0f}%" if "_surp_sum" in r else ""
        alert = r.get("stock_gap_alert") or ""
        alert_html = f'<span class="alert">{escape(alert)}</span>' if alert else ""
        extra = f'<span class="dim">{surp}</span>' if surp else ""
        return f'''
        <tr>
          <td class="tag">{tag}</td>
          <td><b>{symbol}</b> <span class="dim">{name}</span></td>
          <td>{sector}</td>
          <td class="n">{pt}</td>
          <td class="n">{vp}</td>
          <td class="n">{c4}</td>
          <td class="n">{c26}</td>
          <td>{alert_html} {extra}</td>
          {dow_cell(r, tag)}
          {pv_cell(r)}
          {exp_cell(r)}
        </tr>'''

    sb_rows_html = "".join(sb_row(r, "💎") for r in sb_stocks) \
        or '<tr><td colspan="11" class="empty">今日無 strong_buy 訊號 · 資料日期可能較舊或無合格個股</td></tr>'
    exp_rows_html = "".join(sb_row(r, "🚀") for r in exp_stocks) \
        or '<tr><td colspan="11" class="empty">今日無 explosive 訊號</td></tr>'

    # 板塊詳細表
    def sec_row(r):
        emoji = r.get("health_emoji") or ""
        zh = r.get("health_zh") or "—"
        acc = r.get("acceleration")
        acc_cls = "up" if (acc or 0) > 0 else ("down" if (acc or 0) < 0 else "flat")
        # 連續正天數 · 灰底 · > 10 天加 🔥
        cons_days = r.get("consecutive_pos_days")
        if cons_days is None:
            cons_str = "—"
        elif cons_days == 0:
            cons_str = '<span class="dim">0</span>'
        elif cons_days >= 10:
            cons_str = f'<span style="color:var(--green);font-weight:700;">🔥 {cons_days}</span>'
        elif cons_days >= 5:
            cons_str = f'<span style="color:var(--green);font-weight:600;">{cons_days}</span>'
        else:
            cons_str = f'<span>{cons_days}</span>'
        # 【新】30 日資金流向 · flow_ratio (-1~+1) + net $M
        flow_ratio = r.get("flow_ratio")
        flow_net = r.get("flow_30d_net_M")
        if flow_ratio is None or flow_net is None:
            flow_str = "—"
        else:
            fcls = "up" if flow_ratio > 0.05 else ("down" if flow_ratio < -0.05 else "flat")
            arrow = "▲" if flow_ratio > 0 else ("▼" if flow_ratio < 0 else "▪")
            flow_str = f'<span class="{fcls}" title="30d net {flow_net:+.0f}M · gross {r.get("flow_30d_gross_M",0):.0f}M">{arrow} {flow_ratio*100:+.1f}%</span>'
        return f'''
        <tr>
          <td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>
          <td class="n">{num(r.get("point"), 2)}</td>
          <td class="n {acc_cls}">{num(acc, 2, sign=True)}</td>
          <td class="n">{cons_str}</td>
          <td class="n">{flow_str}</td>
          <td class="n">{r.get("pct_30d") if r.get("pct_30d") is not None else "—"}</td>
          <td class="n">{r.get("pct_90d") if r.get("pct_90d") is not None else "—"}</td>
          <td class="n">{r.get("pct_365d") if r.get("pct_365d") is not None else "—"}</td>
          <td class="n">{num(r.get("breadth_pct"), 1, pct=True)}</td>
          <td><span class="badge b-{r.get("health_key","neutral")}">{emoji} {zh}</span></td>
        </tr>'''
    sec_rows_html = "".join(sec_row(r) for r in rows_by_pct)

    # 【v6】暴漲候選池 3 column · 讀 all.csv
    def _exp_list_html(rows, cls, title, limit=15):
        cnt = len(rows) if rows else 0
        if not rows:
            body = '<p class="empty">無</p>'
        else:
            lis = []
            for r in rows[:limit]:
                sym = escape(r.get("symbol") or "")
                sec = escape((r.get("sector") or "")[:6])
                pt = r.get("point") or ""
                try: pt_s = f"{float(pt):+.1f}" if pt != "" else ""
                except: pt_s = ""
                c26 = r.get("cum_ret_26w") or ""
                try: c26_s = f"{float(c26):+.0f}%" if c26 != "" else ""
                except: c26_s = ""
                # 3 日內新訊號 🆕
                is_new = str(r.get("is_new_signal_3d") or "").lower() in ("true", "1")
                new_badge = ' <span style="background:#dcfce7;color:#166534;padding:0 4px;border-radius:6px;font-size:9px;font-weight:700;" title="3 日內新訊號">🆕</span>' if is_new else ''
                lis.append(f'<li><span><b>{sym}</b>{new_badge} <span class="sec">{sec}</span></span><span class="dim">{pt_s} · 26W {c26_s}</span></li>')
            body = '<ul>' + ''.join(lis) + '</ul>'
            if cnt > limit:
                body += f'<div class="dim" style="font-size:10.5px;margin-top:4px;">... 另 {cnt - limit} 支</div>'
        return f'<div class="expcol {cls}"><h4>{title}<span class="cnt">({cnt})</span></h4>{body}</div>'

    exp_boom = exp_buckets.get("🚀 暴漲中", [])
    exp_cand = exp_buckets.get("🎯 潛在暴漲", [])
    exp_risk = exp_buckets.get("🔥 追高風險", [])
    explosive_card_html = f'''
    <div class="expcols">
      {_exp_list_html(exp_boom, "boom", "🚀 暴漲中")}
      {_exp_list_html(exp_cand, "cand", "🎯 潛在暴漲")}
      {_exp_list_html(exp_risk, "risk", "🔥 追高風險")}
    </div>
    '''

    # 【新 v2】Layer 2.1 · 加速度歷史百分位（30d / 90d / 365d）
    # 對照 Trend Core Layer 2.1「板塊排名 + 加速度百分位」
    def _pct_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        if vf >= 80: cls, tag = "up", "🔥"
        elif vf >= 60: cls, tag = "up", "▲"
        elif vf <= 20: cls, tag = "down", "❄"
        elif vf <= 40: cls, tag = "down", "▼"
        else: cls, tag = "flat", ""
        return f'<td class="n {cls}">{tag} {vf:.0f}</td>'

    l21_rows = []
    # 排序：以 acc_pct_90d desc，缺值放後面
    l21_sorted = sorted(rows, key=lambda r: -(r.get("acc_pct_90d") or -1))
    for r in l21_sorted:
        emoji = r.get("health_emoji") or ""
        acc = r.get("acceleration")
        acc_cls = "up" if (acc or 0) > 0 else ("down" if (acc or 0) < 0 else "flat")
        l21_rows.append(
            f'<tr>'
            f'<td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>'
            f'<td class="n">{num(r.get("point"), 2)}</td>'
            f'<td class="n {acc_cls}">{num(acc, 2, sign=True)}</td>'
            + _pct_cell(r.get("acc_pct_30d"))
            + _pct_cell(r.get("acc_pct_90d"))
            + _pct_cell(r.get("acc_pct_365d"))
            + f'<td>{emoji}</td>'
            + '</tr>'
        )
    l21_html = f'''
  <div class="card">
    <div class="card-h">📊 Layer 2.1 · 加速度歷史百分位 <span class="n">30d / 90d / 365d · 依 90d 排序</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector</th><th class="n">Point</th><th class="n">加速度</th>
              <th class="n" title="當前加速度在過去 30 日中的相對位置">30d 百分位</th>
              <th class="n" title="90 日百分位">90d 百分位</th>
              <th class="n" title="365 日百分位">365d 百分位</th>
              <th title="健康度標籤">健</th></tr>
        </thead>
        <tbody>{"".join(l21_rows)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;">🔥 ≥80 過熱 · ▲ ≥60 偏強 · ▼ ≤40 偏弱 · ❄ ≤20 過冷</div>
    </div>
  </div>'''

    # 【新 v2】ETF 位階地圖（Trend Core Layer 2.2 靈感）
    # 顯示：dist_20ma / dist_50ma / RSI14 / 20d position / 20d 壓力支撐
    def _rsi_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        if vf >= 70: return f'<td class="n up">🔥 {vf:.0f}</td>'
        if vf <= 30: return f'<td class="n down">❄ {vf:.0f}</td>'
        return f'<td class="n">{vf:.0f}</td>'

    def _pos20_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        # bar 視覺化
        pct = max(0, min(100, vf))
        color = "#1e8449" if pct >= 60 else ("#c0392b" if pct <= 40 else "#6b7280")
        bar = (
            f'<div style="display:inline-block;width:60px;height:8px;background:#e2e5ea;'
            f'border-radius:4px;overflow:hidden;vertical-align:middle;position:relative;">'
            f'<div style="width:{pct:.0f}%;height:100%;background:{color};"></div>'
            f'</div>'
        )
        return f'<td class="n">{bar} <span class="dim" style="font-size:11px;">{pct:.0f}</span></td>'

    def _dist_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        cls = "up" if vf > 0 else ("down" if vf < 0 else "flat")
        arrow = "▲" if vf > 0 else ("▼" if vf < 0 else "▪")
        return f'<td class="n {cls}">{arrow} {vf:+.1f}%</td>'

    map_rows = []
    # 排序：以 rsi14 desc（強弱）
    map_sorted = sorted(rows, key=lambda r: -(r.get("rsi14_sector") or -1))
    for r in map_sorted:
        map_rows.append(
            f'<tr>'
            f'<td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>'
            + _dist_cell(r.get("dist_20ma_pct"))
            + _dist_cell(r.get("dist_50ma_pct"))
            + _rsi_cell(r.get("rsi14_sector"))
            + _pos20_cell(r.get("position_20d"))
            + f'<td class="n dim">{num(r.get("resistance_20d"), 2)}</td>'
            + f'<td class="n dim">{num(r.get("support_20d"), 2)}</td>'
            + '</tr>'
        )
    etf_map_html = f'''
  <div class="card">
    <div class="card-h">🗺️ ETF 位階地圖 <span class="n">距 MA · RSI14 · 20 日區間位置</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector ETF</th>
              <th class="n" title="收盤距 20MA %">距 20MA</th>
              <th class="n" title="收盤距 50MA %">距 50MA</th>
              <th class="n" title="Wilder RSI(14)">RSI14</th>
              <th class="n" title="收盤在近 20 日 low ~ high 的位置">20d 位階</th>
              <th class="n" title="近 20 日最高">壓力</th>
              <th class="n" title="近 20 日最低">支撐</th></tr>
        </thead>
        <tbody>{"".join(map_rows)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;">🔥 RSI≥70 過買 · ❄ RSI≤30 過賣 · 20d 位階 &gt;60 靠近壓力 · &lt;40 靠近支撐</div>
    </div>
  </div>'''

    # 【新 v2】30 日訊號比（Trend Core 板塊市場寬度 靈感）
    def _ratio_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        if vf >= 70: cls, tag = "up", "🟢"
        elif vf >= 55: cls, tag = "up", "🔵"
        elif vf >= 45: cls, tag = "flat", "⚪"
        else: cls, tag = "down", "🔴"
        return f'<td class="n {cls}">{tag} {vf:.1f}%</td>'

    breadth30_rows = []
    br_sorted = sorted(rows, key=lambda r: -(r.get("breadth_30d_ratio") or -1))
    for r in br_sorted:
        u = r.get("breadth_30d_up")
        d = r.get("breadth_30d_down")
        tot = (u or 0) + (d or 0)
        breadth30_rows.append(
            f'<tr>'
            f'<td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>'
            f'<td class="n up">{u if u is not None else "—"}</td>'
            f'<td class="n down">{d if d is not None else "—"}</td>'
            f'<td class="n dim">{tot}</td>'
            + _ratio_cell(r.get("breadth_30d_ratio"))
            + '</tr>'
        )
    breadth30_html = f'''
  <div class="card">
    <div class="card-h">📶 板塊 30 日訊號比 <span class="n">stage 2 個股 · 多頭 vs 空頭</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector</th>
              <th class="n" title="過去 30 日 stage 2 個股 trend_state=多頭 累計次數">多頭訊號</th>
              <th class="n" title="過去 30 日 trend_state=空頭 累計">空頭訊號</th>
              <th class="n">總計</th>
              <th class="n" title="up / (up+down) · 板塊過去 30 日訊號寬度">多頭比</th></tr>
        </thead>
        <tbody>{"".join(breadth30_rows)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;">🟢 ≥70% 強勢上升 · 🔵 ≥55% 上升主導 · ⚪ 中性 · 🔴 &lt;45% 空頭主導</div>
    </div>
  </div>'''

    # 【新增】歷史 regime 統計卡片（Trend Core 靈感）
    regime_stats = market_ctx.get("regime_stats") or {}
    current_regime = regime_stats.get("current_regime") or "—"
    cur_stats = regime_stats.get("current") or {}
    cur_conds = regime_stats.get("current_conditions") or {}
    hist_all = regime_stats.get("historical") or {}
    if cur_stats:
        # 4 regime 對照小表
        rows_r = []
        for regime_name in ["🟢 多頭", "🟡 中性", "🟠 警戒", "🔴 空頭"]:
            s = hist_all.get(regime_name)
            if not s: continue
            is_cur = "background:#fef3c7;font-weight:700;" if regime_name == current_regime else ""
            rows_r.append(
                f'<tr style="{is_cur}"><td>{regime_name}</td>'
                f'<td class="n">{s["n"]}</td>'
                f'<td class="n {"up" if s["mean"]>0 else "down"}">{s["mean"]:+.2f}%</td>'
                f'<td class="n">{s["win_rate"]:.1f}%</td>'
                f'<td class="n dim">{s["p25"]:+.1f} / {s["p50"]:+.1f} / {s["p75"]:+.1f}</td>'
                f'<td class="n dim">{s["worst"]:+.1f} ~ {s["best"]:+.1f}</td>'
                f'</tr>'
            )
        conds_str = (
            f'SPY {cur_conds.get("spy_price","?")} vs 60d 前 {cur_conds.get("spy_60d_ago","?")} '
            f'({"↑" if cur_conds.get("price_up_60d") else "↓"}) · '
            f'50MA {cur_conds.get("ma50","?")} ({"↑" if cur_conds.get("ma50_up") else "↓"}) · '
            f'200MA {cur_conds.get("ma200","?")} ({"↑" if cur_conds.get("ma200_up") else "↓"})'
        )
        regime_stats_html = f'''
  <div class="card">
    <div class="card-h">📈 歷史相同市況統計 <span class="n">SPY 10y · 4 級 regime</span></div>
    <div class="card-b">
      <div style="background:#fef3c7;padding:10px 14px;border-radius:8px;margin-bottom:10px;border-left:4px solid var(--gold);">
        <div style="font-size:13px;"><b>今日：{current_regime}</b> · 歷史出現 <b>{cur_stats["n"]}</b> 次</div>
        <div style="font-size:14px;margin-top:6px;">
          SPY 20 日後 · 平均 <span class="{"up" if cur_stats["mean"]>0 else "down"}"><b>{cur_stats["mean"]:+.2f}%</b></span>
          · 勝率 <b>{cur_stats["win_rate"]:.1f}%</b>
        </div>
        <div class="dim" style="margin-top:4px;font-size:11px;">{conds_str}</div>
      </div>
      <table>
        <thead>
          <tr><th>Regime</th><th class="n">n</th><th class="n">平均 20d</th><th class="n">勝率</th><th class="n">P25/P50/P75</th><th class="n">最差~最好</th></tr>
        </thead>
        <tbody>{"".join(rows_r)}</tbody>
      </table>
    </div>
  </div>'''
    else:
        regime_stats_html = ""

    # market snapshot
    voo = market_ctx.get("voo") or {}
    vix = market_ctx.get("vix") or {}
    tnx = market_ctx.get("tnx") or {}
    quadrant_key = market_ctx.get("quadrant_key") or "—"

    # generated timestamp
    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    stage2_asof = (stage2 or {}).get("as_of_date") or "n/a"

    # ---------- HTML ----------
    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>板塊研究日報 · {as_of}</title>
<style>
  :root {{
    --navy:#1b2a4a; --navy-d:#0f1930; --gold:#c9a24b; --gold-l:#e8d9ae;
    --bg:#f4f5f7; --card:#ffffff; --line:#e2e5ea;
    --text:#2a2f3a; --muted:#6b7280;
    --green:#1e8449; --red:#c0392b; --amber:#d97706; --blue:#2563eb;
  }}
  * {{ box-sizing:border-box; }}
  body {{
    margin:0; padding:24px; background:var(--bg);
    font-family:"PingFang TC","Microsoft JhengHei","Noto Sans TC",-apple-system,sans-serif;
    color:var(--text); line-height:1.55;
  }}
  .sheet {{ max-width:1180px; margin:0 auto; }}
  .up {{ color:var(--green); font-weight:700; }}
  .down {{ color:var(--red); font-weight:700; }}
  .flat {{ color:var(--muted); font-weight:600; }}
  .dim {{ color:var(--muted); font-size:12px; }}

  .header {{
    background:var(--card); border-radius:10px; padding:22px 26px;
    box-shadow:0 1px 3px rgba(0,0,0,.06); margin-bottom:14px;
    display:flex; align-items:center; gap:20px; flex-wrap:wrap;
  }}
  .logo {{
    width:56px; height:56px; border-radius:50%;
    background:linear-gradient(135deg,var(--navy),var(--navy-d));
    display:flex; align-items:center; justify-content:center;
    color:var(--gold-l); font-weight:800; font-size:22px; border:2px solid var(--gold);
  }}
  .htitle {{ flex:1; min-width:280px; }}
  .htitle .tag {{
    display:inline-block; background:var(--navy); color:var(--gold-l);
    font-size:11px; padding:2px 10px; border-radius:12px; margin-bottom:6px; letter-spacing:1px;
  }}
  .htitle h1 {{ margin:0 0 6px 0; font-size:22px; color:var(--navy); }}
  .htitle p {{ margin:0; font-size:13px; color:var(--muted); }}

  .tldr {{
    background:linear-gradient(90deg,#0f1930,#1b2a4a); color:#fef3c7;
    padding:16px 22px; border-radius:10px; margin-bottom:14px;
    font-size:14px; line-height:1.7; border-left:4px solid var(--gold);
  }}
  .tldr b {{ color:#fff; }}

  .snap {{
    display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
    gap:10px; margin-bottom:14px;
  }}
  .snap-cell {{
    background:var(--card); padding:12px 14px; border-radius:8px;
    box-shadow:0 1px 3px rgba(0,0,0,.05);
  }}
  .snap-cell .l {{ font-size:10.5px; color:var(--muted); letter-spacing:.5px; text-transform:uppercase; }}
  .snap-cell .v {{ font-size:20px; font-weight:800; color:var(--navy); margin-top:2px; }}
  .snap-cell .s {{ font-size:11px; color:var(--muted); margin-top:2px; }}

  .card {{
    background:var(--card); border-radius:10px; overflow:hidden; margin-bottom:14px;
    box-shadow:0 1px 3px rgba(0,0,0,.06);
  }}
  .card-h {{
    background:var(--navy); color:#fff; padding:10px 18px; font-size:13.5px; font-weight:700;
    letter-spacing:.5px; display:flex; justify-content:space-between; align-items:center;
  }}
  .card-h .n {{ background:var(--gold); color:var(--navy-d); font-size:11px; padding:2px 8px; border-radius:10px; }}
  .card-b {{ padding:14px 18px; }}

  .quads {{
    display:grid; grid-template-columns:1fr 1fr; gap:12px;
  }}
  @media(max-width:700px) {{ .quads {{ grid-template-columns:1fr; }} }}
  .quad {{ padding:14px; border-radius:8px; min-height:110px; }}
  .quad-leading   {{ background:#dcfce7; border-left:4px solid var(--green); }}
  .quad-weakening {{ background:#fef3c7; border-left:4px solid var(--amber); }}
  .quad-improving {{ background:#dbeafe; border-left:4px solid var(--blue); }}
  .quad-lagging   {{ background:#fee2e2; border-left:4px solid var(--red); }}
  .q-head {{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }}
  .q-emoji {{ font-size:18px; }}
  .q-head b {{ font-size:14px; }}
  .q-tag {{ font-size:11px; color:var(--muted); margin-left:auto; }}
  .q-body {{ display:flex; flex-wrap:wrap; gap:6px; }}
  .chip {{
    display:inline-flex; align-items:center; gap:4px;
    padding:4px 10px; border-radius:14px; font-size:12px;
    background:rgba(255,255,255,.7); color:var(--text);
  }}
  .chip.big {{ background:#fef3c7; border:1px solid var(--gold); font-weight:700; }}
  .chip-acc {{ font-size:10.5px; color:var(--muted); margin-left:4px; font-variant-numeric:tabular-nums; }}

  .health-line {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }}
  .hchip {{ padding:5px 12px; border-radius:14px; font-size:12.5px; }}
  .hchip b {{ font-size:14px; }}
  .hchip-overheated     {{ background:#fee2e2; color:#991b1b; }}
  .hchip-sweet_spot     {{ background:#dcfce7; color:#166534; font-weight:600; }}
  .hchip-early_reversal {{ background:#dbeafe; color:#1e40af; }}
  .hchip-coiling        {{ background:#fef3c7; color:#92400e; }}
  .hchip-cold           {{ background:#e2e8f0; color:#475569; }}
  .hchip-neutral        {{ background:#f3f4f6; color:#6b7280; }}

  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th {{
    text-align:left; padding:8px 10px; background:#f9fafb; color:var(--muted);
    font-size:10.5px; text-transform:uppercase; letter-spacing:.5px;
    border-bottom:2px solid var(--line); font-weight:600;
  }}
  td {{ padding:7px 10px; border-bottom:1px solid var(--line); }}
  td.n {{ text-align:right; font-variant-numeric:tabular-nums; }}
  tr:last-child td {{ border-bottom:none; }}
  td.tag {{ text-align:center; font-size:15px; }}
  .empty {{ text-align:center; padding:16px; color:var(--muted); font-style:italic; }}
  .alert {{ background:#fef3c7; color:#92400e; padding:1px 8px; border-radius:10px; font-size:11px; }}
  .badge {{
    display:inline-block; padding:2px 10px; border-radius:12px; font-size:11.5px; font-weight:600;
  }}
  .b-sweet_spot     {{ background:#dcfce7; color:#166534; }}
  .b-coiling        {{ background:#fef3c7; color:#92400e; }}
  .b-cold           {{ background:#e2e8f0; color:#475569; }}
  .b-overheated     {{ background:#fee2e2; color:#991b1b; }}
  .b-early_reversal {{ background:#dbeafe; color:#1e40af; }}
  .b-neutral        {{ background:#f3f4f6; color:#6b7280; }}

  /* Dow Theory 頭頭低/底底高 · 4 個狀態顏色 + 訊號衝突警示 */
  .dow {{
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
    white-space:nowrap;
  }}
  .dow-long    {{ background:#dcfce7; color:#166534; }}
  .dow-short   {{ background:#fee2e2; color:#991b1b; }}
  .dow-squeeze {{ background:#fef3c7; color:#92400e; }}
  .dow-broaden {{ background:#ede9fe; color:#6d28d9; }}
  .dow-none    {{ color:#94a3b8; font-size:10px; }}
  .dow-sig    {{ font-size:10px; color:var(--muted); margin-left:4px; }}
  .dow-conflict {{
    display:inline-block; margin-left:4px; padding:1px 6px; border-radius:8px;
    background:#fee2e2; color:#991b1b; font-size:10px; font-weight:700;
    animation:pulse 1.5s infinite;
  }}
  @keyframes pulse {{ 0%,100%{{opacity:1}} 50%{{opacity:0.6}} }}

  /* 量價象限判定 · 4W/13W/26W 三期價量狀態綜合 */
  .pv {{
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;
    white-space:nowrap;
  }}
  .pv-strong  {{ background:#dcfce7; color:#166534; border:1px solid #86efac; }}
  .pv-warn    {{ background:#fef3c7; color:#92400e; border:1px solid #fde68a; }}
  .pv-weak    {{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }}
  .pv-early   {{ background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; }}
  .pv-neutral {{ background:#f3f4f6; color:#6b7280; }}

  /* 暴漲判定 · 4 分類 */
  .exp {{
    display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;
    white-space:nowrap;
  }}
  .exp-boom {{ background:#fef3c7; color:#92400e; border:1px solid #fbbf24; }}
  .exp-cand {{ background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; }}
  .exp-risk {{ background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }}
  .exp-none {{ color:#94a3b8; }}

  /* 暴漲候選池 · 3 個 column */
  .expcols {{
    display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;
  }}
  @media(max-width:800px) {{ .expcols {{ grid-template-columns:1fr; }} }}
  .expcol {{
    background:#f9fafb; border-radius:8px; padding:10px 12px;
    border-left:3px solid var(--muted);
  }}
  .expcol.boom {{ border-left-color:#f59e0b; background:#fffbeb; }}
  .expcol.cand {{ border-left-color:#3b82f6; background:#eff6ff; }}
  .expcol.risk {{ border-left-color:#ef4444; background:#fef2f2; }}
  .expcol h4 {{ margin:0 0 6px 0; font-size:13px; color:var(--navy); }}
  .expcol .cnt {{ font-size:11px; color:var(--muted); margin-left:6px; }}
  .expcol ul {{ margin:0; padding-left:0; list-style:none; font-size:12px; }}
  .expcol li {{ padding:2px 0; display:flex; justify-content:space-between; }}
  .expcol li b {{ font-weight:600; }}
  .expcol .sec {{ color:var(--muted); font-size:10.5px; }}
  .expcol .empty {{ color:var(--muted); font-style:italic; font-size:11px; }}

  .mover {{
    background:linear-gradient(90deg,#fef3c7,#fde68a); padding:12px 18px; border-radius:8px;
    border-left:4px solid var(--gold); margin-top:12px; font-size:13.5px;
  }}
  .mover b {{ color:#92400e; }}

  .foot {{
    background:var(--card); border-radius:10px; padding:16px 20px;
    margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    text-align:center; font-size:12px; color:var(--muted);
  }}
  .foot a {{ color:var(--navy); text-decoration:none; border-bottom:1px dotted var(--navy); }}
  .conf {{
    display:flex; justify-content:center; gap:18px; flex-wrap:wrap;
    margin:8px 0 10px; font-size:12.5px;
  }}
  .conf b {{ color:var(--navy); }}
</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">📈</div>
    <div class="htitle">
      <span class="tag">DAILY SECTOR RESEARCH</span>
      <h1>板塊研究日報 · {as_of}</h1>
      <p>Layer 1.5 象限 + strong_buy + explosive · 11 樣本回測支持</p>
    </div>
  </div>

  <div class="tldr">
    <b>TL;DR：</b>{escape(tldr)}
  </div>

  <div class="snap">
    <div class="snap-cell"><div class="l">SPY / VOO</div><div class="v">${num(voo.get("price"), 2)}</div><div class="s">vs 60d: {num(voo.get("vs_60d_pct"), 2, pct=True, sign=True)}</div></div>
    <div class="snap-cell"><div class="l">VIX</div><div class="v">{num(vix.get("value"), 1)}</div><div class="s">{'✅ 正常' if (vix.get("value") or 0) < 20 else '⚠ 警戒'}</div></div>
    <div class="snap-cell"><div class="l">10Y TNX</div><div class="v">{num(tnx.get("value"), 2, pct=True)}</div><div class="s">{escape(quadrant_key)}</div></div>
    <div class="snap-cell"><div class="l">💎 strong_buy</div><div class="v" style="color:var(--gold);">{len(sb_stocks)}</div><div class="s">歷史 1y avg {num(sb_stats.get("avg"), 1, pct=True, sign=True)}</div></div>
    <div class="snap-cell"><div class="l">🚀 explosive</div><div class="v" style="color:#7c3aed;">{len(exp_stocks)}</div><div class="s">歷史 1y avg {num(exp_stats.get("avg"), 1, pct=True, sign=True)}</div></div>
  </div>

  <div class="card">
    <div class="card-h">🧭 Layer 1.5 · 板塊輪動四象限</div>
    <div class="card-b">
      <div class="quads">
        {quad_block("leading")}
        {quad_block("weakening")}
        {quad_block("improving")}
        {quad_block("lagging")}
      </div>
      {f'<div class="mover">📍 <b>最大位移</b>：{escape(biggest["sector_name"])} {biggest["sector"]} · point {biggest["point"]:.1f} vs 5 日均 {biggest["point_5d_avg"]:.1f} · 加速度 <b>{("+" if biggest["acceleration"]>0 else "")}{biggest["acceleration"]:.1f}</b> · 進入「{biggest["quadrant_zh"]}」象限</div>' if biggest else ""}
    </div>
  </div>

  <div class="card">
    <div class="card-h">🩺 板塊健康度分佈 <span class="n">6 級標籤</span></div>
    <div class="card-b">
      <div class="health-line">{health_line()}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-h">💥 暴漲候選池 <span class="n">from all.csv · S&P 500 全掃</span></div>
    <div class="card-b">
      {explosive_card_html}
    </div>
  </div>

  <div class="card">
    <div class="card-h">💎 strong_buy 訊號 <span class="n">{len(sb_stocks)} · stage 2 as of {escape(stage2_asof)}</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th></th><th>Symbol / Name</th><th>Sector</th><th class="n">Point</th><th class="n">vp</th><th class="n">4W</th><th class="n">26W</th><th>Alert</th><th title="Dow Theory 頭頭低/底底高 · ⚠ 頂區=擴散喇叭 · ⚠ 衝突=Dow 說空頭">Dow</th><th title="4W/13W/26W 三期價漲跌 × 量漲跌 綜合判定">量價</th><th title="綜合 momentum+Dow+pv+VCP 4 訊號 · 🚀 暴漲中/🎯 潛在/🔥 追高">暴漲</th></tr>
        </thead>
        <tbody>{sb_rows_html}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-h">🚀 strong_buy_explosive 訊號 <span class="n">{len(exp_stocks)}</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th></th><th>Symbol / Name</th><th>Sector</th><th class="n">Point</th><th class="n">vp</th><th class="n">4W</th><th class="n">26W</th><th>L1+L2</th><th title="Dow Theory 頭頭低/底底高 · ⚠ 頂區=擴散喇叭 · ⚠ 衝突=Dow 說空頭">Dow</th></tr>
        </thead>
        <tbody>{exp_rows_html}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-h">📊 11 Sector 深度儀表板 · 依 90d 百分位排序</div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector</th><th class="n">Point</th><th class="n">加速度</th><th class="n" title="Point > 0 連續天數 · 抓動能持續">連續</th><th class="n" title="30 日資金流向 · net/gross · +% = 淨買入 · -% = 淨賣出">30d 流向</th><th class="n">30d</th><th class="n">90d</th><th class="n">365d</th><th class="n">寬度</th><th>健康度</th></tr>
        </thead>
        <tbody>{sec_rows_html}</tbody>
      </table>
    </div>
  </div>

  {l21_html}

  {etf_map_html}

  {breadth30_html}

  {regime_stats_html}

  <div class="foot">
    <div class="conf">
      💎 <b>strong_buy</b> · 11-sample 1y avg <b>{num(sb_stats.get("avg"), 1, pct=True, sign=True)}</b> / 命中 <b>{num(sb_stats.get("hit_rate_pct"), 1, pct=True)}</b> (n={sb_stats.get("n","—")})
      &nbsp;·&nbsp;
      🚀 <b>explosive</b> · 1y avg <b>{num(exp_stats.get("avg"), 1, pct=True, sign=True)}</b> / 命中 <b>{num(exp_stats.get("hit_rate_pct"), 1, pct=True)}</b> (n={exp_stats.get("n","—")})
    </div>
    產生時間 {gen_ts} · <a href="../index.html">回主頁</a> · <a href="8-sample-analysis.html">看回測方法論</a> · <a href="backtest-summary.html">看 pipeline 回測</a>
    <br><br>
    <span style="color:#94a3b8;">投資有風險 · 本報告為系統化訊號記錄 · 不構成投資建議</span>
  </div>

</div>
</body>
</html>'''

    os.makedirs(REPORTS_DIR, exist_ok=True)
    dated_path = os.path.join(REPORTS_DIR, f"daily-{as_of}.html")
    latest_path = os.path.join(REPORTS_DIR, "daily-latest.html")
    with open(dated_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)
    return dated_path, latest_path


def main():
    scorecard = load_json(SCORECARD)
    if not scorecard:
        sys.exit(f"❌ 沒 {SCORECARD} · 先跑 sector_scorecard.py")
    stage2 = load_json(STAGE2)
    pattern = load_json(PATTERN)
    dated, latest = render(scorecard, stage2, pattern)
    print(f"✅ 產生 {dated}")
    print(f"✅ 覆寫 {latest}")


if __name__ == "__main__":
    main()
