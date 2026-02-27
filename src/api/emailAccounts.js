import api from '../api.js';

export const getEmailAccounts = () => api.get('/email-accounts/');
export const createEmailAccount = (data) => api.post('/email-accounts/', data);
export const updateEmailAccount = (id, data) => api.patch(`/email-accounts/${id}`, data);
export const deleteEmailAccount = (id) => api.delete(`/email-accounts/${id}`);
export const testEmailAccount = (id, data) =>
    api.post(`/email-accounts/${id}/test`, data);
