// version: 20260802.4
// 只有使用者明確按「刷新版本 / 重新載入」時才整頁 reload。
// 平常資料新增、修改、刪除都應交給各模組做局部更新。
(function () {
  const VERSION = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.APP_VERSION) || '20260802.4';

  async function clearBrowserCaches() {
    try {
      if (!('caches' in window)) return;
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (err) {
      console.warn('clearBrowserCaches failed:', err);
    }
  }

  // Service Worker：讓 App 加到主畫面後，在完全沒有網路時仍然開得起來。
  // 註冊放在 load 之後，不跟首屏資源搶頻寬。
  // sw.js 只有一份、放在站台根目錄。手機版入口在根目錄，桌面版入口在 desktop/，
  // 相對路徑會解析到不同位置，所以路徑由載入這支檔案的 <script data-sw-url> 指定。
  // 沒指定時維持 './sw.js'，手機版行為不變。
  function getServiceWorkerUrl() {
    const el = document.currentScript
      || document.querySelector('script[src*="cache-refresh.js"]');
    const url = el && el.dataset && el.dataset.swUrl;
    return url || './sw.js';
  }

  const SW_URL = getServiceWorkerUrl();

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 開啟時無法註冊，本機直接開檔案測試不該噴錯。
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_URL).catch((err) => {
        console.warn('service worker register failed:', err);
      });
    });

    // 刻意不在這裡自動 reload。新版 SW 會安靜等待，只有使用者按「刷新版本」才套用並重載。
    // （先前的 controllerchange 自動 reload 會在每次部署後，使用者一開網站就把畫面重置回首頁／第一天。）
  }

  async function activateWaitingServiceWorker() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await registration.update();
      if (registration.waiting) registration.waiting.postMessage('TRAVEL_SKIP_WAITING');
    } catch (err) {
      console.warn('activateWaitingServiceWorker failed:', err);
    }
  }

  registerServiceWorker();

  window.TRAVEL_FORCE_REFRESH = async function travelForceRefresh() {
    const btn = document.activeElement;
    const oldText = btn && btn.tagName === 'BUTTON' ? btn.textContent : '';
    if (btn && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      btn.textContent = '刷新中...';
    }

    await clearBrowserCaches();
    await activateWaitingServiceWorker();

    const url = new URL(window.location.href);
    url.searchParams.set('v', `${VERSION}-${Date.now()}`);
    url.searchParams.set('refresh', '1');
    window.location.replace(url.toString());

    setTimeout(() => {
      if (btn && btn.tagName === 'BUTTON') {
        btn.disabled = false;
        btn.textContent = oldText || '↻ 刷新版本 / 重新載入';
      }
    }, 2500);
  };

  // 給模組使用的局部刷新事件；不會 reload 頁面。
  window.TRAVEL_PARTIAL_REFRESH = function travelPartialRefresh(target) {
    document.dispatchEvent(new CustomEvent('travel:partial-refresh', {
      detail: { target: target || 'current' }
    }));
  };
})();
