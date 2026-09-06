#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
市值快照  scripts/market_cap_snapshot.py
=====================================================================
補現有 pipeline 完全沒有的一個欄位：market cap。sector_rotation_screener.py
的 S&P 500 成分股清單只從 Wikipedia 抓 symbol/sector/name，{date}_all.csv
也沒有市值——導致 SPMO 動能分數只能算「排名」，沒辦法算「權重」（真實
Invesco SPMO 用 momentum score × market cap 決定持股權重，不是純分數排名；
9/6 用 2026-02-27 資料回測驗證過：MU/GOOGL/JNJ 分數排名夠高、有進我們的
Top 20，但真實基金權重最大的 NVDA/AVGO 分數只排 #64/#69——因為它們市值
夠大，光靠市值就能撐出高權重，分數排名完全看不出這件事）。

刻意只抓一次、存成可重用的參考表，不是每次分析都重抓：
  - 用 yfinance Ticker.fast_info['marketCap']（比完整 .info 輕量很多）
  - S&P 500 全池約 500 檔，4 個 worker 平行抓（跟 fetch_surprises_parallel
    同一個保守並行值，yfinance 有內建 rate limit）
  - 市值變化本身比動能分數慢很多（除非增減資/股票分割），拿現在的市值去
    近似回放日期（例如 2026-02-27）當時的市值，是可接受的簡化，不是拿
    當天真實市值——這點會誠實寫進報表附註，不假裝是精確的時間點資料。

輸出：
  data/sector_rotation/market_cap_latest.csv   symbol, market_cap_usd
  data/sector_rotation/market_cap_latest.json  manifest（含 generated_at）

手動跑：
  python scripts/market_cap_snapshot.py
"""
import os
import sys
import csv
import json
import argparse
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sector_rotation_screener as srs  # noqa: E402  重用 fetch_sp500_constituents()

OUTDIR = "data/sector_rotation"
CSV_PATH = os.path.join(OUTDIR, "market_cap_latest.csv")
MANIFEST_PATH = os.path.join(OUTDIR, "market_cap_latest.json")


def _fetch_one(symbol):
    import yfinance as yf
    try:
        cap = yf.Ticker(symbol).fast_info.get("marketCap") or yf.Ticker(symbol).fast_info.get("market_cap")
        return symbol, (int(cap) if cap else None)
    except Exception:
        return symbol, None


def fetch_market_caps(symbols, max_workers=4):
    log = srs.log
    log(f"Fetching market cap for {len(symbols)} tickers via yfinance fast_info...")
    caps = {}
    done = 0
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(_fetch_one, s): s for s in symbols}
        for fut in as_completed(futs):
            sym, cap = fut.result()
            if cap:
                caps[sym] = cap
            done += 1
            if done % 50 == 0:
                log(f"  {done}/{len(symbols)}")
    log(f"  → {len(caps)}/{len(symbols)} 檔抓到市值")
    return caps


def main():
    parser = argparse.ArgumentParser(description="S&P 500 市值快照（供 SPMO / point 分數算加權版用）")
    parser.parse_args()

    universe = srs.fetch_sp500_constituents()
    caps = fetch_market_caps(universe["symbol"].tolist())
    if not caps:
        sys.exit("❌ 沒抓到任何市值資料")

    os.makedirs(OUTDIR, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["symbol", "market_cap_usd"])
        for sym, cap in sorted(caps.items(), key=lambda kv: -kv[1]):
            w.writerow([sym, cap])

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "市值是抓取當下的快照，不是任何歷史回放日期當天的真實市值——"
                "市值變化比動能分數慢很多（除非增減資/股票分割），拿現在市值"
                "近似歷史日期是可接受的簡化，不是精確值，用在加權分析時要註明。",
        "count": len(caps),
        "csv": os.path.basename(CSV_PATH),
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"✅ 產生 {CSV_PATH}（{len(caps)} 檔）")


if __name__ == "__main__":
    main()
