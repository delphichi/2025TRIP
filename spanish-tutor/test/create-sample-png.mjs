#!/usr/bin/env node
/**
 * create-sample-png.mjs · 產生階段 0 測試圖 · 純 Node · 無依賴
 * -----------------------------------
 * 產出 test/sample.png：藍底 + 黃色圓形 + 紅色三角形
 * 目的：階段 0 用「簡單幾何圖形」測 SVG 生成 · 不用真人照片
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, 'sample.png');

const W = 200, H = 200;
const pixels = Buffer.alloc(W * H * 3);

// 藍底
for (let i = 0; i < W * H; i++) {
    pixels[i * 3] = 30;
    pixels[i * 3 + 1] = 60;
    pixels[i * 3 + 2] = 180;
}

// 黃色圓形（左上角）
const cx = 70, cy = 70, r = 45;
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < r * r) {
            const i = (y * W + x) * 3;
            pixels[i] = 250; pixels[i + 1] = 200; pixels[i + 2] = 30;
        }
    }
}

// 紅色三角形（右下角）
function inTriangle(x, y, x1, y1, x2, y2, x3, y3) {
    const d = (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    const s = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
    const t = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
    return s >= 0 && t >= 0 && (1 - s - t) >= 0;
}
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        if (inTriangle(x, y, 140, 80, 180, 170, 100, 170)) {
            const i = (y * W + x) * 3;
            pixels[i] = 220; pixels[i + 1] = 40; pixels[i + 2] = 40;
        }
    }
}

// ==== PNG 編碼 ====
function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    let crc = 0xFFFFFFFF;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const typeBuf = Buffer.from(type);
    const buf = Buffer.concat([typeBuf, data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(buf), 0);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, buf, c]);
}
const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const rawLines = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
    rawLines[y * (W * 3 + 1)] = 0;
    pixels.copy(rawLines, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const idat = zlib.deflateSync(rawLines);
const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUTPUT, png);
console.log(`✅ 產生 ${OUTPUT}（${png.length} bytes · ${W}×${H} PNG）`);
console.log('   內容：藍底 + 黃圓 + 紅三角 · 給階段 0 測 SVG 生成用');
