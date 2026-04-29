import api from '../api';

export const getStorageLocations = (skipOrParams = 0, limit = 200) => {
    if (
        skipOrParams
        && typeof skipOrParams === 'object'
        && !Array.isArray(skipOrParams)
    ) {
        return api.get('/storage/', { params: skipOrParams });
    }
    return api.get('/storage/', { params: { skip: skipOrParams, limit } });
};

export const getStorageLocation = (id) =>
    api.get(`/storage/${id}/`);

export const createStorageLocation = (data) =>
    api.post('/storage/', data);

export const updateStorageLocation = (id, data) =>
    api.patch(`/storage/${id}/`, data);

export const deleteStorageLocation = (id) =>
    api.delete(`/storage/${id}/`);

export const getStorageAutoparts = (id) =>
    api.get(`/storage/${id}/autoparts/`);

export const createStoragesBulk = (items) =>
    api.post('/storage/bulk/', items);

export const getWarehouses = (params = {}) =>
    api.get('/warehouses/', { params });

export const getWarehouse = (id) =>
    api.get(`/warehouses/${id}/`);

export const createWarehouse = (data) =>
    api.post('/warehouses/', data);

export const updateWarehouse = (id, data) =>
    api.patch(`/warehouses/${id}/`, data);
