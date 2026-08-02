import api from '../api';

export const getReclamationsSummary = () =>
    api.get('/reclamations/summary');

export const getReclamationStats = (params = {}) =>
    api.get('/reclamations/stats', { params });

export const listReclamations = (params = {}) =>
    api.get('/reclamations', { params });

export const listReclamationAssignees = () =>
    api.get('/reclamations/assignees');

export const getReclamation = (id) =>
    api.get(`/reclamations/${id}`);

export const getReclamationUkdDraft = (id) =>
    api.get(`/reclamations/${id}/ukd-draft`);

export const rematchReclamationUkdDraft = (id) =>
    api.post(`/reclamations/${id}/ukd-draft/rematch`);

export const linkReclamationUkdDraftSource = (id, data) =>
    api.post(`/reclamations/${id}/ukd-draft/link-source`, data);

export const decideReclamationUkdDraft = (id, data) =>
    api.post(`/reclamations/${id}/ukd-draft/decision`, data);

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

export const assignShortageReviewer = (id, data) =>
    api.post(`/reclamations/${id}/shortage/assign`, data);

export const confirmReclamationShortage = (id, data) =>
    api.post(`/reclamations/${id}/shortage/confirm`, data);

export const postponeReclamationShortage = (id, data) =>
    api.post(`/reclamations/${id}/shortage/postpone`, data);

export const uploadReclamationShortageEvidence = (id, files) => {
    const formData = new FormData();
    files.forEach((file) => {
        formData.append('files', file.originFileObj || file);
    });
    return api.post(`/reclamations/${id}/shortage/evidence`, formData, {
        timeout: 180000,
    });
};

export const refreshReclamationFroza = (id) =>
    api.post(`/reclamations/${id}/froza/refresh`);

export const sendReclamationFrozaDecision = (id, data) =>
    api.post(`/reclamations/${id}/froza/send-decision`, data);

export const syncReclamationArmtek = () =>
    api.post('/reclamations/armtek/sync', null, { timeout: 180000 });

export const refreshReclamationArmtek = (id) =>
    api.post(`/reclamations/${id}/armtek/refresh`);

export const sendReclamationArmtekDecision = (id, data) =>
    api.post(`/reclamations/${id}/armtek/send-decision`, data);

export const getReclamationEmails = (id) =>
    api.get(`/reclamations/${id}/emails`);

export const getReplyTemplate = (id, kind, resolutionComment = null) =>
    api.get(`/reclamations/${id}/reply-template`, {
        params: {
            kind,
            resolution_comment: resolutionComment || undefined,
        },
    });

export const sendReclamationReply = (id, data) =>
    api.post(`/reclamations/${id}/reply`, data);

export const applyAndSendReclamationReply = (id, data) =>
    api.post(`/reclamations/${id}/apply-and-reply`, data);

export const notifyReclamationSupplier = (id) =>
    api.post(`/reclamations/${id}/notify-supplier`);
