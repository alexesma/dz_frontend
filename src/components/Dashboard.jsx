import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DeleteOutlined,
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
    Popconfirm,
    Row,
    Select,
    Segmented,
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
    createManualSupplierOrder,
    sendSupplierOrders,
} from '../api/customerOrders';
import {
    getInventoryControl,
    getOrderDynamics,
    getOrderMargin,
    getSupplierPriceTrends,
    getSupplierReliability,
} from '../api/dashboard';
import { getExecutionTraces } from '../api/settings';
import { deleteWatchItem, getWatchItems } from '../api/watchlist';
import MarginMonthChart from './MarginMonthChart';

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
            key: row.key || row.hash_key || row.system_hash || `${watchItem.id}-${index}`,
            source_type: row.source_type || 'site',
            autopart_id: row.autopart_id ?? null,
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

const getReadableAutopartName = (name, watchItem) => {
    const text = String(name || '').trim();
    if (!text) return '';
    const fallback = `${watchItem?.brand || ''} ${watchItem?.oem || ''}`.trim();
    return text === fallback ? '' : text;
};

const MetricHistory = ({ points, valueKey, suffix = '', digits = 0, render }) => {
    const values = (points || []).slice(-4);
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

const TrendHistoryList = ({ points, render }) => {
    const values = (points || []).slice(-4).reverse();
    if (!values.length) return <Text type="secondary">Нет данных</Text>;
    return (
        <div className="dashboard-trend-list">
            {values.map((point, index) => (
                <div
                    className="dashboard-trend-row"
                    key={`${point.pricelist_id}-${index}`}
                >
                    <span>{formatDateTime(point.uploaded_at) || formatShortDate(point.date)}</span>
                    <strong>{render(point)}</strong>
                </div>
            ))}
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

// Знаковая сумма: прирост прибыли — зелёный, потеря — красный.
const renderSignedMoney = (value) => {
    const numeric = Number(value);
    if (value == null || !Number.isFinite(numeric)) {
        return <span style={{ color: '#94a3b8' }}>—</span>;
    }
    if (Math.abs(numeric) < 0.005) {
        return <span style={{ color: '#94a3b8' }}>0</span>;
    }
    const color = numeric > 0 ? '#16a34a' : '#dc2626';
    return (
        <span style={{ color }}>
            {numeric > 0 ? '+' : '−'}{formatMoney(Math.abs(numeric))}
        </span>
    );
};

// Сравнение показателя с предыдущим окном той же длины.
// mode='percent' — относительное изменение суммы, mode='pp' — разница
// маржи в процентных пунктах. Рост — зелёный, падение — красный.
const MonthDelta = ({
    current,
    previous,
    mode = 'percent',
    label = 'к пред. 30 дням',
}) => {
    const currentValue = Number(current);
    const previousValue = Number(previous);
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)
        || (mode === 'percent' && previousValue === 0)) {
        return (
            <Text type="secondary" style={{ fontSize: 12 }}>
                Нет данных за предыдущий период
            </Text>
        );
    }
    const delta = mode === 'percent'
        ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
        : currentValue - previousValue;
    if (Math.abs(delta) < 0.05) {
        return (
            <Text type="secondary" style={{ fontSize: 12 }}>
                Без изменений {label}
            </Text>
        );
    }
    const color = delta > 0 ? '#16a34a' : '#dc2626';
    const suffix = mode === 'percent' ? '%' : ' п.п.';
    return (
        <span style={{ color, fontSize: 12 }}>
            {delta > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {` ${delta > 0 ? '+' : ''}${formatNumber(delta, 1)}${suffix} ${label}`}
        </span>
    );
};

const Dashboard = () => {
    const [loading, setLoading] = useState(false);
    const [watchSendingKey, setWatchSendingKey] = useState(null);
    const [days, setDays] = useState(30);
    const [pointsLimit, setPointsLimit] = useState(8);
    const smoothWindow = 3;
    const [series, setSeries] = useState([]);
    const [orderDynamics, setOrderDynamics] = useState(null);
    const [orderCompareDaily, setOrderCompareDaily] = useState([]);
    const [marginChartMetric, setMarginChartMetric] = useState('revenue');
    const [supplierPurchaseMode, setSupplierPurchaseMode] = useState('warehouse');
    const [profitRows, setProfitRows] = useState([]);
    const [prevProfitRows, setPrevProfitRows] = useState([]);
    const [profitIsEstimated, setProfitIsEstimated] = useState(false);
    const [watchRemovingId, setWatchRemovingId] = useState(null);
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
                getOrderDynamics({ days: 14, partner_limit: 1000 }),
                // 28 дней без контрагентов — только для сравнения окон 14/14
                getOrderDynamics({ days: 28, partner_limit: 1 }),
                getExecutionTraces({ trace_type: 'scheduler_job', limit: 200 }),
                getExecutionTraces({
                    trace_type: 'scheduler_job',
                    status: 'error',
                    limit: 50,
                }),
                getExecutionTraces({ trace_type: 'provider_pricelist', limit: 250 }),
                getWatchItems({ page: 1, page_size: 10 }),
                getCustomersSummary({ page: 1, page_size: 200 }),
                // 60 дней: текущее окно (последние 30) + предыдущее для сравнения
                getOrderMargin({ days: 60 }),
                getInventoryControl(),
                getSupplierReliability({ days: 90 }),
            ]);
            const [
                trendsResponse,
                orderDynamicsResponse,
                orderCompareResponse,
                schedulerTracesResponse,
                schedulerErrorsResponse,
                providerTracesResponse,
                watchResponse,
                customersResponse,
                orderMarginResponse,
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
            setOrderCompareDaily(
                Array.isArray(orderCompareResponse?.data?.daily)
                    ? orderCompareResponse.data.daily
                    : []
            );
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
                    [
                        ...(item.last_seen_site_offers || []),
                        ...(item.last_seen_provider_offer
                            ? [item.last_seen_provider_offer]
                            : []),
                    ],
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
            const estimatedProfitRows = Array.isArray(orderMarginResponse?.data?.rows)
                ? orderMarginResponse.data.rows
                : [];
            const currentWindowStart = new Date();
            currentWindowStart.setHours(0, 0, 0, 0);
            currentWindowStart.setDate(currentWindowStart.getDate() - 29);
            const isCurrentWindowRow = (row) => {
                const parsed = new Date(row.period_start);
                return !Number.isNaN(parsed.getTime())
                    && parsed >= currentWindowStart;
            };
            const hasEstimatedCurrentRows = estimatedProfitRows.some(
                isCurrentWindowRow
            );
            setProfitRows(estimatedProfitRows.filter(isCurrentWindowRow));
            setPrevProfitRows(
                estimatedProfitRows.filter((row) => !isCurrentWindowRow(row))
            );
            setProfitIsEstimated(hasEstimatedCurrentRows);
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
            orderTotal: 0,
            orderedQuantity: 0,
            unpricedOrderQuantity: 0,
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
            const orderTotal = Number(
                row.order_total ?? row.revenue_total ?? 0
            );
            const orderedQuantity = Number(
                row.ordered_quantity ?? row.quantity ?? 0
            );
            const unpricedOrderQuantity = Number(
                row.unpriced_order_quantity || 0
            );
            const revenue = Number(row.revenue_total || 0);
            const cost = Number(row.cost_total || 0);
            const quantity = Number(row.quantity || 0);
            const costedQuantity = Number(row.costed_quantity || 0);
            const uncostedQuantity = Number(row.uncosted_quantity || 0);
            totals.orderTotal += orderTotal;
            totals.orderedQuantity += orderedQuantity;
            totals.unpricedOrderQuantity += unpricedOrderQuantity;
            totals.revenue += revenue;
            totals.cost += cost;
            totals.quantity += quantity;
            totals.costedQuantity += costedQuantity;
            totals.uncostedQuantity += uncostedQuantity;
            if (uncostedQuantity === 0) totals.grossProfit += revenue - cost;

            const date = String(row.period_start || '').slice(0, 10) || 'Без даты';
            const daily = dailyMap.get(date) || {
                date,
                order_total: 0,
                ordered_quantity: 0,
                revenue: 0,
                cost: 0,
                gross_profit: 0,
                quantity: 0,
                uncosted_quantity: 0,
            };
            daily.order_total += orderTotal;
            daily.ordered_quantity += orderedQuantity;
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
                order_total: 0,
                revenue: 0,
                cost: 0,
                quantity: 0,
                uncosted_quantity: 0,
            };
            customer.order_total += orderTotal;
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
            gross_profit: row.uncosted_quantity === 0 && row.revenue > 0
                ? row.revenue - row.cost
                : null,
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

    const prevProfitTotals = useMemo(() => {
        if (!prevProfitRows.length) {
            return { orderTotal: null, revenue: null, marginPct: null };
        }
        let orderTotal = 0;
        let revenue = 0;
        let cost = 0;
        let uncostedQuantity = 0;
        prevProfitRows.forEach((row) => {
            orderTotal += Number(row.order_total ?? row.revenue_total ?? 0);
            revenue += Number(row.revenue_total || 0);
            cost += Number(row.cost_total || 0);
            uncostedQuantity += Number(row.uncosted_quantity || 0);
        });
        const marginPct = revenue > 0 && uncostedQuantity === 0
            ? ((revenue - cost) / revenue) * 100
            : null;
        return { orderTotal, revenue, marginPct };
    }, [prevProfitRows]);

    // Итоги предыдущего 14-дневного окна из 28-дневной выборки daily
    const prevOrderSummary = useMemo(() => {
        if (!orderCompareDaily.length) return null;
        const windowStart = new Date();
        windowStart.setHours(0, 0, 0, 0);
        windowStart.setDate(windowStart.getDate() - 13);
        const prevRows = orderCompareDaily.filter((row) => {
            const parsed = new Date(`${row.date}T00:00:00`);
            return !Number.isNaN(parsed.getTime()) && parsed < windowStart;
        });
        if (!prevRows.length) return null;
        const totals = {
            customer_order_count: 0,
            customer_qty: 0,
            customer_sum: 0,
            supplier_order_count: 0,
            supplier_qty: 0,
        };
        prevRows.forEach((row) => {
            totals.customer_order_count += Number(row.customer_order_count || 0);
            totals.customer_qty += Number(row.customer_qty || 0);
            totals.customer_sum += Number(row.customer_sum || 0);
            totals.supplier_order_count += Number(row.supplier_order_count || 0);
            totals.supplier_qty += Number(row.supplier_qty || 0);
        });
        totals.purchase_coverage_pct = totals.customer_qty > 0
            ? (totals.supplier_qty / totals.customer_qty) * 100
            : null;
        return totals;
    }, [orderCompareDaily]);

    // Сравнение входящих сумм заказов не зависит от наличия отгрузок и
    // себестоимости, поэтому остаётся полным даже при незавершённых заказах.
    const marginDecomposition = useMemo(() => {
        const accumulate = (rows) => {
            const map = new Map();
            rows.forEach((row) => {
                const key = row.customer_id ?? row.customer_name ?? 'unknown';
                const item = map.get(key) || {
                    key,
                    customer_name: row.customer_name || 'Без клиента',
                    orderTotal: 0,
                    unpricedQuantity: 0,
                };
                item.orderTotal += Number(
                    row.order_total ?? row.revenue_total ?? 0
                );
                item.unpricedQuantity += Number(
                    row.unpriced_order_quantity || 0
                );
                map.set(key, item);
            });
            return map;
        };
        const currentMap = accumulate(profitRows);
        const prevMap = accumulate(prevProfitRows);
        const keys = new Set([...currentMap.keys(), ...prevMap.keys()]);
        const rows = [];
        keys.forEach((key) => {
            const cur = currentMap.get(key);
            const prev = prevMap.get(key);
            const currentTotal = cur?.orderTotal || 0;
            const previousTotal = prev?.orderTotal || 0;
            const orderDelta = currentTotal - previousTotal;
            let tag = null;
            if (!prev) {
                tag = 'new';
            } else if (!cur) {
                tag = 'lost';
            }
            rows.push({
                key,
                customer_name: (cur || prev).customer_name,
                previous_total: previousTotal,
                current_total: currentTotal,
                order_delta: orderDelta,
                change_pct: previousTotal > 0
                    ? (orderDelta / previousTotal) * 100
                    : null,
                has_unpriced: (
                    (cur?.unpricedQuantity || 0)
                    + (prev?.unpricedQuantity || 0)
                ) > 0,
                tag,
            });
        });
        return rows
            .sort((a, b) => (
                Math.abs(b.order_delta) - Math.abs(a.order_delta)
            ))
            .slice(0, 10);
    }, [profitRows, prevProfitRows]);

    const frozenStockRows = useMemo(
        () => [
            ...(inventoryControl?.dead_stock || []),
            ...(inventoryControl?.slow_movers || []),
        ].sort(
            (a, b) => Number(b.frozen_value || 0) - Number(a.frozen_value || 0)
        ).slice(0, 50),
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
        ).slice(0, 50),
        [inventoryControl]
    );

    const supplierPartnerRows = supplierPurchaseMode === 'cross_docking'
        ? orderDynamics?.suppliers_cross_docking || []
        : orderDynamics?.suppliers_warehouse || orderDynamics?.suppliers || [];

    const refreshOrderDynamics = useCallback(async () => {
        const response = await getOrderDynamics({ days: 14, partner_limit: 1000 });
        setOrderDynamics(response?.data || null);
    }, []);

    const sendWatchOffer = useCallback(async (watchItem, offer) => {
        const offerKey = `${watchItem.id}:${offer.key}`;
        const quantity = Math.max(
            Number(watchOrderQty[offerKey] || offer.min_qnt || 1),
            Number(offer.min_qnt || 1)
        );
        setWatchSendingKey(offerKey);
        try {
            if (offer.source_type === 'supplier') {
                const { data: createdOrder } = await createManualSupplierOrder({
                    provider_id: Number(offer.supplier_id),
                    items: [{
                        autopart_id: offer.autopart_id,
                        oem: offer.oem_number,
                        brand: offer.brand_name,
                        name: offer.autopart_name,
                        quantity,
                        price: offer.price,
                        min_delivery_day: offer.min_delivery_day,
                        max_delivery_day: offer.max_delivery_day,
                    }],
                });
                const { data: sent } = await sendSupplierOrders([
                    createdOrder.id,
                ]);
                if (Number(sent?.sent || 0) < 1) {
                    throw new Error('Письмо поставщику не отправлено');
                }
                message.success(
                    `Заказ отправлен поставщику ${offer.supplier_name}: ${quantity} шт.`
                );
                await refreshOrderDynamics();
                return;
            }
            if (!selectedCustomerId) {
                message.warning('Выберите клиента для заказа на сайте');
                return;
            }
            if (!offer.hash_key) {
                message.warning(
                    'Снимок предложения сайта не содержит ключ заказа'
                );
                return;
            }
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
            message.error(error?.response?.data?.detail || error?.message || 'Не удалось оформить заказ');
        } finally {
            setWatchSendingKey(null);
        }
    }, [refreshOrderDynamics, selectedCustomerId, watchOrderQty]);

    const removeWatchItem = useCallback(async (item) => {
        setWatchRemovingId(item.id);
        try {
            await deleteWatchItem(item.id);
            setWatchItems((previous) => (
                previous.filter((row) => row.id !== item.id)
            ));
            message.success(
                `Позиция ${item.brand} ${item.oem} снята с отслеживания`
            );
        } catch (error) {
            message.error(
                error?.response?.data?.detail
                || 'Не удалось снять позицию с отслеживания'
            );
        } finally {
            setWatchRemovingId(null);
        }
    }, []);

    const watchColumns = [
        {
            title: 'Позиция',
            key: 'position',
            width: '32%',
            render: (_, row) => {
                const bestName = (watchOffers[row.id] || [])
                    .map((offer) => getReadableAutopartName(offer.autopart_name, row))
                    .find(Boolean);
                return (
                    <Space direction="vertical" size={0}>
                        <Text strong>{row.brand} {row.oem}</Text>
                        {bestName ? (
                            <Text type="secondary" ellipsis={{ tooltip: bestName }}>
                                {bestName}
                            </Text>
                        ) : null}
                        <Text type="secondary">Контрольная цена: {formatMoney(row.max_price)}</Text>
                    </Space>
                );
            },
        },
        {
            title: 'Цены / склад',
            key: 'prices',
            width: '46%',
            render: (_, row) => (
                <div className="dashboard-watch-metrics">
                    <div>
                        <Text type="secondary">Прайс</Text>
                        <Text>{formatMoney(row.last_seen_provider_price)}</Text>
                        <Text type="secondary">{formatDateTime(row.last_seen_provider_at)}</Text>
                    </div>
                    <div>
                        <Text type="secondary">Сайт</Text>
                        <Text>{formatMoney(row.last_seen_site_price)}</Text>
                        <Text type="secondary">{formatDateTime(row.last_seen_site_at)}</Text>
                    </div>
                    <div>
                        <Text type="secondary">Закупка</Text>
                        <Text>{row.last_purchase_price != null
                            ? formatMoney(row.last_purchase_price)
                            : '—'}</Text>
                        <Text type="secondary">{formatDateTime(row.last_purchase_at)}</Text>
                    </div>
                    <div>
                        <Text type="secondary">Сейчас</Text>
                        <Text>{row.current_price != null
                            ? formatMoney(row.current_price)
                            : '—'}</Text>
                        <Text type="secondary">
                            Остаток: {row.stock_quantity != null
                                ? `${formatNumber(row.stock_quantity)} шт.`
                                : '—'}
                        </Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'Решение',
            key: 'decision',
            width: '22%',
            render: (_, row) => {
                const prices = [row.last_seen_provider_price, row.last_seen_site_price]
                    .map(Number)
                    .filter((value) => Number.isFinite(value) && value > 0);
                const bestPrice = prices.length ? Math.min(...prices) : null;
                const limitReached = bestPrice != null
                    && row.max_price != null
                    && bestPrice <= Number(row.max_price);
                const aboveLimit = bestPrice != null
                    && row.max_price != null
                    && bestPrice > Number(row.max_price);
                return (
                    <Space direction="vertical" size={8} className="dashboard-watch-decision">
                        {limitReached
                            ? <Tag color="green">Цена достигнута</Tag>
                            : <Tag color={aboveLimit ? 'orange' : bestPrice != null ? 'blue' : 'default'}>
                                {aboveLimit
                                    ? `Выше лимита · ${formatMoney(bestPrice)}`
                                    : bestPrice != null
                                        ? `Лучшая ${formatMoney(bestPrice)}`
                                        : 'Нет цены'}
                            </Tag>}
                        <Popconfirm
                            title="Снять позицию с отслеживания?"
                            description={`${row.brand} ${row.oem} исчезнет из сводки и регламентных проверок.`}
                            okText="Снять"
                            cancelText="Отмена"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => void removeWatchItem(row)}
                        >
                            <Button
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                loading={watchRemovingId === row.id}
                            >
                                Снять
                            </Button>
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

    const watchOfferColumns = (watchItem) => [
        {
            title: 'Поставщик / предложение',
            key: 'offer',
            width: '48%',
            render: (_, row) => {
                const itemName = getReadableAutopartName(row.autopart_name, watchItem);
                return (
                    <Space direction="vertical" size={2}>
                        <Space size={6} wrap>
                            <Text strong>{row.supplier_name}</Text>
                            <Tag color={row.source_type === 'supplier' ? 'blue' : 'green'}>
                                {row.source_type === 'supplier' ? 'Прайс / email' : 'Сайт'}
                            </Tag>
                        </Space>
                        <Text strong>{row.brand_name} {row.oem_number}</Text>
                        {itemName ? (
                            <Text type="secondary" ellipsis={{ tooltip: itemName }}>
                                {itemName}
                            </Text>
                        ) : null}
                        <Text>{formatMoney(row.price)}</Text>
                    </Space>
                );
            },
        },
        {
            title: 'Наличие и срок',
            key: 'terms',
            width: '24%',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatNumber(row.quantity)} шт. · кратн. {row.min_qnt}</Text>
                    <Text type="secondary">
                        {row.min_delivery_day ?? '—'}–{row.max_delivery_day ?? '—'} дн.
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Заказать',
            key: 'order',
            width: '28%',
            render: (_, offer) => {
                const offerKey = `${watchItem.id}:${offer.key}`;
                return (
                    <Space wrap size={6}>
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
                            disabled={offer.source_type === 'supplier'
                                ? !offer.supplier_id
                                : !offer.hash_key}
                            loading={watchSendingKey === offerKey}
                            onClick={() => void sendWatchOffer(watchItem, offer)}
                        >
                            {offer.source_type === 'supplier'
                                ? 'Отправить'
                                : 'На сайт'}
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

    const customerPartnerColumns = [
        {
            title: 'Контрагент',
            dataIndex: 'partner_name',
            ellipsis: true,
            render: (value) => <Text strong>{value}</Text>,
        },
        { title: 'Заказов', dataIndex: 'order_count', width: 80 },
        {
            title: 'Сумма',
            dataIndex: 'total_sum',
            width: 130,
            render: formatMoney,
        },
    ];

    const supplierPartnerColumns = [
        ...customerPartnerColumns,
    ];

    const profitDailyColumns = [
        { title: 'Дата', dataIndex: 'date', width: 90, render: formatShortDate },
        { title: 'Заказано', dataIndex: 'ordered_quantity', width: 100, render: (value) => `${formatNumber(value)} шт.` },
        { title: 'Сумма заказов', dataIndex: 'order_total', width: 140, render: formatMoney },
        { title: 'Себестоимость', dataIndex: 'cost', width: 140, render: formatMoney },
        {
            title: 'Расч. прибыль',
            dataIndex: 'gross_profit',
            width: 150,
            render: (value) => value == null ? '—' : formatMoney(value),
        },
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
        { title: 'Сумма заказов', dataIndex: 'order_total', width: 130, render: formatMoney },
        {
            title: 'Расч. прибыль',
            dataIndex: 'gross_profit',
            width: 130,
            render: (value) => value == null ? '—' : formatMoney(value),
        },
        {
            title: 'Маржа',
            dataIndex: 'margin_pct',
            width: 100,
            render: (value) => value == null
                ? <Tag color="orange">Нет себест.</Tag>
                : <Tag color={value < 10 ? 'red' : value < 20 ? 'orange' : 'green'}>{formatNumber(value, 1)}%</Tag>,
        },
    ];

    const decompositionTagMeta = {
        new: { color: 'blue', text: 'новый' },
        lost: { color: 'default', text: 'ушёл' },
    };

    const marginDecompositionColumns = [
        {
            title: 'Клиент',
            key: 'customer',
            ellipsis: true,
            render: (_, row) => (
                <Space size={6}>
                    <Text strong ellipsis>{row.customer_name}</Text>
                    {row.tag ? (
                        <Tag color={decompositionTagMeta[row.tag].color}>
                            {decompositionTagMeta[row.tag].text}
                        </Tag>
                    ) : null}
                    {row.has_unpriced ? (
                        <Tag color="orange">есть строки без цены</Tag>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Предыдущие 30 дней',
            dataIndex: 'previous_total',
            width: 170,
            render: formatMoney,
        },
        {
            title: 'Текущие 30 дней',
            dataIndex: 'current_total',
            width: 160,
            render: formatMoney,
        },
        {
            title: 'Изменение',
            dataIndex: 'order_delta',
            width: 140,
            render: renderSignedMoney,
        },
        {
            title: 'Динамика',
            dataIndex: 'change_pct',
            width: 110,
            render: (value, row) => {
                if (value == null) {
                    return row.current_total > 0 ? <Tag color="blue">новый</Tag> : '—';
                }
                return (
                    <Tag color={value < 0 ? 'red' : value > 0 ? 'green' : 'default'}>
                        {value > 0 ? '+' : ''}{formatNumber(value, 1)}%
                    </Tag>
                );
            },
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
        {
            title: 'Продажи / наличие',
            key: 'demand',
            width: 150,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatNumber(row.sold_last_365_days)} шт. за 365д</Text>
                    <Text type="secondary">
                        наличие: {formatNumber(row.in_stock_days_365 || 0)} дн.
                    </Text>
                </Space>
            ),
        },
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
        {
            title: 'Спрос 30д',
            key: 'demand_30',
            width: 105,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatNumber(row.sold_last_30_days)}</Text>
                    <Text type="secondary">{formatNumber(row.in_stock_days_30 || 0)} дн. нал.</Text>
                </Space>
            ),
        },
        {
            title: 'Спрос 365д',
            key: 'demand_365',
            width: 110,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{formatNumber(row.sold_last_365_days)}</Text>
                    <Text type="secondary">{formatNumber(row.in_stock_days_365 || 0)} дн. нал.</Text>
                </Space>
            ),
        },
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
            width: 360,
            render: (_, row) => (
                <MetricHistory points={row.points} valueKey="total_sku_count" />
            ),
        },
        {
            title: 'Изменение цены',
            key: 'index',
            width: 390,
            render: (_, row) => (
                <TrendHistoryList
                    points={row.points}
                    render={(point) => (
                        <span>
                            Δ {renderPriceDelta(point.step_index_pct)}
                            {point.changed_share_pct != null ? (
                                <span className="dashboard-trend-detail">
                                    {`изменилось ${formatNumber(point.changed_share_pct, 0)}% позиций`}
                                </span>
                            ) : null}
                        </span>
                    )}
                />
            ),
        },
        {
            title: 'Изменение состава',
            key: 'coverage',
            width: 340,
            render: (_, row) => (
                <TrendHistoryList
                    points={row.points}
                    render={(point) => {
                        if (point.new_positions == null && point.removed_positions == null) {
                            return <span style={{ color: '#94a3b8' }}>—</span>;
                        }
                        const added = Number(point.new_positions || 0);
                        const removed = Number(point.removed_positions || 0);
                        return (
                            <span>
                                <span style={{ color: '#16a34a' }}>Новых +{added}</span>
                                <span className="dashboard-trend-detail" style={{ color: '#dc2626' }}>
                                    Ушло −{removed}
                                </span>
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
                        message="Показываем лучшие доступные предложения, даже если они дороже контрольной цены. Сайт проверяется по точному бренду и артикулу, без кроссов. Контрольная цена влияет только на статус и уведомления."
                    />
                    <Table
                        rowKey="id"
                        loading={loading}
                        columns={watchColumns}
                        dataSource={watchItems}
                        pagination={false}
                        tableLayout="fixed"
                        className="dashboard-watch-table"
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
                                        tableLayout="fixed"
                                        className="dashboard-watch-offers"
                                    />
                                ) : (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={watchItem.last_seen_site_at
                                            ? `Последняя цена ${formatMoney(watchItem.last_seen_site_price)} найдена ${formatDateTime(watchItem.last_seen_site_at)}. Подробный снимок появится после следующей регламентной проверки.`
                                            : 'Регламент ещё не находил предложений с положительным остатком при точном поиске без кроссов'}
                                    />
                                )
                            ),
                        }}
                    />
                </Card>

                <Card title="Заказы: динамика за 14 дней">
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic title="Заказы клиентов" value={orderSummary.customer_order_count || 0} suffix={`· ${formatNumber(orderSummary.customer_qty || 0)} шт.`} />
                                <MonthDelta
                                    current={orderSummary.customer_order_count}
                                    previous={prevOrderSummary?.customer_order_count}
                                    mode="percent"
                                    label="к пред. 14 дням"
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic title="Сумма клиентского спроса" value={Number(orderSummary.customer_sum || 0)} precision={0} suffix="руб." />
                                <MonthDelta
                                    current={orderSummary.customer_sum}
                                    previous={prevOrderSummary?.customer_sum}
                                    mode="percent"
                                    label="к пред. 14 дням"
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic title="Заказы поставщикам" value={orderSummary.supplier_order_count || 0} suffix={`· ${formatNumber(orderSummary.supplier_qty || 0)} шт.`} />
                                <MonthDelta
                                    current={orderSummary.supplier_order_count}
                                    previous={prevOrderSummary?.supplier_order_count}
                                    mode="percent"
                                    label="к пред. 14 дням"
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic title="Покрытие закупкой" value={orderSummary.purchase_coverage_pct ?? 0} precision={1} suffix="%" />
                                <MonthDelta
                                    current={orderSummary.purchase_coverage_pct}
                                    previous={prevOrderSummary?.purchase_coverage_pct}
                                    mode="pp"
                                    label="к пред. 14 дням"
                                />
                            </Card>
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
                                <Table rowKey="partner_id" size="small" columns={customerPartnerColumns} dataSource={orderDynamics?.customers || []} pagination={{ pageSize: 10, showSizeChanger: true }} />
                            </Card>
                        </Col>
                        <Col xs={24} xl={12}>
                            <Card
                                size="small"
                                title="У кого больше заказываем мы"
                                extra={(
                                    <Segmented
                                        size="small"
                                        value={supplierPurchaseMode}
                                        onChange={setSupplierPurchaseMode}
                                        options={[
                                            { label: 'На склад', value: 'warehouse' },
                                            { label: 'Cross-docking', value: 'cross_docking' },
                                        ]}
                                    />
                                )}
                            >
                                <Table
                                    rowKey="partner_id"
                                    size="small"
                                    columns={supplierPartnerColumns}
                                    dataSource={supplierPartnerRows}
                                    pagination={{ pageSize: 10, showSizeChanger: true }}
                                />
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

                <Card title="Суммы заказов и расчётная маржа · последние 30 дней">
                    {profitIsEstimated && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message="Сумма считается по всем входящим заказам. Прибыль и маржа являются оценочными: они рассчитаны только по обработанным строкам с известной себестоимостью."
                        />
                    )}
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Сумма заказов"
                                    value={profitAnalytics.totals.orderTotal}
                                    precision={0}
                                    suffix="руб."
                                />
                                <MonthDelta
                                    current={profitAnalytics.totals.orderTotal}
                                    previous={prevProfitTotals.orderTotal}
                                    mode="percent"
                                />
                            </Card>
                        </Col>
                        <Col xs={12} lg={6}>
                            <Card size="small">
                                <Statistic
                                    title="Расчётная прибыль"
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
                                    title="Расчётная маржа"
                                    value={profitAnalytics.totals.marginPct}
                                    precision={1}
                                    suffix="%"
                                />
                                <MonthDelta
                                    current={profitAnalytics.totals.marginPct}
                                    previous={prevProfitTotals.marginPct}
                                    mode="pp"
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
                            message={`${formatNumber(profitAnalytics.totals.uncostedQuantity)} шт. ${profitIsEstimated ? 'исполнено' : 'отгружено'} без известной себестоимости. Для них прибыль и общая маржа не считаются.`}
                        />
                    )}
                    {profitAnalytics.totals.unpricedOrderQuantity > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`${formatNumber(profitAnalytics.totals.unpricedOrderQuantity)} шт. заказано без цены. Эти позиции учтены в количестве, но не увеличивают сумму заказов.`}
                        />
                    )}
                    {!profitRows.length && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message="За последние 30 дней строки клиентских заказов не найдены."
                        />
                    )}
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col xs={24} xl={10}>
                            <Card
                                size="small"
                                title="Месяц к месяцу · нарастающий итог"
                                extra={(
                                    <Segmented
                                        size="small"
                                        value={marginChartMetric}
                                        onChange={setMarginChartMetric}
                                        options={[
                                            { label: 'Сумма заказов', value: 'revenue' },
                                            { label: 'Расч. прибыль', value: 'profit' },
                                            { label: 'Расч. маржа %', value: 'margin' },
                                        ]}
                                    />
                                )}
                            >
                                <MarginMonthChart
                                    currentRows={profitRows}
                                    prevRows={prevProfitRows}
                                    metric={marginChartMetric}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} xl={14}>
                            <Card
                                size="small"
                                title="Изменение суммы заказов · месяц к месяцу"
                            >
                                <Table
                                    rowKey="key"
                                    size="small"
                                    columns={marginDecompositionColumns}
                                    dataSource={marginDecomposition}
                                    pagination={false}
                                    scroll={{ x: 740 }}
                                />
                            </Card>
                        </Col>
                    </Row>
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
                    {Number(inventoryControl?.summary?.valuation_fallback_skus || 0) > 0 && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`Для ${formatNumber(inventoryControl.summary.valuation_fallback_skus)} позиций закупочная цена не заполнена: стоимость оценена по цене последнего нашего прайса.`}
                        />
                    )}
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
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        scroll={{ x: 900 }}
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
                        pagination={{ pageSize: 10, showSizeChanger: false }}
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
                        scroll={{ x: 1320 }}
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
