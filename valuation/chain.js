/**
 * 穿透鏈 · 10 關逐關檢查
 *
 * 靈感：NVIDIA Q2 FY26 那份 deep note 的「穿透鏈」邏輯 —— 從產品層到自由現金流
 * 一路檢查每個環節有沒有斷點。7 關可自動化（3-9）· 關 0/1/2 需手動 · 關 10 全手動。
 *
 * 用法：
 *   PenetrationChain.render(analysis, containerId)
 *     - analysis: 見 simulator.js renderResult 收到的物件
 *     - containerId: 要插入的 DOM id (預設 'chain-body')
 *
 * 手動輸入 (關 0/1/2/10 · 用戶自填部分) 存在 localStorage · key = 'chain_' + ticker
 *
 * 核心原則：未驗證 ≠ 通過。關 0/1/2/10 在使用者未實際填寫前，狀態固定是
 * 'manual'（顯示 ?），絕不會因為輔助的自動抓取資料（DSO / Deferred Revenue /
 * sector）而被判成 pass/warn/fail —— 那些資料只是「幫你判斷」的參考，不能替代
 * 使用者本人的確認動作。避免「空值被誤讀成正面訊號」。
 */
(function () {
    'use strict';

    // 版本標記：每次改計分邏輯就更新這個字串 · 畫面上的除錯校驗行會秀出來 ·
    //   若使用者回報的數字跟目前 repo 邏輯對不上 · 先比對這個版本號有沒有變 ·
    //   沒變 = 真的是新 bug；版本號是舊的 = 瀏覽器快取問題，不是程式邏輯問題
    const CHAIN_VERSION = '2026-09-03.2';

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
            : '? 待你手填「1 句話說這是什麼生意」';
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
        // gate1_top5 「已填」的判斷：用原始字串是否非空 · 不是用 parse 出來的數字
        //   （用戶填 0 也算「已填」——0% 集中度是明確答案 · 不該被當成未填）
        const rawTop5 = userInput.gate1_top5;
        const filled = rawTop5 !== undefined && rawTop5 !== null && String(rawTop5).trim() !== '';
        const topCust = filled ? Number(rawTop5) : null;
        // DSO 只是輔助參考資訊 · 不能單靠它把這關判成 pass/warn ——
        //   customer concentration 是這關真正要驗證的東西 · FMP 免費 tier 沒有
        //   這筆資料 · 必須使用者親自查 10-K 填寫才算「驗證過」
        let status = 'manual';
        let headline = '? 待你查 10-K 手填 Top 5 客戶集中度 %';
        if (filled && !isNaN(topCust)) {
            if (topCust > 50) { status = 'fail'; headline = `✗ Top 5 客戶佔 ${topCust.toFixed(0)}% · 高集中度風險`; }
            else if (topCust > 30) { status = 'warn'; headline = `⚠ Top 5 客戶佔 ${topCust.toFixed(0)}% · 中等集中`; }
            else { status = 'pass'; headline = `✓ Top 5 客戶佔 ${topCust.toFixed(0)}% · 分散`; }
        }
        const details = `
          <div class="chain-kv"><b>DSO (AR × 365 / Rev TTM)</b>: ${dso !== null ? dso.toFixed(1) + ' 天 · 僅供參考，不會影響這關的通過判定' : '—'}</div>
          <div class="chain-hint">FMP 免費 tier 沒 customer concentration ·
            <a href="https://www.sec.gov/edgar/searchedgar/companysearch" target="_blank">查 10-K</a>
            找 "Concentration of Credit Risk" 章節 · <b>未填此欄位前這關維持「?」待填狀態</b></div>
          <label class="chain-input-label">Top 5 客戶佔營收 %（10-K 手填 · 必填才算完成這關）：
            <input type="number" class="chain-input" data-key="gate1_top5" step="1" min="0" max="100"
                   value="${filled ? topCust : ''}" placeholder="例：42">
          </label>`;
        return { status, title: '關 1 · 客戶', headline, details, dataSource: 'FMP /balance-sheet（DSO 參考）+ 10-K 手填（必填）' };
    }

    // 關 2 · 訂單 (Deferred Revenue trend)
    function buildGate2(analysis, userInput) {
        const bs = analysis.balanceSheet || (analysis.fundamentals && analysis.fundamentals.latestBS) || {};
        const rawBacklog = userInput.gate2_backlog;
        const filled = rawBacklog !== undefined && rawBacklog !== null && String(rawBacklog).trim() !== '';
        const backlog = filled ? Number(rawBacklog) : null;
        const dr = bs.contractLiabilities !== undefined ? bs.contractLiabilities
                 : (bs.deferredRevenue !== undefined ? bs.deferredRevenue : null);
        // Deferred Revenue 是自動抓的輔助資訊 · 不能單靠它判這關通過 ——
        //   backlog / 訂單存量才是這關要驗證的東西 · 需使用者查 10-K 確認
        //   （某些消費品/零售公司天生沒有傳統 backlog 概念 · 這種情況請填 0
        //    並在心裡記住這關對這類公司「結構性不適用」）
        let status = 'manual';
        let headline = '? 待你查 10-K 手填 Backlog / 訂單存量（消費品公司若無此概念可填 0）';
        if (filled && !isNaN(backlog)) {
            if (backlog > 0) {
                status = 'pass';
                headline = `✓ Backlog $${backlog.toFixed(1)}B (10-K 手填) · 訂單能見度確認`;
            } else {
                status = 'warn';
                headline = '⚠ 已確認無傳統 backlog（填 0）· 這關對此類商業模式可能結構性不適用';
            }
        }
        const details = `
          <div class="chain-kv"><b>Deferred Revenue (BS · 僅供參考)</b>: ${dr !== null ? '$' + (dr / 1e9).toFixed(2) + 'B · 不會影響這關的通過判定' : '—'}</div>
          <div class="chain-hint">若公司揭露 backlog / commitments · 從 10-K 找數字填入 ·
            若是無傳統 backlog 的消費品/零售公司 · 填 0 確認已檢查過 ·
            <b>未填此欄位前這關維持「?」待填狀態</b></div>
          <label class="chain-input-label">Backlog / 訂單存量 $B（手填 · 必填才算完成這關 · 無則填 0）：
            <input type="number" class="chain-input" data-key="gate2_backlog" step="0.1" min="0"
                   value="${filled ? backlog : ''}" placeholder="例：25.4 · 無則填 0">
          </label>`;
        return { status, title: '關 2 · 訂單', headline, details, dataSource: 'FMP /balance-sheet（Deferred Rev 參考）+ 10-K 手填（必填）' };
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
    function buildGate4(analysis, isFinancial) {
        if (isFinancial) {
            return {
                status: 'na', title: '關 4 · GM',
                headline: '– 產業不適用 · 銀行/保險沒有 COGS 概念，毛利率無意義',
                details: '<div class="chain-hint">銀行/保險業沒有「銷貨成本」的概念 · grossProfitRatio 這種製造業指標套在金融股上不代表任何事 · 改看下方「💼 金融股專屬指標」panel 的 ROE（資本效率）</div>',
                dataSource: '產業判斷 skip（sector 命中 Financial Services / Banks / Insurance）',
            };
        }
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
    function buildGate5(analysis, isFinancial) {
        if (isFinancial) {
            return {
                status: 'na', title: '關 5 · OM',
                headline: '– 產業不適用 · 用 ROE 取代',
                details: '<div class="chain-hint">金融股的「營業利益」跟製造業的營運槓桿概念不對等（銀行的收入結構是利息收入+手續費+交易利得混合）· 改看下方「💼 金融股專屬指標」panel 的 ROE（資本效率的正確量尺）</div>',
                dataSource: '產業判斷 skip（sector 命中 Financial Services / Banks / Insurance）',
            };
        }
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
    // 金融股調整：不自動判 ✗ —— 銀行/保險的投資部位公允價值變動、交易收益本來就會讓
    //   業外項目占比較大 · 這是業態不是「業外主導失控」· 只顯示數字 + 溫和 pass/warn（never fail）
    function buildGate6(analysis, isFinancial) {
        // FMP income-statement 有 nonOperatingIncomeExpense 或 pretaxIncome - operatingIncome
        const raw = analysis.rawIncomeQuarterly || [];
        if (!Array.isArray(raw) || raw.length === 0) {
            return { status: 'warn', title: '關 6 · 業外', headline: '⚠ 缺 raw income statement · 無法直接算', details: '<div class="chain-hint">需 FMP /income-statement raw · profile 已抓但明細沒 attach</div>', dataSource: 'FMP raw quarterly' };
        }
        const latest = raw[0];
        const isNum = v => v !== null && v !== undefined && isFinite(v);
        const oi = isNum(latest.operatingIncome) ? latest.operatingIncome : 0;
        const pretax = isNum(latest.incomeBeforeTax) ? latest.incomeBeforeTax
                     : (isNum(latest.pretaxIncome) ? latest.pretaxIncome : 0);
        const nonOp = pretax - oi;
        const ratio = oi ? Math.abs(nonOp / oi) : (nonOp === 0 ? 0 : null);
        let status, headline;
        if (ratio === null) {
            status = 'warn'; headline = '⚠ 缺 OI · 無法算';
        } else if (isFinancial) {
            // 金融股：只分 pass/warn · 絕不 fail —— 業外佔比高是常態不是警訊
            if (ratio < 0.30) { status = 'pass'; headline = `✓ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 在合理範圍`; }
            else { status = 'warn'; headline = `⚠ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 佔比較大 · 銀行/保險常態（投資部位公允價值變動/交易收益）· 非自動失敗訊號`; }
        } else if (ratio < 0.10) { status = 'pass'; headline = `✓ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 經常性主導`; }
        else if (ratio < 0.30) { status = 'warn'; headline = `⚠ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 中等干擾`; }
        else { status = 'fail'; headline = `✗ 業外 / OI = ${(ratio * 100).toFixed(1)}% · 質疑經常性`; }
        const details = `
          <div class="chain-kv"><b>Operating Income</b>: ${isNum(oi) ? '$' + (oi / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>Pretax Income</b>: ${isNum(pretax) ? '$' + (pretax / 1e9).toFixed(2) + 'B' : '—'}</div>
          <div class="chain-kv"><b>業外 (pretax - OI)</b>: ${isNum(nonOp) ? '$' + (nonOp / 1e9).toFixed(2) + 'B' : '—'}</div>
          ${isFinancial ? '<div class="chain-hint">金融股：此關不會自動判失敗 · 業外佔比大是投資/交易業務的正常特徵</div>' : ''}`;
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
    function buildGate8(analysis, isFinancial) {
        if (isFinancial) {
            return {
                status: 'na', title: '關 8 · NI',
                headline: '– 產業不適用 · 金融股損益結構跟製造業不同',
                details: '<div class="chain-hint">NI/OI gap 對金融股不是品質訊號——投資部位公允價值變動、交易收益、準備金認列都會讓兩者脫鉤，這是業態不是警訊 · 改看下方「💼 金融股專屬指標」panel</div>',
                dataSource: '產業判斷 skip（sector 命中 Financial Services / Banks / Insurance）',
            };
        }
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
    function buildGate9(analysis, isFinancial) {
        if (isFinancial) {
            return {
                status: 'na', title: '關 9 · FCF',
                headline: '– 產業不適用 · 銀行 FCF 受放款/存款/交易部位影響',
                details: '<div class="chain-hint">銀行的「營運現金流」本質是存款流入流出 + 放款規模變動，是業務規模波動不是「賺錢沒現金支撐」的警訊（跟上方「現金流量 vs 淨利」panel 的判讀一致）· 此關不計分</div>',
                dataSource: '產業判斷 skip（sector 命中 Financial Services / Banks / Insurance）',
            };
        }
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
        // 未驗證 ≠ 通過：4 個 checkpoint 沒全填完前 · 這關維持「?」不判定 pass/warn/fail ——
        //   即使已填的 2 個都是 ✓ 通過，剩下 2 個沒填也不能算「這關過了」
        let status, headline;
        if (filled === 0) {
            status = 'manual';
            headline = '? 尚未填 · 這關全靠你判斷（已填 0/4）';
        } else if (filled < 4) {
            status = 'manual';
            headline = `? 已填 ${filled}/4 · 其中通過 ${passCount} 項 · 尚未填完不計入總分`;
        } else if (failCount > 0) {
            status = 'fail';
            headline = `✗ ${failCount}/4 失敗 · 護城河有破口`;
        } else if (warnCount > 1) {
            status = 'warn';
            headline = `⚠ ${warnCount}/4 警告 · 中等護城河`;
        } else if (passCount === 4) {
            status = 'pass';
            headline = '✓ 4/4 · 教科書級護城河';
        } else {
            status = 'pass';
            headline = `✓ ${passCount}/4 通過`;
        }
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
        const scoreText = filled === 0
            ? '尚未填寫任何項目'
            : `已填 <b>${filled}/4</b> · 其中通過 <b>${passCount}/${filled}</b>${filled < 4 ? ' · 未填完不計入合併總分' : ''}`;
        const details = `
          <div class="chain-cp-list">${rows}</div>
          <div class="chain-cp-score">${scoreText}</div>`;
        return {
            status, title: '關 10 · 持續期', headline, details,
            dataSource: '手動判斷 · 護城河四要素',
            durationFilled: filled, durationPass: passCount,
        };
    }

    // ---------- Render ----------
    // 'na' = 產業不適用（例：金融股跳過 GM/OM/FCF-NI）· 跟 'manual'（待你填）意義不同：
    //   'manual' 是「還沒填但可以填」· 'na' 是「這關對這個產業結構性不適用 · 不會有你能填的答案」
    function statusClass(s) {
        return { pass: 'gate-pass', warn: 'gate-warn', fail: 'gate-fail', manual: 'gate-manual', na: 'gate-na' }[s] || 'gate-manual';
    }
    function statusIcon(s) {
        return { pass: '✓', warn: '⚠', fail: '✗', manual: '?', na: '–' }[s] || '?';
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
        // 金融股（sector 命中 Financial Services / Banks / Insurance）：關 4/5/8/9 產業不適用
        //   直接複用 simulator.js renderResult() 已經算好、掛在 analysis.isFinancial 上的判斷 ·
        //   不重新寫一份 sector regex（跟 6 軸雷達、現金流 panel、反向 DCF 共用同一個判斷來源）
        const isFinancial = !!analysis.isFinancial;
        const gates = [
            buildGate0(analysis, userInput),
            buildGate1(analysis, userInput),
            buildGate2(analysis, userInput),
            buildGate3(analysis),
            buildGate4(analysis, isFinancial),
            buildGate5(analysis, isFinancial),
            buildGate6(analysis, isFinancial),
            buildGate7(analysis),
            buildGate8(analysis, isFinancial),
            buildGate9(analysis, isFinancial),
            buildGate10(analysis, userInput),
        ];
        // 自動關卡（關 3-9）：非金融股固定 7 關全部可自動判定 · 金融股會有 4 關（4/5/8/9）
        //   標成 'na'（產業不適用）· 分母要跟著扣掉這些 na 關卡 · 不能還是寫死 7
        const autoGatesRaw = gates.slice(3, 10);
        const naGates = autoGatesRaw.filter(g => g.status === 'na');
        const autoGates = autoGatesRaw.filter(g => g.status !== 'na');
        const autoTotal = autoGates.length;   // JPM 這種金融股會是 3（3/6/7）· AAPL 這種非金融股是 7
        const autoPass = autoGates.filter(g => g.status === 'pass').length;
        const naCount = naGates.length;

        // 手動 3 關（關 0/1/2）：未驗證 ≠ 通過 · 只有使用者實際填寫才離開 'manual'（?）狀態
        const manualGates = gates.slice(0, 3);
        const manualFilled = manualGates.filter(g => g.status !== 'manual').length;
        const manualPass = manualGates.filter(g => g.status === 'pass').length;

        // 關 10 持續期：4 個 checkpoint 各自獨立 · 用 gate 回傳的 durationFilled/durationPass
        const g10 = gates[10];
        const durFilled = g10.durationFilled || 0;
        const durPass = g10.durationPass || 0;

        const fullyComplete = manualFilled === 3 && durFilled === 4;
        const pendingCount = (3 - manualFilled) + (4 - durFilled);
        // 「穿透鏈 10 關」= 自動關卡（非金融股 7 關 · 金融股扣掉 na 後可能只剩 3 關）+ 手動 3 關（關 0/1/2）
        //   持續期是額外/獨立評分 · 不計入這個合併分數
        const mainPass = autoPass + manualPass;
        const mainTotal = autoTotal + 3;   // 非金融股 = 10 · 金融股會更小（例：JPM 3+3=6）

        // 3 段式進度條：綠(通過) / 紅黃(已填但未過) / 灰(待填)
        // 總槽位 = 自動關卡(已扣 na) + 3 手動 + 4 持續期 · na 關卡不佔進度條（產業不適用不算「待完成」）
        const totalSlots = autoTotal + 3 + 4;
        const greenN = mainPass + durPass;
        const amberRedN = (autoTotal - autoPass) + (manualFilled - manualPass) + (durFilled - durPass);
        const grayN = (3 - manualFilled) + (4 - durFilled);
        const pct = n => totalSlots ? (n / totalSlots * 100).toFixed(1) : 0;

        const progressBar = `
          <div class="chain-progress" title="綠=通過 · 紅黃=已填但未過 · 灰=待填 · 產業不適用的關卡不計入進度條">
            <div class="chain-progress-seg chain-progress-green" style="width:${pct(greenN)}%"></div>
            <div class="chain-progress-seg chain-progress-amber" style="width:${pct(amberRedN)}%"></div>
            <div class="chain-progress-seg chain-progress-gray" style="width:${pct(grayN)}%"></div>
          </div>`;

        const mergedLine = fullyComplete
            ? `<span class="chain-merged-ok">✓ 全部已完成：<b>${mainPass}/${mainTotal}</b> 通過（持續期另計 ${durPass}/4${naCount > 0 ? ` · ${naCount} 關產業不適用` : ''}）</span>`
            : `<span class="chain-merged-pending">⏳ 部分完成：還有 <b>${pendingCount}</b> 項待填 · 無法給出完整穿透鏈分數</span>`;

        // 除錯校驗行：把「自動 N1/自動分母 + 手動 N2/3 + 持續期 N3/4 = 總計」的原始算式攤開顯示 ·
        //   任何人都能一眼核對總分不是黑箱數字 · 也能拿版本號判斷瀏覽器是否還在用舊快取的 chain.js
        const rawSum = autoPass + manualPass + durPass;
        console.log(
            `[PenetrationChain ${CHAIN_VERSION}] ${ticker}${isFinancial ? ' (金融股)' : ''} · ` +
            `自動 ${autoPass}/${autoTotal}${naCount > 0 ? `（另 ${naCount} 關產業不適用）` : ''} + ` +
            `手動 ${manualPass}/3 + 持續期 ${durPass}/4 = 總計 ${rawSum}/${totalSlots} · ` +
            `(合併分數只計自動+手動 = ${mainPass}/${mainTotal} · 條件：手動已填 3/3 且持續期已填 4/4 才顯示)`
        );
        const debugLine = `
          <div class="chain-debug">
            🔧 除錯校驗（build ${CHAIN_VERSION}）：自動 ${autoPass}/${autoTotal}${naCount > 0 ? ` (+${naCount} na)` : ''} + 手動 ${manualPass}/3 + 持續期 ${durPass}/4
            = 總計 <b>${rawSum}/${totalSlots}</b>　·　若你看到的畫面數字跟這行對不上，代表瀏覽器還在用舊版 chain.js，
            請強制重新整理（Ctrl/Cmd+Shift+R）
          </div>`;

        const autoNote = naCount > 0
            ? `　·　<span class="chain-na-note">${naCount} 關產業不適用</span>`
            : '';
        const summary = `
          <div class="chain-summary">
            ${progressBar}
            <div class="chain-summary-row">
              <span>自動關卡：<b>${autoPass}/${autoTotal}</b> 通過${autoNote}</span>
              <span>手動關卡：已填 <b>${manualFilled}/3</b>（關 0/1/2）</span>
            </div>
            <div class="chain-summary-row">
              <span>持續期：已填 <b>${durFilled}/4</b>${durFilled > 0 ? ` · 通過 <b>${durPass}/${durFilled}</b>` : ' · 尚未填'}</span>
              <span>${mergedLine}</span>
            </div>
            ${debugLine}
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
