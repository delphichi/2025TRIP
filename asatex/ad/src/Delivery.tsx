// 《Delivery》購物袋短劇第二集（9:16）：他跑外送接到 Asatex 大單，送到門口才發現是自己家；她用他昨天轉的錢買光了，他再付一次，最後拿到「besito con pesito」當小費。
// 箱子特寫 → 女中景 → 雙人全景 → 男近景 → 女臉特寫 → 手機付款 → 男中景 → 雙人鏡＋BBB 字卡 → 女偷笑 → 片尾「Asatex te hace feliz.」
// 主場景圖：scripts/delivery_fix.py（箱子貼 Asatex 貼紙）；配音：scripts/delivery_vo.sh。
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Nochebuena";
import { durOf, Layout, makeGuantes, PACE_CUT } from "./Guantes";
import { BBB } from "./Compras";

const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";

// 手機特寫：外送 App 訂單卡，先顯示「Pago contra entrega」，按下去變「Pagado ✓」
const Pay: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - 6, fps, config: { damping: 14 } });
  const paid = f > len * 0.55;
  const tap = spring({ frame: f - Math.round(len * 0.5), fps, config: { damping: 9 } });
  const out = interpolate(f, [len - 8, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 280, opacity: out }}>
      <div style={{ transform: `translateY(${(1 - k) * -60}px)`, opacity: k, width: 640, background: "rgba(255,255,255,.97)", borderRadius: 30, padding: "28px 34px", boxShadow: "0 12px 40px rgba(0,0,0,.35)", fontFamily: SANS, color: "#15171c" }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: "#6b6f78" }}>Pedido · Casa 101</div>
        <div style={{ fontSize: 40, fontWeight: 800, marginTop: 4 }}>Asatex · 1 caja</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: 52, fontWeight: 900 }}>$200.000</span>
        </div>
        <div style={{ marginTop: 18, borderRadius: 18, padding: "18px 0", textAlign: "center", fontSize: 34, fontWeight: 800, color: "#fff", background: paid ? "#1fb35a" : "#e8452c", transform: `scale(${paid ? 1 : 1 - 0.06 * tap})` }}>
          {paid ? "Pagado ✓" : "Pago contra entrega · Pagar"}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const LAYOUT: Layout = {
  W: 1080, H: 1920, img: "delivery/escena.png", iw: 572, ih: 1024, vertical: true,
  shots: [
    { s: 2.4, x: 190, y: 700, s2: 2.0 }, // 箱子特寫（Asatex 貼紙），慢慢拉開
    { s: 1.9, x: 150, y: 560 }, // 女生中景
    { s: 1.0, x: 286, y: 512 }, // 雙人全景（門牌 101）
    { s: 1.9, x: 420, y: 480 }, // 男生近景
    { s: 3.0, x: 160, y: 440 }, // 女生臉部特寫
    { s: 3.0, x: 295, y: 600 }, // 手機特寫
    { s: 1.6, x: 420, y: 560 }, // 男生中景
    { s: 1.15, x: 286, y: 560 }, // 雙人鏡
    { s: 2.4, x: 160, y: 500 }, // 女生近景，偷笑
  ],
  script: {
    vo: "delivery/vo_fast", // 配音加速 10%（scripts/vo_fast.py），FB/IG 要 30 秒內
    pace: PACE_CUT, // 直接切鏡（一鏡到底甩太快會暈）
    slogan: ["Asatex", "te hace feliz."],
    // 每句實際秒數：配音後跑 scripts/vo_fast.py delivery 1.1，照印出的 dur 更新
    dur: { d1: 2.42, d2: 1.95, d3: 2.66, d4: 1.87, d5: 3.68, d6: 3.01, d7: 1.4, d8: 1.94, d9: 3.17, n1: 1.91 },
    lines: [
      { f: "d1", es: "¡Sí, sí, sí! ¡Llegó mi pedido de Asatex!" },
      { f: "d2", es: "¿Mi amor…? ¿Tú eres el delivery?" },
      { f: "d3", es: "¡Entregártelo yo mismo es lo que más me hace feliz!" },
      { f: "d4", es: "¡El pedido gigante era para mi casa!" },
      { f: "d5", es: "Ayer me transferiste plata… ¡y ya me la gasté!" },
      { f: "d6", es: "Doscientas lucas… yo pago, no te preocupes." },
      { f: "d7", es: "¿Y mi propina, mi amor?" },
      { f: "d8", es: "¡Buenos, bonitos y baratos!", sub: false }, // 畫面上已有大字卡
      { f: "d9", es: "Toma, mi amor… ¡besito con pesito!" },
    ],
    beds: [
      { src: "sfx/pluck.wav", volume: 0.16 }, // 輕快撥弦配樂，全片
      { src: "sfx/birds.wav", volume: 0.12, until: "d8" }, // 住宅區鳥叫
    ],
    sfx: [
      { src: "sfx/doorbell.wav", at: "d1", offset: -0.2, volume: 0.45 }, // 開場門鈴
      { src: "sfx/cash.wav", at: "d6", offset: 2.15, volume: 0.5 }, // 付款鍵變「Pagado ✓」那一刻（Pay 卡 55%）
      { src: "sfx/whoosh.wav", at: "d8", offset: -0.3, volume: 0.35 }, // BBB 字卡
    ],
    overlays: { d6: Pay, d8: BBB },
  },
};

export const D_FPS = 30;
export const D_DUR = durOf(LAYOUT);
export const Delivery = makeGuantes(LAYOUT);
