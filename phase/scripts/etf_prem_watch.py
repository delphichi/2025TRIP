#!/usr/bin/env python3
"""★★★ ETF 折溢價每日監控 —— 異常才寄信

   折溢價 ＝ 市價 ÷ 淨值 − 1。正常的 ETF 應該貼在淨值附近（±0.5% 內）；
   ★ 持續溢價代表你買進時多付了錢，而那部分不會回到你身上。

   ⚠ 這支刻意設計成「有事才吵」：
     每天都寄 → 三天後你就不看了 → 真的出事那天也不會看。
     所以預設只在觸發門檻時寄信，平常只寫進 log。

   用法：
     python3 phase/scripts/etf_prem_watch.py 0050 0056 00878 --warn 1.0 --crit 2.0
     python3 phase/scripts/etf_prem_watch.py --list assets/etf_watch.txt --always

   環境變數：SMTP_USER / SMTP_PASS / NOTIFY_EMAIL（與既有 workflow 同一組）
"""
import sys, os, re, ssl, json, pathlib, datetime as dt, urllib.request

D = pathlib.Path(__file__).parent
ssl._create_default_https_context = ssl._create_unverified_context
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
TWN = {"0050":"台灣50","0051":"中型100","0052":"富邦科技","0053":"電子科技","0055":"寶金融",
       "0056":"高股息","00646":"S&P500","00662":"NASDAQ","00713":"低波高息","00850":"ESG永續",
       "00878":"永續高息","00881":"5G+","00891":"關鍵半導","00900":"富邦高息","00915":"凱基高息",
       "00918":"大華優利","00919":"群益精選高息","00929":"復華科技優息","00939":"統一高息",
       "00940":"元大價值高息","006208":"富邦台50","00692":"富邦公司治理"}

# ★★★ 分類門檻 —— 用同一組數字套所有 ETF 是錯的。
#   實測 99 檔：折溢價 >2% 的 11 檔「全部」是商品期貨／海外／主題型，
#   沒有一檔是台股主流股票型。原因是結構性的，不是誰出問題：
#     · 商品期貨 ETF 追的是期貨不是現貨，正逆價差本來就會反映在折溢價
#     · 海外股票 ETF 的淨值以當地收盤計算，台股盤中交易時那個淨值已經隔了一夜
#     · 槓桿／反向每日重設，折溢價波動天生較大
#   用單一門檻的話這 11 檔會天天觸發 ⇒ 變成雜訊信 ⇒ 你就不看了。
CAT_TH = {
    "tw":   (0.8, 1.5),    # 台股股票型：應該貼得很緊
    "ovs":  (1.5, 3.0),    # 海外股票：時區錯開，淨值天生落後一個交易日
    "cmdy": (2.5, 5.0),    # 商品期貨：正逆價差反映在折溢價，屬正常
    "lev":  (2.0, 4.0),    # 槓桿／反向：每日重設
    "bond": (1.0, 2.0),    # 債券
}
CAT_NM = {"tw":"台股股票","ovs":"海外股票","cmdy":"商品期貨","lev":"槓桿反向","bond":"債券"}
_OVS = {"00646","00662","00757","00668","00652","00657","00735","00762","00770","00876",
        "00885","00887","00893","00895","00896","00897","00903","00909","00916","00924",
        "00945","0061","009805","009800","SPY","QQQ","VOO","VT","VTI","IVV","VXUS"}
_CMDY = {"00635U","00642U","00738U"}
_BOND = {"00865B","00679B","00687B","00694B","00695B","009806","009807","BND","AGG"}

def category(code):
    c = code.upper()
    if c in _CMDY or c.endswith("U"): return "cmdy"
    if c.endswith("L") or c.endswith("R"): return "lev"
    if c in _BOND or c.endswith("B"): return "bond"
    if c in _OVS: return "ovs"
    return "tw"

def yield_pct(sym):
    """★★ 殖利率歷史百分位 —— 每月算「近 12 個月配息 ÷ 當月收盤」，看現在排第幾。
       ⚠ 這跟折溢價回答的是不同層次的問題：
         折溢價 ＝ 成交價 vs 淨值（交易面，今天）
         殖利率百分位 ＝ 現在 vs 自己的歷史（估值面，十年尺度）
       兩者會矛盾 —— 0050 今天折價 −0.25%（交易面沒買貴）
       但殖利率在第 4 百分位（估值面十三年來最貴）。矛盾本身就是資訊。
       ⚠ 至少 24 個月才算；不足回 None，不硬算。"""
    try:
        import yfinance as yf, pandas as pd
        tk = yf.Ticker(sym)
        d = yf.download(sym, start="2008-01-01", progress=False,
                        auto_adjust=False, threads=False)
        if d is None or d.empty: return None
        c = d["Close"]
        c = (c.iloc[:, 0] if hasattr(c, "columns") else c).dropna().astype(float)
        dv = tk.dividends
        if dv is None or len(dv) == 0: return None
        dv = dv.copy()
        try: dv.index = dv.index.tz_localize(None)
        except Exception: pass
        # ★ 無償配股斷點：只修「跌 ≥ 66.7%」的，門檻同 dca_gen（見那邊的實測說明）
        r = c.pct_change()
        for ix in r.index[(r < -0.667)]:
            prev = c.loc[:ix].iloc[-2] if len(c.loc[:ix]) > 1 else None
            if not prev: continue
            k = float(prev) / float(c.loc[ix])
            c.loc[c.index < ix] = c.loc[c.index < ix] / k
            dv.loc[dv.index < ix] = dv.loc[dv.index < ix] / k
        m = c.resample("ME").last()
        if len(m) < 24: return None
        ser = []
        for i in range(11, len(m)):
            lo, hi = m.index[i-11], m.index[i]
            t = float(dv[(dv.index > lo - pd.Timedelta(days=31)) & (dv.index <= hi)].sum())
            if t > 0 and float(m.iloc[i]) > 0:
                ser.append(t / float(m.iloc[i]) * 100)
        if len(ser) < 24: return None
        v = sorted(ser); now = ser[-1]
        q = lambda x: v[min(len(v)-1, int(len(v)*x))]
        return dict(now=round(now, 2), n=len(ser),
                    pct=round(sum(1 for z in v if z < now) / len(v) * 100),
                    p25=round(q(.25), 2), med=round(q(.5), 2), p75=round(q(.75), 2))
    except Exception:
        return None

def quote(sym):
    # ★ yfinance 對查不到的代碼會把 HTTP 錯誤印到 stdout，蓋掉整份報表版面。
    #   這裡靜音掉 —— resolve() 本來就會逐一嘗試後綴，失敗是預期內的事。
    import logging
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    """★ 用 yfinance 的 quoteSummary 取市價與淨值。
       ⚠ navPrice 是快照 —— 台股 ETF 的淨值一天只更新一次（收盤後），
         盤中拿到的可能是昨日值，所以下面會把兩邊的時間戳都印出來。"""
    import yfinance as yf
    i = yf.Ticker(sym).info
    nav = i.get("navPrice")
    px = i.get("regularMarketPrice") or i.get("previousClose")
    if not (nav and px): return None
    ts = i.get("regularMarketTime")
    return dict(sym=sym, nav=float(nav), px=float(px),
                prem=(float(px)/float(nav)-1)*100,
                ccy=i.get("currency") or "?",
                name=(i.get("longName") or i.get("shortName") or sym),
                ts=(dt.datetime.fromtimestamp(ts, dt.UTC).strftime("%Y-%m-%d %H:%M UTC")
                    if isinstance(ts, (int, float)) else None))

def resolve(code):
    # ★ 台股代碼可能帶字母（主動式 ETF 00981A），判準用「開頭是數字」
    cands = [code+".TW", code+".TWO"] if code[:1].isdigit() else [code]
    for s in cands:
        try:
            q = quote(s)
            if q: q["code"] = code; return q
        except Exception:
            continue
    return None

def level(p, warn, crit, cat=None, scale=1.0):
    """★ cat 有給就用該分類的門檻；scale 讓 workflow 的 --warn/--crit 當成倍率微調。"""
    if cat and cat in CAT_TH:
        warn, crit = CAT_TH[cat]
    warn *= scale; crit *= scale
    a = abs(p)
    if a >= crit: return 2, ("溢價過高" if p > 0 else "折價過深")
    if a >= warn: return 1, ("溢價偏高" if p > 0 else "折價偏深")
    return 0, "正常"

def build_html(rows, warn, crit, hit):
    today = dt.date.today().isoformat()
    def tr(r):
        lv, lb = r["lv"], r["lb"]
        col = "#c0392b" if lv == 2 else ("#d9a119" if lv == 1 else "#7b8b9f")
        bg = "background:#fdf0ee;" if lv == 2 else ("background:#fdf8ea;" if lv == 1 else "")
        nm = TWN.get(r["code"], "")
        y = r.get("yld")
        if y:
            # ★ 殖利率高＝相對便宜（與 PE 相反）。用文字寫清楚方向，不要讓人自己猜。
            yc = ("#2f8a4f" if y["pct"] >= 75 else
                  "#c0392b" if y["pct"] <= 25 else "#7b8b9f")
            yl = ("便宜端" if y["pct"] >= 75 else
                  "★ 貴端" if y["pct"] <= 25 else "中間")
            ycell = (f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;'
                     f'font-family:monospace">{y["now"]:.2f}%</td>'
                     f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;'
                     f'font-family:monospace;font-weight:700;color:{yc}">第 {y["pct"]} 位</td>'
                     f'<td style="padding:9px 12px;border-bottom:1px solid #eee;'
                     f'color:{yc};font-size:13px">{yl}</td>')
        else:
            ycell = ('<td colspan="3" style="padding:9px 12px;border-bottom:1px solid #eee;'
                     'color:#aaa;font-size:12px">配息資料不足 24 個月</td>')
        return (f'<tr style="{bg}">'
                f'<td style="padding:9px 12px;border-bottom:1px solid #eee"><b>{r["code"]}</b> '
                f'<span style="color:#888;font-size:12px">{nm or r["name"][:20]}</span></td>'
                f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;font-family:monospace">{r["px"]:.2f}</td>'
                f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;'
                f'font-family:monospace;font-weight:700;color:{col}">{r["prem"]:+.3f}%</td>'
                f'<td style="padding:9px 12px;border-bottom:1px solid #eee;color:{col};font-size:13px">{lb}</td>'
                f'{ycell}</tr>')
    body = "".join(tr(r) for r in rows)
    used = []
    for k, v in CAT_TH.items():
        if any(r.get("cat") == k for r in rows):
            used.append(f'{CAT_NM[k]} ±{v[0]}/±{v[1]}')
    head = (f'<h2 style="margin:0 0 4px">ETF 折溢價監控　{today}</h2>'
            f'<p style="color:#666;margin:0 0 6px;font-size:14px">'
            f'共 {len(rows)} 檔，折溢價觸發 <b>{hit}</b> 檔'
            f'{"，估值極端 <b>" + str(sum(1 for r in rows if r.get("yhit"))) + "</b> 檔" if any(r.get("yhit") for r in rows) else ""}</p>'
            f'<p style="color:#888;margin:0 0 16px;font-size:12px">'
            f'★ 分類門檻（提醒/警示）：{"　".join(used)}　'
            f'—— 商品期貨追的是期貨、海外 ETF 的淨值隔一個交易日，'
            f'用同一組門檻套全部會天天誤報</p>')
    # ★★ 最該提醒的組合不是「折價 vs 貴」，而是「折溢價正常 但 估值極端」——
    #   前者罕見且幅度通常很小；後者才是常態，而且最容易讓人放心買下去：
    #   交易面沒有任何警訊，估值面卻站在十年極端。
    quiet = [r for r in rows if r.get("yld") and r["lv"] == 0
             and (r["yld"]["pct"] <= 10 or r["yld"]["pct"] >= 90)]
    cf = ""
    if quiet:
        exp = [r for r in quiet if r["yld"]["pct"] <= 10]
        chp = [r for r in quiet if r["yld"]["pct"] >= 90]
        seg = []
        if exp: seg.append("貴端：" + "、".join(
            f'{r["code"]} 第 {r["yld"]["pct"]} 位' for r in exp))
        if chp: seg.append("便宜端：" + "、".join(
            f'{r["code"]} 第 {r["yld"]["pct"]} 位' for r in chp))
        cf = ('<div style="margin-top:14px;padding:12px 15px;background:#fdf8ea;'
              'border-left:3px solid #d9a119;font-size:13px;line-height:1.7;color:#555">'
              f'<b style="color:#a8792a">★ 折溢價正常，但估值站在極端</b>　{"　".join(seg)}<br>'
              '這是最容易被放過的組合 —— <b>交易面沒有任何警訊</b>'
              '（買賣價貼著淨值、沒有溢價陷阱），<b>但估值面站在自己十年的極端</b>。<br>'
              '★ 兩者量的是不同東西：折溢價問「今天這筆交易買貴了嗎」，'
              '殖利率位置問「相對過去，現在算貴還是便宜」。'
              '<b>今天沒吃虧，不等於長期划算。</b></div>')
    note = ('<div style="margin-top:18px;padding:12px 15px;background:#f7f7f5;'
            'border-left:3px solid #7b8b9f;font-size:13px;line-height:1.7;color:#555">'
            '<b>★ 兩欄各自回答什麼</b><br>'
            '<b>折溢價</b>（交易面）＝ 市價 ÷ 淨值 − 1。問的是「<b>今天這筆交易買貴了嗎</b>」。'
            '正常應在 ±0.5% 內；持續溢價 &gt;2% 通常代表該檔暫停或限制申購，'
            '此時買進是在替別人的溢價買單。<br>'
            '<b>殖利率歷史位置</b>（估值面）＝ 每月算「近 12 個月配息 ÷ 當月收盤」，'
            '看現在排在自己歷史的第幾百分位。問的是「<b>相對過去，現在算貴還是便宜</b>」。'
            '★ 方向與 PE 相反 —— <b>殖利率高＝便宜</b>，所以百分位高才是便宜端。<br>'
            '<b>⚠ 兩者可以矛盾，而且矛盾時最有資訊。</b>折價不代表便宜、溢價不代表貴；'
            '同理殖利率在貴端也不影響今天的成交價是否合理。<br>'
            '<b>⚠ 淨值是快照</b>：台股 ETF 一天只結算一次（收盤後），'
            '盤中取到的可能是前一日值 —— 下方時間戳可對照。<br>'
            '<b>⚠ 百分位是相對自己，不是相對別檔</b>：不同 ETF 的殖利率水準天生不同，'
            '橫向比「誰的百分位高」沒有意義。</div>') + cf
    ts = "　".join(f"{r['code']} {r['ts']}" for r in rows if r.get("ts"))
    return (f'<div style="font-family:system-ui,\'Noto Sans TC\',sans-serif;max-width:760px">'
            f'{head}<table style="border-collapse:collapse;width:100%;font-size:14px">'
            f'<tr style="background:#e8e8e4"><th style="padding:6px 12px"></th>'
            f'<th style="padding:6px 12px"></th>'
            f'<th colspan="2" align="center" style="padding:6px 12px;font-size:12px;color:#555;'
            f'border-left:2px solid #fff">交易面 · 今天買貴了嗎</th>'
            f'<th colspan="3" align="center" style="padding:6px 12px;font-size:12px;color:#555;'
            f'border-left:2px solid #fff">估值面 · 相對自己的歷史</th></tr>'
            f'<tr style="background:#f0f0ee"><th align="left" style="padding:9px 12px">標的</th>'
            f'<th align="right" style="padding:9px 12px">市價</th>'
            f'<th align="right" style="padding:9px 12px;border-left:2px solid #fff">折溢價</th>'
            f'<th align="left" style="padding:9px 12px">狀態</th>'
            f'<th align="right" style="padding:9px 12px;border-left:2px solid #fff">TTM 殖利率</th>'
            f'<th align="right" style="padding:9px 12px">歷史位置</th>'
            f'<th align="left" style="padding:9px 12px">判讀</th></tr>{body}</table>'
            f'{note}<p style="color:#999;font-size:11px;margin-top:14px">報價時間　{ts}</p></div>')

def send(subject, html):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    user = os.environ.get("SMTP_USER", "").strip()
    pw = os.environ.get("SMTP_PASS", "").strip()
    to = os.environ.get("NOTIFY_EMAIL", "").strip() or user
    if not (user and pw):
        print("★ 未設定 SMTP_USER / SMTP_PASS ⇒ 跳過寄信（其餘照跑）")
        return False
    m = MIMEMultipart("alternative")
    m["Subject"] = subject; m["From"] = user; m["To"] = to
    m.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(user, pw)
        s.send_message(m)
    print(f"✓ 已寄出 → {to}")
    return True

def main():
    av = sys.argv[1:]
    def opt(k, d):
        return av[av.index(k)+1] if k in av and av.index(k)+1 < len(av) else d
    warn = float(opt("--warn", "1.0"))
    crit = float(opt("--crit", "2.0"))
    always = "--always" in av
    # ★ --warn/--crit 改為「倍率」：1.0 用分類預設，1.5 全面放寬五成
    scale = float(opt("--scale", "1.0"))              # ★ 沒觸發也寄（第一次設定時用來驗證信收得到）
    lst = opt("--list", "")
    args = [a for a in av if not a.startswith("--")]
    for i, a in enumerate(av):
        if a in ("--warn", "--crit", "--list") and i+1 < len(av) and av[i+1] in args:
            args.remove(av[i+1])
    codes = []
    if lst:
        p = pathlib.Path(lst)
        if p.exists():
            codes = [w for ln in p.read_text().splitlines()
                     for w in [ln.split("#")[0].strip()] if w]
    codes += [w for a in args for w in re.split(r"[,\s]+", a) if w]
    seen, out = set(), []
    for c in codes:
        c = re.sub(r"[^A-Za-z0-9.\-]", "", c).upper()
        if c and c not in seen: seen.add(c); out.append(c)
    codes = out
    if not codes: print(__doc__); sys.exit(1)

    th = "　".join(f"{CAT_NM[k]} ±{v[0]}/±{v[1]}" for k, v in CAT_TH.items())
    print(f"★★ ETF 折溢價監控　{len(codes)} 檔"
          + (f"　倍率 ×{scale}" if scale != 1.0 else "") + f"\n   分類門檻　{th}\n")
    rows, bad = [], []
    for c in codes:
        r = resolve(c)
        if not r:
            bad.append(c); print(f"  {c:<10}✗ 取不到淨值"); continue
        r["cat"] = category(c)
        lv, lb = level(r["prem"], warn, crit, r["cat"], scale)
        r["lv"], r["lb"] = lv, lb
        r["th"] = CAT_TH[r["cat"]]
        r["yld"] = yield_pct(r["sym"])       # ★ 估值面，與折溢價並列
        rows.append(r)
        mark = "★★" if lv == 2 else ("★" if lv == 1 else "  ")
        y = r["yld"]
        ys = (f"　殖利率 {y['now']:>5.2f}% 第 {y['pct']:>3} 位" if y else "　殖利率 —")
        print(f"  {mark} {c:<8}[{CAT_NM[r['cat']]:<4}]　折溢價 {r['prem']:+7.3f}%"
              f"（門檻 ±{r['th'][0]}/±{r['th'][1]}）　{lb:<6}{ys}")
    if not rows: sys.exit("★ 全部取不到淨值")
    # ★ 估值站在極端（≤10 或 ≥90 百分位）也值得知道 —— 但它是「慢訊號」，
    #   不像折溢價是當天的事，所以另外計數、不混進折溢價的 lv。
    for r in rows:
        y = r.get("yld")
        r["yhit"] = bool(y and (y["pct"] <= 10 or y["pct"] >= 90))
    rows.sort(key=lambda r: (-r["lv"], -int(r["yhit"]), -abs(r["prem"])))
    hit = sum(1 for r in rows if r["lv"] > 0)
    yhit = sum(1 for r in rows if r["yhit"])
    print(f"\n★ 折溢價觸發 {hit} 檔　估值極端 {yhit} 檔"
          + (f"　✗ {len(bad)} 檔取不到：{' '.join(bad)}" if bad else ""))

    (D/"_prem_last.json").write_text(json.dumps(
        {"date": dt.date.today().isoformat(), "rows": rows}, ensure_ascii=False))

    if not hit and not yhit and not always:
        # ★★ 沒事不寄 —— 每天都寄的通知，第三天起就沒人看了
        print("★ 折溢價與估值都沒有觸發 ⇒ 不寄信（要每天都收請加 --always）")
        return
    worst = rows[0]
    tag = "★★" if worst["lv"] == 2 else ("★" if worst["lv"] == 1 else "")
    today = dt.date.today().isoformat()
    if hit:
        sub = (f"{tag} ETF 折溢價 {hit} 檔異常"
               + (f"／估值極端 {yhit} 檔" if yhit else "")
               + f"　最大 {worst['code']} {worst['prem']:+.2f}%　{today}")
    elif yhit:
        ex = [r for r in rows if r["yhit"]][0]
        sub = (f"★ ETF 估值極端 {yhit} 檔　{ex['code']} 殖利率第 {ex['yld']['pct']} 位"
               f"（折溢價正常）　{today}")
    else:
        sub = f"ETF 折溢價日報　全部正常　{today}"
    send(sub, build_html(rows, warn, crit, hit))

if __name__ == "__main__": main()
