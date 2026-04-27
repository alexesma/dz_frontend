import api from '../api';

export const getStorageLocations = (skip = 0, limit = 200) =>
    api.get('/storage/', { params: { skip, limit } });

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
