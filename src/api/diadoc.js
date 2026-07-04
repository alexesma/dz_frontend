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

export const syncDiadocOutboundStatuses = (params = {}) =>
    api.post('/diadoc/sync/outbound-status', null, { params });

export const refreshDiadocOutboundDocumentStatus = (documentId) =>
    api.post(`/diadoc/outbound-documents/${documentId}/refresh-status`);

export const startDiadocInboundSign = (documentId, data = {}) =>
    api.post(`/diadoc/inbound-documents/${documentId}/sign/start`, data, {
        timeout: 120000,
    });

export const startDiadocOutboundRevoke = (documentId, data = {}) =>
    api.post(`/diadoc/outbound-documents/${documentId}/revoke/start`, data, {
        timeout: 120000,
    });

export const startDiadocOutboundSendSigned = (documentId) =>
    api.post(
        `/diadoc/outbound-documents/${documentId}/send-signed/start`,
        null,
        { timeout: 120000 }
    );

export const confirmDiadocCloudSignTask = (taskId, code) =>
    api.post(`/diadoc/cloud-sign-tasks/${taskId}/confirm`, { code }, {
        timeout: 120000,
    });

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

export const startDiadocInboundReject = (documentId, comment) =>
    api.post(`/diadoc/inbound-documents/${documentId}/reject/start`, {
        comment,
    }, { timeout: 120000 });

export const downloadDiadocPrintForm = async (messageId, entityId) => {
    const response = await api.get('/diadoc/print-form', {
        params: { message_id: messageId, entity_id: entityId },
        responseType: 'blob',
        timeout: 180000,
    });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diadoc_${String(messageId).slice(0, 8)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};
