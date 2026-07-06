(function () {
    'use strict';

    // ---------- Config ----------
    const TICKER = 'GOOGL';
    const START_DATE = '2023-01-01';
    const BASE_CAPITAL = 100000;

    // 12 個 GOOGL 事件 + 1 個「至今」節點 = 13 關
    const EVENTS = [
        { date: '2023-01-20', label: 'Alphabet 裁員 12,000 人', kind: 'ambig',
          desc: '成本結構調整 · 對成本有利、但也反映廣告景氣壓力',
          hint: '💭 你會怎麼判讀？裁員可能是「削減冗員→提升利潤率」，但也可能是「主管認錯：過去兩年擴太快」。' },
        { date: '2023-02-06', label: 'Bard 首次公開示範失誤', kind: 'neg',
          desc: 'Bard 給錯答案 · 股價當日 -8% · 「Google 輸給 OpenAI」敘事高潮',
          hint: '💭 恐慌情境：ChatGPT 統治 · Google 搜尋被顛覆 · 這是不是進場點或該逃？' },
        { date: '2023-05-10', label: 'Google I/O 全面 AI 化', kind: 'pos',
          desc: 'PaLM 2、Bard 全球開放、Search Generative Experience · Google 反擊姿態',
          hint: '💭 3 個月前才崩跌 8% · 現在展示反擊 · 你相信這是真反擊還是公關秀？' },
        { date: '2023-12-06', label: 'Gemini 1.0 發表', kind: 'pos',
          desc: '多模態旗艦模型 · 部分基準超越 GPT-4 · 股價正面反應',
          hint: '💭 Google 展示技術實力 · 但市占率能不能追回 OpenAI 是另一回事。' },
        { date: '2024-04-25', label: 'Q1 2024 財報 + 首次股息', kind: 'pos',
          desc: '雲端 +28% · 廣告 +13% · 首次派息 + $70B 買回 · 股價 +10%',
          hint: '💭 派息意味成熟股 · 但也可能是「成長題材沒了」訊號 · 你怎麼看？' },
        { date: '2024-05-14', label: 'Google I/O · AI Overviews', kind: 'pos',
          desc: 'Gemini 1.5 Pro · Search AI 大改 · 展現「不是輸家」',
          hint: '💭 AI Overviews 會不會反噬廣告點擊率？短期看不出來、長期是關鍵。' },
        { date: '2024-08-05', label: 'DOJ 反壟斷裁定違法', kind: 'neg',
          desc: '美國聯邦法官裁定 Google 搜尋壟斷違法 · 分拆風險升溫 · 但股價短期反彈',
          hint: '💭 恐慌關卡：分拆傳言 vs 上訴多年才定案。你會停損、觀望還是加碼？' },
        { date: '2024-11-20', label: 'DOJ 提議分拆 Chrome', kind: 'neg',
          desc: '司法部提議強制分拆 Chrome · 若成真影響巨大 · 但需上訴多年才定案',
          hint: '💭 情境重複：分拆 Chrome 比賣搜尋更痛 · 但一樣需多年才定案 · 你的定價會不會變？' },
        { date: '2025-02-04', label: 'Q4 2024 財報 · Cloud 略 miss', kind: 'ambig',
          desc: 'Cloud 30% 成長略低於預期 · CapEx guidance $75B（+40%）驚人',
          hint: '💭 CapEx 上修 40% · 是「投資未來 AI」還是「利潤率崩掉」的前兆？' },
        { date: '2025-04-24', label: 'Q1 2025 財報大超預期', kind: 'pos',
          desc: '廣告 + Cloud 都超預期 · CapEx 上修至 $75B · 股價 +6%',
          hint: '💭 一切都好 · 通常「都很順」時你要問「還有什麼沒發生？」——分拆案還沒結。' },
        { date: '2026-02-15', label: 'Waymo $16B 融資（大部分 Alphabet 出）', kind: 'pos',
          desc: '這輪融資把 Waymo 估值大幅推高 · 後續 Q1 2026 認列 $36.9B 未實現利益',
          hint: '💭 Waymo 估值上修 · 這是實質價值還是紙上富貴？' },
        { date: '2026-04-30', label: 'Q1 2026 淨利爆表 · 主要來自 Waymo 認列', kind: 'ambig',
          desc: '淨利 +81% YoY · 但 $36.9B 是非現金公允價值 · 核心 YoY +26.4%（不像表面數字）',
          hint: '💭 表面 +81% vs 核心 +26% · 你會 FOMO 加碼還是認出這是「一次性認列」？' },
        // 第 13 關 · 現況檢視（無事件、只揭示現價）
        { date: '2026-07-06', label: '至今 · 現況檢視', kind: 'ambig',
          desc: '所有事件都揭曉 · 這是你最後的決策點：現在你想抱到什麼比例？',
          hint: '💭 全部事件結束 · 你回頭看整段旅程 · 這次的判斷是最後檢驗你「事後學到什麼」的機會。',
          isFinal: true },
    ];

    // ---------- helpers ----------
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const fmtPct = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%';
    const fmtMoney = n => {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        const neg = n < 0;
        return (neg ? '-$' : '$') + Math.abs(Number(n)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

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

    async function fetchYahooHistory(ticker) {
        const now = Math.floor(Date.now() / 1000);
        const start = Math.floor(new Date('2022-06-01').getTime() / 1000);
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
        for (const p of prices) if (p.date >= dateStr) return p;
        return prices[prices.length - 1];
    }

    // ---------- Game State ----------
    let priceSeries = null;
    const game = {
        base: BASE_CAPITAL,
        startDate: null,
        startPrice: null,
        cash: BASE_CAPITAL,
        shares: 0,
        currentEventIdx: 0,       // 0-based index into EVENTS
        currentDate: null,
        currentPrice: null,
        prevPrice: null,          // 上個事件的股價（給漲跌對比）
        decisions: [],            // {date, event, price, oldPct, newPct, totalValue, cash, shares, action}
        initialPct: 20,
    };

    function currentTotalValue() {
        return game.cash + game.shares * game.currentPrice;
    }

    function currentPositionPct() {
        const total = currentTotalValue();
        if (total <= 0) return 0;
        return (game.shares * game.currentPrice) / total * 100;
    }

    // 執行「rebalance 到 targetPct」· 用當前價格買賣
    // 回傳 {action, deltaShares, deltaCash}
    function rebalanceToTargetPct(targetPct) {
        const total = currentTotalValue();
        const targetStockValue = total * (targetPct / 100);
        const targetShares = targetStockValue / game.currentPrice;
        const deltaShares = targetShares - game.shares;
        const deltaCash = -deltaShares * game.currentPrice;

        game.shares = targetShares;
        game.cash += deltaCash;

        let action = '持平';
        if (deltaShares > 0.001) action = `買 ${deltaShares.toFixed(1)} 股（$${Math.abs(deltaCash).toLocaleString(undefined, {maximumFractionDigits: 0})}）`;
        else if (deltaShares < -0.001) action = `賣 ${Math.abs(deltaShares).toFixed(1)} 股（回收 $${Math.abs(deltaCash).toLocaleString(undefined, {maximumFractionDigits: 0})}）`;

        return { action, deltaShares, deltaCash };
    }

    // ---------- Snapshot (phase 1) ----------
    async function initSnapshot() {
        const el = $('sim-price-panel');
        try {
            priceSeries = await fetchYahooHistory(TICKER);
            const startEntry = findPriceOnOrAfter(priceSeries, START_DATE);
            game.startDate = startEntry.date;
            game.startPrice = startEntry.price;
            el.innerHTML = `
                <div class="sim-price-tile">
                    <div class="sim-price-label">GOOGL 股價 @ ${startEntry.date}</div>
                    <div class="sim-price-val">${fmtMoney(startEntry.price)}</div>
                    <div class="sim-price-note">分割調整後 · Yahoo Finance</div>
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="sim-error">❌ 抓 Yahoo 失敗：${e.message}<br>可能是 CORS proxy 被 throttle · 重載試試</div>`;
        }
    }

    // ---------- Start game (phase 2 → 3) ----------
    function startGame(initialPct) {
        if (!priceSeries || !game.startPrice) return;
        game.initialPct = initialPct;

        // 初始建倉：以 start 價格買 initialPct% 的股票
        const stockValue = game.base * (initialPct / 100);
        game.shares = stockValue / game.startPrice;
        game.cash = game.base - stockValue;
        game.currentDate = game.startDate;
        game.currentPrice = game.startPrice;
        game.prevPrice = null;
        game.currentEventIdx = 0;
        game.decisions = [];

        // 紀錄「起始建倉」為第 0 筆決策
        game.decisions.push({
            date: game.startDate,
            event: `🎬 起始建倉 · ${initialPct}%`,
            price: game.startPrice,
            oldPct: 0,
            newPct: initialPct,
            totalValue: currentTotalValue(),
            action: `買入 ${game.shares.toFixed(1)} 股 · 剩餘現金 ${fmtMoney(game.cash)}`,
        });

        // 收起 setup panels · 打開 game panel
        $('snapshot-panel').hidden = true;
        $('decision-sim-panel').hidden = true;
        $('game-panel').hidden = false;

        // 進入第一個事件
        advanceToEvent(0);
    }

    function advanceToEvent(idx) {
        if (idx >= EVENTS.length) {
            endGame();
            return;
        }
        const ev = EVENTS[idx];
        game.currentEventIdx = idx;
        game.prevPrice = game.currentPrice;
        const entry = findPriceOnOrAfter(priceSeries, ev.date);
        game.currentDate = entry.date;
        game.currentPrice = entry.price;

        renderGameStep(ev);
    }

    function renderGameStep(ev) {
        // Progress
        const totalSteps = EVENTS.length;
        const stepNum = game.currentEventIdx + 1;
        $('game-step').textContent = stepNum;
        $('game-title').innerHTML = `🎮 事件 <span id="game-step">${stepNum}</span> / ${totalSteps}`;
        $('game-progress-bar').style.width = `${(stepNum / totalSteps) * 100}%`;

        // Event card
        const kindLabel = ev.kind === 'pos' ? '📈 看多' : ev.kind === 'neg' ? '📉 看空' : '⚖ 曖昧';
        const kindClass = ev.kind === 'pos' ? 'ev-pos' : ev.kind === 'neg' ? 'ev-neg' : 'ev-ambig';
        const priceDelta = game.prevPrice
            ? (game.currentPrice - game.prevPrice) / game.prevPrice
            : (game.currentPrice - game.startPrice) / game.startPrice;
        const priceDeltaLabel = game.prevPrice ? '距上個事件' : '距起始';
        const priceDeltaCls = priceDelta >= 0 ? 'delta-pos' : 'delta-neg';
        const priceDeltaTxt = (priceDelta >= 0 ? '+' : '') + fmtPct(priceDelta);

        $('event-card').innerHTML = `
            <div class="event-header ${kindClass}">
                <div class="event-date">📅 ${ev.date}</div>
                <div class="event-kind">${kindLabel}</div>
            </div>
            <div class="event-title">${ev.label}</div>
            <div class="event-desc">${ev.desc}</div>
            <div class="event-price-row">
                <div class="event-price-cell">
                    <div class="event-price-label">當時 GOOGL 股價</div>
                    <div class="event-price-val">${fmtMoney(game.currentPrice)}</div>
                    <div class="event-price-delta ${priceDeltaCls}">${priceDeltaLabel} ${priceDeltaTxt}</div>
                </div>
                <div class="event-hint">${ev.hint || ''}</div>
            </div>
        `;

        // Portfolio state
        const total = currentTotalValue();
        const stockValue = game.shares * game.currentPrice;
        const posPct = currentPositionPct();
        const totalRet = (total - game.base) / game.base;
        const totalRetCls = totalRet >= 0 ? 'delta-pos' : 'delta-neg';
        const startStockValue = game.shares * game.startPrice;
        const unrealizedPL = game.shares > 0 ? (game.currentPrice - game.startPrice) * game.shares : 0;

        $('portfolio-state').innerHTML = `
            <div class="pf-grid">
                <div class="pf-cell">
                    <div class="pf-label">💵 現金</div>
                    <div class="pf-val">${fmtMoney(game.cash)}</div>
                </div>
                <div class="pf-cell">
                    <div class="pf-label">📈 GOOGL 股票</div>
                    <div class="pf-val">${fmtMoney(stockValue)}</div>
                    <div class="pf-sub">${game.shares.toFixed(1)} 股 × ${fmtMoney(game.currentPrice)}</div>
                </div>
                <div class="pf-cell pf-total">
                    <div class="pf-label">💼 總資產</div>
                    <div class="pf-val">${fmtMoney(total)}</div>
                    <div class="pf-sub ${totalRetCls}">${totalRet >= 0 ? '+' : ''}${fmtPct(totalRet)} vs $100k 起始</div>
                </div>
                <div class="pf-cell">
                    <div class="pf-label">📊 目前部位</div>
                    <div class="pf-val">${posPct.toFixed(0)}%</div>
                    <div class="pf-sub">股票 / 總資產</div>
                </div>
            </div>
        `;

        // Live decision panel · reset target slider to current position
        const posInt = Math.round(posPct / 5) * 5;
        $('pos-current-val').textContent = `${posPct.toFixed(0)}%`;
        $('pos-target').value = posInt;
        $('pos-target-val').textContent = `${posInt}%`;
        updateDeltaPreview();

        // Log
        renderDecisionLog();
    }

    // slider step 是 5% · 半個 step (2.5pp) 內視為「持平」· 避免市值漂移造成的假減碼
    const HOLD_THRESHOLD_PP = 2.5;

    function updateDeltaPreview() {
        const targetPct = parseInt($('pos-target').value) || 0;
        const currentPct = currentPositionPct();
        const delta = targetPct - currentPct;
        const total = currentTotalValue();
        const targetStockValue = total * (targetPct / 100);
        const currentStockValue = game.shares * game.currentPrice;
        const deltaValue = targetStockValue - currentStockValue;

        const isHold = Math.abs(delta) <= HOLD_THRESHOLD_PP + 1e-6;

        let msg;
        let cls;
        let btnLabel;
        if (isHold) {
            msg = `✋ 維持現有 ${game.shares.toFixed(1)} 股 · 不做任何買賣（目前部位 ${currentPct.toFixed(1)}%）`;
            cls = 'preview-hold';
            btnLabel = `✋ 維持現有 ${game.shares.toFixed(0)} 股 · 進到下一個事件`;
        } else if (delta > 0) {
            const deltaShares = deltaValue / game.currentPrice;
            msg = `📈 加碼 ${delta.toFixed(0)} pp · 買 ${deltaShares.toFixed(1)} 股（${fmtMoney(deltaValue)} · 用現金 ${fmtMoney(game.cash)} 的 ${(deltaValue / game.cash * 100).toFixed(0)}%）`;
            cls = 'preview-buy';
            btnLabel = `📈 加碼 ${delta.toFixed(0)} pp · 進到下一個事件`;
            if (deltaValue > game.cash + 0.5) {
                msg = `⚠ 現金不夠 · 你只有 ${fmtMoney(game.cash)} · 最多加到 ${((game.cash + currentStockValue) / total * 100).toFixed(0)}%（會用光現金）`;
                cls = 'preview-warn';
                btnLabel = `⚠ 現金上限 · 進到下一個事件`;
            }
        } else {
            const deltaShares = Math.abs(deltaValue) / game.currentPrice;
            msg = `📉 減碼 ${Math.abs(delta).toFixed(0)} pp · 賣 ${deltaShares.toFixed(1)} 股（回收 ${fmtMoney(Math.abs(deltaValue))}）`;
            cls = 'preview-sell';
            btnLabel = `📉 減碼 ${Math.abs(delta).toFixed(0)} pp · 進到下一個事件`;
        }
        const el = $('pos-delta-preview');
        el.className = `pos-delta-preview ${cls}`;
        el.textContent = msg;

        const btn = $('btn-confirm-decision');
        if (btn) {
            btn.textContent = btnLabel;
            btn.className = isHold ? 'btn-hold' : (delta > 0 ? 'btn-buy' : 'btn-sell');
        }
    }

    function renderDecisionLog() {
        const tbl = $('decision-log-table');
        // Header row
        tbl.innerHTML = `<tr><th>日期</th><th>事件</th><th>股價</th><th>調整</th><th>總資產</th></tr>`;
        game.decisions.forEach(d => {
            const tr = document.createElement('tr');
            const delta = d.newPct - d.oldPct;
            const deltaTxt = Math.abs(delta) < 0.5 ? '✋ 持平' : (delta > 0 ? `📈 +${delta.toFixed(0)}pp` : `📉 ${delta.toFixed(0)}pp`);
            tr.innerHTML = `
                <td>${d.date}</td>
                <td>${d.event}</td>
                <td>${fmtMoney(d.price)}</td>
                <td>${d.oldPct.toFixed(0)}% → ${d.newPct.toFixed(0)}%<br><small>${deltaTxt}</small></td>
                <td>${fmtMoney(d.totalValue)}</td>
            `;
            tbl.appendChild(tr);
        });
    }

    function confirmDecision() {
        const targetPct = parseInt($('pos-target').value) || 0;
        const ev = EVENTS[game.currentEventIdx];
        const oldPct = currentPositionPct();

        let action;
        let logNewPct;

        if (Math.abs(targetPct - oldPct) <= HOLD_THRESHOLD_PP + 1e-6) {
            // 持平 · 完全不 rebalance · 避免市值漂移造成假買賣
            action = '✋ 持平 · 不做任何買賣';
            logNewPct = oldPct;
        } else {
            // Cap by available cash if buying
            const total = currentTotalValue();
            let cappedTargetPct = targetPct;
            const targetStockValue = total * (targetPct / 100);
            const currentStockValue = game.shares * game.currentPrice;
            if (targetStockValue > currentStockValue + game.cash + 0.01) {
                cappedTargetPct = ((currentStockValue + game.cash) / total) * 100;
            }
            const result = rebalanceToTargetPct(cappedTargetPct);
            action = result.action;
            logNewPct = cappedTargetPct;
        }

        game.decisions.push({
            date: ev.date,
            event: ev.label,
            price: game.currentPrice,
            oldPct: oldPct,
            newPct: logNewPct,
            totalValue: currentTotalValue(),
            action,
        });

        // Advance
        advanceToEvent(game.currentEventIdx + 1);

        // Scroll event card into view
        setTimeout(() => {
            const gp = $('game-panel');
            if (gp) gp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    // ---------- Postmortem (phase 4) ----------
    function endGame() {
        $('game-panel').hidden = true;
        $('postmortem-panel').hidden = false;
        renderPostmortem();
        setTimeout(() => {
            const pm = $('postmortem-panel');
            if (pm) pm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    function renderPostmortem() {
        const finalTotal = currentTotalValue();
        const totalRet = (finalTotal - game.base) / game.base;

        // Counterfactuals
        const endPrice = game.currentPrice;
        const buyHoldRet = (endPrice - game.startPrice) / game.startPrice;
        const buyHoldInitialFinal = game.base * (1 + buyHoldRet * (game.initialPct / 100));
        const buyHoldAllInFinal = game.base * (1 + buyHoldRet);
        const buyHoldHalfFinal = game.base * (1 + buyHoldRet * 0.5);

        // Trading stats
        const totalDecisions = game.decisions.length;
        const nonHoldDecisions = game.decisions.filter((d, i) => {
            if (i === 0) return false;   // initial buy not counted
            return Math.abs(d.newPct - d.oldPct) >= 0.5;
        }).length;

        // Max drawdown during game
        const startIdx = priceSeries.findIndex(p => p.date >= game.startDate);
        const endIdx = priceSeries.findIndex(p => p.date >= game.currentDate);
        const period = priceSeries.slice(startIdx, endIdx >= 0 ? endIdx + 1 : priceSeries.length);
        let peak = -Infinity, maxDD = 0;
        for (const p of period) {
            if (p.price > peak) peak = p.price;
            const dd = (peak - p.price) / peak;
            if (dd > maxDD) maxDD = dd;
        }

        // Regret analysis: 你 vs 起始 20% buy-and-hold
        const yourVsInitialHold = finalTotal - buyHoldInitialFinal;
        const yourVsAllIn = finalTotal - buyHoldAllInFinal;

        const decisionLogHtml = game.decisions.map((d, i) => {
            const delta = d.newPct - d.oldPct;
            const deltaCls = Math.abs(delta) < 0.5 ? 'pm-hold' : delta > 0 ? 'pm-buy' : 'pm-sell';
            const deltaTxt = Math.abs(delta) < 0.5 ? '✋ 持平' : delta > 0 ? `📈 加 ${delta.toFixed(0)}pp` : `📉 減 ${Math.abs(delta).toFixed(0)}pp`;
            return `
                <tr class="${deltaCls}">
                    <td>${i}</td>
                    <td>${d.date}</td>
                    <td>${d.event}</td>
                    <td>${fmtMoney(d.price)}</td>
                    <td>${d.oldPct.toFixed(0)}% → ${d.newPct.toFixed(0)}%<br><small>${deltaTxt}</small></td>
                    <td>${fmtMoney(d.totalValue)}</td>
                </tr>
            `;
        }).join('');

        $('postmortem-body').innerHTML = `
            <div class="pm-section">
                <h3>📊 你的最終結果</h3>
                <table class="pm-table">
                    <tr><th>起始資金</th><td>${fmtMoney(game.base)}</td></tr>
                    <tr><th>起始部位</th><td>${game.initialPct}%</td></tr>
                    <tr><th>期間</th><td>${game.startDate} → ${game.currentDate}</td></tr>
                    <tr><th>總決策次數</th><td>${totalDecisions}（其中 ${nonHoldDecisions} 次調整、${totalDecisions - nonHoldDecisions - 1} 次持平）</td></tr>
                    <tr><th>最終總資產</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtMoney(finalTotal)}</b></td></tr>
                    <tr><th>總報酬率</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${totalRet >= 0 ? '+' : ''}${fmtPct(totalRet)}</b></td></tr>
                    <tr><th>期間 GOOGL 最大回撤</th><td class="pm-neg">-${fmtPct(maxDD)}</td></tr>
                </table>
            </div>

            <div class="pm-section">
                <h3>🎲 反事實 · 「如果我不做調整會怎樣？」</h3>
                <table class="pm-table">
                    <tr><th>你的實際結果（${totalDecisions - 1} 次調整）</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtMoney(finalTotal)}</b></td></tr>
                    <tr><th>Buy & Hold ${game.initialPct}%（起始就買 · 之後全部持平）</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldInitialFinal)} <small>（差 ${yourVsInitialHold >= 0 ? '+' : ''}${fmtMoney(yourVsInitialHold)}）</small></td></tr>
                    <tr><th>Buy & Hold 50%</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldHalfFinal)}</td></tr>
                    <tr><th>Buy & Hold 100% All-in</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldAllInFinal)} <small>（差 ${yourVsAllIn >= 0 ? '+' : ''}${fmtMoney(yourVsAllIn)}）</small></td></tr>
                </table>
                <p class="hint hint-mini">
                    ${yourVsInitialHold >= 0
                        ? `📌 <b>你的主動調整加了 ${fmtMoney(yourVsInitialHold)} 價值</b>——比純持有 ${game.initialPct}% 好。<b>但要問：這是 skill 還是 luck？</b>要重複跑幾次、換股試試才知道。`
                        : `📌 <b>你的主動調整少賺 ${fmtMoney(Math.abs(yourVsInitialHold))}</b>——比純持有 ${game.initialPct}% 差。<b>典型症狀</b>：在恐慌事件（Bard 失誤、DOJ 裁決）減碼、之後市場反彈沒能追回。事後看：這段期間主動交易普遍打不過 buy-and-hold。`
                    }
                </p>
            </div>

            <div class="pm-section">
                <h3>📋 你的完整決策紀錄</h3>
                <table class="fund-table pm-decision-table">
                    <tr><th>#</th><th>日期</th><th>事件</th><th>股價</th><th>調整</th><th>總資產</th></tr>
                    ${decisionLogHtml}
                </table>
            </div>

            <div class="pm-section">
                <h3>💡 事件時間軸的隱含教訓</h3>
                <ul class="pm-lessons">
                    <li><b>2023-02 Bard 失誤 -8%</b>：如果你在那時減碼 · 事後 Google I/O + Gemini 反彈你就完美錯過。<b>訓練意義</b>：短期股價劇烈反應不代表基本面已崩、「敘事高潮」通常是好進場點。</li>
                    <li><b>2024-08 DOJ 反壟斷裁決</b>：市場短期反彈、長期難定案。<b>訓練意義</b>：政治/監管風險難定價、留部位（不 All-in、不清倉）通常最能維持理性。</li>
                    <li><b>2026-04 Q1 淨利 +81%</b>：表面數字華麗、核心 +26%。<b>訓練意義</b>：分辨「表面 vs 核心」、看到爆表數字先問「是不是一次性認列」。</li>
                    <li><b>整段期間的教訓</b>：GOOGL 從 $89 → $180+（+100%+）· 「Google 輸給 ChatGPT」是最大的錯誤敘事。<b>對主流敘事保持懷疑機率 30-40%，不要 0% 也不要 100%</b>。</li>
                </ul>
            </div>

            <div class="pm-section">
                <h3>🎯 下一輪訓練建議</h3>
                <ul class="pm-lessons">
                    <li>重玩一次 · 看你事後知道結果後、決策會怎麼變（但要注意：這是「後見之明偏誤」訓練、不代表你下次真的判得對）</li>
                    <li>換一支股票（AMD、NVDA）· AI 熱潮股跟 GOOGL 這種「反擊型龍頭」判斷邏輯完全不同</li>
                    <li>把你的<b>心理弱點寫下來</b>：哪個事件讓你最想賣？哪個讓你最 FOMO？下次遇到同類事件時可以更冷靜</li>
                </ul>
                <div class="btn-row" style="margin-top: 16px;">
                    <button onclick="location.reload()">🔄 重玩一次</button>
                    <a href="./index.html" class="btn-link">← 回估值分析器</a>
                </div>
            </div>
        `;
    }

    // ---------- Handlers ----------
    function initHandlers() {
        // Phase 2: initial position slider
        const pos = $('sim-pos');
        const posVal = $('sim-pos-val');
        pos.addEventListener('input', () => {
            posVal.textContent = pos.value + '%';
        });

        $('btn-start-game').addEventListener('click', () => {
            if (!priceSeries) {
                alert('股價還沒抓完 · 等一下再點');
                return;
            }
            startGame(parseInt(pos.value) || 20);
        });

        // Phase 3: target slider
        const target = $('pos-target');
        target.addEventListener('input', () => {
            $('pos-target-val').textContent = target.value + '%';
            updateDeltaPreview();
        });

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                const currentPct = currentPositionPct();
                let target;
                if (preset === '0-delta') target = Math.round(currentPct / 5) * 5;
                else if (preset === '0') target = 0;
                else if (preset === '100') target = 100;
                else {
                    // e.g. "-20", "+20"
                    const delta = parseInt(preset);
                    target = Math.max(0, Math.min(100, Math.round((currentPct + delta) / 5) * 5));
                }
                $('pos-target').value = target;
                $('pos-target-val').textContent = target + '%';
                updateDeltaPreview();
            });
        });

        $('btn-confirm-decision').addEventListener('click', confirmDecision);
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
