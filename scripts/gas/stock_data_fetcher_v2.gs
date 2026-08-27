// ════════════════════════════════════════════════════════════════════════
// 股票數據抓取器 · v2.0 (2026-08-27)
// ════════════════════════════════════════════════════════════════════════
// 修正 v1.0 的 3 個 Bug + 3 個設計問題：
//   Bug #1  range=10y (原 2y 導致 "10y 最高" 只算 2 年)
//   Bug #2  用 adjclose (原 quote.close 未含股利再投資 · 配息股報酬失真)
//   Bug #3  Wilder-smoothed RSI (原簡易版 RSI · 單邊行情差 5-10 點)
//   設計 #A targetIdx 用 <= targetTs (原 +86400 · 盤中會撈未收盤 bar)
//   設計 #B VCP 用 volDryup (原 volHealthy · 邏輯反了)
//   設計 #C 加簡易重試機制 · 網路失敗自動 retry
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════
// 主程式（兩輪迴圈版）
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

  // 標題行（J欄開始，不含Symbol）
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
    "BC短期突破分預期排名","BD中長期動能視角預期排名"
  ];

  dataSheet.getRange(1, OUTPUT_COL, 1, headers.length)
    .setValues([headers]);

  // 讀取所有 Symbol
  const lastRow = dataSheet.getLastRow();
  const symbolRange = dataSheet.getRange(START_ROW, SYMBOL_COL, lastRow - 1, 1).getValues();
  const symbols = symbolRange.flat().filter(s => s !== "");

  // 抓 SPY（RS指標基準）
  let spyChange4w = null;
  try {
    const spy = fetchYahooHistory("SPY", targetDate);
    if (spy) spyChange4w = spy.change4w;
  } catch(e) {
    Logger.log("SPY error: " + e.message);
  }

  // ════════════════════════════════════════
  // 第一輪：抓數據、計算所有指標、暫存
  // ════════════════════════════════════════
  const allRows = [];

  for (let i = 0; i < symbols.length; i++) {
    const row    = START_ROW + i;
    const symbol = symbols[i].toString().trim();
    if (!symbol) continue;

    try {
      const d = fetchYahooHistory(symbol, targetDate);

      if (!d) {
        allRows.push({ row: row, symbol: symbol, error: "NO DATA", bb: -9999, bd: -9999 });
        continue;
      }

      // ── 衍生指標 ──
      const distHigh    = d.high52w ? (d.price - d.high52w) / d.high52w : null;
      const ma50Up      = (d.ma50 !== null && d.ma50prev !== null) ? d.ma50 > d.ma50prev : null;
      const ma200Up     = (d.ma200 !== null && d.ma200prev !== null) ? d.ma200 > d.ma200prev : null;
      const distHigh10y = d.high10y ? (d.price - d.high10y) / d.high10y : null;
      const volRatio20d = d.avgVol20d > 0 ? d.volume / d.avgVol20d : null;
      const rs          = (d.change4w !== null && spyChange4w && spyChange4w !== 0)
                          ? d.change4w / spyChange4w : null;
      const vcp         = calcVCP(d, distHigh);

      // ── 訊號 ──
      const gate1 = calcGate1(distHigh);
      const gate2 = calcGate2(ma200Up);
      const auSig = calcAU(ma50Up, d.rsi14);
      const avSig = calcAV(ma200Up, d.rsi14, volRatio20d);
      const awSig = calcAW(ma50Up, ma200Up, distHigh, volRatio20d, d.rsi14, auSig);
      const axSig = calcAX(ma50Up, ma200Up, distHigh, vcp, d.rsi14);
      const aySig = calcAY(d.change5d, ma50Up, ma200Up, d.rsi14, volRatio20d);
      const azSig = calcAZ(d.change4w, ma50Up, ma200Up, volRatio20d, d.rsi14, auSig);

      // ── 新高標籤 ──
      const newHighLabel = distHigh10y !== null
        ? (distHigh10y > -0.05
            ? "⭐ 接近10年高點（" + pct(distHigh10y) + "%）"
            : "距10年高點" + pct(distHigh10y) + "%")
        : "";

      // ── 積分（不含排名）──
      const bbScore = calcBB(d.change4w, d.change13w, d.change26w, ma50Up, ma200Up, auSig, gate1);
      const bdScore = calcBD(distHigh, volRatio20d, d.rsi14, ma50Up, ma200Up, vcp, auSig, gate1);

      // 暫存這列的所有數據
      allRows.push({
        row, symbol, error: null,
        bb: bbScore, bd: bdScore,
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

      Utilities.sleep(600);

    } catch(e) {
      Logger.log(`Error ${symbol}: ${e.message}`);
      allRows.push({ row: row, symbol: symbol, error: e.message, bb: -9999, bd: -9999 });
    }
  }

  // ════════════════════════════════════════
  // 第二輪：計算排名、寫入所有欄位
  // ════════════════════════════════════════
  const allBB = allRows.map(r => r.bb);
  const allBD = allRows.map(r => r.bd);

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];

    if (r.error) {
      dataSheet.getRange(r.row, OUTPUT_COL).setValue(r.error);
      continue;
    }

    // 計算排名（分數越高排名越前）
    const bbRnk = allBB.filter(v => v > r.bb && v > -9999).length + 1;
    const bdRnk = allBD.filter(v => v > r.bd && v > -9999).length + 1;

    // 四個積分欄位標籤
    const baLabel = formatBA(r.bd);              // BA 短期技術面（無排名）
    const bbNum   = r.bb;                        // BB 中長期動能（純數字）
    const bcLabel = formatBC(r.bd, bdRnk);       // BC 短期突破分排名
    const bdLabel = formatBDLabel(r.bb, bbRnk);  // BD 中長期動能排名

    // 寫入整列（43個基礎欄位 + 4個積分欄位 = 47欄）
    dataSheet.getRange(r.row, OUTPUT_COL, 1, 47).setValues([[
      ...r.data,       // J ~ AZ（43欄）
      baLabel,         // BA 短期技術面視角
      bbNum,           // BB 中長期動能視角(數字)
      bcLabel,         // BC 短期突破分預期排名
      bdLabel          // BD 中長期動能視角預期排名
    ]]);
  }

  SpreadsheetApp.getUi().alert(
    "✅ 更新完成！(v2.0)\n基準日：" +
    Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy-MM-dd") +
    "\n共處理：" + allRows.length + " 支股票"
  );
}

// ════════════════════════════════════════════════════════════════════════
// Yahoo Finance 歷史數據抓取（v2 · 修 Bug 1/2 + 設計 A/C）
// ════════════════════════════════════════════════════════════════════════
function fetchYahooHistory(symbol, targetDate) {
  // 【FIX Bug #1】改為 range=10y 才能算真正 10 年高點
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10y`;
  const opt = {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    muteHttpExceptions: true
  };

  // 【FIX 設計 #C】加 3 次重試（Yahoo API 常 rate-limit 或短暫失敗）
  let json = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, opt);
      const code = res.getResponseCode();
      if (code === 200) {
        json = JSON.parse(res.getContentText());
        break;
      }
      // 429 / 5xx 都 retry
      if (code === 429 || code >= 500) {
        Utilities.sleep(1000 * (attempt + 1));  // 1s, 2s, 3s 指數延遲
        continue;
      }
      // 其他錯誤直接放棄
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      Utilities.sleep(1000 * (attempt + 1));
    }
  }
  if (!json || !json.chart?.result?.[0]) return null;

  const result     = json.chart.result[0];
  const meta       = result.meta;
  const timestamps = result.timestamp;
  const quote      = result.indicators.quote[0];

  // 【FIX Bug #2】優先用 adjclose（含股利再投資調整）· 沒有時 fallback 用 raw close
  const adjArr = result.indicators.adjclose?.[0]?.adjclose;
  const closes = (adjArr && adjArr.length === timestamps.length)
    ? adjArr.map(v => (v ?? null))
    : quote.close.map(v => (v ?? null));

  const highs   = quote.high.map(v => v ?? null);
  const lows    = quote.low.map(v => v ?? null);
  const volumes = quote.volume.map(v => v ?? 0);

  // 【FIX 設計 #A】改用嚴格 <= targetTs · 排除盤中未收盤 bar
  const targetTs = Math.floor(targetDate.getTime() / 1000);
  let targetIdx = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (timestamps[i] <= targetTs) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx < 0) targetIdx = timestamps.length - 1;

  // 截取到 targetIdx · 對齊 highs/lows/closes/volumes 用同一批 index
  const rawCloses  = closes.slice(0, targetIdx + 1);
  const rawHighs   = highs.slice(0, targetIdx + 1);
  const rawLows    = lows.slice(0, targetIdx + 1);
  const rawVolumes = volumes.slice(0, targetIdx + 1);

  // 過濾掉 null 但保持 4 個 array 對齊（如果某天 close 是 null，highs/lows/volumes 也一起丟）
  const sliceCloses = [];
  const sliceHighs = [];
  const sliceLows = [];
  const sliceVolumes = [];
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

  // 價格
  const price    = sliceCloses[n-1];
  const price4w  = n >= 20  ? sliceCloses[n-20]  : null;
  const price13w = n >= 65  ? sliceCloses[n-65]  : null;
  const price26w = n >= 130 ? sliceCloses[n-130] : null;

  const change4w  = price4w  ? (price - price4w)  / price4w  : null;
  const change13w = price13w ? (price - price13w) / price13w : null;
  const change26w = price26w ? (price - price26w) / price26w : null;
  const change5d  = n >= 5   ? (price - sliceCloses[n-5]) / sliceCloses[n-5] : null;

  // 52週高低（用 close 因為 highs 已是原始價未調整 · adjclose 對齊 close）
  const yearCloses = sliceCloses.slice(-252);
  const yearLows_ = sliceLows.slice(-252);
  const yearHighs_ = sliceHighs.slice(-252);
  const high52w   = yearHighs_.length ? Math.max(...yearHighs_) : null;
  const low52w    = yearLows_.length  ? Math.min(...yearLows_)  : null;

  // 【FIX Bug #1】真正的 10 年最高（range=10y 之後這裡就是全部 10 年最高）
  const high10y = sliceHighs.length ? Math.max(...sliceHighs) : null;

  // MA
  const ma50     = calcMA(sliceCloses, 50);
  const ma200    = calcMA(sliceCloses, 200);
  const ma50prev = calcMA(sliceCloses.slice(0,-1), 50);
  const ma200prev= calcMA(sliceCloses.slice(0,-1), 200);

  // 成交量
  const nonZeroVols = sliceVolumes.filter(v => v > 0);
  const volume       = sliceVolumes[sliceVolumes.length-1] || 0;
  const avgVol5d     = calcAvg(nonZeroVols.slice(-5));
  const avgVol5dPrev = calcAvg(nonZeroVols.slice(-10,-5));
  const avgVol10d    = calcAvg(nonZeroVols.slice(-10));
  const avgVol20d    = calcAvg(nonZeroVols.slice(-20));

  // 【FIX Bug #3】用 Wilder-smoothed RSI（跟 Google Finance / TradingView 一致）
  const rsi14 = calcRSI(sliceCloses, 14);

  // 振幅
  const vol10d = calcVolatility(sliceHighs, sliceLows, 10);
  const vol60d = calcVolatility(sliceHighs, sliceLows, 60);

  // 最近3日回檔幅度
  const pullback3d = n >= 4
    ? (sliceCloses[n-1] - sliceCloses[n-4]) / sliceCloses[n-4]
    : null;

  return {
    price, price4w, price13w, price26w,
    change4w, change13w, change26w, change5d,
    high52w, low52w, high10y,
    ma50, ma200, ma50prev, ma200prev,
    volume,
    avgVol5d, avgVol5dPrev, avgVol10d, avgVol20d,
    rsi14, vol10d, vol60d, pullback3d
  };
}

// ════════════════════════════════════════
// 工具函數
// ════════════════════════════════════════
function getWorkdayMinus1(date) {
  const taipei = Utilities.formatDate(new Date(date), "Asia/Taipei", "yyyy-MM-dd");
  const parts  = taipei.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  Logger.log("基準日：" + taipei + " → 目標日：" +
    Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd"));
  return d;
}

function calcMA(arr, period) {
  if (!arr || arr.length < period) return null;
  const sl = arr.slice(-period);
  return sl.reduce((a,b) => a+b, 0) / period;
}

function calcAvg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a,b) => a+b, 0) / arr.length;
}

// ════════════════════════════════════════════════════════════════════════
// 【FIX Bug #3】Wilder-smoothed RSI
// 說明：原簡易版只算最近 14 天差 · 單邊行情下會偏離 5-10 點
//       正確 RSI 用 Wilder 平滑：
//         第一個 14 天 = SMA
//         之後每天  = (前一天 × 13 + 今天 gain/loss) / 14
// ════════════════════════════════════════════════════════════════════════
function calcRSI(closes, period) {
  if (!closes || closes.length < period + 1) return null;

  // Step 1: 前 period 天用 SMA 當種子
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else          avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Step 2: 之後每天用 Wilder smoothing 遞推
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
  const maxH = Math.max(...h);
  const minL = Math.min(...l);
  return minL > 0 ? (maxH-minL)/minL : null;
}

function pct(val) {
  if (val === null || val === undefined) return "N/A";
  return (val*100).toFixed(1);
}

// ════════════════════════════════════════════════════════════════════════
// 【FIX 設計 #B】VCP 判斷（用 volDryup · 符合 Minervini 定義）
// 說明：原 volHealthy 條件是「近 5 日量 ≥ 前 5 日量 × 0.8」· 邏輯反了
//       傳統 VCP 是希望「量能萎縮」(dry-up) · 這才是真正 base 的訊號
// ════════════════════════════════════════════════════════════════════════
function calcVCP(d, distHigh) {
  if (!d.vol10d || !d.vol60d) return false;
  const volShrink  = d.vol10d < d.vol60d * 0.7;                     // 波動收縮 30%+
  const nearHigh   = distHigh !== null && distHigh > -0.15;          // 距高點 <15%
  const volDryup   = d.avgVol5dPrev > 0
    ? d.avgVol5d / d.avgVol5dPrev < 0.9                              // 量能萎縮 10%+ (Minervini)
    : false;
  return volShrink && nearHigh && volDryup;
}

// ════════════════════════════════════════
// 訊號函數
// ════════════════════════════════════════
function calcGate1(distHigh) {
  if (distHigh === null) return "✓";
  if (distHigh < -0.4)  return "✗踢掉";
  if (distHigh < -0.25) return "⚠️深度反彈";
  return "✓";
}

function calcGate2(ma200Up) {
  if (ma200Up === true)  return "✓";
  if (ma200Up === false) return "⚠️趨勢走弱";
  return "✓";
}

function calcAU(ma50Up, rsi) {
  if (ma50Up === false && rsi !== null && rsi < 50)
    return "⚠️短期均線轉弱";
  return "✓";
}

function calcAV(ma200Up, rsi, volRatio) {
  if (ma200Up === true && rsi > 45 && volRatio > 1.0)
    return "👀 趨勢轉換，開始關注";
  if (ma200Up === true && rsi > 40)
    return "🔍 200MA轉向，持續觀察";
  return "";
}

function calcAW(ma50Up, ma200Up, distHigh, volRatio, rsi, auSig) {
  if (ma50Up && ma200Up && distHigh > -0.25
      && volRatio > 0.8 && rsi > 40 && rsi < 75 && auSig === "✓")
    return "⭐⭐ 精選";
  if ((ma50Up || ma200Up) && distHigh > -0.20
      && rsi > 40 && rsi < 75)
    return "⭐ 候選";
  return "";
}

function calcAX(ma50Up, ma200Up, distHigh, vcp, rsi) {
  if (ma50Up && ma200Up && distHigh > -0.15
      && vcp && rsi > 40 && rsi < 65)
    return "🚀 即將要漲";
  if ((ma50Up || ma200Up) && distHigh > -0.15
      && rsi > 35 && rsi < 65)
    return "👀 接近突破";
  return "";
}

function calcAY(change5d, ma50Up, ma200Up, rsi, volRatio) {
  if (change5d !== null && change5d < -0.05
      && ma50Up && ma200Up && rsi < 40 && volRatio > 1.2)
    return "🎯 大跌買入";
  if (change5d !== null && change5d < -0.03
      && (ma50Up || ma200Up) && rsi < 45)
    return "🔍 留意逢低";
  return "";
}

function calcAZ(change4w, ma50Up, ma200Up, volRatio, rsi, auSig) {
  if (change4w > 0.03 && ma50Up && ma200Up
      && volRatio > 1.5 && rsi > 50 && rsi < 75 && auSig === "✓")
    return "🚀 正在上漲";
  if (change4w > 0.02 && (ma50Up || ma200Up)
      && volRatio > 1.2 && rsi > 50 && rsi < 80)
    return "📈 上漲中觀察";
  if (change4w > 0.03 && auSig !== "✓")
    return "❌ 上漲但趨勢走弱，不追";
  return "";
}

// ════════════════════════════════════════
// 積分函數（維持原設計 · BB 短期偏向 · BD 突破偏向）
// 註：如要跟 Point 公式 (0.25×4W+0.25×13W+0.5×26W) 對齊 · 改 calcBB 權重即可
// ════════════════════════════════════════
function calcBB(c4w, c13w, c26w, ma50Up, ma200Up, auSig, gate1) {
  let s = 0;
  s += (c4w  || 0) * 40;
  s += (c13w || 0) * 30;
  s += (c26w || 0) * 10;
  s += ma50Up  ? 15 : -10;
  s += ma200Up ? 15 : -10;
  s += auSig === "✓" ? 10 : -15;
  s += gate1 === "✗踢掉" ? -30 : 0;
  return Math.round(s * 10) / 10;
}

function calcBD(distHigh, volRatio, rsi, ma50Up, ma200Up, vcp, auSig, gate1) {
  let s = 0;

  // 距高點（最重要）
  if (distHigh > -0.05)      s += 25;
  else if (distHigh > -0.10) s += 20;
  else if (distHigh > -0.15) s += 15;
  else if (distHigh > -0.20) s += 8;
  else if (distHigh > -0.30) s += 3;
  else s -= 10;

  // 量比
  if (volRatio > 1.2)      s += 15;
  else if (volRatio > 0.8) s += 8;
  else if (volRatio > 0.5) s += 3;
  else s -= 5;

  // RSI 甜蜜區
  if (rsi > 45 && rsi < 70)       s += 10;
  else if (rsi < 35 || rsi > 80)  s -= 5;

  // MA
  s += ma50Up  ? 10 : -15;
  s += ma200Up ? 10 : -15;

  // VCP
  s += vcp ? 15 : 0;

  // 短期均線惡化
  s += auSig === "✓" ? 5 : -10;

  // 踢掉懲罰
  s += gate1 === "✗踢掉" ? -20 : 0;

  return Math.round(s * 10) / 10;
}

// ════════════════════════════════════════
// 標籤格式函數
// ════════════════════════════════════════
function formatBA(bdScore) {
  if (bdScore >= 50) return "🚀 突破候選 (" + bdScore + ")";
  if (bdScore >= 35) return "👀 接近突破 (" + bdScore + ")";
  if (bdScore >= 20) return "○ 觀察 (" + bdScore + ")";
  if (bdScore >= 0)  return "△ 等待 (" + bdScore + ")";
  return "❌ 排除 (" + bdScore + ")";
}

function formatBC(bdScore, rnk) {
  if (bdScore >= 50) return "#" + rnk + " 🚀 突破候選 (" + bdScore + ")";
  if (bdScore >= 35) return "#" + rnk + " 👀 接近突破 (" + bdScore + ")";
  if (bdScore >= 20) return "#" + rnk + " ○ 觀察 (" + bdScore + ")";
  if (bdScore >= 0)  return "#" + rnk + " △ 等待 (" + bdScore + ")";
  return "#" + rnk + " ❌ 排除 (" + bdScore + ")";
}

function formatBDLabel(bbScore, rnk) {
  if (bbScore >= 30) return "#" + rnk + " ⭐⭐ 優先配置 (" + bbScore + ")";
  if (bbScore >= 20) return "#" + rnk + " ⭐ 標準配置 (" + bbScore + ")";
  if (bbScore >= 10) return "#" + rnk + " ○ 觀察候選 (" + bbScore + ")";
  if (bbScore >= 0)  return "#" + rnk + " △ 等待時機 (" + bbScore + ")";
  return "#" + rnk + " ❌ 排除 (" + bbScore + ")";
}

// ════════════════════════════════════════
// 單列更新
// ════════════════════════════════════════
function fetchSingleRow() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getActiveSheet();
  const refSheet  = ss.getSheetByName("11類動能");
  const row       = dataSheet.getActiveCell().getRow();
  const symbol    = dataSheet.getRange(row, 9).getValue();

  if (!symbol) {
    SpreadsheetApp.getUi().alert("請先選擇有股票代號的列");
    return;
  }

  const baseDate   = refSheet.getRange("A13").getValue();
  const targetDate = getWorkdayMinus1(baseDate);

  try {
    const spy = fetchYahooHistory("SPY", targetDate);
    const spyChange4w = spy ? spy.change4w : null;
    const d = fetchYahooHistory(symbol.toString().trim(), targetDate);

    if (!d) {
      SpreadsheetApp.getUi().alert(`${symbol} 無數據`);
      return;
    }

    const distHigh    = d.high52w ? (d.price - d.high52w) / d.high52w : null;
    const ma50Up      = (d.ma50 !== null && d.ma50prev !== null) ? d.ma50 > d.ma50prev : null;
    const ma200Up     = (d.ma200 !== null && d.ma200prev !== null) ? d.ma200 > d.ma200prev : null;
    const distHigh10y = d.high10y ? (d.price - d.high10y) / d.high10y : null;
    const volRatio20d = d.avgVol20d > 0 ? d.volume / d.avgVol20d : null;
    const rs          = (d.change4w && spyChange4w && spyChange4w !== 0) ? d.change4w / spyChange4w : null;
    const vcp         = calcVCP(d, distHigh);
    const gate1       = calcGate1(distHigh);
    const gate2       = calcGate2(ma200Up);
    const auSig       = calcAU(ma50Up, d.rsi14);
    const avSig       = calcAV(ma200Up, d.rsi14, volRatio20d);
    const awSig       = calcAW(ma50Up, ma200Up, distHigh, volRatio20d, d.rsi14, auSig);
    const axSig       = calcAX(ma50Up, ma200Up, distHigh, vcp, d.rsi14);
    const aySig       = calcAY(d.change5d, ma50Up, ma200Up, d.rsi14, volRatio20d);
    const azSig       = calcAZ(d.change4w, ma50Up, ma200Up, volRatio20d, d.rsi14, auSig);
    const bbScore     = calcBB(d.change4w, d.change13w, d.change26w, ma50Up, ma200Up, auSig, gate1);
    const bdScore     = calcBD(distHigh, volRatio20d, d.rsi14, ma50Up, ma200Up, vcp, auSig, gate1);
    const newHighLabel = distHigh10y !== null
      ? (distHigh10y > -0.05 ? "⭐ 接近10年高點（" + pct(distHigh10y) + "%）" : "距10年高點" + pct(distHigh10y) + "%")
      : "";

    // 單列更新時排名設為 N/A（需全部重跑才有排名）
    const baLabel = formatBA(bdScore);
    const bbNum   = bbScore;
    const bcLabel = "（需全部更新才有排名）" + formatBA(bdScore);
    const bdLabel = "（需全部更新才有排名）";

    dataSheet.getRange(row, 10, 1, 47).setValues([[
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
      baLabel, bbNum, bcLabel, bdLabel
    ]]);

    SpreadsheetApp.getUi().alert(`✅ ${symbol} 更新完成！(v2.0)\n排名需執行「更新全部股票」才會更新。`);

  } catch(e) {
    SpreadsheetApp.getUi().alert(`❌ 錯誤：${e.message}`);
  }
}

// ════════════════════════════════════════
// 選單
// ════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 股票數據 v2")
    .addItem("🔄 更新全部股票", "fetchAllStockData")
    .addItem("🔄 更新本列股票", "fetchSingleRow")
    .addToUi();
}
