/* ============================================================
 * 板塊量價評分排行 · renderer.js
 * Stage 1: sector scorecard  ← 主要
 * Stage 2: S&P 500 個股熱區榜  ← 折疊區
 * ============================================================ */

const SCORECARD_URL = "../data/sector_rotation/scorecard_latest.json?_=" + Date.now();
const STAGE2_URL    = "../data/sector_rotation/latest.json?_=" + Date.now();
const STRATEGY_URL  = "../data/sector_rotation/strategy_a_latest.json?_=" + Date.now();

const STATE = {
    scorecard: null,
    stage2: null,
    strategy: null,
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

async function loadStrategyOptional() {
    try {
        const r = await fetch(STRATEGY_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        STATE.strategy = await r.json();
        return STATE.strategy;
    } catch (e) {
        return null;
    }
}

// ---------- render: market context ----------
function renderMarketPanel() {
    const ctx = STATE.scorecard?.market_context;
    if (!ctx) return;
    $("#market-panel").style.display = "";

    const v = ctx.voo || {};
    $("#mkt-trend").textContent = ctx.trend_label || "—";
    $("#mkt-trend-detail").textContent = v.vs_60d_pct !== undefined
        ? `${v.vs_60d_pct > 0 ? '+' : ''}${v.vs_60d_pct.toFixed(2)}% (VOO=$${v.price})`
        : "—";

    $("#mkt-heat").textContent = ctx.vs_50ma_label || "—";
    $("#mkt-heat-detail").textContent = v.vs_50ma_pct !== undefined
        ? `${v.vs_50ma_pct > 0 ? '+' : ''}${v.vs_50ma_pct.toFixed(2)}% vs $${v.ma50}`
        : "—";

    const vix = ctx.vix?.value;
    $("#mkt-vix").textContent = vix !== undefined ? vix.toFixed(1) : "—";
    $("#mkt-vix-detail").textContent = vix !== undefined
        ? (ctx.vix_override_all_cash ? "⛔ >30 · 全倉現金覆蓋" : (vix > 20 ? "⚠ 偏高" : "✅ 正常"))
        : "—";

    const tnx = ctx.tnx?.value;
    $("#mkt-tnx").textContent = tnx !== undefined ? `${tnx.toFixed(2)}%` : "—";
    let tnxDetail = "—";
    if (tnx !== undefined) {
        if (tnx > 4) tnxDetail = "📈 高利率 · 利多 XLE/XLF/XLV · 利空 XLK/XLRE/XLU";
        else if (tnx < 3) tnxDetail = "📉 低利率 · 利多 XLK · 利空 XLE/XLF";
        else tnxDetail = "➖ 中性 3-4%";
    }
    $("#mkt-tnx-detail").textContent = tnxDetail;

    // 象限 key
    $("#mkt-quadrant-key").textContent = ctx.quadrant_key || "—";
    $("#mkt-quadrant").style.background = ctx.vix_override_all_cash
        ? "rgba(239, 68, 68, 0.15)"
        : "";

    // 配置條
    const a = ctx.allocation || {core: 0, momentum: 0, sprint: 0, cash: 100};
    ["core", "momentum", "sprint", "cash"].forEach(k => {
        $(`#alloc-${k}`).textContent = `${a[k]}%`;
        $(`#alloc-${k}-fill`).style.width = `${a[k]}%`;
    });

    // notes
    const notesEl = $("#mkt-notes");
    notesEl.innerHTML = "";
    (ctx.notes || []).forEach(n => {
        const el = document.createElement("div");
        el.className = "market-note";
        el.textContent = n;
        notesEl.appendChild(el);
    });
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

        // TNX flag: boost=綠上箭 · penalty=紅下箭
        let tnxIcon = "";
        if (r.tnx_flag === "boost") tnxIcon = ` <span class="tnx-flag tnx-boost" title="TNX 利多">📈</span>`;
        else if (r.tnx_flag === "penalty") tnxIcon = ` <span class="tnx-flag tnx-penalty" title="TNX 利空">📉</span>`;

        tr.innerHTML = `
            <td class="rank-cell composite-rank"><b>#${rk}</b></td>
            <td class="sector-cell">
                <b>${r.sector}</b>${tnxIcon}
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

// ---------- render: strategy A (九步驟建議倉位) ----------
function renderStrategyPanel() {
    const s = STATE.strategy;
    if (!s) return;
    $("#strategy-a-panel").style.display = "";

    $("#strat-asof").textContent = `(as of ${s.as_of_date || "—"})`;

    // 有效 sector
    const esList = $("#strat-effective-sectors");
    esList.innerHTML = "";
    (s.effective_sectors || []).forEach(x => {
        let flagIcon = "";
        if (x.tnx_flag === "boost") flagIcon = " 📈";
        else if (x.tnx_flag === "penalty") flagIcon = " 📉";
        const div = document.createElement("span");
        div.className = "es-chip";
        div.innerHTML = `<b>${x.sector}</b>${flagIcon} <span class="dim">${x.sector_name}</span> <span class="dim">#${x.composite_rank}</span>`;
        esList.appendChild(div);
    });
    const demotedEl = $("#strat-demoted-sectors");
    demotedEl.innerHTML = "";
    (s.demoted_sectors || []).forEach(d => {
        const div = document.createElement("span");
        div.className = "es-chip es-demoted-chip";
        div.innerHTML = `<b>${d.sector}</b> <span class="dim">${d.sector_name}</span> · ${d.reason}`;
        demotedEl.appendChild(div);
    });

    // 相關性警示
    const cw = $("#strat-corr-warnings");
    cw.innerHTML = "";
    (s.correlation_warnings || []).forEach(w => {
        const div = document.createElement("div");
        div.className = "corr-msg" + (w.kind === "high_corr" ? " corr-warn" : " corr-ok");
        div.textContent = w.msg;
        cw.appendChild(div);
    });

    // 配置上限
    const a = s.allocation || {};
    $("#strat-core-cap").textContent = `上限 ${a.core || 0}%`;
    $("#strat-momentum-cap").textContent = `上限 ${a.momentum || 0}%`;
    $("#strat-sprint-cap").textContent = `上限 ${a.sprint || 0}%`;

    // 個股 tier
    const p = s.positions || {};
    _renderTier($("#strat-core-body"), p.core || [], "沒符合核心條件的個股");
    _renderTier($("#strat-momentum-body"), p.momentum || [], "沒符合動能條件的個股");
    _renderTier($("#strat-sprint-body"), p.sprint || [], "沒符合衝刺條件的個股");
    _renderTier($("#strat-hold-body"), p.hold_earnings || [], "沒財報 14 天內的個股");

    // 黑馬
    const dh = s.dark_horses || [];
    $("#strat-dark-horse-count").textContent = `(${dh.length} 檔)`;
    const dhEl = $("#strat-dark-horses");
    dhEl.innerHTML = "";
    if (dh.length === 0) {
        dhEl.innerHTML = `<div class="empty-mini">本輪無黑馬（需要 Point rank 5-8 AND vp_score rank 5-8 AND 成交量 top 3）</div>`;
    } else {
        dh.forEach(h => {
            const div = document.createElement("div");
            div.className = "horse-chip";
            div.innerHTML = `<b>${h.sector}</b> <span class="dim">${h.sector_name}</span> · Point rk${h.point_rank} · VP rk${h.vp_score_rank} · Vol rk${h.vol_rank}`;
            dhEl.appendChild(div);
        });
    }
    // 上輪升級提醒
    const promoted = s.watchlist_promoted || [];
    const promEl = $("#strat-promoted");
    promEl.innerHTML = "";
    if (promoted.length > 0) {
        const label = document.createElement("div");
        label.className = "promoted-label";
        label.innerHTML = "🎯 <b>上輪黑馬升進本輪前 5：</b>";
        promEl.appendChild(label);
        promoted.forEach(p => {
            const div = document.createElement("div");
            div.className = "promoted-chip";
            div.innerHTML = `<b>${p.sector}</b> ${p.sector_name || ""} · 加入時間: ${(p.added_at || "").slice(0,10)}`;
            promEl.appendChild(div);
        });
    }
}

function _renderTier(containerEl, positions, emptyMsg) {
    containerEl.innerHTML = "";
    if (positions.length === 0) {
        containerEl.innerHTML = `<div class="empty-mini">${emptyMsg}</div>`;
        return;
    }
    positions.forEach(p => {
        const div = document.createElement("div");
        div.className = "position-row";
        const vcpIcon = p.vcp ? "✅" : "—";
        const earnIcon = p.pre_earnings_14d ? " 📅" : "";
        const pfh = p.pct_from_high !== null && p.pct_from_high !== undefined ? p.pct_from_high.toFixed(1) : "—";
        const wt = p.weight_pct !== null && p.weight_pct !== undefined ? `${p.weight_pct}%` : "—";
        div.innerHTML = `
            <div class="pos-head">
                <span class="pos-sym"><b>${p.symbol}</b></span>
                <span class="pos-sector dim">${p.sector_etf || ""}</span>
                <span class="pos-weight">${wt}</span>
                <span class="pos-vcp" title="VCP 濾網">${vcpIcon}</span>
                <span class="pos-earn" title="財報 14 天內">${earnIcon}</span>
            </div>
            <div class="pos-metrics">
                Point <b>${fmtNum(p.point, 1)}</b> · CMS_A <b>${fmtNum(p.cms_a, 2)}</b> ·
                4W ${fmtPct(p.cum_ret_4w)} · 距高點 ${pfh}% ·
                L1 ${fmtPct(p.surprise_l1)}
            </div>
            <div class="pos-reason dim">${p.reason || ""}</div>
        `;
        containerEl.appendChild(div);
    });
}

// ---------- render: stage 2 (S&P 500 個股) ----------
const STAGE2_TAB_HINTS = {
    "4w":    "Past 4 Weeks · 各板塊 4W 動能最強前 3 名（短線輪動主線）",
    "13w":   "Past 13 Weeks · 各板塊 13W 動能最強前 3 名（一季趨勢）",
    "26w":   "Past 26 Weeks · 各板塊 26W 動能最強前 3 名（半年主線）",
    "cms_a": "各板塊 CMS_A 最強前 3 名（.5·4Wr+.3·13Wr+.2·26Wr · 綜合板塊內部排名 · 越小越強）",
};

function renderStage2() {
    const msgEl = $("#stage2-msg");
    if (!STATE.stage2) {
        msgEl.innerHTML = "⚠ 還沒跑 stage 2 · 執行 <code>FMP_API_KEY=xxx python scripts/sector_rotation_screener.py</code>";
        return;
    }
    const c = STATE.stage2.counts || {};
    const filtered = c.after_earnings_filter ?? c.universe ?? "?";
    msgEl.textContent = `✅ Stage 2 資料：as_of=${STATE.stage2.as_of_date} · universe=${c.universe ?? "?"} · 通過篩選=${filtered}`;
    $("#stage2-tabs").style.display = "";
    $("#heat-table").style.display = "";
    $$("#stage2-tabs .tab-btn").forEach(b =>
        b.addEventListener("click", () => renderStage2Tab(b.dataset.tab))
    );
    renderStage2Tab("4w");
}

function renderStage2Tab(tabKey) {
    STATE.stage2Tab = tabKey;
    $$("#stage2-tabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabKey));
    const hintEl = $("#stage2-tab-hint");
    if (hintEl) hintEl.textContent = STAGE2_TAB_HINTS[tabKey] || "";
    const rows = STATE.stage2?.top3?.[tabKey] || [];
    const tbody = $("#heat-tbody");
    tbody.innerHTML = "";
    const COLSPAN = 14;
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="empty-row">沒資料</td></tr>`;
        return;
    }
    let prevSector = null;
    rows.forEach(r => {
        if (prevSector !== null && r.sector !== prevSector) {
            const sep = document.createElement("tr");
            sep.className = "sector-sep";
            sep.innerHTML = `<td colspan="${COLSPAN}"></td>`;
            tbody.appendChild(sep);
        }
        prevSector = r.sector;
        const diColor = r.di >= 1 ? "var(--good)" : r.di >= 0.67 ? "var(--warn)" : "var(--danger)";
        // VCP badge
        let vcpBadge = "—";
        if (r.vcp === true || r.vcp === "True") vcpBadge = `<span class="vcp-badge vcp-yes" title="站上50MA + 振幅<3% + VP>1">✅ VCP</span>`;
        else if (r.vcp === false || r.vcp === "False") vcpBadge = `<span class="vcp-badge vcp-no" title="不符合 VCP 三條件">—</span>`;
        // MA50 相對顯示
        const above50 = r.above_50ma === true || r.above_50ma === "True";
        const maColor = above50 ? "var(--good)" : "var(--danger)";
        // 振幅：<3 綠 · >5 紅
        const ampColor = r.amp_10d_pct === null || r.amp_10d_pct === undefined
            ? "var(--text-dim)"
            : (r.amp_10d_pct < 3 ? "var(--good)" : r.amp_10d_pct < 5 ? "var(--warn)" : "var(--danger)");
        // VP：>1 綠 · <1 紅
        const vpColor = r.vp_ratio_stock === null || r.vp_ratio_stock === undefined
            ? "var(--text-dim)"
            : (r.vp_ratio_stock > 1 ? "var(--good)" : "var(--danger)");

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
            <td class="num" style="color:${maColor}">${fmtPrice(r.ma50)}</td>
            <td class="num" style="color:${ampColor}"><b>${fmtNum(r.amp_10d_pct, 2)}%</b></td>
            <td class="num" style="color:${vpColor}"><b>${fmtNum(r.vp_ratio_stock, 2)}</b></td>
            <td class="vcp-cell">${vcpBadge}</td>
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
    renderMarketPanel();
    renderStatus();
    renderScoreTable();

    await loadStage2Optional();
    renderStage2();

    await loadStrategyOptional();
    renderStrategyPanel();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
