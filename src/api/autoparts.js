import api from '../api.js';

export const getAutopartOffers = (oem, partial = false) =>
    api.get('/autoparts/offers/', { params: { oem, partial } });

// Наличие в нашем прайсе по списку OEM (для сайтовых, непроверенных кроссов)
export const getOwnStockByOems = (oems) =>
    api.post('/autoparts/own-stock/by-oems/', { oems });

export const getAutopartLookupByOem = (oem, limit = 50) =>
    api.get('/autoparts/lookup/', { params: { oem, limit } });

export const searchAutopartsByOem = (q, limit = 50) =>
    api.get('/autoparts/search/', { params: { q, limit } });

export const getDragonzapOffers = (oem, makeName, withoutCross = true) =>
    api.get('/order/get_offers_by_oem_and_make_name', {
        params: { oem, make_name: makeName, without_cross: withoutCross },
        timeout: 300000,
    });

export const getDragonzapBrands = (oem) =>
    api.get('/order/get_brands_by_oem', {
        params: { oem },
        timeout: 120000,
    });

export const sendDragonzapOrder = (items, customerId, orderComment = null) =>
    api.post('/order/send_api', items, {
        params: { customer_id: customerId, order_comment: orderComment },
    });

export const clearDragonzapBasket = () =>
    api.post('/order/dragonzap/basket/clear');

// ── Nomenclature catalog ─────────────────────────────────────────────────────

export const getCatalog = (params = {}) =>
    api.get('/autoparts/catalog/', { params });

export const getAutopartDetail = (id) =>
    api.get(`/autoparts/${id}/detail/`);

export const updateAutopart = (id, data) =>
    api.patch(`/autoparts/${id}/update/`, data);

export const createAutopartCatalog = (data) =>
    api.post('/autoparts/', data);

// Cross-numbers
export const getAutopartCrosses = (id) =>
    api.get(`/autoparts/${id}/crosses/`);

export const addAutopartCross = (id, data) =>
    api.post(`/autoparts/${id}/crosses/`, data);

export const deleteAutopartCross = (crossId) =>
    api.delete(`/autoparts/crosses/${crossId}`);

export const getAutopartInvalidCrosses = (id) =>
    api.get(`/autoparts/${id}/invalid-crosses/`);

export const addAutopartInvalidCross = (id, data) =>
    api.post(`/autoparts/${id}/invalid-crosses/`, data);

// Storage locations list
export const getStorageLocations = () =>
    api.get('/autoparts/storage-locations/');

// Categories (global list)
export const getCategories = () =>
    api.get('/categories/');

// ── Честный знак ─────────────────────────────────────────────────────────────

export const getHonestSignCategories = () =>
    api.get('/honest-sign-categories/');

export const createHonestSignCategory = (data) =>
    api.post('/honest-sign-categories/', data);

export const assignHonestSignCategories = (autopartId, categoryIds) =>
    api.post(`/autoparts/${autopartId}/honest-sign-categories/`, categoryIds);

// ── Применимость ─────────────────────────────────────────────────────────────

export const getApplicabilityNodes = (parentId = null) =>
    api.get('/applicability-nodes/', { params: parentId !== null ? { parent_id: parentId } : {} });

export const getAllApplicabilityNodes = () =>
    api.get('/applicability-nodes/all/');

export const createApplicabilityNode = (data) =>
    api.post('/applicability-nodes/', data);

export const assignApplicabilityNodes = (autopartId, nodeIds) =>
    api.post(`/autoparts/${autopartId}/applicability-nodes/`, nodeIds);
