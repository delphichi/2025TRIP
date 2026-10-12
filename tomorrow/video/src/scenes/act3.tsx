// 第三幕：S5 日子一天天過去（31–38）、S6 下週一定開始（38–44）、S7 怎麼反而什麼都沒做（44–48）
import React from "react";
import { AbsoluteFill, interpolate, random } from "remotion";
import { C, Cam, Cut, IN_OUT, SERIF, Stage, camAt, clamp, handheld, lerp, tw, twos } from "../paper";
import { Mister, POSE, Zhe } from "../chars";
import { Cal, FloorCals, Light, Mountain, Room, mountainY } from "../room";
import { BedLying, useClock } from "./common";
import { speaking } from "../subs";

const DAYS = ["星期一", "星期二", "星期三", "星期四"];

// ── S5：定格縮時，每 3 格更新一次 ────────────────────────────────
export const S5: React.FC = () => {
  const { f } = useClock(31);
  const q = Math.floor(f / 3) * 3;
  const CYCLE = 56;
  const day = Math.min(2, Math.floor(q / CYCLE));
  const p = (q % CYCLE) / CYCLE;
  const isDay = p < 0.58;
  const dayK = isDay ? 1 : 0;
  const sweep = interpolate(p, [0, 0.58], [380, -320], clamp);
  const level = interpolate(q, [0, 168], [0.08, 0.62], clamp);
  const pages = Math.round(interpolate(q, [0, 168], [26, 34], clamp));
  const sky = isDay ? "#F6E7C8" : "#2B3A5A";
  // 每半天換一個姿勢（定格跳接）
  const half = Math.floor(q / (CYCLE / 2));
  const flip = tw(f, day * CYCLE, day * CYCLE + 6, 0, 1);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={960} cy={540} z={1}>
          <Room sky={sky} books={level < 0.3} />
          <FloorCals n={12} />
          <Mountain level={level} />
          {isDay ? (
            half % 2 === 0 ? (
              day === 0 ? (
                <Zhe x={640} y={900} s={1} seated face="open" arms={POSE.hold} f={f} tilt={10} holdR={<rect x={-22} y={-40} width={44} height={70} rx={8} fill={C.ink} />} />
              ) : day === 1 ? (
                <Zhe x={1500} y={1000} s={1} face="tired" arms={POSE.shrug} f={f} />
              ) : (
                <Zhe x={700} y={mountainY(level, 700) + 20} s={0.95} seated face="open" arms={POSE.hold} f={f} tilt={12} holdR={<rect x={-22} y={-40} width={44} height={70} rx={8} fill={C.ink} />} />
              )
            ) : (
              <Zhe x={1000} y={mountainY(level, 1000) + 30} s={0.95} seated face="tired" f={f} tilt={-8} />
            )
          ) : (
            <BedLying face="sleep" f={f} />
          )}
          <Mister x={1480} y={1010} s={0.95} pages={pages} face="proud" f={f} />
          <Light sun={dayK} sweep={sweep} night={1 - dayK} moon={1 - dayK} dim={level * 0.9} />
        </Cam>
        {/* 牆角的日子字卡：每一天翻一頁 */}
        <g transform={`translate(1560 160) scale(1 ${Math.abs(Math.cos(flip * Math.PI))})`}>
          <rect x={-120} y={-50} width={240} height={90} rx={10} fill={C.ink} opacity={0.8} />
          <text x={0} y={12} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={44} fill={C.paper}>
            {DAYS[flip > 0.5 || day === 0 ? day : day - 1]}
          </text>
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S6 ────────────────────────────────────────────────────────
/** 三個 0.67 秒的特寫插入：在紙山裡翻找、吉他被壓住、鞋子露出兩個角。 */
const Insert: React.FC<{ f: number; k: number }> = ({ f, k }) => {
  const q = twos(f);
  const spots = [
    { cx: 700, cy: 540, z: 3.0 },
    { cx: 1700, cy: 600, z: 2.6 },
    { cx: 640, cy: 760, z: 3.2 },
  ][k];
  const local = f - k * 16;
  const z = spots.z * (1 + local * 0.004);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={spots.cx} cy={spots.cy} z={z}>
          <Room />
          <Mountain level={0.8} />
          {k === 0 ? (
            <g>
              <path d={`M560,${760 + Math.sin(q) * 6} L${700 + Math.sin(q / 2) * 20},${560 + Math.cos(q) * 10}`} stroke={C.hoodie} strokeWidth={60} strokeLinecap="round" filter="url(#d3)" />
              <circle cx={700 + Math.sin(q / 2) * 20} cy={560 + Math.cos(q) * 10} r={22} fill={C.skin} filter="url(#d3)" />
              {[0, 1, 2].map((i) => (
                <Cal key={i} x={640 + i * 60 + (random(`i0${q}${i}`) - 0.5) * 20} y={520 + i * 14 + (random(`i1${q}${i}`) - 0.5) * 20} rot={(random(`i2${q}${i}`) - 0.5) * 60} depth={3} />
              ))}
            </g>
          ) : null}
          {k === 1 ? (
            <g>
              {/* 吉他只露出琴頸和一角琴身 */}
              <g transform={`rotate(-18 1700 700) translate(0 ${q % 4 === 0 ? -3 : 0})`}>
                <Cut d="M1684,420 H1716 V700 H1684Z" fill={C.wood2} depth={3} />
                <Cut d="M1676,380 H1724 V430 H1676Z" fill={C.ink} depth={3} />
                <Cut d="M1700,700 m-90,0 a90,70 0 0 1 180,0Z" fill={C.orange} depth={3} />
              </g>
              <Cal x={1620} y={690} rot={-25} depth={3} />
              <Cal x={1700} y={720} rot={12} depth={3} text="下週" />
              <Cal x={1780} y={700} rot={30} depth={3} />
            </g>
          ) : null}
          {k === 2 ? (
            <g>
              <path d="M560,740 q10,-34 60,-30 l40,14 q30,4 30,22 Z" fill={C.paper} filter="url(#d3)" />
              <path d="M680,760 q10,-30 56,-28 l40,12 q28,6 28,22 Z" fill={C.paper} filter="url(#d3)" />
              <Cal x={600} y={780} rot={-20} depth={3} />
              <Cal x={700} y={790} rot={15} depth={3} />
            </g>
          ) : null}
          <Light sun={0.6} dim={0.8} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

export const S6: React.FC = () => {
  const { f, sec, at } = useClock(38);
  if (f < 48) return <Insert f={f} k={Math.floor(f / 16)} />;
  const q = twos(f);
  const L = 0.95;
  // 爬山：40.0–42.3 秒
  const t = interpolate(q, [at(40.0), at(42.3)], [0, 1], clamp);
  const x = lerp(260, 820, t);
  const y = mountainY(L, x) + 14;
  const climbing = t > 0 && t < 1;
  const sw = Math.sin(q / 2.5);
  const grabbed = q >= at(42.4);
  const lift = tw(q, at(42.4), at(42.9), 0, 1);
  const arms: [number, number] = climbing ? [110 + sw * 30, 100 + sw * 20] : grabbed ? [...POSE.stand] : [...POSE.reach];
  const armsR: [number, number] | undefined = climbing ? [70 - sw * 30, 80 - sw * 20] : grabbed ? [lerp(-60, 75, lift), lerp(-40, 85, lift)] : undefined;
  const cam = camAt(f, [
    { f: 48, cx: 520, cy: 520, z: 1.6 },
    { f: at(42.3), cx: 860, cy: 360, z: 1.6 },
    { f: 144, cx: 880, cy: 330, z: 1.75 },
  ]);
  const hh = handheld(f, 0.9);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <Room />
          <Mountain level={L} />
          {!grabbed ? <Cal x={930} y={mountainY(L, 930) + 6} s={1.3} rot={10} text="下週/一定開始" /> : null}
          <Zhe
            x={x}
            y={y + (climbing ? Math.abs(sw) * -10 : 0)}
            s={1}
            rot={climbing ? -12 : 0}
            arms={arms}
            armsR={armsR}
            legs={climbing ? [-90 + sw * 28, -90 - sw * 28] : [-90, -90]}
            face={grabbed ? "smile" : "focus"}
            talk={speaking("小哲", sec)}
            f={f}
            holdR={grabbed ? <Cal x={0} y={-60} s={1.4 + lift * 0.8} rot={-6} text="下週/一定開始" depth={4} /> : undefined}
          />
          <Light sun={0.6} dim={0.85} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S7：一刀切到最遠，全片第一次安靜 ────────────────────────────
export const S7: React.FC = () => {
  const { f, sec } = useClock(44);
  const q3 = Math.floor(f / 3) * 3;
  const z = interpolate(f, [0, 96], [1.06, 1.0], { ...clamp, easing: IN_OUT });
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={960} cy={540} z={z}>
          <Room />
          <Mountain level={0.95} />
          <Mister x={1380} y={900} s={1.25} pages={30} bend={34 + Math.sin(f / 20) * 2} face="worry" talk={speaking("明天先生", sec)} f={f} />
          <Zhe x={700} y={mountainY(0.95, 700) + 14} s={0.8} face={sec < 46.5 ? "worry" : "shock"} talk={speaking("小哲", sec)} f={f} arms={sec < 46.5 ? POSE.shrug : POSE.stand} />
          {/* 紙張緩緩飄落 */}
          {Array.from({ length: 5 }, (_, i) => {
            const t0 = random(`fall${i}`) * 96;
            const tt = ((q3 + t0) % 96) / 96;
            const x0 = 900 + random(`fx${i}`) * 800;
            return <Cal key={i} x={x0 + Math.sin(tt * 6 + i) * 40} y={-80 + tt * 700} s={0.6} rot={Math.sin(tt * 5 + i) * 40} text="" depth={4} />;
          })}
          <Light sun={0.5} dim={0.9} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};
