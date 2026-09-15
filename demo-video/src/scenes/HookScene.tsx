import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, MONO, SAFE } from "../theme";

export type HookSceneProps = {
  readonly date: string;
  readonly sectorCount: number;
  readonly snapshotCount: number;
  readonly sourceFile: string;
};

export const HookScene: React.FC<HookSceneProps> = ({
  date,
  sectorCount,
  snapshotCount,
  sourceFile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rise = (start: number) => ({
    opacity: interpolate(frame, [start, start + 0.7 * fps], [0, 1], {
      extrapolateLeft: "clamp" as const,
      extrapolateRight: "clamp" as const,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
    translate: interpolate(frame, [start, start + 0.9 * fps], ["0px 30px", "0px 0px"], {
      extrapolateLeft: "clamp" as const,
      extrapolateRight: "clamp" as const,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
  });

  return (
    <AbsoluteFill
      name="Hook Scene"
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONT,
        justifyContent: "center",
        paddingLeft: SAFE.x,
        paddingRight: SAFE.x,
      }}
    >
      <Interactive.Div
        name="Date"
        style={{
          color: COLORS.accent,
          fontFamily: MONO,
          fontSize: 52,
          letterSpacing: 6,
          marginBottom: 30,
          ...rise(0),
        }}
      >
        {date}
      </Interactive.Div>

      <Interactive.H1
        name="Title"
        style={{
          color: COLORS.ink,
          fontSize: 148,
          fontWeight: 700,
          lineHeight: 1.05,
          margin: 0,
          letterSpacing: -3,
          ...rise(0.35 * fps),
        }}
      >
        類股動能快照
      </Interactive.H1>

      <Interactive.Div
        name="Rule"
        style={{
          height: 8,
          marginTop: 40,
          marginBottom: 40,
          backgroundColor: COLORS.accent,
          borderRadius: 4,
          width: interpolate(frame, [1 * fps, 2.1 * fps], [0, 460], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Subtitle"
        style={{ color: COLORS.muted, fontSize: 68, ...rise(1.1 * fps) }}
      >
        {sectorCount} 個類股 · {snapshotCount} 期快照 · 全部來自這一份 CSV
      </Interactive.Div>

      <Interactive.Div
        name="Source"
        style={{
          color: COLORS.dim,
          fontFamily: MONO,
          fontSize: 40,
          marginTop: 26,
          ...rise(1.6 * fps),
        }}
      >
        data/sector_rotation/{sourceFile}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
