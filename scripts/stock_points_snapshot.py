#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S&P 500 個股 Point 快照（輕量、每日跑）  scripts/stock_points_snapshot.py
=====================================================================
Price Lag（美股 v2 報表）需要「每天都有」的全市場個股 point（4W/13W/26W
加權動能），但完整的 sector_rotation_screener.py（Stage 2）因為要對預篩
過的個股跑 VCP + 盈餘動能判定（per-stock 迴圈，慢），CI 排程只排週五——
導致 Price Lag 平日永遠是空的（使用者反饋：這是 V2 目前最大的缺口）。

這支腳本只跑 Stage 2 裡最便宜的三步——都是一次性的批次抓取，沒有
per-stock 迴圈：
  1. fetch_sp500_constituents()：抓 Wikipedia 的 S&P 500 成分股清單
  2. fetch_weekly_returns()：一次 yfinance 批次下載算全部個股的
     4W/13W/26W 累積報酬 + point（跟 sector_scorecard.py 算 sector point
     用同一個公式，只是輸入換成個股價格）
  3. add_sector_internal_ranks()：板塊內排名 + CMS_A

輸出獨立的 {date}_stock_points.csv，跟週五 Stage 2 的完整
{date}_all.csv（含 VCP/explosive_verdict/trend_state 等 Opportunity
Radar 需要的欄位）不衝突、互不覆蓋——generate_daily_report_v2.py 的
load_all_rows() 完整版存在時優先用完整版，沒有時才退回這個輕量版
（只夠算 Price Lag，不夠算 Opportunity Radar 的 S1-S5，那些欄位需要
VCP/explosive_verdict，這裡沒有）。

重用（不重寫）sector_rotation_screener.py 的
fetch_sp500_constituents / fetch_weekly_returns / add_sector_internal_ranks。

輸出：
  data/sector_rotation/{YYYYMMDD}_stock_points.csv

手動跑：
  python scripts/stock_points_snapshot.py
"""
import os
import sys
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sector_rotation_screener as srs  # noqa: E402  重用便宜的那三步，不重寫

OUTDIR = "data/sector_rotation"

STOCK_POINTS_COLUMNS = [
    "symbol", "name", "sector", "as_of_date",
    "cum_ret_4w", "cum_ret_13w", "cum_ret_26w", "point", "di",
    "cum_ret_4w_rank_in_sector", "cum_ret_13w_rank_in_sector",
    "cum_ret_26w_rank_in_sector", "cms_a",
]


def log(msg):
    srs.log(msg)


def build_stock_points(as_of_date=None):
    """跑 Stage 2 最便宜的三步，回傳 DataFrame（可能是空的，呼叫端自己判斷）。"""
    if as_of_date:
        srs.AS_OF_DATE = datetime.strptime(as_of_date, "%Y-%m-%d").date()
        log(f"⏪ 回放模式 · as_of = {srs.AS_OF_DATE}")

    universe = srs.fetch_sp500_constituents()
    ret_df = srs.fetch_weekly_returns(universe["symbol"].tolist())
    df = universe.merge(ret_df, on="symbol", how="inner")
    if not len(df):
        return df
    df = srs.add_sector_internal_ranks(df)
    return df


def save_stock_points(df):
    os.makedirs(OUTDIR, exist_ok=True)
    as_of = df["as_of_date"].iloc[0]
    stamp = as_of.replace("-", "")
    path = os.path.join(OUTDIR, f"{stamp}_stock_points.csv")
    df[STOCK_POINTS_COLUMNS].to_csv(path, index=False)
    log(f"  saved {path} ({len(df)} 檔)")
    return path


def main():
    parser = argparse.ArgumentParser(
        description="S&P 500 個股 Point 快照（輕量、每日跑，供 Price Lag 用）")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · 用 YYYY-MM-DD 前一天的 close 為基準（不填 = 用最新）")
    args = parser.parse_args()

    df = build_stock_points(args.as_of)
    if not len(df):
        sys.exit("❌ 沒抓到任何個股資料")

    path = save_stock_points(df)
    print(f"✅ 產生 {path}（{len(df)} 檔，{df['sector'].nunique()} 個 sector）")


if __name__ == "__main__":
    main()
