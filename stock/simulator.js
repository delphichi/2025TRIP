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

    // ---------- 歷史股票數據生成器 ----------
    // 用固定種子的 PRNG，產生 SPY/QQQ/JPM 風格的價量序列
    // 20 年 = 5040 個交易日，包含 2008 危機、2020 COVID、2022 修正
    function seededRng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }
    function seededGauss(rng) {
        return () => {
            const u1 = 1 - rng();
            const u2 = 1 - rng();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        };
    }
    function generateStockSeries(cfg) {
        const rng = seededRng(cfg.seed);
        const gauss = seededGauss(rng);
        const totalDays = 5040;   // 20 年 × 252 交易日
        const dailyDrift = Math.log(1 + cfg.cagr) / 252;
        const dailyVol = cfg.dailyVol / 100;
        const prices = [100];
        const volumes = [1e6];
        // 事件排程：{day, magnitude, duration} 磁鐵型衝擊
        const shocks = cfg.shocks || [];
        for (let d = 1; d < totalDays; d++) {
            let extra = 0;
            for (const sh of shocks) {
                if (d >= sh.day && d < sh.day + (sh.duration || 1)) {
                    extra += sh.magnitude / (sh.duration || 1);
                }
            }
            const change = dailyDrift + dailyVol * gauss() + extra;
            const newPrice = prices[d - 1] * Math.exp(change);
            prices.push(Math.max(0.01, newPrice));
            // 大幅波動 → 成交量放大
            const volMult = 1 + Math.abs(change) * 20;
            volumes.push(Math.floor(1e6 * volMult * (0.4 + rng() * 1.2)));
        }
        return { prices, volumes };
    }

    // 三支股票的歷史風格（2006-01-01 → 2025-12-31）
    // 事件對照真實時間軸：day ~500=2007, ~700=2008, ~3500=2020Q1, ~4100=2022
    const STOCK_PRESETS = {
        SPY: {
            label: 'SPY（大盤 ETF）',
            desc: '美國 500 大公司加權平均，穩定但溫和',
            seed: 20060101,
            cagr: 0.105,
            dailyVol: 1.05,
            shocks: [
                { day: 480,  magnitude: -0.10, duration: 40,  event: '2007 次貸警訊' },
                { day: 700,  magnitude: -0.40, duration: 120, event: '2008 金融海嘯' },
                { day: 3500, magnitude: -0.28, duration: 22,  event: '2020 COVID 崩盤' },
                { day: 3530, magnitude: 0.18,  duration: 60,  event: '2020 COVID 反彈' },
                { day: 4100, magnitude: -0.16, duration: 200, event: '2022 升息修正' },
            ],
        },
        QQQ: {
            label: 'QQQ（科技股 ETF）',
            desc: '納指 100，高成長高波動',
            seed: 20060201,
            cagr: 0.155,
            dailyVol: 1.35,
            shocks: [
                { day: 480,  magnitude: -0.08, duration: 40 },
                { day: 700,  magnitude: -0.42, duration: 130 },
                { day: 3500, magnitude: -0.22, duration: 20 },
                { day: 3530, magnitude: 0.35,  duration: 80 },
                { day: 4100, magnitude: -0.32, duration: 220, event: '2022 科技股崩盤' },
            ],
        },
        JPM: {
            label: 'JPM（金融股 - 摩根大通）',
            desc: '大型銀行，景氣循環波動大',
            seed: 20060301,
            cagr: 0.095,
            dailyVol: 1.75,
            shocks: [
                { day: 480,  magnitude: -0.15, duration: 40 },
                { day: 700,  magnitude: -0.60, duration: 180, event: '2008 銀行差點爆' },
                { day: 850,  magnitude: 0.25,  duration: 100, event: '政府救援銀行' },
                { day: 3500, magnitude: -0.35, duration: 20 },
                { day: 3530, magnitude: 0.22,  duration: 90 },
                { day: 4100, magnitude: -0.05, duration: 100 },
                { day: 4400, magnitude: 0.15,  duration: 60 },
            ],
        },
    };
    const STOCK_ORDER = ['SPY', 'QQQ', 'JPM'];
    const STOCK_COLORS = { SPY: '#2563eb', QQQ: '#f59e0b', JPM: '#dc2626' };
    // 預先生成三支
    const STOCK_DATA = {};
    for (const t of STOCK_ORDER) STOCK_DATA[t] = generateStockSeries(STOCK_PRESETS[t]);

    // ---------- 5 種策略的決策函式 ----------
    // 每個都收 (trader, price, intrinsic, priceHistory) 回傳 {action, dollars}
    // action ∈ {'buy', 'sell', 'hold'}；dollars = 該筆單金額
    // 每個策略 sig: (trader, day, ticker, stock, cfg) → {action, dollars}
    // 現金 t.cash 共用池；t.holdings[ticker] / t.lastTradeDay[ticker] 各 ticker 獨立
    const STRATEGIES = {
        // 價值型：逢低「大量」買入、逢高賣出、永遠保留 peak 的 20%（好公司值得長抱）
        // - 折價 ≥ 3% 才觸發買
        // - 買賣之間 20 天 cooldown（模擬「季度性重評估」節奏）
        // - 每次交易金額大：20-60% 的單股預算
        // - 賣出永遠保留該支歷史峰值持股的 20%，即使觸發賣出訊號也不清倉
        value(t, day, ticker, stock, cfg) {
            const price = stock.priceAt(day);
            const ma = stock.weeklyMA(day, 20);
            if (ma === null) return { action: 'hold', dollars: 0 };
            const sellPct = (cfg.valueSellPct || 5) / 100;
            // 賣：不受 cooldown 限制，但保留 peak × 20% 底倉
            if (price > ma * (1 + sellPct) && t.holdings[ticker] > 0) {
                const minKeep = Math.ceil(t.peakHoldings[ticker] * 0.20);
                const canSell = Math.max(0, t.holdings[ticker] - minKeep);
                if (canSell <= 0) return { action: 'hold', dollars: 0 };
                const over = (price - ma * (1 + sellPct)) / (ma * (1 + sellPct));
                const shed = clamp(0.30 + over * 3, 0.30, 1.0);
                const wantSell = Math.floor(t.holdings[ticker] * shed);
                const shares = Math.min(canSell, wantSell);
                if (shares <= 0) return { action: 'hold', dollars: 0 };
                return { action: 'sell', dollars: shares * price, reason: `MA 上方 ${pct(over, 0)}，減碼` };
            }
            // 買：20 天 cooldown + 折價 3% 才進場
            if (t.lastTradeDay[ticker] !== null && day - t.lastTradeDay[ticker] < 20) {
                return { action: 'hold', dollars: 0 };
            }
            const under = (ma - price) / ma;
            if (under >= 0.03 && t.cash > price) {
                const perStockBudget = t.initialCash / 3;
                const aggr = clamp(0.20 + under * 3, 0.20, 0.60);
                return { action: 'buy', dollars: Math.min(t.cash * 0.5, perStockBudget * aggr), reason: `MA 下方 ${pct(under, 0)}，逢低加碼` };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 定投：每 30 天買一次固定金額（初始資金的 dcaPct%）、永不賣
        dca(t, day, ticker, stock, cfg) {
            if (t.lastTradeDay[ticker] !== null && day - t.lastTradeDay[ticker] < 30) {
                return { action: 'hold', dollars: 0 };
            }
            // 每次投入平分到 3 支 → 每支 dcaPct/3 %
            const amount = t.initialCash * (cfg.dcaPct || 5) / 100 / 3;
            if (t.cash >= amount) return { action: 'buy', dollars: amount, reason: '定期定額，無腦買' };
            return { action: 'hold', dollars: 0 };
        },

        // 動能追隨：5 天交易一次，比較本週 vs 上週的量價
        momentum(t, day, ticker, stock) {
            if (t.lastTradeDay[ticker] !== null && day - t.lastTradeDay[ticker] < 5) {
                return { action: 'hold', dollars: 0 };
            }
            if (day < 10) return { action: 'hold', dollars: 0 };
            const price = stock.priceAt(day);
            const thisWeekChg = (stock.priceAt(day) - stock.priceAt(day - 5)) / stock.priceAt(day - 5);
            const lastWeekChg = (stock.priceAt(day - 5) - stock.priceAt(day - 10)) / stock.priceAt(day - 10);
            const thisWeekVol = stock.volumeSum(day - 5, day);
            const lastWeekVol = stock.volumeSum(day - 10, day - 5);
            const priceHigher = thisWeekChg > lastWeekChg && thisWeekChg > 0;
            const volHigher = thisWeekVol > lastWeekVol;
            const priceLower = thisWeekChg < lastWeekChg && thisWeekChg < 0;
            const volLower = thisWeekVol < lastWeekVol;
            const perStockBudget = t.initialCash / 3;
            if (priceHigher && volHigher && t.cash > price) {
                return { action: 'buy', dollars: Math.min(t.cash * 0.3, perStockBudget * 0.15), reason: `本週量價齊漲 (${pct(thisWeekChg, 0)})，追高` };
            }
            if (priceLower && volLower && t.holdings[ticker] > 0) {
                return { action: 'sell', dollars: t.holdings[ticker] * price * 0.30, reason: `本週量價齊跌 (${pct(thisWeekChg, 0)})，砍倉` };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 反向操作（對照組）
        contrarian(t, day, ticker, stock) {
            if (day < 3) return { action: 'hold', dollars: 0 };
            const price = stock.priceAt(day);
            const ma3 = mean(stock.priceHistory.slice(day - 3, day));
            const spike = (price - ma3) / ma3;
            const perStockBudget = t.initialCash / 3;
            if (spike > 0.03 && t.holdings[ticker] > 0) {
                return { action: 'sell', dollars: t.holdings[ticker] * price * clamp(spike * 5, 0.1, 0.4), reason: `3 日急漲 ${pct(spike, 0)}，反手賣` };
            }
            if (spike < -0.03 && t.cash > price) {
                return { action: 'buy', dollars: Math.min(t.cash * 0.3, perStockBudget * clamp(-spike * 5, 0.1, 0.4)), reason: `3 日急跌 ${pct(spike, 0)}，反手接` };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 雜訊（對照組）
        noise(t, day, ticker, stock) {
            const price = stock.priceAt(day);
            const r = Math.random();
            if (r < 0.22 && t.cash > price) {
                return { action: 'buy', dollars: Math.min(t.cash * 0.15, t.initialCash / 3 * rand(0.05, 0.15)), reason: '擲骰子，買' };
            }
            if (r > 0.78 && t.holdings[ticker] > 0) {
                return { action: 'sell', dollars: t.holdings[ticker] * price * rand(0.05, 0.15), reason: '擲骰子，賣' };
            }
            return { action: 'hold', dollars: 0 };
        },
    };

    const STRATEGY_INFO = {
        value:      { label: '價值型',   color: '#16a34a', desc: '週線 < 20週MA 就買、> MA×(1+X%) 才賣' },
        momentum:   { label: '動能追隨', color: '#f59e0b', desc: '每 5 天，量價齊漲加碼、齊跌減碼' },
        contrarian: { label: '反向操作', color: '#a855f7', desc: '3 日均線急漲賣、急跌抄底（對照）' },
        dca:        { label: '定投',     color: '#2563eb', desc: '每 30 天買一次固定金額、永不賣' },
        noise:      { label: '雜訊交易', color: '#6b7280', desc: '隨機（無策略散戶對照）' },
    };
    const STRATEGY_ORDER = ['value', 'dca', 'momentum', 'contrarian', 'noise'];

    // ---------- Trader ----------
    // 每個 trader 有一個共用現金池 + 各 ticker 獨立的持股 & 節奏
    class Trader {
        constructor(id, strategy, initialCash) {
            this.id = id;
            this.strategy = strategy;
            this.initialCash = initialCash;
            this.cash = initialCash;
            this.holdings = {};        // { SPY: 0, QQQ: 0, JPM: 0 }
            this.lastTradeDay = {};    // { SPY: null, QQQ: null, JPM: null }
            this.peakHoldings = {};   // 每支持股歷史高點，價值型「留 20%」用得到
            for (const tk of STOCK_ORDER) {
                this.holdings[tk] = 0;
                this.lastTradeDay[tk] = null;
                this.peakHoldings[tk] = 0;
            }
            this.tradesCount = 0;
            this.totalFees = 0;
            this.tradeHistory = [];
        }

        decide(day, ticker, stock, cfg) {
            return STRATEGIES[this.strategy](this, day, ticker, stock, cfg);
        }

        executeBuy(day, ticker, dollars, price, feePct = 0, reason = '') {
            // 意向 dollars 內含手續費，實際可買股數 = dollars / (price × (1+fee))
            const shares = Math.floor(dollars / (price * (1 + feePct)));
            if (shares <= 0) return 0;
            const base = shares * price;
            const fee = base * feePct;
            const cost = base + fee;
            if (cost > this.cash) return 0;
            this.cash -= cost;
            this.holdings[ticker] += shares;
            if (this.holdings[ticker] > this.peakHoldings[ticker]) {
                this.peakHoldings[ticker] = this.holdings[ticker];
            }
            this.tradesCount += 1;
            this.totalFees += fee;
            this.lastTradeDay[ticker] = day;
            this.tradeHistory.push({ day, ticker, action: 'buy', shares, price, fee, reason });
            return shares;
        }

        executeSell(day, ticker, dollars, price, feePct = 0, reason = '') {
            const shares = Math.min(this.holdings[ticker], Math.floor(dollars / price));
            if (shares <= 0) return 0;
            const base = shares * price;
            const fee = base * feePct;
            this.cash += base - fee;
            this.holdings[ticker] -= shares;
            this.tradesCount += 1;
            this.totalFees += fee;
            this.lastTradeDay[ticker] = day;
            this.tradeHistory.push({ day, ticker, action: 'sell', shares, price, fee, reason });
            return shares;
        }

        totalShareValue(prices) {
            let v = 0;
            for (const tk of STOCK_ORDER) v += this.holdings[tk] * prices[tk];
            return v;
        }
        portfolioValue(prices) { return this.cash + this.totalShareValue(prices); }
        returnPct(prices) {
            return (this.portfolioValue(prices) - this.initialCash) / this.initialCash;
        }
    }

    // ---------- Stock（讀取歷史數據回測用）----------
    class Stock {
        constructor(ticker) {
            const series = STOCK_DATA[ticker];
            this.ticker = ticker;
            this.label = STOCK_PRESETS[ticker].label;
            this.priceHistory = series.prices;
            this.volumeHistory = series.volumes;
        }
        priceAt(day) { return this.priceHistory[Math.min(day, this.priceHistory.length - 1)]; }
        volumeAt(day) { return this.volumeHistory[Math.min(day, this.volumeHistory.length - 1)]; }

        // N 週均線 = 過去 N × 5 個交易日的均價
        weeklyMA(day, weeks) {
            const window = weeks * 5;
            const start = Math.max(0, day - window + 1);
            const end = day + 1;
            if (end - start < 10) return null;
            const slice = this.priceHistory.slice(start, end);
            return slice.reduce((s, p) => s + p, 0) / slice.length;
        }

        volumeSum(from, to) {
            const f = Math.max(0, from);
            const t = Math.min(this.volumeHistory.length, to);
            let sum = 0;
            for (let i = f; i < t; i++) sum += this.volumeHistory[i];
            return sum;
        }

        get maxDays() { return this.priceHistory.length; }
    }

    // ---------- Market（3 支同時運作）----------
    class Market {
        constructor(cfg) {
            this.cfg = cfg;
            this.startDay = cfg.startDay || 0;
            this.endDay = cfg.endDay;   // 由 readCfg 保證有值
            this.day = this.startDay;
            this.stocks = {};
            for (const tk of STOCK_ORDER) this.stocks[tk] = new Stock(tk);
            this.maxDays = Math.min(...STOCK_ORDER.map(tk => this.stocks[tk].maxDays));
            if (typeof this.endDay !== 'number') this.endDay = this.maxDays - 1;
            this.endDay = Math.min(this.endDay, this.maxDays - 1);
            this.traders = [];
            this.tradersByStrategy = {};
            for (const s of STRATEGY_ORDER) this.tradersByStrategy[s] = [];
            let id = 0;
            for (const s of STRATEGY_ORDER) {
                for (let i = 0; i < cfg.perStrategy; i++) {
                    const t = new Trader(id++, s, cfg.initialCash);
                    this.traders.push(t);
                    this.tradersByStrategy[s].push(t);
                }
            }
            this.dailyStats = [];
            // 新聞排程：從 STOCK_PRESETS 掃出有 event 標籤的 shock，以 day → [{ticker, event, magnitude}] 排。
            this.newsSchedule = {};
            for (const tk of STOCK_ORDER) {
                for (const sh of (STOCK_PRESETS[tk].shocks || [])) {
                    if (!sh.event) continue;
                    if (!this.newsSchedule[sh.day]) this.newsSchedule[sh.day] = [];
                    this.newsSchedule[sh.day].push({ ticker: tk, event: sh.event, magnitude: sh.magnitude });
                }
            }
        }

        stepOneDay() {
            this.day += 1;
            if (this.day > this.endDay) {
                this.day = this.endDay;
                return null;
            }
            const prices = {}, mas = {}, marketVolumes = {};
            for (const tk of STOCK_ORDER) {
                prices[tk] = this.stocks[tk].priceAt(this.day);
                mas[tk] = this.stocks[tk].weeklyMA(this.day, 20) || prices[tk];
                marketVolumes[tk] = this.stocks[tk].volumeAt(this.day);
            }

            // 每個 trader 針對每支 stock 依策略下單；ticker 順序 shuffle 避免系統性偏好
            let tradesToday = 0;
            const bubbles = [];   // 今日「買賣泡泡」，供決策面板顯示
            for (const t of this.traders) {
                const order = STOCK_ORDER.slice();
                shuffleInPlace(order);
                for (const tk of order) {
                    const stock = this.stocks[tk];
                    const d = t.decide(this.day, tk, stock, this.cfg);
                    if (d.action === 'buy' && d.dollars > 0) {
                        const shares = t.executeBuy(this.day, tk, d.dollars, prices[tk], this.cfg.feePct, d.reason);
                        if (shares > 0) {
                            tradesToday++;
                            bubbles.push({ traderId: t.id, strategy: t.strategy, ticker: tk, action: 'buy', shares, price: prices[tk], reason: d.reason || '' });
                        }
                    } else if (d.action === 'sell' && d.dollars > 0) {
                        const shares = t.executeSell(this.day, tk, d.dollars, prices[tk], this.cfg.feePct, d.reason);
                        if (shares > 0) {
                            tradesToday++;
                            bubbles.push({ traderId: t.id, strategy: t.strategy, ticker: tk, action: 'sell', shares, price: prices[tk], reason: d.reason || '' });
                        }
                    }
                }
            }

            // 每個策略的統計
            const stratStats = {};
            for (const s of STRATEGY_ORDER) {
                const list = this.tradersByStrategy[s];
                const avgPortfolio = mean(list.map(t => t.portfolioValue(prices)));
                const avgReturn = mean(list.map(t => t.returnPct(prices)));
                const avgShareValue = mean(list.map(t => t.totalShareValue(prices)));
                const equityPct = avgPortfolio > 0 ? avgShareValue / avgPortfolio : 0;
                // 每支 stock 的持股佔比
                const perTicker = {};
                for (const tk of STOCK_ORDER) {
                    perTicker[tk] = avgPortfolio > 0
                        ? mean(list.map(t => t.holdings[tk] * prices[tk])) / avgPortfolio
                        : 0;
                }
                stratStats[s] = { avgPortfolio, avgReturn, equityPct, perTicker };
            }

            const rec = {
                day: this.day,
                prices, mas, marketVolumes,
                tradesCount: tradesToday,
                stratStats,
                bubbles,
            };
            this.dailyStats.push(rec);
            return rec;
        }
    }

    function shuffleInPlace(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---------- Charts ----------
    // 單一 ticker 的 K 線圖：週線蠟燭 + 20 週 MA + 底部量能柱 + 買賣三角標記
    class TickerChart {
        constructor(canvas, ticker) {
            this.canvas = canvas;
            this.ticker = ticker;
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

        // stats = market.dailyStats (每天一筆), market = 拿得到 stock.priceHistory / traders
        render(stats, market) {
            const { ctx, w, h, ticker } = this;
            ctx.clearRect(0, 0, w, h);
            if (stats.length === 0) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`按「開始」跑起來，${ticker} K 線會在這裡`, w / 2, h / 2);
                return;
            }
            const color = STOCK_COLORS[ticker];
            const stock = market.stocks[ticker];
            const firstDay = stats[0].day;
            const lastDay = stats[stats.length - 1].day;
            const totalDays = lastDay - firstDay + 1;

            // 目標 ~120 根 K 線，區間長短自動決定 daysPerBar（自動變成週 / 雙週 / 月線）
            const targetBars = 120;
            const daysPerBar = Math.max(1, Math.ceil(totalDays / targetBars));
            const bars = [];
            for (let start = firstDay; start <= lastDay; start += daysPerBar) {
                const end = Math.min(start + daysPerBar - 1, lastDay);
                let hi = -Infinity, lo = Infinity;
                let volSum = 0;
                for (let d = start; d <= end; d++) {
                    const p = stock.priceAt(d);
                    if (p > hi) hi = p;
                    if (p < lo) lo = p;
                    volSum += stock.volumeAt(d);
                }
                bars.push({
                    startDay: start, endDay: end,
                    open: stock.priceAt(start),
                    close: stock.priceAt(end),
                    high: hi, low: lo,
                    volume: volSum,
                });
            }
            if (bars.length === 0) return;

            // 排版：主圖 70%，量能 20%，中間留 10% 空白
            const padL = 48, padR = 12, padT = 10, padB = 22;
            const chartW = w - padL - padR;
            const priceH = (h - padT - padB) * 0.70;
            const volH = (h - padT - padB) * 0.22;
            const gap = (h - padT - padB) * 0.08;

            const allHi = Math.max(...bars.map(b => b.high));
            const allLo = Math.min(...bars.map(b => b.low));
            const pad = (allHi - allLo) * 0.06 || 1;
            const ymin = allLo - pad, ymax = allHi + pad;
            const yr = ymax - ymin || 1;

            const xAt = i => padL + (i + 0.5) / bars.length * chartW;
            const yAt = v => padT + priceH - ((v - ymin) / yr) * priceH;
            const barW = Math.max(1.5, (chartW / bars.length) * 0.7);

            // 存下 transform 讓外部（overlay 泡泡）能從 (day, price) 換到 CSS 像素座標
            this.tx = { firstDay, daysPerBar, barCount: bars.length, padL, chartW, padT, priceH, ymin, yr };

            // 網格 + Y 軸標籤
            ctx.strokeStyle = '#e5e7eb';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= 4; i++) {
                const v = ymin + (yr * i) / 4;
                const y = yAt(v);
                ctx.beginPath();
                ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
                ctx.fillText(v.toFixed(1), padL - 3, y);
            }

            // 蠟燭
            for (let i = 0; i < bars.length; i++) {
                const b = bars[i];
                const x = xAt(i);
                const isUp = b.close >= b.open;
                const bodyColor = isUp ? '#16a34a' : '#dc2626';
                ctx.strokeStyle = bodyColor;
                ctx.lineWidth = 1;
                // 高低影線
                ctx.beginPath();
                ctx.moveTo(x, yAt(b.high));
                ctx.lineTo(x, yAt(b.low));
                ctx.stroke();
                // 實體
                const yOpen = yAt(b.open), yClose = yAt(b.close);
                const bodyTop = Math.min(yOpen, yClose);
                const bodyH = Math.max(1, Math.abs(yClose - yOpen));
                ctx.fillStyle = bodyColor;
                ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
            }

            // 20 週 MA overlay
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < bars.length; i++) {
                const ma = stock.weeklyMA(bars[i].endDay, 20);
                if (ma === null) continue;
                const x = xAt(i), y = yAt(ma);
                if (!started) { ctx.moveTo(x, y); started = true; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // 量能柱（下半部）
            const volTop = padT + priceH + gap;
            const maxVol = Math.max(...bars.map(b => b.volume)) || 1;
            for (let i = 0; i < bars.length; i++) {
                const b = bars[i];
                const h2 = (b.volume / maxVol) * volH;
                const x = xAt(i);
                ctx.fillStyle = (b.close >= b.open) ? 'rgba(22,163,74,.35)' : 'rgba(220,38,38,.35)';
                ctx.fillRect(x - barW / 2, volTop + volH - h2, barW, h2);
            }

            // 買賣三角標記（把整段 traders.tradeHistory 針對此 ticker 的日期投影到 bars）
            // 為了效能：只掃最近 800 筆交易（跨所有 trader × 所有 ticker，篩此 ticker）
            const markerCounts = {};   // barIdx → {buy: {stratColors}, sell: {stratColors}}
            const traders = market.traders;
            for (const t of traders) {
                const hist = t.tradeHistory;
                const start = Math.max(0, hist.length - 200);
                for (let k = start; k < hist.length; k++) {
                    const tr = hist[k];
                    if (tr.ticker !== ticker) continue;
                    const barIdx = Math.floor((tr.day - firstDay) / daysPerBar);
                    if (barIdx < 0 || barIdx >= bars.length) continue;
                    if (!markerCounts[barIdx]) markerCounts[barIdx] = { buy: {}, sell: {} };
                    const bucket = markerCounts[barIdx][tr.action];
                    bucket[t.strategy] = (bucket[t.strategy] || 0) + 1;
                }
            }
            for (const barIdxStr of Object.keys(markerCounts)) {
                const barIdx = +barIdxStr;
                const x = xAt(barIdx);
                const b = bars[barIdx];
                const buyStrats = Object.keys(markerCounts[barIdx].buy);
                const sellStrats = Object.keys(markerCounts[barIdx].sell);
                // 買在 bar 下方畫上三角，賣在 bar 上方畫下三角
                for (let j = 0; j < buyStrats.length; j++) {
                    const s = buyStrats[j];
                    const col = STRATEGY_INFO[s].color;
                    const y = yAt(b.low) + 4 + j * 4;
                    ctx.fillStyle = col;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - 3, y + 4);
                    ctx.lineTo(x + 3, y + 4);
                    ctx.closePath();
                    ctx.fill();
                }
                for (let j = 0; j < sellStrats.length; j++) {
                    const s = sellStrats[j];
                    const col = STRATEGY_INFO[s].color;
                    const y = yAt(b.high) - 4 - j * 4;
                    ctx.fillStyle = col;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - 3, y - 4);
                    ctx.lineTo(x + 3, y - 4);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // ticker 標題浮貼於左上
            ctx.fillStyle = color;
            ctx.font = 'bold 12px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const last = stats[stats.length - 1];
            const chgFromStart = ((last.prices[ticker] / stats[0].prices[ticker]) - 1) * 100;
            const sign = chgFromStart >= 0 ? '+' : '';
            ctx.fillText(`${ticker}  $${last.prices[ticker].toFixed(1)}  ${sign}${chgFromStart.toFixed(0)}%`, padL + 4, padT + 2);

            // X 軸
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = Math.min(bars.length, 6);
            for (let i = 0; i < xTicks; i++) {
                const idx = Math.round((bars.length - 1) * i / (xTicks - 1 || 1));
                ctx.fillText(dayToYm(bars[idx].endDay), xAt(idx), padT + priceH + gap + volH + 3);
            }
        }

        // 把 (day, price) 轉成 canvas CSS 像素座標，overlay 泡泡定位用
        pixelForDayPrice(day, price) {
            if (!this.tx) return null;
            const { firstDay, daysPerBar, barCount, padL, chartW, padT, priceH, ymin, yr } = this.tx;
            const barIdx = Math.floor((day - firstDay) / daysPerBar);
            if (barIdx < 0 || barIdx >= barCount) return null;
            const x = padL + (barIdx + 0.5) / barCount * chartW;
            const y = padT + priceH - ((price - ymin) / yr) * priceH;
            return { x, y };
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
                ctx.fillText(dayToYm(sample[idx].day), xAt(idx), padT + chartH + 4);
            }
        }
    }

    // ---------- UI wiring ----------
    let market = null;
    let timer = null;
    let tickerCharts = {};    // { SPY, QQQ, JPM }
    let strategyChart = null;
    let bubbleQueue = [];      // 最新的 30 個泡泡；老的會滑出

    function readCfg() {
        const perStrategy = clamp(parseInt($('cfg-per-strategy').value) || 6, 1, 30);
        const initialCash = clamp(parseFloat($('cfg-cash').value) || 10000, 100, 1000000);
        const valueSellPct = clamp(parseFloat($('cfg-value-sell')?.value) || 5, 0.5, 50);
        const dcaPct = clamp(parseFloat($('cfg-dca-pct')?.value) || 5, 0.5, 50);
        const feePct = clamp(parseFloat($('cfg-fee-pct')?.value) || 0.1, 0, 5) / 100;
        const speed = clamp(parseInt($('cfg-speed').value) || 500, 30, 30000);
        let startYear = clamp(parseInt($('cfg-start-year')?.value) || 2006, 2006, 2025);
        let endYear = clamp(parseInt($('cfg-end-year')?.value) || 2025, 2006, 2025);
        if (endYear < startYear) endYear = startYear;
        const startDay = (startYear - 2006) * 252;
        const endDay = Math.min((endYear - 2006 + 1) * 252 - 1, 20 * 252 - 1);
        return { perStrategy, initialCash, valueSellPct, dcaPct, feePct, speed, startYear, endYear, startDay, endDay };
    }

    // Day → 年/月 顯示（以 2006-01-01 為 Day 0，252 交易日/年 ≈ 21 交易日/月）
    function dayToYm(day) {
        const y = 2006 + Math.floor(day / 252);
        const m = Math.floor((day % 252) / 21) + 1;
        return `${y}/${String(Math.min(12, m)).padStart(2, '0')}`;
    }

    function updateStatsUI(rec, market) {
        $('stat-day').textContent = `${dayToYm(rec.day)} (D${rec.day})`;
        // 3 支同時顯示（Day 0 = 100 的正規化累計報酬）
        const first = market.dailyStats[0] || rec;
        const parts = STOCK_ORDER.map(tk => {
            const base = first.prices ? first.prices[tk] : rec.prices[tk];
            const norm = (rec.prices[tk] / base) * 100;
            const color = STOCK_COLORS[tk];
            return `<span style="color:${color}">${tk} ${fmt(norm, 0)}</span>`;
        });
        const priceEl = $('stat-price');
        priceEl.innerHTML = parts.join(' · ');
        // 顯示 MA（3 個）
        const maEl = $('stat-intrinsic');
        if (maEl) maEl.innerHTML = STOCK_ORDER.map(tk =>
            `<span style="color:${STOCK_COLORS[tk]}">${tk} ${fmt(rec.mas[tk])}</span>`).join(' · ');
        // 現價 vs MA（用 SPY 當代表；或改成 3 個顯示）
        const premEl = $('stat-premium');
        if (premEl) {
            premEl.innerHTML = STOCK_ORDER.map(tk => {
                const p = (rec.prices[tk] - rec.mas[tk]) / rec.mas[tk];
                const color = p > 0.03 ? 'var(--down)' : p < -0.03 ? 'var(--up)' : STOCK_COLORS[tk];
                return `<span style="color:${color}">${tk} ${p >= 0 ? '+' : ''}${pct(p, 0)}</span>`;
            }).join(' · ');
        }
        $('stat-volume').textContent = rec.tradesCount;
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
            const list = market.tradersByStrategy[s];
            const stats = rec.stratStats[s];
            const avgCash = mean(list.map(t => t.cash));
            const avgTrades = mean(list.map(t => t.tradesCount));
            const avgFees = mean(list.map(t => t.totalFees));
            const retClass = stats.avgReturn > 0.005 ? 'up' : stats.avgReturn < -0.005 ? 'down' : '';
            const tickerBreakdown = STOCK_ORDER.map(tk => {
                const held = mean(list.map(t => t.holdings[tk]));
                const pct100 = pct(stats.perTicker[tk], 0);
                return `<span style="color:${STOCK_COLORS[tk]}">${tk} ${fmt(held, 0)}股 (${pct100})</span>`;
            }).join('<br>');
            const div = document.createElement('div');
            div.className = `strategy-card tag-${s}`;
            div.innerHTML = `
                <div class="name">${info.label}</div>
                <div class="row"><span>累計報酬</span><span class="v ${retClass}">${stats.avgReturn >= 0 ? '+' : ''}${pct(stats.avgReturn)}</span></div>
                <div class="row"><span>平均資產</span><span class="v">${fmt(stats.avgPortfolio, 0)}</span></div>
                <div class="row"><span>持股比例</span><span class="v">${pct(stats.equityPct, 0)}</span></div>
                <div class="row"><span>累計交易次數</span><span class="v">${fmt(avgTrades, 0)}</span></div>
                <div class="row"><span>累計手續費</span><span class="v" style="color:var(--down)">${fmt(avgFees, 0)}</span></div>
                <div class="row ticker-breakdown"><span>3 支配置</span><span class="v" style="font-size:.78em;text-align:right;line-height:1.3">${tickerBreakdown}</span></div>
            `;
            grid.appendChild(div);
        }
    }

    function pushLog(rec, market) {
        const log = $('log');
        const entry = document.createElement('div');
        entry.className = 'entry entry-daily';
        // 找今日領先者
        let bestS = null, bestR = -Infinity;
        for (const s of STRATEGY_ORDER) {
            if (rec.stratStats[s].avgReturn > bestR) {
                bestR = rec.stratStats[s].avgReturn;
                bestS = s;
            }
        }
        const priceStr = STOCK_ORDER.map(tk => {
            const base = market.dailyStats[0].prices[tk];
            const norm = (rec.prices[tk] / base) * 100;
            return `<span style="color:${STOCK_COLORS[tk]}">${tk} ${fmt(norm, 0)}</span>`;
        }).join(' ');
        entry.innerHTML = `<span class="day">${dayToYm(rec.day)}</span> · ${priceStr} · 領先 <b style="color:${STRATEGY_INFO[bestS].color}">${STRATEGY_INFO[bestS].label}</b> (${bestR >= 0 ? '+' : ''}${pct(bestR)})`;
        log.prepend(entry);
        // 只 trim 每日 log entry，保留新聞事件（否則長時間跑會把 2008 新聞沖走）
        const dailies = log.querySelectorAll('.entry-daily');
        for (let i = dailies.length - 1; i >= 60; i--) dailies[i].remove();
    }

    function pushNewsLog(day, magnitude, label) {
        const log = $('log');
        const entry = document.createElement('div');
        entry.className = 'entry entry-news';
        const sign = magnitude >= 0 ? '+' : '';
        entry.innerHTML = `<span class="day">${dayToYm(day)}</span> · <span class="news">📢 ${label} 內在價值 ${sign}${pct(magnitude, 0)}</span>`;
        log.prepend(entry);
    }

    function tickOnce() {
        if (!market) return;
        const rec = market.stepOneDay();
        if (!rec) { pause(); return; }   // 歷史數據跑完了
        updateStatsUI(rec, market);
        renderStrategyLegend(rec);
        renderStrategyCards(rec, market);
        renderTradeDetails(market);
        pushBubbles(rec);
        pushLog(rec, market);
        // 歷史事件標籤（2008 / 2020 / 2022 ...），命中 shock 起始日時貼一條到市場日誌
        const news = market.newsSchedule[rec.day];
        if (news) for (const n of news) pushNewsLog(rec.day, n.magnitude, `${n.ticker} · ${n.event}`);
        for (const tk of STOCK_ORDER) tickerCharts[tk] && tickerCharts[tk].render(market.dailyStats, market);
        spawnOverlayBubbles(rec);
        strategyChart.render(market.dailyStats);
    }

    // 在 K 線圖上浮出今日交易泡泡：買在成交價下方冒上來，賣在上方冒
    // 每策略×每 ticker×每動作只出 1 顆（避免同策略 6 個 trader 洗版）
    function spawnOverlayBubbles(rec) {
        const bubbles = rec.bubbles || [];
        if (!bubbles.length) return;
        const seen = new Set();
        for (const b of bubbles) {
            const key = `${b.strategy}-${b.ticker}-${b.action}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const chart = tickerCharts[b.ticker];
            if (!chart) continue;
            const overlay = $('overlay-' + b.ticker.toLowerCase());
            if (!overlay) continue;
            const pt = chart.pixelForDayPrice(rec.day, b.price);
            if (!pt) continue;
            const info = STRATEGY_INFO[b.strategy];
            const el = document.createElement('div');
            el.className = 'mini-bubble' + (b.action === 'buy' ? ' below' : '');
            el.style.setProperty('--strat-color', info.color);
            el.style.left = pt.x + 'px';
            // 買泡泡放在低點下方（成交價 + 一點偏移），賣泡泡放在高點上方
            el.style.top = (pt.y + (b.action === 'buy' ? 10 : -10)) + 'px';
            const actLabel = b.action === 'buy' ? '買' : '賣';
            const actCls = b.action === 'buy' ? 'act-buy' : 'act-sell';
            el.innerHTML = `<span class="strat-tag">${info.label}</span><span class="${actCls}">${actLabel}</span> ${b.shares}股` +
                (b.reason ? `<br><span style="color:var(--muted);font-size:.92em">${b.reason}</span>` : '');
            overlay.appendChild(el);
            // 3.2s 後（動畫結束）自動移除，避免 DOM 累積
            setTimeout(() => el.remove(), 3200);
        }
    }

    // 決策泡泡：對每天的 bubbles 抽樣（最多 3 條 / 天），塞進 stream；stream 只留 30 條
    function pushBubbles(rec) {
        const stream = $('bubble-stream');
        if (!stream) return;
        const b = rec.bubbles || [];
        if (!b.length) return;
        // 每策略最多 1 條 / 天，避免同策略 6 個 trader 洗版
        const seenStrat = new Set();
        const pick = [];
        for (const bb of b) {
            const key = `${bb.strategy}-${bb.ticker}-${bb.action}`;
            if (seenStrat.has(key)) continue;
            seenStrat.add(key);
            pick.push(bb);
            if (pick.length >= 3) break;
        }
        for (const bb of pick) {
            const info = STRATEGY_INFO[bb.strategy];
            const tickerColor = STOCK_COLORS[bb.ticker];
            const actLabel = bb.action === 'buy' ? '買' : '賣';
            const actClass = bb.action === 'buy' ? 'act-buy' : 'act-sell';
            const div = document.createElement('div');
            div.className = `bubble tag-${bb.strategy}`;
            div.style.setProperty('--strat-color', info.color);
            div.innerHTML =
                `<div class="bubble-head">` +
                    `<span class="bubble-strat">${info.label}</span>` +
                    `<span class="bubble-day">${dayToYm(rec.day)}</span>` +
                `</div>` +
                `<div class="bubble-body">` +
                    `<span class="${actClass}">${actLabel}</span> ` +
                    `<b style="color:${tickerColor}">${bb.ticker}</b> ` +
                    `${bb.shares}股 @$${bb.price.toFixed(1)}` +
                `</div>` +
                (bb.reason ? `<div class="bubble-reason">「${bb.reason}」</div>` : '');
            stream.prepend(div);
        }
        while (stream.children.length > 30) stream.removeChild(stream.lastChild);
    }

    // 各策略近期交易明細（每個策略拉自己 cohort 所有 trader 的 tradeHistory，取最近 8 筆）
    function renderTradeDetails(market) {
        const container = $('trade-details');
        if (!container) return;
        container.innerHTML = '';
        for (const s of STRATEGY_ORDER) {
            const info = STRATEGY_INFO[s];
            // 這個策略所有 trader 的所有交易，攤平 + 按 day desc 排
            const all = [];
            for (const t of market.traders) {
                if (t.strategy !== s) continue;
                for (const tr of t.tradeHistory) {
                    all.push({ ...tr, traderId: t.id });
                }
            }
            all.sort((a, b) => b.day - a.day);
            const recent = all.slice(0, 8);
            const div = document.createElement('div');
            div.className = `trade-block tag-${s}`;
            const rows = recent.length === 0
                ? `<tr><td colspan="5" class="muted">尚無交易</td></tr>`
                : recent.map(tr => `
                    <tr class="${tr.action}">
                        <td>${dayToYm(tr.day)}</td>
                        <td style="color:${STOCK_COLORS[tr.ticker]}">${tr.ticker}</td>
                        <td>${tr.action === 'buy' ? '買' : '賣'}</td>
                        <td>${tr.shares}</td>
                        <td>${fmt(tr.price)}</td>
                    </tr>`).join('');
            div.innerHTML = `
                <div class="trade-block-head" style="border-color:${info.color}">
                    <span class="trade-block-name" style="color:${info.color}">${info.label}</span>
                    <span class="trade-block-total">共 ${all.length} 筆</span>
                </div>
                <table class="trade-table">
                    <thead><tr><th>日</th><th>股</th><th>動作</th><th>股數</th><th>價</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            container.appendChild(div);
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
        tickerCharts = {};
        for (const tk of STOCK_ORDER) {
            const cvs = $('chart-' + tk.toLowerCase());
            if (cvs) tickerCharts[tk] = new TickerChart(cvs, tk);
        }
        strategyChart = new StrategyChart($('strategy-chart'));
        bubbleQueue = [];
        $('bubble-stream').innerHTML = '';
        for (const tk of STOCK_ORDER) {
            const ov = $('overlay-' + tk.toLowerCase());
            if (ov) ov.innerHTML = '';
        }
        // 塞一筆「起始日」進 dailyStats 讓正規化圖有起點（startDay 可能不是 0）
        const prices0 = {}, mas0 = {};
        const startDay = market.startDay;
        for (const tk of STOCK_ORDER) {
            prices0[tk] = market.stocks[tk].priceAt(startDay);
            mas0[tk] = market.stocks[tk].weeklyMA(startDay, 20) || prices0[tk];
        }
        const day0Rec = {
            day: startDay, prices: prices0, mas: mas0, marketVolumes: {},
            tradesCount: 0,
            bubbles: [],
            stratStats: Object.fromEntries(STRATEGY_ORDER.map(s => [s, {
                avgPortfolio: cfg.initialCash, avgReturn: 0, equityPct: 0,
                perTicker: Object.fromEntries(STOCK_ORDER.map(t => [t, 0])),
            }])),
        };
        market.dailyStats.push(day0Rec);
        for (const tk of STOCK_ORDER) tickerCharts[tk] && tickerCharts[tk].render([day0Rec], market);
        strategyChart.render([day0Rec]);
        updateStatsUI(day0Rec, market);
        renderStrategyLegend(day0Rec);
        renderStrategyCards(day0Rec, market);
        renderTradeDetails(market);
        $('log').innerHTML = '';
    }

    function reset() { pause(); initMarket(); }

    // 跳到特定 day —— 只快速執行 stepOneDay 到那一天，不 render 中間
    // 但沿路的新聞事件還是要進日誌（不然 jump-2008 時看不到「2008 金融海嘯」）
    function fastForwardTo(targetDay) {
        if (!market) initMarket();
        while (market.day < targetDay && market.day < market.endDay) {
            market.stepOneDay();
            const news = market.newsSchedule[market.day];
            if (news) for (const n of news) pushNewsLog(market.day, n.magnitude, `${n.ticker} · ${n.event}`);
        }
        tickOnce();   // 最後渲染一次
    }

    // 套用年份區間 preset：改 input value → 重置模擬 → 開始
    function applyYearPreset(startYear, endYear) {
        pause();
        $('cfg-start-year').value = String(startYear);
        $('cfg-end-year').value = String(endYear);
        initMarket();
    }

    function bootstrap() {
        initMarket();
        $('btn-run').addEventListener('click', start);
        $('btn-pause').addEventListener('click', pause);
        $('btn-step').addEventListener('click', () => { if (!market) initMarket(); tickOnce(); });
        $('btn-reset').addEventListener('click', reset);
        const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
        bind('btn-preset-2008', () => applyYearPreset(2007, 2010));
        bind('btn-preset-2020', () => applyYearPreset(2019, 2021));
        bind('btn-preset-2022', () => applyYearPreset(2021, 2023));
        bind('btn-preset-bull', () => applyYearPreset(2010, 2019));
        bind('btn-preset-full', () => applyYearPreset(2006, 2025));
        $('cfg-speed').addEventListener('change', () => {
            if (timer) { pause(); start(); }
        });
        // 改起始 / 結束年 → 自動重置（否則使用者要按重置才會生效）
        for (const id of ['cfg-start-year', 'cfg-end-year']) {
            const el = $(id);
            if (el) el.addEventListener('change', reset);
        }
    }

    // Script 在 body 末尾載入時 DOM 已就緒；DOMContentLoaded 可能已經 fire 過
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
