#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Portfolio 追蹤器  scripts/portfolio_tracker.py
=====================================================================
讀 portfolios/*.json · 抓 yfinance 現價 · 計算：
  · 每檔個股相對 entry_price 的報酬率
  · 加權組合報酬率（用 weight_pct）
  · vs VOO 基準比較（bps 超額 / 落後）
  · 自動填入最靠近的 checkpoint（1m / 3m / 6m / 1y）

用法：
  python scripts/portfolio_tracker.py                # 更新全部 portfolios · print 摘要
  python scripts/portfolio_tracker.py --dry          # 只 print 不寫檔
  python scripts/portfolio_tracker.py --file 2026-07-31-picks.json  # 只跑某一份

CI 排程可以每月月底跑一次自動更新
"""
import os
import sys
import json
import math
import argparse
import glob
from datetime import datetime, date, timezone, timedelta

import pandas as pd

PORTFOLIO_DIR = "portfolios"


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


def fetch_current_prices(symbols):
    """
    抓每檔 ticker 最近一根 daily close · 回傳 dict[symbol → (date_str, close_price)]
    用 yfinance · T-1 保護（擋今天 partial bar）
    """
    import yfinance as yf
    log(f"Fetching current prices for {len(symbols)} symbols via yfinance...")
    tickers = " ".join(symbols)
    data = yf.download(
        tickers, period="1mo", interval="1d",
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    today_utc = datetime.now(timezone.utc).date()
    out = {}
    if isinstance(data.columns, pd.MultiIndex):
        for sym in symbols:
            if sym in data.columns.get_level_values(0):
                sub = data[sym].dropna(how="all")
                sub = sub.loc[pd.to_datetime(sub.index).date < today_utc]
                if len(sub):
                    d = sub.index[-1].strftime("%Y-%m-%d")
                    c = float(sub["Close"].iloc[-1])
                    out[sym] = (d, c)
    else:
        # single ticker path
        sub = data.dropna(how="all")
        sub = sub.loc[pd.to_datetime(sub.index).date < today_utc]
        if len(sub):
            d = sub.index[-1].strftime("%Y-%m-%d")
            c = float(sub["Close"].iloc[-1])
            out[symbols[0]] = (d, c)
    log(f"  → got prices for {len(out)}/{len(symbols)} symbols")
    return out


def pick_active_checkpoint(entry_date, cp_dates, today):
    """
    決定今天要填哪一個 checkpoint · 用「距離最近但尚未填」邏輯：
    如果 today >= 某 checkpoint 的日期且該 cp 還沒填 → 填該 cp
    如果 today 在多個 cp 之間 → 填最新的那個
    """
    entry = date.fromisoformat(entry_date)
    active = None
    for cp_name, cp_date_str in cp_dates.items():
        cp = date.fromisoformat(cp_date_str)
        if today >= cp:
            active = cp_name
    return active


def update_portfolio(pf_path, dry=False):
    log(f"=== {os.path.basename(pf_path)} ===")
    with open(pf_path, "r", encoding="utf-8") as f:
        pf = json.load(f)

    today = date.today()
    entry_date = pf["entry_date"]
    positions = pf["positions"]
    benchmarks = pf.get("benchmarks", [])
    cp_dates = pf.get("checkpoint_dates", {})

    # 決定今天要填哪一個 checkpoint（若還沒到 1m 就 skip 寫檔 · 只印當前狀態）
    active_cp = pick_active_checkpoint(entry_date, cp_dates, today)
    if active_cp:
        log(f"→ Active checkpoint: {active_cp} (target date {cp_dates[active_cp]}, today {today})")
    else:
        log(f"→ 尚未到最近的 1m checkpoint (entry {entry_date}, today {today}) · 只印當前 preview 不寫檔")

    # 抓所有 symbol（positions + benchmarks）
    all_syms = [p["symbol"] for p in positions] + [b["symbol"] for b in benchmarks]
    prices = fetch_current_prices(all_syms)

    # 計算個股報酬
    per_stock = []
    total_weighted_return = 0.0
    total_weight = 0.0
    invested_pct = pf.get("total_invested_pct", 100.0)
    for p in positions:
        sym = p["symbol"]
        entry_px = p["entry_price"]
        cur = prices.get(sym)
        if not cur:
            per_stock.append({**p, "current_date": None, "current_price": None, "return_pct": None})
            continue
        d, cur_px = cur
        ret = (cur_px / entry_px - 1) * 100 if entry_px else None
        per_stock.append({
            "symbol": sym, "tier": p["tier"], "weight_pct": p["weight_pct"],
            "entry_price": entry_px, "current_price": round(cur_px, 2),
            "return_pct": round(ret, 2) if ret is not None else None,
            "current_date": d,
        })
        if ret is not None:
            total_weighted_return += ret * p["weight_pct"]
            total_weight += p["weight_pct"]

    portfolio_return = round(total_weighted_return / invested_pct, 2) if invested_pct > 0 else None
    #    ↑ 用 invested_pct 分母 · 反映「已投資部位」的加權報酬（不含現金）
    #    e.g. 5 檔各 5% 動能 · 全部 +10% → 加權和 250 / invested 25 = +10%

    # benchmark 報酬
    bench_returns = {}
    for b in benchmarks:
        sym = b["symbol"]
        entry_px = b.get("entry_price")
        cur = prices.get(sym)
        if not (cur and entry_px):
            continue
        d, cur_px = cur
        bench_returns[sym] = {
            "current_price": round(cur_px, 2),
            "return_pct": round((cur_px / entry_px - 1) * 100, 2),
            "as_of_date": d,
        }

    # portfolio vs VOO
    voo_ret = bench_returns.get("VOO", {}).get("return_pct")
    vs_voo_bps = None
    if portfolio_return is not None and voo_ret is not None:
        vs_voo_bps = int(round((portfolio_return - voo_ret) * 100))  # 1% = 100 bps

    # print 摘要
    log("=" * 70)
    log(f"POSITIONS (invested={invested_pct}% · cash={pf.get('cash_pct',0)}%)")
    log("=" * 70)
    for r in per_stock:
        ret_str = f"{r['return_pct']:+6.2f}%" if r["return_pct"] is not None else "  N/A "
        entry_str = f"${r['entry_price']:>8.2f}"
        cur_str = f"${r['current_price']:>8.2f}" if r['current_price'] is not None else "     N/A"
        wt = r["weight_pct"]
        log(f"  {r['symbol']:6s} [{r['tier']:8s}]  entry {entry_str} → current {cur_str}  · {ret_str}  ({wt}%)")
    log("-" * 70)
    log(f"  {'PORTFOLIO':6s}                                              · {portfolio_return:+6.2f}%  (加權)")
    for sym, br in bench_returns.items():
        log(f"  {sym:6s} benchmark                                        · {br['return_pct']:+6.2f}%")
    if vs_voo_bps is not None:
        sign = "🟢 out-perform" if vs_voo_bps > 0 else "🔴 under-perform" if vs_voo_bps < 0 else "= flat"
        log(f"  → vs VOO: {vs_voo_bps:+d} bps  {sign}")
    log("=" * 70)

    # 若到了 checkpoint · 寫檔
    if active_cp and not dry:
        pf["checkpoints_data"][active_cp] = {
            "as_of_date": max((r["current_date"] for r in per_stock if r["current_date"]), default=None),
            "prices": {r["symbol"]: r["current_price"] for r in per_stock if r["current_price"] is not None},
            "returns_pct": {r["symbol"]: r["return_pct"] for r in per_stock if r["return_pct"] is not None},
            "portfolio_return_pct": portfolio_return,
            "vs_voo_bps": vs_voo_bps,
            "benchmarks": bench_returns,
            "written_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(pf_path, "w", encoding="utf-8") as f:
            json.dump(_json_safe(pf), f, ensure_ascii=False, indent=2, allow_nan=False)
        log(f"✅ Updated checkpoint '{active_cp}' in {pf_path}")
    elif active_cp and dry:
        log(f"(dry mode · 沒寫檔 · 若寫會更新 checkpoint '{active_cp}')")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只 print 不寫檔")
    ap.add_argument("--file", default=None, help="只跑指定 portfolio json (e.g. 2026-07-31-picks.json)")
    args = ap.parse_args()

    if args.file:
        paths = [os.path.join(PORTFOLIO_DIR, args.file)]
    else:
        paths = sorted(glob.glob(os.path.join(PORTFOLIO_DIR, "*.json")))

    if not paths:
        sys.exit(f"❌ no portfolios in {PORTFOLIO_DIR}/")

    for p in paths:
        try:
            update_portfolio(p, dry=args.dry)
        except Exception as e:
            log(f"❌ error on {p}: {e}")
            raise


if __name__ == "__main__":
    main()
