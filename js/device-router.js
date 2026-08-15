(function (global) {
  'use strict';

  const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;
  const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
  const MIN_DESKTOP_WIDTH = 1024;
  const VIEW_OVERRIDE_KEY = 'travel_view_override';

  // 逃生門：網址帶 ?view=desktop 或 ?view=mobile 就強制指定，並記進 localStorage
  // 以後都算數；?view=auto 清掉回到自動判斷。
  // 裝置判斷本質上是猜的，總會有猜錯的機型 —— 沒有這個入口，猜錯的人完全沒有救。
  function readViewOverride(env) {
    let stored = null;
    try {
      stored = env.localStorage;
    } catch (_) {
      stored = null;
    }

    const search = String((env && env.location && env.location.search) || '');
    const matched = /[?&]view=(desktop|mobile|auto)(?:&|$)/.exec(search);

    if (matched) {
      const wanted = matched[1];
      try {
        if (wanted === 'auto') stored.removeItem(VIEW_OVERRIDE_KEY);
        else stored.setItem(VIEW_OVERRIDE_KEY, wanted);
      } catch (_) { /* 隱私模式或第三方 cookie 被擋，忽略即可 */ }
      return wanted === 'auto' ? '' : wanted;
    }

    try {
      const saved = stored.getItem(VIEW_OVERRIDE_KEY);
      if (saved === 'desktop' || saved === 'mobile') return saved;
    } catch (_) { /* 同上 */ }

    return '';
  }

  function classify(env) {
    const override = readViewOverride(env || {});
    if (override) return override;

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
    //
    // ★ 寬度取「螢幕」與「視窗」兩者的大值，不能只看 innerWidth。
    //   innerWidth 是當下的視窗寬度，使用者把視窗拉小一點就會變 —— 而「這台是不是
    //   桌機」是裝置屬性，不該隨視窗大小翻來覆去。實際踩到的案例：1920x1080 筆電、
    //   Windows 縮放 125%（screen 變成 1536 CSS px，空間綽綽有餘），只因為視窗沒有
    //   最大化，innerWidth 是 1016，差 8px 就被丟去手機版而且沒有辦法救回來。
    //   screen.width 已經是 CSS 像素（瀏覽器除過 devicePixelRatio），不必自己換算。
    //   視窗真的很窄時，桌面版本身有 1180 / 1020 / 900px 的響應式回退接手。
    const innerWidth = Number(env && env.innerWidth) || 0;
    const screenWidth = Number(env && env.screen && env.screen.width) || 0;
    const width = Math.max(innerWidth, screenWidth);
    const hasDesktopPointer = Boolean(
      env
      && typeof env.matchMedia === 'function'
      && env.matchMedia(DESKTOP_POINTER_QUERY).matches
    );

    return width >= MIN_DESKTOP_WIDTH && hasDesktopPointer ? 'desktop' : 'mobile';
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
