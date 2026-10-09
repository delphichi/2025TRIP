// 遊戲版的世界、尋路、走路與鏡頭。全部是純函式：給影格，回傳狀態 —— 每格都能獨立算繪。
import { spring } from "remotion";

export const FPS = 30;

// ── 地圖座標（與 asatex/build_storyboard_game.py 一致）────────
export const WORLD = { x: -600, y: -600, w: 3400, h: 4400 };
export const SPAWN: P = [1110, 1710];
export const TARGET: P = [1620, 1000];
export const PIN_AT: P = [1705, 900];
export const BOX_AT: P = [1690, 1040];
export type P = [number, number];

// ── 路網：ZOFRI 區街道交叉點 + 下方大道 ───────────────────────
const XS = Array.from({ length: 8 }, (_, i) => 940 + i * 170);
const YS = [...Array.from({ length: 9 }, (_, j) => 150 + j * 170), 1710]; // 最後一列是大道
export const NODES: P[] = [];
for (const y of YS) for (const x of XS) NODES.push([x, y]);
const idx = (i: number, j: number) => j * XS.length + i;

// 設計路線上的街道權重 1，其他街道 1.15（車流）—— 讓最短路徑唯一、轉角落在拍點上
const PREFERRED = new Set(["1,9-2,9", "2,9-2,8", "2,8-2,7", "2,7-3,7", "3,7-4,7", "4,7-4,6", "4,6-4,5"]);
const key = (a: number[], b: number[]) => {
  const s = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort();
  return `${s[0]}-${s[1]}`;
};
const ADJ: { to: number; w: number }[][] = NODES.map(() => []);
for (let j = 0; j < YS.length; j++) {
  for (let i = 0; i < XS.length; i++) {
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      const i2 = i + di;
      const j2 = j + dj;
      if (i2 >= XS.length || j2 >= YS.length) continue;
      const a = idx(i, j);
      const b = idx(i2, j2);
      const len = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
      const w = len * (PREFERRED.has(key([i, j], [i2, j2])) ? 1 : 1.15);
      ADJ[a].push({ to: b, w });
      ADJ[b].push({ to: a, w });
    }
  }
}

/** Dijkstra：回傳每個節點的距離（給擴散動畫）與最短路徑。 */
const dijkstra = (src: number, dst: number) => {
  const dist = NODES.map(() => Infinity);
  const prev = NODES.map(() => -1);
  const done = NODES.map(() => false);
  dist[src] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < NODES.length; k++) if (!done[k] && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const e of ADJ[u]) {
      if (dist[u] + e.w < dist[e.to]) {
        dist[e.to] = dist[u] + e.w;
        prev[e.to] = u;
      }
    }
  }
  const path: number[] = [];
  for (let v = dst; v >= 0; v = prev[v]) path.unshift(v);
  return { dist, path };
};

const SRC = NODES.findIndex((n) => n[0] === SPAWN[0] && n[1] === SPAWN[1]);
const DST = NODES.findIndex((n) => n[0] === TARGET[0] && n[1] === TARGET[1]);
const solved = dijkstra(SRC, DST);
export const DIST = solved.dist;
export const DIST_TARGET = solved.dist[DST];
// 去掉直線上的中間點，只留轉角
export const ROUTE: P[] = solved.path
  .map((k) => NODES[k])
  .filter((p, k, arr) => {
    if (k === 0 || k === arr.length - 1) return true;
    const a = arr[k - 1];
    const b = arr[k + 1];
    return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });

const SEG = ROUTE.slice(1).map((p, k) => Math.hypot(p[0] - ROUTE[k][0], p[1] - ROUTE[k][1]));
export const CUM = SEG.reduce<number[]>((acc, l) => [...acc, acc[acc.length - 1] + l], [0]);
export const TOTAL = CUM[CUM.length - 1];

/** 路線上距離 d 的位置。 */
export const along = (d: number): P => {
  const dd = Math.max(0, Math.min(TOTAL, d));
  for (let k = 0; k < SEG.length; k++) {
    if (dd <= CUM[k + 1] || k === SEG.length - 1) {
      const t = SEG[k] === 0 ? 0 : (dd - CUM[k]) / SEG[k];
      const a = ROUTE[k];
      const b = ROUTE[k + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return ROUTE[ROUTE.length - 1];
};

// ── 走路時間軸：轉角落在 f90／120／150，撿取在 f105／135／165（各凍結 2 格），f180 到站 ──
export const CORNER_F = [90, 120, 150];
export const PICK_F = [105, 135, 165];
export const START_F = 75;
export const ARRIVE_F = 180;
const mid = (k: number) => (CUM[k + 1] + CUM[k + 2]) / 2; // 第 k 個撿取點：轉角 k+1 與 k+2 中間
export const GEM_D = [mid(0), mid(1), mid(2)];
const KEYS: [number, number][] = [
  [START_F, 0],
  [CORNER_F[0], CUM[1]],
  [PICK_F[0], GEM_D[0]],
  [PICK_F[0] + 2, GEM_D[0]],
  [CORNER_F[1], CUM[2]],
  [PICK_F[1], GEM_D[1]],
  [PICK_F[1] + 2, GEM_D[1]],
  [CORNER_F[2], CUM[3]],
  [PICK_F[2], GEM_D[2]],
  [PICK_F[2] + 2, GEM_D[2]],
  [ARRIVE_F, TOTAL],
];

export const walkDist = (f: number) => {
  if (f <= KEYS[0][0]) return 0;
  if (f >= KEYS[KEYS.length - 1][0]) return TOTAL;
  for (let k = 0; k < KEYS.length - 1; k++) {
    const [f0, d0] = KEYS[k];
    const [f1, d1] = KEYS[k + 1];
    if (f <= f1) {
      let t = (f - f0) / (f1 - f0);
      if (k === 0) t = t * t; // 起步緩入
      if (k === KEYS.length - 2) t = 1 - (1 - t) * (1 - t); // 到站緩出
      return d0 + (d1 - d0) * t;
    }
  }
  return TOTAL;
};

/** 海豚狀態：位置、離地高度、壓扁量。 */
export const walker = (f: number) => {
  const [x, y] = along(walkDist(f));
  let hop = 0;
  let squash = 1;
  const moving = f > START_F && f < ARRIVE_F;
  // 尾鰭彈跳前進：每 1/8 拍（7.5 格）彈一下
  if (moving) {
    const ph = ((f - START_F) % 7.5) / 7.5;
    hop = 14 * Math.sin(Math.PI * ph);
    squash = ph < 0.12 || ph > 0.88 ? 0.9 : 1.04;
  }
  // 轉角大跳：拋物線 70px，離地前壓扁、空中拉長、落地再壓
  for (const c of CORNER_F) {
    const u = (f - (c - 5)) / 10;
    if (u >= 0 && u <= 1) {
      hop = 70 * 4 * u * (1 - u);
      squash = u < 0.12 ? 0.82 : u > 0.9 ? 0.86 : 1.14;
    }
    if (f >= c - 8 && f < c - 5) squash = 0.8; // 預備
  }
  // 撿取凍結
  for (const p of PICK_F) if (f >= p && f < p + 2) hop = 0;
  return { x, y, hop, squash };
};

// ── 鏡頭：臨界阻尼彈簧（k=24，c=2√k），每格以 4 個子步長模擬 ──
type Cam = { x: number; y: number; z: number };
const goal = (f: number): Cam & { k: number } => {
  if (f < 45) return { x: 1150, y: 1450, z: 0.52, k: 24 };
  if (f < START_F) return { x: 1350, y: 1330, z: 0.64, k: 24 };
  if (f < ARRIVE_F) {
    const w = walker(f);
    const remain = TOTAL - walkDist(f);
    const z = 0.95 + (1 - remain / TOTAL) * 0.75;
    // 同時框住海豚與目標，往前多看一點
    return { x: w.x + (PIN_AT[0] - w.x) * 0.45 + 40, y: w.y + (PIN_AT[1] - w.y) * 0.45 - 60, z, k: 24 };
  }
  if (f < 270) return { x: 1680, y: 975, z: 2.0, k: 24 };
  return { x: 1300, y: 1400, z: 0.5, k: 140 };
};

const CAMS: Cam[] = [];
{
  let c: Cam = { x: 1150, y: 1450, z: 0.46 };
  let v = { x: 0, y: 0, z: 0 };
  const sub = 4;
  const dt = 1 / FPS / sub;
  for (let f = 0; f <= 300; f++) {
    CAMS.push({ ...c });
    const g = goal(f);
    const damp = 2 * Math.sqrt(g.k);
    for (let s = 0; s < sub; s++) {
      // 縮放在對數空間做，放大縮小的速度感才一致
      const lz = Math.log(c.z);
      const lg = Math.log(g.z);
      v = {
        x: v.x + (g.k * (g.x - c.x) - damp * v.x) * dt,
        y: v.y + (g.k * (g.y - c.y) - damp * v.y) * dt,
        z: v.z + (g.k * (lg - lz) - damp * v.z) * dt,
      };
      c = { x: c.x + v.x * dt, y: c.y + v.y * dt, z: Math.exp(lz + v.z * dt) };
    }
  }
}
export const camera = (f: number): Cam => {
  const i = Math.max(0, Math.min(300, Math.floor(f)));
  const j = Math.min(300, i + 1);
  const t = f - Math.floor(f);
  const a = CAMS[i];
  const b = CAMS[j];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
};
/** 地圖座標 → 螢幕座標 */
export const toScreen = (f: number, p: P): P => {
  const c = camera(f);
  return [540 + (p[0] - c.x) * c.z, 960 + (p[1] - c.y) * c.z];
};

// ── 參考規格的彈簧：圖釘、紙箱 k260／d15 ─────────────────────
export const PIN_SPRING = { stiffness: 260, damping: 15, mass: 1 };
export const drop = (f: number, start: number) => spring({ frame: f - start, fps: FPS, config: PIN_SPRING });
/** 彈簧第一次越過 1 的影格 = 觸地。 */
export const landFrame = (start: number) => {
  for (let k = 0; k < 60; k++) if (drop(start + k, start) >= 1) return start + k;
  return start + 8;
};
