import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, InputNumber, message, Modal, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { getSupplierOrders, sendSupplierOrders, sendScheduledSupplierOrders } from '../api/customerOrders';
import { getProviders } from '../api/providers';
import { getCustomersSummary } from '../api/customers';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const DEFAULT_FILTERS = {
    customerId: null,
    dateRange: null,
    totalSumMin: null,
    totalSumMax: null,
    rejectedSumMin: null,
    rejectedSumMax: null,
};

const CustomerSupplierOrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [providers, setProviders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);

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
            if (activeFilters.customerId) {
                params.customer_id = activeFilters.customerId;
            }
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
                getProviders({ page: 1, page_size: 200 }),
            ]);
            setOrders(ordersResp.data || []);
            setProviders(providersResp.data?.items || []);
            const customersResp = await getCustomersSummary({
                page: 1,
                page_size: 200,
            });
            setCustomers(customersResp.data?.items || []);
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
            title: 'Время заказа',
            dataIndex: 'customer_received_at',
            key: 'customer_received_at',
            width: 170,
            render: formatDateTime,
        },
        {
            title: '№ заказа',
            dataIndex: 'customer_order_number',
            key: 'customer_order_number',
            width: 140,
            render: (value, record) => value || record.customer_order_id || '—',
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            key: 'customer_name',
            width: 180,
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
            title: 'Склад (мы)',
            dataIndex: 'stock_sum',
            key: 'stock_sum',
            width: 130,
            render: formatMoney,
        },
        {
            title: 'Склад поставщиков',
            dataIndex: 'supplier_sum',
            key: 'supplier_sum',
            width: 160,
            render: formatMoney,
        },
        {
            title: 'Статус',
            dataIndex: 'customer_status',
            key: 'customer_status',
            width: 120,
            render: (value) => value || '—',
        },
        {
            title: 'Сумма отказа',
            dataIndex: 'rejected_sum',
            key: 'rejected_sum',
            width: 140,
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
    ];

    const handleSendSelected = async () => {
        if (!selectedRowKeys.length) {
            message.warning('Выберите заказы');
            return;
        }
        const orderIds = Array.from(
            new Set(selectedRowKeys.map((key) => Number(key)))
        ).filter((value) => !Number.isNaN(value));
        Modal.confirm({
            title: 'Отправить выбранные заказы?',
            content: 'Проверьте список перед отправкой.',
            okText: 'Отправить',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await sendSupplierOrders(orderIds);
                    message.success('Заказы отправлены');
                    setSelectedRowKeys([]);
                    fetchOrders();
                } catch {
                    message.error('Ошибка отправки заказов');
                }
            },
        });
    };

    const handleSendScheduled = async () => {
        Modal.confirm({
            title: 'Отправить заказы по расписанию?',
            content: 'Будут отправлены все заказы, готовые к отправке.',
            okText: 'Отправить',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await sendScheduledSupplierOrders();
                    message.success('Запланированные заказы отправлены');
                    fetchOrders();
                } catch {
                    message.error('Ошибка отправки запланированных заказов');
                }
            },
        });
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
                <Button type="primary" onClick={handleSendSelected}>
                    Отправить выбранные
                </Button>
                <Button onClick={handleSendScheduled}>
                    Отправить по расписанию
                </Button>
            </div>
            <Table
                loading={loading}
                dataSource={dataSource}
                columns={columns}
                rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                }}
                pagination={{ pageSize: 20 }}
            />
        </Card>
    );
};

export default CustomerSupplierOrdersPage;
