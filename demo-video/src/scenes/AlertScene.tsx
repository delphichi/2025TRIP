import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { countUp } from "../lib/chart";
import type { Sector } from "../data/scorecards";
import { COLORS, FONT, MONO, pct, SAFE, signColor, signMark } from "../theme";

export type AlertSceneProps = {
  readonly sectors: readonly Sector[];
};

/** 訊號標籤各自的語意色（狀態色，永不與資料系列共用） */
const STATUS: Record<string, string> = {
  剛爆發: "#fab219", // warning：要注意的新訊號
  吃老本: "#ec835a", // serious：動能來自過去
};

export const AlertScene: React.FC<AlertSceneProps> = ({ sectors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const flagged = sectors.filter((s) => s.alert !== "");

  return (
    <AbsoluteFill
      name="Alert Scene"
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONT,
        justifyContent: "center",
        paddingLeft: SAFE.x,
        paddingRight: SAFE.x,
      }}
    >
      <Interactive.Div
        name="Heading"
        style={{
          color: COLORS.ink,
          fontSize: 82,
          fontWeight: 700,
          marginBottom: 56,
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        這一期跳出 {flagged.length} 個訊號
      </Interactive.Div>

      <Interactive.Div name="Cards" style={{ display: "flex", gap: 40 }}>
        {flagged.map((s, i) => {
          const start = 0.4 * fps + i * 8;
          const color = STATUS[s.alert] ?? COLORS.accent;
          return (
            <Interactive.Div
              key={s.symbol}
              name={`Card ${s.symbol}`}
              style={{
                flex: 1,
                backgroundColor: "rgba(242,243,245,0.05)",
                borderLeft: `10px solid ${color}`,
                borderRadius: 10,
                padding: "48px 44px",
                opacity: interpolate(frame, [start, start + 0.7 * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                translate: interpolate(
                  frame,
                  [start, start + 0.9 * fps],
                  ["0px 46px", "0px 0px"],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
              }}
            >
              {/* 狀態色一律搭配文字標籤，不讓顏色單獨表意 */}
              <Interactive.Div
                name="Badge"
                style={{ color, fontSize: 46, fontWeight: 700, marginBottom: 26 }}
              >
                ● {s.alert}
              </Interactive.Div>
              <Interactive.Div
                name="Symbol"
                style={{ color: COLORS.ink, fontSize: 78, fontWeight: 700 }}
              >
                {s.symbol}
              </Interactive.Div>
              <Interactive.Div name="Name" style={{ color: COLORS.muted, fontSize: 48, marginTop: 8 }}>
                {s.name}
              </Interactive.Div>
              <Interactive.Div
                name="Values"
                style={{ fontFamily: MONO, fontSize: 40, marginTop: 34, lineHeight: 1.7 }}
              >
                <div style={{ color: signColor(s.ret_4w ?? 0) }}>
                  {signMark(s.ret_4w ?? 0)} 4W {pct(countUp(frame, 0, s.ret_4w ?? 0, start, 1 * fps))}
                </div>
                <div style={{ color: signColor(s.ret_26w ?? 0) }}>
                  {signMark(s.ret_26w ?? 0)} 26W{" "}
                  {pct(countUp(frame, 0, s.ret_26w ?? 0, start + 6, 1 * fps))}
                </div>
                <div style={{ color: COLORS.dim }}>綜合分排名 #{s.composite_rank}</div>
              </Interactive.Div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
