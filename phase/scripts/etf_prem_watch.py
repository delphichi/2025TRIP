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

def quote(sym):
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

def level(p, warn, crit):
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
        return (f'<tr style="{bg}">'
                f'<td style="padding:9px 12px;border-bottom:1px solid #eee"><b>{r["code"]}</b> '
                f'<span style="color:#888;font-size:12px">{nm or r["name"][:22]}</span></td>'
                f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;font-family:monospace">{r["px"]:.2f}</td>'
                f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;font-family:monospace">{r["nav"]:.2f}</td>'
                f'<td align="right" style="padding:9px 12px;border-bottom:1px solid #eee;'
                f'font-family:monospace;font-weight:700;color:{col}">{r["prem"]:+.3f}%</td>'
                f'<td style="padding:9px 12px;border-bottom:1px solid #eee;color:{col};font-size:13px">{lb}</td></tr>')
    body = "".join(tr(r) for r in rows)
    head = (f'<h2 style="margin:0 0 4px">ETF 折溢價監控　{today}</h2>'
            f'<p style="color:#666;margin:0 0 16px;font-size:14px">'
            f'門檻：<b>±{warn}%</b> 提醒／<b>±{crit}%</b> 警示　·　'
            f'共 {len(rows)} 檔，{hit} 檔觸發</p>')
    note = ('<div style="margin-top:18px;padding:12px 15px;background:#f7f7f5;'
            'border-left:3px solid #d9a119;font-size:13px;line-height:1.7;color:#555">'
            '<b>★ 怎麼讀</b><br>'
            '折溢價 ＝ 市價 ÷ 淨值 − 1。<b>溢價買進等於多付錢</b>，那部分不會回到你身上。<br>'
            '一般 ETF 應貼在 ±0.5% 內；<b>持續溢價 &gt;2% 通常代表該檔暫停或限制申購</b>，'
            '此時買進是在替別人的溢價買單。<br>'
            '<b>⚠ 淨值是快照</b>：台股 ETF 的淨值一天只更新一次（收盤後結算），'
            '盤中取到的可能是前一日值 —— 下表的時間戳可以對照。<br>'
            '<b>⚠ 這不是買賣訊號</b>：折價不代表便宜、溢價不代表貴，它只反映「當下的成交價偏離持股價值多少」。'
            '判斷貴不貴要看殖利率歷史位置，那是另一回事。</div>')
    ts = "　".join(f"{r['code']} {r['ts']}" for r in rows if r.get("ts"))
    return (f'<div style="font-family:system-ui,\'Noto Sans TC\',sans-serif;max-width:760px">'
            f'{head}<table style="border-collapse:collapse;width:100%;font-size:14px">'
            f'<tr style="background:#f0f0ee"><th align="left" style="padding:9px 12px">標的</th>'
            f'<th align="right" style="padding:9px 12px">市價</th>'
            f'<th align="right" style="padding:9px 12px">淨值</th>'
            f'<th align="right" style="padding:9px 12px">折溢價</th>'
            f'<th align="left" style="padding:9px 12px">狀態</th></tr>{body}</table>'
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
    always = "--always" in av              # ★ 沒觸發也寄（第一次設定時用來驗證信收得到）
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

    print(f"★★ ETF 折溢價監控　{len(codes)} 檔　門檻 ±{warn}% / ±{crit}%\n")
    rows, bad = [], []
    for c in codes:
        r = resolve(c)
        if not r:
            bad.append(c); print(f"  {c:<10}✗ 取不到淨值"); continue
        lv, lb = level(r["prem"], warn, crit)
        r["lv"], r["lb"] = lv, lb
        rows.append(r)
        mark = "★★" if lv == 2 else ("★" if lv == 1 else "  ")
        print(f"  {mark} {c:<8}市價 {r['px']:>9.2f}　淨值 {r['nav']:>9.2f}　"
              f"折溢價 {r['prem']:+7.3f}%　{lb}")
    if not rows: sys.exit("★ 全部取不到淨值")
    rows.sort(key=lambda r: (-r["lv"], -abs(r["prem"])))
    hit = sum(1 for r in rows if r["lv"] > 0)
    print(f"\n★ {hit} 檔觸發門檻" + (f"　✗ {len(bad)} 檔取不到：{' '.join(bad)}" if bad else ""))

    (D/"_prem_last.json").write_text(json.dumps(
        {"date": dt.date.today().isoformat(), "rows": rows}, ensure_ascii=False))

    if not hit and not always:
        # ★★ 沒事不寄 —— 每天都寄的通知，第三天起就沒人看了
        print("★ 沒有標的觸發門檻 ⇒ 不寄信（要每天都收請加 --always）")
        return
    worst = rows[0]
    tag = "★★" if worst["lv"] == 2 else ("★" if worst["lv"] == 1 else "")
    sub = (f"{tag} ETF 折溢價　{hit}/{len(rows)} 檔觸發　"
           f"最大 {worst['code']} {worst['prem']:+.2f}%　{dt.date.today().isoformat()}"
           if hit else f"ETF 折溢價日報　全部正常　{dt.date.today().isoformat()}")
    send(sub, build_html(rows, warn, crit, hit))

if __name__ == "__main__": main()
