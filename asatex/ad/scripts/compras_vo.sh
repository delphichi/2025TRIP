#!/bin/bash
# 女生台詞前的 [happy]/[excited]/[giggles]/[laughing] 是 Fish 的情緒標記，不會被念出來。
# 「Encontré trabajo en Asatex」購物袋短劇：Fish 免費模型錄 9 句＋片尾旁白，Whisper 驗證並印出長度。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/compras/vo; mkdir -p "$OUT"
ELLA=35929683c49c4ec0bf779dc07d22620b; EL=a335d470fff248e8890dce6550a2874b; NAR=f53102becdf94a51af6d64010bc658f2
tts(){ curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "{\"text\":\"$2\",\"reference_id\":\"$3\",\"format\":\"wav\",\"sample_rate\":44100}" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts c1 "[happy] Mi amor…" $ELLA
tts c2 "[excited] ¡Sí, sí, sí! ¡Encontré trabajo en Asatex!" $ELLA
tts c3 "¿Por qué?" $EL
tts c4 "Yo trabajo de día y hago delivery por las noches. ¿Será que no te alcanza la plata para tus gastos?" $EL
tts c5 "[giggles] ¡Mi amor, me alcanza de sobra! ¡Hasta me sobra plata!" $ELLA
tts c6 "Te voy a transferir más plata." $EL
tts c7 "¡Entonces anda a Asatex a comprar con tus amigas!" $EL
tts c8 "Asatex: ¡buenos, bonitos y baratos!" $NAR
tts c9 "[laughing] ¡Sí, sí, sí! Gracias, mi amor." $ELLA
tts n1 "Asatex… te hace feliz." $NAR
for f in c1 c2 c3 c4 c5 c6 c7 c8 c9 n1; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
