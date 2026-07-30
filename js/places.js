(function (window) {
  'use strict';

  const PLACE_DETAIL_FIELDS = Object.freeze([
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'types'
  ]);

  const getPlaceDetailFields = () => PLACE_DETAIL_FIELDS.slice();

  /**
   * 合併多組候選清單並去重，先出現的優先。
   * app.js 的翻譯搜尋與這裡的 createPredictionSearch 共用同一套規則。
   */
  const mergePredictions = (...groups) => {
    const seen = new Set();
    const out = [];
    groups.flat().forEach((item) => {
      const key = item && (item.place_id || item.description);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  };

  const classifySharedMapUrl = (value) => {
    const raw = String(value || '').trim();
    const urlWithScheme = !/^[a-z][a-z\d+.-]*:\/\//i.test(raw)
      && /^(?:naver\.me|(?:m\.)?map\.naver\.com|m\.place\.naver\.com|maps\.app\.goo\.gl|goo\.gl|(?:www\.)?google\.com|maps\.google\.com)(?:[/?#]|$)/i.test(raw)
      ? `https://${raw}`
      : raw;

    try {
      const url = new URL(urlWithScheme);
      if (url.protocol !== 'https:') {
        return { supported: false, provider: '', kind: '', url: urlWithScheme };
      }

      const host = url.hostname.toLowerCase();
      if (host === 'naver.me') {
        return { supported: true, provider: 'naver', kind: 'short', url: urlWithScheme };
      }
      if (host === 'map.naver.com' || host === 'm.map.naver.com' || host === 'm.place.naver.com') {
        return { supported: true, provider: 'naver', kind: 'full', url: urlWithScheme };
      }
      if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
        return { supported: true, provider: 'google', kind: 'short', url: urlWithScheme };
      }
      if (host === 'google.com' || host === 'www.google.com' || host === 'maps.google.com') {
        return { supported: true, provider: 'google', kind: 'full', url: urlWithScheme };
      }
    } catch (_) {
      // An incomplete or ordinary place query is handled by the existing search.
    }

    return { supported: false, provider: '', kind: '', url: urlWithScheme };
  };

  const extractSharedMapCoordinates = (...values) => {
    const expand = (value) => {
      let source = String(value || '');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const decoded = decodeURIComponent(source);
          if (decoded === source) break;
          source = decoded;
        } catch (_) {
          break;
        }
      }
      return source;
    };

    for (const value of values) {
      const source = expand(value);
      const placeMatch = source.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
      const viewportMatch = source.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const match = placeMatch || viewportMatch;
      if (!match) continue;

      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    return { lat: null, lng: null };
  };

  const extractLikelyPlaceName = (value) => {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';

    const commaParts = source.split(',').map(part => part.trim()).filter(Boolean);
    const candidate = commaParts.length >= 3 ? commaParts[commaParts.length - 1] : source;
    const trailingLatinName = candidate.match(
      /[\u3400-\u9fff\uac00-\ud7af]\s+([A-Za-z][A-Za-z0-9&'().+\-]*(?:\s+[A-Za-z0-9&'().+\-]+){0,5})$/
    );

    return trailingLatinName ? trailingLatinName[1].trim() : candidate;
  };

  const placeCoordinate = (value, limit) => {
    if (value === null || value === undefined || value === '') return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
  };

  const distanceMeters = (origin, target) => {
    const lat1 = placeCoordinate(origin?.lat, 90);
    const lng1 = placeCoordinate(origin?.lng, 180);
    const lat2 = placeCoordinate(target?.lat, 90);
    const lng2 = placeCoordinate(target?.lng, 180);
    if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Infinity;

    const radians = value => value * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLng = radians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const findNearbyPlaceCandidate = (candidates, origin, maxDistanceMeters = 300) => {
    const maxDistance = Number(maxDistanceMeters);
    if (!Array.isArray(candidates) || !Number.isFinite(maxDistance) || maxDistance < 0) return null;

    let closest = null;
    let closestDistance = Infinity;
    candidates.forEach((candidate) => {
      const distance = distanceMeters(origin, candidate);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    });

    return closestDistance <= maxDistance ? closest : null;
  };

  /**
   * 建立一組 debounce 的 Places Autocomplete 搜尋。
   *
   * 備案、新增住宿、編輯住宿三處原本各有一份幾乎相同的實作，只差 `types` 選項與
   * 「輸入時是否清掉已選地點」。這裡收成單一來源，行為與原本逐一對應：
   *
   * - query / results / isSearching / selectedPlaceData 皆為 Vue ref
   * - 清空輸入時關掉下拉並清除已選地點
   * - clearSelectionOnType 為真時，每次重新輸入也清掉已選地點
   * - ensureService 由呼叫端提供，負責載入 SDK 並回傳共用的 AutocompleteService
   * - extraCandidates 為選填的 async(keyword) => 候選陣列，與 Google 平行送出後合併，
   *   排在 Google predictions 前面（韓國行程的 Naver 在地結果命中率較高）。
   *   它拋錯只會少一組候選，不影響 Google 的結果。
   *
   * 僅要求 predictions，不涉及任何圖片欄位。
   */
  const createPredictionSearch = ({
    query,
    results,
    isSearching,
    selectedPlaceData = null,
    ensureService,
    types = null,
    delay = 300,
    clearSelectionOnType = false,
    extraCandidates = null
  }) => {
    let timer = null;
    let searchGeneration = 0;

    const clearDropdown = () => {
      searchGeneration += 1;
      results.value = [];
      isSearching.value = false;
    };

    const search = async () => {
      const q = String(query.value || '').trim();

      if (!q) {
        clearDropdown();
        if (selectedPlaceData) selectedPlaceData.value = null;
        return;
      }

      if (clearSelectionOnType && selectedPlaceData) selectedPlaceData.value = null;
      isSearching.value = true;

      if (timer) clearTimeout(timer);

      const generation = ++searchGeneration;
      timer = setTimeout(async () => {
        const extraTask = extraCandidates
          ? Promise.resolve().then(() => extraCandidates(q)).catch((err) => {
              console.warn('extraCandidates failed:', err);
              return [];
            })
          : Promise.resolve([]);
        const googleTask = Promise.resolve()
          .then(() => ensureService())
          .then((service) => new Promise((resolve) => {
            const request = { input: q, language: 'zh-TW' };
            if (types) request.types = types;
            service.getPlacePredictions(request, (predictions, status) => {
              const okStatus = window.google.maps.places.PlacesServiceStatus.OK;
              resolve((status === okStatus && predictions) ? predictions : []);
            });
          }))
          .catch((err) => {
            console.error(err);
            return [];
          });

        try {
          const [predictions, extras] = await Promise.all([googleTask, extraTask]);
          if (generation !== searchGeneration) return;
          results.value = mergePredictions(Array.isArray(extras) ? extras : [], predictions);
          isSearching.value = false;
        } catch (err) {
          console.error(err);
          if (generation === searchGeneration) clearDropdown();
        }
      }, delay);
    };

    return { search, clearDropdown };
  };

  window.TravelPlaces = Object.freeze({
    PLACE_DETAIL_FIELDS,
    getPlaceDetailFields,
    mergePredictions,
    classifySharedMapUrl,
    extractSharedMapCoordinates,
    extractLikelyPlaceName,
    findNearbyPlaceCandidate,
    createPredictionSearch
  });
})(window);
