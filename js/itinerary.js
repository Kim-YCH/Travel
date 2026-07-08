(function (window) {
  'use strict';

  const fallbackImages = Object.freeze({
    sightseeing: './assets/default-sightseeing.svg',
    food: './assets/default-food.svg',
    shopping: './assets/default-shopping.svg',
    hotel: './assets/default-hotel.svg',
    transport: './assets/default-transport.svg',
    activity: './assets/default-travel.svg',
    other: './assets/default-travel.svg',
    default: './assets/default-travel.svg'
  });

  const normalizeOrderValue = (value) => {
    if (value === '' || value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const normalizeAlternativeFlag = (value) => {
    return String(value || '').trim().toLowerCase() === 'v' ? 'v' : '';
  };

  const getImageUrl = (item = {}) => String(
    item?.image_url ||
    item?.imageUrl ||
    item?.photo_url ||
    item?.photoUrl ||
    item?.place_photo_url ||
    ''
  ).trim();

  const getAlternativeFlag = (item) => normalizeAlternativeFlag(
    item?.is_alternative ?? item?.['是否為備案']
  );

  const isAlternativeItem = (item) => getAlternativeFlag(item) === 'v';

  const create = ({ itineraryTypes = [] } = {}) => {
    const normalizeItineraryType = (value) => {
      const type = String(value || '').trim();
      if (!type) return '景點';

      const aliases = {
        餐廳: '美食',
        小吃: '美食',
        咖啡: '美食',
        咖啡廳: '美食',
        飲食: '美食',
        美食店: '美食',
        商店: '購物',
        門票: '活動',
        交通: '其他',
        飯店: '其他',
        住宿: '其他',
        酒店: '其他'
      };

      return itineraryTypes.includes(type) ? type : (aliases[type] || '其他');
    };

    const getItineraryType = (item) => normalizeItineraryType(
      item?.type || item?.category || item?.place_type
    );

    const getItineraryTypeTone = (item) => {
      const type = getItineraryType(item);
      if (type === '美食') return 'food';
      if (type === '購物') return 'shopping';
      if (type === '活動') return 'activity';
      if (type === '其他') return 'other';
      return 'sightseeing';
    };

    const getItineraryIcon = (item) => {
      const tone = getItineraryTypeTone(item);
      if (tone === 'food') return '🍽️';
      if (tone === 'shopping') return '🛍️';
      if (tone === 'activity') return '🎟️';
      if (tone === 'other') return '📌';
      return '📍';
    };

    const getFallbackItineraryImage = (item = {}) => {
      const tone = item?._fallbackTone || getItineraryTypeTone(item);
      return fallbackImages[tone] || fallbackImages.default;
    };

    const getItineraryImage = (item = {}) => {
      const url = getImageUrl(item);
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

    const normalizeItineraryRecord = (item) => ({
      ...item,
      day: item?.day ? parseInt(item.day, 10) || 1 : 1,
      order: normalizeOrderValue(item?.order),
      type: getItineraryType(item),
      image_url: getImageUrl(item),
      image_source: String(item?.image_source || '').trim(),
      photo_attributions: String(item?.photo_attributions || '').trim(),
      image_updated_at: String(item?.image_updated_at || '').trim(),
      is_alternative: getAlternativeFlag(item)
    });

    const normalizeAlternativeRecord = (item) => ({
      ...item,
      day: item?.day ? parseInt(item.day, 10) || 1 : 1,
      lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
      lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
      name: String(item?.name || '').trim(),
      type: getItineraryType(item),
      address: String(item?.address || '').trim(),
      place_id: String(item?.place_id || '').trim(),
      image_url: getImageUrl(item),
      image_source: String(item?.image_source || '').trim(),
      photo_attributions: String(item?.photo_attributions || '').trim(),
      image_updated_at: String(item?.image_updated_at || '').trim(),
      message: String(item?.message || '')
    });

    return Object.freeze({
      fallbackImages,
      normalizeOrderValue,
      normalizeAlternativeFlag,
      getAlternativeFlag,
      isAlternativeItem,
      getImageUrl,
      normalizeItineraryType,
      getItineraryType,
      getItineraryTypeTone,
      getItineraryIcon,
      getFallbackItineraryImage,
      getItineraryImage,
      getHotelItineraryImage,
      buildFallbackImageFields,
      normalizeItineraryRecord,
      normalizeAlternativeRecord
    });
  };

  window.TravelItinerary = Object.freeze({
    fallbackImages,
    normalizeOrderValue,
    normalizeAlternativeFlag,
    getAlternativeFlag,
    isAlternativeItem,
    getImageUrl,
    create
  });
})(window);
