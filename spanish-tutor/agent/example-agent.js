/**
 * Example Agent · Phase 3 · 例句造句專科助教
 * -----------------------------------
 * 職責：給情境或詞彙 · 造 2-3 個實用例句
 * 工具：只給 dictionary_lookup（單一工具 · 專心）
 * 上限：獨立 HarnessGuard
 */

import { dictionaryLookup } from '../tools/dictionary-lookup.js';
import { HarnessGuard } from '../harness/guard.js';
import { MULTI_AGENT_LIMITS } from '../harness/limits.js';
import { calcCost } from '../harness/cost-tracker.js';

const TOOLS = [
    {
        name: 'dictionary_lookup',
        description: '查西班牙文單字（意思、詞性、變化、例句）· 造句前先查確認變化正確',
        input_schema: {
            type: 'object',
            properties: {
                word: { type: 'string', description: '西班牙文單字原形' },
                context: { type: 'string', description: '（選填）查詢情境' },
            },
            required: ['word'],
        },
    },
];

const SYSTEM_PROMPT = `你是西班牙文例句造句專家（助教）· 由主教練派任務給你。

## 你的工作
1. 收到情境或詞彙清單 · 先呼叫 dictionary_lookup 確認每個字的意思與變化
2. 根據查到的資料 · 造 2-3 個實用例句
3. 若某字 found:false · 明確標示「這個字未驗證」· 例句仍可造但要提醒主教練
4. 若整個目標詞都查不到 · 告訴主教練「這些字都不在字典 · 我用背景知識造句」

## 輸出規則
- 每個例句：**西班牙文**（中文翻譯）+ 短逐詞說明
- 只輸出例句本身 · 不加問候、結尾、追問
- 你的輸出會被主教練整合到給使用者的最終回覆
- 純西班牙文 + 中文 · 不要英文`;

export async function runExampleAgent({ client, model, task, aggregateGuard }) {
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
        const preCheck = guard.checkBeforeNextStep();
        if (preCheck.block) return blocked(guard, trace, totalUsage, model, preCheck);

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
                    reason: `Example agent timeout`,
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
            return {
                done: true,
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
                if (toolUse.name === 'dictionary_lookup') {
                    result = dictionaryLookup(toolUse.input);
                } else {
                    result = JSON.stringify({ error: `Example agent 收到未知工具 ${toolUse.name}` });
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
        reason: `Example agent 超過最大迭代`,
    });
}

function blocked(guard, trace, totalUsage, model, { code, reason }) {
    return {
        done: false,
        blocked: true,
        blockCode: code,
        error: reason,
        finalText: `⛔ [example] ${reason}`,
        trace,
        iterations: guard.iterations,
        usage: totalUsage,
        cost: calcCost(model, totalUsage),
        harness: guard.snapshot(),
    };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }
