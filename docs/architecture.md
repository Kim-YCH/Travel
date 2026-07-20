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

Every module is a plain IIFE that publishes one frozen `window.Travel*` namespace. `app.js` declares the
handles it needs at the top of `setup()` and throws early if a module is missing, so there are no
inline fallback copies to keep in sync.

- `js/utils.js` (`TravelUtils`): ID, date, time formatting, HTML escaping, and message linkifying.
- `js/api.js` (`TravelApi`): JSONP transport and Apps Script request wrappers.
- `js/cache.js` (`TravelCache`): localStorage key helpers and safe JSON helpers.
- `js/places.js` (`TravelPlaces`): the allowed Google Place Details field list. It deliberately excludes image fields.
- `js/maps.js` (`TravelMaps`): hex colour helpers and the marker pin SVG builders.
- `js/itinerary.js` (`TravelItinerary`): itinerary record model, type/tone/icon resolution, and the transport `message` envelope.
- `js/hotels.js` (`TravelHotels`): hotel record model and day-range logic. `hasHotelOverlap` takes the list as its first argument; the module holds no state.
- `js/expenses.js` (`TravelExpenses`): expense and shared-wallet record models, person normalisation, and legacy `公帳` detection.
- `js/weather.js` (`TravelWeather`): weather code and UV level display mapping.

Modules must stay free of Vue refs. Anything that needs reactive state stays in `app.js` until it can be
extracted as a `createXxx({ refs })` factory in the style of `TravelApi.create`.

## Verification

`node tests/run.js` requires no dependencies and covers: syntax of every frontend script, unit tests for the
pure modules, a real execution of `app.js`'s `setup()` in a stub environment (which catches references broken
by extraction), a check that every identifier used in the `index.html` template is exposed by `setup()`, and
static asset version consistency. Run it after any extraction; it does not replace the mobile UI check.

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

- Transport details stay in the existing itinerary `message` field. The first line uses the versioned `[[TRAVEL_TRANSPORT_V1:...]]` envelope with URI-encoded JSON; user notes follow on later lines. The current UI exposes only `number`, `terminal`, and the itinerary `time`, while hidden legacy transport keys remain readable.
- Shared-wallet enablement is stored on `trips.shared_wallet_enabled`. Deposits and payments are stored only in `SharedWalletTransactions`; they never use `people` or `expenses`.
- Legacy `expenses` records that reference `公帳` are retained but excluded from normal expense totals, analysis, and settlement calculations.
- Moving between formal and alternative plans updates the same itinerary record through `is_alternative` (`v` for alternative, empty for formal). It must not create a duplicate itinerary ID.

## Migration Rule

Move one cohesive helper group at a time. Keep public behavior stable, bump the static asset version, run syntax and keyword checks, and verify the mobile UI before extracting another feature.
