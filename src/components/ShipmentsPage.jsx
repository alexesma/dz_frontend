import React, { useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    DeleteOutlined,
    ExportOutlined,
    EyeOutlined,
    FilterOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
    bulkSyncShipments,
    createShipment,
    deleteShipment,
    exportShipments,
    listShipments,
    syncShipment,
} from '../api/inventory';
import {
    getDiadocShipmentsOutboundReadiness,
    listDiadocOutboundDocuments,
} from '../api/diadoc';
import { getWarehouses } from '../api/storage';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = { draft: 'default', posted: 'success', cancelled: 'error' };
const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' };

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');

// ── CreateShipmentModal ───────────────────────────────────────────────────────

const CreateShipmentModal = ({ open, onClose, onCreated }) => {
    const [form]                         = Form.useForm();
    const [saving, setSaving]           = useState(false);
    const [warehouses, setWarehouses]   = useState([]);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
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
    }, [open, form]);

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setSaving(true);
        try {
            const res = await createShipment({
                doc_number:  values.doc_number  || null,
                warehouse_id: values.warehouse_id || null,
                reason:      values.reason       || null,
                notes:       values.notes        || null,
            });
            message.success('Накладная создана');
            onCreated(res.data.id);
            onClose();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка создания');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Новая накладная на отгрузку"
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Создать"
            cancelText="Отмена"
            confirmLoading={saving}
            width={520}
        >
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="doc_number" label="Номер документа">
                            <Input placeholder="Авто если пусто" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="warehouse_id" label="Склад">
                            <Select
                                allowClear
                                placeholder="Выберите склад"
                                options={warehouses}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="reason" label="Причина отгрузки">
                    <Input placeholder="Например: продажа клиенту" />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const SYNC_COLORS = { pending: 'warning', synced: 'success', error: 'error' };
const SYNC_LABELS = { pending: 'Ожидает', synced: 'Синхр.', error: 'Ошибка' };
const DIADOC_COLORS = { draft: 'default', sent: 'success', error: 'error' };
const DIADOC_LABELS = { draft: 'Черновик', sent: 'Отправлен', error: 'Ошибка' };

const ShipmentsPage = () => {
    const { user } = useAuth();
    const navigate                         = useNavigate();
    const [data, setData]                 = useState([]);
    const [loading, setLoading]           = useState(false);
    const [total, setTotal]               = useState(0);
    const [page, setPage]                 = useState(1);
    const [pageSize, setPageSize]         = useState(50);
    const [createOpen, setCreateOpen]     = useState(false);
    const [filters, setFilters]           = useState({});
    const [selectedRows, setSelectedRows] = useState([]);
    const [syncing, setSyncing]           = useState({});
    const [diadocByShipmentId, setDiadocByShipmentId] = useState({});
    const [diadocReadinessByShipmentId, setDiadocReadinessByShipmentId] = useState({});
    const [filterForm]               = Form.useForm();
    const canUseDiadoc = user?.role === 'admin';

    const loadDiadocStatuses = useCallback(async (shipmentRows = []) => {
        if (!canUseDiadoc) {
            setDiadocByShipmentId({});
            return;
        }
        const shipmentIds = new Set(
            (shipmentRows || [])
                .map((row) => Number(row?.id))
                .filter((value) => Number.isFinite(value))
        );
        if (!shipmentIds.size) {
            setDiadocByShipmentId({});
            return;
        }
        try {
            const response = await listDiadocOutboundDocuments({
                source_type: 'shipment_document',
                limit: 300,
            });
            const mapping = {};
            (response.data || []).forEach((doc) => {
                const shipmentId = Number(doc?.source_id);
                if (!shipmentIds.has(shipmentId) || mapping[shipmentId]) return;
                mapping[shipmentId] = doc;
            });
            setDiadocByShipmentId(mapping);
        } catch (err) {
            console.error('Failed to load Diadoc shipment statuses', err);
        }
    }, [canUseDiadoc]);

    const loadDiadocReadiness = useCallback(async (shipmentRows = []) => {
        if (!canUseDiadoc) {
            setDiadocReadinessByShipmentId({});
            return;
        }
        const shipmentIds = (shipmentRows || [])
            .map((row) => Number(row?.id))
            .filter((value) => Number.isFinite(value));
        if (!shipmentIds.length) {
            setDiadocReadinessByShipmentId({});
            return;
        }
        try {
            const response = await getDiadocShipmentsOutboundReadiness(shipmentIds);
            const mapping = {};
            (response.data || []).forEach((row) => {
                const shipmentId = Number(row?.shipment_id);
                if (!Number.isFinite(shipmentId)) return;
                mapping[shipmentId] = row;
            });
            setDiadocReadinessByShipmentId(mapping);
        } catch (err) {
            console.error('Failed to load Diadoc shipment readiness', err);
            setDiadocReadinessByShipmentId({});
        }
    }, [canUseDiadoc]);

    const fetchData = useCallback(async (pg = page, ps = pageSize, flt = filters) => {
        setLoading(true);
        try {
            const params = {
                skip:  (pg - 1) * ps,
                limit: ps,
                ...Object.fromEntries(
                    Object.entries(flt).filter(([, v]) => v !== undefined && v !== null && v !== '')
                ),
            };
            const res = await listShipments(params);
            const payload = res.data;
            const items = Array.isArray(payload) ? payload : (payload.items || []);
            setData(items);
            loadDiadocStatuses(items);
            loadDiadocReadiness(items);
            setTotal(Array.isArray(payload) ? payload.length : (payload.total || 0));
        } catch {
            message.error('Ошибка загрузки накладных');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filters, loadDiadocReadiness, loadDiadocStatuses]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const applyFilters = () => {
        const vals = filterForm.getFieldsValue();
        const newFilters = {
            status:     vals.status || undefined,
            doc_number: vals.doc_number || undefined,
        };
        setFilters(newFilters);
        setPage(1);
        fetchData(1, pageSize, newFilters);
    };

    const resetFilters = () => {
        filterForm.resetFields();
        setFilters({});
        setPage(1);
        fetchData(1, pageSize, {});
    };

    const handleDelete = async (id) => {
        try {
            await deleteShipment(id);
            message.success('Накладная удалена');
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка удаления');
        }
    };

    const handleCreated = (newId) => {
        navigate(`/warehouse/shipments/${newId}`);
    };

    const handleSyncOne = async (record) => {
        setSyncing((prev) => ({ ...prev, [record.id]: true }));
        try {
            await syncShipment(record.id, { sync_status: 'synced' });
            message.success('Статус синхронизации обновлён');
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSyncing((prev) => ({ ...prev, [record.id]: false }));
        }
    };

    const handleBulkSync = async () => {
        if (!selectedRows.length) { message.warning('Выберите строки'); return; }
        try {
            const res = await bulkSyncShipments({
                items: selectedRows.map((id) => ({ shipment_id: id, sync_status: 'synced' })),
            });
            message.success(`Обновлено: ${res.data.updated ?? selectedRows.length}`);
            setSelectedRows([]);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const handleExport1c = async () => {
        try {
            const res = await exportShipments({ sync_status: 'pending', limit: 500 });
            const items = res.data?.items || res.data || [];
            const json = JSON.stringify(items, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `shipments_export_${dayjs().format('YYYYMMDD_HHmm')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            message.success(`Экспортировано: ${items.length} накладных`);
        } catch {
            message.error('Ошибка экспорта');
        }
    };

    const columns = [
        {
            title: 'Номер',
            dataIndex: 'doc_number',
            width: 130,
            render: (num, row) => (
                <Button type="link" size="small" onClick={() => navigate(`/warehouse/shipments/${row.id}`)}>
                    {num || `#${row.id}`}
                </Button>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 110,
            render: (s) => (
                <Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_LABELS[s] || s}</Tag>
            ),
        },
        {
            title: 'Дата документа',
            dataIndex: 'doc_date',
            width: 140,
            render: fmtDate,
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Заказ клиента',
            dataIndex: 'customer_order_id',
            width: 120,
            render: (v) => v ? <Tag>#{v}</Tag> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Склад',
            dataIndex: 'warehouse_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Строк',
            dataIndex: 'item_count',
            width: 70,
            align: 'right',
            render: (v) => <Tag>{v ?? '—'}</Tag>,
        },
        {
            title: 'Причина',
            dataIndex: 'reason',
            ellipsis: true,
            render: (v) => v || '',
        },
        {
            title: 'Проведён',
            dataIndex: 'posted_at',
            width: 140,
            render: fmtDate,
        },
        {
            title: '1С',
            dataIndex: 'sync_status',
            width: 110,
            render: (status, row) => (
                <Space size={4}>
                    <Badge status={SYNC_COLORS[status] || 'default'} />
                    <Text style={{ fontSize: 12 }}>{SYNC_LABELS[status] || status}</Text>
                    {status !== 'synced' && (
                        <Tooltip title="Отметить синхронизованным">
                            <Button
                                type="link"
                                size="small"
                                loading={syncing[row.id]}
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleSyncOne(row)}
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        ...(canUseDiadoc ? [{
            title: 'Диадок',
            key: 'diadoc',
            width: 150,
            render: (_, row) => {
                const diadocDoc = diadocByShipmentId[row.id];
                const readiness = diadocReadinessByShipmentId[row.id];
                const readinessTag = readiness ? (
                    readiness.ready_formalized ? (
                        <Tag color="success">УПД готов</Tag>
                    ) : readiness.ready_nonformalized ? (
                        <Tag color="gold">Только черновик</Tag>
                    ) : (
                        <Tag color="default">Не готов</Tag>
                    )
                ) : null;
                if (!diadocDoc) {
                    return readinessTag || <Text type="secondary">—</Text>;
                }
                return (
                    <Space direction="vertical" size={0}>
                        {readinessTag}
                        <Tag color={DIADOC_COLORS[diadocDoc.status] || 'default'}>
                            {DIADOC_LABELS[diadocDoc.status] || diadocDoc.status}
                        </Tag>
                        <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => navigate(`/documents/diadoc?tab=outbound&outgoingId=${diadocDoc.id}`)}
                        >
                            Документ #{diadocDoc.id}
                        </Button>
                    </Space>
                );
            },
        }] : []),
        {
            title: '',
            key: 'actions',
            width: 100,
            render: (_, row) => (
                <Space>
                    <Tooltip title="Открыть">
                        <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/warehouse/shipments/${row.id}`)}
                        />
                    </Tooltip>
                    {row.status === 'draft' && (
                        <Popconfirm
                            title="Удалить накладную?"
                            okText="Да"
                            cancelText="Нет"
                            onConfirm={() => handleDelete(row.id)}
                        >
                            <Tooltip title="Удалить">
                                <Button size="small" icon={<DeleteOutlined />} danger />
                            </Tooltip>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const draftCount   = data.filter((r) => r.status === 'draft').length;
    const postedCount  = data.filter((r) => r.status === 'posted').length;
    const pendingSync  = data.filter((r) => r.sync_status === 'pending').length;
    const readinessRows = Object.values(diadocReadinessByShipmentId || {});
    const formalizedReadyCount = readinessRows.filter((row) => row?.ready_formalized).length;
    const draftOnlyCount = readinessRows.filter(
        (row) => row?.ready_nonformalized && !row?.ready_formalized
    ).length;
    const notReadyCount = readinessRows.filter(
        (row) => !row?.ready_nonformalized && !row?.ready_formalized
    ).length;

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={4} style={{ margin: 0 }}>
                        Накладные на отгрузку
                        {pendingSync > 0 && (
                            <Badge count={pendingSync} style={{ marginLeft: 8 }} />
                        )}
                    </Title>
                    <Space style={{ marginTop: 4 }}>
                        <Tag>Черновиков: {draftCount}</Tag>
                        <Tag color="success">Проведено: {postedCount}</Tag>
                    </Space>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>Обновить</Button>
                        <Button icon={<ExportOutlined />} onClick={handleExport1c}>Экспорт 1С</Button>
                        {selectedRows.length > 0 && (
                            <Button icon={<CheckCircleOutlined />} onClick={handleBulkSync}>
                                Синхр. ({selectedRows.length})
                            </Button>
                        )}
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Новая накладная
                        </Button>
                    </Space>
                </Col>
            </Row>

            {canUseDiadoc && (
                <Card
                    size="small"
                    title="Массовая диагностика Диадока"
                    style={{ marginBottom: 16 }}
                    loading={loading}
                >
                    <Space wrap>
                        <Tag color="success">
                            УПД готово: {formalizedReadyCount}
                        </Tag>
                        <Tag color="gold">
                            Только черновик: {draftOnlyCount}
                        </Tag>
                        <Tag color="default">
                            Не готово: {notReadyCount}
                        </Tag>
                        <Text type="secondary">
                            Диагностика считается по текущей выборке накладных на странице.
                        </Text>
                    </Space>
                </Card>
            )}

            {/* Filters */}
            <Card
                size="small"
                style={{ marginBottom: 16 }}
                title="Фильтры"
                extra={
                    <Space>
                        <Button size="small" type="primary" icon={<FilterOutlined />} onClick={applyFilters}>
                            Применить
                        </Button>
                        <Button size="small" onClick={resetFilters}>Сбросить</Button>
                    </Space>
                }
            >
                <Form form={filterForm} layout="inline">
                    <Form.Item name="status" style={{ marginBottom: 4 }}>
                        <Select allowClear placeholder="Статус" style={{ width: 140 }}>
                            <Option value="draft">Черновик</Option>
                            <Option value="posted">Проведён</Option>
                            <Option value="cancelled">Отменён</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="doc_number" style={{ marginBottom: 4 }}>
                        <Input placeholder="Номер документа" style={{ width: 180 }} allowClear />
                    </Form.Item>
                </Form>
            </Card>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                size="small"
                rowSelection={{
                    selectedRowKeys: selectedRows,
                    onChange: setSelectedRows,
                    getCheckboxProps: (r) => ({ disabled: r.sync_status === 'synced' }),
                }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: ['25', '50', '100'],
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchData(p, ps, filters);
                    },
                }}
                scroll={{ x: 1200 }}
                onRow={(row) => ({
                    onDoubleClick: () => navigate(`/warehouse/shipments/${row.id}`),
                    style: { cursor: 'pointer' },
                })}
            />

            <CreateShipmentModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={handleCreated}
            />
        </div>
    );
};

export default ShipmentsPage;
