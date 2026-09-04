#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股產業鏈 Master Mapping 讀取/查詢工具  scripts/tw_industry_mapping.py
=====================================================================
Phase 2 第一步：把「板塊排名」進化成「產業鏈資金流向雷達」的資料地基。

data/sector_rotation/industry_mapping.csv 是手動整理的 IndustryMappingTable
（20 條高價值產業鏈 × 核心台股公司），欄位：
  ticker, company, market, official_sector, sub_industry, supply_chain,
  chain_node, theme, role, weight, confidence, source, updated_at

跟 Phase 1 的 industry_category（TWSE/TPEx 官方粗分類，一檔股票只能屬於一個
sector）不同，這份表是 many-to-many：同一檔股票可以出現在多條 supply_chain
（例如台達電同時掛在 Thermal/Data Center Power/Energy Storage/EV），一列
代表一組 (ticker, supply_chain) 關聯，不是一檔股票一列。

這份表是「分析模型映射」，不是官方分類——source/confidence 欄位就是為了讓使用者
知道每一筆的可信度跟依據，不是宣稱跟 TWSE/TPEx 官方產業鏈資訊平台的分類完全一致。
market 欄位只在能用真實資料交叉驗證（跟 TWSE STOCK_DAY_ALL 官方上市清單比對）時
才填 TWSE，驗證不到的先留空，不用猜的。

這個模組本身只做「讀取 + 查詢 + 覆蓋率統計」，還沒接上 ChainPoint/ChainCPD/
Chain Resonance 這些 Phase 2 感測器計算——那是下一步，先確保這份地基資料結構
正確、涵蓋率透明可查，再往上疊算法。

手動跑（覆蓋率報告）：
  python scripts/tw_industry_mapping.py
  python scripts/tw_industry_mapping.py --universe-csv data/sector_rotation/tw_20260903_all.csv
"""
import argparse
import os

import pandas as pd

MAPPING_PATH = "data/sector_rotation/industry_mapping.csv"
REQUIRED_COLUMNS = [
    "ticker", "company", "market", "official_sector", "sub_industry",
    "supply_chain", "chain_node", "theme", "role", "weight",
    "confidence", "source", "updated_at",
]


def load_mapping(path=MAPPING_PATH):
    """讀 IndustryMappingTable。keep_default_na=False 是必要的——market/
    official_sector/sub_industry 這些欄位本來就會有意留空字串（代表「還沒
    驗證/使用者原始資料沒給」），不能被 pandas 預設吃成 NaN，不然後面判斷
    「這欄有沒有值」的邏輯會混淆「空字串」跟「沒有這一列」。"""
    if not os.path.exists(path):
        return pd.DataFrame(columns=REQUIRED_COLUMNS)
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"industry_mapping.csv 缺少必要欄位：{missing}")
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce").fillna(1.0)
    return df


def chains_for_ticker(mapping_df, ticker):
    """回傳一檔股票掛在的所有 supply_chain 列（many-to-many，可能不只一條）。"""
    return mapping_df[mapping_df["ticker"] == str(ticker)].to_dict(orient="records")


def tickers_for_chain(mapping_df, supply_chain):
    """回傳一條產業鏈裡的所有股票列。"""
    return mapping_df[mapping_df["supply_chain"] == supply_chain].to_dict(orient="records")


def coverage_report(mapping_df, universe_tickers):
    """涵蓋率報告：這份 mapping 對「今天實際股票池」覆蓋了多少檔、多少條鏈各
    覆蓋幾檔——誠實反映「目前只有部分展示股票有對到產業鏈」，不誇大成
    「300 檔全覆蓋」。universe_tickers 是股票代號的 iterable（字串）。
    """
    universe = {str(t) for t in universe_tickers}
    mapped_tickers = set(mapping_df["ticker"]) & universe
    unmapped = sorted(universe - mapped_tickers)

    by_chain = (
        mapping_df[mapping_df["ticker"].isin(universe)]
        .groupby("supply_chain")["ticker"].nunique()
        .sort_values(ascending=False)
    )

    return {
        "universe_size": len(universe),
        "mapping_total_tickers": int(mapping_df["ticker"].nunique()),
        "mapping_total_rows": int(len(mapping_df)),
        "chain_count": int(mapping_df["supply_chain"].nunique()),
        "covered_in_universe": len(mapped_tickers),
        "coverage_pct": round(100 * len(mapped_tickers) / len(universe), 1) if universe else 0.0,
        "unmapped_in_universe": unmapped,
        "stocks_per_chain_in_universe": by_chain.to_dict(),
    }


def _cli():
    parser = argparse.ArgumentParser(description="IndustryMappingTable 覆蓋率報告")
    parser.add_argument("--mapping-csv", default=MAPPING_PATH)
    parser.add_argument("--universe-csv", default=None,
                         help="跟 tw_{date}_all.csv 同格式（要有 stock_id 欄位）；"
                              "不給就只印 mapping 本身的統計，不算涵蓋率")
    args = parser.parse_args()

    mapping_df = load_mapping(args.mapping_csv)
    print(f"IndustryMappingTable：{len(mapping_df)} 列 · "
          f"{mapping_df['ticker'].nunique()} 檔不重複股票 · "
          f"{mapping_df['supply_chain'].nunique()} 條產業鏈")
    known_market = (mapping_df["market"] != "").sum()
    print(f"market 已驗證（TWSE）：{known_market} 列 · 待驗證（空白）：{len(mapping_df) - known_market} 列")

    if not args.universe_csv:
        print("\n（沒有指定 --universe-csv，跳過涵蓋率計算——只印 mapping 本身的統計）")
        return

    universe_df = pd.read_csv(args.universe_csv, dtype=str)
    report = coverage_report(mapping_df, universe_df["stock_id"])
    print(f"\n股票池 {report['universe_size']} 檔中，有 {report['covered_in_universe']} 檔"
          f"（{report['coverage_pct']}%）能對到至少一條產業鏈——"
          f"誠實地說，這代表還有 {len(report['unmapped_in_universe'])} 檔完全沒有映射，"
          f"不是「300 檔全覆蓋」。")
    print("\n各鏈在股票池內的涵蓋數：")
    for chain, n in report["stocks_per_chain_in_universe"].items():
        print(f"  {chain:42s} {n}")


if __name__ == "__main__":
    _cli()
