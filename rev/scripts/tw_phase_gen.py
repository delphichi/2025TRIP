#!/usr/bin/env python3
"""★★★ 台股相位儀 —— 月營收版

   美股版用季報（營收/EPS/FCF）；台股沒有免費的月頻 EPS 與現金流，
   所以四階全部改用「月營收年增率」重新定義。★ 不同的資料，不同的尺。

   ── 基本面相位（0~4）★ 只問成長的方向與廣度 ──
     ① 近 6 個月 YoY 全正
     ② 近 3 個月均 YoY ＞ 前 3 個月均（加速）
     ③ 今年累計 YoY ＞ 0
     ④ 近 12 個月裡正成長 ≥ 9 個月

   ── 動能 M ＝ 近 3 月均 YoY − 前 3 月均 YoY（pp，連續值）──

   ── 品質（0~3）★★ 刻意不放進相位 —— 階是「走到哪」，品質是「這個數字能不能信」──
     ① 近 12 月 YoY 標準差 < 25（全市場 P50=21、P85≈60）
     ② 36 個月裡正成長 ≥ 28 個月（長期紀錄）
     ③ 最新月 YoY 與今年累計 YoY 同號　★★★ 台股金融股專屬陷阱：
        國泰金最新月 −69.46% 而累計 +62.5%、富邦金 −48% 而累計 +172%
        —— 壽險型金控的月數字含投資部位評價損益，單月與累計會打架。

   ── 價量相位（0~4）── 26 週 / 13 週 / 4 週漲跌幅各為正，＋ 10 日均量 ÷ 13 週均量 ≥ 1.0

   用法：python3 scripts/tw/tw_phase_gen.py 2884 2890 ... [--out x.html] [--title 名稱]
         python3 scripts/tw/tw_phase_gen.py --ind 金融保險業        # 整個產業
"""
import sys, json, csv, ssl, time, pathlib, statistics as st, datetime as dt, urllib.request

D   = pathlib.Path(__file__).parent
RAW = D/"raw"
ssl._create_default_https_context = ssl._create_unverified_context
UA  = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
OUT   = pathlib.Path(sys.argv[sys.argv.index("--out")+1])   if "--out"   in sys.argv else D/"tw_phase.html"
TITLE = sys.argv[sys.argv.index("--title")+1]               if "--title" in sys.argv else "台股相位儀"
IND   = sys.argv[sys.argv.index("--ind")+1]                 if "--ind"   in sys.argv else None
TRAJ  = 12                                   # ★ 軌跡期數（月）

# ★ 前 7 支用指定色，超過則沿色相環補 —— 產業別動輒二三十家
PAL = [("#c0392b","#e0715f"),("#cf7620","#e09a4f"),("#b3901c","#d6b64a"),
       ("#2f8055","#4bab77"),("#2a6aa8","#5b9ad6"),("#75459e","#a072cc"),
       ("#2f3330","#9aa39c")]
def color(i, n):
    if i < len(PAL) and n <= len(PAL): return PAL[i]
    h = (i*360/max(n,1) + 8) % 360
    return (f"hsl({h:.0f} 52% 38%)", f"hsl({h:.0f} 58% 62%)")

HS = sorted(RAW.glob("rev_hist_*m.json"), key=lambda p: int(p.stem.split("_")[-1][:-1]), reverse=True)
if not HS: sys.exit("★★ 缺 raw/rev_hist_*m.json ⇒ 先跑 rev_bulk.py --history 36")
HIST = json.loads(HS[0].read_text())
BL = sorted(RAW.glob("rev_bulk_*.json"))
BULK = json.loads(BL[-1].read_text()) if BL else {}

def ordk(t):
    y, m = t.split("/"); return int(y)*12 + int(m)

def px(code):
    """★ Yahoo 先試 .TW，失敗再試 .TWO（上櫃）"""
    p1 = int((dt.datetime.now(dt.UTC)-dt.timedelta(days=430)).timestamp())
    p2 = int(dt.datetime.now(dt.UTC).timestamp())
    for sfx in (".TW", ".TWO"):
        try:
            u = (f"https://query1.finance.yahoo.com/v8/finance/chart/{code}{sfx}"
                 f"?period1={p1}&period2={p2}&interval=1d")
            d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=45))
            r = d["chart"]["result"][0]; q = r["indicators"]["quote"][0]
            s = [(dt.datetime.fromtimestamp(t, dt.UTC).date(), c, v or 0)
                 for t, c, v in zip(r["timestamp"], q["close"], q["volume"]) if c is not None]
            if len(s) > 60: return s
        except Exception:
            continue
    return None

def pv(ser):
    """★ 價量四階 + 四個原始讀數"""
    if not ser: return None
    i = len(ser)-1; now = ser[i][1]
    def back(n):
        tgt = ser[i][0]-dt.timedelta(days=n)
        j = [k for k, (d_, _, _) in enumerate(ser) if d_ <= tgt]
        return ser[j[-1]][1] if j else None
    a, b, c = back(182), back(91), back(28)
    if not (a and b and c): return None
    v10 = [v for _, _, v in ser[max(0, i-9):i+1]]
    v13 = [v for _, _, v in ser[max(0, i-64):i+1]]
    vr = st.mean(v10)/st.mean(v13) if v13 and st.mean(v13) else 0
    g = [now/a-1 > 0, now/b-1 > 0, now/c-1 > 0, vr >= 1.0]
    return sum(g), vr, (now/a-1)*100, (now/b-1)*100, (now/c-1)*100, g, now, \
           sum(cl*vv for _, cl, vv in ser[-20:])/1e8      # ★ 近 4 週成交金額（億元）

def seqbase(rv, pairs):
    """★★★ 拆開「營收自己在動」與「去年基期在動」——只看 YoY 分不出這兩件事。
       彰銀 115/06~08 平均 47.36 億是 15 個月最高（環比 +9.3%），
       但去年同期 114/06~08 恰好也是最旺（基期 +15.7%）
       ⇒ YoY 動能 −6.4pp 讀起來像減速，實際營收自己在加速。
       回傳 (近3月營收億, 前3月營收億, 環比%, 基期變化%)"""
    ts = [t for t, _ in pairs]
    if len(ts) < 6: return None
    def tot(seg):
        v = [rv.get(t) for t in seg]
        return sum(v)/1e5 if all(x is not None for x in v) else None
    a, b = tot(ts[-3:]), tot(ts[-6:-3])
    if not a or not b: return None
    # 去年同期：把年份減 1
    back = lambda t: f"{int(t.split('/')[0])-1}/{t.split('/')[1]}"
    la, lb = tot([back(t) for t in ts[-3:]]), tot([back(t) for t in ts[-6:-3]])
    # ★★ 基期為負或趨近 0 時，百分比沒有意義（凱基金算出 −385.5%）——
    #    這是 SOP #536「凡是比值先問分母」的同一個坑，直接回 None 不要硬算。
    bse = round((la/lb-1)*100, 1) if (la and lb and la > 0 and lb > 0) else None
    return round(a,2), round(b,2), round((a/b-1)*100,1), bse

def monthly_pv(ser):
    """★★★ 近 12 個月的『量價』軌跡 —— 每個點是一個月。
       x ＝ 該月日均量 ÷ 近 12 月日均量 − 1（相對量能 %）
       y ＝ 該月漲跌幅（%）
       ⇒ 右上 量增價漲、左上 量縮價漲、右下 量增價跌、左下 量縮價跌。
       ★ 比原本「0~4 階」細得多，而且四象限本身就有讀法。"""
    if not ser or len(ser) < 60: return None
    mo = {}
    for d_, c, v in ser:
        mo.setdefault((d_.year, d_.month), []).append((d_, c, v))
    ks = sorted(mo)[-13:]                       # ★ 13 個月才算得出 12 個漲跌幅
    if len(ks) < 8: return None
    avgv = {k: (st.mean([v for _, _, v in mo[k]]) if mo[k] else 0) for k in ks}
    base = st.mean([avgv[k] for k in ks]) or 1
    out = []
    for i in range(1, len(ks)):
        prev_close = mo[ks[i-1]][-1][1]
        cur_close  = mo[ks[i]][-1][1]
        if not prev_close: continue
        out.append([round((avgv[ks[i]]/base-1)*100, 1),
                    round((cur_close/prev_close-1)*100, 2),
                    f"{ks[i][0]}/{ks[i][1]:02d}"])
    return out or None

def snap(ser, cum):
    """★ ser ＝ 依時間排好的 YoY 陣列（最後一個是最新月）"""
    if len(ser) < 6: return None
    g1 = all(v > 0 for v in ser[-6:])
    g2 = st.mean(ser[-3:]) > st.mean(ser[-6:-3])
    g3 = (cum is not None and cum > 0)
    w12 = ser[-12:]
    g4 = sum(1 for v in w12 if v > 0) >= 9 if len(w12) >= 9 else False
    mom = st.mean(ser[-3:]) - st.mean(ser[-6:-3])
    return dict(ph=sum([g1, g2, g3, g4]), mom=round(mom, 2), s=[g1, g2, g3, g4],
                m3=round(st.mean(ser[-3:]), 1), m6=round(st.mean(ser[-6:-3]), 1),
                p12=sum(1 for v in w12 if v > 0), n12=len(w12),
                sd=round(st.pstdev(w12), 1) if len(w12) >= 6 else None)

def build(code):
    mm = (HIST.get("yoy") or {}).get(code)
    if not mm: return None, f"{code} 無月營收資料"
    pairs = sorted(((t, v) for t, v in mm.items() if v is not None), key=lambda x: ordk(x[0]))
    if len(pairs) < 12: return None, f"{code} 只有 {len(pairs)} 個月"
    b = BULK.get(code, {})
    cum = b.get("cum_yoy")
    cur = snap([v for _, v in pairs], cum)
    if not cur: return None, f"{code} 月數不足"
    traj = []
    for k in range(TRAJ, 0, -1):
        sub = pairs[:len(pairs)-k+1]
        if len(sub) < 6: continue
        sn = snap([v for _, v in sub], cum)
        # ★★ 縱軸改用「近 12 月正成長月數」(0~12)：比 0~4 階細，而且不受
        #    第 ③ 階（累計 YoY 只有當期值）沿用歷史值的問題影響。
        if sn: traj.append([sn["mom"], sn["p12"], sub[-1][0], sn["m3"]])
    SB = seqbase((HIST.get("rev") or {}).get(code) or {}, pairs)
    ser = px(code)
    P = pv(ser) if ser else None
    MP = monthly_pv(ser) if ser else None
    q = ((1 if (cur["sd"] or 99) < 25 else 0)
         + (1 if sum(1 for _, v in pairs if v > 0) >= 28 else 0)
         + (1 if (cum is not None and pairs[-1][1] * cum > 0) else 0))
    name = b.get("name") or (HIST.get("name") or {}).get(code) or code
    return dict(t=code, n=name, ind=b.get("ind") or "—", mk=b.get("market") or "—",
                ph=cur["ph"], mom=cur["mom"], q=q, s=cur["s"],
                m3=cur["m3"], m6=cur["m6"], p12=cur["p12"], n12=cur["n12"],
                sd=cur["sd"], cum=(round(cum, 1) if cum is not None else None),
                last=round(pairs[-1][1], 2), lastm=pairs[-1][0],
                cp=next((i for i, v in enumerate(v for _, v in reversed(pairs)) if v <= 0), len(pairs)),
                pos36=sum(1 for _, v in pairs if v > 0), nq=len(pairs),
                rev=(round(b["rev"]/1e5, 1) if b.get("rev") else None),
                s3=(SB[0] if SB else None), s6=(SB[1] if SB else None),
                seq=(SB[2] if SB else None), bse=(SB[3] if SB else None),
                # ★ 動能為負但營收環比為正 ⇒ 是基期墊高，不是業績減速
                fake=(1 if (SB and SB[2] is not None and cur["mom"] < 0 and SB[2] > 0) else 0),
                spark=[round(v, 1) for _, v in pairs[-12:]],
                # ★ lvl：縱軸＝近 3 月平均 YoY（成長水準，連續值、不飽和）
                #   path：縱軸＝近 12 月正成長月數（滾動計數器，每月最多 ±1、幾乎只升不降 ⇒ 會飽和）
                lvl=[[t[0], t[3]] for t in traj],
                path=[[t[0], t[1]] for t in traj],
                pathq=[t[2] for t in traj],
                px=(round(P[6], 2) if P else None), pv=(P[0] if P else 0),
                vr=(round(P[1], 2) if P else None),
                r26=(round(P[2], 1) if P else None), r13=(round(P[3], 1) if P else None),
                r4=(round(P[4], 1) if P else None), pvs=(P[5] if P else [False]*4),
                v4=(round(P[7], 1) if P else 0),
                pvpath=[[a, b] for a, b, _ in (MP or [])],
                pvq=[c for _, _, c in (MP or [])],
                volrel=(MP[-1][0] if MP else None),
                chg1m=(MP[-1][1] if MP else None)), None

def main():
    codes = [a for a in sys.argv[1:] if a.isdigit()]
    if IND:
        codes = [c for c, v in BULK.items() if v.get("ind") == IND]
    if not codes: print(__doc__); sys.exit(1)
    print(f"★★ 台股相位儀　{len(codes)} 檔\n")
    data, bad = [], []
    for i, c in enumerate(sorted(codes), 1):
        try: d, err = build(c)
        except Exception as e: d, err = None, f"{c} {type(e).__name__}"
        if err: bad.append(err); print(f"  [{i}/{len(codes)}] {c} ✗ {err}", flush=True); continue
        data.append(d)
        print(f"  [{i}/{len(codes)}] {c} {d['n']:<8}相位 {d['ph']}　動能 {d['mom']:+7.1f}pp　"
              f"品質 {d['q']}/3　價量 {d['pv']}　sd {d['sd']}"
              + (f"　★ 基期效應（環比 {d['seq']:+.1f}%）" if d["fake"] else ""), flush=True)
        time.sleep(0.25)
    if not data: sys.exit("★ 全部失敗")
    data.sort(key=lambda d: (-d["ph"], -d["mom"]))
    for i, d in enumerate(data):
        d["c"], d["c2"] = color(i, len(data))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.with_suffix(".csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["代號","名稱","產業","相位","動能pp","品質","價量階","近3月均YoY","前3月均YoY",
                    "近3月營收(億)","前3月營收(億)","環比%","基期變化%","基期效應",
                    "近12月正成長","近12月標準差","今年累計YoY","最新月YoY","連續正成長月",
                    "收盤","4w%","13w%","26w%","量比","4週成交金額(億)"])
        for d in data:
            w.writerow([d["t"],d["n"],d["ind"],d["ph"],d["mom"],d["q"],d["pv"],d["m3"],d["m6"],
                        d["s3"],d["s6"],d["seq"],d["bse"],("★ 是" if d["fake"] else ""),
                        d["p12"],d["sd"],d["cum"],d["last"],d["cp"],d["px"],d["r4"],d["r13"],
                        d["r26"],d["vr"],d["v4"]])
    ym = str(HIST.get("latest") or "")
    tpl = (D/"tw_phase_tpl.html").read_text()
    OUT.write_text(tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False))
                      .replace("__TITLE__", TITLE)
                      .replace("__YM__", f"民國 {ym[:3]} 年 {int(ym[3:]):02d} 月" if len(ym)==5 else ym)
                      .replace("__TS__", dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
                      .replace("__WARN__", json.dumps(bad, ensure_ascii=False)))
    print(f"\n★★ {len(data)} 檔 ⇒ {OUT}")
    print(f"✓ {OUT.with_suffix('.csv')}")

if __name__ == "__main__": main()
