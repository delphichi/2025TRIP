/**
 * Output Filter · 資料來源標記層
 * -----------------------------------
 * 為什麼要這個檔：
 *   Claude 在 dictionary_lookup 回 found:false 時 · 常會用背景知識補上答案。
 *   內容可能對、可能錯 · 但介面呈現得跟「查證過」一樣有自信 · 使用者無法分辨。
 *
 * 這層做的事：
 *   1. 掃描整輪對話 · 找出所有 found:false 的查詢
 *   2. 在最終回覆末尾加「未驗證來源」提醒 · 明示哪幾個字沒過字典
 *
 * 為什麼放 harness/ 而不是 agent/：
 *   這是「不管 agent 想幹嘛都要執行」的邊界檢查 · 屬於防護網 · 不是業務邏輯。
 */

/**
 * @param {Array} trace · 從 planner-agent 出來的完整 trace
 * @returns {{ unverifiedWords: string[], unverifiedTopics: string[] }}
 */
export function collectUnverifiedLookups(trace) {
    const unverifiedWords = [];
    const unverifiedTopics = [];

    for (const step of trace || []) {
        const calls = step.toolCalls || [];
        const results = step.toolResults || [];
        for (let i = 0; i < calls.length; i++) {
            const call = calls[i];
            const result = results[i];
            const content = result?.content;
            if (!content || content.found !== false) continue;

            if (call.name === 'dictionary_lookup' && call.input?.word) {
                unverifiedWords.push(String(call.input.word));
            } else if (call.name === 'grammar_rule_lookup' && call.input?.grammar_topic) {
                unverifiedTopics.push(String(call.input.grammar_topic));
            }
        }
    }

    return {
        unverifiedWords: [...new Set(unverifiedWords)],
        unverifiedTopics: [...new Set(unverifiedTopics)],
    };
}

/**
 * @param {string} finalText
 * @param {Array} trace
 * @returns {{ text: string, unverifiedWords: string[], unverifiedTopics: string[], hasUnverified: boolean }}
 */
export function annotateSourceReliability(finalText, trace) {
    const { unverifiedWords, unverifiedTopics } = collectUnverifiedLookups(trace);
    const hasUnverified = unverifiedWords.length > 0 || unverifiedTopics.length > 0;

    if (!hasUnverified) {
        return { text: finalText, unverifiedWords, unverifiedTopics, hasUnverified: false };
    }

    const parts = [];
    if (unverifiedWords.length) {
        parts.push(`單字「${unverifiedWords.join('、')}」`);
    }
    if (unverifiedTopics.length) {
        parts.push(`文法主題「${unverifiedTopics.join('、')}」`);
    }

    const warning = `\n\n---\n⚠️ **未驗證來源提醒**：本次回答中的 ${parts.join(' 及 ')} 不在已驗證資料庫裡 · 相關說明為 AI 依語言知識補充 · 使用前建議再查證（尤其動詞變化、拼寫）。`;

    return {
        text: finalText + warning,
        unverifiedWords,
        unverifiedTopics,
        hasUnverified: true,
    };
}
