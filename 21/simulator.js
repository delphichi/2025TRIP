(function () {
    'use strict';

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toFixed(d);
    const $ = id => document.getElementById(id);

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---------- 21 點 / Hi-Lo 核心數學 ----------
    // rank: 2-14 where 11=J, 12=Q, 13=K, 14=A
    // Hi-Lo: 2-6 → +1、7-9 → 0、10-A → -1
    function hiLoValue(rank) {
        if (rank >= 2 && rank <= 6) return 1;
        if (rank >= 7 && rank <= 9) return 0;
        return -1;
    }

    function rankLabel(rank) {
        if (rank === 11) return 'J';
        if (rank === 12) return 'Q';
        if (rank === 13) return 'K';
        if (rank === 14) return 'A';
        return String(rank);
    }

    // 產生 N 副牌的 shoe
    function createShoe(numDecks) {
        const cards = [];
        const suits = ['♠', '♥', '♦', '♣'];
        for (let d = 0; d < numDecks; d++) {
            for (const suit of suits) {
                for (let r = 2; r <= 14; r++) {
                    cards.push({ rank: r, suit, label: rankLabel(r) });
                }
            }
        }
        return shuffle(cards);
    }

    // 隨機下次問答間隔 4-8 張，避免玩家抓到節奏
    // 訓練「持續追蹤 count」而非「知道下一題快來所以臨時算」
    function nextQuizInterval(baseInterval) {
        // baseInterval = 5 → 隨機 4-8；baseInterval = 8 → 隨機 6-12
        const min = Math.max(3, Math.floor(baseInterval * 0.7));
        const max = Math.ceil(baseInterval * 1.5);
        return randInt(min, max);
    }

    // ---------- ShoeState：牌堆狀態管理 ----------
    class ShoeState {
        constructor(numDecks, penetrationPct = 0.75) {
            this.numDecks = numDecks;
            this.totalCards = numDecks * 52;
            this.deck = createShoe(numDecks);
            this.dealt = [];
            this.runningCount = 0;
            // 切牌位置：發完這麼多張後這一 shoe 結束（賭場會洗牌）
            this.cutAt = Math.floor(this.totalCards * penetrationPct);
        }

        dealCard() {
            if (this.isDone()) return null;
            const card = this.deck.pop();
            card.hiLo = hiLoValue(card.rank);
            this.dealt.push(card);
            this.runningCount += card.hiLo;
            return card;
        }

        isDone() {
            return this.dealt.length >= this.cutAt;
        }

        cardsRemaining() {
            return this.totalCards - this.dealt.length;
        }

        decksRemaining() {
            return this.cardsRemaining() / 52;
        }

        // True Count = Running Count / 剩餘副數
        // 剩餘 < 0.25 副時直接回傳 running（除法會失真）
        getTrueCount() {
            const decksLeft = this.decksRemaining();
            if (decksLeft < 0.25) return this.runningCount;
            return this.runningCount / decksLeft;
        }

        // 玩家優勢（%）= True Count × 0.5% - 莊家基礎優勢
        getPlayerEdge(houseBaseEdge = 0.005) {
            return this.getTrueCount() * 0.005 - houseBaseEdge;
        }
    }

    // ---------- CountTrainingSession：一次練習的完整流程 ----------
    class CountTrainingSession {
        constructor(numDecks, penetration, quizInterval) {
            this.shoe = new ShoeState(numDecks, penetration);
            this.numDecks = numDecks;
            this.penetration = penetration;
            this.baseInterval = quizInterval;
            this.cardsSinceLastQuiz = 0;
            this.nextQuizAt = nextQuizInterval(quizInterval);
            this.quizLog = [];   // 每次問答的完整紀錄
            this.lastQuizCardIdx = 0;
        }

        // 發下一張牌，回傳 { card, shouldQuiz }
        dealNext() {
            const card = this.shoe.dealCard();
            if (!card) return { card: null, shouldQuiz: false };
            this.cardsSinceLastQuiz += 1;
            const shouldQuiz = this.cardsSinceLastQuiz >= this.nextQuizAt;
            return { card, shouldQuiz };
        }

        // 記錄玩家答題結果
        recordQuiz(playerGuess) {
            const correctCount = this.shoe.runningCount;
            const correctTrueCount = this.shoe.getTrueCount();
            const error = playerGuess - correctCount;
            const cardsShownThisRound = this.shoe.dealt.length - this.lastQuizCardIdx;
            const roundCards = this.shoe.dealt.slice(this.lastQuizCardIdx);
            const quiz = {
                quizIdx: this.quizLog.length,
                cardsShown: this.shoe.dealt.length,
                cardsThisRound: cardsShownThisRound,
                roundCards,
                playerGuess,
                correctCount,
                correctTrueCount,
                error,
                absError: Math.abs(error),
                correct: error === 0,
                closeEnough: Math.abs(error) <= 1,
            };
            this.quizLog.push(quiz);
            // 重置計數器 + 抽下次間隔
            this.cardsSinceLastQuiz = 0;
            this.nextQuizAt = nextQuizInterval(this.baseInterval);
            this.lastQuizCardIdx = this.shoe.dealt.length;
            return quiz;
        }
    }

    // ---------- 分析 session（對照 bakery 的 analyzeRun） ----------
    function analyzeSession(session) {
        const log = session.quizLog;
        if (log.length === 0) return null;

        const totalQuizzes = log.length;
        const correctCount = log.filter(q => q.correct).length;
        const closeCount = log.filter(q => q.closeEnough).length;
        const overallAccuracy = correctCount / totalQuizzes;
        const closeAccuracy = closeCount / totalQuizzes;
        const avgAbsError = log.reduce((s, q) => s + q.absError, 0) / totalQuizzes;
        const avgSignedError = log.reduce((s, q) => s + q.error, 0) / totalQuizzes;

        // 前半 vs 後半 —— 有沒有進步
        const half = Math.max(1, Math.floor(totalQuizzes / 2));
        const early = log.slice(0, half);
        const late = log.slice(half);
        const earlyAcc = early.filter(q => q.correct).length / early.length;
        const lateAcc = late.length > 0 ? late.filter(q => q.correct).length / late.length : null;

        // 錯最離譜的一次
        const worstQuiz = log.reduce((worst, q) => q.absError > worst.absError ? q : worst, log[0]);

        // 系統性偏差：avgSignedError > 0 = 一直高估、< 0 = 一直低估
        const biasVerdict = Math.abs(avgSignedError) < 0.3 ? 'balanced'
            : avgSignedError > 0 ? 'over' : 'under';

        return {
            totalQuizzes, correctCount, closeCount,
            overallAccuracy, closeAccuracy,
            avgAbsError, avgSignedError, biasVerdict,
            earlyAcc, lateAcc,
            improving: lateAcc !== null && lateAcc > earlyAcc + 0.1,
            worstQuiz,
            finalRunning: session.shoe.runningCount,
            finalTrue: session.shoe.getTrueCount(),
            totalDealt: session.shoe.dealt.length,
        };
    }

    // ---------- 優勢預估（設定面板用） ----------
    // 用「簡化 EV 公式」估算：max true count 天花板 → 玩家可達的最好優勢
    function estimateEdgePreview(numDecks, penetration) {
        const totalCards = numDecks * 52;
        const cardsBeforeCut = totalCards * penetration;
        const cardsAtCut = totalCards - cardsBeforeCut;
        const decksAtCut = cardsAtCut / 52;
        // 隨機游走：最大偏差 ~ sqrt(cards) × 0.5
        const maxRunningEstimate = Math.sqrt(cardsBeforeCut) * 0.5;
        const maxTrueCount = decksAtCut > 0.25 ? maxRunningEstimate / decksAtCut : maxRunningEstimate;
        const maxEdge = maxTrueCount * 0.005 - 0.005;   // 減去莊家基礎優勢
        return { maxTrueCount, maxEdgePct: maxEdge * 100 };
    }

    // ---------- UI 狀態 ----------
    let session = null;
    let dealTimer = null;
    let dealMs = 800;
    let paused = false;
    let revealCounters = false;
    let trainingWheels = false;

    // ---------- Renderers ----------
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function renderCard(card, isNewest) {
        const isRed = card.suit === '♥' || card.suit === '♦';
        const div = el('div', 'card ' + (isRed ? 'red' : 'black') + (isNewest ? ' newest' : ''));
        div.appendChild(el('div', 'rank', card.label));
        div.appendChild(el('div', 'suit', card.suit));
        // 訓練輪：顯示 Hi-Lo 值
        if (trainingWheels) {
            const hlClass = card.hiLo > 0 ? 'plus' : card.hiLo < 0 ? 'neg' : 'zero';
            const hlText = card.hiLo > 0 ? '+1' : card.hiLo < 0 ? '−1' : '0';
            const hl = el('div', 'hilo ' + hlClass, hlText);
            div.appendChild(hl);
        }
        return div;
    }

    function appendCard(card) {
        const area = $('cards-area');
        // 移除 empty placeholder
        const empty = area.querySelector('.cards-empty');
        if (empty) empty.remove();
        // 舊 newest 標記移除
        const oldNewest = area.querySelector('.card.newest');
        if (oldNewest) oldNewest.classList.remove('newest');
        area.appendChild(renderCard(card, true));
        area.scrollLeft = area.scrollWidth;
    }

    function updateShoeStats() {
        if (!session) return;
        const shoe = session.shoe;
        $('stat-shoe').textContent = `${shoe.numDecks} 副 · ${(session.penetration * 100).toFixed(0)}%`;
        $('stat-progress').textContent = `${shoe.dealt.length} / ${shoe.cutAt}`;
        $('stat-remaining').textContent = `${shoe.cardsRemaining()} 張 · ${shoe.decksRemaining().toFixed(1)} 副`;

        // 三個「可隱藏」的計數欄位
        const cells = document.querySelectorAll('.stat-cell.reveal');
        cells.forEach(c => c.classList.toggle('hidden', !revealCounters));

        if (revealCounters) {
            $('stat-running').textContent = (shoe.runningCount > 0 ? '+' : '') + shoe.runningCount;
            $('stat-true').textContent = fmt(shoe.getTrueCount(), 2);
            const edgePct = shoe.getPlayerEdge() * 100;
            $('stat-edge').textContent = (edgePct >= 0 ? '+' : '') + fmt(edgePct, 2) + '%';
        }
    }

    // ---------- Deal loop ----------
    function scheduleNextDeal() {
        if (dealTimer) clearTimeout(dealTimer);
        if (paused || !session || session.shoe.isDone()) return;
        dealTimer = setTimeout(dealOneCard, dealMs);
    }

    function dealOneCard() {
        if (!session || paused) return;
        const { card, shouldQuiz } = session.dealNext();
        if (!card) {
            endShoe();
            return;
        }
        appendCard(card);
        updateShoeStats();
        if (shouldQuiz) {
            askQuestion();
        } else {
            scheduleNextDeal();
        }
    }

    // ---------- Quiz ----------
    function askQuestion() {
        paused = true;
        if (dealTimer) { clearTimeout(dealTimer); dealTimer = null; }
        $('question-panel').hidden = false;
        $('feedback-panel').hidden = true;
        $('answer-input').value = '';
        $('answer-input').focus();
        $('question-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function submitAnswer() {
        const raw = $('answer-input').value.trim();
        if (raw === '' || raw === '-' || raw === '+') return;
        const playerGuess = parseInt(raw, 10);
        if (isNaN(playerGuess)) return;

        const quiz = session.recordQuiz(playerGuess);
        showFeedback(quiz);
    }

    function showFeedback(quiz) {
        $('question-panel').hidden = true;
        $('feedback-panel').hidden = false;
        $('feedback-panel').classList.remove('correct', 'wrong');
        $('feedback-panel').classList.add(quiz.correct ? 'correct' : 'wrong');

        // Title
        let title;
        if (quiz.correct) {
            title = `✅ 完全正確！Running Count = ${quiz.correctCount > 0 ? '+' : ''}${quiz.correctCount}`;
        } else if (quiz.closeEnough) {
            title = `⚠️ 差一點！你答 ${signed(quiz.playerGuess)}，正確是 ${signed(quiz.correctCount)}（差 ${signed(quiz.error)}）`;
        } else {
            title = `❌ 錯了。你答 ${signed(quiz.playerGuess)}，正確是 ${signed(quiz.correctCount)}（差 ${signed(quiz.error)}）`;
        }
        $('feedback-title').textContent = title;

        // Body: card-by-card breakdown of this round + accuracy summary
        const body = $('feedback-body');
        body.innerHTML = '';

        // 計算表：這一輪每張牌 + running 累計
        const calcBox = el('div', 'calc-table');
        const heading = el('p', null,
            `這輪發了 ${quiz.roundCards.length} 張牌（自上一問後）：`);
        calcBox.appendChild(heading);

        const table = el('table');
        const headRow = el('tr');
        headRow.appendChild(el('th', null, '#'));
        headRow.appendChild(el('th', null, '牌'));
        headRow.appendChild(el('th', null, 'Hi-Lo'));
        headRow.appendChild(el('th', null, '累計'));
        table.appendChild(headRow);

        // 從「上一問時的 running」開始重演
        let startCount = quiz.correctCount - quiz.roundCards.reduce((s, c) => s + c.hiLo, 0);
        let running = startCount;
        quiz.roundCards.forEach((card, i) => {
            running += card.hiLo;
            const tr = el('tr');
            tr.appendChild(el('td', null, String(i + 1)));
            tr.appendChild(el('td', null, `${card.label}${card.suit}`));
            const hlCls = card.hiLo > 0 ? 'pos' : card.hiLo < 0 ? 'neg' : 'zero';
            const hlText = card.hiLo > 0 ? '+1' : card.hiLo < 0 ? '-1' : '0';
            tr.appendChild(el('td', hlCls, hlText));
            tr.appendChild(el('td', running > 0 ? 'pos' : running < 0 ? 'neg' : 'zero', signed(running)));
            table.appendChild(tr);
        });
        calcBox.appendChild(table);

        const startNote = el('p', 'hint',
            `起始（上一問結束時）running count = ${signed(startCount)} → 加上這輪 = ${signed(quiz.correctCount)}`);
        calcBox.appendChild(startNote);
        body.appendChild(calcBox);

        // 累計統計
        const stats = el('div', 'answer-summary');
        const totalDone = session.quizLog.length;
        const totalCorrect = session.quizLog.filter(q => q.correct).length;
        const totalClose = session.quizLog.filter(q => q.closeEnough).length;
        stats.innerHTML = `
            <div class="row"><b>本輪答題</b><b>${totalDone} 題</b></div>
            <div class="row"><b>完全正確</b><b>${totalCorrect} 題（${(totalCorrect/totalDone*100).toFixed(0)}%）</b></div>
            <div class="row"><b>差 ≤ 1（可接受）</b><b>${totalClose} 題（${(totalClose/totalDone*100).toFixed(0)}%）</b></div>
        `;
        body.appendChild(stats);

        // 進階資訊：true count 顯示（教育意義）
        const trueCountP = el('p', 'hint');
        trueCountP.innerHTML = `
            順便一提：Running = ${signed(quiz.correctCount)}，剩 ${session.shoe.decksRemaining().toFixed(1)} 副，
            <b>True Count ≈ ${fmt(quiz.correctTrueCount, 2)}</b>。
            ${quiz.correctTrueCount >= 2 ? '牌堆偏向玩家，此時真實賭局該加碼。' :
              quiz.correctTrueCount <= -1 ? '牌堆偏向莊家，此時該縮小賭注。' :
              '訊號還不明顯，按最低注玩就好。'}
        `;
        body.appendChild(trueCountP);

        $('feedback-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function signed(n) {
        return (n > 0 ? '+' : '') + n;
    }

    function continueDealing() {
        $('feedback-panel').hidden = true;
        paused = false;
        scheduleNextDeal();
    }

    // ---------- End shoe ----------
    function endShoe() {
        paused = true;
        if (dealTimer) { clearTimeout(dealTimer); dealTimer = null; }

        const analysis = analyzeSession(session);
        $('gameover-panel').hidden = false;
        $('gameover-title').textContent = `🎴 這一副打完（發了 ${analysis ? analysis.totalDealt : 0} 張）`;

        const body = $('gameover-body');
        if (!analysis || analysis.totalQuizzes === 0) {
            body.innerHTML = '<p>沒答任何題目，無法分析。試試看縮短「問答間隔」設定。</p>';
        } else {
            const accClass = analysis.overallAccuracy >= 0.6 ? 'verdict-good'
                : analysis.overallAccuracy >= 0.3 ? '' : 'verdict-bad';
            const closeClass = analysis.closeAccuracy >= 0.8 ? 'verdict-good' : '';

            let trendLine;
            if (analysis.lateAcc === null) {
                trendLine = '樣本太少（只答了 1-2 題），無法看趨勢。';
            } else if (analysis.improving) {
                trendLine = `<span class="verdict-good">進步中 ↗</span>：前半準確率 ${(analysis.earlyAcc*100).toFixed(0)}% → 後半 ${(analysis.lateAcc*100).toFixed(0)}%。心算越玩越熟。`;
            } else if (analysis.lateAcc < analysis.earlyAcc - 0.1) {
                trendLine = `<span class="verdict-bad">下滑 ↘</span>：前半 ${(analysis.earlyAcc*100).toFixed(0)}% → 後半 ${(analysis.lateAcc*100).toFixed(0)}%。可能疲勞了，或問答變密集追不上。`;
            } else {
                trendLine = `<b>穩定</b>：前半 ${(analysis.earlyAcc*100).toFixed(0)}% ≈ 後半 ${(analysis.lateAcc*100).toFixed(0)}%。試著把發牌節奏調快看能否維持。`;
            }

            let biasLine;
            if (analysis.biasVerdict === 'over') {
                biasLine = `平均<b>高估 ${fmt(analysis.avgSignedError, 1)}</b>——你可能把 10/J/Q/K/A 的 -1 記漏或記成 0，多注意大牌。`;
            } else if (analysis.biasVerdict === 'under') {
                biasLine = `平均<b>低估 ${fmt(Math.abs(analysis.avgSignedError), 1)}</b>——你可能小牌（2-6）沒完全加，或漏掉幾張。`;
            } else {
                biasLine = '沒有系統性偏差，你的 +/- 平均值接近 0，只是隨機失誤。';
            }

            body.innerHTML = `
                <h3>📊 本輪表現</h3>
                <ul>
                    <li><b>總題數</b>：${analysis.totalQuizzes} 題</li>
                    <li><b>完全正確率</b>：<span class="${accClass}">${(analysis.overallAccuracy*100).toFixed(0)}%</span>（${analysis.correctCount}/${analysis.totalQuizzes}）</li>
                    <li><b>差 ≤ 1 的可接受率</b>：<span class="${closeClass}">${(analysis.closeAccuracy*100).toFixed(0)}%</span>（實戰算牌容差 ±1 可接受）</li>
                    <li><b>平均絕對誤差</b>：${fmt(analysis.avgAbsError, 2)}</li>
                    <li><b>學習曲線</b>：${trendLine}</li>
                    <li><b>系統性偏差</b>：${biasLine}</li>
                    <li><b>最大失誤</b>：第 ${analysis.worstQuiz.quizIdx + 1} 題，你答 ${signed(analysis.worstQuiz.playerGuess)}、正確 ${signed(analysis.worstQuiz.correctCount)}（差 ${signed(analysis.worstQuiz.error)}）</li>
                </ul>
                <p><b>最終 shoe 狀態</b>：Running = ${signed(analysis.finalRunning)}、True = ${fmt(analysis.finalTrue, 2)}</p>
                <p class="hint">
                    <b>下一步練什麼？</b>
                    ${analysis.overallAccuracy >= 0.7
                        ? '準確率 70%+，可以試「發牌節奏調快」或「切牌位置拉深（85%）」——牌堆越深、count 值波動越劇烈、越考驗持續注意力。'
                        : '準確率還在 <70%，先關掉訓練輪、放慢發牌節奏（2000ms），把單張牌的 Hi-Lo 值記牢再挑戰。'}
                </p>
            `;
        }
    }

    // ---------- Setup / Init ----------
    function updateEdgePreview() {
        const numDecks = parseInt($('cfg-decks').value);
        const pen = parseFloat($('cfg-penetration').value);
        const { maxTrueCount, maxEdgePct } = estimateEdgePreview(numDecks, pen);
        $('edge-preview').innerHTML = `
            <b>${numDecks} 副</b>牌、切牌 <b>${(pen * 100).toFixed(0)}%</b>：
            理論最高 True Count ≈ <b>${fmt(maxTrueCount, 1)}</b>，
            算牌天花板優勢約 <b>+${fmt(maxEdgePct, 2)}%</b>
            ${maxEdgePct < 0.5 ? '（賭場反制強、難賺）' :
              maxEdgePct > 2 ? '（放牛吃草、算牌天堂）' : ''}
        `;
    }

    function startGame() {
        const numDecks = parseInt($('cfg-decks').value);
        const pen = parseFloat($('cfg-penetration').value);
        const interval = parseInt($('cfg-interval').value);
        dealMs = parseInt($('cfg-deal-ms').value) || 800;
        trainingWheels = $('cfg-training-wheels').value === '1';

        session = new CountTrainingSession(numDecks, pen, interval);
        paused = false;
        revealCounters = false;

        $('setup-panel').hidden = true;
        $('game-panel').hidden = false;
        $('gameover-panel').hidden = true;
        $('question-panel').hidden = true;
        $('feedback-panel').hidden = true;

        $('cards-area').innerHTML = '<p class="cards-empty">牌陸續發出中……</p>';
        $('cfg-deal-ms-live').value = dealMs;

        updateShoeStats();
        // 隨機延遲一下讓玩家有心理準備
        setTimeout(dealOneCard, 400);
    }

    function restart() {
        $('setup-panel').hidden = false;
        $('game-panel').hidden = true;
        $('gameover-panel').hidden = true;
        $('question-panel').hidden = true;
        $('feedback-panel').hidden = true;
        if (dealTimer) { clearTimeout(dealTimer); dealTimer = null; }
        session = null;
        paused = false;
        updateEdgePreview();
    }

    function sameAgain() {
        $('gameover-panel').hidden = true;
        startGame();
    }

    // ---------- Wire up ----------
    function initUI() {
        $('btn-start').addEventListener('click', startGame);
        $('btn-restart').addEventListener('click', restart);
        $('btn-same-again').addEventListener('click', sameAgain);
        $('btn-submit-answer').addEventListener('click', submitAnswer);
        $('btn-continue-deal').addEventListener('click', continueDealing);
        $('btn-pause').addEventListener('click', () => {
            paused = true;
            if (dealTimer) { clearTimeout(dealTimer); dealTimer = null; }
            $('btn-pause').hidden = true;
            $('btn-resume').hidden = false;
        });
        $('btn-resume').addEventListener('click', () => {
            paused = false;
            $('btn-pause').hidden = false;
            $('btn-resume').hidden = true;
            scheduleNextDeal();
        });
        $('btn-reveal').addEventListener('click', () => {
            revealCounters = !revealCounters;
            updateShoeStats();
        });
        $('btn-quit').addEventListener('click', () => {
            if (!session) return;
            endShoe();
        });
        $('cfg-deal-ms-live').addEventListener('input', e => {
            dealMs = Math.max(150, Math.min(5000, parseInt(e.target.value) || 800));
        });

        // Enter 送出答案
        $('answer-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
        });

        // 設定變動時即時更新優勢預估
        ['cfg-decks', 'cfg-penetration'].forEach(id => {
            $(id).addEventListener('change', updateEdgePreview);
        });
        updateEdgePreview();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
