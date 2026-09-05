#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股產業鏈 Master Mapping 讀取/查詢工具  scripts/tw_industry_mapping.py
=====================================================================
Phase 2 第一步：把「板塊排名」進化成「產業鏈資金流向雷達」的資料地基。

data/sector_rotation/industry_mapping.csv 是手動整理的 IndustryMappingTable
（v1.1：23 條供應鏈 × 核心台股公司，最初 20 條 + Steel / Display & Optical /
Passive Components），欄位：
  ticker, company, market, official_sector, sub_industry, supply_chain,
  chain_node, theme, role, weight, confidence, source, updated_at, graph_role

跟 Phase 1 的 industry_category（TWSE/TPEx 官方粗分類，一檔股票只能屬於一個
sector）不同，這份表是 many-to-many：同一檔股票可以出現在多條 supply_chain
（例如台達電同時掛在 Thermal/Data Center Power/Energy Storage/EV），一列
代表一組 (ticker, supply_chain) 關聯，不是一檔股票一列。

graph_role（CORE/COMPONENT/UPSTREAM/DOWNSTREAM/INFRASTRUCTURE/ENABLER/
CROSS_CHAIN）標記這檔股票在這條鏈裡的網路角色，尤其 CROSS_CHAIN 標出「這家
公司同時是好幾條鏈的節點」（例如台達電、致訊、貿聯、同欣電）——這種公司的
Chain Resonance 訊號比單一節點公司更值得注意，不該被硬塞進單一 SupplyChain。
目前只對明確核對過的股票填值，其餘留空（誠實：還沒逐筆重新分類，不是這些
股票就沒有 graph_role，只是還沒標）。

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

backfill_chain_transition_history() 是第三步：跟 tw_sector_pipeline.
backfill_transition_history() 同精神（用這次執行本來就抓好的 14 個月價量/法人
歷史回填過去幾天，零額外 API 呼叫），只是分組維度換成 supply_chain
（many-to-many）——讓 Chain Transition Sensor（用 tw_cpd.add_transition_sensor(
group_col="supply_chain", glob_pattern="tw_*_chains.csv")）第一次執行就有
真實資料可比，不用重演 sector 版當初「為什麼沒辦法比較」的那次來回。
ChainAcceleration（跟 add_sector_acceleration 一樣需要多天歷史，但沒有
Overheated 這種需要跨天判斷的東西，優先度較低）還沒做。

chain_dependency_check() 是第四步：data/sector_rotation/industry_chain_edges.csv
是「鏈跟鏈之間」的依賴圖（不是股票對鏈，是鏈對鏈——例如 AI Server / ODM
requires AI / HPC Semiconductor / Advanced Packaging / Thermal 等）。TPEx 沒有
發布這種跨鏈依賴的官方資料，這張表整個是分析模型（source 欄位明講
"analyst_model(not_official_TPEx_cross_chain_graph)"，不是宣稱有官方依據）。
用途：一條鏈今天 point 很高、CPD 很強，不代表這個強勢有基本面支撐——如果它
依賴的上游鏈（例如 AI Server 需要的 Advanced Packaging/Thermal）今天都是
❄️ Weak，那這條鏈的強勢可能只是價格面單獨噴出，供應鏈還沒真的跟上。
upstream_confirmed_pct 就是量化這件事：這條鏈的上游鏈裡，有幾成今天也是
🚀 Confirmed 或 💰 Capital Leading。

手動跑（覆蓋率報告）：
  python scripts/tw_industry_mapping.py
  python scripts/tw_industry_mapping.py --universe-csv data/sector_rotation/tw_20260903_all.csv
"""
import argparse
import json
import os

import pandas as pd

from tw_cpd import TRANSITION_BACKFILL_DAYS

# add_sector_cpd() 的 CPD = Z(法人金額) - Z(SectorPoint) 這套邏輯本來就是通用的
# 横斷面 Z-score 分象限，跟「分組維度是 sector 還是 supply_chain」無關——從 tw_cpd
# 共用模組匯入，不重寫一份幾乎一樣的程式碼，也不 import tw_sector_pipeline 本身
# （它反過來也需要匯入這個模組來算 ChainPoint，兩邊互相 import 會循環依賴）。
from tw_cpd import add_sector_cpd

OUTDIR = "data/sector_rotation"
MAPPING_PATH = os.path.join(OUTDIR, "industry_mapping.csv")
EDGES_PATH = os.path.join(OUTDIR, "industry_chain_edges.csv")
REQUIRED_COLUMNS = [
    "ticker", "company", "market", "official_sector", "sub_industry",
    "supply_chain", "chain_node", "theme", "role", "weight",
    "confidence", "source", "updated_at", "graph_role",
]
GRAPH_ROLES = {"CORE", "COMPONENT", "UPSTREAM", "DOWNSTREAM", "INFRASTRUCTURE", "ENABLER",
               "CROSS_CHAIN", "DISTRIBUTOR"}
EDGE_REQUIRED_COLUMNS = ["source_chain", "edge_type", "target_chain", "weight",
                          "confidence", "source", "updated_at"]
# 供 upstream_confirmed_pct 判定「這條上游鏈今天算不算強勢」——跟 CPD 象限的
# 命名一致（🚀 Confirmed / 💰 Capital Leading 都是「資金有進來」的兩種形式，
# 差別只在價格有沒有跟上，這裡兩者都算數）。
_CONFIRMED_STATES = {"🚀 Confirmed", "💰 Capital Leading"}


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
    """Phase 2 產業鏈研究池報告：這份 mapping 對「今天實際股票池」覆蓋了多少檔、
    多少條鏈各覆蓋幾檔。coverage_pct 不是「mapping 完成度」——Phase 1（市場/
    板塊/個股感測）本來就對全部股票池 100% 生效，沒有對到 IndustryMappingTable
    的股票不是資料缺失，是還沒被納入 Phase 2 產業鏈研究池（低流動性/非核心
    產業/暫無明確供應鏈歸屬），不影響它們在 Phase 1 被完整分析。
    universe_tickers 是股票代號的 iterable（字串）。
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


# Price Lag 鏈內 Z-score 的參考母體太小（<3 檔）沒有統計意義，整條鏈跳過。
PRICE_LAG_MIN_CHAIN_SIZE = 3


def compute_chain_price_lag(all_df, mapping_df, chain_df, as_of):
    """Price Lag = Z(ChainStrength) - Z(StockStrength)：在「鏈已經確認」的
    前提下，找鏈內還沒漲上來的個股——「這條鏈的資金/價格論點還在，這檔股票
    還沒反映」的早期機會候選，不是「已經噴出的強勢股」篩選器。

    ChainStrength：chain_df 裡 add_sector_cpd() 已經算好的 z_point——這條鏈
    的 point 相對「今天所有其他 supply_chain」的橫斷面 Z-score（母體通常
    20-25 條鏈）。
    StockStrength：同一檔股票的 point，相對「同一條鏈裡今天其他股票」的
    橫斷面 Z-score（母體是這條鏈今天股票池的股票，不是全市場排名）。同一檔
    股票掛多條鏈時（many-to-many），每條鏈分別算一次 StockStrength，跟
    aggregate_supply_chains() 的「各鏈分別計入」設計一致。

    PriceLag 越正：鏈整體越強（vs. 其他鏈）、這檔股票在鏈內相對越弱（vs.
    鏈內其他股票）——鏈強股弱的組合正是「還沒反映」的訊號。early_flag 只在
    鏈本身已經是 🚀 Confirmed／💰 Capital Leading（真的有資金確認，不是鏈
    本身就弱、隨便一檔股票都會顯得「相對弱」的雜訊）且這檔股票 stock_z_in_
    chain < 0（低於鏈內平均）才標記，避免鏈本身疲弱時被誤判成機會。

    鏈內股票數 < PRICE_LAG_MIN_CHAIN_SIZE（預設 3）時，鏈內 Z-score 母體
    太小沒有意義，整條鏈跳過（不硬算），不會出現在回傳結果裡。
    """
    need_cols = {"stock_id", "point"}
    missing = need_cols - set(all_df.columns)
    if missing:
        raise ValueError(f"all_df 缺少必要欄位：{missing}")
    if chain_df is None or chain_df.empty or "z_point" not in chain_df.columns:
        return pd.DataFrame()

    stock_df = all_df.copy()
    stock_df["stock_id"] = stock_df["stock_id"].astype(str)
    m = mapping_df.copy()
    m["ticker"] = m["ticker"].astype(str)

    merged = m.merge(stock_df, left_on="ticker", right_on="stock_id", how="inner")
    if merged.empty:
        return pd.DataFrame()

    state_col = "market_state" if "market_state" in chain_df.columns else "cpd_quadrant"
    chain_lookup = chain_df.set_index("supply_chain")[["z_point", "point", state_col]]

    rows = []
    for chain, g in merged.groupby("supply_chain"):
        if chain not in chain_lookup.index or len(g) < PRICE_LAG_MIN_CHAIN_SIZE:
            continue
        pts = g["point"].astype(float)
        std = pts.std()
        if not std or std != std or std == 0:
            continue
        chain_z = float(chain_lookup.loc[chain, "z_point"])
        chain_point = float(chain_lookup.loc[chain, "point"])
        chain_state = chain_lookup.loc[chain, state_col]
        stock_z = (pts - pts.mean()) / std
        for (_, row), sz in zip(g.iterrows(), stock_z):
            # 用四捨五入後的值判斷 early_flag（不是未捨入的原始值）：sz 極接近 0
            # 時（例如 -0.001）round() 後會顯示 -0.0，若拿原始值判斷會標成
            # EARLY，但畫面上看起來明明是「跟鏈內平均打平」，不是「落後」，
            # 兩者不一致會讓人誤解。捨入後再判斷，同時用 `or 0.0` 把 -0.0
            # 正規化成 0.0（-0.0 < 0 是 False，但顯示成 "-0.0" 仍會讓人困惑）。
            sz_rounded = round(float(sz), 2) or 0.0
            rows.append({
                "ticker": row["ticker"], "stock_name": row.get("stock_name", ""),
                "supply_chain": chain, "as_of_date": as_of,
                "chain_point": round(chain_point, 2), "chain_z_point": round(chain_z, 2),
                "chain_state": chain_state,
                "stock_point": round(float(row["point"]), 2), "stock_z_in_chain": sz_rounded,
                "chain_size": len(g),
                "price_lag": round(chain_z - sz_rounded, 2),
                "early_flag": "🎯 EARLY" if (chain_state in _CONFIRMED_STATES and sz_rounded < 0) else "",
            })

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).sort_values("price_lag", ascending=False).reset_index(drop=True)


def save_chain_price_lag(lag_df, as_of, outdir=OUTDIR):
    """存 tw_{date}_price_lag.csv。lag_df 為空（沒有任何鏈達到最小股票數門檻）
    就不寫檔，回傳 None，跟其餘 save_* 函式同樣的「空就跳過不是錯誤」慣例。
    """
    if lag_df is None or lag_df.empty:
        return None
    os.makedirs(outdir, exist_ok=True)
    stamp = as_of.replace("-", "")
    path = os.path.join(outdir, f"tw_{stamp}_price_lag.csv")
    lag_df.to_csv(path, index=False)
    return path


def save_chain_scorecard(chain_df, as_of, outdir=OUTDIR):
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


def save_chain_dependency(dep_df, as_of, outdir=OUTDIR):
    """存 tw_{date}_chain_deps.csv（chain_dependency_check() 的輸出）。
    upstream_states 是 dict，存檔前轉成 JSON 字串，人眼看得懂也能重新
    json.loads() 回來，不是純粹被 to_csv() str() 化的 Python dict repr。
    """
    if dep_df is None or dep_df.empty:
        return None
    os.makedirs(outdir, exist_ok=True)
    stamp = as_of.replace("-", "")
    path = os.path.join(outdir, f"tw_{stamp}_chain_deps.csv")
    out = dep_df.copy()
    out["upstream_states"] = out["upstream_states"].apply(json.dumps, ensure_ascii=False)
    out.to_csv(path, index=False)
    return path


def backfill_chain_transition_history(universe, batch, yf_tickers, inst_daily_pivots, mapping_df, as_of,
                                       days=TRANSITION_BACKFILL_DAYS, outdir=OUTDIR):
    """跟 tw_sector_pipeline.backfill_transition_history() 同精神：用這次執行
    本來就抓好的 14 個月價量/法人歷史，回填過去幾個交易日的 tw_{date}_chains.csv，
    零額外 API 呼叫。差異只在最後「怎麼分組」——sector 版一檔股票對一個板塊，這裡
    透過 mapping_df 做 many-to-many（同一檔股票可能同時算進好幾條鏈）。

    只補「檔案還不存在」的日期，不覆蓋任何真實存過的資料；法人資料只涵蓋額度用完
    前成功抓到的股票，缺的股票該天 inst_net_20d_est_NTD_M 就是 None——跟平常執行
    同樣的額度限制，不是這裡新增的缺陷（跟 sector 版 backfill 的說明一致）。
    """
    from tw_backfill import point_series_for_stock, inst_20d_asof

    if mapping_df is None or mapping_df.empty:
        return 0

    stock_series = {}
    for u in universe:
        sid = u["stock_id"]
        yft = yf_tickers.get(sid)
        if not yft or yft not in batch["close"].columns:
            continue
        pdf = point_series_for_stock(batch["close"][yft])
        if pdf is not None:
            stock_series[sid] = (pdf, batch["close"][yft].dropna().astype(float))

    if not stock_series:
        return 0

    all_dates = sorted(set().union(*(pdf.index for pdf, _ in stock_series.values())))
    if len(all_dates) < 2:
        return 0
    backfill_dates = all_dates[:-1][-days:]  # 排除「今天」，只回填今天以前最近 N 天

    m = mapping_df.copy()
    m["ticker"] = m["ticker"].astype(str)
    chain_membership = {}  # ticker -> [(supply_chain, chain_node), ...]（many-to-many）
    for _, row in m.iterrows():
        chain_membership.setdefault(row["ticker"], []).append((row["supply_chain"], row["chain_node"]))

    written = 0
    for d in backfill_dates:
        stamp = d.strftime("%Y%m%d")
        out_path = os.path.join(outdir, f"tw_{stamp}_chains.csv")
        if os.path.exists(out_path):
            continue  # 已經有真實存檔（正常排程跑過），不覆蓋

        rows = []
        for sid, memberships in chain_membership.items():
            if sid not in stock_series:
                continue
            pdf, close = stock_series[sid]
            if d not in pdf.index:
                continue
            point = float(pdf.loc[d, "point"])
            cum_ret_4w = float(pdf.loc[d, "cum_ret_4w"])
            inst_ntd = None
            pivot = inst_daily_pivots.get(sid)
            if pivot is not None:
                px = close.loc[:d]
                if not px.empty:
                    inst_ntd = inst_20d_asof(pivot, d, float(px.iloc[-1]))
            for chain, node in memberships:
                rows.append({
                    "supply_chain": chain, "chain_node": node,
                    "point": point, "cum_ret_4w": cum_ret_4w,
                    "inst_net_20d_est_NTD_M": inst_ntd,
                })
        if not rows:
            continue

        day_df = pd.DataFrame(rows)
        sec_rows = []
        for chain, g in day_df.groupby("supply_chain"):
            n = len(g)
            breadth_up = int((g["cum_ret_4w"] > 0).sum())
            inst_sum = (float(g["inst_net_20d_est_NTD_M"].dropna().sum())
                        if g["inst_net_20d_est_NTD_M"].notna().any() else None)
            resonance_pct, node_count = _node_resonance(g[["chain_node", "point"]].to_dict("records"))
            sec_rows.append({
                "supply_chain": chain, "as_of_date": d.strftime("%Y-%m-%d"), "stock_count": n,
                "point": round(float(g["point"].mean()), 2),
                "breadth_pct": round(100 * breadth_up / n, 1) if n else None,
                "breadth_up": breadth_up, "breadth_total": n,
                "inst_net_20d_est_NTD_M": round(inst_sum, 1) if inst_sum is not None else None,
                "inst_net_20d_est_NTD_M_per_stock": round(inst_sum / n, 2) if inst_sum is not None and n else None,
                "node_count": node_count,
                "resonance_pct": resonance_pct,
            })
        if not sec_rows:
            continue
        chain_day_df = pd.DataFrame(sec_rows).sort_values("point", ascending=False).reset_index(drop=True)
        chain_day_df = add_sector_cpd(chain_day_df)
        chain_day_df.to_csv(out_path, index=False)
        written += 1

    return written


def load_chain_edges(path=EDGES_PATH):
    """讀鏈對鏈依賴圖。跟 load_mapping() 一樣 keep_default_na=False（source/
    confidence 是文字欄位，空字串跟缺列要分清楚）。檔案不存在回傳空 df，不是
    錯誤——這張表是選配的分析層，沒有它 aggregate_supply_chains() 照樣能跑。
    """
    if not os.path.exists(path):
        return pd.DataFrame(columns=EDGE_REQUIRED_COLUMNS)
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing = [c for c in EDGE_REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"industry_chain_edges.csv 缺少必要欄位：{missing}")
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce").fillna(1.0)
    return df


def chain_dependency_check(chain_df, edges_df):
    """對每條「有登記上游依賴」的鏈，算兩種確認度：
    - upstream_confirmed_pct：原始「幾條上游鏈確認 / 總共幾條」（未加權）。保留
      是因為分母本身（upstream_count）就是有意義的資訊——1 條依賴跟 8 條依賴
      的可信度不一樣，這個數字讓使用者自己看得到分母。
    - upstream_coherence_pct：用 industry_chain_edges.csv 的 weight 欄位加權
      （WeightedCoherence = Σ確認邊的 weight / Σ全部邊的 weight）。這是主要
      判定依據——1/1（weight 也許只有 0.5）不該跟 8/8（每條 weight 都接近 1）
      被當成同等強度的「100% 確認」，未加權版本會把兩者都顯示成 100%，掩蓋了
      「這條依賴關係本身有多重要」的差異。

    用途：一條鏈自己 point 很高、CPD 很強，不代表這個強勢有供應鏈基本面支撐——
    如果它依賴的上游鏈今天大多是 ❄️ Weak，這條鏈的強勢可能只是價格面單獨噴出，
    供應鏈資金還沒真的跟上。這是分析模型（industry_chain_edges.csv 裡沒有
    「requires」以外真正官方依據，weight 也是分析師主觀判斷，不是官方權重），
    不是嚴謹的供需模型。

    chain_df 沒有任何一條邊涉及的鏈，或 edges_df 是空的，回傳空 df（不是缺陷，
    純粹是還沒有依賴圖資料可用）。
    """
    if edges_df is None or edges_df.empty or chain_df is None or chain_df.empty:
        return pd.DataFrame()

    def _state(row):
        ms = row.get("market_state")
        if isinstance(ms, str) and ms:
            return ms
        return row.get("cpd_quadrant")

    state_by_chain = {r["supply_chain"]: _state(r) for r in chain_df.to_dict("records")}

    rows = []
    for source, g in edges_df.groupby("source_chain"):
        upstream_states = {}
        upstream_weights = {}
        for target, weight in zip(g["target_chain"], g["weight"]):
            if target in state_by_chain:
                upstream_states[target] = state_by_chain[target]
                try:
                    upstream_weights[target] = float(weight)
                except (TypeError, ValueError):
                    upstream_weights[target] = 1.0
        if not upstream_states:
            continue
        confirmed = sum(1 for s in upstream_states.values() if s in _CONFIRMED_STATES)
        total_weight = sum(upstream_weights.values())
        confirmed_weight = sum(w for t, w in upstream_weights.items()
                                if upstream_states[t] in _CONFIRMED_STATES)
        rows.append({
            "chain": source,
            "chain_state": state_by_chain.get(source),
            "upstream_count": len(upstream_states),
            "upstream_confirmed": confirmed,
            "upstream_confirmed_pct": round(100 * confirmed / len(upstream_states), 1),
            "upstream_total_weight": round(total_weight, 2),
            "upstream_confirmed_weight": round(confirmed_weight, 2),
            "upstream_coherence_pct": round(100 * confirmed_weight / total_weight, 1) if total_weight else 0.0,
            "upstream_states": upstream_states,
        })
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).sort_values("upstream_coherence_pct", ascending=False).reset_index(drop=True)


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
    print(f"\nPhase 2 產業鏈研究池：{report['covered_in_universe']} / "
          f"{report['universe_size']} 檔市場池（{report['coverage_pct']}%）——"
          f"其餘 {len(report['unmapped_in_universe'])} 檔尚未納入 Phase 2，"
          f"仍完整參與 Phase 1 市場／板塊／個股感測，不是資料缺失。")
    print("\n各鏈在股票池內的涵蓋數：")
    for chain, n in report["stocks_per_chain_in_universe"].items():
        print(f"  {chain:42s} {n}")


if __name__ == "__main__":
    _cli()
