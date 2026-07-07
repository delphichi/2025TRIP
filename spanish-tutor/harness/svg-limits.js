/**
 * SVG Limits · Phase 7 階段 1
 * -----------------------------------
 * 集中所有上限常量 · 從階段 0 實測數字調校
 *
 * 實測數據（200×200 測試圖）：
 *   sketch:       315 in + 98 out  = NT$0.077
 *   silhouette:   298 in + 115 out = NT$0.084
 *   minimal_icon: 309 in + 101 out = NT$0.078
 *   geometric:    326 in + 426 out = NT$0.236   ← 4× output
 *
 * 真實照片外推（1024×1024）：
 *   便宜三風格 ~NT$0.16
 *   geometric  ~NT$0.63
 *   最大成本估算：~NT$1.0（2048×2048 + geometric）
 */

export const SVG_LIMITS = {
    // === 輸入驗證（Phase 1）===
    MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,     // 5MB · 使用者規格
    MIN_IMAGE_SIZE_BYTES: 500,                  // 太小可能是壞檔或空圖
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

    // === API 呼叫上限 ===
    MAX_OUTPUT_TOKENS: 1500,                    // 實測 geometric 426 · 給頭空間到 1500
    TIMEOUT_MS: 30_000,                          // sync API call · 30s

    // === 成本閘門（pre-flight 估算 + 事後檢查）===
    COST_WARN_THRESHOLD_TWD: 1.5,               // 超過警告使用者
    COST_BLOCK_THRESHOLD_TWD: 5.0,              // 超過拒絕生成

    // === 輸出驗證（Phase 2）===
    MAX_SVG_LENGTH: 15000,                      // 使用者規格
    MIN_SVG_LENGTH: 50,                         // 太短可能是格式錯

    // === 定價（sonnet-4-6 · 對齊 cost-tracker）===
    USD_PER_MTOK: { input: 3, output: 15 },
    USD_TO_TWD: 32,
};

/** 給定 image bytes · 估算圖片會用多少 input tokens */
export function estimateImageTokens(imageBytes) {
    // Anthropic 對圖片的 tokenize 大概是 (w*h)/750
    // 但這裡我們不知道 w/h · 用檔案大小當代理指標
    // 實測：1.1KB PNG (200×200) = 250 tokens
    // 大概每 KB 圖片 = 60-100 tokens（取決於壓縮率）
    const kb = imageBytes / 1024;
    return Math.round(200 + kb * 80);   // 200 tok baseline + per-KB
}

/** 給定 imageBytes 和 style · pre-flight 估算成本 */
export function estimateCostTWD(imageBytes, styleKey) {
    const inTok = estimateImageTokens(imageBytes) + 100;  // + prompt
    const outTok = styleKey === 'geometric' ? 1000 : 250;  // geometric 貴 4x
    const usd = (inTok / 1e6) * SVG_LIMITS.USD_PER_MTOK.input
              + (outTok / 1e6) * SVG_LIMITS.USD_PER_MTOK.output;
    return usd * SVG_LIMITS.USD_TO_TWD;
}
