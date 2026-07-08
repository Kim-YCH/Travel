// version: 20260705.1
// 準備清單功能：資料庫為主、前端只做快取；新增 / 編輯 / 刪除 / 勾選改成單筆 CRUD API。
// 20260705.1：移除整份覆蓋式 prep_checklist_save，避免手機舊 localStorage 覆蓋 Google Sheet。
// 20260705.1：離線時只允許查看，不允許新增、編輯、刪除、勾選或清空。
// 20260705.1：新增 / 編輯 / 刪除改成樂觀式局部 UI；背景排隊寫入，不再成功後整面重畫。
(function () {
  const VERSION = '20260705.1';
  const STORAGE_PREFIX = 'travel_prepare_checklist_v5_cache::';
  const API_URL = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.API_URL) || '';

  let currentTripKey = '';
  let selectedOwner = '';
  let state = null;
  let root = null;
  let embeddedMode = false;
  let panelOpen = false;
  let isLoadingRemote = false;
  let pendingWrites = 0;
  let writeQueue = Promise.resolve();
  let syncStatus = '';
  let lastSyncedAt = '';
  let lastRemoteUpdatedAt = '';
  let lastAutoRefreshAt = 0;
  let lastMembersFingerprint = '';
  const boundRoots = new WeakSet();
  const AUTO_REFRESH_MS = 60000;
  const AUTO_CHECK_MS = 30000;

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

  function hashString(value) {
    const s = String(value || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  function getCurrentTripInfo() {
    const tripName = getCurrentTripName();
    const out = { id: '', name: tripName };

    try {
      const tripsCache = safeJsonParse(localStorage.getItem('trips_cache'), null);
      const trips = Array.isArray(tripsCache && tripsCache.data) ? tripsCache.data : [];
      const found = trips.find(trip => String(trip && trip.name || '').trim() === tripName && trip.id);
      if (found) out.id = String(found.id || '').trim();
    } catch (_) {}

    try {
      if (!out.id) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || '';
          if (!key.startsWith('trip_cache_')) continue;
          const cache = safeJsonParse(localStorage.getItem(key), null);
          const cachedName = String((cache && cache.trip && cache.trip.name) || '').trim();
          if (cachedName === tripName) {
            out.id = key.replace('trip_cache_', '');
            break;
          }
        }
      }
    } catch (_) {}

    return out;
  }

  function getTripIdentity() {
    const info = getCurrentTripInfo();
    return info.id || info.name || '共用清單';
  }

  function getOwnerCookieName() {
    return 'travel_prep_owner_' + hashString(getTripIdentity());
  }

  function setCookie(name, value, days) {
    const maxAge = Math.max(1, Number(days || 365)) * 24 * 60 * 60;
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value || '')}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }

  function getCookie(name) {
    const encoded = encodeURIComponent(name) + '=';
    const parts = String(document.cookie || '').split(';');
    for (const part of parts) {
      const p = part.trim();
      if (p.startsWith(encoded)) return decodeURIComponent(p.slice(encoded.length));
    }
    return '';
  }

  function getStoredOwner() {
    const key = getOwnerCookieName();
    return String(getCookie(key) || localStorage.getItem(key) || '').trim();
  }

  function storeOwner(owner) {
    const key = getOwnerCookieName();
    const value = String(owner || '').trim();
    setCookie(key, value, 365);
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function getStorageKey(owner = selectedOwner) {
    return STORAGE_PREFIX + getTripIdentity() + '::owner::' + String(owner || '').trim();
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  function parseSectionLabel(value) {
    const text = String(value || '').trim();
    if (!text) return { emoji: '', title: '' };

    const chars = Array.from(text);
    const first = chars[0] || '';
    const rest = text.slice(first.length).trim();
    const firstLooksLikeText = /^[A-Za-z0-9\u4e00-\u9fff]$/.test(first);

    if (rest && !firstLooksLikeText) return { emoji: first, title: rest };
    return { emoji: '', title: text };
  }

  function getSectionDisplayName(section) {
    const emoji = String(section && section.emoji || '').trim();
    const title = String(section && section.title || '').trim();
    return `${emoji ? emoji + ' ' : ''}${title}`.trim() || '未命名分類';
  }

  function getCurrentTripCache() {
    const tripName = getCurrentTripName();
    const info = getCurrentTripInfo();
    const candidates = [];

    if (info.id) candidates.push(info.id);

    try {
      const tripsCache = safeJsonParse(localStorage.getItem('trips_cache'), null);
      const trips = Array.isArray(tripsCache && tripsCache.data) ? tripsCache.data : [];
      trips.forEach(trip => {
        if (String(trip && trip.name || '').trim() === tripName && trip.id) candidates.push(String(trip.id));
      });
    } catch (_) {}

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (!key.startsWith('trip_cache_')) continue;
        const cache = safeJsonParse(localStorage.getItem(key), null);
        const cachedName = String((cache && cache.trip && cache.trip.name) || '').trim();
        if (cachedName === tripName) candidates.push(key.replace('trip_cache_', ''));
      }
    } catch (_) {}

    const seen = new Set();
    for (const tripId of candidates) {
      if (!tripId || seen.has(tripId)) continue;
      seen.add(tripId);
      const cache = safeJsonParse(localStorage.getItem('trip_cache_' + tripId), null);
      if (cache) return cache;
    }
    return null;
  }

  function getMemberNames() {
    const cache = getCurrentTripCache();
    const people = Array.isArray(cache && cache.people) ? cache.people : [];
    const names = [];
    const seen = new Set();

    people.forEach((person, index) => {
      const name = String((person && person.name) || '').trim() || `成員 ${index + 1}`;
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    return names;
  }

  function membersFingerprint() {
    return getMemberNames().join('|');
  }

  function renderOwnerOptions(selectedValue, includePlaceholder = true) {
    const selected = String(selectedValue || '').trim();
    const names = getMemberNames();
    if (selected && !names.includes(selected)) names.unshift(selected);

    const options = [];
    if (includePlaceholder) options.push(`<option value=""${selected ? '' : ' selected'}>請選擇</option>`);
    names.forEach(name => options.push(`<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`));
    return options.join('');
  }

  function buildEmptyState(owner = selectedOwner) {
    return { version: VERSION, owner: String(owner || '').trim(), updatedAt: '', sections: [] };
  }

  function normalizeState(saved, owner = selectedOwner) {
    if (!saved || !Array.isArray(saved.sections)) return buildEmptyState(owner);
    return {
      version: VERSION,
      owner: String(saved.owner || owner || '').trim(),
      updatedAt: saved.updatedAt || '',
      sections: saved.sections
        .filter(section => section && String(section.title || '').trim())
        .map(section => ({
          id: String(section.id || makeId('section')),
          title: String(section.title || '').trim(),
          emoji: String(section.emoji || '').trim(),
          owner: String(section.owner || saved.owner || owner || '').trim(),
          items: Array.isArray(section.items)
            ? section.items
                .filter(item => item && String(item.text || '').trim())
                .map(item => ({
                  id: String(item.id || makeId('item')),
                  text: String(item.text || '').trim(),
                  checked: !!item.checked,
                  checkedAt: item.checkedAt || ''
                }))
            : []
        }))
    };
  }

  function isBrowserOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function isEditingChecklistInput() {
    const active = document.activeElement;
    return !!(root && active && root.contains(active) && active.matches('input, textarea, select'));
  }

  function loadLocalState() {
    currentTripKey = getStorageKey(selectedOwner);
    if (!selectedOwner) {
      state = buildEmptyState('');
      return;
    }

    const saved = safeJsonParse(localStorage.getItem(currentTripKey), null);
    state = normalizeState(saved || null, selectedOwner);
  }

  function saveLocal(updateTime = false) {
    if (!state || !selectedOwner) return;
    state.owner = selectedOwner;
    state.sections.forEach(section => { section.owner = selectedOwner; });
    if (updateTime) state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(currentTripKey, JSON.stringify(state)); } catch (_) {}
  }

  async function apiPost(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return await res.json();
  }

  function applyRemoteData(data, statusText) {
    const remote = normalizeState({
      owner: data.owner || selectedOwner,
      updatedAt: data.updatedAt || new Date().toISOString(),
      sections: data.sections || []
    }, selectedOwner);

    state = remote;
    lastRemoteUpdatedAt = data.updatedAt || lastRemoteUpdatedAt;
    lastSyncedAt = new Date().toISOString();
    syncStatus = statusText || '已同步';
    saveLocal(false);
  }

  function refreshPersonalArea() {
    if (!root || !state) return;
    const area = root.querySelector('.prep-personal-area');
    if (area) {
      area.innerHTML = renderSelectedOwnerBody();
      updateEmptyUI();
      updateStatsUI();
      updateSyncUI();
    } else {
      render();
    }
  }

  function refreshChecklistFromDatabase() {
    if (!selectedOwner) return;
    if (pendingWrites > 0) {
      syncStatus = '儲存中，稍後更新';
      updateSyncUI();
      return;
    }
    loadFromSheet({ manual: true, partial: true });
  }

  async function loadFromSheet(options = {}) {
    if (!API_URL || isLoadingRemote || pendingWrites > 0 || !selectedOwner) return;
    const trip = getCurrentTripInfo();
    if (!trip.name || trip.name === '共用清單') return;

    const silent = !!options.silent;
    isLoadingRemote = true;
    if (!silent) {
      syncStatus = isBrowserOnline() ? '讀取資料庫' : '離線，只可查看';
      updateSyncUI();
    }

    try {
      if (!isBrowserOnline()) throw new Error('offline');
      let url = API_URL
        + '?action=prep_checklist_get'
        + '&owner=' + encodeURIComponent(selectedOwner)
        + '&t=' + encodeURIComponent(Date.now());

      if (trip.id) url += '&tripId=' + encodeURIComponent(trip.id);
      else url += '&tripName=' + encodeURIComponent(trip.name);

      const res = await fetch(url);
      const data = await res.json();
      if (data && data.status === 'success') {
        // 20260705.1：資料庫是主資料。讀取時用 Google Sheet 取代前端快取，但只刷新準備清單區塊。
        applyRemoteData(data, '已同步');
        if (options.partial === false) render();
        else refreshPersonalArea();
      } else {
        syncStatus = '讀取失敗';
        updateSyncUI();
      }
    } catch (err) {
      console.warn('prep checklist load failed:', err);
      syncStatus = isBrowserOnline() ? '讀取失敗' : '離線，只可查看';
      updateSyncUI();
    } finally {
      isLoadingRemote = false;
    }
  }


  function buildBasePayload(action) {
    const trip = getCurrentTripInfo();
    return {
      action,
      tripId: trip.id || '',
      tripName: trip.name,
      owner: selectedOwner
    };
  }

  function canWrite() {
    if (!API_URL || !selectedOwner || !state) return false;
    if (isLoadingRemote) {
      syncStatus = '資料庫讀取中';
      updateSyncUI();
      alert('資料庫讀取中，請等讀取完成後再操作準備清單。');
      return false;
    }
    if (!isBrowserOnline()) {
      syncStatus = '離線，只可查看';
      updateSyncUI();
      alert('目前離線。為了避免資料不一致，準備清單離線時只能查看，不能新增、編輯、刪除或勾選。');
      return false;
    }
    return true;
  }


  function mutateChecklist(action, payload, options = {}) {
    if (!options.skipCanWrite && !canWrite()) return Promise.resolve(null);
    const trip = getCurrentTripInfo();
    if (!trip.name || trip.name === '共用清單') return Promise.resolve(null);

    pendingWrites += 1;
    syncStatus = options.status || '儲存中';
    updateSyncUI();

    const job = writeQueue.then(async () => {
      if (!isBrowserOnline()) throw new Error('offline');

      const out = await apiPost({ ...buildBasePayload(action), ...(payload || {}) });
      if (!out || out.status !== 'success') {
        throw new Error((out && out.message) || 'write failed');
      }

      lastRemoteUpdatedAt = out.updatedAt || lastRemoteUpdatedAt;
      lastSyncedAt = new Date().toISOString();
      if (state && out.updatedAt) state.updatedAt = out.updatedAt;
      saveLocal(false);

      if (typeof options.onSuccess === 'function') options.onSuccess(out);

      syncStatus = options.successStatus || '已儲存';
      updateSyncUI();
      return out;
    }).catch(err => {
      console.warn('prep checklist mutation failed:', action, err);

      if (typeof options.onError === 'function') {
        try { options.onError(err); } catch (rollbackErr) { console.warn('prep rollback failed:', rollbackErr); }
      } else if (isBrowserOnline()) {
        loadFromSheet({ silent: true });
      }

      syncStatus = isBrowserOnline() ? '儲存失敗' : '離線，只可查看';
      updateSyncUI();
      if (options.alertOnError !== false) {
        alert('準備清單儲存失敗，已回復剛剛的操作。請稍後再試。');
      }
      return null;
    }).finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1);
      if (pendingWrites === 0 && isBrowserOnline() && syncStatus !== '儲存失敗') {
        syncStatus = '已儲存';
        updateSyncUI();
      }
    });

    writeQueue = job.then(() => null, () => null);
    return job;
  }


  function getStats() {
    const items = (state && state.sections ? state.sections : []).flatMap(section => section.items || []);
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
      .prep-status-right { display:flex; align-items:center; gap:6px; min-width:0; }
      .prep-sync-pill { background:#e0f2fe; color:#0369a1; border-radius:999px; padding:4px 8px; font-weight:800; white-space:nowrap; }
      .prep-refresh-btn { border:1px solid #bfdbfe; background:#fff; color:#2563eb; border-radius:999px; padding:4px 8px; font-size:11px; font-weight:900; white-space:nowrap; }
      .prep-refresh-btn:disabled { opacity:.45; }
      .prep-owner-box { background: white; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px; display: grid; gap: 8px; margin-bottom: 12px; }
      .prep-owner-row { display:grid; grid-template-columns: 80px 1fr; gap:8px; align-items:center; }
      .prep-owner-row label { font-size:13px; font-weight:900; color:#334155; }
      .prep-owner-select, .prep-add-box input, .prep-section-add input { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px 12px; font-size: 14px; background: white; min-width: 0; }
      .prep-add-box { background: white; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px; display: grid; gap: 8px; margin-bottom: 12px; }
      .prep-add-row { display: grid; grid-template-columns: 1fr; gap: 8px; }
      .prep-add-box button, .prep-section-add button, .prep-action-btn { border: none; border-radius: 12px; padding: 10px 12px; font-weight: 800; background: #2563eb; color: white; }
      .prep-section { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
      .prep-section-title { font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .prep-section-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .prep-section-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
      .prep-icon-btn { border: none; width: 28px; height: 28px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: #eff6ff; color: #2563eb; font-size: 13px; font-weight: 800; line-height: 1; flex-shrink: 0; }
      .prep-icon-btn.is-danger { background: #fee2e2; color: #991b1b; }
      .prep-icon-btn:active { transform: scale(.94); }
      .prep-item { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid #f1f5f9; color: #334155; }
      .prep-item:first-of-type { border-top: none; }
      .prep-item input[type="checkbox"] { width: 20px; height: 20px; accent-color: #2563eb; }
      .prep-item-text { flex: 1; font-size: 14px; line-height: 1.35; min-width: 0; word-break: break-word; }
      .prep-section-add { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
      @media (max-width: 420px) { .prep-add-row { grid-template-columns: 1fr; } .prep-owner-row { grid-template-columns: 1fr; } .prep-item { flex-wrap: nowrap; } }
      .prep-item.is-checked .prep-item-text { text-decoration: line-through; color: #94a3b8; }
      .prep-muted { color: #94a3b8; font-size: 13px; padding: 8px 0; }
      .prep-bottom-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .prep-action-btn.secondary { background: #f1f5f9; color: #475569; }
      .prep-action-btn.danger { background: #fee2e2; color: #b91c1c; }
      .prep-blank { min-height: 220px; }
      .prep-offline-note { color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:800; margin-bottom:10px; }
      .prep-disabled button:not(.prep-close), .prep-disabled input[type="checkbox"] { opacity:.55; }
    `;
    document.head.appendChild(style);
  }

  function renderItem(item) {
    return `
      <div class="prep-item ${item.checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(item.id)}">
        <input type="checkbox" ${item.checked ? 'checked' : ''} ${!isBrowserOnline() ? 'disabled' : ''} />
        <span class="prep-item-text">${escapeHtml(item.text)}</span>
        <button class="prep-icon-btn prep-edit-item" title="編輯" type="button">✏️</button>
        <button class="prep-icon-btn prep-delete-item is-danger" title="刪除" type="button">✕</button>
      </div>`;
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

  function renderSelectedOwnerBody() {
    if (!selectedOwner) return '<div class="prep-blank"></div>';
    const hasSections = state && state.sections && state.sections.length > 0;
    const offlineNote = !isBrowserOnline() ? '<div class="prep-offline-note">目前離線，只可查看。新增、編輯、刪除與勾選都會被阻擋。</div>' : '';
    return `
      ${offlineNote}
      <div class="prep-add-box">
        <div style="font-size:13px;font-weight:900;color:#334155;">新增分類</div>
        <div class="prep-add-row"><input class="prep-new-section-title" placeholder="例如 🪪 證件" /></div>
        <button class="prep-add-section-btn" type="button">＋ 新增分類</button>
      </div>
      <div class="prep-section-list">${hasSections ? state.sections.map(renderSection).join('') : ''}</div>
      <div class="prep-bottom-actions" style="${hasSections ? '' : 'display:none;'}">
        <button class="prep-action-btn secondary prep-clear-checks" type="button">清空勾選</button>
        <button class="prep-action-btn danger prep-delete-all" type="button">刪除全部</button>
      </div>`;
  }

  function render() {
    if (!root || !state) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const syncText = selectedOwner ? (syncStatus || (lastSyncedAt ? '已同步' : '')) : '';
    const ownerText = selectedOwner || '請選擇';
    const disabledClass = !isBrowserOnline() ? ' prep-disabled' : '';

    if (embeddedMode) {
      root.classList.toggle('prep-disabled', !isBrowserOnline());
      root.innerHTML = `
        <div class="prep-status-line">
          <span class="prep-updated-text">${selectedOwner ? (lastSyncedAt ? `?湔 ${escapeHtml(formatTime(lastSyncedAt))}` : `? ${VERSION}`) : ''}</span>
          <span class="prep-status-right">
            <button class="prep-refresh-btn" type="button" style="${selectedOwner ? '' : 'display:none;'}" ${(!selectedOwner || !isBrowserOnline() || pendingWrites > 0) ? 'disabled' : ''}>???湔鞈?</button>
            <span class="prep-sync-pill" style="${syncText ? '' : 'display:none;'}">${escapeHtml(syncText)}</span>
          </span>
        </div>
        <div class="prep-owner-box">
          <div class="prep-owner-row">
            <label for="prep-owner-select">?亦?撠情</label>
            <select id="prep-owner-select" class="prep-owner-select">${renderOwnerOptions(selectedOwner, true)}</select>
          </div>
        </div>
        <div class="prep-personal-area">${renderSelectedOwnerBody()}</div>`;
      return;
    }

    root.innerHTML = `
      <button class="prep-fab" type="button" aria-label="開啟準備清單">🎒 準備清單</button>
      <div class="prep-overlay" role="dialog" aria-modal="true">
        <div class="prep-panel${disabledClass}">
          <div class="prep-header">
            <div class="prep-title-row">
              <div>
                <div style="font-size:18px;font-weight:900;">🎒 準備清單</div>
                <div class="prep-summary" style="font-size:12px;opacity:.85;margin-top:2px;">${escapeHtml(tripName)}｜${escapeHtml(ownerText)}${selectedOwner ? `｜${stats.done}/${stats.total}（${stats.percent}%）` : ''}</div>
              </div>
              <button class="prep-close" type="button" aria-label="關閉">×</button>
            </div>
            <div class="prep-progress-track"><div class="prep-progress-bar" style="width:${selectedOwner ? stats.percent : 0}%"></div></div>
          </div>
          <div class="prep-body">
            <div class="prep-status-line">
              <span class="prep-updated-text">${selectedOwner ? (lastSyncedAt ? `更新 ${escapeHtml(formatTime(lastSyncedAt))}` : `版本 ${VERSION}`) : ''}</span>
              <span class="prep-status-right">
                <button class="prep-refresh-btn" type="button" style="${selectedOwner ? '' : 'display:none;'}" ${(!selectedOwner || !isBrowserOnline() || pendingWrites > 0) ? 'disabled' : ''}>↻ 更新資料</button>
                <span class="prep-sync-pill" style="${syncText ? '' : 'display:none;'}">${escapeHtml(syncText)}</span>
              </span>
            </div>
            <div class="prep-owner-box">
              <div class="prep-owner-row">
                <label for="prep-owner-select">查看對象</label>
                <select id="prep-owner-select" class="prep-owner-select">${renderOwnerOptions(selectedOwner, true)}</select>
              </div>
            </div>
            <div class="prep-personal-area">${renderSelectedOwnerBody()}</div>
          </div>
        </div>
      </div>`;

    if (embeddedMode) {
      const body = root.querySelector('.prep-body');
      if (body) {
        const fragment = document.createDocumentFragment();
        while (body.firstChild) fragment.appendChild(body.firstChild);
        root.classList.toggle('prep-disabled', !isBrowserOnline());
        root.innerHTML = '';
        root.appendChild(fragment);
      }
      return;
    }

    const fab = root.querySelector('.prep-fab');
    const overlay = root.querySelector('.prep-overlay');
    if (fab) fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
    if (overlay) overlay.classList.toggle('is-open', panelOpen);
  }

  function updateSyncUI() {
    if (!root) return;
    const syncText = selectedOwner ? (syncStatus || (lastSyncedAt ? '已同步' : '')) : '';
    const pill = root.querySelector('.prep-sync-pill');
    const updated = root.querySelector('.prep-updated-text');
    const refreshBtn = root.querySelector('.prep-refresh-btn');
    if (refreshBtn) {
      refreshBtn.style.display = selectedOwner ? '' : 'none';
      refreshBtn.disabled = !selectedOwner || !isBrowserOnline() || pendingWrites > 0 || isLoadingRemote;
    }
    if (pill) {
      pill.textContent = syncText;
      pill.style.display = syncText ? '' : 'none';
    }
    if (updated) updated.textContent = selectedOwner ? (lastSyncedAt ? `更新 ${formatTime(lastSyncedAt)}` : `版本 ${VERSION}`) : '';
  }

  function cloneState(data) {
    return normalizeState(JSON.parse(JSON.stringify(data || buildEmptyState(selectedOwner))), selectedOwner);
  }

  function updateStatsUI() {
    if (!root || !state) return;
    const stats = getStats();
    const tripName = getCurrentTripName();
    const ownerText = selectedOwner || '請選擇';
    const summary = root.querySelector('.prep-summary');
    const progressBar = root.querySelector('.prep-progress-bar');
    if (summary) summary.textContent = selectedOwner
      ? `${tripName}｜${ownerText}｜${stats.done}/${stats.total}（${stats.percent}%）`
      : `${tripName}｜${ownerText}`;
    if (progressBar) progressBar.style.width = `${selectedOwner ? stats.percent : 0}%`;
  }

  function updateEmptyUI() {
    if (!root || !state) return;
    const actions = root.querySelector('.prep-bottom-actions');
    if (actions) actions.style.display = state.sections.length ? '' : 'none';
  }

  function updateSectionCount(sectionId) {
    const sectionEl = root && root.querySelector(`.prep-section[data-section-id="${cssEscape(sectionId)}"]`);
    const section = findSection(sectionId);
    if (!sectionEl || !section) return;
    const count = sectionEl.querySelector('.prep-section-count');
    if (count) count.textContent = `${section.items.filter(i => i.checked).length}/${section.items.length}`;
  }

  function refreshItemMuted(sectionEl, section) {
    if (!sectionEl || !section) return;
    const itemsEl = sectionEl.querySelector('.prep-items');
    if (!itemsEl) return;
    const muted = itemsEl.querySelector('.prep-muted');
    if (section.items.length === 0) {
      if (!muted) itemsEl.innerHTML = '<div class="prep-muted">尚無項目</div>';
    } else if (muted) {
      muted.remove();
    }
  }


  function changeSelectedOwner(owner) {
    const next = String(owner || '').trim();
    if (next === selectedOwner) return;
    selectedOwner = next;
    storeOwner(selectedOwner);
    syncStatus = selectedOwner ? '讀取資料庫' : '';
    lastSyncedAt = '';
    lastRemoteUpdatedAt = '';
    loadLocalState();
    render();
    if (selectedOwner) loadFromSheet();
  }

  function addSectionFromInputs() {
    const titleInput = root.querySelector('.prep-new-section-title');
    const rawTitle = String(titleInput && titleInput.value || '').trim();
    const parsed = parseSectionLabel(rawTitle);
    if (!selectedOwner || !parsed.title) return;
    if (!canWrite()) return;

    const sectionId = makeId('section');
    const section = { id: sectionId, title: parsed.title, emoji: parsed.emoji, owner: selectedOwner, items: [] };
    const sortOrder = (state.sections || []).length + 1;

    state.sections.push(section);
    saveLocal(true);

    const sectionList = root.querySelector('.prep-section-list');
    if (sectionList) sectionList.insertAdjacentHTML('beforeend', renderSection(section));
    if (titleInput) titleInput.value = '';
    updateEmptyUI();
    updateStatsUI();
    updateSyncUI();

    mutateChecklist('prep_category_add', {
      categoryId: sectionId,
      category: parsed.title,
      categoryEmoji: parsed.emoji,
      sortOrder
    }, {
      skipCanWrite: true,
      status: '新增分類中',
      onError: () => {
        state.sections = (state.sections || []).filter(x => String(x.id) !== String(sectionId));
        saveLocal(false);
        const sectionEl = root && root.querySelector(`.prep-section[data-section-id="${cssEscape(sectionId)}"]`);
        if (sectionEl) sectionEl.remove();
        updateEmptyUI();
        updateStatsUI();
      }
    });
  }


  function addItemFromInput(input) {
    const sectionEl = input.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    const text = String(input.value || '').trim();
    if (!section || !text) return;
    if (!canWrite()) return;

    const itemId = makeId('item');
    const item = { id: itemId, text, checked: false, checkedAt: '' };
    const sortOrder = (section.items || []).length + 1;

    section.items.push(item);
    saveLocal(true);

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

    requestAnimationFrame(() => {
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    });

    mutateChecklist('prep_item_add', {
      categoryId: section.id,
      itemId,
      itemName: text,
      sortOrder
    }, {
      skipCanWrite: true,
      status: '新增項目中',
      onError: () => {
        section.items = (section.items || []).filter(x => String(x.id) !== String(itemId));
        saveLocal(false);
        const itemEl = root && root.querySelector(`.prep-item[data-item-id="${cssEscape(itemId)}"]`);
        if (itemEl) itemEl.remove();
        refreshItemMuted(sectionEl, section);
        updateStatsUI();
        updateSectionCount(section.id);
      }
    });
  }


  function updateItemChecked(input) {
    const itemEl = input.closest('.prep-item');
    const item = itemEl ? findItem(itemEl.dataset.itemId) : null;
    if (!item) return;

    const oldChecked = !!item.checked;
    const oldCheckedAt = item.checkedAt || '';
    const checked = !!input.checked;

    if (!canWrite()) {
      input.checked = oldChecked;
      return;
    }

    item.checked = checked;
    item.checkedAt = checked ? new Date().toISOString() : '';
    saveLocal(true);

    itemEl.classList.toggle('is-checked', item.checked);
    const sectionEl = itemEl.closest('.prep-section');
    if (sectionEl) updateSectionCount(sectionEl.dataset.sectionId);
    updateStatsUI();
    updateSyncUI();

    mutateChecklist('prep_item_check', {
      itemId: item.id,
      checked
    }, {
      skipCanWrite: true,
      status: '儲存勾選中',
      onError: () => {
        item.checked = oldChecked;
        item.checkedAt = oldCheckedAt;
        input.checked = oldChecked;
        itemEl.classList.toggle('is-checked', oldChecked);
        saveLocal(false);
        if (sectionEl) updateSectionCount(sectionEl.dataset.sectionId);
        updateStatsUI();
      }
    });
  }


  function editSection(btn) {
    const sectionEl = btn.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    if (!section) return;

    const nextLabel = prompt('分類名稱：', getSectionDisplayName(section));
    if (nextLabel === null) return;
    const parsed = parseSectionLabel(nextLabel);
    if (!parsed.title) return;
    if (!canWrite()) return;

    const oldTitle = section.title;
    const oldEmoji = section.emoji;
    section.emoji = parsed.emoji;
    section.title = parsed.title;
    section.owner = selectedOwner;
    saveLocal(true);

    const name = sectionEl.querySelector('.prep-section-name');
    if (name) name.textContent = getSectionDisplayName(section);
    updateSyncUI();

    mutateChecklist('prep_category_edit', {
      categoryId: section.id,
      category: parsed.title,
      categoryEmoji: parsed.emoji
    }, {
      skipCanWrite: true,
      status: '修改分類中',
      onError: () => {
        section.title = oldTitle;
        section.emoji = oldEmoji;
        saveLocal(false);
        if (name) name.textContent = getSectionDisplayName(section);
      }
    });
  }


  function deleteSection(btn) {
    const sectionEl = btn.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;
    if (!section) return;
    if (!confirm(`確定刪除「${getSectionDisplayName(section)}」？`)) return;
    if (!canWrite()) return;

    const backup = cloneState(state);
    const categoryId = section.id;
    state.sections = (state.sections || []).filter(x => String(x.id) !== String(categoryId));
    saveLocal(true);
    if (sectionEl) sectionEl.remove();
    updateEmptyUI();
    updateStatsUI();
    updateSyncUI();

    mutateChecklist('prep_category_delete', { categoryId }, {
      skipCanWrite: true,
      status: '刪除分類中',
      onError: () => {
        state = backup;
        saveLocal(false);
        render();
      }
    });
  }


  function editItem(btn) {
    const itemEl = btn.closest('.prep-item');
    const item = itemEl ? findItem(itemEl.dataset.itemId) : null;
    if (!item) return;

    const nextText = prompt('項目名稱：', item.text || '');
    if (nextText === null) return;
    const text = String(nextText || '').trim();
    if (!text) return;
    if (!canWrite()) return;

    const oldText = item.text;
    item.text = text;
    saveLocal(true);

    const textEl = itemEl.querySelector('.prep-item-text');
    if (textEl) textEl.textContent = text;
    updateSyncUI();

    mutateChecklist('prep_item_edit', {
      itemId: item.id,
      itemName: text
    }, {
      skipCanWrite: true,
      status: '修改項目中',
      onError: () => {
        item.text = oldText;
        saveLocal(false);
        if (textEl) textEl.textContent = oldText;
      }
    });
  }


  function deleteItem(btn) {
    const itemEl = btn.closest('.prep-item');
    const item = itemEl ? findItem(itemEl.dataset.itemId) : null;
    if (!item) return;
    if (!confirm(`確定刪除「${item.text}」？`)) return;
    if (!canWrite()) return;

    const backup = cloneState(state);
    const itemId = item.id;
    const sectionEl = itemEl.closest('.prep-section');
    const section = sectionEl ? findSection(sectionEl.dataset.sectionId) : null;

    if (section) section.items = (section.items || []).filter(x => String(x.id) !== String(itemId));
    saveLocal(true);
    itemEl.remove();
    if (section) refreshItemMuted(sectionEl, section);
    if (section) updateSectionCount(section.id);
    updateStatsUI();
    updateSyncUI();

    mutateChecklist('prep_item_delete', { itemId }, {
      skipCanWrite: true,
      status: '刪除項目中',
      onError: () => {
        state = backup;
        saveLocal(false);
        render();
      }
    });
  }


  function clearChecks() {
    if (!selectedOwner || !confirm(`確定清空「${selectedOwner}」所有勾選？`)) return;
    if (!canWrite()) return;

    const backup = cloneState(state);
    state.sections.forEach(section => section.items.forEach(item => { item.checked = false; item.checkedAt = ''; }));
    saveLocal(true);

    root.querySelectorAll('.prep-item').forEach(itemEl => itemEl.classList.remove('is-checked'));
    root.querySelectorAll('.prep-item input[type="checkbox"]').forEach(input => { input.checked = false; });
    root.querySelectorAll('.prep-section').forEach(sectionEl => updateSectionCount(sectionEl.dataset.sectionId));
    updateStatsUI();
    updateSyncUI();

    mutateChecklist('prep_checks_clear', {}, {
      skipCanWrite: true,
      status: '清空勾選中',
      onError: () => {
        state = backup;
        saveLocal(false);
        render();
      }
    });
  }


  function deleteAll() {
    if (!selectedOwner) return;
    if (!confirm(`確定刪除「${selectedOwner}」的全部準備清單？`)) return;
    if (!confirm('這會刪除資料庫中的全部準備分類與項目，確定繼續？')) return;
    if (!canWrite()) return;

    const backup = cloneState(state);
    state.sections = [];
    saveLocal(true);
    render();

    mutateChecklist('prep_all_delete', { confirmDeleteAll: true }, {
      skipCanWrite: true,
      status: '刪除全部中',
      onError: () => {
        state = backup;
        saveLocal(false);
        render();
      }
    });
  }


  function bindRootEvents() {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);

    root.addEventListener('click', event => {
      const target = event.target;
      if (target.closest('.prep-fab')) { panelOpen = true; render(); return; }
      if (target.closest('.prep-close')) { panelOpen = false; render(); return; }
      const overlay = target.classList && target.classList.contains('prep-overlay') ? target : null;
      if (overlay) { panelOpen = false; render(); return; }
      if (target.closest('.prep-refresh-btn')) { refreshChecklistFromDatabase(); return; }
      if (!selectedOwner && !target.closest('.prep-owner-select')) return;

      if (target.closest('.prep-add-section-btn')) { addSectionFromInputs(); return; }
      if (target.closest('.prep-add-item-btn')) {
        const sectionEl = target.closest('.prep-section');
        const input = sectionEl && sectionEl.querySelector('.prep-new-item-input');
        if (input) addItemFromInput(input);
        return;
      }
      if (target.closest('.prep-edit-section')) { editSection(target.closest('.prep-edit-section')); return; }
      if (target.closest('.prep-delete-section')) { deleteSection(target.closest('.prep-delete-section')); return; }
      if (target.closest('.prep-edit-item')) { event.preventDefault(); editItem(target.closest('.prep-edit-item')); return; }
      if (target.closest('.prep-delete-item')) { event.preventDefault(); deleteItem(target.closest('.prep-delete-item')); return; }
      if (target.closest('.prep-clear-checks')) { clearChecks(); return; }
      if (target.closest('.prep-delete-all')) { deleteAll(); }
    });

    root.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('.prep-owner-select')) { changeSelectedOwner(target.value); return; }
      if (target.matches('.prep-item input[type="checkbox"]')) updateItemChecked(target);
    });

    root.addEventListener('keydown', event => {
      const target = event.target;
      if (event.key !== 'Enter') return;
      if (target.matches('.prep-new-section-title')) { event.preventDefault(); addSectionFromInputs(); return; }
      if (target.matches('.prep-new-item-input')) { event.preventDefault(); addItemFromInput(target); }
    });
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"');
  }

  function findSection(sectionId) {
    return (state.sections || []).find(section => String(section.id) === String(sectionId)) || null;
  }

  function findItem(itemId) {
    for (const section of state.sections || []) {
      const item = (section.items || []).find(x => String(x.id) === String(itemId));
      if (item) return item;
    }
    return null;
  }

  function autoSyncTick() {
    if (!API_URL || !state || !selectedOwner) return;
    ensureLoadedForCurrentTrip();

    const tripName = getCurrentTripName();
    if (!tripName || tripName === '共用清單') return;

    if (!isBrowserOnline()) {
      if (syncStatus !== '離線，只可查看') {
        syncStatus = '離線，只可查看';
        updateSyncUI();
      }
      return;
    }

    if (pendingWrites > 0 || isLoadingRemote) return;
    const now = Date.now();
    if (now - lastAutoRefreshAt >= AUTO_REFRESH_MS && !isEditingChecklistInput()) {
      lastAutoRefreshAt = now;
      loadFromSheet({ silent: true });
    }
  }

  function bindAutoSyncEvents() {
    window.addEventListener('online', () => {
      syncStatus = '重新讀取資料庫';
      updateSyncUI();
      loadFromSheet();
    });
    window.addEventListener('offline', () => {
      syncStatus = '離線，只可查看';
      updateSyncUI();
      render();
    });
    window.addEventListener('focus', () => { if (isBrowserOnline()) autoSyncTick(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && isBrowserOnline()) autoSyncTick(); });
    document.addEventListener('travel:partial-refresh', event => {
      const target = event && event.detail && event.detail.target;
      if (!target || target === 'current' || target === 'prep' || target === 'checklist') refreshChecklistFromDatabase();
    });
    window.TRAVEL_PREP_REFRESH = refreshChecklistFromDatabase;
    setInterval(autoSyncTick, AUTO_CHECK_MS);
  }

  function ensureLoadedForCurrentTrip() {
    const embeddedRoot = document.querySelector('.prep-page #prep-checklist-root');
    if (embeddedRoot && embeddedRoot !== root) {
      root = embeddedRoot;
      embeddedMode = true;
      bindRootEvents();
      render();
    }

    const storedOwner = getStoredOwner();
    const key = getStorageKey(selectedOwner);
    const memberFp = membersFingerprint();

    if (!selectedOwner && storedOwner) selectedOwner = storedOwner;

    if (key !== currentTripKey || !state) {
      loadLocalState();
      render();
      if (selectedOwner && isBrowserOnline()) loadFromSheet();
      lastMembersFingerprint = memberFp;
    } else {
      const fab = root && root.querySelector('.prep-fab');
      if (fab) fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
      if (memberFp !== lastMembersFingerprint && !isEditingChecklistInput()) {
        lastMembersFingerprint = memberFp;
        render();
      }
    }
  }

  function init() {
    addStyle();
    root = document.getElementById('prep-checklist-root');
    embeddedMode = true;
    if (!root) {
      root = document.createElement('div');
      root.id = 'prep-checklist-pending-root';
      root.style.display = 'none';
      document.body.appendChild(root);
    }
    bindRootEvents();
    selectedOwner = getStoredOwner();
    lastMembersFingerprint = membersFingerprint();
    loadLocalState();
    render();
    if (selectedOwner) loadFromSheet();
    bindAutoSyncEvents();
    const observer = new MutationObserver(() => ensureLoadedForCurrentTrip());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(ensureLoadedForCurrentTrip, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
