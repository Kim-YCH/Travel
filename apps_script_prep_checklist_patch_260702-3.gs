/************ PREP CHECKLIST PATCH 260702-3 ************
貼上方式：
1. 先把下方兩段 action 判斷加入原本的 handleActionGET / doPost。
2. 再把本檔案的 PREP CHECKLIST FUNCTIONS 整段貼到 Code.gs 最下方。

工作表名稱：prep_checklist
如果工作表已存在，程式會自動補齊缺少欄位。
********************************************************/

/************ 需要加到 handleActionGET(ss, action, type, e) 的前段 ************/
// if (action === 'prep_checklist_get') {
//   const tripId = getParam(e, 'tripId', '');
//   const tripName = getParam(e, 'tripName', '');
//   return getPrepChecklist_(ss, tripId, tripName);
// }

/************ 需要加到 doPost(e) 裡面，放在 if (!type) 之前 ************/
// if (action === 'prep_checklist_save') {
//   return createJSONPOutput(savePrepChecklist_(ss, contents), '');
// }

/************ PREP CHECKLIST FUNCTIONS ************/
const PREP_CHECKLIST_SHEET_NAME = 'prep_checklist';
const PREP_CHECKLIST_HEADERS = [
  'id',
  'trip_id',
  'trip_name',
  'category_id',
  'category',
  'category_emoji',
  'category_order',
  'item_id',
  'item_name',
  'checked',
  'sort_order',
  'checked_at',
  'created_at',
  'updated_at'
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
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function getPrepHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headersRaw.map(h => String(h).toLowerCase().trim());
  const map = {};
  headers.forEach((h, i) => {
    if (h) map[h] = i;
  });
  return { headers, map };
}

function makePrepId_(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

function normalizePrepBool_(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'v' || s === 'yes' || s === 'y' || s === 'checked';
}

function resolvePrepTripId_(ss, tripId, tripName) {
  if (tripId) return String(tripId);
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
    if (String(values[i][nameCol]).trim() === name) {
      return String(values[i][idCol]).trim();
    }
  }
  return '';
}

function getPrepChecklist_(ss, tripId, tripName) {
  const sheet = ensurePrepChecklistSheet_(ss);
  const resolvedTripId = resolvePrepTripId_(ss, tripId, tripName);
  const resolvedTripName = String(tripName || '').trim();

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      status: 'success',
      tripId: resolvedTripId,
      tripName: resolvedTripName,
      sections: [],
      updatedAt: new Date().toISOString()
    };
  }

  const { map } = getPrepHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const matched = values.filter(row => {
    const rowTripId = map['trip_id'] !== undefined ? String(row[map['trip_id']] || '').trim() : '';
    const rowTripName = map['trip_name'] !== undefined ? String(row[map['trip_name']] || '').trim() : '';
    if (resolvedTripId) return rowTripId === resolvedTripId;
    return resolvedTripName && rowTripName === resolvedTripName;
  });

  const sectionsById = {};
  let maxUpdatedAt = '';

  matched.forEach((row, idx) => {
    const sectionId = String(row[map['category_id']] || '').trim() || makePrepId_('section');
    const category = String(row[map['category']] || '').trim();
    if (!category) return;

    const categoryOrder = map['category_order'] !== undefined
      ? parseInt(row[map['category_order']], 10) || 0
      : idx + 1;

    if (!sectionsById[sectionId]) {
      sectionsById[sectionId] = {
        id: sectionId,
        title: category,
        emoji: String(row[map['category_emoji']] || '🧳').trim() || '🧳',
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
      items: section.items
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(item => ({
          id: item.id,
          text: item.text,
          checked: item.checked,
          checkedAt: item.checkedAt
        }))
    }));

  return {
    status: 'success',
    tripId: resolvedTripId,
    tripName: resolvedTripName,
    sections: sections,
    updatedAt: maxUpdatedAt || new Date().toISOString()
  };
}

function savePrepChecklist_(ss, contents) {
  const sheet = ensurePrepChecklistSheet_(ss);
  const { headers, map } = getPrepHeaderMap_(sheet);

  const tripId = resolvePrepTripId_(ss, contents.tripId || '', contents.tripName || '');
  const tripName = String(contents.tripName || '').trim();
  if (!tripId && !tripName) throw new Error('prep checklist missing tripId/tripName');

  const data = contents.data || {};
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const now = new Date().toISOString();

  // 刪除同旅程舊資料，避免重複。
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      const rowTripId = map['trip_id'] !== undefined ? String(row[map['trip_id']] || '').trim() : '';
      const rowTripName = map['trip_name'] !== undefined ? String(row[map['trip_name']] || '').trim() : '';
      const match = tripId ? rowTripId === tripId : rowTripName === tripName;
      if (match) sheet.deleteRow(i + 2);
    }
  }

  const rows = [];
  sections.forEach((section, sectionIndex) => {
    const sectionId = String(section.id || '').trim() || makePrepId_('section');
    const category = String(section.title || '').trim();
    if (!category) return;

    const emoji = String(section.emoji || '🧳').trim() || '🧳';
    const items = Array.isArray(section.items) ? section.items : [];

    if (items.length === 0) {
      rows.push(buildPrepRow_(headers, map, {
        id: sectionId,
        trip_id: tripId,
        trip_name: tripName,
        category_id: sectionId,
        category: category,
        category_emoji: emoji,
        category_order: sectionIndex + 1,
        item_id: '',
        item_name: '',
        checked: '',
        sort_order: '',
        checked_at: '',
        created_at: now,
        updated_at: now
      }));
      return;
    }

    items.forEach((item, itemIndex) => {
      const itemName = String(item.text || '').trim();
      if (!itemName) return;
      const itemId = String(item.id || '').trim() || makePrepId_('item');
      rows.push(buildPrepRow_(headers, map, {
        id: itemId,
        trip_id: tripId,
        trip_name: tripName,
        category_id: sectionId,
        category: category,
        category_emoji: emoji,
        category_order: sectionIndex + 1,
        item_id: itemId,
        item_name: itemName,
        checked: item.checked ? 'TRUE' : 'FALSE',
        sort_order: itemIndex + 1,
        checked_at: item.checkedAt || '',
        created_at: now,
        updated_at: now
      }));
    });
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return {
    status: 'success',
    saved: rows.length,
    tripId: tripId,
    tripName: tripName,
    updatedAt: now
  };
}

function buildPrepRow_(headers, map, obj) {
  const row = new Array(headers.length).fill('');
  Object.keys(obj).forEach(key => {
    const col = map[String(key).toLowerCase()];
    if (col !== undefined) row[col] = obj[key];
  });
  return row;
}
