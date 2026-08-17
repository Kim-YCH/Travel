(function (window) {
  'use strict';

  const ITINERARY_TYPES = Object.freeze(['景點', '交通', '購物', '活動', '美食', '其他']);

  const normalizeOrderValue = (value) => {
    if (value === '' || value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const normalizeAlternativeFlag = (value) => {
    return String(value || '').trim().toLowerCase() === 'v' ? 'v' : '';
  };

  const getAlternativeFlag = (item) => normalizeAlternativeFlag(item?.is_alternative ?? item?.['是否為備案']);

  const isAlternativeItem = (item) => getAlternativeFlag(item) === 'v';

  const TRANSPORT_META_PREFIX = '[[TRAVEL_TRANSPORT_V1:';
  const TRANSPORT_META_SUFFIX = ']]';

  const createEmptyTransportDetails = () => ({
    mode: '',
    number: '',
    terminal: '',
    seat: '',
    checkin: ''
  });

  const normalizeTransportDetails = (value = {}) => ({
    mode: String(value.mode || '').trim(),
    number: String(value.number || '').trim(),
    terminal: String(value.terminal || '').trim(),
    seat: String(value.seat || '').trim(),
    checkin: String(value.checkin || '').trim()
  });

  const parseItineraryMessage = (message) => {
    const raw = String(message || '');
    const firstLineEnd = raw.search(/\r?\n/);
    const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
    const note = firstLineEnd === -1 ? '' : raw.slice(firstLineEnd).replace(/^\r?\n/, '');

    if (!firstLine.startsWith(TRANSPORT_META_PREFIX) || !firstLine.endsWith(TRANSPORT_META_SUFFIX)) {
      return { transport: createEmptyTransportDetails(), note: raw };
    }

    try {
      const encoded = firstLine.slice(TRANSPORT_META_PREFIX.length, -TRANSPORT_META_SUFFIX.length);
      const parsed = JSON.parse(decodeURIComponent(encoded));
      return { transport: normalizeTransportDetails(parsed), note };
    } catch (err) {
      return { transport: createEmptyTransportDetails(), note: raw };
    }
  };

  const serializeItineraryMessage = (type, note, transport) => {
    const cleanNote = String(note || '').trim();
    if (String(type || '').trim() !== '交通') return cleanNote;

    const details = normalizeTransportDetails(transport);
    const hasDetails = Object.values(details).some(Boolean);
    if (!hasDetails) return cleanNote;

    const encoded = encodeURIComponent(JSON.stringify(details));
    return `${TRANSPORT_META_PREFIX}${encoded}${TRANSPORT_META_SUFFIX}${cleanNote ? `\n${cleanNote}` : ''}`;
  };

  const getItineraryNote = (item) => parseItineraryMessage(item?.message).note;
  const getTransportDetails = (item) => parseItineraryMessage(item?.message).transport;

  const normalizeItineraryType = (value) => {
    const type = String(value || '').trim();
    if (!type) return '景點';

    const aliases = {
      早餐: '美食',
      午餐: '美食',
      晚餐: '美食',
      餐廳: '美食',
      飲食: '美食',
      咖啡: '美食',
      商圈: '購物',
      門票: '活動',
      交通: '交通',
      移動: '交通',
      住宿: '其他',
      飯店: '其他'
    };

    return ITINERARY_TYPES.includes(type) ? type : (aliases[type] || '其他');
  };

  const getItineraryType = (item) => normalizeItineraryType(item?.type || item?.category || item?.place_type);

  // 班次與航廈本身就看得懂，座位與時間需要標籤才不會混淆。
  //
  // checkin 這個鍵名是早期版本留下的：當時它代表報到時間，但報到時間通常等於行程本身的
  // 排程時間，記兩次沒有意義。現在它存的是交通工具的出發時間，UI 也照此顯示。
  // 鍵名維持 checkin 以免既有資料需要搬遷。
  const getTransportSummary = (item) => {
    if (getItineraryType(item) !== '交通') return [];
    const details = getTransportDetails(item);
    return [
      details.number || '',
      details.terminal || '',
      details.seat ? `座位 ${details.seat}` : '',
      details.checkin ? `出發 ${details.checkin}` : ''
    ].filter(Boolean);
  };

  const getItineraryInfoText = (item) => {
    const transportText = getTransportSummary(item).join(' · ');
    const note = getItineraryNote(item);
    return [transportText, note].filter(Boolean).join('｜');
  };

  const includesAnyKeyword = (text, keywords) => keywords.some(keyword => text.includes(keyword));

  const getItineraryTypeTone = (item) => {
    const type = getItineraryType(item);
    const source = [item?.type, item?.category, item?.place_type, item?.name, item?.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (includesAnyKeyword(source, ['住宿', '飯店', '酒店', '民宿', 'hotel', 'hostel', 'guesthouse', '호텔'])) return 'hotel';
    if (includesAnyKeyword(source, ['咖啡', 'coffee', 'cafe', 'café', '카페', 'コーヒー', '喫茶'])) return 'cafe';
    if (type === '美食' || includesAnyKeyword(source, ['美食', '餐廳', '食堂', '早餐', '午餐', '晚餐', '拉麵', '烤肉', 'restaurant', 'ramen', '맛집', '식당'])) return 'food';
    if (type === '購物' || includesAnyKeyword(source, ['購物', '商場', '百貨', '超市', '市場', '藥妝', 'mall', 'outlet', 'shopping', '마트', '쇼핑'])) return 'shopping';
    if (includesAnyKeyword(source, ['交通', '車站', '地鐵', '捷運', '機場', '巴士', '公車', 'station', 'airport', 'metro', 'subway', '버스', '공항', '駅'])) return 'transport';
    if (type === '活動' || includesAnyKeyword(source, ['活動', '門票', '展覽', '表演', '演唱會', 'festival', 'ticket'])) return 'activity';
    if (type === '其他') return 'other';
    return 'sightseeing';
  };

  const getItineraryCategoryLabel = (item) => {
    const tone = getItineraryTypeTone(item);
    const labels = {
      sightseeing: '景點',
      food: '美食',
      shopping: '購物',
      hotel: '住宿',
      transport: '交通',
      cafe: '咖啡',
      activity: '活動',
      other: '其他'
    };
    return labels[tone] || getItineraryType(item);
  };

  const getItineraryIcon = (item) => {
    const tone = getItineraryTypeTone(item);
    if (tone === 'food') return '🍜';
    if (tone === 'shopping') return '🛍️';
    if (tone === 'hotel') return '🏠';
    if (tone === 'transport') return '🚇';
    if (tone === 'cafe') return '☕';
    if (tone === 'activity') return '🎟️';
    if (tone === 'other') return '📍';
    return '🗼';
  };

  const normalizeItineraryRecord = (item) => ({
    ...item,
    day: item?.day ? parseInt(item.day, 10) || 1 : 1,
    order: normalizeOrderValue(item?.order),
    type: getItineraryType(item),
    lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
    lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
    is_alternative: getAlternativeFlag(item)
  });

  // 舊版備案表保留但不再使用；新版備案改存在 itinerary.is_alternative
  const normalizeAlternativeRecord = (item) => ({
    ...item,
    day: item?.day ? parseInt(item.day, 10) || 1 : 1,
    lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
    lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
    name: String(item?.name || '').trim(),
    type: getItineraryType(item),
    address: String(item?.address || '').trim(),
    place_id: String(item?.place_id || '').trim(),
    message: String(item?.message || '')
  });

  // 行程頁左右滑動換天的判定。
  //
  // ★ 無狀態純函式：只回答「這個手勢想往哪個方向」，不知道目前第幾天、
  //   也不知道總共幾天 —— 邊界判斷（Day 1 不能再往前）留在呼叫端。
  //   這樣切才能完整單元測試，不必模擬真實觸控。
  const SWIPE_MIN_DISTANCE = 60;
  const SWIPE_HORIZONTAL_RATIO = 1.5;
  // 起點落在這些元素裡就整個放棄：
  //   .itinerary-day-tabs —— 它本身就是橫向捲動容器，兩者會互相干擾
  //   .drag-handle        —— 拖曳排序的把手，屬於 Sortable
  //   互動元素            —— 手勢應該歸它們自己
  const SWIPE_IGNORE_SELECTOR = '.itinerary-day-tabs, .drag-handle, input, select, textarea, button, a';

  const resolveSwipeIntent = ({ dx, dy, startEl } = {}) => {
    const x = Number(dx);
    const y = Number(dy);
    if (!Number.isFinite(x)) return null;
    const vertical = Number.isFinite(y) ? Math.abs(y) : 0;

    if (Math.abs(x) < SWIPE_MIN_DISTANCE) return null;
    // 嚴格大於：剛好 1.5 倍算斜滑，不換天
    if (Math.abs(x) <= vertical * SWIPE_HORIZONTAL_RATIO) return null;
    if (startEl && typeof startEl.closest === 'function' && startEl.closest(SWIPE_IGNORE_SELECTOR)) return null;

    return x < 0 ? 'next' : 'prev';
  };

  window.TravelItinerary = Object.freeze({
    ITINERARY_TYPES,
    normalizeOrderValue,
    normalizeAlternativeFlag,
    getAlternativeFlag,
    isAlternativeItem,
    createEmptyTransportDetails,
    normalizeTransportDetails,
    parseItineraryMessage,
    serializeItineraryMessage,
    getItineraryNote,
    getTransportDetails,
    getTransportSummary,
    getItineraryInfoText,
    normalizeItineraryType,
    getItineraryType,
    getItineraryTypeTone,
    getItineraryCategoryLabel,
    getItineraryIcon,
    normalizeItineraryRecord,
    normalizeAlternativeRecord,
    resolveSwipeIntent
  });
})(window);
