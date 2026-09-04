#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CPD（Capital-Price Divergence）通用邏輯  scripts/tw_cpd.py
=====================================================================
CPD = Z(法人金額) - Z(SectorPoint)，橫斷面 Z-score 分四象限。這套邏輯本來寫在
tw_sector_pipeline.py 裡（分組維度是官方 industry_category），後來
tw_industry_mapping.py 的 aggregate_supply_chains()（分組維度是 supply_chain）
需要一模一樣的計算——抽成獨立模組給兩邊 import，不是複製一份幾乎一樣的程式碼，
也避免 tw_sector_pipeline ↔ tw_industry_mapping 互相 import 造成循環依賴。

tw_sector_pipeline.py 用 `from tw_cpd import CPD_QUADRANT, add_sector_cpd`
重新匯出，舊有呼叫端（tw.add_sector_cpd() / tw.CPD_QUADRANT）不用改。

add_transition_sensor() 是同一批重構的第二個共用函式：原本寫死「分組欄位叫
sector、讀 tw_*_scorecard.csv」，改成可以傳 group_col/glob_pattern 參數，
tw_industry_mapping.py 的 Chain Transition Sensor 直接重用（group_col=
"supply_chain", glob_pattern="tw_*_chains.csv"），不用再寫一份幾乎一樣的邏輯。
預設值維持跟原本 sector 版一模一樣，tw_sector_pipeline.py 的舊呼叫端
add_transition_sensor(sector_df, as_of) 不用改。
"""
import glob
import os

import pandas as pd

CPD_QUADRANT = {
    (True, True): "🚀 Confirmed",       # 價格強 + 資金強：同步確認
    (False, True): "💰 Capital Leading",  # 價格弱 + 資金強：資金先進，價格未反映（狩獵區）
    (True, False): "⚠️ Price Leading",   # 價格強 + 資金弱：價格已動但法人沒跟，追高風險
    (False, False): "❄️ Weak",          # 價格弱 + 資金弱：都沒動靜
}


def add_sector_cpd(df):
    """CPD = Z(法人金額) - Z(SectorPoint)，當日跨分組（板塊或產業鏈）做橫斷面
    Z-score，再依 (point, capital) 正負分四象限。CPD 越正代表「資金比價格更早、
    更用力」。注意：分組數通常只有 10-30 個，Z-score 是小樣本相對排名，不是嚴謹
    統計顯著性，只拿來做粗略的「相對於今天其他組別」象限分類，不代表絕對強弱門檻。
    輸入 df 只要求有 'point' 欄位；'inst_net_20d_est_NTD_M' 缺值當 0 處理（例如
    法人資料整批抓取失敗），不讓單一分組的缺資料拖垮整批 Z-score 計算。
    """
    df = df.copy()
    if df.empty:
        for col in ("z_point", "z_capital", "cpd", "cpd_quadrant"):
            df[col] = pd.Series(dtype="object")
        return df

    def _z(series):
        std = series.std()
        if not std or std != std or std == 0:
            return pd.Series([0.0] * len(series), index=series.index)
        return (series - series.mean()) / std

    z_point = _z(df["point"])
    capital = df["inst_net_20d_est_NTD_M"].fillna(0.0) if "inst_net_20d_est_NTD_M" in df.columns else pd.Series([0.0] * len(df), index=df.index)
    z_capital = _z(capital)

    df["z_point"] = z_point.round(2)
    df["z_capital"] = z_capital.round(2)
    df["cpd"] = (z_capital - z_point).round(2)
    df["cpd_quadrant"] = [
        CPD_QUADRANT[(p > 0, c > 0)] for p, c in zip(z_point, z_capital)
    ]
    return df


# Transition Sensor 用的敘事排序：不代表 CPD 兩個維度真的線性相關，只是把「這個
# 分組離『資金價格雙確認』有多近」編成一個可以比較前後兩天的分數。
TRANSITION_ORDER = {
    "❄️ Weak": 0,
    "⚠️ Price Leading": 1,
    "💰 Capital Leading": 2,
    "🚀 Confirmed": 3,
}
TRANSITION_DIR_ICON = {"ADVANCING": "🔼", "REVERSING": "🔽", "STEADY": "→", "NEW": "·"}
# 連續兩天都是 Confirmed，但寬度掉超過這個百分點 → 判定過熱/出貨徵兆，即使 CPD
# 象限本身還沒翻轉（象限翻轉通常已經晚了，這裡是想抓早一步的退燒訊號）。
OVERHEAT_BREADTH_DROP_PCT = 15
# backfill 回填幾個交易日的歷史 scorecard，讓 Transition Sensor 第一次執行就有
# 真實資料可比，不用等「明天」——用的是本來就抓好的歷史，不多打一次 API。
TRANSITION_BACKFILL_DAYS = 10


def add_transition_sensor(df, as_of, group_col="sector", glob_pattern="tw_*_scorecard.csv",
                           outdir="data/sector_rotation"):
    """Transition Sensor：不只問「今天在哪個 CPD 象限」，追蹤「昨天 → 今天」這個
    分組（板塊或產業鏈，由 group_col 決定）的象限移動方向——這比單純排名更早看出
    「正在往資金價格雙確認移動」還是「正在退燒」。讀歷史 glob_pattern 存檔找最近
    一份「今天以前」的當作前一交易日（cpd_quadrant 欄位是這批改版才加的，更早的
    存檔沒有這欄，會被當成沒有前一日資料，不是錯誤）。

    market_state 疊加一個過熱判定：連續兩天都是 🚀 Confirmed，但寬度掉了超過
    OVERHEAT_BREADTH_DROP_PCT 個百分點——資金/價格都還沒轉弱到象限翻轉，但參與
    的股票已經在減少，比等 CPD 象限真的翻轉才示警更早一步。
    """
    df = df.copy()
    if df.empty:
        for col in ("prev_cpd_quadrant", "transition_label", "transition_dir", "market_state"):
            df[col] = pd.Series(dtype="object")
        return df

    files = sorted(glob.glob(os.path.join(outdir, glob_pattern)))
    stamp_today = as_of.replace("-", "")
    files = [f for f in files if stamp_today not in os.path.basename(f)]

    prev_quadrant, prev_breadth = {}, {}
    if files:
        try:
            prev_df = pd.read_csv(files[-1])
            if "cpd_quadrant" in prev_df.columns and group_col in prev_df.columns:
                prev_quadrant = dict(zip(prev_df[group_col], prev_df["cpd_quadrant"]))
            if "breadth_pct" in prev_df.columns and group_col in prev_df.columns:
                prev_breadth = dict(zip(prev_df[group_col], prev_df["breadth_pct"]))
        except Exception:
            pass

    def _row(r):
        group = r[group_col]
        curr_q = r.get("cpd_quadrant")
        prev_q = prev_quadrant.get(group)
        if not prev_q or prev_q != prev_q:
            return pd.Series({
                "prev_cpd_quadrant": None,
                "transition_label": "(無前一日資料)",
                "transition_dir": "NEW",
                "market_state": curr_q,
            })

        curr_score = TRANSITION_ORDER.get(curr_q)
        prev_score = TRANSITION_ORDER.get(prev_q)
        if curr_score is None or prev_score is None:
            direction = "NEW"
        else:
            diff = curr_score - prev_score
            direction = "ADVANCING" if diff > 0 else ("REVERSING" if diff < 0 else "STEADY")

        market_state = curr_q
        if curr_q == "🚀 Confirmed" and prev_q == "🚀 Confirmed":
            pb, cb = prev_breadth.get(group), r.get("breadth_pct")
            if (pb is not None and pb == pb and cb is not None and cb == cb
                    and (pb - cb) >= OVERHEAT_BREADTH_DROP_PCT):
                market_state = "🔥 Overheated"

        label = f"{curr_q}（持平）" if prev_q == curr_q else f"{prev_q} → {curr_q}"
        return pd.Series({
            "prev_cpd_quadrant": prev_q,
            "transition_label": label,
            "transition_dir": direction,
            "market_state": market_state,
        })

    trans = df.apply(_row, axis=1)
    return pd.concat([df, trans], axis=1)
