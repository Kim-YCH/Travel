(function (window) {
  'use strict';

  const weatherCodeInfo = (code) => {
    const n = Number(code);
    if (n === 0) return { icon: '☀️', text: '晴朗' };
    if ([1, 2].includes(n)) return { icon: '🌤️', text: '多雲時晴' };
    if (n === 3) return { icon: '☁️', text: '多雲' };
    if ([45, 48].includes(n)) return { icon: '🌫️', text: '有霧' };
    if ([51, 53, 55, 56, 57].includes(n)) return { icon: '🌦️', text: '毛毛雨' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return { icon: '🌧️', text: '有雨' };
    if ([71, 73, 75, 77, 85, 86].includes(n)) return { icon: '❄️', text: '降雪' };
    if ([95, 96, 99].includes(n)) return { icon: '⛈️', text: '雷雨' };
    return { icon: '🌤️', text: '天氣' };
  };

  const uvLevelLabel = (uv) => {
    const n = Number(uv);
    if (!Number.isFinite(n)) return '';
    if (n < 3) return '低';
    if (n < 6) return '中等';
    if (n < 8) return '高';
    if (n < 11) return '過量';
    return '危險';
  };

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const FORECAST_DAILY_FIELDS = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max';
  // Open-Meteo 最多提供 16 天預報，超過就不查。
  const MAX_FORECAST_DAYS = 16;
  const FORECAST_HORIZON_DAYS = 15;
  const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000;

  // 已經過完的日子改打 archive（ERA5 重分析），拿的是實際觀測值不是預報。
  // 免費、免金鑰、有 CORS，跟 forecast 同一家。
  //
  // 欄位是實測出來的，不要照抄 forecast 那組：
  //   · uv_index_max 與 precipitation_probability_max 在 archive 一律回 null
  //     （daily_units 顯示 "undefined"）—— 不會 400，但要了也沒用，所以不要。
  //   · 改用 precipitation_sum（實際降雨量 mm），比「機率」對過去的日子更有意義。
  //   · timezone=auto 與 wind_speed_unit=ms 都支援。
  //
  // 資料範圍：1940 至今，**沒有 reanalysis 的延遲空窗** —— 實測昨天與今天都拿得到
  // （Open-Meteo 用預報模型回填最近幾天）。所以不需要「近期用 forecast 的 past_days、
  // 更早用 archive」那種雙路徑，單一端點就涵蓋所有過去日期。
  const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
  const ARCHIVE_DAILY_FIELDS = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';

  // 把 Open-Meteo 的 daily 區塊轉成畫面用的物件。純函式，方便單獨驗證。
  //
  // kind 區分資料來源：
  //   'forecast' —— 預報。有降雨「機率」(%) 與 UV。
  //   'history'  —— 已經過完的日子，拿的是實際觀測值。沒有機率也沒有 UV，
  //                 但有實際降雨「量」(mm)，所以 rainText 兩種來源長得不一樣。
  // 模板一律讀 rainText，不要自己判斷 % 還是 mm。
  const buildWeatherFromDaily = (daily, idx, { label, dayText, targetDate, kind = 'forecast' } = {}) => {
    const codeInfo = weatherCodeInfo(daily.weather_code?.[idx]);
    const rain = daily.precipitation_probability_max?.[idx];
    const rainSum = daily.precipitation_sum?.[idx];
    const uv = daily.uv_index_max?.[idx];
    const wind = daily.wind_speed_10m_max?.[idx];

    const rainValue = rain != null ? Math.round(Number(rain)) : null;
    const rainMm = rainSum != null && Number.isFinite(Number(rainSum)) ? Number(rainSum) : null;

    // 沒下雨就寫 0 mm，不要「0.0 mm」；10mm 以上也不需要小數位（假精確）。
    let rainText = '';
    if (rainValue != null) rainText = `${rainValue}%`;
    else if (rainMm != null) rainText = `${rainMm.toFixed(rainMm === 0 || rainMm >= 10 ? 0 : 1)} mm`;

    return {
      status: 'ready',
      kind,
      icon: codeInfo.icon,
      title: codeInfo.text,
      subtitle: label,
      dayText,
      targetDate,
      max: Math.round(Number(daily.temperature_2m_max?.[idx])),
      min: Math.round(Number(daily.temperature_2m_min?.[idx])),
      rain: rainValue,
      rainMm,
      rainText,
      uv: uv != null ? Number(uv).toFixed(0) : '',
      uvLabel: uvLevelLabel(uv),
      wind: wind != null ? Number(wind).toFixed(1) : ''
    };
  };

  /**
   * 天氣載入。tripWeather 是唯一被寫入的 ref；其餘輸入都是唯讀。
   * 預報結果與城市座標各自快取在模組內，不外洩到 app.js。
   */
  const create = ({
    tripWeather,
    tripForecast,
    currentTrip,
    currentDay,
    totalDays,
    dayDateYMD,
    daysFromToday,
    getDayOrderedItems,
    getHotelsForDay,
    loadGoogleMaps,
    dateUtils,
    now = () => Date.now()
  }) => {
    const { toYMD, parseYMD, addDays } = dateUtils;
    const forecastCache = new Map();
    const locationCache = new Map();
    let loadTimer = null;

    const readForecastCache = (key) => {
      const entry = forecastCache.get(key);
      if (!entry) return null;

      const age = Number(now()) - entry.cachedAt;
      if (!Number.isFinite(age) || age < 0 || age >= WEATHER_CACHE_TTL_MS) {
        forecastCache.delete(key);
        return null;
      }
      return entry.value;
    };

    const writeForecastCache = (key, value) => {
      forecastCache.set(key, { value, cachedAt: Number(now()) });
    };

    const resolveWeatherLocation = async (day = currentDay.value) => {
      const d = parseInt(day, 10) || 1;

      const dayItem = getDayOrderedItems(d, false).find((item) => item.lat != null && item.lng != null);
      if (dayItem) {
        return {
          lat: Number(dayItem.lat),
          lng: Number(dayItem.lng),
          label: dayItem.name || currentTrip.value?.city || '目的地'
        };
      }

      const dayHotel = getHotelsForDay(d).find((hotel) => hotel.lat != null && hotel.lng != null);
      if (dayHotel) {
        return {
          lat: Number(dayHotel.lat),
          lng: Number(dayHotel.lng),
          label: dayHotel.name || currentTrip.value?.city || '住宿'
        };
      }

      const city = String(currentTrip.value?.city || '').trim();
      if (!city) return null;

      const key = city.toLowerCase();
      if (locationCache.has(key)) return locationCache.get(key);

      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!window.google || !window.google.maps?.Geocoder) return null;

      const geocoder = new window.google.maps.Geocoder();
      const location = await new Promise((resolve) => {
        geocoder.geocode({ address: city }, (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            resolve({
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
              label: city
            });
          } else {
            resolve(null);
          }
        });
      });

      if (location) locationCache.set(key, location);
      return location;
    };

    const loadTripWeather = async () => {
      if (!currentTrip.value) return;

      const targetDate = dayDateYMD(currentDay.value);
      const diff = daysFromToday(targetDate);
      const dayText = `Day ${currentDay.value}`;

      if (diff == null) {
        tripWeather.value = { status: 'unavailable', title: '天氣', subtitle: '尚未設定日期', dayText };
        return;
      }

      if (diff > FORECAST_HORIZON_DAYS) {
        const availableDate = toYMD(addDays(parseYMD(targetDate), -FORECAST_HORIZON_DAYS));
        tripWeather.value = {
          status: 'future',
          title: '預報尚早',
          subtitle: `${availableDate} 後可查`,
          dayText,
          targetDate
        };
        return;
      }

      const location = await resolveWeatherLocation(currentDay.value);
      if (!location) {
        tripWeather.value = { status: 'unavailable', title: '天氣', subtitle: '找不到目的地座標', dayText };
        return;
      }

      // 已經過完的日子走 archive，其餘走 forecast。
      const isPast = diff < 0;

      // kind 一定要進 cache key：同一天在跨過午夜之後會從「今天的預報」變成
      // 「昨天的實測」，key 不含 kind 的話會一直吐舊的預報結果。
      const kind = isPast ? 'history' : 'forecast';
      const key = `${kind}_${currentTrip.value.id}_${currentDay.value}_${targetDate}_${location.lat.toFixed(3)}_${location.lng.toFixed(3)}`;
      const cachedWeather = readForecastCache(key);
      if (cachedWeather) {
        tripWeather.value = cachedWeather;
        return;
      }

      tripWeather.value = { status: 'loading', title: '天氣載入中', subtitle: location.label, dayText };

      const params = new URLSearchParams({
        latitude: String(location.lat),
        longitude: String(location.lng),
        daily: isPast ? ARCHIVE_DAILY_FIELDS : FORECAST_DAILY_FIELDS,
        timezone: 'auto',
        wind_speed_unit: 'ms'
      });

      if (isPast) {
        // archive 用 start_date / end_date 指定單一天，沒有 forecast_days 這個參數。
        params.set('start_date', targetDate);
        params.set('end_date', targetDate);
      } else {
        params.set('forecast_days', String(Math.min(MAX_FORECAST_DAYS, Math.max(1, diff + 1))));
      }

      try {
        const res = await fetch(`${isPast ? ARCHIVE_URL : FORECAST_URL}?${params.toString()}`);
        if (!res.ok) throw new Error(`weather api ${res.status}`);
        const data = await res.json();
        const times = data?.daily?.time || [];
        const idx = times.indexOf(targetDate);
        if (idx < 0) throw new Error('target date not in forecast');

        const weather = buildWeatherFromDaily(data.daily, idx, { label: location.label, dayText, targetDate, kind });
        writeForecastCache(key, weather);
        tripWeather.value = weather;
      } catch (err) {
        console.warn('loadTripWeather failed:', err);
        tripWeather.value = {
          status: 'unavailable',
          title: '天氣暫不可用',
          subtitle: location.label,
          dayText,
          targetDate
        };
      }
    };


    // ── 整趟天氣一覽 ────────────────────────────────────────────────
    // 行前規劃想看的是整趟走勢（哪天會下雨、要不要把室外行程換一天），
    // 而不是一次只看一格。
    //
    // ★ 座標一律用 trips.city，不用 resolveWeatherLocation 的逐日解析。
    //   逐日解析會拿「當天第一個有座標的行程點」，多城市行程每天座標不同，
    //   要打好幾次 API；而天氣是城市尺度的現象，同城內差幾公里沒有意義。
    //   以城市為準 → 整趟最多兩次呼叫（過去一段 archive、未來一段 forecast）。
    const resolveCityLocation = async () => {
      const city = String(currentTrip.value?.city || '').trim();
      if (!city) return null;

      const key = city.toLowerCase();
      if (locationCache.has(key)) return locationCache.get(key);

      if (!window.google || !window.google.maps) await loadGoogleMaps();
      if (!window.google || !window.google.maps?.Geocoder) return null;

      const geocoder = new window.google.maps.Geocoder();
      const location = await new Promise((resolve) => {
        geocoder.geocode({ address: city }, (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            resolve({
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
              label: city
            });
          } else {
            resolve(null);
          }
        });
      });

      if (location) locationCache.set(key, location);
      return location;
    };

    // 一次抓一整段連續日期，回傳 { 'YYYY-MM-DD': weather } 對照表。
    const fetchRange = async (location, startYMD, endYMD, kind) => {
      const isPast = kind === 'history';
      const params = new URLSearchParams({
        latitude: String(location.lat),
        longitude: String(location.lng),
        daily: isPast ? ARCHIVE_DAILY_FIELDS : FORECAST_DAILY_FIELDS,
        timezone: 'auto',
        wind_speed_unit: 'ms'
      });

      if (isPast) {
        params.set('start_date', startYMD);
        params.set('end_date', endYMD);
      } else {
        // forecast 沒有 start_date，只能指定「從今天起算幾天」
        const span = daysFromToday(endYMD);
        if (span == null) return {};
        params.set('forecast_days', String(Math.min(MAX_FORECAST_DAYS, Math.max(1, span + 1))));
      }

      const res = await fetch(`${isPast ? ARCHIVE_URL : FORECAST_URL}?${params.toString()}`);
      if (!res.ok) throw new Error(`weather api ${res.status}`);
      const data = await res.json();
      const times = data?.daily?.time || [];

      const out = {};
      times.forEach((ymd, idx) => {
        out[ymd] = buildWeatherFromDaily(data.daily, idx, {
          label: location.label, dayText: '', targetDate: ymd, kind
        });
      });
      return out;
    };

    const loadTripForecast = async () => {
      const trip = currentTrip.value;
      const days = Math.max(1, parseInt(totalDays.value, 10) || 1);
      if (!trip) { tripForecast.value = []; return; }

      // 先把骨架排出來：沒有資料的日子留白，不要整條不顯示。
      const skeleton = [];
      for (let d = 1; d <= days; d += 1) {
        const ymd = dayDateYMD(d);
        skeleton.push({ day: d, date: ymd, weather: null });
      }
      tripForecast.value = skeleton;

      if (!trip.start_date) return;          // 沒設日期就沒有「哪一天」可言
      const location = await resolveCityLocation();
      if (!location) return;                 // 城市查不到座標，留白

      // 依「相對今天」切成過去段與未來段。太遠的未來（超過預報極限）直接跳過。
      const past = skeleton.filter((s) => { const n = daysFromToday(s.date); return n != null && n < 0; });
      const future = skeleton.filter((s) => {
        const n = daysFromToday(s.date);
        return n != null && n >= 0 && n <= FORECAST_HORIZON_DAYS;
      });

      const cacheKey = `trip_${trip.id}_${location.lat.toFixed(3)}_${location.lng.toFixed(3)}_${trip.start_date}_${days}`;
      const cachedForecast = readForecastCache(cacheKey);
      if (cachedForecast) { tripForecast.value = cachedForecast; return; }

      const byDate = {};
      const jobs = [];
      let allRangesLoaded = false;
      if (past.length) jobs.push(fetchRange(location, past[0].date, past[past.length - 1].date, 'history'));
      if (future.length) jobs.push(fetchRange(location, future[0].date, future[future.length - 1].date, 'forecast'));

      try {
        // 一段失敗不該讓另一段跟著不見
        const settled = await Promise.allSettled(jobs);
        allRangesLoaded = settled.every((result) => result.status === 'fulfilled');
        settled.forEach((r) => { if (r.status === 'fulfilled') Object.assign(byDate, r.value); });
      } catch (err) {
        console.warn('loadTripForecast failed:', err);
      }

      const filled = skeleton.map((s) => ({ ...s, weather: byDate[s.date] || null }));
      if (allRangesLoaded && Object.values(byDate).length) writeForecastCache(cacheKey, filled);
      tripForecast.value = filled;
    };

    const scheduleTripWeatherLoad = (delay = 250) => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        loadTripWeather().catch((err) => console.warn('loadTripWeather failed:', err));
      }, delay);
    };

    return Object.freeze({ resolveWeatherLocation, loadTripWeather, loadTripForecast, scheduleTripWeatherLoad });
  };

  window.TravelWeather = Object.freeze({
    weatherCodeInfo,
    uvLevelLabel,
    buildWeatherFromDaily,
    create
  });
})(window);
