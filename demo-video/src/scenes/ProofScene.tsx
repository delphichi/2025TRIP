import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, MONO, SAFE } from "../theme";

export type ProofSceneProps = {
  readonly dates: readonly string[];
  readonly current: string;
};

export const ProofScene: React.FC<ProofSceneProps> = ({ dates, current }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Proof Scene"
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONT,
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: SAFE.x,
        paddingRight: SAFE.x,
      }}
    >
      <Interactive.Div
        name="Headline"
        style={{
          color: COLORS.ink,
          fontSize: 96,
          fontWeight: 700,
          textAlign: "center",
          opacity: interpolate(frame, [0, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 0.9 * fps], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        同一個模板 × {dates.length} 期資料
      </Interactive.Div>

      {/* 每一期都是一支影片：亮起來的那一顆是這支 */}
      <Interactive.Div
        name="Chips"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "center",
          marginTop: 64,
          maxWidth: 1500,
        }}
      >
        {dates.map((d, i) => {
          const start = 0.7 * fps + i * 4;
          const isCurrent = d === current;
          return (
            <Interactive.Div
              key={d}
              name={`Chip ${d}`}
              style={{
                fontFamily: MONO,
                fontSize: 36,
                padding: "16px 26px",
                borderRadius: 8,
                color: isCurrent ? COLORS.bg : COLORS.muted,
                backgroundColor: isCurrent ? COLORS.accent : "rgba(242,243,245,0.06)",
                fontWeight: isCurrent ? 700 : 400,
                opacity: interpolate(frame, [start, start + 0.4 * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: interpolate(frame, [start, start + 0.5 * fps], [0.86, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.spring({ damping: 200 }),
                  output: "perceptual-scale",
                }),
              }}
            >
              {d}
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      <Interactive.Div
        name="Command"
        style={{
          color: COLORS.accent,
          fontFamily: MONO,
          fontSize: 48,
          marginTop: 72,
          textAlign: "center",
          opacity: interpolate(frame, [1.8 * fps, 2.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        npx remotion render Weekly --props=&apos;&#123;&quot;date&quot;:&quot;{current}&quot;&#125;&apos;
      </Interactive.Div>

      <Interactive.Div
        name="Footer"
        style={{
          color: COLORS.dim,
          fontSize: 38,
          marginTop: 30,
          textAlign: "center",
          opacity: interpolate(frame, [2.2 * fps, 2.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        換一個日期就是另一支影片 —— 字級、長條、折線、排名全部重算
      </Interactive.Div>
    </AbsoluteFill>
  );
};
