import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Descriptions,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    FilterOutlined,
    LockOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    UnlockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    bulkCancelReserves,
    cancelReserve,
    createReserve,
    getAvailableStock,
    listReserves,
} from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations } from '../api/storage';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
    active:    'processing',
    released:  'success',
    cancelled: 'error',
    expired:   'default',
};

const STATUS_LABELS = {
    active:    'Активен',
    released:  'Отпущен',
    cancelled: 'Отменён',
    expired:   'Истёк',
};

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');

// ── AvailableStockModal ───────────────────────────────────────────────────────

const AvailableStockModal = ({ open, onClose }) => {
    const [apOptions, setApOptions]     = useState([]);
    const [locOptions, setLocOptions]   = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const [loading, setLoading]         = useState(false);
    const [result, setResult]           = useState(null);
    const searchTimer                    = useRef(null);
    const [form]                         = Form.useForm();

    useEffect(() => {
        if (!open) { setResult(null); return; }
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

    const handleCheck = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }
        setLoading(true);
        try {
            const params = {
                autopart_id:  values.autopart_id,
                location_id:  values.location_id || undefined,
            };
            const res = await getAvailableStock(params);
            setResult(res.data);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка проверки');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            title={<><SearchOutlined /> Проверить доступные остатки</>}
            onCancel={onClose}
            footer={null}
            width={480}
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
                <Form.Item name="location_id" label="Ячейка (опционально)">
                    <Select
                        showSearch
                        allowClear
                        placeholder="Все ячейки"
                        filterOption={(input, opt) =>
                            opt.label.toLowerCase().includes(input.toLowerCase())
                        }
                        options={locOptions}
                    />
                </Form.Item>
                <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleCheck} block>
                    Проверить
                </Button>
            </Form>

            {result && (
                <Card style={{ marginTop: 16 }} size="small">
                    <Row gutter={16}>
                        <Col span={8}>
                            <Statistic title="Физически" value={result.physical ?? result.total ?? 0} />
                        </Col>
                        <Col span={8}>
                            <Statistic
                                title="Зарезервировано"
                                value={result.reserved ?? 0}
                                valueStyle={{ color: '#fa8c16' }}
                            />
                        </Col>
                        <Col span={8}>
                            <Statistic
                                title="Доступно"
                                value={result.available ?? 0}
                                valueStyle={{ color: result.available > 0 ? '#52c41a' : '#ff4d4f' }}
                            />
                        </Col>
                    </Row>
                </Card>
            )}
        </Modal>
    );
};

// ── CreateReserveModal ────────────────────────────────────────────────────────

const CreateReserveModal = ({ open, onClose, onCreated }) => {
    const [form]             = Form.useForm();
    const [apOptions, setApOptions]     = useState([]);
    const [locOptions, setLocOptions]   = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const [saving, setSaving]           = useState(false);
    const searchTimer                    = useRef(null);

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
            await createReserve({
                autopart_id:          values.autopart_id,
                storage_location_id:  values.storage_location_id || null,
                quantity:             values.quantity,
                notes:                values.notes || null,
                expires_at:           values.expires_at
                    ? values.expires_at.toISOString()
                    : null,
            });
            message.success('Резерв создан');
            onCreated();
            onClose();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Ошибка создания резерва');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={<><LockOutlined /> Создать резерв</>}
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Создать"
            cancelText="Отмена"
            confirmLoading={saving}
            width={520}
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
                            name="quantity"
                            label="Количество"
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
                                placeholder="Любая ячейка"
                                filterOption={(input, opt) =>
                                    opt.label.toLowerCase().includes(input.toLowerCase())
                                }
                                options={locOptions}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="expires_at" label="Дата истечения">
                            <Input type="datetime-local" />
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const ReservesPage = () => {
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [total, setTotal]         = useState(0);
    const [page, setPage]           = useState(1);
    const [pageSize, setPageSize]   = useState(50);
    const [selectedRows, setSelectedRows] = useState([]);
    const [createOpen, setCreateOpen]     = useState(false);
    const [checkOpen, setCheckOpen]       = useState(false);
    const [filters, setFilters]     = useState({ status: 'active' });
    const [filterForm]               = Form.useForm();

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
            const res = await listReserves(params);
            const payload = res.data;
            setData(Array.isArray(payload) ? payload : (payload.items || []));
            setTotal(Array.isArray(payload) ? payload.length : (payload.total || 0));
        } catch {
            message.error('Ошибка загрузки резервов');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filters]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const applyFilters = () => {
        const vals = filterForm.getFieldsValue();
        const newFilters = {
            status:     vals.status || undefined,
            autopart_id: vals.autopart_id || undefined,
        };
        setFilters(newFilters);
        setPage(1);
        fetchData(1, pageSize, newFilters);
    };

    const resetFilters = () => {
        filterForm.resetFields();
        filterForm.setFieldsValue({ status: 'active' });
        const init = { status: 'active' };
        setFilters(init);
        setPage(1);
        fetchData(1, pageSize, init);
    };

    const handleCancel = async (id) => {
        try {
            await cancelReserve(id);
            message.success('Резерв отменён');
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const handleBulkCancel = async () => {
        if (!selectedRows.length) { message.warning('Выберите строки'); return; }
        try {
            await bulkCancelReserves({ reserve_ids: selectedRows });
            message.success(`Отменено: ${selectedRows.length}`);
            setSelectedRows([]);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60 },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 110,
            render: (s) => (
                <Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_LABELS[s] || s}</Tag>
            ),
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
            render: (q) => <Tag color="processing">{q}</Tag>,
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Создан',
            dataIndex: 'created_at',
            width: 135,
            render: fmtDate,
        },
        {
            title: 'Истекает',
            dataIndex: 'expires_at',
            width: 135,
            render: (v) => {
                if (!v) return <Text type="secondary">—</Text>;
                const isExpired = dayjs(v).isBefore(dayjs());
                return (
                    <Text type={isExpired ? 'danger' : undefined}>
                        {fmtDate(v)}
                    </Text>
                );
            },
        },
        {
            title: 'Заказ клиента',
            dataIndex: 'customer_order_item_id',
            width: 120,
            render: (v) => v ? <Tag>#{v}</Tag> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Примечание',
            dataIndex: 'notes',
            ellipsis: true,
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_, row) =>
                row.status === 'active' ? (
                    <Popconfirm
                        title="Отменить резерв?"
                        okText="Да"
                        cancelText="Нет"
                        onConfirm={() => handleCancel(row.id)}
                    >
                        <Button
                            size="small"
                            type="text"
                            danger
                            icon={<UnlockOutlined />}
                        >
                            Отменить
                        </Button>
                    </Popconfirm>
                ) : null,
        },
    ];

    const activeCount = data.filter((r) => r.status === 'active').length;

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={4} style={{ margin: 0 }}>
                        Резервы
                        {activeCount > 0 && (
                            <Badge count={activeCount} style={{ marginLeft: 8, backgroundColor: '#1677ff' }} />
                        )}
                    </Title>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>Обновить</Button>
                        <Button
                            icon={<SearchOutlined />}
                            onClick={() => setCheckOpen(true)}
                        >
                            Проверить остатки
                        </Button>
                        {selectedRows.length > 0 && (
                            <Popconfirm
                                title={`Отменить выбранные резервы (${selectedRows.length})?`}
                                okText="Да"
                                cancelText="Нет"
                                onConfirm={handleBulkCancel}
                            >
                                <Button danger icon={<CloseCircleOutlined />}>
                                    Отменить выбранные ({selectedRows.length})
                                </Button>
                            </Popconfirm>
                        )}
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Создать резерв
                        </Button>
                    </Space>
                </Col>
            </Row>

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
                <Form form={filterForm} layout="inline" initialValues={{ status: 'active' }}>
                    <Form.Item name="status" style={{ marginBottom: 4 }}>
                        <Select allowClear placeholder="Статус" style={{ width: 150 }}>
                            <Option value="active">Активные</Option>
                            <Option value="released">Отпущенные</Option>
                            <Option value="cancelled">Отменённые</Option>
                            <Option value="expired">Истёкшие</Option>
                        </Select>
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
                    getCheckboxProps: (r) => ({ disabled: r.status !== 'active' }),
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
                scroll={{ x: 1100 }}
            />

            <CreateReserveModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => fetchData()}
            />
            <AvailableStockModal
                open={checkOpen}
                onClose={() => setCheckOpen(false)}
            />
        </div>
    );
};

export default ReservesPage;
