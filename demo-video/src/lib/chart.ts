import { Easing, interpolate } from "remotion";

/** 線性比例尺 */
export const scale = (
  value: number,
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);

/** 取好看的刻度間距（1 / 2 / 5 × 10^n） */
export const niceStep = (span: number, target = 5) => {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  return step * mag;
};

/** 依刻度間距把定義域向外取整，並回傳刻度陣列 */
export const axisTicks = (min: number, max: number, target = 5) => {
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return { lo, hi, step, ticks };
};

/** 數字跑動：from → to */
export const countUp = (frame: number, from: number, to: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

/** yyyy-mm-dd → 天數（把不等距的觀測日放到正確的 x 位置） */
export const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

export const shortDate = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${y.slice(2)}/${m}`;
};
