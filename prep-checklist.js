// version: 260702-6
// 準備清單功能：分類與項目由使用者自行建立，資料同步到 Google Sheet，並保留 localStorage 作為暫存備援。
// 260702-4：勾選與新增項目改為局部更新，避免手機鍵盤收起與畫面重繪。
// 260702-5：分類改為 emoji 與名稱同欄輸入，編輯 / 刪除按鈕改成縮小版行程卡樣式。
// 260702-6：新增自動重試同步、回到前景自動刷新，避免閒置後長時間停在離線狀態。
(function () {
  const VERSION = '260702-6';
  const STORAGE_PREFIX = 'travel_prepare_checklist_v3::';
  const API_URL = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.API_URL) || '';

  let currentTripKey = '';
  let state = null;
  let root = null;
  let panelOpen = false;
  let syncTimer = null;
  let isLoadingRemote = false;
  let syncStatus = '';
  let lastSyncedAt = '';
  let lastRemoteUpdatedAt = '';
  let hasPendingSheetSave = false;
  let lastAutoRefreshAt = 0;
  const AUTO_REFRESH_MS = 60000;
  const AUTO_RETRY_MS = 30000;

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

  function getLegacyStorageKey() {
    return 'travel_prepare_checklist_v2::' + getCurrentTripName();
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  function parseSectionLabel(value) {
    const text = String(value || '').trim();
    if (!text) return { emoji: '', title: '' };

    // 使用者通常會輸入「🪪 證件」這種格式；若第一個字不是中英數，就視為 emoji / 圖示。
    const chars = Array.from(text);
    const first = chars[0] || '';
    const rest = text.slice(first.length).trim();
    const firstLooksLikeText = /^[A-Za-z0-9\u4e00-\u9fff]$/.test(first);

    if (rest && !firstLooksLikeText) {
      return { emoji: first, title: rest };
    }

    return { emoji: '', title: text };
  }

  function getSectionDisplayName(section) {
    const emoji = String(section && section.emoji || '').trim();
    const title = String(section && section.title || '').trim();
    return `${emoji ? emoji + ' ' : ''}${title}`.trim() || '未命名分類';
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
          emoji: String(section.emoji || '').trim(),
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

  function hasAnyContent(data) {
    return !!(data && Array.isArray(data.sections) && data.sections.length > 0);
  }

  function stateFingerprint(data) {
    try {
      return JSON.stringify((data && data.sections) || []);
    } catch (_) {
      return '';
    }
  }

  function isBrowserOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function isEditingChecklistInput() {
    const active = document.activeElement;
    return !!(root && active && root.contains(active) && active.matches('input, textarea'));
  }

  function loadLocalState() {
    currentTripKey = getStorageKey();
    const saved = safeJsonParse(localStorage.getItem(currentTripKey), null);
    const legacy = safeJsonParse(localStorage.getItem(getLegacyStorageKey()), null);
    state = normalizeState(saved || legacy);
    saveLocal(false);
  }

  function saveLocal(updateTime = true) {
    if (!state) return;
    if (updateTime) state.updatedAt = new Date().toISOString();
    localStorage.setItem(currentTripKey, JSON.stringify(state));
  }

  function scheduleSheetSave() {
    if (!API_URL || !state) return;
    hasPendingSheetSave = true;
    syncStatus = '待同步';
    updateSyncUI();
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(saveToSheet, 650);
  }

  async function apiPost(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return await res.json();
  }

  async function loadFromSheet(options = {}) {
    if (!API_URL || isLoadingRemote) return;

    const tripName = getCurrentTripName();
    if (!tripName || tripName === '共用清單') return;

    const silent = !!options.silent;
    isLoadingRemote = true;
    if (!silent) {
      syncStatus = '同步中';
      updateSyncUI();
    }

    let shouldRender = false;

    try {
      const url = API_URL
        + '?action=prep_checklist_get'
        + '&tripName=' + encodeURIComponent(tripName)
        + '&t=' + encodeURIComponent(Date.now());

      const res = await fetch(url);
      const data = await res.json();

      if (data && data.status === 'success') {
        const remote = normalizeState({
          updatedAt: data.updatedAt || new Date().toISOString(),
          sections: data.sections || []
        });
        const remoteFingerprint = stateFingerprint(remote);
        const localFingerprint = stateFingerprint(state);
        lastRemoteUpdatedAt = data.updatedAt || lastRemoteUpdatedAt;

        if (hasPendingSheetSave) {
          // 本機有尚未成功送出的變更時，不用遠端資料覆蓋，改由自動重試寫回 Sheet。
          syncStatus = '待同步';
        } else if (hasAnyContent(remote) || !hasAnyContent(state)) {
          if (remoteFingerprint !== localFingerprint) {
            state = remote;
            saveLocal(false);
            shouldRender = true;
          }
          syncStatus = '已同步';
          lastSyncedAt = new Date().toISOString();
        } else {
          // 舊版 localStorage 有資料，但 Google Sheet 還沒有資料時，自動補同步一次。
          syncStatus = '待同步';
          scheduleSheetSave();
        }
      } else {
        syncStatus = '未同步';
      }
    } catch (err) {
      console.warn('prep checklist load failed:', err);
      syncStatus = isBrowserOnline() ? '未同步' : '離線';
    } finally {
      isLoadingRemote = false;
      if (!silent || shouldRender) render();
      else updateSyncUI();
    }
  }

  async function saveToSheet() {
    if (!API_URL || !state) return;

    const tripName = getCurrentTripName();
    if (!tripName || tripName === '共用清單') return;

    syncStatus = '同步中';
    updateSyncUI();

    try {
      const out = await apiPost({
        action: 'prep_checklist_save',
        tripName,
        data: state
      });

      if (out && out.status === 'success') {
        hasPendingSheetSave = false;
        syncStatus = '已同步';
        lastSyncedAt = new Date().toISOString();
        lastRemoteUpdatedAt = out.updatedAt || lastSyncedAt;
      } else {
        hasPendingSheetSave = true;
        syncStatus = '未同步';
        console.warn('prep checklist save failed:', out);
      }
    } catch (err) {
      hasPendingSheetSave = true;
      syncStatus = isBrowserOnline() ? '未同步' : '離線';
      console.warn('prep checklist save failed:', err);
    }

    updateSyncUI();
  }

  function saveState(updateTime = true) {
    saveLocal(updateTime);
    scheduleSheetSave();
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
      .prep-status-line { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#64748b; font-size:11px; margin:0 2px 10px; }
      .prep-sync-pill { background:#e0f2fe; color:#0369a1; border-radius:999px; padding:4px 8px; font-weight:800; white-space:nowrap; }
      .prep-empty { background: white; border: 1px dashed #cbd5e1; color: #64748b; border-radius: 16px; padding: 14px; font-size: 13px; text-align:center; margin-bottom: 12px; }
      .prep-add-box { background: white; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px; display: grid; gap: 8px; margin-bottom: 12px; }
      .prep-add-row { display: grid; grid-template-columns: 1fr; gap: 8px; }
      .prep-add-box input, .prep-section-add input { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px 12px; font-size: 14px; background: white; min-width: 0; }
      .prep-add-box button, .prep-section-add button, .prep-action-btn { border: none; border-radius: 12px; padding: 10px 12px; font-weight: 800; background: #2563eb; color: white; }
      .prep-section { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
      .prep-section-title { font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .prep-section-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .prep-section-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
      .prep-icon-btn { border: none; width: 28px; height: 28px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: #eff6ff; color: #2563eb; font-size: 13px; font-weight: 800; line-height: 1; flex-shrink: 0; }
      .prep-icon-btn.is-danger { background: #fee2e2; color: #991b1b; }
      .prep-icon-btn:active { transform: scale(.94); }
      .prep-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #f1f5f9; color: #334155; }
      .prep-item:first-of-type { border-top: none; }
      .prep-item input[type="checkbox"] { width: 20px; height: 20px; accent-color: #2563eb; }
      .prep-item-text { flex: 1; font-size: 14px; line-height: 1.35; min-width: 0; word-break: break-word; }
      .prep-item.is-checked .prep-item-text { text-decoration: line-through; color: #94a3b8; }
      .prep-section-add { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
      .prep-muted { color: #94a3b8; font-size: 13px; padding: 8px 0; }
      .prep-bottom-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .prep-action-btn.secondary { background: #f1f5f9; color: #475569; }
      .prep-action-btn.danger { background: #fee2e2; color: #b91c1c; }
    `;
    document.head.appendChild(style);
  }

  function renderItem(item) {
    return `
      <label class="prep-item ${item.checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(item.id)}">
        <input type="checkbox" ${item.checked ? 'checked' : ''} />
        <span class="prep-item-text">${escapeHtml(item.text)}</span>
        <button class="prep-icon-btn prep-edit-item" title="編輯" type="button">✏️</button>
        <button class="prep-icon-btn prep-delete-item is-danger" title="刪除" type="button">✕</button>
      </label>`;
  }

  function renderSection(section) {
    return `
      <div class="prep-section" data-section-id="${escapeHtml(section.id)}">
        <div class="prep-section-title">
          <span class="prep-section-name">${escapeHtml(getSectionDisplayName(section))}</span>
          <span class="prep-section-actions">
            <span class="prep-section-count" style="font-size:12px;color:#94a3b8;">${section.items.filter(i => i.checked).length}/${section.items.length}</span>
            <button class="prep-icon-btn prep-edit-section" title="編輯" type="button">✏️</button>
            <button class="prep-icon-btn prep-delete-section is-danger" title="刪除" type="button">✕</button>
          </span>
        </div>
        <div class="prep-items">
          ${section.items.length ? section.items.map(renderItem).join('') : '<div class="prep-muted">尚無項目</div>'}
        </div>
        <div class="prep-section-add">
          <input class="prep-new-item-input" placeholder="新增項目" />
          <button class="prep-add-item-btn" type="button">新增</button>
        </div>
      </div>`;
  }

  function render() {
    if (!root || !state) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const hasSections = state.sections.length > 0;
    const syncText = syncStatus || (lastSyncedAt ? '已同步' : '');

    root.innerHTML = `
      <button class="prep-fab" type="button" aria-label="開啟準備清單">🎒 準備清單</button>
      <div class="prep-overlay" role="dialog" aria-modal="true">
        <div class="prep-panel">
          <div class="prep-header">
            <div class="prep-title-row">
              <div>
                <div style="font-size:18px;font-weight:900;">🎒 準備清單</div>
                <div class="prep-summary" style="font-size:12px;opacity:.85;margin-top:2px;">${escapeHtml(tripName)}｜${stats.done}/${stats.total}（${stats.percent}%）</div>
              </div>
              <button class="prep-close" type="button" aria-label="關閉">×</button>
            </div>
            <div class="prep-progress-track"><div class="prep-progress-bar" style="width:${stats.percent}%"></div></div>
          </div>
          <div class="prep-body">
            <div class="prep-status-line">
              <span class="prep-updated-text">${lastSyncedAt ? `更新 ${escapeHtml(formatTime(lastSyncedAt))}` : `版本 ${VERSION}`}</span>
              <span class="prep-sync-pill" style="${syncText ? '' : 'display:none;'}">${escapeHtml(syncText)}</span>
            </div>

            <div class="prep-add-box">
              <div style="font-size:13px;font-weight:900;color:#334155;">新增分類</div>
              <div class="prep-add-row">
                <input class="prep-new-section-title" placeholder="例如 🪪 證件" />
              </div>
              <button class="prep-add-section-btn" type="button">＋ 新增分類</button>
            </div>

            <div class="prep-empty" style="${hasSections ? 'display:none;' : ''}">尚未建立準備清單</div>

            <div class="prep-section-list">
              ${state.sections.map(renderSection).join('')}
            </div>

            <div class="prep-bottom-actions">
              <button class="prep-action-btn secondary prep-clear-checks" type="button">清空勾選</button>
              <button class="prep-action-btn danger prep-delete-all" type="button">刪除全部</button>
            </div>
          </div>
        </div>
      </div>`;

    const fab = root.querySelector('.prep-fab');
    const overlay = root.querySelector('.prep-overlay');
    fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
    overlay.classList.toggle('is-open', panelOpen);
  }

  function updateStatsUI() {
    if (!root || !state) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const summary = root.querySelector('.prep-summary');
    const progressBar = root.querySelector('.prep-progress-bar');
    if (summary) summary.textContent = `${tripName}｜${stats.done}/${stats.total}（${stats.percent}%）`;
    if (progressBar) progressBar.style.width = `${stats.percent}%`;

    root.querySelectorAll('.prep-section').forEach(sectionEl => {
      const section = findSection(sectionEl.dataset.sectionId);
      const count = sectionEl.querySelector('.prep-section-count');
      if (section && count) count.textContent = `${section.items.filter(i => i.checked).length}/${section.items.length}`;
    });
  }

  function updateSyncUI() {
    if (!root) return;
    const syncText = syncStatus || (lastSyncedAt ? '已同步' : '');
    const pill = root.querySelector('.prep-sync-pill');
    const updated = root.querySelector('.prep-updated-text');
    if (pill) {
      pill.textContent = syncText;
      pill.style.display = syncText ? '' : 'none';
    }
    if (updated) {
      updated.textContent = lastSyncedAt ? `更新 ${formatTime(lastSyncedAt)}` : `版本 ${VERSION}`;
    }
  }

  function updateEmptyUI() {
    if (!root || !state) return;
    const empty = root.querySelector('.prep-empty');
    if (empty) empty.style.display = state.sections.length ? 'none' : '';
  }

  function updateSectionCount(sectionId) {
    const sectionEl = root && root.querySelector(`.prep-section[data-section-id="${cssEscape(sectionId)}"]`);
    const section = findSection(sectionId);
    if (!sectionEl || !section) return;
    const count = sectionEl.querySelector('.prep-section-count');
    if (count) count.textContent = `${section.items.filter(i => i.checked).length}/${section.items.length}`;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"');
  }

  function addSectionFromInputs() {
    const titleInput = root.querySelector('.prep-new-section-title');
    const rawTitle = String(titleInput && titleInput.value || '').trim();
    const parsed = parseSectionLabel(rawTitle);
    if (!parsed.title) return;

    const section = { id: makeId('section'), title: parsed.title, emoji: parsed.emoji, items: [] };
    state.sections.push(section);
    saveState(true);

    const sectionList = root.querySelector('.prep-section-list');
    if (sectionList) sectionList.insertAdjacentHTML('beforeend', renderSection(section));
    if (titleInput) titleInput.value = '';
    updateEmptyUI();
    updateStatsUI();
    updateSyncUI();
  }

  function addItemFromInput(input) {
    const sectionEl = input.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    const text = String(input.value || '').trim();
    if (!section || !text) return;

    const item = { id: makeId('item'), text, checked: false, checkedAt: '' };
    section.items.push(item);
    saveState(true);

    const itemsEl = sectionEl.querySelector('.prep-items');
    if (itemsEl) {
      const muted = itemsEl.querySelector('.prep-muted');
      if (muted) muted.remove();
      itemsEl.insertAdjacentHTML('beforeend', renderItem(item));
    }

    input.value = '';
    updateStatsUI();
    updateSectionCount(section.id);
    updateSyncUI();

    // 保留連續輸入體驗：不要重畫整個面板，並盡量把焦點留在同一個輸入框。
    requestAnimationFrame(() => {
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    });
  }

  function updateItemChecked(input) {
    const itemEl = input.closest('.prep-item');
    const item = itemEl ? findItem(itemEl.dataset.itemId) : null;
    if (!item) return;

    item.checked = input.checked;
    item.checkedAt = item.checked ? new Date().toISOString() : '';
    saveState(true);

    itemEl.classList.toggle('is-checked', item.checked);
    const sectionEl = itemEl.closest('.prep-section');
    if (sectionEl) updateSectionCount(sectionEl.dataset.sectionId);
    updateStatsUI();
    updateSyncUI();
  }

  function editSection(btn) {
    const sectionEl = btn.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    if (!section) return;

    const nextLabel = prompt('分類名稱：', getSectionDisplayName(section));
    if (nextLabel === null) return;
    const parsed = parseSectionLabel(nextLabel);
    if (!parsed.title) return;

    section.emoji = parsed.emoji;
    section.title = parsed.title;
    saveState(true);

    const name = sectionEl.querySelector('.prep-section-name');
    if (name) name.textContent = getSectionDisplayName(section);
    updateSyncUI();
  }

  function deleteSection(btn) {
    const sectionEl = btn.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    if (!section) return;
    if (!confirm(`確定刪除「${getSectionDisplayName(section)}」？`)) return;

    state.sections = state.sections.filter(x => x.id !== section.id);
    saveState(true);
    if (sectionEl) sectionEl.remove();
    updateEmptyUI();
    updateStatsUI();
    updateSyncUI();
  }

  function editItem(btn) {
    const itemEl = btn.closest('.prep-item');
    const item = itemEl ? findItem(itemEl.dataset.itemId) : null;
    if (!item) return;

    const nextText = prompt('項目名稱：', item.text || '');
    if (nextText === null) return;
    const text = String(nextText || '').trim();
    if (!text) return;

    item.text = text;
    saveState(true);
    const textEl = itemEl.querySelector('.prep-item-text');
    if (textEl) textEl.textContent = text;
    updateSyncUI();
  }

  function deleteItem(btn) {
    const itemEl = btn.closest('.prep-item');
    if (!itemEl) return;
    const itemId = itemEl.dataset.itemId;
    const sectionEl = itemEl.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;

    if (section) section.items = section.items.filter(item => item.id !== itemId);
    saveState(true);
    itemEl.remove();

    if (sectionEl && section && section.items.length === 0) {
      const itemsEl = sectionEl.querySelector('.prep-items');
      if (itemsEl) itemsEl.innerHTML = '<div class="prep-muted">尚無項目</div>';
    }

    if (section) updateSectionCount(section.id);
    updateStatsUI();
    updateSyncUI();
  }

  function clearChecks() {
    if (!confirm('確定清空所有勾選？')) return;
    state.sections.forEach(section => section.items.forEach(item => { item.checked = false; item.checkedAt = ''; }));
    saveState(true);

    root.querySelectorAll('.prep-item').forEach(itemEl => itemEl.classList.remove('is-checked'));
    root.querySelectorAll('.prep-item input[type="checkbox"]').forEach(input => { input.checked = false; });
    updateStatsUI();
    updateSyncUI();
  }

  function deleteAll() {
    if (!confirm('確定刪除全部準備清單？')) return;
    state.sections = [];
    saveState(true);
    render();
  }

  function bindRootEvents() {
    root.addEventListener('click', event => {
      const target = event.target;

      if (target.closest('.prep-fab')) {
        panelOpen = true;
        render();
        return;
      }

      if (target.closest('.prep-close')) {
        panelOpen = false;
        render();
        return;
      }

      const overlay = target.classList && target.classList.contains('prep-overlay') ? target : null;
      if (overlay) {
        panelOpen = false;
        render();
        return;
      }

      if (target.closest('.prep-add-section-btn')) {
        addSectionFromInputs();
        return;
      }

      if (target.closest('.prep-add-item-btn')) {
        const sectionEl = target.closest('.prep-section');
        const input = sectionEl && sectionEl.querySelector('.prep-new-item-input');
        if (input) addItemFromInput(input);
        return;
      }

      if (target.closest('.prep-edit-section')) {
        editSection(target.closest('.prep-edit-section'));
        return;
      }

      if (target.closest('.prep-delete-section')) {
        deleteSection(target.closest('.prep-delete-section'));
        return;
      }

      if (target.closest('.prep-edit-item')) {
        event.preventDefault();
        editItem(target.closest('.prep-edit-item'));
        return;
      }

      if (target.closest('.prep-delete-item')) {
        event.preventDefault();
        deleteItem(target.closest('.prep-delete-item'));
        return;
      }

      if (target.closest('.prep-clear-checks')) {
        clearChecks();
        return;
      }

      if (target.closest('.prep-delete-all')) {
        deleteAll();
      }
    });

    root.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('.prep-item input[type="checkbox"]')) {
        updateItemChecked(target);
      }
    });

    root.addEventListener('keydown', event => {
      const target = event.target;
      if (event.key !== 'Enter') return;

      if (target.matches('.prep-new-section-title')) {
        event.preventDefault();
        addSectionFromInputs();
        return;
      }

      if (target.matches('.prep-new-item-input')) {
        event.preventDefault();
        addItemFromInput(target);
      }
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

  function autoSyncTick() {
    if (!API_URL || !state) return;
    ensureLoadedForCurrentTrip();

    const tripName = getCurrentTripName();
    if (!tripName || tripName === '共用清單') return;
    if (!isBrowserOnline()) {
      if (syncStatus !== '離線') {
        syncStatus = '離線';
        updateSyncUI();
      }
      return;
    }

    if (hasPendingSheetSave || syncStatus === '離線' || syncStatus === '未同步' || syncStatus === '待同步') {
      saveToSheet();
      return;
    }

    const now = Date.now();
    if (now - lastAutoRefreshAt >= AUTO_REFRESH_MS && !isEditingChecklistInput()) {
      lastAutoRefreshAt = now;
      loadFromSheet({ silent: true });
    }
  }

  function bindAutoSyncEvents() {
    window.addEventListener('online', () => {
      syncStatus = hasPendingSheetSave ? '待同步' : '同步中';
      updateSyncUI();
      autoSyncTick();
    });

    window.addEventListener('focus', () => {
      autoSyncTick();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) autoSyncTick();
    });

    setInterval(autoSyncTick, AUTO_RETRY_MS);
  }

  function ensureLoadedForCurrentTrip() {
    const key = getStorageKey();
    if (key !== currentTripKey || !state) {
      loadLocalState();
      render();
      loadFromSheet();
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
    bindRootEvents();
    loadLocalState();
    render();
    loadFromSheet();
    bindAutoSyncEvents();
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
