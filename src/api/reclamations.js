import api from '../api';

export const getReclamationsSummary = () =>
    api.get('/reclamations/summary');

export const listReclamations = (params = {}) =>
    api.get('/reclamations', { params });

export const getReclamation = (id) =>
    api.get(`/reclamations/${id}`);

export const createReclamation = (data) =>
    api.post('/reclamations', data);

export const syncReclamations = () =>
    api.post('/reclamations/sync', null, { timeout: 180000 });

export const assignReclamationCustomer = (id, data) =>
    api.post(`/reclamations/${id}/assign-customer`, data);
