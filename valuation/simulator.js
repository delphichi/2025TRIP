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
    async function fetchFinMindFundamentals(ticker, token) {
        try {
            const startDate = todayMinusYears(4);   // 4 年 = 16 季足夠算 10 季 YoY
            const [fsRows, bsRows] = await Promise.all([
                finMindFetch('TaiwanStockFinancialStatements', ticker, startDate, todayStr(), token),
                finMindFetch('TaiwanStockBalanceSheet', ticker, startDate, todayStr(), token).catch(() => []),
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
                }
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
        ]);
        const [quoteR, profileR, ratiosR, fundR, cfR] = results;
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

        // === 3. 毛利率趨勢（OLS 斜率 · 抗 outlier · 拉到 8 季）
        // 舊版 bug：只用 margins[0] vs margins[3] 兩個端點 · 遇到單季異常值就翻轉判讀
        //   e.g. 2360 致茂 · 8 季 59.2→...→62.6 · 但 4 季前剛好爆出 65.4 outlier
        //   endpoint 差 = 62.6 - 65.4 = -2.8pp → 誤判「下滑」→ 22 分
        //   OLS 斜率 = +0.47pp/季 → 正確判「上升」→ 75-79 分
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
                const slope = den > 0 ? num / den : 0;   // decimal 形式：0.01 = 1pp/qtr
                grossMarginSlopePpQtr = slope * 100;      // 給顯示用（pp/qtr）
                const latestMargin = margins[0] * 100;
                // 高毛利股（>50%）就算持平也給高分
                if (latestMargin >= 50 && Math.abs(slope) < 0.005) {
                    grossMarginTrend = 75;
                } else if (slope > 0.005) {
                    // 上升趨勢
                    grossMarginTrend = Math.min(100, 60 + slope * 4000);
                } else if (slope < -0.01) {
                    // 明顯下滑
                    grossMarginTrend = Math.max(0, 30 + slope * 3000);
                } else {
                    // 略降或持平（低毛利）
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
            else if (peg <= 2.0) pegScore = 100 - (peg - 1.0) * 40;   // 60-100
            else if (peg <= 3.0) pegScore = 60 - (peg - 2.0) * 60;    // 0-60
            else pegScore = 0;
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
            fcfConversion: fcfConversionRaw,
            sbcDilution: sbcDilutionRaw,
            ruleOf40: ruleOf40Raw,
        };
        // Phase 7.3 · 額外：毛利趨勢的斜率（給顯示用 · 讓讀者看到分數來源）
        raw.grossMarginSlope = grossMarginSlopePpQtr;
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

        // 毛利趨勢特殊顯示：附上斜率讓讀者看到分數為什麼是這個
        const slopeSuffix = () => {
            const sl = raw.grossMarginSlope;
            if (sl === null || sl === undefined || !isFinite(sl)) return '';
            const sign = sl >= 0 ? '+' : '';
            return ` · 斜率 ${sign}${sl.toFixed(2)}pp/Q`;
        };

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
            const isTrend = a.key === 'grossMarginTrend';
            if (isTrend) rawStr = rawStr + a.unit + slopeSuffix();
            const scoreStr = (s === null || s === undefined) ? '—' : Math.round(s);
            const clsScore = s === null ? '' : (s >= 70 ? 'axis-good' : s >= 40 ? 'axis-mid' : 'axis-poor');
            return `<tr>
                <td><b>${a.label}</b></td>
                <td>${rawStr}${isTrend ? '' : a.unit}</td>
                <td class="${clsScore}">${scoreStr}分</td>
                <td class="hint-mini">${a.mapping}</td>
            </tr>`;
        }).join('');

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

    // ---------- Rendering ----------
    function renderResult(analysis) {
        const { ticker, name, price, currentPE, currentPBR, history, latestRatioDate, sector } = analysis;

        $('result-panel').hidden = false;
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
        const fundHtml = renderFundamentalsHtml(analysis.fundamentals);
        const instHtml = renderInstitutionalHtml(analysis.institutional);
        const marginHtml = renderMarginHtml(analysis.marginTW, analysis.dividendsTW);
        // Phase 7 · 兩張雷達 stacked（B 選項）· 價值派在上、成長派在下
        // Phase 7.2 · 落差偵測（gap ≥ 30 顯示 · 置於兩雷達最上方）
        const mismatchHtml = detectFrameworkMismatch(analysis);
        const radarHtml = renderRadarSvg(analysis);
        const growthRadarHtml = renderGrowthRadarSvg(analysis);
        $('detail-box').innerHTML = peerHtml + adrHtml + cfHtml + fundHtml + instHtml + marginHtml + tableHtml + mismatchHtml + radarHtml + growthRadarHtml;

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
    async function fetchPeersComparison(usTicker, fmpKey) {
        if (!fmpKey) return null;
        try {
            const peers = await fmpFetch(`/stock-peers?symbol=${usTicker}`, fmpKey);
            if (!Array.isArray(peers) || peers.length === 0) return null;
            // 取 6-8 家 · 加上自己 + SPY（大盤參考）· batch symbols 一次拉
            const peerTickers = peers.slice(0, 7).map(p => p.symbol).filter(Boolean);
            const symbols = [usTicker, ...peerTickers, 'SPY'].join(',');
            const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
            let data = null;
            try { data = await fredRawFetch(url); } catch (_) {}
            if (!data) {
                for (const proxy of CORS_PROXIES) {
                    try { data = await fredRawFetch(`${proxy}${encodeURIComponent(url)}`); break; }
                    catch (_) { data = null; }
                }
            }
            if (!data || !data.quoteResponse || !Array.isArray(data.quoteResponse.result)) return null;
            const bySym = new Map();
            data.quoteResponse.result.forEach(q => bySym.set(q.symbol, q));

            const toRow = (sym, name) => {
                const q = bySym.get(sym);
                if (!q) return null;
                const fwdGrowth = (q.epsForward && q.epsTrailingTwelveMonths && q.epsTrailingTwelveMonths > 0)
                    ? ((q.epsForward - q.epsTrailingTwelveMonths) / q.epsTrailingTwelveMonths) * 100
                    : null;
                const fwdPeg = (q.forwardPE && fwdGrowth && fwdGrowth > 0) ? q.forwardPE / fwdGrowth : null;
                return {
                    symbol: sym, name: name || sym,
                    trailingPE: q.trailingPE,
                    forwardPE: q.forwardPE,
                    fwdGrowth, fwdPeg,
                };
            };

            const peerRows = peerTickers.map(t => {
                const cfg = peers.find(p => p.symbol === t);
                return toRow(t, cfg ? cfg.companyName : t);
            }).filter(Boolean);
            const spyRow = toRow('SPY', 'S&P 500');

            // Peer group median（不含自己 · 不含 SPY）
            const med = arr => {
                const s = arr.filter(v => v !== null && v !== undefined && isFinite(v)).sort((a, b) => a - b);
                return s.length ? s[Math.floor(s.length / 2)] : null;
            };
            const peerFwdPeMed = med(peerRows.map(p => p.forwardPE));
            const peerFwdPegMed = med(peerRows.map(p => p.fwdPeg));
            const peerTrailingPeMed = med(peerRows.map(p => p.trailingPE));

            return { peerRows, spyRow, peerFwdPeMed, peerFwdPegMed, peerTrailingPeMed };
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

            // 平行抓總體 / 匯率 / 融資 + 股利 + ADR counterpart + Yahoo quote（都 optional）
            // VIX 從 macro.vix（FRED VIXCLS）拿，FMP 只當 fallback
            // ADR counterpart：查 US 股時若命中 ADR_MAP、順便抓對應台股價（例：TSM → 2330）
            // Yahoo quote：只對美股抓 · 補 Forward PE + 短興趣
            const [data, macro, fx, vixFmpFallback, marginTW, dividendsTW, adrCounterpart, yahooQuote, peersComparison] = await Promise.all([
                stockPromise,
                fetchMacroFred(fredKey),
                fetchForexUsdTwd(fmpKey),
                fetchVixHistoryFmp(fmpKey),
                (isFinmind && finmindToken) ? fetchMarginTW(ticker, finmindToken) : Promise.resolve(null),
                (isFinmind && finmindToken) ? fetchDividendTW(ticker, finmindToken) : Promise.resolve([]),
                (!isFinmind) ? fetchAdrCounterpart(ticker, finmindToken) : Promise.resolve(null),
                (!isFinmind) ? fetchYahooQuote(ticker) : Promise.resolve(null),
                (!isFinmind) ? fetchPeersComparison(ticker, fmpKey) : Promise.resolve(null),
            ]);

            // VIX 優先 FRED（免額度、更穩定）→ 失敗 fallback FMP
            const vix = (macro && macro.vix && macro.vix.length) ? macro.vix : vixFmpFallback;

            data.marginTW = marginTW;
            data.dividendsTW = dividendsTW;
            data.adrCounterpart = adrCounterpart;
            data.fxSeries = fx;
            data.yahooQuote = yahooQuote;
            data.peersComparison = peersComparison;
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
