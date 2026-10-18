// 「Encontré trabajo en Asatex」購物袋短劇（9:16）：同一張商場圖，用 Guantes 的運鏡引擎，誰講話鏡頭給誰。
// 購物袋特寫 → 女中景 → 雙人全景「¿Por qué?」→ 男近景 → 女臉特寫 → 手機特寫＋轉帳成功 → 男中景 → 雙人鏡＋BBB 字卡 → 女偷笑 → 片尾「Asatex te hace feliz.」
// 主場景圖修正（袋子 SU→SUS、去掉像 Target 的紅圈）見 scripts/compras_fix.py；配音 scripts/compras_vo.sh。
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Nochebuena";
import { durOf, Layout, makeGuantes, PACE_CUT } from "./Guantes";

const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";

// 手機特寫時跳出的轉帳成功通知
const Transfer: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - 8, fps, config: { damping: 14 } });
  const out = interpolate(f, [len - 8, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 300, opacity: out }}>
      <div style={{ transform: `translateY(${(1 - k) * -60}px) scale(${0.9 + 0.1 * k})`, opacity: k, display: "flex", alignItems: "center", gap: 22, background: "rgba(255,255,255,.96)", borderRadius: 28, padding: "24px 34px", boxShadow: "0 12px 40px rgba(0,0,0,.35)", fontFamily: SANS }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: "#1fb35a", color: "#fff", fontSize: 40, fontWeight: 800, display: "grid", placeItems: "center" }}>✓</div>
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#15171c" }}>Transferencia exitosa</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#1fb35a" }}>+ $200.000</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 雙人鏡：Buenos · Bonitos · Baratos 一個一個跳出來
export const BBB: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(f, [len - 8, len], [1, 0], clamp);
  const words = ["¡Buenos,", "bonitos", "y baratos!"];
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 260, opacity: out }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
        {words.map((w, i) => {
          const k = spring({ frame: f - 14 - i * 9, fps, config: { damping: 11 } });
          return (
            <div key={w} style={{ transform: `scale(${k}) rotate(${(1 - k) * (i % 2 ? 8 : -8)}deg)`, fontFamily: SANS, fontWeight: 900, fontSize: 96, color: i === 2 ? "#ffd23f" : "#fff", textShadow: "0 4px 0 #b3122a, 0 8px 24px rgba(0,0,0,.5)", letterSpacing: "0.01em" }}>{w}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const LAYOUT: Layout = {
  W: 1080, H: 1920, img: "compras/escena.png", iw: 572, ih: 1024, vertical: true,
  shots: [
    { s: 2.1, x: 200, y: 900, s2: 1.8 }, // 購物袋特寫，慢慢拉開
    { s: 1.9, x: 150, y: 560 }, // 女孩中景
    { s: 1.0, x: 286, y: 512 }, // 雙人全景（男孩「¿Por qué?」時看兩人反應）
    { s: 1.9, x: 430, y: 470 }, // 男孩近景
    { s: 3.0, x: 165, y: 470 }, // 女孩臉部特寫
    { s: 3.0, x: 300, y: 720 }, // 手機特寫
    { s: 1.6, x: 420, y: 540 }, // 男孩中景
    { s: 1.15, x: 286, y: 580 }, // 雙人鏡
    { s: 2.4, x: 165, y: 500 }, // 女孩近景，偷笑
  ],
  script: {
    vo: "compras/vo_fast", // 配音加速 10%（scripts/vo_fast.py），FB/IG 要 30 秒內
    pace: PACE_CUT, // 直接切鏡（一鏡到底甩太快會暈）
    slogan: ["Asatex", "te hace feliz."],
    // 每句實際秒數：配音後跑 scripts/vo_fast.py compras 1.1，照印出的 dur 更新
    dur: { c1: 0.72, c2: 2.46, c3: 0.72, c4: 4.74, c5: 3.39, c6: 1.52, c7: 2.68, c8: 2.91, c9: 2.04, n1: 1.91 },
    lines: [
      { f: "c1", es: "Mi amor…" },
      { f: "c2", es: "¡Sí, sí, sí! ¡Encontré trabajo en Asatex!" },
      { f: "c3", es: "¿Por qué?" },
      { f: "c4", es: "Yo trabajo de día y hago delivery por las noches. ¿Será que no te alcanza la plata para tus gastos?" },
      { f: "c5", es: "¡Mi amor, me alcanza de sobra! ¡Hasta me sobra plata!" },
      { f: "c6", es: "Te voy a transferir más plata." },
      { f: "c7", es: "¡Entonces anda a Asatex a comprar con tus amigas!" },
      { f: "c8", es: "Asatex: ¡buenos, bonitos y baratos!", sub: false }, // 畫面上已有大字卡，不再上字幕
      { f: "c9", es: "¡Sí, sí, sí! Gracias, mi amor." },
    ],
    beds: [
      { src: "sfx/pluck.wav", volume: 0.16 }, // 輕快撥弦配樂，全片
      { src: "sfx/mall.wav", volume: 0.1, until: "c8" }, // 商場人聲
    ],
    sfx: [
      { src: "sfx/sparkle.wav", at: "c1", offset: -0.15, volume: 0.35 }, // 購物袋開場
      { src: "sfx/ding.wav", at: "c6", offset: 0.3, volume: 0.5 }, // 轉帳成功通知跳出來
      { src: "sfx/whoosh.wav", at: "c8", offset: -0.3, volume: 0.35 }, // BBB 字卡
    ],
    overlays: { c6: Transfer, c8: BBB },
  },
};

export const C_FPS = 30;
export const C_DUR = durOf(LAYOUT);
export const Compras = makeGuantes(LAYOUT);
