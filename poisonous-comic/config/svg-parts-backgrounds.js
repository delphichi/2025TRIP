/**
 * SVG Parts · 背景（4 種）
 * -----------------------------------
 * 每個背景畫在 z-order 最底 · 角色疊在上面
 * viewBox 0 0 400 500
 */

// 漸層天空 · 極簡 · 用於「開闊 / 昇華」情境
export const BG_GRADIENT_SKY = `
    <defs>
        <linearGradient id="sky-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d6e8f0"/>
            <stop offset="100%" stop-color="#f0e8d0"/>
        </linearGradient>
    </defs>
    <rect x="0" y="0" width="400" height="500" fill="url(#sky-gradient)"/>
    <!-- 遠處雲 -->
    <ellipse cx="80" cy="80" rx="35" ry="12" fill="#fff" opacity="0.7"/>
    <ellipse cx="320" cy="120" rx="45" ry="15" fill="#fff" opacity="0.7"/>
`.trim();

// 山河遠景 · 用於「歷經 / 沉澱」情境
export const BG_MOUNTAIN_RIVER = `
    <!-- 天空 -->
    <rect x="0" y="0" width="400" height="290" fill="#d6e8f0"/>
    <!-- 遠山 · 兩層 -->
    <polygon points="0,250 60,190 130,230 220,180 300,220 400,200 400,290 0,290" fill="#a8bfcc"/>
    <polygon points="0,270 80,220 170,255 260,215 340,245 400,235 400,290 0,290" fill="#8ea8b6"/>
    <!-- 河流 · 蜿蜒 -->
    <path d="M50,290 Q120,275 200,285 Q280,295 350,282 L360,310 Q290,320 200,315 Q110,310 40,320 Z"
          fill="#b0cddb"/>
    <path d="M100,300 Q170,290 250,297 L245,305 Q170,310 105,308 Z" fill="#c0d8e4"/>
    <!-- 地面 -->
    <rect x="0" y="310" width="400" height="190" fill="#c9be8a"/>
    <!-- 前景草地 -->
    <ellipse cx="200" cy="500" rx="250" ry="80" fill="#8aab7a" opacity="0.6"/>
`.trim();

// 極簡空間 · 淡灰底 · 用於「內心獨白」情境
export const BG_EMPTY_ROOM = `
    <rect x="0" y="0" width="400" height="500" fill="#f5f2ec"/>
    <!-- 地平線陰影 -->
    <rect x="0" y="450" width="400" height="50" fill="#e8e4d8"/>
    <!-- 極淡的線條營造空間感 -->
    <line x1="0" y1="450" x2="400" y2="450" stroke="#d0ccc0" stroke-width="1"/>
`.trim();

// 戶外草地 · 用於「日常 / 悠閒」情境
export const BG_OUTDOOR_GRASS = `
    <!-- 天空 -->
    <rect x="0" y="0" width="400" height="300" fill="#c8e0f0"/>
    <!-- 遠山 -->
    <polygon points="0,290 100,240 220,275 320,235 400,270 400,300 0,300" fill="#a8c8b8"/>
    <!-- 草地 -->
    <rect x="0" y="300" width="400" height="200" fill="#a5c890"/>
    <!-- 前景草 · 幾株 -->
    <path d="M50,420 L45,400 L55,405 L52,395 L60,410 Z" fill="#8ab070"/>
    <path d="M340,430 L335,410 L345,415 L342,405 L350,420 Z" fill="#8ab070"/>
    <!-- 前景小石頭 -->
    <ellipse cx="80" cy="470" rx="15" ry="6" fill="#a09680"/>
    <ellipse cx="320" cy="475" rx="18" ry="7" fill="#a09680"/>
`.trim();

export const BACKGROUNDS = {
    gradient_sky: {
        label: '漸層天空 · 開闊',
        svg: BG_GRADIENT_SKY,
    },
    mountain_river: {
        label: '山河遠景 · 沉澱',
        svg: BG_MOUNTAIN_RIVER,
    },
    empty_room: {
        label: '極簡空間 · 獨白',
        svg: BG_EMPTY_ROOM,
    },
    outdoor_grass: {
        label: '戶外草地 · 悠閒',
        svg: BG_OUTDOOR_GRASS,
    },
};

export const AVAILABLE_BACKGROUNDS = Object.keys(BACKGROUNDS);
