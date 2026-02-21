import api from '../api.js';

export const getStockOrders = (params) =>
    api.get('/customer-orders/stock/list', { params });

export const getSupplierOrders = (params) =>
    api.get('/customer-orders/supplier/list', { params });

export const sendSupplierOrders = (orderIds) =>
    api.post('/customer-orders/supplier/send', orderIds);

export const sendScheduledSupplierOrders = () =>
    api.post('/customer-orders/supplier/send-scheduled');
