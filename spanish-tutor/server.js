/**
 * 🇪🇸 西班牙文學習助手 · Phase 0
 * ------------------------------------
 * 純文字問答 · 不接工具、不多智能體、不做 Harness 過濾
 * 目的：先確認 API 串接、伺服器架構、前端顯示都通
 *
 * 之後階段：
 *   Phase 1  →  ReAct 循環 + 假工具（agent/planner-agent.js）
 *   Phase 2  →  Harness 防護層（harness/*）
 *   Phase 3  →  多智能體協作（agent/grammar-agent.js · example-agent.js）
 *   Phase 4  →  上下文管理（harness/context-manager.js）
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;
// 若 claude-sonnet-4-6 在你帳號還沒開通 · 換 claude-sonnet-5 / claude-opus-4-8 / claude-haiku-4-5-20251001
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 300;   // 階段 0 · 成本控制 · 上限單次回覆 ≈ NT$0.6

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 缺 ANTHROPIC_API_KEY');
    console.error('   步驟：cp .env.example .env · 填入 https://console.anthropic.com/settings/keys 拿到的 key');
    process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// System prompt · 教 Claude 用「西文 + 中文括號」雙語格式回答
const SYSTEM_PROMPT = `你是一位友善、耐心的西班牙文老師。使用者用中文提問 · 你的回答規則：

1. 用**西班牙文**寫出核心回答句子
2. 換行後在括號內附上**中文翻譯**
3. 若問題涉及要學的詞彙 · 逐詞列出「西文 = 中文意思（詞性、用法備註）」
4. 全程只用西班牙文 + 中文 · 不要出現英文
5. 保持簡潔 · 不超過 3-4 句核心內容
6. 純打招呼、閒聊也用同樣格式回應

範例：
使用者：怎麼說「我想學西班牙文」？
你的回應：
Quiero aprender español.
（我想學西班牙文。）

逐詞說明：
- Quiero = 我想（動詞 querer 第一人稱單數現在式）
- aprender = 學習（原形動詞）
- español = 西班牙文（陽性名詞、也可當形容詞）`;

/**
 * POST /api/chat-simple
 * body: { message: string }
 * response: { text, usage, stopReason, model }
 */
app.post('/api/chat-simple', async (req, res) => {
    const { message } = req.body || {};

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message 必須是非空字串' });
    }
    if (message.length > 1000) {
        return res.status(400).json({ error: '單次問題不要超過 1000 字' });
    }

    const started = Date.now();
    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: message }],
        });

        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

        res.json({
            text,
            usage: response.usage,
            stopReason: response.stop_reason,
            model: response.model,
            elapsedMs: Date.now() - started,
        });
    } catch (e) {
        console.error('Claude API error:', e.status, e.message);
        // 常見錯誤翻譯
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效或未啟用';
        else if (e.status === 404) hint = ` · 模型 ${MODEL} 找不到 · 改用 claude-sonnet-5 之類的`;
        else if (e.status === 429) hint = ' · rate limit / 額度用完';
        else if (e.status === 529) hint = ' · Anthropic 過載 · 稍後再試';
        res.status(500).json({ error: (e.message || 'Claude API 呼叫失敗') + hint });
    }
});

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        model: MODEL,
        maxTokens: MAX_TOKENS,
        phase: 'phase-0-simple-chat',
        hasKey: !!process.env.ANTHROPIC_API_KEY,
    });
});

app.listen(PORT, () => {
    console.log('');
    console.log('🇪🇸 Spanish tutor · Phase 0（純文字問答）');
    console.log(`   URL:   http://localhost:${PORT}`);
    console.log(`   Model: ${MODEL}`);
    console.log(`   Max tokens: ${MAX_TOKENS}`);
    console.log('');
    console.log('💡 測試指令：');
    console.log('   curl -X POST http://localhost:' + PORT + '/api/chat-simple \\');
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"message":"怎麼說我想學西班牙文？"}'`);
    console.log('');
});
