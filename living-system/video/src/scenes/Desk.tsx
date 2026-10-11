// 小沐的書桌：S1 結尾拉遠、S2 混亂、S3 凍結都用同一個房間。全部由 f（本地影格）決定。
import React from "react";
import { interpolate } from "remotion";
import { Puppet } from "../chars";
import { Boil, C, Card, Cut, SERIF, Stage, clamp, tw, twos } from "../paper";
import { Clock, Crumple, House, Moon, Sun, Train } from "../props";

/** 桌上那張紙城市設計圖（S1 的城市縮小攤平後的樣子）。 */
export const MiniCity: React.FC<{ smoke?: number; shake?: number }> = ({ smoke = 0, shake = 0 }) => (
  <g transform={`translate(${shake} 0)`}>
    <Cut d="M370,1380 L720,1366 L728,1600 L362,1612Z" fill="#fbf7f0" depth={2} />
    <House x={400} y={1530} w={56} h={70} roof={C.terra} cols={1} rows={1} depth={1} />
    <House x={480} y={1534} w={50} h={90} roof={C.green} cols={1} rows={2} depth={1} />
    <House x={556} y={1530} w={64} h={66} roof={C.root} cols={1} rows={1} depth={1} />
    <House x={640} y={1534} w={50} h={80} roof={C.gold} cols={1} rows={2} depth={1} />
    <path d="M370,1570 Q540,1550 724,1568" stroke={C.water} strokeWidth={18} fill="none" />
    <Train x={600} y={1560} s={0.28} smoke={smoke} tilt={smoke > 0 ? -6 : 0} />
  </g>
);

const PAPERS: [number, number, number][] = [
  [470, 1450, 1], [770, 1470, 2], [880, 1420, 3], [640, 1530, 4], [300, 1500, 5], [960, 1520, 6], [520, 1600, 7], [820, 1600, 8], [200, 1620, 9], [700, 1650, 10],
];

export const DeskRoom: React.FC<{ f: number; hideBall?: boolean }> = ({ f, hideBall }) => {
  const q = twos(f);
  // 時間加速：前 46 格窗外日夜每 6 格交替一次
  const day = q < 46 && Math.floor(q / 6) % 2 === 0;
  const working = q < 48;
  const crumple = tw(q, 48, 58, 0, 1);
  const wiggle = Math.floor(q / 4) % 2;
  const arms: [number, number] = working ? (wiggle ? [-55, -5] : [-35, 25]) : [-60 + 20 * crumple, -5 + 20 * crumple];
  const armsR: [number, number] = working ? (wiggle ? [235, 180] : [215, 160]) : [240 - 20 * crumple, 185 - 20 * crumple];
  const face = q < 20 ? "open" : q < 48 ? "tired" : "upset";
  const books = Math.min(6, 2 + Math.floor(q / 10));
  const nPapers = Math.max(0, Math.min(PAPERS.length, Math.floor((q - 4) / 6)));
  const smoke = tw(q, 38, 50, 0, 1);
  return (
    <>
      <Stage>
        <rect width={1080} height={1920} fill={C.wall} />
        {/* 窗：日夜交替 */}
        <rect x={140} y={200} width={400} height={480} fill={day ? "#CFE3EE" : C.midnight} />
        {day ? <Sun x={430} y={330} r={36} /> : <Moon x={430} y={320} r={40} />}
        <Cut d="M120,180 H560 V700 H120Z M140,200 H330 V430 H140Z M350,200 H540 V430 H350Z M140,450 H330 V680 H140Z M350,450 H540 V680 H350Z" fill="#fbf7f0" depth={2} evenodd />
        {/* 日曆 */}
        <g transform="translate(640 330) rotate(3)">
          <Cut d="M0,0 H330 V230 H0Z" fill="#fbf7f0" depth={2} />
          <Cut d="M0,0 H330 V54 H0Z" fill={C.terra} depth={1} />
          <text x={165} y={128} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={40} fill={C.ink}>
            創意節，
          </text>
          <text x={165} y={186} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={40} fill={C.terra}>
            倒數三天！
          </text>
        </g>
        <Clock x={250} y={800} t={f * 40} blur={f < 50} />
        <Boil id="mu">
          <Puppet x={560} y={1220} s={1.15} seated arms={arms} armsR={armsR} face={face} headTilt={q > 20 && q < 48 ? 8 : 0} />
        </Boil>
        <Cut d="M-20,1240 H1100 V1980 H-20Z" fill={C.desk} depth={3} />
        {/* 課本越堆越高 */}
        {[C.water, C.green, C.terra, C.gold, C.root, C.deep].slice(0, books).map((c, k) => (
          <Cut key={c} d={`M${120 + k * 4},${1350 - k * 52} H${360 - k * 10} V${1350 - (k + 1) * 52 + 6} H${120 + k * 4}Z`} fill={c} depth={2} />
        ))}
        <MiniCity smoke={smoke} shake={smoke > 0 && smoke < 1 ? (q % 4 === 0 ? 3 : -3) : 0} />
        {/* 揉掉的紙一張張掉下來 */}
        {PAPERS.slice(0, nPapers).map(([x, y, seed], k) => {
          const born = 4 + (k + 1) * 6;
          const yy = interpolate(q, [born, born + 4, born + 6], [y - 500, y + 8, y], clamp);
          return <Crumple key={seed} x={x} y={yy} s={0.55} seed={seed} />;
        })}
        {/* 快沒電的手機 */}
        <Cut d="M840,1290 H920 V1430 H840Z" fill={C.ink} depth={2} />
        <rect x={856} y={1308} width={48} height={16} rx={2} fill="none" stroke="#fff" strokeWidth={2} />
        {Math.floor(f / 8) % 2 === 0 ? <rect x={858} y={1310} width={8} height={12} fill="#E5484D" /> : null}
        <Cut d="M960,1330 h70 l-8,110 h-54Z" fill="#d9ecf2" depth={2} opacity={0.9} />
        {/* 手裡的紙團 */}
        {!hideBall && crumple > 0 ? <Crumple x={560} y={1040} s={0.75 * crumple} seed={11} /> : null}
      </Stage>
      <Card lines={["為什麼事情", "反而越來越亂？"]} x={540} y={1580} size={64} who="小沐" show={tw(f, 52, 58, 0, 1)} />
    </>
  );
};

export const BALL = { x: 560, y: 1040 };
