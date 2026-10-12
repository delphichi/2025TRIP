// 十種商品的線稿路徑（viewBox 240×240），給 3D 管狀模型用。與 src/trailer/icons.tsx 同一套造型。
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy}`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;

const pent = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return { x: 178 + 15 * Math.cos(a), y: 150 + 15 * Math.sin(a), ox: 178 + 44 * Math.cos(a), oy: 150 + 44 * Math.sin(a) };
});

export const PATHS: Record<string, string[]> = {
  telas: [
    ellipse(52, 100, 22, 46),
    ellipse(52, 100, 7, 15),
    "M52 54 H190 C206 54 214 78 214 100 C214 122 206 146 190 146 H52",
    "M110 146 C114 172 104 190 118 214 C138 202 158 220 178 204 C170 186 180 170 178 146",
    "M90 54 C96 78 96 122 90 146",
  ],
  calcetines: [
    "M92 28 H150 V124 C150 150 166 160 182 168 C208 182 202 216 170 212 L108 204 C78 198 78 168 92 148 Z",
    "M92 54 H150",
    "M92 66 H150",
    "M160 170 C172 180 174 196 166 210",
  ],
  pantis: [
    "M58 28 H182",
    "M58 46 H182",
    "M58 46 C56 120 68 170 70 216 H102 C104 170 112 112 120 82 C128 112 136 170 138 216 H170 C172 170 184 120 182 46",
  ],
  ropa: ["M36 66 H204 L194 110 C162 120 142 142 134 178 H106 C98 142 78 120 46 110 Z", "M38 84 H202"],
  pijamas: [
    "M82 38 L60 48 L28 96 L54 114 L72 90 V206 H168 V90 L186 114 L212 96 L180 48 L158 38 C148 58 92 58 82 38 Z",
    "M82 38 L120 94 L158 38",
    "M120 94 V206",
    circle(132, 120, 4),
    circle(132, 146, 4),
    circle(132, 172, 4),
  ],
  panuelos: ["M48 60 H190 V202 H48 Z", "M190 60 L150 100 H190", "M64 46 H204 V186", circle(78, 172, 7), circle(94, 160, 5)],
  guantes: [
    "M80 216 V140 L58 110 C50 98 64 86 76 98 L92 114 V60 C92 46 108 46 108 60 V104 V44 C108 30 124 30 124 44 V104 V50 C124 36 140 36 140 50 V108 V70 C140 56 156 56 156 70 V150 C156 176 150 192 150 216 Z",
    "M80 194 H150",
  ],
  balones: [
    circle(84, 124, 54),
    "M84 70 V178",
    "M30 124 H138",
    "M46 86 C70 108 70 140 46 162",
    "M122 86 C98 108 98 140 122 162",
    circle(178, 150, 44),
    "M" + pent.map((p) => `${p.x} ${p.y}`).join(" L") + " Z",
    ...pent.map((p) => `M${p.x} ${p.y} L${p.ox} ${p.oy}`),
  ],
  bolsas: ["M58 86 H182 L194 214 H46 Z", "M90 86 V70 C90 38 150 38 150 70 V86", "M58 108 H182"],
  cinta: [circle(110, 108, 70), circle(110, 108, 34), "M110 178 H198 L210 188 L198 198 L210 208 L198 218 H124"],
};
