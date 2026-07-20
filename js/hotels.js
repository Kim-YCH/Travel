(function (window) {
  'use strict';

  const dayRange = (hotel) => {
    const start = parseInt(hotel?.start_day, 10) || 1;
    const end = parseInt(hotel?.end_day, 10) || start;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  };

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
    const { start, end } = dayRange(hotel);
    return d >= start && d <= end;
  };

  const hotelDayRangeLabel = (hotel) => {
    const { start, end } = dayRange(hotel);
    return start === end ? `Day ${start}` : `Day ${start} ~ Day ${end}`;
  };

  // list 由呼叫端傳入，模組本身不持有旅館狀態。
  const hasHotelOverlap = (list, startDay, endDay, exceptId = '') => {
    const s = Math.min(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);
    const e = Math.max(parseInt(startDay, 10) || 1, parseInt(endDay, 10) || 1);
    return (list || []).some((h) => {
      if (exceptId && String(h.id) === String(exceptId)) return false;
      const { start: hs, end: he } = dayRange(h);
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
