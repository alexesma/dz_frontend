import api from '../api.js';

export const listPriceControlConfigs = (params = {}) =>
    api.get('/price-control/configs', { params });

export const listPriceControlSiteApiKeys = () =>
    api.get('/price-control/site-api-keys');

export const getPriceControlConfig = (configId) =>
    api.get(`/price-control/configs/${configId}`);

export const createPriceControlConfig = (data) =>
    api.post('/price-control/configs', data);

export const updatePriceControlConfig = (configId, data) =>
    api.patch(`/price-control/configs/${configId}`, data);

export const listPriceControlRuns = (configId, params = {}) =>
    api.get(`/price-control/configs/${configId}/runs`, { params });

export const runPriceControlNow = (configId) =>
    api.post(`/price-control/configs/${configId}/run`);

export const resetPriceControlHistory = (configId) =>
    api.post(`/price-control/configs/${configId}/reset-history`);

export const listPriceControlRecommendations = (runId) =>
    api.get(`/price-control/runs/${runId}/recommendations`);

export const listPriceControlSourceRecommendations = (runId) =>
    api.get(`/price-control/runs/${runId}/source-recommendations`);

export const getPriceControlSourceDiagnostics = (runId) =>
    api.get(`/price-control/runs/${runId}/source-diagnostics`);

export const applyPriceControlRecommendations = (runId, data) =>
    api.post(`/price-control/runs/${runId}/apply`, data);

export const applyPriceControlSourceRecommendations = (runId, data) =>
    api.post(`/price-control/runs/${runId}/apply-sources`, data);
