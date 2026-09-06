#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_daily_report_tw_v2.py · 台股「資金 × 量價交叉雷達」（新版，不動舊版）
======================================================
使用者對美股 v2（Regime→Sector→Capital→PriceLag→Opportunity）做完 PM 驗收後，
提議台股也做一版對照。討論過程中使用者自己兩次修正方向：
  第一版提案：Regime/Sector State/Chain State/Capital Propagation/Stock State/
    Price Lag 六層獨立模組——結構跟美股不一致，Chain 被當成第三個決策維度。
  第二版（最終定案）：Taiwan V2 = Capital × Price-Volume Cross Radar。
    只留兩個正交的「鏡頭」——資金鏡頭 + 量價鏡頭——交叉出 Stock State，
    Chain 降級成資金鏡頭裡的一個解析度（Market→Sector→Chain→Stock 都是同一種
    資金訊號的不同粒度，不是三個獨立訊號），Regime 維持獨立 Gate（這版還沒做，
    下一階段才加）。

這份是新增的第二版報表，明確「保留原有、新增一版」——完全不修改
generate_daily_report_tw.py / daily-tw-latest.html。

關鍵發現（讓這版完全不用新抓資料）：
  台股的個股層級本來就有法人資金欄位（inst_total_net_20d_est_NTD_M，
  Layer 3 逐股抓的，不是只有 sector/chain 聚合值），跟量價分類欄位
  （pv_verdict/trend_state/explosive_verdict，跟美股版共用同一套判定邏輯）
  都已經在 tw_{date}_all.csv 裡——這個 Cross Matrix 100% 用現有資料做，
  不需要像 Regime Gate 那樣另外抓 10 年歷史。

兩個鏡頭怎麼算：
  資金鏡頭：inst_total_net_20d_est_NTD_M 對當日全市場股票池做橫斷面
    Z-score（跟 tw_cpd.py 的 add_sector_cpd() 同一個手法，只是分組從
    「sector/chain」換成「個股 vs 當日全市場」），分 5 級 ↑↑/↑/→/↓/↓↓。
  量價鏡頭：直接讀 pv_verdict，用 generate_daily_report.py 現成的
    PV_SCORE_MAP（0~14 分，早就驗證過的量價評分）分 5 級，不重新設計評分。

交叉矩陣（使用者最終拍板的 4×2 表，畫在下面 CROSS_MATRIX 常數旁的註解）：
  資金 ↑↑/↑ 這兩級收斂成兩「行」（↑↑ 一行、↑ 一行），量價收斂成「弱/強」
  兩欄，交叉出 EARLY/WATCH/CONFIRMED/MATURE/WAIT/REJECT/DISTRIBUTION 七態。

結構性否決（使用者在更早一輪提過的 OVERHEATED「方向正確但位置錯誤」，
矩陣本身抓不到，用既有欄位另外覆蓋，不進矩陣參與排列）：
  trend_state == 空頭 → REJECT（Dow 結構已破壞，跟矩陣結果無關）
  explosive_verdict == 🔥 追高風險 → OVERHEATED（已經追高，矩陣算出來的
    CONFIRMED/EARLY 都不該蓋過這個風險旗標）

V1 Context 接回來（使用者第二輪反饋）：
  單獨一個 Stock State（例如 EARLY）不夠——「有錢在進但股價還沒確認」，
  不知道這筆錢在哪裡。使用者的框架：V1 負責「找戰場」（Market→Sector→
  Chain→資金方向），V2 負責「找戰場裡真正發生共振的股票」（Capital×PV→
  Stock State）。兩者不合併成一份報表，而是讓 V2 的每一列都帶出它的
  V1 Context（Sector / Chain / Chain State），形成 1066 檔市場股票 →
  25 條 Chain → 612 檔法人池 → 最終機會股 的可解釋證據鏈。

  Chain：重用 generate_daily_report_tw.py 的 _chain_for_ticker()（查
  IndustryMappingTable，many-to-many 取第一條，跟既有「機會清單」卡片
  同一個查法，不重寫）。查不到映射的股票（IndustryMappingTable 還沒
  覆蓋到）Chain 顯示「—」，不假裝有鏈。
  Chain State：重用 tw_industry_mapping.aggregate_supply_chains() 已經
  算好的 market_state（tw_{date}_chains.csv 裡的欄位，是 CPD quadrant
  再疊加健康度標籤後的精煉版，跟使用者範例表「Thermal → Overheated」
  用的是同一個欄位）。

Regime Gate（使用者第三輪反饋）：
  TAIEX 10-15 年歷史回測 + 今日 regime 分類 + Regime Edge，完全比照美股
  sector_scorecard.py 的 compute_regime_stats()（3 條件：>60日前價/50MA
  向上/200MA向上），同一個思考語法。刻意不用 FinMind 抓歷史——FinMind
  免費 tier 額度已經被 tw_sector_pipeline.py 的 Layer 3 法人資料用到
  接近上限（300 次/小時 vs 預設 300 檔股票池 ≈ 301 次），Regime 回測
  需要一次抓長歷史，不該再去擠這個額度、傷到 V1 每天在用的法人資料。
  改用 TW Market Data（TWMARKETDATA_API_KEY，跟 FinMind 完全獨立的另一組
  配額，1 次 request/次執行）——沒設金鑰或歷史深度不夠時，
  compute_regime_stats_tw() 誠實回 None，這裡的 regime_gate_tw() 顯示
  UNKNOWN，不假裝算出東西。新增 scripts/tw_regime_snapshot.py 當獨立的
  CLI 進入點（不進 tw_sector_pipeline.py 的 main() 主線，V1 完全不受
  影響），輸出 tw_regime_stats_latest.json。

沒做的部分（跟使用者確認過，留待後續）：
  - Capital Acceleration（Δ 資金狀態 vs 前一交易日快照）：下一階段做
  - Sector Lag / Chain Lag 雙層比較：Chain Price Lag 已經在
    tw_industry_mapping.py 裡（compute_chain_price_lag），這版沒有把它
    跟 Sector Price Lag 放在一起比較

輸出：
  sector-rotation/reports/daily-tw-v2-YYYY-MM-DD.html
  sector-rotation/reports/daily-tw-v2-latest.html

用法：
  python scripts/generate_daily_report_tw_v2.py
"""
import os
import sys
from datetime import datetime, timezone
from html import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_daily_report_tw as gdrtw  # noqa: E402  重用 load_json/load_all_stocks/CSS/_chain_for_ticker
import tw_industry_mapping as tim  # noqa: E402  重用 load_mapping()，查股票所屬 supply_chain
from generate_daily_report import PV_SCORE_MAP  # noqa: E402  重用既有量價評分，不重新設計

DATA_DIR = gdrtw.DATA_DIR
REPORTS_DIR = gdrtw.REPORTS_DIR
SCORECARD = gdrtw.SCORECARD
STAGE2 = gdrtw.STAGE2
REGIME_STATS_PATH = os.path.join(DATA_DIR, "tw_regime_stats_latest.json")  # scripts/tw_regime_snapshot.py 的輸出


# ============================================================
# 0. Regime Gate：TAIEX 10-15 年回測，跟美股同一套方法論（3 條件 4 級 +
#    Regime Edge），不是新規則。TAIEX 沒有 VIX 對應物，這版沒有 override。
# ============================================================
REGIME_RISK_LABEL_TW = {
    "🟢 多頭": ("🟢", "RISK-ON"),
    "🟡 中性": ("🟡", "NEUTRAL"),
    "🟠 警戒": ("🟠", "CAUTION"),
    "🔴 空頭": ("🔴", "RISK-OFF"),
}


def load_regime_stats_tw():
    return gdrtw.load_json(REGIME_STATS_PATH)


def regime_gate_tw(regime_stats):
    """把 tw_regime_snapshot.py 算好的 TAIEX regime_stats 包裝成 Risk-On/
    Neutral/Caution/Risk-Off，跟美股 generate_daily_report_v2.py 的
    regime_gate() 同一套邏輯（Regime 是 Gate 不是乘數）。regime_stats 是
    None（還沒跑過 tw_regime_snapshot.py，或 TW Market Data 沒設金鑰/
    歷史深度不夠）時誠實回 UNKNOWN，不假裝算出東西。"""
    regime_stats = regime_stats or {}
    current_regime = regime_stats.get("current_regime")
    current_stats = regime_stats.get("current") or {}
    unconditional_stats = regime_stats.get("unconditional") or {}

    if current_regime in REGIME_RISK_LABEL_TW:
        icon, label = REGIME_RISK_LABEL_TW[current_regime]
        note = f"TAIEX regime={current_regime}（3 條件：>60日前價/50MA向上/200MA向上）"
    else:
        icon, label = "⚪", "UNKNOWN"
        note = "tw_regime_stats_latest.json 還沒有資料（TW Market Data 未設金鑰，或歷史深度不夠）"

    edge_mean = edge_win_rate = None
    if current_stats.get("mean") is not None and unconditional_stats.get("mean") is not None:
        edge_mean = round(current_stats["mean"] - unconditional_stats["mean"], 2)
    if current_stats.get("win_rate") is not None and unconditional_stats.get("win_rate") is not None:
        edge_win_rate = round(current_stats["win_rate"] - unconditional_stats["win_rate"], 1)

    return {
        "icon": icon, "label": label, "current_regime": current_regime, "note": note,
        "historical_n": current_stats.get("n"), "historical_mean": current_stats.get("mean"),
        "historical_win_rate": current_stats.get("win_rate"),
        "baseline_n": unconditional_stats.get("n"), "baseline_mean": unconditional_stats.get("mean"),
        "baseline_win_rate": unconditional_stats.get("win_rate"),
        "edge_mean": edge_mean, "edge_win_rate": edge_win_rate,
    }


def regime_banner_html(regime):
    cls = {"RISK-ON": "regime-on", "NEUTRAL": "regime-neutral", "CAUTION": "regime-caution",
           "RISK-OFF": "regime-off"}.get(regime["label"], "regime-unknown")
    hist = ""
    if regime.get("historical_n"):
        hist = (f' · 歷史同 regime 出現 {regime["historical_n"]} 次，20 日後平均 '
                f'{regime["historical_mean"]:+.2f}%，勝率 {regime["historical_win_rate"]:.1f}%')
    edge = ""
    if regime.get("edge_mean") is not None:
        edge = (f' <span title="Baseline：不分 regime、全樣本 n={regime.get("baseline_n","—")} '
                f'的 20 日後平均 {regime.get("baseline_mean",0):+.2f}%，勝率 '
                f'{regime.get("baseline_win_rate",0):.1f}%">· Regime Edge '
                f'{regime["edge_mean"]:+.2f}pp'
                + (f' / 勝率 {regime["edge_win_rate"]:+.1f}pp' if regime.get("edge_win_rate") is not None else "")
                + '</span>')
    return f'''
  <div class="regime-banner {cls}">
    <div>{regime["icon"]} <b>{escape(regime["label"])}</b></div>
    <div class="sub">{escape(regime.get("note") or "")}{hist}{edge}</div>
  </div>'''


# ============================================================
# 1. 資金鏡頭：inst_total_net_20d_est_NTD_M 橫斷面 Z-score → 5 級
# ============================================================
CAPITAL_LEVELS = [
    (1.0, "↑↑", "加速流入"),
    (0.3, "↑", "流入"),
    (-0.3, "→", "中性"),
    (-1.0, "↓", "減速"),
    (float("-inf"), "↓↓", "流出"),
]


def _zscore(values):
    n = len(values)
    if n < 2:
        return [0.0] * n
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n
    std = var ** 0.5
    if not std:
        return [0.0] * n
    return [(v - mean) / std for v in values]


def capital_level(z):
    for threshold, icon, label in CAPITAL_LEVELS:
        if z >= threshold:
            return icon, label
    return "↓↓", "流出"


# ============================================================
# 2. 量價鏡頭：pv_verdict → PV_SCORE_MAP（既有 0~14 分）→ 5 級
# ============================================================
PV_LEVELS = [
    (12, "↑↑", "強勢"),
    (9, "↑", "改善"),
    (4, "→", "中性"),
    (2, "↓", "弱化"),
    (float("-inf"), "↓↓", "破壞"),
]


def pv_level(pv_verdict):
    score = PV_SCORE_MAP.get(pv_verdict, 5)
    for threshold, icon, label in PV_LEVELS:
        if score >= threshold:
            return icon, label, score
    return "↓↓", "破壞", score


# ============================================================
# 3. Cross Matrix：資金 4 檔（↑↑/↑ 各一行，↓/↓↓ 合併一行）× 量價 2 欄（弱/強）
#    使用者拍板的表（← 弱 · 強 →）：
#      資金 ↑↑   EARLY        CONFIRMED
#      資金 ↑    WATCH        CONFIRMED
#      資金 →    WAIT         MATURE
#      資金 ↓/↓↓ REJECT       DISTRIBUTION
#    「弱」= 量價 →/↓/↓↓（PV_SCORE 中性以下）；「強」= 量價 ↑↑/↑
# ============================================================
CROSS_MATRIX = {
    ("↑↑", "弱"): "EARLY",
    ("↑↑", "強"): "CONFIRMED",
    ("↑", "弱"): "WATCH",
    ("↑", "強"): "CONFIRMED",
    ("→", "弱"): "WAIT",
    ("→", "強"): "MATURE",
    ("↓", "弱"): "REJECT",
    ("↓", "強"): "DISTRIBUTION",
    ("↓↓", "弱"): "REJECT",
    ("↓↓", "強"): "DISTRIBUTION",
}

STATE_LABELS = {
    "EARLY": ("🎯", "EARLY · 資金先走，價量未確認"),
    "WATCH": ("👀", "WATCH · 資金溫和流入，觀察"),
    "CONFIRMED": ("🚀", "CONFIRMED · 資金價量同步確認"),
    "MATURE": ("🕰️", "MATURE · 價量在動，資金未增"),
    "WAIT": ("⏳", "WAIT · 雙平淡，無訊號"),
    "REJECT": ("🚫", "REJECT · 資金流出，不建議"),
    "DISTRIBUTION": ("⚠️", "DISTRIBUTION · 資金流出但價量還撐，出貨警訊"),
    "OVERHEATED": ("🔥", "OVERHEATED · 追高風險，方向對但位置錯"),
}
STATE_ORDER = ["EARLY", "WATCH", "CONFIRMED", "MATURE", "WAIT", "DISTRIBUTION", "OVERHEATED", "REJECT"]


def classify_cross_state(capital_icon, pv_icon, trend_state, explosive_verdict):
    """結構性否決先判斷（用既有欄位，不進矩陣排列）：
    trend_state=空頭 → REJECT；explosive_verdict=追高風險 → OVERHEATED。
    否則落回資金×量價矩陣。"""
    if trend_state == "空頭":
        return "REJECT"
    if explosive_verdict == "🔥 追高風險":
        return "OVERHEATED"
    weak_or_strong = "強" if pv_icon in ("↑↑", "↑") else "弱"
    return CROSS_MATRIX.get((capital_icon, weak_or_strong), "WAIT")


# ============================================================
# 3b. V1 Context：把 Sector / Chain / Chain State 接回每一列
# ============================================================
def load_v1_context(as_of):
    """讀 V1 已經算好的 IndustryMappingTable + 當日 Chain Scorecard，回傳
    (mapping_df, chain_state_by_name) 給 attach_v1_context() 查表用。
    兩者任一缺失都回傳空值，呼叫端會誠實顯示「—」，不是報錯。"""
    mapping_df = tim.load_mapping()
    chain_rows = gdrtw.load_chain_scorecard(as_of)
    chain_state_by_name = {r["supply_chain"]: r.get("market_state") for r in chain_rows}
    return mapping_df, chain_state_by_name


def attach_v1_context(cross_rows, mapping_df, chain_state_by_name):
    """幫每一列 Cross Matrix 結果接上 V1 的 Sector/Chain/Chain State——
    使用者的重點：單獨一個 EARLY 不夠，要知道「這筆錢在哪個戰場」。
    Chain 查不到映射、或查到的鏈今天沒有 Chain Scorecard（例如鏈裡股票
    池今天沒交集）時，兩個欄位都顯示「—」，不是空白也不是假資料。"""
    for r in cross_rows:
        chain = gdrtw._chain_for_ticker(r["stock_id"], mapping_df)
        r["chain"] = chain or "—"
        r["chain_state"] = (chain_state_by_name.get(chain) if chain else None) or "—"
    return cross_rows


def compute_capital_pv_cross(all_rows):
    """對當日全市場股票池算資金 Z-score + 量價分級 + 交叉狀態。
    inst_total_net_20d_est_NTD_M 缺值（法人資料抓取失敗的個股）直接跳過，
    不假裝有資金訊號——這是誠實反映資料缺口，不是漏算。"""
    valid = []
    for r in all_rows:
        raw = r.get("inst_total_net_20d_est_NTD_M")
        if raw in (None, "", "None"):
            continue
        try:
            capital_raw = float(raw)
        except (TypeError, ValueError):
            continue
        valid.append((r, capital_raw))

    if not valid:
        return []

    zs = _zscore([c for _, c in valid])
    results = []
    for (r, capital_raw), z in zip(valid, zs):
        cap_icon, cap_label = capital_level(z)
        pv_icon, pv_label, pv_score = pv_level(r.get("pv_verdict") or "")
        state = classify_cross_state(cap_icon, pv_icon, r.get("trend_state") or "",
                                      r.get("explosive_verdict") or "")
        results.append({
            "stock_id": r.get("stock_id", ""), "symbol": r.get("symbol") or r.get("stock_id", ""),
            "name": r.get("stock_name", ""), "sector": r.get("sector", ""),
            "capital_ntd_m": round(capital_raw, 1), "capital_z": round(z, 2),
            "capital_icon": cap_icon, "capital_label": cap_label,
            "pv_verdict": r.get("pv_verdict") or "", "pv_score": pv_score,
            "pv_icon": pv_icon, "pv_label": pv_label,
            "trend_state": r.get("trend_state") or "",
            "explosive_verdict": r.get("explosive_verdict") or "",
            "state": state,
        })
    return results


def group_by_state(rows, top_n=8):
    groups = {state: [] for state in STATE_ORDER}
    for r in rows:
        groups[r["state"]].append(r)
    for state in ("EARLY", "CONFIRMED", "WATCH", "MATURE"):
        groups[state].sort(key=lambda r: -r["capital_z"])
    for state in ("REJECT", "OVERHEATED", "DISTRIBUTION"):
        groups[state].sort(key=lambda r: r["capital_z"])
    for state in ("WAIT",):
        groups[state].sort(key=lambda r: -r["capital_z"])
    return {state: items[:top_n] for state, items in groups.items()}


# ============================================================
# HTML 渲染
# ============================================================
CSS = gdrtw.CSS if hasattr(gdrtw, "CSS") else ""

FRONT_CSS_EXTRA = '''
  .fpsignal { margin:0; padding:0; list-style:none; font-size:13px; }
  .fpsignal li { padding:6px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  .fpsignal li:last-child { border-bottom:none; }
  .fpsignal li > b { flex:1; }
  .fpsignal .empty { color:var(--muted); font-style:italic; padding:6px 0; }
  .regime-banner {
    padding:16px 22px; border-radius:10px; margin-bottom:14px; font-size:15px;
    display:flex; align-items:center; gap:16px; flex-wrap:wrap;
  }
  .regime-on { background:linear-gradient(90deg,#0f3d1f,#1e8449); color:#fff; }
  .regime-neutral { background:linear-gradient(90deg,#4a3c0f,#8a6d1a); color:#fff; }
  .regime-caution { background:linear-gradient(90deg,#5a2f0f,#b45309); color:#fff; }
  .regime-off { background:linear-gradient(90deg,#4a0f0f,#991b1b); color:#fff; }
  .regime-unknown { background:var(--muted); color:#fff; }
  .regime-banner b { font-size:20px; }
  .regime-banner .sub { font-size:12px; opacity:.85; }
'''


def _v1_context_row(r, state_icon):
    """使用者的重點表格列：股票 / Sector / Chain / Chain 狀態 / Capital / PV / 結論。
    Chain 查不到映射時顯示「—」，不是空白也不是假資料。"""
    return (
        f'<tr>'
        f'<td><b>{escape(r["symbol"])}</b> <span class="dim">{escape((r["name"] or "")[:10])}</span></td>'
        f'<td>{escape(r["sector"])}</td>'
        f'<td>{escape(r["chain"])}</td>'
        f'<td>{escape(r["chain_state"])}</td>'
        f'<td class="n" title="法人 20d 淨買估計金額 (NTD M) 的橫斷面 Z-score">{escape(r["capital_icon"])} '
        f'<span class="dim">z={r["capital_z"]:+.2f}</span></td>'
        f'<td title="{escape(r["pv_verdict"])}">{escape(r["pv_icon"])} <span class="dim">{escape(r["pv_label"])}</span></td>'
        f'<td class="tag">{state_icon}</td>'
        f'</tr>'
    )


def cross_state_html(groups):
    sections = []
    for state in STATE_ORDER:
        icon, label = STATE_LABELS[state]
        items = groups.get(state) or []
        if items:
            rows_html = "".join(_v1_context_row(r, icon) for r in items)
            table = (f'<table><thead><tr>'
                     f'<th>股票</th><th>Sector</th><th>Chain</th><th>Chain 狀態</th>'
                     f'<th class="n">Capital</th><th>PV</th><th>結論</th>'
                     f'</tr></thead><tbody>{rows_html}</tbody></table>')
        else:
            table = '<p class="empty">今日無</p>'
        sections.append(f'<h4 style="margin:14px 0 4px;">{icon} {label}<span class="dim">（{len(items)}）</span></h4>{table}')
    sections.append('<p class="dim" style="margin:10px 0 0;">資金鏡頭 × 量價鏡頭交叉出的狀態，'
                     '不是加權分數；REJECT（Dow 結構空頭）跟 OVERHEATED（追高風險）是結構性否決，'
                     '不進矩陣排列。Chain / Chain 狀態是接回來的 V1 Context——V1 負責找戰場'
                     '（Sector/Chain 資金方向），V2 負責找戰場裡真正發生共振的股票，兩者不合併成一份報表，'
                     '只是讓每一列都帶出它的戰場脈絡。Regime Gate 跟 Capital Acceleration 下一階段才加。</p>')
    return "".join(sections)


def render_v2(scorecard, stage2):
    as_of = (scorecard or {}).get("as_of_date") or (stage2 or {}).get("as_of_date")
    all_rows = gdrtw.load_all_stocks(as_of)
    cross_rows = compute_capital_pv_cross(all_rows)
    mapping_df, chain_state_by_name = load_v1_context(as_of)
    cross_rows = attach_v1_context(cross_rows, mapping_df, chain_state_by_name)
    groups = group_by_state(cross_rows)
    regime = regime_gate_tw(load_regime_stats_tw())

    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    universe_note = (f'{len(cross_rows)} 檔有法人資料（全池 {len(all_rows)} 檔）'
                      if all_rows else '今日無股票池資料')

    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>台股資金雷達 · {as_of or "—"}</title>
<style>{CSS}{FRONT_CSS_EXTRA}</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">TW</div>
    <div class="htitle">
      <span class="tag">V2 · BETA</span>
      <h1>🇹🇼 台股資金 × 量價交叉雷達 · {as_of or "—"}</h1>
      <p>Capital Lens × Price-Volume Lens → Stock State。這是新增的第二版報表，
         跟現有 daily-tw-latest.html 並存，不取代它——資料源完全相同
         （tw_scorecard_latest.json / tw_latest.json / tw_{{date}}_all.csv），
         沒有重抓任何資料。</p>
    </div>
  </div>

  {regime_banner_html(regime)}

  <div class="card">
    <div class="card-h">🧭 CAPITAL × PRICE-VOLUME CROSS<span class="n" title="每一列都帶出 V1 Context（Sector/Chain/Chain 狀態）——V1 找戰場，V2 找戰場裡真正共振的股票">{universe_note} · 含 V1 Context</span></div>
    <div class="card-b">{cross_state_html(groups)}</div>
  </div>

  <div class="foot">
    產生時間 {gen_ts} · 資金鏡頭：法人 20 日淨買估計金額橫斷面 Z-score ·
    量價鏡頭：既有 pv_verdict 透過 PV_SCORE_MAP 分級 · 兩者交叉出 Stock State，
    不是加權分數 ·
    <a href="daily-tw-latest.html">看原版台股報表</a>
    <br><br>
    <span style="color:#94a3b8;">投資有風險 · 本報告為系統化訊號記錄 · 不構成投資建議</span>
  </div>

</div>
</body>
</html>'''

    os.makedirs(REPORTS_DIR, exist_ok=True)
    dated_path = os.path.join(REPORTS_DIR, f"daily-tw-v2-{as_of}.html")
    latest_path = os.path.join(REPORTS_DIR, "daily-tw-v2-latest.html")
    with open(dated_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)
    return dated_path, latest_path


def main():
    scorecard = gdrtw.load_json(SCORECARD)
    if not scorecard:
        sys.exit(f"❌ 沒 {SCORECARD} · 先跑 tw_sector_pipeline.py")
    stage2 = gdrtw.load_json(STAGE2) or {}
    dated, latest = render_v2(scorecard, stage2)
    print(f"✅ 產生 {dated}")
    print(f"✅ 覆寫 {latest}")


if __name__ == "__main__":
    main()
