// S5 城市動起來（332–390）：夜裡的紙城市有了四層景深，窗戶一盞盞亮起，火車過橋，片名紙卡垂下。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Deer } from "../chars";
import { Boil, BoxFrame, C, Card, Cut, Stage, leafD, tw, twos, wave } from "../paper";
import { House, Moon, Skyline, Train } from "../props";

export const CITY = [
  { x: 100, w: 170, h: 240, roof: C.terra, cols: 2, rows: 3 },
  { x: 330, w: 150, h: 310, roof: C.green, cols: 2, rows: 4 },
  { x: 560, w: 190, h: 230, roof: C.root, cols: 3, rows: 3 },
  { x: 800, w: 160, h: 280, roof: C.gold, cols: 2, rows: 3 },
];

/** 城市本體，lightsOut 0–1 熄燈。push 為鏡頭推進量（0–1），各層以不同速度移動。 */
export const City: React.FC<{ f: number; push: number; lightsOut?: number }> = ({ f, push, lightsOut = 0 }) => {
  const q = twos(f);
  const layer = (depth: number) => `translate(0 ${-push * depth * 26}) scale(${1 + push * depth * 0.02})`;
  return (
    <Stage>
      <rect width={1080} height={1920} fill={C.midnight} />
      <Moon x={820} y={420} r={60} />
      <g transform={layer(0.4)} style={{ transformOrigin: "540px 960px" }}>
        <Skyline y={980} seed={5} color="#2E3F57" depth={1} />
      </g>
      <g transform={layer(0.8)} style={{ transformOrigin: "540px 960px" }}>
        <Skyline y={1080} seed={9} color="#3A5070" depth={2} />
      </g>
      <g transform={layer(1.4)} style={{ transformOrigin: "540px 960px" }}>
        {CITY.map((h, k) => (
          <Boil key={k} id={`c${k}`} amp={0.5}>
            <House x={h.x} y={1260} w={h.w} h={h.h} roof={h.roof} cols={h.cols} rows={h.rows} depth={3}
              lit={lightsOut > 0.5 ? 0 : Math.max(0, Math.floor((q - 2 - k * 3) / 2))} />
          </Boil>
        ))}
        <Boil id="roofdeer" amp={0.8}>
          <Deer x={900} y={1004} s={0.42} wink={false} />
        </Boil>
        <Cut d="M-20,1300 Q540,1230 1100,1300 L1100,1330 Q540,1260 -20,1330Z" fill="#fbf7f0" depth={3} />
        <Train x={tw(f, 0, 58, -120, 1260)} y={1286} s={0.8} />
        <Cut d={wave(1420, 30, 5, 41)} fill={C.water} depth={3} />
        <Cut d={wave(1530, 22, 5, 42)} fill="#3F6B90" depth={4} />
      </g>
      <g transform={layer(2.2)} style={{ transformOrigin: "540px 960px" }}>
        {[[80, -70], [1000, -110], [180, -50]].map(([x, a]) => (
          <Cut key={x} d={leafD(x, 1880, 220, 70, a)} fill={C.deep} depth={4} />
        ))}
      </g>
      <BoxFrame />
    </Stage>
  );
};

export const S5City: React.FC = () => {
  const f = useCurrentFrame();
  // 片名卡垂下後像鐘擺晃兩下
  const drop = tw(f, 14, 22, 0, 1);
  const swing = f > 18 ? 5 * Math.exp(-(f - 18) / 10) * Math.sin((f - 18) / 2.2) : 0;
  return (
    <AbsoluteFill>
      <City f={f} push={tw(f, 0, 58, 0, 1)} />
      <Card lines={["今天，", "先別把自己摺壞"]} x={540} y={200} size={92} rot={-1.5 + swing} show={drop} from="top" />
    </AbsoluteFill>
  );
};
