/**
 * Pipeline · Phase 2 · 完整資料流
 * -----------------------------------
 * 使用者輸入 → 文案生成 → 場景解析 × 2 → SVG 組裝 × 2 → 最終圖卡
 *
 * 這個檔案不做決策 · 只做編排：
 *   1. generateCaption() → { line1, line2 }
 *   2. parseSceneFromCaption() × 2（可平行）→ { pose, expression, background }
 *   3. composeCharacterSvg() × 2 → 兩張 SVG（純本地 · 零 API）
 *   4. 回傳結構化結果
 */

import { generateCaption } from './caption-generator.js';
import { parseSceneFromCaption } from './scene-parser.js';
import { composeCharacterSvg } from './svg-composer.js';

/**
 * @param {object} opts
 * @param {object} opts.client
 * @param {string} opts.model
 * @param {string} opts.theme
 * @param {'contrast' | 'progressive'} opts.style
 * @param {object} [opts.captions] · 若提供 · 跳過文案生成（使用者已挑選好）
 * @returns {Promise<{ line1, line2, panel1, panel2, totalCost, totalUsage }>}
 */
export async function runFullPipeline({ client, model, theme, style = 'contrast', captions }) {
    let captionResult;
    let captionUsage = { input_tokens: 0, output_tokens: 0 };
    let captionCostTWD = 0;

    // === Step 1 · 文案（若已給就跳過）===
    if (captions && captions.line1 && captions.line2) {
        captionResult = { line1: captions.line1, line2: captions.line2, style };
    } else {
        const gen = await generateCaption({ client, model, theme, style });
        captionResult = { line1: gen.line1, line2: gen.line2, style: gen.style };
        captionUsage = gen.usage;
        captionCostTWD = gen.cost.twd;
    }

    // === Step 2 · 兩句話平行解析場景 ===
    const [scene1, scene2] = await Promise.all([
        parseSceneFromCaption({ client, model, captionText: captionResult.line1, role: 'setup' }),
        parseSceneFromCaption({ client, model, captionText: captionResult.line2, role: 'punchline' }),
    ]);

    // === Step 3 · 純本地組裝 · 零 API ===
    const panel1Svg = composeCharacterSvg({
        pose: scene1.pose,
        expression: scene1.expression,
        background: scene1.background,
    });
    const panel2Svg = composeCharacterSvg({
        pose: scene2.pose,
        expression: scene2.expression,
        background: scene2.background,
    });

    // === 累計成本 ===
    const totalUsage = {
        input_tokens: captionUsage.input_tokens + scene1.usage.input_tokens + scene2.usage.input_tokens,
        output_tokens: captionUsage.output_tokens + scene1.usage.output_tokens + scene2.usage.output_tokens,
    };
    const totalCostTWD = captionCostTWD + scene1.cost.twd + scene2.cost.twd;

    return {
        line1: captionResult.line1,
        line2: captionResult.line2,
        style: captionResult.style,
        panel1: {
            caption: captionResult.line1,
            role: 'setup',
            svg: panel1Svg.svg,
            meta: panel1Svg.meta,
            scene: { pose: scene1.pose, expression: scene1.expression, background: scene1.background },
        },
        panel2: {
            caption: captionResult.line2,
            role: 'punchline',
            svg: panel2Svg.svg,
            meta: panel2Svg.meta,
            scene: { pose: scene2.pose, expression: scene2.expression, background: scene2.background },
        },
        totalUsage,
        totalCostTWD,
        breakdown: {
            caption: { usage: captionUsage, twd: captionCostTWD },
            scene1: { usage: scene1.usage, twd: scene1.cost.twd },
            scene2: { usage: scene2.usage, twd: scene2.cost.twd },
            composerAPICalls: 0,   // 強調：composer 完全不呼叫 API
        },
    };
}
