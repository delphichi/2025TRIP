(function () {
    'use strict';

    // ---------- helpers ----------
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const fmtPct = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(0) + '%';

    // ---------- FinMind API（台股）----------
    // Base: https://api.finmindtrade.com/api/v4/data
    // Auth: ?token=XXX
    // 我們需要的 datasets：
    // - TaiwanStockPER: 個股 PER、PBR 每日資料（含 dividend_yield）
    // - TaiwanStockPrice: 股價（拿最新收盤）
    // - TaiwanStockInfo: 公司名 / 產業（可選）
    const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data';

    async function finMindFetch(dataset, dataId, startDate, endDate, token) {
        const params = new URLSearchParams({ dataset, data_id: dataId, start_date: startDate, token });
        if (endDate) params.append('end_date', endDate);
        const url = `${FINMIND_BASE}?${params}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status !== 200 && data.msg && data.msg !== 'success') {
            throw new Error(`FinMind: ${data.msg}`);
        }
        return data.data || [];
    }

    function todayMinusYears(years) {
        const now = new Date();
        const past = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
        return past.toISOString().substring(0, 10);
    }
    function todayStr() { return new Date().toISOString().substring(0, 10); }

    // ---------- 財報成長性（近 10 季 + YoY） ----------
    // 每個 metric 回傳：[{ date, value, yoy }] × 10
    // YoY 計算：找相同季度前一年的值比較
    // - 絕對值型（EPS、營收）: yoy = (cur - prior) / |prior|（%）
    // - 比率型（毛利率、營益率）: yoy = cur - prior（百分點 pp，非 %）

    function yoyDate(currentDate) {
        // "2024-03-31" → "2023-03-31"
        const parts = currentDate.split('-');
        return `${parseInt(parts[0]) - 1}-${parts[1]}-${parts[2]}`;
    }

    // FMP：/income-statement?symbol=X&period=quarter
    async function fetchFmpFundamentals(ticker, apiKey) {
        try {
            const rows = await fmpFetch(`/income-statement?symbol=${ticker}&period=quarter`, apiKey);
            if (!rows || rows.length === 0) return null;
            // 新到舊排序
            rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return processFundamentals(rows, {
                revenue: r => r.revenue,
                eps: r => r.eps,
                grossMargin: r => r.grossProfitRatio,   // 已經是 0-1 ratio
                operatingMargin: r => r.operatingIncomeRatio,
            });
        } catch (e) {
            console.warn('FMP fundamentals fetch failed:', e.message);
            return null;
        }
    }

    // FinMind：TaiwanStockFinancialStatements 是 long format
    // 需要 pivot：group by date、type 當欄位
    async function fetchFinMindFundamentals(ticker, token) {
        try {
            const startDate = todayMinusYears(4);   // 4 年 = 16 季足夠算 10 季 YoY
            const rows = await finMindFetch('TaiwanStockFinancialStatements', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            // Pivot：{ date: { type1: value1, type2: value2, ... } }
            const byDate = new Map();
            rows.forEach(r => {
                if (!byDate.has(r.date)) byDate.set(r.date, {});
                byDate.get(r.date)[r.type] = r.value;
            });
            // 排序（新到舊）並建構 wide rows
            const dates = Array.from(byDate.keys()).sort().reverse();
            const wideRows = dates.map(d => {
                const flat = byDate.get(d);
                // 試多個可能欄位名（FinMind schema 有時分 Revenue / OperatingRevenue）
                const revenue = flat.Revenue || flat.OperatingRevenue || flat.TotalRevenue || null;
                const grossProfit = flat.GrossProfit || flat.OperatingGrossProfit || null;
                const opIncome = flat.OperatingIncome || flat.OperatingProfit || null;
                const eps = flat.EPS || flat.BasicEPS || flat.DilutedEPS || null;
                return {
                    date: d,
                    revenue,
                    eps,
                    grossMargin: (grossProfit !== null && revenue) ? grossProfit / revenue : null,
                    operatingMargin: (opIncome !== null && revenue) ? opIncome / revenue : null,
                };
            });
            return processFundamentals(wideRows, {
                revenue: r => r.revenue,
                eps: r => r.eps,
                grossMargin: r => r.grossMargin,
                operatingMargin: r => r.operatingMargin,
            });
        } catch (e) {
            console.warn('FinMind fundamentals fetch failed:', e.message);
            return null;
        }
    }

    // 通用：從 rows 陣列（新到舊）+ getter map，算出近 10 季 + YoY
    function processFundamentals(rows, getters) {
        const dateSet = new Set(rows.map(r => r.date));
        const rowByDate = new Map(rows.map(r => [r.date, r]));
        const N = Math.min(10, rows.length);

        const build = (getter, isRatio) => {
            const entries = [];
            for (let i = 0; i < N; i++) {
                const cur = rows[i];
                const priorDate = yoyDate(cur.date);
                const prior = rowByDate.get(priorDate);
                const val = getter(cur);
                const priorVal = prior ? getter(prior) : null;
                let yoy = null;
                if (val !== null && val !== undefined && isFinite(val) &&
                    priorVal !== null && priorVal !== undefined && isFinite(priorVal) && priorVal !== 0) {
                    if (isRatio) {
                        yoy = val - priorVal;   // pp
                    } else {
                        yoy = (val - priorVal) / Math.abs(priorVal);   // %
                    }
                }
                entries.push({ date: cur.date, value: val, yoy });
            }
            return entries;
        };

        return {
            eps: build(getters.eps, false),
            revenue: build(getters.revenue, false),
            grossMargin: build(getters.grossMargin, true),
            operatingMargin: build(getters.operatingMargin, true),
        };
    }

    // 從每日 PER/PBR array 建構出年度統計 + 全部日資料當歷史樣本
    // 直方圖用「全部日資料」→ 樣本量比 FMP 年報大 250 倍、分佈更細
    async function fetchTwStockData(rawTicker, token, years) {
        setStatus('loading', `📡 抓 ${rawTicker} (FinMind) 資料中……`);
        // 統一格式：去掉 .TW 後綴
        const ticker = rawTicker.replace(/\.TW$/i, '').replace(/^tw/i, '').trim();
        if (!/^\d+$/.test(ticker)) throw new Error(`FinMind 台股 ticker 必須是純數字（例：2330、0050），你輸入 "${ticker}"`);
        const startDate = todayMinusYears(years);
        const endDate = todayStr();
        // 平行抓：PER 歷史 + 股價 + 公司資訊 + 財報成長性 + 現金流 + 法人買賣超
        const [perData, priceData, infoData, fundamentals, cashFlow, institutional] = await Promise.all([
            finMindFetch('TaiwanStockPER', ticker, startDate, endDate, token),
            finMindFetch('TaiwanStockPrice', ticker, todayMinusYears(0.05), endDate, token),
            finMindFetch('TaiwanStockInfo', ticker, '2020-01-01', endDate, token).catch(() => []),
            fetchFinMindFundamentals(ticker, token),
            fetchFinMindCashFlow(ticker, token),
            fetchInstitutionalTW(ticker, token),
        ]);

        if (!perData || perData.length === 0) throw new Error(`FinMind 找不到 ${ticker} 的 PER/PBR 資料（可能是新股或未收）`);

        // 最新 PER / PBR = 最後一筆
        const latest = perData[perData.length - 1];
        const currentPE = latest.PER;
        const currentPBR = latest.PBR;

        // 最新股價：取 priceData 最後一筆 close
        let price = null;
        if (priceData && priceData.length > 0) {
            price = priceData[priceData.length - 1].close;
        }

        // 公司名 & 產業
        let name = ticker;
        let sector = '';
        if (infoData && infoData.length > 0) {
            const info = infoData[infoData.length - 1];
            name = info.stock_name || ticker;
            sector = info.industry_category || '';
        }

        // 直方圖的樣本：每一天的 PER / PBR（過濾非數字）
        // FMP 是「年度」樣本 5-20 筆，FinMind 是「每日」樣本 1000-5000 筆——分佈更細
        const history = perData
            .filter(r => r.PER !== null && isFinite(r.PER) && r.PER > 0)   // 濾掉負數 PER（虧損公司）+ 0
            .map(r => ({
                year: r.date ? r.date.substring(0, 4) : '?',
                date: r.date,
                pe: r.PER,
                pbr: r.PBR,
            }));

        if (history.length < 30) throw new Error(`歷史樣本太少（只 ${history.length} 天），可能是新股`);

        return {
            ticker,
            name,
            price,
            currentPE,
            currentPBR,
            marketCap: null,
            history,
            latestRatioDate: latest.date,
            sector,
            source: 'FinMind',
            fundamentals,
            cashFlow,
            institutional,
        };
    }

    // ---------- FMP API ----------
    // Financial Modeling Prep：新版 stable API（2024 改版，取代舊 /api/v3）
    // 端點格式改成 query param：/stable/{endpoint}?symbol=TICKER
    // - /stable/quote?symbol=X       即時 quote（含 pe、marketCap）
    // - /stable/profile?symbol=X     公司基本資料
    // - /stable/ratios?symbol=X      歷年年度 ratios（含 priceEarningsRatio、priceToBookRatio）
    // - /stable/ratios-ttm?symbol=X  TTM ratios（最新 12 個月）
    const FMP_BASE = 'https://financialmodelingprep.com/stable';

    async function fmpFetch(path, apiKey) {
        const url = `${FMP_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
                const errBody = await res.json();
                if (errBody['Error Message']) msg = errBody['Error Message'];
                else if (errBody.message) msg = errBody.message;
            } catch (_) {}
            // 常見錯誤翻譯
            if (res.status === 401) msg = 'API key 無效或未啟用';
            if (res.status === 403) msg = '這個 endpoint 需要付費 tier';
            if (res.status === 429) msg = '免費額度已用完（250 次/日），明天再試 or 升級';
            throw new Error(msg);
        }
        const data = await res.json();
        if (data['Error Message']) throw new Error(data['Error Message']);
        return data;
    }

    // 防禦性讀值：新舊 API 欄位名可能不同，multi-try
    function pickField(obj, ...names) {
        for (const n of names) {
            if (obj[n] !== null && obj[n] !== undefined) return obj[n];
        }
        return null;
    }

    async function fetchStockData(ticker, apiKey, years) {
        setStatus('loading', `📡 抓 ${ticker} 資料中……`);

        // 平行抓：quote + profile + ratios + fundamentals + cashflow
        const [quote, profile, ratios, fundamentals, cashFlow] = await Promise.all([
            fmpFetch(`/quote?symbol=${ticker}`, apiKey),
            fmpFetch(`/profile?symbol=${ticker}`, apiKey),
            fmpFetch(`/ratios?symbol=${ticker}`, apiKey),
            fetchFmpFundamentals(ticker, apiKey),
            fetchFmpCashFlow(ticker, apiKey),
        ]);

        if (!quote || quote.length === 0) throw new Error(`找不到 ticker: ${ticker}（FMP 資料庫沒收 or 格式錯，台股要加 .TW）`);
        const q = quote[0];
        const p = profile && profile[0] ? profile[0] : {};

        if (!ratios || ratios.length === 0) throw new Error(`${ticker} 沒有歷年 ratio 資料（可能是新股、ETF、指數 或 FMP 未收）`);

        // 抓完全部（新 API 沒 limit param），client 端 slice 取要的年數
        // 欄位名新舊都試：priceEarningsRatio / peRatio、priceToBookRatio / pbRatio
        const peHistory = ratios.map(r => ({
            year: r.date ? r.date.substring(0, 4) : (r.calendarYear || '?'),
            pe: pickField(r, 'priceEarningsRatio', 'peRatio', 'pe'),
            pbr: pickField(r, 'priceToBookRatio', 'pbRatio', 'pb'),
        })).filter(r => r.pe !== null && isFinite(r.pe));

        if (peHistory.length < 3) throw new Error(`歷年 PE 樣本不足（只有 ${peHistory.length} 年），無法統計`);

        // 只保留要求的年數（FMP 回傳從新到舊）
        const sliced = peHistory.slice(0, years);
        // 反轉：改成舊到新方便繪圖
        sliced.reverse();

        // 當前 PE：優先 quote.pe，其次 price / eps
        let currentPE = pickField(q, 'pe', 'peRatio');
        if (!currentPE && q.price && q.eps) currentPE = q.price / q.eps;

        // 當前 PBR：用最新一筆 ratio（ratios[0] 是最新的年報）
        let currentPBR = pickField(ratios[0] || {}, 'priceToBookRatio', 'pbRatio', 'pb');

        return {
            ticker,
            name: p.companyName || q.name || ticker,
            price: q.price,
            currentPE,
            currentPBR,
            marketCap: q.marketCap,
            history: sliced,
            latestRatioDate: ratios[0] ? ratios[0].date : null,
            sector: p.sector,
            industry: p.industry,
            fundamentals,
            cashFlow,
            institutional: null,   // FMP 沒有 13F 這麼細，US 目前跳過
        };
    }

    // ---------- Percentile / Statistics ----------
    function percentileOf(value, sortedArray) {
        // 回傳 value 在 sortedArray 的百分位（0-1）
        // 小於 25% = 便宜、大於 75% = 貴
        if (!sortedArray.length) return null;
        let countBelow = 0;
        for (const v of sortedArray) if (v < value) countBelow += 1;
        return countBelow / sortedArray.length;
    }

    function stats(arr) {
        if (!arr.length) return null;
        const sorted = arr.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const median = sorted[Math.floor(sorted.length * 0.50)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
        return { min, q1, median, q3, max, mean, sorted };
    }

    // ---------- Verdict ----------
    function verdict(pePercentile, pbrPercentile) {
        // 綜合 PE 跟 PBR 的百分位
        // 兩個都 < 25% → 便宜；兩個都 > 75% → 貴；混合 → 觀察
        const pe = pePercentile;
        const pbr = pbrPercentile;
        if (pe === null && pbr === null) return { kind: 'warning', title: '⚠️ 資料不足' };

        // 只有其中一個有值
        const values = [pe, pbr].filter(v => v !== null);
        const avg = values.reduce((s, v) => s + v, 0) / values.length;

        if (avg < 0.25) {
            return {
                kind: 'cheap',
                title: '🟢 相對便宜區間（歷史低點附近）',
                body: '<b>當前 PE / PBR 在歷史前 25% 便宜區間</b>。若基本面沒有結構性變化，這是<b>買進候選</b>。但務必檢查：(1) 為什麼便宜？產業趨勢有變嗎？(2) EPS 是否可持續？(3) 產業景氣位置？',
            };
        } else if (avg < 0.50) {
            return {
                kind: 'cheap',
                title: '🟢 中低區間',
                body: '<b>比歷史中位數低</b>，值得觀察。這種區間常是「盤整期」，可以分批建倉或等更便宜再進。',
            };
        } else if (avg < 0.75) {
            return {
                kind: 'fair',
                title: '🟡 中高區間',
                body: '<b>比歷史中位數高</b>。若非高成長股，建議<b>暫緩加碼</b>，或改看其他標的。已持有的可繼續拿但別追高。',
            };
        } else {
            return {
                kind: 'expensive',
                title: '🔴 歷史昂貴區間（前 25%）',
                body: '<b>當前 PE / PBR 在歷史前 25% 昂貴區間</b>。除非有明確的<b>結構性利多</b>（新事業、市佔擴張、產業重估），否則<b>不建議追買</b>。已持有的可考慮部分獲利了結。',
            };
        }
    }

    // ---------- Chart：分佈直方圖 + 當前值標記 ----------
    function drawHistogram(canvas, data, currentValue, label) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const padL = 40, padR = 20, padT = 20, padB = 30;
        const chartW = w - padL - padR;
        const chartH = h - padT - padB;

        if (!data || data.length === 0) {
            ctx.fillStyle = '#aaa';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('資料不足', w / 2, h / 2);
            return;
        }

        // 決定 x 範圍：包含當前值 + 一點 padding
        let minVal = Math.min(...data, currentValue !== null ? currentValue : Infinity);
        let maxVal = Math.max(...data, currentValue !== null ? currentValue : -Infinity);
        const range = maxVal - minVal;
        if (range === 0) { minVal -= 1; maxVal += 1; }
        else { minVal -= range * 0.1; maxVal += range * 0.1; }

        // 用 10 個 bin 做直方圖
        const nBins = 10;
        const binWidth = (maxVal - minVal) / nBins;
        const bins = new Array(nBins).fill(0);
        data.forEach(v => {
            const idx = Math.min(nBins - 1, Math.floor((v - minVal) / binWidth));
            bins[idx] += 1;
        });
        const maxCount = Math.max(...bins, 1);

        // 畫 bins
        const barW = chartW / nBins;
        bins.forEach((count, i) => {
            const barH = (count / maxCount) * chartH;
            const x = padL + i * barW;
            const y = padT + chartH - barH;
            ctx.fillStyle = '#5eead4';
            ctx.fillRect(x + 1, y, barW - 2, barH);
            ctx.strokeStyle = '#0f766e';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y, barW - 2, barH);
        });

        // 畫當前值標記線
        if (currentValue !== null && currentValue !== undefined && isFinite(currentValue)) {
            const xCurrent = padL + ((currentValue - minVal) / (maxVal - minVal)) * chartW;
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(xCurrent, padT);
            ctx.lineTo(xCurrent, padT + chartH);
            ctx.stroke();
            ctx.setLineDash([]);

            // 標籤：當前值
            ctx.fillStyle = '#f97316';
            ctx.font = '700 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`當前 ${fmt(currentValue, 1)}`, xCurrent, padT - 4);
        }

        // 畫百分位線（25、50、75）
        const sorted = data.slice().sort((a, b) => a - b);
        [0.25, 0.5, 0.75].forEach(p => {
            const val = sorted[Math.floor(sorted.length * p)];
            const x = padL + ((val - minVal) / (maxVal - minVal)) * chartW;
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + chartH);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#6b7280';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${(p * 100).toFixed(0)}%`, x, padT + chartH + 14);
        });

        // x 軸 min/max 標籤
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(fmt(minVal, 1), padL, padT + chartH + 26);
        ctx.textAlign = 'right';
        ctx.fillText(fmt(maxVal, 1), padL + chartW, padT + chartH + 26);
    }

    // ---------- Rendering ----------
    function renderResult(analysis) {
        const { ticker, name, price, currentPE, currentPBR, history, latestRatioDate, sector } = analysis;

        $('result-panel').hidden = false;
        $('result-ticker').textContent = `${ticker}${name && name !== ticker ? ' · ' + name : ''}${sector ? ' · ' + sector : ''}`;
        $('result-price').textContent = price !== null ? '$' + fmt(price, 2) : '—';
        $('result-pe').textContent = currentPE !== null && isFinite(currentPE) ? fmt(currentPE, 1) : '—';
        $('result-pbr').textContent = currentPBR !== null && isFinite(currentPBR) ? fmt(currentPBR, 2) : '—';
        // 樣本：若 daily 顯示筆數 + 年份跨度；若 annual 顯示年數
        if (history.length > 30) {
            const yearSpan = `${history[0].year}-${history[history.length - 1].year}`;
            $('result-samples').textContent = `${history.length} 筆 · ${yearSpan}`;
        } else {
            $('result-samples').textContent = `${history.length} 年（${history[0].year}-${history[history.length - 1].year}）`;
        }

        // 分佈統計
        const peValues = history.map(h => h.pe).filter(v => v !== null && isFinite(v));
        const pbrValues = history.map(h => h.pbr).filter(v => v !== null && isFinite(v));
        const peSorted = peValues.slice().sort((a, b) => a - b);
        const pbrSorted = pbrValues.slice().sort((a, b) => a - b);

        const peStats = stats(peValues);
        const pbrStats = stats(pbrValues);

        const pePercentile = currentPE !== null && isFinite(currentPE) ? percentileOf(currentPE, peSorted) : null;
        const pbrPercentile = currentPBR !== null && isFinite(currentPBR) ? percentileOf(currentPBR, pbrSorted) : null;

        // Verdict
        const v = verdict(pePercentile, pbrPercentile);
        const box = $('verdict-box');
        box.className = 'verdict-box ' + v.kind;
        $('verdict-title').textContent = v.title;
        let bodyHtml = v.body || '';
        // 補充：實際百分位數字
        if (pePercentile !== null) {
            bodyHtml += `<br><br><b>PE 百分位</b>：${fmtPct(pePercentile)}（${fmt(currentPE, 1)} vs 歷史中位數 ${fmt(peStats.median, 1)}）`;
        }
        if (pbrPercentile !== null) {
            bodyHtml += `<br><b>PBR 百分位</b>：${fmtPct(pbrPercentile)}（${fmt(currentPBR, 2)} vs 歷史中位數 ${fmt(pbrStats.median, 2)}）`;
        }
        $('verdict-body').innerHTML = bodyHtml;

        // Charts
        drawHistogram($('pe-chart'), peValues, currentPE, 'PE');
        drawHistogram($('pbr-chart'), pbrValues, currentPBR, 'PBR');

        $('pe-legend').innerHTML = `
            最低 <span class="val cheap">${fmt(peStats.min, 1)}</span> ·
            25% <span class="val">${fmt(peStats.q1, 1)}</span> ·
            中位 <span class="val">${fmt(peStats.median, 1)}</span> ·
            75% <span class="val">${fmt(peStats.q3, 1)}</span> ·
            最高 <span class="val expensive">${fmt(peStats.max, 1)}</span> ·
            平均 <span class="val">${fmt(peStats.mean, 1)}</span>
        `;
        $('pbr-legend').innerHTML = `
            最低 <span class="val cheap">${fmt(pbrStats.min, 2)}</span> ·
            25% <span class="val">${fmt(pbrStats.q1, 2)}</span> ·
            中位 <span class="val">${fmt(pbrStats.median, 2)}</span> ·
            75% <span class="val">${fmt(pbrStats.q3, 2)}</span> ·
            最高 <span class="val expensive">${fmt(pbrStats.max, 2)}</span> ·
            平均 <span class="val">${fmt(pbrStats.mean, 2)}</span>
        `;

        // Detail 表：若樣本 > 30 筆（FinMind 每日資料），按年 groupby 顯示年度中位；否則直接列
        let tableHtml = `<h3>📋 歷年數據</h3><table>`;
        if (history.length > 30) {
            // FinMind daily：按年 aggregate 顯示中位、min、max
            tableHtml += '<tr><th>年份</th><th>PE 中位</th><th>PE min-max</th><th>PBR 中位</th></tr>';
            const byYear = new Map();
            history.forEach(h => {
                if (!byYear.has(h.year)) byYear.set(h.year, { pe: [], pbr: [] });
                byYear.get(h.year).pe.push(h.pe);
                if (h.pbr !== null && isFinite(h.pbr)) byYear.get(h.year).pbr.push(h.pbr);
            });
            const yearsList = Array.from(byYear.keys()).sort().reverse();
            yearsList.forEach(y => {
                const g = byYear.get(y);
                const peSorted = g.pe.slice().sort((a, b) => a - b);
                const peMed = peSorted[Math.floor(peSorted.length / 2)];
                const peMin = peSorted[0];
                const peMax = peSorted[peSorted.length - 1];
                const pbrSorted = g.pbr.slice().sort((a, b) => a - b);
                const pbrMed = pbrSorted.length > 0 ? pbrSorted[Math.floor(pbrSorted.length / 2)] : null;
                tableHtml += `<tr>
                    <td>${y}（${g.pe.length} 筆）</td>
                    <td>${fmt(peMed, 1)}</td>
                    <td>${fmt(peMin, 1)} – ${fmt(peMax, 1)}</td>
                    <td>${fmt(pbrMed, 2)}</td>
                </tr>`;
            });
        } else {
            // FMP annual：直接列
            tableHtml += '<tr><th>年份</th><th>PE</th><th>PBR</th></tr>';
            history.slice().reverse().forEach(h => {
                tableHtml += `<tr>
                    <td>${h.year}</td>
                    <td>${fmt(h.pe, 1)}</td>
                    <td>${fmt(h.pbr, 2)}</td>
                </tr>`;
            });
        }
        tableHtml += '</table>';
        if (latestRatioDate) {
            tableHtml += `<p class="hint">歷年 ratio 資料來自年報，最新一筆日期：<b>${latestRatioDate}</b>。若日期太舊（例如超過 1 年），當前 PE 用 quote 的 real-time 值（price / EPS-TTM），跟歷年可能有基準差異。</p>`;
        }
        // 層次 2-5 表順序：現金流背離 → 財報成長性 → 法人買賣超 → 融資餘額 → 歷年 ratio
        const cfHtml = renderCashFlowHtml(analysis.cashFlow);
        const fundHtml = renderFundamentalsHtml(analysis.fundamentals);
        const instHtml = renderInstitutionalHtml(analysis.institutional);
        const marginHtml = renderMarginHtml(analysis.marginTW, analysis.dividendsTW);
        $('detail-box').innerHTML = cfHtml + fundHtml + instHtml + marginHtml + tableHtml;

        setStatus('success', `✅ 查到 ${ticker} 資料`);
    }

    // ---------- 現金流量（層次 2：獲利品質核心） ----------
    // 檢測「淨利 vs 營運CF 背離」：淨利↑ 但 CF↓ = 應收膨脹 or 存貨堆積 = 紙上獲利
    async function fetchFmpCashFlow(ticker, apiKey) {
        try {
            const rows = await fmpFetch(`/cash-flow-statement?symbol=${ticker}&period=quarter`, apiKey);
            if (!rows || rows.length === 0) return null;
            rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return processCashFlow(rows, {
                operatingCF: r => r.operatingCashFlow,
                freeCF: r => r.freeCashFlow,
                netIncome: r => r.netIncome,
            });
        } catch (e) {
            console.warn('FMP cash flow fetch failed:', e.message);
            return null;
        }
    }

    async function fetchFinMindCashFlow(ticker, token) {
        try {
            const startDate = todayMinusYears(4);
            // 兩張表要一起抓：
            // - CashFlowsStatement: YTD 累計，拿營運CF + CapEx（要差分成單季）
            // - FinancialStatements: 單季，拿稅後淨利 IncomeAfterTaxes（不用差分）
            // 為什麼不從現金流表拿淨利？——現金流表只有稅前（IncomeBeforeIncomeTaxFromContinuingOperations
            //   跟 NetIncomeBeforeTax），這是「用來回算調整項」的起始點，不是損益表的稅後淨利。
            //   拿稅前來跟營運CF 比獲利品質背離、基準點就錯了（稅前 vs 稅後差~20%）。
            const [cfRows, fsRows] = await Promise.all([
                finMindFetch('TaiwanStockCashFlowsStatement', ticker, startDate, todayStr(), token),
                finMindFetch('TaiwanStockFinancialStatements', ticker, startDate, todayStr(), token),
            ]);
            if (!cfRows || cfRows.length === 0) return null;

            // Pivot 現金流表（YTD 累計）
            const cfByDate = new Map();
            cfRows.forEach(r => {
                if (!cfByDate.has(r.date)) cfByDate.set(r.date, {});
                cfByDate.get(r.date)[r.type] = r.value;
            });
            // Pivot 損益表（單季）→ 拿稅後淨利
            const fsByDate = new Map();
            (fsRows || []).forEach(r => {
                if (!fsByDate.has(r.date)) fsByDate.set(r.date, {});
                fsByDate.get(r.date)[r.type] = r.value;
            });

            const datesAsc = Array.from(cfByDate.keys()).sort();
            const ytdByDate = new Map();
            datesAsc.forEach(d => {
                const flat = cfByDate.get(d);
                const opCF = flat.CashFlowsFromOperatingActivities
                          ?? flat.NetCashInflowFromOperatingActivities ?? null;
                const capEx = flat.PropertyAndPlantAndEquipment ?? null;
                const fcf = (opCF !== null && capEx !== null) ? opCF + capEx : null;
                ytdByDate.set(d, { date: d, opCF, fcf });
            });

            const prevQuarterDate = d => {
                const [y, m] = d.split('-').map(Number);
                if (m === 3)  return null;
                if (m === 6)  return `${y}-03-31`;
                if (m === 9)  return `${y}-06-30`;
                if (m === 12) return `${y}-09-30`;
                return null;
            };
            const diff = (cur, prev) => {
                if (cur === null || prev === null) return null;
                return cur - prev;
            };

            const quarterlyWide = datesAsc.map(d => {
                const cur = ytdByDate.get(d);
                const prevD = prevQuarterDate(d);
                const prev = prevD ? ytdByDate.get(prevD) : null;
                // 淨利：從損益表拿 IncomeAfterTaxes（本期淨利 淨損，稅後）
                //       fallback 用 EquityAttributableToOwnersOfParent（稅後淨利歸屬於母公司）
                //       這張表本身就是單季，不做差分
                const fsFlat = fsByDate.get(d) || {};
                const netIncome = fsFlat.IncomeAfterTaxes
                               ?? fsFlat.EquityAttributableToOwnersOfParent
                               ?? null;
                if (!prev) {
                    return { date: d, operatingCF: cur.opCF, freeCF: cur.fcf, netIncome };
                }
                return {
                    date: d,
                    operatingCF: diff(cur.opCF, prev.opCF),
                    freeCF:      diff(cur.fcf, prev.fcf),
                    netIncome,
                };
            });

            // processCashFlow 期待新→舊
            quarterlyWide.sort((a, b) => b.date.localeCompare(a.date));

            return processCashFlow(quarterlyWide, {
                operatingCF: r => r.operatingCF,
                freeCF: r => r.freeCF,
                netIncome: r => r.netIncome,
            });
        } catch (e) {
            console.warn('FinMind cash flow fetch failed:', e.message);
            return null;
        }
    }

    function processCashFlow(rows, getters) {
        const rowByDate = new Map(rows.map(r => [r.date, r]));
        const N = Math.min(10, rows.length);
        const build = (getter) => {
            const entries = [];
            for (let i = 0; i < N; i++) {
                const cur = rows[i];
                const prior = rowByDate.get(yoyDate(cur.date));
                const val = getter(cur);
                const priorVal = prior ? getter(prior) : null;
                let yoy = null;
                if (val !== null && isFinite(val) && priorVal !== null && isFinite(priorVal) && priorVal !== 0) {
                    yoy = (val - priorVal) / Math.abs(priorVal);
                }
                entries.push({ date: cur.date, value: val, yoy });
            }
            return entries;
        };
        const opCF = build(getters.operatingCF);
        const fCF = build(getters.freeCF);
        const ni = build(getters.netIncome);

        // 背離偵測：近 4 季 avg(NI YoY) vs avg(CF YoY)
        // 若 NI YoY > 15pp CF YoY → 獲利品質警訊
        const avgYoY = arr => {
            const valid = arr.filter(e => e.yoy !== null).map(e => e.yoy);
            if (valid.length < 2) return null;
            return valid.reduce((s, v) => s + v, 0) / valid.length;
        };
        const niYoY = avgYoY(ni.slice(0, 4));
        const cfYoY = avgYoY(opCF.slice(0, 4));
        let divergence = null;
        if (niYoY !== null && cfYoY !== null) {
            const gap = niYoY - cfYoY;
            if (gap > 0.15) divergence = { kind: 'warning', gap, msg: `⚠️ 近 4 季<b>淨利年增 ${(niYoY*100).toFixed(0)}% 但營運CF 年增 ${(cfYoY*100).toFixed(0)}%</b>——差 ${(gap*100).toFixed(0)}pp。可能是應收帳款膨脹 or 存貨堆積 or 認列時點差異，<b>獲利品質有疑慮</b>，回去看資產負債表確認。` };
            else if (gap < -0.15) divergence = { kind: 'positive', gap, msg: `✅ 近 4 季<b>營運CF 年增 ${(cfYoY*100).toFixed(0)}% 高於淨利年增 ${(niYoY*100).toFixed(0)}%</b>——獲利品質紮實，現金比帳面更漂亮。` };
            else divergence = { kind: 'ok', gap, msg: `✓ 淨利跟營運 CF 同向（差 ${(gap*100).toFixed(0)}pp），獲利品質沒問題。` };
        }

        return { operatingCF: opCF, freeCF: fCF, netIncome: ni, divergence };
    }

    // ---------- 台股法人買賣超（層次 5：市場情緒） ----------
    async function fetchInstitutionalTW(ticker, token) {
        try {
            const startDate = todayMinusYears(0.25);   // 近 3 個月
            const rows = await finMindFetch('TaiwanStockInstitutionalInvestorsBuySell', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            // FinMind schema: { date, stock_id, name, buy, sell }
            // name 是「Foreign_Investor」「Investment_Trust」「Dealer_Hedging」「Dealer_self」等
            const byDate = new Map();
            rows.forEach(r => {
                if (!byDate.has(r.date)) byDate.set(r.date, { foreign: 0, trust: 0, dealer: 0 });
                const net = (r.buy || 0) - (r.sell || 0);
                if (r.name && r.name.includes('Foreign')) byDate.get(r.date).foreign += net;
                else if (r.name && r.name.includes('Investment_Trust')) byDate.get(r.date).trust += net;
                else if (r.name && r.name.includes('Dealer')) byDate.get(r.date).dealer += net;
            });
            const dates = Array.from(byDate.keys()).sort().reverse().slice(0, 20);   // 近 20 天
            const daily = dates.map(d => {
                const v = byDate.get(d);
                return {
                    date: d,
                    foreign: v.foreign,
                    trust: v.trust,
                    dealer: v.dealer,
                    total: v.foreign + v.trust + v.dealer,
                };
            });
            // 累計 20 天總買賣超
            const sum = daily.reduce((acc, d) => ({
                foreign: acc.foreign + d.foreign,
                trust: acc.trust + d.trust,
                dealer: acc.dealer + d.dealer,
                total: acc.total + d.total,
            }), { foreign: 0, trust: 0, dealer: 0, total: 0 });

            return { daily, sum20d: sum };
        } catch (e) {
            console.warn('FinMind institutional fetch failed:', e.message);
            return null;
        }
    }

    // ---------- Fundamentals table 渲染 ----------
    function renderFundamentalsHtml(fund) {
        if (!fund) return '<p class="hint">⚠️ 這個資料源 or 標的沒抓到季度財報，成長性表隱藏。</p>';

        // 判斷本次是否有任何有效資料
        const hasAny = ['eps', 'revenue', 'grossMargin', 'operatingMargin']
            .some(k => fund[k] && fund[k].some(e => e.value !== null && isFinite(e.value)));
        if (!hasAny) return '<p class="hint">⚠️ 這個標的的季度財報 API 回傳空值。</p>';

        const renderTable = (title, entries, isRatio, fmtVal) => {
            let html = `<div class="fund-cell"><h4>${title}</h4><table class="fund-table"><tr><th>季度</th><th>值</th><th>YoY</th></tr>`;
            entries.forEach(e => {
                const dateStr = e.date || '—';
                const valStr = (e.value !== null && isFinite(e.value)) ? fmtVal(e.value) : '—';
                let yoyStr = '—', yoyCls = '';
                if (e.yoy !== null && isFinite(e.yoy)) {
                    if (isRatio) {
                        // 比率型：yoy 是絕對百分點差
                        const pp = e.yoy * 100;
                        yoyStr = (pp > 0 ? '+' : '') + pp.toFixed(1) + ' pp';
                    } else {
                        // 絕對值型：yoy 是相對百分比
                        const pct = e.yoy * 100;
                        yoyStr = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
                    }
                    yoyCls = e.yoy > 0.001 ? 'yoy-pos' : e.yoy < -0.001 ? 'yoy-neg' : '';
                }
                html += `<tr><td>${dateStr}</td><td>${valStr}</td><td class="${yoyCls}">${yoyStr}</td></tr>`;
            });
            html += '</table></div>';
            return html;
        };

        // 營收縮放：< 1e9 顯示原值、>=1e9 顯示 十億／百萬
        const fmtRevenue = v => {
            if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(2) + '兆';
            if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(0);
        };

        return `
            <h3>📊 財報成長性（近 10 季 + YoY）</h3>
            <p class="hint">
                YoY = 跟去年同一季比較。<b>絕對值型（EPS、營收）</b> YoY 用 % 表示；
                <b>比率型（毛利率、營益率）</b> YoY 用 <b>pp（百分點）</b>表示。
                連續 4 季 YoY 都 &gt; 0 = 成長股訊號；連續 &lt; 0 = 衰退警訊。
            </p>
            <div class="fund-grid">
                ${renderTable('💵 EPS', fund.eps, false, v => v.toFixed(2))}
                ${renderTable('💰 營收', fund.revenue, false, fmtRevenue)}
                ${renderTable('📈 毛利率', fund.grossMargin, true, v => (v * 100).toFixed(1) + '%')}
                ${renderTable('📉 營益率', fund.operatingMargin, true, v => (v * 100).toFixed(1) + '%')}
            </div>
        `;
    }

    // 現金流量 + 淨利背離渲染
    function renderCashFlowHtml(cf) {
        if (!cf) return '';
        const fmtNum = v => {
            if (v === null || !isFinite(v)) return '—';
            if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(2) + '兆';
            if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            return v.toFixed(0);
        };
        const fmtYoY = y => {
            if (y === null || !isFinite(y)) return '—';
            const pct = y * 100;
            return (pct > 0 ? '+' : '') + pct.toFixed(0) + '%';
        };
        const yoyCls = y => y === null ? '' : y > 0.001 ? 'yoy-pos' : y < -0.001 ? 'yoy-neg' : '';

        const renderCol = (title, entries) => {
            let h = `<div class="fund-cell"><h4>${title}</h4><table class="fund-table"><tr><th>季度</th><th>值</th><th>YoY</th></tr>`;
            entries.forEach(e => {
                h += `<tr><td>${e.date || '—'}</td><td>${fmtNum(e.value)}</td><td class="${yoyCls(e.yoy)}">${fmtYoY(e.yoy)}</td></tr>`;
            });
            h += '</table></div>';
            return h;
        };

        let divergenceBanner = '';
        if (cf.divergence) {
            const d = cf.divergence;
            const cls = d.kind === 'warning' ? 'divergence-warn' : d.kind === 'positive' ? 'divergence-good' : 'divergence-ok';
            divergenceBanner = `<div class="divergence-banner ${cls}">${d.msg}</div>`;
        }

        return `
            <h3>💰 現金流量 vs 淨利（層次 2：獲利品質核心）</h3>
            <p class="hint">
                <b>紙上獲利 vs 真實現金</b>：淨利成長但營運現金流沒同步 = 應收膨脹 / 存貨堆積 / 認列時點差異 = 獲利品質警訊。
                同向 = 紮實；差 &gt; 15pp = 疑慮。
                <br>
                <span class="hint-mini">📌 台股資料來源：
                <b>營運CF + CapEx</b>：現金流量表 CashFlowsFromOperatingActivities + PropertyAndPlantAndEquipment（負值），原始是 YTD 累計、已自動差分成單季。
                <b>自由現金流</b>：FinMind 沒直接欄位，由 <code>營運CF + CapEx</code> 算出。
                <b>淨利（稅後）</b>：改抓損益表 IncomeAfterTaxes，本身已是單季。<b>不用現金流量表裡的 IncomeBefore*（那是稅前調整起點）</b>——用稅前跟營運CF 比，基準錯（稅前 vs 稅後差 ~20%）。</span>
            </p>
            ${divergenceBanner}
            <div class="fund-grid">
                ${renderCol('🏭 營運現金流', cf.operatingCF)}
                ${renderCol('🆓 自由現金流', cf.freeCF)}
                ${renderCol('📖 淨利（帳面）', cf.netIncome)}
            </div>
        `;
    }

    // 法人買賣超渲染
    function renderInstitutionalHtml(inst) {
        if (!inst || !inst.daily || inst.daily.length === 0) return '';
        const fmtShares = v => {
            if (v === 0 || !v) return '0';
            const abs = Math.abs(v);
            if (abs >= 1e7) return (v / 1e7).toFixed(1) + '千萬股';
            if (abs >= 1e4) return (v / 1e4).toFixed(1) + '萬股';
            return v.toFixed(0) + '股';
        };
        const cls = v => v > 0 ? 'yoy-pos' : v < 0 ? 'yoy-neg' : '';
        const sum = inst.sum20d;
        const totalSign = sum.total > 0 ? '📈 淨買超' : sum.total < 0 ? '📉 淨賣超' : '⚖️ 中性';

        let dailyTable = `<table class="fund-table"><tr><th>日期</th><th>外資</th><th>投信</th><th>自營</th><th>合計</th></tr>`;
        inst.daily.slice(0, 10).forEach(d => {
            dailyTable += `<tr>
                <td>${d.date}</td>
                <td class="${cls(d.foreign)}">${fmtShares(d.foreign)}</td>
                <td class="${cls(d.trust)}">${fmtShares(d.trust)}</td>
                <td class="${cls(d.dealer)}">${fmtShares(d.dealer)}</td>
                <td class="${cls(d.total)}">${fmtShares(d.total)}</td>
            </tr>`;
        });
        dailyTable += '</table>';

        return `
            <h3>🏦 三大法人買賣超（層次 5：市場情緒 · 近 20 天累計）</h3>
            <p class="hint">
                <b>外資 / 投信 / 自營</b>近 20 天的買賣超趨勢。連續買超 = 有機構在建倉，連續賣超 = 有機構在出貨。
                <b>不是 buy 訊號</b>——法人也會看錯，但它反映「有資訊優勢的錢在往哪走」。
            </p>
            <div class="inst-summary">
                <b>近 20 天累計：</b>
                外資 <span class="${cls(sum.foreign)}">${fmtShares(sum.foreign)}</span> ·
                投信 <span class="${cls(sum.trust)}">${fmtShares(sum.trust)}</span> ·
                自營 <span class="${cls(sum.dealer)}">${fmtShares(sum.dealer)}</span> ·
                <b>合計 <span class="${cls(sum.total)}">${fmtShares(sum.total)}</span> ${totalSign}</b>
            </div>
            <details style="margin-top:10px;">
                <summary style="cursor:pointer;color:var(--primary);font-weight:600;">📋 展開近 10 天明細</summary>
                ${dailyTable}
            </details>
        `;
    }

    // ========== 層次 4：總體環境（FRED 利率 + FMP 匯率 + FMP VIX） ==========
    // FRED（美聯儲 St. Louis Fed）free API：https://api.stlouisfed.org/fred/series/observations
    // Series id 常用：DGS10（10Y 公債殖利率）、T10Y2Y（10-2 利差）、FEDFUNDS（聯邦基金利率）、DTWEXBGS（美元廣義指數）
    const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
    // FRED 不回 Access-Control-Allow-Origin → 瀏覽器直連會被 CORS 擋
    // Fallback：allorigins.win 公開 CORS proxy
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    // 全域錯誤帶到 UI · fredFailedSeries 記個別失敗的 series id
    let fredLastError = null;
    let fredFailedSeries = [];

    async function fredRawFetch(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async function fredFetch(seriesId, apiKey, startDate) {
        const params = `series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}`;
        const directUrl = `${FRED_BASE}?${params}`;
        let data;
        try {
            data = await fredRawFetch(directUrl);
        } catch (e) {
            // 直連失敗（多半 CORS）→ 走 proxy
            const proxyUrl = `${CORS_PROXY}${encodeURIComponent(directUrl)}`;
            try {
                data = await fredRawFetch(proxyUrl);
            } catch (e2) {
                throw new Error(`直連 ${e.message} · proxy ${e2.message}`);
            }
        }
        // FRED API-level 錯誤（key 錯 / series 不存在）—— 這種會 wrap 在 HTTP 200 回傳裡
        if (data && data.error_code) {
            throw new Error(`FRED ${data.error_code}: ${data.error_message}`);
        }
        if (!data || !Array.isArray(data.observations)) return [];
        return data.observations
            .filter(o => o.value !== '.')
            .map(o => ({ date: o.date, value: parseFloat(o.value) }))
            .filter(o => !isNaN(o.value));
    }

    // 為什麼不用 Promise.all？dump 報告驗證 GitHub Actions 直連 FRED 7 個 series 全通，
    // 但瀏覽器因 CORS 走 allorigins.win proxy，並發 7 個請求會被 proxy IP 限流
    // → 用戶實測 4/7 通、3/7 失敗（DGS10 T10Y2Y HY spread 通，FEDFUNDS/CPI/VIX 或其他變化中）
    // 改成 sequential + 250ms 間隔穩定通過，代價是 7 × 250ms = ~1.75s 額外延遲，可接受
    async function fetchMacroFred(apiKey) {
        fredLastError = null;
        fredFailedSeries = [];
        if (!apiKey) return null;
        const start = todayMinusYears(2);
        const seriesConfig = [
            { key: 'dgs10',    id: 'DGS10' },
            { key: 'dtwexbgs', id: 'DTWEXBGS' },
            { key: 'fedfunds', id: 'FEDFUNDS' },
            { key: 't10y2y',   id: 'T10Y2Y' },
            { key: 'cpi',      id: 'CPIAUCSL' },
            { key: 'hyspread', id: 'BAMLH0A0HYM2' },
            { key: 'vix',      id: 'VIXCLS' },
        ];
        const result = {};
        for (let i = 0; i < seriesConfig.length; i++) {
            const { key, id } = seriesConfig[i];
            try {
                result[key] = await fredFetch(id, apiKey, start);
            } catch (e) {
                result[key] = [];
                fredFailedSeries.push(id);
                if (!fredLastError) fredLastError = `${id}: ${e.message}`;
            }
            if (i < seriesConfig.length - 1) {
                await new Promise(r => setTimeout(r, 250));
            }
        }
        return result;
    }

    // FMP 匯率（USD/TWD）——用 historical-price-eod/full
    async function fetchForexUsdTwd(apiKey) {
        if (!apiKey) return null;
        try {
            const data = await fmpFetch('/historical-price-eod/full?symbol=USDTWD', apiKey);
            const rows = Array.isArray(data) ? data : (data && data.historical) || [];
            if (!rows.length) return null;
            // FMP 新→舊，反成舊→新，只取近 500 天
            return rows.slice(0, 500).reverse()
                .map(r => ({ date: r.date, value: r.close || r.adjClose }))
                .filter(r => r.value && isFinite(r.value));
        } catch (e) {
            console.warn('FMP forex fetch failed:', e.message);
            return null;
        }
    }

    // VIX 有兩個來源，優先走 FRED VIXCLS（免費、免額度）
    // 這個 function 只當 FMP fallback——FRED VIX 已從 fetchMacroFred 那邊拿了
    async function fetchVixHistoryFmp(apiKey) {
        if (!apiKey) return null;
        try {
            const data = await fmpFetch('/historical-price-eod/full?symbol=%5EVIX', apiKey);
            const rows = Array.isArray(data) ? data : (data && data.historical) || [];
            if (!rows.length) return null;
            return rows.slice(0, 500).reverse()
                .map(r => ({ date: r.date, value: r.close || r.adjClose }))
                .filter(r => r.value && isFinite(r.value));
        } catch (e) {
            console.warn('FMP VIX fetch failed:', e.message);
            return null;
        }
    }

    // 台股融資餘額（FinMind · 已在 schema dump 確認免費可用）
    async function fetchMarginTW(ticker, token) {
        try {
            const startDate = todayMinusYears(2);
            const rows = await finMindFetch('TaiwanStockMarginPurchaseShortSale', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            return rows.map(r => ({
                date: r.date,
                marginBalance: r.MarginPurchaseTodayBalance,
                shortBalance: r.ShortSaleTodayBalance,
            })).filter(r => r.marginBalance !== null && r.marginBalance !== undefined);
        } catch (e) {
            console.warn('FinMind margin fetch failed:', e.message);
            return null;
        }
    }

    // 台股股利（用來判斷 window 內是否除過股票股利 → 股本變動）
    // 只在乎股票股利（StockEarningsDistribution > 0）——純現金股利不影響股本
    async function fetchDividendTW(ticker, token) {
        try {
            const startDate = todayMinusYears(2);
            const rows = await finMindFetch('TaiwanStockDividend', ticker, startDate, todayStr(), token);
            return rows || [];
        } catch (e) {
            console.warn('FinMind dividend fetch failed:', e.message);
            return [];
        }
    }

    // ---------- 解讀邏輯（層次 4 + 5） ----------
    function interpretDgs10(dgs10) {
        if (!dgs10 || dgs10.length < 60) return null;
        const now = dgs10[dgs10.length - 1].value;
        const idx90 = Math.max(0, dgs10.length - 63);
        const past = dgs10[idx90].value;
        const delta = now - past;
        if (delta > 0.5) return { kind: 'warn',
            text: `⚠️ 十年期公債殖利率近 3 個月 <b>${past.toFixed(2)}% → ${now.toFixed(2)}%</b>（+${delta.toFixed(2)}pp）。高本益比股票的折現率壓力上升，這是<b>估值收縮的總經逆風</b>，跟公司體質無關。` };
        if (delta < -0.5) return { kind: 'good',
            text: `✅ 十年期公債殖利率近 3 個月 <b>${past.toFixed(2)}% → ${now.toFixed(2)}%</b>（${delta.toFixed(2)}pp）。低利率環境對高成長股估值有利。` };
        return { kind: 'ok',
            text: `十年期公債殖利率近 3 個月變化 ${delta.toFixed(2)}pp（${past.toFixed(2)}% → ${now.toFixed(2)}%），無明顯總經壓力。` };
    }

    function interpretT10y2y(t10y2y) {
        if (!t10y2y || t10y2y.length === 0) return null;
        const latest = t10y2y[t10y2y.length - 1].value;
        // 檢查一年前是否倒掛過（就算現在解除，倒掛遺產效應歷史上會滯後 12-18 個月）
        const idxYearAgo = Math.max(0, t10y2y.length - 252);
        const yearAgoInverted = t10y2y[idxYearAgo] ? t10y2y[idxYearAgo].value < 0 : false;
        if (latest < 0) return { kind: 'warn',
            text: `⚠️ 10Y-2Y 利差 <b>${latest.toFixed(2)}pp · 殖利率倒掛</b>。歷史上是衰退領先指標（提前 12-18 個月），總經風險升溫。` };
        if (yearAgoInverted) return { kind: 'ok',
            text: `10Y-2Y 利差 <b>${latest.toFixed(2)}pp</b>（已解除倒掛）。<b>但過去 12 個月曾倒掛</b>——歷史上衰退往往在解除後才發生，不代表警報已過。` };
        return { kind: 'ok',
            text: `10Y-2Y 利差 ${latest.toFixed(2)}pp · 未倒掛。` };
    }

    // FEDFUNDS 一年變化：是升息 / 降息週期？
    function interpretFedfunds(ff) {
        if (!ff || ff.length < 12) return null;
        const now = ff[ff.length - 1].value;
        const idx = Math.max(0, ff.length - 13);
        const yearAgo = ff[idx].value;
        const delta = now - yearAgo;
        if (delta < -0.5) return { kind: 'good',
            text: `✅ FEDFUNDS 一年 <b>${yearAgo.toFixed(2)}% → ${now.toFixed(2)}%</b>（${delta.toFixed(2)}pp）· <b>降息週期中</b>——對高本益比股折現壓力降低。但要問「為什麼降」（軟著陸 vs 硬著陸擔憂）。` };
        if (delta > 0.5) return { kind: 'warn',
            text: `⚠️ FEDFUNDS 一年 <b>${yearAgo.toFixed(2)}% → ${now.toFixed(2)}%</b>（+${delta.toFixed(2)}pp）· <b>升息週期中</b>——估值收縮的總經逆風。` };
        return { kind: 'ok',
            text: `FEDFUNDS <b>${now.toFixed(2)}%</b> · 一年變化 ${delta.toFixed(2)}pp，維持水位。` };
    }

    // CPI 通膨 YoY（月頻，用 12 個月前對比）
    function interpretCpi(cpi) {
        if (!cpi || cpi.length < 13) return null;
        const now = cpi[cpi.length - 1].value;
        const yearAgo = cpi[cpi.length - 13].value;
        const yoy = ((now - yearAgo) / yearAgo) * 100;
        if (yoy > 3.5) return { kind: 'warn',
            text: `⚠️ CPI YoY <b>+${yoy.toFixed(1)}%</b> · 通膨仍高於 Fed 目標（2%）—— <b>降息空間受限、實質利率仍緊</b>，對高成長股估值不利。` };
        if (yoy < 2.0) return { kind: 'good',
            text: `✅ CPI YoY <b>+${yoy.toFixed(1)}%</b> · 通膨低於 Fed 目標。降息空間打開、對成長股估值有利。` };
        return { kind: 'ok',
            text: `CPI YoY <b>+${yoy.toFixed(1)}%</b> · 接近 Fed 目標區間（2-3.5%）。` };
    }

    // 高收益債利差 BAMLH0A0HYM2：機構「真金白銀在定價的信用風險」
    // < 3% = 極度樂觀 / 3-5% = 正常 / > 5% = 緊縮 / > 8% = 危機（08、20）
    function interpretHyspread(hy) {
        if (!hy || hy.length === 0) return null;
        const latest = hy[hy.length - 1].value;
        if (latest < 3.0) return { kind: 'warn',
            text: `⚠️ 高收益債利差 <b>${latest.toFixed(2)}%</b> &lt; 3% · <b>市場對信用風險過度樂觀</b>。歷史上這種水位常在後續信用事件（利差擴大 → 股市回調）前出現——不是預測工具，只是背景警訊。` };
        if (latest > 5.0) return { kind: 'warn',
            text: `⚠️ 高收益債利差 <b>${latest.toFixed(2)}%</b> &gt; 5% · <b>信用緊縮訊號</b>。企業融資成本上升、機構在為經濟走弱定價。` };
        return { kind: 'ok',
            text: `高收益債利差 <b>${latest.toFixed(2)}%</b> · 3-5% 正常區間，市場風險偏好平衡。` };
    }

    function interpretFx(fx) {
        if (!fx || fx.length < 120) return null;
        const now = fx[fx.length - 1].value;
        const yearAgo = fx[Math.max(0, fx.length - 252)].value;
        const pct = (now - yearAgo) / yearAgo;
        if (pct > 0.03) return { kind: 'ok',
            text: `USD/TWD 一年 <b>+${(pct*100).toFixed(1)}%</b>（${yearAgo.toFixed(2)} → ${now.toFixed(2)}）· 新台幣貶值 = <b>出口毛利率有匯率順風</b>，粗估貢獻約 ${(pct*100).toFixed(1)} pp 到出口營收。<b>要從財報公布的毛利率變化裡扣掉這塊，才看得出真正的成本改善 / 良率提升 / 產品組合貢獻。</b>` };
        if (pct < -0.03) return { kind: 'warn',
            text: `USD/TWD 一年 <b>${(pct*100).toFixed(1)}%</b>（${yearAgo.toFixed(2)} → ${now.toFixed(2)}）· 新台幣升值 = <b>出口毛利率有匯率逆風</b>。公布的毛利率若還維持 or 上升，代表非匯率的體質改善其實比帳面更強。` };
        return { kind: 'ok',
            text: `USD/TWD 一年變化 ${(pct*100).toFixed(1)}%（${yearAgo.toFixed(2)} → ${now.toFixed(2)}），匯率影響小。` };
    }

    function interpretVix(vix) {
        if (!vix || vix.length === 0) return null;
        const latest = vix[vix.length - 1].value;
        if (latest < 15) return { kind: 'warn',
            text: `VIX <b>${latest.toFixed(1)}</b> &lt; 15 · <b>市場過度自滿</b>。歷史上常是短期見頂訊號（但也可能持續很久）。這不是預測工具，只反映市場的恐慌溫度。` };
        if (latest > 30) return { kind: 'warn',
            text: `VIX <b>${latest.toFixed(1)}</b> &gt; 30 · <b>市場恐慌</b>。歷史上常是短期超賣、但也可能是趨勢崩壞開始。單靠 VIX 判斷不了方向。` };
        return { kind: 'ok',
            text: `VIX <b>${latest.toFixed(1)}</b>（15-30 區間），市場情緒正常。` };
    }

    function interpretMargin(margin, dividends) {
        if (!margin || margin.length < 60) return null;
        const sorted = margin.slice().sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1];
        const past = sorted[Math.max(0, sorted.length - 63)];
        if (!past.marginBalance) return null;
        const delta = latest.marginBalance - past.marginBalance;
        const pct = delta / past.marginBalance;
        const fmt = n => Number(n).toLocaleString();

        // ⚠️ 股本結構偵測：融資餘額 % 有可能不是散戶槓桿變化、而是股本技術性變動
        // 兩個訊號：
        // 1. 單日跳動 >15%（股票股利、減資、增資、分割都會這樣呈現）
        // 2. FinMind 股利資料裡 window 內有「股票股利」除權日（StockEarningsDistribution > 0）
        const windowRows = sorted.slice(-63);
        const windowStart = windowRows[0].date;
        const windowEnd = latest.date;
        let biggestJump = 0, biggestJumpDate = null;
        for (let i = 1; i < windowRows.length; i++) {
            const prev = windowRows[i - 1].marginBalance;
            const cur = windowRows[i].marginBalance;
            if (!prev) continue;
            const jump = (cur - prev) / prev;
            if (Math.abs(jump) > Math.abs(biggestJump)) {
                biggestJump = jump;
                biggestJumpDate = windowRows[i].date;
            }
        }
        const hasStepChange = Math.abs(biggestJump) > 0.15;

        const stockDivEvents = (dividends || []).filter(d => {
            const exDate = d.StockExDividendTradingDate;
            if (!exDate || exDate === '') return false;
            return exDate >= windowStart && exDate <= windowEnd && d.StockEarningsDistribution > 0;
        });
        const hasStockDivEvent = stockDivEvents.length > 0;

        let caveat = '';
        if (hasStepChange || hasStockDivEvent) {
            const bits = [];
            if (hasStepChange) bits.push(`<b>${biggestJumpDate}</b> 出現單日 <b>${(biggestJump*100).toFixed(0)}%</b> 跳動`);
            if (hasStockDivEvent) bits.push(`除權日 <b>${stockDivEvents[0].StockExDividendTradingDate}</b> 發過股票股利`);
            caveat = `<br><span class="margin-caveat">⚠️ <b>股本結構警訊</b>：${bits.join('、')}——這波變化<b>有部分可能是股本技術性因素</b>（除權股票股利 / 減資 / 增資 / 分割），不完全是散戶追高。到證交所公告查具體事件確認。</span>`;
        }

        if (pct > 0.20) return { kind: 'warn',
            text: `⚠️ 融資餘額近 3 個月 <b>+${(pct*100).toFixed(0)}%</b>（${fmt(past.marginBalance)} → ${fmt(latest.marginBalance)} 張）· 散戶槓桿追高中。反轉時融資斷頭骨牌會放大跌幅。<b>不是不能買，但這波上漲的燃料有一部分是散戶槓桿。</b>${caveat}` };
        if (pct < -0.15) return { kind: 'good',
            text: `✅ 融資餘額近 3 個月 <b>${(pct*100).toFixed(0)}%</b>（${fmt(past.marginBalance)} → ${fmt(latest.marginBalance)} 張）· 散戶槓桿收斂，籌碼較穩定。若股價還在漲，多半是法人 / 大戶主導，這種上漲較健康。${caveat}` };
        return { kind: 'ok',
            text: `融資餘額近 3 個月變化 ${(pct*100).toFixed(0)}%（${fmt(latest.marginBalance)} 張），籌碼結構穩定。${caveat}` };
    }

    // ---------- Sparkline util ----------
    function drawSparkline(canvas, data, color = '#0f766e') {
        if (!canvas || !data || data.length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width || 200;
        const h = canvas.clientHeight || canvas.height || 40;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        const values = data.map(d => d.value);
        const min = Math.min(...values), max = Math.max(...values);
        const range = max - min || 1;
        const padX = 3, padY = 5;
        const chartW = w - padX * 2, chartH = h - padY * 2;
        // Zero line if data crosses zero
        if (min < 0 && max > 0) {
            const zeroY = padY + chartH - ((0 - min) / range) * chartH;
            ctx.strokeStyle = '#d1d5db';
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(padX, zeroY);
            ctx.lineTo(padX + chartW, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        data.forEach((d, i) => {
            const x = padX + (i / Math.max(1, data.length - 1)) * chartW;
            const y = padY + chartH - ((d.value - min) / range) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // Last point marker
        const last = data[data.length - 1];
        const lastX = padX + chartW;
        const lastY = padY + chartH - ((last.value - min) / range) * chartH;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2.8, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---------- Render macro panel ----------
    // 一律顯示 panel（即使全部拿不到）——每個 cell 沒資料時要告訴使用者「缺什麼」，
    // 不然容易誤以為「這塊完全沒做」（實際上程式在，只是 key 沒填 / FMP 額度用完）。
    function renderMacroPanel(macro, fx, vix) {
        const panel = $('macro-panel');
        if (!panel) return;
        panel.hidden = false;

        // 頂部 dashboard：3 個資料源的狀態一目了然
        const status = $('macro-status');
        if (status) {
            const fredKey = ($('cfg-fred-key') && $('cfg-fred-key').value.trim()) || '';
            const fmpKey = $('cfg-api-key').value.trim();
            const hasFred = macro && macro.dgs10 && macro.dgs10.length;
            const hasFx = fx && fx.length;
            const hasVix = vix && vix.length;
            const parts = [];
            // 判斷 FRED 狀態：全通 / 部分失敗 / 全空
            let fredStatus;
            if (!fredKey) {
                fredStatus = '<span class="src-warn">⚠️ FRED（設定區塊填 key 才會抓）</span>';
            } else if (!hasFred && fredFailedSeries.length === 0) {
                fredStatus = `<span class="src-err">❌ FRED${fredLastError ? '（' + fredLastError + '）' : '（未知錯誤）'}</span>`;
            } else if (fredFailedSeries.length > 0) {
                fredStatus = `<span class="src-warn">⚠️ FRED 部分失敗（${fredFailedSeries.join(', ')} · CORS proxy 限流? 重跑一次）</span>`;
            } else {
                fredStatus = '<span class="src-ok">✅ FRED 全通</span>';
            }
            parts.push(fredStatus);
            parts.push(hasFx ? '<span class="src-ok">✅ USD/TWD 匯率</span>'
                : fmpKey ? '<span class="src-warn">⚠️ USD/TWD（FMP 額度用完 or forex tier 不支援）</span>'
                : '<span class="src-warn">⚠️ USD/TWD（需 FMP key）</span>');
            parts.push(hasVix ? '<span class="src-ok">✅ VIX</span>'
                : fmpKey ? '<span class="src-warn">⚠️ VIX（FMP 額度用完）</span>'
                : '<span class="src-warn">⚠️ VIX（需 FMP key）</span>');
            status.innerHTML = parts.join(' · ');
        }

        const fredMissing = '⚠️ 尚未取得 FRED 資料。請到「資料來源設定」區塊填 FRED API key，免費申請：<a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener">fred.stlouisfed.org/docs/api/api_key</a>';
        const fmpMissing = '⚠️ 尚未取得 FMP 資料。可能是 FMP key 沒填、額度用完（免費 250 次/日），或 forex/index tier 不開放。';

        const bindCell = (series, valId, sparkId, noteId, interp, fmtVal, color, missingMsg) => {
            const valEl = $(valId);
            if (!valEl) return;
            if (!series || !series.length) {
                valEl.textContent = '—';
                valEl.classList.add('macro-val-empty');
                if (noteId) $(noteId).innerHTML = `<span class="macro-note macro-note-ok">${missingMsg}</span>`;
                return;
            }
            valEl.classList.remove('macro-val-empty');
            const latest = series[series.length - 1].value;
            valEl.textContent = fmtVal(latest);
            drawSparkline($(sparkId), series, color);
            if (noteId && interp) {
                $(noteId).innerHTML = `<span class="macro-note macro-note-${interp.kind}">${interp.text}</span>`;
            }
        };

        bindCell(macro && macro.dgs10, 'macro-dgs10-val', 'macro-dgs10-spark', 'macro-dgs10-note',
                 macro && interpretDgs10(macro.dgs10), v => v.toFixed(2) + '%', '#dc2626', fredMissing);
        bindCell(macro && macro.t10y2y, 'macro-t10y2y-val', 'macro-t10y2y-spark', 'macro-t10y2y-note',
                 macro && interpretT10y2y(macro.t10y2y), v => v.toFixed(2) + ' pp', '#7c3aed', fredMissing);
        bindCell(macro && macro.fedfunds, 'macro-fedfunds-val', 'macro-fedfunds-spark', 'macro-fedfunds-note',
                 macro && interpretFedfunds(macro.fedfunds), v => v.toFixed(2) + '%', '#d97706', fredMissing);
        bindCell(macro && macro.cpi, 'macro-cpi-val', 'macro-cpi-spark', 'macro-cpi-note',
                 macro && interpretCpi(macro.cpi), v => v.toFixed(1), '#ea580c', fredMissing);
        bindCell(macro && macro.hyspread, 'macro-hy-val', 'macro-hy-spark', 'macro-hy-note',
                 macro && interpretHyspread(macro.hyspread), v => v.toFixed(2) + '%', '#7c2d12', fredMissing);
        bindCell(fx, 'macro-fx-val', 'macro-fx-spark', 'macro-fx-note',
                 interpretFx(fx), v => v.toFixed(3), '#0891b2', fmpMissing);
        // VIX 現在優先 FRED，missing 訊息也對應改
        const vixMissing = (macro && !macro.vix) || !macro ? '⚠️ 尚未取得資料。優先走 FRED VIXCLS（免額度），失敗才 fallback FMP。' : fmpMissing;
        bindCell(vix, 'macro-vix-val', 'macro-vix-spark', 'macro-vix-note',
                 interpretVix(vix), v => v.toFixed(1), '#db2777', vixMissing);
    }

    // ---------- Render 融資餘額（塞進 detail-box） ----------
    function renderMarginHtml(margin, dividends) {
        if (!margin || margin.length === 0) return '';
        const note = interpretMargin(margin, dividends);
        const cls = note ? (note.kind === 'warn' ? 'divergence-warn' : note.kind === 'good' ? 'divergence-good' : 'divergence-ok') : 'divergence-ok';
        const banner = note ? `<div class="divergence-banner ${cls}">${note.text}</div>` : '';
        return `
            <h3>💳 融資餘額（散戶槓桿 · 層次 5 · 情緒延伸）</h3>
            <p class="hint">
                <b>融資餘額 = 散戶用信用擴張買進的張數</b>。餘額急升 + 股價新高 = 追高過熱，
                反轉時斷頭骨牌會放大跌幅。餘額下降但股價還在漲 = 籌碼從散戶轉到法人 / 大戶。
                <span class="hint-mini">FinMind <code>TaiwanStockMarginPurchaseShortSale</code> · 近 3 個月 vs 現在。
                自動偵測單日 &gt;15% 跳動 + 除權股票股利事件——這兩者會讓「張數變化」有一部分是股本技術性因素，不是純散戶追高。</span>
            </p>
            ${banner}
        `;
    }

    // ---------- 🔍 診斷：印出 FinMind 原始欄位 ----------
    // 目的：驗證程式用的欄位名（NetIncome、FreeCashFlow...）跟 FinMind 實際回傳的一致
    // 對每個 long-format dataset：unique type + origin_name（中文原名）+ sample raw row
    async function debugFinMindFields(ticker, token) {
        const escapeHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
        const startDate = todayMinusYears(1.2);   // 抓 1 年多足夠涵蓋 4 季報
        const endDate = todayStr();
        // 每個 dataset：{ name, dataId, note }
        // note 是預期的用途/我們程式讀了哪些欄位——方便比對
        const datasets = [
            { name: 'TaiwanStockFinancialStatements', dataId: ticker,
              note: '損益表——我們讀 Revenue / OperatingRevenue / TotalRevenue、GrossProfit / OperatingGrossProfit、OperatingIncome / OperatingProfit、EPS / BasicEPS / DilutedEPS' },
            { name: 'TaiwanStockCashFlowsStatement', dataId: ticker,
              note: '現金流量表——我們讀 CashFlowsFromOperatingActivities / OperatingCashFlow、FreeCashFlow、NetIncome / NetIncomeAfterTax / NetIncomeAttributableToOwners' },
            { name: 'TaiwanStockBalanceSheet', dataId: ticker,
              note: '資產負債表（Priority 2 會用）——現在僅列欄位' },
            { name: 'TaiwanStockPER', dataId: ticker,
              note: '每日 PER / PBR（已在用）' },
            { name: 'TaiwanStockInstitutionalInvestorsBuySell', dataId: ticker,
              note: '三大法人買賣超——我們讀 name（Foreign_Investor / Investment_Trust / Dealer_*）+ buy + sell' },
        ];

        let output = `<div class="debug-block"><p class="hint">ticker = <code>${escapeHtml(ticker)}</code> · 抓 <code>${startDate}</code> ~ <code>${endDate}</code></p></div>`;

        for (const ds of datasets) {
            output += `<div class="debug-block"><h3>📦 <code>${escapeHtml(ds.name)}</code></h3>`;
            output += `<p class="debug-note">${escapeHtml(ds.note)}</p>`;
            try {
                setStatus('loading', `📡 抓 ${ds.name}……`);
                const rows = await finMindFetch(ds.name, ds.dataId, startDate, endDate, token);
                if (!rows || rows.length === 0) {
                    output += `<p class="debug-empty">⚠️ 0 rows returned（免費 tier 可能沒開這個 dataset 或這支股票沒資料）</p></div>`;
                    continue;
                }
                output += `<p><b>✅ ${rows.length} rows</b> · sample row keys: <code>${Object.keys(rows[0]).map(escapeHtml).join(', ')}</code></p>`;

                // Long format：有 type 欄位
                if (rows[0].type !== undefined) {
                    const typeMap = new Map();
                    rows.forEach(r => {
                        const key = r.type;
                        if (!typeMap.has(key)) {
                            typeMap.set(key, { origin: r.origin_name || '', count: 0, sample: r.value });
                        }
                        typeMap.get(key).count += 1;
                    });
                    output += `<p><b>unique type 值（共 ${typeMap.size} 個）</b>：</p>`;
                    output += '<table class="debug-table"><tr><th>type（程式抓的欄位名）</th><th>origin_name（中文原名）</th><th>rows</th><th>sample value</th></tr>';
                    const sorted = Array.from(typeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                    sorted.forEach(([t, info]) => {
                        output += `<tr><td><code>${escapeHtml(t)}</code></td><td>${escapeHtml(info.origin)}</td><td>${info.count}</td><td>${escapeHtml(String(info.sample))}</td></tr>`;
                    });
                    output += '</table>';
                }
                // Institutional：有 name 欄位當分類
                else if (rows[0].name !== undefined) {
                    const nameMap = new Map();
                    rows.forEach(r => {
                        if (!nameMap.has(r.name)) nameMap.set(r.name, 0);
                        nameMap.set(r.name, nameMap.get(r.name) + 1);
                    });
                    output += `<p><b>unique name 值（共 ${nameMap.size} 個）</b>：</p>`;
                    output += '<table class="debug-table"><tr><th>name（程式用來分類外資 / 投信 / 自營）</th><th>rows</th></tr>';
                    Array.from(nameMap.entries()).sort().forEach(([n, c]) => {
                        output += `<tr><td><code>${escapeHtml(n)}</code></td><td>${c}</td></tr>`;
                    });
                    output += '</table>';
                }

                // Sample raw JSON（前 3 筆）
                const sampleJson = JSON.stringify(rows.slice(0, 3), null, 2);
                output += `<details class="debug-details"><summary>📄 sample raw JSON（前 3 rows）</summary><pre>${escapeHtml(sampleJson)}</pre></details>`;
                output += '</div>';
            } catch (e) {
                output += `<p class="debug-error">❌ Error: ${escapeHtml(e.message)}</p></div>`;
            }
        }
        return output;
    }

    async function onDebugFields() {
        const token = $('cfg-finmind-token').value.trim();
        if (!token) { setStatus('error', '⚠️ 需要 FinMind token'); return; }
        const rawTicker = $('cfg-ticker').value.trim();
        if (!rawTicker) { setStatus('error', '⚠️ 需要在 Ticker 欄位填一支台股（例：2330）'); return; }
        const ticker = rawTicker.replace(/\.TW$/i, '').replace(/^tw/i, '').trim();
        if (!/^\d+$/.test(ticker)) { setStatus('error', `⚠️ FinMind 台股 ticker 必須是純數字，你輸入 "${ticker}"`); return; }

        localStorage.setItem('finmind_token', token);
        $('debug-panel').hidden = false;
        $('debug-output').innerHTML = '<p class="hint">📡 抓資料中……可能要 5-10 秒（一次跑 5 個 dataset）</p>';
        try {
            const html = await debugFinMindFields(ticker, token);
            $('debug-output').innerHTML = html;
            setStatus('success', `✅ ${ticker} 診斷完成——把不匹配的欄位名回報給我改程式`);
        } catch (e) {
            $('debug-output').innerHTML = `<p class="debug-error">❌ ${e.message}</p>`;
            setStatus('error', `❌ ${e.message}`);
        }
    }

    function setStatus(kind, msg) {
        const s = $('query-status');
        s.hidden = false;
        s.className = 'query-status ' + kind;
        s.textContent = msg;
    }

    // ---------- Handlers ----------
    // 自動路由：從 ticker 格式判斷該用哪個 API
    // - 純數字（2330、0050、0700）→ 台股（FinMind）
    // - 數字.TW / 數字.HK → 台股（strip .TW） / FMP
    // - 純字母（AAPL、TSLA、GOOGL）→ 美股（FMP）
    // - 字母.字母（BRK.B）→ FMP
    function detectSource(ticker) {
        const t = ticker.trim().toUpperCase();
        // .TW 後綴 → FinMind（strip .TW）
        if (t.endsWith('.TW')) return { source: 'finmind', normalized: t.replace(/\.TW$/, '') };
        // 純數字 → FinMind 台股
        if (/^\d+$/.test(t)) return { source: 'finmind', normalized: t };
        // 含字母 → FMP
        return { source: 'fmp', normalized: t };
    }

    async function onQuery() {
        const modeSelect = $('cfg-mode').value;
        const rawTicker = $('cfg-ticker').value.trim();
        if (!rawTicker) { setStatus('error', '⚠️ 請輸入 ticker'); return; }
        const years = parseInt($('cfg-years').value) || 10;

        // 決定實際用哪個 source
        let source, ticker;
        if (modeSelect === 'auto') {
            const detected = detectSource(rawTicker);
            source = detected.source;
            ticker = detected.normalized;
            setStatus('loading', `🤖 偵測到 ${source === 'finmind' ? '台股（FinMind）' : '美股 / 全球（FMP）'} → ${ticker}`);
        } else {
            source = modeSelect;
            ticker = source === 'finmind' ? rawTicker.replace(/\.TW$/i, '') : rawTicker.toUpperCase();
        }

        // 三把 key 各自獨立、都可能被用到：
        //  - FMP：美股主查詢 or 台股時的 USD/TWD + VIX fallback
        //  - FinMind：台股主查詢 + 融資 + 股利
        //  - FRED：層次 4 總體（跟股票無關，隨查隨用）
        // → 只要用戶填了就存 localStorage，不管當下的 query mode 是哪個
        //   （之前 bug：只在 mode 命中對應分支才存，台股 mode 下 FMP key 就會被吃掉）
        const fmpKey = $('cfg-api-key').value.trim();
        const finmindToken = $('cfg-finmind-token').value.trim();
        const fredKey = $('cfg-fred-key').value.trim();
        if (fmpKey)       localStorage.setItem('fmp_api_key',   fmpKey);
        if (finmindToken) localStorage.setItem('finmind_token', finmindToken);
        if (fredKey)      localStorage.setItem('fred_api_key',  fredKey);

        try {
            const isFinmind = source === 'finmind';
            let stockPromise;
            if (isFinmind) {
                if (!finmindToken) {
                    setStatus('error', '⚠️ 台股需要 FinMind token — 請先貼進「FinMind Token」欄位');
                    return;
                }
                stockPromise = fetchTwStockData(ticker, finmindToken, years);
            } else {
                if (!fmpKey) {
                    setStatus('error', '⚠️ 美股需要 FMP API key — 請先貼進「FMP API Key」欄位');
                    return;
                }
                stockPromise = fetchStockData(ticker, fmpKey, years);
            }

            // 平行抓總體 / 匯率 / 融資 + 股利（都 optional · 失敗回 null 不擋主流程）
            // VIX 從 macro.vix（FRED VIXCLS）拿，FMP 只當 fallback
            const [data, macro, fx, vixFmpFallback, marginTW, dividendsTW] = await Promise.all([
                stockPromise,
                fetchMacroFred(fredKey),
                fetchForexUsdTwd(fmpKey),
                fetchVixHistoryFmp(fmpKey),
                (isFinmind && finmindToken) ? fetchMarginTW(ticker, finmindToken) : Promise.resolve(null),
                (isFinmind && finmindToken) ? fetchDividendTW(ticker, finmindToken) : Promise.resolve([]),
            ]);

            // VIX 優先 FRED（免額度、更穩定）→ 失敗 fallback FMP
            const vix = (macro && macro.vix && macro.vix.length) ? macro.vix : vixFmpFallback;

            data.marginTW = marginTW;
            data.dividendsTW = dividendsTW;
            renderResult(data);
            renderMacroPanel(macro, fx, vix);
        } catch (e) {
            setStatus('error', `❌ ${e.message}`);
            console.error(e);
        }
    }

    function onManualAnalyze() {
        const name = $('man-name').value.trim() || '手動輸入';
        const price = parseFloat($('man-price').value);
        const eps = parseFloat($('man-eps').value);
        const bvps = parseFloat($('man-bvps').value);
        const peStr = $('man-pe-history').value.trim();
        const pbrStr = $('man-pbr-history').value.trim();

        if (!peStr && !pbrStr) { setStatus('error', '⚠️ 至少輸入 PE 或 PBR 歷年陣列'); return; }

        const peArr = peStr ? peStr.split(/[,，\s]+/).map(s => parseFloat(s)).filter(v => !isNaN(v)) : [];
        const pbrArr = pbrStr ? pbrStr.split(/[,，\s]+/).map(s => parseFloat(s)).filter(v => !isNaN(v)) : [];

        if (peArr.length < 3 && pbrArr.length < 3) {
            setStatus('error', '⚠️ 歷史樣本至少要 3 筆才有意義');
            return;
        }

        const currentPE = (price && eps) ? price / eps : null;
        const currentPBR = (price && bvps) ? price / bvps : null;

        // 建構 fake history 陣列（用假年份 0, 1, 2...）
        const maxLen = Math.max(peArr.length, pbrArr.length);
        const history = [];
        for (let i = 0; i < maxLen; i++) {
            history.push({
                year: String(i + 1),
                pe: peArr[i] || null,
                pbr: pbrArr[i] || null,
            });
        }

        renderResult({
            ticker: name,
            name: '',
            price,
            currentPE,
            currentPBR,
            history,
            latestRatioDate: null,
            sector: '',
        });
    }

    function onModeChange() {
        const mode = $('cfg-mode').value;
        const isManual = mode === 'manual';
        const isFmp = mode === 'fmp';
        const isFinmind = mode === 'finmind';
        const isAuto = mode === 'auto';

        $('query-panel').hidden = isManual;
        $('manual-panel').hidden = !isManual;
        // 自動模式：兩個 key 都顯示（讓用戶都貼、按 ticker 決定用哪個）
        // 顯示 / 隱藏對應 API 的 key 欄位跟 hint
        document.querySelectorAll('.mode-fmp').forEach(el => el.hidden = !(isFmp || isAuto));
        document.querySelectorAll('.mode-finmind').forEach(el => el.hidden = !(isFinmind || isAuto));
        // Ticker placeholder 依 mode 換
        if (isAuto) $('cfg-ticker').placeholder = '數字 = 台股（2330）、字母 = 美股（AAPL）';
        else if (isFmp) $('cfg-ticker').placeholder = 'AAPL、TSLA、GOOGL（純字母代碼）';
        else if (isFinmind) $('cfg-ticker').placeholder = '2330、0050、2454（4 碼數字，不加 .TW）';
    }

    function onClearKey() {
        $('cfg-api-key').value = '';
        localStorage.removeItem('fmp_api_key');
        setStatus('success', '🗑 已清除 API key');
    }

    // ---------- Init ----------
    function initUI() {
        // 讀存的 API key / token
        const savedKey = localStorage.getItem('fmp_api_key');
        if (savedKey) $('cfg-api-key').value = savedKey;
        const savedToken = localStorage.getItem('finmind_token');
        if (savedToken) $('cfg-finmind-token').value = savedToken;
        const savedFredKey = localStorage.getItem('fred_api_key');
        if (savedFredKey && $('cfg-fred-key')) $('cfg-fred-key').value = savedFredKey;

        $('cfg-mode').addEventListener('change', onModeChange);
        $('btn-query').addEventListener('click', onQuery);
        $('btn-clear-key').addEventListener('click', onClearKey);
        $('btn-manual-analyze').addEventListener('click', onManualAnalyze);
        const btnDebug = $('btn-debug-fields');
        if (btnDebug) btnDebug.addEventListener('click', onDebugFields);

        // Enter in ticker input → query
        $('cfg-ticker').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); onQuery(); }
        });

        onModeChange();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
