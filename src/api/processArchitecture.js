import api from '../api.js';

const BASE = '/process-architecture/annotations';

export const getProcessAnnotations = (pageKey) =>
    api.get(BASE, { params: { page_key: pageKey } });

export const createProcessAnnotation = (data) => api.post(BASE, data);

export const updateProcessAnnotation = (id, data) =>
    api.patch(`${BASE}/${id}`, data);

export const deleteProcessAnnotation = (id) => api.delete(`${BASE}/${id}`);

