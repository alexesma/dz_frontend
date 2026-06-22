import api from '../api.js';

export const getSupplierPriceTrends = (params = {}) =>
    api.get('/dashboard/supplier-price-trends', { params });

export const getInventoryControl = (params = {}) =>
    api.get('/dashboard/inventory-control', { params });

export const getOrderDynamics = (params = {}) =>
    api.get('/dashboard/order-dynamics', { params });

export const getOrderMargin = (params = {}) =>
    api.get('/dashboard/order-margin', { params });

export const getSupplierReliability = (params = {}) =>
    api.get('/dashboard/supplier-reliability', { params });
