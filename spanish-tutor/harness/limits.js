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

/**
 * Multi-agent 專用上限 · Phase 3
 * -----------------------------------
 * 三層架構：Planner + 2 個 sub-agent
 * · 每個 sub-agent 有獨立 Guard（sub 內部）
 * · Planner 有自己的 Guard（協調層）
 * · Aggregate cap 是「總合上限」· 任何一層都會查
 */
export const MULTI_AGENT_LIMITS = {
    // Planner 是整合者 · 要吃兩個助教的完整輸出 · 上限比 sub-agent 大
    PLANNER_MAX_TOKENS: 8000,           // 3000 → 8000（實測 synthesis 需要 6000+）
    PLANNER_MAX_ITERATIONS: 4,
    PLANNER_MAX_DELEGATIONS: 4,
    PLANNER_MAX_PER_STEP_TOKENS: 2048,  // 1024 → 2048（防最終整合被 max_tokens 截斷）
    // Sub-agent 職責單純 · 上限維持
    SUB_AGENT_MAX_TOKENS: 3000,
    SUB_AGENT_MAX_ITERATIONS: 4,
    SUB_AGENT_MAX_TOOL_CALLS: 4,
    SUB_AGENT_MAX_PER_STEP_TOKENS: 1024,
    // 總合上限 · 最後防線
    AGGREGATE_MAX_TOKENS: 20_000,        // 15000 → 20000（配合 planner 提高）
    TIMEOUT_MS: 60_000,
    // 相容欄位 · 給沒特別區分的地方（例如 grammar/example 都是 sub）
    MAX_PER_STEP_TOKENS: 1024,
};
