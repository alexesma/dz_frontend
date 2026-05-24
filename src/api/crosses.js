import api from '../api.js';

export const listCrosses = (params = {}) =>
    api.get('/crosses/', { params });

export const listCrossGroups = (params = {}) =>
    api.get('/crosses/groups/', { params });

export const createCross = (data) =>
    api.post('/crosses/', data);

export const updateCross = (id, data) =>
    api.put(`/crosses/${id}`, data);

export const deleteCross = (id) =>
    api.delete(`/crosses/${id}`);

export const listInvalidCrosses = (params = {}) =>
    api.get('/invalid-crosses/', { params });

export const createInvalidCross = (data) =>
    api.post('/invalid-crosses/', data);

export const updateInvalidCross = (id, data) =>
    api.put(`/invalid-crosses/${id}`, data);

export const deleteInvalidCross = (id) =>
    api.delete(`/invalid-crosses/${id}`);
