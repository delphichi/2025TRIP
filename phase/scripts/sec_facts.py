#!/usr/bin/env python3
"""★★ SEC XBRL companyfacts → 九關需要的年度／季度序列
   一支工具服務全部美股，不再一家寫一個 _xxx.mjs。

   ★ 三個一定會踩的坑（VRT 實測）：
     ① 標籤版本遷移　營收舊用 Revenues、2019 後改 RevenueFromContractWithCustomer…
                    只用一個會少掉一半歷史 ⇒ 多標籤合併，新的優先
     ② 科目缺失　　　VRT 與 OTIS 都不申報 GrossProfit ⇒ 用「營收 − 銷貨成本」補
     ③ 10-K/10-Q 混雜 同一個 end 會有年報與季報兩筆，取錯差四倍
                    ⇒ 年度只收 form=10-K 且 start~end 跨度 ≥ 300 天

   用法：python3 scripts/us/sec_facts.py VRT [--json]
"""
import sys, json, pathlib, urllib.request, time

import os
# ★★★ SEC 硬性要求 User-Agent 帶「可聯絡的 email」—— 實測：
#     "valuation-research (github.com/delphichi)"          → 403
#     "valuation-research ... contact@example.com"         → 403（example.com 被擋）
#     "名字 <一個真的、能收信的地址>"                        → 200
#   所以 UA 一定含個資 ⇒ ★★ 絕不能寫死在會公開的原始碼裡。三層取得：
#     ① 環境變數 SEC_UA      ← GitHub Actions 用 repo secret 餵進來
#     ② ~/.sec_ua 檔         ← 本機一次設定，永遠不進任何 repo
#     ③ 都沒有 ⇒ 明確報錯，不要讓它去撞 403
def _ua():
    v = os.environ.get("SEC_UA", "").strip()
    if v: return v
    f = pathlib.Path.home()/".sec_ua"
    if f.exists():
        v = f.read_text().strip()
        if v: return v
    raise SystemExit(
        "\n★★ 沒有設定 SEC_UA —— SEC 會回 403。\n"
        "   本機：echo '你的名字 你的信箱@example.com' > ~/.sec_ua\n"
        "   Actions：到 repo Settings → Secrets → Actions 新增 SEC_UA\n")
UA = _ua()
D = pathlib.Path(__file__).parent
# ★ 快取位置可用 SEC_CACHE_DIR 指定。預設優先用外接碟（系統碟只剩 1 GB，
#   503 家 companyfacts ≈ 1.8 GB 會寫爆）；外接碟沒掛載就退回腳本目錄。
_EXT = pathlib.Path("/Volumes/Crucial X6/claudecode/_seccache")
CACHE = pathlib.Path(os.environ.get("SEC_CACHE_DIR") or
                     (_EXT if _EXT.parent.exists() else D/"_cache"))
CACHE.mkdir(parents=True, exist_ok=True)

def get(url, cache_name=None, ttl=86400):
    """★ SEC 限 10 req/sec，且同一份 companyfacts 一天內不會變 ⇒ 一律快取

       ★★★ 但批次掃描（503 家 × 平均 3.6 MB ≈ 1.8 GB）不要留快取 —— 2026-09-24
       實測把磁碟寫爆，後續 205 家連鎖失敗，而且產出的是一份「看起來完整、
       實際漏四成」的榜單。設 SEC_NO_CACHE=1 只讀不寫，峰值只有單一家幾 MB。
       ★ 另加保險：剩餘空間 < 2 GB 時自動不寫（免得下次又踩）。"""
    nocache = os.environ.get("SEC_NO_CACHE", "") == "1"
    if cache_name and not nocache:
        p = CACHE/cache_name
        if p.exists() and time.time()-p.stat().st_mtime < ttl:
            return json.loads(p.read_bytes())
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    if raw[:2] == b"\x1f\x8b":
        import gzip as _gz; raw = _gz.decompress(raw)
    if cache_name and not nocache:
        try:
            import shutil
            if shutil.disk_usage(CACHE).free > 2e9:          # ★ 空間不足就不寫
                (CACHE/cache_name).write_bytes(raw)
        except OSError:
            pass                                             # ★ 寫不進去不該讓整個任務死掉
    return json.loads(raw)

def cik_of(ticker):
    d = get("https://www.sec.gov/files/company_tickers.json", "tickers.json", 7*86400)
    for v in d.values():
        if v["ticker"].upper() == ticker.upper():
            return str(v["cik_str"]).zfill(10), v["title"]
    return None, None

# ★ 多標籤：依序嘗試，先找到的優先；同一個 end 有多筆時取 filed 最新
TAGS = {
  # ★ RevenuesNetOfInterestExpense：券商／投銀的總淨收入（GS 用它）。
  #   ★★ 但一般銀行（MS/TFC/RF/SYF/BNY）只分開申報「利息收入」與「非利息收入」，
  #   要自己相加 —— 那是另一種營收定義，不該混進同一張排行榜比較。寧可列為未納入。
  "revenue":  ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
               "RevenuesNetOfInterestExpense",
               "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  "cogs":     ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"],
  "gross":    ["GrossProfit"],
  "op":       ["OperatingIncomeLoss"],
  "pretax":   ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
               "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
  "net":      ["NetIncomeLoss", "ProfitLoss"],
  "eps":      ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
  "ocf":      ["NetCashProvidedByUsedInOperatingActivities",
               "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  "capex":    ["PaymentsToAcquirePropertyPlantAndEquipment",
               "PaymentsToAcquireProductiveAssets"],
  "dep":      ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet",
               "DepreciationAndAmortization"],
  "interest": ["InterestExpense", "InterestExpenseDebt", "InterestIncomeExpenseNet"],
  # ── 時點科目（資產負債表）──
  "equity":   ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  "assets":   ["Assets"], "liab": ["Liabilities"],
  "cash":     ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  "inventory":["InventoryNet"], "ar": ["AccountsReceivableNetCurrent"],
  "debt":     ["LongTermDebtNoncurrent", "LongTermDebt"],
  "goodwill": ["Goodwill"], "treasury": ["TreasuryStockValue", "TreasuryStockCommonValue"],
  # ★ 一手股數（單位 shares）—— 用來偵測股票分割，不要用淨利÷EPS 反推
  "shares":   ["WeightedAverageNumberOfDilutedSharesOutstanding",
               "WeightedAverageNumberOfSharesOutstandingBasic"],
}
POINT = {"equity","assets","liab","cash","inventory","ar","debt","goodwill","treasury"}

def series(facts, keys, point):
    """回傳 {年: 值}（年報）與 {end: 值}（最近季）
       ★ 期間科目要求跨度 ≥ 300 天，才不會把 Q4 單季當成全年

       ★★★ 2026-09-24 修：原本把多個標籤「合併」填進同一條序列 —— 有的期用 A 標籤、
       有的期用 B 標籤。Mastercard 同時申報
           RevenueFromContractWithCustomerExcludingAssessedTax  2021Q1 = 6,428 M（毛營收）
           Revenues                                             2021Q1 = 4,155 M（★ 淨營收）
       混用之後 2022Q1(淨 5,167) vs 2021Q1(毛 6,428) 算出 ★★ −19.6%，
       而真實是 +24%。⇒ 一條序列只能用一個標籤。
       ★ 作法：逐標籤各建一條完整序列，最後挑「筆數最多」的那一條回傳。"""
    # ★★★ 挑標籤的規則：先看「最近 6 年內的筆數」，再看總筆數。
    #   ★ 只看總筆數會選到「歷史長但已停用」的舊標籤 —— AKAM/MSFT/V 實測會變成 0 季。
    #   （這是修 Mastercard 混用問題時自己種下的第二個 bug，回歸測試才抓到）
    import datetime as _dt
    _cut = (_dt.date.today() - _dt.timedelta(days=6*365)).isoformat()
    cands = []
    for k in keys:
        a1, q1 = _one(facts, k, point)
        if not a1 and not q1: continue
        recent = sum(1 for x in q1 if str(x) >= _cut) + sum(1 for y in a1 if int(y) >= int(_cut[:4]))
        # ★★★ 2026-09-24：新增「新鮮度」——Alphabet 2025-03 後停用
        #   RevenueFromContractWithCustomerExcludingAssessedTax 改用 Revenues，
        #   兩者季數都是 25 筆，比總筆數（87 vs 77）會選到 ★★ 已停用的那個
        #   ⇒ 整條序列停在 2025-03-31，落後 5 季，而且「算得出來、格式正確、看起來合理」。
        #   停用的標籤再多筆也沒用 ⇒ 新鮮度排在筆數之前。
        last = max([str(x) for x in q1] + [f"{y}-12-31" for y in a1] or ["0000"])
        cands.append([recent, len(q1) + len(a1), a1, q1, last])
    if not cands: return {}, {}
    newest = max(c[4] for c in cands)
    _cut2 = (_dt.date.fromisoformat(newest[:10]) - _dt.timedelta(days=200)).isoformat() \
            if newest[:4] != "0000" else "0000"
    for c in cands: c.insert(0, 1 if c[4] >= _cut2 else 0)   # ★ fresh 旗標放最前面
    cands.sort(key=lambda c: (c[0], c[1], c[2]), reverse=True)
    return cands[0][3], cands[0][4]

def _one(facts, k, point):
    """單一標籤的序列 —— ★ 不與其他標籤混合"""
    keys = [k]
    ann, qtr = {}, {}
    for k in keys:
        f = facts.get(k)
        if not f: continue
        for unit, rows in f["units"].items():
            # ★ 2026-09-24：加 "shares" —— 股數標籤（WeightedAverageNumberOf…）單位是 shares，
            #   原本整條被丟掉，detect_split 只好改用「淨利÷EPS」反推，EPS 趨近 0 時炸開（見 #534）
            if unit not in ("USD", "USD/shares", "shares"): continue
            for r in rows:
                end = r["end"]; fy = int(end[:4])
                if point:
                    if r.get("form") not in ("10-K", "10-Q"): continue
                    prev = qtr.get(end)
                    if not prev or r.get("filed","") > prev[1]: qtr[end] = (r["val"], r.get("filed",""))
                    if r.get("form") == "10-K" and r.get("fp") == "FY":
                        p2 = ann.get(fy)
                        if not p2 or r.get("filed","") > p2[1]: ann[fy] = (r["val"], r.get("filed",""))
                else:
                    st = r.get("start")
                    if not st: continue
                    days = (int(end[:4])-int(st[:4]))*365 + (int(end[5:7])-int(st[5:7]))*30
                    if r.get("form") == "10-K" and r.get("fp") == "FY" and days >= 300:
                        p2 = ann.get(fy)
                        if not p2 or r.get("filed","") > p2[1]: ann[fy] = (r["val"], r.get("filed",""))
                    elif 60 <= days <= 120:
                        prev = qtr.get(end)
                        if not prev or r.get("filed","") > prev[1]: qtr[end] = (r["val"], r.get("filed",""))
    return {k: v[0] for k, v in ann.items()}, {k: v[0] for k, v in qtr.items()}

def main():
    T = sys.argv[1].upper()
    cik, name = cik_of(T)
    if not cik: print(f"★ {T} 在 SEC 查不到 CIK"); sys.exit(1)
    d = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", f"cf_{T}.json")
    facts = d.get("facts", {}).get("us-gaap", {})
    A, Q = {}, {}
    for f, keys in TAGS.items():
        A[f], Q[f] = series(facts, keys, f in POINT)
    # ★ 坑②：毛利缺就用 營收 − 銷貨成本 補
    for tgt, src in ((A, A), (Q, Q)):
        for k in list(src["revenue"]):
            if k not in tgt["gross"] and k in src["cogs"]:
                tgt["gross"][k] = src["revenue"][k] - src["cogs"][k]
    # ★ 濾掉空殼年（營收 0 或極小）—— SEC 對 SPAC 前身／改制年會留下垃圾列
    yrs = [y for y in sorted(set(A["revenue"]) & set(A["net"]))
           if (A["revenue"].get(y) or 0) > 1e6][-12:]
    M = 1e6
    print(f"\n{'='*82}\n★★ {T}　{name}　CIK {cik}")
    print(f"   us-gaap 科目 {len(facts)} 個｜年報 {len(yrs)} 年｜最新季 {max(Q['revenue'], default='—')}")
    print(f"{'='*82}")
    print("  年    營收(百萬)   毛利率   營益率   淨利     EPS    OCF    CapEx   折舊   權益    ROE")
    for y in yrs:
        g=lambda f,dv=None: A[f].get(y,dv)
        rev=g("revenue"); gp=g("gross"); op=g("op"); ni=g("net"); eq=g("equity")
        fm=lambda v,d=0: "—" if v is None else f"{v/M:,.{d}f}"
        pc=lambda a,b: "—" if not(a is not None and b) else f"{a/b*100:.1f}%"
        # ★★ 分母為負時「比率」會變號 —— 負淨利÷負權益＝正的 ROE，完全誤導（OTIS 踩過）
        #    ⇒ 權益為負一律標 n/a，並在下方提示，不讓它混進正常數字裡
        roe = "★n/a" if (eq is not None and eq < 0) else pc(ni, eq)
        eps = g("eps")
        eps_s = "—" if eps is None else f"{eps:.2f}"     # ★ f-string 內不能放反斜線跳脫，先算好
        print(f" {y} {fm(rev):>11} {pc(gp,rev):>8} {pc(op,rev):>8} {fm(ni):>8} {eps_s:>7}"
              f" {fm(g('ocf')):>7} {fm(g('capex')):>7} {fm(g('dep')):>6} {fm(eq):>7} {roe:>7}")
    negeq=[y for y in yrs if (A["equity"].get(y) or 0) < 0]
    if negeq:
        print(f"\n  ★★ 權益為負的年度：{' '.join(map(str,negeq))}")
        print(f"     ⇒ 這些年的 ROE／PBR 沒有定義（不是「不及格」，是「算不出來」）")
        print(f"     ⇒ 分辨是不是危險：看淨利正負、利息付不付得出來、FCF 穩不穩（通則：OTIS 案例）")
    miss=[k for k in TAGS if not A[k]]
    if miss: print(f"\n  ⚠ 年報抓不到：{' '.join(miss)}")
    if "--json" in sys.argv:
        out={"ticker":T,"name":name,"cik":cik,"annual":A,"quarterly":Q}
        p=D/f"_sec_{T}.json"; p.write_text(json.dumps(out,ensure_ascii=False))
        print(f"\n✓ 存 {p.name}")

if __name__ == "__main__": main()
