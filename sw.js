/* Travel Service Worker
 *
 * Keep this VERSION in sync with config.js APP_VERSION. tests/run.js verifies
 * the local assets and CDN scripts listed in index.html are covered here.
 */
'use strict';

const VERSION = '20260723.2';
const SHELL_CACHE = `travel-shell-${VERSION}`;
const CDN_CACHE = `travel-cdn-${VERSION}`;

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

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.prod.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
];

const NETWORK_ONLY_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'maps.googleapis.com',
  'api.open-meteo.com'
];

const isNetworkOnly = (url) =>
  NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_ASSETS);

    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
        if (res.ok) {
          await cdn.put(url, res);
          return;
        }
      } catch (err) {
        // Some CDN assets do not allow CORS. Fall back to an opaque response.
      }

      try {
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
      keys
        .filter((key) => key.startsWith('travel-') && key !== SHELL_CACHE && key !== CDN_CACHE)
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
        return (await cache.match(`./index.html?v=${VERSION}`))
          || (await cache.match('./'))
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

  if (CDN_ASSETS.some((asset) => req.url.startsWith(asset))) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const usable = cached && !(cached.type === 'opaque' && req.mode === 'cors');
      if (usable) return cached;

      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(CDN_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
  }
});
