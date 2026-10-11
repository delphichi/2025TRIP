// S1 剪出一座城市（0–54）：白紙展開 → 剪刀沿屋頂線剪 → 房子立起、亮燈 → 拉遠成桌上的設計圖。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Boil, C, Cut, EXPO_IN, IN_OUT, Stage, popUp, tw, twos, wave } from "../paper";
import { House, Scissors, Train } from "../props";
import { DeskRoom } from "./Desk";

const ROOF: [number, number][] = [
  [180, 1100], [180, 980], [300, 980], [300, 900], [390, 850], [480, 900], [480, 1010], [600, 1010], [600, 880], [690, 830], [780, 880], [780, 960], [900, 960], [900, 1100],
];
const SEG = ROOF.slice(1).map((p, k) => Math.hypot(p[0] - ROOF[k][0], p[1] - ROOF[k][1]));
const TOTAL = SEG.reduce((a, b) => a + b, 0);
const along = (d: number): [number, number, number] => {
  let acc = 0;
  for (let k = 0; k < SEG.length; k++) {
    if (d <= acc + SEG[k] || k === SEG.length - 1) {
      const t = Math.min(1, (d - acc) / SEG[k]);
      const [ax, ay] = ROOF[k];
      const [bx, by] = ROOF[k + 1];
      return [ax + (bx - ax) * t, ay + (by - ay) * t, (Math.atan2(by - ay, bx - ax) * 180) / Math.PI];
    }
    acc += SEG[k];
  }
  return [...ROOF[ROOF.length - 1], 0] as [number, number, number];
};
const cutPath = (d: number) => {
  const pts: [number, number][] = [ROOF[0]];
  let acc = 0;
  for (let k = 0; k < SEG.length && acc < d; k++) {
    acc += SEG[k];
    if (acc <= d) pts.push(ROOF[k + 1]);
  }
  const [x, y] = along(d);
  pts.push([x, y]);
  return "M" + pts.map((p) => p.join(",")).join(" L");
};

const HOUSES = [
  { x: 190, w: 110, h: 200, roof: C.terra, cols: 2, rows: 3 },
  { x: 330, w: 120, h: 250, roof: C.green, cols: 2, rows: 4 },
  { x: 490, w: 110, h: 190, roof: C.root, cols: 2, rows: 3 },
  { x: 630, w: 130, h: 240, roof: C.gold, cols: 2, rows: 4 },
  { x: 790, w: 100, h: 210, roof: C.water, cols: 2, rows: 3 },
];

export const S1Cut: React.FC = () => {
  const f = useCurrentFrame();
  const q = twos(f);
  const unfold = tw(f, 0, 9, 0.03, 1);
  const cutD = tw(q, 8, 30, 0, TOTAL, IN_OUT);
  const [sx, sy, sa] = along(cutD);
  const snip = 4 + 22 * Math.abs(Math.sin((Math.PI * Math.max(0, q - 8)) / 6));
  const scissorsOut = tw(f, 28, 36, 0, 700, EXPO_IN);
  // 拉遠：整張紙縮成桌上的設計圖
  const pull = tw(f, 44, 54, 0, 1, IN_OUT);
  const s = 1 - pull * (1 - 0.43);
  const tx = (545 - 560) * pull;
  const ty = (1490 - 1020) * pull;
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <AbsoluteFill style={{ opacity: pull }}>
        <DeskRoom f={0} />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "560px 1020px" }}>
        <Stage>
          <g transform={`translate(0 1020) scale(1 ${unfold}) translate(0 -1020)`}>
            <Cut d="M140,640 L960,600 L980,1400 L120,1420Z" fill="#fbf7f0" depth={3} />
            {unfold < 1 ? <path d="M130,1020 L970,1000" stroke={C.ink} strokeOpacity={0.15 * (1 - unfold)} strokeWidth={4} /> : null}
          </g>
          {/* 剪過的線 */}
          {q >= 8 && q < 36 ? <path d={cutPath(cutD)} fill="none" stroke={C.ink} strokeWidth={4} strokeOpacity={0.55} /> : null}
          {/* 立起來的城市：河流只在紙張範圍內 */}
          <clipPath id="sheet">
            <path d="M140,640 L960,600 L980,1400 L120,1420Z" />
          </clipPath>
          <g clipPath="url(#sheet)">
            <Cut d={wave(1270, 18, 5, 8, 100, 1000)} fill={C.water} depth={2} opacity={tw(f, 30, 36, 0, 1)} />
          </g>
          {HOUSES.map((h, k) => (
            <Boil key={k} id={`h${k}`} amp={0.6}>
              <House x={h.x} y={1240} w={h.w} h={h.h} roof={h.roof} cols={h.cols} rows={h.rows} rise={popUp(q, 28 + k * 3, 8)} lit={Math.max(0, Math.floor((q - 38 - k * 2) / 2))} />
            </Boil>
          ))}
          {f >= 38 ? <Train x={tw(f, 38, 54, 1050, 620)} y={1330} s={0.75} /> : null}
          {f < 40 ? (
            <g transform={`translate(${scissorsOut} 0)`}>
              {/* 刀刃朝前進方向，交叉點落在剪線上 */}
              <Scissors x={sx - 54 * Math.cos((sa * Math.PI) / 180)} y={sy - 54 * Math.sin((sa * Math.PI) / 180)} ang={sa} open={snip} s={0.9} />
            </g>
          ) : null}
        </Stage>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
