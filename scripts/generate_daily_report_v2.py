#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_daily_report_v2.py · 美股「機會雷達」決策儀表板（新版，不動舊版）
======================================================
使用者對現有 daily-latest.html 做了架構審查，核心建議：把「Sector → Stock」
升級成「Market Regime → Sector → Capital → Stock → Entry」，首頁只回答幾個
關鍵問題，其餘證據收進 detail。這份是新增的第二版報表，明確「保留原有、
新增一版」——完全不修改 generate_daily_report.py / daily-latest.html。

這次先做「可用既有資料建的部分」（跟使用者確認過範圍）：
  1. Regime Gate：不是重新發明公式，是重用 sector_scorecard.py 裡已經
     10 年回測驗證過的 regime_stats（SPY 3 條件 · 4 級 · 每級都有真實
     n/勝率/分位數）+ 既有 VIX override/ALLOCATION_MATRIX，包裝成
     Risk-On/Neutral/Caution/Risk-Off 顯示。
  2. Price Lag：新算，直接套用台股版驗證過的公式 PriceLag = Z(SectorPoint,
     跨 sector 橫斷面) − Z(StockPoint, sector 內橫斷面)。
  3. Capital Acceleration：新算，Δflow_ratio vs 最近一次「有 flow_ratio
     欄位」的歷史快照（這個欄位是最近才加的，08/31 之前的舊快照沒有，
     不能無中生有算更早的 delta）。
  4. Opportunity Radar / Stock State：候選池沿用 generate_daily_report.py
     的 build_sensor_pool() + compute_sensor_scores()（S1-S5 感測器 + 矛盾
     扣分邏輯早就驗證過），但不用原本的 TODAY/TRIGGER/AVOID 三桶——AVOID
     桶裡混了三種體質不同的矛盾（Dow 空頭轉空／Dow 頂部擴散或追高風險／
     吃老本沒量能確認），拆開成 EARLY/CONFIRMED/MATURE/OVERHEATED/REJECTED
     五態，一檔股票對應一個狀態，不重寫底層分數公式。
  5. Entry Permission Gate：EntryPermission = f(Regime, StockState)，
     Regime 是進場許可的 Gate，不是乘在 Opportunity 分數上的乘數。
  6. Theme Map（V2 ETF Proxy）：跟使用者確認過，不建人工個股↔主題對照表
     （那是台股 industry_mapping.csv 量級的工程），改成挑 8 檔流動性夠、
     認知度高的主題 ETF（scripts/theme_scorecard.py：SMH/IGV/CIBR/XBI/
     ITA/XOP/KRE/JETS），套用跟 Sector 一樣的量價評分方法論。資料完整度
     比 Sector 層低（沒有 breadth_pct，沒有長期歷史百分位），這是「輕量」
     的具體意思，不是漏做。

沒做的部分（跟使用者確認過，留待後續）：
  - 乘法瓶頸邏輯的 OpportunityScore（Regime × SectorHealth × ... ）：
    需要先定義每個因子怎麼標準化到同一尺度才能相乘，這次沒有臨時湊一個
  - Signal Stack 視覺化重排：S1-S5 已經存在，這次只在 detail 表格帶出
    分數，沒有重新設計成使用者畫的 ✓/⚠ 卡片

輸出：
  sector-rotation/reports/daily-v2-YYYY-MM-DD.html
  sector-rotation/reports/daily-v2-latest.html

用法：
  python scripts/generate_daily_report_v2.py
"""
import os
import sys
import csv
import glob
from datetime import datetime, timezone
from html import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_daily_report as gdr  # noqa: E402  重用既有的 S1-S5 感測器 + TODAY/TRIGGER/AVOID 分類

DATA_DIR = gdr.DATA_DIR
REPORTS_DIR = gdr.REPORTS_DIR
SCORECARD = gdr.SCORECARD
STAGE2 = gdr.STAGE2
THEME_SCORECARD = os.path.join(DATA_DIR, "theme_scorecard_latest.json")  # scripts/theme_scorecard.py 的輸出

PRICE_LAG_MIN_SECTOR_SIZE = 3  # 跟台股版同一條規則：sector 內 Z-score 母體太小（<3 檔）沒有意義


# ============================================================
# 1. Regime Gate：包裝既有 regime_stats，不重新發明公式
# ============================================================
REGIME_RISK_LABEL = {
    "🟢 多頭": ("🟢", "RISK-ON"),
    "🟡 中性": ("🟡", "NEUTRAL"),
    "🟠 警戒": ("🟠", "CAUTION"),
    "🔴 空頭": ("🔴", "RISK-OFF"),
}


def regime_gate(market_ctx):
    """把 sector_scorecard.py 裡已經算好的 regime_stats（SPY 10 年回測，
    3 條件 4 級：> 60 日前價／50MA 向上／200MA 向上）包裝成 Risk-On/Neutral/
    Caution/Risk-Off。不是新發明一套「SPY Trend + Breadth + VIX + Credit +
    Rates 各自打分再加總」的權重公式——那套公式要怎麼配權重本身就是沒有
    共識的設計決策，這裡改用已經有 10 年真實勝率背書的分類法。
    VIX > 30 的 override（vix_override_all_cash）視為最高優先級的風險關閉，
    蓋過 regime 本身的分類。
    """
    market_ctx = market_ctx or {}
    regime_stats = market_ctx.get("regime_stats") or {}
    current_regime = regime_stats.get("current_regime")
    current_stats = regime_stats.get("current") or {}
    unconditional_stats = regime_stats.get("unconditional") or {}
    vix = market_ctx.get("vix") or {}
    tnx = market_ctx.get("tnx") or {}
    vix_override = bool(market_ctx.get("vix_override_all_cash"))

    if vix_override:
        icon, label = "🔴", "RISK-OFF"
        note = f"VIX={vix.get('value','—')} 觸發全倉現金 override，蓋過下面的 regime 分類"
    elif current_regime in REGIME_RISK_LABEL:
        icon, label = REGIME_RISK_LABEL[current_regime]
        note = f"SPY regime={current_regime}（3 條件：>60日前價/50MA向上/200MA向上）"
    else:
        icon, label = "⚪", "UNKNOWN"
        note = "regime_stats 不存在或今日資料不足，無法分類"

    # Regime Edge：使用者提問「重要的不是 RISK-ON 過去賺錢，是 RISK-ON 比
    # 無條件持有 SPY 好多少」。unconditional 是 sector_scorecard.py 同一個
    # 10 年回測迴圈裡，不設 regime 條件、每天都塞一份的全樣本統計（跟
    # current 是同一套方法算出來的，只是母體從「這個 regime 的日子」換成
    # 「所有日子」），edge = current − unconditional，不是新公式，是同一個
    # 統計拿掉條件之後的差。regime_stats 是舊版（沒有 unconditional 欄位）
    # 時兩者皆為 None，誠實顯示算不出來，不硬湊。
    edge_mean = edge_win_rate = None
    if current_stats.get("mean") is not None and unconditional_stats.get("mean") is not None:
        edge_mean = round(current_stats["mean"] - unconditional_stats["mean"], 2)
    if current_stats.get("win_rate") is not None and unconditional_stats.get("win_rate") is not None:
        edge_win_rate = round(current_stats["win_rate"] - unconditional_stats["win_rate"], 1)

    return {
        "icon": icon, "label": label, "current_regime": current_regime,
        "vix": vix.get("value"), "tnx": tnx.get("value"),
        "vix_override": vix_override, "note": note,
        "historical_n": current_stats.get("n"), "historical_win_rate": current_stats.get("win_rate"),
        "historical_mean": current_stats.get("mean"),
        "baseline_n": unconditional_stats.get("n"), "baseline_win_rate": unconditional_stats.get("win_rate"),
        "baseline_mean": unconditional_stats.get("mean"),
        "edge_mean": edge_mean, "edge_win_rate": edge_win_rate,
        "allocation": market_ctx.get("allocation"),
    }


# ============================================================
# 2. Price Lag：PriceLag = Z(SectorPoint, 跨 sector) − Z(StockPoint, sector 內)
# ============================================================
def _zscore_series(values):
    """回傳跟 values 等長的 Z-score list。std=0 或 <2 個值時全部回傳 0.0
    （不是報錯——沒有離散度就沒有相對強弱可言，回傳 0 是誠實的「無資訊」，
    不是刻意隱藏的預設值）。"""
    n = len(values)
    if n < 2:
        return [0.0] * n
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n
    std = var ** 0.5
    if not std:
        return [0.0] * n
    return [(v - mean) / std for v in values]


def compute_price_lag(scorecard_rows, all_rows):
    """個股 Price Lag：跟台股版同一個公式，只是分組維度從 supply_chain 換成
    GICS sector（美股沒有台股那種人工供應鏈映射表，這裡先用官方 sector 分組，
    等 Theme 層做出來後可以再細分）。

    SectorStrength：sector 的 point，相對「今天所有其他 sector」的橫斷面
    Z-score。
    StockStrength：股票的 point，相對「同一個 sector 裡今天其他股票」的
    橫斷面 Z-score（母體是同 sector 股票，不是全市場排名）。

    PriceLag 越正：sector 整體越強（vs. 其他 sector）、這檔股票在 sector 內
    越弱（vs. sector 內同儕）——sector 強股弱的組合正是「還沒反映」的訊號。
    sector 內股票數 < PRICE_LAG_MIN_SECTOR_SIZE（預設 3）時，母體太小沒有
    意義，整個 sector 跳過。
    """
    if not scorecard_rows or not all_rows:
        return []

    sector_names = [r.get("sector_name_en") for r in scorecard_rows]
    sector_points = []
    for r in scorecard_rows:
        try:
            sector_points.append(float(r.get("point") or 0))
        except (TypeError, ValueError):
            sector_points.append(0.0)
    sector_z = dict(zip(sector_names, _zscore_series(sector_points)))
    sector_quadrant = {r.get("sector_name_en"): r.get("quadrant") for r in scorecard_rows}
    sector_point_lookup = {r.get("sector_name_en"): p for r, p in zip(scorecard_rows, sector_points)}

    by_sector = {}
    for r in all_rows:
        sec = r.get("sector")
        if sec not in sector_z:
            continue
        by_sector.setdefault(sec, []).append(r)

    rows = []
    for sector, stocks in by_sector.items():
        if len(stocks) < PRICE_LAG_MIN_SECTOR_SIZE:
            continue
        points = []
        for r in stocks:
            try:
                points.append(float(r.get("point") or 0))
            except (TypeError, ValueError):
                points.append(0.0)
        std = (sum((p - sum(points) / len(points)) ** 2 for p in points) / len(points)) ** 0.5
        if not std:
            continue
        stock_z = _zscore_series(points)
        sz = sector_z[sector]
        for r, z in zip(stocks, stock_z):
            z = round(z, 2)
            price_lag = round(sz - z, 2)
            # EARLY 只在 sector 本身資金方向已經確認（leading/improving：資金
            # 流入方向）且這檔股票在 sector 內落後（z<0）才標——sector 本身
            # 就弱的話，低 z 是一致現象，不該誤判成機會。
            early = sector_quadrant.get(sector) in ("leading", "improving") and z < 0
            rows.append({
                "symbol": r.get("symbol", ""), "name": r.get("name", ""),
                "sector": sector, "sector_point": round(sector_point_lookup[sector], 2),
                "sector_z": round(sz, 2), "sector_quadrant": sector_quadrant.get(sector),
                "stock_point": round(float(r.get("point") or 0), 2),
                "stock_z": z, "sector_size": len(stocks),
                "price_lag": price_lag, "early_flag": "🎯 EARLY" if early else "",
            })
    rows.sort(key=lambda r: -r["price_lag"])
    return rows


# ============================================================
# 3. Capital Acceleration：Δflow_ratio vs 最近一次有 flow_ratio 的快照
# ============================================================
def find_prior_scorecard_with_flow_ratio(as_of):
    """往回找最近一次「檔名日期 < as_of 且該檔有 flow_ratio 欄位」的
    {date}_scorecard.csv。flow_ratio 是最近才加的欄位（見 sector_scorecard.py
    註解），08/31 之前的舊快照沒有這欄，往回找到沒有欄位的檔案就停止，不
    假裝更早的資料也有這個訊號。回傳 (date_str, {sector_name_en: flow_ratio})
    或 (None, {})。
    """
    if not as_of:
        return None, {}
    as_of_stamp = as_of.replace("-", "")
    candidates = sorted(
        glob.glob(os.path.join(DATA_DIR, "[0-9]" * 8 + "_scorecard.csv")),
        reverse=True,
    )
    for path in candidates:
        stamp = os.path.basename(path).split("_")[0]
        if stamp >= as_of_stamp:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                if reader.fieldnames and "flow_ratio" in reader.fieldnames:
                    flow_by_sector = {}
                    for r in reader:
                        try:
                            flow_by_sector[r["sector_name_en"]] = float(r["flow_ratio"])
                        except (TypeError, ValueError, KeyError):
                            continue
                    date_str = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"
                    return date_str, flow_by_sector
        except Exception:
            continue
    return None, {}


def compute_capital_acceleration(scorecard_rows, as_of):
    """CapitalAcceleration = 今天 flow_ratio − 最近一次可比對快照的 flow_ratio。
    正值代表資金流入速度在加快（不是「有沒有流入」，是「流入的速度變化」），
    負值代表在減速，就算 flow_ratio 本身還是正的。
    """
    prior_date, prior_flow = find_prior_scorecard_with_flow_ratio(as_of)
    rows = []
    for r in scorecard_rows:
        sec = r.get("sector_name_en")
        try:
            today_flow = float(r.get("flow_ratio")) if r.get("flow_ratio") not in (None, "") else None
        except (TypeError, ValueError):
            today_flow = None
        prior = prior_flow.get(sec)
        accel = round(today_flow - prior, 3) if (today_flow is not None and prior is not None) else None
        rows.append({
            "sector": r.get("sector"), "sector_name_en": sec, "sector_name": r.get("sector_name"),
            "flow_ratio_today": today_flow, "flow_ratio_prior": prior,
            "acceleration": accel,
        })
    rows.sort(key=lambda r: (r["acceleration"] is None, -(r["acceleration"] or 0)))
    return prior_date, rows


# ============================================================
# 4. Stock State：把 TODAY/TRIGGER/AVOID 三桶，收斂成「一檔股票一個狀態」
#    的五態模型 EARLY → CONFIRMED → MATURE → OVERHEATED，REJECTED 是獨立
#    的結構性否決態。全部沿用 gdr.compute_sensor_scores() 已經算好的欄位
#    分類，不新發明分數公式——原本混在同一個 conflict_penalty>0（AVOID）
#    判斷式裡的三種矛盾，其實是不同的風險輪廓，不該混在一起：
#      · Dow 結構轉空（trend_state=空頭）→ 結構已經破壞，REJECTED
#      · Dow 頂部擴散（trend_state=擴散）或已列「追高風險」→ 還沒破壞，
#        但已經是高風險延伸，OVERHEATED
#      · 「吃老本」且量能未確認 → 趨勢還在，只是新鮮度用完、量能沒跟上，
#        MATURE（不是矛盾，是老化）
#    拆開才對得起「一檔股票一個狀態」這句話，而不是把三種不同體質的股票
#    都貼上同一張「AVOID」標籤。
# ============================================================
STOCK_STATE_ORDER = ["EARLY", "CONFIRMED", "MATURE", "OVERHEATED", "REJECTED"]
STATE_LABELS = {
    "EARLY": ("🎯", "EARLY · 早期訊號"),
    "CONFIRMED": ("🚀", "CONFIRMED · 已確認"),
    "MATURE": ("🕰️", "MATURE · 走老未確認"),
    "OVERHEATED": ("🔥", "OVERHEATED · 追高風險"),
    "REJECTED": ("🚫", "REJECTED · 結構已破壞"),
}


def classify_stock_state(sc):
    """單一狀態分類（輸入是 gdr.compute_sensor_scores() 的回傳值）。
    優先序：結構性風險（REJECTED → OVERHEATED → MATURE，原本都被
    compute_sensor_scores() 混在同一個 conflict_penalty>0 判斷式裡）先判斷，
    排除掉之後才落到 EARLY/CONFIRMED——跟原本 classify_sensor_signals() 先
    分出 conflicted 再分 today/trigger 的順序邏輯一致。"""
    trend_state = sc.get("trend_state") or ""
    pv_verdict = sc.get("pv_verdict") or ""
    explosive_verdict = sc.get("explosive_verdict") or ""
    conflict_label = sc.get("conflict_label") or ""

    if trend_state == "空頭":
        return "REJECTED"
    if trend_state == "擴散" or "追高風險" in explosive_verdict:
        return "OVERHEATED"
    if "吃老本" in conflict_label:
        return "MATURE"
    if trend_state == "收斂" or pv_verdict in gdr.PV_EARLY:
        return "EARLY"
    if trend_state == "多頭" and pv_verdict in gdr.PV_CONFIRMED:
        return "CONFIRMED"
    return "EARLY"  # 灰色地帶（例如多頭但量能訊號普通）：還沒確認，保守歸類成 EARLY


def build_stock_state_groups(stage2, scorecard, exp_buckets, top_n=5):
    """把候選池（跟 classify_sensor_signals 同一個 build_sensor_pool）分成
    五態，每態最多 top_n 檔。REJECTED/OVERHEATED 依風險嚴重度（矛盾扣分、
    原始分）由重到輕排序，方便一眼看到最該提防的；其餘依 total 分數由高到
    低排序。"""
    sector_by_name = {r.get("sector_name_en"): r for r in (scorecard.get("rows") or [])}
    pool = gdr.build_sensor_pool(stage2, exp_buckets)
    scored = [(r, gdr.compute_sensor_scores(r, sector_by_name)) for r in pool]

    groups = {state: [] for state in STOCK_STATE_ORDER}
    for r, sc in scored:
        groups[classify_stock_state(sc)].append((r, sc))

    for state in ("REJECTED", "OVERHEATED"):
        groups[state].sort(key=lambda x: (-x[1]["conflict_penalty"], -x[1]["raw_total"]))
    for state in ("EARLY", "CONFIRMED", "MATURE"):
        groups[state].sort(key=lambda x: -x[1]["total"])

    return {state: items[:top_n] for state, items in groups.items()}


def load_all_rows(as_of):
    """讀 {date}_all.csv 全部列（不只是 explosive_verdict 有值的），
    Price Lag 需要 sector 內完整股票池才能算 Z-score，不能只用暴漲候選池
    的子集（那樣母體會被人為窄化，Z-score 沒有意義）。"""
    if not as_of:
        return []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ============================================================
# HTML 渲染
# ============================================================
CSS = gdr.CSS if hasattr(gdr, "CSS") else ""

FRONT_CSS_EXTRA = '''
  .fpgrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  @media(max-width:800px) { .fpgrid { grid-template-columns:1fr; } }
  .fpsignal { margin:0; padding:0; list-style:none; font-size:13px; }
  .fpsignal li { padding:6px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  .fpsignal li:last-child { border-bottom:none; }
  .fpsignal li > b { flex:1; }
  .fpnames { margin:0; padding:0; list-style:none; font-size:13px; columns:2; column-gap:16px; }
  .fpnames li { padding:4px 0; display:flex; align-items:center; justify-content:space-between; gap:8px; break-inside:avoid; }
  @media(max-width:500px) { .fpnames { columns:1; } }
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


def regime_banner_html(regime):
    cls = {"RISK-ON": "regime-on", "NEUTRAL": "regime-neutral", "CAUTION": "regime-caution",
           "RISK-OFF": "regime-off"}.get(regime["label"], "regime-unknown")
    hist = ""
    if regime.get("historical_n"):
        hist = (f' · 歷史同 regime 出現 {regime["historical_n"]} 次，20 日後平均 '
                f'{regime["historical_mean"]:+.2f}%，勝率 {regime["historical_win_rate"]:.1f}%')
    edge = ""
    # Regime Edge：同 regime 的表現，比「不分 regime、無條件持有 SPY」的
    # baseline 好多少——不是「RISK-ON 過去賺錢」（幾乎任何 regime 長期都賺），
    # 是「RISK-ON 比什麼都不看好多少」。舊資料沒有 baseline 時不硬湊。
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
    <div class="sub">VIX {regime.get("vix","—")} · 10Y {regime.get("tnx","—")}%</div>
  </div>'''


# ============================================================
# 4b. Entry Permission Gate：Regime 是「Gate」不是「乘數」
# ============================================================
# 使用者原本提議 Opportunity = Regime × ...（乘數），後來自己修正：Risk-Off
# 時把個股機會分數直接砍半沒有道理——「市場環境不好」不等於「這支股票的
# 機會變差」，該做的是「這個環境下，這個機會允不允許進場／要不要加註警示」，
# 也就是 EntryPermission = f(Regime, StockState)，Opportunity 本身分數不變。
#
# 兩個維度分開看：StockState（EARLY→CONFIRMED→MATURE→OVERHEATED 是股票自己
# 的生命週期位置，REJECTED 是結構性否決，跟 regime 無關）+ Regime（環境好壞）
# 一起決定進場許可。矩陣裡兩條規律：
#   · 同一個 regime 往右（EARLY→…→REJECTED）許可只會變嚴，不會變鬆——
#     股票自己老化/過熱的風險不會因為環境好就消失。
#   · 同一個 StockState 往下（RISK-ON→…→RISK-OFF）許可也只會變嚴——
#     環境轉弱時，越不新鮮的訊號越先被收緊。
# REJECTED 是結構已經破壞（Dow 空頭），不管 regime 好壞都不該放行，四個
# regime 下都是 ❌，不是規則遺漏。
ENTRY_PERMISSION_MATRIX = {
    "RISK-ON": {
        "EARLY": ("✅", ""), "CONFIRMED": ("✅", ""),
        "MATURE": ("⚠️", "已走老、量能未見進一步確認，適合持有觀察，不建議加碼新倉"),
        "OVERHEATED": ("⚠️", "追高風險已現，僅適合已有部位者嚴設停利，不建議新倉"),
        "REJECTED": ("❌", "Dow 結構已轉空，任何環境都不建議"),
    },
    "NEUTRAL": {
        "EARLY": ("✅", ""), "CONFIRMED": ("✅", ""),
        "MATURE": ("⚠️", "環境中性 + 走老訊號，新倉風險偏高"),
        "OVERHEATED": ("❌", "環境中性 + 追高風險，不建議新倉"),
        "REJECTED": ("❌", "Dow 結構已轉空，任何環境都不建議"),
    },
    "CAUTION": {
        "EARLY": ("✅", ""),
        "CONFIRMED": ("⚠️", "環境轉弱，已確認訊號留意獲利了結"),
        "MATURE": ("❌", "環境轉弱 + 走老訊號，不建議新倉"),
        "OVERHEATED": ("❌", "環境轉弱 + 追高風險，不建議新倉"),
        "REJECTED": ("❌", "Dow 結構已轉空，任何環境都不建議"),
    },
    "RISK-OFF": {
        "EARLY": ("⚠️", "環境風險偏高，早期訊號縮小部位"),
        "CONFIRMED": ("⚠️", "環境風險偏高，已確認訊號留意獲利了結"),
        "MATURE": ("❌", "Risk-Off 不建議持有走老訊號的新倉"),
        "OVERHEATED": ("❌", "Risk-Off 不建議追高"),
        "REJECTED": ("❌", "Dow 結構已轉空，任何環境都不建議"),
    },
    "UNKNOWN": {
        "EARLY": ("—", ""), "CONFIRMED": ("—", ""), "MATURE": ("—", ""), "OVERHEATED": ("—", ""),
        "REJECTED": ("❌", "Dow 結構已轉空，任何環境都不建議"),
    },
}


def entry_permission(regime_label, state):
    row = ENTRY_PERMISSION_MATRIX.get(regime_label, ENTRY_PERMISSION_MATRIX["UNKNOWN"])
    return row.get(state, ("—", ""))


# ============================================================
# 4d. Opportunity Reason：一行「為什麼」標籤
# ============================================================
# 使用者反饋：五個感測器分數（S1-S5）+ Entry Permission 對使用者來說還是
# 太多數字，真正想看的是「系統為什麼把這檔股票放在這裡」。不新增訊號、
# 不做新公式——直接從 compute_sensor_scores() 已經算好的 S1-S5 子分數
# （都是同一個 0-20 尺度，互相可比，不用另外標準化）挑分數最高的兩個轉成
# 短標籤。Price Lag 是額外資訊（不是每天都有，Stage 2 只在週五更新），
# 有資料且為正時才加進去，不搶 S1-S5 的排名。
OPPORTUNITY_REASON_LABELS = {
    "s1": "Sector Capital↑",   # S1 板塊強度：quadrant + flow_ratio + breadth
    "s2": "RS↑",               # S2 個股強度：sector 內排名 + 動能 + 量價分數
    "s3": "Volume↑",           # S3 成交量確認：pv_verdict + 漲跌量比
    "s4": "Trend↑",            # S4 趨勢完整性：Dow 型態 + 訊號
    "s5": "Room to run",       # S5 位置/空間：離高點距離 + 暴漲判定 + gap alert
}


def opportunity_reason(sc, price_lag=None, top_n=2):
    ranked = sorted(OPPORTUNITY_REASON_LABELS.items(), key=lambda kv: -(sc.get(kv[0]) or 0))
    tags = [label for k, label in ranked[:top_n] if (sc.get(k) or 0) > 0]
    if price_lag is not None and price_lag > 0:
        tags.append("Price Lag↑")
    return " + ".join(tags) if tags else "—"


def opportunity_radar_html(stage2, scorecard, exp_buckets, regime, lag_by_symbol=None):
    groups = build_stock_state_groups(stage2, scorecard, exp_buckets)
    regime_label = regime.get("label", "UNKNOWN") if regime else "UNKNOWN"
    lag_by_symbol = lag_by_symbol or {}
    sections = []
    for state in STOCK_STATE_ORDER:
        icon, label = STATE_LABELS[state]
        items = groups.get(state) or []
        lis_parts = []
        for r, sc in items:
            perm_icon, perm_note = entry_permission(regime_label, state)
            perm_html = f'<span title="{escape(perm_note)}">{perm_icon}</span>' if perm_note else f'<span>{perm_icon}</span>'
            reason = opportunity_reason(sc, lag_by_symbol.get(r.get("symbol")))
            lis_parts.append(
                f'<li><b>{escape(r.get("symbol",""))}</b> '
                f'<span class="dim">{escape((r.get("name") or "")[:16])}</span>'
                f'<span class="dim">[{escape(r.get("sector",""))}]</span>'
                f'<span class="dim" title="{state}">{sc.get("total","—")}</span>'
                f'{perm_html}'
                f'<span class="dim" title="從 S1-S5 子分數挑最高的兩個轉成的短標籤，不是新訊號">{escape(reason)}</span></li>'
            )
        lis = "".join(lis_parts) or '<li class="empty">今日無</li>'
        sections.append(f'<h4 style="margin:10px 0 4px;">{icon} {label}<span class="dim">（{len(items)}）</span></h4>'
                         f'<ul class="fpsignal">{lis}</ul>')
    sections.append(f'<p class="dim" style="margin:10px 0 0;">五態（EARLY/CONFIRMED/MATURE/OVERHEATED/REJECTED）'
                     f'沿用既有感測器欄位分類，不是新公式；Entry Permission 是依今日 regime（'
                     f'{escape(regime_label)}）標註的進場許可（✅可進場／⚠️留意／❌不建議），不改變狀態分類本身——'
                     f'股票處在哪個狀態是一回事，這個環境下該不該進場是另一回事。最後一欄的短標籤是從 S1-S5 挑'
                     f'最高的兩個子分數轉成的「為什麼」，Price Lag 有資料時額外附加。</p>')
    return "".join(sections)


PRICE_LAG_CAVEAT = ('<p class="dim" style="margin:10px 0 0;">已知限制：Sector 是市值加權 ETF，'
                     '重倉成分股（例如 XLK 裡的 AAPL/MSFT/NVDA）自己的價格變化本來就是 ETF 報酬的一大塊，'
                     '這是所有「拿 cap-weighted ETF 當板塊基準」的方法共通的限制（不是這個公式獨有），'
                     '對這幾檔重倉股的 Price Lag 解讀要打折扣。</p>')


def price_lag_html(lag_rows, top_n=15):
    early = [r for r in lag_rows if r.get("early_flag")]
    if not lag_rows:
        return ('<p class="empty">今日沒有 Price Lag 資料（sector 樣本數不足或今日資料不存在，'
                 '例如 Stage 2 個股全量資料只在週五更新，不是每天都有）</p>')
    if not early:
        return ('<p class="empty">今日沒有標記為 EARLY 的候選（有算 Price Lag 的 sector 裡，'
                 '沒有「sector 已確認、股票仍落後」的組合）</p>')
    rows_sorted = sorted(early, key=lambda r: -r["price_lag"])[:top_n]
    items = "".join(
        f'<li><b>{escape(r["symbol"])}</b> <span class="dim">{escape((r.get("name") or "")[:16])}</span>'
        f'<span class="dim">[{escape(r["sector"])}]</span>'
        f'<span class="dim" title="Sector 橫斷面 Z-score，vs. 今天其他所有 sector">sec_z={r["sector_z"]}</span>'
        f'<span class="dim" title="股票在 sector 內的橫斷面 Z-score，vs. sector 內同儕">stock_z={r["stock_z"]}</span>'
        f'<span class="up">{r["price_lag"]:.2f}</span></li>'
        for r in rows_sorted
    )
    return f'<ul class="fpsignal">{items}</ul>{PRICE_LAG_CAVEAT}'


def capital_acceleration_html(accel_rows, prior_date, top_n=3):
    """使用者反饋：11 個 sector 只有 11 個 sector 選 6+5=11 個列出來，等於
    全部都列了，跟『Signal』的意思矛盾（不是精選，是完整報表）。改成只列
    TOP 3 加速流入 + TOP 3 減速/流出，中段變化不明顯的收進 <details>，
    不是砍掉，只是不擋在第一眼。"""
    if prior_date is None:
        return '<p class="empty">找不到有 flow_ratio 欄位的歷史快照可比對（flow_ratio 是最近才加的欄位），無法算加速度</p>'
    valid = [r for r in accel_rows if r["acceleration"] is not None]
    if not valid:
        return f'<p class="empty">跟 {escape(prior_date)} 比對，但沒有 sector 同時有今天/當時的 flow_ratio</p>'
    accel_sorted = sorted(valid, key=lambda r: -r["acceleration"])
    top = accel_sorted[:top_n]
    # bottom 只取「不在 top 裡」的剩餘部分，避免 sector 數量少時 top/bottom
    # 重疊（同一個 sector 同時出現在「加速流入」跟「減速/流出」兩邊）。
    remaining = accel_sorted[top_n:]
    bottom = remaining[-top_n:][::-1] if remaining else []
    middle = remaining[:len(remaining) - len(bottom)]

    def _rows(items, cls):
        return "".join(
            f'<li><b>{escape(r["sector_name"] or r["sector"])}</b>'
            f'<span class="dim">今日 {r["flow_ratio_today"]:+.3f} ← {prior_date} {r["flow_ratio_prior"]:+.3f}</span>'
            f'<span class="{cls}">{r["acceleration"]:+.3f}</span></li>'
            for r in items
        )
    html = f'<h4 style="margin:0 0 4px;">🔼 TOP {top_n} 加速流入</h4><ul class="fpsignal">{_rows(top, "up")}</ul>'
    if bottom:
        html += f'<h4 style="margin:12px 0 4px;">🔽 TOP {top_n} 減速/流出</h4><ul class="fpsignal">{_rows(bottom, "down")}</ul>'
    if middle:
        html += (f'<details style="margin-top:10px;"><summary class="dim">其餘 {len(middle)} 個板塊'
                  f'（變化不明顯，非 TOP {top_n}）</summary><ul class="fpsignal">{_rows(middle, "dim")}</ul></details>')
    return html


def sector_map_html(scorecard_rows):
    if not scorecard_rows:
        return '<p class="empty">今日無板塊資料</p>'
    items = []
    for r in sorted(scorecard_rows, key=lambda r: -(r.get("point") or 0)):
        name = escape(r.get("sector_name_en", ""))
        q = r.get("quadrant")
        emoji, zh, _ = gdr.QUADRANT_META.get(q, ("⚪", "—", ""))
        items.append(f'<li>{name}<span>{emoji} {escape(zh)}</span></li>')
    return f'<ul class="fpnames">{"".join(items)}</ul>'


# ============================================================
# 4c. Theme Map：讀 scripts/theme_scorecard.py 的輕量 ETF Proxy 輸出，
#     跟 SECTOR MAP 同樣的呈現方式（quadrant 徽章），Theme 沒有的欄位
#     （breadth_pct 等）就不顯示，不假裝有
# ============================================================
def load_theme_scorecard():
    manifest = gdr.load_json(THEME_SCORECARD)
    if not manifest:
        return None
    return manifest.get("rows") or []


def theme_map_html(theme_rows):
    """使用者對照真實頁面反饋：8 個裸的『⚪ —』看起來像『這個模組壞了』，
    但實際意思是『目前只有 ETF Proxy 的價量分數，還沒有足夠歷史可以算
    acceleration/quadrant』（第一天沒有 5 日均可比，第 6 天起才會開始出現
    leading/improving/weakening/lagging）。quadrant 是 None 時改成明確講
    這件事，不是留一個看起來像錯誤的符號。"""
    if theme_rows is None:
        return ('<p class="empty">Theme ETF Proxy 還沒跑過（scripts/theme_scorecard.py），'
                '目前只有 Sector 層資料</p>')
    if not theme_rows:
        return '<p class="empty">今日無 Theme ETF 資料</p>'
    items = []
    for r in sorted(theme_rows, key=lambda r: -(r.get("point") or 0)):
        ticker = escape(r.get("sector", ""))
        name = escape(r.get("sector_name", "")) + f"（{ticker}）"
        q = r.get("quadrant")
        if q:
            emoji, zh, _ = gdr.QUADRANT_META.get(q, ("⚪", "—", ""))
            badge = f'{emoji} {escape(zh)}'
        else:
            badge = ('<span class="dim" title="ETF 價量分數已算出，累積幾天歷史後才會有 '
                     'leading/improving/weakening/lagging 象限（跟 Sector Map 同一套規則，'
                     '只是 Theme 才剛開始收資料）">ETF 訊號可用 · 尚無歷史可比</span>')
        items.append(f'<li>{name}<span>{badge}</span></li>')
    return f'<ul class="fpnames">{"".join(items)}</ul>'


def render_v2(scorecard, stage2):
    as_of = scorecard.get("as_of_date")
    scorecard_rows = scorecard.get("rows") or []
    market_ctx = scorecard.get("market_context") or {}
    all_rows = load_all_rows(as_of)
    exp_buckets = gdr.load_all_csv_verdicts(as_of)

    regime = regime_gate(market_ctx)
    lag_rows = compute_price_lag(scorecard_rows, all_rows)
    lag_by_symbol = {r["symbol"]: r["price_lag"] for r in lag_rows}
    prior_date, accel_rows = compute_capital_acceleration(scorecard_rows, as_of)
    theme_rows = load_theme_scorecard()

    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>美股機會雷達 · {as_of}</title>
<style>{CSS}{FRONT_CSS_EXTRA}</style>
</head>
<body>
<div class="sheet">

  <div class="header">
    <div class="logo">US</div>
    <div class="htitle">
      <span class="tag">V2 · BETA</span>
      <h1>🇺🇸 美股機會雷達 · {as_of}</h1>
      <p>Regime → Sector → Capital → Stock → Entry。這是新增的第二版報表，
         跟現有 daily-latest.html 並存，不取代它——資料源完全相同
         （scorecard_latest.json / latest.json），沒有重抓任何資料。</p>
    </div>
  </div>

  {regime_banner_html(regime)}

  <div class="card">
    <div class="card-h">🧭 SECTOR MAP<span class="n">{len(scorecard_rows)} sectors</span></div>
    <div class="card-b">{sector_map_html(scorecard_rows)}</div>
  </div>

  <div class="card">
    <div class="card-h">🧬 THEME ETF PROXY<span class="n" title="不建個股↔主題對照表，直接對 SMH/IGV/CIBR/XBI/ITA/XOP/KRE/JETS 等主題 ETF 套用跟 Sector 一樣的量價評分方法論。沒有 breadth_pct（沒有個股對照表可算），資料完整度比 Sector 層低——這是 Proxy，不是完整 Theme">{len(theme_rows) if theme_rows else 0} theme ETFs</span></div>
    <div class="card-b">{theme_map_html(theme_rows)}</div>
  </div>

  <div class="card">
    <div class="card-h">💰 CAPITAL ACCELERATION<span class="n" title="Δflow_ratio vs 最近一次有 flow_ratio 欄位的歷史快照——不是有沒有流入，是流入速度在加快還是減速">流入速度變化</span></div>
    <div class="card-b">{capital_acceleration_html(accel_rows, prior_date)}</div>
  </div>

  <div class="card">
    <div class="card-h">🎯 PRICE LAG · EARLY<span class="n" title="PriceLag = Z(SectorPoint, 跨sector) − Z(StockPoint, sector內)。只列 sector 本身已經 leading/improving、但這檔股票在 sector 內還沒漲上來的組合">sector 已確認、股票落後</span></div>
    <div class="card-b">{price_lag_html(lag_rows)}</div>
  </div>

  <div class="card">
    <div class="card-h">🔥 OPPORTUNITY RADAR<span class="n" title="重用既有 S1-S5 感測器 + 矛盾扣分邏輯，拆成 EARLY/CONFIRMED/MATURE/OVERHEATED/REJECTED 一檔股票一個狀態，並依今日 Regime 標 Entry Permission（✅/⚠️/❌）——Regime 是 Gate 不是乘數，不改變股票本身的 Opportunity 分數">Stock State（5 態）+ Entry Permission</span></div>
    <div class="card-b">{opportunity_radar_html(stage2, scorecard, exp_buckets, regime, lag_by_symbol)}</div>
  </div>

  <div class="foot">
    產生時間 {gen_ts} · Regime Gate 用 sector_scorecard.py 的 10 年回測 regime_stats ·
    Price Lag / Capital Acceleration 是這版新算的 · Opportunity Radar 重用既有
    S1-S5 感測器邏輯，未重新設計 ·
    <a href="daily-latest.html">看原版美股報表</a>
    <br><br>
    <span style="color:#94a3b8;">投資有風險 · 本報告為系統化訊號記錄 · 不構成投資建議</span>
  </div>

</div>
</body>
</html>'''

    os.makedirs(REPORTS_DIR, exist_ok=True)
    dated_path = os.path.join(REPORTS_DIR, f"daily-v2-{as_of}.html")
    latest_path = os.path.join(REPORTS_DIR, "daily-v2-latest.html")
    with open(dated_path, "w", encoding="utf-8") as f:
        f.write(html)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)
    return dated_path, latest_path


def main():
    scorecard = gdr.load_json(SCORECARD)
    if not scorecard:
        sys.exit(f"❌ 沒 {SCORECARD} · 先跑 sector_scorecard.py")
    stage2 = gdr.load_json(STAGE2) or {}
    dated, latest = render_v2(scorecard, stage2)
    print(f"✅ 產生 {dated}")
    print(f"✅ 覆寫 {latest}")


if __name__ == "__main__":
    main()
