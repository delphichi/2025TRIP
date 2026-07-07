/**
 * Harness Guard · agent 執行時的即時看門狗
 * -----------------------------------
 * 每一輪 ReAct 之前呼叫 checkBeforeNextStep()
 * 若違規 → agent 立刻中斷 · 回傳「已被 Harness 攔截」
 *
 * 為什麼要獨立成 class：
 * - agent 只管業務邏輯（想不想呼叫工具）
 * - guard 只管邊界（能不能繼續）
 * - 責任分離 · 之後 Phase 3 多 agent 每個都塞同一個 guard 就好
 */

import { HARNESS_LIMITS } from './limits.js';

export class HarnessGuard {
    constructor(limits = HARNESS_LIMITS) {
        this.limits = limits;
        this.startTime = Date.now();
        this.totalTokens = 0;
        this.toolCallCount = 0;
        this.iterations = 0;
        this.violations = [];
    }

    recordUsage(usage) {
        this.totalTokens += (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
    }

    recordToolCalls(n) {
        this.toolCallCount += n;
    }

    recordIteration() {
        this.iterations += 1;
    }

    elapsed() {
        return Date.now() - this.startTime;
    }

    /**
     * 每輪 ReAct 之前呼叫
     * @param {object} [opts]
     * @param {number} [opts.pessimisticNextStepTokens] 悲觀估計「這輪還可能吃多少 token」
     *   若總量 + 這個估計 > 上限 · 提前攔截（避免單一 call 就把總量拉爆）
     * @returns {{ block: false } | { block: true, reason: string, code: string }}
     */
    checkBeforeNextStep(opts = {}) {
        const e = this.elapsed();
        if (e > this.limits.TIMEOUT_MS) {
            const v = {
                code: 'TIMEOUT',
                reason: `超時 ${e}ms > ${this.limits.TIMEOUT_MS}ms · agent 中斷`,
            };
            this.violations.push(v);
            return { block: true, ...v };
        }
        if (this.totalTokens > this.limits.MAX_TOTAL_TOKENS) {
            const v = {
                code: 'TOKEN_CAP',
                reason: `累計 tokens ${this.totalTokens} > 上限 ${this.limits.MAX_TOTAL_TOKENS} · agent 中斷`,
            };
            this.violations.push(v);
            return { block: true, ...v };
        }
        const est = opts.pessimisticNextStepTokens || 0;
        if (est > 0 && this.totalTokens + est > this.limits.MAX_TOTAL_TOKENS) {
            const v = {
                code: 'TOKEN_CAP_PROJECTED',
                reason: `已用 ${this.totalTokens} + 這輪估計 ${est} > 上限 ${this.limits.MAX_TOTAL_TOKENS} · 提前中斷防單步爆量`,
            };
            this.violations.push(v);
            return { block: true, ...v };
        }
        if (this.toolCallCount > this.limits.MAX_TOOL_CALLS) {
            const v = {
                code: 'TOOL_CALL_CAP',
                reason: `工具呼叫累計 ${this.toolCallCount} > 上限 ${this.limits.MAX_TOOL_CALLS} · agent 中斷`,
            };
            this.violations.push(v);
            return { block: true, ...v };
        }
        if (this.iterations >= this.limits.MAX_ITERATIONS) {
            const v = {
                code: 'ITERATION_CAP',
                reason: `迭代 ${this.iterations} >= 上限 ${this.limits.MAX_ITERATIONS} · agent 中斷`,
            };
            this.violations.push(v);
            return { block: true, ...v };
        }
        return { block: false };
    }

    /** 提供 AbortSignal 給 Anthropic SDK · 讓正在跑的 request 也能被切 */
    getAbortController() {
        const remaining = Math.max(0, this.limits.TIMEOUT_MS - this.elapsed());
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new Error(`Harness timeout · ${this.limits.TIMEOUT_MS}ms`)), remaining);
        return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
    }

    snapshot() {
        return {
            elapsedMs: this.elapsed(),
            totalTokens: this.totalTokens,
            toolCallCount: this.toolCallCount,
            iterations: this.iterations,
            violations: [...this.violations],
            withinLimits: this.violations.length === 0,
            limits: this.limits,
        };
    }
}
