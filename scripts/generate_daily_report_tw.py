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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tw_industry_mapping as tim  # noqa: E402  (產業鏈雷達卡片的涵蓋率統計用)

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
    c13 = num(r.get("cum_ret_13w"), 1, pct=True, sign=True)
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
          <td class="n">{c13}</td>
          <td class="n">{c26}</td>
          <td>{alert_html}</td>
          {dow_cell(r)}
          {pv_cell(r)}
          {exp_cell(r)}
          <td class="n {inst_cls}">{inst_html}</td>
        </tr>'''


def sector_row(r, point_rank=None):
    sec = escape(r.get("sector", ""))
    pt = num(r.get("point"), 1)
    acc = r.get("acceleration")
    acc_str = num(acc, 1, sign=True) if acc is not None else "—"
    acc_cls = "up" if (acc is not None and acc == acc and acc > 0) else (
        "down" if (acc is not None and acc == acc and acc < 0) else "flat")
    breadth = r.get("breadth_pct")
    breadth_str = f"{breadth:.0f}%" if breadth is not None and breadth == breadth else "—"
    n = int(r.get("stock_count") or 0)
    inst = r.get("inst_net_20d_est_NTD_M")
    inst_html = ntd_amount(inst)
    inst_cls = "up" if (inst is not None and inst == inst and inst > 0) else (
        "down" if (inst is not None and inst == inst and inst < 0) else "flat")
    # 平均每檔淨買：正規化過的金額，才能跨板塊比較（原始總額板塊成分股數量差很多，
    # 金額大很可能只是板塊夠大，不是資金真的比較集中）。
    inst_avg = r.get("inst_net_20d_est_NTD_M_per_stock")
    inst_avg_html = ntd_amount(inst_avg)
    inst_avg_cls = "up" if (inst_avg is not None and inst_avg == inst_avg and inst_avg > 0) else (
        "down" if (inst_avg is not None and inst_avg == inst_avg and inst_avg < 0) else "flat")
    cpd_html = cpd_cell(r)
    trans_html = transition_cell(r)

    # n<3：這個「板塊」point 其實就是 1-2 檔個股的走勢，不是板塊性訊號，用斜體+灰階
    # 視覺上跟真正有寬度的板塊區分開，不用使用者自己去看 n 欄位才注意到。
    row_cls = ' class="thin-sector"' if n < 3 else ""
    n_html = f'<span class="dim">n={n}{" ⚠️樣本過少" if n < 3 else ""}</span>'

    # 寬度 < 20% 但 point 排進全表前 3 名：多半是單一極端值撐起來的高分，不是板塊性
    # 資金輪動——這個矛盾很直接，不該讓使用者自己交叉比對「寬度」跟「排名」兩欄才發現。
    extreme_html = ""
    if point_rank is not None and point_rank < 3 and breadth is not None and breadth == breadth and breadth < 20:
        extreme_html = ' <span class="alert" title="寬度過低但 point 排進全表前 3 名，高分可能是單一極端值撐起來的，不代表板塊性趨勢">⚠️ 極端值驅動</span>'

    return f'''
        <tr{row_cls}>
          <td><b>{sec}</b> {n_html}</td>
          <td class="n">{pt}{extreme_html}</td>
          <td class="n {acc_cls}">{acc_str}</td>
          <td class="n">{breadth_str}</td>
          <td class="n {inst_cls}">{inst_html}</td>
          <td class="n {inst_avg_cls}">{inst_avg_html}</td>
          {cpd_html}
          {trans_html}
        </tr>'''


CPD_META = {
    "🚀 Confirmed": "cpd-confirmed",
    "💰 Capital Leading": "cpd-leading",
    "⚠️ Price Leading": "cpd-warn",
    "❄️ Weak": "cpd-weak",
    "🔥 Overheated": "cpd-overheat",
}


def cpd_cell(r):
    # market_state：跟 cpd_quadrant 大部分時候相同，差異只在「連兩天 Confirmed
    # 但寬度掉超過門檻」被 add_transition_sensor() 升級成 🔥 Overheated 的情況——
    # 這裡優先顯示 market_state，比純象限早一步標出退燒徵兆。
    raw_q = r.get("cpd_quadrant")
    q = r.get("market_state") or raw_q
    cpd = r.get("cpd")
    if not q or q != q:
        return '<td><span class="dow-none">—</span></td>'
    cls = CPD_META.get(q, "cpd-weak")
    cpd_str = num(cpd, 2, sign=True) if cpd is not None else ""
    title = f"CPD = Z(法人金額) - Z(SectorPoint)：{cpd_str}"
    if q != raw_q:
        title += f" · 原始象限 {raw_q}（連兩日 Confirmed 但寬度下滑，判定過熱/出貨徵兆）"
    return f'<td><span class="cpd {cls}" title="{escape(title)}">{escape(q)}</span></td>'


TRANSITION_DIR_META = {
    "ADVANCING": ("trans-adv", "🔼"),
    "REVERSING": ("trans-rev", "🔽"),
    "STEADY": ("trans-steady", "→"),
    "NEW": ("trans-new", "·"),
}


def transition_cell(r):
    """Transition Sensor：昨天 → 今天板塊移動到哪個象限，比單看今天排名更早看出
    「正往資金價格雙確認推進」還是「正在退燒」。NEW = 沒有前一日資料可比對
    （第一次執行，或這個板塊今天才第一次出現在股票池）。"""
    direction = r.get("transition_dir")
    label = r.get("transition_label") or "—"
    cls, icon = TRANSITION_DIR_META.get(direction, ("trans-new", "·"))
    return f'<td><span class="trans {cls}">{icon}</span> <span class="dim">{escape(label)}</span></td>'


def cpd_matrix_html(rows_sorted):
    """狀態卡：💰 Capital Leading 是狩獵區（資金已進、價格尚未反映）；🚀 Confirmed
    資金價格同步；⚠️ Price Leading 價格已動法人沒跟，追高風險；❄️ Weak 都沒動靜；
    🔥 Overheated 是從 Confirmed 分出來的過熱/出貨徵兆（見 cpd_cell 的 market_state
    邏輯）。用 market_state 分組（不是原始 cpd_quadrant），每組內依 |CPD| 由大到小排。
    """
    buckets = {"💰 Capital Leading": [], "🚀 Confirmed": [], "⚠️ Price Leading": [],
               "❄️ Weak": [], "🔥 Overheated": []}
    for r in rows_sorted:
        q = r.get("market_state") or r.get("cpd_quadrant")
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
               "⚠️ Price Leading": "warn", "❄️ Weak": "weak", "🔥 Overheated": "overheat"}
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


def chain_row(r):
    """產業鏈雷達表格一列：跟 sector_row() 同精神，多了 Resonance（節點共振度）——
    同一條鏈裡有幾個不同的 chain_node（例如 AI Server 底下的 Compute/PCB/CCL/
    Thermal）平均 point 轉正，比整條鏈的個股 Breadth 更能看出這是單一環節帶動、
    還是真的全鏈擴散。cpd_cell() 直接重用（chain 沒有 market_state 這個 Transition
    Sensor 才有的欄位，cpd_cell 內部 .get() 會自動退回純 cpd_quadrant，不會壞）。
    """
    chain = escape(r.get("supply_chain", ""))
    pt = num(r.get("point"), 1)
    breadth = r.get("breadth_pct")
    try:
        breadth_f = float(breadth) if breadth not in (None, "") else None
    except (TypeError, ValueError):
        breadth_f = None
    breadth_str = f"{breadth_f:.0f}%" if breadth_f is not None else "—"
    n = int(float(r.get("stock_count") or 0))
    inst = r.get("inst_net_20d_est_NTD_M")
    inst_html = ntd_amount(inst)
    try:
        inst_f = float(inst) if inst not in (None, "") else None
    except (TypeError, ValueError):
        inst_f = None
    inst_cls = "up" if (inst_f is not None and inst_f > 0) else ("down" if (inst_f is not None and inst_f < 0) else "flat")
    inst_avg_html = ntd_amount(r.get("inst_net_20d_est_NTD_M_per_stock"))

    resonance = r.get("resonance_pct")
    node_count = r.get("node_count") or "—"
    try:
        resonance_f = float(resonance) if resonance not in (None, "") else None
    except (TypeError, ValueError):
        resonance_f = None
    if resonance_f is None:
        resonance_html = f'<span class="dim" title="只有 1 個節點，跟自己比沒有意義">單一節點</span>'
    else:
        res_cls = "up" if resonance_f >= 60 else ("down" if resonance_f < 30 else "flat")
        resonance_html = f'<span class="{res_cls}">{resonance_f:.0f}%</span> <span class="dim">({node_count} 節點)</span>'

    cpd_html = cpd_cell(r)
    trans_html = transition_cell(r)

    return f'''
        <tr>
          <td><b>{chain}</b> <span class="dim">n={n}</span></td>
          <td class="n">{pt}</td>
          <td class="n">{breadth_str}</td>
          <td class="n {inst_cls}">{inst_html}</td>
          <td class="n">{inst_avg_html}</td>
          <td>{resonance_html}</td>
          {cpd_html}
          {trans_html}
        </tr>'''


def chain_table_html(chain_rows, coverage_note=""):
    if not chain_rows:
        return '<p class="empty">今日沒有產業鏈資料（IndustryMappingTable 目前只涵蓋部分股票池，可能跟今天股票池沒有交集）</p>'
    rows_html = "".join(chain_row(r) for r in chain_rows)
    note_html = f'<p class="dim" style="margin:8px 18px 0;">{escape(coverage_note)}</p>' if coverage_note else ""
    return f'''
    <table>
      <thead>
        <tr><th>Supply Chain</th><th class="n">Point</th>
            <th class="n" title="鏈內個股 4W 累報 > 0 的比例">寬度</th>
            <th class="n" title="鏈內所有股票三大法人 20 日淨買賣加總（同一檔股票若掛多條鏈，會分別計入每一條）">法人 20d 淨買</th>
            <th class="n" title="法人 20d 淨買金額 ÷ 鏈內股票數，跨鏈可比較的正規化指標">平均每檔淨買</th>
            <th title="Node Resonance：鏈內有幾個不同節點（chain_node）平均 point 轉正——比個股 Breadth 更能看出是單一環節帶動還是全鏈擴散">節點共振</th>
            <th title="CPD = Z(法人金額) - Z(ChainPoint)，跨產業鏈橫斷面相對排名">狀態</th>
            <th title="Chain Transition Sensor：昨天 → 今天這條鏈移動到哪個狀態">轉移</th></tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>{note_html}'''


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


def load_chain_scorecard(as_of):
    """讀當日 tw_{date}_chains.csv（tw_industry_mapping.aggregate_supply_chains()
    的輸出）。檔案不一定存在——mapping 目前只涵蓋部分股票池，某天股票池剛好完全
    沒交集就不會有這個檔案，回傳空 list，報表那一段直接跳過，不是錯誤。"""
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"tw_{stamp}_chains.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_chain_dependency(as_of):
    """讀當日 tw_{date}_chain_deps.csv（tw_industry_mapping.chain_dependency_check()
    的輸出）。跟 load_chain_scorecard 一樣，檔案不一定存在（今天沒有任何鏈同時
    有依賴圖資料 + 今日股票池資料），回傳空 list，不是錯誤。"""
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"tw_{stamp}_chain_deps.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def chain_dependency_html(dep_rows):
    """供應鏈同步度卡片：upstream_coherence_pct（用 industry_chain_edges.csv
    的 weight 加權）低的鏈排最前面——這些是「自己價格/資金很強，但依賴的上游鏈
    今天大多還沒同步確認」的鏈，可能是價格面單獨噴出，供應鏈基本面還沒跟上
    （跟 CPD 象限的邏輯互補，不是重複）。用加權版本而不是原始 confirmed/total
    比例，是因為 1/1（單一低權重依賴）跟 8/8（八條高權重依賴）用未加權比例看
    都是 100%，但可信度完全不同——加權才能反映「這條依賴關係本身有多重要」。
    畫面上仍會顯示原始 X/Y 計數 + 總權重，給讀者看到分母跟權重來源，不是只
    丟一個加權後的數字讓人看不出來怎麼算的。這張表是分析模型
    （industry_chain_edges.csv 不是官方跨鏈依賴資料，weight 也是分析師主觀
    判斷），只列出有依賴圖資料可查的鏈，不是全部都會出現。
    """
    if not dep_rows:
        return '<p class="empty">今日沒有供應鏈依賴資料（industry_chain_edges.csv 涵蓋的鏈可能跟今天有資料的鏈沒有交集）</p>'

    def _num(r, key):
        try:
            return float(r.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    rows_sorted = sorted(dep_rows, key=lambda r: _num(r, "upstream_coherence_pct"))
    items = []
    for r in rows_sorted:
        chain = escape(r.get("chain", ""))
        state_raw = r.get("chain_state") or "—"
        pct = _num(r, "upstream_coherence_pct")
        cls = "down" if pct < 30 else ("flat" if pct < 60 else "up")
        cnt = f"{r.get('upstream_confirmed','—')}/{r.get('upstream_count','—')}"
        total_weight = _num(r, "upstream_total_weight")
        warn = (' <span class="alert" title="這條鏈本身強勢，但依賴的上游鏈（加權後）大多還沒確認，'
                '可能是價格面單獨噴出">⚠️ 上游未確認</span>') if pct < 30 and state_raw in (
                    "🚀 Confirmed", "💰 Capital Leading") else ""
        items.append(
            f'<li><b>{chain}</b> <span class="dim">{escape(state_raw)}</span>{warn}'
            f'<span class="{cls}">{pct:.0f}%</span> '
            f'<span class="dim" title="原始未加權：{cnt} 上游確認・依賴權重總和 {total_weight:.2f}">'
            f'({cnt} 上游確認・權重 {total_weight:.2f})</span></li>'
        )
    return f'<ul class="deplist">{"".join(items)}</ul>'


def load_chain_price_lag(as_of):
    """讀當日 tw_{date}_price_lag.csv（tw_industry_mapping.compute_chain_price_lag()
    的輸出）。跟其餘 load_chain_* 一樣，檔案不一定存在（今天沒有鏈達到最小股票數
    門檻），回傳空 list，不是錯誤。"""
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"tw_{stamp}_price_lag.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def price_lag_html(lag_rows):
    """🎯 早期機會（Price Lag）卡片：只列 early_flag 有標記的列——鏈本身已經
    🚀 Confirmed／💰 Capital Leading（資金/價格雙重或至少資金面確認），但這檔
    股票在鏈內相對同儕還沒漲上來（stock_z_in_chain < 0）。PriceLag = 鏈的
    橫斷面 Z-score（vs. 其他鏈）減掉股票的鏈內橫斷面 Z-score（vs. 鏈內同儕），
    越高代表「鏈越強、這檔股票在鏈內越落後」，是候選觀察名單，不是買賣建議。
    """
    early_rows = [r for r in lag_rows if (r.get("early_flag") or "").strip()]
    if not lag_rows:
        return '<p class="empty">今日沒有 Price Lag 資料（沒有鏈達到最小股票數門檻，或今天股票池跟 IndustryMappingTable 沒有交集）</p>'
    if not early_rows:
        return '<p class="empty">今日沒有標記為 EARLY 的候選（有算 Price Lag 的鏈裡，沒有「鏈已確認、股票仍落後」的組合）</p>'

    def _lag(r):
        try:
            return float(r.get("price_lag") or 0)
        except (TypeError, ValueError):
            return 0.0

    rows_sorted = sorted(early_rows, key=_lag, reverse=True)[:15]
    items = []
    for r in rows_sorted:
        ticker = escape(r.get("ticker", ""))
        name = escape(r.get("stock_name", ""))
        chain = escape(r.get("supply_chain", ""))
        lag = _lag(r)
        cls = "up" if lag >= 2 else "flat"
        items.append(
            f'<li><b>{ticker} {name}</b> <span class="dim">[{chain}]</span>'
            f'<span class="dim" title="鏈的橫斷面 Z-score，vs. 今天其他所有鏈">'
            f'鏈z={escape(r.get("chain_z_point","—"))}</span>'
            f'<span class="dim" title="股票在鏈內的橫斷面 Z-score，vs. 鏈內同儕">'
            f'股z={escape(r.get("stock_z_in_chain","—"))}</span>'
            f'<span class="{cls}">{lag:.2f}</span></li>'
        )
    return f'<ul class="deplist">{"".join(items)}</ul>'


# PV_STATE_LABELS：pv_state_4w 值 -> (中文標籤, 卡片內「代表股」該用哪個方向排序)。
# 量漲價漲 (P+V+) 找「漲最兇」的代表股（point 由大到小）；量漲價跌 (P-V+) 找
# 「跌最兇」的代表股（point 由小到大）——量漲價跌是價格弱、量卻放大，越負的
# point 才是越該注意的（可能主力出貨/恐慌），不是隨便挑三檔。
PV_STATE_LABELS = {
    "P+V+": {"label": "量漲價漲", "strongest_first": True},
    "P-V+": {"label": "量漲價跌", "strongest_first": False},
}
TOP_CATEGORIES_N = 5
TOP_STOCKS_PER_CATEGORY_N = 3


def pv_market_summary(all_rows, mapping_df, pv_state="P+V+"):
    """量漲價漲/量漲價跌全市場總結：用 pv_state_4w 篩全股票池（不限 Phase 2 的
    425 檔核心池，是整個 all_rows，Phase 1 的完整市場池），依官方 sector
    （Phase 1 分類）聚合，並標出每個 sector 裡有多少檔落在 IndustryMappingTable
    之外。這些「未映射」股票不是資料錯誤——是 Phase 2 供應鏈雷達刻意的策略性
    子集（見「Phase 2 產業鏈研究池」卡片說明）造成的盲區，但 Phase 1 的量價
    訊號（pv_state_4w）本來就對全市場生效，這張卡片就是要把這個盲區攤開來看，
    不讓中小型股的訊號被 Phase 2 的子集選擇蓋掉。

    每個 sector 額外附上代表股（top3：依 point 排序，量漲價漲取最高、量漲價跌
    取最低），只給前 TOP_CATEGORIES_N 大 sector 算——不是為了省算力，是報表只
    展示前 5 類，其餘類別的代表股沒有意義去算。
    """
    if not all_rows:
        return {"total": 0, "mapped": 0, "unmapped": 0, "by_sector": []}

    mapped_tickers = set(mapping_df["ticker"]) if mapping_df is not None and not mapping_df.empty else set()
    strongest_first = PV_STATE_LABELS.get(pv_state, {}).get("strongest_first", True)

    def _f(r, k):
        try:
            return float(r.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0

    pv_rows = [r for r in all_rows if (r.get("pv_state_4w") or "").strip() == pv_state]

    by_sector = {}
    mapped_total = 0
    for r in pv_rows:
        is_mapped = r.get("stock_id") in mapped_tickers
        mapped_total += 1 if is_mapped else 0
        sector = r.get("sector") or "（未分類）"
        b = by_sector.setdefault(sector, {"sector": sector, "stock_count": 0, "point_sum": 0.0,
                                            "ret4w_sum": 0.0, "mapped_count": 0, "rows": []})
        b["stock_count"] += 1
        b["point_sum"] += _f(r, "point")
        b["ret4w_sum"] += _f(r, "cum_ret_4w")
        b["mapped_count"] += 1 if is_mapped else 0
        b["rows"].append(r)

    rows = []
    for b in by_sector.values():
        n = b["stock_count"]
        unmapped = n - b["mapped_count"]
        rows.append({
            "sector": b["sector"], "stock_count": n,
            "avg_point": round(b["point_sum"] / n, 2) if n else 0.0,
            "avg_ret_4w": round(b["ret4w_sum"] / n, 2) if n else 0.0,
            "mapped_count": b["mapped_count"], "unmapped_count": unmapped,
            "unmapped_pct": round(100 * unmapped / n, 1) if n else 0.0,
            "_rows": b["rows"],
        })
    rows.sort(key=lambda r: -r["stock_count"])

    for r in rows[:TOP_CATEGORIES_N]:
        top_rows = sorted(r["_rows"], key=lambda x: _f(x, "point"), reverse=strongest_first)
        r["top3"] = [{"stock_id": x.get("stock_id", ""), "stock_name": x.get("stock_name", ""),
                      "point": _f(x, "point")} for x in top_rows[:TOP_STOCKS_PER_CATEGORY_N]]
    for r in rows:
        del r["_rows"]

    return {
        "total": len(pv_rows), "mapped": mapped_total, "unmapped": len(pv_rows) - mapped_total,
        "by_sector": rows,
    }


def _top_categories_html(rows, category_key, label_prefix):
    """「前 5 類 × 前 3 家代表股」的共用渲染：rows 已經依 stock_count 由大到小
    排序、且前 TOP_CATEGORIES_N 筆各自帶有 top3 欄位（見 pv_market_summary/
    pv_chain_summary）。category_key 是分類欄位名稱（sector 或 supply_chain）。
    """
    top_rows = [r for r in rows[:TOP_CATEGORIES_N] if r.get("top3")]
    if not top_rows:
        return ""
    items = []
    for r in top_rows:
        stocks = "、".join(f'{escape(s["stock_id"])} {escape(s["stock_name"])}（{s["point"]:.1f}）'
                            for s in r["top3"])
        items.append(f'<li><b>{escape(r[category_key])}</b>'
                      f'<span class="dim" title="{label_prefix}檔數">（{r["stock_count"]} 檔）</span>'
                      f'<span class="dim">{stocks}</span></li>')
    return (f'<p class="dim" style="margin:10px 18px 4px;font-weight:600;">'
            f'前 {len(top_rows)} 大類・每類前 {TOP_STOCKS_PER_CATEGORY_N} 家代表股</p>'
            f'<ul class="deplist" style="margin:0 18px 8px;">{"".join(items)}</ul>')


def pv_market_summary_html(summary, pv_state="P+V+"):
    total = summary.get("total", 0)
    label = PV_STATE_LABELS.get(pv_state, {}).get("label", pv_state)
    if total == 0:
        return f'<p class="empty">今日沒有{label}（{pv_state}）股票，或今日股票池資料不存在</p>'

    def _sector_row(r):
        style = ' style="color:#b91c1c;font-weight:700;"' if r["unmapped_pct"] >= 50 else ""
        return (
            f'<tr><td>{escape(r["sector"])}</td>'
            f'<td class="n">{r["stock_count"]}</td>'
            f'<td class="n">{r["avg_point"]:.2f}</td>'
            f'<td class="n">{r["avg_ret_4w"]:.2f}%</td>'
            f'<td class="n">{r["mapped_count"]}</td>'
            f'<td class="n">{r["unmapped_count"]}</td>'
            f'<td class="n"{style}>{r["unmapped_pct"]:.0f}%</td></tr>'
        )

    rows_html = "".join(_sector_row(r) for r in summary["by_sector"])
    top_html = _top_categories_html(summary["by_sector"], "sector", label)
    note = (f'<p class="dim" style="margin:8px 18px 0;">全市場{label}（{pv_state}，4 週'
            f'{"價漲且量增" if pv_state == "P+V+" else "價跌但量增"}）'
            f'共 {total} 檔——{summary["mapped"]} 檔在 Phase 2 產業鏈研究池內、'
            f'<b>{summary["unmapped"]} 檔在核心池之外</b>（多為中小型股，Phase 1 板塊層級已經'
            f'確認訊號，但目前沒有供應鏈脈絡可查，不是資料缺失）。「未映射%」≥50% 標紅，'
            f'代表該產業的{label}訊號主要來自 Phase 2 尚未觸及的股票。</p>')
    return f'''
    <table>
      <thead>
        <tr><th>官方產業（Phase 1）</th><th class="n">{label}檔數</th>
            <th class="n">平均 Point</th><th class="n">平均 4W 報酬</th>
            <th class="n" title="有進入 Phase 2 IndustryMappingTable 的檔數">Phase2 內</th>
            <th class="n" title="不在 Phase 2 IndustryMappingTable 的檔數（中小型股機會）">Phase2 外</th>
            <th class="n" title="這個產業的{label}訊號，有多少比例落在 Phase 2 核心池之外">未映射%</th></tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>{top_html}{note}'''


def pv_chain_summary(all_rows, mapping_df, pv_state="P+V+"):
    """量漲價漲/量漲價跌 Phase 2 供應鏈總結：跟 pv_market_summary() 是同一份
    all_rows/pv_state_4w 篩選，但分組維度換成 supply_chain（many-to-many，
    一檔股票掛多條鏈就分別計入每一條，跟 aggregate_supply_chains() 的設計
    一致），只涵蓋 Phase 2 IndustryMappingTable 已映射的股票——這是「訊號
    集中在哪些供應鏈」的視角，跟 pv_market_summary() 的「官方產業」視角互補，
    不是重複：官方產業是 Phase 1 全市場都適用的粗分類，供應鏈是只對 Phase 2
    核心池才有意義的細分類。

    每個 chain 額外附上代表股（top3，排序方向同 pv_market_summary），只給前
    TOP_CATEGORIES_N 大 chain 算。
    """
    if not all_rows or mapping_df is None or mapping_df.empty:
        return {"total_rows": 0, "stock_count": 0, "by_chain": []}

    strongest_first = PV_STATE_LABELS.get(pv_state, {}).get("strongest_first", True)

    def _f(r, k):
        try:
            return float(r.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0

    pv_by_id = {r["stock_id"]: r for r in all_rows
                if (r.get("pv_state_4w") or "").strip() == pv_state and r.get("stock_id")}
    if not pv_by_id:
        return {"total_rows": 0, "stock_count": 0, "by_chain": []}

    by_chain = {}
    matched_tickers = set()
    for _, m in mapping_df.iterrows():
        ticker = m["ticker"]
        r = pv_by_id.get(ticker)
        if r is None:
            continue
        matched_tickers.add(ticker)
        chain = m["supply_chain"]
        b = by_chain.setdefault(chain, {"supply_chain": chain, "stock_count": 0,
                                          "point_sum": 0.0, "ret4w_sum": 0.0, "rows": []})
        b["stock_count"] += 1
        b["point_sum"] += _f(r, "point")
        b["ret4w_sum"] += _f(r, "cum_ret_4w")
        b["rows"].append(r)

    rows = []
    for b in by_chain.values():
        n = b["stock_count"]
        rows.append({
            "supply_chain": b["supply_chain"], "stock_count": n,
            "avg_point": round(b["point_sum"] / n, 2) if n else 0.0,
            "avg_ret_4w": round(b["ret4w_sum"] / n, 2) if n else 0.0,
            "_rows": b["rows"],
        })
    rows.sort(key=lambda r: -r["stock_count"])

    for r in rows[:TOP_CATEGORIES_N]:
        top_rows = sorted(r["_rows"], key=lambda x: _f(x, "point"), reverse=strongest_first)
        r["top3"] = [{"stock_id": x.get("stock_id", ""), "stock_name": x.get("stock_name", ""),
                      "point": _f(x, "point")} for x in top_rows[:TOP_STOCKS_PER_CATEGORY_N]]
    for r in rows:
        del r["_rows"]

    return {
        "total_rows": sum(r["stock_count"] for r in rows),
        "stock_count": len(matched_tickers),
        "by_chain": rows,
    }


def pv_chain_summary_html(summary, pv_state="P+V+"):
    label = PV_STATE_LABELS.get(pv_state, {}).get("label", pv_state)
    if not summary.get("by_chain"):
        return f'<p class="empty">今日沒有{label}股票落在任何 Phase 2 供應鏈上（或今日無資料）</p>'

    rows_html = "".join(
        f'<tr><td>{escape(r["supply_chain"])}</td>'
        f'<td class="n">{r["stock_count"]}</td>'
        f'<td class="n">{r["avg_point"]:.2f}</td>'
        f'<td class="n">{r["avg_ret_4w"]:.2f}%</td></tr>'
        for r in summary["by_chain"]
    )
    top_html = _top_categories_html(summary["by_chain"], "supply_chain", label)
    note = (f'<p class="dim" style="margin:8px 18px 0;">{label}個股在 Phase 2 供應鏈的分佈'
            f'（{summary["stock_count"]} 檔已映射股票、共 {summary["total_rows"]} 筆鏈歸屬——'
            f'同一檔股票掛多條鏈會分別計入）。這是「訊號集中在哪條鏈」的視角，跟上面「Phase 1 '
            f'全市場」卡片的官方產業視角互補。</p>')
    return f'''
    <table>
      <thead>
        <tr><th>Supply Chain（Phase 2）</th><th class="n">{label}檔數</th>
            <th class="n">平均 Point</th><th class="n">平均 4W 報酬</th></tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>{top_html}{note}'''


# ============================================================
# 首頁「決策儀表板」區塊：把報表從「資料倉庫」改造成「今天要注意什麼」——
# 詳細數據不刪，只是收進下面的 <details> 區塊（點擊展開），不佔首屏版面。
# ============================================================
FRONT_PAGE_TOP_N = 5


def today_signal_html(chain_rows_sorted, top_n=FRONT_PAGE_TOP_N):
    """今天最強的幾條供應鏈——point 最高的前 N 條，附狀態 + Transition 方向。
    這是「哪些產業鏈正在形成」這個問題的答案，不是「哪個 Point 最高就買哪個」，
    只是把 Chain Radar 已經算好的排名做成一眼看完的摘要。
    """
    if not chain_rows_sorted:
        return '<p class="empty">今日無產業鏈資料</p>'
    items = []
    for r in chain_rows_sorted[:top_n]:
        chain = escape(r.get("supply_chain", ""))
        pt = num(r.get("point"), 1)
        q = r.get("market_state") or r.get("cpd_quadrant") or "—"
        cls = CPD_META.get(q, "cpd-weak")
        direction = r.get("transition_dir")
        _, icon = TRANSITION_DIR_META.get(direction, ("trans-new", ""))
        items.append(
            f'<li><b>{chain}</b><span class="n">{pt}</span>'
            f'<span class="cpd {cls}">{escape(q)}</span>'
            f'<span class="dim">{icon}</span></li>'
        )
    return f'<ul class="fpsignal">{"".join(items)}</ul>'


def money_moving_html(chain_rows_sorted):
    """💰 Capital Leading 的鏈：資金已經進場，價格還沒完全反映——早期階段。"""
    names = [escape(r.get("supply_chain", "")) for r in chain_rows_sorted
             if (r.get("market_state") or r.get("cpd_quadrant")) == "💰 Capital Leading"]
    if not names:
        return '<p class="empty">今日無 Capital Leading 鏈</p>'
    return f'<ul class="fpnames">{"".join(f"<li>{n}</li>" for n in names)}</ul>'


def risk_chains_html(chain_rows_sorted):
    """⚠️ Price Leading（價格已動、法人沒跟，追高風險）+ 🔥 Overheated（連兩日
    Confirmed 但寬度下滑，過熱/出貨徵兆）——這兩種狀態都是「小心，不是進場訊號」。
    """
    risk_states = {"⚠️ Price Leading", "🔥 Overheated"}
    names = [escape(r.get("supply_chain", "")) for r in chain_rows_sorted
             if (r.get("market_state") or r.get("cpd_quadrant")) in risk_states]
    if not names:
        return '<p class="empty">今日無警示鏈</p>'
    return f'<ul class="fpnames">{"".join(f"<li>{n}</li>" for n in names)}</ul>'


def _chain_for_ticker(stock_id, mapping_df):
    """給定 ticker，回傳它在 IndustryMappingTable 裡的第一條 supply_chain（如果
    有映射的話）——用於「機會清單」裡幫沒有 Price Lag 資料的暴漲股標出鏈脈絡，
    不保證是唯一或最重要的一條（many-to-many，這裡只挑第一筆給畫面用）。"""
    if mapping_df is None or mapping_df.empty:
        return None
    hit = mapping_df[mapping_df["ticker"] == stock_id]
    if hit.empty:
        return None
    return hit.iloc[0]["supply_chain"]


def opportunity_html(all_rows, chain_lag_rows, mapping_df, top_n=FRONT_PAGE_TOP_N):
    """🎯 OPPORTUNITY：合併兩個已經算好的訊號來源，不是發明新公式——
    🚀 突破：explosive_verdict=='🚀 暴漲中' 的股票（Layer 2 純價量訊號）
    🎯 早期：Price Lag 標記 EARLY 的股票（鏈已確認、股票鏈內還沒漲上來）
    兩組各取前 top_n 檔，前者按 point 排序、後者按 price_lag 排序（沿用各自
    原本的排序邏輯，不是這裡另外發明）。Chain 欄位：EARLY 組直接有 supply_chain；
    突破組透過 IndustryMappingTable 查第一條有映射到的鏈，查不到就顯示 Sector。
    """
    def _f(r, k):
        try:
            return float(r.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0

    breakout = sorted(
        [r for r in all_rows if (r.get("explosive_verdict") or "").strip() == "🚀 暴漲中"],
        key=lambda r: -_f(r, "point"),
    )[:top_n]
    early = sorted(
        [r for r in (chain_lag_rows or []) if (r.get("early_flag") or "").strip()],
        key=lambda r: -_f(r, "price_lag"),
    )[:top_n]

    if not breakout and not early:
        return '<p class="empty">今日無突破或早期機會候選</p>'

    rows_html = []
    for r in breakout:
        sid = r.get("stock_id", "")
        chain = _chain_for_ticker(sid, mapping_df) or r.get("sector", "—")
        rows_html.append(
            f'<tr><td><b>{escape(sid)}</b> <span class="dim">{escape((r.get("stock_name") or "")[:10])}</span></td>'
            f'<td>{escape(chain)}</td>'
            f'<td class="n">{num(r.get("cum_ret_4w"), 1, pct=True, sign=True)}</td>'
            f'<td>🚀</td></tr>'
        )
    for r in early:
        sid = r.get("ticker", "")
        rows_html.append(
            f'<tr><td><b>{escape(sid)}</b> <span class="dim">{escape((r.get("stock_name") or "")[:10])}</span></td>'
            f'<td>{escape(r.get("supply_chain", ""))}</td>'
            f'<td class="n">{num(r.get("stock_point"), 1, sign=True)}</td>'
            f'<td>🎯</td></tr>'
        )
    return f'''
    <table>
      <thead><tr><th>Stock</th><th>Chain</th><th class="n">4W / Point</th><th>Signal</th></tr></thead>
      <tbody>{"".join(rows_html)}</tbody>
    </table>'''


def sector_map_html(rows_sorted):
    """🧭 SECTOR MAP：板塊名稱 + 狀態圖示，不重複數字——數字在 Sector Detail
    裡已經有了，這裡只回答「哪個板塊現在是什麼狀態」。"""
    if not rows_sorted:
        return '<p class="empty">今日無板塊資料</p>'
    items = []
    for r in rows_sorted:
        sec = escape(r.get("sector", ""))
        q = r.get("market_state") or r.get("cpd_quadrant") or "—"
        cls = CPD_META.get(q, "cpd-weak")
        items.append(f'<li>{sec}<span class="cpd {cls}">{escape(q)}</span></li>')
    return f'<ul class="fpnames fpsectormap">{"".join(items)}</ul>'


def chain_diagnostics_html(chain_rows_sorted, chain_dep_rows, chain_lag_rows):
    """🔬 Chain Diagnostics：把三個目前分開顯示的鏈層級指標（Node Resonance、
    Upstream Coherence、Price Lag）合併成同一條鏈的完整診斷檔案，取代「使用者
    要在畫面上自己對照三張表才能理解同一條鏈」的體驗。這不是新指標，是既有三個
    指標的合併呈現——resonance 答「鏈內部有沒有全面擴散」，coherence 答「上游
    供應鏈有沒有跟上」，price lag 答「哪些成分股還沒漲上來」，三個問題不同，
    合併只是省去讀者自己交叉比對的功夫。
    """
    if not chain_rows_sorted:
        return '<p class="empty">今日無產業鏈資料</p>'

    dep_by_chain = {r.get("chain"): r for r in (chain_dep_rows or [])}

    lag_by_chain = {}
    for r in (chain_lag_rows or []):
        chain = r.get("supply_chain")
        if not chain:
            continue
        try:
            lag = float(r.get("price_lag") or 0)
        except (TypeError, ValueError):
            lag = 0.0
        b = lag_by_chain.setdefault(chain, {"lags": [], "early_count": 0})
        b["lags"].append(lag)
        if (r.get("early_flag") or "").strip():
            b["early_count"] += 1

    rows_html = []
    for r in chain_rows_sorted:
        chain = r.get("supply_chain", "")
        q = r.get("market_state") or r.get("cpd_quadrant") or "—"
        cls = CPD_META.get(q, "cpd-weak")
        resonance = r.get("resonance_pct")
        resonance_str = f"{float(resonance):.0f}%" if resonance not in (None, "") else "單一節點"

        dep = dep_by_chain.get(chain)
        coherence_pct = float(dep["upstream_coherence_pct"]) if dep and dep.get("upstream_coherence_pct") not in (None, "") else None
        coherence_str = f"{coherence_pct:.0f}%" if coherence_pct is not None else "—"
        # 跟舊版 chain_dependency_html() 的 ⚠️ 上游未確認 同一條規則：鏈本身已經
        # 確認、但加權後上游 coherence < 30% 才標——鏈本身就弱的話低 coherence
        # 是一致現象，不該額外警示（避免誤報）。
        warn = (' <span class="alert" title="這條鏈本身強勢，但依賴的上游鏈（加權後）大多還沒確認，可能是價格面單獨噴出">⚠️ 上游未確認</span>'
                if coherence_pct is not None and coherence_pct < 30 and q in ("🚀 Confirmed", "💰 Capital Leading") else "")

        lag_info = lag_by_chain.get(chain)
        if lag_info and lag_info["lags"]:
            avg_lag = sum(lag_info["lags"]) / len(lag_info["lags"])
            lag_str = f"{avg_lag:+.2f}（{lag_info['early_count']} 檔 EARLY）"
        else:
            lag_str = "—"

        rows_html.append(
            f'<tr><td><b>{escape(chain)}</b>{warn}</td>'
            f'<td><span class="cpd {cls}">{escape(q)}</span></td>'
            f'<td class="n">{resonance_str}</td>'
            f'<td class="n">{coherence_str}</td>'
            f'<td class="n">{escape(lag_str)}</td></tr>'
        )
    return f'''
    <table>
      <thead>
        <tr><th>Chain</th><th title="CPD 象限狀態">State</th>
            <th class="n" title="鏈內不同節點類型有幾成平均 point 轉正">Node Resonance</th>
            <th class="n" title="上游依賴鏈的加權確認度（WeightedCoherence）">Upstream Coherence</th>
            <th class="n" title="鏈內成分股 Price Lag 平均值 + 幾檔標記 EARLY">Price Lag（平均）</th></tr>
      </thead>
      <tbody>{"".join(rows_html)}</tbody>
    </table>'''


EXPLOSIVE_BUCKET_ORDER = ["🚀 暴漲中", "🎯 潛在暴漲", "🔥 追高風險"]
EXPLOSIVE_BUCKET_CLS = {"🚀 暴漲中": "boom", "🎯 潛在暴漲": "cand", "🔥 追高風險": "risk"}


def _explosive_buckets(all_rows):
    """暴漲候選池的分桶 + 排序邏輯，抽成共用函式給精簡版（首頁）跟完整版
    （detail）共用，避免兩份幾乎一樣的邏輯各自維護一次排序規則。"""
    buckets = {k: [] for k in EXPLOSIVE_BUCKET_ORDER}
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
    return buckets


def explosive_pool_html(all_rows, top_n=FRONT_PAGE_TOP_N):
    """精簡版：每桶最多 top_n 檔（首頁用）。完整清單見 explosive_pool_full_html()
    （放在 <details> 裡，不佔首屏版面，但資料完全沒有被丟掉）。"""
    buckets = _explosive_buckets(all_rows)
    cols = []
    for label, rows in buckets.items():
        items = "".join(
            f'<li><b>{escape(r.get("stock_id",""))}</b> '
            f'<span class="sec">{escape((r.get("stock_name") or "")[:12])}</span>'
            f'<span>{num(r.get("cum_ret_4w"), 1, pct=True, sign=True)}</span></li>'
            for r in rows[:top_n]
        ) or '<li class="empty">今日無</li>'
        cols.append(f'''
        <div class="expcol {EXPLOSIVE_BUCKET_CLS[label]}">
          <h4>{label}<span class="cnt">{len(rows)}</span></h4>
          <ul>{items}</ul>
        </div>''')
    return "".join(cols)


def explosive_pool_full_html(all_rows):
    """完整版：三桶各自的全部股票，一桶一張表，供 <details> 展開查看。"""
    buckets = _explosive_buckets(all_rows)
    sections = []
    for label in EXPLOSIVE_BUCKET_ORDER:
        rows = buckets[label]
        if not rows:
            sections.append(f'<h4 style="margin:12px 0 4px;">{label}（0 檔）</h4><p class="empty">今日無</p>')
            continue
        body = "".join(
            f'<tr><td><b>{escape(r.get("stock_id",""))}</b> '
            f'<span class="dim">{escape((r.get("stock_name") or "")[:16])}</span></td>'
            f'<td>{escape(r.get("sector",""))}</td>'
            f'<td class="n">{num(r.get("cum_ret_4w"), 1, pct=True, sign=True)}</td>'
            f'<td class="n">{num(r.get("cum_ret_26w"), 1, pct=True, sign=True)}</td></tr>'
            for r in rows
        )
        sections.append(f'''
        <h4 style="margin:12px 0 4px;">{label}（{len(rows)} 檔）</h4>
        <table>
          <thead><tr><th>Stock</th><th>Sector</th><th class="n">4W</th><th class="n">26W</th></tr></thead>
          <tbody>{body}</tbody>
        </table>''')
    return "".join(sections)


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
  tr.thin-sector { font-style:italic; color:var(--muted); }
  tr.thin-sector td { color:var(--muted); }
  tr.thin-sector .cpd, tr.thin-sector .up, tr.thin-sector .down { opacity:.7; }
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
  .cpd-overheat { background:#fecaca; color:#7f1d1d; border:1px solid #ef4444; font-weight:700; }
  .trans { display:inline-block; padding:1px 6px; border-radius:8px; font-size:11px; font-weight:700; }
  .trans-adv { background:#dcfce7; color:#166534; }
  .trans-rev { background:#fee2e2; color:#991b1b; }
  .trans-steady { background:#f3f4f6; color:#6b7280; }
  .trans-new { background:#f3f4f6; color:#9ca3af; }
  .cpdcols { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; }
  @media(max-width:640px) { .cpdcols { grid-template-columns:1fr; } }
  .cpdcol { background:#f9fafb; border-radius:8px; padding:10px 12px; border-left:3px solid var(--muted); }
  .cpdcol.leading { border-left-color:#f59e0b; background:#fffbeb; }
  .cpdcol.confirmed { border-left-color:#22c55e; background:#f0fdf4; }
  .cpdcol.warn { border-left-color:#ef4444; background:#fef2f2; }
  .cpdcol.weak { border-left-color:#94a3b8; background:#f9fafb; }
  .cpdcol.overheat { border-left-color:#b91c1c; background:#fef2f2; }
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
  .deplist { margin:0; padding:0; list-style:none; font-size:13px; }
  .deplist li { padding:6px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:8px; }
  .deplist li:last-child { border-bottom:none; }
  .deplist li > span:last-child { margin-left:auto; font-weight:700; }
  .foot {
    background:var(--card); border-radius:10px; padding:16px 20px;
    margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    text-align:center; font-size:12px; color:var(--muted);
  }
  .foot a { color:var(--navy); text-decoration:none; border-bottom:1px dotted var(--navy); }

  /* 首頁「決策儀表板」區塊：TODAY'S SIGNAL / MONEY IS MOVING / RISK /
     OPPORTUNITY / SECTOR MAP。跟下面 <details> 的「證據層」共用 .card 外觀，
     只是內容精簡很多，不是另一套視覺語言。 */
  .fpgrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  @media(max-width:800px) { .fpgrid { grid-template-columns:1fr; } }
  .fpsignal { margin:0; padding:0; list-style:none; font-size:13px; }
  .fpsignal li { padding:6px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  .fpsignal li:last-child { border-bottom:none; }
  .fpsignal li > b { flex:1; }
  .fpnames { margin:0; padding:0; list-style:none; font-size:13px; columns:2; column-gap:16px; }
  .fpnames li { padding:4px 0; display:flex; align-items:center; justify-content:space-between; gap:8px; break-inside:avoid; }
  .fpsectormap { columns:3; }
  @media(max-width:800px) { .fpsectormap { columns:2; } }
  @media(max-width:500px) { .fpnames { columns:1; } .fpsectormap { columns:1; } }

  /* <details> 證據層：跟 .card 同一套外觀，summary 取代 .card-h 當摺疊把手。 */
  details.card { padding:0; }
  details.card > summary {
    background:var(--navy); color:#fff; padding:10px 18px; font-size:13.5px; font-weight:700;
    letter-spacing:.5px; cursor:pointer; list-style:none; display:flex; align-items:center;
    justify-content:space-between; gap:8px;
  }
  details.card > summary::-webkit-details-marker { display:none; }
  details.card > summary::after { content:"點擊展開 ▾"; font-size:11px; font-weight:400; opacity:.75; }
  details.card[open] > summary::after { content:"收合 ▴"; }
  details.card > summary .n { background:var(--gold); color:var(--navy-d); font-size:11px; padding:2px 8px; border-radius:10px; }
  details.card > .card-b { padding:14px 18px; }
'''


def render(scorecard, stage2):
    as_of = scorecard.get("as_of_date")
    rows = scorecard.get("rows") or []
    rows_sorted = sorted(rows, key=lambda r: -(r.get("point") or 0))
    market = scorecard.get("market_snapshot") or {}
    market_label = "TAIEX（官方指數）" if market.get("proxy") == "TAIEX" else "0050（TAIEX 代理）"
    all_rows = load_all_stocks(as_of)
    top_stocks = (stage2.get("top3", {}) or {}).get("composite", [])

    chain_rows = load_chain_scorecard(as_of)
    chain_rows_sorted = sorted(chain_rows, key=lambda r: -(float(r.get("point") or 0)))
    chain_dep_rows = load_chain_dependency(as_of)
    chain_lag_rows = load_chain_price_lag(as_of)
    chain_coverage_note = ""
    pv_summary = {"total": 0, "mapped": 0, "unmapped": 0, "by_sector": []}
    pv_chain_summary_data = {"total_rows": 0, "stock_count": 0, "by_chain": []}
    pv_down_summary = {"total": 0, "mapped": 0, "unmapped": 0, "by_sector": []}
    pv_down_chain_summary_data = {"total_rows": 0, "stock_count": 0, "by_chain": []}
    mapping_df = None
    cov = None
    if all_rows:
        try:
            mapping_df = tim.load_mapping()
            cov = tim.coverage_report(mapping_df, [r.get("stock_id") for r in all_rows])
            chain_coverage_note = (f"Phase 2 產業鏈研究池：{cov['covered_in_universe']} 檔／"
                                    f"{cov['universe_size']} 檔市場池。Phase 2 僅納入具產業鏈研究"
                                    f"價值與流動性的核心股票；其餘股票仍完整參與 Phase 1 市場／板塊／"
                                    f"個股感測，未納入不代表資料缺失。")
            pv_summary = pv_market_summary(all_rows, mapping_df, pv_state="P+V+")
            pv_chain_summary_data = pv_chain_summary(all_rows, mapping_df, pv_state="P+V+")
            pv_down_summary = pv_market_summary(all_rows, mapping_df, pv_state="P-V+")
            pv_down_chain_summary_data = pv_chain_summary(all_rows, mapping_df, pv_state="P-V+")
        except Exception:
            chain_coverage_note = ""

    sector_rows_html = "".join(sector_row(r, i) for i, r in enumerate(rows_sorted)) \
        or '<tr><td colspan="7" class="empty">今日無板塊資料</td></tr>'

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
        or '<tr><td colspan="12" class="empty">今日無個股資料</td></tr>'

    # 領先/落後板塊只從 n>=3（至少 3 檔成分股）的板塊裡挑——n=1/n=2 的「板塊」point
    # 其實就是單一個股的走勢，不是真正的板塊性訊號，選進 TL;DR headline 會誤導使用者
    # 去追一個不存在的「板塊趨勢」。
    tldr_candidates = [r for r in rows_sorted if int(r.get("stock_count") or 0) >= 3]
    leader = tldr_candidates[0] if tldr_candidates else None
    laggard = tldr_candidates[-1] if tldr_candidates else None
    tldr_parts = []
    if leader:
        tldr_parts.append(f"領先板塊：{leader['sector']}（point {num(leader.get('point'),1)}）")
    if laggard and laggard is not leader:
        tldr_parts.append(f"落後板塊：{laggard['sector']}（point {num(laggard.get('point'),1)}）")
    tldr = " · ".join(tldr_parts) if tldr_parts else "板塊成分股數都太少（n<3），無足夠寬度的領先/落後訊號"

    failed = scorecard.get("failed_tickers") or []
    budget = scorecard.get("request_budget_used")
    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    universe_n = sum(int(r.get("stock_count", 0)) for r in rows) if rows else 0
    chain_universe_str = (f"{cov['covered_in_universe']} / {cov['universe_size']}"
                           if cov else "—")

    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>台股產業鏈資金雷達 · {as_of}</title>
<style>{CSS}</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">TW</div>
    <div class="htitle">
      <span class="tag">PHASE 2.1 · BETA</span>
      <h1>🇹🇼 台股產業鏈資金雷達 · {as_of}</h1>
      <p>資料源：FinMind + yfinance · 首頁只回答「今天要注意什麼」，完整證據收在下方
         各張「點擊展開」的卡片裡，資料完全沒有刪減</p>
    </div>
  </div>

  <div class="snap">
    <div class="snap-cell">
      <div class="l">{market_label}</div>
      <div class="v">{num(market.get("price"), 2)}</div>
      <div class="s">60d {num(market.get("vs_60d_pct"), 2, pct=True, sign=True)} · {market.get("trend_label","—")}</div>
    </div>
    <div class="snap-cell">
      <div class="l">Market Universe</div>
      <div class="v">{universe_n or "—"}</div>
      <div class="s">{len(rows)} 個 industry_category（Phase 1，全部參與）</div>
    </div>
    <div class="snap-cell">
      <div class="l">Chain Universe</div>
      <div class="v">{chain_universe_str}</div>
      <div class="s">Phase 2 策略性研究池（不是資料缺失）</div>
    </div>
  </div>

  <div class="tldr"><b>TL;DR</b>　{escape(tldr)}</div>

  <div class="card">
    <div class="card-h">🔥 TODAY'S SIGNAL<span class="n" title="今天 Point 最高的前 5 條供應鏈，附狀態與 Transition 方向——哪些產業鏈正在形成，不是哪個 Point 最高就買哪個">Top {FRONT_PAGE_TOP_N} 供應鏈</span></div>
    <div class="card-b">
      {today_signal_html(chain_rows_sorted)}
    </div>
  </div>

  <div class="fpgrid">
    <div class="card">
      <div class="card-h">💰 MONEY IS MOVING<span class="n" title="資金已經進場、價格還沒完全反映——CPD 狀態為 Capital Leading 的鏈">早期階段</span></div>
      <div class="card-b">{money_moving_html(chain_rows_sorted)}</div>
    </div>
    <div class="card">
      <div class="card-h">⚠️ RISK<span class="n" title="Price Leading（價格已動、法人沒跟）+ Overheated（過熱/出貨徵兆）——小心，不是進場訊號">追高風險</span></div>
      <div class="card-b">{risk_chains_html(chain_rows_sorted)}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-h">🎯 OPPORTUNITY<span class="n" title="🚀 突破：explosive_verdict=暴漲中（Layer 2 純價量訊號）；🎯 早期：Price Lag 標記 EARLY（鏈已確認、股票鏈內還沒漲上來）。合併既有兩個訊號，不是新公式，不構成買賣建議">突破 + 早期機會</span></div>
    <div class="card-b" style="padding:0;">
      {opportunity_html(all_rows, chain_lag_rows, mapping_df)}
    </div>
  </div>

  <div class="card">
    <div class="card-h">🧭 SECTOR MAP<span class="n" title="板塊名稱 + 狀態圖示，數字在下方「Sector Detail」裡">{len(rows_sorted)} 板塊</span></div>
    <div class="card-b">
      {sector_map_html(rows_sorted)}
    </div>
  </div>

  <details class="card">
    <summary>📊 Sector Detail<span class="n">{len(rows)} 板塊完整數據 + CPD 象限</span></summary>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector</th><th class="n">Point</th>
              <th class="n" title="今日 point - 過去 5 日 point 均值 · 首次執行前 5 天沒歷史資料會是 —">加速度</th>
              <th class="n" title="板塊內 4W 累報 > 0 的股票比例">寬度</th>
              <th class="n" title="板塊內所有個股三大法人 20 日淨買賣加總（依最新收盤價換算金額）">法人 20d 淨買（金額）</th>
              <th class="n" title="法人 20d 淨買金額 ÷ 板塊成分股數——原始總額板塊間不能直接比大小（成分股數量差很多），這欄才是可以跨板塊比較的正規化指標">平均每檔淨買</th>
              <th title="CPD = Z(法人金額) - Z(SectorPoint)，跨板塊橫斷面相對排名，非嚴謹統計顯著性。💰 Capital Leading = 資金先進、價格尚未反映（狩獵區）· 🔥 Overheated = 連兩日 Confirmed 但寬度下滑，過熱/出貨徵兆">狀態</th>
              <th title="Transition Sensor：昨天 → 今天板塊移動到哪個狀態，比單看今天排名更早看出正在推進還是退燒">轉移</th></tr>
        </thead>
        <tbody>{sector_rows_html}</tbody>
      </table>
    </div>
    <div class="card-b">
      <h4 style="margin:0 0 10px;color:var(--navy);">🧭 資金-價格背離象限（CPD）· 跨板塊橫斷面相對排名</h4>
      <div class="cpdcols">{cpd_matrix_html(rows_sorted)}</div>
    </div>
  </details>

  <div class="card">
    <div class="card-h">🔗 產業鏈雷達（Phase 2 · IndustryMappingTable）<span class="n">{len(chain_rows_sorted)}</span></div>
    <div class="card-b" style="padding:0;">
      {chain_table_html(chain_rows_sorted, chain_coverage_note)}
    </div>
  </div>

  <details class="card">
    <summary>🔬 Chain Diagnostics<span class="n" title="Node Resonance / Upstream Coherence / Price Lag 三個既有指標合併成同一條鏈的完整診斷檔案">同步度 + 共振 + Price Lag 合併</span></summary>
    <div class="card-b" style="padding:0;">
      {chain_diagnostics_html(chain_rows_sorted, chain_dep_rows, chain_lag_rows)}
    </div>
  </details>

  <div class="card">
    <div class="card-h">🎯 早期機會（Price Lag）<span class="n" title="PriceLag = Z(鏈強度，vs. 其他鏈) − Z(股票鏈內強度，vs. 鏈內同儕)。只列鏈本身已經 🚀 Confirmed／💰 Capital Leading、但這檔股票在鏈內還沒漲上來的組合——鏈的論點還在，股票還沒反映，不是買賣建議">Phase 2.1</span></div>
    <div class="card-b">
      {price_lag_html(chain_lag_rows)}
    </div>
  </div>

  <div class="card">
    <div class="card-h">💥 暴漲候選池（Top {FRONT_PAGE_TOP_N} / 桶）</div>
    <div class="card-b">
      <div class="expcols">{explosive_pool_html(all_rows)}</div>
    </div>
  </div>

  <details class="card">
    <summary>💥 暴漲候選池（完整清單）<span class="n">全股票池</span></summary>
    <div class="card-b">
      {explosive_pool_full_html(all_rows)}
    </div>
  </details>

  <details class="card">
    <summary>📈 Stock Detail<span class="n">各板塊 Top 3 · {len(top_stocks_sorted)} 檔</span></summary>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Symbol / Name</th><th>Sector</th><th class="n">Point</th><th class="n">vp</th>
              <th class="n">4W</th><th class="n">13W</th><th class="n">26W</th><th>Alert</th>
              <th title="Dow Theory 頭頭低/底底高">Dow</th><th>量價象限</th><th>暴漲判定</th>
              <th class="n" title="三大法人 20 日淨買賣（依最新收盤價換算金額）">法人 20d</th></tr>
        </thead>
        <tbody>{top_rows_html}</tbody>
      </table>
    </div>
  </details>

  {inst_flow_leaderboard_html(all_rows)}

  <details class="card">
    <summary>📊 更多統計：量漲/量跌總結<span class="n">Phase 1 全市場 + Phase 2 供應鏈 × 量漲價漲/量漲價跌</span></summary>
    <div class="card-b" style="padding:0;">
      <h4 style="margin:14px 18px 4px;color:var(--navy);">📊 Phase 1 全市場量漲價漲</h4>
      {pv_market_summary_html(pv_summary)}
      <h4 style="margin:18px 18px 4px;color:var(--navy);">🔗 Phase 2 供應鏈量漲價漲</h4>
      {pv_chain_summary_html(pv_chain_summary_data)}
      <h4 style="margin:18px 18px 4px;color:var(--navy);">📉 Phase 1 全市場量漲價跌</h4>
      {pv_market_summary_html(pv_down_summary, pv_state="P-V+")}
      <h4 style="margin:18px 18px 4px;color:var(--navy);">⚠️ Phase 2 供應鏈量漲價跌</h4>
      {pv_chain_summary_html(pv_down_chain_summary_data, pv_state="P-V+")}
    </div>
  </details>

  <div class="foot">
    產生時間 {gen_ts} · FinMind 額度用量 {budget if budget is not None else "—"} / 300 次/小時 ·
    失敗 {len(failed)} 檔 · Phase 1（Layer 0-3，官方粗分類）+ Phase 2（IndustryMappingTable）+
    Phase 2.1（Price Lag）·
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
