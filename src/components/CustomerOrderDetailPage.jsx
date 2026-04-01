import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Drawer,
    Empty,
    message,
    Select,
    Space,
    Table,
    Tabs,
    Tooltip,
    Tag,
    Typography,
} from 'antd';
import {
    BarChartOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getCustomerOrder,
    getCustomerOrderItemStats,
    processManualCustomerOrder,
    retryCustomerOrder,
    updateCustomerOrderItem,
} from '../api/customerOrders';
import { getCustomersSummary } from '../api/customers';
import { getProviders } from '../api/providers';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;

const ORDER_STATUS_LABELS = {
    NEW: 'Новый',
    PROCESSED: 'Обработан',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
};

const ITEM_STATUS_LABELS = {
    NEW: 'Новый',
    OWN_STOCK: 'Наш склад',
    SUPPLIER: 'Поставщик',
    REJECTED: 'Отказ',
};

const ITEM_STATUS_COLORS = {
    NEW: 'default',
    OWN_STOCK: 'blue',
    SUPPLIER: 'green',
    REJECTED: 'red',
};

const CustomerOrderDetailPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [updatingItems, setUpdatingItems] = useState({});
    const [processing, setProcessing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsMeta, setStatsMeta] = useState({ kind: 'oem', value: '', label: '' });
    const [statsData, setStatsData] = useState(null);
    const statsCacheRef = useRef(new Map());

    const customerMap = useMemo(() => {
        const map = {};
        (customers || []).forEach((customer) => {
            map[customer.id] = customer.name;
        });
        return map;
    }, [customers]);

    const providerOptions = useMemo(
        () =>
            (providers || []).map((provider) => ({
                value: provider.id,
                label: provider.name,
            })),
        [providers]
    );


    const fetchData = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const [orderResp, customersResp, providersResp] =
                await Promise.allSettled([
                    getCustomerOrder(orderId),
                    getCustomersSummary({ page: 1, page_size: 200 }),
                    getProviders({ page: 1, page_size: 100 }),
                ]);

            if (orderResp.status === 'fulfilled') {
                setOrder(orderResp.value.data || null);
            } else {
                setOrder(null);
                message.error('Не удалось загрузить заказ');
            }

            if (customersResp.status === 'fulfilled') {
                setCustomers(customersResp.value.data?.items || []);
            } else {
                setCustomers([]);
            }

            if (providersResp.status === 'fulfilled') {
                setProviders(providersResp.value.data?.items || []);
            } else {
                setProviders([]);
            }
        } catch {
            message.error('Не удалось загрузить заказ');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const setItemUpdating = (itemId, value) => {
        setUpdatingItems((prev) => ({
            ...prev,
            [itemId]: value,
        }));
    };

    const handleSetSupplier = async (item, supplierId) => {
        if (!supplierId) return;
        setItemUpdating(item.id, true);
        try {
            await updateCustomerOrderItem(item.id, {
                status: 'SUPPLIER',
                supplier_id: supplierId,
            });
            message.success('Поставщик назначен');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось обновить позицию';
            message.error(detail);
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const handleReject = async (item) => {
        setItemUpdating(item.id, true);
        try {
            await updateCustomerOrderItem(item.id, { status: 'REJECTED' });
            message.success('Позиция отказана');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось обновить позицию';
            message.error(detail);
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const handleOwnStock = async (item) => {
        setItemUpdating(item.id, true);
        try {
            await updateCustomerOrderItem(item.id, { status: 'OWN_STOCK' });
            message.success('Позиция отправлена на наш склад');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось обновить позицию';
            message.error(detail);
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const handleProcessOrder = async () => {
        if (!order) return;
        setProcessing(true);
        try {
            await processManualCustomerOrder(order.id);
            message.success('Заказ обработан');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось обработать заказ';
            message.error(detail);
        } finally {
            setProcessing(false);
        }
    };

    const handleRetryOrder = async () => {
        if (!order) return;
        setRetrying(true);
        try {
            await retryCustomerOrder(order.id);
            message.success('Заказ перепроверен');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось перепроверить заказ';
            message.error(detail);
        } finally {
            setRetrying(false);
        }
    };

    const formatDateTime = (value) => {
        if (!value) return '—';
        return dayjs(value).format('DD.MM.YYYY HH:mm');
    };

    const formatMoney = (value) => {
        if (value === null || value === undefined) return '—';
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        return num.toFixed(2);
    };

    const formatMonth = (value) => {
        if (!value) return '—';
        return dayjs(value).format('MM.YY');
    };

    const formatPriceChange = (value) => {
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        const prefix = num > 0 ? '+' : '';
        return `${prefix}${num.toFixed(1)}%`;
    };

    const openAutopartSearch = useCallback((item) => {
        const params = new URLSearchParams({
            oem: item.oem || '',
            brand: item.brand || '',
            auto: '1',
        });
        navigate(`/autoparts/offers?${params.toString()}`);
    }, [navigate]);

    const loadStats = useCallback(async (kind, value, label) => {
        const normalizedValue = String(value || '').trim();
        if (!normalizedValue || !order?.customer_id) {
            return;
        }
        const cacheKey = `${order.customer_id}:${kind}:${normalizedValue}`;
        setStatsMeta({ kind, value: normalizedValue, label });
        setStatsOpen(true);
        setStatsData(null);

        if (statsCacheRef.current.has(cacheKey)) {
            setStatsData(statsCacheRef.current.get(cacheKey));
            return;
        }

        setStatsLoading(true);
        try {
            const { data } = await getCustomerOrderItemStats({
                kind,
                value: normalizedValue,
                customer_id: order.customer_id,
                months: 12,
            });
            statsCacheRef.current.set(cacheKey, data);
            setStatsData(data);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось загрузить статистику';
            message.error(detail);
            setStatsOpen(false);
        } finally {
            setStatsLoading(false);
        }
    }, [order?.customer_id]);

    const summary = useMemo(() => {
        const orderItems = order?.items ?? [];
        let stockSum = 0;
        let supplierSum = 0;
        let rejectedSum = 0;
        orderItems.forEach((item) => {
            const price = Number(item.requested_price ?? item.matched_price ?? 0);
            const shipQty = Number(item.ship_qty ?? item.requested_qty ?? 0);
            const rejectQty = Number(item.reject_qty ?? 0);
            if (item.status === 'REJECTED') {
                const qty = rejectQty || Number(item.requested_qty ?? 0);
                rejectedSum += qty * price;
            } else if (item.status === 'OWN_STOCK') {
                stockSum += shipQty * price;
            } else if (item.status === 'SUPPLIER') {
                supplierSum += shipQty * price;
            }
        });
        const totalSum = stockSum + supplierSum + rejectedSum;
        const rejectedPct = totalSum > 0 ? (rejectedSum / totalSum) * 100 : 0;
        return {
            totalSum,
            stockSum,
            supplierSum,
            rejectedSum,
            rejectedPct,
        };
    }, [order?.items]);

    const rejectedItems = useMemo(
        () =>
            (order?.items || []).filter(
                (item) => Number(item.reject_qty ?? 0) > 0
            ),
        [order?.items]
    );

    const statsMonthlyColumns = useMemo(() => ([
        {
            title: 'Месяц',
            dataIndex: 'month',
            key: 'month',
            width: 90,
            render: formatMonth,
        },
        {
            title: 'Заказы',
            dataIndex: 'orders_count',
            key: 'orders_count',
            width: 80,
        },
        {
            title: 'Строки',
            dataIndex: 'rows_count',
            key: 'rows_count',
            width: 80,
        },
        {
            title: 'Запрошено',
            dataIndex: 'total_requested_qty',
            key: 'total_requested_qty',
            width: 100,
        },
        {
            title: 'Отгружено',
            dataIndex: 'total_ship_qty',
            key: 'total_ship_qty',
            width: 100,
        },
        {
            title: 'Ср. цена',
            dataIndex: 'avg_price',
            key: 'avg_price',
            width: 100,
            render: formatMoney,
        },
        {
            title: 'Мин / Макс',
            key: 'price_range',
            width: 140,
            render: (_, row) => (
                <span>{formatMoney(row.min_price)} / {formatMoney(row.max_price)}</span>
            ),
        },
    ]), []);

    const statsRecentColumns = useMemo(() => ([
        {
            title: 'Дата',
            dataIndex: 'received_at',
            key: 'received_at',
            width: 130,
            render: formatDateTime,
        },
        {
            title: 'Заказ',
            dataIndex: 'order_number',
            key: 'order_number',
            width: 120,
            render: (value, record) => value || `#${record.order_id}`,
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            key: 'customer_name',
            width: 160,
            render: (value, record) => value || customerMap[record.customer_id] || record.customer_id,
        },
        {
            title: 'Кол-во',
            dataIndex: 'requested_qty',
            key: 'requested_qty',
            width: 80,
        },
        {
            title: 'Цена',
            dataIndex: 'requested_price',
            key: 'requested_price',
            width: 90,
            render: formatMoney,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (value) => (
                <Tag color={ITEM_STATUS_COLORS[value] || 'default'}>
                    {ITEM_STATUS_LABELS[value] || value || '—'}
                </Tag>
            ),
        },
    ]), [customerMap]);

    const statsTabItems = useMemo(() => {
        if (!statsData) {
            return [];
        }
        const summaryCards = (summary) => ([
            { label: 'Заказы', value: summary.orders_count ?? 0 },
            { label: 'Строки', value: summary.rows_count ?? 0 },
            { label: 'Запрошено', value: summary.total_requested_qty ?? 0 },
            { label: 'Отгружено', value: summary.total_ship_qty ?? 0 },
            { label: 'Ср. цена', value: formatMoney(summary.avg_price) },
            { label: 'Последняя цена', value: formatMoney(summary.last_price) },
        ]);

        const renderStatsPane = (
            title,
            summary,
            monthly,
            recent,
            showCustomerColumn,
        ) => (
            <div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 8,
                        marginBottom: 12,
                    }}
                >
                    {summaryCards(summary).map((card) => (
                        <Card key={card.label} size="small" bodyStyle={{ padding: 10 }}>
                            <div style={{ color: '#6b7280', fontSize: 12 }}>
                                {card.label}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>
                                {card.value}
                            </div>
                        </Card>
                    ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">
                        Последнее изменение цены:{' '}
                    </Text>
                    <Text strong>{formatMoney(summary.previous_price)} → {formatMoney(summary.last_price)}</Text>
                    <Tag
                        color={
                            summary.price_change_pct == null
                                ? 'default'
                                : summary.price_change_pct > 0
                                    ? 'red'
                                    : summary.price_change_pct < 0
                                        ? 'green'
                                        : 'default'
                        }
                        style={{ marginLeft: 8 }}
                    >
                        {formatPriceChange(summary.price_change_pct)}
                    </Tag>
                </div>
                <Text type="secondary">{title}</Text>
                <Table
                    size="small"
                    pagination={false}
                    rowKey={(row) => row.month}
                    dataSource={monthly}
                    columns={statsMonthlyColumns}
                    scroll={{ x: 'max-content' }}
                    style={{ marginTop: 8, marginBottom: 12 }}
                />
                <Text type="secondary">Последние заказы</Text>
                <Table
                    size="small"
                    pagination={false}
                    rowKey={(row) => `${row.order_id}-${row.received_at}`}
                    dataSource={recent}
                    columns={
                        showCustomerColumn
                            ? statsRecentColumns
                            : statsRecentColumns.filter((col) => col.key !== 'customer_name')
                    }
                    locale={{ emptyText: <Empty description="Нет заказов за период" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    scroll={{ x: 'max-content' }}
                    style={{ marginTop: 8 }}
                />
            </div>
        );

        return [
            {
                key: 'customer',
                label: `Клиент${statsData.current_customer_name ? `: ${statsData.current_customer_name}` : ''}`,
                children: renderStatsPane(
                    'Помесячно по текущему клиенту',
                    statsData.current_customer_summary,
                    statsData.current_customer_monthly,
                    statsData.current_customer_recent,
                    false,
                ),
            },
            {
                key: 'all',
                label: 'Все клиенты',
                children: renderStatsPane(
                    'Помесячно по всем клиентам',
                    statsData.all_customers_summary,
                    statsData.all_customers_monthly,
                    statsData.all_customers_recent,
                    true,
                ),
            },
        ];
    }, [statsData, statsMonthlyColumns, statsRecentColumns]);

    const columns = [
        {
            title: 'OEM',
            dataIndex: 'oem',
            key: 'oem',
            width: 190,
            render: (value, record) => (
                <Space size={4}>
                    <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto' }}
                        onClick={() => openAutopartSearch(record)}
                    >
                        {value}
                    </Button>
                    <Tooltip title="Статистика по артикулу">
                        <Button
                            type="text"
                            size="small"
                            icon={<BarChartOutlined />}
                            onClick={() => loadStats('oem', value, value)}
                        />
                    </Tooltip>
                    <Tooltip title="Искать в прайсах и на сайте">
                        <Button
                            type="text"
                            size="small"
                            icon={<SearchOutlined />}
                            onClick={() => openAutopartSearch(record)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: 'Бренд',
            dataIndex: 'brand',
            key: 'brand',
            width: 180,
            render: (value) => (
                <Space size={4}>
                    <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto' }}
                        onClick={() => loadStats('brand', value, value)}
                    >
                        {value}
                    </Button>
                    <Tooltip title="Статистика по бренду">
                        <Button
                            type="text"
                            size="small"
                            icon={<BarChartOutlined />}
                            onClick={() => loadStats('brand', value, value)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'requested_qty',
            key: 'requested_qty',
            width: 90,
        },
        {
            title: 'Цена',
            dataIndex: 'requested_price',
            key: 'requested_price',
            width: 110,
            render: formatMoney,
        },
        {
            title: 'Отгрузка',
            dataIndex: 'ship_qty',
            key: 'ship_qty',
            width: 100,
            render: (value) => value ?? '—',
        },
        {
            title: 'Отказ',
            dataIndex: 'reject_qty',
            key: 'reject_qty',
            width: 90,
            render: (value) => value ?? '—',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (value) => (
                <Tag color={ITEM_STATUS_COLORS[value] || 'default'}>
                    {ITEM_STATUS_LABELS[value] || value || '—'}
                </Tag>
            ),
        },
        {
            title: 'Поставщик',
            dataIndex: 'supplier_id',
            key: 'supplier_id',
            width: 220,
            render: (value, record) => (
                <Select
                    showSearch
                    allowClear
                    placeholder="Выберите поставщика"
                    options={providerOptions}
                    value={value || undefined}
                    onChange={(val) => handleSetSupplier(record, val)}
                    optionFilterProp="label"
                    loading={!!updatingItems[record.id]}
                    style={{ width: '100%' }}
                />
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 220,
            render: (_, record) => (
                <div className="table-actions">
                    <Button
                        size="small"
                        onClick={() => handleOwnStock(record)}
                        loading={!!updatingItems[record.id]}
                    >
                        Наш склад
                    </Button>
                    <Button
                        danger
                        size="small"
                        onClick={() => handleReject(record)}
                        loading={!!updatingItems[record.id]}
                    >
                        Отказать
                    </Button>
                </div>
            ),
        },
    ];

    const rejectColumns = [
        {
            title: 'OEM',
            dataIndex: 'oem',
            key: 'oem',
            width: 140,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand',
            key: 'brand',
            width: 120,
        },
        {
            title: 'Запрошено',
            dataIndex: 'requested_qty',
            key: 'requested_qty',
            width: 100,
        },
        {
            title: 'Отгружено',
            dataIndex: 'ship_qty',
            key: 'ship_qty',
            width: 100,
            render: (value) => value ?? 0,
        },
        {
            title: 'Отказано',
            dataIndex: 'reject_qty',
            key: 'reject_qty',
            width: 100,
            render: (value) => value ?? 0,
        },
        {
            title: 'Причина',
            dataIndex: 'reject_reason_text',
            key: 'reject_reason_text',
            render: (value, record) =>
                value || (
                    record.status === 'REJECTED'
                        ? 'Причина не сохранена или заказ обработан до обновления.'
                        : 'Частичный отказ без сохраненной причины.'
                ),
        },
    ];

    return (
        <div className="page-shell">
            <Card loading={loading}>
                <div className="page-header-actions" style={{ marginBottom: 16 }}>
                    <Button onClick={() => navigate('/customer-orders')}>
                        Назад к списку
                    </Button>
                    {order?.status === 'NEW' && (
                        <Button
                            type="primary"
                            onClick={handleProcessOrder}
                            loading={processing}
                        >
                            Автообработать
                        </Button>
                    )}
                    {order?.status === 'ERROR' && (
                        <Button
                            type="primary"
                            onClick={handleRetryOrder}
                            loading={retrying}
                        >
                            Повторить обработку
                        </Button>
                    )}
                </div>
                <Title level={3}>Заказ клиента</Title>
                {order ? (
                    <>
                        <Descriptions
                            bordered
                            size="small"
                            column={{ xs: 1, sm: 1, md: 2 }}
                            style={{ marginBottom: 16 }}
                        >
                            <Descriptions.Item label="Дата">
                                {formatDateTime(order.received_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Статус">
                                {ORDER_STATUS_LABELS[order.status] || order.status}
                            </Descriptions.Item>
                            <Descriptions.Item label="Номер">
                                {order.order_number || order.id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Клиент">
                                {customerMap[order.customer_id] || order.customer_id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Сумма заказа">
                                {formatMoney(summary.totalSum)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Наш склад">
                                {formatMoney(summary.stockSum)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Поставщики">
                                {formatMoney(summary.supplierSum)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отказ, сумма">
                                {formatMoney(summary.rejectedSum)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отказ, %">
                                {summary.rejectedPct.toFixed(1)}%
                            </Descriptions.Item>
                            {order.error_details && (
                                <Descriptions.Item label="Ошибка" span={2}>
                                    {order.error_details}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                        <Table
                            rowKey="id"
                            dataSource={order.items || []}
                            columns={columns}
                            pagination={false}
                            size="small"
                            scroll={{ x: 'max-content' }}
                        />
                        {user?.role === 'admin' && rejectedItems.length > 0 && (
                            <Card
                                size="small"
                                title="Причины отказов"
                                style={{ marginTop: 16 }}
                            >
                                <Table
                                    rowKey="id"
                                    dataSource={rejectedItems}
                                    columns={rejectColumns}
                                    pagination={false}
                                    size="small"
                                    scroll={{ x: 'max-content' }}
                                />
                            </Card>
                        )}
                    </>
                ) : (
                    <div>Заказ не найден.</div>
                )}
            </Card>
            <Drawer
                title={
                    <Space direction="vertical" size={0}>
                        <Text strong>
                            {statsMeta.kind === 'oem'
                                ? 'Статистика по артикулу'
                                : 'Статистика по бренду'}
                        </Text>
                        <Text type="secondary">
                            {statsMeta.label || statsMeta.value}
                        </Text>
                    </Space>
                }
                width={760}
                onClose={() => setStatsOpen(false)}
                open={statsOpen}
                destroyOnClose={false}
            >
                {statsLoading ? (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                        Загрузка статистики...
                    </div>
                ) : statsData ? (
                    <>
                        <Text type="secondary">
                            Период: последние {statsData.period_months} мес.
                        </Text>
                        <Tabs
                            items={statsTabItems}
                            style={{ marginTop: 12 }}
                        />
                    </>
                ) : (
                    <Empty
                        description="Нет данных для выбранной позиции"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                )}
            </Drawer>
        </div>
    );
};

export default CustomerOrderDetailPage;
