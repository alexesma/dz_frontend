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

export const resolveDiadocInboundMismatch = (documentId, action) =>
    api.post(`/diadoc/inbound-documents/${documentId}/resolve-mismatch`, { action });

export const acknowledgeDiadocInboundMismatch = (documentId) =>
    api.post(`/diadoc/inbound-documents/${documentId}/acknowledge-mismatch`);

export const processDiadocInboundDocument = (documentId, data = {}) =>
    api.post(`/diadoc/inbound-documents/${documentId}/process`, data);

export const listDiadocOutboundDocuments = (params = {}) =>
    api.get('/diadoc/outbound-documents', { params });

export const syncDiadocOutboundStatuses = (params = {}) =>
    api.post('/diadoc/sync/outbound-status', null, { params });

export const refreshDiadocOutboundDocumentStatus = (documentId) =>
    api.post(`/diadoc/outbound-documents/${documentId}/refresh-status`);

export const getDiadocInboundAcceptance = (documentId) =>
    api.get(`/diadoc/inbound-documents/${documentId}/acceptance`);

export const retryDiadocFailedEvents = () =>
    api.post('/diadoc/events/retry-failed');

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

export const getDiadocShipmentCorrectionReadiness = (correctionId) =>
    api.get(`/diadoc/outbound-readiness/shipment-correction/${correctionId}`);

export const createDiadocOutboundDocumentFromShipmentCorrection = (
    correctionId, data = {}
) => api.post(
    `/diadoc/outbound-documents/from-shipment-correction/${correctionId}`,
    data
);

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

export const checkDiadocShipmentMarking = (shipmentId) =>
    api.post(`/diadoc/outbound-readiness/shipment/${shipmentId}/marking-check`);

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

// ── ЭТрН (электронная транспортная накладная) ────────────────────────────
export const listEtrnDirectory = (name, params = {}) =>
    api.get(`/diadoc/etrn/${name}`, { params });
export const saveEtrnDirectoryItem = (name, id, data) =>
    id
        ? api.put(`/diadoc/etrn/${name}/${id}`, data)
        : api.post(`/diadoc/etrn/${name}`, data);
export const deleteEtrnDirectoryItem = (name, id) =>
    api.delete(`/diadoc/etrn/${name}/${id}`);

export const listEtrnWaybills = (params = {}) =>
    api.get('/diadoc/etrn/waybills', { params });
export const syncEtrnWaybills = () =>
    api.post('/diadoc/etrn/sync', null, { timeout: 120000 });
export const refreshEtrnWaybill = (id) =>
    api.post(`/diadoc/etrn/waybills/${id}/refresh`, null, { timeout: 120000 });
export const saveEtrnDraft = (id, data) =>
    id
        ? api.put(`/diadoc/etrn/waybills/${id}`, data)
        : api.post('/diadoc/etrn/waybills', data);
export const startEtrnT1Sign = (id) =>
    api.post(`/diadoc/etrn/waybills/${id}/sign`, null, { timeout: 120000 });
export const startEtrnT3Accept = (id, data) =>
    api.post(`/diadoc/etrn/waybills/${id}/accept`, data, { timeout: 120000 });
export const getEtrnShipmentPrefill = (shipmentId) =>
    api.get(`/diadoc/etrn/shipments/${shipmentId}/prefill`);
export const startEtrnT6Sign = (id, data = {}) =>
    api.post(`/diadoc/etrn/waybills/${id}/t6`, data, { timeout: 120000 });
