import axios from 'axios';

export const api = axios.create({
    baseURL: '/api'
});

export const fetchRestockOffers = () => api.get('/generate_restock_offers');

export const confirmOrders = (offers) => api.post('/order/confirm', { offers });

export const getConfirmedOrders = () => api.get('/order/confirmed');

export const sendOrdersToSuppliers = (orders) => api.post('/order/send_to_suppliers', { orders });
