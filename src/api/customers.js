// src/api/customers.js
import api from "../api.js";

/** ====== Клиенты ====== */
export const listCustomers = async (params = {}) => {
    // page, page_size, search
    return api.get(`/customers/`, { params });
};

export const getCustomerById = async (customerId) => {
    return api.get(`/customers/${customerId}/`);
};

export const getCustomerFullById = async (customerId) => {
    return api.get(`/customers/${customerId}/full`);
};

export const createCustomer = async (data) => {
    return api.post(`/customers/`, data);
};

export const updateCustomer = async (customerId, data) => {
    return api.patch(`/customers/${customerId}/`, data);
};

export const deleteCustomerApi = async (customerId) => {
    return api.delete(`/customers/${customerId}/`);
};

/** ====== Конфигурации прайс-листов клиента ====== */
export const fetchCustomerConfigs = async (customerId) => {
    return api.get(`/customers/${customerId}/pricelist-configs/`);
};

export const createCustomerConfig = async (customerId, data) => {
    return api.post(`/customers/${customerId}/pricelist-configs/`, data);
};

export const updateCustomerConfig = async (customerId, configId, data) => {
    return api.patch(`/customers/${customerId}/pricelist-configs/${configId}`, data);
};

export const deleteCustomerConfig = async (customerId, configId) => {
    return api.delete(`/customers/${customerId}/pricelist-configs/${configId}`);
};

/** ====== Прайс-листы клиента ====== */
// Генерация прайс-листа по выбранной конфигурации
export const generateCustomerPricelist = async (customerId, configId) => {
    return api.post(`/customers/${customerId}/pricelists/`, { config_id: configId });
};

// Если нужен явный список прайс-листов клиента (вдруг бэк это поддерживает отдельно)
export const listCustomerPricelists = async (customerId, params = {}) => {
    return api.get(`/customers/${customerId}/pricelists/`, { params });
};