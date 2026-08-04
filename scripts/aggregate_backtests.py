#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
aggregate_backtests.py · 彙整所有 *_top3_composite.csv · 加上 forward returns · 找 pattern
==============================================================================
輸入：data/sector_rotation/*_top3_composite.csv （每個 replay 產出的 composite top 3）
輸出：
  data/sector_rotation/backtests_aggregate.csv    合併所有 sample + forward returns
  data/sector_rotation/backtests_pattern.json     pattern 統計結果

用法：
  python scripts/aggregate_backtests.py
"""
import os, sys, glob, json, math, time
from datetime import datetime, timedelta
from collections import defaultdict
import pandas as pd


OUT_CSV = "data/sector_rotation/backtests_aggregate.csv"
OUT_JSON = "data/sector_rotation/backtests_pattern.json"
CHECKPOINTS = [("1m", 30), ("3m", 91), ("6m", 182), ("1y", 365)]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def find_price_at(series, target_date):
    if series is None or len(series) == 0:
        return None
    idx_dates = pd.to_datetime(series.index).date
    mask = idx_dates >= target_date
    if not mask.any():
        return None
    return float(series.loc[series.index[mask][0]])


def main():
    files = sorted(glob.glob("data/sector_rotation/*_top3_composite.csv"))
    log(f"發現 {len(files)} 個 composite snapshot")

    all_rows = []
    for fp in files:
        df = pd.read_csv(fp)
        df["_source_file"] = os.path.basename(fp)
        all_rows.append(df)
    if not all_rows:
        sys.exit("❌ 沒 snapshot")
    big = pd.concat(all_rows, ignore_index=True)
    log(f"合併 {len(big)} 個 (sample × stock) row")

    # === strong_buy hard rules (8-sample 統計驗證：1y avg +50%+ / hit 90%+) ===
    big["strong_buy"] = (
        (big["composite_rank_in_sector"] == 1)
        & (big["vp_score_stock"] >= 95)
        & (big["stock_gap_alert"] != "吃老本")
    )
    log(f"strong_buy 命中 {int(big['strong_buy'].sum())} / {len(big)} row")

    # unique symbol · 一次抓
    symbols = sorted(big["symbol"].dropna().unique().tolist())
    log(f"unique symbols: {len(symbols)}")
    min_as_of = pd.to_datetime(big["as_of_date"]).min().date()
    max_end = min(datetime.now().date(), pd.to_datetime(big["as_of_date"]).max().date() + timedelta(days=380))
    log(f"yfinance fetch {min_as_of} → {max_end}")

    import yfinance as yf
    data = yf.download(
        symbols, start=min_as_of.strftime("%Y-%m-%d"), end=(max_end + timedelta(days=1)).strftime("%Y-%m-%d"),
        interval="1d", auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    close_by_sym = {}
    if isinstance(data.columns, pd.MultiIndex):
        for s in symbols:
            if s in data.columns.get_level_values(0):
                close_by_sym[s] = data[s]["Close"].dropna()
    else:
        close_by_sym[symbols[0]] = data["Close"].dropna()
    log(f"got close series for {len(close_by_sym)}/{len(symbols)} symbols")

    # 對每 row 算 forward returns
    for lbl, days in CHECKPOINTS:
        big[f"fwd_{lbl}_pct"] = None
        big[f"fwd_{lbl}_date"] = None

    for i, row in big.iterrows():
        sym = row["symbol"]
        as_of = pd.to_datetime(row["as_of_date"]).date()
        cs = close_by_sym.get(sym)
        if cs is None or len(cs) == 0:
            continue
        entry_price = find_price_at(cs, as_of)
        if entry_price is None:
            continue
        big.at[i, "entry_price"] = round(entry_price, 2)
        for lbl, days in CHECKPOINTS:
            target = as_of + timedelta(days=days)
            p = find_price_at(cs, target)
            if p is None:
                continue
            big.at[i, f"fwd_{lbl}_pct"] = round((p / entry_price - 1) * 100, 2)
            big.at[i, f"fwd_{lbl}_date"] = str(pd.to_datetime(target).date())

    # 存 CSV
    big.to_csv(OUT_CSV, index=False)
    log(f"✅ 存 {OUT_CSV} · {len(big)} rows")

    # === Pattern 分析 ===
    patterns = {"total_rows": int(len(big)), "unique_samples": int(big["as_of_date"].nunique()),
                "sample_dates": sorted(big["as_of_date"].unique().tolist()),
                "unique_symbols": int(big["symbol"].nunique())}

    for ck_lbl, _ in CHECKPOINTS:
        col = f"fwd_{ck_lbl}_pct"
        valid = big[big[col].notna()].copy()
        valid[col] = valid[col].astype(float)
        n = len(valid)
        if n == 0:
            continue
        avg = float(valid[col].mean())
        wins = int((valid[col] > 0).sum())

        # By comp_rank
        by_rank = {}
        for rk in sorted(valid["composite_rank_in_sector"].dropna().unique()):
            g = valid[valid["composite_rank_in_sector"] == rk]
            by_rank[int(rk)] = {
                "n": int(len(g)),
                "avg": round(float(g[col].mean()), 2),
                "wins": int((g[col] > 0).sum()),
                "hit_rate_pct": round(100 * (g[col] > 0).mean(), 1),
            }

        # By alert
        by_alert = {}
        for a in ["吃老本", "剛爆發"]:
            g = valid[valid["stock_gap_alert"] == a]
            if len(g) > 0:
                by_alert[a] = {
                    "n": int(len(g)),
                    "avg": round(float(g[col].mean()), 2),
                    "wins": int((g[col] > 0).sum()),
                    "hit_rate_pct": round(100 * (g[col] > 0).mean(), 1),
                }
        # 無警示
        g = valid[valid["stock_gap_alert"].isna() | (valid["stock_gap_alert"] == "")]
        if len(g) > 0:
            by_alert["無"] = {
                "n": int(len(g)),
                "avg": round(float(g[col].mean()), 2),
                "wins": int((g[col] > 0).sum()),
                "hit_rate_pct": round(100 * (g[col] > 0).mean(), 1),
            }

        # By VCP
        vcp_g = valid[valid["vcp"] == True]
        no_vcp_g = valid[valid["vcp"] == False]

        # By sector
        by_sector = {}
        for sec in sorted(valid["sector"].dropna().unique()):
            g = valid[valid["sector"] == sec]
            by_sector[sec] = {
                "n": int(len(g)),
                "avg": round(float(g[col].mean()), 2),
                "wins": int((g[col] > 0).sum()),
                "hit_rate_pct": round(100 * (g[col] > 0).mean(), 1),
            }

        # By vp_score bucket
        def bucket_vp(v):
            if pd.isna(v): return "n/a"
            if v >= 95: return "≥95"
            if v >= 90: return "90-95"
            if v >= 80: return "80-90"
            return "<80"
        valid["_vp_bucket"] = valid["vp_score_stock"].apply(bucket_vp)
        by_vp = {}
        for b in ["≥95", "90-95", "80-90", "<80"]:
            g = valid[valid["_vp_bucket"] == b]
            if len(g) > 0:
                by_vp[b] = {"n": int(len(g)), "avg": round(float(g[col].mean()), 2),
                            "hit_rate_pct": round(100 * (g[col] > 0).mean(), 1)}

        # strong_buy 三條硬規則
        sb_g = valid[valid["strong_buy"] == True]
        strong_buy_stats = None
        if len(sb_g) > 0:
            strong_buy_stats = {
                "n": int(len(sb_g)),
                "avg": round(float(sb_g[col].mean()), 2),
                "wins": int((sb_g[col] > 0).sum()),
                "hit_rate_pct": round(100 * (sb_g[col] > 0).mean(), 1),
            }

        patterns[ck_lbl] = {
            "n_samples": n,
            "overall_avg_pct": round(avg, 2),
            "hit_rate_pct": round(100 * wins / n, 1),
            "strong_buy": strong_buy_stats,
            "by_composite_rank": by_rank,
            "by_alert": by_alert,
            "vcp_true": {"n": int(len(vcp_g)), "avg": round(float(vcp_g[col].mean()), 2) if len(vcp_g) else None,
                         "hit_rate_pct": round(100 * (vcp_g[col] > 0).mean(), 1) if len(vcp_g) else None},
            "vcp_false": {"n": int(len(no_vcp_g)), "avg": round(float(no_vcp_g[col].mean()), 2) if len(no_vcp_g) else None,
                          "hit_rate_pct": round(100 * (no_vcp_g[col] > 0).mean(), 1) if len(no_vcp_g) else None},
            "by_sector": by_sector,
            "by_vp_score": by_vp,
        }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(patterns, f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"✅ 存 {OUT_JSON}")

    # print summary
    log("=" * 60)
    for ck_lbl, _ in CHECKPOINTS:
        if ck_lbl not in patterns: continue
        p = patterns[ck_lbl]
        log(f"\n=== {ck_lbl} · n={p['n_samples']} · avg {p['overall_avg_pct']:+.2f}% · hit {p['hit_rate_pct']}% ===")
        log("  By 綜合分 rank:")
        for rk, s in sorted(p["by_composite_rank"].items()):
            log(f"    #{rk:2d} n={s['n']:3d}  avg {s['avg']:+7.2f}%  hit {s['hit_rate_pct']:5.1f}%")
        log("  By 警示:")
        for a, s in p["by_alert"].items():
            log(f"    {a:5s} n={s['n']:3d}  avg {s['avg']:+7.2f}%  hit {s['hit_rate_pct']:5.1f}%")
        if p.get("strong_buy"):
            sb = p["strong_buy"]
            log(f"  ★ strong_buy (3 rules) n={sb['n']:3d}  avg {sb['avg']:+7.2f}%  hit {sb['hit_rate_pct']:5.1f}%")
        if p['vcp_true']['n'] > 0:
            log(f"  VCP=TRUE n={p['vcp_true']['n']}  avg {p['vcp_true']['avg']:+.2f}%  hit {p['vcp_true']['hit_rate_pct']}%")


if __name__ == "__main__":
    main()
