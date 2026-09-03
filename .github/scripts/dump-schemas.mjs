#!/usr/bin/env node
// FinMind + FMP + FRED schema dump —— 印出每個 dataset / endpoint / series 實際回傳的欄位名。
// 讀 env：FINMIND_TOKEN、FMP_API_KEY、FRED_API_KEY、TW_TICKER、US_TICKER、YEARS
// 輸出：markdown 到 stdout。

// 秘密都 trim（GitHub Actions secret 會保留貼上時的前後空白 / 換行——常見坑）
const trimEnv = k => (process.env[k] || '').trim();
const FINMIND_TOKEN = trimEnv('FINMIND_TOKEN');
const FMP_API_KEY = trimEnv('FMP_API_KEY');
const FRED_API_KEY = trimEnv('FRED_API_KEY');
const ALPHAVANTAGE_API_KEY = trimEnv('ALPHAVANTAGE_API_KEY');
const {
    TW_TICKER = '2330',
    US_TICKER = 'AAPL',
    YEARS = '2',
    AV_CATEGORIES = 'intelligence,timeseries,forex,commodities,econ,technical',
} = process.env;

// 診斷：把原始長度 vs trim 後長度印出來，一眼看出有沒有偷夾 whitespace
function keyDiag(name, rawLen, trimmedVal) {
    if (!trimmedVal) return `❌ ${name} 未設定`;
    const stray = rawLen - trimmedVal.length;
    if (stray > 0) return `⚠️ ${name} 有 ${stray} 個前後空白已 trim（長度 ${rawLen} → ${trimmedVal.length}）`;
    return `✅ ${name} 長度 ${trimmedVal.length}`;
}

const yearsBack = parseInt(YEARS) || 2;
const todayStr = () => new Date().toISOString().slice(0, 10);
const yearsAgo = y => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - y);
    return d.toISOString().slice(0, 10);
};
const startDate = yearsAgo(yearsBack);
const endDate = todayStr();

// ---------------- helpers ----------------
function heading(level, text) {
    return '\n' + '#'.repeat(level) + ' ' + text + '\n';
}
function code(text) { return '```\n' + text + '\n```\n'; }
function inlineCode(text) { return '`' + String(text) + '`'; }
function truncate(s, n = 60) {
    s = String(s);
    return s.length > n ? s.slice(0, n) + '…' : s;
}

async function safeFetch(url, opts) {
    try {
        const res = await fetch(url, opts);
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch { body = text; }
        return { ok: res.ok, status: res.status, body };
    } catch (e) {
        return { ok: false, status: 0, body: `fetch error: ${e.message}` };
    }
}

// ---------------- FinMind ----------------
const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data';

// 每個 dataset：category 分類 · 我們程式現在讀了哪些欄位（方便比對）
const FINMIND_DATASETS = [
    // 已在用的
    { name: 'TaiwanStockPrice',                        note: '每日 OHLCV（已用）' },
    { name: 'TaiwanStockPER',                          note: '每日 PER / PBR / 殖利率（已用）' },
    { name: 'TaiwanStockInfo',                         note: '基本資訊 · 公司名 / 產業（已用）' },
    { name: 'TaiwanStockFinancialStatements',          note: '損益表 long format · 程式讀 Revenue/OperatingRevenue/TotalRevenue、GrossProfit/OperatingGrossProfit、OperatingIncome/OperatingProfit、EPS/BasicEPS/DilutedEPS' },
    { name: 'TaiwanStockCashFlowsStatement',           note: '現金流量表 long format · 程式讀 CashFlowsFromOperatingActivities/OperatingCashFlow、FreeCashFlow、NetIncome/NetIncomeAfterTax/NetIncomeAttributableToOwners（FCF + NI 抓不到！本次要驗證）' },
    { name: 'TaiwanStockBalanceSheet',                 note: '資產負債表 long format · Priority 2 會用（總資產 / 負債 / 應收 / 存貨）' },
    { name: 'TaiwanStockInstitutionalInvestorsBuySell',note: '三大法人買賣超（已用 · 有 name 分類）' },

    // Priority 2 之後可能用的
    { name: 'TaiwanStockMonthRevenue',                 note: '月營收（每月 10 號公告 · 領先季報 6 週）' },
    { name: 'TaiwanStockMarginPurchaseShortSale',      note: '融資融券（散戶槓桿情緒）' },
    { name: 'TaiwanStockShareholding',                 note: '外資 / 陸資 / 僑外資持股比率（趨勢 vs 買賣超）' },
    { name: 'TaiwanStockDividend',                     note: '股利（配息穩定度 · 品質層次）' },
    { name: 'TaiwanStockHoldingSharesPer',             note: '集保股權分散（大戶 vs 散戶）' },
    { name: 'TaiwanStockGovernmentBankBuySell',        note: '八大公股行庫買賣超（另一組情緒指標）' },
    { name: 'TaiwanStockMarketValueWeight',            note: '市值權重（大盤定位）' },
];

async function finMindFetch(dataset, dataId) {
    const url = `${FINMIND_BASE}?dataset=${dataset}&data_id=${encodeURIComponent(dataId)}&start_date=${startDate}&end_date=${endDate}&token=${FINMIND_TOKEN}`;
    return safeFetch(url);
}

async function dumpFinMind() {
    let out = heading(2, '🇹🇼 FinMind');
    out += `\n- ticker: ${inlineCode(TW_TICKER)}\n- 期間: ${inlineCode(startDate)} → ${inlineCode(endDate)}\n- token: ${FINMIND_TOKEN ? '✅ 有' : '❌ 未設 FINMIND_TOKEN secret'}\n`;

    if (!FINMIND_TOKEN) {
        out += '\n> ⚠️ 沒有 FINMIND_TOKEN，跳過。到 Settings → Secrets 加。\n';
        return out;
    }

    for (const ds of FINMIND_DATASETS) {
        out += heading(3, `📦 \`${ds.name}\``);
        out += `_${ds.note}_\n\n`;

        const r = await finMindFetch(ds.name, TW_TICKER);
        if (!r.ok) {
            out += `❌ HTTP ${r.status}: ${truncate(JSON.stringify(r.body), 200)}\n`;
            continue;
        }
        const body = r.body;
        if (typeof body === 'string' || !body || body.status !== 200) {
            out += `❌ FinMind status=${body && body.status}: ${truncate(JSON.stringify(body), 200)}\n`;
            continue;
        }
        const rows = body.data || [];
        if (rows.length === 0) {
            out += `⚠️ 0 rows returned（免費 tier 可能沒開這個 dataset 或這支股票沒資料）\n`;
            continue;
        }
        out += `✅ **${rows.length} rows** · sample row keys: \`${Object.keys(rows[0]).join(', ')}\`\n\n`;

        // Long format：有 type 欄位 → 拉 unique + origin_name + count + sample
        if (rows[0].type !== undefined) {
            const typeMap = new Map();
            rows.forEach(r => {
                if (!typeMap.has(r.type)) typeMap.set(r.type, { origin: r.origin_name || '', count: 0, sample: r.value });
                typeMap.get(r.type).count += 1;
            });
            out += `**unique \`type\` 值（共 ${typeMap.size}）**\n\n`;
            out += '| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |\n';
            out += '| --- | --- | ---: | ---: |\n';
            Array.from(typeMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([t, info]) => {
                out += `| \`${t}\` | ${info.origin} | ${info.count} | ${truncate(String(info.sample), 30)} |\n`;
            });
            out += '\n';
        }
        // 法人 dataset：有 name 欄位
        else if (rows[0].name !== undefined) {
            const nameMap = new Map();
            rows.forEach(r => {
                if (!nameMap.has(r.name)) nameMap.set(r.name, 0);
                nameMap.set(r.name, nameMap.get(r.name) + 1);
            });
            out += `**unique \`name\` 值（共 ${nameMap.size}）**\n\n`;
            out += '| name | rows |\n| --- | ---: |\n';
            Array.from(nameMap.entries()).sort().forEach(([n, c]) => {
                out += `| \`${n}\` | ${c} |\n`;
            });
            out += '\n';
        }

        // 前 3 rows sample
        out += '<details><summary>📄 sample raw JSON（前 3 rows）</summary>\n\n';
        out += code(JSON.stringify(rows.slice(0, 3), null, 2));
        out += '\n</details>\n';
    }
    return out;
}

// ---------------- FMP ----------------
const FMP_BASE = 'https://financialmodelingprep.com/stable';

const FMP_ENDPOINTS = [
    { path: '/quote',                            params: 'symbol', note: '即時 quote（price / pe / marketCap）· 已用' },
    { path: '/profile',                          params: 'symbol', note: '公司基本資料 · 已用' },
    { path: '/ratios',                           params: 'symbol', note: '歷年年度 ratios（priceEarningsRatio / priceToBookRatio）· 已用' },
    { path: '/ratios-ttm',                       params: 'symbol', note: 'TTM ratios（最新 12 個月）' },
    { path: '/income-statement',                 params: 'symbol&period=quarter',   note: '損益表季度 · 已用（revenue / eps / grossProfitRatio / operatingIncomeRatio）' },
    { path: '/cash-flow-statement',              params: 'symbol&period=quarter',   note: '現金流量表季度 · 已用（operatingCashFlow / freeCashFlow / netIncome）' },
    { path: '/balance-sheet-statement',          params: 'symbol&period=quarter',   note: '資產負債表季度 · Priority 2 會用' },
    { path: '/key-metrics',                      params: 'symbol&period=quarter',   note: '關鍵指標（roic / debtToEquity / capex ratio 等）' },
    { path: '/financial-growth',                 params: 'symbol&period=quarter',   note: '成長率預算（revenue growth / net income growth 已算好）' },
    { path: '/historical-price-full',            params: 'symbol', note: '歷史日 K（Priority 2 可能用）' },
    { path: '/insider-trading',                  params: 'symbol', note: '內部人買賣（層次 5 · 情緒）' },
    { path: '/institutional-holder',             params: 'symbol', note: '機構持股（美股 13F 濃縮版）' },
    { path: '/analyst-estimates',                params: 'symbol', note: '分析師預估' },
    { path: '/stock-peers',                      params: 'symbol', note: '同類股（peer comparison · Priority 2）' },
];

async function fmpFetch(ep) {
    const [param, ...extra] = ep.params.split('&');
    let query = `?${param}=${US_TICKER}`;
    if (extra.length) query += '&' + extra.join('&');
    query += `&apikey=${FMP_API_KEY}`;
    const url = `${FMP_BASE}${ep.path}${query}`;
    return safeFetch(url);
}

async function dumpFMP() {
    let out = heading(2, '🇺🇸 FMP (/stable/)');
    out += `\n- ticker: ${inlineCode(US_TICKER)}\n- key: ${FMP_API_KEY ? '✅ 有' : '❌ 未設 FMP_API_KEY secret'}\n`;

    if (!FMP_API_KEY) {
        out += '\n> ⚠️ 沒有 FMP_API_KEY，跳過。\n';
        return out;
    }

    for (const ep of FMP_ENDPOINTS) {
        out += heading(3, `📦 \`${ep.path}\``);
        out += `_${ep.note}_\n\n`;
        out += `URL: \`${ep.path}?${ep.params.replace(/symbol/, US_TICKER)}\`\n\n`;

        const r = await fmpFetch(ep);
        if (!r.ok) {
            out += `❌ HTTP ${r.status}: ${truncate(JSON.stringify(r.body), 200)}\n`;
            continue;
        }
        const body = r.body;
        // FMP 通常回傳 array or object with array
        let arr = Array.isArray(body) ? body : (body && body.historical) || [];
        if (!Array.isArray(arr) || arr.length === 0) {
            if (arr && !Array.isArray(arr)) {
                out += `📦 回傳單一 object，keys: \`${Object.keys(body).join(', ')}\`\n\n`;
                out += code(JSON.stringify(body, null, 2));
                continue;
            }
            out += `⚠️ 空陣列 or 非 array 回傳: ${truncate(JSON.stringify(body), 200)}\n`;
            continue;
        }

        out += `✅ **${arr.length} rows**\n\n`;
        // 所有 rows 的 union of keys（欄位可能不齊全）
        const keyset = new Set();
        arr.slice(0, 20).forEach(r => Object.keys(r || {}).forEach(k => keyset.add(k)));
        out += `**union of top-level keys（前 20 rows 掃過，共 ${keyset.size}）**\n\n`;
        const sortedKeys = Array.from(keyset).sort();
        // 表格：key + 第一筆的 sample value
        out += '| key | sample (row 0) |\n| --- | --- |\n';
        sortedKeys.forEach(k => {
            const v = arr[0][k];
            out += `| \`${k}\` | ${truncate(JSON.stringify(v), 60)} |\n`;
        });
        out += '\n';

        // Sample raw JSON
        out += '<details><summary>📄 sample raw JSON（前 2 rows）</summary>\n\n';
        out += code(JSON.stringify(arr.slice(0, 2), null, 2));
        out += '\n</details>\n';
    }
    return out;
}

// ---------------- FRED ----------------
// St. Louis Fed 免費 API · 2 個關鍵 endpoint：
//   /fred/series?series_id=X            → metadata（title / units / frequency / seasonal_adjustment / last_updated）
//   /fred/series/observations?series_id=X → 實際 { date, value } 資料
// value = '.' 代表缺值（假日 / 未公布）
const FRED_BASE = 'https://api.stlouisfed.org/fred';

// 我們程式在用的 + 值得探索的 series（覆蓋層次 4 判讀所需 + Priority 2 備援）
const FRED_SERIES = [
    // 已用
    { id: 'DGS10',       note: '10Y 公債殖利率 · 已用（層次 4 主指標）' },
    { id: 'T10Y2Y',      note: '10-2 利差 · 已用（衰退領先指標）' },
    { id: 'FEDFUNDS',    note: '聯邦資金利率 · 已用（月頻）' },
    { id: 'DTWEXBGS',    note: '美元廣義指數 · 已抓（尚未 render）' },
    // 備援 / Priority 2
    { id: 'VIXCLS',      note: 'VIX 收盤（FRED 版本 · 若 FMP 額度用完可備援）' },
    { id: 'CPIAUCSL',    note: 'CPI 消費者物價指數（通膨壓力）' },
    { id: 'CPILFESL',    note: '核心 CPI（去除食品能源）' },
    { id: 'UNRATE',      note: '失業率（勞動市場鬆緊）' },
    { id: 'PAYEMS',      note: '非農就業（總體強度）' },
    { id: 'MORTGAGE30US',note: '30 年房貸利率（消費者利率傳導）' },
    { id: 'DGS2',        note: '2Y 公債殖利率（政策預期）' },
    { id: 'BAMLH0A0HYM2',note: '高收益債利差（信用風險溫度計）' },
    { id: 'DCOILWTICO',  note: 'WTI 原油（能源 / 通膨投入）' },
    { id: 'GDP',         note: '美國 GDP（季頻）' },
];

async function fredFetch(path, params) {
    const qs = new URLSearchParams({ api_key: FRED_API_KEY, file_type: 'json', ...params });
    return safeFetch(`${FRED_BASE}${path}?${qs}`);
}

async function dumpFRED() {
    let out = heading(2, '🇺🇸 FRED (St. Louis Fed)');
    out += `\n- 期間: ${inlineCode(startDate)} → ${inlineCode(endDate)}\n- key: ${FRED_API_KEY ? '✅ 有' : '❌ 未設 FRED_API_KEY secret'}\n`;

    if (!FRED_API_KEY) {
        out += '\n> ⚠️ 沒 FRED_API_KEY，跳過。到 Settings → Secrets 加。\n';
        return out;
    }

    // Step 1：先用 DGS10 metadata 端點驗證 key 是否有效
    out += '\n### 🔑 Key 驗證（用 DGS10 metadata 試打）\n\n';
    const probe = await fredFetch('/series', { series_id: 'DGS10' });
    if (!probe.ok) {
        out += `❌ Key 無效 or 網路失敗 · HTTP ${probe.status}\n${code(truncate(JSON.stringify(probe.body), 500))}\n`;
        out += '\n> 常見錯誤：400 = key 格式錯 · 403 = key 已撤銷 · 429 = 額度用完\n';
        return out;
    }
    out += `✅ Key 有效（HTTP ${probe.status}）\n`;

    // Step 2：逐 series 抓 metadata + observations
    for (const s of FRED_SERIES) {
        out += heading(3, `📦 \`${s.id}\``);
        out += `_${s.note}_\n\n`;

        // Metadata
        const meta = await fredFetch('/series', { series_id: s.id });
        if (!meta.ok) {
            out += `❌ metadata HTTP ${meta.status}: ${truncate(JSON.stringify(meta.body), 200)}\n`;
            continue;
        }
        const seriesInfo = meta.body && meta.body.seriess && meta.body.seriess[0];
        if (seriesInfo) {
            out += '| field | value |\n| --- | --- |\n';
            const keys = ['id', 'title', 'frequency', 'frequency_short', 'units', 'units_short',
                          'seasonal_adjustment', 'seasonal_adjustment_short', 'last_updated',
                          'observation_start', 'observation_end', 'popularity'];
            keys.forEach(k => {
                if (seriesInfo[k] !== undefined) out += `| \`${k}\` | ${truncate(String(seriesInfo[k]), 100)} |\n`;
            });
            out += '\n';
        } else {
            out += `⚠️ metadata payload 沒 seriess[0]：${truncate(JSON.stringify(meta.body), 300)}\n`;
        }

        // Observations
        const obs = await fredFetch('/series/observations', { series_id: s.id, observation_start: startDate });
        if (!obs.ok) {
            out += `❌ observations HTTP ${obs.status}: ${truncate(JSON.stringify(obs.body), 200)}\n`;
            continue;
        }
        const observations = (obs.body && obs.body.observations) || [];
        const validObs = observations.filter(o => o.value !== '.');
        out += `- **rows**: ${observations.length} total · **${validObs.length} valid**（value = "." 是缺值 / 假日）\n`;
        if (observations.length) {
            out += `- **sample row keys**: \`${Object.keys(observations[0]).join(', ')}\`\n`;
        }
        if (validObs.length) {
            const first = validObs[0], last = validObs[validObs.length - 1];
            out += `- **first**: ${first.date} = ${first.value}\n`;
            out += `- **latest**: ${last.date} = ${last.value}\n`;
        }
        out += '\n';

        // 前 3 + 尾 3 sample
        out += '<details><summary>📄 sample observations（首 3 有效 + 尾 3 有效）</summary>\n\n';
        const sampleSet = [...validObs.slice(0, 3), '...', ...validObs.slice(-3)];
        out += code(JSON.stringify(sampleSet, null, 2));
        out += '\n</details>\n';
    }
    return out;
}

// ---------------- AlphaVantage ----------------
// 免費 tier 硬限制：25 次/日 + burst limiter（併發太快會被擋，即使當日額度還夠 ·
//   valuation/simulator.js 的 avFetch() 已經加 avThrottle() 修過這個坑，這裡的 dump script
//   是另一個獨立呼叫 AV 的地方，一樣要 sleep 節流，不能直接複製貼上就對了）
// 25 次/日很窄，不可能一次 dump 全部類別（光是技術指標就 60+ 個），所以：
//   - 分類別（category）· 用 AV_CATEGORIES env（逗號分隔）挑要 dump 哪些
//   - 每個類別給「已用」+「還沒用、以後可能用」兩種都標記，一眼看出目前程式覆蓋到哪
//   - 技術指標只放 4 個代表性的（RSI/MACD/BBANDS/SMA）· 其餘 56+ 個是同樣的
//     interval + time_period + series_type 模式，要探索直接照樣加一行
const AV_BASE = 'https://www.alphavantage.co/query';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AV_MIN_INTERVAL_MS = 1300;   // 比 app 端的 1100ms 更保守一點 · CI runner 網路延遲會壓縮實際間隔

const AV_ENDPOINTS = [
    // ---- fundamentals：已在 app 裡實際呼叫（valuation/simulator.js 的 fetchStockDataFromAlphaVantage 那組）----
    { category: 'fundamentals', fn: 'OVERVIEW', extra: {}, note: '公司總覽（sector/industry/PE/PBR/ROE...）· 已用', used: true },
    { category: 'fundamentals', fn: 'GLOBAL_QUOTE', extra: {}, note: '即時報價 · 已用', used: true },
    { category: 'fundamentals', fn: 'INCOME_STATEMENT', extra: {}, note: '損益表季/年報 · 已用', used: true },
    { category: 'fundamentals', fn: 'BALANCE_SHEET', extra: {}, note: '資產負債表季/年報 · 已用', used: true },
    { category: 'fundamentals', fn: 'CASH_FLOW', extra: {}, note: '現金流量表季/年報 · 已用（含 stockBasedCompensation 直接欄位，SBC 比率算得出來）', used: true },
    { category: 'fundamentals', fn: 'EARNINGS', extra: {}, note: 'EPS 季/年報 · 已用', used: true },
    { category: 'fundamentals', fn: 'DIVIDENDS', extra: {}, note: '配息歷史 · 已用', used: true },
    { category: 'fundamentals', fn: 'SPLITS', extra: {}, note: '分割歷史 · 已用，校正股本 YoY 的分割失真（cumulativeSplitFactor）', used: true },
    // ---- fundamentals：還沒用，以後可能用 ----
    { category: 'fundamentals', fn: 'EARNINGS_CALENDAR', extra: {}, note: '未來財報公布日期（CSV 不是 JSON）· 可加進「即將公布」提醒', used: false },
    { category: 'fundamentals', fn: 'LISTING_STATUS', extra: {}, note: '全市場上市/下市清單（CSV）· 可做 ticker 有效性檢查', used: false },

    // ---- Alpha Intelligence：目前完全沒用、最值得探索 ----
    { category: 'intelligence', fn: 'NEWS_SENTIMENT', extra: { tickers: '__TICKER__' }, note: '新聞 + AI 情緒分數 · 可能取代/補強 TW 新聞關鍵字過濾', used: false },
    { category: 'intelligence', fn: 'INSIDER_TRANSACTIONS', extra: {}, note: '內部人交易 · FMP insider-trading 需付費 tier 時的潛在備援', used: false },
    { category: 'intelligence', fn: 'TOP_GAINERS_LOSERS', extra: {}, note: '當日漲跌幅+成交量排行榜（全市場，不吃 symbol）', used: false, noSymbol: true },
    { category: 'intelligence', fn: 'ANALYTICS_FIXED_WINDOW', extra: { SYMBOLS: '__TICKER__', RANGE: '1month', INTERVAL: 'DAILY', CALCULATIONS: 'MEAN,STDDEV' }, note: '進階統計運算（均值/標準差/相關性）· 固定視窗', used: false, noSymbol: true },

    // ---- Core Time Series：已用週線（原本用月線，改用週線是因為月線 1 點/月 → 熱區圖首/末收盤永遠同一筆、報酬算出 0%，等於沒作用）----
    { category: 'timeseries', fn: 'TIME_SERIES_WEEKLY_ADJUSTED', extra: {}, note: '週線（~20 年歷史，~4-5 點/月）· 已用，熱區圖 + 歷史 PE/PBR 反推的價格來源', used: true },
    { category: 'timeseries', fn: 'TIME_SERIES_MONTHLY_ADJUSTED', extra: {}, note: '月線 · 原本用這個，已改用週線（1 點/月太粗，熱區圖算不出東西）', used: false },
    { category: 'timeseries', fn: 'TIME_SERIES_DAILY', extra: {}, note: '日線（未調整）', used: false },
    { category: 'timeseries', fn: 'SYMBOL_SEARCH', extra: { keywords: '__TICKER__' }, note: 'ticker 模糊搜尋 · 可能取代手動猜代號', used: false },
    { category: 'timeseries', fn: 'MARKET_STATUS', extra: {}, note: '全球各市場開盤狀態（不吃 symbol）', used: false, noSymbol: true },

    // ---- Forex / Crypto：本工具目前只靠 FMP 抓 USD/TWD，沒用過 AV 這塊 ----
    { category: 'forex', fn: 'CURRENCY_EXCHANGE_RATE', extra: { from_currency: 'USD', to_currency: 'TWD' }, note: '即時匯率 · USD/TWD 備援', used: false, noSymbol: true },
    { category: 'forex', fn: 'FX_DAILY', extra: { from_symbol: 'USD', to_symbol: 'TWD' }, note: '匯率日線', used: false, noSymbol: true },
    { category: 'forex', fn: 'DIGITAL_CURRENCY_DAILY', extra: { symbol: 'BTC', market: 'USD' }, note: '加密貨幣日線（本工具目前不分析加密貨幣，先探索備用）', used: false, noSymbol: true },

    // ---- Commodities：目前完全沒接 · sector-rotation 報告的景氣循環判讀可能用得到 ----
    { category: 'commodities', fn: 'WTI', extra: { interval: 'monthly' }, note: 'WTI 原油（跟 FRED DCOILWTICO 重疊，比較兩邊資料完整度）', used: false, noSymbol: true },
    { category: 'commodities', fn: 'COPPER', extra: { interval: 'monthly' }, note: '銅價（景氣循環領先指標）', used: false, noSymbol: true },

    // ---- Economic Indicators：跟現有 FRED_SERIES 重疊，探索 FRED 沒有 or FRED 額度用完的備援 ----
    { category: 'econ', fn: 'TREASURY_YIELD', extra: { interval: 'monthly', maturity: '10year' }, note: '10Y 公債殖利率（跟 FRED DGS10 重疊，FRED 額度用完的備援）', used: false, noSymbol: true },
    { category: 'econ', fn: 'CPI', extra: { interval: 'monthly' }, note: 'CPI（跟 FRED CPIAUCSL 重疊）', used: false, noSymbol: true },

    // ---- Technical Indicators：60+ 個同樣的呼叫模式，這裡只探 4 個代表性的 ----
    { category: 'technical', fn: 'RSI', extra: { interval: 'daily', time_period: '14', series_type: 'close' }, note: 'RSI(14) · 技術指標家族代表 1/4', used: false },
    { category: 'technical', fn: 'MACD', extra: { interval: 'daily', series_type: 'close' }, note: 'MACD · 技術指標家族代表 2/4 · 實測回過「This is a premium endpoint」（不是額度用完，是這個 function 本身要付費 plan 才能用，免費 key 就算當日額度沒用完也一樣會失敗）', used: false },
    { category: 'technical', fn: 'BBANDS', extra: { interval: 'daily', time_period: '20', series_type: 'close' }, note: '布林通道 · 技術指標家族代表 3/4', used: false },
    { category: 'technical', fn: 'SMA', extra: { interval: 'daily', time_period: '50', series_type: 'close' }, note: 'SMA(50) · 技術指標家族代表 4/4 · 其餘 56+ 個技術指標同樣是 interval+time_period+series_type 模式，要探索直接照樣加一行', used: false },
];

async function avFetch(ep, ticker) {
    const params = new URLSearchParams({ function: ep.fn, apikey: ALPHAVANTAGE_API_KEY });
    if (!ep.noSymbol) params.set('symbol', ticker);
    for (const [k, v] of Object.entries(ep.extra || {})) {
        params.set(k, v === '__TICKER__' ? ticker : v);
    }
    return safeFetch(`${AV_BASE}?${params.toString()}`);
}

// 已知類別清單 —— av_categories input 只認這 7 個字（不是 AV 的 function 名，像
//   "TIME_SERIES_DAILY" 或 "Earnings History" 這種輸入不會匹配到任何 endpoint，
//   之前一次真的跑到這樣：使用者填了具體 dataset 名稱，categories.includes() 全部沒中，
//   結果是「這次會打 0 次 AV API」但沒有任何警告解釋為什麼——使用者以為在測试, 實際上整段跳過。
//   現在明確驗證：輸入裡有認不得的字就大聲警告，而不是默默跑出 0 次。
const AV_VALID_CATEGORIES = ['fundamentals', 'intelligence', 'timeseries', 'forex', 'commodities', 'econ', 'technical'];

async function dumpAlphaVantage(ticker, categoriesInput) {
    let out = heading(2, '🇺🇸 AlphaVantage');
    out += `\n- ticker: ${inlineCode(ticker)}\n- key: ${ALPHAVANTAGE_API_KEY ? '✅ 有' : '❌ 未設 ALPHAVANTAGE_API_KEY secret'}\n`;

    if (!ALPHAVANTAGE_API_KEY) {
        out += `- categories 這次跑: ${inlineCode(categoriesInput.join(', '))}（可用值：${AV_VALID_CATEGORIES.join(' / ')} / all）\n`;
        out += '\n> ⚠️ 沒有 ALPHAVANTAGE_API_KEY，跳過。到 Settings → Secrets 加。免費申請：alphavantage.co/support/#api-key\n';
        return out;
    }

    // "all"（不分大小寫）= AV_VALID_CATEGORIES 全選 —— 「列出 AlphaVantage 抓到的所有數據」的最簡單填法，
    //   不用一個個打 7 個類別名。全部 30 個 endpoint 超過每日 25 次額度，一定會有幾個 quota 用完的錯誤，
    //   但那些也會清楚列出來（❌ AV 錯誤 · Note/Information），不是靜默漏掉，隔天重跑同一個 input 就會補齊。
    const wantsAll = categoriesInput.some(c => c.toLowerCase() === 'all');
    const categories = wantsAll ? AV_VALID_CATEGORIES : categoriesInput;
    out += `- categories 這次跑: ${inlineCode(wantsAll ? `all（= ${AV_VALID_CATEGORIES.join(', ')}）` : categories.join(', '))}（可用值：${AV_VALID_CATEGORIES.join(' / ')} / all）\n`;

    const unknownCategories = wantsAll ? [] : categories.filter(c => !AV_VALID_CATEGORIES.includes(c));
    if (unknownCategories.length > 0) {
        out += `\n> 🔴 **\`av_categories\` 裡有認不得的值：${unknownCategories.map(c => inlineCode(c)).join('、')}** —— `;
        out += `這是「類別」不是 AlphaVantage 的 function 名（不要填 \`INCOME_STATEMENT\`、\`TIME_SERIES_DAILY\` 這種），只能是：${AV_VALID_CATEGORIES.map(inlineCode).join(' / ')}，或填 \`all\` 全部跑。\n`;
        out += `> 認不得的值會被忽略（不會報錯中斷），下面若顯示「這次會打 0 次」就是因為篩完之後沒有任何 endpoint 符合。\n`;
    }

    const endpoints = AV_ENDPOINTS.filter(ep => categories.includes(ep.category));
    out += `\n> ⚠️ **免費 tier 硬限制 25 次/日 + burst limiter（併發太快會被擋，即使當日額度還夠）**。\n`;
    out += `> 這次會打 **${endpoints.length} 次** AV API，每次間隔 ${AV_MIN_INTERVAL_MS}ms 節流。若當日已經用掉一些額度，這次可能會有幾個回額度用完的錯誤，屬正常現象。\n`;
    if (endpoints.length === 0) {
        out += `> 🔴 **0 個 endpoint 符合、什麼都沒 dump**。請確認 \`av_categories\` 填的是上面列的類別名稱，用逗號分隔，例如 \`intelligence,timeseries\`，或填 \`all\`。\n`;
        return out;
    }
    if (endpoints.length > 25) {
        out += `> 🔴 **這次選的 categories 總共 ${endpoints.length} 個 endpoint，已經超過每日 25 次額度上限**，一定會有一部分回額度用完的錯誤（下面每筆都會清楚標示是哪種失敗，不是漏掉）。⚠️ 這支 dump script 本身不像 app 端有 24hr localStorage 快取（CI 每次都是全新容器），額度用完的那幾個只能等隔天額度重置後重新整批打一次，不會自動只補跑失敗的部分。\n`;
    }

    for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (i > 0) await sleep(AV_MIN_INTERVAL_MS);   // 節流：跟 app 端 avThrottle() 同樣的道理，避免觸發 burst limiter

        out += heading(3, `📦 \`${ep.fn}\`（${ep.category}）${ep.used ? ' ✅ 已用' : ' 🆕 尚未用'}`);
        out += `_${ep.note}_\n\n`;

        const r = await avFetch(ep, ticker);
        if (!r.ok) {
            out += `❌ HTTP ${r.status}: ${truncate(JSON.stringify(r.body), 200)}\n`;
            continue;
        }
        const body = r.body;
        if (body && typeof body === 'object' && (body['Error Message'] || body['Note'] || body['Information'])) {
            const errMsg = body['Error Message'] || body['Note'] || body['Information'];
            const kind = body['Error Message'] ? 'Error Message（參數/ticker 錯）' : body['Note'] ? 'Note（額度限制）' : 'Information（key 或額度問題，含 burst limiter）';
            out += `❌ AV 錯誤（${kind}）: ${truncate(errMsg, 300)}\n`;
            continue;
        }
        if (typeof body === 'string') {
            // CSV 回傳（LISTING_STATUS / EARNINGS_CALENDAR / IPO_CALENDAR 用 CSV 不是 JSON）
            const lines = body.split('\n').filter(l => l.trim());
            out += `✅ CSV 回傳 · ${lines.length} 行（含 header）\n\n`;
            out += code(lines.slice(0, 6).join('\n') + (lines.length > 6 ? '\n...' : ''));
            continue;
        }
        if (!body || typeof body !== 'object') {
            out += `⚠️ 非預期回傳格式: ${truncate(JSON.stringify(body), 200)}\n`;
            continue;
        }
        const topKeys = Object.keys(body);
        out += `✅ top-level keys（共 ${topKeys.length}）: \`${topKeys.join(', ')}\`\n\n`;

        // 時序型（xxx Time Series / Technical Analysis: xxx）：抓第一個 nested object 的 key 當「單筆欄位」樣本
        const seriesKey = topKeys.find(k => /Time Series|Technical Analysis|Weekly|Monthly|Daily/i.test(k) && typeof body[k] === 'object');
        if (seriesKey && body[seriesKey] && typeof body[seriesKey] === 'object') {
            const dates = Object.keys(body[seriesKey]);
            const firstDate = dates[0];
            const sampleRow = body[seriesKey][firstDate];
            out += `**\`${seriesKey}\`**：${dates.length} 個日期 · 單日欄位 keys: \`${sampleRow ? Object.keys(sampleRow).join(', ') : '(空)'}\`\n\n`;
        }
        // 陣列型（NEWS_SENTIMENT.feed / TOP_GAINERS_LOSERS.top_gainers / INSIDER_TRANSACTIONS.data ...）
        const arrKey = topKeys.find(k => Array.isArray(body[k]));
        if (arrKey && body[arrKey].length > 0) {
            out += `**\`${arrKey}\`**：${body[arrKey].length} 筆 · 單筆欄位 keys: \`${Object.keys(body[arrKey][0]).join(', ')}\`\n\n`;
        }

        out += '<details><summary>📄 sample raw JSON（截斷）</summary>\n\n';
        out += code(truncate(JSON.stringify(body, null, 2), 3000));
        out += '\n</details>\n';
    }
    return out;
}

// ---------------- main ----------------
(async () => {
    let report = `# 📊 FinMind + FMP + FRED schema dump\n\n`;
    report += `- 產生時間: ${new Date().toISOString()}\n`;
    report += `- 台股: ${inlineCode(TW_TICKER)} · 美股: ${inlineCode(US_TICKER)} · 期間往回 ${yearsBack} 年\n`;
    report += `\n## 🔑 Key 診斷（trim 前後長度）\n\n`;
    report += `- ${keyDiag('FINMIND_TOKEN', (process.env.FINMIND_TOKEN || '').length, FINMIND_TOKEN)}\n`;
    report += `- ${keyDiag('FMP_API_KEY',   (process.env.FMP_API_KEY   || '').length, FMP_API_KEY)}\n`;
    report += `- ${keyDiag('FRED_API_KEY',  (process.env.FRED_API_KEY  || '').length, FRED_API_KEY)}\n`;
    report += `- ${keyDiag('ALPHAVANTAGE_API_KEY', (process.env.ALPHAVANTAGE_API_KEY || '').length, ALPHAVANTAGE_API_KEY)}\n`;
    report += `\n> ⚠️ **常見坑**：GitHub Actions secret 保留貼上時的前後空白 / 換行，script 已自動 trim。\n> 若上面顯示「有 X 個前後空白已 trim」，代表原本會失敗，現在通過；但 secret 本身建議也重新編輯拿掉空白。\n`;
    report += `\n> **用途**：驗證 \`valuation/simulator.js\` 用的欄位名跟 4 個 API 實際回傳一致。\n> 也順便驗證 4 個 key 到底能不能通、額度剩多少。\n`;

    try { report += await dumpFinMind(); }
    catch (e) { report += `\n## FinMind ERROR\n\n${e.stack}\n`; }
    try { report += await dumpFMP(); }
    catch (e) { report += `\n## FMP ERROR\n\n${e.stack}\n`; }
    try { report += await dumpFRED(); }
    catch (e) { report += `\n## FRED ERROR\n\n${e.stack}\n`; }
    try {
        const avCategories = AV_CATEGORIES.split(',').map(s => s.trim()).filter(Boolean);
        report += await dumpAlphaVantage(US_TICKER, avCategories);
    } catch (e) { report += `\n## AlphaVantage ERROR\n\n${e.stack}\n`; }

    process.stdout.write(report);
})();
