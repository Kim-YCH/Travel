# Travel Static Site Architecture

Travel intentionally remains a static GitHub Pages application:

- `index.html` is the only page entry.
- Vue 3, Tailwind utilities, Sortable, and Google Maps are loaded without a build step.
- `style.css` owns layout and feature styles; `cloud-theme.css` owns theme overrides.
- Apps Script handles CRUD, translation, weather support, and Google Sheets access.
- Google Sheets remains the lightweight database.
- `app.js` is still the primary Vue application while helpers move out gradually.
- `apps-script-backend.gs` is the deployable Apps Script source kept in this repository.

See [workflow.md](./workflow.md) for the change, verification, versioning, and release process.

## Current Split

- `js/utils.js`: ID and date helpers.
- `js/api.js`: JSONP transport and Apps Script request wrappers.
- `js/cache.js`: localStorage key helpers and safe JSON helpers.
- `js/places.js`: the allowed Google Place Details field list. It deliberately excludes image fields.
- `js/maps.js`, `js/itinerary.js`, `js/hotels.js`, `js/expenses.js`: reserved module entry points for gradual extraction.

## Places Cost Policy

The frontend must not request or render Google Places images. Place Details requests are limited to:

- `place_id`
- `name`
- `formatted_address`
- `geometry`
- `types`

Legacy image columns may remain in Google Sheets for compatibility, but the frontend does not read, render, refresh, or write them. New itinerary and hotel records use icons and category colors instead of images.

## Map Policy

The itinerary map contains two separate tools:

- `行程定位` is a Day-level viewer. It only reads coordinates already stored on itinerary and hotel records. Selecting a point may pan, zoom, highlight a marker, and open its existing info window without calling search APIs.
- `探點搜尋` is a temporary map lookup. It may use Places Autocomplete, the limited Place Details fields above, and geocoding to place one probe marker. It does not create itinerary records, run nearby search, or request image data.

## Feature Data Conventions

- Transport details stay in the existing itinerary `message` field. The first line uses the versioned `[[TRAVEL_TRANSPORT_V1:...]]` envelope with URI-encoded JSON; user notes follow on later lines. Read and write this value only through the transport message helpers.
- Public-wallet contributions stay in `expenses` with `involved` containing `公帳`. Spending from the wallet uses `payer: 公帳`. Contributions are excluded from spending totals; wallet spending remains a normal expense.
- Promoting an alternative updates the same itinerary record from `is_alternative: v` to an empty flag. It must not create a duplicate itinerary ID.

## Migration Rule

Move one cohesive helper group at a time. Keep public behavior stable, bump the static asset version, run syntax and keyword checks, and verify the mobile UI before extracting another feature.
