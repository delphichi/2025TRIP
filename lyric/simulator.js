'use strict';

(function () {

    const $ = id => document.getElementById(id);

    // ---------- Presets（生成模式）----------
    // 每個 preset：
    //   prompt: 4-5 個字，永遠掛在 scene 上排（黃色框）
    //   generated: 依序長出的字，長到下排（紫色框，當前正在產生的字金色）
    //   attentions[i] = { focus: {idx: weight, ...}, reason: '...' }
    //     i = generated 的第 i 個字（0-indexed）
    //     focus 的 idx 是「combined visible tokens」的位置：
    //       - 0..promptLen-1 對應 prompt
    //       - promptLen..promptLen+i-1 對應已生成的前 i 個字
    //     權重加總不用 = 1（我們會 softmax 歸一化，也讓你可以直觀填分數）
    const PRESETS = [
        {
            id: 'zh-samba-lyric',
            label: '🎵 南美風中文歌詞（風格延續 + 意象鏈）',
            prompt: ['桑巴', '節奏', '的', '午後'],
            generated: ['她', '的', '裙擺', '搖曳', '如', '熱帶', '花朵'],
            attentions: {
                0: {   // 「她」
                    focus: { 0: 0.45, 1: 0.30, 3: 0.20, 2: 0.05 },
                    reason: '從「桑巴節奏的午後」推出場景需要一個人物出場——「她」是最典型的歌詞主角。',
                },
                1: {   // 「的」
                    focus: { 4: 0.85, 0: 0.10, 3: 0.05 },
                    reason: '文法連詞，緊跟前一個字「她」——這是 attention 最短距離的「相鄰依賴」。',
                },
                2: {   // 「裙擺」
                    focus: { 0: 0.30, 3: 0.20, 4: 0.35, 5: 0.10, 1: 0.05 },
                    reason: '「她的」需要接一個名詞。attention 同時看「桑巴」「午後」（風格）跟「她」（主體），推出典型的南美服飾意象「裙擺」。',
                },
                3: {   // 「搖曳」
                    focus: { 1: 0.50, 6: 0.35, 0: 0.10, 4: 0.05 },
                    reason: '「節奏」+「裙擺」→ 產生一個表達動態的動詞「搖曳」。這是<b>遠距離依賴</b>——「搖曳」跨過 5 個位置回望「節奏」。',
                },
                4: {   // 「如」
                    focus: { 6: 0.60, 7: 0.30, 0: 0.05, 3: 0.05 },
                    reason: '比喻連詞「如」緊跟被比喻物「裙擺」跟動作「搖曳」——這是 AI 決定「要開始寫比喻了」的信號。',
                },
                5: {   // 「熱帶」
                    focus: { 0: 0.40, 3: 0.35, 6: 0.15, 8: 0.10 },
                    reason: '風格關鍵詞回望——「桑巴」跟「午後」重新被激活，讓比喻對象保持在南美/拉丁風格內，不會突然變成櫻花或雪。',
                },
                6: {   // 「花朵」
                    focus: { 6: 0.45, 7: 0.30, 9: 0.20, 5: 0.05 },
                    reason: '完成比喻鏈「裙擺搖曳如熱帶花朵」——回望「裙擺」跟「搖曳」形成閉環。詩意到位。',
                },
            },
            noteLines: [
                '這是 AI 生成一句南美風中文歌詞時，每個新字產生時 attention 的分布。',
                '<b>Prompt「桑巴節奏的午後」永遠掛在畫面上</b>——所有後續字都能 attention 回望它。這就是為什麼<b>好的 prompt 讓生成保持一致風格</b>。',
                '不是 AI「記得」你的要求，是 attention 讓每個新字都在重新讀一次你的 prompt。',
                '注意「花朵」關注 3 個字之前的「裙擺」——這是<b>遠距離依賴</b>，讓比喻鏈閉環。',
                '👆 按「開始生成」逐字看 AI 的注意力軌跡。',
            ],
        },
        {
            id: 'zh-rhyme',
            label: '🎵 押韻位置的 attention（AABB 韻腳）',
            prompt: ['寫', '一首', '押韻', '的', '短詩'],
            generated: ['月光', '灑落', '窗前', '光影', '搖曳', '心間'],
            attentions: {
                0: {   // 「月光」
                    focus: { 2: 0.40, 3: 0.30, 4: 0.20, 0: 0.10 },
                    reason: '從「押韻的短詩」開場——選一個典型抒情意象「月光」。',
                },
                1: {   // 「灑落」
                    focus: { 5: 0.75, 0: 0.15, 4: 0.10 },
                    reason: '「月光」需要一個描述性動詞，attention 主要看剛產生的「月光」推導動作。',
                },
                2: {   // 「窗前」
                    focus: { 5: 0.35, 6: 0.30, 2: 0.25, 4: 0.10 },
                    reason: '「灑落」需要一個接收場景——但更重要的是：<b>attention 看「押韻」這個 prompt 詞，開始準備韻腳</b>。「前」是「an」韻。',
                },
                3: {   // 「光影」
                    focus: { 5: 0.55, 6: 0.35, 2: 0.10 },
                    reason: '第二句起頭。呼應「月光」意象，但變化說法為「光影」——不重複但同一族群。',
                },
                4: {   // 「搖曳」
                    focus: { 8: 0.70, 6: 0.20, 2: 0.10 },
                    reason: '「光影」需要動詞，attention 看剛產生的「光影」→ 推出「搖曳」動作。',
                },
                5: {   // 「心間」
                    focus: { 7: 0.55, 2: 0.30, 8: 0.10, 9: 0.05 },
                    reason: '🎯 這是這個 preset 的教學核心：<b>「心間」必須押「an」韻</b>。attention <b>強烈回望「窗前」這個位置</b>（55%！）確認韻腳對照。這正是 AI 押韻不是「懂韻律」——是 <b>attention 讓「這個位置的字」能對照「上一句同位置的字」</b>。',
                },
            },
            noteLines: [
                '<b>押韻的教學核心</b>：AI 押韻不是「懂韻律」，是 attention 讓「這個位置的字」能回望「上一句同位置的字」對照韻母。',
                '第 1 句「月光灑落<b>窗前</b>」以「前」（an 韻）結尾。',
                '第 2 句「光影搖曳<b>心間</b>」以「間」（an 韻）結尾——押韻。',
                '看「心間」產生時的 attention 分布——<b>「窗前」位置被關注 55%</b>！這是押韻位置的鐵證。',
                '這是最反直覺、觀眾看完最震撼的教學橋段。',
            ],
        },
        {
            // 中文詩詞對仗——位置對照 attention 的極致展現
            // Reviewer round 5 建議：這在中文 YouTube/B 站上沒人做，是頻道差異化旗艦
            id: 'zh-antithesis',
            label: '🎋 對仗：黃河對白日、山對海（中文詩詞位置對照）',
            prompt: ['寫', '五言', '對仗詩'],
            generated: ['白日', '依', '山', '盡', '黃河', '入', '海', '流'],
            // combined idx: 0=寫, 1=五言, 2=對仗詩, 3-6=白日/依/山/盡, 7-10=黃河/入/海/流
            attentions: {
                0: {   // 白日
                    focus: { 1: 0.40, 2: 0.35, 0: 0.20, 3: 0.05 },
                    reason: '從「寫五言對仗詩」開場，選一個自然景象作為第一句起頭——「白日」是傳統詩詞常用意象。',
                },
                1: {   // 依
                    focus: { 3: 0.65, 1: 0.20, 2: 0.15 },
                    reason: '「白日」需要一個動詞連接。「依」表示倚靠、附著——AI 在建構「白日依 X」的動態結構。',
                },
                2: {   // 山
                    focus: { 4: 0.45, 3: 0.30, 1: 0.15, 2: 0.10 },
                    reason: '「依」需要一個地形名詞被依附。attention 主看剛產生的「依」＋「白日」共同推導出「山」——構成「白日依山」的完整意象。',
                },
                3: {   // 盡
                    focus: { 5: 0.50, 4: 0.25, 3: 0.15, 2: 0.10 },
                    reason: '「白日依山」需要收尾動作。「盡」表示消失——完成第一句「白日依山盡」（夕陽落到山後）。',
                },
                4: {   // 黃河 ← 對仗的第一個 aha！
                    focus: { 3: 0.65, 2: 0.20, 5: 0.10, 6: 0.05 },
                    reason: '🎯 <b>第二句起頭，attention 強烈回望第一句的同位置</b>——「白日」是「自然景象名詞」，AI 決定「黃河」對仗（都是天地自然、都是雙字詞）。這不是巧合，是位置對照的 attention 機制。',
                },
                5: {   // 入
                    focus: { 4: 0.60, 7: 0.20, 3: 0.15, 5: 0.05 },
                    reason: '對照第一句同位置的「依」——都是<b>動詞</b>、都是「進入某地形」語意。「入」對「依」——動詞對動詞。',
                },
                6: {   // 海
                    focus: { 5: 0.65, 8: 0.20, 4: 0.10, 3: 0.05 },
                    reason: '對照第一句同位置的「山」——都是<b>地形名詞</b>。「海」對「山」——山地對水域，中國詩詞經典對仗。',
                },
                7: {   // 流
                    focus: { 6: 0.70, 9: 0.15, 5: 0.10, 4: 0.05 },
                    reason: '對照第一句同位置的「盡」——都是<b>結尾動詞</b>。「流」對「盡」——流動 vs 消失。<b>全句完成：白日依山盡，黃河入海流</b>。這就是 attention 讓 AI 寫對仗的機制。',
                },
            },
            noteLines: [
                '<b>對仗的教學核心</b>：AI 寫對仗詩不是「懂平仄」，是 attention 讓<b>第二句每個位置的字，強烈回望第一句同位置的字</b>。',
                '<b>白日 對 黃河</b>：自然景象雙字詞 ✓',
                '<b>依 對 入</b>：動詞（進入地形）✓',
                '<b>山 對 海</b>：地形名詞 ✓',
                '<b>盡 對 流</b>：結尾動詞 ✓',
                '每一個對照都是 60% 以上的 attention 回望——這是位置對照 attention 的最強視覺教學。',
                '<b>這個 preset 是 AI 讀懂中文詩詞的鑰匙</b>——中文 YouTube / B 站上還沒人做出來。',
            ],
        },
    ];

    // ---------- Utils ----------
    // 對 focus 做 softmax 歸一化：讓所有 weight 加總 = 1（雖然填的時候不強制）
    function normalizeFocus(focus) {
        const out = {};
        let sum = 0;
        for (const k of Object.keys(focus)) sum += focus[k];
        if (sum <= 0) return focus;
        for (const k of Object.keys(focus)) out[k] = focus[k] / sum;
        return out;
    }
    // Easing helpers
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeOutBack = t => {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // ---------- LyricScene: static canvas 畫兩排 tokens ----------
    // 上排 = prompt（黃色）；下排 = generated（紫色，逐字出現）
    class LyricScene {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this._setupHiDPI();
            this.preset = null;
            this.generatedCount = 0;   // 已產生幾個 generated tokens
            this.currentGenIdx = -1;   // 當前正在產生的 idx（-1 = 沒有）
            this.currentGenPlaceholder = false;   // true = 顯示 ? 佔位符；false = 顯示實際字
            this.promptBounds = [];
            this.generatedBounds = [];
        }
        _setupHiDPI() {
            const dpr = window.devicePixelRatio || 1;
            const w = this.canvas.clientWidth || this.canvas.width;
            const h = this.canvas.clientHeight || this.canvas.height;
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);
            this.w = w; this.h = h;
        }
        setPreset(preset) {
            this.preset = preset;
            this.generatedCount = 0;
            this.currentGenIdx = -1;
            this.currentGenPlaceholder = false;
        }
        setGenerationState(count, currentIdx, placeholder) {
            this.generatedCount = count;
            this.currentGenIdx = currentIdx;
            this.currentGenPlaceholder = placeholder;
        }
        render() {
            const { ctx, w, h, preset } = this;
            ctx.clearRect(0, 0, w, h);
            if (!preset) {
                ctx.fillStyle = '#9ca3af';
                ctx.font = '15px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('選一個 preset，按「▶ 開始生成」', w / 2, h / 2);
                return;
            }
            const promptY = h * 0.20;
            const generatedY = h * 0.72;

            // Section labels
            ctx.fillStyle = '#b45309';
            ctx.font = 'bold 12px -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒 PROMPT（永遠可被回望）', 20, promptY - 40);

            ctx.fillStyle = '#5b21b6';
            ctx.fillText(`✨ GENERATED（逐字生成，${this.generatedCount}/${preset.generated.length}）`, 20, generatedY - 40);

            // Draw prompt tokens
            this.promptBounds = this._layoutTokens(preset.prompt, promptY);
            for (let i = 0; i < preset.prompt.length; i++) {
                const b = this.promptBounds[i];
                this._drawToken(b, preset.prompt[i], {
                    fill: '#fef3c7',
                    stroke: '#eab308',
                    ink: '#78350f',
                    fontWeight: 'bold',
                });
            }

            // Draw generated tokens
            this.generatedBounds = this._layoutTokens(preset.generated, generatedY);
            for (let i = 0; i < preset.generated.length; i++) {
                const b = this.generatedBounds[i];
                if (i < this.generatedCount) {
                    // Done：紫色 solid
                    this._drawToken(b, preset.generated[i], {
                        fill: '#f3e8ff',
                        stroke: '#a78bfa',
                        ink: '#4c1d95',
                        fontWeight: 'normal',
                    });
                } else if (i === this.currentGenIdx) {
                    // Current：金色高亮（脈動）
                    const pulseT = (Date.now() / 400) % 1;
                    const pulseGlow = 3 + 4 * Math.abs(Math.sin(pulseT * Math.PI));
                    ctx.save();
                    ctx.shadowColor = 'rgba(245, 158, 11, .6)';
                    ctx.shadowBlur = pulseGlow;
                    this._drawToken(b, this.currentGenPlaceholder ? '?' : preset.generated[i], {
                        fill: this.currentGenPlaceholder ? '#fff7ed' : '#fef3c7',
                        stroke: '#f59e0b',
                        ink: '#78350f',
                        fontWeight: 'bold',
                        placeholder: this.currentGenPlaceholder,
                    });
                    ctx.restore();
                } else {
                    // 未生成：淡灰虛線佔位
                    this._drawToken(b, '', {
                        fill: 'rgba(226,232,240,.3)',
                        stroke: '#e5e7eb',
                        ink: '#cbd5e1',
                        dashed: true,
                    });
                }
            }
        }
        _layoutTokens(tokens, y) {
            const ctx = this.ctx;
            const padX = 30;
            const n = tokens.length;
            const spacing = (this.w - padX * 2) / (n - 1 || 1);
            return tokens.map((t, i) => {
                ctx.font = 'bold 17px -apple-system, "Segoe UI", sans-serif';
                const tw = Math.max(52, ctx.measureText(t).width + 22);
                return { idx: i, x: padX + i * spacing, y, w: tw, h: 42, text: t };
            });
        }
        _drawToken(b, text, opts) {
            const { fill, stroke, ink, fontWeight = 'normal', dashed = false, placeholder = false } = opts;
            const ctx = this.ctx;
            const x = b.x - b.w / 2, y = b.y - b.h / 2;
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.5;
            if (dashed) ctx.setLineDash([4, 3]);
            this._roundRect(x, y, b.w, b.h, 10);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
            if (text) {
                ctx.fillStyle = ink;
                ctx.font = `${fontWeight} ${placeholder ? '20' : '18'}px -apple-system, "Segoe UI", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, b.x, b.y);
            }
        }
        _roundRect(x, y, w, h, r) {
            const ctx = this.ctx;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }
        // 拿指定 idx 的 bounds（0..promptLen-1 = prompt；之後 = generated）
        boundsAt(idx) {
            const pn = this.preset.prompt.length;
            if (idx < pn) return this.promptBounds[idx];
            return this.generatedBounds[idx - pn];
        }
    }

    // ---------- GenerationAnimator ----------
    // Phase 1（500ms）：Prompt 淡入
    // Phase 2（每個 gen 字 1200ms × N）：逐字生成，每字 3 sub-phase
    //   Sub-a（0-0.4）：? 佔位符出現 + attention 箭頭扇出
    //   Sub-b（0.4-0.7）：? 變成實際字 + reason 淡入
    //   Sub-c（0.7-1.0）：attention 淡出，該字定型加入 generatedCount
    // Phase 3（800ms）：summary 顯示
    const PHASE1_MS = 500;
    const PHASE2_PER_TOKEN_MS = 1200;
    const PHASE3_MS = 800;

    class GenerationAnimator {
        constructor(overlayCanvas, scene) {
            this.canvas = overlayCanvas;
            this.ctx = overlayCanvas.getContext('2d');
            this.scene = scene;
            this._setupHiDPI();
            this.playing = false;
            this._speed = 1.0;
            this.phase = 0;
            this.tokenIdx = 0;   // Phase 2 內：目前產生到第幾個 generated token
            this.stageStart = 0;
            this.elapsedInStage = 0;
            this.rafId = null;
            this.onReasonChange = null;
            this.onEnd = null;
            this.onPhaseChange = null;
        }
        _setupHiDPI() {
            const dpr = window.devicePixelRatio || 1;
            const w = this.canvas.clientWidth || this.canvas.width;
            const h = this.canvas.clientHeight || this.canvas.height;
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);
            this.w = w; this.h = h;
        }
        get speed() { return this._speed; }
        set speed(v) {
            const oldSpeed = this._speed;
            const newSpeed = v || 1;
            if (oldSpeed === newSpeed) return;
            if (this.playing) {
                const now = performance.now();
                const elapsed = now - this.stageStart;
                this.stageStart = now - elapsed * (oldSpeed / newSpeed);
            } else {
                this.elapsedInStage = this.elapsedInStage * (oldSpeed / newSpeed);
            }
            this._speed = newSpeed;
        }
        start(preset) {
            this.preset = preset;
            this.tokenIdx = 0;
            this.phase = 0;
            this.stageStart = performance.now();
            this.playing = true;
            this._reasonShownForIdx = -1;
            this.scene.setPreset(preset);
            this.scene.setGenerationState(0, -1, false);
            this._clear();
            this._loop();
            if (this.onPhaseChange) this.onPhaseChange(this.phase);
        }
        pause() { this.playing = false; if (this.rafId) cancelAnimationFrame(this.rafId); }
        resume() {
            if (this.playing) return;
            this.playing = true;
            this.stageStart = performance.now() - this.elapsedInStage;
            this._loop();
        }
        stop() {
            this.playing = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.phase = 0;
            this.tokenIdx = 0;
            this._clear();
        }
        _clear() { this.ctx.clearRect(0, 0, this.w, this.h); }
        _phaseDurationMs() {
            if (this.phase === 0) return PHASE1_MS / this._speed;
            if (this.phase === 1) return PHASE2_PER_TOKEN_MS / this._speed;
            if (this.phase === 2) return PHASE3_MS / this._speed;
            return Infinity;
        }
        _loop() {
            if (!this.playing) return;
            const now = performance.now();
            const elapsed = now - this.stageStart;
            this.elapsedInStage = elapsed;
            const dur = this._phaseDurationMs();
            const t = dur === Infinity ? 1 : Math.min(1, elapsed / dur);
            // Reviewer round 5: 把「placeholder ? → 實際字」跟「reason 切換」
            // 從 _draw 拿出來放這裡（_draw 該是純函式）。同時 reason 延到
            // sub-b 才切換，避免 sub-a 期間畫面是 ? 但 reason 已經爆雷字。
            if (this.phase === 1) {
                if (t >= 0.4 && this.scene.currentGenPlaceholder) {
                    this.scene.setGenerationState(this.tokenIdx, this.tokenIdx, false);
                    // 同時觸發 reason 更新（延到字定型後才講「這個字是 X」）
                    if (!this._reasonShownForIdx || this._reasonShownForIdx !== this.tokenIdx) {
                        const att = this.preset.attentions[this.tokenIdx];
                        if (att && this.onReasonChange) {
                            this.onReasonChange(att.reason || '', this.tokenIdx);
                        }
                        this._reasonShownForIdx = this.tokenIdx;
                    }
                }
            }
            this._draw(t);
            this.scene.render();
            if (t >= 1) {
                this._advance(now);
            }
            this.rafId = requestAnimationFrame(() => this._loop());
        }
        _advance(now) {
            if (this.phase === 0) {
                // Phase 1 結束 → Phase 2 開始
                this.phase = 1;
                this.tokenIdx = 0;
                this.stageStart = now;
                this._enterToken(0);
                if (this.onPhaseChange) this.onPhaseChange(this.phase);
            } else if (this.phase === 1) {
                // 當前 token 產生完，塞進 generatedCount，看是否還有下一個
                this.scene.setGenerationState(this.tokenIdx + 1, -1, false);
                this.tokenIdx += 1;
                if (this.tokenIdx >= this.preset.generated.length) {
                    // 全部生成完 → Phase 3
                    this.phase = 2;
                    this.stageStart = now;
                    if (this.onPhaseChange) this.onPhaseChange(this.phase);
                } else {
                    // 進下一個 token
                    this.stageStart = now;
                    this._enterToken(this.tokenIdx);
                }
            } else if (this.phase === 2) {
                // Phase 3 結束 → 動畫終止
                this.phase = 3;
                if (this.onEnd) this.onEnd();
                setTimeout(() => { this.playing = false; if (this.rafId) cancelAnimationFrame(this.rafId); }, 0);
            }
        }
        _enterToken(idx) {
            // 只設 scene 狀態，reason 延到 sub-b (t>=0.4) 才切換
            this.scene.setGenerationState(idx, idx, true);
        }

        _draw(t) {
            this.ctx.clearRect(0, 0, this.w, this.h);
            if (this.phase === 0) return this._drawPhase1(t);
            if (this.phase === 1) return this._drawPhase2(t);
            if (this.phase === 2) return this._drawPhase3(t);
        }
        // Phase 1: prompt 淡入光暈
        _drawPhase1(t) {
            const alpha = easeOutCubic(t);
            const ctx = this.ctx;
            const promptY = this.h * 0.20;
            ctx.save();
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(15, promptY - 30);
            ctx.lineTo(this.w - 15, promptY - 30);
            ctx.stroke();
            ctx.restore();
        }
        // Phase 2: 當前 token 的 attention 箭頭
        // Sub-a (0-0.4): ? 佔位符 + 箭頭扇出
        // Sub-b (0.4-0.7): ? → 實際字（scene 這時把 placeholder 設為 false）
        // Sub-c (0.7-1.0): 箭頭淡出
        _drawPhase2(t) {
            const i = this.tokenIdx;
            const att = this.preset.attentions[i];
            if (!att) return;
            // Placeholder ? → 實際字 的切換移到 _loop（純 draw，不做狀態變更）
            // Arrow alpha: fade in sub-a, hold sub-b, fade out sub-c
            let arrowAlpha;
            if (t < 0.4) arrowAlpha = easeOutCubic(t / 0.4);
            else if (t < 0.7) arrowAlpha = 1.0;
            else arrowAlpha = 1 - easeInOutCubic((t - 0.7) / 0.3);

            const focus = normalizeFocus(att.focus);
            const genBounds = this.scene.generatedBounds[i];
            if (!genBounds) return;
            const from = { x: genBounds.x, y: genBounds.y - genBounds.h / 2 };

            for (const kStr of Object.keys(focus)) {
                const k = parseInt(kStr);
                const weight = focus[k];
                if (weight < 0.02) continue;
                const toBound = this.scene.boundsAt(k);
                if (!toBound) continue;
                // Determine if target is prompt or generated
                const isPrompt = k < this.preset.prompt.length;
                const to = { x: toBound.x, y: toBound.y + (isPrompt ? toBound.h / 2 : -toBound.h / 2) };
                this._drawAttentionArrow(from, to, weight, arrowAlpha, isPrompt);
            }
        }
        _drawAttentionArrow(from, to, weight, alpha, isPrompt) {
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = alpha;
            const color = isPrompt ? '#eab308' : '#a78bfa';
            const thickness = clamp(weight * 8, 1.2, 6);
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            ctx.lineCap = 'round';
            // 曲線：控制點在中間偏上
            const midX = (from.x + to.x) / 2;
            const midY = Math.min(from.y, to.y) - 30 - weight * 20;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(midX, midY, to.x, to.y);
            ctx.stroke();
            // Arrow head
            const angle = Math.atan2(to.y - midY, to.x - midX);
            const ah = 8;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(to.x, to.y);
            ctx.lineTo(to.x - ah * Math.cos(angle - Math.PI / 6), to.y - ah * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(to.x - ah * Math.cos(angle + Math.PI / 6), to.y - ah * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            // Weight label
            if (weight >= 0.15) {
                ctx.fillStyle = color;
                ctx.font = 'bold 11px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const pctStr = (weight * 100).toFixed(0) + '%';
                const bg = ctx.measureText(pctStr).width + 8;
                ctx.fillStyle = '#fff';
                ctx.fillRect(midX - bg / 2, midY - 8, bg, 16);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(midX - bg / 2, midY - 8, bg, 16);
                ctx.fillStyle = color;
                ctx.fillText(pctStr, midX, midY);
            }
            ctx.restore();
        }
        // Phase 3: Reviewer round 5 建議——不畫任何 overlay，讓 generated tokens
        // 完整呈現在 scene 上。reason box 的「✅ 全句完成」文字就足夠了。
        // 收尾比彈出卡片更有詩意——畫面回歸乾淨、整句可讀。
        _drawPhase3(t) {
            // 意圖留空
        }
    }

    // ---------- Notes rendering ----------
    function renderNotes(preset) {
        const log = $('log');
        if (!preset || !preset.noteLines) { log.innerHTML = ''; return; }
        log.innerHTML = `
            <h3>💡 這個 preset 想教你什麼</h3>
            ${preset.noteLines.map(l => `<p>• ${l}</p>`).join('')}
            <h3>🧬 生成模式跟分析模式的關係</h3>
            <p>兩者共用 <code>softmax(Q·K^T / √d_k) · V</code> 這條公式，只差在 <b>Q 是誰</b>：</p>
            <ul>
                <li>分析模式的 Q = 「某個已存在的字」</li>
                <li>生成模式的 Q = 「下一個要生成的位置」</li>
            </ul>
            <p>Prompt 永遠掛在最左邊、永遠可被回望——這就是 <b>prompt 錨定風格</b>的機制。</p>
        `;
    }

    // ---------- Wire up ----------
    let currentPresetIdx = 0;
    let scene = null;
    let animator = null;

    function currentPreset() { return PRESETS[currentPresetIdx]; }

    function _syncControls(state) {
        const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
        show('btn-play', state === 'idle' || state === 'done');
        show('btn-pause', state === 'playing');
        show('btn-resume', state === 'paused');
        show('btn-replay', state === 'playing' || state === 'paused' || state === 'done');
    }

    function resetView() {
        if (animator) animator.stop();
        const preset = currentPreset();
        scene.setPreset(preset);
        scene.setGenerationState(0, -1, false);
        scene.render();
        $('reason-text').textContent = '按「▶ 開始生成」看 AI 逐字寫作';
        renderNotes(preset);
        _syncControls('idle');
    }

    function startAnim() {
        const preset = currentPreset();
        animator.speed = parseFloat($('cfg-speed').value) || 1;
        animator.onReasonChange = (reason, idx) => {
            $('reason-text').innerHTML = `<b>生成第 ${idx + 1} 個字「${preset.generated[idx]}」</b>：${reason}`;
        };
        animator.onEnd = () => {
            $('reason-text').innerHTML = `<b>✅ 全句完成</b>：<b class="prompt-tag" style="color:#b45309;background:#fef3c7;padding:1px 6px;border-radius:4px">${preset.prompt.join('')}</b> → ${preset.generated.join('')}`;
            _syncControls('done');
        };
        animator.start(preset);
        _syncControls('playing');
    }

    function bootstrap() {
        const presetSel = $('cfg-preset');
        PRESETS.forEach((p, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = p.label;
            presetSel.appendChild(opt);
        });
        presetSel.addEventListener('change', () => {
            currentPresetIdx = parseInt(presetSel.value);
            resetView();
        });
        $('cfg-speed').addEventListener('change', () => {
            if (animator) animator.speed = parseFloat($('cfg-speed').value) || 1;
        });

        scene = new LyricScene($('scene'));
        animator = new GenerationAnimator($('scene-overlay'), scene);

        $('btn-play').addEventListener('click', startAnim);
        $('btn-pause').addEventListener('click', () => { animator.pause(); _syncControls('paused'); });
        $('btn-resume').addEventListener('click', () => { animator.resume(); _syncControls('playing'); });
        $('btn-replay').addEventListener('click', () => { animator.stop(); startAnim(); });
        $('btn-reset').addEventListener('click', resetView);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && animator) { animator.stop(); resetView(); }
        });

        resetView();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
