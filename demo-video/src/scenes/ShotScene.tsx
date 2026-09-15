import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, MONO, SAFE } from "../theme";

export type ShotSceneProps = {
  readonly src: string;
  readonly label: string;
  readonly meta: string;
  /** in = 慢慢推近，out = 慢慢拉遠 */
  readonly zoom: "in" | "out";
};

export const ShotScene: React.FC<ShotSceneProps> = ({ src, label, meta, zoom }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill name="Shot Scene" style={{ backgroundColor: COLORS.bg, fontFamily: FONT }}>
      {/* Ken Burns：整段慢慢縮放並輕微平移 */}
      <CanvasImage
        name="Footage"
        src={staticFile(src)}
        fit="cover"
        width={width}
        height={height}
        style={{
          scale: interpolate(
            frame,
            [0, durationInFrames],
            zoom === "in" ? [1.02, 1.14] : [1.14, 1.02],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.linear,
              output: "perceptual-scale",
            },
          ),
          translate: interpolate(
            frame,
            [0, durationInFrames],
            zoom === "in" ? ["0px 0px", "-26px -14px"] : ["24px 12px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.linear,
            },
          ),
        }}
      />

      {/* 由下往上的暗角，讓下三分之一的字讀得清楚 */}
      <Interactive.Div
        name="Scrim"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(11,14,20,0.92) 0%, rgba(11,14,20,0.55) 26%, rgba(11,14,20,0) 55%)",
        }}
      />

      {/* 下三分之一字卡 */}
      <Interactive.Div
        name="Lower Third"
        style={{
          position: "absolute",
          left: SAFE.x,
          bottom: SAFE.y,
          opacity: interpolate(frame, [0.2 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.2 * fps, 1.1 * fps], ["0px 44px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Interactive.Div
          name="Accent Bar"
          style={{
            width: 96,
            height: 8,
            borderRadius: 4,
            backgroundColor: COLORS.accent,
            marginBottom: 28,
          }}
        />
        <Interactive.Div
          name="Label"
          style={{ color: COLORS.ink, fontSize: 88, fontWeight: 700, letterSpacing: -2 }}
        >
          {label}
        </Interactive.Div>
        <Interactive.Div
          name="Meta"
          style={{
            color: COLORS.accent,
            fontFamily: MONO,
            fontSize: 46,
            marginTop: 18,
            letterSpacing: 1,
          }}
        >
          {meta}
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
