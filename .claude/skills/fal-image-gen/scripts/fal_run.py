# 通用 FAL queue 呼叫（任何 endpoint，含要傳音訊的 InfiniteTalk、MiniMax Music、Whisper）：
#   python3 fal_run.py <endpoint> <payload.json> <輸出前綴>
# payload 裡的 "@file:路徑" 會先上傳到 FAL 儲存再換成網址（data URI 太長會被拒）
import json, sys, time, base64, mimetypes, urllib.request, urllib.error, os
from pathlib import Path
key = None
for line in Path("/Volumes/Crucial X6/claudecode/2025TRIP/.env").read_text().splitlines():
    if line.startswith("FAL_KEY="): key = line.split("=",1)[1].strip().strip('"\'')
ep, pf, out = sys.argv[1:4]
payload = json.loads(Path(pf).read_text())
for k, v in list(payload.items()):
    if isinstance(v, str) and v.startswith("@file:"):
        p = Path(v[6:]); mt = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        init = urllib.request.Request("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
            data=json.dumps({"content_type": mt, "file_name": p.name}).encode(),
            headers={"Authorization": f"Key {key}", "Content-Type": "application/json"}, method="POST")
        j = json.load(urllib.request.urlopen(init, timeout=60))
        urllib.request.urlopen(urllib.request.Request(j["upload_url"], data=p.read_bytes(),
            headers={"Content-Type": mt}, method="PUT"), timeout=300)
        payload[k] = j["file_url"]; print("uploaded", p.name, flush=True)
H = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
def req(url, data=None):
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers=H, method="POST" if data else "GET")
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:2000]); sys.exit(1)
sub = req(f"https://queue.fal.run/{ep}", payload); print('request', sub.get('request_id'), flush=True)
while True:
    st = req(sub["status_url"])
    if st["status"] == "COMPLETED": break
    print(st["status"], flush=True); time.sleep(8)
res = req(sub["response_url"])
Path(out + ".json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
def urls(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "url" and isinstance(v, str): yield v
            else: yield from urls(v)
    elif isinstance(o, list):
        for x in o: yield from urls(x)
for i, u in enumerate(urls(res)):
    ext = os.path.splitext(u.split("?")[0])[1] or ".bin"
    fn = f"{out}{'' if i == 0 else '-'+str(i)}{ext}"
    Path(fn).write_bytes(urllib.request.urlopen(u, timeout=300).read()); print("saved", fn)
