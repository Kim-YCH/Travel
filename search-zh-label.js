// version: 20260704.6
// Search result helper: translate Korean/Japanese/Thai Google Places result titles into Chinese labels.
// Example: 서울타워（首爾塔）. The label is translated from the result title, not copied from the user's keyword.
(function () {
  const VERSION = '20260704.6';
  const API_URL = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.API_URL) || '';
  const TARGET_LANG = 'zh-TW';
  const FOREIGN_RE = /[\u3131-\u318e\uac00-\ud7a3\u3040-\u30ff\u0e00-\u0e7f]/;
  const CJK_RE = /[\u4e00-\u9fff]/;
  const translateCache = new Map();
  const pendingKeys = new Set();

  function hasForeign(value) {
    return FOREIGN_RE.test(String(value || ''));
  }

  function hasChinese(value) {
    return CJK_RE.test(String(value || ''));
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\s+/g, ' ');
  }

  function getPlainTitle(titleEl) {
    return cleanText(Array.from(titleEl.childNodes)
      .filter(node => !(node.nodeType === 1 && node.classList && node.classList.contains('search-zh-label')))
      .map(node => node.textContent || '')
      .join(''));
  }

  function isCoordinateSuggestion(item) {
    return !!item.querySelector('.text-green-700, .text-green-600');
  }

  function setLabel(titleEl, text) {
    let label = titleEl.querySelector('.search-zh-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'search-zh-label';
      titleEl.appendChild(label);
    }

    label.textContent = text ? `（${text}）` : '';
    titleEl.classList.remove('truncate');
    titleEl.dataset.zhPatched = VERSION;
  }

  function jsonp(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const cb = 'searchTranslateCb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const sep = url.includes('?') ? '&' : '?';
      const full = `${url}${sep}callback=${encodeURIComponent(cb)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('translate timeout'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      }

      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('translate jsonp failed'));
      };

      script.src = full;
      document.head.appendChild(script);
    });
  }

  async function translateTitle(rawTitle) {
    const key = cleanText(rawTitle);
    if (!API_URL || !key || !hasForeign(key)) return '';
    if (translateCache.has(key)) return translateCache.get(key);

    const url = API_URL
      + '?action=translate_place_keyword'
      + '&text=' + encodeURIComponent(key)
      + '&target=' + encodeURIComponent(TARGET_LANG);

    try {
      const res = await jsonp(url);
      const translated = cleanText(res && (res.translatedText || res.text || res.translation || ''));
      const out = translated && translated !== key ? translated : '';
      translateCache.set(key, out);
      return out;
    } catch (err) {
      console.warn('search result title translate failed:', err);
      translateCache.set(key, '');
      return '';
    }
  }

  async function patchTitle(titleEl, rawTitle) {
    const key = cleanText(rawTitle);
    if (!key || pendingKeys.has(key)) return;
    pendingKeys.add(key);

    const translated = await translateTitle(key);
    pendingKeys.delete(key);

    if (!translated) return;
    if (!document.body.contains(titleEl)) return;

    const currentRawTitle = getPlainTitle(titleEl);
    if (currentRawTitle !== key) return;

    // Avoid labels like 서울타워（서울타워） or labels that are only another foreign-language result.
    if (translated === key || (!hasChinese(translated) && hasForeign(translated))) return;
    setLabel(titleEl, translated);
  }

  function patchSuggestionList(list) {
    if (!list) return;

    list.querySelectorAll('.suggestion-item').forEach((item) => {
      if (isCoordinateSuggestion(item)) return;

      const title = item.querySelector('.font-bold.text-gray-800, .font-bold');
      if (!title) return;

      const rawTitle = getPlainTitle(title);
      if (!rawTitle || !hasForeign(rawTitle)) return;

      const cached = translateCache.get(rawTitle);
      if (cached) {
        setLabel(title, cached);
        return;
      }

      patchTitle(title, rawTitle);
    });
  }

  function patchAllSuggestionLists() {
    document.querySelectorAll('.suggestions-list').forEach(patchSuggestionList);
  }

  function installStyle() {
    if (document.getElementById('search-zh-label-style')) return;
    const style = document.createElement('style');
    style.id = 'search-zh-label-style';
    style.textContent = `
      .suggestions-list .suggestion-item .search-zh-label {
        margin-left: 3px;
        color: #2563eb;
        font-weight: 800;
      }
      .suggestions-list .suggestion-item .font-bold[data-zh-patched] {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);
  }

  let patchTimer = null;
  function schedulePatch() {
    if (patchTimer) clearTimeout(patchTimer);
    patchTimer = setTimeout(patchAllSuggestionLists, 80);
  }

  function init() {
    installStyle();
    patchAllSuggestionLists();

    const observer = new MutationObserver(schedulePatch);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
