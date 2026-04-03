import api from '../api.js';

export const getTrackingOrderItems = (params) =>
    api.get('/order/tracking-items', { params });

export const updateTrackingOrderItem = (sourceType, itemId, payload) =>
    api.patch(`/order/tracking-items/${sourceType}/${itemId}`, payload);
