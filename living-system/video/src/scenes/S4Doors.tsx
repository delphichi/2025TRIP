// S4 五扇紙門（210–332）：門排立起 → 每 22 格一扇門放大成全畫面、像門一樣打開，露出那一站的小場景。
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Deer, Puppet } from "../chars";
import { Boil, C, Card, Cut, EXPO_OUT, IN_OUT, SERIF, Stage, circleD, clamp, popUp, tw, twos, wave } from "../paper";
import { Sapling, Sun, Train } from "../props";

export const STATIONS = [
  { ch: "本", text: "本：找到方向", color: C.root },
  { ch: "能", text: "能：盤點能力", color: C.green },
  { ch: "身", text: "身：照顧自己", color: C.terra },
  { ch: "脈", text: "脈：根據回饋調整", color: C.water },
  { ch: "留", text: "留：保留有用的成果", color: C.gold },
];
export const ROW_END = 12;
export const SLOT = 22;
const slotStart = (k: number) => ROW_END + k * SLOT;
const DOOR_X = (k: number) => 100 + k * 178;
const DOOR_Y = 1100;
const DW = 170;
const DH = 300;

const doorD = (x: number, y: number, w = DW, h = DH) => `M${x},${y} V${y - h + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${y - h + w / 2} V${y}Z`;

/** 門排：五扇門依序立起。 */
const DoorRow: React.FC<{ f: number }> = ({ f }) => {
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#E8DCC4" />
      <Cut d={wave(1230, 16, 6, 21)} fill={C.sand} depth={1} />
      {STATIONS.map((s, k) => {
        const r = popUp(f, k * 1.5, 6);
        if (r < 0.02) return null;
        return (
          <g key={s.ch} transform={`translate(0 ${DOOR_Y}) scale(1 ${Math.max(0.01, r)}) translate(0 ${-DOOR_Y})`}>
            <Cut d={doorD(DOOR_X(k), DOOR_Y)} fill={s.color} depth={3} />
            <text x={DOOR_X(k) + DW / 2} y={DOOR_Y - 90} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={84} fill={C.paper}>
              {s.ch}
            </text>
          </g>
        );
      })}
      <Boil id="rowmu">
        <Puppet x={300} y={1640} s={0.8} arms={[-110, -95]} face="open" />
      </Boil>
      <Boil id="rowdeer">
        <Deer x={560} y={1640} s={0.9} />
      </Boil>
    </Stage>
  );
};

// ── 五站的小場景（v = 這一站的本地影格）─────────────────────
const V0Ben: React.FC<{ v: number }> = ({ v }) => {
  const q = twos(v);
  const fold = tw(q, 12, 20, 1, 0); // 左右兩條路摺起來消失
  const needle = 540 * (1 - EXPO_OUT(Math.min(1, q / 12))) - 30 * Math.sin(q * 0.9) * tw(q, 0, 12, 1, 0);
  const road = (x: number) => `M470,1720 L610,1720 L${x + 50},1000 L${x - 50},1000Z`;
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#EFE3CB" />
      <g transform="translate(0 1720)">
        <g transform={`scale(1 ${fold}) translate(0 -1720)`} opacity={fold}>
          <Cut d={road(220)} fill={C.sand} depth={1} />
          <Cut d={road(860)} fill={C.sand} depth={1} />
          {/* 城堡、摩天輪 */}
          <Cut d="M140,1000 V840 H170 V800 H200 V840 H240 V800 H270 V840 H300 V1000Z" fill={C.terra} depth={2} />
          <Cut d={`${circleD(860, 880, 110)} ${circleD(860, 880, 90)}`} fill={C.gold} depth={2} evenodd />
        </g>
      </g>
      <Cut d={road(540)} fill={tw(q, 12, 20, 0, 1) > 0.5 ? "#F7EFDF" : C.sand} depth={2} />
      {/* 火車站 */}
      <Cut d="M460,1000 V860 H620 V1000Z M450,866 L540,800 L630,866Z" fill={C.green} depth={2} />
      {/* 指南針：轉幾圈後停在中間那條路 */}
      <g transform="translate(540 1460)">
        <Cut d={circleD(0, 0, 110)} fill="#fbf7f0" depth={3} />
        <g transform={`rotate(${needle})`}>
          <path d="M0,-90 L22,0 L0,90 L-22,0Z" fill={C.terra} />
          <path d="M0,0 L22,0 L0,90 L-22,0Z" fill="#8a8a8a" />
        </g>
        <circle r={10} fill={C.brad} />
      </g>
    </Stage>
  );
};

const V1Neng: React.FC<{ v: number }> = ({ v }) => {
  const q = twos(v);
  const w = Math.floor(q / 4) % 2;
  const gear = (cx: number, cy: number, r: number, n: number, rot: number) => {
    const pts: string[] = [];
    for (let k = 0; k < n; k++) {
      const a0 = (2 * Math.PI * k) / n + (rot * Math.PI) / 180;
      const hw = Math.PI / n;
      for (const [a, rr] of [
        [a0 - hw * 0.55, r * 0.82],
        [a0 - hw * 0.32, r],
        [a0 + hw * 0.32, r],
        [a0 + hw * 0.55, r * 0.82],
      ])
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join(" L")}Z ${circleD(cx, cy, r * 0.3)}`;
  };
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#E5EADB" />
      <Cut d={gear(380, 760, 130, 10, q * 6)} fill={C.gold} depth={2} evenodd />
      <Cut d={gear(640, 860, 100, 8, -q * 7.5 + 10)} fill={C.terra} depth={2} evenodd />
      <Cut d="M-20,1500 H1100 V1980 H-20Z" fill={C.desk} depth={3} />
      <Boil id="azhe">
        <Puppet x={230} y={1500} s={0.85} arms={w ? [-40, 10] : [-20, 30]} face="smile" sweater={C.water} hair="short" pencil={false} />
      </Boil>
      <Boil id="mu2">
        <Puppet x={540} y={1500} s={0.85} arms={w ? [120, 100] : [-20, 40]} armsR={w ? [-20, 40] : [60, 80]} face="smile" />
      </Boil>
      <Boil id="anan">
        <Puppet x={850} y={1500} s={0.85} arms={w ? [-30, 40] : [-50, 0]} face="smile" sweater="#9DB592" hair="pony" pencil={false} />
      </Boil>
    </Stage>
  );
};

const V2Shen: React.FC<{ v: number }> = ({ v }) => {
  const q = twos(v);
  const lit = Math.max(0, Math.min(4, Math.floor((q - 4) / 4) + 1));
  const up = tw(q, 0, 10, 0, 1);
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#F2E6CF" />
      <Sun x={800} y={tw(v, 0, 22, 720, 540)} r={62} />
      <Cut d="M380,860 H680 V1080 H380Z M680,930 H710 V1010 H680Z" fill="#fbf7f0" depth={3} />
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={402 + k * 68} y={884} width={54} height={172} rx={6} fill={k < lit ? C.light : "#d8cdb8"} />
      ))}
      <Boil id="mu3">
        <Puppet x={540} y={1640} s={1.0} arms={[-110 + 225 * up, -95 + 195 * up]} face={up > 0.5 ? "smile" : "tired"} />
      </Boil>
    </Stage>
  );
};

const Mark: React.FC<{ x: number; ok: boolean; show: number; label: string }> = ({ x, ok, show, label }) =>
  show <= 0 ? null : (
    <g transform={`translate(${x} 700) scale(${show}) rotate(${ok ? 4 : -5})`}>
      <Cut d="M-90,-60 H90 V60 H-90Z" fill={ok ? C.green : "#8a8a8a"} depth={2} />
      <text x={-40} y={24} textAnchor="middle" fontFamily="Liberation Sans, sans-serif" fontWeight={700} fontSize={64} fill="#fff">
        {label}
      </text>
      <path d={ok ? "M10,0 l18,22 l38,-46" : "M14,-22 l44,44 M58,-22 l-44,44"} stroke="#fff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );

const V3Mai: React.FC<{ v: number }> = ({ v }) => {
  const q = twos(v);
  const back = q >= 3 && q < 7 ? -40 : 0;
  const tip = q >= 7 && q < 11 ? -14 : 0;
  const go = tw(v, 11, 22, 0, 1, IN_OUT);
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#DCE8EE" />
      <Cut d={wave(1500, 30, 5, 31)} fill={C.water} depth={2} />
      <Cut d={wave(1600, 20, 5, 32)} fill="#3F6B90" depth={3} />
      <Cut d="M-20,1240 Q540,1140 1100,1240 L1100,1290 Q540,1190 -20,1290Z" fill={C.root} depth={2} />
      <Train x={440 + back + go * 560} y={1205} s={1} tilt={tip} />
      <Mark x={230} ok={false} label="1" show={popUp(q, 3, 4)} />
      <Mark x={540} ok={false} label="2" show={popUp(q, 7, 4)} />
      <Mark x={850} ok label="3" show={popUp(q, 11, 4)} />
    </Stage>
  );
};

const V4Liu: React.FC<{ v: number }> = ({ v }) => {
  const q = twos(v);
  const seedY = interpolate(q, [2, 7, 9], [900, 1395, 1380], clamp);
  return (
    <Stage>
      <rect width={1080} height={1920} fill="#EFE6CF" />
      {/* 檔案夾收進盒子 */}
      {[C.root, C.green, C.water].map((c, k) => (
        <Cut key={c} d={`M${720 + k * 26},${tw(q, k * 2, k * 2 + 6, 700, 1180)} h120 v170 h-120Z`} fill={c} depth={2} />
      ))}
      <Cut d="M700,1220 H930 V1380 H700Z" fill="#c9a06a" depth={3} />
      <Cut d={wave(1400, 18, 5, 51)} fill="#B0855E" depth={3} />
      <Cut d={wave(1520, 18, 5, 52)} fill="#94694A" depth={4} />
      {q < 9 ? <Cut d={circleD(380, seedY, 24)} fill={C.gold} depth={3} /> : null}
      <Sapling x={380} y={1400} grow={tw(v, 8, 22, 0, 1)} h={460} />
    </Stage>
  );
};

const VIGNETTES = [V0Ben, V1Neng, V2Shen, V3Mai, V4Liu];

/** 門板：從小門放大到全畫面，再以左緣為鉸鏈打開。 */
const DoorWipe: React.FC<{ k: number; s: number }> = ({ k, s }) => {
  const grow = tw(s, 0, 4, 0, 1, IN_OUT);
  const open = tw(s, 3, 9, 0, 1, IN_OUT);
  if (open >= 1) return null;
  const x = interpolate(grow, [0, 1], [DOOR_X(k), 0]);
  const y = interpolate(grow, [0, 1], [DOOR_Y - DH, 0]);
  const w = interpolate(grow, [0, 1], [DW, 1080]);
  const h = interpolate(grow, [0, 1], [DH, 1920]);
  const st = STATIONS[k];
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          background: st.color,
          transformOrigin: "0% 50%",
          transform: `rotateY(${-open * 88}deg)`,
          boxShadow: `${20 + open * 60}px 20px 50px rgba(30,20,10,${0.35 + open * 0.2})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: 120 + grow * 380,
          color: C.paper,
          overflow: "hidden",
        }}
      >
        {st.ch}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,${open * 0.35}))` }} />
      </div>
    </AbsoluteFill>
  );
};

export const S4Doors: React.FC = () => {
  const f = useCurrentFrame();
  // 目前在第幾站
  let k = -1;
  for (let i = 0; i < 5; i++) if (f >= slotStart(i)) k = i;
  const s = k >= 0 ? f - slotStart(k) : 0;
  const prev = k - 1;
  const V = k >= 0 ? VIGNETTES[k] : null;
  return (
    <AbsoluteFill style={{ background: C.black }}>
      {/* 門板還沒打開前，底下顯示上一站（或門排） */}
      {k < 0 || s < 3 ? (prev >= 0 ? React.createElement(VIGNETTES[prev], { v: SLOT + s }) : <DoorRow f={f} />) : null}
      {V && s >= 3 ? <V v={s} /> : null}
      {k >= 0 ? <DoorWipe k={k} s={s} /> : null}
      {k >= 0 ? (
        <Card lines={[STATIONS[k].text]} x={540} y={200} size={78} color={STATIONS[k].color} ink={C.paper} show={tw(s, 5, 10, 0, 1)} from="top" />
      ) : null}
    </AbsoluteFill>
  );
};
