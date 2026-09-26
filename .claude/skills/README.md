# 專案技能（.claude/skills/）

| 技能 | 來源 | 用途 |
|------|------|------|
| `fal-image-gen` | 本專案自製 | 透過 FAL AI 生成／編輯圖片與影片（生成式素材） |
| `remotion-*`（12 個） | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 用 React 程式碼合成影片（時間軸、轉場、字幕、資料動畫、輸出 MP4） |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 前端設計品質：審查、批評、打磨、動畫、配色、字體排印 |

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


---

## Impeccable（前端設計）

`/impeccable <command>`，24 個指令。常用的：

| 指令 | 用途 |
|------|------|
| `init` | 建立專案脈絡，產生 `PRODUCT.md` 與 `DESIGN.md` |
| `audit` / `critique` | 品質稽核與設計批評（61 條確定性反模式規則 + LLM 批評） |
| `polish` / `harden` / `optimize` | 打磨、收斂、最佳化既有介面 |
| `craft` / `shape` / `generate` | 從零設計新介面 |
| `animate` / `colorize` / `typeset` / `layout` | 動效、配色、字體排印、版面 |
| `bolder` / `quieter` / `delight` | 調整整體強度與個性 |
| `live` | 在瀏覽器裡即時視覺迭代 |

適用對象：`sector-rotation/`、`valuation/`、`stock/`、`rotation/`、`attention/`、
`topic-radar/` 等前端應用，以及 `demo-video/` 的視覺設計。

### 安裝時的三點說明

1. 取自 commit `9d715cc`（skill v4.4.0 / engine v0.1.6），授權 Apache 2.0。
   上游 repo 有 75MB／3261 檔（含各家工具的副本與 CI），這裡只複製 Claude Code 需要的
   `.claude/skills/impeccable/`（59 檔、2.2MB，其中 1.1MB 是字體索引）。
2. **引擎是首次執行時才下載的。** `scripts/impeccable` 是個 launcher，會從
   `github.com/pbakaus/impeccable/releases` 抓對應平台的 binary 到 `~/.impeccable/bin/<版本>/`，
   並比對同來源的 `.sha256`；抓不到 sidecar、沒有雜湊工具或對不上就**拒絕執行**（fail closed）。
   要離線使用可先自行下載並設 `IMPECCABLE_BIN` 指向它。
3. 引擎本身是 repo 內的開源 Rust（300 個 `.rs`、有 Cargo.lock），下載的 binary 是該程式碼的
   建置產物。留意：sha256 sidecar 與 binary 同源，能擋傳輸損毀或 CDN 竄改，
   **擋不了上游 release 本身被入侵** —— 這是這類安裝器的通例。

更新：重跑 `npx impeccable install`，或重新 clone 後複製 `.claude/skills/impeccable/`。
