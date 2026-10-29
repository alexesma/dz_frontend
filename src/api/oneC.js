import api from '../api';

export const getOneCStatus = () =>
    api.get('/1c/status');

export const getOneCEnterpriseDataStatus = () =>
    api.get('/1c/enterprise-data/status');

export const getOneCEnterpriseAutoStatus = () =>
    api.get('/1c/enterprise-data/auto');

export const updateOneCEnterpriseAuto = (data) =>
    api.put('/1c/enterprise-data/auto', data);

export const dispatchOneCEnterpriseNext = () =>
    api.post('/1c/enterprise-data/dispatch-next');

export const retryOneCEnterpriseEvent = (eventId) =>
    api.post(`/1c/enterprise-data/retry/${eventId}`);

export const getOneCEnterpriseHistoryAudit = () =>
    api.get('/1c/enterprise-data/history/audit');

export const backfillOneCEnterpriseHistory = (limit = 50) =>
    api.post('/1c/enterprise-data/history/backfill', null, { params: { limit } });

export const sendOneCEnterpriseDataEvent = (eventId) =>
    api.post(`/1c/enterprise-data/send/${eventId}`);

export const prepareOneCEnterpriseReceipt = (receiptId) =>
    api.post(`/1c/enterprise-data/prepare-receipt/${receiptId}`);

export const downloadOneCIncoming = async (filename) => {
    const response = await api.get(
        `/1c/enterprise-data/incoming/${encodeURIComponent(filename)}`,
        { responseType: 'blob', timeout: 300000 },
    );
    downloadBlob(response.data, filename);
};

export const resetOneCExport = (params = {}) =>
    api.post('/1c/reset-export', null, { params });

export const getOneCEvents = (params = {}) =>
    api.get('/1c/events', { params });

export const getOneCBatches = (params = {}) =>
    api.get('/1c/batches', { params });

export const retryOneCEvent = (eventId) =>
    api.post(`/1c/events/${eventId}/retry`);

const downloadBlob = (data, filename) => {
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const downloadOneCExport = async (path, filename, params = {}) => {
    const response = await api.get(`/1c/export/${path}`, {
        params,
        responseType: 'blob',
        timeout: 300000,
    });
    downloadBlob(response.data, filename);
};

export const getSalesHistorySummary = () =>
    api.get('/1c/sales-history/summary');

export const importSalesHistory = (formData) =>
    api.post('/1c/sales-history/import', formData, { timeout: 600000 });
