// 第四幕：S8 數學：第一題（48–55）、S9 第一題（55–64）、S10 不用交給我了（64–70）
import React from "react";
import { AbsoluteFill, interpolate, random } from "remotion";
import { C, Cam, Cut, EXPO_OUT, IN_OUT, PopLines, SERIF, Stage, W, H, camAt, clamp, handheld, lerp, popUp, tw, twos } from "../paper";
import { Mister, POSE, Zhe } from "../chars";
import { Light, Mountain, Note, Plane, Room } from "../room";
import { Pencil, Written, useClock, writeX } from "./common";
import { speaking } from "../subs";

const NIGHT_SKY = "#2B3A5A";

// ── S8 ────────────────────────────────────────────────────────
export const S8: React.FC = () => {
  const { f, at } = useClock(48);
  const q = twos(f);
  if (f < 60) {
    // 近景：坐在紙山裡，撿起角落那張紙條
    const reach = tw(q, at(48.4), at(49.0), 0, 1, IN_OUT) * (1 - tw(q, at(49.2), at(49.9), 0, 1, IN_OUT));
    const has = q >= at(49.2);
    const noteY = has ? lerp(660, 580, tw(q, at(49.2), at(49.9), 0, 1)) : 660;
    const noteX = has ? lerp(830, 760, tw(q, at(49.2), at(49.9), 0, 1)) : 830;
    const cam = camAt(f, [{ f: 0, cx: 780, cy: 520, z: 2.6 }, { f: 60, cx: 780, cy: 540, z: 2.85 }]);
    const hh = handheld(f, 0.5);
    return (
      <AbsoluteFill>
        <Stage>
          <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
            <Room sky={NIGHT_SKY} />
            <Mountain level={0.6} />
            <Zhe x={760} y={680} s={1} seated face={has ? "open" : "tired"} f={f} tilt={lerp(0, 14, reach)} arms={[lerp(-60, -100, reach), lerp(-10, -80, reach)]} armsR={[lerp(240, 300, reach), lerp(190, 300, reach)]} />
            <Note x={noteX} y={noteY} rot={has ? -8 : 20} s={1} />
            {!has ? <circle cx={830} cy={660} r={50} fill="#FFF4D8" opacity={0.18 + 0.1 * Math.sin(f / 4)} style={{ mixBlendMode: "screen" }} /> : null}
            <Light night={1} moon={1} />
          </Cam>
        </Stage>
      </AbsoluteFill>
    );
  }
  // 特寫：雙手攤平紙條；52.5 秒檯燈「喀」一聲亮起
  const flat = interpolate(q, [at(50.7), at(52.0)], [0, 1], { ...clamp, easing: EXPO_OUT });
  const lamp = tw(f, at(52.5), at(52.5) + 5, 0, 1);
  const sx = lerp(0.55, 1, flat);
  const handX = 470 * sx;
  const wob = (1 - flat) * 26;
  const paper = `M${960 - 400 * sx},${500 + wob} L${960 - 120 * sx},${520 - wob} L${960 + 160 * sx},${505 + wob} L${960 + 400 * sx},${520 - wob} L${960 + 410 * sx},${900 + wob} L${960 + 100 * sx},${880 - wob} L${960 - 200 * sx},${895 + wob} L${960 - 390 * sx},${880}Z`;
  const z = interpolate(f, [60, 168], [1, 1.08], clamp);
  return (
    <AbsoluteFill>
      <Stage>
        <g transform={`translate(960 600) scale(${z}) translate(-960 -600)`}>
          <rect width={W} height={H} fill={C.wall} />
          <Mountain level={0.6} />
          <rect width={W} height={H} fill="#1d2a45" style={{ mixBlendMode: "multiply" }} opacity={0.72 - lamp * 0.25} />
          <ellipse cx={960} cy={640} rx={760} ry={460} fill="url(#lamp)" style={{ mixBlendMode: "screen" }} opacity={0.12 + lamp * 0.5} />
          <path d={`M300,1180 L${960 - handX},760`} stroke={C.hoodie} strokeWidth={120} strokeLinecap="round" filter="url(#d4)" />
          <path d={`M1620,1180 L${960 + handX},760`} stroke={C.hoodie} strokeWidth={120} strokeLinecap="round" filter="url(#d4)" />
          <Cut d={paper} fill={C.note} depth={3} />
          {["M600,560 L820,700 L760,880", "M1320,540 L1100,660 L1180,890", "M700,520 L960,600 L1240,520", "M640,700 L900,760 L1300,700"].map((d, i) => (
            <path key={i} d={d} transform={`translate(960 0) scale(${sx} 1) translate(-960 0)`} fill="none" stroke={C.ink} strokeOpacity={0.1 + (1 - flat) * 0.25} strokeWidth={3} />
          ))}
          <text x={965} y={740} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={110} fill={C.ink} opacity={0.15 + flat * 0.85} transform={`translate(960 0) scale(${sx} 1) translate(-960 0)`}>
            數學：第一題
          </text>
          <Cut d={`M${960 - handX - 64},700 a64,64 0 1 0 128,0 a64,64 0 1 0 -128,0Z`} fill={C.skin} depth={4} />
          <Cut d={`M${960 + handX - 64},700 a64,64 0 1 0 128,0 a64,64 0 1 0 -128,0Z`} fill={C.skin} depth={4} />
          <ellipse cx={960} cy={700} rx={520} ry={300} fill="#FFD58A" style={{ mixBlendMode: "soft-light" }} opacity={lamp * 0.6} />
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S9：俯拍特寫，9 秒不切 ─────────────────────────────────────
const L1 = { x: 620, y: 420, t1: "3x = 1", t2: "4", t3: "5" };
export const S9: React.FC = () => {
  const { f, at } = useClock(55);
  const q = twos(f);
  const k1 = interpolate(q, [at(55.6), at(56.9)], [0, 1], clamp);
  const k2 = interpolate(q, [at(56.9), at(57.2)], [0, 1], clamp);
  const erase = interpolate(q, [at(57.7), at(58.3)], [0, 1], clamp);
  const k3 = interpolate(q, [at(58.5), at(58.9)], [0, 1], clamp);
  const k4 = interpolate(q, [at(59.3), at(60.6)], [0, 1], clamp);
  const ding = at(61.5);
  const glow = tw(f, ding, ding + 6, 0, 1);
  const size = 50;
  const x4 = writeX(L1.x, L1.t1, size, 1);
  // 筆尖位置
  let px = L1.x;
  let py = L1.y;
  if (q < at(55.6)) [px, py] = [L1.x - 40, L1.y - 60];
  else if (q < at(56.9)) px = writeX(L1.x, L1.t1, size, k1);
  else if (q < at(57.2)) px = writeX(x4, L1.t2, size, k2);
  else if (q < at(57.7)) [px, py] = [x4 + 50, L1.y - 30];
  else if (q < at(58.5)) [px, py] = [x4 + 14 + Math.sin(q * 1.7) * 12, L1.y - 20];
  else if (q < at(59.0)) px = writeX(x4, L1.t3, size, k3);
  else if (q < at(59.3)) [px, py] = [L1.x, 500];
  else if (q < at(60.7)) [px, py] = [writeX(L1.x, "x = 5", size, k4), 500];
  else [px, py] = [800, 560];
  const writing = (q >= at(55.6) && q < at(57.2)) || (q >= at(58.5) && q < at(59.0)) || (q >= at(59.3) && q < at(60.6));
  const bob = writing ? (q % 4 === 0 ? -6 : 0) : 0;
  const erasing = q >= at(57.7) && q < at(58.5);
  const z = interpolate(f, [0, 216], [1, 1.12], { ...clamp, easing: IN_OUT });
  return (
    <AbsoluteFill>
      <Stage bg={C.wood}>
        <g transform={`translate(960 520) scale(${z}) translate(-960 -520)`}>
          <rect width={W} height={H} fill={C.wood} />
          <Cut d="M440,200 H1480 V960 H440Z" fill={C.paper} depth={3} />
          {Array.from({ length: 8 }, (_, k) => (
            <path key={k} d={`M520,${360 + k * 70} H1420`} stroke={C.ink} strokeOpacity={0.18} strokeWidth={3} />
          ))}
          <text x={540} y={330} fontFamily={SERIF} fontWeight={900} fontSize={54} fill={C.ink}>
            1.
          </text>
          <text x={620} y={330} fontFamily={SERIF} fontWeight={900} fontSize={54} fill={C.ink}>
            3x + 5 = 20
          </text>
          <Written id="w1" x={L1.x} y={L1.y} text={L1.t1} size={size} k={k1} color="#555" />
          <Written id="w2" x={x4} y={L1.y} text={L1.t2} size={size} k={k2 * (1 - erase)} color="#555" />
          <Written id="w3" x={x4} y={L1.y} text={L1.t3} size={size} k={k3} color="#555" />
          <Written id="w4" x={L1.x} y={500} text="x = 5" size={size} k={k4} color="#555" />
          {erase > 0
            ? Array.from({ length: 7 }, (_, i) => (
                <ellipse key={i} cx={x4 + 20 + (random(`cr${i}`) - 0.3) * 120} cy={L1.y + 30 + random(`cy${i}`) * 50} rx={6} ry={3} fill="#E79A9A" opacity={Math.min(1, erase * 2)} />
              ))
            : null}
          {erasing ? <Pencil x={px + 452 * Math.cos((-38 * Math.PI) / 180)} y={py + 452 * Math.sin((-38 * Math.PI) / 180)} rot={142} /> : <Pencil x={px} y={py + bob} />}
          {/* 小紙燈：叮！ */}
          <g transform="translate(1600 180)">
            <Cut d="M-50,0 L50,0 L30,-60 L-30,-60Z" fill={glow > 0 ? "#FFE9B0" : C.paper} depth={3} />
          </g>
          <ellipse cx={1600} cy={200} rx={360} ry={260} fill="url(#lamp)" style={{ mixBlendMode: "screen" }} opacity={0.35 + glow * 0.65} />
          {glow > 0 ? (
            <>
              <text x={1640} y={120} fontFamily={SERIF} fontWeight={900} fontSize={64} fill={C.ink} transform={`translate(1700 100) scale(${popUp(f, ding, 8)}) translate(-1700 -100)`}>
                叮！
              </text>
              <PopLines x={1600} y={150} r={90} k={tw(f, ding, ding + 3, 0, 1) * tw(f, ding + 6, ding + 12, 1, 0)} />
            </>
          ) : null}
          <rect width={W} height={H} fill="#2a2016" style={{ mixBlendMode: "multiply" }} opacity={0.22} />
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S10 ───────────────────────────────────────────────────────
export const S10: React.FC = () => {
  const { f, sec, at } = useClock(64);
  const q = twos(f);
  const close = f < 60;
  // 日曆從明天先生身上剝下、摺成紙飛機、滑向小哲
  const P0 = at(67.0);
  const fold = interpolate(q, [P0 + 6, P0 + 14], [0, 1], clamp);
  const glide = interpolate(q, [P0 + 14, at(69.2)], [0, 1], { ...clamp, easing: IN_OUT });
  const px = q < P0 + 14 ? lerp(1300, 1240, tw(q, P0, P0 + 14, 0, 1)) : lerp(1240, 760, glide);
  const py = q < P0 + 14 ? lerp(640, 520, tw(q, P0, P0 + 14, 0, 1)) : lerp(520, 800, glide) - Math.sin(glide * Math.PI) * 120;
  const prot = q < P0 + 14 ? 0 : lerp(-20, 15, glide);
  const shrink = q >= at(68.8) ? interpolate(q, [at(68.8), at(68.8) + 4, at(68.8) + 8], [22, 16.5, 18], clamp) : 22;
  const cam = close
    ? camAt(f, [{ f: 0, cx: 620, cy: 640, z: 2.8 }, { f: 60, cx: 630, cy: 640, z: 3.0 }])
    : camAt(f, [{ f: 60, cx: 980, cy: 560, z: 1.35 }, { f: 144, cx: 980, cy: 580, z: 1.3 }]);
  const hh = handheld(f, 0.6);
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <Room sky={NIGHT_SKY} lampOn={1} />
          <Mountain level={0.6} />
          <Zhe x={640} y={900} s={1} seated face="smile" talk={speaking("小哲", sec)} f={f} arms={POSE.sit} tilt={close ? -4 : 6} />
          <Mister x={1300} y={960} s={1.1} pages={shrink} face="soft" talk={speaking("明天先生", sec)} f={f} armR={[50, 74]} date="16" />
          {q >= P0 ? <Plane x={px} y={py} s={1.1} rot={prot} k={fold} flip /> : null}
          <Light night={0.85} moon={0.5} lamp={0.75} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

