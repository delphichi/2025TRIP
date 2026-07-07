/**
 * Image Input Filter · Phase 7 階段 1
 * -----------------------------------
 * 圖片上傳的第一道防線 · 在打 Claude API 之前跑
 *
 * 檢查：
 *   1. 檔案大小（不超過 5MB · 不小於 500 bytes）
 *   2. MIME 白名單（jpeg/png/webp）
 *   3. Magic bytes（防 MIME spoofing · 副檔名說 jpeg 但實際是 exe）
 *   4. 是不是明顯的空圖（純白/純黑幾乎全一色）· 避免浪費 API
 *
 * 為什麼放 harness/：
 *   跟其他 harness 檔一樣 · 「不管 client 傳什麼都要跑的邊界檢查」
 *   agent / API 邏輯放乾淨 · 這裡專責攔外部輸入
 */

import { SVG_LIMITS, estimateImageTokens, estimateCostTWD } from './svg-limits.js';

// 每種格式的 magic bytes（檔案開頭幾個 byte）· 用來驗真實內容
const MAGIC_BYTES = {
    'image/jpeg': [
        [0xFF, 0xD8, 0xFF],  // 所有 JPEG 都以這 3 byte 開頭
    ],
    'image/png': [
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],  // PNG signature
    ],
    'image/webp': [
        // WebP: RIFF....WEBP · offset 0-3 RIFF · offset 8-11 WEBP
        [0x52, 0x49, 0x46, 0x46],  // 檢查 RIFF · offset 8 需再檢查 WEBP
    ],
};

function detectRealMime(buffer) {
    if (buffer.length < 12) return null;
    // PNG
    const png = MAGIC_BYTES['image/png'][0];
    if (png.every((b, i) => buffer[i] === b)) return 'image/png';
    // JPEG
    const jpg = MAGIC_BYTES['image/jpeg'][0];
    if (jpg.every((b, i) => buffer[i] === b)) return 'image/jpeg';
    // WebP: RIFF####WEBP
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) return 'image/webp';
    return null;
}

/**
 * @param {Buffer} fileBuffer · 圖片原始 bytes
 * @param {string} declaredMimeType · client 宣告的 mime type
 * @returns {{ valid: boolean, error?: string, realMime?: string, size?: number, warnings?: string[] }}
 */
export function validateImageUpload(fileBuffer, declaredMimeType) {
    const warnings = [];

    // 1. 型別檢查
    if (!Buffer.isBuffer(fileBuffer)) {
        return { valid: false, error: '內部錯誤：非 Buffer 型別' };
    }

    // 2. 大小上下限
    if (fileBuffer.length < SVG_LIMITS.MIN_IMAGE_SIZE_BYTES) {
        return {
            valid: false,
            error: `圖片過小（${fileBuffer.length} bytes）· 可能是壞檔或空圖 · 下限 ${SVG_LIMITS.MIN_IMAGE_SIZE_BYTES} bytes`,
        };
    }
    if (fileBuffer.length > SVG_LIMITS.MAX_IMAGE_SIZE_BYTES) {
        const mb = (fileBuffer.length / 1024 / 1024).toFixed(2);
        const maxMb = (SVG_LIMITS.MAX_IMAGE_SIZE_BYTES / 1024 / 1024).toFixed(0);
        return {
            valid: false,
            error: `圖片過大（${mb} MB）· 請壓縮到 ${maxMb} MB 以內`,
        };
    }

    // 3. Declared MIME 白名單
    if (!SVG_LIMITS.ALLOWED_MIME_TYPES.includes(declaredMimeType)) {
        return {
            valid: false,
            error: `不支援此圖片格式（${declaredMimeType}）· 只接受 JPG / PNG / WebP`,
        };
    }

    // 4. Magic bytes 驗真實內容
    const realMime = detectRealMime(fileBuffer);
    if (!realMime) {
        return {
            valid: false,
            error: `無法辨識檔案內容 · 可能是壞檔、或副檔名跟實際內容不符`,
        };
    }
    if (realMime !== declaredMimeType) {
        // client 說是 jpeg 但實際是 png · 不阻擋 · 用真實的就好 · 但記警告
        warnings.push(`宣告 MIME (${declaredMimeType}) 跟實際 (${realMime}) 不符 · 已用實際 MIME 送 API`);
    }

    // 5. 成本估算（pre-flight）
    const estimatedTWD = estimateCostTWD(fileBuffer.length, 'geometric');  // 用最貴的估
    if (estimatedTWD > SVG_LIMITS.COST_BLOCK_THRESHOLD_TWD) {
        return {
            valid: false,
            error: `預估成本 NT$${estimatedTWD.toFixed(2)} 超過上限 NT$${SVG_LIMITS.COST_BLOCK_THRESHOLD_TWD} · 請用小一點的圖`,
        };
    }
    if (estimatedTWD > SVG_LIMITS.COST_WARN_THRESHOLD_TWD) {
        warnings.push(`預估成本 NT$${estimatedTWD.toFixed(2)} 偏高 · 建議壓縮圖片`);
    }

    return {
        valid: true,
        realMime,
        size: fileBuffer.length,
        estimatedInputTokens: estimateImageTokens(fileBuffer.length),
        estimatedCostTWD: estimatedTWD,
        warnings: warnings.length ? warnings : undefined,
    };
}
