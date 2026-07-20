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

  // 把 Open-Meteo 的 daily 區塊轉成畫面用的物件。純函式，方便單獨驗證。
  const buildWeatherFromDaily = (daily, idx, { label, dayText, targetDate }) => {
    const codeInfo = weatherCodeInfo(daily.weather_code?.[idx]);
    const rain = daily.precipitation_probability_max?.[idx];
    const uv = daily.uv_index_max?.[idx];
    const wind = daily.wind_speed_10m_max?.[idx];

    return {
      status: 'ready',
      icon: codeInfo.icon,
      title: codeInfo.text,
      subtitle: label,
      dayText,
      targetDate,
      max: Math.round(Number(daily.temperature_2m_max?.[idx])),
      min: Math.round(Number(daily.temperature_2m_min?.[idx])),
      rain: rain != null ? Math.round(Number(rain)) : null,
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
    currentTrip,
    currentDay,
    dayDateYMD,
    daysFromToday,
    getDayOrderedItems,
    getHotelsForDay,
    loadGoogleMaps,
    dateUtils
  }) => {
    const { toYMD, parseYMD, addDays } = dateUtils;
    const forecastCache = new Map();
    const locationCache = new Map();
    let loadTimer = null;

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

      if (diff < 0) {
        tripWeather.value = { status: 'unavailable', title: '日期已過', subtitle: targetDate, dayText };
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

      const key = `${currentTrip.value.id}_${currentDay.value}_${targetDate}_${location.lat.toFixed(3)}_${location.lng.toFixed(3)}`;
      if (forecastCache.has(key)) {
        tripWeather.value = forecastCache.get(key);
        return;
      }

      tripWeather.value = { status: 'loading', title: '天氣載入中', subtitle: location.label, dayText };

      const params = new URLSearchParams({
        latitude: String(location.lat),
        longitude: String(location.lng),
        daily: FORECAST_DAILY_FIELDS,
        timezone: 'auto',
        forecast_days: String(Math.min(MAX_FORECAST_DAYS, Math.max(1, diff + 1))),
        wind_speed_unit: 'ms'
      });

      try {
        const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
        if (!res.ok) throw new Error(`weather api ${res.status}`);
        const data = await res.json();
        const times = data?.daily?.time || [];
        const idx = times.indexOf(targetDate);
        if (idx < 0) throw new Error('target date not in forecast');

        const weather = buildWeatherFromDaily(data.daily, idx, { label: location.label, dayText, targetDate });
        forecastCache.set(key, weather);
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

    const scheduleTripWeatherLoad = (delay = 250) => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        loadTripWeather().catch((err) => console.warn('loadTripWeather failed:', err));
      }, delay);
    };

    return Object.freeze({ resolveWeatherLocation, loadTripWeather, scheduleTripWeatherLoad });
  };

  window.TravelWeather = Object.freeze({
    weatherCodeInfo,
    uvLevelLabel,
    buildWeatherFromDaily,
    create
  });
})(window);
