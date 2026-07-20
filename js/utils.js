(function (window) {
  'use strict';

  const generateId = () => Date.now() + '_' + Math.floor(Math.random() * 1000);
  const pad2 = (n) => String(n).padStart(2, '0');
  const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const parseYMD = (s) => {
    if (!s) return null;
    const p = String(s).split('-');
    if (p.length !== 3) return null;
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    const d = parseInt(p[2], 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0);
  };

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const escapeHtml = (s) => String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const linkifyMessage = (text) => {
    const raw = String(text || '');
    if (!raw) return '';

    const escaped = escapeHtml(raw);
    const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,!?;:])/gi;

    const linked = escaped.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    return `📝 ${linked.replace(/\n/g, '<br>')}`;
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    if (typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr)) return timeStr;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;
      const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    } catch (e) {
      return timeStr;
    }
  };

  const timeToNum = (t) => {
    const s = formatTime(t);
    if (!s) return 999999;
    const p = s.split(':');
    if (p.length !== 2) return 999999;
    const hh = parseInt(p[0], 10);
    const mm = parseInt(p[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;
    return hh * 60 + mm;
  };

  window.TravelUtils = Object.freeze({
    generateId,
    pad2,
    toYMD,
    parseYMD,
    addDays,
    escapeHtml,
    linkifyMessage,
    formatTime,
    timeToNum
  });
})(window);
