(function () {
    'use strict';

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const pct = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
    const $ = id => document.getElementById(id);
    const mean = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

    // Box-Muller for gaussian noise
    function gaussian(mu = 0, sigma = 1) {
        const u1 = 1 - Math.random();
        const u2 = 1 - Math.random();
        return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // ---------- 5 種策略的決策函式 ----------
    // 每個都收 (trader, price, intrinsic, priceHistory) 回傳 {action, dollars}
    // action ∈ {'buy', 'sell', 'hold'}；dollars = 該筆單金額
    const STRATEGIES = {
        // 價值型：看價 vs 內在，低估就買、高估就賣（Buffett 風格）
        // 閾值 3% 讓他們比較活躍，能在小折溢價就出手
        value(t, price, intrinsic) {
            const undervalue = (intrinsic - price) / intrinsic;
            if (undervalue > 0.03 && t.cash > price) {
                const aggr = clamp(undervalue * 4, 0.1, 0.5);
                return { action: 'buy', dollars: Math.max(price * 3, t.cash * aggr) };
            }
            if (undervalue < -0.03 && t.shares > 0) {
                const shed = clamp(-undervalue * 4, 0.1, 0.6);
                return { action: 'sell', dollars: t.shares * price * shed };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 動能追隨：看 5 日均線，價格突破就追、跌破就砍
        momentum(t, price, intrinsic, hist) {
            if (hist.length < 5) return { action: 'hold', dollars: 0 };
            const ma5 = mean(hist.slice(-5));
            const change = (price - ma5) / ma5;
            if (change > 0.02 && t.cash > price) {
                return { action: 'buy', dollars: t.cash * clamp(change * 5, 0.1, 0.3) };
            }
            if (change < -0.02 && t.shares > 0) {
                return { action: 'sell', dollars: t.shares * price * clamp(-change * 5, 0.1, 0.5) };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 反向操作：短期急漲就賣、急跌就抄底
        contrarian(t, price, intrinsic, hist) {
            if (hist.length < 3) return { action: 'hold', dollars: 0 };
            const ma3 = mean(hist.slice(-3));
            const spike = (price - ma3) / ma3;
            if (spike > 0.03 && t.shares > 0) {
                return { action: 'sell', dollars: t.shares * price * clamp(spike * 5, 0.1, 0.4) };
            }
            if (spike < -0.03 && t.cash > price) {
                return { action: 'buy', dollars: t.cash * clamp(-spike * 5, 0.1, 0.4) };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 定投：每天目標買 1 股，只要價格 ≤ 初始資金 2%
        // 貴到超過 2% 就跳過（存下來），這才是「固定預算」DCA 精神
        dca(t, price) {
            if (price <= t.initialCash * 0.02 && t.cash >= price) {
                return { action: 'buy', dollars: price };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 雜訊交易：隨機（代表沒策略的散戶）
        // 買賣強度較溫和、避免單一 cohort 主導價格
        noise(t, price) {
            const r = Math.random();
            if (r < 0.22 && t.cash > price) {
                return { action: 'buy', dollars: t.cash * rand(0.05, 0.15) };
            }
            if (r > 0.78 && t.shares > 0) {
                return { action: 'sell', dollars: t.shares * price * rand(0.05, 0.15) };
            }
            return { action: 'hold', dollars: 0 };
        },
    };

    const STRATEGY_INFO = {
        value:      { label: '價值型',   color: '#16a34a', desc: '低估就買、高估就賣' },
        momentum:   { label: '動能追隨', color: '#f59e0b', desc: '突破均線追、跌破砍' },
        contrarian: { label: '反向操作', color: '#a855f7', desc: '急漲就賣、急跌抄底' },
        dca:        { label: '定投',     color: '#2563eb', desc: '每天固定買、永不賣' },
        noise:      { label: '雜訊交易', color: '#6b7280', desc: '隨機（代表無策略散戶）' },
    };
    const STRATEGY_ORDER = ['value', 'momentum', 'contrarian', 'dca', 'noise'];

    // ---------- Trader ----------
    class Trader {
        constructor(id, strategy, initialCash) {
            this.id = id;
            this.strategy = strategy;
            this.initialCash = initialCash;
            this.cash = initialCash;
            this.shares = 0;
            this.tradesCount = 0;
        }

        // 傳回意向訂單，還沒真的成交
        decide(price, intrinsic, hist) {
            return STRATEGIES[this.strategy](this, price, intrinsic, hist);
        }

        // 實際成交，dollars 是最終真的花掉/收到的金額（可能被市場撮合縮減）
        executeBuy(dollars, price) {
            const shares = Math.floor(dollars / price);
            if (shares <= 0) return 0;
            const cost = shares * price;
            if (cost > this.cash) return 0;
            this.cash -= cost;
            this.shares += shares;
            this.tradesCount += 1;
            return shares;
        }

        executeSell(dollars, price) {
            const shares = Math.min(this.shares, Math.floor(dollars / price));
            if (shares <= 0) return 0;
            this.cash += shares * price;
            this.shares -= shares;
            this.tradesCount += 1;
            return shares;
        }

        portfolioValue(price) { return this.cash + this.shares * price; }

        returnPct(price) {
            return (this.portfolioValue(price) - this.initialCash) / this.initialCash;
        }
    }

    // ---------- Stock（單一標的）----------
    // 內在價值 = 公司真實成長（黑箱、只有時間會告訴你）
    // 股價 = 交易者供需下的均衡（每天可能偏離內在）
    class Stock {
        constructor(initialPrice, initialIntrinsic) {
            this.price = initialPrice;
            this.intrinsic = initialIntrinsic;
            this.priceHistory = [initialPrice];
            this.intrinsicHistory = [initialIntrinsic];
            this.volumeHistory = [0];
        }

        // 內在價值每天做 log-normal 漂移（幾何布朗運動）
        // driftAnnual = 年化成長率；volDaily = 每日波動 %
        tickIntrinsic(driftAnnual, volDaily) {
            const dt = 1 / 252;   // 交易日換算
            const mu = driftAnnual;
            const sigma = volDaily * Math.sqrt(252);   // 反推年化 sigma
            const shock = gaussian(0, 1);
            this.intrinsic *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * shock);
        }

        // 撮合：buyDollars vs sellDollars 決定價格漂移
        settle(buyDollars, sellDollars, priceImpact) {
            const net = buyDollars - sellDollars;
            const flow = (net / (this.price * 100)) * priceImpact;
            // 內在錨定：股價會慢慢回歸內在（mean reversion）
            // 5% 強度 = 每天最多把 gap 收斂 5%；bubbles 會被拉回來
            const anchor = (this.intrinsic - this.price) / this.price * 0.05;
            const change = clamp(flow + anchor, -0.15, 0.15);
            this.price *= (1 + change);
            this.priceHistory.push(this.price);
            this.intrinsicHistory.push(this.intrinsic);
            this.volumeHistory.push(buyDollars + sellDollars);
        }

        injectNews(magnitude, label) {
            // 消息直接衝擊內在價值 + 一次性股價過度反應
            this.intrinsic *= (1 + magnitude);
            this.price *= (1 + magnitude * 1.3);   // 130% 過度反應
        }
    }

    // ---------- Market ----------
    class Market {
        constructor(cfg) {
            this.cfg = cfg;
            this.day = 0;
            this.stock = new Stock(cfg.initialPrice, cfg.initialPrice);   // 內在 = 初始股價
            this.traders = [];
            let id = 0;
            for (const s of STRATEGY_ORDER) {
                for (let i = 0; i < cfg.perStrategy; i++) {
                    this.traders.push(new Trader(id++, s, cfg.initialCash));
                }
            }
            this.dailyStats = [];
            this.newsLog = [];   // 消息事件
            this.pendingNews = null;   // 下一輪 tick 要注入的消息
        }

        stepOneDay() {
            this.day += 1;

            // 先注入待處理的消息
            if (this.pendingNews) {
                this.stock.injectNews(this.pendingNews.magnitude, this.pendingNews.label);
                this.newsLog.push({ day: this.day, ...this.pendingNews });
                this.pendingNews = null;
            }

            // 內在價值漂移
            this.stock.tickIntrinsic(this.cfg.driftAnnual, this.cfg.volDaily);

            // 各 trader 提出訂單意向
            const priceForDecide = this.stock.price;
            const intrinsicForDecide = this.stock.intrinsic;
            const histForDecide = this.stock.priceHistory.slice();

            let buyDollars = 0, sellDollars = 0;
            const orders = [];
            for (const t of this.traders) {
                const d = t.decide(priceForDecide, intrinsicForDecide, histForDecide);
                orders.push({ traderId: t.id, ...d });
                if (d.action === 'buy') buyDollars += d.dollars;
                else if (d.action === 'sell') sellDollars += d.dollars;
            }

            // 撮合出新價格（今天的成交價）
            this.stock.settle(buyDollars, sellDollars, this.cfg.impact);
            const clearingPrice = this.stock.price;

            // 用新價格實際成交（真實金額可能小於意向，例如現金不夠）
            let volume = 0;
            for (const o of orders) {
                const t = this.traders[o.traderId];
                if (o.action === 'buy') {
                    volume += t.executeBuy(o.dollars, clearingPrice);
                } else if (o.action === 'sell') {
                    volume += t.executeSell(o.dollars, clearingPrice);
                }
            }

            // 統計每策略的平均資產
            const stratStats = {};
            for (const s of STRATEGY_ORDER) {
                const list = this.traders.filter(t => t.strategy === s);
                const avgPortfolio = mean(list.map(t => t.portfolioValue(clearingPrice)));
                const avgReturn = mean(list.map(t => t.returnPct(clearingPrice)));
                const avgShareValue = mean(list.map(t => t.shares * clearingPrice));
                const avgTotal = mean(list.map(t => t.portfolioValue(clearingPrice)));
                const equityPct = avgTotal > 0 ? avgShareValue / avgTotal : 0;
                stratStats[s] = { avgPortfolio, avgReturn, equityPct };
            }

            const rec = {
                day: this.day,
                price: clearingPrice,
                intrinsic: this.stock.intrinsic,
                volume,
                buyDollars, sellDollars,
                stratStats,
            };
            this.dailyStats.push(rec);
            return rec;
        }

        queueNews(magnitude, label) {
            this.pendingNews = { magnitude, label };
        }
    }

    // ---------- Charts ----------
    class PriceChart {
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

        render(stats) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            if (stats.length === 0) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('按「開始」跑起來，這裡會出現股價 vs 內在價值', w / 2, h / 2);
                return;
            }
            const target = 250;
            const step = Math.max(1, Math.ceil(stats.length / target));
            const sample = [];
            for (let i = 0; i < stats.length; i += step) sample.push(stats[i]);
            if (sample[sample.length - 1] !== stats[stats.length - 1]) sample.push(stats[stats.length - 1]);

            const padL = 48, padR = 12, padT = 12, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            let ymin = Math.min(...sample.map(s => Math.min(s.price, s.intrinsic)));
            let ymax = Math.max(...sample.map(s => Math.max(s.price, s.intrinsic)));
            const pad = (ymax - ymin) * 0.08 || 1;
            ymin -= pad; ymax += pad;
            const yr = ymax - ymin || 1;
            const vmax = Math.max(1, ...sample.map(s => s.volume));

            const xAt = i => padL + (sample.length === 1 ? chartW / 2 : (i / (sample.length - 1)) * chartW);
            const yAt = v => padT + chartH - ((v - ymin) / yr) * chartH;

            // 網格
            ctx.strokeStyle = '#e5e7eb';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 5; i++) {
                const v = ymin + (yr * i) / 5;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + chartW, y);
                ctx.stroke();
                ctx.fillText(v.toFixed(1), padL - 4, y);
            }

            // 成交量
            ctx.fillStyle = 'rgba(245,158,11,.35)';
            const barW = Math.max(1, chartW / sample.length * 0.7);
            sample.forEach((s, i) => {
                const bh = (s.volume / vmax) * (chartH * 0.30);
                ctx.fillRect(xAt(i) - barW / 2, padT + chartH - bh, barW, bh);
            });

            // 內在價值（綠虛線）
            ctx.strokeStyle = '#16a34a';
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            sample.forEach((s, i) => {
                const x = xAt(i), y = yAt(s.intrinsic);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.setLineDash([]);

            // 股價（藍實線）
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            sample.forEach((s, i) => {
                const x = xAt(i), y = yAt(s.price);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // X 軸
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(sample.length, 8);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((sample.length - 1) * i / (xTicks - 1 || 1));
                ctx.fillText('Day ' + sample[idx].day, xAt(idx), padT + chartH + 4);
            }
        }
    }

    class StrategyChart {
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

        render(stats) {
            const { ctx, w, h } = this;
            ctx.clearRect(0, 0, w, h);
            if (stats.length === 0) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('按「開始」跑起來，這裡會出現 5 策略累計報酬', w / 2, h / 2);
                return;
            }
            const target = 250;
            const step = Math.max(1, Math.ceil(stats.length / target));
            const sample = [];
            for (let i = 0; i < stats.length; i += step) sample.push(stats[i]);
            if (sample[sample.length - 1] !== stats[stats.length - 1]) sample.push(stats[stats.length - 1]);

            const padL = 52, padR = 12, padT = 12, padB = 26;
            const chartW = w - padL - padR;
            const chartH = h - padT - padB;

            // 蒐集所有策略的報酬率點
            const seriesByStrat = {};
            for (const s of STRATEGY_ORDER) {
                seriesByStrat[s] = sample.map(rec => rec.stratStats[s].avgReturn);
            }

            let ymin = 0, ymax = 0;
            for (const s of STRATEGY_ORDER) {
                for (const v of seriesByStrat[s]) {
                    if (v < ymin) ymin = v;
                    if (v > ymax) ymax = v;
                }
            }
            const pad = Math.max(0.02, (ymax - ymin) * 0.1);
            ymin -= pad; ymax += pad;
            const yr = ymax - ymin || 1;

            const xAt = i => padL + (sample.length === 1 ? chartW / 2 : (i / (sample.length - 1)) * chartW);
            const yAt = v => padT + chartH - ((v - ymin) / yr) * chartH;

            // 網格 + 零線
            ctx.strokeStyle = '#e5e7eb';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 5; i++) {
                const v = ymin + (yr * i) / 5;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + chartW, y);
                ctx.stroke();
                ctx.fillText((v * 100).toFixed(0) + '%', padL - 4, y);
            }
            if (ymin < 0 && ymax > 0) {
                ctx.strokeStyle = '#334155';
                ctx.beginPath();
                ctx.moveTo(padL, yAt(0));
                ctx.lineTo(padL + chartW, yAt(0));
                ctx.stroke();
            }

            // 每策略一條線
            for (const s of STRATEGY_ORDER) {
                const equity = stats[stats.length - 1].stratStats[s].equityPct;
                ctx.strokeStyle = STRATEGY_INFO[s].color;
                ctx.lineWidth = clamp(1 + equity * 2, 1, 3);
                ctx.beginPath();
                seriesByStrat[s].forEach((v, i) => {
                    const x = xAt(i), y = yAt(v);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();
            }

            // X 軸
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(sample.length, 8);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((sample.length - 1) * i / (xTicks - 1 || 1));
                ctx.fillText('Day ' + sample[idx].day, xAt(idx), padT + chartH + 4);
            }
        }
    }

    // ---------- UI wiring ----------
    let market = null;
    let timer = null;
    let priceChart = null;
    let strategyChart = null;

    function readCfg() {
        const perStrategy = clamp(parseInt($('cfg-per-strategy').value) || 6, 1, 30);
        const initialCash = clamp(parseFloat($('cfg-cash').value) || 10000, 100, 1000000);
        const initialPrice = clamp(parseFloat($('cfg-price').value) || 100, 1, 10000);
        const driftAnnual = clamp((parseFloat($('cfg-drift').value) || 8) / 100, -0.5, 0.5);
        const volDaily = clamp((parseFloat($('cfg-vol').value) || 1.5) / 100, 0.001, 0.1);
        const impact = clamp(parseFloat($('cfg-impact').value) || 0.08, 0, 1);
        const speed = clamp(parseInt($('cfg-speed').value) || 500, 30, 30000);
        return { perStrategy, initialCash, initialPrice, driftAnnual, volDaily, impact, speed };
    }

    function updateStatsUI(rec, market) {
        $('stat-day').textContent = rec.day;
        $('stat-price').textContent = fmt(rec.price);
        $('stat-intrinsic').textContent = fmt(rec.intrinsic);
        const premium = (rec.price - rec.intrinsic) / rec.intrinsic;
        const premEl = $('stat-premium');
        premEl.textContent = (premium >= 0 ? '+' : '') + pct(premium);
        premEl.style.color = premium > 0.05 ? 'var(--down)' : premium < -0.05 ? 'var(--up)' : '';
        $('stat-volume').textContent = rec.volume;
        // 領先策略
        let bestS = null, bestR = -Infinity;
        for (const s of STRATEGY_ORDER) {
            if (rec.stratStats[s].avgReturn > bestR) {
                bestR = rec.stratStats[s].avgReturn;
                bestS = s;
            }
        }
        const winEl = $('stat-winner');
        winEl.textContent = `${STRATEGY_INFO[bestS].label} ${bestR >= 0 ? '+' : ''}${pct(bestR)}`;
        winEl.style.color = STRATEGY_INFO[bestS].color;
    }

    function renderStrategyLegend(rec) {
        const leg = $('strategy-legend');
        leg.innerHTML = '';
        for (const s of STRATEGY_ORDER) {
            const info = STRATEGY_INFO[s];
            const stats = rec.stratStats[s];
            const ret = stats.avgReturn;
            const retStr = (ret >= 0 ? '+' : '') + pct(ret);
            const div = document.createElement('span');
            div.className = 'lg';
            div.innerHTML = `<span class="swatch" style="background:${info.color}"></span>` +
                `<b>${info.label}</b> · 平均資產 ${fmt(stats.avgPortfolio, 0)} · 報酬 ${retStr} · 持股 ${pct(stats.equityPct, 0)}`;
            leg.appendChild(div);
        }
    }

    function renderStrategyCards(rec, market) {
        const grid = $('strategies-grid');
        grid.innerHTML = '';
        for (const s of STRATEGY_ORDER) {
            const info = STRATEGY_INFO[s];
            const list = market.traders.filter(t => t.strategy === s);
            const stats = rec.stratStats[s];
            const avgCash = mean(list.map(t => t.cash));
            const avgShares = mean(list.map(t => t.shares));
            const avgTrades = mean(list.map(t => t.tradesCount));
            const retClass = stats.avgReturn > 0.005 ? 'up' : stats.avgReturn < -0.005 ? 'down' : '';
            const div = document.createElement('div');
            div.className = `strategy-card tag-${s}`;
            div.innerHTML = `
                <div class="name">${info.label}</div>
                <div class="row"><span>累計報酬</span><span class="v ${retClass}">${stats.avgReturn >= 0 ? '+' : ''}${pct(stats.avgReturn)}</span></div>
                <div class="row"><span>平均資產</span><span class="v">${fmt(stats.avgPortfolio, 0)}</span></div>
                <div class="row"><span>持股比例</span><span class="v">${pct(stats.equityPct, 0)}</span></div>
                <div class="row"><span>平均持股數</span><span class="v">${fmt(avgShares, 1)}</span></div>
                <div class="row"><span>累計交易次數</span><span class="v">${fmt(avgTrades, 0)}</span></div>
            `;
            grid.appendChild(div);
        }
    }

    function pushLog(rec, market) {
        const log = $('log');
        const prev = market.dailyStats[market.dailyStats.length - 2];
        let trend = '', trendClass = 'flat';
        if (prev) {
            const d = (rec.price - prev.price) / prev.price;
            if (d > 0.005) { trend = '↑ ' + pct(d); trendClass = 'up'; }
            else if (d < -0.005) { trend = '↓ ' + pct(-d); trendClass = 'down'; }
            else { trend = '→ 持平'; }
        }
        const entry = document.createElement('div');
        entry.className = 'entry';
        // 找今日領先者
        let bestS = null, bestR = -Infinity;
        for (const s of STRATEGY_ORDER) {
            if (rec.stratStats[s].avgReturn > bestR) {
                bestR = rec.stratStats[s].avgReturn;
                bestS = s;
            }
        }
        entry.innerHTML = `<span class="day">Day ${rec.day}</span> · 價 ${fmt(rec.price)} · 內在 ${fmt(rec.intrinsic)} · 量 ${rec.volume} · <span class="${trendClass}">${trend}</span> · 領先 <b style="color:${STRATEGY_INFO[bestS].color}">${STRATEGY_INFO[bestS].label}</b>`;
        log.prepend(entry);
        while (log.children.length > 60) log.removeChild(log.lastChild);
    }

    function pushNewsLog(day, magnitude, label) {
        const log = $('log');
        const entry = document.createElement('div');
        entry.className = 'entry';
        const sign = magnitude >= 0 ? '+' : '';
        entry.innerHTML = `<span class="day">Day ${day}</span> · <span class="news">📢 ${label} 內在價值 ${sign}${pct(magnitude, 0)}</span>`;
        log.prepend(entry);
    }

    function tickOnce() {
        if (!market) return;
        const rec = market.stepOneDay();
        updateStatsUI(rec, market);
        renderStrategyLegend(rec);
        renderStrategyCards(rec, market);
        pushLog(rec, market);
        priceChart.render(market.dailyStats);
        strategyChart.render(market.dailyStats);
        // 若剛注入了消息，也記到 log
        const latestNews = market.newsLog[market.newsLog.length - 1];
        if (latestNews && latestNews.day === rec.day) {
            pushNewsLog(latestNews.day, latestNews.magnitude, latestNews.label);
        }
    }

    function start() {
        if (!market) initMarket();
        if (timer) return;
        $('btn-run').disabled = true;
        $('btn-pause').disabled = false;
        $('btn-step').disabled = true;
        timer = setInterval(tickOnce, readCfg().speed);
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
        priceChart = new PriceChart($('price-chart'));
        strategyChart = new StrategyChart($('strategy-chart'));
        priceChart.render([]);
        strategyChart.render([]);
        // 初始渲染
        const emptyRec = {
            day: 0, price: cfg.initialPrice, intrinsic: cfg.initialPrice, volume: 0,
            stratStats: Object.fromEntries(STRATEGY_ORDER.map(s => [s,
                { avgPortfolio: cfg.initialCash, avgReturn: 0, equityPct: 0 }])),
        };
        updateStatsUI(emptyRec, market);
        renderStrategyLegend(emptyRec);
        renderStrategyCards(emptyRec, market);
        $('log').innerHTML = '';
    }

    function reset() { pause(); initMarket(); }

    function bootstrap() {
        initMarket();
        $('btn-run').addEventListener('click', start);
        $('btn-pause').addEventListener('click', pause);
        $('btn-step').addEventListener('click', () => { if (!market) initMarket(); tickOnce(); });
        $('btn-reset').addEventListener('click', reset);
        $('btn-news-good').addEventListener('click', () => {
            if (!market) return;
            market.queueNews(0.10, '好消息');
        });
        $('btn-news-bad').addEventListener('click', () => {
            if (!market) return;
            market.queueNews(-0.10, '壞消息');
        });
        $('cfg-speed').addEventListener('change', () => {
            if (timer) { pause(); start(); }
        });
    }

    // Script 在 body 末尾載入時 DOM 已就緒；DOMContentLoaded 可能已經 fire 過
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
