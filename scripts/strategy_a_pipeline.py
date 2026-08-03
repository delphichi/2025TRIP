#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
策略 A · 九步驟選股 pipeline · scripts/strategy_a_pipeline.py
=====================================================================
輸入：
  data/sector_rotation/scorecard_latest.json   ← stage 1 (sector 評分 + 市場環境)
  data/sector_rotation/latest.json             ← stage 2 (個股熱區 + VCP + 高點)

輸出：
  data/sector_rotation/strategy_a_latest.json  ← 建議倉位（前端讀）
  data/sector_rotation/watchlist_horses.json   ← 黑馬觀察名單（跨月持久化）

執行時機：
  在 sector_rotation_screener.py（stage 2）跑完之後 · CI 排 step 順序：
    stage 1 (scorecard) → stage 2 (screener) → strategy A (this)

九步驟：
  Step 1 · 市場環境四象限（已由 scorecard 產）→ 決定配置上限
  Step 2 · TNX 濾網（已由 scorecard 產）→ 決定 sector boost/penalty
  Step 3 · sector 三套排名 → 取綜合分前 3 · 加黑馬預警
  Step 4 · TNX penalty sector 降級 · 綜合分第 4 名遞補（目標維持 3 個有效 ETF）
  Step 5 · 個股候選池 = 前 3 sector 的所有 stage 2 top3 union
  Step 6 · 三層漏斗：di+CMS_A 初篩 → 三道關卡 → 配置排序（核心/動能/衝刺）
  Step 7 · 破格規則（全場 Point 最高但不在候選池 · Point 領先 50%+ · 進衝刺）
  Step 8 · 持倉相關性檢查（XLK-XLC / XLK-XLY 高相關警示）
  Step 9 · 黑馬觀察名單更新（記錄本輪黑馬 · 檢查上輪黑馬是否升入前 5）
"""
import os
import sys
import json
from datetime import datetime, timezone

OUTDIR = "data/sector_rotation"
SCORECARD_PATH = os.path.join(OUTDIR, "scorecard_latest.json")
STAGE2_PATH = os.path.join(OUTDIR, "latest.json")
STRATEGY_PATH = os.path.join(OUTDIR, "strategy_a_latest.json")
WATCHLIST_PATH = os.path.join(OUTDIR, "watchlist_horses.json")

# ETF ticker ↔ GICS Sector 名稱對照（sector_scorecard.py SECTORS 一致）
SECTOR_ETF_TO_GICS = {
    "XLK": "Information Technology",
    "XLC": "Communication Services",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLE": "Energy",
    "XLF": "Financials",
    "XLV": "Health Care",
    "XLI": "Industrials",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLU": "Utilities",
}
GICS_TO_ETF = {v: k for k, v in SECTOR_ETF_TO_GICS.items()}

# 高度正相關 sector（策略 A · Step 8）· 避免同時持有
HIGH_CORRELATION = {
    "XLK": ["XLC", "XLY"],
    "XLC": ["XLK"],
    "XLY": ["XLK"],
}
LOW_CORRELATION_HEROS = ["XLV"]  # 分散配置好選項


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ============================================================
# Load
# ============================================================
def load_inputs():
    if not os.path.exists(SCORECARD_PATH):
        sys.exit(f"❌ 找不到 {SCORECARD_PATH} · 先跑 sector_scorecard.py")
    if not os.path.exists(STAGE2_PATH):
        sys.exit(f"❌ 找不到 {STAGE2_PATH} · 先跑 sector_rotation_screener.py")
    with open(SCORECARD_PATH, "r", encoding="utf-8") as f:
        scorecard = json.load(f)
    with open(STAGE2_PATH, "r", encoding="utf-8") as f:
        stage2 = json.load(f)
    log(f"loaded scorecard as_of={scorecard.get('as_of_date')} · stage2 as_of={stage2.get('as_of_date')}")
    return scorecard, stage2


def load_watchlist():
    if not os.path.exists(WATCHLIST_PATH):
        return {"horses": [], "history": []}
    with open(WATCHLIST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_watchlist(w):
    with open(WATCHLIST_PATH, "w", encoding="utf-8") as f:
        json.dump(w, f, ensure_ascii=False, indent=2)


# ============================================================
# Step 3 · sector 前 3 + 黑馬預警
# ============================================================
def step3_sector_top3(scorecard):
    sectors = sorted(scorecard["rows"], key=lambda r: r["composite_rank"])
    top3 = sectors[:3]

    # 黑馬預警：Point rank 5-8 AND vp_score rank 5-8 AND vol rank top 3
    dark_horses = [
        r for r in sectors
        if 5 <= r["point_rank"] <= 8
        and 5 <= r["vp_score_rank"] <= 8
        and r["vol_rank"] <= 3
    ]
    log(f"[Step 3] sector top 3 by composite: {[s['sector'] for s in top3]}")
    if dark_horses:
        log(f"[Step 3] 🌟 黑馬預警: {[h['sector'] for h in dark_horses]}")
    return sectors, top3, dark_horses


# ============================================================
# Step 4 · TNX 過濾 + 遞補
# ============================================================
def step4_tnx_filter(all_sectors, top3, market_ctx):
    if not market_ctx:
        log("[Step 4] 沒 market_context · 跳過 TNX 過濾")
        return list(top3), []

    penalty = set(market_ctx.get("tnx_penalty") or [])
    demoted = [s for s in top3 if s["sector"] in penalty]
    effective = [s for s in top3 if s["sector"] not in penalty]

    # 用綜合分第 4/5/... 名遞補 · 也要避開 penalty
    candidates = [s for s in all_sectors if s not in top3 and s["sector"] not in penalty]
    candidates.sort(key=lambda r: r["composite_rank"])
    while len(effective) < 3 and candidates:
        effective.append(candidates.pop(0))

    if demoted:
        log(f"[Step 4] TNX 過濾 · 降級 {[s['sector'] for s in demoted]} · 遞補後: {[s['sector'] for s in effective]}")
    else:
        log(f"[Step 4] TNX 無降級 · effective: {[s['sector'] for s in effective]}")
    return effective, demoted


# ============================================================
# Step 5 · 個股候選池
# ============================================================
def step5_candidate_pool(effective_sectors, stage2):
    """從 stage 2 top3 (4W/13W/26W/CMS_A union) 中，屬於 effective sector 的 subset"""
    target_gics = {SECTOR_ETF_TO_GICS[s["sector"]] for s in effective_sectors}
    union_by_symbol = {}
    for tab in ("4w", "13w", "26w", "cms_a"):
        for r in (stage2.get("top3") or {}).get(tab, []):
            if r["sector"] not in target_gics:
                continue
            union_by_symbol.setdefault(r["symbol"], r)
    pool = list(union_by_symbol.values())
    log(f"[Step 5] 候選池 = {len(pool)} 檔（來自 {[s['sector'] for s in effective_sectors]}）")
    return pool


# ============================================================
# Step 6 · 三層漏斗
# ============================================================
def step6_funnel(candidates, market_ctx):
    # 第一層：di=1.0 優先 · 按 CMS_A 由小到大
    di1 = [c for c in candidates if c.get("di") == 1.0]
    di1.sort(key=lambda c: c.get("cms_a", 999))
    keep_n = max(len(di1) // 3, min(len(di1), 5))
    layer1 = di1[:keep_n]
    log(f"[Step 6·L1] di=1.0 共 {len(di1)} · 取前 1/3 (或最少 5) = {len(layer1)} · {[c['symbol'] for c in layer1]}")

    # 第二層：三道關卡
    passed = []
    excluded = []
    for c in layer1:
        vp = c.get("vp_ratio_stock")
        pfh = c.get("pct_from_high")
        reasons = []
        # 關卡一：VP < 0.9 排除（回檔放量）
        if vp is not None and vp < 0.9:
            reasons.append(f"VP={vp:.2f}<0.9 回檔放量")
        # 關卡二：距高點 <-20% 標記深度反彈（不排除，降配置）
        deep_pb = pfh is not None and pfh < -20
        # 關卡三：基本面地雷 · 需人工 blocklist（空缺）
        if reasons:
            c = dict(c, _excluded_reason=" · ".join(reasons))
            excluded.append(c)
        else:
            c = dict(c, _deep_pullback=bool(deep_pb))
            passed.append(c)
    log(f"[Step 6·L2] 三道關卡 · 通過 {len(passed)} · 排除 {len(excluded)}")

    # 財報 14 天內 · 暫緩
    hold_earnings = [c for c in passed if c.get("pre_earnings_14d") is True]
    passed_earnings = [c for c in passed if not c.get("pre_earnings_14d")]
    if hold_earnings:
        log(f"[Step 6·財報] 暫緩 {len(hold_earnings)} 檔（財報 14 天內）: {[c['symbol'] for c in hold_earnings]}")

    # 第三層：配置排序
    tnx_boost = set(market_ctx.get("tnx_boost") or []) if market_ctx else set()
    tnx_boost_gics = {SECTOR_ETF_TO_GICS[t] for t in tnx_boost if t in SECTOR_ETF_TO_GICS}

    core, momentum, sprint = [], [], []
    for c in passed_earnings:
        vp = c.get("vp_ratio_stock") or 0
        pfh = c.get("pct_from_high") or 0
        vcp = c.get("vcp") is True
        r4w = c.get("cum_ret_4w") or 0
        in_tnx_boost = c["sector"] in tnx_boost_gics

        # 深度反彈 · 最多衝刺 15
        if c.get("_deep_pullback"):
            c["_tier"] = "sprint"
            c["_reason"] = f"距高點 {pfh:.1f}% 深度反彈 · 只能衝刺"
            sprint.append(c)
            continue

        # 核心 40%：距高點>-5% AND VP>1.0 AND VCP=TRUE
        if pfh > -5 and vp > 1.0 and vcp:
            c["_tier"] = "core"
            c["_reason"] = f"距高點 {pfh:.1f}% + VP {vp:.2f} + VCP✅"
            core.append(c)
        # 動能 35%：TNX順風 AND VP>=1.0 AND 4W正報酬
        elif in_tnx_boost and vp >= 1.0 and r4w > 0:
            c["_tier"] = "momentum"
            c["_reason"] = f"TNX順風 + VP {vp:.2f} + 4W {r4w:+.1f}%"
            momentum.append(c)
        # 衝刺 15%：CMS_A 靠前但有一個缺點
        elif (c.get("cms_a") or 999) <= 5:
            c["_tier"] = "sprint"
            c["_reason"] = f"CMS_A={c['cms_a']:.1f} 靠前但缺 VCP 或非 TNX 順風"
            sprint.append(c)

    log(f"[Step 6·L3] 分層完成 · 核心={len(core)} · 動能={len(momentum)} · 衝刺={len(sprint)} · 暫緩財報={len(hold_earnings)}")
    return {
        "core": core,
        "momentum": momentum,
        "sprint": sprint,
        "hold_earnings": hold_earnings,
        "excluded": excluded,
    }


# ============================================================
# Step 7 · 破格規則
# ============================================================
def step7_breakthrough(picked_symbols, all_sectors, stage2, effective_sectors):
    """全場 Point 最高 · 不在候選池 · Point 領先當前候選第 3 名 50%+ · 所在 ETF 至少一套系統前 5"""
    # 蒐集全 stage 2 top3 的所有個股（未 dedup）· 取 Point 最高
    all_candidates = []
    seen = set()
    for tab in ("4w", "13w", "26w", "cms_a"):
        for r in (stage2.get("top3") or {}).get(tab, []):
            if r["symbol"] in seen: continue
            seen.add(r["symbol"])
            all_candidates.append(r)
    if not all_candidates:
        return None
    top_by_point = sorted(all_candidates, key=lambda c: c.get("point") or -999, reverse=True)
    top_pt = top_by_point[0]

    if top_pt["symbol"] in picked_symbols:
        return None  # 已在候選池

    # 需要 picked_symbols 對應的 point 前 3 均值
    picked_points = sorted([
        c.get("point") or 0
        for tab in ("4w", "13w", "26w", "cms_a")
        for c in stage2["top3"].get(tab, [])
        if c["symbol"] in picked_symbols
    ], reverse=True)
    if len(picked_points) < 3:
        return None
    pick_3rd_pt = picked_points[2]
    top_pt_val = top_pt.get("point") or 0
    if top_pt_val < pick_3rd_pt * 1.5:
        return None

    # 檢查所在 ETF 至少一套系統前 5
    gics = top_pt.get("sector")
    etf = GICS_TO_ETF.get(gics)
    if not etf:
        return None
    match = next((s for s in all_sectors if s["sector"] == etf), None)
    if not match:
        return None
    ranks = [match.get("composite_rank", 99), match.get("point_rank", 99),
             match.get("cms_a_rank", 99), match.get("vp_score_rank", 99)]
    if min(ranks) > 5:
        return None

    top_pt = dict(top_pt, _tier="sprint", _reason=f"破格 · 全場 Point 最高({top_pt_val:.1f})且領先池內第 3 名 50%+")
    log(f"[Step 7] 🚨 破格納入衝刺: {top_pt['symbol']} · point={top_pt_val:.1f}")
    return top_pt


# ============================================================
# Step 8 · 相關性檢查
# ============================================================
def step8_correlation(effective_sectors):
    tickers = {s["sector"] for s in effective_sectors}
    warnings = []
    checked = set()
    for a in tickers:
        for b in HIGH_CORRELATION.get(a, []):
            if b in tickers:
                pair = tuple(sorted([a, b]))
                if pair not in checked:
                    checked.add(pair)
                    warnings.append({
                        "kind": "high_corr",
                        "sectors": list(pair),
                        "msg": f"⚠ {a} + {b} 高度正相關 · 建議只選一避免集中風險",
                    })
    if any(h in tickers for h in LOW_CORRELATION_HEROS):
        warnings.append({
            "kind": "low_corr_ok",
            "sectors": [h for h in LOW_CORRELATION_HEROS if h in tickers],
            "msg": f"✅ {'/'.join(h for h in LOW_CORRELATION_HEROS if h in tickers)} 與多數板塊低相關 · 分散配置佳",
        })
    for w in warnings:
        log(f"[Step 8] {w['msg']}")
    return warnings


# ============================================================
# Step 9 · 黑馬觀察名單更新
# ============================================================
def step9_watchlist(dark_horses_now, all_sectors, existing_watchlist):
    """
    · 檢查上輪黑馬有沒有升進本輪 sector 前 5 · 有的話標記「已升級」
    · 加入本輪新的黑馬 · 覆蓋 horses 欄
    · 保留 history（append-only）
    """
    top5_this = {s["sector"] for s in all_sectors[:5]}
    prev_horses = existing_watchlist.get("horses") or []

    # 檢查上輪黑馬是否升進本輪前 5
    promoted = [h for h in prev_horses if h["sector"] in top5_this]
    if promoted:
        for p in promoted:
            p["_status"] = "promoted"
        log(f"[Step 9] 🎯 上輪黑馬升進本輪前 5: {[p['sector'] for p in promoted]}")

    # 本輪新黑馬
    now_iso = datetime.now(timezone.utc).isoformat()
    new_horses = [
        {"sector": h["sector"], "sector_name": h["sector_name"],
         "point_rank": h["point_rank"], "vp_score_rank": h["vp_score_rank"],
         "vol_rank": h["vol_rank"], "added_at": now_iso}
        for h in dark_horses_now
    ]

    # 更新
    return {
        "horses": new_horses,
        "history": (existing_watchlist.get("history") or [])[-100:] + [
            {"as_of": now_iso, "promoted": promoted, "new": new_horses}
        ],
    }, promoted


# ============================================================
# 輸出
# ============================================================
def _pack_position(c):
    """縮成前端好用的欄位"""
    return {
        "symbol": c["symbol"],
        "name": c.get("name"),
        "sector": c["sector"],
        "sector_etf": GICS_TO_ETF.get(c["sector"]),
        "point": c.get("point"),
        "cms_a": c.get("cms_a"),
        "di": c.get("di"),
        "cum_ret_4w": c.get("cum_ret_4w"),
        "cum_ret_13w": c.get("cum_ret_13w"),
        "cum_ret_26w": c.get("cum_ret_26w"),
        "vcp": c.get("vcp"),
        "vp_ratio_stock": c.get("vp_ratio_stock"),
        "pct_from_high": c.get("pct_from_high"),
        "high_52w": c.get("high_52w"),
        "surprise_l1": c.get("surprise_l1"),
        "surprise_l2": c.get("surprise_l2"),
        "pre_earnings_14d": c.get("pre_earnings_14d"),
        "tier": c.get("_tier"),
        "reason": c.get("_reason"),
    }


def save_strategy_output(scorecard, effective_sectors, demoted, funnel, breakthrough,
                          correlation_warnings, dark_horses_now, watchlist_promoted):
    market_ctx = scorecard.get("market_context") or {}
    allocation = market_ctx.get("allocation") or {}

    core = [_pack_position(c) for c in funnel["core"]]
    momentum = [_pack_position(c) for c in funnel["momentum"]]
    sprint = [_pack_position(c) for c in funnel["sprint"]]
    if breakthrough:
        sprint.append(_pack_position(breakthrough))
    hold = [_pack_position(c) for c in funnel["hold_earnings"]]

    # 依配置上限計算每檔權重（均分該 tier 上限）
    def _weight(tier_list, tier_cap_pct):
        if not tier_list or not tier_cap_pct:
            return
        w = round(tier_cap_pct / len(tier_list), 2)
        for c in tier_list:
            c["weight_pct"] = w

    _weight(core, allocation.get("core", 0))
    _weight(momentum, allocation.get("momentum", 0))
    _weight(sprint, allocation.get("sprint", 0))

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": scorecard.get("as_of_date"),
        "market_context": market_ctx,
        "effective_sectors": [
            {"sector": s["sector"], "sector_name": s["sector_name"],
             "composite_rank": s["composite_rank"], "point_rank": s["point_rank"],
             "cms_a": s["cms_a"], "tnx_flag": s.get("tnx_flag")}
            for s in effective_sectors
        ],
        "demoted_sectors": [
            {"sector": s["sector"], "sector_name": s["sector_name"],
             "reason": "TNX 濾網降級"}
            for s in demoted
        ],
        "allocation": allocation,
        "positions": {
            "core": core,
            "momentum": momentum,
            "sprint": sprint,
            "hold_earnings": hold,
        },
        "totals": {
            "core_count": len(core),
            "momentum_count": len(momentum),
            "sprint_count": len(sprint),
            "hold_count": len(hold),
        },
        "correlation_warnings": correlation_warnings,
        "dark_horses": [
            {"sector": h["sector"], "sector_name": h["sector_name"],
             "point_rank": h["point_rank"], "vp_score_rank": h["vp_score_rank"],
             "vol_rank": h["vol_rank"]}
            for h in dark_horses_now
        ],
        "watchlist_promoted": [
            {"sector": p["sector"], "sector_name": p.get("sector_name"),
             "added_at": p.get("added_at")}
            for p in watchlist_promoted
        ],
        "notes": [
            "策略 A 九步驟輸出 · 每檔 weight_pct = 該 tier 配置上限 / 該 tier 檔數",
            "hold_earnings：暫緩（財報 14 天內），等財報後再評估",
            "衝刺區可能包含破格納入的個股（reason 開頭「破格」）",
        ],
    }

    with open(STRATEGY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log(f"saved {STRATEGY_PATH}")

    log("=" * 60)
    log(f"策略 A 建議倉位 · as of {out['as_of_date']}")
    log("=" * 60)
    a = allocation
    log(f"配置上限：核心 {a.get('core',0)}% · 動能 {a.get('momentum',0)}% · 衝刺 {a.get('sprint',0)}% · 現金 {a.get('cash',100)}%")
    for tier_name, positions in [("核心", core), ("動能", momentum), ("衝刺", sprint), ("暫緩", hold)]:
        if not positions: continue
        log(f"\n▶ {tier_name}（{len(positions)} 檔 · 每檔 {positions[0].get('weight_pct','—')}%）")
        for p in positions:
            log(f"    {p['symbol']:6s} {p['sector_etf']:4s} · point={p.get('point'):.1f} · {p.get('reason','')}")


# ============================================================
# main
# ============================================================
def main():
    scorecard, stage2 = load_inputs()
    watchlist = load_watchlist()

    all_sectors, top3, dark_horses = step3_sector_top3(scorecard)
    market_ctx = scorecard.get("market_context")
    effective, demoted = step4_tnx_filter(all_sectors, top3, market_ctx)
    pool = step5_candidate_pool(effective, stage2)
    funnel = step6_funnel(pool, market_ctx)

    picked = set()
    for tier_list in (funnel["core"], funnel["momentum"], funnel["sprint"]):
        for c in tier_list:
            picked.add(c["symbol"])
    breakthrough = step7_breakthrough(picked, all_sectors, stage2, effective)

    corr_warnings = step8_correlation(effective)
    new_watchlist, promoted = step9_watchlist(dark_horses, all_sectors, watchlist)
    save_watchlist(new_watchlist)

    save_strategy_output(scorecard, effective, demoted, funnel, breakthrough,
                         corr_warnings, dark_horses, promoted)


if __name__ == "__main__":
    main()
