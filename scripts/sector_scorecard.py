#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
11 類 Sector ETF 量價評分排行  scripts/sector_scorecard.py
=====================================================================
每個交易日跑一次（CI 排 UTC 週一~五 21:30 = ET 收盤後）：
  對 11 個 SPDR sector ETF：
    XLK 資訊科技 · XLE 能源 · XLF 金融 · XLV 醫療 · XLY 非必需消費
    XLP 必需消費 · XLI 工業 · XLU 公用事業 · XLB 材料 · XLRE 房地產 · XLC 通訊

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
as_of_date      | 資料基準日 = 抓到的最後一根 close 的日期（T-1）
t_price         | 基準日收盤價
p4w / p13w / p26w   | 4/13/26 週前的收盤
ret_4w / ret_13w / ret_26w  | 累積報酬 %

point           | Point = 4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）
point_rank      | 依 point 排名（1 = 最強）
cms_a           | CMS_A = 0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）
cms_a_rank      | 依 cms_a 排名（1 = 最強）
di              | 三週期正報酬指標 = ((4W>0)+(13W>0)+(26W>0))/3；1.0 = 三週期全漲

vol_10d_avg     | 近 10 日平均成交量
vol_today       | 基準日成交量
vol_3w_avg      | 近 15 交易日（≈3週）平均成交量
vol_ratio       | vol_today / vol_3w_avg（>1 = 當日爆量）
vol_rank        | 依 vol_ratio 排名（1 = 最強）
ret_5d / ret_20d    | 近 5/20 日累積報酬 %
up_days_20      | 近 20 日中收紅天數
down_days_20    | 近 20 日中收黑天數
up_avg_vol      | 收紅日平均成交量（= AD 上漲日均量）
down_avg_vol    | 收黑日平均成交量（= AC 下跌日均量）
vp_ratio        | 量價比 VP = up_avg_vol / down_avg_vol（>1 = 買盤積極）
ud_ratio        | 漲跌比 UD = up_days / down_days

vp_score        | 量價絕對評分 0~100 · 公式：
                | MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20 + VP×50×0.35
                |                    + UD×100×0.15 + 50))
                | 註：20d / 5d 用「小數報酬」（0.05 = 5%），非百分數
vp_score_rank   | 依 vp_score 排名（1 = 最強）

composite       | 綜合分 = Point_rank×0.40 + vp_score_rank×0.40 + vol_rank×0.20
                | 加權排名和（越小越強）
composite_rank  | 依 composite 排名（1 = 最強）

gap_alert       | 差距警示（Point_rank vs vp_score_rank 差 > 5）
                | "吃老本" = Point 前段但量價落後（漲多動能弱）
                | "剛爆發" = 量價前段但 Point 落後（剛起步）
                | null    = 無警示
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

# 差距警示閾值：Point_rank 跟 vp_score_rank 差超過這個名次 → 警示
GAP_ALERT_THRESHOLD = 5


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 1. 抓 yfinance 資料
# ============================================================
def fetch_data():
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("需要 yfinance：pip install yfinance")

    tickers = [s[0] for s in SECTORS]
    log(f"Fetching daily data for {len(tickers)} sector ETFs...")
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
    if isinstance(df_bulk.columns, pd.MultiIndex):
        if ticker not in df_bulk.columns.get_level_values(0):
            return None
        sub = df_bulk[ticker].copy()
    else:
        sub = df_bulk.copy()
    return sub.dropna(how="all")


# ============================================================
# 2. 逐 sector 算欄位（不含排名 / 綜合分 · 那些要跨 sector 才能算）
# ============================================================
def compute_metrics(ticker, name_zh, name_en, daily_bulk, weekly_bulk):
    dly = extract_ohlcv(daily_bulk, ticker)
    wky = extract_ohlcv(weekly_bulk, ticker)
    if dly is None or wky is None or len(dly) < 25 or len(wky) < 27:
        log(f"  ⚠ {ticker} 資料不足 · skip")
        return None

    close_d = dly["Close"].dropna()
    vol_d = dly["Volume"].dropna()
    close_w = wky["Close"].dropna()

    # T-1 基準：使用「最後一根 close」的日期，非 today
    as_of = close_d.index[-1].strftime("%Y-%m-%d")
    t_price = float(close_d.iloc[-1])

    # 4/13/26 週前收盤（週線倒數第 5/14/27 根）
    p4w = float(close_w.iloc[-5])
    p13w = float(close_w.iloc[-14])
    p26w = float(close_w.iloc[-27])
    ret_4w = (t_price / p4w - 1) * 100
    ret_13w = (t_price / p13w - 1) * 100
    ret_26w = (t_price / p26w - 1) * 100

    # Point = 4W%×0.25 + 13W%×0.25 + 26W%×0.50（26W 佔一半，重中長期）
    point = ret_4w * 0.25 + ret_13w * 0.25 + ret_26w * 0.50

    # di：三週期是否全漲，每個 1/3
    di = ((1 if ret_4w > 0 else 0) + (1 if ret_13w > 0 else 0) + (1 if ret_26w > 0 else 0)) / 3.0

    # 成交量
    vol_today = int(vol_d.iloc[-1])
    vol_10d_avg = float(vol_d.iloc[-10:].mean())
    vol_3w_avg = float(vol_d.iloc[-15:].mean())
    vol_ratio = vol_today / vol_3w_avg if vol_3w_avg > 0 else 0.0

    # 5/20 日報酬
    ret_5d = (close_d.iloc[-1] / close_d.iloc[-6] - 1) * 100 if len(close_d) >= 6 else None
    ret_20d = (close_d.iloc[-1] / close_d.iloc[-21] - 1) * 100 if len(close_d) >= 21 else None

    # 近 20 日上漲下跌天數 + 上下漲日均量
    last21 = dly.tail(21)  # 21 根算 20 個 diff
    diffs = last21["Close"].diff().dropna()
    ups = diffs > 0
    downs = diffs < 0
    up_days_20 = int(ups.sum())
    down_days_20 = int(downs.sum())
    vols20 = last21["Volume"].iloc[1:]
    up_avg_vol = float(vols20[ups.values].mean()) if ups.any() else 0.0
    down_avg_vol = float(vols20[downs.values].mean()) if downs.any() else 0.0

    vp_ratio = (up_avg_vol / down_avg_vol) if down_avg_vol > 0 else None
    ud_ratio = (up_days_20 / down_days_20) if down_days_20 > 0 else None

    # 量價絕對評分 (0~100)
    vp_score = compute_vp_score(ret_20d, ret_5d, vp_ratio, ud_ratio)

    return {
        "sector": ticker,
        "sector_name": name_zh,
        "sector_name_en": name_en,
        "as_of_date": as_of,
        "t_price": round(t_price, 2),
        "p4w": round(p4w, 2),
        "p13w": round(p13w, 2),
        "p26w": round(p26w, 2),
        "ret_4w": round(ret_4w, 2),
        "ret_13w": round(ret_13w, 2),
        "ret_26w": round(ret_26w, 2),
        "point": round(point, 2),
        "di": round(di, 3),
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
        "vp_score": round(vp_score, 2) if vp_score is not None else None,
    }


def compute_vp_score(ret_20d_pct, ret_5d_pct, vp, ud):
    """
    量價絕對評分（0-100）· 用使用者規格：
      MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20
                        + VP×50×0.35 + UD×100×0.15 + 50))
    注意：20d / 5d 用「小數報酬」（0.05 = 5%），非百分數
    """
    if any(v is None for v in (ret_20d_pct, ret_5d_pct, vp, ud)):
        return None
    r20 = ret_20d_pct / 100.0  # 轉小數
    r5 = ret_5d_pct / 100.0
    raw = (
        r20 * 200 * 0.30
        + r5 * 200 * 0.20
        + vp * 50 * 0.35
        + ud * 100 * 0.15
        + 50
    )
    return max(0.0, min(100.0, raw))


# ============================================================
# 3. 跨 sector 排名 + 綜合分 + 差距警示
# ============================================================
def add_ranks_and_composite(df):
    """
    加入所有 rank 欄位、綜合分、差距警示。
    """
    # 個別 rank（1 = 最強）
    df["ret_4w_rank"] = df["ret_4w"].rank(method="min", ascending=False).astype(int)
    df["ret_13w_rank"] = df["ret_13w"].rank(method="min", ascending=False).astype(int)
    df["ret_26w_rank"] = df["ret_26w"].rank(method="min", ascending=False).astype(int)

    df["point_rank"] = df["point"].rank(method="min", ascending=False).astype(int)
    df["vol_rank"] = df["vol_ratio"].rank(method="min", ascending=False).astype(int)
    df["vp_score_rank"] = df["vp_score"].rank(method="min", ascending=False, na_option="bottom").astype(int)

    # CMS_A = 0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）
    df["cms_a"] = (
        df["ret_4w_rank"] * 0.5
        + df["ret_13w_rank"] * 0.3
        + df["ret_26w_rank"] * 0.2
    ).round(2)
    df["cms_a_rank"] = df["cms_a"].rank(method="min", ascending=True).astype(int)

    # 綜合分 = Point_rank×0.4 + vp_score_rank×0.4 + vol_rank×0.2（越小越強）
    df["composite"] = (
        df["point_rank"] * 0.40
        + df["vp_score_rank"] * 0.40
        + df["vol_rank"] * 0.20
    ).round(2)
    df["composite_rank"] = df["composite"].rank(method="min", ascending=True).astype(int)

    # 差距警示：Point_rank vs vp_score_rank 差 > 5
    def alert(row):
        pr, vr = row["point_rank"], row["vp_score_rank"]
        if abs(pr - vr) <= GAP_ALERT_THRESHOLD:
            return None
        if pr < vr:  # point 排名靠前（強）· 但 vp 排名靠後（弱）
            return "吃老本"  # 漲多但動能弱
        else:
            return "剛爆發"  # 量價強但漲幅還沒跟上
    df["gap_alert"] = df.apply(alert, axis=1)

    return df.sort_values("composite_rank").reset_index(drop=True)


# ============================================================
# 4. 輸出
# ============================================================
def save_outputs(df):
    os.makedirs(OUTDIR, exist_ok=True)
    # 檔名用 as_of_date（不是 today）· T-1 基準
    as_of = df["as_of_date"].iloc[0] if len(df) else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")
    csv_path = os.path.join(OUTDIR, f"{stamp}_scorecard.csv")
    df.to_csv(csv_path, index=False)
    log(f"  saved {csv_path}")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "基準日 = 抓到的最後一根 close 的日期（T-1）· 非腳本執行當日",
        "sector_count": int(len(df)),
        "csv": os.path.basename(csv_path),
        "formulas": {
            "point": "4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）",
            "cms_a": "0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）",
            "di": "((4W>0)+(13W>0)+(26W>0))/3；1.0 = 三週期全漲",
            "vp_score": "MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20 + VP×50×0.35 + UD×100×0.15 + 50))",
            "composite": "Point_rank×0.40 + vp_score_rank×0.40 + vol_rank×0.20（越小越強）",
            "gap_alert": f"|Point_rank - vp_score_rank| > {GAP_ALERT_THRESHOLD} → 吃老本(漲多動能弱) / 剛爆發(量價強漲幅追不上)",
        },
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
        r = compute_metrics(ticker, name_zh, name_en, daily, weekly)
        if r:
            rows.append(r)

    if not rows:
        sys.exit("❌ 沒抓到任何 sector 資料")

    df = pd.DataFrame(rows)
    df = add_ranks_and_composite(df)

    as_of = df["as_of_date"].iloc[0]
    log("=" * 78)
    log(f"11 Sector ETF Scorecard · as of {as_of}")
    log("=" * 78)
    for _, r in df.iterrows():
        alert = f"⚠ {r['gap_alert']}" if r["gap_alert"] else ""
        log(
            f"  #{r['composite_rank']:2d} {r['sector']:4s} {r['sector_name']:6s} "
            f"pt={r['point']:6.2f} (rk{r['point_rank']:2d})  "
            f"vp={r['vp_score']:5.1f} (rk{r['vp_score_rank']:2d})  "
            f"vol_ratio={r['vol_ratio']:.2f}x (rk{r['vol_rank']:2d})  "
            f"CMS_A={r['cms_a']:5.2f}  di={r['di']:.2f}  {alert}"
        )

    save_outputs(df)


if __name__ == "__main__":
    main()
