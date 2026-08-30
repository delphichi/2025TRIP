#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S&P 500 板塊動能篩選器  scripts/sector_rotation_screener.py
=====================================================================
每月最後一個週五（CI 排程實作為每週五）跑一次：
  1. 從 Wikipedia 抓 S&P 500 成分股 + GICS Sector
  2. yfinance 抓週線收盤，算 4W / 13W / 26W 累積報酬（價格動能）
  3. 依 4W / 13W / 26W 各自預篩每 sector 前 15 名（省 FMP 額度）
  4. 對預篩到的 union 名單，用 FMP earnings-surprises 抓最近兩次 EPS surprise
  5. 篩選規則（盈餘動能）：L1 & L2 皆為正、或 L1 > L2（改善趨勢）
  6. 各 sector 依三個時間尺度分別選出前 3 名 → 三張熱區表
  7. 輸出 CSV + latest.json manifest 供瀏覽器讀

資料源：
  價格：yfinance（Yahoo Finance，免 key，內建重試）
  盈餘 surprise：FMP /api/v3/earnings-surprises/{ticker}?apikey=KEY
                （前置：Repo Settings → Secrets → FMP_API_KEY）

輸出：
  data/sector_rotation/{YYYYMMDD}_all.csv          全 500 檔的價格動能明細
  data/sector_rotation/{YYYYMMDD}_top3_{4w|13w|26w}.csv  三張榜單
  data/sector_rotation/latest.json                 manifest（瀏覽器讀）

手動跑：
  FMP_API_KEY=xxx python scripts/sector_rotation_screener.py
  （沒 key 也會跑，只是 surprise 欄位會是 NA、篩選會退回純價格動能）
"""
import os
import sys
import json
import math
import time
import argparse
from datetime import datetime, date, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO

import pandas as pd
import requests


# 全域 AS_OF · 由 main() 從 CLI 設定 · None = 用最新
AS_OF_DATE = None  # type: ignore[assignment]


def _yf_window(months):
    """把「拉多長」轉成 yf.download 的 kwargs · 依有無 AS_OF_DATE 切 period / start+end"""
    if AS_OF_DATE is None:
        return {"period": f"{months}mo"}
    end = AS_OF_DATE + timedelta(days=1)
    start = AS_OF_DATE - timedelta(days=int(months * 31))
    return {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}


def _cutoff_date():
    return AS_OF_DATE if AS_OF_DATE is not None else datetime.now(timezone.utc).date()


def _actual_last_close_date(cutoff):
    """
    抓 SPY 最近 10 天 daily bars · 找 <= cutoff 的最後一根 close 的實際日期
    · 用來取代週線 Monday label · 讓 as_of_date 是真正的資料日
    · fallback: 若抓不到 · 用 cutoff - 1 或最近工作日
    """
    try:
        import yfinance as yf
        end = cutoff + timedelta(days=1) if hasattr(cutoff, 'year') else datetime.now().date() + timedelta(days=1)
        start = cutoff - timedelta(days=14) if hasattr(cutoff, 'year') else datetime.now().date() - timedelta(days=14)
        spy = yf.download(
            "SPY", start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1d", auto_adjust=True, progress=False,
        )
        if spy is not None and not spy.empty:
            idx_dates = pd.to_datetime(spy.index).date
            valid = [d for d in idx_dates if d <= cutoff]
            if valid:
                return max(valid).strftime("%Y-%m-%d")
    except Exception as e:
        log(f"  ⚠ _actual_last_close_date fetch fail: {e}")
    # fallback：往前推工作日
    d = cutoff
    if AS_OF_DATE is None:
        d = d - timedelta(days=1)  # 現況模式排除今天
    while d.weekday() >= 5:  # 週六=5 / 週日=6
        d = d - timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def _bar_ok(bar_date):
    """判斷這根 bar 該不該保留 · AS_OF 模式含 as_of · 現況模式排除 today"""
    if AS_OF_DATE is not None:
        return bar_date <= AS_OF_DATE
    return bar_date < datetime.now(timezone.utc).date()


def _json_safe(obj):
    """遞迴把 NaN/Inf 換 None · 讓瀏覽器 JSON.parse 接受（見 sector_scorecard.py）"""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "latest.json")
FMP_KEY = os.environ.get("FMP_API_KEY", "").strip()

# 每個 sector 進 FMP earnings 檢查的預篩名單大小
# 15 名 × 11 sector × 3 時間尺度 union ≈ 200-300 unique ticker
# 剛好在 FMP starter tier 每分鐘 300 call 的範圍內
PRE_FILTER_PER_SECTOR = 15
TOP_N = 3  # 每 sector 最終選出的名次

# yfinance 一次批次下載的 chunk size（避免 400 URL too long）
YF_BATCH = 80


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 1. S&P 500 成分股
# ============================================================
def fetch_sp500_constituents():
    """
    從 Wikipedia 抓 S&P 500 成分股清單。
    回傳 DataFrame[symbol, sector, name]
    """
    log("Fetching S&P 500 constituents from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0 (sector-rotation-screener)"}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    # pandas 2.1+ 棄用 pd.read_html(raw_str) · 3.0 直接噴 error 把整份 HTML 帶進 msg
    # 必須包 StringIO
    tables = pd.read_html(StringIO(r.text))
    df = tables[0]
    # 欄位可能叫 'Symbol' + 'GICS Sector' + 'Security'
    col_sym = next(c for c in df.columns if "symbol" in c.lower())
    col_sec = next(c for c in df.columns if "sector" in c.lower())
    col_nm = next(c for c in df.columns if "security" in c.lower())
    out = df[[col_sym, col_sec, col_nm]].copy()
    out.columns = ["symbol", "sector", "name"]
    # Wikipedia 的 dots 換 dashes 對齊 yfinance（BRK.B → BRK-B）
    out["symbol"] = out["symbol"].str.replace(".", "-", regex=False)
    log(f"  → {len(out)} tickers, {out['sector'].nunique()} sectors")
    return out


# ============================================================
# 2. 週線價格 → 累積報酬
# ============================================================
# ============================================================
# v5 · 量價象限分析（4 state × 3 timeframe → 綜合判定）
# ============================================================
def _pv_state(price_ret, vol_change):
    """
    回傳 "P+V+" / "P+V-" / "P-V+" / "P-V-" · 缺一就 None
    · P+V+ 主力進場 · P+V- 頂部背離 · P-V+ 主力出貨/恐慌 · P-V- 縮量整理
    """
    if price_ret is None or vol_change is None:
        return None
    p = "P+" if price_ret > 0 else "P-"
    v = "V+" if vol_change > 0 else "V-"
    return f"{p}{v}"


def _pv_verdict(pv4, pv13, pv26):
    """
    三期 pv_state 綜合判定 · 越具體 rule 排越前
    最強訊號 · 三期全 P+V+ → 完美多頭 · 追
    最弱訊號 · 三期全 P+V- → 量能衰竭（分配階段）· 避
    """
    if pv4 is None or pv13 is None or pv26 is None:
        return "資料不足"
    # === 三期一致 · 極端訊號 ===
    if pv4 == "P+V+" and pv13 == "P+V+" and pv26 == "P+V+":
        return "⭐⭐⭐ 完美多頭"
    if pv4 == "P+V-" and pv13 == "P+V-" and pv26 == "P+V-":
        return "⚠️ 量能衰竭"    # 新增 · 三期都 P+V-（Wyckoff 分配·頂部訊號）
    if pv4 == "P-V-" and pv13 == "P-V-" and pv26 == "P-V-":
        return "🧊 熊市縮量"
    if pv4 == "P-V+" and pv13 == "P-V+" and pv26 == "P-V+":
        return "📉 主力出貨"
    # === 主升段結束 · 短中期已弱但長期仍量縮價漲 ===
    if pv4 == "P-V-" and pv13 == "P-V-" and pv26 == "P+V-":
        return "⚠️ 主升段結束"    # 新增
    # === 頂部背離 / 中期出貨 · 短長期矛盾 ===
    if pv4 == "P+V-" and pv26 == "P+V+":
        return "⚠️ 頂部背離"       # 短期量縮但長期仍量增
    if pv4 == "P-V+" and pv26 == "P+V+":
        return "⚠️ 中期出貨"
    if pv4 == "P+V-" and pv26 == "P+V-":
        return "⚠️ 量能背離"       # 新增 · 短長期都 P+V-（比頂部背離嚴重）
    # === 底部翻多 / 反彈初期 ===
    if pv4 == "P+V+" and pv13 == "P-V-" and pv26 == "P-V-":
        return "🌱 底部剛翻多"
    if pv4 == "P+V+" and pv26 == "P-V-":
        return "✨ 反彈初期"
    # === 一般健康 / 弱勢 ===
    if pv4 == "P+V+" and pv13 == "P+V+":
        return "🚀 健康多頭"
    if pv4 == "P-V-" and pv13 == "P-V-":
        return "😴 弱勢縮量"
    return "➡️ 中性"


def fetch_weekly_returns(tickers):
    """
    yfinance 批次抓 daily 收盤 · 回傳 DataFrame[symbol, cum_ret_4w, cum_ret_13w, cum_ret_26w]

    定義（v3 · 對齊 GAS / IBD / CFA 業界標準）：
      指定日 = AS_OF_DATE (若有) 否則 = T-1（不含今天 partial bar）
      4W%    = (指定日 close / 20 交易日前 close - 1) × 100
      13W%   = (指定日 close / 65 交易日前 close - 1) × 100
      26W%   = (指定日 close / 130 交易日前 close - 1) × 100
    """
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("需要 yfinance：pip install yfinance")

    log(f"Downloading daily prices + volume for {len(tickers)} tickers via yfinance...")
    all_close = None
    all_vol = None    # v5 新增 · 供 4W/13W/26W 量能變化計算
    for i in range(0, len(tickers), YF_BATCH):
        chunk = tickers[i : i + YF_BATCH]
        log(f"  batch {i // YF_BATCH + 1}/{(len(tickers) + YF_BATCH - 1) // YF_BATCH} ({len(chunk)} tickers)")
        # v5 · 需 260 交易日 buffer 才能算 26W 量能變化（前 130 vs 後 130）
        # 用 14 個月 (≈ 294 交易日) 剛好夠
        data = yf.download(
            chunk,
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=True,
            group_by="ticker",
            **_yf_window(14),
        )
        # yfinance 回傳格式因 chunk size 而異
        if isinstance(data.columns, pd.MultiIndex):
            avail = [t for t in chunk if t in data.columns.get_level_values(0)]
            close = pd.DataFrame({t: data[t]["Close"] for t in avail})
            vol = pd.DataFrame({t: data[t]["Volume"] for t in avail})
        else:
            close = data[["Close"]].rename(columns={"Close": chunk[0]})
            vol = data[["Volume"]].rename(columns={"Volume": chunk[0]})
        all_close = close if all_close is None else all_close.join(close, how="outer")
        all_vol = vol if all_vol is None else all_vol.join(vol, how="outer")

    if all_close is None or all_close.empty:
        raise RuntimeError("yfinance 沒抓到任何資料")

    all_close = all_close.dropna(how="all").sort_index()
    all_vol = all_vol.reindex(all_close.index) if all_vol is not None else None

    # T-1 保護：擋掉「今天」的 partial daily bar
    # AS_OF 模式：保留 <= as_of · 現況模式：保留 < today
    cutoff = _cutoff_date()
    idx = pd.to_datetime(all_close.index)
    if AS_OF_DATE is not None:
        keep = idx.date <= cutoff
    else:
        keep = idx.date < cutoff
    dropped = int((~keep).sum())
    if dropped:
        log(f"  · 擋掉 {dropped} 根 > {cutoff} 的 partial daily bar")
    all_close = all_close.loc[keep]
    if all_vol is not None:
        all_vol = all_vol.loc[keep]

    log(f"  → close matrix: {all_close.shape[0]} trading days × {all_close.shape[1]} tickers")

    # as_of_date = 最後一根 daily close 的實際日期
    last_bar_ts = all_close.index[-1]
    as_of_date = last_bar_ts.strftime("%Y-%m-%d")
    log(f"  → as_of_date (指定日 · 最後一根 daily close) = {as_of_date}")

    rows = []
    for sym in all_close.columns:
        col = all_close[sym]
        # 個股最新一根若為 NaN · 表示這檔沒抓到 as_of_date 那天資料 · 跳過
        # 避免 t_price 用到更早的 close 卻標成 as_of_date
        if pd.isna(col.iloc[-1]):
            continue
        series = col.dropna()
        # 需至少 131 個 close 才能算 26W (iloc[-131] 存在)
        if len(series) < 131:
            continue
        # 保護：實際最後有效日期必須等於 as_of_date
        if series.index[-1] != last_bar_ts:
            continue
        cur = series.iloc[-1]
        try:
            # 20 / 65 / 130 交易日前收盤（對齊 GAS / IBD 業界標準）
            r4 = (cur / series.iloc[-20] - 1) * 100
            r13 = (cur / series.iloc[-65] - 1) * 100
            r26 = (cur / series.iloc[-130] - 1) * 100
        except IndexError:
            continue
        # Point = 4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）
        point = r4 * 0.25 + r13 * 0.25 + r26 * 0.50
        # di = 三週期正報酬指標
        di = ((1 if r4 > 0 else 0) + (1 if r13 > 0 else 0) + (1 if r26 > 0 else 0)) / 3.0

        # ==== v5 · 量能變化 + 量價象限 ====
        # 用同一 index 對齊的 volume series · 缺一則 None
        avg_v_4w = avg_v_13w = avg_v_26w = None
        vol_ch_4w = vol_ch_13w = vol_ch_26w = None
        pv4 = pv13 = pv26 = None
        pv_verdict = "資料不足"
        if all_vol is not None and sym in all_vol.columns:
            vcol = all_vol[sym]
            v_aligned = vcol.reindex(series.index)  # 對齊到有效 close 那些天
            v_valid = v_aligned.dropna()
            n = len(v_valid)
            try:
                if n >= 20:
                    avg_v_4w = float(v_valid.iloc[-20:].mean())
                if n >= 65:
                    avg_v_13w = float(v_valid.iloc[-65:].mean())
                if n >= 130:
                    avg_v_26w = float(v_valid.iloc[-130:].mean())
                # 量變 · 當期均量 / 前一同期均量 - 1
                if n >= 40:
                    prev_20 = float(v_valid.iloc[-40:-20].mean())
                    if prev_20 > 0:
                        vol_ch_4w = (avg_v_4w / prev_20 - 1) * 100
                if n >= 130:
                    prev_65 = float(v_valid.iloc[-130:-65].mean())
                    if prev_65 > 0:
                        vol_ch_13w = (avg_v_13w / prev_65 - 1) * 100
                if n >= 260:
                    prev_130 = float(v_valid.iloc[-260:-130].mean())
                    if prev_130 > 0:
                        vol_ch_26w = (avg_v_26w / prev_130 - 1) * 100
            except (IndexError, ZeroDivisionError):
                pass
            pv4 = _pv_state(r4, vol_ch_4w)
            pv13 = _pv_state(r13, vol_ch_13w)
            pv26 = _pv_state(r26, vol_ch_26w)
            pv_verdict = _pv_verdict(pv4, pv13, pv26)

        rows.append({
            "symbol": sym,
            "as_of_date": as_of_date,
            "t_price": round(float(cur), 2),
            "cum_ret_4w": round(r4, 2),
            "cum_ret_13w": round(r13, 2),
            "cum_ret_26w": round(r26, 2),
            "point": round(point, 2),
            "di": round(di, 3),
            # v5 · 量能 + 量價象限
            "avg_vol_4w": int(avg_v_4w) if avg_v_4w is not None else None,
            "avg_vol_13w": int(avg_v_13w) if avg_v_13w is not None else None,
            "avg_vol_26w": int(avg_v_26w) if avg_v_26w is not None else None,
            "vol_change_4w": round(vol_ch_4w, 2) if vol_ch_4w is not None else None,
            "vol_change_13w": round(vol_ch_13w, 2) if vol_ch_13w is not None else None,
            "vol_change_26w": round(vol_ch_26w, 2) if vol_ch_26w is not None else None,
            "pv_state_4w": pv4,
            "pv_state_13w": pv13,
            "pv_state_26w": pv26,
            "pv_verdict": pv_verdict,
        })
    out = pd.DataFrame(rows)
    log(f"  → {len(out)} tickers with 131+ trading days of data")
    return out


# ============================================================
# 2b. VCP 濾網（daily OHLCV · 只對 pre-filter subset 抓）
# ============================================================
def fetch_daily_ohlcv_for_vcp(tickers, expected_as_of=None):
    """
    抓 1 年 daily OHLCV · 只給 stage 2 的 pre-filter subset 用
    · 3mo 太短算不出 52 週高（策略 A step 6 關卡二需要「距高點」）
    · 1y 抓完約 252 個交易日 · 剛好夠算 52w high + 50MA + 10 日振幅

    v4 改用 auto_adjust=False · 一次拿到 raw OHLCV + Adj Close：
      · Adj Close     : 股息還原後 close · 舊 auto_adjust=True 的 Close 等價值
      · High/Low/Open : 未還原（Yahoo/TradingView chart 看到的原始價位）
      · Volume        : 原始量（兩種 auto_adjust 都一樣）
    · 保留 raw High 給 compute_vcp_row 算 high_52w_raw（Yahoo 上顯示的原始 52W 高）

    expected_as_of · 若給就把 daily 統一切齊到那天（可為 str "YYYY-MM-DD" 或 date）
    · 避免與 fetch_weekly_returns 的 t_price 日期不一致（volume off-by-one 根因）
    · 不給就沿用舊行為 · 依 AS_OF_DATE / today UTC 切
    回傳 dict[symbol → DataFrame(Open/High/Low/Close/Adj Close/Volume)]
    """
    import yfinance as yf
    log(f"Downloading daily OHLCV for {len(tickers)} pre-filtered tickers (for VCP + 52w high)...")
    # 統一 cutoff · 優先 expected_as_of · 其次 AS_OF_DATE · 最後 today UTC
    if expected_as_of is not None:
        cutoff = (expected_as_of if hasattr(expected_as_of, 'year')
                  else datetime.strptime(str(expected_as_of), "%Y-%m-%d").date())
        cutoff_mode = "expected_as_of"
    elif AS_OF_DATE is not None:
        cutoff = AS_OF_DATE
        cutoff_mode = "AS_OF_DATE"
    else:
        cutoff = datetime.now(timezone.utc).date()
        cutoff_mode = "today_utc_excl"
    log(f"  · daily cutoff = {cutoff} · mode = {cutoff_mode}")

    out = {}
    for i in range(0, len(tickers), YF_BATCH):
        chunk = tickers[i : i + YF_BATCH]
        data = yf.download(
            chunk, interval="1d",
            auto_adjust=False, progress=False, threads=True, group_by="ticker",
            **_yf_window(12),
        )
        def _cut(sub):
            idx_dates = pd.to_datetime(sub.index).date
            if cutoff_mode == "today_utc_excl":
                return sub.loc[idx_dates < cutoff]  # 現況模式排除 today partial bar
            return sub.loc[idx_dates <= cutoff]
        if isinstance(data.columns, pd.MultiIndex):
            for t in chunk:
                if t in data.columns.get_level_values(0):
                    sub = data[t].dropna(how="all")
                    out[t] = _cut(sub)
        else:
            out[chunk[0]] = _cut(data.dropna(how="all"))
    log(f"  → daily fetched for {len(out)} tickers")
    return out


# ============================================================
# Dow Theory 頭頭低 / 底底高 · swing detection (v4 新增)
# ============================================================
def _find_swings(highs, lows, n=5):
    """
    N-bar fractal 找 swing high/low
    · 一根 bar 是 swing high · 若它的 high 是前後各 n 根裡最高
    · swing low 同理
    · 相鄰同型（連續兩個 H 或連續兩個 L）保留更極端者
    回傳 list[{idx, price, kind: 'H'|'L'}]
    """
    swings = []
    for i in range(n, len(highs) - n):
        is_high, is_low = True, True
        for k in range(i - n, i + n + 1):
            if k == i:
                continue
            if highs[k] > highs[i]:
                is_high = False
            if lows[k] < lows[i]:
                is_low = False
        if is_high:
            swings.append({"idx": i, "price": float(highs[i]), "kind": "H"})
        if is_low:
            swings.append({"idx": i, "price": float(lows[i]), "kind": "L"})
    cleaned = []
    for s in swings:
        if cleaned and cleaned[-1]["kind"] == s["kind"]:
            last = cleaned[-1]
            if (s["kind"] == "H" and s["price"] > last["price"]) or \
               (s["kind"] == "L" and s["price"] < last["price"]):
                cleaned[-1] = s
        else:
            cleaned.append(s)
    return cleaned


def _detect_trend(highs, lows, closes, n=5):
    """
    Dow Theory 頭頭低/底底高 · 回傳 dict{state, pattern, signal}

    state:
      多頭  · 頭頭高 + 底底高
      空頭  · 頭頭低 + 底底低
      收斂  · 頭頭低 + 底底高（三角蓄勢）
      擴散  · 頭頭高 + 底底低（喇叭 · 避）
      資料不足 · swing 不夠 2 個

    pattern: e.g. "頭頭低·底底低"
    signal (comma-joined):
      多轉空預警 · H0<H1 且 H2<H1（H1 是轉折頂）
      空轉多預警 · L0>L1 且 L2>L1（L1 是轉折底）
      空頭確認   · last_close < 最新 swing low（收盤破前底）
      多頭確認   · last_close > 最新 swing high（收盤破前高）

    註：Dow Theory 只認收盤價確認 · 不看盤中假突破
    """
    if len(highs) < n * 2 + 5:
        return {"state": "資料不足", "pattern": "", "signal": ""}
    swings = _find_swings(highs, lows, n)
    H = [s for s in swings if s["kind"] == "H"][-3:]
    L = [s for s in swings if s["kind"] == "L"][-3:]
    if len(H) < 2 or len(L) < 2:
        return {"state": "資料不足", "pattern": "", "signal": ""}
    last_close = float(closes[-1])
    h1, h2 = H[-2]["price"], H[-1]["price"]
    l1, l2 = L[-2]["price"], L[-1]["price"]
    hp = "頭頭高" if h2 > h1 else "頭頭低"
    lp = "底底高" if l2 > l1 else "底底低"
    if hp == "頭頭高" and lp == "底底高":
        state = "多頭"
    elif hp == "頭頭低" and lp == "底底低":
        state = "空頭"
    elif hp == "頭頭低" and lp == "底底高":
        state = "收斂"
    else:
        state = "擴散"
    signals = []
    if len(H) >= 3 and H[0]["price"] < h1 and h2 < h1:
        signals.append("多轉空預警")
    if len(L) >= 3 and L[0]["price"] > l1 and l2 > l1:
        signals.append("空轉多預警")
    if last_close < l2:
        signals.append("空頭確認")
    if last_close > h2:
        signals.append("多頭確認")
    return {
        "state": state,
        "pattern": f"{hp}·{lp}",
        "signal": " / ".join(signals),
    }


def _compute_vp_score_stock(ret_20d_pct, ret_5d_pct, vp, ud):
    """
    量價絕對評分 0-100（跟 sector_scorecard.py compute_vp_score 完全一致）
      MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20
                        + VP×50×0.35 + UD×100×0.15 + 50))
    註：20d/5d 用小數（0.05 = 5%）
    """
    if any(v is None for v in (ret_20d_pct, ret_5d_pct, vp, ud)):
        return None
    r20 = ret_20d_pct / 100.0
    r5 = ret_5d_pct / 100.0
    raw = r20 * 200 * 0.30 + r5 * 200 * 0.20 + vp * 50 * 0.35 + ud * 100 * 0.15 + 50
    return max(0.0, min(100.0, raw))


def compute_vcp_row(sym, sub, expected_as_of=None):
    """
    對單一 ticker 從 daily OHLCV 算全套 daily-based 指標：

      【VCP 相關】
      above_50ma      : t_price > 50 日 close 均值
      ma50            : 50 日 close 均值
      amp_10d_pct     : 近 10 日振幅
      vp_ratio_stock  : 個股 VP = 20 日上漲日均量 / 下跌日均量（AD/AC）
      vcp             : above_50ma AND amp_10d_pct<3 AND vp_ratio_stock>1.0
      high_52w        : 52 週高（股息還原後 · Adj-scaled · 與 close 同基準）
      high_52w_raw    : 52 週高（原始未還原 · Yahoo/TradingView 上顯示的價位）
      pct_from_high   : 距高點 (adj 版) · t_price 也是 adj close 所以同基準

      【量價評分（同 sector scorecard 公式，個股版）】
      vol_10d_avg / vol_today / vol_3w_avg / vol_ratio_stock_20d
      ret_5d / ret_20d
      up_days_20 / down_days_20 / up_avg_vol / down_avg_vol
      ud_ratio        : 上漲天數 / 下跌天數
      vp_score_stock  : 0-100 絕對評分（same formula as sector）

    expected_as_of · 若給就驗證 sub 的最後一根 bar 必須是那天
      · 不對就 return None（跳過 · 避免 volume 用到早一天的錯誤資料）
      · 這是 stage 2 資料一致性守門員
    """
    if sub is None or len(sub) < 50:
        return None

    # 日期一致性驗證 · 擋 fetch_weekly_returns 的 t_price 日期 vs
    # fetch_daily_ohlcv_for_vcp 的 vol_today 日期錯位
    if expected_as_of is not None and len(sub):
        actual_last = pd.to_datetime(sub.index[-1]).strftime("%Y-%m-%d")
        expected_str = (expected_as_of if isinstance(expected_as_of, str)
                        else expected_as_of.strftime("%Y-%m-%d"))
        if actual_last != expected_str:
            log(f"  ⚠ {sym}: daily last bar {actual_last} != expected {expected_str} · skip")
            return None

    # auto_adjust=False 拿到 Adj Close + raw High/Low/Close · 分兩系列處理
    if "Adj Close" in sub.columns:
        # 每根 bar 的股息還原比例 (recent bars → 1.0 · past bars ≤ 1.0)
        factor = (sub["Adj Close"] / sub["Close"]).replace(
            [float("inf"), -float("inf")], 1.0
        ).fillna(1.0)
        close = sub["Adj Close"].dropna()
        high = (sub["High"] * factor).dropna()  # 股息還原後 High（與 close 同基準）
        low = (sub["Low"] * factor).dropna()
        raw_high = sub["High"].dropna()  # 未還原 · 供 high_52w_raw + Dow Theory
        raw_low = sub["Low"].dropna()    # 未還原 · 供 Dow Theory swing detection
        raw_close = sub["Close"].dropna()  # 未還原 · 供 Dow Theory 收盤確認
    else:
        # 向下相容 auto_adjust=True 的 sub（若外部改回）
        close = sub["Close"].dropna()
        high = sub["High"].dropna()
        low = sub["Low"].dropna()
        raw_high = sub["High"].dropna()
        raw_low = sub["Low"].dropna()
        raw_close = sub["Close"].dropna()
    vol = sub["Volume"].dropna()
    if len(close) < 50:
        return None

    t_price = float(close.iloc[-1])
    ma50 = float(close.iloc[-50:].mean())
    above_50ma = t_price > ma50

    # 近 10 日振幅
    win_h = high.iloc[-10:]
    win_l = low.iloc[-10:]
    win_c = close.iloc[-10:]
    amp_10d_pct = (win_h.max() - win_l.min()) / win_c.mean() * 100 if win_c.mean() > 0 else 0.0

    # 近 20 日 up/down 分析（AD/AC + up_days/down_days + up_avg_vol/down_avg_vol）
    last21 = sub.tail(21)
    diffs = last21["Close"].diff().dropna()
    ups = diffs > 0
    downs = diffs < 0
    up_days_20 = int(ups.sum())
    down_days_20 = int(downs.sum())
    vols20 = last21["Volume"].iloc[1:]
    ad = float(vols20[ups.values].mean()) if ups.any() else 0.0
    ac = float(vols20[downs.values].mean()) if downs.any() else 0.0
    vp_ratio = (ad / ac) if ac > 0 else None
    ud_ratio = (up_days_20 / down_days_20) if down_days_20 > 0 else None

    vcp = bool(above_50ma) and amp_10d_pct < 3.0 and (vp_ratio is not None and vp_ratio > 1.0)

    # 52 週高（策略 A step 6 關卡二）
    # high_52w      : 股息還原後高（與 t_price/adj close 同基準 · 給 pct_from_high 用）
    # high_52w_raw  : Yahoo/TradingView 上顯示的原始高（供人眼比對）
    high_52w = float(high.max())
    high_52w_raw = float(raw_high.max()) if len(raw_high) else None
    pct_from_high = (t_price / high_52w - 1) * 100 if high_52w > 0 else 0.0

    # 5/20 日 daily 累積報酬（跟 sector scorecard 對齊 · 個股層一樣公式）
    ret_5d = (close.iloc[-1] / close.iloc[-6] - 1) * 100 if len(close) >= 6 else None
    ret_20d = (close.iloc[-1] / close.iloc[-21] - 1) * 100 if len(close) >= 21 else None

    # 成交量指標
    vol_today = int(vol.iloc[-1]) if len(vol) else 0
    vol_10d_avg = int(vol.iloc[-10:].mean()) if len(vol) >= 10 else 0
    vol_3w_avg_val = float(vol.iloc[-15:].mean()) if len(vol) >= 15 else 0.0
    vol_3w_avg = int(vol_3w_avg_val)
    vol_ratio_stock = round(vol_today / vol_3w_avg_val, 3) if vol_3w_avg_val > 0 else None

    # 量價絕對評分（同 sector 公式）
    vp_score_stock = _compute_vp_score_stock(ret_20d, ret_5d, vp_ratio, ud_ratio)

    # Dow Theory 頭頭低/底底高 · 用 raw High/Low/Close（對應 chart 上看到的擺動點）
    # N=5 適合日線中波段（~2 週擺盪）
    trend = _detect_trend(raw_high.tolist(), raw_low.tolist(), raw_close.tolist(), n=5)

    return {
        "symbol": sym,
        # VCP 群
        "above_50ma": bool(above_50ma),
        "ma50": round(ma50, 2),
        "amp_10d_pct": round(amp_10d_pct, 2),
        "vp_ratio_stock": round(vp_ratio, 3) if vp_ratio is not None else None,
        "vcp": vcp,
        "high_52w": round(high_52w, 2),
        "high_52w_raw": round(high_52w_raw, 2) if high_52w_raw is not None else None,
        "pct_from_high": round(pct_from_high, 2),
        # 量價評分群（新）
        "ret_5d": round(ret_5d, 2) if ret_5d is not None else None,
        "ret_20d": round(ret_20d, 2) if ret_20d is not None else None,
        "up_days_20": up_days_20,
        "down_days_20": down_days_20,
        "up_avg_vol": int(ad),
        "down_avg_vol": int(ac),
        "ud_ratio": round(ud_ratio, 3) if ud_ratio is not None else None,
        "vol_today": vol_today,
        "vol_10d_avg": vol_10d_avg,
        "vol_3w_avg": vol_3w_avg,
        "vol_ratio_stock_20d": vol_ratio_stock,
        "vp_score_stock": round(vp_score_stock, 2) if vp_score_stock is not None else None,
        # Dow Theory 趨勢群（新）
        "trend_state": trend["state"],
        "trend_pattern": trend["pattern"],
        "trend_signal": trend["signal"],
    }


def compute_vcp_metrics_batch(tickers, expected_as_of=None):
    """
    對 pre-filter subset 批次算 VCP · 回傳 DataFrame
    expected_as_of · 統一 stage 2b daily 資料的最後日期 · 一路傳到 fetch + row 驗證
    """
    daily_data = fetch_daily_ohlcv_for_vcp(tickers, expected_as_of=expected_as_of)
    rows = []
    skipped_date_mismatch = 0
    for sym in tickers:
        r = compute_vcp_row(sym, daily_data.get(sym), expected_as_of=expected_as_of)
        if r:
            rows.append(r)
        elif daily_data.get(sym) is not None and len(daily_data[sym]) >= 50:
            skipped_date_mismatch += 1
    df = pd.DataFrame(rows)
    if len(df):
        log(f"  → VCP metrics: {len(df)} 個 · above_50ma={df['above_50ma'].sum()} · vcp=TRUE={df['vcp'].sum()}")
    if skipped_date_mismatch:
        log(f"  ⚠ {skipped_date_mismatch} 個 ticker 因 daily 最後日期 != {expected_as_of} 被跳過（資料一致性守門員）")
    return df


# ============================================================
# 3. Earnings Surprise via yfinance
# ============================================================
# 原本用 FMP /api/v3/earnings-surprises · 但那 endpoint free tier 403
# 改用 yfinance 的 earnings_dates DataFrame · 免 key 且無 rate limit
#
# yfinance 回傳格式：
#   ticker.earnings_dates → DataFrame(index=DatetimeIndex, cols=[EPS Estimate, Reported EPS, Surprise(%)])
#   包含未來預告財報（Reported EPS 為 NaN）· 我們只用「已公告」的兩筆
def fetch_yf_surprise(symbol, stats):
    """回傳 (l1_pct, l2_pct, pre_earnings_14d)。抓不到回 (None, None, None)"""
    try:
        import yfinance as yf
        from datetime import timedelta
        ticker = yf.Ticker(symbol)
        df = ticker.earnings_dates
        if df is None or df.empty:
            stats["empty_response"] += 1
            return (None, None, None)

        # 判斷未來 14 天內有沒有未公告財報（策略 A step 6 財報地雷確認）
        # 回放模式：用 AS_OF_DATE 當「當下」· 只看那時候「未來 14 天」
        if AS_OF_DATE is not None:
            now_utc = datetime.combine(AS_OF_DATE, datetime.min.time()).replace(tzinfo=timezone.utc)
        else:
            now_utc = datetime.now(timezone.utc)
        future_cutoff = now_utc + timedelta(days=14)
        # 回放模式：把「當時未來」以外的財報都當已知（reported 或未來但已過 as_of）
        # 簡化：filter df 只留 index <= future_cutoff 的（其他忽略）
        unreported = df[df["Reported EPS"].isna()]
        pre_14d = False
        for idx in unreported.index:
            try:
                d = idx.to_pydatetime()
                d_naive = d.replace(tzinfo=None) if d.tzinfo else d
                now_naive = now_utc.replace(tzinfo=None)
                future_naive = future_cutoff.replace(tzinfo=None)
                if now_naive <= d_naive <= future_naive:
                    pre_14d = True
                    break
            except Exception:
                continue

        # 只留「as_of 當時已公告」的（Reported EPS 有值 AND 日期 <= as_of）· 按日期倒序
        past = df.dropna(subset=["Reported EPS"]).sort_index(ascending=False)
        if AS_OF_DATE is not None:
            past_idx = past.index
            try:
                d_naive = pd.to_datetime(past_idx).tz_localize(None) if past_idx.tz is not None else pd.to_datetime(past_idx)
                past = past.loc[d_naive.date <= AS_OF_DATE]
            except Exception:
                pass
        if len(past) == 0:
            stats["no_history"] += 1
            return (None, None, pre_14d)

        def _pct(row):
            # yfinance 直接提供 Surprise(%) · 用就好
            if "Surprise(%)" in row.index and pd.notna(row["Surprise(%)"]):
                return round(float(row["Surprise(%)"]), 2)
            # fallback 自己算
            est = row.get("EPS Estimate")
            act = row.get("Reported EPS")
            if pd.isna(est) or pd.isna(act) or est == 0:
                return None
            return round((act - est) / abs(est) * 100, 2)

        l1 = _pct(past.iloc[0]) if len(past) > 0 else None
        l2 = _pct(past.iloc[1]) if len(past) > 1 else None
        if l1 is not None or l2 is not None:
            stats["ok_with_data"] += 1
        else:
            stats["ok_but_null"] += 1
        return (l1, l2, pre_14d)
    except Exception as e:
        stats["exception"] += 1
        stats["last_exception"] = str(e)[:120]
        return (None, None, None)


def fetch_surprises_parallel(symbols):
    """
    平行呼叫 yfinance earnings_dates。回傳 DataFrame[symbol, surprise_l1, surprise_l2]。
    """
    log(f"Fetching earnings surprises for {len(symbols)} tickers via yfinance...")
    if FMP_KEY:
        log("  (FMP_API_KEY 有設但目前不用 · free tier /earnings-surprises 是 403 · secret 可留著)")
    rows = []
    stats = {"ok_with_data": 0, "ok_but_null": 0, "empty_response": 0,
             "no_history": 0, "exception": 0}
    # yfinance 內部有 rate limit / caching · 4 workers 是個穩定的並行值
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_yf_surprise, s, stats): s for s in symbols}
        done = 0
        for fut in as_completed(futs):
            sym = futs[fut]
            l1, l2, pre_14d = fut.result()
            rows.append({"symbol": sym, "surprise_l1": l1, "surprise_l2": l2,
                         "pre_earnings_14d": pre_14d})
            done += 1
            if done % 50 == 0:
                log(f"  {done}/{len(symbols)}")
    log("=" * 60)
    log(f"yfinance surprise fetch summary ({len(symbols)} tickers):")
    log(f"  ✅ ok_with_data:  {stats['ok_with_data']}")
    log(f"  ⚠  ok_but_null:   {stats['ok_but_null']}  (有歷史財報但 Surprise NaN)")
    log(f"  ⚠  no_history:    {stats['no_history']}  (只有未來預告 · 沒歷史財報)")
    log(f"  ⚠  empty_response:{stats['empty_response']}  (earnings_dates 直接是空)")
    log(f"  ❌ exception:     {stats['exception']}  · last: {stats.get('last_exception', '')}")
    log("=" * 60)
    return pd.DataFrame(rows)


# ============================================================
# 4. 篩選 + 排名
# ============================================================
def apply_earnings_filter(df):
    """
    盈餘動能篩選：
      - 兩期都是正 surprise，或
      - L1 > L2（改善趨勢）
    有 FMP key 時才生效；沒 key（surprise 全 NA）直接回原表。
    """
    if df["surprise_l1"].isna().all():
        return df
    def keep(row):
        l1, l2 = row.get("surprise_l1"), row.get("surprise_l2")
        if l1 is None:
            return False  # 至少要有 L1
        if l2 is None:
            return l1 > 0  # 只有 L1 就看 L1
        if l1 > 0 and l2 > 0:
            return True
        if l1 > l2:  # 改善
            return True
        return False
    mask = df.apply(keep, axis=1)
    return df[mask].copy()


def pick_top_n_per_sector(df, sort_col, top_n=TOP_N, ascending=False):
    return (
        df.sort_values(["sector", sort_col], ascending=[True, ascending])
        .groupby("sector", as_index=False)
        .head(top_n)
        .sort_values(["sector", sort_col], ascending=[True, ascending])
        .reset_index(drop=True)
    )


def pre_filter_union(df, per_sector=PRE_FILTER_PER_SECTOR):
    """三個時間尺度各取每 sector 前 N 名的 union，餵給 FMP surprise 抓取"""
    parts = []
    for col in ("cum_ret_4w", "cum_ret_13w", "cum_ret_26w"):
        parts.append(pick_top_n_per_sector(df, col, top_n=per_sector))
    union = pd.concat(parts).drop_duplicates(subset=["symbol"])
    return union["symbol"].tolist()


def add_sector_internal_ranks(df):
    """
    對每個 sector 內部：算 4W/13W/26W 排名（1 = 最強）+ CMS_A
    CMS_A = 0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）
    """
    df = df.copy()
    for col in ("cum_ret_4w", "cum_ret_13w", "cum_ret_26w"):
        df[col + "_rank_in_sector"] = df.groupby("sector")[col].rank(
            method="min", ascending=False
        ).astype(int)
    df["cms_a"] = (
        df["cum_ret_4w_rank_in_sector"] * 0.5
        + df["cum_ret_13w_rank_in_sector"] * 0.3
        + df["cum_ret_26w_rank_in_sector"] * 0.2
    ).round(2)
    return df


def add_sector_stock_composite_ranks(df):
    """
    對每個 sector 內部：算 Point / vp_score / vol_ratio 排名
    綜合分 (in sector) = point_rank×0.4 + vp_score_rank×0.4 + vol_rank×0.2（越小越強）
    加 stock_gap_alert：Point vs vp_score rank 差 > 5 → 吃老本 / 剛爆發

    只對有 daily 資料的個股計算（其他 sector 沒 daily 的 subset 會是 NaN · JSON 序列化時 skip）
    """
    df = df.copy()
    # NaN 的 vp_score / vol_ratio_stock 排名放最後（bottom）
    df["point_rank_in_sector"] = df.groupby("sector")["point"].rank(
        method="min", ascending=False, na_option="bottom"
    ).astype("Int64")
    df["vp_score_rank_in_sector"] = df.groupby("sector")["vp_score_stock"].rank(
        method="min", ascending=False, na_option="bottom"
    ).astype("Int64")
    df["vol_rank_in_sector"] = df.groupby("sector")["vol_ratio_stock_20d"].rank(
        method="min", ascending=False, na_option="bottom"
    ).astype("Int64")

    # 綜合分（只對有 vp_score 的算 · 其他留 NaN）
    has_vp = df["vp_score_stock"].notna()
    df["composite_in_sector"] = None
    df.loc[has_vp, "composite_in_sector"] = (
        df.loc[has_vp, "point_rank_in_sector"] * 0.4
        + df.loc[has_vp, "vp_score_rank_in_sector"] * 0.4
        + df.loc[has_vp, "vol_rank_in_sector"] * 0.2
    ).round(2)
    df["composite_rank_in_sector"] = df.groupby("sector")["composite_in_sector"].rank(
        method="min", ascending=True, na_option="bottom"
    ).astype("Int64")

    # 個股層 gap_alert（Point vs vp_score rank 差 > 5）
    def _gap(row):
        pr, vr = row.get("point_rank_in_sector"), row.get("vp_score_rank_in_sector")
        if pd.isna(pr) or pd.isna(vr):
            return None
        if abs(pr - vr) <= 5:
            return None
        return "吃老本" if pr < vr else "剛爆發"
    df["stock_gap_alert"] = df.apply(_gap, axis=1)

    return df


# ============================================================
# 5. 輸出
# ============================================================
def save_outputs(df_all, top3_4w, top3_13w, top3_cms_a, top3_26w, top3_composite):
    os.makedirs(OUTDIR, exist_ok=True)
    as_of = df_all["as_of_date"].iloc[0] if "as_of_date" in df_all and len(df_all) else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")

    files = {}
    def _save(df, tag):
        path = os.path.join(OUTDIR, f"{stamp}_{tag}.csv")
        df.to_csv(path, index=False)
        files[tag] = os.path.basename(path)
        log(f"  saved {path} ({len(df)} rows)")

    _save(df_all, "all")
    _save(top3_4w, "top3_4w")
    _save(top3_13w, "top3_13w")
    _save(top3_26w, "top3_26w")
    _save(top3_cms_a, "top3_cms_a")
    if len(top3_composite):
        _save(top3_composite, "top3_composite")

    def _records(df):
        return df.where(pd.notna(df), None).to_dict(orient="records")

    vcp_true_count = int(df_all["vcp"].sum()) if "vcp" in df_all else 0

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "基準日 = 該週最後一根 daily close 的實際日期（週線 Monday label + 校正）· 例：2026-08-21 表示週 Aug 17-21 的 Fri close",
        "counts": {
            "universe": int(len(df_all)),
            "after_earnings_filter": int(df_all["earnings_passed"].sum()) if "earnings_passed" in df_all else None,
            "vcp_true": vcp_true_count,
            "top3_4w": int(len(top3_4w)),
            "top3_13w": int(len(top3_13w)),
            "top3_26w": int(len(top3_26w)),
            "top3_cms_a": int(len(top3_cms_a)),
            "top3_composite": int(len(top3_composite)),
        },
        "files": files,
        "top3": {
            "4w": _records(top3_4w),
            "13w": _records(top3_13w),
            "26w": _records(top3_26w),
            "cms_a": _records(top3_cms_a),
            "composite": _records(top3_composite),
        },
        "formulas": {
            "point": "4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）",
            "cms_a": "0.5×4W_rank_in_sector + 0.3×13W_rank_in_sector + 0.2×26W_rank_in_sector（越小越強，重短線）",
            "di": "((4W>0)+(13W>0)+(26W>0))/3；1.0 = 三週期全漲",
            "vcp": "AND(t_price>50MA, 近10日振幅<3%, VP=AD/AC>1.0) · 站上50MA + 波動收斂 + 上漲有量",
            "high_52w": "52 週最高 High（股息還原後 · 與 close/t_price 同基準 · pct_from_high 用這個）",
            "high_52w_raw": "52 週最高 High（原始未還原 · Yahoo/TradingView chart 上直接看到的價位）",
            "vp_score_stock": "MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20 + VP×50×0.35 + UD×100×0.15 + 50))（同 sector 公式，個股版）",
            "composite_in_sector": "point_rank×0.4 + vp_score_rank×0.4 + vol_rank×0.2（in sector · 越小越強）",
            "stock_gap_alert": "|point_rank_in_sector - vp_score_rank_in_sector| > 5 → 吃老本 / 剛爆發（板塊內錯位）",
            "trend_state": "Dow Theory · 多頭(HH+HL) / 空頭(LH+LL) / 收斂(LH+HL 三角蓄勢) / 擴散(HH+LL 喇叭)",
            "trend_pattern": "頭底型態 · 例：頭頭低·底底低（連續 lower high + lower low）· N=5 bar fractal swing detection",
            "trend_signal": "反轉/確認訊號 · 多轉空預警 / 空轉多預警 / 空頭確認(收破前底) / 多頭確認(收破前高)",
            "avg_vol_4w": "近 20 交易日均量（跟 cum_ret_4w 同基準）",
            "avg_vol_13w": "近 65 交易日均量",
            "avg_vol_26w": "近 130 交易日均量",
            "vol_change_4w": "(近 20d 均量 / 前 20d 均量 - 1)×100 · 跨期量能趨勢",
            "vol_change_13w": "(近 65d 均量 / 前 65d 均量 - 1)×100",
            "vol_change_26w": "(近 130d 均量 / 前 130d 均量 - 1)×100 · 需 260 交易日資料",
            "pv_state_4w/13w/26w": "量價象限 · P+V+ 主力進場/P+V- 頂部背離/P-V+ 主力出貨/P-V- 縮量整理",
            "pv_verdict": "三期綜合判定 · ⭐⭐⭐ 完美多頭 / ⚠️ 頂部背離 / 📉 主力出貨 / 🌱 底部翻多 / 🚀 健康多頭 / 🧊 熊市縮量 / 其他",
        },
        "sectors": sorted(df_all["sector"].dropna().unique().tolist()),
        "surprise_source": "yfinance (earnings_dates)",
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved manifest {MANIFEST_PATH}")


# ============================================================
# 6. main
# ============================================================
def main():
    global AS_OF_DATE
    parser = argparse.ArgumentParser(description="S&P 500 sector rotation screener (stage 2)")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · 用 YYYY-MM-DD 前一天的 close 為基準（不填 = 用最新）")
    args = parser.parse_args()
    if args.as_of:
        AS_OF_DATE = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        log(f"⏪ 回放模式 · as_of = {AS_OF_DATE}")

    t0 = time.time()

    # (1) universe
    universe = fetch_sp500_constituents()

    # (2) 價格動能（附 Point / di）
    ret_df = fetch_weekly_returns(universe["symbol"].tolist())
    price_df = universe.merge(ret_df, on="symbol", how="inner")

    # 從 fetch_weekly_returns 拿權威 as_of_date · 稍後傳給 stage 2b 保證日期一致
    authoritative_as_of = ret_df["as_of_date"].iloc[0] if len(ret_df) else None
    log(f"權威 as_of_date = {authoritative_as_of} · 將傳給 stage 2b daily fetch")

    # (2b) 板塊內排名 + CMS_A
    price_df = add_sector_internal_ranks(price_df)

    # (3) 預篩 union（三尺度各 sector 前 15）
    pre_syms = pre_filter_union(price_df)
    log(f"Pre-filter union: {len(pre_syms)} tickers → sent to FMP")

    # (4) 抓 surprise
    surp_df = fetch_surprises_parallel(pre_syms)
    full_df = price_df.merge(surp_df, on="symbol", how="left")

    # (4b) 個股 daily 指標一次算齊：VCP + 高點 + vp_score + vol_ratio + ret_5d/20d
    # 傳 authoritative_as_of · 讓 daily 統一切齊到 weekly 的最後日期 · 擋 volume off-by-one
    vcp_df = compute_vcp_metrics_batch(pre_syms, expected_as_of=authoritative_as_of)
    if len(vcp_df):
        full_df = full_df.merge(vcp_df, on="symbol", how="left")
    else:
        for c in ("above_50ma", "ma50", "amp_10d_pct", "vp_ratio_stock", "vcp",
                  "high_52w", "high_52w_raw", "pct_from_high",
                  "ret_5d", "ret_20d", "up_days_20", "down_days_20",
                  "up_avg_vol", "down_avg_vol", "ud_ratio",
                  "vol_today", "vol_10d_avg", "vol_3w_avg", "vol_ratio_stock_20d",
                  "vp_score_stock",
                  "trend_state", "trend_pattern", "trend_signal"):
            full_df[c] = None

    # (4c) 板塊內個股綜合分（sector-scorecard 同套公式：Point + vp_score + vol_ratio）
    full_df = add_sector_stock_composite_ranks(full_df)

    # (5) 盈餘動能篩選（只對預篩過的 subset）
    subset = full_df[full_df["symbol"].isin(pre_syms)].copy()
    filtered = apply_earnings_filter(subset)
    full_df["earnings_passed"] = full_df["symbol"].isin(filtered["symbol"])
    log(f"After earnings filter: {len(filtered)} tickers pass")

    # (6) 各時間尺度取 top 3 · 另加 CMS_A 冠軍榜 + 綜合分冠軍榜
    top3_4w = pick_top_n_per_sector(filtered, "cum_ret_4w")
    top3_13w = pick_top_n_per_sector(filtered, "cum_ret_13w")
    top3_26w = pick_top_n_per_sector(filtered, "cum_ret_26w")
    top3_cms_a = pick_top_n_per_sector(filtered, "cms_a", ascending=True)
    # 綜合分冠軍：composite_in_sector 越小越強 · 只從有 vp_score_stock 的 subset 選
    with_vp = filtered[filtered["vp_score_stock"].notna()].copy() if len(filtered) else filtered
    top3_composite = pick_top_n_per_sector(with_vp, "composite_in_sector", ascending=True) if len(with_vp) else pd.DataFrame()

    # (7) 存檔
    save_outputs(
        full_df.sort_values(["sector", "point"], ascending=[True, False]),
        top3_4w, top3_13w, top3_cms_a, top3_26w, top3_composite,
    )

    log(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
