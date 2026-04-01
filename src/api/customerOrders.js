import api from '../api.js';

export const getStockOrders = (params) =>
    api.get('/customer-orders/stock/list', { params });

export const getCustomerOrders = (params) =>
    api.get('/customer-orders', { params });

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

export const createManualSupplierOrder = (payload) =>
    api.post('/customer-orders/supplier/manual', payload);

export const updateCustomerOrderItem = (itemId, payload) =>
    api.patch(`/customer-orders/items/${itemId}`, payload);

export const sendSupplierOrders = (orderIds) =>
    api.post('/customer-orders/supplier/send', orderIds);

export const sendScheduledSupplierOrders = () =>
    api.post('/customer-orders/supplier/send-scheduled');
