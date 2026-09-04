#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股板塊輪動 Phase 1 pipeline  scripts/tw_sector_pipeline.py
=====================================================================
跟美股版（sector_scorecard.py + sector_rotation_screener.py）對齊的邏輯，但：
  - Layer 1（板塊）用 TWSE/TPEx 官方 industry_category 粗分類，不是 GICS 11 sectors
    （硬套 GICS 會失真——台股資金流動的顆粒度理論上是「產業→次產業→供應鏈」，
    但次產業/供應鏈細分沒有官方機器可讀資料源，需要人工建映射表；決定不做這塊，
    Layer 1 維持官方粗分類，改用 CPD 資金-價格背離象限補強板塊層的判斷力）
  - S1-S5 感測器 + Opportunity Engine（TODAY/TRIGGER/AVOID）留到 Phase 2 ·
    Phase 1 先把 Layer 0-3 資料地基跑通、產出真實資料的每日報表

  Layer 0  市場：優先用 TW Market Data（獨立付費 API，非 FinMind）的官方 TAIEX 指數；
                 沒設 TWMARKETDATA_API_KEY 或呼叫失敗 → 退回 0050（元大台灣50）當代理
                 （TAIEX 本身在 FinMind 用什麼 dataset/data_id 查沒有把握確認過，
                   0050 是已知可行的 TaiwanStockPrice call）
  Layer 1  板塊：industry_category 分組 · Return（point）/ Acceleration / Breadth / Capital Flow
  Layer 2  個股：Dow 頭頭低/底底高趨勢 + 量價象限判定 + explosive_verdict
                （直接 import sector_rotation_screener.py 的通用演算法函式 ——
                  這些函式本來就是純數學/字串邏輯，不綁 yfinance，可以直接共用，
                  不用重寫一份、也不會跟已驗證過的美股版邏輯分岔）
  Layer 3  資金：三大法人（外資/投信/自營商）20 日淨買賣，個股 + 板塊聚合

資料源：FinMind（免費 tier 300 次/小時）
  TaiwanStockInfo                          （bulk，不帶 data_id）全市場清單 + 官方產業分類
  TaiwanStockPrice                          個股日 OHLCV（每股 1 次）
  TaiwanStockInstitutionalInvestorsBuySell  個股法人買賣（每股 1 次）

  另有 TW Market Data（twmarketdata.com，獨立第三方付費 API，非 FinMind，不吃 FinMind
  額度）market-index dataset：官方 TWSE TAIEX 每日指數，只用在 Layer 0 市場快照（1 次
  request/次執行）。需要 TWMARKETDATA_API_KEY；沒設就整個 Layer 0 退回 0050 代理，
  不影響 Layer 1-3。

  股票池選取：原本想用 FinMind TaiwanStockMarketValueWeight 抓市值排名前 N 大，但官方
  文件確認這個 dataset 其實是「單一個股」市值歷史查詢（一定要帶 stock_id，不是全市場
  排名快照），而且限定「backer/sponsor members」才能用——免費 tier 打了保證 400。
  用 data_id 逐股查又會反過來造成「要先有股票池才能查市值排名選股票池」的雞生蛋
  問題，划不來。改用 UNIVERSE_SEED：TWSE 官網「發行量加權股價指數成分股暨市值比重」
  頁面的官方排行（依市值佔大盤比重排序，非 FinMind），是真的市值排名，只是靜態
  快照會隨時間漂移，需要時手動更新（見 UNIVERSE_SEED 定義處的說明）。

股票池：UNIVERSE_SEED 前 UNIVERSE_SIZE 檔（預設 100，清單本身依市值排名有 150 檔）。
        budget = N×2 + 3 固定開銷 ≈ 203 次/小時，
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

# TW Market Data（twmarketdata.com）· 獨立第三方付費 API，不是 FinMind，不吃 FinMind 300
# 次/小時額度。market-index dataset 給官方 TWSE TAIEX 每日指數（index_code=TWSE_TAIEX），
# 比 0050 ETF 代理更準確當 Layer 0 市場快照。需要 TWMARKETDATA_API_KEY；沒設 → 退回 0050。
TWMD_BASE = "https://api.twmarketdata.com/v2/datasets/market-index"
TWMD_API_KEY = os.environ.get("TWMARKETDATA_API_KEY", "").strip()

# TWSE OpenAPI（openapi.twse.com.tw）· 官方資料，不需要 token、不吃 FinMind 額度。
# 用「已發行普通股數（t187ap03_L）× 收盤價（STOCK_DAY_ALL）」自己算全市場市值排名，
# 取代原本人工貼表的 UNIVERSE_SEED 靜態快照——每天用當天真實股數/股價重算，
# 涵蓋全部 ~1,094 檔上市公司，不受任何一次性貼表筆數上限。
# 兩個 endpoint 都是 bulk（不帶參數，一次回傳全市場），跟 tw_twse_snapshot.py 用的
# STOCK_DAY_ALL 是同一個資料源，這裡獨立呼叫一次（不共用 snapshot 檔案，避免耦合
# 兩個腳本的執行順序）。任何一步失敗 → 回傳 None，呼叫端退回 UNIVERSE_SEED 保底。
TWSE_COMPANY_INFO_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TWSE_STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "tw_scorecard_latest.json")
STAGE2_PATH = os.path.join(OUTDIR, "tw_latest.json")

UNIVERSE_SIZE = 100          # 市值前 N 大 · budget = N×2 + 3 次（免費 tier 300 次/小時）
ACCEL_LOOKBACK_DAYS = 5
GAP_ALERT_THRESHOLD = 5
HISTORY_MONTHS = 14          # 抓 14 個月 daily ≈ 290 交易日，26W 量能變化需要 260 天 buffer

AS_OF_DATE = None  # type: ignore[assignment]  · 由 main() 從 --as-of 設定

# Phase 1 股票池：TWSE 官方「發行量加權股價指數成分股暨市值比重」排行前 150 名
# （資料日期 2026/8/31，使用者直接從 TWSE 官網頁面貼出），依市值佔大盤比重由大到小排序。
# 這是加權指數（TAIEX）成分股 → 只含上市（TWSE），不含上櫃（TPEx）；Phase 1 先接受這個
# 簡化（跟 TaiwanStockMarketValueWeight 不可用一樣，都留給 Phase 2 視需要擴充上櫃）。
# 這份清單是靜態快照，會隨時間漂移（新股上市、市值排名變動）——之後要更新時，從
# https://www.twse.com.tw 的「個股市值占大盤比重」頁面重新貼一份，取代下面整個清單即可。
UNIVERSE_SEED = [
    "2330", "2454", "2308", "2317", "3711", "2881", "2383", "1303", "2408", "3037",
    "2303", "2882", "2382", "2059", "3017", "6669", "2891", "2345", "2327", "2412",
    "7769", "3008", "2887", "2885", "3653", "2360", "2344", "3443", "8046", "2357",
    "2886", "2301", "6505", "2884", "2890", "2368", "6446", "2395", "2880", "2883",
    "3231", "4958", "2892", "2603", "3665", "1216", "3045", "3189", "1301", "5880",
    "1326", "3481", "2379", "4904", "6770", "3661", "2449", "3034", "2615", "2313",
    "2801", "2002", "2207", "1590", "3044", "1519", "2337", "3036", "4938", "2376",
    "2356", "2618", "6515", "2912", "5876", "6239", "2609", "5871", "2404", "2409",
    "6213", "3533", "1101", "2324", "6139", "1802", "2834", "1605", "1504", "3702",
    "7750", "6415", "6805", "1402", "6531", "6789", "6919", "3532", "2347", "2492",
    "6442", "2377", "2451", "2027", "2049", "2610", "3026", "3706", "1102", "2812",
    "8210", "6285", "3406", "2474", "8996", "8464", "6196", "5269", "1503", "1560",
    "6526", "6257", "2542", "2105", "5434", "6949", "1717", "2467", "2353", "6781",
    "3450", "2838", "2354", "6409", "7610", "2455", "3006", "8039", "1476", "1513",
    "6691", "2385", "2855", "9945", "1229", "6005", "3023", "9904", "3005", "6944",
]
UNIVERSE_SEED = list(dict.fromkeys(UNIVERSE_SEED))  # 去重，保留原順序（原始資料已無重複）


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
    402（Payment Required）也不重試——實測發現免費 tier 對「當日不同股票數」另有上限，
    達到上限後同一輪剩下的股票會連續 402，重試沒有意義。
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
        if res.status_code == 402:
            raise RuntimeError(f"{dataset}({data_id}) 額度用完（402 Payment Required，"
                                f"免費 tier 對當日不同股票數可能另有上限）")
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
def fetch_twse_market_cap_ranking(timeout=30):
    """TWSE OpenAPI 自算全市場市值排名：已發行普通股數（t187ap03_L）× 收盤價
    （STOCK_DAY_ALL），依市值由大到小排序，回傳 [stock_id, ...]。
    兩個 endpoint 都不需要 token、bulk 一次拿全部、不吃 FinMind 額度，也跟
    TaiwanStockMarketValueWeight 的限制（sponsor-only、要 per-stock 查）完全無關。
    任何一步失敗（網路/HTTP/JSON 格式）→ 回傳 None，呼叫端退回 UNIVERSE_SEED 保底。
    """
    try:
        res_info = requests.get(TWSE_COMPANY_INFO_URL, headers={"accept": "application/json"}, timeout=timeout)
        res_price = requests.get(TWSE_STOCK_DAY_ALL_URL, headers={"accept": "application/json"}, timeout=timeout)
    except requests.RequestException as e:
        log(f"⚠ TWSE OpenAPI 市值排名網路錯誤：{e}")
        return None
    if not res_info.ok or not res_price.ok:
        log(f"⚠ TWSE OpenAPI 市值排名 HTTP 錯誤：info={res_info.status_code} price={res_price.status_code}")
        return None
    try:
        companies = res_info.json()
        prices = res_price.json()
    except ValueError:
        log("⚠ TWSE OpenAPI 市值排名回傳非 JSON")
        return None
    if not isinstance(companies, list) or not isinstance(prices, list) or not companies or not prices:
        log("⚠ TWSE OpenAPI 市值排名回傳空陣列或非預期格式")
        return None

    price_by_code = {r.get("Code"): r for r in prices if r.get("Code")}
    ranked = []
    for c in companies:
        sid = c.get("公司代號")
        shares_str = c.get("已發行普通股數或TDR原股發行股數")
        price_row = price_by_code.get(sid)
        if not sid or not shares_str or not price_row:
            continue
        try:
            shares = float(shares_str)
            close = float(price_row.get("ClosingPrice") or 0)
        except (TypeError, ValueError):
            continue
        if shares <= 0 or close <= 0:
            continue
        ranked.append((sid, shares * close))

    if not ranked:
        log("⚠ TWSE OpenAPI 市值排名算出 0 檔可用資料")
        return None
    ranked.sort(key=lambda x: -x[1])
    return [sid for sid, _ in ranked]


def fetch_universe(as_of, size=UNIVERSE_SIZE):
    """
    1) TaiwanStockInfo（不帶 data_id）→ 全市場清單 + industry_category
       · 只留上市/上櫃普通股（type ∈ twse/tpex），濾掉 ETF（industry_category == 'ETF'）
       · 轉板股票會保留多列，取 date 最新那列
    2) 優先用 fetch_twse_market_cap_ranking() 算出的即時全市場市值排名取前 size 檔；
       失敗才退回 UNIVERSE_SEED（TWSE 官方市值比重排行靜態快照，2026/8/31）保底。
       · 不用 FinMind TaiwanStockMarketValueWeight：文件確認它是「單一個股」市值歷史
         查詢（一定要帶 stock_id），且限定 backer/sponsor members，免費 tier 打了
         保證 400，詳見模組開頭說明。
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

    twse_ranked = fetch_twse_market_cap_ranking()
    if twse_ranked:
        ranked_ids = [sid for sid in twse_ranked if sid in info_by_id][:size]
        log(f"  股票池：TWSE OpenAPI 即時市值排名，{len(ranked_ids)} 檔")
    else:
        ranked_ids = [sid for sid in UNIVERSE_SEED if sid in info_by_id][:size]
        log(f"  股票池：TWSE 市值排名失敗，改用 UNIVERSE_SEED 靜態保底，{len(ranked_ids)} 檔")

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
    trading_money = pd.to_numeric(df["Trading_money"], errors="coerce").fillna(0).astype(float)

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
        # 個股 20 日「全部」成交金額（不分是誰買的：法人+自營+散戶全部加總）——
        # 跟 Layer 3 的三大法人「淨買賣」金額是兩回事：這個量的是市場關注度/熱度，
        # 三大法人金額量的是資金淨流向，不能互相替代。
        "trade_value_20d_est_NTD_M": round(float(trading_money.iloc[-20:].sum()) / 1e6, 1)
        if len(trading_money) >= 20 else None,
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
        ntd_col = "inst_total_net_20d_est_NTD_M"
        inst_net_ntd = float(g[ntd_col].dropna().sum()) if ntd_col in g.columns and g[ntd_col].notna().any() else None
        groups.append({
            "sector": sector, "as_of_date": as_of, "stock_count": n,
            "point": round(point, 2),
            "ret_4w": round(ret_4w, 2), "ret_13w": round(ret_13w, 2), "ret_26w": round(ret_26w, 2),
            "breadth_pct": breadth_pct, "breadth_up": breadth_up, "breadth_total": n,
            "inst_net_20d_shares": inst_net,
            "inst_net_20d_est_NTD_M": inst_net_ntd,
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


CPD_QUADRANT = {
    (True, True): "🚀 Confirmed",       # 價格強 + 資金強：同步確認
    (False, True): "💰 Capital Leading",  # 價格弱 + 資金強：資金先進，價格未反映（狩獵區）
    (True, False): "⚠️ Price Leading",   # 價格強 + 資金弱：價格已動但法人沒跟，追高風險
    (False, False): "❄️ Weak",          # 價格弱 + 資金弱：都沒動靜
}


def add_sector_cpd(df):
    """Sector Capital-Price Divergence：CPD = Z(法人金額) - Z(SectorPoint)，
    當日跨板塊（約 10-15 個 sector）做橫斷面 Z-score，再依 (point, capital) 正負
    分四象限。CPD 越正代表「資金比價格更早、更用力」——這正是最初定義的狩獵目標
    「資金正在進入、但價格尚未完全反映」，比單純看 SectorPoint 高一層。
    注意：n 只有 10-15 個 sector，Z-score 是小樣本相對排名，不是嚴謹統計顯著性，
    只拿來做粗略的「相對於今天其他板塊」象限分類，不代表絕對強弱門檻。
    """
    df = df.copy()
    if df.empty:
        for col in ("z_point", "z_capital", "cpd", "cpd_quadrant"):
            df[col] = pd.Series(dtype="object")
        return df

    def _z(series):
        std = series.std()
        if not std or std != std or std == 0:
            return pd.Series([0.0] * len(series), index=series.index)
        return (series - series.mean()) / std

    z_point = _z(df["point"])
    # inst_net_20d_est_NTD_M 全 None（例如法人資料整批抓取失敗）時，缺失值當 0 處理，
    # 不讓單一板塊的缺資料拖垮整批 Z-score 計算。
    capital = df["inst_net_20d_est_NTD_M"].fillna(0.0) if "inst_net_20d_est_NTD_M" in df.columns else pd.Series([0.0] * len(df), index=df.index)
    z_capital = _z(capital)

    df["z_point"] = z_point.round(2)
    df["z_capital"] = z_capital.round(2)
    df["cpd"] = (z_capital - z_point).round(2)
    df["cpd_quadrant"] = [
        CPD_QUADRANT[(p > 0, c > 0)] for p, c in zip(z_point, z_capital)
    ]
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
# 6. Layer 0：市場快照（優先真實 TAIEX，沒有金鑰/失敗才退回 0050 代理）
# ============================================================
def fetch_taiex_official(start_date, end_date, limit=500):
    """TW Market Data market-index dataset · 官方 TWSE TAIEX 每日指數，index_code=
    TWSE_TAIEX（IX0001 不是這個 endpoint 認得的代碼，文件明講）。獨立第三方付費 API，
    跟 FinMind 無關、不吃 FinMind 額度；沒設 TWMARKETDATA_API_KEY 直接回傳 None，
    呼叫端退回 0050 代理，不是硬性依賴。
    """
    if not TWMD_API_KEY:
        return None
    res = requests.get(
        TWMD_BASE,
        params={"index_code": "TWSE_TAIEX", "market": "TWSE",
                "start_date": start_date, "end_date": end_date, "limit": limit},
        headers={"X-API-Key": TWMD_API_KEY},
        timeout=30,
    )
    if not res.ok:
        raise RuntimeError(f"TW Market Data market-index HTTP {res.status_code}")
    items = (res.json() or {}).get("items") or []
    rows = []
    for it in items:
        d = (it.get("market_identity") or {}).get("as_of_date")
        v = (it.get("index_level") or {}).get("value")
        if d is None or v is None:
            continue
        rows.append({"date": d, "close": float(v)})
    if not rows:
        return None
    return (pd.DataFrame(rows)
            .drop_duplicates(subset="date")
            .sort_values("date")
            .reset_index(drop=True))


def fetch_market_snapshot(start_date, end_date):
    try:
        df = fetch_taiex_official(start_date, end_date)
        if df is not None and len(df) >= 61:
            close = df["close"]
            cur = float(close.iloc[-1])
            past60 = float(close.iloc[-61])
            ma50 = float(close.iloc[-50:].mean())
            log(f"  市場快照來源：TW Market Data 官方 TAIEX（{len(df)} 天）")
            return {
                "proxy": "TAIEX", "source": "twse_official(TW Market Data)",
                "as_of_date": str(df["date"].iloc[-1]),
                "price": round(cur, 2),
                "vs_60d_pct": round((cur / past60 - 1) * 100, 2),
                "ma50": round(ma50, 2),
                "vs_50ma_pct": round((cur / ma50 - 1) * 100, 2),
                "trend_label": "🟢" if cur > past60 else "🔴",
            }
        if df is not None:
            log(f"⚠ TW Market Data TAIEX 資料不足（{len(df)} < 61 天）· 改用 0050 代理")
    except Exception as e:
        log(f"⚠ TW Market Data TAIEX 抓取失敗（{e}）· 改用 0050 代理")

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
    log("  市場快照來源：0050 代理（TW Market Data 未設金鑰或失敗）")
    return {
        "proxy": "0050", "source": "finmind_price_proxy",
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
    sector_df = add_sector_cpd(sector_df)
    for _, r in sector_df.head(15).iterrows():
        acc = r.get("acceleration")
        acc_str = f"{acc:+.2f}" if acc is not None and not pd.isna(acc) else "—"
        log(f"  {r['sector']:12s} point={r['point']:7.2f}  acc={acc_str:>7s}  "
            f"breadth={r['breadth_pct']}%  n={r['stock_count']}  cpd={r.get('cpd_quadrant','—')}")

    log("=" * 78)
    log("Layer 0：市場快照（優先 TW Market Data 官方 TAIEX，退回 0050 代理）")
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
