#!/bin/bash
# 《Rosado》櫥窗睡衣：她（ELLA）問三次「¿Qué color es mejor?」，他（EL）三次都答「Rosado.」—— 三次用同一個錄音檔，像機器人一樣。
# 第四次「…¿Rosado?」另錄；結尾她罵完再笑著說「¡Me llevo las cuatro de regalo!」（兩段接起來）。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/rosado/vo; mkdir -p "$OUT"
ELLA=35929683c49c4ec0bf779dc07d22620b; EL=a335d470fff248e8890dce6550a2874b; NAR=f53102becdf94a51af6d64010bc658f2
tts(){ curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "{\"text\":\"$2\",\"reference_id\":\"$3\",\"format\":\"wav\",\"sample_rate\":44100}" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts g1 "[happy] Mi amor…" $ELLA
tts g2 "[happy] ¿Qué color es mejor?" $ELLA
tts b1 "Rosado." $EL
tts g3 "¿En serio? ¿Qué color es mejor?" $ELLA
tts g4 "[annoyed] ¿De verdad? ¿Qué color es mejor?" $ELLA
tts g5 "¿Y cuál es mi color favorito?" $ELLA
tts b4 "[hesitant] Eh… ¿Rosado?" $EL
tts g6a "[angry] ¡Eres más tonto que un poroto!" $ELLA
tts g6b "[laughing] ¡Me llevo las cuatro de regalo! Jajaja." $ELLA
tts n1 "Asatex. Les daba más. Los hace felices." $NAR
cp "$OUT/b1.wav" "$OUT/b2.wav"; cp "$OUT/b1.wav" "$OUT/b3.wav"
ffmpeg -v error -y -i "$OUT/g6a.wav" -f lavfi -t 0.3 -i anullsrc=r=48000:cl=mono -i "$OUT/g6b.wav" -filter_complex "[0][1][2]concat=n=3:v=0:a=1" "$OUT/g6.wav"
for f in g1 g2 b1 g3 b2 g4 b3 g5 b4 g6 n1; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
