(function () {
    'use strict';

    // ---------- Config ----------
    const TICKER = 'GOOGL';
    const START_DATE = '2023-01-01';
    const CHECKPOINTS = [
        { label: '+ 1 個月', addDays: 30 },
        { label: '+ 6 個月', addDays: 180 },
        { label: '+ 1 年', addDays: 365 },
        { label: '至今', addDays: null },   // 最後一筆
    ];

    // GOOGL 2023-01-01 至今的重大事件（用來標記圖表 + 事後複盤）
    // 日期是 YYYY-MM-DD · impact = 對 GOOGL 論點的正/負面
    const EVENTS = [
        { date: '2023-01-20', label: 'Alphabet 裁員 12,000 人', kind: 'ambig',
          desc: '成本結構調整 · 對成本有利、但也反映廣告景氣壓力' },
        { date: '2023-02-06', label: 'Bard 首次公開示範失誤', kind: 'neg',
          desc: 'Bard 給錯答案 · 股價當日 -8% · 「Google 輸給 OpenAI」敘事高潮' },
        { date: '2023-05-10', label: 'Google I/O 全面 AI 化', kind: 'pos',
          desc: 'PaLM 2、Bard 全球開放、Search Generative Experience · Google 反擊姿態' },
        { date: '2023-12-06', label: 'Gemini 1.0 發表', kind: 'pos',
          desc: '多模態旗艦模型 · 部分基準超越 GPT-4 · 股價正面反應' },
        { date: '2024-04-25', label: 'Q1 2024 財報 + 首次股息', kind: 'pos',
          desc: '雲端 +28% · 廣告 +13% · 首次派息 + $70B 買回 · 股價 +10%' },
        { date: '2024-05-14', label: 'Google I/O · AI Overviews', kind: 'pos',
          desc: 'Gemini 1.5 Pro · Search AI 大改 · 展現「不是輸家」' },
        { date: '2024-08-05', label: 'DOJ 反壟斷裁定違法', kind: 'neg',
          desc: '美國聯邦法官裁定 Google 搜尋壟斷違法 · 分拆風險升溫 · 但股價短期反彈' },
        { date: '2024-11-20', label: 'DOJ 提議分拆 Chrome', kind: 'neg',
          desc: '司法部提議強制分拆 Chrome · 若成真影響巨大 · 但需上訴多年才定案' },
        { date: '2025-02-04', label: 'Q4 2024 財報 · Cloud 略 miss', kind: 'ambig',
          desc: 'Cloud 30% 成長略低於預期 · CapEx guidance $75B（+40%）驚人' },
        { date: '2025-04-24', label: 'Q1 2025 財報大超預期', kind: 'pos',
          desc: '廣告 + Cloud 都超預期 · CapEx 上修至 $75B · 股價 +6%' },
        { date: '2026-02-15', label: 'Waymo $16B 融資（大部分 Alphabet 出）', kind: 'pos',
          desc: '這輪融資把 Waymo 估值大幅推高 · 後續 Q1 2026 認列 $36.9B 未實現利益' },
        { date: '2026-04-30', label: 'Q1 2026 淨利爆表 · 主要來自 Waymo 認列', kind: 'ambig',
          desc: '淨利 +81% YoY · 但 $36.9B 是非現金公允價值 · 核心 YoY +26.4%（不像表面數字）' },
    ];

    // ---------- helpers ----------
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const fmtPct = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%';
    const fmtMoney = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

    // CORS proxies for Yahoo（跟 valuation/simulator.js 同一組）
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url=',
    ];

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

    // Yahoo v8 chart · 抓 2018-2026 完整歷史（提前 5 年給 valuation 用）
    async function fetchYahooHistory(ticker) {
        const now = Math.floor(Date.now() / 1000);
        const start = Math.floor(new Date('2018-01-01').getTime() / 1000);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${now}&interval=1d`;
        const data = await fetchViaProxy(url);
        if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) {
            throw new Error('Yahoo 回傳格式異常');
        }
        const r = data.chart.result[0];
        const ts = r.timestamp || [];
        const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
        return ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            price: closes[i],
        })).filter(p => p.price !== null && isFinite(p.price));
    }

    function findPriceOnOrAfter(prices, dateStr) {
        // 找 ≥ dateStr 的第一筆（週末 / 假日往後推）
        for (const p of prices) if (p.date >= dateStr) return p;
        return prices[prices.length - 1];
    }

    function addDaysStr(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function monthsBetween(startStr, endStr) {
        const s = new Date(startStr), e = new Date(endStr);
        return (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30);
    }

    // ---------- State ----------
    let priceSeries = null;   // 全部歷史（含未來 · 但 UI 只揭示已選日期後的部分）
    let startPrice = null;

    // ---------- Render: snapshot price ----------
    async function initSnapshot() {
        const el = $('sim-price-panel');
        try {
            priceSeries = await fetchYahooHistory(TICKER);
            const startEntry = findPriceOnOrAfter(priceSeries, START_DATE);
            startPrice = startEntry.price;
            el.innerHTML = `
                <div class="sim-price-tile">
                    <div class="sim-price-label">GOOGL 股價 @ ${startEntry.date}</div>
                    <div class="sim-price-val">${fmtMoney(startPrice)}</div>
                    <div class="sim-price-note">分割調整後 · Yahoo Finance</div>
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="sim-error">❌ 抓 Yahoo 失敗：${e.message}<br>可能是 CORS proxy 被 throttle · 重載試試</div>`;
        }
    }

    // ---------- Render: reveal ----------
    function renderReveal(positionPct) {
        if (!priceSeries || !startPrice) return;
        const startEntry = findPriceOnOrAfter(priceSeries, START_DATE);
        const startDate = startEntry.date;
        // Checkpoint prices
        const cpEls = CHECKPOINTS.map(cp => {
            const targetDate = cp.addDays !== null
                ? addDaysStr(startDate, cp.addDays)
                : priceSeries[priceSeries.length - 1].date;
            const entry = findPriceOnOrAfter(priceSeries, targetDate);
            const ret = (entry.price - startPrice) / startPrice;
            const returnAmt = 100000 * (positionPct / 100) * ret;   // 以 $100k 為基準的損益
            const cls = ret > 0 ? 'cp-pos' : 'cp-neg';
            return `
                <div class="cp-card ${cls}">
                    <div class="cp-label">${cp.label}</div>
                    <div class="cp-date">${entry.date}</div>
                    <div class="cp-price">${fmtMoney(entry.price)}</div>
                    <div class="cp-return">${fmtPct(ret)}</div>
                    <div class="cp-note">若投 $100k × ${positionPct}%：${ret >= 0 ? '+' : ''}${fmtMoney(returnAmt)}</div>
                </div>
            `;
        }).join('');
        $('reveal-checkpoints').innerHTML = cpEls;

        // Draw price chart with event markers
        drawSimChart(priceSeries, startDate);
        $('reveal-panel').hidden = false;

        renderPostmortem(positionPct);
    }

    function drawSimChart(prices, startDate) {
        const canvas = $('sim-price-chart');
        if (!canvas) return;
        // 只畫 startDate 之後
        const data = prices.filter(p => p.date >= startDate);
        if (data.length === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const padL = 55, padR = 20, padT = 20, padB = 40;
        const chartW = w - padL - padR;
        const chartH = h - padT - padB;

        const prices2 = data.map(d => d.price);
        const minP = Math.min(...prices2);
        const maxP = Math.max(...prices2);
        const range = maxP - minP;
        const yPad = range * 0.05;

        const xFor = i => padL + (i / (data.length - 1)) * chartW;
        const yFor = p => padT + chartH - ((p - (minP - yPad)) / (range + 2 * yPad)) * chartH;

        // Grid
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#6b7280';
        for (let f = 0; f <= 4; f++) {
            const y = padT + (f / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + chartW, y);
            ctx.stroke();
            const val = maxP + yPad - (f / 4) * (range + 2 * yPad);
            ctx.textAlign = 'right';
            ctx.fillText('$' + val.toFixed(0), padL - 4, y + 4);
        }

        // Price line
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, i) => {
            const x = xFor(i);
            const y = yFor(d.price);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Event markers
        const dateToIdx = new Map(data.map((d, i) => [d.date, i]));
        EVENTS.forEach((ev, idx) => {
            // Find nearest index
            let entryIdx = null;
            for (let i = 0; i < data.length; i++) {
                if (data[i].date >= ev.date) { entryIdx = i; break; }
            }
            if (entryIdx === null) return;
            const x = xFor(entryIdx);
            const y = yFor(data[entryIdx].price);
            const color = ev.kind === 'pos' ? '#059669' : ev.kind === 'neg' ? '#dc2626' : '#d97706';
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            // Number label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(idx + 1), x, y);
        });

        // X-axis date labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        [0, 0.25, 0.5, 0.75, 1].forEach(f => {
            const i = Math.floor(f * (data.length - 1));
            ctx.fillText(data[i].date, xFor(i), padT + chartH + 14);
        });

        // Legend
        const legendHtml = EVENTS.map((ev, idx) => {
            const cls = ev.kind === 'pos' ? 'ev-pos' : ev.kind === 'neg' ? 'ev-neg' : 'ev-ambig';
            return `<div class="ev-item ${cls}"><b>${idx + 1}. ${ev.date}</b> · ${ev.label}<br><small>${ev.desc}</small></div>`;
        }).join('');
        $('sim-chart-legend').innerHTML = legendHtml;
    }

    // ---------- Postmortem ----------
    function renderPostmortem(positionPct) {
        if (!priceSeries || !startPrice) return;
        const startEntry = findPriceOnOrAfter(priceSeries, START_DATE);
        const startDate = startEntry.date;
        const endEntry = priceSeries[priceSeries.length - 1];
        const totalRet = (endEntry.price - startPrice) / startPrice;
        const months = monthsBetween(startDate, endEntry.date);
        const annualized = Math.pow(1 + totalRet, 12 / months) - 1;

        // Position counterfactuals
        const base = 100000;
        const yourGain = base * (positionPct / 100) * totalRet;
        const fullGain = base * totalRet;
        const halfGain = base * 0.5 * totalRet;
        const gapVs100 = fullGain - yourGain;
        const gapVs50 = halfGain - yourGain;

        // Falsify condition check
        const falsifyChecks = document.querySelectorAll('#sim-falsify-list input');
        const checkedCount = Array.from(falsifyChecks).filter(c => c.checked).length;

        // Compute max drawdown during period
        const period = priceSeries.filter(p => p.date >= startDate);
        let peak = -Infinity, maxDD = 0;
        for (const p of period) {
            if (p.price > peak) peak = p.price;
            const dd = (peak - p.price) / peak;
            if (dd > maxDD) maxDD = dd;
        }

        // vs S&P 500?（跳過 · 需要另抓 SPY）· MVP 只 GOOGL
        const thesis = $('sim-thesis').value.trim() || '（沒填論點）';

        const body = $('postmortem-body');
        body.innerHTML = `
            <div class="pm-section">
                <h3>📊 你的實際結果</h3>
                <table class="pm-table">
                    <tr><th>投入比例</th><td>${positionPct}%</td></tr>
                    <tr><th>期間報酬</th><td class="${totalRet > 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtPct(totalRet)}</b>（${startDate} → ${endEntry.date}）</td></tr>
                    <tr><th>年化報酬</th><td class="${annualized > 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtPct(annualized)}</b></td></tr>
                    <tr><th>期間最大回撤</th><td class="pm-neg">-${fmtPct(maxDD)}</td></tr>
                    <tr><th>$100k 基準損益</th><td class="${yourGain > 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtMoney(yourGain)}</b></td></tr>
                </table>
            </div>

            <div class="pm-section">
                <h3>🎲 部位大小的反事實 · 「若我投 X% 會賺多少？」</h3>
                <table class="pm-table">
                    <tr><th>你選 ${positionPct}%</th><td class="${yourGain > 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(yourGain)}</td></tr>
                    <tr><th>如果 50%</th><td class="${halfGain > 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(halfGain)} <small>（差 ${halfGain > yourGain ? '+' : ''}${fmtMoney(gapVs50)}）</small></td></tr>
                    <tr><th>如果 100% All-in</th><td class="${fullGain > 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(fullGain)} <small>（差 ${fullGain > yourGain ? '+' : ''}${fmtMoney(gapVs100)}）</small></td></tr>
                </table>
                <p class="hint hint-mini">
                    ${totalRet > 0
                        ? `📌 <b>「後見之明」教訓</b>：這段期間 GOOGL 漲了 ${fmtPct(totalRet)} · 你 ${positionPct}% 賺 ${fmtMoney(yourGain)}、100% 會賺 ${fmtMoney(fullGain)}。<b>但這是事後知道結果</b>——當時你若 All-in、遇到期間最大回撤 -${fmtPct(maxDD)}<b>你能不能撐過去</b>是另一回事。凱利公式的核心：<b>部位大小要跟你能承受的回撤配對</b>，不是跟事後最大報酬配對。`
                        : `📌 <b>教訓</b>：這段期間 GOOGL 是負報酬 · ${positionPct}% 的部位讓你只損失 ${fmtMoney(yourGain)} · 若 All-in 損失 ${fmtMoney(fullGain)}。<b>部位小 = 你活到下一輪判斷的機會</b>。`
                    }
                </p>
            </div>

            <div class="pm-section">
                <h3>🛡 你的證偽條件回顧</h3>
                <p class="hint">你勾了 ${checkedCount}/${falsifyChecks.length} 條 · 期間內以下事件<b>可能觸發</b>你的條件：</p>
                <ul class="pm-events">
                    <li>📅 <b>2024-08-05</b> DOJ 反壟斷裁定違法 → 若你有勾「DOJ 分拆搜尋」那條 · 你會不會賣？<b>當時股價其實反彈</b>——市場覺得上訴多年·裁決可能被推翻。你的判斷 vs 市場的判斷、誰對？</li>
                    <li>📅 <b>2024-11 - 2025-01</b> Cloud 30% 成長低於預期 → 若你勾「營收 YoY 轉負」那條 · 這裡沒觸發（仍成長）· 但成長減速值不值得警訊？</li>
                    <li>📅 <b>2026-04</b> Q1 2026 淨利爆表但主要來自 Waymo 認列 → 若這是你的證偽條件之一，你會不會發現「表面 +81% 但核心 +26%」的差異？</li>
                </ul>
                <p class="hint hint-mini">💡 <b>證偽條件的價值不在事前訂多完美 · 是事後回頭看「當時該不該重新檢視」有沒有結構化的判斷依據</b>。若你沒有預先設條件，看到 DOJ 裁決會慌賣或不動全憑情緒；有預設 → 至少有明確的決策 protocol。</p>
            </div>

            <div class="pm-section">
                <h3>💡 事件時間軸的隱含教訓</h3>
                <ul class="pm-lessons">
                    <li><b>「Google 被 ChatGPT 幹掉」是 2023 年最大的錯誤敘事</b>——Gemini 1.0、AI Overviews、DeepMind 整合證明 Google 有能力反擊 · 但當時所有人（包括很多分析師）都相信這個敘事。你的 2023-01-01 決策時，如果對這個敘事的信心度是 100%，你可能不會投；50-50 才可能。<b>訓練意義：對主流敘事保持懷疑機率 30-40%，而不是 0% 或 100%</b>。</li>
                    <li><b>DOJ 反壟斷裁決 2024-08 是股價短暫回落但長期反彈</b>——市場定價「上訴多年 + 分拆執行難度高」· 但這個判斷不是 100% 對·若最終真分拆你會很慘。<b>訓練意義：政治/監管風險難定價、需要留部位而不是 All-in</b>。</li>
                    <li><b>Q1 2026 淨利 +81% 表面數字誤導人</b>——若你的框架沒抓到 Waymo 未實現利益 · 你會以為 GOOGL 成長爆發 · 加碼。事後查 10-Q 才知道核心 +26%。<b>訓練意義：分辨「表面 vs 核心」是 Layer 2 品質判讀最有價值的功課</b>。</li>
                </ul>
            </div>

            <div class="pm-section">
                <h3>📝 你當初的論點回顧</h3>
                <p class="hint pm-thesis-quote">「${thesis}」</p>
                <p class="hint hint-mini">若你現在（2026-07 · 全知視角）給當時的你反饋，你會怎麼修改這個論點？<b>把差異寫下來 · 這是最有價值的訓練產出</b>——事後看有哪些 signal 你當時應該注意但沒注意到。</p>
            </div>

            <div class="pm-section">
                <h3>🎯 下一步（延伸）</h3>
                <ul class="pm-lessons">
                    <li>換一個時間點試試（例：2024-08-06 · DOJ 裁決隔天 · 恐慌期）——你當下的判斷會不會不一樣？</li>
                    <li>換另一支股票（AMD、NVDA）——AI 熱潮期的判斷跟 GOOGL 這種既有龍頭反擊型完全不同的訓練情境。</li>
                    <li>把「事後的自己」寫的完美版論點跟「當初的自己」的論點做 diff——找到判斷力進步的具體方向。</li>
                </ul>
            </div>
        `;
        $('postmortem-panel').hidden = false;
    }

    // ---------- Handlers ----------
    function initHandlers() {
        const pos = $('sim-pos');
        const posVal = $('sim-pos-val');
        pos.addEventListener('input', () => {
            posVal.textContent = pos.value + '%';
        });
        $('btn-run-sim').addEventListener('click', () => {
            renderReveal(parseInt(pos.value) || 20);
            $('reveal-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // ---------- Init ----------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSnapshot();
            initHandlers();
        });
    } else {
        initSnapshot();
        initHandlers();
    }
})();
