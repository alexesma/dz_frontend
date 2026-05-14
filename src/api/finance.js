import api from '../api';

const BASE = '/finance';

// ── PaymentInvoice ────────────────────────────────────────────────────────────

export const listInvoices = (params = {}) =>
    api.get(`${BASE}/invoices`, { params });

export const getInvoice = (id) =>
    api.get(`${BASE}/invoices/${id}`);

export const createInvoice = (data) =>
    api.post(`${BASE}/invoices`, data);

export const updateInvoice = (id, data) =>
    api.patch(`${BASE}/invoices/${id}`, data);

export const deleteInvoice = (id) =>
    api.delete(`${BASE}/invoices/${id}`);

/** Opens print/PDF view in a new browser tab. */
export const getInvoicePrintUrl = (id) =>
    `${api.defaults.baseURL}${BASE}/invoices/${id}/print`;

export const sendInvoiceEmail = (id, toEmail = null) =>
    api.post(`${BASE}/invoices/${id}/send-email`, toEmail ? { to_email: toEmail } : {});

// ── CustomerPayment ───────────────────────────────────────────────────────────

export const listCustomerPayments = (params = {}) =>
    api.get(`${BASE}/customer-payments`, { params });

export const getCustomerPayment = (id) =>
    api.get(`${BASE}/customer-payments/${id}`);

export const createCustomerPayment = (data) =>
    api.post(`${BASE}/customer-payments`, data);

export const updateCustomerPayment = (id, data) =>
    api.patch(`${BASE}/customer-payments/${id}`, data);

export const deleteCustomerPayment = (id) =>
    api.delete(`${BASE}/customer-payments/${id}`);

// ── SupplierPayment ───────────────────────────────────────────────────────────

export const listSupplierPayments = (params = {}) =>
    api.get(`${BASE}/supplier-payments`, { params });

export const getSupplierPayment = (id) =>
    api.get(`${BASE}/supplier-payments/${id}`);

export const createSupplierPayment = (data) =>
    api.post(`${BASE}/supplier-payments`, data);

export const updateSupplierPayment = (id, data) =>
    api.patch(`${BASE}/supplier-payments/${id}`, data);

export const deleteSupplierPayment = (id) =>
    api.delete(`${BASE}/supplier-payments/${id}`);

// ── Debt report ───────────────────────────────────────────────────────────────

export const getDebtorsReport = (onlyOverdue = false) =>
    api.get(`${BASE}/debtors`, { params: { only_overdue: onlyOverdue } });

export const getCustomerDebt = (customerId) =>
    api.get(`${BASE}/debtors/${customerId}`);

export const getCreditorsReport = (onlyOwed = false) =>
    api.get(`${BASE}/creditors`, { params: { only_owed: onlyOwed } });

// ── Invoice items ─────────────────────────────────────────────────────────────

export const listInvoiceItems = (invoiceId) =>
    api.get(`${BASE}/invoices/${invoiceId}/items`);

export const addInvoiceItem = (invoiceId, data) =>
    api.post(`${BASE}/invoices/${invoiceId}/items`, data);

export const updateInvoiceItem = (invoiceId, itemId, data) =>
    api.patch(`${BASE}/invoices/${invoiceId}/items/${itemId}`, data);

export const deleteInvoiceItem = (invoiceId, itemId) =>
    api.delete(`${BASE}/invoices/${invoiceId}/items/${itemId}`);
