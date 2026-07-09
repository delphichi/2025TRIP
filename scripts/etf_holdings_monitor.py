#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主動式 ETF 持股監看  scripts/etf_holdings_monitor.py
=====================================================================
跨投信抓「主動式 ETF」每日成分,diff 昨天 → 看經理人在買賣什麼。
主動式 ETF = 真人經理人選股,持股變化是「法人決策」,訊號遠強於被動 ETF。

資料源(本機被 proxy 擋,需在 CI 跑):
  復華 fhtrust : GET /api/assetsExcel/{etf}/{YYYYMMDD}      (Excel)
  統一 ezmoney : GET /ETF/Transaction/PCFExcelNPOI?fundCode={fc}&date={ROC}&specificDate=true

每檔:存日期快照 data/etf_holdings/{code}_{YYYYMMDD}.csv → diff 最近兩日 →
  🟢新增成分 / 🔴剔除 / ⬆️⬇️增減碼。
跨基金:🔥 多檔主動 ETF「同時新增/加碼同一股」= 法人共識(最強訊號)。

輸出:
  - data/etf_holdings/{code}_{YYYYMMDD}.csv         每檔每日快照
  - data/etf_holdings/latest.json                    manifest (browser 讀)
"""
import os
import io
import sys
import json
import glob
from datetime import date, datetime, timedelta, timezone
import requests
import pandas as pd

OUTDIR = "data/etf_holdings"
MANIFEST_PATH = os.path.join(OUTDIR, "latest.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# 主動式 ETF 監看清單(台股權益型;經理人選股)
FUNDS = [
    {"code": "00991A", "name": "復華未來50",   "house": "fhtrust", "etf": "ETF23"},
    {"code": "00998A", "name": "復華金融股息", "house": "fhtrust", "etf": "ETF24"},
    {"code": "00981A", "name": "統一台股增長", "house": "ezmoney", "fc": "49YTW"},
    {"code": "00403A", "name": "統一升級50",   "house": "ezmoney", "fc": "63YTW"},
]

# 台股 stock code regex: 4-6 digits + optional letter suffix
# 含特別股 (2882A)、新股 5-6 位、L/R 槓桿反向等
STOCK_CODE_RE = r"^\d{4,6}[A-Z]?$"


def roc(d):
    return f"{d.year - 1911}/{d.month:02d}/{d.day:02d}"


def fetch(fund, d):
    """回傳 Excel bytes 或 None。"""
    s = requests.Session(); s.headers["User-Agent"] = UA
    try:
        if fund["house"] == "fhtrust":
            url = f"https://www.fhtrust.com.tw/api/assetsExcel/{fund['etf']}/{d:%Y%m%d}"
            r = s.get(url, timeout=30)
        else:
            url = "https://www.ezmoney.com.tw/ETF/Transaction/PCFExcelNPOI"
            r = s.get(url, params={"fundCode": fund["fc"], "date": roc(d), "specificDate": "true"}, timeout=30)
        if r.status_code == 200 and len(r.content) > 500:
            return r.content
    except Exception as e:
        print(f"  {fund['code']} 抓取失敗:{str(e)[:60]}")
    return None


def parse(content):
    """兩家格式通用:掃描含『代號』的表頭列,標準化為 代號/名稱/股數/權重。"""
    raw = pd.read_excel(io.BytesIO(content), header=None)
    hdr = None
    for i in range(min(30, len(raw))):
        if raw.iloc[i].astype(str).str.contains("代號").any():
            hdr = i; break
    if hdr is None:
        return None
    df = pd.read_excel(io.BytesIO(content), header=hdr)

    def col(keys):
        for c in df.columns:
            if any(k in str(c) for k in keys):
                return c
        return None
    # 「配置比重」也算 · 之前只認「權重/比重」有些檔案漏
    ci, cn, cs, cw = col(["代號"]), col(["名稱"]), col(["股數"]), col(["權重", "比重", "配置"])
    if not (ci and cs):
        return None
    out = pd.DataFrame({
        "代號": df[ci].astype(str).str.replace(r"\.0$", "", regex=True).str.strip(),
        "名稱": df[cn].astype(str).str.strip() if cn else "",
        "股數": pd.to_numeric(df[cs].astype(str).str.replace(",", ""), errors="coerce"),
        "權重": pd.to_numeric(df[cw].astype(str).str.replace("%", ""), errors="coerce") if cw else None,
    })
    # 5-6 位 code + 字母尾綴皆保留(2882A 特別股 / 00631L 槓桿 / 5-6 位新股)
    out = out[out["代號"].str.match(STOCK_CODE_RE)].dropna(subset=["股數"])
    return out.set_index("代號")


def snapshot_path(code, d):
    return os.path.join(OUTDIR, f"{code}_{d:%Y%m%d}.csv")


def save_snapshot(code, d, df):
    os.makedirs(OUTDIR, exist_ok=True)
    df.reset_index().to_csv(snapshot_path(code, d), index=False, encoding="utf-8-sig")


def prev_snapshot(code, before):
    """讀此 code 的前一個快照(早於 before 的最新一個)。"""
    files = sorted(glob.glob(os.path.join(OUTDIR, f"{code}_*.csv")))
    files = [f for f in files if f < snapshot_path(code, before)]
    if not files:
        return None
    df = pd.read_csv(files[-1], dtype={"代號": str})
    return df.set_index("代號"), os.path.basename(files[-1])


def diff(cur, prev):
    sa, sb = set(prev.index), set(cur.index)
    new = [(s, cur.loc[s, "名稱"], cur.loc[s, "權重"]) for s in sb - sa]
    drop = [(s, prev.loc[s, "名稱"], prev.loc[s, "權重"]) for s in sa - sb]
    chg = []
    for s in sa & sb:
        p0 = prev.loc[s, "股數"]
        d = cur.loc[s, "股數"] - p0
        if not d or not p0:
            continue
        w0 = prev.loc[s, "權重"]
        # 期初基數過小(權重<0.1% 或 股數極微)→ 視為「建倉」,不算百分比
        # (否則 分母趨0 → +84344% 之類的爆表假訊號)
        build = (pd.notna(w0) and w0 < 0.1) or p0 < 1000
        pct = None if build else d / p0 * 100
        chg.append((s, cur.loc[s, "名稱"], pct, cur.loc[s, "權重"], build))
    # 建倉(pct=None)排最前,其餘按變動幅度大→小
    chg.sort(key=lambda x: (1e9 if x[2] is None else abs(x[2])), reverse=True)
    return new, drop, chg


def pull_day(d):
    """抓+存當日所有基金快照,回傳 {code: df}。"""
    out = {}
    for fund in FUNDS:
        content = fetch(fund, d)
        if content is None:
            continue
        cur = parse(content)
        if cur is None or cur.empty:
            continue
        save_snapshot(fund["code"], d, cur)
        out[fund["code"]] = cur
    return out


def cross_fund(day_dfs):
    """跨基金分析:共同持有(共識核心)+ 買賣共識/分歧。"""
    codes = [c for c in day_dfs if not day_dfs[c].empty]
    if len(codes) < 2:
        return
    nm = {f["code"]: f["name"] for f in FUNDS}
    sets = [set(day_dfs[c].index) for c in codes]
    common = set.intersection(*sets)
    ref = day_dfs[codes[0]]
    print("🔥 跨基金『共同持有』(法人共識核心):")
    for s in sorted(common, key=lambda s: -(ref.loc[s, "權重"] if s in ref.index else 0))[:12]:
        ws = " | ".join(f"{nm[c][:2]}{day_dfs[c].loc[s, '權重']:.1f}%" for c in codes if s in day_dfs[c].index)
        nmstr = ref.loc[s, "名稱"] if s in ref.index else s
        print(f"   {s} {str(nmstr)[:5]:5s}  {ws}")
    print(f"   共同 {len(common)}檔 / 共 {len(codes)} 檔基金\n")


def compute_diff_consensus(today):
    """回傳 (log_lines, buy_dict, sell_dict) 供 diff_consensus + write_manifest 共用。
    log_lines: [str] 逐檔文字報告
    buy_dict: {stock_id: [fund_name, ...]}
    sell_dict: {stock_id: [fund_name, ...]}
    """
    buy, sell = {}, {}
    log = []
    per_fund_actions = {}   # 每檔的 new/drop/chg 給 manifest 用
    for fund in FUNDS:
        cur_f = snapshot_path(fund["code"], today)
        if not os.path.exists(cur_f):
            continue
        cur = pd.read_csv(cur_f, dtype={"代號": str}).set_index("代號")
        p = prev_snapshot(fund["code"], today)
        if not p:
            per_fund_actions[fund["code"]] = {"note": "no prev snapshot"}
            continue
        prev, pname = p
        new, drop, chg = diff(cur, prev)
        log.append(f"[{fund['code']} {fund['name']}] vs {pname}:")
        actions = {"new": [], "drop": [], "add": [], "reduce": [], "build": []}
        for s, n, w in new:
            log.append(f"   🟢新增 {s} {n}"); buy.setdefault(s, []).append(fund["name"])
            actions["new"].append({"code": s, "name": str(n), "weight": None if pd.isna(w) else float(w)})
        for s, n, w in drop:
            log.append(f"   🔴剔除 {s} {n}"); sell.setdefault(s, []).append(fund["name"])
            actions["drop"].append({"code": s, "name": str(n), "weight": None if pd.isna(w) else float(w)})
        for s, n, pct, w, build in chg[:8]:
            if build:
                log.append(f"   🆕建倉 {s} {n} (現權重{w}%)")
                buy.setdefault(s, []).append(fund["name"])
                actions["build"].append({"code": s, "name": str(n), "weight": None if pd.isna(w) else float(w)})
            else:
                bucket = "add" if pct > 0 else "reduce"
                log.append(f"   {'⬆️加' if pct > 0 else '⬇️減'} {s} {n} {pct:+.0f}%")
                (buy if pct > 0 else sell).setdefault(s, []).append(fund["name"])
                actions[bucket].append({"code": s, "name": str(n), "pct": float(pct), "weight": None if pd.isna(w) else float(w)})
        if not (new or drop or chg):
            log.append("   (無變化)")
        log.append("")
        per_fund_actions[fund["code"]] = actions
    return log, buy, sell, per_fund_actions


def diff_consensus(today):
    """以已存快照,算今日 vs 前一快照的跨基金買賣共識/分歧。"""
    log, buy, sell, _actions = compute_diff_consensus(today)
    for line in log:
        print(line)
    # 共識(≥2檔同方向)+ 分歧(一買一賣)
    mb = {s: set(f) for s, f in buy.items() if len(set(f)) >= 2}
    ms = {s: set(f) for s, f in sell.items() if len(set(f)) >= 2}
    div = {s: (set(buy.get(s, [])), set(sell.get(s, []))) for s in set(buy) & set(sell)}
    if mb:
        print("🔥🔥 共識加碼(多檔同買):", "、".join(f"{s}({'/'.join(v)})" for s, v in mb.items()))
    if ms:
        print("🔥🔥 共識減碼(多檔同砍):", "、".join(f"{s}({'/'.join(v)})" for s, v in ms.items()))
    if div:
        print("⚖️ 分歧(有人買有人砍):", "、".join(f"{s}(買{','.join(b)}|砍{','.join(se)})" for s, (b, se) in div.items()))
    if not (mb or ms or div):
        print("(無跨基金共識/分歧訊號)")


def write_manifest(today, day_dfs, per_fund_actions, buy, sell):
    """
    寫 latest.json manifest 給 browser 用。
    schema:
    {
      "date": "2026-07-10",
      "generated_at": "2026-07-10T18:35:00+08:00",
      "funds": [
        {"code": "00981A", "name": "統一台股增長", "snapshot": "00981A_20260710.csv",
         "holdings_count": 52, "actions": {...}}
      ],
      "consensus_buy": [{"stock_id": "2330", "name": "台積電", "funds": ["復華未來50", "統一台股增長"]}],
      "consensus_sell": [...],
      "divergence": [...]
    }
    """
    os.makedirs(OUTDIR, exist_ok=True)
    fund_lookup = {f["code"]: f for f in FUNDS}
    funds_data = []
    for code, df in day_dfs.items():
        f = fund_lookup.get(code, {})
        # 找該檔的名稱從 df 拿一支代表股票 (fallback)
        funds_data.append({
            "code": code,
            "name": f.get("name", code),
            "snapshot": os.path.basename(snapshot_path(code, today)),
            "holdings_count": int(len(df)),
            "actions": per_fund_actions.get(code, {}),
        })

    # 共識 / 分歧
    def to_list(d):
        return [
            {"stock_id": s, "funds": sorted(set(v))}
            for s, v in d.items() if len(set(v)) >= 2
        ]
    consensus_buy = to_list(buy)
    consensus_sell = to_list(sell)
    divergence = [
        {"stock_id": s, "buy_funds": sorted(set(buy.get(s, []))), "sell_funds": sorted(set(sell.get(s, [])))}
        for s in set(buy) & set(sell)
    ]

    # 補上 stock name (從當日任一 df 抓)
    def enrich_name(items):
        for it in items:
            sid = it["stock_id"]
            for df in day_dfs.values():
                if sid in df.index:
                    nm = df.loc[sid, "名稱"]
                    if pd.notna(nm):
                        it["name"] = str(nm)
                        break
            it.setdefault("name", sid)
        return items

    enrich_name(consensus_buy)
    enrich_name(consensus_sell)
    enrich_name(divergence)

    manifest = {
        "date": today.strftime("%Y-%m-%d"),
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "funds": funds_data,
        "consensus_buy": consensus_buy,
        "consensus_sell": consensus_sell,
        "divergence": divergence,
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n📝 寫入 {MANIFEST_PATH}: {len(funds_data)} 檔 / 共識買 {len(consensus_buy)} / 共識賣 {len(consensus_sell)} / 分歧 {len(divergence)}")


def week_report():
    """讀所有已存快照,做近一週每檔淨變化 + 期初期末共識。"""
    nm = {f["code"]: f["name"] for f in FUNDS}
    print("\n========== 近期持股趨勢(全部已存快照)==========")
    for fund in FUNDS:
        files = sorted(glob.glob(os.path.join(OUTDIR, f"{fund['code']}_*.csv")))
        if len(files) < 2:
            continue
        a = pd.read_csv(files[0], dtype={"代號": str}).set_index("代號")
        b = pd.read_csv(files[-1], dtype={"代號": str}).set_index("代號")
        d0, d1 = files[0][-12:-4], files[-1][-12:-4]
        print(f"\n━━ {fund['code']} {fund['name']}  {d0}→{d1} ━━")
        new, drop, chg = diff(b, a)
        if new: print("  🟢期間新進:", "、".join(f"{s}{n}" for s, n, w in new))
        if drop: print("  🔴期間剔除:", "、".join(f"{s}{n}" for s, n, w in drop))
        for s, n, pct, w, build in [x for x in chg if x[2] is None or abs(x[2]) >= 10][:8]:
            if build:
                print(f"   🆕建倉 {s}{n} (現權重{w}%)")
            else:
                print(f"   {'⬆️加' if pct > 0 else '⬇️減'} {s}{n} {pct:+.0f}% (現權重{w}%)")


def parse_env_date(s):
    """安全解析 ETF_DATE 環境變數 · 支援 YYYYMMDD · 失敗回 None。"""
    if not s:
        return None
    try:
        return pd.to_datetime(s, format="%Y%m%d").date()
    except Exception as e:
        print(f"⚠️ ETF_DATE={s!r} 格式不正確(需 YYYYMMDD):{e}")
        return None


def main():
    backfill = int(os.environ.get("ETF_BACKFILL_DAYS", "0") or "0")
    if backfill > 0:
        end = date.today()
        print(f"=== 回補近 {backfill} 天主動式ETF快照 ===\n")
        last_day_dfs = None
        for i in range(backfill, -1, -1):
            d = end - timedelta(days=i)
            got = pull_day(d)
            print(f"  {d:%Y/%m/%d}: {len(got)} 檔基金有資料")
            if got:
                last_day_dfs = (d, got)
        week_report()
        # 用最後一個有資料的日期寫 manifest
        if last_day_dfs:
            d, dfs = last_day_dfs
            _log, buy, sell, actions = compute_diff_consensus(d)
            write_manifest(d, dfs, actions, buy, sell)
        return

    today = parse_env_date(os.environ.get("ETF_DATE", "").strip()) or date.today()
    print(f"=== 主動式 ETF 持股監看 {today:%Y/%m/%d} ===\n")
    day_dfs = pull_day(today)
    if not day_dfs:
        print("今日無資料(假日/未公告)")
        return
    _log, buy, sell, actions = compute_diff_consensus(today)
    for line in _log:
        print(line)
    # 印共識
    mb = {s: set(f) for s, f in buy.items() if len(set(f)) >= 2}
    ms = {s: set(f) for s, f in sell.items() if len(set(f)) >= 2}
    div = {s: (set(buy.get(s, [])), set(sell.get(s, []))) for s in set(buy) & set(sell)}
    if mb:
        print("🔥🔥 共識加碼(多檔同買):", "、".join(f"{s}({'/'.join(v)})" for s, v in mb.items()))
    if ms:
        print("🔥🔥 共識減碼(多檔同砍):", "、".join(f"{s}({'/'.join(v)})" for s, v in ms.items()))
    if div:
        print("⚖️ 分歧(有人買有人砍):", "、".join(f"{s}(買{','.join(b)}|砍{','.join(se)})" for s, (b, se) in div.items()))
    if not (mb or ms or div):
        print("(無跨基金共識/分歧訊號)")
    print()
    cross_fund(day_dfs)
    write_manifest(today, day_dfs, actions, buy, sell)


if __name__ == "__main__":
    main()
