(function (window) {
  'use strict';

  const PLACE_DETAIL_FIELDS = Object.freeze([
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'types'
  ]);

  const getPlaceDetailFields = () => PLACE_DETAIL_FIELDS.slice();

  window.TravelPlaces = Object.freeze({
    PLACE_DETAIL_FIELDS,
    getPlaceDetailFields
  });
})(window);
