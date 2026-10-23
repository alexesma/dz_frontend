import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Drawer,
    Empty,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    deleteCustomerOrder,
    forceCustomerOrderPriceOverride,
    getCustomerOrder,
    getCustomerOrderPriceOverridePreview,
    getCustomerOrderItemStats,
    processManualCustomerOrder,
    processPartsSoftOrderLocally,
    recheckCustomerOrderItemOffer,
    retryCustomerOrder,
    selectCustomerOrderPricelist,
    updateCustomerOrder,
    updateCustomerOrderItem,
} from '../api/customerOrders';
import { getCustomersSummary } from '../api/customers';
import { getAllProviders } from '../api/providers';
import useAuth from '../context/useAuth';
import CustomerOrderEditModal from './CustomerOrderEditModal';

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

const RECHECKABLE_REASONS = new Set([
    'NO_OFFER', 'NO_TARGET_PRICE', 'OFFER_MATCH_DIAGNOSTIC', 'ZERO_STOCK',
    'NONPOSITIVE_OFFER', 'FILTERED_BY_SOURCE_RULE',
    'FILTERED_BY_PRICE_CONFIG', 'PRICE_TOO_HIGH',
]);

const displayBrand = (value) => String(value || '').trim().toUpperCase();
const displayOem = (value) => {
    const original = String(value || '').trim();
    return original.replace(/[^a-z0-9]/gi, '').toUpperCase() || original;
};

const INITIAL_ITEM_VIEW = {
    search: '',
    supplierIds: [],
    status: 'all',
    minPrice: null,
    maxPrice: null,
    sortBy: 'original',
    sortDirection: 'asc',
};

const compareValues = (left, right, direction) => {
    const leftMissing = left === null || left === undefined || left === '';
    const rightMissing = right === null || right === undefined || right === '';
    if (leftMissing || rightMissing) {
        return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
    }
    const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'ru', { numeric: true });
    return direction === 'desc' ? -comparison : comparison;
};

const CustomerOrderDetailPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const requestedReturnTo = new URLSearchParams(location.search).get('returnTo');
    const returnTo = requestedReturnTo === '/customer-orders'
        || requestedReturnTo?.startsWith('/customer-orders?')
        ? requestedReturnTo : '/customer-orders';
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [updatingItems, setUpdatingItems] = useState({});
    const [processing, setProcessing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [routingChoice, setRoutingChoice] = useState(null);
    const [routingSaving, setRoutingSaving] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [savingOrder, setSavingOrder] = useState(false);
    const [deletingOrder, setDeletingOrder] = useState(false);
    const [processingPartsSoftLocally, setProcessingPartsSoftLocally] = useState(false);
    const [priceOverride, setPriceOverride] = useState({
        open: false,
        item: null,
        preview: null,
        loading: false,
        submitting: false,
    });
    const [statsOpen, setStatsOpen] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsMeta, setStatsMeta] = useState({ kind: 'oem', value: '', label: '' });
    const [statsData, setStatsData] = useState(null);
    const statsCacheRef = useRef(new Map());
    const [itemView, setItemView] = useState(INITIAL_ITEM_VIEW);

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

    const providerNames = useMemo(
        () => new Map((providers || []).map((provider) => [provider.id, provider.name])),
        [providers]
    );

    const orderProviderOptions = useMemo(() => {
        const ids = [...new Set((order?.items || [])
            .map((item) => item.supplier_id)
            .filter((id) => id !== null && id !== undefined))];
        return [
            { value: 'unassigned', label: 'Без поставщика' },
            ...ids.map((id) => ({
                value: id,
                label: providerNames.get(id) || `Поставщик #${id}`,
            })).sort((a, b) => a.label.localeCompare(b.label, 'ru')),
        ];
    }, [order?.items, providerNames]);

    const visibleItems = useMemo(() => {
        const query = itemView.search.trim().toLocaleLowerCase('ru');
        const articleQuery = displayOem(query);
        const rows = (order?.items || []).map((item, index) => ({ item, index }))
            .filter(({ item }) => {
                if (itemView.supplierIds.length) {
                    const supplierKey = item.supplier_id ?? 'unassigned';
                    if (!itemView.supplierIds.includes(supplierKey)) return false;
                }
                if (itemView.status !== 'all' && item.status !== itemView.status) return false;
                const price = item.requested_price == null ? null : Number(item.requested_price);
                if (itemView.minPrice != null && (price == null || price < itemView.minPrice)) return false;
                if (itemView.maxPrice != null && (price == null || price > itemView.maxPrice)) return false;
                if (!query) return true;
                const searchable = [
                    item.oem, item.brand, item.name,
                    item.actual_oem, item.actual_brand, item.actual_name,
                    providerNames.get(item.supplier_id),
                ].some((value) => String(value || '').toLocaleLowerCase('ru').includes(query));
                return searchable || (articleQuery && [item.oem, item.actual_oem]
                    .some((value) => displayOem(value).includes(articleQuery)));
            });

        if (itemView.sortBy === 'original') return rows.map(({ item }) => item);
        const sortValue = (item) => {
            switch (itemView.sortBy) {
                case 'supplier': return item.supplier_id == null
                    ? null : providerNames.get(item.supplier_id) || `Поставщик #${item.supplier_id}`;
                case 'price': return item.requested_price == null ? null : Number(item.requested_price);
                case 'oem': return displayOem(item.oem);
                case 'brand': return displayBrand(item.brand);
                case 'quantity': return Number(item.requested_qty ?? 0);
                case 'shipped': return Number(item.ship_qty ?? 0);
                case 'rejected': return Number(item.reject_qty ?? 0);
                case 'status': return ITEM_STATUS_LABELS[item.status] || item.status || null;
                default: return null;
            }
        };
        rows.sort((left, right) => (
            compareValues(sortValue(left.item), sortValue(right.item), itemView.sortDirection)
            || left.index - right.index
        ));
        return rows.map(({ item }) => item);
    }, [order?.items, itemView, providerNames]);

    const updateItemView = (key, value) => {
        setItemView((prev) => ({ ...prev, [key]: value }));
    };


    const fetchData = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const [orderResp, customersResp] =
                await Promise.allSettled([
                    getCustomerOrder(orderId),
                    getCustomersSummary({ page: 1, page_size: 200 }),
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

        } catch {
            message.error('Не удалось загрузить заказ');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    const formatApiDetail = (detail, fallback) => {
        if (typeof detail === 'string') return detail;
        if (detail?.message) return detail.message;
        return fallback;
    };

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        getAllProviders({ sort_by: 'name', sort_dir: 'asc' })
            .then(setProviders)
            .catch(() => message.error('Не удалось загрузить поставщиков'));
    }, []);

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
            const response = await updateCustomerOrderItem(item.id, {
                status: 'SUPPLIER',
                supplier_id: supplierId,
            });
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success('Поставщик назначен');
            fetchData();
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось обновить позицию',
            );
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
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось обновить позицию',
            );
            message.error(detail);
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const handleOwnStock = async (item) => {
        setItemUpdating(item.id, true);
        try {
            const response = await updateCustomerOrderItem(item.id, { status: 'OWN_STOCK' });
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success('Позиция отправлена на наш склад');
            fetchData();
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось обновить позицию',
            );
            message.error(detail);
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const handleRecheckOffer = async (item) => {
        setItemUpdating(item.id, true);
        try {
            const response = await recheckCustomerOrderItemOffer(item.id);
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success(
                response.data?.status === 'OWN_STOCK'
                    ? 'Позиция добавлена в сборку с нашего склада'
                    : 'Позиция добавлена в заказ поставщику',
            );
            fetchData();
        } catch (err) {
            message.error(formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось подобрать текущее предложение',
            ));
        } finally {
            setItemUpdating(item.id, false);
        }
    };

    const closePriceOverride = () => {
        if (priceOverride.submitting) return;
        setPriceOverride({
            open: false,
            item: null,
            preview: null,
            loading: false,
            submitting: false,
        });
    };

    const handleOpenPriceOverride = async (item) => {
        setPriceOverride({
            open: true,
            item,
            preview: null,
            loading: true,
            submitting: false,
        });
        try {
            const response = await getCustomerOrderPriceOverridePreview(item.id);
            setPriceOverride((prev) => ({
                ...prev,
                preview: response.data,
                loading: false,
            }));
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось проверить актуальное предложение поставщика',
            );
            message.error(detail);
            setPriceOverride({
                open: false,
                item: null,
                preview: null,
                loading: false,
                submitting: false,
            });
        }
    };

    const handleConfirmPriceOverride = async () => {
        const itemId = priceOverride.item?.id;
        if (!itemId || !priceOverride.preview) return;
        setPriceOverride((prev) => ({ ...prev, submitting: true }));
        try {
            const response = await forceCustomerOrderPriceOverride(itemId);
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success(
                `Заказ поставщику №${response.data.supplier_order_id} создан`,
            );
            setPriceOverride({
                open: false,
                item: null,
                preview: null,
                loading: false,
                submitting: false,
            });
            fetchData();
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось создать заказ поставщику',
            );
            message.error(detail);
            setPriceOverride((prev) => ({ ...prev, submitting: false }));
        }
    };

    const handleProcessOrder = async () => {
        if (!order) return;
        setProcessing(true);
        try {
            const response = await processManualCustomerOrder(order.id);
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success('Заказ обработан');
            fetchData();
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось обработать заказ',
            );
            message.error(detail);
            // Parts-Soft can persist a list of possible price routes while
            // returning a conflict. Reload so the operator immediately sees
            // the selector instead of being left with only the error toast.
            await fetchData();
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

    const handleRoutingChoice = async () => {
        if (!order || !routingChoice) return;
        setRoutingSaving(true);
        try {
            await selectCustomerOrderPricelist(order.id, routingChoice);
            message.success(
                order.external_source === 'PARTS_SOFT'
                    ? 'Конфигурация выбрана. Теперь можно принять заказ.'
                    : 'Конфигурация выбрана. Теперь можно повторить обработку.',
            );
            setRoutingChoice(null);
            await fetchData();
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось выбрать прайс'));
        } finally {
            setRoutingSaving(false);
        }
    };

    const handleProcessPartsSoftLocally = async () => {
        if (!order) return;
        setProcessingPartsSoftLocally(true);
        try {
            const response = await processPartsSoftOrderLocally(order.id);
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success('Заказ передан в локальную обработку');
            fetchData();
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось обработать заказ у нас'));
        } finally {
            setProcessingPartsSoftLocally(false);
        }
    };

    const handleSaveOrder = async (payload) => {
        if (!order) return;
        setSavingOrder(true);
        try {
            const response = await updateCustomerOrder(order.id, payload);
            setOrder(response.data);
            setEditOpen(false);
            message.success('Заказ обновлён');
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось обновить заказ'));
        } finally {
            setSavingOrder(false);
        }
    };

    const handleDeleteOrder = async () => {
        if (!order) return;
        setDeletingOrder(true);
        try {
            await deleteCustomerOrder(order.id);
            message.success('Заказ удалён из рабочего списка');
            navigate(returnTo);
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось удалить заказ'));
        } finally {
            setDeletingOrder(false);
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
            const requestedQty = Number(item.requested_qty ?? 0);
            let rejectQty = Number(item.reject_qty ?? 0);
            if (!rejectQty && item.status === 'REJECTED') {
                rejectQty = requestedQty;
            }
            if (rejectQty > 0) {
                rejectedSum += rejectQty * price;
            }

            let shipQty = 0;
            if (item.status === 'OWN_STOCK' || item.status === 'SUPPLIER') {
                if (item.ship_qty != null) {
                    shipQty = Number(item.ship_qty ?? 0);
                } else if (rejectQty > 0) {
                    shipQty = Math.max(requestedQty - rejectQty, 0);
                } else {
                    shipQty = requestedQty;
                }
            }

            if (item.status === 'OWN_STOCK') {
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

    const rejectedItems = useMemo(() => {
        const orderItems = order?.items || [];
        return orderItems
            .filter((item) => Number(item.reject_qty ?? 0) > 0)
            .map((item) => {
                if (item.row_index == null) return item;
                const parts = orderItems.filter((part) => part.row_index === item.row_index);
                const rejectedParts = parts.filter((part) => Number(part.reject_qty ?? 0) > 0);
                if (rejectedParts.length !== 1) return item;
                return {
                    ...item,
                    requested_qty: parts.reduce((sum, part) => sum + Number(part.requested_qty || 0), 0),
                    ship_qty: parts.reduce((sum, part) => sum + Number(part.ship_qty || 0), 0),
                };
            });
    }, [order?.items]);

    const splitRowTotals = useMemo(() => {
        const totals = new Map();
        (order?.items || []).forEach((item) => {
            if (item.row_index == null) return;
            const current = totals.get(item.row_index) || { count: 0, quantity: 0 };
            current.count += 1;
            current.quantity += Number(item.requested_qty || 0);
            totals.set(item.row_index, current);
        });
        return totals;
    }, [order?.items]);

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
            title: 'Позиция клиента',
            key: 'requested_part',
            width: '24%',
            render: (_, record) => (
                <div className="customer-order-part-cell">
                    <Space size={4} wrap>
                        <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => openAutopartSearch(record)}>
                            <span title={`В заказе: ${record.oem}`}>{displayOem(record.oem)}</span>
                        </Button>
                        <Tooltip title="Статистика по артикулу">
                            <Button type="text" size="small" icon={<BarChartOutlined />} onClick={() => loadStats('oem', record.oem, record.oem)} />
                        </Tooltip>
                        <Tooltip title="Искать в прайсах и на сайте">
                            <Button type="text" size="small" icon={<SearchOutlined />} onClick={() => openAutopartSearch(record)} />
                        </Tooltip>
                    </Space>
                    <div className="customer-order-line" title={record.name || ''}>
                        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => loadStats('brand', record.brand, record.brand)}>
                            <span title={`В заказе: ${record.brand}`}>{displayBrand(record.brand)}</span>
                        </Button>
                        <Text type="secondary"> · {record.name || '—'}</Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'Подобрано',
            key: 'actual_part',
            width: '22%',
            render: (_, record) => (
                <div className="customer-order-part-cell">
                    <div title={record.actual_oem ? `${record.actual_brand || ''} ${record.actual_oem}`.trim() : ''}>
                        {record.actual_oem ? `${displayBrand(record.actual_brand)} ${displayOem(record.actual_oem)}`.trim() : '—'}
                    </div>
                    {record.actual_name && (
                        <div className="customer-order-line" title={record.actual_name}>
                            <Text type="secondary">{record.actual_name}</Text>
                            {record.match_type === 'dragonzap_cross' && <Tag color="blue" style={{ marginLeft: 4 }}>кросс</Tag>}
                        </div>
                    )}
                    {!record.actual_name && record.match_type === 'dragonzap_cross' && <Tag color="blue">кросс</Tag>}
                    {record.source_resolution_status && (
                        <Tooltip title={`Источник: ${record.external_provider_id || 'не указан'}; предложение: ${record.external_offer_id || 'не указано'}`}>
                            <Tag color={record.source_resolution_status === 'api_order_error' ? 'red' : 'geekblue'}>
                                {record.source_resolution_status === 'local_workflow'
                                    ? 'локальная обработка'
                                    : record.source_resolution_status === 'partssoft_processed'
                                        ? 'обработано сайтом'
                                        : record.source_resolution_status}
                            </Tag>
                        </Tooltip>
                    )}
                </div>
            ),
        },
        {
            title: 'Кол-во',
            key: 'quantities',
            width: 92,
            align: 'right',
            render: (_, record) => (
                <div className="customer-order-number-cell">
                    <div><Text type="secondary">заказ:</Text> {record.requested_qty}</div>
                    {splitRowTotals.get(record.row_index)?.count > 1 && (
                        <div><Text type="secondary">из строки:</Text> {splitRowTotals.get(record.row_index).quantity}</div>
                    )}
                    <div><Text type="secondary">отгр.:</Text> {record.ship_qty ?? '—'}</div>
                    {!!record.reject_qty && <div><Text type="danger">отказ: {record.reject_qty}</Text></div>}
                </div>
            ),
        },
        { title: 'Цена', dataIndex: 'requested_price', key: 'requested_price', width: 90, align: 'right', render: formatMoney },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (value) => <Tag color={ITEM_STATUS_COLORS[value] || 'default'}>{ITEM_STATUS_LABELS[value] || value || '—'}</Tag>,
        },
        {
            title: 'Поставщик',
            dataIndex: 'supplier_id',
            key: 'supplier_id',
            width: '16%',
            render: (value, record) => (
                <Select
                    showSearch
                    allowClear
                    placeholder="Поставщик"
                    options={providerOptions}
                    value={value || undefined}
                    onChange={(val) => handleSetSupplier(record, val)}
                    optionFilterProp="label"
                    loading={!!updatingItems[record.id]}
                    style={{ width: '100%', minWidth: 110 }}
                />
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 170,
            render: (_, record) => (
                <div className="table-actions customer-order-row-actions">
                    <Button size="small" onClick={() => handleOwnStock(record)} loading={!!updatingItems[record.id]}>Наш склад</Button>
                    <Button danger size="small" onClick={() => handleReject(record)} loading={!!updatingItems[record.id]}>Отказать</Button>
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
            render: (value) => <span title={`В заказе: ${value}`}>{displayOem(value)}</span>,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand',
            key: 'brand',
            width: 120,
            render: (value) => <span title={`В заказе: ${value}`}>{displayBrand(value)}</span>,
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
        {
            title: 'Действие',
            key: 'price_override_action',
            width: 230,
            render: (_, record) => {
                if (record.status !== 'REJECTED'
                    || !RECHECKABLE_REASONS.has(record.reject_reason_code)) return '—';
                return (
                    <Space size="small">
                        <Popconfirm
                            title="Проверить предложение сейчас?"
                            description="Если цена и остаток подходят, позиция будет добавлена в заказ на поставку или сборку."
                            onConfirm={() => handleRecheckOffer(record)}
                            okText="Проверить"
                            cancelText="Отмена"
                        >
                            <Button size="small" loading={updatingItems[record.id]}>
                                Проверить сейчас
                            </Button>
                        </Popconfirm>
                        {record.reject_reason_code === 'PRICE_TOO_HIGH' && (
                            <Button
                                type="primary"
                                size="small"
                                onClick={() => handleOpenPriceOverride(record)}
                            >
                                Принять цену
                            </Button>
                        )}
                    </Space>
                );
            },
        },
    ];

    const interruptedImport = order?.status === 'NEW'
        && order?.source_filename
        && !(order?.items || []).length;

    return (
        <div className="page-shell">
            <Card loading={loading}>
                <div className="page-header-actions" style={{ marginBottom: 16 }}>
                    <Button onClick={() => navigate(returnTo)}>
                        Назад к списку
                    </Button>
                    {order && (
                        <Button onClick={() => setEditOpen(true)}>
                            Редактировать заказ
                        </Button>
                    )}
                    {order && (
                        <Popconfirm
                            title="Удалить заказ?"
                            description="Заказ исчезнет из рабочего списка, история связанных операций сохранится."
                            okText="Удалить"
                            cancelText="Отмена"
                            okButtonProps={{ danger: true }}
                            onConfirm={handleDeleteOrder}
                        >
                            <Button danger loading={deletingOrder}>
                                Удалить заказ
                            </Button>
                        </Popconfirm>
                    )}
                    {order?.status === 'NEW' && !interruptedImport && (
                        <Button
                            type="primary"
                            onClick={handleProcessOrder}
                            loading={processing}
                        >
                            {order.external_source === 'PARTS_SOFT'
                                ? 'Принять заказ Parts-Soft'
                                : 'Автообработать'}
                        </Button>
                    )}
                    {order?.processing_owner === 'PARTS_SOFT_SITE' && (
                        <Popconfirm
                            title="Обработать заказ в нашей системе?"
                            description="Будут заново подобраны предложения и созданы локальные складские или поставщицкие заказы."
                            okText="Обработать у нас"
                            cancelText="Отмена"
                            onConfirm={handleProcessPartsSoftLocally}
                        >
                            <Button type="primary" loading={processingPartsSoftLocally}>
                                Обработать у нас
                            </Button>
                        </Popconfirm>
                    )}
                    {(order?.status === 'ERROR' || interruptedImport)
                        && order?.pricelist_routing?.basis !== 'review_required' && (
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
                {order?.pricelist_routing?.basis === 'review_required' && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Выберите прайс для обработки заказа"
                        description={(
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Text>
                                    Сравниваются только последние прайсы подходящих конфигураций
                                    и доступные сейчас предложения их поставщиков. Автоматически
                                    выбирается вариант с наименьшим ожидаемым отказом: по сумме заказа,
                                    а если цены заполнены не везде — по количеству штук.
                                </Text>
                                {order.pricelist_routing.review_reason && (
                                    <Text strong>{order.pricelist_routing.review_reason}</Text>
                                )}
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Выберите конфигурацию"
                                    value={routingChoice}
                                    onChange={setRoutingChoice}
                                    options={(order.pricelist_routing.candidates || []).map((candidate) => ({
                                        value: candidate.order_config_id,
                                        disabled: Boolean(candidate.filename
                                                && candidate.filename !== order.source_filename),
                                        label: `${candidate.name}: ${candidate.rejected_pct != null
                                            ? `ожидаемый отказ ${Number(candidate.rejected_pct).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}% (${candidate.rejection_metric === 'amount' ? 'по сумме' : 'по количеству'})`
                                            : `позиции ${candidate.positions}/${candidate.total}`}${candidate.parse_error || candidate.evaluation_error ? ` — ${candidate.parse_error || candidate.evaluation_error}` : ''}`,
                                    }))}
                                />
                                <Button onClick={handleRoutingChoice} disabled={!routingChoice} loading={routingSaving}>
                                    Сохранить выбор
                                </Button>
                            </Space>
                        )}
                    />
                )}
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
                            {order.pricelist_routing?.selected_order_config_id && (
                                <Descriptions.Item label="Прайс заказа">
                                    {order.pricelist_routing.candidates?.find((candidate) => (
                                        candidate.order_config_id === order.pricelist_routing.selected_order_config_id
                                    ))?.name}
                                    {' · '}
                                    {order.pricelist_routing.basis === 'manual'
                                        ? 'Выбран вручную'
                                        : order.pricelist_routing.basis === 'lowest_rejection'
                                            ? 'Минимальный ожидаемый отказ'
                                            : 'Определён по позициям и ценам'}
                                </Descriptions.Item>
                            )}
                            {order.pricelist_routing?.comparison === 'latest_pricelists' && (
                                <Descriptions.Item label="Ожидаемые отказы при выборе прайса">
                                    <Space direction="vertical" size={0}>
                                        {order.pricelist_routing.candidates?.map((candidate) => (
                                            <Text key={candidate.order_config_id}>
                                                {candidate.name}: {candidate.rejected_pct == null
                                                    ? 'не удалось оценить'
                                                    : `${Number(candidate.rejected_pct).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}% ${candidate.rejection_metric === 'amount' ? 'по сумме' : 'по количеству'}`}
                                            </Text>
                                        ))}
                                    </Space>
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Клиент">
                                <Button
                                    type="link"
                                    style={{ padding: 0, height: 'auto' }}
                                    onClick={() => navigate(`/customers/${order.customer_id}/edit`)}
                                >
                                    {customerMap[order.customer_id] || order.customer_id}
                                </Button>
                            </Descriptions.Item>
                            {order.external_source === 'PARTS_SOFT' && (
                                <Descriptions.Item label="Происхождение" span={2}>
                                    {order.import_origin === 'partssoft_recovery' && (
                                        <Tag color="blue">Восстановлен из Parts-Soft</Tag>
                                    )}
                                    {order.external_order_id
                                        ? ` Заказ сайта #${order.external_order_id}`
                                        : ''}
                                </Descriptions.Item>
                            )}
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
                        <Card size="small" style={{ marginBottom: 12 }}>
                            <Space wrap size={8}>
                                <Input
                                    allowClear
                                    aria-label="Поиск позиции в заказе"
                                    placeholder="Артикул, бренд, название"
                                    value={itemView.search}
                                    onChange={(event) => updateItemView('search', event.target.value)}
                                    style={{ width: 230 }}
                                />
                                <Select
                                    mode="multiple"
                                    allowClear
                                    showSearch
                                    aria-label="Фильтр по поставщикам"
                                    placeholder="Поставщики"
                                    optionFilterProp="label"
                                    maxTagCount="responsive"
                                    options={orderProviderOptions}
                                    value={itemView.supplierIds}
                                    onChange={(value) => updateItemView('supplierIds', value)}
                                    style={{ minWidth: 190, maxWidth: 330 }}
                                />
                                <Select
                                    aria-label="Фильтр по статусу"
                                    value={itemView.status}
                                    onChange={(value) => updateItemView('status', value)}
                                    options={[
                                        { value: 'all', label: 'Все статусы' },
                                        ...Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => ({ value, label })),
                                    ]}
                                    style={{ width: 150 }}
                                />
                                <InputNumber
                                    min={0}
                                    aria-label="Цена от"
                                    placeholder="Цена от"
                                    value={itemView.minPrice}
                                    onChange={(value) => updateItemView('minPrice', value)}
                                    style={{ width: 110 }}
                                />
                                <InputNumber
                                    min={0}
                                    aria-label="Цена до"
                                    placeholder="Цена до"
                                    value={itemView.maxPrice}
                                    onChange={(value) => updateItemView('maxPrice', value)}
                                    style={{ width: 110 }}
                                />
                                <Select
                                    aria-label="Сортировать позиции по"
                                    value={itemView.sortBy}
                                    onChange={(value) => updateItemView('sortBy', value)}
                                    options={[
                                        { value: 'original', label: 'Исходный порядок' },
                                        { value: 'supplier', label: 'Поставщик' },
                                        { value: 'price', label: 'Цена' },
                                        { value: 'oem', label: 'Артикул' },
                                        { value: 'brand', label: 'Бренд' },
                                        { value: 'quantity', label: 'Заказано' },
                                        { value: 'shipped', label: 'Отгружено' },
                                        { value: 'rejected', label: 'Отказано' },
                                        { value: 'status', label: 'Статус' },
                                    ]}
                                    style={{ width: 175 }}
                                />
                                <Select
                                    aria-label="Направление сортировки"
                                    value={itemView.sortDirection}
                                    disabled={itemView.sortBy === 'original'}
                                    onChange={(value) => updateItemView('sortDirection', value)}
                                    options={[
                                        { value: 'asc', label: 'По возрастанию' },
                                        { value: 'desc', label: 'По убыванию' },
                                    ]}
                                    style={{ width: 170 }}
                                />
                                <Button onClick={() => setItemView(INITIAL_ITEM_VIEW)}>
                                    Сбросить
                                </Button>
                                <Text type="secondary">
                                    Показано {visibleItems.length} из {order.items?.length || 0}
                                </Text>
                            </Space>
                        </Card>
                        <Table
                            className="customer-order-items-table"
                            rowKey="id"
                            dataSource={visibleItems}
                            columns={columns}
                            pagination={false}
                            size="small"
                            tableLayout="fixed"
                            locale={{ emptyText: 'Нет позиций по выбранным фильтрам' }}
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
            <CustomerOrderEditModal
                open={editOpen}
                order={order}
                customers={customers}
                loading={savingOrder}
                onCancel={() => setEditOpen(false)}
                onSave={handleSaveOrder}
            />
            <Modal
                title="Принять цену поставщика"
                open={priceOverride.open}
                onCancel={closePriceOverride}
                onOk={handleConfirmPriceOverride}
                okText="Создать заказ поставщику"
                cancelText="Отмена"
                confirmLoading={priceOverride.submitting}
                okButtonProps={{
                    danger: true,
                    disabled: priceOverride.loading || !priceOverride.preview,
                }}
                maskClosable={!priceOverride.submitting}
                closable={!priceOverride.submitting}
                width={660}
            >
                {priceOverride.loading && (
                    <Text type="secondary">
                        Проверяем актуальное предложение и остаток поставщика…
                    </Text>
                )}
                {priceOverride.preview && (
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Alert
                            type="warning"
                            showIcon
                            message="Цена клиента ниже цены, рассчитанной по плановой наценке"
                            description="После подтверждения позиция будет добавлена в заказ поставщику с фактической наценкой, указанной ниже. Действие и пользователь будут сохранены в истории позиции."
                        />
                        <Descriptions bordered size="small" column={2}>
                            <Descriptions.Item label="Позиция" span={2}>
                                {priceOverride.item?.brand} {priceOverride.item?.oem}
                            </Descriptions.Item>
                            <Descriptions.Item label="Поставщик" span={2}>
                                {priceOverride.preview.provider_name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Закупочная цена">
                                {formatMoney(priceOverride.preview.supplier_price)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Цена клиента">
                                {formatMoney(priceOverride.preview.customer_price)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Цена по плановой наценке">
                                {formatMoney(priceOverride.preview.offer_price)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отклонение цены">
                                {Number(priceOverride.preview.price_diff_pct).toFixed(2)}%
                            </Descriptions.Item>
                            <Descriptions.Item label="Фактическая наценка">
                                {Number(priceOverride.preview.actual_markup_pct).toFixed(2)}%
                            </Descriptions.Item>
                            <Descriptions.Item label="Плановая наценка">
                                {Number(priceOverride.preview.planned_markup_pct).toFixed(2)}%
                            </Descriptions.Item>
                            <Descriptions.Item label="Фактическая маржа" span={2}>
                                {Number(priceOverride.preview.actual_margin_pct).toFixed(2)}%
                            </Descriptions.Item>
                            <Descriptions.Item label="Запрошено / доступно">
                                {priceOverride.preview.requested_qty} / {priceOverride.preview.available_qty}
                            </Descriptions.Item>
                            <Descriptions.Item label="Будет заказано">
                                {priceOverride.preview.accepted_qty}
                            </Descriptions.Item>
                        </Descriptions>
                        {priceOverride.preview.remaining_reject_qty > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                message={`Частичный заказ: ${priceOverride.preview.remaining_reject_qty} шт. останется в отказе из-за нехватки остатка.`}
                            />
                        )}
                    </Space>
                )}
            </Modal>
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
