import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    message,
    Select,
    Table,
    Tag,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getCustomerOrder,
    processManualCustomerOrder,
    updateCustomerOrderItem,
} from '../api/customerOrders';
import { getCustomersSummary } from '../api/customers';
import { getProviders } from '../api/providers';

const { Title } = Typography;

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
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [updatingItems, setUpdatingItems] = useState({});
    const [processing, setProcessing] = useState(false);

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

    const orderItems = order?.items || [];
    const summary = useMemo(() => {
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
    }, [orderItems]);

    const columns = [
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
            width: 140,
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
                    style={{ minWidth: 200 }}
                />
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 220,
            render: (_, record) => (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

    return (
        <Card loading={loading}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
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
            </div>
            <Title level={3}>Заказ клиента</Title>
            {order ? (
                <>
                    <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
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
                    </Descriptions>
                    <Table
                        rowKey="id"
                        dataSource={order.items || []}
                        columns={columns}
                        pagination={false}
                        size="small"
                    />
                </>
            ) : (
                <div>Заказ не найден.</div>
            )}
        </Card>
    );
};

export default CustomerOrderDetailPage;
