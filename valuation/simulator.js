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

    // 從每日 PER/PBR array 建構出年度統計 + 全部日資料當歷史樣本
    // 直方圖用「全部日資料」→ 樣本量比 FMP 年報大 250 倍、分佈更細
    async function fetchTwStockData(rawTicker, token, years) {
        setStatus('loading', `📡 抓 ${rawTicker} (FinMind) 資料中……`);
        // 統一格式：去掉 .TW 後綴
        const ticker = rawTicker.replace(/\.TW$/i, '').replace(/^tw/i, '').trim();
        if (!/^\d+$/.test(ticker)) throw new Error(`FinMind 台股 ticker 必須是純數字（例：2330、0050），你輸入 "${ticker}"`);
        const startDate = todayMinusYears(years);
        const endDate = todayStr();
        // 平行抓：PER 歷史 + 股價（近一週） + 公司資訊
        const [perData, priceData, infoData] = await Promise.all([
            finMindFetch('TaiwanStockPER', ticker, startDate, endDate, token),
            finMindFetch('TaiwanStockPrice', ticker, todayMinusYears(0.05), endDate, token),   // 近 ~18 天內找最新
            finMindFetch('TaiwanStockInfo', ticker, '2020-01-01', endDate, token).catch(() => []),
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

        // 平行抓：quote + profile + ratios（新版都用 ?symbol=）
        const [quote, profile, ratios] = await Promise.all([
            fmpFetch(`/quote?symbol=${ticker}`, apiKey),
            fmpFetch(`/profile?symbol=${ticker}`, apiKey),
            fmpFetch(`/ratios?symbol=${ticker}`, apiKey),
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
        $('detail-box').innerHTML = tableHtml;

        setStatus('success', `✅ 查到 ${ticker} 資料`);
    }

    function setStatus(kind, msg) {
        const s = $('query-status');
        s.hidden = false;
        s.className = 'query-status ' + kind;
        s.textContent = msg;
    }

    // ---------- Handlers ----------
    async function onQuery() {
        const mode = $('cfg-mode').value;
        const ticker = $('cfg-ticker').value.trim();
        if (!ticker) { setStatus('error', '⚠️ 請輸入 ticker'); return; }
        const years = parseInt($('cfg-years').value) || 10;

        try {
            let data;
            if (mode === 'finmind') {
                const token = $('cfg-finmind-token').value.trim();
                if (!token) { setStatus('error', '⚠️ 請先設定 FinMind token'); return; }
                localStorage.setItem('finmind_token', token);
                data = await fetchTwStockData(ticker, token, years);
            } else {
                const apiKey = $('cfg-api-key').value.trim();
                if (!apiKey) { setStatus('error', '⚠️ 請先設定 FMP API key'); return; }
                localStorage.setItem('fmp_api_key', apiKey);
                data = await fetchStockData(ticker.toUpperCase(), apiKey, years);
            }
            renderResult(data);
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

        $('query-panel').hidden = isManual;
        $('manual-panel').hidden = !isManual;
        // 顯示 / 隱藏對應 API 的 key 欄位跟 hint
        document.querySelectorAll('.mode-fmp').forEach(el => el.hidden = !isFmp);
        document.querySelectorAll('.mode-finmind').forEach(el => el.hidden = !isFinmind);
        // Ticker placeholder 依 mode 換
        if (isFmp) $('cfg-ticker').placeholder = 'AAPL、TSLA、GOOGL（純字母代碼）';
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

        $('cfg-mode').addEventListener('change', onModeChange);
        $('btn-query').addEventListener('click', onQuery);
        $('btn-clear-key').addEventListener('click', onClearKey);
        $('btn-manual-analyze').addEventListener('click', onManualAnalyze);

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
