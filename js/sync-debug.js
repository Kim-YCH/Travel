(function (window) {
  'use strict';

  const ENABLE_KEY = 'travel_debug_enabled';
  const LOG_KEY = 'travel_sync_debug_log_v1';
  const MAX_ENTRIES = 30;
  const storage = window.localStorage;

  const clone = (value) => {
    if (value === undefined) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return String(value);
    }
  };

  const read = () => {
    try {
      const entries = JSON.parse(storage.getItem(LOG_KEY) || '[]');
      return Array.isArray(entries) ? entries : [];
    } catch (_) {
      return [];
    }
  };

  const isEnabled = () => {
    try {
      return storage.getItem(ENABLE_KEY) === '1';
    } catch (_) {
      return false;
    }
  };

  const parseData = (data) => {
    if (data && typeof data === 'object') return data;
    if (typeof data !== 'string') return {};
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const errorText = (error) => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || String(error);
  };

  const record = (details = {}) => {
    const job = details.job || {};
    const payload = job.payload || details.payload || {};
    const data = parseData(payload.data);
    const entry = {
      at: new Date().toISOString(),
      event: String(details.event || details.status || 'unknown'),
      tripId: String(details.tripId || ''),
      tripName: String(details.tripName || ''),
      jobId: String(job.id || ''),
      action: String(payload.action || ''),
      type: String(payload.type || ''),
      recordId: String(data.id || payload.id || ''),
      recordName: String(data.name || data.title || data.item_name || ''),
      day: data.day ?? payload.day ?? '',
      attempts: Number(job.attempts || 0),
      error: errorText(details.error || job.lastError),
      payload: clone(payload)
    };

    for (const [key, value] of Object.entries(details)) {
      if (key === 'job' || key in entry) continue;
      entry[key] = clone(value);
    }

    try {
      storage.setItem(LOG_KEY, JSON.stringify([entry, ...read()].slice(0, MAX_ENTRIES)));
    } catch (_) {
      // Console output still provides the current event when browser storage is unavailable.
    }
    console.warn('[Travel sync debug]', entry);
    return entry;
  };

  const clear = () => {
    try {
      storage.removeItem(LOG_KEY);
    } catch (_) {
      // Storage can be unavailable in private browsing; clearing is best effort.
    }
  };

  const format = (entries = read()) => JSON.stringify(entries, null, 2);

  window.TravelSyncDebug = Object.freeze({
    ENABLE_KEY,
    LOG_KEY,
    MAX_ENTRIES,
    isEnabled,
    read,
    record,
    clear,
    format
  });
})(window);
