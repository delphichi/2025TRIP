#!/usr/bin/env python3
"""★★★ 全市場月營收 —— 三次 call 涵蓋 2,279 家，★ 不用 FinMind、沒有配額

   ★★ 為什麼要有這支（2026-09-24 的教訓）：
     我原本用 FinMind 逐家抓月營收，★ 一家一次 call。八家就打了八次，配額立刻 402。
     ★★★ 而官方 Open API 一次就回傳全市場：
        TWSE 上市　https://openapi.twse.com.tw/v1/opendata/t187ap05_L　1,086 家
        TPEX 上櫃　https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O　892 家
        興櫃　　　 https://openapi.twse.com.tw/v1/opendata/t187ap05_P　301 家
     ⇒ ★ 逐家抓 2,279 次 vs ★★★ bulk 抓 3 次

   ⚠ 限制：Open API 只有「最新一個月」。要歷史月營收，走 MOPS 的
      https://mopsov.twse.com.tw/nas/t21/{sii|otc}/t21sc03_{民國年}_{月}_0.html（一月一 call）

   用法：python3 scripts/tw/rev_bulk.py [代碼...]      # 不給代碼 = 全市場存檔
"""
import sys, json, ssl, time, re, pathlib, urllib.request
ssl._create_default_https_context = ssl._create_unverified_context
H = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
OUT = pathlib.Path(__file__).parent/"raw"; OUT.mkdir(exist_ok=True)
SRC = [("https://openapi.twse.com.tw/v1/opendata/t187ap05_L", "上市"),
       ("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O", "上櫃"),
       ("https://openapi.twse.com.tw/v1/opendata/t187ap05_P", "興櫃")]

def get(u, tries=3):
    for i in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))
        except Exception as e:
            if i == tries-1: raise
            time.sleep(2*(i+1))

def _f(v):
    try: return float(str(v).replace(",", ""))
    except Exception: return None

ALL = {}
for u, mk in SRC:
    try:
        d = get(u)
        for r in d:
            c = r.get("公司代號")
            if not c: continue
            ALL[c] = dict(name=r.get("公司名稱"), market=mk, ym=r.get("資料年月"),
                          ind=r.get("產業別"),
                          rev=_f(r.get("營業收入-當月營收")),
                          rev_prev_m=_f(r.get("營業收入-上月營收")),
                          rev_ly=_f(r.get("營業收入-去年當月營收")),
                          yoy=_f(r.get("營業收入-去年同月增減(%)")),
                          mom=_f(r.get("營業收入-上月比較增減(%)")),
                          cum=_f(r.get("累計營業收入-當月累計營收")),
                          cum_yoy=_f(r.get("累計營業收入-前期比較增減(%)")))
        print(f"  ★ {mk} {len(d)} 家 ✓", flush=True)
    except Exception as e:
        print(f"  {mk} ✗ {type(e).__name__} {str(e)[:60]}", flush=True)

ym = next((v["ym"] for v in ALL.values() if v.get("ym")), "?")
print(f"\n★★ 全市場 {len(ALL)} 家　資料年月 {ym}")
p = OUT/f"rev_bulk_{ym}.json"; p.write_text(json.dumps(ALL, ensure_ascii=False))
print(f"✓ 存 raw/{p.name}")


# ══════════════════════════════════════════════════════════════════
# ★★★ --history：歷史月營收（Open API 只有最新一個月，#529）
#   來源 https://mopsov.twse.com.tw/nas/t21/{sii|otc}/t21sc03_{民國年}_{月}_0.html
#   ★ 一月一 call 涵蓋該市場全部公司 ⇒ 36 個月 × 2 市場 ＝ 72 次，★★ 而非 2,279 次
#   欄位順序（實測 2026-09-24）：
#     代號｜名稱｜當月營收｜上月營收｜去年當月營收｜上月增減%｜★ 去年同月增減%｜累計｜去年累計｜前期增減%
# ══════════════════════════════════════════════════════════════════
def fetch_month(roc_y, mm, mk, kind="0"):
    """★★★ 結尾的 0/1 是「公司別」，不是流水號：
         0 ＝ 國內公司　　1 ＝ ★ 外國企業（KY／F 股）
       2026-09-25 發現：原本只抓 _0，★★ 123 家 KY 公司（世芯、貿聯、亞德客、中租…）
       在歷史月營收裡全部是空的 —— 而它們在 Open API 的最新月份是有的，
       ⇒ 「有些公司沒有月營收」這個結論本身是錯的，是我少抓了三分之一的檔案。
       市場別也補上 rotc（興櫃 354 家）。實測 115/08：
         sii_0 993　sii_1 ★93　otc_0 863　otc_1 30　rotc_0 354　rotc_1 6"""
    # ★★ 2026-09-25：原本沒有重試 —— 一次暫時性 HTTPError 就整個檔案沒了，
    #   實測 113/12 的 otc_0 與 rotc_0 同時失手，那個月從 2,220 家掉到 ★ 1,107 家，
    #   而輸出只印一行 ✗、總表照常產出 ⇒ ★★★ 缺一半的月份看起來跟正常的一樣。
    u = f"https://mopsov.twse.com.tw/nas/t21/{mk}/t21sc03_{roc_y}_{mm}_{kind}.html"
    raw = None
    for _i in range(3):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60).read()
            break
        except Exception:
            if _i == 2: raise
            time.sleep(2 * (_i + 1))
    t = raw.decode("big5hkscs", "ignore")
    out = {}
    # ★ 逐列切：以 <tr> 為界，取出所有 <td> 的純文字
    for tr in re.split(r"<tr[^>]*>", t, flags=re.I):
        tds = [re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", x)) for x in re.split(r"<td[^>]*>", tr, flags=re.I)[1:]]
        if len(tds) < 7: continue
        code = tds[0]
        if not re.fullmatch(r"\d{4}", code): continue      # ★ 只要四位數代碼
        def n(i):
            try: return float(tds[i].replace(",", ""))
            except Exception: return None
        out[code] = dict(name=tds[1], rev=n(2), rev_ly=n(4), yoy=n(6))
    return out

if "--history" in sys.argv:
    MONTHS = int(sys.argv[sys.argv.index("--history")+1]) if len(sys.argv) > sys.argv.index("--history")+1 \
             and sys.argv[sys.argv.index("--history")+1].isdigit() else 36
    # ★ 從最新一期（Open API 的 ym，民國 YYYMM）往回推
    y0, m0 = int(ym[:3]), int(ym[3:])
    HIST = {}          # {code: {"115/08": yoy, ...}}
    # ★★★ 2026-09-25 新增：連「當月營收絕對值」一起存。
    #   只有 YoY 分不出「真減速」與「基期墊高」——
    #   彰銀 115/06~08 平均 47.36 億是 15 個月最高（環比 +9.3%），
    #   但去年同期 114/06~08 恰好也是最旺（基期 +15.7%），
    #   ⇒ YoY 動能讀出 −6.4pp，看起來在減速，其實營收自己在加速。
    REV  = {}          # {code: {"115/08": 當月營收(仟元), ...}}
    NAME = {}
    ok = miss = 0
    files_ok = 0
    for k in range(MONTHS):
        mm = m0 - k; yy = y0
        while mm <= 0: mm += 12; yy -= 1
        tag = f"{yy}/{mm:02d}"
        got = 0
        for mk, kind in (("sii","0"),("sii","1"),("otc","0"),("otc","1"),("rotc","0"),("rotc","1")):
            try:
                d = fetch_month(yy, mm, mk, kind)
                for c, r in d.items():
                    HIST.setdefault(c, {})[tag] = r["yoy"]
                    if r.get("rev") is not None: REV.setdefault(c, {})[tag] = r["rev"]
                    NAME.setdefault(c, r["name"])
                got += len(d); files_ok += 1
            except Exception as e:
                print(f"    {tag} {mk}_{kind} ✗ {type(e).__name__}", flush=True)
        print(f"  {tag}　{got} 家" + ("" if got else "　★ 全空"), flush=True)
        ok += 1 if got else 0; miss += 0 if got else 1
        time.sleep(0.35)
    # ★★★ 落檔前檢查：某個月的家數若明顯低於中位數，代表那期有檔案抓失敗。
    #   ★ 不檢查的話，缺一半公司的月份跟正常月份在輸出上長得一模一樣。
    import statistics as _st
    _cnt = {}
    for _c, _mm in HIST.items():
        for _t in _mm: _cnt[_t] = _cnt.get(_t, 0) + 1
    if _cnt:
        _med = _st.median(_cnt.values())
        _bad = sorted(t for t, n in _cnt.items() if n < _med * 0.75)
        if _bad:
            print(f"\n  ⚠★★ 這 {len(_bad)} 期家數明顯偏低（中位 {_med:.0f}），代表該期有檔案抓失敗：")
            for _t in _bad: print(f"     {_t}　{_cnt[_t]} 家")
            print("     ⇒ ★ 重跑一次即可補上（fetch_month 已有 3 次重試）")
    hp = OUT/f"rev_hist_{MONTHS}m.json"
    hp.write_text(json.dumps({"months": MONTHS, "latest": ym, "name": NAME,
                              "yoy": HIST, "rev": REV}, ensure_ascii=False))
    # ★★ 舊版「成功 N 期」是每期只要有任一檔案回傳就算成功 ⇒ 缺一半的月份也算成功。
    #   實測 113/12 的 otc_0 與 rotc_0 同時失手，家數只剩 1,107（正常 2,195），
    #   ★★★ 而輸出印的是「成功 36 期／失敗 0 期」。改成回報實際抓到的檔案數。
    print(f"\n★★ 歷史月營收：{len(HIST)} 家 × 最多 {MONTHS} 個月")
    print(f"   期數 {MONTHS}　★ 檔案 {files_ok}/{MONTHS*6} 成功（每期 6 個：sii/otc/rotc × 國內/外國）")
    print(f"✓ 存 raw/{hp.name}")
    sys.exit(0)

CODES = [a for a in sys.argv[1:] if a.isdigit()]
if CODES:
    print(f"\n  代碼 名稱       市場   產業        當月營收(億)   ★ YoY      MoM    ★★ 累計YoY")
    for c in CODES:
        r = ALL.get(c)
        if not r: print(f"  {c} ★ 查無（可能已下市或未公布）"); continue
        rv = f"{r['rev']/1e5:,.1f}" if r["rev"] else "—"
        f2 = lambda v: "—" if v is None else f"{v:+.1f}%"
        star = "★★★" if (r["yoy"] or 0) > 50 else ("★★" if (r["yoy"] or 0) > 20 else ("★ 衰退" if (r["yoy"] or 0) < 0 else ""))
        print(f"  {c} {(r['name'] or '')[:8]:<9}{r['market']:<5}{(r['ind'] or '')[:8]:<10}"
              f"{rv:>10}{f2(r['yoy']):>11}{f2(r['mom']):>9}{f2(r['cum_yoy']):>11}  {star}")
