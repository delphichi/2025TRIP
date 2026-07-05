(function () {
    'use strict';

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const $ = id => document.getElementById(id);

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

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---------- Consumer (adapted from parent) ----------
    class Consumer {
        constructor(id, baseWtp, baseAlpha) {
            this.id = id;
            this.energy = randInt(40, 90);
            this.expected = baseWtp * rand(0.75, 1.2);
            this.confidence = rand(0.85, 1.15);
            this.maxWtp = this.expected * rand(1.2, 1.9);
            this.dailyNeed = randInt(1, 3);
            this.budget = rand(60, 180);
            this.alpha = baseAlpha * rand(0.7, 1.3);
            this.bought = 0;
            this.slowExpected = this.expected;
            this.pricesSeenToday = [];
            this.fatigue = 0;
            this.strikingDays = 0;
            this.priceMemoryToday = {};
            this.cheapestPidYesterday = null;
        }

        marginalUtility() { return Math.exp(-this.alpha * this.bought); }

        decide(price, panicMult = 1) {
            const mu = this.marginalUtility();
            if (price > this.budget) return false;
            if (price > this.maxWtp * mu * panicMult) return false;
            let cap = this.expected * this.confidence * mu * panicMult;
            if (this.energy < 25) cap *= 1.4;
            else if (this.energy < 45) cap *= 1.15;
            const noise = 1 + (Math.random() - 0.5) * 0.1;
            return price <= cap * noise;
        }

        buy(price) {
            this.budget -= price;
            this.energy = clamp(this.energy + 25, 0, 100);
            this.bought += 1;
        }

        endDay(ownPrice, gossipPrice, patienceThreshold) {
            const hasOwn = ownPrice !== null && Number.isFinite(ownPrice);
            const hasGossip = gossipPrice !== null && Number.isFinite(gossipPrice);
            let wI = 0.6, wO = hasOwn ? 0.2 : 0, wG = hasGossip ? 0.2 : 0;
            const total = wI + wO + wG;
            let updated = (wI / total) * this.expected;
            if (hasOwn) updated += (wO / total) * ownPrice;
            if (hasGossip) updated += (wG / total) * gossipPrice;
            this.expected = updated;
            const observed = hasOwn ? ownPrice : (hasGossip ? gossipPrice : null);
            if (observed !== null) this.slowExpected = 0.99 * this.slowExpected + 0.01 * observed;

            if (patienceThreshold > 0) {
                const minSeen = this.pricesSeenToday.length > 0
                    ? Math.min(...this.pricesSeenToday) : null;
                if (minSeen !== null && minSeen > this.slowExpected * 1.25) this.fatigue += 1;
                else this.fatigue = Math.max(0, this.fatigue - 1);
                if (this.fatigue >= patienceThreshold) {
                    this.strikingDays = randInt(3, 5);
                    this.fatigue = 0;
                }
            }
            this.pricesSeenToday = [];
            const pids = Object.keys(this.priceMemoryToday);
            if (pids.length > 0) {
                let minP = Infinity, minPid = null;
                for (const pid of pids) {
                    if (this.priceMemoryToday[pid] < minP) {
                        minP = this.priceMemoryToday[pid];
                        minPid = Number(pid);
                    }
                }
                this.cheapestPidYesterday = minPid;
            }
            this.priceMemoryToday = {};
            this.energy = clamp(this.energy - randInt(25, 45), 0, 100);
            this.budget = Math.min(this.budget + rand(10, 25), 300);
            this.bought = 0;
        }

        observePrice(price, pid) {
            this.pricesSeenToday.push(price);
            if (pid !== undefined) this.priceMemoryToday[pid] = price;
        }
        isOnStrike() { return this.strikingDays > 0; }
        tickStrike() { if (this.strikingDays > 0) this.strikingDays -= 1; }
    }

    // ---------- Producer (AI opponent) ----------
    class Producer {
        constructor(id, cost, capacity, price, label, isPlayer = false) {
            this.id = id;
            this.cost = cost;
            this.initialCost = cost;
            this.capacity = capacity;
            this.price = price;
            this.label = label;
            this.isPlayer = isPlayer;
            this.inventory = 0;
            this.soldToday = 0;
            this.wastedToday = 0;
            this.visitsToday = 0;
            this.revenueToday = 0;
            this.history = [];
            this.recentSales = [];
            this.plannedQuantity = Math.max(1, Math.ceil(capacity / 2));
            this.cumulativeProfit = 100;
            this.closed = false;
            this.closedDay = null;
            this.promoDaysLeft = 0;
            this.promoMultiplier = 1.0;
            this.hasUsedPromo = false;
            this.lastProfit = 0;
        }

        effectivePrice() {
            const raw = this.price * this.promoMultiplier;
            const floor = this.cost * 1.05;
            return Math.max(raw, floor);
        }
        inPromo() { return this.promoDaysLeft > 0; }

        bake() {
            if (this.closed) {
                this.inventory = 0;
                this.plannedQuantity = 0;
                this.soldToday = 0;
                this.revenueToday = 0;
                this.visitsToday = 0;
                return;
            }
            this.inventory = this.plannedQuantity;
            this.soldToday = 0;
            this.revenueToday = 0;
            this.visitsToday = 0;
        }

        offer() { return this.inventory > 0 ? this.effectivePrice() : null; }

        sell() {
            if (this.inventory <= 0) return null;
            const px = this.effectivePrice();
            this.inventory -= 1;
            this.soldToday += 1;
            this.revenueToday += px;
            return px;
        }

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

        // 收帳、通膨、促銷、破產判定 —— player 跟 AI 共用；價格/產量調整是 AI 專屬
        _bookkeep(day, inflationPct) {
            this.wastedToday = this.inventory;
            const todayCost = this.cost * this.plannedQuantity;
            const todayProfit = this.revenueToday - todayCost;
            this.lastProfit = todayProfit;
            this.cumulativeProfit += todayProfit;
            this.history.push({
                day, price: this.price,
                baked: this.plannedQuantity,
                sold: this.soldToday, wasted: this.wastedToday,
                revenue: this.revenueToday,
                productionCost: todayCost,
                profit: todayProfit,
                cumulativeProfit: this.cumulativeProfit,
                closed: false,
            });
            this.recentSales.push(this.soldToday);
            if (this.recentSales.length > 10) this.recentSales.shift();
            if (inflationPct > 0) this.cost *= (1 + inflationPct);
        }

        _checkPromoAndBankruptcy(day) {
            if (this.cumulativeProfit < 60 && this.promoDaysLeft === 0 && !this.hasUsedPromo) {
                this.promoDaysLeft = 5;
                this.promoMultiplier = 0.75;
                this.hasUsedPromo = true;
                this.plannedQuantity = Math.max(1, Math.floor(this.plannedQuantity * 0.6));
            }
            if (this.promoDaysLeft > 0) {
                this.promoDaysLeft -= 1;
                if (this.promoDaysLeft === 0) this.promoMultiplier = 1.0;
            }
            const canPromoStayAlive = this.inPromo() && this.cumulativeProfit > -50;
            if (this.cumulativeProfit < 0 && !canPromoStayAlive) {
                this.closed = true;
                this.closedDay = day;
                this.history[this.history.length - 1].closed = true;
            }
            this.inventory = 0;
        }

        endDay(day, inflationPct, competitorAvgPrice, competitionWeight) {
            if (this.closed) {
                this.history.push({
                    day, price: this.price, baked: 0,
                    sold: 0, wasted: 0, revenue: 0, productionCost: 0,
                    profit: 0, cumulativeProfit: this.cumulativeProfit, closed: true,
                });
                return;
            }
            this._bookkeep(day, inflationPct);

            const visits = this.visitsToday || 0;
            const sellThrough = visits >= 2 ? this.soldToday / visits : null;
            let adjust;
            if (sellThrough === null) adjust = 1.0;
            else if (sellThrough >= 0.85) adjust = rand(1.03, 1.08);
            else if (sellThrough >= 0.60) adjust = rand(1.00, 1.03);
            else if (sellThrough >= 0.35) adjust = rand(0.98, 1.01);
            else if (sellThrough >= 0.15) adjust = rand(0.93, 0.97);
            else adjust = rand(0.85, 0.92);
            this.price *= adjust;

            if (competitorAvgPrice > 0 && competitionWeight > 0) {
                this.price = (1 - competitionWeight) * this.price + competitionWeight * competitorAvgPrice;
            }
            const floor = this.cost * 1.05;
            if (this.price < floor) this.price = floor;
            this.price = Math.min(this.price, this.cost * 6);

            const nvQ = this.newsvendorQ();
            const oldPlan = this.plannedQuantity;
            let newPlan;
            if (nvQ !== null) {
                const target = clamp(nvQ, 1, this.capacity);
                newPlan = Math.max(1, Math.round(0.7 * oldPlan + 0.3 * target));
            } else {
                newPlan = clamp(this.soldToday + 2, 1, this.capacity);
            }
            this.plannedQuantity = newPlan;

            this._checkPromoAndBankruptcy(day);
        }
    }

    // ---------- PlayerProducer (skips auto-adjust, waits for UI) ----------
    class PlayerProducer extends Producer {
        constructor(id, cost, capacity, price, label) {
            super(id, cost, capacity, price, label, true);
        }

        // 玩家版 endDay：只結帳、通膨、促銷、破產；價格 / 產量不動——由 UI 設定
        endDay(day, inflationPct) {
            if (this.closed) {
                this.history.push({
                    day, price: this.price, baked: 0,
                    sold: 0, wasted: 0, revenue: 0, productionCost: 0,
                    profit: 0, cumulativeProfit: this.cumulativeProfit, closed: true,
                });
                return;
            }
            this._bookkeep(day, inflationPct);
            // ⚠ 生存促銷會強制改烤量。既然玩家自己決定烤量，就不自動觸發促銷了。
            // （簡化：玩家自己控成本 / 定價，不需要系統跳出來搶方向盤）
            const canPromoStayAlive = this.inPromo() && this.cumulativeProfit > -50;
            if (this.cumulativeProfit < 0 && !canPromoStayAlive) {
                this.closed = true;
                this.closedDay = day;
                this.history[this.history.length - 1].closed = true;
            }
            this.inventory = 0;
        }

        setPrice(newPrice) {
            const floor = this.cost * 1.05;
            const ceiling = this.cost * 6;
            this.price = clamp(newPrice, floor, ceiling);
        }

        setPlannedQuantity(qty) {
            this.plannedQuantity = clamp(Math.round(qty), 0, this.capacity);
        }
    }

    // ---------- Market ----------
    class Market {
        constructor(cfg) {
            this.cfg = cfg;
            this.day = 0;
            this.consumers = Array.from({ length: cfg.consumers },
                (_, i) => new Consumer(i, cfg.baseWtp, cfg.alpha));
            this.player = new PlayerProducer(
                0, cfg.playerCost, cfg.playerCapacity,
                cfg.playerInitPrice, '🥐 我的麵包店'
            );
            this.opponents = cfg.opponents.map((op, i) => new Producer(
                i + 1, op.cost, op.capacity, op.price, op.label, false
            ));
            this.producers = [this.player, ...this.opponents];
            // 每天的決策記錄：玩家選的 vs AI 建議的
            // { day, playerPrice, aiPrice, playerQty, aiQty }
            // 用於：(a) daily log 顯示差、(b) game over 學習曲線、(c) 拐點回顧
            this.decisionLog = [];
        }

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
            this.consumers.forEach(c => { c.bought = 0; c.rejectionsToday = 0; });

            const shopOrder = shuffle(this.consumers.slice());
            const maxVisits = Math.max(3, Math.min(this.producers.length, 6));
            const trades = [];
            const totalAlive = this.producers.filter(p => !p.closed).length;

            for (let round = 0; round < maxVisits; round++) {
                for (const c of shopOrder) {
                    if (c.isOnStrike()) continue;
                    if (c.bought >= c.dailyNeed) continue;
                    if (c.rejectionsToday >= 3) continue;
                    const open = this.producers.filter(p => p.inventory > 0);
                    if (open.length === 0) break;
                    const openRatio = totalAlive > 0 ? open.length / totalAlive : 1;
                    const scarcity = Math.max(0, 0.5 - openRatio) * 2;
                    const panicMult = 1 + scarcity * (this.cfg.panicSensitivity || 0);

                    let p;
                    if (round === 0 && c.cheapestPidYesterday !== null && Math.random() < 0.30) {
                        const memP = open.find(x => x.id === c.cheapestPidYesterday);
                        if (memP) p = memP;
                    }
                    if (!p) p = open[randInt(0, open.length - 1)];
                    const price = p.offer();
                    if (price === null) continue;

                    const bought = c.decide(price, panicMult);
                    c.observePrice(price, p.id);
                    p.visitsToday = (p.visitsToday || 0) + 1;

                    if (bought) {
                        p.sell();
                        c.buy(price);
                        trades.push({ price, cid: c.id, pid: p.id });
                        c.rejectionsToday = 0;
                    } else {
                        c.rejectionsToday += 1;
                    }
                }
            }

            // Player: bookkeeping only, no auto-adjust
            this.player.endDay(this.day, this.cfg.inflation || 0);

            // Opponents: full auto endDay
            const alive = this.producers.filter(p => !p.closed);
            this.opponents.forEach(p => {
                const competitors = alive.filter(o => o.id !== p.id);
                const avgComp = competitors.length > 0
                    ? competitors.reduce((s, o) => s + o.price, 0) / competitors.length
                    : 0;
                p.endDay(this.day, this.cfg.inflation || 0, avgComp, this.cfg.competition || 0);
            });

            // Consumer anchor / gossip / strike update
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
            const patience = this.cfg.patience || 0;
            this.consumers.forEach(c => c.endDay(ownAvgOf(c.id), gossipOf(c.id), patience));
            this.consumers.forEach(c => c.tickStrike());

            return {
                day: this.day,
                playerSold: this.player.soldToday,
                playerWasted: this.player.wastedToday,
                playerProfit: this.player.lastProfit,
                playerCumulative: this.player.cumulativeProfit,
                playerClosed: this.player.closed,
                trades: trades.length,
            };
        }
    }

    // ---------- Presets ----------
    const COST_TIERS = {
        low:  { cost: 18, capacity: 30, initPrice: 32, name: '低成本' },
        mid:  { cost: 25, capacity: 25, initPrice: 45, name: '中成本' },
        high: { cost: 34, capacity: 20, initPrice: 62, name: '高成本' },
    };

    function makeOpponents(difficulty) {
        // 4 家 AI 對手，成本 / 產能組合
        const opponentBase = {
            easy: [
                { cost: 32, capacity: 22, price: 55, label: '對手 A · 高本' },
                { cost: 30, capacity: 24, price: 52, label: '對手 B · 中高本' },
                { cost: 28, capacity: 25, price: 48, label: '對手 C · 中本' },
                { cost: 27, capacity: 25, price: 46, label: '對手 D · 中本' },
            ],
            normal: [
                { cost: 28, capacity: 24, price: 50, label: '對手 A · 中高本' },
                { cost: 25, capacity: 25, price: 45, label: '對手 B · 中本' },
                { cost: 22, capacity: 27, price: 40, label: '對手 C · 中低本' },
                { cost: 20, capacity: 30, price: 36, label: '對手 D · 低本' },
            ],
            hard: [
                { cost: 22, capacity: 27, price: 40, label: '對手 A · 中低本' },
                { cost: 20, capacity: 28, price: 36, label: '對手 B · 低本' },
                { cost: 17, capacity: 32, price: 32, label: '對手 C · 極低本' },
                { cost: 16, capacity: 34, price: 30, label: '對手 D · 極低本' },
            ],
        };
        return opponentBase[difficulty] || opponentBase.normal;
    }

    function makeMarketCfg(costTier, difficulty, mood) {
        const tier = COST_TIERS[costTier];
        const opponents = makeOpponents(difficulty);
        const moodMap = {
            calm:   { inflation: 0.0000, competition: 0.05, gossip: false, patience: 0, panicSensitivity: 0.1 },
            normal: { inflation: 0.0015, competition: 0.10, gossip: true,  patience: 4, panicSensitivity: 0.2 },
            harsh:  { inflation: 0.0040, competition: 0.15, gossip: true,  patience: 3, panicSensitivity: 0.3 },
        };
        const m = moodMap[mood] || moodMap.normal;
        return {
            consumers: 40,
            baseWtp: 42,
            alpha: 0.5,
            playerCost: tier.cost,
            playerCapacity: tier.capacity,
            playerInitPrice: tier.initPrice,
            opponents,
            ...m,
        };
    }

    // ---------- UI ----------
    let market = null;
    let gameOver = false;

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function renderOpponents() {
        const wrap = $('opponents');
        wrap.innerHTML = '';
        market.opponents.forEach(op => {
            const card = el('div', 'shop-card' + (op.closed ? ' closed' : ''));
            card.appendChild(el('div', 'shop-name', op.label));
            const priceRow = el('div', 'shop-price-big', '$' + fmt(op.effectivePrice(), 1));
            // 不再顯示「特價」badge —— 生存促銷是對手內部狀態，玩家只看得到價格
            // 價格暴跌本身是唯一線索：讓玩家自己推理「這家為什麼降這麼多？」
            if (op.closed) {
                const b = el('span', 'shop-badge closed', `倒店 D${op.closedDay}`);
                priceRow.appendChild(b);
            }
            card.appendChild(priceRow);
            // 只顯示招牌價 —— 不透露成本、庫存、本金、促銷狀態
            card.appendChild(el('div', 'shop-stat', '成本 / 庫存 → 🔒 看不到'));
            wrap.appendChild(card);
        });
    }

    function renderMineCard() {
        const p = market.player;
        $('mine-cost').textContent = '$' + fmt(p.cost, 1);
        $('mine-cap').textContent = p.capacity;
        $('mine-cash').textContent = '$' + fmt(p.cumulativeProfit, 1);
        if (p.history.length === 0) {
            $('mine-baked').textContent = '—';
            $('mine-sold').textContent = '—';
            $('mine-wasted').textContent = '—';
            $('mine-profit').textContent = '—';
        } else {
            const last = p.history[p.history.length - 1];
            $('mine-baked').textContent = last.baked;
            $('mine-sold').textContent = last.sold;
            $('mine-wasted').textContent = last.wasted;
            const prof = last.profit;
            $('mine-profit').innerHTML = `<span class="${prof >= 0 ? 'tag-good' : 'tag-bad'}">$${fmt(prof, 1)}</span>`;
        }
    }

    function updateHeader() {
        $('day-label').textContent = `Day ${market.day}`;
        const cash = market.player.cumulativeProfit;
        const cls = cash >= 100 ? 'tag-good' : cash >= 0 ? '' : 'tag-bad';
        $('cash-label').innerHTML = `<span class="${cls}">$${fmt(cash, 1)}</span>`;
    }

    function renderDecisionDefaults() {
        const p = market.player;
        const priceEl = $('dec-price');
        const qtyEl = $('dec-qty');
        // 預設：沿用當前價 + 上一輪賣量（新手引導）
        const suggestedPrice = clamp(p.price, +priceEl.min, +priceEl.max);
        priceEl.value = suggestedPrice.toFixed(1);
        $('dec-price-val').textContent = '$' + fmt(suggestedPrice, 1);
        const qty = p.history.length > 0 ? p.history[p.history.length - 1].sold + 2 : Math.ceil(p.capacity / 2);
        const qtyClamped = clamp(qty, 0, p.capacity);
        qtyEl.max = p.capacity;
        qtyEl.value = qtyClamped;
        $('dec-qty-val').textContent = qtyClamped + ' 個';
    }

    function computeAISuggestion() {
        const p = market.player;
        // 建議價：對手均價（招牌看得到）× 微加成或減成 決於本金
        const aliveOpp = market.opponents.filter(o => !o.closed);
        const avgOppPrice = aliveOpp.length > 0
            ? aliveOpp.reduce((s, o) => s + o.effectivePrice(), 0) / aliveOpp.length
            : p.price;
        let suggestedPrice = 0.7 * p.price + 0.3 * avgOppPrice;
        const floor = p.cost * 1.05;
        // 若本金低 → 降價搶客；若本金厚 → 略高於均價（打精品）
        if (p.cumulativeProfit < 50) suggestedPrice *= 0.95;
        else if (p.cumulativeProfit > 200) suggestedPrice *= 1.05;
        suggestedPrice = Math.max(floor, suggestedPrice);

        // 建議產量：newsvendor（有樣本用），沒有就 heuristic
        const nvQ = p.newsvendorQ();
        const oldPlan = p.plannedQuantity;
        let suggestedQty;
        let qtyReason;
        if (nvQ !== null) {
            const target = clamp(nvQ, 1, p.capacity);
            suggestedQty = Math.max(1, Math.round(0.7 * oldPlan + 0.3 * target));
            qtyReason = `Newsvendor Q*≈${fmt(nvQ, 1)}（近 ${p.recentSales.length} 天銷量的樣本），慣性平滑`;
        } else {
            const lastSold = p.history.length > 0 ? p.history[p.history.length - 1].sold : Math.ceil(p.capacity / 2);
            suggestedQty = clamp(lastSold + 2, 1, p.capacity);
            qtyReason = `熱身期：昨日賣 ${lastSold} + 2 緩衝（樣本不足）`;
        }

        return {
            price: suggestedPrice, qty: suggestedQty,
            avgOppPrice, qtyReason,
        };
    }

    function renderAISuggestion() {
        const s = computeAISuggestion();
        const p = market.player;
        const html = `
            <p>對手平均招牌 <b>$${fmt(s.avgOppPrice, 1)}</b>；你的成本 <b>$${fmt(p.cost, 1)}</b>（下限 $${fmt(p.cost * 1.05, 1)}）</p>
            <p>建議售價：<b>$${fmt(s.price, 1)}</b>（本金 $${fmt(p.cumulativeProfit, 0)} → ${p.cumulativeProfit < 50 ? '低本，降價搶客' : p.cumulativeProfit > 200 ? '厚本，可略高' : '中性，貼近均價'}）</p>
            <p>建議產量：<b>${s.qty} 個</b>（${s.qtyReason}）</p>
        `;
        $('suggest-body').innerHTML = html;
        $('btn-apply-suggest').hidden = false;
        $('btn-apply-suggest').dataset.price = s.price.toFixed(2);
        $('btn-apply-suggest').dataset.qty = s.qty;
    }

    function applyAISuggestion() {
        const btn = $('btn-apply-suggest');
        const price = +btn.dataset.price;
        const qty = +btn.dataset.qty;
        $('dec-price').value = price.toFixed(1);
        $('dec-price-val').textContent = '$' + fmt(price, 1);
        $('dec-qty').value = qty;
        $('dec-qty-val').textContent = qty + ' 個';
    }

    function logDay(rec) {
        const log = $('day-log');
        const empty = log.querySelector('.log-empty');
        if (empty) empty.remove();
        const box = el('div');
        box.appendChild(el('h4', null, `Day ${rec.day}`));
        const p = market.player;
        const prof = rec.playerProfit;
        const profTag = prof >= 0 ? 'tag-good' : 'tag-bad';
        // 決策差：你 vs AI 建議（每天都算，跟按不按建議按鈕無關）
        const dec = market.decisionLog[market.decisionLog.length - 1];
        if (dec) {
            const dP = dec.playerPrice - dec.aiPrice;
            const dQ = dec.playerQty - dec.aiQty;
            const sign = v => v > 0 ? '+' : '';
            const decP = el('p', 'log-delta');
            decP.innerHTML = `你 $${fmt(dec.playerPrice, 1)} / ${dec.playerQty} 個；AI 建議 $${fmt(dec.aiPrice, 1)} / ${dec.aiQty} 個（差 <b>${sign(dP)}$${fmt(dP, 1)}</b> / <b>${sign(dQ)}${dQ}</b> 個）`;
            box.appendChild(decP);
        }
        box.appendChild(el('p', null,
            `你賣 ${rec.playerSold}，剩 ${rec.playerWasted}（烤了 ${p.history[p.history.length - 1].baked} 個）。`));
        const profP = el('p');
        profP.innerHTML = `淨利 <span class="${profTag}">$${fmt(prof, 1)}</span>；本金 → <b>$${fmt(rec.playerCumulative, 1)}</b>`;
        box.appendChild(profP);
        const closedNow = market.opponents.filter(o => o.closed && o.closedDay === rec.day);
        if (closedNow.length > 0) {
            const cp = el('p');
            cp.innerHTML = `💀 對手倒店：${closedNow.map(o => `<b>${o.label}</b>`).join('、')}`;
            box.appendChild(cp);
        }
        log.insertBefore(box, log.firstChild);
        // 保留最新 8 天
        while (log.children.length > 8) log.removeChild(log.lastChild);
    }

    // ---------- Charts ----------
    class MiniChart {
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

        clear() { this.ctx.clearRect(0, 0, this.w, this.h); }

        drawLines(series, opts) {
            // series: [{ points: [{x, y}], color, width, label, dashed }]
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            const padL = 42, padR = 12, padT = 14, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            const allY = series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite);
            if (allY.length === 0) {
                ctx.fillStyle = '#aaa';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('資料建立中……', w / 2, h / 2);
                return;
            }
            let ymin = Math.min(...allY, opts.ymin !== undefined ? opts.ymin : Infinity);
            let ymax = Math.max(...allY, opts.ymax !== undefined ? opts.ymax : -Infinity);
            if (opts.padPct) {
                const pad = (ymax - ymin) * opts.padPct;
                ymin -= pad; ymax += pad;
            }
            if (ymax - ymin < 1) ymax = ymin + 1;
            const yr = ymax - ymin;
            const xmax = opts.xmax || Math.max(...series.flatMap(s => s.points.map(p => p.x)));
            const xmin = 1;

            const xAt = x => padL + (xmax === xmin ? chartW / 2 : ((x - xmin) / (xmax - xmin)) * chartW);
            const yAt = y => padT + chartH - ((y - ymin) / yr) * chartH;

            // grid + labels
            ctx.strokeStyle = '#eee';
            ctx.fillStyle = '#888';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 4; i++) {
                const v = ymin + (yr * i) / 4;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + chartW, y);
                ctx.stroke();
                ctx.fillText(fmt(v, 0), padL - 4, y);
            }

            // zero line (for cash chart)
            if (opts.showZero) {
                ctx.strokeStyle = '#dc2626';
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(padL, yAt(0));
                ctx.lineTo(padL + chartW, yAt(0));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            for (const s of series) {
                if (s.points.length === 0) continue;
                ctx.strokeStyle = s.color;
                ctx.lineWidth = s.width || 1.5;
                if (s.dashed) ctx.setLineDash([5, 4]);
                ctx.beginPath();
                let started = false;
                for (const pt of s.points) {
                    if (!Number.isFinite(pt.y)) { started = false; continue; }
                    if (!started) { ctx.moveTo(xAt(pt.x), yAt(pt.y)); started = true; }
                    else ctx.lineTo(xAt(pt.x), yAt(pt.y));
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // x-axis: day labels
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let d = 1; d <= xmax; d += Math.max(1, Math.ceil(xmax / 6))) {
                ctx.fillText('D' + d, xAt(d), padT + chartH + 4);
            }
        }
    }

    let chartPrice = null;
    let chartCash = null;

    function renderCharts() {
        if (!chartPrice) chartPrice = new MiniChart($('chart-price'));
        if (!chartCash)  chartCash  = new MiniChart($('chart-cash'));
        if (market.day === 0) { chartPrice.clear(); chartCash.clear(); return; }

        const OPP_COLORS = ['#94a3b8', '#a3a3a3', '#78716c', '#71717a'];
        const priceSeries = [];
        const cashSeries = [];

        // player 亮橘、粗
        priceSeries.push({
            points: market.player.history.map(r => ({
                x: r.day, y: r.closed ? NaN : r.price,
            })),
            color: '#f97316', width: 3, label: '你',
        });
        cashSeries.push({
            points: market.player.history.map(r => ({
                x: r.day, y: r.cumulativeProfit,
            })),
            color: '#f97316', width: 3, label: '你',
        });

        market.opponents.forEach((op, i) => {
            priceSeries.push({
                points: op.history.map(r => ({
                    x: r.day, y: r.closed ? NaN : r.price,
                })),
                color: OPP_COLORS[i % OPP_COLORS.length], width: 1.2,
            });
            cashSeries.push({
                points: op.history.map(r => ({
                    x: r.day, y: r.cumulativeProfit,
                })),
                color: OPP_COLORS[i % OPP_COLORS.length], width: 1.2,
            });
        });

        chartPrice.drawLines(priceSeries, { padPct: 0.1, xmax: 30 });
        chartCash.drawLines(cashSeries, { showZero: true, padPct: 0.1, xmax: 30 });
    }

    // ---------- Game loop ----------
    function startGame() {
        const costTier = $('cfg-cost-tier').value;
        const difficulty = $('cfg-difficulty').value;
        const mood = $('cfg-market').value;
        const cfg = makeMarketCfg(costTier, difficulty, mood);
        market = new Market(cfg);
        gameOver = false;

        $('setup-panel').hidden = true;
        $('game-panel').hidden = false;
        $('chart-panel').hidden = false;
        $('gameover-panel').hidden = true;

        // range 上下限依 tier 調整
        const tier = COST_TIERS[costTier];
        const priceEl = $('dec-price');
        priceEl.min = Math.floor(tier.cost * 1.1);
        priceEl.max = Math.ceil(tier.cost * 5);
        const qtyEl = $('dec-qty');
        qtyEl.max = tier.capacity;

        renderMineCard();
        renderOpponents();
        renderDecisionDefaults();
        updateHeader();
        renderCharts();
        $('day-log').innerHTML = '<p class="log-empty">按「確認決策 → 開店」跑 Day 1。</p>';
        $('suggest-body').textContent = '按下「AI 建議」看它會怎麼決定';
        $('btn-apply-suggest').hidden = true;
    }

    function confirmDay() {
        if (!market || gameOver) return;
        const price = parseFloat($('dec-price').value);
        const qty = parseInt($('dec-qty').value, 10);
        // 每天靜默算一份 AI 建議（不管玩家有沒有按按鈕），記下差值
        // 用來畫學習曲線：前 10 天平均差 vs 後 10 天平均差 = 直覺是否收斂到 AI
        const aiSug = computeAISuggestion();
        market.decisionLog.push({
            day: market.day + 1,   // 這天決策要跑的那一天
            playerPrice: price,
            aiPrice: aiSug.price,
            playerQty: qty,
            aiQty: aiSug.qty,
        });
        market.player.setPrice(price);
        market.player.setPlannedQuantity(qty);

        const rec = market.stepOneDay();
        logDay(rec);
        renderMineCard();
        renderOpponents();
        updateHeader();
        renderCharts();

        // Check game state
        const aliveOpp = market.opponents.filter(o => !o.closed).length;
        if (rec.playerClosed) {
            endGame('lose_bankrupt');
        } else if (aliveOpp === 0) {
            endGame('win_last_standing');
        } else if (market.day >= 30) {
            endGame('win_survived');
        } else {
            renderDecisionDefaults();
            $('suggest-body').textContent = '按下「AI 建議」看它會怎麼決定';
            $('btn-apply-suggest').hidden = true;
        }
    }

    // 分析整場：找本金峰值日 + 最慘單日 + 學習曲線（前後半段 vs AI 建議的差距）
    function analyzeRun() {
        const history = market.player.history;
        const decLog = market.decisionLog;
        if (history.length === 0) return null;

        // 峰值日：cumulativeProfit 最高的那天（拐點候選——之後如果一路下滑，這就是「由升轉降」的點）
        let peakIdx = 0, peak = history[0].cumulativeProfit;
        for (let i = 1; i < history.length; i++) {
            if (history[i].cumulativeProfit > peak) {
                peak = history[i].cumulativeProfit;
                peakIdx = i;
            }
        }
        // 最慘單日：profit 最低的那天（單日決策失誤最痛的一次）
        let worstIdx = 0, worst = history[0].profit;
        for (let i = 1; i < history.length; i++) {
            if (history[i].profit < worst) {
                worst = history[i].profit;
                worstIdx = i;
            }
        }
        const peakDay = history[peakIdx].day;
        const worstDay = history[worstIdx].day;
        const findDec = d => decLog.find(x => x.day === d) || null;

        // 學習曲線：前半段 vs 後半段的平均 |價差|、|量差|
        // 收斂 = 越玩越靠近 AI；發散 = 越玩越信自己（不一定壞）
        const N = decLog.length;
        const half = Math.max(1, Math.floor(N / 2));
        const avgAbsDelta = (from, to, key1, key2) => {
            const slice = decLog.slice(from, to);
            if (slice.length === 0) return 0;
            return slice.reduce((s, d) => s + Math.abs(d[key1] - d[key2]), 0) / slice.length;
        };
        const early = {
            price: avgAbsDelta(0, half, 'playerPrice', 'aiPrice'),
            qty:   avgAbsDelta(0, half, 'playerQty',   'aiQty'),
            n: half,
        };
        const late = {
            price: avgAbsDelta(half, N, 'playerPrice', 'aiPrice'),
            qty:   avgAbsDelta(half, N, 'playerQty',   'aiQty'),
            n: N - half,
        };

        return {
            peakDay, peakCash: peak, peakDec: findDec(peakDay), peakProfit: history[peakIdx].profit,
            worstDay, worstProfit: worst, worstDec: findDec(worstDay),
            endCash: history[history.length - 1].cumulativeProfit,
            early, late,
            fellFromPeak: history[history.length - 1].cumulativeProfit < peak,
        };
    }

    function renderAnalysisHTML(a) {
        if (!a) return '';
        const decStr = d => d
            ? `你定 $${fmt(d.playerPrice, 1)} / 烤 ${d.playerQty} 個（AI 當時建議 $${fmt(d.aiPrice, 1)} / ${d.aiQty} 個）`
            : '（無決策紀錄）';
        // 學習曲線判讀：因果中性 —— delta 縮小可能是你動、也可能是 AI 跟著市場動
        // 需要至少 4 天樣本才切前半 / 後半；否則 fallback 講清楚為什麼沒得判
        let curveVerdict;
        const N = a.early.n + a.late.n;
        if (a.late.n < 2 || a.early.n < 2) {
            curveVerdict = `<span class="analysis-sub">（只跑 ${N} 天，樣本不足——4 天以上才切得出前半 / 後半的差距趨勢）</span>`;
        } else {
            const priceConv = a.late.price < a.early.price - 0.5;
            const priceDiv = a.late.price > a.early.price + 0.5;
            if (priceConv) curveVerdict = `<b class="tag-good">收斂 ↘</b>：跟 AI 建議價的差距在縮小（前半平均差 $${fmt(a.early.price, 1)} → 後半 $${fmt(a.late.price, 1)}）。可能是你在調整、也可能是 AI 跟著市場移動——看本金曲線判斷是哪一種。`;
            else if (priceDiv) curveVerdict = `<b>發散 ↗</b>：跟 AI 建議價的差距在拉大（$${fmt(a.early.price, 1)} → $${fmt(a.late.price, 1)}）。可能是你發現「AI 只是啟發式、不是聖旨」，也可能是走偏了——看本金圖判定。`;
            else curveVerdict = `<b>穩定</b>：整場跟 AI 的差距差不多（$${fmt(a.early.price, 1)} → $${fmt(a.late.price, 1)}）。`;
        }
        // 峰值日語意：Day 1 是特殊 case——峰值 = 種子 + Day 1 淨利，之後一路陰乾
        let peakLine;
        if (a.peakDay === 1) {
            peakLine = `<b>本金峰值：Day 1，本金 $${fmt(a.peakCash, 1)}</b>（= 種子 $100 + Day 1 淨利 $${fmt(a.peakProfit, 1)}）——<b class="tag-bad">你從 Day 2 起就沒再賺過錢</b>，這一場「一開始就走錯」，不是後來崩掉。`;
        } else if (a.fellFromPeak) {
            peakLine = `<b>本金峰值：Day ${a.peakDay}，本金 $${fmt(a.peakCash, 1)}</b>（之後開始下滑——這就是拐點）`;
        } else {
            peakLine = `<b>本金峰值：Day ${a.peakDay}，本金 $${fmt(a.peakCash, 1)}</b>（一路走高到最後——沒有拐點）`;
        }
        return `
            <h3>📊 這一場的回顧</h3>
            <ul>
                <li>${peakLine}<br>
                    <span class="analysis-sub">那天決策：${decStr(a.peakDec)}</span></li>
                <li><b>最慘單日：Day ${a.worstDay}，那天淨利 <span class="tag-bad">$${fmt(a.worstProfit, 1)}</span></b><br>
                    <span class="analysis-sub">那天決策：${decStr(a.worstDec)}</span></li>
                <li><b>學習曲線</b>（vs AI 建議價）：${curveVerdict}</li>
            </ul>
        `;
    }

    function endGame(outcome) {
        gameOver = true;
        $('decision-panel').hidden = true;
        const panel = $('gameover-panel');
        panel.hidden = false;
        panel.classList.remove('win');
        const p = market.player;
        const aliveOpp = market.opponents.filter(o => !o.closed).length;
        const closedOpp = market.opponents.length - aliveOpp;
        const analysis = renderAnalysisHTML(analyzeRun());

        let title, body;
        if (outcome === 'lose_bankrupt') {
            title = `💀 破產 · Day ${market.day}`;
            body = `
                <p>你的本金花光了。<b>$${fmt(p.cumulativeProfit, 1)}</b>。</p>
                <p>還有 <b>${aliveOpp}</b> 家對手撐著。</p>
                ${analysis}
                <p><b>教訓：</b>「賺最多」不是遊戲目標，「撐下去」才是。價格訂太低會被成本壓死；訂太高會被對手搶客；烤太多會廢；烤太少會流失客源。真實的經營者面對的就是這種<b>資訊不完全的多目標平衡</b>。</p>
            `;
        } else if (outcome === 'win_last_standing') {
            title = `👑 Last One Standing · Day ${market.day}`;
            panel.classList.add('win');
            body = `
                <p>所有 <b>${market.opponents.length}</b> 家對手都倒了。你活到 Day ${market.day}，本金 <b>$${fmt(p.cumulativeProfit, 1)}</b>。</p>
                <p><b>你贏了。</b></p>
                ${analysis}
                <p><b>心得：</b>你不需要每天都是最便宜的、也不需要每天都賺最多。你只需要「不倒」。這叫 <i>survivorship</i>。</p>
            `;
        } else {
            title = `🏆 撐過 30 天！`;
            panel.classList.add('win');
            body = `
                <p>你活到 Day 30，本金 <b>$${fmt(p.cumulativeProfit, 1)}</b>，還有 <b>${aliveOpp}</b> 家對手活著（<b>${closedOpp}</b> 家倒了）。</p>
                <p><b>你贏了。</b></p>
                ${analysis}
                <p><b>反思：</b>你這 30 天的定價 / 產量策略如果都套到明天，還能繼續嗎？看上面的峰值日跟最慘日——你的高峰是哪來的、你的低谷又踩到什麼陷阱？</p>
            `;
        }
        $('gameover-title').textContent = title;
        $('gameover-body').innerHTML = body;
    }

    function restart() {
        $('setup-panel').hidden = false;
        $('game-panel').hidden = true;
        $('chart-panel').hidden = true;
        $('gameover-panel').hidden = true;
        market = null;
        gameOver = false;
    }

    // ---------- Wire up ----------
    function initUI() {
        $('btn-start').addEventListener('click', startGame);
        $('btn-confirm').addEventListener('click', confirmDay);
        $('btn-ai-suggest').addEventListener('click', renderAISuggestion);
        $('btn-apply-suggest').addEventListener('click', applyAISuggestion);
        $('btn-restart').addEventListener('click', restart);
        $('dec-price').addEventListener('input', e => {
            $('dec-price-val').textContent = '$' + fmt(parseFloat(e.target.value), 1);
        });
        $('dec-qty').addEventListener('input', e => {
            $('dec-qty-val').textContent = e.target.value + ' 個';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
