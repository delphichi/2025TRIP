// 角色：小哲（兩腳釘關節的剪紙人偶）、明天先生（日曆摺成的紙人）。原點都在腳底。
import React from "react";
import { random } from "remotion";
import { C, Cut, SERIF, circleD, rad, strip } from "./paper";

export type ZFace = "open" | "tired" | "shock" | "smile" | "sleep" | "worry" | "focus";

/** 手臂角度（度）：0 向右、90 向上、-90 向下；[上臂, 前臂]。右手預設鏡射左手。 */
export const POSE = {
  stand: [-105, -95],
  sit: [-60, -10],
  point: [20, 10],
  reach: [100, 95],
  write: [-40, 20],
  hug: [-60, 20],
  shrug: [-150, -40],
  hold: [-50, 40],
} as const satisfies Record<string, readonly [number, number]>;
type Arm = readonly [number, number];
const mirror = (a: Arm): Arm => [180 - a[0], 180 - a[1]];

export const Zhe: React.FC<{
  x: number;
  y: number;
  s?: number;
  rot?: number;
  arms?: Arm;
  armsR?: Arm;
  legs?: [number, number]; // 腿的角度（-90 = 正下）
  seated?: boolean;
  face?: ZFace;
  talk?: boolean;
  f?: number; // 目前格數（說話、眨眼用）
  tilt?: number; // 頭的傾斜
  bob?: number; // 身體上下
  holdR?: React.ReactNode; // 右手拿的東西（畫在手的位置）
}> = ({ x, y, s = 1, rot = 0, arms = POSE.stand, armsR, legs = [-90, -90], seated, face = "open", talk, f = 0, tilt = 0, bob = 0, holdR }) => {
  const right = armsR ?? mirror(arms);
  const by = (seated ? -10 : -120) + bob;
  const step = Math.floor(f / 2);
  const blink = face !== "sleep" && random(`blink${Math.floor(f / 6)}`) < 0.12;
  const mouthOpen = talk && random(`mouth${step}`) < 0.6;
  const hands: [number, number][] = [];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {seated
        ? null
        : ([-1, 1] as const).map((side, i) => {
            const hx = side * 19;
            const a = rad(legs[i]);
            const fx = hx + 120 * Math.cos(a);
            const fy = -120 - 120 * Math.sin(a);
            return (
              <g key={side}>
                <Cut d={strip(hx, -120, fx, fy, 26)} fill={C.pants} depth={2} />
                <Cut d={`M${fx - 19 + side * 4},${fy + 4} H${fx + 19 + side * 4} V${fy - 12} H${fx - 19 + side * 4}Z`} fill={C.paper} depth={2} />
              </g>
            );
          })}
      <g transform={`translate(0 ${by})`}>
        <Cut d="M-60,0 Q-66,-120 -46,-170 L46,-170 Q66,-120 60,0Z" fill={C.hoodie} depth={3} />
        <Cut d="M-30,-170 Q0,-140 30,-170Z" fill={C.hoodie2} depth={3} />
        {([-1, 1] as const).map((side) => {
          const [b1, b2] = side < 0 ? arms : right;
          const sx = side * 44;
          const sy = -150;
          const ex = sx + 68 * Math.cos(rad(b1));
          const ey = sy - 68 * Math.sin(rad(b1));
          const hx = ex + 62 * Math.cos(rad(b2));
          const hy = ey - 62 * Math.sin(rad(b2));
          hands.push([hx, hy]);
          return (
            <g key={side}>
              <Cut d={strip(sx, sy, ex, ey)} fill={C.hoodie} depth={3} />
              <Cut d={strip(ex, ey, hx, hy, 20)} fill={C.hoodie} depth={3} />
              <Cut d={circleD(hx, hy, 14)} fill={C.skin} depth={3} />
              <circle cx={sx} cy={sy} r={5.5} fill={C.brad} />
              <circle cx={ex} cy={ey} r={5.5} fill={C.brad} />
            </g>
          );
        })}
        {holdR ? <g transform={`translate(${hands[1][0]} ${hands[1][1]})`}>{holdR}</g> : null}
        <g transform={`rotate(${tilt} 0 -176)`}>
          <Cut d="M-6,-170 V-184 H6 V-170Z" fill={C.skin} depth={2} />
          <Cut d={circleD(0, -246, 50)} fill={C.skin} depth={3} />
          <Cut
            d="M-56,-240 Q-64,-300 -20,-312 L-8,-328 L4,-310 L22,-326 L28,-306 Q66,-300 56,-246 L44,-262 Q20,-284 -14,-276 Q-40,-268 -44,-236Z"
            fill={C.hair}
            depth={3}
          />
          <Face face={face} blink={blink} mouthOpen={!!mouthOpen} />
        </g>
      </g>
    </g>
  );
};

const Face: React.FC<{ face: ZFace; blink: boolean; mouthOpen: boolean }> = ({ face, blink, mouthOpen }) => {
  const st = { stroke: C.ink, strokeWidth: 4, strokeLinecap: "round" as const, fill: "none" };
  const eyes = (r = 5.5) =>
    blink ? (
      <path d="M-22,-244 h12 M12,-244 h12" {...st} />
    ) : (
      <>
        <circle cx={-16} cy={-244} r={r} fill={C.ink} />
        <circle cx={18} cy={-244} r={r} fill={C.ink} />
      </>
    );
  const mouth = (closed: React.ReactNode) => (mouthOpen ? <ellipse cx={2} cy={-214} rx={9} ry={8} fill={C.ink} /> : closed);
  switch (face) {
    case "tired":
      return (
        <>
          <path d="M-24,-242 h14 M10,-242 h14" {...st} strokeWidth={5} />
          {mouth(<path d="M-6,-214 h14" {...st} />)}
        </>
      );
    case "sleep":
      return (
        <>
          <path d="M-24,-244 q7,6 14,0 M10,-244 q7,6 14,0" {...st} />
          <path d="M-4,-214 h10" {...st} />
        </>
      );
    case "shock":
      return (
        <>
          <circle cx={-16} cy={-246} r={8} fill="#fff" stroke={C.ink} strokeWidth={3} />
          <circle cx={18} cy={-246} r={8} fill="#fff" stroke={C.ink} strokeWidth={3} />
          <circle cx={-16} cy={-246} r={3} fill={C.ink} />
          <circle cx={18} cy={-246} r={3} fill={C.ink} />
          <ellipse cx={2} cy={-214} rx={8} ry={mouthOpen ? 12 : 9} fill={C.ink} />
        </>
      );
    case "smile":
      return (
        <>
          {blink ? eyes() : <path d="M-24,-246 q8,-8 16,0 M10,-246 q8,-8 16,0" {...st} />}
          {mouth(<path d="M-12,-220 Q2,-206 16,-220" {...st} />)}
        </>
      );
    case "worry":
      return (
        <>
          <path d="M-26,-262 l14,6 M26,-262 l-14,6" {...st} />
          {eyes(5)}
          {mouth(<path d="M-10,-212 Q2,-222 14,-212" {...st} />)}
        </>
      );
    case "focus":
      return (
        <>
          <path d="M-26,-258 l14,2 M26,-258 l-14,2" {...st} />
          <circle cx={-14} cy={-240} r={5} fill={C.ink} />
          <circle cx={16} cy={-240} r={5} fill={C.ink} />
          <path d="M-4,-214 h12" {...st} />
        </>
      );
    default:
      return (
        <>
          {eyes()}
          {mouth(<path d="M-8,-216 Q2,-208 12,-216" {...st} />)}
        </>
      );
  }
};

// ── 明天先生 ──────────────────────────────────────────────────
export type MFace = "smile" | "worry" | "proud" | "soft";
const NOTES = ["開始讀書", "每天運動", "早點睡覺", "學好英文", "整理房間"];

/** 組裝：每個部件在 asm 的某一段從遠處飛進來。 */
const part = (asm: number, a: number, b: number) => Math.max(0, Math.min(1, (asm - a) / (b - a)));

export const Mister: React.FC<{
  x: number;
  y: number;
  s?: number;
  pages?: number;
  open?: number; // 0–1 胸前那頁打開
  bend?: number; // 頭撞到天花板時彎下來
  face?: MFace;
  armL?: Arm;
  armR?: Arm;
  hat?: boolean;
  asm?: number; // 1 = 組好
  talk?: boolean;
  f?: number;
  date?: string;
  hold?: React.ReactNode; // 右手拿的東西
  tear?: { k: number; date: string }; // 撕下一頁：k 0–1，date 是被撕走的舊日期
}> = ({ x, y, s = 1, pages = 12, open = 0, bend = 0, face = "smile", armL = [-124, -98], armR, hat = true, asm = 1, talk, f = 0, date = "13", hold, tear }) => {
  const bh = 60 + pages * 12;
  const top = -100 - bh;
  const right = armR ?? mirror(armL);
  const mouthOpen = talk && random(`mm${Math.floor(f / 2)}`) < 0.6;
  // 組裝進度
  const pLeg = part(asm, 0, 0.25);
  const pBody = part(asm, 0.15, 0.5);
  const pArm = part(asm, 0.45, 0.65);
  const pHead = part(asm, 0.6, 0.82);
  const pHat = part(asm, 0.85, 1);
  const fly = (p: number, dx: number, dy: number, r: number) => `translate(${dx * (1 - p) ** 2} ${dy * (1 - p) ** 2}) rotate(${r * (1 - p) ** 2})`;
  const shownPages = Math.max(0, Math.floor(pages * pBody));
  const fw = 140 * (1 - open * 0.85);
  const hands: [number, number][] = [];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* 摺紙腿（之字形） */}
      {pLeg > 0
        ? [-40, 40].map((lx) => (
            <g key={lx} transform={fly(pLeg, lx * 4, 80, lx * 2)} opacity={Math.min(1, pLeg * 3)}>
              <path d={`M${lx},0 l-14,-20 l28,-20 l-28,-20 l28,-20 l-14,-20`} fill="none" stroke={C.paper} strokeWidth={20} strokeLinejoin="round" filter="url(#d2)" />
              <path d={`M${lx},0 l-14,-20 l28,-20 l-28,-20 l28,-20 l-14,-20`} fill="none" stroke={C.calred} strokeWidth={3} strokeLinejoin="round" opacity={0.6} />
            </g>
          ))
        : null}
      {/* 身體：一疊日曆 */}
      {pBody > 0 ? (
        <g transform={fly(pBody, 0, 260, 0)}>
          <Cut d={`M-90,-100 V${-100 - (bh - 0) * Math.min(1, pBody * 1.2)} H90 V-100Z`} fill={C.paper} depth={3} />
          {Array.from({ length: shownPages }, (_, k) => {
            const yy = -100 - ((k + 1) * bh) / pages;
            return <path key={k} d={`M-90,${yy} H90`} stroke={C.ink} strokeOpacity={0.12} strokeWidth={2} />;
          })}
          {pBody >= 1 ? (
            <>
              {/* 胸前那頁像門一樣打開 */}
              <Cut d={`M-70,${top + 30} H${-70 + fw} V${top + 200} H-70Z`} fill={C.paper} depth={3} />
              <path d={`M-70,${top + 30} H${-70 + fw} V${top + 64} H-70Z`} fill={C.calred} />
              {open < 0.3 ? (
                <>
                  <text x={0} y={top + 58} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={24} fill={C.paper}>
                    十月
                  </text>
                  <text x={0} y={top + 168} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={92} fill={C.ink}>
                    {date}
                  </text>
                </>
              ) : (
                NOTES.map((t, k) => {
                  const p = part(open, 0.3 + k * 0.13, 0.42 + k * 0.13);
                  if (p <= 0) return null;
                  return (
                    <g
                      key={t}
                      transform={`translate(${-20 + (k % 2) * 10} ${top + 90 + k * 34}) rotate(${[-4, 3, -2, 4, -3][k]}) scale(${0.4 + 0.6 * p + Math.sin(p * Math.PI) * 0.15})`}
                    >
                      <Cut d="M0,-22 H150 V8 H0Z" fill={C.note} depth={2} />
                      <text x={10} y={1} fontFamily={SERIF} fontWeight={700} fontSize={22} fill={C.ink}>
                        {t}
                      </text>
                    </g>
                  );
                })
              )}
            </>
          ) : null}
        </g>
      ) : null}
      {/* 手臂：摺紙條，兩段 */}
      {pArm > 0
        ? ([-1, 1] as const).map((side) => {
            const [a1, a2] = side < 0 ? armL : right;
            const sx = side * 90;
            const sy = top + 60;
            const ex = sx + 72 * Math.cos(rad(a1));
            const ey = sy - 72 * Math.sin(rad(a1));
            const hx = ex + 70 * Math.cos(rad(a2));
            const hy = ey - 70 * Math.sin(rad(a2));
            hands.push([hx, hy]);
            return (
              <g key={side} transform={fly(pArm, side * 220, -40, side * 80)} opacity={Math.min(1, pArm * 3)}>
                <path d={`M${sx},${sy} L${ex},${ey} L${hx},${hy}`} fill="none" stroke={C.paper} strokeWidth={22} strokeLinejoin="round" filter="url(#d2)" />
                <path d={`M${sx},${sy} L${ex},${ey} L${hx},${hy}`} fill="none" stroke={C.ink} strokeOpacity={0.12} strokeWidth={2} />
              </g>
            );
          })
        : null}
      {tear && tear.k > 0 && tear.k < 1 ? (
        <g
          transform={`translate(${-tear.k * 240} ${-tear.k * 220 + tear.k * tear.k * 360}) rotate(${-tear.k * 220} 0 ${top + 115})`}
          opacity={1 - tear.k ** 3}
        >
          <Cut d={`M-70,${top + 30} H70 V${top + 200} H-70Z`} fill={C.paper} depth={4} />
          <path d={`M-70,${top + 30} H70 V${top + 64} H-70Z`} fill={C.calred} />
          <text x={0} y={top + 58} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={24} fill={C.paper}>
            十月
          </text>
          <text x={0} y={top + 168} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={92} fill={C.ink}>
            {tear.date}
          </text>
        </g>
      ) : null}
      {hold && hands[1] ? <g transform={`translate(${hands[1][0]} ${hands[1][1]})`}>{hold}</g> : null}
      {/* 頭（彎腰時繞頸部旋轉） */}
      {pHead > 0 ? (
        <g transform={`${fly(pHead, 60, -320, 40)} rotate(${bend} 0 ${top})`}>
          <Cut d={`M-60,${top} V${top - 120} H60 V${top}Z`} fill={C.paper} depth={3} />
          <path d={`M-60,${top - 120} H60 V${top - 96} H-60Z`} fill={C.calred} />
          <circle cx={-28} cy={top - 108} r={5} fill={C.paper} />
          <circle cx={28} cy={top - 108} r={5} fill={C.paper} />
          <MFaceSvg face={face} top={top} mouthOpen={!!mouthOpen} />
          {hat && pHat > 0 ? (
            <g transform={fly(pHat, 140, -420, -70)}>
              <Cut d={`M-74,${top - 118} L0,${top - 214} L74,${top - 118}Z`} fill="#EDE5D5" depth={3} />
              <text x={0} y={top - 140} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={34} fill={C.calred}>
                明天
              </text>
            </g>
          ) : null}
        </g>
      ) : null}
    </g>
  );
};

const MFaceSvg: React.FC<{ face: MFace; top: number; mouthOpen: boolean }> = ({ face, top, mouthOpen }) => {
  const st = { stroke: C.ink, strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
  const mouthO = <ellipse cx={0} cy={top - 30} rx={12} ry={10} fill={C.ink} />;
  if (face === "worry")
    return (
      <>
        <circle cx={-22} cy={top - 60} r={7} fill={C.ink} />
        <circle cx={22} cy={top - 60} r={7} fill={C.ink} />
        <path d={`M-34,${top - 76} l20,6 M34,${top - 76} l-20,6`} {...st} />
        {mouthOpen ? mouthO : <path d={`M-16,${top - 28} Q0,${top - 38} 16,${top - 28}`} {...st} />}
      </>
    );
  if (face === "soft")
    return (
      <>
        <path d={`M-30,${top - 62} q8,-8 16,0 M14,${top - 62} q8,-8 16,0`} {...st} />
        {mouthOpen ? mouthO : <path d={`M-14,${top - 34} Q0,${top - 24} 14,${top - 34}`} {...st} />}
      </>
    );
  return (
    <>
      <circle cx={-22} cy={top - 62} r={7} fill={C.ink} />
      <circle cx={22} cy={top - 62} r={7} fill={C.ink} />
      <path d={`M-34,${top - 80} l20,${face === "proud" ? -10 : -6} M34,${top - 80} l-20,${face === "proud" ? -10 : -6}`} {...st} />
      {mouthOpen ? mouthO : <path d={`M-20,${top - 34} Q0,${top - 20} 20,${top - 34}`} {...st} />}
    </>
  );
};
