// S3 折折登場（126–210）：喀嚓凍結 → 紙團動兩下 → 推進紙團 → 紙鹿探頭、鹿角彈出 → 兩張對白卡。
import React from "react";
import { AbsoluteFill, Freeze, interpolate, useCurrentFrame } from "remotion";
import { Deer } from "../chars";
import { Boil, C, Card, Cut, EXPO_IN, Stage, clamp, popUp, tw, twos } from "../paper";
import { Crumple } from "../props";
import { BALL, DeskRoom } from "./Desk";

const FROZEN = 71; // S2 最後一格

export const S3Deer: React.FC = () => {
  const f = useCurrentFrame();
  const q = twos(f);
  const jiggle = (t: number) => (q >= t && q < t + 4 ? (q - t < 2 ? -6 : 6) : 0);
  const push = tw(f, 14, 24, 1, 5, EXPO_IN);
  const head = popUp(q, 26, 10);
  const antler = interpolate(q, [32, 35, 38, 41], [0, 1.25, 0.92, 1], clamp);
  const blink = q >= 60 && q < 64;
  return (
    <AbsoluteFill style={{ background: C.wall }}>
      {f < 24 ? (
        <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${BALL.x}px ${BALL.y}px`, filter: "saturate(.55) brightness(.92)" }}>
          <Freeze frame={FROZEN}>
            <DeskRoom f={FROZEN} hideBall />
          </Freeze>
          <Stage>
            <g transform={`rotate(${jiggle(6) + jiggle(11)} ${BALL.x} ${BALL.y})`}>
              <Crumple x={BALL.x} y={BALL.y} s={0.75} seed={11} />
            </g>
          </Stage>
          {/* 喀嚓：兩格白閃 */}
          <AbsoluteFill style={{ background: "#fff", opacity: f < 2 ? 0.55 : 0 }} />
          <AbsoluteFill style={{ background: "radial-gradient(circle at 52% 54%, rgba(0,0,0,0) 30%, rgba(30,20,10,.45) 100%)" }} />
        </AbsoluteFill>
      ) : null}
      {f >= 20 ? (
        <AbsoluteFill style={{ opacity: tw(f, 20, 26, 0, 1) }}>
          <Stage>
            <rect width={1080} height={1920} fill={C.wall} />
            <Cut d="M-20,1300 H1100 V1980 H-20Z" fill={C.desk} depth={3} />
            <Crumple x={540} y={1260} s={2.3} seed={11} />
            <g transform={`translate(0 ${(1 - head) * 120})`} opacity={Math.min(1, head * 3)}>
              <Boil id="deerhead" amp={0.8} x={540} y={1150}>
                <Deer x={540} y={1150} s={2.1 * Math.max(0.01, head)} headOnly antler={antler} wink={blink} headTilt={tw(q, 44, 52, 0, -8)} />
              </Boil>
            </g>
            {q >= 34
              ? [
                  [400, 960, -40],
                  [700, 960, 40],
                  [550, 860, 0],
                ].map(([x, y, a], k) => (
                  <path
                    key={k}
                    d={`M${x},${y} l${Math.sin((a * Math.PI) / 180) * 50},${-Math.cos((a * Math.PI) / 180) * 50}`}
                    stroke={C.gold}
                    strokeWidth={9}
                    strokeLinecap="round"
                    opacity={tw(q, 34, 46, 1, 0)}
                    transform={`translate(${Math.sin((a * Math.PI) / 180) * tw(q, 34, 44, 0, 30)} ${-Math.cos((a * Math.PI) / 180) * tw(q, 34, 44, 0, 30)})`}
                  />
                ))
              : null}
          </Stage>
          <Card lines={["我是折折。"]} x={540} y={250} size={86} who="折折" show={tw(f, 36, 42, 0, 1)} from="top" />
          <Card lines={["專門幫助那些", "快把自己摺壞的人。"]} x={540} y={520} size={54} rot={1.2} show={tw(f, 46, 52, 0, 1)} from="top" />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
