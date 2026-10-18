#!/bin/bash
# 單句重錄：bash fish_one.sh <輸出.wav> <聲音ID> "<台詞>"  → Fish 免費模型錄一句、轉 48k 單聲道，印出長度＋Whisper 聽寫。
# 聲音 ID：女 35929683c49c4ec0bf779dc07d22620b／男 a335d470fff248e8890dce6550a2874b／旁白 f53102becdf94a51af6d64010bc658f2
OUT="$1"; VOICE="$2"; TEXT="$3"
K=$(grep '^FISH_AUDIO_API_KEY=' "/Volumes/Crucial X6/claudecode/2025TRIP/.env" | cut -d= -f2-)
BODY=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"reference_id":sys.argv[2],"format":"wav","sample_rate":44100}, ensure_ascii=False))' "$TEXT" "$VOICE")
curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "$BODY" -o "$OUT.raw.wav" -w "%{http_code} " \
  && ffmpeg -v error -y -i "$OUT.raw.wav" -ar 48000 -ac 1 "$OUT" && rm -f "$OUT.raw.wav"
printf "%.2fs | " "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")"
whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT" 2>/dev/null | tr -d '\n'; echo
