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
   * 建立一組 debounce 的 Places Autocomplete 搜尋。
   *
   * 備案、新增住宿、編輯住宿三處原本各有一份幾乎相同的實作，只差 `types` 選項與
   * 「輸入時是否清掉已選地點」。這裡收成單一來源，行為與原本逐一對應：
   *
   * - query / results / isSearching / selectedPlaceData 皆為 Vue ref
   * - 清空輸入時關掉下拉並清除已選地點
   * - clearSelectionOnType 為真時，每次重新輸入也清掉已選地點
   * - ensureService 由呼叫端提供，負責載入 SDK 並回傳共用的 AutocompleteService
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
    clearSelectionOnType = false
  }) => {
    let timer = null;

    const clearDropdown = () => {
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

      timer = setTimeout(async () => {
        try {
          const service = await ensureService();
          const request = { input: q, language: 'zh-TW' };
          if (types) request.types = types;

          service.getPlacePredictions(request, (predictions, status) => {
            const okStatus = window.google.maps.places.PlacesServiceStatus.OK;
            results.value = (status === okStatus && predictions) ? predictions : [];
            isSearching.value = false;
          });
        } catch (err) {
          console.error(err);
          clearDropdown();
        }
      }, delay);
    };

    return { search, clearDropdown };
  };

  window.TravelPlaces = Object.freeze({
    PLACE_DETAIL_FIELDS,
    getPlaceDetailFields,
    createPredictionSearch
  });
})(window);
