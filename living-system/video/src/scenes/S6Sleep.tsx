// S6 明天記得睡覺（390–450）：燈全熄，只剩屋頂上的折折 → 「明天記得睡覺。」→ 眨眼 → 喀嚓：畫面被剪成兩半掉下去。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Deer } from "../chars";
import { Boil, C, Card, Cut, EXPO_IN, Stage, tw, twos } from "../paper";
import { City } from "./S5City";

const SNIP = 46;

const Night: React.FC<{ f: number }> = ({ f }) => {
  const q = twos(f);
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <AbsoluteFill style={{ opacity: tw(f, 0, 8, 1, 0) }}>
        <City f={58 + f} push={1} lightsOut={f > 2 ? 1 : 0} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: tw(f, 4, 10, 0, 1) }}>
        <Stage>
          <rect width={1080} height={1920} fill={C.black} />
          <Cut d="M-20,1320 L300,1320 L380,1240 L460,1320 L1100,1320 L1100,1980 L-20,1980Z" fill="#1d1b19" depth={2} />
          <Boil id="lastdeer" amp={0.7}>
            <Deer x={380} y={1240} s={0.9} wink={q >= 34 && q < 40} headTilt={tw(q, 28, 34, 0, 8)} />
          </Boil>
        </Stage>
      </AbsoluteFill>
      <Card lines={["明天記得睡覺。"]} x={540} y={720} size={78} who="折折" color="#1d1b19" ink={C.paper} show={tw(f, 10, 16, 0, 1)} from="none" />
    </AbsoluteFill>
  );
};

export const S6Sleep: React.FC = () => {
  const f = useCurrentFrame();
  if (f < SNIP) return <Night f={f} />;
  // 喀嚓：同一格畫面沿中線剪開，左右兩半往外、往下掉
  const t = tw(f, SNIP, SNIP + 9, 0, 1, EXPO_IN);
  const half = (side: -1 | 1) => (
    <AbsoluteFill
      style={{
        clipPath: side < 0 ? "polygon(0 0, 52% 0, 47% 100%, 0 100%)" : "polygon(52% 0, 100% 0, 100% 100%, 47% 100%)",
        transform: `translate(${side * t * 260}px, ${t * 900}px) rotate(${side * t * 14}deg)`,
        transformOrigin: side < 0 ? "0% 100%" : "100% 100%",
        opacity: 1 - t * 0.6,
      }}
    >
      <Night f={SNIP} />
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ background: C.black }}>
      {half(-1)}
      {half(1)}
    </AbsoluteFill>
  );
};
