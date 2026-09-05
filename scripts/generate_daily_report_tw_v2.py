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

沒做的部分（跟使用者確認過，留待後續）：
  - Regime Gate（TAIEX/0050 10 年歷史回測 + Regime Edge）：需要另外抓
    0050 20 年歷史（FinMind 可以抓到，但跟 Cross Matrix 用的每日 all.csv
    是不同規模的資料工程），下一階段做
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
import generate_daily_report_tw as gdrtw  # noqa: E402  重用 load_json/load_all_stocks/CSS
from generate_daily_report import PV_SCORE_MAP  # noqa: E402  重用既有量價評分，不重新設計

DATA_DIR = gdrtw.DATA_DIR
REPORTS_DIR = gdrtw.REPORTS_DIR
SCORECARD = gdrtw.SCORECARD
STAGE2 = gdrtw.STAGE2


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
'''


def cross_state_html(groups):
    sections = []
    for state in STATE_ORDER:
        icon, label = STATE_LABELS[state]
        items = groups.get(state) or []
        lis = "".join(
            f'<li><b>{escape(r["symbol"])}</b> <span class="dim">{escape((r["name"] or "")[:12])}</span>'
            f'<span class="dim">[{escape(r["sector"])}]</span>'
            f'<span class="dim" title="法人 20d 淨買估計金額 (NTD M) 的橫斷面 Z-score">資金 z={r["capital_z"]:+.2f}</span>'
            f'<span class="dim" title="{escape(r["pv_verdict"])}">量價 {escape(r["pv_label"])}</span></li>'
            for r in items
        ) or '<li class="empty">今日無</li>'
        sections.append(f'<h4 style="margin:10px 0 4px;">{icon} {label}<span class="dim">（{len(items)}）</span></h4>'
                         f'<ul class="fpsignal">{lis}</ul>')
    sections.append('<p class="dim" style="margin:10px 0 0;">資金鏡頭 × 量價鏡頭交叉出的狀態，'
                     '不是加權分數；REJECT（Dow 結構空頭）跟 OVERHEATED（追高風險）是結構性否決，'
                     '不進矩陣排列。Regime Gate（市場能不能做）跟 Capital Acceleration（資金變化速度）'
                     '下一階段才加，這版只驗證 Cross Matrix 本身。</p>')
    return "".join(sections)


def render_v2(scorecard, stage2):
    as_of = (scorecard or {}).get("as_of_date") or (stage2 or {}).get("as_of_date")
    all_rows = gdrtw.load_all_stocks(as_of)
    cross_rows = compute_capital_pv_cross(all_rows)
    groups = group_by_state(cross_rows)

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

  <div class="card">
    <div class="card-h">🧭 CAPITAL × PRICE-VOLUME CROSS<span class="n">{universe_note}</span></div>
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
