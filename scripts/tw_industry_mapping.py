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

aggregate_supply_chains() 是這個模組的第二步：把「讀取 + 查詢 + 覆蓋率統計」
接上 Phase 2 感測器計算——對今天的全股票池明細（tw_sector_pipeline 的
all_df，一列一檔股票，含 point/cum_ret_4w/inst_net_20d_est_NTD_M）跟這份
mapping 做 many-to-many join，算出 ChainPoint / ChainBreadth /
ChainCapitalFlow（沿用跟 aggregate_sectors() 一樣的定義，只是分組維度換成
supply_chain），加上一個 sector 版本沒有的東西——Node Resonance：同一條鏈
可能有好幾個「節點」（例如 AI Server 底下有 Compute/PCB/CCL/Thermal/Power），
Resonance = 這些節點裡有幾個「平均 point 轉正」的比例，比單看整條鏈的
Breadth（個股層級）更能反映「這條鏈是不是從單一環節在往外擴散」。

ChainAcceleration（跟 add_sector_acceleration 一樣需要多天歷史）跟完整的
Chain CPD 歷史回填還沒做——這條鏈才剛有第一天資料，跟 Transition Sensor
當初的處境一樣，是下一步。

手動跑（覆蓋率報告）：
  python scripts/tw_industry_mapping.py
  python scripts/tw_industry_mapping.py --universe-csv data/sector_rotation/tw_20260903_all.csv
"""
import argparse
import os

import pandas as pd

# add_sector_cpd() 的 CPD = Z(法人金額) - Z(SectorPoint) 這套邏輯本來就是通用的
# 横斷面 Z-score 分象限，跟「分組維度是 sector 還是 supply_chain」無關——從 tw_cpd
# 共用模組匯入，不重寫一份幾乎一樣的程式碼，也不 import tw_sector_pipeline 本身
# （它反過來也需要匯入這個模組來算 ChainPoint，兩邊互相 import 會循環依賴）。
from tw_cpd import add_sector_cpd

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


def _node_resonance(chain_rows):
    """chain_rows：某條 supply_chain 在今天股票池裡的 (stock_id, chain_node, point)
    列表。Resonance = 有幾個不同的 chain_node「平均 point 轉正」÷ 這條鏈今天總共
    出現幾個不同的 chain_node——比整條鏈的個股 Breadth 更能看出「這是從單一環節
    在往外擴散，還是真的全鏈共振」。只有 1 個節點時 resonance 沒有意義（跟自己比
    100%），回傳 None，不假裝有訊號。"""
    by_node = {}
    for r in chain_rows:
        node = r.get("chain_node") or "(未分類)"
        by_node.setdefault(node, []).append(r["point"])
    if len(by_node) < 2:
        return None, len(by_node)
    strong = sum(1 for pts in by_node.values() if sum(pts) / len(pts) > 0)
    return round(100 * strong / len(by_node), 1), len(by_node)


def aggregate_supply_chains(all_df, mapping_df, as_of):
    """Phase 2 核心：把今天的全股票池明細（tw_sector_pipeline.py 的 all_df，一列
    一檔股票）跟 IndustryMappingTable 做 many-to-many join，依 supply_chain 分組
    算出 ChainPoint / ChainBreadth / ChainCapitalFlow / Node Resonance，再套用
    跟 Phase 1 sector 版一樣的 CPD 象限分類（重用 tw_sector_pipeline.add_sector_cpd）。

    只計算「今天股票池裡實際有對應到的股票」——涵蓋率不是 100%，這是誠實反映
    IndustryMappingTable 目前只映射了部分股票（見 coverage_report），不是這裡的
    bug。回傳空 DataFrame 如果完全沒有交集（例如 mapping 是空的）。
    """
    # 個股層級欄位是 inst_total_net_20d_est_NTD_M（fetch_institutional_flow() 的
    # 原始欄位名）——跟 aggregate_sectors() 輸出的 inst_net_20d_est_NTD_M（已經是
    # 加總過的板塊層級欄位，少了 total 兩個字）是兩個不同東西，不能搞混。
    need_cols = {"stock_id", "point", "cum_ret_4w", "inst_total_net_20d_est_NTD_M"}
    missing = need_cols - set(all_df.columns)
    if missing:
        raise ValueError(f"all_df 缺少必要欄位：{missing}")

    stock_df = all_df.copy()
    stock_df["stock_id"] = stock_df["stock_id"].astype(str)
    m = mapping_df.copy()
    m["ticker"] = m["ticker"].astype(str)

    merged = m.merge(stock_df, left_on="ticker", right_on="stock_id", how="inner")
    if merged.empty:
        return pd.DataFrame()

    groups = []
    for chain, g in merged.groupby("supply_chain"):
        n = len(g)
        point = float(g["point"].mean())
        breadth_up = int((g["cum_ret_4w"] > 0).sum())
        breadth_pct = round(100 * breadth_up / n, 1) if n else None
        inst_ntd = g["inst_total_net_20d_est_NTD_M"].dropna()
        inst_sum = float(inst_ntd.sum()) if not inst_ntd.empty else None
        resonance_pct, node_count = _node_resonance(g[["stock_id", "chain_node", "point"]].to_dict("records"))
        groups.append({
            "supply_chain": chain, "as_of_date": as_of, "stock_count": n,
            "point": round(point, 2),
            "breadth_pct": breadth_pct, "breadth_up": breadth_up, "breadth_total": n,
            "inst_net_20d_est_NTD_M": round(inst_sum, 1) if inst_sum is not None else None,
            "inst_net_20d_est_NTD_M_per_stock": round(inst_sum / n, 2) if inst_sum is not None and n else None,
            "node_count": node_count,
            "resonance_pct": resonance_pct,
        })

    chain_df = pd.DataFrame(groups).sort_values("point", ascending=False).reset_index(drop=True)
    return add_sector_cpd(chain_df)


def save_chain_scorecard(chain_df, as_of, outdir="data/sector_rotation"):
    """存 tw_{date}_chains.csv，跟 tw_sector_pipeline.py 的 tw_{date}_scorecard.csv
    同精神，只是分組維度是 supply_chain 不是官方 sector。chain_df 為空（今天股票池
    跟 mapping 完全沒有交集）就不寫檔，回傳 None 讓呼叫端知道跳過了，不是靜默失敗。
    """
    if chain_df is None or chain_df.empty:
        return None
    os.makedirs(outdir, exist_ok=True)
    stamp = as_of.replace("-", "")
    path = os.path.join(outdir, f"tw_{stamp}_chains.csv")
    chain_df.to_csv(path, index=False)
    return path


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
