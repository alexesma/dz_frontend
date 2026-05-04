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
    message,
} from 'antd';
import {
    ArrowLeftOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    RollbackOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';

import {
    addDocumentItem,
    deleteDocumentItem,
    deleteStockDocument,
    getStockDocument,
    postStockDocument,
    unpostStockDocument,
    updateStockDocument,
} from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations } from '../api/storage';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ── Label maps ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS = {
    manual_receipt:  'Оприходование',
    manual_writeoff: 'Списание',
};

const STATUS_LABELS  = { draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' };
const STATUS_COLORS  = { draft: 'default',  posted: 'success',  cancelled: 'error' };

// ── AddItemModal ──────────────────────────────────────────────────────────────

const AddItemModal = ({ open, onClose, onAdd, docType }) => {
    const [form] = Form.useForm();
    const [autopartOptions, setAutopartOptions] = useState([]);
    const [locationOptions, setLocationOptions] = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const [saving, setSaving] = useState(false);
    const searchTimer = useRef(null);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        getStorageLocations({ limit: 500 })
            .then((res) => {
                setLocationOptions(
                    (res.data?.items || res.data || []).map((l) => ({
                        value: l.id,
                        label: `${l.name}${l.warehouse_name ? ` (${l.warehouse_name})` : ''}`,
                    }))
                );
            })
            .catch(() => {});
    }, [open, form]);

    const handleApSearch = (q) => {
        clearTimeout(searchTimer.current);
        if (!q || q.length < 2) { setAutopartOptions([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearchingAp(true);
            try {
                const res = await searchAutopartsByOem(q, 30);
                setAutopartOptions(
                    (res.data || []).map((ap) => ({
                        value: ap.id,
                        label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
                    }))
                );
            } catch { /* ignore */ }
            finally { setSearchingAp(false); }
        }, 300);
    };

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try {
            await onAdd({
                autopart_id:         values.autopart_id,
                storage_location_id: values.storage_location_id || null,
                quantity:            values.quantity,
                gtd_number:          values.gtd_number || null,
                country_code:        values.country_code || null,
                country_name:        values.country_name || null,
                notes:               values.notes || null,
            });
            form.resetFields();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={`Добавить строку — ${DOC_TYPE_LABELS[docType] || ''}`}
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
                    label="Артикул / запчасть"
                    rules={[{ required: true, message: 'Выберите запчасть' }]}
                >
                    <Select
                        showSearch
                        filterOption={false}
                        onSearch={handleApSearch}
                        loading={searchingAp}
                        placeholder="Введите OEM-номер или название"
                        notFoundContent={searchingAp ? <Spin size="small" /> : 'Ничего не найдено'}
                        options={autopartOptions}
                    />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="quantity" label="Количество"
                            rules={[{ required: true, message: 'Укажите количество' }]}
                            initialValue={1}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="storage_location_id" label="Ячейка хранения">
                            <Select
                                showSearch
                                allowClear
                                placeholder="Выберите ячейку"
                                filterOption={(input, opt) =>
                                    opt.label.toLowerCase().includes(input.toLowerCase())
                                }
                                options={locationOptions}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                {docType === 'manual_receipt' && (
                    <>
                        <Divider orientation="left" plain style={{ margin: '8px 0' }}>
                            ГТД (необязательно)
                        </Divider>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="gtd_number" label="Номер ГТД">
                                    <Input placeholder="10130/010124/0000001" />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="country_code" label="Код страны">
                                    <Input placeholder="CN" maxLength={4} />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="country_name" label="Страна">
                                    <Input placeholder="Китай" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </>
                )}
                <Form.Item name="notes" label="Примечание">
                    <Input placeholder="Необязательное примечание к строке" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── EditHeaderModal ───────────────────────────────────────────────────────────

const EditHeaderModal = ({ open, doc, onClose, onSave }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && doc) {
            form.setFieldsValue({
                document_number: doc.document_number || '',
                reason:          doc.reason || '',
                notes:           doc.notes || '',
            });
        }
    }, [open, doc, form]);

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try { await onSave(values); }
        finally { setSaving(false); }
    };

    return (
        <Modal
            open={open}
            title="Редактировать документ"
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Сохранить"
            cancelText="Отмена"
            confirmLoading={saving}
        >
            <Form form={form} layout="vertical">
                <Form.Item name="document_number" label="Номер документа">
                    <Input placeholder="например, ОПР-2026-001" />
                </Form.Item>
                <Form.Item name="reason" label="Причина">
                    <Input placeholder="Возврат от клиента, брак, инвентаризация…" />
                </Form.Item>
                <Form.Item name="notes" label="Примечания">
                    <TextArea rows={3} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const StockDocumentDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);

    const fetchDoc = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getStockDocument(id);
            setDoc(res.data);
        } catch {
            message.error('Не удалось загрузить документ');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchDoc(); }, [fetchDoc]);

    const isDraft = doc?.status === 'draft';

    // ── Actions ─────────────────────────────────────────────────────────────

    const handlePost = async () => {
        setActionLoading(true);
        try {
            await postStockDocument(id);
            message.success('Документ проведён — остатки обновлены');
            fetchDoc();
        } catch (e) {
            message.error(e?.response?.data?.detail || 'Ошибка проведения');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnpost = async () => {
        setActionLoading(true);
        try {
            await unpostStockDocument(id);
            message.success('Документ распроведён');
            fetchDoc();
        } catch (e) {
            message.error(e?.response?.data?.detail || 'Ошибка распроведения');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            await deleteStockDocument(id);
            message.success('Документ удалён');
            navigate('/warehouse/stock-documents');
        } catch (e) {
            message.error(e?.response?.data?.detail || 'Ошибка удаления');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveHeader = async (values) => {
        try {
            await updateStockDocument(id, values);
            message.success('Сохранено');
            setEditModalOpen(false);
            fetchDoc();
        } catch {
            message.error('Ошибка сохранения');
        }
    };

    const handleAddItem = async (itemData) => {
        try {
            await addDocumentItem(id, itemData);
            message.success('Строка добавлена');
            setAddModalOpen(false);
            fetchDoc();
        } catch (e) {
            message.error(e?.response?.data?.detail || 'Ошибка добавления строки');
            throw e;  // keep modal open
        }
    };

    const handleDeleteItem = async (itemId) => {
        try {
            await deleteDocumentItem(id, itemId);
            message.success('Строка удалена');
            fetchDoc();
        } catch {
            message.error('Ошибка удаления строки');
        }
    };

    // ── Columns ──────────────────────────────────────────────────────────────

    const columns = [
        {
            title: '№',
            key: 'idx',
            width: 48,
            render: (_, __, i) => i + 1,
        },
        {
            title: 'Артикул',
            dataIndex: 'autopart_oem',
            width: 160,
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Название',
            dataIndex: 'autopart_name',
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'autopart_brand',
            width: 120,
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 90,
            align: 'right',
            render: (v) => <Text strong>{v}</Text>,
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 130,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'ГТД',
            dataIndex: 'gtd_number',
            width: 180,
            render: (v) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Страна',
            dataIndex: 'country_name',
            width: 100,
            render: (v, r) => v
                ? `${v}${r.country_code ? ` (${r.country_code})` : ''}`
                : <Text type="secondary">—</Text>,
        },
        {
            title: 'Лот',
            dataIndex: 'lot_id',
            width: 80,
            render: (v) => v
                ? <Tag color="blue">#{v}</Tag>
                : <Text type="secondary">—</Text>,
        },
        {
            title: 'Примечание',
            dataIndex: 'notes',
            ellipsis: true,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        isDraft && {
            title: '',
            key: 'actions',
            width: 60,
            render: (_, rec) => (
                <Popconfirm
                    title="Удалить строку?"
                    onConfirm={() => handleDeleteItem(rec.id)}
                    okText="Да"
                    cancelText="Нет"
                >
                    <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                    />
                </Popconfirm>
            ),
        },
    ].filter(Boolean);

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!doc) {
        return (
            <Alert
                type="error"
                message="Документ не найден"
                style={{ margin: 24 }}
            />
        );
    }

    const isReceipt  = doc.doc_type === 'manual_receipt';
    const typeColor  = isReceipt ? '#52c41a' : '#ff4d4f';
    const typeIcon   = isReceipt ? <ArrowUpOutlined /> : <ArrowDownOutlined />;

    return (
        <div style={{ padding: 24 }}>
            {/* Header nav */}
            <Button
                icon={<ArrowLeftOutlined />}
                type="link"
                style={{ paddingLeft: 0, marginBottom: 12 }}
                onClick={() => navigate('/warehouse/stock-documents')}
            >
                Все складские документы
            </Button>

            {/* Title row */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Space align="center">
                        <Tag
                            color={isReceipt ? 'green' : 'red'}
                            icon={typeIcon}
                            style={{ fontSize: 14, padding: '4px 10px' }}
                        >
                            {DOC_TYPE_LABELS[doc.doc_type]}
                        </Tag>
                        <Title level={4} style={{ margin: 0 }}>
                            {doc.document_number || `Документ #${doc.id}`}
                        </Title>
                        <Tag color={STATUS_COLORS[doc.status]}>
                            {STATUS_LABELS[doc.status]}
                        </Tag>
                    </Space>
                </Col>
                <Col>
                    <Space>
                        {isDraft && (
                            <>
                                <Button
                                    icon={<EditOutlined />}
                                    onClick={() => setEditModalOpen(true)}
                                >
                                    Редактировать
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<CheckOutlined />}
                                    loading={actionLoading}
                                    onClick={handlePost}
                                    style={{ background: typeColor, borderColor: typeColor }}
                                    disabled={!doc.items?.length}
                                >
                                    Провести
                                </Button>
                                <Popconfirm
                                    title="Удалить черновик?"
                                    description="Действие нельзя отменить"
                                    onConfirm={handleDelete}
                                    okText="Удалить"
                                    okButtonProps={{ danger: true }}
                                    cancelText="Отмена"
                                >
                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={actionLoading}
                                    >
                                        Удалить
                                    </Button>
                                </Popconfirm>
                            </>
                        )}
                        {doc.status === 'posted' && isReceipt && (
                            <Popconfirm
                                title="Распровести документ?"
                                description="Остатки и лоты будут отменены"
                                onConfirm={handleUnpost}
                                okText="Распровести"
                                okButtonProps={{ danger: true }}
                                cancelText="Отмена"
                            >
                                <Button
                                    icon={<RollbackOutlined />}
                                    loading={actionLoading}
                                    danger
                                >
                                    Распровести
                                </Button>
                            </Popconfirm>
                        )}
                    </Space>
                </Col>
            </Row>

            {/* Document header info */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Descriptions column={{ xs: 1, sm: 2, md: 3, lg: 4 }} size="small">
                    <Descriptions.Item label="Дата">
                        {dayjs(doc.document_date).format('DD.MM.YYYY HH:mm')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Склад">
                        {doc.warehouse_name || <Text type="secondary">Не указан</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Причина">
                        {doc.reason || <Text type="secondary">—</Text>}
                    </Descriptions.Item>
                    {doc.posted_at && (
                        <Descriptions.Item label="Проведён">
                            {dayjs(doc.posted_at).format('DD.MM.YYYY HH:mm')}
                        </Descriptions.Item>
                    )}
                    {doc.notes && (
                        <Descriptions.Item label="Примечания" span={4}>
                            {doc.notes}
                        </Descriptions.Item>
                    )}
                </Descriptions>
            </Card>

            {/* Items table */}
            <Card
                title={`Строки документа (${doc.items?.length || 0})`}
                extra={
                    isDraft && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => setAddModalOpen(true)}
                        >
                            Добавить строку
                        </Button>
                    )
                }
                bodyStyle={{ padding: 0 }}
            >
                <Table
                    rowKey="id"
                    dataSource={doc.items || []}
                    columns={columns}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: 'Строк нет. Добавьте товарные позиции.' }}
                />
            </Card>

            {/* Warn if posted writeoff - no unpost */}
            {doc.status === 'posted' && !isReceipt && (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginTop: 16 }}
                    message="Документ списания нельзя распровести автоматически"
                    description="Для корректировки создайте документ оприходования на нужное количество."
                />
            )}

            {/* Modals */}
            <AddItemModal
                open={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                onAdd={handleAddItem}
                docType={doc.doc_type}
            />
            <EditHeaderModal
                open={editModalOpen}
                doc={doc}
                onClose={() => setEditModalOpen(false)}
                onSave={handleSaveHeader}
            />
        </div>
    );
};

export default StockDocumentDetailPage;
