(function () {
    'use strict';

    // ==========================================
    // Config
    // ==========================================
    // TICKERS + BENCHMARK 現在由 UI 輸入決定 · localStorage 記住上次選擇
    // 預設 6 支產業龍頭 · SPY 當基準
    const DEFAULT_TICKERS = ['NVDA', 'META', 'JPM', 'XOM', 'UNH', 'DE'];
    const DEFAULT_BENCHMARK = 'SPY';
    let TICKERS = [...DEFAULT_TICKERS];
    let BENCHMARK = DEFAULT_BENCHMARK;
    const VOL_WINDOW = 20;    // 20 日均量
    const MOM_WINDOW = 10;    // 10 日累積報酬
    const DISPLAY_DAYS = 63;  // ~3 個月交易日
    const TRAIL_LEN = 12;     // 尾巴保留幾天

    // 色盤：依 slot 索引指派 · 自訂 ticker 也會拿到獨立顏色
    const COLOR_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
    // 常見 ticker 的中文別名（若不在這 · 就用 ticker 本身當名稱）
    const KNOWN_TICKERS = {
        SPY: 'S&P 500 ETF', QQQ: 'Nasdaq 100 ETF', DIA: '道瓊 ETF', IWM: '小型股 ETF',
        NVDA: 'NVIDIA', META: 'Meta', JPM: '摩根大通', XOM: 'Exxon', UNH: 'UnitedHealth',
        DE: 'Deere', HON: 'Honeywell', CAT: 'Caterpillar', GE: 'GE', RTX: 'Raytheon', UNP: 'Union Pacific',
        AAPL: 'Apple', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon', TSLA: 'Tesla',
        AMD: 'AMD', TSM: '台積電 ADR', NFLX: 'Netflix', DIS: '迪士尼', BA: 'Boeing',
        XLK: '科技 ETF', XLC: '通訊 ETF', XLF: '金融 ETF', XLE: '能源 ETF', XLV: '醫療 ETF', XLI: '工業 ETF',
    };
    // 由 buildTickerInfo() 動態產生 · 每次下載時重建
    let TICKER_INFO = {};
    function buildTickerInfo() {
        TICKER_INFO = {};
        TICKERS.forEach((t, i) => {
            const name = KNOWN_TICKERS[t] ? `${t} · ${KNOWN_TICKERS[t]}` : t;
            const sector = KNOWN_TICKERS[t] || t;
            TICKER_INFO[t] = { name, sector, color: COLOR_PALETTE[i % COLOR_PALETTE.length] };
        });
    }
    buildTickerInfo();

    // 資料源：FMP 為主（有 key 才用）· 失敗 fallback Yahoo（靠 CORS proxy）
    const FMP_BASE = 'https://financialmodelingprep.com/stable';
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url=',
    ];

    function getFmpKey() {
        // 跟 valuation 工具共用 · 用戶不用重輸入
        return localStorage.getItem('fmp_api_key') || '';
    }

    // ==========================================
    // helpers
    // ==========================================
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const fmtPct = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
    const fmtVol = n => {
        if (n === null || Number.isNaN(n)) return '—';
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(Math.round(n));
    };

    async function fetchViaProxy(url) {
        const attempts = [url, ...CORS_PROXIES.map(p => `${p}${encodeURIComponent(url)}`)];
        const labels = ['直連', ...CORS_PROXIES.map((p, i) => `proxy${i + 1}`)];
        for (let i = 0; i < attempts.length; i++) {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 12000);
            try {
                const res = await fetch(attempts[i], { signal: controller.signal });
                clearTimeout(t);
                if (res.ok) {
                    const data = await res.json();
                    if (i > 0) console.log(`✅ Yahoo via ${labels[i]} 成功`);   // 成功也留痕跡
                    return data;
                }
                console.warn(`Yahoo ${labels[i]} HTTP ${res.status}`);
            } catch (e) {
                clearTimeout(t);
                console.warn(`Yahoo ${labels[i]} 失敗:`, e.message);
            }
        }
        throw new Error('直連 + 兩個 proxy 都失敗 · F12 看 console');
    }

    async function fetchYahoo(ticker, daysBack) {
        const now = Math.floor(Date.now() / 1000);
        const start = now - daysBack * 86400;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${now}&interval=1d`;
        const data = await fetchViaProxy(url);
        if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) {
            throw new Error(`${ticker} 回傳格式異常`);
        }
        const r = data.chart.result[0];
        const ts = r.timestamp || [];
        const q = r.indicators && r.indicators.quote && r.indicators.quote[0];
        const closes = (q && q.close) || [];
        const volumes = (q && q.volume) || [];
        return ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            close: closes[i],
            volume: volumes[i],
        })).filter(d => d.close !== null && isFinite(d.close) && d.volume);
    }

    // FMP · /stable/historical-price-eod/light · 免費 tier 對 SPDR 類股 ETF 也支援
    // (原本的 /full 免費 tier 對 XLK/XLC/etc 會 402 · Premium Query Parameter Special Endpoint)
    // light 回傳 date + price + volume 剛好夠我算 X/Y 兩軸
    async function fetchFmp(ticker, daysBack, apikey) {
        const to = new Date();
        const from = new Date(to.getTime() - daysBack * 86400 * 1000);
        const fromStr = from.toISOString().slice(0, 10);
        const toStr = to.toISOString().slice(0, 10);
        const url = `${FMP_BASE}/historical-price-eod/light?symbol=${ticker}&from=${fromStr}&to=${toStr}&apikey=${apikey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let res;
        try {
            res = await fetch(url, { signal: controller.signal });
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('FMP 15 秒超時');
            throw new Error(`FMP 網路錯誤: ${e.message}`);
        } finally {
            clearTimeout(timeoutId);
        }
        if (!res.ok) {
            let bodyText = '';
            try { bodyText = (await res.text()).slice(0, 200); } catch (_) {}
            console.error(`FMP ${ticker} HTTP ${res.status}:`, bodyText);
            if (res.status === 401) throw new Error('FMP key 無效（401）');
            if (res.status === 403) throw new Error('FMP endpoint 需付費 tier（403）');
            if (res.status === 429) throw new Error('FMP 免費額度用完（429 · 250/日）');
            throw new Error(`FMP HTTP ${res.status}: ${bodyText.slice(0, 80)}`);
        }
        const data = await res.json();
        // FMP /stable 回傳可能是 array 直接、或 { symbol, historical: [...] }
        let rows;
        if (Array.isArray(data)) rows = data;
        else if (data && Array.isArray(data.historical)) rows = data.historical;
        else {
            console.error(`FMP ${ticker} 格式異常:`, data);
            throw new Error('FMP 回傳格式異常 · F12 看 console');
        }
        // FMP 是新到舊 · 反過來變舊到新
        rows.sort((a, b) => a.date.localeCompare(b.date));
        // /light 只有 date + price + volume · /full 有 adjClose + close + volume
        // 全部接收 · 優先順序 adjClose > close > price
        const mapped = rows.map(r => ({
            date: r.date,
            close: r.adjClose ?? r.close ?? r.price ?? null,
            volume: r.volume ?? r.unadjustedVolume ?? 0,
        })).filter(d => d.close !== null && isFinite(d.close) && d.volume > 0);
        console.log(`✅ FMP ${ticker}: ${mapped.length} rows（raw ${rows.length}）`);
        if (mapped.length === 0 && rows.length > 0) {
            console.warn(`FMP ${ticker} 回傳 ${rows.length} 筆但 filter 後 0 · 欄位 sample:`, rows[0]);
        }
        return mapped;
    }

    // 快速驗證 FMP key 是否有效 · 打一個輕量 endpoint（單一 ticker 5 天資料）
    async function verifyFmpKey(apikey) {
        try {
            const rows = await fetchFmp('SPY', 5, apikey);
            return { ok: true, rows: rows.length };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // 統一入口：有 FMP key 先試 FMP · 失敗才 fallback Yahoo
    // 回傳 { data, source } · source 是 'FMP' 或 'Yahoo'
    async function fetchTicker(ticker, daysBack) {
        const key = getFmpKey();
        if (key) {
            try {
                const data = await fetchFmp(ticker, daysBack, key);
                if (data && data.length > 10) return { data, source: 'FMP' };
            } catch (e) {
                console.warn(`FMP fail for ${ticker}: ${e.message} · falling back to Yahoo`);
            }
        }
        const data = await fetchYahoo(ticker, daysBack);
        console.log(`✅ Yahoo ${ticker}: ${data.length} rows（FMP fallback）`);
        return { data, source: 'Yahoo' };
    }

    // ==========================================
    // Metrics computation
    // ==========================================
    // For each ticker, compute per-day:
    //   x = 今日成交量 / 過去 VOL_WINDOW 日平均成交量
    //   y = 過去 MOM_WINDOW 日累積報酬 - SPY 同期累積報酬
    //   bubbleSize = 成交金額 (close × volume)
    function computeMetrics(series, spySeries) {
        const spyByDate = new Map(spySeries.map(d => [d.date, d]));
        const spyDateIdx = new Map(spySeries.map((d, i) => [d.date, i]));
        const out = [];
        for (let i = VOL_WINDOW; i < series.length; i++) {
            const cur = series[i];
            const spyMatch = spyByDate.get(cur.date);
            if (!spyMatch) continue;
            if (i < MOM_WINDOW) continue;

            // 20-day avg volume（用 i-VOL_WINDOW ... i-1）
            let volSum = 0;
            for (let j = i - VOL_WINDOW; j < i; j++) volSum += series[j].volume;
            const avgVol = volSum / VOL_WINDOW;
            const x = avgVol > 0 ? cur.volume / avgVol : 1;

            // 10-day cumulative return
            const anchor = series[i - MOM_WINDOW];
            const ret = (cur.close - anchor.close) / anchor.close;

            // SPY 10-day return · align by date, not index
            const spyAnchorIdx = spyDateIdx.get(anchor.date);
            if (spyAnchorIdx === undefined) continue;
            const spyAnchor = spySeries[spyAnchorIdx];
            const spyRet = (spyMatch.close - spyAnchor.close) / spyAnchor.close;

            const y = ret - spyRet;

            out.push({
                date: cur.date,
                x, y,
                close: cur.close,
                volume: cur.volume,
                dollarVol: cur.close * cur.volume,
                ret10d: ret,
                spyRet10d: spyRet,
            });
        }
        return out;
    }

    function quadrantOf(x, y) {
        if (x >= 1 && y >= 0) return { key: 'tr', name: '主升段確認', emoji: '🚀', cls: 'q-tr' };
        if (x < 1  && y >= 0) return { key: 'tl', name: '量價背離',   emoji: '⚠',  cls: 'q-tl' };
        if (x >= 1 && y < 0)  return { key: 'br', name: '恐慌性賣壓', emoji: '💥', cls: 'q-br' };
        return                       { key: 'bl', name: '冷門區',     emoji: '❄',  cls: 'q-bl' };
    }

    // ==========================================
    // State
    // ==========================================
    const state = {
        metrics: {},        // ticker → array of {date, x, y, ...}
        rawSeries: {},      // ticker → full raw series [{date, close, volume}]（給驗證面板用）
        dates: [],          // sorted array of dates that are common across all tickers
        currentIdx: 0,
        playing: false,
        playTimer: null,
        speedMs: 400,
        maxDollarVol: 1,
        axisRanges: null,
        visibleTickers: new Set(TICKERS),   // 哪些 ticker 目前要顯示
        dataSources: { FMP: 0, Yahoo: 0 },  // 各資料源抓了幾檔
        activeTickers: [],                  // 成功抓到的 ticker（失敗的排除）
        failedTickers: [],                  // 失敗的 ticker + 錯誤訊息
    };

    // ==========================================
    // Data loading
    // ==========================================
    async function loadAllData() {
        const status = $('load-status');
        const btnPlay = $('btn-play');
        btnPlay.disabled = true;
        btnPlay.textContent = '⏳ 資料載入中……';

        // 抓 ~140 天 · 才夠算 20 日 vol 和 63 日 display
        const daysBack = DISPLAY_DAYS + VOL_WINDOW + 20;
        const all = [BENCHMARK, ...TICKERS];

        // 有 FMP key 就平行抓（FMP 支援 300/分）· 沒 key 就 sequential（Yahoo proxy 會 throttle）
        const hasKey = !!getFmpKey();
        const startTime = performance.now();
        let elapsedTimer = null;
        function updateElapsed() {
            const secs = ((performance.now() - startTime) / 1000).toFixed(1);
            const el = $('elapsed-secs');
            if (el) el.textContent = secs + 's';
        }
        elapsedTimer = setInterval(updateElapsed, 100);

        drawLoadingPlaceholder(0, all.length, all[0], hasKey ? '平行' : '順序');
        updateLoadStatus(status, 0, all.length, all[0], hasKey ? '平行載入' : '順序載入');

        const results = {};
        const sourceCounts = { FMP: 0, Yahoo: 0 };

        const failedTickers = [];
        try {
            if (hasKey) {
                // 平行載入 · 每支 ticker 個別 try/catch · 一支掛不會拖垮全部
                let doneCount = 0;
                const promises = all.map(async t => {
                    try {
                        const { data, source } = await fetchTicker(t, daysBack);
                        doneCount += 1;
                        drawLoadingPlaceholder(doneCount, all.length, t, '平行');
                        updateLoadStatus(status, doneCount, all.length, t, '平行載入');
                        return { t, data, source, ok: true };
                    } catch (e) {
                        doneCount += 1;
                        console.error(`❌ ${t} 失敗:`, e.message);
                        drawLoadingPlaceholder(doneCount, all.length, t, '平行');
                        updateLoadStatus(status, doneCount, all.length, t, '平行載入');
                        return { t, ok: false, error: e.message };
                    }
                });
                const settled = await Promise.all(promises);
                for (const s of settled) {
                    if (s.ok) {
                        results[s.t] = s.data;
                        sourceCounts[s.source] = (sourceCounts[s.source] || 0) + 1;
                    } else {
                        failedTickers.push({ t: s.t, error: s.error });
                    }
                }
            } else {
                // 順序載入（Yahoo proxy · 併發會 throttle）
                for (const t of all) {
                    drawLoadingPlaceholder(Object.keys(results).length, all.length, t, '順序');
                    updateLoadStatus(status, Object.keys(results).length, all.length, t, '順序載入');
                    try {
                        const { data, source } = await fetchTicker(t, daysBack);
                        results[t] = data;
                        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
                    } catch (e) {
                        console.error(`❌ ${t} 失敗:`, e.message);
                        failedTickers.push({ t, error: e.message });
                    }
                }
            }
        } catch (e) {
            clearInterval(elapsedTimer);
            console.error(`Failed to fetch:`, e);
            drawErrorPlaceholder('資料', e.message);
            status.innerHTML = `❌ 抓取失敗：${e.message}<br>過幾秒重整試試 · 或去 <a href="../valuation/index.html">估值分析器</a> 檢查 FMP key`;
            btnPlay.textContent = '▶ 播放';
            return;
        }
        clearInterval(elapsedTimer);
        const totalMs = performance.now() - startTime;
        state.dataSources = sourceCounts;
        state.loadElapsedMs = totalMs;
        // All fetched
        drawLoadingPlaceholder(all.length, all.length, '計算中');
        updateLoadStatus(status, all.length, all.length, '計算中');

        const spy = results[BENCHMARK];
        if (!spy || spy.length < VOL_WINDOW + MOM_WINDOW) {
            status.textContent = '❌ SPY 資料不足';
            return;
        }

        // 保留原始資料給驗證面板
        state.rawSeries = results;

        // 只跑成功抓到的 ticker · 失敗的從 visibleTickers 拿掉
        const activeTickers = TICKERS.filter(t => results[t] && results[t].length > 0);
        state.activeTickers = activeTickers;
        for (const t of TICKERS) {
            if (!activeTickers.includes(t)) state.visibleTickers.delete(t);
        }

        // Compute metrics per active ticker
        for (const t of activeTickers) {
            state.metrics[t] = computeMetrics(results[t], spy);
        }

        // 取交集日期（成功的 ticker 都有 metrics 的日期）· 且只保留最近 DISPLAY_DAYS
        const dateCounts = new Map();
        for (const t of activeTickers) {
            for (const m of state.metrics[t]) {
                dateCounts.set(m.date, (dateCounts.get(m.date) || 0) + 1);
            }
        }
        const commonDates = Array.from(dateCounts.entries())
            .filter(([_, c]) => c === activeTickers.length)
            .map(([d]) => d)
            .sort();
        state.dates = commonDates.slice(-DISPLAY_DAYS);
        state.currentIdx = state.dates.length - 1;   // start at latest day

        // 計算 axis range 和 max dollar vol
        computeAxisRanges();

        // Init UI
        const slider = $('day-slider');
        slider.min = 0;
        slider.max = state.dates.length - 1;
        slider.value = state.currentIdx;
        slider.disabled = false;

        const srcParts = [];
        if (state.dataSources.FMP > 0) srcParts.push(`FMP × ${state.dataSources.FMP}`);
        if (state.dataSources.Yahoo > 0) srcParts.push(`Yahoo × ${state.dataSources.Yahoo}`);
        const srcTag = srcParts.join(' + ');
        const elapsedTxt = (state.loadElapsedMs / 1000).toFixed(1);
        let failedMsg = '';
        if (state.failedTickers && state.failedTickers.length > 0) {
            const failedNames = state.failedTickers.map(f => f.t).join(', ');
            failedMsg = `<br>⚠ 失敗 ${state.failedTickers.length} 支：<b>${failedNames}</b>（FMP 402 付費限制 + Yahoo proxy 掛 · 已從圖表隱藏）`;
        }
        status.innerHTML = `✅ 資料就緒 · <b>${state.dates.length}</b> 個交易日（${state.dates[0]} → ${state.dates[state.dates.length - 1]}）· 資料源 <b>${srcTag}</b> · 載入 <b>${elapsedTxt}s</b>${failedMsg}<br>按 <b>▶ 播放</b> 看資金流向`;

        btnPlay.disabled = false;
        btnPlay.textContent = '▶ 播放';

        renderFrame();
    }

    function updateLoadStatus(status, done, total, curTicker, mode) {
        const pct = Math.floor((done / total) * 100);
        status.innerHTML = `
            <div class="load-progress-wrap">
                <div class="load-progress-label">
                    📡 ${mode || ''} · ${done < total ? `<b>${curTicker}</b> 歷史資料` : '計算輪動指標'}……
                    <span class="load-progress-count">${done} / ${total} · <span id="elapsed-secs">0.0s</span></span>
                </div>
                <div class="load-progress-bar-outer">
                    <div class="load-progress-bar-inner" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }

    function drawLoadingPlaceholder(done, total, curTicker, mode) {
        const canvas = $('radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        // 淡色四象限背景（提示等等會畫這個）
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w / 2, 20);
        ctx.lineTo(w / 2, h - 20);
        ctx.moveTo(20, h / 2);
        ctx.lineTo(w - 20, h / 2);
        ctx.stroke();

        // 象限標籤（淡）
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('🚀 主升段', w - 20, 20);
        ctx.textAlign = 'left';
        ctx.fillText('⚠ 量價背離', 20, 20);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('💥 恐慌賣壓', w - 20, h - 20);
        ctx.textAlign = 'left';
        ctx.fillText('❄ 冷門', 20, h - 20);

        // 大字：正在下載
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📡 正在下載歷史資料', w / 2, h / 2 - 40);

        // 中字：當前狀態
        ctx.fillStyle = '#475569';
        ctx.font = '16px sans-serif';
        const modeTag = mode ? `[${mode}] ` : '';
        const label = done < total ? `${modeTag}${curTicker}（${done} / ${total} 完成）` : `計算輪動指標中……`;
        ctx.fillText(label, w / 2, h / 2 - 10);

        // 進度條
        const barW = Math.min(400, w * 0.5);
        const barH = 10;
        const barX = (w - barW) / 2;
        const barY = h / 2 + 20;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(barX, barY, barW * (done / total), barH);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // 百分比
        ctx.fillStyle = '#4338ca';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(`${Math.floor((done / total) * 100)}%`, w / 2, barY + barH + 20);

        // 提示
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        const hint = mode === '平行'
            ? '（FMP 平行載入 · 預期 1-3 秒）'
            : mode === '順序'
              ? '（Yahoo 順序載入 · 預期 5-15 秒 · 存 FMP key 會變快）'
              : '（首次載入約 3-15 秒）';
        ctx.fillText(hint, w / 2, barY + barH + 45);
    }

    function drawErrorPlaceholder(ticker, msg) {
        const canvas = $('radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#7f1d1d';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`❌ 抓 ${ticker} 失敗`, w / 2, h / 2 - 20);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#991b1b';
        ctx.fillText(msg, w / 2, h / 2 + 10);
        ctx.fillText('請重新整理頁面（Yahoo proxy 有時 throttle）', w / 2, h / 2 + 35);
    }

    function computeAxisRanges() {
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, maxDV = 0;
        for (const t of TICKERS) {
            if (!state.metrics[t]) continue;   // 抓失敗的 ticker 跳過
            for (const m of state.metrics[t]) {
                if (!state.dates.includes(m.date)) continue;
                if (m.x < xMin) xMin = m.x;
                if (m.x > xMax) xMax = m.x;
                if (m.y < yMin) yMin = m.y;
                if (m.y > yMax) yMax = m.y;
                if (m.dollarVol > maxDV) maxDV = m.dollarVol;
            }
        }
        // 給 axis 一些 padding 且以中心 (1.0, 0) 對稱
        const xSpread = Math.max(xMax - 1, 1 - xMin, 0.5);
        const ySpread = Math.max(Math.abs(yMax), Math.abs(yMin), 0.03);
        state.axisRanges = {
            xMin: 1 - xSpread * 1.15,
            xMax: 1 + xSpread * 1.15,
            yMin: -ySpread * 1.15,
            yMax: ySpread * 1.15,
        };
        state.maxDollarVol = maxDV;
    }

    // ==========================================
    // Rendering
    // ==========================================
    function renderFrame() {
        if (state.dates.length === 0) return;
        const canvas = $('radar-canvas');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const padL = 60, padR = 30, padT = 30, padB = 50;
        const cw = w - padL - padR;
        const ch = h - padT - padB;
        const { xMin, xMax, yMin, yMax } = state.axisRanges;

        const xFor = xv => padL + ((xv - xMin) / (xMax - xMin)) * cw;
        const yFor = yv => padT + ch - ((yv - yMin) / (yMax - yMin)) * ch;

        // Quadrant background tint
        const cxPx = xFor(1);
        const cyPx = yFor(0);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';   // TR 主升段確認 · 綠
        ctx.fillRect(cxPx, padT, padL + cw - cxPx, cyPx - padT);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.06)';   // TL 量價背離 · 黃
        ctx.fillRect(padL, padT, cxPx - padL, cyPx - padT);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';    // BR 恐慌性賣壓 · 紅
        ctx.fillRect(cxPx, cyPx, padL + cw - cxPx, padT + ch - cyPx);
        ctx.fillStyle = 'rgba(107, 114, 128, 0.06)';  // BL 冷門區 · 灰
        ctx.fillRect(padL, cyPx, cxPx - padL, padT + ch - cyPx);

        // Grid lines
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        // vertical grid
        for (let vx = Math.ceil(xMin * 2) / 2; vx <= xMax; vx += 0.5) {
            const x = xFor(vx);
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + ch);
            ctx.stroke();
        }
        // horizontal grid
        for (let vy = Math.ceil(yMin / 0.02) * 0.02; vy <= yMax; vy += 0.02) {
            const y = yFor(vy);
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + cw, y);
            ctx.stroke();
        }

        // Center lines (x=1, y=0) · 較粗
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cxPx, padT);
        ctx.lineTo(cxPx, padT + ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padL, cyPx);
        ctx.lineTo(padL + cw, cyPx);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#475569';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let vx = Math.ceil(xMin * 2) / 2; vx <= xMax; vx += 0.5) {
            ctx.fillText(vx.toFixed(1) + 'x', xFor(vx), padT + ch + 4);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let vy = Math.ceil(yMin / 0.02) * 0.02; vy <= yMax; vy += 0.02) {
            ctx.fillText((vy * 100).toFixed(0) + '%', padL - 4, yFor(vy));
        }

        // Axis titles
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('資金熱度 · 今日量 / 20日均量 →', padL + cw / 2, padT + ch + 34);
        ctx.save();
        ctx.translate(padL - 42, padT + ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'middle';
        ctx.fillText('← vs SPY · 10日相對報酬 →', 0, 0);
        ctx.restore();

        // Quadrant labels (corners)
        ctx.font = 'bold 14px sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
        ctx.fillText('🚀 主升段確認', padL + cw - 8, padT + 6);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.fillText('⚠ 量價背離', padL + 8, padT + 6);
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
        ctx.fillText('💥 恐慌性賣壓', padL + cw - 8, padT + ch - 6);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(107, 114, 128, 0.75)';
        ctx.fillText('❄ 冷門區', padL + 8, padT + ch - 6);

        // Draw bubble + trail for each ticker
        const currentDate = state.dates[state.currentIdx];
        const bubblePositions = [];   // for hit detection

        for (const t of TICKERS) {
            if (!state.visibleTickers.has(t)) continue;   // 被隱藏的個股跳過
            if (!state.metrics[t]) continue;              // 抓失敗的 ticker 跳過
            const info = TICKER_INFO[t];
            const series = state.metrics[t].filter(m => state.dates.includes(m.date));
            const curMetricIdx = series.findIndex(m => m.date === currentDate);
            if (curMetricIdx < 0) continue;

            // Trail: last TRAIL_LEN points ending at currentIdx (inclusive)
            const trailStart = Math.max(0, curMetricIdx - TRAIL_LEN + 1);
            const trail = series.slice(trailStart, curMetricIdx + 1);

            // Draw trail as fading line
            ctx.strokeStyle = info.color;
            ctx.lineWidth = 1.5;
            for (let i = 1; i < trail.length; i++) {
                const alpha = i / trail.length;   // fade in
                ctx.globalAlpha = alpha * 0.6;
                ctx.beginPath();
                ctx.moveTo(xFor(trail[i - 1].x), yFor(trail[i - 1].y));
                ctx.lineTo(xFor(trail[i].x), yFor(trail[i].y));
                ctx.stroke();
            }
            // Draw fading dots along trail
            for (let i = 0; i < trail.length - 1; i++) {
                const alpha = (i + 1) / trail.length;
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle = info.color;
                ctx.beginPath();
                ctx.arc(xFor(trail[i].x), yFor(trail[i].y), 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // Current bubble
            const cur = trail[trail.length - 1];
            const cx = xFor(cur.x);
            const cy = yFor(cur.y);
            const bubbleR = 10 + Math.sqrt(cur.dollarVol / state.maxDollarVol) * 26;

            // Halo
            ctx.fillStyle = info.color + '33';
            ctx.beginPath();
            ctx.arc(cx, cy, bubbleR + 4, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillStyle = info.color;
            ctx.beginPath();
            ctx.arc(cx, cy, bubbleR, 0, Math.PI * 2);
            ctx.fill();
            // Border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Ticker label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t, cx, cy);

            bubblePositions.push({ t, cx, cy, r: bubbleR, metric: cur });
        }

        // Store for hit detection
        state.bubblePositions = bubblePositions;

        // Update date display + slider
        $('current-date').textContent = currentDate;
        $('day-slider').value = state.currentIdx;

        renderSnapshotTable();
        renderVerifyPanel();
        renderSpyRawPanel();
    }

    // 驗證面板：每個 ticker 顯示當日的原始收盤/成交量 + 20日均量計算 + 10日報酬計算
    // 目標是讓玩家能眼睛對照 Yahoo Finance 網站確認資料源可信
    function renderVerifyPanel() {
        const el = $('verify-body');
        if (!el) return;
        const currentDate = state.dates[state.currentIdx];
        const spy = state.rawSeries[BENCHMARK];
        if (!spy) return;

        const spyIdxByDate = new Map(spy.map((d, i) => [d.date, i]));
        const spyIdx = spyIdxByDate.get(currentDate);
        if (spyIdx === undefined) return;
        const spyToday = spy[spyIdx];
        const spy10dAgoRaw = spy[spyIdx - MOM_WINDOW];

        let html = `<div class="verify-day">📅 <b>${currentDate}</b> · SPY 收盤 $${fmt(spyToday.close, 2)}`;
        if (spy10dAgoRaw) {
            const spy10dRet = (spyToday.close - spy10dAgoRaw.close) / spy10dAgoRaw.close;
            html += ` · 10 日前（${spy10dAgoRaw.date}）$${fmt(spy10dAgoRaw.close, 2)} → 10 日累積 ${spy10dRet >= 0 ? '+' : ''}${fmtPct(spy10dRet, 2)}`;
        }
        html += `</div>`;

        html += `<div class="verify-grid">`;
        for (const t of TICKERS) {
            const raw = state.rawSeries[t];
            if (!raw) continue;   // 抓失敗的 ticker 跳過
            const info = TICKER_INFO[t];
            const rawIdxByDate = new Map(raw.map((d, i) => [d.date, i]));
            const rawIdx = rawIdxByDate.get(currentDate);
            if (rawIdx === undefined) continue;
            const today = raw[rawIdx];
            const tenDAgo = raw[rawIdx - MOM_WINDOW];
            // 20-day avg volume: raw[rawIdx-20 ... rawIdx-1]
            let volSum = 0;
            const volSamples = [];
            for (let j = rawIdx - VOL_WINDOW; j < rawIdx; j++) {
                if (j >= 0 && raw[j]) {
                    volSum += raw[j].volume;
                    volSamples.push(raw[j].volume);
                }
            }
            const avgVol = volSum / volSamples.length;
            const x = today.volume / avgVol;
            const ret10 = tenDAgo ? (today.close - tenDAgo.close) / tenDAgo.close : null;
            const spyRet10 = spy10dAgoRaw ? (spyToday.close - spy10dAgoRaw.close) / spy10dAgoRaw.close : null;
            const y = (ret10 !== null && spyRet10 !== null) ? ret10 - spyRet10 : null;

            const q = (x !== null && y !== null) ? quadrantOf(x, y) : { emoji: '—', name: '—', cls: '' };

            html += `
                <div class="verify-card">
                    <div class="verify-head" style="border-left-color: ${info.color}">
                        <b>${t}</b> · ${info.name}
                        <span class="verify-q ${q.cls}">${q.emoji} ${q.name}</span>
                    </div>
                    <div class="verify-row">
                        <span class="vk">今日收盤</span> $${fmt(today.close, 2)}
                        &nbsp;·&nbsp; <span class="vk">今日成交量</span> ${fmtVol(today.volume)}
                    </div>
                    <div class="verify-row">
                        <span class="vk">20 日均量</span>
                        <code>Σ vol[${rawIdx - VOL_WINDOW}..${rawIdx - 1}] / ${VOL_WINDOW} = ${fmtVol(avgVol)}</code>
                    </div>
                    <div class="verify-row verify-calc">
                        <b>X = ${fmtVol(today.volume)} / ${fmtVol(avgVol)} = <span class="calc-out">${fmt(x, 3)}x</span></b>
                    </div>
                    ${tenDAgo ? `
                        <div class="verify-row">
                            <span class="vk">10 日前收盤</span>（${tenDAgo.date}）$${fmt(tenDAgo.close, 2)}
                        </div>
                        <div class="verify-row">
                            <span class="vk">10 日報酬</span>
                            <code>(${fmt(today.close, 2)} - ${fmt(tenDAgo.close, 2)}) / ${fmt(tenDAgo.close, 2)} = ${ret10 >= 0 ? '+' : ''}${fmtPct(ret10, 2)}</code>
                        </div>
                        <div class="verify-row verify-calc">
                            <b>Y = ${ret10 >= 0 ? '+' : ''}${fmtPct(ret10, 2)} - (${spyRet10 >= 0 ? '+' : ''}${fmtPct(spyRet10, 2)}) = <span class="calc-out">${y >= 0 ? '+' : ''}${fmtPct(y, 2)}</span></b>
                        </div>
                    ` : '<div class="verify-row">（10 日前無資料）</div>'}
                </div>
            `;
        }
        html += `</div>`;
        el.innerHTML = html;
    }

    // SPY 完整原始資料面板（最新 30 天）· 讓玩家能對照 Yahoo Finance 網站
    function renderSpyRawPanel() {
        const el = $('spy-raw-body');
        if (!el) return;
        const spy = state.rawSeries[BENCHMARK];
        if (!spy) return;
        const recent = spy.slice(-30);
        let html = `
            <div class="hint hint-mini">
                比對 <a href="https://finance.yahoo.com/quote/SPY/history" target="_blank" rel="noopener">Yahoo Finance SPY History</a> —— 收盤價 + 成交量對得起來就代表整組資料源可信。
            </div>
            <table class="fund-table spy-raw-table">
                <thead>
                    <tr><th>日期</th><th>收盤（分割/股息調整後）</th><th>成交量</th></tr>
                </thead>
                <tbody>
        `;
        for (let i = recent.length - 1; i >= 0; i--) {
            const d = recent[i];
            html += `<tr><td>${d.date}</td><td>$${fmt(d.close, 2)}</td><td>${fmtVol(d.volume)}</td></tr>`;
        }
        html += `</tbody></table>`;
        el.innerHTML = html;
    }

    function renderSnapshotTable() {
        const currentDate = state.dates[state.currentIdx];
        const tbody = $('snapshot-tbody');
        tbody.innerHTML = '';
        for (const t of TICKERS) {
            if (!state.metrics[t]) continue;   // 抓失敗的 ticker 跳過
            const info = TICKER_INFO[t];
            const m = state.metrics[t].find(mm => mm.date === currentDate);
            if (!m) continue;
            const q = quadrantOf(m.x, m.y);
            const retCls = m.ret10d >= 0 ? 'val-pos' : 'val-neg';
            const relCls = m.y >= 0 ? 'val-pos' : 'val-neg';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="tk-dot" style="background:${info.color}"></span> <b>${t}</b></td>
                <td>${info.sector || info.name}</td>
                <td>$${fmt(m.close, 2)}</td>
                <td class="${retCls}">${m.ret10d >= 0 ? '+' : ''}${fmtPct(m.ret10d)}</td>
                <td class="${relCls}">${m.y >= 0 ? '+' : ''}${fmtPct(m.y)}</td>
                <td>${fmt(m.x, 2)}x</td>
                <td class="${q.cls}"><b>${q.emoji} ${q.name}</b></td>
            `;
            tbody.appendChild(tr);
        }
    }

    // ==========================================
    // Interactivity
    // ==========================================
    function initTooltip() {
        const canvas = $('radar-canvas');
        const tooltip = $('tooltip');

        canvas.addEventListener('mousemove', (e) => {
            if (!state.bubblePositions) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let hit = null;
            for (const bp of state.bubblePositions) {
                const dx = mx - bp.cx;
                const dy = my - bp.cy;
                if (dx * dx + dy * dy <= bp.r * bp.r) {
                    hit = bp;
                    break;
                }
            }
            if (hit) {
                const info = TICKER_INFO[hit.t];
                const q = quadrantOf(hit.metric.x, hit.metric.y);
                const retSign = hit.metric.ret10d >= 0 ? '+' : '';
                const relSign = hit.metric.y >= 0 ? '+' : '';
                tooltip.innerHTML = `
                    <div class="tt-title" style="border-left-color: ${info.color}">
                        <b>${hit.t}</b> · ${info.name}
                    </div>
                    <div class="tt-row">📅 ${hit.metric.date}</div>
                    <div class="tt-row">💵 收盤 $${fmt(hit.metric.close, 2)}</div>
                    <div class="tt-row">📊 成交量比 <b>${fmt(hit.metric.x, 2)}x</b>（20日均量）</div>
                    <div class="tt-row">📈 10日報酬 ${retSign}${fmtPct(hit.metric.ret10d)}</div>
                    <div class="tt-row">🎯 相對 SPY ${relSign}${fmtPct(hit.metric.y)}</div>
                    <div class="tt-quad ${q.cls}">${q.emoji} <b>${q.name}</b></div>
                `;
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
                tooltip.hidden = false;
                canvas.style.cursor = 'pointer';
            } else {
                tooltip.hidden = true;
                canvas.style.cursor = 'crosshair';
            }
        });
        canvas.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
        });
    }

    function initControls() {
        $('day-slider').addEventListener('input', (e) => {
            state.currentIdx = parseInt(e.target.value);
            renderFrame();
        });

        $('btn-play').addEventListener('click', () => {
            if (state.playing) stopPlay();
            else startPlay();
        });

        $('speed-select').addEventListener('change', (e) => {
            state.speedMs = parseInt(e.target.value);
            if (state.playing) {
                stopPlay();
                startPlay();
            }
        });

        // 類股 chip · 點單個 toggle · 全部/全隱藏 按鈕
        initTickerChips();
    }

    function initTickerChips() {
        const chipRow = $('ticker-chips');
        // 插在「全部」「全隱藏」後面的位置 · 每個 ticker 一顆 chip
        TICKERS.forEach(t => {
            const info = TICKER_INFO[t];
            const btn = document.createElement('button');
            btn.className = 'chip active';
            btn.dataset.ticker = t;
            btn.innerHTML = `<span class="chip-dot" style="background:${info.color}"></span> ${t} · ${info.name}`;
            btn.style.borderColor = info.color;
            chipRow.appendChild(btn);
        });
        chipRow.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const ticker = btn.dataset.ticker;
            if (action === 'all') {
                state.visibleTickers = new Set(TICKERS);
            } else if (action === 'clear') {
                state.visibleTickers = new Set();
            } else if (ticker) {
                // Ctrl / Cmd click 是 toggle · 純點是「只看這條」
                if (e.ctrlKey || e.metaKey) {
                    if (state.visibleTickers.has(ticker)) state.visibleTickers.delete(ticker);
                    else state.visibleTickers.add(ticker);
                } else {
                    // 若已經是 solo · 再點回全部
                    if (state.visibleTickers.size === 1 && state.visibleTickers.has(ticker)) {
                        state.visibleTickers = new Set(TICKERS);
                    } else {
                        state.visibleTickers = new Set([ticker]);
                    }
                }
            }
            updateChipStates();
            renderFrame();
        });
        updateChipStates();
    }

    function updateChipStates() {
        const chipRow = $('ticker-chips');
        chipRow.querySelectorAll('button').forEach(btn => {
            const action = btn.dataset.action;
            const ticker = btn.dataset.ticker;
            if (action === 'all') {
                btn.classList.toggle('active', state.visibleTickers.size === TICKERS.length);
            } else if (action === 'clear') {
                btn.classList.toggle('active', state.visibleTickers.size === 0);
            } else if (ticker) {
                btn.classList.toggle('active', state.visibleTickers.has(ticker));
            }
        });
    }

    function startPlay() {
        if (state.dates.length === 0) return;
        state.playing = true;
        $('btn-play').textContent = '⏸ 暫停';
        if (state.currentIdx >= state.dates.length - 1) state.currentIdx = 0;
        state.playTimer = setInterval(() => {
            state.currentIdx += 1;
            if (state.currentIdx >= state.dates.length) {
                stopPlay();
                return;
            }
            renderFrame();
        }, state.speedMs);
    }

    function stopPlay() {
        state.playing = false;
        $('btn-play').textContent = '▶ 播放';
        if (state.playTimer) clearInterval(state.playTimer);
        state.playTimer = null;
    }

    // ==========================================
    // Init
    // ==========================================
    function initKeyPanel() {
        const input = $('fmp-key-input');
        const statusEl = $('key-status');
        const btnSave = $('btn-save-key');
        const btnClear = $('btn-clear-key');

        function mask(k) {
            if (!k) return '';
            if (k.length < 8) return k[0] + '••••';
            return k.slice(0, 4) + '••••' + k.slice(-4);
        }

        function refreshStatus() {
            const k = getFmpKey();
            if (k) {
                statusEl.innerHTML = `✅ 已儲存 · <code>${mask(k)}</code>（${k.length} chars）· 載入時優先用 FMP`;
                statusEl.className = 'key-status key-status-ok';
                input.placeholder = '換一把新 key（會覆蓋舊的）';
                btnClear.hidden = false;
            } else {
                statusEl.innerHTML = `⚠ 沒 key · 目前用 Yahoo（透過 CORS proxy · 有時 throttle）`;
                statusEl.className = 'key-status key-status-warn';
                input.placeholder = '貼上你的 FMP key';
                btnClear.hidden = true;
            }
        }

        btnSave.addEventListener('click', async () => {
            const v = input.value.trim();
            if (!v) {
                alert('key 不能空白');
                return;
            }
            if (v.length < 20) {
                if (!confirm(`這個 key 只有 ${v.length} 字元 · FMP key 通常 32+ 字元。確定要存？`)) return;
            }
            // 存之前先驗證 · 15s 內若無法連通就當作失敗
            statusEl.innerHTML = `⏳ 驗證 key 中……（打 FMP SPY 5 日資料 · 最多 15s）`;
            statusEl.className = 'key-status key-status-warn';
            btnSave.disabled = true;
            const verify = await verifyFmpKey(v);
            btnSave.disabled = false;
            if (!verify.ok) {
                statusEl.innerHTML = `❌ Key 驗證失敗: ${verify.error} · <b>沒儲存</b> · F12 → console 看細節`;
                statusEl.className = 'key-status key-status-warn';
                console.error('FMP key verify failed:', verify.error);
                return;
            }
            console.log(`✅ FMP key 驗證通過（SPY 5 日 = ${verify.rows} rows）· 存入 localStorage`);
            localStorage.setItem('fmp_api_key', v);
            input.value = '';
            refreshStatus();
            // 存完直接重載資料（用新 key）
            reloadData();
        });

        btnClear.addEventListener('click', () => {
            if (!confirm('確定清除 FMP key？之後只用 Yahoo。')) return;
            localStorage.removeItem('fmp_api_key');
            input.value = '';
            refreshStatus();
            reloadData();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSave.click();
        });

        refreshStatus();
    }

    function reloadData() {
        // 重置狀態 · 停止播放 · 重跑載入
        stopPlay();
        state.metrics = {};
        state.rawSeries = {};
        state.dates = [];
        state.currentIdx = 0;
        state.dataSources = { FMP: 0, Yahoo: 0 };
        $('day-slider').disabled = true;
        loadAllData();
    }

    function loadSavedTickers() {
        try {
            const saved = JSON.parse(localStorage.getItem('rotation_tickers') || 'null');
            if (saved && Array.isArray(saved.tickers) && saved.tickers.length === 6) {
                TICKERS = saved.tickers.map(t => String(t).toUpperCase());
                BENCHMARK = String(saved.benchmark || 'SPY').toUpperCase();
                buildTickerInfo();
                state.visibleTickers = new Set(TICKERS);
                return true;
            }
        } catch (_) {}
        return false;
    }

    function initTickerInputs() {
        // 從 localStorage 讀上次的選擇 · 沒有就用預設
        for (let i = 0; i < 6; i++) $(`ticker-${i + 1}`).value = TICKERS[i] || DEFAULT_TICKERS[i];
        $('ticker-benchmark').value = BENCHMARK;

        const collectTickers = () => {
            const t = [];
            for (let i = 1; i <= 6; i++) {
                const v = $(`ticker-${i}`).value.trim().toUpperCase();
                if (v) t.push(v);
            }
            const b = $('ticker-benchmark').value.trim().toUpperCase() || 'SPY';
            return { tickers: t, benchmark: b };
        };

        $('btn-download').addEventListener('click', () => {
            const { tickers, benchmark } = collectTickers();
            if (tickers.length < 2) {
                alert('至少要 2 個代號才能比較');
                return;
            }
            if (new Set(tickers).size !== tickers.length) {
                alert('代號有重複 · 每個只能出現一次');
                return;
            }
            // 更新 global TICKERS + BENCHMARK · 重建 TICKER_INFO
            TICKERS = tickers;
            BENCHMARK = benchmark;
            buildTickerInfo();
            // 存 localStorage
            localStorage.setItem('rotation_tickers', JSON.stringify({ tickers, benchmark }));
            // 重置狀態 + 重建 chip · 開始載入
            state.visibleTickers = new Set(TICKERS);
            state.metrics = {};
            state.rawSeries = {};
            state.dates = [];
            state.currentIdx = 0;
            state.dataSources = { FMP: 0, Yahoo: 0 };
            state.activeTickers = [];
            state.failedTickers = [];
            rebuildTickerChips();
            drawLoadingPlaceholder(0, TICKERS.length + 1, BENCHMARK);
            loadAllData();
        });

        $('btn-reset-defaults').addEventListener('click', () => {
            for (let i = 0; i < 6; i++) $(`ticker-${i + 1}`).value = DEFAULT_TICKERS[i];
            $('ticker-benchmark').value = DEFAULT_BENCHMARK;
        });

        // Enter 鍵在任一輸入框都能觸發下載
        document.querySelectorAll('.ticker-input').forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') $('btn-download').click();
            });
        });
    }

    function rebuildTickerChips() {
        const chipRow = $('ticker-chips');
        // 清掉舊 chip（保留「全部」「全隱藏」）
        chipRow.querySelectorAll('button[data-ticker]').forEach(el => el.remove());
        TICKERS.forEach(t => {
            const info = TICKER_INFO[t];
            const btn = document.createElement('button');
            btn.className = 'chip active';
            btn.dataset.ticker = t;
            btn.innerHTML = `<span class="chip-dot" style="background:${info.color}"></span> ${t}`;
            btn.style.borderColor = info.color;
            chipRow.appendChild(btn);
        });
        updateChipStates();
    }

    function drawWaitingPlaceholder() {
        const canvas = $('radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w / 2, 20);
        ctx.lineTo(w / 2, h - 20);
        ctx.moveTo(20, h / 2);
        ctx.lineTo(w - 20, h / 2);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👆 上方填入 6 個代號', w / 2, h / 2 - 20);
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('按「📡 下載 · 開始分析」才會抓資料', w / 2, h / 2 + 12);
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('（4 象限雷達會在資料下載後畫出來）', w / 2, h / 2 + 40);
    }

    function init() {
        loadSavedTickers();   // 早點讀 · initControls 建 chip 時已是使用者選的 ticker
        initKeyPanel();
        initControls();
        initTooltip();
        initTickerInputs();
        // 不自動抓資料 · 等使用者按下載
        drawWaitingPlaceholder();
        const btnPlay = $('btn-play');
        btnPlay.disabled = true;
        btnPlay.textContent = '⏳ 等下載';
        $('load-status').innerHTML = `💡 上方填入 6 個代號 · 按 <b>📡 下載 · 開始分析</b> 才會抓資料`;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
