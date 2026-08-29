import api from '../api.js';

export const getCertificates = (params = {}) =>
    api.get('/certificates/', { params });

export const createCertificate = (data) =>
    api.post('/certificates/', data);

export const updateCertificate = (id, data) =>
    api.patch(`/certificates/${id}/`, data);

export const deleteCertificate = (id) =>
    api.delete(`/certificates/${id}/`);

export const getCertificateAutoparts = (id, params = {}) =>
    api.get(`/certificates/${id}/autoparts/`, { params });

export const linkAutoparts = (id, autopartIds) =>
    api.post(`/certificates/${id}/autoparts/`, { autopart_ids: autopartIds });

export const unlinkAutopart = (id, autopartId) =>
    api.delete(`/certificates/${id}/autoparts/${autopartId}/`);

export const backfillCertificateBrands = (dryRun = true) =>
    api.post('/certificates/backfill-brands/', null, {
        params: { dry_run: dryRun },
    });

export const applyCertificateToBrand = (id, data) =>
    api.post(`/certificates/${id}/apply-brand/`, data);
