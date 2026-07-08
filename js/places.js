(function (window) {
  'use strict';

  const ITINERARY_FALLBACK_IMAGES = Object.freeze({
    sightseeing: './assets/default-sightseeing.svg',
    food: './assets/default-food.svg',
    shopping: './assets/default-shopping.svg',
    hotel: './assets/default-hotel.svg',
    transport: './assets/default-transport.svg',
    activity: './assets/default-travel.svg',
    other: './assets/default-travel.svg',
    default: './assets/default-travel.svg'
  });

  const GOOGLE_PLACES_PHOTO_URL_MAX_AGE_MS = 6 * 60 * 60 * 1000;

  const createImageHelpers = ({ getItineraryTypeTone }) => {
    const getFallbackItineraryImage = (item = {}) => {
      const tone = item?._fallbackTone || getItineraryTypeTone(item);
      return ITINERARY_FALLBACK_IMAGES[tone] || ITINERARY_FALLBACK_IMAGES.default;
    };

    const getItineraryImage = (item = {}) => {
      const url = String(item?.image_url || '').trim();
      return url || getFallbackItineraryImage(item);
    };

    const getHotelItineraryImage = (hotel = {}) => getItineraryImage({
      ...hotel,
      _fallbackTone: 'hotel'
    });

    const buildFallbackImageFields = () => ({
      image_url: '',
      image_source: 'fallback',
      photo_attributions: '',
      image_updated_at: new Date().toISOString()
    });

    const isGooglePlacesPhotoServiceUrl = (url) => {
      return /maps\.googleapis\.com\/maps\/api\/place\/js\/PhotoService\.GetPhoto/i.test(String(url || ''));
    };

    const isStaleGooglePlacesPhotoUrl = (url, updatedAt) => {
      if (!isGooglePlacesPhotoServiceUrl(url)) return false;
      const updatedTime = Date.parse(updatedAt || '');
      if (!Number.isFinite(updatedTime)) return true;
      return Date.now() - updatedTime > GOOGLE_PLACES_PHOTO_URL_MAX_AGE_MS;
    };

    const normalizeItineraryImageFields = (item = {}) => {
      const imageUrl = String(item?.image_url || '').trim();
      const imageUpdatedAt = String(item?.image_updated_at || '').trim();

      if (isStaleGooglePlacesPhotoUrl(imageUrl, imageUpdatedAt)) {
        return {
          image_url: '',
          image_source: 'fallback',
          photo_attributions: '',
          image_updated_at: ''
        };
      }

      return {
        image_url: imageUrl,
        image_source: String(item?.image_source || '').trim(),
        photo_attributions: String(item?.photo_attributions || '').trim(),
        image_updated_at: imageUpdatedAt
      };
    };

    const extractPlacePhotoInfo = (place) => {
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

    const handleItineraryImageError = (event, item = {}) => {
      const img = event?.target;
      if (!img) return;

      if (item && typeof item === 'object' && String(item.image_url || '').trim()) {
        item.image_url = '';
      }

      if (img.dataset.fallbackStage === 'category') {
        img.dataset.fallbackStage = 'default';
        img.src = ITINERARY_FALLBACK_IMAGES.default;
        return;
      }

      if (img.dataset.fallbackStage === 'default') {
        img.removeAttribute('src');
        return;
      }

      img.dataset.fallbackStage = 'category';
      img.src = getFallbackItineraryImage(item);
    };

    const handleHotelItineraryImageError = (event) => {
      handleItineraryImageError(event, { _fallbackTone: 'hotel' });
    };

    return Object.freeze({
      ITINERARY_FALLBACK_IMAGES,
      GOOGLE_PLACES_PHOTO_URL_MAX_AGE_MS,
      getFallbackItineraryImage,
      getItineraryImage,
      getHotelItineraryImage,
      buildFallbackImageFields,
      isGooglePlacesPhotoServiceUrl,
      isStaleGooglePlacesPhotoUrl,
      normalizeItineraryImageFields,
      extractPlacePhotoInfo,
      handleItineraryImageError,
      handleHotelItineraryImageError
    });
  };

  window.TravelPlaces = Object.freeze({
    ITINERARY_FALLBACK_IMAGES,
    GOOGLE_PLACES_PHOTO_URL_MAX_AGE_MS,
    createImageHelpers
  });
})(window);
