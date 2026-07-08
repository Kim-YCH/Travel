(function (window) {
  'use strict';

  const tripCacheKey = (tripId) => `trip_cache_${tripId}`;
  const pendingQueueKey = (tripId) => `trip_pending_queue_${tripId}`;
  const tripsCacheKey = 'trips_cache';

  const readJSON = (key, fallback = null) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const writeJSON = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  };

  window.TravelCache = Object.freeze({
    tripCacheKey,
    pendingQueueKey,
    tripsCacheKey,
    readJSON,
    writeJSON
  });
})(window);
