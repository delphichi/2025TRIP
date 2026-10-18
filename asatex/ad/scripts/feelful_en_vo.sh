#!/bin/bash
# FeelFul CalmQuest 英文版配音：Fish 免費模型＋「Emily (meditation)」英文冥想女聲，Whisper 英文驗證。
# 每句都要塞進對應的呼吸段（吸 4 秒／吐 6 秒），長度印出來檢查。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/feelful/en; mkdir -p "$OUT"
V=a325095a7cc049cebf39b1de9464fc73
tts(){ BODY=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"reference_id":sys.argv[2],"format":"wav","sample_rate":44100}))' "$2" "$V"); curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "$BODY" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts hook "This level only opens when you breathe right."
tts in1  "Breathe in through your nose."
tts out1 "And slowly breathe out. Blow the bubbles."
tts in2  "Breathe in. Collect the stars."
tts out2 "Breathe out. Let your shoulders drop."
tts in3  "Gently in."
tts out3 "And out. Nice and slow."
tts in4  "Fill up softly."
tts out4 "Let it all go."
tts in5  "One last breath in."
tts out5 "And all the way out."
tts end  "Five calm breaths. Well done."
for f in hook in1 out1 in2 out2 in3 out3 in4 out4 in5 out5 end; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l en -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
