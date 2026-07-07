/**
 * Context Manager · Phase 4 · 對話記憶 + 自動摘要
 * -----------------------------------
 * 職責：
 *   1. 維護 session store（in-memory · Map）
 *   2. 提供對話歷史給 agent（帶摘要）
 *   3. 檢測 context 過大 · 自動摘要老訊息
 *
 * 為什麼放 harness/？
 *   跟 output-filter 同理 · 這是「不管 agent 想幹嘛都要跑的邊界檢查」·
 *   屬於防護網 · 不是業務邏輯。
 *
 * 為什麼在 in-memory 而不是資料庫？
 *   Phase 4 · MVP 階段 · 重啟就掉沒關係。Phase 5+ 才考慮持久化。
 *   TTL 1 小時 · 過期自動清 · 超過 100 個 session 用 LRU 清最舊的。
 */

export const CONTEXT_LIMITS = {
    SOFT_LIMIT_TOKENS: 15_000,     // 觸發摘要
    HARD_LIMIT_TOKENS: 25_000,     // 打死不超過
    KEEP_RECENT_MESSAGES: 6,       // 摘要時保留最近幾條原文
    SUMMARY_MAX_TOKENS: 500,       // 摘要輸出上限
    MAX_SESSIONS: 100,             // LRU cap
    SESSION_TTL_MS: 60 * 60_000,    // 1 hour idle
};

const sessions = new Map();

function newSessionId() {
    return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function cleanExpired() {
    const now = Date.now();
    for (const [id, s] of sessions) {
        if (now - s.lastAt > CONTEXT_LIMITS.SESSION_TTL_MS) sessions.delete(id);
    }
    if (sessions.size > CONTEXT_LIMITS.MAX_SESSIONS) {
        const sorted = [...sessions.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt);
        const toRemove = sorted.slice(0, sessions.size - CONTEXT_LIMITS.MAX_SESSIONS);
        for (const [id] of toRemove) sessions.delete(id);
    }
}

/**
 * @param {string?} sessionId · null / undefined → 新建
 * @returns {object} session
 */
export function getOrCreateSession(sessionId) {
    cleanExpired();
    if (sessionId && sessions.has(sessionId)) {
        const s = sessions.get(sessionId);
        s.lastAt = Date.now();
        return s;
    }
    const id = sessionId || newSessionId();
    const s = {
        id,
        createdAt: Date.now(),
        lastAt: Date.now(),
        // 只存 clean 版本：{ role: 'user'|'assistant', content: string, ts, mode? }
        messages: [],
        summary: null,
        summarizedCount: 0,           // 已被摘要吃掉的老訊息數
        totalUsage: { input_tokens: 0, output_tokens: 0 },
        totalCostTWD: 0,
    };
    sessions.set(id, s);
    return s;
}

export function deleteSession(sessionId) {
    return sessions.delete(sessionId);
}

export function sessionSnapshot(session) {
    return {
        id: session.id,
        createdAt: session.createdAt,
        lastAt: session.lastAt,
        messageCount: session.messages.length,
        summarizedCount: session.summarizedCount,
        hasSummary: !!session.summary,
        summary: session.summary,
        estimatedTokens: estimateTokens(session.messages) + (session.summary ? estimateTokens([session.summary]) : 0),
        totalUsage: session.totalUsage,
        totalCostTWD: session.totalCostTWD,
    };
}

/** 粗估：1 token ≈ 3 字元（中英夾雜） */
export function estimateTokens(messagesOrText) {
    if (typeof messagesOrText === 'string') return Math.ceil(messagesOrText.length / 3);
    return Math.ceil(JSON.stringify(messagesOrText).length / 3);
}

export function shouldSummarize(session) {
    if (session.messages.length <= CONTEXT_LIMITS.KEEP_RECENT_MESSAGES) return false;
    const est = estimateTokens(session.messages);
    return est > CONTEXT_LIMITS.SOFT_LIMIT_TOKENS;
}

/**
 * 摘要老訊息 · 呼叫 Claude 生摘要 · 更新 session
 * @returns {{ summarized: boolean, summarizedCount?: number, usage?: object }}
 */
export async function summarizeIfNeeded(client, model, session) {
    if (!shouldSummarize(session)) return { summarized: false };

    const keepRecent = session.messages.slice(-CONTEXT_LIMITS.KEEP_RECENT_MESSAGES);
    const toSummarize = session.messages.slice(0, -CONTEXT_LIMITS.KEEP_RECENT_MESSAGES);

    const oldSummaryBlock = session.summary
        ? `## 前次已有摘要\n${session.summary}\n\n## 新增對話（需併入）\n`
        : '## 待摘要對話\n';
    const convText = toSummarize.map(m =>
        `${m.role === 'user' ? '👤 學生' : '🇪🇸 老師'}: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`
    ).join('\n\n');

    const resp = await client.messages.create({
        model,
        max_tokens: CONTEXT_LIMITS.SUMMARY_MAX_TOKENS,
        system: `你是西班牙文學習助手的對話摘要器 · 用中文簡潔摘要（不超過 300 字）· 保留：
1. 使用者學過的主題（文法/單字 · 具體字彙）
2. 使用者的偏好或程度線索
3. 老師講過的重要規則、常見錯誤

不要開場白 · 不要結尾 · 只輸出摘要本文。用條列格式方便未來對話 agent 快速讀取。`,
        messages: [{ role: 'user', content: oldSummaryBlock + convText }],
    });

    const summaryText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    session.summary = summaryText;
    session.messages = keepRecent;
    session.summarizedCount += toSummarize.length;
    session.totalUsage.input_tokens += resp.usage.input_tokens;
    session.totalUsage.output_tokens += resp.usage.output_tokens;

    return {
        summarized: true,
        summarizedCount: toSummarize.length,
        usage: resp.usage,
        summaryPreview: summaryText.slice(0, 150) + (summaryText.length > 150 ? '…' : ''),
    };
}

/**
 * 給 agent 用的對話歷史 · 若有摘要 · 前置一組「前情提要」偽對話
 * 這樣不用改 agent 的 system prompt · 用純 messages 就能注入 context
 */
export function buildHistoryForAgent(session) {
    const history = [];
    if (session.summary) {
        history.push(
            {
                role: 'user',
                content: `【前情提要 · 系統注入】以下是我們之前對話的摘要 · 請以此為背景繼續回答我接下來的問題：\n\n${session.summary}`,
            },
            {
                role: 'assistant',
                content: '好的 · 我已了解你之前的學習內容 · 請繼續提問。',
            },
        );
    }
    for (const m of session.messages) {
        // 只送 clean 版本 · 不含 tool_use blocks（Phase 4 不需要跨 turn 保留工具狀態）
        history.push({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content });
    }
    return history;
}

/**
 * 存這輪 Q&A 到 session
 */
export function appendExchange(session, userText, assistantText, mode, usage, costTWD) {
    const ts = Date.now();
    session.lastAt = ts;
    session.messages.push({ role: 'user', content: userText, ts, mode });
    session.messages.push({ role: 'assistant', content: assistantText, ts, mode });
    if (usage) {
        session.totalUsage.input_tokens += (usage.input_tokens || 0);
        session.totalUsage.output_tokens += (usage.output_tokens || 0);
    }
    if (costTWD) session.totalCostTWD += costTWD;
}
