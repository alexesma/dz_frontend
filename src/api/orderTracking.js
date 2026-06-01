import api from '../api.js';

export const getTrackingOrderItems = (params) =>
    api.get('/order/tracking-items', { params });

export const getTrackingOrderInsights = (params) =>
    api.get('/order/tracking-summary', { params });

export const getTrackingExceptionsQueue = (params) =>
    api.get('/order/tracking-exceptions-queue', { params });

export const getAutoPurchasePreview = (params) =>
    api.get('/order/autopurchase-preview', { params });

export const createAutoPurchaseRun = (params) =>
    api.post('/order/autopurchase-runs', null, { params });

export const listAutoPurchaseRuns = (params) =>
    api.get('/order/autopurchase-runs', { params });

export const getOrderDetail = (orderId) =>
    api.get(`/order/${orderId}`);

export const getOrderItems = (orderId) =>
    api.get(`/order/${orderId}/items`);

export const updateOrderStatus = (orderId, status) =>
    api.patch(`/order/${orderId}/status`, null, {
        params: { status },
    });

export const getAutoPurchaseRun = (runId) =>
    api.get(`/order/autopurchase-runs/${runId}`);

export const getAutoPurchaseRunItems = (runId, params) =>
    api.get(`/order/autopurchase-runs/${runId}/items`, { params });

export const updateAutoPurchaseRunItems = (runId, payload) =>
    api.patch(`/order/autopurchase-runs/${runId}/items`, payload);

export const updateAutoPurchaseRunItem = (runId, itemId, payload) =>
    api.patch(`/order/autopurchase-runs/${runId}/items/${itemId}`, payload);

export const getAutoPurchaseRunDraftOrders = (runId) =>
    api.get(`/order/autopurchase-runs/${runId}/draft-orders`);

export const markAutoPurchaseRunItemsSent = (runId, payload) =>
    api.post(`/order/autopurchase-runs/${runId}/mark-sent`, payload);

export const getAutoPurchaseRunItemAiExplanation = (runId, itemId) =>
    api.get(`/order/autopurchase-runs/${runId}/items/${itemId}/ai-explanation`);

export const getAutoPurchaseRunDraftGroupAiExplanation = (runId, supplierKey) =>
    api.get(`/order/autopurchase-runs/${runId}/draft-group-ai`, {
        params: { supplier_key: supplierKey },
    });

export const updateTrackingOrderItem = (sourceType, itemId, payload) =>
    api.patch(`/order/tracking-items/${sourceType}/${itemId}`, payload);
