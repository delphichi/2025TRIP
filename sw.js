const CACHE_NAME = 'family-trip-cache-v1';
// 列出所有需要被快取（即離線儲存）的檔案路徑
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/manifest.json',
    // 如果您加入了圖示，也請務必快取它們
    '/icon-192.png',
    '/icon-512.png'
    // 這裡可以根據需要加入更多行程頁面或圖片
];

// 1. 安裝階段 (Installation)
// Service Worker 第一次安裝時，將所有核心資源快取起來
self.addEventListener('install', event => {
    // 確保安裝完成前，Service Worker 不會進入下一階段
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and cached core assets');
                // 將所有 urlsToCache 中的資源加入快取
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. 啟動階段 (Activation)
// 清理舊版本的快取，確保用戶使用的是最新版本
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 如果快取名稱不在白名單中，則刪除它
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 3. 擷取階段 (Fetch)
// 攔截所有網路請求，優先從快取中回應
self.addEventListener('fetch', event => {
    // 檢查快取中是否有匹配的資源
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 如果快取中找到了，就直接回傳快取資源
                if (response) {
                    return response;
                }
                // 否則，正常發起網路請求
                return fetch(event.request);
            })
    );
});