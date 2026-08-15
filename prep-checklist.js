// version: 20260815.3
// 準備清單功能：資料庫為主、前端只做快取；新增 / 編輯 / 刪除 / 勾選改成單筆 CRUD API。
// 20260705.1：移除整份覆蓋式 prep_checklist_save，避免手機舊 localStorage 覆蓋 Google Sheet。
// 20260705.1：離線時只允許查看，不允許新增、編輯、刪除、勾選或清空。
// 20260705.1：新增 / 編輯 / 刪除改成樂觀式局部 UI；背景排隊寫入，不再成功後整面重畫。
(function () {
  const VERSION = '20260815.3';
  const STORAGE_PREFIX = 'travel_prepare_checklist_v5_cache::';
  const PREP_PENDING_QUEUE_PREFIX = 'travel_prepare_checklist_pending_v1::';
  const API_URL = (window.TRAVEL_CONFIG && window.TRAVEL_CONFIG.API_URL) || '';

  let currentTripKey = '';
  let selectedOwner = '';
  // 目前在右欄顯示哪一個分類。純 UI 狀態：不進 state、不進 localStorage，
  // 也不進 saveLocal / normalizeState 這兩條序列化路徑（進去就會被寫上 Google Sheet）。
  let selectedSectionId = '';
  let state = null;
  let root = null;
  let embeddedMode = false;
  let panelOpen = false;
  let isLoadingRemote = false;
  let pendingWrites = 0;
  let pendingMutations = [];
  let isFlushingPendingMutations = false;
  let writeQueue = Promise.resolve();
  let syncStatus = '';
  let lastSyncedAt = '';
  let lastRemoteUpdatedAt = '';
  let lastAutoRefreshAt = 0;
  let lastMembersFingerprint = '';
  let remoteLoadRequestId = 0;
  const boundRoots = new WeakSet();
  const AUTO_REFRESH_MS = 60000;
  const AUTO_CHECK_MS = 30000;

  // 品項圖片：與清單文字狀態分開管理。imagesByItem[itemId] = [imgObj,...]
  const imagesByItem = {};
  let imagesLoadedForOwner = null;
  // 圖片抓取的重試狀態。圖片跟清單文字不同：清單有自己的輪詢會一直補，
  // 圖片原本只掛在 refreshPersonalArea() 結尾那一次呼叫上，
  // 只要那條路徑被 loadFromSheet 的任何一個 early return 擋掉，就永遠不會再試。
  let imagesInFlight = false;
  let imagesRetryAfter = 0;
  let imagesFailStreak = 0;
  const IMAGES_MAX_RETRY = 5;
  const IMAGES_RETRY_MS = 4000;
  let sharedFileInput = null;
  let pendingUploadItemId = '';
  const IMAGE_MAX_EDGE = 1600;
  const IMAGE_TARGET_BYTES = 1.2 * 1024 * 1024;
  const IMAGE_INITIAL_QUALITY = 0.82;

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

  function getPendingQueueKey(owner = selectedOwner) {
    return PREP_PENDING_QUEUE_PREFIX + getTripIdentity() + '::owner::' + String(owner || '').trim();
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

  // 下拉與方塊共用同一份名單。各算各的就會漂移 —— 例如成員被刪掉時
  // select 靠 unshift 補得回目前的 owner、方塊卻補不回來，兩邊顯示不一致。
  function getOwnerChoices(selectedValue) {
    const selected = String(selectedValue || '').trim();
    const names = getMemberNames();
    if (selected && !names.includes(selected)) names.unshift(selected);
    return names;
  }

  // 桌面版的「查看對象」方塊列。跟下拉同時渲染：手機吃注入 CSS 的
  // 隱藏規則，桌面用 desktop.css (1,2,0) 打開。
  // 切換一律轉呼 changeSelectedOwner()，不複製任何 setOwner 邏輯。
  //
  // 刻意沒有「請選擇」方塊（對應 select 的 <option value="">）。
  // 代價：桌面沒辦法把查看對象清回空值 —— 那是下拉才有的操作，手機仍然可以。
  // 實務上選了人就不會想清空，換人直接點另一顆即可。
  function renderOwnerChips(selectedValue) {
    const selected = String(selectedValue || '').trim();
    const chips = getOwnerChoices(selected).map(name => {
      const on = name === selected;
      return `<button class="prep-owner-chip ${on ? 'is-active' : ''}" type="button" data-owner="${escapeHtml(name)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(name)}</button>`;
    });
    return `<div class="prep-owner-chips" role="group" aria-label="查看對象"><span class="prep-owner-chips-label">查看對象</span>${chips.join('')}</div>`;
  }

  function renderOwnerOptions(selectedValue, includePlaceholder = true) {
    const selected = String(selectedValue || '').trim();
    const names = getOwnerChoices(selected);

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
      loadPendingQueue();
      return;
    }

    const saved = safeJsonParse(localStorage.getItem(currentTripKey), null);
    const savedOwner = String(saved && saved.owner || '').trim();
    if (savedOwner && savedOwner !== selectedOwner) {
      state = buildEmptyState(selectedOwner);
      loadPendingQueue();
      return;
    }
    state = normalizeState(saved || null, selectedOwner);
    loadPendingQueue();
  }

  function saveLocal(updateTime = false) {
    if (!state || !selectedOwner) return;
    state.owner = selectedOwner;
    state.sections.forEach(section => { section.owner = selectedOwner; });
    if (updateTime) state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(currentTripKey, JSON.stringify(state)); } catch (_) {}
  }

  function loadPendingQueue() {
    if (!selectedOwner) {
      pendingMutations = [];
      return;
    }
    const saved = safeJsonParse(localStorage.getItem(getPendingQueueKey()), []);
    pendingMutations = Array.isArray(saved)
      ? saved.filter(job => job && job.action).map(job => ({
          id: String(job.id || makeId('prepjob')),
          action: String(job.action || ''),
          payload: job.payload && typeof job.payload === 'object' ? job.payload : {},
          createdAt: job.createdAt || new Date().toISOString()
        }))
      : [];
  }

  function savePendingQueue() {
    if (!selectedOwner) return;
    try { localStorage.setItem(getPendingQueueKey(), JSON.stringify(pendingMutations)); } catch (_) {}
  }

  function enqueuePrepPendingMutation(action, payload) {
    pendingMutations.push({
      id: makeId('prepjob'),
      action,
      payload: payload || {},
      createdAt: new Date().toISOString()
    });
    savePendingQueue();
    syncStatus = pendingMutations.length + ' 筆待同步';
    updateSyncUI();
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
      // 換 innerHTML 會讓焦點掉回 body。左欄分類鈕與成員方塊是 <button>，
      // isEditingChecklistInput() 只認 input/textarea/select 救不到它們，
      // 所以這裡自己記住再還回去。手機上這些節點是 display:none，
      // 永遠不會是 activeElement，等於不受影響。
      const active = document.activeElement;
      const keepCat = active && active.closest && active.closest('.prep-cat-item');
      const keepChip = active && active.closest && active.closest('.prep-owner-chip');
      const keepCatId = keepCat ? keepCat.getAttribute('data-cat-id') : '';
      const keepChipOwner = keepChip ? keepChip.getAttribute('data-owner') : '';
      area.innerHTML = renderSelectedOwnerBody();
      updateEmptyUI();
      updateStatsUI();
      updateSyncUI();
      initAllThumbSortables();
      if (keepCatId) {
        const back = root.querySelector('.prep-cat-item[data-cat-id="' + cssEscape(keepCatId) + '"]');
        if (back) back.focus({ preventScroll: true });
      } else if (keepChipOwner) {
        const back = root.querySelector('.prep-owner-chip[data-owner="' + cssEscape(keepChipOwner) + '"]');
        if (back) back.focus({ preventScroll: true });
      }
    } else {
      render();
    }
    // 首次或換人後補抓圖片；loadAllImages 內有 owner 去重，不會重複打。
    if (selectedOwner && imagesLoadedForOwner !== selectedOwner) loadAllImages();
  }

  function refreshChecklistFromDatabase() {
    if (!selectedOwner) return;
    if (pendingWrites > 0 || pendingMutations.length > 0) {
      syncStatus = '儲存中，稍後更新';
      updateSyncUI();
      return;
    }
    loadFromSheet({ manual: true, partial: true });
    loadAllImages(true);
  }

  async function loadFromSheet(options = {}) {
    if (!API_URL || pendingWrites > 0 || pendingMutations.length > 0 || !selectedOwner) return;
    if (isLoadingRemote && !options.replacePending) return;
    const trip = getCurrentTripInfo();
    if (!trip.name || trip.name === '共用清單') return;

    const silent = !!options.silent;
    const requestOwner = selectedOwner;
    const requestTripIdentity = trip.id || trip.name;
    const requestId = ++remoteLoadRequestId;
    isLoadingRemote = true;
    if (!silent) {
      syncStatus = isBrowserOnline() ? '讀取資料庫' : '離線，只可查看';
      updateSyncUI();
    }

    try {
      if (!isBrowserOnline()) throw new Error('offline');
      let url = API_URL
        + '?action=prep_checklist_get'
        + '&owner=' + encodeURIComponent(requestOwner)
        + '&t=' + encodeURIComponent(Date.now());

      if (trip.id) url += '&tripId=' + encodeURIComponent(trip.id);
      else url += '&tripName=' + encodeURIComponent(trip.name);

      const res = await fetch(url);
      const data = await res.json();
      const currentTrip = getCurrentTripInfo();
      const isCurrentRequest = requestId === remoteLoadRequestId
        && selectedOwner === requestOwner
        && (currentTrip.id || currentTrip.name) === requestTripIdentity;
      if (!isCurrentRequest) return;

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
      if (requestId !== remoteLoadRequestId || selectedOwner !== requestOwner) return;
      console.warn('prep checklist load failed:', err);
      syncStatus = isBrowserOnline() ? '讀取失敗' : '離線，只可查看';
      updateSyncUI();
    } finally {
      if (requestId === remoteLoadRequestId) {
        isLoadingRemote = false;
        updateSyncUI();
      }
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

  async function flushPrepPendingQueue() {
    if (isFlushingPendingMutations || !pendingMutations.length || !isBrowserOnline() || !API_URL || !selectedOwner) return;

    isFlushingPendingMutations = true;
    pendingWrites += 1;
    syncStatus = pendingMutations.length + ' 筆同步中';
    updateSyncUI();

    const queue = pendingMutations.slice();
    let failedAt = -1;

    for (let index = 0; index < queue.length; index += 1) {
      const job = queue[index];
      try {
        const out = await apiPost({ ...buildBasePayload(job.action), ...(job.payload || {}) });
        if (!out || out.status !== 'success') throw new Error((out && out.message) || 'write failed');
        lastRemoteUpdatedAt = out.updatedAt || lastRemoteUpdatedAt;
        lastSyncedAt = new Date().toISOString();
        if (state && out.updatedAt) state.updatedAt = out.updatedAt;
      } catch (err) {
        console.warn('prep checklist queued mutation failed:', job.action, err);
        failedAt = index;
        break;
      }
    }

    const sentCount = failedAt === -1 ? queue.length : failedAt;
    const remain = failedAt === -1 ? [] : queue.slice(failedAt);
    const sentIds = new Set(queue.slice(0, sentCount).map(job => job.id));
    pendingMutations = pendingMutations.filter(job => !sentIds.has(job.id));
    pendingMutations = remain.concat(pendingMutations.filter(job => !queue.some(queued => queued.id === job.id)));
    savePendingQueue();
    saveLocal(false);

    pendingWrites = Math.max(0, pendingWrites - 1);
    isFlushingPendingMutations = false;
    syncStatus = pendingMutations.length ? pendingMutations.length + ' 筆待同步' : '已同步';
    updateSyncUI();
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
      syncStatus = '離線，變更待同步';
      updateSyncUI();
      return true;
    }
    return true;
  }


  function mutateChecklist(action, payload, options = {}) {
    if (!options.skipCanWrite && !canWrite()) return Promise.resolve(null);
    const trip = getCurrentTripInfo();
    if (!trip.name || trip.name === '共用清單') return Promise.resolve(null);

    if (!isBrowserOnline()) {
      enqueuePrepPendingMutation(action, payload);
      return Promise.resolve({ status: 'queued', queued: true });
    }

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

      if (!isBrowserOnline()) {
        enqueuePrepPendingMutation(action, payload);
        return { status: 'queued', queued: true };
      }

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
      if (pendingWrites === 0 && pendingMutations.length === 0 && isBrowserOnline() && syncStatus !== '儲存失敗') {
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
      .prep-item-wrap { border-top: 1px solid #f1f5f9; }
      .prep-item-wrap:first-of-type { border-top: none; }
      .prep-item-wrap .prep-item { border-top: none; }
      .prep-item-images:empty { display: none; }
      .prep-item-images { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 10px 30px; scrollbar-width: none; }
      .prep-item-images::-webkit-scrollbar { display: none; }
      .prep-thumb { position: relative; flex: 0 0 auto; width: 64px; height: 64px; border-radius: 10px; overflow: hidden; background: #f1f5f9; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
      .prep-thumb.is-uploading { opacity: .55; }
      .prep-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: pointer; }
      .prep-thumb-delete { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border: none; border-radius: 999px; background: rgba(15,23,42,.62); color: #fff; font-size: 11px; line-height: 20px; padding: 0; cursor: pointer; }
      .prep-thumb-spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #475569; background: rgba(255,255,255,.65); }
      .prep-image-add.is-busy { opacity: .5; pointer-events: none; }
      .prep-img-viewer { position: fixed; inset: 0; z-index: 100000; background: rgba(2,6,23,.92); display: flex; align-items: center; justify-content: center; }
      .prep-img-viewer img { max-width: 92vw; max-height: 82vh; border-radius: 8px; }
      .prep-img-viewer-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border: none; border-radius: 999px; background: rgba(255,255,255,.16); color: #fff; font-size: 22px; cursor: pointer; }
      .prep-img-viewer-prev { left: 12px; }
      .prep-img-viewer-next { right: 12px; }
      .prep-img-viewer-close { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px; width: 40px; height: 40px; border: none; border-radius: 999px; background: rgba(255,255,255,.16); color: #fff; font-size: 20px; cursor: pointer; }
      .prep-img-viewer-count { position: absolute; bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); left: 0; right: 0; text-align: center; color: #e2e8f0; font-size: 13px; }
      .prep-muted { color: #94a3b8; font-size: 13px; padding: 8px 0; }
      .prep-bottom-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .prep-action-btn.secondary { background: #f1f5f9; color: #475569; }
      .prep-action-btn.danger { background: #fee2e2; color: #b91c1c; }
      .prep-blank { min-height: 220px; }

      .prep-offline-note { color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:800; margin-bottom:10px; }
      .prep-disabled button:not(.prep-close), .prep-disabled input[type="checkbox"] { opacity:.55; }
      /* ↓ 桌面專屬節點。手機只吃這份注入的 style（index.html 不載入 desktop.css，
         grep 零命中），所以這三條 (0,1,0) 就是手機的最終樣式 —— 節點在 DOM 裡
         但完全不生成 box，版面與行為零改變。
         ★ 不准加 !important：加了之後 desktop.css 也得 !important，而該檔的既有
           約定是只有 background / border / border-radius / box-shadow 四個屬性
           可以 !important（那是為了蓋 cloud-theme），display 不在其中。
         ★ 也不要在這裡加 #prep-checklist-root 前綴：變成 (1,1,0) 沒有任何好處，
           只是把權重競賽往上推。 */
      .prep-owner-chips { display: none; }
      .prep-cat-rail { display: none; }
      .prep-section-progress { display: none; }
      /* .prep-cat-col 是桌面 grid 儲存格的包裝層，用 contents 不是 none：
         設成 none 會把裡面的「新增分類」一起藏掉，手機就少一塊功能。 */
      .prep-cat-col { display: contents; }
    `;
    document.head.appendChild(style);
  }

  function renderItem(item) {
    const id = escapeHtml(item.id);
    return `
      <div class="prep-item-wrap" data-item-id="${id}">
        <div class="prep-item ${item.checked ? 'is-checked' : ''}" data-item-id="${id}">
          <input type="checkbox" ${item.checked ? 'checked' : ''} ${!isBrowserOnline() ? 'disabled' : ''} />
          <span class="prep-item-text">${escapeHtml(item.text)}</span>
          <button class="prep-icon-btn prep-image-add" title="加圖片" type="button">📷</button>
          <button class="prep-icon-btn prep-edit-item" title="編輯" type="button">✏️</button>
          <button class="prep-icon-btn prep-delete-item is-danger" title="刪除" type="button">✕</button>
        </div>
        ${renderItemImages(item.id)}
      </div>`;
  }

  // 縮圖列：沒有圖片時輸出空容器（CSS :empty 收合，不占版面）。
  function renderItemImages(itemId) {
    const id = escapeHtml(itemId);
    const list = imagesByItem[itemId] || [];
    const thumbs = list.map(img => {
      const url = escapeHtml(img.url || '');
      const imageId = escapeHtml(img.id || '');
      return `<div class="prep-thumb" data-item-id="${id}" data-image-id="${imageId}">
          <img src="${url}" alt="準備品項圖片" loading="lazy" />
          <button class="prep-thumb-delete" title="刪除圖片" type="button" aria-label="刪除圖片">✕</button>
        </div>`;
    }).join('');
    const uploading = uploadingByItem[itemId] || 0;
    let spinners = '';
    for (let i = 0; i < uploading; i++) {
      spinners += '<div class="prep-thumb is-uploading"><div class="prep-thumb-spinner">上傳中</div></div>';
    }
    return `<div class="prep-item-images" data-item-id="${id}">${thumbs}${spinners}</div>`;
  }

  // 0/N 與百分比只有這兩支在算。renderSection / renderCategoryItem /
  // updateSectionCount 三處共用，避免三份算式各自漂移。
  function formatSectionCount(section) {
    const items = (section && section.items) || [];
    return `${items.filter(i => i.checked).length}/${items.length}`;
  }

  function sectionPercent(section) {
    const items = (section && section.items) || [];
    if (!items.length) return 0;
    return Math.round(items.filter(i => i.checked).length * 100 / items.length);
  }

  // 「選中的分類被刪掉／換人／遠端重載／一個分類都沒有」四種狀況全部收斂在這裡：
  // 不在清單裡就退回第一個，沒有分類就清空。
  function normalizeSelectedSection() {
    const sections = (state && state.sections) || [];
    if (!sections.length) { selectedSectionId = ''; return ''; }
    if (!sections.some(section => String(section.id) === String(selectedSectionId))) {
      selectedSectionId = String(sections[0].id);
    }
    return selectedSectionId;
  }

  function renderSection(section) {
    // ★ 選中狀態只表現為 class。不可以改成「只 map 選中的那一個」，也不可以
    //   輸出行內 display:none —— 兩種做法都會讓手機的準備頁只剩一個分類，
    //   而且行內樣式權重最高，手機沒有任何 CSS 救得回來。
    const isActive = String(section.id) === String(selectedSectionId);
    const percent = sectionPercent(section);
    const count = formatSectionCount(section);
    return `
      <div class="prep-section ${isActive ? 'is-active' : ''}" data-section-id="${escapeHtml(section.id)}">
        <div class="prep-section-title">
          <span class="prep-section-name">${escapeHtml(getSectionDisplayName(section))}</span>
          <span class="prep-section-actions">
            <span class="prep-section-count" style="font-size:12px;color:#94a3b8;">${count}</span>
            <button class="prep-icon-btn prep-edit-section" title="編輯" type="button">✏️</button>
            <button class="prep-icon-btn prep-delete-section is-danger" title="刪除" type="button">✕</button>
          </span>
        </div>
        <div class="prep-section-progress">
          <div class="prep-section-progress-track"><div class="prep-section-progress-bar" style="width:${percent}%"></div></div>
          <span class="prep-section-progress-text">${count} 已完成 · ${percent}%</span>
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

  // 左欄分類選單的單列。emoji 與 title 在 state 裡本來就是兩個欄位
  //（normalizeState 248-249），不必再解析 getSectionDisplayName() 合成的字串。
  // ★ class 一律用全新名字：絕不能叫 prep-section / prep-item / prep-section-count /
  //   prep-item-wrap。左欄排在 .prep-section-list 之前，一旦撞名，
  //   updateSectionCount() 的 querySelector（只回傳文件順序第一個）會改到左欄，
  //   右欄卡片的 0/N 從此不再更新；clearChecks() 的三條 root 全域掃也會誤傷。
  //   display:none 不影響 querySelector，所以手機也會一起壞。
  function renderCategoryItem(section) {
    const active = String(section.id) === String(selectedSectionId);
    return `
          <button class="prep-cat-item ${active ? 'is-active' : ''}" type="button" data-cat-id="${escapeHtml(section.id)}" aria-pressed="${active ? 'true' : 'false'}">
            <span class="prep-cat-name">${escapeHtml(getSectionDisplayName(section))}</span>
            <span class="prep-cat-count">${formatSectionCount(section)}</span>
          </button>`;
  }

  function renderCategoryRail() {
    const sections = (state && state.sections) || [];
    const list = sections.length
      ? sections.map(renderCategoryItem).join('')
      : '<div class="prep-cat-empty">尚無分類</div>';
    return `
      <div class="prep-cat-rail">
        <div class="prep-cat-rail-head">
          <span class="prep-cat-rail-title">分類</span>
          <span class="prep-cat-rail-total">${sections.length}</span>
        </div>
        <div class="prep-cat-list">${list}</div>
      </div>`;
  }

  function renderSelectedOwnerBody() {
    if (!selectedOwner) return '<div class="prep-blank"></div>';
    // 三條重繪路徑（render / refreshPersonalArea / 資料庫刷新的兩次）都會經過
    // 這裡，正規化寫在這一處就夠，不必在每個呼叫點各補一次。
    normalizeSelectedSection();
    const hasSections = state && state.sections && state.sections.length > 0;
    const offlineNote = !isBrowserOnline() ? '<div class="prep-offline-note">目前離線，變更會先存在本機，恢復連線後同步。</div>' : '';
    return `
      ${offlineNote}
      <div class="prep-cat-col">
      ${renderCategoryRail()}
      <div class="prep-add-box">
        <div style="font-size:13px;font-weight:900;color:#334155;">新增分類</div>
        <div class="prep-add-row"><input class="prep-new-section-title" placeholder="例如 🪪 證件" /></div>
        <button class="prep-add-section-btn" type="button">＋ 新增分類</button>
      </div>
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
          <span class="prep-updated-text">${selectedOwner ? (lastSyncedAt ? `更新 ${escapeHtml(formatTime(lastSyncedAt))}` : `版本 ${VERSION}`) : ''}</span>
          <span class="prep-status-right">
            <button class="prep-refresh-btn" type="button" style="${selectedOwner ? '' : 'display:none;'}" ${(!selectedOwner || !isBrowserOnline() || pendingWrites > 0 || pendingMutations.length > 0) ? 'disabled' : ''}>↻ 更新資料</button>
            <span class="prep-sync-pill" style="${syncText ? '' : 'display:none;'}">${escapeHtml(syncText)}</span>
          </span>
        </div>
        <div class="prep-owner-box">
          <div class="prep-owner-row">
            <label for="prep-owner-select">查看對象</label>
            <select id="prep-owner-select" class="prep-owner-select">${renderOwnerOptions(selectedOwner, true)}</select>
          </div>
          ${renderOwnerChips(selectedOwner)}
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
                <button class="prep-refresh-btn" type="button" style="${selectedOwner ? '' : 'display:none;'}" ${(!selectedOwner || !isBrowserOnline() || pendingWrites > 0 || pendingMutations.length > 0) ? 'disabled' : ''}>↻ 更新資料</button>
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
      refreshBtn.disabled = !selectedOwner || !isBrowserOnline() || pendingWrites > 0 || pendingMutations.length > 0 || isLoadingRemote;
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
    // 「分類數量變了」的既有集中點，左欄的總數與空狀態一併掛在這裡：
    // refreshPersonalArea / addSectionFromInputs / deleteSection / 新增分類
    // rollback 四條路徑本來就都會呼叫它。
    const total = root.querySelector('.prep-cat-rail-total');
    if (total) total.textContent = String(state.sections.length);
    const catList = root.querySelector('.prep-cat-list');
    if (catList) {
      const emptyHint = catList.querySelector('.prep-cat-empty');
      if (!state.sections.length) {
        if (!emptyHint) catList.innerHTML = '<div class="prep-cat-empty">尚無分類</div>';
      } else if (emptyHint) {
        emptyHint.remove();
      }
    }
  }

  // 切換分類的唯一實作：只改 class 與 aria-pressed，完全不碰 innerHTML。
  // ★ 不要改成 render()：那會整根重寫，銷毀 select 與方塊列、清掉每張卡片
  //   `新增項目` 未送出的文字，而且 render() 從頭到尾不呼叫
  //   initAllThumbSortables()，縮圖拖曳會靜默失效。
  // ★ 也不要改成 refreshPersonalArea()：範圍小一級，但同樣清掉 .prep-personal-area
  //   內所有 input 的值、焦點與 IME 組字，並把每個 .prep-item-images 換成新節點。
  // isEditingChecklistInput() 只認 input/textarea/select，救不了按 <button> 的情境。
  function applySelectedSectionUI() {
    if (!root) return;
    const active = String(selectedSectionId);
    root.querySelectorAll('.prep-section').forEach(el => {
      el.classList.toggle('is-active', String(el.dataset.sectionId) === active);
    });
    root.querySelectorAll('.prep-cat-item').forEach(el => {
      const on = String(el.dataset.catId) === active;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setSelectedSection(sectionId) {
    const next = String(sectionId || '');
    if (!next || next === selectedSectionId) return;
    selectedSectionId = next;
    applySelectedSectionUI();
  }

  function updateCategoryLabel(section) {
    if (!root || !section) return;
    const catEl = root.querySelector(`.prep-cat-item[data-cat-id="${cssEscape(section.id)}"]`);
    if (!catEl) return;
    const nameEl = catEl.querySelector('.prep-cat-name');
    // 跟右欄標題用同一支 getSectionDisplayName()，兩邊永遠顯示同一個字串
    if (nameEl) nameEl.textContent = getSectionDisplayName(section);
  }

  // 右欄卡片的 0/N、右欄進度條、左欄的 0/N 三處一起更新。
  // 左欄用 .prep-cat-item[data-cat-id]，跟 .prep-section[data-section-id] 是
  // 完全不同的 class 與屬性，兩支 querySelector 不會互相選錯。
  function updateSectionCount(sectionId) {
    if (!root || !state) return;
    const section = findSection(sectionId);
    if (!section) return;
    const label = formatSectionCount(section);
    const percent = sectionPercent(section);

    const sectionEl = root.querySelector(`.prep-section[data-section-id="${cssEscape(sectionId)}"]`);
    if (sectionEl) {
      const count = sectionEl.querySelector('.prep-section-count');
      if (count) count.textContent = label;
      const bar = sectionEl.querySelector('.prep-section-progress-bar');
      if (bar) bar.style.width = `${percent}%`;
      const progressText = sectionEl.querySelector('.prep-section-progress-text');
      if (progressText) progressText.textContent = `${label} 已完成 · ${percent}%`;
    }

    const catEl = root.querySelector(`.prep-cat-item[data-cat-id="${cssEscape(sectionId)}"]`);
    if (catEl) {
      const catCount = catEl.querySelector('.prep-cat-count');
      if (catCount) catCount.textContent = label;
    }
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
    remoteLoadRequestId += 1;
    isLoadingRemote = false;
    selectedOwner = next;
    // 不同 owner 的分類 id 完全不同，留著舊的只會讓右欄第一幀是空的。
    selectedSectionId = '';
    storeOwner(selectedOwner);
    syncStatus = selectedOwner ? '讀取資料庫' : '';
    lastSyncedAt = '';
    lastRemoteUpdatedAt = '';
    // 換人就清掉上一位的圖片快取，避免短暫顯示錯人的圖。
    Object.keys(imagesByItem).forEach(k => delete imagesByItem[k]);
    imagesLoadedForOwner = null;
    loadLocalState();
    render();
    if (selectedOwner) { loadFromSheet({ replacePending: true }); loadAllImages(true); }
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

    // 新分類直接成為右欄顯示的那一個。少了這行，桌面按「＋ 新增分類」
    // 會因為新卡片沒有 is-active 而完全看不出有反應。
    selectedSectionId = sectionId;
    const sectionList = root.querySelector('.prep-section-list');
    if (sectionList) sectionList.insertAdjacentHTML('beforeend', renderSection(section));
    const catList = root.querySelector('.prep-cat-list');
    if (catList) catList.insertAdjacentHTML('beforeend', renderCategoryItem(section));
    applySelectedSectionUI();
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
        const catEl = root && root.querySelector(`.prep-cat-item[data-cat-id="${cssEscape(sectionId)}"]`);
        if (catEl) catEl.remove();
        normalizeSelectedSection();
        applySelectedSectionUI();
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
    updateCategoryLabel(section);
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
        updateCategoryLabel(section);
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
    const catEl = root && root.querySelector(`.prep-cat-item[data-cat-id="${cssEscape(categoryId)}"]`);
    if (catEl) catEl.remove();
    // 刪掉的正好是右欄那一個就退回第一個；一個都不剩就清空。
    normalizeSelectedSection();
    applySelectedSectionUI();
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
    selectedSectionId = '';
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
      // ★ 必須排在下面那道守門之前。守門的意思是「還沒選對象時，除了下拉以外
      //   一律不理」，而「還沒選對象」正是方塊唯一有用的時機 —— 寫在後面的話
      //   使用者第一次進來點方塊會完全沒反應，而且是靜默失敗，手機測不出來。
      const ownerChip = target.closest('.prep-owner-chip');
      if (ownerChip) { changeSelectedOwner(ownerChip.dataset.owner || ''); return; }
      if (!selectedOwner && !target.closest('.prep-owner-select')) return;

      // 切分類：只改 class，不重繪。放在守門之後是對的 —— 沒選對象時本來就
      // 沒有分類可切。
      const catBtn = target.closest('.prep-cat-item');
      if (catBtn) { setSelectedSection(catBtn.dataset.catId); return; }
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
      if (target.closest('.prep-image-add')) {
        const itemEl = target.closest('.prep-item');
        if (itemEl) onImageAddClick(itemEl.dataset.itemId);
        return;
      }
      if (target.closest('.prep-thumb-delete')) {
        event.preventDefault();
        const thumb = target.closest('.prep-thumb');
        if (thumb) deleteImage(thumb.dataset.itemId, thumb.dataset.imageId);
        return;
      }
      if (target.closest('.prep-thumb') && target.tagName === 'IMG') {
        const thumb = target.closest('.prep-thumb');
        const itemId = thumb.dataset.itemId;
        const list = imagesByItem[itemId] || [];
        const idx = list.findIndex(img => String(img.id) === String(thumb.dataset.imageId));
        openImageViewer(itemId, idx < 0 ? 0 : idx);
        return;
      }
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

  /* ===================== 品項圖片 ===================== */

  const uploadingByItem = {};

  function groupImagesByItem(list) {
    const map = {};
    (list || []).forEach(img => {
      const itemId = String(img.item_id || '').trim();
      if (!itemId) return;
      if (!map[itemId]) map[itemId] = [];
      map[itemId].push(img);
    });
    Object.keys(map).forEach(itemId => {
      map[itemId].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    });
    return map;
  }

  // force=true 是使用者主動要求（換人、↻ 更新資料）：無視退避直接重抓。
  async function loadAllImages(force) {
    if (!API_URL || !selectedOwner || !isBrowserOnline()) return;
    if (!force && imagesLoadedForOwner === selectedOwner) return;
    // 同一時間只允許一個請求。ensureLoadedForCurrentTrip 的 1.2s 輪詢會一直叫它，
    // 沒有這道閘就會在慢速網路上疊出一堆重複請求。
    if (imagesInFlight) return;
    if (force) { imagesRetryAfter = 0; imagesFailStreak = 0; }
    // 連續失敗就退避，別讓輪詢變成每 1.2 秒打一次的無限重試。
    if (!force && (imagesFailStreak >= IMAGES_MAX_RETRY || Date.now() < imagesRetryAfter)) return;

    const requestOwner = selectedOwner;
    imagesInFlight = true;
    try {
      const res = await apiPost(buildBasePayload('prep_item_images_get'));
      if (selectedOwner !== requestOwner) return;
      if (res && res.status === 'success' && Array.isArray(res.images)) {
        Object.keys(imagesByItem).forEach(k => delete imagesByItem[k]);
        Object.assign(imagesByItem, groupImagesByItem(res.images));
        imagesLoadedForOwner = requestOwner;
        imagesFailStreak = 0;
        refreshPersonalArea();
      } else {
        imagesFailStreak += 1;
        imagesRetryAfter = Date.now() + IMAGES_RETRY_MS;
      }
    } catch (err) {
      imagesFailStreak += 1;
      imagesRetryAfter = Date.now() + IMAGES_RETRY_MS;
      console.warn('load prep images failed:', err);
    } finally {
      imagesInFlight = false;
    }
  }

  function ensureSharedFileInput() {
    if (sharedFileInput) return sharedFileInput;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    // 不設 capture：capture 會強制開相機、擋掉相簿選項。留空手機才會跳出
    // 「拍照 / 從相簿選」的原生選單，兩種來源都能用。
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      const itemId = pendingUploadItemId;
      input.value = '';
      if (itemId && files.length) handleFilesSelected(itemId, files);
    });
    document.body.appendChild(input);
    sharedFileInput = input;
    return input;
  }

  function onImageAddClick(itemId) {
    if (!isBrowserOnline()) {
      alert('圖片需連線後才能上傳。');
      return;
    }
    if (!selectedOwner) return;
    pendingUploadItemId = itemId;
    ensureSharedFileInput().click();
  }

  async function handleFilesSelected(itemId, files) {
    for (let i = 0; i < files.length; i++) {
      // 逐張序列上傳，避免一次塞爆 Apps Script 與網路。
      // eslint-disable-next-line no-await-in-loop
      await uploadOneImage(itemId, files[i]);
    }
  }

  // 讀檔、修正方向、Canvas 壓成 JPEG，逐步降品質/尺寸直到 <= 1.2MB。
  async function compressImage(file) {
    const bitmap = await fileToBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const longest = Math.max(srcW, srcH);
    let scale = longest > IMAGE_MAX_EDGE ? IMAGE_MAX_EDGE / longest : 1;

    const canvas = document.createElement('canvas');
    // 每次都從仍開啟的原始 bitmap 重畫到新尺寸，縮圖迴圈才不會畫到已關閉的來源。
    const drawAt = (s) => {
      canvas.width = Math.max(1, Math.round(srcW * s));
      canvas.height = Math.max(1, Math.round(srcH * s));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };
    drawAt(scale);

    let quality = IMAGE_INITIAL_QUALITY;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    // 先降品質；仍過大時縮尺寸再試。
    while (dataUrlBytes(dataUrl) > IMAGE_TARGET_BYTES && quality > 0.4) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    while (dataUrlBytes(dataUrl) > IMAGE_TARGET_BYTES && canvas.width > 480) {
      scale *= 0.85;
      drawAt(scale);
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    // 所有繪製完成後才釋放來源 bitmap。
    if (bitmap.close) bitmap.close();

    return {
      base64: dataUrl.split(',')[1] || '',
      mimeType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height
    };
  }

  async function fileToBitmap(file) {
    // createImageBitmap 帶 imageOrientation 可自動套用 EXIF 方向（行動瀏覽器支援）。
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (_) { try { return await createImageBitmap(file); } catch (_2) {} }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      img.src = url;
    });
  }

  function dataUrlBytes(dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    return Math.floor(base64.length * 0.75);
  }

  function bumpUploading(itemId, delta) {
    uploadingByItem[itemId] = Math.max(0, (uploadingByItem[itemId] || 0) + delta);
    refreshItemImages(itemId);
  }

  async function uploadOneImage(itemId, file) {
    if (!isBrowserOnline()) { alert('圖片需連線後才能上傳。'); return; }
    bumpUploading(itemId, 1);
    try {
      const compressed = await compressImage(file);
      if (!compressed.base64) throw new Error('empty image data');
      const clientUploadId = makeId('upload');
      const payload = Object.assign(buildBasePayload('prep_image_upload'), {
        itemId,
        clientUploadId,
        imageBase64: compressed.base64,
        mimeType: compressed.mimeType,
        fileName: String(file.name || 'photo'),
        width: compressed.width,
        height: compressed.height
      });
      const res = await apiPost(payload);
      if (!res || res.status !== 'success') throw new Error((res && res.message) || 'upload failed');
      if (Array.isArray(res.images)) imagesByItem[itemId] = groupImagesByItem(res.images)[itemId] || res.images;
    } catch (err) {
      console.warn('prep image upload failed:', err);
      alert('圖片上傳失敗，請稍後再試。');
    } finally {
      bumpUploading(itemId, -1);
    }
  }

  async function deleteImage(itemId, imageId) {
    if (!isBrowserOnline()) { alert('圖片需連線後才能刪除。'); return; }
    if (!confirm('刪除這張圖片？')) return;
    const backup = (imagesByItem[itemId] || []).slice();
    imagesByItem[itemId] = backup.filter(img => String(img.id) !== String(imageId));
    refreshItemImages(itemId);
    try {
      const res = await apiPost(Object.assign(buildBasePayload('prep_image_delete'), { itemId, imageId }));
      if (!res || res.status !== 'success') throw new Error((res && res.message) || 'delete failed');
      if (Array.isArray(res.images)) { imagesByItem[itemId] = res.images; refreshItemImages(itemId); }
    } catch (err) {
      console.warn('prep image delete failed:', err);
      imagesByItem[itemId] = backup;
      refreshItemImages(itemId);
      alert('圖片刪除失敗，請稍後再試。');
    }
  }

  async function reorderImages(itemId, orderedIds) {
    const before = (imagesByItem[itemId] || []).slice();
    const byId = {};
    before.forEach(img => { byId[String(img.id)] = img; });
    const next = orderedIds.map(id => byId[String(id)]).filter(Boolean);
    if (next.length !== before.length) return;
    imagesByItem[itemId] = next;
    try {
      const res = await apiPost(Object.assign(buildBasePayload('prep_image_reorder'), { itemId, imageIds: orderedIds }));
      if (res && res.status === 'success' && Array.isArray(res.images)) {
        imagesByItem[itemId] = res.images;
        refreshItemImages(itemId);
      }
    } catch (err) {
      console.warn('prep image reorder failed:', err);
      imagesByItem[itemId] = before;
      refreshItemImages(itemId);
    }
  }

  // 只重繪單一品項的縮圖列，避免整區重render 打斷其他輸入。
  function refreshItemImages(itemId) {
    if (!root) return;
    const wrap = root.querySelector('.prep-item-wrap[data-item-id="' + cssEscape(itemId) + '"]');
    if (!wrap) return;
    const old = wrap.querySelector('.prep-item-images');
    if (!old) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderItemImages(itemId);
    const fresh = tmp.firstElementChild;
    old.replaceWith(fresh);
    initThumbSortable(fresh, itemId);
  }

  function initThumbSortable(container, itemId) {
    if (!container || !window.Sortable) return;
    if ((imagesByItem[itemId] || []).length < 2) return;
    if (container._prepSortable) return;
    container._prepSortable = window.Sortable.create(container, {
      animation: 150,
      draggable: '.prep-thumb',
      filter: '.prep-thumb-delete',
      onEnd: () => {
        const ids = Array.from(container.querySelectorAll('.prep-thumb')).map(el => el.dataset.imageId).filter(Boolean);
        reorderImages(itemId, ids);
      }
    });
  }

  function initAllThumbSortables() {
    if (!root) return;
    root.querySelectorAll('.prep-item-images').forEach(container => {
      const itemId = container.dataset.itemId;
      if (itemId) initThumbSortable(container, itemId);
    });
  }

  function openImageViewer(itemId, startIndex) {
    const list = imagesByItem[itemId] || [];
    if (!list.length) return;
    let index = Math.max(0, Math.min(startIndex || 0, list.length - 1));

    const overlay = document.createElement('div');
    overlay.className = 'prep-img-viewer';
    overlay.innerHTML = `
      <button class="prep-img-viewer-close" type="button" aria-label="關閉">✕</button>
      <button class="prep-img-viewer-btn prep-img-viewer-prev" type="button" aria-label="上一張">‹</button>
      <img src="" alt="準備品項圖片" />
      <button class="prep-img-viewer-btn prep-img-viewer-next" type="button" aria-label="下一張">›</button>
      <div class="prep-img-viewer-count"></div>`;
    const imgEl = overlay.querySelector('img');
    const countEl = overlay.querySelector('.prep-img-viewer-count');
    const show = () => {
      imgEl.src = list[index] ? (list[index].url || '') : '';
      countEl.textContent = (index + 1) + ' / ' + list.length;
    };
    const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    const prev = () => { index = (index - 1 + list.length) % list.length; show(); };
    const next = () => { index = (index + 1) % list.length; show(); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.prep-img-viewer-close')) { close(); return; }
      if (e.target.closest('.prep-img-viewer-prev')) { prev(); return; }
      if (e.target.closest('.prep-img-viewer-next')) { next(); }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    show();
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

    if (pendingWrites > 0 || pendingMutations.length > 0 || isLoadingRemote) return;
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
      flushPrepPendingQueue().then(() => loadFromSheet());
    });
    window.addEventListener('offline', () => {
      syncStatus = '離線，變更待同步';
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
      if (selectedOwner && isBrowserOnline()) loadFromSheet({ replacePending: true });
      lastMembersFingerprint = memberFp;
    } else {
      const fab = root && root.querySelector('.prep-fab');
      if (fab) fab.classList.toggle('is-visible', !!document.querySelector('.app-header h1'));
      if (memberFp !== lastMembersFingerprint && !isEditingChecklistInput()) {
        lastMembersFingerprint = memberFp;
        render();
      }
    }

    // ★ 圖片的第二個觸發點，別拿掉。
    // 原本圖片只在 refreshPersonalArea() 結尾被抓一次，而那條路徑要 loadFromSheet()
    // 成功才會走到。首次載入時 prep-checklist.js 在 DOMContentLoaded 就跑，Vue 還沒
    // 掛上 .app-header h1，getCurrentTripInfo() 拿不到旅程名 → loadFromSheet 直接
    // return → 圖片永遠不會被抓，而且沒有任何重試，只能靠「換人」或「↻ 更新資料」
    // 這兩條 force 路徑救回來。症狀就是「第一次載入沒有圖片，重新讀取才正常」。
    //
    // 這裡跟著既有的輪詢（只在準備頁可見時跑）一起補抓，內部有 in-flight 閘與
    // 失敗退避，成功後 imagesLoadedForOwner 會擋掉後續呼叫，不會變成常駐請求。
    if (selectedOwner && imagesLoadedForOwner !== selectedOwner) loadAllImages();
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
    // 只看節點增刪。原本還監聽 characterData，等於 App 內任何文字變動
    //（每次 Vue 重繪、每個計時器更新的字串）都會叫醒這支 observer。
    const observer = new MutationObserver(() => ensureLoadedForCurrentTrip());
    observer.observe(document.body, { childList: true, subtree: true });

    // 這個輪詢是用來偵測「使用者切到準備分頁」的：分頁用 v-show 切換，
    // 只改 style 不動節點，MutationObserver 的 childList 收不到。
    // 但沒必要在背景分頁或不在準備頁時做完整檢查 —— 那會讀 localStorage、
    // 算成員指紋、可能觸發 render()。改成先用一次 querySelector 擋掉。
    const isPrepVisible = () => {
      const page = document.querySelector('.prep-page');
      return !!page && page.getClientRects().length > 0;
    };
    setInterval(() => {
      if (document.hidden) return;
      if (!isPrepVisible()) return;
      ensureLoadedForCurrentTrip();
    }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
