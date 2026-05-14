import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    SendOutlined,
    StopOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    addCustomerReturnItem,
    addSupplierReturnItem,
    approveCustomerReturn,
    approveSupplierReturn,
    confirmCustomerReturn,
    confirmSupplierReturn,
    deleteCustomerReturn,
    deleteCustomerReturnItem,
    deleteSupplierReturn,
    deleteSupplierReturnItem,
    getCustomerReturn,
    getShipment,
    getSupplierReturn,
    shipCustomerReturn,
    shipSupplierReturn,
    rejectCustomerReturn,
    rejectSupplierReturn,
    updateCustomerReturn,
    updateSupplierReturn,
} from '../api/inventory';
import { getSupplierReceipt } from '../api/customerOrders';
import { getCustomers } from '../api/customers';
import {
    createDiadocOutboundDocumentFromCustomerReturn,
    createDiadocOutboundDocumentFromSupplierReturn,
    getDiadocCustomerReturnOutboundReadiness,
    getDiadocSupplierReturnOutboundReadiness,
    listDiadocOutboundDocuments,
} from '../api/diadoc';
import { getProviders } from '../api/providers';
import { getWarehouses } from '../api/storage';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;

const STATUS_COLORS = {
    created: 'default',
    approved: 'processing',
    shipped: 'warning',
    confirmed: 'success',
    rejected: 'error',
};

const STATUS_LABELS = {
    created: 'Создан',
    approved: 'Согласован',
    shipped: 'Отправлен',
    confirmed: 'Подтвержден',
    rejected: 'Отклонён',
};

const DIADOC_COLORS = {
    draft: 'default',
    sent: 'processing',
    delivered: 'success',
    error: 'error',
};

const DIADOC_LABELS = {
    draft: 'Черновик',
    sent: 'Отправлен',
    delivered: 'Доставлен',
    error: 'Ошибка',
};

const normalizePagedItems = (payload) => (
    Array.isArray(payload) ? payload : (payload?.items || [])
);

const fmtDate = (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—');

const ReturnDetailPage = ({ kind }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { id } = useParams();
    const docId = Number(id);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detail, setDetail] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [sourceLoading, setSourceLoading] = useState(false);
    const [sourceItems, setSourceItems] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [providers, setProviders] = useState([]);
    const [diadocDocs, setDiadocDocs] = useState([]);
    const [diadocLoading, setDiadocLoading] = useState(false);
    const [diadocReadiness, setDiadocReadiness] = useState(null);
    const [diadocReadinessLoading, setDiadocReadinessLoading] = useState(false);
    const [sendingToDiadoc, setSendingToDiadoc] = useState(false);
    const [sendingSignedToDiadoc, setSendingSignedToDiadoc] = useState(false);
    const [signatureOpen, setSignatureOpen] = useState(false);
    const [headerForm] = Form.useForm();
    const [itemForm] = Form.useForm();
    const [signatureForm] = Form.useForm();

    const isCustomer = kind === 'customer';
    const isEditable = detail?.status === 'created';
    const canUseDiadoc = user?.role === 'admin';

    const loadReferenceOptions = useCallback(async () => {
        try {
            const [warehouseRes, customerRes, providerRes] = await Promise.all([
                getWarehouses({ limit: 200 }),
                getCustomers({ page_size: 200 }),
                getProviders({ page_size: 200 }),
            ]);
            setWarehouses(
                (warehouseRes.data?.items || warehouseRes.data || []).map((item) => ({
                    value: item.id,
                    label: item.name,
                }))
            );
            setCustomers(normalizePagedItems(customerRes.data).map((item) => ({
                value: item.id,
                label: item.name,
            })));
            setProviders(normalizePagedItems(providerRes.data).map((item) => ({
                value: item.id,
                label: item.name,
            })));
        } catch (err) {
            console.error('Failed to load return references', err);
        }
    }, []);

    const loadDetail = useCallback(async () => {
        if (!Number.isFinite(docId)) return;
        setLoading(true);
        try {
            const response = isCustomer
                ? await getCustomerReturn(docId)
                : await getSupplierReturn(docId);
            const nextDetail = response.data;
            setDetail(nextDetail);
            headerForm.setFieldsValue({
                doc_number: nextDetail.doc_number || undefined,
                warehouse_id: nextDetail.warehouse_id || undefined,
                reason: nextDetail.reason || undefined,
                notes: nextDetail.notes || undefined,
                customer_id: nextDetail.customer_id || undefined,
                provider_id: nextDetail.provider_id || undefined,
                shipment_document_id: nextDetail.shipment_document_id || undefined,
                supplier_receipt_id: nextDetail.supplier_receipt_id || undefined,
            });
        } catch (err) {
            console.error('Failed to load return detail', err);
            message.error('Не удалось загрузить возврат');
        } finally {
            setLoading(false);
        }
    }, [docId, headerForm, isCustomer]);

    const loadSourceItems = useCallback(async () => {
        if (!detail) {
            setSourceItems([]);
            return;
        }
        const sourceId = isCustomer
            ? detail.shipment_document_id
            : detail.supplier_receipt_id;
        if (!sourceId) {
            setSourceItems([]);
            return;
        }
        setSourceLoading(true);
        try {
            const response = isCustomer
                ? await getShipment(sourceId)
                : await getSupplierReceipt(sourceId);
            const items = response.data?.items || [];
            const mapped = items.map((item) => ({
                value: item.id,
                label: isCustomer
                    ? `#${item.id} · ${item.autopart_oem || '—'} · ${item.autopart_name || 'Без названия'} · qty ${item.quantity}`
                    : `#${item.id} · ${item.oem_number || '—'} · ${item.autopart_name || 'Без названия'} · qty ${item.received_quantity || 0}`,
                raw: item,
            }));
            setSourceItems(mapped);
        } catch (err) {
            console.error('Failed to load return source items', err);
            message.error('Не удалось загрузить строки исходного документа');
            setSourceItems([]);
        } finally {
            setSourceLoading(false);
        }
    }, [detail, isCustomer]);

    const loadDiadocDocs = useCallback(async () => {
        if (!canUseDiadoc || !Number.isFinite(docId)) {
            setDiadocDocs([]);
            return;
        }
        setDiadocLoading(true);
        try {
            const response = await listDiadocOutboundDocuments({
                source_type: isCustomer ? 'return_from_customer' : 'return_to_supplier',
                source_id: docId,
                limit: 20,
            });
            setDiadocDocs(response.data || []);
        } catch (err) {
            console.error('Failed to load Diadoc return documents', err);
            setDiadocDocs([]);
        } finally {
            setDiadocLoading(false);
        }
    }, [canUseDiadoc, docId, isCustomer]);

    const loadDiadocReadiness = useCallback(async () => {
        if (!canUseDiadoc || !Number.isFinite(docId)) {
            setDiadocReadiness(null);
            return;
        }
        setDiadocReadinessLoading(true);
        try {
            const response = isCustomer
                ? await getDiadocCustomerReturnOutboundReadiness(docId)
                : await getDiadocSupplierReturnOutboundReadiness(docId);
            setDiadocReadiness(response.data || null);
        } catch (err) {
            console.error('Failed to load Diadoc return readiness', err);
            setDiadocReadiness(null);
        } finally {
            setDiadocReadinessLoading(false);
        }
    }, [canUseDiadoc, docId, isCustomer]);

    useEffect(() => {
        loadReferenceOptions();
    }, [loadReferenceOptions]);

    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    useEffect(() => {
        loadSourceItems();
    }, [loadSourceItems]);

    useEffect(() => {
        if (!canUseDiadoc || !Number.isFinite(docId)) return;
        loadDiadocDocs();
        loadDiadocReadiness();
    }, [canUseDiadoc, docId, loadDiadocDocs, loadDiadocReadiness]);

    useEffect(() => {
        if (!canUseDiadoc || !detail) return;
        loadDiadocReadiness();
    }, [
        canUseDiadoc,
        detail,
        detail?.status,
        detail?.customer_id,
        detail?.provider_id,
        detail?.shipment_document_id,
        detail?.supplier_receipt_id,
        detail?.items?.length,
        loadDiadocReadiness,
    ]);

    useEffect(() => {
        if (!addOpen) {
            itemForm.resetFields();
        }
    }, [addOpen, itemForm]);

    useEffect(() => {
        if (!signatureOpen) {
            signatureForm.resetFields();
        }
    }, [signatureForm, signatureOpen]);

    const handleSaveHeader = async () => {
        let values;
        try {
            values = await headerForm.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            const payload = {
                doc_number: values.doc_number || null,
                warehouse_id: values.warehouse_id || null,
                reason: values.reason || null,
                notes: values.notes || null,
            };
            if (isCustomer) {
                payload.customer_id = values.customer_id || null;
                payload.shipment_document_id = values.shipment_document_id || null;
                await updateCustomerReturn(docId, payload);
            } else {
                payload.provider_id = values.provider_id || null;
                payload.supplier_receipt_id = values.supplier_receipt_id || null;
                await updateSupplierReturn(docId, payload);
            }
            message.success('Возврат обновлён');
            await loadDetail();
        } catch (err) {
            console.error('Failed to update return', err);
            message.error(err?.response?.data?.detail || 'Не удалось обновить возврат');
        } finally {
            setSaving(false);
        }
    };

    const handleAddItem = async () => {
        let values;
        try {
            values = await itemForm.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            const payload = {
                quantity: values.quantity,
                storage_location_id: values.storage_location_id || null,
                notes: values.notes || null,
            };
            if (isCustomer) {
                payload.shipment_item_id = values.source_item_id;
                await addCustomerReturnItem(docId, payload);
            } else {
                payload.supplier_receipt_item_id = values.source_item_id;
                await addSupplierReturnItem(docId, payload);
            }
            message.success('Строка добавлена');
            setAddOpen(false);
            await loadDetail();
        } catch (err) {
            console.error('Failed to add return item', err);
            message.error(err?.response?.data?.detail || 'Не удалось добавить строку');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteItem = useCallback(async (itemId) => {
        try {
            if (isCustomer) {
                await deleteCustomerReturnItem(docId, itemId);
            } else {
                await deleteSupplierReturnItem(docId, itemId);
            }
            message.success('Строка удалена');
            await loadDetail();
        } catch (err) {
            console.error('Failed to delete return item', err);
            message.error(err?.response?.data?.detail || 'Не удалось удалить строку');
        }
    }, [docId, isCustomer, loadDetail]);

    const runAction = async (action) => {
        setSaving(true);
        try {
            if (isCustomer) {
                if (action === 'approve') await approveCustomerReturn(docId);
                if (action === 'ship') await shipCustomerReturn(docId);
                if (action === 'confirm') await confirmCustomerReturn(docId);
                if (action === 'reject') await rejectCustomerReturn(docId);
            } else {
                if (action === 'approve') await approveSupplierReturn(docId);
                if (action === 'ship') await shipSupplierReturn(docId);
                if (action === 'confirm') await confirmSupplierReturn(docId);
                if (action === 'reject') await rejectSupplierReturn(docId);
            }
            message.success('Статус обновлён');
            await loadDetail();
        } catch (err) {
            console.error('Failed to change return status', err);
            message.error(err?.response?.data?.detail || 'Не удалось изменить статус');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDocument = async () => {
        try {
            if (isCustomer) {
                await deleteCustomerReturn(docId);
            } else {
                await deleteSupplierReturn(docId);
            }
            message.success('Возврат удалён');
            navigate('/warehouse/returns');
        } catch (err) {
            console.error('Failed to delete return', err);
            message.error(err?.response?.data?.detail || 'Не удалось удалить возврат');
        }
    };

    const handleSendDraftToDiadoc = useCallback(async () => {
        setSendingToDiadoc(true);
        try {
            const response = isCustomer
                ? await createDiadocOutboundDocumentFromCustomerReturn(docId, {
                    send_mode: 'draft',
                })
                : await createDiadocOutboundDocumentFromSupplierReturn(docId, {
                    send_mode: 'draft',
                });
            const payload = response.data || {};
            setDiadocDocs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
            message.success(
                `Формализованный УКД создан в Диадоке: #${payload.id || '—'}`
            );
            await Promise.all([loadDetail(), loadDiadocDocs(), loadDiadocReadiness()]);
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось создать формализованный УКД в Диадоке'
            );
        } finally {
            setSendingToDiadoc(false);
        }
    }, [
        docId,
        isCustomer,
        loadDetail,
        loadDiadocDocs,
        loadDiadocReadiness,
    ]);

    const openSignedSendModal = useCallback(() => {
        signatureForm.resetFields();
        setSignatureOpen(true);
    }, [signatureForm]);

    const handleSignatureUpload = useCallback((file) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            let base64Value = '';
            if (typeof result === 'string') {
                const commaIndex = result.indexOf(',');
                base64Value = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
            }
            signatureForm.setFieldsValue({ signature_base64: base64Value });
            message.success(`Подпись "${file.name}" загружена`);
        };
        reader.onerror = () => {
            message.error('Не удалось прочитать файл подписи');
        };
        reader.readAsDataURL(file);
        return false;
    }, [signatureForm]);

    const handleSendSignedToDiadoc = useCallback(async () => {
        let values;
        try {
            values = await signatureForm.validateFields();
        } catch {
            return;
        }
        setSendingSignedToDiadoc(true);
        try {
            const response = isCustomer
                ? await createDiadocOutboundDocumentFromCustomerReturn(docId, {
                    send_mode: 'send',
                    signature_base64: values.signature_base64,
                })
                : await createDiadocOutboundDocumentFromSupplierReturn(docId, {
                    send_mode: 'send',
                    signature_base64: values.signature_base64,
                });
            const payload = response.data || {};
            setDiadocDocs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
            message.success(
                `Формализованный УКД отправлен в Диадок: #${payload.id || '—'}`
            );
            setSignatureOpen(false);
            await Promise.all([loadDetail(), loadDiadocDocs(), loadDiadocReadiness()]);
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отправить формализованный УКД в Диадок'
            );
        } finally {
            setSendingSignedToDiadoc(false);
        }
    }, [
        docId,
        isCustomer,
        loadDetail,
        loadDiadocDocs,
        loadDiadocReadiness,
        signatureForm,
    ]);

    const itemColumns = useMemo(() => [
        {
            title: 'Источник',
            key: 'source',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    {record.shipment_item_id ? <Text>Отгрузка: #{record.shipment_item_id}</Text> : null}
                    {record.supplier_receipt_item_id ? <Text>Поступление: #{record.supplier_receipt_item_id}</Text> : null}
                    {record.lot_id ? <Text type="secondary">Лот: #{record.lot_id}</Text> : null}
                </Space>
            ),
        },
        {
            title: 'Запчасть',
            key: 'part',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.autopart_oem || record.oem_number || '—'}</Text>
                    <Text>{record.autopart_name || 'Без названия'}</Text>
                    <Text type="secondary">{record.autopart_brand || record.brand_name || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'Количество',
            dataIndex: 'quantity',
            width: 110,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 130,
            render: (value) => (value == null ? '—' : Number(value).toFixed(2)),
        },
        {
            title: 'ГТД / Страна',
            key: 'gtd',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text>{record.gtd_number || 'Без ГТД'}</Text>
                    <Text type="secondary">{record.country_name || record.country_code || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            render: (value) => value || '—',
        },
        ...(isEditable ? [{
            title: 'Действия',
            key: 'actions',
            width: 96,
            render: (_, record) => (
                <Popconfirm
                    title="Удалить строку?"
                    onConfirm={() => handleDeleteItem(record.id)}
                >
                    <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                    />
                </Popconfirm>
            ),
        }] : []),
    ], [handleDeleteItem, isEditable]);

    if (loading && !detail) {
        return <Spin fullscreen />;
    }

    if (!detail) {
        return (
            <Alert
                type="error"
                showIcon
                message="Возврат не найден"
            />
        );
    }

    const sourceMissing = isCustomer
        ? !detail.shipment_document_id
        : !detail.supplier_receipt_id;
    const latestDiadocDoc = diadocDocs[0] || null;

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card>
                <Space
                    align="start"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    wrap
                >
                    <div>
                        <Title level={3} style={{ marginBottom: 4 }}>
                            {isCustomer ? 'Возврат от клиента' : 'Возврат поставщику'} {detail.doc_number || `#${detail.id}`}
                        </Title>
                        <Space wrap>
                            <Tag color={STATUS_COLORS[detail.status] || 'default'}>
                                {STATUS_LABELS[detail.status] || detail.status}
                            </Tag>
                            <Text type="secondary">Дата: {fmtDate(detail.doc_date)}</Text>
                            {detail.diadoc_outgoing_document_id ? (
                                <Tag color="cyan">Диадок #{detail.diadoc_outgoing_document_id}</Tag>
                            ) : null}
                        </Space>
                    </div>
                    <Space wrap>
                        <Button onClick={() => navigate('/warehouse/returns')}>
                            К списку
                        </Button>
                        {isEditable ? (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                loading={saving}
                                onClick={handleSaveHeader}
                            >
                                Сохранить
                            </Button>
                        ) : null}
                        {detail.status === 'created' ? (
                            <Button
                                icon={<CheckCircleOutlined />}
                                loading={saving}
                                onClick={() => runAction('approve')}
                            >
                                Согласовать
                            </Button>
                        ) : null}
                        {detail.status === 'approved' ? (
                            <Button
                                icon={<SendOutlined />}
                                loading={saving}
                                onClick={() => runAction('ship')}
                            >
                                {isCustomer ? 'Клиент отправил' : 'Отгрузить'}
                            </Button>
                        ) : null}
                        {(detail.status === 'approved' || detail.status === 'shipped') ? (
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                loading={saving}
                                onClick={() => runAction('confirm')}
                            >
                                Подтвердить
                            </Button>
                        ) : null}
                        {((isCustomer && ['created', 'approved', 'shipped'].includes(detail.status))
                            || (!isCustomer && ['created', 'approved'].includes(detail.status))) ? (
                            <Button
                                danger
                                icon={<StopOutlined />}
                                loading={saving}
                                onClick={() => runAction('reject')}
                            >
                                Отклонить
                            </Button>
                        ) : null}
                        {['created', 'rejected'].includes(detail.status) ? (
                            <Popconfirm
                                title="Удалить возврат?"
                                onConfirm={handleDeleteDocument}
                            >
                                <Button danger icon={<DeleteOutlined />}>
                                    Удалить
                                </Button>
                            </Popconfirm>
                        ) : null}
                    </Space>
                </Space>
            </Card>

            <Card title="Шапка документа">
                <Form form={headerForm} layout="vertical">
                    <Space style={{ width: '100%' }} size={12} align="start">
                        <Form.Item name="doc_number" label="Номер документа" style={{ flex: 1 }}>
                            <Input disabled={!isEditable} />
                        </Form.Item>
                        <Form.Item name="warehouse_id" label="Склад" style={{ flex: 1 }}>
                            <Select
                                disabled={!isEditable}
                                allowClear
                                options={warehouses}
                            />
                        </Form.Item>
                    </Space>
                    <Space style={{ width: '100%' }} size={12} align="start">
                        {isCustomer ? (
                            <>
                                <Form.Item name="customer_id" label="Клиент" style={{ flex: 1 }}>
                                    <Select
                                        disabled={!isEditable}
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        options={customers}
                                    />
                                </Form.Item>
                                <Form.Item name="shipment_document_id" label="ID отгрузки" style={{ flex: 1 }}>
                                    <InputNumber disabled={!isEditable} min={1} style={{ width: '100%' }} />
                                </Form.Item>
                            </>
                        ) : (
                            <>
                                <Form.Item name="provider_id" label="Поставщик" style={{ flex: 1 }}>
                                    <Select
                                        disabled={!isEditable}
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        options={providers}
                                    />
                                </Form.Item>
                                <Form.Item name="supplier_receipt_id" label="ID поступления" style={{ flex: 1 }}>
                                    <InputNumber disabled={!isEditable} min={1} style={{ width: '100%' }} />
                                </Form.Item>
                            </>
                        )}
                    </Space>
                    <Form.Item name="reason" label="Причина">
                        <Input disabled={!isEditable} />
                    </Form.Item>
                    <Form.Item name="notes" label="Примечание">
                        <Input.TextArea disabled={!isEditable} rows={3} />
                    </Form.Item>
                </Form>
            </Card>

            <Card
                title="Склад и источник"
                extra={(
                    <Space>
                        {isCustomer && detail.shipment_document_id ? (
                            <Link to={`/warehouse/shipments/${detail.shipment_document_id}`}>Открыть отгрузку</Link>
                        ) : null}
                        {!isCustomer && detail.supplier_receipt_id ? (
                            <Link to={`/documents/incoming?openId=${detail.supplier_receipt_id}`}>Открыть поступление</Link>
                        ) : null}
                    </Space>
                )}
            >
                <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label={isCustomer ? 'Клиент' : 'Поставщик'}>
                        {isCustomer ? (detail.customer_name || '—') : (detail.provider_name || '—')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Склад">
                        {detail.warehouse_name || '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={isCustomer ? 'Отгрузка' : 'Поступление'}>
                        {isCustomer
                            ? (detail.shipment_document_id ? `#${detail.shipment_document_id}` : '—')
                            : (detail.supplier_receipt_id ? `#${detail.supplier_receipt_id}` : '—')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Всего позиций">
                        {detail.items?.length || 0}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            {canUseDiadoc ? (
                <Card
                    title="Диадок"
                    loading={diadocReadinessLoading}
                    extra={latestDiadocDoc ? (
                        <Button
                            type="link"
                            onClick={() => navigate(`/documents/diadoc?tab=outgoing&outgoingId=${latestDiadocDoc.id}`)}
                        >
                            Открыть документ #{latestDiadocDoc.id}
                        </Button>
                    ) : null}
                >
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Space wrap>
                            {latestDiadocDoc ? (
                                <Tag color={DIADOC_COLORS[latestDiadocDoc.status] || 'default'}>
                                    {DIADOC_LABELS[latestDiadocDoc.status] || latestDiadocDoc.status}
                                </Tag>
                            ) : (
                                <Text type="secondary">
                                    {diadocLoading ? 'Загрузка отправок...' : 'Документов в Диадоке пока нет'}
                                </Text>
                            )}
                            <Tag color={diadocReadiness?.ready_formalized ? 'success' : 'warning'}>
                                {diadocReadiness?.ready_formalized
                                    ? 'Готово к формализованному УКД'
                                    : 'До формализованного УКД не хватает реквизитов'}
                            </Tag>
                        </Space>

                        {diadocReadiness?.missing_required_fields?.length > 0 ? (
                            <Alert
                                type="error"
                                showIcon
                                message="Что блокирует отправку"
                                description={(
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {diadocReadiness.missing_required_fields.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            />
                        ) : null}

                        {diadocReadiness?.warnings?.length > 0 ? (
                            <Alert
                                type="warning"
                                showIcon
                                message="Что лучше проверить заранее"
                                description={(
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {diadocReadiness.warnings.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            />
                        ) : null}

                        <Space wrap>
                            <Button
                                icon={<SendOutlined />}
                                loading={sendingToDiadoc}
                                disabled={!diadocReadiness?.ready_formalized}
                                onClick={handleSendDraftToDiadoc}
                            >
                                Черновик в Диадок
                            </Button>
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                disabled={!diadocReadiness?.ready_formalized}
                                onClick={openSignedSendModal}
                            >
                                Отправить с подписью
                            </Button>
                            {isCustomer && diadocReadiness?.customer_id ? (
                                <Button onClick={() => navigate(`/customers/${diadocReadiness.customer_id}/edit`)}>
                                    Открыть клиента
                                </Button>
                            ) : null}
                            {!isCustomer && diadocReadiness?.provider_id ? (
                                <Button onClick={() => navigate(`/providers/${diadocReadiness.provider_id}/edit`)}>
                                    Открыть поставщика
                                </Button>
                            ) : null}
                            <Button onClick={() => navigate('/documents/diadoc')}>
                                Открыть настройки Диадока
                            </Button>
                        </Space>

                        {diadocReadiness?.recommended_actions?.length > 0 ? (
                            <Alert
                                type="info"
                                showIcon
                                message="Что сделать дальше"
                                description={(
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {diadocReadiness.recommended_actions.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            />
                        ) : null}
                    </Space>
                </Card>
            ) : null}

            <Card
                title="Строки возврата"
                extra={isEditable ? (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setAddOpen(true)}
                    >
                        Добавить строку
                    </Button>
                ) : null}
            >
                {sourceMissing && isEditable ? (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Сначала укажите исходный документ в шапке"
                        description={
                            isCustomer
                                ? 'Для быстрого добавления строк возврата нужен ID исходной отгрузки.'
                                : 'Для быстрого добавления строк возврата нужен ID исходного поступления.'
                        }
                    />
                ) : null}
                <Table
                    rowKey="id"
                    dataSource={detail.items || []}
                    columns={itemColumns}
                    pagination={false}
                />
            </Card>

            <Modal
                open={addOpen}
                title="Добавить строку возврата"
                onCancel={() => setAddOpen(false)}
                onOk={handleAddItem}
                okText="Добавить"
                cancelText="Отмена"
                confirmLoading={saving}
                width={640}
            >
                {sourceMissing ? (
                    <Alert
                        type="warning"
                        showIcon
                        message="Нет исходного документа"
                        description="Сначала сохраните в шапке ID отгрузки или поступления."
                    />
                ) : (
                    <Form form={itemForm} layout="vertical">
                        <Form.Item
                            name="source_item_id"
                            label={isCustomer ? 'Строка отгрузки' : 'Строка поступления'}
                            rules={[{ required: true, message: 'Выберите строку' }]}
                        >
                            <Select
                                showSearch
                                optionFilterProp="label"
                                loading={sourceLoading}
                                options={sourceItems}
                                onChange={(value) => {
                                    const source = sourceItems.find((item) => item.value === value)?.raw;
                                    if (!source) return;
                                    const quantity = isCustomer
                                        ? Number(source.quantity || 0)
                                        : Number(source.received_quantity || 0);
                                    itemForm.setFieldsValue({
                                        quantity: quantity > 0 ? quantity : undefined,
                                    });
                                }}
                            />
                        </Form.Item>
                        <Space style={{ width: '100%' }} size={12} align="start">
                            <Form.Item
                                name="quantity"
                                label="Количество"
                                rules={[{ required: true, message: 'Укажите количество' }]}
                                style={{ flex: 1 }}
                            >
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                name="storage_location_id"
                                label="Ячейка (опционально)"
                                style={{ flex: 1 }}
                            >
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                        </Space>
                        <Form.Item name="notes" label="Примечание">
                            <Input.TextArea rows={3} />
                        </Form.Item>
                    </Form>
                )}
            </Modal>
            <Modal
                open={signatureOpen}
                title="Подписать и отправить формализованный УКД"
                onCancel={() => setSignatureOpen(false)}
                onOk={handleSendSignedToDiadoc}
                okText="Отправить"
                cancelText="Отмена"
                confirmLoading={sendingSignedToDiadoc}
                width={640}
            >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Alert
                        type="info"
                        showIcon
                        message="Нужна подпись в base64"
                        description="Можно вставить base64 вручную или загрузить файл подписи. Файл будет прочитан локально в браузере."
                    />
                    <Form form={signatureForm} layout="vertical">
                        <Form.Item label="Формат">
                            <Tag color="success">Формализованный УКД</Tag>
                        </Form.Item>
                        <Form.Item label="Файл подписи">
                            <Upload
                                maxCount={1}
                                beforeUpload={handleSignatureUpload}
                                showUploadList
                            >
                                <Button icon={<UploadOutlined />}>
                                    Загрузить подпись
                                </Button>
                            </Upload>
                        </Form.Item>
                        <Form.Item
                            name="signature_base64"
                            label="Подпись (base64)"
                            rules={[{ required: true, message: 'Вставьте или загрузите подпись' }]}
                        >
                            <Input.TextArea rows={8} placeholder="base64 подписи" />
                        </Form.Item>
                    </Form>
                </Space>
            </Modal>
        </Space>
    );
};

export default ReturnDetailPage;
