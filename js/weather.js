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

  window.TravelWeather = Object.freeze({
    weatherCodeInfo,
    uvLevelLabel
  });
})(window);
