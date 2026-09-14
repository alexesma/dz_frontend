import api from '../api.js';

export const getSupplierPriceTrends = (params = {}, config = {}) =>
    api.get('/dashboard/supplier-price-trends', { ...config, params });

export const getSupplierPricelistHealth = (config = {}) =>
    api.get('/dashboard/supplier-pricelist-health', config);

export const getInventoryControl = (params = {}, config = {}) =>
    api.get('/dashboard/inventory-control', { ...config, params });

export const getOrderDynamics = (params = {}, config = {}) =>
    api.get('/dashboard/order-dynamics', { ...config, params });

export const getOrderMargin = (params = {}, config = {}) =>
    api.get('/dashboard/order-margin', { ...config, params });

export const getSupplierReliability = (params = {}, config = {}) =>
    api.get('/dashboard/supplier-reliability', { ...config, params });
