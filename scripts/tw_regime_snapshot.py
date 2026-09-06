#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股 Regime Gate 快照  scripts/tw_regime_snapshot.py
=====================================================================
台股 v2（generate_daily_report_tw_v2.py）的 Regime Gate：TAIEX 10-15 年
歷史回測 + 今日 regime 分類 + Regime Edge（vs. 無條件持有的 baseline），
完全比照美股 sector_scorecard.py 的 compute_regime_stats() 方法論
（3 條件：> 60 日前價 / 50MA 向上 / 200MA 向上），同一個思考語法套用在
TAIEX，不是另外設計一套規則。

刻意不用 FinMind：FinMind 免費 tier 額度已經被 tw_sector_pipeline.py
的 Layer 3 法人資料用到接近上限（300 次/小時 vs 預設 300 檔股票池 ≈
301 次），Regime 回測需要一次抓 10-15 年歷史，不該再去擠這個額度、
傷到 V1 每天在用的法人資料。改用 TW Market Data（TWMARKETDATA_API_KEY，
跟 FinMind 完全獨立的另一組配額，1 次 request/次執行）。沒設金鑰或
歷史深度不夠時，compute_regime_stats_tw() 會誠實回傳 None，這支腳本
就不產生輸出檔——generate_daily_report_tw_v2.py 讀不到檔案時 Regime
Gate 顯示「還沒有資料」，不會假裝算出東西。

重用（不重寫）tw_sector_pipeline.py 的 compute_regime_stats_tw()。

輸出：
  data/sector_rotation/tw_regime_stats_latest.json

手動跑：
  TWMARKETDATA_API_KEY=xxx python scripts/tw_regime_snapshot.py
"""
import os
import sys
import json
import argparse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tw_sector_pipeline as tsp  # noqa: E402  重用 compute_regime_stats_tw()，不重寫

OUTDIR = "data/sector_rotation"
OUTPUT_PATH = os.path.join(OUTDIR, "tw_regime_stats_latest.json")


def _json_safe(obj):
    if isinstance(obj, float):
        if obj != obj or obj in (float("inf"), float("-inf")):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


def main():
    parser = argparse.ArgumentParser(description="台股 Regime Gate 快照（TAIEX 歷史回測）")
    parser.add_argument("--as-of", dest="as_of",
                        help="回放模式 · 用 YYYY-MM-DD 為基準日（不填 = 用最新）")
    args = parser.parse_args()

    result = tsp.compute_regime_stats_tw(as_of=args.as_of)
    if result is None:
        print("⚠ Regime 回測沒有產生結果（沒設 TWMARKETDATA_API_KEY 或歷史深度不夠），不寫檔")
        return

    os.makedirs(OUTDIR, exist_ok=True)
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(_json_safe(manifest), f, ensure_ascii=False, indent=2, allow_nan=False)
    print(f"✅ 產生 {OUTPUT_PATH}（history_days={result['history_days']}，"
          f"today regime={result['current_regime']}）")


if __name__ == "__main__":
    main()
