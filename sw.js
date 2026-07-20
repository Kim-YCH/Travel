/* Travel Service Worker
 *
 * 目的很單一：讓已加到主畫面的 App 在完全沒有網路時仍然開得起來。
 * 原本的離線機制（pendingSyncQueue 與 localStorage 快取）只在分頁已經開著時有用；
 * 出國後重新開啟 App 才是最常見的情境，那需要 App Shell 被快取。
 *
 * 版本號要與 config.js 的 APP_VERSION 一致，tests/run.js 會檢查。
 * 靜態資源都帶 ?v= 版本，換版即換 URL，所以本地資源用 cache-first 是安全的。
 */
'use strict';

const VERSION = '20260720.2';
const SHELL_CACHE = `travel-shell-${VERSION}`;
const CDN_CACHE = `travel-cdn-${VERSION}`;

// 本地 App Shell。必須快取成功，否則離線就開不起來。
const SHELL_ASSETS = [
  './',
  `./index.html?v=${VERSION}`,
  `./style.css?v=${VERSION}`,
  `./cloud-theme.css?v=${VERSION}`,
  `./config.js?v=${VERSION}`,
  `./cache-refresh.js?v=${VERSION}`,
  `./keyword-map.js?v=${VERSION}`,
  `./js/utils.js?v=${VERSION}`,
  `./js/api.js?v=${VERSION}`,
  `./js/cache.js?v=${VERSION}`,
  `./js/maps.js?v=${VERSION}`,
  `./js/places.js?v=${VERSION}`,
  `./js/itinerary.js?v=${VERSION}`,
  `./js/hotels.js?v=${VERSION}`,
  `./js/expenses.js?v=${VERSION}`,
  `./js/weather.js?v=${VERSION}`,
  `./js/export.js?v=${VERSION}`,
  `./js/probe-search.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  `./search-zh-label.js?v=${VERSION}`,
  `./prep-checklist.js?v=${VERSION}`,
  `./site.webmanifest?v=${VERSION}`,
  `./favicon.svg?v=${VERSION}`,
  `./favicon-32x32.png?v=${VERSION}`,
  `./apple-touch-icon.png?v=${VERSION}`,
  './icon-192.png',
  './icon-512.png'
];

// 第三方框架。抓不到不該讓整個安裝失敗，所以逐一嘗試。
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.prod.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
];

// 這些一律走網路：資料要最新，而且 JSONP 回應帶著一次性 callback 名稱，快取了只會拿到過期資料。
const NETWORK_ONLY_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'maps.googleapis.com',
  'api.open-meteo.com'
];

const isNetworkOnly = (url) => NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_ASSETS);

    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        // no-cors 讓沒有 CORS 標頭的 CDN 也能存成 opaque response，<script> 仍可使用。
        const res = await fetch(url, { mode: 'no-cors', cache: 'reload' });
        await cdn.put(url, res);
      } catch (err) {
        console.warn('[sw] CDN precache failed:', url, err);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('travel-') && key !== SHELL_CACHE && key !== CDN_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// 「刷新版本 / 重新載入」按鈕會送這個訊息，讓等待中的新 SW 立刻接手。
self.addEventListener('message', (event) => {
  if (event.data === 'TRAVEL_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isNetworkOnly(url)) return;

  // 導覽請求走 network-first，這樣重新部署後能拿到新版；離線時退回快取的 index.html。
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(`./index.html?v=${VERSION}`))
          || (await cache.match('./'))
          || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // 本地資源帶版本 query string，換版就是換 URL，cache-first 不會拿到舊檔。
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  if (CDN_ASSETS.some((asset) => req.url.startsWith(asset))) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        const cache = await caches.open(CDN_CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
  }
});
