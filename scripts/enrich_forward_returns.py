#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_forward_returns.py · 給 stage 2 每檔 top 3 個股加 1m/3m/6m/1y 前瞻報酬
=====================================================================
目的：投資決策時看到「當時的排行」+「事後表現」· 一眼判斷 pipeline 挑股準度

用法：
  · 一定在 stage 2 之後跑（讀 data/sector_rotation/latest.json）
  · 若 as_of 太近（<1 個月）· 只填 1m · 其他 checkpoint 標 null
  · 若 as_of = today · 全部 null（沒事後資料）
  · yfinance 抓完 T-1 close · 用 t±3d 找最近的交易日

輸出：
  · 覆蓋 latest.json · 每檔 entry 加 forward_returns dict:
      {
        "1m": {"date": "YYYY-MM-DD", "price": 123.45, "return_pct": 5.67},
        "3m": {...}, "6m": {...}, "1y": {...}
      }
  · unique symbols pre-compute 一次 · 多 tab 共享

執行：
  python scripts/enrich_forward_returns.py
"""
import os
import sys
import json
import math
from datetime import datetime, date, timedelta, timezone

import pandas as pd


MANIFEST_PATH = "data/sector_rotation/latest.json"
CHECKPOINTS = [("1m", 30), ("3m", 91), ("6m", 182), ("1y", 365)]


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
    symbols = sorted(all_syms)
    log(f"unique symbols across all tabs: {len(symbols)}")

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

    # 塞回每個 tab 每筆 entry
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

    # meta
    manifest["forward_returns_meta"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of_str,
        "days_since_as_of": days_since,
        "fillable_checkpoints": [lbl for lbl, _ in fillable],
        "checkpoint_definitions": {lbl: f"+{d} calendar days" for lbl, d in CHECKPOINTS},
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
        r1 = (fr.get("1m") or {}).get("return_pct")
        r3 = (fr.get("3m") or {}).get("return_pct")
        r6 = (fr.get("6m") or {}).get("return_pct")
        r12 = (fr.get("1y") or {}).get("return_pct")
        def _fmt(v):
            return f"{v:+7.2f}%" if v is not None else "   n/a "
        log(f"  {e['symbol']:6s} {e.get('sector',''):20s} 1m={_fmt(r1)} 3m={_fmt(r3)} 6m={_fmt(r6)} 1y={_fmt(r12)}")


if __name__ == "__main__":
    main()
