/**
 * Multi-Agent Planner · Phase 3 · 三層架構的協調者
 * -----------------------------------
 * 職責：
 *   1. 讀使用者問題 · 判斷該諮詢哪些助教
 *   2. 派任務給 grammar/example 助教（可平行）
 *   3. 收到助教回覆後 · 整合成使用者的最終回覆
 *
 * 特色：
 *   - 助教是 Planner 的「工具」· Claude 用 tool_use 呼叫
 *   - 平行執行：一輪內若 Claude 派兩個任務 · Promise.all 同時跑
 *   - Aggregate Guard：全部 sub-agent + planner 加總不能超過 15000 tok
 *
 * 為什麼 Planner 沒有直接查字典/文法規則的權限？
 *   職責分離 · 之後 Phase 4 換真 API 只改 grammar/example agent · Planner 不用動
 */

import { runGrammarAgent } from './grammar-agent.js';
import { runExampleAgent } from './example-agent.js';
import { HarnessGuard } from '../harness/guard.js';
import { MULTI_AGENT_LIMITS } from '../harness/limits.js';
import { calcCost } from '../harness/cost-tracker.js';
import { annotateSourceReliability, collectUnverifiedLookups } from '../harness/output-filter.js';

const PLANNER_TOOLS = [
    {
        name: 'consult_grammar_specialist',
        description: '諮詢文法規則專家 · 給文法主題 slug（例如 subjuntivo, ser-estar, por-para, preterito, imperfecto, imperativo, gustar）· 專家回文法說明。' +
                     '使用者問「XX 文法怎麼用」「XX 跟 YY 的差別」「gustar 怎麼用」等特殊句型時派這個專家。',
        input_schema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: '文法主題 slug' },
                focus: { type: 'string', description: '（選填）想聚焦哪一面向 · 例如「表達願望」「常見錯誤」' },
            },
            required: ['topic'],
        },
    },
    {
        name: 'consult_example_specialist',
        description: '諮詢例句造句專家 · 給造句情境和目標單字（原形）· 專家回 2-3 個例句。' +
                     '使用者要造句、想學一個句型、想看實用例子時派這個專家。',
        input_schema: {
            type: 'object',
            properties: {
                scenario: { type: 'string', description: '造句情境描述（中文）例如「表達願望」' },
                target_words: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '（選填）目標單字清單 · 專家會先查字典確認變化',
                },
                count: { type: 'integer', description: '（選填）需要幾個例句 · 預設 3' },
            },
            required: ['scenario'],
        },
    },
];

const PLANNER_SYSTEM_PROMPT = `你是西班牙文老師的協調者 · 手下有兩個專科助教。使用者用中文提問。

## 你的助教

- **consult_grammar_specialist(topic, focus?)** · 文法規則專家
- **consult_example_specialist(scenario, target_words?, count?)** · 例句造句專家

## 判斷派誰

- 純打招呼、閒聊（「你好」「謝謝」）· 極簡單翻譯 → 都不派 · 直接回覆
- 問文法規則 → 派 grammar 專家
- 問單字用法 → 派 example 專家
- **造句題（例如「造 3 個虛擬式句子」）→ 兩個都派** · 一輪內同時派 · 平行執行
- 混合問題 → 兩個都派

## 為什麼平行派？

若一個問題同時要文法和例句 · 你在**同一輪回覆**內呼叫兩個工具 · 我會 Promise.all 平行跑 · 時間對半。
若你分兩輪 · 使用者要多等一輪 · 慢一倍。

## 整合助教回覆

拿到助教回覆後 · 整合成給使用者的最終回覆：

- 西班牙文 + 中文雙語
- 標題 / 表格 / 逐詞說明 · 依內容組織
- **不要說「grammar 助教告訴我...」這種內部細節** · 直接呈現整合後的答案
- 若助教報告「XX 未驗證」· 保留這個提醒到最終回覆
- 保持簡潔 · 不冗餘

## 純西班牙文 + 中文 · 不要英文`;

export async function runMultiAgent({ client, model, userQuestion, conversationHistory = [] }) {
    const aggregateGuard = new HarnessGuard({
        MAX_TOTAL_TOKENS: MULTI_AGENT_LIMITS.AGGREGATE_MAX_TOKENS,
        MAX_TOOL_CALLS: 999,  // aggregate 不管 tool call 數 · 由 sub-agent 各自管
        MAX_ITERATIONS: 999,
        TIMEOUT_MS: MULTI_AGENT_LIMITS.TIMEOUT_MS,
    });

    const plannerGuard = new HarnessGuard({
        MAX_TOTAL_TOKENS: MULTI_AGENT_LIMITS.PLANNER_MAX_TOKENS,
        MAX_TOOL_CALLS: MULTI_AGENT_LIMITS.PLANNER_MAX_DELEGATIONS,
        MAX_ITERATIONS: MULTI_AGENT_LIMITS.PLANNER_MAX_ITERATIONS,
        TIMEOUT_MS: MULTI_AGENT_LIMITS.TIMEOUT_MS,
    });

    const messages = [...conversationHistory, { role: 'user', content: userQuestion }];
    const plannerTrace = [];
    const subAgentTraces = [];
    let plannerUsage = { input_tokens: 0, output_tokens: 0 };
    let subAgentUsage = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i < MULTI_AGENT_LIMITS.PLANNER_MAX_ITERATIONS; i++) {
        // 悲觀估計：這輪最多可能吃 input（messages 累積）+ output（max_tokens）
        const messageBytesEstimate = JSON.stringify(messages).length / 3;  // 粗估 1 token ≈ 3 字元
        const pessimisticNext = Math.ceil(messageBytesEstimate) + MULTI_AGENT_LIMITS.PLANNER_MAX_PER_STEP_TOKENS;

        const preCheck = plannerGuard.checkBeforeNextStep({ pessimisticNextStepTokens: pessimisticNext });
        if (preCheck.block) return buildBlocked({
            plannerTrace, subAgentTraces, plannerUsage, subAgentUsage,
            plannerGuard, aggregateGuard, model, block: preCheck,
        });
        const aggCheck = aggregateGuard.checkBeforeNextStep({ pessimisticNextStepTokens: pessimisticNext });
        if (aggCheck.block) return buildBlocked({
            plannerTrace, subAgentTraces, plannerUsage, subAgentUsage,
            plannerGuard, aggregateGuard, model,
            block: { code: 'AGGREGATE_' + aggCheck.code, reason: `[Aggregate] ${aggCheck.reason}` },
        });

        plannerGuard.recordIteration();
        aggregateGuard.recordIteration();

        const { signal, clear } = plannerGuard.getAbortController();
        let response;
        try {
            response = await client.messages.create({
                model,
                max_tokens: MULTI_AGENT_LIMITS.PLANNER_MAX_PER_STEP_TOKENS,
                system: PLANNER_SYSTEM_PROMPT,
                tools: PLANNER_TOOLS,
                messages,
            }, { signal });
        } catch (e) {
            clear();
            if (e.name === 'AbortError' || /abort/i.test(e.message || '')) {
                return buildBlocked({
                    plannerTrace, subAgentTraces, plannerUsage, subAgentUsage,
                    plannerGuard, aggregateGuard, model,
                    block: { code: 'TIMEOUT', reason: `Planner timeout` },
                });
            }
            throw e;
        }
        clear();

        plannerGuard.recordUsage(response.usage);
        aggregateGuard.recordUsage(response.usage);
        plannerUsage.input_tokens += response.usage.input_tokens;
        plannerUsage.output_tokens += response.usage.output_tokens;

        const textBlocks = response.content.filter(b => b.type === 'text');
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

        plannerTrace.push({
            step: i + 1,
            role: 'planner',
            stopReason: response.stop_reason,
            thinking: textBlocks.map(b => b.text).join('\n'),
            delegations: toolUseBlocks.map(t => ({ specialist: t.name, task: t.input })),
            usage: response.usage,
        });

        // Planner 決定不派助教 · 直接回答（例如打招呼）
        if (toolUseBlocks.length === 0) {
            const rawText = textBlocks.map(b => b.text).join('\n');
            // 掃 sub-agent trace 抓 found:false 訊息（可能是之前輪次）
            const collected = collectUnverifiedFromSubAgents(subAgentTraces);
            const filtered = annotateSourceReliability(rawText, collected.pseudoTrace);

            // === 截斷檢測 · 分級 ===
            // critical: Planner 最終整合被砍 · 使用者看到的答案不完整
            // informational: 只有 sub-agent 中間步被砍 · Planner 有機會補洞、最終回覆仍完整
            const truncationWarnings = [];
            const plannerTruncated = response.stop_reason === 'max_tokens';

            if (plannerTruncated) {
                truncationWarnings.push({
                    source: 'planner',
                    severity: 'critical',
                    reason: `Planner 最終整合被 max_tokens 截斷（output=${response.usage.output_tokens} tok · 上限 ${MULTI_AGENT_LIMITS.PLANNER_MAX_PER_STEP_TOKENS}）· 使用者看到的答案不完整`,
                });
            }
            for (const sub of subAgentTraces) {
                if (sub.result.truncated) {
                    truncationWarnings.push({
                        source: sub.specialist,
                        // Planner 若沒被砍 · sub-agent 截斷 = informational（Planner 能重寫）
                        severity: plannerTruncated ? 'critical' : 'informational',
                        reason: sub.result.truncationReason,
                    });
                }
            }
            const anyTruncated = truncationWarnings.length > 0;
            // 關鍵新欄位：使用者最終看到的答案 · 是否真的不完整
            const finalAnswerAffected = plannerTruncated;

            return {
                done: true,
                truncated: anyTruncated,
                finalAnswerAffected,
                truncationWarnings,
                finalText: filtered.text,
                rawText,
                sourceReliability: {
                    hasUnverified: filtered.hasUnverified,
                    unverifiedWords: filtered.unverifiedWords,
                    unverifiedTopics: filtered.unverifiedTopics,
                },
                plannerTrace,
                subAgentTraces,
                iterations: i + 1,
                plannerUsage,
                subAgentUsage,
                totalUsage: {
                    input_tokens: plannerUsage.input_tokens + subAgentUsage.input_tokens,
                    output_tokens: plannerUsage.output_tokens + subAgentUsage.output_tokens,
                },
                cost: calcCost(model, {
                    input_tokens: plannerUsage.input_tokens + subAgentUsage.input_tokens,
                    output_tokens: plannerUsage.output_tokens + subAgentUsage.output_tokens,
                }),
                harness: {
                    planner: plannerGuard.snapshot(),
                    aggregate: aggregateGuard.snapshot(),
                },
                stopReason: response.stop_reason,
            };
        }

        // 累計 delegation 數
        plannerGuard.recordToolCalls(toolUseBlocks.length);
        messages.push({ role: 'assistant', content: response.content });

        // === 平行派任務給 sub-agent ===
        const delegationPromises = toolUseBlocks.map(async (toolUse) => {
            let subResult;
            const task = buildTaskFromInput(toolUse.name, toolUse.input);
            try {
                if (toolUse.name === 'consult_grammar_specialist') {
                    subResult = await runGrammarAgent({ client, model, task, aggregateGuard });
                } else if (toolUse.name === 'consult_example_specialist') {
                    subResult = await runExampleAgent({ client, model, task, aggregateGuard });
                } else {
                    subResult = {
                        done: false, blocked: true, blockCode: 'UNKNOWN_TOOL',
                        finalText: `⛔ 未知的助教 ${toolUse.name}`,
                        trace: [], usage: { input_tokens: 0, output_tokens: 0 },
                        cost: { usd: 0, twd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                        harness: null,
                    };
                }
            } catch (e) {
                subResult = {
                    done: false, blocked: true, blockCode: 'ERROR',
                    finalText: `⛔ 助教 ${toolUse.name} 出錯：${e.message}`,
                    trace: [], usage: { input_tokens: 0, output_tokens: 0 },
                    cost: { usd: 0, twd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    harness: null,
                };
            }
            return { toolUse, subResult };
        });

        const delegationResults = await Promise.all(delegationPromises);

        // 累計 sub-agent 用量
        for (const { subResult } of delegationResults) {
            subAgentUsage.input_tokens += subResult.usage.input_tokens;
            subAgentUsage.output_tokens += subResult.usage.output_tokens;
        }

        // 保留 sub-agent trace 供前端展示
        for (const { toolUse, subResult } of delegationResults) {
            subAgentTraces.push({
                plannerStep: i + 1,
                specialist: toolUse.name,
                task: toolUse.input,
                result: subResult,
            });
        }

        // 把 sub-agent 的 finalText 當作 tool_result 送回 Planner
        const toolResults = delegationResults.map(({ toolUse, subResult }) => ({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: subResult.finalText,
        }));
        plannerTrace[plannerTrace.length - 1].delegationResults = delegationResults.map(({ subResult }) => ({
            done: subResult.done,
            blocked: subResult.blocked,
            blockCode: subResult.blockCode,
            preview: (subResult.finalText || '').slice(0, 300),
        }));

        messages.push({ role: 'user', content: toolResults });
    }

    return buildBlocked({
        plannerTrace, subAgentTraces, plannerUsage, subAgentUsage,
        plannerGuard, aggregateGuard, model,
        block: { code: 'PLANNER_ITERATION_CAP', reason: 'Planner 超過最大迭代' },
    });
}

// Planner 的 tool_use.input 轉成給 sub-agent 的自然語言任務
function buildTaskFromInput(toolName, input) {
    if (toolName === 'consult_grammar_specialist') {
        const focus = input.focus ? `\n聚焦：${input.focus}` : '';
        return `主題：${input.topic}${focus}\n請提供完整的雙語文法說明。`;
    }
    if (toolName === 'consult_example_specialist') {
        const words = Array.isArray(input.target_words) && input.target_words.length
            ? `\n目標單字：${input.target_words.join(', ')}`
            : '';
        const count = input.count ? `\n數量：${input.count} 個` : '\n數量：3 個';
        return `情境：${input.scenario}${words}${count}\n請造符合情境的例句 · 附中文對照。`;
    }
    return JSON.stringify(input);
}

// 把 sub-agent trace 轉成 output-filter 認得的 trace 格式（tool_calls + tool_results）
function collectUnverifiedFromSubAgents(subAgentTraces) {
    const pseudoTrace = [];
    for (const sub of subAgentTraces) {
        for (const step of sub.result.trace || []) {
            pseudoTrace.push({
                toolCalls: step.toolCalls || [],
                toolResults: step.toolResults || [],
            });
        }
    }
    const collected = collectUnverifiedLookups(pseudoTrace);
    return { pseudoTrace, ...collected };
}

function buildBlocked({ plannerTrace, subAgentTraces, plannerUsage, subAgentUsage, plannerGuard, aggregateGuard, model, block }) {
    const totalUsage = {
        input_tokens: plannerUsage.input_tokens + subAgentUsage.input_tokens,
        output_tokens: plannerUsage.output_tokens + subAgentUsage.output_tokens,
    };
    return {
        done: false,
        blocked: true,
        blockCode: block.code,
        error: block.reason,
        finalText: `⛔ Harness 攔截（Multi-Agent）：${block.reason}\n（協調者未完成 · 請重問或簡化）`,
        plannerTrace,
        subAgentTraces,
        iterations: plannerGuard.iterations,
        plannerUsage,
        subAgentUsage,
        totalUsage,
        cost: calcCost(model, totalUsage),
        harness: {
            planner: plannerGuard.snapshot(),
            aggregate: aggregateGuard.snapshot(),
        },
    };
}
