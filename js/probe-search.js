(function (window) {
  'use strict';

  // 探點搜尋：地圖上的臨時查詢工具。
  // 依 docs/architecture.md 的地圖規則，它只放一顆暫時 marker，不建立行程資料，
  // 也不要求 Places Photo 或任何圖片欄位。
  //
  // 這個子系統自己擁有 probeMarker 與 debounce timer；probe* 系列 ref 由 app.js
  // 傳入，因為模板要綁定它們。mapInstance 與 infoWindow 在 app.js 是可變的區域
  // 變數，會被 initGoogleMap 重新指派，所以用 getter 取得而非直接傳值。

  const PROBE_DEBOUNCE_MS = 350;
  const PROBE_FOCUS_ZOOM = 15;
  const PROBE_MARKER_COLOR = '#334155';
  const COORD_RE = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;

  const normalizeProbePlace = (data = {}) => ({
    name: String(data.name || data.description || data.address || '探點').trim(),
    address: String(data.address || data.formatted_address || data.description || '').trim(),
    lat: data.lat != null ? Number(data.lat) : null,
    lng: data.lng != null ? Number(data.lng) : null,
    place_id: String(data.place_id || '')
  });

  const getExternalMapLink = ({ name = '', lat = null, lng = null, place_id = '' }) => {
    if (place_id) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(place_id)}`;
    }
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  };

  const create = ({
    probeQuery,
    probeResults,
    probeIsSearching,
    probePlace,
    probeSearchOpen,
    mapLocatorOpen,
    currentTrip,
    getMap,
    getInfoWindow,
    cleanLabelText,
    hasChineseTitle,
    hasForeignTitle,
    translateTitleToChinese,
    searchPlacesWithTranslation,
    getPlaceDetails,
    loadGoogleMaps,
    initGoogleMap,
    isDayMapView,
    nextTick
  }) => {
    const escapeHtml = (s) => window.TravelUtils.escapeHtml(s);
    const makeMapPinIcon = (c) => window.TravelMaps.makeMapPinIcon(c);

    let probeMarker = null;
    let searchTimeout = null;

    const cancelPendingSearch = () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
    };

    const clearProbeMarker = () => {
      if (probeMarker) {
        probeMarker.setMap(null);
        probeMarker = null;
      }
    };

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
        .filter((item) => hasForeignTitle(getProbeResultTitle(item)));

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

    const renderProbeMarker = () => {
      const map = getMap();
      if (!map || !window.google || !probePlace.value) return;

      const place = probePlace.value;
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      clearProbeMarker();

      probeMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map,
        title: place.name || '探點',
        label: { text: '🔎', fontSize: '10px' },
        icon: makeMapPinIcon(PROBE_MARKER_COLOR),
        zIndex: 1200
      });

      probeMarker.addListener('click', () => {
        const infoWindow = getInfoWindow();
        if (!infoWindow) return;
        const link = getExternalMapLink(place);
        infoWindow.setContent(
          `<div style="padding:8px;color:#111;max-width:240px;">
            <div style="font-weight:700;margin-bottom:4px;">🔎 ${escapeHtml(place.name || '探點')}</div>
            <div style="font-size:12px;color:#555;margin-bottom:8px;">${escapeHtml(place.address || '')}</div>
            <a href="${link}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:700;">Google Maps</a>
          </div>`
        );
        infoWindow.open(getMap(), probeMarker);
      });
    };

    const focusProbePlace = () => {
      const map = getMap();
      if (!map || !window.google || !probePlace.value) return;
      const lat = Number(probePlace.value.lat);
      const lng = Number(probePlace.value.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      renderProbeMarker();
      map.panTo({ lat, lng });
      if ((map.getZoom() || 0) < PROBE_FOCUS_ZOOM) map.setZoom(PROBE_FOCUS_ZOOM);
    };

    const clearProbeSearch = () => {
      cancelPendingSearch();
      probeQuery.value = '';
      probeResults.value = [];
      probeIsSearching.value = false;
      probePlace.value = null;
      clearProbeMarker();
      const infoWindow = getInfoWindow();
      if (infoWindow) infoWindow.close();
    };

    const closeProbeSearchPanel = () => {
      cancelPendingSearch();
      probeSearchOpen.value = false;
      probeResults.value = [];
      probeIsSearching.value = false;
    };

    // 探點與行程定位面板必須互斥開啟。
    const toggleProbeSearch = async () => {
      const willOpen = !probeSearchOpen.value;
      probeSearchOpen.value = willOpen;
      if (!willOpen) return;

      mapLocatorOpen.value = false;
      await nextTick();
      if (!getMap() && isDayMapView()) {
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
      if (!getMap()) initGoogleMap();
      if (!window.google || !getMap()) return false;

      const city = String(currentTrip.value?.city || '').trim();
      const query = city && !q.includes(city) ? `${q} ${city}` : q;
      const geocoder = new window.google.maps.Geocoder();
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

      cancelPendingSearch();

      if (!q) {
        clearProbeSearch();
        probeSearchOpen.value = true;
        return;
      }

      if (COORD_RE.test(q)) {
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
      searchTimeout = setTimeout(async () => {
        try {
          const opts = {};
          const map = getMap();
          if (map && typeof map.getBounds === 'function') {
            const bounds = map.getBounds();
            if (bounds) opts.bounds = bounds;
          }
          const out = await searchPlacesWithTranslation(q, opts);
          // 使用者可能已經改了關鍵字，過期結果直接丟掉。
          if (probeQuery.value.trim() !== q) return;
          const results = (out.predictions || []).map((item) => ({
            ...item,
            probe_title: getProbeResultTitle(item)
          }));
          probeResults.value = results;
          enrichProbeResultsWithChinese(results, q).catch((err) => console.warn('probe zh labels failed:', err));
        } catch (err) {
          console.error(err);
          if (probeQuery.value.trim() === q) probeResults.value = [];
        } finally {
          if (probeQuery.value.trim() === q) probeIsSearching.value = false;
        }
      }, PROBE_DEBOUNCE_MS);
    };

    const searchProbeByQuery = async () => {
      const q = probeQuery.value.trim();
      cancelPendingSearch();
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
          window.alert('找不到這個探點');
        }
      } catch (err) {
        console.error(err);
      } finally {
        probeIsSearching.value = false;
      }
    };

    const selectProbePlace = async (item) => {
      if (!item) return;
      cancelPendingSearch();
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

    const dispose = () => {
      cancelPendingSearch();
      clearProbeMarker();
    };

    return Object.freeze({
      clearProbeMarker,
      getProbeResultTitle,
      getProbeDisplayName,
      focusProbePlace,
      clearProbeSearch,
      closeProbeSearchPanel,
      toggleProbeSearch,
      searchProbePlacesInput,
      selectProbePlace,
      searchProbeByQuery,
      dispose
    });
  };

  window.TravelProbeSearch = Object.freeze({
    normalizeProbePlace,
    getExternalMapLink,
    create
  });
})(window);
