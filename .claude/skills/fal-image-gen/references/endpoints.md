# FAL 接口參數對照表

所有請求都送到 FAL：

- 佇列模式（腳本預設，適合長任務）：`POST https://queue.fal.run/<endpoint-id>`
  → 回傳 `request_id` / `status_url` / `response_url`，輪詢 `status_url` 直到 `COMPLETED`，再 GET `response_url`。
- 同步模式（`--sync`）：`POST https://fal.run/<endpoint-id>`
- 認證標頭：`Authorization: Key <FAL_KEY>`

參考圖以 **data URI**（`data:image/png;base64,...`）直接放進 `image_urls`，
所以不需要先上傳到 FAL storage，也不需要圖片是公開網址。

---

## 1. nano-banana-2（Google，Gemini 3 Flash Image 架構）

### 1-1 `fal-ai/nano-banana-2` — Text to Image

| 參數 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `prompt` | string | 必填 | 提示詞 |
| `aspect_ratio` | enum | `16:9`（本技能預設） | `auto`, `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`, `4:1`, `1:4`, `8:1`, `1:8` |
| `resolution` | enum | `1K` | `1K`, `2K`, `4K` |
| `num_images` | int | `1` | 一次生成張數（1–4） |
| `output_format` | enum | `png` | `png`, `jpeg` |

### 1-2 `fal-ai/nano-banana-2/edit` — Edit / Image to Image

在 1-1 的參數之外多了：

| 參數 | 型別 | 說明 |
|------|------|------|
| `image_urls` | string[] | 必填。參考圖（網址或 data URI），**最多 14 張** |

特性：不需要遮罩，用自然語言描述要改什麼；可做合成、風格轉換、局部修改。
編輯時若想保留原圖比例，把 `aspect_ratio` 設成 `auto`。

輸出（兩個接口共通）：`{ "images": [{ "url", "width", "height", "content_type" }], "description": ... }`

---

## 2. gpt-image-2（OpenAI）

### 2-1 `openai/gpt-image-2` — Text to Image

| 參數 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `prompt` | string | 必填 | 提示詞 |
| `image_size` | `auto` / preset / `{width,height}` | 由 `--aspect-ratio` + `--resolution` 換算 | 寬高需為 **16 的倍數**、最長邊 ≤ **3840**、總像素 **655,360 ~ 8,294,400**、比例 **≤ 3:1** |
| `num_images` | int | `1` | 最多 8 張，批次間角色/物件具一致性 |
| `quality` | enum | `high` | `low`, `medium`, `high` |
| `output_format` | enum | `png` | `png`, `jpeg`, `webp` |

### 2-2 `openai/gpt-image-2/edit` — Image to Image

在 2-1 的參數之外多了：

| 參數 | 型別 | 說明 |
|------|------|------|
| `image_urls` | string[] | 必填。參考圖（網址或 data URI） |
| `mask_url` | string | 選填。遮罩圖，指定要編輯的區域 |
| `input_fidelity` | enum | 選填。`low` / `high`，越高越貼近原圖細節 |

### 本技能的比例 → image_size 換算表

腳本會自動挑出「比例完全正確、寬高皆為 16 倍數」且最接近該解析度層級的尺寸：

| 比例 | 1K | 2K | 4K |
|------|----|----|----|
| 16:9 | 1536×864 | 2048×1152 | 3840×2160 |
| 9:16 | 864×1536 | 1152×2048 | 2160×3840 |
| 1:1 | 1088×1088 | 1552×1552 | 2832×2832 |
| 4:3 | 1280×960 | 1792×1344 | 3264×2448 |
| 3:2 | 1344×896 | 1920×1280 | 3456×2304 |
| 21:9 | 1680×720 | 2352×1008 | 3808×1632 |

> `4:1`, `1:4`, `8:1`, `1:8` 這類超過 3:1 的極端比例只有 nano-banana-2 支援。

---

## 3. 新增模型 / 接口

編輯 `scripts/fal_image.py` 最上方的 `MODELS` 字典，例如：

```python
"nano-banana-2-lite": {
    "file_slug": "nano-banana-2-lite",
    "endpoints": {
        "text-to-image": {
            "id": "google/nano-banana-2-lite",
            "kind": "text-to-image",
            "supports": ["aspect_ratio", "num_images", "resolution", "output_format"],
        },
    },
    "aspect_ratios": [...],
    "resolutions": ["1K", "2K", "4K"],
},
```

`supports` 決定會送出哪些參數；`kind` 為 `edit` 的接口會強制要求 `image_urls`。

---

## 4. 常見錯誤

| 症狀 | 原因 / 解法 |
|------|-------------|
| `HTTP 401 / 403` | `FAL_KEY` 沒設或無效 → 檢查 `.env` |
| `HTTP 422` | 參數不被該接口接受 → 對照上表，或先用 `--dry-run` 檢查送出內容 |
| `HTTP 429` | 速率限制 → 稍後重試或降低張數 |
| 等待逾時 | 加大 `--timeout`，或改用 `--sync` |
| 找不到參考圖 | 檔案要放在專案根目錄的「參考圖」資料夾內 |
