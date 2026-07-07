/**
 * Caption Validator · 文案輸出驗證
 * -----------------------------------
 * 從 Claude 回應抽出 JSON · 驗證字數 · 提供 retry 訊息
 */

import { CAPTION_LIMITS } from './limits.js';

/** 從 Claude 原始 text 抽 JSON · 容錯處理 markdown / 前後綴 */
export function extractCaptionJson(rawText) {
    if (!rawText) return null;
    // 剝掉可能的 code fence
    let cleaned = rawText.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '');
    // 找第一個 { ... } 大括號區塊
    const match = cleaned.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

/**
 * @returns {{ valid: boolean, error?: string, retryHint?: string }}
 */
export function validateCaptions(captions) {
    if (!captions || typeof captions !== 'object') {
        return { valid: false, error: '不是 object', retryHint: '格式錯 · 請重試' };
    }
    const { line1, line2 } = captions;
    if (typeof line1 !== 'string' || typeof line2 !== 'string') {
        return { valid: false, error: 'line1/line2 不是字串', retryHint: '格式錯 · 請重新產出 JSON' };
    }

    // 純中文字元計數（不含空白、標點）· 你 spec 說「10-14 字」
    const countChinese = s => (s.match(/[一-鿿㐀-䶿]/g) || []).length;

    const c1 = countChinese(line1);
    const c2 = countChinese(line2);

    if (c1 < CAPTION_LIMITS.MIN_LINE_CHARS || c1 > CAPTION_LIMITS.MAX_LINE_CHARS) {
        return {
            valid: false,
            error: `line1 中文字數 ${c1}（${CAPTION_LIMITS.MIN_LINE_CHARS}-${CAPTION_LIMITS.MAX_LINE_CHARS}）`,
            retryHint: `line1 有 ${c1} 個中文字 · 請重新產出 · 每段控制在 10-14 個中文字`,
        };
    }
    if (c2 < CAPTION_LIMITS.MIN_LINE_CHARS || c2 > CAPTION_LIMITS.MAX_LINE_CHARS) {
        return {
            valid: false,
            error: `line2 中文字數 ${c2}（${CAPTION_LIMITS.MIN_LINE_CHARS}-${CAPTION_LIMITS.MAX_LINE_CHARS}）`,
            retryHint: `line2 有 ${c2} 個中文字 · 請重新產出 · 每段控制在 10-14 個中文字`,
        };
    }

    return {
        valid: true,
        line1Chars: c1,
        line2Chars: c2,
    };
}
