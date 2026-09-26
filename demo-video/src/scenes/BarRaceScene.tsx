import {
  AbsoluteFill,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { axisTicks, countUp, scale } from "../lib/chart";
import type { Sector } from "../data/scorecards";
import { CHART, COLORS, FONT, MONO, pct, SAFE, signColor, signMark } from "../theme";

export type BarRaceSceneProps = {
  readonly date: string;
  readonly sectors: readonly Sector[];
};

// 圖面座標（1920×1080）
const PLOT = { x0: 700, x1: 1520, y0: 300, y1: 940 } as const;

export const BarRaceScene: React.FC<BarRaceSceneProps> = ({ date, sectors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rows = [...sectors]
    .filter((s): s is Sector & { ret_4w: number } => s.ret_4w !== null)
    .sort((a, b) => b.ret_4w - a.ret_4w);

  // 對稱定義域，讓零線落在正中央，正負長度可直接比較
  const bound = Math.max(...rows.map((r) => Math.abs(r.ret_4w)));
  const { lo, hi, ticks } = axisTicks(-bound, bound, 4);
  const domain = [lo, hi] as const;
  const range = [PLOT.x0, PLOT.x1] as const;
  const zeroX = scale(0, domain, range);

  const pitch = (PLOT.y1 - PLOT.y0) / rows.length;
  const barH = Math.min(40, pitch - 22); // 列間留白遠大於 2px 的表面間隙要求

  return (
    <AbsoluteFill name="Bar Race Scene" style={{ backgroundColor: COLORS.bg, fontFamily: FONT }}>
      <Interactive.Div
        name="Heading"
        style={{
          position: "absolute",
          left: SAFE.x,
          top: 120,
          color: COLORS.ink,
          fontSize: 82,
          fontWeight: 700,
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        4 週報酬
        <span style={{ color: COLORS.dim, fontFamily: MONO, fontSize: 44, marginLeft: 28 }}>
          {date}
        </span>
      </Interactive.Div>

      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
        viewBox="0 0 1920 1080"
      >
        {/* 刻度線：壓低存在感，不與資料爭 */}
        {ticks.map((t) => {
          const x = scale(t, domain, range);
          const isZero = Math.abs(t) < 1e-9;
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={PLOT.y0 - 26}
                y2={PLOT.y1}
                stroke={isZero ? CHART.axis : CHART.grid}
                strokeWidth={isZero ? 2 : 1}
              />
              <text
                x={x}
                y={PLOT.y0 - 44}
                fill={COLORS.dim}
                fontSize={34}
                fontFamily={MONO}
                textAnchor="middle"
              >
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          );
        })}

        {rows.map((r, i) => {
          const y = PLOT.y0 + i * pitch + (pitch - barH) / 2;
          const start = i * 3; // 逐列錯開進場
          const value = countUp(frame, 0, r.ret_4w, start, 1.1 * fps);
          const x = scale(value, domain, range);
          const w = Math.abs(x - zeroX);
          const positive = r.ret_4w >= 0;
          const labelX = positive
            ? Math.min(Math.max(x, zeroX) + 20, 1920 - SAFE.x - 30)
            : Math.max(Math.min(x, zeroX) - 20, 520);

          return (
            <g
              key={r.symbol}
              opacity={interpolate(frame, [start, start + 0.5 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            >
              {/* 代號 + 中文名靠左對齊成一欄 */}
              <text x={SAFE.x} y={y + barH * 0.78} fill={COLORS.ink} fontSize={42} fontWeight={700}>
                {r.symbol}
              </text>
              <text x={SAFE.x + 132} y={y + barH * 0.78} fill={COLORS.muted} fontSize={40}>
                {r.name}
              </text>

              {/* 資料端圓角 4px、貼齊零線 */}
              <rect
                x={positive ? zeroX : x}
                y={y}
                width={w}
                height={barH}
                rx={4}
                fill={signColor(r.ret_4w)}
              />

              <text
                x={labelX}
                y={y + barH * 0.78}
                fill={signColor(r.ret_4w)}
                fontSize={40}
                fontFamily={MONO}
                textAnchor={positive ? "start" : "end"}
              >
                {signMark(r.ret_4w)} {pct(value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 圖例：顏色不單獨承載意義 */}
      <Interactive.Div
        name="Legend"
        style={{
          position: "absolute",
          right: SAFE.x,
          top: 132,
          display: "flex",
          gap: 34,
          fontSize: 38,
          color: COLORS.muted,
          opacity: interpolate(frame, [0.4 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ color: CHART.up }}>▲ 上漲</span>
        <span style={{ color: CHART.down }}>▼ 下跌</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
