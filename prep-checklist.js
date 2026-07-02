// version: 260702-2
// 準備清單功能：分類與項目完全由使用者自行建立，不再預設產生內容。
// 目前以 localStorage 保存於本機瀏覽器，不會寫入 Google Sheet；換裝置或清除瀏覽器資料後不會同步。
(function () {
  const VERSION = '260702-2';
  const STORAGE_PREFIX = 'travel_prepare_checklist_v2::';

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

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  function buildEmptyState() {
    return {
      version: VERSION,
      updatedAt: new Date().toISOString(),
      sections: []
    };
  }

  function normalizeState(saved) {
    if (!saved || !Array.isArray(saved.sections)) return buildEmptyState();

    return {
      version: VERSION,
      updatedAt: saved.updatedAt || new Date().toISOString(),
      sections: saved.sections
        .filter(section => section && String(section.title || '').trim())
        .map(section => ({
          id: section.id || makeId('section'),
          title: String(section.title || '').trim(),
          emoji: String(section.emoji || '🧳').trim() || '🧳',
          items: Array.isArray(section.items)
            ? section.items
                .filter(item => item && String(item.text || '').trim())
                .map(item => ({
                  id: item.id || makeId('item'),
                  text: String(item.text || '').trim(),
                  checked: !!item.checked,
                  checkedAt: item.checkedAt || ''
                }))
            : []
        }))
    };
  }

  function loadState() {
    currentTripKey = getStorageKey();
    const saved = safeJsonParse(localStorage.getItem(currentTripKey), null);
    state = normalizeState(saved);
    saveState(false);
  }

  function saveState(updateTime = true) {
    if (!state) return;
    if (updateTime) state.updatedAt = new Date().toISOString();
    localStorage.setItem(currentTripKey, JSON.stringify(state));
  }

  function getStats() {
    const items = state.sections.flatMap(section => section.items || []);
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
      .prep-panel { width: 100%; max-width: 520px; max-height: 88vh; background: #f8fafc; border-radius: 24px 24px 0 0; overflow: hidden; box-shadow: 0 -16px 40px rgba(15,23,42,.22); }
      .prep-header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 16px; }
      .prep-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .prep-close { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.18); color: white; width: 36px; height: 36px; border-radius: 999px; font-size: 22px; line-height: 1; }
      .prep-progress-track { margin-top: 12px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.26); overflow: hidden; }
      .prep-progress-bar { height: 100%; background: white; border-radius: 999px; transition: width .2s; }
      .prep-body { padding: 12px; overflow-y: auto; max-height: calc(88vh - 122px); }
      .prep-note { font-size: 12px; color: #64748b; line-height: 1.5; margin: 4px 2px 12px; }
      .prep-empty { background: #eff6ff; border: 1px dashed #93c5fd; color: #1e40af; border-radius: 16px; padding: 14px; font-size: 13px; line-height: 1.6; margin-bottom: 12px; }
      .prep-add-box { background: white; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px; display: grid; gap: 8px; margin-bottom: 12px; }
      .prep-add-row { display: grid; grid-template-columns: 64px 1fr; gap: 8px; }
      .prep-add-box input, .prep-section-add input { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px 12px; font-size: 14px; background: white; min-width: 0; }
      .prep-add-box button, .prep-section-add button, .prep-action-btn { border: none; border-radius: 12px; padding: 10px 12px; font-weight: 800; background: #2563eb; color: white; }
      .prep-section { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
      .prep-section-title { font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .prep-section-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .prep-section-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .prep-mini-btn { border: none; background: #f1f5f9; color: #64748b; border-radius: 999px; min-width: 30px; height: 30px; padding: 0 8px; font-size: 12px; font-weight: 800; }
      .prep-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #f1f5f9; color: #334155; }
      .prep-item:first-of-type { border-top: none; }
      .prep-item input[type="checkbox"] { width: 20px; height: 20px; accent-color: #2563eb; }
      .prep-item-text { flex: 1; font-size: 14px; line-height: 1.35; min-width: 0; word-break: break-word; }
      .prep-item.is-checked .prep-item-text { text-decoration: line-through; color: #94a3b8; }
      .prep-section-add { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
      .prep-muted { color: #94a3b8; font-size: 13px; padding: 8px 0; }
      .prep-bottom-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
      .prep-action-btn.secondary { background: #f1f5f9; color: #475569; }
      .prep-action-btn.danger { background: #fee2e2; color: #b91c1c; }
    `;
    document.head.appendChild(style);
  }

  function render() {
    if (!root || !state) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const hasSections = state.sections.length > 0;

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
            <div class="prep-note">分類與項目由你自行建立，勾選狀態會儲存在目前瀏覽器。換手機或清除瀏覽器資料後不會同步。</div>

            <div class="prep-add-box">
              <div style="font-size:13px;font-weight:900;color:#334155;">新增分類</div>
              <div class="prep-add-row">
                <input class="prep-new-section-emoji" maxlength="4" placeholder="🧳" />
                <input class="prep-new-section-title" placeholder="分類名稱，例如：證件、電器、藥品" />
              </div>
              <button class="prep-add-section-btn" type="button">＋ 新增分類</button>
            </div>

            ${hasSections ? '' : `
              <div class="prep-empty">
                尚未建立準備清單。<br>
                先新增分類，例如「證件」、「電子用品」、「衣物」、「藥品」，再到分類裡新增項目。
              </div>
            `}

            ${state.sections.map(section => `
              <div class="prep-section" data-section-id="${escapeHtml(section.id)}">
                <div class="prep-section-title">
                  <span class="prep-section-name">${escapeHtml(section.emoji)} ${escapeHtml(section.title)}</span>
                  <span class="prep-section-actions">
                    <span style="font-size:12px;color:#94a3b8;">${section.items.filter(i => i.checked).length}/${section.items.length}</span>
                    <button class="prep-mini-btn prep-edit-section" type="button">改名</button>
                    <button class="prep-mini-btn prep-delete-section" type="button">刪除</button>
                  </span>
                </div>
                ${section.items.length ? section.items.map(item => `
                  <label class="prep-item ${item.checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(item.id)}">
                    <input type="checkbox" ${item.checked ? 'checked' : ''} />
                    <span class="prep-item-text">${escapeHtml(item.text)}</span>
                    <button class="prep-mini-btn prep-edit-item" type="button">改</button>
                    <button class="prep-mini-btn prep-delete-item" type="button">×</button>
                  </label>
                `).join('') : '<div class="prep-muted">這個分類尚無項目。</div>'}
                <div class="prep-section-add">
                  <input class="prep-new-item-input" placeholder="新增項目，例如：護照、萬國轉接頭" />
                  <button class="prep-add-item-btn" type="button">新增</button>
                </div>
              </div>
            `).join('')}

            <div class="prep-bottom-actions">
              <button class="prep-action-btn secondary prep-clear-checks" type="button">清空勾選</button>
              <button class="prep-action-btn danger prep-delete-all" type="button">刪除全部</button>
            </div>
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

    root.querySelector('.prep-add-section-btn').addEventListener('click', () => {
      const titleInput = root.querySelector('.prep-new-section-title');
      const emojiInput = root.querySelector('.prep-new-section-emoji');
      const title = String(titleInput.value || '').trim();
      const emoji = String(emojiInput.value || '').trim() || '🧳';
      if (!title) return;
      state.sections.push({ id: makeId('section'), title, emoji, items: [] });
      saveState(true);
      render();
    });

    root.querySelectorAll('.prep-add-item-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        const sectionEl = event.target.closest('.prep-section');
        const section = findSection(sectionEl.dataset.sectionId);
        const input = sectionEl.querySelector('.prep-new-item-input');
        const text = String(input.value || '').trim();
        if (!section || !text) return;
        section.items.push({ id: makeId('item'), text, checked: false, checkedAt: '' });
        saveState(true);
        render();
      });
    });

    root.querySelectorAll('.prep-new-item-input').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const sectionEl = event.target.closest('.prep-section');
        const btn = sectionEl.querySelector('.prep-add-item-btn');
        if (btn) btn.click();
      });
    });

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

    root.querySelectorAll('.prep-edit-section').forEach(btn => {
      btn.addEventListener('click', event => {
        const sectionEl = event.target.closest('.prep-section');
        const section = findSection(sectionEl.dataset.sectionId);
        if (!section) return;
        const nextEmoji = prompt('分類圖示：', section.emoji || '🧳');
        if (nextEmoji === null) return;
        const nextTitle = prompt('分類名稱：', section.title || '');
        if (nextTitle === null) return;
        const title = String(nextTitle || '').trim();
        if (!title) return;
        section.emoji = String(nextEmoji || '').trim() || '🧳';
        section.title = title;
        saveState(true);
        render();
      });
    });

    root.querySelectorAll('.prep-delete-section').forEach(btn => {
      btn.addEventListener('click', event => {
        const sectionEl = event.target.closest('.prep-section');
        const section = findSection(sectionEl.dataset.sectionId);
        if (!section) return;
        if (!confirm(`確定刪除「${section.title}」分類與裡面的所有項目？`)) return;
        state.sections = state.sections.filter(x => x.id !== section.id);
        saveState(true);
        render();
      });
    });

    root.querySelectorAll('.prep-edit-item').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        const itemEl = event.target.closest('.prep-item');
        const item = findItem(itemEl.dataset.itemId);
        if (!item) return;
        const nextText = prompt('項目名稱：', item.text || '');
        if (nextText === null) return;
        const text = String(nextText || '').trim();
        if (!text) return;
        item.text = text;
        saveState(true);
        render();
      });
    });

    root.querySelectorAll('.prep-delete-item').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        const itemEl = event.target.closest('.prep-item');
        const itemId = itemEl.dataset.itemId;
        state.sections.forEach(section => {
          section.items = section.items.filter(item => item.id !== itemId);
        });
        saveState(true);
        render();
      });
    });

    root.querySelector('.prep-clear-checks').addEventListener('click', () => {
      if (!confirm('確定清空所有勾選狀態？')) return;
      state.sections.forEach(section => section.items.forEach(item => { item.checked = false; item.checkedAt = ''; }));
      saveState(true);
      render();
    });

    root.querySelector('.prep-delete-all').addEventListener('click', () => {
      if (!confirm('確定刪除這個旅程的全部準備清單？')) return;
      state.sections = [];
      saveState(true);
      render();
    });
  }

  function findSection(sectionId) {
    return state.sections.find(section => section.id === sectionId) || null;
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
