#!/usr/bin/env node
/**
 * fetch-dictionary.mjs · Phase 5 · 從 Kaikki.org 下載 Wiktionary Spanish 資料
 * -----------------------------------
 * 用法：node scripts/fetch-dictionary.mjs [--top=5000] [--merge]
 *
 * 資料源：https://kaikki.org/dictionary/Spanish/
 *   Kaikki.org 是把 Wiktionary 的原始文本轉成結構化 JSONL 的專案
 *   免費 · 開源（CC-BY-SA）· 資料量大（Spanish 完整版 ~300MB）
 *
 * 這腳本做的事：
 *   1. 下載 kaikki.org-dictionary-Spanish-non-inflected.jsonl（~30MB · 只含原形詞）
 *   2. 逐行 stream 解析 · 過濾出常用字（有中文對照時特別保留）
 *   3. 抽取詞性、意思、例句、屈折
 *   4. 輸出成 tools/data/spanish-dictionary.json（跟 baseline 同格式）
 *
 * 選項：
 *   --top=N     只保留前 N 個字（依 Wiktionary 出現順序 · 大略等於常用度）預設 5000
 *   --merge     跟現有 baseline 合併（保留手工 notes 等）· 否則整份取代
 *   --no-cache  不用快取 · 重新下載
 *
 * 注意：
 *   1. 第一次跑會下載 ~30-50MB · 家裡 wifi 幾分鐘
 *   2. 結果會覆蓋 tools/data/spanish-dictionary.json · 建議先 --merge
 *   3. 意思欄位是英文（Wiktionary 主要語系）· 老師 agent 用時仍可讀
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'tools', 'data', 'spanish-dictionary.json');
const CACHE_PATH = path.join(__dirname, '..', 'tools', 'data', '.kaikki-spanish.jsonl');

// 用「英文 Wiktionary 對 Spanish 語言的 extract」· 不是「西文 Wiktionary 收所有語言」
// 這樣拿到的每一條 entry 都是解釋一個西班牙文字的意思 · 沒混雜英文字
const KAIKKI_URL = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish-non-inflected.jsonl';
const KAIKKI_URL_FALLBACK = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl';

// --- CLI 參數 ---
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v === undefined ? true : v];
    })
);
const TOP_N = parseInt(args.top || '5000', 10);
const MERGE = !!args.merge;
const NO_CACHE = !!args['no-cache'];

async function download(url, dest) {
    console.log(`⬇  下載中 ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下載失敗 · HTTP ${res.status}`);

    const size = res.headers.get('content-length');
    if (size) console.log(`   檔案大小 ${(parseInt(size) / 1024 / 1024).toFixed(1)} MB`);

    const chunks = [];
    let received = 0;
    const reader = res.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (size) {
            const pct = (received / parseInt(size) * 100).toFixed(1);
            process.stdout.write(`\r   進度 ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
        }
    }
    console.log('');
    // 若是 .gz · 解壓
    const buffer = Buffer.concat(chunks);
    if (url.endsWith('.gz')) {
        const zlib = await import('node:zlib');
        const decompressed = zlib.gunzipSync(buffer);
        fs.writeFileSync(dest, decompressed);
    } else {
        fs.writeFileSync(dest, buffer);
    }
    console.log(`✓  存到 ${dest}（${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB）`);
}

function mapPOS(kaikkiPos) {
    const m = {
        'verb': '動詞',
        'noun': '名詞',
        'adj': '形容詞',
        'adv': '副詞',
        'pron': '代名詞',
        'conj': '連接詞',
        'prep': '介系詞',
        'intj': '感嘆詞',
        'num': '數詞',
        'det': '限定詞',
        'article': '冠詞',
    };
    return m[kaikkiPos] || kaikkiPos;
}

function extractConjugations(entry) {
    if (!Array.isArray(entry.forms)) return null;
    const conj = {};
    for (const f of entry.forms) {
        if (!f.form || !Array.isArray(f.tags)) continue;
        const tags = f.tags.join(' ');
        if (tags.includes('indicative present')) {
            conj.presente = conj.presente ? conj.presente + ' / ' + f.form : f.form;
        } else if (tags.includes('preterite') || tags.includes('past')) {
            conj.preterito = conj.preterito ? conj.preterito + ' / ' + f.form : f.form;
        } else if (tags.includes('subjunctive present')) {
            conj.subjuntivo = conj.subjuntivo ? conj.subjuntivo + ' / ' + f.form : f.form;
        }
    }
    return Object.keys(conj).length ? conj : null;
}

function extractExamples(senses) {
    const examples = [];
    for (const s of senses || []) {
        for (const ex of s.examples || []) {
            if (ex.text) examples.push(ex.text.trim());
            if (examples.length >= 3) return examples;
        }
    }
    return examples;
}

function extractMeaning(senses) {
    const glosses = [];
    for (const s of senses || []) {
        if (Array.isArray(s.glosses)) glosses.push(...s.glosses);
    }
    return glosses.slice(0, 3).join('；');
}

async function processJsonl(inputPath, topN) {
    const rl = readline.createInterface({
        input: fs.createReadStream(inputPath),
        crlfDelay: Infinity,
    });

    const words = {};
    let processed = 0;
    let kept = 0;
    let skippedNonSpanish = 0;
    let skippedNoMeaning = 0;

    for await (const line of rl) {
        if (kept >= topN) break;
        processed++;
        if (processed % 5000 === 0) {
            process.stdout.write(`\r   處理 ${processed} 條 · 保留 ${kept} · 跳過非西 ${skippedNonSpanish}`);
        }
        try {
            const entry = JSON.parse(line);
            if (!entry.word || !entry.pos || !entry.senses?.length) continue;

            // === 防禦性語言過濾 ===
            // Kaikki 有些 dump 混雜多語 · 這裡確保只留 Spanish
            const lang = entry.lang || entry.lang_code;
            if (lang && lang !== 'Spanish' && lang !== 'es') {
                skippedNonSpanish++;
                continue;
            }
            // 進一步排除純英文字 · 例如 dog / cat / mouse（詞源可能是 English loan）
            if (/^[a-z]+$/.test(entry.word) && (entry.etymology_text || '').includes('English')) {
                skippedNonSpanish++;
                continue;
            }

            if (words[entry.word]) continue;

            const meaning = extractMeaning(entry.senses);
            if (!meaning) { skippedNoMeaning++; continue; }

            const record = {
                pos: mapPOS(entry.pos),
                meaning,
                source: 'wiktionary-via-kaikki',
            };
            const conj = extractConjugations(entry);
            if (conj) record.conjugations = conj;
            const examples = extractExamples(entry.senses);
            if (examples.length) record.examples = examples;

            words[entry.word] = record;
            kept++;
        } catch { /* skip malformed */ }
    }
    console.log(`\n✓ 處理完成：讀 ${processed} 條 · 保留 ${kept} · 跳非西 ${skippedNonSpanish} · 跳無意 ${skippedNoMeaning}`);
    return words;
}

async function main() {
    console.log('🇪🇸 Spanish Dictionary Fetcher · Phase 5');
    console.log(`   輸出 → ${OUTPUT_PATH}`);
    console.log(`   保留前 ${TOP_N} 個字 · merge=${MERGE}`);
    console.log('');

    // 下載
    if (NO_CACHE || !fs.existsSync(CACHE_PATH)) {
        try {
            await download(KAIKKI_URL, CACHE_PATH);
        } catch (e) {
            console.warn(`⚠️  ${KAIKKI_URL} 失敗（${e.message}）· 改用備援`);
            await download(KAIKKI_URL_FALLBACK, CACHE_PATH);
        }
    } else {
        console.log(`✓ 使用快取 ${CACHE_PATH}（--no-cache 強制重下）`);
    }

    // 處理
    console.log('\n📖 過濾抽取常用字...');
    const newWords = await processJsonl(CACHE_PATH, TOP_N);

    // 合併（可選）
    let finalWords = newWords;
    let mergeStats = { keptHandCurated: 0, addedFromKaikki: 0, kaikkiOverlappedByHand: 0 };
    if (MERGE && fs.existsSync(OUTPUT_PATH)) {
        console.log('\n🔀 合併 baseline（保留手工 notes）...');
        const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
        finalWords = { ...newWords };
        mergeStats.addedFromKaikki = Object.keys(newWords).length;

        for (const [k, v] of Object.entries(existing.words || {})) {
            // === 關鍵修正 ===
            // 之前判斷條件 `v.source && v.source !== 'wiktionary-via-kaikki'`
            // 若 baseline 沒 source 欄位 · v.source=undefined → false · 整個 for 跳過 · baseline 全失
            // 現在改為：只要不是 Kaikki 產出的 · 一律視為手工 · 保留
            const isKaikkiOrigin = v.source === 'wiktionary-via-kaikki';
            if (!isKaikkiOrigin) {
                const fromKaikki = newWords[k];
                if (fromKaikki) {
                    // Kaikki 有這字 · 但手工版更好 · 保留手工欄位 · 只從 Kaikki 借例句/變化
                    finalWords[k] = { ...fromKaikki, ...v };
                    mergeStats.kaikkiOverlappedByHand++;
                } else {
                    // Kaikki 沒這字（例如 gustar 因 top-N 沒選到）· 保留手工版
                    finalWords[k] = v;
                }
                mergeStats.keptHandCurated++;
            }
        }
        console.log(`   ✓ 手工保留 ${mergeStats.keptHandCurated} · Kaikki 新增 ${mergeStats.addedFromKaikki} · 重疊 ${mergeStats.kaikkiOverlappedByHand}`);
    }

    // 寫檔
    const output = {
        meta: {
            version: '2.0-kaikki',
            source: `Kaikki.org Wiktionary Spanish (top ${TOP_N})${MERGE ? ' + hand-curated baseline' : ''}`,
            wordCount: Object.keys(finalWords).length,
            generatedAt: new Date().toISOString().slice(0, 10),
            notes: 'Data from https://kaikki.org · CC-BY-SA · Wiktionary contributors',
        },
        words: finalWords,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✅ 寫入 ${OUTPUT_PATH}`);
    console.log(`   收錄 ${output.meta.wordCount} 個字 · 檔案 ${(fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n💡 重啟 server（npm start）· 前端會看到「字典來源: Kaikki...」\n');
}

main().catch(e => {
    console.error('\n❌ Fetcher 失敗：', e.message);
    console.error(e.stack);
    process.exit(1);
});
