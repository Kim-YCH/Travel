(function (window) {
  'use strict';

  const COLLECTION_BY_TYPE = Object.freeze({
    itinerary: 'itinerary',
    expenses: 'expenses',
    people: 'people',
    hotels: 'hotels',
    trips: 'trips'
  });

  const parseData = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const normalizeFlag = (value) => {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    return ['v', 'true', '1', 'yes', 'y', '是'].includes(text) ? 'v' : '';
  };

  const normalizeValue = (value, key) => {
    if (key === 'is_alternative') return normalizeFlag(value);
    if (key === 'involved' || key === 'persons') {
      const list = Array.isArray(value) ? value : String(value || '').split(',');
      return list.map(item => String(item).trim()).filter(Boolean).sort().join(',');
    }
    if (Array.isArray(value)) return value.map(item => normalizeValue(item, '')).join(',');
    if (value && typeof value === 'object') {
      const sorted = {};
      Object.keys(value).sort().forEach(itemKey => {
        sorted[itemKey] = normalizeValue(value[itemKey], itemKey);
      });
      return JSON.stringify(sorted);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    const text = String(value == null ? '' : value).trim();
    if (key === 'currency') return text.toUpperCase();
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return String(Number(text));
    return text;
  };

  const collectionForJob = (payload, cloud) => {
    if (String(payload.action || '').startsWith('shared_wallet_')) {
      return Array.isArray(cloud.sharedWalletTransactions) ? cloud.sharedWalletTransactions : null;
    }
    const key = COLLECTION_BY_TYPE[String(payload.type || '')];
    return key && Array.isArray(cloud[key]) ? cloud[key] : null;
  };

  const findById = (items, id) => items.find(item => String(item?.id || '') === String(id || ''));

  const matchesEdit = (record, data) => {
    const ignoredKeys = new Set(['id', 'trip_id', 'created_at', 'updated_at']);
    const keys = Object.keys(data).filter(key => !ignoredKeys.has(key));
    if (!keys.length) return false;
    return keys.every(key => (
      Object.prototype.hasOwnProperty.call(record, key)
      && normalizeValue(record[key], key) === normalizeValue(data[key], key)
    ));
  };

  const isCloudConfirmed = (job, cloud = {}) => {
    const payload = job?.payload || {};
    const action = String(payload.action || '');
    const data = parseData(payload.data);
    const id = data.id || payload.id;
    if (!id) return false;

    const collection = collectionForJob(payload, cloud);
    if (!collection) return false;
    const record = findById(collection, id);
    if (action === 'add' || action === 'shared_wallet_add') return Boolean(record);
    if (action === 'edit' || action === 'shared_wallet_edit') return Boolean(record && matchesEdit(record, data));
    if (action === 'del' || action === 'shared_wallet_delete') return !record;
    return false;
  };

  const reconcilePendingJobs = (jobs, cloud = {}) => {
    const confirmed = [];
    const pending = [];
    (Array.isArray(jobs) ? jobs : []).forEach(job => {
      (isCloudConfirmed(job, cloud) ? confirmed : pending).push(job);
    });
    return { confirmed, pending };
  };

  window.TravelSyncQueue = Object.freeze({
    isCloudConfirmed,
    reconcilePendingJobs
  });
})(window);
