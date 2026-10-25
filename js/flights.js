(function (window) {
  'use strict';

  const text = value => String(value == null ? '' : value).trim();
  const countryGroups = {
    KR: 'seoul busan jeju incheon daegu daejeon gwangju suwon gangwon gyeongju',
    JP: 'tokyo osaka kyoto fukuoka hokkaido sapporo otaru nagoya yokohama kobe nara okinawa sendai hiroshima kumamoto nagasaki hakone kawaguchiko fuji kanazawa',
    HK: 'hongkong', MO: 'macau', TW: 'taipei taichung tainan kaohsiung hualien taitung'
  };
  const countries = {
    TW: ['台灣', '臺灣', '台湾', 'Taiwan', '新北', '桃園', '桃园', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '云林', '嘉義', '嘉义', '屏東', '屏东', '宜蘭', '宜兰', '澎湖', '金門', '金门', '馬祖', '马祖', '綠島', '蘭嶼', '小琉球', 'New Taipei', 'Taoyuan', 'Keelung', 'Hsinchu', 'Miaoli', 'Changhua', 'Nantou', 'Yunlin', 'Chiayi', 'Pingtung', 'Yilan', 'Penghu', 'Kinmen', 'Matsu'],
    JP: ['日本', 'Japan'], KR: ['韓國', '韩国', '南韓', 'South Korea', '대한민국', '한국'],
    HK: ['香港'], MO: ['澳門', '澳门'], CN: ['中國', '中国', '上海', '北京', 'China', 'Shanghai', 'Beijing'],
    SG: ['新加坡', 'Singapore'], TH: ['泰國', '泰国', '曼谷', 'Bangkok', 'Thailand'],
    VN: ['越南', '河內', '胡志明', 'Vietnam', 'Hanoi'], MY: ['馬來西亞', '吉隆坡', 'Malaysia', 'Kuala Lumpur'],
    FR: ['法國', '法国', '巴黎', 'France', 'Paris'], GB: ['英國', '英国', '倫敦', 'London', 'United Kingdom'],
    US: ['美國', '美国', '紐約', '洛杉磯', 'New York', 'Los Angeles', 'United States'], AU: ['澳洲', '雪梨', 'Sydney', 'Australia']
  };
  for (const [code, keys] of Object.entries(countryGroups)) {
    for (const key of keys.split(' ')) countries[code].push(...(window.TravelIcons?.TRIP_DESTINATION_ICON_MAP[key]?.keywords || []));
  }
  const cleanCity = value => text(value).normalize('NFKC').toLowerCase();
  const keywordMatches = (source, keyword) => {
    const escaped = cleanCity(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    return new RegExp(/[a-z]/i.test(keyword) ? '(?:^|[^a-z])' + escaped + '(?=$|[^a-z])' : escaped, 'iu').test(source);
  };
  const countryFromCity = city => {
    const source = cleanCity(city);
    const matches = source ? Object.keys(countries).filter(code => countries[code].some(word => keywordMatches(source, word))) : [];
    const countryCode = matches.length === 1 ? matches[0] : '';
    return { countryCode, eligible: Boolean(countryCode && countryCode !== 'TW'), source: countryCode ? 'dictionary' : 'unknown', reason: matches.length > 1 ? 'conflicting-countries' : countryCode ? '' : 'unresolved-city' };
  };
  const createCountryResolver = ({ read = () => null, write = () => {}, geocode = async () => '', now = Date.now } = {}) => {
    const pending = new Map();
    return async city => {
      const known = countryFromCity(city);
      if (known.countryCode || !cleanCity(city)) return known;
      const key = 'travel_flight_country_v1:' + cleanCity(city);
      let cached;
      try { cached = read(key); } catch (_) {}
      const code = text(cached?.countryCode);
      const age = now() - Number(cached?.ts);
      if (cached && age >= 0 && age < (code ? 30 * 86400000 : 10 * 60000) && (!code || /^[A-Z]{2}$/.test(code))) {
        return { countryCode: code, eligible: Boolean(code && code !== 'TW'), source: 'cache', reason: code ? '' : 'unresolved-city' };
      }
      if (pending.has(key)) return pending.get(key);
      const request = (async () => {
        let countryCode = '';
        try { countryCode = text(await geocode(text(city))).toUpperCase(); } catch (_) {}
        if (!/^[A-Z]{2}$/.test(countryCode)) countryCode = '';
        try { write(key, { countryCode, ts: now() }); } catch (_) {}
        return { countryCode, eligible: Boolean(countryCode && countryCode !== 'TW'), source: countryCode ? 'geocoder' : 'unknown', reason: countryCode ? '' : 'unresolved-city' };
      })();
      pending.set(key, request);
      try { return await request; } finally { pending.delete(key); }
    };
  };

  const AIRPORT_ZONES = Object.freeze({
    'Asia/Taipei': 'TPE TSA KHH RMQ HUN TTT MZG KNH MFK LZN',
    'Asia/Tokyo': 'KIX ITM UKB NRT HND FUK CTS OKA NGO HIJ SDJ KMQ TAK KOJ KMJ NGS OIT FSZ OKJ',
    'Asia/Seoul': 'ICN GMP PUS CJU TAE CJJ KWJ MWX',
    'Asia/Hong_Kong': 'HKG', 'Asia/Macau': 'MFM', 'Asia/Shanghai': 'PEK PKX PVG SHA CAN SZX CTU TFU',
    'Asia/Singapore': 'SIN', 'Asia/Kuala_Lumpur': 'KUL BKI PEN',
    'Asia/Bangkok': 'BKK DMK HKT CNX', 'Asia/Ho_Chi_Minh': 'HAN SGN DAD',
    'Asia/Manila': 'MNL CEB', 'Asia/Jakarta': 'CGK', 'Asia/Makassar': 'DPS',
    'Asia/Dubai': 'DXB AUH', 'Asia/Qatar': 'DOH', 'Asia/Kolkata': 'DEL BOM',
    'Europe/London': 'LHR LGW STN MAN EDI', 'Europe/Paris': 'CDG ORY',
    'Europe/Berlin': 'FRA MUC BER', 'Europe/Amsterdam': 'AMS', 'Europe/Rome': 'FCO MXP',
    'Europe/Zurich': 'ZRH', 'Europe/Helsinki': 'HEL', 'Europe/Istanbul': 'IST',
    'America/New_York': 'JFK EWR LGA BOS IAD MIA ATL', 'America/Los_Angeles': 'LAX SFO SEA LAS',
    'America/Chicago': 'ORD DFW IAH', 'America/Denver': 'DEN', 'America/Phoenix': 'PHX',
    'Pacific/Honolulu': 'HNL', 'America/Anchorage': 'ANC',
    'America/Vancouver': 'YVR', 'America/Toronto': 'YYZ',
    'Australia/Sydney': 'SYD', 'Australia/Melbourne': 'MEL', 'Australia/Brisbane': 'BNE',
    'Australia/Perth': 'PER', 'Pacific/Auckland': 'AKL CHC'
  });
  const AIRPORT_LABELS = Object.freeze({
    TPE: ['桃園國際機場', '桃園|桃园|taoyuan'], TSA: ['臺北松山機場', '松山機場|松山机场|taipei songshan'],
    KHH: ['高雄國際機場', '高雄|kaohsiung'], RMQ: ['臺中國際機場', '台中|臺中|taichung'],
    KIX: ['關西國際機場', '關西|关西|kansai'], ITM: ['大阪國際機場 伊丹', '伊丹|itami'],
    NRT: ['成田國際機場', '成田|narita'], HND: ['東京羽田機場', '羽田|haneda'],
    FUK: ['福岡機場', '福岡|福冈|fukuoka'], CTS: ['新千歲機場', '新千歲|新千歳|新千岁|new chitose'],
    OKA: ['那霸機場', '那霸|naha'], NGO: ['中部國際機場', '中部國際|中部国际|chubu'],
    HIJ: ['廣島機場', '廣島|広島|hiroshima'], ICN: ['仁川國際機場', '仁川|인천|incheon'],
    GMP: ['金浦國際機場', '金浦|김포|gimpo'], PUS: ['金海國際機場', '金海|김해|gimhae'],
    CJU: ['濟州國際機場', '濟州|济州|제주|jeju'], HKG: ['香港國際機場', '香港|hong kong'],
    MFM: ['澳門國際機場', '澳門|澳门|macau|macao'], SIN: ['樟宜機場', '樟宜|changi'],
    BKK: ['蘇凡納布機場', '蘇凡納布|素萬那普|suvarnabhumi'], DMK: ['廊曼機場', '廊曼|don mueang'],
    LHR: ['London Heathrow Airport', '希斯洛|heathrow'], JFK: ['John F. Kennedy International Airport', '甘迺迪|甘乃迪|john f. kennedy']
  });
  const airportEntries = Object.entries(AIRPORT_ZONES).flatMap(([timeZone, codes]) => codes.split(' ').map(code => ({ code, timeZone })));
  const resolveAirport = airport => {
    const source = text(airport).normalize('NFKC');
    const codes = airportEntries.filter(entry => new RegExp('(?:^|[^a-z])' + entry.code + '(?=$|[^a-z])', 'i').test(source));
    if (codes.length === 1) return codes[0];
    if (codes.length > 1) return null;
    const aliases = Object.entries(AIRPORT_LABELS).filter(([, value]) => new RegExp(value[1], 'iu').test(source));
    return aliases.length === 1 ? airportEntries.find(entry => entry.code === aliases[0][0]) : null;
  };
  const airportMapPlace = airport => {
    const known = resolveAirport(airport);
    const koreanNames = { ICN: '인천국제공항', GMP: '김포국제공항', PUS: '김해국제공항', CJU: '제주국제공항' };
    return { name: known ? (AIRPORT_LABELS[known.code]?.[0] || known.code + ' airport') + ' ' + known.code : text(airport) + ' airport', name_ko: koreanNames[known?.code] || '', address: '' };
  };
  const zoneFormatters = new Map();
  const wallAt = (instant, timeZone) => {
    if (!zoneFormatters.has(timeZone)) zoneFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    const parts = Object.fromEntries(zoneFormatters.get(timeZone).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const offsetLabel = minutes => (minutes < 0 ? '-' : '+') + pad(Math.floor(Math.abs(minutes) / 60)) + ':' + pad(Math.abs(minutes) % 60);
  const airportLocalTimestamp = (date, clock, airport, preferredOffset = '') => {
    const known = resolveAirport(airport);
    if (!known || !validDate(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(clock)) return '';
    const target = validDate(date) + 'T' + clock + (clock.length === 5 ? ':00' : '');
    const wall = Date.parse(target + 'Z');
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19) !== target) return '';
    const candidates = new Map();
    for (const delta of [-36, 0, 36]) {
      const probe = wall + delta * 3600000;
      const offset = Math.round((Date.parse(wallAt(probe, known.timeZone) + 'Z') - probe) / 60000);
      const instant = wall - offset * 60000;
      if (wallAt(instant, known.timeZone) === target) candidates.set(offsetLabel(offset), target + offsetLabel(offset));
    }
    // A supplied, valid offset can disambiguate an existing autumn DST overlap.
    if (candidates.has(preferredOffset)) return candidates.get(preferredOffset);
    return candidates.size === 1 ? [...candidates.values()][0] : '';
  };
  const pad = value => String(value).padStart(2, '0');
  const validDate = value => {
    const match = text(value).match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (!match) return '';
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return date.getUTCFullYear() === Number(y) && date.getUTCMonth() + 1 === Number(m) && date.getUTCDate() === Number(d) ? `${y}-${m}-${d}` : '';
  };
  const validOffset = offset => {
    const match = text(offset).match(/^([+-])(\d{2}):(\d{2})$/);
    return Boolean(match && Number(match[2]) <= 14 && Number(match[3]) <= 59 && (Number(match[2]) !== 14 || match[3] === '00'));
  };
  const normalizeTimestamp = (value, airport = '') => {
    let source = value instanceof Date ? value.toISOString() : text(value);
    const known = resolveAirport(airport);
    if (/Z$/.test(source) && !known) return '';
    // Sheets Date cells arrive as UTC instants. Convert to a known airport's wall time.
    if (/Z$/.test(source) && known && Number.isFinite(Date.parse(source))) {
      const instant = Date.parse(source);
      const wall = wallAt(instant, known.timeZone);
      const offset = Math.round((Date.parse(wall + 'Z') - Math.floor(instant / 1000) * 1000) / 60000);
      source = wall + offsetLabel(offset);
    }
    const match = source.match(/^(\d{4}[-/]\d{2}[-/]\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/);
    if (!match || !validDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return '';
    const offset = match[5] === 'Z' ? '+00:00' : match[5];
    if (offset && !validOffset(offset)) return '';
    if (known) return airportLocalTimestamp(validDate(match[1]), match[2] + ':' + match[3] + ':' + (match[4] || '00'), airport, offset);
    if (!offset) return '';
    return validDate(match[1]) + 'T' + match[2] + ':' + match[3] + ':' + (match[4] || '00') + offset;
  };
  const flag = value => value == null || value === '' ? true : !['false', '0', 'no', '否'].includes(text(value).toLowerCase());
  const flightType = value => ({ '去程': 'outbound', '回程': 'return', '其他': 'other' }[value] || (['outbound', 'return', 'other'].includes(value) ? value : 'other'));
  const normalizeFlight = (item = {}) => ({
    id: text(item.flight_id) || text(item.id),
    flight_id: Object.prototype.hasOwnProperty.call(item, 'flight_id') ? text(item.flight_id) : text(item.id), trip_id: text(item.trip_id),
    flight_type: flightType(text(item.flight_type)), airline: text(item.airline), flight_no: text(item.flight_no),
    depart_airport: text(item.depart_airport), depart_time: normalizeTimestamp(item.depart_time, item.depart_airport) || text(item.depart_time),
    arrive_airport: text(item.arrive_airport), arrive_time: normalizeTimestamp(item.arrive_time, item.arrive_airport) || text(item.arrive_time),
    terminal: text(item.terminal), arrive_terminal: text(item.arrive_terminal), note: text(item.note),
    show_in_itinerary: flag(item.show_in_itinerary)
  });
  const normalizeFlights = (items, tripId) => (Array.isArray(items) ? items : [])
    .filter(item => text(item.trip_id) === text(tripId)).map((item, index) => {
      const record = normalizeFlight(item);
      return record.id ? record : { ...record, id: 'legacy-view-' + index };
    })
    .sort((a, b) => (Date.parse(a.depart_time) || 0) - (Date.parse(b.depart_time) || 0) || a.id.localeCompare(b.id));
  const flightDay = (flight, trip, days) => {
    const start = validDate(text(trip?.start_date).slice(0, 10));
    const depart = normalizeTimestamp(flight.depart_time, flight.depart_airport);
    if (!start || !depart) return null;
    const day = Math.round((Date.parse(depart.slice(0, 10) + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
    return day >= 1 && day <= Number(days) ? day : null;
  };
  const dateLabel = value => {
    if (!value) return '日期待確認';
    const date = value.slice(0, 10);
    return date.replace(/-/g, '/') + '（' + '日一二三四五六'[new Date(date + 'T00:00:00Z').getUTCDay()] + '）';
  };
  const presentFlight = (item, trip, days) => {
    const flight = normalizeFlight(item);
    const depart = normalizeTimestamp(flight.depart_time, flight.depart_airport);
    const arrive = normalizeTimestamp(flight.arrive_time, flight.arrive_airport);
    const minutes = depart && arrive ? Math.round((Date.parse(arrive) - Date.parse(depart)) / 60000) : 0;
    const isValid = Boolean(depart && arrive && minutes > 0);
    const day = isValid ? flightDay(flight, trip, days) : null;
    return { ...flight, typeLabel: { outbound: '去程', return: '回程', other: '其他航段' }[flight.flight_type],
      departDateLabel: dateLabel(depart), arriveDateLabel: dateLabel(arrive), departTimeLabel: depart ? depart.slice(11, 16) : '—', arriveTimeLabel: arrive ? arrive.slice(11, 16) : '—',
      durationLabel: isValid ? (Math.floor(minutes / 60) ? Math.floor(minutes / 60) + ' 小時' : '') + (minutes % 60 ? (minutes >= 60 ? ' ' : '') + minutes % 60 + ' 分鐘' : '') : '時間需確認',
      day, dayLabel: day ? 'Day ' + day : '日期未對應', isValid,
      departAirport: flight.depart_airport, arriveAirport: flight.arrive_airport, departTerminal: flight.terminal, arriveTerminal: flight.arrive_terminal, flightNo: flight.flight_no
    };
  };
  const flightToForm = (item = {}) => {
    const flight = normalizeFlight(item);
    const depart = normalizeTimestamp(flight.depart_time, flight.depart_airport);
    const arrive = normalizeTimestamp(flight.arrive_time, flight.arrive_airport);
    return { ...flight, booking_ref: '', flight_type: item.flight_type ? flight.flight_type : 'outbound',
      _original_depart_airport: flight.depart_airport, _original_arrive_airport: flight.arrive_airport,
      depart_date: depart.slice(0, 10), depart_clock: depart.slice(11, 16),
      arrive_date: arrive.slice(0, 10), arrive_clock: arrive.slice(11, 16) };
  };
  const flightFromForm = (form, tripId) => {
    if (text(form.booking_ref)) throw Error('目前連線方式無法安全儲存訂位代號');
    if (!text(tripId) || !['outbound', 'return', 'other'].includes(form.flight_type)) throw Error('請選擇航班類型');
    for (const field of ['flight_no', 'depart_airport', 'arrive_airport']) if (!text(form[field])) throw Error('請填寫航班編號與出發、抵達機場');
    const timestamps = {};
    for (const side of ['depart', 'arrive']) {
      if (!validDate(form[side + '_date']) || !/^\d{2}:\d{2}$/.test(form[side + '_clock'])) throw Error('請填寫正確日期與機場當地時間');
      const original = text(form[side + '_time']);
      const unchanged = original.slice(0, 10) === form[side + '_date'] && original.slice(11, 16) === form[side + '_clock'];
      if (!resolveAirport(form[side + '_airport'])) {
        const sameAirport = text(form['_original_' + side + '_airport']).toUpperCase() === text(form[side + '_airport']).toUpperCase();
        const saved = normalizeTimestamp(original, form[side + '_airport']);
        if (sameAirport && unchanged && saved) { timestamps[side + '_time'] = saved; continue; }
        throw Error('目前無法自動辨識這座機場的時區，請確認機場名稱或代碼');
      }
      const value = airportLocalTimestamp(form[side + '_date'], form[side + '_clock'], form[side + '_airport'], original.slice(19));
      if (!value) throw Error('機場當地時間無效或位於夏令時間重複區間，請確認日期與時間');
      timestamps[side + '_time'] = value;
    }
    if (Date.parse(timestamps.arrive_time) <= Date.parse(timestamps.depart_time)) throw Error('抵達時間必須晚於出發時間，請確認日期與時區');
    return normalizeFlight({ ...form, ...timestamps, trip_id: tripId });
  };
  const timelineSlots = (cards, places, day) => {
    const before = Object.create(null), tail = [];
    (cards || []).filter(card => card.isValid && card.show_in_itinerary && card.day === Number(day)).forEach(card => {
      const next = (places || []).find(place => /^\d{2}:\d{2}/.test(text(place.time)) && text(place.time).slice(0, 5) > card.departTimeLabel);
      if (next) (before[text(next.id)] ||= []).push(card); else tail.push(card);
    });
    return { before, tail };
  };
  window.TravelFlights = Object.freeze({ countryFromCity, createCountryResolver, resolveAirport, airportMapPlace, airportLocalTimestamp, validDate, normalizeTimestamp, normalizeFlight, normalizeFlights, presentFlight, flightDay, flightToForm, flightFromForm, timelineSlots });
})(window);
