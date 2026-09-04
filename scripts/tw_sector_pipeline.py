#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股板塊輪動 Phase 1 pipeline  scripts/tw_sector_pipeline.py
=====================================================================
跟美股版（sector_scorecard.py + sector_rotation_screener.py）對齊的邏輯，但：
  - Layer 1（板塊）用 TWSE/TPEx 官方 industry_category 粗分類，不是 GICS 11 sectors
    （硬套 GICS 會失真——台股資金流動的顆粒度是「產業→次產業→供應鏈」，
    但次產業/供應鏈細分沒有官方機器可讀資料源，需要人工建映射表，留到 Phase 2）
  - S1-S5 感測器 + Opportunity Engine（TODAY/TRIGGER/AVOID）也留到 Phase 2 ·
    Phase 1 先把 Layer 0-3 資料地基跑通、產出真實資料的每日報表

  Layer 0  市場：0050（元大台灣50）當 TAIEX 代理指標（TAIEX 本身在 FinMind 用什麼
                 dataset/data_id 查沒有把握確認過，0050 是已知可行的 TaiwanStockPrice call）
  Layer 1  板塊：industry_category 分組 · Return（point）/ Acceleration / Breadth / Capital Flow
  Layer 2  個股：Dow 頭頭低/底底高趨勢 + 量價象限判定 + explosive_verdict
                （直接 import sector_rotation_screener.py 的通用演算法函式 ——
                  這些函式本來就是純數學/字串邏輯，不綁 yfinance，可以直接共用，
                  不用重寫一份、也不會跟已驗證過的美股版邏輯分岔）
  Layer 3  資金：三大法人（外資/投信/自營商）20 日淨買賣，個股 + 板塊聚合

資料源：FinMind（免費 tier 300 次/小時）
  TaiwanStockInfo                          （bulk，不帶 data_id）全市場清單 + 官方產業分類
  TaiwanStockMarketValueWeight              （bulk）市值排名，抓前 N 大當股票池
                                             ⚠️ 這個 dataset 的確切欄位名沒有文件可查證過，
                                             用防禦性多欄位嘗試；抓不到/解析不出來就退回
                                             FALLBACK_SEED（人工列的常見大型股清單）保底
  TaiwanStockPrice                          個股日 OHLCV（每股 1 次）
  TaiwanStockInstitutionalInvestorsBuySell  個股法人買賣（每股 1 次）

股票池：市值前 UNIVERSE_SIZE 大（預設 100）。budget = N×2 + 3 固定開銷 ≈ 203 次/小時，
        在 FinMind 免費 300 次/小時額度內留有餘裕（S&P 500 版用 yfinance 沒有這個限制，
        這是台股版跟美股版架構上最大的差異）。

輸出：
  data/sector_rotation/tw_{YYYYMMDD}_all.csv          全股票池個股明細（跟美股 *_all.csv 對齊欄位精神）
  data/sector_rotation/tw_{YYYYMMDD}_scorecard.csv    板塊（industry_category）明細
  data/sector_rotation/tw_scorecard_latest.json       manifest
  data/sector_rotation/tw_latest.json                 個股 top3 榜單（給 Phase 2 報表/感測器重用）

手動跑：
  FINMIND_TOKEN=xxx python scripts/tw_sector_pipeline.py
  FINMIND_TOKEN=xxx python scripts/tw_sector_pipeline.py --as-of 2026-09-02   # 回放模式
"""
import os
import sys
import json
import math
import time
import argparse
from datetime import datetime, date, timezone, timedelta

import pandas as pd
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 重用美股版已經驗證過的通用演算法（純數學/字串邏輯，不綁 yfinance）：
#   _detect_trend      Dow Theory 頭頭低/底底高 swing detection
#   _pv_state/_pv_verdict  量價象限判定
#   _explosive_verdict     暴漲/追高風險綜合判定
#   _rsi14                 Wilder RSI(14)
#   _compute_vp_score_stock  量價絕對評分 0-100
#   _json_safe              NaN/Inf → None（寫 JSON 前處理）
from sector_rotation_screener import (
    _detect_trend,
    _pv_state,
    _pv_verdict,
    _explosive_verdict,
    _rsi14,
    _compute_vp_score_stock,
    _json_safe,
)

FINMIND_BASE = "https://api.finmindtrade.com/api/v4/data"
FINMIND_TOKEN = os.environ.get("FINMIND_TOKEN", "").strip()

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "tw_scorecard_latest.json")
STAGE2_PATH = os.path.join(OUTDIR, "tw_latest.json")

UNIVERSE_SIZE = 100          # 市值前 N 大 · budget = N×2 + 3 次（免費 tier 300 次/小時）
ACCEL_LOOKBACK_DAYS = 5
GAP_ALERT_THRESHOLD = 5
HISTORY_MONTHS = 14          # 抓 14 個月 daily ≈ 290 交易日，26W 量能變化需要 260 天 buffer

AS_OF_DATE = None  # type: ignore[assignment]  · 由 main() 從 --as-of 設定

# 保底大型股清單：TaiwanStockMarketValueWeight 抓取/解析失敗時的 fallback。
# 涵蓋半導體/電子/金融/傳產/航運/電信等主要族群的常見權值股，只是保底不是精選榜單。
FALLBACK_SEED = [
    "2330", "2317", "2454", "2308", "2382", "2412", "2881", "2882", "2891", "2886",
    "2884", "2892", "2885", "2880", "2883", "5880", "1301", "1303", "1326", "6505",
    "2603", "2609", "2615", "3711", "2379", "3034", "2357", "2395", "2408", "3008",
    "2327", "2345", "2352", "2377", "2409", "3231", "4938", "6669", "2474", "3037",
    "3045", "4904", "2049", "1216", "1101", "1102", "2002", "9910", "9904", "2207",
    "2201", "1590", "6415", "6488", "3661", "8046", "3443", "2059", "2301", "2324",
    "3702", "2059", "2385", "2059", "2492", "2059",
]
FALLBACK_SEED = list(dict.fromkeys(FALLBACK_SEED))  # 去重，保留原順序


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 0. FinMind 底層 fetch
# ============================================================
_request_count = 0


def fm_fetch(dataset, data_id=None, start_date=None, end_date=None, retries=2):
    """FinMind v4 API 呼叫，回傳 data 欄位（list of dict）。
    429（額度用完）不重試——免費 tier 額度是整點重置，重試只會多耗一次額度、沒有幫助。
    只有網路層級的暫時性錯誤（timeout/連線失敗）才重試。
    """
    global _request_count
    params = {"dataset": dataset}
    if data_id:
        params["data_id"] = data_id
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if FINMIND_TOKEN:
        params["token"] = FINMIND_TOKEN

    last_err = None
    for attempt in range(retries):
        _request_count += 1
        try:
            res = requests.get(FINMIND_BASE, params=params, timeout=30)
        except requests.RequestException as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{dataset}({data_id}) 網路錯誤: {e}")
        if res.status_code == 429:
            raise RuntimeError(f"{dataset}({data_id}) 額度用完（429，免費 tier 300 次/小時）")
        if not res.ok:
            raise RuntimeError(f"{dataset}({data_id}) HTTP {res.status_code}")
        try:
            body = res.json()
        except ValueError:
            raise RuntimeError(f"{dataset}({data_id}) 回傳非 JSON")
        msg = body.get("msg")
        if body.get("status") not in (200, None) and msg not in (None, "success"):
            raise RuntimeError(f"{dataset}({data_id}): {msg}")
        return body.get("data") or []
    if last_err:
        raise RuntimeError(f"{dataset}({data_id}) 重試 {retries} 次仍失敗: {last_err}")
    return []


# ============================================================
# 1. 股票池：市值前 N 大 + 官方產業分類
# ============================================================
def fetch_universe(as_of, size=UNIVERSE_SIZE):
    """
    1) TaiwanStockInfo（不帶 data_id）→ 全市場清單 + industry_category
       · 只留上市/上櫃普通股（type ∈ twse/tpex），濾掉 ETF（industry_category == 'ETF'）
       · 轉板股票會保留多列，取 date 最新那列
    2) TaiwanStockMarketValueWeight → 市值排名，取前 N 大
       · 抓不到/解析不出來 → 退回 FALLBACK_SEED 保底
    回傳 list[{stock_id, stock_name, industry_category}]，長度 <= size
    """
    info_rows = fm_fetch("TaiwanStockInfo")
    if not info_rows:
        raise RuntimeError("TaiwanStockInfo 沒抓到資料，股票池無法建立")

    info_by_id = {}
    for r in info_rows:
        sid = r.get("stock_id")
        if not sid:
            continue
        cat = r.get("industry_category") or ""
        typ = r.get("type") or ""
        if cat == "ETF" or typ not in ("twse", "tpex"):
            continue
        prev = info_by_id.get(sid)
        if prev is None or (r.get("date") or "") >= (prev.get("date") or ""):
            info_by_id[sid] = r

    ranked_ids = []
    try:
        mvw_rows = fm_fetch("TaiwanStockMarketValueWeight", start_date=as_of, end_date=as_of)
        if not mvw_rows:
            # 當日可能還沒入庫 · 往前找幾天
            base = datetime.strptime(as_of, "%Y-%m-%d").date()
            for back in range(1, 6):
                d = (base - timedelta(days=back)).strftime("%Y-%m-%d")
                mvw_rows = fm_fetch("TaiwanStockMarketValueWeight", start_date=d, end_date=d)
                if mvw_rows:
                    break

        def _mv(row):
            for k in ("market_value", "MarketValue", "TradingValue", "value", "weight", "Weight"):
                if k in row and row[k] not in (None, ""):
                    try:
                        return float(row[k])
                    except (TypeError, ValueError):
                        pass
            return None

        scored = [(r.get("stock_id"), _mv(r)) for r in mvw_rows if r.get("stock_id")]
        scored = [(sid, mv) for sid, mv in scored if mv is not None and sid in info_by_id]
        scored.sort(key=lambda x: -x[1])
        ranked_ids = [sid for sid, _ in scored[:size]]
        if ranked_ids:
            log(f"  股票池：TaiwanStockMarketValueWeight 排出 {len(ranked_ids)} 檔")
    except Exception as e:
        log(f"⚠ TaiwanStockMarketValueWeight 抓取/解析失敗（{e}）· 改用保底大型股清單")

    if not ranked_ids:
        ranked_ids = [sid for sid in FALLBACK_SEED if sid in info_by_id][:size]
        log(f"  股票池：改用 FALLBACK_SEED，{len(ranked_ids)} 檔")

    universe = []
    for sid in ranked_ids[:size]:
        info = info_by_id.get(sid)
        if not info:
            continue
        universe.append({
            "stock_id": sid,
            "stock_name": info.get("stock_name"),
            "industry_category": info.get("industry_category") or "其他",
        })
    return universe


# ============================================================
# 2. 個股層：Price → Dow 趨勢 / 量價象限 / explosive_verdict
# ============================================================
def fetch_stock_row(stock_id, industry_category, stock_name, start_date, end_date):
    """
    對應美股版 fetch_weekly_returns() + compute_vcp_row() 合併後的單股計算，
    資料源換成 FinMind TaiwanStockPrice（Trading_Volume 當量、max/min 當 High/Low），
    Dow 趨勢 / 量價象限 / explosive_verdict 直接呼叫美股版的通用函式。
    資料不足（< 131 個有效交易日）→ 回傳 None。
    """
    rows = fm_fetch("TaiwanStockPrice", data_id=stock_id, start_date=start_date, end_date=end_date)
    if not rows:
        return None
    df = pd.DataFrame(rows)
    # 興櫃/無公告成交價的日子 open/max/min/close 全 0（FinMind 文件明載）· 濾掉
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df[df["close"] > 0].sort_values("date").reset_index(drop=True)
    if len(df) < 131:
        return None

    close = df["close"].astype(float)
    high = pd.to_numeric(df["max"], errors="coerce").astype(float)
    low = pd.to_numeric(df["min"], errors="coerce").astype(float)
    vol = pd.to_numeric(df["Trading_Volume"], errors="coerce").fillna(0).astype(float)

    t_price = float(close.iloc[-1])
    actual_as_of = str(df["date"].iloc[-1])

    r4 = (t_price / close.iloc[-20] - 1) * 100
    r13 = (t_price / close.iloc[-65] - 1) * 100
    r26 = (t_price / close.iloc[-130] - 1) * 100
    point = r4 * 0.25 + r13 * 0.25 + r26 * 0.50
    di = ((1 if r4 > 0 else 0) + (1 if r13 > 0 else 0) + (1 if r26 > 0 else 0)) / 3.0

    def _avg(n):
        return float(vol.iloc[-n:].mean()) if len(vol) >= n else None

    def _vol_change(n, span):
        cur = _avg(n)
        if cur is None or len(vol) < span:
            return None
        prev = float(vol.iloc[-span:-n].mean())
        return (cur / prev - 1) * 100 if prev > 0 else None

    vol_ch_4w = _vol_change(20, 40)
    vol_ch_13w = _vol_change(65, 130)
    vol_ch_26w = _vol_change(130, 260)

    pv4 = _pv_state(r4, vol_ch_4w)
    pv13 = _pv_state(r13, vol_ch_13w)
    pv26 = _pv_state(r26, vol_ch_26w)
    pv_verdict = _pv_verdict(pv4, pv13, pv26)

    ret_5d = (t_price / close.iloc[-6] - 1) * 100 if len(close) >= 6 else None
    ret_20d = (t_price / close.iloc[-21] - 1) * 100 if len(close) >= 21 else None

    last21 = close.iloc[-21:]
    diffs = last21.diff().dropna()
    ups = diffs > 0
    downs = diffs < 0
    up_days_20 = int(ups.sum())
    down_days_20 = int(downs.sum())
    vols20 = vol.iloc[-20:].reset_index(drop=True)
    up_avg_vol = float(vols20[ups.values].mean()) if ups.any() else 0.0
    down_avg_vol = float(vols20[downs.values].mean()) if downs.any() else 0.0
    ud_ratio = (up_days_20 / down_days_20) if down_days_20 > 0 else None
    vp_ratio = (up_avg_vol / down_avg_vol) if down_avg_vol > 0 else None

    vp_score_stock = _compute_vp_score_stock(ret_20d, ret_5d, vp_ratio, ud_ratio)
    rsi14 = _rsi14(close)

    ma50 = float(close.iloc[-50:].mean()) if len(close) >= 50 else None
    above_50ma = (t_price > ma50) if ma50 is not None else None
    win_h, win_l, win_c = high.iloc[-10:], low.iloc[-10:], close.iloc[-10:]
    amp_10d_pct = (win_h.max() - win_l.min()) / win_c.mean() * 100 if win_c.mean() > 0 else 0.0
    vcp = bool(above_50ma) and amp_10d_pct < 3.0 and (vp_ratio is not None and vp_ratio > 1.0)

    lookback_52w = min(len(high), 252)
    high_52w = float(high.iloc[-lookback_52w:].max())
    pct_from_high = (t_price / high_52w - 1) * 100 if high_52w > 0 else 0.0

    trend = _detect_trend(high.tolist(), low.tolist(), close.tolist(), n=5)

    explosive_verdict = _explosive_verdict(
        r4, r13, r26, rsi14, pct_from_high,
        trend["state"], trend["signal"], pv_verdict, vcp, point,
    )

    return {
        "stock_id": stock_id, "symbol": stock_id, "stock_name": stock_name,
        "sector": industry_category,
        "as_of_date": actual_as_of, "t_price": round(t_price, 2),
        "cum_ret_4w": round(r4, 2), "cum_ret_13w": round(r13, 2), "cum_ret_26w": round(r26, 2),
        "point": round(point, 2), "di": round(di, 3),
        "ret_5d": round(ret_5d, 2) if ret_5d is not None else None,
        "ret_20d": round(ret_20d, 2) if ret_20d is not None else None,
        "up_days_20": up_days_20, "down_days_20": down_days_20,
        "up_avg_vol": int(up_avg_vol), "down_avg_vol": int(down_avg_vol),
        "ud_ratio": round(ud_ratio, 3) if ud_ratio is not None else None,
        "vp_ratio_stock": round(vp_ratio, 3) if vp_ratio is not None else None,
        "vp_score_stock": round(vp_score_stock, 2) if vp_score_stock is not None else None,
        "rsi14": rsi14,
        "above_50ma": above_50ma, "ma50": round(ma50, 2) if ma50 is not None else None,
        "amp_10d_pct": round(amp_10d_pct, 2), "vcp": vcp,
        "high_52w": round(high_52w, 2), "pct_from_high": round(pct_from_high, 2),
        "pv_state_4w": pv4, "pv_state_13w": pv13, "pv_state_26w": pv26, "pv_verdict": pv_verdict,
        "trend_state": trend["state"], "trend_pattern": trend["pattern"], "trend_signal": trend["signal"],
        "explosive_verdict": explosive_verdict,
        "vol_today": int(vol.iloc[-1]),
        "vol_10d_avg": int(vol.iloc[-10:].mean()) if len(vol) >= 10 else None,
    }


# ============================================================
# 3. Layer 3：三大法人資金流向（個股層）
# ============================================================
# FinMind 買賣量是「股數」不是金額（範例值 3130萬股量級對台積電合理）。
# 保留原始股數當核心數據；NTD 估算只用最新收盤價換算，僅供報表顯示參考，不是精確金額。
_INST_GROUP = {
    "Foreign_Investor": "foreign", "Foreign_Dealer_Self": "foreign",
    "Investment_Trust": "trust",
    "Dealer_self": "dealer", "Dealer_Hedging": "dealer",
}


def fetch_institutional_flow(stock_id, start_date, end_date, latest_close=None):
    rows = fm_fetch("TaiwanStockInstitutionalInvestorsBuySell",
                     data_id=stock_id, start_date=start_date, end_date=end_date)
    if not rows:
        return None
    df = pd.DataFrame(rows)
    df["group"] = df["name"].map(_INST_GROUP)
    df = df.dropna(subset=["group"])
    if df.empty:
        return None
    df["net"] = pd.to_numeric(df["buy"], errors="coerce").fillna(0) - pd.to_numeric(df["sell"], errors="coerce").fillna(0)
    pivot = df.groupby(["date", "group"])["net"].sum().unstack(fill_value=0).sort_index()

    def _sum_last(n, col):
        if col not in pivot.columns:
            return 0.0
        return float(pivot[col].iloc[-n:].sum())

    n_days = min(20, len(pivot))
    foreign = _sum_last(n_days, "foreign")
    trust = _sum_last(n_days, "trust")
    dealer = _sum_last(n_days, "dealer")
    total = foreign + trust + dealer
    result = {
        "inst_foreign_net_20d_shares": foreign,
        "inst_trust_net_20d_shares": trust,
        "inst_dealer_net_20d_shares": dealer,
        "inst_total_net_20d_shares": total,
    }
    if latest_close:
        result["inst_total_net_20d_est_NTD_M"] = round(total * latest_close / 1e6, 1)
    return result


# ============================================================
# 4. Layer 1：板塊（industry_category）聚合
# ============================================================
def aggregate_sectors(stock_rows, as_of):
    """依 industry_category 聚合：Return（point 平均）/ Breadth / Capital Flow。
    跟美股版不同——沒有單一 ETF 代表整個板塊，改用「板塊內所有個股指標的聚合」，
    這其實更貼近使用者要的「資金真的進哪個產業」而不是借一個 proxy 工具猜。
    """
    df = pd.DataFrame(stock_rows)
    if df.empty:
        return pd.DataFrame()
    groups = []
    for sector, g in df.groupby("sector"):
        n = len(g)
        point = float(g["point"].mean())
        ret_4w = float(g["cum_ret_4w"].mean())
        ret_13w = float(g["cum_ret_13w"].mean())
        ret_26w = float(g["cum_ret_26w"].mean())
        breadth_up = int((g["cum_ret_4w"] > 0).sum())
        breadth_pct = round(100 * breadth_up / n, 1) if n else None
        inst_col = "inst_total_net_20d_shares"
        inst_net = float(g[inst_col].dropna().sum()) if inst_col in g.columns and g[inst_col].notna().any() else None
        groups.append({
            "sector": sector, "as_of_date": as_of, "stock_count": n,
            "point": round(point, 2),
            "ret_4w": round(ret_4w, 2), "ret_13w": round(ret_13w, 2), "ret_26w": round(ret_26w, 2),
            "breadth_pct": breadth_pct, "breadth_up": breadth_up, "breadth_total": n,
            "inst_net_20d_shares": inst_net,
        })
    return pd.DataFrame(groups).sort_values("point", ascending=False).reset_index(drop=True)


def add_sector_acceleration(df, as_of):
    """讀過去 N 天的 tw_*_scorecard.csv → point 5 日均 → acceleration。
    首次執行（沒有歷史檔案）時整欄留 None，之後隨每日執行自然累積 —— 跟美股版
    add_acceleration_and_quadrant() 同一套邏輯，只是還沒做象限/健康度分類（Phase 2）。
    """
    import glob
    files = sorted(glob.glob(os.path.join(OUTDIR, "tw_*_scorecard.csv")))
    stamp_today = as_of.replace("-", "")
    files = [f for f in files if stamp_today not in os.path.basename(f)]
    recent = files[-ACCEL_LOOKBACK_DAYS:]
    df = df.copy()
    if not recent:
        df["point_5d_avg"] = None
        df["acceleration"] = None
        return df
    hist_frames = []
    for fp in recent:
        try:
            h = pd.read_csv(fp, usecols=["sector", "point"])
            hist_frames.append(h)
        except Exception:
            continue
    if not hist_frames:
        df["point_5d_avg"] = None
        df["acceleration"] = None
        return df
    hist = pd.concat(hist_frames, ignore_index=True)
    avg_by_sec = hist.groupby("sector")["point"].mean().to_dict()
    df["point_5d_avg"] = df["sector"].map(avg_by_sec).round(2)
    df["acceleration"] = (df["point"] - df["point_5d_avg"]).round(2)
    return df


# ============================================================
# 5. Layer 2：個股在板塊內的排名 + gap_alert
# ============================================================
def add_stock_ranks(df):
    """跟美股版 add_sector_stock_composite_ranks() 同精神：sector 內依 point 跟
    vp_score_stock 排名，兩者加權出 composite，落差過大標記 gap_alert。"""
    df = df.copy()
    df["point_rank_in_sector"] = df.groupby("sector")["point"].rank(method="min", ascending=False)
    df["vp_score_rank_in_sector"] = df.groupby("sector")["vp_score_stock"].rank(
        method="min", ascending=False, na_option="bottom")
    df["composite_in_sector"] = (
        df["point_rank_in_sector"] * 0.5 + df["vp_score_rank_in_sector"] * 0.5
    ).round(2)
    df["composite_rank_in_sector"] = df.groupby("sector")["composite_in_sector"].rank(
        method="min", ascending=True)

    def _gap(row):
        pr, vr = row.get("point_rank_in_sector"), row.get("vp_score_rank_in_sector")
        if pd.isna(pr) or pd.isna(vr):
            return None
        if abs(pr - vr) <= GAP_ALERT_THRESHOLD:
            return None
        return "吃老本" if pr < vr else "剛爆發"

    df["stock_gap_alert"] = df.apply(_gap, axis=1)
    return df


# ============================================================
# 6. Layer 0：市場快照（0050 當 TAIEX 代理）
# ============================================================
def fetch_market_snapshot(start_date, end_date):
    rows = fm_fetch("TaiwanStockPrice", data_id="0050", start_date=start_date, end_date=end_date)
    if not rows:
        return None
    df = pd.DataFrame(rows)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df[df["close"] > 0].sort_values("date").reset_index(drop=True)
    if len(df) < 61:
        return None
    close = df["close"]
    cur = float(close.iloc[-1])
    past60 = float(close.iloc[-61])
    ma50 = float(close.iloc[-50:].mean())
    return {
        "proxy": "0050",
        "as_of_date": str(df["date"].iloc[-1]),
        "price": round(cur, 2),
        "vs_60d_pct": round((cur / past60 - 1) * 100, 2),
        "ma50": round(ma50, 2),
        "vs_50ma_pct": round((cur / ma50 - 1) * 100, 2),
        "trend_label": "🟢" if cur > past60 else "🔴",
    }


# ============================================================
# 7. 輸出
# ============================================================
def save_outputs(all_df, sector_df, as_of, market_snapshot, failed):
    os.makedirs(OUTDIR, exist_ok=True)
    stamp = as_of.replace("-", "")

    all_csv = os.path.join(OUTDIR, f"tw_{stamp}_all.csv")
    all_df.to_csv(all_csv, index=False)
    log(f"  saved {all_csv}")

    sc_csv = os.path.join(OUTDIR, f"tw_{stamp}_scorecard.csv")
    sector_df.to_csv(sc_csv, index=False)
    log(f"  saved {sc_csv}")

    scorecard_manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "phase": 1,
        "phase_note": "Phase 1：Layer 0-3 用官方 industry_category 粗分類，"
                       "沒有供應鏈次產業細分（Layer 1.5）跟 S1-S5 感測器（留 Phase 2）",
        "sector_count": int(len(sector_df)),
        "market_snapshot": market_snapshot,
        "request_budget_used": _request_count,
        "failed_tickers": failed,
        "csv": os.path.basename(sc_csv),
        "rows": sector_df.where(pd.notna(sector_df), None).to_dict(orient="records"),
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(scorecard_manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved manifest {MANIFEST_PATH}")

    # Stage2 latest.json：跟美股版同精神，top3（依 composite_rank_in_sector）+ 全量 all
    top3 = (all_df[all_df["composite_rank_in_sector"] <= 3]
            .sort_values(["sector", "composite_rank_in_sector"])
            .to_dict(orient="records"))
    stage2 = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "top3": {"composite": top3},
        "all_count": int(len(all_df)),
    }
    with open(STAGE2_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(stage2), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved stage2 {STAGE2_PATH}")


# ============================================================
# 8. main
# ============================================================
def main():
    global AS_OF_DATE
    parser = argparse.ArgumentParser(description="台股板塊輪動 Phase 1 pipeline")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · YYYY-MM-DD（不填 = 用今天，實際 as_of 由抓到的資料自動校正）")
    parser.add_argument("--universe-size", dest="universe_size", type=int, default=UNIVERSE_SIZE)
    args = parser.parse_args()

    end_date = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if args.as_of:
        AS_OF_DATE = args.as_of
        log(f"⏪ 回放模式 · as_of = {AS_OF_DATE}")

    start_date = (datetime.strptime(end_date, "%Y-%m-%d").date()
                  - timedelta(days=int(HISTORY_MONTHS * 31))).strftime("%Y-%m-%d")

    log("=" * 78)
    log("台股板塊輪動 Phase 1 · 建立股票池")
    log("=" * 78)
    universe = fetch_universe(end_date, size=args.universe_size)
    if not universe:
        sys.exit("❌ 股票池是空的，無法繼續")
    log(f"  股票池大小：{len(universe)} 檔")

    log("=" * 78)
    log(f"逐股抓 TaiwanStockPrice + TaiwanStockInstitutionalInvestorsBuySell "
        f"（budget 預估 {len(universe) * 2 + 3} 次 / FinMind 300 次/小時）")
    log("=" * 78)
    all_rows = []
    failed = []
    for i, u in enumerate(universe, 1):
        sid = u["stock_id"]
        try:
            row = fetch_stock_row(sid, u["industry_category"], u["stock_name"], start_date, end_date)
            if row is None:
                failed.append({"stock_id": sid, "reason": "資料不足（< 131 個有效交易日）"})
                continue
            try:
                inst = fetch_institutional_flow(sid, start_date, end_date, latest_close=row["t_price"])
                if inst:
                    row.update(inst)
            except Exception as e:
                log(f"  ⚠ {sid} 法人資料抓取失敗（不影響其他欄位）: {e}")
            all_rows.append(row)
        except Exception as e:
            failed.append({"stock_id": sid, "reason": str(e)})
            if "額度用完" in str(e):
                log(f"  ⛔ {sid}: {e} · 額度用完，中止剩餘股票的抓取")
                failed.extend([{"stock_id": u2["stock_id"], "reason": "額度用完，未抓取"}
                               for u2 in universe[i:]])
                break
            log(f"  ⚠ {sid}: {e}")
        if i % 20 == 0:
            log(f"  進度 {i}/{len(universe)} · 已用 {_request_count} 次請求")

    if not all_rows:
        sys.exit(f"❌ 沒抓到任何個股資料（失敗 {len(failed)} 檔），檢查 FINMIND_TOKEN 或 FinMind 服務狀態")

    all_df = pd.DataFrame(all_rows)
    # 用實際抓到的資料日期眾數當 pipeline 的 as_of（可能有個股當天停牌等邊界情況）
    as_of = all_df["as_of_date"].mode().iloc[0]
    log(f"  → as_of_date（實際資料眾數）= {as_of} · 成功 {len(all_df)} / 失敗 {len(failed)}")

    all_df = add_stock_ranks(all_df)

    log("=" * 78)
    log("Layer 1：板塊（industry_category）聚合")
    log("=" * 78)
    sector_df = aggregate_sectors(all_rows, as_of)
    sector_df = add_sector_acceleration(sector_df, as_of)
    for _, r in sector_df.head(15).iterrows():
        acc = r.get("acceleration")
        acc_str = f"{acc:+.2f}" if acc is not None and not pd.isna(acc) else "—"
        log(f"  {r['sector']:12s} point={r['point']:7.2f}  acc={acc_str:>7s}  "
            f"breadth={r['breadth_pct']}%  n={r['stock_count']}")

    log("=" * 78)
    log("Layer 0：市場快照（0050 代理 TAIEX）")
    log("=" * 78)
    try:
        market_snapshot = fetch_market_snapshot(start_date, end_date)
        if market_snapshot:
            log(f"  0050 = {market_snapshot['price']} · 60d {market_snapshot['vs_60d_pct']:+.2f}% "
                f"· vs 50MA {market_snapshot['vs_50ma_pct']:+.2f}% · {market_snapshot['trend_label']}")
    except Exception as e:
        log(f"⚠ 市場快照抓取失敗（不影響板塊/個股資料）: {e}")
        market_snapshot = None

    save_outputs(all_df, sector_df, as_of, market_snapshot, failed)
    log(f"✅ 完成 · 共用 {_request_count} 次 FinMind 請求 · 失敗 {len(failed)} 檔")


if __name__ == "__main__":
    main()
