#!/bin/bash
# EP3 Halloween：女主角（ELLA）、閨蜜（AMIGA，Fish「Mujer」年輕廣告聲；舊的 Verity 聲聽起來太男性）、旁白；句首 [..] 是 Fish 情緒標記不會念出來。
# f9 兩人一起喊：兩人各錄一次再混音。片尾旁白沿用 compras/vo/n1.wav。
cd "/Volumes/Crucial X6/claudecode/2025TRIP" || exit 1
K=$(grep '^FISH_AUDIO_API_KEY=' .env | cut -d= -f2-); OUT=asatex/ad/public/fiesta/vo; mkdir -p "$OUT"
ELLA=35929683c49c4ec0bf779dc07d22620b; AMIGA=5e816f5a0658460b960881a24733c418; NAR=f53102becdf94a51af6d64010bc658f2
tts(){ curl -s --max-time 240 -X POST https://api.fish.audio/v1/tts -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "model: s2.1-pro-free" -d "{\"text\":\"$2\",\"reference_id\":\"$3\",\"format\":\"wav\",\"sample_rate\":44100}" -o "$OUT/$1_raw.wav" -w "$1 %{http_code}\n" && ffmpeg -v error -y -i "$OUT/$1_raw.wav" -ar 48000 -ac 1 "$OUT/$1.wav" && rm -f "$OUT/$1_raw.wav"; }
tts f1 "[excited] ¡Amiga, mira mis pantys!" $ELLA
tts f2 "[happy] ¡Con brillos de diamante… de Asatex!" $ELLA
tts f3 "[happy] ¡Yo también compré en Asatex!" $AMIGA
tts f4 "[happy] Pero las mías tienen un secreto…" $AMIGA
tts f5 "¿Secreto? ¡Las mías brillan más!" $ELLA
tts f6 "[excited] ¿Ah, sí? ¡Mira ahora!" $AMIGA
tts f7 "[laughing] ¡Brillan en la oscuridad!" $AMIGA
tts f8 "¡Buenos, bonitos y baratos!" $NAR
tts f9a "[excited] ¡Estamos listas para la fiesta de Halloween!" $ELLA
tts f9b "[excited] ¡Estamos listas para la fiesta de Halloween!" $AMIGA
ffmpeg -v error -y -i "$OUT/f9a.wav" -i "$OUT/f9b.wav" -filter_complex "[0][1]amix=inputs=2:duration=longest:normalize=0,volume=0.8" -ar 48000 -ac 1 "$OUT/f9.wav"
cp asatex/ad/public/compras/vo/n1.wav "$OUT/n1.wav"
for f in f1 f2 f3 f4 f5 f6 f7 f8 f9 n1; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.wav"); printf "%s %.2fs | " $f "$d"
  whisper-cli -m "/Volumes/Crucial X6/SilATP/models/ggml-small.bin" -l es -nt -np "$OUT/$f.wav" 2>/dev/null | tr -d '\n'; echo
done
