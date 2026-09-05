#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Theme ETF 量價評分（V2 Theme 層 · ETF Proxy）  scripts/theme_scorecard.py
=====================================================================
Sector → Theme → Stock 三層架構裡的 Theme 層，用「輕量 ETF Proxy」做法：
不建人工個股↔主題對照表（那需要人工/半人工分類資料，跟台股版
industry_mapping.csv 是完全不同量級的工程），改成直接挑幾檔市場上
流動性夠、認知度高的產業/主題 ETF（SMH 半導體、IGV 軟體...），對它們
套用跟 sector_scorecard.py 一模一樣的量價評分方法論（Point/CMS_A/
vp_score/composite/quadrant），Theme 強弱直接讀 ETF 自己的價量，不需要
先有個股對照表。

跟 sector_scorecard.py 的關係：
  · 重用（不重寫）：_yf_window / _drop_today_bar / _cutoff_date /
    extract_ohlcv / compute_metrics / add_ranks_and_composite /
    QUADRANT_MAP / _json_safe / GAP_ALERT_THRESHOLD —— 這些函式本來就是
    對「任一檔 ETF」算量價分數，不是寫死綁 11 個 GICS sector。
  · 不重用（沒有意義）：add_sector_breadth / add_30d_signal_breadth /
    add_historical_percentiles / add_sector_health_tag —— 這些要嘛需要
    「個股 sector 欄位對照到這檔 ETF」的股票池（Theme ETF 沒有這種
    對照表，跟 Sector 不一樣），要嘛需要長期歷史百分位（Theme 才剛開始
    收資料，還沒有）。所以 Theme scorecard 只有 Point/CMS_A/vp_score/
    composite/quadrant，沒有 breadth_pct / health_key ——這是「輕量」
    這兩個字的具體意思，不是漏做。
  · 輸出檔完全獨立（{stamp}_theme_scorecard.csv / theme_scorecard_
    latest.json），不會混進 sector 的 {stamp}_scorecard.csv，兩邊各自
    的 acceleration/quadrant 歷史回溯（讀最近 N 天同類檔案算 5 日均) 才
    不會互相污染。

資料源：yfinance（日線）· 完全免 key
輸出：
  data/sector_rotation/{YYYYMMDD}_theme_scorecard.csv
  data/sector_rotation/theme_scorecard_latest.json

手動跑：
  python scripts/theme_scorecard.py
"""
import glob
import os
import sys
import json
import argparse
from datetime import datetime, date, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sector_scorecard as sc  # noqa: E402  重用量價評分方法論，不重寫

# ============================================================
# Theme ETF 清單（ETF Proxy 起手清單，使用者確認過）
# ============================================================
THEMES = [
    ("SMH", "半導體", "Semiconductors"),
    ("IGV", "軟體", "Software"),
    ("CIBR", "網路資安", "Cybersecurity"),
    ("XBI", "生技", "Biotech"),
    ("ITA", "國防航太", "Aerospace & Defense"),
    ("XOP", "油氣探勘生產", "Oil & Gas Exploration & Production"),
    ("KRE", "區域銀行", "Regional Banks"),
    ("JETS", "航空", "Airlines"),
]

OUTDIR = sc.OUTDIR  # "data/sector_rotation" · 跟 sector scorecard 同一個資料夾，不同檔名前綴
THEME_MANIFEST_PATH = os.path.join(OUTDIR, "theme_scorecard_latest.json")
THEME_FILE_SUFFIX = "_theme_scorecard.csv"  # 跟 sector 的 "_scorecard.csv" 區分，避免歷史 glob 混到


def log(msg):
    sc.log(msg)


# ============================================================
# 1. 抓 yfinance 資料（沿用 sector_scorecard 的視窗/T-1 保護邏輯）
# ============================================================
def fetch_theme_data(tickers):
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("需要 yfinance：pip install yfinance")

    log(f"Fetching daily data for {len(tickers)} theme ETFs...")
    daily = yf.download(
        tickers, interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
        **sc._yf_window(10),
    )
    daily = sc._drop_today_bar(daily, "theme-daily")
    return daily


# ============================================================
# 2. Acceleration + Quadrant（跟 sector 版邏輯一致，但歷史只讀
#    *_theme_scorecard.csv，不會讀到 sector 的歷史檔）
# ============================================================
def add_theme_acceleration_and_quadrant(df, as_of):
    stamp_today = as_of.replace("-", "")
    files = sorted(glob.glob(os.path.join(OUTDIR, f"*{THEME_FILE_SUFFIX}")))
    files = [f for f in files if stamp_today not in os.path.basename(f)]
    recent = files[-sc.ACCEL_LOOKBACK_DAYS:]

    if not recent:
        df["point_5d_avg"] = None
        df["acceleration"] = None
        df["quadrant"] = None
        df["quadrant_zh"] = None
        df["quadrant_desc"] = None
        return df, None

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
        df["quadrant"] = None
        df["quadrant_zh"] = None
        df["quadrant_desc"] = None
        return df, None

    hist = pd.concat(hist_frames, ignore_index=True)
    avg_by_theme = hist.groupby("sector")["point"].mean().to_dict()

    df = df.copy()
    df["point_5d_avg"] = df["sector"].map(avg_by_theme).round(2)
    df["acceleration"] = (df["point"] - df["point_5d_avg"]).round(2)

    point_median = float(df["point"].median())

    def classify(row):
        pt = row["point"]
        acc = row["acceleration"]
        if pd.isna(acc):
            return {"key": None, "zh": None, "desc": None}
        h_l = "high" if pt >= point_median else "low"
        u_d = "up" if acc > 0 else "down"
        return sc.QUADRANT_MAP[(h_l, u_d)]

    quad = df.apply(classify, axis=1)
    df["quadrant"] = quad.apply(lambda x: x["key"])
    df["quadrant_zh"] = quad.apply(lambda x: x["zh"])
    df["quadrant_desc"] = quad.apply(lambda x: x["desc"])

    biggest = None
    valid = df[df["acceleration"].notna()].copy()
    if len(valid):
        idx = valid["acceleration"].abs().idxmax()
        row = valid.loc[idx]
        biggest = {
            "sector": row["sector"], "sector_name": row["sector_name"],
            "point": float(row["point"]), "point_5d_avg": float(row["point_5d_avg"]),
            "acceleration": float(row["acceleration"]),
            "quadrant": row["quadrant"], "quadrant_zh": row["quadrant_zh"],
        }
    return df, biggest


# ============================================================
# 3. 輸出
# ============================================================
def save_theme_outputs(df, biggest_mover=None):
    os.makedirs(OUTDIR, exist_ok=True)
    as_of = df["as_of_date"].iloc[0] if len(df) else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")
    csv_path = os.path.join(OUTDIR, f"{stamp}{THEME_FILE_SUFFIX}")
    df.to_csv(csv_path, index=False)
    log(f"  saved {csv_path}")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "基準日 = 該日最後一根 daily close 的實際日期（T-1）",
        "theme_count": int(len(df)),
        "csv": os.path.basename(csv_path),
        "quadrant_biggest_mover": biggest_mover,
        "quadrant_note": f"acceleration = 今日 point - 過去 {sc.ACCEL_LOOKBACK_DAYS} 天 point 平均 · 象限用 point 中位數 + acceleration 正負分四格",
        "scope_note": ("Theme 層是輕量 ETF Proxy：只有 Point/CMS_A/vp_score/composite/quadrant，"
                        "沒有 breadth_pct（沒有個股↔主題對照表可以算）也沒有歷史百分位（歷史還在累積），"
                        "跟 11 個 GICS sector 的完整 scorecard 不是同一個資料完整度。"),
        "formulas": {
            "point": "4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）",
            "cms_a": "0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）",
            "vp_score": "MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20 + VP×50×0.35 + UD×100×0.15 + 50))",
            "composite": "Point_rank×0.40 + vp_score_rank×0.40 + vol_rank×0.20（越小越強）",
        },
        "rows": df.where(pd.notna(df), None).to_dict(orient="records"),
    }
    with open(THEME_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(sc._json_safe(manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved manifest {THEME_MANIFEST_PATH}")


# ============================================================
# 4. main
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="Theme ETF 量價評分（ETF Proxy）")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · 用 YYYY-MM-DD 前一天的 close 為基準（不填 = 用最新）")
    args = parser.parse_args()
    if args.as_of:
        sc.AS_OF_DATE = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        log(f"⏪ 回放模式 · as_of = {sc.AS_OF_DATE}")

    tickers = [t[0] for t in THEMES]
    daily = fetch_theme_data(tickers)

    rows = []
    for ticker, name_zh, name_en in THEMES:
        r = sc.compute_metrics(ticker, name_zh, name_en, daily, pd.DataFrame())
        if r:
            rows.append(r)

    if not rows:
        sys.exit("❌ 沒抓到任何 theme ETF 資料")

    df = pd.DataFrame(rows)
    df = sc.add_ranks_and_composite(df)

    as_of = df["as_of_date"].iloc[0]
    df, biggest_mover = add_theme_acceleration_and_quadrant(df, as_of)

    if biggest_mover:
        log(f"  📍 最大位移: {biggest_mover['sector']} {biggest_mover['sector_name']} · "
            f"point {biggest_mover['point']:.1f} · acc {biggest_mover['acceleration']:+.1f} · "
            f"象限 {biggest_mover['quadrant_zh']}")
    log("=" * 78)
    log(f"Theme ETF Scorecard · as of {as_of}")
    log("=" * 78)
    for _, r in df.iterrows():
        alert = f"⚠ {r['gap_alert']}" if r["gap_alert"] else ""
        log(
            f"  #{r['composite_rank']:2d} {r['sector']:5s} {r['sector_name']:8s} "
            f"pt={r['point']:6.2f} (rk{r['point_rank']:2d})  "
            f"vp={r['vp_score']:5.1f} (rk{r['vp_score_rank']:2d})  "
            f"CMS_A={r['cms_a']:5.2f}  {alert}"
        )

    save_theme_outputs(df, biggest_mover=biggest_mover)


if __name__ == "__main__":
    main()
