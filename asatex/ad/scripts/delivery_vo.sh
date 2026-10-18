#!/bin/bash
# 女生台詞前的 [happy]/[excited]/[giggles]/[laughing] 是 Fish 的情緒標記，不會被念出來。
# 《Delivery》第二集：Fish 免費模型錄 9 句（片尾旁白沿用第一集 compras/vo/n1.wav），Whisper 驗證並印出長度。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/delivery/vo; mkdir -p "$OUT"
ELLA=35929683c49c4ec0bf779dc07d22620b; EL=a335d470fff248e8890dce6550a2874b; NAR=f53102becdf94a51af6d64010bc658f2
tts(){ curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "{\"text\":\"$2\",\"reference_id\":\"$3\",\"format\":\"wav\",\"sample_rate\":44100}" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts d1 "[excited] ¡Sí, sí, sí! ¡Llegó mi pedido de Asatex!" $ELLA
tts d2 "[surprised, happy] ¿Mi amor…? ¿Tú eres el delivery?" $ELLA
tts d3 "¡Entregártelo yo mismo es lo que más me hace feliz!" $EL
tts d4 "¡El pedido gigante era para mi casa!" $EL
tts d5 "[giggles] Ayer me transferiste plata… ¡y ya me la gasté!" $ELLA
tts d6 "Doscientas lucas… yo pago, no te preocupes." $EL
tts d7 "¿Y mi propina, mi amor?" $EL
tts d8 "¡Buenos, bonitos y baratos!" $NAR
tts d9 "[laughing] Toma, mi amor… ¡besito con pesito!" $ELLA
cp asatex/ad/public/compras/vo/n1.wav "$OUT/n1.wav"
for f in d1 d2 d3 d4 d5 d6 d7 d8 d9 n1; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
