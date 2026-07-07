/**
 * Cost tracker · 把 tokens 換算成新台幣
 * -----------------------------------
 * 純函數 · 不維持狀態 · 只做算術
 */

import { PRICING_USD_PER_MTOK, USD_TO_TWD } from './limits.js';

/**
 * @param {string} model
 * @param {{ input_tokens: number, output_tokens: number }} usage
 */
export function calcCost(model, usage) {
    const rate = PRICING_USD_PER_MTOK[model] || PRICING_USD_PER_MTOK.default;
    const inputUSD = (usage.input_tokens / 1_000_000) * rate.input;
    const outputUSD = (usage.output_tokens / 1_000_000) * rate.output;
    const usd = inputUSD + outputUSD;
    return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
        usd,
        twd: usd * USD_TO_TWD,
        rate,
    };
}

export function formatCost(cost) {
    return {
        tokens: `${cost.totalTokens}（in ${cost.inputTokens} + out ${cost.outputTokens}）`,
        usd: `$${cost.usd.toFixed(6)}`,
        twd: `NT$${cost.twd.toFixed(4)}`,
    };
}
