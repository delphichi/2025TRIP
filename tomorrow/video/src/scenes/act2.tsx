// 第二幕：S3 日曆站起來（15–21 秒）、S4 明天先生（21–31 秒）
import React from "react";
import { AbsoluteFill, interpolate, random } from "remotion";
import { C, Cam, EXPO_OUT, Stage, camAt, clamp, handheld, tw, twos } from "../paper";
import { Mister, Zhe } from "../chars";
import { Cal, FloorCals, Light, Room } from "../room";
import { BedLying, useClock } from "./common";
import { speaking } from "../subs";

const NIGHT_SKY = "#2B3A5A";

// ── S3 ────────────────────────────────────────────────────────
export const S3: React.FC = () => {
  const { f, at } = useClock(15);
  const q = twos(f);
  const wide = f < 48;
  // 桌上那張日曆在抖，16.6 秒跳下桌
  const shake = q > 14 && q < 40 ? (random(`sh${q}`) - 0.5) * 8 : 0;
  const hop = tw(q, 40, 48, 0, 1, EXPO_OUT);
  const calX = 720 + hop * 280;
  const calY = 598 - Math.sin(hop * Math.PI) * 160 + hop * 360;
  // 組裝：17.2–20.3 秒，一拍兩格
  const asm = interpolate(q, [at(17.2), at(20.3)], [0, 1], clamp);
  const settle = q >= at(20.3) ? Math.sin(Math.min(1, (q - at(20.3)) / 8) * Math.PI) * 8 : 0;
  const cam = wide
    ? camAt(f, [{ f: 0, cx: 960, cy: 540, z: 1.0 }, { f: 48, cx: 980, cy: 560, z: 1.08 }])
    : camAt(f, [{ f: 48, cx: 1060, cy: 820, z: 2.1 }, { f: at(19.6), cx: 1075, cy: 700, z: 1.75 }, { f: 144, cx: 1080, cy: 650, z: 1.6 }]);
  const hh = handheld(f, 0.6);
  const floorN = Math.round(12 - 6 * Math.min(1, asm * 1.6));
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <Room books={false} sky={NIGHT_SKY} />
          <FloorCals n={floorN} />
          <BedLying face="sleep" f={f} breathe={Math.sin(f / 18) * 3} />
          {wide ? <Cal x={calX} y={calY} s={1.0} rot={-4 + shake + hop * 30} depth={hop > 0 ? 4 : 2} /> : null}
          {!wide ? <Mister x={1080} y={1000 - settle} s={1.25} pages={14} asm={asm} hat face="smile" /> : null}
          <Light night={1} moon={1} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

// ── S4 ────────────────────────────────────────────────────────
/** 長高：說一次「明天」，頁數往上加（帶一點過衝）。 */
const grow = (q: number, at: number, from: number, to: number) => interpolate(q, [at, at + 4, at + 8], [from, to + (to - from) * 0.25, to], clamp);

export const S4: React.FC = () => {
  const { f, sec, at } = useClock(21);
  const q = twos(f);
  const cut = f < 72 ? 0 : f < 156 ? 1 : 2;
  const pages = cut < 2 ? 14 : q < at(29.0) ? 14 : q < at(30.2) ? grow(q, at(29.0), 14, 22) : grow(q, at(30.2), 22, 26);
  const open = cut === 1 ? interpolate(q, [at(24.6), at(26.6)], [0, 1], clamp) : 0;
  const misterTalk = speaking("明天先生", sec);
  const zheTalk = speaking("小哲", sec);
  const growing = (q >= at(29.0) && q < at(29.0) + 10) || (q >= at(30.2) && q < at(30.2) + 10);
  const cam =
    cut === 0 ? camAt(f, [{ f: 0, cx: 820, cy: 640, z: 1.45 }, { f: 72, cx: 840, cy: 630, z: 1.5 }])
    : cut === 1 ? camAt(f, [{ f: 72, cx: 1150, cy: 770, z: 3.0 }, { f: 156, cx: 1160, cy: 760, z: 3.25 }])
    : camAt(f, [{ f: 156, cx: 860, cy: 600, z: 1.3 }, { f: at(29.0), cx: 860, cy: 600, z: 1.3 }, { f: at(30.0), cx: 900, cy: 500, z: 1.2 }, { f: 240, cx: 900, cy: 470, z: 1.15 }]);
  const hh = handheld(f, 0.7);
  const armR: [number, number] | undefined = cut === 2 && q >= at(29.0) ? [50, 74] : cut === 1 ? [-8, 18] : undefined;
  return (
    <AbsoluteFill>
      <Stage>
        <Cam cx={cam.cx + hh.x / cam.z} cy={cam.cy + hh.y / cam.z} z={cam.z}>
          <Room sky={NIGHT_SKY} />
          <FloorCals n={6} />
          <Zhe
            x={560}
            y={990}
            s={1.05}
            face={cut === 2 && q >= at(29.0) ? "shock" : cut === 2 ? "open" : "shock"}
            talk={zheTalk}
            f={f}
            arms={cut === 2 && q < at(29.0) ? [-60, 30] : undefined}
            tilt={cut === 2 && q >= at(29.0) ? -8 : 0}
          />
          <Mister x={1080} y={1000} s={1.25} pages={pages} open={open} armR={armR} face={cut === 2 && q >= at(29.0) ? "proud" : "smile"} talk={misterTalk} f={f} bend={cut === 0 ? -6 : 0} />
          {growing
            ? [-130, 130, -170, 170].map((dx, i) => {
                const g0 = q >= at(30.2) ? at(30.2) : at(29.0);
                const k = (q - g0) / 10;
                const yy = 1000 - 1.25 * (100 + 60 + pages * 12 + 120) + 40 - k * 120;
                return <path key={i} d={`M${1080 + dx},${yy + i * 30} v-60`} stroke={C.paper} strokeWidth={8} strokeLinecap="round" opacity={1 - k} />;
              })
            : null}
          <Light night={1} moon={1} />
        </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

