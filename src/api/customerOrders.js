import api from '../api.js';

export const getStockOrders = (params) =>
    api.get('/customer-orders/stock/list', { params });

export const updateStockOrderItemPick = (itemId, payload) =>
    api.patch(`/customer-orders/stock/items/${itemId}/pick`, payload);

export const dispatchStockOrder = (orderId) =>
    api.post(`/customer-orders/stock/orders/${orderId}/dispatch`);

export const getStockOrderPacking = (orderId) =>
    api.get(`/customer-orders/stock/orders/${orderId}/packing`);

export const createStockOrderPackage = (orderId, payload = {}) =>
    api.post(`/customer-orders/stock/orders/${orderId}/packages`, payload);

export const updateStockOrderPackageContents = (packageId, payload) =>
    api.put(`/customer-orders/stock/packages/${packageId}/contents`, payload);

export const sealStockOrderPackage = (packageId) =>
    api.post(`/customer-orders/stock/packages/${packageId}/seal`);

export const scanStockOrderPackage = (packageId, scanCode) =>
    api.post(`/customer-orders/stock/packages/${packageId}/scan`, {
        scan_code: scanCode,
    });

export const verifyStockOrderPackage = (packageId) =>
    api.post(`/customer-orders/stock/packages/${packageId}/verify`);

export const reopenStockOrderPackage = (packageId, reason) =>
    api.post(`/customer-orders/stock/packages/${packageId}/reopen`, { reason });

export const printStockOrderPackageLabel = (packageId, reason = null) =>
    api.post(`/customer-orders/stock/packages/${packageId}/label-print`, { reason });

export const deleteStockOrderPackage = (packageId) =>
    api.delete(`/customer-orders/stock/packages/${packageId}`);

export const syncCrossDockingStockOrders = () =>
    api.post('/customer-orders/stock/sync-cross-docking');

export const getCustomerOrders = (params) =>
    api.get('/customer-orders/', { params });

export const getCustomerOrder = (orderId) =>
    api.get(`/customer-orders/${orderId}`);

export const getCustomerOrderItemStats = (params) =>
    api.get('/customer-orders/item-stats', { params });

export const getCustomerOrderConfigs = (customerId) =>
    api.get('/customer-orders/configs', { params: { customer_id: customerId } });

export const getCustomerOrdersSummary = (params) =>
    api.get('/customer-orders/summary', { params });

export const getSupplierOrderDetail = (orderId) =>
    api.get(`/customer-orders/supplier/${orderId}`);

export const getSupplierOrders = (params) =>
    api.get('/customer-orders/supplier/list', { params });

export const getSupplierReceiptCandidates = (params) =>
    api.get('/customer-orders/supplier-receipts/candidates', { params });

export const getSupplierReceiptProviders = (params) =>
    api.get('/customer-orders/supplier-receipts/providers', { params });

export const processSupplierResponses = (params) =>
    api.post('/customer-orders/supplier/process-responses', null, { params });

export const createSupplierReceipt = (payload) =>
    api.post('/customer-orders/supplier-receipts', payload);

export const getSupplierReceipts = (params) =>
    api.get('/customer-orders/supplier-receipts/list', { params });

export const getSupplierReceipt = (receiptId) =>
    api.get(`/customer-orders/supplier-receipts/${receiptId}`);

export const getCrossDockingLabels = (receiptId) =>
    api.get(`/customer-orders/supplier-receipts/${receiptId}/cross-docking-labels`);

export const printCrossDockingLabels = (receiptId, payload) =>
    api.post(
        `/customer-orders/supplier-receipts/${receiptId}/cross-docking-labels/print`,
        payload
    );

export const updateCrossDockingDocument = (receiptId, payload) =>
    api.patch(
        `/customer-orders/supplier-receipts/${receiptId}/cross-docking-document`,
        payload
    );

export const postSupplierReceipt = (receiptId) =>
    api.post(`/customer-orders/supplier-receipts/${receiptId}/post`);

export const sendSupplierReceiptUpdEmail = (receiptId) =>
    api.post(`/customer-orders/supplier-receipts/${receiptId}/send-upd-email`);

export const unpostSupplierReceipt = (receiptId) =>
    api.post(`/customer-orders/supplier-receipts/${receiptId}/unpost`);

export const deleteSupplierReceipt = (receiptId) =>
    api.delete(`/customer-orders/supplier-receipts/${receiptId}`);

export const createManualSupplierReceipt = (payload) =>
    api.post('/customer-orders/supplier-receipts/manual', payload);

export const updateSupplierReceipt = (receiptId, payload) =>
    api.patch(`/customer-orders/supplier-receipts/${receiptId}`, payload);

export const addSupplierReceiptItems = (receiptId, items) =>
    api.post(`/customer-orders/supplier-receipts/${receiptId}/items`, items);

export const updateSupplierReceiptItem = (itemId, payload) =>
    api.patch(`/customer-orders/supplier-receipt-items/${itemId}`, payload);

export const deleteSupplierReceiptItem = (itemId) =>
    api.delete(`/customer-orders/supplier-receipt-items/${itemId}`);

export const createManualCustomerOrder = (payload) =>
    api.post('/customer-orders/manual', payload);

export const processManualCustomerOrder = (orderId) =>
    api.post(`/customer-orders/${orderId}/process-manual`);

export const retryCustomerOrder = (orderId) =>
    api.post(`/customer-orders/${orderId}/retry`);

export const processCustomerOrderConfigNow = (configId) =>
    api.post(`/customer-orders/configs/${configId}/process`);

export const retryCustomerOrderErrorsForConfig = (configId) =>
    api.post(`/customer-orders/configs/${configId}/retry-errors`);

export const forwardLatestCustomerOrderForConfig = (configId) =>
    api.post(`/customer-orders/configs/${configId}/forward-latest`);

export const createManualSupplierOrder = (payload) =>
    api.post('/customer-orders/supplier/manual', payload);

export const updateCustomerOrderItem = (itemId, payload) =>
    api.patch(`/customer-orders/items/${itemId}`, payload);

export const sendSupplierOrders = (orderIds) =>
    api.post('/customer-orders/supplier/send', orderIds);

export const sendScheduledSupplierOrders = () =>
    api.post('/customer-orders/supplier/send-scheduled');

export const reconcilePartsSoftOrders = () =>
    api.post('/integrations/partssoft/orders/reconcile', null, { params: { days: 7 } });
