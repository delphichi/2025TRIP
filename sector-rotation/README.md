# sector-rotation · S&P 500 板塊量價評分 + 選股 pipeline

一套自動化 S&P 500 sector rotation + 個股篩選系統。純瀏覽器前端 · CI 自動跑資料 · commit 進 repo · 沒有 backend、沒有 API key（surprise 走 yfinance 免費）。

**Live 頁面**：`sector-rotation/index.html`（本機打開 / GitHub Pages / 任何靜態 host）

---

## 📊 五個 panel

| Panel | 資料源 | 更新頻率 |
|---|---|---|
| 🌐 市場環境 | `scorecard_latest.json` | 每交易日 |
| 🏆 11 Sector ETF 量價評分排行 | `scorecard_latest.json` | 每交易日 |
| 🎯 策略 A 建議倉位 | `strategy_a_latest.json` | 每週五 |
| 💰 策略 B 逢低買入掃描 | `strategy_b_latest.json` | 每週五 |
| 📈 Stage 2 個股 top-3 熱區榜 | `latest.json` | 每週五 |

---

## 🔄 資料流

```
                          ┌─────────────────────────────────────┐
                          │ CI · .github/workflows/              │
                          │  sector-rotation.yml                │
                          └──────────┬──────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────────┐
        ▼                            ▼                                ▼
   Stage 1 · 每交易日              Stage 2 · 週五+manual            Strategy A + B · 週五+manual
   ─────────────────              ────────────────────              ───────────────────────────
   scripts/                       scripts/                          scripts/
   sector_scorecard.py           sector_rotation_screener.py       strategy_a_pipeline.py
                                                                    strategy_b_scanner.py
        │                              │                                    │
        │ 11 SPDR ETF                  │ S&P 500 全 universe                 │ 讀 stage1 + stage2 輸出
        │ + VOO/VIX/^TNX               │ + 1y daily OHLCV                    │ 掃全 500 daily
        │                              │ + yfinance earnings                 │
        ▼                              ▼                                    ▼
   scorecard_latest.json         latest.json                         strategy_a_latest.json
                                                                     strategy_b_latest.json
                                                                     watchlist_horses.json
                                     │                                    │
                                     └──────────────┬─────────────────────┘
                                                    ▼
                                        瀏覽器 · sector-rotation/renderer.js
                                        直接 fetch 4 個 JSON manifest 渲染
```

---

## 📁 檔案佈局

```
sector-rotation/          ← 前端（純 static · 打開 index.html 即可）
├── index.html
├── renderer.js
├── style.css
└── README.md            ← this

scripts/                  ← 4 個 Python script
├── sector_scorecard.py         ← Stage 1 · 每交易日
├── sector_rotation_screener.py ← Stage 2 · 週五
├── strategy_a_pipeline.py      ← Strategy A · 依賴 stage 1+2
└── strategy_b_scanner.py       ← Strategy B · 獨立掃全 500

data/sector_rotation/     ← 資料輸出（CI 自動 commit）
├── {YYYYMMDD}_scorecard.csv         每天一份
├── {YYYYMMDD}_all.csv               每週一份
├── {YYYYMMDD}_top3_{4w,13w,26w,cms_a}.csv
├── {YYYYMMDD}_strategy_b.csv        只在有 hit 時產
├── scorecard_latest.json            manifest（前端讀）
├── latest.json                      manifest（前端讀）
├── strategy_a_latest.json           manifest（前端讀）
├── strategy_b_latest.json           manifest（前端讀）
└── watchlist_horses.json            黑馬名單跨月持久化

.github/workflows/sector-rotation.yml    ← CI · 每交易日 + 週五
```

---

## 🧮 公式速查

### Point（越大越強 · 重中長期）
```
Point = 4W% × 0.25 + 13W% × 0.25 + 26W% × 0.50
```

### CMS_A（越小越強 · 重短線 · 板塊內排名）
```
CMS_A = 0.5 × 4W_rank + 0.3 × 13W_rank + 0.2 × 26W_rank
```

### di · 三週期正報酬指標
```
di = ((4W>0) + (13W>0) + (26W>0)) / 3
1.0 = 三週期全漲（最強）
```

### vp_score · 量價絕對評分（0-100）
```
vp_score = MIN(100, MAX(0,
    20d × 200 × 0.30    ← 中期報酬
  + 5d  × 200 × 0.20    ← 短期報酬
  + VP  × 50  × 0.35    ← 上漲/下跌日均量比
  + UD  × 100 × 0.15    ← 上漲/下跌天數比
  + 50                  ← 基準
))
```
註：20d/5d 用「小數報酬」（0.05 = 5%），非百分數

### composite · 綜合分（越小越強）
```
composite = Point_rank × 0.40 + vp_score_rank × 0.40 + vol_rank × 0.20
```

### gap_alert · 差距警示
```
|Point_rank - vp_score_rank| > 5
  → Point 前段 + vp 落後 → 「吃老本」（漲多動能弱 · 排除）
  → vp 前段 + Point 落後 → 「剛爆發」（量價強但漲幅追不上 · 最多衝刺 15%）
```

### VCP · Wyckoff/Minervini 建立階段
```
VCP = AND(
  t_price > 50MA,             ← 站上 50 日均線
  10 日振幅 < 3%,              ← 波動收斂
  VP = AD/AC > 1.0             ← 上漲有量 · 回檔縮量
)
```

### 市場四象限（VOO）
```
趨勢：VOO 現價 vs 60 日前 → 🟢 多頭 / 🔴 空頭
溫度：VOO 現價 vs 50MA    → 🔥 極強(>+2%) / 🟡 盤整 / ❄ 寒冬(<-2%)
VIX > 30 → 全倉現金覆蓋所有象限

配置上限對照：
🔥+🟢 → 核心40 / 動能35 / 衝刺15 / 現金10
🔥+🔴 → 30 / 25 / 10 / 35
🟡+🟢 → 30 / 25 / 0  / 45
🟡+🔴 → 20 / 15 / 0  / 65
❄+🟢 → 20 / 0  / 0  / 80
❄+🔴 → 0  / 0  / 0  / 100
```

### TNX 濾網
```
TNX > 4% → 利多 XLE/XLF/XLV · 利空 XLK/XLRE/XLU（後兩者自動降級）
TNX < 3% → 利多 XLK · 利空 XLE/XLF
```

### 策略 A 九步驟
```
1  市場環境（VOO+VIX）→ 決定配置上限
2  TNX → 決定 sector boost/penalty
3  sector 前 3 by composite_rank · 加黑馬預警（Point rk5-8 + vp rk5-8 + vol rk top3）
4  TNX penalty sector 降級 · 綜合分第 4/5 名遞補
5  個股候選池 = 前 3 sector 的 stage 2 top3 (4W/13W/26W/CMS_A) union
6  三層漏斗：
     L1: di=1.0 優先 · CMS_A 排序 · 取前 1/3
     L2: VP<0.9 排除 · 距高點 <-20% 標記深度反彈 · 財報 14d 內暫緩
     L3: 核心（距高>-5% + VP>1 + VCP）· 動能（TNX順風 + VP>=1 + 4W正）· 衝刺（其他）
7  破格：全場 Point 最高不在候選池 · Point 領先池第 3 名 50%+ · ETF 至少一套系統前 5
8  相關性警示：XLK+XLC / XLK+XLY 高相關避免同持 · XLV 分散 OK
9  黑馬觀察名單持久化 → 檢查上輪黑馬是否升進本輪前 5
```

### 策略 B 逢低買入 4 條件
```
① 當日跌 > 5%
② 50MA 向上 AND 200MA 向上（今日 MA > 6 天前 MA）
③ RSI(14) < 40 · 超賣
④ 昨日量 > 20d 均量 × 1.2

進場時機：不是大跌當天立刻買
  · 大跌後 → 觀察量縮
  · 量縮後放量 →  進場
```

---

## 🕰 CI 排程

```yaml
schedule:
  - cron: '30 21 * * 1-5'   # 週一~五 UTC 21:30 · 跑 stage 1
  - cron: '0 22 * * 5'      # 週五 UTC 22:00 · 加跑 stage 2 + strategy A + strategy B
```

**手動觸發**：Actions → sector-rotation-daily → Run workflow → 勾 `run_stage2=true` 跑完整 pipeline

**時區換算**：UTC 21:30 = 美東 17:30 (EDT) / 16:30 (EST) · 都在美股收盤（16:00 ET）後

---

## 💻 本機手動跑

```bash
pip install yfinance pandas requests lxml

# Stage 1 · 快（<10s）· 11 sector ETF
python scripts/sector_scorecard.py

# Stage 2 · 慢（3-5min）· 500 檔 · 需 1y daily + earnings
python scripts/sector_rotation_screener.py

# Strategy A · 快（<1s）· 只讀 stage 1+2 輸出
python scripts/strategy_a_pipeline.py

# Strategy B · 慢（1-2min）· 掃全 500 檔 daily
python scripts/strategy_b_scanner.py
```

**環境變數**：
- `FMP_API_KEY`（可選）· FMP free tier 對 `/earnings-surprises` 是 403 · 目前 script 走 yfinance · secret 留著等 FMP Starter 升級再啟用

---

## ⚙ 設計原則

1. **T-1 基準日** · 用「抓到的最後一根完整 close」的日期（非腳本執行當日）· 盤中跑同一支不會有 partial 資料
2. **檔名帶日期 stamp** · 所有 CSV 都是 `{YYYYMMDD}_*.csv` · 可以 diff / 回溯
3. **manifest 分離** · CSV 是原始資料 · `*_latest.json` 是給前端讀的濃縮版 · 兩者可獨立更新
4. **策略腳本無 side effect** · 只讀既有輸出 + 寫自己的 output · 不會污染 stage 1/2
5. **前端純 fetch** · 沒 backend · 沒 build step · GitHub Pages 直接部署

---

## 🐛 已知限制 / TODO

- **Step 6 · 基本面地雷 blocklist** · 訴訟 / CEO / 政策風險需人工維護 · 現在跳過（TODO：加 CSV 手動維護）
- **Step 7 · 破格判斷「單一事件驅動 vs 結構性上漲」** · 現只用 Point 領先閾值 · 無法自動辨別
- **策略 B 頻率** · 目前跟 stage 2 同排（週五）· 但「當日跌 >5%」訊號其實日日新 · 未來想日跑改到 stage 1 gate
- **FMP `/earnings-surprises`** · Free tier 403 · 已改用 yfinance · 若升級 FMP Starter 可切回（yfinance 資料品質也夠好）

---

## 🚑 常見故障

### CI 一直 fail 在 `setup-python@v5`
`cache: 'pip'` 需要 `requirements.txt` / `pyproject.toml` · repo 沒放這兩檔 → 拿掉 cache（見 commit `3b7aad1`）

### as_of_date 顯示的是今天不是 T-1
yfinance 在美國盤中會回傳當日 partial daily bar → 檢查 `_drop_today_bar()` 有沒有被呼叫 · 見 commit `1828c9a`

### Stage 2 step 只跑 2 秒就 success（實則 skipped）
`if:` 條件沒觸發 · 用 GitHub Actions 原生 expression 判斷 boolean input · 別用 shell env（見 commit `1828c9a`）

### Stage 2 掛掉但 CI 顯示 success
`python | tee` 的 exit code 是 tee 的 · 一定要加 `set -o pipefail` + `shell: bash`（見 commit `7cc497f`）

### `pd.read_html(raw_str)` raise · 全 stdout dump HTML
pandas 3.0 棄用 · 用 `pd.read_html(StringIO(text))` · 見 commit `7cc497f`

### FMP surprise 全 403
FMP free tier 沒該 endpoint 權限 · 用 yfinance `ticker.earnings_dates` 替代 · 見 commit `db5424d`

### VCP 濾網結果永遠很少（0-3 檔）
**這是設計** · Wyckoff/Minervini 建立階段本來就罕見（同時滿足站上 50MA + 振幅 <3% + VP>1）· 不是 bug

### 策略 A 「核心 = 0 檔」
承上 · 核心條件需要 VCP=TRUE · 通常一個交易日只有 0-3 檔全 500 個股滿足 · 進到策略 A 前 3 sector 又要 top3 union 又要 di=1.0 · 剩下的機率極低 · 這也是設計（策略 A 本來就保守）

---

## 🔬 回測結果（重要 · 誠實揭露）

**跑了 4 個歷史日期 × 3 種規則版本 · 統計 sample 太小但結論明確：**

| Variant | Rules | Wins/Loss/空倉 | 平均 vs VOO 1y |
|---|---|---|---|
| **baseline** | di=1.0 · composite top 3 · sector 取 1 | 1 / 2 / 1 | **-430 bps** |
| **expA** | 拿掉 di=1.0 · 其他同 baseline | 1 / 2 / 1 | **-175 bps** 🥇 |
| **expB** | composite top 5 · sector 取 2 | 1 / 2 / 1 | -573 bps |

**4 個歷史日期分別結果（1y forward return · vs VOO bps）：**

| Date | Regime | baseline | expA | expB |
|---|---|---|---|---|
| 2023-07-31 | 🔥+🟢 | 1 pick · **-1841** | 2 picks · -1460 | 1 · -1841 |
| 2024-01-31 | 🔥+🟢 | **0 picks** | **0 picks** | 0 picks |
| 2024-07-31 | 🟡+🟢 | 3 picks · -864 | 3 · -864 | 6 · -1035 |
| 2025-07-31 | 🔥+🟢 | 3 picks · **+1415** | 3 · **+1800** | 5 · +1157 |

**重要學到的：**

1. **di=1.0 過度嚴格 · 排除有潛力個股** — expA 換到 BKR (+37%)、AME (+9%) 比 baseline 更好
2. **但 hit rate 沒改變 · 仍是 1/4 贏** — 4 個 sample 太小 · 統計不顯著 · 但方向暗示 pipeline 目前不是能穩定 outperform 的策略
3. **2024-01-31 的 0-pick 問題不是 di=1.0** — 拿掉還是 0 檔 · 真正元兇是 TNX 3.97% 中性期只有 XLK 順風 · 需要另一次修法
4. **65% 現金部位 = bull market 系統性 drag** · 完整 portfolio return 常低於 VOO
5. **INCY / BKR 那種爆發股是 alpha 主要來源** — 沒選中的話單靠其他就打平大盤

**定位（誠實）：** Pipeline 現階段是**紀律化研究工具** · 不是能穩定贏大盤的策略。要當實盤用需再多做幾十個 out-of-sample tests 建立信心 · 或接受它保守的本質。

回測工具檔案：
- `scripts/backtest_pipeline.py` — `--as-of DATE --variant [baseline|expA|expB|expC]`
- `.github/workflows/backtest.yml` — 手動觸發 workflow_dispatch
- `portfolios/backtest_*.json` — 每次回測輸出（含 4 個 checkpoint 已填 forward returns）

---

## 📝 開發歷程摘要

從 2026 年 7 月市場回顧的三張 top-3 heatmap 出發，跨 4 個 PR / 15 個 commit / 4 個 CI 修 bug 週期建立：

1. `PR #10` · Stage 1 + Stage 2 骨架 · 3 個 heatmap 對齊 100%
2. main direct · 對齊完整方法論（Point / CMS_A / di / vp_score / composite / gap_alert）
3. main direct · A+B+C 濾網（VCP + 市場四象限 + TNX）
4. main direct · D 策略 A 九步驟 pipeline
5. main direct · E 策略 B 逢低買入掃描器

7/31 收盤實測：
- 象限 🟡+🟢 · 配置上限 30/25/0/45 · TNX 4.74% > 4% · VIX 15.99 正常
- 有效 sector: XLE / XLF / XLI（TNX 過濾後）
- 策略 A: VLO / TRV 動能各 12.5% · DELL 破格但 sprint=0% · MPC/PSX 財報暫緩
- 策略 B: CTVA -12% 大跌 + LYV -5% 都是 RSI 超賣 + 量爆 + 趨勢完好 → 教科書式逢低訊號
