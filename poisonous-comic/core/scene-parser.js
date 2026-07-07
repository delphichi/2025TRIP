/**
 * Scene Parser · Phase 2 · Claude 唯一的工作：語意分類
 * -----------------------------------
 * 輸入：一句毒雞湯文案 + 它在整組中的角色（前段/後段）
 * 輸出：{ pose, expression, background } 三個枚舉值
 *
 * 關鍵設計：
 *   Claude **絕對不能**輸出 SVG 程式碼 · 只能從固定枚舉選
 *   這樣角色一致性 100% 有保證（因為零件是寫死的字串）
 */

import { CAPTION_LIMITS, calcCost } from '../harness/limits.js';
import { AVAILABLE_POSES } from '../config/svg-parts-poses.js';
import { AVAILABLE_EXPRESSIONS } from '../config/svg-parts-expressions.js';
import { AVAILABLE_BACKGROUNDS } from '../config/svg-parts-backgrounds.js';

const SCENE_PARSER_SYSTEM_PROMPT = `你是漫畫分鏡場景判斷助手 · 根據一句毒雞湯文案 · 判斷應該搭配的角色姿勢、表情、背景。

## 選項（只能從這些枚舉選 · 不能自創）

**姿勢**：
- robe_standing（站立·端莊）· 用於靜態、觀察、平淡陳述
- robe_walking（行走·前進）· 用於前進、歷經、經歷、路上
- robe_sitting（蹲坐·沉思）· 用於沉澱、思考、頓悟、放下
- robe_arms_up（舉手歡呼）· 用於解脫、豁達、發現、昇華

**表情**：
- neutral（平靜）· 用於陳述事實、不帶情緒的觀察
- happy（開心）· 用於昇華、豁達、找到解答、幽默感
- sad（失落）· 用於失去、無奈、痛苦、發現真相的難過
- thinking（沉思）· 用於反省、頓悟、思考、發現

**背景**：
- gradient_sky（漸層天空·開闊）· 用於視野打開、豁然開朗
- mountain_river（山河遠景·沉澱）· 用於歷經滄桑、時間感、遠望
- empty_room（極簡空間·獨白）· 用於內心對話、獨自面對、極簡
- outdoor_grass（戶外草地·悠閒）· 用於日常、平凡場景

## 輸出規則

1. **只回傳 JSON** · 格式：\`{"pose":"...","expression":"...","background":"..."}\`
2. 第一個字元必須是 \`{\` · 最後一個字元必須是 \`}\`
3. 不要任何說明、開場白、markdown
4. 值必須是上述枚舉之一 · 不能自創

## 判斷技巧

- 前段（setup）通常是「反直覺前提」· 情緒偏低 → 常用 neutral 或 sad
- 後段（punchline）通常是「昇華或反轉」· 情緒轉正 → 常用 happy 或 thinking
- 若文案帶「才知道 / 才發現 / 才懂」→ punchline 應該是頓悟感 → thinking 或 happy
- 若文案帶「痛苦 / 累 / 失去 / 錯過」→ sad
- 若文案帶時間感（年輕、變老、以前、之後）→ mountain_river 背景`;

/**
 * @param {object} opts
 * @param {object} opts.client · Anthropic SDK client
 * @param {string} opts.model
 * @param {string} opts.captionText · 這句文案本身
 * @param {'setup' | 'punchline'} opts.role · 這句在整組中的角色
 * @returns {Promise<{ pose, expression, background, usage, cost }>}
 */
export async function parseSceneFromCaption({ client, model, captionText, role }) {
    if (!captionText) throw new Error('captionText 必須是非空字串');
    if (!['setup', 'punchline'].includes(role)) throw new Error(`role 必須是 setup 或 punchline · 收到 ${role}`);

    const roleHint = role === 'setup'
        ? '這是**前段**（setup · 鋪陳）· 通常語氣較平淡或反諷 · 情緒偏低'
        : '這是**後段**（punchline · 昇華點題）· 通常語氣積極或帶頓悟感';

    const userMessage = `文案：「${captionText}」\n${roleHint}\n請判斷 pose / expression / background · 只回傳 JSON。`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
        response = await client.messages.create({
            model,
            max_tokens: 150,
            system: SCENE_PARSER_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        }, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
        throw new Error(`Scene parser 沒回傳 JSON · 原始：${rawText.slice(0, 200)}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        throw new Error(`Scene parser JSON parse 失敗：${e.message}`);
    }

    // 白名單驗證 · 若 Claude 自創值 · 用預設值救場
    if (!AVAILABLE_POSES.includes(parsed.pose)) parsed.pose = 'robe_standing';
    if (!AVAILABLE_EXPRESSIONS.includes(parsed.expression)) parsed.expression = 'neutral';
    if (!AVAILABLE_BACKGROUNDS.includes(parsed.background)) parsed.background = 'gradient_sky';

    return {
        pose: parsed.pose,
        expression: parsed.expression,
        background: parsed.background,
        usage: response.usage,
        cost: calcCost(response.usage),
    };
}
