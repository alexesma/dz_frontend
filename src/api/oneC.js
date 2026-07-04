import api from '../api';

export const getOneCStatus = () =>
    api.get('/1c/status');

export const resetOneCExport = (params = {}) =>
    api.post('/1c/reset-export', null, { params });

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
