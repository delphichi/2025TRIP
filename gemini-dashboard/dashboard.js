/* ============================================================
 * Gemini 看盤神器 · 前端演算
 *  - 合成 90 天股價序列（seeded random 保證每次進來一樣）
 *  - 畫 SPARKLINE / 布林通道 / PE 河流圖
 * ============================================================ */

/* -------- 1. Seeded random -------- */
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* -------- 2. 生成價格序列 -------- */
function makeSeries(seed, start, days, drift, vol) {
    const rng = mulberry32(seed);
    const arr = [start];
    for (let i = 1; i < days; i++) {
        const r = drift + vol * gauss(rng);
        const next = Math.max(1, arr[i - 1] * (1 + r));
        arr.push(next);
    }
    return arr.map(v => Math.round(v * 100) / 100);
}

const DAYS = 90;
const tsmc = makeSeries(42, 900, DAYS, 0.0012, 0.015);   // 2330 台積電
const mtk  = makeSeries(7,  1180, DAYS, 0.0009, 0.019);  // 2454 聯發科
const hhpc = makeSeries(13, 195,  DAYS, 0.0005, 0.014);  // 2317 鴻海
const eva  = makeSeries(21, 52,   DAYS, 0.0003, 0.022);  // 2603 長榮

/* -------- 3. 儀表板 tile -------- */
function fmt(n, digits = 2) {
    return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fillOverview() {
    const last = tsmc[tsmc.length - 1];
    const prev = tsmc[tsmc.length - 2];
    const chg = last - prev;
    const pct = chg / prev * 100;
    document.getElementById('tile-close').textContent = fmt(last);

    const chgEl = document.getElementById('tile-change');
    chgEl.textContent = `${chg >= 0 ? '▲' : '▼'} ${fmt(Math.abs(chg))} (${fmt(Math.abs(pct))}%)`;
    chgEl.className = 'tile-sub ' + (chg >= 0 ? 'up' : 'down');

    // MA20
    const last20 = tsmc.slice(-20);
    const ma20 = last20.reduce((a, b) => a + b, 0) / 20;
    document.getElementById('tile-ma20').textContent = fmt(ma20);
    const diff = last - ma20;
    document.getElementById('tile-ma20-diff').textContent =
        `距 MA20 ${diff >= 0 ? '+' : ''}${fmt(diff)}（${fmt(diff / ma20 * 100)}%）`;

    // 布林通道位置
    const mean = ma20;
    const variance = last20.reduce((s, x) => s + (x - mean) ** 2, 0) / (20 - 1);
    const sd = Math.sqrt(variance);
    const upper = mean + 2 * sd;
    const lower = mean - 2 * sd;
    const pos = (last - lower) / (upper - lower); // 0 ~ 1
    const posPct = Math.max(0, Math.min(1, pos)) * 100;
    document.getElementById('tile-bb-pos').textContent = `${fmt(posPct, 1)}%`;
    let hint = '通道中軌附近，波動偏穩';
    if (pos > 0.85) hint = '接近上軌，注意短線壓力';
    else if (pos < 0.15) hint = '接近下軌，觀察是否有支撐';
    document.getElementById('tile-bb-hint').textContent = hint;
}

/* -------- 4. SPARKLINE 繪製 -------- */
function drawSparkline(svg, series, opts = {}) {
    const w = 200, h = svg === document.getElementById('mini-spark') ? 60 : 40;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = '';
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const pad = 4;
    const n = series.length;
    const x = i => (i / (n - 1)) * (w - pad * 2) + pad;
    const y = v => h - pad - ((v - min) / range) * (h - pad * 2);

    // path
    let d = '';
    series.forEach((v, i) => { d += (i === 0 ? 'M' : 'L') + x(i).toFixed(2) + ',' + y(v).toFixed(2) + ' '; });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', opts.color || '#38bdf8');
    path.setAttribute('stroke-width', opts.width || 2);
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    // hi / lo markers
    const iMax = series.indexOf(max);
    const iMin = series.indexOf(min);
    const dot = (cx, cy, color) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy);
        c.setAttribute('r', 3.2); c.setAttribute('fill', color);
        c.setAttribute('stroke', '#0a1224'); c.setAttribute('stroke-width', 1);
        svg.appendChild(c);
    };
    dot(x(iMax), y(max), '#f87171');
    dot(x(iMin), y(min), '#34d399');
}

function fillSparklineTable() {
    const map = [
        { sym: 'TSMC', series: tsmc, closeId: 's1-close', color: '#38bdf8' },
        { sym: 'MTK',  series: mtk,  closeId: 's2-close', color: '#a78bfa' },
        { sym: 'HHPC', series: hhpc, closeId: 's3-close', color: '#34d399' },
        { sym: 'EVA',  series: eva,  closeId: 's4-close', color: '#fbbf24' },
    ];
    map.forEach(({ sym, series, closeId, color }) => {
        const last30 = series.slice(-30);
        document.getElementById(closeId).textContent = fmt(series[series.length - 1]);
        const svg = document.querySelector(`svg[data-symbol="${sym}"]`);
        if (svg) drawSparkline(svg, last30, { color, width: 2 });
    });
    // overview 那顆 mini spark
    drawSparkline(document.getElementById('mini-spark'), tsmc.slice(-30), { color: '#38bdf8', width: 2.4 });
}

/* -------- 5. 布林通道圖 -------- */
function drawBollinger() {
    const svg = document.getElementById('bb-chart');
    const W = 620, H = 320;
    const PAD_L = 46, PAD_R = 12, PAD_T = 18, PAD_B = 30;
    svg.innerHTML = '';

    // 只畫最後 60 天，避免前 20 天 MA 尚未成立
    const window = 20;
    const showFrom = tsmc.length - 60;
    const dates = tsmc.length;

    // 計算 MA/std/upper/lower
    const ma = [], up = [], lo = [];
    for (let i = 0; i < dates; i++) {
        if (i < window - 1) { ma.push(null); up.push(null); lo.push(null); continue; }
        const win = tsmc.slice(i - window + 1, i + 1);
        const m = win.reduce((a, b) => a + b, 0) / window;
        const v = win.reduce((s, x) => s + (x - m) ** 2, 0) / (window - 1);
        const s = Math.sqrt(v);
        ma.push(m); up.push(m + 2 * s); lo.push(m - 2 * s);
    }

    const view = tsmc.slice(showFrom);
    const maV = ma.slice(showFrom);
    const upV = up.slice(showFrom);
    const loV = lo.slice(showFrom);

    const allVals = [...view, ...upV.filter(v => v != null), ...loV.filter(v => v != null)];
    const yMin = Math.min(...allVals) * 0.985;
    const yMax = Math.max(...allVals) * 1.015;

    const n = view.length;
    const xScale = i => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
    const yScale = v => PAD_T + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

    // grid
    const gridLines = 4;
    for (let g = 0; g <= gridLines; g++) {
        const yv = yMin + (yMax - yMin) * g / gridLines;
        const yy = yScale(yv);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', PAD_L); line.setAttribute('x2', W - PAD_R);
        line.setAttribute('y1', yy); line.setAttribute('y2', yy);
        line.setAttribute('stroke', '#22314f'); line.setAttribute('stroke-width', 1);
        line.setAttribute('stroke-dasharray', '3 4');
        svg.appendChild(line);

        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', PAD_L - 8); tx.setAttribute('y', yy + 4);
        tx.setAttribute('fill', '#94a3b8'); tx.setAttribute('font-size', 11);
        tx.setAttribute('text-anchor', 'end');
        tx.textContent = fmt(yv, 0);
        svg.appendChild(tx);
    }

    // band area (upper ~ lower)
    let bandD = '';
    upV.forEach((v, i) => { if (v == null) return; bandD += (bandD ? 'L' : 'M') + xScale(i) + ',' + yScale(v) + ' '; });
    for (let i = loV.length - 1; i >= 0; i--) {
        if (loV[i] == null) continue;
        bandD += 'L' + xScale(i) + ',' + yScale(loV[i]) + ' ';
    }
    bandD += 'Z';
    const band = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    band.setAttribute('d', bandD);
    band.setAttribute('fill', 'rgba(167,139,250,0.15)');
    band.setAttribute('stroke', 'none');
    svg.appendChild(band);

    // upper / lower stroke
    const strokeLine = (arr, color, dash) => {
        let d = '';
        arr.forEach((v, i) => { if (v == null) return; d += (d ? 'L' : 'M') + xScale(i) + ',' + yScale(v) + ' '; });
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d); p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color); p.setAttribute('stroke-width', 1.2);
        if (dash) p.setAttribute('stroke-dasharray', dash);
        svg.appendChild(p);
    };
    strokeLine(upV, '#a78bfa', '5 4');
    strokeLine(loV, '#a78bfa', '5 4');

    // MA20 line
    strokeLine(maV, '#38bdf8');

    // price line
    let priceD = '';
    view.forEach((v, i) => { priceD += (i === 0 ? 'M' : 'L') + xScale(i) + ',' + yScale(v) + ' '; });
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', priceD); p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#f8fafc'); p.setAttribute('stroke-width', 2);
    p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);

    // x labels (每 15 天一個)
    const xLabels = ['-60d', '-45d', '-30d', '-15d', '今日'];
    xLabels.forEach((label, i) => {
        const xi = Math.round((i / (xLabels.length - 1)) * (n - 1));
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', xScale(xi)); tx.setAttribute('y', H - 10);
        tx.setAttribute('fill', '#94a3b8'); tx.setAttribute('font-size', 11);
        tx.setAttribute('text-anchor', 'middle');
        tx.textContent = label;
        svg.appendChild(tx);
    });
}

/* -------- 6. 河流圖（本益比佔比） -------- */
function drawRiverChart() {
    const svg = document.getElementById('river-chart');
    const W = 620, H = 320;
    const PAD_L = 40, PAD_R = 12, PAD_T = 18, PAD_B = 30;
    svg.innerHTML = '';

    // 生成 60 天的四個桶佔比（隨時間有些漂移）
    const rng = mulberry32(99);
    const N = 60;
    const rows = [];
    let base = [0.18, 0.35, 0.28, 0.19];
    for (let i = 0; i < N; i++) {
        const noise = [
            (rng() - 0.5) * 0.02,
            (rng() - 0.5) * 0.02,
            (rng() - 0.5) * 0.02,
            (rng() - 0.5) * 0.02,
        ];
        base = base.map((v, k) => Math.max(0.03, v + noise[k]));
        // 溫和漂移：長期讓高 PE 略微上升
        base[3] += 0.0006;
        base[0] -= 0.0004;
        const sum = base.reduce((a, b) => a + b, 0);
        rows.push(base.map(v => v / sum));
    }

    const colors = ['#93c5fd', '#34d399', '#fbbf24', '#f87171'];
    const n = rows.length;
    const xScale = i => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
    const yScale = v => PAD_T + (1 - v) * (H - PAD_T - PAD_B);

    // grid 0/25/50/75/100%
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        const yy = yScale(v);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', PAD_L); line.setAttribute('x2', W - PAD_R);
        line.setAttribute('y1', yy); line.setAttribute('y2', yy);
        line.setAttribute('stroke', '#22314f'); line.setAttribute('stroke-width', 1);
        line.setAttribute('stroke-dasharray', '3 4');
        svg.appendChild(line);
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', PAD_L - 6); tx.setAttribute('y', yy + 4);
        tx.setAttribute('fill', '#94a3b8'); tx.setAttribute('font-size', 11);
        tx.setAttribute('text-anchor', 'end');
        tx.textContent = (v * 100) + '%';
        svg.appendChild(tx);
    });

    // 堆疊面積：由底往上
    for (let k = 0; k < 4; k++) {
        let d = '';
        // 上緣
        for (let i = 0; i < n; i++) {
            let upper = 0;
            for (let j = 0; j <= k; j++) upper += rows[i][j];
            d += (i === 0 ? 'M' : 'L') + xScale(i) + ',' + yScale(upper) + ' ';
        }
        // 下緣（往回畫）
        for (let i = n - 1; i >= 0; i--) {
            let lower = 0;
            for (let j = 0; j < k; j++) lower += rows[i][j];
            d += 'L' + xScale(i) + ',' + yScale(lower) + ' ';
        }
        d += 'Z';
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d); p.setAttribute('fill', colors[k]);
        p.setAttribute('opacity', 0.85);
        svg.appendChild(p);
    }

    // x labels
    ['2 個月前', '1.5 個月前', '1 個月前', '2 週前', '今日'].forEach((label, i, a) => {
        const xi = Math.round((i / (a.length - 1)) * (n - 1));
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', xScale(xi)); tx.setAttribute('y', H - 10);
        tx.setAttribute('fill', '#94a3b8'); tx.setAttribute('font-size', 11);
        tx.setAttribute('text-anchor', 'middle');
        tx.textContent = label;
        svg.appendChild(tx);
    });
}

/* -------- 7. 啟動 -------- */
document.addEventListener('DOMContentLoaded', () => {
    fillOverview();
    fillSparklineTable();
    drawBollinger();
    drawRiverChart();
});
