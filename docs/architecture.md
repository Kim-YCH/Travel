# Travel Static Site Architecture

This project stays intentionally simple: GitHub Pages serves the static files, Vue 3 runs from a CDN, and Apps Script continues to handle CRUD, translation, weather, and Places-backed data enrichment.

## Current Direction

- `index.html` remains the only page entry.
- `config.js` owns deploy-specific settings such as Apps Script and Google Maps keys.
- `style.css` and `cloud-theme.css` remain active while CSS is split gradually.
- `app.js` remains the Vue entry while low-risk helpers move into `js/`.
- Apps Script and Google Sheets remain the lightweight backend and database.
- Place photos are attached when adding itinerary items; category fallback SVGs in `assets/` remain the offline/default path.

## Module Boundaries

- `js/api.js`: JSONP transport and Apps Script request helpers.
- `js/cache.js`: localStorage keys and generic JSON read/write helpers.
- `js/utils.js`: framework-free utilities such as IDs and date helpers.
- `js/maps.js`: Google Maps loading, markers, route lines, and map UI helpers.
- `js/places.js`: autocomplete, geocoding, place details, translation search, and photo extraction.
- `js/itinerary.js`: itinerary normalization, day ordering, fallback images, and add/edit/delete helpers.
- `js/hotels.js`: hotel search, normalization, overlap checks, and hotel CRUD helpers.
- `js/expenses.js`: expense normalization, filtering, totals, and balance calculations.

## Migration Order

1. Keep the existing behavior running from `app.js`.
2. Move pure helpers first: `utils`, `api`, and `cache`.
3. Move Google Maps and Places code after the helper split is stable.
4. Move feature areas last: itinerary, hotels, and expenses.
5. Only consider React, Vite, or a full backend if the static/CDN setup becomes the actual bottleneck.

## Current Module Status

- `js/api.js`, `js/cache.js`, and `js/utils.js` are wired into `app.js`.
- `js/itinerary.js` now owns itinerary type normalization, fallback images, alternative flags, and itinerary/alternative record normalization.
- `js/hotels.js` now owns hotel normalization, day range labels, active-day checks, and overlap checks.
- `js/expenses.js` now owns expense normalization, involved-person parsing, public-account checks, created-time sorting, and involved labels.
- `js/places.js` now owns prediction merging, Google Places photo extraction, and photo attribution sanitizing.
- `js/maps.js` now owns map search URLs and map app export links.

## Rules For Future Changes

- Prefer small extractions with a fallback in `app.js` until each module is proven stable.
- Keep public browser globals under the `Travel*` namespace.
- Avoid build tooling unless a concrete requirement needs it.
- Keep GitHub Pages deployability as a first-class constraint.
