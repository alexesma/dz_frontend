import api from '../api.js';

export const getMyPrinters = () => api.get('/print-jobs/me');
export const enqueuePrintJob = (data) => api.post('/print-jobs', data);
export const getPrintDevices = () => api.get('/print-jobs/admin/devices');
export const getPrintAssignments = () => api.get('/print-jobs/admin/assignments');
export const savePrintAssignment = (data) =>
    api.put('/print-jobs/admin/assignments', data);
export const deletePrintAssignment = (id) =>
    api.delete(`/print-jobs/admin/assignments/${id}`);
export const getAdminPrintJobs = () => api.get('/print-jobs/admin/jobs');
export const retryPrintJob = (id) =>
    api.post(`/print-jobs/admin/jobs/${id}/retry`);
