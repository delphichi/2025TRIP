import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { Mesh, node } from "../lib/Mesh";
import { HeroPlate } from "../lib/hero";
import { EXPO_IN, tween } from "../lib/anim";
import { C } from "../theme";
import { ORIGIN, SPACING, Stars } from "./S1Light";

// 要穿過的那一格：交點 (0,0) 正下方的菱形
const CELL = [node(ORIGIN, SPACING, 0, 0), node(ORIGIN, SPACING, 1, 0), node(ORIGIN, SPACING, 1, 1), node(ORIGIN, SPACING, 0, 1)];
const CX = (CELL[0][0] + CELL[2][0]) / 2;
const CY = (CELL[0][1] + CELL[2][1]) / 2;
const hole = `M${CELL.map((p) => p.join(",")).join(" L")}Z`;

export const S2Weave: React.FC = () => {
  const f = useCurrentFrame();
  // 網線：線性速度（像被抽出來的線），兩組各一拍
  const pA = tween(f, 0, 13, 0, 1, Easing.linear);
  const pB = tween(f, 15, 26, 0, 1, Easing.linear);
  // 穿網：急推進那一格，洞變成下一鏡的窗口
  const zoom = tween(f, 19, 30, 1, 18, EXPO_IN);
  const holeShut = tween(f, 15, 21, 1, 0);

  return (
    <AbsoluteFill>
      {/* 洞後面已經是 S3 的第一格 */}
      <HeroPlate f={0} />
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        <g transform={`translate(${CX} ${CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
          <path d={`M-6000,-6000 H7080 V7920 H-6000Z ${hole}`} fill="#0f0e0d" fillRule="evenodd" />
          <path d={hole} fill="#0f0e0d" opacity={holeShut} />
          <Mesh origin={ORIGIN} spacing={SPACING} width={3} color={C.gold} opacity={0.85} progressA={pA} progressB={pB} stagger={0.6} />
          {/* 穿網時星星先退，不擋洞口 */}
          <Stars f={f + 30} fade={tween(f, 18, 23, 1, 0)} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
