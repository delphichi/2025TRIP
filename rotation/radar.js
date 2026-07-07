(function () {
    'use strict';

    // ==========================================
    // Config
    // ==========================================
    const TICKERS = ['XLK', 'XLC', 'XLF', 'XLE', 'XLV', 'XLI'];
    const BENCHMARK = 'SPY';
    const VOL_WINDOW = 20;    // 20 日均量
    const MOM_WINDOW = 10;    // 10 日累積報酬
    const DISPLAY_DAYS = 63;  // ~3 個月交易日
    const TRAIL_LEN = 12;     // 尾巴保留幾天

    const TICKER_INFO = {
        XLK: { name: '科技',       color: '#3b82f6' },
        XLC: { name: '通訊服務',   color: '#8b5cf6' },
        XLF: { name: '金融',       color: '#10b981' },
        XLE: { name: '能源',       color: '#f59e0b' },
        XLV: { name: '醫療',       color: '#ef4444' },
        XLI: { name: '工業',       color: '#6b7280' },
    };

    // CORS proxies · fallback chain（跟 valuation/simulator.js 同一組）
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url=',
    ];

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
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
        } catch (_) {}
        for (const p of CORS_PROXIES) {
            try {
                const res = await fetch(`${p}${encodeURIComponent(url)}`);
                if (res.ok) return await res.json();
            } catch (_) {}
        }
        throw new Error('直連 + 兩個 proxy 都失敗');
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
        axisRanges: null,   // {xMin, xMax, yMin, yMax}
    };

    // ==========================================
    // Data loading
    // ==========================================
    async function loadAllData() {
        const status = $('load-status');
        // 抓 ~140 天 · 才夠算 20 日 vol 和 63 日 display
        const daysBack = DISPLAY_DAYS + VOL_WINDOW + 20;
        status.textContent = `📡 抓 ${TICKERS.length + 1} 檔標的（${daysBack} 日資料）……`;

        const all = [BENCHMARK, ...TICKERS];
        const results = {};
        // 順序抓 · 避免 proxy 併發 throttle
        for (const t of all) {
            try {
                status.textContent = `📡 抓 ${t}……（${Object.keys(results).length}/${all.length}）`;
                results[t] = await fetchYahoo(t, daysBack);
            } catch (e) {
                console.error(`Failed to fetch ${t}:`, e);
                status.innerHTML = `❌ ${t} 抓取失敗：${e.message}<br>重新載入試試（Yahoo proxy 有時 throttle）`;
                return;
            }
        }

        const spy = results[BENCHMARK];
        if (!spy || spy.length < VOL_WINDOW + MOM_WINDOW) {
            status.textContent = '❌ SPY 資料不足';
            return;
        }

        // 保留原始資料給驗證面板
        state.rawSeries = results;

        // Compute metrics per ticker
        for (const t of TICKERS) {
            state.metrics[t] = computeMetrics(results[t], spy);
        }

        // 取交集日期（所有 ticker 都有 metrics 的日期）· 且只保留最近 DISPLAY_DAYS
        const dateCounts = new Map();
        for (const t of TICKERS) {
            for (const m of state.metrics[t]) {
                dateCounts.set(m.date, (dateCounts.get(m.date) || 0) + 1);
            }
        }
        const commonDates = Array.from(dateCounts.entries())
            .filter(([_, c]) => c === TICKERS.length)
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

        status.innerHTML = `✅ 資料就緒 · <b>${state.dates.length}</b> 個交易日（${state.dates[0]} → ${state.dates[state.dates.length - 1]}）`;

        renderFrame();
    }

    function computeAxisRanges() {
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, maxDV = 0;
        for (const t of TICKERS) {
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
            const info = TICKER_INFO[t];
            const m = state.metrics[t].find(mm => mm.date === currentDate);
            if (!m) continue;
            const q = quadrantOf(m.x, m.y);
            const retCls = m.ret10d >= 0 ? 'val-pos' : 'val-neg';
            const relCls = m.y >= 0 ? 'val-pos' : 'val-neg';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="tk-dot" style="background:${info.color}"></span> <b>${t}</b></td>
                <td>${info.name}</td>
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
    function init() {
        initControls();
        initTooltip();
        loadAllData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
