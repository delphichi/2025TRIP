# 專案技能（.claude/skills/）

| 技能 | 來源 | 用途 |
|------|------|------|
| `fal-image-gen` | 本專案自製 | 透過 FAL AI 生成／編輯圖片與影片（生成式素材） |
| `remotion-*`（12 個） | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 用 React 程式碼合成影片（時間軸、轉場、字幕、資料動畫、輸出 MP4） |

兩者互補：**FAL 生素材 → Remotion 組裝成完整影片**。

## Remotion 技能清單

- `remotion-best-practices` — router，會依任務轉到下列技能（自我完備，內含各技能副本）
- `remotion-create` — 建立新專案 / 新 composition
- `remotion-markup` — React markup、動畫、轉場、特效、音訊、旁白等最佳實務
- `remotion-studio` — 開啟預覽
- `remotion-render` — 輸出影片 / 靜態圖
- `remotion-captions` — 轉錄與字幕
- `remotion-maps` — 地圖動畫（Mapbox / MapLibre / MapTiler / Cesium）
- `remotion-multimedia` — 瀏覽器端裁切、修剪、讀取媒體資訊（Mediabunny）
- `remotion-interactivity` — 讓 Studio 可互動編輯並寫回程式碼
- `remotion-saas` — Player、Lambda / Vercel / Cloudflare 上算繪
- `remotion-docs` — 查官方文件
- `remotion-upgrade` — 升級 Remotion 與這些技能本身

## 安裝與更新

安裝時取自 commit `3b9e656`（Remotion 4.0.525）。官方安裝指令是：

```bash
npx skills add remotion-dev/skills
```

本次為了能逐檔審閱內容，改以 clone + 複製 `skills/*` 到本目錄，結果與上游一致。
之後要更新，用上面的指令，或叫 Claude 執行 `remotion-upgrade` 技能。
