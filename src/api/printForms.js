import api from '../api.js';

export const getPrintForms = (config) => api.get('/print-forms', config);
export const savePrintForm = (key, layout) =>
    api.put(`/print-forms/${key}`, layout);
