#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
yfinance 台股資料能力探索  scripts/dump_yfinance_tw_schema.py
=====================================================================
一次性診斷腳本，不是常態 pipeline 的一部分。目的：驗證 yfinance 能不能用來
補 TW pipeline 目前卡在 FinMind 配額的 Layer 2（個股價量歷史）——本地 sandbox
連不到 yahoo finance，所以寫成腳本丟到 GitHub Actions 跑（美股版 pipeline已經
在同一個 CI 環境成功用 yfinance 跑 S&P 500 一整個會話，代表網路是通的）。

測試範圍：
  1. 歷史 OHLCV（yf.Ticker(t).history()）— 筆數、日期範圍、欄位、有沒有缺值
  2. 基本面資訊（yf.Ticker(t).info）— 市值/本益比/殖利率/已發行股數等有沒有
  3. 財報（quarterly_financials / quarterly_balance_sheet）— 台股公司財報
     yfinance 到底有沒有資料（如果有，可能是 TWSE OpenAPI 季度快照的另一個
     選項/交叉驗證來源）
  4. 三大法人買賣（institutional_holders）— 預期沒有（yfinance 主要覆蓋美股
     法人持股，台股大概率是空的），驗證清楚而不是假設

測試標的：
  2330.TW  台積電（上市，大型股）
  2454.TW  聯發科（上市，大型股）
  0050.TW  元大台灣50（上市 ETF）
  8299.TWO 群聯（上櫃——用來驗證 .TWO 後綴能不能涵蓋上櫃，目前 TW pipeline
           只做上市，如果 yfinance 連上櫃都有，是額外的範圍擴充機會）

輸出：純文字印到 stdout，人工看／或 CI 存進 GITHUB_STEP_SUMMARY。

手動跑：
  pip install yfinance pandas
  python scripts/dump_yfinance_tw_schema.py
"""
import sys
import traceback

import yfinance as yf

TEST_TICKERS = ["2330.TW", "2454.TW", "0050.TW", "8299.TWO"]


def line(msg=""):
    print(msg, flush=True)


def dump_history(ticker):
    line(f"  [history] yf.Ticker('{ticker}').history(period='5y')")
    try:
        hist = yf.Ticker(ticker).history(period="5y", auto_adjust=False)
    except Exception as e:
        line(f"    ❌ 例外：{e}")
        traceback.print_exc()
        return
    if hist is None or hist.empty:
        line("    ⚠ 回傳空資料（可能是 ticker 代碼不對，或這檔真的沒歷史資料）")
        return
    line(f"    筆數：{len(hist)}")
    line(f"    日期範圍：{hist.index.min()} ~ {hist.index.max()}")
    line(f"    欄位：{list(hist.columns)}")
    nan_counts = hist.isna().sum()
    nan_cols = {k: int(v) for k, v in nan_counts.items() if v > 0}
    line(f"    缺值欄位（NaN 數量 > 0）：{nan_cols if nan_cols else '無'}")
    line("    最近 3 筆：")
    for idx, row in hist.tail(3).iterrows():
        line(f"      {idx.date()}  O={row.get('Open'):.2f} H={row.get('High'):.2f} "
             f"L={row.get('Low'):.2f} C={row.get('Close'):.2f} V={row.get('Volume'):.0f}")


def dump_info(ticker):
    line(f"  [info] yf.Ticker('{ticker}').info")
    try:
        info = yf.Ticker(ticker).info
    except Exception as e:
        line(f"    ❌ 例外：{e}")
        return
    if not info:
        line("    ⚠ 回傳空字典")
        return
    keys_of_interest = [
        "marketCap", "trailingPE", "forwardPE", "priceToBook", "dividendYield",
        "sharesOutstanding", "floatShares", "sector", "industry", "currency",
        "regularMarketPrice", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
    ]
    for k in keys_of_interest:
        line(f"    {k}: {info.get(k, '(無此欄位)')}")
    line(f"    info 總欄位數：{len(info)}")


def dump_financials(ticker):
    line(f"  [financials] yf.Ticker('{ticker}').quarterly_financials / quarterly_balance_sheet")
    try:
        t = yf.Ticker(ticker)
        qf = t.quarterly_financials
        qb = t.quarterly_balance_sheet
    except Exception as e:
        line(f"    ❌ 例外：{e}")
        return
    if qf is None or qf.empty:
        line("    quarterly_financials：⚠ 空")
    else:
        line(f"    quarterly_financials：{qf.shape[1]} 個季度，欄位（row index）範例：{list(qf.index[:8])}")
        line(f"      季度日期：{list(qf.columns)}")
    if qb is None or qb.empty:
        line("    quarterly_balance_sheet：⚠ 空")
    else:
        line(f"    quarterly_balance_sheet：{qb.shape[1]} 個季度，欄位（row index）範例：{list(qb.index[:8])}")


def dump_institutional(ticker):
    line(f"  [institutional] yf.Ticker('{ticker}').institutional_holders")
    try:
        t = yf.Ticker(ticker)
        ih = t.institutional_holders
    except Exception as e:
        line(f"    ❌ 例外：{e}")
        return
    if ih is None or ih.empty:
        line("    ⚠ 空（預期中——yfinance 法人持股資料主要覆蓋美股）")
    else:
        line(f"    有資料！{len(ih)} 筆，欄位：{list(ih.columns)}")
        line(ih.head(3).to_string())


def main():
    line("=" * 78)
    line("yfinance 台股資料能力探索（一次性診斷，不是常態 pipeline）")
    line("=" * 78)
    for ticker in TEST_TICKERS:
        line("")
        line(f"### {ticker}")
        dump_history(ticker)
        dump_info(ticker)
        dump_financials(ticker)
        dump_institutional(ticker)
    line("")
    line("✅ 診斷完成")


if __name__ == "__main__":
    sys.exit(main())
