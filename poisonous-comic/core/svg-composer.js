/**
 * SVG Composer · Phase 2 · 純程式組裝 · 零 AI 呼叫
 * -----------------------------------
 * 這是專案的核心哲學：
 *   角色一致性 = 字串拼接的必然結果 · 不是 AI「記得」的結果
 *
 * 入 { pose, expression, background }
 * 出 { svg: string } · 完整可渲染 SVG
 */

import { HEAD, BLUSH, EYEBROWS, NOSE } from '../config/svg-parts-fixed.js';
import { POSES, AVAILABLE_POSES } from '../config/svg-parts-poses.js';
import { EXPRESSIONS, AVAILABLE_EXPRESSIONS } from '../config/svg-parts-expressions.js';
import { BACKGROUNDS, AVAILABLE_BACKGROUNDS } from '../config/svg-parts-backgrounds.js';

/**
 * @param {{ pose, expression, background }} params
 * @returns {{ svg: string, meta: { pose, expression, background, elementCount } }}
 */
export function composeCharacterSvg({ pose, expression, background }) {
    // === Harness · 參數白名單 ===
    if (!AVAILABLE_POSES.includes(pose)) {
        throw new Error(`無效姿勢 ${pose} · 允許：${AVAILABLE_POSES.join(', ')}`);
    }
    if (!AVAILABLE_EXPRESSIONS.includes(expression)) {
        throw new Error(`無效表情 ${expression} · 允許：${AVAILABLE_EXPRESSIONS.join(', ')}`);
    }
    if (!AVAILABLE_BACKGROUNDS.includes(background)) {
        throw new Error(`無效背景 ${background} · 允許：${AVAILABLE_BACKGROUNDS.join(', ')}`);
    }

    const poseSvg = POSES[pose].svg;
    const exprSvg = EXPRESSIONS[expression].svg;
    const bgSvg = BACKGROUNDS[background].svg;

    // === Z-order · 從底往上疊 ===
    const svg = `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" width="400" height="500">
    <!-- 背景 -->
    ${bgSvg}
    <!-- 袍子/身體/腳 -->
    ${poseSvg}
    <!-- 頭 · 蓋在袍子領口之上 -->
    ${HEAD}
    <!-- 表情 · 眼睛/眉毛/鼻子/嘴巴 -->
    ${EYEBROWS}
    ${NOSE}
    ${exprSvg}
    <!-- 腮紅 · 疊在表情上 -->
    ${BLUSH}
</svg>`;

    return {
        svg,
        meta: {
            pose,
            expression,
            background,
            poseLabel: POSES[pose].label,
            expressionLabel: EXPRESSIONS[expression].label,
            backgroundLabel: BACKGROUNDS[background].label,
            svgLength: svg.length,
        },
    };
}

/** 給前端用 · 列出所有可選項 */
export function listAllOptions() {
    return {
        poses: AVAILABLE_POSES.map(k => ({ key: k, label: POSES[k].label })),
        expressions: AVAILABLE_EXPRESSIONS.map(k => ({ key: k, label: EXPRESSIONS[k].label })),
        backgrounds: AVAILABLE_BACKGROUNDS.map(k => ({ key: k, label: BACKGROUNDS[k].label })),
    };
}
