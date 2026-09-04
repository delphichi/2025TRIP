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


def load_insider_data():
    """讀 insider_latest.json · 回傳 {symbol: {net_M, buy_cnt, top_officer_cnt, top_buyer, top_title}}"""
    p = os.path.join(DATA_DIR, "insider_latest.json")
    if not os.path.exists(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            payload = json.load(f) or {}
        return payload.get("data", {}) or {}
    except Exception:
        return {}


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


def load_all_csv_stock_flow(as_of, top_n=15):
    """讀 all.csv · 用 ud_ratio (up_avg_vol / down_avg_vol) 當個股 20 日資金流向 proxy
    · ud_ratio > 1: 上漲日均量 > 下跌日均量 = 資金淨流入
    · ud_ratio < 1: 下跌日均量 > 上漲日均量 = 資金淨流出
    · 過濾 vol_today > 0 且有 up_days_20 資料
    · 回傳 (inflow_top, outflow_top)
    """
    if not as_of:
        return [], []
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        return [], []
    stocks = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                try:
                    ud = float(r.get("ud_ratio") or 0)
                    ud_str = str(r.get("ud_ratio") or "").strip()
                    up_d = float(r.get("up_days_20") or 0)
                    dn_d = float(r.get("down_days_20") or 0)
                    price = float(r.get("t_price") or 0)
                    # 需有基本資料
                    if ud_str == "" or (up_d + dn_d) < 10 or price <= 0:
                        continue
                    r["_ud_ratio"] = ud
                    r["_up_days"] = int(up_d)
                    r["_down_days"] = int(dn_d)
                    r["_ret_20d"] = float(r.get("ret_20d") or 0)
                    r["_t_price"] = price
                    stocks.append(r)
                except Exception:
                    continue
    except Exception:
        return [], []
    # 資金流入 Top: ud_ratio 大 · 上漲天 ≥ 12
    inflow = sorted([s for s in stocks if s["_up_days"] >= 12 and s["_ud_ratio"] >= 1.5],
                    key=lambda s: -s["_ud_ratio"])[:top_n]
    # 資金流出 Top: ud_ratio 小 · 下跌天 ≥ 12
    outflow = sorted([s for s in stocks if s["_down_days"] >= 12 and s["_ud_ratio"] <= 0.7],
                     key=lambda s: s["_ud_ratio"])[:top_n]
    return inflow, outflow


def load_all_csv_stock_flow_by_sector(as_of, per_sector=3):
    """讀 all.csv · 每個 sector 挑資金流入 Top N (ud_ratio 排序)
    · 用 sector 英文名 (Energy / Communication Services / ...) 當 key
    · 過濾 ud_ratio ≥ 1.5 + 上漲天 ≥ 12 + 價格 > 0
    · 每 sector 最多回傳 per_sector 支
    """
    if not as_of:
        return {}
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        return {}
    by_sec = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                try:
                    ud_str = str(r.get("ud_ratio") or "").strip()
                    if ud_str == "": continue
                    ud = float(ud_str)
                    up_d = float(r.get("up_days_20") or 0)
                    dn_d = float(r.get("down_days_20") or 0)
                    price = float(r.get("t_price") or 0)
                    if ud < 1.5 or up_d < 12 or price <= 0:
                        continue
                    r["_ud_ratio"] = ud
                    r["_up_days"] = int(up_d)
                    r["_down_days"] = int(dn_d)
                    r["_ret_20d"] = float(r.get("ret_20d") or 0)
                    r["_ret_5d"] = float(r.get("ret_5d") or 0)
                    r["_t_price"] = price
                    sec = (r.get("sector") or "").strip()
                    by_sec.setdefault(sec, []).append(r)
                except Exception:
                    continue
    except Exception:
        return {}
    for sec in by_sec:
        by_sec[sec].sort(key=lambda s: -s["_ud_ratio"])
        by_sec[sec] = by_sec[sec][:per_sector]
    return by_sec


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


# ---------- 感測器投資建議（Opportunity Score）----------
# 核心問題：找「資金正在進入、但價格還沒完全反映」的地方 ——
#   S1 板塊強度 + S2 個股強度 + S3 成交量確認 + S4 趨勢完整性 + S5 位置/空間，
#   五個同時成立才算真正機會；缺一個都要看得出來（不是平均掉）。
# 「矛盾」（強動能訊號 vs Dow 結構已破壞）是風險，不是中性——直接扣總分，
#   不透過拉低單一感測器分數去稀釋，這樣「表面很強但結構有問題」的股票才會被攔下來。
def _snum(row, key, default=0.0):
    """安全轉數字：latest.json 來源已是 float，all.csv（追高風險桶）來源是純字串，統一處理"""
    v = row.get(key)
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _sint(row, key, default=None):
    v = row.get(key)
    if v is None or v == "":
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


# pv_verdict → 量能確認基礎分（0-14）· 見 sector_rotation_screener.py::_pv_verdict()
PV_SCORE_MAP = {
    "⭐⭐⭐ 完美多頭": 14, "🚀 健康多頭": 12, "🌱 底部剛翻多": 10, "✨ 反彈初期": 9,
    "➡️ 中性": 6, "😴 弱勢縮量": 4, "⚠️ 量能背離": 3, "⚠️ 中期出貨": 2,
    "⚠️ 頂部背離": 2, "⚠️ 主升段結束": 2, "🧊 熊市縮量": 1, "📉 主力出貨": 0,
    "⚠️ 量能衰竭": 0, "資料不足": 5,
}
PV_CONFIRMED = {"⭐⭐⭐ 完美多頭", "🚀 健康多頭", "🌱 底部剛翻多"}   # 量能已確認 → 夠格進 TODAY
PV_EARLY = {"✨ 反彈初期", "➡️ 中性", "⚠️ 量能背離"}                # 量能還沒確認 → 進 TRIGGER 等升級


def compute_sensor_scores(row, sector_by_name):
    """算一支股票的五感測器分數（各 0-20，總分 0-100）+ 矛盾扣分。"""
    sec = sector_by_name.get(row.get("sector") or "") or {}

    # S1 板塊強度：quadrant（資金方向）+ 30d 淨流向 + 30d 訊號寬度
    quadrant_pts = {"leading": 8, "improving": 6, "weakening": 3, "lagging": 0}.get(sec.get("quadrant"), 4)
    flow_ratio = _snum(sec, "flow_ratio", 0.0)   # 範圍約 -1..+1
    flow_pts = round(max(0.0, min(6.0, (flow_ratio + 1) / 2 * 6)))
    breadth = _snum(sec, "breadth_30d_ratio", 50.0)   # 範圍 0..100
    breadth_pts = round(max(0.0, min(6.0, breadth / 100 * 6)))
    s1 = max(0, min(20, quadrant_pts + flow_pts + breadth_pts))

    # S2 個股強度：sector 內排名 + 動能方向 + 量價分數
    rank_pts = {1: 8, 2: 6, 3: 4}.get(_sint(row, "composite_rank_in_sector"), 2)
    c4w = _snum(row, "cum_ret_4w", 0.0)
    c26w = _snum(row, "cum_ret_26w", 0.0)
    if c4w > 15 and c26w > 0: mom_pts = 8
    elif c4w > 5: mom_pts = 6
    elif c4w > 0: mom_pts = 4
    elif c4w > -5: mom_pts = 2
    else: mom_pts = 0
    vp_score = _snum(row, "vp_score_stock", 50.0)
    vp_pts = round(max(0.0, min(4.0, vp_score / 100 * 4)))
    s2 = max(0, min(20, rank_pts + mom_pts + vp_pts))

    # S3 成交量確認：pv_verdict（量價象限判定）+ 上漲/下跌日均量比
    pv_verdict = row.get("pv_verdict") or ""
    pv_pts = PV_SCORE_MAP.get(pv_verdict, 5)
    ud = _snum(row, "ud_ratio", 1.0)
    if ud >= 2.5: ud_pts = 6
    elif ud >= 2.0: ud_pts = 5
    elif ud >= 1.5: ud_pts = 4
    elif ud >= 1.2: ud_pts = 3
    elif ud >= 1.0: ud_pts = 2
    elif ud >= 0.8: ud_pts = 1
    else: ud_pts = 0
    s3 = max(0, min(20, pv_pts + ud_pts))

    # S4 趨勢完整性：Dow 型態（多頭/收斂/擴散/空頭）+ 訊號
    trend_state = row.get("trend_state") or ""
    trend_signal = row.get("trend_signal") or ""
    state_pts = {"多頭": 14, "收斂": 9, "擴散": 6, "空頭": 0}.get(trend_state, 7)
    if "多頭確認" in trend_signal: sig_adj = 6
    elif "空轉多預警" in trend_signal: sig_adj = 3
    elif "多轉空預警" in trend_signal: sig_adj = -6
    elif "空頭確認" in trend_signal: sig_adj = -6
    else: sig_adj = 0
    s4 = max(0, min(20, state_pts + sig_adj))

    # S5 位置/空間：離 52w 高點距離（太貼近高點=安全邊際低）+ 暴漲判定 + gap alert
    pct_from_high = _snum(row, "pct_from_high", -15.0)
    if pct_from_high >= -3: pos_pts = 4
    elif pct_from_high >= -10: pos_pts = 10
    elif pct_from_high >= -20: pos_pts = 8
    elif pct_from_high >= -35: pos_pts = 5
    else: pos_pts = 2
    explosive_verdict = (row.get("explosive_verdict") or "").strip()
    if "暴漲中" in explosive_verdict: exp_pts = 6
    elif "潛在暴漲" in explosive_verdict: exp_pts = 8
    elif "追高風險" in explosive_verdict: exp_pts = 0
    else: exp_pts = 5
    gap_alert = row.get("stock_gap_alert") or ""
    gap_adj = -3 if gap_alert == "吃老本" else (2 if gap_alert == "剛爆發" else 0)
    s5 = max(0, min(20, pos_pts + exp_pts + gap_adj))

    # 矛盾扣分：強動能訊號候選池裡的股票，若 Dow 結構已經破壞 / 已列追高風險 / 吃老本又沒量能確認
    #   → 直接扣總分（不是平均掉），因為這是「候選資格」跟「結構現況」互相矛盾，不是單純弱勢
    conflict_penalty = 0
    conflict_label = None

    def _add_conflict(pts, label):
        nonlocal conflict_penalty, conflict_label
        conflict_penalty += pts
        conflict_label = (conflict_label + " · " if conflict_label else "") + label

    if trend_state == "空頭":
        _add_conflict(15, "⚠ 訊號衝突（動能強但 Dow 空頭）")
    elif trend_state == "擴散":
        _add_conflict(8, "⚠ 頂區警訊（Dow 擴散喇叭）")
    if "追高風險" in explosive_verdict:
        _add_conflict(10, "⚠ 追高風險")
    if gap_alert == "吃老本" and pv_verdict not in PV_CONFIRMED:
        _add_conflict(5, "⚠ 吃老本未見量能確認")

    raw_total = s1 + s2 + s3 + s4 + s5
    total = max(0, min(100, raw_total - conflict_penalty))

    return {
        "s1": s1, "s2": s2, "s3": s3, "s4": s4, "s5": s5,
        "raw_total": raw_total, "conflict_penalty": conflict_penalty,
        "conflict_label": conflict_label, "total": total,
        "trend_state": trend_state, "pv_verdict": pv_verdict,
        "explosive_verdict": explosive_verdict,
    }


def build_sensor_pool(stage2, exp_buckets):
    """感測器候選池：strong_buy + explosive 精選池 ∪ 全市場「追高風險」桶（前 20）。
    追高風險桶特地從全市場 all.csv 撈，才抓得到沒進 curated top3、但值得放進 AVOID 名單的股票
    （例如系統已知追高但排名不夠進 strong_buy/explosive 精選池的個股）。"""
    pool = {}
    for r in strong_buy_stocks(stage2):
        pool.setdefault(r.get("symbol"), r)
    for r in explosive_stocks(stage2):
        pool.setdefault(r.get("symbol"), r)
    for r in (exp_buckets or {}).get("🔥 追高風險", [])[:20]:
        s = r.get("symbol")
        if s and s not in pool:
            pool[s] = r
    return list(pool.values())


def classify_sensor_signals(stage2, scorecard, exp_buckets):
    """把候選池分成 TODAY（已形成機會）/ TRIGGER（等待確認）/ AVOID（矛盾或風險過高）三組，各最多 5 檔。"""
    sector_by_name = {r.get("sector_name_en"): r for r in (scorecard.get("rows") or [])}
    pool = build_sensor_pool(stage2, exp_buckets)
    scored = [(r, compute_sensor_scores(r, sector_by_name)) for r in pool]

    # AVOID：有矛盾扣分的優先 —— 扣分越重、原始分（表面強度）越高，越容易誤判，越該排前面
    # 注意：AVOID 表格只「顯示」前 5 檔最該警惕的，但排除到 TODAY/TRIGGER 之外的範圍是
    #   「全部」有矛盾扣分的候選（conflicted_symbols），不能只排除進了 AVOID 前 5 名的那幾檔——
    #   否則矛盾扣分較輕、沒排進 AVOID 前 5 名的候選會漏網跑進 TODAY/TRIGGER，
    #   等於矛盾被「稀釋掉」而不是被攔下來，違背「矛盾 = 風險，不是中性」這個核心原則
    conflicted = [(r, sc) for r, sc in scored if sc["conflict_penalty"] > 0]
    conflicted.sort(key=lambda x: (-x[1]["conflict_penalty"], -x[1]["raw_total"]))
    avoid = conflicted[:5]
    conflicted_symbols = {r.get("symbol") for r, _ in conflicted}

    clean = [(r, sc) for r, sc in scored if r.get("symbol") not in conflicted_symbols]
    clean.sort(key=lambda x: -x[1]["total"])

    today = [(r, sc) for r, sc in clean
             if sc["trend_state"] == "多頭" and sc["pv_verdict"] in PV_CONFIRMED][:5]
    today_symbols = {r.get("symbol") for r, _ in today}

    trigger = [(r, sc) for r, sc in clean
               if r.get("symbol") not in today_symbols
               and (sc["trend_state"] == "收斂" or sc["pv_verdict"] in PV_EARLY)][:5]
    trigger_symbols = {r.get("symbol") for r, _ in trigger}

    # backfill：真實資料不一定剛好湊滿 5 檔嚴格符合條件的，用下一名分數補滿，
    #   維持「每組都有東西看」而不是空著（缺資料 ≠ 沒機會，只是沒有嚴格符合當天的分類條件）
    if len(today) < 5:
        backfill = [(r, sc) for r, sc in clean
                    if r.get("symbol") not in today_symbols and r.get("symbol") not in trigger_symbols]
        today += backfill[:5 - len(today)]
        today_symbols = {r.get("symbol") for r, _ in today}
    if len(trigger) < 5:
        backfill = [(r, sc) for r, sc in clean
                    if r.get("symbol") not in today_symbols and r.get("symbol") not in trigger_symbols]
        trigger += backfill[:5 - len(trigger)]

    return today, trigger, avoid


def _sensor_trigger_text(sc):
    parts = []
    if sc["trend_state"] == "收斂":
        parts.append("Dow 收斂 → 突破確認多頭")
    if sc["pv_verdict"] in PV_EARLY:
        parts.append(f"量價轉強（{sc['pv_verdict']} → 健康多頭）")
    return " + ".join(parts) if parts else "量能／趨勢雙重確認"


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
    insider_data = load_insider_data()

    # 台股板塊報表（Phase 1）連結 · 只在檔案已存在時顯示，避免 Phase 1 第一次 CI 成功跑之前連到 404
    tw_report_path = os.path.join(REPORTS_DIR, "daily-tw-latest.html")
    tw_report_link = ' · <a href="daily-tw-latest.html">看台股板塊報表</a>' if os.path.exists(tw_report_path) else ''

    def _valuation_link(sym):
        """一鍵跳 valuation 頁 · 帶 ?ticker=X · 自動載入 PE/PBR/EPS/現金流/內部人分析"""
        if not sym:
            return ""
        s = escape(str(sym))
        return (f'<a href="../../valuation/index.html?ticker={s}" target="_blank" '
                f'title="開啟估值分析器 · PE / PBR / EPS / 現金流 / 內部人（新分頁）" '
                f'style="text-decoration:none;margin-left:3px;font-size:10px;opacity:0.7;">📊</a>')

    def _insider_badge(sym, compact=True):
        """回傳 HTML badge 或空字串 · sym: stock symbol · compact=True 為個股表用縮小"""
        d = insider_data.get(sym)
        if not d:
            return ""
        net = float(d.get("net_M", 0))
        top_officer_cnt = int(d.get("top_officer_cnt", 0))
        top_officer_val = float(d.get("top_officer_buy_M", 0))
        buyer = escape(d.get("top_buyer") or "")
        title = escape(d.get("top_title") or "")
        tip = f"近 90 天內部人淨 {net:+.2f}M · buy {d.get('buy_cnt',0)}/sell {d.get('sell_cnt',0)} · top officers {top_officer_cnt} (${top_officer_val:+.2f}M) · Top buyer: {buyer} {title}"
        # 分 4 級
        if net >= 1.0 and top_officer_cnt >= 1:
            bg, fg, emo = "#dcfce7", "#166534", "🔥"
        elif net >= 0.3 and top_officer_cnt >= 1:
            bg, fg, emo = "#dcfce7", "#166534", "👔"
        elif net >= 0.1:
            bg, fg, emo = "#dbeafe", "#1e40af", "▲"
        elif net <= -1.0:
            bg, fg, emo = "#fee2e2", "#991b1b", "▼"
        else:
            return ""  # 太小 · 不 badge
        sz = "9px" if compact else "10.5px"
        pad = "1px 5px" if compact else "2px 8px"
        return (f'<span style="background:{bg};color:{fg};padding:{pad};border-radius:6px;'
                f'font-size:{sz};font-weight:700;margin-left:4px;" title="{tip}">'
                f'{emo}{net:+.1f}M</span>')
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
        vlink = _valuation_link(r.get("symbol"))
        insider = _insider_badge(r.get("symbol"), compact=True)
        return f'''
        <tr>
          <td class="tag">{tag}</td>
          <td><b>{symbol}</b>{vlink}{insider} <span class="dim">{name}</span></td>
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

    # 感測器投資建議：TODAY（已形成）/ TRIGGER（等確認）/ AVOID（矛盾或風險過高）
    def _sensor_row(rank, r, sc, group):
        symbol = escape(r.get("symbol", ""))
        name = escape((r.get("name") or "")[:24])
        sector = escape(r.get("sector", ""))
        vlink = _valuation_link(r.get("symbol"))
        insider = _insider_badge(r.get("symbol"), compact=True)
        if group == "today":
            note = f'<span class="dim">{escape(r.get("stock_gap_alert") or sc["pv_verdict"] or "—")}</span>'
        elif group == "trigger":
            note = f'<span class="dim">🎯 {escape(_sensor_trigger_text(sc))}</span>'
        else:
            note = f'<span class="dow-conflict">{escape(sc["conflict_label"] or "—")}</span>'
        penalty_html = f' <span class="dim">(-{sc["conflict_penalty"]})</span>' if sc["conflict_penalty"] else ""
        return f'''
        <tr>
          <td class="n">{rank}</td>
          <td><b>{symbol}</b>{vlink}{insider} <span class="dim">{name}</span></td>
          <td>{sector}</td>
          <td class="n">{sc["s1"]}</td>
          <td class="n">{sc["s2"]}</td>
          <td class="n">{sc["s3"]}</td>
          <td class="n">{sc["s4"]}</td>
          <td class="n">{sc["s5"]}</td>
          <td class="n"><b>{sc["total"]}</b>{penalty_html}</td>
          <td>{note}</td>
        </tr>'''

    def _sensor_table(items, group, note_header, empty_msg):
        if not items:
            return f'<div class="empty" style="padding:10px 14px;">{empty_msg}</div>'
        rows_html = "".join(_sensor_row(i + 1, r, sc, group) for i, (r, sc) in enumerate(items))
        return f'''<table>
          <thead>
            <tr>
              <th></th><th>Symbol / Name</th><th>Sector</th>
              <th class="n" title="板塊強度：quadrant + 30d 資金流向 + 30d 訊號寬度">S1</th>
              <th class="n" title="個股強度：sector 內排名 + 動能方向 + 量價分數">S2</th>
              <th class="n" title="成交量確認：pv_verdict + 上漲/下跌日均量比">S3</th>
              <th class="n" title="趨勢完整性：Dow 型態 + 訊號">S4</th>
              <th class="n" title="位置/空間：離 52w 高點距離 + 暴漲判定 + gap alert">S5</th>
              <th class="n" title="S1+S2+S3+S4+S5，矛盾另外扣分（不平均掉）">Total</th>
              <th>{note_header}</th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>'''

    sensor_today, sensor_trigger, sensor_avoid = classify_sensor_signals(stage2, scorecard, exp_buckets)
    sensor_html = f'''
  <div class="card">
    <div class="card-h">🎯 感測器投資建議 · Opportunity Score<span class="n">{len(sensor_today) + len(sensor_trigger) + len(sensor_avoid)}</span></div>
    <div class="card-b" style="padding:0;">
      <div style="padding:12px 14px 0;font-size:12.5px;color:var(--muted);line-height:1.6;">
        找「資金正在進入、但價格還沒完全反映」的地方：<b>S1 板塊變強</b> + <b>S2 個股變強</b> + <b>S3 成交量確認</b> +
        <b>S4 趨勢沒破壞</b> + <b>S5 還沒過度遠離合理進場位置</b>，五個同時成立才算真正機會。
        <b>訊號矛盾（強動能但 Dow 結構已破壞 / 已列追高風險）直接扣總分，不是平均掉</b>——表面很強但結構有問題的標的會被攔進 AVOID。
      </div>
      <div style="padding:14px 14px 4px;font-weight:700;">🟢 TODAY · 已形成機會</div>
      {_sensor_table(sensor_today, "today", "備註", "今日無已形成的高分機會 · 資料日期可能較舊或候選池為空")}
      <div style="padding:16px 14px 4px;font-weight:700;">🔵 TRIGGER · 等待確認</div>
      {_sensor_table(sensor_trigger, "trigger", "Trigger（升級 TODAY 需要的條件）", "今日無等待確認的候選")}
      <div style="padding:16px 14px 4px;font-weight:700;">🔴 AVOID · 訊號矛盾或風險過高</div>
      {_sensor_table(sensor_avoid, "avoid", "矛盾 / 風險", "今日無明顯矛盾或風險標的")}
    </div>
  </div>'''

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
                vlink = _valuation_link(r.get("symbol"))
                lis.append(f'<li><span><b>{sym}</b>{vlink}{new_badge} <span class="sec">{sec}</span></span><span class="dim">{pt_s} · 26W {c26_s}</span></li>')
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

    # 【新 v2】30 日資金流向獨立卡（配合深度儀表板 30d 流向 column 展開）
    def _flow_ratio_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        pct = vf * 100
        if pct >= 15: cls, tag = "up", "🟢"
        elif pct >= 5: cls, tag = "up", "▲"
        elif pct <= -15: cls, tag = "down", "🔴"
        elif pct <= -5: cls, tag = "down", "▼"
        else: cls, tag = "flat", "▪"
        return f'<td class="n {cls}">{tag} {pct:+.1f}%</td>'

    def _net_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        cls = "up" if vf > 0 else ("down" if vf < 0 else "flat")
        return f'<td class="n {cls}">{vf:+,.0f}M</td>'

    def _updays_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        pct = vf * 100
        cls = "up" if pct >= 55 else ("down" if pct <= 45 else "flat")
        return f'<td class="n {cls}">{pct:.0f}%</td>'

    def _ret_cell(v):
        if v is None: return '<td class="n dim">—</td>'
        try: vf = float(v)
        except: return f'<td class="n">{v}</td>'
        cls = "up" if vf > 0 else ("down" if vf < 0 else "flat")
        return f'<td class="n {cls}">{vf:+.1f}%</td>'

    flow_rows = []
    flow_sorted = sorted(rows, key=lambda r: -(r.get("flow_ratio") if r.get("flow_ratio") is not None else -999))
    for r in flow_sorted:
        gross = r.get("flow_30d_gross_M")
        flow_rows.append(
            f'<tr>'
            f'<td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>'
            + _ret_cell(r.get("ret_5d"))
            + _ret_cell(r.get("ret_20d"))
            + _ret_cell(r.get("ret_13w"))
            + _net_cell(r.get("flow_30d_net_M"))
            + f'<td class="n dim">{f"{gross:,.0f}M" if gross is not None else "—"}</td>'
            + _flow_ratio_cell(r.get("flow_ratio"))
            + _updays_cell(r.get("flow_up_ratio"))
            + '</tr>'
        )
    flow_html = f'''
  <div class="card">
    <div class="card-h">💰 板塊 30 日資金流向 <span class="n">Σ 成交金額 × 方向 · 30 交易日</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Sector ETF</th>
              <th class="n" title="近 5 交易日報酬">5d</th>
              <th class="n" title="近 20 交易日 (~1 月) 報酬">20d</th>
              <th class="n" title="近 65 交易日 (~3 月) 報酬">65d</th>
              <th class="n" title="Σ(volume × close × sign(Δclose)) · +淨買入 / -淨賣出">淨流入 $M</th>
              <th class="n" title="Σ(volume × close) · 30 日總成交金額">總成交 $M</th>
              <th class="n" title="net / gross · -100% ~ +100% · 跨 sector 可比">流向比</th>
              <th class="n" title="30 日中 ETF 收盤上漲的天數 %">ETF 上漲天</th></tr>
        </thead>
        <tbody>{"".join(flow_rows)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;">🟢 ≥+15% 強力吸金 · ▲ ≥+5% 溫和流入 · ▪ 中性 · ▼ ≤-5% 流出 · 🔴 ≤-15% 強力賣壓</div>
    </div>
  </div>'''

    # 【新 v2】個股層 20 日資金流向 Top 榜（用 ud_ratio 當 proxy）
    stock_inflow, stock_outflow = load_all_csv_stock_flow(as_of, top_n=15)

    def _stock_flow_row(s, is_inflow):
        sym = escape(s.get("symbol", ""))
        sec = escape((s.get("sector") or "")[:8])
        name = escape((s.get("name") or "")[:14])
        ud = s["_ud_ratio"]
        upd = s["_up_days"]
        dnd = s["_down_days"]
        ret20 = s["_ret_20d"]
        price = s["_t_price"]
        ret_cls = "up" if ret20 > 0 else ("down" if ret20 < 0 else "flat")
        if is_inflow:
            ud_disp = f'<span class="up">▲ {ud:.2f}</span>'
            days_disp = f'<span class="up">{upd}</span>/<span class="dim">{dnd}</span>'
        else:
            ud_disp = f'<span class="down">▼ {ud:.2f}</span>'
            days_disp = f'<span class="dim">{upd}</span>/<span class="down">{dnd}</span>'
        vlink = _valuation_link(s.get("symbol"))
        insider = _insider_badge(s.get("symbol"), compact=True)
        return (
            f'<tr>'
            f'<td><b>{sym}</b>{vlink}{insider} <span class="dim">{name}</span></td>'
            f'<td class="dim">{sec}</td>'
            f'<td class="n">{price:.2f}</td>'
            f'<td class="n {ret_cls}">{ret20:+.1f}%</td>'
            f'<td class="n">{days_disp}</td>'
            f'<td class="n">{ud_disp}</td>'
            f'</tr>'
        )

    inflow_rows = "".join(_stock_flow_row(s, True) for s in stock_inflow) \
        or '<tr><td colspan="6" class="empty">今日無資金明顯流入個股</td></tr>'
    outflow_rows = "".join(_stock_flow_row(s, False) for s in stock_outflow) \
        or '<tr><td colspan="6" class="empty">今日無資金明顯流出個股</td></tr>'

    stock_flow_html = f'''
  <div class="card">
    <div class="card-h">💵 個股層 20 日資金流向 Top 榜 <span class="n">from all.csv · ud_ratio 排序</span></div>
    <div class="card-b" style="padding:14px 18px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
          <h4 style="margin:0 0 8px;color:var(--green);font-size:13px;">
            🟢 資金流入 Top {len(stock_inflow)}
            <span class="dim" style="font-weight:400;font-size:11px;">· ud≥1.5 + 上漲天≥12</span>
          </h4>
          <table style="font-size:12px;">
            <thead><tr>
              <th>Symbol</th><th>Sec</th><th class="n">價</th>
              <th class="n">20d</th><th class="n" title="上漲天/下跌天">漲/跌天</th>
              <th class="n" title="上漲日均量/下跌日均量 · &gt;1 = 買方壓過賣方">u/d</th>
            </tr></thead>
            <tbody>{inflow_rows}</tbody>
          </table>
        </div>
        <div>
          <h4 style="margin:0 0 8px;color:var(--red);font-size:13px;">
            🔴 資金流出 Top {len(stock_outflow)}
            <span class="dim" style="font-weight:400;font-size:11px;">· ud≤0.7 + 下跌天≥12</span>
          </h4>
          <table style="font-size:12px;">
            <thead><tr>
              <th>Symbol</th><th>Sec</th><th class="n">價</th>
              <th class="n">20d</th><th class="n" title="上漲天/下跌天">漲/跌天</th>
              <th class="n" title="上漲日均量/下跌日均量 · &lt;1 = 賣方壓過買方">u/d</th>
            </tr></thead>
            <tbody>{outflow_rows}</tbody>
          </table>
        </div>
      </div>
      <div class="dim" style="font-size:11px;margin-top:10px;line-height:1.6;">
        <b>ud_ratio</b> = 20 日中「上漲日的平均成交量」÷「下跌日的平均成交量」·
        &gt;1 表示買方成交量壓過賣方 (accumulation) · &lt;1 表示賣方壓過買方 (distribution) ·
        比 net dollar volume 更能濾掉單日爆量雜訊
      </div>
    </div>
  </div>'''

    # 【新 v2】按 sector 挑資金流入 Top 3 · 過濾多頭比 > 50%
    # 對照 Trend Core「板塊底部有力的個股組合」· 過濾掉空頭主導的 sector
    sector_flow_map = load_all_csv_stock_flow_by_sector(as_of, per_sector=3)

    # 先建 sector_name_en -> row 的映射（含 breadth_30d_ratio）
    sec_lookup = {r.get("sector_name_en"): r for r in rows if r.get("sector_name_en")}

    def _mini_stock_row(s):
        sym = escape(s.get("symbol", ""))
        name = escape((s.get("name") or "")[:20])
        ud = s["_ud_ratio"]
        upd = s["_up_days"]
        dnd = s["_down_days"]
        ret20 = s["_ret_20d"]
        ret5 = s["_ret_5d"]
        price = s["_t_price"]
        cls5 = "up" if ret5 > 0 else ("down" if ret5 < 0 else "flat")
        cls20 = "up" if ret20 > 0 else ("down" if ret20 < 0 else "flat")
        badge = _insider_badge(s.get("symbol"), compact=True)
        vlink = _valuation_link(s.get("symbol"))
        return (
            f'<tr>'
            f'<td><b>{sym}</b>{vlink}{badge} <span class="dim" style="font-size:11px;">{name}</span></td>'
            f'<td class="n">{price:.2f}</td>'
            f'<td class="n {cls5}">{ret5:+.1f}%</td>'
            f'<td class="n {cls20}">{ret20:+.1f}%</td>'
            f'<td class="n dim">{upd}/{dnd}</td>'
            f'<td class="n up">▲ {ud:.2f}</td>'
            f'</tr>'
        )

    # 只列多頭比 > 50% 的 sector · 按多頭比 desc 排序
    qual_sectors = sorted(
        [r for r in rows if (r.get("breadth_30d_ratio") or 0) > 50],
        key=lambda r: -(r.get("breadth_30d_ratio") or 0)
    )

    per_sec_blocks = []
    for r in qual_sectors:
        sec_en = r.get("sector_name_en")
        sec_zh = r.get("sector_name")
        sec_etf = r.get("sector")
        breadth = r.get("breadth_30d_ratio") or 0
        stocks = sector_flow_map.get(sec_en) or []
        if not stocks:
            body = '<div class="empty" style="padding:8px;font-size:11.5px;">此 sector 目前無符合 ud≥1.5 + 上漲天≥12 的個股</div>'
        else:
            rows_html = "".join(_mini_stock_row(s) for s in stocks)
            body = f'''
            <table style="font-size:11.5px;">
              <thead>
                <tr>
                  <th>Symbol</th><th class="n">價</th>
                  <th class="n">5d</th><th class="n">20d</th>
                  <th class="n" title="上漲天/下跌天">漲/跌</th>
                  <th class="n" title="ud_ratio">u/d</th>
                </tr>
              </thead>
              <tbody>{rows_html}</tbody>
            </table>'''
        # 頭部 badge · 多頭比顏色
        br_color = "#166534" if breadth >= 70 else ("#1e40af" if breadth >= 55 else "#6b7280")
        per_sec_blocks.append(f'''
        <div style="background:#f9fafb;border-radius:8px;padding:10px 12px;border-left:3px solid {br_color};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;">{escape(sec_zh)} <span class="dim" style="font-weight:400;">{escape(sec_etf)}</span></div>
            <div style="font-size:11px;color:{br_color};font-weight:700;">多頭比 {breadth:.1f}%</div>
          </div>
          {body}
        </div>''')

    if per_sec_blocks:
        # 3 column responsive grid
        per_sec_html = f'''
  <div class="card">
    <div class="card-h">🎯 每 Sector 資金流入 Top 3 <span class="n">多頭比 &gt; 50% · ud_ratio 排序</span></div>
    <div class="card-b">
      <div class="dim" style="font-size:11.5px;margin-bottom:10px;line-height:1.5;">
        只列出 <b>30 日訊號比多頭比 &gt; 50%</b> 的 sector · 每 sector 挑 3 支資金流入最強個股（ud_ratio 大） ·
        用「bottom-up」找 healthy sector 內的具體標的 · 迴避 XLU / XLRE 這種空頭主導 sector 的個股
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;">
        {"".join(per_sec_blocks)}
      </div>
    </div>
  </div>'''
    else:
        per_sec_html = ""

    # 【新 v2】自動化投資 playbook：分類 + 3 種組合
    # 從「每 sector Top 3」的 pool 中按固定門檻自動分類
    def _build_playbook(sector_flow_map, qual_sectors):
        all_stocks = []
        seen = set()
        for sec_r in qual_sectors:
            sec_en = sec_r.get("sector_name_en")
            sec_zh = sec_r.get("sector_name")
            sec_etf = sec_r.get("sector")
            for s in (sector_flow_map.get(sec_en) or []):
                sym = s.get("symbol")
                if sym in seen: continue
                seen.add(sym)
                s["_sec_zh"] = sec_zh
                s["_sec_en"] = sec_en
                s["_sec_etf"] = sec_etf
                all_stocks.append(s)
        # 分類（互斥門檻）
        # 主升段龍頭: 20d ≥ 15% AND ud ≥ 1.7
        leaders = sorted(
            [s for s in all_stocks if s["_ret_20d"] >= 15 and s["_ud_ratio"] >= 1.7],
            key=lambda s: -s["_ret_20d"]
        )
        leader_syms = {s["symbol"] for s in leaders}
        # 剛啟動: 5d ≥ 4% AND ud ≥ 1.7 · 排除已在 leaders
        breakouts = sorted(
            [s for s in all_stocks
             if s["_ret_5d"] >= 4 and s["_ud_ratio"] >= 1.7 and s["symbol"] not in leader_syms],
            key=lambda s: -s["_ret_5d"]
        )
        # 動能疲軟: 5d ≤ -1.5% AND 20d ≥ 5%
        weakening = sorted(
            [s for s in all_stocks if s["_ret_5d"] <= -1.5 and s["_ret_20d"] >= 5],
            key=lambda s: s["_ret_5d"]
        )
        # 組合 A · 短線動能追漲: leaders + breakouts 中 5d 正的 Top 6 按 5d desc
        combo_a = sorted(
            [s for s in (leaders + breakouts) if s["_ret_5d"] > 0],
            key=lambda s: -s["_ret_5d"]
        )[:6]
        # 組合 B · 中線分散配置: 每 sector 挑 ud 最高一支
        combo_b_map = {}
        for s in all_stocks:
            sec = s["_sec_en"]
            if sec not in combo_b_map or s["_ud_ratio"] > combo_b_map[sec]["_ud_ratio"]:
                combo_b_map[sec] = s
        combo_b = sorted(combo_b_map.values(), key=lambda s: -s["_ud_ratio"])
        # 組合 C · 底部反轉: 20d < 8% (未大漲) AND ud ≥ 1.5 · Top 6 按 ud desc
        combo_c = sorted(
            [s for s in all_stocks if 0 <= s["_ret_20d"] < 8 and s["_ud_ratio"] >= 1.5],
            key=lambda s: -s["_ud_ratio"]
        )[:6]
        return leaders, breakouts, weakening, combo_a, combo_b, combo_c

    leaders, breakouts, weakening, combo_a, combo_b, combo_c = _build_playbook(sector_flow_map, qual_sectors)

    def _pb_row(s, extra_col=""):
        sym = escape(s.get("symbol", ""))
        sec_zh = escape(s.get("_sec_zh") or "")
        sec_etf = escape(s.get("_sec_etf") or "")
        ud = s["_ud_ratio"]
        ret5 = s["_ret_5d"]
        ret20 = s["_ret_20d"]
        cls5 = "up" if ret5 > 0 else ("down" if ret5 < 0 else "flat")
        cls20 = "up" if ret20 > 0 else ("down" if ret20 < 0 else "flat")
        weight_col = f'<td class="n">{extra_col}</td>' if extra_col else ""
        badge = _insider_badge(s.get("symbol"), compact=True)
        vlink = _valuation_link(s.get("symbol"))
        return (
            f'<tr>'
            f'<td><b>{sym}</b>{vlink}{badge}</td>'
            f'<td class="dim" style="font-size:11px;">{sec_zh} {sec_etf}</td>'
            f'<td class="n {cls5}">{ret5:+.1f}%</td>'
            f'<td class="n {cls20}">{ret20:+.1f}%</td>'
            f'<td class="n up">▲ {ud:.2f}</td>'
            + weight_col
            + '</tr>'
        )

    def _pb_table(stocks, weight_pct=None, show_header=True):
        if not stocks:
            return '<div class="empty" style="padding:8px;font-size:11.5px;">無符合條件</div>'
        w_col = f'<th class="n" title="等權重建議倉位">建議 %</th>' if weight_pct is not None else ""
        rows = []
        for s in stocks:
            extra = f"{weight_pct:.0f}%" if weight_pct is not None else ""
            rows.append(_pb_row(s, extra))
        return f'''
        <table style="font-size:11.5px;">
          <thead>
            <tr>
              <th>Symbol</th><th>Sector</th>
              <th class="n">5d</th><th class="n">20d</th>
              <th class="n">ud</th>
              {w_col}
            </tr>
          </thead>
          <tbody>{"".join(rows)}</tbody>
        </table>'''

    def _pb_card(title, subtitle, bg, fg, stocks, weight_pct=None, description=""):
        w_note = f'<div class="dim" style="font-size:10.5px;margin-top:4px;">等權重 · 每支 {weight_pct:.0f}%</div>' if weight_pct is not None else ""
        desc_html = f'<div style="font-size:11.5px;color:{fg};margin-bottom:6px;line-height:1.4;">{description}</div>' if description else ""
        return f'''
        <div style="background:{bg};padding:10px 12px;border-radius:8px;border-left:3px solid {fg};">
          <div style="font-size:13px;font-weight:700;color:{fg};margin-bottom:2px;">{title}
            <span style="font-weight:400;font-size:11px;">({len(stocks)})</span></div>
          <div class="dim" style="font-size:10.5px;margin-bottom:6px;">{subtitle}</div>
          {desc_html}
          {_pb_table(stocks, weight_pct)}
          {w_note}
        </div>'''

    # 3 個分類卡（同一 row）
    classify_html = f'''
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:10px;margin-bottom:12px;">
        {_pb_card("🏆 主升段龍頭", "20d ≥ +15% + ud ≥ 1.7",
                 "#fffbeb", "#92400e", leaders,
                 description="動能已確認 · 資金持續 accumulation · 適合順勢持有 · 但已在高位 · 追高有拉回風險")}
        {_pb_card("🚀 剛啟動 5d 爆量", "5d ≥ +4% + ud ≥ 1.7 · 未在主升段",
                 "#eff6ff", "#1e40af", breakouts,
                 description="近 1 週突然放量上漲 · 可能是新一波啟動 · 適合短線追動能 · 但需 confirm 續強")}
        {_pb_card("⚠️ 動能疲軟需觀察", "5d ≤ -1.5% + 20d ≥ +5%",
                 "#fef2f2", "#991b1b", weakening,
                 description="20d 賺了不少但近週開始拉回 · 可能是短線頂 · 減碼 / 停利觀察 · 別追高")}
      </div>'''

    # 3 個組合卡
    combo_a_w = 100 / len(combo_a) if combo_a else None
    combo_b_w = 100 / len(combo_b) if combo_b else None
    combo_c_w = 100 / len(combo_c) if combo_c else None
    portfolio_html = f'''
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:10px;">
        {_pb_card("💨 組合 A · 短線動能追漲", "leaders + breakouts 中 5d 正 · 按 5d desc Top 6",
                 "#fef3c7", "#92400e", combo_a, weight_pct=combo_a_w,
                 description="持有天期 5-10 天 · 追短期爆發個股 · 停利設 +8% / 停損 -4%")}
        {_pb_card("⚖️ 組合 B · 中線分散配置", "每 sector 挑 ud 最高一支 · 分散 9 板塊",
                 "#dcfce7", "#166534", combo_b, weight_pct=combo_b_w,
                 description="持有天期 1-3 個月 · 跨 sector 分散風險 · 對抗單一板塊 rotation")}
        {_pb_card("🌱 組合 C · 底部反轉", "20d 尚未大漲 (0-8%) + ud ≥ 1.5",
                 "#dbeafe", "#1e40af", combo_c, weight_pct=combo_c_w,
                 description="持有天期 3-6 個月 · 低位健康 accumulation · 潛在補漲 · 適合逆勢")}
      </div>'''

    playbook_html = f'''
  <div class="card">
    <div class="card-h">📖 投資 Playbook · 分類 + 3 種組合 <span class="n">Universe: 每 sector Top 3 (9 sector × 3 = 27 支)</span></div>
    <div class="card-b">
      <div class="dim" style="font-size:11.5px;margin-bottom:10px;line-height:1.5;">
        從上方「每 sector Top 3」的 27 支健康個股 pool 中 · 依固定門檻自動分類與組合 ·
        <b>分類</b>幫你認清每支個股的狀態；<b>組合</b>幫你直接執行不同時間框架的策略。
        建議倉位為等權重 · 實際下單前需自行檢查基本面 / 財報 / 停損位。
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px;">🔬 個股分類（互斥門檻）</div>
      {classify_html}
      <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px;margin-top:6px;">📦 可執行投資組合（等權重）</div>
      {portfolio_html}
      <div class="dim" style="font-size:10.5px;margin-top:10px;line-height:1.5;">
        <b>方法論</b>：組合 A 從「主升段龍頭 + 剛啟動」中挑 5d 正的 → 追爆發動能 ·
        組合 B 從 27 支每 sector 挑 ud 最高一支 → 跨 sector 均衡 ·
        組合 C 從 20d &lt; 8% 但 ud ≥ 1.5 的 → 尚未起漲但已 accumulation 的候選<br>
        <b>👔 內部人加持 badge</b>（近 90 天 SEC Form 4 · Yahoo Finance）：
        <span style="background:#dcfce7;color:#166534;padding:1px 5px;border-radius:6px;font-size:10px;">🔥 ≥+1M + officer buy</span> 極強 ·
        <span style="background:#dcfce7;color:#166534;padding:1px 5px;border-radius:6px;font-size:10px;">👔 ≥+0.3M + officer</span> 強 ·
        <span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:6px;font-size:10px;">▲ ≥+0.1M</span> 中 ·
        <span style="background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:6px;font-size:10px;">▼ ≤-1M</span> 派發警訊
      </div>
    </div>
  </div>'''

    # 【新 v2】內部人買入 Top summary（獨立卡 · 過濾整個 pool）
    def _build_insider_top():
        if not insider_data:
            return ""
        items = []
        for sym, d in insider_data.items():
            net = float(d.get("net_M", 0))
            if net < 0.1: continue
            items.append({"symbol": sym, **d})
        if not items:
            return ""
        # Top 10 by net_M
        items.sort(key=lambda x: -x["net_M"])
        rows_html = []
        for it in items[:15]:
            sym = escape(it["symbol"])
            net = it["net_M"]
            buy = it.get("buy_cnt", 0)
            sell = it.get("sell_cnt", 0)
            ofc = it.get("top_officer_cnt", 0)
            ofc_val = it.get("top_officer_buy_M", 0)
            buyer = escape((it.get("top_buyer") or "")[:22])
            title = escape((it.get("top_title") or "")[:22])
            cls = "up" if net > 0 else "down"
            ofc_cell = f'<span class="up">{ofc} (${ofc_val:+.2f}M)</span>' if ofc else '<span class="dim">—</span>'
            vlink = _valuation_link(it["symbol"])
            rows_html.append(
                f'<tr>'
                f'<td><b>{sym}</b>{vlink}</td>'
                f'<td class="n {cls}"><b>${net:+.2f}M</b></td>'
                f'<td class="n dim">{buy}/{sell}</td>'
                f'<td class="n">{ofc_cell}</td>'
                f'<td class="dim" style="font-size:11px;">{buyer}</td>'
                f'<td class="dim" style="font-size:11px;">{title}</td>'
                f'</tr>'
            )
        return f'''
  <div class="card">
    <div class="card-h">👔 內部人買入 Top 15 <span class="n">近 90 天 SEC Form 4 · pool {len(insider_data)} 支</span></div>
    <div class="card-b" style="padding:0;">
      <table>
        <thead>
          <tr><th>Symbol</th>
              <th class="n" title="淨買 - 賣 · 單位百萬">淨買 $M</th>
              <th class="n" title="90 天 buy 筆數 / sell 筆數">buy/sell</th>
              <th class="n" title="決策層買入 (CEO/CFO/President/Chairman/COO/10%)">Top Officer</th>
              <th>Top Buyer</th><th>Title</th></tr>
        </thead>
        <tbody>{"".join(rows_html)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;">
        <b>資料源</b>：Yahoo Finance insider_transactions (SEC Form 4 aggregated) · 只 enrich pool 內候選（ud≥1.5 + 上漲天≥12） ·
        <b>決策層</b>買入權重最高 · Purchase code = 開市買入 (最有信息含量) · 過濾了 10b5-1 計劃性交易外的自主買入
      </div>
    </div>
  </div>'''

    insider_top_html = _build_insider_top()

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

    def _divergence_scenario(breadth_ratio, etf_up_ratio):
        """比對 個股多頭比 vs ETF 上漲天 · 判 5 種情境
        Returns (emoji, label, tooltip)
        """
        if breadth_ratio is None or etf_up_ratio is None:
            return ("—", "—", "資料不足")
        b = float(breadth_ratio)          # 0-100
        e = float(etf_up_ratio) * 100     # 0-100
        diff = b - e                       # 正 = 個股領先, 負 = ETF 領先
        if diff >= 15 and b >= 55:
            return ("🔵", "健康補漲", f"個股寬度領先 ETF {diff:+.0f}% · 中小型廣泛走多但權值股卡住 · 等 catch up · 底部反轉候選")
        elif diff <= -15 and e >= 55:
            return ("🟠", "多頭衰竭", f"ETF 上漲天領先個股寬度 {-diff:+.0f}% · 幾支權值股獨撐 · 中小型走弱 · 頂部背離警訊")
        elif abs(diff) < 15 and b >= 55 and e >= 55:
            return ("🟢", "齊步多頭", "個股 + ETF 一致偏多 · 健康趨勢")
        elif abs(diff) < 15 and b < 45 and e < 45:
            return ("🔴", "齊步空頭", "個股 + ETF 一致偏空 · 別接刀")
        elif diff >= 15:
            return ("🔵", "板塊分化", f"個股寬度領先 {diff:+.0f}% 但整體偏弱 · 板塊分化 · 個股層面找標的")
        elif diff <= -15:
            return ("🟠", "板塊分化", f"ETF 領先 {-diff:+.0f}% 但個股寬度弱 · 權值獨撐 · 對 ETF 小心")
        else:
            return ("⚪", "中性", "個股 + ETF 一致中性 · 觀望")

    # 依 label 分組列出重點解讀（過濾 中性 / 齊步空頭 不列 · 只列有 actionable 訊號的）
    def _render_divergence_details(dmap):
        buckets = {}
        for (sn, sc, emo, lbl, tip, b, e) in dmap:
            buckets.setdefault(lbl, []).append((sn, sc, emo, tip, b, e))
        order = ["健康補漲", "多頭衰竭", "齊步多頭", "板塊分化", "齊步空頭", "中性"]
        style_map = {
            "健康補漲": ("#dbeafe", "#1e40af", "🔵",
                       "個股寬度領先 ETF 15% 以上 · 中小型廣泛走多但權值股卡住 → **底部反轉候選**（等權值 catch up）"),
            "多頭衰竭": ("#fee2e2", "#991b1b", "🟠",
                       "ETF 上漲天領先個股寬度 15% 以上 · 幾支權值股獨撐 · 中小型走弱 → **頂部背離警訊**"),
            "齊步多頭": ("#dcfce7", "#166534", "🟢",
                       "個股 + ETF 一致偏多（都 ≥55%）→ 健康趨勢 · 順勢持有"),
            "板塊分化": ("#fef3c7", "#92400e", "🟠",
                       "個股寬度與 ETF 差距大但整體偏弱 → 板塊分化 · 從個股層面找標的"),
            "齊步空頭": ("#e2e8f0", "#475569", "🔴",
                       "個股 + ETF 一致偏空（都 &lt;45%）→ 別接刀 · 等基本面訊號翻轉"),
        }
        blocks = []
        for lbl in order:
            if lbl == "中性": continue
            items = buckets.get(lbl, [])
            if not items: continue
            bg, fg, emo, hdr_tip = style_map.get(lbl, ("#f3f4f6", "#6b7280", "⚪", ""))
            lis = []
            for (sn, sc, _e, tip, b, e) in items:
                b_s = f"{b:.1f}%" if b is not None else "—"
                e_s = f"{e*100:.0f}%" if e is not None else "—"
                lis.append(
                    f'<li style="margin:4px 0;line-height:1.5;">'
                    f'<b style="color:{fg};">{escape(sn)}</b> <span class="dim">{escape(sc)}</span> · '
                    f'個股多頭比 <b>{b_s}</b> vs ETF 上漲天 <b>{e_s}</b>'
                    f'<div style="color:#4b5563;font-size:11.5px;margin-left:12px;margin-top:2px;">{escape(tip)}</div>'
                    f'</li>'
                )
            blocks.append(
                f'<div style="background:{bg};padding:10px 14px;border-radius:8px;'
                f'border-left:4px solid {fg};margin:8px 0;">'
                f'<div style="font-size:13px;font-weight:700;color:{fg};margin-bottom:4px;">{emo} {lbl} ({len(items)})</div>'
                f'<div style="font-size:11.5px;color:{fg};margin-bottom:6px;">{hdr_tip}</div>'
                f'<ul style="margin:0;padding-left:16px;font-size:12px;">{"".join(lis)}</ul>'
                f'</div>'
            )
        if not blocks:
            return '<div class="dim" style="padding:8px 14px;font-size:11px;">今日無顯著背離 · 各板塊個股寬度與 ETF 走勢一致</div>'
        return f'<div style="padding:8px 14px;"><div class="dim" style="font-size:11px;margin-bottom:6px;font-weight:600;">🔍 重點解讀（按情境分組 · 僅列 actionable 訊號）</div>{"".join(blocks)}</div>'

    # 收集 sector -> (emoji, label, tip) 給下方解讀區用
    divergence_map = []  # [(sector_name, sector, emoji, label, tip, b, e)]

    breadth30_rows = []
    br_sorted = sorted(rows, key=lambda r: -(r.get("breadth_30d_ratio") or -1))
    for r in br_sorted:
        u = r.get("breadth_30d_up")
        d = r.get("breadth_30d_down")
        tot = (u or 0) + (d or 0)
        etf_up = r.get("flow_up_ratio")
        etf_up_pct = f"{etf_up*100:.0f}%" if etf_up is not None else "—"
        emo, lbl, tip = _divergence_scenario(r.get("breadth_30d_ratio"), etf_up)
        divergence_map.append((r["sector_name"], r["sector"], emo, lbl, tip,
                               r.get("breadth_30d_ratio"), etf_up))
        badge_cls = {
            "健康補漲": "b-early_reversal",
            "多頭衰竭": "b-overheated",
            "齊步多頭": "b-sweet_spot",
            "齊步空頭": "b-cold",
            "板塊分化": "b-coiling",
            "中性": "b-neutral",
        }.get(lbl, "b-neutral")
        breadth30_rows.append(
            f'<tr>'
            f'<td><b>{escape(r["sector_name"])}</b> <span class="dim">{escape(r["sector"])}</span></td>'
            f'<td class="n up">{u if u is not None else "—"}</td>'
            f'<td class="n down">{d if d is not None else "—"}</td>'
            f'<td class="n dim">{tot}</td>'
            + _ratio_cell(r.get("breadth_30d_ratio"))
            + f'<td class="n dim">{etf_up_pct}</td>'
            + f'<td><span class="badge {badge_cls}" title="{escape(tip)}">{emo} {lbl}</span></td>'
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
              <th class="n" title="up / (up+down) · 板塊過去 30 日訊號寬度">多頭比</th>
              <th class="n" title="ETF 收盤上漲天數 % · 從資金流向表拉">ETF 上漲天</th>
              <th title="比對 個股多頭比 vs ETF 上漲天 · 判 5 種情境">背離判定</th></tr>
        </thead>
        <tbody>{"".join(breadth30_rows)}</tbody>
      </table>
      <div class="dim" style="padding:8px 14px;font-size:11px;line-height:1.6;">
        <b>多頭比：</b>🟢 ≥70% 強勢上升 · 🔵 ≥55% 上升主導 · ⚪ 中性 · 🔴 &lt;45% 空頭主導<br>
        <b>背離判定（個股多頭比 vs ETF 上漲天）：</b>
        <span style="color:#1e40af;">🔵 <b>健康補漲</b></span> 個股領先≥15% + 偏多 · 等權值 catch up ·
        <span style="color:#991b1b;">🟠 <b>多頭衰竭</b></span> ETF 領先≥15% + 表面強 · 權值獨撐 頂部背離 ·
        <span style="color:#166534;">🟢 <b>齊步多頭</b></span> 兩者一致偏多 ·
        <span style="color:#475569;">🔴 <b>齊步空頭</b></span> 兩者一致偏空 ·
        <span style="color:#92400e;">🟠 <b>板塊分化</b></span> 差距大但整體弱 · 板塊分化
      </div>
      {_render_divergence_details(divergence_map)}
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

  {flow_html}

  {stock_flow_html}

  {per_sec_html}

  {playbook_html}

  {insider_top_html}

  {breadth30_html}

  {regime_stats_html}

  {sensor_html}

  <div class="foot">
    <div class="conf">
      💎 <b>strong_buy</b> · 11-sample 1y avg <b>{num(sb_stats.get("avg"), 1, pct=True, sign=True)}</b> / 命中 <b>{num(sb_stats.get("hit_rate_pct"), 1, pct=True)}</b> (n={sb_stats.get("n","—")})
      &nbsp;·&nbsp;
      🚀 <b>explosive</b> · 1y avg <b>{num(exp_stats.get("avg"), 1, pct=True, sign=True)}</b> / 命中 <b>{num(exp_stats.get("hit_rate_pct"), 1, pct=True)}</b> (n={exp_stats.get("n","—")})
    </div>
    產生時間 {gen_ts} · <a href="../index.html">回主頁</a> · <a href="8-sample-analysis.html">看回測方法論</a> · <a href="backtest-summary.html">看 pipeline 回測</a>{tw_report_link}
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
