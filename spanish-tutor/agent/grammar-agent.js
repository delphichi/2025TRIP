/**
 * Grammar Agent · Phase 3 · 文法規則專科助教
 * -----------------------------------
 * 職責：接受主題查詢 · 回傳結構化文法說明
 * 工具：只給 grammar_rule_lookup（單一工具 · context 精簡）
 * 上限：獨立 HarnessGuard（不會拖垮 planner）
 */

import { grammarRuleLookup } from '../tools/grammar-rule-lookup.js';
import { HarnessGuard } from '../harness/guard.js';
import { MULTI_AGENT_LIMITS } from '../harness/limits.js';
import { calcCost } from '../harness/cost-tracker.js';

const TOOLS = [
    {
        name: 'grammar_rule_lookup',
        description: '查西班牙文文法規則。可查主題：subjuntivo（虛擬式）· preterito（簡單過去式）· imperfecto（未完成過去式）· ser-estar（兩個「是」）· por-para（兩個介系詞）· imperativo（命令式）· gustar（反向主詞句型 · 涵蓋 gustar/encantar/interesar/doler 等）',
        input_schema: {
            type: 'object',
            properties: {
                grammar_topic: { type: 'string', description: '文法主題（英文 slug）' },
            },
            required: ['grammar_topic'],
        },
    },
];

const SYSTEM_PROMPT = `你是西班牙文文法規則專家（助教）· 由主教練派任務給你。

## 你的工作
1. 收到主題查詢 · 呼叫 grammar_rule_lookup 取得規則資料
2. 用「西班牙文 + 中文」雙語整理成清楚的說明
3. 若工具回 found:false · 明確告訴主教練「這個主題我資料庫沒有」· 不要瞎編

## 輸出規則
- 只輸出文法說明本身 · 不加問候、結尾、追問
- 你的輸出會被主教練整合到給使用者的最終回覆
- 保持結構化（規則、例句、常見錯誤）
- 純西班牙文 + 中文 · 不要英文`;

export async function runGrammarAgent({ client, model, task, aggregateGuard }) {
    // 獨立 guard · 用 sub-agent 專屬上限
    const guard = new HarnessGuard({
        MAX_TOTAL_TOKENS: MULTI_AGENT_LIMITS.SUB_AGENT_MAX_TOKENS,
        MAX_TOOL_CALLS: MULTI_AGENT_LIMITS.SUB_AGENT_MAX_TOOL_CALLS,
        MAX_ITERATIONS: MULTI_AGENT_LIMITS.SUB_AGENT_MAX_ITERATIONS,
        TIMEOUT_MS: MULTI_AGENT_LIMITS.TIMEOUT_MS,
    });

    const messages = [{ role: 'user', content: task }];
    const trace = [];
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i < MULTI_AGENT_LIMITS.SUB_AGENT_MAX_ITERATIONS; i++) {
        // Sub 自己的 guard 檢查
        const preCheck = guard.checkBeforeNextStep();
        if (preCheck.block) return blocked(guard, trace, totalUsage, model, preCheck);

        // Aggregate guard 也檢查一次（總合上限）
        if (aggregateGuard) {
            const aggCheck = aggregateGuard.checkBeforeNextStep();
            if (aggCheck.block) return blocked(guard, trace, totalUsage, model, {
                code: 'AGGREGATE_' + aggCheck.code,
                reason: `[Aggregate] ${aggCheck.reason}`,
            });
        }

        guard.recordIteration();
        aggregateGuard?.recordIteration();

        const { signal, clear } = guard.getAbortController();
        let response;
        try {
            response = await client.messages.create({
                model,
                max_tokens: MULTI_AGENT_LIMITS.MAX_PER_STEP_TOKENS,
                system: SYSTEM_PROMPT,
                tools: TOOLS,
                messages,
            }, { signal });
        } catch (e) {
            clear();
            if (e.name === 'AbortError' || /abort/i.test(e.message || '')) {
                return blocked(guard, trace, totalUsage, model, {
                    code: 'TIMEOUT',
                    reason: `Grammar agent timeout`,
                });
            }
            throw e;
        }
        clear();

        guard.recordUsage(response.usage);
        aggregateGuard?.recordUsage(response.usage);
        totalUsage.input_tokens += response.usage.input_tokens;
        totalUsage.output_tokens += response.usage.output_tokens;

        const textBlocks = response.content.filter(b => b.type === 'text');
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

        trace.push({
            step: i + 1,
            stopReason: response.stop_reason,
            thinking: textBlocks.map(b => b.text).join('\n'),
            toolCalls: toolUseBlocks.map(t => ({ name: t.name, input: t.input })),
            usage: response.usage,
        });

        if (toolUseBlocks.length === 0) {
            const truncated = response.stop_reason === 'max_tokens';
            return {
                done: true,
                truncated,
                truncationReason: truncated
                    ? `Grammar 助教最終步 output=${response.usage.output_tokens} tok · 打到 max_tokens 上限 ${MULTI_AGENT_LIMITS.SUB_AGENT_MAX_PER_STEP_TOKENS} · 回覆不完整`
                    : null,
                stopReason: response.stop_reason,
                finalText: textBlocks.map(b => b.text).join('\n'),
                trace,
                iterations: i + 1,
                usage: totalUsage,
                cost: calcCost(model, totalUsage),
                harness: guard.snapshot(),
            };
        }

        guard.recordToolCalls(toolUseBlocks.length);
        messages.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
            let result;
            try {
                if (toolUse.name === 'grammar_rule_lookup') {
                    result = grammarRuleLookup(toolUse.input);
                } else {
                    result = JSON.stringify({ error: `Grammar agent 收到未知工具 ${toolUse.name}` });
                }
            } catch (e) {
                result = JSON.stringify({ error: e.message });
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
        }
        trace[trace.length - 1].toolResults = toolResults.map(tr => ({
            tool_use_id: tr.tool_use_id,
            content: safeParse(tr.content),
        }));
        messages.push({ role: 'user', content: toolResults });
    }

    return blocked(guard, trace, totalUsage, model, {
        code: 'ITERATION_CAP',
        reason: `Grammar agent 超過最大迭代`,
    });
}

function blocked(guard, trace, totalUsage, model, { code, reason }) {
    return {
        done: false,
        blocked: true,
        blockCode: code,
        error: reason,
        finalText: `⛔ [grammar] ${reason}`,
        trace,
        iterations: guard.iterations,
        usage: totalUsage,
        cost: calcCost(model, totalUsage),
        harness: guard.snapshot(),
    };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }
