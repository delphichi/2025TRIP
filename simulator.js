(function () {
    'use strict';

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const $ = id => document.getElementById(id);

    // ---------- agents ----------
    // Consumer: 有限理性，資訊不完全 —— 心理價位、消費信心、體力需求、預算，
    // 只看到「當下這一家」的報價，看不到全場即時價格；隨經驗慢慢調整心理錨。
    class Consumer {
        constructor(id, baseWtp) {
            this.id = id;
            this.energy = randInt(40, 90);            // 0-100，越低越餓
            this.expected = baseWtp * rand(0.75, 1.2);
            this.confidence = rand(0.85, 1.15);       // 對心理價位的信心
            this.maxWtp = this.expected * rand(1.2, 1.9);
            this.dailyNeed = randInt(1, 3);           // 每天想吃幾個
            this.budget = rand(60, 180);
            this.bought = 0;
            this.spent = 0;
            this.surplus = 0;
        }

        // 進一家店，看到報價，決定買不買
        // agent 決策：資訊不完全 —— 只知道自己的期待、體力、預算
        decide(price) {
            if (price > this.budget) return false;
            if (price > this.maxWtp) return false;
            if (this.bought >= this.dailyNeed && this.energy > 60) return false;

            let cap = this.expected * this.confidence;
            if (this.energy < 25) cap = Math.min(this.maxWtp, cap * 1.4);       // 很餓，願意多付
            else if (this.energy < 45) cap = Math.min(this.maxWtp, cap * 1.15);
            else if (this.energy > 80 && this.bought > 0) cap *= 0.85;          // 已經飽了，會殺價

            const noise = 1 + (Math.random() - 0.5) * 0.1;
            return price <= cap * noise;
        }

        buy(price) {
            this.budget -= price;
            this.energy = clamp(this.energy + 25, 0, 100);
            this.bought += 1;
            this.spent += price;
            this.surplus += (this.maxWtp - price);
        }

        endDay(dayAvgPrice) {
            // 慢慢更新心理錨（觀察到市場均價）
            if (dayAvgPrice > 0) {
                this.expected = 0.7 * this.expected + 0.3 * dayAvgPrice;
            }
            // 每天消耗體力，肚子又餓了
            this.energy = clamp(this.energy - randInt(25, 45), 0, 100);
            // 每天補一點預算（薪水）
            this.budget += rand(10, 25);
            this.bought = 0;
        }
    }

    // Producer: 有限理性，成本錨定
    // 決策：昨天賣得好 → 抬價；昨天堆積 → 降價；成本是硬底線
    class Producer {
        constructor(id, costMin, costMax, capMin, capMax) {
            this.id = id;
            this.cost = rand(costMin, costMax);
            this.capacity = randInt(capMin, capMax);
            this.price = this.cost * rand(1.6, 2.2);   // 初始加價
            this.inventory = 0;
            this.soldToday = 0;
            this.wastedToday = 0;
            this.totalSurplus = 0;
            this.history = [];                          // { day, price, sold, wasted }
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

        endDay(day) {
            this.wastedToday = this.inventory;
            this.history.push({
                day, price: this.price,
                sold: this.soldToday, wasted: this.wastedToday
            });

            // agent 決策：根據昨天調整明天的報價
            const soldRatio = this.soldToday / this.capacity;
            let adjust;
            if (soldRatio >= 0.98) adjust = rand(1.06, 1.12);        // 秒殺 → 大幅抬
            else if (soldRatio >= 0.85) adjust = rand(1.02, 1.06);   // 賣光 → 小幅抬
            else if (soldRatio >= 0.55) adjust = rand(0.99, 1.02);   // 差不多，微調
            else if (soldRatio >= 0.25) adjust = rand(0.93, 0.98);   // 剩不少 → 降
            else adjust = rand(0.85, 0.92);                          // 大量作廢 → 大幅降

            this.price *= adjust;
            // 硬底線：不能低於成本 + 保底利潤
            const floor = this.cost * 1.05;
            if (this.price < floor) this.price = floor;
            // 天花板保護（避免通膨飆走）
            this.price = Math.min(this.price, this.cost * 6);

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
            this.dailyStats = [];   // { day, avgPrice, volume, waste, cs, ps }
            // 理論均衡：平均成本 × 平均加價（消費者 wtp 帶動）
            const avgCost = this.producers.reduce((s, p) => s + p.cost, 0) / cfg.producers;
            const avgWtp = this.consumers.reduce((s, c) => s + c.expected, 0) / cfg.consumers;
            this.eqPrice = (avgCost * 1.25 + avgWtp * 0.55) / 2 * 1.4;  // rough anchor
            // 更好的估法：市場出清點在 max(avgCost, avgWtp*0.6~0.8) 附近
            this.eqPrice = Math.max(avgCost * 1.2, Math.min(avgWtp, avgCost * 2.2));
        }

        // 每一天的交易撮合：
        // 1. 早上所有生產者定價 + 產麵包
        // 2. 消費者以隨機順序輪流「上街」，每人隨機抽一家看報價，決定買不買
        //    連續嘗試最多 M 次（模擬走訪多家店），資訊仍不完全
        // 3. 結算
        stepOneDay() {
            this.day += 1;
            this.producers.forEach(p => p.bake());
            this.consumers.forEach(c => { c.bought = 0; });

            const trades = [];   // { price, cid, pid }
            const shopOrder = shuffle(this.consumers.slice());
            const maxVisitsPerConsumer = Math.max(3, Math.min(this.cfg.producers, 6));

            // 多輪：每輪每個消費者選一家店試試（模擬走訪不同店）
            for (let round = 0; round < maxVisitsPerConsumer; round++) {
                for (const c of shopOrder) {
                    if (c.energy > 85 && c.bought >= c.dailyNeed) continue;
                    // 從還有庫存的店裡隨機選一家
                    const openStores = this.producers.filter(p => p.inventory > 0);
                    if (openStores.length === 0) break;
                    const p = openStores[randInt(0, openStores.length - 1)];
                    const price = p.offer();
                    if (price === null) continue;
                    if (c.decide(price)) {
                        p.sell();
                        c.buy(price);
                        trades.push({ price, cid: c.id, pid: p.id });
                    }
                }
            }

            // 結算：算出今日各種指標
            const volume = trades.length;
            const avgPrice = volume > 0 ? trades.reduce((s, t) => s + t.price, 0) / volume : 0;
            const waste = this.producers.reduce((s, p) => s + p.inventory, 0);
            // 生產者剩餘 = sum(成交價 - 對應成本)
            const ps = trades.reduce((s, t) => s + (t.price - this.producers[t.pid].cost), 0);
            // 消費者剩餘 = sum(max_wtp - 成交價)
            const cs = trades.reduce((s, t) => s + (this.consumers[t.cid].maxWtp - t.price), 0);

            const prices = this.producers.map(p => p.price);
            const rec = {
                day: this.day,
                avgPrice, volume, waste, cs, ps,
                welfare: cs + ps,
                minPrice: Math.min(...prices),
                maxPrice: Math.max(...prices),
            };
            this.dailyStats.push(rec);

            // Agent 收盤後更新自己
            this.producers.forEach(p => p.endDay(this.day));
            this.consumers.forEach(c => c.endDay(avgPrice));

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
            // hi-DPI: 讓在 retina 螢幕不糊
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

            // 邊距
            const padL = 44, padR = 12, padT = 14, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            // Y 軸範圍：涵蓋 min/max price
            let ymax = Math.max(eqPrice, ...stats.map(s => s.maxPrice));
            let ymin = Math.min(eqPrice, ...stats.map(s => Math.min(s.minPrice, s.avgPrice || Infinity)));
            if (!Number.isFinite(ymin)) ymin = 0;
            ymin = Math.max(0, ymin - 1);
            ymax = ymax + 1;
            const yr = ymax - ymin || 1;

            const vmax = Math.max(1, ...stats.map(s => s.volume));

            const xAt = i => padL + (stats.length === 1 ? chartW / 2 : (i / (stats.length - 1)) * chartW);
            const yAt = v => padT + chartH - ((v - ymin) / yr) * chartH;

            // 均衡帶（±10%）
            const eqLo = eqPrice * 0.9;
            const eqHi = eqPrice * 1.1;
            ctx.fillStyle = 'rgba(56,118,29,.10)';
            ctx.fillRect(padL, yAt(eqHi), chartW, yAt(eqLo) - yAt(eqHi));
            ctx.strokeStyle = 'rgba(56,118,29,.55)';
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(padL, yAt(eqPrice));
            ctx.lineTo(padL + chartW, yAt(eqPrice));
            ctx.stroke();
            ctx.setLineDash([]);

            // 網格線 (y)
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

            // 成交量 bar (半透明橘)
            ctx.fillStyle = 'rgba(230,126,34,.55)';
            const barW = Math.max(2, chartW / stats.length * 0.7);
            stats.forEach((s, i) => {
                const x = xAt(i) - barW / 2;
                const bh = (s.volume / vmax) * (chartH * 0.35);
                ctx.fillRect(x, padT + chartH - bh, barW, bh);
            });

            // 折線：max, min, avg
            const drawLine = (accessor, color, wid = 2) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = wid;
                ctx.beginPath();
                stats.forEach((s, i) => {
                    const v = accessor(s);
                    if (!Number.isFinite(v)) return;
                    const x = xAt(i), y = yAt(v);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();
            };
            drawLine(s => s.maxPrice, '#c0392b', 1.5);
            drawLine(s => s.minPrice, '#2874a6', 1.5);
            drawLine(s => s.avgPrice || null, '#38761D', 2.5);

            // X 軸標籤
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(stats.length, 8);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((stats.length - 1) * i / (xTicks - 1 || 1));
                ctx.fillText('Day ' + stats[idx].day, xAt(idx), padT + chartH + 4);
            }
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
    }

    function renderProducers(market) {
        const grid = $('producers-grid');
        grid.innerHTML = '';
        market.producers.forEach((p, i) => {
            const last = p.history[p.history.length - 1];
            const soldOut = last && last.sold >= p.capacity;
            const wasted = last && last.wasted > p.capacity * 0.5;
            const div = document.createElement('div');
            div.className = 'producer-card' + (soldOut ? ' sold-out' : '') + (wasted ? ' waste' : '');
            div.innerHTML = `
                <div class="name">🏪 Bakery ${i + 1}</div>
                <div class="row"><span>報價</span><span class="v">${fmt(p.price)}</span></div>
                <div class="row"><span>成本</span><span class="v">${fmt(p.cost)}</span></div>
                <div class="row"><span>產能</span><span class="v">${p.capacity}</span></div>
                <div class="row"><span>昨日賣</span><span class="v">${last ? last.sold : '—'}</span></div>
                <div class="row"><span>昨日剩</span><span class="v">${last ? last.wasted : '—'}</span></div>
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
        entry.innerHTML = `<span class="day">Day ${rec.day}</span> · 均價 <b>${rec.volume > 0 ? fmt(rec.avgPrice) : '無'}</b> · 量 ${rec.volume} · 廢 ${rec.waste} · <span class="${trendClass}">${trend}</span>`;
        log.prepend(entry);
        // 保留最多 40 條
        while (log.children.length > 40) log.removeChild(log.lastChild);
    }

    function tickOnce() {
        if (!market) return;
        const rec = market.stepOneDay();
        updateStatsUI(rec, market);
        renderProducers(market);
        pushLog(rec, market);
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
        ['stat-price', 'stat-volume', 'stat-waste', 'stat-cs', 'stat-ps', 'stat-welfare']
            .forEach(id => $(id).textContent = '—');
        $('stat-eq').textContent = fmt(market.eqPrice);
    }

    function reset() {
        pause();
        initMarket();
    }

    // event bindings
    document.addEventListener('DOMContentLoaded', () => {
        initMarket();
        $('btn-run').addEventListener('click', start);
        $('btn-pause').addEventListener('click', pause);
        $('btn-step').addEventListener('click', () => { if (!market) initMarket(); tickOnce(); });
        $('btn-reset').addEventListener('click', reset);

        // 改速度就重啟計時器
        $('cfg-speed').addEventListener('change', () => {
            if (timer) { pause(); start(); }
        });
    });
})();
