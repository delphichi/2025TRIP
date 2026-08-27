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
import math
import argparse
from datetime import datetime, date, timezone, timedelta

import pandas as pd


# 全域 AS_OF · 由 main() 從 CLI 設定 · None = 用 yfinance 最新資料（今天 T-1）
AS_OF_DATE = None  # type: ignore[assignment]


def _yf_window(months):
    """把「拉多長」轉成 yf.download 的 kwargs · 依有無 AS_OF_DATE 切 period / start+end"""
    if AS_OF_DATE is None:
        return {"period": f"{months}mo"}
    end = AS_OF_DATE + timedelta(days=1)  # yfinance end 是 exclusive
    start = AS_OF_DATE - timedelta(days=int(months * 31))
    return {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}


def _cutoff_date():
    """回傳「不能超過的日期」· 有 AS_OF_DATE 用它 · 沒有用今天 UTC"""
    return AS_OF_DATE if AS_OF_DATE is not None else datetime.now(timezone.utc).date()


def _json_safe(obj):
    """
    遞迴把 NaN / +Inf / -Inf 換成 None
    · Python json 預設寫出 bare NaN → 瀏覽器 JSON.parse 直接爆
    · pandas 的 df.where(pd.notna, None) 對 numeric column 因 dtype 又轉回 NaN
    · 唯一保證乾淨的做法：寫檔前再 walk 一次整個結構
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "scorecard_latest.json")

# 加速度 & 象限（Layer 1.5 · 借鑒付費研報四象限）
# 讀最近 N 天歷史 scorecard 算 point 移動平均 · acceleration = today - avg
ACCEL_LOOKBACK_DAYS = 5
QUADRANT_MAP = {
    ("high", "up"):   {"key": "leading",   "zh": "領先",  "desc": "資金持續流入、動能未退"},
    ("high", "down"): {"key": "weakening", "zh": "減弱",  "desc": "高位但動能見頂"},
    ("low",  "up"):   {"key": "improving", "zh": "改善",  "desc": "落後股翻轉候選"},
    ("low",  "down"): {"key": "lagging",   "zh": "落後",  "desc": "資金持續流出"},
}


def add_historical_percentiles(df, as_of):
    """對每個 sector 算 point 在過去 30/90/365 天內的百分位（今天贏過多少比例的日子）
    · 資料不足時填 None + n_days_actual 表示樣本數"""
    import glob
    files = sorted(glob.glob(os.path.join(OUTDIR, "*_scorecard.csv")))
    stamp_today = as_of.replace("-", "")
    files = [f for f in files if stamp_today not in os.path.basename(f)]

    if not files:
        for w in [30, 90, 365]:
            df[f"pct_{w}d"] = None
            df[f"n_{w}d"] = 0
        return df

    # 讀所有歷史 · 集中成一個大 df with sector + point + date
    hist_frames = []
    for fp in files:
        try:
            h = pd.read_csv(fp, usecols=["sector", "point"])
            h["file_date"] = os.path.basename(fp).split("_")[0]  # YYYYMMDD
            hist_frames.append(h)
        except Exception:
            continue
    if not hist_frames:
        for w in [30, 90, 365]:
            df[f"pct_{w}d"] = None
            df[f"n_{w}d"] = 0
        return df
    hist = pd.concat(hist_frames, ignore_index=True)
    hist["file_date"] = pd.to_datetime(hist["file_date"], format="%Y%m%d")
    today = pd.to_datetime(as_of.replace("-", ""), format="%Y%m%d")

    df = df.copy()
    for w in [30, 90, 365]:
        cutoff = today - pd.Timedelta(days=w)
        window = hist[hist["file_date"] >= cutoff]
        pct_col = f"pct_{w}d"
        n_col = f"n_{w}d"
        pcts, ns = [], []
        for _, row in df.iterrows():
            sec = row["sector"]
            pt = row["point"]
            sec_hist = window[window["sector"] == sec]["point"].dropna()
            n = len(sec_hist)
            if n == 0 or pd.isna(pt):
                pcts.append(None); ns.append(int(n)); continue
            below = (sec_hist < pt).sum()
            # 有等於就用中間點更公平
            equal = (sec_hist == pt).sum()
            pct = round(100 * (below + 0.5 * equal) / n, 1)
            pcts.append(pct); ns.append(int(n))
        df[pct_col] = pcts
        df[n_col] = ns
    return df


def add_sector_breadth(df, as_of):
    """讀同日或最近的 *_all.csv · 每 sector 算 breadth = 4W>0 股數 / 板塊總股數
    · stage 2 通常週跑 · 若當日沒 all.csv 就回退到最近的一個（≤ 14 天）"""
    import glob
    stamp = as_of.replace("-", "")
    all_fp = os.path.join(OUTDIR, f"{stamp}_all.csv")
    breadth_source_date = None
    if not os.path.exists(all_fp):
        # fallback: 找 ≤ as_of 且不超過 14 天的最近 all.csv
        today_dt = pd.to_datetime(stamp, format="%Y%m%d")
        candidates = []
        for fp in sorted(glob.glob(os.path.join(OUTDIR, "*_all.csv"))):
            d_str = os.path.basename(fp).split("_")[0]
            d_dt = pd.to_datetime(d_str, format="%Y%m%d")
            delta_days = (today_dt - d_dt).days
            if 0 <= delta_days <= 14:
                candidates.append((delta_days, fp, d_str))
        if not candidates:
            df["breadth_pct"] = None
            df["breadth_up"] = None
            df["breadth_total"] = None
            df["breadth_source_date"] = None
            return df
        candidates.sort(key=lambda x: x[0])
        all_fp = candidates[0][1]
        breadth_source_date = candidates[0][2]
        log(f"  breadth: 用回退 all.csv = {breadth_source_date}（差 {candidates[0][0]} 天）")
    try:
        a = pd.read_csv(all_fp, usecols=["sector", "cum_ret_4w"])
    except Exception:
        df["breadth_pct"] = None
        df["breadth_up"] = None
        df["breadth_total"] = None
        return df

    # 板塊名對照：scorecard 用 sector_name_en (e.g. "Information Technology")
    # all.csv 的 sector 欄也是 sector_name_en · 用它直接 groupby
    stats = a.groupby("sector").agg(
        breadth_up=("cum_ret_4w", lambda x: int((x.dropna().astype(float) > 0).sum())),
        breadth_total=("cum_ret_4w", lambda x: int(x.dropna().count())),
    ).reset_index()
    stats["breadth_pct"] = (100 * stats["breadth_up"] / stats["breadth_total"]).round(1)

    df = df.copy()
    # scorecard df 有 sector (like "XLK") 與 sector_name_en (like "Information Technology")
    if "sector_name_en" in df.columns:
        merge_key = "sector_name_en"
    else:
        merge_key = "sector"
    stats_map = stats.set_index("sector")
    df["breadth_pct"] = df[merge_key].map(stats_map["breadth_pct"])
    df["breadth_up"] = df[merge_key].map(stats_map["breadth_up"])
    df["breadth_total"] = df[merge_key].map(stats_map["breadth_total"])
    if breadth_source_date:
        # 標記回退來源日期（前端 tooltip 可提示 "資料 N 天前"）
        df["breadth_source_date"] = f"{breadth_source_date[:4]}-{breadth_source_date[4:6]}-{breadth_source_date[6:8]}"
    else:
        df["breadth_source_date"] = as_of
    return df


def add_sector_health_tag(df):
    """依 pct_365d + acceleration + breadth 分 5+1 級健康度標籤
    · 借鑒付費研報「過熱 / 甜蜜點 / 蓄勢 / 反轉初期」的訊號分層概念
    · 但下沉到板塊層（他們是個股層）· 用 percentile + acc 代替 RSI + MA"""
    HEALTH_TAGS = {
        "overheated":     {"emoji": "🔥", "zh": "過熱",   "desc": "365d 極值 + 動能已見頂 · 慎防修正"},
        "sweet_spot":     {"emoji": "✨", "zh": "甜蜜點", "desc": "強而未累 · 仍在加速 · 順勢區間"},
        "early_reversal": {"emoji": "🌱", "zh": "反轉初期", "desc": "低位 + 加速轉正 · 潛在翻轉候選"},
        "coiling":        {"emoji": "💤", "zh": "蓄勢",   "desc": "動能靜止 · 中段整理 · 等方向"},
        "cold":           {"emoji": "🧊", "zh": "冷凍",   "desc": "365d 低位 + 仍在下降 · 資金持續流出"},
        "neutral":        {"emoji": "➡️", "zh": "中性",   "desc": "無明顯訊號"},
    }

    def classify(row):
        p = row.get("pct_365d")
        acc = row.get("acceleration")
        if p is None or pd.isna(p) or acc is None or pd.isna(acc):
            return "neutral"
        # 優先順序（第一個匹配的贏）
        if p >= 85 and acc <= 0:
            return "overheated"
        if p <= 20 and acc <= 0:
            return "cold"
        if p >= 60 and acc >= 1.5:
            return "sweet_spot"
        if p <= 40 and acc >= 1.5:
            return "early_reversal"
        if abs(acc) <= 1 and 30 <= p <= 75:
            return "coiling"
        return "neutral"

    df = df.copy()
    keys = df.apply(classify, axis=1)
    df["health_key"] = keys
    df["health_emoji"] = keys.map(lambda k: HEALTH_TAGS[k]["emoji"])
    df["health_zh"] = keys.map(lambda k: HEALTH_TAGS[k]["zh"])
    df["health_desc"] = keys.map(lambda k: HEALTH_TAGS[k]["desc"])
    return df


def add_acceleration_and_quadrant(df, as_of):
    """讀過去 N 天的 scorecard CSV · 計算 point 5d 平均 → acceleration → quadrant"""
    import glob
    files = sorted(glob.glob(os.path.join(OUTDIR, "*_scorecard.csv")))
    # 排除今天的（若已存在）
    stamp_today = as_of.replace("-", "")
    files = [f for f in files if stamp_today not in os.path.basename(f)]
    # 取最近 N 個
    recent = files[-ACCEL_LOOKBACK_DAYS:]

    if not recent:
        # 沒歷史 · 全部 NaN
        df["point_5d_avg"] = None
        df["acceleration"] = None
        df["quadrant"] = None
        df["quadrant_zh"] = None
        df["quadrant_desc"] = None
        return df, None

    # 讀歷史 · 按 sector 聚合 point 平均
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
    avg_by_sec = hist.groupby("sector")["point"].mean().to_dict()

    df = df.copy()
    df["point_5d_avg"] = df["sector"].map(avg_by_sec).round(2)
    df["acceleration"] = (df["point"] - df["point_5d_avg"]).round(2)

    # 象限分類：point 用中位數切高低 · acceleration 用 0 切正負
    point_median = float(df["point"].median())
    def classify(row):
        pt = row["point"]
        acc = row["acceleration"]
        if pd.isna(acc):
            return {"key": None, "zh": None, "desc": None}
        h_l = "high" if pt >= point_median else "low"
        u_d = "up" if acc > 0 else "down"
        return QUADRANT_MAP[(h_l, u_d)]
    quad = df.apply(classify, axis=1)
    df["quadrant"] = quad.apply(lambda x: x["key"])
    df["quadrant_zh"] = quad.apply(lambda x: x["zh"])
    df["quadrant_desc"] = quad.apply(lambda x: x["desc"])

    # 找出今日最大位移（|acceleration| 最大 · 且有 quadrant 變化的 sector）
    biggest = None
    valid = df[df["acceleration"].notna()].copy()
    if len(valid):
        idx = valid["acceleration"].abs().idxmax()
        row = valid.loc[idx]
        biggest = {
            "sector": row["sector"],
            "sector_name": row["sector_name"],
            "point": float(row["point"]),
            "point_5d_avg": float(row["point_5d_avg"]),
            "acceleration": float(row["acceleration"]),
            "quadrant": row["quadrant"],
            "quadrant_zh": row["quadrant_zh"],
        }
    return df, biggest

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

# 市場環境（VOO / VIX / ^TNX）配置上限對照表（策略 A · Step 1）
# key = f"{vs_50ma_label}+{trend_label}"
ALLOCATION_MATRIX = {
    "🔥+🟢": {"core": 40, "momentum": 35, "sprint": 15, "cash": 10},
    "🔥+🔴": {"core": 30, "momentum": 25, "sprint": 10, "cash": 35},
    "🟡+🟢": {"core": 30, "momentum": 25, "sprint": 0,  "cash": 45},
    "🟡+🔴": {"core": 20, "momentum": 15, "sprint": 0,  "cash": 65},
    "❄+🟢": {"core": 20, "momentum": 0,  "sprint": 0,  "cash": 80},
    "❄+🔴": {"core": 0,  "momentum": 0,  "sprint": 0,  "cash": 100},
}
VIX_STOP_LEVEL = 30       # VIX > 30 → 覆蓋所有象限，全倉現金
TNX_HIGH_LEVEL = 4.0      # TNX > 4% → 利多能源/金融/醫療 · 利空科技/REIT/公用
TNX_LOW_LEVEL = 3.0       # TNX < 3% → 利多科技 · 利空能源/金融

# TNX 高低對 sector 的影響（策略 A · Step 2）
TNX_HIGH_BOOST = ["XLE", "XLF", "XLV"]
TNX_HIGH_PENALTY = ["XLK", "XLRE", "XLU"]
TNX_LOW_BOOST = ["XLK"]
TNX_LOW_PENALTY = ["XLE", "XLF"]


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
        tickers, interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
        **_yf_window(9),
    )
    log(f"Fetching weekly data for {len(tickers)} sector ETFs...")
    weekly = yf.download(
        tickers, interval="1wk",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
        **_yf_window(9),
    )
    # T-1 保護：擋掉「今天」的 partial bar
    # 盤中跑（US 09:30-16:00 ET）yfinance 會回傳當日的日內 partial 資料
    # 我們要 T-1 完整收盤 · 所以 filter 掉 date >= today (UTC / ET 都比較保守)
    # 若 AS_OF_DATE 有設 · 也擋掉 > as_of 的 bar
    daily = _drop_today_bar(daily, "daily")
    weekly = _drop_today_bar(weekly, "weekly")
    return daily, weekly


def _drop_today_bar(df_bulk, label):
    """把 index 日期是「今天或以後」的 row 丟掉 · 保證所有計算用的都是完整收盤
    · 若 AS_OF_DATE 有設 · cutoff 用 as_of（含 as_of 這根 · 擋掉 > as_of 的）"""
    if df_bulk is None or df_bulk.empty:
        return df_bulk
    cutoff = _cutoff_date()
    idx = pd.to_datetime(df_bulk.index)
    # AS_OF 模式：保留 <= as_of · 現況模式：保留 < today
    if AS_OF_DATE is not None:
        mask = idx.date <= cutoff
    else:
        mask = idx.date < cutoff
    dropped = int((~mask).sum())
    if dropped:
        log(f"  · {label}: 擋掉 {dropped} 根 > {cutoff} 的 bar → 剩 {int(mask.sum())} 根")
    return df_bulk.loc[mask]


def extract_ohlcv(df_bulk, ticker):
    if isinstance(df_bulk.columns, pd.MultiIndex):
        if ticker not in df_bulk.columns.get_level_values(0):
            return None
        sub = df_bulk[ticker].copy()
    else:
        sub = df_bulk.copy()
    return sub.dropna(how="all")


# ============================================================
# 1b. 市場環境四象限 + TNX 濾網（策略 A · Step 1 + Step 2）
# ============================================================
def fetch_market_context():
    """
    抓 VOO + VIX + ^TNX · 判定：
      · VOO vs 60d 前 → 多/空頭趨勢 🟢/🔴
      · VOO vs 50MA  → 極強/盤整/寒冬 🔥/🟡/❄
      · VIX 現值    → >30 全倉現金旗標
      · TNX 現值    → >4% / <3% 對板塊加減碼
      · 配置上限對照表 → 核心/動能/衝刺/現金 %
    回傳 dict 給 manifest 用
    """
    import yfinance as yf
    log("Fetching market context (VOO / ^VIX / ^TNX)...")
    tickers = ["VOO", "^VIX", "^TNX"]
    data = yf.download(
        tickers, interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
        **_yf_window(4),
    )
    # 擋掉「今天」的 partial bar
    data = _drop_today_bar(data, "market")

    def _extract(t):
        return extract_ohlcv(data, t)

    voo = _extract("VOO")
    vix = _extract("^VIX")
    tnx = _extract("^TNX")

    ctx = {"as_of_date": None, "voo": None, "vix": None, "tnx": None,
           "trend_label": "?", "vs_50ma_label": "?",
           "quadrant_key": None, "allocation": None,
           "vix_override_all_cash": False,
           "tnx_boost": [], "tnx_penalty": [],
           "notes": []}

    if voo is not None and len(voo) >= 60:
        cur = float(voo["Close"].iloc[-1])
        past = float(voo["Close"].iloc[-61])  # ~60 交易日前
        ma50 = float(voo["Close"].iloc[-50:].mean())
        ctx["as_of_date"] = voo.index[-1].strftime("%Y-%m-%d")
        ctx["voo"] = {"price": round(cur, 2), "vs_60d_pct": round((cur / past - 1) * 100, 2),
                       "ma50": round(ma50, 2), "vs_50ma_pct": round((cur / ma50 - 1) * 100, 2)}
        # 趨勢：VOO 高於 60 日前 = 🟢多頭
        ctx["trend_label"] = "🟢" if cur > past else "🔴"
        # 溫度：VOO 相對 50MA
        vs_ma = (cur / ma50 - 1) * 100
        if vs_ma > 2:
            ctx["vs_50ma_label"] = "🔥"
        elif vs_ma > -2:
            ctx["vs_50ma_label"] = "🟡"
        else:
            ctx["vs_50ma_label"] = "❄"

    if vix is not None and len(vix) > 0:
        vix_cur = float(vix["Close"].iloc[-1])
        ctx["vix"] = {"value": round(vix_cur, 2)}
        ctx["vix_override_all_cash"] = vix_cur > VIX_STOP_LEVEL
        if ctx["vix_override_all_cash"]:
            ctx["notes"].append(f"⛔ VIX={vix_cur:.1f} > {VIX_STOP_LEVEL} · 全倉現金覆蓋所有象限")

    if tnx is not None and len(tnx) > 0:
        # ^TNX 是「10 年公債殖利率 × 100」· 例如 4.2% → 42
        tnx_raw = float(tnx["Close"].iloc[-1])
        tnx_pct = tnx_raw / 10.0 if tnx_raw > 10 else tnx_raw
        ctx["tnx"] = {"value": round(tnx_pct, 2), "raw": round(tnx_raw, 2)}
        if tnx_pct > TNX_HIGH_LEVEL:
            ctx["tnx_boost"] = TNX_HIGH_BOOST
            ctx["tnx_penalty"] = TNX_HIGH_PENALTY
            ctx["notes"].append(f"📈 TNX={tnx_pct:.2f}% > {TNX_HIGH_LEVEL}% · 利多 {'/'.join(TNX_HIGH_BOOST)} · 利空 {'/'.join(TNX_HIGH_PENALTY)}")
        elif tnx_pct < TNX_LOW_LEVEL:
            ctx["tnx_boost"] = TNX_LOW_BOOST
            ctx["tnx_penalty"] = TNX_LOW_PENALTY
            ctx["notes"].append(f"📉 TNX={tnx_pct:.2f}% < {TNX_LOW_LEVEL}% · 利多 {'/'.join(TNX_LOW_BOOST)} · 利空 {'/'.join(TNX_LOW_PENALTY)}")
        else:
            ctx["notes"].append(f"➖ TNX={tnx_pct:.2f}% 介於 {TNX_LOW_LEVEL}-{TNX_HIGH_LEVEL}% · 中性")

    # 決定象限 + 配置上限
    if ctx["trend_label"] != "?" and ctx["vs_50ma_label"] != "?":
        key = f"{ctx['vs_50ma_label']}+{ctx['trend_label']}"
        ctx["quadrant_key"] = key
        base = ALLOCATION_MATRIX.get(key)
        if ctx["vix_override_all_cash"]:
            ctx["allocation"] = {"core": 0, "momentum": 0, "sprint": 0, "cash": 100}
        else:
            ctx["allocation"] = base

    log(f"  · VOO ${ctx['voo']['price'] if ctx['voo'] else '?'} · trend={ctx['trend_label']} vs_50ma={ctx['vs_50ma_label']} · quadrant={ctx['quadrant_key']}")
    log(f"  · VIX={ctx['vix']['value'] if ctx['vix'] else '?'} · TNX={ctx['tnx']['value'] if ctx['tnx'] else '?'}%")
    if ctx["allocation"]:
        a = ctx["allocation"]
        log(f"  · 配置上限：核心 {a['core']}% / 動能 {a['momentum']}% / 衝刺 {a['sprint']}% / 現金 {a['cash']}%")
    return ctx


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
def save_outputs(df, market_ctx=None, quadrant_biggest_mover=None):
    os.makedirs(OUTDIR, exist_ok=True)
    # 檔名用 as_of_date（不是 today）· T-1 基準
    as_of = df["as_of_date"].iloc[0] if len(df) else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")
    csv_path = os.path.join(OUTDIR, f"{stamp}_scorecard.csv")
    df.to_csv(csv_path, index=False)
    log(f"  saved {csv_path}")

    # 為每個 sector 加 TNX / 象限的 boost/penalty 標記
    if market_ctx:
        df = df.copy()
        boost = set(market_ctx.get("tnx_boost", []))
        penalty = set(market_ctx.get("tnx_penalty", []))
        df["tnx_flag"] = df["sector"].apply(
            lambda s: "boost" if s in boost else ("penalty" if s in penalty else None)
        )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "基準日 = 該日最後一根 daily close 的實際日期（T-1）· 例：2026-08-25 = Aug 25 收盤價 · 非腳本執行當日",
        "sector_count": int(len(df)),
        "csv": os.path.basename(csv_path),
        "market_context": market_ctx,
        "quadrant_biggest_mover": quadrant_biggest_mover,
        "quadrant_note": f"acceleration = 今日 point - 過去 {ACCEL_LOOKBACK_DAYS} 天 point 平均 · 象限用 point 中位數 + acceleration 正負分四格",
        "percentile_note": "pct_Nd = 今日 point 在過去 N 天 sector 分數中的百分位 (0-100 · 越大表越極端強)",
        "breadth_note": "breadth_pct = 該 sector 個股中 4W 累報 > 0 的比例（讀同日 stage 2 all.csv）",
        "health_note": "health_key: overheated(🔥) / sweet_spot(✨) / early_reversal(🌱) / coiling(💤) / cold(🧊) / neutral(➡️) · 用 pct_365d + acceleration + breadth 分層",
        "formulas": {
            "point": "4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）",
            "cms_a": "0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）",
            "di": "((4W>0)+(13W>0)+(26W>0))/3；1.0 = 三週期全漲",
            "vp_score": "MIN(100, MAX(0, 20d×200×0.30 + 5d×200×0.20 + VP×50×0.35 + UD×100×0.15 + 50))",
            "composite": "Point_rank×0.40 + vp_score_rank×0.40 + vol_rank×0.20（越小越強）",
            "gap_alert": f"|Point_rank - vp_score_rank| > {GAP_ALERT_THRESHOLD} → 吃老本(漲多動能弱) / 剛爆發(量價強漲幅追不上)",
            "market_regime": "VOO vs 60d → 🟢/🔴 · VOO vs 50MA → 🔥/🟡/❄ · VIX > 30 → 全倉現金",
            "tnx_filter": f"TNX > {TNX_HIGH_LEVEL}% → 利多 {TNX_HIGH_BOOST}·利空 {TNX_HIGH_PENALTY} · TNX < {TNX_LOW_LEVEL}% → 利多 {TNX_LOW_BOOST}·利空 {TNX_LOW_PENALTY}",
        },
        "rows": df.where(pd.notna(df), None).to_dict(orient="records"),
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"  saved manifest {MANIFEST_PATH}")


# ============================================================
# 5. main
# ============================================================
def main():
    global AS_OF_DATE
    parser = argparse.ArgumentParser(description="11 類 Sector ETF 量價評分排行")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · 用 YYYY-MM-DD 前一天的 close 為基準（不填 = 用最新）")
    args = parser.parse_args()
    if args.as_of:
        AS_OF_DATE = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        log(f"⏪ 回放模式 · as_of = {AS_OF_DATE}")

    daily, weekly = fetch_data()

    # 市場環境（策略 A · Step 1 + Step 2）
    try:
        market_ctx = fetch_market_context()
    except Exception as e:
        log(f"⚠ 市場環境抓取失敗（不影響 sector 評分）: {e}")
        market_ctx = None

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
    # 加歷史百分位 (30/90/365d)
    df = add_historical_percentiles(df, as_of)
    # 加板塊 breadth (該日 stage 2 資料的 % up)
    df = add_sector_breadth(df, as_of)
    # 加 acceleration + quadrant（Layer 1.5）
    df, biggest_mover = add_acceleration_and_quadrant(df, as_of)
    # 加健康度標籤（D · 過熱/甜蜜點/蓄勢/反轉初期/冷凍）
    df = add_sector_health_tag(df)
    if biggest_mover:
        log(f"  📍 最大位移: {biggest_mover['sector']} {biggest_mover['sector_name']} · "
            f"point {biggest_mover['point']:.1f} · acc {biggest_mover['acceleration']:+.1f} · "
            f"象限 {biggest_mover['quadrant_zh']}")
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

    save_outputs(df, market_ctx=market_ctx, quadrant_biggest_mover=biggest_mover)


if __name__ == "__main__":
    main()
