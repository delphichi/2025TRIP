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
                { day: 480,  magnitude: -0.10, duration: 40 },   // 2007 次貸警訊
                { day: 700,  magnitude: -0.40, duration: 120 },  // 2008 金融海嘯
                { day: 3500, magnitude: -0.28, duration: 22 },   // 2020 COVID 崩盤
                { day: 3530, magnitude: 0.18,  duration: 60 },   // COVID 反彈
                { day: 4100, magnitude: -0.16, duration: 200 },  // 2022 升息修正
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
                { day: 700,  magnitude: -0.42, duration: 130 },  // 2008 科技股也重傷
                { day: 3500, magnitude: -0.22, duration: 20 },   // 2020 COVID 較輕
                { day: 3530, magnitude: 0.35,  duration: 80 },   // 科技股大牛市反彈
                { day: 4100, magnitude: -0.32, duration: 220 },  // 2022 科技股崩盤
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
                { day: 700,  magnitude: -0.60, duration: 180 },  // 2008 銀行差點爆
                { day: 850,  magnitude: 0.25,  duration: 100 },  // 政府救援後反彈
                { day: 3500, magnitude: -0.35, duration: 20 },   // 2020 銀行嚇壞
                { day: 3530, magnitude: 0.22,  duration: 90 },   // 反彈
                { day: 4100, magnitude: -0.05, duration: 100 },  // 2022 升息銀行受惠，跌得少
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
                return { action: 'sell', dollars: shares * price };
            }
            // 買：20 天 cooldown + 折價 3% 才進場
            if (t.lastTradeDay[ticker] !== null && day - t.lastTradeDay[ticker] < 20) {
                return { action: 'hold', dollars: 0 };
            }
            const under = (ma - price) / ma;
            if (under >= 0.03 && t.cash > price) {
                const perStockBudget = t.initialCash / 3;
                const aggr = clamp(0.20 + under * 3, 0.20, 0.60);
                return { action: 'buy', dollars: Math.min(t.cash * 0.5, perStockBudget * aggr) };
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
            if (t.cash >= amount) return { action: 'buy', dollars: amount };
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
                return { action: 'buy', dollars: Math.min(t.cash * 0.3, perStockBudget * 0.15) };
            }
            if (priceLower && volLower && t.holdings[ticker] > 0) {
                return { action: 'sell', dollars: t.holdings[ticker] * price * 0.30 };
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
                return { action: 'sell', dollars: t.holdings[ticker] * price * clamp(spike * 5, 0.1, 0.4) };
            }
            if (spike < -0.03 && t.cash > price) {
                return { action: 'buy', dollars: Math.min(t.cash * 0.3, perStockBudget * clamp(-spike * 5, 0.1, 0.4)) };
            }
            return { action: 'hold', dollars: 0 };
        },

        // 雜訊（對照組）
        noise(t, day, ticker, stock) {
            const price = stock.priceAt(day);
            const r = Math.random();
            if (r < 0.22 && t.cash > price) {
                return { action: 'buy', dollars: Math.min(t.cash * 0.15, t.initialCash / 3 * rand(0.05, 0.15)) };
            }
            if (r > 0.78 && t.holdings[ticker] > 0) {
                return { action: 'sell', dollars: t.holdings[ticker] * price * rand(0.05, 0.15) };
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
            this.tradeHistory = [];
        }

        decide(day, ticker, stock, cfg) {
            return STRATEGIES[this.strategy](this, day, ticker, stock, cfg);
        }

        executeBuy(day, ticker, dollars, price) {
            const shares = Math.floor(dollars / price);
            if (shares <= 0) return 0;
            const cost = shares * price;
            if (cost > this.cash) return 0;
            this.cash -= cost;
            this.holdings[ticker] += shares;
            if (this.holdings[ticker] > this.peakHoldings[ticker]) {
                this.peakHoldings[ticker] = this.holdings[ticker];
            }
            this.tradesCount += 1;
            this.lastTradeDay[ticker] = day;
            this.tradeHistory.push({ day, ticker, action: 'buy', shares, price });
            return shares;
        }

        executeSell(day, ticker, dollars, price) {
            const shares = Math.min(this.holdings[ticker], Math.floor(dollars / price));
            if (shares <= 0) return 0;
            this.cash += shares * price;
            this.holdings[ticker] -= shares;
            this.tradesCount += 1;
            this.lastTradeDay[ticker] = day;
            this.tradeHistory.push({ day, ticker, action: 'sell', shares, price });
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
            this.day = 0;
            this.stocks = {};
            for (const tk of STOCK_ORDER) this.stocks[tk] = new Stock(tk);
            this.maxDays = Math.min(...STOCK_ORDER.map(tk => this.stocks[tk].maxDays));
            this.traders = [];
            let id = 0;
            for (const s of STRATEGY_ORDER) {
                for (let i = 0; i < cfg.perStrategy; i++) {
                    this.traders.push(new Trader(id++, s, cfg.initialCash));
                }
            }
            this.dailyStats = [];
        }

        stepOneDay() {
            this.day += 1;
            if (this.day >= this.maxDays) {
                this.day = this.maxDays - 1;
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
            for (const t of this.traders) {
                const order = STOCK_ORDER.slice();
                shuffleInPlace(order);
                for (const tk of order) {
                    const stock = this.stocks[tk];
                    const d = t.decide(this.day, tk, stock, this.cfg);
                    if (d.action === 'buy' && d.dollars > 0) {
                        if (t.executeBuy(this.day, tk, d.dollars, prices[tk]) > 0) tradesToday++;
                    } else if (d.action === 'sell' && d.dollars > 0) {
                        if (t.executeSell(this.day, tk, d.dollars, prices[tk]) > 0) tradesToday++;
                    }
                }
            }

            // 每個策略的統計
            const stratStats = {};
            for (const s of STRATEGY_ORDER) {
                const list = this.traders.filter(t => t.strategy === s);
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

            // 3 支正規化到 Day 0 = 100，同軸比較累積回報
            const stockLines = STOCK_ORDER.map(tk => ({
                ticker: tk,
                values: sample.map(s => (s.prices[tk] / stats[0].prices[tk]) * 100),
                color: STOCK_COLORS[tk],
            }));
            let ymin = Math.min(...stockLines.flatMap(l => l.values));
            let ymax = Math.max(...stockLines.flatMap(l => l.values));
            const pad = (ymax - ymin) * 0.08 || 1;
            ymin -= pad; ymax += pad;
            const yr = ymax - ymin || 1;

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
                ctx.fillText(v.toFixed(0), padL - 4, y);
            }

            // 100 基準線加粗
            if (ymin < 100 && ymax > 100) {
                ctx.strokeStyle = '#94a3b8';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(padL, yAt(100));
                ctx.lineTo(padL + chartW, yAt(100));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 三條股價線
            for (const line of stockLines) {
                ctx.strokeStyle = line.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                line.values.forEach((v, i) => {
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
        const ticker = ($('cfg-ticker')?.value) || 'SPY';
        const valueSellPct = clamp(parseFloat($('cfg-value-sell')?.value) || 5, 0.5, 50);
        const dcaPct = clamp(parseFloat($('cfg-dca-pct')?.value) || 5, 0.5, 50);
        const speed = clamp(parseInt($('cfg-speed').value) || 500, 30, 30000);
        return { perStrategy, initialCash, ticker, valueSellPct, dcaPct, speed };
    }

    function updateStatsUI(rec, market) {
        $('stat-day').textContent = rec.day;
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
            const list = market.traders.filter(t => t.strategy === s);
            const stats = rec.stratStats[s];
            const avgCash = mean(list.map(t => t.cash));
            const avgTrades = mean(list.map(t => t.tradesCount));
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
                <div class="row ticker-breakdown"><span>3 支配置</span><span class="v" style="font-size:.78em;text-align:right;line-height:1.3">${tickerBreakdown}</span></div>
            `;
            grid.appendChild(div);
        }
    }

    function pushLog(rec, market) {
        const log = $('log');
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
        const priceStr = STOCK_ORDER.map(tk => {
            const base = market.dailyStats[0].prices[tk];
            const norm = (rec.prices[tk] / base) * 100;
            return `<span style="color:${STOCK_COLORS[tk]}">${tk} ${fmt(norm, 0)}</span>`;
        }).join(' ');
        entry.innerHTML = `<span class="day">Day ${rec.day}</span> · ${priceStr} · 領先 <b style="color:${STRATEGY_INFO[bestS].color}">${STRATEGY_INFO[bestS].label}</b> (${bestR >= 0 ? '+' : ''}${pct(bestR)})`;
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
        if (!rec) { pause(); return; }   // 歷史數據跑完了
        updateStatsUI(rec, market);
        renderStrategyLegend(rec);
        renderStrategyCards(rec, market);
        renderTradeDetails(market);
        pushLog(rec, market);
        priceChart.render(market.dailyStats);
        strategyChart.render(market.dailyStats);
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
                        <td>Day ${tr.day}</td>
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
        priceChart = new PriceChart($('price-chart'));
        strategyChart = new StrategyChart($('strategy-chart'));
        // 塞一筆 Day 0 進 dailyStats 讓正規化圖有起點
        const prices0 = {}, mas0 = {};
        for (const tk of STOCK_ORDER) {
            prices0[tk] = market.stocks[tk].priceAt(0);
            mas0[tk] = prices0[tk];
        }
        const day0Rec = {
            day: 0, prices: prices0, mas: mas0, marketVolumes: {},
            tradesCount: 0,
            stratStats: Object.fromEntries(STRATEGY_ORDER.map(s => [s, {
                avgPortfolio: cfg.initialCash, avgReturn: 0, equityPct: 0,
                perTicker: Object.fromEntries(STOCK_ORDER.map(t => [t, 0])),
            }])),
        };
        market.dailyStats.push(day0Rec);
        priceChart.render([day0Rec]);
        strategyChart.render([day0Rec]);
        updateStatsUI(day0Rec, market);
        renderStrategyLegend(day0Rec);
        renderStrategyCards(day0Rec, market);
        renderTradeDetails(market);
        $('log').innerHTML = '';
    }

    function reset() { pause(); initMarket(); }

    // 跳到特定 day —— 只快速執行 stepOneDay 到那一天，不 render 中間
    function fastForwardTo(targetDay) {
        if (!market) initMarket();
        while (market.day < targetDay && market.day < market.stock.maxDays - 1) {
            market.stepOneDay();
        }
        tickOnce();   // 最後渲染一次
    }

    function bootstrap() {
        initMarket();
        $('btn-run').addEventListener('click', start);
        $('btn-pause').addEventListener('click', pause);
        $('btn-step').addEventListener('click', () => { if (!market) initMarket(); tickOnce(); });
        $('btn-reset').addEventListener('click', reset);
        const jump08 = $('btn-jump-2008');
        if (jump08) jump08.addEventListener('click', () => { pause(); fastForwardTo(500); });
        const jump20 = $('btn-jump-2020');
        if (jump20) jump20.addEventListener('click', () => { pause(); fastForwardTo(3480); });
        const jump22 = $('btn-jump-2022');
        if (jump22) jump22.addEventListener('click', () => { pause(); fastForwardTo(4080); });
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
