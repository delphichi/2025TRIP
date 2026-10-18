#!/bin/bash
# 第 6 集《焦慮的失眠症》：桃子小姐（台灣女生聲）× 糰糰醫生（台灣男聲），Fish 免費模型，Whisper 中文驗證。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/insomnia/vo; mkdir -p "$OUT"
PAT=e855dc04a51f48549b484e41c4d4d4cc; DOC=a71c7dc48a9f4dc3b69df54f63769d63
tts(){ BODY=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"reference_id":sys.argv[2],"format":"wav","sample_rate":44100}, ensure_ascii=False))' "$2" "$3"); curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "$BODY" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts m1 "[tired] 醫生……我已經三天沒睡了。" $PAT
tts m2 "睡前都在想什麼？" $DOC
tts m3 "[anxious] 明天的會議、這個月的帳單、十年後的房價、地球暖化，還有我國中講錯的一句話……" $PAT
tts m4 "……還是說，睡前把擔心的事寫在紙上，手機放客廳，會不會比較好？" $PAT
tts m5 "醫生？你還在聽嗎？醫生！" $PAT
tts m6 "[sleepy] 嗯……你說得很好。掛號費五百。" $DOC
# 一長串煩惱那句加速 1.3 倍（越講越快的焦慮感）
ffmpeg -v error -y -i "$OUT/m3.wav" -af "atempo=1.3" "$OUT/m3f.wav" && mv "$OUT/m3f.wav" "$OUT/m3.wav"
for f in m1 m2 m3 m4 m5 m6; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l zh -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
