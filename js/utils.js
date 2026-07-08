(function (window) {
  'use strict';

  const generateId = () => Date.now() + '_' + Math.floor(Math.random() * 1000);
  const pad2 = (n) => String(n).padStart(2, '0');
  const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const parseYMD = (s) => {
    if (!s) return null;
    const p = String(s).split('-');
    if (p.length < 3) return null;
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    const d = parseInt(p[2], 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  window.TravelUtils = Object.freeze({
    generateId,
    pad2,
    toYMD,
    parseYMD,
    addDays
  });
})(window);
