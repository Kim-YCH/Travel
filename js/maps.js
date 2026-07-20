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
      scaledSize: new g.Size(16, 24),
      anchor: new g.Point(8, 24),
      labelOrigin: new g.Point(8, 9)
    };
  };

  const makeHotelMapPinIcon = (fillColor = '#0d9488') => {
    if (!window.google || !window.google.maps) return null;
    const g = window.google.maps;

    const baseColor = normalizeHexColor(fillColor, '#0d9488');
    const svg = hotelPinSvg(baseColor, shadeHexColor(baseColor, 26), shadeHexColor(baseColor, -34));

    return {
      url: svgDataUrl(svg),
      scaledSize: new g.Size(24, 38),
      anchor: new g.Point(12, 38),
      labelOrigin: new g.Point(12, 13)
    };
  };

  window.TravelMaps = Object.freeze({
    normalizeHexColor,
    shadeHexColor,
    makeMapPinIcon,
    makeHotelMapPinIcon
  });
})(window);
