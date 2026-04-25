import api from '../api.js';

export const getCategories = () => api.get('/categories/');

export const createCategory = (data) => api.post('/categories/', data);

export const updateCategory = (id, data) => api.patch(`/categories/${id}/`, data);
