import { Easing, interpolate, random } from "remotion";

// 動態語言（分鏡「動態語言」一節）
export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1); // 進場
export const EXPO_IN = Easing.bezier(0.7, 0, 0.84, 0); // 退場：永遠比進場快
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const SLAM = Easing.spring({ damping: 11, stiffness: 260, mass: 1 }); // 重擊：帶過衝

export const tween = (
  f: number,
  a: number,
  b: number,
  from: number,
  to: number,
  easing: (t: number) => number = EXPO_OUT,
) =>
  interpolate(f, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** 重拍震動：只在指定影格觸發，8 格內衰減。用整數格當種子，動態模糊取樣時不會亂跳。 */
export const shake = (f: number, hits: number[], amp = 10, dur = 8) => {
  for (const h of hits) {
    if (f >= h && f < h + dur) {
      const k = 1 - (f - h) / dur;
      const i = Math.floor(f);
      return {
        x: (random(`sx${i}`) - 0.5) * 2 * amp * k * k,
        y: (random(`sy${i}`) - 0.5) * 2 * amp * k * k,
      };
    }
  }
  return { x: 0, y: 0 };
};

/** 出現即「蓋印」：0 → 過衝 → 1，n 格內完成。 */
export const pop = (f: number, start: number, n = 8, over = 1.35) =>
  interpolate(f, [start, start + n * 0.35, start + n], [0, over, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO_OUT,
  });
