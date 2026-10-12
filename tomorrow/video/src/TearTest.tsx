// 5 秒試拍：明天先生撕日曆（13 → 14 → 15），和 hf-shot/（HyperFrames）、FAL 三支 AI 影片同一個 prompt 比較。
// 時間表與 hf-shot/index.html 相同：0–26 午後 → 26–48 夜 → 48–76 第一個早晨（60 撕 13）→ 76–90 第二夜 → 90–120 第二個早晨（96 撕 14）。
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Boil, Cam, EXPO_OUT, IN_OUT, PaperDefs, Stage, clamp, popUp, twos } from "./paper";
import { Mister } from "./chars";
import { Cal, Dust, Light, Room } from "./room";

type Arm = readonly [number, number];
const REST: Arm = [-124, -98];
const GRIP: Arm = [160, -5];
const FLICK: Arm = [120, 150];
const PROUD: Arm = [-150, -50];
const mirror = (a: Arm): Arm => [180 - a[0], 180 - a[1]];

const at = (f: number, ks: [number, number][], easing = IN_OUT) =>
  interpolate(
    f,
    ks.map((k) => k[0]),
    ks.map((k) => k[1]),
    { ...clamp, easing },
  );
const pose = (f: number, ks: [number, Arm][]): Arm => [at(f, ks.map(([fr, p]) => [fr, p[0]])), at(f, ks.map(([fr, p]) => [fr, p[1]]))];

const TEARS = [
  { start: 60, old: "13", next: "14", land: [1200, 1000, -14] },
  { start: 96, old: "14", next: "15", land: [1176, 1022, 28] },
] as const;
const PILE0: [number, number, number, string][] = [
  [1210, 984, -38, "9"],
  [1168, 1010, 12, "10"],
  [1240, 1012, 26, "11"],
  [1192, 1000, -6, "12"],
];

export const TearTest: React.FC = () => {
  const frame = useCurrentFrame();
  const f = twos(frame); // 一拍兩格

  const sun = at(f, [[0, 1], [22, 1], [34, 0]]);
  const night = at(f, [[0, 0], [26, 0], [36, 1], [42, 1], [52, 0], [76, 0], [82, 0.85], [86, 0.85], [92, 0]]);
  const moon = at(f, [[0, 0], [30, 0], [38, 1], [42, 1], [50, 0], [78, 0], [83, 0.9], [86, 0.9], [90, 0]]);
  const dawn = at(f, [[0, 0], [44, 0], [54, 1], [72, 1], [80, 0], [88, 0], [96, 1], [120, 1]]);
  const sweep = at(f, [[0, -140], [30, 240], [48, -160], [74, 120], [90, -160], [120, 160]], (t) => t);
  const sky = night > 0.5 ? "#2B3A5A" : dawn > 0.3 ? "#FFD3A8" : "#F6E7C8";

  let date = "13";
  let pages = 10;
  let face: "smile" | "proud" = "smile";
  let tear: { k: number; date: string } | undefined;
  const pile = [...PILE0];
  for (const t of TEARS) {
    const k = (f - t.start) / 14;
    if (k >= 0) date = t.next;
    pages += 4 * popUp(f, t.start + 2, 10);
    if (k >= 0 && f < t.start + 28) face = "proud";
    if (k > 0 && k < 1) tear = { k, date: t.old };
    if (k >= 1) pile.push([t.land[0], t.land[1], t.land[2], t.old]);
  }
  if (f >= 112) face = "proud";

  const armL = pose(f, [
    [0, REST], [50, REST], [56, GRIP], [60, GRIP], [64, FLICK], [72, PROUD], [86, PROUD],
    [92, GRIP], [96, GRIP], [100, FLICK], [108, PROUD], [120, PROUD],
  ]);
  const armR = pose(f, [
    [0, mirror(REST)], [50, mirror(REST)], [56, mirror(GRIP)], [60, mirror(GRIP)], [66, mirror(PROUD)], [86, mirror(PROUD)],
    [92, mirror(GRIP)], [96, mirror(GRIP)], [102, mirror(PROUD)], [120, mirror(PROUD)],
  ]);
  // 挺胸：長高後橫向撐開一下
  const puff = Math.max(...TEARS.map((t) => at(f, [[t.start + 2, 0], [t.start + 8, 1], [t.start + 20, 1], [t.start + 26, 0]], EXPO_OUT)));

  return (
    <AbsoluteFill style={{ background: "#2a2522" }}>
      <PaperDefs />
      <Stage>
        <Cam cx={960} cy={540} z={1}>
          <g style={{ filter: "blur(2.4px)" }}>
            <Room sky={sky} />
          </g>
          {pile.map(([x, y, r, d], i) => (
            <Boil key={i} id={`pile${i}`} amp={0.6}>
              <Cal x={x} y={y} s={0.62} rot={r} text={d} />
            </Boil>
          ))}
          <Boil id="mister" amp={1.4}>
            <g transform={`translate(1440 912) scale(${1 + puff * 0.06} 1) translate(-1440 -912)`}>
              <Mister x={1440} y={1012} s={0.8} pages={pages} face={face} f={frame} date={date} armL={armL} armR={armR} tear={tear} />
            </g>
          </Boil>
          <Light sun={sun} moon={moon} night={night} dawn={dawn} sweep={sweep} />
          <Dust f={frame} k={Math.max(sun, dawn * 0.7)} />
        </Cam>
      </Stage>
      <Img src={staticFile("fiber.png")} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, mixBlendMode: "multiply", opacity: 0.32 }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(42,26,10,.30) 100%)" }} />
    </AbsoluteFill>
  );
};
