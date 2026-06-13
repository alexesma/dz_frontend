import api from '../api.js';

export const getSupplierPriceTrends = (params = {}) =>
    api.get('/dashboard/supplier-price-trends', { params });

export const getInventoryControl = (params = {}) =>
    api.get('/dashboard/inventory-control', { params });
