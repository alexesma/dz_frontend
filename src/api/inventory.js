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

// ── StockLots ─────────────────────────────────────────────────────────────────

export const listStockLots = (params = {}) =>
    api.get('/inventory/lots', { params });

export const getStockLot = (id) =>
    api.get(`/inventory/lots/${id}`);

export const getAutopartLots = (autopartId, params = {}) =>
    api.get(`/inventory/autoparts/${autopartId}/lots`, { params });

// ── StockDocument ─────────────────────────────────────────────────────────────

export const listStockDocuments = (params = {}) =>
    api.get('/inventory/documents/', { params });

export const getStockDocument = (id) =>
    api.get(`/inventory/documents/${id}`);

export const createStockDocument = (data) =>
    api.post('/inventory/documents/', data);

export const updateStockDocument = (id, data) =>
    api.patch(`/inventory/documents/${id}`, data);

export const deleteStockDocument = (id) =>
    api.delete(`/inventory/documents/${id}`);

export const postStockDocument = (id) =>
    api.post(`/inventory/documents/${id}/post`);

export const unpostStockDocument = (id) =>
    api.post(`/inventory/documents/${id}/unpost`);

export const addDocumentItem = (docId, data) =>
    api.post(`/inventory/documents/${docId}/items`, data);

export const updateDocumentItem = (docId, itemId, data) =>
    api.patch(`/inventory/documents/${docId}/items/${itemId}`, data);

export const deleteDocumentItem = (docId, itemId) =>
    api.delete(`/inventory/documents/${docId}/items/${itemId}`);

// ── Backfill ──────────────────────────────────────────────────────────────────

export const runBackfillLots = () =>
    api.post('/inventory/admin/backfill-lots');

// ── StockMovement (extended) ──────────────────────────────────────────────────

export const getStockMovement = (id) =>
    api.get(`/inventory/movements/${id}/`);

export const exportMovements = (params = {}) =>
    api.get('/inventory/movements/export/', { params });

export const syncMovement = (id, data) =>
    api.patch(`/inventory/movements/${id}/sync/`, data);

export const bulkSyncMovements = (data) =>
    api.post('/inventory/movements/bulk-sync/', data);

// ── StockReserve ──────────────────────────────────────────────────────────────

export const listReserves = (params = {}) =>
    api.get('/inventory/reserves/', { params });

export const createReserve = (data) =>
    api.post('/inventory/reserves/', data);

export const getReserve = (id) =>
    api.get(`/inventory/reserves/${id}/`);

export const cancelReserve = (id) =>
    api.delete(`/inventory/reserves/${id}/`);

export const bulkCancelReserves = (data) =>
    api.post('/inventory/reserves/bulk-cancel/', data);

export const getAvailableStock = (params = {}) =>
    api.get('/inventory/available/', { params });

// ── ShipmentDocument ──────────────────────────────────────────────────────────

export const listShipments = (params = {}) =>
    api.get('/inventory/shipments/', { params });

export const createShipment = (data) =>
    api.post('/inventory/shipments/', data);

export const getShipment = (id) =>
    api.get(`/inventory/shipments/${id}/`);

export const updateShipment = (id, data) =>
    api.patch(`/inventory/shipments/${id}/`, data);

export const deleteShipment = (id) =>
    api.delete(`/inventory/shipments/${id}/`);

export const addShipmentItem = (shipmentId, data) =>
    api.post(`/inventory/shipments/${shipmentId}/items/`, data);

export const updateShipmentItem = (shipmentId, itemId, data) =>
    api.patch(`/inventory/shipments/${shipmentId}/items/${itemId}/`, data);

export const deleteShipmentItem = (shipmentId, itemId) =>
    api.delete(`/inventory/shipments/${shipmentId}/items/${itemId}/`);

export const postShipment = (id) =>
    api.post(`/inventory/shipments/${id}/post/`);

export const unpostShipment = (id) =>
    api.post(`/inventory/shipments/${id}/unpost/`);

// ── Returns ───────────────────────────────────────────────────────────────────

export const listCustomerReturns = (params = {}) =>
    api.get('/inventory/customer-returns/', { params });

export const getCustomerReturn = (id) =>
    api.get(`/inventory/customer-returns/${id}/`);

export const createCustomerReturn = (data) =>
    api.post('/inventory/customer-returns/', data);

export const updateCustomerReturn = (id, data) =>
    api.patch(`/inventory/customer-returns/${id}/`, data);

export const deleteCustomerReturn = (id) =>
    api.delete(`/inventory/customer-returns/${id}/`);

export const addCustomerReturnItem = (id, data) =>
    api.post(`/inventory/customer-returns/${id}/items/`, data);

export const updateCustomerReturnItem = (docId, itemId, data) =>
    api.patch(`/inventory/customer-returns/${docId}/items/${itemId}/`, data);

export const deleteCustomerReturnItem = (docId, itemId) =>
    api.delete(`/inventory/customer-returns/${docId}/items/${itemId}/`);

export const approveCustomerReturn = (id) =>
    api.post(`/inventory/customer-returns/${id}/approve/`);

export const shipCustomerReturn = (id) =>
    api.post(`/inventory/customer-returns/${id}/ship/`);

export const confirmCustomerReturn = (id) =>
    api.post(`/inventory/customer-returns/${id}/confirm/`);

export const rejectCustomerReturn = (id) =>
    api.post(`/inventory/customer-returns/${id}/reject/`);

export const listSupplierReturns = (params = {}) =>
    api.get('/inventory/supplier-returns/', { params });

export const getSupplierReturn = (id) =>
    api.get(`/inventory/supplier-returns/${id}/`);

export const createSupplierReturn = (data) =>
    api.post('/inventory/supplier-returns/', data);

export const updateSupplierReturn = (id, data) =>
    api.patch(`/inventory/supplier-returns/${id}/`, data);

export const deleteSupplierReturn = (id) =>
    api.delete(`/inventory/supplier-returns/${id}/`);

export const addSupplierReturnItem = (id, data) =>
    api.post(`/inventory/supplier-returns/${id}/items/`, data);

export const updateSupplierReturnItem = (docId, itemId, data) =>
    api.patch(`/inventory/supplier-returns/${docId}/items/${itemId}/`, data);

export const deleteSupplierReturnItem = (docId, itemId) =>
    api.delete(`/inventory/supplier-returns/${docId}/items/${itemId}/`);

export const approveSupplierReturn = (id) =>
    api.post(`/inventory/supplier-returns/${id}/approve/`);

export const shipSupplierReturn = (id) =>
    api.post(`/inventory/supplier-returns/${id}/ship/`);

export const confirmSupplierReturn = (id) =>
    api.post(`/inventory/supplier-returns/${id}/confirm/`);

export const rejectSupplierReturn = (id) =>
    api.post(`/inventory/supplier-returns/${id}/reject/`);

// ── ShipmentDocument 1С sync ──────────────────────────────────────────────────

export const exportShipments = (params = {}) =>
    api.get('/inventory/shipments/export/', { params });

export const syncShipment = (id, data) =>
    api.patch(`/inventory/shipments/${id}/sync/`, data);

export const bulkSyncShipments = (data) =>
    api.post('/inventory/shipments/bulk-sync/', data);

// ── StockDocument 1С sync ─────────────────────────────────────────────────────

export const exportDocuments1c = (params = {}) =>
    api.get('/inventory/documents/export-1c/', { params });

export const syncDocument = (id, data) =>
    api.patch(`/inventory/documents/${id}/sync/`, data);

export const bulkSyncDocuments = (data) =>
    api.post('/inventory/documents/bulk-sync-1c/', data);
