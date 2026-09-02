"""
Enrich pool 中股票的近 90 天內部人交易資料（Yahoo Finance / SEC Form 4）

流程：
  1. 讀最新 *_all.csv · 篩 pool 個股（ud_ratio ≥ 1.5 + up_days_20 ≥ 12）
     → 這是 playbook「每 sector Top 3」的 universe
  2. 對每支用 yfinance.Ticker(sym).insider_transactions 抓近 90 天明細
  3. 計算 net buy $M · CEO/CFO/President 集群買入 · top buyer
  4. 輸出 data/sector_rotation/{YYYYMMDD}_insider.json + insider_latest.json

CI-friendly: sandbox 沒 Yahoo access · 執行會 skip 但不 fail
"""
import os
import sys
import json
import glob
import argparse
from datetime import datetime, timedelta

import pandas as pd

DATA_DIR = "data/sector_rotation"


def get_pool_symbols(as_of):
    stamp = as_of.replace("-", "")
    path = os.path.join(DATA_DIR, f"{stamp}_all.csv")
    if not os.path.exists(path):
        print(f"[skip] no all.csv for {as_of}")
        return []
    df = pd.read_csv(path)
    # 只 enrich pool: ud_ratio ≥ 1.5 + up_days_20 ≥ 12
    df = df.copy()
    df["ud"] = pd.to_numeric(df.get("ud_ratio"), errors="coerce")
    df["upd"] = pd.to_numeric(df.get("up_days_20"), errors="coerce")
    df = df[(df["ud"] >= 1.5) & (df["upd"] >= 12)]
    return sorted(df["symbol"].dropna().unique().tolist())


def _is_top_officer(title):
    """判斷是否為決策層 (CEO/CFO/President/Chairman/COO)"""
    t = (title or "").upper()
    return any(k in t for k in ["CHIEF EXEC", "CEO", "CHIEF FIN", "CFO",
                                 "PRESIDENT", "CHAIRMAN", "COO",
                                 "CHIEF OPER", "10% OWNER"])


def fetch_insider(symbol, cutoff_days=90):
    """回傳 dict · 或 None（無資料/錯誤）"""
    try:
        import yfinance as yf
        t = yf.Ticker(symbol)
        tr = t.insider_transactions
        if tr is None or len(tr) == 0:
            return None
        # 標準化日期欄
        date_col = None
        for c in ["Start Date", "Date", "start_date", "date"]:
            if c in tr.columns:
                date_col = c
                break
        if date_col is None:
            return None
        tr = tr.copy()
        tr["_dt"] = pd.to_datetime(tr[date_col], errors="coerce")
        cutoff = pd.Timestamp.now() - pd.Timedelta(days=cutoff_days)
        recent = tr[tr["_dt"] >= cutoff].copy()
        if len(recent) == 0:
            return None

        # 標準化 Transaction/Value/Insider/Position 欄
        def col(*names, default=""):
            for n in names:
                if n in recent.columns:
                    return recent[n]
            return pd.Series([default] * len(recent))

        recent["_txn"] = col("Transaction", "transaction").astype(str)
        recent["_val"] = pd.to_numeric(col("Value", "value"), errors="coerce").fillna(0)
        recent["_ins"] = col("Insider", "insider").astype(str)
        recent["_pos"] = col("Position", "position").astype(str)

        # 分類 buy / sell（Yahoo 慣用 "Purchase" "Sale"）
        buys = recent[recent["_txn"].str.contains("Purchase|Buy", case=False, na=False)]
        sells = recent[recent["_txn"].str.contains("Sale|Sell", case=False, na=False)]

        buy_val = float(buys["_val"].sum())
        sell_val = float(sells["_val"].sum())
        net = buy_val - sell_val

        # top buyer
        top_buyer, top_title = None, None
        if len(buys) > 0:
            top = buys.sort_values("_val", ascending=False).iloc[0]
            top_buyer = str(top["_ins"])[:40].strip()
            top_title = str(top["_pos"])[:40].strip()

        # top officer count
        top_officer_buys = buys[buys["_pos"].apply(_is_top_officer)]
        top_officer_cnt = int(len(top_officer_buys))
        top_officer_val = float(top_officer_buys["_val"].sum())

        return {
            "buy_M": round(buy_val / 1e6, 3),
            "sell_M": round(sell_val / 1e6, 3),
            "net_M": round(net / 1e6, 3),
            "buy_cnt": int(len(buys)),
            "sell_cnt": int(len(sells)),
            "top_officer_cnt": top_officer_cnt,
            "top_officer_buy_M": round(top_officer_val / 1e6, 3),
            "top_buyer": top_buyer,
            "top_title": top_title,
        }
    except Exception as e:
        print(f"  [{symbol}] err: {type(e).__name__}: {str(e)[:60]}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", default=None, help="YYYY-MM-DD · 預設抓最新 all.csv")
    ap.add_argument("--limit", type=int, default=200, help="最多 enrich 幾支")
    args = ap.parse_args()

    if args.as_of:
        as_of = args.as_of
    else:
        files = sorted(glob.glob(os.path.join(DATA_DIR, "*_all.csv")))
        if not files:
            print("[fatal] no all.csv found")
            sys.exit(0)  # 不 fail CI
        stamp = os.path.basename(files[-1]).split("_")[0]
        as_of = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"

    symbols = get_pool_symbols(as_of)[: args.limit]
    print(f"[enrich_insider] as_of={as_of} · pool={len(symbols)} symbols")

    if not symbols:
        # 寫 empty output 讓 report 讀
        stamp = as_of.replace("-", "")
        empty = {"as_of": as_of, "count": 0, "data": {}, "note": "no pool symbols"}
        for p in [os.path.join(DATA_DIR, f"{stamp}_insider.json"),
                  os.path.join(DATA_DIR, "insider_latest.json")]:
            with open(p, "w") as f:
                json.dump(empty, f, indent=2)
        print("[done] no symbols · wrote empty json")
        return

    out = {}
    for i, sym in enumerate(symbols):
        if i % 20 == 0:
            print(f"  [{i}/{len(symbols)}] {sym}")
        info = fetch_insider(sym)
        if info:
            out[sym] = info

    stamp = as_of.replace("-", "")
    payload = {"as_of": as_of, "count": len(out), "pool_size": len(symbols), "data": out}
    for p in [os.path.join(DATA_DIR, f"{stamp}_insider.json"),
              os.path.join(DATA_DIR, "insider_latest.json")]:
        with open(p, "w") as f:
            json.dump(payload, f, indent=2)

    # top 10 net buy for log
    ranked = sorted(out.items(), key=lambda kv: -kv[1].get("net_M", 0))
    print(f"\n[done] {len(out)}/{len(symbols)} stocks with insider data")
    print("\n=== Top 10 net insider buy ===")
    for sym, d in ranked[:10]:
        print(f"  {sym:6s} net ${d['net_M']:+7.2f}M  buy {d['buy_cnt']:2d}/sell {d['sell_cnt']:2d}"
              f"  top officers {d['top_officer_cnt']} (${d['top_officer_buy_M']:+.2f}M)"
              f"  top: {d.get('top_buyer','')} · {d.get('top_title','')}")


if __name__ == "__main__":
    main()
