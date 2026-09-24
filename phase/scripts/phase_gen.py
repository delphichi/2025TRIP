#!/usr/bin/env python3
"""★★★ 相位儀產生器 —— 給最多 7 支美股代號，產出一份自足的互動網頁

   用法：
     python3 scripts/us/phase_gen.py FTNT PANW CRWD NET ZS S OKTA
     python3 scripts/us/phase_gen.py MSFT V MA --out ~/Desktop/payments.html --title 支付三雄

   ★ 三個軸（與手工版一致）：
     相位 Phase 0~4　①營收近4季YoY全正 ②近2季均YoY>前2季均 ③EPS絕對年增4季中≥3正 ④FCF同上
     動能 Momentum　 近2季均YoY − 前2季均（連續值，pp）
     品質 Quality 0~3　EPS正季≥3 / FCF正季≥3 / ROE≥15% 各一分

   ★★ 內建的五道防線（全部是實戰換來的，見 valuation-engine/CLAUDE.md）：
     #530 一條序列只用一個標籤　　Mastercard 同時申報毛營收 6,428 與淨營收 4,155
     #531 單季由累計差分，依會計年 MSFT 7~6月、V 10~9月，用日曆年分組會錯
     #532 負基期不算百分比　　　　ZS 的 EPS −0.05→−0.21 算百分比是「+320%」
     ★ 新增：股票分割自動偵測　　 FTNT 5:1 分割，SEC 只回溯調整 2020 之後
     #533 一手優先　　　　　　　　資料全部來自 SEC XBRL，不用二手彙整

   ⚠ 只支援美股。台股走 MOPS，是另一條管線。
"""
import sys, json, re, pathlib, importlib.util, datetime as dt, statistics as st, urllib.request, ssl

D = pathlib.Path(__file__).parent
ssl._create_default_https_context = ssl._create_unverified_context
def _load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m); return m
SF = _load("sf", D/"sec_facts.py"); QF = _load("qf", D/"qflow.py")

# ★ 七色：紅 橘 黃 綠 藍 紫 黑（深色模式另備一組，亮度提高）
PAL = [("#c0392b","#e0715f"), ("#cf7620","#e09a4f"), ("#b3901c","#d6b64a"),
       ("#2f8055","#4bab77"), ("#2a6aa8","#5b9ad6"), ("#75459e","#a072cc"),
       ("#2f3330","#9aa39c")]
NAMES = ["紅","橘","黃","綠","藍","紫","黑"]
UA = {"User-Agent": "Mozilla/5.0"}

def px_series(tk, years=5):
    p1 = int((dt.datetime.now(dt.UTC)-dt.timedelta(days=365*years+40)).timestamp())
    p2 = int(dt.datetime.now(dt.UTC).timestamp())
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{tk}?period1={p1}&period2={p2}&interval=1d"
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=45))["chart"]["result"][0]
    q = d["indicators"]["quote"][0]
    return [(dt.datetime.fromtimestamp(t, dt.UTC).date(), c, v or 0)
            for t, c, v in zip(d["timestamp"], q["close"], q["volume"]) if c is not None]

def detect_break(A):
    """★★★ 用『一手股數』找每股基準的不連續點。回傳 (年, 倍數) 或 (None, 1)。

       ★★ 不要叫它「股票分割」—— 實測七家資安股，跳動的原因至少三種：
           FTNT 2020  4.79x  ★ 真分割（5:1，2022 年），SEC 只把 2020 起回溯重編
           NET 2020 / CRWD 2021 / S 2022  ★★ IPO —— 上市前加權股數不含特別股
           PANW 2023  2.32x  ★★ 由虧轉盈，稀釋股數才開始計入可轉債（反稀釋效果解除）
       三者都會讓跨期每股數字不可比，但成因不同，所以只報「不連續」與倍數。

       ★★ 2026-09-24 改：原本用「淨利 ÷ EPS」反推 —— EPS 趨近 0 時分母爆炸，
       OKTA 2025 反推 466.7M（一手 175.1M），憑空生出一次「1:3 分割」。
       一手數字存在就不要反推（#532 那個坑換一個地方長出來）。"""
    sh = A.get("shares") or {}
    yrs = sorted(y for y in sh if sh[y])
    if len(yrs) < 2: return None, 1
    for i in range(len(yrs)-1, 0, -1):          # ★ 由近而遠，只回報最近的一次
        r = sh[yrs[i]] / sh[yrs[i-1]]
        if r > 1.4 or r < 1/1.4:
            return yrs[i], round(r, 2)
    return None, 1


def detect_merger(gwQ, qs):
    """★★ 軌跡窗（最近 8 季）內商譽單季跳增 >30% ⇒ 期間做了重大併購。
       營收 YoY 會灌進被併公司的量，相位看起來在加速，但那不是內生成長。
       PANW 2026Q1 商譽 6,931M → 21,902M（CyberArk）；CRWD 1,363M → 2,267M。

       ★★★ 用商譽，不用權益。權益是被動科目 —— FTNT 權益只有 1.5B 而 TTM 盈餘 2.1B，
       單季盈餘就能讓權益 +60%，被誤判成併購；反過來大買庫藏股會把權益壓到趨近 0，
       回升時算出「28.2x」。商譽只有買公司才會跳，是併購的一手訊號。
       ★ 教訓同「一手股數 vs 淨利÷EPS」：一手科目存在，就不要用比值去猜。"""
    win = qs[-8:] if len(qs) >= 8 else qs
    if not win: return None, None
    ks = [x for x in sorted(gwQ) if x >= win[0]]
    best = (None, None, 0)
    for i in range(1, len(ks)):            # ★ 取窗內「最大」一筆，不是第一筆
        a, b = gwQ[ks[i-1]], gwQ[ks[i]]
        if a and a > 0 and b / a > max(1.3, best[2]):
            best = (ks[i], round(b / a, 1), b / a)
    return best[0], best[1]


def yoy_pct(s, k):
    if k not in s: return None
    c = [x for x in s if abs((dt.date.fromisoformat(k)-dt.date.fromisoformat(x)).days-365) <= 45 and x < k]
    if not c: return None
    pv = s[max(c)]
    return None if (pv is None or pv <= 0) else (s[k]/pv-1)*100      # ★ #532
def yoy_abs(s, k):
    if k not in s: return None
    c = [x for x in s if abs((dt.date.fromisoformat(k)-dt.date.fromisoformat(x)).days-365) <= 45 and x < k]
    return None if not c else s[k]-s[max(c)]

def pv_at(ser, day):
    idx = [i for i,(d,_,_) in enumerate(ser) if d <= day]
    if not idx: return None
    i = idx[-1]; px = ser[i][1]
    def back(n):
        tgt = ser[i][0]-dt.timedelta(days=n)
        j = [k for k,(d,_,_) in enumerate(ser) if d <= tgt]
        return ser[j[-1]][1] if j else None
    a, b, c = back(182), back(91), back(28)
    if not (a and b and c): return None
    v10 = [v for _,_,v in ser[max(0,i-9):i+1]]; v13 = [v for _,_,v in ser[max(0,i-64):i+1]]
    vr = st.mean(v10)/st.mean(v13) if v13 and st.mean(v13) else 0
    g = [px/a-1 > 0, px/b-1 > 0, px/c-1 > 0, vr >= 1.0]   # ★ 26W / 13W / 4W / 量比
    return sum(g), vr, (px/a-1)*100, (px/b-1)*100, (px/c-1)*100, g

def build(tk):
    cik, name = SF.cik_of(tk)
    if not cik: return None, f"{tk} 在 SEC 查不到 CIK（★ 只支援美股）"
    f = SF.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", f"cf_{tk}.json")["facts"].get("us-gaap", {})
    if not f: return None, f"{tk} 無 us-gaap 資料"
    A, Qp = {}, {}
    for k, keys in SF.TAGS.items(): A[k], Qp[k] = SF.series(f, keys, k in SF.POINT)
    rev = QF.quarterly(f, SF.TAGS["revenue"]) or Qp.get("revenue", {})
    ni  = QF.quarterly(f, SF.TAGS["net"])     or Qp.get("net", {})
    ocf = QF.quarterly(f, SF.TAGS["ocf"]); cap = QF.quarterly(f, SF.TAGS["capex"])
    eps, eqQ = Qp.get("eps", {}), Qp.get("equity", {})
    fcf = {k: ocf[k]-cap.get(k, 0) for k in ocf}
    qs = sorted(rev)[-24:]
    if len(qs) < 8: return None, f"{tk} 季資料只有 {len(qs)} 期（需 ≥8）"
    rows = []
    for k in qs:
        de = sorted([x for x in eps if x <= k]); dn = sorted([x for x in ni if x <= k])
        ek = [x for x in sorted(eqQ) if x <= k]; eq = eqQ[ek[-1]] if ek else None
        tn = sum(ni[x] for x in dn[-4:]) if len(dn) >= 4 else None
        rows.append(dict(q=k, rev=rev.get(k), rev_yoy=yoy_pct(rev, k),
            eps=eps.get(k), eps_d=yoy_abs(eps, k), fcf=fcf.get(k), fcf_d=yoy_abs(fcf, k),
            ttm=sum(eps[x] for x in de[-4:]) if len(de) >= 4 else None,
            roe=(tn/eq*100) if (tn is not None and eq and eq > 0) else None))
    def snap(i):
        w = rows[:i+1]
        rv = [x["rev_yoy"] for x in w if x["rev_yoy"] is not None]
        if len(rv) < 4: return None
        e = [x["eps_d"] for x in w if x["eps_d"] is not None]
        fc = [x["fcf_d"] for x in w if x["fcf_d"] is not None]
        s1 = all(v > 0 for v in rv[-4:]); s2 = sum(rv[-2:])/2 > sum(rv[-4:-2])/2
        s3 = len(e) >= 3 and sum(1 for v in e[-4:] if v > 0) >= 3
        s4 = len(fc) >= 3 and sum(1 for v in fc[-4:] if v > 0) >= 3
        return dict(ph=sum([s1,s2,s3,s4]), mom=round(sum(rv[-2:])/2-sum(rv[-4:-2])/2, 2),
                    epsn=sum(1 for v in e[-4:] if v > 0) if e else 0,
                    fcfn=sum(1 for v in fc[-4:] if v > 0) if fc else 0,
                    s=[s1,s2,s3,s4],
                    # ★ 四階的原始讀數 —— 讓卡片能列出「憑什麼過／憑什麼沒過」
                    rv4=[round(v, 1) for v in rv[-4:]],
                    a2=round(sum(rv[-2:])/2, 1), b2=round(sum(rv[-4:-2])/2, 1))
    traj = [x for x in (snap(i) for i in range(len(rows))) if x][-8:]
    cur = traj[-1]
    ser = px_series(tk)
    now = ser[-1]
    pvp = [pv_at(ser, dt.date.fromisoformat(r["q"])) for r in rows[-7:]]
    pvnow = pv_at(ser, now[0])
    hi52 = max(c for d,c,_ in ser if d >= now[0]-dt.timedelta(days=365))
    brk_y, fac = detect_break(A)
    mg_q, mg_x = detect_merger(Qp.get("goodwill", {}), qs)
    q = (1 if cur["epsn"] >= 3 else 0)+(1 if cur["fcfn"] >= 3 else 0)+(1 if (rows[-1]["roe"] or -9) >= 15 else 0)
    return dict(t=tk, n=name, ph=cur["ph"], mom=cur["mom"], q=q, s=cur["s"],
        epsn=cur["epsn"], fcfn=cur["fcfn"],
        rv4=cur["rv4"], a2=cur["a2"], b2=cur["b2"],
        roe=round(rows[-1]["roe"],1) if rows[-1]["roe"] is not None else None,
        ttm=round(rows[-1]["ttm"],2) if rows[-1]["ttm"] is not None else None,
        px=round(now[1],2), dhi=round((hi52-now[1])/hi52*100,1),
        pv=pvnow[0] if pvnow else 0, vr=round(pvnow[1],2) if pvnow else None,
        r26=round(pvnow[2],1) if pvnow else None, r13=round(pvnow[3],1) if pvnow else None,
        r4=round(pvnow[4],1) if pvnow else None,
        pvs=pvnow[5] if pvnow else [False]*4,
        spark=[round(r["rev_yoy"],1) for r in rows[-8:] if r["rev_yoy"] is not None],
        path=[[x["mom"], x["ph"]] for x in traj],
        pvpath=[[traj[i]["mom"] if i < len(traj) else cur["mom"],
                 (pvp[i][0] if i < len(pvp) and pvp[i] else 0)] for i in range(len(pvp))]
                + [[cur["mom"], pvnow[0] if pvnow else 0]],
        nq=len(traj),
        brk=(f"{brk_y} 年 {fac}x" if brk_y else None),
        mrg=(f"{mg_q} 商譽 {mg_x}x" if mg_q else None),
        asof=str(now[0])), None

TPL = pathlib.Path(__file__).parent/"phase_tpl.html"

def main():
    # ★★ 旗標的「值」也要排除，否則 --out /tmp/x.html 會把路徑當成第 7 支代號
    av, args, out, title = sys.argv[1:], [], "phase_out.html", "相位儀"
    i = 0
    while i < len(av):
        a = av[i]
        if a == "--out":     out   = av[i+1] if i+1 < len(av) else out;   i += 2
        elif a == "--title": title = av[i+1] if i+1 < len(av) else title; i += 2
        elif a.startswith("--"): i += 1
        else: args.append(a); i += 1
    # ★ #518：GitHub Actions 的 workflow_dispatch 輸入會混入 \ufeff 等不可見字元
    tks = [t for t in (re.sub(r"[^A-Za-z0-9.\-]", "", a).upper() for a in args) if t][:7]
    if not tks: print(__doc__); sys.exit(1)
    if len(args) > 7: print(f"★ 一頁最多 7 支，已取前 7：{' '.join(tks)}")
    data, warn = [], []
    for i, t in enumerate(tks):
        print(f"  [{i+1}/{len(tks)}] {t} …", end="", flush=True)
        d, err = build(t)
        if err: print(f" ✗ {err}"); warn.append(err); continue
        d["c"], d["c2"], d["cn"] = PAL[i][0], PAL[i][1], NAMES[i]
        data.append(d)
        print(f" ✓ 相位 {d['ph']}　動能 {d['mom']:+.1f}pp　品質 {d['q']}/3"
              + (f"　★ 每股基準斷點 {d['brk']}" if d["brk"] else "")
              + (f"　★★ 重大併購 {d['mrg']}" if d["mrg"] else ""))
    if not data: print("★ 沒有任何一支成功"); sys.exit(1)
    tpl = TPL.read_text()
    html = (tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False))
               .replace("__TITLE__", title)
               .replace("__ASOF__", data[0]["asof"])
               .replace("__WARN__", json.dumps(warn, ensure_ascii=False))
               .replace("__LIVE__", "false")      # ★ 靜態檔不能抓，表頭鎖住
               .replace("__INIT__", '""'))
    p = pathlib.Path(out).expanduser(); p.write_text(html)
    print(f"\n★★ {len(data)} 支 ⇒ {p}（{len(html):,} bytes）")

if __name__ == "__main__": main()
