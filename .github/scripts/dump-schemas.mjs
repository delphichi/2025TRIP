#!/usr/bin/env node
// FinMind + FMP + FRED schema dump —— 印出每個 dataset / endpoint / series 實際回傳的欄位名。
// 讀 env：FINMIND_TOKEN、FMP_API_KEY、FRED_API_KEY、TW_TICKER、US_TICKER、YEARS
// 輸出：markdown 到 stdout。

const {
    FINMIND_TOKEN = '',
    FMP_API_KEY = '',
    FRED_API_KEY = '',
    TW_TICKER = '2330',
    US_TICKER = 'AAPL',
    YEARS = '2',
} = process.env;

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

// ---------------- main ----------------
(async () => {
    let report = `# 📊 FinMind + FMP + FRED schema dump\n\n`;
    report += `- 產生時間: ${new Date().toISOString()}\n`;
    report += `- 台股: ${inlineCode(TW_TICKER)} · 美股: ${inlineCode(US_TICKER)} · 期間往回 ${yearsBack} 年\n`;
    report += `\n> **用途**：驗證 \`valuation/simulator.js\` 用的欄位名跟 3 個 API 實際回傳一致。\n> 也順便驗證 3 個 key 到底能不能通、額度剩多少。\n`;

    try { report += await dumpFinMind(); }
    catch (e) { report += `\n## FinMind ERROR\n\n${e.stack}\n`; }
    try { report += await dumpFMP(); }
    catch (e) { report += `\n## FMP ERROR\n\n${e.stack}\n`; }
    try { report += await dumpFRED(); }
    catch (e) { report += `\n## FRED ERROR\n\n${e.stack}\n`; }

    process.stdout.write(report);
})();
