(() => {
    'use strict';

    // ============================================================
    // 主題雷達 · YouTube × HN × Reddit 交叉監聽
    // 純瀏覽器 SPA · YouTube Data API v3 + HN Algolia + Reddit .json
    // ============================================================
    // 版本標記——修 bug 後 bump · 讓使用者 console 看得到跑的是哪版
    // 若掃描結果的關鍵字還有 x2f/href/https · 表示還在跑舊版 · 硬重整
    const RADAR_VERSION = 'v2026-07-08-d';

    // 只看近 N 年 · 避免 SEO 老影片 / 多年前 HN 舊文洗掉討論訊號
    // 兩年是個舒服的權衡：AI 生態變化太快 · 更久的東西通常已過期
    const RECENT_YEARS = 2;
    const RECENT_SECONDS = RECENT_YEARS * 365 * 86400;
    const RECENT_MS = RECENT_SECONDS * 1000;
    const recentIsoCutoff = () => new Date(Date.now() - RECENT_MS).toISOString();
    const recentUnixCutoff = () => Math.floor((Date.now() - RECENT_MS) / 1000);
    console.log(`%c[topic-radar] ${RADAR_VERSION} loaded`, 'color:#7c3aed;font-weight:bold');

    const YT_KEY_STORAGE = 'yt_data_api_key';
    const YT_API = 'https://www.googleapis.com/youtube/v3';

    // AI 相關 subreddit 清單（掃描目標）
    // 分兩層：核心通用 + AI 工具產品專屬（Claude / Cursor / GPT / MCP 話題）
    // 越專屬的 sub 對「工具名」搜尋命中率越高
    const AI_SUBREDDITS = [
        // 通用 AI 討論
        'LocalLLaMA',
        'OpenAI',
        'singularity',
        'ArtificialInteligence',
        'ChatGPT',
        'MachineLearning',
        // 工具/產品專屬（Claude / Cursor / 開發者向）
        'ClaudeAI',
        'ClaudeCode',
        'cursor',
        'PromptEngineering',
        'LLMDevs',
        'aivideo',
    ];

    const $ = id => document.getElementById(id);

    // ============================================================
    // Key management
    // ============================================================
    function loadYtKey() {
        const k = localStorage.getItem(YT_KEY_STORAGE) || '';
        $('yt-key-input').value = k;
        updateKeyStatus(k);
    }
    function saveYtKey() {
        const k = ($('yt-key-input').value || '').trim();
        if (!k) { alert('請先輸入 YouTube API key'); return; }
        localStorage.setItem(YT_KEY_STORAGE, k);
        updateKeyStatus(k);
    }
    function clearYtKey() {
        localStorage.removeItem(YT_KEY_STORAGE);
        $('yt-key-input').value = '';
        updateKeyStatus('');
    }
    function updateKeyStatus(k) {
        const el = $('key-status');
        if (k) {
            const masked = k.slice(0, 4) + '****' + k.slice(-4);
            el.textContent = `✅ YouTube key 已存（${masked}） · Reddit 不需 key`;
            el.className = 'key-status key-status-ok';
        } else {
            el.textContent = '⚠️ 未設 YouTube key · 只能查 Reddit · YouTube 側會被跳過';
            el.className = 'key-status key-status-warn';
        }
    }
    function getYtKey() { return localStorage.getItem(YT_KEY_STORAGE) || ''; }

    // ============================================================
    // YouTube fetch
    // ============================================================
    async function ytSearch(topic, apiKey) {
        // /search?part=snippet&q={topic}&type=video&maxResults=25&order=viewCount&publishedAfter=<iso>
        // 為什麼 viewCount：過濾 low-quality 新影片（避免雜訊）· 若使用者要看新影片動能 · 之後可加 sort toggle
        // 為什麼 publishedAfter：限制近 2 年 · 排除 SEO 老影片（e.g. 3 年前 300M views 廚藝影片洗版）
        //   AI / dev tool 話題 3 年前的教程基本已過時 · 不是「當前熱度」訊號
        const url = `${YT_API}/search?part=snippet&type=video&q=${encodeURIComponent(topic)}&maxResults=25&order=viewCount&publishedAfter=${recentIsoCutoff()}&key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`YouTube search HTTP ${res.status}: ${body.slice(0, 100)}`);
        }
        const data = await res.json();
        return (data.items || []).map(it => ({
            videoId: it.id.videoId,
            title: it.snippet.title,
            channelTitle: it.snippet.channelTitle,
            channelId: it.snippet.channelId,
            publishedAt: it.snippet.publishedAt,
            description: it.snippet.description,
            thumbnail: (it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || ''),
        }));
    }

    async function ytVideosBatch(videoIds, apiKey) {
        // /videos?part=snippet,statistics,contentDetails&id=v1,v2,...
        // 一次可打 50 支 · 我們 25 支剛好一次搞定
        // 為什麼要再打一次：search endpoint 沒帶 statistics（viewCount / likeCount / commentCount）
        //   跟 duration · 都要 videos endpoint 才有
        if (videoIds.length === 0) return [];
        const url = `${YT_API}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`YouTube videos HTTP ${res.status}: ${body.slice(0, 100)}`);
        }
        const data = await res.json();
        return (data.items || []).map(it => ({
            videoId: it.id,
            title: it.snippet.title,
            channelTitle: it.snippet.channelTitle,
            channelId: it.snippet.channelId,
            publishedAt: it.snippet.publishedAt,
            tags: it.snippet.tags || [],
            duration: it.contentDetails.duration,   // ISO 8601 · e.g. PT15M33S
            views: parseInt(it.statistics.viewCount || '0', 10),
            likes: parseInt(it.statistics.likeCount || '0', 10),
            comments: parseInt(it.statistics.commentCount || '0', 10),
        }));
    }

    // ISO 8601 duration → seconds
    function parseISODuration(iso) {
        const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
        if (!m) return 0;
        return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
    }

    function fmtDuration(iso) {
        const s = parseISODuration(iso);
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60), sec = s % 60;
        if (m < 60) return `${m}:${String(sec).padStart(2, '0')}`;
        const h = Math.floor(m / 60), mm = m % 60;
        return `${h}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function fmtNum(v) {
        if (v === null || !isFinite(v)) return '—';
        if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
        return String(v);
    }

    function fmtDateAge(dateStr) {
        // e.g. "2 月前" · "3 天前"
        const d = new Date(dateStr);
        const now = new Date();
        const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (days < 1) return '今天';
        if (days < 7) return `${days} 天前`;
        if (days < 30) return `${Math.floor(days / 7)} 週前`;
        if (days < 365) return `${Math.floor(days / 30)} 月前`;
        return `${Math.floor(days / 365)} 年前`;
    }

    // ============================================================
    // Reddit fetch (public .json)
    // ============================================================
    // CORS proxy fallback（Reddit 對 browser UA 越來越嚴 · 從瀏覽器直連常掛）
    // 為什麼多個候選：public proxy 常常掛掉 / 被 Cloudflare 封 / rate limit · 多備幾條路
    const REDDIT_PROXIES = [
        { name: 'corsproxy',   build: u => `https://corsproxy.io/?${encodeURIComponent(u)}` },
        { name: 'allorigins',  build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
        { name: 'codetabs',    build: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
        { name: 'thingproxy',  build: u => `https://thingproxy.freeboard.io/fetch/${u}` },
        { name: 'corssh',      build: u => `https://proxy.cors.sh/${u}` },
    ];

    async function redditHot(subreddit, limit = 25) {
        // 為什麼掃 old.reddit.com 而非 www：old 對 unauthenticated 較寬鬆
        // 若 old 也掛 · 依序試 CORS proxy
        const upstreamUrl = `https://old.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}&raw_json=1`;
        const attempts = [
            { label: 'direct', url: upstreamUrl },
            ...REDDIT_PROXIES.map(p => ({ label: p.name, url: p.build(upstreamUrl) })),
        ];
        const attemptLog = [];   // 收集每一步的結果 · 方便診斷
        for (const a of attempts) {
            const t0 = performance.now();
            try {
                const res = await fetch(a.url, { headers: { 'Accept': 'application/json' } });
                const dt = Math.round(performance.now() - t0);
                if (!res.ok) { attemptLog.push(`${a.label}:HTTP${res.status}(${dt}ms)`); continue; }
                const data = await res.json();
                const children = data.data?.children || [];
                if (children.length === 0) { attemptLog.push(`${a.label}:empty(${dt}ms)`); continue; }
                const posts = children.map(c => ({
                    subreddit,
                    title: c.data.title,
                    url: `https://reddit.com${c.data.permalink}`,
                    score: c.data.score,
                    comments: c.data.num_comments,
                    created: c.data.created_utc * 1000,
                    author: c.data.author,
                    selftext: (c.data.selftext || '').slice(0, 300),
                    isSelf: c.data.is_self,
                    flair: c.data.link_flair_text || '',
                }));
                return { subreddit, posts, error: null, via: a.label, attemptLog };
            } catch (e) {
                const dt = Math.round(performance.now() - t0);
                // 「Failed to fetch」= CORS 或網路層掛 · 標成 NETERR 方便一眼看
                const msg = /Failed to fetch|NetworkError|ERR_/.test(e.message) ? 'NETERR' : e.message.slice(0, 20);
                attemptLog.push(`${a.label}:${msg}(${dt}ms)`);
            }
        }
        return { subreddit, posts: [], error: attemptLog.join(' → '), via: '', attemptLog };
    }

    // ============================================================
    // Hacker News（Algolia search API · 有 CORS · 免 auth · 免 quota）
    // ============================================================
    // 為什麼加 HN：Reddit 2023 起主動封殺 browser 直連 · 需 OAuth + server proxy 才能拉
    // HN 官方 Algolia mirror 直接開放給瀏覽器 · 且 dev / AI 討論質量比 Reddit 高（founders / execs 都看）
    async function hnSearch(topic) {
        // Algolia 支援全文搜尋 · tags=story 只拿 story 型（過濾 comment）
        // numericFilters=created_at_i>N · 只拿近 2 年 · 排除 8-11 年前的老文洗榜
        //   （HN Algolia 預設按 relevance 排 · 舊高分文常擠掉近期真熱點）
        const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=50&numericFilters=created_at_i>${recentUnixCutoff()}`;
        const t0 = performance.now();
        try {
            const res = await fetch(url);
            const dt = Math.round(performance.now() - t0);
            if (!res.ok) return { posts: [], error: `HTTP ${res.status} (${dt}ms)`, dt };
            const data = await res.json();
            const posts = (data.hits || []).map(h => ({
                title: h.title || h.story_title || '(no title)',
                url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
                hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
                points: h.points || 0,
                comments: h.num_comments || 0,
                author: h.author,
                created: new Date(h.created_at).getTime(),
                // storyText 原始帶 HTML tag / entity / URL · 清乾淨再 slice · 不然截斷會爆 `&#x…`
                storyText: cleanText(h.story_text || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            }));
            posts.sort((a, b) => b.points - a.points);
            return { posts, error: null, dt, totalHits: data.nbHits || 0 };
        } catch (e) {
            const dt = Math.round(performance.now() - t0);
            const msg = /Failed to fetch|NetworkError|ERR_/.test(e.message) ? 'NETERR' : e.message.slice(0, 40);
            return { posts: [], error: `${msg} (${dt}ms)`, dt };
        }
    }

    // 平行拉全部 subreddit · 個別失敗不擋
    async function redditScan(topic) {
        const results = await Promise.all(AI_SUBREDDITS.map(s => redditHot(s, 25)));
        // 過濾包含關鍵字的 post（title 或 selftext 有）· case-insensitive
        // topic 可能是多字：拆成關鍵字 · 至少 match 1 個就算
        const kw = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matched = [];
        // 收集「就算沒 match 也可能有用」的 sub top 貼文 · 讓使用者看到 sub 到底在聊什麼
        const unmatchedTop = [];
        results.forEach(r => {
            const subMatched = [];
            r.posts.forEach(p => {
                const text = (p.title + ' ' + p.selftext).toLowerCase();
                if (kw.length === 0 || kw.some(k => text.includes(k))) {
                    matched.push(p);
                    subMatched.push(p);
                }
            });
            // 如果這個 sub 一篇都沒 match · 收 top 3 讓使用者參考
            if (subMatched.length === 0 && r.posts.length > 0) {
                unmatchedTop.push({ sub: r.subreddit, top: r.posts.slice(0, 3) });
            }
        });
        matched.sort((a, b) => b.score - a.score);
        return {
            posts: matched,
            unmatchedTop,
            errors: results.filter(r => r.error).map(r => `${r.subreddit}: ${r.error}`),
            perSub: results.map(r => ({
                sub: r.subreddit,
                total: r.posts.length,
                matched: r.posts.filter(p => {
                    const t = (p.title + ' ' + p.selftext).toLowerCase();
                    return kw.length === 0 || kw.some(k => t.includes(k));
                }).length,
                error: r.error,
                via: r.via || '',
            })),
        };
    }

    // ============================================================
    // 關鍵字抽取（給交叉分析用）
    // ============================================================
    const STOPWORDS = new Set([
        'a','an','the','and','or','but','of','in','on','at','to','for','with','from','by','as','is','are','was','were','be','been','being',
        'i','you','he','she','it','we','they','them','this','that','these','those','my','your','his','her','its','our','their',
        'how','what','when','where','why','who','which','do','does','did','have','has','had','can','could','will','would','should','may','might',
        'not','no','yes','so','if','then','than','also','just','only','more','most','some','any','all','one','two','three',
        'ai','llm','video','ep','part','tutorial','vs','using','use','used','uses','get','make','need','like','way','new','old',
        // HTML entity 殘骸（HN Algolia storyText 有 &#x2F; 這種未 decode 的 entity · 汙染關鍵字）
        'x2f','x27','x3c','x3e','amp','quot','apos','nbsp','lt','gt',
        // URL / HTML tag 殘骸
        'http','https','com','org','net','www','href','rel','nofollow','html','htm','href',
        // twitter / x.com 常見 URL 碎片
        'xcancel','status','tweet',
        '的','在','是','了','和','有','就','都','而','及','與','或','要','把','讓','從','很','也','但','如果','為什麼',
    ]);

    // HTML escape · 顯示已清淨的文字時再 escape 一層防 XSS
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // 清 HN storyText 的 HTML entity + URL + tag · 避免抽出「x2f · https · xcancel」這種垃圾
    function cleanText(t) {
        if (!t) return '';
        return t
            // 先 decode HTML entity（&#x2F; → / · &amp; → & 等）· 手動 decode 避開 DOM parse 成本
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
                const code = parseInt(h, 16);
                return code < 128 ? String.fromCharCode(code) : ' ';
            })
            .replace(/&#(\d+);/g, (_, d) => {
                const code = parseInt(d, 10);
                return code < 128 ? String.fromCharCode(code) : ' ';
            })
            .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, ' ')
            // 幹掉整段 URL · 保留周邊文字
            .replace(/https?:\/\/\S+/g, ' ')
            .replace(/www\.\S+/g, ' ')
            // 幹掉 HTML tag
            .replace(/<[^>]+>/g, ' ');
    }

    function extractKeywords(texts, minLen = 3) {
        const freq = new Map();
        texts.forEach(t => {
            const words = cleanText(t).toLowerCase()
                .replace(/[^\w\s一-龥]/g, ' ')
                .split(/\s+/)
                // 純數字也剔掉（年份 like 2026 例外會被下面 STOPWORDS 決定）
                .filter(w => w.length >= minLen && !STOPWORDS.has(w) && !/^\d+$/.test(w));
            words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
        });
        return Array.from(freq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30);
    }

    // ============================================================
    // Rendering
    // ============================================================
    function setStatus(cls, msg) {
        const el = $('query-status');
        el.className = `query-status ${cls}`;
        el.innerHTML = msg;
        el.hidden = false;
    }

    function renderYouTube(videos) {
        $('yt-count').textContent = `(${videos.length})`;
        if (videos.length === 0) {
            $('yt-stats').innerHTML = '<p class="hint">⚠️ YouTube 沒抓到影片（可能是 API key 沒填 · quota 用完 · 或關鍵字太冷）</p>';
            $('yt-table').innerHTML = '';
            return;
        }
        // Sort by views desc
        videos.sort((a, b) => b.views - a.views);

        // Stats
        const medianViews = videos[Math.floor(videos.length / 2)].views;
        const channelCount = new Map();
        videos.forEach(v => channelCount.set(v.channelTitle, (channelCount.get(v.channelTitle) || 0) + 1));
        const topChannels = Array.from(channelCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const durations = videos.map(v => parseISODuration(v.duration));
        const medianDur = durations.slice().sort((a, b) => a - b)[Math.floor(durations.length / 2)];

        // 標題 keyword freq (for insight)
        const kw = extractKeywords(videos.map(v => v.title));
        const topKw = kw.slice(0, 12);

        $('yt-stats').innerHTML = `
            <div class="stat-grid">
                <div class="stat-card"><div class="stat-label">影片數</div><div class="stat-val">${videos.length}</div></div>
                <div class="stat-card"><div class="stat-label">中位 views</div><div class="stat-val">${fmtNum(medianViews)}</div></div>
                <div class="stat-card"><div class="stat-label">中位時長</div><div class="stat-val">${Math.floor(medianDur / 60)}分</div></div>
                <div class="stat-card"><div class="stat-label">頻道數</div><div class="stat-val">${channelCount.size}</div></div>
            </div>
            <div class="chan-row">
                <h4>🏆 高產頻道 Top 5</h4>
                <div class="chan-chips">${topChannels.map(([n, c]) => `<span class="chan-chip">${n} <b>×${c}</b></span>`).join('')}</div>
            </div>
            <div class="kw-row">
                <h4>🔤 標題高頻詞（前 12）</h4>
                <div class="kw-chips">${topKw.map(([w, c]) => `<span class="kw-chip" style="font-size:${Math.min(1.4, 0.85 + c/videos.length * 0.6)}em">${w} <b>×${c}</b></span>`).join('')}</div>
            </div>
        `;

        const rows = videos.map((v, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><a href="https://youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener">${v.title}</a></td>
                <td>${v.channelTitle}</td>
                <td class="num-cell">${fmtNum(v.views)}</td>
                <td class="num-cell">${fmtNum(v.likes)}</td>
                <td class="num-cell">${fmtNum(v.comments)}</td>
                <td>${fmtDuration(v.duration)}</td>
                <td>${fmtDateAge(v.publishedAt)}</td>
            </tr>
        `).join('');
        $('yt-table').innerHTML = `
            <table class="result-table">
                <thead>
                    <tr><th>#</th><th>標題</th><th>頻道</th><th>觀看</th><th>讚</th><th>留言</th><th>時長</th><th>發布</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderReddit(scanResult) {
        const { posts, errors, perSub, unmatchedTop } = scanResult;
        $('rd-count').textContent = `(${posts.length})`;

        // 每個 sub 顯示狀態：綠 = 有 match / 黃 = fetch 通但 0 match / 紅 = fetch 掛
        // 掛的時候把完整 attemptLog（每個 proxy 個別 error + 耗時）用 title 掛上 hover 看
        const subSummary = perSub.map(s => {
            let cls = 'sub-badge';
            let icon = '';
            const viaTag = s.via && s.via !== 'direct' ? ` <em class="via-tag">(${s.via})</em>` : '';
            let text = `r/${s.sub} · ${s.matched}/${s.total}${viaTag}`;
            let title = '';
            if (s.error) {
                cls += ' sub-err'; icon = '❌';
                text = `r/${s.sub}`;
                title = ` title="${(s.error || '').replace(/"/g, '&quot;')}"`;
            }
            else if (s.matched === 0 && s.total > 0) { cls += ' sub-nomatch'; icon = '⚪'; }
            else if (s.matched > 0) { cls += ' sub-hit'; icon = '🎯'; }
            return `<span class="${cls}"${title}>${icon} ${text}</span>`;
        }).join('');

        // 從第一個掛的 sub 提取 attemptLog 當通用診斷（每個 sub 的 log 都一樣）
        const firstErr = perSub.find(s => s.error);
        const diagHtml = firstErr && firstErr.error
            ? `<details class="rd-diag" open><summary><b>🔬 逐一 proxy 診斷</b>（點開看每條路徑）</summary><div class="rd-diag-body">${firstErr.error}</div></details>`
            : '';
        const errMsg = errors.length > 0
            ? `<p class="hint hint-mini">⚠️ ${errors.length} 個 subreddit fetch 失敗（可能撞 IP rate limit）：${errors.join(' · ')}</p>`
            : '';
        const totalFetched = perSub.reduce((s, x) => s + x.total, 0);
        const okSubs = perSub.filter(s => !s.error).length;

        $('rd-stats').innerHTML = `
            <div class="stat-grid">
                <div class="stat-card"><div class="stat-label">符合貼文</div><div class="stat-val">${posts.length}</div></div>
                <div class="stat-card"><div class="stat-label">Sub 命中</div><div class="stat-val">${okSubs}/${perSub.length}</div></div>
                <div class="stat-card"><div class="stat-label">總撈 hot</div><div class="stat-val">${totalFetched}</div></div>
                <div class="stat-card"><div class="stat-label">最熱 sub</div><div class="stat-val" style="font-size:0.9em">${
                    perSub.reduce((best, s) => s.matched > best.matched ? s : best, { sub: '—', matched: 0 }).sub
                }</div></div>
            </div>
            <div class="sub-summary">
                <h4>📊 每個 subreddit 狀態（🎯 有 match · ⚪ fetch 通但 0 match · ❌ fetch 掛 · 滑上去看細節）</h4>
                <div class="sub-badges">${subSummary}</div>
            </div>
            ${diagHtml}
            ${errMsg}
        `;

        // Matched posts
        let matchedHtml = '';
        if (posts.length > 0) {
            const cards = posts.slice(0, 40).map(p => `
                <div class="rd-card">
                    <div class="rd-card-head">
                        <span class="sub-badge sub-hit">r/${p.subreddit}</span>
                        ${p.flair ? `<span class="flair">${p.flair}</span>` : ''}
                        <span class="rd-age">${fmtDateAge(new Date(p.created).toISOString())}</span>
                    </div>
                    <div class="rd-card-title"><a href="${p.url}" target="_blank" rel="noopener">${p.title}</a></div>
                    ${p.selftext ? `<div class="rd-card-preview">${p.selftext.slice(0, 200)}${p.selftext.length > 200 ? '…' : ''}</div>` : ''}
                    <div class="rd-card-meta">
                        ⬆️ ${fmtNum(p.score)} · 💬 ${fmtNum(p.comments)} · u/${p.author}
                    </div>
                </div>
            `).join('');
            matchedHtml = `<h4 style="margin-top:16px">🎯 符合關鍵字（${posts.length}）</h4><div class="rd-grid">${cards}</div>`;
        } else {
            matchedHtml = `<p class="hint" style="margin-top:14px">⚠️ 沒有符合關鍵字的貼文 · 但下方有各 sub 的 hot 3 · 看看是不是換個關鍵字更貼近討論</p>`;
        }

        // Unmatched top（讓使用者看到 sub 到底在聊什麼）
        let unmatchedHtml = '';
        if (unmatchedTop.length > 0) {
            const groups = unmatchedTop.map(g => {
                const cards = g.top.map(p => `
                    <div class="rd-card rd-card-dim">
                        <div class="rd-card-head">
                            <span class="rd-age">${fmtDateAge(new Date(p.created).toISOString())}</span>
                        </div>
                        <div class="rd-card-title"><a href="${p.url}" target="_blank" rel="noopener">${p.title}</a></div>
                        <div class="rd-card-meta">
                            ⬆️ ${fmtNum(p.score)} · 💬 ${fmtNum(p.comments)} · u/${p.author}
                        </div>
                    </div>
                `).join('');
                return `
                    <div class="unmatched-sub">
                        <h5>r/${g.sub}（沒 match 你的關鍵字 · 但這是本 sub 的熱門 3 篇）</h5>
                        <div class="rd-grid">${cards}</div>
                    </div>
                `;
            }).join('');
            unmatchedHtml = `
                <details class="unmatched-details" open>
                    <summary><b>🔍 沒 match 的 sub 在聊什麼</b>（可能你的關鍵字太窄 · 看看要不要換）</summary>
                    ${groups}
                </details>
            `;
        }

        $('rd-list').innerHTML = matchedHtml + unmatchedHtml;
    }

    function renderHN(hnResult, topic) {
        const { posts, error, dt, totalHits } = hnResult;
        $('hn-count').textContent = `(${posts.length})`;

        if (error) {
            $('hn-stats').innerHTML = `<p class="hint">❌ HN 撈失敗：${error}</p>`;
            $('hn-list').innerHTML = '';
            return;
        }
        if (posts.length === 0) {
            $('hn-stats').innerHTML = `<p class="hint">⚪ HN 沒找到「${topic}」相關 story · Algolia 全庫 ${totalHits} 筆命中 · 可能關鍵字太窄</p>`;
            $('hn-list').innerHTML = '';
            return;
        }

        // Stats
        const medianPoints = posts[Math.floor(posts.length / 2)].points;
        const topPoints = posts[0].points;
        const totalComments = posts.reduce((s, p) => s + p.comments, 0);
        const kw = extractKeywords(posts.map(p => p.title + ' ' + p.storyText));
        const topKw = kw.slice(0, 12);
        const recentPosts = posts.filter(p => (Date.now() - p.created) < 90 * 86400 * 1000).length;

        $('hn-stats').innerHTML = `
            <div class="stat-grid">
                <div class="stat-card"><div class="stat-label">符合 story</div><div class="stat-val">${posts.length}</div></div>
                <div class="stat-card"><div class="stat-label">中位 points</div><div class="stat-val">${fmtNum(medianPoints)}</div></div>
                <div class="stat-card"><div class="stat-label">最高 points</div><div class="stat-val">${fmtNum(topPoints)}</div></div>
                <div class="stat-card"><div class="stat-label">近 90 天</div><div class="stat-val">${recentPosts}</div></div>
                <div class="stat-card"><div class="stat-label">總留言</div><div class="stat-val">${fmtNum(totalComments)}</div></div>
                <div class="stat-card"><div class="stat-label">Algolia 全庫</div><div class="stat-val">${fmtNum(totalHits)}</div></div>
            </div>
            <div class="kw-row">
                <h4>🔤 標題高頻詞（前 12）</h4>
                <div class="kw-chips">${topKw.map(([w, c]) => `<span class="kw-chip">${w} <b>×${c}</b></span>`).join('')}</div>
            </div>
            <p class="hint hint-mini">⏱ Algolia 回應 ${dt}ms · story 依 points 由高到低排</p>
        `;

        const cards = posts.slice(0, 40).map(p => `
            <div class="hn-card">
                <div class="hn-card-head">
                    <span class="hn-points">⬆️ ${fmtNum(p.points)}</span>
                    <span class="hn-comments">💬 ${fmtNum(p.comments)}</span>
                    <span class="rd-age">${fmtDateAge(new Date(p.created).toISOString())}</span>
                </div>
                <div class="rd-card-title">
                    <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a>
                </div>
                ${p.storyText ? `<div class="rd-card-preview">${escapeHtml(p.storyText)}${p.storyText.length >= 300 ? '…' : ''}</div>` : ''}
                <div class="rd-card-meta">
                    u/${escapeHtml(p.author)} · <a href="${escapeHtml(p.hnUrl)}" target="_blank" rel="noopener">HN 討論串 →</a>
                </div>
            </div>
        `).join('');
        $('hn-list').innerHTML = `<div class="rd-grid">${cards}</div>`;
    }

    function renderCross(videos, redditPosts, topic, redditScanResult, hnResult) {
        // 「討論訊號」= Reddit ∪ HN · 只要有一邊活躍就算用戶在討論
        // HN 目前是主力（Reddit 對 browser 封殺 · 常拿 0）
        const hnPosts = (hnResult && hnResult.posts) || [];
        const discussionPosts = [...redditPosts, ...hnPosts];
        // discussion side 的關鍵字：Reddit title + selftext + HN title + storyText 都算
        const discussionTexts = [
            ...redditPosts.map(p => p.title + ' ' + p.selftext.slice(0, 150)),
            ...hnPosts.map(p => p.title + ' ' + p.storyText.slice(0, 150)),
        ];
        // 從兩邊 title 抽關鍵字
        const ytKw = extractKeywords(videos.map(v => v.title)).map(([w]) => w);
        const rdKw = extractKeywords(discussionTexts).map(([w]) => w);
        const ytSet = new Set(ytKw);
        const rdSet = new Set(rdKw);
        const both = ytKw.filter(w => rdSet.has(w)).slice(0, 15);
        const ytOnly = ytKw.filter(w => !rdSet.has(w)).slice(0, 12);
        const rdOnly = rdKw.filter(w => !ytSet.has(w)).slice(0, 12);

        // 4 象限判定
        const ytHot = videos.length >= 15 && videos[0]?.views > 50_000;
        const rdHot = redditPosts.length >= 8 && redditPosts[0]?.score > 100;
        // HN「熱」= 近 90 天有 3+ 篇 >= 50 points · 而非拿歷史 max
        // 為什麼：Algolia 按 relevance 排 · 8 月前一次 launch 的 800 分文永遠會在 top · 但那不代表話題「當前」熱
        // 「近 90 天 & 有一定分數」才反映當前討論動能——避免「已過氣但曾爆紅」被誤讀為活熱
        const HN_HOT_WINDOW_MS = 90 * 86400 * 1000;
        const HN_HOT_MIN_POINTS = 50;
        const HN_HOT_MIN_COUNT = 3;
        const hnRecent = hnPosts.filter(p => (Date.now() - p.created) < HN_HOT_WINDOW_MS);
        const hnRecentSubstantive = hnRecent.filter(p => p.points >= HN_HOT_MIN_POINTS);
        const hnHot = hnRecentSubstantive.length >= HN_HOT_MIN_COUNT;
        const discussionHot = rdHot || hnHot;
        // 找出討論方是哪邊主導（顯示用）
        const discussionSrc = rdHot && hnHot ? 'Reddit + HN' : rdHot ? 'Reddit' : hnHot ? 'HN' : '';
        let verdict, verdictClass, verdictAdvice;
        if (ytHot && discussionHot) {
            verdict = `🔥 兩邊都熱 · 主流話題（討論方：${discussionSrc}）`;
            verdictClass = 'v-hot';
            verdictAdvice = '競爭激烈 · 要有明確差異化角度才殺得進去（更深、更快、更專某個 sub-niche）';
        } else if (discussionHot && !ytHot) {
            verdict = `🎯 ${discussionSrc} 熱 · YouTube 沒 · 選題缺口`;
            verdictClass = 'v-gap';
            verdictAdvice = '<b>你的機會</b>——有真實需求（用戶主動討論）· 但沒 KOL 做教程 · 值得投入';
        } else if (ytHot && !discussionHot) {
            verdict = '⚠️ YouTube 熱 · 用戶沒討論 · KOL 假熱';
            verdictClass = 'v-fake';
            verdictAdvice = '<b>小心</b>——高機率是行銷波 / 平台推薦演算法炒作 · Reddit + HN 都沒動靜 · 進場前確認需求';
        } else {
            verdict = '❄️ 兩邊都冷 · 冷門話題';
            verdictClass = 'v-cold';
            verdictAdvice = '沒需求 or 太 niche · 別浪費時間 · 換關鍵字或角度';
        }

        // Reddit 健康度診斷（讓使用者一眼看到 Reddit 到底有沒有正常運作）
        let rdHealthHtml = '';
        if (redditScanResult && redditScanResult.perSub) {
            const perSub = redditScanResult.perSub;
            const okSubs = perSub.filter(s => !s.error).length;
            const errSubs = perSub.filter(s => s.error).length;
            const hitSubs = perSub.filter(s => s.matched > 0).length;
            const totalHot = perSub.reduce((sum, s) => sum + s.total, 0);
            let healthClass, healthMsg;
            if (errSubs === perSub.length) {
                healthClass = 'rd-health-fail';
                healthMsg = `❌ <b>Reddit 全部 fetch 失敗</b>（${errSubs}/${perSub.length} 掛）· 很可能是 Reddit 封 browser 直連 · 需上 CORS proxy · 切到 💬 Reddit tab 看細節`;
            } else if (okSubs > 0 && hitSubs === 0) {
                healthClass = 'rd-health-warn';
                healthMsg = `⚪ Reddit 撈到 <b>${totalHot} 篇 hot</b>（${okSubs}/${perSub.length} sub OK）· 但沒 match「${topic}」· 可能關鍵字太窄——切到 💬 Reddit tab 看每個 sub 在聊什麼`;
            } else if (errSubs > 0) {
                healthClass = 'rd-health-mixed';
                healthMsg = `⚠️ Reddit ${errSubs}/${perSub.length} sub 掛 · ${hitSubs} 個 sub 有 match · 部分數據可信 · 切到 💬 Reddit tab 看哪些掛`;
            }
            if (healthMsg) {
                rdHealthHtml = `<div class="rd-health ${healthClass}">${healthMsg}</div>`;
            }
        }

        $('cross-verdict').innerHTML = `
            <div class="cross-verdict ${verdictClass}">
                <div class="cross-verdict-title">${verdict}</div>
                <div class="cross-verdict-body">${verdictAdvice}</div>
            </div>
            ${rdHealthHtml}
        `;

        $('cross-cells').innerHTML = `
            <div class="cross-quad cross-quad-3">
                <div class="cq-cell">
                    <div class="cq-label">📺 YouTube 訊號強度</div>
                    <div class="cq-val">${videos.length} 支影片</div>
                    <div class="cq-sub">中位 views: ${videos.length ? fmtNum(videos[Math.floor(videos.length / 2)].views) : '—'}</div>
                    <div class="cq-sub">最高 views: ${videos.length ? fmtNum(videos[0].views) : '—'}</div>
                    <div class="cq-verdict">${ytHot ? '<b class="hot">🔥 熱</b>' : '<b class="cold">❄️ 冷</b>'}</div>
                </div>
                <div class="cq-cell">
                    <div class="cq-label">🧡 HN 訊號強度</div>
                    <div class="cq-val">${hnPosts.length} 篇 story</div>
                    <div class="cq-sub">近 90 天：<b>${hnRecent.length}</b> 篇</div>
                    <div class="cq-sub">近 90 天 ≥${HN_HOT_MIN_POINTS} pts：<b>${hnRecentSubstantive.length}</b> 篇 ${hnHot ? '✅' : ''}</div>
                    <div class="cq-sub">歷史頂樓：${hnPosts.length ? fmtNum(hnPosts[0].points) : '—'} pts</div>
                    <div class="cq-verdict">${hnHot ? '<b class="hot">🔥 熱（當前）</b>' : hnPosts.length && hnPosts[0]?.points > 100 ? '<b class="cold">💤 曾爆紅但當前無</b>' : '<b class="cold">❄️ 冷</b>'}</div>
                </div>
                <div class="cq-cell">
                    <div class="cq-label">💬 Reddit 訊號強度</div>
                    <div class="cq-val">${redditPosts.length} 篇貼文</div>
                    <div class="cq-sub">中位 score: ${redditPosts.length ? fmtNum(redditPosts[Math.floor(redditPosts.length / 2)].score) : '—'}</div>
                    <div class="cq-sub">最高 score: ${redditPosts.length ? fmtNum(redditPosts[0].score) : '—'}</div>
                    <div class="cq-verdict">${rdHot ? '<b class="hot">🔥 熱</b>' : '<b class="cold">❄️ 冷</b>'}</div>
                </div>
            </div>
        `;

        $('cross-keywords').innerHTML = `
            <div class="kw-cross">
                <div class="kw-cross-cell">
                    <h4>🔗 兩邊都有的關鍵字（${both.length}）</h4>
                    <div class="kw-chips">${both.map(w => `<span class="kw-chip kw-both">${w}</span>`).join('') || '<span class="hint-mini">無交集</span>'}</div>
                    <p class="hint-mini">👉 這些是<b>主流關鍵字</b> · 兩邊都在討論 · 內容要脫穎而出很難</p>
                </div>
                <div class="kw-cross-cell">
                    <h4>📺 YouTube 有 · 討論方沒（${ytOnly.length}）</h4>
                    <div class="kw-chips">${ytOnly.map(w => `<span class="kw-chip kw-yt">${w}</span>`).join('') || '<span class="hint-mini">無</span>'}</div>
                    <p class="hint-mini">⚠️ KOL 在講但用戶沒討論 · <b>可能是宣傳向</b>（教程 / 廣告 / SEO）</p>
                </div>
                <div class="kw-cross-cell">
                    <h4>💬 討論方有 · YouTube 沒（${rdOnly.length}）</h4>
                    <div class="kw-chips">${rdOnly.map(w => `<span class="kw-chip kw-rd">${w}</span>`).join('') || '<span class="hint-mini">無</span>'}</div>
                    <p class="hint-mini">🎯 <b>選題缺口</b>——用戶關心但沒教程 · 這裡是機會</p>
                </div>
            </div>
        `;
    }

    // ============================================================
    // Main scan flow
    // ============================================================
    async function scanTopic() {
        const topic = ($('topic-input').value || '').trim();
        if (!topic) { alert('請輸入主題'); return; }

        setStatus('loading', `⏳ 掃描 "${topic}" 中……`);
        const btn = $('btn-search');
        btn.disabled = true;

        try {
            // 並行拉 YouTube + Reddit + HN
            const ytKey = getYtKey();
            const ytPromise = ytKey
                ? (async () => {
                    const searchResults = await ytSearch(topic, ytKey);
                    const videoIds = searchResults.map(r => r.videoId).filter(Boolean);
                    return await ytVideosBatch(videoIds, ytKey);
                })().catch(e => { console.error('YT fail', e); return { __err: e.message }; })
                : Promise.resolve({ __err: '沒 YouTube key' });
            const rdPromise = redditScan(topic).catch(e => { console.error('RD fail', e); return { posts: [], errors: [e.message], perSub: [], unmatchedTop: [] }; });
            const hnPromise = hnSearch(topic).catch(e => { console.error('HN fail', e); return { posts: [], error: e.message }; });

            const [ytResult, rdResult, hnResult] = await Promise.all([ytPromise, rdPromise, hnPromise]);

            const videos = Array.isArray(ytResult) ? ytResult : [];
            const ytErr = ytResult && ytResult.__err ? ytResult.__err : null;
            const redditPosts = rdResult.posts || [];
            const hnPosts = hnResult.posts || [];

            renderYouTube(videos);
            renderReddit(rdResult);
            renderHN(hnResult, topic);
            renderCross(videos, redditPosts, topic, rdResult, hnResult);

            $('result-panel').hidden = false;
            const msgParts = [];
            if (videos.length > 0) msgParts.push(`YouTube ${videos.length} 支`);
            else if (ytErr) msgParts.push(`YouTube 失敗（${ytErr}）`);
            if (hnPosts.length > 0) msgParts.push(`HN ${hnPosts.length} 篇`);
            if (redditPosts.length > 0) msgParts.push(`Reddit ${redditPosts.length} 篇`);
            setStatus('success', `✅ 掃描完成：${msgParts.join(' · ')}`);
        } catch (e) {
            setStatus('error', `❌ ${e.message}`);
            console.error(e);
        } finally {
            btn.disabled = false;
        }
    }

    // ============================================================
    // Tab switching
    // ============================================================
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('.tab-content').forEach(c => c.hidden = c.id !== `tab-${tab}`);
            });
        });
    }

    // ============================================================
    // Init
    // ============================================================
    // ============================================================
    // Reddit 連線診斷（逐一 ping direct + 每個 proxy）
    // ============================================================
    async function testRedditConnectivity() {
        const box = $('reddit-diag');
        box.hidden = false;
        box.innerHTML = '<p class="hint">⏳ 逐一測試中……</p>';
        const testSub = 'ClaudeAI';   // 拿一個確定有內容的 sub 測
        const upstream = `https://old.reddit.com/r/${testSub}/hot.json?limit=1&raw_json=1`;
        const targets = [
            { name: 'direct old.reddit', url: upstream },
            { name: 'direct www.reddit', url: `https://www.reddit.com/r/${testSub}/hot.json?limit=1` },
            ...REDDIT_PROXIES.map(p => ({ name: p.name, url: p.build(upstream) })),
        ];
        const rows = [];
        for (const t of targets) {
            const t0 = performance.now();
            let status = '', detail = '';
            try {
                const res = await fetch(t.url, { headers: { 'Accept': 'application/json' } });
                const dt = Math.round(performance.now() - t0);
                if (res.ok) {
                    try {
                        const data = await res.json();
                        const n = data.data?.children?.length || 0;
                        status = n > 0 ? '✅ OK' : '⚠️ empty';
                        detail = `${dt}ms · ${n} posts`;
                    } catch (e) {
                        status = '⚠️ not-json';
                        detail = `${dt}ms · ${e.message.slice(0, 40)}`;
                    }
                } else {
                    status = `❌ HTTP ${res.status}`;
                    detail = `${dt}ms · ${res.statusText}`;
                }
            } catch (e) {
                const dt = Math.round(performance.now() - t0);
                status = /Failed to fetch|NetworkError|ERR_/.test(e.message) ? '❌ NETERR' : '❌ ERR';
                detail = `${dt}ms · ${e.message.slice(0, 60)}`;
            }
            rows.push(`<tr><td>${t.name}</td><td>${status}</td><td class="diag-detail">${detail}</td></tr>`);
            box.innerHTML = `
                <h4>🔬 Reddit 連線診斷（測試主體：r/${testSub}）</h4>
                <table class="diag-table">
                    <thead><tr><th>路徑</th><th>結果</th><th>細節</th></tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
                <p class="hint hint-mini">${targets.length === rows.length ? '✅ 測完 · 若全 NETERR · 可能是網路 / extension / 地區封鎖 Reddit + proxy · 若某條 OK · scanTopic 會自動用那條' : '⏳ 進行中……'}</p>
            `;
        }
    }

    function init() {
        // 版本標記顯示在 footer · 眼看得到跑的是哪版
        const verEl = document.getElementById('radar-ver');
        if (verEl) verEl.textContent = RADAR_VERSION;
        loadYtKey();
        initTabs();
        $('btn-save-yt').addEventListener('click', saveYtKey);
        $('btn-clear-yt').addEventListener('click', clearYtKey);
        $('btn-search').addEventListener('click', scanTopic);
        $('btn-test-reddit').addEventListener('click', testRedditConnectivity);
        $('topic-input').addEventListener('keydown', e => { if (e.key === 'Enter') scanTopic(); });

        // URL query 支援 ?topic=X · 自動填入 + 掃
        const params = new URLSearchParams(window.location.search);
        const urlTopic = params.get('topic');
        if (urlTopic) {
            $('topic-input').value = urlTopic;
            if (getYtKey()) setTimeout(scanTopic, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
