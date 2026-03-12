import api from '../api.js';

export const getSupplierPriceTrends = (params = {}) =>
    api.get('/dashboard/supplier-price-trends', { params });
