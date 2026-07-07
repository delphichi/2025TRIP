/**
 * Poisonous Comic Server · Phase 1
 * -----------------------------------
 * 只有 /api/generate-caption 一個 endpoint
 * SVG 組裝 phase 之後才加
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCaption } from './core/caption-generator.js';
import { runFullPipeline } from './core/pipeline.js';
import { composeCharacterSvg, listAllOptions } from './core/svg-composer.js';
import { CAPTION_LIMITS, AVAILABLE_STYLES } from './harness/limits.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const MODEL = 'claude-sonnet-4-6';

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 缺 ANTHROPIC_API_KEY · 請 cp .env.example .env 並填入');
    process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/generate-caption
 * body: { theme: string, style: 'contrast' | 'progressive' }
 * response: { line1, line2, style, usage, cost, attempt, warning? }
 */
app.post('/api/generate-caption', async (req, res) => {
    const { theme, style = 'contrast' } = req.body || {};

    if (!theme || typeof theme !== 'string') {
        return res.status(400).json({ error: 'theme 必須是非空字串' });
    }
    if (theme.length > CAPTION_LIMITS.MAX_THEME_LENGTH) {
        return res.status(400).json({ error: `theme 過長（${theme.length}）· 上限 ${CAPTION_LIMITS.MAX_THEME_LENGTH}` });
    }
    if (!AVAILABLE_STYLES.includes(style)) {
        return res.status(400).json({ error: `style 必須是 ${AVAILABLE_STYLES.join(' / ')}` });
    }

    const started = Date.now();
    try {
        const result = await generateCaption({ client, model: MODEL, theme, style });
        res.json({
            ...result,
            elapsedMs: Date.now() - started,
            model: MODEL,
        });
    } catch (e) {
        console.error('Caption error:', e.status, e.message);
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效';
        else if (e.status === 429) hint = ' · rate limit';
        else if (e.status === 529) hint = ' · Anthropic 過載';
        res.status(500).json({ error: (e.message || 'Caption 生成失敗') + hint });
    }
});

/**
 * POST /api/compose-comic · Phase 2
 * 完整管線：文案 → 場景 × 2 → SVG × 2
 * body: { theme?, style?, captions? }
 *   若 captions 提供 · 跳過文案生成 · 直接用給定的
 */
app.post('/api/compose-comic', async (req, res) => {
    const { theme, style = 'contrast', captions } = req.body || {};

    if (!captions && (!theme || typeof theme !== 'string')) {
        return res.status(400).json({ error: 'theme 或 captions 至少要提供一個' });
    }
    if (captions && (!captions.line1 || !captions.line2)) {
        return res.status(400).json({ error: 'captions 必須有 line1 和 line2' });
    }
    if (theme && theme.length > CAPTION_LIMITS.MAX_THEME_LENGTH) {
        return res.status(400).json({ error: `theme 過長（${theme.length}）` });
    }
    if (!AVAILABLE_STYLES.includes(style)) {
        return res.status(400).json({ error: `style 必須是 ${AVAILABLE_STYLES.join(' / ')}` });
    }

    const started = Date.now();
    try {
        const result = await runFullPipeline({
            client, model: MODEL, theme, style, captions,
        });
        res.json({
            ...result,
            elapsedMs: Date.now() - started,
            model: MODEL,
        });
    } catch (e) {
        console.error('Compose comic error:', e.status, e.message);
        let hint = '';
        if (e.status === 401) hint = ' · API key 無效';
        else if (e.status === 429) hint = ' · rate limit';
        else if (e.status === 529) hint = ' · Anthropic 過載';
        res.status(500).json({ error: (e.message || '漫畫生成失敗') + hint });
    }
});

/**
 * POST /api/preview-svg · Phase 2 · 純本地預覽（測試用 · 不呼叫 AI）
 * body: { pose, expression, background }
 * 直接組裝 SVG · 讓使用者測試零件效果
 */
app.post('/api/preview-svg', (req, res) => {
    const { pose, expression, background } = req.body || {};
    try {
        const result = composeCharacterSvg({ pose, expression, background });
        res.json({ ...result, cost: { twd: 0 }, apiCallsUsed: 0 });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/svg-options · 列出所有可選 pose/expression/background
 */
app.get('/api/svg-options', (_req, res) => {
    res.json(listAllOptions());
});

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        model: MODEL,
        captionLimits: CAPTION_LIMITS,
        availableStyles: AVAILABLE_STYLES,
        phase: 'phase-2-svg-composer',
        hasKey: !!process.env.ANTHROPIC_API_KEY,
        routes: ['/api/generate-caption', '/api/compose-comic', '/api/preview-svg', '/api/svg-options'],
    });
});

// 全域錯誤 handler · 保底回 JSON
app.use((err, req, res, _next) => {
    console.error('Global error:', err.status || 500, err.type, err.message);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        type: err.type,
    });
});

app.listen(PORT, () => {
    console.log('');
    console.log('☠️  Poisonous Comic · Phase 2（SVG 零件庫 + 組裝）');
    console.log(`   URL:   http://localhost:${PORT}`);
    console.log(`   Model: ${MODEL}`);
    console.log('');
    console.log('💡 測試指令：');
    console.log(`   curl -X POST http://localhost:${PORT}/api/generate-caption \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"theme":"賺錢與花錢","style":"contrast"}'`);
    console.log('');
    console.log('   或跑批次測試：npm run test:caption');
    console.log('');
});
