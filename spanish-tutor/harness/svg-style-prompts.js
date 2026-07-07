/**
 * SVG Style Prompts · Phase 7
 * -----------------------------------
 * 四種風格化方向 · 對應到不同的 prompt 片段
 * 之後調文案不用改 code · 只改這裡
 *
 * 為什麼放 harness/：
 *   跟 output-filter / context-manager 一樣 · 都是「不管誰呼叫都要跑」的
 *   邊界配置 · 不是 agent 業務邏輯
 */

export const STYLE_PROMPTS = {
    sketch: {
        label: '線條素描',
        description: '單色鉛筆素描風格',
        prompt: '只用單色線條（黑色描邊）· 勾勒出主體輪廓 · 不要填色 · 類似鉛筆素描的極簡風格 · 用 stroke="black" fill="none" 的 <path> 或 <polyline> 元素構成',
    },
    geometric: {
        label: '幾何色塊',
        description: 'low-poly 幾何色塊構圖',
        prompt: '用簡單的幾何形狀（圓形、矩形、多邊形）組合 · 分色塊呈現主體的大致構圖 · 類似 low-poly 風格 · 不要畫出精細線條 · 用 <polygon> / <circle> / <rect> 元素分色塊填色',
    },
    minimal_icon: {
        label: '極簡圖示',
        description: '像 icon 一樣只留核心特徵',
        prompt: '極度簡化成類似 icon 的風格 · 只保留最核心的 1-2 個特徵 · 用最少的路徑元素表達 · 整張圖不超過 5-8 個 SVG 元素 · 適合當 favicon',
    },
    silhouette: {
        label: '剪影風格',
        description: '單色實心剪影',
        prompt: [
            '只用單一顏色的實心剪影表現主體輪廓 · 純填充。',
            '**極重要規則**：',
            '- 只用「1 個」 <path fill="black">（絕對不要多路徑 / 子路徑）',
            '- 路徑 d 屬性裡「只能有 1 個 M 開頭」· 絕對不要 M155,80 M200,50 這種多子路徑',
            '- 只描外輪廓 · 內部一律純黑 · 不要在剪影內加眉毛/眼窩/嘴巴等細節',
            '- 若主體有多個部分（例如頭+身體）· 用一條連續路徑一次繞完 · 不要斷開',
            '想像你在剪紙 · 剪刀不能離開紙面 · 一刀剪出整個輪廓。',
        ].join('\n'),
    },
};

/**
 * 產出給 Claude 的完整 prompt（風格片段 + 通用結尾）
 */
export function buildSvgPrompt(styleKey) {
    const style = STYLE_PROMPTS[styleKey];
    if (!style) throw new Error(`Unknown SVG style: ${styleKey}`);
    return [
        style.prompt,
        '',
        '## 輸出規則',
        '- 只回傳 SVG 程式碼 · 用 <svg>...</svg> 標籤包起來',
        '- 不要加任何說明文字、markdown code fence、開場白、結尾',
        '- SVG 尺寸建議 viewBox="0 0 400 400"',
        '- 不使用 <script> / on* event 屬性 / 外部 xlink:href（會被 Harness 拒絕）',
        '- 保持路徑精簡 · 總長度控制在 15000 字元以內',
        '- **避免重複元素**：不要輸出兩個相同位置、相同尺寸的 shape（例如兩個同 cx/cy/r 的 circle）· 每個元素都要有獨立意義',
        '- 座標保持在 viewBox 內 · 不要超出 400×400 邊界',
    ].join('\n');
}

export const AVAILABLE_STYLES = Object.keys(STYLE_PROMPTS);
