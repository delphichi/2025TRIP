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
        constructor(id, baseWtp, baseAlpha) {
            this.id = id;
            this.energy = randInt(40, 90);
            this.expected = baseWtp * rand(0.75, 1.2);
            this.confidence = rand(0.85, 1.15);
            this.maxWtp = this.expected * rand(1.2, 1.9);
            this.dailyNeed = randInt(1, 3);
            this.budget = rand(60, 180);
            // 邊際遞減係數：同一天內每多買一個，效用打折的強度
            // α 越大 → 越快飽；α=0 → 無遞減
            this.alpha = baseAlpha * rand(0.7, 1.3);
            this.bought = 0;
            this.spent = 0;
            this.surplus = 0;
        }

        // 第 (bought+1) 個麵包的邊際效用倍率，u(k) = exp(-α · k)
        marginalUtility() {
            return Math.exp(-this.alpha * this.bought);
        }

        // agent 決策 —— 資訊不完全，只看見自己內部狀態 + 這一家報價
        // trace: 可選 array，會 push {tag, msg} 讓 UI 攤開
        decide(price, producerId, trace) {
            const log = (tag, msg) => { if (trace) trace.push({ tag, msg }); };
            const mu = this.marginalUtility();
            const muPct = fmt(mu * 100, 0) + '%';

            if (price > this.budget) {
                log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：預算 ${fmt(this.budget,1)} 不夠`);
                return false;
            }
            // 邊際上限：把 maxWtp 也乘上 MU（第 k 個麵包的效用是 maxWtp · exp(-αk)）
            const marginalWtp = this.maxWtp * mu;
            if (price > marginalWtp) {
                log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：> 第 ${this.bought+1} 個的邊際 WTP ${fmt(marginalWtp,1)}（MU ${muPct}）`);
                return false;
            }

            let cap = this.expected * this.confidence * mu;
            let hungerLabel = '正常';
            if (this.energy < 25) {
                cap = Math.min(marginalWtp, cap * 1.4);
                hungerLabel = '很餓 ×1.4';
            } else if (this.energy < 45) {
                cap = Math.min(marginalWtp, cap * 1.15);
                hungerLabel = '餓 ×1.15';
            }

            const noise = 1 + (Math.random() - 0.5) * 0.1;
            const threshold = cap * noise;
            const detail = `錨 ${fmt(this.expected,1)}×信心 ${fmt(this.confidence,2)}×MU ${muPct}=${fmt(cap,2)}（${hungerLabel}）→ 閾值 ${fmt(threshold,2)}`;

            if (price <= threshold) {
                log('buy', `Bakery ${producerId+1} @ ${fmt(price)}：${detail}，判定買（第 ${this.bought+1} 個）`);
                return true;
            }
            log('skip', `Bakery ${producerId+1} @ ${fmt(price)}：${detail}，判定過貴`);
            return false;
        }

        // 傳回這次購買帶來的效用（給 market 用來算真實 CS）
        buy(price) {
            const utility = this.maxWtp * this.marginalUtility();
            this.budget -= price;
            this.energy = clamp(this.energy + 25, 0, 100);
            this.spent += price;
            this.surplus += (utility - price);
            this.bought += 1;
            return utility;
        }

        // 心理錨更新：從自己今天買到的價（own）+ 鄰居告訴他們的價（gossip）
        // 兩者可能任一為 null（沒買到 / 沒鄰居買到）
        endDay(ownPrice, gossipPrice) {
            const hasOwn = ownPrice !== null && Number.isFinite(ownPrice);
            const hasGossip = gossipPrice !== null && Number.isFinite(gossipPrice);
            // 慣性 0.6，own 0.2，gossip 0.2，當缺 own/gossip 時剩下的權重歸慣性
            let wI = 0.6, wO = hasOwn ? 0.2 : 0, wG = hasGossip ? 0.2 : 0;
            const total = wI + wO + wG;
            let updated = (wI / total) * this.expected;
            if (hasOwn) updated += (wO / total) * ownPrice;
            if (hasGossip) updated += (wG / total) * gossipPrice;
            this.expected = updated;
            this.energy = clamp(this.energy - randInt(25, 45), 0, 100);
            this.budget = Math.min(this.budget + rand(10, 25), 300);
            this.bought = 0;
        }
    }

    class Producer {
        constructor(id, costMin, costMax, capMin, capMax, preset) {
            this.id = id;
            if (preset) {
                this.cost = preset.cost;
                this.capacity = preset.capacity;
                this.price = preset.price;
                this.label = preset.label;
            } else {
                this.cost = rand(costMin, costMax);
                this.capacity = randInt(capMin, capMax);
                this.price = this.cost * rand(1.6, 2.2);
                this.label = null;
            }
            this.inventory = 0;
            this.soldToday = 0;
            this.wastedToday = 0;
            this.totalSurplus = 0;
            this.history = [];
            this.recentSales = [];   // 用來估 μ/σ 供 newsvendor 計算
            // 計劃產量：agent 現在能自己決定今天烤幾個，不再是總是烤滿
            // 初始從產能上限起步，之後學著往 newsvendor 解收斂
            this.plannedQuantity = this.capacity;
        }

        bake() {
            this.inventory = this.plannedQuantity;
            this.soldToday = 0;
            this.revenueToday = 0;
        }

        offer() { return this.inventory > 0 ? this.price : null; }

        sell() {
            if (this.inventory <= 0) return null;
            this.inventory -= 1;
            this.soldToday += 1;
            this.revenueToday += this.price;
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

            // 帳本：今天實際烤了幾個、賣掉幾個、賣光後剩下幾個、收入、成本
            // 沒賣掉的麵包成本也要算，因為錢已經花下去了
            this.history.push({
                day, price: this.price,
                baked: this.plannedQuantity,
                sold: this.soldToday, wasted: this.wastedToday,
                revenue: this.revenueToday,
                productionCost: this.cost * this.plannedQuantity,
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
            const oldPlan = this.plannedQuantity;
            let newPlan, planReason;
            if (nvQ !== null) {
                // 有 newsvendor 樣本：往 Q* 靠，用 70/30 慣性平滑避免劇烈跳動
                const target = clamp(nvQ, 1, this.capacity);
                newPlan = Math.max(1, Math.round(0.7 * oldPlan + 0.3 * target));
                planReason = `Newsvendor Q*≈${fmt(nvQ, 1)}，目標 ${fmt(target, 1)}；慣性平滑後烤 ${newPlan}`;
            } else {
                // 熱身期 heuristic：昨日賣量 + 2 個緩衝
                newPlan = clamp(this.soldToday + 2, 1, this.capacity);
                planReason = `heuristic：昨日賣 ${this.soldToday} + 2 緩衝 = ${newPlan}（熱身，尚無 newsvendor 樣本）`;
            }
            this.plannedQuantity = newPlan;
            log(newPlan > oldPlan ? 'raise' : newPlan < oldPlan ? 'drop' : 'flat',
                `計劃產量：${oldPlan} → ${newPlan}（${planReason}）`);

            this.inventory = 0;
        }
    }

    // ---------- market ----------
    class Market {
        constructor(cfg) {
            this.cfg = cfg;
            this.day = 0;
            this.consumers = Array.from({ length: cfg.consumers },
                (_, i) => new Consumer(i, cfg.baseWtp, cfg.alpha));
            // preset scenario 覆蓋隨機生成
            this.producers = cfg.preset
                ? cfg.preset.map((p, i) => new Producer(i, 0, 0, 0, 0, p))
                : Array.from({ length: cfg.producers },
                    (_, i) => new Producer(i, cfg.costMin, cfg.costMax, cfg.capMin, cfg.capMax));
            this.dailyStats = [];
            const eq = computeEquilibrium(this.consumers, this.producers);
            this.eqPrice = eq.price;
            this.eqQuantity = eq.quantity;
            this.totalSupply = eq.totalSupply;
            this.totalDemand = eq.totalDemand;
            this.lastTrace = null;
        }

        // 網格鄰居：跟 CityScene._houseRow 的 perRow 一致，這樣「屋頂旗子相鄰的鄰居」跟畫面對得上
        _neighborIds(cid) {
            const n = this.consumers.length;
            const perRow = Math.max(10, Math.min(20, n));
            const row = Math.floor(cid / perRow);
            const col = cid % perRow;
            const out = [];
            if (col > 0) out.push(cid - 1);
            if (col < perRow - 1 && cid + 1 < n) out.push(cid + 1);
            if (row > 0) out.push(cid - perRow);
            if (cid + perRow < n) out.push(cid + perRow);
            return out;
        }

        stepOneDay() {
            this.day += 1;
            this.producers.forEach(p => p.bake());
            this.consumers.forEach(c => { c.bought = 0; });

            // 開盤 snapshot：招牌顯示的價 + 庫存以此為準，避免用到 endDay 之後的值
            // baked = 今天實際烤了幾個（可能 < capacity，因為 agent 現在會選擇烤多少）
            const producerOpen = this.producers.map(p => ({
                id: p.id, cost: p.cost, price: p.price,
                capacity: p.capacity, baked: p.plannedQuantity,
            }));

            // 抽今日 trace 對象
            const tracedC = randInt(0, this.consumers.length - 1);
            const tracedP = randInt(0, this.producers.length - 1);
            const consumerTrace = [];
            const producerTrace = [];
            const cSnap = { ...(({ energy, expected, confidence, maxWtp, budget, dailyNeed, alpha }) =>
                ({ energy, expected, confidence, maxWtp, budget, dailyNeed, alpha }))(this.consumers[tracedC]) };

            const trades = [];
            const sceneEvents = [];   // { round, cid, pid, price, bought }
            const shopOrder = shuffle(this.consumers.slice());
            const maxVisits = Math.max(3, Math.min(this.cfg.producers, 6));
            // 每日拒絕計數：連續被拒 3 次就放棄回家，避免尾段所有人擠去唯一有貨的貴店互相「太貴」
            this.consumers.forEach(c => { c.rejectionsToday = 0; });

            for (let round = 0; round < maxVisits; round++) {
                for (const c of shopOrder) {
                    if (c.bought >= c.dailyNeed) continue;         // 買夠了就回家
                    if (c.rejectionsToday >= 3) continue;          // 被拒 3 次也放棄
                    const open = this.producers.filter(p => p.inventory > 0);
                    if (open.length === 0) break;
                    const p = open[randInt(0, open.length - 1)];
                    const price = p.offer();
                    if (price === null) continue;
                    const trace = (c.id === tracedC) ? consumerTrace : null;
                    const decided = c.decide(price, p.id, trace);
                    sceneEvents.push({ round, cid: c.id, pid: p.id, price, bought: decided });
                    if (decided) {
                        p.sell();
                        const utility = c.buy(price);
                        trades.push({ price, cid: c.id, pid: p.id, utility });
                        c.rejectionsToday = 0;   // 買到就重置耐心
                    } else {
                        c.rejectionsToday += 1;
                    }
                }
            }

            const volume = trades.length;
            const avgPrice = volume > 0 ? trades.reduce((s, t) => s + t.price, 0) / volume : 0;
            const waste = this.producers.reduce((s, p) => s + p.inventory, 0);
            const ps = trades.reduce((s, t) => s + (t.price - this.producers[t.pid].cost), 0);
            // CS 用邊際效用而非固定 maxWtp：第 3 個麵包的效用只有第 1 個的 e^(-2α) 倍
            const cs = trades.reduce((s, t) => s + (t.utility - t.price), 0);

            const pSnap = {
                cost: this.producers[tracedP].cost,
                priceBefore: this.producers[tracedP].price,
                capacity: this.producers[tracedP].capacity,
                bakedToday: this.producers[tracedP].plannedQuantity,
                soldToday: this.producers[tracedP].soldToday,
                wastedToday: this.producers[tracedP].inventory,
            };
            this.producers.forEach(p => {
                p.endDay(this.day, p.id === tracedP ? producerTrace : null);
            });

            // 消費者更新心理錨：從自己今天買到的價 + 鄰居告訴他的價
            // 沒買到就沒 own，只能靠鄰居；沒鄰居有買到就 anchor 不變
            // 對比舊模型用 dayAvgPrice（全市場均價）——那是不切實際的上帝視角
            const ownPer = new Map();
            for (const t of trades) {
                const x = ownPer.get(t.cid) || { total: 0, n: 0 };
                x.total += t.price; x.n += 1;
                ownPer.set(t.cid, x);
            }
            const ownAvgOf = cid => {
                const x = ownPer.get(cid);
                return x ? x.total / x.n : null;
            };
            const gossipOf = cid => {
                if (!this.cfg.gossip) return null;
                const nids = this._neighborIds(cid);
                const vals = nids.map(ownAvgOf).filter(v => v !== null);
                if (vals.length === 0) return null;
                return vals.reduce((s, v) => s + v, 0) / vals.length;
            };
            this.consumers.forEach(c => c.endDay(ownAvgOf(c.id), gossipOf(c.id)));

            // 給 scene 用：今天哪些鄰居 pair 都有買到（可以「聊天」）
            const gossipPairs = [];
            if (this.cfg.gossip) {
                for (const c of this.consumers) {
                    if (ownAvgOf(c.id) === null) continue;
                    for (const nid of this._neighborIds(c.id)) {
                        if (nid <= c.id) continue;   // 去重
                        if (ownAvgOf(nid) !== null) gossipPairs.push([c.id, nid]);
                    }
                }
            }

            // Newsvendor 過剩率：實際計劃產量 vs Newsvendor 解的差距
            // 產能可調後，這個 metric 反映的是「agent 學到多接近理論」，不再是硬編碼落差
            let nvOptimal = 0, nvHave = 0;
            for (const p of this.producers) {
                const q = p.newsvendorQ();
                if (q !== null) { nvOptimal += q; nvHave += p.plannedQuantity; }
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
                sceneEvents,
                producerOpen,
                gossipPairs,
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

    // 長跑時每 N 天取一點，避免 canvas 上塞幾百個重疊的點
    function downsampleStats(stats, target = 200) {
        if (stats.length <= target) return stats;
        const step = Math.ceil(stats.length / target);
        const out = [];
        for (let i = 0; i < stats.length; i += step) out.push(stats[i]);
        const last = stats[stats.length - 1];
        if (out[out.length - 1] !== last) out.push(last);
        return out;
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

    // ---------- pixel-art city scene ----------
    // 讀 dailyStats 的 sceneEvents，用 rAF 迴圈把「消費者從家 → 店 → 家」動畫化
    // 純 Canvas draw，無外部圖檔；配色類 PICO-8 palette
    const PAL = {
        sky: '#83b8f2', ground: '#6bb04a', street: '#4a4d55', walk: '#8f8878',
        bakeryBody: '#c4885a', bakeryRoof: '#7a3a24', bakeryDoor: '#3a1e10',
        signBg: '#fff2cc', signInk: '#221a10',
        bread: '#e2a45c', breadShadow: '#a0663a',
        house: '#e8d5a0', houseRoof: '#8b4a2a', houseDoor: '#5a3020',
        cloud: '#ffffffcc',
        bubbleBuy: '#a8e090', bubbleSkip: '#f0b4b4', bubbleInk: '#221a10',
    };

    class CityScene {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            const w = 720, h = 280;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            this.ctx.scale(dpr, dpr);
            this.ctx.imageSmoothingEnabled = false;
            this.w = w; this.h = h;
            this.market = null;
            this.dayNum = 0;
            this.events = [];
            this.dayStart = 0;
            this.dayDur = 450;
            this.frame = 0;
            this._running = true;
            this._loop();
        }

        setMarket(m) {
            this.market = m;
            this.events = [];
            this.dayNum = 0;
        }

        playDay(rec, durMs) {
            this.events = rec.sceneEvents || [];
            this.producerOpen = rec.producerOpen || null;
            this.gossipPairs = rec.gossipPairs || [];
            this.dayNum = rec.day;
            this.dayStart = performance.now();
            this.dayDur = Math.max(80, durMs);   // 快速時仍留 80ms 讓小人閃一下
        }

        _loop() {
            if (!this._running) return;
            this.frame++;
            this._render();
            requestAnimationFrame(() => this._loop());
        }

        _bakeryPos(pid) {
            const n = this.market ? this.market.producers.length : 1;
            const laneW = (this.w - 40) / n;
            return { x: 20 + pid * laneW + laneW / 2, y: 128 };
        }

        _houseRow(cid) {
            const n = this.market ? this.market.consumers.length : 1;
            const perRow = Math.max(10, Math.min(20, n));
            const rows = Math.ceil(n / perRow);
            const row = Math.floor(cid / perRow);
            const col = cid % perRow;
            const rowH = 44;
            const areaTop = this.h - rows * rowH - 8;
            const laneW = (this.w - 20) / perRow;
            return { x: 10 + col * laneW + laneW / 2, y: areaTop + row * rowH + rowH / 2 };
        }

        _render() {
            const ctx = this.ctx;
            const { w, h } = this;

            // sky
            ctx.fillStyle = PAL.sky;
            ctx.fillRect(0, 0, w, h);

            // clouds
            ctx.fillStyle = PAL.cloud;
            const t = this.frame * 0.3;
            for (let i = 0; i < 4; i++) {
                const cx = ((i * 200 + t) % (w + 80)) - 40;
                const cy = 20 + i * 6;
                ctx.fillRect(cx, cy, 40, 8);
                ctx.fillRect(cx + 6, cy - 4, 28, 4);
            }

            // ground
            ctx.fillStyle = PAL.ground;
            ctx.fillRect(0, 160, w, h - 160);

            // sidewalk (店家門口的走道)
            ctx.fillStyle = PAL.walk;
            ctx.fillRect(0, 155, w, 8);

            // street (中央馬路，白色虛線)
            ctx.fillStyle = PAL.street;
            ctx.fillRect(0, 140, w, 15);
            ctx.fillStyle = '#e0d090';
            for (let x = 0; x < w; x += 24) {
                ctx.fillRect(x, 146, 12, 3);
            }

            // 一次算完當下所有 active events：{ev, local}
            const now = performance.now();
            const dayProg = this.events.length > 0
                ? clamp((now - this.dayStart) / this.dayDur, 0, 1.05)
                : 1;
            const N = this.events.length;
            const eventSpan = N > 0 ? 1 / N : 1;
            // 每個事件至少佔天長度的 10%，讓走路/思考/決策每段都看得清楚
            // 快速時大量重疊（螞蟻潮汐感），慢速時走路動畫就有 1-2 秒
            const eventWindow = Math.max(0.10, Math.min(0.5, eventSpan * 4));
            const active = [];
            for (let i = 0; i < N; i++) {
                const start = i * eventSpan;
                const end = start + eventWindow;
                if (dayProg >= start && dayProg <= end) {
                    active.push({ ev: this.events[i], local: (dayProg - start) / (end - start) });
                }
            }

            // 每個 buy event 在 local >= 0.7（離開店家）才真的把庫存扣掉
            const soldByBakery = {};
            for (let i = 0; i < N; i++) {
                const ev = this.events[i];
                if (!ev.bought) continue;
                const start = i * eventSpan;
                const buyMoment = start + eventWindow * 0.7;
                if (dayProg >= buyMoment) {
                    soldByBakery[ev.pid] = (soldByBakery[ev.pid] || 0) + 1;
                }
            }

            // 誰家的門正在打開（消費者剛出門 or 剛回家）
            const openDoors = new Set();
            for (const { ev, local } of active) {
                if (local < 0.14 || local > 0.86) openDoors.add(ev.cid);
            }

            // bakeries + houses
            if (this.market) {
                this.market.producers.forEach((p, i) => {
                    const pos = this._bakeryPos(i);
                    const open = this.producerOpen ? this.producerOpen[i] : null;
                    const displayPrice = open ? open.price : p.price;
                    const displayInv = open
                        ? Math.max(0, open.baked - (soldByBakery[i] || 0))
                        : p.inventory;
                    this._drawBakery(pos.x, pos.y, displayPrice, displayInv, i + 1);
                });
                this.market.consumers.forEach((c, i) => {
                    const pos = this._houseRow(i);
                    this._drawHouse(pos.x, pos.y, i, openDoors.has(i));
                });
            }

            // day badge
            ctx.fillStyle = '#22181088';
            ctx.fillRect(w - 88, 4, 84, 20);
            ctx.fillStyle = '#fff2cc';
            ctx.font = 'bold 12px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('DAY ' + this.dayNum, w - 46, 14);

            // 消費者小人畫最上層
            for (const { ev, local } of active) {
                this._drawVisit(ev, local);
            }

            // 一天結束時（progress > 0.85）畫鄰居八卦的虛線 + 房頂 💬
            // 慢慢淡入淡出，快速時只是一閃而過
            if (this.gossipPairs && this.gossipPairs.length > 0 && dayProg > 0.85) {
                const fade = clamp((dayProg - 0.85) / 0.10, 0, 1) * clamp((1.05 - dayProg) / 0.10, 0, 1);
                ctx.save();
                ctx.globalAlpha = 0.75 * fade;
                ctx.strokeStyle = '#c86a20';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                for (const [a, b] of this.gossipPairs) {
                    if (a >= this.market.consumers.length || b >= this.market.consumers.length) continue;
                    const ha = this._houseRow(a);
                    const hb = this._houseRow(b);
                    ctx.beginPath();
                    ctx.moveTo(ha.x, ha.y - 12);
                    ctx.lineTo(hb.x, hb.y - 12);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                // 💬 icon on chatterers
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#c86a20';
                const chatSet = new Set();
                for (const [a, b] of this.gossipPairs) { chatSet.add(a); chatSet.add(b); }
                for (const cid of chatSet) {
                    if (cid >= this.market.consumers.length) continue;
                    const h = this._houseRow(cid);
                    ctx.fillText('💬', h.x, h.y - 18);
                }
                ctx.restore();
            }
        }

        _drawBakery(cx, y, price, inventory, num) {
            const ctx = this.ctx;
            const bw = 56, bh = 44;
            const x = cx - bw / 2;
            // body
            ctx.fillStyle = PAL.bakeryBody;
            ctx.fillRect(x, y, bw, bh);
            // roof
            ctx.fillStyle = PAL.bakeryRoof;
            ctx.beginPath();
            ctx.moveTo(x - 6, y);
            ctx.lineTo(x + 8, y - 12);
            ctx.lineTo(x + bw - 8, y - 12);
            ctx.lineTo(x + bw + 6, y);
            ctx.closePath();
            ctx.fill();
            // door
            ctx.fillStyle = PAL.bakeryDoor;
            ctx.fillRect(cx - 6, y + bh - 18, 12, 18);
            // window
            ctx.fillStyle = '#a8d8ee';
            ctx.fillRect(x + 4, y + 8, 10, 8);
            ctx.fillRect(x + bw - 14, y + 8, 10, 8);
            // sign
            ctx.fillStyle = PAL.signBg;
            ctx.fillRect(x - 4, y + 24, bw + 8, 12);
            ctx.strokeStyle = PAL.signInk;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 4, y + 24, bw + 8, 12);
            ctx.fillStyle = PAL.signInk;
            ctx.font = 'bold 10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`#${num} $${price.toFixed(1)}·${inventory}`, cx, y + 30);
            // 麵包 stack on top of bakery（賣光就沒了）
            const stackY = y - 22;
            for (let i = 0; i < Math.min(inventory, 10); i++) {
                const bx = x + 4 + i * 5;
                ctx.fillStyle = PAL.bread;
                ctx.fillRect(bx, stackY, 4, 4);
                ctx.fillStyle = PAL.breadShadow;
                ctx.fillRect(bx, stackY + 3, 4, 1);
            }
            // 賣光了 → 招牌變灰
            if (inventory === 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(x - 4, y + 24, bw + 8, 12);
            }
        }

        _drawHouse(cx, y, cid, doorOpen) {
            const ctx = this.ctx;
            const hw = 20, hh = 18;
            const x = cx - hw / 2;
            // 主體
            ctx.fillStyle = PAL.house;
            ctx.fillRect(x, y - hh / 2, hw, hh);
            // 屋頂
            ctx.fillStyle = PAL.houseRoof;
            ctx.beginPath();
            ctx.moveTo(x - 2, y - hh / 2);
            ctx.lineTo(x + hw / 2, y - hh / 2 - 8);
            ctx.lineTo(x + hw + 2, y - hh / 2);
            ctx.closePath();
            ctx.fill();
            // 屋頂上的身分色小旗——每戶對應住戶的 hue
            const hue = (cid * 137) % 360;
            ctx.fillStyle = `hsl(${hue}, 68%, 55%)`;
            ctx.fillRect(cx + hw / 2 - 2, y - hh / 2 - 6, 3, 3);
            ctx.fillStyle = '#3a2818';
            ctx.fillRect(cx + hw / 2 - 2, y - hh / 2 - 8, 1, 5);   // 旗杆
            // 窗戶
            ctx.fillStyle = '#a8d8ee';
            ctx.fillRect(x + 3, y - hh / 2 + 4, 4, 4);
            ctx.fillRect(x + hw - 7, y - hh / 2 + 4, 4, 4);
            // 門：關 → 深色門片；開 → 內部一片黑 + 側邊露一條門片
            if (doorOpen) {
                ctx.fillStyle = '#1a0e08';                   // 屋內黑暗
                ctx.fillRect(cx - 3, y + 1, 6, hh / 2 - 1);
                ctx.fillStyle = PAL.houseDoor;               // 半開的門片
                ctx.fillRect(cx - 4, y + 1, 1, hh / 2 - 1);
            } else {
                ctx.fillStyle = PAL.houseDoor;
                ctx.fillRect(cx - 2, y + 1, 4, hh / 2 - 1);
                ctx.fillStyle = '#c48b3a';                   // 門把
                ctx.fillRect(cx + 1, y + 4, 1, 1);
            }
        }

        // 16×20 像素小人：頭、頭髮、眼睛、身體、手、腿、鞋
        // 顏色依 cid 分配 hue，多樣化；atBakery 時腿停格 + 微微上下呼吸
        _drawPerson(px, py, cid, walking, walkFrame, hasBasket) {
            const ctx = this.ctx;
            const hue = (cid * 137) % 360;
            const shirt = `hsl(${hue}, 68%, 52%)`;
            const shirtDark = `hsl(${hue}, 65%, 38%)`;
            const hairHue = ((cid * 73) + 30) % 360;
            const hairColor = `hsl(${hairHue}, 55%, 25%)`;
            const skin = ['#f4c896', '#e0a878', '#c78e5a', '#a06840'][cid % 4];
            const pants = '#3a2818';

            // 影子
            ctx.fillStyle = '#00000040';
            ctx.fillRect(px - 5, py + 11, 10, 2);
            // 頭髮（頂 + 兩側）
            ctx.fillStyle = hairColor;
            ctx.fillRect(px - 3, py - 9, 6, 2);
            ctx.fillRect(px - 3, py - 8, 1, 3);
            ctx.fillRect(px + 2, py - 8, 1, 3);
            // 頭（膚色）
            ctx.fillStyle = skin;
            ctx.fillRect(px - 2, py - 7, 4, 5);
            // 眼睛
            ctx.fillStyle = '#1a1010';
            ctx.fillRect(px - 2, py - 5, 1, 1);
            ctx.fillRect(px + 1, py - 5, 1, 1);
            // 嘴
            ctx.fillStyle = '#8b3a2a';
            ctx.fillRect(px, py - 3, 1, 1);
            // 脖子
            ctx.fillStyle = skin;
            ctx.fillRect(px - 1, py - 2, 2, 1);
            // 身體（襯衫）
            ctx.fillStyle = shirt;
            ctx.fillRect(px - 4, py - 1, 8, 5);
            // 腰帶
            ctx.fillStyle = shirtDark;
            ctx.fillRect(px - 4, py + 4, 8, 1);
            // 手臂（膚色）
            ctx.fillStyle = skin;
            ctx.fillRect(px - 5, py, 1, 4);
            ctx.fillRect(px + 4, py, 1, 4);
            // 拿籃子（右手），籃內有一個麵包
            if (hasBasket) {
                ctx.fillStyle = '#8b5a2a';
                ctx.fillRect(px + 4, py + 3, 5, 3);
                ctx.fillStyle = '#5a3018';
                ctx.fillRect(px + 4, py + 2, 5, 1);
                ctx.fillStyle = PAL.bread;
                ctx.fillRect(px + 5, py + 1, 3, 2);
            }
            // 褲子
            ctx.fillStyle = pants;
            ctx.fillRect(px - 3, py + 5, 6, 3);
            // 腿（走路兩幀 or 站立）
            const frame = walking ? walkFrame : 0;
            ctx.fillStyle = pants;
            if (frame === 0) {
                ctx.fillRect(px - 3, py + 8, 2, 3);
                ctx.fillRect(px + 1, py + 8, 2, 3);
            } else {
                ctx.fillRect(px - 2, py + 8, 2, 3);
                ctx.fillRect(px, py + 8, 2, 3);
            }
            // 鞋
            ctx.fillStyle = '#5a3018';
            if (frame === 0) {
                ctx.fillRect(px - 3, py + 10, 2, 1);
                ctx.fillRect(px + 1, py + 10, 2, 1);
            } else {
                ctx.fillRect(px - 2, py + 10, 2, 1);
                ctx.fillRect(px, py + 10, 2, 1);
            }
        }

        _drawIdBadge(px, py, cid) {
            const ctx = this.ctx;
            const label = `#${cid + 1}`;
            const bw = 18, bh = 10;
            ctx.fillStyle = '#22181088';
            ctx.fillRect(px - bw / 2, py - 18, bw, bh);
            ctx.fillStyle = '#fff2cc';
            ctx.font = 'bold 8px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, px, py - 13);
        }

        _drawBubble(px, py, lines, kind) {
            const ctx = this.ctx;
            const oneLine = lines.length === 1;
            const bw = oneLine ? 22 : 64;
            const bh = oneLine ? 16 : 26;
            const bx = px - bw / 2, by = py - bh - 6;
            const bg = kind === 'buy' ? PAL.bubbleBuy
                    : kind === 'skip' ? PAL.bubbleSkip
                    : '#f5edd0';
            ctx.fillStyle = bg;
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = PAL.bubbleInk;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, bh);
            // 泡泡尖角
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.moveTo(px - 3, by + bh);
            ctx.lineTo(px, by + bh + 4);
            ctx.lineTo(px + 3, by + bh);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = PAL.bubbleInk;
            ctx.beginPath();
            ctx.moveTo(px - 3, by + bh);
            ctx.lineTo(px, by + bh + 4);
            ctx.lineTo(px + 3, by + bh);
            ctx.stroke();
            // 文字
            ctx.fillStyle = PAL.bubbleInk;
            ctx.font = 'bold 10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (oneLine) {
                ctx.fillText(lines[0], px, by + bh / 2);
            } else {
                ctx.fillText(lines[0], px, by + 8);
                ctx.fillText(lines[1], px, by + 19);
            }
        }

        _drawVisit(ev, local) {
            const home = this._houseRow(ev.cid);
            const bake = this._bakeryPos(ev.pid);
            const bakeStand = { x: bake.x, y: bake.y + 44 };   // 站在店門口

            let px, py, atBakery = false;
            let walking = true;
            if (local < 0.35) {
                const p = local / 0.35;
                px = home.x + (bakeStand.x - home.x) * p;
                py = home.y + (bakeStand.y - home.y) * p;
            } else if (local < 0.7) {
                px = bakeStand.x;
                py = bakeStand.y;
                atBakery = true;
                walking = false;
                // 站在店門口時輕微上下呼吸感
                py += Math.round(Math.sin(this.frame * 0.25) * 1);
            } else {
                const p = (local - 0.7) / 0.3;
                px = bakeStand.x + (home.x - bakeStand.x) * p;
                py = bakeStand.y + (home.y - bakeStand.y) * p;
            }

            const walkFrame = Math.floor(this.frame / 6) % 2;
            // 買到後回家時右手拿麵包籃
            const hasBasket = !atBakery && local >= 0.7 && ev.bought;

            this._drawPerson(px, py, ev.cid, walking, walkFrame, hasBasket);

            // 身分徽章：靠近店 or 離開店的一小段，方便追蹤特定消費者
            const showBadge = (local >= 0.25 && local < 0.35)
                          || atBakery
                          || (local >= 0.7 && local < 0.8);
            if (showBadge) this._drawIdBadge(px, py, ev.cid);

            // 兩段泡泡：先「思考中 ...」，再揭曉決策
            if (atBakery) {
                const localAtBakery = (local - 0.35) / 0.35;   // 0..1
                if (localAtBakery < 0.35) {
                    // 思考中 —— 一個 ? 或 ... 隨 frame 閃
                    const dots = ['?', '...', '?', '...'][Math.floor(this.frame / 12) % 4];
                    this._drawBubble(px, py - 4, [dots], 'think');
                } else {
                    // 決策揭曉
                    this._drawBubble(px, py - 4,
                        [`$${ev.price.toFixed(2)}`, ev.bought ? '買！✓' : '太貴 ✗'],
                        ev.bought ? 'buy' : 'skip');
                }
            }
        }
    }

    // 依 rank/total 從綠→黃→紅產生成本階級色（rank 0 = 最便宜、綠色）
    function costTierColor(rank, total) {
        if (total <= 1) return 'hsl(140, 60%, 45%)';
        const t = rank / (total - 1);          // 0..1
        // 綠 (140°) → 黃 (55°) → 紅 (10°)
        const hue = 140 - t * 130;
        return `hsl(${hue}, 68%, 42%)`;
    }

    // 各店累計淨利折線圖
    class BakeryProfitChart {
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

        // producers: 排序過的 [{ id, cost, marginPct, cumulative: [n1,n2,...] }]
        // 每個 bakery 的 cumulative 陣列長度應該相同（=天數）
        render(producers, sortedByCost) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            if (producers.length === 0 || producers[0].cumulative.length === 0) {
                ctx.fillStyle = '#aaa';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('按「開始」跑起來，這裡會出現各店累計淨利', w / 2, h / 2);
                return;
            }

            const padL = 52, padR = 12, padT = 12, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;
            const nDays = producers[0].cumulative.length;

            // 取樣，避免長跑時擠糊
            const target = 200;
            const stride = Math.max(1, Math.ceil(nDays / target));

            // Y 範圍：跨所有 bakery 找 min/max
            let ymin = 0, ymax = 0;
            for (const p of producers) {
                for (const v of p.cumulative) {
                    if (v < ymin) ymin = v;
                    if (v > ymax) ymax = v;
                }
            }
            ymin = Math.min(ymin, 0);
            ymax = Math.max(ymax, 10);
            const yr = ymax - ymin || 1;

            const xAt = i => padL + (nDays === 1 ? chartW / 2 : (i / (nDays - 1)) * chartW);
            const yAt = v => padT + chartH - ((v - ymin) / yr) * chartH;

            // 網格
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
                ctx.fillText(v.toFixed(0), padL - 4, y);
            }

            // 零線加粗
            if (ymin < 0 && ymax > 0) {
                ctx.strokeStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(padL, yAt(0));
                ctx.lineTo(padL + chartW, yAt(0));
                ctx.stroke();
            }

            // 每家 bakery 一條線
            for (const p of producers) {
                const rank = sortedByCost.indexOf(p.id);
                ctx.strokeStyle = costTierColor(rank, sortedByCost.length);
                // 毛利率越高越粗（1-3px）
                const wid = clamp(1 + p.marginPct * 8, 1, 3.5);
                ctx.lineWidth = wid;
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < nDays; i += stride) {
                    const v = p.cumulative[i];
                    if (!Number.isFinite(v)) continue;
                    const x = xAt(i), y = yAt(v);
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                }
                // 最後一點必畫
                const last = p.cumulative[nDays - 1];
                if (Number.isFinite(last)) ctx.lineTo(xAt(nDays - 1), yAt(last));
                ctx.stroke();
            }

            // X 軸標籤
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(nDays, 8);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((nDays - 1) * i / (xTicks - 1 || 1));
                ctx.fillText('Day ' + (idx + 1), xAt(idx), padT + chartH + 4);
            }
        }
    }

    // ---------- UI wiring ----------
    let market = null;
    let timer = null;
    let chart = null;
    let bakeryChart = null;
    let scene = null;

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
        const alphaRaw = parseFloat($('cfg-alpha').value);
        const alpha = clamp(Number.isFinite(alphaRaw) ? alphaRaw : 0.55, 0, 2);
        const speed = clamp(parseInt($('cfg-speed').value) || 900, 30, 60000);
        const gossip = ($('cfg-gossip')?.value || 'on') === 'on';
        const scenario = ($('cfg-scenario')?.value || 'random');
        // 5 象限實驗：把 5 家店固定成 (成本, 起始定價) 的極端組合
        // 產能都設 12 讓比較公平；市場開跑後定價會 dynamically 演變
        const preset = scenario === 'quadrant' ? [
            { cost: 4, price: 5,  capacity: 12, label: '低本低價' },
            { cost: 4, price: 10, capacity: 12, label: '低本高價' },
            { cost: 6, price: 9,  capacity: 12, label: '中本中價' },
            { cost: 8, price: 9,  capacity: 12, label: '高本低價' },
            { cost: 8, price: 14, capacity: 12, label: '高本高價' },
        ] : null;
        return {
            consumers, producers, costMin, costMax, capMin, capMax,
            baseWtp, alpha, gossip, speed, preset,
        };
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
                <div class="name">🏪 ${p.label || 'Bakery ' + (i + 1)}</div>
                <div class="row"><span>報價</span><span class="v">${fmt(p.price)}</span></div>
                <div class="row"><span>成本</span><span class="v">${fmt(p.cost)}</span></div>
                <div class="row"><span>產能 / 計劃烤</span><span class="v">${p.capacity} / ${p.plannedQuantity}</span></div>
                <div class="row"><span>昨賣 / 剩</span><span class="v">${last ? last.sold + ' / ' + last.wasted : '—'}</span></div>
                <div class="row"><span>Newsvendor Q*</span><span class="v">${nvQ === null ? '—' : fmt(nvQ, 1)}</span></div>
            `;
            grid.appendChild(div);
        });
    }

    function renderBakeryChart(market) {
        // 從 producer.history 算每一天的累計淨利
        const producers = market.producers.map((p, i) => {
            let cum = 0;
            const cumulative = p.history.map(h => {
                cum += (h.revenue - h.productionCost);
                return cum;
            });
            const marginPct = p.price > 0 ? (p.price - p.cost) / p.price : 0;
            const label = p.label || `Bakery ${i + 1}`;
            return { id: p.id, cost: p.cost, price: p.price, marginPct, cumulative, label };
        });
        // 排序 cost，用於配色（綠→紅）
        const sortedByCost = [...producers]
            .sort((a, b) => a.cost - b.cost)
            .map(p => p.id);
        bakeryChart.render(producers, sortedByCost);

        // Legend：顏色 + 標籤 + 成本 + 當前毛利率 + 累計淨利
        const leg = $('bakery-legend');
        leg.innerHTML = '';
        for (const p of producers) {
            const rank = sortedByCost.indexOf(p.id);
            const color = costTierColor(rank, sortedByCost.length);
            const finalCum = p.cumulative.length > 0 ? p.cumulative[p.cumulative.length - 1] : 0;
            const cumStr = finalCum >= 0 ? `+${fmt(finalCum, 0)}` : fmt(finalCum, 0);
            const div = document.createElement('span');
            div.className = 'lg';
            div.innerHTML = `<span class="swatch" style="background:${color}"></span>` +
                `${p.label} · 成 ${fmt(p.cost, 2)} · 價 ${fmt(p.price, 2)} · ` +
                `毛利 ${(p.marginPct * 100).toFixed(0)}% · 累計 ${cumStr}`;
            leg.appendChild(div);
        }
    }

    function renderLedger(market) {
        const tbody = $('ledger-tbody');
        const tfoot = $('ledger-tfoot');
        tbody.innerHTML = '';
        tfoot.innerHTML = '';
        let sumBaked = 0, sumSold = 0, sumWaste = 0, sumRev = 0, sumCost = 0;
        market.producers.forEach((p, i) => {
            const last = p.history[p.history.length - 1];
            if (!last) return;
            const baked = last.baked ?? p.capacity;
            const rev = last.revenue ?? 0;
            const cost = last.productionCost ?? (p.cost * baked);
            const profit = rev - cost;
            sumBaked += baked; sumSold += last.sold; sumWaste += last.wasted;
            sumRev += rev; sumCost += cost;
            const profitCls = profit > 0.5 ? 'positive' : profit < -0.5 ? 'negative' : 'flat';
            const wasteCls = last.wasted > 0 ? 'warn' : '';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>🏪 ${p.label || '#' + (i + 1)}</td>
                <td>${baked}</td>
                <td>${last.sold}</td>
                <td class="${wasteCls}">${last.wasted}</td>
                <td>${fmt(rev, 1)}</td>
                <td>${fmt(cost, 1)}</td>
                <td class="${profitCls}">${profit >= 0 ? '+' : ''}${fmt(profit, 1)}</td>
            `;
            tbody.appendChild(row);
        });
        const totalProfit = sumRev - sumCost;
        const totalCls = totalProfit > 0.5 ? 'positive' : totalProfit < -0.5 ? 'negative' : 'flat';
        const wasteCls = sumWaste > 0 ? 'warn' : '';
        tfoot.innerHTML = `
            <tr>
                <td>合計</td>
                <td>${sumBaked}</td>
                <td>${sumSold}</td>
                <td class="${wasteCls}">${sumWaste}</td>
                <td>${fmt(sumRev, 1)}</td>
                <td>${fmt(sumCost, 1)}</td>
                <td class="${totalCls}">${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit, 1)}</td>
            </tr>
        `;
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
            `α=${fmt(c.snapshot.alpha, 2)} · 最高願付 ${fmt(c.snapshot.maxWtp, 1)} · 每日需 ${c.snapshot.dailyNeed}`;
        renderTraceLog('trace-c-log', c.log,
            `今日走訪 ${c.log.length} 家，成交 ${c.finalBought}/${c.finalDailyNeed}`);

        $('trace-p-title').textContent = `Bakery ${p.id + 1}`;
        $('trace-p-meta').textContent =
            `昨日 → 成本 ${fmt(p.snapshot.cost)} · 產能 ${p.snapshot.capacity} · ` +
            `烤了 ${p.snapshot.bakedToday} · 售出 ${p.snapshot.soldToday} · 剩 ${p.snapshot.wastedToday} · 昨價 ${fmt(p.snapshot.priceBefore)}`;
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
        renderLedger(market);
        renderBakeryChart(market);
        pushLog(rec, market);
        renderTrace(rec);
        chart.render(downsampleStats(market.dailyStats), market.eqPrice);
        if (scene) scene.playDay(rec, readCfg().speed);
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
        bakeryChart = new BakeryProfitChart($('bakery-chart'));
        renderBakeryChart(market);   // 初始只有 legend，chart 顯示提示
        if (!scene) scene = new CityScene($('scene'));
        scene.setMarket(market);
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
