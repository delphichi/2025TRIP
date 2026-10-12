# 影片工具選擇 SOP

> 2026-10-12 建立。依據：同一顆 5 秒鏡頭（明天先生撕日曆 13→14→15）用五種方式各做一次的實測，
> 成品在 `完成檔/`（`比較5支-…`、`比較-HyperFrames-vs-Remotion-…`），程式在 `tomorrow/hf-shot/` 與 `tomorrow/video/src/TearTest.tsx`。

## 一、先問一句：手上有沒有現成零件？

**看手上已經有什麼零件，不看哪個工具比較新。**

```
這支片的角色／場景已經用某個工具寫過了嗎？
├─ 有，在 Remotion → 留在 Remotion（加一顆鏡頭約 100 行）
├─ 有，在 HyperFrames → 留在 HyperFrames
└─ 沒有，從零開始 →
     ├─ 有角色、會重複出現、要做成系列 → Remotion
     ├─ 短的、一次性、數據／圖表／片頭 → HyperFrames
     └─ 要真實質感（光影、材質、實拍感）→ FAL 生素材，再交給上面兩者合成
```

**同一部片不要混用 Remotion 和 HyperFrames**，否則角色和風格對不齊，以後改一邊，另一邊也不會跟著變。

## 二、分工表

| 用途 | 工具 | 例子 |
|---|---|---|
| 有角色的系列、長片、鏡頭多 | **Remotion** | 《每次都說明天開始的男孩》（`tomorrow/video/`）、矽路思讀書 |
| 短動畫、片頭、數字跳動、圖表 | **HyperFrames** | 台股月營收連續成長榜 15 秒動畫、股票數據短影音 |
| 真實質感的畫面素材 | **FAL**：Seedance 2.0 優先 | 空鏡、氛圍鏡頭、預告用的單一鏡頭 |
| 動畫品質審查 | **Emil**：`/review-animations` | 每支片第一版做完後跑一次 |

## 三、實測數據（2026-10-12，同一個 prompt）

| | 日期 13→14→15 | 撕了會長高 | 角色和 v1 一致 | 成本 |
|---|---|---|---|---|
| Remotion | ✅ | ✅ | ✅ 同一套零件 | 約 100 行，render 約 30 秒，免費 |
| HyperFrames | ✅ | ✅ | ⚠️ 仿製，改 v1 不會跟著變 | 約 320 行，render 11 秒，免費 |
| Seedance 2.0 | ✅ | 有一點 | ❌ 長相不同 | FAL 額度，三支 AI 裡最貼 prompt、光影最好 |
| Kling v3 Pro | ⚠️ 只翻到 14，地上那張寫 15 | 看不出來 | ❌ | FAL 額度 |
| Minimax H3 | ❌ 飛走的那張寫 15，順序錯 | 不明顯 | ❌ 手臂變綠色 | FAL 額度，2K 最清晰 |

**教訓：**
1. **AI 影片的文字、數字、前後邏輯不可靠**（日期、頁數、因果順序）。畫面裡的文字或數字只要是劇情重點，就用程式做。
2. **AI 影片的角色每次長得都不一樣。** 要放進既有的片子，用 image-to-video，拿既有畫面當第一幀，或者只用來做沒有角色的空鏡。
3. **prompt 裡的邏輯要先對過分鏡規則。** 例如「每撕一頁就長高」跟「頁數＝收了多少個明天」互相矛盾，AI 會照字面亂畫。
4. 程式動畫的強項是**可控**：改一個數字就能免費重新 render。AI 每改一次就重新付一次錢。

## 四、兩個工具的差異

| | Remotion | HyperFrames |
|---|---|---|
| 寫法 | React（TSX），畫面＝第幾格的函數 | HTML／CSS＋GSAP 時間軸 |
| 開工 | 要建專案、`npm install`（約 358 個套件） | 一個 HTML 檔，`npx` 免安裝 |
| 檢查 | 自己看，有 `tsc` 型別檢查 | 內建 `lint`、`check`、`snapshot` |
| 適合 | 零件重用、邏輯複雜、長片 | 從零做短片、網頁風格的視覺 |
| 授權 | 個人和小團隊免費，公司規模大要買授權 | 開源 |

## 五、這台機器的坑（外接碟 exFAT）

- **Remotion 的 `npm install` 不能在外接碟上跑**：exFAT 不支援 symlink，`node_modules/.bin` 會建不起來。
  做法：把專案 rsync 到 APFS 的暫存區（排除 `._*`、`node_modules`），在那裡 install 和 render，再把 mp4 複製回 `完成檔/`。
- **`hyperframes init` 不能在外接碟上跑**：exFAT 不支援 hard link，會出現 `ENOTSUP … link`。
  做法：在暫存區 init，再把 `hyperframes.json`、`package.json` 複製過來。`preview`、`snapshot`、`render` 在外接碟上都正常。
- **HyperFrames render 預設是 30 fps**，要跟 24 fps 的片子對齊就加 `--fps 24`。
- 本機的 ffmpeg 沒有 `drawtext` 濾鏡，影片上的標籤要先用 Python PIL 做成 PNG 再疊上去。
- 每次 commit 前，`._*` 檔已經在 `.gitignore` 裡排除了。

## 六、標準流程

1. 照第一節判斷要用哪個工具。
2. 第一版做完，用 `snapshot`（HyperFrames）或 `remotion still`（Remotion）抽幾格關鍵畫面檢查：**文字、數字、因果順序**。
3. 跑 `/review-animations` 審動畫。
4. render，成品放 `完成檔/`，commit 並 push，網頁版就能同步。
