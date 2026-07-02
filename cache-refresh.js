// version: 260702-2
// 首頁手動刷新：給 iOS 加到主畫面 / 捷徑使用，避免瀏覽器快取舊版 HTML。
(function () {
  const VERSION = '260702-2';

  async function clearBrowserCaches() {
    try {
      if (!('caches' in window)) return;
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (err) {
      console.warn('clearBrowserCaches failed:', err);
    }
  }

  window.TRAVEL_FORCE_REFRESH = async function travelForceRefresh() {
    const btn = document.activeElement;
    if (btn && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      btn.textContent = '刷新中...';
    }

    await clearBrowserCaches();

    const url = new URL(window.location.href);
    url.searchParams.set('v', `${VERSION}-${Date.now()}`);
    url.searchParams.set('refresh', '1');
    window.location.replace(url.toString());
  };
})();
