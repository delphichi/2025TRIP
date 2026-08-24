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
              method: str = "POST", timeout: int = 300) -> dict:
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
        hint = ""
        if exc.code in (401, 403):
            hint = "\n   → 金鑰無效或沒有權限，請確認 .env 內的 FAL_KEY。"
        elif exc.code == 422:
            hint = "\n   → 參數不被此接口接受，請對照 references/endpoints.md。"
        die(f"FAL API 回傳 HTTP {exc.code}：{detail[:1500]}{hint}")
    except urllib.error.URLError as exc:
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
            die(f"{model_key} 不支援長寬比 {args.aspect_ratio}。"
                f"可用：{', '.join(model['aspect_ratios'])}")
        payload["aspect_ratio"] = args.aspect_ratio
    if "resolution" in supports:
        payload["resolution"] = args.resolution.upper()

    if "image_size" in supports:
        if args.aspect_ratio == "auto":
            payload["image_size"] = "auto"
        else:
            payload["image_size"] = image_size_for(args.aspect_ratio, args.resolution)

    if "quality" in supports:
        payload["quality"] = args.quality
    if "input_fidelity" in supports and args.input_fidelity:
        payload["input_fidelity"] = args.input_fidelity

    if endpoint["kind"] == "edit":
        if not ref_paths:
            die(f"接口 {endpoint['id']} 需要參考圖。"
                f"請用 --ref <檔名>（放在「{REF_DIR_NAME}」資料夾）或 --ref-all。")
        max_refs = endpoint.get("max_refs", 8)
        if len(ref_paths) > max_refs:
            die(f"{endpoint['id']} 最多接受 {max_refs} 張參考圖，收到 {len(ref_paths)} 張。")
        payload["image_urls"] = [to_data_uri(p) for p in ref_paths]
        if getattr(args, "mask", None) and "mask_url" in supports:
            payload["mask_url"] = to_data_uri(Path(args.mask).expanduser())
    elif ref_paths:
        log(f"⚠️  接口 {endpoint['id']} 是文生圖，忽略 {len(ref_paths)} 張參考圖"
            f"（要用參考圖請加 --endpoint edit）。")

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
def extract_images(result: dict) -> list:
    images = result.get("images")
    if not images and isinstance(result.get("image"), dict):
        images = [result["image"]]
    if not images and isinstance(result.get("data"), dict):
        return extract_images(result["data"])
    if not images:
        die(f"回應中找不到圖片：{json.dumps(result, ensure_ascii=False)[:1200]}")
    return images


def download(url: str, timeout: int = 180) -> bytes:
    if url.startswith("data:"):
        _, _, b64 = url.partition(",")
        return base64.b64decode(b64)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def save_images(images: list, model_key: str, out_dir: Path, ext: str) -> list:
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = MODELS[model_key]["file_slug"]
    stamp = datetime.now().strftime("%Y%m%d-%H%M")   # 年月日-時分
    saved = []
    multiple = len(images) > 1
    for idx, image in enumerate(images, start=1):
        url = image.get("url") if isinstance(image, dict) else str(image)
        if not url:
            log(f"⚠️  第 {idx} 張圖片沒有 url，略過。")
            continue
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


def normalize_endpoint(model_key: str, name: str) -> str:
    key = name.strip().lower()
    key = ENDPOINT_ALIASES.get(key, key)
    endpoints = MODELS[model_key]["endpoints"]
    if key not in endpoints:
        die(f"模型 {model_key} 沒有接口「{name}」。可用：{', '.join(endpoints)}")
    return key


def print_models() -> None:
    for model_key, model in MODELS.items():
        print(f"\n■ {model_key}")
        for ep_key, ep in model["endpoints"].items():
            print(f"   - {ep_key:<14} → {ep['id']}  ({ep['kind']})")
            print(f"     參數：{', '.join(ep['supports'])}")
        print(f"   長寬比：{', '.join(model['aspect_ratios'])}")
        print(f"   解析度：{', '.join(model['resolutions'])}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="透過 FAL AI 生成 / 編輯圖片",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--prompt", "-p", help="提示詞")
    parser.add_argument("--model", "-m", default="nano-banana-2",
                        help="模型：nano-banana-2 或 gpt-image-2（預設 nano-banana-2）")
    parser.add_argument("--endpoint", "-e", default=None,
                        help="接口：text-to-image / edit（有給參考圖時預設 edit）")
    parser.add_argument("--aspect-ratio", "-a", default="16:9",
                        help="長寬比，預設 16:9；edit 想保留原圖比例可用 auto")
    parser.add_argument("--num-images", "-n", type=int, default=1, help="生成張數，預設 1")
    parser.add_argument("--resolution", "-r", default="1K", help="解析度：1K / 2K / 4K")
    parser.add_argument("--quality", default="high",
                        help="gpt-image-2 專用：low / medium / high（預設 high）")
    parser.add_argument("--input-fidelity", default=None,
                        help="gpt-image-2 edit 專用：low / high（越高越貼近原圖）")
    parser.add_argument("--ref", action="append", default=[],
                        help=f"參考圖檔名（自動到「{REF_DIR_NAME}」資料夾找），可重複使用")
    parser.add_argument("--ref-all", action="store_true",
                        help=f"使用「{REF_DIR_NAME}」資料夾內的所有圖片")
    parser.add_argument("--mask", default=None, help="遮罩圖（gpt-image-2 edit 專用）")
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
    if not args.prompt:
        parser.error("需要 --prompt")

    model_key = normalize_model(args.model)
    ref_dir = Path(args.ref_dir).expanduser() if args.ref_dir else PROJECT_ROOT / REF_DIR_NAME
    out_dir = Path(args.output_dir).expanduser() if args.output_dir else PROJECT_ROOT / OUT_DIR_NAME

    ref_paths = collect_all_refs(ref_dir) if args.ref_all else \
        [resolve_ref(r, ref_dir) for r in args.ref]

    endpoint_key = normalize_endpoint(model_key, args.endpoint) if args.endpoint else \
        ("edit" if ref_paths else "text-to-image")
    endpoint = MODELS[model_key]["endpoints"][endpoint_key]

    if args.num_images < 1:
        die("--num-images 至少要 1")

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
    saved = save_images(extract_images(result), model_key, out_dir, args.output_format)

    if result.get("description"):
        log(f"模型說明：{result['description']}")
    print(json.dumps({"saved": [str(p) for p in saved]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
