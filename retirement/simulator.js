'use strict';

(function () {

    // ---------- PRNG (LCG, 快速+夠隨機) ----------
    function mkRng(seed) {
        let s = (seed >>> 0) || 1;
        return function () {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 0x100000000;
        };
    }
    // Box-Muller → gaussian(0,1)
    function gauss(rng) {
        let u = 0, v = 0;
        while (u === 0) u = rng();
        while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // ---------- 生成 N 個月的股票 + 債券月度 log 回報 ----------
    // 股票 CAGR 10%, 年波動 15% → 月度 μ=log(1.10)/12, σ=15%/sqrt(12)≈4.33%
    // 債券 CAGR 3.5%, 年波動 5% → 月度 μ=log(1.035)/12, σ≈1.44%
    // 崩盤 poisson-ish：每月抽 rng():
    //   < 0.006 (每年 ~7%)  = 修正 -8% / 3 個月
    //   < 0.010 (每年 ~4%)  = 熊市 -22% / 8 個月
    //   < 0.0016 (每年 ~1%) = 黑天鵝 -42% / 4 個月
    function generateReturns(seed, months) {
        const rng = mkRng(seed);
        const stockMean = Math.log(1.10) / 12;
        const stockVol = 0.15 / Math.sqrt(12);
        const bondMean = Math.log(1.035) / 12;
        const bondVol = 0.05 / Math.sqrt(12);
        const stock = new Array(months);
        const bond = new Array(months);
        const events = [];   // {month, label, magnitude, category}

        let crashLeft = 0;
        let crashPerMonth = 0;
        let crashCategory = null;

        for (let m = 0; m < months; m++) {
            let sR = stockMean + stockVol * gauss(rng);
            let bR = bondMean + bondVol * gauss(rng);

            if (crashLeft > 0) {
                sR += crashPerMonth;
                bR += crashPerMonth * 0.30;  // 債券也受影響但只 30%
                crashLeft -= 1;
            } else {
                const r = rng();
                let mag = 0, dur = 0, label = null, cat = null;
                if (r < 0.0016) {
                    mag = -0.42; dur = 4; label = '黑天鵝崩盤'; cat = 'major';
                } else if (r < 0.010) {
                    mag = -0.22; dur = 8; label = '熊市'; cat = 'bear';
                } else if (r < 0.016) {   // 累加 → 修正 = r∈[0.010, 0.016] 這 0.6% 每月
                    mag = -0.08; dur = 3; label = '修正'; cat = 'correction';
                }
                if (mag !== 0) {
                    crashPerMonth = mag / dur;
                    crashLeft = dur - 1;
                    crashCategory = cat;
                    sR += crashPerMonth;
                    bR += crashPerMonth * 0.30;
                    events.push({ month: m, label, magnitude: mag, category: cat });
                }
            }
            stock[m] = sR;
            bond[m] = bR;
        }
        return { stock, bond, events };
    }

    // ---------- 策略配置 ----------
    const STRATEGIES = {
        dca:    { name: 'DCA 100% 股票',  stock: 1.00, bond: 0.00 },
        '6040': { name: '60/40 股債配置',  stock: 0.60, bond: 0.40 },
        '4060': { name: '40/60 保守',      stock: 0.40, bond: 0.60 },
    };
    const GLIDE_TARGET = { stock: 0.40, bond: 0.60 };   // 退休後切換的策略

    // ---------- 跑一條命 ----------
    // 回傳 { timeline: [{month, assets, age, isRetired}], events, retireMonth, ruinMonth, seed }
    function simulateOneLife(cfg, seed) {
        const startAge = cfg.age;
        const endAge = 90;
        const retireAge = cfg.retireAge;
        const totalMonths = (endAge - startAge) * 12;
        const retireMonth = Math.max(0, (retireAge - startAge) * 12);
        const stratBase = STRATEGIES[cfg.strategy];

        const returns = generateReturns(seed, totalMonths);
        // 初始資產按策略分配
        let stockValue = cfg.initialAssets * stratBase.stock;
        let bondValue = cfg.initialAssets * stratBase.bond;
        let monthlySave = cfg.monthlySave;
        let ruinMonth = null;
        const timeline = [{
            month: 0,
            assets: cfg.initialAssets,
            age: startAge,
            isRetired: false,
        }];

        for (let m = 0; m < totalMonths; m++) {
            // 1. 市場變動先跑（月底結算）
            stockValue *= Math.exp(returns.stock[m]);
            bondValue *= Math.exp(returns.bond[m]);

            const isRetired = m >= retireMonth;
            // 決定「這個月要用什麼策略配置」（退休前用 base、退休後可切 glide）
            const strat = (cfg.glide === 'on' && isRetired) ? GLIDE_TARGET : stratBase;

            // 2. 現金流：退休前存錢、退休後提領
            const flow = isRetired ? -cfg.monthlyWithdraw : monthlySave;

            // 3. 加薪：每年（每 12 個月）成長 saveGrowth%（退休前）
            if (!isRetired && m > 0 && (m % 12) === 0) {
                monthlySave *= 1 + (cfg.saveGrowth / 100);
            }

            // 4. 套用現金流
            if (flow >= 0) {
                // 存錢 → 按策略配置買
                stockValue += flow * strat.stock;
                bondValue += flow * strat.bond;
            } else {
                // 提領 → 從現有部位按比例扣（真實世界會先扣債券保留股票，但比例扣是穩妥的第一版）
                const cur = stockValue + bondValue;
                if (cur > 0) {
                    const stockRatio = stockValue / cur;
                    const bondRatio = bondValue / cur;
                    stockValue += flow * stockRatio;
                    bondValue += flow * bondRatio;
                    stockValue = Math.max(0, stockValue);
                    bondValue = Math.max(0, bondValue);
                }
            }

            // 5. Rebalance（退休後 glide 生效時，每 12 個月重新配比）
            if (cfg.glide === 'on' && isRetired && (m - retireMonth) > 0 && ((m - retireMonth) % 12) === 0) {
                const total = stockValue + bondValue;
                stockValue = total * GLIDE_TARGET.stock;
                bondValue = total * GLIDE_TARGET.bond;
            }

            const totalAssets = stockValue + bondValue;
            if (totalAssets <= 0 && ruinMonth === null) {
                ruinMonth = m + 1;
                stockValue = 0;
                bondValue = 0;
            }

            timeline.push({
                month: m + 1,
                assets: totalAssets,
                age: startAge + (m + 1) / 12,
                isRetired,
            });
        }
        return { timeline, events: returns.events, retireMonth, ruinMonth, seed };
    }

    // ---------- Monte Carlo ----------
    function runMonteCarlo(cfg, n, seedBase) {
        const results = new Array(n);
        for (let i = 0; i < n; i++) {
            // 用大質數乘 index 讓 seed 分散
            const seed = ((seedBase >>> 0) + i * 2654435761) >>> 0;
            results[i] = simulateOneLife(cfg, seed);
        }
        return results;
    }

    // 每個月算 P05/P20/P50/P80/P95 envelope
    function computeFanChart(results) {
        if (!results || results.length === 0) return null;
        const months = results[0].timeline.length;
        const bands = new Array(months);
        for (let m = 0; m < months; m++) {
            const values = new Array(results.length);
            for (let i = 0; i < results.length; i++) {
                values[i] = results[i].timeline[m]?.assets ?? 0;
            }
            values.sort((a, b) => a - b);
            const at = p => values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * p)))];
            bands[m] = { p05: at(0.05), p20: at(0.20), p50: at(0.5), p80: at(0.80), p95: at(0.95) };
        }
        return bands;
    }

    // ---------- Utils ----------
    function fmtMoney(v) {
        if (!isFinite(v)) return '—';
        if (v <= 0) return '0';
        if (v >= 1e8) return (v / 1e8).toFixed(1) + '億';
        if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬';
        if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
        return Math.round(v).toString();
    }
    function pct(v, d = 1) { return (v * 100).toFixed(d) + '%'; }
    function $(id) { return document.getElementById(id); }
    function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

    // ---------- Charts ----------
    class TimelineChart {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth || canvas.width;
            const h = canvas.clientHeight || canvas.height;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            this.ctx.scale(dpr, dpr);
            this.w = w;
            this.h = h;
        }
        render({ life, fanBands, cfg }) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            const padL = 68, padR = 12, padT = 15, padB = 34;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            const months = life ? life.timeline.length : (fanBands ? fanBands.length : (90 - cfg.age) * 12 + 1);

            if (!life && !fanBands) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('按「▶ 跑一條命」或「📊 跑 100 條命」開始', w / 2, h / 2);
                return;
            }

            // 決定 Y 上限
            let yMax = cfg.initialAssets * 2;
            if (life) yMax = Math.max(yMax, ...life.timeline.map(p => p.assets));
            if (fanBands) yMax = Math.max(yMax, ...fanBands.map(b => b.p95));
            yMax *= 1.05;

            const xAt = i => padL + i / (months - 1) * chartW;
            const yAt = v => padT + chartH - Math.max(0, v) / yMax * chartH;

            // 網格 + Y 軸標籤
            ctx.strokeStyle = '#e5e7eb';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 5; i++) {
                const v = yMax * i / 5;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
                ctx.fillText(fmtMoney(v), padL - 4, y);
            }

            // 退休日虛線
            const retireMonth = (cfg.retireAge - cfg.age) * 12;
            if (retireMonth >= 0 && retireMonth < months) {
                const retireX = xAt(retireMonth);
                ctx.strokeStyle = '#f59e0b';
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(retireX, padT); ctx.lineTo(retireX, padT + chartH); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#f59e0b';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.font = '11px sans-serif';
                ctx.fillText(`退休 ${cfg.retireAge} 歲`, retireX, padT - 2);
            }

            // Fan bands（畫在單條命 line 之前，line 在上）
            if (fanBands) {
                // P05-P95 outer
                ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
                ctx.beginPath();
                ctx.moveTo(xAt(0), yAt(fanBands[0].p95));
                for (let m = 1; m < fanBands.length; m++) ctx.lineTo(xAt(m), yAt(fanBands[m].p95));
                for (let m = fanBands.length - 1; m >= 0; m--) ctx.lineTo(xAt(m), yAt(fanBands[m].p05));
                ctx.closePath();
                ctx.fill();
                // P20-P80 inner
                ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
                ctx.beginPath();
                ctx.moveTo(xAt(0), yAt(fanBands[0].p80));
                for (let m = 1; m < fanBands.length; m++) ctx.lineTo(xAt(m), yAt(fanBands[m].p80));
                for (let m = fanBands.length - 1; m >= 0; m--) ctx.lineTo(xAt(m), yAt(fanBands[m].p20));
                ctx.closePath();
                ctx.fill();
                // P50 median line
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(xAt(0), yAt(fanBands[0].p50));
                for (let m = 1; m < fanBands.length; m++) ctx.lineTo(xAt(m), yAt(fanBands[m].p50));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 單條命 line（紅色，粗）
            if (life) {
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(xAt(0), yAt(life.timeline[0].assets));
                for (let m = 1; m < life.timeline.length; m++) {
                    ctx.lineTo(xAt(m), yAt(life.timeline[m].assets));
                }
                ctx.stroke();

                // 破產標記
                if (life.ruinMonth !== null) {
                    const rx = xAt(life.ruinMonth);
                    ctx.fillStyle = '#7c2d12';
                    ctx.beginPath();
                    ctx.arc(rx, yAt(0) - 3, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#7c2d12';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText('💀 破產', rx, yAt(0) - 8);
                }
            }

            // X 軸（年齡）
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = 7;
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((months - 1) * i / (xTicks - 1));
                const age = cfg.age + idx / 12;
                ctx.fillText(age.toFixed(0) + '歲', xAt(idx), padT + chartH + 5);
            }
        }
    }

    class HistogramChart {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth || canvas.width;
            const h = canvas.clientHeight || canvas.height;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            this.ctx.scale(dpr, dpr);
            this.w = w;
            this.h = h;
        }
        render(endAssets, cfg) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            if (!endAssets || endAssets.length === 0) return;
            const padL = 68, padR = 12, padT = 15, padB = 34;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            const sorted = [...endAssets].sort((a, b) => a - b);
            const min = 0;
            const max = Math.max(sorted[sorted.length - 1] * 1.05, cfg.initialAssets * 2);
            const bins = 25;
            const binW = (max - min) / bins;
            const counts = new Array(bins).fill(0);
            for (const v of sorted) {
                const b = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / binW)));
                counts[b]++;
            }
            const maxCount = Math.max(1, ...counts);
            const xAt = i => padL + i / bins * chartW;
            const yAt = v => padT + chartH - v / maxCount * chartH;
            const ruinThreshold = cfg.initialAssets * 0.5;

            // 網格
            ctx.strokeStyle = '#e5e7eb';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 4; i++) {
                const v = maxCount * i / 4;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
                ctx.fillText(Math.round(v), padL - 4, y);
            }

            // Bars
            const gap = 1;
            const bw = Math.max(1, chartW / bins - gap);
            for (let i = 0; i < bins; i++) {
                const c = counts[i];
                if (c === 0) continue;
                const x = xAt(i);
                const y = yAt(c);
                const barH = padT + chartH - y;
                const binMid = min + (i + 0.5) * binW;
                ctx.fillStyle = binMid < ruinThreshold ? '#dc2626' : '#2563eb';
                ctx.fillRect(x, y, bw, barH);
            }

            // X labels
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i <= 5; i++) {
                const v = min + (max - min) * i / 5;
                const x = padL + i / 5 * chartW;
                ctx.fillText(fmtMoney(v), x, padT + chartH + 5);
            }
        }
    }

    // ---------- UI state ----------
    let timelineChart = null;
    let histChart = null;
    let currentLife = null;
    let currentFanBands = null;
    let currentSeed = 20250704;
    let monteResults = null;

    function readCfg() {
        return {
            age: Math.max(18, Math.min(80, parseInt($('cfg-age').value) || 25)),
            retireAge: Math.max(30, Math.min(90, parseInt($('cfg-retire-age').value) || 65)),
            initialAssets: Math.max(0, parseFloat($('cfg-initial').value) || 500000),
            monthlySave: Math.max(0, parseFloat($('cfg-monthly-save').value) || 30000),
            saveGrowth: Math.max(0, parseFloat($('cfg-save-growth').value) || 2),
            monthlyWithdraw: Math.max(0, parseFloat($('cfg-monthly-withdraw').value) || 60000),
            strategy: $('cfg-strategy').value || 'dca',
            glide: $('cfg-glide').value || 'off',
        };
    }

    function updateStatsSingle(cfg, life) {
        $('stat-retire-assets').textContent = fmtMoney(life.timeline[life.retireMonth]?.assets || 0);
        const endAssets = life.timeline[life.timeline.length - 1].assets;
        $('stat-end-assets').textContent = fmtMoney(endAssets);
        $('stat-crashes').textContent = (life.events?.length || 0) + ' 次';
    }

    function updateStatsMonte(cfg) {
        if (!monteResults) return;
        const retireIdx = (cfg.retireAge - cfg.age) * 12;
        const retireAssets = monteResults.map(r => r.timeline[retireIdx]?.assets || 0).sort((a, b) => a - b);
        const p20 = retireAssets[Math.floor(retireAssets.length * 0.20)];
        const p50 = retireAssets[Math.floor(retireAssets.length * 0.50)];
        $('stat-median').textContent = fmtMoney(p50);
        $('stat-p20').textContent = fmtMoney(p20);
        const ruinCount = monteResults.filter(r => r.ruinMonth !== null).length;
        $('stat-ruin').textContent = pct(ruinCount / monteResults.length, 0);
    }

    function pushEventLog(cfg, life) {
        const log = $('log');
        log.innerHTML = '';
        if (!life.events || life.events.length === 0) {
            log.innerHTML = '<div class="entry muted">這條命沒遇到任何崩盤——你超級幸運（機率不到 5%）</div>';
            return;
        }
        // 老 → 新
        for (const e of life.events) {
            const age = cfg.age + e.month / 12;
            const cls = e.category === 'major' ? 'crash-major' : e.category === 'bear' ? 'crash-bear' : '';
            const entry = document.createElement('div');
            entry.className = 'entry';
            entry.innerHTML = `<span class="age">${age.toFixed(1)}歲</span> · <span class="event ${cls}">📢 ${e.label} (${pct(e.magnitude, 0)})</span>`;
            log.appendChild(entry);
        }
        if (life.ruinMonth !== null) {
            const age = cfg.age + life.ruinMonth / 12;
            const entry = document.createElement('div');
            entry.className = 'entry';
            entry.innerHTML = `<span class="age">${age.toFixed(1)}歲</span> · <span class="event crash-major">💀 資產歸零</span>`;
            log.appendChild(entry);
        }
    }

    function pushInsights(cfg) {
        if (!monteResults) return;
        const n = monteResults.length;
        const insights = [];

        const ruinCount = monteResults.filter(r => r.ruinMonth !== null).length;
        const ruinPct = ruinCount / n;
        if (ruinPct === 0) {
            insights.push(`✅ <b>100 條命全撐到 90 歲</b>——你的計畫夠 robust。`);
        } else {
            const ruinAges = monteResults.filter(r => r.ruinMonth !== null).map(r => cfg.age + r.ruinMonth / 12);
            insights.push(`🚨 <b>${ruinCount}/${n} 條命</b>會破產，平均在 <b>${mean(ruinAges).toFixed(0)} 歲</b>——這是你要擔心的尾端風險。`);
        }

        // 退休金分位
        const retireIdx = (cfg.retireAge - cfg.age) * 12;
        const retireAssets = monteResults.map(r => r.timeline[retireIdx]?.assets || 0).sort((a, b) => a - b);
        const p20 = retireAssets[Math.floor(n * 0.20)];
        const p50 = retireAssets[Math.floor(n * 0.50)];
        const p80 = retireAssets[Math.floor(n * 0.80)];
        insights.push(`💰 退休時 (${cfg.retireAge} 歲) 中位數 <b>${fmtMoney(p50)}</b>。運氣差 20% 只有 <b>${fmtMoney(p20)}</b>，運氣好 20% 有 <b>${fmtMoney(p80)}</b>——落差 <b>${((p80 / Math.max(1, p20) - 1) * 100).toFixed(0)}%</b>。<br>這就是 sequence-of-returns risk——同一個策略，運氣差別靠早年遇到崩盤 vs 晚年遇到崩盤。`);

        // 「多存 20%」sensitivity（跑 100 次比較）
        const cfg2 = { ...cfg, monthlySave: cfg.monthlySave * 1.2 };
        const results2 = runMonteCarlo(cfg2, n, currentSeed);
        const ruin2 = results2.filter(r => r.ruinMonth !== null).length / n;
        const delta = cfg.monthlySave * 0.2;
        insights.push(`📊 <b>若每月多存 ${fmtMoney(delta)}</b>（+20%），破產機率從 <b>${pct(ruinPct, 0)}</b> 變 <b>${pct(ruin2, 0)}</b>。<br>${ruin2 < ruinPct ? '這筆錢值得——早年儲蓄的複利效應遠大於後期加碼。' : '效果有限——你的破產風險主要來自策略太保守或提領太多。'}`);

        // 「延後退休 3 年」sensitivity
        const cfg3 = { ...cfg, retireAge: Math.min(90, cfg.retireAge + 3) };
        const results3 = runMonteCarlo(cfg3, n, currentSeed);
        const ruin3 = results3.filter(r => r.ruinMonth !== null).length / n;
        insights.push(`⏰ <b>若延後退休 3 年</b>（改為 ${cfg3.retireAge} 歲），破產機率從 <b>${pct(ruinPct, 0)}</b> 變 <b>${pct(ruin3, 0)}</b>。<br>${(ruinPct - ruin3) > 0.05 ? '延後退休比多存錢更有效——3 年少領 + 3 年多存的複合效應。' : '延後退休對你這組參數影響不大。'}`);

        $('insights').innerHTML = insights.map(i => `<div class="insight-item">${i}</div>`).join('');
    }

    function runOnce() {
        const cfg = readCfg();
        if (cfg.retireAge <= cfg.age) {
            alert('退休年齡必須大於目前年齡'); return;
        }
        const life = simulateOneLife(cfg, currentSeed);
        currentLife = life;
        updateStatsSingle(cfg, life);
        pushEventLog(cfg, life);
        timelineChart.render({ life, fanBands: currentFanBands, cfg });
    }

    function runRandom() {
        currentSeed = Math.floor(Math.random() * 2147483647);
        runOnce();
    }

    function runMonte() {
        const cfg = readCfg();
        if (cfg.retireAge <= cfg.age) {
            alert('退休年齡必須大於目前年齡'); return;
        }
        const btn = $('btn-run-monte');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ 跑中...';
        // yield to UI
        setTimeout(() => {
            const n = 100;
            monteResults = runMonteCarlo(cfg, n, currentSeed);
            currentFanBands = computeFanChart(monteResults);
            // 挑中位數那條命當「代表」
            const retireIdx = (cfg.retireAge - cfg.age) * 12;
            const indexed = monteResults.map((r, i) => ({ i, v: r.timeline[retireIdx]?.assets || 0 }));
            indexed.sort((a, b) => a.v - b.v);
            const medianIdx = indexed[Math.floor(n / 2)].i;
            currentLife = monteResults[medianIdx];
            updateStatsSingle(cfg, currentLife);
            pushEventLog(cfg, currentLife);
            updateStatsMonte(cfg);
            histChart.render(monteResults.map(r => r.timeline[r.timeline.length - 1].assets), cfg);
            pushInsights(cfg);
            $('hist-panel').hidden = false;
            $('insight-panel').hidden = false;
            timelineChart.render({ life: currentLife, fanBands: currentFanBands, cfg });
            btn.disabled = false;
            btn.textContent = orig;
        }, 50);
    }

    function reset() {
        currentSeed = 20250704;
        currentLife = null;
        currentFanBands = null;
        monteResults = null;
        for (const id of ['stat-retire-assets', 'stat-end-assets', 'stat-crashes', 'stat-median', 'stat-ruin', 'stat-p20']) {
            $(id).textContent = '—';
        }
        $('log').innerHTML = '';
        $('insights').innerHTML = '';
        $('hist-panel').hidden = true;
        $('insight-panel').hidden = true;
        const cfg = readCfg();
        timelineChart.render({ life: null, fanBands: null, cfg });
    }

    function bootstrap() {
        timelineChart = new TimelineChart($('chart-timeline'));
        histChart = new HistogramChart($('chart-histogram'));
        $('btn-run-once').addEventListener('click', runOnce);
        $('btn-run-random').addEventListener('click', runRandom);
        $('btn-run-monte').addEventListener('click', runMonte);
        $('btn-reset').addEventListener('click', reset);
        reset();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
