// 十種商品的線稿圖示（viewBox 240×240）。每個元素都設 pathLength=1，方便用 dashoffset 做描線動畫。
import React from "react";

const P: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path pathLength={1} {...p} />;
const C: React.FC<React.SVGProps<SVGCircleElement>> = (p) => <circle pathLength={1} {...p} />;
const E: React.FC<React.SVGProps<SVGEllipseElement>> = (p) => <ellipse pathLength={1} {...p} />;

const pentagon = (cx: number, cy: number, r: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });

const ball = () => {
  const pts = pentagon(178, 150, 15);
  return (
    <>
      <C cx={84} cy={124} r={54} />
      <P d="M84 70 V178 M30 124 H138 M46 86 C70 108 70 140 46 162 M122 86 C98 108 98 140 122 162" />
      <C cx={178} cy={150} r={44} />
      <P d={"M" + pts.map((p) => p.join(" ")).join(" L") + " Z"} />
      {pts.map(([x, y], i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <P key={i} d={`M${x} ${y} L${178 + 44 * Math.cos(a)} ${150 + 44 * Math.sin(a)}`} />;
      })}
    </>
  );
};

export const ICONS: Record<string, () => React.ReactNode> = {
  telas: () => (
    <>
      <E cx={52} cy={100} rx={22} ry={46} />
      <E cx={52} cy={100} rx={7} ry={15} />
      <P d="M52 54 H190 C206 54 214 78 214 100 C214 122 206 146 190 146 H52" />
      <P d="M110 146 C114 172 104 190 118 214 C138 202 158 220 178 204 C170 186 180 170 178 146" />
      <P d="M128 150 C130 172 124 186 132 206 M152 150 C154 172 150 190 156 210" opacity={0.5} />
      <P d="M90 54 C96 78 96 122 90 146" opacity={0.5} />
    </>
  ),
  calcetines: () => (
    <>
      <P d="M92 28 H150 V124 C150 150 166 160 182 168 C208 182 202 216 170 212 L108 204 C78 198 78 168 92 148 Z" />
      <P d="M92 54 H150 M92 66 H150" />
      <P d="M160 170 C172 180 174 196 166 210" />
    </>
  ),
  pantis: () => (
    <>
      <P d="M58 28 H182 M58 46 H182" />
      <P d="M58 46 C56 120 68 170 70 216 H102 C104 170 112 112 120 82 C128 112 136 170 138 216 H170 C172 170 184 120 182 46" />
      <P d="M70 196 H102 M138 196 H170" opacity={0.5} />
    </>
  ),
  ropa: () => (
    <>
      <P d="M36 66 H204 L194 110 C162 120 142 142 134 178 H106 C98 142 78 120 46 110 Z" />
      <P d="M38 84 H202" />
      <P d="M120 120 V150" opacity={0.5} />
    </>
  ),
  pijamas: () => (
    <>
      <P d="M82 38 L60 48 L28 96 L54 114 L72 90 V206 H168 V90 L186 114 L212 96 L180 48 L158 38 C148 58 92 58 82 38 Z" />
      <P d="M82 38 L120 94 L158 38" />
      <P d="M120 94 V206" />
      {[118, 142, 166, 190].map((y) => (
        <C key={y} cx={130} cy={y} r={4} />
      ))}
      <P d="M138 120 H160 V140 H138 Z" opacity={0.6} />
    </>
  ),
  panuelos: () => (
    <>
      <P d="M64 46 H204 V186" opacity={0.5} />
      <P d="M48 60 H190 V202 H48 Z" />
      <P d="M190 60 L150 100 H190" />
      <P d="M62 74 H176 V188 H62 Z" opacity={0.45} />
      <C cx={78} cy={172} r={7} />
      <C cx={92} cy={160} r={5} />
      <C cx={90} cy={178} r={4} />
    </>
  ),
  guantes: () => (
    <>
      <P d="M80 216 V140 L58 110 C50 98 64 86 76 98 L92 114 V60 C92 46 108 46 108 60 V104 V44 C108 30 124 30 124 44 V104 V50 C124 36 140 36 140 50 V108 V70 C140 56 156 56 156 70 V150 C156 176 150 192 150 216 Z" />
      <P d="M80 194 H150 M80 206 H150" />
    </>
  ),
  balones: ball,
  bolsas: () => (
    <>
      <P d="M58 86 H182 L194 214 H46 Z" />
      <P d="M90 86 V70 C90 38 150 38 150 70 V86" />
      <P d="M58 108 H182" opacity={0.5} />
      <P d="M150 120 L168 132 L156 150" opacity={0.6} />
    </>
  ),
  cinta: () => (
    <>
      <C cx={110} cy={108} r={70} />
      <C cx={110} cy={108} r={34} />
      <C cx={110} cy={108} r={52} opacity={0.4} />
      <P d="M110 178 H198 L210 188 L198 198 L210 208 L198 218 H124" />
    </>
  ),
};
