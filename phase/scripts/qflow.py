#!/usr/bin/env python3
"""★★★ SEC XBRL 單季流量項抽取 —— 從「年初至今累計」差分出單季

   ★ 為什麼需要：10-Q 的營運現金流／資本支出是 YTD 累計（Q2=180天、Q3=270天），
     只靠「期間長度 60~120 天」的過濾器會把 Q2/Q3 丟掉，只剩 Q1。
   ★★ 作法：同一個 start 代表同一個會計年度起點 ⇒ 依 start 分組，
     組內按 end 排序，★★★ 單季 = 本期累計 − 前一期累計。
   ★ 而「期間長度已是一季（80~100 天）」的原生單季直接採用，不做差分。

   ⚠ 不要用日曆年分組（2026-09-24 實測：MSFT 會計年 7~6 月、V 10~9 月，
     用日曆年會混到兩個會計年度，推出來的 Q4 差 28%）。
"""
import datetime as dt, collections

def _d(x): return dt.date.fromisoformat(x)

def quarterly(facts, keys, forms=("10-Q","10-K")):
    """回傳 {end(str): 單季值}　★ 只用同一個標籤（先比近 6 年筆數，同 sec_facts #530）"""
    best, best_score = {}, (-1,-1)
    cut=(dt.date.today()-dt.timedelta(days=6*365)).isoformat()
    for k in keys:
        f=facts.get(k)
        if not f: continue
        raw=[]
        for unit,rows in f["units"].items():
            if unit!="USD" and unit!="USD/shares": continue
            for r in rows:
                if r.get("form") not in forms: continue
                st,en=r.get("start"),r.get("end")
                if not st or not en: continue
                raw.append((st,en,r["val"],r.get("filed","")))
        if not raw: continue
        # 同一 (start,end) 取 filed 最新
        ded={}
        for st,en,v,fl in raw:
            p=ded.get((st,en))
            if not p or fl>p[1]: ded[(st,en)]=(v,fl)
        by=collections.defaultdict(dict)                 # start → {end: val}
        for (st,en),(v,_) in ded.items(): by[st][en]=v
        out={}
        for st,ends in by.items():
            es=sorted(ends)
            prev_end, prev_val = st, 0.0
            for en in es:
                days=(_d(en)-_d(st)).days
                if 80<=days<=100:                        # ★ 原生單季
                    out[en]=ends[en]; prev_end,prev_val=en,ends[en]; continue
                if days>100:                             # ★★ 累計 ⇒ 差分
                    gap=(_d(en)-_d(prev_end)).days
                    if 80<=gap<=100 and prev_end!=st:
                        out[en]=ends[en]-prev_val
                    elif prev_end==st and 80<=days<=100:
                        out[en]=ends[en]
                    prev_end,prev_val=en,ends[en]
        if not out: continue
        score=(sum(1 for x in out if x>=cut), len(out))
        if score>best_score: best,best_score=out,score
    return best
