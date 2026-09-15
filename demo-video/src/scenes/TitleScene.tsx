import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Title Scene"
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONT,
        justifyContent: "center",
        paddingLeft: SAFE.x,
        paddingRight: SAFE.x,
      }}
    >
      {/* 右上角的暖色光暈，讓純黑背景不死板 */}
      <Interactive.Div
        name="Glow"
        style={{
          position: "absolute",
          top: -520,
          right: -420,
          width: 1400,
          height: 1400,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(245,165,36,0.20) 0%, rgba(245,165,36,0.06) 45%, rgba(245,165,36,0) 70%)",
          scale: interpolate(frame, [0, 3 * fps], [0.9, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />

      <Interactive.Div
        name="Eyebrow"
        style={{
          color: COLORS.accent,
          fontSize: 46,
          fontWeight: 600,
          letterSpacing: 12,
          marginBottom: 34,
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 0.8 * fps], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        PIPELINE DEMO
      </Interactive.Div>

      <Interactive.H1
        name="Title"
        style={{
          color: COLORS.ink,
          fontSize: 170,
          fontWeight: 700,
          lineHeight: 1.02,
          margin: 0,
          letterSpacing: -4,
          opacity: interpolate(frame, [0.3 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0.3 * fps, 1.6 * fps], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        FAL × Remotion
      </Interactive.H1>

      {/* 一條由左往右長出來的琥珀色線 */}
      <Interactive.Div
        name="Rule"
        style={{
          height: 8,
          marginTop: 44,
          marginBottom: 44,
          backgroundColor: COLORS.accent,
          borderRadius: 4,
          width: interpolate(frame, [0.9 * fps, 2 * fps], [0, 420], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Subtitle"
        style={{
          color: COLORS.muted,
          fontSize: 76,
          fontWeight: 400,
          opacity: interpolate(frame, [1.2 * fps, 2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [1.2 * fps, 2.1 * fps], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        生成式素材 × 程式碼組裝
      </Interactive.Div>
    </AbsoluteFill>
  );
};
