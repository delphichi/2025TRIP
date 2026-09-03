/**
 * 穿透鏈 · 10 關逐關檢查
 *
 * 靈感：NVIDIA Q2 FY26 那份 deep note 的「穿透鏈」邏輯 —— 從產品層到自由現金流
 * 一路檢查每個環節有沒有斷點。8 關可自動化 · 關 0/1/2 需部分手動 · 關 10 全手動。
 *
 * 用法：
 *   PenetrationChain.render(analysis, containerId)
 *     - analysis: 見 simulator.js renderResult 收到的物件
 *     - containerId: 要插入的 DOM id (預設 'chain-body')
 *
 * 手動輸入 (關 0/1/2/10 · 用戶自填部分) 存在 localStorage · key = 'chain_' + ticker
 */
(function () {
    'use strict';

    // ---------- 資料存取 (localStorage) ----------
    function storageKey(ticker) { return 'chain_' + (ticker || 'unknown'); }

    function loadUserInput(ticker) {
        try {
            const raw = localStorage.getItem(storageKey(ticker));
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }

    function saveUserInput(ticker, data) {
        try {
            localStorage.setItem(storageKey(ticker), JSON.stringify(data));
        } catch (_) { /* 隱私瀏覽 · 靜默 */ }
    }

    // ---------- 通用工具 ----------
    function fmt(v, d) {
        d = d !== undefined ? d : 2;
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return Number(v).toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });
    }

    function fmtPct(v, d) {
        d = d !== undefined ? d : 1;
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return (v * 100).toFixed(d) + '%';
    }

    function pctBps(v) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        const sign = v >= 0 ? '+' : '';
        return sign + v.toFixed(1) + 'pp';
    }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------- 每關的判定函數 ----------
    // 每個 buildGateN(...) 回傳 {status: 'pass'|'warn'|'fail'|'manual', title, headline, details, dataSource}

    function _lookback(arr, n) {
        // 從 FMP quarterly data 拿最新 n 筆（arr[0] 最新）· 過濾 NaN
        if (!Array.isArray(arr) || arr.length === 0) return [];
        return arr.slice(0, n).map(e => e && e.value !== undefined ? e.value : e).filter(v => v !== null && isFinite(v));
    }

    // 關 0 · 產品：sector + industry + description + 用戶手填「1 句話」
    function buildGate0(analysis, userInput) {
        const sector = analysis.sector || '';
        const industry = analysis.industry || '';
        const desc = analysis.description || (analysis.fundamentals && analysis.fundamentals.description) || '';
        const shortDesc = desc ? desc.slice(0, 200) + (desc.length > 200 ? '…' : '') : '';
        const oneLiner = (userInput.gate0_oneLiner || '').trim();
        const status = oneLiner ? 'pass' : 'manual';
        const headline = oneLiner
            ? '✓ 你已填「這是什麼生意」'
            : '⚠ 需你手填「1 句話說這是什麼生意」';
        const details = `
          <div class="chain-kv"><b>Sector</b>: ${esc(sector) || '—'}</div>
          <div class="chain-kv"><b>Industry</b>: ${esc(industry) || '—'}</div>
          ${shortDesc ? `<div class="chain-desc">${esc(shortDesc)}</div>` : ''}
          <label class="chain-input-label">你的 1 句話（強制觸發思考）：
            <input type="text" class="chain-input" data-key="gate0_oneLiner" value="${esc(oneLiner)}"
                   placeholder="例：他們做 GPU · 賣給資料中心蓋 AI 算力">
          </label>`;
        return { status, title: '關 0 · 產品', headline, details, dataSource: 'FMP /profile + 用戶手填' };
    }

    // 關 1 · 客戶：DSO (AR days) + 用戶手填「Top 5 客戶佔 %」
    function buildGate1(analysis, userInput) {
        const bs = analysis.balanceSheet || (analysis.fundamentals && analysis.fundamentals.latestBS) || {};
        const rev = analysis.fundamentals && analysis.fundamentals.revenue;
        // DSO ≈ AR × 365 / Revenue (TTM) · FMP balance sheet 用 accountsReceivable
        let dso = null;
        const ar = bs.accountsReceivable !== undefined ? bs.accountsReceivable
                 : (bs.receivables !== undefined ? bs.receivables : null);
        if (ar && Array.isArray(rev) && rev.length >= 4) {
            const revTtm = rev.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            if (revTtm > 0) dso = ar * 365 / revTtm;
        }
        const topCust = userInput.gate1_top5 !== undefined ? Number(userInput.gate1_top5) : null;
        // 判準：DSO > 90 集中警訊 · Top 5 > 50% 集中 · < 30% 分散
        let status = 'manual';
        let headline = '⚠ DSO 已算 · Top 5 客戶集中度需你查 10-K 手填';
        if (dso !== null && dso > 90) {
            status = 'warn';
            headline = `⚠ DSO ${dso.toFixed(0)} 天 · 高於行業慣例 · 可能客戶集中`;
        } else if (dso !== null && dso <= 60) {
            status = 'pass';
            headline = `✓ DSO ${dso.toFixed(0)} 天 · 收款正常`;
        } else if (dso !== null) {
            status = 'warn';
            headline = `⚠ DSO ${dso.toFixed(0)} 天 · 60-90 屬中間帶`;
        }
        if (topCust !== null && !isNaN(topCust)) {
            if (topCust > 50) { status = 'fail'; headline = `✗ Top 5 客戶佔 ${topCust.toFixed(0)}% · 高集中度風險`; }
            else if (topCust > 30) { status = 'warn'; headline = `⚠ Top 5 客戶佔 ${topCust.toFixed(0)}% · 中等集中`; }
            else { status = 'pass'; headline = `✓ Top 5 客戶佔 ${topCust.toFixed(0)}% · 分散`; }
        }
        const details = `
          <div class="chain-kv"><b>DSO (AR × 365 / Rev TTM)</b>: ${dso !== null ? dso.toFixed(1) + ' 天' : '—'}</div>
          <div class="chain-hint">FMP 免費 tier 沒 customer concentration ·
            <a href="https://www.sec.gov/edgar/searchedgar/companysearch" target="_blank">查 10-K</a>
            找 "Concentration of Credit Risk" 章節</div>
          <label class="chain-input-label">Top 5 客戶佔營收 %（10-K 手填）：
            <input type="number" class="chain-input" data-key="gate1_top5" step="1" min="0" max="100"
                   value="${topCust !== null ? topCust : ''}" placeholder="例：42">
          </label>`;
        return { status, title: '關 1 · 客戶', headline, details, dataSource: 'FMP /balance-sheet + 10-K 手填' };
    }

    // 關 2 · 訂單 (Deferred Revenue trend)
    function buildGate2(analysis, userInput) {
        const bs = analysis.balanceSheet || (analysis.fundamentals && analysis.fundamentals.latestBS) || {};
        const backlog = userInput.gate2_backlog !== undefined ? Number(userInput.gate2_backlog) : null;
        const dr = bs.contractLiabilities !== undefined ? bs.contractLiabilities
                 : (bs.deferredRevenue !== undefined ? bs.deferredRevenue : null);
        let status = 'manual';
        let headline = '⚠ Deferred Revenue 已抓 · Backlog 需手填';
        if (dr !== null && dr > 0) {
            status = 'pass';
            headline = `✓ Deferred Revenue $${(dr / 1e9).toFixed(2)}B · 表示已簽約未認列的訂單存量`;
        }
        if (backlog !== null && !isNaN(backlog) && backlog > 0) {
            status = 'pass';
            headline = `✓ Backlog $${backlog.toFixed(1)}B (10-K 手填) · 訂單能見度確認`;
        }
        const details = `
          <div class="chain-kv"><b>Deferred Revenue (BS)</b>: ${dr !== null ? '$' + (dr / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-hint">若公司揭露 backlog / commitments · 從 10-K 找數字填入</div>
          <label class="chain-input-label">Backlog / 訂單存量 $B（手填）：
            <input type="number" class="chain-input" data-key="gate2_backlog" step="0.1" min="0"
                   value="${backlog !== null ? backlog : ''}" placeholder="例：25.4">
          </label>`;
        return { status, title: '關 2 · 訂單', headline, details, dataSource: 'FMP /balance-sheet + 10-K 手填' };
    }

    // 關 3 · 營收：最新季 YoY
    function buildGate3(analysis) {
        const rev = analysis.fundamentals && analysis.fundamentals.revenue;
        if (!Array.isArray(rev) || rev.length === 0) {
            return { status: 'fail', title: '關 3 · 營收', headline: '✗ 無營收資料', details: '', dataSource: 'FMP /income-statement quarterly' };
        }
        const latest = rev[0];
        // 只用 mode='YoY' 的值 · FMP 免費 tier 常只給 5 季 → 只有最新 1 個真 YoY
        const yoyEntries = rev.filter(e => e && e.mode === 'YoY' && e.yoy !== null && isFinite(e.yoy));
        const yoy = latest && latest.yoy !== null && isFinite(latest.yoy) ? latest.yoy : null;
        let status, headline;
        if (yoy === null) { status = 'warn'; headline = '⚠ 只有 1 季資料 · 無法算 YoY'; }
        else if (yoy > 0.10) { status = 'pass'; headline = `✓ ${(yoy * 100).toFixed(1)}% YoY · 強`; }
        else if (yoy > 0) { status = 'pass'; headline = `✓ ${(yoy * 100).toFixed(1)}% YoY`; }
        else if (yoy > -0.05) { status = 'warn'; headline = `⚠ ${(yoy * 100).toFixed(1)}% YoY · 平緩衰退`; }
        else { status = 'fail'; headline = `✗ ${(yoy * 100).toFixed(1)}% YoY · 顯著衰退`; }
        // 4 季連續加速？· 只用 mode='YoY' 的 · FMP 免費 tier 常只有 1 個
        const yoyVals = yoyEntries.map(e => e.yoy);
        let trendText;
        if (yoyVals.length < 2) {
            trendText = `樣本不足 (只 ${yoyVals.length} 個真 YoY · FMP 免費 tier 5 季限制)`;
        } else {
            const accelerate = yoyVals.length >= 3 && yoyVals[0] >= yoyVals[1] && yoyVals[1] >= yoyVals[2];
            const decelerate = yoyVals[0] < yoyVals[1];
            trendText = accelerate ? '加速中 ↑' : (decelerate ? '減速中 ↓' : '持平');
        }
        const details = `
          <div class="chain-kv"><b>最新季</b>: ${esc(latest.date || '')} · ${latest.value ? '$' + (latest.value / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>YoY (真 YoY 樣本)</b>: ${yoyVals.length ? yoyVals.map(v => (v * 100).toFixed(1) + '%').join(' · ') : '—'}</div>
          <div class="chain-kv"><b>趨勢</b>: ${trendText}</div>`;
        return { status, title: '關 3 · 營收', headline, details, dataSource: 'FMP /income-statement quarterly' };
    }

    // 關 4 · GM (毛利率)
    function buildGate4(analysis) {
        const gm = analysis.fundamentals && analysis.fundamentals.grossMargin;
        if (!Array.isArray(gm) || gm.length === 0) {
            return { status: 'fail', title: '關 4 · GM', headline: '✗ 無毛利率資料', details: '', dataSource: 'FMP /income-statement' };
        }
        const latestGm = gm[0].value;
        const values = _lookback(gm, 4);
        const trendUp = values.length >= 2 && values[0] > values[values.length - 1];
        const trendFlat = values.length >= 2 && Math.abs(values[0] - values[values.length - 1]) < 0.005;
        let status, headline;
        if (latestGm > 0.30 && trendUp) { status = 'pass'; headline = `✓ GM ${fmtPct(latestGm)} · 定價權強 · 趨勢向上`; }
        else if (latestGm > 0.30) { status = 'pass'; headline = `✓ GM ${fmtPct(latestGm)} · 定價權強`; }
        else if (trendUp) { status = 'pass'; headline = `✓ GM ${fmtPct(latestGm)} · 趨勢向上`; }
        else if (trendFlat) { status = 'warn'; headline = `⚠ GM ${fmtPct(latestGm)} · 趨勢持平`; }
        else if (latestGm < 0.20) { status = 'warn'; headline = `⚠ GM ${fmtPct(latestGm)} · 低利 · 且趨勢向下`; }
        else { status = 'fail'; headline = `✗ GM ${fmtPct(latestGm)} · 趨勢向下`; }
        const yoyBps = values.length >= 4 ? (values[0] - values[3]) * 100 : null;
        const details = `
          <div class="chain-kv"><b>最新 GM</b>: ${fmtPct(latestGm)}</div>
          <div class="chain-kv"><b>YoY 變化</b>: ${yoyBps !== null ? pctBps(yoyBps) : '—'}</div>
          <div class="chain-kv"><b>近 4 季</b>: ${values.map(v => (v * 100).toFixed(1) + '%').join(' · ')}</div>`;
        return { status, title: '關 4 · GM', headline, details, dataSource: 'FMP grossProfitRatio' };
    }

    // 關 5 · OM (營益率) + 營運槓桿
    function buildGate5(analysis) {
        const om = analysis.fundamentals && analysis.fundamentals.operatingMargin;
        const rev = analysis.fundamentals && analysis.fundamentals.revenue;
        if (!Array.isArray(om) || om.length === 0) {
            return { status: 'fail', title: '關 5 · OM', headline: '✗ 無營益率資料', details: '', dataSource: 'FMP /income-statement' };
        }
        const latestOm = om[0].value;
        const values = _lookback(om, 4);
        const trendUp = values.length >= 2 && values[0] > values[values.length - 1];
        // 營運槓桿：OM YoY 改善 且 Rev 也成長 · 門檻放寬到 0.5pp（浮點誤差 + 真實槓桿都算進來）
        const revYoy = rev && rev[0] && rev[0].yoy;
        const omBps = values.length >= 4 ? (values[0] - values[3]) * 100 : null;
        const leverage = revYoy > 0 && omBps !== null && omBps > 0.5;
        let status, headline;
        if (latestOm > 0.25 && leverage) { status = 'pass'; headline = `✓ OM ${fmtPct(latestOm)} · 營運槓桿發威`; }
        else if (latestOm > 0.20) { status = 'pass'; headline = `✓ OM ${fmtPct(latestOm)} · 高獲利`; }
        else if (trendUp) { status = 'pass'; headline = `✓ OM ${fmtPct(latestOm)} · 趨勢向上`; }
        else if (latestOm > 0.10) { status = 'warn'; headline = `⚠ OM ${fmtPct(latestOm)} · 中等`; }
        else { status = 'fail'; headline = `✗ OM ${fmtPct(latestOm)} · 偏低`; }
        const details = `
          <div class="chain-kv"><b>最新 OM</b>: ${fmtPct(latestOm)}</div>
          <div class="chain-kv"><b>YoY 變化</b>: ${omBps !== null ? pctBps(omBps) : '—'}</div>
          <div class="chain-kv"><b>近 4 季</b>: ${values.map(v => (v * 100).toFixed(1) + '%').join(' · ')}</div>
          <div class="chain-kv"><b>營運槓桿</b>: ${leverage ? '✓ Rev+ 且 OM 擴張' : '— 無明顯槓桿'}</div>`;
        return { status, title: '關 5 · OM', headline, details, dataSource: 'FMP operatingIncomeRatio' };
    }

    // 關 6 · 業外：|業外 / OI|
    function buildGate6(analysis) {
        // FMP income-statement 有 nonOperatingIncomeExpense 或 pretaxIncome - operatingIncome
        const raw = analysis.rawIncomeQuarterly || [];
        if (!Array.isArray(raw) || raw.length === 0) {
            return { status: 'warn', title: '關 6 · 業外', headline: '⚠ 缺 raw income statement · 無法直接算', details: '<div class="chain-hint">需 FMP /income-statement raw · profile 已抓但明細沒 attach</div>', dataSource: 'FMP raw quarterly' };
        }
        const latest = raw[0];
        const oi = latest.operatingIncome || 0;
        const pretax = latest.incomeBeforeTax || latest.pretaxIncome || 0;
        const nonOp = pretax - oi;
        const ratio = oi ? Math.abs(nonOp / oi) : null;
        let status, headline;
        if (ratio === null) { status = 'warn'; headline = '⚠ 缺 OI · 無法算'; }
        else if (ratio < 0.10) { status = 'pass'; headline = `✓ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 經常性主導`; }
        else if (ratio < 0.30) { status = 'warn'; headline = `⚠ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 中等干擾`; }
        else { status = 'fail'; headline = `✗ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 質疑經常性`; }
        const details = `
          <div class="chain-kv"><b>Operating Income</b>: ${oi ? '$' + (oi / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>Pretax Income</b>: ${pretax ? '$' + (pretax / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>業外 (pretax - OI)</b>: ${nonOp ? '$' + (nonOp / 1e9).toFixed(2) + 'B' : '—'}</div>`;
        return { status, title: '關 6 · 業外', headline, details, dataSource: 'FMP pretaxIncome - operatingIncome' };
    }

    // 關 7 · Tax
    function buildGate7(analysis) {
        const raw = analysis.rawIncomeQuarterly || [];
        if (!Array.isArray(raw) || raw.length === 0) {
            return { status: 'warn', title: '關 7 · Tax', headline: '⚠ 缺 raw · 無法直接算', details: '', dataSource: 'FMP raw quarterly' };
        }
        const rates = raw.slice(0, 8).map(r => {
            const pretax = r.incomeBeforeTax || r.pretaxIncome || 0;
            const tax = r.incomeTaxExpense || 0;
            return pretax ? tax / pretax : null;
        }).filter(v => v !== null && isFinite(v));
        if (rates.length === 0) {
            return { status: 'warn', title: '關 7 · Tax', headline: '⚠ 缺 pretax income', details: '', dataSource: 'FMP incomeTaxExpense / pretaxIncome' };
        }
        const latest = rates[0];
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        let status, headline;
        if (latest >= 0.15 && latest <= 0.25) { status = 'pass'; headline = `✓ Tax ${(latest * 100).toFixed(1)}% · 合理`; }
        else if (latest > 0.25 && latest < 0.35) { status = 'warn'; headline = `⚠ Tax ${(latest * 100).toFixed(1)}% · 偏高`; }
        else if (latest > 0.35) { status = 'fail'; headline = `✗ Tax ${(latest * 100).toFixed(1)}% · 一次性項扭曲`; }
        else if (latest < 0.10) { status = 'fail'; headline = `✗ Tax ${(latest * 100).toFixed(1)}% · 過低 · 一次性利多扭曲`; }
        else { status = 'pass'; headline = `✓ Tax ${(latest * 100).toFixed(1)}% · 合理`; }
        const details = `
          <div class="chain-kv"><b>最新季稅率</b>: ${(latest * 100).toFixed(1)}%</div>
          <div class="chain-kv"><b>${rates.length} 季平均</b>: ${(avg * 100).toFixed(1)}%</div>
          <div class="chain-kv"><b>近期</b>: ${rates.slice(0, 4).map(v => (v * 100).toFixed(1) + '%').join(' · ')}</div>`;
        return { status, title: '關 7 · Tax', headline, details, dataSource: 'FMP incomeTaxExpense / pretaxIncome' };
    }

    // 關 8 · NI vs OI 一致性
    function buildGate8(analysis) {
        const raw = analysis.rawIncomeQuarterly || [];
        if (!Array.isArray(raw) || raw.length === 0) {
            return { status: 'warn', title: '關 8 · NI', headline: '⚠ 缺 raw · 無法比對', details: '', dataSource: 'FMP raw quarterly' };
        }
        const latest = raw[0];
        const oi = latest.operatingIncome || 0;
        const ni = latest.netIncome || 0;
        // OI/NI 走勢一致度：4 季 QoQ 方向對得上多少
        const oiQoQ = [], niQoQ = [];
        for (let i = 0; i < 4 && i + 1 < raw.length; i++) {
            oiQoQ.push((raw[i].operatingIncome || 0) - (raw[i + 1].operatingIncome || 0));
            niQoQ.push((raw[i].netIncome || 0) - (raw[i + 1].netIncome || 0));
        }
        let sameDir = 0;
        for (let i = 0; i < oiQoQ.length; i++) {
            if ((oiQoQ[i] >= 0) === (niQoQ[i] >= 0)) sameDir += 1;
        }
        const consistency = oiQoQ.length ? sameDir / oiQoQ.length : 0;
        const gap = oi ? Math.abs((ni - oi) / oi) : null;
        let status, headline;
        if (consistency >= 0.75 && gap !== null && gap < 0.20) {
            status = 'pass';
            headline = `✓ NI $${(ni / 1e9).toFixed(1)}B · 與 OI 一致`;
        } else if (consistency >= 0.5) {
            status = 'warn';
            headline = `⚠ NI vs OI 部分背離 · 一致率 ${(consistency * 100).toFixed(0)}%`;
        } else {
            status = 'fail';
            headline = `✗ NI 走勢與 OI 顯著背離 · 業外/稅主導`;
        }
        const details = `
          <div class="chain-kv"><b>最新季 OI</b>: ${oi ? '$' + (oi / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>最新季 NI</b>: ${ni ? '$' + (ni / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>NI vs OI 一致率 (4 季 QoQ 方向)</b>: ${(consistency * 100).toFixed(0)}%</div>
          <div class="chain-kv"><b>Adjustment gap</b>: ${gap !== null ? (gap * 100).toFixed(1) + '%' : '—'}</div>`;
        return { status, title: '關 8 · NI', headline, details, dataSource: 'FMP operatingIncome vs netIncome' };
    }

    // 關 9 · FCF / NI
    function buildGate9(analysis) {
        const cf = analysis.cashFlow || {};
        if (!cf.freeCF || !cf.netIncome || cf.freeCF.length < 4 || cf.netIncome.length < 4) {
            return { status: 'warn', title: '關 9 · FCF', headline: '⚠ FCF 或 NI 資料不足 · 需 4 季', details: '', dataSource: 'FMP /cash-flow-statement quarterly' };
        }
        const fcfTtm = cf.freeCF.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
        const niTtm = cf.netIncome.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
        const ratio = niTtm !== 0 ? fcfTtm / niTtm : null;
        // 3 年平均（12 季 · 若不夠用有多少算多少）
        let ratio3y = null;
        if (cf.freeCF.length >= 12 && cf.netIncome.length >= 12) {
            const fcf3y = cf.freeCF.slice(0, 12).reduce((a, e) => a + (e.value || 0), 0);
            const ni3y = cf.netIncome.slice(0, 12).reduce((a, e) => a + (e.value || 0), 0);
            ratio3y = ni3y !== 0 ? fcf3y / ni3y : null;
        }
        let status, headline;
        if (ratio === null) { status = 'warn'; headline = '⚠ NI ≈ 0 · 比率無意義'; }
        else if (ratio > 0.8) { status = 'pass'; headline = `✓ FCF / NI = ${ratio.toFixed(2)} · 獲利有現金`; }
        else if (ratio > 0.4) { status = 'warn'; headline = `⚠ FCF / NI = ${ratio.toFixed(2)} · 卸妝後偏低`; }
        else { status = 'fail'; headline = `✗ FCF / NI = ${ratio.toFixed(2)} · 獲利品質差`; }
        const details = `
          <div class="chain-kv"><b>FCF (TTM)</b>: $${(fcfTtm / 1e9).toFixed(2)}B</div>
          <div class="chain-kv"><b>NI (TTM)</b>: $${(niTtm / 1e9).toFixed(2)}B</div>
          <div class="chain-kv"><b>FCF / NI (TTM)</b>: ${ratio !== null ? ratio.toFixed(2) : '—'}</div>
          <div class="chain-kv"><b>3 年平均</b>: ${ratio3y !== null ? ratio3y.toFixed(2) : '樣本不足'}</div>`;
        return { status, title: '關 9 · FCF', headline, details, dataSource: 'FMP freeCashFlow vs netIncome' };
    }

    // 關 10 · 持續期（4 checkpoints）
    function buildGate10(analysis, userInput) {
        const items = [
            { key: 'gate10_need', label: 'Need（真需求）', prompt: '這個產品不買會怎樣？' },
            { key: 'gate10_product', label: 'Product（有貨）', prompt: '是否有實體/服務可交付？' },
            { key: 'gate10_indispensable', label: 'Indispensable（不可取代）', prompt: 'Top 3 對手是誰？他們的產品能替代嗎？' },
            { key: 'gate10_mainstream', label: 'Mainstream（主流化）', prompt: 'TAM 是否 > $10B 且滲透率 < 50%？' },
        ];
        let passCount = 0, warnCount = 0, failCount = 0;
        items.forEach(it => {
            const v = userInput[it.key];
            if (v === 'pass') passCount++;
            else if (v === 'warn') warnCount++;
            else if (v === 'fail') failCount++;
        });
        const filled = passCount + warnCount + failCount;
        let status, headline;
        if (filled === 0) { status = 'manual'; headline = '⚠ 未填 · 這關全靠你判斷'; }
        else if (failCount > 0) { status = 'fail'; headline = `✗ ${failCount}/4 失敗 · 護城河有破口`; }
        else if (warnCount > 1) { status = 'warn'; headline = `⚠ ${warnCount}/4 警告 · 中等護城河`; }
        else if (passCount === 4) { status = 'pass'; headline = '✓ 4/4 · 教科書級護城河'; }
        else { status = 'pass'; headline = `✓ ${passCount}/4 通過`; }
        const rows = items.map(it => {
            const v = userInput[it.key] || '';
            return `
              <div class="chain-cp">
                <div class="chain-cp-label"><b>${esc(it.label)}</b> <span class="chain-hint">${esc(it.prompt)}</span></div>
                <div class="chain-cp-radios">
                  <label><input type="radio" name="${it.key}" data-key="${it.key}" value="pass" ${v === 'pass' ? 'checked' : ''}> ✓ 通過</label>
                  <label><input type="radio" name="${it.key}" data-key="${it.key}" value="warn" ${v === 'warn' ? 'checked' : ''}> ⚠ 警告</label>
                  <label><input type="radio" name="${it.key}" data-key="${it.key}" value="fail" ${v === 'fail' ? 'checked' : ''}> ✗ 失敗</label>
                </div>
              </div>`;
        }).join('');
        const details = `
          <div class="chain-cp-list">${rows}</div>
          <div class="chain-cp-score">持續期評分：<b>${passCount}/4</b> · ${filled}/4 已填</div>`;
        return { status, title: '關 10 · 持續期', headline, details, dataSource: '手動判斷 · 護城河四要素', durationScore: passCount };
    }

    // ---------- Render ----------
    function statusClass(s) {
        return { pass: 'gate-pass', warn: 'gate-warn', fail: 'gate-fail', manual: 'gate-manual' }[s] || 'gate-manual';
    }
    function statusIcon(s) {
        return { pass: '✓', warn: '⚠', fail: '✗', manual: '?' }[s] || '?';
    }

    function renderGate(g, idx) {
        return `
          <details class="chain-gate ${statusClass(g.status)}" data-gate-idx="${idx}">
            <summary class="chain-gate-summary">
              <span class="chain-gate-icon">${statusIcon(g.status)}</span>
              <span class="chain-gate-title">${esc(g.title)}</span>
              <span class="chain-gate-headline">${esc(g.headline)}</span>
              <span class="chain-gate-expand">展開</span>
            </summary>
            <div class="chain-gate-body">
              ${g.details}
              <div class="chain-gate-source">資料源：${esc(g.dataSource || '')}</div>
            </div>
          </details>`;
    }

    function render(analysis, containerId) {
        containerId = containerId || 'chain-body';
        const el = document.getElementById(containerId);
        if (!el) return;
        const ticker = analysis && analysis.ticker;
        if (!ticker) {
            el.innerHTML = '<p class="hint">尚未載入個股 · 先在上方查詢</p>';
            return;
        }
        const userInput = loadUserInput(ticker);
        const gates = [
            buildGate0(analysis, userInput),
            buildGate1(analysis, userInput),
            buildGate2(analysis, userInput),
            buildGate3(analysis),
            buildGate4(analysis),
            buildGate5(analysis),
            buildGate6(analysis),
            buildGate7(analysis),
            buildGate8(analysis),
            buildGate9(analysis),
            buildGate10(analysis, userInput),
        ];
        const autoGates = gates.slice(3, 10);   // 關 3-9 自動
        const autoPass = autoGates.filter(g => g.status === 'pass').length;
        const autoTotal = autoGates.filter(g => g.status !== 'manual').length;
        const durationScore = gates[10].durationScore || 0;
        const totalPass = gates.filter(g => g.status === 'pass').length;

        const summary = `
          <div class="chain-summary">
            <div class="chain-summary-row">
              <span>自動化 8 關（關 3-9）：<b>${autoPass}/${autoTotal}</b> 通過</span>
              <span>持續期評分：<b>${durationScore}/4</b>${durationScore === 4 ? ' · 教科書級護城河' : ''}</span>
            </div>
            <div class="chain-summary-row">
              <span>全 10 關（含關 0/1/2 手動）：<b>${totalPass}/10</b> 通過</span>
              <span class="chain-hint">關 0/1/2 需你手填才會顯示 ✓</span>
            </div>
          </div>`;
        el.innerHTML = summary + gates.map((g, i) => renderGate(g, i)).join('');

        // 綁定 input 事件 · 存 localStorage
        el.querySelectorAll('.chain-input, input[type="radio"]').forEach(inp => {
            inp.addEventListener('change', () => {
                const key = inp.dataset.key;
                if (!key) return;
                const data = loadUserInput(ticker);
                data[key] = inp.value;
                saveUserInput(ticker, data);
                // rerender to update pass count & badges
                render(analysis, containerId);
            });
        });
    }

    window.PenetrationChain = { render, buildGate3, buildGate4, buildGate5, buildGate6, buildGate7, buildGate8, buildGate9, buildGate10 };
})();
