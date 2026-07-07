/**
 * SVG Parts · 表情（4 種）
 * -----------------------------------
 * 眼睛 + 嘴巴的組合 · 圍繞頭部中心 (200, 140)
 * 每個表情是「眼睛 + 嘴巴」的合成
 */

// 平靜 · 兩顆黑點眼 + 平嘴
export const EXPRESSION_NEUTRAL = `
    <!-- 眼睛 · 兩顆小黑點 -->
    <circle cx="180" cy="140" r="3" fill="#2a2a2a"/>
    <circle cx="220" cy="140" r="3" fill="#2a2a2a"/>
    <!-- 平嘴 · 短橫線 -->
    <line x1="192" y1="170" x2="208" y2="170" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
`.trim();

// 開心 · 眼睛彎彎 + 上翹嘴
export const EXPRESSION_HAPPY = `
    <!-- 彎彎眼 · 一對向上弧 -->
    <path d="M174,142 Q180,135 186,142" fill="none" stroke="#2a2a2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M214,142 Q220,135 226,142" fill="none" stroke="#2a2a2a" stroke-width="2.5" stroke-linecap="round"/>
    <!-- 微笑 · 向上曲線 -->
    <path d="M188,168 Q200,180 212,168" fill="none" stroke="#2a2a2a" stroke-width="2.5" stroke-linecap="round"/>
`.trim();

// 失落 · 下垂眼 + 下彎嘴
export const EXPRESSION_SAD = `
    <!-- 下垂眼 · 兩顆點稍偏下 -->
    <circle cx="180" cy="143" r="3" fill="#2a2a2a"/>
    <circle cx="220" cy="143" r="3" fill="#2a2a2a"/>
    <!-- 眉毛下壓 -->
    <path d="M170,130 L188,135" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
    <path d="M230,130 L212,135" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
    <!-- 下彎嘴 · 向下曲線 -->
    <path d="M188,175 Q200,165 212,175" fill="none" stroke="#2a2a2a" stroke-width="2.5" stroke-linecap="round"/>
`.trim();

// 沉思 · 眼睛望上 + 微微張嘴
export const EXPRESSION_THINKING = `
    <!-- 眼睛望上 · 弧線在上方 -->
    <path d="M175,138 Q180,133 186,138 L184,142 L178,142 Z" fill="#2a2a2a"/>
    <path d="M215,138 Q220,133 226,138 L224,142 L218,142 Z" fill="#2a2a2a"/>
    <!-- 微張嘴 · 小 o -->
    <ellipse cx="200" cy="172" rx="3" ry="4" fill="#2a2a2a"/>
`.trim();

export const EXPRESSIONS = {
    neutral: {
        label: '平靜',
        svg: EXPRESSION_NEUTRAL,
    },
    happy: {
        label: '開心',
        svg: EXPRESSION_HAPPY,
    },
    sad: {
        label: '失落',
        svg: EXPRESSION_SAD,
    },
    thinking: {
        label: '沉思',
        svg: EXPRESSION_THINKING,
    },
};

export const AVAILABLE_EXPRESSIONS = Object.keys(EXPRESSIONS);
