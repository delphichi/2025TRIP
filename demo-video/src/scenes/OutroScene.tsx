import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, MONO, SAFE } from "../theme";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Outro Scene"
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
          fontSize: 92,
          fontWeight: 700,
          textAlign: "center",
          letterSpacing: -2,
          opacity: interpolate(frame, [0, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 0.9 * fps], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        每一格都由程式碼定義
      </Interactive.Div>

      <Interactive.Div
        name="Command"
        style={{
          color: COLORS.accent,
          fontFamily: MONO,
          fontSize: 64,
          marginTop: 52,
          opacity: interpolate(frame, [0.6 * fps, 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        npx remotion render
      </Interactive.Div>

      <Interactive.Div
        name="Underline"
        style={{
          height: 6,
          marginTop: 22,
          backgroundColor: COLORS.accent,
          borderRadius: 3,
          opacity: 0.55,
          width: interpolate(frame, [0.9 * fps, 1.9 * fps], [0, 560], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Footer"
        style={{
          color: COLORS.muted,
          fontSize: 46,
          marginTop: 76,
          letterSpacing: 4,
          opacity: interpolate(frame, [1.3 * fps, 2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        1920×1080 · 30fps · 11s
      </Interactive.Div>
    </AbsoluteFill>
  );
};
