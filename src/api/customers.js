import api from '../api.js';

// ===== Customers =====
export const getCustomers = (params) =>
    api.get('/customers/', { params });

export const getCustomerById = (customerId) =>
    api.get(`/customers/${customerId}/`);

export const createCustomer = (data) =>
    api.post('/customers/', data);

export const updateCustomer = (customerId, data) =>
    api.patch(`/customers/${customerId}/`, data);

export const deleteCustomer = (customerId) =>
    api.delete(`/customers/${customerId}/`);

// ===== Customer Pricelist Configs =====
export const getCustomerPricelistConfigs = (customerId) =>
    api.get(`/customers/${customerId}/pricelist-configs/`);

export const createCustomerPricelistConfig = (customerId, data) =>
    api.post(`/customers/${customerId}/pricelist-configs/`, data);

export const updateCustomerPricelistConfig = (customerId, configId, data) =>
    api.patch(`/customers/${customerId}/pricelist-configs/${configId}`, data);

export const deleteCustomerPricelistConfig = (customerId, configId) =>
    api.delete(`/customers/${customerId}/pricelist-configs/${configId}`);

// ===== Customer Pricelist Sources =====
export const getCustomerPricelistSources = (customerId, configId) =>
    api.get(`/customers/${customerId}/pricelist-configs/${configId}/sources/`);

export const createCustomerPricelistSource = (customerId, configId, data) =>
    api.post(`/customers/${customerId}/pricelist-configs/${configId}/sources/`, data);

export const updateCustomerPricelistSource = (customerId, configId, sourceId, data) =>
    api.patch(`/customers/${customerId}/pricelist-configs/${configId}/sources/${sourceId}`, data);

export const deleteCustomerPricelistSource = (customerId, configId, sourceId) =>
    api.delete(`/customers/${customerId}/pricelist-configs/${configId}/sources/${sourceId}`);

export const sendCustomerPricelistNow = (customerId, configId) =>
    api.post(`/customers/${customerId}/pricelist-configs/${configId}/send-now`);

// ===== Customer Pricelists =====
export const getCustomerPricelists = (customerId) =>
    api.get(`/customers/${customerId}/pricelists/`);

export const createCustomerPricelist = (customerId, data) =>
    api.post(`/customers/${customerId}/pricelists/`, data);

export const deleteCustomerPricelist = (customerId, pricelistId) =>
    api.delete(`/customers/${customerId}/pricelists/${pricelistId}`);

// ===== Customer Order Config =====
export const getCustomerOrderConfig = (customerId) =>
    api.get(`/customer-orders/config/${customerId}`);

export const createCustomerOrderConfig = (data) =>
    api.post('/customer-orders/config', data);

export const updateCustomerOrderConfig = (customerId, data) =>
    api.put(`/customer-orders/config/${customerId}`, data);
