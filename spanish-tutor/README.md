# 🇪🇸 西班牙文學習助手

用中文問 · 老師用**西班牙文 + 中文對照**回答 · 完整 5 階段 AI Agent 架構。

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

## 字典擴充（Phase 5）

Baseline 內建 51 個常用字（手工整理）· 執行以下命令從 Kaikki.org（Wiktionary 結構化資料 · CC-BY-SA）拉真字典：

```bash
# 拉 5000 字 · 跟 baseline 合併（保留手工 notes）
npm run fetch-dict

# 拉 10000 字
npm run fetch-dict:top10k

# 強制重下 · 不用快取
npm run fetch-dict:fresh
```

第一次會下載 ~30-50MB · 家裡 wifi 幾分鐘。結果寫入 `tools/data/spanish-dictionary.json`。重啟 server 就會看到「字典來源: Kaikki...」。

## 五階段架構

```
Phase 0 · 純文字問答            server.js · /api/chat-simple
Phase 1 · ReAct 循環 + 假工具    agent/planner-agent.js
Phase 2 · Harness 防護層        harness/{limits,guard,cost-tracker,output-filter}.js
Phase 3 · 多智能體協作          agent/{multi-agent-planner,grammar-agent,example-agent}.js
Phase 4 · 對話記憶 + 自動摘要    harness/context-manager.js
Phase 5 · 真字典（Wiktionary）  tools/data/spanish-dictionary.json + scripts/fetch-dictionary.mjs
```

## 檔案樹

```
spanish-tutor/
├── server.js                        — Express + Anthropic SDK · 3 個 chat route + session mgmt
├── public/index.html                — 前端 · 三模式（simple/agent/multi-agent）· session panel
├── agent/
│   ├── planner-agent.js             — Phase 2 · 單一 agent + 兩工具（ReAct）
│   ├── grammar-agent.js             — Phase 3 · 文法助教（單一工具）
│   ├── example-agent.js             — Phase 3 · 例句助教（單一工具）
│   └── multi-agent-planner.js       — Phase 3 · 協調者 · 平行派任務給助教
├── tools/
│   ├── dictionary-lookup.js         — Phase 5 · 從 JSON 載入 · 重音無關比對
│   ├── grammar-rule-lookup.js       — 假文法規則庫 · 6 主題
│   └── data/
│       └── spanish-dictionary.json  — 51 baseline · fetch 後擴至 5000+
├── harness/
│   ├── limits.js                    — Phase 2 · 硬性上限 + 定價表
│   ├── guard.js                     — Phase 2 · 執行時看門狗 + 悲觀預估
│   ├── cost-tracker.js              — Phase 2 · usage → NT$
│   ├── output-filter.js             — Phase 2.1 · 資料來源標記（found:false 保底）
│   └── context-manager.js           — Phase 4 · session store + 自動摘要
└── scripts/
    └── fetch-dictionary.mjs         — Phase 5 · Kaikki 下載+過濾腳本
```

## 三種對話模式

| 模式 | 端點 | 用途 | 每次成本（估） |
|------|------|------|-------|
| 💬 Simple | `/api/chat-simple` | 純文字對話 · 對照組 | NT$0.01-0.05 |
| 🤖 Agent | `/api/chat-agent` | 單一 agent + 兩工具（ReAct） | NT$0.3-1.0 |
| 👥 Multi | `/api/chat-multi-agent` | 三層架構 · Planner + 2 助教平行 | NT$1.0-3.0 |

三模式都共享 session（對話記憶）· 都會被 Harness 全數防護（token cap / timeout / 截斷偵測 / 未驗證來源標記）。

## Harness 防護總覽

| 防護 | 檔案 | 效果 |
|------|------|------|
| Token 硬上限 | limits.js + guard.js | 單次 agent 上限 5000 tok（Phase 2）· Planner 8000 tok（Phase 3.1）· 全部 20000 tok（總合） |
| Timeout | guard.js | 30s（單）/ 60s（多）· 用 AbortSignal |
| 悲觀預估攔截 | guard.js（3.1） | 事前算「這輪最壞情況」· 免得單 call 拉爆 |
| 截斷檢測 | *-agent.js（3.2） | stop_reason=max_tokens 立刻標紅 · 前端跳 banner |
| 資料來源標記 | output-filter.js | found:false 自動加「未驗證」提醒 |
| 對話記憶 | context-manager.js | Session in-memory · TTL 1hr |
| 自動摘要 | context-manager.js | >15000 tok 呼叫 Claude 壓老訊息 |

## 成本控制

- 模型：`claude-sonnet-4-6`
- Session 累計顯示在前端 · 一眼看每個對話花多少
- Aggregate cap 保證單題最貴 NT$3 上限

## 已知限制

- Session 存 in-memory · 重啟就沒（Phase 6 可加 SQLite）
- Kaikki 資料的中文意思偏少（Wiktionary 主要英文）· 老師 agent 讀懂沒問題但顯示會有英文
- 字典結果可能有雜訊字（例如古文、方言）· 用 `--top` 控制數量能過濾
