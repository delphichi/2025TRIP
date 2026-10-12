# 2025TRIP 專案說明

## 做影片前先讀 `影片工具選擇SOP.md`

一句話規則：**看手上已經有什麼零件，不看哪個工具比較新。**

- 已有 Remotion 零件，或有角色的系列 → **Remotion**（例：`tomorrow/video/`）
- 從零開始的短片、片頭、數據動畫 → **HyperFrames**
- 要真實質感的素材 → **FAL**（Seedance 2.0 優先），再交給上面兩者合成
- 同一部片不混用 Remotion 和 HyperFrames
- 劇情重點的文字或數字（日期、數量）一律用程式做，不交給 AI 影片

外接碟是 exFAT：Remotion 的 `npm install` 和 `hyperframes init` 要在 APFS 暫存區跑，細節見 SOP 第五節。

## 資料夾

- `參考圖/`：放參考圖。`完成檔/`：所有生成或 render 好的成品
- 每支片一個資料夾（如 `tomorrow/`），裡面放分鏡腳本、`video/`（Remotion）或 `hf-*/`（HyperFrames）
- 技能清單見 `.claude/skills/README.md`

## 分鏡桌（App）交接流程

App：https://claude.ai/artifact/NK5Y1ptZDS4d3ywGTbf5pM（原始檔 `storyboard-app/分鏡桌.html`，改完用 Artifact 帶這個 url 重新發布）。
使用者在 App 寫劇本、排分鏡，按「交給 Claude」後，對 Claude 說「分鏡桌：做《片名》」。收到後：

1. `ArtifactData` 讀 `projects`（找 status=submitted 的片名）→ `projects/<id>/shots`、`projects/<id>/characters`。
2. 逐格照 `method` 生素材：`seedance` → fal_image.py（Seedance 2.0）；`talk` → MiniMax Music／配音＋InfiniteTalk（`.claude/skills/fal-image-gen/scripts/fal_run.py`）；`image` → Nano Banana；`code` → Remotion。角色參考圖在 asset `/_blob/<refAsset>`，用 Artifact read path 下載。
3. 每格做之前把 shot 改 `status: "generating"`；完成後把成品上傳成該 artifact 的 asset，寫回 `assetId`、`assetType`、`claudeNote`、`status: "done"`（失敗寫 `failed`＋原因）。
4. 全部完成用 Remotion 組成片（專案放 `<片名>/`），成片上傳後寫 project 的 `finalAssetId`、`claudeNote`、`status: "done"`；mp4 也放 `完成檔/`，commit＋push。
5. 花錢的步驟（FAL）開工前先跟使用者報總價。
