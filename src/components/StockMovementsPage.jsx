import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Badge,
    Button,
    Card,
    Col,
    DatePicker,
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
    ArrowDownOutlined,
    ArrowUpOutlined,
    CheckCircleOutlined,
    ExportOutlined,
    FilterOutlined,
    PlusOutlined,
    ReloadOutlined,
    SwapOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    bulkSyncMovements,
    createStockMovement,
    exportMovements,
    listStockMovements,
    syncMovement,
} from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations } from '../api/storage';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
    { value: 'receipt',     label: 'Поступление',   color: 'success',   icon: <ArrowDownOutlined /> },
    { value: 'writeoff',    label: 'Списание',       color: 'error',     icon: <ArrowUpOutlined style={{ transform: 'rotate(180deg)' }} /> },
    { value: 'customer_return', label: 'Возврат от клиента', color: 'geekblue', icon: <ArrowDownOutlined /> },
    { value: 'supplier_return', label: 'Возврат поставщику', color: 'magenta', icon: <ArrowUpOutlined style={{ transform: 'rotate(180deg)' }} /> },
    { value: 'transfer',    label: 'Перемещение',    color: 'processing',icon: <SwapOutlined /> },
    { value: 'adjustment',  label: 'Корректировка',  color: 'warning',   icon: <SyncOutlined /> },
    { value: 'reservation', label: 'Резервирование', color: 'default',   icon: <CheckCircleOutlined /> },
    { value: 'shipment',    label: 'Отгрузка',       color: 'volcano',   icon: <ExportOutlined /> },
];

const TYPE_MAP = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t]));

const SYNC_COLORS = { pending: 'warning', synced: 'success', error: 'error' };
const SYNC_LABELS = { pending: 'Ожидает', synced: 'Синхр.', error: 'Ошибка' };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');
const fmtQty  = (q, type) => {
    const meta = TYPE_MAP[type];
    const color = meta?.color || 'default';
    const sign  = ['receipt', 'customer_return'].includes(type)
        ? '+'
        : ['writeoff', 'shipment', 'supplier_return'].includes(type)
            ? '−'
            : '';
    return <Tag color={color}>{sign}{q}</Tag>;
};

// ── CreateMovementModal ───────────────────────────────────────────────────────

const CreateMovementModal = ({ open, onClose, onCreated }) => {
    const [form]             = Form.useForm();
    const [apOptions, setApOptions]         = useState([]);
    const [locOptions, setLocOptions]       = useState([]);
    const [searchingAp, setSearchingAp]     = useState(false);
    const [saving, setSaving]               = useState(false);
    const searchTimer                        = useRef(null);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
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
        if (!q || q.length < 2) { setApOptions([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearchingAp(true);
            try {
                const res = await searchAutopartsByOem(q, 30);
                setApOptions(
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
            await createStockMovement({
                autopart_id:          values.autopart_id,
                storage_location_id:  values.storage_location_id || null,
                quantity:             values.quantity,
                movement_type:        values.movement_type,
                notes:                values.notes || null,
                external_id:          values.external_id || null,
            });
            message.success('Движение создано');
            onCreated();
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
            title="Создать складское движение"
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Создать"
            cancelText="Отмена"
            confirmLoading={saving}
            width={540}
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
                        loading={searchingAp}
                        placeholder="Введите OEM или название"
                        notFoundContent={searchingAp ? <Spin size="small" /> : 'Ничего не найдено'}
                        options={apOptions}
                    />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item
                            name="movement_type"
                            label="Тип движения"
                            rules={[{ required: true, message: 'Выберите тип' }]}
                        >
                            <Select placeholder="Тип">
                                {MOVEMENT_TYPES.map((t) => (
                                    <Option key={t.value} value={t.value}>
                                        <Tag color={t.color} style={{ marginRight: 6 }}>{t.label}</Tag>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="quantity"
                            label="Количество"
                            rules={[{ required: true, message: 'Укажите количество' }]}
                            initialValue={1}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="storage_location_id" label="Ячейка хранения">
                    <Select
                        showSearch
                        allowClear
                        placeholder="Выберите ячейку"
                        filterOption={(input, opt) =>
                            opt.label.toLowerCase().includes(input.toLowerCase())
                        }
                        options={locOptions}
                    />
                </Form.Item>
                <Form.Item name="external_id" label="Внешний ID (1С)">
                    <Input placeholder="Опционально" />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const StockMovementsPage = () => {
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [total, setTotal]         = useState(0);
    const [page, setPage]           = useState(1);
    const [pageSize, setPageSize]   = useState(50);
    const [selectedRows, setSelectedRows] = useState([]);
    const [createOpen, setCreateOpen]     = useState(false);
    const [syncing, setSyncing]     = useState({});

    const [filters, setFilters] = useState({
        movement_type: undefined,
        sync_status:   undefined,
        autopart_id:   undefined,
        location_id:   undefined,
        date_from:     undefined,
        date_to:       undefined,
    });

    const [filterForm]           = Form.useForm();
    const [apOptions, setApOptions]     = useState([]);
    const [locOptions, setLocOptions]   = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const searchTimer                    = useRef(null);

    // load locations once
    useEffect(() => {
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
    }, []);

    const fetchData = useCallback(async (pg = page, ps = pageSize, flt = filters) => {
        setLoading(true);
        try {
            const params = {
                skip:  (pg - 1) * ps,
                limit: ps,
                ...Object.fromEntries(Object.entries(flt).filter(([, v]) => v !== undefined && v !== null && v !== '')),
            };
            const res = await listStockMovements(params);
            const payload = res.data;
            setData(Array.isArray(payload) ? payload : (payload.items || []));
            setTotal(Array.isArray(payload) ? payload.length : (payload.total || 0));
        } catch {
            message.error('Ошибка загрузки движений');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filters]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleApSearch = (q) => {
        clearTimeout(searchTimer.current);
        if (!q || q.length < 2) { setApOptions([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearchingAp(true);
            try {
                const res = await searchAutopartsByOem(q, 30);
                setApOptions(
                    (res.data || []).map((ap) => ({
                        value: ap.id,
                        label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
                    }))
                );
            } catch { /* ignore */ }
            finally { setSearchingAp(false); }
        }, 300);
    };

    const applyFilters = () => {
        const vals = filterForm.getFieldsValue();
        const newFilters = {
            movement_type: vals.movement_type || undefined,
            sync_status:   vals.sync_status || undefined,
            autopart_id:   vals.autopart_id || undefined,
            location_id:   vals.location_id || undefined,
            date_from:     vals.date_range?.[0]?.toISOString() || undefined,
            date_to:       vals.date_range?.[1]?.toISOString() || undefined,
        };
        setFilters(newFilters);
        setPage(1);
        fetchData(1, pageSize, newFilters);
    };

    const resetFilters = () => {
        filterForm.resetFields();
        const empty = {};
        setFilters(empty);
        setPage(1);
        fetchData(1, pageSize, empty);
    };

    const handleSyncOne = async (record) => {
        setSyncing((prev) => ({ ...prev, [record.id]: true }));
        try {
            await syncMovement(record.id, { sync_status: 'synced' });
            message.success('Статус обновлён');
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
            const res = await bulkSyncMovements({
                items: selectedRows.map((id) => ({ movement_id: id, sync_status: 'synced' })),
            });
            message.success(`Обновлено: ${res.data.updated ?? selectedRows.length}`);
            setSelectedRows([]);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const handleExport = async () => {
        try {
            const res = await exportMovements({
                sync_status: 'pending',
                limit: 500,
                ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
            });
            const exportData = res.data?.items || res.data || [];
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `movements_export_${dayjs().format('YYYYMMDD_HHmm')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            message.success(`Экспортировано: ${exportData.length} строк`);
        } catch {
            message.error('Ошибка экспорта');
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 60,
        },
        {
            title: 'Дата',
            dataIndex: 'created_at',
            width: 140,
            render: fmtDate,
        },
        {
            title: 'Тип',
            dataIndex: 'movement_type',
            width: 140,
            render: (type) => {
                const meta = TYPE_MAP[type];
                return meta ? <Tag color={meta.color}>{meta.icon} {meta.label}</Tag> : type;
            },
        },
        {
            title: 'Запчасть',
            dataIndex: 'autopart_oem',
            render: (oem, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{oem}</Text>
                    {row.autopart_brand && <Text type="secondary" style={{ fontSize: 12 }}>{row.autopart_brand}</Text>}
                </Space>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 90,
            align: 'right',
            render: (q, row) => fmtQty(q, row.movement_type),
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Склад',
            dataIndex: 'warehouse_name',
            width: 120,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Документ',
            dataIndex: 'reference_type',
            width: 130,
            render: (rt, row) =>
                rt ? (
                    <Tooltip title={`ID: ${row.reference_id}`}>
                        <Tag>{rt}</Tag>
                    </Tooltip>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: '1С',
            dataIndex: 'sync_status',
            width: 100,
            render: (status, row) => (
                <Space size={4}>
                    <Badge status={SYNC_COLORS[status] || 'default'} />
                    <Text style={{ fontSize: 12 }}>{SYNC_LABELS[status] || status}</Text>
                    {status !== 'synced' && (
                        <Tooltip title="Отметить как синхронизировано">
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
        {
            title: 'Примечание',
            dataIndex: 'notes',
            ellipsis: true,
            render: (v) => v || '',
        },
    ];

    const pendingCount = data.filter((r) => r.sync_status === 'pending').length;

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={4} style={{ margin: 0 }}>
                        Складские движения
                        {pendingCount > 0 && (
                            <Badge count={pendingCount} style={{ marginLeft: 8 }} />
                        )}
                    </Title>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>Обновить</Button>
                        <Button icon={<ExportOutlined />} onClick={handleExport}>Экспорт 1С</Button>
                        {selectedRows.length > 0 && (
                            <Button
                                type="default"
                                icon={<CheckCircleOutlined />}
                                onClick={handleBulkSync}
                            >
                                Синхр. выбранные ({selectedRows.length})
                            </Button>
                        )}
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Создать движение
                        </Button>
                    </Space>
                </Col>
            </Row>

            {/* Filters */}
            <Card
                size="small"
                style={{ marginBottom: 16 }}
                extra={
                    <Space>
                        <Button size="small" icon={<FilterOutlined />} type="primary" onClick={applyFilters}>
                            Применить
                        </Button>
                        <Button size="small" onClick={resetFilters}>Сбросить</Button>
                    </Space>
                }
                title="Фильтры"
            >
                <Form form={filterForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Form.Item name="movement_type" style={{ marginBottom: 4 }}>
                        <Select allowClear placeholder="Тип движения" style={{ width: 160 }}>
                            {MOVEMENT_TYPES.map((t) => (
                                <Option key={t.value} value={t.value}>{t.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="sync_status" style={{ marginBottom: 4 }}>
                        <Select allowClear placeholder="Статус 1С" style={{ width: 140 }}>
                            <Option value="pending">Ожидает</Option>
                            <Option value="synced">Синхр.</Option>
                            <Option value="error">Ошибка</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="autopart_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            filterOption={false}
                            onSearch={handleApSearch}
                            loading={searchingAp}
                            placeholder="Запчасть"
                            style={{ width: 220 }}
                            notFoundContent={searchingAp ? <Spin size="small" /> : null}
                            options={apOptions}
                        />
                    </Form.Item>
                    <Form.Item name="location_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Ячейка"
                            style={{ width: 180 }}
                            filterOption={(input, opt) =>
                                opt.label.toLowerCase().includes(input.toLowerCase())
                            }
                            options={locOptions}
                        />
                    </Form.Item>
                    <Form.Item name="date_range" style={{ marginBottom: 4 }}>
                        <RangePicker
                            showTime
                            format="DD.MM.YYYY HH:mm"
                            placeholder={['Дата от', 'Дата до']}
                        />
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
                    pageSizeOptions: ['25', '50', '100', '200'],
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchData(p, ps, filters);
                    },
                }}
                scroll={{ x: 1200 }}
            />

            <CreateMovementModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => fetchData()}
            />
        </div>
    );
};

export default StockMovementsPage;
