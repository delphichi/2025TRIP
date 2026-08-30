// ════════════════════════════════════════════════════════════════════════
// 股票數據抓取器 · v2.3.1 (2026-08-30)
// ════════════════════════════════════════════════════════════════════════
// v2.3.1 拿掉：六因子基本面（原 BH-BN 7 欄）
//   原因：Yahoo quoteSummary API 從 2023 需要 crumb+cookie · GAS 無法穩定取得
//   → 全部返回 null · 反而在表上顯一大排空欄位誤導判斷
//   → 六因子基本面請看 sector-rotation 前端（CI 用 Python yfinance 穩定產出）
//
// v2.3 沿用：4W/13W/26W 量能變化 + 三期量價象限 (BO-BV → 現 BH-BO · 8 欄)
// v2.1 沿用：Dow Theory 頭頭低/底底高 (BE/BF/BG)
// v2.0 沿用：Bug 1/2/3 修正 · 設計 A/B/C 修正
//
// 欄位總數：47 base + 3 trend + 8 pv = 58 欄
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════
// 主程式（兩輪迴圈版 · v2.3.1）
// ════════════════════════════════════════
function fetchAllStockData() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getActiveSheet();
  const refSheet  = ss.getSheetByName("11類動能");

  const baseDate   = refSheet.getRange("A13").getValue();
  const targetDate = getWorkdayMinus1(baseDate);

  const START_ROW  = 2;
  const SYMBOL_COL = 9;    // I欄
  const OUTPUT_COL = 10;   // J欄開始輸出

  // 43 base + 4 score + 3 trend + 7 multifactor = 57 欄
  const headers = [
    "現價","4w價格","13w價格","26w價格",
    "4w%","13w%","26w%",
    "52週高點","52週低點","50MA","200MA",
    "成交量","10日均量","量比","RSI14","距高點%",
    "52週最高價","50日均線","200日均線","20日平均量",
    "回檔期均量(5日)","前一波上漲成交量",
    "RS指標","近10日振幅","20日均量比率",
    "最近3日回檔幅度","VCP形態","近60日振幅",
    "距高點","50MA向上","200MA向上",
    "10年最高價","距10年高點","創歷史新高",
    "RSI 14日","關卡一","關卡二",
    "短期均線惡化","提早發現上漲",
    "精選","即將要漲","大跌買入","正在上漲",
    "BA短期技術面視角","BB中長期動能視角(數字)",
    "BC短期突破分預期排名","BD中長期動能視角預期排名",
    "BE趨勢狀態(Dow)","BF頭底型態","BG反轉訊號",
    // 【v2.3 · 移原 v2.2 六因子 · Yahoo quoteSummary 需 crumb · GAS 拿不到】
    // 量能變化 + 三期量價象限 + 綜合判定（欄位往前挪 · BH-BO）
    "BH 4W均量","BI 13W均量","BJ 26W均量",
    "BK 4W量變%","BL 13W量變%","BM 26W量變%",
    "BN 三期量價狀態","BO 量價綜合判定"
  ];

  dataSheet.getRange(1, OUTPUT_COL, 1, headers.length)
    .setValues([headers]);

  const lastRow = dataSheet.getLastRow();
  const symbolRange = dataSheet.getRange(START_ROW, SYMBOL_COL, lastRow - 1, 1).getValues();
  const symbols = symbolRange.flat().filter(s => s !== "");

  // SPY 基準
  let spyChange4w = null;
  try {
    const spy = fetchYahooHistory("SPY", targetDate);
    if (spy) spyChange4w = spy.change4w;
  } catch(e) {
    Logger.log("SPY error: " + e.message);
  }

  // ════════════════════════════════════════
  // 第一輪：抓價量 + 基本面 + 算所有指標 · 暫存
  // ════════════════════════════════════════
  const allRows = [];

  for (let i = 0; i < symbols.length; i++) {
    const row    = START_ROW + i;
    const symbol = symbols[i].toString().trim();
    if (!symbol) continue;

    try {
      const d = fetchYahooHistory(symbol, targetDate);

      if (!d) {
        allRows.push({
          row, symbol, error: "NO DATA",
          bb: -9999, bd: -9999,
          trend: { state: '', pattern: '', signal: '' }
        });
        continue;
      }

      const distHigh    = d.high52w ? (d.price - d.high52w) / d.high52w : null;
      const ma50Up      = (d.ma50 !== null && d.ma50prev !== null) ? d.ma50 > d.ma50prev : null;
      const ma200Up     = (d.ma200 !== null && d.ma200prev !== null) ? d.ma200 > d.ma200prev : null;
      const distHigh10y = d.high10y ? (d.price - d.high10y) / d.high10y : null;
      const volRatio20d = d.avgVol20d > 0 ? d.volume / d.avgVol20d : null;
      const rs          = (d.change4w !== null && spyChange4w && spyChange4w !== 0)
                          ? d.change4w / spyChange4w : null;
      const vcp         = calcVCP(d, distHigh);

      const gate1 = calcGate1(distHigh);
      const gate2 = calcGate2(ma200Up);
      const auSig = calcAU(ma50Up, d.rsi14);
      const avSig = calcAV(ma200Up, d.rsi14, volRatio20d);
      const awSig = calcAW(ma50Up, ma200Up, distHigh, volRatio20d, d.rsi14, auSig);
      const axSig = calcAX(ma50Up, ma200Up, distHigh, vcp, d.rsi14);
      const aySig = calcAY(d.change5d, ma50Up, ma200Up, d.rsi14, volRatio20d);
      const azSig = calcAZ(d.change4w, ma50Up, ma200Up, volRatio20d, d.rsi14, auSig);

      const newHighLabel = distHigh10y !== null
        ? (distHigh10y > -0.05
            ? "⭐ 接近10年高點（" + pct(distHigh10y) + "%）"
            : "距10年高點" + pct(distHigh10y) + "%")
        : "";

      const bbScore = calcBB(d.change4w, d.change13w, d.change26w, ma50Up, ma200Up, auSig, gate1);
      const bdScore = calcBD(distHigh, volRatio20d, d.rsi14, ma50Up, ma200Up, vcp, auSig, gate1);

      allRows.push({
        row, symbol, error: null,
        bb: bbScore, bd: bdScore,
        trend: d.trend,
        d: d,           // 【v2.3】pv fields access
        data: [
          d.price, d.price4w, d.price13w, d.price26w,
          d.change4w, d.change13w, d.change26w,
          d.high52w, d.low52w, d.ma50, d.ma200,
          d.volume, d.avgVol10d, volRatio20d, d.rsi14, distHigh,
          d.high52w, d.ma50, d.ma200, d.avgVol20d,
          d.avgVol5d, d.avgVol5dPrev,
          rs, d.vol10d, volRatio20d, d.pullback3d,
          vcp, d.vol60d, distHigh,
          ma50Up, ma200Up,
          d.high10y, distHigh10y, newHighLabel,
          d.rsi14, gate1, gate2,
          auSig, avSig, awSig, axSig, aySig, azSig
        ]
      });

      Utilities.sleep(250);

    } catch(e) {
      Logger.log(`Error ${symbol}: ${e.message}`);
      allRows.push({
        row, symbol, error: e.message,
        bb: -9999, bd: -9999,
        trend: { state: '', pattern: '', signal: '' }
      });
    }
  }

  // ════════════════════════════════════════
  // 第二輪：算排名 · 批次寫入所有欄位（一次 setValues · 大幅省時）
  // ════════════════════════════════════════
  const allBB = allRows.map(r => r.bb);
  const allBD = allRows.map(r => r.bd);

  const outputMatrix = [];
  let firstOutputRow = null;

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (firstOutputRow === null) firstOutputRow = r.row;

    if (r.error) {
      outputMatrix.push(new Array(58).fill(""));
      outputMatrix[outputMatrix.length - 1][0] = r.error;
      continue;
    }

    const bbRnk = allBB.filter(v => v > r.bb && v > -9999).length + 1;
    const bdRnk = allBD.filter(v => v > r.bd && v > -9999).length + 1;

    const baLabel = formatBA(r.bd);
    const bcLabel = formatBC(r.bd, bdRnk);
    const bdLabel = formatBDLabel(r.bb, bbRnk);

    const dd = r.d || {};  // pv 資料存在 d
    outputMatrix.push([
      ...r.data,                                     // J~AZ (43 欄)
      baLabel, r.bb, bcLabel, bdLabel,               // BA-BD (4 欄)
      r.trend.state, r.trend.pattern, r.trend.signal, // BE-BG (3 欄)
      // BH-BO · 量能變化 + 量價象限 (8 欄)
      dd.avgVol4w != null ? Math.round(dd.avgVol4w) : "",
      dd.avgVol13w != null ? Math.round(dd.avgVol13w) : "",
      dd.avgVol26w != null ? Math.round(dd.avgVol26w) : "",
      dd.volChange4w != null ? Math.round(dd.volChange4w * 1000) / 10 : "",
      dd.volChange13w != null ? Math.round(dd.volChange13w * 1000) / 10 : "",
      dd.volChange26w != null ? Math.round(dd.volChange26w * 1000) / 10 : "",
      dd.pvStateAll || "",
      dd.pvVerdict || ""
    ]);
  }

  if (outputMatrix.length && firstOutputRow !== null) {
    dataSheet.getRange(firstOutputRow, OUTPUT_COL, outputMatrix.length, 58)
      .setValues(outputMatrix);
  }

  SpreadsheetApp.getUi().alert(
    "✅ 更新完成！(v2.3.1)\n基準日：" +
    Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy-MM-dd") +
    "\n共處理：" + allRows.length + " 支股票"
  );
}

// ════════════════════════════════════════════════════════════════════════
// [v2.3.1 移除] fetchYahooFundamentals()
//   原因：Yahoo quoteSummary API 從 2023 需要 crumb+cookie · GAS 無法穩定取得
//   → 全部返回 null · 反而在表上顯一大排空欄位誤導判斷
//   → 六因子基本面請看 sector-rotation 前端（CI 用 Python yfinance 穩定產出）
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// Yahoo Finance 歷史數據（同 v2.1）
// ════════════════════════════════════════════════════════════════════════
function fetchYahooHistory(symbol, targetDate) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10y`;
  const opt = {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    muteHttpExceptions: true
  };

  let json = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, opt);
      const code = res.getResponseCode();
      if (code === 200) { json = JSON.parse(res.getContentText()); break; }
      if (code === 429 || code >= 500) { Utilities.sleep(1000 * (attempt + 1)); continue; }
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      Utilities.sleep(1000 * (attempt + 1));
    }
  }
  if (!json || !json.chart?.result?.[0]) return null;

  const result = json.chart.result[0];
  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const adjArr = result.indicators.adjclose?.[0]?.adjclose;
  const closes = (adjArr && adjArr.length === timestamps.length)
    ? adjArr.map(v => (v ?? null))
    : quote.close.map(v => (v ?? null));
  const highs = quote.high.map(v => v ?? null);
  const lows = quote.low.map(v => v ?? null);
  const volumes = quote.volume.map(v => v ?? 0);

  const targetStr = Utilities.formatDate(targetDate, "America/New_York", "yyyy-MM-dd");
  let targetIdx = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const barStr = Utilities.formatDate(new Date(timestamps[i] * 1000), "America/New_York", "yyyy-MM-dd");
    if (barStr <= targetStr) { targetIdx = i; break; }
  }
  if (targetIdx < 0) targetIdx = timestamps.length - 1;

  const rawCloses = closes.slice(0, targetIdx + 1);
  const rawHighs = highs.slice(0, targetIdx + 1);
  const rawLows = lows.slice(0, targetIdx + 1);
  const rawVolumes = volumes.slice(0, targetIdx + 1);

  const sliceCloses = [], sliceHighs = [], sliceLows = [], sliceVolumes = [];
  for (let i = 0; i < rawCloses.length; i++) {
    if (rawCloses[i] !== null && rawHighs[i] !== null && rawLows[i] !== null) {
      sliceCloses.push(rawCloses[i]);
      sliceHighs.push(rawHighs[i]);
      sliceLows.push(rawLows[i]);
      sliceVolumes.push(rawVolumes[i] || 0);
    }
  }

  const n = sliceCloses.length;
  if (n < 10) return null;

  const price = sliceCloses[n-1];
  const price4w = n >= 20 ? sliceCloses[n-20] : null;
  const price13w = n >= 65 ? sliceCloses[n-65] : null;
  const price26w = n >= 130 ? sliceCloses[n-130] : null;

  const change4w = price4w ? (price - price4w) / price4w : null;
  const change13w = price13w ? (price - price13w) / price13w : null;
  const change26w = price26w ? (price - price26w) / price26w : null;
  const change5d = n >= 5 ? (price - sliceCloses[n-5]) / sliceCloses[n-5] : null;

  const yearLows_ = sliceLows.slice(-252);
  const yearHighs_ = sliceHighs.slice(-252);
  const high52w = yearHighs_.length ? Math.max(...yearHighs_) : null;
  const low52w = yearLows_.length ? Math.min(...yearLows_) : null;
  const high10y = sliceHighs.length ? Math.max(...sliceHighs) : null;

  const ma50 = calcMA(sliceCloses, 50);
  const ma200 = calcMA(sliceCloses, 200);
  const ma50prev = calcMA(sliceCloses.slice(0,-1), 50);
  const ma200prev = calcMA(sliceCloses.slice(0,-1), 200);

  const nonZeroVols = sliceVolumes.filter(v => v > 0);
  const volume = sliceVolumes[sliceVolumes.length-1] || 0;
  const avgVol5d = calcAvg(nonZeroVols.slice(-5));
  const avgVol5dPrev = calcAvg(nonZeroVols.slice(-10,-5));
  const avgVol10d = calcAvg(nonZeroVols.slice(-10));
  const avgVol20d = calcAvg(nonZeroVols.slice(-20));

  const rsi14 = calcRSI(sliceCloses, 14);
  const vol10d = calcVolatility(sliceHighs, sliceLows, 10);
  const vol60d = calcVolatility(sliceHighs, sliceLows, 60);

  const pullback3d = n >= 4 ? (sliceCloses[n-1] - sliceCloses[n-4]) / sliceCloses[n-4] : null;

  const trend = detectTrend(sliceHighs, sliceLows, sliceCloses, 5);

  // 【v2.3 新增】量能變化 · 4W/13W/26W 均量 + 跨期量變 + 量價象限
  function _avg(arr) {
    if (!arr || !arr.length) return null;
    let s = 0; for (const v of arr) s += v;
    return s / arr.length;
  }
  const nonZero = sliceVolumes.filter(v => v > 0);
  const nz = nonZero.length;
  const avgVol4w = nz >= 20 ? _avg(nonZero.slice(-20)) : null;
  const avgVol13w = nz >= 65 ? _avg(nonZero.slice(-65)) : null;
  const avgVol26w = nz >= 130 ? _avg(nonZero.slice(-130)) : null;
  const prevAvg20 = nz >= 40 ? _avg(nonZero.slice(-40, -20)) : null;
  const prevAvg65 = nz >= 130 ? _avg(nonZero.slice(-130, -65)) : null;
  const prevAvg130 = nz >= 260 ? _avg(nonZero.slice(-260, -130)) : null;
  const volChange4w = (avgVol4w && prevAvg20) ? (avgVol4w / prevAvg20 - 1) : null;
  const volChange13w = (avgVol13w && prevAvg65) ? (avgVol13w / prevAvg65 - 1) : null;
  const volChange26w = (avgVol26w && prevAvg130) ? (avgVol26w / prevAvg130 - 1) : null;
  const pvS4 = pvState(change4w, volChange4w);
  const pvS13 = pvState(change13w, volChange13w);
  const pvS26 = pvState(change26w, volChange26w);
  const pvVer = pvVerdict(pvS4, pvS13, pvS26);
  const pvStateAll = (pvS4 && pvS13 && pvS26) ? `4W:${pvS4}/13W:${pvS13}/26W:${pvS26}` : "";

  return {
    price, price4w, price13w, price26w,
    change4w, change13w, change26w, change5d,
    high52w, low52w, high10y,
    ma50, ma200, ma50prev, ma200prev,
    volume, avgVol5d, avgVol5dPrev, avgVol10d, avgVol20d,
    rsi14, vol10d, vol60d, pullback3d,
    trend,
    // 【v2.3】
    avgVol4w, avgVol13w, avgVol26w,
    volChange4w, volChange13w, volChange26w,
    pvStateAll, pvVerdict: pvVer,
  };
}

// ════════════════════════════════════════
// 工具函數（同 v2.1）
// ════════════════════════════════════════
function getWorkdayMinus1(date) {
  const taipei = Utilities.formatDate(new Date(date), "Asia/Taipei", "yyyy-MM-dd");
  const parts = taipei.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  Logger.log("基準日：" + taipei + " → 目標日：" +
    Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd"));
  return d;
}
function calcMA(arr, period) {
  if (!arr || arr.length < period) return null;
  return arr.slice(-period).reduce((a,b) => a+b, 0) / period;
}
function calcAvg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a,b) => a+b, 0) / arr.length;
}
function calcRSI(closes, period) {
  if (!closes || closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
function calcVolatility(highs, lows, period) {
  if (!highs || highs.length < period) return null;
  const h = highs.slice(-period);
  const l = lows.slice(-period);
  const maxH = Math.max(...h), minL = Math.min(...l);
  return minL > 0 ? (maxH-minL)/minL : null;
}
function pct(val) {
  if (val === null || val === undefined) return "N/A";
  return (val*100).toFixed(1);
}

// ════════════════════════════════════════════════════════════════════════
// Dow Theory (v2.1 沿用)
// ════════════════════════════════════════════════════════════════════════
function findSwings(highs, lows, n) {
  const swings = [];
  for (let i = n; i < highs.length - n; i++) {
    let isHigh = true, isLow = true;
    for (let k = i - n; k <= i + n; k++) {
      if (k === i) continue;
      if (highs[k] > highs[i]) isHigh = false;
      if (lows[k] < lows[i]) isLow = false;
    }
    if (isHigh) swings.push({ idx: i, price: highs[i], kind: 'H' });
    if (isLow) swings.push({ idx: i, price: lows[i], kind: 'L' });
  }
  const cleaned = [];
  for (const s of swings) {
    const last = cleaned[cleaned.length - 1];
    if (last && last.kind === s.kind) {
      if ((s.kind === 'H' && s.price > last.price) ||
          (s.kind === 'L' && s.price < last.price)) {
        cleaned[cleaned.length - 1] = s;
      }
    } else cleaned.push(s);
  }
  return cleaned;
}
// ════════════════════════════════════════════════════════════════════════
// 【v2.3 新增】量價象限判定（reuse existing sliceVolumes · no extra API call）
// ════════════════════════════════════════════════════════════════════════
function pvState(priceRet, volChange) {
  if (priceRet === null || volChange === null) return null;
  const p = priceRet > 0 ? "P+" : "P-";
  const v = volChange > 0 ? "V+" : "V-";
  return p + v;
}
function pvVerdict(pv4, pv13, pv26) {
  if (!pv4 || !pv13 || !pv26) return "資料不足";
  // 三期一致 · 極端訊號
  if (pv4 === "P+V+" && pv13 === "P+V+" && pv26 === "P+V+") return "⭐⭐⭐ 完美多頭";
  if (pv4 === "P+V-" && pv13 === "P+V-" && pv26 === "P+V-") return "⚠️ 量能衰竭";      // 新增
  if (pv4 === "P-V-" && pv13 === "P-V-" && pv26 === "P-V-") return "🧊 熊市縮量";
  if (pv4 === "P-V+" && pv13 === "P-V+" && pv26 === "P-V+") return "📉 主力出貨";
  // 主升段結束
  if (pv4 === "P-V-" && pv13 === "P-V-" && pv26 === "P+V-") return "⚠️ 主升段結束";   // 新增
  // 頂部背離 / 中期出貨 / 量能背離
  if (pv4 === "P+V-" && pv26 === "P+V+") return "⚠️ 頂部背離";
  if (pv4 === "P-V+" && pv26 === "P+V+") return "⚠️ 中期出貨";
  if (pv4 === "P+V-" && pv26 === "P+V-") return "⚠️ 量能背離";                        // 新增
  // 底部翻多 / 反彈初期
  if (pv4 === "P+V+" && pv13 === "P-V-" && pv26 === "P-V-") return "🌱 底部剛翻多";
  if (pv4 === "P+V+" && pv26 === "P-V-") return "✨ 反彈初期";
  // 一般健康 / 弱勢
  if (pv4 === "P+V+" && pv13 === "P+V+") return "🚀 健康多頭";
  if (pv4 === "P-V-" && pv13 === "P-V-") return "😴 弱勢縮量";
  return "➡️ 中性";
}

function detectTrend(highs, lows, closes, n) {
  if (!highs || highs.length < n * 2 + 5) return { state: '資料不足', pattern: '', signal: '' };
  const swings = findSwings(highs, lows, n);
  const H = swings.filter(s => s.kind === 'H').slice(-3);
  const L = swings.filter(s => s.kind === 'L').slice(-3);
  const lastClose = closes[closes.length - 1];
  if (H.length < 2 || L.length < 2) return { state: '資料不足', pattern: '', signal: '' };
  const h1 = H[H.length - 2].price, h2 = H[H.length - 1].price;
  const l1 = L[L.length - 2].price, l2 = L[L.length - 1].price;
  const hp = h2 > h1 ? '頭頭高' : '頭頭低';
  const lp = l2 > l1 ? '底底高' : '底底低';
  let state;
  if (hp === '頭頭高' && lp === '底底高') state = '📈 多頭確立';
  else if (hp === '頭頭低' && lp === '底底低') state = '📉 空頭確立';
  else if (hp === '頭頭低' && lp === '底底高') state = '🔺 收斂三角(蓄勢)';
  else state = '🔻 擴散喇叭(避)';
  const signals = [];
  if (H.length >= 3 && H[0].price < h1 && h2 < h1) signals.push('⚠️多轉空預警');
  if (L.length >= 3 && L[0].price > l1 && l2 > l1) signals.push('✨空轉多預警');
  if (lastClose < l2) signals.push('❌空頭確認·破前底');
  if (lastClose > h2) signals.push('🚀多頭確認·破前高');
  return { state, pattern: hp + '·' + lp, signal: signals.join(' / ') };
}

// ════════════════════════════════════════════════════════════════════════
// VCP + 訊號 + 積分（同 v2.1）
// ════════════════════════════════════════════════════════════════════════
function calcVCP(d, distHigh) {
  if (!d.vol10d || !d.vol60d) return false;
  const volShrink = d.vol10d < d.vol60d * 0.7;
  const nearHigh = distHigh !== null && distHigh > -0.15;
  const volDryup = d.avgVol5dPrev > 0 ? d.avgVol5d / d.avgVol5dPrev < 0.9 : false;
  return volShrink && nearHigh && volDryup;
}
function calcGate1(distHigh) {
  if (distHigh === null) return "✓";
  if (distHigh < -0.4) return "✗踢掉";
  if (distHigh < -0.25) return "⚠️深度反彈";
  return "✓";
}
function calcGate2(ma200Up) {
  if (ma200Up === true) return "✓";
  if (ma200Up === false) return "⚠️趨勢走弱";
  return "✓";
}
function calcAU(ma50Up, rsi) {
  if (ma50Up === false && rsi !== null && rsi < 50) return "⚠️短期均線轉弱";
  return "✓";
}
function calcAV(ma200Up, rsi, volRatio) {
  if (ma200Up === true && rsi > 45 && volRatio > 1.0) return "👀 趨勢轉換，開始關注";
  if (ma200Up === true && rsi > 40) return "🔍 200MA轉向，持續觀察";
  return "";
}
function calcAW(ma50Up, ma200Up, distHigh, volRatio, rsi, auSig) {
  if (ma50Up && ma200Up && distHigh > -0.25 && volRatio > 0.8 && rsi > 40 && rsi < 75 && auSig === "✓")
    return "⭐⭐ 精選";
  if ((ma50Up || ma200Up) && distHigh > -0.20 && rsi > 40 && rsi < 75)
    return "⭐ 候選";
  return "";
}
function calcAX(ma50Up, ma200Up, distHigh, vcp, rsi) {
  if (ma50Up && ma200Up && distHigh > -0.15 && vcp && rsi > 40 && rsi < 65) return "🚀 即將要漲";
  if ((ma50Up || ma200Up) && distHigh > -0.15 && rsi > 35 && rsi < 65) return "👀 接近突破";
  return "";
}
function calcAY(change5d, ma50Up, ma200Up, rsi, volRatio) {
  if (change5d !== null && change5d < -0.05 && ma50Up && ma200Up && rsi < 40 && volRatio > 1.2)
    return "🎯 大跌買入";
  if (change5d !== null && change5d < -0.03 && (ma50Up || ma200Up) && rsi < 45)
    return "🔍 留意逢低";
  return "";
}
function calcAZ(change4w, ma50Up, ma200Up, volRatio, rsi, auSig) {
  if (change4w > 0.03 && ma50Up && ma200Up && volRatio > 1.5 && rsi > 50 && rsi < 75 && auSig === "✓")
    return "🚀 正在上漲";
  if (change4w > 0.02 && (ma50Up || ma200Up) && volRatio > 1.2 && rsi > 50 && rsi < 80)
    return "📈 上漲中觀察";
  if (change4w > 0.03 && auSig !== "✓") return "❌ 上漲但趨勢走弱，不追";
  return "";
}
function calcBB(c4w, c13w, c26w, ma50Up, ma200Up, auSig, gate1) {
  let s = 0;
  s += (c4w || 0) * 40; s += (c13w || 0) * 30; s += (c26w || 0) * 10;
  s += ma50Up ? 15 : -10; s += ma200Up ? 15 : -10;
  s += auSig === "✓" ? 10 : -15; s += gate1 === "✗踢掉" ? -30 : 0;
  return Math.round(s * 10) / 10;
}
function calcBD(distHigh, volRatio, rsi, ma50Up, ma200Up, vcp, auSig, gate1) {
  let s = 0;
  if (distHigh > -0.05) s += 25;
  else if (distHigh > -0.10) s += 20;
  else if (distHigh > -0.15) s += 15;
  else if (distHigh > -0.20) s += 8;
  else if (distHigh > -0.30) s += 3;
  else s -= 10;
  if (volRatio > 1.2) s += 15;
  else if (volRatio > 0.8) s += 8;
  else if (volRatio > 0.5) s += 3;
  else s -= 5;
  if (rsi > 45 && rsi < 70) s += 10;
  else if (rsi < 35 || rsi > 80) s -= 5;
  s += ma50Up ? 10 : -15;
  s += ma200Up ? 10 : -15;
  s += vcp ? 15 : 0;
  s += auSig === "✓" ? 5 : -10;
  s += gate1 === "✗踢掉" ? -20 : 0;
  return Math.round(s * 10) / 10;
}
function formatBA(bdScore) {
  if (bdScore >= 50) return "🚀 突破候選 (" + bdScore + ")";
  if (bdScore >= 35) return "👀 接近突破 (" + bdScore + ")";
  if (bdScore >= 20) return "○ 觀察 (" + bdScore + ")";
  if (bdScore >= 0) return "△ 等待 (" + bdScore + ")";
  return "❌ 排除 (" + bdScore + ")";
}
function formatBC(bdScore, rnk) {
  if (bdScore >= 50) return "#" + rnk + " 🚀 突破候選 (" + bdScore + ")";
  if (bdScore >= 35) return "#" + rnk + " 👀 接近突破 (" + bdScore + ")";
  if (bdScore >= 20) return "#" + rnk + " ○ 觀察 (" + bdScore + ")";
  if (bdScore >= 0) return "#" + rnk + " △ 等待 (" + bdScore + ")";
  return "#" + rnk + " ❌ 排除 (" + bdScore + ")";
}
function formatBDLabel(bbScore, rnk) {
  if (bbScore >= 30) return "#" + rnk + " ⭐⭐ 優先配置 (" + bbScore + ")";
  if (bbScore >= 20) return "#" + rnk + " ⭐ 標準配置 (" + bbScore + ")";
  if (bbScore >= 10) return "#" + rnk + " ○ 觀察候選 (" + bbScore + ")";
  if (bbScore >= 0) return "#" + rnk + " △ 等待時機 (" + bbScore + ")";
  return "#" + rnk + " ❌ 排除 (" + bbScore + ")";
}

// ════════════════════════════════════════
// 單列更新（v2.3.1 · 無基本面 · 排名標「需全部更新」）
// ════════════════════════════════════════
function fetchSingleRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getActiveSheet();
  const refSheet = ss.getSheetByName("11類動能");
  const row = dataSheet.getActiveCell().getRow();
  const symbol = dataSheet.getRange(row, 9).getValue();

  if (!symbol) { SpreadsheetApp.getUi().alert("請先選擇有股票代號的列"); return; }

  const baseDate = refSheet.getRange("A13").getValue();
  const targetDate = getWorkdayMinus1(baseDate);

  try {
    const spy = fetchYahooHistory("SPY", targetDate);
    const spyChange4w = spy ? spy.change4w : null;
    const d = fetchYahooHistory(symbol.toString().trim(), targetDate);

    if (!d) { SpreadsheetApp.getUi().alert(`${symbol} 無數據`); return; }

    const distHigh = d.high52w ? (d.price - d.high52w) / d.high52w : null;
    const ma50Up = (d.ma50 !== null && d.ma50prev !== null) ? d.ma50 > d.ma50prev : null;
    const ma200Up = (d.ma200 !== null && d.ma200prev !== null) ? d.ma200 > d.ma200prev : null;
    const distHigh10y = d.high10y ? (d.price - d.high10y) / d.high10y : null;
    const volRatio20d = d.avgVol20d > 0 ? d.volume / d.avgVol20d : null;
    const rs = (d.change4w && spyChange4w && spyChange4w !== 0) ? d.change4w / spyChange4w : null;
    const vcp = calcVCP(d, distHigh);
    const gate1 = calcGate1(distHigh);
    const gate2 = calcGate2(ma200Up);
    const auSig = calcAU(ma50Up, d.rsi14);
    const avSig = calcAV(ma200Up, d.rsi14, volRatio20d);
    const awSig = calcAW(ma50Up, ma200Up, distHigh, volRatio20d, d.rsi14, auSig);
    const axSig = calcAX(ma50Up, ma200Up, distHigh, vcp, d.rsi14);
    const aySig = calcAY(d.change5d, ma50Up, ma200Up, d.rsi14, volRatio20d);
    const azSig = calcAZ(d.change4w, ma50Up, ma200Up, volRatio20d, d.rsi14, auSig);
    const bbScore = calcBB(d.change4w, d.change13w, d.change26w, ma50Up, ma200Up, auSig, gate1);
    const bdScore = calcBD(distHigh, volRatio20d, d.rsi14, ma50Up, ma200Up, vcp, auSig, gate1);
    const newHighLabel = distHigh10y !== null
      ? (distHigh10y > -0.05 ? "⭐ 接近10年高點（" + pct(distHigh10y) + "%）" : "距10年高點" + pct(distHigh10y) + "%")
      : "";

    const baLabel = formatBA(bdScore);
    const bbNum = bbScore;
    const bcLabel = "（需全部更新才有排名）" + formatBA(bdScore);
    const bdLabel = "（需全部更新才有排名）";

    dataSheet.getRange(row, 10, 1, 58).setValues([[
      d.price, d.price4w, d.price13w, d.price26w,
      d.change4w, d.change13w, d.change26w,
      d.high52w, d.low52w, d.ma50, d.ma200,
      d.volume, d.avgVol10d, volRatio20d, d.rsi14, distHigh,
      d.high52w, d.ma50, d.ma200, d.avgVol20d,
      d.avgVol5d, d.avgVol5dPrev,
      rs, d.vol10d, volRatio20d, d.pullback3d,
      vcp, d.vol60d, distHigh,
      ma50Up, ma200Up,
      d.high10y, distHigh10y, newHighLabel,
      d.rsi14, gate1, gate2,
      auSig, avSig, awSig, axSig, aySig, azSig,
      baLabel, bbNum, bcLabel, bdLabel,
      d.trend.state, d.trend.pattern, d.trend.signal,
      // BH-BO · 8 欄量價象限（單列也能算 · 不依賴跨表）
      d.avgVol4w != null ? Math.round(d.avgVol4w) : "",
      d.avgVol13w != null ? Math.round(d.avgVol13w) : "",
      d.avgVol26w != null ? Math.round(d.avgVol26w) : "",
      d.volChange4w != null ? Math.round(d.volChange4w * 1000) / 10 : "",
      d.volChange13w != null ? Math.round(d.volChange13w * 1000) / 10 : "",
      d.volChange26w != null ? Math.round(d.volChange26w * 1000) / 10 : "",
      d.pvStateAll || "",
      d.pvVerdict || ""
    ]]);

    SpreadsheetApp.getUi().alert(`✅ ${symbol} 更新完成！(v2.3.1)\n排名需執行「更新全部股票」才會計算。`);

  } catch(e) {
    SpreadsheetApp.getUi().alert(`❌ 錯誤：${e.message}`);
  }
}

// ════════════════════════════════════════
// 選單
// ════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 股票數據 v2.3.1")
    .addItem("🔄 更新全部股票", "fetchAllStockData")
    .addItem("🔄 更新本列股票", "fetchSingleRow")
    .addToUi();
}
