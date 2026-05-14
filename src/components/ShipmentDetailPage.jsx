import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Descriptions,
    Divider,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    LockOutlined,
    PlusOutlined,
    RollbackOutlined,
    SaveOutlined,
    SendOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
    addShipmentItem,
    deleteShipment,
    deleteShipmentItem,
    getShipment,
    listReserves,
    postShipment,
    unpostShipment,
    updateShipment,
    updateShipmentItem,
} from '../api/inventory';
import {
    createDiadocOutboundDocumentFromShipment,
    getDiadocShipmentOutboundReadiness,
    listDiadocOutboundDocuments,
} from '../api/diadoc';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations, getWarehouses } from '../api/storage';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = { draft: 'default', posted: 'success', cancelled: 'error' };
const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' };
const DIADOC_COLORS = { draft: 'default', sent: 'success', error: 'error' };
const DIADOC_LABELS = { draft: 'Черновик', sent: 'Отправлен', error: 'Ошибка' };

const fmtDate  = (d) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');
const fmtPrice = (p) => (p != null ? Number(p).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—');

// ── AddItemModal ──────────────────────────────────────────────────────────────

const AddItemModal = ({ open, onClose, onAdd }) => {
    const [form]                         = Form.useForm();
    const [apOptions, setApOptions]     = useState([]);
    const [locOptions, setLocOptions]   = useState([]);
    const [resOptions, setResOptions]   = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const [saving, setSaving]           = useState(false);
    const searchTimer                    = useRef(null);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        // Load locations
        getStorageLocations({ limit: 500 })
            .then((res) =>
                setLocOptions(
                    (res.data?.items || res.data || []).map((l) => ({
                        value: l.id,
                        label: `${l.name}${l.warehouse_name ? ` (${l.warehouse_name})` : ''}`,
                    }))
                )
            )
            .catch(() => {});
    }, [open, form]);

    const handleApSearch = (q) => {
        clearTimeout(searchTimer.current);
        if (!q || q.length < 2) { setApOptions([]); setResOptions([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearchingAp(true);
            try {
                const res = await searchAutopartsByOem(q, 30);
                const options = (res.data || []).map((ap) => ({
                    value: ap.id,
                    label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
                }));
                setApOptions(options);
            } catch { /* ignore */ }
            finally { setSearchingAp(false); }
        }, 300);
    };

    const handleApSelect = async (apId) => {
        // Load active reserves for this autopart
        try {
            const res = await listReserves({ autopart_id: apId, status: 'active', limit: 100 });
            const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
            setResOptions(
                items.map((r) => ({
                    value: r.id,
                    label: `Резерв #${r.id} — ${r.quantity} шт.${r.storage_location_name ? ` (${r.storage_location_name})` : ''}`,
                }))
            );
        } catch { /* ignore */ }
    };

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try {
            await onAdd({
                autopart_id:          values.autopart_id,
                storage_location_id:  values.storage_location_id || null,
                quantity:             values.quantity,
                price:                values.price || null,
                reserve_id:           values.reserve_id || null,
                notes:                values.notes || null,
            });
            form.resetFields();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={<><PlusOutlined /> Добавить строку</>}
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Добавить"
            cancelText="Отмена"
            confirmLoading={saving}
            width={560}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="autopart_id"
                    label="Запчасть"
                    rules={[{ required: true, message: 'Выберите запчасть' }]}
                >
                    <Select
                        showSearch
                        filterOption={false}
                        onSearch={handleApSearch}
                        onSelect={handleApSelect}
                        loading={searchingAp}
                        placeholder="Введите OEM или название"
                        notFoundContent={searchingAp ? <Spin size="small" /> : 'Ничего не найдено'}
                        options={apOptions}
                    />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={8}>
                        <Form.Item
                            name="quantity"
                            label="Количество"
                            rules={[{ required: true, message: 'Укажите количество' }]}
                            initialValue={1}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name="price" label="Цена, руб.">
                            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name="storage_location_id" label="Ячейка">
                            <Select
                                showSearch
                                allowClear
                                placeholder="Ячейка"
                                filterOption={(input, opt) =>
                                    opt.label.toLowerCase().includes(input.toLowerCase())
                                }
                                options={locOptions}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                {resOptions.length > 0 && (
                    <Form.Item name="reserve_id" label="Привязать к резерву">
                        <Select
                            allowClear
                            placeholder="Выберите резерв (необязательно)"
                            options={resOptions}
                        />
                    </Form.Item>
                )}
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── EditItemModal ─────────────────────────────────────────────────────────────

const EditItemModal = ({ open, item, onClose, onSave }) => {
    const [form]           = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !item) return;
        form.setFieldsValue({
            quantity: item.quantity,
            price:    item.price ? Number(item.price) : null,
            notes:    item.notes || '',
        });
    }, [open, item, form]);

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try {
            await onSave({
                quantity: values.quantity,
                price:    values.price || null,
                notes:    values.notes || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Редактировать строку"
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Сохранить"
            cancelText="Отмена"
            confirmLoading={saving}
            width={400}
        >
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item
                            name="quantity"
                            label="Количество"
                            rules={[{ required: true, message: 'Укажите количество' }]}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="price" label="Цена, руб.">
                            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── EditHeaderModal ───────────────────────────────────────────────────────────

const EditHeaderModal = ({ open, shipment, onClose, onSave }) => {
    const [form]                       = Form.useForm();
    const [saving, setSaving]         = useState(false);
    const [warehouses, setWarehouses] = useState([]);

    useEffect(() => {
        if (!open || !shipment) return;
        form.setFieldsValue({
            doc_number:  shipment.doc_number || '',
            warehouse_id: shipment.warehouse_id || null,
            reason:      shipment.reason || '',
            notes:       shipment.notes  || '',
        });
        getWarehouses({ limit: 200 })
            .then((res) =>
                setWarehouses(
                    (res.data?.items || res.data || []).map((w) => ({
                        value: w.id,
                        label: w.name,
                    }))
                )
            )
            .catch(() => {});
    }, [open, shipment, form]);

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try {
            await onSave({
                doc_number:  values.doc_number  || null,
                warehouse_id: values.warehouse_id || null,
                reason:      values.reason       || null,
                notes:       values.notes        || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Редактировать накладную"
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Сохранить"
            cancelText="Отмена"
            confirmLoading={saving}
            width={500}
        >
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="doc_number" label="Номер документа">
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="warehouse_id" label="Склад">
                            <Select allowClear placeholder="Выберите склад" options={warehouses} />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="reason" label="Причина отгрузки">
                    <Input />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const ShipmentDetailPage = () => {
    const { user }              = useAuth();
    const { id }                = useParams();
    const navigate              = useNavigate();
    const [shipment, setShipment]   = useState(null);
    const [loading, setLoading]     = useState(true);
    const [addOpen, setAddOpen]     = useState(false);
    const [editOpen, setEditOpen]   = useState(false);
    const [editItem, setEditItem]   = useState(null);
    const [headerOpen, setHeaderOpen] = useState(false);
    const [posting, setPosting]     = useState(false);
    const [unposting, setUnposting] = useState(false);
    const [deleting, setDeleting]   = useState(false);
    const [sendingToDiadoc, setSendingToDiadoc] = useState(false);
    const [sendingFormalizedToDiadoc, setSendingFormalizedToDiadoc] = useState(false);
    const [signatureOpen, setSignatureOpen] = useState(false);
    const [signatureFormat, setSignatureFormat] = useState('nonformalized');
    const [sendingSignedToDiadoc, setSendingSignedToDiadoc] = useState(false);
    const [diadocDocs, setDiadocDocs] = useState([]);
    const [diadocLoading, setDiadocLoading] = useState(false);
    const [diadocReadiness, setDiadocReadiness] = useState(null);
    const [diadocReadinessLoading, setDiadocReadinessLoading] = useState(false);
    const [signatureForm] = Form.useForm();
    const canUseDiadoc = user?.role === 'admin';

    const fetchShipment = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getShipment(id);
            setShipment(res.data);
        } catch {
            message.error('Ошибка загрузки накладной');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchShipment(); }, [fetchShipment]);

    const loadDiadocDocs = useCallback(async () => {
        if (!canUseDiadoc) {
            setDiadocDocs([]);
            return;
        }
        setDiadocLoading(true);
        try {
            const response = await listDiadocOutboundDocuments({
                source_type: 'shipment_document',
                source_id: Number(id),
                limit: 20,
            });
            setDiadocDocs(response.data || []);
        } catch (err) {
            console.error('Failed to load Diadoc shipment documents', err);
        } finally {
            setDiadocLoading(false);
        }
    }, [canUseDiadoc, id]);

    const loadDiadocReadiness = useCallback(async () => {
        if (!canUseDiadoc) {
            setDiadocReadiness(null);
            return;
        }
        setDiadocReadinessLoading(true);
        try {
            const response = await getDiadocShipmentOutboundReadiness(id);
            setDiadocReadiness(response.data || null);
        } catch (err) {
            console.error('Failed to load Diadoc shipment readiness', err);
            setDiadocReadiness(null);
        } finally {
            setDiadocReadinessLoading(false);
        }
    }, [canUseDiadoc, id]);

    useEffect(() => {
        if (!id || !canUseDiadoc) return;
        loadDiadocDocs();
        loadDiadocReadiness();
    }, [canUseDiadoc, id, loadDiadocDocs, loadDiadocReadiness]);

    useEffect(() => {
        if (!id || !canUseDiadoc || !shipment) return;
        loadDiadocReadiness();
    }, [
        canUseDiadoc,
        id,
        loadDiadocReadiness,
        shipment,
        shipment?.status,
        shipment?.customer_id,
        shipment?.items?.length,
    ]);

    const isDraft     = shipment?.status === 'draft';
    const isPosted    = shipment?.status === 'posted';
    const isCancelled = shipment?.status === 'cancelled';
    const latestDiadocDoc = diadocDocs[0] || null;

    const handleAddItem = async (data) => {
        try {
            await addShipmentItem(id, data);
            message.success('Строка добавлена');
            setAddOpen(false);
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка добавления');
            throw err;
        }
    };

    const handleEditItem = async (data) => {
        try {
            await updateShipmentItem(id, editItem.id, data);
            message.success('Строка обновлена');
            setEditOpen(false);
            setEditItem(null);
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка обновления');
            throw err;
        }
    };

    const handleDeleteItem = async (itemId) => {
        try {
            await deleteShipmentItem(id, itemId);
            message.success('Строка удалена');
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка удаления');
        }
    };

    const handlePost = async () => {
        setPosting(true);
        try {
            await postShipment(id);
            message.success('Накладная проведена — остатки списаны');
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка проведения');
        } finally {
            setPosting(false);
        }
    };

    const handleUnpost = async () => {
        setUnposting(true);
        try {
            await unpostShipment(id);
            message.success('Проведение отменено');
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка отмены проведения');
        } finally {
            setUnposting(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteShipment(id);
            message.success('Накладная удалена');
            navigate('/warehouse/shipments');
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка удаления');
            setDeleting(false);
        }
    };

    const handleSaveHeader = async (data) => {
        try {
            await updateShipment(id, data);
            message.success('Накладная обновлена');
            setHeaderOpen(false);
            fetchShipment();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка сохранения');
            throw err;
        }
    };

    const handleSendDraftToDiadoc = useCallback(async () => {
        setSendingToDiadoc(true);
        try {
            const response = await createDiadocOutboundDocumentFromShipment(id, {
                send_mode: 'draft',
            });
            const payload = response.data || {};
            setDiadocDocs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
            message.success(
                `Черновик отправлен в Диадок: #${payload.id || '—'}`
            );
            loadDiadocDocs();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отправить отгрузку в Диадок'
            );
        } finally {
            setSendingToDiadoc(false);
        }
    }, [id, loadDiadocDocs]);

    const handleSendFormalizedToDiadoc = useCallback(async () => {
        setSendingFormalizedToDiadoc(true);
        try {
            const response = await createDiadocOutboundDocumentFromShipment(id, {
                send_mode: 'draft',
                document_format: 'formalized_utd',
            });
            const payload = response.data || {};
            setDiadocDocs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
            message.success(
                `Формализованный УПД отправлен в Диадок: #${payload.id || '—'}`
            );
            loadDiadocDocs();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отправить формализованный УПД в Диадок'
            );
        } finally {
            setSendingFormalizedToDiadoc(false);
        }
    }, [id, loadDiadocDocs]);

    const openSignedSendModal = useCallback((format) => {
        setSignatureFormat(format);
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
            const response = await createDiadocOutboundDocumentFromShipment(id, {
                send_mode: 'send',
                document_format: signatureFormat,
                signature_base64: values.signature_base64,
            });
            const payload = response.data || {};
            setDiadocDocs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
            message.success(
                `${
                    signatureFormat === 'formalized_utd'
                        ? 'Формализованный УПД'
                        : 'Документ'
                } отправлен в Диадок: #${payload.id || '—'}`
            );
            setSignatureOpen(false);
            loadDiadocDocs();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отправить документ в Диадок'
            );
        } finally {
            setSendingSignedToDiadoc(false);
        }
    }, [id, loadDiadocDocs, signatureFormat, signatureForm]);

    const itemColumns = [
        {
            title: '№',
            key: 'idx',
            width: 50,
            render: (_, __, i) => i + 1,
        },
        {
            title: 'Запчасть',
            dataIndex: 'autopart_oem',
            render: (oem, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{oem}</Text>
                    {row.autopart_name && (
                        <Text type="secondary" style={{ fontSize: 12 }}>{row.autopart_name}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 80,
            align: 'right',
            render: (q) => <Tag color="volcano">{q}</Tag>,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 110,
            align: 'right',
            render: fmtPrice,
        },
        {
            title: 'Сумма',
            width: 120,
            align: 'right',
            render: (_, row) =>
                row.price != null
                    ? (Number(row.price) * row.quantity).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
                    : '—',
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Резерв',
            dataIndex: 'reserve_id',
            width: 90,
            render: (v) =>
                v ? (
                    <Tag icon={<LockOutlined />} color="processing">#{v}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Примечание',
            dataIndex: 'notes',
            ellipsis: true,
        },
        ...(isDraft
            ? [
                {
                    title: '',
                    key: 'actions',
                    width: 90,
                    render: (_, row) => (
                        <Space>
                            <Tooltip title="Редактировать">
                                <Button
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => { setEditItem(row); setEditOpen(true); }}
                                />
                            </Tooltip>
                            <Popconfirm
                                title="Удалить строку?"
                                okText="Да"
                                cancelText="Нет"
                                onConfirm={() => handleDeleteItem(row.id)}
                            >
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </Space>
                    ),
                },
              ]
            : []),
    ];

    if (loading) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!shipment) {
        return (
            <div style={{ padding: 24 }}>
                <Alert type="error" message="Накладная не найдена" />
            </div>
        );
    }

    const items = shipment.items || [];
    const totalQty   = items.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalSum   = items.reduce((acc, it) => acc + (it.price ? Number(it.price) * it.quantity : 0), 0);

    return (
        <div style={{ padding: 24 }}>
            {/* Header */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Space>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate('/warehouse/shipments')}
                        >
                            Назад
                        </Button>
                        <Title level={4} style={{ margin: 0 }}>
                            Накладная {shipment.doc_number || `#${shipment.id}`}
                        </Title>
                        <Tag color={STATUS_COLORS[shipment.status] || 'default'} style={{ fontSize: 14 }}>
                            {STATUS_LABELS[shipment.status] || shipment.status}
                        </Tag>
                    </Space>
                </Col>
                <Col>
                    <Space>
                        {isDraft && (
                            <>
                                <Button
                                    icon={<EditOutlined />}
                                    onClick={() => setHeaderOpen(true)}
                                >
                                    Редактировать
                                </Button>
                                <Popconfirm
                                    title="Провести накладную? Остатки будут списаны и резервы отпущены."
                                    okText="Провести"
                                    cancelText="Отмена"
                                    onConfirm={handlePost}
                                >
                                    <Button
                                        type="primary"
                                        icon={<CheckOutlined />}
                                        loading={posting}
                                        disabled={!items.length}
                                    >
                                        Провести
                                    </Button>
                                </Popconfirm>
                                <Popconfirm
                                    title="Удалить накладную?"
                                    okText="Удалить"
                                    cancelText="Отмена"
                                    onConfirm={handleDelete}
                                >
                                    <Button danger icon={<DeleteOutlined />} loading={deleting}>
                                        Удалить
                                    </Button>
                                </Popconfirm>
                            </>
                        )}
                        {isPosted && (
                            <>
                                <Button
                                    icon={<RollbackOutlined />}
                                    onClick={() => navigate(
                                        `/warehouse/returns?tab=customer&create=1&shipmentId=${shipment.id}${
                                            shipment.customer_id
                                                ? `&customerId=${shipment.customer_id}`
                                                : ''
                                        }`
                                    )}
                                >
                                    Возврат клиента
                                </Button>
                                {user?.role === 'admin' && (
                                    <Space>
                                        <Button
                                            icon={<SendOutlined />}
                                            loading={sendingToDiadoc}
                                            disabled={diadocReadinessLoading}
                                            onClick={handleSendDraftToDiadoc}
                                        >
                                            Черновик в Диадок
                                        </Button>
                                        <Tooltip
                                            title={
                                                diadocReadiness?.ready_nonformalized
                                                    ? 'Отправить документ в Диадок сразу с подписью'
                                                    : 'Сначала закройте обязательные требования в блоке готовности к Диадоку'
                                            }
                                        >
                                            <Button
                                                type="primary"
                                                icon={<SendOutlined />}
                                                disabled={!diadocReadiness?.ready_nonformalized}
                                                onClick={() => openSignedSendModal('nonformalized')}
                                            >
                                                Отправить с подписью
                                            </Button>
                                        </Tooltip>
                                        <Tooltip
                                            title={
                                                diadocReadiness?.ready_formalized
                                                    ? 'Сформировать формализованный УПД и отправить его в Диадок как черновик'
                                                    : 'Сначала закройте обязательные требования в блоке готовности к Диадоку'
                                            }
                                        >
                                            <Button
                                                icon={<SendOutlined />}
                                                loading={sendingFormalizedToDiadoc}
                                                disabled={!diadocReadiness?.ready_formalized}
                                                onClick={handleSendFormalizedToDiadoc}
                                            >
                                                Формализованный УПД
                                            </Button>
                                        </Tooltip>
                                        <Tooltip
                                            title={
                                                diadocReadiness?.ready_formalized
                                                    ? 'Подписать и отправить формализованный УПД'
                                                    : 'Формализованный УПД пока не готов к отправке'
                                            }
                                        >
                                            <Button
                                                type="primary"
                                                icon={<SendOutlined />}
                                                disabled={!diadocReadiness?.ready_formalized}
                                                onClick={() => openSignedSendModal('formalized_utd')}
                                            >
                                                УПД с подписью
                                            </Button>
                                        </Tooltip>
                                    </Space>
                                )}
                                <Popconfirm
                                    title="Отменить проведение? Движения будут сторнированы."
                                    okText="Отменить проведение"
                                    cancelText="Нет"
                                    onConfirm={handleUnpost}
                                >
                                    <Button
                                        icon={<RollbackOutlined />}
                                        loading={unposting}
                                    >
                                        Отменить проведение
                                    </Button>
                                </Popconfirm>
                            </>
                        )}
                    </Space>
                </Col>
            </Row>

            {/* Info card */}
            <Card style={{ marginBottom: 16 }}>
                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
                    <Descriptions.Item label="Номер документа">
                        {shipment.doc_number || <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Дата документа">
                        {fmtDate(shipment.doc_date)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Статус">
                        <Tag color={STATUS_COLORS[shipment.status]}>{STATUS_LABELS[shipment.status]}</Tag>
                    </Descriptions.Item>
                    {canUseDiadoc && (
                        <Descriptions.Item label="Диадок">
                            {latestDiadocDoc ? (
                                <Space size={[4, 4]} wrap>
                                    <Tag color={DIADOC_COLORS[latestDiadocDoc.status] || 'default'}>
                                        {DIADOC_LABELS[latestDiadocDoc.status] || latestDiadocDoc.status}
                                    </Tag>
                                    <Button
                                        type="link"
                                        size="small"
                                        onClick={() => navigate(`/documents/diadoc?tab=outbound&outgoingId=${latestDiadocDoc.id}`)}
                                    >
                                        Документ #{latestDiadocDoc.id}
                                    </Button>
                                </Space>
                            ) : (
                                <Text type="secondary">
                                    {diadocLoading ? 'Загрузка...' : 'Пока не отправляли'}
                                </Text>
                            )}
                        </Descriptions.Item>
                    )}
                    <Descriptions.Item label="Склад">
                        {shipment.warehouse_name || <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Клиент">
                        {shipment.customer_name || <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Заказ клиента">
                        {shipment.customer_order_id
                            ? <Tag>#{shipment.customer_order_id}</Tag>
                            : <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Причина">
                        {shipment.reason || <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    {isPosted && (
                        <Descriptions.Item label="Проведён">
                            {fmtDate(shipment.posted_at)}
                        </Descriptions.Item>
                    )}
                    <Descriptions.Item label="Создан">
                        {fmtDate(shipment.created_at)}
                    </Descriptions.Item>
                    {shipment.notes && (
                        <Descriptions.Item label="Примечание" span={3}>
                            {shipment.notes}
                        </Descriptions.Item>
                    )}
                </Descriptions>
            </Card>

            {canUseDiadoc && (
                <Card
                    title="Готовность к Диадоку"
                    style={{ marginBottom: 16 }}
                    loading={diadocReadinessLoading}
                >
                    {diadocReadiness ? (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Space wrap>
                                <Tag color={diadocReadiness.ready_nonformalized ? 'success' : 'default'}>
                                    {diadocReadiness.ready_nonformalized
                                        ? 'Можно отправлять как черновик'
                                        : 'Черновик пока не готов'}
                                </Tag>
                                <Tag color={diadocReadiness.ready_formalized ? 'success' : 'warning'}>
                                    {diadocReadiness.ready_formalized
                                        ? 'Готово к формализованному УПД'
                                        : 'До формализованного УПД не хватает реквизитов'}
                                </Tag>
                            </Space>

                            {diadocReadiness.missing_required_fields?.length > 0 && (
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
                            )}

                            {diadocReadiness.warnings?.length > 0 && (
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
                            )}

                            <Space wrap>
                                {diadocReadiness.customer_id && (
                                    <Button onClick={() => navigate(`/customers/${diadocReadiness.customer_id}/edit`)}>
                                        Открыть клиента
                                    </Button>
                                )}
                                <Button onClick={() => navigate('/documents/diadoc')}>
                                    Открыть настройки Диадока
                                </Button>
                            </Space>
                        </Space>
                    ) : (
                        <Text type="secondary">Пока не удалось оценить готовность к отправке.</Text>
                    )}
                </Card>
            )}

            {/* Items */}
            <Card
                title={
                    <Space>
                        <span>Строки накладной</span>
                        <Tag>{items.length} строк</Tag>
                        <Tag color="volcano">Итого: {totalQty} шт.</Tag>
                        {totalSum > 0 && (
                            <Tag color="gold">
                                Сумма: {totalSum.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.
                            </Tag>
                        )}
                    </Space>
                }
                extra={
                    isDraft && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => setAddOpen(true)}
                        >
                            Добавить строку
                        </Button>
                    )
                }
            >
                {isCancelled && (
                    <Alert
                        type="warning"
                        message="Накладная отменена"
                        style={{ marginBottom: 12 }}
                        showIcon
                    />
                )}
                {isPosted && (
                    <Alert
                        type="success"
                        message="Накладная проведена. Остатки списаны."
                        style={{ marginBottom: 12 }}
                        showIcon
                    />
                )}
                <Table
                    rowKey="id"
                    columns={itemColumns}
                    dataSource={items}
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                    summary={() =>
                        items.length > 0 ? (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={2}>
                                    <Text strong>Итого</Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right">
                                    <Text strong>{totalQty}</Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={3} />
                                <Table.Summary.Cell index={4} align="right">
                                    <Text strong>
                                        {totalSum > 0
                                            ? totalSum.toLocaleString('ru-RU', { minimumFractionDigits: 2 })
                                            : '—'}
                                    </Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={5} colSpan={isDraft ? 4 : 3} />
                            </Table.Summary.Row>
                        ) : null
                    }
                />
            </Card>

            {/* Modals */}
            <AddItemModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdd={handleAddItem}
                shipmentId={id}
            />
            <EditItemModal
                open={editOpen}
                item={editItem}
                onClose={() => { setEditOpen(false); setEditItem(null); }}
                onSave={handleEditItem}
            />
            <EditHeaderModal
                open={headerOpen}
                shipment={shipment}
                onClose={() => setHeaderOpen(false)}
                onSave={handleSaveHeader}
            />
            <Modal
                open={signatureOpen}
                title={
                    signatureFormat === 'formalized_utd'
                        ? 'Подписать и отправить формализованный УПД'
                        : 'Подписать и отправить документ'
                }
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
                            <Tag color={signatureFormat === 'formalized_utd' ? 'success' : 'blue'}>
                                {signatureFormat === 'formalized_utd'
                                    ? 'Формализованный УПД'
                                    : 'Nonformalized'}
                            </Tag>
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
        </div>
    );
};

export default ShipmentDetailPage;
