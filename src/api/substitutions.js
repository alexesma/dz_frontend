import api from '../api.js';

// ===== Substitutions (подмены для прайсов) =====
export const getSubstitutions = (params) =>
    api.get('/substitutions/', { params });

export const getSubstitutionById = (id) =>
    api.get(`/substitutions/${id}`);

export const createSubstitution = (data) =>
    api.post('/substitutions/', data);

export const updateSubstitution = (id, data) =>
    api.put(`/substitutions/${id}`, data);

export const deleteSubstitution = (id) =>
    api.delete(`/substitutions/${id}`);

export const uploadSubstitutionsFromExcel = (file, customerConfigId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (customerConfigId) {
        formData.append('customer_config_id', customerConfigId);
    }
    return api.post('/substitutions/upload-from-1c', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

// ===== Crosses (справочные кроссы) =====
export const getCrosses = (params) =>
    api.get('/crosses/', { params });

export const getCrossById = (id) =>
    api.get(`/crosses/${id}`);

export const createCross = (data) =>
    api.post('/crosses/', data);

export const updateCross = (id, data) =>
    api.put(`/crosses/${id}`, data);

export const deleteCross = (id) =>
    api.delete(`/crosses/${id}`);

export const uploadCrossesFromExcel = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/crosses/upload-from-1c', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
