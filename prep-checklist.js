// version: 260702-1
// 準備清單功能：以 localStorage 保存每個旅程的勾選狀態。
// 目前為前端本機保存，不會寫入 Google Sheet；換裝置或清除瀏覽器資料後不會同步。
(function () {
  const VERSION = '260702-1';
  const STORAGE_PREFIX = 'travel_prepare_checklist_v1::';

  const DEFAULT_SECTIONS = [
    {
      id: 'documents',
      title: '證件與文件',
      emoji: '🛂',
      items: [
        '護照',
        '身分證 / 居留證',
        '簽證 / K-ETA / Visit Japan Web',
        '機票 / 登機證',
        '住宿訂房確認',
        '旅遊保險',
        '重要預約截圖'
      ]
    },
    {
      id: 'electronics',
      title: '電子與網路',
      emoji: '🔌',
      items: [
        '手機',
        '充電器',
        '充電線',
        '行動電源',
        '萬國轉接頭',
        'eSIM / 網卡',
        '耳機'
      ]
    },
    {
      id: 'money',
      title: '金錢與交通',
      emoji: '💳',
      items: [
        '信用卡',
        '外幣現金',
        '台幣備用',
        '交通卡（Suica / T-money 等）',
        '錢包',
        '換匯資料 / 換錢所資訊'
      ]
    },
    {
      id: 'daily',
      title: '衣物與日用品',
      emoji: '🎒',
      items: [
        '換洗衣物',
        '外套 / 保暖衣物',
        '盥洗用品',
        '化妝 / 保養品',
        '常備藥',
        '雨傘 / 雨衣',
        '口罩 / 濕紙巾'
      ]
    },
    {
      id: 'before_departure',
      title: '行前確認',
      emoji: '✅',
      items: [
        '下載備份 HTML',
        '離線地圖 / 翻譯 App 準備',
        '家裡電器 / 瓦斯確認',
        '護照影本與重要資料備份',
        '緊急聯絡資訊'
      ]
    }
  ];

  let currentTripKey = '';
  let state = null;
  let root = null;
  let panelOpen = false;

  function safeJsonParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function normalizeTripName(value) {
    return String(value || '').trim() || '共用清單';
  }

  function getCurrentTripName() {
    const headerTitle = document.querySelector('.app-header h1');
    return normalizeTripName(headerTitle ? headerTitle.textContent : '');
  }

  function getStorageKey() {
    return STORAGE_PREFIX + getCurrentTripName();
  }

  function makeItemId(sectionId, text) {
    let code = 0;
    const raw = `${sectionId}::${text}`;
    for (let i = 0; i < raw.length; i += 1) {
      code = ((code << 5) - code + raw.charCodeAt(i)) | 0;
    }
    return `${sectionId}_${Math.abs(code)}`;
  }

  function buildDefaultState() {
    return {
      version: VERSION,
      updatedAt: new Date().toISOString(),
      sections: DEFAULT_SECTIONS.map(section => ({
        id: section.id,
        title: section.title,
        emoji: section.emoji,
        items: section.items.map(text => ({
          id: makeItemId(section.id, text),
          text,
          checked: false,
          custom: false,
          checkedAt: ''
        }))
      }))
    };
  }

  function mergeWithDefaults(saved) {
    const base = buildDefaultState();
    if (!saved || !Array.isArray(saved.sections)) return base;

    const savedItemMap = new Map();
    saved.sections.forEach(section => {
      (section.items || []).forEach(item => {
        if (item && item.id) savedItemMap.set(item.id, item);
      });
    });

    base.sections.forEach(section => {
      section.items.forEach(item => {
        const old = savedItemMap.get(item.id);
        if (old) {
          item.checked = !!old.checked;
          item.checkedAt = old.checkedAt || '';
        }
      });
    });

    saved.sections.forEach(savedSection => {
      const target = base.sections.find(section => section.id === savedSection.id) || base.sections[0];
      (savedSection.items || [])
        .filter(item => item && item.custom)
        .forEach(item => {
          if (!target.items.some(x => x.id === item.id)) {
            target.items.push({
              id: item.id,
              text: item.text || '自訂項目',
              checked: !!item.checked,
              custom: true,
              checkedAt: item.checkedAt || ''
            });
          }
        });
    });

    base.updatedAt = saved.updatedAt || base.updatedAt;
    return base;
  }

  function loadState() {
    currentTripKey = getStorageKey();
    const saved = safeJsonParse(localStorage.getItem(currentTripKey), null);
    state = mergeWithDefaults(saved);
    saveState(false);
  }

  function saveState(updateTime = true) {
    if (!state) return;
    if (updateTime) state.updatedAt = new Date().toISOString();
    localStorage.setItem(currentTripKey, JSON.stringify(state));
  }

  function getStats() {
    const items = state.sections.flatMap(section => section.items);
    const total = items.length;
    const done = items.filter(item => item.checked).length;
    return { done, total, percent: total ? Math.round(done * 100 / total) : 0 };
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addStyle() {
    if (document.getElementById('prep-checklist-style')) return;
    const style = document.createElement('style');
    style.id = 'prep-checklist-style';
    style.textContent = `
      .prep-fab { position: fixed; right: 16px; bottom: 88px; z-index: 9998; border: none; border-radius: 999px; background: #2563eb; color: white; font-weight: 800; padding: 12px 16px; box-shadow: 0 12px 26px rgba(37,99,235,.28); display: none; align-items: center; gap: 6px; }
      .prep-fab.is-visible { display: flex; }
      .prep-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(15,23,42,.42); display: none; align-items: flex-end; justify-content: center; }
      .prep-overlay.is-open { display: flex; }
      .prep-panel { width: 100%; max-width: 520px; max-height: 86vh; background: #f8fafc; border-radius: 24px 24px 0 0; overflow: hidden; box-shadow: 0 -16px 40px rgba(15,23,42,.22); }
      .prep-header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 16px; }
      .prep-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .prep-close { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.18); color: white; width: 36px; height: 36px; border-radius: 999px; font-size: 22px; line-height: 1; }
      .prep-progress-track { margin-top: 12px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.26); overflow: hidden; }
      .prep-progress-bar { height: 100%; background: white; border-radius: 999px; transition: width .2s; }
      .prep-body { padding: 12px; overflow-y: auto; max-height: calc(86vh - 122px); }
      .prep-section { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
      .prep-section-title { font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
      .prep-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #f1f5f9; color: #334155; }
      .prep-item:first-of-type { border-top: none; }
      .prep-item input { width: 20px; height: 20px; accent-color: #2563eb; }
      .prep-item-text { flex: 1; font-size: 14px; line-height: 1.35; }
      .prep-item.is-checked .prep-item-text { text-decoration: line-through; color: #94a3b8; }
      .prep-delete { border: none; background: #f1f5f9; color: #64748b; border-radius: 999px; width: 28px; height: 28px; }
      .prep-add-box { background: white; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px; display: grid; gap: 8px; margin-bottom: 12px; }
      .prep-add-box input, .prep-add-box select { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px 12px; font-size: 14px; background: white; }
      .prep-add-box button, .prep-reset-btn { border: none; border-radius: 12px; padding: 10px 12px; font-weight: 800; background: #2563eb; color: white; }
      .prep-reset-btn { background: #f1f5f9; color: #475569; width: 100%; margin-bottom: 12px; }
      .prep-note { font-size: 12px; color: #64748b; line-height: 1.5; margin: 4px 2px 12px; }
    `;
    document.head.appendChild(style);
  }

  function render() {
    if (!root) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const sectionOptions = state.sections.map(section => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.emoji + ' ' + section.title)}</option>`).join('');

    root.innerHTML = `
      <button class="prep-fab" type="button" aria-label="開啟準備清單">🎒 準備清單</button>
      <div class="prep-overlay" role="dialog" aria-modal="true">
        <div class="prep-panel">
          <div class="prep-header">
            <div class="prep-title-row">
              <div>
                <div style="font-size:18px;font-weight:900;">🎒 準備清單</div>
                <div style="font-size:12px;opacity:.85;margin-top:2px;">${escapeHtml(tripName)}｜已完成 ${stats.done}/${stats.total}（${stats.percent}%）</div>
              </div>
              <button class="prep-close" type="button" aria-label="關閉">×</button>
            </div>
            <div class="prep-progress-track"><div class="prep-progress-bar" style="width:${stats.percent}%"></div></div>
          </div>
          <div class="prep-body">
            <div class="prep-note">勾選狀態會儲存在目前瀏覽器。出國前建議也使用「產生備份網頁」做保險。</div>
            <div class="prep-add-box">
              <select class="prep-add-section">${sectionOptions}</select>
              <input class="prep-add-input" placeholder="新增自訂項目，例如：相機、票券、藥品..." />
              <button class="prep-add-btn" type="button">＋ 新增到清單</button>
            </div>
            ${state.sections.map(section => `
              <div class="prep-section" data-section-id="${escapeHtml(section.id)}">
                <div class="prep-section-title">
                  <span>${escapeHtml(section.emoji)} ${escapeHtml(section.title)}</span>
                  <span style="font-size:12px;color:#94a3b8;">${section.items.filter(i => i.checked).length}/${section.items.length}</span>
                </div>
                ${section.items.map(item => `
                  <label class="prep-item ${item.checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(item.id)}">
                    <input type="checkbox" ${item.checked ? 'checked' : ''} />
                    <span class="prep-item-text">${escapeHtml(item.text)}</span>
                    ${item.custom ? '<button class="prep-delete" type="button" title="刪除自訂項目">×</button>' : ''}
                  </label>
                `).join('')}
              </div>
            `).join('')}
            <button class="prep-reset-btn" type="button">重設為預設清單</button>
            <div class="prep-note">版本 ${VERSION}｜最後更新：${escapeHtml(formatTime(state.updatedAt) || '尚未更新')}</div>
          </div>
        </div>
      </div>`;

    const fab = root.querySelector('.prep-fab');
    const overlay = root.querySelector('.prep-overlay');
    const closeBtn = root.querySelector('.prep-close');
    fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
    overlay.classList.toggle('is-open', panelOpen);

    fab.addEventListener('click', () => { panelOpen = true; render(); });
    closeBtn.addEventListener('click', () => { panelOpen = false; render(); });
    overlay.addEventListener('click', event => { if (event.target === overlay) { panelOpen = false; render(); } });

    root.querySelectorAll('.prep-item input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', event => {
        const itemEl = event.target.closest('.prep-item');
        const item = findItem(itemEl.dataset.itemId);
        if (!item) return;
        item.checked = event.target.checked;
        item.checkedAt = item.checked ? new Date().toISOString() : '';
        saveState(true);
        render();
      });
    });

    root.querySelectorAll('.prep-delete').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        const itemEl = event.target.closest('.prep-item');
        const itemId = itemEl.dataset.itemId;
        state.sections.forEach(section => {
          section.items = section.items.filter(item => item.id !== itemId || !item.custom);
        });
        saveState(true);
        render();
      });
    });

    root.querySelector('.prep-add-btn').addEventListener('click', () => {
      const input = root.querySelector('.prep-add-input');
      const select = root.querySelector('.prep-add-section');
      const text = String(input.value || '').trim();
      if (!text) return;
      const section = state.sections.find(s => s.id === select.value) || state.sections[0];
      section.items.push({ id: `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`, text, checked: false, custom: true, checkedAt: '' });
      saveState(true);
      render();
    });

    root.querySelector('.prep-reset-btn').addEventListener('click', () => {
      if (!confirm('確定要重設準備清單？自訂項目會保留，勾選狀態會清空。')) return;
      state.sections.forEach(section => section.items.forEach(item => { item.checked = false; item.checkedAt = ''; }));
      saveState(true);
      render();
    });
  }

  function findItem(itemId) {
    for (const section of state.sections) {
      const item = section.items.find(x => x.id === itemId);
      if (item) return item;
    }
    return null;
  }

  function ensureLoadedForCurrentTrip() {
    const key = getStorageKey();
    if (key !== currentTripKey || !state) {
      loadState();
      render();
    } else {
      const fab = root && root.querySelector('.prep-fab');
      if (fab) fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
    }
  }

  function init() {
    addStyle();
    root = document.createElement('div');
    root.id = 'prep-checklist-root';
    document.body.appendChild(root);
    loadState();
    render();
    const observer = new MutationObserver(() => ensureLoadedForCurrentTrip());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(ensureLoadedForCurrentTrip, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
