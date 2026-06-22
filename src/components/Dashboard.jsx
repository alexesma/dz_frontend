import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ReloadOutlined,
    ShoppingCartOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    InputNumber,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { getCustomersSummary } from '../api/customers';
import { sendDragonzapOrder } from '../api/autoparts';
import {
    getInventoryControl,
    getOrderDynamics,
    getSupplierPriceTrends,
    getSupplierReliability,
} from '../api/dashboard';
import { getShipmentProfitReport } from '../api/inventory';
import { getExecutionTraces } from '../api/settings';
import { getWatchItems } from '../api/watchlist';

const { Title, Text } = Typography;

const TRACE_STATUS_COLOR = {
    success: 'green',
    error: 'red',
    running: 'blue',
};

const formatNumber = (value, digits = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(numeric);
};

const formatMoney = (value) => (
    Number.isFinite(Number(value))
        ? `${formatNumber(value, 2)} руб.`
        : '—'
);

const formatDateTime = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatShortDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
    });
};

const formatDurationMs = (value) => {
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${Math.round(ms)} мс`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} с`;
    return `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`;
};

const formatMemoryMb = (value) => (
    Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)} MB` : '—'
);

const joinProviderLabel = (item) => {
    const provider = item.provider_name || 'Без поставщика';
    const config = item.provider_config_name || `#${item.provider_config_id}`;
    return `${provider} / ${config}`;
};

const normalizeSiteOffers = (payload, watchItem) => {
    const rawRows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : [];
    return rawRows
        .map((row, index) => ({
            key: row.hash_key || row.system_hash || `${watchItem.id}-${index}`,
            supplier_id: row.supplier_id ?? null,
            supplier_name:
                row.sup_logo || row.supplier_name || row.provider_name || 'Dragonzap',
            brand_name: row.make_name || row.brand_name || watchItem.brand,
            oem_number: row.oem || row.oem_number || watchItem.oem,
            autopart_name: row.detail_name || row.name || `${watchItem.brand} ${watchItem.oem}`,
            price: Number(row.price),
            quantity: Number(row.qnt ?? row.qty ?? row.quantity ?? 0),
            min_qnt: Math.max(Number(row.min_qnt || 1), 1),
            min_delivery_day: row.min_delivery_day ?? null,
            max_delivery_day: row.max_delivery_day ?? null,
            hash_key: row.hash_key || null,
            system_hash: row.system_hash || null,
        }))
        .filter((row) => row.price > 0 && row.quantity > 0)
        .sort((a, b) => (
            a.price - b.price
            || Number(a.max_delivery_day || 999) - Number(b.max_delivery_day || 999)
            || b.quantity - a.quantity
        ))
        .slice(0, 5);
};

const MetricHistory = ({ points, valueKey, suffix = '', digits = 0, render }) => {
    const values = (points || []).slice(-8);
    if (!values.length) return <Text type="secondary">Нет данных</Text>;
    return (
        <div className="dashboard-history-strip">
            {values.map((point, idx) => {
                let content;
                if (render) {
                    content = render(point);
                } else {
                    const numeric = Number(point?.[valueKey]);
                    content = Number.isFinite(numeric)
                        ? `${formatNumber(numeric, digits)}${suffix}`
                        : '—';
                }
                return (
                    <div
                        key={`${point.pricelist_id}-${valueKey || 'r'}-${idx}`}
                        className="dashboard-history-cell"
                    >
                        <span>{formatDateTime(point.uploaded_at) || formatShortDate(point.date)}</span>
                        <strong>{content}</strong>
                    </div>
                );
            })}
        </div>
    );
};

// Цвет «для покупателя»: рост цены — плохо (красный), падение — хорошо (зелёный).
const renderPriceDelta = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
        return <span style={{ color: '#94a3b8' }}>0%</span>;
    }
    const color = numeric > 0 ? '#dc2626' : '#16a34a';
    const sign = numeric > 0 ? '+' : '';
    return <span style={{ color }}>{`${sign}${formatNumber(numeric, 1)}%`}</span>;
};

const Dashboard = () => {
    const [loading, setLoading] = useState(false);
    const [watchSendingKey, setWatchSendingKey] = useState(null);
    const [days, setDays] = useState(30);
    const [pointsLimit, setPointsLimit] = useState(8);
    const smoothWindow = 3;
    const [series, setSeries] = useState([]);
    const [orderDynamics, setOrderDynamics] = useState(null);
    const [profitRows, setProfitRows] = useState([]);
    const [inventoryControl, setInventoryControl] = useState(null);
    const [supplierReliability, setSupplierReliability] = useState([]);
    const [watchItems, setWatchItems] = useState([]);
    const [watchOffers, setWatchOffers] = useState({});
    const [watchOrderQty, setWatchOrderQty] = useState({});
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [schedulerJobTraces, setSchedulerJobTraces] = useState([]);
    const [schedulerErrorTraces, setSchedulerErrorTraces] = useState([]);
    const [providerPricelistTraces, setProviderPricelistTraces] = useState([]);
    const [selectedProviderConfigIds, setSelectedProviderConfigIds] = useState([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const requests = await Promise.allSettled([
                getSupplierPriceTrends({
                    days,
                    points_limit: pointsLimit,
                    smooth_window: smoothWindow,
                }),
                getOrderDynamics({ days: 14, partner_limit: 10 }),
                getExecutionTraces({ trace_type: 'scheduler_job', limit: 200 }),
                getExecutionTraces({
                    trace_type: 'scheduler_job',
                    status: 'error',
                    limit: 50,
                }),
                getExecutionTraces({ trace_type: 'provider_pricelist', limit: 250 }),
                getWatchItems({ page: 1, page_size: 10 }),
                getCustomersSummary({ page: 1, page_size: 200 }),
                getShipmentProfitReport({
                    period: 'day',
                    group_by_customer: true,
                    group_by_provider: false,
                    group_by_brand: false,
                    group_by_autopart: false,
                    date_from: new Date(
                        Date.now() - (29 * 24 * 60 * 60 * 1000)
                    ).toISOString(),
                }),
                getInventoryControl(),
                getSupplierReliability({ days: 90 }),
            ]);
            const [
                trendsResponse,
                orderDynamicsResponse,
                schedulerTracesResponse,
                schedulerErrorsResponse,
                providerTracesResponse,
                watchResponse,
                customersResponse,
                profitResponse,
                inventoryResponse,
                reliabilityResponse,
            ] = requests.map((result) => (
                result.status === 'fulfilled' ? result.value : null
            ));
            const failedSections = requests.filter(
                (result) => result.status === 'rejected'
            ).length;
            if (failedSections) {
                message.warning(
                    `Часть сводки временно недоступна: ${failedSections} разд.`
                );
            }
            const nextSeries = Array.isArray(trendsResponse?.data?.series)
                ? trendsResponse.data.series
                : [];
            const nextWatchItems = Array.isArray(watchResponse?.data?.items)
                ? watchResponse.data.items
                : [];
            const nextCustomers = Array.isArray(customersResponse?.data?.items)
                ? customersResponse.data.items
                : [];
            setSeries(nextSeries);
            setOrderDynamics(orderDynamicsResponse?.data || null);
            setSchedulerJobTraces(
                Array.isArray(schedulerTracesResponse?.data)
                    ? schedulerTracesResponse.data
                    : []
            );
            setSchedulerErrorTraces(
                Array.isArray(schedulerErrorsResponse?.data)
                    ? schedulerErrorsResponse.data
                    : []
            );
            setProviderPricelistTraces(
                Array.isArray(providerTracesResponse?.data)
                    ? providerTracesResponse.data
                    : []
            );
            setWatchItems(nextWatchItems);
            const savedOffers = {};
            const savedQuantities = {};
            nextWatchItems.forEach((item) => {
                const offers = normalizeSiteOffers(
                    item.last_seen_site_offers,
                    item
                );
                savedOffers[item.id] = offers;
                offers.forEach((offer) => {
                    savedQuantities[`${item.id}:${offer.key}`] = offer.min_qnt;
                });
            });
            setWatchOffers(savedOffers);
            setWatchOrderQty(savedQuantities);
            setCustomers(nextCustomers);
            setProfitRows(
                Array.isArray(profitResponse?.data) ? profitResponse.data : []
            );
            setInventoryControl(inventoryResponse?.data || null);
            setSupplierReliability(
                Array.isArray(reliabilityResponse?.data?.suppliers)
                    ? reliabilityResponse.data.suppliers
                    : []
            );
            setSelectedCustomerId((previous) => {
                if (previous && nextCustomers.some((item) => item.id === previous)) {
                    return previous;
                }
                const zzap = nextCustomers.find(
                    (item) => String(item.name || '').trim().toLowerCase() === 'zzap'
                ) || nextCustomers.find(
                    (item) => String(item.name || '').toLowerCase().includes('zzap')
                );
                return zzap?.id ?? nextCustomers[0]?.id ?? null;
            });
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить данные Dashboard');
        } finally {
            setLoading(false);
        }
    }, [days, pointsLimit, smoothWindow]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        setSelectedProviderConfigIds((previous) => {
            const available = series.map((item) => item.provider_config_id);
            const kept = previous.filter((id) => available.includes(id));
            return kept.length ? kept : available;
        });
    }, [series]);

    const visibleSeries = useMemo(() => {
        const selected = new Set(selectedProviderConfigIds);
        return series.filter((item) => selected.has(item.provider_config_id));
    }, [selectedProviderConfigIds, series]);

    const providerOptions = useMemo(
        () => series.map((item) => ({
            value: item.provider_config_id,
            label: joinProviderLabel(item),
        })),
        [series]
    );

    const slowestSchedulerJobs = useMemo(
        () => [...schedulerJobTraces]
            .filter((item) => Number(item.duration_ms || 0) > 0)
            .sort((a, b) => Number(b.duration_ms || 0) - Number(a.duration_ms || 0))
            .slice(0, 10),
        [schedulerJobTraces]
    );

    const latestSchedulerErrors = useMemo(
        () => schedulerErrorTraces.slice(0, 10),
        [schedulerErrorTraces]
    );

    const slowestPricelists = useMemo(
        () => [...providerPricelistTraces]
            .filter((item) => Number(item.duration_ms || 0) > 0)
            .sort((a, b) => Number(b.duration_ms || 0) - Number(a.duration_ms || 0))
            .slice(0, 10),
        [providerPricelistTraces]
    );

    const profitAnalytics = useMemo(() => {
        const totals = {
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            quantity: 0,
            costedQuantity: 0,
            uncostedQuantity: 0,
        };
        const dailyMap = new Map();
        const customerMap = new Map();
        profitRows.forEach((row) => {
            const revenue = Number(row.revenue_total || 0);
            const cost = Number(row.cost_total || 0);
            const quantity = Number(row.quantity || 0);
            const costedQuantity = Number(row.costed_quantity || 0);
            const uncostedQuantity = Number(row.uncosted_quantity || 0);
            totals.revenue += revenue;
            totals.cost += cost;
            totals.quantity += quantity;
            totals.costedQuantity += costedQuantity;
            totals.uncostedQuantity += uncostedQuantity;
            if (uncostedQuantity === 0) totals.grossProfit += revenue - cost;

            const date = String(row.period_start || '').slice(0, 10) || 'Без даты';
            const daily = dailyMap.get(date) || {
                date,
                revenue: 0,
                cost: 0,
                gross_profit: 0,
                quantity: 0,
                uncosted_quantity: 0,
            };
            daily.revenue += revenue;
            daily.cost += cost;
            daily.quantity += quantity;
            daily.uncosted_quantity += uncostedQuantity;
            if (uncostedQuantity === 0) daily.gross_profit += revenue - cost;
            dailyMap.set(date, daily);

            const customerKey = row.customer_id ?? row.customer_name ?? 'unknown';
            const customer = customerMap.get(customerKey) || {
                key: customerKey,
                customer_name: row.customer_name || 'Без клиента',
                revenue: 0,
                cost: 0,
                quantity: 0,
                uncosted_quantity: 0,
            };
            customer.revenue += revenue;
            customer.cost += cost;
            customer.quantity += quantity;
            customer.uncosted_quantity += uncostedQuantity;
            customerMap.set(customerKey, customer);
        });
        const marginPct = totals.revenue > 0 && totals.uncostedQuantity === 0
            ? ((totals.revenue - totals.cost) / totals.revenue) * 100
            : null;
        const costCoveragePct = totals.quantity > 0
            ? (totals.costedQuantity / totals.quantity) * 100
            : null;
        const customers = [...customerMap.values()].map((row) => ({
            ...row,
            gross_profit: row.revenue - row.cost,
            margin_pct: row.revenue > 0 && row.uncosted_quantity === 0
                ? ((row.revenue - row.cost) / row.revenue) * 100
                : null,
        })).sort((a, b) => (
            (a.margin_pct ?? -999) - (b.margin_pct ?? -999)
            || b.revenue - a.revenue
        ));
        return {
            totals: { ...totals, marginPct, costCoveragePct },
            daily: [...dailyMap.values()].sort(
                (a, b) => b.date.localeCompare(a.date)
            ).slice(0, 14),
            customers: customers.slice(0, 10),
        };
    }, [profitRows]);

    const frozenStockRows = useMemo(
        () => [
            ...(inventoryControl?.dead_stock || []),
            ...(inventoryControl?.slow_movers || []),
        ].sort(
            (a, b) => Number(b.frozen_value || 0) - Number(a.frozen_value || 0)
        ).slice(0, 10),
        [inventoryControl]
    );

    const lostDemandRows = useMemo(
        () => (inventoryControl?.out_of_stock_with_demand || []).map((row) => {
            const estimatedQty30 = Number(row.avg_daily || 0) * 30;
            return {
                ...row,
                estimated_qty_30: estimatedQty30,
                estimated_revenue_30: estimatedQty30 * Number(row.sale_price || 0),
            };
        }).sort(
            (a, b) => b.estimated_revenue_30 - a.estimated_revenue_30
        ).slice(0, 10),
        [inventoryControl]
    );

    const refreshOrderDynamics = useCallback(async () => {
        const response = await getOrderDynamics({ days: 14, partner_limit: 10 });
        setOrderDynamics(response?.data || null);
    }, []);

    const sendWatchOffer = useCallback(async (watchItem, offer) => {
        if (!selectedCustomerId) {
            message.warning('Выберите клиента для оформления заказа');
            return;
        }
        if (!offer.hash_key) {
            message.warning('У предложения нет hash_key, отправка с Dashboard недоступна');
            return;
        }
        const offerKey = `${watchItem.id}:${offer.key}`;
        const quantity = Math.max(
            Number(watchOrderQty[offerKey] || offer.min_qnt || 1),
            Number(offer.min_qnt || 1)
        );
        setWatchSendingKey(offerKey);
        try {
            const response = await sendDragonzapOrder(
                [{
                    autopart_id: null,
                    oem_number: offer.oem_number,
                    brand_name: offer.brand_name,
                    autopart_name: offer.autopart_name,
                    supplier_id: offer.supplier_id,
                    supplier_name: offer.supplier_name,
                    quantity,
                    confirmed_price: offer.price,
                    min_delivery_day: offer.min_delivery_day,
                    max_delivery_day: offer.max_delivery_day,
                    status: 'Send',
                    tracking_uuid: `dw${watchItem.id}${Date.now().toString().slice(-8)}`,
                    hash_key: offer.hash_key,
                    system_hash: offer.system_hash,
                }],
                selectedCustomerId,
                `Dashboard: ${watchItem.brand} ${watchItem.oem}`
            );
            if (Number(response?.data?.successful_items || 0) > 0) {
                message.success(
                    `Заказ оформлен: ${watchItem.brand} ${watchItem.oem}, ${quantity} шт.`
                );
                await refreshOrderDynamics();
            } else {
                const firstError = response?.data?.results?.find(
                    (item) => item.status !== 'success'
                )?.message;
                message.warning(firstError || 'Позиция не была отправлена в заказ');
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось оформить заказ'
            );
        } finally {
            setWatchSendingKey(null);
        }
    }, [refreshOrderDynamics, selectedCustomerId, watchOrderQty]);

    const watchColumns = [
        {
            title: 'Позиция',
            key: 'position',
            width: 260,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.brand} {row.oem}</Text>
                    <Text type="secondary">Контрольная цена: {formatMoney(row.max_price)}</Text>
                </Space>
            ),
        },
        {
            title: 'Прайсы поставщиков',
            key: 'provider',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatMoney(row.last_seen_provider_price)}</Text>
                    <Text type="secondary">{formatDateTime(row.last_seen_provider_at)}</Text>
                </Space>
            ),
        },
        {
            title: 'Сайт',
            key: 'site',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatMoney(row.last_seen_site_price)}</Text>
                    <Text type="secondary">{formatDateTime(row.last_seen_site_at)}</Text>
                </Space>
            ),
        },
        {
            title: 'Сигнал',
            key: 'signal',
            width: 170,
            render: (_, row) => {
                const prices = [row.last_seen_provider_price, row.last_seen_site_price]
                    .map(Number)
                    .filter((value) => Number.isFinite(value) && value > 0);
                const bestPrice = prices.length ? Math.min(...prices) : null;
                const limitReached = bestPrice != null
                    && row.max_price != null
                    && bestPrice <= Number(row.max_price);
                return limitReached
                    ? <Tag color="green">Цена достигнута</Tag>
                    : <Tag color={bestPrice != null ? 'blue' : 'default'}>
                        {bestPrice != null ? `Лучшая ${formatMoney(bestPrice)}` : 'Нет цены'}
                    </Tag>;
            },
        },
    ];

    const watchOfferColumns = (watchItem) => [
        {
            title: 'Поставщик',
            dataIndex: 'supplier_name',
            width: 170,
            render: (value) => <Text strong>{value}</Text>,
        },
        {
            title: 'Бренд / OEM',
            key: 'identity',
            width: 210,
            render: (_, row) => `${row.brand_name} ${row.oem_number}`,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 130,
            render: formatMoney,
        },
        {
            title: 'Остаток',
            dataIndex: 'quantity',
            width: 100,
            render: (value) => `${formatNumber(value)} шт.`,
        },
        {
            title: 'Кратность',
            dataIndex: 'min_qnt',
            width: 90,
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 120,
            render: (_, row) => (
                `${row.min_delivery_day ?? '—'}–${row.max_delivery_day ?? '—'} дн.`
            ),
        },
        {
            title: 'Заказать',
            key: 'order',
            width: 230,
            render: (_, offer) => {
                const offerKey = `${watchItem.id}:${offer.key}`;
                return (
                    <Space>
                        <InputNumber
                            min={offer.min_qnt || 1}
                            max={offer.quantity || undefined}
                            step={offer.min_qnt || 1}
                            value={watchOrderQty[offerKey] ?? offer.min_qnt ?? 1}
                            onChange={(value) => setWatchOrderQty((prev) => ({
                                ...prev,
                                [offerKey]: Number(value || offer.min_qnt || 1),
                            }))}
                            style={{ width: 82 }}
                        />
                        <Button
                            type="primary"
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            disabled={!offer.hash_key}
                            loading={watchSendingKey === offerKey}
                            onClick={() => void sendWatchOffer(watchItem, offer)}
                        >
                            В заказ
                        </Button>
                    </Space>
                );
            },
        },
    ];

    const orderSummary = orderDynamics?.summary || {};
    const dailyColumns = [
        {
            title: 'Дата',
            dataIndex: 'date',
            width: 90,
            fixed: 'left',
            render: formatShortDate,
        },
        {
            title: 'Клиенты',
            children: [
                { title: 'Заказов', dataIndex: 'customer_order_count', width: 90 },
                { title: 'Строк', dataIndex: 'customer_position_count', width: 80 },
                { title: 'Штук', dataIndex: 'customer_qty', width: 90 },
                {
                    title: 'Сумма',
                    dataIndex: 'customer_sum',
                    width: 140,
                    render: formatMoney,
                },
            ],
        },
        {
            title: 'Поставщики',
            children: [
                { title: 'Заказов', dataIndex: 'supplier_order_count', width: 90 },
                { title: 'Строк', dataIndex: 'supplier_position_count', width: 80 },
                { title: 'Штук', dataIndex: 'supplier_qty', width: 90 },
                {
                    title: 'Сумма',
                    dataIndex: 'supplier_sum',
                    width: 140,
                    render: formatMoney,
                },
            ],
        },
    ];

    const partnerColumns = [
        {
            title: 'Контрагент',
            dataIndex: 'partner_name',
            ellipsis: true,
            render: (value) => <Text strong>{value}</Text>,
        },
        { title: 'Заказов', dataIndex: 'order_count', width: 80 },
        { title: 'Строк', dataIndex: 'position_count', width: 70 },
        { title: 'Штук', dataIndex: 'quantity', width: 80 },
        {
            title: 'Сумма',
            dataIndex: 'total_sum',
            width: 130,
            render: formatMoney,
        },
    ];

    const profitDailyColumns = [
        { title: 'Дата', dataIndex: 'date', width: 90, render: formatShortDate },
        { title: 'Продано', dataIndex: 'quantity', width: 90, render: (value) => `${formatNumber(value)} шт.` },
        { title: 'Выручка', dataIndex: 'revenue', width: 140, render: formatMoney },
        { title: 'Себестоимость', dataIndex: 'cost', width: 140, render: formatMoney },
        { title: 'Валовая прибыль', dataIndex: 'gross_profit', width: 150, render: formatMoney },
        {
            title: 'Без себестоимости',
            dataIndex: 'uncosted_quantity',
            width: 150,
            render: (value) => value > 0
                ? <Tag color="orange">{formatNumber(value)} шт.</Tag>
                : <Tag color="green">0</Tag>,
        },
    ];

    const marginRiskColumns = [
        { title: 'Клиент', dataIndex: 'customer_name', ellipsis: true },
        { title: 'Выручка', dataIndex: 'revenue', width: 130, render: formatMoney },
        { title: 'Прибыль', dataIndex: 'gross_profit', width: 130, render: formatMoney },
        {
            title: 'Маржа',
            dataIndex: 'margin_pct',
            width: 100,
            render: (value) => value == null
                ? <Tag color="orange">Нет себест.</Tag>
                : <Tag color={value < 10 ? 'red' : value < 20 ? 'orange' : 'green'}>{formatNumber(value, 1)}%</Tag>,
        },
    ];

    const frozenStockColumns = [
        {
            title: 'Позиция',
            key: 'position',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.brand_name} {row.oem_number}</Text>
                    <Text type="secondary" ellipsis>{row.autopart_name}</Text>
                </Space>
            ),
        },
        { title: 'Остаток', dataIndex: 'current_quantity', width: 90, render: (value) => `${formatNumber(value)} шт.` },
        { title: 'Продажи 365д', dataIndex: 'sold_last_365_days', width: 110 },
        { title: 'Дней покрытия', dataIndex: 'estimated_days_left', width: 120, render: (value) => value ?? 'Нет спроса' },
        { title: 'Заморожено', dataIndex: 'frozen_value', width: 140, render: formatMoney },
    ];

    const reliabilityColumns = [
        { title: 'Поставщик', dataIndex: 'provider_name', ellipsis: true, render: (value) => <Text strong>{value}</Text> },
        { title: 'Заказов', dataIndex: 'order_count', width: 80 },
        { title: 'Заказано, руб.', dataIndex: 'ordered_sum', width: 140, render: formatMoney },
        { title: 'Получено, руб.', dataIndex: 'received_sum', width: 140, render: formatMoney },
        { title: 'В работе, руб.', dataIndex: 'pending_sum', width: 140, render: formatMoney },
        {
            title: 'Исполнение',
            dataIndex: 'fill_rate_pct',
            width: 110,
            render: (value) => value == null ? '—' : <Tag color={value < 70 ? 'red' : value < 90 ? 'orange' : 'green'}>{formatNumber(value, 1)}%</Tag>,
        },
        {
            title: 'В срок',
            dataIndex: 'on_time_pct',
            width: 100,
            render: (value) => value == null ? '—' : <Tag color={value < 70 ? 'red' : value < 90 ? 'orange' : 'green'}>{formatNumber(value, 1)}%</Tag>,
        },
        { title: 'Просрочено строк', dataIndex: 'late_line_count', width: 130 },
        { title: 'Факт. срок', dataIndex: 'avg_lead_days', width: 100, render: (value) => value == null ? '—' : `${formatNumber(value, 1)} дн.` },
    ];

    const lostDemandColumns = [
        {
            title: 'Позиция',
            key: 'position',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.brand_name} {row.oem_number}</Text>
                    <Text type="secondary" ellipsis>{row.autopart_name}</Text>
                </Space>
            ),
        },
        { title: 'Спрос 30д', dataIndex: 'sold_last_30_days', width: 90 },
        { title: 'Спрос 365д', dataIndex: 'sold_last_365_days', width: 100 },
        { title: 'Оценка дефицита 30д', dataIndex: 'estimated_qty_30', width: 150, render: (value) => `${formatNumber(value, 1)} шт.` },
        { title: 'Цена продажи', dataIndex: 'sale_price', width: 130, render: formatMoney },
        { title: 'Потенциальная выручка', dataIndex: 'estimated_revenue_30', width: 170, render: formatMoney },
    ];

    const priceColumns = [
        {
            title: 'Поставщик / источник',
            key: 'provider',
            fixed: 'left',
            width: 230,
            render: (_, row) => {
                const latest = row.points?.[row.points.length - 1];
                const previous = row.points?.[row.points.length - 2];
                const skuDrop = latest && previous && previous.total_sku_count > 0
                    ? ((latest.total_sku_count / previous.total_sku_count) - 1) * 100
                    : 0;
                const net = Number(row.net_price_change_pct ?? 0);
                const risks = [];
                if (net >= 5) risks.push('рост цен');
                if (net <= -5) risks.push('падение цен');
                if (Number(latest?.coverage_pct ?? 100) < 70) risks.push('смена состава');
                if (skuDrop <= -20) risks.push('падение ассортимента');
                return (
                    <Space direction="vertical" size={2}>
                        <Text strong>{joinProviderLabel(row)}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Загружен: {formatDateTime(row.latest_uploaded_at) || formatShortDate(latest?.date)}
                        </Text>
                        <span style={{ fontSize: 12 }}>
                            Цена к началу периода: {renderPriceDelta(row.net_price_change_pct)}
                        </span>
                        {risks.length ? (
                            <Tag color={net >= 5 ? 'red' : 'orange'} icon={<WarningOutlined />}>
                                {risks.join(', ')}
                            </Tag>
                        ) : <Tag color="green">Стабильно</Tag>}
                    </Space>
                );
            },
        },
        {
            title: 'Артикулов в прайсе',
            key: 'total_sku',
            width: 520,
            render: (_, row) => (
                <MetricHistory points={row.points} valueKey="total_sku_count" />
            ),
        },
        {
            title: 'Из них в наличии',
            key: 'sku',
            width: 520,
            render: (_, row) => (
                <MetricHistory points={row.points} valueKey="sku_count" />
            ),
        },
        {
            title: 'Изменение цены / доля изменивших',
            key: 'index',
            width: 520,
            render: (_, row) => (
                <MetricHistory
                    points={row.points}
                    render={(point) => (
                        <span>
                            {renderPriceDelta(point.step_index_pct)}
                            {point.changed_share_pct != null ? (
                                <span style={{ color: '#64748b', fontSize: 11 }}>
                                    {` (${formatNumber(point.changed_share_pct, 0)}% поз.)`}
                                </span>
                            ) : null}
                        </span>
                    )}
                />
            ),
        },
        {
            title: 'Изменение состава (+новых / −ушло)',
            key: 'coverage',
            width: 520,
            render: (_, row) => (
                <MetricHistory
                    points={row.points}
                    render={(point) => {
                        if (point.new_positions == null && point.removed_positions == null) {
                            return <span style={{ color: '#94a3b8' }}>—</span>;
                        }
                        const added = Number(point.new_positions || 0);
                        const removed = Number(point.removed_positions || 0);
                        return (
                            <span>
                                <span style={{ color: '#16a34a' }}>+{added}</span>
                                {' / '}
                                <span style={{ color: '#dc2626' }}>−{removed}</span>
                            </span>
                        );
                    }}
                />
            ),
        },
    ];

    const traceColumns = [
        {
            title: 'Задание',
            key: 'job',
            render: (_, row) => row.job_name || row.job_key || '—',
        },
        {
            title: 'Старт',
            dataIndex: 'started_at',
            width: 135,
            render: formatDateTime,
        },
        {
            title: 'Длительность',
            dataIndex: 'duration_ms',
            width: 120,
            render: formatDurationMs,
        },
        {
            title: 'Память',
            key: 'memory',
            width: 190,
            render: (_, row) => (
                `${formatMemoryMb(row.rss_before_mb)} → ${formatMemoryMb(row.rss_after_mb)}`
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 100,
            render: (value) => <Tag color={TRACE_STATUS_COLOR[value]}>{value}</Tag>,
        },
    ];

    const pricelistTraceColumns = [
        {
            title: 'Поставщик / прайс',
            key: 'provider',
            render: (_, row) => (
                row.details?.provider_name || row.details?.provider_config_name || '—'
            ),
        },
        {
            title: 'Файл',
            dataIndex: 'source_filename',
            ellipsis: true,
        },
        {
            title: 'Старт',
            dataIndex: 'started_at',
            width: 135,
            render: formatDateTime,
        },
        {
            title: 'Длительность',
            dataIndex: 'duration_ms',
            width: 120,
            render: formatDurationMs,
        },
        {
            title: 'Строк после фильтров',
            key: 'rows',
            width: 150,
            render: (_, row) => row.details?.stats?.rows_after_filters ?? '—',
        },
        {
            title: 'Δ памяти',
            dataIndex: 'memory_delta_mb',
            width: 110,
            render: formatMemoryMb,
        },
    ];

    return (
        <div className="dashboard-command-center">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div className="dashboard-command-header">
                    <div>
                        <Title level={2} style={{ margin: 0 }}>Оперативная сводка</Title>
                        <Text type="secondary">
                            Продажи, закупки, отслеживаемые позиции и изменения прайсов
                        </Text>
                    </div>
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={() => void loadData()}
                    >
                        Обновить всё
                    </Button>
                </div>

                <Card
                    title="Отслеживаемые позиции: предложения и быстрый заказ"
                    extra={(
                        <Select
                            value={selectedCustomerId}
                            style={{ width: 260 }}
                            placeholder="Клиент для заказа"
                            options={customers.map((item) => ({
                                value: item.id,
                                label: item.name || `Клиент #${item.id}`,
                            }))}
                            onChange={setSelectedCustomerId}
                        />
                    )}
                >
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="Показываем первые 10 отслеживаемых позиций и до 5 предложений из последней регламентной проверки сайта. Открытие Dashboard не запускает новый запрос."
                    />
                    <Table
                        rowKey="id"
                        loading={loading}
                        columns={watchColumns}
                        dataSource={watchItems}
                        pagination={false}
                        scroll={{ x: 900 }}
                        expandable={{
                            expandedRowKeys: watchItems.map((item) => item.id),
                            showExpandColumn: false,
                            expandedRowRender: (watchItem) => (
                                (watchOffers[watchItem.id] || []).length ? (
                                    <Table
                                        rowKey="key"
                                        size="small"
                                        columns={watchOfferColumns(watchItem)}
                                        dataSource={watchOffers[watchItem.id] || []}
                                        pagination={false}
                                        scroll={{ x: 1100 }}
                                    />
                                ) : (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={watchItem.last_seen_site_at
                                            ? `Последняя подходящая цена ${formatMoney(watchItem.last_seen_site_price)} найдена ${formatDateTime(watchItem.last_seen_site_at)}. Подробный снимок появится после следующей регламентной проверки.`
                                            : 'Регламентная проверка ещё не находила подходящих предложений'}
                                    />
                                )
                            ),
                        }}
                    />
                </Card>

                <Card title="Заказы: динамика за 14 дней">
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Заказы клиентов" value={orderSummary.customer_order_count || 0} suffix={`· ${formatNumber(orderSummary.customer_qty || 0)} шт.`} /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Сумма клиентского спроса" value={Number(orderSummary.customer_sum || 0)} precision={0} suffix="руб." /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Заказы поставщикам" value={orderSummary.supplier_order_count || 0} suffix={`· ${formatNumber(orderSummary.supplier_qty || 0)} шт.`} /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Покрытие закупкой" value={orderSummary.purchase_coverage_pct ?? 0} precision={1} suffix="%" /></Card>
                        </Col>
                    </Row>
                    <Table
                        rowKey="date"
                        size="small"
                        columns={dailyColumns}
                        dataSource={[...(orderDynamics?.daily || [])].reverse()}
                        pagination={false}
                        scroll={{ x: 1000 }}
                    />
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col xs={24} xl={12}>
                            <Card size="small" title="Кто больше заказывает у нас">
                                <Table rowKey="partner_id" size="small" columns={partnerColumns} dataSource={orderDynamics?.customers || []} pagination={false} scroll={{ x: 650 }} />
                            </Card>
                        </Col>
                        <Col xs={24} xl={12}>
                            <Card size="small" title="У кого больше заказываем мы">
                                <Table rowKey="partner_id" size="small" columns={partnerColumns} dataSource={orderDynamics?.suppliers || []} pagination={false} scroll={{ x: 650 }} />
                            </Card>
                        </Col>
                    </Row>
                </Card>

                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>
                        Управленческие отчёты
                    </Title>
                    <Text type="secondary">
                        Маржа, складской капитал, исполнение поставщиков и риск
                        потерянных продаж
                    </Text>
                </div>

                <Card title="Маржа и утечка прибыли · последние 30 дней">
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Выручка"
                                    value={profitAnalytics.totals.revenue}
                                    precision={0}
                                    suffix="руб."
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Валовая прибыль"
                                    value={profitAnalytics.totals.grossProfit}
                                    precision={0}
                                    suffix="руб."
                                    valueStyle={{
                                        color: profitAnalytics.totals.grossProfit < 0
                                            ? '#cf1322'
                                            : '#237804',
                                    }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Валовая маржа"
                                    value={profitAnalytics.totals.marginPct}
                                    precision={1}
                                    suffix="%"
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Покрытие себестоимостью"
                                    value={profitAnalytics.totals.costCoveragePct}
                                    precision={1}
                                    suffix="%"
                                />
                            </Card>
                        </Col>
                    </Row>
                    {profitAnalytics.totals.uncostedQuantity > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`${formatNumber(profitAnalytics.totals.uncostedQuantity)} шт. отгружено без известной себестоимости. Для них прибыль и общая маржа не считаются.`}
                        />
                    )}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} xl={14}>
                            <Card size="small" title="Динамика по дням">
                                <Table
                                    rowKey="date"
                                    size="small"
                                    columns={profitDailyColumns}
                                    dataSource={profitAnalytics.daily}
                                    pagination={false}
                                    scroll={{ x: 800 }}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} xl={10}>
                            <Card size="small" title="Клиенты с риском утечки маржи">
                                <Table
                                    rowKey="key"
                                    size="small"
                                    columns={marginRiskColumns}
                                    dataSource={profitAnalytics.customers}
                                    pagination={false}
                                    scroll={{ x: 600 }}
                                />
                            </Card>
                        </Col>
                    </Row>
                </Card>

                <Card title="Складской капитал и залежи">
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Стоимость склада" value={Number(inventoryControl?.summary?.stock_value || 0)} precision={0} suffix="руб." /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Мёртвый запас" value={Number(inventoryControl?.summary?.dead_stock_value || 0)} precision={0} suffix="руб." valueStyle={{ color: '#cf1322' }} /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Медленных SKU" value={Number(inventoryControl?.summary?.slow_stock_skus || 0)} suffix="поз." /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Оборачиваемость" value={inventoryControl?.summary?.inventory_turnover} precision={2} suffix="раз/год" /></Card>
                        </Col>
                    </Row>
                    <Table
                        rowKey={(row) => `${row.state}:${row.autopart_id || row.oem_number}`}
                        size="small"
                        columns={frozenStockColumns}
                        dataSource={frozenStockRows}
                        pagination={false}
                        scroll={{ x: 850 }}
                    />
                </Card>

                <Card title="Надёжность поставщиков · последние 90 дней">
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="Денежное исполнение считается по стоимости полученного объёма относительно созревших к оценке заказов. Незавершённая сумма показана отдельно в колонке «В работе»."
                    />
                    <Table
                        rowKey="provider_id"
                        size="small"
                        columns={reliabilityColumns}
                        dataSource={supplierReliability}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 1050 }}
                    />
                </Card>

                <Card title="Риск потерянных продаж · нет остатка при наличии спроса">
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Дефицитных SKU" value={Number(inventoryControl?.summary?.out_of_stock_with_demand_skus || 0)} suffix="поз." /></Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small"><Statistic title="Уровень наличия" value={inventoryControl?.summary?.service_level_pct} precision={1} suffix="%" /></Card>
                        </Col>
                        <Col xs={24} lg={12}>
                            <Alert
                                type="warning"
                                showIcon
                                message="Потенциальная выручка — оценка по среднему спросу и текущей продажной цене, а не подтверждённая потеря."
                            />
                        </Col>
                    </Row>
                    <Table
                        rowKey={(row) => row.autopart_id || row.oem_number}
                        size="small"
                        columns={lostDemandColumns}
                        dataSource={lostDemandRows}
                        pagination={false}
                        scroll={{ x: 1050 }}
                    />
                </Card>

                <Card
                    title="Динамика прайсов поставщиков"
                    extra={(
                        <Space wrap>
                            <InputNumber min={7} max={365} value={days} onChange={(value) => setDays(Number(value || 30))} addonAfter="дней" />
                            <InputNumber min={3} max={12} value={pointsLimit} onChange={(value) => setPointsLimit(Number(value || 8))} addonAfter="загрузок" />
                            <Select mode="multiple" value={selectedProviderConfigIds} onChange={setSelectedProviderConfigIds} options={providerOptions} maxTagCount={2} style={{ minWidth: 320 }} placeholder="Поставщики" />
                        </Space>
                    )}
                >
                    <Table
                        rowKey="provider_config_id"
                        size="small"
                        loading={loading}
                        columns={priceColumns}
                        dataSource={visibleSeries}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 2350 }}
                    />
                </Card>

                <Card title="Техническая устойчивость">
                    <Row gutter={[16, 16]}>
                        <Col xs={24} xl={12}>
                            <Card size="small" title="Самые тяжёлые регламенты">
                                <Table rowKey="id" size="small" columns={traceColumns} dataSource={slowestSchedulerJobs} pagination={false} scroll={{ x: 800 }} />
                            </Card>
                        </Col>
                        <Col xs={24} xl={12}>
                            <Card size="small" title="Последние ошибки регламентов">
                                <Table
                                    rowKey="id"
                                    size="small"
                                    columns={[
                                        ...traceColumns.slice(0, 3),
                                        {
                                            title: 'Ошибка',
                                            key: 'error',
                                            ellipsis: true,
                                            render: (_, row) => row.details?.error || 'Без текста',
                                        },
                                    ]}
                                    dataSource={latestSchedulerErrors}
                                    pagination={false}
                                    scroll={{ x: 800 }}
                                />
                            </Card>
                        </Col>
                    </Row>
                    <Card size="small" title="Самые медленные прайсы" style={{ marginTop: 16 }}>
                        <Table rowKey="id" size="small" columns={pricelistTraceColumns} dataSource={slowestPricelists} pagination={false} scroll={{ x: 900 }} />
                    </Card>
                </Card>
            </Space>
        </div>
    );
};

export default Dashboard;
