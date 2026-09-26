#!/usr/bin/env python3
"""★★★ ETF 相位儀（台股 ＋ 美股合併）

   用法：
     python3 phase/scripts/etf_phase_gen.py 0050 0056 00878 SPY QQQ VT
     python3 phase/scripts/etf_phase_gen.py 0050 QQQ --out etf/index.html --view px

   ★ 與個股相位儀的差別：ETF 沒有 SEC XBRL、也沒有月營收 ⇒ 沒有「基本面相位」。
     三個視角全部建立在價量之上：
       pv  價量相位 0~4　26W / 13W / 4W 漲跌各為正，＋ 10 日均量 ÷ 13 週均量 ≥ 1.0
       mq  量價四象限　　x 該月相對量能（%）× y 該月報酬（%）
       px  價位 × 量能　 x 該月相對量能（%）× y 相對 12 個月前的累計報酬（%）

   ★★ 三個混台美一定會算錯的地方，全部處理掉：

     ① 價格報酬 ≠ 總報酬。0056／00878／00919 配息很重，只看股價會把它們
        低估到不成比例（本 session 先前就踩過這個坑）。所有報酬一律用
        Yahoo 的 adjclose（還原息值），股價欄才用原始 close。
        另外獨立列出「配息貢獻 ＝ 總報酬 − 價格報酬」。

     ② 成交金額不能直接相加。台股是 TWD、美股是 USD，差三十幾倍。
        熱力圖的面積若不換匯，台股 ETF 會整片吃掉畫面。一律用 TWD=X
        換成 USD 再比。

     ③ 00662／00646 這類台幣計價的美股 ETF，報酬裡已經含了匯率。
        跟 QQQ／VOO 擺在一起時，兩者的差就是匯率貢獻 —— 這是特色不是 bug，
        所以幣別要標出來，讓人知道自己在比什麼。

   ⚠ Yahoo 對台股 ETF 偶爾有無償配股造成的斷點（0050 2014-01-02、
     0052 2025-11-17，實測連 adjclose 都是壞的）。單日跳動超過 ±35%
     會標記出來而不是默默算下去。
"""
import sys, json, re, ssl, pathlib, datetime as dt, statistics as st, urllib.request

D = pathlib.Path(__file__).parent
ssl._create_default_https_context = ssl._create_unverified_context
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
PAL = [("#c0392b","#e0715f"), ("#cf7620","#e09a4f"), ("#b3901c","#d6b64a"),
       ("#2f8055","#4bab77"), ("#2a6aa8","#5b9ad6"), ("#75459e","#a072cc"),
       ("#2f3330","#9aa39c"), ("#1d7a86","#4fb3bf"), ("#8c3c6b","#c06d9c"),
       ("#5a6b21","#93a84d"), ("#a34a2a","#d17d5c"), ("#3b4a7a","#7186bd")]
MAX = 12

def color(i, n):
    if i < len(PAL): return PAL[i]
    h = (i*360/max(n,1) + 8) % 360
    return (f"hsl({h:.0f} 52% 38%)", f"hsl({h:.0f} 58% 62%)")

def chart(sym, days=520):
    """★ 一次取 close ＋ adjclose ＋ volume ＋ 幣別與名稱"""
    p1 = int((dt.datetime.now(dt.UTC)-dt.timedelta(days=days)).timestamp())
    p2 = int(dt.datetime.now(dt.UTC).timestamp())
    u = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
         f"?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit")
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=45))
    r = d["chart"]["result"][0]; m = r["meta"]; q = r["indicators"]["quote"][0]
    adj = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose") or q["close"]
    ser = [(dt.datetime.fromtimestamp(t, dt.UTC).date(), c, a, v or 0)
           for t, c, a, v in zip(r["timestamp"], q["close"], adj, q["volume"])
           if c is not None and a is not None]
    return (ser, m.get("currency") or "?",
            (m.get("longName") or m.get("shortName") or sym),
            (m.get("shortName") or m.get("longName") or sym))

def resolve(code):
    """★ 純數字 ⇒ 台股：先試 .TW 再試 .TWO；字母 ⇒ 美股直接用"""
    cands = [code] if not code.isdigit() else [code+".TW", code+".TWO"]
    for s in cands:
        try:
            ser, ccy, name, short = chart(s)
            if len(ser) > 60: return s, ser, ccy, name, short
        except Exception:
            continue
    return None, None, None, None, None

def fx_twd():
    """★ TWD=X ＝ 1 USD 換多少 TWD。拿不到就回 None，寧可不畫熱力圖也不要畫錯的"""
    try:
        ser, _, _, _ = chart("TWD=X", days=40)
        v = [c for _, c, _, _ in ser if c and 20 < c < 45]
        return v[-1] if v else None
    except Exception:
        return None

def breaks(ser):
    """★ 無償配股斷點偵測 —— 單日還原後仍跳動 ±35% 以上，視為資料有問題"""
    out = []
    for i in range(1, len(ser)):
        a, b = ser[i-1][2], ser[i][2]
        if a and b and (b/a-1 < -0.35 or b/a-1 > 0.6):
            out.append(f"{ser[i][0]} {(b/a-1)*100:+.0f}%")
    return out

def pv(ser):
    """★ 價量四階 ＋ 讀數。★★ 報酬一律用 adjclose（含息），不用 close"""
    i = len(ser)-1
    def back(n):
        tgt = ser[i][0]-dt.timedelta(days=n)
        j = [k for k, (d_, _, _, _) in enumerate(ser) if d_ <= tgt]
        return ser[j[-1]] if j else None
    a, b, c = back(182), back(91), back(28)
    if not (a and b and c): return None
    now_a = ser[i][2]
    v10 = [v for _, _, _, v in ser[max(0, i-9):i+1]]
    v13 = [v for _, _, _, v in ser[max(0, i-64):i+1]]
    vr = st.mean(v10)/st.mean(v13) if v13 and st.mean(v13) else 0
    r = [(now_a/a[2]-1)*100, (now_a/b[2]-1)*100, (now_a/c[2]-1)*100]
    g = [r[0] > 0, r[1] > 0, r[2] > 0, vr >= 1.0]
    return sum(g), vr, r[0], r[1], r[2], g

def monthly(ser):
    """★ 12 個月的量價軌跡。y 用 adjclose（總報酬），標籤顯示原始 close（看盤價）"""
    mo = {}
    for d_, c_, a_, v_ in ser:
        mo.setdefault((d_.year, d_.month), []).append((c_, a_, v_))
    ks = sorted(mo)[-13:]
    if len(ks) < 8: return None
    avgv = {k: st.mean([v for _, _, v in mo[k]]) for k in ks}
    base = st.mean([avgv[k] for k in ks]) or 1
    out = []
    for i in range(1, len(ks)):
        pa, ca = mo[ks[i-1]][-1][1], mo[ks[i]][-1][1]
        if not pa: continue
        out.append([round((avgv[ks[i]]/base-1)*100, 1), round((ca/pa-1)*100, 2),
                    f"{ks[i][0]}/{ks[i][1]:02d}", round(mo[ks[i]][-1][0], 2), ca])
    return out or None

def _short(code, short, long_):
    """★ 圖上標籤要短。Yahoo 對台股 ETF 常回整串英文（Yuanta/P-shares Taiwan Top 50 ETF），
       塞進畫布會蓋掉別人 —— 先查常用中文名，查不到就退回代號。"""
    TWN = {"0050":"元大台灣50","0051":"中型100","0052":"富邦科技","0055":"寶金融",
           "0056":"元大高股息","00646":"S&P500","00662":"NASDAQ","00713":"低波高息",
           "00757":"NASDAQ科技","00850":"ESG永續","00878":"國泰永續高息",
           "00891":"中信關鍵半導","00892":"富邦半導體","00919":"群益台灣精選高息",
           "00929":"復華科技優息","00940":"元大台灣價值高息","009800":"元大美國50",
           "009806":"元大美債","009814":"國泰美債"}
    if code in TWN: return TWN[code]
    s = (short or long_ or code).strip()
    for junk in (" ETF", " Trust", " Index Fund", " Fund"):
        s = s.replace(junk, "")
    return s[:14] if s else code

def build(code, fx):
    sym, ser, ccy, name, short = resolve(code)
    if not ser: return None, f"{code} Yahoo 查不到或資料太短"
    P = pv(ser)
    if not P: return None, f"{code} 價格序列不足 26 週"
    M = monthly(ser)
    if not M: return None, f"{code} 月數不足"
    close_now, adj_now = ser[-1][1], ser[-1][2]
    # ★ 價格報酬 vs 總報酬 —— 差額就是配息貢獻
    i0 = [k for k, (d_, _, _, _) in enumerate(ser) if d_ <= ser[-1][0]-dt.timedelta(days=365)]
    pr = tr = div = None
    if i0:
        c0, a0 = ser[i0[-1]][1], ser[i0[-1]][2]
        if c0 and a0:
            pr = round((close_now/c0-1)*100, 1)
            tr = round((adj_now/a0-1)*100, 1)
            div = round(tr-pr, 1)
    # ★ 4 週成交金額換成 USD，台美才比得了
    amt = sum(c*v for _, c, _, v in ser[-20:])
    usd = amt/fx if (ccy == "TWD" and fx) else (amt if ccy == "USD" else None)
    return dict(
        t=code, sym=sym, n=name, n2=_short(code, short, name), ccy=ccy,
        px=round(close_now, 2),
        pv=P[0], vr=round(P[1], 2),
        r26=round(P[2], 1), r13=round(P[3], 1), r4=round(P[4], 1), pvs=P[5],
        pr1y=pr, tr1y=tr, div1y=div,
        v4=(round(usd/1e6, 1) if usd else None),          # 百萬美元
        mq=[[a, b] for a, b, _, _, _ in M],
        mqq=[c for _, _, c, _, _ in M],
        mqpx=[p for _, _, _, p, _ in M],
        pxpath=([[a, round((e/M[0][4]-1)*100, 1)] for a, _, _, _, e in M]
                if M[0][4] else []),
        brk=(breaks(ser) or None),
        asof=str(ser[-1][0])), None

def main():
    av, args, out, title, view = sys.argv[1:], [], "etf_phase.html", "ETF 相位儀", "px"
    i = 0
    while i < len(av):
        a = av[i]
        if   a == "--out":   out   = av[i+1] if i+1 < len(av) else out;   i += 2
        elif a == "--title": title = av[i+1] if i+1 < len(av) else title; i += 2
        elif a == "--view":  view  = av[i+1] if i+1 < len(av) else view;  i += 2
        elif a.startswith("--"): i += 1
        else: args.append(a); i += 1
    flat = [w for a in args for w in re.split(r"[,\s]+", a) if w]
    tks, seen = [], set()
    for w in flat:
        t = re.sub(r"[^A-Za-z0-9.\-]", "", w).upper()
        if t and t not in seen: seen.add(t); tks.append(t)
    tks = tks[:MAX]
    if not tks: print(__doc__); sys.exit(1)
    if len(flat) > MAX: print(f"★ 一頁最多 {MAX} 支，已取前 {MAX}：{' '.join(tks)}")

    fx = fx_twd()
    print(f"★★ ETF 相位儀　{len(tks)} 支"
          + (f"　USD/TWD {fx:.3f}" if fx else "　★ 匯率取不到 ⇒ 台股成交金額不換算、熱力圖略過"))
    data, warn = [], []
    for i, t in enumerate(tks):
        print(f"  [{i+1}/{len(tks)}] {t} …", end="", flush=True)
        try: d, err = build(t, fx)
        except Exception as e: d, err = None, f"{t} {type(e).__name__}: {e}"
        if err: print(f" ✗ {err}"); warn.append(err); continue
        data.append(d)
        print(f" ✓ {d['sym']:<10}{d['ccy']}　價量 {d['pv']}/4　量比 {d['vr']}"
              f"　1年總報酬 {d['tr1y']:+.1f}%（配息 {d['div1y']:+.1f}pp）"
              + (f"　★ 斷點 {d['brk'][0]}" if d["brk"] else ""))
    if not data: sys.exit("★ 全部失敗")
    data.sort(key=lambda d: (-(d["tr1y"] if d["tr1y"] is not None else -999)))
    for i, d in enumerate(data):
        d["c"], d["c2"] = color(i, len(data))
    tpl = (D/"etf_phase_tpl.html").read_text()
    if view in ("pv", "px") and view != "pv":
        tpl = tpl.replace('let YK="pv"', f'let YK="{view}"')
        for k in ("pv", "px"):
            tpl = tpl.replace(f'aria-pressed="{"true" if k=="pv" else "false"}" data-y="{k}"',
                              f'aria-pressed="{str(k==view).lower()}" data-y="{k}"')
    html = (tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False))
               .replace("__TITLE__", title)
               .replace("__FX__", json.dumps(fx))
               .replace("__ASOF__", data[0]["asof"])
               .replace("__WARN__", json.dumps(warn, ensure_ascii=False)))
    p = pathlib.Path(out).expanduser(); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html)
    print(f"\n★★ {len(data)} 支 ⇒ {p}（{len(html):,} bytes）")

if __name__ == "__main__": main()
