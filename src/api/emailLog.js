import api from '../api.js';

export const getEmailLog = (params) => api.get('/email-log', { params });

export const retryEmail = (id) => api.post(`/email-log/${id}/retry`);
