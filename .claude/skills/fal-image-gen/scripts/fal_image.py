#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fal_image.py — 透過 FAL AI 平台生成 / 編輯圖片。

只用 Python 標準函式庫（urllib），不需要 pip install 任何套件。

用法範例
--------
# 文生圖（預設 16:9、1 張）
python3 fal_image.py --model nano-banana-2 --prompt "夕陽下的台北101"

# 指定比例、張數、解析度
python3 fal_image.py --model gpt-image-2 --prompt "a cat astronaut" \
    --aspect-ratio 1:1 --num-images 2 --resolution 2K

# 圖片編輯（參考圖放在「參考圖」資料夾，只要給檔名即可）
python3 fal_image.py --model nano-banana-2 --endpoint edit \
    --prompt "把背景換成雪山" --ref cat.png --ref style.jpg

# 用「參考圖」資料夾內所有圖片
python3 fal_image.py --model nano-banana-2 --endpoint edit --ref-all --prompt "合成一張海報"

輸出檔名：完成檔/<模型名稱>-<YYYYMMDD>-<HHMM>.png
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# --------------------------------------------------------------------------
# 路徑設定
# --------------------------------------------------------------------------
SKILL_DIR = Path(__file__).resolve().parent.parent          # .claude/skills/fal-image-gen
PROJECT_ROOT = SKILL_DIR.parent.parent.parent               # 專案根目錄
REF_DIR_NAME = "參考圖"
OUT_DIR_NAME = "完成檔"

QUEUE_BASE = "https://queue.fal.run"
SYNC_BASE = "https://fal.run"

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic", ".heif"}

# --------------------------------------------------------------------------
# 模型 / 接口（Endpoint）註冊表
#   一個模型可以有多個接口，全部列在 endpoints 裡。
#   若日後 FAL 新增接口，只要在這裡加一筆即可。
# --------------------------------------------------------------------------
MODELS = {
    "nano-banana-2": {
        "media": "image",
        "file_slug": "nano-banana-2",
        "endpoints": {
            # 接口名稱: {id: FAL endpoint id, kind: text-to-image / edit}
            "text-to-image": {
                "id": "fal-ai/nano-banana-2",
                "kind": "text-to-image",
                "supports": ["aspect_ratio", "num_images", "resolution", "output_format"],
            },
            "edit": {
                "id": "fal-ai/nano-banana-2/edit",
                "kind": "edit",
                "max_refs": 14,
                "supports": ["aspect_ratio", "num_images", "resolution",
                             "output_format", "image_urls"],
            },
        },
        "aspect_ratios": ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1",
                          "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8"],
        "resolutions": ["1K", "2K", "4K"],
    },
    "gpt-image-2": {
        "media": "image",
        "file_slug": "gpt-image-2",
        "endpoints": {
            "text-to-image": {
                "id": "openai/gpt-image-2",
                "kind": "text-to-image",
                "supports": ["image_size", "num_images", "quality", "output_format"],
            },
            "edit": {
                "id": "openai/gpt-image-2/edit",
                "kind": "edit",
                "max_refs": 16,
                "supports": ["image_size", "num_images", "quality", "output_format",
                             "image_urls", "mask_url", "input_fidelity"],
            },
        },
        # gpt-image-2 走 image_size（寬高），由 aspect_ratio + resolution 換算
        "aspect_ratios": ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1",
                          "4:5", "3:4", "2:3", "9:16"],
        "resolutions": ["1K", "2K", "4K"],
        "qualities": ["low", "medium", "high"],
    },

    # ---------------- 影片模型 ----------------
    "minimax-h3": {
        "media": "video",
        "file_slug": "minimax-h3",
        "endpoints": {
            "text-to-video": {
                "id": "minimax/h3/text-to-video",
                "kind": "text-to-video",
                "supports": ["aspect_ratio", "duration", "resolution", "prompt_optimizer"],
            },
            "image-to-video": {
                "id": "minimax/h3/image-to-video",
                "kind": "image-to-video",
                "image_field": "image_url",          # 首幀；第二張參考圖會放進 end_image_url
                "end_image_field": "end_image_url",  # 尾幀（可選）
                "max_refs": 2,
                "supports": ["duration", "resolution", "prompt_optimizer", "image_url"],
            },
            "reference-to-video": {
                "id": "minimax/h3/reference-to-video",
                "kind": "reference-to-video",
                "image_field": "image_urls",
                "max_refs": 4,
                "supports": ["aspect_ratio", "duration", "resolution",
                             "prompt_optimizer", "image_urls"],
            },
        },
        "aspect_ratios": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["2K"],
        "default_resolution": "2K",
        "durations": [str(n) for n in range(5, 16)],
    },
    "seedance-2.0": {
        "media": "video",
        "file_slug": "seedance-2.0",
        "endpoints": {
            "text-to-video": {
                "id": "bytedance/seedance-2.0/text-to-video",
                "kind": "text-to-video",
                "supports": ["aspect_ratio", "duration", "resolution", "generate_audio"],
            },
            "fast-text-to-video": {
                "id": "bytedance/seedance-2.0/fast/text-to-video",
                "kind": "text-to-video",
                "supports": ["aspect_ratio", "duration", "resolution", "generate_audio"],
            },
            "image-to-video": {
                "id": "bytedance/seedance-2.0/image-to-video",
                "kind": "image-to-video",
                "image_field": "image_url",
                "max_refs": 1,
                "supports": ["duration", "resolution", "generate_audio", "image_url"],
            },
            "fast-image-to-video": {
                "id": "bytedance/seedance-2.0/fast/image-to-video",
                "kind": "image-to-video",
                "image_field": "image_url",
                "max_refs": 1,
                "supports": ["duration", "resolution", "generate_audio", "image_url"],
            },
            "reference-to-video": {
                "id": "bytedance/seedance-2.0/reference-to-video",
                "kind": "reference-to-video",
                "image_field": "image_urls",
                "max_refs": 12,
                "supports": ["aspect_ratio", "duration", "resolution",
                             "generate_audio", "image_urls"],
            },
            "fast-reference-to-video": {
                "id": "bytedance/seedance-2.0/fast/reference-to-video",
                "kind": "reference-to-video",
                "image_field": "image_urls",
                "max_refs": 12,
                "supports": ["aspect_ratio", "duration", "resolution",
                             "generate_audio", "image_urls"],
            },
        },
        "aspect_ratios": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["480p", "720p", "1080p"],
        "default_resolution": "720p",
        "durations": ["auto"] + [str(n) for n in range(4, 16)],
    },
    "kling-v3-pro": {
        "media": "video",
        "file_slug": "kling-v3-pro",
        "endpoints": {
            "text-to-video": {
                "id": "fal-ai/kling-video/v3/pro/text-to-video",
                "kind": "text-to-video",
                "supports": ["aspect_ratio", "duration", "generate_audio",
                             "negative_prompt", "cfg_scale"],
            },
            "image-to-video": {
                "id": "fal-ai/kling-video/v3/pro/image-to-video",
                "kind": "image-to-video",
                "image_field": "image_url",
                "max_refs": 1,
                # 比例由首幀決定，送 aspect_ratio 也會被忽略
                "supports": ["duration", "generate_audio", "negative_prompt",
                             "cfg_scale", "image_url"],
            },
        },
        "aspect_ratios": ["16:9", "9:16", "1:1"],
        "resolutions": [],
        "durations": [str(n) for n in range(3, 16)],
    },
}

# 常見別名，方便使用者/Claude 直接用官方 endpoint id 呼叫
MODEL_ALIASES = {
    "fal-ai/nano-banana-2": "nano-banana-2",
    "nano_banana_2": "nano-banana-2",
    "nanobanana2": "nano-banana-2",
    "nb2": "nano-banana-2",
    "openai/gpt-image-2": "gpt-image-2",
    "gpt_image_2": "gpt-image-2",
    "gptimage2": "gpt-image-2",
    "gpt-image": "gpt-image-2",
    # 影片
    "minimax/h3": "minimax-h3",
    "minimax-h3": "minimax-h3",
    "minimax": "minimax-h3",
    "h3": "minimax-h3",
    "hailuo": "minimax-h3",
    "bytedance/seedance-2.0": "seedance-2.0",
    "seedance": "seedance-2.0",
    "seedance-2": "seedance-2.0",
    "seedance2": "seedance-2.0",
    "fal-ai/kling-video/v3/pro": "kling-v3-pro",
    "kling": "kling-v3-pro",
    "kling-v3": "kling-v3-pro",
    "kling-video-v3-pro": "kling-v3-pro",
}

ENDPOINT_ALIASES = {
    "t2i": "text-to-image",
    "text2image": "text-to-image",
    "txt2img": "text-to-image",
    "generate": "text-to-image",
    "image-to-image": "edit",
    "i2i": "edit",
    "img2img": "edit",
    "editing": "edit",
    # 影片
    "t2v": "text-to-video",
    "text2video": "text-to-video",
    "i2v": "image-to-video",
    "image2video": "image-to-video",
    "img2video": "image-to-video",
    "ref": "reference-to-video",
    "reference": "reference-to-video",
    "r2v": "reference-to-video",
    "fast": "fast-text-to-video",
    "fast-t2v": "fast-text-to-video",
    "fast-i2v": "fast-image-to-video",
}

# gpt-image-2 的像素預算（total pixels 需介於 655,360 ~ 8,294,400）
PIXEL_BUDGET = {"1K": 1_200_000, "2K": 2_400_000, "4K": 8_000_000}
GPT_MIN_PIXELS, GPT_MAX_PIXELS = 655_360, 8_294_400
GPT_MAX_EDGE = 3840


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------
def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def die(msg: str, code: int = 1) -> "NoReturn":  # type: ignore[valid-type]
    print(f"❌ {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def load_env_file(path: Path) -> dict:
    """極簡 .env 解析：KEY=VALUE，支援 # 註解與引號。"""
    data = {}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return data
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        data[key.strip()] = value
    return data


def resolve_api_key(explicit_env: Path | None = None) -> str:
    """依序尋找金鑰：環境變數 → 指定的 .env → 專案根 .env → 技能資料夾 .env → cwd/.env"""
    for name in ("FAL_KEY", "FAL_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value

    candidates = []
    if explicit_env:
        candidates.append(explicit_env)
    candidates += [
        PROJECT_ROOT / ".env",
        SKILL_DIR / ".env",
        Path.cwd() / ".env",
    ]
    for path in candidates:
        if path and path.is_file():
            env = load_env_file(path)
            for name in ("FAL_KEY", "FAL_API_KEY"):
                value = env.get(name, "").strip()
                if value and not value.startswith("your-"):
                    return value

    die(
        "找不到 FAL API 金鑰。\n"
        f"   請把 {PROJECT_ROOT / '.env.example'} 複製成 {PROJECT_ROOT / '.env'}，\n"
        "   並填入 FAL_KEY=你的金鑰（或先 export FAL_KEY=...）。"
    )


def http_json(url: str, api_key: str, payload: dict | None = None,
              method: str = "POST", timeout: int = 300, soft: bool = False):
    """soft=True 時失敗回傳 None（不中止），讓呼叫端可以換一個模型再試。"""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Key {api_key}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        if soft:
            log(f"   （HTTP {exc.code}：{detail[:200]}）")
            return None
        hint = ""
        if exc.code in (401, 403):
            hint = "\n   → 金鑰無效或沒有權限，請確認 .env 內的 FAL_KEY。"
        elif exc.code == 422:
            hint = "\n   → 參數不被此接口接受，請對照 references/endpoints.md。"
        die(f"FAL API 回傳 HTTP {exc.code}：{detail[:1500]}{hint}")
    except urllib.error.URLError as exc:
        if soft:
            log(f"   （連線失敗：{exc.reason}）")
            return None
        die(f"無法連線到 FAL（{exc.reason}）。請檢查網路或 Proxy 設定。")
    return json.loads(body) if body else {}


def to_data_uri(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if not mime or not mime.startswith("image/"):
        mime = "image/png"
    raw = path.read_bytes()
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def resolve_ref(ref: str, ref_dir: Path) -> Path:
    """參考圖可以給完整路徑，也可以只給檔名（自動到「參考圖」資料夾找）。"""
    candidate = Path(ref).expanduser()
    if candidate.is_file():
        return candidate
    inside = ref_dir / ref
    if inside.is_file():
        return inside
    # 允許省略副檔名
    for ext in sorted(IMAGE_EXTS):
        guess = ref_dir / f"{ref}{ext}"
        if guess.is_file():
            return guess
    die(f"找不到參考圖「{ref}」。請確認檔案存在於 {ref_dir}/ 之中。")


def collect_all_refs(ref_dir: Path) -> list:
    if not ref_dir.is_dir():
        die(f"參考圖資料夾不存在：{ref_dir}")
    files = sorted(p for p in ref_dir.iterdir()
                   if p.is_file() and p.suffix.lower() in IMAGE_EXTS)
    if not files:
        die(f"「{ref_dir}」資料夾內沒有任何圖片。")
    return files


def ratio_tuple(aspect: str) -> tuple:
    m = re.fullmatch(r"(\d+)\s*[:x/]\s*(\d+)", aspect.strip())
    if not m:
        die(f"看不懂的長寬比：{aspect}（請用像 16:9 的格式）")
    return int(m.group(1)), int(m.group(2))


def image_size_for(aspect: str, resolution: str) -> dict:
    """把 aspect_ratio + 解析度層級換算成 gpt-image-2 需要的 {width, height}。
    規則：寬高皆為 16 的倍數、最長邊 <= 3840、總像素介於 655,360 ~ 8,294,400。
    盡量取「剛好等於指定比例」的尺寸（例如 16:9 -> 1536x864）。"""
    w_ratio, h_ratio = ratio_tuple(aspect)
    g = math.gcd(w_ratio, h_ratio)
    w_ratio, h_ratio = w_ratio // g, h_ratio // g
    if max(w_ratio, h_ratio) / min(w_ratio, h_ratio) > 3.0:
        die(f"gpt-image-2 不支援超過 3:1 的長寬比（收到 {aspect}）。"
            f"請改用 nano-banana-2，或換一個比例。")

    target = PIXEL_BUDGET.get(resolution.upper(), PIXEL_BUDGET["1K"])

    def ok(w: int, h: int) -> bool:
        return (w % 16 == 0 and h % 16 == 0
                and max(w, h) <= GPT_MAX_EDGE
                and GPT_MIN_PIXELS <= w * h <= GPT_MAX_PIXELS)

    # 1) 先找「比例完全正確」且寬高都是 16 倍數的尺寸，取最接近目標像素的那組
    step = (16 // math.gcd(16, w_ratio)) * (16 // math.gcd(16, h_ratio))
    step = step // math.gcd(16 // math.gcd(16, w_ratio), 16 // math.gcd(16, h_ratio))
    exact = [(abs(w_ratio * t * h_ratio * t - target), w_ratio * t, h_ratio * t)
             for t in range(step, 4001, step)
             if ok(w_ratio * t, h_ratio * t)]
    if exact:
        _, width, height = min(exact)
        return {"width": int(width), "height": int(height)}

    # 2) 找不到就退而求其次，四捨五入到 16 的倍數並把像素數拉回合法區間
    def build(px_target: float) -> tuple:
        scale = math.sqrt(px_target / (w_ratio * h_ratio))
        w = max(16, int(round(w_ratio * scale / 16)) * 16)
        h = max(16, int(round(h_ratio * scale / 16)) * 16)
        return w, h

    width, height = build(target)
    if max(width, height) > GPT_MAX_EDGE:
        shrink = GPT_MAX_EDGE / max(width, height)
        width, height = build(target * shrink * shrink)
    for _ in range(8):
        pixels = width * height
        if pixels < GPT_MIN_PIXELS:
            target *= 1.2
        elif pixels > GPT_MAX_PIXELS or max(width, height) > GPT_MAX_EDGE:
            target *= 0.8
        else:
            break
        width, height = build(target)
    return {"width": int(width), "height": int(height)}


# --------------------------------------------------------------------------
# 提示詞擴寫（透過 FAL 自家的 any-llm 端點，用同一把 FAL_KEY）
# --------------------------------------------------------------------------
ANY_LLM_ENDPOINT = "fal-ai/any-llm"

# 依序嘗試，第一個成功的就用；可用 --llm-model 指定
LLM_CANDIDATES = [
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.2-3b-instruct",
]

EXPAND_SYSTEM_PROMPT = """You expand a short image idea into one production-ready prompt for a \
text-to-image model, then translate it to Traditional Chinese (Taiwan).

Cover all five facets, weaving them into ONE flowing paragraph (do not use headings or bullets):
1. SUBJECT - the visual focus; facial expression, pose, emotion; clothing, props, accessories.
2. COMPOSITION - subject scale and placement in frame; camera angle (close-up / medium / wide,
   low / high / eye level); visual balance and negative space.
3. SCENE - background environment; lighting (natural, backlit, neon, candlelight, fog...);
   mood; atmospheric details (smoke, water droplets, dust motes, reflections...).
4. STYLE - artistic style (photorealistic, watercolour, 3D render, minimalist, cyberpunk...);
   colour palette; material texture.
5. LENS - a concrete lens spec such as 85mm f/1.4 or 24mm f/8; depth of field.

Rules:
- Keep every detail the user explicitly asked for; never contradict or drop it.
- Invent sensible specifics only for facets the user left open.
- 60-120 words of English. Concrete nouns and numbers, never vague praise like "beautiful".
- The model has no negative-prompt parameter, so state exclusions inline
  (e.g. "no text, no watermark").
- The Chinese translation must faithfully mirror the English, for the user to review.

Reply with ONLY this JSON object and nothing else:
{"english": "<the expanded English prompt>", "chinese": "<Traditional Chinese translation>"}"""


EXPAND_SYSTEM_PROMPT_VIDEO = """You expand a short video idea into one production-ready prompt for a \
text-to-video model, then translate it to Traditional Chinese (Taiwan).

Cover all of these, woven into ONE flowing paragraph (no headings, no shot list, no timestamps):
1. SUBJECT & PERFORMANCE - who or what is on screen; how the pose, gesture and facial expression
   CHANGE over the clip (e.g. "her guarded frown softens into a half-smile as she looks up").
   Motion is the point: describe what moves, in what order, at what speed.
2. ENVIRONMENT IN MOTION - the setting plus its moving elements: drifting steam, swaying branches,
   passing traffic, rain streaking a window, crowd movement, shifting light and shadow.
3. CAMERA WORK - a concrete camera move (slow dolly in, orbit around the subject, handheld follow,
   crane down, static locked-off tripod, whip pan) plus shot size and angle, and how framing
   changes as the move progresses.
4. LIGHT & MOOD - lighting setup, colour palette, atmosphere, and any change in them over time.
5. STYLE - overall look (cinematic live action, anime, stop-motion, documentary handheld, 3D render),
   film stock or lens character, depth of field.

Rules:
- Keep every detail the user explicitly asked for; never contradict or drop it.
- Invent sensible specifics only for what the user left open.
- 70-140 words of English. Concrete, filmable actions - never vague praise like "stunning".
- Describe ONE continuous shot unless the user asked for multiple shots.
- Do not write camera-direction abbreviations or scene numbers; write it as flowing description.
- The Chinese translation must faithfully mirror the English, for the user to review.

Reply with ONLY this JSON object and nothing else:
{"english": "<the expanded English prompt>", "chinese": "<Traditional Chinese translation>"}"""


def parse_llm_json(text: str) -> dict | None:
    """從 LLM 回應中取出 {"english": ..., "chinese": ...}，容忍 ```json 圍欄與前後雜訊。"""
    if not text:
        return None
    cleaned = re.sub(r"^\s*```(?:json)?|```\s*$", "", text.strip(), flags=re.MULTILINE).strip()
    candidates = [cleaned]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end > start:
        candidates.append(cleaned[start:end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            english = str(data.get("english", "")).strip()
            chinese = str(data.get("chinese", "")).strip()
            if english and chinese:
                return {"english": english, "chinese": chinese}
    return None


def expand_prompt(raw_prompt: str, api_key: str, llm_model: str | None = None,
                  context: str = "", media: str = "image") -> dict:
    """把使用者的簡短想法擴寫成完整英文提示詞 + 中文翻譯。"""
    models = [llm_model] if llm_model else LLM_CANDIDATES
    system = EXPAND_SYSTEM_PROMPT_VIDEO if media == "video" else EXPAND_SYSTEM_PROMPT
    user_msg = raw_prompt if not context else f"{raw_prompt}\n\n(Context: {context})"

    for model in models:
        log(f"→ 擴寫提示詞（{ANY_LLM_ENDPOINT} / {model}）")
        result = http_json(
            f"{SYNC_BASE}/{ANY_LLM_ENDPOINT}", api_key,
            {"model": model, "prompt": user_msg, "system_prompt": system},
            timeout=240, soft=True,
        )
        if not result:
            continue
        text = result.get("output") or result.get("text") or result.get("response") or ""
        parsed = parse_llm_json(text)
        if parsed:
            parsed["llm_model"] = model
            return parsed
        log("   （回應不是預期的 JSON，換下一個模型）")

    die("提示詞擴寫失敗：所有候選 LLM 模型都無法使用。\n"
        "   可用 --llm-model 指定一個 FAL any-llm 支援的模型，\n"
        "   或改用不擴寫的方式（不要加 --expand / --expand-only）直接送出原提示詞。")


# --------------------------------------------------------------------------
# 建立 payload
# --------------------------------------------------------------------------
def build_payload(model_key: str, endpoint_key: str, args, ref_paths: list) -> dict:
    model = MODELS[model_key]
    endpoint = model["endpoints"][endpoint_key]
    supports = endpoint["supports"]

    payload: dict = {"prompt": args.prompt}

    if "num_images" in supports:
        payload["num_images"] = args.num_images
    if "output_format" in supports:
        payload["output_format"] = args.output_format

    if "aspect_ratio" in supports:
        if args.aspect_ratio not in model["aspect_ratios"]:
            if model["media"] == "image":
                die(f"{model_key} 不支援長寬比 {args.aspect_ratio}。"
                    f"可用：{', '.join(model['aspect_ratios'])}")
            log(f"⚠️  {model_key} 的已知長寬比為 {', '.join(model['aspect_ratios'])}，"
                f"仍照你指定的 {args.aspect_ratio} 送出。")
        payload["aspect_ratio"] = args.aspect_ratio
    if "resolution" in supports and args.resolution:
        # 影片解析度是 720p / 2K 這種寫法，圖片是 1K / 2K / 4K
        payload["resolution"] = (args.resolution if model["media"] == "video"
                                 else args.resolution.upper())

    if "image_size" in supports:
        if args.aspect_ratio == "auto":
            payload["image_size"] = "auto"
        else:
            payload["image_size"] = image_size_for(args.aspect_ratio, args.resolution or "1K")

    if "duration" in supports:
        duration = str(args.duration) if args.duration is not None else None
        if duration:
            known = model.get("durations", [])
            if known and duration not in known:
                log(f"⚠️  {model_key} 的已知長度為 {', '.join(known)} 秒，"
                    f"仍照你指定的 {duration} 送出。")
            payload["duration"] = duration
    if "generate_audio" in supports and args.generate_audio is not None:
        payload["generate_audio"] = args.generate_audio
    if "negative_prompt" in supports and args.negative_prompt:
        payload["negative_prompt"] = args.negative_prompt
    if "cfg_scale" in supports and args.cfg_scale is not None:
        payload["cfg_scale"] = args.cfg_scale
    if "prompt_optimizer" in supports and args.prompt_optimizer is not None:
        payload["prompt_optimizer"] = args.prompt_optimizer

    if "quality" in supports:
        payload["quality"] = args.quality
    if "input_fidelity" in supports and args.input_fidelity:
        payload["input_fidelity"] = args.input_fidelity

    needs_refs = endpoint["kind"] in ("edit", "image-to-video", "reference-to-video")
    if needs_refs:
        if not ref_paths:
            die(f"接口 {endpoint['id']} 需要參考圖。"
                f"請用 --ref <檔名>（放在「{REF_DIR_NAME}」資料夾）或 --ref-all。")
        max_refs = endpoint.get("max_refs", 8)
        if len(ref_paths) > max_refs:
            die(f"{endpoint['id']} 最多接受 {max_refs} 張參考圖，收到 {len(ref_paths)} 張。")

        field = endpoint.get("image_field", "image_urls")
        if field == "image_url":
            payload["image_url"] = to_data_uri(ref_paths[0])
            end_field = endpoint.get("end_image_field")
            if len(ref_paths) > 1 and end_field:
                payload[end_field] = to_data_uri(ref_paths[1])   # 尾幀
            elif len(ref_paths) > 1:
                log(f"⚠️  {endpoint['id']} 只吃一張圖，忽略其餘 {len(ref_paths) - 1} 張。")
        else:
            payload[field] = [to_data_uri(p) for p in ref_paths]

        if getattr(args, "mask", None) and "mask_url" in supports:
            payload["mask_url"] = to_data_uri(Path(args.mask).expanduser())
    elif ref_paths:
        hint = "--endpoint edit" if model["media"] == "image" else "--endpoint image-to-video"
        log(f"⚠️  接口 {endpoint['id']} 不吃參考圖，忽略 {len(ref_paths)} 張"
            f"（要用參考圖請加 {hint}）。")

    if args.seed is not None:
        payload["seed"] = args.seed
    if args.extra:
        try:
            payload.update(json.loads(args.extra))
        except json.JSONDecodeError as exc:
            die(f"--extra 不是合法的 JSON：{exc}")
    return payload


def redact(payload: dict) -> dict:
    """把 base64 圖片內容縮短，方便印出來看。"""
    clone = dict(payload)
    if "image_urls" in clone:
        clone["image_urls"] = [f"<data-uri {len(u)} bytes>" for u in clone["image_urls"]]
    for key in ("image_url", "end_image_url"):
        if key in clone:
            clone[key] = f"<data-uri {len(clone[key])} bytes>"
    if "mask_url" in clone:
        clone["mask_url"] = f"<data-uri {len(clone['mask_url'])} bytes>"
    return clone


# --------------------------------------------------------------------------
# 呼叫 FAL（queue 佇列模式，長時間任務不會斷線）
# --------------------------------------------------------------------------
def call_fal(endpoint_id: str, payload: dict, api_key: str,
             sync: bool = False, poll_interval: float = 2.0,
             max_wait: int = 900) -> dict:
    if sync:
        log(f"→ POST {SYNC_BASE}/{endpoint_id}")
        return http_json(f"{SYNC_BASE}/{endpoint_id}", api_key, payload)

    log(f"→ 送出佇列任務：{endpoint_id}")
    submitted = http_json(f"{QUEUE_BASE}/{endpoint_id}", api_key, payload)
    status_url = submitted.get("status_url")
    response_url = submitted.get("response_url")
    request_id = submitted.get("request_id", "?")
    if not status_url or not response_url:
        # 沒有佇列資訊代表已經直接回傳結果
        return submitted

    log(f"   request_id = {request_id}")
    deadline = time.time() + max_wait
    last = ""
    while time.time() < deadline:
        status = http_json(status_url, api_key, method="GET")
        state = status.get("status", "")
        if state != last:
            log(f"   狀態：{state}")
            last = state
        if state == "COMPLETED":
            return http_json(response_url, api_key, method="GET")
        if state in ("FAILED", "CANCELLED", "ERROR"):
            die(f"任務失敗（{state}）：{json.dumps(status, ensure_ascii=False)[:1200]}")
        time.sleep(poll_interval)
    die(f"等待逾時（{max_wait} 秒）。request_id={request_id}，可稍後用 {response_url} 取回結果。")


# --------------------------------------------------------------------------
# 儲存結果
# --------------------------------------------------------------------------
def extract_media(result: dict, media: str) -> list:
    """從回應取出圖片或影片清單。"""
    if media == "video":
        items = result.get("videos")
        if not items and isinstance(result.get("video"), dict):
            items = [result["video"]]
        if not items and isinstance(result.get("data"), dict):
            return extract_media(result["data"], media)
        if not items:
            die(f"回應中找不到影片：{json.dumps(result, ensure_ascii=False)[:1200]}")
        return items

    items = result.get("images")
    if not items and isinstance(result.get("image"), dict):
        items = [result["image"]]
    if not items and isinstance(result.get("data"), dict):
        return extract_media(result["data"], media)
    if not items:
        die(f"回應中找不到圖片：{json.dumps(result, ensure_ascii=False)[:1200]}")
    return items


def download(url: str, timeout: int = 180) -> bytes:
    if url.startswith("data:"):
        _, _, b64 = url.partition(",")
        return base64.b64decode(b64)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


CONTENT_TYPE_EXT = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
}


def save_images(items: list, model_key: str, out_dir: Path, ext: str) -> list:
    """存檔為「完成檔/模型名稱-年月日-時分.<副檔名>」。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = MODELS[model_key]["file_slug"]
    stamp = datetime.now().strftime("%Y%m%d-%H%M")   # 年月日-時分
    saved = []
    multiple = len(items) > 1
    for idx, image in enumerate(items, start=1):
        url = image.get("url") if isinstance(image, dict) else str(image)
        if not url:
            log(f"⚠️  第 {idx} 個檔案沒有 url，略過。")
            continue
        if isinstance(image, dict):
            ctype = (image.get("content_type") or "").split(";")[0].strip()
            ext = CONTENT_TYPE_EXT.get(ctype, ext)
        base = f"{slug}-{stamp}"
        name = f"{base}-{idx:02d}.{ext}" if multiple else f"{base}.{ext}"
        path = out_dir / name
        bump = 2
        while path.exists():                          # 同一分鐘內重複執行時避免覆蓋
            suffix = f"-{idx:02d}" if multiple else ""
            path = out_dir / f"{base}{suffix}-{bump}.{ext}"
            bump += 1
        path.write_bytes(download(url))
        saved.append(path)
        log(f"✅ 已儲存：{path}")
    return saved


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def normalize_model(name: str) -> str:
    key = name.strip()
    key = MODEL_ALIASES.get(key, MODEL_ALIASES.get(key.lower(), key.lower()))
    if key not in MODELS:
        die(f"未知的模型「{name}」。可用：{', '.join(MODELS)}")
    return key


def default_endpoint(model_key: str, ref_paths: list) -> str:
    """沒指定 --endpoint 時，依模型類型與有沒有參考圖挑一個。"""
    endpoints = MODELS[model_key]["endpoints"]
    if MODELS[model_key]["media"] == "video":
        if not ref_paths:
            return "text-to-video"
        if len(ref_paths) == 1 and "image-to-video" in endpoints:
            return "image-to-video"
        if "reference-to-video" in endpoints:
            return "reference-to-video"
        return "image-to-video"
    return "edit" if ref_paths else "text-to-image"


def normalize_endpoint(model_key: str, name: str) -> str:
    key = name.strip().lower()
    key = ENDPOINT_ALIASES.get(key, key)
    endpoints = MODELS[model_key]["endpoints"]
    if key not in endpoints:
        die(f"模型 {model_key} 沒有接口「{name}」。可用：{', '.join(endpoints)}")
    return key


def print_models() -> None:
    for media, title in (("image", "圖片模型"), ("video", "影片模型")):
        print(f"\n════════ {title} ════════")
        for model_key, model in MODELS.items():
            if model["media"] != media:
                continue
            print_one_model(model_key, model)
    print()


def print_one_model(model_key: str, model: dict) -> None:
    if True:
        print(f"\n■ {model_key}")
        for ep_key, ep in model["endpoints"].items():
            print(f"   - {ep_key:<14} → {ep['id']}  ({ep['kind']})")
            print(f"     參數：{', '.join(ep['supports'])}")
        print(f"   長寬比：{', '.join(model['aspect_ratios'])}")
        if model.get("resolutions"):
            print(f"   解析度：{', '.join(model['resolutions'])}")
        if model.get("durations"):
            print(f"   長度（秒）：{', '.join(model['durations'])}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="透過 FAL AI 生成 / 編輯圖片",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--prompt", "-p", help="提示詞")
    parser.add_argument("--prompt-file", default=None,
                        help="從檔案讀提示詞（優先於 --prompt，避免長文字的引號問題）")
    parser.add_argument("--model", "-m", default="nano-banana-2",
                        help="模型：nano-banana-2 或 gpt-image-2（預設 nano-banana-2）")
    parser.add_argument("--endpoint", "-e", default=None,
                        help="接口：text-to-image / edit（有給參考圖時預設 edit）")
    parser.add_argument("--aspect-ratio", "-a", default="16:9",
                        help="長寬比，預設 16:9；edit 想保留原圖比例可用 auto")
    parser.add_argument("--num-images", "-n", type=int, default=1, help="生成張數，預設 1")
    parser.add_argument("--resolution", "-r", default=None,
                        help="解析度。圖片：1K / 2K / 4K（預設 1K）；"
                             "影片：依模型而定（seedance 480p/720p/1080p、minimax-h3 2K）")
    parser.add_argument("--duration", "-d", default=None,
                        help="影片長度（秒）。kling 3-15、minimax-h3 5-15、seedance 4-15 或 auto")
    parser.add_argument("--generate-audio", dest="generate_audio",
                        action="store_true", default=None,
                        help="影片生成原生音訊（seedance / kling 支援）")
    parser.add_argument("--no-audio", dest="generate_audio", action="store_false",
                        help="影片不要音訊")
    parser.add_argument("--negative-prompt", default=None,
                        help="負面提示詞（kling 支援）")
    parser.add_argument("--cfg-scale", type=float, default=None,
                        help="貼合提示詞的程度（kling，預設 0.5）")
    parser.add_argument("--prompt-optimizer", dest="prompt_optimizer",
                        action="store_true", default=None,
                        help="讓 minimax-h3 自動優化提示詞")
    parser.add_argument("--no-prompt-optimizer", dest="prompt_optimizer",
                        action="store_false", help="關閉 minimax-h3 的提示詞優化")
    parser.add_argument("--quality", default="high",
                        help="gpt-image-2 專用：low / medium / high（預設 high）")
    parser.add_argument("--input-fidelity", default=None,
                        help="gpt-image-2 edit 專用：low / high（越高越貼近原圖）")
    parser.add_argument("--ref", action="append", default=[],
                        help=f"參考圖檔名（自動到「{REF_DIR_NAME}」資料夾找），可重複使用")
    parser.add_argument("--ref-all", action="store_true",
                        help=f"使用「{REF_DIR_NAME}」資料夾內的所有圖片")
    parser.add_argument("--mask", default=None, help="遮罩圖（gpt-image-2 edit 專用）")
    parser.add_argument("--expand", action="store_true",
                        help="先用 AI 把提示詞擴寫成完整版（主題/構圖/場景/風格/鏡頭）再生成")
    parser.add_argument("--expand-only", action="store_true",
                        help="只擴寫並輸出英文+中文，不生成圖片（給人確認用）")
    parser.add_argument("--llm-model", default=None,
                        help="擴寫用的 LLM（預設自動挑一個可用的 FAL any-llm 模型）")
    parser.add_argument("--seed", type=int, default=None, help="隨機種子")
    parser.add_argument("--output-format", default="png", help="輸出格式，預設 png")
    parser.add_argument("--output-dir", default=None,
                        help=f"輸出資料夾，預設「{OUT_DIR_NAME}」")
    parser.add_argument("--ref-dir", default=None,
                        help=f"參考圖資料夾，預設「{REF_DIR_NAME}」")
    parser.add_argument("--env-file", default=None, help="指定 .env 路徑")
    parser.add_argument("--extra", default=None,
                        help='附加參數（JSON 字串），例如 \'{"style":"vivid"}\'')
    parser.add_argument("--sync", action="store_true", help="用同步端點取代佇列模式")
    parser.add_argument("--timeout", type=int, default=900, help="佇列等待秒數上限")
    parser.add_argument("--dry-run", action="store_true", help="只印出將送出的參數，不呼叫 API")
    parser.add_argument("--list-models", action="store_true", help="列出所有模型與接口")
    args = parser.parse_args()

    if args.list_models:
        print_models()
        return
    if args.prompt_file:
        path = Path(args.prompt_file).expanduser()
        if not path.is_file():
            die(f"找不到提示詞檔案：{path}")
        args.prompt = path.read_text(encoding="utf-8").strip()
    if not args.prompt:
        parser.error("需要 --prompt 或 --prompt-file")

    model_key = normalize_model(args.model)
    ref_dir = Path(args.ref_dir).expanduser() if args.ref_dir else PROJECT_ROOT / REF_DIR_NAME
    out_dir = Path(args.output_dir).expanduser() if args.output_dir else PROJECT_ROOT / OUT_DIR_NAME

    ref_paths = collect_all_refs(ref_dir) if args.ref_all else \
        [resolve_ref(r, ref_dir) for r in args.ref]

    endpoint_key = (normalize_endpoint(model_key, args.endpoint) if args.endpoint
                    else default_endpoint(model_key, ref_paths))
    endpoint = MODELS[model_key]["endpoints"][endpoint_key]
    media = MODELS[model_key]["media"]

    # 解析度預設值依模型而定；影片通常要跑幾分鐘，等待時間拉長
    if args.resolution is None:
        args.resolution = MODELS[model_key].get("default_resolution",
                                                "1K" if media == "image" else None)
    if media == "video" and args.timeout == 900:
        args.timeout = 1800

    if args.num_images < 1:
        die("--num-images 至少要 1")

    expanded = None
    if args.expand or args.expand_only:
        api_key = resolve_api_key(Path(args.env_file).expanduser() if args.env_file else None)
        bits = [f"target aspect ratio {args.aspect_ratio}", f"endpoint {endpoint['kind']}"]
        if media == "video" and args.duration:
            bits.append(f"clip length {args.duration} seconds")
        context = ", ".join(bits)
        expanded = expand_prompt(args.prompt, api_key, args.llm_model, context, media)
        log("")
        log("──────── English prompt（送給模型的版本）────────")
        log(expanded["english"])
        log("")
        log("──────── 中文翻譯（給你確認用）────────")
        log(expanded["chinese"])
        log("")
        args.prompt = expanded["english"]

        if args.expand_only:
            print(json.dumps({
                "english": expanded["english"],
                "chinese": expanded["chinese"],
                "llm_model": expanded["llm_model"],
                "model": model_key,
                "endpoint": endpoint_key,
                "aspect_ratio": args.aspect_ratio,
                "num_images": args.num_images,
                "resolution": args.resolution,
            }, ensure_ascii=False, indent=2))
            log("（--expand-only：只擴寫，未生成圖片）")
            return

    payload = build_payload(model_key, endpoint_key, args, ref_paths)

    log(f"模型：{model_key} ／ 接口：{endpoint_key}（{endpoint['id']}）")
    if ref_paths:
        log("參考圖：" + ", ".join(p.name for p in ref_paths))
    log("參數：" + json.dumps(redact(payload), ensure_ascii=False))

    if args.dry_run:
        log("（--dry-run，未實際呼叫 API）")
        return

    api_key = resolve_api_key(Path(args.env_file).expanduser() if args.env_file else None)
    result = call_fal(endpoint["id"], payload, api_key,
                      sync=args.sync, max_wait=args.timeout)
    media = MODELS[model_key]["media"]
    default_ext = "mp4" if media == "video" else args.output_format
    saved = save_images(extract_media(result, media), model_key, out_dir, default_ext)

    if result.get("description"):
        log(f"模型說明：{result['description']}")
    print(json.dumps({"saved": [str(p) for p in saved]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
