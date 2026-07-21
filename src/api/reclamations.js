import api from '../api';

export const getReclamationsSummary = () =>
    api.get('/reclamations/summary');

export const getReclamationStats = (params = {}) =>
    api.get('/reclamations/stats', { params });

export const listReclamations = (params = {}) =>
    api.get('/reclamations', { params });

export const getReclamation = (id) =>
    api.get(`/reclamations/${id}`);

export const downloadReclamationAttachment = (id, attachmentId) =>
    api.get(`/reclamations/${id}/attachments/${attachmentId}/download`, {
        responseType: 'blob',
    });

export const createReclamation = (data) =>
    api.post('/reclamations', data);

export const syncReclamations = () =>
    api.post('/reclamations/sync', null, { timeout: 180000 });

export const assignReclamationCustomer = (id, data) =>
    api.post(`/reclamations/${id}/assign-customer`, data);

export const updateReclamation = (id, data) =>
    api.patch(`/reclamations/${id}`, data);

export const updateReclamationItem = (id, itemId, data) =>
    api.patch(`/reclamations/${id}/items/${itemId}`, data);

export const checkReclamation = (id) =>
    api.post(`/reclamations/${id}/check`);

export const refreshReclamationFroza = (id) =>
    api.post(`/reclamations/${id}/froza/refresh`);

export const sendReclamationFrozaDecision = (id, data) =>
    api.post(`/reclamations/${id}/froza/send-decision`, data);

export const getReclamationEmails = (id) =>
    api.get(`/reclamations/${id}/emails`);

export const getReplyTemplate = (id, kind) =>
    api.get(`/reclamations/${id}/reply-template`, { params: { kind } });

export const sendReclamationReply = (id, data) =>
    api.post(`/reclamations/${id}/reply`, data);

export const notifyReclamationSupplier = (id) =>
    api.post(`/reclamations/${id}/notify-supplier`);
