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
