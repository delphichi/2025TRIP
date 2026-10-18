// 《Rosado》櫥窗睡衣（9:16，切鏡）：她一身黃，問三次「¿Qué color es mejor?」，他盯著手機三次都答「Rosado.」（同一個錄音檔，像機器人）；
// 第四次問「¿Y cuál es mi color favorito?」（鏡頭由上往下掃過一身黃），他停一拍還是「…¿Rosado?」→「¡Eres más tonto que un poroto! ¡Me llevo las cuatro de regalo!」＋笑聲。
// 她每次提問鏡頭都比上次更近（近景 → 特寫 → 大特寫），他的三次回答維持同一個中景，第四次推成近景。配音：scripts/rosado_vo.sh → vo_fast.py rosado 1.1。
import { durOf, Layout, makeGuantes, PACE_CUT, Shot } from "./Guantes";

const HIM: Shot = { s: 2.0, x: 460, y: 600 }; // 他中景，滑手機頭都不抬（三次回答都用這一格，像機器人；誰講話鏡頭給誰）

const LAYOUT: Layout = {
  W: 1080, H: 1920, img: "rosado/escena.png", iw: 572, ih: 1024, vertical: true,
  shots: [
    { s: 3.0, x: 70, y: 480, s2: 1.3, x2: 230, y2: 560 }, // 粉紅睡衣特寫 → 慢慢拉遠到櫥窗＋她
    { s: 2.0, x: 250, y: 480, s2: 1.6, y2: 500 }, // 她＋睡衣近景，慢慢拉遠
    HIM,
    { s: 3.0, x: 300, y: 445, s2: 2.4 }, // 她臉部特寫，慢慢拉遠
    HIM,
    { s: 3.4, x: 300, y: 440, s2: 2.9 }, // 她大特寫，慢慢拉遠
    HIM,
    { s: 1.8, x: 310, y: 330, y2: 800 }, // 她全身，由上往下掃過一身黃
    { s: 2.6, x: 465, y: 470 }, // 他近景，還盯著手機
    { s: 2.6, x: 300, y: 460, s2: 2.2 }, // 她臉部特寫：生氣 → 笑
  ],
  script: {
    vo: "rosado/vo_fast", // 配音加速 10%（scripts/vo_fast.py），FB/IG 要 30 秒內
    pace: { ...PACE_CUT, start: 1.2, endLen: 3.9 }, // 開場多留時間讓粉紅睡衣慢慢拉遠；片尾旁白較長
    slogan: ["Les daba más.", "Los hace felices."],
    // 每句實際秒數：配音後跑 scripts/vo_fast.py rosado 1.1，照印出的 dur 更新
    dur: { b1: 0.94, b2: 0.94, b3: 0.94, b4: 1.62, g1: 0.72, g2: 1.06, g3: 1.81, g4: 1.95, g5: 1.53, g6: 4.25, n1: 3.34 },
    lines: [
      { f: "g1", es: "Mi amor…" },
      { f: "g2", es: "¿Qué color es mejor?" },
      { f: "b1", es: "Rosado." },
      { f: "g3", es: "¿En serio? ¿Qué color es mejor?" },
      { f: "b2", es: "Rosado." },
      { f: "g4", es: "¿De verdad? ¿Qué color es mejor?" },
      { f: "b3", es: "Rosado." },
      { f: "g5", es: "¿Y cuál es mi color favorito?" },
      { f: "b4", es: "…¿Rosado?", pre: 0.8 }, // 停一拍：答案就在眼前
      { f: "g6", es: "¡Eres más tonto que un poroto! ¡Me llevo las cuatro de regalo!" },
    ],
    beds: [
      { src: "sfx/pluck.wav", volume: 0.16 }, // 輕快撥弦配樂，全片
      { src: "sfx/mall.wav", volume: 0.1 }, // 街上人聲
    ],
    sfx: [
      { src: "sfx/sparkle.wav", at: "g1", offset: -0.9, volume: 0.35 }, // 粉紅睡衣開場
      { src: "sfx/cash.wav", at: "g6", offset: 2.6, volume: 0.45 }, // 「las cuatro」買下去
    ],
  },
};

export const R_FPS = 30;
export const R_DUR = durOf(LAYOUT);
export const Rosado = makeGuantes(LAYOUT);
