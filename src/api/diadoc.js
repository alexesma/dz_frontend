import api from '../api';

export const getDiadocStatus = () =>
    api.get('/diadoc/status');

export const updateDiadocSettings = (data) =>
    api.put('/diadoc/settings', data);

export const getDiadocCounteragents = (params = {}) =>
    api.get('/diadoc/counteragents', { params });

export const bindDiadocProviderCounteragent = (providerId, data) =>
    api.post(`/diadoc/providers/${providerId}/bind-counteragent`, data);

export const bindDiadocCustomerCounteragent = (customerId, data) =>
    api.post(`/diadoc/customers/${customerId}/bind-counteragent`, data);

export const syncDiadocInboundDocuments = (data = {}) =>
    api.post('/diadoc/sync/inbound', data);

export const listDiadocInboundDocuments = (params = {}) =>
    api.get('/diadoc/inbound-documents', { params });

export const processDiadocInboundDocument = (documentId, data = {}) =>
    api.post(`/diadoc/inbound-documents/${documentId}/process`, data);

export const listDiadocOutboundDocuments = (params = {}) =>
    api.get('/diadoc/outbound-documents', { params });

export const createDiadocOutboundDocumentFromShipment = (
    shipmentId,
    data = {}
) =>
    api.post(`/diadoc/outbound-documents/from-shipment/${shipmentId}`, data);

export const createDiadocOutboundDocumentFromCustomerReturn = (
    returnId,
    data = {}
) =>
    api.post(`/diadoc/outbound-documents/from-customer-return/${returnId}`, data);

export const createDiadocOutboundDocumentFromSupplierReturn = (
    returnId,
    data = {}
) =>
    api.post(`/diadoc/outbound-documents/from-supplier-return/${returnId}`, data);

export const getDiadocShipmentOutboundReadiness = (shipmentId) =>
    api.get(`/diadoc/outbound-readiness/shipment/${shipmentId}`);

export const getDiadocShipmentsOutboundReadiness = (shipmentIds = []) =>
    api.get('/diadoc/outbound-readiness/shipments', {
        params: { shipment_ids: shipmentIds },
        paramsSerializer: {
            indexes: null,
        },
    });

export const getDiadocCustomerReturnOutboundReadiness = (returnId) =>
    api.get(`/diadoc/outbound-readiness/customer-return/${returnId}`);

export const getDiadocSupplierReturnOutboundReadiness = (returnId) =>
    api.get(`/diadoc/outbound-readiness/supplier-return/${returnId}`);
