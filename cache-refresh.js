// version: 20260705.9
// 只有使用者明確按「刷新版本 / 重新載入」時才整頁 reload。
// 平常資料新增、修改、刪除都應交給各模組做局部更新。
(function () {
  const VERSION = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.APP_VERSION) || '20260705.9';

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
    const oldText = btn && btn.tagName === 'BUTTON' ? btn.textContent : '';
    if (btn && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      btn.textContent = '刷新中...';
    }

    await clearBrowserCaches();

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
