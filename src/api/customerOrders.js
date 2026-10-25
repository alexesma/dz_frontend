import api from '../api.js';

export const getStockOrders = (params) =>
    api.get('/customer-orders/stock/list', { params });

export const getCustomerAssembly = (params = {}) =>
    api.get('/customer-orders/assembly', { params });

export const approveExactStockSwitch = (itemId) =>
    api.post(`/customer-orders/assembly/source-switch/${itemId}/approve`);

export const keepCrossSource = (itemId) =>
    api.post(`/customer-orders/assembly/source-switch/${itemId}/keep-cross`);

export const printOwnStockLabels = (stockItemIds, storageLocationId = null) =>
    api.post('/customer-orders/assembly/own-labels/print', {
        stock_item_ids: stockItemIds,
        storage_location_id: storageLocationId,
    });

export const getOwnStockLabels = (stockItemId) =>
    api.get('/customer-orders/assembly/own-labels', { params: { stock_item_id: stockItemId } });

export const reprintOwnStockLabel = (labelId) =>
    api.post(`/customer-orders/assembly/own-labels/${labelId}/reprint`);

export const cancelOwnStockLabel = (labelId) =>
    api.post(`/customer-orders/assembly/own-labels/${labelId}/cancel`);

export const createAssemblyRealization = (orderIds) =>
    api.post('/customer-orders/assembly/realizations', { order_ids: orderIds });

export const listAssemblyBoxes = (documentId) =>
    api.get(`/customer-orders/assembly/realizations/${documentId}/boxes`);

export const createAssemblyBox = (documentId) =>
    api.post(`/customer-orders/assembly/realizations/${documentId}/boxes`);

export const updateAssemblyBox = (documentId, boxId, items) =>
    api.put(`/customer-orders/assembly/realizations/${documentId}/boxes/${boxId}`, { items });

export const sealAssemblyBox = (documentId, boxId) =>
    api.post(`/customer-orders/assembly/realizations/${documentId}/boxes/${boxId}/seal`);

export const openAssemblyBox = (documentId, boxId) =>
    api.post(`/customer-orders/assembly/realizations/${documentId}/boxes/${boxId}/open`);

export const deleteAssemblyBox = (documentId, boxId) =>
    api.delete(`/customer-orders/assembly/realizations/${documentId}/boxes/${boxId}`);

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

export const syncCrossDockingStockOrders = (receiptId = null) =>
    api.post('/customer-orders/stock/sync-cross-docking', null, {
        params: receiptId == null ? undefined : { receipt_id: receiptId },
    });

export const getCustomerOrders = (params) =>
    api.get('/customer-orders/', { params });

export const getCustomerOrder = (orderId) =>
    api.get(`/customer-orders/${orderId}`);

export const updateCustomerOrder = (orderId, payload) =>
    api.patch(`/customer-orders/${orderId}`, payload);

export const deleteCustomerOrder = (orderId) =>
    api.delete(`/customer-orders/${orderId}`);

export const getCustomerOrderItemStats = (params) =>
    api.get('/customer-orders/item-stats', { params });

export const getCustomerOrderConfigs = (customerId) =>
    api.get('/customer-orders/configs', { params: { customer_id: customerId } });

export const getCustomerOrdersSummary = (params) =>
    api.get('/customer-orders/summary', { params });

export const getCustomerOrdersSummaryPage = (params) =>
    api.get('/customer-orders/summary-page', { params });

export const getCustomerOrdersCount = (params) =>
    api.get('/customer-orders/count', { params });

export const getCustomerOrderOemSuggestions = (q) =>
    api.get('/customer-orders/oem-suggestions', { params: { q } });

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

export const getSupplierReceiptCorrections = (params) =>
    api.get('/customer-orders/supplier-receipts/corrections/list', { params });

export const getSupplierReceiptCorrectionOptions = (params) =>
    api.get('/customer-orders/supplier-receipts/corrections/receipt-options', { params });

export const createSupplierReceiptCorrection = (payload) =>
    api.post('/customer-orders/supplier-receipts/corrections', payload);

export const updateSupplierReceiptCorrection = (correctionId, payload) =>
    api.put(`/customer-orders/supplier-receipts/corrections/${correctionId}`, payload);

export const postSupplierReceiptCorrection = (correctionId) =>
    api.post(`/customer-orders/supplier-receipts/corrections/${correctionId}/post`);

export const downloadSupplierReceiptCorrectionAttachment = (correctionId, attachmentId) =>
    api.get(`/customer-orders/supplier-receipts/corrections/${correctionId}/attachments/${attachmentId}`, { responseType: 'blob' });

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

export const processPartsSoftOrderLocally = (orderId) =>
    api.post(`/customer-orders/${orderId}/process-partssoft-locally`);

export const retryCustomerOrder = (orderId) =>
    api.post(`/customer-orders/${orderId}/retry`);

export const selectCustomerOrderPricelist = (orderId, orderConfigId) =>
    api.post(`/customer-orders/${orderId}/pricelist-routing`, {
        order_config_id: orderConfigId,
    });

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

export const recheckCustomerOrderItemOffer = (itemId) =>
    api.post(`/customer-orders/items/${itemId}/recheck-offer`);

export const getCustomerOrderPriceOverridePreview = (itemId) =>
    api.get(`/customer-orders/items/${itemId}/price-override-preview`);

export const forceCustomerOrderPriceOverride = (itemId) =>
    api.post(`/customer-orders/items/${itemId}/force-price-override`);

export const sendSupplierOrders = (orderIds) =>
    api.post('/customer-orders/supplier/send', orderIds);

export const sendScheduledSupplierOrders = () =>
    api.post('/customer-orders/supplier/send-scheduled');

export const reconcilePartsSoftOrders = () =>
    api.post('/integrations/partssoft/orders/reconcile', null, { params: { days: 7 } });

export const getCachedPartsSoftOrders = () =>
    api.get('/integrations/partssoft/orders/reconcile', { params: { days: 7 } });

export const getPartsSoftCustomerCandidates = (params) =>
    api.get('/integrations/partssoft/customers/candidates', { params });

export const linkPartsSoftCustomer = (externalCustomerId, localCustomerId, mergeExistingCustomer = false) =>
    api.post(`/integrations/partssoft/customers/${externalCustomerId}/link`, {
        local_customer_id: localCustomerId,
        merge_existing_customer: mergeExistingCustomer,
    });

export const getPartsSoftProductSyncStatus = () =>
    api.get('/integrations/partssoft/products/status');

export const syncPartsSoftProducts = () =>
    api.post('/integrations/partssoft/products/sync', null, { timeout: 120000 });

export const getPartsSoftSupplierSyncStatus = () =>
    api.get('/integrations/partssoft/suppliers/status');

export const syncPartsSoftSuppliers = () =>
    api.post('/integrations/partssoft/suppliers/sync', null, { timeout: 120000 });

export const getPartsSoftProductOutboxStatus = () =>
    api.get('/integrations/partssoft/products/outbox/status');

export const processPartsSoftProductOutbox = (limit = 25) =>
    api.post('/integrations/partssoft/products/outbox/process', null, {
        params: { limit },
        timeout: 120000,
    });

export const enqueueAllPartsSoftProducts = () =>
    api.post('/integrations/partssoft/products/outbox/enqueue-all');

export const getPartsSoftDocumentSyncStatus = () =>
    api.get('/integrations/partssoft/documents/status');

export const getPartsSoftDocuments = (params = {}) =>
    api.get('/integrations/partssoft/documents', { params });

export const syncPartsSoftDocuments = (days = 30) =>
    api.post('/integrations/partssoft/documents/sync', null, {
        params: { days },
        timeout: 120000,
    });
