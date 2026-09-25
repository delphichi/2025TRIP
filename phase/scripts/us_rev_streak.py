#!/usr/bin/env python3
"""★★★ S&P 500 季營收 YoY 連續成長統計 → HTML + CSV

   對每一家算：① 最近連續正成長季數 ② 近 20 季正成長季數 ③ 最近連續負成長季數

   ★★ 為什麼不用 SEC frames（那個「一次回全市場」的 bulk 端點）：
      frames 只收公司「實際申報過」的單季事實，而多數公司不單獨申報財年第四季
      （Q4 只存在於年報的全年數字裡）。實測 2026-09-24：
          CY2025Q1  3,915 家　CY2025Q2  3,938 家　CY2025Q3  3,657 家
          CY2025Q4 ★★ 791 家 ← 塌陷
      每家每年缺一季，連續季數會被切碎 ⇒ ★ 快 110 倍但答案是錯的。
      改走 companyfacts + qflow（年初至今累計差分還原單季），完整但較慢（503 家約 7~10 分）。

   ★ 標籤只用一條序列，不混用（#530）；YoY 用「一年前的同一季」對比（#531）。

   用法：python3 scripts/us/us_rev_streak.py [--out path/index.html] [--limit N] [--tickers A,B]
"""
import sys, json, csv, ssl, time, re, gzip, os, pathlib, datetime as dt, urllib.request

# ★★★ 批次掃描預設不留快取：503 家 × 平均 3.6 MB ≈ 1.8 GB，2026-09-24 實測把磁碟寫爆，
#   後續 205 家連鎖失敗、產出「看起來完整、實際漏四成」的榜單。
#   要留快取（反覆除錯時）：SEC_NO_CACHE=0 python3 ...
os.environ.setdefault("SEC_NO_CACHE", "1")

D = pathlib.Path(__file__).parent
sys.path.insert(0, str(D))
import sec_facts as SF, qflow as QF

ssl._create_default_https_context = ssl._create_unverified_context
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
OUT = pathlib.Path(sys.argv[sys.argv.index("--out")+1]) if "--out" in sys.argv else D/"us_rev_streak.html"
LIMIT = int(sys.argv[sys.argv.index("--limit")+1]) if "--limit" in sys.argv else 0
ONLY = sys.argv[sys.argv.index("--tickers")+1].split(",") if "--tickers" in sys.argv else None
NQ = 20                                        # ★ 近 20 季 ＝ 5 年

FALLBACK = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","TSLA","BRK-B","JPM",
            "LLY","V","XOM","UNH","MA","COST","HD","PG","JNJ","ABBV"]

def sp500():
    """★ Wikipedia 取成分股＋GICS 板塊；失敗用靜態 fallback（SOP #8：一定要帶 User-Agent）"""
    try:
        h = urllib.request.urlopen(urllib.request.Request(
            "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", headers=UA), timeout=60).read().decode()
        i = h.index('id="constituents"'); j = h.index("</table>", i)
        tb = h[h.rindex("<table", 0, i):j]
        out = []
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)[1:]:
            c = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).replace("&amp;", "&").strip()
                 for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
            if len(c) >= 4 and re.fullmatch(r"[A-Z][A-Z.\-]{0,6}", c[0]):
                out.append(dict(t=c[0].replace(".", "-"), n=c[1], sec=c[2], ind=c[3]))
        if len(out) > 400: return out
        print(f"★ Wikipedia 只解析出 {len(out)} 家 ⇒ 改用靜態清單")
    except Exception as e:
        print(f"★ Wikipedia 失敗（{type(e).__name__}）⇒ 改用靜態清單")
    return [dict(t=t, n=t, sec="—", ind="—") for t in FALLBACK]

def yoy_pct(s, k):
    """★ 找「一年前的同一季」（±45 天），不是往回數 4 筆 —— 季別會漂移（#531）"""
    c = [x for x in s if abs((dt.date.fromisoformat(k)-dt.date.fromisoformat(x)).days-365) <= 45 and x < k]
    if not c: return None
    pv = s[max(c)]
    return None if (pv is None or pv <= 0) else (s[k]/pv-1)*100

def streak(vals):
    """★ 與台股 rev_streak_report.py 同一套規則（正＝>0，負＝<=0）"""
    if len(vals) < 4: return None
    cp = cn = 0
    for v in reversed(vals):
        if v > 0: cp += 1
        else: break
    for v in reversed(vals):
        if v <= 0: cn += 1
        else: break
    return cp, sum(1 for v in vals if v > 0), cn, len(vals)

def one(tk):
    cik, name = SF.cik_of(tk)
    if not cik: return None, f"{tk} 查不到 CIK"
    f = SF.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", f"cf_{tk}.json")["facts"].get("us-gaap", {})
    if not f: return None, f"{tk} 無 us-gaap"
    rev = QF.quarterly(f, SF.TAGS["revenue"])
    if not rev: return None, f"{tk} 無季營收"
    qs = sorted(rev)
    ys = [(q, yoy_pct(rev, q)) for q in qs]
    ys = [(q, v) for q, v in ys if v is not None][-NQ:]
    if len(ys) < 4: return None, f"{tk} 可比季數只有 {len(ys)}"
    s = streak([v for _, v in ys])
    ttm = sum(rev[q] for q in qs[-4:])/1e9 if len(qs) >= 4 else None
    return dict(t=tk, name=name, cp=s[0], pos=s[1], cn=s[2], n=s[3],
                last=round(ys[-1][1], 2), lastq=ys[-1][0],
                ttm=round(ttm, 2) if ttm else None,
                spark=[round(v, 1) for _, v in ys[-8:]]), None

def main():
    uni = sp500()
    if ONLY: uni = [u for u in uni if u["t"] in ONLY] or [dict(t=t, n=t, sec="—", ind="—") for t in ONLY]
    if LIMIT: uni = uni[:LIMIT]
    print(f"★★ S&P 500 季營收連續成長統計　{len(uni)} 家　近 {NQ} 季\n")
    rows, bad, t0 = [], [], time.time()
    for i, u in enumerate(uni, 1):
        try: d, err = one(u["t"])
        except Exception as e: d, err = None, f"{u['t']} {type(e).__name__}"
        if err: bad.append(err)
        else:
            d.update(name=u["n"], sec=u["sec"], ind=u["ind"]); rows.append(d)
        if i % 25 == 0 or i == len(uni):
            print(f"  {i}/{len(uni)}　成功 {len(rows)}　失敗 {len(bad)}　{time.time()-t0:.0f}s", flush=True)
    rows.sort(key=lambda r: (-r["cp"], -r["pos"], r["cn"], r["t"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    csvp = OUT.with_suffix(".csv")
    with csvp.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["代號","公司","板塊","子產業","最近連續正成長季數","近20季正成長季數",
                    "最近連續負成長季數","可比季數","最新季YoY%","最新季","TTM營收(十億)"])
        for r in rows:
            w.writerow([r["t"],r["name"],r["sec"],r["ind"],r["cp"],r["pos"],r["cn"],r["n"],
                        r["last"],r["lastq"],r["ttm"] if r["ttm"] is not None else ""])
    tpl = (D/"us_rev_streak_tpl.html").read_text()
    OUT.write_text(tpl.replace("__DATA__", json.dumps(rows, ensure_ascii=False))
                      .replace("__TS__", dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
                      .replace("__N__", str(len(rows)))
                      .replace("__NQ__", str(NQ))
                      .replace("__BAD__", json.dumps(bad[:40], ensure_ascii=False))
                      .replace("__CSV__", csvp.name))
    print(f"\n★ 連續正成長 ≥8 季：{sum(1 for r in rows if r['cp']>=8):>4} 家")
    print(f"★ 連續正成長 ≥4 季：{sum(1 for r in rows if r['cp']>=4):>4} 家")
    print(f"★ 20 季正成長 ≥18：{sum(1 for r in rows if r['pos']>=18):>4} 家")
    print(f"★ 連續負成長 ≥4 季：{sum(1 for r in rows if r['cn']>=4):>4} 家")
    print(f"★ 沒納入 {len(bad)} 家")
    print(f"✓ {OUT}\n✓ {csvp}")

if __name__ == "__main__": main()
