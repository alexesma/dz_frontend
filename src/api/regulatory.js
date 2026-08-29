import api from '../api.js';

export const getRegulatoryCoverage = (params = {}) =>
    api.get('/regulatory/coverage/', { params });

export const importRegulatoryFile = (file, params = {}) => {
    const body = new FormData();
    body.append('file', file);
    return api.post('/regulatory/import/', body, {
        params,
        // Разбор прайса на сотни тысяч строк идёт дольше общего таймаута.
        timeout: 600000,
    });
};

export const applyCertificationRules = (params = {}) =>
    api.post('/regulatory/rules/apply/', null, { params, timeout: 600000 });

export const refreshFromRegistry = (params = {}) =>
    api.post('/regulatory/registry-refresh/', null, {
        params,
        // Реестр отвечает медленно, порция документов идёт минутами.
        timeout: 900000,
    });

export const importTnvedOkpd2Table = (file, params = {}) => {
    const body = new FormData();
    body.append('file', file);
    return api.post('/regulatory/tnved-okpd2/import/', body, {
        params,
        timeout: 600000,
    });
};

export const fillOkpd2FromTnved = (params = {}) =>
    api.post('/regulatory/okpd2-from-tnved/', null, {
        params,
        timeout: 600000,
    });
