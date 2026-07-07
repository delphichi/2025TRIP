#!/usr/bin/env node
/**
 * test-captions.mjs · Phase 1 · 批次跑 8 個主題 · 兩種句式
 * -----------------------------------
 * 用法：
 *   node test/test-captions.mjs               # 全部主題 · 兩種句式
 *   node test/test-captions.mjs contrast      # 只跑對比
 *   node test/test-captions.mjs progressive   # 只跑遞進
 *
 * 印：主題 / 句式 / line1+字數 / line2+字數 / tokens / 成本 / 耗時
 * 累計成本印在最後
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { generateCaption } from '../core/caption-generator.js';

dotenv.config();

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 缺 ANTHROPIC_API_KEY · cp .env.example .env 並填入');
    process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// 8 個測試主題 · 涵蓋常見毒雞湯場域
const THEMES = [
    '賺錢與花錢',
    '工作與生活',
    '年輕與變老',
    '得到與失去',
    '快樂與痛苦',
    '朋友',
    '愛情',
    '努力',
];

const styleArg = process.argv[2];
const STYLES = styleArg === 'contrast' ? ['contrast']
             : styleArg === 'progressive' ? ['progressive']
             : ['contrast', 'progressive'];

console.log('☠️  Poisonous Comic · Phase 1 · 批次文案測試');
console.log(`   Model: ${MODEL}`);
console.log(`   主題: ${THEMES.length} 個 · 句式: ${STYLES.join(' + ')}`);
console.log(`   總呼叫數: ${THEMES.length * STYLES.length} 次`);
console.log('');

let totalUsage = { input_tokens: 0, output_tokens: 0 };
let totalTWD = 0;
let totalMs = 0;
let successCount = 0;
let warningCount = 0;

for (const theme of THEMES) {
    for (const style of STYLES) {
        const label = style === 'contrast' ? '【對比】' : '【遞進】';
        process.stdout.write(`${label} 主題「${theme}」... `);

        const t0 = Date.now();
        try {
            const r = await generateCaption({ client, model: MODEL, theme, style });
            const elapsed = Date.now() - t0;
            totalMs += elapsed;
            totalUsage.input_tokens += r.usage.input_tokens;
            totalUsage.output_tokens += r.usage.output_tokens;
            totalTWD += r.cost.twd;

            const attemptMark = r.attempt > 1 ? ` (retry ${r.attempt - 1}x)` : '';
            const warningMark = r.warning ? ` ⚠️ ${r.warning}` : '';
            console.log(`${(elapsed / 1000).toFixed(1)}s${attemptMark}${warningMark}`);
            console.log(`   line1: 「${r.line1}」（${r.line1Chars} 字）`);
            console.log(`   line2: 「${r.line2}」（${r.line2Chars} 字）`);
            console.log(`   tokens: in ${r.usage.input_tokens} + out ${r.usage.output_tokens} · NT$${r.cost.twd.toFixed(4)}`);
            console.log('');

            if (r.warning) warningCount++;
            else successCount++;
        } catch (e) {
            console.log('❌ 失敗');
            console.log(`   ${e.message}`);
            console.log('');
        }
    }
}

console.log('=====================================================');
console.log('📊 總結');
console.log(`   成功: ${successCount} · 有警告: ${warningCount}`);
console.log(`   總 tokens: in ${totalUsage.input_tokens} + out ${totalUsage.output_tokens}`);
const totalUSD = (totalUsage.input_tokens / 1e6) * 3 + (totalUsage.output_tokens / 1e6) * 15;
console.log(`   總成本: US$${totalUSD.toFixed(6)} · NT$${totalTWD.toFixed(4)}`);
console.log(`   總耗時: ${(totalMs / 1000).toFixed(1)}s · 平均 ${(totalMs / (successCount + warningCount) / 1000).toFixed(1)}s / 次`);
console.log('=====================================================');
