// 角色：小沐（兩腳釘關節的剪紙人偶）、同學、折折（摺痕紙鹿）。原點都在腳底。
import React from "react";
import { C, Cut, circleD } from "./paper";

const rad = (d: number) => (d * Math.PI) / 180;

const strip = (ax: number, ay: number, bx: number, by: number, w = 26) => {
  let nx = -(by - ay);
  let ny = bx - ax;
  const L = Math.hypot(nx, ny) || 1;
  nx = (nx / L) * (w / 2);
  ny = (ny / L) * (w / 2);
  return `M${ax + nx},${ay + ny} L${bx + nx},${by + ny} L${bx - nx},${by - ny} L${ax - nx},${ay - ny}Z`;
};

const Brad: React.FC<{ x: number; y: number }> = ({ x, y }) => <circle cx={x} cy={y} r={6} fill={C.brad} stroke="#7a5a1a" strokeWidth={1.5} />;

export type Face = "open" | "tired" | "upset" | "smile";

/**
 * 剪紙人偶。手臂兩段：a1 = 上臂角度、a2 = 前臂角度（度，0 向右、90 向上），右手鏡射。
 * 動畫時只要改角度，手臂就繞著兩腳釘旋轉。
 */
export const Puppet: React.FC<{
  x: number;
  y: number;
  s?: number;
  arms: [number, number];
  armsR?: [number, number];
  face?: Face;
  seated?: boolean;
  sweater?: string;
  hair?: "bob" | "short" | "pony";
  pencil?: boolean;
  headTilt?: number;
}> = ({ x, y, s = 1, arms, armsR, face = "open", seated, sweater = C.coral, hair = "bob", pencil = true, headTilt = 0 }) => {
  const bodyY = seated ? -10 : -120;
  const right = armsR ?? [180 - arms[0], 180 - arms[1]];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {seated ? null : (
        <>
          <Cut d="M-34,0 V-120 H-6 V0Z" fill="#3A4A66" depth={2} />
          <Cut d="M6,0 V-120 H34 V0Z" fill="#3A4A66" depth={2} />
          <Cut d="M-44,0 H-4 V-14 H-44Z" fill={C.ink} depth={2} />
          <Cut d="M4,0 H44 V-14 H4Z" fill={C.ink} depth={2} />
        </>
      )}
      <g transform={`translate(0 ${bodyY})`}>
        <Cut d="M-62,0 Q-70,-120 -48,-170 L48,-170 Q70,-120 62,0Z" fill={sweater} depth={3} />
        {([
          [-1, arms],
          [1, right],
        ] as [number, [number, number]][]).map(([side, [a1, a2]]) => {
          const sx = side * 46;
          const sy = -150;
          const ex = sx + 70 * Math.cos(rad(a1));
          const ey = sy - 70 * Math.sin(rad(a1));
          const hx = ex + 64 * Math.cos(rad(a2));
          const hy = ey - 64 * Math.sin(rad(a2));
          return (
            <g key={side}>
              <Cut d={strip(sx, sy, ex, ey)} fill={sweater} depth={3} />
              <Cut d={strip(ex, ey, hx, hy, 22)} fill={sweater} depth={3} />
              <Cut d={circleD(hx, hy, 15)} fill={C.skin} depth={3} />
              <Brad x={sx} y={sy} />
              <Brad x={ex} y={ey} />
            </g>
          );
        })}
        <g transform={`rotate(${headTilt} 0 -180)`}>
          <Cut d="M-6,-170 V-186 H6 V-170Z" fill={C.skin} depth={2} />
          <Cut d="M54,-250 A54,58 0 1 0 -54,-250 A54,58 0 1 0 54,-250Z" fill={C.skin} depth={3} />
          {hair === "bob" ? (
            <Cut d="M-66,-232 Q-72,-320 0,-318 Q72,-320 66,-232 L52,-232 Q48,-280 10,-282 Q-40,-270 -50,-240 L-50,-210 L-66,-210Z" fill={C.hair} depth={3} />
          ) : hair === "short" ? (
            <Cut d="M-58,-250 Q-60,-318 0,-314 Q60,-318 58,-250 L48,-262 Q30,-290 -10,-286 Q-46,-280 -50,-250Z" fill={C.hair} depth={3} />
          ) : (
            <>
              <Cut d="M50,-290 Q110,-270 96,-196 Q84,-236 56,-250Z" fill={C.hair} depth={3} />
              <Cut d="M-60,-244 Q-66,-320 0,-318 Q66,-320 60,-244 L48,-252 Q40,-284 0,-284 Q-44,-282 -48,-244Z" fill={C.hair} depth={3} />
            </>
          )}
          {pencil ? <Cut d="M62,-268 L96,-306 L104,-298 L70,-260Z" fill={C.gold} depth={3} /> : null}
          {face === "open" || face === "smile" ? (
            <>
              <circle cx={-18} cy={-246} r={6} fill={C.ink} />
              <circle cx={20} cy={-246} r={6} fill={C.ink} />
              <path d={face === "smile" ? "M-14,-220 Q2,-204 18,-220" : "M-10,-218 Q2,-208 14,-218"} fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
            </>
          ) : face === "tired" ? (
            <>
              <path d="M-26,-244 h16 M12,-244 h16" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
              <path d="M-8,-214 h18" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M-28,-252 l14,6 M28,-252 l-14,6" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
              <circle cx={-18} cy={-238} r={5} fill={C.ink} />
              <circle cx={20} cy={-238} r={5} fill={C.ink} />
              <path d="M-12,-210 Q2,-222 16,-210" fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
            </>
          )}
          <circle cx={-34} cy={-226} r={9} fill="#F29C8E" opacity={0.6} />
          <circle cx={36} cy={-226} r={9} fill="#F29C8E" opacity={0.6} />
        </g>
      </g>
    </g>
  );
};

/** 折折：多面體摺紙鹿。wink 眨眼；antler 0–1 鹿角彈出；headOnly 只畫頭（從紙團探出來時）。 */
export const Deer: React.FC<{ x: number; y: number; s?: number; wink?: boolean; antler?: number; headOnly?: boolean; headTilt?: number }> = ({
  x,
  y,
  s = 1,
  wink,
  antler = 1,
  headOnly,
  headTilt = 0,
}) => {
  const crease = { stroke: C.ink, strokeOpacity: 0.18, strokeWidth: 2, fill: "none" };
  const [hx, hy] = headOnly ? [0, 0] : [84, -238];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {headOnly ? null : (
        <>
          {[-58, -30, 34, 60].map((lx) => (
            <Cut key={lx} d={`M${lx - 7},0 L${lx - 4},-96 L${lx + 6},-96 L${lx + 7},0Z`} fill={C.deer2} depth={2} stroke={C.ink} />
          ))}
          <Cut d="M-80,-90 L-40,-150 L50,-150 L84,-96 L40,-80 L-50,-78Z" fill={C.deer} depth={3} />
          <Cut d="M-40,-150 L50,-150 L40,-80 L-50,-78Z" fill={C.deer2} depth={3} opacity={0.55} />
          <path d="M-40,-150 L-50,-78 M50,-150 L40,-80 M-80,-90 L84,-96" {...crease} />
          <Cut d="M-84,-96 L-104,-118 L-88,-88Z" fill={C.deer2} depth={2} />
          <Cut d="M40,-150 L70,-226 L96,-220 L76,-146Z" fill={C.deer} depth={3} />
        </>
      )}
      <g transform={`translate(${hx} ${hy}) rotate(${headTilt})`}>
        <g filter="url(#d2)" stroke={C.root} strokeWidth={7} strokeLinecap="round" fill="none" transform={`translate(0 -24) scale(1 ${antler}) translate(0 24)`}>
          <path d="M-6,-24 L-18,-78 M-14,-60 L-36,-74 M-16,-50 L-4,-70" />
          <path d="M14,-24 L22,-82 M20,-62 L42,-76 M20,-48 L8,-66" />
        </g>
        <Cut d="M-28,-26 L30,-30 L58,6 L20,26 L-24,10Z" fill={C.deer} depth={3} />
        <Cut d="M-28,-26 L-56,-44 L-40,-12Z" fill={C.deer2} depth={3} />
        <path d="M30,-30 L20,26 M-28,-26 L20,26" {...crease} />
        <circle cx={54} cy={6} r={6} fill={C.ink} />
        {wink ? (
          <path d="M4,-6 q8,8 16,0" fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
        ) : (
          <>
            <circle cx={12} cy={-6} r={6} fill={C.ink} />
            <circle cx={14} cy={-8} r={2} fill="#fff" />
          </>
        )}
      </g>
    </g>
  );
};
