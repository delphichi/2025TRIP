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
"""
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
