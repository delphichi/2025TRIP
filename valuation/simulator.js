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
    // Feature B · FMP 資產負債表 + key metrics TTM · 給資產負債結構 panel 用
    async function fetchFmpBalanceSheet(ticker, apiKey) {
        if (!apiKey) return null;
        try {
            const [bsRows, kmTtm] = await Promise.all([
                fmpFetch(`/balance-sheet-statement?symbol=${ticker}&period=quarter`, apiKey).catch(() => null),
                fmpFetch(`/key-metrics-ttm?symbol=${ticker}`, apiKey).catch(() => null),
            ]);
            if (!bsRows || !Array.isArray(bsRows) || bsRows.length === 0) return null;
            bsRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const latest = bsRows[0];
            const km = (Array.isArray(kmTtm) && kmTtm[0]) ? kmTtm[0] : {};
            return {
                date: latest.date || null,
                totalAssets: latest.totalAssets ?? null,
                cash: latest.cashAndCashEquivalents ?? null,
                accountsReceivable: latest.netReceivables ?? latest.accountsReceivables ?? null,
                inventories: latest.inventory ?? null,
                currentAssets: latest.totalCurrentAssets ?? null,
                ppe: latest.propertyPlantEquipmentNet ?? null,
                intangibles: (latest.intangibleAssets || 0) + (latest.goodwill || 0),
                ltInvestments: latest.longTermInvestments ?? null,
                accountsPayable: latest.accountPayables ?? latest.accountsPayable ?? null,
                currentLiabilities: latest.totalCurrentLiabilities ?? null,
                longTermDebt: latest.longTermDebt ?? null,
                totalLiabilities: latest.totalLiabilities ?? null,
                // 流動負債細項（US 對應 · 預收款 / 短期債 / 應計 / 應付稅）
                contractLiabilities: latest.deferredRevenue ?? null,   // FMP 用 deferredRevenue 代表預收款
                shortTermBorrowings: latest.shortTermDebt ?? null,
                otherPayables: latest.accruedExpenses ?? null,
                currentTaxLiabilities: latest.taxPayables ?? null,
                otherCurrentLiabilities: latest.otherCurrentLiabilities ?? null,
                equity: latest.totalStockholdersEquity ?? latest.totalEquity ?? null,
                retainedEarnings: latest.retainedEarnings ?? null,
                // key-metrics-ttm 直接有 · 免自己算
                roe: km.roeTTM !== undefined ? km.roeTTM * 100 : null,
                roa: km.returnOnTangibleAssetsTTM !== undefined ? km.returnOnTangibleAssetsTTM * 100
                     : (km.returnOnAssetsTTM !== undefined ? km.returnOnAssetsTTM * 100 : null),
                roic: km.roicTTM !== undefined ? km.roicTTM * 100 : null,
                source: 'FMP',
            };
        } catch (e) {
            console.warn('FMP balance sheet fetch failed:', e.message);
            return null;
        }
    }

    // Feature · 內部人持股變化（US 專用 · FMP Form 4）
    async function fetchFmpInsiderTrading(ticker, apiKey) {
        if (!apiKey) return null;
        try {
            const rows = await fmpFetch(`/insider-trading/search?symbol=${ticker}&limit=100`, apiKey);
            if (!Array.isArray(rows) || rows.length === 0) return null;
            // 篩最近 90 天 · 算淨買賣
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 90);
            const cutoffStr = cutoff.toISOString().split('T')[0];
            let buys3M = 0, sells3M = 0, buyValue3M = 0, sellValue3M = 0;
            const inRange = rows.filter(r => (r.filingDate || r.transactionDate || '') >= cutoffStr);
            inRange.forEach(r => {
                const shares = r.securitiesTransacted || 0;
                const price = r.price || 0;
                const type = (r.acquisitionOrDisposition || r.transactionType || '').toUpperCase();
                if (type === 'A' || type === 'P' || type.includes('BUY')) {
                    buys3M += shares;
                    buyValue3M += shares * price;
                } else if (type === 'D' || type === 'S' || type.includes('SELL')) {
                    sells3M += shares;
                    sellValue3M += shares * price;
                }
            });
            return {
                transactions: rows.slice(0, 20),
                buys3M, sells3M,
                buyValue3M, sellValue3M,
                netShares3M: buys3M - sells3M,
                netValue3M: buyValue3M - sellValue3M,
            };
        } catch (e) {
            console.warn('FMP insider trading fetch failed:', e.message);
            return null;
        }
    }

    // 診斷：顯示 FMP 每個 endpoint 的狀態 · 讓使用者知道 panel 為什麼沒亮
    function renderFmpStatusHtml(analysis) {
        const status = analysis.fmpEndpointStatus;
        if (!status || !Array.isArray(status)) return '';
        const failed = status.filter(s => !s.hasData);
        if (failed.length === 0) return '';

        const items = failed.map(s => {
            let msg = s.err || '空回傳';
            let cause = '';
            if (/403|premium|paid|subscription|Premium/i.test(msg)) cause = '🔒 需付費 tier';
            else if (/402/i.test(msg)) cause = '🔒 需付費 tier';
            else if (/429|rate limit|quota/i.test(msg)) cause = '⏱ 額度用完';
            else if (/404|not found/i.test(msg)) cause = '❓ 找不到（可能 ticker 不支援）';
            else if (/500|502|503/i.test(msg)) cause = '⚠️ FMP 伺服器問題';
            else if (/timeout|network/i.test(msg)) cause = '🌐 網路問題';
            else if (msg === '空回傳') cause = '📭 API 通了但沒資料';
            return `<li><b>${s.name}</b>：${cause} · <code>${msg.slice(0, 80)}</code></li>`;
        }).join('');

        return `
            <section class="panel fmp-status-panel">
                <details>
                    <summary>⚠️ FMP 有 ${failed.length} 個選配 endpoint 沒拿到資料（點展開看原因）</summary>
                    <p class="hint-mini" style="margin-top:8px">
                        免費 tier 常鎖：<b>內部人交易 · 13F · 分析師預估 · 部分同業 quote</b> · 這些 panel 不會顯示。
                        <b>核心指標</b>（quote / ratios / 損益 / 現金流 / 資產負債表）不受影響。
                    </p>
                    <ul class="fmp-status-list">${items}</ul>
                </details>
            </section>
        `;
    }

    // Feature · 機構持股集中度（13F · US 專用）
    // 抓最新 filed quarter · 顯示前 10 大機構 + 集中度警訊
    async function fetchFmpInstitutionalOwnership(ticker, apiKey) {
        if (!apiKey) return null;
        try {
            // 13F 45 天後 filed · 試最近 4 個 quarter · 抓到就 stop
            const now = new Date();
            const currentY = now.getFullYear();
            const currentM = now.getMonth() + 1;
            let curQ = Math.ceil(currentM / 3);
            const attempts = [];
            for (let back = 1; back <= 4; back++) {
                let q = curQ - back;
                let y = currentY;
                while (q <= 0) { q += 4; y--; }
                attempts.push({ year: y, quarter: q });
            }
            for (const { year, quarter } of attempts) {
                try {
                    const rows = await fmpFetch(
                        `/institutional-ownership/extract-analytics/holder?symbol=${ticker}&year=${year}&quarter=${quarter}&page=0&limit=25`,
                        apiKey
                    );
                    if (Array.isArray(rows) && rows.length > 0) {
                        // 排序 · 大→小
                        rows.sort((a, b) => (b.sharesNumber || 0) - (a.sharesNumber || 0));
                        return { year, quarter, holders: rows.slice(0, 20) };
                    }
                } catch (_) {}
            }
            return null;
        } catch (e) {
            console.warn('FMP institutional ownership fetch failed:', e.message);
            return null;
        }
    }

    // Feature · 配息歷史（FMP）
    async function fetchFmpDividends(ticker, apiKey) {
        if (!apiKey) return null;
        try {
            const rows = await fmpFetch(`/dividends?symbol=${ticker}`, apiKey);
            if (!Array.isArray(rows) || rows.length === 0) return null;
            // group by year
            const byYear = new Map();
            rows.forEach(r => {
                const year = (r.date || r.recordDate || '').slice(0, 4);
                if (!year || year === '') return;
                const div = r.dividend || r.adjDividend || 0;
                if (!isFinite(div)) return;
                byYear.set(year, (byYear.get(year) || 0) + div);
            });
            return Array.from(byYear.entries())
                .map(([year, cash]) => ({ year, cash, stock: 0 }))
                .sort((a, b) => b.year.localeCompare(a.year))
                .slice(0, 10);
        } catch (e) {
            console.warn('FMP dividend fetch failed:', e.message);
            return null;
        }
    }

    async function fetchFmpFundamentals(ticker, apiKey) {
        try {
            const rows = await fmpFetch(`/income-statement?symbol=${ticker}&period=quarter`, apiKey);
            if (!rows || rows.length === 0) return null;
            rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const safeDiv = (num, den) => (num !== null && num !== undefined && den) ? num / den : null;
            const result = processFundamentals(rows, {
                revenue: r => r.revenue,
                eps: r => (r.eps !== null && r.eps !== undefined) ? r.eps : r.epsDiluted,
                grossMargin:     r => safeDiv(r.grossProfit, r.revenue),
                operatingMargin: r => safeDiv(r.operatingIncome, r.revenue),
            });

            // 非營運項目佔稅前獲利比例 TTM · 揭露 GOOGL 這種控股公司特有 pumpage
            // 例：GOOGL Q1 2026 OI&E $37.7B / 稅前 $77.4B = 49% · 其中 99% 是 Waymo/DeepMind
            //     未實現利益（外部融資輪推高帳面公允價值）· 不會轉成現金流
            // 正常公司 <10% · 20-40% 值得警告 · >40% 極端
            if (result && rows.length >= 4) {
                let nonOpSum = 0, preTaxSum = 0, valid = true;
                for (let i = 0; i < 4; i++) {
                    const r = rows[i];
                    // FMP dump 驗證：nonOperatingIncomeExcludingInterest 是主欄位
                    // totalOtherIncomeExpensesNet 是舊版名 · 有時被替代
                    const nonOp = (r.nonOperatingIncomeExcludingInterest !== undefined && r.nonOperatingIncomeExcludingInterest !== null)
                                ? r.nonOperatingIncomeExcludingInterest
                                : (r.totalOtherIncomeExpensesNet !== undefined && r.totalOtherIncomeExpensesNet !== null)
                                  ? r.totalOtherIncomeExpensesNet : null;
                    const preTax = r.incomeBeforeTax;
                    if (nonOp === null || preTax === null || preTax === undefined || !isFinite(nonOp) || !isFinite(preTax)) {
                        valid = false; break;
                    }
                    nonOpSum += nonOp;
                    preTaxSum += preTax;
                }
                if (valid && preTaxSum !== 0) {
                    result.nonOpRatioTtm = nonOpSum / preTaxSum;
                    result.nonOpTtm = nonOpSum;
                    result.preTaxTtm = preTaxSum;
                }
            }
            return result;
        } catch (e) {
            console.warn('FMP fundamentals fetch failed:', e.message);
            return null;
        }
    }

    // FinMind：TaiwanStockFinancialStatements 是 long format
    // 需要 pivot：group by date、type 當欄位
    // Phase 7（估值雷達）：同時抓 BalanceSheet · 算 TTM ROE
    // Step 2 · 加抓 TaiwanStockMonthRevenue（TW 月營收 · 領先季報 6 週）
    async function fetchFinMindFundamentals(ticker, token) {
        try {
            const startDate = todayMinusYears(4);
            const [fsRows, bsRows, monthRows] = await Promise.all([
                finMindFetch('TaiwanStockFinancialStatements', ticker, startDate, todayStr(), token),
                finMindFetch('TaiwanStockBalanceSheet', ticker, startDate, todayStr(), token).catch(() => []),
                finMindFetch('TaiwanStockMonthRevenue', ticker, startDate, todayStr(), token).catch(() => []),
            ]);
            if (!fsRows || fsRows.length === 0) return null;
            // Pivot：{ date: { type1: value1, type2: value2, ... } }
            const byDate = new Map();
            fsRows.forEach(r => {
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
                // 淨利：spec 明確叫 IncomeAfterTaxes（有 s）
                const netIncome = flat.IncomeAfterTaxes || flat.IncomeAfterTax || flat.ProfitAfterTax || null;
                return {
                    date: d,
                    revenue,
                    eps,
                    netIncome,
                    grossMargin: (grossProfit !== null && revenue) ? grossProfit / revenue : null,
                    operatingMargin: (opIncome !== null && revenue) ? opIncome / revenue : null,
                };
            });
            const result = processFundamentals(wideRows, {
                revenue: r => r.revenue,
                eps: r => r.eps,
                grossMargin: r => r.grossMargin,
                operatingMargin: r => r.operatingMargin,
            });

            // === Phase 7 · 算 TTM ROE ===
            // 分子：近 4 季淨利加總（TTM）
            // 分母：最新期末權益總額（Equity 欄位）
            if (result && bsRows && bsRows.length > 0 && wideRows.length >= 4) {
                // Pivot BalanceSheet
                const bsByDate = new Map();
                bsRows.forEach(r => {
                    if (!bsByDate.has(r.date)) bsByDate.set(r.date, {});
                    bsByDate.get(r.date)[r.type] = r.value;
                });
                const bsDates = Array.from(bsByDate.keys()).sort().reverse();
                if (bsDates.length > 0) {
                    const latestBs = bsByDate.get(bsDates[0]);
                    // Equity 欄位 · spec 提到 Equity（權益總額）· fallback 到 EquityAttributableToOwnersOfParent
                    const equity = latestBs.Equity || latestBs.EquityAttributableToOwnersOfParent || null;
                    // 近 4 季淨利加總
                    let ttmNetIncome = 0, validQuarters = 0;
                    for (let i = 0; i < Math.min(4, wideRows.length); i++) {
                        const ni = wideRows[i].netIncome;
                        if (ni !== null && isFinite(ni)) { ttmNetIncome += ni; validQuarters++; }
                    }
                    if (validQuarters === 4 && equity && equity > 0) {
                        result.roe = (ttmNetIncome / equity) * 100;   // %
                        result.roeBreakdown = {
                            ttmNetIncome,
                            equity,
                            equityDate: bsDates[0],
                            method: 'FinMind TTM',
                        };
                    }

                    // 應收帳款 · 存貨 quarterly 時序（給 drill-down 表用）
                    // bsDates 已是新→舊 · 直接 map · 存原始值 · QoQ 在 render 層算
                    result.balanceSheetSeries = bsDates.slice(0, 10).map(d => {
                        const flat = bsByDate.get(d);
                        return {
                            date: d,
                            accountsReceivable: flat.AccountsReceivableNet ?? null,
                            inventories: flat.Inventories ?? null,
                        };
                    });

                    // Feature B · 資產負債結構 snapshot（最新一季）
                    // 用戶要的 8 資產項 + 4 負債項 + 權益 + ROE/ROA/ROIC/PB
                    const totalAssets = latestBs.TotalAssets || null;
                    // TW 台商稅率固定 20% · 用來算 NOPAT
                    let ttmOpIncome = 0, opIncValid = 0;
                    for (let i = 0; i < Math.min(4, wideRows.length); i++) {
                        const rev = wideRows[i].revenue;
                        const opMargin = wideRows[i].operatingMargin;
                        if (rev !== null && opMargin !== null && isFinite(rev) && isFinite(opMargin)) {
                            ttmOpIncome += rev * opMargin;
                            opIncValid++;
                        }
                    }
                    const roa = (equity && totalAssets && totalAssets > 0)
                        ? (result.roeBreakdown ? (result.roeBreakdown.ttmNetIncome / totalAssets * 100) : null)
                        : null;
                    const ltDebt = (latestBs.LongtermBorrowings || 0) + (latestBs.BondsPayable || 0);
                    const investedCapital = equity && ltDebt !== null ? equity + ltDebt : null;
                    const roic = (opIncValid === 4 && investedCapital && investedCapital > 0)
                        ? (ttmOpIncome * 0.80 / investedCapital * 100)   // NOPAT ≈ OpInc × (1 - 20%)
                        : null;

                    result.balanceSheetSnapshot = {
                        date: bsDates[0],
                        totalAssets,
                        // 資產
                        cash: latestBs.CashAndCashEquivalents ?? null,
                        accountsReceivable: latestBs.AccountsReceivableNet ?? null,
                        inventories: latestBs.Inventories ?? null,
                        currentAssets: latestBs.CurrentAssets ?? null,
                        ppe: latestBs.PropertyPlantAndEquipment ?? null,
                        intangibles: latestBs.IntangibleAssets ?? null,
                        ltInvestments: (latestBs.InvestmentAccountedForUsingEquityMethod || 0)
                            + (latestBs.FinancialAssetsAtAmortizedCostNonCurrent || 0)
                            + (latestBs.FinancialAssetsAtFairvalueThroughOtherComprehensiveIncomeNonCurrent || 0)
                            + (latestBs.NonCurrentFinancialAssetsAtFairvalueThroughProfitOrLoss || 0),
                        // 負債
                        accountsPayable: latestBs.AccountsPayable ?? null,
                        currentLiabilities: latestBs.CurrentLiabilities ?? null,
                        longTermDebt: ltDebt || null,
                        totalLiabilities: latestBs.Liabilities ?? null,
                        // 流動負債細項（拆「其他流動負債」用 · 特別是預收款判斷訂單能見度）
                        contractLiabilities: latestBs.ContractLiabilities ?? latestBs.AdvanceReceipts ?? null,   // 合約負債 = 預收款
                        shortTermBorrowings: (latestBs.ShortTermBorrowings || 0)
                            + (latestBs.ShortTermNotesAndBillsPayable || 0)
                            + (latestBs.CurrentPortionOfLongtermBorrowings || 0) || null,
                        otherPayables: latestBs.OtherPayables ?? null,                                            // 應計費用 / 應付薪資
                        currentTaxLiabilities: latestBs.CurrentTaxLiabilities ?? null,
                        otherCurrentLiabilities: latestBs.OtherCurrentLiabilities ?? null,
                        // 權益
                        equity,
                        retainedEarnings: latestBs.RetainedEarnings ?? null,
                        // 比率
                        roe: result.roe ?? null,
                        roa,
                        roic,
                        // pb 之後在 render 層用 currentPBR 補上
                        source: 'FinMind',
                    };
                }
            }

            // Step 2 · 月營收 processing（TW 專用 · 每月 10 號公告 · 領先季報 6 週）
            // 用 revenue_year / revenue_month 組實際月份 label（date 是公告日不是資料月）
            if (monthRows && monthRows.length > 0) {
                const monthMap = new Map();
                monthRows.forEach(r => {
                    if (r.revenue === null || !isFinite(r.revenue)) return;
                    const y = r.revenue_year, m = r.revenue_month;
                    if (!y || !m) return;
                    const key = `${y}-${String(m).padStart(2, '0')}`;
                    monthMap.set(key, { period: key, year: y, month: m, value: r.revenue });
                });
                // 舊→新排 · 給算 YoY/MoM 用
                const monthsAsc = Array.from(monthMap.values()).sort((a, b) => a.period.localeCompare(b.period));
                const byKey = new Map(monthsAsc.map(x => [x.period, x]));
                const yoyKey = x => `${x.year - 1}-${String(x.month).padStart(2, '0')}`;
                const momKey = x => {
                    const py = x.month === 1 ? x.year - 1 : x.year;
                    const pm = x.month === 1 ? 12 : x.month - 1;
                    return `${py}-${String(pm).padStart(2, '0')}`;
                };
                const enriched = monthsAsc.map(x => {
                    const yoyRef = byKey.get(yoyKey(x));
                    const momRef = byKey.get(momKey(x));
                    const yoy = yoyRef && yoyRef.value > 0 ? (x.value - yoyRef.value) / yoyRef.value : null;
                    const mom = momRef && momRef.value > 0 ? (x.value - momRef.value) / momRef.value : null;
                    return { period: x.period, year: x.year, month: x.month, value: x.value, yoy, mom };
                });
                // 存新→舊
                result.monthlyRevenue = enriched.slice().reverse();
            }

            return result;
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

        // 計算 delta 的共用函式（isRatio → pp，else → %）
        const computeDelta = (val, priorVal, isRatio) => {
            if (val === null || val === undefined || !isFinite(val)) return null;
            if (priorVal === null || priorVal === undefined || !isFinite(priorVal) || priorVal === 0) return null;
            return isRatio ? (val - priorVal) : (val - priorVal) / Math.abs(priorVal);
        };

        const build = (getter, isRatio) => {
            const entries = [];
            for (let i = 0; i < N; i++) {
                const cur = rows[i];
                const val = getter(cur);
                let delta = null;
                let mode = null;   // 'YoY' | 'QoQ' | null

                // 優先 YoY：exact date match → i+4 offset（財年結週六漂移的美股）
                let priorYoY = rowByDate.get(yoyDate(cur.date));
                if (!priorYoY && rows[i + 4]) priorYoY = rows[i + 4];
                if (priorYoY) {
                    const d = computeDelta(val, getter(priorYoY), isRatio);
                    if (d !== null) { delta = d; mode = 'YoY'; }
                }

                // Fallback QoQ：跟前一季比（i+1）· FMP 免費 tier 只給 5 季，
                // 除了 top row 其他都 YoY 抓不到 → QoQ 替補、但明確標示有季節性
                if (delta === null && rows[i + 1]) {
                    const d = computeDelta(val, getter(rows[i + 1]), isRatio);
                    if (d !== null) { delta = d; mode = 'QoQ'; }
                }

                entries.push({ date: cur.date, value: val, yoy: delta, mode });
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

    // 主動式 ETF 監看清單 · 有經理人持股 CSV 可讀（.github/workflows/etf-holdings.yml 每日更新）
    // key: TW ETF code · value: display name（fallback · 若 manifest 沒到再用）
    const ACTIVE_ETF_MONITORED = {
        '00991A': '復華未來50',
        '00998A': '復華金融股息',
        '00981A': '統一台股增長',
        '00403A': '統一升級50',
    };

    // ---------- 主動 ETF 持股 fetch（走 GH Pages 靜態 CSV · 由 CI 每日更新）----------
    // Manifest schema 見 scripts/etf_holdings_monitor.py::write_manifest
    async function fetchEtfHoldings(ticker) {
        if (!ACTIVE_ETF_MONITORED[ticker]) return null;
        try {
            const manifestRes = await fetch('../data/etf_holdings/latest.json', { cache: 'no-cache' });
            if (!manifestRes.ok) return { available: false, reason: `manifest HTTP ${manifestRes.status}` };
            const manifest = await manifestRes.json();
            const fund = (manifest.funds || []).find(f => f.code === ticker);
            if (!fund) return { available: false, reason: 'ticker 不在 manifest 中（可能 CI 還沒跑第一次）', manifest };
            // 拉這檔的 snapshot CSV
            const csvRes = await fetch(`../data/etf_holdings/${fund.snapshot}`, { cache: 'no-cache' });
            if (!csvRes.ok) return { available: false, reason: `csv HTTP ${csvRes.status}`, manifest };
            const text = await csvRes.text();
            const holdings = parseHoldingsCsv(text);
            return { available: true, manifest, fund, holdings };
        } catch (e) {
            return { available: false, reason: e.message };
        }
    }

    // Mini CSV parser · schema：代號, 名稱, 股數, 權重（utf-8-sig · Python 寫的）
    // TW 股名無逗號 · 直接 split 安全
    function parseHoldingsCsv(text) {
        const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];
        const header = lines[0].split(',').map(h => h.trim());
        const idx = {
            code: header.indexOf('代號'),
            name: header.indexOf('名稱'),
            shares: header.indexOf('股數'),
            weight: header.indexOf('權重'),
        };
        const rows = [];
        for (const line of lines.slice(1)) {
            const cells = line.split(',');
            if (cells.length < 2 || !cells[idx.code]) continue;
            rows.push({
                code: (cells[idx.code] || '').trim(),
                name: (cells[idx.name] || '').trim(),
                shares: parseFloat(cells[idx.shares]) || 0,
                weight: parseFloat(cells[idx.weight]) || 0,
            });
        }
        rows.sort((a, b) => b.weight - a.weight);
        return rows;
    }

    // ---------- ETF 專屬 fetch ----------
    // 為什麼分開：ETF 沒有 PER/PBR/EPS/財報 · 走個股路徑會拿一堆空 array 觸發空指標判斷 crash
    // ETF 分析重點：配息 + 法人買賣（尤其投信）+ 大戶散戶籌碼 · 完全不同的看法
    // FinMind 對 ETF 可回的 dataset（實測 0050）：
    //   ✅ Info · Price · Dividend · Institutional · Margin · Shareholding · HoldingSharesPer
    //   ❌ PER · Financial · CashFlow · BalanceSheet · MonthRevenue · Buyback · MarketValueWeight
    async function fetchTwEtfData(ticker, token, years, prefetchedInfo) {
        setStatus('loading', `📡 ${ticker} 是 ETF · 抓專屬資料中……`);
        const startDate = todayMinusYears(Math.min(years, 3));   // ETF 只需近 3 年 · 太久沒意義
        const endDate = todayStr();
        const [priceData, dividendData, institutional, holdingSharesPer, marginData, activeHoldings] = await Promise.all([
            finMindFetch('TaiwanStockPrice', ticker, startDate, endDate, token),
            finMindFetch('TaiwanStockDividend', ticker, todayMinusYears(5), endDate, token).catch(() => []),
            finMindFetch('TaiwanStockInstitutionalInvestorsBuySell', ticker, todayMinusYears(0.5), endDate, token).catch(() => []),
            finMindFetch('TaiwanStockHoldingSharesPer', ticker, todayMinusYears(2), endDate, token).catch(() => []),
            finMindFetch('TaiwanStockMarginPurchaseShortSale', ticker, todayMinusYears(0.5), endDate, token).catch(() => []),
            fetchEtfHoldings(ticker),   // 只有 monitored ETF 才有 · null / {available:false} 都可以
        ]);

        const info = (prefetchedInfo && prefetchedInfo.length > 0) ? prefetchedInfo[prefetchedInfo.length - 1] : {};
        const stockName = info.stock_name || ticker;

        // 最新價 + 近 30 天漲跌
        let price = null, price30dAgo = null, change30d = null;
        if (priceData && priceData.length > 0) {
            price = priceData[priceData.length - 1].close;
            const targetIdx = Math.max(0, priceData.length - 22);   // ~30 曆日 = 22 交易日
            price30dAgo = priceData[targetIdx].close;
            if (price30dAgo) change30d = ((price - price30dAgo) / price30dAgo) * 100;
        }

        // ---------- Tier 1 · 技術訊號 + 風險 + 融資 ----------
        // 全部只用 priceData / marginData · 沒額外 API call
        const closes = (priceData || []).map(p => p.close).filter(c => c > 0);

        // 均線 (MA20 / MA60 / MA120)
        const meanTail = (arr, n) => arr.length < n ? null : arr.slice(-n).reduce((s, v) => s + v, 0) / n;
        const ma20 = meanTail(closes, 20);
        const ma60 = meanTail(closes, 60);
        const ma120 = meanTail(closes, 120);

        // RSI 14
        //   gain = 平均漲幅（僅正的日報酬）· loss = 平均跌幅（僅負的絕對值）
        //   RS = gain / loss · RSI = 100 - 100/(1+RS)
        //   標準值域：0-100 · <30 超賣 · >70 超買
        let rsi14 = null;
        if (closes.length >= 15) {
            const period = 14;
            let gain = 0, loss = 0;
            for (let i = closes.length - period; i < closes.length; i++) {
                const diff = closes[i] - closes[i - 1];
                if (diff > 0) gain += diff;
                else loss += -diff;
            }
            gain /= period; loss /= period;
            if (loss === 0) rsi14 = 100;
            else {
                const rs = gain / loss;
                rsi14 = 100 - 100 / (1 + rs);
            }
        }

        // 近 1 年價位百分位（現價落在近 252 交易日的哪個 percentile）
        let pricePct = null;
        if (closes.length >= 30 && price !== null) {
            const window = closes.slice(-Math.min(252, closes.length));
            const belowCount = window.filter(c => c < price).length;
            pricePct = (belowCount / window.length) * 100;
        }

        // 年化波動率（近 252 日 log return std × sqrt(252)）
        //   為什麼 log return：對 compound 更精確 · 且對稱（20% 漲 vs 20% 跌）
        //   annualize by sqrt(252) 是 daily → yearly 的標準做法
        let annualVol = null;
        if (closes.length >= 30) {
            const window = closes.slice(-Math.min(252, closes.length));
            const rets = [];
            for (let i = 1; i < window.length; i++) {
                rets.push(Math.log(window[i] / window[i - 1]));
            }
            const meanR = rets.reduce((s, v) => s + v, 0) / rets.length;
            const variance = rets.reduce((s, v) => s + (v - meanR) ** 2, 0) / rets.length;
            annualVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
        }

        // Max drawdown（近 1 年）· 從 rolling peak 算最大跌幅
        let mdd1y = null;
        if (closes.length >= 30) {
            const window = closes.slice(-Math.min(252, closes.length));
            let peak = window[0], maxDD = 0;
            for (const c of window) {
                if (c > peak) peak = c;
                const dd = (peak - c) / peak;
                if (dd > maxDD) maxDD = dd;
            }
            mdd1y = maxDD * 100;
        }

        // 總報酬（1Y / 3Y）· 買入放到最新價
        let return1y = null, return3y = null;
        if (closes.length >= 252) {
            const p252 = closes[closes.length - 252];
            if (p252 > 0) return1y = ((price - p252) / p252) * 100;
        }
        if (closes.length >= 252 * 3) {
            const p3y = closes[closes.length - 252 * 3];
            if (p3y > 0) return3y = ((price - p3y) / p3y) * 100;
        }

        // 融資融券 · 近 60 天餘額 + 券資比
        //   MarginPurchaseTodayBalance = 當日融資餘額（張數）
        //   ShortSaleTodayBalance = 當日融券餘額（張數）
        //   券資比 = 融券 / 融資 · 越高 = 空方越多 · 潛在軋空
        const marginSeries = (marginData || [])
            .filter(r => r.date)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(r => ({
                date: r.date,
                margin: r.MarginPurchaseTodayBalance || 0,
                short: r.ShortSaleTodayBalance || 0,
            }));
        const marginLast = marginSeries[marginSeries.length - 1] || null;
        const marginFirst60 = marginSeries.length >= 60 ? marginSeries[marginSeries.length - 60] : marginSeries[0];
        // 60 天融資餘額變化 %
        const margin60dChange = (marginLast && marginFirst60 && marginFirst60.margin > 0)
            ? ((marginLast.margin - marginFirst60.margin) / marginFirst60.margin) * 100
            : null;
        // 券資比
        const shortMarginRatio = (marginLast && marginLast.margin > 0)
            ? (marginLast.short / marginLast.margin) * 100
            : null;

        // 配息分析：近 12M 累計 + 頻率推算
        const now = Date.now();
        const dividends = (dividendData || [])
            .map(d => ({
                exDate: d.CashExDividendTradingDate || d.date,
                payDate: d.CashDividendPaymentDate || '',
                cash: d.CashEarningsDistribution || 0,
                year: d.year || '',
                announceDate: d.date || '',
            }))
            .filter(d => d.cash > 0)
            .sort((a, b) => (b.exDate || '').localeCompare(a.exDate || ''));
        const last12M = dividends.filter(d => {
            const dt = new Date(d.exDate);
            return !isNaN(dt) && (now - dt) < 365 * 86400 * 1000;
        });
        const last12MSum = last12M.reduce((s, d) => s + d.cash, 0);
        const estYield = price ? (last12MSum / price) * 100 : null;
        let frequency = null;
        if (last12M.length >= 10) frequency = '月配';
        else if (last12M.length >= 4) frequency = '季配';
        else if (last12M.length >= 2) frequency = '半年配';
        else if (last12M.length === 1) frequency = '年配';
        else frequency = '近 12M 無配息';

        // 法人買賣：近 60 天累計（買-賣） · 分投信 / 外資 / 自營商合計
        // Investment_Trust 對 ETF 是主戰場（大部分主動 ETF 是投信發的 · 也常被投信推薦）
        const inst60d = { Foreign_Investor: 0, Investment_Trust: 0, Dealer: 0 };
        const inst20d = { Foreign_Investor: 0, Investment_Trust: 0, Dealer: 0 };
        const cutoff60 = now - 60 * 86400 * 1000;
        const cutoff20 = now - 20 * 86400 * 1000;
        (institutional || []).forEach(r => {
            const dt = new Date(r.date).getTime();
            if (isNaN(dt)) return;
            const net = (r.buy || 0) - (r.sell || 0);
            let key;
            if (r.name === 'Foreign_Investor' || r.name === 'Foreign_Dealer_Self') key = 'Foreign_Investor';
            else if (r.name === 'Investment_Trust') key = 'Investment_Trust';
            else if (r.name === 'Dealer_self' || r.name === 'Dealer_Hedging') key = 'Dealer';
            else return;
            if (dt >= cutoff60) inst60d[key] += net;
            if (dt >= cutoff20) inst20d[key] += net;
        });

        // 每日累計 line 資料（近 60 天）· 給 chart 用
        const instDaily = new Map();   // date → {foreign, trust, dealer}
        (institutional || []).forEach(r => {
            const dt = new Date(r.date).getTime();
            if (isNaN(dt) || dt < cutoff60) return;
            const dateStr = r.date;
            if (!instDaily.has(dateStr)) instDaily.set(dateStr, { foreign: 0, trust: 0, dealer: 0 });
            const bucket = instDaily.get(dateStr);
            const net = (r.buy || 0) - (r.sell || 0);
            if (r.name === 'Foreign_Investor' || r.name === 'Foreign_Dealer_Self') bucket.foreign += net;
            else if (r.name === 'Investment_Trust') bucket.trust += net;
            else if (r.name === 'Dealer_self' || r.name === 'Dealer_Hedging') bucket.dealer += net;
        });
        const instSeriesRaw = Array.from(instDaily.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, v]) => ({ date, ...v }));
        // 累計
        let cumForeign = 0, cumTrust = 0, cumDealer = 0;
        const instSeries = instSeriesRaw.map(d => {
            cumForeign += d.foreign;
            cumTrust += d.trust;
            cumDealer += d.dealer;
            return { date: d.date, foreign: cumForeign, trust: cumTrust, dealer: cumDealer };
        });

        // 大戶散戶結構：拿最新一週的 HoldingSharesLevel
        // FinMind 集保級距（19 級）· 我們合併成 4 桶：零散 / 小戶 / 中戶 / 大戶 / 巨鯨
        // 為什麼合併：19 級太細 · 資訊分不清楚 · 4 桶剛好呈現「散戶 vs 大戶」對決
        //   單位是 unit（總股數）· percent 是該級距佔總股數比例
        const holdingLatestDate = (holdingSharesPer || []).reduce((max, r) => r.date > max ? r.date : max, '');
        const holdingRows = (holdingSharesPer || []).filter(r => r.date === holdingLatestDate);
        function bucketOf(level) {
            // FinMind 級距字串 · e.g. "1-999" / "1,000-5,000" / "1,000,001+" / "1,000,001-"
            // 抓下界的數字
            const m = /^([\d,]+)/.exec(level || '');
            if (!m) return 'other';
            const low = parseInt(m[1].replace(/,/g, ''), 10);
            if (low <= 5_000) return 'retail';        // 5 張以下 = 散戶
            if (low <= 50_000) return 'small';        // 5-50 張 = 小戶
            if (low <= 400_000) return 'mid';         // 50-400 張 = 中戶
            if (low <= 1_000_000) return 'big';       // 400-1000 張 = 大戶
            return 'whale';                            // 1000 張以上 = 巨鯨
        }
        const chipBuckets = { retail: 0, small: 0, mid: 0, big: 0, whale: 0 };
        holdingRows.forEach(r => {
            const b = bucketOf(r.HoldingSharesLevel);
            if (chipBuckets[b] !== undefined) chipBuckets[b] += (r.percent || 0);
        });

        // 巨鯨趨勢：近 2 年每個 date 的 whale % 走勢
        const whaleTrendMap = new Map();
        (holdingSharesPer || []).forEach(r => {
            if (bucketOf(r.HoldingSharesLevel) === 'whale') {
                whaleTrendMap.set(r.date, (whaleTrendMap.get(r.date) || 0) + (r.percent || 0));
            }
        });
        const whaleTrend = Array.from(whaleTrendMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, pct]) => ({ date, pct }));

        return {
            ticker,
            stockName,
            price,
            change30d,
            priceData: priceData || [],
            dividends,
            last12MSum,
            last12MCount: last12M.length,
            estYield,
            frequency,
            inst60d,
            inst20d,
            instSeries,
            chipBuckets,
            chipLatestDate: holdingLatestDate,
            whaleTrend,
            // Tier 1 新增
            technical: { ma20, ma60, ma120, rsi14, pricePct },
            risk: { annualVol, mdd1y, return1y, return3y },
            margin: { marginSeries, marginLast, margin60dChange, shortMarginRatio },
            // 主動 ETF 持股 · null 或 {available:false} 都可以（前端優雅降級）
            activeHoldings,
        };
    }

    // 從每日 PER/PBR array 建構出年度統計 + 全部日資料當歷史樣本
    // 直方圖用「全部日資料」→ 樣本量比 FMP 年報大 250 倍、分佈更細
    async function fetchTwStockData(rawTicker, token, years) {
        setStatus('loading', `📡 抓 ${rawTicker} (FinMind) 資料中……`);
        // 統一格式：去掉 .TW 後綴
        const ticker = rawTicker.replace(/\.TW$/i, '').replace(/^tw/i, '').trim();
        if (!/^\d{2,6}[A-Z]?$/.test(ticker)) throw new Error(`FinMind 台股 ticker 必須是數字（可帶 A/B/L/R 尾綴 · 例：2330、0050、00981A、00631L），你輸入 "${ticker}"`);
        const startDate = todayMinusYears(years);
        const endDate = todayStr();

        // 先抓 Info 判斷是不是 ETF · industry_category = "ETF" 才是可靠判定（regex 猜不準）
        // 花 1 次 API call · 值得——路由到對的分析路徑
        const infoProbe = await finMindFetch('TaiwanStockInfo', ticker, '2020-01-01', endDate, token).catch(() => []);
        const isEtf = infoProbe.length > 0 && infoProbe[0].industry_category === 'ETF';
        if (isEtf) {
            // 分岔到 ETF 專屬 fetch + render
            const etfData = await fetchTwEtfData(ticker, token, years, infoProbe);
            return { __isEtf: true, etf: etfData };
        }
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
            // Phase 7 · 6 軸雷達用
            roe: fundamentals?.roe ?? null,
            roeBreakdown: fundamentals?.roeBreakdown || null,
            dividendYield: (latest.dividend_yield !== undefined) ? latest.dividend_yield : null,
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

        // Promise.allSettled + 個別診斷：一個端點 402 不擋整份查詢，也告訴使用者哪個掛了
        // FMP 免費 tier 對特定 ticker / endpoint 組合會回 402（例：GOOG 觀察到）·
        // 用 GOOGL 通常可以繞（同公司不同 class · FMP 授權可能不同）
        const label = (name, promise) => promise.then(
            v => ({ name, ok: true, value: v }),
            e => ({ name, ok: false, error: e.message })
        );
        const results = await Promise.all([
            label('quote',          fmpFetch(`/quote?symbol=${ticker}`, apiKey)),
            label('profile',        fmpFetch(`/profile?symbol=${ticker}`, apiKey)),
            label('ratios',         fmpFetch(`/ratios?symbol=${ticker}`, apiKey)),
            label('income-stmt',    fetchFmpFundamentals(ticker, apiKey)),
            label('cash-flow',      fetchFmpCashFlow(ticker, apiKey)),
            label('balance-sheet',  fetchFmpBalanceSheet(ticker, apiKey)),
            label('insider',        fetchFmpInsiderTrading(ticker, apiKey)),
            label('dividends',      fetchFmpDividends(ticker, apiKey)),
            label('inst-own',       fetchFmpInstitutionalOwnership(ticker, apiKey)),
        ]);
        const [quoteR, profileR, ratiosR, fundR, cfR, bsR, insiderR, divR, instOwnR] = results;
        const failed = results.filter(r => !r.ok);

        // 生成 402 專用建議：試 GOOG↔GOOGL / TSLA↔TSLA / BRK.A↔BRK.B 這類 dual-class
        const has402 = failed.some(f => /402|Premium|subscription/i.test(f.error || ''));
        const dualClassHint = has402
            ? `\n💡 <b>402 特殊處理</b>：FMP 免費 tier 對特定 ticker × endpoint 組合會鎖付費。若是 <b>dual-class</b> 公司（GOOG/GOOGL · FOX/FOXA · BRK.A/BRK.B），試另一個 class 通常可繞（同公司但 FMP 授權可能不同）· 例：${ticker} = GOOG → 試 <b>GOOGL</b>。`
            : '';

        // quote 是主查詢必要 · 失敗就整份 abort
        const quote = quoteR.ok ? quoteR.value : null;
        if (!quote || !Array.isArray(quote) || quote.length === 0) {
            const failedList = failed.map(f => `<b>${f.name}</b>: ${f.error}`).join(' · ');
            throw new Error(
                `${ticker} FMP 主查詢失敗（quote endpoint 沒回值）。` +
                `<br>失敗端點：${failedList || 'quote 空回傳'}${dualClassHint}`
            );
        }
        const q = quote[0];
        const p = (profileR.ok && profileR.value && profileR.value[0]) ? profileR.value[0] : {};
        const ratios = ratiosR.ok ? ratiosR.value : null;
        const fundamentals = fundR.ok ? fundR.value : null;
        const cashFlow = cfR.ok ? cfR.value : null;

        if (!ratios || !Array.isArray(ratios) || ratios.length === 0) {
            const failedList = failed.map(f => `<b>${f.name}</b>: ${f.error}`).join(' · ');
            throw new Error(
                `${ticker} 沒有歷年 ratio 資料（quote OK 但 /ratios 掛了 · 這是 FMP 免費 tier 對特定 ticker 常見的限制）。` +
                `<br>失敗端點：${failedList}${dualClassHint}`
            );
        }

        // 抓完全部（新 API 沒 limit param），client 端 slice 取要的年數
        // FMP /api/v3 舊版 vs /stable/ 新版欄位名差很多，多試幾個
        const PE_FIELDS  = ['priceToEarningsRatio', 'priceEarningsRatio', 'peRatio', 'pe',
                            'priceEarningsRatioTTM', 'priceToEarningsRatioTTM'];
        const PBR_FIELDS = ['priceToBookRatio', 'priceBookValueRatio', 'pbRatio', 'pb',
                            'priceToBookValueRatio'];
        const peHistory = ratios.map(r => ({
            year: r.date ? r.date.substring(0, 4) : (r.calendarYear || '?'),
            pe:  pickField(r, ...PE_FIELDS),
            pbr: pickField(r, ...PBR_FIELDS),
        })).filter(r => r.pe !== null && isFinite(r.pe));

        if (peHistory.length < 3) {
            // 診斷：把 ratios[0] 的所有 keys 列出，讓你一眼看到 FMP 實際用什麼欄位名
            const firstKeys = ratios[0] ? Object.keys(ratios[0]).join(', ') : '(空)';
            throw new Error(
                `${ticker} 歷年 PE 樣本不足（只 ${peHistory.length} 筆有 PE，實抓 ${ratios.length} 筆 ratios）。` +
                `可能 FMP 新版欄位名又改了 or 免費 tier 沒開這端點。` +
                `\n第一筆 ratios[0] 有的欄位：${firstKeys}` +
                `\n→ 把上面欄位名回報給我加進 pickField，或跑 GitHub Actions dump-api-schemas → FMP → /ratios 章節看實際欄位`
            );
        }

        // 只保留要求的年數（FMP 回傳從新到舊）
        const sliced = peHistory.slice(0, years);
        // 反轉：改成舊到新方便繪圖
        sliced.reverse();

        // 當前 PE：quote → ratios[0]
        // 不走 price/eps fallback —— 對 ADR（TSM 這種）price 是 USD、eps 是 TWD，除下去是垃圾
        let currentPE = pickField(q, 'pe', 'peRatio', 'priceToEarningsRatio');
        if (!currentPE) currentPE = pickField(ratios[0] || {}, ...PE_FIELDS);

        // 當前 PBR：用最新一筆 ratio（ratios[0] 是最新的年報）
        let currentPBR = pickField(ratios[0] || {}, ...PBR_FIELDS);

        // Feature B · 把 FMP balance sheet snapshot attach 到 fundamentals（跟 TW 對齊）
        const fmpBalanceSheet = bsR.ok ? bsR.value : null;
        if (fundamentals && fmpBalanceSheet) {
            fundamentals.balanceSheetSnapshot = fmpBalanceSheet;
        }

        // Feature · 內部人持股變化 + 配息歷史 + 13F 機構持股 attach 到 fundamentals
        if (fundamentals && insiderR.ok && insiderR.value) fundamentals.insiderTrading = insiderR.value;
        if (fundamentals && divR.ok && divR.value) fundamentals.dividendHistory = divR.value;
        if (fundamentals && instOwnR.ok && instOwnR.value) fundamentals.institutionalOwnership = instOwnR.value;

        // 診斷：把選配 endpoint 的狀態存起來 · 讓 render 層顯示「資料狀態」panel
        const optionalStatus = [
            { name: '報價', key: 'quote', ok: quoteR.ok, err: quoteR.error, hasData: quoteR.ok },
            { name: '公司資料', key: 'profile', ok: profileR.ok, err: profileR.error, hasData: profileR.ok },
            { name: '歷年 ratio', key: 'ratios', ok: ratiosR.ok, err: ratiosR.error, hasData: ratiosR.ok },
            { name: '損益表', key: 'income', ok: fundR.ok, err: fundR.error, hasData: fundR.ok && !!fundR.value },
            { name: '現金流表', key: 'cf', ok: cfR.ok, err: cfR.error, hasData: cfR.ok && !!cfR.value },
            { name: '資產負債表', key: 'bs', ok: bsR.ok, err: bsR.error, hasData: bsR.ok && !!bsR.value },
            { name: '內部人交易', key: 'insider', ok: insiderR.ok, err: insiderR.error, hasData: insiderR.ok && !!insiderR.value },
            { name: '配息歷史', key: 'dividends', ok: divR.ok, err: divR.error, hasData: divR.ok && !!divR.value },
            { name: '13F 機構持股', key: 'inst-own', ok: instOwnR.ok, err: instOwnR.error, hasData: instOwnR.ok && !!instOwnR.value },
        ];

        // Feature · 庫藏股：從 FMP cash flow 的 commonStockRepurchased 依年 aggregate
        // FMP 的 quarterly cash flow 有 raw · 但 fetchFmpCashFlow 只回 opCF/FCF/NI/SBC
        // 用另一支 API call 專門抓 raw cash flow 就好 · 只算庫藏股
        try {
            const cfRaw = await fmpFetch(`/cash-flow-statement?symbol=${ticker}&period=quarter`, apiKey);
            if (Array.isArray(cfRaw) && cfRaw.length > 0 && fundamentals) {
                const byYear = new Map();
                cfRaw.forEach(r => {
                    const y = (r.date || '').slice(0, 4);
                    if (!y) return;
                    const buyback = r.commonStockRepurchased || 0;   // 負值 = 買回
                    byYear.set(y, (byYear.get(y) || 0) + buyback);
                });
                fundamentals.buybackHistory = Array.from(byYear.entries())
                    .map(([year, amount]) => ({ year, amount: Math.abs(amount) }))
                    .sort((a, b) => b.year.localeCompare(a.year))
                    .slice(0, 10);
            }
        } catch (_) {}

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
            institutional: null,
            fmpEndpointStatus: optionalStatus,
        };
    }

    // ---------- Percentile / Statistics ----------
    function percentileOf(value, sortedArray) {
        // Midrank formula：value == 某樣本時，該筆各半算 below / above
        //   → value == median → percentile ≈ 50%（統計慣例，不像 strict-below 會算成 40%）
        // 用意：AMD 這種小樣本（FMP 5 筆）· current PE 直接來自 ratios[0] →
        //       current 剛好等於某筆 · 之前 `v < value` 排除掉 ties → 百分位失真 20pp
        // 對大樣本（2330 每日 4920 筆）幾乎沒差 · 對小樣本差別顯著
        if (!sortedArray.length) return null;
        // FP epsilon：金融比率經常「數學相等但 float 差 ULP」
        const eps = Math.max(Math.abs(value) * 1e-9, 1e-12);
        let below = 0, equal = 0;
        for (const v of sortedArray) {
            if (v < value - eps) below += 1;
            else if (Math.abs(v - value) <= eps) equal += 1;
        }
        return (below + 0.5 * equal) / sortedArray.length;
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

    // ---------- Phase 7 · 6 軸估值雷達 ----------
    // 6 軸絕對值 → 0-100 分映射（線性內插）
    // - 正向指標（越大越好）：ROE / 營收 YoY / 毛利率 / 殖利率
    // - 反向指標（越小越好）：PE / PB · 用 scoreInverse
    function scoreLinear(val, min0, mid50, max100) {
        if (val === null || val === undefined || !isFinite(val)) return null;
        if (val <= min0) return 0;
        if (val >= max100) return 100;
        if (val <= mid50) return 50 * (val - min0) / (mid50 - min0);
        return 50 + 50 * (val - mid50) / (max100 - mid50);
    }
    function scoreInverse(val, high0, mid50, low100) {
        if (val === null || val === undefined || !isFinite(val)) return null;
        if (val >= high0) return 0;
        if (val <= low100) return 100;
        if (val >= mid50) return 50 * (high0 - val) / (high0 - mid50);
        return 50 + 50 * (mid50 - val) / (mid50 - low100);
    }

    // ============================================================
    // 成長股六軸（跟價值派邏輯完全不同）
    // 核心哲學：問「成長有沒有兌現 + 估值跟成長匹不匹配」·
    //          不問「便宜不便宜」
    // ============================================================
    function computeGrowthAxisScores(analysis) {
        const fund = analysis.fundamentals || {};
        const cf = analysis.cashFlow || {};

        // === 1. PEG（用 trailing EPS YoY 算 · 剔除一次性視 spec 未明 · 先用表面 YoY）
        let peg = null;
        const currentPE = analysis.currentPE;
        const latestEps = fund.eps && fund.eps[0];
        if (currentPE && isFinite(currentPE) && currentPE > 0
            && latestEps && latestEps.mode === 'YoY' && latestEps.yoy !== null && isFinite(latestEps.yoy) && latestEps.yoy > 0.03) {
            const growthPct = latestEps.yoy * 100;
            peg = currentPE / growthPct;
        }

        // === 2. 營收持續性（近 4 季 YoY 都要正 · 且加速中）
        // 得分邏輯：
        //   4 季全正 + 加速中 → 100
        //   4 季全正但持平/減速 → 60-80
        //   任一季轉負 → 大幅扣分
        let revPersistence = null;
        if (fund.revenue && fund.revenue.length >= 4) {
            const yoys = fund.revenue.slice(0, 4).map(e => e.yoy).filter(v => v !== null && isFinite(v));
            if (yoys.length === 4) {
                const allPositive = yoys.every(v => v > 0);
                if (!allPositive) {
                    // 有一季轉負 · 但看嚴重程度
                    const negCount = yoys.filter(v => v <= 0).length;
                    revPersistence = Math.max(0, 40 - negCount * 15);   // 1 負 25 · 2 負 10 · 3+ 0
                } else {
                    // 全正 · 看是否加速（0 是最新季 · 3 是最舊季）
                    const isAccelerating = yoys[0] >= yoys[1] && yoys[1] >= yoys[2];
                    const avgYoy = yoys.reduce((a, b) => a + b, 0) / 4 * 100;
                    // 平均成長率映射（≥20% 拿滿分）
                    let base = Math.min(100, avgYoy / 20 * 100);
                    // 加速的話全給滿 · 減速扣 20 分
                    if (!isAccelerating) base *= 0.8;
                    revPersistence = base;
                }
            }
        }

        // === 3. 毛利率趨勢（OLS 斜率 · 拉到 8 季 · 抗 outlier）
        // Bug 修：舊版用 margins[0] vs margins[3] 兩個端點 · 遇單季 outlier 就翻轉判讀
        //   e.g. 2360 · 8 季 59.2→...→62.6（實際上升）· 但 4 季前剛好 65.4 outlier
        //   endpoint slope = -0.93pp/Q「下滑」→ 22 分 ❌
        //   OLS 8 季 slope = +0.47pp/Q「上升」→ 75 分 ✅
        let grossMarginTrend = null;
        let grossMarginSlopePpQtr = null;
        if (fund.grossMargin && fund.grossMargin.length >= 4) {
            const N = Math.min(8, fund.grossMargin.length);
            const margins = fund.grossMargin.slice(0, N).map(e => e.value).filter(v => v !== null && isFinite(v));
            if (margins.length >= 4) {
                // 最小平方法：margins[0] 最新 · 反轉成舊→新 · x=0 最舊
                const ys = margins.slice().reverse();
                const n = ys.length;
                const xMean = (n - 1) / 2;
                const yMean = ys.reduce((a, b) => a + b, 0) / n;
                let num = 0, den = 0;
                for (let i = 0; i < n; i++) {
                    num += (i - xMean) * (ys[i] - yMean);
                    den += (i - xMean) ** 2;
                }
                const slope = den > 0 ? num / den : 0;   // decimal 形式：0.01 = 1pp/Q
                grossMarginSlopePpQtr = slope * 100;
                const latestMargin = margins[0] * 100;
                if (latestMargin >= 50 && Math.abs(slope) < 0.005) {
                    grossMarginTrend = 75;
                } else if (slope > 0.005) {
                    grossMarginTrend = Math.min(100, 60 + slope * 4000);
                } else if (slope < -0.01) {
                    grossMarginTrend = Math.max(0, 30 + slope * 3000);
                } else {
                    grossMarginTrend = 50 + slope * 3000;
                }
                grossMarginTrend = Math.max(0, Math.min(100, grossMarginTrend));
            }
        }

        // === 4. FCF 轉換率（TTM FCF / TTM 淨利）
        // 滿分 ≥ 80% · 為負大幅扣分
        let fcfConversion = null, fcfConversionRaw = null;
        if (cf.freeCF && cf.netIncome && cf.freeCF.length >= 4 && cf.netIncome.length >= 4) {
            const fcfTtm = cf.freeCF.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            const niTtm = cf.netIncome.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            if (Math.abs(niTtm) > 1e6) {
                fcfConversionRaw = fcfTtm / niTtm * 100;   // %
                if (fcfConversionRaw >= 80) fcfConversion = 100;
                else if (fcfConversionRaw >= 50) fcfConversion = 50 + (fcfConversionRaw - 50) / 30 * 50;
                else if (fcfConversionRaw >= 0) fcfConversion = fcfConversionRaw;
                else fcfConversion = Math.max(0, 20 + fcfConversionRaw / 2);   // 負值嚴扣
            }
        }

        // === 5. SBC 稀釋（TTM SBC / TTM GAAP 淨利）· FMP only
        // 滿分 < 10% · > 35% 大幅扣分
        let sbcDilution = null, sbcDilutionRaw = null;
        if (cf.sbc && cf.netIncome && cf.sbc.length >= 4) {
            const sbcTtm = cf.sbc.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            const niTtm = cf.netIncome.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            if (sbcTtm > 0 && niTtm > 0) {
                sbcDilutionRaw = sbcTtm / niTtm * 100;
                // 反向映射：SBC 比例低分數高
                if (sbcDilutionRaw <= 10) sbcDilution = 100;
                else if (sbcDilutionRaw <= 20) sbcDilution = 100 - (sbcDilutionRaw - 10) * 3;   // 70-100
                else if (sbcDilutionRaw <= 35) sbcDilution = 70 - (sbcDilutionRaw - 20) * 3;    // 25-70
                else sbcDilution = Math.max(0, 25 - (sbcDilutionRaw - 35) * 0.7);
            }
        }

        // === 6. Rule of 40（營收成長 % + FCF margin %）
        // 滿分 ≥ 60
        let ruleOf40 = null, ruleOf40Raw = null;
        if (fund.revenue && fund.revenue[0] && fund.revenue[0].yoy !== null && isFinite(fund.revenue[0].yoy)
            && cf.freeCF && cf.freeCF.length >= 4) {
            const revGrowthPct = fund.revenue[0].yoy * 100;
            const fcfTtm = cf.freeCF.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            const revTtm = fund.revenue.slice(0, 4).reduce((a, e) => a + (e.value || 0), 0);
            if (revTtm > 0) {
                const fcfMarginPct = fcfTtm / revTtm * 100;
                ruleOf40Raw = revGrowthPct + fcfMarginPct;
                if (ruleOf40Raw >= 60) ruleOf40 = 100;
                else if (ruleOf40Raw >= 40) ruleOf40 = 60 + (ruleOf40Raw - 40) * 2;   // 60-100
                else if (ruleOf40Raw >= 20) ruleOf40 = 30 + (ruleOf40Raw - 20) * 1.5; // 30-60
                else if (ruleOf40Raw >= 0) ruleOf40 = ruleOf40Raw * 1.5;              // 0-30
                else ruleOf40 = 0;
            }
        }

        // PEG 分數（低越好）· ≤ 1.0 滿分 · > 3 為 0
        let pegScore = null;
        if (peg !== null && isFinite(peg) && peg > 0) {
            if (peg <= 1.0) pegScore = 100;
            else if (peg <= 2.0) pegScore = 100 - (peg - 1.0) * 40;
            else if (peg <= 3.0) pegScore = 60 - (peg - 2.0) * 60;
            else pegScore = 0;
        }

        // Feature 2 · PEG 多年 CAGR 對照（抵抗低基期效應）
        // 單季 YoY 遇低基期會爆表 · CAGR 用 TTM EPS vs N 年前 TTM EPS 算 · 訊號更誠實
        let pegCagr1y = null, pegCagr2y = null, pegCagr3y = null;
        let cagr1yPct = null, cagr2yPct = null, cagr3yPct = null;
        if (currentPE && isFinite(currentPE) && currentPE > 0 && fund.eps && fund.eps.length >= 8) {
            const validEps = fund.eps.filter(e => e.value !== null && isFinite(e.value));
            const ttmSum = arr => arr.reduce((s, e) => s + e.value, 0);
            if (validEps.length >= 8) {
                const ttmNow = ttmSum(validEps.slice(0, 4));
                // 1Y CAGR: TTM_now vs TTM_1Y_ago（8 季 · 大部分股票都算得出）
                const ttm1yAgo = ttmSum(validEps.slice(4, 8));
                if (ttm1yAgo > 0 && ttmNow > 0) {
                    cagr1yPct = (ttmNow / ttm1yAgo - 1) * 100;
                    if (cagr1yPct > 3) pegCagr1y = currentPE / cagr1yPct;
                }
                if (validEps.length >= 12) {
                    const ttm2yAgo = ttmSum(validEps.slice(8, 12));
                    if (ttm2yAgo > 0 && ttmNow > 0) {
                        cagr2yPct = (Math.pow(ttmNow / ttm2yAgo, 1/2) - 1) * 100;
                        if (cagr2yPct > 3) pegCagr2y = currentPE / cagr2yPct;
                    }
                }
                if (validEps.length >= 16) {
                    const ttm3yAgo = ttmSum(validEps.slice(12, 16));
                    if (ttm3yAgo > 0 && ttmNow > 0) {
                        cagr3yPct = (Math.pow(ttmNow / ttm3yAgo, 1/3) - 1) * 100;
                        if (cagr3yPct > 3) pegCagr3y = currentPE / cagr3yPct;
                    }
                }
            }
        }

        // 低基期扭曲偵測：優先 3Y CAGR · 沒有就 fallback 到 2Y / 1Y
        // 若 CAGR-based PEG 比 1Y YoY 版 PEG 貴 40%+ = 最新單季 YoY 是低基期反彈放大
        let pegBaseDistortion = null;
        const cagrRef = pegCagr3y || pegCagr2y || pegCagr1y;
        const cagrGrowthRef = cagr3yPct || cagr2yPct || cagr1yPct;
        const cagrLabel = pegCagr3y ? '3Y CAGR' : pegCagr2y ? '2Y CAGR' : '1Y TTM-CAGR';
        if (peg !== null && cagrRef !== null) {
            const distortionRatio = cagrRef / peg;
            if (distortionRatio > 1.4) {
                pegBaseDistortion = { peg1y: peg, pegCagr: cagrRef, cagrGrowth: cagrGrowthRef, cagrLabel, ratio: distortionRatio };
            }
        }

        const scores = {
            peg: pegScore,
            revPersistence,
            grossMarginTrend,
            fcfConversion,
            sbcDilution,
            ruleOf40,
        };
        const raw = {
            peg,
            revPersistence: fund.revenue && fund.revenue[0] ? fund.revenue[0].yoy * 100 : null,
            grossMarginTrend: fund.grossMargin && fund.grossMargin[0] ? fund.grossMargin[0].value * 100 : null,
            grossMarginSlope: grossMarginSlopePpQtr,
            fcfConversion: fcfConversionRaw,
            sbcDilution: sbcDilutionRaw,
            ruleOf40: ruleOf40Raw,
            // Feature 2 · PEG CAGR 對照
            pegCagr1y, pegCagr2y, pegCagr3y,
            cagr1yPct, cagr2yPct, cagr3yPct,
            pegBaseDistortion,
        };
        return { scores, raw };
    }

    function renderGrowthRadarSvg(analysis) {
        const { scores, raw } = computeGrowthAxisScores(analysis);
        const cx = 210, cy = 200, r = 130;
        const axes = [
            { key: 'peg',              label: 'PEG', unit: '×', decimals: 2, mapping: '≤1 滿分 · >3 為 0' },
            { key: 'revPersistence',   label: '營收持續', unit: '% (最新 YoY)', decimals: 1, mapping: '近 4 季全正+加速→100' },
            { key: 'grossMarginTrend', label: '毛利趨勢', unit: '% (最新)', decimals: 1, mapping: '8Q OLS 斜率上升→100 · 下滑→扣' },
            { key: 'fcfConversion',    label: 'FCF/淨利', unit: '%', decimals: 0, mapping: '≥80% 滿分 · 負值嚴扣' },
            { key: 'sbcDilution',      label: 'SBC 稀釋', unit: '% (低越好)', decimals: 1, mapping: '<10% 滿分 · >35% 嚴扣' },
            { key: 'ruleOf40',         label: 'Rule of 40', unit: '', decimals: 0, mapping: '營收+FCF margin ≥60 滿分' },
        ];

        const angle = i => (Math.PI * 2 / axes.length) * i - Math.PI / 2;

        const gridRings = [25, 50, 75, 100].map(pct => {
            const pts = axes.map((_, i) => {
                const ang = angle(i);
                const x = cx + Math.cos(ang) * r * (pct / 100);
                const y = cy + Math.sin(ang) * r * (pct / 100);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            const opa = pct === 100 ? '0.7' : '0.35';
            return `<polygon points="${pts}" fill="none" stroke="#c4b5fd" stroke-width="1" opacity="${opa}"/>`;
        }).join('\n');

        const axisLines = axes.map((_, i) => {
            const ang = angle(i);
            const x = cx + Math.cos(ang) * r;
            const y = cy + Math.sin(ang) * r;
            return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#c4b5fd" stroke-width="1" opacity="0.5"/>`;
        }).join('\n');

        const dataPoints = axes.map((a, i) => {
            const s = scores[a.key];
            const ang = angle(i);
            const dist = (s === null || s === undefined) ? 0 : (s / 100);
            const x = cx + Math.cos(ang) * r * dist;
            const y = cy + Math.sin(ang) * r * dist;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        const dataDots = axes.map((a, i) => {
            const s = scores[a.key];
            if (s === null || s === undefined) return '';
            const ang = angle(i);
            const x = cx + Math.cos(ang) * r * (s / 100);
            const y = cy + Math.sin(ang) * r * (s / 100);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#8b5cf6" stroke="#fff" stroke-width="1.5"/>`;
        }).join('\n');

        const labels = axes.map((a, i) => {
            const ang = angle(i);
            const lx = cx + Math.cos(ang) * (r + 32);
            const ly = cy + Math.sin(ang) * (r + 32);
            const rawVal = raw[a.key];
            let rawStr = (rawVal === null || !isFinite(rawVal)) ? 'N/A' : (a.decimals === 0 ? Math.round(rawVal) : rawVal.toFixed(a.decimals));
            const s = scores[a.key];
            const scoreStr = (s === null || s === undefined) ? 'N/A' : Math.round(s) + '分';
            const scoreColor = s === null ? '#9ca3af' : (s >= 70 ? '#059669' : s >= 40 ? '#d97706' : '#dc2626');
            return `
                <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">${a.label}</text>
                <text x="${lx.toFixed(1)}" y="${(ly + 14).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#64748b">${rawStr}${a.unit}</text>
                <text x="${lx.toFixed(1)}" y="${(ly + 26).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${scoreColor}">${scoreStr}</text>
            `;
        }).join('\n');

        const legendHtml = axes.map(a => {
            const s = scores[a.key];
            const rawVal = raw[a.key];
            let rawStr = (rawVal === null || !isFinite(rawVal)) ? 'N/A' : (a.decimals === 0 ? Math.round(rawVal) : rawVal.toFixed(a.decimals));
            let unitStr = a.unit;
            if (a.key === 'grossMarginTrend' && raw.grossMarginSlope !== null && isFinite(raw.grossMarginSlope)) {
                const sign = raw.grossMarginSlope >= 0 ? '+' : '';
                unitStr = `${a.unit} · 斜率 ${sign}${raw.grossMarginSlope.toFixed(2)}pp/Q`;
            }
            // Feature 2 · PEG 附 CAGR 對照
            if (a.key === 'peg') {
                const parts = [];
                if (raw.pegCagr1y !== null) parts.push(`1Y CAGR 版 ${raw.pegCagr1y.toFixed(2)}×`);
                if (raw.pegCagr2y !== null) parts.push(`2Y CAGR 版 ${raw.pegCagr2y.toFixed(2)}×`);
                if (raw.pegCagr3y !== null) parts.push(`3Y CAGR 版 ${raw.pegCagr3y.toFixed(2)}×`);
                if (parts.length > 0) unitStr = `${a.unit} · ${parts.join(' / ')}`;
            }
            const scoreStr = (s === null || s === undefined) ? '—' : Math.round(s);
            const clsScore = s === null ? '' : (s >= 70 ? 'axis-good' : s >= 40 ? 'axis-mid' : 'axis-poor');
            return `<tr>
                <td><b>${a.label}</b></td>
                <td>${rawStr}${unitStr}</td>
                <td class="${clsScore}">${scoreStr}分</td>
                <td class="hint-mini">${a.mapping}</td>
            </tr>`;
        }).join('');

        // Feature 2 · PEG 低基期扭曲警訊
        let pegDistortionBanner = '';
        if (raw.pegBaseDistortion) {
            const d = raw.pegBaseDistortion;
            pegDistortionBanner = `<div class="peg-distortion-banner">
                ⚠️ <b>PEG 低基期扭曲</b>：單季 YoY 版 PEG <b>${d.peg1y.toFixed(2)}×</b> 看起來很便宜 · 但用 <b>${d.cagrLabel}</b>（${d.cagrGrowth.toFixed(0)}%/年）算的 PEG 是 <b>${d.pegCagr.toFixed(2)}×</b> · 貴 ${((d.ratio - 1) * 100).toFixed(0)}%。代表最新單季 YoY 是靠低基期反彈放大 · <b>PEG 這軸的滿分可能是假象</b> · 用 CAGR 版重估更誠實。
            </div>`;
        }

        const validScores = Object.values(scores).filter(s => s !== null && s !== undefined);
        const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;
        const avgStr = avgScore === null ? 'N/A' : Math.round(avgScore);
        const avgVerdict = avgScore === null ? ''
            : avgScore >= 70 ? '🟢 成長股標準模範生 · 成長兌現且品質紮實'
            : avgScore >= 50 ? '🟡 部分軸強 · 部分軸弱 · 常見的「賭成長」型公司'
            : avgScore >= 30 ? '🟠 成長訊號混雜 · 至少一個核心指標不佳（PEG 太高 · FCF 弱 · SBC 稀釋大）'
            : '🔴 成長論述站不住腳 · 多個核心指標都有問題';

        const isTwSource = analysis.source === 'FinMind';
        const sbcNote = isTwSource
            ? `<div class="hint-mini" style="color:#7c3aed;margin-top:6px">📌 台股 SBC 通常沒揭露那麼細（IFRS 常 embedded 在人事費用內）· 這軸顯示 N/A · 不影響其他 5 軸判讀</div>`
            : '';

        return `
            <section class="panel radar-panel radar-panel-growth" id="radar-panel-growth">
                <h2>🚀 6 軸成長股雷達 <span class="radar-lens-tag lens-growth">成長派標準</span></h2>
                <p class="hint">問「<b>成長有沒有兌現、估值跟成長速度合不合理</b>」· 不問「便宜不便宜」。適合評估 AI / SaaS / 半導體 / 平台股。</p>
                <div class="radar-warning radar-warning-growth">
                    <div class="radar-warning-title">💡 這張雷達適合什麼</div>
                    <div class="radar-warning-body">
                        本圖用「<b>成長性 + 估值合理性 + 品質</b>」評分 · 直接對應我們一路討論的 PEG（AMD）· FCF 背離（GOOGL）· SBC 稀釋（AMD）· Rule of 40（SaaS 標準）等概念。
                        <ul>
                            <li>✅ <b>適合</b>：成長股 / 科技股 / AI / 半導體 / SaaS · 這類公司在傳統雷達會全趴 · 但這裡能看出「成長品質」</li>
                            <li>⚠️ <b>PEG</b> 用最新單季 EPS YoY 算 · 若 YoY 是低基期反彈（NVDA 2024 情境）· PEG 會顯著失真 · 上方 verdict 有標警訊</li>
                            <li>⚠️ <b>SBC 軸</b> FMP 有 · FinMind 通常 N/A（台股 IFRS embedded in 人事費用）</li>
                        </ul>
                    </div>
                </div>
                <div class="radar-wrapper">
                    <svg viewBox="0 0 420 400" width="100%" style="max-width:520px" xmlns="http://www.w3.org/2000/svg">
                        ${gridRings}
                        ${axisLines}
                        <polygon points="${dataPoints}" fill="rgba(139, 92, 246, 0.35)" stroke="#8b5cf6" stroke-width="2.5" stroke-linejoin="round"/>
                        ${dataDots}
                        ${labels}
                    </svg>
                </div>
                <div class="radar-summary">
                    <div class="radar-avg radar-avg-growth">
                        <div class="radar-avg-label">綜合分數（有效軸平均）</div>
                        <div class="radar-avg-value">${avgStr}<span class="radar-avg-suffix">/100</span></div>
                        <div class="radar-avg-verdict">${avgVerdict}</div>
                    </div>
                </div>
                ${pegDistortionBanner}
                <details class="radar-details">
                    <summary>🔍 詳細分數對照</summary>
                    <table class="radar-table">
                        <thead><tr><th>指標</th><th>值</th><th>分數</th><th>映射邏輯</th></tr></thead>
                        <tbody>${legendHtml}</tbody>
                    </table>
                    ${sbcNote}
                </details>
            </section>
        `;
    }

    function computeSixAxisScores(analysis) {
        const fund = analysis.fundamentals || {};
        const latestRev = fund.revenue && fund.revenue[0];
        const latestMargin = fund.grossMargin && fund.grossMargin[0];

        const raw = {
            roe: analysis.roe !== null && analysis.roe !== undefined ? analysis.roe : null,
            revYoY: (latestRev && latestRev.yoy !== null && isFinite(latestRev.yoy)) ? latestRev.yoy * 100 : null,
            grossMargin: (latestMargin && latestMargin.value !== null && isFinite(latestMargin.value)) ? latestMargin.value * 100 : null,
            dividendYield: analysis.dividendYield !== null && analysis.dividendYield !== undefined ? analysis.dividendYield : null,
            pb: analysis.currentPBR !== null && isFinite(analysis.currentPBR) ? analysis.currentPBR : null,
            pe: analysis.currentPE !== null && isFinite(analysis.currentPE) ? analysis.currentPE : null,
        };

        const scores = {
            roe: scoreLinear(raw.roe, 0, 12, 25),
            revYoY: scoreLinear(raw.revYoY, -20, 5, 25),
            grossMargin: scoreLinear(raw.grossMargin, 10, 30, 50),
            dividendYield: scoreLinear(raw.dividendYield, 0, 3, 6),
            pb: scoreInverse(raw.pb, 5, 2, 0.8),
            pe: scoreInverse(raw.pe, 50, 20, 10),
        };

        return { scores, raw };
    }

    function renderRadarSvg(analysis) {
        const { scores, raw } = computeSixAxisScores(analysis);
        const cx = 210, cy = 200, r = 130;
        // 6 軸順時針排列 · 從正上方開始
        const axes = [
            { key: 'roe',           label: 'ROE',      unit: '%',  decimals: 1, mapping: '0/12/25' },
            { key: 'revYoY',        label: '營收 YoY',  unit: '%',  decimals: 1, mapping: '-20/5/25' },
            { key: 'grossMargin',   label: '毛利率',    unit: '%',  decimals: 1, mapping: '10/30/50' },
            { key: 'dividendYield', label: '殖利率',    unit: '%',  decimals: 2, mapping: '0/3/6' },
            { key: 'pb',            label: 'PB',       unit: '×',  decimals: 2, mapping: '5/2/0.8（低）' },
            { key: 'pe',            label: 'PE',       unit: '×',  decimals: 1, mapping: '50/20/10（低）' },
        ];

        const angle = i => (Math.PI * 2 / axes.length) * i - Math.PI / 2;

        // 4 層同心六邊形網格（25/50/75/100）
        const gridRings = [25, 50, 75, 100].map(pct => {
            const pts = axes.map((_, i) => {
                const ang = angle(i);
                const x = cx + Math.cos(ang) * r * (pct / 100);
                const y = cy + Math.sin(ang) * r * (pct / 100);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            const opa = pct === 100 ? '0.7' : '0.35';
            return `<polygon points="${pts}" fill="none" stroke="#cbd5e1" stroke-width="1" opacity="${opa}"/>`;
        }).join('\n');

        // 6 條軸線
        const axisLines = axes.map((_, i) => {
            const ang = angle(i);
            const x = cx + Math.cos(ang) * r;
            const y = cy + Math.sin(ang) * r;
            return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" opacity="0.5"/>`;
        }).join('\n');

        // 資料多邊形 · 缺值用 0 分頂點（往中心塌）
        const dataPoints = axes.map((a, i) => {
            const s = scores[a.key];
            const ang = angle(i);
            const dist = (s === null || s === undefined) ? 0 : (s / 100);
            const x = cx + Math.cos(ang) * r * dist;
            const y = cy + Math.sin(ang) * r * dist;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        // 資料點
        const dataDots = axes.map((a, i) => {
            const s = scores[a.key];
            if (s === null || s === undefined) return '';
            const ang = angle(i);
            const x = cx + Math.cos(ang) * r * (s / 100);
            const y = cy + Math.sin(ang) * r * (s / 100);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>`;
        }).join('\n');

        // 軸標籤 + 數值
        const labels = axes.map((a, i) => {
            const ang = angle(i);
            const lx = cx + Math.cos(ang) * (r + 32);
            const ly = cy + Math.sin(ang) * (r + 32);
            const rawVal = raw[a.key];
            const rawStr = (rawVal === null || !isFinite(rawVal)) ? '—' : (a.decimals === 0 ? Math.round(rawVal) : rawVal.toFixed(a.decimals));
            const s = scores[a.key];
            const scoreStr = (s === null || s === undefined) ? 'N/A' : Math.round(s) + '分';
            const scoreColor = s === null ? '#9ca3af' : (s >= 70 ? '#059669' : s >= 40 ? '#d97706' : '#dc2626');
            return `
                <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">${a.label}</text>
                <text x="${lx.toFixed(1)}" y="${(ly + 14).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#64748b">${rawStr}${a.unit}</text>
                <text x="${lx.toFixed(1)}" y="${(ly + 26).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${scoreColor}">${scoreStr}</text>
            `;
        }).join('\n');

        // 分數對照表（下方 · 說明每軸怎麼判讀）
        const legendHtml = axes.map(a => {
            const s = scores[a.key];
            const rawVal = raw[a.key];
            const rawStr = (rawVal === null || !isFinite(rawVal)) ? 'N/A' : (a.decimals === 0 ? Math.round(rawVal) : rawVal.toFixed(a.decimals));
            const scoreStr = (s === null || s === undefined) ? '—' : Math.round(s);
            const clsScore = s === null ? '' : (s >= 70 ? 'axis-good' : s >= 40 ? 'axis-mid' : 'axis-poor');
            return `<tr>
                <td><b>${a.label}</b></td>
                <td>${rawStr}${a.unit}</td>
                <td class="${clsScore}">${scoreStr}分</td>
                <td class="hint-mini">0/50/100 = ${a.mapping}</td>
            </tr>`;
        }).join('');

        // 平均分（六角形飽滿度）· null 不算
        const validScores = Object.values(scores).filter(s => s !== null && s !== undefined);
        const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;
        const avgStr = avgScore === null ? 'N/A' : Math.round(avgScore);
        const avgVerdict = avgScore === null ? ''
            : avgScore >= 70 ? '🟢 六角形飽滿 · 均衡優質'
            : avgScore >= 50 ? '🟡 有些軸強 · 有些軸弱 · 混合型公司'
            : avgScore >= 30 ? '🟠 傳統標準下短板明顯 · <b>若是成長股/AI/半導體 · 這種形狀常見</b> · 需搭配 PEG / 產業對照'
            : '🔴 傳統標準幾乎不過關 · 若非成長股 · 體質確有疑慮';

        // ROE breakdown
        let roeHint = '';
        if (analysis.roeBreakdown) {
            const b = analysis.roeBreakdown;
            const niStr = (b.ttmNetIncome / 1e8).toFixed(1) + '億';
            const eqStr = (b.equity / 1e8).toFixed(1) + '億';
            roeHint = `<span class="hint-mini">ROE 計算：TTM 淨利 ${niStr} / 最新期末權益 ${eqStr}（${b.equityDate}）· ${b.method}</span>`;
        }

        return `
            <section class="panel radar-panel" id="radar-panel">
                <h2>🎯 6 軸估值雷達 <span class="radar-lens-tag">傳統價值派標準</span></h2>
                <p class="hint">六角形越飽滿越好 · 分數用<b>絕對值</b>映射 · 不跟同業比 · 只看該指標的普世好壞。ROE 25% / 毛利 50% / 殖利率 6% / PE 10× / PB 0.8× / 營收 YoY 25% = 各軸滿分。</p>
                <div class="radar-warning">
                    <div class="radar-warning-title">⚠️ 這張雷達適合什麼 · 不適合什麼</div>
                    <div class="radar-warning-body">
                        本圖用「<b>普世絕對值</b>」評分 · 對<b>高成長股（AI / 半導體 / 平台股）天生不利</b>——這類公司通常 PE / PB 遠高於 10× / 0.8× 的傳統基準 · 但若成長能兌現 · 高 PE 不必然代表「貴」。
                        <ul>
                            <li>✅ <b>適合回答</b>：這家公司是不是<b>傳統價值股的標準模範生</b>（低估值、高股息、高 ROE 三者兼得）</li>
                            <li>❌ <b>不適合單獨用來判斷</b>：成長股 / 科技股「貴或便宜」——後者要搭配上方的<b>歷史百分位</b>、<b>PEG</b>、<b>Zacks 產業對照</b>一起看</li>
                            <li>⚠️ <b>低分不等於壞公司</b>：AMD / NVDA / GOOGL 這類股票在這裡都會 40 分左右 · 因為評分標準跟他們的類別不匹配 · 不是因為體質差</li>
                        </ul>
                    </div>
                </div>
                <div class="radar-wrapper">
                    <svg viewBox="0 0 420 400" width="100%" style="max-width:520px" xmlns="http://www.w3.org/2000/svg">
                        ${gridRings}
                        ${axisLines}
                        <polygon points="${dataPoints}" fill="rgba(245, 158, 11, 0.35)" stroke="#f59e0b" stroke-width="2.5" stroke-linejoin="round"/>
                        ${dataDots}
                        ${labels}
                    </svg>
                </div>
                <div class="radar-summary">
                    <div class="radar-avg">
                        <div class="radar-avg-label">綜合分數（六軸平均）</div>
                        <div class="radar-avg-value">${avgStr}<span class="radar-avg-suffix">/100</span></div>
                        <div class="radar-avg-verdict">${avgVerdict}</div>
                    </div>
                </div>
                <details class="radar-details">
                    <summary>🔍 詳細分數對照</summary>
                    <table class="radar-table">
                        <thead><tr><th>指標</th><th>值</th><th>分數</th><th>映射</th></tr></thead>
                        <tbody>${legendHtml}</tbody>
                    </table>
                    ${roeHint}
                </details>
            </section>
        `;
    }

    // Phase 7.2 · 分數落差偵測 · 兩雷達綜合分數差異 ≥ 30 時提示「類型定位鮮明」
    function computeRadarAvg(scoreObj) {
        const vals = Object.values(scoreObj).filter(s => s !== null && s !== undefined);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    function detectFrameworkMismatch(analysis) {
        let valueAvg = null, growthAvg = null;
        try { valueAvg = computeRadarAvg(computeSixAxisScores(analysis).scores); } catch (e) {}
        try { growthAvg = computeRadarAvg(computeGrowthAxisScores(analysis).scores); } catch (e) {}
        if (valueAvg === null || growthAvg === null) return '';
        const v = Math.round(valueAvg), g = Math.round(growthAvg);
        const gap = Math.abs(g - v);
        if (gap < 30) return '';

        const growthLeans = g > v;
        const label = growthLeans ? '成長股' : '價值股';
        const otherLabel = growthLeans ? '傳統價值派' : '成長派';
        const lensClass = growthLeans ? 'mismatch-growth' : 'mismatch-value';

        return `
            <section class="panel radar-mismatch ${lensClass}">
                <div class="radar-mismatch-header">
                    <span class="radar-mismatch-icon">⚡</span>
                    <span class="radar-mismatch-title">兩種評分模式落差 ${gap} 分 · 類型定位鮮明</span>
                </div>
                <div class="radar-mismatch-body">
                    <div class="radar-mismatch-scores">
                        <span class="score-chip score-value">價值派 ${v} 分</span>
                        <span class="mismatch-arrow">↔</span>
                        <span class="score-chip score-growth">成長派 ${g} 分</span>
                    </div>
                    <p>
                        這 ${gap} 分的落差<b>不是任何一邊算錯</b>——是「用什麼判準衡量」這件事本身 · 決定了結論。
                        這支股票的類型定位偏向<b>純${label}</b> · 不能用<b>${otherLabel}</b>邏輯去期待它。
                        用<b>${label}</b>邏輯理解它會更準確 · 下方雷達也請主要看<b>${label}</b>那張。
                    </p>
                </div>
            </section>
        `;
    }

    // ---------- ETF 專屬 rendering ----------
    // 為什麼分開 renderResult：ETF 沒 PER/PBR · 個股 UI 的 stat card / heatmap / margin trend 都不 applicable
    //   共享的只有 header 骨架 · 其他全部重寫
    function renderEtf(etf) {
        const {
            ticker, stockName, price, change30d, priceData,
            dividends, last12MSum, last12MCount, estYield, frequency,
            inst60d, inst20d, instSeries,
            chipBuckets, chipLatestDate, whaleTrend,
            technical, risk, margin,
            activeHoldings,
        } = etf;
        // 從 CSV / JSON 進來的字串 · escape HTML 進 innerHTML 前防 XSS
        const escapeAttr = s => String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));

        $('result-panel').hidden = false;
        $('result-ticker').textContent = `${ticker} · ${stockName} · ETF`;

        // 個股 UI 隱藏（PE/PBR 佔位 · verdict · 兩張 histogram · detail-box）
        //   用 querySelectorAll 一次幹掉——不改 HTML · 個股模式下 renderResult 會 explicit 重新顯示
        //   注意：不能整個 result-panel children 掃 hidden · 因為 ETF panel 是 result-panel 的 child · 會被誤傷
        const panel = $('result-panel');
        panel.querySelectorAll('.result-grid, .sample-warn, .verdict-box, .chart-block, .detail-box').forEach(el => {
            el.hidden = true;
            el.style.display = 'none';   // 有些用 style.display 顯示 · hidden 沒用 · 雙保險
        });

        // 隱藏所有個股專屬 panel · 只留 ETF panel
        const hidePanels = ['fund-panel', 'monthly-metrics-panel', 'trajectory-panel', 'seasonality-panel',
                            'heatmap-panel', 'foreign-signal-panel', 'inst-panel', 'margin-panel',
                            'dividend-panel', 'insider-panel', 'inst-own-panel', 'table-panel',
                            'mismatch-panel', 'radar-panel', 'growth-radar-panel', 'cf-panel',
                            'drilldown-panel', 'balance-sheet-panel', 'fmp-status-panel',
                            'peer-panel', 'adr-panel', 'macro-panel'];
        hidePanels.forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });

        // 拿或建 ETF panel container
        let etfContainer = document.getElementById('etf-panel');
        if (!etfContainer) {
            etfContainer = document.createElement('div');
            etfContainer.id = 'etf-panel';
            etfContainer.className = 'panel etf-panel';
            $('result-panel').appendChild(etfContainer);
        }
        etfContainer.hidden = false;

        // Panel 1: Header 補充卡（現價 + 30d change + 3 個 KPI）
        const change30dHtml = change30d !== null
            ? `<span class="${change30d >= 0 ? 'chg-up' : 'chg-down'}">${change30d >= 0 ? '↑' : '↓'} ${Math.abs(change30d).toFixed(2)}%</span>`
            : '—';
        const headerHtml = `
            <div class="etf-header-card">
                <div class="etf-badge">ETF</div>
                <div class="etf-header-grid">
                    <div><div class="etf-kpi-label">現價</div><div class="etf-kpi-val">$${fmt(price, 2)}</div></div>
                    <div><div class="etf-kpi-label">近 30 天</div><div class="etf-kpi-val">${change30dHtml}</div></div>
                    <div><div class="etf-kpi-label">配息頻率</div><div class="etf-kpi-val">${frequency}</div></div>
                    <div><div class="etf-kpi-label">近 12M 配息</div><div class="etf-kpi-val">$${fmt(last12MSum, 2)}</div></div>
                    <div><div class="etf-kpi-label">估殖利率</div><div class="etf-kpi-val ${estYield && estYield >= 4 ? 'chg-up' : ''}">${estYield !== null ? estYield.toFixed(2) + '%' : '—'}</div></div>
                </div>
                <p class="hint hint-mini">💡 估殖利率 = 近 12 個月現金配息累計 ÷ 現價 · 只計現金配息 · 除息前後可能失真</p>
            </div>
        `;

        // Panel 1.5: 技術訊號（Tier 1-A · 該不該進場）
        const maCompare = (currentPrice, ma, label) => {
            if (ma === null) return `<span class="ma-cell"><b>${label}</b> —</span>`;
            const off = ((currentPrice - ma) / ma) * 100;
            const cls = off >= 0 ? 'chg-up' : 'chg-down';
            return `<span class="ma-cell"><b>${label}</b> $${fmt(ma, 2)} <span class="${cls}">${off >= 0 ? '+' : ''}${off.toFixed(2)}%</span></span>`;
        };
        const rsi = technical.rsi14;
        let rsiVerdict = '', rsiCls = '';
        if (rsi === null) { rsiVerdict = '—'; }
        else if (rsi >= 70) { rsiVerdict = `${rsi.toFixed(1)} · <b>超買</b>（追高風險）`; rsiCls = 'chg-down'; }
        else if (rsi <= 30) { rsiVerdict = `${rsi.toFixed(1)} · <b>超賣</b>（可能反彈）`; rsiCls = 'chg-up'; }
        else if (rsi >= 60) { rsiVerdict = `${rsi.toFixed(1)} · 偏強`; rsiCls = 'chg-up'; }
        else if (rsi <= 40) { rsiVerdict = `${rsi.toFixed(1)} · 偏弱`; rsiCls = 'chg-down'; }
        else rsiVerdict = `${rsi.toFixed(1)} · 中性`;
        const pctVerdict = technical.pricePct === null ? '—'
            : technical.pricePct >= 80 ? `<b class="chg-down">${technical.pricePct.toFixed(0)}%</b>（近 1 年高位）`
            : technical.pricePct <= 20 ? `<b class="chg-up">${technical.pricePct.toFixed(0)}%</b>（近 1 年低位）`
            : `${technical.pricePct.toFixed(0)}%`;
        const technicalPanelHtml = `
            <h3>📊 技術訊號（該不該進場）</h3>
            <div class="etf-tech-grid">
                <div class="etf-tech-cell">
                    <div class="etf-tech-label">現價 vs 均線</div>
                    <div class="etf-ma-row">
                        ${maCompare(price, technical.ma20, 'MA20')}
                        ${maCompare(price, technical.ma60, 'MA60')}
                        ${maCompare(price, technical.ma120, 'MA120')}
                    </div>
                </div>
                <div class="etf-tech-cell">
                    <div class="etf-tech-label">RSI 14</div>
                    <div class="etf-tech-val ${rsiCls}">${rsiVerdict}</div>
                </div>
                <div class="etf-tech-cell">
                    <div class="etf-tech-label">近 1 年價位百分位</div>
                    <div class="etf-tech-val">${pctVerdict}</div>
                </div>
            </div>
            <p class="hint hint-mini">💡 現價 &gt; MA120 = 中長期趨勢多方 · RSI &gt; 70 = 短期追高警訊 · 百分位 &gt; 80 = 近 1 年偏貴</p>
        `;

        // Panel 1.6: 風險指標（Tier 1-B · 心臟能扛多少）
        const volCls = risk.annualVol === null ? '' : risk.annualVol >= 30 ? 'chg-down' : risk.annualVol >= 20 ? '' : 'chg-up';
        const volLabel = risk.annualVol === null ? '—'
            : risk.annualVol >= 30 ? `${risk.annualVol.toFixed(1)}% · 高波動`
            : risk.annualVol >= 20 ? `${risk.annualVol.toFixed(1)}% · 中等`
            : `${risk.annualVol.toFixed(1)}% · 低波動`;
        const mddCls = risk.mdd1y === null ? '' : risk.mdd1y >= 25 ? 'chg-down' : '';
        const r1yCls = risk.return1y === null ? '' : risk.return1y >= 0 ? 'chg-up' : 'chg-down';
        const r3yCls = risk.return3y === null ? '' : risk.return3y >= 0 ? 'chg-up' : 'chg-down';
        const riskPanelHtml = `
            <h3>📉 風險 & 報酬（心臟能扛嗎）</h3>
            <div class="etf-risk-grid">
                <div class="etf-risk-cell">
                    <div class="etf-risk-label">年化波動</div>
                    <div class="etf-risk-val ${volCls}">${volLabel}</div>
                </div>
                <div class="etf-risk-cell">
                    <div class="etf-risk-label">近 1 年最大回檔</div>
                    <div class="etf-risk-val ${mddCls}">${risk.mdd1y !== null ? '-' + risk.mdd1y.toFixed(1) + '%' : '—'}</div>
                </div>
                <div class="etf-risk-cell">
                    <div class="etf-risk-label">近 1 年報酬</div>
                    <div class="etf-risk-val ${r1yCls}">${risk.return1y !== null ? (risk.return1y >= 0 ? '+' : '') + risk.return1y.toFixed(1) + '%' : '—'}</div>
                </div>
                <div class="etf-risk-cell">
                    <div class="etf-risk-label">近 3 年報酬</div>
                    <div class="etf-risk-val ${r3yCls}">${risk.return3y !== null ? (risk.return3y >= 0 ? '+' : '') + risk.return3y.toFixed(1) + '%' : '—'}</div>
                </div>
            </div>
            <p class="hint hint-mini">💡 年化波動 &gt; 30% = 高波動（心跳快）· MDD &gt; 25% = 曾腰斬式回檔 · 3Y 報酬 vs 0050（近 3 年 ~+50%）判斷是否值得換股</p>
        `;

        // Panel 2: 配息紀錄表
        const dividendRows = dividends.length === 0
            ? '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">近 5 年無配息紀錄</td></tr>'
            : dividends.slice(0, 20).map(d => {
                const yr = d.year || '';
                return `<tr>
                    <td>${d.exDate || '—'}</td>
                    <td>${d.payDate || '—'}</td>
                    <td class="num-cell">$${fmt(d.cash, 4)}</td>
                    <td>${yr}</td>
                </tr>`;
            }).join('');
        const dividendPanelHtml = `
            <h3>💰 配息紀錄（近 5 年 · 依除息日）</h3>
            <div class="etf-div-summary">
                <span>近 12M 次數：<b>${last12MCount}</b></span>
                <span>近 12M 累計：<b>$${fmt(last12MSum, 2)}</b></span>
                <span>估殖利率：<b>${estYield !== null ? estYield.toFixed(2) + '%' : '—'}</b></span>
                <span>頻率：<b>${frequency}</b></span>
            </div>
            <div class="table-scroll">
                <table class="result-table etf-div-table">
                    <thead><tr><th>除息日</th><th>支付日</th><th>每股配息</th><th>年度</th></tr></thead>
                    <tbody>${dividendRows}</tbody>
                </table>
            </div>
        `;

        // Panel 3: 法人買賣（60d / 20d 累計 + line chart）
        const foreignBadge60 = inst60d.Foreign_Investor >= 0 ? 'inst-buy' : 'inst-sell';
        const trustBadge60 = inst60d.Investment_Trust >= 0 ? 'inst-buy' : 'inst-sell';
        const dealerBadge60 = inst60d.Dealer >= 0 ? 'inst-buy' : 'inst-sell';
        const foreignBadge20 = inst20d.Foreign_Investor >= 0 ? 'inst-buy' : 'inst-sell';
        const trustBadge20 = inst20d.Investment_Trust >= 0 ? 'inst-buy' : 'inst-sell';
        const dealerBadge20 = inst20d.Dealer >= 0 ? 'inst-buy' : 'inst-sell';
        // 換算成張數（1 張 = 1000 股）· UI 更易讀
        const shareToBoard = n => (n / 1000).toFixed(0);

        const instPanelHtml = `
            <h3>📈 三大法人買賣超（累計淨買 / 賣）</h3>
            <div class="etf-inst-grid">
                <div class="etf-inst-cell">
                    <div class="etf-inst-label">🌐 外資</div>
                    <div class="etf-inst-vals">
                        <span class="etf-inst-window">20d</span> <span class="etf-inst-badge ${foreignBadge20}">${inst20d.Foreign_Investor >= 0 ? '+' : ''}${shareToBoard(inst20d.Foreign_Investor)} 張</span><br>
                        <span class="etf-inst-window">60d</span> <span class="etf-inst-badge ${foreignBadge60}">${inst60d.Foreign_Investor >= 0 ? '+' : ''}${shareToBoard(inst60d.Foreign_Investor)} 張</span>
                    </div>
                </div>
                <div class="etf-inst-cell">
                    <div class="etf-inst-label">🎯 投信（ETF 主戰場）</div>
                    <div class="etf-inst-vals">
                        <span class="etf-inst-window">20d</span> <span class="etf-inst-badge ${trustBadge20}">${inst20d.Investment_Trust >= 0 ? '+' : ''}${shareToBoard(inst20d.Investment_Trust)} 張</span><br>
                        <span class="etf-inst-window">60d</span> <span class="etf-inst-badge ${trustBadge60}">${inst60d.Investment_Trust >= 0 ? '+' : ''}${shareToBoard(inst60d.Investment_Trust)} 張</span>
                    </div>
                </div>
                <div class="etf-inst-cell">
                    <div class="etf-inst-label">🏢 自營商合計</div>
                    <div class="etf-inst-vals">
                        <span class="etf-inst-window">20d</span> <span class="etf-inst-badge ${dealerBadge20}">${inst20d.Dealer >= 0 ? '+' : ''}${shareToBoard(inst20d.Dealer)} 張</span><br>
                        <span class="etf-inst-window">60d</span> <span class="etf-inst-badge ${dealerBadge60}">${inst60d.Dealer >= 0 ? '+' : ''}${shareToBoard(inst60d.Dealer)} 張</span>
                    </div>
                </div>
            </div>
            <canvas id="etf-inst-chart" width="800" height="240"></canvas>
            <p class="hint hint-mini">📊 累計淨買（60 天）· 3 條線由 0 開始加總每日 (buy − sell) · 上升 = 該法人持續買超</p>
        `;

        // Panel 3.5: 融資融券（Tier 1-C · 散戶槓桿情緒）
        // 融資 = 借錢買（做多的槓桿）· 融券 = 借券賣（做空）
        // 融資餘額大幅上升 = 散戶追高警訊 · 大幅下降 = 融資殺出（可能觸底）
        // 券資比 > 30% = 空方比例高 · 有軋空機會
        const marginCurBalance = margin.marginLast ? margin.marginLast.margin : 0;
        const shortCurBalance = margin.marginLast ? margin.marginLast.short : 0;
        const margin60Cls = margin.margin60dChange === null ? '' : margin.margin60dChange >= 20 ? 'chg-down' : margin.margin60dChange <= -20 ? 'chg-up' : '';
        const margin60Label = margin.margin60dChange === null ? '—'
            : margin.margin60dChange >= 20 ? `+${margin.margin60dChange.toFixed(1)}% · 融資追高`
            : margin.margin60dChange <= -20 ? `${margin.margin60dChange.toFixed(1)}% · 融資殺出`
            : `${margin.margin60dChange >= 0 ? '+' : ''}${margin.margin60dChange.toFixed(1)}% · 平穩`;
        const shortRatioCls = margin.shortMarginRatio === null ? '' : margin.shortMarginRatio >= 30 ? 'chg-down' : '';
        const marginPanelHtml = `
            <h3>🏦 融資融券（散戶槓桿情緒）</h3>
            <div class="etf-margin-grid">
                <div class="etf-margin-cell">
                    <div class="etf-margin-label">融資餘額（今日）</div>
                    <div class="etf-margin-val">${marginCurBalance.toLocaleString()} 張</div>
                </div>
                <div class="etf-margin-cell">
                    <div class="etf-margin-label">融資 60 天變化</div>
                    <div class="etf-margin-val ${margin60Cls}">${margin60Label}</div>
                </div>
                <div class="etf-margin-cell">
                    <div class="etf-margin-label">融券餘額（今日）</div>
                    <div class="etf-margin-val">${shortCurBalance.toLocaleString()} 張</div>
                </div>
                <div class="etf-margin-cell">
                    <div class="etf-margin-label">券資比</div>
                    <div class="etf-margin-val ${shortRatioCls}">${margin.shortMarginRatio !== null ? margin.shortMarginRatio.toFixed(1) + '%' : '—'}</div>
                </div>
            </div>
            ${margin.marginSeries.length > 20 ? '<canvas id="etf-margin-chart" width="800" height="200"></canvas>' : ''}
            <p class="hint hint-mini">💡 融資增 &gt; 20% = 散戶追高（歷史上常在頂部）· 融資降 &gt; 20% = 融資斷頭殺出（歷史上常在底部）· 券資比 &gt; 30% = 空方多 · 有軋空可能</p>
        `;

        // Panel 4: 大戶散戶結構
        const chipPct = chipBuckets;
        const chipTotal = chipPct.retail + chipPct.small + chipPct.mid + chipPct.big + chipPct.whale;
        const pctW = k => chipTotal > 0 ? (chipPct[k] / chipTotal * 100) : 0;
        const chipPanelHtml = `
            <h3>🎲 籌碼結構（${chipLatestDate || '—'} · 集保級距合併成 5 桶）</h3>
            <div class="etf-chip-bars">
                <div class="chip-bar-row">
                    <span class="chip-bar-label">🐹 零散戶（&lt; 5 張）</span>
                    <div class="chip-bar-track"><div class="chip-bar-fill chip-retail" style="width:${pctW('retail').toFixed(1)}%"></div></div>
                    <span class="chip-bar-pct">${pctW('retail').toFixed(1)}%</span>
                </div>
                <div class="chip-bar-row">
                    <span class="chip-bar-label">🐢 小戶（5-50 張）</span>
                    <div class="chip-bar-track"><div class="chip-bar-fill chip-small" style="width:${pctW('small').toFixed(1)}%"></div></div>
                    <span class="chip-bar-pct">${pctW('small').toFixed(1)}%</span>
                </div>
                <div class="chip-bar-row">
                    <span class="chip-bar-label">🦊 中戶（50-400 張）</span>
                    <div class="chip-bar-track"><div class="chip-bar-fill chip-mid" style="width:${pctW('mid').toFixed(1)}%"></div></div>
                    <span class="chip-bar-pct">${pctW('mid').toFixed(1)}%</span>
                </div>
                <div class="chip-bar-row">
                    <span class="chip-bar-label">🦁 大戶（400-1000 張）</span>
                    <div class="chip-bar-track"><div class="chip-bar-fill chip-big" style="width:${pctW('big').toFixed(1)}%"></div></div>
                    <span class="chip-bar-pct">${pctW('big').toFixed(1)}%</span>
                </div>
                <div class="chip-bar-row">
                    <span class="chip-bar-label">🐋 巨鯨（&gt; 1000 張）</span>
                    <div class="chip-bar-track"><div class="chip-bar-fill chip-whale" style="width:${pctW('whale').toFixed(1)}%"></div></div>
                    <span class="chip-bar-pct">${pctW('whale').toFixed(1)}%</span>
                </div>
            </div>
            <p class="hint hint-mini">💡 巨鯨 % 高 = 主力集中持有 · 資金流動性受少數大戶控制 · 散戶 % 高 = 分散持股</p>
            ${whaleTrend.length > 3 ? '<canvas id="etf-whale-chart" width="800" height="180"></canvas>' : ''}
        `;

        // Panel 4.5 · 📦 經理人持股 Top 10（若 monitored 且有資料）
        // Panel 4.6 · 🔥 跨基金共識（若有 manifest）
        let holdingsPanelHtml = '';
        let consensusPanelHtml = '';
        if (activeHoldings) {
            if (activeHoldings.available && activeHoldings.holdings && activeHoldings.holdings.length > 0) {
                const snapshotDate = activeHoldings.manifest?.date || '—';
                const generatedAt = activeHoldings.manifest?.generated_at || '';
                const holdingsCount = activeHoldings.fund?.holdings_count || activeHoldings.holdings.length;
                const top10 = activeHoldings.holdings.slice(0, 10);
                const top10WeightSum = top10.reduce((s, h) => s + h.weight, 0);
                const rows = top10.map((h, i) => `
                    <tr>
                        <td class="rank">${i + 1}</td>
                        <td>${escapeAttr(h.code)}</td>
                        <td>${escapeAttr(h.name)}</td>
                        <td class="num-cell">${h.shares.toLocaleString()}</td>
                        <td class="num-cell"><b>${h.weight.toFixed(2)}%</b></td>
                        <td><a href="index.html?ticker=${encodeURIComponent(h.code)}" title="切估值分析">🔎</a></td>
                    </tr>
                `).join('');
                // 顯示近期動作（從 manifest.funds.actions）
                const actions = activeHoldings.fund?.actions || {};
                const actionsChips = [];
                (actions.new || []).slice(0, 5).forEach(a => actionsChips.push(`<span class="holding-chip chip-new">🟢新 ${a.code} ${a.name}</span>`));
                (actions.build || []).slice(0, 5).forEach(a => actionsChips.push(`<span class="holding-chip chip-new">🆕建 ${a.code} ${a.name}</span>`));
                (actions.add || []).slice(0, 5).forEach(a => actionsChips.push(`<span class="holding-chip chip-add">⬆️加 ${a.code} ${a.name} ${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(0)}%</span>`));
                (actions.reduce || []).slice(0, 5).forEach(a => actionsChips.push(`<span class="holding-chip chip-reduce">⬇️減 ${a.code} ${a.name} ${a.pct.toFixed(0)}%</span>`));
                (actions.drop || []).slice(0, 5).forEach(a => actionsChips.push(`<span class="holding-chip chip-drop">🔴剔 ${a.code} ${a.name}</span>`));
                const actionsHtml = actionsChips.length > 0
                    ? `<div class="holdings-actions"><div class="holdings-actions-label">📊 vs 前一日快照</div><div class="holdings-actions-chips">${actionsChips.join('')}</div></div>`
                    : '<p class="hint hint-mini">📊 vs 前一日無變化（或還沒累積 2 個快照）</p>';

                holdingsPanelHtml = `
                    <h3>📦 經理人持股 Top 10 · <span class="holdings-freshness">${snapshotDate}</span></h3>
                    <div class="holdings-summary">
                        <span>總持股：<b>${holdingsCount}</b> 檔</span>
                        <span>Top 10 集中度：<b>${top10WeightSum.toFixed(1)}%</b></span>
                        ${generatedAt ? `<span class="holdings-generated">🕒 資料時間：${generatedAt.slice(0, 16)}</span>` : ''}
                    </div>
                    <div class="table-scroll">
                        <table class="result-table holdings-table">
                            <thead><tr><th>#</th><th>代號</th><th>名稱</th><th>股數</th><th>權重</th><th>估值</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                    ${actionsHtml}
                    <p class="hint hint-mini">💡 主動 ETF · 這是<b>經理人的實際部位</b>——每日 PCF 公告 · 資料由 GitHub Actions 每日 18:30 抓 · 快照差異即經理人的<b>買賣決策</b></p>
                `;
            } else if (activeHoldings.reason) {
                holdingsPanelHtml = `
                    <h3>📦 經理人持股（資料尚未就緒）</h3>
                    <p class="hint" style="padding:12px 14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px">
                        ⚠️ ${escapeAttr(activeHoldings.reason)}<br>
                        <small>若剛 deploy · CI 需等到隔天 18:30 才會有第一個快照。可到 <a href="https://github.com/delphichi/2025trip/actions/workflows/etf-holdings.yml" target="_blank" rel="noopener">Actions → etf-holdings-daily</a> 手動觸發 <b>Run workflow</b>（設 backfill_days=7 建立初始資料）</small>
                    </p>
                `;
            }

            // 跨基金共識 · 只要 manifest 抓到就顯示（不需 fund 存在）
            const manifest = activeHoldings.manifest;
            if (manifest && (manifest.consensus_buy?.length > 0 || manifest.consensus_sell?.length > 0 || manifest.divergence?.length > 0)) {
                const buyItems = (manifest.consensus_buy || []).map(c => `
                    <div class="consensus-item consensus-buy">
                        <span class="consensus-badge">🟢 買</span>
                        <a href="index.html?ticker=${encodeURIComponent(c.stock_id)}">${escapeAttr(c.stock_id)} ${escapeAttr(c.name || '')}</a>
                        <span class="consensus-funds">${c.funds.length} 檔：${c.funds.join(' / ')}</span>
                    </div>
                `).join('');
                const sellItems = (manifest.consensus_sell || []).map(c => `
                    <div class="consensus-item consensus-sell">
                        <span class="consensus-badge">🔴 賣</span>
                        <a href="index.html?ticker=${encodeURIComponent(c.stock_id)}">${escapeAttr(c.stock_id)} ${escapeAttr(c.name || '')}</a>
                        <span class="consensus-funds">${c.funds.length} 檔：${c.funds.join(' / ')}</span>
                    </div>
                `).join('');
                const divItems = (manifest.divergence || []).map(c => `
                    <div class="consensus-item consensus-div">
                        <span class="consensus-badge">⚖️ 分歧</span>
                        <a href="index.html?ticker=${encodeURIComponent(c.stock_id)}">${escapeAttr(c.stock_id)} ${escapeAttr(c.name || '')}</a>
                        <span class="consensus-funds">買：${(c.buy_funds || []).join(',')} · 砍：${(c.sell_funds || []).join(',')}</span>
                    </div>
                `).join('');
                consensusPanelHtml = `
                    <h3>🔥 跨基金共識 · <span class="holdings-freshness">${manifest.date}</span></h3>
                    <p class="hint hint-mini" style="margin-bottom:10px">💡 監看 <b>${manifest.funds?.length || 0} 檔主動 ETF</b> · ≥ 2 檔同向 = 共識（法人共同看法）· 一買一砍 = 分歧（有爭議）</p>
                    ${buyItems || sellItems || divItems ? `<div class="consensus-grid">${buyItems}${sellItems}${divItems}</div>` : '<p class="hint">📊 今日無跨基金共識或分歧訊號</p>'}
                `;
            }
        }

        // Panel 5: 外部工具引導
        const issuerHint = getEtfIssuerHint(ticker);
        const externalPanelHtml = `
            <h3>🔗 這些工具做不到 · 去別處看</h3>
            <div class="etf-external-grid">
                <div class="etf-ext-card">
                    <div class="etf-ext-title">📊 折溢價（NAV vs Price）</div>
                    <div class="etf-ext-body">FinMind 沒收 · 但 TWSE 有免費 API（等我們接）· 或直接看 <a href="https://mis.twse.com.tw/stock/index" target="_blank" rel="noopener">TWSE 即時報價</a></div>
                </div>
                <div class="etf-ext-card">
                    <div class="etf-ext-title">📦 持股 Top 10 + 費用率</div>
                    <div class="etf-ext-body">${issuerHint}</div>
                </div>
                <div class="etf-ext-card">
                    <div class="etf-ext-title">📉 追蹤誤差 / 相對報酬</div>
                    <div class="etf-ext-body">看 MoneyDJ ETF：<a href="https://etf.moneydj.com/ETF/X/Basic/Basic0001.xdjhtm?etfid=${ticker}" target="_blank" rel="noopener">${ticker} · MoneyDJ</a></div>
                </div>
                <div class="etf-ext-card">
                    <div class="etf-ext-title">🎯 動能分析</div>
                    <div class="etf-ext-body"><a href="../rotation/index.html?ticker=${ticker}">切「動能雷達」→ 看 ${ticker} 相對 0050 的表現</a></div>
                </div>
            </div>
        `;

        etfContainer.innerHTML = headerHtml
            + technicalPanelHtml
            + riskPanelHtml
            + dividendPanelHtml
            + instPanelHtml
            + marginPanelHtml
            + chipPanelHtml
            + holdingsPanelHtml
            + consensusPanelHtml
            + externalPanelHtml;

        // 畫 chart（法人累計 + 融資餘額 + 巨鯨趨勢）
        setTimeout(() => {
            drawEtfInstChart(instSeries);
            if (margin.marginSeries.length > 20) drawEtfMarginChart(margin.marginSeries);
            if (whaleTrend.length > 3) drawEtfWhaleChart(whaleTrend);
        }, 50);
    }

    function getEtfIssuerHint(ticker) {
        // 從 ticker 推發行商 · 給連結
        const t = ticker;
        if (/^005\d/.test(t) || /^006\d\d/.test(t)) return `元大投信官網：<a href="https://www.yuantaetfs.com/product/detail/${t}/rtnPerformance" target="_blank" rel="noopener">${t}</a>`;
        if (/^008\d/.test(t) || /^009\d\d/.test(t)) return `國泰投信 or 群益投信 or 富邦投信官網 · 用 ticker 搜尋`;
        if (/^0057/.test(t)) return `富邦投信官網 · <a href="https://websys.fsit.com.tw/FubonETF/" target="_blank" rel="noopener">FubonETF</a>`;
        return `發行商官網（依 ticker 前綴查）· 或 <a href="https://etf.moneydj.com/ETF/X/Basic/Basic0004.xdjhtm?etfid=${t}" target="_blank" rel="noopener">MoneyDJ ETF · ${t}</a>`;
    }

    function drawEtfInstChart(series) {
        const canvas = document.getElementById('etf-inst-chart');
        if (!canvas || series.length === 0) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const padL = 60, padR = 20, padT = 20, padB = 40;
        const plotW = W - padL - padR, plotH = H - padT - padB;

        const allVals = series.flatMap(d => [d.foreign, d.trust, d.dealer, 0]);
        const min = Math.min(...allVals), max = Math.max(...allVals);
        const range = (max - min) || 1;
        const yScale = v => padT + plotH - ((v - min) / range) * plotH;
        const xScale = i => padL + (i / Math.max(1, series.length - 1)) * plotW;

        // Zero line
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, yScale(0));
        ctx.lineTo(W - padR, yScale(0));
        ctx.stroke();
        ctx.setLineDash([]);

        // Three lines: foreign / trust / dealer
        const drawLine = (key, color, label) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            series.forEach((d, i) => {
                const x = xScale(i), y = yScale(d[key]);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };
        drawLine('foreign', '#3b82f6', '外資');
        drawLine('trust', '#f59e0b', '投信');
        drawLine('dealer', '#8b5cf6', '自營商');

        // Y label
        ctx.fillStyle = '#64748b';
        ctx.font = '11px ui-monospace';
        ctx.textAlign = 'right';
        ctx.fillText((max / 1000).toFixed(0) + ' 張', padL - 5, padT + 10);
        ctx.fillText('0', padL - 5, yScale(0) + 3);
        ctx.fillText((min / 1000).toFixed(0) + ' 張', padL - 5, H - padB - 5);

        // Date labels
        ctx.textAlign = 'center';
        if (series.length >= 2) {
            ctx.fillText(series[0].date.slice(5), padL, H - padB + 20);
            ctx.fillText(series[series.length - 1].date.slice(5), W - padR, H - padB + 20);
        }

        // Legend
        ctx.textAlign = 'left';
        const legendY = H - 8;
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(padL, legendY - 8, 12, 4);
        ctx.fillStyle = '#334155'; ctx.fillText('外資', padL + 16, legendY - 2);
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(padL + 70, legendY - 8, 12, 4);
        ctx.fillStyle = '#334155'; ctx.fillText('投信', padL + 86, legendY - 2);
        ctx.fillStyle = '#8b5cf6'; ctx.fillRect(padL + 140, legendY - 8, 12, 4);
        ctx.fillStyle = '#334155'; ctx.fillText('自營商', padL + 156, legendY - 2);
    }

    function drawEtfMarginChart(marginSeries) {
        // 融資 + 融券餘額趨勢（雙 y-axis 覺得太複雜 · 直接雙線 · scale 相同）
        // 為什麼放一起：可以看融資 vs 融券 的相對變化 · 兩者背離時是訊號
        const canvas = document.getElementById('etf-margin-chart');
        if (!canvas || marginSeries.length === 0) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const padL = 60, padR = 20, padT = 20, padB = 40;
        const plotW = W - padL - padR, plotH = H - padT - padB;

        const marginVals = marginSeries.map(d => d.margin);
        const shortVals = marginSeries.map(d => d.short);
        const allVals = [...marginVals, ...shortVals, 0];
        const max = Math.max(...allVals) * 1.05;
        const min = 0;
        const range = (max - min) || 1;
        const yScale = v => padT + plotH - ((v - min) / range) * plotH;
        const xScale = i => padL + (i / Math.max(1, marginSeries.length - 1)) * plotW;

        // Grid
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        [max, max * 0.5, 0].forEach(v => {
            ctx.beginPath();
            ctx.moveTo(padL, yScale(v));
            ctx.lineTo(W - padR, yScale(v));
            ctx.stroke();
        });
        ctx.setLineDash([]);

        // 融資 line（橘）
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        marginSeries.forEach((d, i) => {
            const x = xScale(i), y = yScale(d.margin);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 融券 line（紫）
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        marginSeries.forEach((d, i) => {
            const x = xScale(i), y = yScale(d.short);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Y labels
        ctx.fillStyle = '#64748b';
        ctx.font = '11px ui-monospace';
        ctx.textAlign = 'right';
        ctx.fillText((max / 1000).toFixed(0) + 'K 張', padL - 5, padT + 10);
        ctx.fillText('0', padL - 5, yScale(0) + 3);

        // Date labels
        ctx.textAlign = 'center';
        if (marginSeries.length >= 2) {
            ctx.fillText(marginSeries[0].date.slice(5), padL, H - padB + 20);
            ctx.fillText(marginSeries[marginSeries.length - 1].date.slice(5), W - padR, H - padB + 20);
        }

        // Legend
        ctx.textAlign = 'left';
        const legendY = H - 8;
        ctx.fillStyle = '#f97316'; ctx.fillRect(padL, legendY - 8, 12, 4);
        ctx.fillStyle = '#334155'; ctx.fillText('融資餘額', padL + 16, legendY - 2);
        ctx.fillStyle = '#8b5cf6'; ctx.fillRect(padL + 90, legendY - 8, 12, 4);
        ctx.fillStyle = '#334155'; ctx.fillText('融券餘額', padL + 106, legendY - 2);
    }

    function drawEtfWhaleChart(whaleTrend) {
        const canvas = document.getElementById('etf-whale-chart');
        if (!canvas || whaleTrend.length === 0) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const padL = 50, padR = 20, padT = 20, padB = 30;
        const plotW = W - padL - padR, plotH = H - padT - padB;

        const vals = whaleTrend.map(d => d.pct);
        const min = Math.min(...vals) * 0.98, max = Math.max(...vals) * 1.02;
        const range = (max - min) || 1;
        const yScale = v => padT + plotH - ((v - min) / range) * plotH;
        const xScale = i => padL + (i / Math.max(1, whaleTrend.length - 1)) * plotW;

        // Grid
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        [min, (min + max) / 2, max].forEach(v => {
            ctx.beginPath();
            ctx.moveTo(padL, yScale(v));
            ctx.lineTo(W - padR, yScale(v));
            ctx.stroke();
        });
        ctx.setLineDash([]);

        // Line + area
        ctx.strokeStyle = '#0891b2';
        ctx.fillStyle = 'rgba(8, 145, 178, 0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xScale(0), yScale(whaleTrend[0].pct));
        whaleTrend.forEach((d, i) => ctx.lineTo(xScale(i), yScale(d.pct)));
        ctx.stroke();
        // Fill area under
        ctx.lineTo(xScale(whaleTrend.length - 1), padT + plotH);
        ctx.lineTo(xScale(0), padT + plotH);
        ctx.closePath();
        ctx.fill();

        // Y labels
        ctx.fillStyle = '#64748b';
        ctx.font = '11px ui-monospace';
        ctx.textAlign = 'right';
        ctx.fillText(max.toFixed(1) + '%', padL - 5, padT + 10);
        ctx.fillText(min.toFixed(1) + '%', padL - 5, padT + plotH);
        ctx.textAlign = 'center';
        if (whaleTrend.length >= 2) {
            ctx.fillText(whaleTrend[0].date.slice(0, 7), padL, H - 8);
            ctx.fillText(whaleTrend[whaleTrend.length - 1].date.slice(0, 7), W - padR, H - 8);
        }
        // Title
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0891b2';
        ctx.font = 'bold 12px system-ui';
        ctx.fillText('🐋 巨鯨（>1000 張）持股 % 走勢', padL, 14);
    }

    // ---------- Rendering ----------
    function renderResult(analysis) {
        const { ticker, name, price, currentPE, currentPBR, history, latestRatioDate, sector } = analysis;

        $('result-panel').hidden = false;
        // 若上一次是 ETF 模式 · 個股元素被 hidden+display:none · 這裡先復原
        //   （個股 UI 才是預設狀態 · 每次 renderResult 都主動 restore 一遍安全）
        const resultPanel = $('result-panel');
        resultPanel.querySelectorAll('.result-grid, .sample-warn, .verdict-box, .chart-block, .detail-box').forEach(el => {
            el.hidden = false;
            el.style.display = '';
        });
        // 隱藏 ETF panel（若上次是 ETF 模式）
        const etfEl = document.getElementById('etf-panel');
        if (etfEl) etfEl.hidden = true;
        $('result-ticker').textContent = `${ticker}${name && name !== ticker ? ' · ' + name : ''}${sector ? ' · ' + sector : ''}`;
        $('result-price').textContent = price !== null ? '$' + fmt(price, 2) : '—';
        $('result-pe').textContent = currentPE !== null && isFinite(currentPE) ? fmt(currentPE, 1) : '—';
        $('result-pbr').textContent = currentPBR !== null && isFinite(currentPBR) ? fmt(currentPBR, 2) : '—';

        // Forward PE cell（Yahoo v7 quote · 只對 US 股觸發）
        const yq = analysis.yahooQuote;
        const fwdCell = $('result-cell-fwd-pe');
        if (fwdCell) {
            if (yq && yq.forwardPE && isFinite(yq.forwardPE)) {
                fwdCell.hidden = false;
                $('result-fwd-pe').textContent = fmt(yq.forwardPE, 1);
            } else {
                fwdCell.hidden = true;
            }
        }
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

        // 樣本量警訊（放在 verdict 上方，優先度最高）
        // FinMind daily 資料的 uniqueYears 準確反映年跨度；FMP annual 則等於 history.length
        const uniqueYears = new Set(history.map(h => h.year)).size;
        const warnEl = $('sample-warn');
        if (warnEl) {
            if (uniqueYears < 10) {
                const isFmp = analysis.source !== 'FinMind';
                const twHint = isFmp
                    ? '<br>若這是美股 ADR（例：TSM、BABA、NIO），<b>建議改查對應本地上市代號</b>（TSM → 2330 · BABA → 9988.HK · NIO → 9866.HK），FinMind / 本地資料源歷史深度是 FMP 免費 tier 的好幾倍（TSM 5 年 vs 2330 20 年 4920 筆每日）。'
                    : '';
                warnEl.innerHTML = `<b>⚠️ 歷史樣本只有 ${uniqueYears} 年</b>——可能只涵蓋一個景氣循環（半導體 3-4 年 / 消費品 5-7 年 / 房地產 8-10 年），<b>百分位判讀的統計顯著度低</b>，不要當強訊號用。${twHint}`;
                warnEl.hidden = false;
            } else {
                warnEl.hidden = true;
            }
        }

        // 分佈離散度偵測（先算 · 決定要不要覆蓋 verdict）
        // max/min > 5× 代表歷史裡有極端異常年，中位數判讀失真、百分位當強訊號會誤導
        // AMD 典型案例：PE 56→278 = 5×、PBR 1.85→23.65 = 12.8×（2023 EPS 崩 + 2021 加密泡沫）
        const peSpread = peStats && peStats.min > 0 ? peStats.max / peStats.min : null;
        const pbrSpread = pbrStats && pbrStats.min > 0 ? pbrStats.max / pbrStats.min : null;
        const spreads = [];
        if (peSpread && peSpread > 5) spreads.push(`PE ${peSpread.toFixed(1)}×（${fmt(peStats.min,1)}→${fmt(peStats.max,1)}）`);
        if (pbrSpread && pbrSpread > 5) spreads.push(`PBR ${pbrSpread.toFixed(1)}×（${fmt(pbrStats.min,2)}→${fmt(pbrStats.max,2)}）`);
        const isDistorted = spreads.length > 0;

        // Verdict — 離散度極大時覆蓋成琥珀警告，避免使用者只讀「🟡 中高區間」溫和標題就下判斷
        const v = verdict(pePercentile, pbrPercentile);
        if (isDistorted) {
            // 判斷絕對值是否也極端貴（避免相對位置樂觀誤導）
            const absExtreme = (currentPE && isFinite(currentPE) && currentPE > 40)
                            || (currentPBR && isFinite(currentPBR) && currentPBR > 10);
            v.kind = 'warning';   // 琥珀色 · 覆蓋原本的 cheap/fair/expensive
            v.title = absExtreme
                ? '🟠 統計失真警示 · 絕對值極端貴 · 相對位置判讀不可靠'
                : '🟠 統計失真警示 · 分佈離散度極大 · 相對位置判讀不可靠';
            v.body = null;   // 覆蓋原 body · 下方會 prepend 更強的離散度說明
        }
        const box = $('verdict-box');
        box.className = 'verdict-box ' + v.kind;
        $('verdict-title').textContent = v.title;
        let bodyHtml = '';

        // 離散度警訊 · 若觸發放最前面（在 percentile 之前）· 使用者眼球從頂端讀
        if (isDistorted) {
            bodyHtml += `⚠️ <b>分佈離散度極大</b>：${spreads.join(' · ')}——歷史裡有異常年份（EPS 崩、加密泡沫、併購一次性事件），<b>中位數被拉扁、百分位失去參考意義</b>。<br><br>👉 <b>改看絕對值</b>：${currentPE && isFinite(currentPE) ? `<b>PE ${fmt(currentPE,1)}</b>` : ''}${currentPE && currentPBR ? ' · ' : ''}${currentPBR && isFinite(currentPBR) ? `<b>PBR ${fmt(currentPBR,2)}</b>` : ''}——用「PE 25 是正常」的<b>絕對基準</b>判讀，不要靠這裡算出來的百分位。半導體週期股 PE &gt; 40 = 極端貴、消費品 &gt; 30 = 貴，跟自己歷史「相對便宜」無關。<br><br>`;
        }

        bodyHtml += v.body || '';
        // 補充：實際百分位數字（離散度大時這幾行會被前面警訊覆蓋語氣，但保留給使用者對照）
        if (pePercentile !== null) {
            bodyHtml += `<br><br><b>PE 百分位</b>：${fmtPct(pePercentile)}（${fmt(currentPE, 1)} vs 歷史中位數 ${fmt(peStats.median, 1)}）${isDistorted ? ' <span class="hint-mini">← 失真警訊已觸發、這個數字不當強訊號</span>' : ''}`;
        }
        if (pbrPercentile !== null) {
            bodyHtml += `<br><b>PBR 百分位</b>：${fmtPct(pbrPercentile)}（${fmt(currentPBR, 2)} vs 歷史中位數 ${fmt(pbrStats.median, 2)}）`;
        }
        // GAAP vs Non-GAAP 說明（美股獨有 · 台股 IFRS 財報沒這麼強烈的分裂）
        // AMD / NVDA / TSLA / PLTR 高 SBC + 併購攤銷公司，Non-GAAP EPS 常是 GAAP 的 2-3×
        // 使用者拿去對 Yahoo Finance / 券商研究 / 法說會的「Non-GAAP TTM PE」會發現對不上、不是 bug
        const isFmpSource = analysis.source !== 'FinMind';
        if (isFmpSource) {
            bodyHtml += `<br><br><span class="hint-mini">📌 <b>會計基準：GAAP</b>——FMP 用 SEC 10-Q/K 的 diluted EPS 算。AMD / NVDA / TSLA / PLTR 這類<b>高 SBC（股票薪酬）+ 併購攤銷</b>的科技股，Non-GAAP EPS 常是 GAAP 的 2-3 倍 → <b>Non-GAAP PE 反而低很多</b>。管理層在法說會 / 公告用的、Yahoo Finance / 券商多半顯示的都是 Non-GAAP TTM PE，跟本工具算的<b>不會對得上、不是 bug</b>。想拿 Non-GAAP 對照請去公司 IR 的 earnings release / 8-K。</span>`;
        }
        // Forward PE 對照（Yahoo v7 quote · 只對美股）· 對成長股判讀關鍵
        if (yq && yq.forwardPE && isFinite(yq.forwardPE) && currentPE) {
            const fwdPE = yq.forwardPE;
            const compressionRatio = currentPE / fwdPE;
            const compressionMsg = compressionRatio > 3
                ? `<b>Forward PE ${fmt(fwdPE, 1)}</b> 遠低於 trailing PE ${fmt(currentPE, 1)}（差 ${compressionRatio.toFixed(1)}×）—— 市場定價<b>賭一個劇烈的成長跳躍</b>。TTM PE 高不代表貴、也不代表便宜，關鍵是「這個成長預期能不能兌現」（Layer 3 護城河跟你自己判斷分析師 EPS 估的可信度）。若成長 miss，估值會用「TTM PE 補跌」的方式回歸——結構性下修風險。`
                : compressionRatio > 1.5
                ? `Forward PE ${fmt(fwdPE, 1)} vs trailing ${fmt(currentPE, 1)}（差 ${compressionRatio.toFixed(1)}×）—— 市場預期成長中，但不極端。`
                : compressionRatio > 0.9
                ? `Forward PE ${fmt(fwdPE, 1)} ≈ trailing ${fmt(currentPE, 1)} —— 市場預期獲利<b>維持水位</b>，非高成長型定價。`
                : `⚠️ Forward PE ${fmt(fwdPE, 1)} <b>高於</b> trailing ${fmt(currentPE, 1)} —— 分析師預期<b>獲利衰退</b>。這是<b>盈餘週期反轉訊號</b>，要看是暫時性還是結構性。`;
            bodyHtml += `<br><br>📈 <b>Forward vs Trailing PE</b>：${compressionMsg}`;
        }
        // PEG Ratio (Peter Lynch) · 兩個版本都算 · 有解時同時顯示
        // - Trailing PEG = trailing PE / (最新 YoY EPS 成長率 %)
        // - Forward PEG = forward PE / (Yahoo epsForward vs epsTrailing 的隱含成長 %)
        // 限制：EPS 前年為負 or 一次性大跳（AMD 2025 +164%）會讓 PEG 失真
        const computePeg = (pe, growthPct) => {
            if (!pe || !isFinite(pe) || pe <= 0) return null;
            if (!growthPct || !isFinite(growthPct) || growthPct <= 0) return null;
            return pe / growthPct;
        };
        const pegKind = peg =>
            peg == null ? null :
            peg < 1 ? { cls: 'success', label: '<1 便宜（Lynch 標準）' } :
            peg < 2 ? { cls: 'muted',   label: '1-2 合理' } :
                      { cls: 'danger',  label: '>2 貴' };
        // trailing PEG：用 fundamentals 最新一筆 EPS YoY（僅 mode==='YoY' 才用）
        let trailingPeg = null, trailingGrowth = null;
        if (analysis.fundamentals && analysis.fundamentals.eps && analysis.fundamentals.eps[0]) {
            const top = analysis.fundamentals.eps[0];
            if (top.mode === 'YoY' && top.yoy !== null && isFinite(top.yoy) && top.yoy > 0) {
                trailingGrowth = top.yoy * 100;
                trailingPeg = computePeg(currentPE, trailingGrowth);
            }
        }
        // forward PEG：需 Yahoo epsForward + epsTrailing 都有
        let forwardPeg = null, impliedFwdGrowth = null;
        if (yq && yq.forwardPE && yq.epsForward && yq.epsTrailing
            && isFinite(yq.epsForward) && isFinite(yq.epsTrailing) && yq.epsTrailing > 0) {
            impliedFwdGrowth = ((yq.epsForward - yq.epsTrailing) / yq.epsTrailing) * 100;
            forwardPeg = computePeg(yq.forwardPE, impliedFwdGrowth);
        }
        if (trailingPeg !== null || forwardPeg !== null) {
            const bits = [];
            if (trailingPeg !== null) {
                const k = pegKind(trailingPeg);
                bits.push(`<b>Trailing PEG ${trailingPeg.toFixed(2)}</b>（${trailingGrowth.toFixed(0)}% YoY · <span style="color:var(--${k.cls})">${k.label}</span>）`);
            }
            if (forwardPeg !== null) {
                const k = pegKind(forwardPeg);
                bits.push(`<b>Forward PEG ${forwardPeg.toFixed(2)}</b>（隱含 ${impliedFwdGrowth.toFixed(0)}% · <span style="color:var(--${k.cls})">${k.label}</span>）`);
            }
            // 動態基期風險判讀：用近 3-4 季 QoQ 平均辨別「持續加速」vs「單季低基期反彈」
            // - 若最新 YoY >100% 且近 3 季 QoQ 平均 >20% → 是加速趨勢（例：NVDA）· PEG 相對可信
            // - 若最新 YoY >100% 但 QoQ 平均低 or 混亂 → 疑似低基期反彈（例：AMD 2024→2025 一次跳）
            let baseSuspicion = '';
            if (trailingGrowth !== null) {
                const epsEntries = analysis.fundamentals && analysis.fundamentals.eps;
                let qoqAvg = null;
                if (epsEntries && epsEntries.length >= 3) {
                    const qoqVals = epsEntries.slice(1, 4).filter(e => e.mode === 'QoQ' && e.yoy !== null && isFinite(e.yoy));
                    if (qoqVals.length >= 2) {
                        qoqAvg = qoqVals.reduce((s, e) => s + e.yoy, 0) / qoqVals.length * 100;
                    }
                }
                if (trailingGrowth > 100 && qoqAvg !== null && qoqAvg > 20) {
                    baseSuspicion = `<b>${ticker} 用 YoY +${trailingGrowth.toFixed(0)}% 算</b>——但近 3 季 QoQ 平均 <b>+${qoqAvg.toFixed(0)}%</b>，這是<b>持續加速</b>不是低基期反彈，PEG 的參考價值相對高（仍需對照 3-5 年 CAGR 確認能否延續）。`;
                } else if (trailingGrowth > 100) {
                    baseSuspicion = `⚠️ <b>${ticker} 用 YoY +${trailingGrowth.toFixed(0)}% 算</b>——這個成長率<b>異常高</b>，常見於<b>低基期反彈</b>（去年同季獲利極低而非結構性成長）。若基期正常化，PEG 會大幅上升、變得沒那麼便宜。務必對照 <b>3-5 年 CAGR</b> 判斷。`;
                } else if (trailingGrowth > 50) {
                    baseSuspicion = `${ticker} 用 YoY <b>+${trailingGrowth.toFixed(0)}%</b> 算 · 顯著成長率，可能加速中也可能週期回升——對照 3-5 年 CAGR 較穩。`;
                } else if (trailingGrowth > 0) {
                    baseSuspicion = `${ticker} 用 YoY <b>+${trailingGrowth.toFixed(0)}%</b> 算 · 溫和成長率，PEG 相對可信。`;
                }
            }
            bodyHtml += `<br><br>🎯 <b>PEG（Peter Lynch）</b>：${bits.join(' · ')}<br><span class="hint-mini"><b>⚠️ PEG 的兩個死角</b>：(1) <b>假設成長率可線性延續</b>——對成長剛起飛的公司低估風險、對成熟公司高估回歸壓力；(2) <b>基期效應</b>——${baseSuspicion}</span>`;
        }
        // 美股短興趣（Yahoo）· Layer 5 情緒替補
        if (yq) {
            const shortPct = yq.sharesShortPercentOfFloat;
            const shortDays = yq.shortRatio;
            const bits = [];
            if (shortPct && isFinite(shortPct)) {
                const p = shortPct * 100;
                bits.push(`空單佔流通股 <b>${p.toFixed(1)}%</b>${p > 10 ? '（高 · 逆勢空頭壓力大 · 但也是軋空題材）' : p > 3 ? '（中）' : '（低 · 市場一致看多 or 無爭議 · 有時是複雜情緒）'}`);
            }
            if (shortDays && isFinite(shortDays)) {
                bits.push(`空單回補天數 <b>${shortDays.toFixed(1)}</b>${shortDays > 5 ? '（>5 天 · 空單擁擠）' : ''}`);
            }
            if (bits.length) {
                bodyHtml += `<br><br>🎯 <b>美股情緒（Layer 5 替補）</b>：${bits.join(' · ')}—— 沒 TW 融資餘額直接、但反映當下市場對這家公司的空方定位。`;
            }
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
        // 層次 1-5 表順序：Peer 比較（層次 1 相對）→ ADR 折溢價 → 現金流背離
        //                → 財報成長性 → 法人買賣超 → 融資餘額 → 歷年 ratio
        const peerHtml = renderPeerComparisonHtml(analysis);
        const adrHtml = renderAdrPremiumHtml(analysis, analysis.fxSeries);
        const cfHtml = renderCashFlowHtml(analysis.cashFlow);
        // 應收/存貨/CapEx drill-down · 緊接 CF · try/catch 保護
        let drilldownHtml = '';
        try { drilldownHtml = renderQuarterlyDrilldown(analysis.cashFlow, analysis.fundamentals); }
        catch (e) { console.warn('renderQuarterlyDrilldown failed:', e.message); }
        // Feature B · 資產負債結構 panel · try/catch 保護
        let balanceSheetHtml = '';
        try { balanceSheetHtml = renderBalanceSheetHtml(analysis); }
        catch (e) { console.warn('renderBalanceSheetHtml failed:', e.message); }
        // Feature · 內部人持股 + 歷年配息/庫藏股 + 13F 機構持股集中度
        let insiderHtml = '', dividendHtml = '', instOwnHtml = '';
        try { insiderHtml = renderInsiderTradingHtml(analysis); }
        catch (e) { console.warn('renderInsiderTradingHtml failed:', e.message); }
        try { dividendHtml = renderDividendBuybackHtml(analysis); }
        catch (e) { console.warn('renderDividendBuybackHtml failed:', e.message); }
        try { instOwnHtml = renderInstitutionalOwnershipHtml(analysis); }
        catch (e) { console.warn('renderInstitutionalOwnershipHtml failed:', e.message); }
        // 診斷：FMP endpoint 狀態 · 讓使用者知道哪些 panel 為什麼沒亮
        let fmpStatusHtml = '';
        try { fmpStatusHtml = renderFmpStatusHtml(analysis); }
        catch (e) { console.warn('renderFmpStatusHtml failed:', e.message); }
        const fundHtml = renderFundamentalsHtml(analysis.fundamentals);
        // Step 2 · 最後 12 月營收 / 4 季毛利+營益（值+增長率）· try/catch 保護
        let monthlyMetricsHtml = '';
        try { monthlyMetricsHtml = renderMonthlyMetricsHtml(analysis.fundamentals); }
        catch (e) { console.warn('renderMonthlyMetricsHtml failed:', e.message); }
        // Step B + C · 軌跡圖 + 季節性柱狀圖
        let trajectoryHtml = '', seasonalityHtml = '';
        try { trajectoryHtml = renderMarginTrajectoryHtml(analysis.fundamentals); }
        catch (e) { console.warn('renderMarginTrajectoryHtml failed:', e.message); }
        try { seasonalityHtml = renderQuarterlySeasonalityHtml(analysis.fundamentals); }
        catch (e) { console.warn('renderQuarterlySeasonalityHtml failed:', e.message); }
        // 月度熱區（TW 專用 · C 選項 · 獨立 panel · 不動舊圖）
        let heatmapHtml = '';
        try { heatmapHtml = renderMonthlyHeatmapHtml(analysis.fundamentals); }
        catch (e) { console.warn('renderMonthlyHeatmapHtml failed:', e.message); }
        // Step 3 · 外資訊號警報 · try/catch 保護
        let foreignSignalHtml = '';
        try { foreignSignalHtml = renderForeignSignalHtml(analysis.institutional); }
        catch (e) { console.warn('renderForeignSignalHtml failed:', e.message); }
        const instHtml = renderInstitutionalHtml(analysis.institutional);
        const marginHtml = renderMarginHtml(analysis.marginTW, analysis.dividendsTW);
        // Phase 7 · 兩張雷達 stacked（B 選項）· 價值派在上、成長派在下
        // Phase 7.2 · 落差偵測（gap ≥ 30 顯示 · 置於兩雷達最上方）
        const mismatchHtml = detectFrameworkMismatch(analysis);
        const radarHtml = renderRadarSvg(analysis);
        const growthRadarHtml = renderGrowthRadarSvg(analysis);
        $('detail-box').innerHTML = fmpStatusHtml + peerHtml + adrHtml + cfHtml + drilldownHtml + balanceSheetHtml + fundHtml + monthlyMetricsHtml + trajectoryHtml + seasonalityHtml + heatmapHtml + foreignSignalHtml + instHtml + marginHtml + dividendHtml + insiderHtml + instOwnHtml + tableHtml + mismatchHtml + radarHtml + growthRadarHtml;

        // 決策框架 · 只在成功分析後顯示、可載入舊記錄
        try { initDecisionFramework(analysis); } catch (e) { console.warn('Decision framework init failed:', e.message); }

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
                sbc: r => r.stockBasedCompensation,   // FMP 現金流表有直接欄位
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
                ytdByDate.set(d, { date: d, opCF, fcf, capExYtd: capEx });
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
                    return { date: d, operatingCF: cur.opCF, freeCF: cur.fcf, netIncome, capEx: cur.capExYtd };
                }
                return {
                    date: d,
                    operatingCF: diff(cur.opCF, prev.opCF),
                    freeCF:      diff(cur.fcf, prev.fcf),
                    capEx:       diff(cur.capExYtd, prev.capExYtd),
                    netIncome,
                };
            });

            // processCashFlow 期待新→舊
            quarterlyWide.sort((a, b) => b.date.localeCompare(a.date));

            const cfResult = processCashFlow(quarterlyWide, {
                operatingCF: r => r.operatingCF,
                freeCF: r => r.freeCF,
                netIncome: r => r.netIncome,
            });
            // 附上 CapEx 單季時序（給 drill-down 表用 · 不影響現有 CF 邏輯）
            if (cfResult) {
                cfResult.capExSeries = quarterlyWide.slice(0, 10).map(r => ({ date: r.date, value: r.capEx }));
            }
            return cfResult;
        } catch (e) {
            console.warn('FinMind cash flow fetch failed:', e.message);
            return null;
        }
    }

    function processCashFlow(rows, getters) {
        const rowByDate = new Map(rows.map(r => [r.date, r]));
        const N = Math.min(10, rows.length);
        const computeDelta = (val, priorVal) => {
            if (val === null || !isFinite(val)) return null;
            if (priorVal === null || !isFinite(priorVal) || priorVal === 0) return null;
            return (val - priorVal) / Math.abs(priorVal);
        };
        const build = (getter) => {
            const entries = [];
            for (let i = 0; i < N; i++) {
                const cur = rows[i];
                const val = getter(cur);
                let delta = null, mode = null;

                // 優先 YoY
                let priorYoY = rowByDate.get(yoyDate(cur.date));
                if (!priorYoY && rows[i + 4]) priorYoY = rows[i + 4];
                if (priorYoY) {
                    const d = computeDelta(val, getter(priorYoY));
                    if (d !== null) { delta = d; mode = 'YoY'; }
                }

                // Fallback QoQ
                if (delta === null && rows[i + 1]) {
                    const d = computeDelta(val, getter(rows[i + 1]));
                    if (d !== null) { delta = d; mode = 'QoQ'; }
                }

                entries.push({ date: cur.date, value: val, yoy: delta, mode });
            }
            return entries;
        };
        const opCF = build(getters.operatingCF);
        const fCF = build(getters.freeCF);
        const ni = build(getters.netIncome);
        const sbc = getters.sbc ? build(getters.sbc) : null;

        // SBC 佔 GAAP 淨利比例（TTM · 用近 4 季 sum ÷ 近 4 季淨利 sum）
        // 判讀：<10% 輕微 · 10-25% 中度 · >25% 重度
        // 對 AMD/NVDA/TSLA/PLTR 這種高 SBC 公司特別重要，讓使用者直接看到「GAAP vs Non-GAAP
        //   分裂的來源」而不用管理層決定叫什麼是「一次性」
        let sbcRatioTtm = null;
        if (sbc && sbc.length >= 4 && ni.length >= 4) {
            let sbcSum = 0, niSum = 0, valid = true;
            for (let i = 0; i < 4; i++) {
                if (sbc[i].value === null || !isFinite(sbc[i].value) ||
                    ni[i].value === null || !isFinite(ni[i].value)) { valid = false; break; }
                sbcSum += sbc[i].value;
                niSum += ni[i].value;
            }
            if (valid && Math.abs(niSum) > 1) sbcRatioTtm = sbcSum / Math.abs(niSum);
        }

        // 背離偵測：近 4 季 avg(NI YoY) vs avg(CF YoY)
        // 若 NI YoY > 15pp CF YoY → 獲利品質警訊
        // ⚠️ 只用 mode === 'YoY' 的 entries · 不能把 QoQ 混進來（不同單位、有季節性）
        // FMP 免費 tier 只有 5 季 → 通常只 1 個 YoY prior · 之前門檻 2 直接 skip
        //   → NVDA (NI +211% vs CF +84% = 127pp) · GOOGL (NI +81% vs CF +27% = 54pp)
        //     這種 huge divergence 都被漏了 · 大問題
        // 修法：門檻降至 1 · 但明確帶 sample size caveat · 使用者知道這是單季訊號不是趨勢
        const avgYoY = arr => {
            const valid = arr.filter(e => e.yoy !== null && e.mode === 'YoY').map(e => e.yoy);
            if (valid.length < 1) return { avg: null, n: 0 };
            return { avg: valid.reduce((s, v) => s + v, 0) / valid.length, n: valid.length };
        };
        const niYoY = avgYoY(ni.slice(0, 4));
        const cfYoY = avgYoY(opCF.slice(0, 4));
        let divergence = null;
        if (niYoY.avg !== null && cfYoY.avg !== null) {
            const gap = niYoY.avg - cfYoY.avg;
            const minN = Math.min(niYoY.n, cfYoY.n);
            const sampleCaveat = minN < 2
                ? `<br><span class="hint-mini">⚠️ <b>僅 ${minN} 個 YoY 樣本</b>（FMP 免費 tier 5 季 → 只 1 個 YoY prior）· 這是<b>單季訊號不是趨勢</b>，觀察下一季再定論。</span>`
                : '';
            const period = minN < 2 ? '最新一季' : `近 ${minN} 季`;
            if (gap > 0.15) divergence = { kind: 'warning', gap, msg: `⚠️ ${period}<b>淨利年增 ${(niYoY.avg*100).toFixed(0)}% 但營運CF 年增 ${(cfYoY.avg*100).toFixed(0)}%</b>——差 <b>${(gap*100).toFixed(0)}pp</b>。可能是應收帳款膨脹 / 存貨堆積 / 認列時點差異 / <b>非現金投資利益</b>（例：Alphabet 對 Waymo / DeepMind / 私募股權的未實現利益 · 一次性稅務利益 · 併購重估），<b>獲利品質有疑慮</b>。回去看資產負債表 + 8-K 一次性項目確認。${sampleCaveat}` };
            else if (gap < -0.15) divergence = { kind: 'positive', gap, msg: `✅ ${period}<b>營運CF 年增 ${(cfYoY.avg*100).toFixed(0)}% 高於淨利年增 ${(niYoY.avg*100).toFixed(0)}%</b>——獲利品質紮實，現金比帳面更漂亮。${sampleCaveat}` };
            else divergence = { kind: 'ok', gap, msg: `✓ 淨利跟營運 CF 同向（差 ${(gap*100).toFixed(0)}pp），獲利品質沒問題。${sampleCaveat}` };
        }

        return { operatingCF: opCF, freeCF: fCF, netIncome: ni, sbc, sbcRatioTtm, divergence };
    }

    // ---------- 台股法人買賣超（層次 5：市場情緒） ----------
    async function fetchInstitutionalTW(ticker, token) {
        try {
            // Step 3 · 拉到近 4 個月 · 給 60 日 rolling 用（原 3 個月剛好夠 · 加 buffer）
            const startDate = todayMinusYears(0.35);
            const rows = await finMindFetch('TaiwanStockInstitutionalInvestorsBuySell', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            const byDate = new Map();
            rows.forEach(r => {
                if (!byDate.has(r.date)) byDate.set(r.date, { foreign: 0, trust: 0, dealer: 0 });
                const net = (r.buy || 0) - (r.sell || 0);
                if (r.name && r.name.includes('Foreign')) byDate.get(r.date).foreign += net;
                else if (r.name && r.name.includes('Investment_Trust')) byDate.get(r.date).trust += net;
                else if (r.name && r.name.includes('Dealer')) byDate.get(r.date).dealer += net;
            });
            // 舊→新（給 rolling 用）
            const datesAsc = Array.from(byDate.keys()).sort();
            const dailyAsc = datesAsc.map(d => {
                const v = byDate.get(d);
                return { date: d, foreign: v.foreign, trust: v.trust, dealer: v.dealer, total: v.foreign + v.trust + v.dealer };
            });

            // Step 3 · 每日算 5d / 20d / 60d rolling 外資淨買（含當天 · 窗口不足回 null）
            const rollingFor = (idx, N) => {
                const from = Math.max(0, idx - N + 1);
                if (idx - from + 1 < N) return null;
                let s = 0;
                for (let j = from; j <= idx; j++) s += dailyAsc[j].foreign;
                return s;
            };
            const rollingSeries = dailyAsc.map((_, i) => ({
                sum5d: rollingFor(i, 5),
                sum20d: rollingFor(i, 20),
                sum60d: rollingFor(i, 60),
            }));

            // Step 3 · 訊號偵測（今日 vs 昨日）
            // 🔴 5d 翻紅 / 🟢 5d 翻綠：反轉 > 200 萬股（= 2,000 張）
            // 📉/📈 20d 巨變：單日 20d 變化 ≥ 800 萬股（= 8,000 張）
            // 🚨 三期背離：5d 跟 20d 方向相反
            let signals = [], severity = 0;
            const last = rollingSeries[rollingSeries.length - 1];
            const prev = rollingSeries[rollingSeries.length - 2];
            const fmtLots = sh => {
                if (sh === null || !isFinite(sh)) return '—';
                const lots = sh / 1000;
                return (lots >= 0 ? '+' : '') + lots.toLocaleString('en-US', { maximumFractionDigits: 0 });
            };
            if (last && prev) {
                if (last.sum5d !== null && prev.sum5d !== null) {
                    const rev = Math.abs(last.sum5d - prev.sum5d);
                    if (prev.sum5d > 0 && last.sum5d < 0 && rev > 2_000_000) {
                        signals.push('🔴 5d 翻紅（由買轉賣）');
                        severity++;
                    } else if (prev.sum5d < 0 && last.sum5d > 0 && rev > 2_000_000) {
                        signals.push('🟢 5d 翻綠（由賣轉買）');
                        severity++;
                    }
                }
                if (last.sum20d !== null && prev.sum20d !== null) {
                    const chg = last.sum20d - prev.sum20d;
                    if (Math.abs(chg) >= 8_000_000) {
                        signals.push(`${chg > 0 ? '📈' : '📉'} 20d 巨變（單日累計 ${fmtLots(chg)} 張）`);
                        severity++;
                    }
                }
                if (last.sum5d !== null && last.sum20d !== null) {
                    if (last.sum5d > 0 && last.sum20d < 0) {
                        signals.push('🚨 5d↔20d 背離（由賣轉買 · 20d 累計還是賣、5d 已反轉買）');
                        severity++;
                    } else if (last.sum5d < 0 && last.sum20d > 0) {
                        signals.push('🚨 5d↔20d 背離（由買轉賣 · 20d 累計還是買、5d 已反轉賣）');
                        severity++;
                    }
                }
            }

            // 顯示用 · 近 20 天明細（新→舊）
            const daily = dailyAsc.slice(-20).reverse();
            const sum = daily.reduce((acc, d) => ({
                foreign: acc.foreign + d.foreign,
                trust: acc.trust + d.trust,
                dealer: acc.dealer + d.dealer,
                total: acc.total + d.total,
            }), { foreign: 0, trust: 0, dealer: 0, total: 0 });

            return {
                daily, sum20d: sum,
                foreignSignals: {
                    latestDate: dailyAsc[dailyAsc.length - 1]?.date || null,
                    prevDate:   dailyAsc[dailyAsc.length - 2]?.date || null,
                    today: last || null,
                    yest:  prev || null,
                    signals, severity,
                },
            };
        } catch (e) {
            console.warn('FinMind institutional fetch failed:', e.message);
            return null;
        }
    }

    // ---------- Fundamentals table 渲染 ----------
    // 非營運項目佔稅前獲利 TTM · 揭露 GOOGL 這種控股公司特有的非現金 pumpage
    // GOOGL Q1 2026 案例：$36.9B Waymo 未實現利益佔 OI&E 99% · 佔稅前 49%
    //   → 表面淨利 YoY +81% · 剔除後核心業務 YoY +26% · PEG 從 0.35 → 1.09
    function renderNonOpBanner(fund) {
        if (!fund || fund.nonOpRatioTtm === undefined || fund.nonOpRatioTtm === null) return '';
        const pct = fund.nonOpRatioTtm * 100;
        // 只在 |ratio| > 20% 時顯示 · 正常公司 <10% 不干擾
        if (Math.abs(pct) < 20) return '';
        const cls = Math.abs(pct) > 40 ? 'divergence-warn' : 'divergence-warn';
        const severity = Math.abs(pct) > 40 ? '🚨 極端' : '⚠️';
        const sign = pct > 0 ? '推高' : '壓低';
        return `<div class="divergence-banner ${cls}">${severity} <b>非營運項目佔稅前獲利 ${pct.toFixed(0)}%</b>（近 4 季 TTM）——淨利被<b>非營運項目顯著${sign}</b>：常見來源包含<b>未實現投資利益</b>（例：Alphabet 對 Waymo/DeepMind/私募股權公允價值變動 · 外部融資輪推高帳面）· 一次性稅務利益 · 匯損 · 併購重估。<b>這些不轉成現金流</b>——想看核心業務真實成長率，得去 10-Q 的 <code>Other income (expense), net</code> 明細把它扣掉。<br><span class="hint-mini">💡 官方直接計算方式：核心稅前 = 稅前淨利 − OI&E 主要非經常項；核心 YoY = 用剔除後數字算。工具目前用 GAAP 表面數字算 PEG · 若這個比例大，PEG 分母會被膨脹、看起來假便宜。</span></div>`;
    }

    function renderFundamentalsHtml(fund) {
        if (!fund) return '<p class="hint">⚠️ 這個資料源 or 標的沒抓到季度財報，成長性表隱藏。</p>';

        // 判斷本次是否有任何有效資料
        const hasAny = ['eps', 'revenue', 'grossMargin', 'operatingMargin']
            .some(k => fund[k] && fund[k].some(e => e.value !== null && isFinite(e.value)));
        if (!hasAny) return '<p class="hint">⚠️ 這個標的的季度財報 API 回傳空值。</p>';

        const renderTable = (title, entries, isRatio, fmtVal) => {
            let html = `<div class="fund-cell"><h4>${title}</h4><table class="fund-table"><tr><th>季度</th><th>值</th><th>YoY / QoQ</th></tr>`;
            entries.forEach(e => {
                const dateStr = e.date || '—';
                const valStr = (e.value !== null && isFinite(e.value)) ? fmtVal(e.value) : '—';
                let yoyStr = '—', yoyCls = '';
                if (e.yoy !== null && isFinite(e.yoy)) {
                    const raw = e.yoy * 100;
                    const sign = raw > 0 ? '+' : '';
                    const numStr = isRatio ? `${sign}${raw.toFixed(1)} pp` : `${sign}${raw.toFixed(1)}%`;
                    const tag = e.mode === 'QoQ'
                        ? ` <span class="mode-tag mode-qoq" title="QoQ · 跟前一季比，有季節性（Q4 常天生 &gt; Q1），不能直接當成長率讀">Q/Q</span>`
                        : '';
                    yoyStr = numStr + tag;
                    // QoQ 用中性色（不當成長率評價 pos/neg）· 只有 YoY 才 tag 紅綠
                    if (e.mode === 'YoY') {
                        yoyCls = e.yoy > 0.001 ? 'yoy-pos' : e.yoy < -0.001 ? 'yoy-neg' : '';
                    }
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
                YoY = 跟去年同一季比較。<b>絕對值型（EPS、營收）</b>用 % 表示；<b>比率型（毛利率、營益率）</b>用 <b>pp（百分點）</b>表示。
                連續 4 季 YoY 都 &gt; 0 = 成長股訊號；連續 &lt; 0 = 衰退警訊。
                <br>
                <span class="hint-mini">📌 <b>找不到去年同季 prior（FMP 免費 tier 只給 5 季）</b>時 fallback 到 <b>QoQ</b>（跟前一季比），會多一個 <span class="mode-tag mode-qoq">Q/Q</span> 標記 · <b>QoQ 有季節性</b>（Q4 常天生 &gt; Q1，別當成長率讀）· QoQ 值不套紅綠色，只有 YoY 才用色調傳達方向。</span>
            </p>
            ${renderNonOpBanner(fund)}
            <div class="fund-grid">
                ${renderTable('💵 EPS <span class="acct-tag" title="美股走 GAAP diluted EPS / 台股 IFRS · 詳見 verdict 下方說明">GAAP</span>', fund.eps, false, v => v.toFixed(2))}
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
            let h = `<div class="fund-cell"><h4>${title}</h4><table class="fund-table"><tr><th>季度</th><th>值</th><th>YoY / QoQ</th></tr>`;
            entries.forEach(e => {
                const tag = e.mode === 'QoQ'
                    ? ` <span class="mode-tag mode-qoq" title="QoQ · 跟前一季比，有季節性">Q/Q</span>`
                    : '';
                const cls = e.mode === 'YoY' ? yoyCls(e.yoy) : '';   // QoQ 用中性色
                h += `<tr><td>${e.date || '—'}</td><td>${fmtNum(e.value)}</td><td class="${cls}">${fmtYoY(e.yoy)}${tag}</td></tr>`;
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

        // SBC 佔 GAAP 淨利 TTM 比例（美股 FMP 才有 stockBasedCompensation 欄位）
        let sbcBanner = '';
        if (cf.sbcRatioTtm !== null && cf.sbcRatioTtm !== undefined) {
            const pct = cf.sbcRatioTtm * 100;
            let cls, msg;
            if (pct < 10) {
                cls = 'divergence-ok';
                msg = `✓ <b>SBC / GAAP 淨利 = ${pct.toFixed(1)}%</b>（近 4 季 TTM）· &lt; 10% · <b>SBC 影響輕微</b>，GAAP 淨利大致可信、Non-GAAP 差距小。`;
            } else if (pct < 25) {
                cls = 'divergence-warn';
                msg = `⚠️ <b>SBC / GAAP 淨利 = ${pct.toFixed(1)}%</b>（近 4 季 TTM）· 10-25% <b>中度稀釋</b>——看券商 / 公司公告的 Non-GAAP 數字時要打折扣，Non-GAAP PE 通常會比 GAAP PE 低 15-30%。`;
            } else {
                cls = 'divergence-warn';
                msg = `🚨 <b>SBC / GAAP 淨利 = ${pct.toFixed(1)}%</b>（近 4 季 TTM）· &gt; 25% <b>重度稀釋</b>——<b>SBC 是獲利結構的重要成分</b>，GAAP 跟 Non-GAAP 差距會很大。「股票薪酬是不是真實成本」是<b>價值觀選擇不是對錯</b>：Buffett 認為是（「若不是薪酬，那是什麼？」）；管理層在 Non-GAAP 裡把它加回去、認為那是「稀釋股本」不是「支出」。看這個數字決定你要用哪把尺 —— 這比爭論 PE 該用哪種更有實質意義。`;
            }
            sbcBanner = `<div class="divergence-banner ${cls}">${msg}</div>`;
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
            ${sbcBanner}
            <div class="fund-grid">
                ${renderCol('🏭 營運現金流', cf.operatingCF)}
                ${renderCol('🆓 自由現金流', cf.freeCF)}
                ${renderCol('📖 淨利（帳面）', cf.netIncome)}
                ${cf.sbc ? renderCol('💸 股票薪酬 (SBC)', cf.sbc) : ''}
            </div>
        `;
    }

    // 應收 / 存貨 / CapEx 季度表 · QoQ
    // 這是 CF 背離警訊指向的「回查對象」· 讓讀者直接看到膨脹速度
    // - 應收帳款：來自 BalanceSheet（點時值 · quarterly snapshot）
    // - 存貨：同上
    // - CapEx：來自 CashFlow · 已差分為單季（負值 · 現金流出）
    function renderQuarterlyDrilldown(cf, fund) {
        const bsSeries = fund && fund.balanceSheetSeries ? fund.balanceSheetSeries : null;
        const capExSeries = cf && cf.capExSeries ? cf.capExSeries : null;
        // 至少要有一組資料才顯示
        const hasBs = bsSeries && bsSeries.some(e => e.accountsReceivable !== null || e.inventories !== null);
        const hasCapEx = capExSeries && capExSeries.some(e => e.value !== null);
        if (!hasBs && !hasCapEx) return '';

        // 收集所有日期 · 用聯集（bsSeries 跟 capExSeries 可能日期集合不同）
        const dateSet = new Set();
        if (bsSeries) bsSeries.forEach(e => dateSet.add(e.date));
        if (capExSeries) capExSeries.forEach(e => dateSet.add(e.date));
        const dates = Array.from(dateSet).sort().reverse().slice(0, 10);   // 新→舊 · 最多 10 季

        // 索引化
        const bsByDate = new Map((bsSeries || []).map(e => [e.date, e]));
        const capExByDate = new Map((capExSeries || []).map(e => [e.date, e]));

        const fmtNum = v => {
            if (v === null || !isFinite(v)) return '—';
            const abs = Math.abs(v);
            if (abs >= 1e12) return (v / 1e12).toFixed(2) + '兆';
            if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(0);
        };
        const fmtQoQ = (cur, prev) => {
            if (cur === null || prev === null || !isFinite(cur) || !isFinite(prev) || prev === 0) return '—';
            const pct = (cur - prev) / Math.abs(prev) * 100;
            const sign = pct > 0 ? '+' : '';
            return `${sign}${pct.toFixed(1)}%`;
        };
        const qoqCls = (cur, prev, invert) => {
            if (cur === null || prev === null || !isFinite(cur) || !isFinite(prev) || prev === 0) return '';
            const pct = (cur - prev) / Math.abs(prev);
            // 應收/存貨反轉：快速膨脹 = 紅色警訊 · 收斂 = 綠色
            // CapEx 中性：擴產不一定壞
            if (invert) {
                if (pct > 0.15) return 'yoy-neg';
                if (pct < -0.05) return 'yoy-pos';
                return '';
            }
            return '';   // CapEx 不套色
        };

        // Feature 1 · DSO/DIO 週轉天數
        // DSO = 應收 / 營收 × 90 天（單季）· 判「收款要幾天」
        // DIO = 存貨 / 銷貨成本 × 90 天 · 銷貨成本 = 營收 × (1 - 毛利率)
        // 用 fund.revenue + fund.grossMargin 對日期查
        const revByDate = new Map((fund && fund.revenue ? fund.revenue : []).map(e => [e.date, e]));
        const gmByDate = new Map((fund && fund.grossMargin ? fund.grossMargin : []).map(e => [e.date, e]));
        const calcDSO = (ar, date) => {
            const rev = revByDate.get(date);
            if (!rev || !ar || rev.value === null || !isFinite(rev.value) || rev.value <= 0) return null;
            return ar / rev.value * 90;
        };
        const calcDIO = (inv, date) => {
            const rev = revByDate.get(date);
            const gm = gmByDate.get(date);
            if (!rev || !gm || !inv || rev.value === null || gm.value === null || !isFinite(rev.value) || !isFinite(gm.value)) return null;
            const cogs = rev.value * (1 - gm.value);
            if (cogs <= 0) return null;
            return inv / cogs * 90;
        };
        const fmtDays = d => (d === null || !isFinite(d)) ? '—' : Math.round(d) + '天';
        const daysCls = (cur, prev) => {
            if (cur === null || prev === null) return '';
            const delta = cur - prev;
            if (delta > 10) return 'yoy-neg';   // 週轉拉長 = 惡化
            if (delta < -5) return 'yoy-pos';   // 週轉收斂 = 改善
            return '';
        };

        // 建每一列（每季一列 · 對照前一季算 QoQ）
        let rows = '';
        for (let i = 0; i < dates.length; i++) {
            const d = dates[i];
            const nextD = dates[i + 1];
            const bs = bsByDate.get(d) || {};
            const bsPrev = nextD ? (bsByDate.get(nextD) || {}) : {};
            const capEx = capExByDate.get(d) || {};
            const capExPrev = nextD ? (capExByDate.get(nextD) || {}) : {};

            const ar = bs.accountsReceivable ?? null;
            const arPrev = bsPrev.accountsReceivable ?? null;
            const inv = bs.inventories ?? null;
            const invPrev = bsPrev.inventories ?? null;
            const cx = capEx.value ?? null;
            const cxPrev = capExPrev.value ?? null;

            const dso = calcDSO(ar, d);
            const dsoPrev = nextD ? calcDSO(arPrev, nextD) : null;
            const dio = calcDIO(inv, d);
            const dioPrev = nextD ? calcDIO(invPrev, nextD) : null;

            rows += `<tr>
                <td>${d}</td>
                <td>${fmtNum(ar)}</td>
                <td class="${qoqCls(ar, arPrev, true)}">${fmtQoQ(ar, arPrev)}</td>
                <td class="${daysCls(dso, dsoPrev)}"><b>${fmtDays(dso)}</b></td>
                <td>${fmtNum(inv)}</td>
                <td class="${qoqCls(inv, invPrev, true)}">${fmtQoQ(inv, invPrev)}</td>
                <td class="${daysCls(dio, dioPrev)}"><b>${fmtDays(dio)}</b></td>
                <td>${fmtNum(cx)}</td>
                <td>${fmtQoQ(cx, cxPrev)}</td>
            </tr>`;
        }

        // 最新一季 DSO/DIO verdict
        let daysVerdict = '';
        if (dates.length >= 2) {
            const latest = dates[0], prev = dates[1];
            const latestBs = bsByDate.get(latest) || {};
            const prevBs = bsByDate.get(prev) || {};
            const dsoLatest = calcDSO(latestBs.accountsReceivable, latest);
            const dsoPrev = calcDSO(prevBs.accountsReceivable, prev);
            const dioLatest = calcDIO(latestBs.inventories, latest);
            const dioPrev = calcDIO(prevBs.inventories, prev);
            const parts = [];
            if (dsoLatest !== null && dsoPrev !== null) {
                const delta = dsoLatest - dsoPrev;
                if (delta > 10) parts.push(`🚨 <b>收款週期 ${Math.round(dsoPrev)}天 → ${Math.round(dsoLatest)}天</b>（拉長 ${Math.round(delta)}天）· 對 CF 有直接壓力`);
                else if (delta < -5) parts.push(`✅ 收款週期 ${Math.round(dsoPrev)}天 → ${Math.round(dsoLatest)}天（改善 ${Math.round(-delta)}天）`);
                else parts.push(`ⓘ 收款週期穩定 ${Math.round(dsoLatest)}天`);
            }
            if (dioLatest !== null && dioPrev !== null) {
                const delta = dioLatest - dioPrev;
                if (delta > 10) parts.push(`🚨 <b>存貨週轉 ${Math.round(dioPrev)}天 → ${Math.round(dioLatest)}天</b>（拉長 ${Math.round(delta)}天）· 出貨壓力累積`);
                else if (delta < -5) parts.push(`✅ 存貨週轉 ${Math.round(dioPrev)}天 → ${Math.round(dioLatest)}天（改善 ${Math.round(-delta)}天）`);
                else parts.push(`ⓘ 存貨週轉穩定 ${Math.round(dioLatest)}天`);
            }
            if (parts.length > 0) {
                daysVerdict = `<div class="drilldown-verdict">${parts.join('<br>')}</div>`;
            }
        }

        return `
            <section class="panel drilldown-panel">
                <h3>🔎 應收 / 存貨 / CapEx · DSO / DIO（季度 · QoQ）</h3>
                <p class="hint">
                    <b>DSO</b>（收款週期）= 應收 ÷ 營收 × 90 · <b>DIO</b>（存貨週轉）= 存貨 ÷ 銷貨成本 × 90 · 這兩個直接答「收款要幾天 / 存貨要幾天才賣掉」·
                    比 QoQ 增長率<b>更能判斷絕對水位</b>。應收/存貨 QoQ &gt; 15% 就警訊 · DSO / DIO 一季拉長 &gt; 10 天更嚴重。
                </p>
                ${daysVerdict}
                <table class="fund-table drilldown-table">
                    <thead>
                        <tr>
                            <th>季度</th>
                            <th>應收帳款</th><th>QoQ</th><th>DSO<br><small>收款天數</small></th>
                            <th>存貨</th><th>QoQ</th><th>DIO<br><small>存貨天數</small></th>
                            <th>CapEx</th><th>QoQ</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }

    // Feature B · 資產負債結構 · 水平堆疊長條 + 表格 + ROE/ROA/ROIC/PB 摘要
    // 兩張 100% 長條（都以 TotalAssets 為分母 · 因為資產 = 負債 + 權益 · 兩張長度相等）
    // 上面：資產怎麼組成（現金 / 應收 / 存貨 / 其他流動 / 固定 / 無形 / 長期投資 / 其他）
    // 下面：資產怎麼被支撐（應付 / 其他流動負債 / 長期負債 / 其他負債 / 權益）
    function renderBalanceSheetHtml(analysis) {
        const bs = analysis.fundamentals && analysis.fundamentals.balanceSheetSnapshot;
        if (!bs || !bs.totalAssets || bs.totalAssets <= 0) return '';

        const TA = bs.totalAssets;
        const pct = v => (v === null || v === undefined || !isFinite(v)) ? 0 : (v / TA * 100);
        const fmtVal = v => {
            if (v === null || v === undefined || !isFinite(v)) return '—';
            const abs = Math.abs(v);
            if (abs >= 1e12) return (v / 1e12).toFixed(2) + '兆';
            if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(0);
        };
        const fmtPct = p => (p === 0 || !isFinite(p)) ? '—' : p.toFixed(1) + '%';

        // 資產分格（7 格 · 用實際值算 · 「其他」= TotalAssets - 已認識項目）
        const cashPct = pct(bs.cash);
        const arPct = pct(bs.accountsReceivable);
        const invPct = pct(bs.inventories);
        const otherCurrentPct = Math.max(0, pct(bs.currentAssets) - cashPct - arPct - invPct);
        const ppePct = pct(bs.ppe);
        const intangPct = pct(bs.intangibles);
        const ltInvPct = pct(bs.ltInvestments);
        const otherAssetPct = Math.max(0, 100 - cashPct - arPct - invPct - otherCurrentPct - ppePct - intangPct - ltInvPct);

        const assetSlices = [
            { label: '現金', pct: cashPct, color: '#10b981', val: bs.cash },
            { label: '應收', pct: arPct, color: '#3b82f6', val: bs.accountsReceivable },
            { label: '存貨', pct: invPct, color: '#f59e0b', val: bs.inventories },
            { label: '其他流動', pct: otherCurrentPct, color: '#a78bfa', val: (bs.currentAssets || 0) - (bs.cash || 0) - (bs.accountsReceivable || 0) - (bs.inventories || 0) },
            { label: '固定資產', pct: ppePct, color: '#6366f1', val: bs.ppe },
            { label: '無形', pct: intangPct, color: '#ec4899', val: bs.intangibles },
            { label: '長期投資', pct: ltInvPct, color: '#14b8a6', val: bs.ltInvestments },
            { label: '其他', pct: otherAssetPct, color: '#94a3b8', val: (TA - ((bs.currentAssets || 0) + (bs.ppe || 0) + (bs.intangibles || 0) + (bs.ltInvestments || 0))) },
        ];

        // 負債+權益（5 格 · 因為 Assets = Liab + Equity · 兩條長度一致代表資產 100%）
        const apPct = pct(bs.accountsPayable);
        const otherCLPct = Math.max(0, pct(bs.currentLiabilities) - apPct);
        const ltDebtPct = pct(bs.longTermDebt);
        const totalLPct = pct(bs.totalLiabilities);
        const otherLPct = Math.max(0, totalLPct - pct(bs.currentLiabilities) - ltDebtPct);
        const equityPct = pct(bs.equity);
        const financeSlices = [
            { label: '應付', pct: apPct, color: '#ef4444', val: bs.accountsPayable },
            { label: '其他流動負債', pct: otherCLPct, color: '#f97316', val: (bs.currentLiabilities || 0) - (bs.accountsPayable || 0) },
            { label: '長期負債', pct: ltDebtPct, color: '#dc2626', val: bs.longTermDebt },
            { label: '其他負債', pct: otherLPct, color: '#fb923c', val: (bs.totalLiabilities || 0) - (bs.currentLiabilities || 0) - (bs.longTermDebt || 0) },
            { label: '權益', pct: equityPct, color: '#16a34a', val: bs.equity },
        ];

        // 水平堆疊長條 SVG
        const renderStackedBar = (slices, height) => {
            const W = 800;
            let x = 0;
            const rects = [];
            const labels = [];
            slices.forEach(s => {
                if (s.pct <= 0) return;
                const w = s.pct / 100 * W;
                rects.push(`<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${s.color}" stroke="#fff" stroke-width="0.5"><title>${s.label}: ${fmtPct(s.pct)} · ${fmtVal(s.val)}</title></rect>`);
                // 只在 pct > 5% 才標籤 · 避免擠
                if (s.pct >= 5) {
                    const midX = x + w / 2;
                    labels.push(`<text x="${midX.toFixed(1)}" y="${(height/2 + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${s.label} ${s.pct.toFixed(0)}%</text>`);
                }
                x += w;
            });
            return `<svg viewBox="0 0 ${W} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${rects.join('')}${labels.join('')}</svg>`;
        };

        // 詳細表格
        const renderTable = (title, slices) => {
            let rowsHtml = '';
            slices.forEach(s => {
                if (s.val === 0 || s.val === null || s.val === undefined) return;
                rowsHtml += `<tr>
                    <td><span class="bs-swatch" style="background:${s.color}"></span>${s.label}</td>
                    <td>${fmtVal(s.val)}</td>
                    <td>${fmtPct(s.pct)}</td>
                </tr>`;
            });
            return `<div class="fund-cell">
                <h4>${title}</h4>
                <table class="fund-table bs-table">
                    <tr><th>項目</th><th>絕對值</th><th>佔資產%</th></tr>
                    ${rowsHtml}
                </table>
            </div>`;
        };

        // 摘要指標
        const pb = analysis.currentPBR;
        const metricRow = (label, val, unit, tooltip) => `
            <div class="bs-metric" title="${tooltip || ''}">
                <div class="bs-metric-label">${label}</div>
                <div class="bs-metric-val">${val === null || !isFinite(val) ? 'N/A' : val.toFixed(1) + unit}</div>
            </div>`;

        // 結構解讀
        let structNote = '';
        if (equityPct >= 60) structNote = `💪 <b>權益佔 ${equityPct.toFixed(0)}%</b> · 財務結構穩健 · 靠自有資本支撐 · 抗景氣衝擊能力強`;
        else if (equityPct >= 40) structNote = `⚖️ 權益佔 ${equityPct.toFixed(0)}% · 中性資本結構 · 有借力也有自己撐`;
        else structNote = `⚠️ <b>權益僅佔 ${equityPct.toFixed(0)}%</b>（負債佔 ${totalLPct.toFixed(0)}%）· 高槓桿 · 利率上升時利息壓力大`;

        // 資產類型分類
        let assetTypeNote = '';
        if (ppePct >= 40) assetTypeNote = `🏭 <b>固定資產佔 ${ppePct.toFixed(0)}%</b> · 典型製造業/資本密集型（半導體、鋼鐵、營建）· CapEx 週期會直接影響 FCF`;
        else if (intangPct >= 30) assetTypeNote = `🧠 <b>無形資產佔 ${intangPct.toFixed(0)}%</b>（含商譽）· 品牌 / 併購 / 軟體型公司 · 要看是併購商譽（減值風險）還是自研品牌（護城河）`;
        else if (cashPct >= 25) assetTypeNote = `💵 <b>現金佔 ${cashPct.toFixed(0)}%</b> · 資產輕、現金充沛 · 可能是軟體/服務業 or 保守累積`;

        // 「其他流動負債」拆解：預收款 = 訂單能見度指標 · 短期借款 = 資金壓力
        // otherCL total = CurrentLiab - AP · 上面已算 · 這裡拆內部細項
        const otherCLTotal = (bs.currentLiabilities || 0) - (bs.accountsPayable || 0);
        const clBreakdown = [
            { label: '合約負債（預收款）', val: bs.contractLiabilities, color: '#10b981', note: '訂單能見度指標 · 越高越好' },
            { label: '短期借款', val: bs.shortTermBorrowings, color: '#dc2626', note: '資金週轉壓力 · 越高越糟' },
            { label: '其他應付款（應計費用）', val: bs.otherPayables, color: '#f97316', note: '應付薪資 · 應計費用 · 中性' },
            { label: '應付所得稅', val: bs.currentTaxLiabilities, color: '#a78bfa', note: '本期稅款 · 中性' },
        ].filter(s => s.val !== null && s.val > 0);
        const clKnownSum = clBreakdown.reduce((s, e) => s + e.val, 0);
        const clOther = Math.max(0, otherCLTotal - clKnownSum);
        if (clOther > 0) {
            clBreakdown.push({ label: '其他（未拆解）', val: clOther, color: '#94a3b8', note: '資料源沒揭露這些欄位' });
        }

        // 訂單能見度 verdict（基於預收款占資產比例）
        let orderVisibilityNote = '';
        if (bs.contractLiabilities !== null && bs.contractLiabilities > 0) {
            const clPct = pct(bs.contractLiabilities);
            if (clPct >= 10) {
                orderVisibilityNote = `🎯 <b>合約負債（預收款）${fmtVal(bs.contractLiabilities)} · 佔資產 ${clPct.toFixed(1)}%</b> · <b>訂單能見度真實存在</b> · 客戶已經先付錢卡單 · 這是最誠實的 backlog 指標`;
            } else if (clPct >= 3) {
                orderVisibilityNote = `📌 合約負債佔資產 ${clPct.toFixed(1)}% · 有些預收款 · 訂單能見度中性`;
            }
        }
        if (bs.shortTermBorrowings !== null && bs.shortTermBorrowings > 0) {
            const sbPct = pct(bs.shortTermBorrowings);
            if (sbPct >= 15) {
                orderVisibilityNote += (orderVisibilityNote ? '<br>' : '') + `⚠️ <b>短期借款佔資產 ${sbPct.toFixed(1)}%</b> · 資金週轉壓力大 · 利率上升時利息成本會直接吃獲利`;
            }
        }

        // 拆解 sub-table
        let clBreakdownHtml = '';
        if (clBreakdown.length > 0 && otherCLTotal > 0) {
            let rows = '';
            clBreakdown.forEach(s => {
                const percent = s.val / bs.totalAssets * 100;
                const percentOfCL = s.val / otherCLTotal * 100;
                rows += `<tr>
                    <td><span class="bs-swatch" style="background:${s.color}"></span>${s.label}</td>
                    <td>${fmtVal(s.val)}</td>
                    <td>${percent.toFixed(1)}%</td>
                    <td>${percentOfCL.toFixed(0)}%</td>
                    <td class="hint-mini">${s.note}</td>
                </tr>`;
            });
            clBreakdownHtml = `
                <details class="bs-cl-details" open>
                    <summary><b>🔍 「其他流動負債」拆解</b>（總 ${fmtVal(otherCLTotal)} · 佔資產 ${(otherCLTotal / bs.totalAssets * 100).toFixed(1)}%）</summary>
                    <p class="hint-mini" style="margin:8px 0">
                        <b>為什麼要拆</b>：「其他流動負債」常常佔比很大但沒揭露內容 · 兩種完全相反的可能：
                        <br>· <b>合約負債（預收款）</b>多 = 訂單能見度真實存在 = 正面訊號
                        <br>· <b>短期借款</b>多 = 資金週轉壓力 = 負面訊號
                    </p>
                    <table class="fund-table bs-table">
                        <thead><tr><th>項目</th><th>絕對值</th><th>佔資產%</th><th>佔流動非應付%</th><th>意義</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </details>
            `;
        }

        return `
            <section class="panel balance-sheet-panel">
                <h3>🏦 資產負債結構（${bs.date} · ${bs.source}）</h3>
                <p class="hint">
                    兩條長條都以 <b>總資產 = 100%</b> 為分母（因為 Assets = Liabilities + Equity）· 一眼看到「這公司什麼結構撐起來的」。
                    百分比 &gt; 5% 才顯示標籤 · 滑鼠停格看小段落絕對值。
                </p>
                ${structNote ? `<div class="bs-note">${structNote}</div>` : ''}
                ${assetTypeNote ? `<div class="bs-note">${assetTypeNote}</div>` : ''}
                ${orderVisibilityNote ? `<div class="bs-note">${orderVisibilityNote}</div>` : ''}

                <h4 style="margin-top:14px">📈 資產結構（Total = ${fmtVal(TA)}）</h4>
                ${renderStackedBar(assetSlices, 32)}

                <h4 style="margin-top:14px">📉 負債 + 權益（同一 100% · 誰在支撐這些資產）</h4>
                ${renderStackedBar(financeSlices, 32)}

                <div class="bs-metrics-row">
                    ${metricRow('ROE', bs.roe, '%', 'TTM 淨利 / 期末權益')}
                    ${metricRow('ROA', bs.roa, '%', 'TTM 淨利 / 總資產')}
                    ${metricRow('ROIC', bs.roic, '%', 'NOPAT / (權益+長期債) · TW 假設稅率 20%')}
                    ${metricRow('P/B', pb, '×', '股價 / 每股淨值')}
                </div>

                ${clBreakdownHtml}

                <div class="fund-grid" style="margin-top:14px">
                    ${renderTable('📈 資產項目', assetSlices)}
                    ${renderTable('📉 負債 + 權益', financeSlices)}
                </div>
            </section>
        `;
    }

    // Feature · 機構持股集中度（13F · US 專用）
    // 前 20 大機構 + top 5/10 集中度 · 判「主力誰在」+「有沒有大戶跑」
    function renderInstitutionalOwnershipHtml(analysis) {
        const io = analysis.fundamentals && analysis.fundamentals.institutionalOwnership;
        if (!io || !io.holders || io.holders.length === 0) return '';

        const holders = io.holders;
        const totalShares = holders.reduce((s, h) => s + (h.sharesNumber || 0), 0);
        const top5 = holders.slice(0, 5).reduce((s, h) => s + (h.sharesNumber || 0), 0);
        const top10 = holders.slice(0, 10).reduce((s, h) => s + (h.sharesNumber || 0), 0);
        const top5Pct = totalShares > 0 ? (top5 / totalShares * 100) : 0;
        const top10Pct = totalShares > 0 ? (top10 / totalShares * 100) : 0;

        const fmtShares = v => {
            if (!v || !isFinite(v)) return '—';
            if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
            return v.toFixed(0);
        };
        const fmtVal = v => {
            if (!v || !isFinite(v)) return '—';
            if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
            return '$' + v.toFixed(0);
        };

        // 集中度 verdict
        let concentrationNote = '';
        if (top5Pct >= 30) {
            concentrationNote = `⚠️ <b>前 5 大機構持股集中 ${top5Pct.toFixed(1)}%</b> · 高集中度 · 若其中任一大戶調倉 · 對股價有明顯影響`;
        } else if (top5Pct >= 20) {
            concentrationNote = `📌 前 5 大機構持股 ${top5Pct.toFixed(1)}% · 中度集中`;
        } else {
            concentrationNote = `✅ 前 5 大機構持股 ${top5Pct.toFixed(1)}% · 分散度高 · 沒單一大戶主導`;
        }

        // 部位變化訊號（若 change 或 changeInSharesNumber 有資料）
        let changesHtml = '';
        const withChanges = holders.filter(h => h.changeInSharesNumber !== undefined && h.changeInSharesNumber !== 0);
        if (withChanges.length > 0) {
            const bigBuys = withChanges.filter(h => h.changeInSharesNumber > 0)
                .sort((a, b) => (b.changeInSharesNumber || 0) - (a.changeInSharesNumber || 0)).slice(0, 3);
            const bigSells = withChanges.filter(h => h.changeInSharesNumber < 0)
                .sort((a, b) => (a.changeInSharesNumber || 0) - (b.changeInSharesNumber || 0)).slice(0, 3);
            const chgLines = [];
            if (bigBuys.length > 0) {
                chgLines.push('🟢 <b>本季加碼</b>：' + bigBuys.map(h =>
                    `${(h.investorName || '').slice(0, 20)} +${fmtShares(h.changeInSharesNumber)} 股`).join(' · '));
            }
            if (bigSells.length > 0) {
                chgLines.push('🔴 <b>本季減碼</b>：' + bigSells.map(h =>
                    `${(h.investorName || '').slice(0, 20)} ${fmtShares(h.changeInSharesNumber)} 股`).join(' · '));
            }
            if (chgLines.length > 0) {
                changesHtml = `<div class="io-changes">${chgLines.join('<br>')}</div>`;
            }
        }

        // 前 10 大機構表格
        const holderRows = holders.slice(0, 10).map((h, i) => {
            const name = (h.investorName || '—');
            const shares = h.sharesNumber || 0;
            const marketValue = h.marketValue || 0;
            const pctOwn = h.ownership || (totalShares > 0 ? shares / totalShares * 100 : 0);
            const change = h.changeInSharesNumber;
            const changeStr = change !== undefined && change !== null && change !== 0
                ? `<span class="${change > 0 ? 'yoy-pos' : 'yoy-neg'}">${change > 0 ? '+' : ''}${fmtShares(change)}</span>`
                : '—';
            return `<tr>
                <td>${i + 1}</td>
                <td>${name.slice(0, 30)}</td>
                <td>${fmtShares(shares)}</td>
                <td>${pctOwn ? pctOwn.toFixed(2) + '%' : '—'}</td>
                <td>${fmtVal(marketValue)}</td>
                <td>${changeStr}</td>
            </tr>`;
        }).join('');

        return `
            <section class="panel io-panel">
                <h3>🏛️ 機構持股集中度（13F · ${io.year} Q${io.quarter}）</h3>
                <p class="hint">
                    <b>SEC Form 13F</b> 每季揭露 · $100M+ AUM 機構必須申報。<b>集中度高</b>= 少數大戶主導 · 誰調倉股價就跟著動 ·
                    <b>集中度低</b>= 分散度高 · 沒單一大戶能撼動。看<b>本季加碼/減碼</b>比看誰持股更有訊號。
                </p>
                <div class="bs-metrics-row">
                    <div class="bs-metric" title="前 5 大機構持股佔全部 13F 揭露總股數"><div class="bs-metric-label">Top 5 集中</div><div class="bs-metric-val">${top5Pct.toFixed(1)}%</div></div>
                    <div class="bs-metric" title="前 10 大機構持股佔全部 13F 揭露總股數"><div class="bs-metric-label">Top 10 集中</div><div class="bs-metric-val">${top10Pct.toFixed(1)}%</div></div>
                    <div class="bs-metric" title="全 13F 機構持股總數"><div class="bs-metric-label">機構總持</div><div class="bs-metric-val">${fmtShares(totalShares)}</div></div>
                </div>
                <div class="bs-note" style="margin-top:8px">${concentrationNote}</div>
                ${changesHtml}
                <details class="io-details" open>
                    <summary><b>🏛️ 前 10 大機構</b>（點展開）</summary>
                    <table class="fund-table io-table">
                        <thead>
                            <tr><th>#</th><th>機構名</th><th>股數</th><th>持股%</th><th>市值</th><th>本季變化</th></tr>
                        </thead>
                        <tbody>${holderRows}</tbody>
                    </table>
                </details>
            </section>
        `;
    }

    // Feature · 內部人持股變化（US 專用）· 表格 + 3 個月淨買賣
    function renderInsiderTradingHtml(analysis) {
        const it = analysis.fundamentals && analysis.fundamentals.insiderTrading;
        if (!it || !it.transactions || it.transactions.length === 0) return '';

        const fmtShares = v => {
            if (v === null || !isFinite(v) || v === 0) return '0';
            const abs = Math.abs(v);
            const sign = v > 0 ? '+' : (v < 0 ? '-' : '');
            if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
            if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
            return sign + abs.toFixed(0);
        };
        const fmtVal = v => {
            if (v === null || !isFinite(v) || v === 0) return '$0';
            const abs = Math.abs(v);
            const sign = v > 0 ? '+' : (v < 0 ? '-' : '');
            if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
            if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
            if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
            return sign + '$' + abs.toFixed(0);
        };

        // 3 個月淨買賣 verdict
        let verdict = '';
        const netShares = it.netShares3M || 0;
        const netValue = it.netValue3M || 0;
        if (it.buys3M === 0 && it.sells3M === 0) {
            verdict = '📌 近 90 天沒有內部人交易紀錄';
        } else if (netShares > 0 && netValue > 0) {
            verdict = `🟢 <b>內部人近 90 天淨買 ${fmtShares(Math.abs(netShares))} 股（${fmtVal(Math.abs(netValue))}）</b> · 高階主管/董事真金白銀進場 · 通常是有信心訊號`;
        } else if (netShares < 0 && Math.abs(netValue) > 1e6) {
            verdict = `🔴 <b>內部人近 90 天淨賣 ${fmtShares(Math.abs(netShares))} 股（${fmtVal(Math.abs(netValue))}）</b> · 大量脫手 · 但可能是分散配置/稅務規劃 · 不必然是壞訊號 · 看是否集中在 CEO/CFO 這種內線敏感度高的人`;
        } else {
            verdict = `⚖️ 內部人近 90 天買賣接近平衡（買 ${fmtShares(it.buys3M)} 賣 ${fmtShares(it.sells3M)}）`;
        }

        // 交易表（近 20 筆）
        const txnRows = it.transactions.slice(0, 15).map(t => {
            const shares = t.securitiesTransacted || 0;
            const price = t.price || 0;
            const type = (t.acquisitionOrDisposition || t.transactionType || '').toUpperCase();
            const typeLabel = (type === 'A' || type === 'P' || type.includes('BUY')) ? '🟢 買'
                            : (type === 'D' || type === 'S' || type.includes('SELL')) ? '🔴 賣'
                            : '⚪ 其他';
            const name = (t.reportingName || '—').slice(0, 20);
            const title = t.typeOfOwner || t.title || '';
            return `<tr>
                <td>${(t.filingDate || t.transactionDate || '—').slice(0, 10)}</td>
                <td>${name}${title ? ' <small style="color:#94a3b8">(' + title.slice(0, 15) + ')</small>' : ''}</td>
                <td>${typeLabel}</td>
                <td>${fmtShares(shares)}</td>
                <td>${price ? '$' + price.toFixed(2) : '—'}</td>
                <td>${fmtVal(shares * price)}</td>
            </tr>`;
        }).join('');

        return `
            <section class="panel insider-panel">
                <h3>👔 內部人持股變化（Form 4 · 近 100 筆）</h3>
                <p class="hint">
                    高階主管 / 董事 / 10% 以上大股東的股票交易紀錄（SEC Form 4 揭露）·
                    <b>大額買入</b>比賣出更有訊號（買通常代表信心 · 賣可能是分散/稅務規劃）·
                    看是否集中在 CEO/CFO 這種內線敏感度高的職位。
                </p>
                <div class="insider-verdict">${verdict}</div>
                <table class="fund-table insider-table">
                    <thead>
                        <tr><th>日期</th><th>姓名</th><th>類型</th><th>股數</th><th>單價</th><th>金額</th></tr>
                    </thead>
                    <tbody>${txnRows}</tbody>
                </table>
            </section>
        `;
    }

    // Feature · 歷年配息 + 庫藏股（TW + US 通用）
    function renderDividendBuybackHtml(analysis) {
        const dh = analysis.fundamentals && analysis.fundamentals.dividendHistory;
        const bb = analysis.fundamentals && analysis.fundamentals.buybackHistory;
        if ((!dh || dh.length === 0) && (!bb || bb.length === 0)) return '';

        const isTW = analysis.source === 'FinMind';
        const price = analysis.price;

        const fmtNum = v => {
            if (v === null || !isFinite(v) || v === 0) return '—';
            const abs = Math.abs(v);
            if (abs >= 1e12) return (v / 1e12).toFixed(2) + '兆';
            if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(2);
        };

        // 配息 bar chart（10 年 · 現金+股票 stacked · TW 專用 · US 只有 cash）
        let divChartHtml = '';
        if (dh && dh.length > 0) {
            const yearsSorted = dh.slice().reverse();   // 舊→新
            const maxTotal = Math.max(...yearsSorted.map(d => d.cash + d.stock));
            const barW = 40, gap = 12, W = yearsSorted.length * (barW + gap) + 60, H = 200;
            const bars = yearsSorted.map((d, i) => {
                const total = d.cash + d.stock;
                if (total <= 0) return '';
                const x = 40 + i * (barW + gap);
                const cashH = (d.cash / maxTotal) * 150;
                const stockH = (d.stock / maxTotal) * 150;
                const cashY = 170 - cashH;
                const stockY = cashY - stockH;
                return `<g>
                    ${d.stock > 0 ? `<rect x="${x}" y="${stockY}" width="${barW}" height="${stockH}" fill="#a78bfa"><title>${d.year} 股票股利 ${fmtNum(d.stock)}</title></rect>` : ''}
                    <rect x="${x}" y="${cashY}" width="${barW}" height="${cashH}" fill="#10b981"><title>${d.year} 現金股利 ${fmtNum(d.cash)}</title></rect>
                    <text x="${x + barW/2}" y="185" text-anchor="middle" font-size="11" fill="#64748b">${d.year.slice(-2)}</text>
                    <text x="${x + barW/2}" y="${cashY - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#065f46">${d.cash.toFixed(2)}</text>
                </g>`;
            }).join('');
            divChartHtml = `
                <div style="margin-top:10px">
                    <h4>💰 歷年配息（${isTW ? '每股 · 現金 + 股票' : '每股現金'}）</h4>
                    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg">
                        <line x1="40" y1="170" x2="${W - 10}" y2="170" stroke="#334155" stroke-width="1"/>
                        ${bars}
                        ${isTW ? '<g><rect x="40" y="10" width="12" height="12" fill="#10b981"/><text x="56" y="20" font-size="11" fill="#334155">現金</text><rect x="90" y="10" width="12" height="12" fill="#a78bfa"/><text x="106" y="20" font-size="11" fill="#334155">股票</text></g>' : ''}
                    </svg>
                </div>
            `;
        }

        // 摘要指標
        const latestDiv = dh && dh[0] ? dh[0] : null;
        const totalLatestCash = latestDiv ? latestDiv.cash : 0;
        const yieldPct = (totalLatestCash > 0 && price > 0) ? (totalLatestCash / price * 100) : null;
        const avg5Cash = dh && dh.length >= 3 ? dh.slice(0, Math.min(5, dh.length)).reduce((s, d) => s + d.cash, 0) / Math.min(5, dh.length) : null;
        const growth = (latestDiv && avg5Cash && avg5Cash > 0) ? ((latestDiv.cash / avg5Cash - 1) * 100) : null;

        // 庫藏股摘要
        let buybackSummary = '';
        if (bb && bb.length > 0) {
            const total3Y = bb.slice(0, 3).reduce((s, e) => s + e.amount, 0);
            const total5Y = bb.slice(0, 5).reduce((s, e) => s + e.amount, 0);
            const latest = bb[0];
            buybackSummary = `
                <div style="margin-top:10px">
                    <h4>🔄 庫藏股（買回股本）</h4>
                    <div class="bs-metrics-row">
                        <div class="bs-metric" title="最新年度"><div class="bs-metric-label">${latest.year}</div><div class="bs-metric-val">${fmtNum(latest.amount)}</div></div>
                        <div class="bs-metric" title="近 3 年累計"><div class="bs-metric-label">3Y 累計</div><div class="bs-metric-val">${fmtNum(total3Y)}</div></div>
                        <div class="bs-metric" title="近 5 年累計"><div class="bs-metric-label">5Y 累計</div><div class="bs-metric-val">${fmtNum(total5Y)}</div></div>
                    </div>
                </div>
            `;
        } else if (!isTW) {
            buybackSummary = `<div style="margin-top:10px"><h4>🔄 庫藏股</h4><p class="hint-mini">📌 這公司近 10 年 cash flow 沒偵測到明顯 buyback（commonStockRepurchased ≈ 0）</p></div>`;
        }

        // 配息穩定度 verdict
        let divVerdict = '';
        if (dh && dh.length >= 3) {
            const posYears = dh.slice(0, 5).filter(d => d.cash > 0).length;
            const total5 = Math.min(5, dh.length);
            if (posYears === total5) divVerdict = `🟢 <b>近 ${total5} 年連續配息</b> · 穩定度高`;
            else if (posYears >= total5 - 1) divVerdict = `🟡 近 ${total5} 年配息 ${posYears} 年 · 大致穩定`;
            else divVerdict = `⚠️ 近 ${total5} 年只 ${posYears} 年有配息 · 不穩定 or 週期性`;
            if (growth !== null) {
                const g = growth.toFixed(0);
                divVerdict += growth > 20 ? ` · <b>最新 vs 5Y 平均 +${g}% · 加碼中</b>`
                            : growth < -20 ? ` · <b>最新 vs 5Y 平均 ${g}% · 減碼</b>`
                            : ` · 最新 vs 5Y 平均 ${g > 0 ? '+' : ''}${g}%`;
            }
        }

        return `
            <section class="panel dividend-panel">
                <h3>💵 歷年配息 + 庫藏股（資本回饋政策）</h3>
                <p class="hint">
                    公司拿獲利做兩件事：<b>配息</b>（現金給股東）跟<b>買回股本</b>（減少流通股 · 拉高 EPS）·
                    連續配息 = 現金流穩健 · 買回 = 對自己股價有信心 or 沒更好投資機會。
                </p>
                <div class="bs-metrics-row">
                    <div class="bs-metric" title="以最新一年現金股利 / 當前股價"><div class="bs-metric-label">當前殖利率</div><div class="bs-metric-val">${yieldPct !== null ? yieldPct.toFixed(2) + '%' : '—'}</div></div>
                    <div class="bs-metric" title="最新年度現金股利"><div class="bs-metric-label">最新配息</div><div class="bs-metric-val">${latestDiv ? fmtNum(latestDiv.cash) : '—'}</div></div>
                    <div class="bs-metric" title="近 5 年現金配息平均"><div class="bs-metric-label">5Y 平均</div><div class="bs-metric-val">${avg5Cash !== null ? fmtNum(avg5Cash) : '—'}</div></div>
                    <div class="bs-metric" title="最新 vs 5Y 平均"><div class="bs-metric-label">5Y 成長</div><div class="bs-metric-val">${growth !== null ? (growth > 0 ? '+' : '') + growth.toFixed(0) + '%' : '—'}</div></div>
                </div>
                ${divVerdict ? `<div class="bs-note" style="margin-top:8px">${divVerdict}</div>` : ''}
                ${divChartHtml}
                ${buybackSummary}
            </section>
        `;
    }

    // Step B · 軌跡圖：營收 × 毛利（4 象限散點時序）
    // X = 毛利率 YoY 變化（pp）· Y = 營收 YoY（%）· 每季一點按時序連線
    // 4 象限：右上「量價齊揚」· 左上「殺價衝量」· 右下「收縮升級」· 左下「全面衰退」
    function renderMarginTrajectoryHtml(fund) {
        if (!fund || !fund.revenue || !fund.grossMargin) return '';
        // 對齊營收 + 毛利率同一季度（都要 YoY mode 才有 pp 變化）
        const marginByDate = {};
        fund.grossMargin.forEach(e => {
            if (e.date && e.yoy !== null && isFinite(e.yoy) && e.mode === 'YoY') {
                marginByDate[e.date] = e.yoy * 100;
            }
        });
        const points = [];
        fund.revenue.forEach(e => {
            if (e.date && e.yoy !== null && isFinite(e.yoy) && e.mode === 'YoY' && marginByDate[e.date] !== undefined) {
                const q = extractQuarter(e.date);
                points.push({
                    date: e.date,
                    label: e.date.slice(2, 4) + q,   // e.g. "25Q1"
                    revYoY: e.yoy * 100,
                    marginPP: marginByDate[e.date],
                });
            }
        });
        if (points.length < 3) return '';   // 樣本太少不畫

        points.sort((a, b) => a.date.localeCompare(b.date));   // 舊→新

        // 資料範圍 + pad
        const maxRev = Math.max(...points.map(p => Math.abs(p.revYoY)));
        const maxPP = Math.max(...points.map(p => Math.abs(p.marginPP)));
        const yRange = Math.max(15, Math.ceil(maxRev * 1.2 / 10) * 10);
        const xRange = Math.max(3, Math.ceil(maxPP * 1.2));

        // SVG 座標
        const W = 640, H = 460;
        const padL = 60, padR = 30, padT = 40, padB = 60;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const cx = padL + plotW / 2, cy = padT + plotH / 2;
        const xToPx = x => cx + (x / xRange) * (plotW / 2);
        const yToPx = y => cy - (y / yRange) * (plotH / 2);

        // 4 象限背景
        const qBg = `
            <rect x="${cx}" y="${padT}" width="${plotW/2}" height="${plotH/2}" fill="#dcfce7" opacity="0.35"/>
            <rect x="${padL}" y="${padT}" width="${plotW/2}" height="${plotH/2}" fill="#fef3c7" opacity="0.35"/>
            <rect x="${cx}" y="${cy}" width="${plotW/2}" height="${plotH/2}" fill="#dbeafe" opacity="0.35"/>
            <rect x="${padL}" y="${cy}" width="${plotW/2}" height="${plotH/2}" fill="#fee2e2" opacity="0.35"/>
        `;
        const qLabels = `
            <text x="${cx + plotW/4}" y="${padT + 16}" text-anchor="middle" font-size="11" font-weight="700" fill="#065f46">量價齊揚 ✨</text>
            <text x="${padL + plotW/4}" y="${padT + 16}" text-anchor="middle" font-size="11" font-weight="700" fill="#92400e">殺價衝量 ⚠️</text>
            <text x="${cx + plotW/4}" y="${padT + plotH - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e40af">收縮升級 🎯</text>
            <text x="${padL + plotW/4}" y="${padT + plotH - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#991b1b">全面衰退 💀</text>
        `;

        // 軸線
        const zeroX = `<line x1="${cx}" y1="${padT}" x2="${cx}" y2="${padT+plotH}" stroke="#1e293b" stroke-width="1.5"/>`;
        const zeroY = `<line x1="${padL}" y1="${cy}" x2="${padL+plotW}" y2="${cy}" stroke="#1e293b" stroke-width="1.5"/>`;
        const xLabel = `<text x="${cx}" y="${H - 20}" text-anchor="middle" font-size="12" font-weight="700" fill="#334155">毛利率 YoY 變化（pp）→</text>`;
        const yLabel = `<text x="18" y="${cy}" text-anchor="middle" font-size="12" font-weight="700" fill="#334155" transform="rotate(-90 18 ${cy})">↑ 營收 YoY（%）</text>`;

        // 刻度
        const ticks = [];
        [-yRange, -yRange/2, yRange/2, yRange].forEach(v => {
            const y = yToPx(v);
            ticks.push(`<line x1="${cx-4}" y1="${y}" x2="${cx+4}" y2="${y}" stroke="#64748b" stroke-width="1"/>`);
            ticks.push(`<text x="${cx-8}" y="${y+4}" text-anchor="end" font-size="10" fill="#64748b">${v > 0 ? '+' : ''}${v}%</text>`);
        });
        [-xRange, -xRange/2, xRange/2, xRange].forEach(v => {
            const x = xToPx(v);
            ticks.push(`<line x1="${x}" y1="${cy-4}" x2="${x}" y2="${cy+4}" stroke="#64748b" stroke-width="1"/>`);
            ticks.push(`<text x="${x}" y="${cy+16}" text-anchor="middle" font-size="10" fill="#64748b">${v > 0 ? '+' : ''}${v.toFixed(1)}pp</text>`);
        });

        // 軌跡線（漸變透明度：舊淡新深）
        const pathSegs = [];
        for (let i = 1; i < points.length; i++) {
            const opa = 0.25 + 0.65 * (i / (points.length - 1));
            const x1 = xToPx(points[i-1].marginPP), y1 = yToPx(points[i-1].revYoY);
            const x2 = xToPx(points[i].marginPP), y2 = yToPx(points[i].revYoY);
            pathSegs.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" opacity="${opa.toFixed(2)}"/>`);
        }
        // 最新一段箭頭
        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        const arrowX = xToPx(last.marginPP), arrowY = yToPx(last.revYoY);
        const dx = arrowX - xToPx(prev.marginPP), dy = arrowY - yToPx(prev.revYoY);
        const angle = Math.atan2(dy, dx);
        const ax1 = arrowX - 9 * Math.cos(angle - 0.4);
        const ay1 = arrowY - 9 * Math.sin(angle - 0.4);
        const ax2 = arrowX - 9 * Math.cos(angle + 0.4);
        const ay2 = arrowY - 9 * Math.sin(angle + 0.4);
        const arrow = `<polygon points="${arrowX},${arrowY} ${ax1.toFixed(1)},${ay1.toFixed(1)} ${ax2.toFixed(1)},${ay2.toFixed(1)}" fill="#7c3aed"/>`;

        // 點
        const dots = points.map((p, i) => {
            const x = xToPx(p.marginPP), y = yToPx(p.revYoY);
            const isLast = i === points.length - 1;
            const r = isLast ? 6 : 4;
            const fill = isLast ? '#7c3aed' : '#a78bfa';
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>`;
        }).join('');

        // 標籤（首、末、隔幾個）· 避免擠
        const step = Math.max(1, Math.floor(points.length / 5));
        const labels = points.map((p, i) => {
            if (i !== 0 && i !== points.length - 1 && i % step !== 0) return '';
            const x = xToPx(p.marginPP), y = yToPx(p.revYoY);
            const isLast = i === points.length - 1;
            return `<text x="${(x+7).toFixed(1)}" y="${(y-6).toFixed(1)}" font-size="${isLast ? 11 : 10}" font-weight="${isLast ? 700 : 500}" fill="${isLast ? '#5b21b6' : '#64748b'}">${p.label}</text>`;
        }).join('');

        // Verdict
        let verdict = '', vColor = '';
        if (last.revYoY > 0 && last.marginPP > 0) { verdict = '✨ 最新一季落在「量價齊揚」象限 · 營收成長 + 毛利改善 · 成長股最好的訊號'; vColor = '#065f46'; }
        else if (last.revYoY > 0 && last.marginPP < 0) { verdict = '⚠️ 最新一季落在「殺價衝量」象限 · 營收有成長但毛利在稀釋 · 常見於報價戰 / 促銷策略'; vColor = '#92400e'; }
        else if (last.revYoY < 0 && last.marginPP > 0) { verdict = '🎯 最新一季落在「收縮升級」象限 · 營收縮但毛利改善 · 常見於高階產品聚焦'; vColor = '#1e40af'; }
        else { verdict = '💀 最新一季落在「全面衰退」象限 · 營收縮 + 毛利也退 · 產業或公司體質有問題'; vColor = '#991b1b'; }

        return `
            <section class="panel trajectory-panel">
                <h3>📊 營收 × 毛利軌跡圖（近 ${points.length} 季）</h3>
                <p class="hint">
                    每季一個點 · 按時序連線 · X 軸「毛利率 YoY 變化」判成本控制、產品組合升級· Y 軸「營收 YoY」判規模成長 ·
                    <b>看軌跡走向</b>：往右上飄 = 越來越好 · 往左下退 = 越來越差 · 在象限間跳動 = 週期股或轉型中。
                </p>
                <div class="trajectory-verdict" style="border-color:${vColor};color:${vColor}">${verdict}</div>
                <div style="display:flex;justify-content:center;margin-top:10px">
                    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:700px" xmlns="http://www.w3.org/2000/svg">
                        ${qBg}
                        ${qLabels}
                        ${ticks.join('')}
                        ${zeroX}
                        ${zeroY}
                        ${xLabel}
                        ${yLabel}
                        ${pathSegs.join('')}
                        ${arrow}
                        ${dots}
                        ${labels}
                    </svg>
                </div>
            </section>
        `;
    }

    // 從日期字串抽 Q1-Q4
    function extractQuarter(dateStr) {
        if (!dateStr) return null;
        const month = parseInt(dateStr.slice(5, 7));
        if (isNaN(month)) return null;
        if (month <= 3) return 'Q1';
        if (month <= 6) return 'Q2';
        if (month <= 9) return 'Q3';
        return 'Q4';
    }

    // Step C · 季節性柱狀圖：Q1/Q2/Q3/Q4 各年度並排 · 看成長是否只集中在特定季
    function renderQuarterlySeasonalityHtml(fund) {
        if (!fund || !fund.revenue) return '';
        const groupsRev = { Q1: [], Q2: [], Q3: [], Q4: [] };
        const groupsGM = { Q1: [], Q2: [], Q3: [], Q4: [] };
        fund.revenue.forEach(e => {
            const q = extractQuarter(e.date);
            if (!q || e.yoy === null || !isFinite(e.yoy) || e.mode !== 'YoY') return;
            groupsRev[q].push({ year: e.date.slice(0, 4), val: e.yoy * 100 });
        });
        (fund.grossMargin || []).forEach(e => {
            const q = extractQuarter(e.date);
            if (!q || e.value === null || !isFinite(e.value)) return;
            groupsGM[q].push({ year: e.date.slice(0, 4), val: e.value * 100 });
        });
        ['Q1','Q2','Q3','Q4'].forEach(q => {
            groupsRev[q].sort((a, b) => a.year.localeCompare(b.year));
            groupsGM[q].sort((a, b) => a.year.localeCompare(b.year));
        });
        const allYears = new Set();
        Object.values(groupsRev).forEach(arr => arr.forEach(e => allYears.add(e.year)));
        Object.values(groupsGM).forEach(arr => arr.forEach(e => allYears.add(e.year)));
        const years = [...allYears].sort();
        if (years.length < 2 || fund.revenue.length < 4) return '';

        const yearColors = ['#cbd5e1', '#94a3b8', '#60a5fa', '#f59e0b', '#dc2626', '#7c3aed'];
        const colorForYear = year => yearColors[Math.min(yearColors.length - 1, years.indexOf(year))];

        const revValues = Object.values(groupsRev).flat().map(e => e.val);
        const gmValues = Object.values(groupsGM).flat().map(e => e.val);
        const revMax = Math.max(0, ...revValues), revMin = Math.min(0, ...revValues);
        const revRange = Math.max(Math.abs(revMax), Math.abs(revMin)) * 1.15 || 20;
        const gmMax = gmValues.length ? Math.max(...gmValues) : 0;
        const gmMin = gmValues.length ? Math.min(...gmValues) : 0;
        const gmPad = (gmMax - gmMin) * 0.15 || 5;
        const gmYMin = Math.max(0, gmMin - gmPad), gmYMax = gmMax + gmPad;

        const renderBarChart = (title, groups, yMin, yMax, yTickCount, valSuffix, isSignedY) => {
            const W = 640, H = 320;
            const padL = 50, padR = 20, padT = 30, padB = 40;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const quarters = ['Q1','Q2','Q3','Q4'];
            const groupW = plotW / 4;
            const yToPx = y => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

            const ticks = [];
            for (let i = 0; i <= yTickCount; i++) {
                const yv = yMin + (yMax - yMin) * (i / yTickCount);
                const yPx = yToPx(yv);
                ticks.push(`<line x1="${padL}" y1="${yPx}" x2="${padL + plotW}" y2="${yPx}" stroke="#e2e8f0" stroke-width="1"/>`);
                ticks.push(`<text x="${padL - 6}" y="${yPx + 3}" text-anchor="end" font-size="10" fill="#64748b">${(yv >= 0 && isSignedY ? '+' : '') + yv.toFixed(0)}${valSuffix}</text>`);
            }
            if (yMin < 0 && yMax > 0) {
                const zeroY = yToPx(0);
                ticks.push(`<line x1="${padL}" y1="${zeroY}" x2="${padL + plotW}" y2="${zeroY}" stroke="#0f172a" stroke-width="1.5"/>`);
            }

            const barsHtml = [];
            const groupLabels = [];
            quarters.forEach((q, qi) => {
                const gx = padL + qi * groupW;
                const entries = groups[q];
                if (entries.length === 0) {
                    groupLabels.push(`<text x="${(gx + groupW / 2).toFixed(1)}" y="${(padT + plotH + 18).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#334155">${q}</text>`);
                    return;
                }
                const barW = Math.min(24, (groupW - 20) / entries.length);
                const totalBarW = barW * entries.length + Math.max(0, entries.length - 1) * 2;
                const startX = gx + (groupW - totalBarW) / 2;
                entries.forEach((e, bi) => {
                    const bx = startX + bi * (barW + 2);
                    const yTop = yToPx(Math.max(0, e.val));
                    const yBase = yToPx(Math.min(0, e.val));
                    const bh = Math.abs(yBase - yTop);
                    const color = colorForYear(e.year);
                    barsHtml.push(`<rect x="${bx.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" stroke="#fff" stroke-width="0.5"><title>${e.year} ${q}: ${(e.val >= 0 && isSignedY ? '+' : '') + e.val.toFixed(1)}${valSuffix}</title></rect>`);
                });
                groupLabels.push(`<text x="${(gx + groupW / 2).toFixed(1)}" y="${(padT + plotH + 18).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#334155">${q}</text>`);
            });

            const legendItems = years.map((y, i) => {
                const cx = padL + i * 60;
                return `<g transform="translate(${cx}, 8)">
                    <rect x="0" y="0" width="14" height="10" fill="${colorForYear(y)}"/>
                    <text x="18" y="9" font-size="11" fill="#334155">${y}</text>
                </g>`;
            }).join('');

            return `
                <div class="seasonality-chart">
                    <h4>${title}</h4>
                    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:640px" xmlns="http://www.w3.org/2000/svg">
                        ${legendItems}
                        ${ticks.join('')}
                        ${barsHtml.join('')}
                        ${groupLabels.join('')}
                    </svg>
                </div>
            `;
        };

        // 每年最強季偵測（若集中在同一季 → 季節性警訊）
        const strongestQuarterByYear = years.map(y => {
            let bestQ = null, bestVal = -Infinity;
            ['Q1','Q2','Q3','Q4'].forEach(q => {
                const e = groupsRev[q].find(en => en.year === y);
                if (e && e.val > bestVal) { bestVal = e.val; bestQ = q; }
            });
            return bestQ;
        }).filter(Boolean);
        let seasonalNote = '';
        if (strongestQuarterByYear.length >= 2) {
            const uniq = new Set(strongestQuarterByYear);
            if (uniq.size === 1) {
                seasonalNote = `⚠️ 這公司 <b>${strongestQuarterByYear.length} 年來成長都集中在 ${[...uniq][0]}</b> · 明顯季節性 · 判讀單季 YoY 要小心「季節性 vs 真成長」`;
            } else if (uniq.size <= 2) {
                seasonalNote = `📌 成長強季集中在 ${[...uniq].join(' / ')} · 有輕度季節性 · 建議看 TTM 或全年累計避免單季誤讀`;
            }
        }

        return `
            <section class="panel seasonality-panel">
                <h3>📅 各季營收成長 × 各季毛利（跨年度並排）</h3>
                <p class="hint">
                    每個 Q 展示各年度並排 · <b>目的</b>：看成長是「全年均勻」還是「集中在某季爆發」——後者代表有明顯季節性 · 用單季 YoY 判成長要小心。
                    左圖看營收 YoY 動能 · 右圖看毛利率絕對值走勢。
                </p>
                ${seasonalNote ? `<div class="seasonality-verdict">${seasonalNote}</div>` : ''}
                <div class="seasonality-grid">
                    ${renderBarChart('💰 各季營收 YoY', groupsRev, -revRange, revRange, 4, '%', true)}
                    ${renderBarChart('📈 各季毛利率（絕對值）', groupsGM, gmYMin, gmYMax, 4, '%', false)}
                </div>
            </section>
        `;
    }

    // 月度熱區（TW 專用 · 用月營收畫 12×N heatmap · 完全 self-contained）
    // 每格顏色 = 該月 YoY · 綠深 = 正成長高 · 紅深 = 負成長高 · 底部 row 跨年平均指認「本命月」
    function renderMonthlyHeatmapHtml(fund) {
        if (!fund || !fund.monthlyRevenue || fund.monthlyRevenue.length < 12) return '';
        const monthly = fund.monthlyRevenue;
        const byKey = new Map(monthly.map(m => [m.period, m]));
        const years = [...new Set(monthly.map(m => m.year))].sort();
        if (years.length < 2) return '';

        // YoY 顏色映射：以資料集最大絕對值為基準
        const yoys = monthly.map(m => m.yoy).filter(v => v !== null && isFinite(v));
        if (yoys.length === 0) return '';
        const maxAbs = Math.max(0.2, Math.max(...yoys.map(Math.abs)));

        const colorFor = yoy => {
            if (yoy === null || !isFinite(yoy)) return '#f1f5f9';
            const norm = Math.max(-1, Math.min(1, yoy / maxAbs));
            const alpha = 0.15 + Math.abs(norm) * 0.75;
            return norm >= 0
                ? `rgba(22, 163, 74, ${alpha})`
                : `rgba(220, 38, 38, ${alpha})`;
        };
        const textColor = yoy => {
            if (yoy === null || !isFinite(yoy)) return '#94a3b8';
            return Math.abs(yoy) > maxAbs * 0.5 ? '#fff' : '#334155';
        };

        const months = [1,2,3,4,5,6,7,8,9,10,11,12];
        // 每年一列
        let rowsHtml = '';
        years.forEach(y => {
            let cells = '';
            months.forEach(m => {
                const key = `${y}-${String(m).padStart(2, '0')}`;
                const e = byKey.get(key);
                if (!e) {
                    cells += `<td class="heatmap-cell heatmap-empty">—</td>`;
                } else {
                    const yoyStr = e.yoy === null ? '—' : ((e.yoy > 0 ? '+' : '') + (e.yoy * 100).toFixed(0) + '%');
                    const bg = colorFor(e.yoy);
                    const fg = textColor(e.yoy);
                    const valBil = e.value !== null ? (e.value / 1e8).toFixed(1) + '億' : '—';
                    const title = `${key} · 營收 ${valBil} · YoY ${yoyStr}`;
                    cells += `<td class="heatmap-cell" style="background:${bg};color:${fg}" title="${title}">${yoyStr}</td>`;
                }
            });
            rowsHtml += `<tr><td class="heatmap-year">${y}</td>${cells}</tr>`;
        });

        // 每月跨年平均 · 指認「本命月 / 弱勢月」
        const monthAvgs = months.map(m => {
            const vals = years.map(y => (byKey.get(`${y}-${String(m).padStart(2, '0')}`) || {}).yoy)
                .filter(v => v !== null && v !== undefined && isFinite(v));
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        });
        let bestMonth = -1, worstMonth = -1;
        monthAvgs.forEach((v, i) => {
            if (v !== null) {
                if (bestMonth === -1 || v > monthAvgs[bestMonth]) bestMonth = i;
                if (worstMonth === -1 || v < monthAvgs[worstMonth]) worstMonth = i;
            }
        });
        let insight = '';
        if (bestMonth >= 0 && worstMonth >= 0 && bestMonth !== worstMonth) {
            const bestAvg = monthAvgs[bestMonth] * 100;
            const worstAvg = monthAvgs[worstMonth] * 100;
            const gap = bestAvg - worstAvg;
            if (gap > 15) {
                insight = `🎯 這公司<b>本命月是 ${bestMonth + 1} 月</b>（跨年平均 +${bestAvg.toFixed(0)}%）· <b>最弱是 ${worstMonth + 1} 月</b>（平均 ${worstAvg.toFixed(0)}%）· 差 ${gap.toFixed(0)}pp · 有明顯月度季節性`;
            }
        }

        const avgRow = monthAvgs.map(v => {
            if (v === null) return '<td class="heatmap-cell heatmap-empty">—</td>';
            const str = (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%';
            const bg = colorFor(v);
            const fg = textColor(v);
            return `<td class="heatmap-cell heatmap-avg" style="background:${bg};color:${fg}">${str}</td>`;
        }).join('');

        return `
            <section class="panel heatmap-panel">
                <h3>🔥 月度熱區（TW 專用 · 用月營收畫）</h3>
                <p class="hint">
                    每格 = 該月營收 YoY · <span style="background:rgba(22,163,74,0.7);color:#fff;padding:1px 6px;border-radius:3px">綠</span>深 = YoY 越正 ·
                    <span style="background:rgba(220,38,38,0.7);color:#fff;padding:1px 6px;border-radius:3px">紅</span>深 = YoY 越負 ·
                    滑鼠停格看營收絕對值。底部「跨年平均」直接看「這公司哪個月固定爆發、哪個月常掉」——比季度平均犀利 4 倍。
                </p>
                ${insight ? `<div class="heatmap-insight">${insight}</div>` : ''}
                <div class="heatmap-scroll">
                    <table class="monthly-heatmap">
                        <thead>
                            <tr><th></th>${months.map(m => `<th>${m}月</th>`).join('')}</tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                        <tfoot>
                            <tr><td class="heatmap-year">跨年平均</td>${avgRow}</tr>
                        </tfoot>
                    </table>
                </div>
            </section>
        `;
    }

    // Step 2 · 12 個月營收 / 4 季毛利 / 4 季營益（值 + 增長率）
    // 兩張並排小表 · 因為月營收是月頻 · 毛利/營益是季頻 · 混不進同一列
    function renderMonthlyMetricsHtml(fund) {
        const monthly = fund && fund.monthlyRevenue ? fund.monthlyRevenue.slice(0, 12) : [];
        const quarterly = fund && fund.grossMargin ? fund.grossMargin.slice(0, 4) : [];
        const opq = fund && fund.operatingMargin ? fund.operatingMargin.slice(0, 4) : [];
        if (monthly.length === 0 && quarterly.length === 0) return '';

        const fmtRev = v => {
            if (v === null || !isFinite(v)) return '—';
            if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
            return v.toFixed(0);
        };
        const fmtPctYoY = y => {
            if (y === null || !isFinite(y)) return '—';
            const pct = y * 100;
            return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
        };
        const fmtPP = y => {
            if (y === null || !isFinite(y)) return '—';
            const pp = y * 100;
            return (pp > 0 ? '+' : '') + pp.toFixed(1) + 'pp';
        };
        const yoyCls = y => y === null ? '' : y > 0.001 ? 'yoy-pos' : y < -0.001 ? 'yoy-neg' : '';

        // 月營收 table（12 rows）
        let monthlyTable = '';
        if (monthly.length > 0) {
            let rowsHtml = '';
            monthly.forEach(m => {
                rowsHtml += `<tr>
                    <td>${m.period}</td>
                    <td>${fmtRev(m.value)}</td>
                    <td class="${yoyCls(m.yoy)}">${fmtPctYoY(m.yoy)}</td>
                    <td class="${yoyCls(m.mom)}">${fmtPctYoY(m.mom)}</td>
                </tr>`;
            });
            monthlyTable = `<div class="fund-cell">
                <h4>📅 月營收（近 12 月）</h4>
                <table class="fund-table">
                    <tr><th>月份</th><th>營收</th><th>YoY</th><th>MoM</th></tr>
                    ${rowsHtml}
                </table>
            </div>`;
        }

        // 季度毛利/營益 table（4 rows · 合併展示）
        let quarterlyTable = '';
        if (quarterly.length > 0 || opq.length > 0) {
            // 用毛利率的季度為主軸
            const primary = quarterly.length > 0 ? quarterly : opq;
            const opByDate = new Map(opq.map(e => [e.date, e]));
            let rowsHtml = '';
            primary.forEach(gm => {
                const op = opByDate.get(gm.date) || {};
                const gmVal = gm.value !== null && isFinite(gm.value) ? (gm.value * 100).toFixed(1) + '%' : '—';
                const opVal = op.value !== null && isFinite(op.value) ? (op.value * 100).toFixed(1) + '%' : '—';
                rowsHtml += `<tr>
                    <td>${gm.date}</td>
                    <td>${gmVal}</td>
                    <td class="${yoyCls(gm.yoy)}">${fmtPP(gm.yoy)}</td>
                    <td>${opVal}</td>
                    <td class="${yoyCls(op.yoy)}">${fmtPP(op.yoy)}</td>
                </tr>`;
            });
            quarterlyTable = `<div class="fund-cell">
                <h4>📊 毛利率 / 營益率（近 4 季）</h4>
                <table class="fund-table">
                    <tr><th>季度</th><th>毛利率</th><th>YoY</th><th>營益率</th><th>YoY</th></tr>
                    ${rowsHtml}
                </table>
            </div>`;
        }

        return `
            <section class="panel monthly-metrics-panel">
                <h3>📈 最後 12 個月 · 營收 / 毛利 / 營益</h3>
                <p class="hint">
                    <b>月營收</b> 每月 10 號公告 · <b>領先季報 6 週</b>（TW 月營收專屬 · 只有營收沒有 EPS/毛利）·
                    <b>毛利率 / 營益率</b> 只在季報有 · 用近 4 季覆蓋 12 個月時段。
                </p>
                <div class="fund-grid monthly-metrics-grid">
                    ${monthlyTable}
                    ${quarterlyTable}
                </div>
            </section>
        `;
    }

    // Step 3 · 外資訊號警報（獨立 panel · 不改既有 renderInstitutionalHtml）
    function renderForeignSignalHtml(inst) {
        if (!inst || !inst.foreignSignals) return '';
        const fs = inst.foreignSignals;
        if (!fs.today) return '';
        const fmtLots = sh => {
            if (sh === null || !isFinite(sh)) return '—';
            const lots = sh / 1000;
            return (lots >= 0 ? '+' : '') + lots.toLocaleString('en-US', { maximumFractionDigits: 0 });
        };
        const cls = v => v === null ? '' : v > 0 ? 'yoy-pos' : v < 0 ? 'yoy-neg' : '';

        const dots = fs.severity >= 3 ? '🔴🔴🔴' : fs.severity === 2 ? '🔴🔴' : fs.severity === 1 ? '🔴' : '✓';
        const sevClass = fs.severity >= 3 ? 'severity-3' : fs.severity === 2 ? 'severity-2' : fs.severity === 1 ? 'severity-1' : 'severity-0';
        const title = fs.severity > 0 ? `外資訊號警報（${fs.latestDate}）` : `外資訊號安靜（${fs.latestDate}）· 5d/20d 走勢平穩`;

        const signalsList = fs.signals.length > 0
            ? `<div class="signal-list">${fs.signals.map(s => `<div class="signal-item">${s}</div>`).join('')}</div>`
            : '';

        const t = fs.today, y = fs.yest || {};
        const rowFmt = (label, tv, yv) => `<tr>
            <td><b>${label}</b></td>
            <td class="${cls(tv)}">${fmtLots(tv)}</td>
            <td class="${cls(yv)}">${fmtLots(yv)}</td>
        </tr>`;

        const sixtyRow = t.sum60d !== null
            ? `<div class="signal-60d">外資 <b>60d</b> 累計：<b class="${cls(t.sum60d)}">${fmtLots(t.sum60d)} 張</b></div>`
            : `<div class="signal-60d">外資 60d 累計：<span class="hint-mini">資料窗口不足 60 個交易日</span></div>`;

        return `
            <section class="panel foreign-signal-panel ${sevClass}">
                <div class="signal-header">
                    <span class="signal-severity">${dots}</span>
                    <span class="signal-title">${title}</span>
                </div>
                ${signalsList}
                <table class="fund-table signal-table">
                    <thead><tr><th>窗口</th><th>今日累計（張）</th><th>昨日累計（張）</th></tr></thead>
                    <tbody>
                        ${rowFmt('5d', t.sum5d, y.sum5d)}
                        ${rowFmt('20d', t.sum20d, y.sum20d)}
                    </tbody>
                </table>
                ${sixtyRow}
                <div class="signal-rules">
                    <b>訊號規則：</b>🔴 5d 翻紅（昨 &gt; 0 · 今 &lt; 0 · 反轉 &gt; 2,000 張）·
                    🟢 5d 翻綠（反向）· 📉/📈 20d 巨變（單日 20d 變化 ≥ 8,000 張）·
                    🚨 5d↔20d 背離（方向相反）· <b>嚴重度</b> 🔴🔴🔴 3+ / 🔴🔴 2 / 🔴 1
                </div>
            </section>
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
    // 兩層 fallback：allorigins → corsproxy.io（一個被限流另一個補上）
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url=',
    ];

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
        const errors = [];
        // 依序試：直連 → allorigins → corsproxy.io
        try {
            data = await fredRawFetch(directUrl);
        } catch (e) {
            errors.push(`direct: ${e.message}`);
            for (const proxy of CORS_PROXIES) {
                try {
                    data = await fredRawFetch(`${proxy}${encodeURIComponent(directUrl)}`);
                    break;
                } catch (e2) {
                    errors.push(`${proxy.split('/')[2]}: ${e2.message}`);
                    data = null;
                }
            }
            if (!data) throw new Error(errors.join(' · '));
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
                await new Promise(r => setTimeout(r, 500));   // 250ms 不夠、daily 系列 payload 大更容易被 throttle
            }
        }
        return result;
    }

    // USD/TWD 匯率 · 資料源優先順序（都免費，無 key）：
    //   1. Yahoo Finance TWD=X（有 2 年+ 歷史、無 key、走同一組 CORS proxy chain）
    //   2. FMP historical-price-eod/full?symbol=USDTWD（fallback · 需 key + 額度）
    // 為什麼不用 Frankfurter？ECB reference rates 名單不含 TWD、直接 400/404
    // 為什麼不用 FRED？DEXTAIUS 2020 年已停更
    async function fetchForexUsdTwd(fmpKey) {
        // Try 1: Yahoo Finance TWD=X (v8/finance/chart JSON endpoint)
        try {
            const now = Math.floor(Date.now() / 1000);
            const twoYearsAgo = now - 730 * 24 * 3600;
            const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?period1=${twoYearsAgo}&period2=${now}&interval=1d`;
            let data = null;
            try { data = await fredRawFetch(yUrl); } catch (_) {}
            if (!data) {
                for (const proxy of CORS_PROXIES) {
                    try {
                        data = await fredRawFetch(`${proxy}${encodeURIComponent(yUrl)}`);
                        break;
                    } catch (_) { data = null; }
                }
            }
            if (data && data.chart && data.chart.result && data.chart.result[0]) {
                const r = data.chart.result[0];
                const ts = r.timestamp || [];
                const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0]
                              && r.indicators.quote[0].close) || [];
                const series = ts.map((t, i) => ({
                    date: new Date(t * 1000).toISOString().slice(0, 10),
                    value: closes[i],
                })).filter(r => r.value && isFinite(r.value));
                if (series.length) return series;
            }
        } catch (e) {
            console.warn('Yahoo TWD=X failed:', e.message);
        }

        // Try 2: FMP fallback
        if (!fmpKey) return null;
        try {
            const data = await fmpFetch('/historical-price-eod/full?symbol=USDTWD', fmpKey);
            const rows = Array.isArray(data) ? data : (data && data.historical) || [];
            if (!rows.length) return null;
            return rows.slice(0, 500).reverse()
                .map(r => ({ date: r.date, value: r.close || r.adjClose }))
                .filter(r => r.value && isFinite(r.value));
        } catch (e) {
            console.warn('FMP forex fallback failed:', e.message);
            return null;
        }
    }

    // Yahoo v7 quote endpoint · 一次拿 trailingPE + forwardPE + epsForward + short interest
    // 用 CORS proxy 走跟 TWD=X / FRED 同一組 fallback chain
    // 對美股：補「Forward PE」（工具目前缺 · 對成長股判讀關鍵）+ 短興趣（Layer 5 · 情緒替補）
    async function fetchYahooQuote(ticker) {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
        let data = null;
        try { data = await fredRawFetch(url); } catch (_) {}
        if (!data) {
            for (const proxy of CORS_PROXIES) {
                try {
                    data = await fredRawFetch(`${proxy}${encodeURIComponent(url)}`);
                    break;
                } catch (_) { data = null; }
            }
        }
        if (!data || !data.quoteResponse || !Array.isArray(data.quoteResponse.result) || !data.quoteResponse.result[0]) {
            return null;
        }
        const q = data.quoteResponse.result[0];
        return {
            trailingPE: q.trailingPE,
            forwardPE: q.forwardPE,
            epsTrailing: q.epsTrailingTwelveMonths,
            epsForward: q.epsForward,
            priceToBook: q.priceToBook,
            shortRatio: q.shortRatio,
            sharesShortPercentFloat: q.sharesPercentSharesOut, // Yahoo 有時放這欄
            sharesShortPercentOfFloat: q.sharesShortPercentOfFloat,
            beta: q.beta,
        };
    }

    // ---------- Peer comparison（美股專用） ----------
    // FMP /stock-peers 給同業 tickers → Yahoo v7 quote batch 一次拉全部
    // 揭露「相對 peer 貴不貴」· 這比絕對 PE 更能回答 Howard Marks 的市場效率問題
    // 改用 FMP /batch-quote（一次抓多支 · 不用 CORS proxy · 遠比 Yahoo v7 穩定）
    // Yahoo v7 保留當「Forward PE 補充」· 有就用 · 沒就只顯示 Trailing PE
    async function fetchPeersComparison(usTicker, fmpKey) {
        if (!fmpKey) return null;
        try {
            const peers = await fmpFetch(`/stock-peers?symbol=${usTicker}`, fmpKey);
            if (!Array.isArray(peers) || peers.length === 0) return null;
            const peerTickers = peers.slice(0, 7).map(p => p.symbol).filter(Boolean);
            const allSymbols = [usTicker, ...peerTickers, 'SPY'];

            // 主資料源：FMP /batch-quote（帶 trailing PE + market cap + EPS · 100% 穩定）
            const fmpQuotes = await fmpFetch(`/batch-quote?symbols=${allSymbols.join(',')}`, fmpKey).catch(() => null);
            const fmpBySym = new Map();
            if (Array.isArray(fmpQuotes)) fmpQuotes.forEach(q => fmpBySym.set(q.symbol, q));

            // 選配：Yahoo v7（給 Forward PE）· 走 CORS proxy · 失敗就算了
            const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(allSymbols.join(','))}`;
            let yahooData = null;
            try { yahooData = await fredRawFetch(yahooUrl); } catch (_) {}
            if (!yahooData) {
                for (const proxy of CORS_PROXIES) {
                    try { yahooData = await fredRawFetch(`${proxy}${encodeURIComponent(yahooUrl)}`); break; }
                    catch (_) { yahooData = null; }
                }
            }
            const yahooBySym = new Map();
            if (yahooData && yahooData.quoteResponse && Array.isArray(yahooData.quoteResponse.result)) {
                yahooData.quoteResponse.result.forEach(q => yahooBySym.set(q.symbol, q));
            }

            const toRow = (sym, name) => {
                const fq = fmpBySym.get(sym);
                const yq = yahooBySym.get(sym);
                if (!fq && !yq) return null;
                // FMP 給 trailingPE + marketCap · Yahoo 給 forwardPE
                const trailingPE = (yq && yq.trailingPE) || (fq && fq.pe) || null;
                const forwardPE = yq && yq.forwardPE ? yq.forwardPE : null;
                const marketCap = (fq && fq.marketCap) || (yq && yq.marketCap) || null;
                const fwdGrowth = (yq && yq.epsForward && yq.epsTrailingTwelveMonths && yq.epsTrailingTwelveMonths > 0)
                    ? ((yq.epsForward - yq.epsTrailingTwelveMonths) / yq.epsTrailingTwelveMonths) * 100 : null;
                const fwdPeg = (forwardPE && fwdGrowth && fwdGrowth > 0) ? forwardPE / fwdGrowth : null;
                return { symbol: sym, name: name || sym, trailingPE, forwardPE, fwdGrowth, fwdPeg, marketCap };
            };

            const peerRows = peerTickers.map(t => {
                const cfg = peers.find(p => p.symbol === t);
                return toRow(t, cfg ? cfg.companyName : t);
            }).filter(Boolean);
            const spyRow = toRow('SPY', 'S&P 500');

            const med = arr => {
                const s = arr.filter(v => v !== null && v !== undefined && isFinite(v)).sort((a, b) => a - b);
                return s.length ? s[Math.floor(s.length / 2)] : null;
            };
            const peerFwdPeMed = med(peerRows.map(p => p.forwardPE));
            const peerFwdPegMed = med(peerRows.map(p => p.fwdPeg));
            const peerTrailingPeMed = med(peerRows.map(p => p.trailingPE));

            // 標註：Yahoo 是否有跑起來（讓 render 判斷是否要顯示 Forward PE 欄位）
            const hasForwardData = peerRows.some(r => r.forwardPE !== null);

            return { peerRows, spyRow, peerFwdPeMed, peerFwdPegMed, peerTrailingPeMed, hasForwardData };
        } catch (e) {
            console.warn('Peer comparison failed:', e.message);
            return null;
        }
    }

    function renderPeerComparisonHtml(analysis) {
        const p = analysis.peersComparison;
        const yq = analysis.yahooQuote;
        if (!p || !p.peerRows || !p.peerRows.length) return '';

        const ticker = analysis.ticker;
        const ownFwdPE = yq && yq.forwardPE;
        const ownFwdGrowth = (yq && yq.epsForward && yq.epsTrailing && yq.epsTrailing > 0)
            ? ((yq.epsForward - yq.epsTrailing) / yq.epsTrailing) * 100 : null;
        const ownFwdPeg = (ownFwdPE && ownFwdGrowth && ownFwdGrowth > 0) ? ownFwdPE / ownFwdGrowth : null;
        const ownTrailingPE = yq && yq.trailingPE;

        const fmtN = v => (v !== null && v !== undefined && isFinite(v)) ? Number(v).toFixed(2) : '—';
        const cell = v => `<td>${fmtN(v)}</td>`;

        const ownRow = `<tr class="peer-self"><td><b>${ticker}</b>（自己）</td>${cell(ownTrailingPE)}${cell(ownFwdPE)}${cell(ownFwdGrowth)}${cell(ownFwdPeg)}</tr>`;
        const peerRowsHtml = p.peerRows.map(r => `<tr><td>${r.symbol}${r.name && r.name !== r.symbol ? ' <small style="color:var(--muted)">'+r.name.slice(0,15)+'</small>' : ''}</td>${cell(r.trailingPE)}${cell(r.forwardPE)}${cell(r.fwdGrowth)}${cell(r.fwdPeg)}</tr>`).join('');
        const peerMedRow = `<tr class="peer-summary"><td><b>Peer 中位</b></td>${cell(p.peerTrailingPeMed)}${cell(p.peerFwdPeMed)}<td>—</td>${cell(p.peerFwdPegMed)}</tr>`;
        const spyRowHtml = p.spyRow ? `<tr class="peer-summary"><td><b>S&P 500 (SPY)</b></td>${cell(p.spyRow.trailingPE)}${cell(p.spyRow.forwardPE)}<td>—</td>${cell(p.spyRow.fwdPeg)}</tr>` : '';

        // 判讀
        const fwdPeVsPeer = (ownFwdPE && p.peerFwdPeMed) ? ownFwdPE / p.peerFwdPeMed : null;
        const fwdPegVsPeer = (ownFwdPeg && p.peerFwdPegMed) ? ownFwdPeg / p.peerFwdPegMed : null;
        const fwdPeVsSpy = (ownFwdPE && p.spyRow && p.spyRow.forwardPE) ? ownFwdPE / p.spyRow.forwardPE : null;
        const bits = [];
        if (fwdPeVsPeer) {
            const cls = fwdPeVsPeer > 1.5 ? 'divergence-warn' : fwdPeVsPeer < 0.7 ? 'divergence-good' : 'divergence-ok';
            const label = fwdPeVsPeer > 1.5 ? '⚠️ 遠貴於 peers' : fwdPeVsPeer < 0.7 ? '✅ 遠便宜於 peers' : '≈ 接近 peers';
            bits.push(`<div class="divergence-banner ${cls}">Forward PE <b>${fwdPeVsPeer.toFixed(2)}×</b> peer 中位（${fmtN(ownFwdPE)} vs ${fmtN(p.peerFwdPeMed)}）· ${label}</div>`);
        }
        if (fwdPegVsPeer) {
            const cls = fwdPegVsPeer > 1.5 ? 'divergence-warn' : fwdPegVsPeer < 0.7 ? 'divergence-good' : 'divergence-ok';
            const label = fwdPegVsPeer > 1.5 ? '⚠️ 每單位成長付更多溢價' : fwdPegVsPeer < 0.7 ? '✅ 每單位成長付較少溢價' : '≈ 相似';
            bits.push(`<div class="divergence-banner ${cls}">Forward PEG <b>${fwdPegVsPeer.toFixed(2)}×</b> peer 中位（${fmtN(ownFwdPeg)} vs ${fmtN(p.peerFwdPegMed)}）· ${label}<br><span class="hint-mini">關鍵洞察：如果你的論點是「AI 敘事會持續」，這個論點<b>不特別指向 ${ticker}</b> 是最划算的下注——同 peer 群裡 PEG 較低的公司，用同樣成長預期付更少估值溢價。</span></div>`);
        }
        if (fwdPeVsSpy) {
            const label = fwdPeVsSpy > 2 ? `⚠️ ${fwdPeVsSpy.toFixed(1)}× 大盤` : fwdPeVsSpy < 0.7 ? '✅ 折價於大盤' : `${fwdPeVsSpy.toFixed(2)}× 大盤`;
            bits.push(`<div class="divergence-banner divergence-ok">Forward PE <b>${label}</b>（${fmtN(ownFwdPE)} vs SPY ${fmtN(p.spyRow && p.spyRow.forwardPE)}）· 大盤是絕對貴便宜的基準線之一。</div>`);
        }

        return `
            <h3>⚖️ Peer 比較 · 「相對貴便宜」（層次 1 · Howard Marks 市場效率）</h3>
            <p class="hint">
                絕對 PE 高不高只是問題的一半，另一半是「相對誰貴」。Peer 群來自 FMP <code>/stock-peers</code>，
                Yahoo v7 quote 提供每家 Forward PE + EPS Forward。<b>Peer 中位</b>反映「同業共識定價」·
                <b>SPY</b> 反映大盤基準。
                <span class="hint-mini">⚠️ FMP peer 選擇未必完美（例：TSM peers 有 AMAT/AMKR 是設備 / 封測、不是純代工競爭）· 全部同業 PE 高也可能是<b>整個板塊泡沫</b>、不是「相對合理」。</span>
            </p>
            <table class="fund-table peer-table">
                <tr><th>Ticker</th><th>Trailing PE</th><th>Forward PE</th><th>隱含成長%</th><th>Forward PEG</th></tr>
                ${ownRow}
                ${peerRowsHtml}
                ${peerMedRow}
                ${spyRowHtml}
            </table>
            ${bits.join('')}
        `;
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

    // Feature · TW 配息歷史（10 年 · 給趨勢圖用）
    async function fetchTwDividendHistory(ticker, token) {
        try {
            const startDate = todayMinusYears(10);
            const rows = await finMindFetch('TaiwanStockDividend', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            // TaiwanStockDividend 依 year 分組 · 一年可能多筆（分次配息）
            const byYear = new Map();
            rows.forEach(r => {
                const y = String(r.year || (r.date || '').slice(0, 4));
                if (!y || y === 'undefined') return;
                if (!byYear.has(y)) byYear.set(y, { cash: 0, stock: 0 });
                byYear.get(y).cash += (r.CashEarningsDistribution || 0) + (r.CashStatutorySurplus || 0);
                byYear.get(y).stock += (r.StockEarningsDistribution || 0) + (r.StockStatutorySurplus || 0);
            });
            return Array.from(byYear.entries())
                .map(([year, v]) => ({ year, cash: v.cash, stock: v.stock }))
                .filter(e => e.cash > 0 || e.stock > 0)
                .sort((a, b) => b.year.localeCompare(a.year))
                .slice(0, 10);
        } catch (e) {
            console.warn('TW dividend history fetch failed:', e.message);
            return null;
        }
    }

    // Feature · TW 庫藏股（若 FinMind 有這 dataset）
    async function fetchTwBuyback(ticker, token) {
        try {
            const startDate = todayMinusYears(5);
            const rows = await finMindFetch('TaiwanStockBuyback', ticker, startDate, todayStr(), token);
            if (!rows || rows.length === 0) return null;
            // 依年 aggregate 買回張數 * 平均單價
            const byYear = new Map();
            rows.forEach(r => {
                const y = (r.date || r.announcement_date || '').slice(0, 4);
                if (!y) return;
                const shares = r.buyback_share || r.shares || 0;
                const price = r.avg_price || r.price || 0;
                const amount = shares * price;
                byYear.set(y, (byYear.get(y) || 0) + amount);
            });
            return Array.from(byYear.entries())
                .map(([year, amount]) => ({ year, amount }))
                .filter(e => e.amount > 0)
                .sort((a, b) => b.year.localeCompare(a.year))
                .slice(0, 10);
        } catch (e) {
            console.warn('TW buyback fetch failed:', e.message);
            return null;
        }
    }

    // ---------- ADR 折溢價計算器（層次 4 · 資金結構訊號） ----------
    // 公式：Premium = (ADR / ratio) / (localPrice / USDTWD) - 1
    //     = 「ADR 每股 USD」 vs 「本地股價換算成 USD」的比較
    // 正值 = ADR 貴（外資溢價還在）· 負值 = ADR 折價（罕見 · 本地過熱 or 資金流出美股）
    const ADR_MAP = {
        TSM:  { localTicker: '2330',    localSource: 'finmind', ratio: 5,
                localName: '台積電',  localExchange: 'TWSE' },
        // 未來擴充：BABA (1:8, 9988.HK) · NIO (1:1, 9866.HK) · JD · BIDU · etc.
    };

    async function fetchAdrCounterpart(usTicker, finmindToken) {
        const config = ADR_MAP[(usTicker || '').toUpperCase()];
        if (!config) return null;
        if (config.localSource === 'finmind') {
            if (!finmindToken) return { config, needToken: true };
            try {
                const priceData = await finMindFetch('TaiwanStockPrice', config.localTicker,
                    todayMinusYears(0.05), todayStr(), finmindToken);
                if (!priceData || priceData.length === 0) return { config };
                const last = priceData[priceData.length - 1];
                return { config, localPrice: last.close, localDate: last.date };
            } catch (e) {
                console.warn('ADR local price fetch failed:', e.message);
                return { config, error: e.message };
            }
        }
        return null;
    }

    function computeAdrPremium(adrPriceUsd, localPriceTwd, usdTwdRate, ratio) {
        if (!adrPriceUsd || !localPriceTwd || !usdTwdRate || !ratio) return null;
        const perShareUsd = adrPriceUsd / ratio;
        const localInUsd = localPriceTwd / usdTwdRate;
        return perShareUsd / localInUsd - 1;
    }

    function renderAdrPremiumHtml(analysis, fxSeries) {
        const adr = analysis.adrCounterpart;
        if (!adr) return '';
        const cfg = adr.config;
        const ticker = analysis.ticker;
        const adrPrice = analysis.price;
        const adrDate = analysis.latestRatioDate || 'US 最新交易日';

        if (adr.needToken) {
            return `
                <h3>🔁 ADR 折溢價 · ${ticker} ↔ ${cfg.localName}（${cfg.localTicker}）</h3>
                <p class="hint">偵測到 <b>${ticker}</b> 是 ADR、對應本地 <b>${cfg.localTicker} ${cfg.localName}</b>（1 ADR = ${cfg.ratio} 股）。
                <br>要算折溢價需要 <b>FinMind token</b>（抓對應台股價）· 到「資料來源設定」貼進去、重跑一次即可看到即時折溢價 + 兩年歷史背景。</p>
            `;
        }
        if (!adr.localPrice) {
            return `<h3>🔁 ADR 折溢價</h3><p class="hint">找不到 ${cfg.localTicker} 台股資料。${adr.error || ''}</p>`;
        }
        if (!fxSeries || !fxSeries.length) {
            return `<h3>🔁 ADR 折溢價</h3><p class="hint">需要 USD/TWD 匯率才能算折溢價 · 總體環境那塊 fx 沒抓到 · 開 F12 console 看細節。</p>`;
        }
        const usdTwd = fxSeries[fxSeries.length - 1].value;
        const fxDate = fxSeries[fxSeries.length - 1].date;
        const premium = computeAdrPremium(adrPrice, adr.localPrice, usdTwd, cfg.ratio);
        if (premium === null) return `<h3>🔁 ADR 折溢價</h3><p class="hint">計算失敗（缺值）</p>`;

        const perShareUsd = adrPrice / cfg.ratio;
        const localInUsd = adr.localPrice / usdTwd;
        const pct = premium * 100;
        const kind = pct > 5 ? 'expensive' : pct < -5 ? 'cheap' : 'ok';
        const kindCls = kind === 'expensive' ? 'divergence-warn' : kind === 'cheap' ? 'divergence-good' : 'divergence-ok';
        const kindLabel = kind === 'expensive' ? '⚠️ ADR 溢價（外資買貴 / 本地便宜）'
                        : kind === 'cheap' ? '✅ ADR 折價（本地追高 / ADR 便宜）'
                        : '≈ 兩地平價';

        // 相對 2026-05 彭博報導的 13.7% 歷史背景
        const contextMsg = pct > 20
            ? '<b>顯著高於</b> 2026-05 報導的 13.7%——外資溢價又拉開？or 樣本時間不同步？'
            : pct > 15
            ? '<b>略高於</b> 2026-05 的 13.7%——溢價回升 or 時間差落差。'
            : pct > 10
            ? '<b>與 2026-05 的 13.7% 相近</b>——外資溢價維持中。'
            : pct > 5
            ? '<b>低於 2026-05 的 13.7%</b>——本地資金持續追上，外資定價力弱化中。'
            : pct > -5
            ? '<b>兩地已接近平價</b>——外資溢價歷史消失。'
            : '<b>ADR 折價</b>——罕見狀況（本地過熱 or 短期美股資金流出）。';

        return `
            <h3>🔁 ADR 折溢價 · ${ticker} ↔ ${cfg.localName}（${cfg.localTicker}）</h3>
            <div class="divergence-banner ${kindCls}">${kindLabel} · <b>${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</b></div>
            <table class="fund-table adr-calc">
                <tr><th>項目</th><th>值</th><th>備註</th></tr>
                <tr><td>ADR ${ticker} 收盤</td><td>$${adrPrice.toFixed(2)}</td><td>${adrDate}</td></tr>
                <tr><td>÷ 換算比例（1 ADR = ${cfg.ratio} 股）</td><td>$${perShareUsd.toFixed(2)} / 股</td><td>ADR 每股 USD</td></tr>
                <tr><td>${cfg.localName} ${cfg.localTicker} 收盤</td><td>NT$${adr.localPrice.toFixed(1)}</td><td>${adr.localDate}</td></tr>
                <tr><td>÷ USD/TWD 匯率</td><td>$${localInUsd.toFixed(2)} / 股</td><td>rate ${usdTwd.toFixed(3)} · ${fxDate}</td></tr>
                <tr><td><b>折溢價 = ADR / TW − 1</b></td><td class="${pct > 0 ? 'yoy-pos' : 'yoy-neg'}"><b>${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</b></td><td>${kindLabel}</td></tr>
            </table>
            <p class="hint">
                <b>⚠️ 兩地報價時間不同步</b>：美股台股交易時段不重疊
                （美股 UTC 14:30-21:00 · 台股 UTC 01:00-05:30）——這是 <b>「TSM 最近一次 US 收盤」vs「2330 最近一次 TW 收盤」</b>的價差，
                <b>不是同一時刻的精確套利機會</b>。真實套利要看盤中同步報價 + 過戶成本 + 稅。
            </p>
            <p class="hint">
                <b>📖 歷史背景（2026-05 彭博報導）</b>：TSM ADR 溢價 5 月平均 <b>13.7%</b>（<b>兩年新低</b>·此前一度 26%）·
                連續第 5 個月下降。核心敘事：<b>台灣本地資金（AI 概念股熱潮 + 法規鬆綁允許本地基金提高國內股票配置）
                正在追上並縮小過去外資主導定價的溢價空間</b>。
                <br>${contextMsg}
                <br><b>資金結構訊號</b>：溢價方向與速度本身就是觀察「誰在主導定價」的指標——不只是套利機會。
                跟你查詢時看到的融資餘額（散戶槓桿）等本地情緒訊號合起來看，能交叉驗證資金流向。
            </p>
        `;
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
                : '<span class="src-warn">⚠️ USD/TWD（Yahoo TWD=X + FMP fallback 都失敗 · 開 devtools console 看細節）</span>');
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
        // CPI cell 顯示 YoY %（原始是絕對指數 300+，看不出通膨變化）
        const cpiSeries = macro && macro.cpi;
        const cpiYoYSeries = (cpiSeries && cpiSeries.length >= 13)
            ? cpiSeries.slice(12).map((d, i) => ({
                date: d.date,
                value: ((d.value - cpiSeries[i].value) / cpiSeries[i].value) * 100,
            }))
            : null;
        bindCell(cpiYoYSeries, 'macro-cpi-val', 'macro-cpi-spark', 'macro-cpi-note',
                 macro && interpretCpi(macro.cpi), v => '+' + v.toFixed(1) + '%', '#ea580c', fredMissing);
        bindCell(macro && macro.hyspread, 'macro-hy-val', 'macro-hy-spark', 'macro-hy-note',
                 macro && interpretHyspread(macro.hyspread), v => v.toFixed(2) + '%', '#7c2d12', fredMissing);
        const fxMissing = '⚠️ 尚未取得 USD/TWD 資料。先試 Yahoo TWD=X（走 CORS proxy）、失敗才 fallback FMP。若都失敗，可能是 proxy 限流 or Yahoo blocking · 重載試試。';
        bindCell(fx, 'macro-fx-val', 'macro-fx-spark', 'macro-fx-note',
                 interpretFx(fx), v => v.toFixed(3), '#0891b2', fxMissing);
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
        if (!/^\d{2,6}[A-Z]?$/.test(ticker)) { setStatus('error', `⚠️ FinMind 台股 ticker 必須是數字（可帶 A/B/L/R 尾綴 · 例：2330、0050、00981A），你輸入 "${ticker}"`); return; }

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
        // innerHTML 允許 <b> / <br> / <a> · 用於錯誤訊息裡的診斷格式化
        // 訊息來源都是我們自己模板 · 外部字串（FMP error）內嵌時仍該注意 · 目前未偵測到 FMP 回 HTML
        s.innerHTML = msg;
    }

    // ========== 決策框架（情境樹 + 證偽清單 + 部位試算） ==========
    // 目的：把「工具揭露訊號 → 使用者判讀」的下一步結構化 · 追蹤自己的判斷歷史
    // - 情境樹：4 情境機率必須 = 100% · 每個情境給估值判斷
    // - 證偽清單：根據本股觸發的訊號預先建議 · 使用者增/刪/改
    // - 部位試算：簡化凱利邏輯 · 建議比例 ≈ 可承受虧損 / 負向情境跌幅
    // - 存 localStorage: valuation-decision-{ticker} · 純本機
    // - 超過 3 個月標黃 · 提示重新檢視

    const DECISION_KEY_PREFIX = 'valuation-decision-';

    function loadDecisionRecord(ticker) {
        try {
            const raw = localStorage.getItem(DECISION_KEY_PREFIX + ticker);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function saveDecisionRecord(ticker, data) {
        try {
            const record = { ...data, ticker, timestamp: new Date().toISOString() };
            localStorage.setItem(DECISION_KEY_PREFIX + ticker, JSON.stringify(record));
            return record;
        } catch (e) { return null; }
    }

    function clearDecisionRecord(ticker) {
        localStorage.removeItem(DECISION_KEY_PREFIX + ticker);
    }

    // 建議情境（使用者可以自由改名 · 這只是預設）
    function suggestScenarios(analysis) {
        const t = analysis.ticker;
        return [
            { name: `${t} 主要成長敘事兌現（正向）`, prob: 25, verdict: '合理' },
            { name: '成長放緩但基本面未崩（中性下行）', prob: 40, verdict: '偏貴' },
            { name: '估值收縮 / 主要疑慮兌現（負向）', prob: 25, verdict: '過貴' },
            { name: '黑天鵝（總經 / 地緣 / 監管）', prob: 10, verdict: '過貴' },
        ];
    }

    // 根據本股觸發的訊號、預設可證偽條件
    function suggestFalsifyConditions(analysis) {
        const conds = [];
        const cf = analysis.cashFlow;
        const fund = analysis.fundamentals;

        // 現金流背離觸發過 → 追蹤能否收斂
        if (cf && cf.divergence && cf.divergence.kind === 'warning') {
            conds.push({ text: '連續 2 季自由現金流未改善（FCF YoY 仍為負 or 大幅低於淨利成長）', checked: false, date: '' });
        }
        // 非營運項目佔比高 → 追蹤能否收斂
        if (fund && fund.nonOpRatioTtm && Math.abs(fund.nonOpRatioTtm) > 0.2) {
            conds.push({ text: '非營運項目佔稅前獲利 TTM 降至 <20%（下季 10-Q 追查 OI&E 明細）', checked: false, date: '' });
        }
        // SBC 高 → 追蹤能否降低
        if (cf && cf.sbcRatioTtm && cf.sbcRatioTtm > 0.25) {
            conds.push({ text: 'SBC / GAAP 淨利 TTM 降至 <15%（獲利品質改善）', checked: false, date: '' });
        }
        // 樣本量少 → 到未來能有更長歷史時重新驗證
        if (analysis.history && analysis.history.length < 30) {
            const yrs = new Set(analysis.history.map(h => h.year)).size;
            if (yrs < 10) {
                conds.push({ text: `取得 10+ 年歷史後、當前 PE 百分位重新計算 · 是否仍在前 25%（目前只 ${yrs} 年樣本）`, checked: false, date: '' });
            }
        }
        // 分佈離散度大 → 觀察均值回歸
        const analysisSourceIsFMP = analysis.source !== 'FinMind';
        if (analysisSourceIsFMP && analysis.currentPE > 50) {
            conds.push({ text: `絕對 PE 降至 <30（跟「PE 25 是正常」對照 · 目前 ${analysis.currentPE.toFixed(1)}）`, checked: false, date: '' });
        }
        // 總經：泛用條件
        conds.push({ text: 'HY 利差擴大至 4%+ or 殖利率倒掛再度出現（總經風險升溫）', checked: false, date: '' });
        conds.push({ text: 'Forward PE 中位跟 SPY 差距擴大（相對估值再度背離）', checked: false, date: '' });
        return conds;
    }

    function renderDecisionTimestamp(saved) {
        const el = $('decision-timestamp');
        if (!el) return;
        if (!saved || !saved.timestamp) {
            el.className = 'decision-timestamp ts-fresh';
            el.innerHTML = '📝 <b>新建記錄</b> · 填完按「存這份決策記錄」會保留在本機';
            return;
        }
        const then = new Date(saved.timestamp);
        const now = new Date();
        const months = (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30);
        const stale = months > 3;
        el.className = 'decision-timestamp ' + (stale ? 'ts-stale' : 'ts-fresh');
        const warn = stale ? ' · ⚠️ <b>超過 3 個月、市場狀況可能已改變、建議重新檢視 + 存新版</b>' : '';
        el.innerHTML = `📅 本記錄填於 <b>${then.toISOString().slice(0, 10)}</b>（${months.toFixed(1)} 個月前）${warn}`;
    }

    function renderScenarioTree(scenarios) {
        const container = $('scenario-tree');
        if (!container) return;
        container.innerHTML = scenarios.map((s, i) => `
            <div class="scenario-row" data-i="${i}">
                <div class="scenario-header">
                    <input type="text" class="scenario-name" data-i="${i}" value="${escapeAttr(s.name)}" placeholder="情境 ${i + 1} 名稱">
                </div>
                <div class="scenario-body">
                    <label class="scenario-prob-label">
                        機率
                        <input type="range" class="scenario-prob" data-i="${i}" min="0" max="100" step="1" value="${s.prob}">
                        <span class="scenario-prob-val" id="scenario-prob-val-${i}">${s.prob}%</span>
                    </label>
                    <label class="scenario-verdict-label">
                        此情境估值判斷
                        <select class="scenario-verdict" data-i="${i}">
                            <option ${s.verdict === '便宜' ? 'selected' : ''}>便宜</option>
                            <option ${s.verdict === '合理' ? 'selected' : ''}>合理</option>
                            <option ${s.verdict === '偏貴' ? 'selected' : ''}>偏貴</option>
                            <option ${s.verdict === '過貴' ? 'selected' : ''}>過貴</option>
                        </select>
                    </label>
                </div>
            </div>
        `).join('');
    }

    function escapeAttr(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    function renderFalsifyList(conds) {
        const container = $('falsify-list');
        if (!container) return;
        container.innerHTML = conds.map((c, i) => `
            <div class="falsify-row" data-i="${i}">
                <input type="checkbox" class="falsify-check" data-i="${i}" ${c.checked ? 'checked' : ''}>
                <input type="text" class="falsify-text" data-i="${i}" value="${escapeAttr(c.text)}">
                <input type="date" class="falsify-date" data-i="${i}" value="${c.date || ''}" title="觸發日期">
                <button class="falsify-del" data-i="${i}" title="刪除">✕</button>
            </div>
        `).join('');
    }

    function readCurrentScenarios() {
        const rows = document.querySelectorAll('#scenario-tree .scenario-row');
        return Array.from(rows).map((row, i) => ({
            name: row.querySelector('.scenario-name').value,
            prob: parseInt(row.querySelector('.scenario-prob').value) || 0,
            verdict: row.querySelector('.scenario-verdict').value,
        }));
    }

    function readCurrentFalsify() {
        const rows = document.querySelectorAll('#falsify-list .falsify-row');
        return Array.from(rows).map(row => ({
            text: row.querySelector('.falsify-text').value,
            checked: row.querySelector('.falsify-check').checked,
            date: row.querySelector('.falsify-date').value,
        }));
    }

    function updateProbSum() {
        const scenarios = readCurrentScenarios();
        const sum = scenarios.reduce((s, x) => s + x.prob, 0);
        const el = $('prob-sum');
        if (!el) return;
        if (sum === 100) {
            el.textContent = '總和：100% ✅';
            el.className = 'prob-sum prob-sum-ok';
        } else {
            el.textContent = `總和：${sum}% ${sum > 100 ? '⚠️ 超過 100% · 調整機率' : '⚠️ 不足 100% · 調整機率'}`;
            el.className = 'prob-sum prob-sum-warn';
        }
        // 同時更新每個 slider label
        scenarios.forEach((s, i) => {
            const v = $(`scenario-prob-val-${i}`);
            if (v) v.textContent = s.prob + '%';
        });
        // 觸發部位試算重算
        updatePositionCalc();
    }

    function updatePositionCalc() {
        const el = $('dec-calc-result');
        if (!el) return;
        const totalAssets = parseFloat($('dec-total-assets').value) || 0;
        const maxLoss = parseFloat($('dec-max-loss').value) || 10;
        const expectedDrop = parseFloat($('dec-expected-drop').value) || 40;
        if (expectedDrop === 0) {
            el.innerHTML = '負向情境跌幅不能是 0';
            return;
        }
        // 建議比例 = 可承受虧損 / 負向情境預期跌幅
        //   例：承受 10%、跌 40% → 投入 25%（跌 40% × 25% = 損失 10% 剛好）
        const suggestedPct = (maxLoss / expectedDrop) * 100;
        const clamped = Math.min(100, Math.max(0, suggestedPct));
        const suggestedAmt = totalAssets * (clamped / 100);

        // 情境正負向分析：正向 = A + B、負向 = C + D
        const scenarios = readCurrentScenarios();
        const positiveProb = (scenarios[0]?.prob || 0) + (scenarios[1]?.prob || 0);
        const negativeProb = (scenarios[2]?.prob || 0) + (scenarios[3]?.prob || 0);
        const evNote = (positiveProb + negativeProb === 100)
            ? `<br>正向情境機率合計 ${positiveProb}% · 負向 ${negativeProb}%${negativeProb > 50 ? ' · <b>負向偏高、上限應更保守</b>' : ''}`
            : '';

        el.innerHTML = `
            <div class="calc-primary">建議投入比例：<b>${clamped.toFixed(1)}%</b>${totalAssets > 0 ? ` ≈ <b>$${suggestedAmt.toLocaleString(undefined, {maximumFractionDigits: 0})}</b>` : ''}</div>
            <div class="calc-detail">公式：<code>可承受虧損 ${maxLoss}% ÷ 預期跌幅 ${expectedDrop}%</code>${evNote}</div>
            <div class="calc-warn">⚠️ 這是<b>粗略試算不是財務建議</b>——沒考慮利率、稅、跟其他持股的相關性、你的整體風險偏好。凱利公式在實務上常被建議打對折（half-Kelly）避免劇烈回撤。</div>
        `;
    }

    function addFalsifyCondition() {
        const rows = document.querySelectorAll('#falsify-list .falsify-row');
        const nextI = rows.length;
        const div = document.createElement('div');
        div.className = 'falsify-row';
        div.dataset.i = nextI;
        div.innerHTML = `
            <input type="checkbox" class="falsify-check" data-i="${nextI}">
            <input type="text" class="falsify-text" data-i="${nextI}" placeholder="自訂條件（例：Q2 EPS guidance 下修）">
            <input type="date" class="falsify-date" data-i="${nextI}" title="觸發日期">
            <button class="falsify-del" data-i="${nextI}" title="刪除">✕</button>
        `;
        $('falsify-list').appendChild(div);
    }

    function initDecisionFramework(analysis) {
        const panel = $('decision-panel');
        if (!panel) return;
        panel.hidden = false;

        const saved = loadDecisionRecord(analysis.ticker);
        const scenarios = (saved && saved.scenarios && saved.scenarios.length === 4)
            ? saved.scenarios : suggestScenarios(analysis);
        const conds = (saved && saved.falsify && saved.falsify.length > 0)
            ? saved.falsify : suggestFalsifyConditions(analysis);

        renderDecisionTimestamp(saved);
        renderScenarioTree(scenarios);
        renderFalsifyList(conds);

        // 委派事件（container-level · 避免每次 render 都重掛）
        const tree = $('scenario-tree');
        tree.oninput = () => updateProbSum();

        const falsify = $('falsify-list');
        falsify.onclick = e => {
            if (e.target.classList.contains('falsify-del')) {
                const row = e.target.closest('.falsify-row');
                if (row) row.remove();
            }
        };

        // 部位試算 input 變 → 重算
        ['dec-total-assets', 'dec-max-loss', 'dec-expected-drop'].forEach(id => {
            const el = $(id);
            if (el) el.oninput = () => updatePositionCalc();
        });

        // 儲存 / 清除 / 新增
        $('btn-save-decision').onclick = () => {
            const record = saveDecisionRecord(analysis.ticker, {
                scenarios: readCurrentScenarios(),
                falsify: readCurrentFalsify(),
            });
            const s = $('dec-save-status');
            if (record) {
                s.textContent = `✅ 存好了（${record.timestamp.slice(0, 16).replace('T', ' ')}）`;
                s.className = 'dec-save-status saved';
                renderDecisionTimestamp(record);
            } else {
                s.textContent = '❌ 存失敗（localStorage 可能滿了）';
                s.className = 'dec-save-status err';
            }
        };
        $('btn-clear-decision').onclick = () => {
            if (confirm(`確定清除 ${analysis.ticker} 的決策記錄？（無法還原）`)) {
                clearDecisionRecord(analysis.ticker);
                const fresh = suggestScenarios(analysis);
                const freshConds = suggestFalsifyConditions(analysis);
                renderScenarioTree(fresh);
                renderFalsifyList(freshConds);
                renderDecisionTimestamp(null);
                updateProbSum();
                $('dec-save-status').textContent = '🗑 已清除';
                $('dec-save-status').className = 'dec-save-status';
            }
        };
        $('btn-add-falsify').onclick = () => addFalsifyCondition();

        // 初始化總和跟部位計算
        updateProbSum();
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
        // 台股：4-6 位數字 · 可選一個字母尾綴
        //   A = 特別股（2882A 國泰特）· 主動式 ETF（00981A）
        //   L = 正 2 槓桿（00631L）· R = 反 1（00632R）· B = B 股
        if (/^\d{4,6}[A-Z]?$/.test(t)) return { source: 'finmind', normalized: t };
        // 純數字（3-位以下）· 亦視為台股（極少數老股票 3 位 code）
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

            // 先 await stockPromise · 判 ETF 早退——避免 ETF 情況下跑一堆用不到的 fetch（buyback / fx / margin）
            // 雖然多 1 RTT 但個股情況下差異不到 500ms · 對 ETF 情況換來 console 乾淨值得
            const stockPreview = await stockPromise;
            if (stockPreview && stockPreview.__isEtf) {
                renderEtf(stockPreview.etf);
                setStatus('success', `✅ ${stockPreview.etf.stockName} (${stockPreview.etf.ticker}) · ETF 分析`);
                return;
            }

            // 平行抓總體 / 匯率 / 融資 + 股利 + ADR counterpart + Yahoo quote（都 optional · 只個股才需要）
            // VIX 從 macro.vix（FRED VIXCLS）拿，FMP 只當 fallback
            // ADR counterpart：查 US 股時若命中 ADR_MAP、順便抓對應台股價（例：TSM → 2330）
            // Yahoo quote：只對美股抓 · 補 Forward PE + 短興趣
            const [macro, fx, vixFmpFallback, marginTW, dividendsTW, adrCounterpart, yahooQuote, peersComparison, twDivHist, twBuyback] = await Promise.all([
                fetchMacroFred(fredKey),
                fetchForexUsdTwd(fmpKey),
                fetchVixHistoryFmp(fmpKey),
                (isFinmind && finmindToken) ? fetchMarginTW(ticker, finmindToken) : Promise.resolve(null),
                (isFinmind && finmindToken) ? fetchDividendTW(ticker, finmindToken) : Promise.resolve([]),
                (!isFinmind) ? fetchAdrCounterpart(ticker, finmindToken) : Promise.resolve(null),
                (!isFinmind) ? fetchYahooQuote(ticker) : Promise.resolve(null),
                (!isFinmind) ? fetchPeersComparison(ticker, fmpKey) : Promise.resolve(null),
                (isFinmind && finmindToken) ? fetchTwDividendHistory(ticker, finmindToken) : Promise.resolve(null),
                (isFinmind && finmindToken) ? fetchTwBuyback(ticker, finmindToken) : Promise.resolve(null),
            ]);
            const data = stockPreview;

            // VIX 優先 FRED（免額度、更穩定）→ 失敗 fallback FMP
            const vix = (macro && macro.vix && macro.vix.length) ? macro.vix : vixFmpFallback;

            data.marginTW = marginTW;
            data.dividendsTW = dividendsTW;
            data.adrCounterpart = adrCounterpart;
            data.fxSeries = fx;
            data.yahooQuote = yahooQuote;
            data.peersComparison = peersComparison;
            // Feature · TW 配息 + 庫藏股 attach 到 fundamentals（跟 US 對齊）
            if (data.fundamentals) {
                if (twDivHist) data.fundamentals.dividendHistory = twDivHist;
                if (twBuyback) data.fundamentals.buybackHistory = twBuyback;
            }
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

        // Phase 7 · URL query 支援 ?ticker=2330 · 自動填入 + 執行
        try {
            const params = new URLSearchParams(window.location.search);
            const urlTicker = params.get('ticker');
            if (urlTicker && urlTicker.trim()) {
                $('cfg-ticker').value = urlTicker.trim();
                // 若是純數字 · 自動切 FinMind mode（若在 auto 也 OK）
                // 300ms 後自動 query · 給 UI 時間 render
                setTimeout(() => onQuery(), 300);
            }
        } catch (e) { console.warn('URL query 解析失敗:', e.message); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
