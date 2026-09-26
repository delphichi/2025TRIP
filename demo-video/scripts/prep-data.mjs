// 把 data/sector_rotation/*_scorecard.csv 轉成 src/data/scorecards.ts
// 用法：node scripts/prep-data.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "data", "sector_rotation");
const OUT = join(here, "..", "src", "data");

const NUM = ["t_price", "ret_4w", "ret_13w", "ret_26w", "point", "di", "vol_ratio", "composite"];
const INT = ["composite_rank", "ret_4w_rank", "point_rank"];

const parseCsv = (text) => {
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(",");
  return lines.filter(Boolean).map((line) => {
    // 這些檔案沒有引號包欄位，直接切即可
    const cells = line.split(",");
    const row = {};
    cols.forEach((c, i) => (row[c] = cells[i] ?? ""));
    return row;
  });
};

const files = readdirSync(SRC).filter((f) => f.endsWith("_scorecard.csv")).sort();

const snapshots = files.map((f) => {
  const rows = parseCsv(readFileSync(join(SRC, f), "utf-8"));
  return {
    date: rows[0].as_of_date,
    file: f,
    sectors: rows.map((r) => {
      const out = { symbol: r.sector, name: r.sector_name, nameEn: r.sector_name_en, alert: r.gap_alert || "" };
      for (const k of NUM) out[k] = r[k] === "" ? null : Number(r[k]);
      for (const k of INT) out[k] = r[k] === "" ? null : parseInt(r[k], 10);
      return out;
    }),
  };
});

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "scorecards.ts"),
  `// 由 scripts/prep-data.mjs 自動產生 —— 不要手改\n` +
    `// 來源：data/sector_rotation/*_scorecard.csv（${snapshots.length} 期，` +
    `${snapshots[0].date} → ${snapshots[snapshots.length - 1].date}）\n\n` +
    `export type Sector = {\n` +
    `  symbol: string; name: string; nameEn: string; alert: string;\n` +
    `  t_price: number | null; ret_4w: number | null; ret_13w: number | null;\n` +
    `  ret_26w: number | null; point: number | null; di: number | null;\n` +
    `  vol_ratio: number | null; composite: number | null;\n` +
    `  composite_rank: number | null; ret_4w_rank: number | null; point_rank: number | null;\n` +
    `};\n\n` +
    `export type Snapshot = { date: string; file: string; sectors: Sector[] };\n\n` +
    `export const SNAPSHOTS: Snapshot[] = ${JSON.stringify(snapshots, null, 2)} as const;\n\n` +
    `export const byDate = (date: string): Snapshot => {\n` +
    `  const found = SNAPSHOTS.find((s) => s.date === date);\n` +
    `  if (!found) throw new Error(\`沒有這一期的資料：\${date}（可用：\${SNAPSHOTS.map((s) => s.date).join(", ")}）\`);\n` +
    `  return found;\n` +
    `};\n`,
);

console.log(`✅ ${snapshots.length} 期 → src/data/scorecards.ts`);
console.log(snapshots.map((s) => `${s.date} (${s.sectors.length} 類股)`).join("\n"));
