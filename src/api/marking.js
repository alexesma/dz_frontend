import api from '../api';

export const getMarkingCodesSummary = () =>
    api.get('/inventory/marking-codes/summary');

export const listMarkingCodes = (params = {}) =>
    api.get('/inventory/marking-codes', { params });

export const getMarkingCodeMovements = (markingCodeId) =>
    api.get(`/inventory/marking-codes/${markingCodeId}/movements`);

export const listMarkingDiscrepancies = (params = {}) =>
    api.get('/inventory/marking-codes/discrepancies', { params });

export const getGisMtStatus = () =>
    api.get('/inventory/gis-mt/status');

export const setGisMtProductGroup = (productGroup) =>
    api.put('/inventory/gis-mt/product-group', null, {
        params: { product_group: productGroup },
    });

export const startGisMtAuth = () =>
    api.post('/inventory/gis-mt/auth/start', null, { timeout: 120000 });

export const checkGisMtCodes = (ids = null) =>
    api.post('/inventory/gis-mt/check', { ids }, { timeout: 300000 });

export const startGisMtWithdraw = (ids, action, documentNumber = null) =>
    api.post(
        '/inventory/gis-mt/withdraw/start',
        { ids, action, document_number: documentNumber },
        { timeout: 120000 }
    );

export const confirmGisMtTask = (taskId, code) =>
    api.post(`/diadoc/cloud-sign-tasks/${taskId}/confirm`, { code }, {
        timeout: 120000,
    });
