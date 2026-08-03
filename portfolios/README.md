# portfolios · 投資追蹤

用 `sector-rotation` pipeline 訊號建構的實盤模擬倉位 · 追蹤 out-of-sample 報酬。

**⚠ 純示範不構成投資建議 · 個人風險自負**

---

## 檔案

```
portfolios/
├── 2026-07-31-picks.json      ← 第一份 · 7/31 收盤建倉
├── (下個 entry)-picks.json
└── README.md                   ← this

scripts/portfolio_tracker.py    ← 抓現價 · 算報酬 · 更新 checkpoint
```

## 結構

每個 `*-picks.json` 有：
- `entry_date`：建倉日
- `regime_at_entry`：建倉當下的市場環境快照（象限 / VIX / TNX / 配置上限）
- `positions[]`：每檔個股的 tier / weight / entry_price / 完整 signals + 為什麼選這檔
- `watchlist_no_position[]`：追蹤但沒建倉的 · 附原因（例：DELL 全場 Point 第 1 但 XLK 被 TNX penalty）
- `benchmarks[]`：VOO 等比較基準
- `checkpoints_data`：1m / 3m / 6m / 1y 4 個 checkpoint 的自動填入區

## 用法

```bash
# 抓現價 · print 每檔 return + 加權組合 return + vs VOO bps
python scripts/portfolio_tracker.py

# 只跑一份
python scripts/portfolio_tracker.py --file 2026-07-31-picks.json

# 只 print 不寫檔（dry run）
python scripts/portfolio_tracker.py --dry
```

Tracker 邏輯：
- 每次執行 · 抓最新 close · print 目前每檔跟建倉價的報酬
- 如果 today 已過 checkpoint 日期（1m / 3m / 6m / 1y）· **自動填入該 checkpoint 資料 · 一次寫死**
- 例：8/31 執行 → 1m checkpoint 填入永久記錄 · 之後 9/15 執行不會覆蓋

## checkpoint 日期規則

以 entry_date 為基準 · 用曆日估算：

| Checkpoint | 對應日期（7/31 建倉為例）|
|---|---|
| 1m | 2026-08-31 |
| 3m | 2026-10-31 |
| 6m | 2027-01-31 |
| 1y | 2027-07-31 |

實際填入時用 T-1 保護 · 若當天美股未開盤則用最後一根 daily close 的日期。

## 加新 portfolio

下個月想再建一份倉：

```bash
# 1. 手動編輯 portfolios/2026-08-31-picks.json（cp 上一份 template）
cp portfolios/2026-07-31-picks.json portfolios/2026-08-31-picks.json
# 2. 改 entry_date + checkpoint_dates + regime_at_entry + positions
# 3. tracker 自動偵測所有 *.json · 一次 update 全部
```

未來可以再寫 `scripts/build_portfolio.py` 從 latest 的 pipeline 輸出自動產出新一份 picks JSON · 這輪暫時手動維護。

## 已知限制

- 未計算股利 / 費用 / 稅務 · 純看 adjusted close 的 price return
- entry_price 是 pipeline 抓到的 T-1 close · 不是實際下單成交價（滑價、時段差異未計）
- 現金部位假設收 0% 利息 · 實際 money market fund 每月約 +0.35%
- 全部部位假設 7/31 一次進場 · 實際下單可能分批
