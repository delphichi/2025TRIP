/* ============================================================
 * 板塊量價評分排行 · renderer.js
 * Stage 1: sector scorecard  ← 主要
 * Stage 2: S&P 500 個股熱區榜  ← 折疊區
 * ============================================================ */

const SCORECARD_URL = "../data/sector_rotation/scorecard_latest.json?_=" + Date.now();
const STAGE2_URL    = "../data/sector_rotation/latest.json?_=" + Date.now();

const STATE = {
    scorecard: null,
    stage2: null,
    stage2Tab: "4w",
};

// ---------- utils ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function fmtPct(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "NA";
    return (v > 0 ? "+" : "") + Number(v).toFixed(2) + "%";
}
function fmtNum(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "NA";
    return Number(v).toFixed(digits);
}
function fmtVol(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "NA";
    v = Number(v);
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
}
function fmtPrice(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "NA";
    return Number(v).toFixed(2);
}

// heatmap 色：報酬用 綠(+)→黃(0)→紅(-)
function heatBgRet(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "transparent";
    const c = Math.max(-30, Math.min(30, Number(v)));
    let hue;
    if (c >= 0) hue = 45 + (c / 30) * (130 - 45);
    else        hue = 45 + (c / 30) * 45;
    const lightness = 88 - Math.min(28, Math.abs(c) * 0.9);
    return `hsl(${hue.toFixed(0)}, 68%, ${lightness.toFixed(0)}%)`;
}
// 量比：>1 綠、<1 紅（中心=1）
function heatBgVolRatio(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "transparent";
    const delta = (Number(v) - 1) * 30; // 1 → 0，2 → +30，0 → -30
    return heatBgRet(delta);
}
// score 0-100：紅→黃→綠
function heatBgScore(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "transparent";
    const c = (Number(v) - 50) * 0.6; // 0→-30，100→+30
    return heatBgRet(c);
}
function heatText(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "var(--text-dim)";
    return "#0f172a";
}

// ---------- load ----------
async function loadScorecard() {
    const status = $("#load-status");
    status.textContent = "📡 讀取 scorecard_latest.json 中……";
    try {
        const r = await fetch(SCORECARD_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        STATE.scorecard = await r.json();
        status.textContent = "✅ 載入完成 · " + (STATE.scorecard.as_of_date || "");
        setTimeout(() => { $("#load-status-row").style.display = "none"; }, 2000);
        return STATE.scorecard;
    } catch (e) {
        status.textContent = `❌ 讀不到 scorecard_latest.json：${e.message} · 先跑 python scripts/sector_scorecard.py`;
        status.classList.add("error");
        throw e;
    }
}

async function loadStage2Optional() {
    try {
        const r = await fetch(STAGE2_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        STATE.stage2 = await r.json();
        return STATE.stage2;
    } catch (e) {
        return null;
    }
}

// ---------- render: status ----------
function renderStatus() {
    const m = STATE.scorecard;
    if (!m) return;
    $("#stat-asof").textContent = m.as_of_date || "—";
    const asofEl = $("#table-asof");
    if (asofEl) asofEl.textContent = m.as_of_date || "—";
    const rows = m.rows || [];
    if (rows.length === 0) return;
    // 使用 composite_rank（越小越強）· 若舊資料無此欄則回退到 score
    const rankField = ("composite_rank" in rows[0]) ? "composite_rank" : "score_rank";
    const sorted = rows.slice().sort((a, b) => (a[rankField] || 999) - (b[rankField] || 999));
    const top = sorted[0], bot = sorted[sorted.length - 1];
    const topLabel = top.composite_rank ? `綜合分 ${top.composite}` : `score ${top.score}`;
    const botLabel = bot.composite_rank ? `綜合分 ${bot.composite}` : `score ${bot.score}`;
    $("#stat-top").innerHTML = `${top.sector} <span class="dim">${top.sector_name}</span> <b>${topLabel}</b>`;
    $("#stat-bot").innerHTML = `${bot.sector} <span class="dim">${bot.sector_name}</span> <b>${botLabel}</b>`;
}

// ---------- render: score table ----------
function renderScoreTable() {
    const rows = STATE.scorecard?.rows || [];
    const tbody = $("#score-tbody");
    tbody.innerHTML = "";
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="26" class="empty-row">沒資料 · 先跑 scripts/sector_scorecard.py</td></tr>`;
        return;
    }
    // 排序：composite_rank（新）優先 · fallback score_rank（舊）
    const rankKey = ("composite_rank" in rows[0]) ? "composite_rank" : "score_rank";
    const sorted = rows.slice().sort((a, b) => (a[rankKey] || 999) - (b[rankKey] || 999));

    sorted.forEach(r => {
        const tr = document.createElement("tr");
        const rk = r[rankKey];
        if (rk <= 3) tr.classList.add("row-top3");
        if (rk >= sorted.length - 2) tr.classList.add("row-bot3");

        // 差距警示 badge
        let alertBadge = "";
        if (r.gap_alert === "吃老本") {
            alertBadge = `<span class="alert-badge alert-old" title="Point 前段但量價落後 · 漲多動能弱">⚠ 吃老本</span>`;
            tr.classList.add("row-alert-old");
        } else if (r.gap_alert === "剛爆發") {
            alertBadge = `<span class="alert-badge alert-new" title="量價強但漲幅追不上 · 最多衝刺15%">⚠ 剛爆發</span>`;
            tr.classList.add("row-alert-new");
        }

        // di 顏色：1.0 = 綠（三週期全漲）· 0 = 紅
        const diColor = r.di >= 1 ? "var(--good)" : r.di >= 0.67 ? "var(--warn)" : "var(--danger)";
        // Point 熱區：正=綠負=紅
        const pointVal = r.point ?? r.price_point;

        tr.innerHTML = `
            <td class="rank-cell composite-rank"><b>#${rk}</b></td>
            <td class="sector-cell">
                <b>${r.sector}</b>
                <span class="sector-name-zh">${r.sector_name || ""}</span>
            </td>
            <td class="num price-t"><b>${fmtPrice(r.t_price)}</b></td>
            <td class="num dim">${fmtPrice(r.p4w)}</td>
            <td class="num dim">${fmtPrice(r.p13w)}</td>
            <td class="num dim">${fmtPrice(r.p26w)}</td>
            <td class="num heat" style="background:${heatBgRet(r.ret_4w)}; color:${heatText(r.ret_4w)}"><b>${fmtPct(r.ret_4w)}</b></td>
            <td class="num heat" style="background:${heatBgRet(r.ret_13w)}; color:${heatText(r.ret_13w)}">${fmtPct(r.ret_13w)}</td>
            <td class="num heat" style="background:${heatBgRet(r.ret_26w)}; color:${heatText(r.ret_26w)}">${fmtPct(r.ret_26w)}</td>
            <td class="num pp-cell heat" style="background:${heatBgRet(pointVal)}; color:${heatText(pointVal)}"><b>${fmtNum(pointVal, 1)}</b></td>
            <td class="num rank-cell">${r.point_rank ?? r.price_rank ?? ""}</td>
            <td class="num cms-a-cell"><b>${fmtNum(r.cms_a, 2)}</b></td>
            <td class="num di-cell" style="color:${diColor}"><b>${fmtNum(r.di, 2)}</b></td>
            <td class="num dim">${fmtVol(r.vol_10d_avg)}</td>
            <td class="num"><b>${fmtVol(r.vol_today)}</b></td>
            <td class="num dim">${fmtVol(r.vol_3w_avg)}</td>
            <td class="num heat" style="background:${heatBgVolRatio(r.vol_ratio)}; color:${heatText((r.vol_ratio-1)*30)}"><b>${fmtNum(r.vol_ratio, 2)}x</b></td>
            <td class="num rank-cell">${r.vol_rank}</td>
            <td class="num heat" style="background:${heatBgRet(r.ret_5d)}; color:${heatText(r.ret_5d)}">${fmtPct(r.ret_5d)}</td>
            <td class="num heat" style="background:${heatBgRet(r.ret_20d)}; color:${heatText(r.ret_20d)}">${fmtPct(r.ret_20d)}</td>
            <td class="num up-days">${r.up_days_20}</td>
            <td class="num down-days">${r.down_days_20}</td>
            <td class="num dim">${fmtVol(r.up_avg_vol)}</td>
            <td class="num dim">${fmtVol(r.down_avg_vol)}</td>
            <td class="num highlight-col"><b>${fmtNum(r.vp_ratio, 2)}</b></td>
            <td class="num highlight-col"><b>${fmtNum(r.ud_ratio, 2)}</b></td>
            <td class="num heat score-col" style="background:${heatBgScore(r.vp_score ?? r.score)}; color:${heatText((r.vp_score ?? r.score)-50)}"><b>${fmtNum(r.vp_score ?? r.score, 1)}</b></td>
            <td class="num rank-cell">${r.vp_score_rank ?? ""}</td>
            <td class="alert-cell">${alertBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------- render: stage 2 (S&P 500 個股) ----------
function renderStage2() {
    const msgEl = $("#stage2-msg");
    if (!STATE.stage2) {
        msgEl.innerHTML = "⚠ 還沒跑 stage 2 · 執行 <code>FMP_API_KEY=xxx python scripts/sector_rotation_screener.py</code>";
        return;
    }
    msgEl.textContent = `✅ Stage 2 資料：${STATE.stage2.as_of_date} · ${STATE.stage2.counts?.after_earnings_filter ?? "?"} 檔通過雙篩`;
    $("#stage2-tabs").style.display = "";
    $("#heat-table").style.display = "";
    $$(".tab-btn").forEach(b =>
        b.addEventListener("click", () => renderStage2Tab(b.dataset.tab))
    );
    renderStage2Tab("4w");
}

function renderStage2Tab(tabKey) {
    STATE.stage2Tab = tabKey;
    $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabKey));
    const rows = STATE.stage2?.top3?.[tabKey] || [];
    const tbody = $("#heat-tbody");
    tbody.innerHTML = "";
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-row">沒資料</td></tr>`;
        return;
    }
    let prevSector = null;
    rows.forEach(r => {
        if (prevSector !== null && r.sector !== prevSector) {
            const sep = document.createElement("tr");
            sep.className = "sector-sep";
            sep.innerHTML = `<td colspan="10"></td>`;
            tbody.appendChild(sep);
        }
        prevSector = r.sector;
        const diColor = r.di >= 1 ? "var(--good)" : r.di >= 0.67 ? "var(--warn)" : "var(--danger)";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="sym"><b>${r.symbol}</b></td>
            <td class="sector">${r.sector || ""}</td>
            <td class="num heat" style="background:${heatBgRet(r.cum_ret_4w)}; color:${heatText(r.cum_ret_4w)}">${fmtPct(r.cum_ret_4w)}</td>
            <td class="num heat" style="background:${heatBgRet(r.cum_ret_13w)}; color:${heatText(r.cum_ret_13w)}">${fmtPct(r.cum_ret_13w)}</td>
            <td class="num heat" style="background:${heatBgRet(r.cum_ret_26w)}; color:${heatText(r.cum_ret_26w)}">${fmtPct(r.cum_ret_26w)}</td>
            <td class="num heat" style="background:${heatBgRet(r.point)}; color:${heatText(r.point)}"><b>${fmtNum(r.point, 1)}</b></td>
            <td class="num" style="color:var(--accent-2)"><b>${fmtNum(r.cms_a, 2)}</b></td>
            <td class="num" style="color:${diColor}"><b>${fmtNum(r.di, 2)}</b></td>
            <td class="num heat" style="background:${heatBgRet(r.surprise_l1)}; color:${heatText(r.surprise_l1)}">${fmtPct(r.surprise_l1)}</td>
            <td class="num heat" style="background:${heatBgRet(r.surprise_l2)}; color:${heatText(r.surprise_l2)}">${fmtPct(r.surprise_l2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------- init ----------
async function init() {
    $("#btn-reload").addEventListener("click", () => location.reload());

    try {
        await loadScorecard();
    } catch (e) {
        return;
    }
    renderStatus();
    renderScoreTable();

    await loadStage2Optional();
    renderStage2();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
