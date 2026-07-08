 FinMind

- ticker: 2330
- 期間: 2024-07-06 → 2026-07-06
- token: ✅ 有

### 📦 TaiwanStockPrice
_每日 OHLCV（已用）_

✅ **483 rows** · sample row keys: date, stock_id, Trading_Volume, Trading_money, open, max, min, close, spread, Trading_turnover

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "Trading_Volume": 45678332,
    "Trading_money": 47210175550,
    "open": 1005,
    "max": 1050,
    "min": 1000,
    "close": 1035,
    "spread": 30,
    "Trading_turnover": 74909
  },
  {
    "date": "2024-07-09",
    "stock_id": "2330",
    "Trading_Volume": 54339957,
    "Trading_money": 56382512235,
    "open": 1030,
    "max": 1055,
    "min": 1025,
    "close": 1040,
    "spread": 5,
    "Trading_turnover": 74954
  },
  {
    "date": "2024-07-10",
    "stock_id": "2330",
    "Trading_Volume": 51810372,
    "Trading_money": 53308027550,
    "open": 1020,
    "max": 1050,
    "min": 1015,
    "close": 1045,
    "spread": 5,
    "Trading_turnover": 61199
  }
]
</details>

### 📦 TaiwanStockPER
_每日 PER / PBR / 殖利率（已用）_

✅ **485 rows** · sample row keys: date, stock_id, dividend_yield, PER, PBR

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "dividend_yield": 1.26,
    "PER": 31.33,
    "PBR": 7.38
  },
  {
    "date": "2024-07-09",
    "stock_id": "2330",
    "dividend_yield": 1.25,
    "PER": 31.48,
    "PBR": 7.42
  },
  {
    "date": "2024-07-10",
    "stock_id": "2330",
    "dividend_yield": 1.24,
    "PER": 31.63,
    "PBR": 7.45
  }
]
</details>

### 📦 TaiwanStockInfo
_基本資訊 · 公司名 / 產業（已用）_

✅ **2 rows** · sample row keys: industry_category, stock_id, stock_name, type, date

**unique type 值（共 1）**

| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |
| --- | --- | ---: | ---: |
| twse |  | 2 | undefined |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "industry_category": "半導體業",
    "stock_id": "2330",
    "stock_name": "台積電",
    "type": "twse",
    "date": "2026-07-06"
  },
  {
    "industry_category": "電子工業",
    "stock_id": "2330",
    "stock_name": "台積電",
    "type": "twse",
    "date": "2026-07-06"
  }
]
</details>

### 📦 TaiwanStockFinancialStatements
_損益表 long format · 程式讀 Revenue/OperatingRevenue/TotalRevenue、GrossProfit/OperatingGrossProfit、OperatingIncome/OperatingProfit、EPS/BasicEPS/DilutedEPS_

✅ **119 rows** · sample row keys: date, stock_id, type, value, origin_name

**unique type 值（共 17）**

| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |
| --- | --- | ---: | ---: |
| ComprehensiveIncomeConsolidatedNetIncomeAttributedNonControllingInterest | 綜合損益總額歸屬於非控制權益 | 7 | 1923569000 |
| CostOfGoodsSold | 營業成本 | 7 | 320346477000 |
| EPS | 基本每股盈餘 | 7 | 12.55 |
| EquityAttributableToOwnersOfParent | 淨利（淨損）歸屬於母公司業主 | 7 | 325257571000 |
| GrossProfit | 營業毛利（毛損） | 7 | 439345666000 |
| IncomeAfterTaxes | 本期淨利（淨損） | 7 | 325080170000 |
| IncomeFromContinuingOperations | 繼續營業單位本期淨利（淨損） | 7 | 325080170000 |
| NoncontrollingInterests | 淨利（淨損）歸屬於非控制權益 | 7 | -177401000 |
| OperatingExpenses | 營業費用 | 7 | 79078904000 |
| OperatingIncome | 營業利益（損失） | 7 | 360766289000 |
| OtherComprehensiveIncome | 其他綜合損益（淨額） | 7 | -21056278000 |
| OTHNOE | 其他收益及費損淨額 | 7 | 499527000 |
| PreTaxIncome | 稅前淨利（淨損） | 7 | 384186852000 |
| Revenue | 營業收入 | 7 | 759692143000 |
| TAX | 所得稅費用（利益） | 7 | 59106682000 |
| TotalConsolidatedProfitForThePeriod | 本期綜合損益總額 | 7 | 304023892000 |
| TotalNonoperatingIncomeAndExpense | 營業外收入及支出 | 7 | 23420563000 |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "OTHNOE",
    "value": 499527000,
    "origin_name": "其他收益及費損淨額"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "OtherComprehensiveIncome",
    "value": -21056278000,
    "origin_name": "其他綜合損益（淨額）"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "TAX",
    "value": 59106682000,
    "origin_name": "所得稅費用（利益）"
  }
]
</details>

### 📦 TaiwanStockCashFlowsStatement
_現金流量表 long format · 程式讀 CashFlowsFromOperatingActivities/OperatingCashFlow、FreeCashFlow、NetIncome/NetIncomeAfterTax/NetIncomeAttributableToOwners（FCF + NI 抓不到！本次要驗證）_

✅ **189 rows** · sample row keys: date, stock_id, type, value, origin_name

**unique type 值（共 27）**

| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |
| --- | --- | ---: | ---: |
| AccountsPayable | 應付帳款 | 7 | 13407440000 |
| AmortizationExpense | 攤銷費用 | 7 | 6876767000 |
| CashBalancesBeginningOfPeriod | 期初現金及約當現金餘額 | 7 | 1465427753000 |
| CashBalancesEndOfPeriod | 期末現金及約當現金餘額 | 7 | 1886780555000 |
| CashBalancesIncrease | 本期現金及約當現金增加（減少）數 | 7 | 421352802000 |
| CashFlowsFromOperatingActivities | 營業活動之淨現金流入（流出） | 7 | 1205971785000 |
| CashFlowsProvidedFromFinancingActivities | 籌資活動之淨現金流入（流出） | 7 | -245568487000 |
| CashProvidedByInvestingActivities | 投資活動之淨現金流入（流出） | 7 | -552924242000 |
| CashReceivedThroughOperations | 營運產生之現金流入（流出） | 7 | 1388421308000 |
| DecreaseInDepositDeposit | 存出保證金減少 | 7 | 3083455000 |
| Depreciation | 折舊費用 | 7 | 485541546000 |
| HedgingFinancialLiabilities | 除列避險之金融負債 | 7 | 28704000 |
| IncomeBeforeIncomeTaxFromContinuingOperations | 繼續營業單位稅前淨利（淨損） | 7 | 957040631000 |
| InterestExpense | 利息費用 | 7 | 7972185000 |
| InterestIncome | 利息收入 | 7 | -62940059000 |
| InventoryIncrease | 存貨（增加）減少 | 7 | -41886842000 |
| NetCashInflowFromOperatingActivities | 營業活動之淨現金流入 | 7 | 1205971785000 |
| NetIncomeBeforeTax | 本期稅前淨利（淨損） | 7 | 957040631000 |
| OtherInvestingActivities | 其他投資活動 | 7 | 16043339000 |
| PayTheInterest | 支付之利息 | 7 | -12804370000 |
| ProceedsFromLongTermDebt | 舉借長期借款 | 7 | 23442000000 |
| PropertyAndPlantAndEquipment | 取得不動產、廠房及設備 | 7 | -594058374000 |
| ReceivableIncrease | 應收帳款（增加）減少 | 7 | -48256709000 |
| RedemptionOfBonds | 償還公司債 | 7 | -5250000000 |
| RentalPrincipalRepayments | 租賃本金償還 | 7 | -2212890000 |
| RepaymentOfLongTermDebt | 償還長期借款 | 7 | -1659722000 |
| TotalIncomeLossItems | 收益費損項目合計 | 7 | 439802199000 |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "CashProvidedByInvestingActivities",
    "value": -552924242000,
    "origin_name": "投資活動之淨現金流入（流出）"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "OtherInvestingActivities",
    "value": 16043339000,
    "origin_name": "其他投資活動"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "CashBalancesBeginningOfPeriod",
    "value": 1465427753000,
    "origin_name": "期初現金及約當現金餘額"
  }
]
</details>

### 📦 TaiwanStockBalanceSheet
_資產負債表 long format · Priority 2 會用（總資產 / 負債 / 應收 / 存貨）_

✅ **707 rows** · sample row keys: date, stock_id, type, value, origin_name

**unique type 值（共 101）**

| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |
| --- | --- | ---: | ---: |
| AccountsPayable | 應付帳款 | 7 | 69134197000 |
| AccountsPayable_per | 應付帳款 | 7 | 1.12 |
| AccountsPayableToRelatedParties | 應付帳款－關係人 | 7 | 1685850000 |
| AccountsPayableToRelatedParties_per | 應付帳款－關係人 | 7 | 0.03 |
| AccountsReceivableDuefromRelatedPartiesNet | 應收帳款－關係人淨額 | 7 | 403379000 |
| AccountsReceivableDuefromRelatedPartiesNet_per | 應收帳款－關係人淨額 | 7 | 0.01 |
| AccountsReceivableNet | 應收帳款淨額 | 7 | 249570573000 |
| AccountsReceivableNet_per | 應收帳款淨額 | 7 | 4.05 |
| BondsPayable | 應付公司債 | 7 | 909703588000 |
| BondsPayable_per | 應付公司債 | 7 | 14.75 |
| CapitalStock | 股本合計 | 7 | 259327332000 |
| CapitalStock_per | 股本合計 | 7 | 4.21 |
| CapitalSurplus | 資本公積合計 | 7 | 72390172000 |
| CapitalSurplus_per | 資本公積合計 | 7 | 1.17 |
| CapitalSurplusAdditionalPaidInCapital | 資本公積－發行溢價 | 7 | 33700961000 |
| CapitalSurplusAdditionalPaidInCapital_per | 資本公積－發行溢價 | 7 | 0.55 |
| CapitalSurplusChangesInEquityOfAssociatesAndJointVenturesAccountedForUsingEquityMethod | 資本公積－採用權益法認列關聯企業及合資股權淨值之變動數 | 7 | 305828000 |
| CapitalSurplusChangesInEquityOfAssociatesAndJointVenturesAccountedForUsingEquityMethod_per | 資本公積－採用權益法認列關聯企業及合資股權淨值之變動數 | 7 | 0 |
| CapitalSurplusDonatedAssetsReceived | 資本公積－受贈資產 | 7 | 81368000 |
| CapitalSurplusDonatedAssetsReceived_per | 資本公積－受贈資產 | 7 | 0 |
| CapitalSurplusNetAssetsFromMerger | 資本公積－合併溢額 | 7 | 22800434000 |
| CapitalSurplusNetAssetsFromMerger_per | 資本公積－合併溢額 | 7 | 0.37 |
| CashAndCashEquivalents | 現金及約當現金 | 7 | 1886780555000 |
| CashAndCashEquivalents_per | 現金及約當現金 | 7 | 30.6 |
| CurrentAssets | 流動資產合計 | 7 | 2773913863000 |
| CurrentAssets_per | 流動資產合計 | 7 | 44.99 |
| CurrentDerivativeFinancialLiabilitiesForHedging | 避險之金融負債－流動 | 7 | 1875000 |
| CurrentDerivativeFinancialLiabilitiesForHedging_per | 避險之金融負債－流動 | 7 | 0 |
| CurrentFinancialAssetsAtFairvalueThroughProfitOrLoss | 透過損益按公允價值衡量之金融資產－流動 | 7 | 971386000 |
| CurrentFinancialAssetsAtFairvalueThroughProfitOrLoss_per | 透過損益按公允價值衡量之金融資產－流動 | 7 | 0.02 |
| CurrentFinancialLiabilitiesAtFairValueThroughProfitOrLoss | 透過損益按公允價值衡量之金融負債－流動 | 7 | 34277000 |
| CurrentFinancialLiabilitiesAtFairValueThroughProfitOrLoss_per | 透過損益按公允價值衡量之金融負債－流動 | 7 | 0 |
| CurrentLiabilities | 流動負債合計 | 7 | 1080399099000 |
| CurrentLiabilities_per | 流動負債合計 | 7 | 17.52 |
| CurrentTaxLiabilities | 本期所得稅負債 | 7 | 77422729000 |
| CurrentTaxLiabilities_per | 本期所得稅負債 | 7 | 1.26 |
| DeferredTaxAssets | 遞延所得稅資產 | 7 | 65944214000 |
| DeferredTaxAssets_per | 遞延所得稅資產 | 7 | 1.07 |
| Equity | 權益總額 | 7 | 4021922291000 |
| Equity_per | 權益總額 | 7 | 65.23 |
| EquityAttributableToOwnersOfParent | 歸屬於母公司業主之權益合計 | 7 | 3990019153000 |
| EquityAttributableToOwnersOfParent_per | 歸屬於母公司業主之權益合計 | 7 | 64.71 |
| FinancialAssetsAtAmortizedCost | 按攤銷後成本衡量之金融資產－流動 | 7 | 90197355000 |
| FinancialAssetsAtAmortizedCost_per | 按攤銷後成本衡量之金融資產－流動 | 7 | 1.46 |
| FinancialAssetsAtAmortizedCostNonCurrent | 按攤銷後成本衡量之金融資產－非流動 | 7 | 74266804000 |
| FinancialAssetsAtAmortizedCostNonCurrent_per | 按攤銷後成本衡量之金融資產－非流動 | 7 | 1.2 |
| FinancialAssetsAtFairvalueThroughOtherComprehensiveIncome | 透過其他綜合損益按公允價值衡量之金融資產－流動 | 7 | 189649314000 |
| FinancialAssetsAtFairvalueThroughOtherComprehensiveIncome_per | 透過其他綜合損益按公允價值衡量之金融資產－流動 | 7 | 3.08 |
| FinancialAssetsAtFairvalueThroughOtherComprehensiveIncomeNonCurrent | 透過其他綜合損益按公允價值衡量之金融資產－非流動 | 7 | 7502973000 |
| FinancialAssetsAtFairvalueThroughOtherComprehensiveIncomeNonCurrent_per | 透過其他綜合損益按公允價值衡量之金融資產－非流動 | 7 | 0.12 |
| HedgingAinancialAssets | 避險之金融資產－流動 | 7 | 1079000 |
| HedgingAinancialAssets_per | 避險之金融資產－流動 | 7 | 0 |
| IntangibleAssets | 無形資產 | 7 | 22083031000 |
| IntangibleAssets_per | 無形資產 | 7 | 0.36 |
| Inventories | 存貨 | 7 | 292883930000 |
| Inventories_per | 存貨 | 7 | 4.75 |
| InvestmentAccountedForUsingEquityMethod | 採用權益法之投資 | 7 | 30967916000 |
| InvestmentAccountedForUsingEquityMethod_per | 採用權益法之投資 | 7 | 0.5 |
| LegalReserve | 法定盈餘公積 | 7 | 311146899000 |
| LegalReserve_per | 法定盈餘公積 | 7 | 5.05 |
| Liabilities | 負債總額 | 7 | 2143735885000 |
| Liabilities_per | 負債總額 | 7 | 34.77 |
| LongtermBorrowings | 長期借款 | 7 | 26459677000 |
| LongtermBorrowings_per | 長期借款 | 7 | 0.43 |
| NoncontrollingInterests | 非控制權益 | 7 | 31903138000 |
| NoncontrollingInterests_per | 非控制權益 | 7 | 0.52 |
| NoncurrentAssets | 非流動資產合計 | 7 | 3391744313000 |
| NoncurrentAssets_per | 非流動資產合計 | 7 | 55.01 |
| NonCurrentFinancialAssetsAtFairvalueThroughProfitOrLoss | 透過損益按公允價值衡量之金融資產－非流動 | 7 | 14594649000 |
| NonCurrentFinancialAssetsAtFairvalueThroughProfitOrLoss_per | 透過損益按公允價值衡量之金融資產－非流動 | 7 | 0.24 |
| NoncurrentLiabilities | 非流動負債合計 | 7 | 1063336786000 |
| NoncurrentLiabilities_per | 非流動負債合計 | 7 | 17.25 |
| NumberOfSharesInEntityHeldByEntityAndByItsSubsidiaries | 母公司暨子公司所持有之母公司庫藏股股數 | 7 | 0 |
| OrdinaryShare | 普通股股本 | 7 | 259327332000 |
| OrdinaryShare_per | 普通股股本 | 7 | 4.21 |
| OtherCurrentAssets | 其他流動資產 | 7 | 63381815000 |
| OtherCurrentAssets_per | 其他流動資產 | 7 | 1.03 |
| OtherCurrentLiabilities | 其他流動負債 | 7 | 512418300000 |
| OtherCurrentLiabilities_per | 其他流動負債 | 7 | 8.31 |
| OtherEquityInterest | 其他權益合計 | 7 | 922408000 |
| OtherEquityInterest_per | 其他權益合計 | 7 | 0.01 |
| OtherNoncurrentAssets | 其他非流動資產 | 7 | 65086650000 |
| OtherNoncurrentAssets_per | 其他非流動資產 | 7 | 1.06 |
| OtherNoncurrentLiabilities | 其他非流動負債 | 7 | 98903424000 |
| OtherNoncurrentLiabilities_per | 其他非流動負債 | 7 | 1.6 |
| OtherPayables | 其他應付款 | 7 | 419701871000 |
| OtherPayables_per | 其他應付款 | 7 | 6.81 |
| OtherReceivablesDueFromRelatedParties | 其他應收款－關係人淨額 | 7 | 74477000 |
| OtherReceivablesDueFromRelatedParties_per | 其他應收款－關係人淨額 | 7 | 0 |
| PropertyPlantAndEquipment | 不動產、廠房及設備 | 7 | 3071599327000 |
| PropertyPlantAndEquipment_per | 不動產、廠房及設備 | 7 | 49.82 |
| RetainedEarnings | 保留盈餘合計 | 7 | 3657379241000 |
| RetainedEarnings_per | 保留盈餘合計 | 7 | 59.32 |
| RightOfUseAsset | 使用權資產 | 7 | 39698749000 |
| RightOfUseAsset_per | 使用權資產 | 7 | 0.64 |
| TotalAssets | 資產總額 | 7 | 6165658176000 |
| TotalAssets_per | 資產總額 | 7 | 100 |
| TotalLiabilitiesEquity | 負債及權益總計 | 7 | 6165658176000 |
| TotalLiabilitiesEquity_per | 負債及權益總計 | 7 | 100 |
| UnappropriatedRetainedEarningsAaccumulatedDeficit | 未分配盈餘 | 7 | 3346232342000 |
| UnappropriatedRetainedEarningsAaccumulatedDeficit_per | 未分配盈餘 | 7 | 54.27 |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "CashAndCashEquivalents",
    "value": 1886780555000,
    "origin_name": "現金及約當現金"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "CashAndCashEquivalents_per",
    "value": 30.6,
    "origin_name": "現金及約當現金"
  },
  {
    "date": "2024-09-30",
    "stock_id": "2330",
    "type": "CurrentFinancialAssetsAtFairvalueThroughProfitOrLoss",
    "value": 971386000,
    "origin_name": "透過損益按公允價值衡量之金融資產－流動"
  }
]
</details>

### 📦 TaiwanStockInstitutionalInvestorsBuySell
_三大法人買賣超（已用 · 有 name 分類）_

✅ **2420 rows** · sample row keys: date, stock_id, buy, name, sell

**unique name 值（共 5）**

| name | rows |
| --- | ---: |
| Dealer_Hedging | 484 |
| Dealer_self | 484 |
| Foreign_Dealer_Self | 484 |
| Foreign_Investor | 484 |
| Investment_Trust | 484 |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "buy": 0,
    "name": "Foreign_Dealer_Self",
    "sell": 0
  },
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "buy": 347000,
    "name": "Dealer_self",
    "sell": 335100
  },
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "buy": 715246,
    "name": "Dealer_Hedging",
    "sell": 809486
  }
]
</details>

### 📦 TaiwanStockMonthRevenue
_月營收（每月 10 號公告 · 領先季報 6 週）_

✅ **23 rows** · sample row keys: date, stock_id, country, revenue, revenue_month, revenue_year, create_time

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-08-01",
    "stock_id": "2330",
    "country": "Taiwan",
    "revenue": 256953058000,
    "revenue_month": 7,
    "revenue_year": 2024,
    "create_time": ""
  },
  {
    "date": "2024-09-01",
    "stock_id": "2330",
    "country": "Taiwan",
    "revenue": 250866368000,
    "revenue_month": 8,
    "revenue_year": 2024,
    "create_time": ""
  },
  {
    "date": "2024-10-01",
    "stock_id": "2330",
    "country": "Taiwan",
    "revenue": 251872717000,
    "revenue_month": 9,
    "revenue_year": 2024,
    "create_time": ""
  }
]
</details>

### 📦 TaiwanStockMarginPurchaseShortSale
_融資融券（散戶槓桿情緒）_

✅ **482 rows** · sample row keys: date, stock_id, MarginPurchaseBuy, MarginPurchaseCashRepayment, MarginPurchaseLimit, MarginPurchaseSell, MarginPurchaseTodayBalance, MarginPurchaseYesterdayBalance, Note, OffsetLoanAndShort, ShortSaleBuy, ShortSaleCashRepayment, ShortSaleLimit, ShortSaleSell, ShortSaleTodayBalance, ShortSaleYesterdayBalance

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "MarginPurchaseBuy": 2042,
    "MarginPurchaseCashRepayment": 22,
    "MarginPurchaseLimit": 6483407,
    "MarginPurchaseSell": 1404,
    "MarginPurchaseTodayBalance": 25230,
    "MarginPurchaseYesterdayBalance": 24614,
    "Note": " ",
    "OffsetLoanAndShort": 0,
    "ShortSaleBuy": 24,
    "ShortSaleCashRepayment": 3,
    "ShortSaleLimit": 6483407,
    "ShortSaleSell": 64,
    "ShortSaleTodayBalance": 508,
    "ShortSaleYesterdayBalance": 471
  },
  {
    "date": "2024-07-09",
    "stock_id": "2330",
    "MarginPurchaseBuy": 1299,
    "MarginPurchaseCashRepayment": 34,
    "MarginPurchaseLimit": 6483407,
    "MarginPurchaseSell": 869,
    "MarginPurchaseTodayBalance": 25610,
    "MarginPurchaseYesterdayBalance": 25214,
    "Note": " ",
    "OffsetLoanAndShort": 4,
    "ShortSaleBuy": 14,
    "ShortSaleCashRepayment": 1,
    "ShortSaleLimit": 6483407,
    "ShortSaleSell": 27,
    "ShortSaleTodayBalance": 515,
    "ShortSaleYesterdayBalance": 503
  },
  {
    "date": "2024-07-10",
    "stock_id": "2330",
    "MarginPurchaseBuy": 1135,
    "MarginPurchaseCashRepayment": 16,
    "MarginPurchaseLimit": 6483407,
    "MarginPurchaseSell": 735,
    "MarginPurchaseTodayBalance": 25994,
    "MarginPurchaseYesterdayBalance": 25610,
    "Note": " ",
    "OffsetLoanAndShort": 5,
    "ShortSaleBuy": 16,
    "ShortSaleCashRepayment": 1,
    "ShortSaleLimit": 6483407,
    "ShortSaleSell": 62,
    "ShortSaleTodayBalance": 560,
    "ShortSaleYesterdayBalance": 515
  }
]
</details>

### 📦 TaiwanStockShareholding
_外資 / 陸資 / 僑外資持股比率（趨勢 vs 買賣超）_

✅ **486 rows** · sample row keys: date, stock_id, stock_name, InternationalCode, ForeignInvestmentRemainingShares, ForeignInvestmentShares, ForeignInvestmentRemainRatio, ForeignInvestmentSharesRatio, ForeignInvestmentUpperLimitRatio, ChineseInvestmentUpperLimitRatio, NumberOfSharesIssued, RecentlyDeclareDate, note

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-08",
    "stock_id": "2330",
    "stock_name": "台積電",
    "InternationalCode": "TW0002330008",
    "ForeignInvestmentRemainingShares": 6609294805,
    "ForeignInvestmentShares": 19324334437,
    "ForeignInvestmentRemainRatio": 25.48,
    "ForeignInvestmentSharesRatio": 74.51,
    "ForeignInvestmentUpperLimitRatio": 100,
    "ChineseInvestmentUpperLimitRatio": 100,
    "NumberOfSharesIssued": 25933629242,
    "RecentlyDeclareDate": "2024-06-21",
    "note": ""
  },
  {
    "date": "2024-07-09",
    "stock_id": "2330",
    "stock_name": "台積電",
    "InternationalCode": "TW0002330008",
    "ForeignInvestmentRemainingShares": 6620554486,
    "ForeignInvestmentShares": 19313074756,
    "ForeignInvestmentRemainRatio": 25.52,
    "ForeignInvestmentSharesRatio": 74.47,
    "ForeignInvestmentUpperLimitRatio": 100,
    "ChineseInvestmentUpperLimitRatio": 100,
    "NumberOfSharesIssued": 25933629242,
    "RecentlyDeclareDate": "2024-06-21",
    "note": ""
  },
  {
    "date": "2024-07-10",
    "stock_id": "2330",
    "stock_name": "台積電",
    "InternationalCode": "TW0002330008",
    "ForeignInvestmentRemainingShares": 6630596691,
    "ForeignInvestmentShares": 19303032551,
    "ForeignInvestmentRemainRatio": 25.56,
    "ForeignInvestmentSharesRatio": 74.43,
    "ForeignInvestmentUpperLimitRatio": 100,
    "ChineseInvestmentUpperLimitRatio": 100,
    "NumberOfSharesIssued": 25933629242,
    "RecentlyDeclareDate": "2024-06-21",
    "note": ""
  }
]
</details>

### 📦 TaiwanStockDividend
_股利（配息穩定度 · 品質層次）_

✅ **8 rows** · sample row keys: date, stock_id, year, StockEarningsDistribution, StockStatutorySurplus, StockExDividendTradingDate, TotalEmployeeStockDividend, TotalEmployeeStockDividendAmount, RatioOfEmployeeStockDividendOfTotal, RatioOfEmployeeStockDividend, CashEarningsDistribution, CashStatutorySurplus, CashExDividendTradingDate, CashDividendPaymentDate, TotalEmployeeCashDividend, TotalNumberOfCashCapitalIncrease, CashIncreaseSubscriptionRate, CashIncreaseSubscriptionpRrice, RemunerationOfDirectorsAndSupervisors, ParticipateDistributionOfTotalShares, AnnouncementDate, AnnouncementTime

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-09-18",
    "stock_id": "2330",
    "year": "113年第1季",
    "StockEarningsDistribution": 0,
    "StockStatutorySurplus": 0,
    "StockExDividendTradingDate": "",
    "TotalEmployeeStockDividend": 0,
    "TotalEmployeeStockDividendAmount": 0,
    "RatioOfEmployeeStockDividendOfTotal": 0,
    "RatioOfEmployeeStockDividend": 0,
    "CashEarningsDistribution": 4.0001382,
    "CashStatutorySurplus": 0,
    "CashExDividendTradingDate": "2024-09-12",
    "CashDividendPaymentDate": "2024-10-09",
    "TotalEmployeeCashDividend": 0,
    "TotalNumberOfCashCapitalIncrease": 0,
    "CashIncreaseSubscriptionRate": 0,
    "CashIncreaseSubscriptionpRrice": 0,
    "RemunerationOfDirectorsAndSupervisors": 0,
    "ParticipateDistributionOfTotalShares": 25932733242,
    "AnnouncementDate": "2024-08-28",
    "AnnouncementTime": "18:35:39"
  },
  {
    "date": "2024-12-18",
    "stock_id": "2330",
    "year": "113年第2季",
    "StockEarningsDistribution": 0,
    "StockStatutorySurplus": 0,
    "StockExDividendTradingDate": "",
    "TotalEmployeeStockDividend": 0,
    "TotalEmployeeStockDividendAmount": 0,
    "RatioOfEmployeeStockDividendOfTotal": 0,
    "RatioOfEmployeeStockDividend": 0,
    "CashEarningsDistribution": 3.99963706,
    "CashStatutorySurplus": 0,
    "CashExDividendTradingDate": "2024-12-12",
    "CashDividendPaymentDate": "2025-01-09",
    "TotalEmployeeCashDividend": 0,
    "TotalNumberOfCashCapitalIncrease": 0,
    "CashIncreaseSubscriptionRate": 0,
    "CashIncreaseSubscriptionpRrice": 0,
    "RemunerationOfDirectorsAndSupervisors": 0,
    "ParticipateDistributionOfTotalShares": 25932733242,
    "AnnouncementDate": "2024-11-27",
    "AnnouncementTime": "18:07:53"
  },
  {
    "date": "2025-03-24",
    "stock_id": "2330",
    "year": "113年第3季",
    "StockEarningsDistribution": 0,
    "StockStatutorySurplus": 0,
    "StockExDividendTradingDate": "",
    "TotalEmployeeStockDividend": 0,
    "TotalEmployeeStockDividendAmount": 0,
    "RatioOfEmployeeStockDividendOfTotal": 0,
    "RatioOfEmployeeStockDividend": 0,
    "CashEarningsDistribution": 4.50002042,
    "CashStatutorySurplus": 0,
    "CashExDividendTradingDate": "2025-03-18",
    "CashDividendPaymentDate": "2025-04-10",
    "TotalEmployeeCashDividend": 0,
    "TotalNumberOfCashCapitalIncrease": 0,
    "CashIncreaseSubscriptionRate": 0,
    "CashIncreaseSubscriptionpRrice": 0,
    "RemunerationOfDirectorsAndSupervisors": 0,
    "ParticipateDistributionOfTotalShares": 25932615521,
    "AnnouncementDate": "2025-03-03",
    "AnnouncementTime": "17:34:18"
  }
]
</details>

### 📦 TaiwanStockHoldingSharesPer
_集保股權分散（大戶 vs 散戶）_

✅ **1734 rows** · sample row keys: date, stock_id, HoldingSharesLevel, people, percent, unit

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "date": "2024-07-12",
    "stock_id": "2330",
    "HoldingSharesLevel": "1-999",
    "people": 842897,
    "percent": 0.5,
    "unit": 130274115
  },
  {
    "date": "2024-07-12",
    "stock_id": "2330",
    "HoldingSharesLevel": "1,000-5,000",
    "people": 322578,
    "percent": 2.37,
    "unit": 614913492
  },
  {
    "date": "2024-07-12",
    "stock_id": "2330",
    "HoldingSharesLevel": "5,001-10,000",
    "people": 38899,
    "percent": 1.08,
    "unit": 282378131
  }
]
</details>

### 📦 TaiwanStockGovernmentBankBuySell
_八大公股行庫買賣超（另一組情緒指標）_

❌ HTTP 400: {"msg":"Your level is backer. Please update your user level. Detail information:https://finmindtrade.com/analysis/#/Sponsor/sponsor","status":400,"token_tail":"...PRiactuY"}

### 📦 TaiwanStockMarketValueWeight
_市值權重（大盤定位）_

✅ **17 rows** · sample row keys: rank, stock_id, stock_name, weight_per, date, type

**unique type 值（共 1）**

| type（程式抓的欄位名） | origin_name（中文原名） | rows | sample value |
| --- | --- | ---: | ---: |
| twse |  | 17 | undefined |

<details><summary>📄 sample raw JSON（前 3 rows）</summary>

[
  {
    "rank": 1,
    "stock_id": "2330",
    "stock_name": "台積電",
    "weight_per": 36.8397,
    "date": "2024-10-30",
    "type": "twse"
  },
  {
    "rank": 1,
    "stock_id": "2330",
    "stock_name": "台積電",
    "weight_per": 36.6112,
    "date": "2025-02-27",
    "type": "twse"
  },
  {
    "rank": 1,
    "stock_id": "2330",
    "stock_name": "台積電",
    "weight_per": 36.4097,
    "date": "2025-04-30",
    "type": "twse"
  }
]
</details>
