#!/usr/bin/env python3
"""★★★ 定期定額試算器（台股 ＋ 美股，含息 vs 不含息）

   用法：
     python3 phase/scripts/dca_gen.py 0050 0056 00878 --out dca/index.html
     python3 phase/scripts/dca_gen.py SPY QQQ VOO --amount 500 --title 美股定期定額
     python3 phase/scripts/dca_gen.py 0050 0056 SPY QQQ --base TWD   # ★ 台美混合，逐月換匯

   ★ 每月第一個交易日投入固定金額，算三種情境：
       A 含息 · 配息再投入   配息在除息日收盤價買回，股數持續增加
       B 含息 · 配息領現金   配息累積為現金不再投入（股數＝定額買進的部分）
       C 不含息 · 只看股價   完全忽略配息 —— ★ 這是大多數人看盤軟體看到的數字

   ★★ 三個一定會算錯的地方，全部處理掉：

     ① 無償配股／分割造成的斷點。★ Yahoo 對 0050 在 2014-01-02 有 4.010 倍跳空，
        而且它記錄的 splits 是 0、連 Adj Close 都是壞的 —— 不修的話跨過該日的
        定期定額會憑空蒸發四分之三。這裡改成自動偵測，判準是
        「價格跳空接近某個單純比例 ★且成交金額在同一天是連續的」——
        真實崩盤會讓成交金額同步塌陷，不會通過這一關。

     ② 報酬率要用 IRR（資金加權）。錢是分 N 次進場的，最後一筆只放一個月，
        用「總報酬開根號」會嚴重低估。

     ③ 成交量用成交金額（收盤 × 股數）而非張數。分割會改變張數的計數單位，
        用張數比會讓分割前的量能被低估數倍。

   ★★ 台股配股（盈餘轉增資）Yahoo 記在 splits，★ 但 raw Close 已經還原過 ——
      不可以再拿去乘股數，否則重複計算。實測 raw Close + dividends 再投入
      已能重現 Adj Close（四檔誤差 <0.4%）。splits 僅作資訊顯示。

   ⚠ 混用不同幣別時：加 --base TWD 會逐月換匯，全部以台幣計價（匯率效果一併算進去）；
     不加則各自用原幣別，此時絕對金額不可跨標的比較，只有 % 與 IRR 可比。
"""
import sys, json, re, ssl, math, pathlib, datetime as dt, statistics as st, urllib.request

D = pathlib.Path(__file__).parent
ssl._create_default_https_context = ssl._create_unverified_context
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
# 標的色：先用 c5/c6（情境色沒用到的紫與青），
# 3 支以上才回頭借用情境色 —— 那時只出現在散點圖，該區沒有情境線，且 chips 有文字標籤
PAL = ["--c5", "--c6", "--tr", "--pr", "--cash", "--base"]
MAXT = 6
SPLITS = [2, 3, 4, 5, 6, 8, 10, 20]        # ★ 常見分割／合併比例
# ★ Yahoo 對台股 ETF 只回英文長名（0050 = "Yuanta/P-shares Taiwan Top 50 ETF"），
#   塞進圖例會被截成「0050 Yuanta/」。常用的先查表，查不到才退回 Yahoo 的名字。
TWN = {"0050":"台灣50","0051":"中型100","0052":"富邦科技","0055":"寶金融","0056":"高股息",
       "0057":"富邦摩台","00646":"S&P500","00662":"NASDAQ","00692":"富邦公司治理",
       "00713":"低波高息","00850":"ESG永續","00878":"永續高息","00881":"5G+",
       "00891":"關鍵半導","00892":"富邦半導體","00900":"富邦特選高息","00913":"兆豐台灣優息",
       "00915":"凱基優選高息","00918":"大華優利高填息","00919":"群益精選高息",
       "00929":"復華科技優息","00930":"永豐ESG","00935":"野村臺灣新科技",
       "00939":"統一台灣高息","00940":"元大價值高息","009800":"元大美國50",
       # ★ 個股（Yahoo 對台股個股同樣只回英文，2881 = "Fubon Financial Holding"）
       "2330":"台積電","2317":"鴻海","2454":"聯發科","2308":"台達電","2412":"中華電",
       "2881":"富邦金","2882":"國泰金","2884":"玉山金","2885":"元大金","2886":"兆豐金",
       "2891":"中信金","2892":"第一金","2880":"華南金","2890":"永豐金","2801":"彰銀",
       "2883":"凱基金","2887":"台新新光金","2812":"台中銀","5880":"合庫金","2889":"國票金",
       "1301":"台塑","1303":"南亞","1326":"台化","2002":"中鋼","2207":"和泰車",
       "2603":"長榮","2609":"陽明","2615":"萬海","3008":"大立光","2379":"瑞昱",
       "009806":"元大美債","009814":"國泰美債","0061":"寶滬深","006208":"富邦台50"}

def chart(sym, years=25):
    p1 = int((dt.datetime.now(dt.UTC)-dt.timedelta(days=365*years)).timestamp())
    p2 = int(dt.datetime.now(dt.UTC).timestamp())
    u = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
         f"?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit")
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
    r = d["chart"]["result"][0]; m = r["meta"]; q = r["indicators"]["quote"][0]
    ser = [(dt.datetime.fromtimestamp(t, dt.UTC).date(), c, v or 0)
           for t, c, v in zip(r["timestamp"], q["close"], q["volume"]) if c is not None]
    EV = (r.get("events") or {})
    div = sorted((dt.datetime.fromtimestamp(int(x["date"]), dt.UTC).date(), float(x["amount"]))
                 for x in (EV.get("dividends") or {}).values())
    # ★★★ splits 只作資訊顯示，★ 絕對不要拿來乘股數 ——
    #   實測 Yahoo 的 raw Close 已經還原過分割（富邦金配股日價格只動 −2.4%~+1.1%），
    #   再乘一次就是重複計算。驗證：raw Close + dividends 再投入 vs Adj Close，
    #   富邦金 1691.2% vs 1697.7%、元大金 944.8% vs 946.0%、0056 427.3% vs 428.4%、
    #   SPY 848.7% vs 848.0% —— 四檔全部吻合，代表 raw Close + dividends 已經完整。
    spl = sorted((dt.datetime.fromtimestamp(int(x["date"]), dt.UTC).date(),
                  (float(x.get("numerator", 0)) / float(x.get("denominator", 1)))
                  if x.get("denominator") else float(x.get("splitRatio", "1").split(":")[0] or 1))
                 for x in (EV.get("splits") or {}).values())
    spl = [(d_, r_) for d_, r_ in spl if r_ and abs(r_-1) > 1e-6]
    return ser, div, spl, (m.get("currency") or "?"), (m.get("longName") or m.get("shortName") or sym)

def find_break(ser):
    """★★★ 斷點偵測 —— 只在「價格跳空接近單純比例」★且「成交金額連續」時才認定。
       真實崩盤（如 2008）成交金額會同步放大或塌陷，比值不會落在容許區間內，
       所以不會被誤修。回傳 (日期, 比值) 或 None。"""
    out = []
    for i in range(1, len(ser)):
        p0, p1 = ser[i-1][1], ser[i][1]
        if not p0 or not p1: continue
        ratio = p0/p1
        if 0.8 < ratio < 1.25: continue                  # 正常波動
        cand = next((s for s in SPLITS
                     if abs(ratio-s) < s*0.03 or abs(ratio-1/s) < (1/s)*0.03), None)
        if not cand: continue
        # ★ 成交金額必須連續（±40% 內）——這一關把真實崩盤擋掉
        w = 5
        a0 = [c*v for _, c, v in ser[max(0, i-w):i] if v]
        a1 = [c*v for _, c, v in ser[i:i+w] if v]
        if not a0 or not a1: continue
        amt = (st.mean(a1)/st.mean(a0)) if st.mean(a0) else 0
        if not (0.6 < amt < 1.4): continue
        out.append((ser[i][0], round(ratio, 4), round(amt, 3)))
    return out

def fix(ser, div, brks):
    """★ 把斷點之前的價格除以比值、成交量乘以比值 —— 兩者同基準，成交金額才不變"""
    for bd, ratio, _ in brks:
        ser = [(d_, (c/ratio if d_ < bd else c), (v*ratio if d_ < bd else v)) for d_, c, v in ser]
        div = [(d_, (a/ratio if d_ < bd else a)) for d_, a in div]
    return ser, div

def monthly(ser, div, spl):
    mo = {}
    for d_, c, v in ser: mo.setdefault((d_.year, d_.month), []).append((d_, c, v))
    ks = sorted(mo)
    rec, vol = [], []
    for k in ks:
        rows = mo[k]; bd, ed = rows[0], rows[-1]
        ds = [[round(a, 4), round(next((c for d2, c, _ in reversed(rows) if d2 <= dd), ed[1]), 4)]
              for dd, a in div if (dd.year, dd.month) == k]
        sp = 1.0
        for dd, r_ in spl:
            if (dd.year, dd.month) == k: sp *= r_
        rec.append([f"{k[0]}-{k[1]:02d}", round(bd[1], 4), round(ed[1], 4), ds, round(sp, 6)])
        amt = [c*v for _, c, v in rows if v]
        vol.append(round(st.mean(amt)/1e8, 4) if amt else 0.0)
    return rec, vol

def fx_series(pair="TWD=X"):
    """★★ 台灣人每月拿固定台幣去買美股 ETF，實際上是逐月換匯。
       不換匯就把「每月 10,000」同時當成 NT$10,000 與 US$10,000，
       兩邊的絕對金額差三十幾倍 —— 並列出來毫無意義。
       換匯之後全部以台幣計價才比得了，而且會把匯率效果一起吃進來
       （實測 00662 對 QQQ 的超額 +2.59pp 就是這個）。
       ⚠ Yahoo 對 TWD=X 偶有 1.80 / 3.67 之類的垃圾值，先用區間過濾掉。"""
    try:
        ser, _, _, _, _ = chart(pair)
    except Exception:
        return None
    mo = {}
    for d_, c, _ in ser:
        if c and 20 < c < 45: mo.setdefault((d_.year, d_.month), []).append((d_, c))
    if len(mo) < 24: return None
    return {f"{k[0]}-{k[1]:02d}": [round(sorted(v)[0][1], 4), round(sorted(v)[-1][1], 4)]
            for k, v in mo.items()}

def build(code):
    cands = [code] if not code.isdigit() else [code+".TW", code+".TWO"]
    for sym in cands:
        try:
            ser, div, spl, ccy, name = chart(sym)
            if len(ser) < 250: continue
        except Exception:
            continue
        # ★ Yahoo 對改制前的代碼會回 placeholder：價格不動、成交量 0
        #   （元大金 2002-01 整月都是 14.52 且量 0，2002-02-04 才真正上市）
        st = 0
        for i in range(len(ser)-1):
            if ser[i][2] > 0 and ser[i][1] != ser[i+1][1]: st = i; break
        if st: ser = ser[st:]; div = [x for x in div if x[0] >= ser[0][0]]; spl = [x for x in spl if x[0] >= ser[0][0]]
        brks = find_break(ser)
        if brks: ser, div = fix(ser, div, brks)
        rec, vol = monthly(ser, div, spl)
        if len(rec) < 13: continue
        tri, sh = [], 1.0
        for _, _, ep, ds, _sp in rec:
            for a, dp in ds:
                if dp: sh *= (1+a/dp)
            tri.append(round(sh*ep/rec[0][2], 6))
        v0 = next((rec[i][0] for i in range(len(vol)-5)
                   if all(vol[j] >= 0.001 for j in range(i, i+6))), None)
        nm = f"{code} {TWN[code]}" if code in TWN else (f"{code} {name}"[:20] if code.isdigit() else code)
        tsp = 1.0
        for _, r_ in spl: tsp *= r_
        return dict(t=code, sym=sym, nm=nm, ccy=ccy,
                    m=rec, v=vol, tri=tri, v0=v0,
                    nsp=len(spl), tsp=round(tsp, 4),
                    brk=[[str(b), r] for b, r, _ in brks]), None
    return None, f"{code} Yahoo 查不到或資料太短"

def main():
    av, args = sys.argv[1:], []
    out, title, amt, base = "dca.html", "定期定額試算", 10000, ""
    i = 0
    while i < len(av):
        a = av[i]
        if   a == "--out":    out   = av[i+1]; i += 2
        elif a == "--title":  title = av[i+1]; i += 2
        elif a == "--amount": amt   = int(re.sub(r"[^\d]", "", av[i+1]) or 10000); i += 2
        elif a == "--base":   base  = av[i+1].upper(); i += 2
        elif a.startswith("--"): i += 1
        else: args.append(a); i += 1
    flat = [w for a in args for w in re.split(r"[,\s]+", a) if w]
    tks, seen = [], set()
    for w in flat:
        t = re.sub(r"[^A-Za-z0-9.\-]", "", w).upper()
        if t and t not in seen: seen.add(t); tks.append(t)
    tks = tks[:MAXT]
    if not tks: print(__doc__); sys.exit(1)
    if len(flat) > MAXT: print(f"★ 一頁最多 {MAXT} 支，已取前 {MAXT}：{' '.join(tks)}")

    print(f"★★ 定期定額試算　每月 {amt:,}　{len(tks)} 支\n")
    data, warn = [], []
    for i, t in enumerate(tks):
        print(f"  [{i+1}/{len(tks)}] {t} …", end="", flush=True)
        try: d, err = build(t)
        except Exception as e: d, err = None, f"{t} {type(e).__name__}: {e}"
        if err: print(f" ✗ {err}"); warn.append(err); continue
        d["c"] = PAL[len(data) % len(PAL)]
        data.append(d)
        print(f" ✓ {d['sym']:<10}{d['ccy']}　{d['m'][0][0]}~{d['m'][-1][0]} {len(d['m'])} 月"
              f"　總報酬指數 {(d['tri'][-1]/d['tri'][0]-1)*100:+.0f}%"
              + (f"　★ 自動修正斷點 {d['brk']}" if d["brk"] else "")
              + (f"　（配股 {d['nsp']} 次 {d['tsp']}x，已含在還原價裡）" if d["nsp"] else "")
              + (f"　★ 量能自 {d['v0']}" if d["v0"] and d["v0"] != d["m"][0][0] else ""))
    if not data: sys.exit("★ 全部失敗")
    ccys = sorted({d["ccy"] for d in data})
    FX = None
    if len(ccys) > 1:
        if base == "TWD" and ccys == ["TWD", "USD"]:
            FX = fx_series()
            if FX: print(f"\n★ 逐月換匯（USD/TWD，{len(FX)} 個月）—— 全部以台幣計價，匯率效果已含在內")
            else:  print("\n★ 匯率取不到 ⇒ 退回不換匯")
        if not FX:
            print(f"\n★ 混用幣別 {ccys} —— 最終資產的絕對金額不可跨標的比較，只有 % 與 IRR 可比")
    tpl = (D/"dca_tpl.html").read_text()
    html = (tpl.replace("__DATA__", json.dumps({d["t"]: d for d in data}, ensure_ascii=False))
               .replace("__ORDER__", json.dumps([d["t"] for d in data]))
               .replace("__AMT__", str(amt))
               .replace("__TITLE__", title)
               .replace("__MIXED__", json.dumps(len(ccys) > 1 and not FX))
               .replace("__FX__", json.dumps(FX))
               .replace("__BASE__", json.dumps(base if FX else "")) 
               .replace("__WARN__", json.dumps(warn, ensure_ascii=False)))
    p = pathlib.Path(out).expanduser(); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html)
    print(f"\n★★ {len(data)} 支 ⇒ {p}（{len(html):,} bytes）")

if __name__ == "__main__": main()
