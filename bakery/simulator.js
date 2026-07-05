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

    // ---------- Consumer (Phase 2：客群分型 + 熟客累積) ----------
    // 消費者兩種類型：'budget' 基礎型 / 'premium' 精品型
    // - budget（60%）：期望價低、比較容易被市場價拉走（追低價）、消耗快、對價格敏感
    // - premium（40%）：期望價高、心理錨很穩不追低價、消耗慢、對品牌信任敏感
    // 每個消費者對「每一家店」都有獨立的 loyalty 計數，每次成功購買 +1，每天衰減 3%
    // loyalty 影響兩件事：(a) 抬高該店的價格容忍上限（品牌溢價）、(b) 提高該店訪問權重（熟客回訪）
    class Consumer {
        constructor(id, baseWtp, baseAlpha, type = 'budget') {
            this.id = id;
            this.type = type;
            this.energy = randInt(40, 90);
            // Type-specific 分佈：精品型 baseline 高、變異大；基礎型 baseline 低
            if (type === 'premium') {
                this.expected = baseWtp * rand(1.10, 1.45);   // baseWtp=42 → $46-61
                this.confidence = rand(0.95, 1.20);
                this.alpha = baseAlpha * rand(0.5, 0.9);      // 消耗慢 = 一頓可以吃 2-3 個精品
            } else {
                this.expected = baseWtp * rand(0.65, 1.00);   // baseWtp=42 → $27-42
                this.confidence = rand(0.80, 1.10);
                this.alpha = baseAlpha * rand(0.9, 1.3);      // 消耗快 = 吃 1 個就飽
            }
            this.maxWtp = this.expected * rand(1.2, 1.9);
            this.dailyNeed = randInt(1, 3);
            this.budget = rand(60, 180);
            this.bought = 0;
            this.slowExpected = this.expected;
            this.pricesSeenToday = [];
            this.fatigue = 0;
            this.strikingDays = 0;
            this.priceMemoryToday = {};
            this.preferredPidYesterday = null;
            // 熟客記憶：每家店的累計成交次數（每次購買 +1，每天衰減 3%）
            // 影響：(a) 決策時對該店價格容忍度 +0.5%/次、(b) 選店時該店權重 ×(1 + 0.02×loyalty)
            this.loyalty = {};
        }

        marginalUtility() { return Math.exp(-this.alpha * this.bought); }

        // decide 現在需要 pid：熟客加成是「對這家店」的價格容忍
        decide(price, pid, panicMult = 1) {
            const mu = this.marginalUtility();
            if (price > this.budget) return false;
            if (price > this.maxWtp * mu * panicMult) return false;
            // 熟客加成：每次熟客 +1.0% 容忍度，10 次熟客 = 抬 10%（原本 0.5% 效果太弱）
            // 意義：品牌信任讓消費者接受該店慢慢漲價，但漲太快還是會流失
            const loyaltyBonus = 1 + 0.010 * (this.loyalty[pid] || 0);
            let cap = this.expected * this.confidence * mu * panicMult * loyaltyBonus;
            if (this.energy < 25) cap *= 1.4;
            else if (this.energy < 45) cap *= 1.15;
            const noise = 1 + (Math.random() - 0.5) * 0.1;
            return price <= cap * noise;
        }

        buy(price, pid) {
            this.budget -= price;
            this.energy = clamp(this.energy + 25, 0, 100);
            this.bought += 1;
            this.loyalty[pid] = (this.loyalty[pid] || 0) + 1;
        }

        endDay(ownPrice, gossipPrice, patienceThreshold) {
            const hasOwn = ownPrice !== null && Number.isFinite(ownPrice);
            const hasGossip = gossipPrice !== null && Number.isFinite(gossipPrice);
            // Type-specific 錨定漂移權重：
            //   budget：慣性 0.6，跟市場走（原本行為）
            //   premium：慣性 0.96 + 資訊過濾——低於 expected × 0.55 的價格「不是我心目中的
            //     麵包」，不採納。這樣 9 天的複利漂移從 50→38 變成 50→46。
            let wI, wO, wG;
            let effectiveHasOwn = hasOwn, effectiveHasGossip = hasGossip;
            let effectiveOwn = ownPrice, effectiveGossip = gossipPrice;
            if (this.type === 'premium') {
                // 精品客過濾：< expected × 0.55 的觀察視為「非相關品類」拒絕採納
                // 意義：精品客在夜市看到 $20 攤位不會覺得「原來麵包這麼便宜」，
                //       他會覺得「那不是我要的東西」——心理錨完全隔離
                const threshold = this.expected * 0.55;
                if (hasOwn && ownPrice < threshold) { effectiveHasOwn = false; effectiveOwn = null; }
                if (hasGossip && gossipPrice < threshold) { effectiveHasGossip = false; effectiveGossip = null; }
                wI = 0.96;
                wO = effectiveHasOwn ? 0.03 : 0;
                wG = effectiveHasGossip ? 0.01 : 0;
            } else {
                wI = 0.60;
                wO = hasOwn ? 0.20 : 0;
                wG = hasGossip ? 0.20 : 0;
            }
            const total = wI + wO + wG;
            let updated = (wI / total) * this.expected;
            if (effectiveHasOwn) updated += (wO / total) * effectiveOwn;
            if (effectiveHasGossip) updated += (wG / total) * effectiveGossip;
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
                let bestGap = Infinity, bestPid = null;
                for (const pid of pids) {
                    const gap = Math.abs(this.priceMemoryToday[pid] - this.expected);
                    if (gap < bestGap) {
                        bestGap = gap;
                        bestPid = Number(pid);
                    }
                }
                this.preferredPidYesterday = bestPid;
            }
            this.priceMemoryToday = {};
            // 熟客衰減：3%/天，久沒回訪的店會淡出記憶（<0.5 直接刪掉）
            for (const pid in this.loyalty) {
                this.loyalty[pid] *= 0.97;
                if (this.loyalty[pid] < 0.5) delete this.loyalty[pid];
            }
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
            // Day 1 保守探路：capacity/5（跟 AI 給玩家的 Day 1 建議對稱）
            // 原本 ceil(capacity/2) 讓對手一次砸產能一半的成本，Day 1 常被便宜對手拉光
            // 客戶就直接虧 -$150~-$200 → 破 -$50 促銷底線 → 一開場就倒
            this.plannedQuantity = Math.max(2, Math.round(capacity / 5));
            this.cumulativeProfit = 100;
            this.closed = false;
            this.closedDay = null;
            this.promoDaysLeft = 0;
            this.promoMultiplier = 1.0;
            this.hasUsedPromo = false;
            this.lastProfit = 0;
            // 稀缺信號：昨天是否搶爆？（sold = baked 且 baked >= 3）
            // 訊號公開——每個店主早上一看隔壁昨天完售就知道
            // 隔天訪客用 segmentation 加權時 wasHot 店 ×1.35，等於「大家慕名而來」
            this.wasHot = false;
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

        // 判定：昨天是否搶爆 = 完售 + 烤量夠有意義（>=3）
        // player 跟 AI 共用；player 得到熱門加成也是合理的（真實開店也一樣）
        _updateHotStatus() {
            this.wasHot = !this.closed
                && this.plannedQuantity >= 3
                && this.soldToday >= this.plannedQuantity;
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
                this.wasHot = false;
                this.history.push({
                    day, price: this.price, baked: 0,
                    sold: 0, wasted: 0, revenue: 0, productionCost: 0,
                    profit: 0, cumulativeProfit: this.cumulativeProfit, closed: true,
                });
                return;
            }
            this._updateHotStatus();   // 用 today 的 soldToday/planned 決定「今日搶爆」
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
                this.wasHot = false;
                this.history.push({
                    day, price: this.price, baked: 0,
                    sold: 0, wasted: 0, revenue: 0, productionCost: 0,
                    profit: 0, cumulativeProfit: this.cumulativeProfit, closed: true,
                });
                return;
            }
            this._updateHotStatus();
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
                (_, i) => new Consumer(
                    i, cfg.baseWtp, cfg.alpha,
                    Math.random() < (cfg.premiumRatio || 0.40) ? 'premium' : 'budget'
                ));
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

        // 選店偏好加權（Phase 2 三合一）：
        //   (a) 期望價匹配：exp(-|expected - shop_price| / 10)
        //   (b) 熟客回訪：權重 × (1 + 0.02 × loyalty[shop.id])，20 次熟客 = 訪問權重 ×1.4
        //   (c) 稀缺信號：wasHot 店 × 1.35，昨天搶爆的店今天吸引額外注意
        _pickShopWeighted(consumer, openShops) {
            if (openShops.length === 1) return openShops[0];
            const weights = openShops.map(shop => {
                const gap = Math.abs(consumer.expected - shop.effectivePrice());
                let w = Math.exp(-gap / 10);
                const loyalty = consumer.loyalty[shop.id] || 0;
                w *= (1 + 0.02 * loyalty);
                if (shop.wasHot) w *= 1.35;
                return w;
            });
            const sum = weights.reduce((s, w) => s + w, 0);
            if (sum <= 0) return openShops[randInt(0, openShops.length - 1)];
            let r = Math.random() * sum;
            for (let i = 0; i < openShops.length; i++) {
                r -= weights[i];
                if (r <= 0) return openShops[i];
            }
            return openShops[openShops.length - 1];
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
            const sceneEvents = [];   // 給 BakeryScene 動畫用
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
                    if (round === 0 && c.preferredPidYesterday !== null && Math.random() < 0.30) {
                        const memP = open.find(x => x.id === c.preferredPidYesterday);
                        if (memP) p = memP;
                    }
                    if (!p) p = this._pickShopWeighted(c, open);
                    const price = p.offer();
                    if (price === null) continue;

                    const bought = c.decide(price, p.id, panicMult);
                    c.observePrice(price, p.id);
                    p.visitsToday = (p.visitsToday || 0) + 1;

                    sceneEvents.push({
                        round, cid: c.id, pid: p.id,
                        consumerType: c.type,
                        price, bought,
                    });

                    if (bought) {
                        p.sell();
                        c.buy(price, p.id);
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
                playerVisits: this.player.visitsToday || 0,
                playerBaked: this.player.plannedQuantity,
                playerProfit: this.player.lastProfit,
                playerCumulative: this.player.cumulativeProfit,
                playerClosed: this.player.closed,
                trades: trades.length,
                sceneEvents,
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

    // ---------- BakeryScene（Phase 3：店員視角動畫） ----------
    // 5 間店橫排、玩家永遠在中間、店面精緻度依 cost tier、
    // 客人分色（premium 金 / budget 藍）、對話泡泡「$40 買！」or「$40 太貴」
    // 動畫結束後 fire onFinish callback，讓 UI 顯示結算並等玩家按下一天
    class BakeryScene {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this._resize();
            // 每個客人的總時長（ms）；5 個 phase 依比例分配
            // 現在跑真實全數事件（一天 50-150 個），預設調快到 500ms 讓一天 25-75 秒
            // 100ms = 極快 flash by、500ms = 預設、2000ms = 慢慢看每個決策
            this.perCustomerMs = 500;
            this.rafId = null;
            this.market = null;
            this.events = [];       // 依序播放的事件佇列
            this.eventIdx = 0;
            this.phaseStartAt = 0;
            this.phase = 0;         // 0=進門 1=詢價 2=答覆 3=評估 4=決策 5=離開
            this.playing = false;
            this.paused = false;
            this._pausedAt = 0;
            this.onFinish = null;
            this._t0 = 0;
        }

        _resize() {
            const canvas = this.canvas;
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth || canvas.getAttribute('width') || 920;
            const h = canvas.clientHeight || canvas.getAttribute('height') || 360;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);
            this.w = +w;
            this.h = +h;
        }

        setPerCustomerMs(ms) { this.perCustomerMs = Math.max(80, Math.min(15000, +ms || 500)); }
        setMarket(m) { this.market = m; }

        // 動畫中暫停：凍結 t、cancelAnimationFrame，狀態全保留
        pause() {
            if (!this.playing || this.paused) return;
            this.paused = true;
            this._pausedAt = performance.now();
            if (this.rafId) cancelAnimationFrame(this.rafId);
        }

        // 繼續：暫停期間的 wall-clock 時間補回 _t0，恢復 _loop
        resume() {
            if (!this.playing || !this.paused) return;
            const pausedDuration = performance.now() - this._pausedAt;
            this._t0 += pausedDuration;
            this.paused = false;
            this._loop();
        }

        isPaused() { return this.paused; }

        // Producer id → 螢幕 position（左到右 0..4），玩家（id=0）永遠在中間 index=2
        _slotOf(pid) {
            if (pid === 0) return 2;
            return pid <= 2 ? pid - 1 : pid;   // opp 1→0, 2→1, 3→3, 4→4
        }

        _shopBox(slot) {
            const marginX = 20;
            const totalW = this.w - 2 * marginX;
            const gap = 10;
            const shopW = (totalW - 4 * gap) / 5;
            const x = marginX + slot * (shopW + gap);
            const y = this.h * 0.22;      // 店往上挪，讓下方 60px 擺 name/price/stats
            const shopH = this.h * 0.55;  // 縮矮，shop bottom = 0.77，ground 在 0.94
            return { x, y, w: shopW, h: shopH };
        }

        // 依 cost tier 畫不同精緻度的店面
        _drawShop(producer) {
            const { ctx } = this;
            const slot = this._slotOf(producer.id);
            const b = this._shopBox(slot);
            const cost = producer.initialCost;
            const isPlayer = producer.id === 0;

            // Cost tier: <22 = 陋店、22-30 = 中檔、>=30 = 精品
            // 精品店身色改成深奶油（原本 #fef3c7 跟天空背景撞色，變隱形）
            let bodyColor, roofColor, awningColor, ornate;
            if (cost < 22) {
                bodyColor = '#a8825a'; roofColor = '#7c5c3b'; awningColor = null; ornate = false;
            } else if (cost < 30) {
                bodyColor = '#e0c9a6'; roofColor = '#8b5e3c'; awningColor = '#c53030'; ornate = false;
            } else {
                bodyColor = '#f4a460'; roofColor = '#7c2d12'; awningColor = '#78350f'; ornate = true;
            }

            // 屋頂三角
            ctx.fillStyle = roofColor;
            ctx.beginPath();
            ctx.moveTo(b.x - 4, b.y + 10);
            ctx.lineTo(b.x + b.w / 2, b.y - 4);
            ctx.lineTo(b.x + b.w + 4, b.y + 10);
            ctx.closePath();
            ctx.fill();

            // 主體
            ctx.fillStyle = bodyColor;
            ctx.fillRect(b.x, b.y + 8, b.w, b.h - 8);
            ctx.strokeStyle = isPlayer ? '#f97316' : '#4b2e10';
            ctx.lineWidth = isPlayer ? 4 : 2;
            ctx.strokeRect(b.x, b.y + 8, b.w, b.h - 8);
            // 玩家店額外「你在這」箭頭
            if (isPlayer) {
                ctx.font = '18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#f97316';
                ctx.fillText('▼', b.x + b.w / 2, b.y + 4);
            }

            // 遮陽篷（中/高檔才有）
            if (awningColor) {
                ctx.fillStyle = awningColor;
                const aw = b.w * 0.85;
                const ax = b.x + (b.w - aw) / 2;
                const ay = b.y + 14;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax + aw, ay);
                ctx.lineTo(ax + aw - 8, ay + 12);
                ctx.lineTo(ax + 8, ay + 12);
                ctx.closePath();
                ctx.fill();
                // 條紋
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                for (let i = 1; i < 5; i++) {
                    const sx = ax + (aw * i / 5);
                    ctx.beginPath();
                    ctx.moveTo(sx, ay);
                    ctx.lineTo(sx - 4, ay + 12);
                    ctx.stroke();
                }
            }

            // 窗（精品店窗較大 + 金框）
            const winY = b.y + 32;
            const winH = b.h * 0.35;
            const winW = b.w * 0.55;
            const winX = b.x + (b.w - winW) / 2;
            ctx.fillStyle = '#fef9c3';
            ctx.fillRect(winX, winY, winW, winH);
            if (ornate) {
                ctx.strokeStyle = '#d97706';
                ctx.lineWidth = 2;
                ctx.strokeRect(winX, winY, winW, winH);
                // 十字窗櫺
                ctx.beginPath();
                ctx.moveTo(winX + winW / 2, winY);
                ctx.lineTo(winX + winW / 2, winY + winH);
                ctx.moveTo(winX, winY + winH / 2);
                ctx.lineTo(winX + winW, winY + winH / 2);
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#78350f';
                ctx.lineWidth = 1;
                ctx.strokeRect(winX, winY, winW, winH);
            }

            // 麵包 emoji 在窗內：優先讀 live _shopStats（動畫進行中隨事件更新），
            // 沒有就 fallback 到 history[last] 靜態值
            const stats = this._shopStats ? this._shopStats.get(producer.id) : null;
            const last = producer.history.length > 0 ? producer.history[producer.history.length - 1] : null;
            const bakedToday = stats ? stats.baked : (last ? last.baked : 0);
            const remaining = stats ? stats.remaining : (last ? last.wasted : 0);
            ctx.font = `${Math.floor(winH * 0.4)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const breadCount = Math.min(3, Math.max(0, remaining));
            const label = producer.closed ? '💀'
                : bakedToday === 0 ? '（未烤）'
                : remaining === 0 ? '（售完）'
                : '🥐'.repeat(breadCount);
            ctx.fillStyle = producer.closed ? '#991b1b' : '#78350f';
            ctx.fillText(label, winX + winW / 2, winY + winH / 2);

            // 門
            const doorW = b.w * 0.22;
            const doorH = b.h * 0.35;
            const doorX = b.x + (b.w - doorW) / 2;
            const doorY = b.y + b.h - doorH;
            ctx.fillStyle = '#78350f';
            ctx.fillRect(doorX, doorY, doorW, doorH);
            if (ornate) {
                ctx.fillStyle = '#d97706';
                ctx.beginPath();
                ctx.arc(doorX + doorW - 4, doorY + doorH / 2, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // 招牌 & 價格
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = `700 ${isPlayer ? 12 : 11}px sans-serif`;
            ctx.fillStyle = isPlayer ? '#f97316' : '#78350f';
            const name = isPlayer ? '🥐 我的店' : producer.label.replace(/^對手 /, '').replace(/\s·.*$/, '');
            ctx.fillText(name, b.x + b.w / 2, b.y + b.h + 4);
            ctx.font = `800 14px ui-monospace, SFMono-Regular, monospace`;
            ctx.fillStyle = producer.closed ? '#991b1b' : '#b45309';
            ctx.fillText(producer.closed ? `倒 D${producer.closedDay}` : `$${producer.effectivePrice().toFixed(0)}`, b.x + b.w / 2, b.y + b.h + 18);

            // 帳本：烤 X 賣 Y 剩 Z · 訪 V —— live counters（隨動畫更新）
            if (!producer.closed && bakedToday > 0) {
                ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
                ctx.fillStyle = '#4b2e10';
                ctx.textBaseline = 'top';
                const soldToday = stats ? stats.sold : (last ? last.sold : 0);
                const visits = stats ? stats.visits : (producer.visitsToday || 0);
                ctx.fillText(`烤${bakedToday} 賣${soldToday} 剩${remaining}`, b.x + b.w / 2, b.y + b.h + 34);
                ctx.fillText(`訪客 ${visits} 人`, b.x + b.w / 2, b.y + b.h + 46);
            }

            // 🔥 badge 精品店 signaling
            if (producer.wasHot && !producer.closed) {
                ctx.font = '18px sans-serif';
                ctx.fillText('🔥', b.x + b.w - 14, b.y + 4);
            }
        }

        _drawStaticBackground() {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            // 明確畫天空（藍白漸層），不再靠 CSS 背景色——canvas 自己主導
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.94);
            skyGrad.addColorStop(0, '#bae6fd');
            skyGrad.addColorStop(0.6, '#e0f2fe');
            skyGrad.addColorStop(1, '#fef3c7');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h * 0.94);
            // 地面
            ctx.fillStyle = '#a8825a';
            ctx.fillRect(0, h * 0.94, w, h * 0.06);
            // 街道虛線
            ctx.strokeStyle = '#fef3c7';
            ctx.setLineDash([8, 6]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, h * 0.97);
            ctx.lineTo(w, h * 0.97);
            ctx.stroke();
            ctx.setLineDash([]);
            // 5 shops
            if (this.market) {
                for (const p of this.market.producers) this._drawShop(p);
            }
        }

        // 每個客人 5 個 phase，按 perCustomerMs 依比例分配
        // 比例：進門 20% / 詢價 15.6% / 答覆 15.6% / 評估 15.6% / 決策 22.2% / 離開 11.1%
        _phaseDurations() {
            const total = this.perCustomerMs;
            const props = [0.20, 0.156, 0.156, 0.156, 0.222, 0.111];
            return props.map(p => p * total);
        }

        animateDay(dayNumber, events, onFinish) {
            this._resize();
            this.onFinish = onFinish;
            this.playing = true;
            this.paused = false;
            this._dayNumber = dayNumber;
            // Fix C：用真實全部事件，不再抽樣（原本混池抽 7 個玩家店期望值只 0.5-1 個代表）
            // 事件已在 stepOneDay 依 round + shopOrder 排好，直接播放就是真實一天流程
            this.events = events.slice();
            this.eventIdx = 0;
            this.phase = 0;
            this.phaseStartAt = 0;
            this._t0 = performance.now();

            // Live counters：動畫開始 = 剩滿、賣 0、訪 0
            // 每個 phase 完成時更新（進門完 → visits+1；決策完 & bought → sold+1、remaining-1）
            // 動畫結束時 snap 到當日真實總數（sample 只有 7 個事件，數字會落後真實日）
            this._shopStats = new Map();
            for (const p of this.market.producers) {
                const last = p.history.length > 0 ? p.history[p.history.length - 1] : {};
                const baked = last.baked || 0;
                this._shopStats.set(p.id, {
                    baked,
                    finalSold: last.sold || 0,
                    finalWasted: last.wasted || 0,
                    finalVisits: p.visitsToday || 0,
                    remaining: baked,
                    sold: 0,
                    visits: 0,
                });
            }

            this._loop();
        }

        // 動畫結束時 live counters 對齊到當日真實全日總數
        _snapStatsToFinal() {
            if (!this._shopStats) return;
            for (const [pid, s] of this._shopStats) {
                s.remaining = s.finalWasted;
                s.sold = s.finalSold;
                s.visits = s.finalVisits;
            }
        }

        skip() {
            this.playing = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            // 快轉時也 snap 到真實總數，讓玩家在結算前看到最終店況
            this._snapStatsToFinal();
            this._drawStaticBackground();
            if (this.onFinish) this.onFinish();
        }

        _loop() {
            if (!this.playing || this.paused) return;
            const now = performance.now();
            const t = now - this._t0;

            // 沒事件 → 結束
            if (this.events.length === 0) {
                this._snapStatsToFinal();
                this._drawStaticBackground();
                this.playing = false;
                if (this.onFinish) this.onFinish();
                return;
            }

            const ev = this.events[this.eventIdx];
            const phaseDur = this._phaseDurations();
            const phaseElapsed = t - this.phaseStartAt;
            const phaseT = Math.min(1, phaseElapsed / phaseDur[this.phase]);

            // Fix C：事件是真實全數，counter 直接跟事件同步累加
            // 動畫演完 = counter 自然等於 finalXxx，數字跟結算完全一致
            // 累加時機在 phase 結束判斷處（進門完 → visits+1、決策完+bought → sold+1）
            this._drawStaticBackground();

            const slot = this._slotOf(ev.pid);
            const box = this._shopBox(slot);
            const doorX = box.x + box.w / 2;
            const doorY = box.y + box.h - 15;
            const startX = doorX < this.w / 2 ? 20 : this.w - 20;
            const startY = this.h * 0.94;

            // 依 phase 畫客人 + 泡泡
            this._renderCustomer(ev, this.phase, phaseT, startX, startY, doorX, doorY, box);

            // Day label + 客人計數
            const ctx = this.ctx;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = '700 14px sans-serif';
            ctx.fillStyle = '#78350f';
            ctx.fillText(`Day ${this._dayNumber}`, 12, 10);
            ctx.font = '600 12px sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText(`客人 ${this.eventIdx + 1} / ${this.events.length}`, 12, 30);
            ctx.textAlign = 'right';
            const phaseNames = ['進門', '詢價', '店員答覆', '評估', '決策', '離開'];
            ctx.fillText(phaseNames[this.phase], this.w - 12, 30);

            // Phase 結束 → 累加 shop stats + 下一個 phase 或下一個客人
            if (phaseElapsed >= phaseDur[this.phase]) {
                this._updateStatsOnPhaseComplete(ev, this.phase);
                this.phase += 1;
                this.phaseStartAt = t;
                if (this.phase >= phaseDur.length) {
                    this.eventIdx += 1;
                    this.phase = 0;
                    if (this.eventIdx >= this.events.length) {
                        // 動畫跑完：progress=1 自然導向 finalXxx 值，再 snap 一次防捨入誤差
                        this._snapStatsToFinal();
                        this._drawStaticBackground();
                        this.playing = false;
                        if (this.onFinish) this.onFinish();
                        return;
                    }
                }
            }

            this.rafId = requestAnimationFrame(() => this._loop());
        }

        // Fix C：事件觸發累加（events 現在是真實全數，累加終值 = finalXxx）
        // phase 0 進門完 → visits+1
        // phase 4 決策完 + bought → sold+1、remaining-1
        _updateStatsOnPhaseComplete(ev, phase) {
            if (!this._shopStats) return;
            const s = this._shopStats.get(ev.pid);
            if (!s) return;
            if (phase === 0) {
                s.visits += 1;
            } else if (phase === 4 && ev.bought) {
                s.sold += 1;
                s.remaining = Math.max(0, s.remaining - 1);
            }
        }

        // Legacy 保留（skip 邏輯萬一 shopStats 累加沒完成時用來對齊）
        _updateStatsFromProgress_UNUSED(progress) {
            if (!this._shopStats) return;
            for (const [pid, s] of this._shopStats) {
                s.visits = Math.round(progress * s.finalVisits);
                s.sold = Math.round(progress * s.finalSold);
                s.remaining = Math.max(0, s.baked - s.sold);
            }
        }

        _renderCustomer(ev, phase, phaseT, startX, startY, doorX, doorY, box) {
            const ctx = this.ctx;
            const isPremium = ev.consumerType === 'premium';
            let cx, cy, alpha = 1;

            if (phase === 0) {
                // 進門：從街道走向店門
                cx = startX + (doorX - startX) * phaseT;
                cy = startY + (doorY - startY) * phaseT - Math.sin(phaseT * Math.PI) * 10;
            } else if (phase === 5) {
                // 離開：反方向走，淡出
                const exitX = doorX + (startX - doorX) * phaseT;
                const exitY = doorY + (startY - doorY) * phaseT;
                cx = exitX; cy = exitY;
                alpha = 1 - phaseT;
            } else {
                // 詢價 / 答覆 / 評估 / 決策：站在店門口
                cx = doorX;
                cy = doorY;
            }

            // 畫客人
            ctx.save();
            ctx.globalAlpha = alpha;
            this._drawConsumerBody(cx, cy, isPremium);
            ctx.restore();

            // Phase-specific 泡泡
            if (phase === 1) {
                // 詢價：客人上方彈出「多少錢？」
                this._drawSpeechBubble(cx, cy - 24, '多少錢？', 'ask', phaseT);
            } else if (phase === 2) {
                // 店員答覆：店的窗子上方彈出價格
                this._drawSpeechBubble(box.x + box.w / 2, box.y - 10, `$${ev.price.toFixed(0)} / 個`, 'shop', phaseT);
            } else if (phase === 3) {
                // 評估：客人上方思考氣泡
                const expected = isPremium ? '嗯…我期望 $50 左右' : '嗯…$30 我心裡有數';
                this._drawThoughtBubble(cx, cy - 24, expected, phaseT);
            } else if (phase === 4) {
                // 決策：綠買 or 紅拒
                const text = ev.bought ? `$${ev.price.toFixed(0)} ✓ 買！` : `$${ev.price.toFixed(0)} ✗ 太貴`;
                this._drawSpeechBubble(cx, cy - 24, text, ev.bought ? 'good' : 'bad', phaseT);
                // 買了 → 手上多一個麵包 emoji
                if (ev.bought && phaseT > 0.5) {
                    ctx.save();
                    ctx.globalAlpha = (phaseT - 0.5) * 2;
                    ctx.font = '16px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🥐', cx + 12, cy);
                    ctx.restore();
                }
            }
        }

        _drawConsumerBody(x, y, isPremium) {
            const ctx = this.ctx;
            // 身體：premium 金色 + 光暈、budget 藍色
            if (isPremium) {
                ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = isPremium ? '#f59e0b' : '#60a5fa';
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isPremium ? '#d97706' : '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 頭
            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.arc(x, y - 11, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        _drawSpeechBubble(x, y, text, kind, phaseT) {
            const ctx = this.ctx;
            const scale = phaseT < 0.15 ? phaseT / 0.15 : 1;
            const alpha = phaseT > 0.85 ? Math.max(0, (1 - phaseT) / 0.15) : 1;
            const colors = {
                ask:  { bg: 'rgba(255,255,255,0.98)', border: '#94a3b8', text: '#334155' },
                shop: { bg: 'rgba(254, 243, 199, 0.98)', border: '#d97706', text: '#78350f' },
                good: { bg: 'rgba(220, 252, 231, 0.98)', border: '#22c55e', text: '#166534' },
                bad:  { bg: 'rgba(254, 226, 226, 0.98)', border: '#ef4444', text: '#991b1b' },
            }[kind] || { bg: '#fff', border: '#666', text: '#111' };
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.font = '700 13px sans-serif';
            const padding = 8;
            const textW = ctx.measureText(text).width;
            const boxW = textW + padding * 2;
            const boxH = 22;
            const bx = -boxW / 2, by = -boxH - 6;
            const r = 8;
            ctx.fillStyle = colors.bg;
            ctx.strokeStyle = colors.border;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx + r, by);
            ctx.lineTo(bx + boxW - r, by);
            ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
            ctx.lineTo(bx + boxW, by + boxH - r);
            ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
            ctx.lineTo(bx + r, by + boxH);
            ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
            ctx.lineTo(bx, by + r);
            ctx.quadraticCurveTo(bx, by, bx + r, by);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // 尾巴
            ctx.beginPath();
            ctx.moveTo(-5, by + boxH);
            ctx.lineTo(0, by + boxH + 6);
            ctx.lineTo(5, by + boxH);
            ctx.closePath();
            ctx.fillStyle = colors.bg;
            ctx.fill(); ctx.stroke();
            // 文字
            ctx.fillStyle = colors.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, by + boxH / 2);
            ctx.restore();
        }

        _drawThoughtBubble(x, y, text, phaseT) {
            const ctx = this.ctx;
            const scale = phaseT < 0.15 ? phaseT / 0.15 : 1;
            const alpha = phaseT > 0.85 ? Math.max(0, (1 - phaseT) / 0.15) : 1;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.font = 'italic 12px sans-serif';
            const padding = 8;
            const textW = ctx.measureText(text).width;
            const boxW = textW + padding * 2;
            const boxH = 22;
            const bx = -boxW / 2, by = -boxH - 6;
            // 雲朵造型（多個圓）
            ctx.fillStyle = 'rgba(224, 242, 254, 0.98)';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.5;
            const drawCloudBubble = () => {
                ctx.beginPath();
                ctx.arc(bx + 10, by + boxH / 2, 12, 0, Math.PI * 2);
                ctx.arc(bx + boxW - 10, by + boxH / 2, 12, 0, Math.PI * 2);
                ctx.rect(bx + 10, by, boxW - 20, boxH);
                ctx.fill();
                // stroke top-only 圓弧
                ctx.beginPath();
                ctx.arc(bx + 10, by + boxH / 2, 12, Math.PI, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(bx + boxW - 10, by + boxH / 2, 12, Math.PI, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(bx + 10, by);
                ctx.lineTo(bx + boxW - 10, by);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(bx + 10, by + boxH);
                ctx.lineTo(bx + boxW - 10, by + boxH);
                ctx.stroke();
            };
            drawCloudBubble();
            // 小泡泡（思考）
            ctx.fillStyle = 'rgba(224, 242, 254, 0.98)';
            ctx.beginPath(); ctx.arc(0, by + boxH + 8, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(-3, by + boxH + 14, 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            // 文字
            ctx.fillStyle = '#075985';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'italic 11px sans-serif';
            ctx.fillText(text, 0, by + boxH / 2);
            ctx.restore();
        }

    }

    // ---------- UI ----------
    let market = null;
    let gameOver = false;
    let scene = null;
    let pendingDayRec = null;   // 動畫期間存放的結算資料

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
            // 但「🔥 熱門」是公開訊號：真實開店你看得到隔壁昨天大排長龍
            if (op.wasHot && !op.closed) {
                const h = el('span', 'shop-badge hot', '🔥 熱門');
                priceRow.appendChild(h);
            }
            if (op.closed) {
                const b = el('span', 'shop-badge closed', `倒店 D${op.closedDay}`);
                priceRow.appendChild(b);
            }
            card.appendChild(priceRow);
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
            $('mine-visits').textContent = '—';
            $('mine-baked').textContent = '—';
            $('mine-sold').textContent = '—';
            $('mine-wasted').textContent = '—';
            $('mine-conv').textContent = '—';
            $('mine-loyalty').textContent = '—';
            $('mine-hot').hidden = true;
            $('mine-profit').textContent = '—';
        } else {
            const last = p.history[p.history.length - 1];
            const visits = p.visitsToday !== undefined ? p.visitsToday : 0;
            $('mine-visits').textContent = visits;
            $('mine-baked').textContent = last.baked;
            $('mine-sold').textContent = last.sold;
            $('mine-wasted').textContent = last.wasted;
            const convRate = visits > 0 ? (last.sold / visits) : null;
            $('mine-conv').innerHTML = convRate !== null
                ? `<span class="${convRate >= 0.6 ? 'tag-good' : convRate >= 0.3 ? '' : 'tag-bad'}">${(convRate * 100).toFixed(0)}%</span>（${last.sold}/${visits}）`
                : '—（訪客太少）';
            // 熟客總數 = 所有 consumer 對 player 累計 loyalty 的加總（>=1 才算「一個熟客」）
            const loyalCount = market.consumers.reduce((s, c) => s + ((c.loyalty[p.id] || 0) >= 1 ? 1 : 0), 0);
            const loyalPoints = market.consumers.reduce((s, c) => s + (c.loyalty[p.id] || 0), 0);
            $('mine-loyalty').innerHTML = `<span class="${loyalCount >= 8 ? 'tag-good' : ''}">${loyalCount} 位</span>（累計 ${loyalPoints.toFixed(1)} 次光顧）`;
            $('mine-hot').hidden = !p.wasHot;
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
        // Day 1 默認烤 capacity/5（保守探路，跟 AI 建議 + 對手 Day 1 一致）
        // 之後每天用「昨日賣量 + 2 緩衝」的 heuristic
        const qty = p.history.length > 0
            ? p.history[p.history.length - 1].sold + 2
            : Math.max(2, Math.round(p.capacity / 5));
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
        // Day 1 特殊處理：沒有需求訊號時保守探路（產能的 1/5），不叫玩家一次砸滿
        const nvQ = p.newsvendorQ();
        const oldPlan = p.plannedQuantity;
        let suggestedQty;
        let qtyReason;
        if (nvQ !== null) {
            const target = clamp(nvQ, 1, p.capacity);
            suggestedQty = Math.max(1, Math.round(0.7 * oldPlan + 0.3 * target));
            qtyReason = `Newsvendor Q*≈${fmt(nvQ, 1)}（近 ${p.recentSales.length} 天銷量的樣本），慣性平滑`;
        } else if (p.history.length === 0) {
            suggestedQty = Math.max(2, Math.round(p.capacity / 5));
            qtyReason = `Day 1 保守探路：先烤產能的 1/5 試水溫（無需求訊號時不冒險）`;
        } else {
            const lastSold = p.history[p.history.length - 1].sold;
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
        const animMs = parseInt($('cfg-anim-ms').value) || 500;
        const cfg = makeMarketCfg(costTier, difficulty, mood);
        market = new Market(cfg);
        gameOver = false;
        // 初始節奏由「開店設定」決定，開店後可在 scene 面板即時調整
        if (scene) scene.setPerCustomerMs(animMs);
        $('cfg-anim-ms-live').value = animMs;   // 同步 scene 面板的即時輸入框

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
        const aiSug = computeAISuggestion();
        market.decisionLog.push({
            day: market.day + 1,
            playerPrice: price,
            aiPrice: aiSug.price,
            playerQty: qty,
            aiQty: aiSug.qty,
        });
        market.player.setPrice(price);
        market.player.setPlannedQuantity(qty);

        const rec = market.stepOneDay();
        pendingDayRec = rec;

        // 進入動畫階段：隱藏決策 & log，顯示 scene panel + 捲到動畫區
        $('scene-panel').hidden = false;
        $('decision-panel').hidden = true;
        $('scene-summary').hidden = true;
        $('scene-day-label').textContent = `Day ${rec.day}`;
        // 每天重置暫停 / 繼續按鈕：開始時是「暫停」可按
        $('btn-pause-anim').hidden = false;
        $('btn-resume-anim').hidden = true;
        $('scene-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

        scene.setMarket(market);
        // 延遲 2 幀讓 scene panel 完成 layout（canvas.clientWidth 讀對）+ scroll 動畫穩定
        // 直接呼叫 animateDay 可能讓 _resize() 讀到 hidden 狀態下的 0，導致畫布 0×0
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scene.animateDay(rec.day, rec.sceneEvents, showDaySummary);
            });
        });
    }

    function showDaySummary() {
        const rec = pendingDayRec;
        if (!rec) return;
        // 底層畫店家最終狀態
        scene.setMarket(market);
        // 防呆：force snap + redraw，確保結算卡打開時 canvas 已經是 post-snap
        // （_loop 尾巴應該已經做了，但 rAF/browser 時序有時會漏掉）
        if (scene && scene._shopStats) {
            scene._snapStatsToFinal();
            scene._drawStaticBackground();
        }
        const p = market.player;
        const last = p.history[p.history.length - 1];
        const conv = rec.playerVisits > 0 ? (rec.playerSold / rec.playerVisits * 100).toFixed(0) + '%' : '—';
        const profTag = rec.playerProfit >= 0 ? 'profit-good' : 'profit-bad';
        const loyalCount = market.consumers.reduce((s, c) => s + ((c.loyalty[p.id] || 0) >= 1 ? 1 : 0), 0);
        const closedNow = market.opponents.filter(o => o.closed && o.closedDay === rec.day);
        const closedHtml = closedNow.length > 0
            ? `<div class="row" style="color:#991b1b;"><b>💀 對手倒店</b><b>${closedNow.map(o => o.label).join('、')}</b></div>`
            : '';
        $('summary-title').textContent = `📊 Day ${rec.day} 結算`;
        $('summary-body').innerHTML = `
            <div class="row"><b>訪客</b><b>${rec.playerVisits} 人</b></div>
            <div class="row"><b>成交率</b><b>${conv}（${rec.playerSold}/${rec.playerVisits}）</b></div>
            <div class="row"><b>賣 / 烤</b><b>${rec.playerSold} / ${last.baked}（剩 ${last.wasted}）</b></div>
            <div class="row"><b>今日淨利</b><b class="${profTag}">$${fmt(rec.playerProfit, 1)}</b></div>
            <div class="row"><b>本金</b><b>$${fmt(rec.playerCumulative, 1)}</b></div>
            <div class="row"><b>熟客</b><b>${loyalCount} 位${p.wasHot ? ' · 🔥 熱門！' : ''}</b></div>
            ${closedHtml}
        `;
        $('scene-summary').hidden = false;
    }

    function proceedToNextDay() {
        const rec = pendingDayRec;
        pendingDayRec = null;
        $('scene-panel').hidden = true;
        $('scene-summary').hidden = true;
        logDay(rec);
        renderMineCard();
        renderOpponents();
        updateHeader();
        renderCharts();

        const aliveOpp = market.opponents.filter(o => !o.closed).length;
        if (rec.playerClosed) {
            endGame('lose_bankrupt');
        } else if (aliveOpp === 0) {
            endGame('win_last_standing');
        } else if (market.day >= 30) {
            endGame('win_survived');
        } else {
            $('decision-panel').hidden = false;
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
            daysPlayed: history.length,
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
        // 峰值日語意：三種 case
        //  (a) Day 1 峰值 + Day 1 死：第一天決策就爆炸，沒進 Day 2
        //  (b) Day 1 峰值 + 活到後面：從 Day 2 起陰乾
        //  (c) Day X 峰值 + 後續下滑：真正的拐點
        //  (d) 峰值就在最後一天：一路走高沒拐點
        let peakLine;
        if (a.peakDay === 1 && a.daysPlayed === 1) {
            peakLine = `<b class="tag-bad">Day 1 直接破產</b>：本金 $${fmt(a.peakCash, 1)}（種子 $100 + Day 1 淨利 $${fmt(a.peakProfit, 1)}）——第一天決策就爆炸，這一場沒進 Day 2。<span class="analysis-sub">常見原因：烤太多 or 售價離市場太遠，Day 1 沒有需求訊號可依靠。</span>`;
        } else if (a.peakDay === 1) {
            peakLine = `<b>本金峰值：Day 1，本金 $${fmt(a.peakCash, 1)}</b>（= 種子 $100 + Day 1 淨利 $${fmt(a.peakProfit, 1)}）——<b class="tag-bad">Day 1 就是最高點，之後沒再突破</b>。中間可能有起有伏，但淨值再也沒回到開場的水位。`;
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
        $('scene-panel').hidden = true;
        $('scene-summary').hidden = true;
        market = null;
        gameOver = false;
        pendingDayRec = null;
        if (scene && scene.playing) scene.skip();
    }

    // ---------- Wire up ----------
    function initUI() {
        scene = new BakeryScene($('scene-canvas'));
        $('btn-start').addEventListener('click', startGame);
        $('btn-confirm').addEventListener('click', confirmDay);
        $('btn-ai-suggest').addEventListener('click', renderAISuggestion);
        $('btn-apply-suggest').addEventListener('click', applyAISuggestion);
        $('btn-restart').addEventListener('click', restart);
        $('btn-next-day').addEventListener('click', proceedToNextDay);
        $('btn-skip-anim').addEventListener('click', () => {
            if (scene && scene.playing) scene.skip();
        });
        $('btn-pause-anim').addEventListener('click', () => {
            if (!scene || !scene.playing || scene.paused) return;
            scene.pause();
            $('btn-pause-anim').hidden = true;
            $('btn-resume-anim').hidden = false;
        });
        $('btn-resume-anim').addEventListener('click', () => {
            if (!scene || !scene.playing || !scene.paused) return;
            scene.resume();
            $('btn-pause-anim').hidden = false;
            $('btn-resume-anim').hidden = true;
        });
        // 動畫中即時改速度：input 每次變動立刻套用到 scene，下一 frame 生效
        $('cfg-anim-ms-live').addEventListener('input', e => {
            if (scene) scene.setPerCustomerMs(parseInt(e.target.value) || 500);
        });
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
