#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TWSE OpenAPI 每日快照累積器  scripts/tw_twse_snapshot.py
=====================================================================
獨立於 tw_sector_pipeline.py（Layer 0-3 既有邏輯完全不動）。目的：把 TWSE
OpenAPI 兩個「只回傳最新一個交易日、不能查歷史區間」的 bulk endpoint 每天存一份
快照，累積個幾十天後才有意義（4W/13W/26W 報酬、RSI 這些都需要歷史序列，單一天
的快照算不出來）。

  /exchangeReport/MI_INDEX      每日收盤行情-大盤統計資訊
                                 → 274 筆/天，其中約 37 筆是官方「XX類指數」
                                 （半導體類指數/電子零組件類指數/金融保險類指數…），
                                 幾乎對應 FinMind industry_category 分類，未來可以
                                 取代「用我們自己 100 檔股票池平均」當 Layer 1 真實
                                 板塊指數（比抽樣平均準）。
  /exchangeReport/STOCK_DAY_ALL  上市個股日成交資訊
                                 → 全上市證券（含 ETF）約 1,380 筆/天官方 OHLCV，
                                 一次呼叫涵蓋全市場，未來可以取代 FinMind
                                 TaiwanStockPrice 逐股查詢（沒有per-股票配額問題）。

兩個 endpoint 都不需要 token、不吃 FinMind 額度，但也都沒有 start_date/end_date
參數——只能拿到「呼叫當下最新交易日」，所以只能每天累積存檔，不能一次補歷史。

另外累積財報基本資料（也是 bulk、不需要 token、沒有日期參數，只給「當期」）：
  /opendata/t187ap06_L_{suffix}  上市公司綜合損益表
  /opendata/t187ap07_L_{suffix}  上市公司資產負債表
  suffix 依產業別拆成 6 個變體（財報格式不同，欄位不同，不強行合併成一份 CSV）：
    ci=一般業 / basi=金融業 / bd=證券期貨業 / ins=保險業 / fh=金控業 / mim=異業
  實測驗證過（真實回應）：一次呼叫回傳全部公司（一般業 1,048 檔），但年度/季別
  只有一組值（例如 115/2 = 2026 Q2）——確認是「當期單季快照」，不是歷史時間序列。
  財報季更新（不是日更新），所以不像 MI_INDEX/STOCK_DAY_ALL 每天都存一份（同一季
  內每天存的都一樣，天天存只會產生大量重複檔案）——改成用「這一季的檔名存在就跳過」
  判斷要不要存新檔，季別變了（新一季財報公布）才會真的寫新檔。

日期格式：TWSE 回傳民國年（例如 "1150903"），本檔轉換成西元 YYYY-MM-DD 存檔名跟
CSV 內容都用西元，方便跟 tw_sector_pipeline.py 其他檔案對齊；財報的年度/季別
（例如 "115"/"2"）轉成 "2026Q2" 這種格式當檔名的季別標籤。

失敗處理：這些 endpoint 都是「錦上添花」，不是 Phase 1 既有報表的必要依賴——
抓不到就記警告、跳過，不讓整個 pipeline job fail；6 個產業別變體互相獨立，
單一變體失敗不影響其他 5 個。

輸出：
  data/sector_rotation/twse_raw/mi_index_{YYYYMMDD}.csv
  data/sector_rotation/twse_raw/stock_day_all_{YYYYMMDD}.csv
  data/sector_rotation/twse_raw/income_statement_{suffix}_{YYYYQn}.csv   （6 個產業別各一份）
  data/sector_rotation/twse_raw/balance_sheet_{suffix}_{YYYYQn}.csv     （6 個產業別各一份）

手動跑：
  python scripts/tw_twse_snapshot.py
"""
import os
import sys
import csv
from datetime import datetime, timezone

import requests

OUTDIR = "data/sector_rotation/twse_raw"

MI_INDEX_URL = "https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX"
STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"

# 財報依產業別拆成 6 個 endpoint 變體（格式不同，不強行合併）
FIN_INDUSTRY_SUFFIXES = {
    "ci": "一般業", "basi": "金融業", "bd": "證券期貨業",
    "ins": "保險業", "fh": "金控業", "mim": "異業",
}
FIN_STATEMENTS = {
    "income_statement": "https://openapi.twse.com.tw/v1/opendata/t187ap06_L_{suffix}",
    "balance_sheet": "https://openapi.twse.com.tw/v1/opendata/t187ap07_L_{suffix}",
}


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def roc_to_iso(roc_date):
    """TWSE 民國年日期字串（如 "1150903"）→ 西元 "YYYY-MM-DD"。"""
    roc_date = str(roc_date).strip()
    if len(roc_date) not in (6, 7):
        raise ValueError(f"非預期的民國年日期格式: {roc_date!r}")
    year = int(roc_date[:-4]) + 1911
    month = roc_date[-4:-2]
    day = roc_date[-2:]
    return f"{year:04d}-{month}-{day}"


def fetch_twse_openapi(url, timeout=30):
    """TWSE OpenAPI 不需要 token，回傳整個 JSON array（不是 FinMind 那種
    {data: [...]} 包裝）。回傳 None（不拋例外）讓呼叫端自行決定要不要中止。
    """
    try:
        res = requests.get(url, headers={"accept": "application/json"}, timeout=timeout)
    except requests.RequestException as e:
        log(f"⚠ 網路錯誤：{url} · {e}")
        return None
    if not res.ok:
        log(f"⚠ HTTP {res.status_code}：{url}")
        return None
    try:
        data = res.json()
    except ValueError:
        log(f"⚠ 回傳非 JSON：{url}")
        return None
    if not isinstance(data, list) or not data:
        log(f"⚠ 回傳空陣列或非預期格式：{url}")
        return None
    return data


def save_snapshot(rows, name):
    """存成 CSV，日期欄位（民國年）就地轉成西元；檔名用第一筆資料的西元日期。
    保留所有原始欄位、原始字串型別（不轉 float）——這裡只負責存檔，不做分析，
    分析邏輯留到累積夠歷史、真的要接進 Layer 1/2 的時候再寫。
    """
    if not rows:
        return None
    date_field = "Date" if "Date" in rows[0] else "日期"
    as_of = roc_to_iso(rows[0][date_field])
    stamp = as_of.replace("-", "")

    os.makedirs(OUTDIR, exist_ok=True)
    path = os.path.join(OUTDIR, f"{name}_{stamp}.csv")

    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            r = dict(r)
            r[date_field] = roc_to_iso(r[date_field])
            w.writerow(r)
    log(f"  saved {path}（{len(rows)} 筆，as_of={as_of}）")
    return path


def quarter_label_from_rows(rows):
    """財報每列都帶「年度」（民國年）+「季別」欄位，不像股價用外部日期參數指定。
    回傳西元年+季標籤（例如 "2026Q2"）當存檔用的季別標籤。用眾數而非直接取第一列，
    防禦性處理（雖然實測過同一批 bulk 回應年度/季別都一致，但不假設一定如此）。
    抓不到有效年度/季別 → 回傳 None，呼叫端跳過存檔（不猜一個可能錯的標籤）。
    """
    from collections import Counter
    pairs = [(r.get("年度"), r.get("季別")) for r in rows if r.get("年度") and r.get("季別")]
    if not pairs:
        return None
    (year, season), _ = Counter(pairs).most_common(1)[0]
    try:
        greg_year = int(year) + 1911
    except (TypeError, ValueError):
        return None
    return f"{greg_year}Q{season}"


def save_quarterly_snapshot(rows, name):
    """季更新資料的存檔邏輯，跟 save_snapshot()（日更新）不同：檔名帶季別標籤
    （不是日期），而且「這一季的檔名已存在就跳過」——財報同一季內每天抓到的都
    一樣，不像股價每天都有新資料，天天存只會產生大量重複檔案。季別變了（新一季
    財報公布）才會真的寫新檔，這樣才是「累積季度歷史」而不是「每天存一份雷同的
    快照」。
    """
    if not rows:
        return None
    label = quarter_label_from_rows(rows)
    if not label:
        log(f"⚠ {name}：無法從資料判斷年度/季別，跳過存檔")
        return None

    os.makedirs(OUTDIR, exist_ok=True)
    path = os.path.join(OUTDIR, f"{name}_{label}.csv")
    if os.path.exists(path):
        log(f"  {name}_{label}.csv 本季已存過，跳過")
        return path

    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    log(f"  saved {path}（{len(rows)} 筆，季別={label}）")
    return path


def snapshot_financial_statements():
    """依 6 個產業別變體分別抓損益表 + 資產負債表，各自獨立存檔（不合併，因為
    欄位格式不同）。單一產業別失敗只記警告、跳過，不影響其他變體。
    """
    for name, url_tmpl in FIN_STATEMENTS.items():
        for suffix, industry_label in FIN_INDUSTRY_SUFFIXES.items():
            url = url_tmpl.format(suffix=suffix)
            rows = fetch_twse_openapi(url)
            if not rows:
                log(f"⚠ {name}（{industry_label}）快照失敗，跳過")
                continue
            save_quarterly_snapshot(rows, f"{name}_{suffix}")


def main():
    log("=" * 78)
    log("TWSE OpenAPI 每日快照累積（獨立於 Layer 0-3，失敗不影響主 pipeline）")
    log("=" * 78)

    mi_index = fetch_twse_openapi(MI_INDEX_URL)
    if mi_index:
        save_snapshot(mi_index, "mi_index")
    else:
        log("⚠ MI_INDEX 快照失敗，跳過（不中止）")

    stock_day_all = fetch_twse_openapi(STOCK_DAY_ALL_URL)
    if stock_day_all:
        save_snapshot(stock_day_all, "stock_day_all")
    else:
        log("⚠ STOCK_DAY_ALL 快照失敗，跳過（不中止）")

    log("財報季度快照（損益表 + 資產負債表 × 6 個產業別，季別未變則跳過）")
    snapshot_financial_statements()

    log("✅ TWSE 快照完成")


if __name__ == "__main__":
    main()
