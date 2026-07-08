(function (window) {
  'use strict';

  const normalizeHotelRecord = (item) => ({
    ...item,
    start_day: item?.start_day ? parseInt(item.start_day, 10) || 1 : 1,
    end_day: item?.end_day ? parseInt(item.end_day, 10) || 1 : 1,
    lat: item?.lat !== '' && item?.lat != null ? Number(item.lat) : null,
    lng: item?.lng !== '' && item?.lng != null ? Number(item.lng) : null,
    name: String(item?.name || '').trim(),
    address: String(item?.address || '').trim(),
    place_id: String(item?.place_id || '').trim()
  });

  const isHotelActiveOnDay = (hotel, day) => {
    const d = parseInt(day, 10) || 1;
    const start = parseInt(hotel?.start_day, 10) || 1;
    const end = parseInt(hotel?.end_day, 10) || start;
    return d >= Math.min(start, end) && d <= Math.max(start, end);
  };

  const hotelDayRangeLabel = (hotel) => {
    const start = parseInt(hotel?.start_day, 10) || 1;
    const end = parseInt(hotel?.end_day, 10) || start;
    return start === end ? `Day ${start}` : `Day ${Math.min(start, end)} ~ Day ${Math.max(start, end)}`;
  };

  const hasHotelOverlap = (hotelList, startDay, endDay, exceptId = '') => {
    const list = Array.isArray(hotelList) ? hotelList : [];
    const s = Math.min(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);
    const e = Math.max(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);

    return list.some((hotel) => {
      if (exceptId && String(hotel.id) === String(exceptId)) return false;
      const hs = Math.min(parseInt(hotel.start_day, 10) || 1, parseInt(hotel.end_day, 10) || 1);
      const he = Math.max(parseInt(hotel.start_day, 10) || 1, parseInt(hotel.end_day, 10) || 1);
      return s <= he && e >= hs;
    });
  };

  window.TravelHotels = Object.freeze({
    normalizeHotelRecord,
    isHotelActiveOnDay,
    hotelDayRangeLabel,
    hasHotelOverlap
  });
})(window);
