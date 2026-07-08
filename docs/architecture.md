# Travel Static Site Architecture

This project intentionally remains a static GitHub Pages app:

- `index.html` is the only page entry.
- Vue 3 is loaded from CDN.
- Apps Script handles CRUD, translation, weather, and Google Places-backed enrichment.
- Google Sheets remains the lightweight database.
- `app.js` is still the primary Vue application while low-risk helpers are extracted gradually.

## Current Split

- `js/utils.js`: ID and date helpers used by `app.js`.
- `js/api.js`: JSONP transport and Apps Script request wrappers.
- `js/cache.js`: localStorage key helpers and safe JSON read/write helpers.
- `js/places.js`: itinerary image helpers, Google Places photo extraction, stale photo URL detection, and fallback image handling.
- `js/maps.js`, `js/itinerary.js`, `js/hotels.js`, `js/expenses.js`: reserved module entry points.

## Important Image Note

Google Maps JavaScript Places photo URLs such as `PhotoService.GetPhoto?...token=...` are temporary. When they expire, Google may return a 403 PNG error image, which does not trigger an `<img>` error event. The stale-photo detection now lives in `js/places.js` and is called by `app.js` during itinerary normalization so expired URLs are cleared and the existing photo hydration flow can request a fresh URL.

## Migration Rule

Move one small, pure helper group at a time. After each extraction, keep a fallback in `app.js`, bump the static asset version, run syntax checks, and verify images before moving more feature logic.
