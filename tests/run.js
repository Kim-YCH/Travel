/**
 * Travel 前端驗證腳本（無外部相依，直接 `node tests/run.js`）
 *
 * 1. 語法檢查所有前端 JS。
 * 2. 純模組單元測試（行程模型、交通 envelope、旅館、費用、錢包、工具）。
 * 3. 在 stub 環境實際執行 app.js 的 setup()，抓出搬移後的未定義參照。
 * 4. 比對 index.html 模板用到的識別字是否都由 setup() 提供。
 * 5. 檢查靜態資源 query string 版本號與 config.js 是否一致。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const ok = (label) => console.log('  PASS  ' + label);
const bad = (label, detail) => { failures++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); };
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  g === w ? ok(label) : bad(label, `got=${g}\n        want=${w}`);
};
const section = (t) => console.log('\n' + t);

// 與 index.html 的載入順序一致
const MODULE_FILES = [
  'js/utils.js', 'js/api.js', 'js/cache.js', 'js/maps.js', 'js/places.js',
  'js/itinerary.js', 'js/hotels.js', 'js/expenses.js', 'js/weather.js'
];

/* ------------------------------------------------------------------ 1. 語法 */
section('1. 語法檢查');
for (const f of [...MODULE_FILES, 'app.js', 'config.js', 'cache-refresh.js', 'keyword-map.js', 'search-zh-label.js', 'prep-checklist.js']) {
  try { new vm.Script(read(f), { filename: f }); ok(f); }
  catch (e) { bad(f, e.message); }
}

/* ------------------------------------------------------- stub 環境 + 載入模組 */
const makeEl = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
  setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null, parentNode: null
});
const makeDocument = () => ({
  createElement: makeEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  head: makeEl(), body: makeEl(), addEventListener() {}, removeEventListener() {}, hidden: false, readyState: 'complete'
});

function makeWindow() {
  const store = new Map();
  const document = makeDocument();
  const win = {
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'http://localhost/', search: '' },
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    open: () => null, alert() {}, confirm: () => true,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    TRAVEL_CONFIG: { API_URL: 'https://example.test/exec', GOOGLE_MAPS_API_KEY: 'k', APP_VERSION: 'test' }
  };
  win.window = win;
  return win;
}

const win = makeWindow();
for (const f of MODULE_FILES) new Function('window', 'document', read(f))(win, win.document);

const U = win.TravelUtils, I = win.TravelItinerary, H = win.TravelHotels,
      E = win.TravelExpenses, M = win.TravelMaps, W = win.TravelWeather;

/* --------------------------------------------------------- 2. 模組單元測試 */
section('2. 行程模型與交通 envelope');
const msg = I.serializeItineraryMessage('交通', '記得帶護照', { mode: '飛機', number: 'BR157', terminal: 'T1', seat: '32A', checkin: '2h' });
eq('envelope 前綴', msg.startsWith('[[TRAVEL_TRANSPORT_V1:'), true);
const parsed = I.parseItineraryMessage(msg);
eq('round-trip 班次', parsed.transport.number, 'BR157');
eq('round-trip 航廈', parsed.transport.terminal, 'T1');
eq('round-trip 保留舊欄位 seat', parsed.transport.seat, '32A');
eq('round-trip 備註', parsed.note, '記得帶護照');
eq('非交通不包 envelope', I.serializeItineraryMessage('景點', '純備註', { number: 'X' }), '純備註');
eq('交通但無明細', I.serializeItineraryMessage('交通', 'abc', {}), 'abc');
eq('舊純文字訊息', I.parseItineraryMessage('舊的純文字').note, '舊的純文字');
eq('壞掉的 envelope 不丟例外', I.parseItineraryMessage('[[TRAVEL_TRANSPORT_V1:%%%]]').note, '[[TRAVEL_TRANSPORT_V1:%%%]]');
eq('交通摘要只有班次與航廈', I.getTransportSummary({ type: '交通', message: msg }), ['BR157', 'T1']);
eq('資訊列組合', I.getItineraryInfoText({ type: '交通', message: msg }), 'BR157 · T1｜記得帶護照');

section('3. 行程分類');
eq('別名 早餐→美食', I.normalizeItineraryType('早餐'), '美食');
eq('既有類型直通', I.normalizeItineraryType('購物'), '購物');
eq('空值預設景點', I.normalizeItineraryType(''), '景點');
eq('未知歸其他', I.normalizeItineraryType('亂七八糟'), '其他');
eq('ITINERARY_TYPES', I.ITINERARY_TYPES, ['景點', '交通', '購物', '活動', '美食', '其他']);
eq('tone hotel', I.getItineraryTypeTone({ name: '東橫INN hotel' }), 'hotel');
eq('tone cafe', I.getItineraryTypeTone({ name: '星巴克 coffee' }), 'cafe');
eq('icon 美食', I.getItineraryIcon({ type: '美食' }), '🍜');
eq('分類標籤', I.getItineraryCategoryLabel({ type: '購物' }), '購物');

section('4. 備案旗標與排序');
eq('大寫 V 視為備案', I.getAlternativeFlag({ is_alternative: 'V' }), 'v');
eq('中文欄位名', I.getAlternativeFlag({ 是否為備案: 'v' }), 'v');
eq('空字串非備案', I.getAlternativeFlag({ is_alternative: '' }), '');
eq('isAlternativeItem', I.isAlternativeItem({ is_alternative: 'v' }), true);
eq('order 空值→null', I.normalizeOrderValue(''), null);
eq('order 0→null', I.normalizeOrderValue(0), null);
eq('order 字串轉數字', I.normalizeOrderValue('3'), 3);
eq('行程記錄正規化', I.normalizeItineraryRecord({ day: '2', order: '5', type: '早餐', lat: '35.6', lng: '', is_alternative: 'v' }),
  { day: 2, order: 5, type: '美食', lat: 35.6, lng: null, is_alternative: 'v' });

section('5. 旅館');
eq('旅館記錄正規化', H.normalizeHotelRecord({ start_day: '2', end_day: '4', lat: '', lng: '139.7', name: ' 東京旅店 ', address: '', place_id: '' }),
  { start_day: 2, end_day: 4, lat: null, lng: 139.7, name: '東京旅店', address: '', place_id: '' });
eq('入住日在範圍內', H.isHotelActiveOnDay({ start_day: 2, end_day: 4 }, 3), true);
eq('入住日在範圍外', H.isHotelActiveOnDay({ start_day: 2, end_day: 4 }, 5), false);
eq('起訖顛倒仍正確', H.isHotelActiveOnDay({ start_day: 4, end_day: 2 }, 3), true);
eq('單日標籤', H.hotelDayRangeLabel({ start_day: 3, end_day: 3 }), 'Day 3');
eq('跨日標籤', H.hotelDayRangeLabel({ start_day: 5, end_day: 2 }), 'Day 2 ~ Day 5');
const hotelList = [{ id: 'a', start_day: 1, end_day: 3 }, { id: 'b', start_day: 5, end_day: 6 }];
eq('重疊', H.hasHotelOverlap(hotelList, 3, 4), true);
eq('不重疊', H.hasHotelOverlap(hotelList, 4, 4), false);
eq('排除自己', H.hasHotelOverlap(hotelList, 1, 3, 'a'), false);
eq('空清單', H.hasHotelOverlap([], 1, 3), false);

section('6. 費用與共同錢包');
eq('involved 陣列', E.normalizeInvolved(['a', '', 'b']), ['a', 'b']);
eq('involved 逗號字串', E.normalizeInvolved('a, b ,'), ['a', 'b']);
eq('involved 空值', E.normalizeInvolved(null), []);
eq('formatInvolved 空→全員', E.formatInvolved([]), '全員');
eq('formatInvolved 列名', E.formatInvolved(['小明', '小華']), '小明, 小華');
eq('費用記錄正規化', E.normalizeExpenseRecord({ amount: '250', day: '3', involved: 'a,b', category: '', payer: '' }),
  { amount: 250, day: 3, involved: ['a', 'b'], category: '其他', payer: '' });
eq('錢包人員 JSON 陣列字串', E.normalizeSharedWalletPeople('["小明","小華"]'), ['小明', '小華']);
eq('錢包人員去重', E.normalizeSharedWalletPeople(['小明', '小明', ' 小華 ']), ['小明', '小華']);
eq('錢包人員空值', E.normalizeSharedWalletPeople(''), []);
eq('公帳視為系統人員', E.isSystemWalletPerson({ name: '公帳' }), true);
eq('role 判定', E.isSystemWalletPerson({ name: 'x', role: 'public_wallet' }), true);
eq('一般旅伴', E.isSystemWalletPerson({ name: '小明' }), false);
eq('過濾掉公帳', E.filterActualPeople([{ name: '小明' }, { name: '公帳' }]), [{ name: '小明' }]);
eq('舊公帳費用 payer', E.isLegacyPublicAccountExpense({ payer: '公帳' }), true);
eq('舊公帳費用 title', E.isLegacyPublicAccountExpense({ title: '存入公費' }), true);
eq('一般費用非公帳', E.isLegacyPublicAccountExpense({ payer: '小明', category: '飲食' }), false);
eq('boolean flag v', E.parseBooleanFlag('v'), true);
eq('boolean flag TRUE', E.parseBooleanFlag('TRUE'), true);
eq('boolean flag 空', E.parseBooleanFlag(''), false);
eq('錢包交易正規化', E.normalizeSharedWalletTransaction({ id: 1, trip_id: 't', type: ' DEPOSIT ', date: '2026-07-20T00:00:00Z', title: ' 存入 ', person: ['小明', '小明'], amount: '500', category: '', note: '' }),
  { id: '1', trip_id: 't', type: 'deposit', date: '2026-07-20', title: '存入', person: '小明', amount: 500, category: '其他', note: '' });
eq('錢包使用者顯示', E.formatSharedWalletUsers({ person: '小明,小華' }), '小明、小華使用');
eq('錢包無指定人', E.formatSharedWalletUsers({ person: '' }), '所有人分攤');
eq('費用建立時間取自 id', E.expenseCreatedTime({ id: '1700000000000_123' }), 1700000000000);

section('7. 工具函式');
eq('escapeHtml', U.escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
eq('linkify 逸出後再轉連結', U.linkifyMessage('看 https://a.test/b 這個'),
  '📝 看 <a href="https://a.test/b" target="_blank" rel="noopener noreferrer">https://a.test/b</a> 這個');
eq('linkify 換行', U.linkifyMessage('a\nb'), '📝 a<br>b');
eq('linkify 空值', U.linkifyMessage(''), '');
eq('linkify 不讓 HTML 注入', U.linkifyMessage('<script>x</script>').includes('<script>'), false);
eq('formatTime HH:MM 直通', U.formatTime('09:30'), '09:30');
eq('formatTime 空值', U.formatTime(''), '');
eq('formatTime 非時間字串原樣回傳', U.formatTime('待定'), '待定');
eq('timeToNum', U.timeToNum('09:30'), 570);
eq('timeToNum 無效值排最後', U.timeToNum(''), 999999);
eq('pad2', U.pad2(7), '07');
eq('toYMD', U.toYMD(new Date(2026, 6, 20)), '2026-07-20');
eq('parseYMD 無效', U.parseYMD('bad'), null);
eq('addDays', U.toYMD(U.addDays(U.parseYMD('2026-07-30'), 3)), '2026-08-02');

section('8. 地圖 pin 與天氣');
eq('hex 補齊三碼', M.normalizeHexColor('#abc'), '#aabbcc');
eq('hex 無效用 fallback', M.normalizeHexColor('nope'), '#ef4444');
eq('hex 自訂 fallback', M.normalizeHexColor('', '#0d9488'), '#0d9488');
eq('shade 變亮不溢位', M.shadeHexColor('#ffffff', 50), '#ffffff');
eq('shade 變暗不負值', M.shadeHexColor('#000000', -50), '#000000');
eq('shade 一般情況', M.shadeHexColor('#808080', 16), '#909090');
eq('無 google SDK 時回 null', M.makeMapPinIcon('#ef4444'), null);
eq('天氣代碼 0', W.weatherCodeInfo(0).text, '晴朗');
eq('天氣代碼 95', W.weatherCodeInfo(95).text, '雷雨');
eq('天氣代碼未知', W.weatherCodeInfo(999).text, '天氣');
eq('UV 低', W.uvLevelLabel(1), '低');
eq('UV 危險', W.uvLevelLabel(12), '危險');
eq('UV 非數字', W.uvLevelLabel('x'), '');

/* ------------------------------------------------- 9. 實際執行 app.js setup() */
section('9. app.js setup() 實跑');
const appWin = makeWindow();
for (const f of MODULE_FILES) new Function('window', 'document', read(f))(appWin, appWin.document);

let bindings = null;
const Vue = {
  ref: (v) => ({ value: v }),
  computed: (fn) => ({ get value() { return fn(); } }),
  watch() {}, onMounted() {}, onBeforeUnmount() {},
  nextTick: () => Promise.resolve(),
  createApp: (opts) => ({ mount() { bindings = opts.setup(); } })
};
try {
  new Function('window', 'document', 'Vue', 'Sortable', 'localStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', read('app.js'))(
    appWin, appWin.document, Vue, function () { return { destroy() {} }; },
    appWin.localStorage, setTimeout, clearTimeout, setInterval, clearInterval
  );
} catch (e) {
  bad('setup() 執行', e.constructor.name + ': ' + e.message);
}
if (bindings) {
  ok(`setup() 執行完成，對外提供 ${Object.keys(bindings).length} 個綁定`);
  const undef = Object.keys(bindings).filter((k) => bindings[k] === undefined);
  undef.length ? bad('有未定義的綁定', undef.join(', ')) : ok('沒有未定義的綁定');
}

/* --------------------------------------- 10. index.html 模板綁定是否都存在 */
section('10. 模板綁定覆蓋率');
if (bindings) {
  const html = read('index.html');
  const exprs = [];
  for (const m of html.matchAll(/\{\{([^}]*)\}\}/g)) exprs.push(m[1]);
  for (const m of html.matchAll(/\s(?::|v-bind:|@|v-on:|v-if|v-else-if|v-show|v-model|v-for|v-html|v-text)[\w.:-]*\s*=\s*"([^"]*)"/g)) exprs.push(m[1]);

  // v-for 會引入區域變數，先收集起來排除
  const localNames = new Set();
  for (const m of html.matchAll(/v-for\s*=\s*"\s*\(?([^)]*?)\)?\s+(?:in|of)\s/g)) {
    m[1].split(',').forEach((n) => { const t = n.trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) localNames.add(t); });
  }

  const RESERVED = new Set(['true', 'false', 'null', 'undefined', 'new', 'typeof', 'instanceof', 'in', 'of', 'return', 'void', 'delete',
    'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'console', 'window',
    '$event', '$refs', '$el', 'item', 'index', 'key', 'e', 'event']);

  const referenced = new Set();
  for (const raw of exprs) {
    const noStrings = raw.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
    // 物件字面值的 key（{ active: x }、{ width: y }）不是變數參照
    const noKeys = noStrings.replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1');
    for (const m of noKeys.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)/g)) {
      const name = m[2];
      if (!RESERVED.has(name) && !localNames.has(name)) referenced.add(name);
    }
  }
  const missing = [...referenced].filter((n) => !(n in bindings)).sort();
  eq('模板參照數量 > 0', referenced.size > 0, true);
  missing.length
    ? bad(`模板用到但 setup() 未提供 ${missing.length} 個識別字`, missing.join(', '))
    : ok(`模板引用的 ${referenced.size} 個識別字全部由 setup() 提供`);
}

/* ------------------------------------------------------------ 11. 版本一致性 */
section('11. 靜態資源版本一致性');
const version = (read('config.js').match(/APP_VERSION:\s*'([^']+)'/) || [])[1];
if (!version) bad('讀不到 config.js 的 APP_VERSION');
else {
  ok('config.js APP_VERSION = ' + version);
  const html = read('index.html');
  const wrong = [];
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"?]+)\?v=([^"]+)"/g)) {
    if (m[2] !== version) wrong.push(`${m[1]} -> ${m[2]}`);
  }
  wrong.length
    ? bad(`index.html 有 ${wrong.length} 個資源版本號不符`, wrong.join('\n        '))
    : ok('index.html 所有資源 query string 版本一致');
}

/* ------------------------------------------------------------------- 總結 */
console.log('\n' + (failures ? `✗ ${failures} 項失敗` : '✓ 全部通過'));
process.exit(failures ? 1 : 0);
