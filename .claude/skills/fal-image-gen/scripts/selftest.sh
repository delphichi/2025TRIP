#!/usr/bin/env bash
# FAL 圖片技能自測腳本
#   ./selftest.sh          只做離線檢查（不呼叫 API、不花錢）
#   ./selftest.sh --live   離線檢查 + 真的生成一張 16:9 測試圖（會消耗額度）
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR
CLI="$SCRIPT_DIR/fal_image.py"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
PASS=0; FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
head_() { echo; echo "── $1"; }

# 期望成功
expect_ok() {
  local desc="$1"; shift
  if out="$("$@" 2>&1)"; then ok "$desc"; else bad "$desc"$'\n'"$(echo "$out" | tail -3)"; fi
}
# 期望失敗（錯誤處理）
expect_fail() {
  local desc="$1"; shift
  if out="$("$@" 2>&1)"; then bad "$desc（應該要失敗卻成功了）"; else ok "$desc"; fi
}

head_ "1. 環境"
python3 -c 'import sys; assert sys.version_info>=(3,8)' 2>/dev/null \
  && ok "Python $(python3 -V 2>&1 | cut -d' ' -f2)" || bad "需要 Python 3.8 以上"
[ -f "$CLI" ] && ok "找到 CLI：$CLI" || bad "找不到 fal_image.py"
[ -d "$ROOT/參考圖" ] && ok "參考圖資料夾存在" || bad "缺少 $ROOT/參考圖"
[ -d "$ROOT/完成檔" ] && ok "完成檔資料夾存在" || bad "缺少 $ROOT/完成檔"
if [ -n "${FAL_KEY:-}" ]; then ok "FAL_KEY 來自環境變數"
elif grep -qs '^ *FAL_KEY *= *[^ ]' "$ROOT/.env" && ! grep -qs 'your-fal-api-key' "$ROOT/.env"; then
  ok "FAL_KEY 來自 $ROOT/.env"
else
  echo "  ⚠️  尚未設定金鑰（離線測試不受影響）：cp .env.example .env 後填入 FAL_KEY"
fi

head_ "2. 模型與接口清單"
if "$CLI" --list-models >/dev/null 2>&1; then
  for ep in "fal-ai/nano-banana-2" "fal-ai/nano-banana-2/edit" "openai/gpt-image-2" "openai/gpt-image-2/edit"; do
    "$CLI" --list-models 2>/dev/null | grep -q "$ep" && ok "接口已註冊：$ep" || bad "接口缺失：$ep"
  done
else
  bad "--list-models 執行失敗"
fi

head_ "3. 預設值（16:9、1 張）"
d="$("$CLI" -p "測試" --dry-run 2>&1)"
echo "$d" | grep -q '"aspect_ratio": "16:9"' && ok "預設長寬比 = 16:9" || bad "預設長寬比不是 16:9"
echo "$d" | grep -q '"num_images": 1'        && ok "預設張數 = 1"      || bad "預設張數不是 1"
echo "$d" | grep -q 'fal-ai/nano-banana-2'   && ok "預設模型 = nano-banana-2" || bad "預設模型不對"

head_ "4. 參數組裝（--dry-run，不呼叫 API）"
expect_ok "nano-banana-2 文生圖"        "$CLI" -m nano-banana-2 -p t --dry-run
expect_ok "gpt-image-2 文生圖 2K 3 張"  "$CLI" -m gpt-image-2 -p t -r 2K -n 3 --dry-run
expect_ok "完整 endpoint id 也吃得下"    "$CLI" -m openai/gpt-image-2 -p t --dry-run
expect_ok "9:16 直式"                   "$CLI" -p t -a 9:16 --dry-run

head_ "5. 參考圖與 edit 接口"
TMPREF="$ROOT/參考圖/_selftest.png"
python3 -c "
import base64,pathlib
pathlib.Path('$TMPREF').write_bytes(base64.b64decode(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))"
e="$("$CLI" -p t --ref _selftest.png --dry-run 2>&1)"
echo "$e" | grep -q 'nano-banana-2/edit' && ok "有參考圖時自動切到 edit 接口" || bad "沒有自動切到 edit"
echo "$e" | grep -q 'image_urls'         && ok "參考圖已轉成 data URI 放進 image_urls" || bad "image_urls 缺失"
expect_ok   "省略副檔名也找得到"  "$CLI" -p t --ref _selftest --dry-run
expect_ok   "--ref-all 讀整個資料夾" "$CLI" -p t --ref-all --dry-run
expect_ok   "gpt-image-2 edit + input_fidelity" "$CLI" -m gpt-image-2 -p t --ref _selftest --input-fidelity high --dry-run
rm -f "$TMPREF"

head_ "6. 錯誤處理"
expect_fail "找不到參考圖會報錯"          "$CLI" -p t --ref 不存在的檔.png --dry-run
expect_fail "gpt-image-2 擋下 8:1 極端比例" "$CLI" -m gpt-image-2 -p t -a 8:1 --dry-run
expect_fail "未知模型會報錯"              "$CLI" -m no-such-model -p t --dry-run
expect_fail "未知接口會報錯"              "$CLI" -p t -e no-such-endpoint --dry-run
expect_ok   "nano-banana-2 支援 8:1"      "$CLI" -m nano-banana-2 -p t -a 8:1 --dry-run

head_ "7. image_size 換算是否合規"
python3 - <<'PY'
import os, sys, math, pathlib
sys.path.insert(0, os.environ["SCRIPT_DIR"])
import fal_image as f
bad = 0
for a in ["16:9","9:16","1:1","4:3","3:2","21:9","2:3","3:4","5:4","4:5"]:
    for r in ["1K","2K","4K"]:
        s = f.image_size_for(a, r); w, h = s["width"], s["height"]; px = w*h
        w0, h0 = f.ratio_tuple(a)
        problems = []
        if w % 16 or h % 16:                 problems.append("非 16 倍數")
        if not (655360 <= px <= 8294400):    problems.append(f"像素 {px} 越界")
        if max(w, h) > 3840:                 problems.append("邊長 > 3840")
        if abs(w/h - w0/h0) > 1e-9:          problems.append("比例不精確")
        if problems:
            print(f"  ❌ {a} {r} -> {w}x{h}: {', '.join(problems)}"); bad += 1
print("  ✅ 30 組比例 × 解析度全部合規（16 倍數 / 像素區間 / 邊長上限 / 比例精確）" if not bad else "")
sys.exit(1 if bad else 0)
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

head_ "8. 檔名規則"
python3 - <<'PY'
import os, sys, pathlib, tempfile, re
sys.path.insert(0, os.environ["SCRIPT_DIR"])
import fal_image as f
f.download = lambda url, timeout=180: b"x"
out = pathlib.Path(tempfile.mkdtemp())
one = [{"url":"http://x/a.png"}]
p1 = f.save_images(one, "nano-banana-2", out, "png")[0]
p2 = f.save_images(one, "nano-banana-2", out, "png")[0]
p3 = f.save_images([{"url":f"http://x/{i}.png"} for i in range(3)], "gpt-image-2", out, "png")
assert re.fullmatch(r"nano-banana-2-\d{8}-\d{4}\.png", p1.name), p1.name
assert re.fullmatch(r"nano-banana-2-\d{8}-\d{4}-2\.png", p2.name), p2.name
assert re.fullmatch(r"gpt-image-2-\d{8}-\d{4}-01\.png", p3[0].name), p3[0].name
print(f"  單張 {p1.name}\n  同分鐘重跑 {p2.name}\n  多張 {p3[0].name} …")
PY
[ $? -eq 0 ] && { ok "檔名格式 模型名稱-年月日-時分.png、不覆蓋、多張加序號"; } || bad "檔名規則有誤"

head_ "9. 提示詞擴寫規範"
SKILL="$SCRIPT_DIR/../SKILL.md"
GUIDE="$SCRIPT_DIR/../references/prompt-guide.md"
grep -q "提示詞擴寫" "$SKILL" && ok "SKILL.md 有提示詞擴寫章節" || bad "SKILL.md 缺少提示詞擴寫章節"
grep -q "確認關卡" "$SKILL" && ok "SKILL.md 有送出前確認關卡" || bad "SKILL.md 缺少確認關卡"
for facet in 主題 構圖 場景 風格 鏡頭; do
  grep -q "$facet" "$SKILL" && ok "擴寫面向已列出：$facet" || bad "擴寫面向缺失：$facet"
done
[ -f "$GUIDE" ] && ok "prompt-guide.md 存在" || bad "缺少 references/prompt-guide.md"

head_ "10. 提示詞擴寫功能（--expand / --expand-only）"
for flag in "--expand" "--expand-only" "--llm-model" "--prompt-file"; do
  "$CLI" --help 2>/dev/null | grep -q -- "$flag" && ok "CLI 有 $flag" || bad "CLI 缺少 $flag"
done
printf 'a cat on a table' > /tmp/_selftest_prompt.txt
expect_ok "--prompt-file 讀得到提示詞" "$CLI" --prompt-file /tmp/_selftest_prompt.txt --dry-run
expect_fail "--prompt-file 檔案不存在會報錯" "$CLI" --prompt-file /tmp/_no_such_prompt.txt --dry-run
rm -f /tmp/_selftest_prompt.txt

python3 - <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["SCRIPT_DIR"])
import fal_image as f
cases = {
    '{"english":"A cat","chinese":"一隻貓"}': {"english": "A cat", "chinese": "一隻貓"},
    '```json\n{"english":"A cat","chinese":"一隻貓"}\n```': {"english": "A cat", "chinese": "一隻貓"},
    'Sure!\n{"english":"A cat","chinese":"一隻貓"}\nDone.': {"english": "A cat", "chinese": "一隻貓"},
    '{"english":"A cat"}': None,
    'not json': None,
    '': None,
}
for text, want in cases.items():
    got = f.parse_llm_json(text)
    assert got == want, f"parse_llm_json({text!r}) -> {got}, 應為 {want}"
print("  ✅ LLM 回應解析：純 JSON / ```圍欄 / 前後雜訊 / 缺欄位 / 壞資料 全部正確")
PYEOF
[ $? -eq 0 ] && PASS=$((PASS+1)) || { bad "parse_llm_json 行為有誤"; }

head_ "11. Workflow 模式設定"
WF="$ROOT/.github/workflows/fal-image.yml"
if [ -f "$WF" ]; then
  for m in preview generate raw; do
    grep -q "'$m'" "$WF" && ok "workflow 有 $m 模式" || bad "workflow 缺少 $m 模式"
  done
  grep -q -- "--expand-only" "$WF" && ok "workflow 會呼叫擴寫" || bad "workflow 沒有呼叫擴寫"
  grep -q -- "--prompt-file /tmp/prompt.txt" "$WF" && ok "generate 會用擴寫後的提示詞" || bad "generate 沒有接上擴寫結果"
else
  bad "找不到 $WF"
fi

if [ "${1:-}" = "--live" ]; then
  head_ "12. 真實 API 測試（會消耗額度）"
  if "$CLI" -m nano-banana-2 -p "a single red apple on a white table, studio lighting" -r 1K; then
    ok "成功呼叫 FAL 並存檔到「完成檔」"
    ls -t "$ROOT/完成檔"/*.png 2>/dev/null | head -1
  else
    bad "真實呼叫失敗（見上方錯誤訊息）"
  fi
else
  echo; echo "（要做真實 API 測試請加 --live，會實際生成一張圖並消耗額度）"
fi

echo; echo "════════ 結果：通過 $PASS 項，失敗 $FAIL 項 ════════"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
