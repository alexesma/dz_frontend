import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    DatePicker,
    Input,
    InputNumber,
    message,
    Modal,
    Select,
    Switch,
    Table,
    Tabs,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { getAutopartLookupByOem } from '../api/autoparts';
import {
    createManualCustomerOrder,
    getCustomerOrderConfigs,
    getCustomerOrders,
    getCustomerOrdersSummary,
    retryCustomerOrder,
} from '../api/customerOrders';
import { getCustomersSummary } from '../api/customers';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const DEFAULT_FILTERS = {
    customerId: null,
    status: null,
    dateRange: null,
};

const ORDER_STATUS_LABELS = {
    NEW: 'Новый',
    PROCESSED: 'Обработан',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
};

const CustomerOrdersPage = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [errorOrders, setErrorOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [activeTab, setActiveTab] = useState('orders');
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [orderConfigs, setOrderConfigs] = useState([]);
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
        if (activeFilters.customerId) {
            params.customer_id = activeFilters.customerId;
        }
        if (activeFilters.dateRange?.length === 2) {
            params.date_from = activeFilters.dateRange[0];
            params.date_to = activeFilters.dateRange[1];
        }
        return params;
    }, []);

    const fetchOrders = useCallback(async (filtersState) => {
        const activeFilters = filtersState || DEFAULT_FILTERS;
        setLoading(true);
        try {
            const baseParams = buildBaseParams(activeFilters);
            const summaryParams = { ...baseParams };
            if (activeFilters.status && activeFilters.status !== 'ERROR') {
                summaryParams.status = activeFilters.status;
            }
            const [ordersResp, errorOrdersResp, customersResp] = await Promise.all([
                getCustomerOrdersSummary(summaryParams),
                getCustomerOrders({ ...baseParams, status: 'ERROR' }),
                getCustomersSummary({ page: 1, page_size: 200 }),
            ]);
            setOrders(
                (ordersResp.data || []).filter((order) => order.status !== 'ERROR')
            );
            setErrorOrders(errorOrdersResp.data || []);
            setCustomers(customersResp.data?.items || []);
        } catch {
            message.error('Не удалось загрузить заказы клиентов');
        } finally {
            setLoading(false);
        }
    }, [buildBaseParams]);

    useEffect(() => {
        fetchOrders(DEFAULT_FILTERS);
    }, [fetchOrders]);

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
        return dayjs(value).format('DD.MM.YYYY HH:mm');
    };

    const formatMoney = (value) => {
        if (value === null || value === undefined) return '—';
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        return num.toFixed(2);
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
            await createManualCustomerOrder({
                customer_id: formState.customerId,
                order_number: formState.orderNumber || null,
                auto_process: formState.autoProcess,
                order_config_id: formState.orderConfigId || null,
                items: cleanedItems,
            });
            message.success('Заказ создан');
            setCreateOpen(false);
            resetCreateForm();
            fetchOrders(filters);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось создать заказ';
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

    const columns = [
        {
            title: 'Дата заказа',
            dataIndex: 'received_at',
            key: 'received_at',
            width: 170,
            render: formatDateTime,
        },
        {
            title: '№ заказа',
            dataIndex: 'order_number',
            key: 'order_number',
            width: 140,
            render: (value, record) => value || record.id,
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_id',
            key: 'customer_id',
            width: 200,
            render: (value) => customerMap[value] || value,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (value) => ORDER_STATUS_LABELS[value] || value || '—',
        },
        {
            title: 'Сумма заказа',
            dataIndex: 'total_sum',
            key: 'total_sum',
            width: 140,
            render: formatMoney,
        },
        {
            title: 'Склад (мы)',
            dataIndex: 'stock_sum',
            key: 'stock_sum',
            width: 120,
            render: formatMoney,
        },
        {
            title: 'Поставщики',
            dataIndex: 'supplier_sum',
            key: 'supplier_sum',
            width: 120,
            render: formatMoney,
        },
        {
            title: 'Отказ, сумма',
            dataIndex: 'rejected_sum',
            key: 'rejected_sum',
            width: 130,
            render: formatMoney,
        },
        {
            title: 'Отказ, %',
            dataIndex: 'rejected_pct',
            key: 'rejected_pct',
            width: 110,
            render: (value) => {
                if (value === null || value === undefined) return '—';
                const num = Number(value);
                if (Number.isNaN(num)) return '—';
                return `${num.toFixed(1)}%`;
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 180,
            render: (_, record) => (
                <div className="table-actions">
                    <Button
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/customer-orders/${record.id}`);
                        }}
                    >
                        Открыть
                    </Button>
                    {record.status === 'ERROR' && (
                        <Button
                            size="small"
                            onClick={(event) => {
                                event.stopPropagation();
                                handleRetryOrder(record.id);
                            }}
                            loading={retryingOrderId === record.id}
                        >
                            Повторить
                        </Button>
                    )}
                </div>
            ),
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
            render: (value) => customerMap[value] || value,
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
            width: 180,
            render: (_, record) => (
                <div className="table-actions">
                    <Button
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/customer-orders/${record.id}`);
                        }}
                    >
                        Открыть
                    </Button>
                    <Button
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            handleRetryOrder(record.id);
                        }}
                        loading={retryingOrderId === record.id}
                    >
                        Повторить
                    </Button>
                </div>
            ),
        },
    ];

    const statusOptions = useMemo(
        () => Object.entries(ORDER_STATUS_LABELS)
            .filter(([value]) => value !== 'ERROR')
            .map(([value, label]) => ({ value, label })),
        []
    );

    const handleTabChange = (key) => {
        setActiveTab(key);
        if (key === 'orders' && filters.status === 'ERROR') {
            setFilters((prev) => ({ ...prev, status: null }));
        }
    };

    return (
        <Card>
            <Title level={3}>Заказы клиентов</Title>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
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
                    style={{ minWidth: 220 }}
                    placeholder="Клиент"
                    value={filters.customerId}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, customerId: value || null }))
                    }
                    options={(customers || []).map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                    }))}
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
                    onClick={() => fetchOrders(filters)}
                >
                    Применить
                </Button>
                <Button
                    onClick={() => {
                        const reset = { ...DEFAULT_FILTERS };
                        setFilters(reset);
                        fetchOrders(reset);
                    }}
                >
                    Сбросить
                </Button>
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                    Создать заказ
                </Button>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={[
                    {
                        key: 'orders',
                        label: `Заказы (${dataSource.length})`,
                        children: (
                            <Table
                                loading={loading}
                                dataSource={dataSource}
                                columns={columns}
                                onRow={(record) => ({
                                    onClick: (event) => {
                                        if (
                                            event.target.closest('button') ||
                                            event.target.closest('input') ||
                                            event.target.closest('.ant-select')
                                        ) {
                                            return;
                                        }
                                        navigate(`/customer-orders/${record.id}`);
                                    },
                                })}
                                pagination={{ pageSize: 20 }}
                            />
                        ),
                    },
                    {
                        key: 'errors',
                        label: `Ошибки импорта (${errorDataSource.length})`,
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
                                        navigate(`/customer-orders/${record.id}`);
                                    },
                                })}
                                pagination={{ pageSize: 20 }}
                            />
                        ),
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
                        style={{ minWidth: 240 }}
                        placeholder="Клиент"
                        value={formState.customerId}
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
        </Card>
    );
};

export default CustomerOrdersPage;
