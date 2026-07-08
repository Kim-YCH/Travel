(function (window) {
  'use strict';

  const mergePredictions = (...groups) => {
    const seen = new Set();
    const out = [];

    groups.flat().forEach((item) => {
      const key = item?.place_id || item?.description;
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });

    return out;
  };

  const defaultFallbackImageFields = () => ({
    image_url: '',
    image_source: 'fallback',
    photo_attributions: '',
    image_updated_at: new Date().toISOString()
  });

  const extractPlacePhotoInfo = (place, options = {}) => {
    const buildFallbackImageFields = options.buildFallbackImageFields || defaultFallbackImageFields;
    const photos = Array.isArray(place?.photos) ? place.photos : [];
    const photo = photos[0] || null;

    if (!photo || typeof photo.getUrl !== 'function') {
      return buildFallbackImageFields();
    }

    let imageUrl = '';
    try {
      imageUrl = photo.getUrl({ maxWidth: 800, maxHeight: 600 }) || '';
    } catch (err) {
      console.warn('Place photo getUrl failed:', err);
    }

    const attributionsRaw = photo.html_attributions || photo.photo_attributions || [];
    const photoAttributions = Array.isArray(attributionsRaw)
      ? attributionsRaw.join(' ')
      : String(attributionsRaw || '');

    if (!imageUrl) return buildFallbackImageFields();

    return {
      image_url: imageUrl,
      image_source: 'google_places',
      photo_attributions: photoAttributions,
      image_updated_at: new Date().toISOString()
    };
  };

  const fallbackEscapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const sanitizePhotoAttributions = (value, options = {}) => {
    const raw = Array.isArray(value) ? value.join(' ') : String(value || '');
    if (!raw.trim()) return '';

    const doc = options.document || window.document;
    const escapeHtml = options.escapeHtml || fallbackEscapeHtml;
    if (!doc?.createElement) return escapeHtml(raw.replace(/\s+/g, ' ').trim());

    const template = doc.createElement('template');
    template.innerHTML = raw;
    const links = Array.from(template.content.querySelectorAll('a'))
      .map((a) => {
        const href = String(a.getAttribute('href') || '').trim();
        const text = String(a.textContent || '').trim();
        if (!text || !/^https?:\/\//i.test(href)) return '';
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
      })
      .filter(Boolean);

    if (links.length) return links.join(' ');

    const plain = String(template.content.textContent || raw)
      .replace(/\s+/g, ' ')
      .trim();
    return escapeHtml(plain);
  };

  window.TravelPlaces = Object.freeze({
    mergePredictions,
    extractPlacePhotoInfo,
    sanitizePhotoAttributions
  });
})(window);
