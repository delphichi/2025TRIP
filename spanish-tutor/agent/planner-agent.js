/**
 * Planner Agent · Phase 1 · ReAct 循環
 * -----------------------------------------
 * 給 Claude 兩個工具（dictionary_lookup + grammar_rule_lookup）
 * 每輪：
 *   1. 送 messages 給 Claude
 *   2. 若回覆包含 tool_use · 執行工具、把結果 append 回 messages · 繼續
 *   3. 若回覆只有 text · 結束
 * 硬 cap max_iterations = 6（Harness 攔截無限循環）
 */

import { dictionaryLookup } from '../tools/dictionary-lookup.js';
import { grammarRuleLookup } from '../tools/grammar-rule-lookup.js';

const TOOLS = [
    {
        name: 'dictionary_lookup',
        description: '查西班牙文單字的意思、詞性、動詞變化、例句。' +
                     '使用者問「XX 是什麼意思」「XX 怎麼變化」「XX 怎麼用」或需要展開單字細節時使用。',
        input_schema: {
            type: 'object',
            properties: {
                word: {
                    type: 'string',
                    description: '要查的西班牙文單字（原形 · 例如 querer、ser、hablar）',
                },
                context: {
                    type: 'string',
                    description: '（選填）查詢情境 · 例如「使用者想造句」',
                },
            },
            required: ['word'],
        },
    },
    {
        name: 'grammar_rule_lookup',
        description: '查西班牙文文法規則。' +
                     '使用者問「XX 文法怎麼用」「XX 跟 YY 的差別」「XX 什麼時候用」時使用。' +
                     '可查主題：subjuntivo（虛擬式）、preterito（簡單過去式）、imperfecto（未完成過去式）、' +
                     'ser-estar（兩個「是」）、por-para（兩個介系詞）、imperativo（命令式）。',
        input_schema: {
            type: 'object',
            properties: {
                grammar_topic: {
                    type: 'string',
                    description: '文法主題（英文 slug · 例如 subjuntivo）',
                },
            },
            required: ['grammar_topic'],
        },
    },
];

const AGENT_SYSTEM_PROMPT = `你是一位友善的西班牙文老師 · 使用者用中文提問。

## 你有兩個工具

- **dictionary_lookup(word)** · 查單字（意思、變化、例句）
- **grammar_rule_lookup(grammar_topic)** · 查文法規則

## 判斷用不用工具

會用工具的情況：
1. 使用者問特定單字（quiero / ser / hablar 等）→ dictionary_lookup
2. 使用者問文法規則（虛擬式、ser vs estar 等）→ grammar_rule_lookup
3. 使用者要造句、想學一整個句型 · 涉及不確定的動詞變化 → 用 dictionary_lookup 確認變化

不用工具直接回答：
1. 純打招呼、閒聊（「你好」「謝謝」）
2. 極簡單的翻譯（「怎麼說我很好」）
3. 使用者已在問題中提供完整資訊 · 不需查

## 回答格式

拿到工具結果後 · 用「西班牙文 + 中文括號」雙語格式整理最終回覆：

Quiero aprender español.
（我想學西班牙文。）

逐詞說明：
- Quiero = 我想（querer 第一人稱單數現在式）
- aprender = 學習
- español = 西班牙文

## 重要規則

- **不要在最終回覆中提到「我查了字典/規則庫」這種內部細節** · 直接呈現答案
- 若工具查不到（found: false）· 直接跟使用者說「這個字/主題我目前資料庫沒有 · 可以問其他常用字」· 不要瞎編
- 保持簡潔 · 核心回答 3-5 句 · 加逐詞說明或例句
- 純西班牙文 + 中文 · 不要英文`;

export const MAX_ITERATIONS = 6;

/**
 * @param {object} client · Anthropic SDK client
 * @param {string} model
 * @param {string} userQuestion
 * @param {Array} conversationHistory · [{ role, content }, ...]
 */
export async function runLearningAgent({ client, model, userQuestion, conversationHistory = [] }) {
    const messages = [...conversationHistory, { role: 'user', content: userQuestion }];
    const trace = [];
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await client.messages.create({
            model,
            max_tokens: 1024,
            system: AGENT_SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
        });

        // 累計 usage
        totalUsage.input_tokens += response.usage.input_tokens;
        totalUsage.output_tokens += response.usage.output_tokens;

        const textBlocks = response.content.filter(b => b.type === 'text');
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

        // 每一步都留 trace 給前端 debug
        trace.push({
            step: i + 1,
            stopReason: response.stop_reason,
            thinking: textBlocks.map(b => b.text).join('\n'),
            toolCalls: toolUseBlocks.map(t => ({
                name: t.name,
                input: t.input,
            })),
            usage: response.usage,
        });

        // 沒 tool call = 結束
        if (toolUseBlocks.length === 0) {
            return {
                done: true,
                finalText: textBlocks.map(b => b.text).join('\n'),
                trace,
                iterations: i + 1,
                totalUsage,
                stopReason: response.stop_reason,
            };
        }

        // 把 assistant 的完整回覆（含 tool_use blocks）加入 messages
        messages.push({ role: 'assistant', content: response.content });

        // 執行所有 tool_use · 平行也可以 · 先順序
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
            let result;
            try {
                if (toolUse.name === 'dictionary_lookup') {
                    result = dictionaryLookup(toolUse.input);
                } else if (toolUse.name === 'grammar_rule_lookup') {
                    result = grammarRuleLookup(toolUse.input);
                } else {
                    result = JSON.stringify({ error: `未知工具 ${toolUse.name}` });
                }
            } catch (e) {
                result = JSON.stringify({ error: e.message });
            }
            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result,
            });
        }
        // 把 tool_result 記在 trace 最後一步
        trace[trace.length - 1].toolResults = toolResults.map(tr => ({
            tool_use_id: tr.tool_use_id,
            content: safeParse(tr.content),
        }));

        // 把工具結果餵回 Claude · 繼續下一輪
        messages.push({ role: 'user', content: toolResults });
    }

    // 超過 max iterations
    return {
        done: false,
        error: `超過最大迭代次數（${MAX_ITERATIONS}）· agent 可能陷入無限循環`,
        finalText: '（agent 無法完成 · 請重問或簡化問題）',
        trace,
        iterations: MAX_ITERATIONS,
        totalUsage,
    };
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return s; }
}
