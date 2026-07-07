/**
 * SVG Parts · 姿勢（4 種）
 * -----------------------------------
 * 每個姿勢是一整套「袍子 + 手 + 腳」的字串
 * viewBox 0 0 400 500 · 頭部固定在 y≈140
 *
 * 顏色：#7a9a78 綠袍（原圖那種抹茶綠）· #f0d0a0 膚色手
 */

// 站立 · 手藏在袍子裡 · 端莊
export const ROBE_STANDING = `
    <!-- 袍子主體 -->
    <path d="M155,200
             Q145,240 145,320
             L155,410
             Q200,420 245,410
             L255,320
             Q255,240 245,200
             Q200,190 155,200 Z"
          fill="#7a9a78" stroke="#3a3a3a" stroke-width="2.5"/>
    <!-- 領口 · V 型交疊 -->
    <path d="M180,200 L200,220 L220,200"
          fill="none" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 領口內襯淺色 -->
    <path d="M180,200 L200,220 L220,200 L215,205 L200,215 L185,205 Z"
          fill="#a8c0a6" stroke="none"/>
    <!-- 兩手交疊在袍子中央 -->
    <ellipse cx="200" cy="315" rx="35" ry="18" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="2"/>
    <path d="M180,315 Q200,320 220,315" fill="none" stroke="#3a3a3a" stroke-width="1.5"/>
    <!-- 袍角折痕 -->
    <path d="M170,350 L165,405" fill="none" stroke="#5a7a58" stroke-width="1.5" opacity="0.5"/>
    <path d="M230,350 L235,405" fill="none" stroke="#5a7a58" stroke-width="1.5" opacity="0.5"/>
    <!-- 腳（袍子底部露出） -->
    <ellipse cx="180" cy="418" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
    <ellipse cx="220" cy="418" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
`.trim();

// 行走 · 身體微傾 · 一隻手擺動
export const ROBE_WALKING = `
    <!-- 袍子主體 · 微傾 -->
    <path d="M155,200
             Q140,240 138,320
             L152,405
             Q200,420 250,410
             L262,320
             Q260,240 245,200
             Q200,190 155,200 Z"
          fill="#7a9a78" stroke="#3a3a3a" stroke-width="2.5"/>
    <!-- 領口 -->
    <path d="M180,200 L200,220 L220,200" fill="#a8c0a6" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 擺動的右手（從袍中甩出） -->
    <path d="M255,240 Q285,265 275,295 Q265,300 258,290 Q253,275 253,255 Z"
          fill="#7a9a78" stroke="#3a3a3a" stroke-width="2"/>
    <circle cx="272" cy="292" r="10" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="1.5"/>
    <!-- 藏在袍中的左手 -->
    <ellipse cx="175" cy="310" rx="22" ry="12" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="1.5"/>
    <!-- 走路 · 一前一後腳 -->
    <ellipse cx="175" cy="418" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
    <ellipse cx="225" cy="422" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
`.trim();

// 蹲坐 · 靜謐 · 沉思
export const ROBE_SITTING = `
    <!-- 蹲坐袍子 · 底部寬 -->
    <path d="M160,220
             Q145,280 128,395
             L272,395
             Q255,280 240,220
             Q200,210 160,220 Z"
          fill="#7a9a78" stroke="#3a3a3a" stroke-width="2.5"/>
    <!-- 領口 -->
    <path d="M180,220 L200,238 L220,220" fill="#a8c0a6" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 兩膝突起 -->
    <circle cx="160" cy="360" r="28" fill="#7a9a78" stroke="#3a3a3a" stroke-width="2"/>
    <circle cx="240" cy="360" r="28" fill="#7a9a78" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 兩手放膝上 -->
    <ellipse cx="160" cy="350" rx="16" ry="9" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="1.5"/>
    <ellipse cx="240" cy="350" rx="16" ry="9" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="1.5"/>
`.trim();

// 舉手歡呼 · 兩手上舉
export const ROBE_ARMS_UP = `
    <!-- 袍子主體 · 手上舉時 · 上方變寬 -->
    <path d="M155,200
             Q145,240 145,320
             L155,410
             Q200,420 245,410
             L255,320
             Q255,240 245,200
             Q200,190 155,200 Z"
          fill="#7a9a78" stroke="#3a3a3a" stroke-width="2.5"/>
    <!-- 領口 -->
    <path d="M180,200 L200,220 L220,200" fill="#a8c0a6" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 左臂上舉 -->
    <path d="M155,205 L130,150 L115,90 L100,60 L92,55"
          fill="none" stroke="#7a9a78" stroke-width="22" stroke-linecap="round"/>
    <path d="M155,205 L130,150 L115,90 L100,60 L92,55"
          fill="none" stroke="#3a3a3a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="92" cy="55" r="14" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 右臂上舉 -->
    <path d="M245,205 L270,150 L285,90 L300,60 L308,55"
          fill="none" stroke="#7a9a78" stroke-width="22" stroke-linecap="round"/>
    <path d="M245,205 L270,150 L285,90 L300,60 L308,55"
          fill="none" stroke="#3a3a3a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="308" cy="55" r="14" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 腳 -->
    <ellipse cx="180" cy="418" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
    <ellipse cx="220" cy="418" rx="14" ry="7" fill="#e8dcc0" stroke="#3a3a3a" stroke-width="1.5"/>
`.trim();

export const POSES = {
    robe_standing: {
        label: '站立 · 端莊',
        svg: ROBE_STANDING,
    },
    robe_walking: {
        label: '行走 · 一手擺動',
        svg: ROBE_WALKING,
    },
    robe_sitting: {
        label: '蹲坐 · 沉思',
        svg: ROBE_SITTING,
    },
    robe_arms_up: {
        label: '舉手歡呼',
        svg: ROBE_ARMS_UP,
    },
};

export const AVAILABLE_POSES = Object.keys(POSES);
