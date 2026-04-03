import api from '../api.js';

export const getOrderStatusMappingOptions = () =>
    api.get('/admin/order-status-mappings/options');

export const getOrderStatusMappings = (params) =>
    api.get('/admin/order-status-mappings', { params });

export const createOrderStatusMapping = (payload) =>
    api.post('/admin/order-status-mappings', payload);

export const updateOrderStatusMapping = (mappingId, payload) =>
    api.patch(`/admin/order-status-mappings/${mappingId}`, payload);

export const getUnmappedExternalStatuses = (params) =>
    api.get('/admin/order-status-mappings/unmapped', { params });
