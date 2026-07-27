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
    createPredictionSearch
  });
})(window);
