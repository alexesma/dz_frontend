import api from '../api.js';

export const getBrands = () => api.get('/brand/');

export const lookupBrands = (q = '', limit = 100) =>
    api.get('/brand/lookup/', { params: { q, limit } });

export const createBrand = (payload) => api.post('/brand/', payload);

export const updateBrand = (brandId, payload) =>
    api.patch(`/brand/${brandId}`, payload);

export const addBrandSynonyms = (brandId, names) =>
    api.post(`/brand/${brandId}/synonyms/`, { names });

export const removeBrandSynonyms = (brandId, names) =>
    api.delete(`/brand/${brandId}/synonyms`, {
        data: { names },
    });

export const getMissingBrandsFromPricelists = () =>
    api.get('/brand/missing-from-pricelists');

export const resolveMissingBrand = (payload) =>
    api.post('/brand/missing-from-pricelists/resolve', payload);
