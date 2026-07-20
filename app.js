const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;

createApp({
  setup() {
    const API_URL = window.TRAVEL_CONFIG?.API_URL || '';
    const GOOGLE_MAPS_API_KEY = window.TRAVEL_CONFIG?.GOOGLE_MAPS_API_KEY || '';
    const APP_VERSION = window.TRAVEL_CONFIG?.APP_VERSION || '20260718.5';
    // 這些模組必須在 app.js 之前同步載入；缺任何一個都無法運作，直接中止比在執行期才報錯好追。
    [
      'TravelUtils', 'TravelApi', 'TravelCache', 'TravelItinerary',
      'TravelHotels', 'TravelMaps', 'TravelExpenses', 'TravelWeather', 'TravelPlaces', 'TravelExport'
    ].forEach((name) => {
      if (!window[name]) throw new Error(`缺少必要模組 ${name}，請確認 index.html 的載入順序`);
    });
    const TravelUtils = window.TravelUtils;
    const TravelApi = window.TravelApi.create({ apiUrl: API_URL });
    const TravelCache = window.TravelCache;
    const TravelItinerary = window.TravelItinerary;
    const TravelHotels = window.TravelHotels;
    const TravelMaps = window.TravelMaps;
    const TravelExpenses = window.TravelExpenses;
    const TravelWeather = window.TravelWeather;
    const TravelPlaces = window.TravelPlaces;
    const TravelExport = window.TravelExport;

    const {
      PUBLIC_ACCOUNT_NAME,
      expenseCategoryIcons,
      getExpenseCategoryIcon,
      normalizeInvolved,
      formatInvolved,
      normalizeExpenseRecord,
      normalizePersonName,
      normalizeSharedWalletPeople,
      isSystemWalletPerson,
      filterActualPeople,
      isLegacyPublicAccountExpense,
      parseBooleanFlag,
      normalizeSharedWalletTransaction,
      formatSharedWalletUsers,
      expenseCreatedTime
    } = TravelExpenses;

    const { weatherCodeInfo, uvLevelLabel } = TravelWeather;

    const currentView = ref('lobby');
    const currentTrip = ref(null);
    const trips = ref([]);
    const newTripName = ref('');
    const newTripCity = ref('');

    const currentTab = ref('itinerary');
    const dayViewMode = ref('list');
    const moneyDisplayMode = ref('personal');
    const isDayMapView = () => currentTab.value === 'itinerary' && dayViewMode.value === 'map';
    const isLoading = ref(false);
    const syncStatus = ref('synced');
    const syncMessage = ref('');
    const pendingSyncQueue = ref([]);
    const isFlushingQueue = ref(false);
    const isAddingPlace = ref(false);
    const isAddingExpense = ref(false);
    const isSavingSharedWallet = ref(false);
    const isUpdatingSharedWalletSetting = ref(false);
    const isRefreshingMoney = ref(false);

    const currentDay = ref(1);
    const totalDays = ref(1);
    const todayKey = ref('');
    let todayRefreshTimer = null;
    let moneyRefreshTimer = null;
    let lastMoneyRefreshAt = 0;
    const MONEY_REFRESH_INTERVAL_MS = 60 * 1000;
    const MONEY_REFRESH_THROTTLE_MS = 15 * 1000;

    const people = ref([]);
    const itinerary = ref([]);
    const expenses = ref([]);
    const sharedWalletTransactions = ref([]);
    const hotels = ref([]);
    const alternatives = ref([]); // 舊版備案表保留但不再使用；新版備案改存在 itinerary.is_alternative

    const newPlace = ref('');
    const newTime = ref('');
    const newPlaceType = ref('景點');
    const newNote = ref('');
    const newPerson = ref('');
    const newExpense = ref({ title: '', amount: '', payer: '', involved: [], category: '飲食', day: 1 });
    const walletEntryMode = ref('deposit');
    const defaultWalletDate = () => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      return new Date(now.getTime() - offset).toISOString().slice(0, 10);
    };
    const newSharedWalletDeposit = ref({ person: '', amount: '', note: '' });
    const newSharedWalletPayment = ref({ title: '', amount: '', persons: [], category: '飲食', note: '' });
    const expenseFilter = ref({ day: 'all', category: 'all', payer: 'all' });
    const categories = window.TravelExpenses.EXPENSE_CATEGORIES;
    const itineraryTypes = window.TravelItinerary.ITINERARY_TYPES;

    const searchResults = ref([]);
    const translatedSearchHint = ref('');
    const isSearching = ref(false);
    const isCoordinateMode = ref(false);
    const resolvedCoordName = ref('');
    const selectedLat = ref(null);
    const selectedLng = ref(null);
    const selectedPlaceData = ref(null);

    const mapDisplayFilter = ref('all');
    const isMapReady = ref(false);
    const mapLocatorOpen = ref(false);
    const selectedMapPoint = ref(null);
    const probeSearchOpen = ref(false);
    const probeQuery = ref('');
    const probeResults = ref([]);
    const probeIsSearching = ref(false);
    const probePlace = ref(null);
    const tripWeather = ref({ status: 'idle' });
    let mapInstance = null;
    let mapElementRef = null;
    let markers = [];
    let mapMarkerByPointKey = new Map();
    let mapBounceTimer = null;
    let mapRouteLine = null;
    let infoWindow = null;
    let autocompleteService = null;
    let probeMarker = null;
    let probeSearchTimeout = null;

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

    const newAlternative = ref({ message: '' });
    const alternativeSearchQuery = ref('');
    const alternativeSearchResults = ref([]);
    const alternativeIsSearching = ref(false);
    const alternativeSelectedPlaceData = ref(null);
    const isAddingAlternative = ref(false);
    const isDeletingAlternative = ref(false);
    const isPromotingAlternative = ref(false);

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
    const editPlace = ref({
      name: '',
      type: '景點',
      time: '',
      message: '',
      day: 1,
      transport: { mode: '', number: '', terminal: '', seat: '', checkin: '' }
    });

    const showEditExpenseModal = ref(false);
    const editExpenseId = ref('');
    const editExpense = ref({ title: '', amount: '', payer: '', involved: [], category: '飲食', day: 1 });
    const isSavingExpense = ref(false);

    const generateId = TravelUtils.generateId;

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
    const zhLabelCache = new Map();
    const FOREIGN_TITLE_RE = /[\u3131-\u318e\uac00-\ud7a3\u3040-\u30ff\u0e00-\u0e7f]/;
    const CJK_TITLE_RE = /[\u4e00-\u9fff]/;

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

    const cleanLabelText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const hasForeignTitle = (value) => FOREIGN_TITLE_RE.test(String(value || ''));
    const hasChineseTitle = (value) => CJK_TITLE_RE.test(String(value || ''));

    const translateTitleToChinese = async (title) => {
      const key = cleanLabelText(title);
      if (!key || !hasForeignTitle(key)) return '';
      if (zhLabelCache.has(key)) return zhLabelCache.get(key);

      try {
        const res = await apiGet({
          action: 'translate_place_keyword',
          text: key,
          target: 'zh-TW'
        });
        const translated = cleanLabelText(res?.translatedText || res?.text || res?.translation || '');
        const out = translated && translated !== key && (hasChineseTitle(translated) || !hasForeignTitle(translated))
          ? translated
          : '';
        zhLabelCache.set(key, out);
        return out;
      } catch (err) {
        console.warn('translateTitleToChinese failed:', err);
        return '';
      }
    };

    const getPlacePredictionsAsync = async (request) => {
      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!window.google || !google.maps?.places?.AutocompleteService) return [];
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

    const geocodePlaceCandidates = async (keyword, options = {}) => {
      const q = String(keyword || '').trim();
      if (!q) return [];
      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!window.google || !google.maps?.Geocoder) return [];

      const city = String(currentTrip.value?.city || '').trim();
      const address = city && !q.includes(city) ? `${q} ${city}` : q;
      const geocoder = new google.maps.Geocoder();

      return await new Promise((resolve) => {
        geocoder.geocode(
          {
            address,
            ...(options.bounds ? { bounds: options.bounds } : {})
          },
          (results, status) => {
            if (status !== 'OK' || !Array.isArray(results)) {
              resolve([]);
              return;
            }

            const candidates = results.slice(0, 4).map((result) => {
              const firstComponent = result.address_components?.[0]?.long_name || '';
              const mainText = firstComponent || result.formatted_address || q;
              const lat = result.geometry?.location ? result.geometry.location.lat() : null;
              const lng = result.geometry?.location ? result.geometry.location.lng() : null;
              return {
                source: 'geocoder',
                place_id: result.place_id || `geocoder_${mainText}_${lat}_${lng}`,
                description: result.formatted_address || mainText,
                address: result.formatted_address || '',
                lat,
                lng,
                structured_formatting: {
                  main_text: mainText,
                  secondary_text: result.formatted_address || city || 'Google Maps'
                }
              };
            });

            resolve(candidates);
          }
        );
      });
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
      const geocodePredictions = await geocodePlaceCandidates(q, options);

      if (!target) {
        return { predictions: mergePredictions(originalPredictions, geocodePredictions), hint: '' };
      }

      const translatedInfo = await translatePlaceKeyword(q);
      const translatedKeyword = String(translatedInfo.keyword || '').trim();
      if (!translatedKeyword || translatedKeyword === q) {
        return { predictions: mergePredictions(originalPredictions, geocodePredictions), hint: '' };
      }

      const translatedReq = {
        input: translatedKeyword,
        language: target.code,
        ...(options.types ? { types: options.types } : {})
      };
      if (options.bounds) translatedReq.bounds = options.bounds;

      const translatedPredictions = await getPlacePredictionsAsync(translatedReq);
      const translatedGeocodePredictions = await geocodePlaceCandidates(translatedKeyword, options);
      return {
        predictions: mergePredictions(translatedPredictions, originalPredictions, translatedGeocodePredictions, geocodePredictions),
        hint: translatedInfo.translated ? `翻譯搜尋：${translatedInfo.translated}` : ''
      };
    };

    const { pad2, toYMD, parseYMD, addDays, escapeHtml, linkifyMessage, formatTime, timeToNum } = TravelUtils;
    const refreshTodayKey = () => { todayKey.value = toYMD(new Date()); };


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
      newExpense.value.day = day;
    };

    const dayLabel = (day) => {
      const base = parseYMD(currentTrip.value?.start_date);
      if (!base) return '';
      const dt = addDays(base, day-1);
      const wk = ['日','一','二','三','四','五','六'][dt.getDay()];
      return `${dt.getFullYear()}/${pad2(dt.getMonth()+1)}/${pad2(dt.getDate())} (${wk})`;
    };

    const dayDateYMD = (day) => {
      const base = parseYMD(currentTrip.value?.start_date);
      if (!base) return toYMD(new Date());
      return toYMD(addDays(base, (parseInt(day, 10) || 1) - 1));
    };

    const expenseDateLabel = (expense) => dayDateYMD(expense?.day || 1);

    const daysFromToday = (ymd) => {
      const target = parseYMD(ymd);
      const today = parseYMD(todayKey.value || toYMD(new Date())) || new Date();
      if (!target) return null;
      today.setHours(12, 0, 0, 0);
      target.setHours(12, 0, 0, 0);
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    };

    const syncPersonSelections = () => {
      const names = people.value.map(person => normalizePersonName(person.name)).filter(Boolean);
      if (!names.includes(newExpense.value.payer)) newExpense.value.payer = names[0] || '';
      newExpense.value.involved = normalizeInvolved(newExpense.value.involved).filter(name => names.includes(normalizePersonName(name)));
      if (!newExpense.value.involved.length) newExpense.value.involved = [...names];
      if (!names.includes(newSharedWalletDeposit.value.person)) newSharedWalletDeposit.value.person = names[0] || '';
      newSharedWalletPayment.value.persons = normalizeSharedWalletPeople(newSharedWalletPayment.value.persons)
        .filter(name => names.includes(name));
    };

    const toggleSharedWalletPaymentPerson = (name) => {
      const person = normalizePersonName(name);
      const validPeople = people.value.map(item => normalizePersonName(item.name)).filter(Boolean);
      if (!person || !validPeople.includes(person)) return;
      const selected = normalizeSharedWalletPeople(newSharedWalletPayment.value.persons)
        .filter(item => validPeople.includes(item));
      newSharedWalletPayment.value.persons = selected.includes(person)
        ? selected.filter(item => item !== person)
        : [...selected, person];
    };

    const selectAllSharedWalletPaymentPeople = () => {
      newSharedWalletPayment.value.persons = [];
    };


    const {
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
      normalizeAlternativeRecord
    } = TravelItinerary;

    const {
      normalizeHotelRecord,
      isHotelActiveOnDay,
      hotelDayRangeLabel
    } = TravelHotels;

    const hasHotelOverlap = (startDay, endDay, exceptId = '') =>
      TravelHotels.hasHotelOverlap(hotels.value, startDay, endDay, exceptId);

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



    const { jsonp, apiGet } = TravelApi;
    const cacheKey = TravelCache.tripCacheKey;

    const saveTripCache = (tripId) => {
      try {
        localStorage.setItem(cacheKey(tripId), JSON.stringify({
          itinerary: itinerary.value,
          expenses: expenses.value,
          sharedWalletTransactions: sharedWalletTransactions.value,
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
        sharedWalletTransactions.value = Array.isArray(c.sharedWalletTransactions)
          ? c.sharedWalletTransactions.map(normalizeSharedWalletTransaction)
          : [];
        people.value = filterActualPeople(c.people);
        if (!people.value.length) people.value = [{id:'default', name:'我'}];
        syncPersonSelections();
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

    const { rawPostJSON } = TravelApi;
    const pendingQueueKey = TravelCache.pendingQueueKey;

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
      const response = await postJSON({
        action: 'save_order',
        tripId,
        day: String(day),
        order: (ids||[]).join(','),
        isAlternative: isAlternative ? 'v' : ''
      });
      if (response && response.status === 'error') {
        throw new Error(response.message || 'save order failed');
      }
      return response;
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

    // 共用同一個 AutocompleteService，避免每處搜尋各自建立實例。
    const ensureAutocompleteService = async () => {
      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!autocompleteService) autocompleteService = new google.maps.places.AutocompleteService();
      return autocompleteService;
    };

    const getPlaceDetails = (placeId, language = 'zh-TW') => {
      return new Promise(async (resolve) => {
        if (!window.google || !window.google.maps) {
          await loadGoogleMaps();
        }

        if (!window.google || !window.google.maps || !google.maps.places?.PlacesService) {
          resolve(null);
          return;
        }

        const dummyMap = new google.maps.Map(document.createElement('div'));
        const service = new google.maps.places.PlacesService(dummyMap);

        service.getDetails(
          {
            placeId,
            fields: TravelPlaces.getPlaceDetailFields(),
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

    const openMapWindow = (url) => {
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    const openNaverMap = ({ name = '', nameKo = '', lat = null, lng = null }) => {
      const title = String(nameKo || name || '地點').trim();
      const encodedTitle = encodeURIComponent(title);

      if (lat != null && lng != null) {
        window.location.href = `nmap://place?lat=${lat}&lng=${lng}&name=${encodedTitle}&appname=tripplanner`;
        return;
      }

      window.location.href = `nmap://search?query=${encodedTitle}&appname=tripplanner`;
    };

    const { resolveWeatherLocation, loadTripWeather, scheduleTripWeatherLoad } = TravelWeather.create({
      tripWeather,
      currentTrip,
      currentDay,
      dayDateYMD,
      daysFromToday,
      // 這幾個宣告在本行之後，包一層才不會踩到 TDZ。
      getDayOrderedItems: (d, alt) => getDayOrderedItems(d, alt),
      getHotelsForDay: (d) => getHotelsForDay(d),
      loadGoogleMaps: () => loadGoogleMaps(),
      dateUtils: { toYMD, parseYMD, addDays }
    });

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

    const clearMapRouteLine = () => {
      if (mapRouteLine) {
        mapRouteLine.setMap(null);
        mapRouteLine = null;
      }
    };

    const hasMapCoordinates = (item) => {
      const lat = Number(item?.lat);
      const lng = Number(item?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    };

    const shouldShowItineraryOnMap = (item) => {
      return getItineraryType(item) !== '交通' && hasMapCoordinates(item);
    };

    const getMapPointKey = (kind, item) => `${kind}:${String(item?.id || '')}`;

    const getCurrentDayMapPoints = () => {
      const day = parseInt(currentDay.value, 10) || 1;
      const dayItems = sortDayItemsByStoredOrder(
        itinerary.value.filter(item =>
          !isAlternativeItem(item)
          && (item.day ? parseInt(item.day, 10) || 1 : 1) === day
          && shouldShowItineraryOnMap(item)
        )
      ).map(item => ({
        key: getMapPointKey('itinerary', item),
        kind: 'itinerary',
        id: item.id,
        name: item.name || '未命名行程',
        address: item.address || '',
        timeLabel: item.time ? formatTime(item.time) : '未定',
        category: getItineraryCategoryLabel(item),
        tone: getItineraryTypeTone(item),
        icon: getItineraryIcon(item),
        lat: Number(item.lat),
        lng: Number(item.lng),
        source: item
      }));

      const dayHotels = hotels.value
        .filter(hotel => isHotelActiveOnDay(hotel, day) && hasMapCoordinates(hotel))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map(hotel => ({
          key: getMapPointKey('hotel', hotel),
          kind: 'hotel',
          id: hotel.id,
          name: hotel.name || '住宿',
          address: hotel.address || '',
          timeLabel: '住宿',
          category: '住宿',
          tone: 'hotel',
          icon: '🏠',
          lat: Number(hotel.lat),
          lng: Number(hotel.lng),
          source: hotel
        }));

      return dayItems.concat(dayHotels);
    };

    const currentDayMapPoints = computed(getCurrentDayMapPoints);

    const closeMapLocator = () => {
      mapLocatorOpen.value = false;
    };

    const toggleMapLocator = () => {
      const willOpen = !mapLocatorOpen.value;
      if (willOpen) closeProbeSearchPanel();
      mapLocatorOpen.value = willOpen;
    };

    const applyMapMarkerSelection = () => {
      const selectedKey = selectedMapPoint.value?.key || '';
      mapMarkerByPointKey.forEach((entry, key) => {
        const active = key === selectedKey;
        const color = active ? '#2563eb' : entry.baseColor;
        entry.marker.setIcon(entry.kind === 'hotel' ? makeHotelMapPinIcon(color) : makeMapPinIcon(color));
        entry.marker.setZIndex(active ? 1200 : entry.zIndex);
      });
    };

    const markMapPointSelected = (point) => {
      selectedMapPoint.value = point ? { ...point } : null;
      applyMapMarkerSelection();
    };

    const focusItineraryMapPoint = (point) => {
      if (!point || !mapInstance || !hasMapCoordinates(point)) return;

      const entry = mapMarkerByPointKey.get(point.key);
      markMapPointSelected(point);
      closeMapLocator();

      mapInstance.panTo({ lat: Number(point.lat), lng: Number(point.lng) });
      if ((mapInstance.getZoom() || 0) < 15) mapInstance.setZoom(16);

      if (entry?.marker && window.google?.maps) {
        if (mapBounceTimer) clearTimeout(mapBounceTimer);
        entry.marker.setAnimation(google.maps.Animation.BOUNCE);
        mapBounceTimer = setTimeout(() => entry.marker.setAnimation(null), 650);
        google.maps.event.trigger(entry.marker, 'click');
      }
    };

    const showAllCurrentDayMapPoints = () => {
      if (!mapInstance || !window.google) return;
      const points = getCurrentDayMapPoints();
      if (!points.length) return;

      markMapPointSelected(null);
      closeMapLocator();

      const bounds = new google.maps.LatLngBounds();
      points.forEach(point => bounds.extend({ lat: point.lat, lng: point.lng }));
      mapInstance.fitBounds(bounds);
      if (points.length === 1) mapInstance.setZoom(16);
    };

    const clearProbeMarker = () => {
      if (probeMarker) {
        probeMarker.setMap(null);
        probeMarker = null;
      }
    };

    const normalizeProbePlace = (data = {}) => ({
      name: String(data.name || data.description || data.address || '探點').trim(),
      address: String(data.address || data.formatted_address || data.description || '').trim(),
      lat: data.lat != null ? Number(data.lat) : null,
      lng: data.lng != null ? Number(data.lng) : null,
      place_id: String(data.place_id || '')
    });

    const getProbeResultTitle = (item = {}) => cleanLabelText(
      item.probe_title
      || item.structured_formatting?.main_text
      || item.name
      || item.description
      || ''
    );

    const getProbeDisplayName = (name, zhLabel = '') => {
      const title = cleanLabelText(name);
      const translated = cleanLabelText(zhLabel);
      if (!translated || translated === title) return title;
      if (hasChineseTitle(title) && !hasForeignTitle(title)) return title;
      return `${title}（${translated}）`;
    };

    const enrichProbeResultsWithChinese = async (results, keywordSnapshot) => {
      const list = Array.isArray(results) ? results : [];
      const targetItems = list
        .slice(0, 5)
        .filter(item => hasForeignTitle(getProbeResultTitle(item)));

      await Promise.all(targetItems.map(async (item) => {
        const title = getProbeResultTitle(item);
        const translated = await translateTitleToChinese(title);
        if (!translated || probeQuery.value.trim() !== keywordSnapshot) return;
        item.probe_title = title;
        item.zh_label = translated;
      }));

      if (probeQuery.value.trim() === keywordSnapshot) {
        probeResults.value = list.slice();
      }
    };

    const getExternalMapLink = ({ name = '', lat = null, lng = null, place_id = '' }) => {
      if (place_id) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(place_id)}`;
      }
      if (lat != null && lng != null) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    };

    const renderProbeMarker = () => {
      if (!mapInstance || !window.google || !probePlace.value) return;

      const place = probePlace.value;
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      clearProbeMarker();

      probeMarker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance,
        title: place.name || '探點',
        label: { text: '🔎', fontSize: '10px' },
        icon: makeMapPinIcon('#334155'),
        zIndex: 1200
      });

      probeMarker.addListener('click', () => {
        if (!infoWindow) return;
        const link = getExternalMapLink(place);
        infoWindow.setContent(
          `<div style="padding:8px;color:#111;max-width:240px;">
            <div style="font-weight:700;margin-bottom:4px;">🔎 ${escapeHtml(place.name || '探點')}</div>
            <div style="font-size:12px;color:#555;margin-bottom:8px;">${escapeHtml(place.address || '')}</div>
            <a href="${link}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:700;">Google Maps</a>
          </div>`
        );
        infoWindow.open(mapInstance, probeMarker);
      });
    };

    const focusProbePlace = () => {
      if (!mapInstance || !window.google || !probePlace.value) return;
      const lat = Number(probePlace.value.lat);
      const lng = Number(probePlace.value.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      renderProbeMarker();
      mapInstance.panTo({ lat, lng });
      if ((mapInstance.getZoom() || 0) < 15) mapInstance.setZoom(15);
    };

    const clearProbeSearch = () => {
      if (probeSearchTimeout) {
        clearTimeout(probeSearchTimeout);
        probeSearchTimeout = null;
      }
      probeQuery.value = '';
      probeResults.value = [];
      probeIsSearching.value = false;
      probePlace.value = null;
      clearProbeMarker();
      if (infoWindow) infoWindow.close();
    };

    const closeProbeSearchPanel = () => {
      if (probeSearchTimeout) {
        clearTimeout(probeSearchTimeout);
        probeSearchTimeout = null;
      }
      probeSearchOpen.value = false;
      probeResults.value = [];
      probeIsSearching.value = false;
    };

    const toggleProbeSearch = async () => {
      const willOpen = !probeSearchOpen.value;
      probeSearchOpen.value = willOpen;
      if (!willOpen) return;

      mapLocatorOpen.value = false;
      await nextTick();
      if (!mapInstance && isDayMapView()) {
        await loadGoogleMaps();
        initGoogleMap();
      }
    };

    const setProbePlaceFromDetails = async (item, fallbackName = '') => {
      if (!item) return false;

      if (item.place_id) {
        const place = await getPlaceDetails(item.place_id, 'zh-TW');
        if (place?.geometry?.location) {
          const rawName = place.name || fallbackName || getProbeResultTitle(item);
          probePlace.value = normalizeProbePlace({
            name: getProbeDisplayName(rawName, item.zh_label),
            address: place.formatted_address || item.address || item.description || '',
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            place_id: item.place_id
          });
          return true;
        }
      }

      if (item.lat != null && item.lng != null) {
        const rawName = getProbeResultTitle(item) || fallbackName;
        probePlace.value = normalizeProbePlace({
          name: getProbeDisplayName(rawName, item.zh_label),
          address: item.address || item.description || '',
          lat: item.lat,
          lng: item.lng,
          place_id: item.place_id || ''
        });
        return true;
      }

      return false;
    };

    const geocodeProbeQuery = async (q) => {
      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!mapInstance) initGoogleMap();
      if (!window.google || !mapInstance) return false;

      const city = String(currentTrip.value?.city || '').trim();
      const query = city && !q.includes(city) ? `${q} ${city}` : q;
      const geocoder = new google.maps.Geocoder();
      const geocoded = await new Promise((resolve) => {
        geocoder.geocode({ address: query }, (results, status) => {
          resolve(status === 'OK' && results?.[0] ? results[0] : null);
        });
      });

      if (!geocoded?.geometry?.location) return false;

      const rawName = geocoded.address_components?.[0]?.long_name || q;
      const zhLabel = await translateTitleToChinese(rawName);
      probePlace.value = normalizeProbePlace({
        name: getProbeDisplayName(rawName, zhLabel),
        address: geocoded.formatted_address || query,
        lat: geocoded.geometry.location.lat(),
        lng: geocoded.geometry.location.lng(),
        place_id: geocoded.place_id || ''
      });
      return true;
    };

    const searchProbePlacesInput = () => {
      const q = probeQuery.value.trim();

      if (probeSearchTimeout) clearTimeout(probeSearchTimeout);

      if (!q) {
        clearProbeSearch();
        probeSearchOpen.value = true;
        return;
      }

      const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
      if (coordRegex.test(q)) {
        const parts = q.split(',');
        probeResults.value = [];
        probeIsSearching.value = false;
        probePlace.value = normalizeProbePlace({
          name: '座標探點',
          address: `${parts[0].trim()}, ${parts[1].trim()}`,
          lat: parseFloat(parts[0]),
          lng: parseFloat(parts[1])
        });
        focusProbePlace();
        return;
      }

      probeIsSearching.value = true;
      probeSearchTimeout = setTimeout(async () => {
        try {
          const opts = {};
          if (mapInstance && typeof mapInstance.getBounds === 'function') {
            const bounds = mapInstance.getBounds();
            if (bounds) opts.bounds = bounds;
          }
          const out = await searchPlacesWithTranslation(q, opts);
          if (probeQuery.value.trim() !== q) return;
          const results = (out.predictions || []).map(item => ({
            ...item,
            probe_title: getProbeResultTitle(item)
          }));
          probeResults.value = results;
          enrichProbeResultsWithChinese(results, q).catch(err => console.warn('probe zh labels failed:', err));
        } catch (err) {
          console.error(err);
          if (probeQuery.value.trim() === q) probeResults.value = [];
        } finally {
          if (probeQuery.value.trim() === q) probeIsSearching.value = false;
        }
      }, 350);
    };

    const selectProbePlace = async (item) => {
      if (!item) return;
      if (probeSearchTimeout) {
        clearTimeout(probeSearchTimeout);
        probeSearchTimeout = null;
      }
      probeQuery.value = getProbeDisplayName(getProbeResultTitle(item), item.zh_label) || probeQuery.value;
      probeResults.value = [];
      probeIsSearching.value = true;

      try {
        const ok = await setProbePlaceFromDetails(item, probeQuery.value);
        if (ok) {
          focusProbePlace();
        } else {
          await searchProbeByQuery();
        }
      } catch (err) {
        console.error(err);
      } finally {
        probeIsSearching.value = false;
      }
    };

    const searchProbeByQuery = async () => {
      const q = probeQuery.value.trim();
      if (probeSearchTimeout) {
        clearTimeout(probeSearchTimeout);
        probeSearchTimeout = null;
      }
      if (!q) {
        clearProbeSearch();
        probeSearchOpen.value = true;
        return;
      }

      probeIsSearching.value = true;
      try {
        if (probeResults.value.length) {
          const first = probeResults.value[0];
          probeResults.value = [];
          const ok = await setProbePlaceFromDetails(first, q);
          if (ok) {
            probeQuery.value = getProbeDisplayName(getProbeResultTitle(first), first.zh_label) || q;
            focusProbePlace();
            return;
          }
        }

        const ok = await geocodeProbeQuery(q);
        if (ok) {
          probeResults.value = [];
          focusProbePlace();
        } else {
          alert('找不到這個探點');
        }
      } catch (err) {
        console.error(err);
      } finally {
        probeIsSearching.value = false;
      }
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
      const encodedQuery = encodeURIComponent(queryText);

      if (isKoreaTrip.value) {
        openNaverMap({ name: queryText, nameKo: name, lat, lng });
        return;
      }

      if (lat != null && lng != null) {
        openMapWindow(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
        return;
      }

      openMapWindow(`https://www.google.com/maps/search/?api=1&query=${encodedQuery}`);
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
      if (isDayMapView()) {
        return currentDay.value || 1;
      }
      const raw = String(mapDisplayFilter.value || 'all');
      if (!raw.startsWith('day-')) return null;
      const day = parseInt(raw.replace('day-', ''), 10);
      return Number.isFinite(day) && day > 0 ? day : null;
    };

    const applyMapDisplayFilter = () => {
      const day = getMapDisplayDay();
      if (day) {
        currentDay.value = day;
      }
      updateMapMarkers();
    };

    const { normalizeHexColor, shadeHexColor, makeMapPinIcon, makeHotelMapPinIcon } = TravelMaps;

    const updateMapMarkers = () => {
      if (!mapInstance || !window.google) return;

      markers.forEach(m => m.setMap(null));
      markers = [];
      mapMarkerByPointKey.clear();
      if (mapBounceTimer) {
        clearTimeout(mapBounceTimer);
        mapBounceTimer = null;
      }
      clearMapRouteLine();

      const displayDay = getMapDisplayDay();
      let itemsToRender = itinerary.value.filter(item => shouldShowItineraryOnMap(item) && !isAlternativeItem(item));

      if (displayDay) {
        itemsToRender = itemsToRender.filter(item => (item.day ? parseInt(item.day,10) : 1) === displayDay);
      }

      const bounds = new google.maps.LatLngBounds();
      let hasPoint = false;

      itemsToRender.forEach((item, index) => {
        const pointKey = getMapPointKey('itinerary', item);
        const marker = new google.maps.Marker({
          position: { lat: Number(item.lat), lng: Number(item.lng) },
          map: mapInstance,
          icon: makeMapPinIcon('#ef4444'),
          label: { text: String(index + 1), color: '#1f2937', fontSize: '7px', fontWeight: '800' },
          zIndex: 850,
          title: item.name
        });

        marker.addListener("click", () => {
          const point = getCurrentDayMapPoints().find(candidate => candidate.key === pointKey);
          if (point) markMapPointSelected(point);

          if (isKoreaTrip.value) {
            const buttonId = `open-itinerary-map-${String(item.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
            infoWindow.setContent(
              `<div style="padding:8px; color:#111; max-width:240px;">
                <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(item.name || '')}</div>
                <div style="font-size:12px; color:#555; margin-bottom:8px;">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(getItineraryInfoText(item))}</div>
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
              <span style="font-size:12px; color:#555">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(getItineraryInfoText(item))}</span><br/>
              <a href="${link}" target="_blank" style="color:#2563eb;">Google Maps</a>
            </div>`
          );
          infoWindow.open(mapInstance, marker);
        });

        mapMarkerByPointKey.set(pointKey, { marker, kind: 'itinerary', baseColor: '#ef4444', zIndex: 850 });
        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });


      let alternativeItemsToRender = itinerary.value.filter(item => shouldShowItineraryOnMap(item) && isAlternativeItem(item));
      if (displayDay) {
        alternativeItemsToRender = alternativeItemsToRender.filter(item => (item.day ? parseInt(item.day,10) : 1) === displayDay);
      }

      alternativeItemsToRender.forEach(item => {
        const marker = new google.maps.Marker({
          position: { lat: Number(item.lat), lng: Number(item.lng) },
          map: mapInstance,
          icon: makeMapPinIcon('#f59e0b'),
          zIndex: 850,
          title: item.name
        });

        marker.addListener("click", () => {
          if (isKoreaTrip.value) {
            const buttonId = `open-alt-map-${String(item.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
            infoWindow.setContent(
              `<div style="padding:8px; color:#111; max-width:240px;">
                <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(item.name || '')}</div>
                <div style="font-size:12px; color:#555; margin-bottom:8px;">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(getItineraryInfoText(item))}</div>
                <button
                  id="${buttonId}"
                  style="background:#f59e0b;color:white;border:0;border-radius:8px;padding:7px 10px;font-weight:bold;font-size:12px;"
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
              <span style="font-size:12px; color:#555">${escapeHtml(formatTime(item.time)||'')} ${escapeHtml(getItineraryInfoText(item))}</span><br/>
              <a href="${link}" target="_blank" style="color:#2563eb;">Google Maps</a>
            </div>`
          );
          infoWindow.open(mapInstance, marker);
        });

        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });

      let hotelsToRender = hotels.value.filter(hasMapCoordinates);
      if (displayDay) {
        hotelsToRender = hotelsToRender.filter(hotel => isHotelActiveOnDay(hotel, displayDay));
      }

      hotelsToRender.forEach(hotel => {
        const pointKey = getMapPointKey('hotel', hotel);
        const marker = new google.maps.Marker({
          position: { lat: Number(hotel.lat), lng: Number(hotel.lng) },
          map: mapInstance,
          label: { text: '🏠', fontSize: '15px' },
          icon: makeHotelMapPinIcon('#0d9488'),
          zIndex: 900,
          title: hotel.name || '住宿'
        });

        marker.addListener('click', () => {
          const point = getCurrentDayMapPoints().find(candidate => candidate.key === pointKey);
          if (point) markMapPointSelected(point);
          showHotelInfoWindow(hotel, marker);
        });

        mapMarkerByPointKey.set(pointKey, { marker, kind: 'hotel', baseColor: '#0d9488', zIndex: 900 });
        markers.push(marker);
        bounds.extend(marker.getPosition());
        hasPoint = true;
      });

      // 地圖改為純 marker 檢視：不再繪製路線，避免畫面過亂。
      // 保留 clearMapRouteLine()，讓切換 Day 或更新 marker 時會清除舊線段。

      if (hasPoint) {
        mapInstance.fitBounds(bounds);
      } else {
        mapInstance.setCenter({ lat: 23.6, lng: 121 });
        mapInstance.setZoom(8);
      }

      applyMapMarkerSelection();
      renderProbeMarker();
    };

    const fitBoundsToTrip = () => {
      updateMapMarkers();
    };

    const switchDayViewMode = async (mode) => {
      const previousMapCenter = mapInstance?.getCenter?.()?.toJSON?.() || null;
      const previousMapZoom = mapInstance?.getZoom?.();
      dayViewMode.value = mode === 'map' ? 'map' : 'list';
      await nextTick();

      if (dayViewMode.value === 'map') {
        mapDisplayFilter.value = `day-${currentDay.value || 1}`;
        await loadGoogleMaps();
        initGoogleMap();

        setTimeout(() => {
          if (mapInstance && window.google) {
            google.maps.event.trigger(mapInstance, 'resize');
            updateMapMarkers();
            if (previousMapCenter && Number.isFinite(previousMapZoom)) {
              mapInstance.setCenter(previousMapCenter);
              mapInstance.setZoom(previousMapZoom);
            }
          }
        }, 100);
      } else {
        scheduleSortableInit();
      }
    };

    const fetchTrips = async () => {
      const t0 = performance.now();
      isLoading.value = true;
      try {
        const t_api0 = performance.now();
        const data = await apiGet({ type: 'trips' });
        const t_api1 = performance.now();

        console.log('fetchTrips api ms =', Math.round(t_api1 - t_api0), data);

        const localTrips = new Map(trips.value.map(item => [String(item.id), item]));
        trips.value = Array.isArray(data) ? data.map(item => {
          const local = localTrips.get(String(item.id));
          if (item?.shared_wallet_enabled == null && local?.shared_wallet_enabled != null) {
            return { ...item, shared_wallet_enabled: local.shared_wallet_enabled };
          }
          return item;
        }) : [];
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
        start_date: '',
        shared_wallet_enabled: false
      };

      trips.value.push(newTrip);
      newTripName.value = '';
      newTripCity.value = '';

      await postJSON({ action: 'add', type: 'trips', data: newTrip });
    };

    const selectTrip = async (trip) => {
      if(!trip) return;

      moneyDisplayMode.value = 'personal';
      lastMoneyRefreshAt = 0;
      currentTrip.value = trip;

      itinerary.value = [];
      expenses.value = [];
      sharedWalletTransactions.value = [];
      people.value = [];
      newSharedWalletDeposit.value = { person: '', amount: '', note: '' };
      newSharedWalletPayment.value = { title: '', amount: '', persons: [], category: '飲食', note: '' };
      hotels.value = [];
      hotelSearchQuery.value = '';
      hotelSearchResults.value = [];
      hotelSelectedPlaceData.value = null;
      newHotel.value = { start_day: 1, end_day: 1 };
      currentDay.value = 1;
      totalDays.value = 1;
      mapDisplayFilter.value = 'all';
      mapLocatorOpen.value = false;
      selectedMapPoint.value = null;
      clearProbeSearch();
      probeSearchOpen.value = false;

      currentView.value = 'app';

      const tripId = trip.id;
      loadTripCache(tripId);
      applyEntryDayByToday();

      await nextTick();
      scheduleSortableInit();

      if (isDayMapView()) {
        await loadGoogleMaps();
        initGoogleMap();
      } else {
        updateMapMarkers();
      }

      loadPendingQueue(tripId);
      if (pendingSyncQueue.value.length) {
        flushPendingQueue().then(() => {
          if (!pendingSyncQueue.value.length) {
            fetchData({ autoSelectToday: true });
          }
        });
      } else {
        fetchData({ autoSelectToday: true });
      }
    };

    const exitTrip = () => {
      moneyDisplayMode.value = 'personal';
      lastMoneyRefreshAt = 0;
      currentView.value = 'lobby';
      currentTrip.value = null;
      pendingSyncQueue.value = [];
      syncStatus.value = 'synced';
      syncMessage.value = '';
      tripWeather.value = { status: 'idle' };
      mapDisplayFilter.value = 'all';
      mapLocatorOpen.value = false;
      selectedMapPoint.value = null;
      clearProbeSearch();
      probeSearchOpen.value = false;
      fetchTrips();
    };

    const deleteTripTotally = async () => {
      if(!confirm('確定刪除此旅程？此操作無法復原。')) return;
      await postJSON({ action: 'del', type: 'trips', id: currentTrip.value.id });
      exitTrip();
      await fetchTrips();
    };

    const fetchData = async (options = {}) => {
      if(!currentTrip.value) return false;

      const tripId = currentTrip.value.id;
      const t_start = performance.now();
      const showLoading = options.silent !== true;
      if (showLoading) isLoading.value = true;

      try {
        const t_api_start = performance.now();
        const params = { type: 'tripData', tripId };
        if (options.force) params.force = '1';
        const data = await apiGet(params);
        const t_api_end = performance.now();

        console.log("tripData response ms =", Math.round(t_api_end - t_api_start), data);
        if (!data || data.status === 'error') {
          throw new Error(data?.message || 'tripData refresh failed');
        }

        const trip = data?.trip || null;
        const itin = Array.isArray(data?.itinerary) ? data.itinerary : [];
        const exp  = Array.isArray(data?.expenses) ? data.expenses : [];
        const ppl  = Array.isArray(data?.people) ? data.people : [];
        const htl  = Array.isArray(data?.hotels) ? data.hotels : [];
        const walletPayload = Array.isArray(data?.sharedWalletTransactions)
          ? data.sharedWalletTransactions
          : (Array.isArray(data?.shared_wallet_transactions) ? data.shared_wallet_transactions : null);
        itinerary.value = itin.map(normalizeItineraryRecord);
        expenses.value = exp.map(normalizeExpenseRecord);
        people.value = filterActualPeople(ppl);
        if (!people.value.length) people.value = [{id:'default', name:'我'}];
        syncPersonSelections();
        if (walletPayload) sharedWalletTransactions.value = walletPayload.map(normalizeSharedWalletTransaction);
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

        if (isDayMapView()) {
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
        if (!options.skipWeather) scheduleTripWeatherLoad(500);
        lastMoneyRefreshAt = Date.now();
        return true;
      } finally {
        console.log("fetchData total ms =", Math.round(performance.now() - t_start));
        if (showLoading) isLoading.value = false;
      }
    };

    const onDayClick = async (d) => {
      currentDay.value = d;
      mapLocatorOpen.value = false;
      selectedMapPoint.value = null;
      await nextTick();
      scheduleSortableInit();
      scheduleTripWeatherLoad(250);
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
      if (currentTab.value !== 'itinerary' || dayViewMode.value !== 'list' || !currentTrip.value) {
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
      newPlace.value = item.structured_formatting?.main_text || item.description || '';
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
      const noteSnapshot = '';
      const timeSnapshot = newTime.value || '';
      const typeSnapshot = normalizeItineraryType(newPlaceType.value);

      const item = {
        id,
        name: placeName,
        name_ko: '',
        type: typeSnapshot,
        address: '',
        day: d,
        lat: selectedLatSnapshot != null ? selectedLatSnapshot : (selectedPlaceSnapshot?.lat != null ? Number(selectedPlaceSnapshot.lat) : null),
        lng: selectedLngSnapshot != null ? selectedLngSnapshot : (selectedPlaceSnapshot?.lng != null ? Number(selectedPlaceSnapshot.lng) : null),
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
        let displayName = selectedPlaceSnapshot?.structured_formatting?.main_text || placeName;
        let nameKo = '';
        let address = selectedPlaceSnapshot?.address || selectedPlaceSnapshot?.description || '';

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
          } else if (selectedPlaceSnapshot?.lat != null && selectedPlaceSnapshot?.lng != null) {
            lat = Number(selectedPlaceSnapshot.lat);
            lng = Number(selectedPlaceSnapshot.lng);
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
          type: typeSnapshot,
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


    const { search: searchAlternativePlacesInput } = TravelPlaces.createPredictionSearch({
      query: alternativeSearchQuery,
      results: alternativeSearchResults,
      isSearching: alternativeIsSearching,
      selectedPlaceData: alternativeSelectedPlaceData,
      ensureService: ensureAutocompleteService,
      clearSelectionOnType: true
    });

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
        type: '景點',
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

    const promoteAlternativeToItinerary = async (alt) => {
      if (isPromotingAlternative.value) return;
      if (!currentTrip.value?.id || !alt?.id || !isAlternativeItem(alt)) return;
      if (!confirm(`將「${alt.name || '此備案'}」轉為正式行程？`)) return;

      const id = String(alt.id);
      const tripId = currentTrip.value.id;
      const day = alt.day ? parseInt(alt.day, 10) || currentDay.value : currentDay.value;
      const idx = itinerary.value.findIndex(item => String(item.id) === id);
      if (idx < 0) return;

      isPromotingAlternative.value = true;
      const backupItinerary = itinerary.value.map(item => ({ ...item }));
      const alternativeIds = getOrderIds(tripId, day, true).filter(itemId => String(itemId) !== id);
      const itineraryIds = getOrderIds(tripId, day, false).filter(itemId => String(itemId) !== id);
      itineraryIds.push(id);
      let editCommitted = false;

      itinerary.value[idx].is_alternative = '';
      itinerary.value[idx].order = null;
      setOrderIds(tripId, day, alternativeIds, true);
      setOrderIds(tripId, day, itineraryIds, false);
      currentDay.value = day;

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      try {
        const res = await postJSON({
          action: 'edit',
          type: 'itinerary',
          data: { id, trip_id: tripId, day, is_alternative: '' }
        });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'promote alternative failed');
        }
        editCommitted = true;

        const orderResults = await Promise.allSettled([
          saveOrderToDB(tripId, day, alternativeIds, true),
          saveOrderToDB(tripId, day, itineraryIds, false)
        ]);
        if (orderResults.some(result => result.status === 'rejected')) {
          throw new Error('save promoted itinerary order failed');
        }
      } catch (err) {
        console.error('promoteAlternativeToItinerary failed:', err);
        itinerary.value = backupItinerary.map(item => ({ ...item }));

        if (editCommitted) {
          const rollbackAlternativeIds = getOrderIds(tripId, day, true);
          const rollbackItineraryIds = getOrderIds(tripId, day, false);
          try {
            await postJSON({
              action: 'edit',
              type: 'itinerary',
              data: { id, trip_id: tripId, day, is_alternative: 'v' }
            });
            await Promise.allSettled([
              saveOrderToDB(tripId, day, rollbackAlternativeIds, true),
              saveOrderToDB(tripId, day, rollbackItineraryIds, false)
            ]);
          } catch (rollbackErr) {
            console.error('promote alternative rollback failed:', rollbackErr);
          }
        }

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();
        alert('轉為正式行程失敗，已回復原本備案。');
      } finally {
        isPromotingAlternative.value = false;
      }
    };

    const moveItineraryToAlternative = async (place) => {
      if (isPromotingAlternative.value) return;
      if (!currentTrip.value?.id || !place?.id || isAlternativeItem(place)) return;
      if (!confirm(`將「${place.name || '此行程'}」轉為備案？`)) return;

      const id = String(place.id);
      const tripId = currentTrip.value.id;
      const day = place.day ? parseInt(place.day, 10) || currentDay.value : currentDay.value;
      const idx = itinerary.value.findIndex(item => String(item.id) === id);
      if (idx < 0) return;

      isPromotingAlternative.value = true;
      const backupItinerary = itinerary.value.map(item => ({ ...item }));
      const itineraryIds = getOrderIds(tripId, day, false).filter(itemId => String(itemId) !== id);
      const alternativeIds = getOrderIds(tripId, day, true).filter(itemId => String(itemId) !== id);
      alternativeIds.push(id);
      let editCommitted = false;

      itinerary.value[idx].is_alternative = 'v';
      itinerary.value[idx].order = null;
      setOrderIds(tripId, day, itineraryIds, false);
      setOrderIds(tripId, day, alternativeIds, true);
      currentDay.value = day;

      await nextTick();
      scheduleSortableInit();
      updateMapMarkers();
      scheduleTripCacheSave();

      try {
        const res = await postJSON({
          action: 'edit',
          type: 'itinerary',
          data: { id, trip_id: tripId, day, is_alternative: 'v' }
        });
        if (res && res.status === 'error') {
          throw new Error(res.message || 'move itinerary to alternative failed');
        }
        editCommitted = true;

        const orderResults = await Promise.allSettled([
          saveOrderToDB(tripId, day, itineraryIds, false),
          saveOrderToDB(tripId, day, alternativeIds, true)
        ]);
        if (orderResults.some(result => result.status === 'rejected')) {
          throw new Error('save alternative order failed');
        }
      } catch (err) {
        console.error('moveItineraryToAlternative failed:', err);
        itinerary.value = backupItinerary.map(item => ({ ...item }));

        if (editCommitted) {
          const rollbackItineraryIds = getOrderIds(tripId, day, false);
          const rollbackAlternativeIds = getOrderIds(tripId, day, true);
          try {
            await postJSON({
              action: 'edit',
              type: 'itinerary',
              data: { id, trip_id: tripId, day, is_alternative: '' }
            });
            await Promise.allSettled([
              saveOrderToDB(tripId, day, rollbackItineraryIds, false),
              saveOrderToDB(tripId, day, rollbackAlternativeIds, true)
            ]);
          } catch (rollbackErr) {
            console.error('move itinerary rollback failed:', rollbackErr);
          }
        }

        await nextTick();
        scheduleSortableInit();
        updateMapMarkers();
        scheduleTripCacheSave();
        alert('轉為備案失敗，已回復原本正式行程。');
      } finally {
        isPromotingAlternative.value = false;
      }
    };


    const openExternalMap = (p) => {
      if (isKoreaTrip.value) {
        const lat = p.lat !== '' && p.lat != null ? Number(p.lat) : null;
        const lng = p.lng !== '' && p.lng != null ? Number(p.lng) : null;
        openNaverMap({
          name: p.name || '',
          nameKo: p.name_ko || '',
          lat,
          lng
        });
        return;
      }

      if (p.place_id) {
        openMapWindow(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`);
        return;
      }
      if (p.lat && p.lng) {
        openMapWindow(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`);
        return;
      }
      openMapWindow(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.name||'') + ' ' + (currentTrip.value?.city||''))}`);
    };

    const openEditModal = (p) => {
      if (!p || !p.id) return;
      const parsedMessage = parseItineraryMessage(p.message);
      editPlaceId.value = String(p.id);
      editPlace.value = {
        name: String(p.name || ''),
        type: getItineraryType(p),
        time: formatTime(p.time || ''),
        message: parsedMessage.note,
        day: p.day ? parseInt(p.day, 10) : 1,
        transport: parsedMessage.transport
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
      const editedType = normalizeItineraryType(editPlace.value.type);
      const storedMessage = serializeItineraryMessage(editedType, editPlace.value.message, editPlace.value.transport);

      // 先更新前端，讓編輯結果立即顯示。
      itinerary.value[idx].name = editPlace.value.name || '';
      itinerary.value[idx].type = editedType;
      itinerary.value[idx].time = editPlace.value.time || '';
      itinerary.value[idx].message = storedMessage;
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
            type: getItineraryType(editedItem),
            address: editedItem.address || '',
            lat: editedItem.lat ?? '',
            lng: editedItem.lng ?? '',
            place_id: editedItem.place_id || '',
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
        .filter(e => !isLegacyPublicAccountExpense(e))
        .slice()
        .sort((a, b) => expenseCreatedTime(b) - expenseCreatedTime(a));
    });

    const legacyPublicAccountExpenseCount = computed(() => expenses.value.filter(isLegacyPublicAccountExpense).length);

    const sharedWalletEnabled = computed(() => parseBooleanFlag(currentTrip.value?.shared_wallet_enabled));

    const toggleMoneyDisplayMode = () => {
      if (!sharedWalletEnabled.value) return;
      moneyDisplayMode.value = moneyDisplayMode.value === 'personal' ? 'wallet' : 'personal';
    };

    const sharedWalletRecords = computed(() => {
      return sharedWalletTransactions.value
        .filter(item => (item.type === 'deposit' || item.type === 'payment') && Number(item.amount) > 0)
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    });

    const sharedWalletDeposits = computed(() => sharedWalletRecords.value.filter(item => item.type === 'deposit'));
    const sharedWalletPayments = computed(() => sharedWalletRecords.value.filter(item => item.type === 'payment'));
    const sharedWalletDepositTotal = computed(() => sharedWalletDeposits.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    const sharedWalletPaymentTotal = computed(() => sharedWalletPayments.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    const sharedWalletBalance = computed(() => sharedWalletDepositTotal.value - sharedWalletPaymentTotal.value);
    const sharedWalletMemberBalances = computed(() => {
      const names = Array.from(new Set(
        people.value
          .map(person => normalizePersonName(person.name))
          .filter(Boolean)
      ));
      const balances = {};
      names.forEach(name => { balances[name] = 0; });

      sharedWalletDeposits.value.forEach(item => {
        const person = normalizePersonName(item.person);
        const amount = Number(item.amount) || 0;
        if (balances[person] === undefined || amount <= 0) return;
        balances[person] += amount;
      });

      sharedWalletPayments.value.forEach(item => {
        const selectedPeople = normalizeSharedWalletPeople(item.person)
          .filter(name => balances[name] !== undefined);
        const amount = Number(item.amount) || 0;
        if (amount <= 0) return;

        if (selectedPeople.length) {
          const selectedShare = amount / selectedPeople.length;
          selectedPeople.forEach(name => { balances[name] -= selectedShare; });
          return;
        }

        if (!names.length) return;
        const share = amount / names.length;
        names.forEach(name => { balances[name] -= share; });
      });

      return names.map(name => ({ name, balance: balances[name] }));
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


    const {
      search: searchHotelPlacesInput,
      clearDropdown: clearHotelSearchDropdown
    } = TravelPlaces.createPredictionSearch({
      query: hotelSearchQuery,
      results: hotelSearchResults,
      isSearching: hotelIsSearching,
      selectedPlaceData: hotelSelectedPlaceData,
      ensureService: ensureAutocompleteService,
      types: ['establishment']
    });

    const selectHotelPlace = (item) => {
      hotelSearchQuery.value = item.structured_formatting?.main_text || '';
      hotelSelectedPlaceData.value = item;
      clearHotelSearchDropdown();
    };

    const {
      search: searchEditHotelPlacesInput,
      clearDropdown: clearEditHotelSearchDropdown
    } = TravelPlaces.createPredictionSearch({
      query: editHotelSearchQuery,
      results: editHotelSearchResults,
      isSearching: editHotelIsSearching,
      selectedPlaceData: editHotelSelectedPlaceData,
      ensureService: ensureAutocompleteService,
      types: ['establishment'],
      clearSelectionOnType: true
    });

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

    const syncSharedWalletPayload = async (payload) => {
      try {
        const res = await postJSON(payload, { queueOnFail: false });
        if (!res || res.status !== 'error') return res;

        const message = String(res.message || 'shared wallet sync failed');
        if (/unknown action|missing type|invalid type|unknown shared wallet action/i.test(message)) {
          enqueuePendingWrite(payload, new Error(message));
          return { status: 'queued', queued: true, message };
        }
        const serverError = new Error(message);
        serverError.isWalletServerError = true;
        throw serverError;
      } catch (err) {
        if (err?.isWalletServerError) throw err;
        if (!pendingSyncQueue.value.some(job => job.payload === payload)) {
          enqueuePendingWrite(payload, err);
        }
        return { status: 'queued', queued: true, message: String(err?.message || err || '') };
      }
    };

    const updateSharedWalletSetting = async (eventOrValue) => {
      if (isUpdatingSharedWalletSetting.value || !currentTrip.value?.id) return;
      const enabled = typeof eventOrValue === 'boolean'
        ? eventOrValue
        : Boolean(eventOrValue?.target?.checked);
      const tripId = currentTrip.value.id;
      const previous = currentTrip.value.shared_wallet_enabled;

      isUpdatingSharedWalletSetting.value = true;
      currentTrip.value = { ...currentTrip.value, shared_wallet_enabled: enabled };
      if (!enabled) moneyDisplayMode.value = 'personal';
      const tripIndex = trips.value.findIndex(item => String(item.id) === String(tripId));
      if (tripIndex !== -1) trips.value[tripIndex] = { ...trips.value[tripIndex], shared_wallet_enabled: enabled };
      scheduleTripCacheSave();
      saveTripsCache();

      try {
        const res = await syncSharedWalletPayload({
          action: 'shared_wallet_setting_update',
          tripId,
          enabled: enabled ? 'true' : 'false',
          data: { trip_id: tripId, enabled }
        });
        if (res && res.status === 'error') throw new Error(res.message || 'wallet setting update failed');
      } catch (err) {
        currentTrip.value = { ...currentTrip.value, shared_wallet_enabled: previous };
        if (tripIndex !== -1) trips.value[tripIndex] = { ...trips.value[tripIndex], shared_wallet_enabled: previous };
        scheduleTripCacheSave();
        saveTripsCache();
        alert('共同旅費錢包設定更新失敗，請稍後再試。');
      } finally {
        isUpdatingSharedWalletSetting.value = false;
      }
    };

    const addSharedWalletTransaction = async (type) => {
      if (isSavingSharedWallet.value || !currentTrip.value?.id || !sharedWalletEnabled.value) return;
      const isDeposit = type === 'deposit';
      const form = isDeposit ? newSharedWalletDeposit.value : newSharedWalletPayment.value;
      const amount = Number(form.amount || 0);
      const date = defaultWalletDate();
      const person = normalizePersonName(form.person);
      const selectedPeople = normalizeSharedWalletPeople(form.persons);
      const title = String(form.title || '').trim();
      const category = categories.includes(form.category) ? form.category : '其他';
      const validPeople = people.value.map(item => normalizePersonName(item.name)).filter(Boolean);
      const validSelectedPeople = selectedPeople.filter(name => validPeople.includes(name));
      const transactionPerson = isDeposit
        ? person
        : validSelectedPeople.join(',');

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || amount <= 0) return;
      if (isDeposit && (!person || !validPeople.includes(person))) return;
      if (!isDeposit && !title) return;
      if (!isDeposit && amount > sharedWalletBalance.value) {
        alert(`共同錢包餘額不足，目前可用 $${Math.round(sharedWalletBalance.value)}。`);
        return;
      }

      const now = new Date().toISOString();
      const transaction = normalizeSharedWalletTransaction({
        id: generateId(),
        trip_id: currentTrip.value.id,
        type,
        date,
        title: isDeposit ? '存入' : title,
        person: transactionPerson,
        amount,
        category: isDeposit ? '' : category,
        note: String(form.note || '').trim(),
        created_at: now,
        updated_at: now
      });
      const transactionPayload = isDeposit
        ? Object.fromEntries(Object.entries(transaction).filter(([key]) => key !== 'category'))
        : transaction;

      isSavingSharedWallet.value = true;
      sharedWalletTransactions.value.unshift(transaction);
      scheduleTripCacheSave();

      try {
        const res = await syncSharedWalletPayload({
          action: 'shared_wallet_add',
          tripId: currentTrip.value.id,
          data: transactionPayload
        });
        if (res && res.status === 'error') throw new Error(res.message || 'wallet transaction add failed');

        if (isDeposit) {
          newSharedWalletDeposit.value = { person, amount: '', note: '' };
        } else {
          newSharedWalletPayment.value = { title: '', amount: '', persons: [], category: '飲食', note: '' };
        }
      } catch (err) {
        const index = sharedWalletTransactions.value.findIndex(item => String(item.id) === String(transaction.id));
        if (index !== -1) sharedWalletTransactions.value.splice(index, 1);
        scheduleTripCacheSave();
        alert(isDeposit ? '存入紀錄新增失敗，請稍後再試。' : '公費支出新增失敗，請稍後再試。');
      } finally {
        isSavingSharedWallet.value = false;
      }
    };

    const addSharedWalletDeposit = () => addSharedWalletTransaction('deposit');
    const addSharedWalletPayment = () => addSharedWalletTransaction('payment');

    const removeSharedWalletTransaction = async (item) => {
      if (isSavingSharedWallet.value || !item?.id || !currentTrip.value?.id) return;
      if (item.type === 'deposit' && sharedWalletBalance.value - Number(item.amount || 0) < 0) {
        alert('刪除此筆存入後錢包會變成負數，請先調整支出紀錄。');
        return;
      }
      if (!confirm(`確定刪除此筆${item.type === 'deposit' ? '存入' : '公費支出'}紀錄？`)) return;

      const index = sharedWalletTransactions.value.findIndex(record => String(record.id) === String(item.id));
      if (index < 0) return;
      const backup = { ...sharedWalletTransactions.value[index] };
      isSavingSharedWallet.value = true;
      sharedWalletTransactions.value.splice(index, 1);
      scheduleTripCacheSave();

      try {
        const res = await syncSharedWalletPayload({
          action: 'shared_wallet_delete',
          tripId: currentTrip.value.id,
          id: item.id,
          data: { id: item.id, trip_id: currentTrip.value.id }
        });
        if (res && res.status === 'error') throw new Error(res.message || 'wallet transaction delete failed');
      } catch (err) {
        sharedWalletTransactions.value.splice(index, 0, backup);
        scheduleTripCacheSave();
        alert('錢包紀錄刪除失敗，請稍後再試。');
      } finally {
        isSavingSharedWallet.value = false;
      }
    };

    const addExpense = async () => {
      if (isAddingExpense.value) return;

      const title = String(newExpense.value.title || '').trim();
      const amount = Number(newExpense.value.amount || 0);
      const payer = normalizePersonName(newExpense.value.payer);

      if (!title || amount <= 0 || !payer) return;
      if (!currentTrip.value?.id) return;
      const validPeople = people.value.map(person => normalizePersonName(person.name)).filter(Boolean);
      const involved = normalizeInvolved(newExpense.value.involved)
        .map(normalizePersonName)
        .filter(name => validPeople.includes(name));
      if (!validPeople.includes(payer) || !involved.length) return;

      isAddingExpense.value = true;

      const uid = generateId();
      const d = normalizeExpenseRecord({
        id: uid,
        ...newExpense.value,
        title,
        amount,
        payer,
        day: newExpense.value.day || currentDay.value || 1,
        involved,
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
      } finally {
        isAddingExpense.value = false;
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
      const payer = normalizePersonName(editExpense.value.payer);
      if (!title || amount <= 0 || !payer) return;
      const validPeople = people.value.map(person => normalizePersonName(person.name)).filter(Boolean);
      const involved = normalizeInvolved(editExpense.value.involved)
        .map(normalizePersonName)
        .filter(name => validPeople.includes(name));
      if (!validPeople.includes(payer) || !involved.length) return;

      isSavingExpense.value = true;

      try {
        const updated = normalizeExpenseRecord({
          ...expenses.value[idx],
          ...editExpense.value,
          id,
          title,
          amount,
          payer,
          day: editExpense.value.day || 1,
          involved,
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
      isSavingExpense.value = true;
      expenses.value.splice(idx, 1);
      try {
        await postJSON({ action:'del', type:'expenses', id: item.id });
      } finally {
        isSavingExpense.value = false;
      }
    };

    const addPerson = async () => {
      const name = newPerson.value.trim();
      if (!name) return;
      if (isSystemWalletPerson(name)) {
        alert('「公帳」是共同旅費錢包的系統名稱，請使用其他成員名稱。');
        return;
      }
      const uid = generateId();
      people.value.push({ id: uid, name, trip_id: currentTrip.value.id });
      if (!newExpense.value.involved.includes(name)) newExpense.value.involved.push(name);
      if (!newExpense.value.payer) newExpense.value.payer = name;
      if (!newSharedWalletDeposit.value.person) newSharedWalletDeposit.value.person = name;
      newPerson.value = '';
      await postJSON({ action:'add', type:'people', data: { id: uid, name, trip_id: currentTrip.value.id } });
    };

    const removePerson = async (idx) => {
      const item = people.value[idx];
      if (!item?.id || !confirm('確定移除此成員？')) return;
      people.value.splice(idx, 1);
      syncPersonSelections();
      await postJSON({ action:'del', type:'people', id: item.id });
    };

    const totalExpense = computed(() => normalExpenseRecords.value.reduce((s,i) => s + (Number(i.amount) || 0), 0));
    const actualTripExpense = computed(() => totalExpense.value + (sharedWalletEnabled.value ? sharedWalletPaymentTotal.value : 0));

    const balanceSheet = computed(() => {
      if(!people.value.length) return [];
      const b = {};
      people.value.forEach(person => {
        const name = normalizePersonName(person.name);
        if (name) b[name] = 0;
      });

      normalExpenseRecords.value.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        const payer = normalizePersonName(expense.payer);
        if (amount <= 0) return;

        const involved = normalizeInvolved(expense.involved).map(normalizePersonName);
        const targets = involved.length ? involved : Object.keys(b);
        const validTargets = targets.filter(name => b[name] !== undefined);

        if (b[payer] === undefined) return;
        b[payer] += amount;

        if(validTargets.length) {
          const share = amount / validTargets.length;
          validTargets.forEach(name => b[name] -= share);
        }
      });

      return Object.keys(b).map(n => ({name:n, balance:b[n]}));
    });

    const categoryAnalysis = computed(() => {
      const stats = {};
      normalExpenseRecords.value.forEach(e => {
        const cat = e.category || '其他';
        stats[cat] = (stats[cat] || 0) + (Number(e.amount) || 0);
      });
      if (sharedWalletEnabled.value) {
        sharedWalletPayments.value.forEach(item => {
          const cat = item.category || '其他';
          stats[cat] = (stats[cat] || 0) + (Number(item.amount) || 0);
        });
      }
      return Object.entries(stats).map(([name, total]) => ({name, total})).sort((a,b) => b.total - a.total);
    });

    // 匯出所需的唯讀資料與輔助函式，交給 TravelExport 產生文字／HTML。
    const exportContext = () => ({
      trip: currentTrip.value,
      totalDays: totalDays.value,
      appVersion: APP_VERSION,
      isKoreaTrip: isKoreaTrip.value,
      dayLabel,
      getDayOrderedItems,
      getHotelsForDay,
      getMapExportLinks
    });

    const buildItineraryText = () => TravelExport.buildItineraryText(exportContext());



    const buildBackupHtml = () => TravelExport.buildBackupHtml(exportContext());

    const downloadBackupHtml = () => {
      const html = buildBackupHtml();
      if (!html) return;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = TravelExport.backupFileName(currentTrip.value?.name, APP_VERSION);
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

    const canAutoRefreshMoney = () => (
      currentView.value === 'app' &&
      currentTab.value === 'money' &&
      currentTrip.value?.id &&
      !document.hidden
    );

    const refreshMoneyData = async (options = {}) => {
      const force = options.force === true;
      if (isRefreshingMoney.value || !currentTrip.value?.id) return false;
      if (!force && !canAutoRefreshMoney()) return false;
      if (!force && Date.now() - lastMoneyRefreshAt < MONEY_REFRESH_THROTTLE_MS) return false;
      if (isLoading.value || isAddingExpense.value || isSavingExpense.value || isSavingSharedWallet.value) return false;

      isRefreshingMoney.value = true;
      if (force) {
        syncStatus.value = 'syncing';
        syncMessage.value = '';
      }
      try {
        await flushPendingQueue();
        if (pendingSyncQueue.value.length) return false;

        const refreshed = await fetchData({
          force,
          silent: options.silent !== false,
          skipWeather: true
        });
        if (refreshed) {
          syncStatus.value = 'synced';
          syncMessage.value = '已同步';
        }
        return refreshed;
      } catch (err) {
        console.error('refreshMoneyData failed:', err);
        if (force) {
          syncStatus.value = 'error';
          syncMessage.value = '同步失敗';
        }
        return false;
      } finally {
        isRefreshingMoney.value = false;
      }
    };

    const stopMoneyAutoRefresh = () => {
      if (!moneyRefreshTimer) return;
      clearInterval(moneyRefreshTimer);
      moneyRefreshTimer = null;
    };

    const updateMoneyAutoRefresh = () => {
      stopMoneyAutoRefresh();
      if (!canAutoRefreshMoney()) return;
      moneyRefreshTimer = setInterval(() => {
        refreshMoneyData({ silent: true });
      }, MONEY_REFRESH_INTERVAL_MS);
    };

    const manualSync = async () => {
      await refreshMoneyData({ force: true, silent: false });
    };

    const switchTab = async (tab) => {
      currentTab.value = tab;
      if (tab === 'itinerary') {
        dayViewMode.value = 'list';
      }
      await nextTick();

      scheduleSortableInit();
      if (tab === 'money') {
        await refreshMoneyData({ silent: true });
      }
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
      newExpense.value.day = currentDay.value || 1;
      mapLocatorOpen.value = false;
      selectedMapPoint.value = null;
      if (getMapDisplayDay()) {
        mapDisplayFilter.value = `day-${currentDay.value || 1}`;
      }
      scheduleSortableInit();
      if (isDayMapView()) updateMapMarkers();
      scheduleTripWeatherLoad(250);
    });

    watch(currentTab, () => {
      scheduleSortableInit();
      updateMoneyAutoRefresh();
      if (isDayMapView()) {
        setTimeout(() => updateMapMarkers(), 80);
      } else if (currentTab.value === 'itinerary') {
        scheduleTripWeatherLoad(250);
      }
    });

    watch(sharedWalletEnabled, enabled => {
      if (!enabled) moneyDisplayMode.value = 'personal';
    });

    watch(dayViewMode, () => {
      scheduleSortableInit();
      if (isDayMapView()) {
        setTimeout(() => updateMapMarkers(), 80);
      } else {
        mapLocatorOpen.value = false;
        closeProbeSearchPanel();
      }
    });

    watch(currentView, () => {
      scheduleSortableInit();
      updateMoneyAutoRefresh();
    });
    watch([itinerary, expenses, sharedWalletTransactions, people, hotels], () => scheduleTripCacheSave(), { deep: true });
    watch(currentTrip, () => scheduleTripCacheSave(), { deep: true });
    watch(trips, () => scheduleTripsCacheSave(), { deep: true });

    const handleAppResume = () => {
      refreshTodayKey();
      // iOS 主畫面書籤會保留上次畫面，回到前景時主動刷新日期/倒數。
      if (currentView.value === 'lobby') {
        fetchTrips();
      } else if (canAutoRefreshMoney()) {
        refreshMoneyData({ silent: true });
      }
      updateMoneyAutoRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopMoneyAutoRefresh();
        return;
      }
      handleAppResume();
    };

    const handleOnline = async () => {
      await flushPendingQueue();
      if (!pendingSyncQueue.value.length && canAutoRefreshMoney()) {
        refreshMoneyData({ silent: true });
      }
    };

    onMounted(async () => {
      refreshTodayKey();
      const hasTripsCache = loadTripsCache();
      console.log('loadTripsCache =', hasTripsCache);
      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleAppResume);
      window.addEventListener('pageshow', handleAppResume);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      todayRefreshTimer = setInterval(refreshTodayKey, 60 * 1000);
      updateMoneyAutoRefresh();
      fetchTrips();
    });

    onBeforeUnmount(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleAppResume);
      window.removeEventListener('pageshow', handleAppResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (todayRefreshTimer) clearInterval(todayRefreshTimer);
      stopMoneyAutoRefresh();
      if (mapBounceTimer) clearTimeout(mapBounceTimer);
      if (probeSearchTimeout) clearTimeout(probeSearchTimeout);
      clearProbeMarker();
    });

    return {
      APP_VERSION,
      currentView, currentTrip, trips, newTripName, newTripCity,
      currentTab, dayViewMode, moneyDisplayMode, isLoading, syncStatusText, syncStatusBadgeClass, manualSync,
      isAddingPlace, isAddingExpense, isSavingSharedWallet, isUpdatingSharedWalletSetting, isSavingExpense,
      isAddingAlternative, isDeletingAlternative, isPromotingAlternative,
      currentDay, totalDays,
      people, itinerary, expenses, sharedWalletTransactions, hotels, alternatives, filteredItinerary, filteredAlternatives, currentDayHotels,
      newPlace, newTime, newPlaceType, newNote, newPerson, newExpense,
      walletEntryMode, newSharedWalletDeposit, newSharedWalletPayment,
      expenseFilter, categories, itineraryTypes,
      searchResults, translatedSearchHint, isSearching, isCoordinateMode, resolvedCoordName,
      isMapReady, mapDisplayFilter, mapLocatorOpen, selectedMapPoint, currentDayMapPoints,
      probeSearchOpen, probeQuery, probeResults, probeIsSearching, probePlace,
      tripWeather,
      newHotel, hotelSearchQuery, hotelSearchResults, hotelIsSearching, isAddingHotel, isDeletingHotel,
      showEditHotelModal, editHotel, editHotelSearchQuery, editHotelSearchResults, editHotelIsSearching, editHotelSelectedPlaceData, isSavingHotel,
      newAlternative, alternativeSearchQuery, alternativeSearchResults, alternativeIsSearching,

      createTrip, selectTrip, exitTrip, deleteTripTotally, fetchData,

      switchTab, switchDayViewMode, addNewDay, deleteDay, onDayClick, onDayDblClick, dayLabel,
      tripCountdownDays, tripCountdownLabel,

      showDayModal, modalDay, dateInput, swapTargetDay, closeDayModal, applyDay1Date, swapWithDay,

      searchPlacesInput, useCoordinateInput, selectPlace,
      addPlace, removePlace, openExternalMap, handleItineraryContentClick, linkifyMessage,
      getItineraryType, getItineraryTypeTone, getItineraryCategoryLabel, getItineraryIcon,
      getItineraryNote, getTransportSummary,
      hasMapCoordinates, itineraryListEl, alternativeListEl, formatTime,

      fitBoundsToTrip, applyMapDisplayFilter,
      toggleMapLocator, closeMapLocator, focusItineraryMapPoint, showAllCurrentDayMapPoints,
      toggleProbeSearch, clearProbeSearch, closeProbeSearchPanel,
      searchProbePlacesInput, selectProbePlace, searchProbeByQuery,
      searchHotelPlacesInput, selectHotelPlace, addHotel, removeHotel,
      searchEditHotelPlacesInput, selectEditHotelPlace, openEditHotelModal, closeEditHotelModal, saveEditHotel,
      hotelDayRangeLabel, openHotelMap,
      searchAlternativePlacesInput, selectAlternativePlace, addAlternative, removeAlternative, promoteAlternativeToItinerary, moveItineraryToAlternative,

      toggleMoneyDisplayMode, updateSharedWalletSetting, addSharedWalletDeposit, addSharedWalletPayment, removeSharedWalletTransaction,
      toggleSharedWalletPaymentPerson, selectAllSharedWalletPaymentPeople, formatSharedWalletUsers,
      addExpense, removeExpense, openEditExpenseModal, closeEditExpenseModal, saveEditExpense, addPerson, removePerson,
      totalExpense, actualTripExpense, balanceSheet, categoryAnalysis, formatInvolved, getExpenseCategoryIcon, expenseDateLabel,
      sharedWalletEnabled, sharedWalletRecords, sharedWalletDeposits, sharedWalletPayments,
      sharedWalletDepositTotal, sharedWalletPaymentTotal, sharedWalletBalance, sharedWalletMemberBalances, legacyPublicAccountExpenseCount,
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
