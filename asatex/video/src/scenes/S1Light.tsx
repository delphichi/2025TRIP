import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Glint } from "../lib/Glint";
import { node } from "../lib/Mesh";
import { pop, tween } from "../lib/anim";

// 開場三顆光的位置 = S2 網眼的交點（光原來是網上的鑽）
export const ORIGIN: [number, number] = [540, 880];
export const SPACING = 128 * Math.SQRT2;
export const STARS: { at: [number, number]; size: number; t: number }[] = [
  { at: node(ORIGIN, SPACING, 0, 0), size: 230, t: 0 },
  { at: node(ORIGIN, SPACING, -2, 0), size: 70, t: 15 },
  { at: node(ORIGIN, SPACING, 2, 1), size: 84, t: 16 },
];

export const Stars: React.FC<{ f: number; fade?: number }> = ({ f, fade = 1 }) => (
  <>
    {STARS.map((s, i) => (
      <Glint
        key={i}
        x={s.at[0]}
        y={s.at[1]}
        size={s.size}
        scale={pop(f, s.t, i === 0 ? 8 : 6, 1.4) * (1 + 0.05 * Math.sin((f + i * 7) * 0.7))}
        rotate={tween(f, s.t, s.t + 10, -45, 0)}
        streak={tween(f, s.t, s.t + 12, 0, i === 0 ? 520 : 170)}
        opacity={fade}
      />
    ))}
  </>
);

export const S1Light: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 46%, #1d1b18 0%, #141414 55%, #050505 100%)" }}>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920}>
        <Stars f={f} />
      </svg>
    </AbsoluteFill>
  );
};
