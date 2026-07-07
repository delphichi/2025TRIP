# ☠️ Poisonous Comic · 毒雞湯漫畫產生器

反轉句式金句文案生成器 + 固定 SVG 零件組裝系統。

**設計哲學**：能用固定模板保證一致性的部分 · 絕對不交給 AI 自由發揮 · 只把「理解使用者想要什麼」交給 Claude。

## Phase 進度

- [x] **Phase 1** · 文案生成器（對比句式 / 遞進句式）
- [ ] Phase 2 · 固定 SVG 零件庫
- [ ] Phase 3 · SVG 組裝邏輯（純程式 · 無 AI）
- [ ] Phase 4 · 意圖解析器（Claude 決定該用哪些零件）
- [ ] Phase 5 · 前端組合呈現

## 快速起動

```bash
cd poisonous-comic

# 1. 安裝依賴
npm install

# 2. 設 API key
cp .env.example .env
# 編輯 .env · 填入 ANTHROPIC_API_KEY

# 3. 跑起來
npm start
# server 起在 http://localhost:3001
```

## 批次文案測試（Phase 1 驗收工具）

```bash
npm run test:caption            # 8 個主題 × 兩種句式 = 16 次呼叫
npm run test:caption contrast   # 只跑對比句式
npm run test:caption progressive # 只跑遞進句式
```

輸出範例：

```
【對比】 主題「賺錢與花錢」... 2.1s
   line1: 「省再多錢也發不了財」（10 字）
   line2: 「花再多也窮不了太久」（10 字）
   tokens: in 550 + out 45 · NT$0.0269

【遞進】 主題「年輕與變老」... 2.0s
   line1: 「年輕以為活出無限可能」（10 字）
   line2: 「才知道時間才是唯一資產」（11 字）
   tokens: in 552 + out 52 · NT$0.0275
```

## 檔案結構

```
poisonous-comic/
├── server.js                    Express server · Phase 1 只有 caption route
├── core/
│   └── caption-generator.js     核心邏輯 + system prompt + retry
├── harness/
│   ├── limits.js                硬性上限（token/字數/retry）+ 定價
│   └── caption-validator.js     JSON 抽取 + 字數驗證
└── test/
    └── test-captions.mjs        批次測試腳本
```

## Harness 設計

| 檢查 | 值 | 為什麼 |
|------|-----|--------|
| 主題長度 | ≤ 30 字 | 使用者輸入邊界 |
| Claude max_tokens | 200 | 文案很短 · 節省成本 |
| Claude timeout | 15s | 短任務 · 快失敗 |
| line1/line2 中文字 | 10-14 字 | 配漫畫版面 |
| 字數超標重試 | 最多 2 次 | 附具體提示重新產出 |

## 成本預估（Phase 1）

- 單次呼叫：~600 in + 50 out ≈ NT$0.028
- 批次 16 次（8 主題 × 2 句式）：**~NT$0.45**
- 100 次生成：~NT$3

真的很便宜 · 純文字任務。

## 為什麼要「固定 SVG 零件」而不是讓 AI 生成整張圖？

見 spanish-tutor 的 Phase 7（照片轉 SVG）· 那條路徑證明了：AI 自由畫 SVG 的問題不是品質 · 是**一致性無法保證**（同一角色兩次生成完全不一樣）。

本專案反向：AI 只做「決定哪個姿勢配哪個表情」的分類任務 · SVG 是預先寫死的字串拼接 · 一致性有數學保證。
