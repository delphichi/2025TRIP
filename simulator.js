(function () {
    'use strict';

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const pct = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
    const $ = id => document.getElementById(id);

    // Beasley-Springer 標準常態反 CDF 逼近，用於 newsvendor 的 z-score
    function normalInvCdf(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p < 0.5) return -normalInvCdf(1 - p);
        const t = Math.sqrt(-2 * Math.log(1 - p));
        const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
        const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
        return t - (c0 + c1 * t + c2 * t * t) /
                   (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    }

    // 教科書均衡：階梯式供需曲線交叉
    // Supply(p) = Σ capacity  s.t. cost <= p
    // Demand(p) = Σ dailyNeed s.t. maxWtp >= p
    // 傳回 supply 首次 >= demand 的最小價格
    function computeEquilibrium(consumers, producers) {
        const totalDemand = consumers.reduce((s, c) => s + c.dailyNeed, 0);
        const totalSupply = producers.reduce((s, p) => s + p.capacity, 0);
        const prices = [...new Set([
            ...producers.map(p => p.cost),
            ...consumers.map(c => c.maxWtp),
        ])].sort((a, b) => a - b);
        for (const p of prices) {
            const supply = producers.reduce((s, pr) =>
                s + (pr.cost <= p ? pr.capacity : 0), 0);
            const demand = consumers.reduce((s, c) =>
                s + (c.maxWtp >= p ? c.dailyNeed : 0), 0);
            if (supply >= demand && demand > 0) {
                return { price: p, quantity: demand, totalSupply, totalDemand };
            }
        }
        return { price: prices[prices.length - 1] ?? 0, quantity: 0, totalSupply, totalDemand };
    }

    // ---------- agents ----------
    class Consumer {
        constructor(id, baseWtp) {
            this.id = id;
            this.energy = randInt(40, 90);
            this.expected = baseWtp * rand(0.75, 1.2);
            this.confidence = rand(0.85, 1.15);
            this.maxWtp = this.expected * rand(1.2, 1.9);
            this.dailyNeed = randInt(1, 3);
            this.budget = rand(60, 180);
            this.bought = 0;
            this.spent = 0;
            this.surplus = 0;
        }

        // agent 決策 —— 資訊不完全，只看見自己內部狀態 + 這一家報價
        // trace: 可選 array，會 push {tag, msg} 讓 UI 攤開
        decide(price, producerId, trace) {
            const log = (tag, msg) => { if (trace) trace.push({ tag, msg }); };

            if (price > this.budget) {
                log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：預算 ${fmt(this.budget,1)} 不夠`);
                return false;
            }
            if (price > this.maxWtp) {
                log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：> 最高願付 ${fmt(this.maxWtp,1)}`);
                return false;
            }
            if (this.bought >= this.dailyNeed && this.energy > 60) {
                log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：已飽（${this.bought}/${this.dailyNeed}，體力 ${this.energy}）`);
                return false;
            }

            let cap = this.expected * this.confidence;
            let hungerLabel = '正常';
            if (this.energy < 25) {
                cap = Math.min(this.maxWtp, cap * 1.4);
                hungerLabel = '很餓 ×1.4';
            } else if (this.energy < 45) {
                cap = Math.min(this.maxWtp, cap * 1.15);
                hungerLabel = '餓 ×1.15';
            } else if (this.energy > 80 && this.bought > 0) {
                cap *= 0.85;
                hungerLabel = '飽 ×0.85';
            }

            const noise = 1 + (Math.random() - 0.5) * 0.1;
            const threshold = cap * noise;
            const detail = `錨 ${fmt(this.expected,1)}×信心 ${fmt(this.confidence,2)}=${fmt(cap,2)}（${hungerLabel}）→ 閾值 ${fmt(threshold,2)}`;

            if (price <= threshold) {
                log('buy', `Bakery ${producerId+1} @ ${fmt(price)}：${detail}，判定買`);
                return true;
            }
            log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：${detail}，判定過貴`);
            return false;
        }

        buy(price) {
            this.budget -= price;
            this.energy = clamp(this.energy + 25, 0, 100);
            this.bought += 1;
            this.spent += price;
            this.surplus += (this.maxWtp - price);
        }

        endDay(dayAvgPrice) {
            if (dayAvgPrice > 0) {
                this.expected = 0.7 * this.expected + 0.3 * dayAvgPrice;
            }
            this.energy = clamp(this.energy - randInt(25, 45), 0, 100);
            this.budget += rand(10, 25);
            this.bought = 0;
        }
    }

    class Producer {
        constructor(id, costMin, costMax, capMin, capMax) {
            this.id = id;
            this.cost = rand(costMin, costMax);
            this.capacity = randInt(capMin, capMax);
            this.price = this.cost * rand(1.6, 2.2);
            this.inventory = 0;
            this.soldToday = 0;
            this.wastedToday = 0;
            this.totalSurplus = 0;
            this.history = [];
            this.recentSales = [];   // 用來估 μ/σ 供 newsvendor 計算
        }

        bake() {
            this.inventory = this.capacity;
            this.soldToday = 0;
        }

        offer() { return this.inventory > 0 ? this.price : null; }

        sell() {
            if (this.inventory <= 0) return null;
            this.inventory -= 1;
            this.soldToday += 1;
            this.totalSurplus += (this.price - this.cost);
            return this.price;
        }

        // Newsvendor 最優：Q* = μ + σ · Φ⁻¹((p-c)/p)，假設 s=0（隔夜作廢）
        // 需要至少 3 天銷售紀錄；否則回傳 null
        newsvendorQ() {
            const n = this.recentSales.length;
            if (n < 3) return null;
            const mu = this.recentSales.reduce((s, x) => s + x, 0) / n;
            const variance = this.recentSales.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, n - 1);
            const sigma = Math.sqrt(variance);
            const fractile = (this.price - this.cost) / this.price;
            if (fractile <= 0) return 0;
            const z = normalInvCdf(clamp(fractile, 0.001, 0.999));
            return Math.max(0, mu + sigma * z);
        }

        endDay(day, trace) {
            const log = (tag, msg) => { if (trace) trace.push({ tag, msg }); };
            this.wastedToday = this.inventory;
            const soldRatio = this.soldToday / this.capacity;

            this.history.push({
                day, price: this.price,
                sold: this.soldToday, wasted: this.wastedToday,
            });
            this.recentSales.push(this.soldToday);
            if (this.recentSales.length > 10) this.recentSales.shift();

            let adjust, tag, reason;
            if (soldRatio >= 0.98) {
                adjust = rand(1.06, 1.12); tag = 'raise';
                reason = `賣光（${this.soldToday}/${this.capacity}），大幅抬 +${fmt((adjust - 1) * 100, 1)}%`;
            } else if (soldRatio >= 0.85) {
                adjust = rand(1.02, 1.06); tag = 'raise';
                reason = `售罄率 ${fmt(soldRatio * 100, 0)}%，小幅抬 +${fmt((adjust - 1) * 100, 1)}%`;
            } else if (soldRatio >= 0.55) {
                adjust = rand(0.99, 1.02); tag = 'flat';
                reason = `售罄率 ${fmt(soldRatio * 100, 0)}%，微調 ${fmt((adjust - 1) * 100, 1)}%`;
            } else if (soldRatio >= 0.25) {
                adjust = rand(0.93, 0.98); tag = 'drop';
                reason = `剩不少（${fmt(soldRatio * 100, 0)}%），降 ${fmt((adjust - 1) * 100, 1)}%`;
            } else {
                adjust = rand(0.85, 0.92); tag = 'drop';
                reason = `大量作廢（${fmt(soldRatio * 100, 0)}%），大幅降 ${fmt((adjust - 1) * 100, 1)}%`;
            }

            const oldPrice = this.price;
            this.price *= adjust;
            const floor = this.cost * 1.05;
            let floorNote = '';
            if (this.price < floor) {
                this.price = floor;
                floorNote = `（觸底：cost×1.05=${fmt(floor)}）`;
            }
            this.price = Math.min(this.price, this.cost * 6);

            log('done', `昨日：賣 ${this.soldToday}，剩 ${this.wastedToday}（產能 ${this.capacity}）`);
            log(tag, reason);
            log(floorNote ? 'floor' : 'flat', `價格 ${fmt(oldPrice)} → ${fmt(this.price)} ${floorNote}`);

            const nvQ = this.newsvendorQ();
            if (nvQ !== null) {
                const diff = this.capacity - nvQ;
                const kind = diff > 0.5 ? '過剩' : diff < -0.5 ? '不足' : '接近';
                log('flat', `Newsvendor Q*≈${fmt(nvQ, 1)}（產能 ${this.capacity}，${kind} ${fmt(Math.abs(diff), 1)}）`);
            }

            this.inventory = 0;
        }
    }

    // ---------- market ----------
    class Market {
        constructor(cfg) {
            this.cfg = cfg;
            this.day = 0;
            this.consumers = Array.from({ length: cfg.consumers },
                (_, i) => new Consumer(i, cfg.baseWtp));
            this.producers = Array.from({ length: cfg.producers },
                (_, i) => new Producer(i, cfg.costMin, cfg.costMax, cfg.capMin, cfg.capMax));
            this.dailyStats = [];
            const eq = computeEquilibrium(this.consumers, this.producers);
            this.eqPrice = eq.price;
            this.eqQuantity = eq.quantity;
            this.totalSupply = eq.totalSupply;
            this.totalDemand = eq.totalDemand;
            this.lastTrace = null;
        }

        stepOneDay() {
            this.day += 1;
            this.producers.forEach(p => p.bake());
            this.consumers.forEach(c => { c.bought = 0; });

            // 抽今日 trace 對象
            const tracedC = randInt(0, this.consumers.length - 1);
            const tracedP = randInt(0, this.producers.length - 1);
            const consumerTrace = [];
            const producerTrace = [];
            const cSnap = { ...(({ energy, expected, confidence, maxWtp, budget, dailyNeed }) =>
                ({ energy, expected, confidence, maxWtp, budget, dailyNeed }))(this.consumers[tracedC]) };

            const trades = [];
            const shopOrder = shuffle(this.consumers.slice());
            const maxVisits = Math.max(3, Math.min(this.cfg.producers, 6));

            for (let round = 0; round < maxVisits; round++) {
                for (const c of shopOrder) {
                    if (c.energy > 85 && c.bought >= c.dailyNeed) continue;
                    const open = this.producers.filter(p => p.inventory > 0);
                    if (open.length === 0) break;
                    const p = open[randInt(0, open.length - 1)];
                    const price = p.offer();
                    if (price === null) continue;
                    const trace = (c.id === tracedC) ? consumerTrace : null;
                    if (c.decide(price, p.id, trace)) {
                        p.sell();
                        c.buy(price);
                        trades.push({ price, cid: c.id, pid: p.id });
                    }
                }
            }

            const volume = trades.length;
            const avgPrice = volume > 0 ? trades.reduce((s, t) => s + t.price, 0) / volume : 0;
            const waste = this.producers.reduce((s, p) => s + p.inventory, 0);
            const ps = trades.reduce((s, t) => s + (t.price - this.producers[t.pid].cost), 0);
            const cs = trades.reduce((s, t) => s + (this.consumers[t.cid].maxWtp - t.price), 0);

            const pSnap = {
                cost: this.producers[tracedP].cost,
                priceBefore: this.producers[tracedP].price,
                capacity: this.producers[tracedP].capacity,
                soldToday: this.producers[tracedP].soldToday,
                wastedToday: this.producers[tracedP].inventory,
            };
            this.producers.forEach(p => {
                p.endDay(this.day, p.id === tracedP ? producerTrace : null);
            });
            this.consumers.forEach(c => c.endDay(avgPrice));

            // 全市場的 newsvendor 過剩率
            let nvOptimal = 0, nvHave = 0;
            for (const p of this.producers) {
                const q = p.newsvendorQ();
                if (q !== null) { nvOptimal += q; nvHave += p.capacity; }
            }
            const nvOverProd = nvHave > 0 ? (nvHave - nvOptimal) / nvHave : null;

            const prices = this.producers.map(p => p.price);
            const rec = {
                day: this.day,
                avgPrice, volume, waste, cs, ps,
                welfare: cs + ps,
                minPrice: Math.min(...prices),
                maxPrice: Math.max(...prices),
                deviation: volume > 0 ? (avgPrice - this.eqPrice) / this.eqPrice : null,
                nvOverProd,
                tracedConsumer: {
                    id: tracedC, snapshot: cSnap,
                    log: consumerTrace,
                    finalBought: this.consumers[tracedC].bought,
                    finalDailyNeed: cSnap.dailyNeed,
                },
                tracedProducer: {
                    id: tracedP, snapshot: pSnap,
                    log: producerTrace,
                    priceAfter: this.producers[tracedP].price,
                },
            };
            this.dailyStats.push(rec);
            this.lastTrace = rec;
            return rec;
        }
    }

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---------- chart ----------
    class Chart {
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

        render(stats, eqPrice) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            if (stats.length === 0) {
                ctx.fillStyle = '#aaa';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('按「開始」跑起來，這裡會出現價格走勢圖', w / 2, h / 2);
                return;
            }

            const padL = 44, padR = 12, padT = 14, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            let ymax = Math.max(eqPrice, ...stats.map(s => s.maxPrice));
            let ymin = Math.min(eqPrice, ...stats.map(s => Math.min(s.minPrice, s.avgPrice || Infinity)));
            if (!Number.isFinite(ymin)) ymin = 0;
            ymin = Math.max(0, ymin - 1);
            ymax = ymax + 1;
            const yr = ymax - ymin || 1;
            const vmax = Math.max(1, ...stats.map(s => s.volume));

            const xAt = i => padL + (stats.length === 1 ? chartW / 2 : (i / (stats.length - 1)) * chartW);
            const yAt = v => padT + chartH - ((v - ymin) / yr) * chartH;

            ctx.fillStyle = 'rgba(56,118,29,.10)';
            ctx.fillRect(padL, yAt(eqPrice * 1.1), chartW, yAt(eqPrice * 0.9) - yAt(eqPrice * 1.1));
            ctx.strokeStyle = 'rgba(56,118,29,.7)';
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(padL, yAt(eqPrice));
            ctx.lineTo(padL + chartW, yAt(eqPrice));
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = '#eee';
            ctx.fillStyle = '#888';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const yTicks = 5;
            for (let i = 0; i <= yTicks; i++) {
                const v = ymin + (yr * i) / yTicks;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + chartW, y);
                ctx.stroke();
                ctx.fillText(v.toFixed(1), padL - 4, y);
            }

            ctx.fillStyle = 'rgba(230,126,34,.55)';
            const barW = Math.max(2, chartW / stats.length * 0.7);
            stats.forEach((s, i) => {
                const x = xAt(i) - barW / 2;
                const bh = (s.volume / vmax) * (chartH * 0.35);
                ctx.fillRect(x, padT + chartH - bh, barW, bh);
            });

            const drawLine = (accessor, color, wid = 2) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = wid;
                ctx.beginPath();
                let started = false;
                stats.forEach((s, i) => {
                    const v = accessor(s);
                    if (!Number.isFinite(v)) return;
                    const x = xAt(i), y = yAt(v);
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
            };
            drawLine(s => s.maxPrice, '#c0392b', 1.5);
            drawLine(s => s.minPrice, '#2874a6', 1.5);
            drawLine(s => s.avgPrice || null, '#38761D', 2.5);

            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(stats.length, 8);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((stats.length - 1) * i / (xTicks - 1 || 1));
                ctx.fillText('Day ' + stats[idx].day, xAt(idx), padT + chartH + 4);
            }

            ctx.fillStyle = 'rgba(56,118,29,.8)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '11px sans-serif';
            ctx.fillText('教科書均衡 ' + fmt(eqPrice), padL + 4, yAt(eqPrice) - 8);
        }
    }

    // ---------- UI wiring ----------
    let market = null;
    let timer = null;
    let chart = null;

    function readCfg() {
        const consumers = clamp(parseInt($('cfg-consumers').value) || 30, 1, 500);
        const producers = clamp(parseInt($('cfg-producers').value) || 5, 1, 50);
        let costMin = parseFloat($('cfg-cost-min').value) || 4;
        let costMax = parseFloat($('cfg-cost-max').value) || 8;
        if (costMax < costMin) [costMin, costMax] = [costMax, costMin];
        let capMin = parseInt($('cfg-cap-min').value) || 8;
        let capMax = parseInt($('cfg-cap-max').value) || 20;
        if (capMax < capMin) [capMin, capMax] = [capMax, capMin];
        const baseWtp = parseFloat($('cfg-wtp').value) || 14;
        const speed = clamp(parseInt($('cfg-speed').value) || 450, 30, 3000);
        return { consumers, producers, costMin, costMax, capMin, capMax, baseWtp, speed };
    }

    function updateStatsUI(rec, market) {
        $('stat-day').textContent = rec.day;
        $('stat-price').textContent = rec.volume > 0 ? fmt(rec.avgPrice) : '無成交';
        $('stat-volume').textContent = rec.volume;
        $('stat-waste').textContent = rec.waste;
        $('stat-cs').textContent = fmt(rec.cs, 1);
        $('stat-ps').textContent = fmt(rec.ps, 1);
        $('stat-welfare').textContent = fmt(rec.welfare, 1);
        $('stat-eq').textContent = fmt(market.eqPrice);
        const dev = $('stat-dev');
        if (rec.deviation === null) {
            dev.textContent = '無成交'; dev.style.color = '';
        } else {
            const sign = rec.deviation >= 0 ? '+' : '';
            dev.textContent = sign + pct(rec.deviation);
            dev.style.color = Math.abs(rec.deviation) < 0.1 ? 'var(--primary-dark)'
                : rec.deviation > 0 ? 'var(--max)' : 'var(--min)';
        }
        const nv = $('stat-nv');
        if (rec.nvOverProd === null) {
            nv.textContent = '收集資料中';
        } else {
            const sign = rec.nvOverProd >= 0 ? '+' : '';
            nv.textContent = sign + pct(rec.nvOverProd);
        }
    }

    function renderProducers(market) {
        const grid = $('producers-grid');
        grid.innerHTML = '';
        market.producers.forEach((p, i) => {
            const last = p.history[p.history.length - 1];
            const soldOut = last && last.sold >= p.capacity;
            const wasted = last && last.wasted > p.capacity * 0.5;
            const nvQ = p.newsvendorQ();
            const div = document.createElement('div');
            div.className = 'producer-card' + (soldOut ? ' sold-out' : '') + (wasted ? ' waste' : '');
            div.innerHTML = `
                <div class="name">🏪 Bakery ${i + 1}</div>
                <div class="row"><span>報價</span><span class="v">${fmt(p.price)}</span></div>
                <div class="row"><span>成本</span><span class="v">${fmt(p.cost)}</span></div>
                <div class="row"><span>產能</span><span class="v">${p.capacity}</span></div>
                <div class="row"><span>昨賣 / 剩</span><span class="v">${last ? last.sold + ' / ' + last.wasted : '—'}</span></div>
                <div class="row"><span>Newsvendor Q*</span><span class="v">${nvQ === null ? '—' : fmt(nvQ, 1)}</span></div>
            `;
            grid.appendChild(div);
        });
    }

    function pushLog(rec, market) {
        const log = $('log');
        const prev = market.dailyStats[market.dailyStats.length - 2];
        let trend = '', trendClass = 'flat';
        if (prev && rec.volume > 0 && prev.volume > 0) {
            const d = rec.avgPrice - prev.avgPrice;
            if (d > 0.15) { trend = '↑ ' + fmt(d); trendClass = 'up'; }
            else if (d < -0.15) { trend = '↓ ' + fmt(-d); trendClass = 'down'; }
            else { trend = '→ 持平'; }
        }
        const entry = document.createElement('div');
        entry.className = 'entry';
        const devStr = rec.deviation === null ? '' :
            ` · 距均衡 ${rec.deviation >= 0 ? '+' : ''}${pct(rec.deviation, 0)}`;
        entry.innerHTML = `<span class="day">Day ${rec.day}</span> · 均價 <b>${rec.volume > 0 ? fmt(rec.avgPrice) : '無'}</b> · 量 ${rec.volume} · 廢 ${rec.waste}${devStr} · <span class="${trendClass}">${trend}</span>`;
        log.prepend(entry);
        while (log.children.length > 40) log.removeChild(log.lastChild);
    }

    function renderTrace(rec) {
        const c = rec.tracedConsumer;
        const p = rec.tracedProducer;
        $('trace-c-title').textContent = `#${c.id + 1}`;
        $('trace-c-meta').textContent =
            `初始 → 體力 ${c.snapshot.energy} · 預算 ${fmt(c.snapshot.budget, 1)} · ` +
            `心理錨 ${fmt(c.snapshot.expected, 1)} · 信心 ${fmt(c.snapshot.confidence, 2)} · ` +
            `最高願付 ${fmt(c.snapshot.maxWtp, 1)} · 每日需 ${c.snapshot.dailyNeed}`;
        renderTraceLog('trace-c-log', c.log,
            `今日走訪 ${c.log.length} 家，成交 ${c.finalBought}/${c.finalDailyNeed}`);

        $('trace-p-title').textContent = `Bakery ${p.id + 1}`;
        $('trace-p-meta').textContent =
            `昨日 → 成本 ${fmt(p.snapshot.cost)} · 產能 ${p.snapshot.capacity} · ` +
            `售出 ${p.snapshot.soldToday} · 剩 ${p.snapshot.wastedToday} · 昨價 ${fmt(p.snapshot.priceBefore)}`;
        renderTraceLog('trace-p-log', p.log, `新價 ${fmt(p.priceAfter)}`);
    }

    function renderTraceLog(elId, entries, footer) {
        const el = $(elId);
        el.innerHTML = '';
        if (entries.length === 0) {
            el.innerHTML = '<div class="t-row"><span class="t-msg" style="color:#aaa">（今日無決策事件）</span></div>';
        } else {
            for (const e of entries) {
                const row = document.createElement('div');
                row.className = 't-row';
                row.innerHTML = `<span class="t-tag ${e.tag}">${tagLabel(e.tag)}</span><span class="t-msg">${e.msg}</span>`;
                el.appendChild(row);
            }
        }
        if (footer) {
            const f = document.createElement('div');
            f.className = 't-row';
            f.innerHTML = `<span class="t-tag done">結算</span><span class="t-msg">${footer}</span>`;
            el.appendChild(f);
        }
    }

    function tagLabel(tag) {
        switch (tag) {
            case 'buy': return '買';
            case 'skip': return '略';
            case 'raise': return '抬';
            case 'drop': return '降';
            case 'flat': return '平';
            case 'floor': return '底';
            case 'done': return '·';
            default: return tag;
        }
    }

    function tickOnce() {
        if (!market) return;
        const rec = market.stepOneDay();
        updateStatsUI(rec, market);
        renderProducers(market);
        pushLog(rec, market);
        renderTrace(rec);
        chart.render(market.dailyStats, market.eqPrice);
    }

    function start() {
        if (!market) initMarket();
        if (timer) return;
        $('btn-run').disabled = true;
        $('btn-pause').disabled = false;
        $('btn-step').disabled = true;
        const speed = readCfg().speed;
        timer = setInterval(tickOnce, speed);
    }

    function pause() {
        if (timer) { clearInterval(timer); timer = null; }
        $('btn-run').disabled = false;
        $('btn-pause').disabled = true;
        $('btn-step').disabled = false;
    }

    function initMarket() {
        const cfg = readCfg();
        market = new Market(cfg);
        chart = new Chart($('chart'));
        chart.render([], market.eqPrice);
        renderProducers(market);
        $('log').innerHTML = '';
        $('stat-day').textContent = '0';
        ['stat-price', 'stat-volume', 'stat-waste', 'stat-cs',
         'stat-ps', 'stat-welfare', 'stat-dev', 'stat-nv']
            .forEach(id => { $(id).textContent = '—'; $(id).style.color = ''; });
        $('stat-eq').textContent = fmt(market.eqPrice);
        $('trace-c-title').textContent = '—';
        $('trace-p-title').textContent = '—';
        $('trace-c-meta').textContent = `Day 0，共 ${cfg.consumers} 位消費者，等待抽樣`;
        $('trace-p-meta').textContent = `Day 0，共 ${cfg.producers} 家生產者，等待抽樣`;
        $('trace-c-log').innerHTML = '';
        $('trace-p-log').innerHTML = '';
    }

    function reset() { pause(); initMarket(); }

    document.addEventListener('DOMContentLoaded', () => {
        initMarket();
        $('btn-run').addEventListener('click', start);
        $('btn-pause').addEventListener('click', pause);
        $('btn-step').addEventListener('click', () => { if (!market) initMarket(); tickOnce(); });
        $('btn-reset').addEventListener('click', reset);
        $('cfg-speed').addEventListener('change', () => {
            if (timer) { pause(); start(); }
        });
    });
})();
