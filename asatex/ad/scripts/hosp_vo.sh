#!/bin/bash
# 醫院梗短劇（原創角色：飯糰醫生、馬鈴薯病人）：Fish 錄 9 句中文（台灣口音），Whisper 中文驗證。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/hosp/vo; mkdir -p "$OUT"
PAT=e855dc04a51f48549b484e41c4d4d4cc; DOC=a71c7dc48a9f4dc3b69df54f63769d63
tts(){ BODY=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"reference_id":sys.argv[2],"format":"wav","sample_rate":44100}, ensure_ascii=False))' "$2" "$3"); curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "$BODY" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts p1 "[worried] 醫生，我是不是很嚴重？我每天都好累，什麼都不想做……" $PAT
tts d1 "[serious] 你要有心理準備。" $DOC
tts p2 "[sad] 我……還能活多久？" $PAT
tts d2 "[serious] 你這個病，叫做……「窮」。" $DOC
tts p3 "那……有藥醫嗎？" $PAT
tts d3 "有啊。" $DOC
tts p4 "[excited] 是什麼藥？！" $PAT
tts d4 "上班。" $DOC
tts p5 "[shocked] 這……這比絕症還可怕！" $PAT
for f in p1 d1 p2 d2 p3 d3 p4 d4 p5; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l zh -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
