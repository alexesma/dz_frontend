import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    AutoComplete,
    ConfigProvider,
    DatePicker,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Select,
    Segmented,
    Switch,
    Table,
    Tag,
    Tabs,
    Tooltip,
    Typography,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import ruRU from 'antd/locale/ru_RU';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getAutopartLookupByOem } from '../api/autoparts';
import {
    createManualCustomerOrder,
    deleteCustomerOrder,
    getCustomerOrderConfigs,
    getCustomerOrders,
    getCustomerOrdersCount,
    getCustomerOrdersSummaryPage,
    getCustomerOrderOemSuggestions,
    processPartsSoftOrderLocally,
    retryCustomerOrder,
    updateCustomerOrder,
} from '../api/customerOrders';
import { getCustomerById, getCustomersSummary } from '../api/customers';
import { getAllProviders } from '../api/providers';
import PartsSoftOrderReconciliation from './PartsSoftOrderReconciliation';
import CustomerOrderEditModal from './CustomerOrderEditModal';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
dayjs.locale('ru');
const displayOem = (value) => {
    const original = String(value || '').trim();
    return original.replace(/[^a-z0-9]/gi, '').toUpperCase() || original;
};

const DEFAULT_FILTERS = {
    customerGroup: 'Wholesale',
    customerId: null,
    supplierIds: [],
    status: null,
    dateRange: null,
    itemOem: '',
};

const readFilters = (searchParams) => {
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    return {
        customerGroup: ['all', 'Retail'].includes(searchParams.get('customer_group'))
            ? searchParams.get('customer_group') : 'Wholesale',
        customerId: Number(searchParams.get('customer_id')) || null,
        supplierIds: (searchParams.get('supplier_ids') || '').split(',')
            .map(Number).filter((id) => id > 0),
        status: searchParams.get('status') || null,
        dateRange: dateFrom && dateTo ? [dateFrom, dateTo] : null,
        itemOem: searchParams.get('item_oem') || '',
    };
};

const buildSearch = (filters, tab, page) => {
    const params = new URLSearchParams();
    if (filters.customerGroup !== 'Wholesale') {
        params.set('customer_group', filters.customerGroup);
    }
    if (filters.customerId) params.set('customer_id', filters.customerId);
    if (filters.supplierIds?.length) params.set('supplier_ids', filters.supplierIds.join(','));
    if (filters.status) params.set('status', filters.status);
    if (filters.dateRange?.length === 2) {
        params.set('date_from', filters.dateRange[0]);
        params.set('date_to', filters.dateRange[1]);
    }
    if (filters.itemOem?.trim()) params.set('item_oem', filters.itemOem.trim());
    if (tab !== 'orders') params.set('tab', tab);
    if (page > 1) params.set('page', page);
    return params;
};

const ORDER_STATUS_LABELS = {
    NEW: 'Новый',
    PROCESSED: 'Обработан',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
};
const NEXT_ACTION_LABELS = {
    check_source: 'Проверить источник',
    accept_receipt: 'Принять поступление',
    print_own_labels: 'Напечатать этикетки',
    print_supplier_labels: 'Этикетки поставщика',
    create_realization: 'Создать реализацию',
    await_supplier: 'Ждём поставщика',
    await_stock: 'Нет свободного остатка',
};

const CustomerOrdersPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const appliedFilters = useMemo(() => readFilters(searchParams), [searchParams]);
    const activeTab = ['orders', 'errors', 'partssoft'].includes(searchParams.get('tab'))
        ? searchParams.get('tab') : 'orders';
    const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
    const [orders, setOrders] = useState([]);
    const [errorOrders, setErrorOrders] = useState([]);
    const [ordersTotal, setOrdersTotal] = useState(0);
    const [errorOrdersTotal, setErrorOrdersTotal] = useState(0);
    const [customers, setCustomers] = useState([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [providers, setProviders] = useState([]);
    const [oemOptions, setOemOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchRequestId = useRef(0);
    const [filters, setFilters] = useState(appliedFilters);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [orderConfigs, setOrderConfigs] = useState([]);
    const [editingOrder, setEditingOrder] = useState(null);
    const [savingOrder, setSavingOrder] = useState(false);
    const [deletingOrderId, setDeletingOrderId] = useState(null);
    const [processingPartsSoftOrderId, setProcessingPartsSoftOrderId] = useState(null);

    const formatApiDetail = (detail, fallback) => {
        if (typeof detail === 'string') return detail;
        if (detail?.message) return detail.message;
        return fallback;
    };
    const [configsLoading, setConfigsLoading] = useState(false);
    const [retryingOrderId, setRetryingOrderId] = useState(null);
    const [formState, setFormState] = useState({
        customerId: null,
        orderNumber: '',
        autoProcess: true,
        orderConfigId: null,
        items: [
            { oem: '', brand: '', name: '', quantity: 1, price: null, lookupResults: [] },
        ],
    });

    const resetCreateForm = useCallback(() => {
        setFormState({
            customerId: null,
            orderNumber: '',
            autoProcess: true,
            orderConfigId: null,
            items: [
                {
                    oem: '',
                    brand: '',
                    name: '',
                    quantity: 1,
                    price: null,
                    lookupResults: [],
                },
            ],
        });
        setOrderConfigs([]);
    }, []);

    const customerMap = useMemo(() => {
        const map = {};
        (customers || []).forEach((customer) => {
            map[customer.id] = customer.name;
        });
        return map;
    }, [customers]);

    const buildBaseParams = useCallback((activeFilters) => {
        const params = {};
        if (activeFilters.customerGroup !== 'all') {
            params.customer_group = activeFilters.customerGroup === 'Retail'
                ? 'retail' : 'wholesale';
        }
        if (activeFilters.customerId) {
            params.customer_id = activeFilters.customerId;
        }
        if (activeFilters.supplierIds?.length) {
            params.supplier_ids = activeFilters.supplierIds.join(',');
        }
        if (activeFilters.itemOem?.trim()) {
            params.item_oem = activeFilters.itemOem.trim();
        }
        if (activeFilters.dateRange?.length === 2) {
            params.date_from = activeFilters.dateRange[0];
            params.date_to = activeFilters.dateRange[1];
        }
        return params;
    }, []);

    const fetchOrders = useCallback(async (filtersState, pageNumber = page) => {
        const activeFilters = filtersState || DEFAULT_FILTERS;
        const requestId = ++fetchRequestId.current;
        setLoading(true);
        try {
            const baseParams = buildBaseParams(activeFilters);
            const summaryParams = { ...baseParams };
            if (activeFilters.status && activeFilters.status !== 'ERROR') {
                summaryParams.status = activeFilters.status;
            }
            const pageParams = { skip: (pageNumber - 1) * 20, limit: 20 };
            const [ordersResp, errorOrdersResp, errorCountResp] = await Promise.all([
                getCustomerOrdersSummaryPage({ ...summaryParams, ...pageParams }),
                getCustomerOrders({ ...baseParams, status: 'ERROR', ...pageParams }),
                getCustomerOrdersCount({ ...baseParams, status: 'ERROR' }),
            ]);
            if (requestId === fetchRequestId.current) {
                setOrders((ordersResp.data?.items || []).filter((order) => order.status !== 'ERROR'));
                setOrdersTotal(ordersResp.data?.total || 0);
                setErrorOrders(errorOrdersResp.data || []);
                setErrorOrdersTotal(errorCountResp.data || 0);
            }
        } catch {
            if (requestId === fetchRequestId.current) {
                message.error('Не удалось загрузить заказы клиентов');
            }
        } finally {
            if (requestId === fetchRequestId.current) setLoading(false);
        }
    }, [buildBaseParams, page]);

    useEffect(() => {
        setFilters(appliedFilters);
        fetchOrders(appliedFilters, page);
    }, [appliedFilters, fetchOrders, page]);

    useEffect(() => {
        let cancelled = false;
        const group = appliedFilters.customerGroup === 'all' ? undefined
            : appliedFilters.customerGroup === 'Retail' ? 'retail' : 'wholesale';
        const timer = window.setTimeout(() => getCustomersSummary({
            page: 1, page_size: 50, customer_group: group,
            ...(customerSearch.trim() ? { search: customerSearch.trim() } : {}),
        }).then(({ data }) => {
            if (!cancelled) {
                setCustomers((previous) => {
                    const chosenIds = [appliedFilters.customerId, formState.customerId];
                    const selected = previous.filter((row) => chosenIds.includes(row.id));
                    const rows = data?.items || [];
                    return [...selected.filter((row) => !rows.some((next) => next.id === row.id)),
                        ...rows];
                });
            }
        }).catch(() => {
            if (!cancelled) message.error('Не удалось загрузить список клиентов');
        }), 250);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [appliedFilters.customerGroup, appliedFilters.customerId,
        formState.customerId, customerSearch]);

    useEffect(() => {
        const id = appliedFilters.customerId;
        if (!id || customers.some((row) => row.id === id)) return;
        let cancelled = false;
        getCustomerById(id).then(({ data }) => {
            if (!cancelled) setCustomers((rows) => [data, ...rows]);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [appliedFilters.customerId, customers]);

    useEffect(() => {
        getAllProviders().then(setProviders).catch(() => {
            message.error('Не удалось загрузить поставщиков');
        });
    }, []);

    useEffect(() => {
        const query = filters.itemOem?.trim();
        if (!query || query.length < 2) {
            setOemOptions([]);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            getCustomerOrderOemSuggestions(query).then((response) => {
                if (!cancelled) {
                    setOemOptions((response.data || []).map((value) => ({ value })));
                }
            }).catch(() => {
                if (!cancelled) setOemOptions([]);
            });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [filters.itemOem]);

    const updateListSearch = (nextFilters, nextTab = activeTab, nextPage = 1) => {
        const next = buildSearch(nextFilters, nextTab, nextPage);
        if (next.toString() === searchParams.toString()) {
            fetchOrders(nextFilters, nextPage);
        } else {
            setSearchParams(next);
        }
    };

    const openOrder = (orderId) => {
        const returnTo = `${location.pathname}${location.search}`;
        navigate(`/customer-orders/${orderId}?returnTo=${encodeURIComponent(returnTo)}`);
    };

    const dataSource = useMemo(() => {
        return (orders || []).map((order) => ({
            key: order.id,
            ...order,
        }));
    }, [orders]);

    const errorDataSource = useMemo(() => {
        return (errorOrders || []).map((order) => ({
            key: order.id,
            ...order,
        }));
    }, [errorOrders]);

    const formatDateTime = (value) => {
        if (!value) return '—';
        return dayjs(value).format('DD.MM.YY, HH:mm');
    };

    const formatMoney = (value) => {
        if (value === null || value === undefined) return '—';
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        return num.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
    };

    const setItemFields = (index, fields) => {
        setFormState((prev) => {
            const items = prev.items.map((item, idx) => (
                idx === index ? { ...item, ...fields } : item
            ));
            return { ...prev, items };
        });
    };

    const updateItem = (index, field, value) => {
        if (field === 'oem') {
            setItemFields(index, {
                oem: value,
                brand: '',
                name: '',
                lookupResults: [],
            });
            return;
        }
        setItemFields(index, { [field]: value });
    };

    const loadOrderConfigs = useCallback(async (customerId) => {
        if (!customerId) {
            setOrderConfigs([]);
            return;
        }
        setConfigsLoading(true);
        try {
            const response = await getCustomerOrderConfigs(customerId);
            const configs = response?.data || [];
            setOrderConfigs(configs);
            if (configs.length === 1) {
                setFormState((prev) => ({
                    ...prev,
                    orderConfigId: configs[0].id,
                }));
            } else {
                setFormState((prev) => ({
                    ...prev,
                    orderConfigId: null,
                }));
            }
        } catch {
            message.error('Не удалось загрузить конфигурации клиента');
            setOrderConfigs([]);
        } finally {
            setConfigsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (createOpen && formState.customerId) {
            loadOrderConfigs(formState.customerId);
        }
    }, [createOpen, formState.customerId, loadOrderConfigs]);

    const applyLookupResults = (index, oemValue, results) => {
        setFormState((prev) => {
            const items = prev.items.map((item, idx) => {
                if (idx !== index) return item;
                if (item.oem.trim() !== oemValue) return item;
                if (!results.length) {
                    return { ...item, lookupResults: [] };
                }
                if (results.length === 1) {
                    const match = results[0];
                    return {
                        ...item,
                        brand: match.brand || '',
                        name: match.name || '',
                        lookupResults: [],
                    };
                }
                const existing =
                    item.brand &&
                    results.find((row) => row.brand === item.brand);
                return {
                    ...item,
                    brand: existing ? item.brand : '',
                    name: existing ? existing.name || '' : '',
                    lookupResults: results,
                };
            });
            return { ...prev, items };
        });
    };

    const handleOemBlur = async (index, rawValue) => {
        const normalized = rawValue?.trim();
        if (!normalized) {
            setItemFields(index, { lookupResults: [] });
            return;
        }
        try {
            const response = await getAutopartLookupByOem(normalized);
            const results = response?.data || [];
            applyLookupResults(index, normalized, results);
        } catch {
            message.error('Не удалось найти позиции по OEM');
        }
    };

    const handleBrandSelect = (index, brandValue) => {
        setFormState((prev) => {
            const items = prev.items.map((item, idx) => {
                if (idx !== index) return item;
                const match = (item.lookupResults || []).find(
                    (row) => row.brand === brandValue
                );
                return {
                    ...item,
                    brand: brandValue || '',
                    name: match?.name || '',
                };
            });
            return { ...prev, items };
        });
    };

    const addItemRow = () => {
        setFormState((prev) => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    oem: '',
                    brand: '',
                    name: '',
                    quantity: 1,
                    price: null,
                    lookupResults: [],
                },
            ],
        }));
    };

    const removeItemRow = (index) => {
        setFormState((prev) => ({
            ...prev,
            items: prev.items.filter((_, idx) => idx !== index),
        }));
    };

    const handleCreateOrder = async () => {
        if (!formState.customerId) {
            message.warning('Выберите клиента');
            return;
        }
        if (formState.autoProcess) {
            if (!orderConfigs.length) {
                message.warning('Нет конфигурации обработки для клиента');
                return;
            }
            if (orderConfigs.length > 1 && !formState.orderConfigId) {
                message.warning('Выберите конфигурацию обработки');
                return;
            }
        }
        let preparedItems = formState.items.map((item) => ({
            ...item,
            oem: item.oem.trim(),
            brand: item.brand.trim(),
            name: item.name?.trim() || '',
        }));

        for (let index = 0; index < preparedItems.length; index += 1) {
            const item = preparedItems[index];
            if (!item.oem) {
                continue;
            }
            if (item.brand) {
                if (!item.name && item.lookupResults?.length) {
                    const match = item.lookupResults.find(
                        (row) => row.brand === item.brand
                    );
                    if (match?.name) {
                        item.name = match.name;
                    }
                }
                continue;
            }

            let results = item.lookupResults || [];
            if (!results.length) {
                try {
                    const response = await getAutopartLookupByOem(item.oem);
                    results = response?.data || [];
                } catch {
                    message.error(`Не удалось найти OEM ${item.oem}`);
                    return;
                }
            }

            if (!results.length) {
                message.warning(`OEM ${item.oem} не найден в базе`);
                preparedItems = preparedItems.map((current, idx) => (
                    idx === index ? { ...current, lookupResults: [] } : current
                ));
                setFormState((prev) => ({ ...prev, items: preparedItems }));
                return;
            }

            if (results.length > 1) {
                preparedItems = preparedItems.map((current, idx) => (
                    idx === index ? { ...current, lookupResults: results } : current
                ));
                setFormState((prev) => ({ ...prev, items: preparedItems }));
                message.warning(`Выберите бренд для OEM ${item.oem}`);
                return;
            }

            const match = results[0];
            item.brand = match.brand || '';
            if (!item.name && match.name) {
                item.name = match.name;
            }
            item.lookupResults = [];
        }

        const cleanedItems = preparedItems
            .map((item) => ({
                oem: item.oem,
                brand: item.brand,
                name: item.name || null,
                quantity: Number(item.quantity),
                price: item.price === null ? null : Number(item.price),
            }))
            .filter((item) => item.oem && item.brand && item.quantity > 0);
        if (!cleanedItems.length) {
            message.warning('Добавьте позиции');
            return;
        }
        setCreating(true);
        try {
            const response = await createManualCustomerOrder({
                customer_id: formState.customerId,
                order_number: formState.orderNumber || null,
                auto_process: formState.autoProcess,
                order_config_id: formState.orderConfigId || null,
                items: cleanedItems,
            });
            if (response?.data?.credit_warning?.message) {
                message.warning(response.data.credit_warning.message, 8);
            }
            message.success('Заказ создан');
            setCreateOpen(false);
            resetCreateForm();
            fetchOrders(filters);
        } catch (err) {
            const detail = formatApiDetail(
                err?.response?.data?.detail,
                'Не удалось создать заказ',
            );
            message.error(detail);
        } finally {
            setCreating(false);
        }
    };

    const handleRetryOrder = async (orderId) => {
        setRetryingOrderId(orderId);
        try {
            await retryCustomerOrder(orderId);
            message.success('Заказ перепроверен');
            fetchOrders(filters);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось перепроверить заказ';
            message.error(detail);
        } finally {
            setRetryingOrderId(null);
        }
    };

    const handleSaveOrder = async (payload) => {
        if (!editingOrder) return;
        setSavingOrder(true);
        try {
            await updateCustomerOrder(editingOrder.id, payload);
            message.success('Заказ обновлён');
            setEditingOrder(null);
            fetchOrders(filters);
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось обновить заказ'));
        } finally {
            setSavingOrder(false);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        setDeletingOrderId(orderId);
        try {
            await deleteCustomerOrder(orderId);
            message.success('Заказ удалён из рабочего списка');
            fetchOrders(filters);
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось удалить заказ'));
        } finally {
            setDeletingOrderId(null);
        }
    };

    const handleProcessPartsSoftLocally = async (orderId) => {
        setProcessingPartsSoftOrderId(orderId);
        try {
            await processPartsSoftOrderLocally(orderId);
            message.success('Заказ передан в локальную обработку');
            fetchOrders(filters);
        } catch (err) {
            message.error(formatApiDetail(err?.response?.data?.detail, 'Не удалось обработать заказ у нас'));
        } finally {
            setProcessingPartsSoftOrderId(null);
        }
    };

    const renderOrderActions = (record, isImportError = false) => (
        <div
            className="customer-order-actions"
            onClick={(event) => event.stopPropagation()}
        >
            <Tooltip title="Открыть заказ">
                <Button size="small" aria-label="Открыть заказ" icon={<EyeOutlined />}
                    onClick={() => openOrder(record.id)} />
            </Tooltip>
            <Tooltip title="Редактировать заказ">
                <Button size="small" aria-label="Редактировать заказ" icon={<EditOutlined />}
                    onClick={() => setEditingOrder(record)} />
            </Tooltip>
            <Popconfirm
                title="Удалить заказ?"
                description="Заказ исчезнет из рабочего списка, история связанных операций сохранится."
                okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteOrder(record.id)}
            >
                <Tooltip title="Удалить заказ">
                    <Button danger size="small" aria-label="Удалить заказ" icon={<DeleteOutlined />}
                        loading={deletingOrderId === record.id} />
                </Tooltip>
            </Popconfirm>
            {['PARTS_SOFT_SITE', 'REVIEW_REQUIRED'].includes(record.processing_owner) && (
                <Popconfirm
                    title="Обработать заказ в нашей системе?"
                    description="Будут заново подобраны предложения и созданы локальные складские или поставщицкие заказы."
                    okText="Обработать у нас" cancelText="Отмена"
                    onConfirm={() => handleProcessPartsSoftLocally(record.id)}
                >
                    <Tooltip title="Обработать у нас">
                        <Button type="primary" size="small" aria-label="Обработать у нас"
                            icon={<PlayCircleOutlined />}
                            loading={processingPartsSoftOrderId === record.id} />
                    </Tooltip>
                </Popconfirm>
            )}
            {(isImportError || record.status === 'ERROR' || (
                record.status === 'NEW' && record.source_filename && !(record.items || []).length
            )) && (
                <Tooltip title="Повторить обработку">
                    <Button size="small" aria-label="Повторить обработку" icon={<ReloadOutlined />}
                        onClick={() => handleRetryOrder(record.id)}
                        loading={retryingOrderId === record.id} />
                </Tooltip>
            )}
        </div>
    );

    const renderExecutionSummary = (record) => {
        const rejectedPercent = record.rejected_pct === null
            || record.rejected_pct === undefined
            ? null
            : Number(record.rejected_pct);
        const rejectedLabel = Number.isFinite(rejectedPercent)
            ? `${formatMoney(record.rejected_sum)} · ${rejectedPercent.toFixed(1)}%`
            : formatMoney(record.rejected_sum);
        const details = [
            `Склад: ${formatMoney(record.stock_sum)}`,
            `Поставщики: ${formatMoney(record.supplier_sum)}`,
            `Отказ: ${rejectedLabel}`,
        ].join('\n');

        return (
            <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{details}</span>}>
                <div className="customer-order-execution">
                    <span><b>Склад</b> {formatMoney(record.stock_sum)}</span>
                    <span><b>Пост.</b> {formatMoney(record.supplier_sum)}</span>
                    <span className={Number.isFinite(rejectedPercent) && rejectedPercent > 0 ? 'has-rejection' : ''}>
                        <b>Отказ</b> {rejectedLabel}
                    </span>
                </div>
            </Tooltip>
        );
    };

    const renderFulfillment = (record) => {
        const progress = record.fulfillment || {};
        if (!progress.ordered) return <Text type="secondary">Нет позиций к отгрузке</Text>;
        const actions = (record.next_actions || []).slice(0, 2);
        return <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div>К отгрузке: {progress.ordered} · поступило: {progress.received || 0}</div>
            <div>Этикетки: {(progress.cross_labeled || 0) + (progress.own_labeled || 0)}
                {' · '}в реализациях: {progress.committed || 0}
                {' · '}готово: {progress.ready || 0}</div>
            {actions.map((action) => <Tag key={action} color={action === 'create_realization' ? 'green' : 'blue'}>
                {NEXT_ACTION_LABELS[action] || action}
            </Tag>)}
        </div>;
    };

    const columns = [
        {
            title: 'Дата',
            dataIndex: 'received_at',
            key: 'received_at',
            width: '11%',
            render: (value) => (
                <span className="customer-order-single-line">{formatDateTime(value)}</span>
            ),
        },
        {
            title: '№ заказа',
            dataIndex: 'order_number',
            key: 'order_number',
            width: '11%',
            render: (value, record) => {
                const orderLabel = String(value || record.id);
                const compactOrderLabel = orderLabel.replace(
                    /^(site-\d+)-.+$/i,
                    '$1'
                );
                return (
                <div className="customer-order-number-summary">
                    <Tooltip title={orderLabel} placement="topLeft">
                        <span className="customer-order-number-value">
                            {compactOrderLabel}
                        </span>
                    </Tooltip>
                    <div className="customer-order-number-badges">
                        {record.import_origin === 'partssoft_recovery' && (
                            <Tooltip title="Восстановлен из Parts-Soft">
                                <Tag color="blue">PS</Tag>
                            </Tooltip>
                        )}
                        {record.processing_owner === 'REVIEW_REQUIRED' && (
                            <Tooltip title={`Нужно проверить маршрут обработки: ${record.processing_state || 'причина не указана'}`}>
                                <Tag color="red" aria-label="Проверить маршрут обработки">
                                    <WarningOutlined />
                                </Tag>
                            </Tooltip>
                        )}
                    </div>
                </div>
                );
            },
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_id',
            key: 'customer_id',
            width: '18%',
            render: (value, record) => (
                <Button
                    type="link"
                    className="customer-order-customer-link"
                    onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/customers/${value}/edit`);
                    }}
                >
                    {record.customer_name || customerMap[value] || value}
                </Button>
            ),
        },
        ...(appliedFilters.itemOem ? [{
            title: 'Найденные позиции',
            key: 'matching_items',
            width: '23%',
            render: (_, record) => (
                <div>
                    {(record.matching_items || []).slice(0, 3).map((item, index) => (
                        <div key={`${item.oem}-${index}`}>
                            <span title={`${item.brand} ${item.oem}`}>
                                {item.brand?.toUpperCase()} {displayOem(item.oem)} × {item.requested_qty}
                            </span>
                        </div>
                    ))}
                    {(record.matching_items || []).length > 3 && (
                        <span>Ещё {(record.matching_items || []).length - 3}</span>
                    )}
                </div>
            ),
        }] : []),
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: '10%',
            render: (value) => (
                <span className="customer-order-single-line">
                    {ORDER_STATUS_LABELS[value] || value || '—'}
                </span>
            ),
        },
        {
            title: 'Сумма',
            dataIndex: 'total_sum',
            key: 'total_sum',
            width: '10%',
            align: 'right',
            render: (value) => (
                <Tooltip title={formatMoney(value)}>
                    <span className="customer-order-money">{formatMoney(value)}</span>
                </Tooltip>
            ),
        },
        {
            title: 'Исполнение',
            key: 'execution',
            width: '26%',
            render: (_, record) => renderExecutionSummary(record),
        },
        {
            title: 'Комплектация',
            key: 'fulfillment',
            width: '26%',
            render: (_, record) => renderFulfillment(record),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: '14%',
            align: 'right',
            render: (_, record) => renderOrderActions(record),
        },
    ];

    const errorColumns = [
        {
            title: 'Дата письма',
            dataIndex: 'received_at',
            key: 'received_at',
            width: 170,
            render: formatDateTime,
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_id',
            key: 'customer_id',
            width: 180,
            render: (value, record) => (
                <Button
                    type="link"
                    style={{ padding: 0, height: 'auto' }}
                    onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/customers/${value}/edit`);
                    }}
                >
                    {record.customer_name || customerMap[value] || value}
                </Button>
            ),
        },
        {
            title: 'Источник',
            key: 'source',
            width: 280,
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>
                        {record.source_email || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                        UID: {record.source_uid || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Письмо / файл',
            key: 'mail',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>
                        {record.source_filename || record.order_number || `Заказ #${record.id}`}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                        {record.source_subject || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Ошибка',
            dataIndex: 'error_details',
            key: 'error_details',
            render: (value) => value || 'Причина не сохранена',
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 192,
            render: (_, record) => renderOrderActions(record, true),
        },
    ];

    const statusOptions = useMemo(
        () => Object.entries(ORDER_STATUS_LABELS)
            .filter(([value]) => value !== 'ERROR')
            .map(([value, label]) => ({ value, label })),
        []
    );

    const handleTabChange = (key) => {
        updateListSearch(appliedFilters, key, 1);
    };

    return (
        <ConfigProvider locale={ruRU}>
        <Card>
            <Title level={3}>Заказы клиентов</Title>
            {activeTab !== 'partssoft' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Segmented
                    value={filters.customerGroup}
                    onChange={(value) => {
                        const nextFilters = {
                            ...filters, customerGroup: value, customerId: null,
                        };
                        setOrders([]);
                        setErrorOrders([]);
                        setCustomers([]);
                        setFilters(nextFilters);
                        updateListSearch(nextFilters);
                    }}
                    options={[
                        { value: 'Wholesale', label: 'Оптовые клиенты' },
                        { value: 'all', label: 'Все клиенты' },
                        { value: 'Retail', label: 'Розничные клиенты' },
                    ]}
                />
                <RangePicker
                    value={
                        filters.dateRange
                            ? [
                                dayjs(filters.dateRange[0]),
                                dayjs(filters.dateRange[1]),
                            ]
                            : null
                    }
                    onChange={(values) => {
                        if (!values || values.length !== 2) {
                            setFilters((prev) => ({ ...prev, dateRange: null }));
                            return;
                        }
                        setFilters((prev) => ({
                            ...prev,
                            dateRange: [
                                values[0].format('YYYY-MM-DD'),
                                values[1].format('YYYY-MM-DD'),
                            ],
                        }));
                    }}
                    placeholder={['Дата от', 'Дата до']}
                />
                <Select
                    allowClear
                    showSearch
                    filterOption={false}
                    style={{ minWidth: 220 }}
                    placeholder="Клиент"
                    value={filters.customerId}
                    onSearch={setCustomerSearch}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, customerId: value || null }))
                    }
                    options={(customers || []).map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                    }))}
                />
                <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    style={{ minWidth: 250 }}
                    placeholder="Поставщики"
                    value={filters.supplierIds}
                    onChange={(values) =>
                        setFilters((prev) => ({ ...prev, supplierIds: values }))
                    }
                    options={providers.map((provider) => ({
                        value: provider.id,
                        label: provider.name,
                    }))}
                />
                <AutoComplete
                    allowClear
                    options={oemOptions}
                    value={filters.itemOem}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, itemOem: value || '' }))
                    }
                    onSelect={(value) =>
                        setFilters((prev) => ({ ...prev, itemOem: value }))
                    }
                    style={{ minWidth: 220 }}
                    placeholder="Артикул позиции"
                />
                {activeTab === 'orders' && (
                    <Select
                        allowClear
                        style={{ minWidth: 180 }}
                        placeholder="Статус"
                        value={filters.status}
                        onChange={(value) =>
                            setFilters((prev) => ({ ...prev, status: value || null }))
                        }
                        options={statusOptions}
                    />
                )}
                <Button
                    type="primary"
                    onClick={() => updateListSearch(filters)}
                >
                    Применить
                </Button>
                <Button
                    onClick={() => {
                        const reset = { ...DEFAULT_FILTERS };
                        setFilters(reset);
                        updateListSearch(reset);
                    }}
                >
                    Сбросить
                </Button>
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                    Создать заказ
                </Button>
            </div>
            )}
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={[
                    {
                        key: 'orders',
                        label: `Заказы (${ordersTotal})`,
                        children: (
                            <Table
                                className="customer-orders-table"
                                loading={loading}
                                dataSource={dataSource}
                                columns={columns}
                                size="small"
                                tableLayout="fixed"
                                onRow={(record) => ({
                                    onClick: (event) => {
                                        if (
                                            event.target.closest('button') ||
                                            event.target.closest('input') ||
                                            event.target.closest('.ant-select')
                                        ) {
                                            return;
                                        }
                                        openOrder(record.id);
                                    },
                                })}
                                pagination={{ current: page, pageSize: 20, total: ordersTotal }}
                                onChange={(pagination) =>
                                    updateListSearch(appliedFilters, activeTab, pagination.current)
                                }
                            />
                        ),
                    },
                    {
                        key: 'errors',
                        label: `Ошибки импорта (${errorOrdersTotal})`,
                        children: (
                            <Table
                                loading={loading}
                                dataSource={errorDataSource}
                                columns={errorColumns}
                                onRow={(record) => ({
                                    onClick: (event) => {
                                        if (
                                            event.target.closest('button') ||
                                            event.target.closest('input') ||
                                            event.target.closest('.ant-select')
                                        ) {
                                            return;
                                        }
                                        openOrder(record.id);
                                    },
                                })}
                                pagination={{ current: page, pageSize: 20, total: errorOrdersTotal }}
                                onChange={(pagination) =>
                                    updateListSearch(appliedFilters, activeTab, pagination.current)
                                }
                            />
                        ),
                    },
                    {
                        key: 'partssoft',
                        label: 'Сайт Dragonzap.ru',
                        children: <PartsSoftOrderReconciliation />,
                    },
                ]}
            />
            <Modal
                title="Новый заказ клиента"
                open={createOpen}
                onCancel={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                }}
                onOk={handleCreateOrder}
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={creating}
                width={900}
                destroyOnClose
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <Select
                        allowClear
                        showSearch
                        filterOption={false}
                        style={{ minWidth: 240 }}
                        placeholder="Клиент"
                        value={formState.customerId}
                        onSearch={setCustomerSearch}
                        onChange={(value) => {
                            const customerId = value || null;
                            setFormState((prev) => ({
                                ...prev,
                                customerId,
                                orderConfigId: null,
                            }));
                            loadOrderConfigs(customerId);
                        }}
                        options={(customers || []).map((customer) => ({
                            value: customer.id,
                            label: customer.name,
                        }))}
                    />
                    <Input
                        style={{ minWidth: 200 }}
                        placeholder="Номер заказа"
                        value={formState.orderNumber}
                        onChange={(event) =>
                            setFormState((prev) => ({
                                ...prev,
                                orderNumber: event.target.value,
                            }))
                        }
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Автообработка</span>
                        <Switch
                            checked={formState.autoProcess}
                            onChange={(checked) =>
                                setFormState((prev) => ({
                                    ...prev,
                                    autoProcess: checked,
                                }))
                            }
                        />
                    </div>
                    {formState.autoProcess ? (
                        <Select
                            allowClear
                            loading={configsLoading}
                            style={{ minWidth: 320 }}
                            placeholder="Конфигурация обработки"
                            value={formState.orderConfigId || undefined}
                            onChange={(value) =>
                                setFormState((prev) => ({
                                    ...prev,
                                    orderConfigId: value || null,
                                }))
                            }
                            options={(orderConfigs || []).map((config) => {
                                const suffix = config.is_active ? '' : ' (неактивна)';
                                const baseLabel =
                                    config.pricelist_config_name ||
                                    config.order_subject_pattern ||
                                    config.order_email ||
                                    `Конфигурация #${config.id}`;
                                return {
                                    value: config.id,
                                    label: `${baseLabel}${suffix}`,
                                };
                            })}
                            disabled={orderConfigs.length <= 1}
                        />
                    ) : null}
                    {formState.autoProcess && !configsLoading && !orderConfigs.length ? (
                        <span style={{ color: '#999' }}>
                            Нет активных конфигураций для клиента
                        </span>
                    ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {formState.items.map((item, index) => (
                        <div key={index} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Input
                                placeholder="OEM"
                                value={item.oem}
                                onChange={(event) => updateItem(index, 'oem', event.target.value)}
                                onBlur={(event) => handleOemBlur(index, event.target.value)}
                                style={{ width: 140 }}
                            />
                            {item.lookupResults && item.lookupResults.length > 1 ? (
                                <Select
                                    allowClear
                                    placeholder="Бренд"
                                    value={item.brand || undefined}
                                    onChange={(value) => handleBrandSelect(index, value)}
                                    style={{ width: 200 }}
                                    options={item.lookupResults.map((row) => ({
                                        value: row.brand,
                                        label: row.name
                                            ? `${row.brand} — ${row.name}`
                                            : row.brand,
                                    }))}
                                />
                            ) : (
                                <Input
                                    placeholder="Бренд"
                                    value={item.brand}
                                    onChange={(event) => updateItem(index, 'brand', event.target.value)}
                                    style={{ width: 140 }}
                                />
                            )}
                            <Input
                                placeholder="Название"
                                value={item.name}
                                onChange={(event) => updateItem(index, 'name', event.target.value)}
                                style={{ width: 240 }}
                            />
                            <InputNumber
                                min={1}
                                placeholder="Кол-во"
                                value={item.quantity}
                                onChange={(value) => updateItem(index, 'quantity', value)}
                            />
                            <InputNumber
                                min={0}
                                placeholder="Цена"
                                value={item.price}
                                onChange={(value) => updateItem(index, 'price', value)}
                            />
                            <Button
                                danger
                                onClick={() => removeItemRow(index)}
                                disabled={formState.items.length === 1}
                            >
                                Удалить
                            </Button>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 12 }}>
                    <Button onClick={addItemRow}>Добавить позицию</Button>
                </div>
            </Modal>
            <CustomerOrderEditModal
                open={!!editingOrder}
                order={editingOrder}
                customers={customers}
                loading={savingOrder}
                onCancel={() => setEditingOrder(null)}
                onSave={handleSaveOrder}
            />
        </Card>
        </ConfigProvider>
    );
};

export default CustomerOrdersPage;
