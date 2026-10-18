#!/bin/bash
# 搜 Fish Audio 公開聲音庫：bash fish_voices.sh "關鍵字" [語言，預設 es]  → 印出 ID｜名稱｜語言｜標籤｜被用次數
K=$(grep '^FISH_AUDIO_API_KEY=' "/Volumes/Crucial X6/claudecode/2025TRIP/.env" | cut -d= -f2-)
Q=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1")
curl -s --max-time 30 "https://api.fish.audio/model?page_size=20&title=$Q&language=${2:-es}&sort_by=task_count" -H "Authorization: Bearer $K" \
| python3 -c '
import json,sys
d=json.load(sys.stdin)
for m in d.get("items",[]):
    print(m["_id"], "|", m.get("title","")[:40], "|", ",".join(m.get("languages",[])), "|", ",".join(m.get("tags",[]))[:50], "|", m.get("task_count",0))
'
