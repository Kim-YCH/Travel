(function (window) {
  'use strict';

  const getExternalMapLink = ({ name = '', lat = null, lng = null, place_id = '' }) => {
    if (place_id) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${place_id}`;
    }
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  };

  const getMapExportLinks = (place = {}, options = {}) => {
    const currentTrip = options.currentTrip || null;
    const isKoreaTrip = Boolean(options.isKoreaTrip);
    const title = String(place.name || place.title || place.name_ko || currentTrip?.name || '行程').trim();
    const address = String(place.address || '').trim();
    const queryText = [title, address, currentTrip?.city || ''].filter(Boolean).join(' ') || title;
    const lat = place.lat !== '' && place.lat != null ? Number(place.lat) : null;
    const lng = place.lng !== '' && place.lng != null ? Number(place.lng) : null;
    const encodedName = encodeURIComponent(title);
    const encodedQuery = encodeURIComponent(queryText || title);

    if (isKoreaTrip) {
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

  window.TravelMaps = Object.freeze({
    getExternalMapLink,
    getMapExportLinks
  });
})(window);
