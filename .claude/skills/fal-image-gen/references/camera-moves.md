# 運鏡詞彙庫（48 種 · 13 類）

擴寫影片提示詞時，從這裡挑**一個**主要運鏡寫進句子。左欄是直接貼進提示詞的英文寫法，
右欄是中文釋義與適用時機。

**三件事先講清楚：**

1. 這些是**提示詞裡的自然語言描述**，不是 API 參數 —— 寫進 `--prompt` 的句子裡，
   不是 `--extra` 的欄位。
2. **各家模型的服從度不同。** kling-v3-pro 對運鏡指令較敏感，seedance-2.0 官方標榜
   director-level camera control，minimax-h3 則偏好完整的場景敘述。愈罕見的運鏡
   （Inception Shot、Barrel Roll、Bullet Time）愈可能被模型忽略或做成別的樣子，
   第一次用建議先跑短秒數試。
3. **一顆鏡頭只給一個主運鏡。** 同時要求「推近 + 環繞 + 甩鏡」通常會得到一團混亂。
   要多個運鏡就拆成多顆鏡頭分別生成，再用 Remotion 或剪輯軟體接起來。

---

## 1. 推拉與縮放 Dolly & Zoom

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `slow dolly in` | 慢速推鏡頭 —— 相機慢慢向前推進，把注意力收攏到主體，情緒逐步累積 |
| `slow dolly out` | 慢速拉鏡頭 —— 向後退開，逐步揭露更寬廣的環境，常用於收尾 |
| `fast dolly in` | 快速推鏡頭 —— 急速逼近，製造衝擊或緊迫感 |
| `vertigo effect, dolly zoom` | 希區考克變焦 —— 推軌同時反向變焦，背景扭曲，強烈不安與戲劇張力 |
| `infinite scale continuity zoom` | 無限連續縮放 —— 無縫銜接的持續放大／縮小，適合尺度轉換的敘事 |
| `extreme macro zoom` | 極致微距縮放 —— 推到物體表面的微觀細節 |
| `cosmic hyper zoom` | 宇宙級超高速縮放 —— 跨越巨大尺度的高速拉近／拉遠 |

## 2. 構圖與鏡頭特性 Framing & Lens Character

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `character mounted framing, camera fixed to the subject` | 角色貼身固定構圖 —— 相機固定在角色身上，畫面隨其動作晃動，臨場感強 |
| `over the shoulder shot` | 過肩鏡頭 —— 從一個角色肩後拍另一個角色，對話場景標準語法 |
| `fish eye lens, strong barrel distortion` | 魚眼／貓眼鏡頭 —— 球狀畸變與極寬視野，也可用於門眼窺視感 |

## 3. 障礙物與環境互動 Obstacle & Environment

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `reveal from behind an obstacle` | 遮擋揭示 —— 相機從牆面、樹幹、車體後方移出揭露主體 |
| `camera moves through a solid obstacle` | 穿過式鏡頭 —— 直接穿透實體的超現實運動 |
| `fly through a narrow aperture` | 飛越孔隙 —— 穿過小洞、窗框、細縫的穿梭運鏡 |

## 4. 焦點操縱 Focus Pulls

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `reveal from blur, pulling into focus` | 從模糊中顯現 —— 由失焦逐漸合焦，開場很好用 |
| `fade in from black` | 淡入 —— 由黑（或單色）漸顯；嚴格說是轉場而非運鏡 |
| `rack focus from foreground to background` | 前景到背景移焦 —— 把注意力從近景交棒給遠景 |

## 5. 三腳架與滑軌 Tripod & Slider

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `tilt up` | 鏡頭仰搖 —— 機位不動，鏡頭往上轉，常用於展現高度 |
| `tilt down` | 鏡頭俯搖 —— 機位不動，鏡頭往下轉 |
| `camera truck left` | 橫移向左 —— 相機整體向左平行移動（非搖鏡） |
| `lateral truck right` | 橫移向右 —— 相機整體向右平行移動 |

## 6. 環繞 Orbital

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `180 degree orbit around the subject` | 半環繞 —— 繞主體轉半圈，建立立體感 |
| `fast 360 degree orbit` | 快速全環繞 —— 繞主體一整圈，英雄式呈現 |
| `slow cinematic arc` | 慢速電影感弧形 —— 帶弧度的緩慢移動，質感優先 |

## 7. 垂直升降與吊臂 Vertical / Crane / Pedestal

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `pedestal down` | 相機垂直下降 —— 整體高度下移，鏡頭角度不變（與俯搖不同） |
| `pedestal up` | 相機垂直上升 —— 整體高度上移 |
| `crane up to a high angle reveal` | 吊臂升起俯瞰揭示 —— 升高並俯看，揭開宏大場面 |
| `crane down landing` | 吊臂下降著陸 —— 從高處降到貼近地面，適合收尾落幅 |

## 8. 光學變焦 Optical Zoom

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `smooth optical zoom in` | 平滑光學放大 —— 純透鏡變焦，畫面較平面，帶點復古感 |
| `smooth optical zoom out` | 平滑光學縮小 |
| `snap zoom` | 快速變焦 —— 極快的猛然拉近，衝擊感強 |

> 光學變焦與 dolly 的差別：dolly 是相機真的移動，透視會改變；zoom 只改變焦段，透視不變。

## 9. 無人機航拍 Drone Aerial

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `drone flyover` | 無人機飛越俯瞰 —— 從目標上方飛掠 |
| `epic drone reveal` | 史詩級航拍揭示 —— 拉開展現壯闊場景 |
| `large scale drone orbit` | 大尺度無人機環繞 —— 廣域範圍的大圈環繞 |
| `top down god's eye view` | 上帝視角 —— 垂直向下 90 度俯拍，平面圖感 |
| `FPV drone aggressive dive` | FPV 穿越機俯衝 —— 高速侵略性下潛，極動感 |

## 10. 風格化與動態 Stylized & Dynamic

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `handheld documentary style, subtle camera shake` | 手持紀錄片風格 —— 自然呼吸感的微抖，真實感 |
| `whip pan` | 甩鏡 —— 極速轉動產生運動模糊，常當轉場 |
| `dutch angle` | 德式傾斜角 —— 水平線傾斜，不安、混亂、戲劇張力 |

## 11. 主體追蹤 Subject Tracking

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `leading shot, camera tracking backward in front of the subject` | 前導後退追蹤 —— 在主體前方引導並同步後退，看得到表情 |
| `following shot, camera tracking forward behind the subject` | 跟隨前進追蹤 —— 在主體後方跟拍，帶入感強 |
| `side tracking, parallel to the subject` | 平行側向追蹤 —— 與主體並行橫移 |
| `POV first person walk` | 第一人稱步行視角 —— 模擬人眼行走 |

## 12. 時間與速度 Time & Speed

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `hyperlapse, moving time lapse` | 移動縮時 —— 一邊移動一邊縮時，空間與時間同時壓縮 |
| `time lapse from a fixed camera` | 靜態縮時 —— 固定機位下時間飛逝 |
| `bullet time, frozen moment with orbiting camera` | 子彈時間 —— 主體凍結或極慢，相機環繞 |

## 13. 極端方位與視角 Extreme Orientation

| 英文提示詞 | 中文 · 效果 |
|---|---|
| `barrel roll, camera rotates 360 degrees along its axis` | 桶滾旋渦 —— 相機沿鏡頭軸翻滾一圈 |
| `inception shot, gravity defying rotating environment` | 全面啟動旋轉 —— 重力與空間顛倒的旋轉 |
| `worm's eye tracking at ground level` | 蟲眼地平追蹤 —— 極低貼地仰視跟拍 |

---

## 怎麼用進提示詞

運鏡不要單獨丟一句，要和「主體動作 + 環境動態 + 光線」寫在同一段裡（見
`prompt-guide.md` 的影片段落）。示範：

> A lone hiker crests a ridge at dawn, shoulders heaving, then straightens and lifts her chin as
> the valley opens below. Mist rolls through the pines beneath her and loose scree shifts under her
> boots. **The camera cranes up to a high angle reveal** as she stops, the frame widening from her
> silhouette to the full basin. Golden hour backlight, cool blue shadows, cinematic live action,
> 35mm, deep focus.

同一個主體換運鏡就是完全不同的鏡頭：

| 運鏡 | 觀眾感受 |
|---|---|
| `slow dolly in` | 專注在她的疲憊與決心 |
| `crane up to a high angle reveal` | 她有多渺小、山谷有多大 |
| `worm's eye tracking at ground level` | 腳步的重量與地形的險 |
| `FPV drone aggressive dive` | 腎上腺素、極限運動感 |

## 常見錯誤

| 錯誤 | 說明 |
|---|---|
| 一顆鏡頭塞三種運鏡 | 模型通常會做出四不像，拆成多顆鏡頭再接 |
| 只寫運鏡不寫主體動作 | 畫面會很空，運鏡是載體不是內容 |
| 用縮寫或術語代號 | 寫 `WS`、`CU`、`Shot 2` 這種分鏡表寫法模型看不懂，要寫成完整敘述 |
| 5 秒的片長要求複雜運鏡 | 環繞 360 度、無限縮放這類需要時間展開，秒數太短會被壓縮成亂動 |
