/**
 * Poisonous Comic · Harness Limits
 * -----------------------------------
 * 集中所有硬性上限 · 之後 SVG 組裝 phase 也用這裡
 */

export const CAPTION_LIMITS = {
    // 主題輸入
    MAX_THEME_LENGTH: 30,        // 使用者主題最多 30 字
    // Claude API
    MAX_TOKENS: 200,             // 文案輸出很短 · 200 tok 足夠
    TIMEOUT_MS: 15_000,          // 短任務 · 15 秒 timeout
    // 輸出驗證
    MIN_LINE_CHARS: 8,           // spec：10-14 · 但 8-9 若剛好精練也給過 · 避免無限 retry
    MAX_LINE_CHARS: 15,          // spec：10-14 · 15 也給過 · 超過才真的太長
    MAX_RETRIES: 2,              // 字數超標時重試次數
    // 定價（sonnet-4-6）
    USD_PER_MTOK: { input: 3, output: 15 },
    USD_TO_TWD: 32,
};

export const AVAILABLE_STYLES = ['contrast', 'progressive'];

export function calcCost(usage) {
    const usd = (usage.input_tokens / 1e6) * CAPTION_LIMITS.USD_PER_MTOK.input
              + (usage.output_tokens / 1e6) * CAPTION_LIMITS.USD_PER_MTOK.output;
    return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
        usd,
        twd: usd * CAPTION_LIMITS.USD_TO_TWD,
    };
}
