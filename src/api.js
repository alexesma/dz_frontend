export const API_URL = import.meta.env.VITE_API_URL ?? 'http://90.156.158.19:8000';

import axios from 'axios';

export const api = axios.create({
    baseURL: API_URL
});

export const fetchRestockOffers = () => api.get('/generate_restock_offers');

export const confirmOrders = (offers) => api.post('/order/confirm', { offers });

export const getConfirmedOrders = () => api.get('/order/confirmed');

export const sendOrdersToSuppliers = (orders) => api.post('/order/send_to_suppliers', { orders });
