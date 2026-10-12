// 各場共用：時間換算、躺在床上的小哲、鉛筆、逐字寫出來的字。
import React from "react";
import { useCurrentFrame } from "remotion";
import { C, Cut, FPS, SERIF } from "../paper";
import { Zhe, ZFace } from "../chars";

/** 場景內的格數 f，以及換回全片秒數的 sec、全片秒數換成場內格數的 at()。 */
export const useClock = (start: number) => {
  const f = useCurrentFrame();
  return { f, sec: start + f / FPS, at: (s: number) => Math.round((s - start) * FPS) };
};

/** 躺在床上的小哲（站立人偶轉 90°），被子蓋到腰。 */
export const BedLying: React.FC<{ face?: ZFace; talk?: boolean; f?: number; breathe?: number }> = ({ face = "tired", talk, f = 0, breathe = 0 }) => (
  <g>
    <Zhe x={1560} y={590} s={0.78} rot={-90} face={face} talk={talk} f={f} bob={breathe} />
    <Cut d="M1340,548 Q1470,530 1600,548 V650 H1340Z" fill={C.blanket} depth={3} />
  </g>
);

/** 鉛筆：筆尖在原點，往右上延伸。 */
export const Pencil: React.FC<{ x: number; y: number; rot?: number; s?: number }> = ({ x, y, rot = -38, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <Cut d="M50,-14 H410 V14 H50Z" fill={C.mustard} depth={4} />
    <Cut d="M410,-14 H452 V14 H410Z" fill="#E79A9A" depth={4} />
    <Cut d="M0,0 L50,-14 L50,14Z" fill="#E8D3B0" depth={4} />
    <path d="M0,0 l14,-4 l0,8Z" fill={C.ink} />
  </g>
);

/** 逐字寫出：k = 0–1 顯示比例；回傳目前筆尖的 x。 */
const textW = (text: string, size: number) => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : ch === " " ? 0.3 : 0.58) * size, 0);
export const writeX = (x: number, text: string, size: number, k: number) => x + textW(text, size) * k;
export const Written: React.FC<{ id: string; x: number; y: number; text: string; size: number; k: number; color?: string; weight?: number; font?: string }> = ({
  id,
  x,
  y,
  text,
  size,
  k,
  color = C.ink,
  weight = 700,
  font = SERIF,
}) => {
  if (k <= 0) return null;
  const w = textW(text, size) * k;
  return (
    <g>
      <clipPath id={id}>
        <rect x={x - 4} y={y - size * 1.1} width={w + 4} height={size * 1.5} />
      </clipPath>
      <text x={x} y={y} fontFamily={font} fontWeight={weight} fontSize={size} fill={color} clipPath={`url(#${id})`}>
        {text}
      </text>
    </g>
  );
};
