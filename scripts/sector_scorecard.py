#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
11 類 Sector ETF 量價評分排行  scripts/sector_scorecard.py
=====================================================================
每個交易日跑一次（CI 排 UTC 週一~五 21:30 = ET 收盤後）：
  對 11 個 SPDR sector ETF：
    XLK 資訊科技 · XLE 能源 · XLF 金融 · XLV 醫療 · XLY 非必需消費
    XLP 必需消費 · XLI 工業 · XLU 公用事業 · XLB 材料 · XLRE 房地產 · XLC 通訊
  計算 22 個欄位（見 SCHEMA 註解），存 CSV + JSON manifest 給瀏覽器讀。

資料源：yfinance（週線 + 日線）· 完全免 key
輸出：
  data/sector_rotation/{YYYYMMDD}_scorecard.csv
  data/sector_rotation/scorecard_latest.json      manifest（瀏覽器讀）

手動跑：
  python scripts/sector_scorecard.py

=================================================================
SCHEMA · 每欄意義
-----------------------------------------------------------------
sector          | XLK / XLE / ... (ETF ticker)
sector_name     | 資訊科技 / 能源 / ...
t_price         | 當前收盤價
p4w / p13w / p26w   | 4/13/26 週前的收盤（作為對照基準）
ret_4w / ret_13w / ret_26w  | 累積報酬 %
price_point     | 4W*3 + 13W*2 + 26W*1 加權和（短線權重高）
price_rank      | 11 個 sector 依 price_point 由高到低排名
vol_10d_avg     | 近 10 日平均成交量
vol_today       | 當日成交量
vol_3w_avg      | 近 15 交易日（≈3週）平均成交量
vol_ratio       | vol_today / vol_3w_avg
vol_rank        | 11 個 sector 依 vol_ratio 排名
ret_5d / ret_20d    | 近 5/20 日累積報酬 %
up_days_20      | 近 20 日中收紅天數
down_days_20    | 近 20 日中收黑天數
up_avg_vol      | 收紅日平均成交量
down_avg_vol    | 收黑日平均成交量
vp_ratio        | 量價比 = up_avg_vol / down_avg_vol（>1 = 買盤積極）
ud_ratio        | 漲跌比 = up_days / down_days
score           | 量價綜合評分（見 compute_score 註解）
score_rank      | 11 個 sector 綜合評分排名
"""
import os
import sys
import json
from datetime import datetime, date, timezone

import pandas as pd

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "scorecard_latest.json")

# SPDR sector ETF 11 檔
SECTORS = [
    ("XLK", "資訊科技",      "Information Technology"),
    ("XLE", "能源",          "Energy"),
    ("XLF", "金融",          "Financials"),
    ("XLV", "醫療保健",      "Health Care"),
    ("XLY", "非必需消費",    "Consumer Discretionary"),
    ("XLP", "必需消費",      "Consumer Staples"),
    ("XLI", "工業",          "Industrials"),
    ("XLU", "公用事業",      "Utilities"),
    ("XLB", "材料",          "Materials"),
    ("XLRE", "房地產",       "Real Estate"),
    ("XLC", "通訊服務",      "Communication Services"),
]


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 1. 抓 yfinance 資料（日線 + 週線）
# ============================================================
def fetch_data():
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("需要 yfinance：pip install yfinance")

    tickers = [s[0] for s in SECTORS]
    log(f"Fetching daily data for {len(tickers)} sector ETFs...")
    # 抓 8 個月日線 · 足夠算 26 週 + 20 日窗口
    daily = yf.download(
        tickers, period="9mo", interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    log(f"Fetching weekly data for {len(tickers)} sector ETFs...")
    weekly = yf.download(
        tickers, period="9mo", interval="1wk",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    return daily, weekly


def extract_ohlcv(df_bulk, ticker):
    """從 yf.download group_by='ticker' 的多層欄位取出單一 ticker 的 OHLCV"""
    if isinstance(df_bulk.columns, pd.MultiIndex):
        if ticker not in df_bulk.columns.get_level_values(0):
            return None
        sub = df_bulk[ticker].copy()
    else:
        sub = df_bulk.copy()
    sub = sub.dropna(how="all")
    return sub


# ============================================================
# 2. 逐 sector 計算欄位
# ============================================================
def compute_row(ticker, name_zh, name_en, daily_bulk, weekly_bulk):
    dly = extract_ohlcv(daily_bulk, ticker)
    wky = extract_ohlcv(weekly_bulk, ticker)
    if dly is None or wky is None or len(dly) < 25 or len(wky) < 27:
        log(f"  ⚠ {ticker} 資料不足 · skip")
        return None

    close_d = dly["Close"].dropna()
    vol_d = dly["Volume"].dropna()
    close_w = wky["Close"].dropna()

    t_price = float(close_d.iloc[-1])

    # 4/13/26 週前價格 · 用週線倒數第 5/14/27 根
    p4w = float(close_w.iloc[-5])
    p13w = float(close_w.iloc[-14])
    p26w = float(close_w.iloc[-27])
    ret_4w = (t_price / p4w - 1) * 100
    ret_13w = (t_price / p13w - 1) * 100
    ret_26w = (t_price / p26w - 1) * 100

    # 價格 point：4W*3 + 13W*2 + 26W*1（短線權重高）
    price_point = ret_4w * 3 + ret_13w * 2 + ret_26w * 1

    # 成交量
    vol_today = int(vol_d.iloc[-1])
    vol_10d_avg = float(vol_d.iloc[-10:].mean())
    vol_3w_avg = float(vol_d.iloc[-15:].mean())  # ≈ 3 週 = 15 交易日
    vol_ratio = vol_today / vol_3w_avg if vol_3w_avg > 0 else 0.0

    # 5/20 日報酬
    ret_5d = (close_d.iloc[-1] / close_d.iloc[-6] - 1) * 100 if len(close_d) >= 6 else None
    ret_20d = (close_d.iloc[-1] / close_d.iloc[-21] - 1) * 100 if len(close_d) >= 21 else None

    # 近 20 日上漲下跌天數 + 上下漲日均量
    last20 = dly.tail(21)  # 21 根算 20 個 diff
    diffs = last20["Close"].diff().dropna()
    ups = diffs > 0
    downs = diffs < 0
    up_days_20 = int(ups.sum())
    down_days_20 = int(downs.sum())
    # 對應天的成交量（去掉最舊 1 根，因為 diff 掉了）
    vols20 = last20["Volume"].iloc[1:]
    up_avg_vol = float(vols20[ups.values].mean()) if ups.any() else 0.0
    down_avg_vol = float(vols20[downs.values].mean()) if downs.any() else 0.0

    vp_ratio = (up_avg_vol / down_avg_vol) if down_avg_vol > 0 else None
    ud_ratio = (up_days_20 / down_days_20) if down_days_20 > 0 else None

    return {
        "sector": ticker,
        "sector_name": name_zh,
        "sector_name_en": name_en,
        "t_price": round(t_price, 2),
        "p4w": round(p4w, 2),
        "p13w": round(p13w, 2),
        "p26w": round(p26w, 2),
        "ret_4w": round(ret_4w, 2),
        "ret_13w": round(ret_13w, 2),
        "ret_26w": round(ret_26w, 2),
        "price_point": round(price_point, 2),
        "vol_10d_avg": int(vol_10d_avg),
        "vol_today": vol_today,
        "vol_3w_avg": int(vol_3w_avg),
        "vol_ratio": round(vol_ratio, 3),
        "ret_5d": round(ret_5d, 2) if ret_5d is not None else None,
        "ret_20d": round(ret_20d, 2) if ret_20d is not None else None,
        "up_days_20": up_days_20,
        "down_days_20": down_days_20,
        "up_avg_vol": int(up_avg_vol),
        "down_avg_vol": int(down_avg_vol),
        "vp_ratio": round(vp_ratio, 3) if vp_ratio is not None else None,
        "ud_ratio": round(ud_ratio, 3) if ud_ratio is not None else None,
    }


# ============================================================
# 3. 綜合評分 + 排名
# ============================================================
def compute_score(df):
    """
    量價綜合評分（0~100）：
      40% × price_point normalized rank
      20% × vol_ratio normalized rank
      20% × vp_ratio normalized rank
      20% × ud_ratio normalized rank
    normalized rank = (排名倒序) / (n-1) × 100
    """
    def norm_rank(col):
        s = df[col].fillna(-999999)
        ranks = s.rank(method="min", ascending=True)  # 最小=1
        n = len(df)
        return (ranks - 1) / max(n - 1, 1) * 100

    df["_pp_r"] = norm_rank("price_point")
    df["_vr_r"] = norm_rank("vol_ratio")
    df["_vp_r"] = norm_rank("vp_ratio")
    df["_ud_r"] = norm_rank("ud_ratio")

    df["score"] = (
        0.4 * df["_pp_r"]
        + 0.2 * df["_vr_r"]
        + 0.2 * df["_vp_r"]
        + 0.2 * df["_ud_r"]
    ).round(2)

    df["price_rank"] = df["price_point"].rank(method="min", ascending=False).astype(int)
    df["vol_rank"] = df["vol_ratio"].rank(method="min", ascending=False).astype(int)
    df["score_rank"] = df["score"].rank(method="min", ascending=False).astype(int)

    df.drop(columns=["_pp_r", "_vr_r", "_vp_r", "_ud_r"], inplace=True)
    return df.sort_values("score", ascending=False).reset_index(drop=True)


# ============================================================
# 4. 輸出
# ============================================================
def save_outputs(df):
    os.makedirs(OUTDIR, exist_ok=True)
    stamp = date.today().strftime("%Y%m%d")
    csv_path = os.path.join(OUTDIR, f"{stamp}_scorecard.csv")
    df.to_csv(csv_path, index=False)
    log(f"  saved {csv_path}")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": stamp,
        "sector_count": int(len(df)),
        "csv": os.path.basename(csv_path),
        "scoring_weights": {
            "price_point": 0.4,
            "vol_ratio": 0.2,
            "vp_ratio": 0.2,
            "ud_ratio": 0.2,
        },
        "price_point_weights": {"4w": 3, "13w": 2, "26w": 1},
        "rows": df.where(pd.notna(df), None).to_dict(orient="records"),
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log(f"  saved manifest {MANIFEST_PATH}")


# ============================================================
# 5. main
# ============================================================
def main():
    daily, weekly = fetch_data()

    rows = []
    for ticker, name_zh, name_en in SECTORS:
        r = compute_row(ticker, name_zh, name_en, daily, weekly)
        if r:
            rows.append(r)

    if not rows:
        sys.exit("❌ 沒抓到任何 sector 資料")

    df = pd.DataFrame(rows)
    df = compute_score(df)

    log("=" * 60)
    log(f"Top ranked sectors as of {date.today()}:")
    log("=" * 60)
    for _, r in df.iterrows():
        log(
            f"  #{r['score_rank']:2d} {r['sector']:4s} {r['sector_name']:6s}  "
            f"score={r['score']:5.1f}  price_rank={r['price_rank']:2d}  "
            f"4W={r['ret_4w']:+6.2f}%  vol_ratio={r['vol_ratio']:.2f}x  "
            f"VP={r['vp_ratio']}"
        )

    save_outputs(df)


if __name__ == "__main__":
    main()
