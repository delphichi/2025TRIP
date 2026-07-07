/**
 * SVG Safety Check · Phase 7 階段 2
 * -----------------------------------
 * Claude 自由生成的 SVG · 就算 prompt 說「別用 script」·
 * 也不能相信 · 這裡強制清洗。
 *
 * 移除的攻擊面：
 *   1. <script> 標籤（可執行 JS）
 *   2. on* 事件屬性（onclick / onload / onmouseover ... 都可跑 JS）
 *   3. 外部 xlink:href · href 到 https:// 的參照（SSRF / 追蹤風險）
 *   4. javascript: URL scheme
 *   5. data: URL 內嵌 script（少見但仍要防）
 *
 * 也檢查：
 *   - SVG 是否過大（可能是異常）
 *   - 是否有 </svg> 收尾
 */

import { SVG_LIMITS } from './svg-limits.js';

export class SvgSafetyError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

/**
 * @param {string} svgCode
 * @returns {{ cleaned: string, warnings: string[] }} · throws SvgSafetyError on fatal
 */
export function sanitizeSvgOutput(svgCode) {
    if (typeof svgCode !== 'string') {
        throw new SvgSafetyError('SVG 不是字串', 'NOT_STRING');
    }
    let cleaned = svgCode;
    const warnings = [];

    // === 1. 基本結構檢查 ===
    if (cleaned.length < SVG_LIMITS.MIN_SVG_LENGTH) {
        throw new SvgSafetyError(`SVG 過短（${cleaned.length} 字元）· Claude 可能沒回完整內容`, 'TOO_SHORT');
    }
    if (cleaned.length > SVG_LIMITS.MAX_SVG_LENGTH) {
        throw new SvgSafetyError(`SVG 過大（${cleaned.length} > ${SVG_LIMITS.MAX_SVG_LENGTH}）· 可能異常`, 'TOO_LARGE');
    }
    if (!/<svg[\s>]/i.test(cleaned)) {
        throw new SvgSafetyError('沒偵測到 <svg> 開頭', 'NO_SVG_OPEN');
    }
    if (!/<\/svg>/i.test(cleaned)) {
        throw new SvgSafetyError('沒偵測到 </svg> 結尾 · 可能被截斷', 'NO_SVG_CLOSE');
    }

    // === 2. 拒絕 <script> ===
    // 用正則吃掉 · 但同時記警告 · 因為出現就是 Claude 違規
    if (/<script[\s>]/i.test(cleaned)) {
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
        cleaned = cleaned.replace(/<script[\s>][^>]*\/?>/gi, '');
        warnings.push('偵測到 <script> 標籤 · 已移除');
    }

    // === 3. 拒絕 on* 事件屬性 ===
    const onEventCount = (cleaned.match(/\son\w+\s*=\s*["'][^"']*["']/gi) || []).length;
    if (onEventCount > 0) {
        cleaned = cleaned.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        warnings.push(`偵測到 ${onEventCount} 個 on* 事件屬性 · 已移除`);
    }

    // === 4. 拒絕外部 xlink:href / href ===
    const externalHrefCount =
        (cleaned.match(/(?:xlink:)?href\s*=\s*["']https?:\/\/[^"']*["']/gi) || []).length;
    if (externalHrefCount > 0) {
        cleaned = cleaned.replace(/(?:xlink:)?href\s*=\s*["']https?:\/\/[^"']*["']/gi, '');
        warnings.push(`偵測到 ${externalHrefCount} 個外部 URL 引用 · 已移除`);
    }

    // === 5. 拒絕 javascript: URL ===
    if (/javascript\s*:/i.test(cleaned)) {
        cleaned = cleaned.replace(/(?:xlink:)?href\s*=\s*["']javascript:[^"']*["']/gi, '');
        cleaned = cleaned.replace(/["']javascript:[^"']*["']/gi, '""');
        warnings.push('偵測到 javascript: URL · 已移除');
    }

    // === 6. 拒絕 data:text/html URL（少見但可跑 JS）===
    if (/data\s*:\s*text\/html/i.test(cleaned)) {
        cleaned = cleaned.replace(/["']data\s*:\s*text\/html[^"']*["']/gi, '""');
        warnings.push('偵測到 data:text/html URL · 已移除');
    }

    // === 7. 最終再檢查一次 ===
    if (/<script[\s>]/i.test(cleaned) || /\son\w+\s*=/i.test(cleaned)) {
        throw new SvgSafetyError('清洗後仍檢測到危險內容 · 拒絕輸出', 'SANITIZE_FAILED');
    }

    return { cleaned, warnings };
}

/** 檢查是否有被截斷（沒 </svg> 收尾）· 用於 pre-safety 檢查 */
export function isSvgTruncated(svgCode) {
    if (!svgCode) return true;
    return !/<\/svg>/i.test(svgCode);
}

/**
 * 風格特定的品質檢查（不阻擋 · 只回警告）
 * silhouette 應該是「1 個 path · 只 1 個 M」· 若不是可能翻車
 */
export function checkStyleQuality(svg, styleKey) {
    const warnings = [];
    if (styleKey === 'silhouette') {
        const pathCount = (svg.match(/<path\b/gi) || []).length;
        if (pathCount > 2) {
            warnings.push(`silhouette 有 ${pathCount} 個 path · 建議只 1 個 · 可能出現多剪影或雜訊`);
        }
        const mCount = (svg.match(/[\sd="']\s*[Mm][\s\d]/g) || []).length;
        if (mCount > 3) {
            warnings.push(`silhouette 的 path 含 ${mCount} 個 M 子路徑 · 可能導致剪影破碎`);
        }
    }
    if (styleKey === 'geometric') {
        const polyCount = (svg.match(/<polygon\b/gi) || []).length;
        if (polyCount > 50) {
            warnings.push(`geometric 有 ${polyCount} 個 polygon · 可能過度切碎`);
        }
    }
    if (styleKey === 'minimal_icon') {
        const elemCount = (svg.match(/<(circle|rect|polygon|path|ellipse|line|polyline)\b/gi) || []).length;
        if (elemCount > 12) {
            warnings.push(`minimal_icon 有 ${elemCount} 個元素 · 超過建議上限 8 · 可能不夠「極簡」`);
        }
    }
    return warnings;
}

/** 從 Claude 原始 text response 抽出 SVG · 若含 code fence 也處理 */
export function extractSvgFromResponse(text) {
    if (!text) return null;
    // 先剝掉可能的 markdown code fence
    let cleaned = text.replace(/```(?:svg|xml|html)?\n?/gi, '').replace(/```/g, '');
    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    return match ? match[0] : null;
}
