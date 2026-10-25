import api from '../api.js';

export const getPrintForms = () => api.get('/print-forms');
export const savePrintForm = (key, layout) =>
    api.put(`/print-forms/${key}`, layout);
