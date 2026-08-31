// ════════════════════════════════════════════════════════════════════════
// 股票數據抓取器 · v2.6.3 (2026-08-31)
// ════════════════════════════════════════════════════════════════════════
// v2.6.3 新增：SPY 環境資料透明化（BX-CA · 4 欄）
//   BX SPY 現價（回測日 close）
//   BY SPY 60d 前價（12 交易週前 · 供參考）
//   BZ SPY 50MA（含 ↑/↓ 斜率標示）
//   CA SPY 200MA（含 ↑/↓ 斜率標示）
//   目的：讓使用者一眼看到 BW 判定所依據的原始數據 · 全部用回測日數據
//
// v2.6.2 修正：BW 大盤環境改用 MA 斜率（更精準 · 修正 2023-01-29 誤判 🟢 問題）
//   舊規則：SPY > 60d 前價 AND 50MA > 200MA
//   舊問題：熊底短彈就通過 + MA 剛交叉即算 · 2023-01-29/02-25 都誤判 🟢
//   新規則：SPY 50MA 向上 AND 200MA 向上（MA 斜率需持續趨勢）
//   新結果：2023-01-29 (200MA 還在跌) → 🟡 中性 · 觸發 🌱 熊底反彈 flag
//
// v2.6.1 新增：🌱 熊底反彈候選 (BP 第 5 分類)
//   規則（非 🟢 多頭市場才觸發）：
//     distHigh: -30% ~ -10% (深回檔但不災難)
//     c26 > -20% (不是自由落體)
//     c4 > -8% (短期止穩)
//     bb > 10 (有品質基礎)
//     RSI 35-55 (復甦中 · 不過賣不過買)
//     pv 非弱勢 (不含熊市/主力出貨/量能衰竭/背離/中期出貨/主升段結束/弱勢縮量)
//
//   基於 2023-02-25 樣本 XLK/XLC/XLY 驗證：都符合這 6 條 · 26W 分別 +29.6/+27.8/+19.3
//   目的：補 v2.6a 空頭 gate 太嚴 · 錯過熊底反彈 sector 的問題
//
// v2.6 新增：大盤環境過濾器 (Market Regime Filter · BW 1 欄)
//   規則 · 用 SPY（等同 VOO · 追蹤同指數）做判斷：
//     🟢 多頭 · SPY > 60 交易日前價 AND SPY 50MA > 200MA
//     🟡 中性 · 只符合一個條件
//     🔴 空頭 · 兩個都 false
//
//   對 BP 暴漲判定的影響：
//     🟢 多頭 → BP 正常運作
//     🟡 中性 → BP 正常運作（保守觀察）
//     🔴 空頭 → 🎯 潛在暴漲 / 🚀 暴漲中 完全停用 · 只保 🔥 追高警訊
//
//   動機：7 批歷史回測顯示 · BP 在熊起始/熊底反彈期 alpha 為負
//         強制在空頭區停用 setup-based flag · 保守應對
//
// v2.5 新增：Forward 回測欄位（BQ-BV · 6 欄）
//   BQ 4W後股價 · BR 4W後投報率(%)
//   BS 13W後股價 · BT 13W後投報率(%)
//   BU 26W後股價 · BV 26W後投報率(%)
//   用途：把 A13 基準日設過去日期 · 就能看那時的暴漲判定「事後」多少報酬
//   規則：baseDate = today → 未來未發生 → 6 欄全空
//         baseDate = 6 個月前 → BQ/BR/BS/BT/BU/BV 全有值 · 可驗證 BP 準確度
//         baseDate = 2 個月前 → 只有 BQ/BR 有值 · BS-BV 空
//
// v2.4.1 修正：🎯 潛在暴漲 Dow 守門補「擴散」·  對齊 Python
//   問題：OKE (Dow=🔻 擴散喇叭) 被誤判 🎯 潛在暴漲
//   修法：explosiveVerdict 內 notShortDow → dowNotBadForSetup
//         同時擋「空頭」和「擴散」· 與 🚀 暴漲中的 dowNotBad 一致
//
// v2.4 新增：BP 暴漲判定（4 分類）
//   🚀 暴漲中     · 動能明確啟動 + Dow 多頭/收斂 + pv 完美/健康 + 量能配合
//   🎯 潛在暴漲   · setup 完成但還未拉升（VCP or 底部翻多 + 位置在 pivot 區）
//   🔥 追高風險   · 已飆漲太高（4W>40% or 26W>100% or RSI>80+）
//   (空)          · 中性 · 頂部背離 · 量能衰竭等訊號會被明確排除
//
// v2.3.1 沿用：拿掉六因子（Yahoo quoteSummary 需 crumb · GAS 拿不到）
// v2.3 沿用：4W/13W/26W 量能變化 + 三期量價象限 (BH-BO · 8 欄)
// v2.1 沿用：Dow Theory 頭頭低/底底高 (BE/BF/BG)
// v2.0 沿用：Bug 1/2/3 修正 · 設計 A/B/C 修正
//
// 欄位總數：43 base + 4 score + 3 trend + 8 pv + 1 verdict + 6 fwd + 1 regime + 4 spy = 70 欄
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
    "BN 三期量價狀態","BO 量價綜合判定",
    // 【v2.4 新增】BP 暴漲判定
    "BP 暴漲判定",
    // 【v2.5 新增】Forward 回測欄位（baseDate 設過去日期才有值 · 用來驗證 BP 判定準確度）
    "BQ 4W後股價","BR 4W後投報率",
    "BS 13W後股價","BT 13W後投報率",
    "BU 26W後股價","BV 26W後投報率",
    // 【v2.6 新增】大盤環境過濾器（每列同值 · 一目瞭然當前市場狀態）
    "BW 大盤環境",
    // 【v2.6.3 新增】SPY 環境資料透明化（回測日數據）
    "BX SPY 現價","BY SPY 60d前價",
    "BZ SPY 50MA","CA SPY 200MA"
  ];

  dataSheet.getRange(1, OUTPUT_COL, 1, headers.length)
    .setValues([headers]);

  const lastRow = dataSheet.getLastRow();
  const symbolRange = dataSheet.getRange(START_ROW, SYMBOL_COL, lastRow - 1, 1).getValues();
  const symbols = symbolRange.flat().filter(s => s !== "");

  // SPY 基準
  let spyChange4w = null;
  let marketRegime = "❓ 未知";  // v2.6 · 大盤環境
  // v2.6.3 · SPY 環境資料透明化欄位（每列同值）
  let spyPriceStr = "";
  let spyPrice60dStr = "";
  let spyMa50Str = "";
  let spyMa200Str = "";
  try {
    const spy = fetchYahooHistory("SPY", targetDate);
    if (spy) {
      spyChange4w = spy.change4w;
      marketRegime = calcMarketRegime(spy);  // v2.6
      Logger.log("大盤環境：" + marketRegime);
      // v2.6.3 · 準備 4 個透明化欄位
      spyPriceStr = spy.price != null ? Math.round(spy.price * 100) / 100 : "";
      spyPrice60dStr = spy.price60d != null ? Math.round(spy.price60d * 100) / 100 : "";
      if (spy.ma50 != null) {
        const arrow = (spy.ma50prev != null && spy.ma50 > spy.ma50prev) ? " ↑"
                    : (spy.ma50prev != null && spy.ma50 < spy.ma50prev) ? " ↓" : "";
        spyMa50Str = (Math.round(spy.ma50 * 100) / 100) + arrow;
      }
      if (spy.ma200 != null) {
        const arrow = (spy.ma200prev != null && spy.ma200 > spy.ma200prev) ? " ↑"
                    : (spy.ma200prev != null && spy.ma200 < spy.ma200prev) ? " ↓" : "";
        spyMa200Str = (Math.round(spy.ma200 * 100) / 100) + arrow;
      }
    }
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
        vcp: vcp,           // 【v2.4 for explosive verdict】
        distHigh: distHigh, // 【v2.4 for explosive verdict】
        d: d,               // 【v2.3】pv fields access
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
      outputMatrix.push(new Array(70).fill(""));
      outputMatrix[outputMatrix.length - 1][0] = r.error;
      continue;
    }

    const bbRnk = allBB.filter(v => v > r.bb && v > -9999).length + 1;
    const bdRnk = allBD.filter(v => v > r.bd && v > -9999).length + 1;

    const baLabel = formatBA(r.bd);
    const bcLabel = formatBC(r.bd, bdRnk);
    const bdLabel = formatBDLabel(r.bb, bbRnk);

    const dd = r.d || {};  // pv 資料存在 d
    // 【v2.4 新增】暴漲判定 · 綜合所有訊號
    // v2.6 · 加大盤環境過濾（空頭時停用 setup-based flag）
    const explosive = explosiveVerdict(
      dd.change4w, dd.change13w, dd.change26w, dd.rsi14, r.distHigh,
      r.trend.state, r.trend.signal, dd.pvVerdict, r.vcp,
      r.bb, marketRegime
    );

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
      dd.pvVerdict || "",
      // BP · 暴漲判定
      explosive,
      // 【v2.5】BQ-BV · Forward 回測欄位（基準日設過去才有值）
      dd.priceFwd4w != null ? Math.round(dd.priceFwd4w * 100) / 100 : "",
      dd.retFwd4w != null ? Math.round(dd.retFwd4w * 1000) / 10 : "",
      dd.priceFwd13w != null ? Math.round(dd.priceFwd13w * 100) / 100 : "",
      dd.retFwd13w != null ? Math.round(dd.retFwd13w * 1000) / 10 : "",
      dd.priceFwd26w != null ? Math.round(dd.priceFwd26w * 100) / 100 : "",
      dd.retFwd26w != null ? Math.round(dd.retFwd26w * 1000) / 10 : "",
      // 【v2.6】BW · 大盤環境（每列同值 · 一目瞭然）
      marketRegime,
      // 【v2.6.3】BX-CA · SPY 環境透明化資料（每列同值）
      spyPriceStr, spyPrice60dStr, spyMa50Str, spyMa200Str
    ]);
  }

  if (outputMatrix.length && firstOutputRow !== null) {
    dataSheet.getRange(firstOutputRow, OUTPUT_COL, outputMatrix.length, 70)
      .setValues(outputMatrix);
  }

  SpreadsheetApp.getUi().alert(
    "✅ 更新完成！(v2.6.3)\n基準日：" +
    Utilities.formatDate(targetDate, "Asia/Taipei", "yyyy-MM-dd") +
    "\n大盤環境：" + marketRegime +
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
  // v2.6 · 60 交易日前價（用於 SPY 大盤環境過濾器 · ~= 12 個交易週）
  const price60d = n >= 60 ? sliceCloses[n-60] : null;

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

  // ══════════════════════════════════════════════════════════════════
  // 【v2.5 新增】Forward returns · 從 targetIdx 往前 (未來) 走 · 找到 +20/+65/+130 交易日的價
  // 只在 baseDate 為過去日期時才有值 · 用來回測「暴漲判定」是否準確
  // 今天執行且 baseDate=today · fwd 全 null · 欄位空白
  // ══════════════════════════════════════════════════════════════════
  let priceFwd4w = null, priceFwd13w = null, priceFwd26w = null;
  let fwdCount = 0;
  for (let i = targetIdx + 1; i < closes.length; i++) {
    if (closes[i] === null) continue;
    fwdCount++;
    if (fwdCount === 20) priceFwd4w = closes[i];
    else if (fwdCount === 65) priceFwd13w = closes[i];
    else if (fwdCount === 130) { priceFwd26w = closes[i]; break; }
  }
  const retFwd4w = (priceFwd4w !== null && price) ? (priceFwd4w - price) / price : null;
  const retFwd13w = (priceFwd13w !== null && price) ? (priceFwd13w - price) / price : null;
  const retFwd26w = (priceFwd26w !== null && price) ? (priceFwd26w - price) / price : null;

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
    // 【v2.5】forward returns · 未來股價 + 投報率
    priceFwd4w, priceFwd13w, priceFwd26w,
    retFwd4w, retFwd13w, retFwd26w,
    // 【v2.6】60d 前價（給 SPY 用來算大盤環境）
    price60d,
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

// ════════════════════════════════════════════════════════════════════════
// 【v2.6 新增 · v2.6.2 改用 MA 斜率】大盤環境過濾器 · 用 SPY (等同 VOO · 追蹤同指數) 判斷
// 🟢 多頭：SPY 50MA 向上 AND 200MA 向上（長短期都持續走高 · 真正牛市）
// 🟡 中性：只一個向上（趨勢轉換中）
// 🔴 空頭：兩個都向下（真正熊市）
// ❓ 未知：資料不足
//
// v2.6.2 為什麼改：原規則「SPY > 60d 前價 + 50MA > 200MA」在熊底反彈時
//   會誤判為 🟢（短彈通過 + MA 剛交叉）· 例如 2023-01-29 · 2023-02-25 都被誤標
//   改用 MA 斜率 · 需要持續趨勢確認 · 更能反映真實環境
// ════════════════════════════════════════════════════════════════════════
function calcMarketRegime(spy) {
  if (!spy || spy.ma50 == null || spy.ma200 == null
      || spy.ma50prev == null || spy.ma200prev == null) {
    return "❓ 未知";
  }
  const ma50Up = spy.ma50 > spy.ma50prev;
  const ma200Up = spy.ma200 > spy.ma200prev;
  if (ma50Up && ma200Up) return "🟢 多頭";
  if (ma50Up || ma200Up) return "🟡 中性";
  return "🔴 空頭";
}

// ════════════════════════════════════════════════════════════════════════
// 【v2.4 新增】暴漲判定 · 綜合 momentum + Dow + pv + VCP 4 訊號
// 4 分類：🚀 暴漲中 / 🎯 潛在暴漲 / 🔥 追高風險 / (空)
// v2.6 新增 · marketRegime 空頭時停用 🎯/🚀 · 只保留 🔥
// ════════════════════════════════════════════════════════════════════════
function explosiveVerdict(c4, c13, c26, rsi, distHigh, trendState, trendSig, pv, vcp, bb, marketRegime) {
  // 標準化參數
  c4 = (c4 || 0) * 100;
  c26 = (c26 || 0) * 100;
  rsi = rsi || 50;
  distHigh = (distHigh || -1) * 100;
  trendState = trendState || "";
  trendSig = trendSig || "";
  pv = pv || "";
  bb = bb || 0;

  // ─── 🔥 追高風險（優先判） ───
  if (c4 > 40) return "🔥 追高風險";       // 4W 已飆超過 40%
  if (c26 > 100) return "🔥 追高風險";      // 半年翻倍以上
  if (rsi > 80 && c26 > 30) return "🔥 追高風險";  // RSI 極高 + 中期已強

  // ─── v2.6.1 · 🌱 熊底反彈候選（僅非多頭市場觸發）───
  // 基於 2023-02-25 XLK/XLC/XLY 樣本驗證 · 深度回檔後翻多起始
  // 這條規則優先於 v2.6a 空頭 gate · 專抓熊底反彈機會
  if (marketRegime && marketRegime.indexOf("多頭") < 0) {
    const deepPullback = distHigh > -30 && distHigh < -10;
    const notFreefall = c26 > -20;
    const shortStabilizing = c4 > -8;
    const qualityBase = bb > 10;
    const rsiRecovering = rsi > 35 && rsi < 55;
    const pvNotWeak = pv.indexOf("熊市") < 0 && pv.indexOf("主力出貨") < 0
      && pv.indexOf("量能衰竭") < 0 && pv.indexOf("量能背離") < 0
      && pv.indexOf("頂部背離") < 0 && pv.indexOf("中期出貨") < 0
      && pv.indexOf("主升段結束") < 0 && pv.indexOf("弱勢縮量") < 0;

    if (deepPullback && notFreefall && shortStabilizing && qualityBase && rsiRecovering && pvNotWeak) {
      return "🌱 熊底反彈";
    }
  }

  // ─── v2.6 大盤空頭時 · 🎯/🚀 setup-based flag 全停用 ───
  // 7 批歷史回測顯示：熊市中 setup ready 訊號多為 false positive
  // 只保留追高警訊（已在上方判斷）· setup-based flag 一律不下
  if (marketRegime && marketRegime.indexOf("空頭") >= 0) {
    return "";
  }

  // ─── 明顯排除（弱勢/頂部背離等） ───
  if (bb < 0) return "";
  if (pv.indexOf("熊市") >= 0 || pv.indexOf("主力出貨") >= 0
      || pv.indexOf("量能衰竭") >= 0 || pv.indexOf("量能背離") >= 0
      || pv.indexOf("頂部背離") >= 0 || pv.indexOf("中期出貨") >= 0
      || pv.indexOf("主升段結束") >= 0 || pv.indexOf("弱勢縮量") >= 0) {
    return "";
  }

  // ─── 🚀 暴漲中 · 動能明確 + 訊號健康 ───
  const pvStrong = (pv === "⭐⭐⭐ 完美多頭" || pv === "🚀 健康多頭");
  const dowNotBad = (trendState.indexOf("擴散") < 0 && trendState.indexOf("空頭") < 0);

  if (pvStrong && dowNotBad && c4 > 10 && rsi > 50 && rsi < 80 && distHigh > -30) {
    return "🚀 暴漲中";
  }

  // ─── 🎯 潛在暴漲 · setup 完成但未拉升 ───
  const setupReady = (
    pv === "🌱 底部剛翻多"
    || pv === "✨ 反彈初期"
    || pv === "🚀 健康多頭"
    || (vcp === true && (pv === "➡️ 中性" || pvStrong))
    || (trendState.indexOf("收斂") >= 0 && trendSig.indexOf("✨空轉多") >= 0)
  );
  const notLiftedYet = c4 > -3 && c4 < 15;
  const notExtended = c26 > -15 && c26 < 50;
  const validPos = distHigh > -20;
  const rsiOK = rsi > 40 && rsi < 72;
  const bbOK = bb > 10;
  // v2.4.1 · 對齊 Python · 「擴散喇叭」也要擋（volatility expansion 常見頂部訊號）
  const dowNotBadForSetup = (trendState.indexOf("空頭") < 0 && trendState.indexOf("擴散") < 0);

  if (setupReady && notLiftedYet && notExtended && validPos && rsiOK && bbOK && dowNotBadForSetup) {
    return "🎯 潛在暴漲";
  }

  return "";
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
    const marketRegime = calcMarketRegime(spy);  // v2.6
    // v2.6.3 · SPY 環境透明化欄位
    let spyPriceStr = "", spyPrice60dStr = "", spyMa50Str = "", spyMa200Str = "";
    if (spy) {
      spyPriceStr = spy.price != null ? Math.round(spy.price * 100) / 100 : "";
      spyPrice60dStr = spy.price60d != null ? Math.round(spy.price60d * 100) / 100 : "";
      if (spy.ma50 != null) {
        const arrow = (spy.ma50prev != null && spy.ma50 > spy.ma50prev) ? " ↑"
                    : (spy.ma50prev != null && spy.ma50 < spy.ma50prev) ? " ↓" : "";
        spyMa50Str = (Math.round(spy.ma50 * 100) / 100) + arrow;
      }
      if (spy.ma200 != null) {
        const arrow = (spy.ma200prev != null && spy.ma200 > spy.ma200prev) ? " ↑"
                    : (spy.ma200prev != null && spy.ma200 < spy.ma200prev) ? " ↓" : "";
        spyMa200Str = (Math.round(spy.ma200 * 100) / 100) + arrow;
      }
    }
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

    // 【v2.4】暴漲判定 · v2.6 加 marketRegime 參數
    const explosive = explosiveVerdict(
      d.change4w, d.change13w, d.change26w, d.rsi14, distHigh,
      d.trend.state, d.trend.signal, d.pvVerdict, vcp,
      bbScore, marketRegime
    );

    dataSheet.getRange(row, 10, 1, 70).setValues([[
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
      d.pvVerdict || "",
      // 【v2.4】BP 暴漲判定
      explosive,
      // 【v2.5】BQ-BV · Forward 回測欄位
      d.priceFwd4w != null ? Math.round(d.priceFwd4w * 100) / 100 : "",
      d.retFwd4w != null ? Math.round(d.retFwd4w * 1000) / 10 : "",
      d.priceFwd13w != null ? Math.round(d.priceFwd13w * 100) / 100 : "",
      d.retFwd13w != null ? Math.round(d.retFwd13w * 1000) / 10 : "",
      d.priceFwd26w != null ? Math.round(d.priceFwd26w * 100) / 100 : "",
      d.retFwd26w != null ? Math.round(d.retFwd26w * 1000) / 10 : "",
      // 【v2.6】BW · 大盤環境
      marketRegime,
      // 【v2.6.3】BX-CA · SPY 環境透明化資料
      spyPriceStr, spyPrice60dStr, spyMa50Str, spyMa200Str
    ]]);

    SpreadsheetApp.getUi().alert(`✅ ${symbol} 更新完成！(v2.6.3)\n大盤環境：${marketRegime}\n排名需執行「更新全部股票」才會計算。`);

  } catch(e) {
    SpreadsheetApp.getUi().alert(`❌ 錯誤：${e.message}`);
  }
}

// ════════════════════════════════════════
// 選單
// ════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 股票數據 v2.4")
    .addItem("🔄 更新全部股票", "fetchAllStockData")
    .addItem("🔄 更新本列股票", "fetchSingleRow")
    .addToUi();
}
