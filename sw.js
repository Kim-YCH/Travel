/* Travel Service Worker
 *
 * Keep this VERSION in sync with config.js APP_VERSION. tests/run.js verifies
 * every local asset listed in index.html is covered here.
 *
 * Vue 與 Sortable 自 20260818.1 起自家託管（vendor/），不再依賴 CDN。
 * 舊版把它們放在含版本號的 CDN_CACHE，每次改版都得重新向 jsdelivr 抓一次；
 * 抓失敗時 install 只 console.warn 不中止，接著 activate 又刪掉舊快取 ——
 * 人在國外按「刷新版本」剛好連不到 CDN，離線就再也開不起來。
 */
'use strict';

const VERSION = '20260831.7';
const SHELL_CACHE = `travel-shell-${VERSION}`;

const SHELL_ASSETS = [
  './',
  `./index.html?v=${VERSION}`,
  `./desktop/index.html?v=${VERSION}`,
  `./desktop/desktop.css?v=${VERSION}`,
  `./tailwind-static.css?v=${VERSION}`,
  `./style.css?v=${VERSION}`,
  `./cloud-theme.css?v=${VERSION}`,
  `./vendor/vue.global.prod.js?v=${VERSION}`,
  `./vendor/Sortable.min.js?v=${VERSION}`,
  `./config.js?v=${VERSION}`,
  `./cache-refresh.js?v=${VERSION}`,
  `./keyword-map.js?v=${VERSION}`,
  `./js/device-router.js?v=${VERSION}`,
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

const NETWORK_ONLY_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'maps.googleapis.com',
  'api.open-meteo.com'
];

const isNetworkOnly = (url) =>
  NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));

function getNavigationFallbackAsset(requestUrl, scopeUrl) {
  try {
    const requestPath = new URL(requestUrl).pathname;
    const scopePath = new URL(scopeUrl).pathname;
    const relativePath = requestPath.startsWith(scopePath)
      ? requestPath.slice(scopePath.length)
      : requestPath.replace(/^\/+/, '');
    const isDesktopPath = relativePath === 'desktop'
      || relativePath.startsWith('desktop/');
    return isDesktopPath
      ? `./desktop/index.html?v=${VERSION}`
      : `./index.html?v=${VERSION}`;
  } catch (_) {
    return `./index.html?v=${VERSION}`;
  }
}

self.TravelServiceWorker = Object.freeze({ getNavigationFallbackAsset });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_ASSETS);

    // 刻意不自動 skipWaiting：新版安裝好後安靜等待，避免在使用者操作到一半時
    // 接手並觸發整頁重載。使用者按「刷新版本」時會送 TRAVEL_SKIP_WAITING 才套用。
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        // 舊版的 travel-cdn-* 快取也會在這裡一併清掉。
        .filter((key) => key.startsWith('travel-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'TRAVEL_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isNetworkOnly(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(SHELL_CACHE);
        const fallbackAsset = getNavigationFallbackAsset(req.url, self.registration.scope);
        return (await cache.match(fallbackAsset))
          || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
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

});
