(() => {
    'use strict';

    // ============================================================
    // 主題雷達 · YouTube × Reddit 交叉監聽
    // 純瀏覽器 SPA · YouTube 用 Data API v3 · Reddit 用 public .json
    // ============================================================

    const YT_KEY_STORAGE = 'yt_data_api_key';
    const YT_API = 'https://www.googleapis.com/youtube/v3';

    // AI 相關 subreddit 清單（掃描目標）
    // 選這 6 個因為 AI agent / LLM 主題討論最集中在這裡
    const AI_SUBREDDITS = [
        'LocalLLaMA',
        'OpenAI',
        'singularity',
        'ArtificialInteligence',
        'ChatGPT',
        'MachineLearning',
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
        // /search?part=snippet&q={topic}&type=video&maxResults=25&order=viewCount
        // 為什麼用 viewCount 而不是 relevance：viewCount 排序過濾掉 low-quality 新影片
        //   避免加密營銷號那種「今天發佈 200 views」的雜訊
        //   若使用者要看新影片動能 · 之後可加 sort toggle
        const url = `${YT_API}/search?part=snippet&type=video&q=${encodeURIComponent(topic)}&maxResults=25&order=viewCount&key=${apiKey}`;
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
    async function redditHot(subreddit, limit = 25) {
        // https://www.reddit.com/r/{sub}/hot.json?limit=25
        // 有 CORS · 不用 auth · 但 IP 級 rate limit ~60/min
        const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return { subreddit, posts: [], error: `HTTP ${res.status}` };
            const data = await res.json();
            const posts = (data.data?.children || []).map(c => ({
                subreddit,
                title: c.data.title,
                url: `https://reddit.com${c.data.permalink}`,
                score: c.data.score,
                comments: c.data.num_comments,
                created: c.data.created_utc * 1000,   // epoch ms
                author: c.data.author,
                selftext: (c.data.selftext || '').slice(0, 300),
                isSelf: c.data.is_self,
                flair: c.data.link_flair_text || '',
            }));
            return { subreddit, posts, error: null };
        } catch (e) {
            return { subreddit, posts: [], error: e.message };
        }
    }

    // 平行拉全部 subreddit · 個別失敗不擋
    async function redditScan(topic) {
        const results = await Promise.all(AI_SUBREDDITS.map(s => redditHot(s, 25)));
        // 過濾包含關鍵字的 post（title 或 selftext 有）· case-insensitive
        // topic 可能是多字：拆成關鍵字 · 至少 match 1 個就算
        const kw = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matched = [];
        results.forEach(r => {
            r.posts.forEach(p => {
                const text = (p.title + ' ' + p.selftext).toLowerCase();
                if (kw.length === 0 || kw.some(k => text.includes(k))) {
                    matched.push(p);
                }
            });
        });
        matched.sort((a, b) => b.score - a.score);
        return {
            posts: matched,
            errors: results.filter(r => r.error).map(r => `${r.subreddit}: ${r.error}`),
            perSub: results.map(r => ({ sub: r.subreddit, total: r.posts.length, matched: r.posts.filter(p => {
                const t = (p.title + ' ' + p.selftext).toLowerCase();
                return kw.length === 0 || kw.some(k => t.includes(k));
            }).length })),
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
        'ai','llm','video','ep','part','tutorial','ep','vs',
        '的','在','是','了','和','有','就','都','而','及','與','或','要','把','讓','從','很','也','但','如果','為什麼',
    ]);

    function extractKeywords(texts, minLen = 3) {
        const freq = new Map();
        texts.forEach(t => {
            const words = (t || '').toLowerCase()
                .replace(/[^\w\s一-龥]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= minLen && !STOPWORDS.has(w));
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
        const { posts, errors, perSub } = scanResult;
        $('rd-count').textContent = `(${posts.length})`;

        let subSummary = perSub.map(s => `<span class="sub-badge">${s.sub} · ${s.matched}/${s.total}</span>`).join('');
        let errMsg = errors.length > 0 ? `<p class="hint hint-mini">⚠️ ${errors.length} 個 subreddit fetch 失敗：${errors.join(' · ')}</p>` : '';

        $('rd-stats').innerHTML = `
            <div class="stat-grid">
                <div class="stat-card"><div class="stat-label">符合貼文</div><div class="stat-val">${posts.length}</div></div>
                <div class="stat-card"><div class="stat-label">總 score</div><div class="stat-val">${fmtNum(posts.reduce((s, p) => s + p.score, 0))}</div></div>
                <div class="stat-card"><div class="stat-label">總 comments</div><div class="stat-val">${fmtNum(posts.reduce((s, p) => s + p.comments, 0))}</div></div>
                <div class="stat-card"><div class="stat-label">最熱 sub</div><div class="stat-val" style="font-size:0.9em">${
                    perSub.reduce((best, s) => s.matched > best.matched ? s : best, { sub: '—', matched: 0 }).sub
                }</div></div>
            </div>
            <div class="sub-summary">
                <h4>📊 每個 subreddit 命中率</h4>
                <div class="sub-badges">${subSummary}</div>
            </div>
            ${errMsg}
        `;

        if (posts.length === 0) {
            $('rd-list').innerHTML = '<p class="hint">⚠️ 沒有符合關鍵字的貼文（可能 subreddit 熱門區沒討論這個 · 試更寬的關鍵字）</p>';
            return;
        }

        const cards = posts.slice(0, 40).map(p => `
            <div class="rd-card">
                <div class="rd-card-head">
                    <span class="sub-badge">r/${p.subreddit}</span>
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
        $('rd-list').innerHTML = `<div class="rd-grid">${cards}</div>`;
    }

    function renderCross(videos, redditPosts, topic) {
        // 從兩邊 title 抽關鍵字
        const ytKw = extractKeywords(videos.map(v => v.title)).map(([w]) => w);
        const rdKw = extractKeywords(redditPosts.map(p => p.title + ' ' + p.selftext.slice(0, 150))).map(([w]) => w);
        const ytSet = new Set(ytKw);
        const rdSet = new Set(rdKw);
        const both = ytKw.filter(w => rdSet.has(w)).slice(0, 15);
        const ytOnly = ytKw.filter(w => !rdSet.has(w)).slice(0, 12);
        const rdOnly = rdKw.filter(w => !ytSet.has(w)).slice(0, 12);

        // 4 象限判定
        const ytHot = videos.length >= 15 && videos[0]?.views > 50_000;
        const rdHot = redditPosts.length >= 8 && redditPosts[0]?.score > 100;
        let verdict, verdictClass, verdictAdvice;
        if (ytHot && rdHot) {
            verdict = '🔥 兩邊都熱 · 主流話題';
            verdictClass = 'v-hot';
            verdictAdvice = '競爭激烈 · 要有明確差異化角度才殺得進去（更深、更快、更專某個 sub-niche）';
        } else if (rdHot && !ytHot) {
            verdict = '🎯 Reddit 熱 · YouTube 沒 · 選題缺口';
            verdictClass = 'v-gap';
            verdictAdvice = '<b>你的機會</b>——有真實需求（Reddit 用戶主動討論）· 但沒 KOL 做教程 · 值得投入';
        } else if (ytHot && !rdHot) {
            verdict = '⚠️ YouTube 熱 · Reddit 沒 · KOL 假熱';
            verdictClass = 'v-fake';
            verdictAdvice = '<b>小心</b>——高機率是行銷波 / 平台推薦演算法炒作 · 沒真實用戶討論 · 進場前確認需求';
        } else {
            verdict = '❄️ 兩邊都冷 · 冷門話題';
            verdictClass = 'v-cold';
            verdictAdvice = '沒需求 or 太 niche · 別浪費時間 · 換關鍵字或角度';
        }

        $('cross-verdict').innerHTML = `
            <div class="cross-verdict ${verdictClass}">
                <div class="cross-verdict-title">${verdict}</div>
                <div class="cross-verdict-body">${verdictAdvice}</div>
            </div>
        `;

        $('cross-cells').innerHTML = `
            <div class="cross-quad">
                <div class="cq-cell">
                    <div class="cq-label">📺 YouTube 訊號強度</div>
                    <div class="cq-val">${videos.length} 支影片</div>
                    <div class="cq-sub">中位 views: ${videos.length ? fmtNum(videos[Math.floor(videos.length / 2)].views) : '—'}</div>
                    <div class="cq-sub">最高 views: ${videos.length ? fmtNum(videos[0].views) : '—'}</div>
                    <div class="cq-verdict">${ytHot ? '<b class="hot">🔥 熱</b>' : '<b class="cold">❄️ 冷</b>'}</div>
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
                    <h4>📺 YouTube 有 · Reddit 沒（${ytOnly.length}）</h4>
                    <div class="kw-chips">${ytOnly.map(w => `<span class="kw-chip kw-yt">${w}</span>`).join('') || '<span class="hint-mini">無</span>'}</div>
                    <p class="hint-mini">⚠️ KOL 在講但用戶沒討論 · <b>可能是宣傳向</b>（教程 / 廣告 / SEO）</p>
                </div>
                <div class="kw-cross-cell">
                    <h4>💬 Reddit 有 · YouTube 沒（${rdOnly.length}）</h4>
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
            // 並行拉 YouTube 跟 Reddit
            const ytKey = getYtKey();
            const ytPromise = ytKey
                ? (async () => {
                    const searchResults = await ytSearch(topic, ytKey);
                    const videoIds = searchResults.map(r => r.videoId).filter(Boolean);
                    return await ytVideosBatch(videoIds, ytKey);
                })().catch(e => { console.error('YT fail', e); return { __err: e.message }; })
                : Promise.resolve({ __err: '沒 YouTube key' });
            const rdPromise = redditScan(topic).catch(e => { console.error('RD fail', e); return { posts: [], errors: [e.message], perSub: [] }; });

            const [ytResult, rdResult] = await Promise.all([ytPromise, rdPromise]);

            const videos = Array.isArray(ytResult) ? ytResult : [];
            const ytErr = ytResult && ytResult.__err ? ytResult.__err : null;
            const redditPosts = rdResult.posts || [];

            renderYouTube(videos);
            renderReddit(rdResult);
            renderCross(videos, redditPosts, topic);

            $('result-panel').hidden = false;
            const msgParts = [];
            if (videos.length > 0) msgParts.push(`YouTube ${videos.length} 支`);
            else if (ytErr) msgParts.push(`YouTube 失敗（${ytErr}）`);
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
    function init() {
        loadYtKey();
        initTabs();
        $('btn-save-yt').addEventListener('click', saveYtKey);
        $('btn-clear-yt').addEventListener('click', clearYtKey);
        $('btn-search').addEventListener('click', scanTopic);
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
