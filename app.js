const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;

createApp({
  setup() {
    const API_URL = window.TRAVEL_CONFIG?.API_URL || '';
    const GOOGLE_MAPS_API_KEY = window.TRAVEL_CONFIG?.GOOGLE_MAPS_API_KEY || '';
    const APP_VERSION = window.TRAVEL_CONFIG?.APP_VERSION || '20260623.01';

    const currentView = ref('lobby');
    const currentTrip = ref(null);
    const trips = ref([]);
    const newTripName = ref('');
    const newTripCity = ref('');

    const currentTab = ref('itinerary');
    const isLoading = ref(false);
    const syncStatus = ref('synced');
    const syncMessage = ref('');
    const pendingSyncQueue = ref([]);
    const isFlushingQueue = ref(false);
    const isAddingPlace = ref(false);
    const isAddingMapPlace = ref(false);
    const isAddingExpense = ref(false);

    const currentDay = ref(1);
    const totalDays = ref(1);
    const todayKey = ref('');
    let todayRefreshTimer = null;

    const people = ref([]);
    const itinerary = ref([]);
    const expenses = ref([]);
    const hotels = ref([]);
    const alternatives = ref([]); // 舊版備案表保留但不再使用；新版備案改存在 itinerary.is_alternative

    const newPlace = ref('');
    const newTime = ref('');
    const newNote = ref('');
    const newPerson = ref('');
    const newExpense = ref({ title: '', amount: '', payer: '', involved: [], category: '飲食', day: 1 });
    const expenseFilter = ref({ day: 'all', category: 'all', payer: 'all' });
    const categories = ['飲食', '交通', '住宿', '購物', '門票', '其他'];

    const searchResults = ref([]);
    const translatedSearchHint = ref('');
    const isSearching = ref(false);
    const isCoordinateMode = ref(false);
    const resolvedCoordName = ref('');
    const selectedLat = ref(null);
    const selectedLng = ref(null);
    const selectedPlaceData = ref(null);

    const mapSearchQuery = ref('');
    const mapSearchResults = ref([]);
    const mapTranslatedSearchHint = ref('');
    const mapIsSearching = ref(false);
    const mapIsCoordinateMode = ref(false);
    const mapResolvedCoordName = ref('');
    const mapSelectedLat = ref(null);
    const mapSelectedLng = ref(null);
    const mapSelectedPlaceData = ref(null);
    const mapLatestResult = ref(null);
    const mapAddDay = ref(1);
    const mapDisplayFilter = ref('all');
    const isMapReady = ref(false);
    let mapInstance = null;
    let mapElementRef = null;
    let markers = [];
    let mapSearchMarker = null;
    let mapRouteLine = null;
    let infoWindow = null;
    let autocompleteService = null;
    let mapSearchTimeout = null;

    const newHotel = ref({ start_day: 1, end_day: 1 });
    const hotelSearchQuery = ref('');
    const hotelSearchResults = ref([]);
    const hotelIsSearching = ref(false);
    const hotelSelectedPlaceData = ref(null);
    const isAddingHotel = ref(false);
    const isDeletingHotel = ref(false);
    const showEditHotelModal = ref(false);
    const editHotelId = ref('');
    const editHotel = ref({ name: '', start_day: 1, end_day: 1, address: '' });
    const editHotelSearchQuery = ref('');
    const editHotelSearchResults = ref([]);
    const editHotelIsSearching = ref(false);
    const editHotelSelectedPlaceData = ref(null);
    const isSavingHotel = ref(false);
    let hotelSearchTimeout = null;
    let editHotelSearchTimeout = null;

    const newAlternative = ref({ message: '' });
    const alternativeSearchQuery = ref('');
    const alternativeSearchResults = ref([]);
    const alternativeIsSearching = ref(false);
    const alternativeSelectedPlaceData = ref(null);
    const isAddingAlternative = ref(false);
    const isDeletingAlternative = ref(false);
    const isAddingAlternativeToItinerary = ref(false);
    let alternativeSearchTimeout = null;

    const itineraryListEl = ref(null);
    const alternativeListEl = ref(null);
    let sortable = null;
    let alternativeSortable = null;

    const showDayModal = ref(false);
    const modalDay = ref(1);
    const dateInput = ref('');
    const swapTargetDay = ref(0);

    const showEditModal = ref(false);
    const editPlaceId = ref('');
    const editPlace = ref({ name: '', time: '', message: '', day: 1 });

    const showEditExpenseModal = ref(false);
    const editExpenseId = ref('');
    const editExpense = ref({ title: '', amount: '', payer: '', involved: [], category: '飲食', day: 1 });
    const isSavingExpense = ref(false);

    const generateId = () => Date.now() + '_' + Math.floor(Math.random() * 1000);

    const isKoreaCity = (city) => {
      const s = String(city || '').trim().toLowerCase();
      const koreaKeywords = [
        '韓國', '首爾', '釜山', '濟州', '大邱', '仁川', '水原', '江南', '明洞', '弘大',
        'seoul', 'busan', 'jeju', 'daegu', 'incheon', 'suwon', 'gangnam', 'myeongdong', 'hongdae', 'korea'
      ];
      return koreaKeywords.some(k => s.includes(k.toLowerCase()));
    };

    const isKoreaTrip = computed(() => isKoreaCity(currentTrip.value?.city || ''));

    const getTripTranslateTarget = () => {
      const city = String(currentTrip.value?.city || '').trim().toLowerCase();
      if (isKoreaCity(city)) return { code: 'ko', label: '韓文' };
      const japanKeywords = ['日本', '東京', '大阪', '京都', '奈良', '札幌', '沖繩', '福岡', '名古屋', 'japan', 'tokyo', 'osaka', 'kyoto', 'nara', 'sapporo', 'okinawa', 'fukuoka', 'nagoya'];
      if (japanKeywords.some(k => city.includes(k.toLowerCase()))) return { code: 'ja', label: '日文' };
      const thaiKeywords = ['泰國', '曼谷', '清邁', '普吉', 'thailand', 'bangkok', 'chiang mai', 'phuket'];
      if (thaiKeywords.some(k => city.includes(k.toLowerCase()))) return { code: 'th', label: '泰文' };
      return null;
    };

    const translateSearchCache = new Map();

    const translatePlaceKeyword = async (keyword) => {
      const target = getTripTranslateTarget();
      const q = String(keyword || '').trim();
      if (!target || !q) return { keyword: q, translated: '', target };

      const city = String(currentTrip.value?.city || '').trim();
      const sourceText = city && !q.includes(city) ? `${q} ${city}` : q;
      const key = `${target.code}__${sourceText}`;
      if (translateSearchCache.has(key)) return translateSearchCache.get(key);

      try {
        const res = await apiGet({
          action: 'translate_place_keyword',
          text: sourceText,
          target: target.code
        });
        const translated = String(res?.translatedText || '').trim();
        const out = {
          keyword: translated || sourceText,
          translated,
          target,
          detectedSourceLanguage: res?.detectedSourceLanguage || ''
        };
        translateSearchCache.set(key, out);
        return out;
      } catch (err) {
        console.warn('translatePlaceKeyword failed:', err);
        return { keyword: sourceText, translated: '', target };
      }
    };

    const getPlacePredictionsAsync = async (request) => {
      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!autocompleteService) autocompleteService = new google.maps.places.AutocompleteService();

      return await new Promise((resolve) => {
        autocompleteService.getPlacePredictions(request, (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            resolve(predictions);
          } else {
            resolve([]);
          }
        });
      });
    };

    const mergePredictions = (...groups) => {
      const seen = new Set();
      const out = [];
      groups.flat().forEach((item) => {
        const key = item?.place_id || item?.description;
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(item);
      });
      return out;
    };

    const searchPlacesWithTranslation = async (q, options = {}) => {
      const target = getTripTranslateTarget();
      const baseReq = {
        input: q,
        language: 'zh-TW',
        ...(options.types ? { types: options.types } : {})
      };
      if (options.bounds) baseReq.bounds = options.bounds;

      const originalPredictions = await getPlacePredictionsAsync(baseReq);

      if (!target) {
        return { predictions: originalPredictions, hint: '' };
      }

      const translatedInfo = await translatePlaceKeyword(q);
      const translatedKeyword = String(translatedInfo.keyword || '').trim();
      if (!translatedKeyword || translatedKeyword === q) {
        return { predictions: originalPredictions, hint: '' };
      }

      const translatedReq = {
        input: translatedKeyword,
        language: target.code,
        ...(options.types ? { types: options.types } : {})
      };
      if (options.bounds) translatedReq.bounds = options.bounds;

      const translatedPredictions = await getPlacePredictionsAsync(translatedReq);
      return {
        predictions: mergePredictions(translatedPredictions, originalPredictions),
        hint: translatedInfo.translated ? `翻譯搜尋：${translatedInfo.translated}` : ''
      };
    };

    const pad2 = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    const refreshTodayKey = () => { todayKey.value = toYMD(new Date()); };
    const parseYMD = (s) => {
      if (!s) return null;
      const p = String(s).split('-');
      if (p.length !== 3) return null;
      const y = parseInt(p[0],10), m = parseInt(p[1],10), d = parseInt(p[2],10);
      if (!y || !m || !d) return null;
      return new Date(y, m-1, d, 12, 0, 0);
    };
    const addDays = (d, n) => {
      const x = new Date(d);
      x.setDate(x.getDate()+n);
      return x;
    };


    const daysUntilTrip = (trip) => {
      const base = parseYMD(trip?.start_date);
      if (!base) return null;
      const today = parseYMD(todayKey.value || toYMD(new Date())) || new Date();
      today.setHours(12, 0, 0, 0);
      const diff = Math.ceil((base.getTime() - today.getTime()) / 86400000);
      return diff >= 0 ? diff : null;
    };

    const tripCountdownDays = (trip) => daysUntilTrip(trip);

    const tripCountdownLabel = (trip) => {
      const d = daysUntilTrip(trip);
      if (d == null) return '';
      return d === 0 ? '今天開始' : '天後開始';
    };

    const getTripDayForToday = (trip, totalDayCount = totalDays.value) => {
      const base = parseYMD(trip?.start_date);
      const maxDay = Math.max(1, parseInt(totalDayCount, 10) || 1);
      if (!base) return 1;

      const today = parseYMD(todayKey.value || toYMD(new Date())) || new Date();
      today.setHours(12, 0, 0, 0);
      const diffDay = Math.floor((today.getTime() - base.getTime()) / 86400000) + 1;

      // 還沒出發，或旅程已結束，一律回到 Day 1。
      if (diffDay < 1 || diffDay > maxDay) return 1;
      return diffDay;
    };

    const applyEntryDayByToday = () => {
      const day = getTripDayForToday(currentTrip.value, totalDays.value);
      currentDay.value = day;
      mapAddDay.value = day;
      newExpense.value.day = day;
    };

    const dayLabel = (day) => {
      const base = parseYMD(currentTrip.value?.start_date);
      if (!base) return '';
      const dt = addDays(base, day-1);
      const wk = ['日','一','二','三','四','五','六'][dt.getDay()];
      return `${dt.getFullYear()}/${pad2(dt.getMonth()+1)}/${pad2(dt.getDate())} (${wk})`;
    };

    const normalizeInvolved = (list) => {
      if (Array.isArray(list)) return list.filter(Boolean);
      if (typeof list === 'string') {
        return list.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [];
    };

    const normalizeExpenseRecord = (item) => ({
      ...item,
      amount: Number(item?.amount) || 0,
      day: item?.day ? parseInt(item.day, 10) || 1 : 1,
      involved: normalizeInvolved(item?.involved),
      category: item?.category || '其他',
      payer: item?.payer || ''
    });

    // 公帳規則：只要「分攤給」包含公帳，就視為放入公帳。
    // 這類紀錄仍保留在分帳計算中，但不顯示於前端支出列表，也不納入總支出/消費分析。
    const PUBLIC_ACCOUNT_NAME = '公帳';
    const normalizePersonName = (name) => String(name || '').trim();
    const isPublicAccountFund = (expense) => {
      const involved = normalizeInvolved(expense?.involved).map(normalizePersonName);
      return involved.includes(PUBLIC_ACCOUNT_NAME);
    };
    const expenseCreatedTime = (expense) => {
      const fromId = parseInt(String(expense?.id || '').split('_')[0], 10);
      if (Number.isFinite(fromId)) return fromId;
      const fromDate = Date.parse(expense?.created_at || expense?.updated_at || '');
      return Number.isFinite(fromDate) ? fromDate : 0;
    };

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

    const normalizeItineraryRecord = (item) => ({
      ...item,
      day: item?.day ? parseInt(item.day, 10) || 1 : 1,
      order: normalizeOrderValue(item?.order),
      is_alternative: getAlternativeFlag(item)
    });

    const normalizeHotelRecord = (item) => ({
      ...item,
      start_day: item?.start_day ? parseInt(item.start_day, 10) || 1 : 1,
      end_day: item?.end_day ? parseInt(item.end_day, 10) || 1 : 1,
      lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
      lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
      name: String(item?.name || '').trim(),
      address: String(item?.address || '').trim(),
      place_id: String(item?.place_id || '').trim()
    });

    const normalizeAlternativeRecord = (item) => ({
      ...item,
      day: item?.day ? parseInt(item.day, 10) || 1 : 1,
      lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
      lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
      name: String(item?.name || '').trim(),
      address: String(item?.address || '').trim(),
      place_id: String(item?.place_id || '').trim(),
      message: String(item?.message || '')
    });

    const isHotelActiveOnDay = (hotel, day) => {
      const d = parseInt(day, 10) || 1;
      const start = parseInt(hotel?.start_day, 10) || 1;
      const end = parseInt(hotel?.end_day, 10) || start;
      return d >= Math.min(start, end) && d <= Math.max(start, end);
    };

    const hotelDayRangeLabel = (hotel) => {
      const start = parseInt(hotel?.start_day, 10) || 1;
      const end = parseInt(hotel?.end_day, 10) || start;
      return start === end ? `Day ${start}` : `Day ${Math.min(start, end)} ~ Day ${Math.max(start, end)}`;
    };

    const hasHotelOverlap = (startDay, endDay, exceptId = '') => {
      const s = Math.min(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);
      const e = Math.max(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);
      return hotels.value.some(h => {
        if (exceptId && String(h.id) === String(exceptId)) return false;
        const hs = Math.min(parseInt(h.start_day, 10) || 1, parseInt(h.end_day, 10) || 1);
        const he = Math.max(parseInt(h.start_day, 10) || 1, parseInt(h.end_day, 10) || 1);
        return s <= he && e >= hs;
      });
    };

    const sortDayItemsByStoredOrder = (list) => {
      return list.slice().sort((a, b) => {
        const oa = normalizeOrderValue(a?.order);
        const ob = normalizeOrderValue(b?.order);

        if (oa != null && ob != null && oa !== ob) return oa - ob;
        if (oa != null && ob == null) return -1;
        if (oa == null && ob != null) return 1;

        const ta = timeToNum(a?.time);
        const tb = timeToNum(b?.time);
        if (ta !== tb) return ta - tb;

        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });
    };

    const getDayOrderedItems = (day, isAlternative = false) => {
      const targetDay = parseInt(day, 10) || 1;
      const list = itinerary.value.filter(i =>
        (i.day ? parseInt(i.day,10) : 1) === targetDay &&
        isAlternativeItem(i) === Boolean(isAlternative)
      );
      return sortDayItemsByStoredOrder(list);
    };

    const applyOrderToLocalItinerary = (day, ids, isAlternative = false) => {
      const targetDay = parseInt(day, 10) || 1;
      const altFlag = Boolean(isAlternative) ? 'v' : '';
      const idOrder = Array.isArray(ids) ? ids.map(String) : [];
      const dayItems = itinerary.value.filter(i =>
        (i.day ? parseInt(i.day,10) : 1) === targetDay &&
        isAlternativeItem(i) === Boolean(isAlternative)
      );
      const map = new Map(dayItems.map(item => [String(item.id), item]));

      let order = 1;
      idOrder.forEach((id) => {
        const item = map.get(String(id));
        if (item) {
          item.is_alternative = altFlag;
          item.order = order++;
          map.delete(String(id));
        }
      });

      sortDayItemsByStoredOrder(Array.from(map.values())).forEach((item) => {
        item.is_alternative = altFlag;
        item.order = order++;
      });
    };

    const hasCompleteSequentialOrder = (day, isAlternative = false) => {
      const items = itinerary.value.filter(i =>
        (i.day ? parseInt(i.day,10) : 1) === (parseInt(day, 10) || 1) &&
        isAlternativeItem(i) === Boolean(isAlternative)
      );
      if (!items.length) return true;

      const orders = items.map(item => normalizeOrderValue(item.order));
      if (orders.some(v => v == null)) return false;

      const sorted = orders.slice().sort((a, b) => a - b);
      if (new Set(sorted).size !== sorted.length) return false;

      return sorted.every((value, index) => value === index + 1);
    };

    const ensureAllDayOrdersSynced = async (tripId) => {
      if (!tripId) return;
      const maxDay = itinerary.value.reduce((m, it) => Math.max(m, it.day ? parseInt(it.day,10) : 1), 1);

      for (let day = 1; day <= maxDay; day++) {
        for (const isAlt of [false, true]) {
          const items = getDayOrderedItems(day, isAlt);
          if (!items.length) continue;
          if (hasCompleteSequentialOrder(day, isAlt)) continue;

          const ids = items.map(item => String(item.id));
          applyOrderToLocalItinerary(day, ids, isAlt);
          try {
            await saveOrderToDB(tripId, day, ids, isAlt);
          } catch (e) {}
        }
      }
    };

    const formatInvolved = (list) => {
      const arr = normalizeInvolved(list);
      return arr.length === 0 ? '全員' : arr.join(', ');
    };

    const formatTime = (timeStr) => {
      if (!timeStr) return '';
      if (typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr)) return timeStr;
      try {
        const date = new Date(timeStr);
        if (isNaN(date.getTime())) return timeStr;
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      } catch (e) {
        return timeStr;
      }
    };

    const timeToNum = (t) => {
      const s = formatTime(t);
      if (!s) return 999999;
      const p = s.split(':');
      if (p.length !== 2) return 999999;
      const hh = parseInt(p[0],10);
      const mm = parseInt(p[1],10);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;
      return hh * 60 + mm;
    };

    const jsonp = (url, timeoutMs = 30000) => new Promise((resolve, reject) => {
      const cb = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const sep = url.includes('?') ? '&' : '?';
      const full = `${url}${sep}callback=${cb}`;

      const s = document.createElement('script');
      const t = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(t);
        if (s.parentNode) s.parentNode.removeChild(s);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      };

      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };

      s.onerror = () => {
        cleanup();
        reject(new Error('JSONP load error'));
      };

      s.src = full;
      document.head.appendChild(s);
    });

    const apiGet = async (paramsObj) => {
      const qs = new URLSearchParams(paramsObj).toString();
      return await jsonp(`${API_URL}?${qs}`);
    };

    const cacheKey = (tripId) => `trip_cache_${tripId}`;

    const saveTripCache = (tripId) => {
      try {
        localStorage.setItem(cacheKey(tripId), JSON.stringify({
          itinerary: itinerary.value,
          expenses: expenses.value,
          people: people.value,
          hotels: hotels.value,
          alternatives: alternatives.value,
          trip: currentTrip.value,
          ts: Date.now()
        }));
      } catch(e){}
    };

    const loadTripCache = (tripId) => {
      try {
        const raw = localStorage.getItem(cacheKey(tripId));
        if (!raw) return false;

        const c = JSON.parse(raw);

        itinerary.value = Array.isArray(c.itinerary) ? c.itinerary.map(normalizeItineraryRecord) : [];
        expenses.value  = Array.isArray(c.expenses) ? c.expenses.map(normalizeExpenseRecord) : [];
        people.value    = Array.isArray(c.people) ? c.people : [{id:'default', name:'我'}];
        hotels.value    = Array.isArray(c.hotels) ? c.hotels.map(normalizeHotelRecord) : [];
        alternatives.value = Array.isArray(c.alternatives) ? c.alternatives.map(normalizeAlternativeRecord) : [];

        if (c.trip) currentTrip.value = { ...currentTrip.value, ...c.trip };

        const maxDay = itinerary.value.reduce((m, it) =>
          Math.max(m, it.day ? parseInt(it.day,10) : 1), 1);

        totalDays.value = Math.max(1, maxDay);

        return true;
      } catch(e){
        return false;
      }
    };

    const rawPostJSON = async (payload) => {
      const p = { ...payload };
      if (p.data && typeof p.data === 'object') p.data = JSON.stringify(p.data);
      return await apiGet(p);
    };

    const pendingQueueKey = (tripId) => `trip_pending_queue_${tripId}`;

    const savePendingQueue = () => {
      if (!currentTrip.value?.id) return;
      try {
        localStorage.setItem(pendingQueueKey(currentTrip.value.id), JSON.stringify(pendingSyncQueue.value));
      } catch (e) {}
    };

    const loadPendingQueue = (tripId) => {
      try {
        const raw = localStorage.getItem(pendingQueueKey(tripId));
        pendingSyncQueue.value = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(pendingSyncQueue.value)) pendingSyncQueue.value = [];
        syncStatus.value = pendingSyncQueue.value.length ? 'queued' : 'synced';
      } catch (e) {
        pendingSyncQueue.value = [];
        syncStatus.value = 'synced';
      }
    };

    const enqueuePendingWrite = (payload, err) => {
      if (!currentTrip.value?.id || !payload?.action) return;
      pendingSyncQueue.value.push({
        id: generateId(),
        payload,
        attempts: 0,
        error: String(err?.message || err || ''),
        created_at: new Date().toISOString()
      });
      syncStatus.value = 'queued';
      syncMessage.value = '已暫存，稍後重送';
      savePendingQueue();
    };

    const flushPendingQueue = async () => {
      if (isFlushingQueue.value || !currentTrip.value?.id) return;
      if (!pendingSyncQueue.value.length) {
        syncStatus.value = 'synced';
        syncMessage.value = '';
        return;
      }

      isFlushingQueue.value = true;
      syncStatus.value = 'syncing';

      const remain = [];
      for (const job of pendingSyncQueue.value) {
        try {
          const res = await rawPostJSON(job.payload);
          if (res && res.status === 'error') {
            throw new Error(res.message || 'sync failed');
          }
        } catch (err) {
          remain.push({
            ...job,
            attempts: (job.attempts || 0) + 1,
            error: String(err?.message || err || ''),
            last_try_at: new Date().toISOString()
          });
        }
      }

      pendingSyncQueue.value = remain;
      savePendingQueue();
      syncStatus.value = remain.length ? 'queued' : 'synced';
      syncMessage.value = remain.length ? `${remain.length} 筆待重送` : '已同步';
      isFlushingQueue.value = false;
    };

    const postJSON = async (payload, options = {}) => {
      const queueOnFail = options.queueOnFail !== false;
      if (payload?.action) syncStatus.value = 'syncing';

      try {
        const res = await rawPostJSON(payload);
        if (payload?.action && pendingSyncQueue.value.length === 0) {
          syncStatus.value = 'synced';
          syncMessage.value = '已同步';
        }
        return res;
      } catch (err) {
        if (queueOnFail && payload?.action) {
          enqueuePendingWrite(payload, err);
          return { status: 'queued', queued: true, message: String(err?.message || err || '') };
        }
        syncStatus.value = 'error';
        syncMessage.value = String(err?.message || err || '同步失敗');
        throw err;
      }
    };

    const saveTripsCache = () => {
      try {
        localStorage.setItem('trips_cache', JSON.stringify({
          ts: Date.now(),
          data: trips.value
        }));
      } catch(e) {}
    };

    const loadTripsCache = () => {
      try {
        const raw = localStorage.getItem('trips_cache');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        trips.value = Array.isArray(parsed?.data) ? parsed.data : [];
        return trips.value.length > 0;
      } catch(e) {
        return false;
      }
    };

    let tripCacheSaveTimer = null;
    const scheduleTripCacheSave = () => {
      if (!currentTrip.value?.id) return;
      clearTimeout(tripCacheSaveTimer);
      tripCacheSaveTimer = setTimeout(() => {
        saveTripCache(currentTrip.value.id);
      }, 250);
    };

    let tripsCacheSaveTimer = null;
    const scheduleTripsCacheSave = () => {
      clearTimeout(tripsCacheSaveTimer);
      tripsCacheSaveTimer = setTimeout(() => {
        saveTripsCache();
      }, 250);
    };

    const setOrderIds = (tripId, day, ids, isAlternative = false) => {
      applyOrderToLocalItinerary(day, ids, isAlternative);
      scheduleTripCacheSave();
    };
    const getOrderIds = (tripId, day, isAlternative = false) => getDayOrderedItems(day, isAlternative).map(item => String(item.id));
    const clearOrderIds = (tripId, day, isAlternative = false) => {
      const targetDay = parseInt(day, 10) || 1;
      itinerary.value.forEach((item) => {
        if ((item.day ? parseInt(item.day,10) : 1) === targetDay && isAlternativeItem(item) === Boolean(isAlternative)) {
          item.order = null;
        }
      });
      scheduleTripCacheSave();
    };

    const saveOrderToDB = async (tripId, day, ids, isAlternative = false) => {
      await postJSON({
        action: 'save_order',
        tripId,
        day: String(day),
        order: (ids||[]).join(','),
        isAlternative: isAlternative ? 'v' : ''
      });
    };

    const escapeHtml = (s) => String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#39;");

    const linkifyMessage = (text) => {
      const raw = String(text || '');
      if (!raw) return '';

      const escaped = escapeHtml(raw);
      const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,!?;:])/gi;

      const linked = escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });

      return `📝 ${linked.replace(/\n/g, '<br>')}`;
    };

    const handleItineraryContentClick = (event, place) => {
      if (event?.target?.closest && event.target.closest('a')) return;
      openExternalMap(place);
    };

    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        try { autocompleteService = new google.maps.places.AutocompleteService(); } catch(e){}
        isMapReady.value = true;
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const existed = document.querySelector('script[data-google-maps-loader="1"]');
        if (existed) {
          const timer = setInterval(() => {
            if (window.google && window.google.maps) {
              clearInterval(timer);
              try { autocompleteService = new google.maps.places.AutocompleteService(); } catch(e){}
              isMapReady.value = true;
              resolve();
            }
          }, 100);
          return;
        }

        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=zh-TW`;
        s.async = true;
        s.defer = true;
        s.setAttribute('data-google-maps-loader', '1');

        s.onload = () => {
          try { autocompleteService = new google.maps.places.AutocompleteService(); } catch(e){}
          isMapReady.value = true;
          resolve();
        };

        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    };

    const getPlaceDetails = (placeId, language = 'zh-TW') => {
      return new Promise(async (resolve) => {
        if (!window.google || !window.google.maps) {
          await loadGoogleMaps();
        }

        const dummyMap = new google.maps.Map(document.createElement('div'));
        const service = new google.maps.places.PlacesService(dummyMap);

        service.getDetails(
          {
            placeId,
            fields: ['place_id', 'name', 'formatted_address', 'geometry'],
            language
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place);
            } else {
              resolve(null);
            }
          }
        );
      });
    };

    const initGoogleMap = () => {
      if (!window.google || !window.google.maps) return;

      const mapEl = document.getElementById('map');
      if (!mapEl) return;

      const needRecreate = !mapInstance || mapElementRef !== mapEl;

      if (needRecreate) {
        mapElementRef = mapEl;

        mapInstance = new google.maps.Map(mapEl, {
          center: { lat: 23.6, lng: 121 },
          zoom: 8,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false
        });

        infoWindow = new google.maps.InfoWindow();
      }

      updateMapMarkers();
    };

    const clearMapSearchMarker = () => {
      if (mapSearchMarker) {
        mapSearchMarker.setMap(null);
        mapSearchMarker = null;
      }
    };

    const clearMapSearchResult = () => {
      clearMapSearchDropdown();
      clearMapSearchMarker();
      mapLatestResult.value = null;
      if (infoWindow) infoWindow.close();
      if (currentTab.value === 'map') updateMapMarkers();
    };

    const clearMapRouteLine = () => {
      if (mapRouteLine) {
        mapRouteLine.setMap(null);
        mapRouteLine = null;
      }
    };

    const clearMapSearchDropdown = () => {
      mapSearchResults.value = [];
      mapTranslatedSearchHint.value = '';
      mapIsSearching.value = false;
      mapIsCoordinateMode.value = false;
      mapResolvedCoordName.value = '';
      mapSelectedLat.value = null;
      mapSelectedLng.value = null;
      mapSelectedPlaceData.value = null;
    };

    const getExternalMapLink = ({ name = '', lat = null, lng = null, place_id = '' }) => {
      if (place_id) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${place_id}`;
      }
      if (lat != null && lng != null) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    };

    const getMapExportLinks = (place = {}) => {
      // 匯出文字改用與行程/住宿卡片點擊相同的地圖 App 邏輯。
      // 韓國旅程只保留 Naver Map App，不再輸出 Google Maps 導航網址。
      const title = String(place.name || place.title || place.name_ko || currentTrip.value?.name || '行程').trim();
      const address = String(place.address || '').trim();
      const queryText = [title, address, currentTrip.value?.city || ''].filter(Boolean).join(' ') || title;
      const lat = place.lat !== '' && place.lat != null ? Number(place.lat) : null;
      const lng = place.lng !== '' && place.lng != null ? Number(place.lng) : null;
      const encodedName = encodeURIComponent(title);
      const encodedQuery = encodeURIComponent(queryText || title);

      if (isKoreaTrip.value) {
        const naverApp = (lat != null && lng != null)
          ? `nmap://place?lat=${lat}&lng=${lng}&name=${encodedName}&appname=tripplanner`
          : `nmap://search?query=${encodedQuery}&appname=tripplanner`;

        return {
          app: naverApp,
          appLabel: 'Naver Map App'
        };
      }

      const googleApp = (lat != null && lng != null)
        ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`
        : `comgooglemaps://?daddr=${encodedQuery}&directionsmode=walking`;

      return {
        app: googleApp,
        appLabel: 'Google Maps App'
      };
    };

    const appendMapLinksToExport = (place, indent = '    ') => {
      const links = getMapExportLinks(place);
      let text = '';
      if (links.app) text += `${indent}📱 ${links.appLabel}：${links.app}\n`;
      return text;
    };

    const openHotelMap = (hotel) => {
      if (!hotel) return;

      const name = String(hotel.name || '住宿').trim();
      const address = String(hotel.address || '').trim();
      const lat = hotel.lat !== '' && hotel.lat != null ? Number(hotel.lat) : null;
      const lng = hotel.lng !== '' && hotel.lng != null ? Number(hotel.lng) : null;
      const queryText = [name, address].filter(Boolean).join(' ') || name || '住宿';
      const encodedName = encodeURIComponent(name || '住宿');
      const encodedQuery = encodeURIComponent(queryText);

      if (isKoreaTrip.value) {
        if (lat != null && lng != null) {
          // 住宿跟一般行程一樣，直接呼叫 Naver Map App。
          // 不再使用 setTimeout 自動開網頁，避免點住宿後跳到瀏覽器網站。
          window.location.href =
            `nmap://place?lat=${lat}&lng=${lng}&name=${encodedName}&appname=tripplanner`;
          return;
        }

        // 沒有座標時仍優先呼叫 Naver Map App 搜尋，不自動跳網站。
        window.location.href = `nmap://search?query=${encodedQuery}&appname=tripplanner`;
        return;
      }

      if (lat != null && lng != null) {
        // iPhone 已安裝 Google Maps 時會直接開 App；未安裝時才可能由系統改用網頁。
        window.location.href = `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}&zoom=16`;
        return;
      }

      window.location.href = `comgooglemaps://?q=${encodedQuery}`;
    };

    const showHotelInfoWindow = (hotel, marker) => {
      if (!infoWindow || !window.google) return;

      const buttonId = `open-hotel-map-${String(hotel.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const mapLabel = isKoreaTrip.value ? '開啟 Naver Map' : '開啟 Google Maps';

      infoWindow.setContent(
        `<div style="padding:8px; color:#111; max-width:230px;">
          <div style="font-weight:bold; margin-bottom:4px;">🏠 ${escapeHtml(hotel.name || '住宿')}</div>
          <div style="font-size:12px; color:#555; margin-bottom:3px;">${escapeHtml(hotelDayRangeLabel(hotel))}</div>
          <div style="font-size:12px; color:#555; margin-bottom:8px;">${escapeHtml(hotel.address || '')}</div>
          <button
            id="${buttonId}"
            style="background:#0d9488;color:white;border:0;border-radius:8px;padding:7px 10px;font-weight:bold;font-size:12px;"
          >${mapLabel}</button>
        </div>`
      );

      infoWindow.open(mapInstance, marker);

      google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
        const btn = document.getElementById(buttonId);
        if (btn) btn.onclick = () => openHotelMap(hotel);
      });
    };

    const getMapDisplayDay = () => {
      const raw = String(mapDisplayFilter.value || 'all');
      if (!raw.startsWith('day-')) return null;
      const day = parseInt(raw.replace('day-', ''), 10);
      return Number.isFinite(day) && day > 0 ? day : null;
    };

    const applyMapDisplayFilter = () => {
      const day = getMapDisplayDay();
      if (day) {
        currentDay.value = day;
        mapAddDay.value = day;
      }
      updateMapMarkers();
    };

    const showSearchResultOnMap = ({ name = '', address = '', lat = null, lng = null, place_id = '' }) => {
      if (!mapInstance || !window.google || lat == null || lng == null) return;

      clearMapSearchMarker();

      mapLatestResult.value = {
        name: name || '搜尋結果',
        address: address || '',
        lat: Number(lat),
        lng: Number(lng),
        place_id: place_id || ''
      };

      mapSearchMarker = new google.maps.Marker({
        position: { lat: Number(lat), lng: Number(lng) },
        map: mapInstance,
        title: name || '搜尋結果',
        label: { text: '搜', color: 'white' },
        zIndex: 999
      });

      const openInfo = () => {
        const link = getExternalMapLink({ name, lat, lng, place_id });
        infoWindow.setContent(
          `<div style="padding:6px; color:#111; max-width:220px;">
            <b>${escapeHtml(name || '搜尋結果')}</b><br/>
            <span style="font-size:12px; color:#555">${escapeHtml(address || '')}</span><br/>
            <a href="${link}" target="_blank" style="color:#2563eb;">Google Maps</a>
          </div>`
        );
        infoWindow.open(mapInstance, mapSearchMarker);
      };

      mapSearchMarker.addListener('click', openInfo);
      mapInstance.setCenter({ lat: Number(lat), lng: Number(lng) });
      mapInstance.setZoom(15);
      openInfo();
    };


    const makeMapPinIcon = (fillColor) => {
      if (!window.google || !google.maps) return null;

      // 備案 marker 使用跟 Google 預設紅色 pin 接近的尺寸。
      // 不加白框，避免地圖上看起來比正式行程 marker 更大或形狀怪異。
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">
          <path
            d="M13.5 0C6.04 0 0 6.04 0 13.5C0 23.63 13.5 43 13.5 43C13.5 43 27 23.63 27 13.5C27 6.04 20.96 0 13.5 0Z"
            fill="${fillColor}"
          />
        </svg>
      `;

      return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(27, 43),
        anchor: new google.maps.Point(13.5, 43),
        labelOrigin: new google.maps.Point(13.5, 13.5)
      };
    };

    const updateMapMarkers = () => {
      if (!mapInstance || !window.google) return;

      markers.forEach(m => m.setMap(null));
      markers = [];
      clearMapRouteLine();

      const displayDay = getMapDisplayDay();
      let itemsToRender = itinerary.value.filter(item => item.lat && item.lng && !isAlternativeItem(item));

      if (displayDay) {
        itemsToRender = itemsToRender.filter(item => (item.day ? parseInt(item.day,10) : 1) === displayDay);
      }

      const bounds = new google.maps.LatLngBounds();
      let hasPoint = false;

      itemsToRender.forEach(item => {
        const d = item.day ? parseInt(item.day,10) : 1;

        const marker = new google.maps.Marker({
          position: { lat: Number(item.lat), lng: Number(item.lng) },
          map: mapInstance,
          label: { text: d.toString(), color: "white" },
          title: item.name
        });

        marker.addListener("click", () => {
          if (isKoreaTrip.value) {
            const buttonId = `open-itinerary-map-${String(item.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
            infoWindow.setContent(
              `<div style="padding:8px; color:#111; max-width:240px;">
                <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(item.name || '')}</div>
                <div style="font-size:12px; color:#555; margin-bottom:8px;">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(item.message||'')}</div>
                <button
                  id="${buttonId}"
                  style="background:#ef4444;color:white;border:0;border-radius:8px;padding:7px 10px;font-weight:bold;font-size:12px;"
                >開啟 Naver Map</button>
              </div>`
            );
            infoWindow.open(mapInstance, marker);

            google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
              const btn = document.getElementById(buttonId);
              if (btn) btn.onclick = () => openExternalMap(item);
            });
            return;
          }

          const link = item.place_id
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}&query_place_id=${item.place_id}`
            : `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;

          infoWindow.setContent(
            `<div style="padding:6px; color:#111">
              <b>${escapeHtml(item.name || '')}</b><br/>
              <span style="font-size:12px; color:#555">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(item.message||'')}</span><br/>
              <a href="${link}" target="_blank" style="color:#2563eb;">Google Maps</a>
            </div>`
          );
          infoWindow.open(mapInstance, marker);
        });

        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });


      let alternativeItemsToRender = itinerary.value.filter(item => item.lat && item.lng && isAlternativeItem(item));
      if (displayDay) {
        alternativeItemsToRender = alternativeItemsToRender.filter(item => (item.day ? parseInt(item.day,10) : 1) === displayDay);
      }

      alternativeItemsToRender.forEach(item => {
        const d = item.day ? parseInt(item.day,10) : 1;
        const marker = new google.maps.Marker({
          position: { lat: Number(item.lat), lng: Number(item.lng) },
          map: mapInstance,
          label: { text: d.toString(), color: 'white', fontWeight: 'bold' },
          icon: makeMapPinIcon('#f59e0b'),
          zIndex: 850,
          title: item.name ? `備案：${item.name}` : `Day ${d} 備案`
        });

        marker.addListener('click', () => {
          const buttonId = `open-alt-map-${String(item.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
          infoWindow.setContent(
            `<div style="padding:8px; color:#111; max-width:240px;">
              <div style="margin-bottom:5px;">
                <span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:999px;padding:2px 7px;font-size:11px;font-weight:bold;">📌 備案</span>
              </div>
              <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(item.name || '備案')}</div>
              <div style="font-size:12px; color:#555; margin-bottom:8px;">Day ${d}${formatTime(item.time) ? '｜' + escapeHtml(formatTime(item.time)) : ''}${item.message ? '｜' + escapeHtml(item.message) : ''}</div>
              <button
                id="${buttonId}"
                style="background:#f59e0b;color:white;border:0;border-radius:8px;padding:7px 10px;font-weight:bold;font-size:12px;"
              >開啟地圖 App</button>
            </div>`
          );
          infoWindow.open(mapInstance, marker);

          google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.onclick = () => openExternalMap(item);
          });
        });

        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });

      let hotelsToRender = hotels.value.filter(hotel => hotel.lat != null && hotel.lng != null);
      if (displayDay) {
        hotelsToRender = hotelsToRender.filter(hotel => isHotelActiveOnDay(hotel, displayDay));
      }

      hotelsToRender.forEach(hotel => {
        const marker = new google.maps.Marker({
          position: { lat: Number(hotel.lat), lng: Number(hotel.lng) },
          map: mapInstance,
          label: { text: '🏠', fontSize: '16px' },
          icon: makeMapPinIcon('#0d9488'),
          zIndex: 900,
          title: hotel.name || '住宿'
        });

        marker.addListener('click', () => {
          showHotelInfoWindow(hotel, marker);
        });

        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });

      let routeItems = [];
      if (displayDay) {
        routeItems = sortDayItemsByStoredOrder(itemsToRender).concat(
          hotelsToRender.map(hotel => ({
            id: `hotel-${hotel.id}`,
            name: hotel.name || '住宿',
            lat: hotel.lat,
            lng: hotel.lng,
            isHotelRoutePoint: true
          }))
        );
      } else {
        routeItems = itemsToRender.slice().sort((a, b) => {
          const dayDiff = (a.day ? parseInt(a.day,10) : 1) - (b.day ? parseInt(b.day,10) : 1);
          if (dayDiff !== 0) return dayDiff;
          const oa = normalizeOrderValue(a.order);
          const ob = normalizeOrderValue(b.order);
          if (oa != null && ob != null && oa !== ob) return oa - ob;
          if (oa != null && ob == null) return -1;
          if (oa == null && ob != null) return 1;
          return timeToNum(a.time) - timeToNum(b.time);
        });
      }

      if (routeItems.length >= 2) {
        mapRouteLine = new google.maps.Polyline({
          path: routeItems.map(item => ({ lat: Number(item.lat), lng: Number(item.lng) })),
          map: mapInstance,
          strokeColor: '#2563eb',
          strokeOpacity: 0.65,
          strokeWeight: 3
        });
      }

      if (!hasPoint && mapLatestResult.value) {
        hasPoint = true;
        bounds.extend({ lat: Number(mapLatestResult.value.lat), lng: Number(mapLatestResult.value.lng) });
      }

      if (hasPoint) {
        mapInstance.fitBounds(bounds);
      } else if (currentTrip.value?.city && window.google) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: currentTrip.value.city }, (results, status) => {
          if (status === 'OK' && results[0]) {
            mapInstance.setCenter(results[0].geometry.location);
            mapInstance.setZoom(12);
          }
        });
      }
    };

    const fitBoundsToTrip = () => {
      updateMapMarkers();
    };

    const addMapSearchResultToItinerary = async () => {
      if (isAddingMapPlace.value) return;
      if (!currentTrip.value || !mapLatestResult.value) return;

      isAddingMapPlace.value = true;
      setTimeout(() => {
        isAddingMapPlace.value = false;
      }, 500);

      const id = generateId();
      const d = mapAddDay.value || currentDay.value || 1;
      const item = {
        id,
        name: mapLatestResult.value.name || mapSearchQuery.value || '搜尋結果',
        name_ko: '',
        address: mapLatestResult.value.address || '',
        day: d,
        lat: Number(mapLatestResult.value.lat),
        lng: Number(mapLatestResult.value.lng),
        place_id: mapLatestResult.value.place_id || '',
        message: '',
        time: '',
        trip_id: currentTrip.value.id,
        is_alternative: ''
      };

      const oldIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
      const ids = oldIds.slice();
      ids.push(String(id));

      itinerary.value.push(item);
      setOrderIds(currentTrip.value.id, d, ids);
      currentDay.value = d;
      mapDisplayFilter.value = `day-${d}`;
      clearMapSearchResult();

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      try {
        const res = await postJSON({ action:'add', type:'itinerary', data: item });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'add itinerary failed');
        }
        await saveOrderToDB(currentTrip.value.id, d, ids);
      } catch (err) {
        console.error('add map itinerary sync failed:', err);

        const idx = itinerary.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) itinerary.value.splice(idx, 1);

        const rollbackIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
        setOrderIds(currentTrip.value.id, d, rollbackIds);
        try { await saveOrderToDB(currentTrip.value.id, d, rollbackIds); } catch(e) {}

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();

        alert('行程新增失敗，已取消剛剛新增的資料，請稍後再試。');
      }
    };

    const searchMapPlacesInput = async () => {
      const q = mapSearchQuery.value.trim();

      if (!q) {
        mapTranslatedSearchHint.value = '';
        clearMapSearchResult();
        return;
      }

      const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
      if (coordRegex.test(q)) {
        mapIsCoordinateMode.value = true;
        mapIsSearching.value = false;
        const parts = q.split(',');
        mapSelectedLat.value = parseFloat(parts[0]);
        mapSelectedLng.value = parseFloat(parts[1]);
        mapResolvedCoordName.value = `座標 ${parts[0].trim()}, ${parts[1].trim()}`;
        mapSearchResults.value = [];
        mapTranslatedSearchHint.value = '';
        mapSelectedPlaceData.value = null;
        return;
      }

      mapIsCoordinateMode.value = false;
      mapSelectedLat.value = null;
      mapSelectedLng.value = null;
      mapResolvedCoordName.value = '';
      mapSelectedPlaceData.value = null;
      mapIsSearching.value = true;

      if (mapSearchTimeout) clearTimeout(mapSearchTimeout);

      mapSearchTimeout = setTimeout(async () => {
        try {
          const opts = {};
          if (mapInstance && typeof mapInstance.getBounds === 'function') {
            const bounds = mapInstance.getBounds();
            if (bounds) opts.bounds = bounds;
          }
          const out = await searchPlacesWithTranslation(q, opts);
          mapSearchResults.value = out.predictions || [];
          mapTranslatedSearchHint.value = out.hint || '';
          mapIsSearching.value = false;
        } catch (err) {
          console.error(err);
          mapSearchResults.value = [];
          mapIsSearching.value = false;
        }
      }, 250);
    };

    const useMapCoordinateInput = async () => {
      await searchCityAndJump();
    };

    const selectMapPlace = async (item) => {
      mapSearchQuery.value = item.description || item.structured_formatting?.main_text || '';
      mapSelectedPlaceData.value = item;
      mapSearchResults.value = [];
      mapIsSearching.value = false;
      mapIsCoordinateMode.value = false;
      await searchCityAndJump();
    };


    const searchCityAndJump = async () => {
      const q = mapSearchQuery.value.trim();
      if (!q) {
        clearMapSearchResult();
        return;
      }

      if (!window.google || !window.google.maps) {
        await loadGoogleMaps();
      }
      if (!mapInstance) {
        initGoogleMap();
      }
      if (!window.google || !mapInstance) return;

      if (mapIsCoordinateMode.value && mapSelectedLat.value != null && mapSelectedLng.value != null) {
        showSearchResultOnMap({
          name: mapResolvedCoordName.value || q,
          address: '座標搜尋',
          lat: mapSelectedLat.value,
          lng: mapSelectedLng.value,
          place_id: ''
        });
        mapSearchResults.value = [];
        return;
      }

      if (mapSelectedPlaceData.value?.place_id) {
        const place = await getPlaceDetails(mapSelectedPlaceData.value.place_id, 'zh-TW');
        if (place?.geometry?.location) {
          showSearchResultOnMap({
            name: place.name || q,
            address: place.formatted_address || '',
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            place_id: mapSelectedPlaceData.value.place_id
          });
          mapSearchResults.value = [];
          return;
        }
      }

      const geocoder = new google.maps.Geocoder();
      const city = String(currentTrip.value?.city || '').trim();
      const fallbackQuery = city && !q.includes(city) ? `${q} ${city}` : q;
      const translatedInfo = await translatePlaceKeyword(q);
      const geocodeQuery = translatedInfo?.keyword || fallbackQuery;
      if (translatedInfo?.translated) mapTranslatedSearchHint.value = `翻譯搜尋：${translatedInfo.translated}`;

      geocoder.geocode({ address: geocodeQuery }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const r = results[0];
          showSearchResultOnMap({
            name: r.address_components?.[0]?.long_name || q,
            address: r.formatted_address || geocodeQuery,
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
            place_id: r.place_id || ''
          });
          mapSearchResults.value = [];
          return;
        }
        alert('找不到這個地點');
      });
    };

    const fetchTrips = async () => {
      const t0 = performance.now();
      isLoading.value = true;
      try {
        const t_api0 = performance.now();
        const data = await apiGet({ type: 'trips' });
        const t_api1 = performance.now();

        console.log('fetchTrips api ms =', Math.round(t_api1 - t_api0), data);

        trips.value = Array.isArray(data) ? data : [];
        saveTripsCache();

        const t_assign = performance.now();
        console.log('fetchTrips assign ms =', Math.round(t_assign - t_api1));
      } catch (err) {
        console.error('fetchTrips failed:', err);
      } finally {
        console.log('fetchTrips total ms =', Math.round(performance.now() - t0));
        isLoading.value = false;
      }
    };

    const createTrip = async () => {
      const name = newTripName.value.trim();
      if(!name) return;

      const id = generateId();
      const newTrip = {
        id,
        name,
        city: newTripCity.value.trim() || '',
        start_date: ''
      };

      trips.value.push(newTrip);
      newTripName.value = '';
      newTripCity.value = '';

      await postJSON({ action: 'add', type: 'trips', data: newTrip });
    };

    const selectTrip = async (trip) => {
      if(!trip) return;

      currentTrip.value = trip;

      itinerary.value = [];
      expenses.value = [];
      people.value = [];
      hotels.value = [];
      hotelSearchQuery.value = '';
      hotelSearchResults.value = [];
      hotelSelectedPlaceData.value = null;
      newHotel.value = { start_day: 1, end_day: 1 };
      currentDay.value = 1;
      totalDays.value = 1;
      mapSearchQuery.value = '';
      mapAddDay.value = 1;
      mapDisplayFilter.value = 'all';
      clearMapSearchResult();

      currentView.value = 'app';

      const tripId = trip.id;
      loadTripCache(tripId);
      applyEntryDayByToday();

      await nextTick();
      scheduleSortableInit();

      if (currentTab.value === 'map') {
        await loadGoogleMaps();
        initGoogleMap();
      } else {
        updateMapMarkers();
      }

      loadPendingQueue(tripId);
      if (pendingSyncQueue.value.length) {
        flushPendingQueue().then(() => fetchData({ autoSelectToday: true }));
      } else {
        fetchData({ autoSelectToday: true });
      }
    };

    const exitTrip = () => {
      currentView.value = 'lobby';
      currentTrip.value = null;
      pendingSyncQueue.value = [];
      syncStatus.value = 'synced';
      syncMessage.value = '';
      mapSearchQuery.value = '';
      mapDisplayFilter.value = 'all';
      clearMapSearchResult();
      fetchTrips();
    };

    const deleteTripTotally = async () => {
      if(!confirm('確定刪除此旅程？此操作無法復原。')) return;
      await postJSON({ action: 'del', type: 'trips', id: currentTrip.value.id });
      exitTrip();
      await fetchTrips();
    };

    const fetchData = async (options = {}) => {
      if(!currentTrip.value) return;

      const tripId = currentTrip.value.id;
      const t_start = performance.now();
      isLoading.value = true;

      try {
        const t_api_start = performance.now();
        const data = await apiGet({ type:'tripData', tripId });
        const t_api_end = performance.now();

        console.log("tripData response ms =", Math.round(t_api_end - t_api_start), data);

        const trip = data?.trip || null;
        const itin = Array.isArray(data?.itinerary) ? data.itinerary : [];
        const exp  = Array.isArray(data?.expenses) ? data.expenses : [];
        const ppl  = Array.isArray(data?.people) ? data.people : [];
        const htl  = Array.isArray(data?.hotels) ? data.hotels : [];
        itinerary.value = itin.map(normalizeItineraryRecord);
        expenses.value = exp.map(normalizeExpenseRecord);
        people.value = ppl.length ? ppl : [{id:'default', name:'我'}];
        hotels.value = htl.map(normalizeHotelRecord);
        alternatives.value = [];

        if (trip) {
          currentTrip.value = { ...currentTrip.value, ...trip };
        }

        const maxDay = itinerary.value.reduce((m, it) =>
          Math.max(m, it.day ? parseInt(it.day,10) : 1), 1);

        totalDays.value = Math.max(1, maxDay);
        if (options.autoSelectToday) {
          applyEntryDayByToday();
        }

        await ensureAllDayOrdersSynced(tripId);

        await nextTick();
        scheduleSortableInit();

        if (currentTab.value === 'map') {
          await loadGoogleMaps();
          initGoogleMap();
          setTimeout(() => {
            if (mapInstance && window.google) {
              google.maps.event.trigger(mapInstance, 'resize');
              updateMapMarkers();
            }
          }, 100);
        } else {
          updateMapMarkers();
        }

        saveTripCache(tripId);
      } finally {
        console.log("fetchData total ms =", Math.round(performance.now() - t_start));
        isLoading.value = false;
      }
    };

    const onDayClick = async (d) => {
      currentDay.value = d;
      await nextTick();
      scheduleSortableInit();
    };

    const onDayDblClick = (d) => {
      modalDay.value = d;
      if (d === 1) {
        const base = parseYMD(currentTrip.value?.start_date);
        dateInput.value = toYMD(base || new Date());
      }
      swapTargetDay.value = 0;
      showDayModal.value = true;
    };

    const closeDayModal = () => {
      showDayModal.value = false;
    };

    const applyDay1Date = async () => {
      const pick = parseYMD(dateInput.value);
      if (!pick || !currentTrip.value) {
        showDayModal.value = false;
        return;
      }

      const ymd = toYMD(pick);
      const tripId = currentTrip.value.id;
      const oldStartDate = currentTrip.value.start_date || '';
      const tripIdx = trips.value.findIndex(t => String(t.id) === String(tripId));
      const oldTripStartDate = tripIdx !== -1 ? (trips.value[tripIdx].start_date || '') : '';

      // 先更新前端畫面，讓日期立即生效。
      currentTrip.value.start_date = ymd;
      if (tripIdx !== -1) trips.value[tripIdx].start_date = ymd;
      showDayModal.value = false;
      scheduleTripCacheSave();
      scheduleTripsCacheSave();

      // 後端背景同步；失敗才回復前端資料。
      try {
        const res = await postJSON({
          action:'set_trip_start_date',
          type:'trips',
          tripId,
          start_date: ymd
        });

        if (res && res.status === 'error') {
          throw new Error(res.message || 'set_trip_start_date failed');
        }
      } catch (err) {
        console.error('applyDay1Date sync failed:', err);

        if (currentTrip.value && String(currentTrip.value.id) === String(tripId)) {
          currentTrip.value.start_date = oldStartDate;
        }
        if (tripIdx !== -1 && trips.value[tripIdx]) {
          trips.value[tripIdx].start_date = oldTripStartDate;
        }

        scheduleTripCacheSave();
        scheduleTripsCacheSave();
        alert('日期更新失敗，已回復原本日期，請稍後再試。');
      }
    };

    const swapWithDay = async () => {
      if (!currentTrip.value) return;

      const tripId = currentTrip.value.id;
      const dayA = parseInt(modalDay.value, 10);
      const dayB = parseInt(swapTargetDay.value, 10);
      if (!dayA || !dayB || dayA === dayB) return;

      const backupItinerary = itinerary.value.map(item => ({ ...item }));
      const backupCurrentDay = currentDay.value;
      const backupMapDisplayFilter = mapDisplayFilter.value;

      const selectedAIds = getOrderIds(tripId, dayA, false);
      const selectedBIds = getOrderIds(tripId, dayB, false);
      const alternativeAIds = getOrderIds(tripId, dayA, true);
      const alternativeBIds = getOrderIds(tripId, dayB, true);

      // 先更新前端畫面，讓天數交換立即生效。
      itinerary.value.forEach((item) => {
        const d = item.day ? parseInt(item.day, 10) || 1 : 1;
        if (d === dayA) {
          item.day = dayB;
          item.order = null;
        } else if (d === dayB) {
          item.day = dayA;
          item.order = null;
        }
      });

      setOrderIds(tripId, dayA, selectedBIds, false);
      setOrderIds(tripId, dayB, selectedAIds, false);
      setOrderIds(tripId, dayA, alternativeBIds, true);
      setOrderIds(tripId, dayB, alternativeAIds, true);

      currentDay.value = dayA;
      showDayModal.value = false;

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      // 後端背景同步；如果交換本身失敗，才回復前端資料。
      let swapCommitted = false;
      try {
        const res = await postJSON({
          action:'swap_days',
          tripId,
          dayA: String(dayA),
          dayB: String(dayB)
        });

        if (res && res.status === 'error') {
          throw new Error(res.message || 'swap_days failed');
        }
        swapCommitted = true;

        const orderResults = await Promise.allSettled([
          saveOrderToDB(tripId, dayA, selectedBIds, false),
          saveOrderToDB(tripId, dayB, selectedAIds, false),
          saveOrderToDB(tripId, dayA, alternativeBIds, true),
          saveOrderToDB(tripId, dayB, alternativeAIds, true)
        ]);

        const orderFailed = orderResults.some(r => r.status === 'rejected');
        if (orderFailed) {
          throw new Error('save swapped order failed');
        }
      } catch (err) {
        console.error('swapWithDay sync failed:', err);

        if (swapCommitted) {
          // 天數已經寫入 DB，但排序同步可能失敗；重新讀取 DB，避免前後端狀態不一致。
          alert('天數已交換，但排序同步可能失敗，系統會重新同步資料。');
          await fetchData();
          currentDay.value = dayA;
          return;
        }

        itinerary.value = backupItinerary.map(item => ({ ...item }));
        currentDay.value = backupCurrentDay;
        mapDisplayFilter.value = backupMapDisplayFilter;

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();

        alert('天數交換失敗，已回復原本資料，請稍後再試。');
      }
    };

    const addNewDay = () => {
      totalDays.value++;
      currentDay.value = totalDays.value;
      scheduleSortableInit();
    };

    const deleteDay = async (d) => {
      if (!currentTrip.value) return;
      if (!confirm(`刪除 Day ${d} 的所有行程？`)) return;

      isLoading.value = true;
      try {
        const tripId = currentTrip.value.id;

        const toDelete = itinerary.value.filter(it => (it.day ? parseInt(it.day,10) : 1) === d);
        for (const it of toDelete) {
          await postJSON({ action:'del', type:'itinerary', id: it.id });
        }
        itinerary.value = itinerary.value.filter(it => (it.day ? parseInt(it.day,10) : 1) !== d);

        const toShift = itinerary.value.filter(it => (it.day ? parseInt(it.day,10) : 1) > d);
        for (const it of toShift) {
          const newDay = (it.day ? parseInt(it.day,10) : 1) - 1;
          it.day = newDay;
          await postJSON({ action:'edit', type:'itinerary', data: { id: it.id, day: newDay, trip_id: tripId }});
        }

        await postJSON({ action:'clear_order', tripId, day: String(d) });

        for (let day = d; day <= totalDays.value - 1; day++) {
          const selectedIds = getOrderIds(tripId, day, false);
          const alternativeIds = getOrderIds(tripId, day, true);
          if (selectedIds.length) await saveOrderToDB(tripId, day, selectedIds, false);
          if (alternativeIds.length) await saveOrderToDB(tripId, day, alternativeIds, true);
          if (!selectedIds.length && !alternativeIds.length) {
            await postJSON({ action:'clear_order', tripId, day: String(day) });
          }
        }

        await postJSON({ action:'clear_order', tripId, day: String(totalDays.value) });

        totalDays.value = Math.max(1, totalDays.value - 1);
        if (currentDay.value > totalDays.value) currentDay.value = totalDays.value;

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
      } finally {
        isLoading.value = false;
      }
    };

    const destroySortable = () => {
      if (sortable) {
        sortable.destroy();
        sortable = null;
      }
      if (alternativeSortable) {
        alternativeSortable.destroy();
        alternativeSortable = null;
      }
    };

    const getDomIds = (el) => {
      if (!el) return [];
      return Array.from(el.querySelectorAll('[data-id]'))
        .map(node => node.getAttribute('data-id'))
        .filter(Boolean);
    };

    const syncDragGroups = async () => {
      if (!currentTrip.value?.id) return;
      const day = currentDay.value;
      const selectedIds = getDomIds(itineraryListEl.value);
      const alternativeIds = getDomIds(alternativeListEl.value);

      selectedIds.forEach(id => {
        const item = itinerary.value.find(x => String(x.id) === String(id));
        if (item) {
          item.day = day;
          item.is_alternative = '';
        }
      });

      alternativeIds.forEach(id => {
        const item = itinerary.value.find(x => String(x.id) === String(id));
        if (item) {
          item.day = day;
          item.is_alternative = 'v';
        }
      });

      setOrderIds(currentTrip.value.id, day, selectedIds, false);
      setOrderIds(currentTrip.value.id, day, alternativeIds, true);

      scheduleTripCacheSave();
      updateMapMarkers();

      const edits = [...selectedIds, ...alternativeIds].map(id => {
        const item = itinerary.value.find(x => String(x.id) === String(id));
        if (!item) return Promise.resolve();
        return postJSON({
          action: 'edit',
          type: 'itinerary',
          data: {
            id: item.id,
            trip_id: currentTrip.value.id,
            day,
            is_alternative: item.is_alternative || ''
          }
        });
      });

      try {
        await Promise.allSettled(edits);
        await Promise.allSettled([
          saveOrderToDB(currentTrip.value.id, day, selectedIds, false),
          saveOrderToDB(currentTrip.value.id, day, alternativeIds, true)
        ]);
      } catch (e) {}
    };

    let lastSortableSignature = '';
    const initSortable = () => {
      if (!itineraryListEl.value || !alternativeListEl.value) {
        destroySortable();
        return;
      }
      if (currentTab.value !== 'itinerary' || !currentTrip.value) {
        destroySortable();
        return;
      }

      const selectedIds = getDomIds(itineraryListEl.value).join('|');
      const alternativeIds = getDomIds(alternativeListEl.value).join('|');
      const signature = `${currentTrip.value.id}__${currentDay.value}__${selectedIds}__${alternativeIds}`;

      if (sortable && alternativeSortable && lastSortableSignature === signature) return;

      destroySortable();
      lastSortableSignature = signature;

      const commonOptions = {
        group: 'itinerary-day-split',
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'opacity-50',
        onEnd: async () => {
          await syncDragGroups();
          lastSortableSignature = `${currentTrip.value.id}__${currentDay.value}__${getDomIds(itineraryListEl.value).join('|')}__${getDomIds(alternativeListEl.value).join('|')}`;
        }
      };

      sortable = new Sortable(itineraryListEl.value, commonOptions);
      alternativeSortable = new Sortable(alternativeListEl.value, commonOptions);
    };

    let sortableInitTimer = null;
    const scheduleSortableInit = () => {
      clearTimeout(sortableInitTimer);
      sortableInitTimer = setTimeout(async () => {
        await nextTick();
        initSortable();
      }, 30);
    };

    const filteredItinerary = computed(() => getDayOrderedItems(currentDay.value, false));

    const filteredAlternatives = computed(() => getDayOrderedItems(currentDay.value, true));

    const getHotelsForDay = (day) => {
      const d = parseInt(day, 10) || 1;
      return hotels.value
        .filter(hotel => isHotelActiveOnDay(hotel, d))
        .slice()
        .sort((a, b) => {
          const sa = parseInt(a.start_day, 10) || 1;
          const sb = parseInt(b.start_day, 10) || 1;
          if (sa !== sb) return sa - sb;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
    };

    const currentDayHotels = computed(() => getHotelsForDay(currentDay.value));

    let searchTimeout = null;

    const searchPlacesInput = async () => {
      const q = newPlace.value.trim();

      if (!q) {
        searchResults.value = [];
        translatedSearchHint.value = '';
        isCoordinateMode.value = false;
        isSearching.value = false;
        return;
      }

      const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
      if (coordRegex.test(q)) {
        isCoordinateMode.value = true;
        isSearching.value = false;
        translatedSearchHint.value = '';

        const parts = q.split(',');
        selectedLat.value = parseFloat(parts[0]);
        selectedLng.value = parseFloat(parts[1]);
        resolvedCoordName.value = '座標';
        return;
      } else {
        isCoordinateMode.value = false;
        selectedLat.value = null;
        selectedLng.value = null;
        resolvedCoordName.value = '';
      }

      selectedPlaceData.value = null;
      isSearching.value = true;

      if (searchTimeout) clearTimeout(searchTimeout);

      searchTimeout = setTimeout(async () => {
        try {
          const out = await searchPlacesWithTranslation(q);
          searchResults.value = out.predictions || [];
          translatedSearchHint.value = out.hint || '';
          isSearching.value = false;
        } catch (err) {
          console.error(err);
          searchResults.value = [];
          isSearching.value = false;
        }
      }, 300);
    };

    const useCoordinateInput = () => {
      if (resolvedCoordName.value) newPlace.value = resolvedCoordName.value;
      addPlace();
    };

    const selectPlace = (item) => {
      newPlace.value = item.structured_formatting.main_text;
      selectedPlaceData.value = item;
      searchResults.value = [];
      translatedSearchHint.value = '';
    };


    const addPlace = async () => {
      if (isAddingPlace.value) return;
      if(!currentTrip.value) return;

      const placeName = newPlace.value.trim();
      if(!placeName) return;

      isAddingPlace.value = true;
      setTimeout(() => {
        isAddingPlace.value = false;
      }, 500);

      const id = generateId();
      const d = currentDay.value;
      const selectedPlaceSnapshot = selectedPlaceData.value ? { ...selectedPlaceData.value } : null;
      const selectedLatSnapshot = selectedLat.value;
      const selectedLngSnapshot = selectedLng.value;
      const noteSnapshot = newNote.value || '';
      const timeSnapshot = newTime.value || '';

      const item = {
        id,
        name: placeName,
        name_ko: '',
        address: '',
        day: d,
        lat: selectedLatSnapshot != null ? selectedLatSnapshot : null,
        lng: selectedLngSnapshot != null ? selectedLngSnapshot : null,
        place_id: selectedPlaceSnapshot?.place_id || '',
        message: noteSnapshot,
        time: timeSnapshot,
        trip_id: currentTrip.value.id,
        is_alternative: ''
      };

      const oldIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
      const ids = oldIds.slice();
      ids.push(String(id));

      itinerary.value.push(item);
      setOrderIds(currentTrip.value.id, d, ids);

      newPlace.value = '';
      newNote.value = '';
      newTime.value = '';
      selectedPlaceData.value = null;
      searchResults.value = [];
      translatedSearchHint.value = '';
      selectedLat.value = null;
      selectedLng.value = null;
      isCoordinateMode.value = false;
      resolvedCoordName.value = '';

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      try {
        let lat = item.lat;
        let lng = item.lng;
        let placeId = item.place_id || '';
        let displayName = placeName;
        let nameKo = '';
        let address = '';

        if (selectedPlaceSnapshot?.place_id) {
          placeId = selectedPlaceSnapshot.place_id;

          const normalPlace = await getPlaceDetails(placeId, 'zh-TW');
          if (normalPlace) {
            displayName = normalPlace.name || placeName;
            address = normalPlace.formatted_address || '';
            if (normalPlace.geometry?.location) {
              lat = normalPlace.geometry.location.lat();
              lng = normalPlace.geometry.location.lng();
            }
          }

          if (isKoreaTrip.value) {
            const koPlace = await getPlaceDetails(placeId, 'ko');
            if (koPlace) {
              nameKo = koPlace.name || '';
              if (!address) address = koPlace.formatted_address || '';
              if ((lat == null || lng == null) && koPlace.geometry?.location) {
                lat = koPlace.geometry.location.lat();
                lng = koPlace.geometry.location.lng();
              }
            }
          }
        } else if (selectedLatSnapshot != null && selectedLngSnapshot != null) {
          lat = selectedLatSnapshot;
          lng = selectedLngSnapshot;
          placeId = '';
        } else if (window.google) {
          const geocoder = new google.maps.Geocoder();
          await new Promise((resolve) => {
            geocoder.geocode(
              { address: placeName + (currentTrip.value.city ? " " + currentTrip.value.city : "") },
              (results, status) => {
                if (status === 'OK' && results && results[0]) {
                  lat = results[0].geometry.location.lat();
                  lng = results[0].geometry.location.lng();
                  placeId = results[0].place_id || '';
                  address = results[0].formatted_address || '';
                }
                resolve();
              }
            );
          });
        }

        const updatedItem = {
          id,
          name: displayName || placeName,
          name_ko: nameKo || '',
          address: address || '',
          day: d,
          lat,
          lng,
          place_id: placeId,
          message: noteSnapshot,
          time: timeSnapshot,
          trip_id: currentTrip.value.id,
          order: item.order,
          is_alternative: ''
        };

        const idx = itinerary.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) {
          itinerary.value.splice(idx, 1, updatedItem);
        }

        const res = await postJSON({ action:'add', type:'itinerary', data: updatedItem });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'add itinerary failed');
        }

        await saveOrderToDB(currentTrip.value.id, d, ids);
        updateMapMarkers();
        scheduleTripCacheSave();
      } catch (err) {
        console.error('addPlace sync failed:', err);

        const idx = itinerary.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) itinerary.value.splice(idx, 1);

        const rollbackIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
        setOrderIds(currentTrip.value.id, d, rollbackIds);
        try { await saveOrderToDB(currentTrip.value.id, d, rollbackIds); } catch(e) {}

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();

        alert('行程新增失敗，已取消剛剛新增的資料，請稍後再試。');
      }
    };

    const removePlace = async (id) => {
      const i = itinerary.value.findIndex(x => String(x.id) === String(id));
      const removedName = i !== -1 ? itinerary.value[i].name : '行程';
      const removedIsAlt = i !== -1 ? isAlternativeItem(itinerary.value[i]) : false;
      if (!confirm(removedIsAlt ? '確定刪除此備案？' : '確定刪除此行程？')) return;

      const removedDay = i !== -1 ? (itinerary.value[i].day ? parseInt(itinerary.value[i].day,10) : 1) : currentDay.value;
      if(i !== -1) itinerary.value.splice(i, 1);

      await postJSON({ action:'del', type:'itinerary', id });

      const ids = getOrderIds(currentTrip.value.id, removedDay, removedIsAlt).filter(x => String(x) !== String(id));
      setOrderIds(currentTrip.value.id, removedDay, ids, removedIsAlt);
      try { await saveOrderToDB(currentTrip.value.id, removedDay, ids, removedIsAlt); } catch(e){}

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
    };


    const searchAlternativePlacesInput = async () => {
      const q = alternativeSearchQuery.value.trim();

      if (!q) {
        alternativeSearchResults.value = [];
        alternativeIsSearching.value = false;
        alternativeSelectedPlaceData.value = null;
        return;
      }

      alternativeSelectedPlaceData.value = null;
      alternativeIsSearching.value = true;

      if (alternativeSearchTimeout) clearTimeout(alternativeSearchTimeout);

      alternativeSearchTimeout = setTimeout(async () => {
        try {
          if (!window.google || !window.google.maps) {
            await loadGoogleMaps();
          }

          if (!autocompleteService) {
            autocompleteService = new google.maps.places.AutocompleteService();
          }

          autocompleteService.getPlacePredictions(
            { input: q, language: 'zh-TW' },
            (predictions, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                alternativeSearchResults.value = predictions;
              } else {
                alternativeSearchResults.value = [];
              }
              alternativeIsSearching.value = false;
            }
          );
        } catch (err) {
          console.error(err);
          alternativeSearchResults.value = [];
          alternativeIsSearching.value = false;
        }
      }, 300);
    };

    const selectAlternativePlace = (item) => {
      alternativeSearchQuery.value = item.structured_formatting.main_text;
      alternativeSelectedPlaceData.value = item;
      alternativeSearchResults.value = [];
      alternativeIsSearching.value = false;
    };

    const addAlternative = async () => {
      if (isAddingAlternative.value) return;
      if (!currentTrip.value?.id) return;

      const name = alternativeSearchQuery.value.trim();
      if (!name) return;

      isAddingAlternative.value = true;
      setTimeout(() => {
        isAddingAlternative.value = false;
      }, 500);

      const id = generateId();
      const d = currentDay.value || 1;
      const selectedPlaceSnapshot = alternativeSelectedPlaceData.value ? { ...alternativeSelectedPlaceData.value } : null;
      const messageSnapshot = newAlternative.value.message || '';

      const alt = {
        id,
        trip_id: currentTrip.value.id,
        day: d,
        name,
        lat: null,
        lng: null,
        place_id: selectedPlaceSnapshot?.place_id || '',
        address: '',
        message: messageSnapshot,
        created_at: new Date().toISOString()
      };

      alternatives.value.unshift(alt);

      alternativeSearchQuery.value = '';
      alternativeSearchResults.value = [];
      alternativeSelectedPlaceData.value = null;
      alternativeIsSearching.value = false;
      newAlternative.value = { message: '' };

      scheduleTripCacheSave();

      try {
        let lat = null;
        let lng = null;
        let placeId = alt.place_id || '';
        let displayName = name;
        let address = '';

        if (selectedPlaceSnapshot?.place_id) {
          placeId = selectedPlaceSnapshot.place_id;

          const place = await getPlaceDetails(placeId, 'zh-TW');
          if (place) {
            displayName = place.name || name;
            address = place.formatted_address || '';
            if (place.geometry?.location) {
              lat = place.geometry.location.lat();
              lng = place.geometry.location.lng();
            }
          }
        } else if (window.google) {
          const geocoder = new google.maps.Geocoder();
          await new Promise((resolve) => {
            geocoder.geocode(
              { address: name + (currentTrip.value.city ? " " + currentTrip.value.city : "") },
              (results, status) => {
                if (status === 'OK' && results && results[0]) {
                  lat = results[0].geometry.location.lat();
                  lng = results[0].geometry.location.lng();
                  placeId = results[0].place_id || '';
                  address = results[0].formatted_address || '';
                }
                resolve();
              }
            );
          });
        }

        const updatedAlt = normalizeAlternativeRecord({
          ...alt,
          name: displayName || name,
          lat,
          lng,
          place_id: placeId,
          address
        });

        const idx = alternatives.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) {
          alternatives.value.splice(idx, 1, updatedAlt);
        }

        const res = await postJSON({ action:'add', type:'alternatives', data: updatedAlt });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'add alternative failed');
        }

        scheduleTripCacheSave();
      } catch (err) {
        console.error('addAlternative sync failed:', err);

        const idx = alternatives.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) alternatives.value.splice(idx, 1);

        scheduleTripCacheSave();
        alert('備案新增失敗，已取消剛剛新增的資料，請稍後再試。');
      }
    };

    const removeAlternative = async (id) => {
      if (isDeletingAlternative.value) return;
      if (!confirm('確定刪除此備案？')) return;

      isDeletingAlternative.value = true;

      const idx = alternatives.value.findIndex(x => String(x.id) === String(id));
      const backup = idx !== -1 ? { ...alternatives.value[idx] } : null;
      if (idx !== -1) alternatives.value.splice(idx, 1);
      scheduleTripCacheSave();

      try {
        const res = await postJSON({ action:'del', type:'alternatives', id });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'delete alternative failed');
        }
      } catch (err) {
        console.error('removeAlternative failed:', err);
        if (backup) alternatives.value.splice(idx < 0 ? alternatives.value.length : idx, 0, backup);
        scheduleTripCacheSave();
        alert('備案刪除失敗，請稍後再試。');
      } finally {
        isDeletingAlternative.value = false;
      }
    };

    const addAlternativeToItinerary = async (alt) => {
      if (isAddingAlternativeToItinerary.value) return;
      if (!currentTrip.value?.id || !alt) return;

      isAddingAlternativeToItinerary.value = true;
      setTimeout(() => {
        isAddingAlternativeToItinerary.value = false;
      }, 500);

      const id = generateId();
      const d = alt.day ? parseInt(alt.day, 10) || currentDay.value : currentDay.value;

      const item = normalizeItineraryRecord({
        id,
        name: alt.name || '備案',
        name_ko: '',
        address: alt.address || '',
        day: d,
        lat: alt.lat != null ? Number(alt.lat) : null,
        lng: alt.lng != null ? Number(alt.lng) : null,
        place_id: alt.place_id || '',
        message: alt.message || '',
        time: '',
        trip_id: currentTrip.value.id
      });

      const oldIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
      const ids = oldIds.slice();
      ids.push(String(id));

      itinerary.value.push(item);
      setOrderIds(currentTrip.value.id, d, ids);
      currentDay.value = d;

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      try {
        const res = await postJSON({ action:'add', type:'itinerary', data: item });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'add itinerary from alternative failed');
        }

        await saveOrderToDB(currentTrip.value.id, d, ids);
      } catch (err) {
        console.error('addAlternativeToItinerary sync failed:', err);

        const idx = itinerary.value.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) itinerary.value.splice(idx, 1);

        const rollbackIds = getOrderIds(currentTrip.value.id, d).filter(x => String(x) !== String(id));
        setOrderIds(currentTrip.value.id, d, rollbackIds);
        try { await saveOrderToDB(currentTrip.value.id, d, rollbackIds); } catch(e) {}

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();

        alert('加入正式行程失敗，已取消剛剛新增的資料，請稍後再試。');
      }
    };


    const openExternalMap = (p) => {
      if (isKoreaTrip.value) {
        const displayName = encodeURIComponent(p.name_ko || p.name || '地點');
        const searchName = encodeURIComponent(p.name_ko || p.name || '');
        const lat = p.lat !== '' && p.lat != null ? Number(p.lat) : null;
        const lng = p.lng !== '' && p.lng != null ? Number(p.lng) : null;

        // 韓國旅程一律優先直接呼叫 Naver Map App。
        // 不自動 fallback 到 Naver 網站，避免點 marker 後又跳回瀏覽器。
        if (lat != null && lng != null) {
          window.location.href = `nmap://place?lat=${lat}&lng=${lng}&name=${displayName}&appname=tripplanner`;
          return;
        }

        window.location.href = `nmap://search?query=${searchName}&appname=tripplanner`;
        return;
      }

      if (p.place_id) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`, '_blank');
        return;
      }
      if (p.lat && p.lng) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, '_blank');
        return;
      }
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.name||'') + ' ' + (currentTrip.value?.city||''))}`, '_blank');
    };

    const openEditModal = (p) => {
      if (!p || !p.id) return;
      editPlaceId.value = String(p.id);
      editPlace.value = {
        name: String(p.name || ''),
        time: formatTime(p.time || ''),
        message: String(p.message || ''),
        day: p.day ? parseInt(p.day, 10) : 1
      };
      showEditModal.value = true;
    };

    const closeEditModal = () => {
      showEditModal.value = false;
    };

    const saveEditPlace = async () => {
      if (!currentTrip.value) return;
      const id = editPlaceId.value;
      if (!id) return;

      const idx = itinerary.value.findIndex(x => String(x.id) === String(id));
      if (idx < 0) {
        showEditModal.value = false;
        return;
      }

      const tripId = currentTrip.value.id;
      const backupItinerary = itinerary.value.map(item => ({ ...item }));
      const backupCurrentDay = currentDay.value;
      const newDay = editPlace.value.day ? parseInt(editPlace.value.day, 10) : 1;
      const oldDay = itinerary.value[idx].day ? parseInt(itinerary.value[idx].day, 10) : 1;
      const currentIsAlt = isAlternativeItem(itinerary.value[idx]);

      // 先更新前端，讓編輯結果立即顯示。
      itinerary.value[idx].name = editPlace.value.name || '';
      itinerary.value[idx].time = editPlace.value.time || '';
      itinerary.value[idx].message = editPlace.value.message || '';
      itinerary.value[idx].day = newDay;
      if (oldDay !== newDay) itinerary.value[idx].order = null;

      if (oldDay !== newDay) {
        const oldIds = getOrderIds(tripId, oldDay, currentIsAlt).filter(x => String(x) !== String(id));
        setOrderIds(tripId, oldDay, oldIds, currentIsAlt);

        const newIds = getOrderIds(tripId, newDay, currentIsAlt).filter(x => String(x) !== String(id));
        newIds.push(String(id));
        setOrderIds(tripId, newDay, newIds, currentIsAlt);

        currentDay.value = newDay;
      }

      showEditModal.value = false;
      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      // 後端背景同步；失敗才回復前端資料。
      try {
        const editedItem = itinerary.value.find(x => String(x.id) === String(id));
        if (!editedItem) throw new Error('edited itinerary item missing');

        const res = await postJSON({
          action: 'edit',
          type: 'itinerary',
          data: {
            id,
            trip_id: tripId,
            name: editedItem.name || '',
            time: editedItem.time || '',
            message: editedItem.message || '',
            day: newDay,
            is_alternative: currentIsAlt ? 'v' : ''
          }
        });

        if (res && res.status === 'error') {
          throw new Error(res.message || 'edit itinerary failed');
        }

        if (oldDay !== newDay) {
          const oldIds = getOrderIds(tripId, oldDay, currentIsAlt).filter(x => String(x) !== String(id));
          const newIds = getOrderIds(tripId, newDay, currentIsAlt);
          await Promise.allSettled([
            saveOrderToDB(tripId, oldDay, oldIds, currentIsAlt),
            saveOrderToDB(tripId, newDay, newIds, currentIsAlt)
          ]);
        }
      } catch (err) {
        console.error('saveEditPlace sync failed:', err);

        itinerary.value = backupItinerary.map(item => ({ ...item }));
        currentDay.value = backupCurrentDay;

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();

        alert('行程修改失敗，已回復原本資料，請稍後再試。');
      }
    };

    const normalExpenseRecords = computed(() => {
      return expenses.value
        .filter(e => !isPublicAccountFund(e))
        .slice()
        .sort((a, b) => expenseCreatedTime(b) - expenseCreatedTime(a));
    });

    const hasExpenseFilters = computed(() =>
      expenseFilter.value.day !== 'all' ||
      expenseFilter.value.category !== 'all' ||
      expenseFilter.value.payer !== 'all'
    );

    const moneyDays = computed(() => {
      const set = new Set();
      for (let d = 1; d <= totalDays.value; d++) set.add(d);
      normalExpenseRecords.value.forEach(e => set.add(e.day ? parseInt(e.day, 10) || 1 : 1));
      return Array.from(set).sort((a, b) => a - b);
    });

    const filteredExpenses = computed(() => {
      return normalExpenseRecords.value.filter(e => {
        const dayOk = expenseFilter.value.day === 'all' || String(e.day || 1) === String(expenseFilter.value.day);
        const catOk = expenseFilter.value.category === 'all' || (e.category || '其他') === expenseFilter.value.category;
        const payerOk = expenseFilter.value.payer === 'all' || e.payer === expenseFilter.value.payer;
        return dayOk && catOk && payerOk;
      });
    });

    const filteredExpenseTotal = computed(() => filteredExpenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

    const filteredCategoryAnalysis = computed(() => {
      const stats = {};
      filteredExpenses.value.forEach(e => {
        const cat = e.category || '未分類';
        stats[cat] = (stats[cat] || 0) + (Number(e.amount) || 0);
      });
      return Object.entries(stats).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    });

    const filteredDayExpenseAnalysis = computed(() => {
      const stats = {};
      filteredExpenses.value.forEach(e => {
        const day = e.day ? parseInt(e.day, 10) || 1 : 1;
        stats[day] = (stats[day] || 0) + (Number(e.amount) || 0);
      });
      return Object.entries(stats).map(([day, total]) => ({ day: Number(day), total })).sort((a, b) => a.day - b.day);
    });

    const filteredPayerExpenseAnalysis = computed(() => {
      const stats = {};
      filteredExpenses.value.forEach(e => {
        const payer = e.payer || '未指定';
        stats[payer] = (stats[payer] || 0) + (Number(e.amount) || 0);
      });
      return Object.entries(stats).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    });


    const clearHotelSearchDropdown = () => {
      hotelSearchResults.value = [];
      hotelIsSearching.value = false;
    };

    const searchHotelPlacesInput = async () => {
      const q = hotelSearchQuery.value.trim();

      if (!q) {
        clearHotelSearchDropdown();
        hotelSelectedPlaceData.value = null;
        return;
      }

      hotelIsSearching.value = true;
      if (hotelSearchTimeout) clearTimeout(hotelSearchTimeout);

      hotelSearchTimeout = setTimeout(async () => {
        try {
          if (!window.google || !window.google.maps) {
            await loadGoogleMaps();
          }

          if (!autocompleteService) {
            autocompleteService = new google.maps.places.AutocompleteService();
          }

          autocompleteService.getPlacePredictions(
            {
              input: q,
              language: 'zh-TW',
              types: ['establishment']
            },
            (predictions, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                hotelSearchResults.value = predictions;
              } else {
                hotelSearchResults.value = [];
              }
              hotelIsSearching.value = false;
            }
          );
        } catch (err) {
          console.error(err);
          hotelSearchResults.value = [];
          hotelIsSearching.value = false;
        }
      }, 300);
    };

    const selectHotelPlace = (item) => {
      hotelSearchQuery.value = item.structured_formatting?.main_text || '';
      hotelSelectedPlaceData.value = item;
      clearHotelSearchDropdown();
    };

    const clearEditHotelSearchDropdown = () => {
      editHotelSearchResults.value = [];
      editHotelIsSearching.value = false;
    };

    const searchEditHotelPlacesInput = async () => {
      const q = editHotelSearchQuery.value.trim();

      if (!q) {
        clearEditHotelSearchDropdown();
        editHotelSelectedPlaceData.value = null;
        return;
      }

      editHotelIsSearching.value = true;
      editHotelSelectedPlaceData.value = null;
      if (editHotelSearchTimeout) clearTimeout(editHotelSearchTimeout);

      editHotelSearchTimeout = setTimeout(async () => {
        try {
          if (!window.google || !window.google.maps) {
            await loadGoogleMaps();
          }

          if (!autocompleteService) {
            autocompleteService = new google.maps.places.AutocompleteService();
          }

          autocompleteService.getPlacePredictions(
            {
              input: q,
              language: 'zh-TW',
              types: ['establishment']
            },
            (predictions, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                editHotelSearchResults.value = predictions;
              } else {
                editHotelSearchResults.value = [];
              }
              editHotelIsSearching.value = false;
            }
          );
        } catch (err) {
          console.error(err);
          editHotelSearchResults.value = [];
          editHotelIsSearching.value = false;
        }
      }, 300);
    };

    const selectEditHotelPlace = async (item) => {
      const mainText = item.structured_formatting?.main_text || item.description || '';
      editHotelSearchQuery.value = mainText;
      clearEditHotelSearchDropdown();

      const selected = {
        place_id: item.place_id || '',
        name: mainText,
        address: item.structured_formatting?.secondary_text || item.description || '',
        lat: null,
        lng: null
      };

      editHotelSelectedPlaceData.value = selected;

      try {
        if (item.place_id) {
          const place = await getPlaceDetails(item.place_id, 'zh-TW');
          if (place) {
            selected.name = place.name || selected.name;
            selected.address = place.formatted_address || selected.address;
            if (place.geometry?.location) {
              selected.lat = place.geometry.location.lat();
              selected.lng = place.geometry.location.lng();
            }
          }
        }
      } catch (err) {
        console.error('selectEditHotelPlace detail failed:', err);
      }

      editHotel.value.name = selected.name || editHotel.value.name;
      editHotel.value.address = selected.address || editHotel.value.address;
      editHotelSelectedPlaceData.value = { ...selected };
    };

    const addHotel = async () => {
      if (isAddingHotel.value) return;
      if (!currentTrip.value?.id) return;

      const startDay = parseInt(newHotel.value.start_day, 10) || 1;
      const endDay = parseInt(newHotel.value.end_day, 10) || startDay;
      const safeStart = Math.min(startDay, endDay);
      const safeEnd = Math.max(startDay, endDay);
      const keyword = hotelSearchQuery.value.trim();

      if (!keyword && !hotelSelectedPlaceData.value?.place_id) {
        alert('請先搜尋並選擇住宿地點');
        return;
      }

      if (hasHotelOverlap(safeStart, safeEnd)) {
        alert('住宿區間與既有住宿重疊，請調整 Day 起迄');
        return;
      }

      isAddingHotel.value = true;

      try {
        let placeId = hotelSelectedPlaceData.value?.place_id || '';
        let displayName = keyword;
        let address = '';
        let lat = null;
        let lng = null;

        if (placeId) {
          const place = await getPlaceDetails(placeId, 'zh-TW');
          if (place) {
            displayName = place.name || displayName;
            address = place.formatted_address || '';
            if (place.geometry?.location) {
              lat = place.geometry.location.lat();
              lng = place.geometry.location.lng();
            }
          }
        }

        if ((lat == null || lng == null) && window.google && keyword) {
          const geocoder = new google.maps.Geocoder();
          await new Promise((resolve) => {
            geocoder.geocode(
              { address: keyword + (currentTrip.value?.city ? ' ' + currentTrip.value.city : '') },
              (results, status) => {
                if (status === 'OK' && results && results[0]) {
                  displayName = results[0].name || displayName;
                  address = results[0].formatted_address || address;
                  lat = results[0].geometry.location.lat();
                  lng = results[0].geometry.location.lng();
                  placeId = results[0].place_id || placeId;
                }
                resolve();
              }
            );
          });
        }

        if (lat == null || lng == null) {
          alert('找不到住宿座標，請重新選擇地點');
          return;
        }

        const item = normalizeHotelRecord({
          id: generateId(),
          trip_id: currentTrip.value.id,
          name: displayName || keyword || '住宿',
          start_day: safeStart,
          end_day: safeEnd,
          lat,
          lng,
          place_id: placeId,
          address,
          note: ''
        });

        const res = await postJSON({ action: 'add', type: 'hotels', data: item });
        if (res && res.status === 'error') {
          console.error('add hotel failed:', res.message || res);
          alert('住宿新增失敗，請確認後端已加入 hotels 支援');
          return;
        }

        hotels.value.push(item);
        hotelSearchQuery.value = '';
        hotelSelectedPlaceData.value = null;
        newHotel.value = { start_day: safeEnd < totalDays.value ? safeEnd + 1 : safeStart, end_day: safeEnd < totalDays.value ? safeEnd + 1 : safeEnd };
        clearHotelSearchDropdown();
        scheduleTripCacheSave();
        updateMapMarkers();
      } catch (err) {
        console.error('addHotel error:', err);
        alert('住宿新增失敗，請稍後再試');
      } finally {
        isAddingHotel.value = false;
      }
    };

    const removeHotel = async (id) => {
      if (isDeletingHotel.value) return;
      const idx = hotels.value.findIndex(h => String(h.id) === String(id));
      const item = idx >= 0 ? hotels.value[idx] : null;
      if (!item?.id) return;
      if (!confirm('確定刪除此住宿設定？')) return;

      isDeletingHotel.value = true;
      const backup = { ...item };
      hotels.value.splice(idx, 1);
      scheduleTripCacheSave();
      updateMapMarkers();

      try {
        const res = await postJSON({ action: 'del', type: 'hotels', id: item.id });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'delete hotel failed');
        }
      } catch (err) {
        hotels.value.splice(idx, 0, backup);
        scheduleTripCacheSave();
        updateMapMarkers();
        alert('住宿刪除失敗，已回復資料，請稍後再試');
      } finally {
        isDeletingHotel.value = false;
      }
    };

    const openEditHotelModal = (hotel) => {
      if (!hotel || !hotel.id) return;
      editHotelId.value = String(hotel.id);
      editHotel.value = {
        name: String(hotel.name || ''),
        start_day: hotel.start_day ? parseInt(hotel.start_day, 10) || 1 : 1,
        end_day: hotel.end_day ? parseInt(hotel.end_day, 10) || 1 : 1,
        address: String(hotel.address || '')
      };
      editHotelSearchQuery.value = '';
      editHotelSearchResults.value = [];
      editHotelIsSearching.value = false;
      editHotelSelectedPlaceData.value = null;
      showEditHotelModal.value = true;
    };

    const closeEditHotelModal = () => {
      if (isSavingHotel.value) return;
      showEditHotelModal.value = false;
      editHotelSearchQuery.value = '';
      editHotelSearchResults.value = [];
      editHotelIsSearching.value = false;
      editHotelSelectedPlaceData.value = null;
    };

    const saveEditHotel = async () => {
      if (isSavingHotel.value) return;
      if (!currentTrip.value?.id) return;

      const id = editHotelId.value;
      const idx = hotels.value.findIndex(h => String(h.id) === String(id));
      if (idx < 0) {
        showEditHotelModal.value = false;
        return;
      }

      const name = String(editHotel.value.name || '').trim();
      if (!name) return;

      const startDay = parseInt(editHotel.value.start_day, 10) || 1;
      const endDay = parseInt(editHotel.value.end_day, 10) || startDay;
      const safeStart = Math.min(startDay, endDay);
      const safeEnd = Math.max(startDay, endDay);

      if (hasHotelOverlap(safeStart, safeEnd, id)) {
        alert('住宿區間與既有住宿重疊，請調整 Day 起迄');
        return;
      }

      isSavingHotel.value = true;
      const backup = { ...hotels.value[idx] };
      const selectedPlace = editHotelSelectedPlaceData.value;
      const updatedData = {
        ...backup,
        name,
        start_day: safeStart,
        end_day: safeEnd,
        address: String(editHotel.value.address || '').trim(),
        trip_id: currentTrip.value.id
      };

      if (selectedPlace) {
        updatedData.place_id = selectedPlace.place_id || updatedData.place_id || '';
        if (selectedPlace.lat != null && selectedPlace.lng != null) {
          updatedData.lat = Number(selectedPlace.lat);
          updatedData.lng = Number(selectedPlace.lng);
        }
        if (!updatedData.address && selectedPlace.address) {
          updatedData.address = selectedPlace.address;
        }
      }

      const updated = normalizeHotelRecord(updatedData);

      hotels.value.splice(idx, 1, updated);
      scheduleTripCacheSave();
      updateMapMarkers();
      showEditHotelModal.value = false;
      editHotelSearchQuery.value = '';
      editHotelSearchResults.value = [];
      editHotelIsSearching.value = false;
      editHotelSelectedPlaceData.value = null;

      try {
        const res = await postJSON({ action: 'edit', type: 'hotels', data: updated });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'edit hotel failed');
        }
      } catch (err) {
        hotels.value.splice(idx, 1, backup);
        scheduleTripCacheSave();
        updateMapMarkers();
        alert('住宿修改失敗，已回復資料，請稍後再試');
      } finally {
        isSavingHotel.value = false;
      }
    };

    const addExpense = async () => {
      if (isAddingExpense.value) return;

      const title = String(newExpense.value.title || '').trim();
      const amount = Number(newExpense.value.amount || 0);

      if (!title || amount <= 0) return;
      if (!currentTrip.value?.id) return;

      isAddingExpense.value = true;
      setTimeout(() => {
        isAddingExpense.value = false;
      }, 500);

      const uid = generateId();
      const d = normalizeExpenseRecord({
        id: uid,
        ...newExpense.value,
        title,
        amount,
        day: newExpense.value.day || currentDay.value || 1,
        involved: [...newExpense.value.involved],
        trip_id: currentTrip.value.id
      });

      // 前端先立即顯示，後端在背景慢慢寫入。
      expenses.value.unshift(d);
      scheduleTripCacheSave();

      newExpense.value = {
        title: '',
        amount: '',
        payer: people.value[0]?.name || '',
        involved: people.value.map(p => p.name),
        category: '飲食',
        day: currentDay.value || 1
      };

      try {
        const res = await postJSON({
          action: 'add',
          type: 'expenses',
          data: {
            ...d,
            involved: d.involved.join(',')
          }
        });

        if (res && res.status === 'error') {
          throw new Error(res.message || 'add expense failed');
        }
      } catch (err) {
        console.error('addExpense sync failed:', err);

        const idx = expenses.value.findIndex(x => String(x.id) === String(uid));
        if (idx !== -1) {
          expenses.value.splice(idx, 1);
          scheduleTripCacheSave();
        }

        alert('記帳寫入失敗，已取消剛剛新增的資料，請稍後再試。');
      }
    };

    const openEditExpenseModal = (exp) => {
      if (!exp || !exp.id) return;

      editExpenseId.value = String(exp.id);
      editExpense.value = {
        title: String(exp.title || ''),
        amount: Number(exp.amount) || '',
        payer: String(exp.payer || ''),
        involved: normalizeInvolved(exp.involved),
        category: exp.category || '飲食',
        day: exp.day ? parseInt(exp.day, 10) || 1 : 1
      };
      showEditExpenseModal.value = true;
    };

    const closeEditExpenseModal = () => {
      if (isSavingExpense.value) return;
      showEditExpenseModal.value = false;
    };

    const saveEditExpense = async () => {
      if (isSavingExpense.value) return;
      if (!currentTrip.value?.id) return;

      const id = editExpenseId.value;
      if (!id) return;

      const idx = expenses.value.findIndex(x => String(x.id) === String(id));
      if (idx < 0) {
        showEditExpenseModal.value = false;
        return;
      }

      const title = String(editExpense.value.title || '').trim();
      const amount = Number(editExpense.value.amount || 0);
      if (!title || amount <= 0) return;

      isSavingExpense.value = true;

      try {
        const updated = normalizeExpenseRecord({
          ...expenses.value[idx],
          ...editExpense.value,
          id,
          title,
          amount,
          day: editExpense.value.day || 1,
          involved: normalizeInvolved(editExpense.value.involved),
          trip_id: currentTrip.value.id
        });

        const res = await postJSON({
          action: 'edit',
          type: 'expenses',
          data: {
            ...updated,
            involved: updated.involved.join(',')
          }
        });

        if (res && res.status === 'error') {
          console.error('edit expense failed:', res.message || res);
          alert('記帳修改失敗，請稍後再試');
          return;
        }

        expenses.value.splice(idx, 1, updated);
        scheduleTripCacheSave();
        showEditExpenseModal.value = false;
      } catch (err) {
        console.error('saveEditExpense error:', err);
        alert('記帳修改失敗，請稍後再試');
      } finally {
        isSavingExpense.value = false;
      }
    };

    const removeExpense = async (expenseRef) => {
      let idx = -1;
      if (typeof expenseRef === 'number') {
        idx = expenseRef;
      } else {
        idx = expenses.value.findIndex(item => String(item.id) === String(expenseRef));
      }
      const item = idx >= 0 ? expenses.value[idx] : null;
      if (!item?.id) return;
      if (!confirm('確定刪除此筆記帳？')) return;
      expenses.value.splice(idx, 1);
      await postJSON({ action:'del', type:'expenses', id: item.id });
    };

    const addPerson = async () => {
      const name = newPerson.value.trim();
      if (!name) return;
      const uid = generateId();
      people.value.push({ id: uid, name, trip_id: currentTrip.value.id });
      if (!newExpense.value.involved.includes(name)) newExpense.value.involved.push(name);
      if (!newExpense.value.payer) newExpense.value.payer = name;
      newPerson.value = '';
      await postJSON({ action:'add', type:'people', data: { id: uid, name, trip_id: currentTrip.value.id } });
    };

    const removePerson = async (idx) => {
      const item = people.value[idx];
      if (!item?.id || !confirm('確定移除此成員？')) return;
      people.value.splice(idx, 1);
      await postJSON({ action:'del', type:'people', id: item.id });
    };

    const totalExpense = computed(() => normalExpenseRecords.value.reduce((s,i) => s + (Number(i.amount) || 0), 0));

    const balanceSheet = computed(() => {
      if(!people.value.length) return [];
      let b = {};
      people.value.forEach(p => b[p.name] = 0);

      expenses.value.forEach(e => {
        const amt = Number(e.amount) || 0;
        if(b[e.payer] === undefined) return;

        b[e.payer] += amt;
        const inv = normalizeInvolved(e.involved);
        const targets = inv.length ? inv : people.value.map(p => p.name);
        const v = targets.filter(n => b[n] !== undefined);

        if(v.length) {
          const share = amt / v.length;
          v.forEach(n => b[n] -= share);
        }
      });

      return Object.keys(b).map(n => ({name:n, balance:b[n]}));
    });

    const categoryAnalysis = computed(() => {
      const stats = {};
      normalExpenseRecords.value.forEach(e => {
        const cat = e.category || '未分類';
        stats[cat] = (stats[cat] || 0) + (Number(e.amount) || 0);
      });
      return Object.entries(stats).map(([name, total]) => ({name, total})).sort((a,b) => b.total - a.total);
    });

    const buildItineraryText = () => {
      if(!currentTrip.value) return '';

      let text = `【${currentTrip.value.name}】行程表\n\n`;

      for(let d = 1; d <= totalDays.value; d++) {
        text += `📅 Day ${d}`;
        const label = dayLabel(d);
        if (label) text += ` | ${label}`;
        text += `\n`;
        const dayItems = getDayOrderedItems(d, false);
        const dayAlternatives = getDayOrderedItems(d, true);
        const dayHotels = getHotelsForDay(d);

        if(dayItems.length === 0 && dayAlternatives.length === 0 && dayHotels.length === 0) {
          text += "  (無行程)\n\n";
          continue;
        }

        dayItems.forEach(item => {
          const msg = item.message ? ` (${String(item.message).replace(/\n/g, ' ')})` : '';
          text += `  ${formatTime(item.time) ? formatTime(item.time)+' ' : ''}${item.name}${msg}\n`;
        });

        if(dayAlternatives.length > 0) {
          text += `  📌 備案\n`;
          dayAlternatives.forEach(item => {
            const msg = item.message ? ` (${String(item.message).replace(/\n/g, ' ')})` : '';
            text += `    ${formatTime(item.time) ? formatTime(item.time)+' ' : ''}${item.name}${msg}\n`;
          });
        }

        dayHotels.forEach(hotel => {
          const addr = hotel.address ? ` (${hotel.address})` : '';
          text += `  🏠 ${hotel.name || '住宿'}${addr}\n`;
        });

        text += "\n";
      }

      return text;
    };


    const buildBackupPlaceCardHtml = (place, icon = '📍') => {
      const links = getMapExportLinks(place || {});
      const name = escapeHtml(place?.name || place?.title || '地點');
      const time = formatTime(place?.time || '');
      const msg = place?.message ? escapeHtml(String(place.message).replace(/\n/g, ' ')) : '';
      const addr = place?.address ? escapeHtml(place.address) : '';
      const appText = isKoreaTrip.value ? '開啟 Naver Map' : '開啟地圖 App';
      const appBtn = links.app
        ? `<a class="map-btn" href="${escapeHtml(links.app)}">${appText}</a>`
        : '';

      return `
        <div class="place-card">
          <div class="place-head">
            <div class="place-icon">${icon}</div>
            <div class="place-main">
              <div class="place-title">${time ? `<span class="place-time">${escapeHtml(time)}</span>` : ''}${name}</div>
              ${addr ? `<div class="place-address">${addr}</div>` : ''}
              ${msg ? `<div class="place-note">${msg}</div>` : ''}
            </div>
          </div>
          ${appBtn}
        </div>`;
    };

    const buildBackupHtml = () => {
      if (!currentTrip.value) return '';
      const tripName = escapeHtml(currentTrip.value.name || '行程備份');
      let body = '';

      for (let d = 1; d <= totalDays.value; d++) {
        const dayItems = getDayOrderedItems(d, false);
        const dayAlternatives = getDayOrderedItems(d, true);
        const dayHotels = getHotelsForDay(d);
        if(dayItems.length === 0 && dayAlternatives.length === 0 && dayHotels.length === 0) continue;

        const label = dayLabel(d);
        body += `<section class="day-section"><h2>📅 Day ${d}${label ? `｜${escapeHtml(label)}` : ''}</h2>`;
        dayItems.forEach(item => { body += buildBackupPlaceCardHtml(item, '📍'); });
        if (dayAlternatives.length) {
          body += `<div class="sub-title">📌 備案</div>`;
          dayAlternatives.forEach(item => { body += buildBackupPlaceCardHtml(item, '📌'); });
        }
        dayHotels.forEach(hotel => { body += buildBackupPlaceCardHtml(hotel, '🏠'); });
        body += `</section>`;
      }

      return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${tripName} 備份行程</title>
  <style>
    body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.45;}
    .wrap{max-width:520px;margin:0 auto;padding:22px 16px 40px;}
    .hero{background:#2563eb;color:white;border-radius:22px;padding:18px 16px;box-shadow:0 10px 28px rgba(37,99,235,.22);margin-bottom:16px;}
    h1{margin:0;font-size:24px;font-weight:900;}
    .hint{font-size:12px;color:#dbeafe;margin-top:6px;}
    .day-section{margin:14px 0 18px;}
    h2{font-size:16px;margin:0 0 10px;color:#334155;}
    .sub-title{font-weight:900;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;display:inline-block;padding:4px 10px;margin:6px 0 8px;font-size:12px;}
    .place-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:13px;margin-bottom:10px;box-shadow:0 3px 10px rgba(15,23,42,.05);}
    .place-head{display:flex;gap:10px;align-items:flex-start;}
    .place-icon{width:32px;height:32px;border-radius:12px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .place-main{min-width:0;flex:1;}
    .place-title{font-size:16px;font-weight:900;color:#111827;word-break:break-word;}
    .place-time{color:#2563eb;margin-right:7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    .place-address{font-size:12px;color:#64748b;margin-top:3px;word-break:break-word;}
    .place-note{font-size:13px;color:#475569;background:#f8fafc;border-radius:12px;padding:8px 10px;margin-top:8px;word-break:break-word;}
    .map-btn{display:block;text-align:center;text-decoration:none;background:#0d9488;color:#fff;font-weight:900;border-radius:14px;padding:11px 12px;margin-top:11px;}
    .footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero"><h1>${tripName}</h1><div class="hint">備份行程｜按地點下方按鈕可嘗試開啟地圖 App</div></div>
    ${body || '<div class="place-card">目前沒有行程資料</div>'}
    <div class="footer">backup ${escapeHtml(APP_VERSION)}</div>
  </div>
</body>
</html>`;
    };

    const downloadBackupHtml = () => {
      const html = buildBackupHtml();
      if (!html) return;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      const safeName = String(currentTrip.value?.name || 'trip').replace(/[\\/:*?"<>|]+/g, '_');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}_備份行程_${APP_VERSION}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    };

    const exportItinerary = () => {
      const text = buildItineraryText();
      if (!text) return;
      navigator.clipboard.writeText(text);
      alert('已複製到剪貼簿');
    };

    const manualSync = async () => {
      await flushPendingQueue();
      await fetchData();
    };

    const switchTab = async (tab) => {
      currentTab.value = tab;
      await nextTick();

      if (tab === 'map') {
        await loadGoogleMaps();
        initGoogleMap();

        setTimeout(() => {
          if (mapInstance && window.google) {
            google.maps.event.trigger(mapInstance, 'resize');
            updateMapMarkers();
          }
        }, 100);
      }

      scheduleSortableInit();
    };

    const syncStatusText = computed(() => {
      if (syncStatus.value === 'syncing' || isFlushingQueue.value) return '同步中...';
      if (pendingSyncQueue.value.length > 0) return `待同步 ${pendingSyncQueue.value.length} 筆`;
      if (syncStatus.value === 'error') return '同步失敗';
      return syncMessage.value || '已同步';
    });

    const syncStatusBadgeClass = computed(() => {
      if (syncStatus.value === 'syncing' || isFlushingQueue.value) return 'sync-badge-syncing';
      if (pendingSyncQueue.value.length > 0) return 'sync-badge-queued';
      if (syncStatus.value === 'error') return 'sync-badge-error';
      return 'sync-badge-synced';
    });

    watch(currentDay, () => {
      mapAddDay.value = currentDay.value || 1;
      newExpense.value.day = currentDay.value || 1;
      if (getMapDisplayDay()) {
        mapDisplayFilter.value = `day-${currentDay.value || 1}`;
      }
      scheduleSortableInit();
      if (currentTab.value === 'map') updateMapMarkers();
    });

    watch(currentTab, () => {
      scheduleSortableInit();
      if (currentTab.value === 'map') {
        setTimeout(() => updateMapMarkers(), 80);
      }
    });

    watch(currentView, () => scheduleSortableInit());
    watch(mapSearchQuery, (val) => {
      if (!String(val || '').trim()) {
        mapTranslatedSearchHint.value = '';
        clearMapSearchResult();
      }
    });
    watch([itinerary, expenses, people, hotels], () => scheduleTripCacheSave(), { deep: true });
    watch(currentTrip, () => scheduleTripCacheSave(), { deep: true });
    watch(trips, () => scheduleTripsCacheSave(), { deep: true });

    const handleAppResume = () => {
      refreshTodayKey();
      // iOS 主畫面書籤會保留上次畫面，回到前景時主動刷新日期/倒數。
      if (currentView.value === 'lobby') {
        fetchTrips();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) handleAppResume();
    };

    onMounted(async () => {
      refreshTodayKey();
      const hasTripsCache = loadTripsCache();
      console.log('loadTripsCache =', hasTripsCache);
      window.addEventListener('online', () => flushPendingQueue());
      window.addEventListener('focus', handleAppResume);
      window.addEventListener('pageshow', handleAppResume);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      todayRefreshTimer = setInterval(refreshTodayKey, 60 * 1000);
      fetchTrips();
    });

    onBeforeUnmount(() => {
      window.removeEventListener('online', () => flushPendingQueue());
      window.removeEventListener('focus', handleAppResume);
      window.removeEventListener('pageshow', handleAppResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (todayRefreshTimer) clearInterval(todayRefreshTimer);
    });

    return {
      APP_VERSION,
      currentView, currentTrip, trips, newTripName, newTripCity,
      currentTab, isLoading, syncStatusText, syncStatusBadgeClass, manualSync,
      isAddingPlace, isAddingMapPlace, isAddingExpense, isSavingExpense,
      isAddingAlternative, isDeletingAlternative, isAddingAlternativeToItinerary,
      currentDay, totalDays,
      people, itinerary, expenses, hotels, alternatives, filteredItinerary, filteredAlternatives, currentDayHotels,
      newPlace, newTime, newNote, newPerson, newExpense, expenseFilter, categories,
      searchResults, translatedSearchHint, isSearching, isCoordinateMode, resolvedCoordName,
      mapSearchQuery, mapSearchResults, mapTranslatedSearchHint, mapIsSearching, mapIsCoordinateMode, mapResolvedCoordName, isMapReady,
      mapLatestResult, mapAddDay, mapDisplayFilter,
      newHotel, hotelSearchQuery, hotelSearchResults, hotelIsSearching, isAddingHotel, isDeletingHotel,
      showEditHotelModal, editHotel, editHotelSearchQuery, editHotelSearchResults, editHotelIsSearching, editHotelSelectedPlaceData, isSavingHotel,
      newAlternative, alternativeSearchQuery, alternativeSearchResults, alternativeIsSearching,

      createTrip, selectTrip, exitTrip, deleteTripTotally, fetchData,

      switchTab, addNewDay, deleteDay, onDayClick, onDayDblClick, dayLabel,
      tripCountdownDays, tripCountdownLabel,

      showDayModal, modalDay, dateInput, swapTargetDay, closeDayModal, applyDay1Date, swapWithDay,

      searchPlacesInput, useCoordinateInput, selectPlace,
      addPlace, removePlace, openExternalMap, handleItineraryContentClick, linkifyMessage,
      itineraryListEl, alternativeListEl, formatTime,

      searchMapPlacesInput, useMapCoordinateInput, selectMapPlace,
      searchCityAndJump, fitBoundsToTrip, applyMapDisplayFilter, addMapSearchResultToItinerary,
      searchHotelPlacesInput, selectHotelPlace, addHotel, removeHotel,
      searchEditHotelPlacesInput, selectEditHotelPlace, openEditHotelModal, closeEditHotelModal, saveEditHotel,
      hotelDayRangeLabel, openHotelMap,
      searchAlternativePlacesInput, selectAlternativePlace, addAlternative, removeAlternative, addAlternativeToItinerary,

      addExpense, removeExpense, openEditExpenseModal, closeEditExpenseModal, saveEditExpense, addPerson, removePerson,
      totalExpense, balanceSheet, categoryAnalysis, formatInvolved,
      filteredExpenses, filteredExpenseTotal, filteredCategoryAnalysis,
      filteredDayExpenseAnalysis, filteredPayerExpenseAnalysis, moneyDays, hasExpenseFilters,

      exportItinerary, downloadBackupHtml, isKoreaTrip,

      showEditModal, editPlace,
      openEditModal, closeEditModal, saveEditPlace,
      showEditExpenseModal, editExpense,
      openEditExpenseModal, closeEditExpenseModal, saveEditExpense
    };
  }
}).mount('#app');
