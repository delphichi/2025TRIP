#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_forward_returns.py · 給選股 pool 加 4W/13W/52W 前瞻報酬
=====================================================================
目的：投資決策時看到「當時的排行」+「事後表現」· 一眼判斷 pipeline 挑股準度

9/7 擴大範圍：checkpoint 從 1m/3m/6m/1y 改成 4w/13w/52w（對齊全站既有
4W/13W/26W 交易週期慣例，13w=91 天本來就對得上，這次延伸出 52w 當滿一年
的 checkpoint）。symbol 涵蓋範圍也從「只有 stage2 latest.json 的 top3」
擴大成 V1 Playbook（每 sector Top3）+ V2 Opportunity Radar（sensor pool）
+ SPMO Top10 會用到的全部候選——這幾個 pool 都是從同一份 {date}_all.csv
篩出來的子集合，直接重用 generate_daily_report.py 既有的 loader 取得完整
symbol 清單，不重新發明篩選邏輯（跟 V1/V2 報表用同一套 filter，保證涵蓋）。

用法：
  · 一定在 stage 2 之後跑（讀 data/sector_rotation/latest.json + {date}_all.csv）
  · 若 as_of 太近（<4 週）· 只填 4w · 其他 checkpoint 標 null
  · 若 as_of = today · 全部 null（沒事後資料）
  · yfinance 抓完 T-1 close · 用 t±3d 找最近的交易日

輸出：
  · 覆蓋 latest.json：
    - 每個 top3 tab entry 加 forward_returns dict（維持既有結構，向後相容）：
      {
        "4w": {"date": "YYYY-MM-DD", "price": 123.45, "return_pct": 5.67},
        "13w": {...}, "52w": {...}
      }
    - 新增 forward_returns_by_symbol：{symbol: {entry_price, entry_date_actual,
      4w, 13w, 52w}}，涵蓋全部候選 pool，V1 Playbook / V2 Opportunity Radar
      直接用 symbol 查表即可，不用各自重算
  · unique symbols pre-compute 一次 · 多 pool 共享

執行：
  python scripts/enrich_forward_returns.py
"""
import os
import sys
import json
import math
from datetime import datetime, date, timedelta, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_daily_report as gdr  # noqa: E402  重用 V1/V2 報表已驗證過的 all.csv pool 篩選邏輯


MANIFEST_PATH = "data/sector_rotation/latest.json"
CHECKPOINTS = [("4w", 28), ("13w", 91), ("52w", 364)]


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


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


def find_price_at(series, target_date):
    """
    在 close series 裡找 target_date 或最接近之後的交易日 close
    回傳 (date_str, price) 或 (None, None) 若找不到
    """
    if series is None or len(series) == 0:
        return (None, None)
    idx_dates = pd.to_datetime(series.index).date
    # target 之後（含當日）的第一根
    mask = idx_dates >= target_date
    if not mask.any():
        return (None, None)
    match_idx = series.index[mask][0]
    price = float(series.loc[match_idx])
    return (match_idx.strftime("%Y-%m-%d"), price)


def compute_forward_returns(entry_price, entry_date, close_series):
    """
    給定 entry_price + entry_date + 完整 close series
    回傳 dict{1m/3m/6m/1y: {date, price, return_pct}}
    """
    out = {}
    for label, days in CHECKPOINTS:
        target = entry_date + timedelta(days=days)
        d, p = find_price_at(close_series, target)
        if p is None:
            out[label] = {"date": None, "price": None, "return_pct": None}
        else:
            ret = round((p / entry_price - 1) * 100, 2)
            out[label] = {"date": d, "price": round(p, 2), "return_pct": ret}
    return out


def main():
    if not os.path.exists(MANIFEST_PATH):
        sys.exit(f"❌ 找不到 {MANIFEST_PATH} · 先跑 sector_rotation_screener.py")

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    as_of_str = manifest.get("as_of_date")
    if not as_of_str:
        sys.exit("❌ latest.json 沒有 as_of_date")
    as_of = datetime.strptime(as_of_str, "%Y-%m-%d").date()
    log(f"as_of_date = {as_of}")

    today = datetime.now(timezone.utc).date()
    days_since = (today - as_of).days
    log(f"距今 {days_since} 天 · 有以下 checkpoint 可填：")
    fillable = [(lbl, d) for lbl, d in CHECKPOINTS if d <= days_since - 3]  # 保留 3 天 buffer
    for lbl, d in fillable:
        log(f"  · {lbl} ({d} 天)")
    if not fillable:
        log(f"⚠ 距今才 {days_since} 天 · 任何 checkpoint 都不夠成熟 · 全部標 null · 但仍寫入結構讓前端有欄可 render")

    # 從所有 tab 收集 unique symbols
    top3 = manifest.get("top3", {})
    all_syms = set()
    for tab, entries in top3.items():
        for e in entries:
            if e.get("symbol"):
                all_syms.add(e["symbol"])
    log(f"stage2 top3 tabs symbols: {len(all_syms)}")

    # 擴大覆蓋：V1 Playbook（每 sector Top3）+ V2 Opportunity Radar（sensor pool）
    # + SPMO Top10，都是同一份 {date}_all.csv 的子集合 · 直接重用既有 loader
    sector_flow_map = gdr.load_all_csv_stock_flow_by_sector(as_of_str, per_sector=3)
    for stocks in sector_flow_map.values():
        for s in stocks:
            if s.get("symbol"):
                all_syms.add(s["symbol"])
    exp_buckets = gdr.load_all_csv_verdicts(as_of_str)
    for bucket_rows in exp_buckets.values():
        for r in bucket_rows:
            if r.get("symbol"):
                all_syms.add(r["symbol"])
    spmo_rows = gdr.load_all_csv_spmo_momentum(as_of_str, top_n=10)
    for r in spmo_rows:
        if r.get("symbol"):
            all_syms.add(r["symbol"])

    symbols = sorted(all_syms)
    log(f"unique symbols across top3 + playbook pool + sensor pool + SPMO top10: {len(symbols)}")

    if not symbols:
        log("沒 top 3 symbols · 跳過")
        return

    # 抓 as_of ~ today + 5d 的 daily close · 一次批次
    import yfinance as yf
    fetch_end = min(today, as_of + timedelta(days=380))
    fetch_end_yf = fetch_end + timedelta(days=1)  # yfinance end exclusive
    log(f"yfinance fetch: {len(symbols)} tickers · {as_of} → {fetch_end}")
    data = yf.download(
        symbols, start=as_of.strftime("%Y-%m-%d"), end=fetch_end_yf.strftime("%Y-%m-%d"),
        interval="1d", auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )

    # 抽 close series per symbol
    close_by_sym = {}
    if isinstance(data.columns, pd.MultiIndex):
        for s in symbols:
            if s in data.columns.get_level_values(0):
                close_by_sym[s] = data[s]["Close"].dropna()
    else:
        # 單一 symbol case
        close_by_sym[symbols[0]] = data["Close"].dropna()
    log(f"got close series for {len(close_by_sym)}/{len(symbols)} symbols")

    # per-symbol · 算 forward_returns 一次
    fwd_by_sym = {}
    for s in symbols:
        cs = close_by_sym.get(s)
        if cs is None or len(cs) == 0:
            fwd_by_sym[s] = None
            continue
        # 找 as_of 當天（或最接近之後）的 entry_price
        entry_date_actual, entry_price = find_price_at(cs, as_of)
        if entry_price is None:
            fwd_by_sym[s] = None
            continue
        fr = compute_forward_returns(entry_price, as_of, cs)
        fwd_by_sym[s] = {
            "entry_date_actual": entry_date_actual,
            "entry_price": round(entry_price, 2),
            "returns": fr,
        }

    # 塞回每個 tab 每筆 entry（向後相容既有結構）
    for tab, entries in top3.items():
        for e in entries:
            sym = e.get("symbol")
            info = fwd_by_sym.get(sym)
            if info is None:
                e["forward_returns"] = None
                continue
            e["forward_returns"] = {
                "entry_price": info["entry_price"],
                "entry_date_actual": info["entry_date_actual"],
                **info["returns"],
            }

    # 新增：symbol 查表，涵蓋全部候選 pool（V1 Playbook / V2 Opportunity Radar 直接查）
    forward_returns_by_symbol = {}
    for s in symbols:
        info = fwd_by_sym.get(s)
        if info is None:
            forward_returns_by_symbol[s] = None
            continue
        forward_returns_by_symbol[s] = {
            "entry_price": info["entry_price"],
            "entry_date_actual": info["entry_date_actual"],
            **info["returns"],
        }
    manifest["forward_returns_by_symbol"] = forward_returns_by_symbol

    # meta
    manifest["forward_returns_meta"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of_str,
        "days_since_as_of": days_since,
        "fillable_checkpoints": [lbl for lbl, _ in fillable],
        "checkpoint_definitions": {lbl: f"+{d} calendar days" for lbl, d in CHECKPOINTS},
        "symbol_coverage": len(symbols),
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    log(f"✅ 寫回 {MANIFEST_PATH}")

    # 打個 summary
    log("=" * 60)
    log("Sample forward returns (composite tab)")
    log("=" * 60)
    for e in top3.get("composite", [])[:12]:
        fr = e.get("forward_returns") or {}
        r4w = (fr.get("4w") or {}).get("return_pct")
        r13w = (fr.get("13w") or {}).get("return_pct")
        r52w = (fr.get("52w") or {}).get("return_pct")
        def _fmt(v):
            return f"{v:+7.2f}%" if v is not None else "   n/a "
        log(f"  {e['symbol']:6s} {e.get('sector',''):20s} 4w={_fmt(r4w)} 13w={_fmt(r13w)} 52w={_fmt(r52w)}")


if __name__ == "__main__":
    main()
