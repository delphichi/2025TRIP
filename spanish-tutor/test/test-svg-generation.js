#!/usr/bin/env node
/**
 * test-svg-generation.js · Phase 7 · 階段 0 測試
 * -----------------------------------
 * 目的：跑通照片→SVG 最小流程 · 確認：
 *   1. API 呼叫成功、格式正確
 *   2. 回傳內容是不是合法 SVG
 *   3. 實際 token 用量（圖片輸入通常比純文字消耗更多）
 *
 * 用法：
 *   node test/test-svg-generation.js               # 用預設 sketch 風格
 *   node test/test-svg-generation.js geometric     # 指定風格
 *   node test/test-svg-generation.js sketch path/to/photo.jpg  # 指定圖片
 *
 * 前置：
 *   - 若 test/sample.png 不存在 · 先跑 node test/create-sample-png.mjs
 *   - .env 需有 ANTHROPIC_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { STYLE_PROMPTS, buildSvgPrompt, AVAILABLE_STYLES } from '../harness/svg-style-prompts.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;   // 階段 0 · 小額度先看基線

const styleKey = process.argv[2] || 'sketch';
const imagePath = process.argv[3] || path.join(__dirname, 'sample.png');

if (!AVAILABLE_STYLES.includes(styleKey)) {
    console.error(`❌ 未知風格 ${styleKey} · 可用：${AVAILABLE_STYLES.join(', ')}`);
    process.exit(1);
}
if (!fs.existsSync(imagePath)) {
    console.error(`❌ 找不到圖片 ${imagePath}`);
    console.error(`   先跑：node test/create-sample-png.mjs`);
    process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 缺 ANTHROPIC_API_KEY · 檢查 .env');
    process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
    const stats = fs.statSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png'
                    : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
                    : ext === '.webp' ? 'image/webp'
                    : 'image/png';
    const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });

    const style = STYLE_PROMPTS[styleKey];
    const prompt = buildSvgPrompt(styleKey);

    console.log('🎨 Phase 7 · 階段 0 · SVG 生成測試');
    console.log('   Model:      ', MODEL);
    console.log('   Max tokens: ', MAX_TOKENS);
    console.log('   風格:       ', `${style.label}（${styleKey}）· ${style.description}`);
    console.log('   圖片:       ', imagePath);
    console.log('   圖片大小:    ', `${(stats.size / 1024).toFixed(1)} KB · base64 後 ${(imageData.length / 1024).toFixed(1)} KB`);
    console.log('');
    console.log('📤 送出中...');

    const t0 = Date.now();
    let response;
    try {
        response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
                    { type: 'text', text: prompt },
                ],
            }],
        });
    } catch (e) {
        console.error(`\n❌ API 失敗（${e.status || '?'}）: ${e.message}`);
        if (e.status === 401) console.error('   API key 無效');
        else if (e.status === 400) console.error('   請求格式錯 · 檢查 image media_type / 圖片是否壞');
        else if (e.status === 429) console.error('   Rate limit');
        else if (e.status === 529) console.error('   Anthropic 過載 · 稍後再試');
        process.exit(1);
    }
    const elapsed = Date.now() - t0;

    // === 回應解析 ===
    const textBlocks = response.content.filter(b => b.type === 'text');
    const raw = textBlocks.map(b => b.text).join('\n');
    const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
    const svg = svgMatch ? svgMatch[0] : null;

    // === Token 用量 + 成本估算 ===
    const usage = response.usage;
    const USD_PER_MTOK = { input: 3, output: 15 };  // sonnet 4-6
    const usd = (usage.input_tokens / 1e6) * USD_PER_MTOK.input
              + (usage.output_tokens / 1e6) * USD_PER_MTOK.output;
    const twd = usd * 32;

    console.log('');
    console.log('==================== 結果 ====================');
    console.log(`⏱️  耗時:        ${(elapsed / 1000).toFixed(1)} 秒`);
    console.log(`🎯 stop_reason: ${response.stop_reason}${response.stop_reason === 'max_tokens' ? '  🚨 被截斷' : ''}`);
    console.log('');
    console.log('📊 Token 用量:');
    console.log(`   input_tokens:  ${usage.input_tokens}    ← 圖片 + prompt`);
    console.log(`   output_tokens: ${usage.output_tokens}    ← SVG 程式碼`);
    console.log(`   total:         ${usage.input_tokens + usage.output_tokens}`);
    console.log('');
    console.log('💰 成本估算（sonnet-4-6 定價）:');
    console.log(`   USD: $${usd.toFixed(6)}`);
    console.log(`   TWD: NT$${twd.toFixed(4)}`);
    console.log('');
    console.log('🖼️  SVG 檢查:');
    if (svg) {
        const outPath = path.join(__dirname, `output-${styleKey}.svg`);
        fs.writeFileSync(outPath, svg);
        console.log(`   ✅ 找到合法 <svg> 標籤`);
        console.log(`   SVG 大小: ${svg.length} 字元`);
        console.log(`   已存到:  ${outPath}`);
        // 簡單語法檢查
        const hasCloseTag = /<\/svg>/i.test(svg);
        const hasViewBox = /viewBox=/i.test(svg);
        const hasScript = /<script/i.test(svg);
        const hasOnEvent = /\son\w+\s*=/i.test(svg);
        console.log(`   結構檢查:`);
        console.log(`     · 有 </svg>:   ${hasCloseTag ? '✓' : '✗'}`);
        console.log(`     · 有 viewBox: ${hasViewBox ? '✓' : '✗ (可能沒設)'}`);
        console.log(`     · 無 script:  ${hasScript ? '✗ 有 · 需清' : '✓'}`);
        console.log(`     · 無 onEvent: ${hasOnEvent ? '✗ 有 · 需清' : '✓'}`);
    } else {
        console.log(`   ❌ 沒找到 <svg> · 原始回應：`);
        console.log(`   ${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`);
    }
    console.log('==============================================\n');
}

main().catch(e => {
    console.error('\n💥 未預期錯誤:', e);
    process.exit(1);
});
