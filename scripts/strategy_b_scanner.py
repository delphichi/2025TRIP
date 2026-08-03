#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
策略 B · 逢低買入掃描器  scripts/strategy_b_scanner.py
=====================================================================
「別人恐懼時我貪婪」· 掃全 S&P 500 找符合逢低買入 4 條件的個股：

  條件一：當日跌幅 > 5%
  條件二：50MA 向上 AND 200MA 向上（兩個都要 TRUE）
  條件三：RSI(14) < 40  超賣
  條件四：昨日量 > 20d 均量 × 20%（有資金在低點承接）

用意：
  好公司（趨勢向上）+ 被市場恐懌錯殺 + 量能確認 → 逢低買入機會

輸出：
  data/sector_rotation/{as_of}_strategy_b.csv     全掃描明細 (通過 4 條件的)
  data/sector_rotation/strategy_b_latest.json     前端讀

執行時機：
  和 stage 2 同一個 CI gate（週五 + 手動觸發）· 資料獨立 · 無依賴
  · 未來若想日跑，改成 stage 1 一起排即可
"""
import os
import sys
import json
import math
from datetime import datetime, date, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO

import pandas as pd
import requests


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
STRATEGY_B_PATH = os.path.join(OUTDIR, "strategy_b_latest.json")

YF_BATCH = 80

# 掃描條件參數（策略 B 規格）
DAILY_DROP_THRESHOLD = -5.0   # 當日跌幅 < -5%（負值 · 更 -5 才算）
RSI_PERIOD = 14
RSI_OVERSOLD = 40.0           # RSI < 40 · 超賣
VOL_RATIO_MIN = 1.20          # 昨日量 > 20d avg × 1.2
MA_LOOKBACK = 6               # MA 向上判定：今日 MA > N 天前 MA (N=5 表示過去 1 週)


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 1. S&P 500 constituents (重用 screener 的邏輯 · 但走本地 copy 避免 side effect)
# ============================================================
def fetch_sp500_constituents():
    log("Fetching S&P 500 constituents from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0 (strategy-b-scanner)"}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    tables = pd.read_html(StringIO(r.text))
    df = tables[0]
    col_sym = next(c for c in df.columns if "symbol" in c.lower())
    col_sec = next(c for c in df.columns if "sector" in c.lower())
    col_nm = next(c for c in df.columns if "security" in c.lower())
    out = df[[col_sym, col_sec, col_nm]].copy()
    out.columns = ["symbol", "sector", "name"]
    out["symbol"] = out["symbol"].str.replace(".", "-", regex=False)
    log(f"  → {len(out)} tickers")
    return out


# ============================================================
# 2. Fetch 1y daily OHLCV for all tickers
# ============================================================
def fetch_all_daily(tickers):
    """
    抓 1 年 daily OHLCV · 全 500 檔（策略 B 需 200MA · 需 1 年）
    500 檔 / 80 batch = ~7 批 · 每批 ~5s = ~35s
    """
    import yfinance as yf
    log(f"Downloading 1y daily OHLCV for {len(tickers)} tickers (S&P 500 full universe)...")
    out = {}
    today_utc = datetime.now(timezone.utc).date()
    for i in range(0, len(tickers), YF_BATCH):
        chunk = tickers[i : i + YF_BATCH]
        data = yf.download(
            chunk, period="1y", interval="1d",
            auto_adjust=True, progress=False, threads=True, group_by="ticker",
        )
        if isinstance(data.columns, pd.MultiIndex):
            for t in chunk:
                if t in data.columns.get_level_values(0):
                    sub = data[t].dropna(how="all")
                    sub = sub.loc[pd.to_datetime(sub.index).date < today_utc]
                    out[t] = sub
        else:
            sub = data.dropna(how="all")
            sub = sub.loc[pd.to_datetime(sub.index).date < today_utc]
            out[chunk[0]] = sub
        if (i // YF_BATCH + 1) % 3 == 0:
            log(f"  progress: {min(i + YF_BATCH, len(tickers))}/{len(tickers)}")
    log(f"  → daily fetched for {len(out)} tickers")
    return out


# ============================================================
# 3. 條件判斷 · scan_symbol
# ============================================================
def _compute_rsi_wilder(close, period=14):
    """
    Wilder RSI · 用 SMA 的簡化版本（前 period 天用 SMA，之後用 recursive）
    足夠精度給訊號判斷
    """
    if len(close) < period + 1:
        return None
    delta = close.diff().dropna()
    gains = delta.clip(lower=0)
    losses = -delta.clip(upper=0)
    avg_gain = gains.rolling(window=period).mean()
    avg_loss = losses.rolling(window=period).mean()
    # 最後一根的 RS
    ag = avg_gain.iloc[-1]
    al = avg_loss.iloc[-1]
    if al == 0:
        return 100.0
    rs = ag / al
    return 100.0 - (100.0 / (1.0 + rs))


def _ma_uptrend(close, window):
    """
    MA 向上判定：今日 MA > MA_LOOKBACK 天前的 MA
    需要 window + MA_LOOKBACK 天數據
    """
    if len(close) < window + MA_LOOKBACK:
        return False
    ma_series = close.rolling(window=window).mean()
    return bool(ma_series.iloc[-1] > ma_series.iloc[-1 - MA_LOOKBACK])


def scan_symbol(sym, sub, sector, name):
    """
    對單一 ticker 檢查逢低買入 4 條件
    回傳 dict（通過）或 None（未通過）· 通過的順帶記錄 fail_reason 給 debug 用
    """
    if sub is None or len(sub) < 205:
        return None
    close = sub["Close"].dropna()
    vol = sub["Volume"].dropna()
    if len(close) < 205:
        return None

    # 條件一：當日跌幅 > 5%
    if len(close) < 2:
        return None
    t_price = float(close.iloc[-1])
    prev_price = float(close.iloc[-2])
    daily_ret = (t_price / prev_price - 1) * 100
    if daily_ret > DAILY_DROP_THRESHOLD:
        return None

    # 條件二：50MA + 200MA 都向上
    ma50_up = _ma_uptrend(close, 50)
    ma200_up = _ma_uptrend(close, 200)
    if not (ma50_up and ma200_up):
        return None

    # 條件三：RSI(14) < 40
    rsi = _compute_rsi_wilder(close, RSI_PERIOD)
    if rsi is None or rsi >= RSI_OVERSOLD:
        return None

    # 條件四：昨日量 > 20d 均量 × 1.2
    vol_today = float(vol.iloc[-1])
    vol_20d_avg = float(vol.iloc[-21:-1].mean()) if len(vol) >= 21 else 0.0
    vol_ratio = vol_today / vol_20d_avg if vol_20d_avg > 0 else 0.0
    if vol_ratio < VOL_RATIO_MIN:
        return None

    # 全通過 · 記所有指標讓前端展示判讀
    ma50 = float(close.iloc[-50:].mean())
    ma200 = float(close.iloc[-200:].mean())
    return {
        "symbol": sym,
        "name": name,
        "sector": sector,
        "as_of_date": close.index[-1].strftime("%Y-%m-%d"),
        "t_price": round(t_price, 2),
        "prev_price": round(prev_price, 2),
        "daily_drop_pct": round(daily_ret, 2),
        "ma50": round(ma50, 2),
        "ma200": round(ma200, 2),
        "ma50_up": True,
        "ma200_up": True,
        "rsi_14": round(rsi, 1),
        "vol_today": int(vol_today),
        "vol_20d_avg": int(vol_20d_avg),
        "vol_ratio_vs_20d": round(vol_ratio, 2),
    }


# ============================================================
# 4. main
# ============================================================
def main():
    universe = fetch_sp500_constituents()
    daily_data = fetch_all_daily(universe["symbol"].tolist())

    log("=" * 60)
    log("Scanning strategy B conditions (dip buy) on full S&P 500...")
    log("=" * 60)

    hits = []
    # 準備 sector / name 對照
    sym_to_meta = universe.set_index("symbol")[["sector", "name"]].to_dict("index")

    for sym in universe["symbol"]:
        meta = sym_to_meta.get(sym) or {}
        result = scan_symbol(sym, daily_data.get(sym),
                              meta.get("sector"), meta.get("name"))
        if result:
            hits.append(result)

    # 排序：RSI 由低到高（越超賣越前面）
    hits.sort(key=lambda h: h["rsi_14"])

    as_of = hits[0]["as_of_date"] if hits else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")

    os.makedirs(OUTDIR, exist_ok=True)

    # CSV
    csv_path = os.path.join(OUTDIR, f"{stamp}_strategy_b.csv")
    if hits:
        pd.DataFrame(hits).to_csv(csv_path, index=False)
        log(f"  saved {csv_path} ({len(hits)} hits)")
    else:
        log(f"  no hits · skip csv")

    # JSON manifest
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "T-1 · 抓到的最後一根 close 的日期（非腳本執行當日）",
        "scanned_count": int(len(universe)),
        "hits_count": int(len(hits)),
        "conditions": {
            "daily_drop_pct": f"< {DAILY_DROP_THRESHOLD}% （當日跌 > 5%）",
            "ma50_up": f"50MA 向上（今日 MA > {MA_LOOKBACK} 天前 MA）",
            "ma200_up": f"200MA 向上（今日 MA > {MA_LOOKBACK} 天前 MA）",
            "rsi_14": f"< {RSI_OVERSOLD} · 超賣",
            "vol_ratio_vs_20d": f"> {VOL_RATIO_MIN}x · 昨日量 > 20d 均量 20%",
        },
        "notes": [
            "「別人恐懼時我貪婪」· 好公司（趨勢向上）+ 被恐慌錯殺 + 量能確認",
            "不是進場當天立刻買 · 建議等大跌後量縮 · 量縮後放量再進場（策略 B 進場時機）",
            "trigger 訊號 · 不代表 all-in · 位置管理仍需搭配策略 A 的配置上限",
        ],
        "hits": hits,
        "csv": os.path.basename(csv_path) if hits else None,
    }
    with open(STRATEGY_B_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(out), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved {STRATEGY_B_PATH}")

    log("=" * 60)
    log(f"策略 B 掃描結果 · as of {as_of} · {len(hits)} 檔通過 4 條件")
    log("=" * 60)
    for h in hits[:20]:
        log(f"  {h['symbol']:6s} {h['sector'][:20]:20s} "
            f"跌 {h['daily_drop_pct']:6.2f}%  RSI {h['rsi_14']:5.1f}  "
            f"量比 {h['vol_ratio_vs_20d']:.2f}x  50MA↑ 200MA↑")
    if len(hits) > 20:
        log(f"  ... 另 {len(hits) - 20} 檔")


if __name__ == "__main__":
    main()
