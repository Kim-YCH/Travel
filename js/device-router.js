(function (global) {
  'use strict';

  const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;
  const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

  function classify(env) {
    const nav = (env && env.navigator) || {};
    const ua = String(nav.userAgent || '');
    const hasMultiTouch = Number(nav.maxTouchPoints || 0) > 1;
    const userAgentDataSaysMobile = Boolean(
      nav.userAgentData && nav.userAgentData.mobile
    );

    if (userAgentDataSaysMobile || MOBILE_UA.test(ua) || hasMultiTouch) {
      return 'mobile';
    }

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
