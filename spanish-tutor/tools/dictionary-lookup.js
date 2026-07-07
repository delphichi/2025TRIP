/**
 * Dictionary Lookup · Phase 5 · 從 JSON 資料檔載入
 * -----------------------------------
 * 資料源：tools/data/spanish-dictionary.json
 * baseline: 51 個常用字（手工整理）
 * 擴充：執行 `node scripts/fetch-dictionary.mjs` 從 Kaikki.org（Wiktionary 結構化資料）
 *       過濾出 5000+ 個常用字 · 覆蓋寫入 spanish-dictionary.json
 *
 * 為什麼從 JSON 載：
 *   1. 手工資料變動不用改 code
 *   2. fetch 腳本可產出更大 dict · 直接接手
 *   3. 前端/agent 完全零改動 · 只換底層資料
 *
 * 匹配邏輯：
 *   1. 完全比對（小寫 · trim）
 *   2. 重音無關比對（「ojala」找到「ojalá」）· NFD 正規化
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_PATH = path.join(__dirname, 'data', 'spanish-dictionary.json');

let DICT = { meta: { source: 'not-loaded', wordCount: 0 }, words: {} };
let NORMALIZED_INDEX = new Map();

function normalize(s) {
    return String(s || '').toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');   // 去掉重音組合字
}

function loadDict() {
    try {
        const raw = fs.readFileSync(DICT_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        DICT = parsed;
        NORMALIZED_INDEX = new Map();
        for (const key of Object.keys(parsed.words || {})) {
            NORMALIZED_INDEX.set(normalize(key), key);
        }
        const count = Object.keys(parsed.words || {}).length;
        console.log(`📚 字典載入成功: ${count} 個字 · 來源: ${parsed.meta?.source || 'unknown'}`);
    } catch (e) {
        console.warn(`⚠️  字典 JSON 沒載入 (${e.message}) · 使用空字典 · 執行 npm run fetch-dict 修復`);
    }
}

loadDict();

/** 給外部（例如 hot reload）用 */
export function reloadDict() { loadDict(); }

/** 給 /health 顯示字典狀態 */
export function getDictMeta() {
    return {
        source: DICT.meta?.source,
        wordCount: Object.keys(DICT.words || {}).length,
        version: DICT.meta?.version,
        generatedAt: DICT.meta?.generatedAt,
    };
}

/**
 * @param {{ word: string, context?: string }} input
 * @returns {string} JSON string 給 Claude 消化
 */
export function dictionaryLookup(input) {
    const wordRaw = String(input.word || '').toLowerCase().trim();
    if (!wordRaw) {
        return JSON.stringify({ found: false, word: '', message: '空查詢字串' });
    }

    // 1. 直接找
    let key = wordRaw;
    let entry = DICT.words?.[key];

    // 2. 重音無關 fallback
    if (!entry) {
        const canonicalKey = NORMALIZED_INDEX.get(normalize(wordRaw));
        if (canonicalKey) {
            key = canonicalKey;
            entry = DICT.words[canonicalKey];
        }
    }

    if (!entry) {
        const availableWords = Object.keys(DICT.words || {});
        return JSON.stringify({
            found: false,
            word: wordRaw,
            message: `「${wordRaw}」不在字典裡（目前收錄 ${availableWords.length} 個字 · 來源: ${DICT.meta?.source || 'unknown'}）· 執行 npm run fetch-dict 可擴充到 5000+`,
            available_words_sample: availableWords.slice(0, 30),
            total_available: availableWords.length,
        });
    }

    return JSON.stringify({
        found: true,
        word: key,
        source: DICT.meta?.source,
        ...entry,
    });
}
