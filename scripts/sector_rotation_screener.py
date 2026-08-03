#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S&P 500 板塊動能篩選器  scripts/sector_rotation_screener.py
=====================================================================
每月最後一個週五（CI 排程實作為每週五）跑一次：
  1. 從 Wikipedia 抓 S&P 500 成分股 + GICS Sector
  2. yfinance 抓週線收盤，算 4W / 13W / 26W 累積報酬（價格動能）
  3. 依 4W / 13W / 26W 各自預篩每 sector 前 15 名（省 FMP 額度）
  4. 對預篩到的 union 名單，用 FMP earnings-surprises 抓最近兩次 EPS surprise
  5. 篩選規則（盈餘動能）：L1 & L2 皆為正、或 L1 > L2（改善趨勢）
  6. 各 sector 依三個時間尺度分別選出前 3 名 → 三張熱區表
  7. 輸出 CSV + latest.json manifest 供瀏覽器讀

資料源：
  價格：yfinance（Yahoo Finance，免 key，內建重試）
  盈餘 surprise：FMP /api/v3/earnings-surprises/{ticker}?apikey=KEY
                （前置：Repo Settings → Secrets → FMP_API_KEY）

輸出：
  data/sector_rotation/{YYYYMMDD}_all.csv          全 500 檔的價格動能明細
  data/sector_rotation/{YYYYMMDD}_top3_{4w|13w|26w}.csv  三張榜單
  data/sector_rotation/latest.json                 manifest（瀏覽器讀）

手動跑：
  FMP_API_KEY=xxx python scripts/sector_rotation_screener.py
  （沒 key 也會跑，只是 surprise 欄位會是 NA、篩選會退回純價格動能）
"""
import os
import sys
import json
import time
from datetime import datetime, date, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO

import pandas as pd
import requests

OUTDIR = "data/sector_rotation"
MANIFEST_PATH = os.path.join(OUTDIR, "latest.json")
FMP_KEY = os.environ.get("FMP_API_KEY", "").strip()

# 每個 sector 進 FMP earnings 檢查的預篩名單大小
# 15 名 × 11 sector × 3 時間尺度 union ≈ 200-300 unique ticker
# 剛好在 FMP starter tier 每分鐘 300 call 的範圍內
PRE_FILTER_PER_SECTOR = 15
TOP_N = 3  # 每 sector 最終選出的名次

# yfinance 一次批次下載的 chunk size（避免 400 URL too long）
YF_BATCH = 80


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# 1. S&P 500 成分股
# ============================================================
def fetch_sp500_constituents():
    """
    從 Wikipedia 抓 S&P 500 成分股清單。
    回傳 DataFrame[symbol, sector, name]
    """
    log("Fetching S&P 500 constituents from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0 (sector-rotation-screener)"}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    # pandas 2.1+ 棄用 pd.read_html(raw_str) · 3.0 直接噴 error 把整份 HTML 帶進 msg
    # 必須包 StringIO
    tables = pd.read_html(StringIO(r.text))
    df = tables[0]
    # 欄位可能叫 'Symbol' + 'GICS Sector' + 'Security'
    col_sym = next(c for c in df.columns if "symbol" in c.lower())
    col_sec = next(c for c in df.columns if "sector" in c.lower())
    col_nm = next(c for c in df.columns if "security" in c.lower())
    out = df[[col_sym, col_sec, col_nm]].copy()
    out.columns = ["symbol", "sector", "name"]
    # Wikipedia 的 dots 換 dashes 對齊 yfinance（BRK.B → BRK-B）
    out["symbol"] = out["symbol"].str.replace(".", "-", regex=False)
    log(f"  → {len(out)} tickers, {out['sector'].nunique()} sectors")
    return out


# ============================================================
# 2. 週線價格 → 累積報酬
# ============================================================
def fetch_weekly_returns(tickers):
    """
    yfinance 批次抓 30 週的週線收盤，回傳 DataFrame[symbol, cum_ret_4w, cum_ret_13w, cum_ret_26w]
    """
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("需要 yfinance：pip install yfinance")

    log(f"Downloading weekly prices for {len(tickers)} tickers via yfinance...")
    all_close = None
    for i in range(0, len(tickers), YF_BATCH):
        chunk = tickers[i : i + YF_BATCH]
        log(f"  batch {i // YF_BATCH + 1}/{(len(tickers) + YF_BATCH - 1) // YF_BATCH} ({len(chunk)} tickers)")
        # 抓 28 週足夠算 26W；多抓 3 週 buffer 應付缺資料
        data = yf.download(
            chunk,
            period="8mo",
            interval="1wk",
            auto_adjust=True,
            progress=False,
            threads=True,
            group_by="ticker",
        )
        # yfinance 回傳格式因 chunk size 而異
        if isinstance(data.columns, pd.MultiIndex):
            close = pd.DataFrame({t: data[t]["Close"] for t in chunk if t in data.columns.get_level_values(0)})
        else:
            close = data[["Close"]].rename(columns={"Close": chunk[0]})
        all_close = close if all_close is None else all_close.join(close, how="outer")

    if all_close is None or all_close.empty:
        raise RuntimeError("yfinance 沒抓到任何資料")

    all_close = all_close.dropna(how="all").sort_index()

    # T-1 保護：擋掉「今天」的 partial weekly bar
    # 盤中跑 yfinance 會回傳當週還沒結束的 partial 資料
    today_utc = datetime.now(timezone.utc).date()
    idx = pd.to_datetime(all_close.index)
    before_today = idx.date < today_utc
    dropped = int((~before_today).sum())
    if dropped:
        log(f"  · 擋掉 {dropped} 根「今天/未來」的 partial weekly bar")
    all_close = all_close.loc[before_today]

    log(f"  → close matrix: {all_close.shape[0]} weeks × {all_close.shape[1]} tickers")

    # T-1 基準：使用抓到的最後一根 close 的日期
    as_of_date = all_close.index[-1].strftime("%Y-%m-%d")
    log(f"  → as_of_date (T-1) = {as_of_date}")

    rows = []
    for sym in all_close.columns:
        series = all_close[sym].dropna()
        if len(series) < 27:
            continue
        cur = series.iloc[-1]
        try:
            r4 = (cur / series.iloc[-5] - 1) * 100
            r13 = (cur / series.iloc[-14] - 1) * 100
            r26 = (cur / series.iloc[-27] - 1) * 100
        except IndexError:
            continue
        # Point = 4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）
        point = r4 * 0.25 + r13 * 0.25 + r26 * 0.50
        # di = 三週期正報酬指標
        di = ((1 if r4 > 0 else 0) + (1 if r13 > 0 else 0) + (1 if r26 > 0 else 0)) / 3.0
        rows.append({
            "symbol": sym,
            "as_of_date": as_of_date,
            "t_price": round(float(cur), 2),
            "cum_ret_4w": round(r4, 2),
            "cum_ret_13w": round(r13, 2),
            "cum_ret_26w": round(r26, 2),
            "point": round(point, 2),
            "di": round(di, 3),
        })
    out = pd.DataFrame(rows)
    log(f"  → {len(out)} tickers with 27+ weeks of data")
    return out


# ============================================================
# 3. Earnings Surprise via yfinance
# ============================================================
# 原本用 FMP /api/v3/earnings-surprises · 但那 endpoint free tier 403
# 改用 yfinance 的 earnings_dates DataFrame · 免 key 且無 rate limit
#
# yfinance 回傳格式：
#   ticker.earnings_dates → DataFrame(index=DatetimeIndex, cols=[EPS Estimate, Reported EPS, Surprise(%)])
#   包含未來預告財報（Reported EPS 為 NaN）· 我們只用「已公告」的兩筆
def fetch_yf_surprise(symbol, stats):
    """回傳 (l1_pct, l2_pct)。抓不到回 (None, None)。stats 累計統計"""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        df = ticker.earnings_dates
        if df is None or df.empty:
            stats["empty_response"] += 1
            return (None, None)
        # 只留「已公告」（Reported EPS 有值）· 按日期倒序
        past = df.dropna(subset=["Reported EPS"]).sort_index(ascending=False)
        if len(past) == 0:
            stats["no_history"] += 1
            return (None, None)

        def _pct(row):
            # yfinance 直接提供 Surprise(%) · 用就好
            if "Surprise(%)" in row.index and pd.notna(row["Surprise(%)"]):
                return round(float(row["Surprise(%)"]), 2)
            # fallback 自己算
            est = row.get("EPS Estimate")
            act = row.get("Reported EPS")
            if pd.isna(est) or pd.isna(act) or est == 0:
                return None
            return round((act - est) / abs(est) * 100, 2)

        l1 = _pct(past.iloc[0]) if len(past) > 0 else None
        l2 = _pct(past.iloc[1]) if len(past) > 1 else None
        if l1 is not None or l2 is not None:
            stats["ok_with_data"] += 1
        else:
            stats["ok_but_null"] += 1
        return (l1, l2)
    except Exception as e:
        stats["exception"] += 1
        stats["last_exception"] = str(e)[:120]
        return (None, None)


def fetch_surprises_parallel(symbols):
    """
    平行呼叫 yfinance earnings_dates。回傳 DataFrame[symbol, surprise_l1, surprise_l2]。
    """
    log(f"Fetching earnings surprises for {len(symbols)} tickers via yfinance...")
    if FMP_KEY:
        log("  (FMP_API_KEY 有設但目前不用 · free tier /earnings-surprises 是 403 · secret 可留著)")
    rows = []
    stats = {"ok_with_data": 0, "ok_but_null": 0, "empty_response": 0,
             "no_history": 0, "exception": 0}
    # yfinance 內部有 rate limit / caching · 4 workers 是個穩定的並行值
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_yf_surprise, s, stats): s for s in symbols}
        done = 0
        for fut in as_completed(futs):
            sym = futs[fut]
            l1, l2 = fut.result()
            rows.append({"symbol": sym, "surprise_l1": l1, "surprise_l2": l2})
            done += 1
            if done % 50 == 0:
                log(f"  {done}/{len(symbols)}")
    log("=" * 60)
    log(f"yfinance surprise fetch summary ({len(symbols)} tickers):")
    log(f"  ✅ ok_with_data:  {stats['ok_with_data']}")
    log(f"  ⚠  ok_but_null:   {stats['ok_but_null']}  (有歷史財報但 Surprise NaN)")
    log(f"  ⚠  no_history:    {stats['no_history']}  (只有未來預告 · 沒歷史財報)")
    log(f"  ⚠  empty_response:{stats['empty_response']}  (earnings_dates 直接是空)")
    log(f"  ❌ exception:     {stats['exception']}  · last: {stats.get('last_exception', '')}")
    log("=" * 60)
    return pd.DataFrame(rows)


# ============================================================
# 4. 篩選 + 排名
# ============================================================
def apply_earnings_filter(df):
    """
    盈餘動能篩選：
      - 兩期都是正 surprise，或
      - L1 > L2（改善趨勢）
    有 FMP key 時才生效；沒 key（surprise 全 NA）直接回原表。
    """
    if df["surprise_l1"].isna().all():
        return df
    def keep(row):
        l1, l2 = row.get("surprise_l1"), row.get("surprise_l2")
        if l1 is None:
            return False  # 至少要有 L1
        if l2 is None:
            return l1 > 0  # 只有 L1 就看 L1
        if l1 > 0 and l2 > 0:
            return True
        if l1 > l2:  # 改善
            return True
        return False
    mask = df.apply(keep, axis=1)
    return df[mask].copy()


def pick_top_n_per_sector(df, sort_col, top_n=TOP_N, ascending=False):
    return (
        df.sort_values(["sector", sort_col], ascending=[True, ascending])
        .groupby("sector", as_index=False)
        .head(top_n)
        .sort_values(["sector", sort_col], ascending=[True, ascending])
        .reset_index(drop=True)
    )


def pre_filter_union(df, per_sector=PRE_FILTER_PER_SECTOR):
    """三個時間尺度各取每 sector 前 N 名的 union，餵給 FMP surprise 抓取"""
    parts = []
    for col in ("cum_ret_4w", "cum_ret_13w", "cum_ret_26w"):
        parts.append(pick_top_n_per_sector(df, col, top_n=per_sector))
    union = pd.concat(parts).drop_duplicates(subset=["symbol"])
    return union["symbol"].tolist()


def add_sector_internal_ranks(df):
    """
    對每個 sector 內部：算 4W/13W/26W 排名（1 = 最強）+ CMS_A
    CMS_A = 0.5×4W_rank + 0.3×13W_rank + 0.2×26W_rank（越小越強，重短線）
    """
    df = df.copy()
    for col in ("cum_ret_4w", "cum_ret_13w", "cum_ret_26w"):
        df[col + "_rank_in_sector"] = df.groupby("sector")[col].rank(
            method="min", ascending=False
        ).astype(int)
    df["cms_a"] = (
        df["cum_ret_4w_rank_in_sector"] * 0.5
        + df["cum_ret_13w_rank_in_sector"] * 0.3
        + df["cum_ret_26w_rank_in_sector"] * 0.2
    ).round(2)
    return df


# ============================================================
# 5. 輸出
# ============================================================
def save_outputs(df_all, top3_4w, top3_13w, top3_cms_a, top3_26w):
    os.makedirs(OUTDIR, exist_ok=True)
    # 用 T-1 as_of_date（非 today）
    as_of = df_all["as_of_date"].iloc[0] if "as_of_date" in df_all and len(df_all) else date.today().strftime("%Y-%m-%d")
    stamp = as_of.replace("-", "")

    files = {}
    def _save(df, tag):
        path = os.path.join(OUTDIR, f"{stamp}_{tag}.csv")
        df.to_csv(path, index=False)
        files[tag] = os.path.basename(path)
        log(f"  saved {path} ({len(df)} rows)")

    _save(df_all, "all")
    _save(top3_4w, "top3_4w")
    _save(top3_13w, "top3_13w")
    _save(top3_26w, "top3_26w")
    _save(top3_cms_a, "top3_cms_a")

    def _records(df):
        return df.where(pd.notna(df), None).to_dict(orient="records")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": as_of,
        "as_of_date_note": "基準日 = 抓到的最後一根週線 close 的日期（T-1）",
        "counts": {
            "universe": int(len(df_all)),
            "after_earnings_filter": int(df_all["earnings_passed"].sum()) if "earnings_passed" in df_all else None,
            "top3_4w": int(len(top3_4w)),
            "top3_13w": int(len(top3_13w)),
            "top3_26w": int(len(top3_26w)),
            "top3_cms_a": int(len(top3_cms_a)),
        },
        "files": files,
        "top3": {
            "4w": _records(top3_4w),
            "13w": _records(top3_13w),
            "26w": _records(top3_26w),
            "cms_a": _records(top3_cms_a),
        },
        "formulas": {
            "point": "4W%×0.25 + 13W%×0.25 + 26W%×0.50（越大越強，重中長期）",
            "cms_a": "0.5×4W_rank_in_sector + 0.3×13W_rank_in_sector + 0.2×26W_rank_in_sector（越小越強，重短線）",
            "di": "((4W>0)+(13W>0)+(26W>0))/3；1.0 = 三週期全漲",
        },
        "sectors": sorted(df_all["sector"].dropna().unique().tolist()),
        "surprise_source": "yfinance (earnings_dates)",
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log(f"  saved manifest {MANIFEST_PATH}")


# ============================================================
# 6. main
# ============================================================
def main():
    t0 = time.time()

    # (1) universe
    universe = fetch_sp500_constituents()

    # (2) 價格動能（附 Point / di）
    ret_df = fetch_weekly_returns(universe["symbol"].tolist())
    price_df = universe.merge(ret_df, on="symbol", how="inner")

    # (2b) 板塊內排名 + CMS_A
    price_df = add_sector_internal_ranks(price_df)

    # (3) 預篩 union（三尺度各 sector 前 15）
    pre_syms = pre_filter_union(price_df)
    log(f"Pre-filter union: {len(pre_syms)} tickers → sent to FMP")

    # (4) 抓 surprise
    surp_df = fetch_surprises_parallel(pre_syms)
    full_df = price_df.merge(surp_df, on="symbol", how="left")

    # (5) 盈餘動能篩選（只對預篩過的 subset）
    subset = full_df[full_df["symbol"].isin(pre_syms)].copy()
    filtered = apply_earnings_filter(subset)
    full_df["earnings_passed"] = full_df["symbol"].isin(filtered["symbol"])
    log(f"After earnings filter: {len(filtered)} tickers pass")

    # (6) 各時間尺度取 top 3 · 另加一張「CMS_A 板塊內冠軍榜」
    top3_4w = pick_top_n_per_sector(filtered, "cum_ret_4w")
    top3_13w = pick_top_n_per_sector(filtered, "cum_ret_13w")
    top3_26w = pick_top_n_per_sector(filtered, "cum_ret_26w")
    top3_cms_a = pick_top_n_per_sector(filtered, "cms_a", ascending=True)  # 越小越強

    # (7) 存檔
    save_outputs(
        full_df.sort_values(["sector", "point"], ascending=[True, False]),
        top3_4w, top3_13w, top3_cms_a, top3_26w,
    )

    log(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
