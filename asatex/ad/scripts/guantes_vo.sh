#!/bin/bash
# 洗碗手套一鏡到底：Fish 免費模型錄 5 句台詞＋片尾旁白，Whisper 驗證並印出長度。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/guantes/vo; mkdir -p "$OUT"
GIRL=35929683c49c4ec0bf779dc07d22620b; BOY=a335d470fff248e8890dce6550a2874b; NAR=f53102becdf94a51af6d64010bc658f2
tts(){ curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "{\"text\":\"$2\",\"reference_id\":\"$3\",\"format\":\"wav\",\"sample_rate\":44100}" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts g1 "¿Sabes qué?" $GIRL
tts g2 "Para lavar la loza, necesitas guantes Asatex." $GIRL
tts b1 "¿Y los guantes Asatex no se rompen?" $BOY
tts g3 "Los guantes Asatex son súper cómodos." $GIRL
tts b2 "¿Y dónde compro guantes Asatex?" $BOY
tts n1 "Si es Asatex, es seguro." $NAR
for f in g1 g2 b1 g3 b2 n1; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
