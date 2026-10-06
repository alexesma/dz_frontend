const rawApiUrl = import.meta.env.VITE_API_URL;
export const API_URL = rawApiUrl && rawApiUrl.trim()
    ? rawApiUrl.trim()
    : '/api';

export const resolveBackendAssetUrl = (value) => {
    const url = String(value || '').trim();
    if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url;
    if (!url.startsWith('/uploads/')) return url;
    // До отдельного nginx-маршрута /uploads ошибочный HTML-ответ кешировался
    // браузером как картинка на год. Версия заставляет один раз получить
    // настоящий файл после обновления.
    const versionedUrl = `${url}${url.includes('?') ? '&' : '?'}asset_version=2`;
    if (!/^https?:\/\//i.test(API_URL)) return versionedUrl;
    try {
        return new URL(versionedUrl, new URL(API_URL).origin).toString();
    } catch {
        return versionedUrl;
    }
};

import axios from 'axios';

const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    withCredentials: true,
});

export default api;

export const fetchRestockOffers = () => api.get('/order/generate_restock_offers');

export const confirmOrders = (offers) => api.post('/order/confirm', { offers });

export const getConfirmedOrders = () => api.get('/order/confirmed');

export const sendOrdersToSuppliers = (orders) => api.post('/order/send_to_suppliers', { orders });
