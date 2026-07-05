// version: 20260705.7 complete backend; itinerary image columns are auto-added by header name.
/************ CONFIG ************/
const SPREADSHEET_ID = '11H-wsAJRRBbiGxCIbovY_o4bvEB7m6eayT27Wafmtkw';
const ALLOWED_TYPES = ['trips', 'itinerary', 'expenses', 'people', 'hotels', 'prep_checklist', 'tripData'];
const TRIPDATA_CACHE_TTL_SEC = 300; // 5 分鐘
const REQUIRED_TYPE_HEADERS = {
  itinerary: ['type', 'image_url', 'image_source', 'photo_attributions', 'image_updated_at']
};

/************ ENTRY ************/
function doGet(e) {
  const callback = getParam(e, 'callback', '');

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const action = getParam(e, 'action', '');
    const type = getParam(e, 'type', '');
    const tripId = getParam(e, 'tripId', '');

    // 寫入類 action（GET JSONP 也要上鎖）
    if (action) {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const out = handleActionGET(ss, action, type, e);
        return createJSONPOutput(out, callback);
      } finally {
        lock.releaseLock();
      }
    }

    // 讀取
    if (!type) {
      return createJSONPOutput({ status: 'error', message: 'missing type' }, callback);
    }

    if (!ALLOWED_TYPES.includes(type)) {
      return createJSONPOutput({ status: 'error', message: 'invalid type' }, callback);
    }

    // 合併讀取
    if (type === 'tripData') {
      if (!tripId) {
        return createJSONPOutput({ status: 'error', message: 'missing tripId' }, callback);
      }

      // force=1 時跳過 CacheService，直接讀 Google Sheet 最新資料。
      // 給前端手動同步 / 自動同步使用，避免其他裝置剛更新後仍吃到 5 分鐘快取。
      const force = getParam(e, 'force', '') === '1';
      const out = getTripDataCached_(ss, tripId, force);
      return createJSONPOutput(out, callback);
    }

    // 單表讀取
    const sheet = ss.getSheetByName(type);
    if (!sheet) return createJSONPOutput([], callback);

    const result = readSheetAsObjects_(sheet, type, tripId);
    return createJSONPOutput(result, callback);

  } catch (err) {
    return createJSONPOutput({ status: 'error', message: String(err) }, callback);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJSONPOutput({ status: 'error', message: 'No data' }, '');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const type = contents.type;

    if (!action) {
      return createJSONPOutput({ status: 'error', message: 'missing action' }, '');
    }

    // 測試連線用：不需要 type，避免 POST 測試時被 missing action/type 擋下來
    if (action === 'test') {
      return createJSONPOutput({
        status: 'success',
        message: 'Apps Script API connected',
        method: 'POST',
        time: new Date().toISOString(),
        body: contents
      }, '');
    }

    if (String(action || '').indexOf('prep_') === 0) {
      const out = handlePrepChecklistMutation_(ss, contents);
      return createJSONPOutput(out, '');
    }

    if (!type) {
      return createJSONPOutput({ status: 'error', message: 'missing type' }, '');
    }

    const out = handleActionPOST(ss, action, type, contents);
    return createJSONPOutput(out, '');

  } catch (err) {
    return createJSONPOutput({ status: 'error', message: String(err) }, '');
  } finally {
    lock.releaseLock();
  }
}

/************ READ HELPERS ************/
function readSheetAsObjects_(sheet, type, tripId) {
  ensureTypeHeaders_(sheet, type);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headersRaw.map(h => String(h).toLowerCase().trim());
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const tripIdCol = headers.indexOf('trip_id');
  let filteredRows = rows;

  if (type !== 'trips' && tripId && tripIdCol > -1) {
    filteredRows = rows.filter(r => String(r[tripIdCol]) === String(tripId));
  }

  return filteredRows.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      const val = row[idx];
      if (header === 'involved') {
        obj[header] = val ? String(val).split(',') : [];
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

function findRowById_(sheet, id) {
  ensureTypeHeaders_(sheet, sheet.getName());

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return null;

  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headersRaw.map(h => String(h).toLowerCase().trim());
  const idCol = headers.indexOf('id');
  if (idCol < 0) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = values[i][idx]);
      return obj;
    }
  }
  return null;
}

/************ MERGED tripData + CACHE ************/
function getTripDataCached_(ss, tripId, force) {
  const cache = CacheService.getScriptCache();
  const key = 'tripData_' + String(tripId);

  if (!force) {
    const hit = cache.get(key);
    if (hit) {
      const data = JSON.parse(hit);
      data._cache = 'hit';
      return data;
    }
  }

  const out = getTripDataFast_(ss, tripId);
  out._cache = force ? 'force' : 'miss';

  try {
    cache.put(key, JSON.stringify(out), TRIPDATA_CACHE_TTL_SEC);
  } catch (e) {
    out._cache_error = String(e);
  }

  return out;
}

function clearTripDataCache_(tripId) {
  try {
    CacheService.getScriptCache().remove('tripData_' + String(tripId));
  } catch (e) {}
}

function getTripDataFast_(ss, tripId) {
  const tripsSheet = ss.getSheetByName('trips');
  const itinSheet  = ss.getSheetByName('itinerary');
  const expSheet   = ss.getSheetByName('expenses');
  const pplSheet   = ss.getSheetByName('people');
  const hotelSheet = ss.getSheetByName('hotels');

  const trip = tripsSheet ? findRowById_(tripsSheet, tripId) : null;
  let itinerary = itinSheet ? readSheetAsObjects_(itinSheet, 'itinerary', tripId) : [];
  const expenses = expSheet ? readSheetAsObjects_(expSheet, 'expenses', tripId) : [];
  const people   = pplSheet ? readSheetAsObjects_(pplSheet, 'people', tripId) : [];
  const hotels   = hotelSheet ? readSheetAsObjects_(hotelSheet, 'hotels', tripId) : [];

  itinerary = sortItineraryForResponse_(itinerary);
  hotels.sort((a, b) => (parseInt(a.start_day, 10) || 1) - (parseInt(b.start_day, 10) || 1));

  return { trip, itinerary, expenses, people, hotels };
}

/************ ACTIONS (GET) ************/
function handleActionGET(ss, action, type, e) {
  // 測試連線用：前端可用 ?action=test 確認 Apps Script 是否正常回應
  if (action === 'test') {
    return {
      status: 'success',
      message: 'Apps Script API connected',
      method: 'GET',
      time: new Date().toISOString(),
      params: e && e.parameter ? e.parameter : {}
    };
  }

  if (action === 'prep_checklist_get') {
    const tripId = getParam(e, 'tripId', '');
    const tripName = getParam(e, 'tripName', '');
    const owner = getParam(e, 'owner', getParam(e, 'assignee', getParam(e, 'member', '')));
    return getPrepChecklist_(ss, tripId, tripName, owner);
  }

  if (action === 'translate_place_keyword') {
    return translatePlaceKeywordGET_(e);
  }
  if (action === 'naver_local_search') {
    const keyword = getParam(e, 'keyword', '');
    if (!keyword) throw new Error('missing keyword');

    const items = naverLocalSearch_(keyword);
    return { status: 'success', items };
  }

  if (action === 'set_trip_start_date') {
    const tripId = getParam(e, 'tripId', '');
    const startDate = getParam(e, 'start_date', '');
    if (!tripId) throw new Error('missing tripId');
    if (!startDate) throw new Error('missing start_date');

    const out = setTripStartDate_(ss, tripId, startDate);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'add' || action === 'edit') {
    if (!type) throw new Error('missing type');
    if (!ALLOWED_TYPES.includes(type) || type === 'tripData') throw new Error('invalid type');

    const dataStr = getParam(e, 'data', '');
    const data = dataStr ? JSON.parse(dataStr) : {};
    const out = addOrEditRow_(ss, type, action, data);

    if (data && data.trip_id) clearTripDataCache_(data.trip_id);
    return out;
  }

  if (action === 'del') {
    if (!type) throw new Error('missing type');
    if (!ALLOWED_TYPES.includes(type) || type === 'tripData') throw new Error('invalid type');

    const id = getParam(e, 'id', '');
    if (!id) throw new Error('del missing id');

    const out = deleteRowById_(ss, type, id);
    if (out && out.tripId) clearTripDataCache_(out.tripId);
    return { status: 'success' };
  }

  if (action === 'swap_days') {
    const tripId = getParam(e, 'tripId', '');
    const dayA = parseInt(getParam(e, 'dayA', '0'), 10);
    const dayB = parseInt(getParam(e, 'dayB', '0'), 10);
    if (!tripId) throw new Error('missing tripId');
    if (!dayA || !dayB) throw new Error('missing dayA/dayB');
    if (dayA === dayB) return { status: 'success', message: 'same day' };

    const out = swapDays_(ss, tripId, dayA, dayB);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'save_order') {
    const tripId = getParam(e, 'tripId', '');
    const day = parseInt(getParam(e, 'day', '0'), 10);
    const order = getParam(e, 'order', '');
    const isAlternative = normalizeAlternativeFlag_(getParam(e, 'isAlternative', ''));

    if (!tripId) throw new Error('missing tripId');
    if (!day) throw new Error('missing day');

    const out = saveOrder_(ss, tripId, day, order, isAlternative);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'clear_order') {
    const tripId = getParam(e, 'tripId', '');
    const day = parseInt(getParam(e, 'day', '0'), 10);

    if (!tripId) throw new Error('missing tripId');
    if (!day) throw new Error('missing day');

    const out = clearOrder_(ss, tripId, day);
    clearTripDataCache_(tripId);
    return out;
  }

  throw new Error('unknown action: ' + action);
}

/************ ACTIONS (POST) ************/
function handleActionPOST(ss, action, type, contents) {
  // 保險：如果之後從其他地方直接呼叫 handleActionPOST，也支援 test
  if (action === 'test') {
    return {
      status: 'success',
      message: 'Apps Script API connected',
      method: 'POST',
      time: new Date().toISOString(),
      body: contents || {}
    };
  }

  if (String(action || '').indexOf('prep_') === 0) {
    return handlePrepChecklistMutation_(ss, contents || {});
  }

  if (!ALLOWED_TYPES.includes(type) || type === 'tripData') {
    throw new Error('invalid type');
  }

  if (action === 'set_trip_start_date') {
    const tripId = String(contents.tripId || '');
    const startDate = String(contents.start_date || '');
    if (!tripId) throw new Error('missing tripId');
    if (!startDate) throw new Error('missing start_date');

    const out = setTripStartDate_(ss, tripId, startDate);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'swap_days') {
    const tripId = String(contents.tripId || '');
    const dayA = parseInt(contents.dayA, 10);
    const dayB = parseInt(contents.dayB, 10);
    if (!tripId) throw new Error('missing tripId');
    if (!dayA || !dayB) throw new Error('missing dayA/dayB');

    const out = swapDays_(ss, tripId, dayA, dayB);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'save_order') {
    const tripId = String(contents.tripId || '');
    const day = parseInt(contents.day, 10);
    const order = String(contents.order || '');
    const isAlternative = normalizeAlternativeFlag_(contents.isAlternative || '');

    if (!tripId) throw new Error('missing tripId');
    if (!day) throw new Error('missing day');

    const out = saveOrder_(ss, tripId, day, order, isAlternative);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'clear_order') {
    const tripId = String(contents.tripId || '');
    const day = parseInt(contents.day, 10);

    if (!tripId) throw new Error('missing tripId');
    if (!day) throw new Error('missing day');

    const out = clearOrder_(ss, tripId, day);
    clearTripDataCache_(tripId);
    return out;
  }

  if (action === 'add' || action === 'edit') {
    const data = contents.data || {};
    const out = addOrEditRow_(ss, type, action, data);

    if (data && data.trip_id) clearTripDataCache_(data.trip_id);
    return out;
  }

  if (action === 'del') {
    const id = String(contents.id || '');
    if (!id) throw new Error('del missing id');

    const out = deleteRowById_(ss, type, id);
    if (out && out.tripId) clearTripDataCache_(out.tripId);
    return { status: 'success' };
  }

  throw new Error('unknown action: ' + action);
}

/************ CORE DB OPS ************/
function ensureTypeHeaders_(sheet, type) {
  if (!sheet) return;

  const sheetType = String(type || sheet.getName() || '').toLowerCase().trim();
  const required = REQUIRED_TYPE_HEADERS[sheetType] || [];
  if (!required.length) return;

  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).toLowerCase().trim())
    .filter(Boolean);

  const missing = required.filter(h => currentHeaders.indexOf(h) === -1);
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

function getHeaderMap_(sheet) {
  ensureTypeHeaders_(sheet, sheet.getName());

  const lastCol = sheet.getLastColumn();
  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headersRaw.map(h => String(h));
  const headerMap = {};

  headers.forEach((h, i) => {
    headerMap[String(h).toLowerCase().trim()] = i;
  });

  return { headers, headerMap };
}

function addOrEditRow_(ss, type, action, data) {
  const sheet = ss.getSheetByName(type);
  if (!sheet) throw new Error('sheet not found: ' + type);

  const { headers, headerMap } = getHeaderMap_(sheet);
  const idColIndex = headerMap['id'];
  if (idColIndex === undefined) throw new Error(type + ' missing id column');

  if (action === 'add') {
    const newRow = new Array(headers.length).fill('');

    Object.keys(data || {}).forEach(key => {
      let v = data[key];
      if (String(key).toLowerCase() === 'involved' && Array.isArray(v)) {
        v = v.join(',');
      }
      let colIndex = headerMap[String(key).toLowerCase()];
      if (colIndex === undefined && String(key).toLowerCase() === 'is_alternative') colIndex = headerMap['是否為備案'];
      if (colIndex !== undefined) newRow[colIndex] = v;
    });

    sheet.appendRow(newRow);
    return { status: 'success' };
  }

  const idToEdit = String(data.id || '');
  if (!idToEdit) throw new Error('edit missing data.id');

  const values = sheet.getDataRange().getValues();
  let rowIndexToEdit = -1;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === idToEdit) {
      rowIndexToEdit = i + 1;
      break;
    }
  }

  if (rowIndexToEdit < 0) throw new Error('id not found: ' + idToEdit);

  Object.keys(data || {}).forEach(key => {
    let v = data[key];
    if (String(key).toLowerCase() === 'involved' && Array.isArray(v)) {
      v = v.join(',');
    }
    let colIndex = headerMap[String(key).toLowerCase()];
    if (colIndex === undefined && String(key).toLowerCase() === 'is_alternative') colIndex = headerMap['是否為備案'];
    if (colIndex !== undefined) {
      sheet.getRange(rowIndexToEdit, colIndex + 1).setValue(v);
    }
  });

  return { status: 'success' };
}

function deleteRowById_(ss, type, idToDelete) {
  const sheet = ss.getSheetByName(type);
  if (!sheet) throw new Error('sheet not found: ' + type);

  const { headerMap } = getHeaderMap_(sheet);
  const idColIndex = headerMap['id'];
  if (idColIndex === undefined) throw new Error(type + ' missing id column');

  const tripIdCol = headerMap['trip_id'];
  const values = sheet.getDataRange().getValues();
  let tripIdFound = '';

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === String(idToDelete)) {
      if (tripIdCol !== undefined) tripIdFound = values[i][tripIdCol];
      sheet.deleteRow(i + 1);
      break;
    }
  }

  return { tripId: tripIdFound };
}

function setTripStartDate_(ss, tripId, startDate) {
  const sheet = ss.getSheetByName('trips');
  if (!sheet) throw new Error('sheet trips not found');

  const { headerMap } = getHeaderMap_(sheet);
  const idCol = headerMap['id'];
  const startDateCol = headerMap['start_date'];

  if (idCol === undefined) throw new Error('trips missing id column');
  if (startDateCol === undefined) throw new Error('trips missing start_date column');

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(tripId)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex < 0) throw new Error('tripId not found: ' + tripId);

  sheet.getRange(rowIndex, startDateCol + 1).setValue(String(startDate));
  return { status: 'success' };
}

function normalizeAlternativeFlag_(value) {
  return String(value || '').trim().toLowerCase() === 'v' ? 'v' : '';
}

/************ ORDERS（直接寫 itinerary.order） ************/
function saveOrder_(ss, tripId, day, orderStr, isAlternative) {
  const sheet = ss.getSheetByName('itinerary');
  if (!sheet) throw new Error('sheet itinerary not found');

  const { headerMap } = getHeaderMap_(sheet);
  const idCol = headerMap['id'];
  const tripCol = headerMap['trip_id'];
  const dayCol = headerMap['day'];
  const orderCol = headerMap['order'];
  let altCol = headerMap['is_alternative'];
  if (altCol === undefined) altCol = headerMap['是否為備案'];

  if (idCol === undefined) throw new Error('itinerary missing id column');
  if (tripCol === undefined) throw new Error('itinerary missing trip_id column');
  if (dayCol === undefined) throw new Error('itinerary missing day column');
  if (orderCol === undefined) throw new Error('itinerary missing order column');
  if (altCol === undefined) throw new Error('itinerary missing is_alternative column');

  const targetAlt = normalizeAlternativeFlag_(isAlternative);

  const ids = String(orderStr || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const range = sheet.getDataRange();
  const values = range.getValues();

  const targetRowIndexes = [];
  const rowIndexById = {};

  for (let i = 1; i < values.length; i++) {
    const rowTripId = String(values[i][tripCol]);
    const rowDay = parseInt(values[i][dayCol], 10) || 1;
    const rowAlt = normalizeAlternativeFlag_(values[i][altCol]);

    if (rowTripId === String(tripId) && rowDay === Number(day) && rowAlt === targetAlt) {
      targetRowIndexes.push(i);
      rowIndexById[String(values[i][idCol])] = i;
    }
  }

  targetRowIndexes.forEach(i => {
    values[i][orderCol] = '';
  });

  ids.forEach((id, idx) => {
    const rowIndex = rowIndexById[String(id)];
    if (rowIndex !== undefined) {
      values[rowIndex][orderCol] = idx + 1;
    }
  });

  let nextOrder = ids.length + 1;
  targetRowIndexes.forEach(i => {
    if (values[i][orderCol] === '') {
      values[i][orderCol] = nextOrder++;
    }
  });

  range.setValues(values);
  return { status: 'success' };
}

function clearOrder_(ss, tripId, day) {
  const sheet = ss.getSheetByName('itinerary');
  if (!sheet) throw new Error('sheet itinerary not found');

  const { headerMap } = getHeaderMap_(sheet);
  const tripCol = headerMap['trip_id'];
  const dayCol = headerMap['day'];
  const orderCol = headerMap['order'];

  if (tripCol === undefined) throw new Error('itinerary missing trip_id column');
  if (dayCol === undefined) throw new Error('itinerary missing day column');
  if (orderCol === undefined) throw new Error('itinerary missing order column');

  const range = sheet.getDataRange();
  const values = range.getValues();

  for (let i = 1; i < values.length; i++) {
    const rowTripId = String(values[i][tripCol]);
    const rowDay = parseInt(values[i][dayCol], 10) || 1;

    if (rowTripId === String(tripId) && rowDay === Number(day)) {
      values[i][orderCol] = '';
    }
  }

  range.setValues(values);
  return { status: 'success' };
}

/************ SWAP DAYS ************/
function swapDays_(ss, tripId, dayA, dayB) {
  const sheet = ss.getSheetByName('itinerary');
  if (!sheet) throw new Error('sheet itinerary not found');

  const { headerMap } = getHeaderMap_(sheet);
  const tripCol = headerMap['trip_id'];
  const dayCol = headerMap['day'];

  if (tripCol === undefined) throw new Error('itinerary missing trip_id');
  if (dayCol === undefined) throw new Error('itinerary missing day');

  const range = sheet.getDataRange();
  const values = range.getValues();

  const rowsA = [];
  const rowsB = [];

  for (let i = 1; i < values.length; i++) {
    const t = String(values[i][tripCol]);
    if (t !== String(tripId)) continue;

    const d = parseInt(values[i][dayCol], 10) || 1;
    if (d === dayA) rowsA.push(i);
    else if (d === dayB) rowsB.push(i);
  }

  rowsA.forEach(r => { values[r][dayCol] = dayB; });
  rowsB.forEach(r => { values[r][dayCol] = dayA; });

  range.setValues(values);
  return { status: 'success' };
}

/************ SORT HELPERS ************/
function sortItineraryForResponse_(list) {
  return (list || []).slice().sort((a, b) => {
    const dayA = parseInt(a.day, 10) || 1;
    const dayB = parseInt(b.day, 10) || 1;
    if (dayA !== dayB) return dayA - dayB;

    const altA = normalizeAlternativeFlag_(a.is_alternative || a['是否為備案']) === 'v' ? 1 : 0;
    const altB = normalizeAlternativeFlag_(b.is_alternative || b['是否為備案']) === 'v' ? 1 : 0;
    if (altA !== altB) return altA - altB;

    const orderA = parseInt(a.order, 10);
    const orderB = parseInt(b.order, 10);
    const hasOrderA = !isNaN(orderA);
    const hasOrderB = !isNaN(orderB);

    if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
    if (hasOrderA && !hasOrderB) return -1;
    if (!hasOrderA && hasOrderB) return 1;

    const timeA = timeToNum_(a.time);
    const timeB = timeToNum_(b.time);
    if (timeA !== timeB) return timeA - timeB;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function timeToNum_(t) {
  const s = String(t || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 999999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/************ UTIL ************/
function getParam(e, key, def) {
  try {
    if (!e || !e.parameter) return def;
    const v = e.parameter[key];
    if (v === undefined || v === null || v === '') return def;
    return String(v);
  } catch (_) {
    return def;
  }
}

function createJSONPOutput(data, callback) {
  const cb = String(callback || '').trim();
  const json = JSON.stringify(data);

  if (cb) {
    return ContentService.createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/************ NAVER ************/
function naverLocalSearch_(query) {
  const clientId = PropertiesService.getScriptProperties().getProperty('NAVER_CLIENT_ID');
  const clientSecret = PropertiesService.getScriptProperties().getProperty('NAVER_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing NAVER_CLIENT_ID / NAVER_CLIENT_SECRET');
  }

  const url =
    'https://openapi.naver.com/v1/search/local.json'
    + '?query=' + encodeURIComponent(String(query || ''))
    + '&display=5'
    + '&start=1'
    + '&sort=random';

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Naver local search failed: ' + code + ' ' + text);
  }

  const json = JSON.parse(text);
  const items = Array.isArray(json.items) ? json.items : [];

  return items.map((item, idx) => ({
    source: 'naver',
    place_id: 'naver_' + Date.now() + '_' + idx,
    name: String(item.title || '').replace(/<[^>]*>/g, ''),
    roadAddress: item.roadAddress || '',
    address: item.address || '',
    category: item.category || '',
    telephone: item.telephone || '',
    lng: item.mapx ? Number(item.mapx) / 10000000 : null,
    lat: item.mapy ? Number(item.mapy) / 10000000 : null,
    structured_formatting: {
      main_text: String(item.title || '').replace(/<[^>]*>/g, ''),
      secondary_text: item.roadAddress || item.address || ''
    }
  }));
}
function translatePlaceKeywordGET_(e) {
  const text = getParam(e, 'text', '').trim();
  const targetRaw = getParam(e, 'target', 'ko').trim();
  const target = normalizeTranslateTarget_(targetRaw);

  if (!text) {
    return { status: 'error', message: 'missing text' };
  }

  if (!target) {
    return { status: 'error', message: 'unsupported target: ' + targetRaw };
  }

  const out = translateTextBasic_(text, target);
  return {
    status: 'ok',
    originalText: text,
    target: target,
    translatedText: out.translatedText || '',
    detectedSourceLanguage: out.detectedSourceLanguage || ''
  };
}

function normalizeTranslateTarget_(target) {
  const normalized = String(target || '').trim().toLowerCase().replace('_', '-');
  const map = {
    ko: 'ko',
    ja: 'ja',
    th: 'th',
    en: 'en',
    'zh-tw': 'zh-TW',
    'zh-hant': 'zh-TW'
  };
  return map[normalized] || '';
}

function translateTextBasic_(text, target) {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty('GOOGLE_TRANSLATE_API_KEY');

  if (!apiKey) {
    throw new Error('missing GOOGLE_TRANSLATE_API_KEY in Script properties');
  }

  const url = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(apiKey);
  const payload = {
    q: text,
    target: target,
    format: 'text'
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Google Translate API error ' + code + ': ' + body);
  }

  const json = JSON.parse(body);
  const first = json && json.data && json.data.translations && json.data.translations[0]
    ? json.data.translations[0]
    : {};

  return {
    translatedText: htmlEntityDecode_(first.translatedText || ''),
    detectedSourceLanguage: first.detectedSourceLanguage || ''
  };
}

function htmlEntityDecode_(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function testAuthorization() {
  const res = UrlFetchApp.fetch("https://www.google.com");
  Logger.log(res.getResponseCode());
}

/************ PREP CHECKLIST 20260703.4：依成員分表 ************/
const PREP_CHECKLIST_SHEET_NAME = 'prep_checklist';
const PREP_CHECKLIST_HEADERS = [
  'id',
  'trip_id',
  'category',
  'item_name',
  'checked',
  'sort_order',
  'created_at',
  'updated_at',
  'trip_name',
  'category_id',
  'category_emoji',
  'category_order',
  'item_id',
  'checked_at',
  'owner',
  'assignee'
];

function ensurePrepChecklistSheet_(ss) {
  let sheet = ss.getSheetByName(PREP_CHECKLIST_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PREP_CHECKLIST_SHEET_NAME);

  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
    sheet.getRange(1, 1, 1, PREP_CHECKLIST_HEADERS.length).setValues([PREP_CHECKLIST_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const lastCol = sheet.getLastColumn();
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).toLowerCase().trim())
    .filter(Boolean);

  const missing = PREP_CHECKLIST_HEADERS.filter(h => !currentHeaders.includes(h));
  if (missing.length > 0) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getPrepHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headersRaw.map(h => String(h).toLowerCase().trim());
  const map = {};
  headers.forEach((h, i) => { if (h) map[h] = i; });
  return { headers, map };
}

function makePrepId_(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

function normalizePrepBool_(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'v' || s === 'yes' || s === 'y' || s === 'checked';
}

function normalizePrepOwner_(value) {
  return String(value || '').trim();
}

function getPrepRowOwner_(row, map) {
  const owner = map['owner'] !== undefined ? normalizePrepOwner_(row[map['owner']]) : '';
  if (owner) return owner;
  return map['assignee'] !== undefined ? normalizePrepOwner_(row[map['assignee']]) : '';
}

function isPrepTripRowMatch_(row, map, tripId, tripName) {
  const rowTripId = map['trip_id'] !== undefined ? String(row[map['trip_id']] || '').trim() : '';
  const rowTripName = map['trip_name'] !== undefined ? String(row[map['trip_name']] || '').trim() : '';

  // 有 trip_id 的新資料以 trip_id 為準；只有舊資料 trip_id 空白時才用 trip_name 補比對。
  if (tripId) {
    if (rowTripId) return rowTripId === tripId;
    return !!(tripName && rowTripName && rowTripName === tripName);
  }

  return !!(tripName && rowTripName && rowTripName === tripName);
}

function isPrepBlankOwnerRow_(row, map) {
  const owner = map['owner'] !== undefined ? normalizePrepOwner_(row[map['owner']]) : '';
  const assignee = map['assignee'] !== undefined ? normalizePrepOwner_(row[map['assignee']]) : '';
  return !owner && !assignee;
}

function resolvePrepTripId_(ss, tripId, tripName) {
  if (tripId) return String(tripId).trim();
  const name = String(tripName || '').trim();
  if (!name) return '';

  const tripsSheet = ss.getSheetByName('trips');
  if (!tripsSheet || tripsSheet.getLastRow() < 2) return '';

  const { map } = getPrepHeaderMap_(tripsSheet);
  const idCol = map['id'];
  const nameCol = map['name'];
  if (idCol === undefined || nameCol === undefined) return '';

  const values = tripsSheet.getRange(2, 1, tripsSheet.getLastRow() - 1, tripsSheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][nameCol]).trim() === name) return String(values[i][idCol]).trim();
  }
  return '';
}

function resolvePrepTripName_(ss, tripId, tripName) {
  const name = String(tripName || '').trim();
  if (name) return name;
  const id = String(tripId || '').trim();
  if (!id) return '';

  const tripsSheet = ss.getSheetByName('trips');
  if (!tripsSheet || tripsSheet.getLastRow() < 2) return '';

  const { map } = getPrepHeaderMap_(tripsSheet);
  const idCol = map['id'];
  const nameCol = map['name'];
  if (idCol === undefined || nameCol === undefined) return '';

  const values = tripsSheet.getRange(2, 1, tripsSheet.getLastRow() - 1, tripsSheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === id) return String(values[i][nameCol] || '').trim();
  }
  return '';
}

function buildPrepRow_(headers, map, obj) {
  const row = new Array(headers.length).fill('');
  Object.keys(obj).forEach(key => {
    const col = map[String(key).toLowerCase()];
    if (col !== undefined) row[col] = obj[key];
  });
  return row;
}

function setPrepCell_(sheet, rowNumber, map, key, value) {
  const col = map[String(key).toLowerCase()];
  if (col !== undefined) sheet.getRange(rowNumber, col + 1).setValue(value);
}

function setPrepCells_(sheet, rowNumber, map, obj) {
  Object.keys(obj).forEach(key => setPrepCell_(sheet, rowNumber, map, key, obj[key]));
}

function getPrepAllRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return values.map((row, index) => ({ row: row, rowNumber: index + 2 }));
}

function getPrepContext_(ss, contents) {
  const sheet = ensurePrepChecklistSheet_(ss);
  const { headers, map } = getPrepHeaderMap_(sheet);
  const tripId = resolvePrepTripId_(ss, contents.tripId || '', contents.tripName || '');
  const tripName = resolvePrepTripName_(ss, tripId, contents.tripName || '');
  const owner = normalizePrepOwner_(contents.owner || contents.assignee || contents.member || '');
  if (!tripId && !tripName) throw new Error('prep checklist missing tripId/tripName');
  if (!owner) throw new Error('prep checklist missing owner');
  return { ss, sheet, headers, map, tripId, tripName, owner, now: new Date().toISOString() };
}

function isPrepContextRow_(ctx, row) {
  if (!isPrepTripRowMatch_(row, ctx.map, ctx.tripId, ctx.tripName)) return false;
  return getPrepRowOwner_(row, ctx.map) === ctx.owner;
}

function getPrepCategoryIdFromRow_(row, map) {
  return map['category_id'] !== undefined ? String(row[map['category_id']] || '').trim() : '';
}

function getPrepItemIdFromRow_(row, map) {
  const itemId = map['item_id'] !== undefined ? String(row[map['item_id']] || '').trim() : '';
  if (itemId) return itemId;
  return map['id'] !== undefined ? String(row[map['id']] || '').trim() : '';
}

function getPrepItemNameFromRow_(row, map) {
  return map['item_name'] !== undefined ? String(row[map['item_name']] || '').trim() : '';
}

function findPrepCategoryRows_(ctx, categoryId) {
  const id = String(categoryId || '').trim();
  if (!id) return [];
  return getPrepAllRows_(ctx.sheet).filter(entry => {
    return isPrepContextRow_(ctx, entry.row) && getPrepCategoryIdFromRow_(entry.row, ctx.map) === id;
  });
}

function findPrepItemRows_(ctx, itemId) {
  const id = String(itemId || '').trim();
  if (!id) return [];
  return getPrepAllRows_(ctx.sheet).filter(entry => {
    return isPrepContextRow_(ctx, entry.row) && getPrepItemIdFromRow_(entry.row, ctx.map) === id;
  });
}

function countPrepCategories_(ctx) {
  const seen = {};
  getPrepAllRows_(ctx.sheet).forEach(entry => {
    if (!isPrepContextRow_(ctx, entry.row)) return;
    const categoryId = getPrepCategoryIdFromRow_(entry.row, ctx.map);
    if (categoryId) seen[categoryId] = true;
  });
  return Object.keys(seen).length;
}

function countPrepItemsInCategory_(ctx, categoryId) {
  return findPrepCategoryRows_(ctx, categoryId).filter(entry => getPrepItemNameFromRow_(entry.row, ctx.map)).length;
}

function appendPrepCategoryPlaceholder_(ctx, categoryId, category, emoji, categoryOrder) {
  const row = buildPrepRow_(ctx.headers, ctx.map, {
    id: categoryId,
    trip_id: ctx.tripId,
    trip_name: ctx.tripName,
    owner: ctx.owner,
    category_id: categoryId,
    category: category,
    category_emoji: emoji,
    category_order: categoryOrder,
    item_id: '',
    item_name: '',
    checked: '',
    sort_order: '',
    checked_at: '',
    created_at: ctx.now,
    updated_at: ctx.now,
    assignee: ''
  });
  ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, 1, ctx.headers.length).setValues([row]);
}

function ensurePrepCategoryPlaceholderIfEmpty_(ctx, categoryMeta) {
  const categoryId = String(categoryMeta.categoryId || '').trim();
  if (!categoryId) return;
  const rows = findPrepCategoryRows_(ctx, categoryId);
  if (rows.length > 0) return;
  appendPrepCategoryPlaceholder_(
    ctx,
    categoryId,
    categoryMeta.category || '未命名分類',
    categoryMeta.categoryEmoji || '',
    categoryMeta.categoryOrder || countPrepCategories_(ctx) + 1
  );
}

function getPrepCategoryMeta_(ctx, categoryId) {
  const rows = findPrepCategoryRows_(ctx, categoryId);
  if (!rows.length) return null;
  const row = rows[0].row;
  return {
    categoryId: String(categoryId || '').trim(),
    category: ctx.map['category'] !== undefined ? String(row[ctx.map['category']] || '').trim() : '',
    categoryEmoji: ctx.map['category_emoji'] !== undefined ? String(row[ctx.map['category_emoji']] || '').trim() : '',
    categoryOrder: ctx.map['category_order'] !== undefined ? parseInt(row[ctx.map['category_order']], 10) || 0 : 0
  };
}

function getPrepChecklist_(ss, tripId, tripName, owner) {
  const sheet = ensurePrepChecklistSheet_(ss);
  const resolvedTripId = resolvePrepTripId_(ss, tripId, tripName);
  const resolvedTripName = resolvePrepTripName_(ss, resolvedTripId, tripName);
  const resolvedOwner = normalizePrepOwner_(owner);

  if (!resolvedOwner) {
    return { status: 'success', tripId: resolvedTripId, tripName: resolvedTripName, owner: '', sections: [], requiresOwner: true, updatedAt: new Date().toISOString() };
  }

  const { map } = getPrepHeaderMap_(sheet);
  const values = getPrepAllRows_(sheet).map(entry => entry.row);
  const matched = values.filter(row => {
    if (!isPrepTripRowMatch_(row, map, resolvedTripId, resolvedTripName)) return false;
    return getPrepRowOwner_(row, map) === resolvedOwner;
  });

  const sectionsById = {};
  let maxUpdatedAt = '';

  matched.forEach((row, idx) => {
    const sectionId = String(row[map['category_id']] || '').trim() || makePrepId_('section');
    const category = String(row[map['category']] || '').trim();
    if (!category) return;

    const categoryOrder = map['category_order'] !== undefined ? parseInt(row[map['category_order']], 10) || 0 : idx + 1;
    if (!sectionsById[sectionId]) {
      sectionsById[sectionId] = {
        id: sectionId,
        title: category,
        emoji: String(row[map['category_emoji']] || '').trim(),
        owner: resolvedOwner,
        order: categoryOrder,
        items: []
      };
    }

    const itemName = map['item_name'] !== undefined ? String(row[map['item_name']] || '').trim() : '';
    const itemId = map['item_id'] !== undefined ? String(row[map['item_id']] || '').trim() : '';
    if (itemName) {
      sectionsById[sectionId].items.push({
        id: itemId || String(row[map['id']] || '').trim() || makePrepId_('item'),
        text: itemName,
        checked: map['checked'] !== undefined ? normalizePrepBool_(row[map['checked']]) : false,
        checkedAt: map['checked_at'] !== undefined ? String(row[map['checked_at']] || '') : '',
        order: map['sort_order'] !== undefined ? parseInt(row[map['sort_order']], 10) || 0 : 0
      });
    }

    const rowUpdatedAt = map['updated_at'] !== undefined ? String(row[map['updated_at']] || '') : '';
    if (rowUpdatedAt && rowUpdatedAt > maxUpdatedAt) maxUpdatedAt = rowUpdatedAt;
  });

  const sections = Object.values(sectionsById)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(section => ({
      id: section.id,
      title: section.title,
      emoji: section.emoji,
      owner: resolvedOwner,
      items: section.items
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(item => ({ id: item.id, text: item.text, checked: item.checked, checkedAt: item.checkedAt }))
    }));

  return { status: 'success', tripId: resolvedTripId, tripName: resolvedTripName, owner: resolvedOwner, sections: sections, updatedAt: maxUpdatedAt || new Date().toISOString() };
}

function handlePrepChecklistMutation_(ss, contents) {
  const action = String(contents.action || '');

  if (action === 'prep_checklist_save') {
    return {
      status: 'error',
      message: 'prep_checklist_save is disabled. Use prep_category_add/edit/delete and prep_item_add/edit/check/delete instead.'
    };
  }

  if (action === 'prep_checklist_get') {
    return getPrepChecklist_(ss, contents.tripId || '', contents.tripName || '', contents.owner || '');
  }

  const ctx = getPrepContext_(ss, contents || {});

  if (action === 'prep_category_add') return prepCategoryAdd_(ctx, contents);
  if (action === 'prep_category_edit') return prepCategoryEdit_(ctx, contents);
  if (action === 'prep_category_delete') return prepCategoryDelete_(ctx, contents);
  if (action === 'prep_item_add') return prepItemAdd_(ctx, contents);
  if (action === 'prep_item_edit') return prepItemEdit_(ctx, contents);
  if (action === 'prep_item_check') return prepItemCheck_(ctx, contents);
  if (action === 'prep_item_delete') return prepItemDelete_(ctx, contents);
  if (action === 'prep_checks_clear') return prepChecksClear_(ctx, contents);
  if (action === 'prep_all_delete') return prepAllDelete_(ctx, contents);

  return { status: 'error', message: 'unknown prep action: ' + action };
}

function withPrepResult_(ctx, extra) {
  const out = getPrepChecklist_(ctx.ss, ctx.tripId, ctx.tripName, ctx.owner);
  Object.keys(extra || {}).forEach(k => out[k] = extra[k]);
  out.status = 'success';
  out.updatedAt = new Date().toISOString();
  return out;
}

function prepCategoryAdd_(ctx, contents) {
  const categoryId = String(contents.categoryId || contents.id || makePrepId_('section')).trim();
  const category = String(contents.category || contents.categoryName || contents.title || '').trim();
  const emoji = String(contents.categoryEmoji || contents.emoji || '').trim();
  const categoryOrder = parseInt(contents.sortOrder || contents.categoryOrder, 10) || countPrepCategories_(ctx) + 1;
  if (!categoryId) throw new Error('missing categoryId');
  if (!category) throw new Error('missing category');

  const rows = findPrepCategoryRows_(ctx, categoryId);
  if (rows.length) {
    rows.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
      category: category,
      category_emoji: emoji,
      category_order: categoryOrder,
      owner: ctx.owner,
      updated_at: ctx.now
    }));
    return withPrepResult_(ctx, { action: 'prep_category_add', updatedCategoryId: categoryId, mode: 'updated_existing' });
  }

  appendPrepCategoryPlaceholder_(ctx, categoryId, category, emoji, categoryOrder);
  return withPrepResult_(ctx, { action: 'prep_category_add', addedCategoryId: categoryId });
}

function prepCategoryEdit_(ctx, contents) {
  const categoryId = String(contents.categoryId || contents.id || '').trim();
  const category = String(contents.category || contents.categoryName || contents.title || '').trim();
  const emoji = String(contents.categoryEmoji || contents.emoji || '').trim();
  if (!categoryId) throw new Error('missing categoryId');
  if (!category) throw new Error('missing category');

  const rows = findPrepCategoryRows_(ctx, categoryId);
  if (!rows.length) throw new Error('category not found');
  rows.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
    category: category,
    category_emoji: emoji,
    owner: ctx.owner,
    updated_at: ctx.now
  }));
  return withPrepResult_(ctx, { action: 'prep_category_edit', updatedCategoryId: categoryId, updatedRows: rows.length });
}

function prepCategoryDelete_(ctx, contents) {
  const categoryId = String(contents.categoryId || contents.id || '').trim();
  if (!categoryId) throw new Error('missing categoryId');
  const rows = findPrepCategoryRows_(ctx, categoryId);
  rows.sort((a, b) => b.rowNumber - a.rowNumber).forEach(entry => ctx.sheet.deleteRow(entry.rowNumber));
  return withPrepResult_(ctx, { action: 'prep_category_delete', deletedCategoryId: categoryId, deletedRows: rows.length });
}

function prepItemAdd_(ctx, contents) {
  const categoryId = String(contents.categoryId || '').trim();
  const itemId = String(contents.itemId || contents.id || makePrepId_('item')).trim();
  const itemName = String(contents.itemName || contents.text || contents.name || '').trim();
  if (!categoryId) throw new Error('missing categoryId');
  if (!itemId) throw new Error('missing itemId');
  if (!itemName) throw new Error('missing itemName');

  const categoryMeta = getPrepCategoryMeta_(ctx, categoryId);
  if (!categoryMeta) throw new Error('category not found');

  const existing = findPrepItemRows_(ctx, itemId);
  const sortOrder = parseInt(contents.sortOrder, 10) || countPrepItemsInCategory_(ctx, categoryId) + 1;
  if (existing.length) {
    existing.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
      item_name: itemName,
      sort_order: sortOrder,
      owner: ctx.owner,
      updated_at: ctx.now
    }));
    return withPrepResult_(ctx, { action: 'prep_item_add', updatedItemId: itemId, mode: 'updated_existing' });
  }

  const row = buildPrepRow_(ctx.headers, ctx.map, {
    id: itemId,
    trip_id: ctx.tripId,
    trip_name: ctx.tripName,
    owner: ctx.owner,
    category_id: categoryId,
    category: categoryMeta.category,
    category_emoji: categoryMeta.categoryEmoji,
    category_order: categoryMeta.categoryOrder || 1,
    item_id: itemId,
    item_name: itemName,
    checked: 'FALSE',
    sort_order: sortOrder,
    checked_at: '',
    created_at: ctx.now,
    updated_at: ctx.now,
    assignee: ''
  });
  ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, 1, ctx.headers.length).setValues([row]);
  return withPrepResult_(ctx, { action: 'prep_item_add', addedItemId: itemId });
}

function prepItemEdit_(ctx, contents) {
  const itemId = String(contents.itemId || contents.id || '').trim();
  const itemName = String(contents.itemName || contents.text || contents.name || '').trim();
  if (!itemId) throw new Error('missing itemId');
  if (!itemName) throw new Error('missing itemName');

  const rows = findPrepItemRows_(ctx, itemId).filter(entry => getPrepItemNameFromRow_(entry.row, ctx.map));
  if (!rows.length) throw new Error('item not found');
  rows.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
    item_name: itemName,
    owner: ctx.owner,
    updated_at: ctx.now
  }));
  return withPrepResult_(ctx, { action: 'prep_item_edit', updatedItemId: itemId, updatedRows: rows.length });
}

function prepItemCheck_(ctx, contents) {
  const itemId = String(contents.itemId || contents.id || '').trim();
  if (!itemId) throw new Error('missing itemId');
  const checked = normalizePrepBool_(contents.checked);

  const rows = findPrepItemRows_(ctx, itemId).filter(entry => getPrepItemNameFromRow_(entry.row, ctx.map));
  if (!rows.length) throw new Error('item not found');
  rows.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
    checked: checked ? 'TRUE' : 'FALSE',
    checked_at: checked ? ctx.now : '',
    owner: ctx.owner,
    updated_at: ctx.now
  }));
  return withPrepResult_(ctx, { action: 'prep_item_check', updatedItemId: itemId, checked: checked, updatedRows: rows.length });
}

function prepItemDelete_(ctx, contents) {
  const itemId = String(contents.itemId || contents.id || '').trim();
  if (!itemId) throw new Error('missing itemId');

  const rows = findPrepItemRows_(ctx, itemId).filter(entry => getPrepItemNameFromRow_(entry.row, ctx.map));
  let categoryMeta = null;
  if (rows.length) {
    const row = rows[0].row;
    const categoryId = getPrepCategoryIdFromRow_(row, ctx.map);
    categoryMeta = getPrepCategoryMeta_(ctx, categoryId) || {
      categoryId: categoryId,
      category: ctx.map['category'] !== undefined ? String(row[ctx.map['category']] || '').trim() : '未命名分類',
      categoryEmoji: ctx.map['category_emoji'] !== undefined ? String(row[ctx.map['category_emoji']] || '').trim() : '',
      categoryOrder: ctx.map['category_order'] !== undefined ? parseInt(row[ctx.map['category_order']], 10) || 1 : 1
    };
  }

  rows.sort((a, b) => b.rowNumber - a.rowNumber).forEach(entry => ctx.sheet.deleteRow(entry.rowNumber));
  if (categoryMeta) ensurePrepCategoryPlaceholderIfEmpty_(ctx, categoryMeta);
  return withPrepResult_(ctx, { action: 'prep_item_delete', deletedItemId: itemId, deletedRows: rows.length });
}

function prepChecksClear_(ctx, contents) {
  const rows = getPrepAllRows_(ctx.sheet).filter(entry => isPrepContextRow_(ctx, entry.row) && getPrepItemNameFromRow_(entry.row, ctx.map));
  rows.forEach(entry => setPrepCells_(ctx.sheet, entry.rowNumber, ctx.map, {
    checked: 'FALSE',
    checked_at: '',
    updated_at: ctx.now
  }));
  return withPrepResult_(ctx, { action: 'prep_checks_clear', updatedRows: rows.length });
}

function prepAllDelete_(ctx, contents) {
  if (contents.confirmDeleteAll !== true) throw new Error('confirmDeleteAll required');
  const rows = getPrepAllRows_(ctx.sheet).filter(entry => isPrepContextRow_(ctx, entry.row));
  rows.sort((a, b) => b.rowNumber - a.rowNumber).forEach(entry => ctx.sheet.deleteRow(entry.rowNumber));
  return withPrepResult_(ctx, { action: 'prep_all_delete', deletedRows: rows.length });
}

function testPrepChecklistSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensurePrepChecklistSheet_(ss);
  Logger.log('prep checklist sheet ready: ' + sheet.getName());
}
