---
name: fal-image-gen
description: 透過 FAL AI 平台生成或編輯圖片（fal-ai/nano-banana-2、openai/gpt-image-2，各含 text-to-image 與 edit 兩種接口）。當使用者說「生成圖片」「畫一張圖」「做一張海報／插圖／封面」「編輯這張圖」「改圖」「把背景換掉」「用參考圖生成」，或任何要產出 / 修改圖片檔的需求時使用。Generate or edit images via the FAL AI platform; triggers on any request to create, draw, render, or edit an image.
---

# FAL AI 圖片生成 / 編輯

用 FAL AI 平台生成新圖或編輯既有圖片，結果自動存到專案的「完成檔」資料夾。

## 使用前提

- API 金鑰放在專案根目錄的 `.env`（`FAL_KEY=...`）。若還沒建立，請使用者把 `.env.example` 複製成 `.env` 並填入金鑰。
- 參考圖一律從專案根目錄的「參考圖」資料夾讀取。
- 輸出一律寫到專案根目錄的「完成檔」資料夾，檔名 `模型名稱-年月日-時分.png`（例如 `nano-banana-2-20260824-1630.png`）。

## 預設值（使用者沒特別說就照這個走）

| 項目 | 預設 |
|------|------|
| 長寬比 | **16:9** |
| 張數 | **1 張** |
| 模型 | `nano-banana-2` |
| 接口 | 有參考圖 → `edit`；沒有 → `text-to-image` |
| 解析度 | `1K` |
| 格式 | `png` |

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
--model / -m          nano-banana-2 | gpt-image-2（也吃 fal-ai/... 或 openai/... 完整 id）
--endpoint / -e       text-to-image | edit（省略時自動判斷）
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

## 給 Claude 的工作流程

1. **判斷模型與接口**：使用者指名就照指名；沒指名用 `nano-banana-2`。有參考圖 → `edit`，沒有 → `text-to-image`。
2. **檢查參考圖**：提示詞提到參考圖時，先 `ls 參考圖/` 確認檔名，別瞎猜。
3. **補上預設值**：沒提到比例就 16:9、沒提到張數就 1 張。
4. **潤飾提示詞**：可以把使用者的中文需求擴寫成更具體的描述（主體、風格、光線、鏡頭、色調），但不要改變原意；擴寫後在回覆中告知實際送出的提示詞。
5. **執行腳本**，成功後把存檔路徑回報給使用者。
6. **失敗處理**：
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
- `Actions → fal-image`：填提示詞直接生圖，結果上傳成 artifact，並可選擇 commit 回「完成檔」
- 需先設定 repo secret `FAL_KEY`
