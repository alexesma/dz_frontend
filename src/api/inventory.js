import api from '../api';

// ── StockByLocation ───────────────────────────────────────────────────────────

export const getStockByLocation = (params = {}) =>
    api.get('/inventory/stock/', { params });

export const upsertStockByLocation = (data) =>
    api.put('/inventory/stock/', data);

export const deleteStockByLocation = (id, removeLink = true) =>
    api.delete(`/inventory/stock/${id}/`, { params: { remove_location_link: removeLink } });

// ── InventorySession ──────────────────────────────────────────────────────────

export const listInventorySessions = (params = {}) =>
    api.get('/inventory/sessions/', { params });

export const getInventorySession = (id) =>
    api.get(`/inventory/sessions/${id}/`);

export const startInventorySession = (data) =>
    api.post('/inventory/sessions/', data);

export const updateInventorySession = (id, data) =>
    api.patch(`/inventory/sessions/${id}/`, data);

export const countInventoryItem = (sessionId, itemId, data) =>
    api.patch(`/inventory/sessions/${sessionId}/items/${itemId}/`, data);

export const completeInventorySession = (id, applyAdjustments = true) =>
    api.post(`/inventory/sessions/${id}/complete/`, { apply_adjustments: applyAdjustments });

export const cancelInventorySession = (id) =>
    api.post(`/inventory/sessions/${id}/cancel/`);

// ── StockMovement ─────────────────────────────────────────────────────────────

export const listStockMovements = (params = {}) =>
    api.get('/inventory/movements/', { params });

export const createStockMovement = (data) =>
    api.post('/inventory/movements/', data);

// ── Transfer ──────────────────────────────────────────────────────────────────

export const transferAutopart = (data) =>
    api.post('/inventory/transfer/', data);
