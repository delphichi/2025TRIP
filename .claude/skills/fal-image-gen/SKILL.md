---
name: fal-image-gen
description: 透過 FAL AI 平台生成或編輯圖片與影片。圖片：fal-ai/nano-banana-2、openai/gpt-image-2；影片：minimax/h3、bytedance/seedance-2.0、fal-ai/kling-video/v3/pro，每個模型都含多種接口。當使用者說「生成圖片」「畫一張圖」「做一張海報／插圖／封面」「編輯這張圖」「改圖」「把背景換掉」「用參考圖生成」「生成影片」「做一支影片」「把這張圖變成影片」「做個動畫」「產生影片素材」，或任何要產出 / 修改圖片或影片檔的需求時使用。Generate or edit images and videos via the FAL AI platform; triggers on any request to create, draw, render, animate, or edit an image or video.
---

# FAL AI 圖片 / 影片生成

用 FAL AI 平台生成圖片、編輯既有圖片，或生成影片，結果自動存到專案的「完成檔」資料夾。

## 使用前提

- API 金鑰放在專案根目錄的 `.env`（`FAL_KEY=...`）。若還沒建立，請使用者把 `.env.example` 複製成 `.env` 並填入金鑰。
- 參考圖一律從專案根目錄的「參考圖」資料夾讀取。
- 輸出一律寫到專案根目錄的「完成檔」資料夾，檔名 `模型名稱-年月日-時分.<副檔名>`
  （圖片 `nano-banana-2-20260824-1630.png`／影片 `kling-v3-pro-20260824-1630.mp4`）。

## 預設值（使用者沒特別說就照這個走）

| 項目 | 預設 |
|------|------|
| 長寬比 | **16:9** |
| 張數 | **1 張** |
| 圖片模型 | `nano-banana-2` |
| 圖片接口 | 有參考圖 → `edit`；沒有 → `text-to-image` |
| 圖片解析度 | `1K` |
| 格式 | 圖片 `png`／影片 `mp4` |
| 影片接口 | 沒參考圖 → `text-to-video`；1 張 → `image-to-video`；多張 → `reference-to-video` |
| 影片長度／解析度／音訊 | **不要自己決定，逐題問使用者**（見下方影片流程） |

只有在使用者明確說了別的（例如「直式」「9:16」「給我 4 張」「用 GPT 那個模型」「要 4K」）才覆寫。

## 執行方式

一律呼叫腳本，不要自己手刻 API request：

```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py \
  --model nano-banana-2 \
  --prompt "夕陽下的台北 101，電影感光線"
```

常用選項：

```bash
--model / -m          圖片：nano-banana-2 | gpt-image-2
                      影片：minimax-h3 | seedance-2.0 | kling-v3-pro
                      （也吃 fal-ai/... 或 bytedance/... 等完整 id，以及 kling、seedance 等簡稱）
--endpoint / -e       圖片：text-to-image | edit
                      影片：text-to-video | image-to-video | reference-to-video
                            （seedance 另有 fast-text-to-video 等 fast 版）
                      省略時自動判斷
--prompt / -p         提示詞
--aspect-ratio / -a   16:9（預設）、9:16、1:1、4:3、21:9…；edit 想保留原圖比例用 auto
--num-images / -n     張數，預設 1
--resolution / -r     1K（預設）| 2K | 4K
--quality             gpt-image-2 專用：low | medium | high（預設 high）
--input-fidelity      gpt-image-2 edit 專用：low | high（high 更貼近原圖）
--ref <檔名>          參考圖，自動到「參考圖」資料夾找；可重複給多張
--ref-all             使用「參考圖」資料夾內全部圖片
--mask <檔案>         遮罩圖（gpt-image-2 edit 專用）
--seed / --extra      隨機種子 / 附加 JSON 參數
--dry-run             只印出將送出的參數，不呼叫 API
--list-models         列出所有模型與接口
```

## 典型情境

**1. 純文字生圖（預設 16:9、1 張）**
```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py -p "極簡風格的咖啡廳插畫"
```

**2. 指定模型與張數**
```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py -m gpt-image-2 \
  -p "a futuristic Taipei skyline" -n 3 -r 2K
```

**3. 用參考圖編輯（使用者提到「這張圖」「參考圖」「照片」時）**
```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py -m nano-banana-2 -e edit \
  -p "把背景換成雪山，保留人物" --ref cat.png
```
使用者若沒說是哪個檔案，先 `ls 參考圖/` 看有哪些圖，再決定要帶哪幾張（或跟使用者確認）。

**4. 多張參考圖合成**
```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py -e edit \
  -p "把 A 的人物放進 B 的場景" --ref a.jpg --ref b.jpg
```

## 提示詞擴寫（每次生成都必做）

使用者給的通常只是一個主題（例如「一隻貓在咖啡廳」）。**不要把它原封不動送進模型**，
要依下列五個面向擴寫成具體、可視覺化的描述。使用者沒提到的面向，由你依主題合理補上；
使用者已明確指定的部分，一律照他說的，不可改動。

| 面向 | 要寫進提示詞的內容 |
|------|-------------------|
| **主題 Subject** | 視覺焦點是什麼；角色的表情、姿勢、情緒；服裝、配件、道具的具體細節 |
| **構圖 Composition** | 主體在畫面中的比例與位置；相機視角（特寫／中景／遠景、仰視／俯視／平視）；畫面平衡與留白 |
| **場景 Scene** | 背景環境；光照（自然光、逆光、霓虹燈、燭光、霧氣…）；氛圍；特殊細節（煙霧、水滴、塵埃、反光…） |
| **風格 Style** | 藝術風格（寫實攝影、水彩插畫、3D 渲染、極簡、賽博龐克…）；色彩搭配；材質質感 |
| **鏡頭 Lens** | 具體鏡頭規格（如 `50mm f/1.8`、`85mm f/1.4`、`24mm f/8`）；景深（淺景深散景／全景深） |

寫法要點：
- **送給模型的提示詞用英文**（模型對英文理解較準），中文版只是給使用者確認用。
- 用具體名詞與數值，不要用「很美」「有質感」這種空話。
- 一段連貫的描述即可，不必逐項標題化；長度約 60–120 字（英文 words）。
- 這兩個模型都**沒有 negative prompt 參數**，不想要的東西直接寫進句子（例如 `no text, no watermark, no extra limbs`）。
- 詳細的風格、光線、鏡頭用語對照表見 `references/prompt-guide.md`。

## 確認關卡（送出前一定要等使用者點頭）

擴寫完成後，**先把提示詞給使用者看，不要直接執行腳本**。輸出格式固定如下：

```
**English prompt**（實際送給模型的版本）
<擴寫後的英文提示詞>

**中文翻譯**（給你確認用）
<對應的中文翻譯>

**參數**：模型 nano-banana-2 ／ 接口 text-to-image ／ 比例 16:9 ／ 張數 1 ／ 解析度 1K
```

然後停下來等回覆：

- 使用者說「可以／OK／就這樣／生成吧」→ 才執行腳本，`--prompt` 帶**英文版**。
- 使用者要求調整 → 改完再依同樣格式給一次，再等確認。
- 使用者一開始就說「直接生」「不用確認」「快點」→ 可略過確認，但仍要擴寫，並在回覆中附上實際送出的提示詞。

編輯既有圖片（`edit` 接口）時同樣要擴寫＋確認，重點放在「**要改什麼**」與「**要保留什麼**」，
例如「replace the background with a snow-capped mountain range at dusk, keep the subject's pose,
outfit and lighting direction unchanged」。

## 影片生成

使用者要影片時（「生成影片」「做一支影片」「把這張圖變成影片」「做個動畫」），
**依序完成兩件事，兩件都做完才能執行腳本**：

### 第一件事：優化提示詞，先讓使用者過目

影片提示詞的重點跟圖片不同 — 圖片描述「一個瞬間」，影片要描述「一段時間內的變化」。
擴寫時務必寫進：

| 面向 | 要寫進提示詞的內容 |
|------|-------------------|
| **角色動作與表情變化** | 動作的先後順序與速度；表情如何從 A 變成 B（例：「原本緊繃的眉頭在抬頭那一刻鬆開，嘴角浮現半個微笑」） |
| **環境的動態元素** | 會動的東西：飄動的蒸氣、搖晃的樹枝、經過的車流、雨水沿窗滑落、人群走動、光影移動 |
| **相機運鏡** | 具體運鏡方式（緩慢推軌 dolly in、環繞 orbit、手持跟拍 handheld follow、升降 crane down、固定機位 static、甩鏡 whip pan）＋ 景別與角度，以及運鏡過程中構圖如何改變 |
| **光線與氛圍** | 打光、色調、氣氛，以及這些在片中是否變化 |
| **風格** | 整體風格（電影實拍、動畫、定格、紀錄片手持、3D 渲染）、鏡頭特性、景深 |

寫法要點：
- 送給模型的用**英文**，另附中文翻譯給使用者確認。
- 70–140 字（英文 words），寫成**一段連貫敘述**，不要分鏡表、不要時間碼、不要 Shot 1 / Shot 2。
- 描述**一顆連續鏡頭**，除非使用者明講要多個鏡頭。
- 動作要「拍得出來」：寫具體的身體動作與速度，不要寫「很有張力」這種抽象詞。
- 常用運鏡與動態詞彙見 `references/prompt-guide.md` 的影片段落。

輸出格式與圖片相同（English prompt ＋ 中文翻譯），**先給使用者看過**。

### 第二件事：逐題確認參數

提示詞確認後，**一次只問一個參數，並把該參數所有可選項列出來**（用 AskUserQuestion，一題一次）。
順序如下，使用者已經講過的就跳過：

| 順序 | 參數 | 選項 |
|------|------|------|
| 1 | 模型（使用者沒指定時才問） | `minimax-h3`（2K 畫質最好）／`seedance-2.0`（可選 fast 版，較快較便宜）／`kling-v3-pro`（運鏡與音訊強） |
| 2 | 影片長度 | minimax-h3：5–15 秒／seedance-2.0：4–15 秒 或 `auto`／kling-v3-pro：3–15 秒（預設 5） |
| 3 | 解析度 | minimax-h3：`2K`（唯一選項，可直接告知不用問）／seedance-2.0：`480p`／`720p`／`1080p`／kling-v3-pro：無此參數 |
| 4 | 寬高比 | minimax-h3：21:9／16:9／4:3／1:1／3:4／9:16；seedance-2.0 同上；kling-v3-pro：16:9／9:16／1:1。**預設 16:9**，使用者已指定就不用問 |
| 5 | 原生音訊 | seedance-2.0 與 kling-v3-pro 支援：要／不要（kling 預設要）。minimax-h3 無此參數 |

不適用於該模型的參數不要問（例如 kling 不要問解析度）。
問完把最終指令與所有參數複述一次，得到確認後才執行。

### 執行

```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py \
  --model kling-v3-pro --endpoint text-to-video \
  --prompt "<擴寫後的英文提示詞>" \
  --aspect-ratio 16:9 --duration 5 --generate-audio
```

以圖生影（首幀來自「參考圖」資料夾）：
```bash
python3 .claude/skills/fal-image-gen/scripts/fal_image.py \
  --model seedance-2.0 --endpoint image-to-video \
  --prompt "<擴寫後的英文提示詞>" --ref cat.png --duration 5 --resolution 720p
```

minimax-h3 的 `image-to-video` 給兩張圖時，第一張是首幀、第二張是尾幀。
影片生成通常要跑好幾分鐘，腳本會走佇列模式並自動把等待上限拉到 30 分鐘。

## 給 Claude 的工作流程

0. **先判斷是圖片還是影片**：要影片就走上面的「影片生成」兩步流程（擴寫 → 逐題確認參數）。以下是圖片流程。
1. **判斷模型與接口**：使用者指名就照指名；沒指名用 `nano-banana-2`。有參考圖 → `edit`，沒有 → `text-to-image`。
2. **檢查參考圖**：提示詞提到參考圖時，先 `ls 參考圖/` 確認檔名，別瞎猜。
3. **補上預設值**：沒提到比例就 16:9、沒提到張數就 1 張。
4. **擴寫提示詞**：依上面五個面向（主題／構圖／場景／風格／鏡頭）寫成具體的英文提示詞。
5. **給使用者確認**：英文提示詞 + 中文翻譯 + 參數，**停下來等回覆，不要先跑腳本**。
6. **執行腳本**（確認之後）：`--prompt` 帶英文版，成功後把存檔路徑回報給使用者。
7. **失敗處理**：
   - 找不到金鑰 → 請使用者填 `.env` 的 `FAL_KEY`。
   - HTTP 422 → 參數不被該接口接受，對照 `references/endpoints.md` 調整。
   - 超過 3:1 的極端比例 → `gpt-image-2` 不支援，改用 `nano-banana-2`。

## 接口一覽

| 模型 | 接口 | FAL Endpoint ID |
|------|------|-----------------|
| nano-banana-2 | text-to-image | `fal-ai/nano-banana-2` |
| nano-banana-2 | edit | `fal-ai/nano-banana-2/edit`（最多 14 張參考圖） |
| gpt-image-2 | text-to-image | `openai/gpt-image-2` |
| gpt-image-2 | edit | `openai/gpt-image-2/edit`（支援 mask_url、input_fidelity） |
| minimax-h3 | text-to-video | `minimax/h3/text-to-video` |
| minimax-h3 | image-to-video | `minimax/h3/image-to-video`（可給首幀＋尾幀） |
| minimax-h3 | reference-to-video | `minimax/h3/reference-to-video` |
| seedance-2.0 | text-to-video | `bytedance/seedance-2.0/text-to-video` |
| seedance-2.0 | fast-text-to-video | `bytedance/seedance-2.0/fast/text-to-video` |
| seedance-2.0 | image-to-video | `bytedance/seedance-2.0/image-to-video` |
| seedance-2.0 | fast-image-to-video | `bytedance/seedance-2.0/fast/image-to-video` |
| seedance-2.0 | reference-to-video | `bytedance/seedance-2.0/reference-to-video`（最多 12 個參考檔） |
| seedance-2.0 | fast-reference-to-video | `bytedance/seedance-2.0/fast/reference-to-video` |
| kling-v3-pro | text-to-video | `fal-ai/kling-video/v3/pro/text-to-video` |
| kling-v3-pro | image-to-video | `fal-ai/kling-video/v3/pro/image-to-video`（比例由首幀決定） |

各接口完整參數說明見 `references/endpoints.md`。要新增模型或接口，直接編輯 `scripts/fal_image.py` 最上方的 `MODELS` 表即可。

## 測試

**離線自測（不呼叫 API、不花錢）**
```bash
bash .claude/skills/fal-image-gen/scripts/selftest.sh
```
會檢查：接口註冊、預設值（16:9／1 張）、參數組裝、參考圖解析、image_size 換算合規性、檔名規則、錯誤處理。

**真實 API 測試（會消耗額度）**
```bash
bash .claude/skills/fal-image-gen/scripts/selftest.sh --live
```

**在 GitHub 上跑**
- `Actions → fal-image-selftest`：自測（推送到 `.claude/skills/fal-image-gen/**` 時也會自動跑）
- `Actions → fal-image`：生圖，需先設定 repo secret `FAL_KEY`
- 需先設定 repo secret `FAL_KEY`

## GitHub Action 的三種模式

Action 不會執行這份技能檔（技能只有 Claude 會讀），所以擴寫與確認是用 `mode` 參數做成兩段式：

| mode | 行為 |
|------|------|
| `preview`（預設） | 只把主題擴寫成完整提示詞，英文 + 中文印在執行摘要頁，**不生圖、不花圖片額度** |
| `generate` | 擴寫後直接生圖 |
| `raw` | 完全照輸入的字生圖，不擴寫 |

Action 的 `model` 下拉同時涵蓋圖片與影片模型；影片另有 `duration`（長度秒數，留空用模型預設）
與 `audio`（default／on／off）兩個欄位，`resolution` 選 `auto` 就交給模型預設。
選到影片模型時，`preview` 擴寫會自動改用影片版規範（動作變化、環境動態、運鏡）。

擴寫是在 Action 內呼叫 FAL 自家的 `fal-ai/any-llm` 端點完成的，用同一把 `FAL_KEY`，不需要另外的 API 金鑰。
建議流程：先跑 `preview` 看提示詞 → 沒問題就再跑一次 `generate`；想微調就把摘要頁的 English prompt
複製出來改一改，貼回 `prompt` 欄位並選 `raw`。

在對話裡叫 Claude 生圖時不需要這些 — Claude 會直接依上面的「確認關卡」流程走。
