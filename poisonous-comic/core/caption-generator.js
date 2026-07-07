/**
 * Caption Generator · Poisonous Comic
 * -----------------------------------
 * 反轉句式金句文案生成器
 * · 對比句式：兩段字數接近 · 結構對稱 · 一正一反
 * · 遞進句式：後段用「才算/才是/才懂」昇華點題
 *
 * 呼叫 Claude sonnet-4-6 · 單次 API 呼叫 · 不用 ReAct
 * · 帶自動 retry：字數超上限時附上具體提示重新產出
 */

import { CAPTION_LIMITS, calcCost } from '../harness/limits.js';
import { extractCaptionJson, validateCaptions } from '../harness/caption-validator.js';

export const CAPTION_SYSTEM_PROMPT = `你是中文金句文案生成器 · 專門寫「兩段式對比／遞進」風格的短句 · 常見於社群漫畫配文。

## 兩種句式

### 【對比句式】
前段講一個看似矛盾的道理 · 後段用相反情境驗證 · 兩段字數接近、結構對稱。

範例：
- 「省几块钱发不了财」／「花几块钱也穷不了」
- 「工作再累也要吃顿好的」／「生活再苦也要笑着过」
- 「賺再多也帶不進棺材」／「花再多也還是要活著」

### 【遞進句式】
前段鋪陳一個平凡狀態 · 後段用更高層次的話昇華、點題 · 通常帶有「才算 / 才是 / 才懂 / 才明白」這類轉折詞。

範例：
- 「年轻时只懂享受生活」／「才算是真正活明白了」
- 「吃过见过闯过之后」／「才明白平淡才是真」
- 「走過人生每個彎路」／「才知道原點也算風景」

## 產出規則

根據使用者給的主題 · 生成 1 組符合以上其中一種句式的文案：

1. 每段限制在 **10-14 個中文字**（含 · 不含）· 要配圖 · 字太長版面放不下
2. 用**繁體中文**回覆
3. **只輸出 JSON** · 格式：\`{"line1":"...","line2":"..."}\`
4. **不要加任何說明文字、markdown code fence、開場白**
5. 第一個字元必須是 \`{\` · 最後一個字元必須是 \`}\`

## 風格提示

毒雞湯的靈魂是「反直覺」· 讓人第一眼點頭 · 第二眼發現「欸不對這是負能量」· 但看完又心裡踏實。不是純負能量 · 是**用真相安慰人**。避免說教味、避免正能量勵志句。`;

/**
 * @param {object} opts
 * @param {object} opts.client · Anthropic SDK client
 * @param {string} opts.model
 * @param {string} opts.theme · 主題（例如「省錢花錢」）
 * @param {string} opts.style · 'contrast' | 'progressive'
 * @returns {Promise<{ line1, line2, style, usage, cost, attempt, retryLog }>}
 */
export async function generateCaption({ client, model, theme, style = 'contrast' }) {
    if (!theme || typeof theme !== 'string') throw new Error('theme 必須是非空字串');
    if (theme.length > CAPTION_LIMITS.MAX_THEME_LENGTH) {
        throw new Error(`theme 過長（${theme.length}）· 上限 ${CAPTION_LIMITS.MAX_THEME_LENGTH}`);
    }

    const stylePrompt = style === 'progressive' ? '請用【遞進句式】' : '請用【對比句式】';
    let userMessage = `主題：${theme}\n${stylePrompt}\n請用 JSON 格式回傳：{"line1":"...","line2":"..."}`;

    const retryLog = [];
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let attempt = 1; attempt <= CAPTION_LIMITS.MAX_RETRIES + 1; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CAPTION_LIMITS.TIMEOUT_MS);
        let response;
        try {
            response = await client.messages.create({
                model,
                max_tokens: CAPTION_LIMITS.MAX_TOKENS,
                system: CAPTION_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }],
            }, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }

        totalUsage.input_tokens += response.usage.input_tokens;
        totalUsage.output_tokens += response.usage.output_tokens;

        const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const captions = extractCaptionJson(rawText);

        if (!captions) {
            retryLog.push({ attempt, error: '找不到 JSON', rawPreview: rawText.slice(0, 200) });
            if (attempt > CAPTION_LIMITS.MAX_RETRIES) {
                throw new Error(`Claude 回應格式錯 · 重試 ${CAPTION_LIMITS.MAX_RETRIES} 次無效`);
            }
            userMessage = `${userMessage}\n\n上一次回覆格式不對 · 請只回傳 JSON · 不要任何前後綴文字`;
            continue;
        }

        const check = validateCaptions(captions);
        if (check.valid) {
            return {
                line1: captions.line1,
                line2: captions.line2,
                style,
                line1Chars: check.line1Chars,
                line2Chars: check.line2Chars,
                stopReason: response.stop_reason,
                usage: totalUsage,
                cost: calcCost(totalUsage),
                attempt,
                retryLog: retryLog.length ? retryLog : undefined,
            };
        }

        // 字數不對 · 附具體 retry hint
        retryLog.push({
            attempt,
            error: check.error,
            captions,
        });
        if (attempt > CAPTION_LIMITS.MAX_RETRIES) {
            // 用完 retry · 但仍回傳最後結果 · 附警告
            return {
                line1: captions.line1,
                line2: captions.line2,
                style,
                line1Chars: (captions.line1?.match(/[一-鿿㐀-䶿]/g) || []).length,
                line2Chars: (captions.line2?.match(/[一-鿿㐀-䶿]/g) || []).length,
                stopReason: response.stop_reason,
                usage: totalUsage,
                cost: calcCost(totalUsage),
                attempt,
                retryLog,
                warning: `字數驗證失敗（${check.error}）· 用完重試次數 · 使用最後版本`,
            };
        }
        userMessage = `主題：${theme}\n${stylePrompt}\n${check.retryHint}\n請重新產出 JSON`;
    }
}
