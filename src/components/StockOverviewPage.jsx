import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    Progress,
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
    FilterOutlined,
    ReloadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { getStockByLocation } from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations, getWarehouses } from '../api/storage';

const { Title, Text } = Typography;

// ── Helpers ───────────────────────────────────────────────────────────────────

const availColor = (available, total) => {
    if (total === 0) return 'default';
    const pct = available / total;
    if (pct === 0) return 'error';
    if (pct < 0.2) return 'warning';
    return 'success';
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const StockOverviewPage = () => {
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [total, setTotal]         = useState(0);
    const [page, setPage]           = useState(1);
    const [pageSize, setPageSize]   = useState(100);
    const [filters, setFilters]     = useState({});
    const [filterForm]               = Form.useForm();
    const [apOptions, setApOptions] = useState([]);
    const [locOptions, setLocOptions] = useState([]);
    const [warehouseOptions, setWarehouseOptions] = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const searchTimer                    = useRef(null);

    // Summary stats
    const totalItems     = data.length;
    const zeroStock      = data.filter((r) => r.quantity === 0).length;
    const totalReserved  = data.reduce((acc, r) => acc + (r.reserved || 0), 0);
    const totalAvailable = data.reduce((acc, r) => acc + (r.available ?? (r.quantity - (r.reserved || 0))), 0);

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
        getWarehouses({ limit: 200 })
            .then((res) =>
                setWarehouseOptions(
                    (res.data?.items || res.data || []).map((w) => ({
                        value: w.id,
                        label: w.name,
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
                ...Object.fromEntries(
                    Object.entries(flt).filter(([, v]) => v !== undefined && v !== null && v !== '')
                ),
            };
            const res = await getStockByLocation(params);
            const payload = res.data;
            setData(Array.isArray(payload) ? payload : (payload.items || []));
            setTotal(Array.isArray(payload) ? payload.length : (payload.total || 0));
        } catch {
            message.error('Ошибка загрузки остатков');
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
            autopart_id:         vals.autopart_id || undefined,
            storage_location_id: vals.storage_location_id || undefined,
            warehouse_id:        vals.warehouse_id || undefined,
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

    const columns = [
        {
            title: 'Запчасть (OEM)',
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
            title: 'Ячейка',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Склад',
            dataIndex: 'warehouse_name',
            width: 130,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Физически',
            dataIndex: 'quantity',
            width: 100,
            align: 'right',
            render: (q) => (
                <Tag color={q === 0 ? 'default' : 'blue'}>{q}</Tag>
            ),
            sorter: (a, b) => a.quantity - b.quantity,
        },
        {
            title: 'Резерв',
            dataIndex: 'reserved',
            width: 90,
            align: 'right',
            render: (r) =>
                r > 0 ? <Tag color="orange">{r}</Tag> : <Text type="secondary">0</Text>,
            sorter: (a, b) => (a.reserved || 0) - (b.reserved || 0),
        },
        {
            title: 'Доступно',
            width: 160,
            render: (_, row) => {
                const qty       = row.quantity || 0;
                const reserved  = row.reserved || 0;
                const available = row.available ?? (qty - reserved);
                const pct       = qty > 0 ? Math.round((available / qty) * 100) : 0;
                const color     = availColor(available, qty);
                return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space>
                            <Tag color={color}>{available}</Tag>
                            {available === 0 && qty > 0 && (
                                <Tooltip title="Всё зарезервировано">
                                    <WarningOutlined style={{ color: '#fa8c16' }} />
                                </Tooltip>
                            )}
                        </Space>
                        {qty > 0 && (
                            <Progress
                                percent={pct}
                                size="small"
                                strokeColor={color === 'error' ? '#ff4d4f' : color === 'warning' ? '#fa8c16' : '#52c41a'}
                                showInfo={false}
                                style={{ width: 100 }}
                            />
                        )}
                    </Space>
                );
            },
            sorter: (a, b) => {
                const aA = a.available ?? (a.quantity - (a.reserved || 0));
                const bA = b.available ?? (b.quantity - (b.reserved || 0));
                return aA - bA;
            },
        },
        {
            title: 'Обновлён',
            dataIndex: 'updated_at',
            width: 120,
            render: (v) => v ? new Date(v).toLocaleDateString('ru-RU') : '—',
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={4} style={{ margin: 0 }}>Остатки на складе</Title>
                    <Text type="secondary">Физические / зарезервированные / доступные</Text>
                </Col>
                <Col>
                    <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
                        Обновить
                    </Button>
                </Col>
            </Row>

            {/* Summary cards */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic title="Позиций" value={totalItems} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Нулевых остатков"
                            value={zeroStock}
                            valueStyle={zeroStock > 0 ? { color: '#ff4d4f' } : undefined}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Всего зарезервировано"
                            value={totalReserved}
                            valueStyle={totalReserved > 0 ? { color: '#fa8c16' } : undefined}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Всего доступно"
                            value={totalAvailable}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
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
                <Form form={filterForm} layout="inline">
                    <Form.Item name="autopart_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            filterOption={false}
                            onSearch={handleApSearch}
                            loading={searchingAp}
                            placeholder="Запчасть"
                            style={{ width: 260 }}
                            notFoundContent={searchingAp ? <Spin size="small" /> : null}
                            options={apOptions}
                        />
                    </Form.Item>
                    <Form.Item name="warehouse_id" style={{ marginBottom: 4 }}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Склад"
                            style={{ width: 180 }}
                            options={warehouseOptions}
                            filterOption={(input, opt) =>
                                opt.label.toLowerCase().includes(input.toLowerCase())
                            }
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
                </Form>
            </Card>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                size="small"
                rowClassName={(row) => row.quantity === 0 ? 'ant-table-row-faint' : ''}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: ['50', '100', '200', '500'],
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchData(p, ps, filters);
                    },
                }}
                scroll={{ x: 1100 }}
            />
        </div>
    );
};

export default StockOverviewPage;
