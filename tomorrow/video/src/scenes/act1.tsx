// 第一幕：S1 第一個明天（0–4 秒）、S2 啪！啪！啪！（4–15 秒）
import React from "react";
import { AbsoluteFill } from "remotion";
import { C, Cam, Cut, EXPO_OUT, IN_OUT, PopLines, SERIF, Stage, camAt, drop, handheld, popUp, tw, twos } from "../paper";
import { POSE, Zhe } from "../chars";
import { Cal, Dust, FLOOR_CALS, FloorCals, Light, Room } from "../room";
import { BedLying, useClock } from "./common";
import { speaking } from "../subs";

/** 桌上攤開的習題：page = 0 攤開、1 闔上。 */
const Workbook: React.FC<{ page: number }> = ({ page }) => {
  const th = Math.PI * (1 - page); // 翻頁角度：π（攤在左邊）→ 0（蓋到右邊）
  const sx = 680;
  const tx = sx + 80 * Math.cos(th);
  const ty = 622 - 80 * Math.sin(th);
  return (
    <g>
      <Cut d={`M${page >= 1 ? 600 : 560},640 L760,640 L752,622 L${page >= 1 ? 608 : 568},622Z`} fill={C.paper} depth={3} />
      <Cut d="M604,622 H756 V614 H604Z" fill={C.hoodie} depth={3} opacity={page >= 1 ? 1 : 0} />
      {page > 0 && page < 1 ? <Cut d={`M${sx},622 L${sx},640 L${tx},${ty + 18} L${tx},${ty}Z`} fill="#F1EADB" depth={3} /> : null}
      {page <= 0 ? <path d="M580,630 H660 M700,630 H740" stroke={C.ink} strokeOpacity={0.25} strokeWidth={3} /> : null}
    </g>
  );
};

// ── S1 ────────────────────────────────────────────────────────
export const S1: React.FC = () => {
  const { f, sec } = useClock(0);
  const q = twos(f);
  // 三刀：遠景 0–24、近景 24–55、特寫 55–96
  const cut = f < 24 ? 0 : f < 55 ? 1 : 2;
  const page = tw(q, 56, 62, 0, 1, IN_OUT);
  // 啪：62 格彈出，空中轉一圈，80 格落在桌上
  const P = 62;
  const up = tw(q, P, P + 6, 0, 1, EXPO_OUT);
  const down = tw(q, P + 8, P + 16, 0, 1, (t) => t * t);
  const cy = q < P ? 640 : q < P + 8 ? 630 - 120 * up : 510 + 92 * down;
  const cx = q < P ? 690 : 690 + 30 * Math.min(1, (q - P) / 16);
  const rot = q < P ? 0 : q < P + 16 ? -8 - 360 * ((q - P) / 16) : -4;
  const land = q >= P + 16 && q < P + 22 ? 0.12 * (1 - (q - P - 16) / 6) : 0;
  const shake = f >= P && f < P + 8 ? Math.sin(f * 2.3) * 10 * (1 - (f - P) / 8) : 0;
  const cam =
    cut === 0 ? camAt(f, [{ f: 0, cx: 960, cy: 540, z: 1 }, { f: 24, cx: 960, cy: 545, z: 1.04 }])
    : cut === 1 ? camAt(f, [{ f: 24, cx: 1360, cy: 570, z: 3.0 }, { f: 55, cx: 1345, cy: 574, z: 3.12 }])
    : camAt(f, [{ f: 55, cx: 690, cy: 600, z: 3.4 }, { f: 96, cx: 700, cy: 590, z: 3.6 }]);
  const hh = handheld(f, cut === 0 ? 0.5 : 1);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z + shake / cam.z} z={cam.z}>
          <Room books={false} />
          <Workbook page={page} />
          <BedLying face="tired" talk={speaking("小哲", sec)} f={f} breathe={Math.sin(f / 14) * 2} />
          <Light sun={1} />
          <Dust f={f} />
          {q >= P ? (
            <>
              <Cal x={cx} y={cy} s={1.4} rot={rot} sq={land} depth={4} />
              <PopLines x={690} y={560} r={80} k={tw(f, P, P + 3, 0, 1) * tw(f, P + 6, P + 12, 1, 0)} />
            </>
          ) : null}
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S2 ────────────────────────────────────────────────────────
const S2_START = 4;

/** 手機特寫（4–7 秒）：螢幕上的剪紙小人在跑步。 */
const Phone: React.FC<{ f: number }> = ({ f }) => {
  const q = twos(f);
  const run = Math.sin(q / 2.2);
  const z = 1 + tw(f, 0, 72, 0, 0.05, IN_OUT);
  const pop = 53;
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={980} cy={600} z={2.0} filter="url(#dof)">
          <Room />
          <Light sun={1} />
        </Cam>
        <g transform={`translate(960 540) scale(${z}) translate(-960 -540)`}>
          <path d="M1500,1180 L1180,760" stroke={C.hoodie} strokeWidth={180} strokeLinecap="round" filter="url(#d4)" />
          <Cut d="M800,130 H1120 Q1160,130 1160,170 V960 Q1160,1000 1120,1000 H800 Q760,1000 760,960 V170 Q760,130 800,130Z" fill={C.ink} depth={4} />
          <svg x={786} y={190} width={348} height={750} viewBox="786 190 348 750" overflow="hidden">
            <rect x={786} y={190} width={348} height={750} fill="#F7F1E6" />
            <rect x={786} y={700} width={348} height={240} fill={C.sage} />
            {Array.from({ length: 6 }, (_, k) => {
              const x = 1134 - ((q * 9 + k * 70) % 420);
              return <rect key={k} x={x} y={712} width={36} height={6} fill="#fff" opacity={0.6} />;
            })}
            <circle cx={1094} cy={300} r={34} fill={C.mustard} />
            <text x={960} y={250} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={40} fill={C.ink}>
              30 天跑步挑戰
            </text>
            <Zhe x={950} y={770 - Math.abs(run) * 14} s={0.9} face="smile" f={f} legs={[-90 + 32 * run, -90 - 32 * run]} arms={[-60 - 50 * run, -10]} armsR={[240 + 50 * run, 190]} />
            <rect x={846} y={860} width={228} height={48} rx={24} fill={C.calred} />
            <text x={960} y={896} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={30} fill={C.paper}>
              開始
            </text>
          </svg>
          <Cut d="M1110,700 a62,62 0 1 0 124,0 a62,62 0 1 0 -124,0Z" fill={C.skin} depth={4} />
          {q >= pop ? (
            <>
              <Cal x={1460} y={360} s={1.6 * popUp(q, pop, 8)} rot={12} depth={4} />
              <PopLines x={1460} y={360} r={100} k={tw(f, pop, pop + 3, 0, 1) * tw(f, pop + 6, pop + 12, 1, 0)} />
            </>
          ) : null}
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

// 中景：三連啪（10.0 / 10.5 / 11.0 秒），之後再掉幾張
const FALLS = [10.0, 10.5, 11.0, 11.3, 11.5, 11.7, 11.85];

export const S2: React.FC = () => {
  const { f, sec, at } = useClock(S2_START);
  if (f < 72) return <Phone f={f} />;
  const q = twos(f);
  // 手勢：7.4 指向層架上的英文書、8.6 指鞋子、9.4 指吉他
  const arms: [number, number] = sec < 7.4 ? [...POSE.stand] : sec < 8.6 ? [150, 165] : sec < 9.4 ? [-150, -165] : [...POSE.stand];
  const armsR: [number, number] | undefined = sec >= 9.4 && sec < 11.8 ? [10, 5] : sec >= 11.8 ? [-75, -90] : undefined;
  const cam = camAt(f, [
    { f: 72, cx: 980, cy: 560, z: 1.55 },
    { f: at(11.8), cx: 975, cy: 565, z: 1.6 },
    { f: at(15), cx: 960, cy: 540, z: 1.0 },
  ]);
  const hh = handheld(f, 0.8);
  // 已在地上的：書桌上那張（S1）＋鞋子旁那張（手機那一啪）
  const landed = FALLS.filter((s) => sec >= s + 0.42).length;
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <Room />
          <Cal x={720} y={598} s={1.0} rot={-4} />
          <FloorCals n={1 + landed} />
          <Zhe x={980} y={960} s={1.1} arms={arms} armsR={armsR} face={sec > 10 && sec < 11.8 ? "shock" : "open"} talk={speaking("小哲", sec)} f={f} tilt={sec >= 9.4 && sec < 11.8 ? 6 : 0} />
          <Light sun={1} />
          <Dust f={f} k={0.7} />
          {FALLS.map((s, i) => {
            const st = at(s);
            if (q < st || sec >= s + 0.42) return null;
            const [x, y, r] = FLOOR_CALS[1 + i];
            const [dy, sq] = drop(q, st, 900, 10);
            return <Cal key={i} x={x + Math.sin((q - st) / 2) * 30} y={y + dy} rot={r + (dy < -10 ? Math.sin((q - st) / 1.5) * 40 : 0)} sq={sq} depth={4} />;
          })}
          {FALLS.slice(0, 3).map((s, i) => {
            const k = tw(f, at(s + 0.42), at(s + 0.42) + 3, 0, 1) * tw(f, at(s + 0.42) + 5, at(s + 0.42) + 10, 1, 0);
            const [x, y] = FLOOR_CALS[1 + i];
            return <PopLines key={i} x={x} y={y - 20} r={60} k={k} />;
          })}
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};
