import api from '../api.js';

export const getAutopartOffers = (oem) =>
    api.get('/autoparts/offers/', { params: { oem } });

export const getAutopartLookupByOem = (oem, limit = 50) =>
    api.get('/autoparts/lookup/', { params: { oem, limit } });

export const searchAutopartsByOem = (q, limit = 50) =>
    api.get('/autoparts/search/', { params: { q, limit } });

export const getDragonzapOffers = (oem, makeName, withoutCross = true) =>
    api.get('/order/get_offers_by_oem_and_make_name', {
        params: { oem, make_name: makeName, without_cross: withoutCross },
    });
