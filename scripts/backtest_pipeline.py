#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline backtest · scripts/backtest_pipeline.py
=====================================================================
在指定歷史日期執行同一套規則 · 立刻拿到 1m/3m/6m/1y 真實 forward returns

用法：
  python scripts/backtest_pipeline.py --as-of 2025-07-31
  python scripts/backtest_pipeline.py --as-of 2025-07-31 --dry

輸出：
  portfolios/backtest_YYYY-MM-DD.json   格式與 live picks 相同 · 4 個 checkpoint 全填好

流程：
  1. 抓 2 年 daily（as-of 前 1y 算指標 + 後 1y 算 forward return）
  2. 抓 VOO/VIX/TNX 判定當時市場環境
  3. slice 資料到 as_of · 計算 sector scorecard + 個股 composite
  4. 依規則 pick portfolio（同 live 版）
  5. 用已知未來價格算 1m/3m/6m/1y forward returns（含 VOO 基準）
  6. 存 portfolios/backtest_*.json

已知限制：
  · S&P 500 成分股用「今天」的清單（過去 delisted 的個股會漏 · survivorship bias · 但 demo 可接受）
  · 未計股利 / 費用 / 稅務 / 滑價 · 純 price return
"""
import os
import sys
import json
import math
import argparse
from datetime import datetime, date, timedelta, timezone
from io import StringIO

import pandas as pd
import requests

# 重用 screener 的計算邏輯 · 避免重複實作
sys.path.insert(0, "scripts")
from sector_rotation_screener import (
    fetch_sp500_constituents,
    compute_vcp_row,
    _compute_vp_score_stock,
)

OUTDIR = "portfolios"
YF_BATCH = 80

SECTORS = [
    ("XLK", "資訊科技", "Information Technology"),
    ("XLE", "能源", "Energy"),
    ("XLF", "金融", "Financials"),
    ("XLV", "醫療保健", "Health Care"),
    ("XLY", "非必需消費", "Consumer Discretionary"),
    ("XLP", "必需消費", "Consumer Staples"),
    ("XLI", "工業", "Industrials"),
    ("XLU", "公用事業", "Utilities"),
    ("XLB", "材料", "Materials"),
    ("XLRE", "房地產", "Real Estate"),
    ("XLC", "通訊服務", "Communication Services"),
]
GICS_TO_ETF = {name: etf for etf, _, name in SECTORS}
TNX_HIGH, TNX_LOW = 4.0, 3.0
TNX_HIGH_BOOST = ["XLE", "XLF", "XLV"]
TNX_HIGH_PENALTY = ["XLK", "XLRE", "XLU"]
TNX_LOW_BOOST = ["XLK"]
TNX_LOW_PENALTY = ["XLE", "XLF"]
ALLOCATION_MATRIX = {
    "🔥+🟢": {"core": 40, "momentum": 35, "sprint": 15, "cash": 10},
    "🔥+🔴": {"core": 30, "momentum": 25, "sprint": 10, "cash": 35},
    "🟡+🟢": {"core": 30, "momentum": 25, "sprint": 0, "cash": 45},
    "🟡+🔴": {"core": 20, "momentum": 15, "sprint": 0, "cash": 65},
    "❄+🟢": {"core": 20, "momentum": 0, "sprint": 0, "cash": 80},
    "❄+🔴": {"core": 0, "momentum": 0, "sprint": 0, "cash": 100},
}


def _json_safe(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 資料抓取（一次抓完 · 之後 slice 用）
# ============================================================
def fetch_all_daily(tickers, start_date, end_date):
    """抓所有 ticker 從 start 到 end 的 daily · 回傳 dict[sym → DataFrame]"""
    import yfinance as yf
    log(f"Fetching daily {start_date} → {end_date} for {len(tickers)} tickers...")
    out = {}
    for i in range(0, len(tickers), YF_BATCH):
        chunk = tickers[i : i + YF_BATCH]
        data = yf.download(
            chunk, start=start_date.isoformat(), end=(end_date + timedelta(days=1)).isoformat(),
            interval="1d", auto_adjust=True, progress=False, threads=True, group_by="ticker",
        )
        if isinstance(data.columns, pd.MultiIndex):
            for t in chunk:
                if t in data.columns.get_level_values(0):
                    sub = data[t].dropna(how="all")
                    if len(sub):
                        out[t] = sub
        else:
            sub = data.dropna(how="all")
            if len(sub):
                out[chunk[0]] = sub
        if (i // YF_BATCH + 1) % 3 == 0:
            log(f"  progress: {min(i + YF_BATCH, len(tickers))}/{len(tickers)}")
    log(f"  → {len(out)} tickers fetched")
    return out


def slice_to_asof(daily_dict, as_of):
    """把每個 DataFrame 只留 index <= as_of 的 row"""
    out = {}
    for sym, df in daily_dict.items():
        sub = df.loc[pd.to_datetime(df.index).date <= as_of]
        if len(sub):
            out[sym] = sub
    return out


def price_at_or_after(df, target_date):
    """
    回傳 target_date 或之後最近的 close price
    · 若 target_date 是週末/假日 → 取隔天最近的 close
    · 若 target_date 超過資料範圍 → 回 None
    """
    if df is None or df.empty:
        return None, None
    idx = pd.to_datetime(df.index).date
    valid = df.loc[idx >= target_date]
    if valid.empty:
        return None, None
    d = valid.index[0].strftime("%Y-%m-%d")
    return d, float(valid["Close"].iloc[0])


# ============================================================
# 市場環境（VOO + VIX + TNX at as_of）
# ============================================================
def compute_market_context(voo, vix, tnx, as_of):
    v_sub = voo.loc[pd.to_datetime(voo.index).date <= as_of] if voo is not None else None
    if v_sub is None or len(v_sub) < 60:
        return None
    cur = float(v_sub["Close"].iloc[-1])
    past = float(v_sub["Close"].iloc[-61])
    ma50 = float(v_sub["Close"].iloc[-50:].mean())
    vs_60d = (cur / past - 1) * 100
    vs_50ma = (cur / ma50 - 1) * 100
    trend = "🟢" if cur > past else "🔴"
    if vs_50ma > 2: heat = "🔥"
    elif vs_50ma > -2: heat = "🟡"
    else: heat = "❄"

    vix_val = None
    if vix is not None:
        vix_sub = vix.loc[pd.to_datetime(vix.index).date <= as_of]
        if len(vix_sub):
            vix_val = float(vix_sub["Close"].iloc[-1])

    tnx_val = None
    if tnx is not None:
        tnx_sub = tnx.loc[pd.to_datetime(tnx.index).date <= as_of]
        if len(tnx_sub):
            raw = float(tnx_sub["Close"].iloc[-1])
            tnx_val = raw / 10.0 if raw > 10 else raw

    tnx_boost, tnx_penalty = [], []
    if tnx_val is not None:
        if tnx_val > TNX_HIGH:
            tnx_boost, tnx_penalty = TNX_HIGH_BOOST, TNX_HIGH_PENALTY
        elif tnx_val < TNX_LOW:
            tnx_boost, tnx_penalty = TNX_LOW_BOOST, TNX_LOW_PENALTY

    key = f"{heat}+{trend}"
    allocation = ALLOCATION_MATRIX.get(key)
    if vix_val is not None and vix_val > 30:
        allocation = {"core": 0, "momentum": 0, "sprint": 0, "cash": 100}

    return {
        "as_of_date": as_of.isoformat(),
        "quadrant": key,
        "trend_label": trend,
        "vs_50ma_label": heat,
        "voo": {"price": round(cur, 2), "vs_60d_pct": round(vs_60d, 2),
                 "ma50": round(ma50, 2), "vs_50ma_pct": round(vs_50ma, 2)},
        "vix": vix_val,
        "tnx_pct": tnx_val,
        "tnx_boost_sectors": tnx_boost,
        "tnx_penalty_sectors": tnx_penalty,
        "allocation_caps": allocation,
    }


# ============================================================
# 個股 metric + 綜合分（as_of 版）
# ============================================================
def compute_stock_metrics_at(sub, as_of):
    """
    對單一 stock 從 sliced daily 算全套指標
    · 需要至少 130 個交易日（26 週 × 5）
    """
    if sub is None or len(sub) < 130:
        return None
    close = sub["Close"].dropna()
    if len(close) < 130:
        return None

    # 週線報酬（用 daily 資料 · 每 5 個交易日 ≈ 1 週）
    t_price = float(close.iloc[-1])
    # 4W / 13W / 26W 用交易日：≈20 / 65 / 130
    def _ret(n_days):
        if len(close) < n_days + 1:
            return None
        return (close.iloc[-1] / close.iloc[-n_days - 1] - 1) * 100
    r4 = _ret(20)
    r13 = _ret(65)
    r26 = _ret(130)
    if any(x is None for x in (r4, r13, r26)):
        return None

    point = r4 * 0.25 + r13 * 0.25 + r26 * 0.50
    di = ((1 if r4 > 0 else 0) + (1 if r13 > 0 else 0) + (1 if r26 > 0 else 0)) / 3.0

    # VCP + 高點 + daily 指標（重用 compute_vcp_row · 需 dict 格式）
    vcp = compute_vcp_row("temp", sub)
    if vcp is None:
        return None
    del vcp["symbol"]

    return {
        "t_price": round(t_price, 2),
        "cum_ret_4w": round(r4, 2),
        "cum_ret_13w": round(r13, 2),
        "cum_ret_26w": round(r26, 2),
        "point": round(point, 2),
        "di": round(di, 3),
        **vcp,
    }


def add_sector_composite(records):
    """按 sector 內部算 point / vp_score / vol 排名 + composite"""
    df = pd.DataFrame(records)
    if df.empty:
        return df
    for col_val, col_rank in [("point", "point_rank_in_sector"),
                                ("vp_score_stock", "vp_score_rank_in_sector"),
                                ("vol_ratio_stock_20d", "vol_rank_in_sector")]:
        df[col_rank] = df.groupby("sector")[col_val].rank(
            method="min", ascending=False, na_option="bottom"
        ).astype("Int64")
    has_vp = df["vp_score_stock"].notna()
    df["composite_in_sector"] = None
    df.loc[has_vp, "composite_in_sector"] = (
        df.loc[has_vp, "point_rank_in_sector"] * 0.4
        + df.loc[has_vp, "vp_score_rank_in_sector"] * 0.4
        + df.loc[has_vp, "vol_rank_in_sector"] * 0.2
    ).round(2)
    df["composite_rank_in_sector"] = df.groupby("sector")["composite_in_sector"].rank(
        method="min", ascending=True, na_option="bottom"
    ).astype("Int64")
    return df


# ============================================================
# 挑倉位（同 live pick 規則的簡化版）
# ============================================================
VARIANT_RULES = {
    # baseline: 最嚴 · 對應 live pipeline
    "baseline": {"require_di_full": True,  "composite_max_rank": 3, "per_sector_max": 1},
    # 實驗 A: 拿掉 di=1.0 · 其他保持 baseline
    "expA":     {"require_di_full": False, "composite_max_rank": 3, "per_sector_max": 1},
    # 實驗 B: 保留 di=1.0 · 放寬 composite + 分散
    "expB":     {"require_di_full": True,  "composite_max_rank": 5, "per_sector_max": 2},
    # 實驗 C: 兩個都放寬（A + B 合體）
    "expC":     {"require_di_full": False, "composite_max_rank": 5, "per_sector_max": 2},
}


def build_portfolio_picks(df, market_ctx, variant="baseline"):
    """規則按 VARIANT_RULES 設定"""
    rules = VARIANT_RULES.get(variant, VARIANT_RULES["baseline"])
    if df.empty or not market_ctx:
        return {"core": [], "momentum": [], "cash_reason": "no data"}

    alloc = market_ctx.get("allocation_caps") or {}
    tnx_boost = set(market_ctx.get("tnx_boost_sectors") or [])
    etf_to_gics = {etf: name for name, etf in GICS_TO_ETF.items()}
    tnx_boost_gics = {etf_to_gics[e] for e in tnx_boost if e in etf_to_gics}

    # 核心：VCP + 距高<-5% + VP>1（+ 視 variant 加 di=1.0）
    core_mask = (
        (df["vcp"] == True)
        & (df["pct_from_high"] > -5)
        & (df["vp_ratio_stock"] > 1.0)
    )
    if rules["require_di_full"]:
        core_mask = core_mask & (df["di"] == 1.0)
    core_cands = df[core_mask].copy().sort_values("composite_in_sector", na_position="last")

    # 動能：TNX順風 + VP>=1 + 4W正 + composite top N（+ 視 variant 加 di=1.0）
    momentum_mask = (
        (df["sector"].isin(tnx_boost_gics))
        & (df["vp_ratio_stock"] >= 1.0)
        & (df["cum_ret_4w"] > 0)
        & (df["composite_rank_in_sector"] <= rules["composite_max_rank"])
    )
    if rules["require_di_full"]:
        momentum_mask = momentum_mask & (df["di"] == 1.0)
    momentum_cands = df[momentum_mask].copy().sort_values(
        ["sector", "composite_in_sector"], na_position="last"
    )
    momentum_picks = momentum_cands.groupby("sector").head(rules["per_sector_max"]).reset_index(drop=True)

    # 核心最多 3 檔 · 避免 over-concentrated（單一 VCP 15%）
    core_picks = core_cands.head(3)

    # 權重分配
    core_cap = alloc.get("core", 0)
    momentum_cap = alloc.get("momentum", 0)

    def _weight_list(picks, cap, max_single=15):
        """等權分配 · 但單檔不超過 max_single%"""
        n = len(picks)
        if n == 0 or cap == 0:
            return []
        w = min(round(cap / n, 2), max_single)
        return [w] * n

    core_ws = _weight_list(core_picks, core_cap, max_single=15)
    mom_ws = _weight_list(momentum_picks, momentum_cap, max_single=10)

    return {
        "core": [(row["symbol"], w, row.to_dict()) for (_, row), w in zip(core_picks.iterrows(), core_ws)],
        "momentum": [(row["symbol"], w, row.to_dict()) for (_, row), w in zip(momentum_picks.iterrows(), mom_ws)],
    }


# ============================================================
# Forward returns
# ============================================================
def compute_forward_returns(daily_dict, symbols, as_of):
    """對每個 symbol · 計算 as_of + 1m/3m/6m/1y 的 forward return"""
    checkpoints = {
        "1m": as_of + timedelta(days=30),
        "3m": as_of + timedelta(days=90),
        "6m": as_of + timedelta(days=180),
        "1y": as_of + timedelta(days=365),
    }
    out = {}
    for sym in symbols:
        df = daily_dict.get(sym)
        if df is None:
            continue
        # entry price = as_of 當天或最近之前的 close
        entry_sub = df.loc[pd.to_datetime(df.index).date <= as_of]
        if entry_sub.empty:
            continue
        entry_price = float(entry_sub["Close"].iloc[-1])
        rec = {"entry_price": round(entry_price, 2), "checkpoints": {}}
        for cp_name, cp_date in checkpoints.items():
            d, px = price_at_or_after(df, cp_date)
            if px is None:
                rec["checkpoints"][cp_name] = {"date": None, "price": None, "return_pct": None}
            else:
                rec["checkpoints"][cp_name] = {
                    "date": d,
                    "price": round(px, 2),
                    "return_pct": round((px / entry_price - 1) * 100, 2),
                }
        out[sym] = rec
    return out


# ============================================================
# main
# ============================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", required=True, help="回測建倉日 YYYY-MM-DD")
    ap.add_argument("--variant", default="baseline", choices=list(VARIANT_RULES.keys()),
                     help="規則版本 · default baseline")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    as_of = date.fromisoformat(args.as_of)
    log(f"=== Backtest at as_of = {as_of} · variant = {args.variant} ===")
    log(f"    rules = {VARIANT_RULES[args.variant]}")

    # 抓資料：as_of 前 1.5 年 + 後 1.5 年（cover 26W lookback + 1y forward）
    start = as_of - timedelta(days=400)
    end = as_of + timedelta(days=400)
    today = date.today()
    if end > today:
        end = today
    if end - as_of < timedelta(days=30):
        log(f"⚠ end ({end}) 距 as_of ({as_of}) < 30 天 · forward returns 會不完整")

    # 抓 S&P 500 成分股（用今天的清單 · 有 survivorship bias 但 demo 可接受）
    universe = fetch_sp500_constituents()
    sp500_syms = universe["symbol"].tolist()

    # 抓 sector ETF + benchmark + 所有 S&P 500
    aux_syms = [etf for etf, _, _ in SECTORS] + ["VOO", "^VIX", "^TNX", "QQQ"]
    all_syms = list(set(sp500_syms + aux_syms))
    daily = fetch_all_daily(all_syms, start, end)

    # 市場環境
    ctx = compute_market_context(daily.get("VOO"), daily.get("^VIX"), daily.get("^TNX"), as_of)
    log(f"Market: quadrant={ctx['quadrant']} · VIX={ctx['vix']} · TNX={ctx['tnx_pct']}% · alloc={ctx['allocation_caps']}")

    # slice 全部到 as_of · 計算 stock metrics
    sliced = slice_to_asof(daily, as_of)
    stock_records = []
    for sym in sp500_syms:
        m = compute_stock_metrics_at(sliced.get(sym), as_of)
        if m is None:
            continue
        sector = universe[universe["symbol"] == sym]["sector"].values
        if len(sector) == 0:
            continue
        stock_records.append({"symbol": sym, "sector": sector[0], "name": universe[universe["symbol"] == sym]["name"].values[0], **m})
    log(f"Computed metrics for {len(stock_records)} stocks (out of {len(sp500_syms)})")

    df = add_sector_composite(stock_records)

    # 挑倉位
    picks = build_portfolio_picks(df, ctx, variant=args.variant)
    all_syms_picked = [x[0] for x in picks["core"]] + [x[0] for x in picks["momentum"]]
    log(f"Picks: core={len(picks['core'])} · momentum={len(picks['momentum'])} · syms={all_syms_picked}")

    # Forward returns（含 VOO 基準）
    fwd = compute_forward_returns(daily, all_syms_picked + ["VOO", "QQQ"], as_of)

    # 組成 portfolio JSON
    positions = []
    for tier_name, tier_list in [("core", picks["core"]), ("momentum", picks["momentum"])]:
        for sym, w, row in tier_list:
            f = fwd.get(sym, {})
            positions.append({
                "symbol": sym,
                "name": row.get("name"),
                "sector": row.get("sector"),
                "tier": tier_name,
                "weight_pct": w,
                "entry_price": f.get("entry_price"),
                "signals": {k: (None if pd.isna(v) else (int(v) if isinstance(v, (int,))or hasattr(v,'item') and 'int' in str(type(v.item() if hasattr(v,'item') else v)) else v)) for k, v in {
                    "point": row.get("point"),
                    "vp_score_stock": row.get("vp_score_stock"),
                    "vp_ratio_stock": row.get("vp_ratio_stock"),
                    "vcp": row.get("vcp"),
                    "pct_from_high": row.get("pct_from_high"),
                    "cum_ret_4w": row.get("cum_ret_4w"),
                    "cum_ret_13w": row.get("cum_ret_13w"),
                    "cum_ret_26w": row.get("cum_ret_26w"),
                    "composite_rank_in_sector": row.get("composite_rank_in_sector"),
                }.items()},
                "forward_returns": f.get("checkpoints"),
            })

    # portfolio 加權報酬（每個 checkpoint）
    total_weight = sum(p["weight_pct"] for p in positions)
    portfolio_returns = {}
    for cp in ("1m", "3m", "6m", "1y"):
        weighted = 0.0
        counted_w = 0.0
        for p in positions:
            r = (p["forward_returns"] or {}).get(cp, {})
            if r.get("return_pct") is not None:
                weighted += r["return_pct"] * p["weight_pct"]
                counted_w += p["weight_pct"]
        portfolio_returns[cp] = round(weighted / counted_w, 2) if counted_w > 0 else None

    voo_fwd = fwd.get("VOO", {}).get("checkpoints", {})
    qqq_fwd = fwd.get("QQQ", {}).get("checkpoints", {})

    vs_voo = {}
    for cp in ("1m", "3m", "6m", "1y"):
        pr = portfolio_returns.get(cp)
        vr = voo_fwd.get(cp, {}).get("return_pct")
        if pr is not None and vr is not None:
            vs_voo[cp] = int(round((pr - vr) * 100))

    out = {
        "portfolio_id": f"backtest_{as_of.isoformat()}_{args.variant}",
        "entry_date": as_of.isoformat(),
        "variant": args.variant,
        "rules": VARIANT_RULES[args.variant],
        "note": "回測 · pipeline 規則套在歷史資料 · S&P500 用今日清單（有 survivorship bias · demo 可接受）",
        "regime_at_entry": ctx,
        "positions": positions,
        "total_invested_pct": round(total_weight, 2),
        "cash_pct": round(100 - total_weight, 2),
        "checkpoint_returns": {
            "portfolio": portfolio_returns,
            "VOO": {cp: voo_fwd.get(cp, {}).get("return_pct") for cp in ("1m","3m","6m","1y")},
            "QQQ": {cp: qqq_fwd.get(cp, {}).get("return_pct") for cp in ("1m","3m","6m","1y")},
            "vs_voo_bps": vs_voo,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # 印摘要
    log("=" * 78)
    log(f"Backtest picks @ {as_of} · alloc={ctx['allocation_caps']}")
    log("=" * 78)
    for p in positions:
        r1m = (p["forward_returns"] or {}).get("1m", {}).get("return_pct")
        r3m = (p["forward_returns"] or {}).get("3m", {}).get("return_pct")
        r6m = (p["forward_returns"] or {}).get("6m", {}).get("return_pct")
        r1y = (p["forward_returns"] or {}).get("1y", {}).get("return_pct")
        def _fmt(v): return f"{v:+7.2f}%" if v is not None else "   N/A "
        log(f"  {p['symbol']:6s} [{p['tier']:8s}] w={p['weight_pct']:4.1f}%  "
            f"entry=${p['entry_price']:>8.2f}  "
            f"1m={_fmt(r1m)}  3m={_fmt(r3m)}  6m={_fmt(r6m)}  1y={_fmt(r1y)}")

    log("-" * 78)
    log("PORTFOLIO 加權報酬:")
    for cp in ("1m", "3m", "6m", "1y"):
        pr = portfolio_returns.get(cp)
        vr = voo_fwd.get(cp, {}).get("return_pct")
        qr = qqq_fwd.get(cp, {}).get("return_pct")
        vs = vs_voo.get(cp)
        def _fmt(v): return f"{v:+7.2f}%" if v is not None else "   N/A "
        vs_str = f"{vs:+d} bps" if vs is not None else "N/A"
        log(f"  {cp:3s}  portfolio {_fmt(pr)}  · VOO {_fmt(vr)}  · QQQ {_fmt(qr)}  · vs VOO: {vs_str}")

    if args.dry:
        log("(dry mode · 沒寫檔)")
        return

    os.makedirs(OUTDIR, exist_ok=True)
    # 用 rule variant 分檔（不同規則版本互不覆蓋）
    # baseline 用不加 suffix 的檔名 · 其他 variant 加 _{variant} suffix
    if args.variant == "baseline":
        path = os.path.join(OUTDIR, f"backtest_{as_of.isoformat()}.json")
    else:
        path = os.path.join(OUTDIR, f"backtest_{as_of.isoformat()}_{args.variant}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_json_safe(out), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"✅ saved {path}")


if __name__ == "__main__":
    main()
