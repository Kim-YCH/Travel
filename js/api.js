(function (window, document) {
  'use strict';

  const jsonp = (url, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const cb = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const sep = url.includes('?') ? '&' : '?';
    const full = `${url}${sep}callback=${cb}`;

    const s = document.createElement('script');
    const t = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(t);
      if (s.parentNode) s.parentNode.removeChild(s);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
    };

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    s.onerror = () => {
      cleanup();
      reject(new Error('JSONP load error'));
    };

    s.src = full;
    document.head.appendChild(s);
  });

  const create = ({ apiUrl }) => {
    const apiGet = async (paramsObj) => {
      const qs = new URLSearchParams(paramsObj).toString();
      return await jsonp(`${apiUrl}?${qs}`);
    };

    const rawPostJSON = async (payload) => {
      const p = { ...payload };
      if (p.data && typeof p.data === 'object') p.data = JSON.stringify(p.data);
      return await apiGet(p);
    };

    return Object.freeze({ jsonp, apiGet, rawPostJSON });
  };

  window.TravelApi = Object.freeze({ jsonp, create });
})(window, document);
