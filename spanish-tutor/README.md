# 🇪🇸 西班牙文學習助手 · Phase 0

用中文問 · 老師用**西班牙文 + 中文對照**回答。

目前是階段 0：純文字問答 · **沒有**工具、多智能體、Harness 過濾。
先確認 API 串接、伺服器、前端顯示都通再往後推進。

## 快速起動

```bash
cd spanish-tutor

# 1. 安裝依賴
npm install

# 2. 設 API key
cp .env.example .env
# 編輯 .env · 填入 ANTHROPIC_API_KEY

# 3. 跑起來
npm start
# 或開發模式（檔案改動自動重啟）
npm run dev
```

打開 http://localhost:3000

## 測試

用網頁點 preset 或用 curl：

```bash
curl -X POST http://localhost:3000/api/chat-simple \
  -H "Content-Type: application/json" \
  -d '{"message":"怎麼說我想學西班牙文？"}'
```

## 架構（現況 + 未來）

```
spanish-tutor/
├── server.js              — Express + Anthropic SDK · /api/chat-simple 路由
├── public/index.html       — 前端 · textarea + preset + 雙語樣式渲染
├── agent/
│   ├── planner-agent.js    — [Phase 1] ReAct 循環
│   ├── grammar-agent.js    — [Phase 3] 文法子 agent · 獨立上下文
│   └── example-agent.js    — [Phase 3] 例句子 agent · 獨立上下文
├── tools/
│   ├── dictionary-lookup.js    — [Phase 1] 字典查詢
│   └── grammar-rule-lookup.js  — [Phase 1] 文法規則查詢
└── harness/
    ├── input-filter.js         — [Phase 2] 輸入過濾 · 攔提示詞注入
    ├── output-filter.js        — [Phase 2] 輸出格式驗證 · 錯誤重試
    ├── spanish-format-rules.js — [Phase 2] 用代碼卡死西文格式
    └── context-manager.js      — [Phase 4] 對話歷史壓縮
```

## 成本控制

- 模型：`claude-sonnet-4-6`（若你帳號沒開通 · 在 `server.js` 換 `claude-sonnet-5` 之類的）
- `max_tokens: 300` · 單次回覆上限約 NT$0.6
- 單一問題 · 沒有對話歷史 · 不會累積成本
- 前端有 `input.length > 1000` 攔截

## 已知限制（Phase 0 刻意不做）

- ❌ 沒有對話記憶（下一輪 phase 4 加）
- ❌ 沒有字典查詢（下一輪 phase 1 假工具 → phase 4 真工具）
- ❌ 沒有防注入（下一輪 phase 2 加）
- ❌ 沒有格式強制修復（下一輪 phase 2 加）
- ❌ 沒有多智能體協作（下一輪 phase 3 加）

## 下一步

跑通 Phase 0 → 進 Phase 1（`agent/planner-agent.js` + 假工具的 ReAct 循環）
