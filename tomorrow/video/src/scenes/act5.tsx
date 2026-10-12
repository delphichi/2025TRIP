// 第五幕：S11 三個紙盒（70–80）、S12 空白的日曆（80–86）、S13 結尾（86–90）
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { C, Cam, Cut, IN_OUT, SERIF, Stage, W, H, camAt, clamp, handheld, lerp, tw, twos } from "../paper";
import { Mister, POSE, Zhe } from "../chars";
import { Bird, Box, Cal, Dust, Light, Mountain, Room } from "../room";
import { Pencil, Written, useClock, writeX } from "./common";
import { speaking } from "../subs";

const DAWN_SKY = "#FFD9B8";
const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
};

// ── S11 ───────────────────────────────────────────────────────
const BOXES = [
  { x: 560, y: 960, label: "現在開始", color: "#4E7D63" },
  { x: 960, y: 980, label: "可以放掉", color: "#8A8A8A" },
  { x: 1360, y: 960, label: "排到可行的日子", color: C.hoodie },
];
const ORDER = [0, 2, 1, 0, 1, 2, 2, 0, 1];
const TOSS0 = 26;
const TOSS = 16;

export const S11: React.FC = () => {
  const { f } = useClock(70);
  const q = twos(f);
  if (f >= 168) return <Diary f={f - 168} />;
  const dawn = tw(f, 0, 30, 0, 1, IN_OUT);
  const level = interpolate(q, [0, 168], [0.45, 0.14], clamp);
  const counts = [0, 0, 0];
  const flying: React.ReactNode[] = [];
  let throwing = 0;
  ORDER.forEach((b, i) => {
    const s = TOSS0 + i * TOSS;
    const t = (q - s) / 12;
    if (t >= 1) counts[b]++;
    else if (t >= 0) {
      throwing = 1;
      const bx = BOXES[b].x;
      const by = BOXES[b].y - 170;
      const x = lerp(1640, bx, t);
      const y = lerp(800, by, t) - Math.sin(t * Math.PI) * 260;
      flying.push(<Cal key={i} x={x} y={y} s={0.9} rot={t * 540} text="" depth={4} />);
    }
  });
  const bump = (b: number) => {
    const last = ORDER.map((v, i) => [v, TOSS0 + i * TOSS + 12] as const).filter(([v, e]) => v === b && q >= e && q < e + 6);
    return last.length ? 1 - (q - last[last.length - 1][1]) / 6 : 0;
  };
  const phase = ((q - TOSS0) % TOSS) / TOSS;
  const armsR: [number, number] = throwing && phase < 0.4 ? [lerp(-60, 100, phase / 0.4), lerp(20, 120, phase / 0.4)] : [...POSE.hug];
  const hh = handheld(f, 0.4);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={960 + hh.x} cy={540 + hh.y} z={interpolate(f, [0, 168], [1.0, 1.04], clamp)}>
          <Room sky={mixHex("#2B3A5A", DAWN_SKY, dawn)} lampOn={1 - dawn} />
          <Mountain level={level} />
          {BOXES.map((b, i) => (
            <Box key={i} {...b} items={2 + counts[i]} bump={bump(i)} />
          ))}
          <Mister x={1420} y={600} s={0.55} pages={12} face="soft" f={f} />
          <Zhe x={1700} y={990} s={0.95} arms={POSE.hug} armsR={armsR} face="open" f={f} tilt={throwing ? -6 : 0} />
          {flying}
          <Light dawn={dawn} night={1 - dawn} moon={(1 - dawn) * 0.5} lamp={(1 - dawn) * 0.6} />
          <Dust f={f} k={dawn * 0.6} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

/** 特寫：日記寫下「今天：數學第一題。」（77–80 秒） */
const Diary: React.FC<{ f: number }> = ({ f }) => {
  const q = twos(f);
  const TEXT = "今天：數學第一題。";
  const k = interpolate(q, [8, 48], [0, 1], clamp);
  const under = interpolate(q, [52, 62], [0, 1], clamp);
  const px = q < 48 ? writeX(1020, TEXT, 58, k) : q < 62 ? lerp(1040, 1500, under) : 1520;
  const py = q < 48 ? 372 : 404;
  const z = interpolate(f, [0, 72], [1, 1.06], clamp);
  return (
    <AbsoluteFill>
      <Stage bg={C.wood}>
        <g transform={`translate(1100 420) scale(${z}) translate(-1100 -420)`}>
          <rect width={W} height={H} fill={C.wood} />
          <Cut d="M240,170 H1680 V960 H240Z" fill={C.orange} depth={3} />
          <Cut d="M270,190 H950 V940 H270Z M970,190 H1650 V940 H970Z" fill={C.paper} depth={2} />
          {[300, 1000].map((x0) =>
            Array.from({ length: 7 }, (_, k2) => <path key={`${x0}-${k2}`} d={`M${x0},${300 + k2 * 80} H${x0 + 560}`} stroke={C.ink} strokeOpacity={0.15} strokeWidth={3} />),
          )}
          <path d="M960,190 V940" stroke={C.ink} strokeOpacity={0.25} strokeWidth={6} />
          <text x={320} y={270} fontFamily={SERIF} fontWeight={700} fontSize={40} fill="#999">
            十月十三日
          </text>
          <text x={320} y={370} fontFamily={SERIF} fontWeight={700} fontSize={40} fill="#bbb" textDecoration="line-through">
            明天開始讀書
          </text>
          <path d="M316,356 H566" stroke="#bbb" strokeWidth={4} />
          <text x={1020} y={270} fontFamily={SERIF} fontWeight={700} fontSize={40} fill="#999">
            十月十四日
          </text>
          <Written id="diary" x={1020} y={372} text={TEXT} size={58} k={k} weight={900} />
          {under > 0 ? <path d={`M1040,410 Q1250,430 ${lerp(1040, 1500, under)},${lerp(410, 404, under)}`} fill="none" stroke={C.calred} strokeWidth={6} strokeLinecap="round" /> : null}
          <Pencil x={px} y={py + (q % 4 === 0 && k < 1 ? -5 : 0)} rot={-34} />
          <path d="M0,0 L700,0 L1500,1080 L0,1080Z" fill="url(#dawn)" filter="url(#soft)" style={{ mixBlendMode: "screen" }} opacity={0.55} />
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S12 ───────────────────────────────────────────────────────
const WinWorld: React.FC<{ f: number; sec: number; pages: number; card: number; flipping: number; armUp: number; writeArm?: number }> = ({ f, sec, pages, card, flipping, armUp, writeArm = 0 }) => (
  <>
    <Room sky={DAWN_SKY} />
    <Zhe x={640} y={900} s={1} seated face="focus" f={f} arms={[-40, 20 + writeArm * 15]} armsR={[220, 160]} tilt={8} />
    <Mister x={150} y={560} s={0.42} pages={pages} face="soft" talk={speaking("明天先生", sec)} f={f} armR={[lerp(-56, 50, armUp), lerp(-82, 74, armUp)]} />
    {card > 0 ? (
      <g transform={`translate(${lerp(170, 250, armUp)} ${lerp(530, 470, armUp)}) rotate(-6) scale(${0.8 * card * Math.cos(flipping * Math.PI)} ${0.8 * card})`}>
        <Cut d="M-46,-56 H46 V56 H-46Z" fill={C.paper} depth={3} />
        {flipping > 0.5 || flipping === 0 ? (
          <>
            <path d="M-46,-56 H46 V-30 H-46Z" fill={C.calred} />
            <text x={0} y={36} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={64} fill={C.ink}>
              ?
            </text>
          </>
        ) : null}
      </g>
    ) : null}
    <Light dawn={1} />
    <Dust f={f} k={0.8} />
  </>
);

export const S12: React.FC = () => {
  const { f, sec, at } = useClock(80);
  const q = twos(f);
  // 80.2–81.2：身體的日曆頁一頁頁翻走
  const pages = Math.max(4, Math.round(interpolate(q, [at(80.2), at(81.2)], [8, 4], clamp)));
  const sheets = [0, 1, 2, 3].map((i) => {
    const s0 = at(80.2) + i * 6;
    const t = (q - s0) / 14;
    if (t < 0 || t > 1) return null;
    return <Cal key={i} x={190 + t * 220} y={430 - Math.sin(t * Math.PI) * 120 + t * 60} s={0.4} rot={t * 300} text="" depth={4} />;
  });
  const armUp = tw(q, at(84.2), at(84.6), 0, 1);
  const flipping = interpolate(q, [at(84.6), at(85.1)], [1, 0], clamp);
  const cam = camAt(f, [{ f: 0, cx: 230, cy: 470, z: 3.2 }, { f: 144, cx: 225, cy: 470, z: 3.4 }]);
  const hh = handheld(f, 0.5);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <WinWorld f={f} sec={sec} pages={pages} card={q >= at(84.2) ? 1 : 0} flipping={q >= at(84.6) ? flipping : 1} armUp={armUp} />
          {sheets}
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S13：拉到最遠，房間變回黑暗裡的紙模型 ────────────────────────
export const S13: React.FC = () => {
  const { f, sec } = useClock(86);
  const q = twos(f);
  const cam = camAt(f, [{ f: 0, cx: 230, cy: 470, z: 3.4 }, { f: 52, cx: 960, cy: 659, z: 0.42 }, { f: 96, cx: 960, cy: 672, z: 0.4 }]);
  const flap = Math.abs(Math.sin(q / 2.2));
  const bt = interpolate(f, [22, 92], [0, 1], clamp);
  const line = tw(f, 26, 38, 0, 1);
  const title = tw(f, 46, 60, 0, 1);
  return (
    <AbsoluteFill>
      <Stage bg="#2a2522">
        <defs>
          <clipPath id="box">
            <rect x={-80} y={-20} width={2080} height={1120} />
          </clipPath>
        </defs>
        <Cam cx={cam.cx} cy={cam.cy} z={cam.z}>
          <Cut d="M-150,-90 H2070 V1170 H-150Z M-80,-20 H2000 V1100 H-80Z" fill="#E6D6BC" depth={4} evenodd />
          <g clipPath="url(#box)">
            <WinWorld f={f} sec={sec} pages={4} card={1} flipping={0} armUp={1} writeArm={Math.sin(q / 3)} />
          </g>
        </Cam>
        <Bird x={lerp(560, 1700, bt)} y={lerp(420, 120, bt) + Math.sin(bt * 9) * 14} s={0.9} flap={0.3 + flap * 0.7} />
        <text x={960} y={870} textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={44} fill={C.paper} opacity={line} transform={`translate(0 ${(1 - line) * 12})`}>
          只要做一件，今天真的做得到的事。
        </text>
        <text x={960} y={968} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={64} letterSpacing={6} fill={C.paper} opacity={title}>
          每次都說明天開始的男孩
        </text>
        <rect x={0} y={0} width={W} height={H} fill="#000" opacity={interpolate(f, [88, 96], [0, 0.0], clamp)} />
      </Stage>
    </AbsoluteFill>
  );
};

