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
    Tag,
    Table,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
    createManualSupplierOrder,
    getSupplierOrders,
    sendSupplierOrders,
    sendScheduledSupplierOrders,
} from '../api/customerOrders';
import { getAutopartLookupByOem } from '../api/autoparts';
import { getProviders } from '../api/providers';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const DEFAULT_FILTERS = {
    dateRange: null,
    totalSumMin: null,
    totalSumMax: null,
    rejectedSumMin: null,
    rejectedSumMax: null,
};

const SUPPLIER_ORDER_STATUS_META = {
    NEW: { color: 'default', label: 'Новый' },
    SCHEDULED: { color: 'blue', label: 'Запланирован' },
    SENT: { color: 'green', label: 'Отправлен' },
    ERROR: { color: 'red', label: 'Ошибка' },
};

const CustomerSupplierOrdersPage = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sendingSelected, setSendingSelected] = useState(false);
    const [sendingScheduled, setSendingScheduled] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formState, setFormState] = useState({
        providerId: null,
        items: [{ oem: '', brand: '', name: '', quantity: 1, lookupResults: [] }],
    });

    const providerMap = useMemo(() => {
        const map = {};
        providers.forEach((provider) => {
            map[provider.id] = provider.name;
        });
        return map;
    }, [providers]);

    const fetchOrders = useCallback(async (filtersState) => {
        const activeFilters = filtersState || DEFAULT_FILTERS;
        setLoading(true);
        try {
            const params = {};
            if (activeFilters.dateRange?.length === 2) {
                params.date_from = activeFilters.dateRange[0];
                params.date_to = activeFilters.dateRange[1];
            }
            if (activeFilters.totalSumMin !== null) {
                params.total_sum_min = activeFilters.totalSumMin;
            }
            if (activeFilters.totalSumMax !== null) {
                params.total_sum_max = activeFilters.totalSumMax;
            }
            if (activeFilters.rejectedSumMin !== null) {
                params.rejected_sum_min = activeFilters.rejectedSumMin;
            }
            if (activeFilters.rejectedSumMax !== null) {
                params.rejected_sum_max = activeFilters.rejectedSumMax;
            }
            const [ordersResp, providersResp] = await Promise.all([
                getSupplierOrders(params),
                getProviders({ page: 1, page_size: 100 }),
            ]);
            setOrders(ordersResp.data || []);
            setProviders(providersResp.data?.items || []);
        } catch {
            message.error('Не удалось загрузить заказы поставщикам');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders(DEFAULT_FILTERS);
    }, [fetchOrders]);

    const dataSource = useMemo(() => {
        return (orders || []).map((order) => ({
            key: order.id,
            ...order,
        }));
    }, [orders]);

    const formatMoney = (value) => {
        if (value === null || value === undefined) return '—';
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        return num.toFixed(2);
    };

    const formatDateTime = (value) => {
        if (!value) return '—';
        return dayjs(value).format('DD.MM.YYYY HH:mm');
    };

    const columns = [
        {
            title: 'Дата формирования',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 170,
            render: formatDateTime,
        },
        {
            title: '№ заказа',
            dataIndex: 'id',
            key: 'id',
            width: 100,
            render: (value) => `#${value}`,
        },
        {
            title: 'Кол-во заказов',
            dataIndex: 'customer_orders_count',
            key: 'customer_orders_count',
            width: 130,
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_id',
            key: 'provider_id',
            width: 180,
            render: (value) => providerMap[value] || value,
        },
        {
            title: 'Сумма заказа',
            dataIndex: 'total_sum',
            key: 'total_sum',
            width: 140,
            render: formatMoney,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (value) => {
                const meta = SUPPLIER_ORDER_STATUS_META[value];
                if (!meta) return value || '—';
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Отказ поставщика',
            dataIndex: 'rejected_sum',
            key: 'rejected_sum',
            width: 140,
            render: (value) => {
                const num = Number(value);
                if (!num) return <span style={{ color: '#aaa' }}>—</span>;
                return <span style={{ color: '#cf1322' }}>{num.toFixed(2)}</span>;
            },
        },
    ];

    const handleSendSelected = async () => {
        if (!selectedRowKeys.length) {
            message.warning('Выберите заказы');
            return;
        }
        const orderIds = Array.from(
            new Set(
                selectedRowKeys
                    .map((key) => {
                        if (typeof key === 'number') {
                            return key;
                        }
                        if (typeof key === 'string' && /^\d+$/.test(key)) {
                            return Number(key);
                        }
                        return Number.NaN;
                    })
                    .filter((value) => !Number.isNaN(value))
            )
        );
        if (!orderIds.length) {
            message.error(
                'Не удалось определить ID выбранных заказов. Обновите список и выберите заново.'
            );
            return;
        }
        setSendingSelected(true);
        try {
            const { data } = await sendSupplierOrders(orderIds);
            const sent = Number(data?.sent || 0);
            const failed = Number(data?.failed || 0);
            if (failed > 0) {
                message.warning(
                    `Отправка завершена: отправлено ${sent}, ошибок ${failed}`
                );
            } else {
                message.success(`Отправлено ${sent} заказов`);
            }
            setSelectedRowKeys([]);
            await fetchOrders(filters);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(
                detail
                    || 'Ошибка отправки заказов'
            );
        } finally {
            setSendingSelected(false);
        }
    };

    const handleSendScheduled = async () => {
        setSendingScheduled(true);
        try {
            const { data } = await sendScheduledSupplierOrders();
            const sent = Number(data?.sent || 0);
            const failed = Number(data?.failed || 0);
            if (failed > 0) {
                message.warning(
                    `Плановая отправка: отправлено ${sent}, ошибок ${failed}`
                );
            } else {
                message.success(`Плановая отправка: отправлено ${sent}`);
            }
            await fetchOrders(filters);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(
                detail
                    || 'Ошибка отправки запланированных заказов'
            );
        } finally {
            setSendingScheduled(false);
        }
    };

    const selectedOrdersCount = selectedRowKeys.length;

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
                { oem: '', brand: '', name: '', quantity: 1, lookupResults: [] },
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
        if (!formState.providerId) {
            message.warning('Выберите поставщика');
            return;
        }
        const cleanedItems = formState.items
            .map((item) => ({
                oem: item.oem.trim(),
                brand: item.brand.trim(),
                quantity: Number(item.quantity),
            }))
            .filter((item) => item.oem && item.brand && item.quantity > 0);
        if (!cleanedItems.length) {
            message.warning('Добавьте позиции');
            return;
        }
        setCreating(true);
        try {
            await createManualSupplierOrder({
                provider_id: formState.providerId,
                items: cleanedItems,
            });
            message.success('Заказ поставщику создан');
            setCreateOpen(false);
            setFormState({
                providerId: null,
                items: [{ oem: '', brand: '', name: '', quantity: 1, lookupResults: [] }],
            });
            fetchOrders(filters);
        } catch (err) {
            const detail =
                err?.response?.data?.detail ||
                'Не удалось создать заказ поставщику';
            message.error(detail);
        } finally {
            setCreating(false);
        }
    };

    return (
        <Card>
            <Title level={3}>Заказы поставщикам (из заказов клиентов)</Title>
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
                <InputNumber
                    placeholder="Сумма от"
                    min={0}
                    value={filters.totalSumMin}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, totalSumMin: value }))
                    }
                />
                <InputNumber
                    placeholder="Сумма до"
                    min={0}
                    value={filters.totalSumMax}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, totalSumMax: value }))
                    }
                />
                <InputNumber
                    placeholder="Отказ сумма от"
                    min={0}
                    value={filters.rejectedSumMin}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, rejectedSumMin: value }))
                    }
                />
                <InputNumber
                    placeholder="Отказ сумма до"
                    min={0}
                    value={filters.rejectedSumMax}
                    onChange={(value) =>
                        setFilters((prev) => ({ ...prev, rejectedSumMax: value }))
                    }
                />
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
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Button
                    type="primary"
                    onClick={handleSendSelected}
                    disabled={!selectedOrdersCount}
                    loading={sendingSelected}
                >
                    Отправить выбранные{selectedOrdersCount ? ` (${selectedOrdersCount})` : ''}
                </Button>
                <Button onClick={handleSendScheduled} loading={sendingScheduled}>
                    Отправить по расписанию
                </Button>
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                    Создать заказ поставщику
                </Button>
            </div>
            <Table
                loading={loading}
                dataSource={dataSource}
                columns={columns}
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => {
                        setSelectedRowKeys(
                            (keys || []).filter((key) => key !== null && key !== undefined)
                        );
                    },
                }}
                onRow={(record) => ({
                    onClick: (event) => {
                        if (
                            event.target.closest('button') ||
                            event.target.closest('input') ||
                            event.target.closest('.ant-select') ||
                            event.target.closest('.ant-checkbox-wrapper') ||
                            event.target.closest('.ant-checkbox') ||
                            event.target.closest('label')
                        ) {
                            return;
                        }
                        navigate(`/customer-orders/suppliers/${record.id}`);
                    },
                })}
                pagination={{ pageSize: 20 }}
            />
            <Modal
                title="Новый заказ поставщику"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={handleCreateOrder}
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={creating}
                width={900}
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <Select
                        allowClear
                        style={{ minWidth: 240 }}
                        placeholder="Поставщик"
                        value={formState.providerId}
                        onChange={(value) =>
                            setFormState((prev) => ({ ...prev, providerId: value || null }))
                        }
                        options={(providers || []).map((provider) => ({
                            value: provider.id,
                            label: provider.name,
                        }))}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {formState.items.map((item, index) => (
                        <div key={index} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Input
                                placeholder="OEM"
                                value={item.oem}
                                onChange={(event) => updateItem(index, 'oem', event.target.value)}
                                onBlur={(event) => handleOemBlur(index, event.target.value)}
                                style={{ width: 160 }}
                            />
                            {item.lookupResults && item.lookupResults.length > 1 ? (
                                <Select
                                    allowClear
                                    placeholder="Бренд"
                                    value={item.brand || undefined}
                                    onChange={(value) => handleBrandSelect(index, value)}
                                    style={{ width: 220 }}
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
                                    style={{ width: 160 }}
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

export default CustomerSupplierOrdersPage;
