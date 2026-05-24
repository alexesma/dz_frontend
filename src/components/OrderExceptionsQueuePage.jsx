import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Input,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getTrackingExceptionsQueue } from '../api/orderTracking';

const { Title, Text } = Typography;

const SEVERITY_OPTIONS = [
    { value: 'critical', label: 'Критичные' },
    { value: 'warning', label: 'Предупреждения' },
    { value: 'info', label: 'Инфо' },
];

const severityColor = {
    critical: 'red',
    warning: 'orange',
    info: 'blue',
};

const formatMoney = (value) => {
    if (value == null) {
        return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));
};

const formatSupplierBadge = (supplier) => {
    if (!supplier?.provider_name) {
        return '—';
    }
    const bits = [supplier.provider_name];
    if (supplier.current_price != null) {
        bits.push(`${formatMoney(supplier.current_price)} руб.`);
    }
    if (supplier.effective_lead_days != null) {
        bits.push(`${supplier.effective_lead_days} дн`);
    }
    return bits.join(' · ');
};

const SummaryStatCard = ({ title, value, color = '#0f172a' }) => (
    <div
        style={{
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            background: '#fff',
        }}
    >
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{title}</div>
        <div style={{ color, fontWeight: 800, fontSize: 20 }}>{value}</div>
    </div>
);

const OrderExceptionsQueuePage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [queue, setQueue] = useState(null);
    const [filters, setFilters] = useState({
        severity: undefined,
        q: '',
        limit: 200,
    });

    const fetchQueue = useCallback(async (nextFilters) => {
        const params = {
            severity: nextFilters?.severity || undefined,
            q: (nextFilters?.q || '').trim() || undefined,
            limit: nextFilters?.limit || 200,
        };
        setLoading(true);
        try {
            const { data } = await getTrackingExceptionsQueue(params);
            setQueue(data || null);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить очередь исключений');
            setQueue(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchQueue(filters);
    }, [fetchQueue, filters]);

    const rows = Array.isArray(queue?.rows) ? queue.rows : [];

    const columns = useMemo(
        () => [
            {
                title: 'Срочность',
                dataIndex: 'severity',
                width: 115,
                render: (value) => (
                    <Tag color={severityColor[value] || 'default'}>
                        {value === 'critical'
                            ? 'Критично'
                            : value === 'warning'
                                ? 'Внимание'
                                : 'Инфо'}
                    </Tag>
                ),
            },
            {
                title: 'Позиция',
                key: 'position',
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 700 }}>
                            {row.brand_name || '—'} {row.oem_number}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.autopart_name || '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Остаток / в пути',
                key: 'stock',
                width: 130,
                render: (_, row) => (
                    <div>
                        <div>{row.current_quantity} шт</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            в пути: {row.in_transit_qty} шт
                        </div>
                    </div>
                ),
            },
            {
                title: 'Покрытие',
                key: 'cover',
                width: 140,
                render: (_, row) => (
                    <div>
                        <div>
                            {row.estimated_days_left_30_days != null
                                ? `${row.estimated_days_left_30_days} дн`
                                : '—'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            расход: {row.average_daily_decrease_30_days != null
                                ? `${row.average_daily_decrease_30_days} шт/д`
                                : '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Дозаказ',
                key: 'restock',
                width: 130,
                render: (_, row) => (
                    <div>
                        <div>
                            {row.recommended_order_qty != null
                                ? `${row.recommended_order_qty} шт`
                                : '—'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            точка: {row.reorder_point != null ? row.reorder_point : '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Лучший по цене',
                key: 'bestPrice',
                width: 220,
                render: (_, row) => (
                    <span>{formatSupplierBadge(row.best_supplier_by_price)}</span>
                ),
            },
            {
                title: 'Лучший по сроку',
                key: 'bestLead',
                width: 220,
                render: (_, row) => (
                    <span>{formatSupplierBadge(row.best_supplier_by_lead_time)}</span>
                ),
            },
            {
                title: 'Причины',
                dataIndex: 'exception_titles',
                width: 260,
                render: (items) => (
                    <Space wrap size={[4, 4]}>
                        {(items || []).map((item) => (
                            <Tag key={item}>{item}</Tag>
                        ))}
                    </Space>
                ),
            },
            {
                title: 'Действие',
                key: 'actions',
                width: 140,
                fixed: 'right',
                render: (_, row) => (
                    <Button
                        type="primary"
                        size="small"
                        onClick={() => {
                            const params = new URLSearchParams({
                                oem: row.oem_number || '',
                                auto: '1',
                            });
                            if (row.brand_name) {
                                params.set('brand', row.brand_name);
                            }
                            navigate(`/autoparts/offers?${params.toString()}`);
                        }}
                    >
                        Открыть
                    </Button>
                ),
            },
        ],
        [navigate]
    );

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <Title level={3} style={{ marginBottom: 0 }}>
                        Очередь исключений
                    </Title>
                    <Text type="secondary">
                        Рабочий список по нашему прайсу: позиции с риском дефицита,
                        низким покрытием и потребностью в дозаказе. Отсюда удобно
                        проваливаться в поиск по позиции и создавать черновик закупки.
                    </Text>
                    {queue ? (
                        <>
                            <br />
                            <Text type="secondary">
                                Источник: {queue.provider_name}
                                {queue.provider_config_name ? ` · ${queue.provider_config_name}` : ''}
                            </Text>
                        </>
                    ) : null}
                </div>

                <Space wrap>
                    <Input
                        allowClear
                        value={filters.q}
                        onChange={(e) =>
                            setFilters((prev) => ({ ...prev, q: e.target.value }))
                        }
                        prefix={<SearchOutlined />}
                        placeholder="OEM / бренд / название / поставщик"
                        style={{ width: 320 }}
                    />
                    <Select
                        allowClear
                        value={filters.severity}
                        onChange={(value) =>
                            setFilters((prev) => ({ ...prev, severity: value }))
                        }
                        placeholder="Срочность"
                        style={{ width: 180 }}
                        options={SEVERITY_OPTIONS}
                    />
                    <Select
                        value={filters.limit}
                        onChange={(value) =>
                            setFilters((prev) => ({ ...prev, limit: value }))
                        }
                        style={{ width: 120 }}
                        options={[
                            { value: 100, label: '100' },
                            { value: 200, label: '200' },
                            { value: 500, label: '500' },
                        ]}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => fetchQueue(filters)}
                    >
                        Обновить
                    </Button>
                </Space>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: 8,
                    }}
                >
                    <SummaryStatCard
                        title="Всего в очереди"
                        value={queue?.total_items ?? 0}
                    />
                    <SummaryStatCard
                        title="Критичных"
                        value={queue?.critical_count ?? 0}
                        color="#b91c1c"
                    />
                    <SummaryStatCard
                        title="Предупреждений"
                        value={queue?.warning_count ?? 0}
                        color="#b45309"
                    />
                    <SummaryStatCard
                        title="Инфо"
                        value={queue?.info_count ?? 0}
                        color="#1d4ed8"
                    />
                </div>

                <Table
                    rowKey={(row) => `${row.oem_number}:${row.autopart_id || 'na'}`}
                    columns={columns}
                    dataSource={rows}
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 25, showSizeChanger: false }}
                    scroll={{ x: 1450 }}
                />
            </Space>
        </Card>
    );
};

export default OrderExceptionsQueuePage;
