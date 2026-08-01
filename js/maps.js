(function (window) {
  'use strict';

  const normalizeHexColor = (color, fallback = '#ef4444') => {
    const s = String(color || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return '#' + s.slice(1).split('').map(ch => ch + ch).join('');
    }
    return fallback;
  };

  const shadeHexColor = (color, amount = 0) => {
    const hex = normalizeHexColor(color).slice(1);
    const clamp = (value) => Math.max(0, Math.min(255, value));
    const r = clamp(parseInt(hex.slice(0, 2), 16) + amount);
    const g = clamp(parseInt(hex.slice(2, 4), 16) + amount);
    const b = clamp(parseInt(hex.slice(4, 6), 16) + amount);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  };

  const svgDataUrl = (svg) => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);

  // 水滴形定位 pin：正式行程、備案、住宿、探點共用同一外型，只用顏色與 label 區分。
  const placePinSvg = (baseColor, lightColor, darkColor) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="54" viewBox="0 0 36 54">
          <defs>
            <linearGradient id="pinGrad" x1="9" y1="3" x2="27" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="${lightColor}"/>
              <stop offset="0.48" stop-color="${baseColor}"/>
              <stop offset="1" stop-color="${darkColor}"/>
            </linearGradient>
            <radialGradient id="holeGrad" cx="50%" cy="38%" r="65%">
              <stop offset="0" stop-color="#ffffff"/>
              <stop offset="1" stop-color="#eef2f7"/>
            </radialGradient>
            <filter id="pinShadow" x="-25%" y="-10%" width="150%" height="130%">
              <feDropShadow dx="0" dy="2.2" stdDeviation="1.8" flood-color="#111827" flood-opacity="0.22"/>
            </filter>
          </defs>
          <ellipse cx="18" cy="50" rx="9.5" ry="2.8" fill="#111827" opacity="0.16"/>
          <path
            filter="url(#pinShadow)"
            d="M18 1.5C8.9 1.5 1.5 8.9 1.5 18C1.5 30.2 18 51 18 51C18 51 34.5 30.2 34.5 18C34.5 8.9 27.1 1.5 18 1.5Z"
            fill="url(#pinGrad)"
          />
          <path
            d="M10 6.8C6.9 9.3 5.1 13.4 5.2 17.8"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.28"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="18" cy="17.8" r="8.2" fill="url(#holeGrad)" opacity="0.96"/>
          <circle cx="18" cy="17.8" r="8.2" fill="none" stroke="${darkColor}" stroke-opacity="0.13" stroke-width="1.2"/>
        </svg>
      `;

  // 住宿 marker 回復成接近原本的實心 pin，不使用圓孔，避免 🏠 圖示被孔洞干擾。
  const hotelPinSvg = (baseColor, lightColor, darkColor) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">
          <defs>
            <linearGradient id="hotelPinGrad" x1="6" y1="2" x2="21" y2="41" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="${lightColor}"/>
              <stop offset="0.55" stop-color="${baseColor}"/>
              <stop offset="1" stop-color="${darkColor}"/>
            </linearGradient>
            <filter id="hotelPinShadow" x="-25%" y="-10%" width="150%" height="130%">
              <feDropShadow dx="0" dy="1.8" stdDeviation="1.4" flood-color="#111827" flood-opacity="0.22"/>
            </filter>
          </defs>
          <ellipse cx="13.5" cy="40.5" rx="7" ry="2.2" fill="#111827" opacity="0.14"/>
          <path
            filter="url(#hotelPinShadow)"
            d="M13.5 0C6.04 0 0 6.04 0 13.5C0 23.63 13.5 43 13.5 43C13.5 43 27 23.63 27 13.5C27 6.04 20.96 0 13.5 0Z"
            fill="url(#hotelPinGrad)"
          />
        </svg>
      `;

  const makeMapPinIcon = (fillColor) => {
    if (!window.google || !window.google.maps) return null;
    const g = window.google.maps;

    const baseColor = normalizeHexColor(fillColor);
    const svg = placePinSvg(baseColor, shadeHexColor(baseColor, 34), shadeHexColor(baseColor, -42));

    return {
      url: svgDataUrl(svg),
      scaledSize: new g.Size(28, 42),
      anchor: new g.Point(14, 42),
      labelOrigin: new g.Point(14, 16)
    };
  };

  const makeHotelMapPinIcon = (fillColor = '#0d9488') => {
    if (!window.google || !window.google.maps) return null;
    const g = window.google.maps;

    const baseColor = normalizeHexColor(fillColor, '#0d9488');
    const svg = hotelPinSvg(baseColor, shadeHexColor(baseColor, 26), shadeHexColor(baseColor, -34));

    return {
      url: svgDataUrl(svg),
      scaledSize: new g.Size(34, 54),
      anchor: new g.Point(17, 54),
      labelOrigin: new g.Point(17, 19)
    };
  };

  /* ------------------------------------------------------------ 路線深層連結 */

  const NAVER_APP_PATH = Object.freeze({ transit: 'public', car: 'car', walk: 'walk' });
  const NAVER_WEB_MODE = Object.freeze({ transit: 'transit', car: 'car', walk: 'walk' });
  const GOOGLE_TRAVEL_MODE = Object.freeze({ transit: 'transit', car: 'driving', walk: 'walking' });

  const normalizeRoutePoint = (point) => {
    if (!point) return null;
    const lat = point.lat === '' || point.lat == null ? null : Number(point.lat);
    const lng = point.lng === '' || point.lng == null ? null : Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // 韓文名優先：Naver 的標籤用它顯示比較準。
    const name = String(point.nameKo || point.name || '').trim();
    return { lat, lng, name };
  };

  /**
   * Naver Map 路線連結。起訖點都是必要的，缺一個就回空字串。
   *
   * - `useApp` 為真時輸出 `nmap://` scheme（只有裝了 App 的行動裝置能開）；
   *   為假時輸出 map.naver.com 網址，給桌機用。
   * - App scheme 是官方文件明列的；**網頁版路徑格式沒有官方文件**，屬盡力而為的退路。
   * - 注意網頁版是「經度,緯度」，和 App scheme 的 lat/lng 參數順序相反。
   */
  const buildNaverRouteUrl = ({ mode = 'transit', start = null, goal = null, appname = '', useApp = true } = {}) => {
    const origin = normalizeRoutePoint(start);
    const target = normalizeRoutePoint(goal);
    if (!origin || !target) return '';

    if (!useApp) {
      const seg = (p) => `${p.lng},${p.lat},${encodeURIComponent(p.name)}`;
      return `https://map.naver.com/p/directions/${seg(origin)}/${seg(target)}/-/${NAVER_WEB_MODE[mode] || 'transit'}`;
    }

    const params = [
      `slat=${origin.lat}`, `slng=${origin.lng}`, `sname=${encodeURIComponent(origin.name)}`,
      `dlat=${target.lat}`, `dlng=${target.lng}`, `dname=${encodeURIComponent(target.name)}`,
      // appname 是必填參數，網頁要填頁面網址，Naver Map 用它做「返回原 App」。
      `appname=${encodeURIComponent(appname || 'travel')}`
    ];

    return `nmap://route/${NAVER_APP_PATH[mode] || 'public'}?${params.join('&')}`;
  };

  const buildNaverPlaceUrl = ({ name = '', nameKo = '', address = '', lat = null, lng = null, appname = '' } = {}) => {
    const point = normalizeRoutePoint({ name: nameKo || name || address, lat, lng });
    const title = String(nameKo || name || address || '地點').trim();
    if (point) {
      return `nmap://place?lat=${point.lat}&lng=${point.lng}&name=${encodeURIComponent(title)}&appname=${encodeURIComponent(appname || 'travel')}`;
    }
    const searchText = String(address || nameKo || name).trim();
    if (!searchText) return '';

    return `nmap://search?query=${encodeURIComponent(searchText)}&appname=${encodeURIComponent(appname || 'travel')}`;
  };

  /**
   * Naver Map 桌面版地點網址。座標優先開啟 marker，缺座標時才搜尋保存的地址。
   */
  const buildNaverWebPlaceUrl = ({ name = '', nameKo = '', address = '', lat = null, lng = null, zoom = 16 } = {}) => {
    const title = String(nameKo || name || address || '地點').trim();
    const point = normalizeRoutePoint({ name: title, lat, lng });
    if (point) {
      const normalizedZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 16;
      return `https://map.naver.com/p/?title=${encodeURIComponent(title)}&lng=${point.lng}&lat=${point.lat}&zoom=${normalizedZoom}&type=0`;
    }

    const savedAddress = String(address).trim();
    return savedAddress ? `https://map.naver.com/p/search/${encodeURIComponent(savedAddress)}` : '';
  };

  /**
   * Google Maps 路線連結（非韓國行程用）。同一個 https 網址在手機上會直接開 App。
   */
  const buildGoogleRouteUrl = ({ mode = 'transit', start = null, goal = null } = {}) => {
    const origin = normalizeRoutePoint(start);
    const target = normalizeRoutePoint(goal);
    if (!origin || !target) return '';

    return 'https://www.google.com/maps/dir/?'
      + `api=1&origin=${origin.lat},${origin.lng}&destination=${target.lat},${target.lng}`
      + `&travelmode=${GOOGLE_TRAVEL_MODE[mode] || 'transit'}`;
  };

  window.TravelMaps = Object.freeze({
    normalizeHexColor,
    shadeHexColor,
    makeMapPinIcon,
    makeHotelMapPinIcon,
    buildNaverRouteUrl,
    buildNaverPlaceUrl,
    buildNaverWebPlaceUrl,
    buildGoogleRouteUrl
  });
})(window);
