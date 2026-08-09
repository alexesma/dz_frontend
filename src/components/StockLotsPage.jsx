import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Timeline,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    FilterOutlined,
    HistoryOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    getStockLotRoleHistory,
    listStockLots,
    updateStockLotRole,
} from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations } from '../api/storage';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_COLORS = {
    receipt:              'blue',
    transfer:             'cyan',
    manual:               'green',
    opening_balance:      'default',
    inventory_correction: 'orange',
    customer_return:      'geekblue',
};

const SOURCE_LABELS = {
    receipt:              'Поступление',
    transfer:             'Перемещение',
    manual:               'Ручное',
    opening_balance:      'Нач. остаток',
    inventory_correction: 'Инв. корр.',
    customer_return:      'Возврат клиента',
};

const ROLE_COLORS = {
    original_good:       'blue',
    dragonzap_material:  'orange',
    dragonzap_finished:  'green',
};

const ROLE_LABELS = {
    original_good:       'Обычный товар',
    dragonzap_material:  'Материал для DragonZap',
    dragonzap_finished:  'Готовый товар DragonZap',
};

const ROLE_SOURCE_LABELS = {
    system_default:  'Автоматически',
    legacy_migration: 'Перенос старых данных',
    manual:          'Вручную',
    provider_policy: 'Правило поставщика',
    item_rule:       'Правило позиции',
    production:      'Выпуск',
    customer_return: 'Возврат клиента',
};

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');
const fmtQty  = (remaining, initial) => {
    const pct = initial > 0 ? Math.round((remaining / initial) * 100) : 0;
    const color = pct === 0 ? 'default' : pct < 30 ? 'warning' : 'success';
    return (
        <Space size={4}>
            <Tag color={color}>{remaining}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>/ {initial}</Text>
        </Space>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const StockLotsPage = () => {
    const { user } = useAuth();
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [total, setTotal]         = useState(0);
    const [page, setPage]           = useState(1);
    const [pageSize, setPageSize]   = useState(100);
    const [filters, setFilters]     = useState({ only_active: true });
    const [filterForm]               = Form.useForm();
    const [apOptions, setApOptions] = useState([]);
    const [locOptions, setLocOptions] = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const searchTimer                    = useRef(null);
    const [roleForm] = Form.useForm();
    const [roleModal, setRoleModal] = useState(null);
    const [roleHistory, setRoleHistory] = useState([]);
    const [roleHistoryLoading, setRoleHistoryLoading] = useState(false);
    const [roleSaving, setRoleSaving] = useState(false);

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
                offset: (pg - 1) * ps,
                limit:  ps,
                ...Object.fromEntries(
                    Object.entries(flt).filter(([, v]) => v !== undefined && v !== null && v !== '')
                ),
            };
            const res = await listStockLots(params);
            const payload = res.data;
            setData(Array.isArray(payload) ? payload : (payload.items || []));
            setTotal(Array.isArray(payload) ? payload.length : (payload.total || 0));
        } catch {
            message.error('Ошибка загрузки партий');
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
            autopart_id:          vals.autopart_id || undefined,
            storage_location_id:  vals.storage_location_id || undefined,
            gtd_number:           vals.gtd_number || undefined,
            inventory_role:       vals.inventory_role || undefined,
            only_active:          vals.only_active !== false,
        };
        setFilters(newFilters);
        setPage(1);
        fetchData(1, pageSize, newFilters);
    };

    const openRoleModal = async (row) => {
        setRoleModal(row);
        setRoleHistory([]);
        roleForm.setFieldsValue({
            inventory_role: row.inventory_role,
            reason: '',
        });
        setRoleHistoryLoading(true);
        try {
            const response = await getStockLotRoleHistory(row.id);
            setRoleHistory(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить историю роли');
        } finally {
            setRoleHistoryLoading(false);
        }
    };

    const saveRole = async () => {
        if (!roleModal) return;
        try {
            const values = await roleForm.validateFields();
            setRoleSaving(true);
            await updateStockLotRole(roleModal.id, values);
            message.success('Роль партии изменена');
            setRoleModal(null);
            await fetchData();
        } catch (error) {
            if (error?.errorFields) return;
            message.error(error?.response?.data?.detail || 'Не удалось изменить роль партии');
        } finally {
            setRoleSaving(false);
        }
    };

    const resetFilters = () => {
        filterForm.resetFields();
        filterForm.setFieldsValue({ only_active: true });
        const init = { only_active: true };
        setFilters(init);
        setPage(1);
        fetchData(1, pageSize, init);
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60 },
        {
            title: 'Источник',
            dataIndex: 'source_type',
            width: 130,
            render: (v) => (
                <Tag color={SOURCE_COLORS[v] || 'default'}>{SOURCE_LABELS[v] || v}</Tag>
            ),
        },
        {
            title: 'Роль партии',
            dataIndex: 'inventory_role',
            width: 190,
            render: (value, row) => (
                <Tooltip
                    title={[
                        ROLE_SOURCE_LABELS[row.role_source] || row.role_source,
                        row.role_change_reason,
                    ].filter(Boolean).join(': ')}
                >
                    <Tag color={ROLE_COLORS[value] || 'default'}>
                        {ROLE_LABELS[value] || value}
                    </Tag>
                </Tooltip>
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
            title: 'Бренд',
            dataIndex: 'autopart_brand',
            width: 110,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Остаток / Нач.',
            width: 130,
            render: (_, row) => fmtQty(row.remaining_quantity, row.initial_quantity),
        },
        {
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'ГТД',
            dataIndex: 'gtd_number',
            width: 160,
            render: (v) =>
                v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Страна',
            dataIndex: 'country_name',
            width: 100,
            render: (v, row) =>
                v || row.country_code ? (
                    <Tooltip title={row.country_code}>
                        <Text>{v || row.country_code}</Text>
                    </Tooltip>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Дата прихода',
            dataIndex: 'received_at',
            width: 140,
            render: fmtDate,
            sorter: true,
        },
        {
            title: 'Создан',
            dataIndex: 'created_at',
            width: 140,
            render: fmtDate,
        },
        {
            title: '',
            key: 'actions',
            width: 52,
            fixed: 'right',
            render: (_, row) => user?.role === 'admin' ? (
                <Tooltip title="Изменить роль и посмотреть историю">
                    <Button
                        type="text"
                        icon={<HistoryOutlined />}
                        onClick={() => openRoleModal(row)}
                    />
                </Tooltip>
            ) : null,
        },
    ];

    const activeLots = data.filter((r) => r.remaining_quantity > 0).length;

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={4} style={{ margin: 0 }}>
                        Партии товаров (ГТД / FIFO)
                    </Title>
                    <Text type="secondary">
                        Активных лотов: {activeLots} из {data.length}
                    </Text>
                </Col>
                <Col>
                    <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
                        Обновить
                    </Button>
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
                <Form form={filterForm} layout="inline" initialValues={{ only_active: true }}>
                    <Form.Item name="autopart_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            filterOption={false}
                            onSearch={handleApSearch}
                            loading={searchingAp}
                            placeholder="Запчасть"
                            style={{ width: 240 }}
                            notFoundContent={searchingAp ? <Spin size="small" /> : null}
                            options={apOptions}
                        />
                    </Form.Item>
                    <Form.Item name="storage_location_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Ячейка"
                            style={{ width: 200 }}
                            filterOption={(input, opt) =>
                                opt.label.toLowerCase().includes(input.toLowerCase())
                            }
                            options={locOptions}
                        />
                    </Form.Item>
                    <Form.Item name="gtd_number" style={{ marginBottom: 4 }}>
                        <Input placeholder="ГТД номер" style={{ width: 180 }} allowClear />
                    </Form.Item>
                    <Form.Item name="inventory_role" style={{ marginBottom: 4 }}>
                        <Select
                            allowClear
                            placeholder="Роль партии"
                            style={{ width: 220 }}
                            options={Object.entries(ROLE_LABELS).map(([value, label]) => ({
                                value,
                                label,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item name="only_active" label="Только активные" style={{ marginBottom: 4 }}>
                        <Select style={{ width: 120 }}>
                            <Option value={true}>Да</Option>
                            <Option value={false}>Все</Option>
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
                rowClassName={(row) => row.remaining_quantity === 0 ? 'opacity-50' : ''}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: ['50', '100', '200'],
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchData(p, ps, filters);
                    },
                }}
                scroll={{ x: 1200 }}
            />

            <Modal
                title={roleModal ? `Роль партии №${roleModal.id}` : 'Роль партии'}
                open={Boolean(roleModal)}
                onCancel={() => setRoleModal(null)}
                onOk={saveRole}
                okText="Сохранить изменение"
                cancelText="Отмена"
                confirmLoading={roleSaving}
                width={720}
            >
                {roleModal && (
                    <>
                        <Space direction="vertical" size={2} style={{ marginBottom: 16 }}>
                            <Text strong>
                                {roleModal.autopart_brand} {roleModal.autopart_oem}
                            </Text>
                            <Text type="secondary">{roleModal.autopart_name || 'Без наименования'}</Text>
                            <Text type="secondary">
                                Остаток: {roleModal.remaining_quantity} из {roleModal.initial_quantity}
                            </Text>
                        </Space>
                        <Form form={roleForm} layout="vertical">
                            <Form.Item
                                name="inventory_role"
                                label="Новая роль"
                                rules={[{ required: true, message: 'Выберите роль партии' }]}
                            >
                                <Select
                                    options={Object.entries(ROLE_LABELS).map(([value, label]) => ({
                                        value,
                                        label,
                                    }))}
                                />
                            </Form.Item>
                            <Form.Item
                                name="reason"
                                label="Причина изменения"
                                rules={[
                                    { required: true, message: 'Укажите причину изменения' },
                                    { min: 3, message: 'Минимум 3 символа' },
                                ]}
                            >
                                <Input.TextArea
                                    rows={3}
                                    maxLength={1000}
                                    showCount
                                    placeholder="Например: партия получена как материал для переупаковки DragonZap"
                                />
                            </Form.Item>
                        </Form>
                        <Title level={5}>История роли</Title>
                        <Spin spinning={roleHistoryLoading}>
                            {roleHistory.length ? (
                                <Timeline
                                    items={roleHistory.map((entry) => ({
                                        color: ROLE_COLORS[entry.new_role] || 'gray',
                                        children: (
                                            <Space direction="vertical" size={0}>
                                                <Text strong>{ROLE_LABELS[entry.new_role] || entry.new_role}</Text>
                                                <Text type="secondary">
                                                    {fmtDate(entry.changed_at)} · {entry.changed_by_name || ROLE_SOURCE_LABELS[entry.source] || 'Система'}
                                                </Text>
                                                {entry.reason && <Text>{entry.reason}</Text>}
                                            </Space>
                                        ),
                                    }))}
                                />
                            ) : (
                                <Text type="secondary">История пока отсутствует</Text>
                            )}
                        </Spin>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default StockLotsPage;
