#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
個股歷史 Point / 法人滾動總額計算  scripts/tw_backfill.py
=====================================================================
每次執行 tw_sector_pipeline.py 本來就抓了 14 個月的價量（yfinance）跟法人逐日
買賣（FinMind）歷史，但平常只算「今天」這一天的 Point / 法人 20 日滾動總額，
中間的歷史算完就丟。這裡的兩個函式讓「回填過去幾天」變成零額外 API 呼叫：

  point_series_for_stock()  向量化算出整條 close 序列每一天的 point + cum_ret_4w
  inst_20d_asof()           從逐日法人淨買 pivot，對任何過去日期重新滾動加總 20 日

給 tw_sector_pipeline.backfill_transition_history()（板塊）跟
tw_industry_mapping.backfill_chain_transition_history()（產業鏈）共用——兩邊
回填邏輯只差在最後「怎麼分組」（sector 是 1:1，supply_chain 是 many-to-many），
底層「這檔股票在某一天的 point/法人金額是多少」完全一樣，不要重複寫兩份。
"""
import pandas as pd


def point_series_for_stock(close, min_len=131):
    """向量化算出整條 close 序列裡，每個「有足夠歷史」的日期的 point + cum_ret_4w。
    跟 tw_sector_pipeline.compute_stock_row() 的 point 公式完全一樣
    （r4*0.25+r13*0.25+r26*0.5），只是 compute_stock_row 只回傳最後一天，這裡回傳
    整條序列，backfill 才能一次拿到過去 N 天各自的 point，不用重複呼叫。"""
    s = close.dropna().astype(float)
    if len(s) < min_len:
        return None
    # compute_stock_row() 用 close.iloc[-20]/[-65]/[-130]：對「最後一天」來說，
    # iloc[-20] 是往前 19 天（不是 20 天），所以這裡要 shift(19)/(64)/(129) 才會跟
    # 它對同一天算出同一個 point，不能直接用 20/65/130（差一天）。
    r4 = s / s.shift(19) - 1
    r13 = s / s.shift(64) - 1
    r26 = s / s.shift(129) - 1
    point = (r4 * 0.25 + r13 * 0.25 + r26 * 0.50) * 100
    out = pd.DataFrame({"point": point, "cum_ret_4w": r4 * 100}).dropna()
    return out if not out.empty else None


def inst_20d_asof(pivot, date, latest_close):
    """從逐日法人淨買 pivot 裡，算出「截至 date（含）」的 20 個交易日滾動總額
    （NTD 百萬）——跟 fetch_institutional_flow() 對「今天」做的事完全一樣，只是
    這裡可以對任何一個過去的 date 做，不用重新打 API。"""
    if pivot is None or pivot.empty or latest_close is None:
        return None
    sub = pivot.loc[:date]
    if sub.empty:
        return None
    cols = [c for c in ("foreign", "trust", "dealer") if c in sub.columns]
    if not cols:
        return None
    n = min(20, len(sub))
    total_shares = float(sub[cols].iloc[-n:].sum().sum())
    return round(total_shares * latest_close / 1e6, 1)
