import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { axisTicks, dayNumber, scale, shortDate } from "../lib/chart";
import type { Snapshot } from "../data/scorecards";
import { CHART, COLORS, FONT, MONO, pct, SAFE } from "../theme";

export type TrendSceneProps = {
  readonly snapshots: readonly Snapshot[];
  /** 要畫哪幾個類股（代號） */
  readonly symbols: readonly string[];
};

const PLOT = { x0: 330, x1: 1360, y0: 330, y1: 850 } as const;
const LABEL_X = PLOT.x1 + 46;   // 線末標籤欄
const LABEL_GAP = 66;           // 標籤最小垂直間距，避免疊字

// 三條線用 dataviz 類別配色的前三槽（全配對驗證過）
const LINE_COLORS = ["#3987e5", "#d95926", "#199e70"] as const;

export const TrendScene: React.FC<TrendSceneProps> = ({ snapshots, symbols }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // x 用真實日期定位，所以不等距的觀測間隔是誠實呈現的
  const days = snapshots.map((s) => dayNumber(s.date));
  const xDomain = [Math.min(...days), Math.max(...days)] as const;

  const series = symbols.map((symbol, si) => ({
    symbol,
    color: LINE_COLORS[si % LINE_COLORS.length],
    name: snapshots[snapshots.length - 1]?.sectors.find((sec) => sec.symbol === symbol)?.name ?? symbol,
    points: snapshots
      .map((snap) => {
        const hit = snap.sectors.find((s) => s.symbol === symbol);
        return hit?.ret_4w == null ? null : { day: dayNumber(snap.date), value: hit.ret_4w };
      })
      .filter((p): p is { day: number; value: number } => p !== null),
  }));

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const { lo, hi, ticks } = axisTicks(Math.min(...allValues), Math.max(...allValues), 5);
  const yDomain = [lo, hi] as const;

  const px = (day: number) => scale(day, xDomain, [PLOT.x0, PLOT.x1]);
  const py = (v: number) => scale(v, yDomain, [PLOT.y1, PLOT.y0]);

  // x 軸標籤：貪婪過濾，密集取樣區只留得下的那幾個
  // 首末一定畫，中間的必須同時離「前一個已畫的」與「最後一個」都夠遠
  const dateLabels: string[] = [];
  const lastX = px(dayNumber(snapshots[snapshots.length - 1].date));
  let lastLabelX = -Infinity;
  snapshots.forEach((snap, i) => {
    const x = px(dayNumber(snap.date));
    const isFirst = i === 0;
    const isLast = i === snapshots.length - 1;
    if (isFirst || isLast || (x - lastLabelX >= 120 && lastX - x >= 120)) {
      dateLabels.push(snap.date);
      lastLabelX = x;
    }
  });

  // 線末標籤去碰撞：依 y 排序後互相推開
  const labelY: Record<string, number> = {};
  const wanted = series
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { symbol: s.symbol, y: last ? py(last.value) : PLOT.y1 };
    })
    .sort((a, b) => a.y - b.y);
  let cursor = -Infinity;
  for (const w of wanted) {
    const y = Math.max(w.y, cursor + LABEL_GAP);
    labelY[w.symbol] = y;
    cursor = y;
  }

  // 0 → 1 的描繪進度
  const draw = interpolate(frame, [0.4 * fps, 4.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.16, 1),
  });

  return (
    <AbsoluteFill name="Trend Scene" style={{ backgroundColor: COLORS.bg, fontFamily: FONT }}>
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
        綜合分前三名的動能軌跡
        <span style={{ color: COLORS.dim, fontFamily: MONO, fontSize: 40, marginLeft: 26 }}>
          {snapshots[0]?.date} → {snapshots[snapshots.length - 1]?.date}
        </span>
      </Interactive.Div>

      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }} viewBox="0 0 1920 1080">
        {/* 水平刻度，零線稍強 */}
        {ticks.map((t) => {
          const y = py(t);
          const isZero = Math.abs(t) < 1e-9;
          return (
            <g key={t}>
              <line
                x1={PLOT.x0 - 20}
                x2={PLOT.x1 + 20}
                y1={y}
                y2={y}
                stroke={isZero ? CHART.axis : CHART.grid}
                strokeWidth={isZero ? 2 : 1}
              />
              <text x={PLOT.x0 - 36} y={y + 12} fill={COLORS.dim} fontSize={34} fontFamily={MONO} textAnchor="end">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          );
        })}

        {/* x 軸日期：與前一個標籤至少隔 120px 才畫，密集區自動略過 */}
        {dateLabels.map((d) => (
          <text
            key={d}
            x={px(dayNumber(d))}
            y={PLOT.y1 + 54}
            fill={COLORS.dim}
            fontSize={32}
            fontFamily={MONO}
            textAnchor="middle"
          >
            {shortDate(d)}
          </text>
        ))}

        {series.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.day)} ${py(p.value)}`).join(" ");
          const last = s.points[s.points.length - 1];
          // 用 dash offset 讓線從左往右畫出來
          const LEN = 4200;
          return (
            <g key={s.symbol}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={LEN}
                strokeDashoffset={LEN * (1 - draw)}
              />
              {/* 觀測點標記：讓人看得出取樣是不等距的 */}
              {s.points.map((p, i) => {
                const appear = i / Math.max(1, s.points.length - 1);
                return (
                  <circle
                    key={p.day}
                    cx={px(p.day)}
                    cy={py(p.value)}
                    r={9}
                    fill={COLORS.bg}
                    stroke={s.color}
                    strokeWidth={4}
                    opacity={draw >= appear ? 1 : 0}
                  />
                );
              })}
              {/* 線末直標：拉到右側專用欄並做去碰撞，身分不靠顏色 */}
              {last && (
                <line
                  x1={px(last.day) + 12}
                  x2={LABEL_X - 12}
                  y1={py(last.value)}
                  y2={labelY[s.symbol]}
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={interpolate(frame, [4.2 * fps, 5 * fps], [0, 0.6], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                />
              )}
              {last && (
                <text
                  x={LABEL_X}
                  y={labelY[s.symbol] + 11}
                  fill={s.color}
                  fontSize={34}
                  fontWeight={700}
                  opacity={interpolate(frame, [4.2 * fps, 5 * fps], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                >
                  {s.symbol} {s.name} {pct(last.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <Interactive.Div
        name="Note"
        style={{
          position: "absolute",
          left: SAFE.x,
          top: 218,
          color: COLORS.dim,
          fontSize: 32,
          opacity: interpolate(frame, [4.4 * fps, 5.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        圓點為實際觀測日 · x 軸依真實日期定位，取樣間隔並不等距
      </Interactive.Div>
    </AbsoluteFill>
  );
};
