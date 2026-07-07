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
import { runLearningAgent, MAX_ITERATIONS } from './agent/planner-agent.js';
import { runMultiAgent } from './agent/multi-agent-planner.js';
import { HARNESS_LIMITS, MULTI_AGENT_LIMITS } from './harness/limits.js';
import { calcCost } from './harness/cost-tracker.js';
import {
    getOrCreateSession, deleteSession, sessionSnapshot,
    summarizeIfNeeded, buildHistoryForAgent, appendExchange,
    CONTEXT_LIMITS,
} from './harness/context-manager.js';
import { getDictMeta } from './tools/dictionary-lookup.js';
import { validateImageUpload } from './harness/image-input-filter.js';
import { sanitizeSvgOutput, extractSvgFromResponse, SvgSafetyError } from './harness/svg-safety-check.js';
import { STYLE_PROMPTS, buildSvgPrompt, AVAILABLE_STYLES } from './harness/svg-style-prompts.js';
import { SVG_LIMITS } from './harness/svg-limits.js';

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

// 全域 body limit · 10mb 支援照片上傳（SVG endpoint）· 純聊天 endpoint 靠 route 內
// message.length > 1000 檢查擋大訊息 · 兩層防線
app.use(express.json({ limit: '10mb' }));
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
    const { message, sessionId } = req.body || {};

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message 必須是非空字串' });
    }
    if (message.length > 1000) {
        return res.status(400).json({ error: '單次問題不要超過 1000 字' });
    }

    const session = getOrCreateSession(sessionId);
    const started = Date.now();
    try {
        // === 若 context 過大 · 先摘要 ===
        const summaryResult = await summarizeIfNeeded(client, MODEL, session);

        // === 組出歷史 · 帶前情提要（若有）===
        const history = buildHistoryForAgent(session);
        const messages = [...history, { role: 'user', content: message }];

        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages,
        });

        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

        const cost = calcCost(response.model, response.usage);
        appendExchange(session, message, text, 'simple', response.usage, cost.twd);

        res.json({
            text,
            usage: response.usage,
            cost,
            stopReason: response.stop_reason,
            model: response.model,
            elapsedMs: Date.now() - started,
            sessionId: session.id,
            session: sessionSnapshot(session),
            summarization: summaryResult.summarized ? summaryResult : null,
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

/**
 * POST /api/chat-agent · Phase 1
 * body: { message: string }
 * response: { finalText, trace, iterations, totalUsage, done, elapsedMs }
 *
 * ReAct 循環 · Claude 可自主決定要不要呼叫 dictionary_lookup / grammar_rule_lookup
 */
app.post('/api/chat-agent', async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message 必須是非空字串' });
    }
    if (message.length > 1000) {
        return res.status(400).json({ error: '單次問題不要超過 1000 字' });
    }

    const session = getOrCreateSession(sessionId);
    const started = Date.now();
    try {
        const summaryResult = await summarizeIfNeeded(client, MODEL, session);
        const history = buildHistoryForAgent(session);
        const result = await runLearningAgent({
            client,
            model: MODEL,
            userQuestion: message,
            conversationHistory: history,
        });
        if (result.finalText) {
            appendExchange(session, message, result.finalText, 'agent', result.totalUsage, result.cost?.twd || 0);
        }
        res.json({
            ...result,
            elapsedMs: Date.now() - started,
            model: MODEL,
            sessionId: session.id,
            session: sessionSnapshot(session),
            summarization: summaryResult.summarized ? summaryResult : null,
        });
    } catch (e) {
        console.error('Agent error:', e.status, e.message);
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效';
        else if (e.status === 404) hint = ` · 模型 ${MODEL} 找不到 · 改用 claude-sonnet-5`;
        else if (e.status === 429) hint = ' · rate limit / 額度用完';
        else if (e.status === 529) hint = ' · Anthropic 過載 · 稍後再試';
        res.status(500).json({ error: (e.message || 'Agent 失敗') + hint });
    }
});

/**
 * POST /api/chat-multi-agent · Phase 3
 * Planner + Grammar 助教 + Example 助教 · 三層架構 · 平行執行
 */
app.post('/api/chat-multi-agent', async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message 必須是非空字串' });
    }
    if (message.length > 1000) {
        return res.status(400).json({ error: '單次問題不要超過 1000 字' });
    }

    const session = getOrCreateSession(sessionId);
    const started = Date.now();
    try {
        const summaryResult = await summarizeIfNeeded(client, MODEL, session);
        const history = buildHistoryForAgent(session);
        const result = await runMultiAgent({
            client, model: MODEL, userQuestion: message,
            conversationHistory: history,
        });
        if (result.finalText) {
            appendExchange(session, message, result.finalText, 'multi-agent', result.totalUsage, result.cost?.twd || 0);
        }
        res.json({
            ...result,
            elapsedMs: Date.now() - started,
            model: MODEL,
            sessionId: session.id,
            session: sessionSnapshot(session),
            summarization: summaryResult.summarized ? summaryResult : null,
        });
    } catch (e) {
        console.error('Multi-agent error:', e.status, e.message);
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效';
        else if (e.status === 404) hint = ` · 模型 ${MODEL} 找不到`;
        else if (e.status === 429) hint = ' · rate limit / 額度用完';
        else if (e.status === 529) hint = ' · Anthropic 過載';
        res.status(500).json({ error: (e.message || 'Multi-agent 失敗') + hint });
    }
});

/**
 * POST /api/svg-generate · Phase 7 · 照片 → 風格化 SVG
 * body: { imageBase64: string, mimeType: string, style: string }
 * flow: image-input-filter → Claude vision API → svg-safety-check
 *
 * body limit 靠全域 express.json({limit:'10mb'}) · 因為圖片 base64 會較大
 */
app.post('/api/svg-generate', async (req, res) => {
    const { imageBase64, mimeType, style } = req.body || {};

    // === 基本參數檢查 ===
    if (typeof imageBase64 !== 'string' || !imageBase64.length) {
        return res.status(400).json({ error: 'imageBase64 必須是非空字串' });
    }
    if (!AVAILABLE_STYLES.includes(style)) {
        return res.status(400).json({
            error: `style 必須是 ${AVAILABLE_STYLES.join(' / ')} 之一 · 收到 ${style}`,
        });
    }

    // === Phase 1 · 輸入驗證 ===
    let imageBuffer;
    try {
        imageBuffer = Buffer.from(imageBase64, 'base64');
    } catch (e) {
        return res.status(400).json({ error: '無法解 base64 · 內容格式錯' });
    }
    const inputCheck = validateImageUpload(imageBuffer, mimeType);
    if (!inputCheck.valid) {
        return res.status(400).json({ error: inputCheck.error, stage: 'input-filter' });
    }

    const started = Date.now();
    const style_meta = STYLE_PROMPTS[style];
    const prompt = buildSvgPrompt(style);

    // === Claude 呼叫 · timeout 用 AbortController ===
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(new Error('SVG generation timeout')), SVG_LIMITS.TIMEOUT_MS);
    let response;
    try {
        response = await client.messages.create({
            model: MODEL,
            max_tokens: SVG_LIMITS.MAX_OUTPUT_TOKENS,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: inputCheck.realMime, data: imageBase64 } },
                    { type: 'text', text: prompt },
                ],
            }],
        }, { signal: abortCtrl.signal });
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError' || /abort/i.test(e.message || '')) {
            return res.status(504).json({ error: `SVG 生成超時（${SVG_LIMITS.TIMEOUT_MS}ms）`, stage: 'timeout' });
        }
        console.error('SVG API error:', e.status, e.message);
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效';
        else if (e.status === 400) hint = ' · 圖片格式可能有問題';
        else if (e.status === 429) hint = ' · rate limit';
        else if (e.status === 529) hint = ' · Anthropic 過載';
        return res.status(500).json({ error: (e.message || 'Claude API 失敗') + hint, stage: 'api' });
    }
    clearTimeout(timer);

    // === 抽出 SVG ===
    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const svgRaw = extractSvgFromResponse(rawText);
    if (!svgRaw) {
        return res.status(500).json({
            error: 'Claude 回應中找不到 <svg> 標籤',
            stage: 'extract',
            rawPreview: rawText.slice(0, 300),
        });
    }

    // === Phase 2 · 輸出安全過濾 ===
    let sanitized, safetyWarnings;
    try {
        const result = sanitizeSvgOutput(svgRaw);
        sanitized = result.cleaned;
        safetyWarnings = result.warnings;
    } catch (e) {
        if (e instanceof SvgSafetyError) {
            return res.status(500).json({
                error: `SVG 安全檢查失敗：${e.message}`,
                code: e.code,
                stage: 'safety-check',
                svgPreview: svgRaw.slice(0, 300),
            });
        }
        throw e;
    }

    // === 成本計算 ===
    const cost = calcCost(response.model, response.usage);

    res.json({
        svg: sanitized,
        style,
        styleLabel: style_meta.label,
        stopReason: response.stop_reason,
        truncated: response.stop_reason === 'max_tokens',
        usage: response.usage,
        cost,
        elapsedMs: Date.now() - started,
        model: response.model,
        inputCheck: {
            realMime: inputCheck.realMime,
            size: inputCheck.size,
            warnings: inputCheck.warnings,
        },
        safety: {
            warnings: safetyWarnings.length ? safetyWarnings : null,
            svgLength: sanitized.length,
        },
    });
});

/**
 * GET /api/session/:id · 讀 session 狀態
 * DELETE /api/session/:id · 清 session（開新對話）
 */
app.get('/api/session/:id', (req, res) => {
    const session = getOrCreateSession(req.params.id);
    res.json({ ok: true, session: sessionSnapshot(session), messages: session.messages });
});

app.delete('/api/session/:id', (req, res) => {
    const existed = deleteSession(req.params.id);
    res.json({ ok: true, existed });
});

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        model: MODEL,
        maxTokensSimple: MAX_TOKENS,
        maxIterationsAgent: MAX_ITERATIONS,
        harnessLimits: HARNESS_LIMITS,
        multiAgentLimits: MULTI_AGENT_LIMITS,
        contextLimits: CONTEXT_LIMITS,
        dictionary: getDictMeta(),
        svgLimits: SVG_LIMITS,
        svgStyles: AVAILABLE_STYLES,
        phase: 'phase-7-photo-to-svg',
        hasKey: !!process.env.ANTHROPIC_API_KEY,
        routes: [
            '/api/chat-simple', '/api/chat-agent', '/api/chat-multi-agent',
            '/api/session/:id (GET/DELETE)',
        ],
    });
});

// 全域錯誤 handler · 保底：body-parser 或其他 middleware 錯 · 回 JSON 而非預設 HTML 頁
// 避免前端拿到 HTML 又 JSON.parse 出「Unexpected token '<'」
app.use((err, req, res, _next) => {
    console.error('Global error:', err.status || 500, err.type, err.message);
    if (res.headersSent) return;
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: `上傳 payload 過大 · 上限 10MB · 收到 ${(err.length / 1024 / 1024).toFixed(2)}MB`,
            stage: 'body-parser',
        });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: `JSON 格式錯：${err.message}`, stage: 'body-parser' });
    }
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        stage: 'unhandled',
    });
});

app.listen(PORT, () => {
    console.log('');
    console.log('🇪🇸 Spanish tutor · Phase 7（照片→SVG · 完整 harness）');
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
