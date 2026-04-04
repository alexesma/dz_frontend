import api from '../api.js';

export const getAutopartOffers = (oem, partial = false) =>
    api.get('/autoparts/offers/', { params: { oem, partial } });

export const getAutopartLookupByOem = (oem, limit = 50) =>
    api.get('/autoparts/lookup/', { params: { oem, limit } });

export const searchAutopartsByOem = (q, limit = 50) =>
    api.get('/autoparts/search/', { params: { q, limit } });

export const getDragonzapOffers = (oem, makeName, withoutCross = true) =>
    api.get('/order/get_offers_by_oem_and_make_name', {
        params: { oem, make_name: makeName, without_cross: withoutCross },
    });

export const sendDragonzapOrder = (items, customerId) =>
    api.post('/order/send_api', items, {
        params: { customer_id: customerId },
    });

export const clearDragonzapBasket = () =>
    api.post('/order/dragonzap/basket/clear');
