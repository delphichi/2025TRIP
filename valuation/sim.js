(function () {
    'use strict';

    const BASE_CAPITAL = 100000;
    const HOLD_THRESHOLD_PP = 2.5;

    // ==================================================================
    // SCENARIOS · 3 支對照情境（對抗倖存者偏差）
    // ==================================================================
    const SCENARIOS = {

        // ==========================================
        // GOOGL · 反擊型龍頭（倖存者、但有反覆威脅敘事）
        // ==========================================
        GOOGL_2023: {
            id: 'GOOGL_2023',
            ticker: 'GOOGL',
            title: 'GOOGL · 反擊型龍頭',
            emoji: '🌐',
            subtitle: '2023-01-01 · ChatGPT 威脅論高峰 · Alphabet 剛裁員 12,000 · Bard 尚未發表',
            outcomeHint: '📈 倖存者（+300%）· 但過程有多次「Google 死了」敘事',
            startDate: '2023-01-01',
            snapshotCells: [
                { label: '🏢 公司', val: 'Alphabet (GOOGL)', note: '搜尋 + Android + YouTube + Cloud + Waymo' },
                { label: '💰 估值（YE 2022）', val: 'PE ~18x · PBR ~4.5x', note: '跟 2021 高峰（PE 25x）回落 · 中期便宜' },
                { label: '📊 2022 財報', val: '營收 +10% · EPS -19%', note: '廣告景氣走弱 · 前年高基期' },
                { label: '🇺🇸 總經', val: 'DGS10 3.88% · FED 4.33%', note: '升息尾聲 · CPI 6.5% 見頂 · VIX 21.6' },
                { label: '🌡 市場情緒', val: '科技大跌年後', note: 'Alphabet 剛裁員 12,000 · 2022 GOOGL -39%' },
                { label: '🎯 當時敘事', val: '⚠️ ChatGPT 威脅論', note: '2022-11 ChatGPT 上線 · Bard 尚未發表' },
            ],
            events: [
                { date: '2023-01-20', label: 'Alphabet 裁員 12,000 人', kind: 'ambig',
                  desc: '成本結構調整 · 對成本有利、但也反映廣告景氣壓力',
                  hint: '💭 裁員可能是「削減冗員→提升利潤率」，但也可能是「主管認錯：過去兩年擴太快」。' },
                { date: '2023-02-06', label: 'Bard 首次公開示範失誤', kind: 'neg',
                  desc: 'Bard 給錯答案 · 股價當日 -8% · 「Google 輸給 OpenAI」敘事高潮',
                  hint: '💭 恐慌情境：ChatGPT 統治 · Google 搜尋被顛覆 · 這是不是進場點或該逃？' },
                { date: '2023-05-10', label: 'Google I/O 全面 AI 化', kind: 'pos',
                  desc: 'PaLM 2、Bard 全球開放、Search Generative Experience · Google 反擊姿態',
                  hint: '💭 3 個月前才崩跌 8% · 現在展示反擊 · 你相信這是真反擊還是公關秀？' },
                { date: '2023-12-06', label: 'Gemini 1.0 發表', kind: 'pos',
                  desc: '多模態旗艦模型 · 部分基準超越 GPT-4 · 股價正面反應',
                  hint: '💭 Google 展示技術實力 · 但市占率能不能追回 OpenAI 是另一回事。' },
                { date: '2024-04-25', label: 'Q1 2024 財報 + 首次股息', kind: 'pos',
                  desc: '雲端 +28% · 廣告 +13% · 首次派息 + $70B 買回 · 股價 +10%',
                  hint: '💭 派息意味成熟股 · 但也可能是「成長題材沒了」訊號 · 你怎麼看？' },
                { date: '2024-05-14', label: 'Google I/O · AI Overviews', kind: 'pos',
                  desc: 'Gemini 1.5 Pro · Search AI 大改 · 展現「不是輸家」',
                  hint: '💭 AI Overviews 會不會反噬廣告點擊率？短期看不出來、長期是關鍵。' },
                { date: '2024-08-05', label: 'DOJ 反壟斷裁定違法', kind: 'neg',
                  desc: '美國聯邦法官裁定 Google 搜尋壟斷違法 · 分拆風險升溫 · 但股價短期反彈',
                  hint: '💭 恐慌關卡：分拆傳言 vs 上訴多年才定案。你會停損、觀望還是加碼？' },
                { date: '2024-11-20', label: 'DOJ 提議分拆 Chrome', kind: 'neg',
                  desc: '司法部提議強制分拆 Chrome · 若成真影響巨大 · 但需上訴多年才定案',
                  hint: '💭 情境重複：分拆 Chrome 比賣搜尋更痛 · 但一樣需多年才定案 · 你的定價會不會變？' },
                { date: '2025-02-04', label: 'Q4 2024 財報 · Cloud 略 miss', kind: 'ambig',
                  desc: 'Cloud 30% 成長略低於預期 · CapEx guidance $75B（+40%）驚人',
                  hint: '💭 CapEx 上修 40% · 是「投資未來 AI」還是「利潤率崩掉」的前兆？' },
                { date: '2025-04-24', label: 'Q1 2025 財報大超預期', kind: 'pos',
                  desc: '廣告 + Cloud 都超預期 · CapEx 上修至 $75B · 股價 +6%',
                  hint: '💭 一切都好 · 通常「都很順」時你要問「還有什麼沒發生？」——分拆案還沒結。' },
                { date: '2026-02-15', label: 'Waymo $16B 融資（大部分 Alphabet 出）', kind: 'pos',
                  desc: '這輪融資把 Waymo 估值大幅推高 · 後續 Q1 2026 認列 $36.9B 未實現利益',
                  hint: '💭 Waymo 估值上修 · 這是實質價值還是紙上富貴？' },
                { date: '2026-04-30', label: 'Q1 2026 淨利爆表 · 主要來自 Waymo 認列', kind: 'ambig',
                  desc: '淨利 +81% YoY · 但 $36.9B 是非現金公允價值 · 核心 YoY +26.4%（不像表面數字）',
                  hint: '💭 表面 +81% vs 核心 +26% · 你會 FOMO 加碼還是認出這是「一次性認列」？' },
                { date: '2026-07-06', label: '至今 · 現況檢視', kind: 'ambig',
                  desc: '所有事件都揭曉 · 這是你最後的決策點：現在你想抱到什麼比例？',
                  hint: '💭 事後看回頭 · 你最後的判斷會是什麼？',
                  isFinal: true },
            ],
            lessons: [
                '<b>2023-02 Bard 失誤 -8%</b>：如果你在那時減碼 · 事後 Google I/O + Gemini 反彈你就完美錯過。<b>訓練意義</b>：短期股價劇烈反應不代表基本面已崩、「敘事高潮」通常是好進場點。',
                '<b>2024-08 DOJ 反壟斷裁決</b>：市場短期反彈、長期難定案。<b>訓練意義</b>：政治/監管風險難定價、留部位（不 All-in、不清倉）通常最能維持理性。',
                '<b>2026-04 Q1 淨利 +81%</b>：表面數字華麗、核心 +26%。<b>訓練意義</b>：分辨「表面 vs 核心」、看到爆表數字先問「是不是一次性認列」。',
                '<b>整段期間的教訓</b>：GOOGL 從 $89 → $180+（+100%+）· 「Google 輸給 ChatGPT」是最大的錯誤敘事。<b>對主流敘事保持懷疑機率 30-40%，不要 0% 也不要 100%</b>。',
            ],
        },

        // ==========================================
        // INTC · 敗給時代的龍頭（非倖存者、對照組）
        // ==========================================
        INTC_2022: {
            id: 'INTC_2022',
            ticker: 'INTC',
            title: 'INTC · 敗給時代的龍頭',
            emoji: '💀',
            subtitle: '2022-01-01 · Pat Gelsinger 就任 CEO · 承諾 IDM 2.0 「Intel 要拿回製程領先」',
            outcomeHint: '📉 非倖存者（-50%）· 開局 $50、現在 $25 · 龍頭也會慘輸的樣本',
            startDate: '2022-01-01',
            snapshotCells: [
                { label: '🏢 公司', val: 'Intel Corporation (INTC)', note: 'x86 CPU 龍頭 + Foundry 新事業' },
                { label: '💰 估值（YE 2021）', val: 'PE ~10x · PBR ~2.6x', note: '看起來便宜 · 但市場已定價「TSMC/AMD 追上來」' },
                { label: '📊 2021 財報', val: '營收 +1% · EPS +5%', note: '看似穩健 · 但資料中心 Q4 開始弱' },
                { label: '🇺🇸 總經', val: 'DGS10 1.63% · FED 0.08%', note: '低利率末期 · CPI 開始飆 · Fed 準備升息' },
                { label: '🌡 市場情緒', val: '科技股高點', note: 'INTC 2021 相對弱勢 · 但還沒崩' },
                { label: '🎯 當時敘事', val: '🚀 IDM 2.0 反擊', note: 'Gelsinger：「2025 拿回製程領先」· $20B 建晶圓廠' },
            ],
            events: [
                { date: '2022-01-13', label: 'Gelsinger 承諾 Foundry 業務起飛', kind: 'pos',
                  desc: '宣布建立 IFS（Intel Foundry Services）· 目標 2030 進入 Top 2 · $20B 亞利桑那晶圓廠',
                  hint: '💭 執行長換人 + 大投資策略 · 你相信 Intel 能在 3 年內超車 TSMC 嗎？' },
                { date: '2022-04-28', label: 'Q1 2022 財報 · guidance 疲弱', kind: 'neg',
                  desc: 'PC 需求下滑 · 資料中心競爭壓力 · 股價 -7%',
                  hint: '💭 新 CEO 上任 4 個月就 miss · 是「短期挑戰」還是「策略失敗」的訊號？' },
                { date: '2022-07-28', label: 'Q2 2022 財報大災難', kind: 'neg',
                  desc: '營收 -22% · EPS -80% · guidance 大砍 · 股價 -8%',
                  hint: '💭 -22% 營收下滑 · 你會停損還是逢低加碼？低估值可能是價值陷阱。' },
                { date: '2022-10-27', label: 'Q3 2022 · 削減 $10B 支出計劃', kind: 'ambig',
                  desc: '宣布未來三年削減 $10B 費用 · 裁員傳言起 · 股價短暫反彈',
                  hint: '💭 削減成本通常對股價短期有利 · 但這是否意味投資 Foundry 的錢也要縮？' },
                { date: '2023-01-26', label: 'Q4 2022 財報 · 削減股息', kind: 'neg',
                  desc: '首次削減股息（-66%）· Q4 虧損 · guidance 更悲觀 · 股價 -6%',
                  hint: '💭 Intel 幾十年首次砍息 · 這是明確的「經營壓力」訊號 · 你會怎麼看？' },
                { date: '2023-04-27', label: 'Q1 2023 · 底部訊號', kind: 'ambig',
                  desc: '營收 -36% 但股價 +7%（比預期不差）· 「底部到了」敘事開始出現',
                  hint: '💭 營收持續大跌但股價反彈 · 你相信底部到了嗎？還是死貓跳？' },
                { date: '2023-09-19', label: 'Intel Innovation · IFS 進展', kind: 'pos',
                  desc: 'Meteor Lake 展示 · IFS 拿到部分小客戶 · 股價 +3%',
                  hint: '💭 技術進展有 · 但客戶還很小 · 這算「執行順利」還是「進度太慢」？' },
                { date: '2024-01-25', label: 'Q4 2023 財報 · guidance 大 miss', kind: 'neg',
                  desc: 'Q1 2024 revenue guidance 遠低預期 · 股價 -12%',
                  hint: '💭 又一次 miss · 過去 2 年幾乎每季都失望 · 你的信心還撐得住嗎？' },
                { date: '2024-08-01', label: 'Q2 2024 · Foundry 虧 $7B', kind: 'neg',
                  desc: 'Foundry 部門虧損擴大 · 裁員 15,000 人（15% 員工）· 暫停股息 · 股價 -26% 單日',
                  hint: '💭 「-26% 單日」· 你會停損嗎？還是這是絕望性拋售的底部？' },
                { date: '2024-09-16', label: '傳言 Board 考慮分拆 Foundry', kind: 'ambig',
                  desc: '媒體報導 Board 討論分拆 Foundry · 部分投資人視為正面 · 股價 +6%',
                  hint: '💭 分拆傳言 vs 承認 IDM 2.0 策略失敗 · 你怎麼定價？' },
                { date: '2024-12-01', label: 'Gelsinger 突然離職', kind: 'neg',
                  desc: 'CEO Pat Gelsinger 被董事會逼退 · 過渡 CEO 上任 · 股價 +5%（市場覺得解脫）',
                  hint: '💭 CEO 換人通常是「策略重置」信號 · 但也可能是「沒人有解方」· 你會加碼還是繼續觀望？' },
                { date: '2025-03-12', label: '新 CEO Lip-Bu Tan 上任', kind: 'pos',
                  desc: '半導體資深高管接手 · 承諾「聚焦」· 傳言 TSMC 潛在合資 · 股價 +12%',
                  hint: '💭 新 CEO + TSMC 合資傳言 · 這是「拯救」的曙光還是「賣掉」的訊號？' },
                { date: '2026-07-06', label: '至今 · 現況檢視', kind: 'ambig',
                  desc: '所有事件都揭曉 · Intel 仍在轉型陣痛 · 股價回升但遠低於 2022 起點',
                  hint: '💭 這是你最後的決策點 · 事後看整段旅程、你學到什麼？',
                  isFinal: true },
            ],
            lessons: [
                '<b>「便宜」是可以更便宜的</b>：INTC 2022-01 PE 10x 看起來便宜 · 但市場定價的是「未來會更爛」· 事後證明市場對。<b>訓練意義</b>：低估值不代表底部 · 要看「為什麼便宜」。',
                '<b>連續 miss 是嚴重訊號</b>：Intel 2022-2024 幾乎每季 miss · 這種模式在其他股票（Cisco 2001、Nokia 2010）也出現過 · 都是「時代結束」的信號。<b>訓練意義</b>：一次 miss 是意外、連續 4 季 miss 是趨勢。',
                '<b>「新 CEO 拯救」通常太晚</b>：Gelsinger 2021 上任、2024 被換 · 中間 3 年股價 -60%。<b>訓練意義</b>：等 CEO 換人才動作、通常已錯過最佳出場點。',
                '<b>倖存者偏差對照</b>：如果你在 GOOGL 玩得很好、來 INTC 也全押 · 這個情境會讓你損失慘重。<b>同樣的「便宜科技龍頭」敘事、結果完全不同</b>——這才是投資判斷的殘酷之處。',
            ],
        },

        // ==========================================
        // META · 谷底 V 反（極端倖存者）
        // ==========================================
        META_2022: {
            id: 'META_2022',
            ticker: 'META',
            title: 'META · 谷底 V 反',
            emoji: '📱',
            subtitle: '2022-11-01 · Q3 2022 財報後 · 「Metaverse 燒錢無底洞」敘事高峰 · Zuck 失控',
            outcomeHint: '📈 極端倖存者（+700%）· 開局 $88、現在 $700+ · 但當時你會抱得住嗎？',
            startDate: '2022-11-01',
            snapshotCells: [
                { label: '🏢 公司', val: 'Meta Platforms (META)', note: 'Facebook + Instagram + WhatsApp + Reality Labs' },
                { label: '💰 估值（Q3 2022 後）', val: 'PE ~11x · PBR ~2x', note: '歷史低位 · 但市場擔心利潤率崩掉' },
                { label: '📊 Q3 2022 財報', val: '營收 -4% · EPS -49%', note: 'Reality Labs 2022 虧損 $37B · Zuck 說「持續投資」' },
                { label: '🇺🇸 總經', val: 'DGS10 4.05% · FED 3.83%', note: '升息週期高峰 · CPI 7.7% · Fed 快速升息' },
                { label: '🌡 市場情緒', val: '科技大跌年最慘', note: 'META 2022 YTD -70% · S&P 500 個股裡表現最差之一' },
                { label: '🎯 當時敘事', val: '💀 Metaverse 燒錢無底洞', note: '「Zuck 失控」· 華爾街要求他退位或砍 Reality Labs' },
            ],
            events: [
                { date: '2022-11-09', label: '大裁員 11,000 人（史上首次）', kind: 'ambig',
                  desc: 'Zuck 承認擴張過快 · 裁員 13% 員工 · 股價當日 +5%',
                  hint: '💭 Zuck 認錯 + 裁員 · 是「聽從華爾街」的正面訊號、還是「他還是要繼續燒 Reality Labs」的假動作？' },
                { date: '2023-02-01', label: 'Q4 2022 財報 · 「效率年」宣言', kind: 'pos',
                  desc: 'Zuck 宣布 2023「效率年」· 買回 $40B · 股價 +23% 單日',
                  hint: '💭 「效率年」+ 買回 · 是策略大轉向的證據？還是為了討好華爾街的話術？' },
                { date: '2023-04-26', label: 'Q1 2023 · 廣告回歸成長', kind: 'pos',
                  desc: '營收 +3%（自 2021 以來首次正成長）· Reels 廣告開始獲利 · 股價 +14%',
                  hint: '💭 廣告回歸成長 · 這是「Meta 反擊」還是「谷底反彈」？' },
                { date: '2023-07-06', label: 'Threads 上線 · 5 天破 1 億用戶', kind: 'pos',
                  desc: '對抗 Twitter · 破 App Store 紀錄 · 股價 +3%',
                  hint: '💭 Threads 起飛 · 但你相信它能維持熱度嗎？（後來確實掉了不少）' },
                { date: '2024-01-31', label: 'Q4 2023 財報 · 首次派息 + guidance 保守', kind: 'ambig',
                  desc: '首次宣布派息 · 買回 $50B · 但 Q1 guidance 略保守 · 股價當日 +20% 隔日 -3%',
                  hint: '💭 派息 = 成熟股訊號 · 但股價從 $88 到 $470 · 你會 take profit 還是繼續抱？' },
                { date: '2024-04-24', label: 'Q1 2024 · CapEx 大幅上修', kind: 'neg',
                  desc: '2024 CapEx guidance $35-40B（原本 $30-37B）· 「Metaverse 疑慮 2.0」· 股價 -16% 單日',
                  hint: '💭 CapEx 上修讓市場慌 · 這跟 2022 Reality Labs 燒錢很像 · 你會回想起「Zuck 又失控了」嗎？' },
                { date: '2024-07-31', label: 'Q2 2024 · Llama 3.1 vs GPT-4 相當', kind: 'pos',
                  desc: 'Meta AI 進展亮眼 · Llama 3.1 開源與 GPT-4 相當 · 廣告持續強 · 股價 +5%',
                  hint: '💭 Meta AI 追上 OpenAI · 但 CapEx 依然超高 · 你會不會擔心「AI 泡沫」風險？' },
                { date: '2024-09-25', label: 'Meta Connect · Ray-Ban Meta 賣爆', kind: 'pos',
                  desc: 'AR 眼鏡（Ray-Ban Meta）暢銷 · Orion 展示 · 「Metaverse 開始有實質產品」',
                  hint: '💭 2 年前燒錢的 Reality Labs 現在有實體產品 · 你會不會回頭覺得「當初 Zuck 是對的」？' },
                { date: '2025-01-29', label: 'Q4 2024 · CapEx 上修至 $65B', kind: 'ambig',
                  desc: '2025 CapEx guidance $65B（大幅上修 · AI 資本支出）· 但廣告持續超預期 · 股價 +3%',
                  hint: '💭 $65B CapEx 這麼大的數字 · 你會不會覺得「太多了」？但廣告依然超強、可以支持。' },
                { date: '2025-04-30', label: 'Q1 2025 · 廣告 + Reels 雙引擎', kind: 'pos',
                  desc: '廣告 +16% · Reels 廣告獲利率追上 Feed · 股價 +5%',
                  hint: '💭 一切順風順水 · 這時你可能 FOMO 加碼 · 但「太順」就要問「還有什麼沒發生」。' },
                { date: '2025-10-15', label: 'DOJ 反壟斷案 · Instagram 分拆討論', kind: 'neg',
                  desc: '聯邦法院進行 FTC vs Meta 反壟斷案 · 分拆 IG 討論升溫 · 股價 -8%',
                  hint: '💭 分拆風險 · 但 IG 佔營收 50%+ · 這比 GOOGL 分拆 Chrome 更嚴重 · 你會停損嗎？' },
                { date: '2026-07-06', label: '至今 · 現況檢視', kind: 'ambig',
                  desc: '所有事件都揭曉 · Meta 股價回到 $700+ · 從 $88 起算 +700%',
                  hint: '💭 事後看 · 這是最佳投資之一 · 但當時 -70% 底部你會敢重押嗎？',
                  isFinal: true },
            ],
            lessons: [
                '<b>「谷底」比你想像的深、也比你想像的短</b>：META 2022-11 $88 是谷底 · 3 個月後就 +50% · 6 個月後 +100%。<b>訓練意義</b>：如果你進場後短期沒動作 · 幾個月就完全錯過。谷底不是給你「觀察一陣子」用的。',
                '<b>「敘事錯了」的股票報酬最大</b>：Metaverse 燒錢 → Zuck 是天才、當時越多人罵、事後看越是機會。<b>訓練意義</b>：主流敘事 100% 負面時 · 通常是「敘事錯了」而不是「公司完了」。',
                '<b>CapEx 上修的兩面性</b>：2024 CapEx 上修 → 股價 -16% · 2025 CapEx 上修 → 股價 +3%。差別是「業績有沒有支撐」。<b>訓練意義</b>：同樣的 CapEx 訊號 · 要看背後的營收支不支持得住。',
                '<b>倖存者偏差對照</b>：META 從 $88 → $700+ 是極端倖存者 · 但 2022-11 那個時點你敢重押嗎？<b>如果你把 META 當「當然賺」· 你可能對每個「谷底 -70%」股票都會亂押</b>——但下一個 -70% 可能是 Enron / BABA / Zoom。',
            ],
        },

    };

    // ==========================================
    // helpers
    // ==========================================
    const $ = id => document.getElementById(id);
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const fmtPct = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(1) + '%';
    const fmtMoney = n => {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        const neg = n < 0;
        return (neg ? '-$' : '$') + Math.abs(Number(n)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url=',
    ];

    async function fetchViaProxy(url) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
        } catch (_) {}
        for (const p of CORS_PROXIES) {
            try {
                const res = await fetch(`${p}${encodeURIComponent(url)}`);
                if (res.ok) return await res.json();
            } catch (_) {}
        }
        throw new Error('直連 + 兩個 proxy 都失敗');
    }

    async function fetchYahooHistory(ticker, startDateStr) {
        const now = Math.floor(Date.now() / 1000);
        // 提前抓一年 · 避開起始日剛好非交易日
        const startDate = new Date(startDateStr);
        startDate.setFullYear(startDate.getFullYear() - 1);
        const start = Math.floor(startDate.getTime() / 1000);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${now}&interval=1d`;
        const data = await fetchViaProxy(url);
        if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) {
            throw new Error('Yahoo 回傳格式異常');
        }
        const r = data.chart.result[0];
        const ts = r.timestamp || [];
        const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
        return ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            price: closes[i],
        })).filter(p => p.price !== null && isFinite(p.price));
    }

    function findPriceOnOrAfter(prices, dateStr) {
        for (const p of prices) if (p.date >= dateStr) return p;
        return prices[prices.length - 1];
    }

    // ==========================================
    // Game State
    // ==========================================
    let priceSeries = null;
    let scenario = null;   // current scenario
    const game = {
        base: BASE_CAPITAL,
        startDate: null,
        startPrice: null,
        cash: BASE_CAPITAL,
        shares: 0,
        currentEventIdx: 0,
        currentDate: null,
        currentPrice: null,
        prevPrice: null,
        decisions: [],
        initialPct: 20,
        lastTargetPct: 0,        // 上次「主動 rebalance」的目標 %
        lastTargetDate: null,    // 上次主動 rebalance 的日期
        lastTargetPrice: null,   // 上次主動 rebalance 時的股價
    };

    function currentTotalValue() {
        return game.cash + game.shares * game.currentPrice;
    }

    function currentPositionPct() {
        const total = currentTotalValue();
        if (total <= 0) return 0;
        return (game.shares * game.currentPrice) / total * 100;
    }

    function rebalanceToTargetPct(targetPct) {
        const total = currentTotalValue();
        const targetStockValue = total * (targetPct / 100);
        const targetShares = targetStockValue / game.currentPrice;
        const deltaShares = targetShares - game.shares;
        const deltaCash = -deltaShares * game.currentPrice;

        game.shares = targetShares;
        game.cash += deltaCash;

        let action = '持平';
        if (deltaShares > 0.001) action = `買 ${deltaShares.toFixed(1)} 股（$${Math.abs(deltaCash).toLocaleString(undefined, {maximumFractionDigits: 0})}）`;
        else if (deltaShares < -0.001) action = `賣 ${Math.abs(deltaShares).toFixed(1)} 股（回收 $${Math.abs(deltaCash).toLocaleString(undefined, {maximumFractionDigits: 0})}）`;

        return { action, deltaShares, deltaCash };
    }

    // ==========================================
    // Scenario selector
    // ==========================================
    function renderScenarioSelector() {
        const grid = $('scenario-grid');
        grid.innerHTML = Object.values(SCENARIOS).map(s => `
            <div class="scenario-card" data-scenario-id="${s.id}">
                <div class="scenario-emoji">${s.emoji}</div>
                <div class="scenario-title">${s.title}</div>
                <div class="scenario-subtitle">${s.subtitle}</div>
                <div class="scenario-outcome">${s.outcomeHint}</div>
                <button class="btn-scenario-select">選這個情境 →</button>
            </div>
        `).join('');
        grid.querySelectorAll('.scenario-card').forEach(card => {
            card.addEventListener('click', () => selectScenario(card.getAttribute('data-scenario-id')));
        });
    }

    async function selectScenario(id) {
        scenario = SCENARIOS[id];
        if (!scenario) return;

        // hide selector · show snapshot + start position panels
        $('scenario-selector-panel').hidden = true;
        $('snapshot-panel').hidden = false;
        $('decision-sim-panel').hidden = false;

        // update snapshot content
        $('snapshot-title').textContent = `📸 快照 · ${scenario.startDate} 你看到的資訊`;
        $('snapshot-subtitle').innerHTML = `這是 ${scenario.startDate} 那天 <b>${scenario.ticker}</b> 的實際狀態 · 之後的事情你都<b>不知道</b>。`;

        // update grid
        $('sim-snapshot-grid').innerHTML = scenario.snapshotCells.map(c => `
            <div class="snap-cell">
                <div class="snap-label">${c.label}</div>
                <div class="snap-val">${c.val}</div>
                <div class="snap-note">${c.note}</div>
            </div>
        `).join('');

        // update start position panel h2
        const startH2 = $('decision-sim-panel').querySelector('h2');
        if (startH2) startH2.textContent = `🎯 起始部位 · 你要投入多少 % 買 ${scenario.ticker}？`;

        // scroll to snapshot
        setTimeout(() => $('snapshot-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

        // fetch prices
        await initPriceForScenario();
    }

    async function initPriceForScenario() {
        const el = $('sim-price-panel');
        el.innerHTML = `<div class="sim-loading">📡 抓 ${scenario.ticker} 歷史股價中……</div>`;
        try {
            priceSeries = await fetchYahooHistory(scenario.ticker, scenario.startDate);
            const startEntry = findPriceOnOrAfter(priceSeries, scenario.startDate);
            game.startDate = startEntry.date;
            game.startPrice = startEntry.price;
            el.innerHTML = `
                <div class="sim-price-tile">
                    <div class="sim-price-label">${scenario.ticker} 股價 @ ${startEntry.date}</div>
                    <div class="sim-price-val">${fmtMoney(startEntry.price)}</div>
                    <div class="sim-price-note">分割調整後 · Yahoo Finance</div>
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="sim-error">❌ 抓 Yahoo 失敗：${e.message}<br>可能是 CORS proxy 被 throttle · 重載試試</div>`;
        }
    }

    function backToSelector() {
        // reset game state
        priceSeries = null;
        scenario = null;
        Object.assign(game, {
            cash: BASE_CAPITAL,
            shares: 0,
            currentEventIdx: 0,
            decisions: [],
            startPrice: null,
            startDate: null,
            currentDate: null,
            currentPrice: null,
            prevPrice: null,
        });
        // reset panels
        $('scenario-selector-panel').hidden = false;
        $('snapshot-panel').hidden = true;
        $('decision-sim-panel').hidden = true;
        $('game-panel').hidden = true;
        $('postmortem-panel').hidden = true;
        setTimeout(() => $('scenario-selector-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }

    // ==========================================
    // Game loop
    // ==========================================
    function startGame(initialPct) {
        if (!priceSeries || !game.startPrice) return;
        game.initialPct = initialPct;

        // 整數股：買入 floor((base * initialPct%) / startPrice) 股 · 剩下留現金
        const targetSpend = game.base * (initialPct / 100);
        game.shares = Math.floor(targetSpend / game.startPrice);
        game.cash = game.base - game.shares * game.startPrice;
        game.currentDate = game.startDate;
        game.currentPrice = game.startPrice;
        game.prevPrice = null;
        game.currentEventIdx = 0;
        game.decisions = [];
        game.lastTargetPct = currentPositionPct();
        game.lastTargetDate = game.startDate;
        game.lastTargetPrice = game.startPrice;

        game.decisions.push({
            date: game.startDate,
            event: `🎬 起始建倉 · 買 ${game.shares} 股`,
            price: game.startPrice,
            oldPct: 0,
            newPct: game.lastTargetPct,
            totalValue: currentTotalValue(),
            action: `買入 ${game.shares} 股 · 剩餘現金 ${fmtMoney(game.cash)}`,
        });

        $('snapshot-panel').hidden = true;
        $('decision-sim-panel').hidden = true;
        $('game-panel').hidden = false;

        advanceToEvent(0);
    }

    function advanceToEvent(idx) {
        if (idx >= scenario.events.length) {
            endGame();
            return;
        }
        const ev = scenario.events[idx];
        game.currentEventIdx = idx;
        game.prevPrice = game.currentPrice;
        const entry = findPriceOnOrAfter(priceSeries, ev.date);
        game.currentDate = entry.date;
        game.currentPrice = entry.price;

        renderGameStep(ev);
    }

    function renderGameStep(ev) {
        const totalSteps = scenario.events.length;
        const stepNum = game.currentEventIdx + 1;
        $('game-step').textContent = stepNum;
        $('game-title').innerHTML = `🎮 ${scenario.ticker} · 事件 <span id="game-step">${stepNum}</span> / ${totalSteps}`;
        $('game-progress-bar').style.width = `${(stepNum / totalSteps) * 100}%`;

        const kindLabel = ev.kind === 'pos' ? '📈 看多' : ev.kind === 'neg' ? '📉 看空' : '⚖ 曖昧';
        const kindClass = ev.kind === 'pos' ? 'ev-pos' : ev.kind === 'neg' ? 'ev-neg' : 'ev-ambig';
        const priceDelta = game.prevPrice
            ? (game.currentPrice - game.prevPrice) / game.prevPrice
            : (game.currentPrice - game.startPrice) / game.startPrice;
        const priceDeltaLabel = game.prevPrice ? '距上個事件' : '距起始';
        const priceDeltaCls = priceDelta >= 0 ? 'delta-pos' : 'delta-neg';
        const priceDeltaTxt = (priceDelta >= 0 ? '+' : '') + fmtPct(priceDelta);

        $('event-card').innerHTML = `
            <div class="event-header ${kindClass}">
                <div class="event-date">📅 ${ev.date}</div>
                <div class="event-kind">${kindLabel}</div>
            </div>
            <div class="event-title">${ev.label}</div>
            <div class="event-desc">${ev.desc}</div>
            <div class="event-price-row">
                <div class="event-price-cell">
                    <div class="event-price-label">當時 ${scenario.ticker} 股價</div>
                    <div class="event-price-val">${fmtMoney(game.currentPrice)}</div>
                    <div class="event-price-delta ${priceDeltaCls}">${priceDeltaLabel} ${priceDeltaTxt}</div>
                </div>
                <div class="event-hint">${ev.hint || ''}</div>
            </div>
        `;

        const total = currentTotalValue();
        const stockValue = game.shares * game.currentPrice;
        const posPct = currentPositionPct();
        const totalRet = (total - game.base) / game.base;
        const totalRetCls = totalRet >= 0 ? 'delta-pos' : 'delta-neg';

        // 部位漂移說明：目前 % vs 上次主動目標 %
        const driftPp = posPct - game.lastTargetPct;
        let driftNote = '';
        if (Math.abs(driftPp) < 0.5) {
            driftNote = `<div class="pf-drift">🎯 剛好在上次目標 ${game.lastTargetPct.toFixed(0)}%</div>`;
        } else {
            const priceChg = game.lastTargetPrice ? (game.currentPrice - game.lastTargetPrice) / game.lastTargetPrice : 0;
            const priceChgTxt = (priceChg >= 0 ? '+' : '') + fmtPct(priceChg);
            const driftCls = driftPp > 0 ? 'drift-up' : 'drift-down';
            driftNote = `<div class="pf-drift ${driftCls}">
                📐 上次調到 <b>${game.lastTargetPct.toFixed(0)}%</b>（${game.lastTargetDate}）· 之後股價 ${priceChgTxt} → 漂到 <b>${posPct.toFixed(0)}%</b>
                <small>股數沒變、只是市值漂移</small>
            </div>`;
        }

        $('portfolio-state').innerHTML = `
            <div class="pf-grid">
                <div class="pf-cell">
                    <div class="pf-label">💵 現金</div>
                    <div class="pf-val">${fmtMoney(game.cash)}</div>
                </div>
                <div class="pf-cell">
                    <div class="pf-label">📈 ${scenario.ticker} 股票</div>
                    <div class="pf-val">${fmtMoney(stockValue)}</div>
                    <div class="pf-sub">${game.shares} 股 × ${fmtMoney(game.currentPrice)}</div>
                </div>
                <div class="pf-cell pf-total">
                    <div class="pf-label">💼 總資產</div>
                    <div class="pf-val">${fmtMoney(total)}</div>
                    <div class="pf-sub ${totalRetCls}">${totalRet >= 0 ? '+' : ''}${fmtPct(totalRet)} vs $100k 起始</div>
                </div>
                <div class="pf-cell">
                    <div class="pf-label">📊 目前部位</div>
                    <div class="pf-val">${posPct.toFixed(0)}%</div>
                    <div class="pf-sub">股票 / 總資產</div>
                </div>
            </div>
            ${driftNote}
        `;

        // 配置 share-delta slider 的範圍
        const maxBuy = Math.floor(game.cash / game.currentPrice);
        const maxSell = Math.floor(game.shares);
        const slider = $('pos-target');
        slider.min = -maxSell;
        slider.max = maxBuy;
        slider.step = 1;
        slider.value = 0;   // 每個新事件預設 = 維持現有
        $('share-delta-min').textContent = `最多賣 ${maxSell} 股`;
        $('share-delta-max').textContent = `最多買 ${maxBuy} 股`;
        updateDeltaPreview();

        renderDecisionLog();
    }

    function updateDeltaPreview() {
        const deltaShares = parseInt($('pos-target').value) || 0;
        const currentPct = currentPositionPct();
        const price = game.currentPrice;
        const cost = deltaShares * price;   // 正=買入花費、負=賣出回收

        const newShares = game.shares + deltaShares;
        const newCash = game.cash - cost;
        const newTotal = newCash + newShares * price;
        const newPct = newTotal > 0 ? (newShares * price / newTotal) * 100 : 0;

        // 更新 slider 中央文字
        let deltaLabel;
        if (deltaShares === 0) deltaLabel = '0 股（維持）';
        else if (deltaShares > 0) deltaLabel = `+${deltaShares} 股（買入）`;
        else deltaLabel = `${deltaShares} 股（賣出）`;
        $('share-delta-val').textContent = deltaLabel;

        let msg, cls, btnLabel, btnCls;
        if (deltaShares === 0) {
            msg = `✋ 維持現有 ${game.shares} 股 · 不做任何買賣（目前部位 ${currentPct.toFixed(1)}%）`;
            cls = 'preview-hold';
            btnLabel = `✋ 維持現有 ${game.shares} 股 · 進到下一個事件`;
            btnCls = 'btn-hold';
        } else if (deltaShares > 0) {
            if (cost > game.cash + 0.01) {
                const maxAffordable = Math.floor(game.cash / price);
                msg = `⚠ 現金不夠 · 你只有 ${fmtMoney(game.cash)} · 最多買 ${maxAffordable} 股（想買 ${deltaShares} 股要 ${fmtMoney(cost)}）`;
                cls = 'preview-warn';
                btnLabel = `⚠ 現金不足 · 最多買 ${maxAffordable} 股`;
                btnCls = 'btn-warn';
            } else {
                msg = `📈 買 ${deltaShares} 股 · 花 ${fmtMoney(cost)}（現金 ${fmtMoney(game.cash)} → ${fmtMoney(newCash)}）· 部位 ${currentPct.toFixed(1)}% → ${newPct.toFixed(1)}%`;
                cls = 'preview-buy';
                btnLabel = `📈 買 ${deltaShares} 股 · 進到下一個事件`;
                btnCls = 'btn-buy';
            }
        } else {
            const sellShares = -deltaShares;
            const proceeds = -cost;
            msg = `📉 賣 ${sellShares} 股 · 回收 ${fmtMoney(proceeds)}（現金 ${fmtMoney(game.cash)} → ${fmtMoney(newCash)}）· 部位 ${currentPct.toFixed(1)}% → ${newPct.toFixed(1)}%`;
            cls = 'preview-sell';
            btnLabel = `📉 賣 ${sellShares} 股 · 進到下一個事件`;
            btnCls = 'btn-sell';
        }
        const el = $('pos-delta-preview');
        el.className = `pos-delta-preview ${cls}`;
        el.textContent = msg;

        const btn = $('btn-confirm-decision');
        if (btn) {
            btn.textContent = btnLabel;
            btn.className = btnCls;
        }
    }

    function renderDecisionLog() {
        const tbl = $('decision-log-table');
        tbl.innerHTML = `<tr><th>日期</th><th>事件</th><th>股價</th><th>買賣</th><th>總資產</th></tr>`;
        game.decisions.forEach(d => {
            const tr = document.createElement('tr');
            let actionTxt;
            if (d.deltaShares === undefined) {
                // 起始建倉
                actionTxt = `🎬 建倉 ${d.sharesAfter || ''} 股`;
            } else if (d.deltaShares === 0) {
                actionTxt = `✋ 持平（${d.sharesAfter} 股）`;
            } else if (d.deltaShares > 0) {
                actionTxt = `📈 買 ${d.deltaShares} 股 → ${d.sharesAfter} 股`;
            } else {
                actionTxt = `📉 賣 ${Math.abs(d.deltaShares)} 股 → ${d.sharesAfter} 股`;
            }
            tr.innerHTML = `
                <td>${d.date}</td>
                <td>${d.event}</td>
                <td>${fmtMoney(d.price)}</td>
                <td>${actionTxt}<br><small>部位 ${d.oldPct.toFixed(0)}% → ${d.newPct.toFixed(0)}%</small></td>
                <td>${fmtMoney(d.totalValue)}</td>
            `;
            tbl.appendChild(tr);
        });
    }

    function confirmDecision() {
        let deltaShares = parseInt($('pos-target').value) || 0;
        const ev = scenario.events[game.currentEventIdx];
        const oldPct = currentPositionPct();
        const price = game.currentPrice;

        let action;
        if (deltaShares === 0) {
            action = '✋ 持平 · 不做任何買賣';
        } else if (deltaShares > 0) {
            // Cap by cash
            const maxAffordable = Math.floor(game.cash / price);
            if (deltaShares > maxAffordable) deltaShares = maxAffordable;
            const cost = deltaShares * price;
            game.shares += deltaShares;
            game.cash -= cost;
            action = `📈 買 ${deltaShares} 股（花 ${fmtMoney(cost)}）`;
            game.lastTargetPct = currentPositionPct();
            game.lastTargetDate = ev.date;
            game.lastTargetPrice = price;
        } else {
            const sellShares = Math.min(-deltaShares, game.shares);
            const proceeds = sellShares * price;
            game.shares -= sellShares;
            game.cash += proceeds;
            action = `📉 賣 ${sellShares} 股（回收 ${fmtMoney(proceeds)}）`;
            game.lastTargetPct = currentPositionPct();
            game.lastTargetDate = ev.date;
            game.lastTargetPrice = price;
        }

        game.decisions.push({
            date: ev.date,
            event: ev.label,
            price: game.currentPrice,
            oldPct: oldPct,
            newPct: currentPositionPct(),
            sharesAfter: game.shares,
            deltaShares: deltaShares,
            totalValue: currentTotalValue(),
            action,
        });

        advanceToEvent(game.currentEventIdx + 1);

        setTimeout(() => {
            const gp = $('game-panel');
            if (gp) gp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    // ==========================================
    // Postmortem
    // ==========================================
    function endGame() {
        $('game-panel').hidden = true;
        $('postmortem-panel').hidden = false;
        renderPostmortem();
        setTimeout(() => {
            const pm = $('postmortem-panel');
            if (pm) pm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    function renderPostmortem() {
        const finalTotal = currentTotalValue();
        const totalRet = (finalTotal - game.base) / game.base;

        const endPrice = game.currentPrice;
        const buyHoldRet = (endPrice - game.startPrice) / game.startPrice;
        const buyHoldInitialFinal = game.base * (1 + buyHoldRet * (game.initialPct / 100));
        const buyHoldAllInFinal = game.base * (1 + buyHoldRet);
        const buyHoldHalfFinal = game.base * (1 + buyHoldRet * 0.5);

        const totalDecisions = game.decisions.length;
        const nonHoldDecisions = game.decisions.filter((d, i) => {
            if (i === 0) return false;
            return d.deltaShares !== 0 && d.deltaShares !== undefined;
        }).length;

        const startIdx = priceSeries.findIndex(p => p.date >= game.startDate);
        const endIdx = priceSeries.findIndex(p => p.date >= game.currentDate);
        const period = priceSeries.slice(startIdx, endIdx >= 0 ? endIdx + 1 : priceSeries.length);
        let peak = -Infinity, maxDD = 0;
        for (const p of period) {
            if (p.price > peak) peak = p.price;
            const dd = (peak - p.price) / peak;
            if (dd > maxDD) maxDD = dd;
        }

        const yourVsInitialHold = finalTotal - buyHoldInitialFinal;
        const yourVsAllIn = finalTotal - buyHoldAllInFinal;

        const decisionLogHtml = game.decisions.map((d, i) => {
            let deltaCls, actionTxt;
            if (d.deltaShares === undefined) {
                deltaCls = 'pm-buy';
                actionTxt = `🎬 建倉 ${d.sharesAfter || ''} 股`;
            } else if (d.deltaShares === 0) {
                deltaCls = 'pm-hold';
                actionTxt = `✋ 持平（${d.sharesAfter} 股）`;
            } else if (d.deltaShares > 0) {
                deltaCls = 'pm-buy';
                actionTxt = `📈 買 ${d.deltaShares} → ${d.sharesAfter} 股`;
            } else {
                deltaCls = 'pm-sell';
                actionTxt = `📉 賣 ${Math.abs(d.deltaShares)} → ${d.sharesAfter} 股`;
            }
            return `
                <tr class="${deltaCls}">
                    <td>${i}</td>
                    <td>${d.date}</td>
                    <td>${d.event}</td>
                    <td>${fmtMoney(d.price)}</td>
                    <td>${actionTxt}<br><small>部位 ${d.oldPct.toFixed(0)}% → ${d.newPct.toFixed(0)}%</small></td>
                    <td>${fmtMoney(d.totalValue)}</td>
                </tr>
            `;
        }).join('');

        const lessonsHtml = scenario.lessons.map(l => `<li>${l}</li>`).join('');

        $('postmortem-body').innerHTML = `
            <div class="pm-section">
                <h3>📊 ${scenario.ticker} 情境 · 你的最終結果</h3>
                <table class="pm-table">
                    <tr><th>情境</th><td>${scenario.title}</td></tr>
                    <tr><th>起始資金</th><td>${fmtMoney(game.base)}</td></tr>
                    <tr><th>起始部位</th><td>${game.initialPct}%</td></tr>
                    <tr><th>期間</th><td>${game.startDate} → ${game.currentDate}</td></tr>
                    <tr><th>${scenario.ticker} Buy & Hold 表現</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${buyHoldRet >= 0 ? '+' : ''}${fmtPct(buyHoldRet)}</td></tr>
                    <tr><th>總決策次數</th><td>${totalDecisions}（其中 ${nonHoldDecisions} 次調整、${totalDecisions - nonHoldDecisions - 1} 次持平）</td></tr>
                    <tr><th>最終總資產</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtMoney(finalTotal)}</b></td></tr>
                    <tr><th>總報酬率</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${totalRet >= 0 ? '+' : ''}${fmtPct(totalRet)}</b></td></tr>
                    <tr><th>期間最大回撤</th><td class="pm-neg">-${fmtPct(maxDD)}</td></tr>
                </table>
            </div>

            <div class="pm-section">
                <h3>🎲 反事實 · 「如果我不做調整會怎樣？」</h3>
                <table class="pm-table">
                    <tr><th>你的實際結果（${totalDecisions - 1} 次調整）</th><td class="${totalRet >= 0 ? 'pm-pos' : 'pm-neg'}"><b>${fmtMoney(finalTotal)}</b></td></tr>
                    <tr><th>Buy & Hold ${game.initialPct}%（起始就買 · 之後全部持平）</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldInitialFinal)} <small>（差 ${yourVsInitialHold >= 0 ? '+' : ''}${fmtMoney(yourVsInitialHold)}）</small></td></tr>
                    <tr><th>Buy & Hold 50%</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldHalfFinal)}</td></tr>
                    <tr><th>Buy & Hold 100% All-in</th><td class="${buyHoldRet >= 0 ? 'pm-pos' : 'pm-neg'}">${fmtMoney(buyHoldAllInFinal)} <small>（差 ${yourVsAllIn >= 0 ? '+' : ''}${fmtMoney(yourVsAllIn)}）</small></td></tr>
                </table>
                <p class="hint hint-mini">
                    ${yourVsInitialHold >= 0
                        ? `📌 <b>你的主動調整加了 ${fmtMoney(yourVsInitialHold)} 價值</b>——比純持有 ${game.initialPct}% 好。<b>但要問：這是 skill 還是 luck？</b>去試另一支對照組情境驗證。`
                        : `📌 <b>你的主動調整少賺 ${fmtMoney(Math.abs(yourVsInitialHold))}</b>——比純持有 ${game.initialPct}% 差。<b>典型症狀</b>：在恐慌事件減碼、之後市場反彈沒能追回。這段期間主動交易普遍打不過 buy-and-hold。`
                    }
                </p>
            </div>

            <div class="pm-section">
                <h3>📋 你的完整決策紀錄</h3>
                <table class="fund-table pm-decision-table">
                    <tr><th>#</th><th>日期</th><th>事件</th><th>股價</th><th>調整</th><th>總資產</th></tr>
                    ${decisionLogHtml}
                </table>
            </div>

            <div class="pm-section">
                <h3>💡 ${scenario.ticker} 情境的隱含教訓</h3>
                <ul class="pm-lessons">${lessonsHtml}</ul>
            </div>

            <div class="pm-section">
                <h3>🎯 對抗倖存者偏差 · 下一個情境</h3>
                <p class="hint">
                    <b>核心訓練意義</b>：只跑一個情境 · 你不知道自己是「有 skill」還是「這支剛好順」。<b>去跑另一個情境驗證判斷</b>：
                </p>
                <ul class="pm-lessons">
                    ${Object.values(SCENARIOS).filter(s => s.id !== scenario.id).map(s => `
                        <li><b>${s.emoji} ${s.title}</b>：${s.subtitle}<br><small>${s.outcomeHint}</small></li>
                    `).join('')}
                </ul>
                <div class="btn-row" style="margin-top: 16px;">
                    <button id="btn-postmortem-back">🔄 換情境訓練</button>
                    <a href="./index.html" class="btn-link">← 回估值分析器</a>
                </div>
            </div>
        `;

        // wire up the button after render
        const btn = $('btn-postmortem-back');
        if (btn) btn.addEventListener('click', backToSelector);
    }

    // ==========================================
    // Handlers
    // ==========================================
    function initHandlers() {
        const pos = $('sim-pos');
        const posVal = $('sim-pos-val');
        pos.addEventListener('input', () => {
            posVal.textContent = pos.value + '%';
        });

        $('btn-start-game').addEventListener('click', () => {
            if (!priceSeries) {
                alert('股價還沒抓完 · 等一下再點');
                return;
            }
            startGame(parseInt(pos.value) || 20);
        });

        $('btn-back-to-selector').addEventListener('click', backToSelector);

        const target = $('pos-target');
        target.addEventListener('input', updateDeltaPreview);

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                const price = game.currentPrice;
                let deltaShares = 0;
                if (preset === 'hold') deltaShares = 0;
                else if (preset === 'sell-all') deltaShares = -Math.floor(game.shares);
                else if (preset === 'sell-half') deltaShares = -Math.floor(game.shares / 2);
                else if (preset === 'buy-half-cash') deltaShares = Math.floor((game.cash * 0.5) / price);
                else if (preset === 'buy-all-cash') deltaShares = Math.floor(game.cash / price);
                // Clamp to slider range
                const slider = $('pos-target');
                deltaShares = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), deltaShares));
                slider.value = deltaShares;
                updateDeltaPreview();
            });
        });

        $('btn-confirm-decision').addEventListener('click', confirmDecision);
    }

    // ==========================================
    // Init
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderScenarioSelector();
            initHandlers();
        });
    } else {
        renderScenarioSelector();
        initHandlers();
    }
})();
