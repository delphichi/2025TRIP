// 一次打包、算繪多個關鍵格：node scripts/stills.mjs out_dir 8 48 80 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [outDir, ...frames] = process.argv.slice(2);
const browserExecutable = process.env.REMOTION_BROWSER;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: process.env.COMP || "PantyDeRed", browserExecutable });
for (const f of frames) {
  await renderStill({
    composition, serveUrl, browserExecutable, frame: Number(f), scale: 0.4,
    output: path.join(outDir, `f${String(f).padStart(3, "0")}.jpeg`), imageFormat: "jpeg",
  });
  console.log("frame", f);
}
