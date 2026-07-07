/**
 * Harness 防護層 · 硬性上限
 * -----------------------------------
 * 這些是「就算 agent 想繞、Claude 想跑更多輪、prompt 忘了寫」的底層防線。
 * 修這裡等於重設整個系統的成本 / 延遲天花板。
 */

export const HARNESS_LIMITS = {
    MAX_TOTAL_TOKENS: 5000,      // 單次 agent 累計 tokens 上限（in + out）· 防燒錢
    MAX_TOOL_CALLS: 6,           // 累計 tool_use 呼叫數上限 · 防無限查
    MAX_ITERATIONS: 6,           // ReAct 主循環最多幾輪 · 防死循環
    TIMEOUT_MS: 30_000,          // 單次 agent 從進來到結束 · 30 秒
    MAX_PER_STEP_TOKENS: 1024,   // 單一 Claude call max_tokens
};

// USD per 1M tokens · 定期對 https://www.anthropic.com/pricing
// 找不到的 model 用 default（Sonnet 定價）
export const PRICING_USD_PER_MTOK = {
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-sonnet-5':   { input: 3, output: 15 },
    'claude-opus-4-8':   { input: 15, output: 75 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    default:             { input: 3, output: 15 },
};

export const USD_TO_TWD = 32;
