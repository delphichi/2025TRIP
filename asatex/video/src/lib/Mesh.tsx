import React from "react";

/**
 * 菱形網眼。做法：在旋轉 45° 的座標系裡畫正方格線，轉回來就是菱形格。
 *
 * - origin：某個交點在畫面上的位置（讓鑽石剛好落在交點上）
 * - spacing：格線間距（旋轉座標系內），畫面上菱形的對角線 = spacing × √2
 * - progressA / progressB：兩組線各自的「畫出」進度 0–1，每條線錯開
 * - drift：沿格線方向的漂移量（px），超過一格自動回捲，可無限漂
 */
export const Mesh: React.FC<{
  origin?: [number, number];
  spacing: number;
  width: number;
  color: string;
  highlight?: string;
  progressA?: number;
  progressB?: number;
  stagger?: number;
  drift?: [number, number];
  tilt?: number; // 額外旋轉（度）
  opacity?: number;
  extent?: number;
  /** 跟著網一起漂移的內容（座標為旋轉座標系：交點 (i,j) = (i*spacing, j*spacing)） */
  children?: React.ReactNode;
}> = ({
  origin = [540, 960],
  spacing,
  width,
  color,
  highlight,
  progressA = 1,
  progressB = 1,
  stagger = 0.5,
  drift = [0, 0],
  tilt = 0,
  opacity = 1,
  extent = 2400,
  children,
}) => {
  const n = Math.ceil(extent / spacing);
  const dx = ((drift[0] % spacing) + spacing) % spacing;
  const dy = ((drift[1] % spacing) + spacing) % spacing;
  const L = n * spacing * 2;

  // 每條線的進度：第 i 條在整體進度的 [i*stagger/count, ...] 區間內畫完
  const lineP = (p: number, i: number, count: number) => {
    const start = (i / count) * stagger;
    return Math.max(0, Math.min(1, (p - start) / (1 - stagger)));
  };

  const lines = (set: "A" | "B", p: number, stroke: string, w: number, off: number) => {
    const out: React.ReactNode[] = [];
    const count = 2 * n + 1;
    for (let k = -n; k <= n; k++) {
      const i = k + n;
      const lp = lineP(p, i, count);
      if (lp <= 0) continue;
      const c = k * spacing;
      const len = L * lp;
      // A：直線（旋轉後成 ↘ 方向）；B：橫線（旋轉後成 ↗ 方向），B 從另一端畫進來
      const d =
        set === "A"
          ? `M${c + dx + off},${-L / 2 + dy} l0,${len}`
          : `M${L / 2 + dx},${c + dy + off} l${-len},0`;
      out.push(<path key={`${set}${k}`} d={d} stroke={stroke} strokeWidth={w} strokeLinecap="round" fill="none" />);
    }
    return out;
  };

  return (
    <g transform={`translate(${origin[0]} ${origin[1]}) rotate(${45 + tilt})`} opacity={opacity}>
      {lines("A", progressA, color, width, 0)}
      {lines("B", progressB, color, width, 0)}
      {highlight ? (
        <g opacity={0.55}>
          {lines("A", progressA, highlight, Math.max(1, width * 0.22), -width * 0.2)}
          {lines("B", progressB, highlight, Math.max(1, width * 0.22), -width * 0.2)}
        </g>
      ) : null}
      {children ? <g transform={`translate(${drift[0]} ${drift[1]})`}>{children}</g> : null}
    </g>
  );
};

/** 網眼交點 (i, j) 在畫面上的座標（不含 tilt 與 drift）。 */
export const node = (origin: [number, number], spacing: number, i: number, j: number): [number, number] => {
  const s = spacing / Math.SQRT2;
  return [origin[0] + s * (i - j), origin[1] + s * (i + j)];
};
