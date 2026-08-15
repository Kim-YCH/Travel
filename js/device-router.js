(function (global) {
  'use strict';

  const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;
  const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

  function classify(env) {
    const nav = (env && env.navigator) || {};
    const ua = String(nav.userAgent || '');
    const platform = String(nav.platform || '');
    const hasMultiTouch = Number(nav.maxTouchPoints || 0) > 1;
    const userAgentDataSaysMobile = Boolean(
      nav.userAgentData && nav.userAgentData.mobile
    );

    // iPadOS 的 Safari 會謊報成 Macintosh 的桌面 UA，唯一的破綻是觸控點數
    //（真正的 Mac 沒有觸控螢幕，maxTouchPoints 是 0）。
    // ★ 這是 maxTouchPoints 唯一該用的地方。
    //   早期版本把「有多點觸控」直接當成手機，結果觸控筆電（Win32 + 10 點觸控 +
    //   滑鼠 + 寬螢幕）也被丟去手機版，而且沒有任何辦法救回來 —— 那條判斷還排在
    //   寬度與指標裝置檢查之前，等於一票否決。
    const isIpadPretendingToBeMac = platform === 'MacIntel' && hasMultiTouch;

    if (userAgentDataSaysMobile || MOBILE_UA.test(ua) || isIpadPretendingToBeMac) {
      return 'mobile';
    }

    // 走到這裡的裝置一律用「螢幕夠寬 + 有精準指標且支援 hover」判斷。
    // 觸控筆電同時具備觸控與滑鼠，這兩項都會過，所以會正確拿到桌面版；
    // 純觸控的平板則因為 pointer: coarse / hover: none 而留在手機版。
    const width = Number(env && env.innerWidth) || 0;
    const hasDesktopPointer = Boolean(
      env
      && typeof env.matchMedia === 'function'
      && env.matchMedia(DESKTOP_POINTER_QUERY).matches
    );

    return width >= 1024 && hasDesktopPointer ? 'desktop' : 'mobile';
  }

  function buildTarget(location, relativePath) {
    if (!location || !location.href || !relativePath) return null;

    try {
      const target = new URL(relativePath, location.href);
      target.search = location.search || '';
      target.hash = location.hash || '';
      return target.href;
    } catch (_) {
      return null;
    }
  }

  function route(env, scriptElement) {
    const data = scriptElement && scriptElement.dataset;
    if (!env || !data || !['mobile', 'desktop'].includes(data.currentView)) {
      return null;
    }

    const desiredView = classify(env);
    if (desiredView === data.currentView) return null;

    const relativePath = desiredView === 'desktop'
      ? data.desktopUrl
      : data.mobileUrl;
    const destination = buildTarget(env.location, relativePath);

    if (!destination || !env.location || typeof env.location.replace !== 'function') {
      return null;
    }

    try {
      if (destination === new URL(env.location.href).href) return null;
    } catch (_) {
      return null;
    }

    env.location.replace(destination);
    return destination;
  }

  const api = { classify, buildTarget, route };
  global.TravelDeviceRouter = api;

  if (global.document && global.document.currentScript) {
    route(global, global.document.currentScript);
  }
})(typeof window !== 'undefined' ? window : globalThis);
