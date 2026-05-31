import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Popconfirm,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getOrderDetail,
    getOrderItems,
    updateOrderStatus,
    updateTrackingOrderItem,
} from '../api/orderTracking';
import { formatMoscow } from '../utils/time';

const { Title, Text } = Typography;

const ORDER_STATUS_LABELS = {
    ORDERED: { color: 'orange', label: 'Отправлен поставщику' },
    PROCESSING: { color: 'cyan', label: 'В обработке' },
    CONFIRMED: { color: 'green', label: 'Подтверждён' },
    ARRIVED: { color: 'purple', label: 'Прибыл' },
    SHIPPED: { color: 'blue', label: 'Отгружен' },
    TRANSIT: { color: 'geekblue', label: 'В пути' },
    ACCEPTED: { color: 'lime', label: 'Принят' },
    CANCELLED: { color: 'red', label: 'Отменён' },
    RETURNED: { color: 'gold', label: 'Возврат' },
    ERROR: { color: 'volcano', label: 'Ошибка' },
};

const ITEM_STATUS_LABELS = {
    New: { color: 'blue', label: 'Новый' },
    Send: { color: 'orange', label: 'Отправлен' },
    Confirmed: { color: 'green', label: 'Подтверждён' },
    Rejected: { color: 'red', label: 'Отклонён' },
    Fulfilled: { color: 'purple', label: 'Выполнен' },
    Error: { color: 'volcano', label: 'Ошибка' },
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

const renderStatusTag = (value, labelsMap) => {
    const meta = labelsMap[String(value || '')] || {
        color: 'default',
        label: value || '—',
    };
    return <Tag color={meta.color}>{meta.label}</Tag>;
};

const OrderDetailPage = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [order, setOrder] = useState(null);
    const [items, setItems] = useState([]);
    const [orderStatusSaving, setOrderStatusSaving] = useState(false);
    const [rowActionLoadingId, setRowActionLoadingId] = useState(null);
    const [bulkReceiveLoading, setBulkReceiveLoading] = useState(false);
    const [selectedItemKeys, setSelectedItemKeys] = useState([]);
    const [selectedOrderStatus, setSelectedOrderStatus] = useState(undefined);

    const loadOrder = useCallback(async () => {
        if (!orderId) {
            setError('Не передан ID заказа');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [{ data: orderData }, { data: itemsData }] = await Promise.all([
                getOrderDetail(orderId),
                getOrderItems(orderId),
            ]);
            setOrder(orderData || null);
            setItems(Array.isArray(itemsData) ? itemsData : []);
            setSelectedOrderStatus(orderData?.status || undefined);
        } catch (loadError) {
            const detail = loadError?.response?.data?.detail;
            setError(detail || 'Не удалось загрузить карточку заказа');
            setOrder(null);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        void loadOrder();
    }, [loadOrder]);

    const totalSum = useMemo(
        () => items.reduce(
            (acc, item) => acc + Number(item?.price || 0) * Number(item?.quantity || 0),
            0
        ),
        [items]
    );

    const receivableItems = useMemo(
        () => items.filter((item) => Number(item?.received_quantity || 0) < Number(item?.quantity || 0)),
        [items]
    );

    useEffect(() => {
        const availableKeys = new Set(items.map((item) => item.id));
        setSelectedItemKeys((prev) => prev.filter((key) => availableKeys.has(key)));
    }, [items]);

    const handleUpdateOrderStatus = async (nextStatus) => {
        if (!order?.id || !nextStatus || nextStatus === order.status) {
            return;
        }
        setOrderStatusSaving(true);
        try {
            await updateOrderStatus(order.id, nextStatus);
            message.success('Статус заказа обновлён');
            await loadOrder();
        } catch (updateError) {
            const detail = updateError?.response?.data?.detail;
            message.error(detail || 'Не удалось обновить статус заказа');
        } finally {
            setOrderStatusSaving(false);
        }
    };

    const handleReceiveItemFully = async (item) => {
        if (!item?.id) {
            return;
        }
        setRowActionLoadingId(item.id);
        try {
            await updateTrackingOrderItem('site', item.id, {
                received_quantity: Number(item.quantity || 0),
            });
            message.success(`Строка ${item.oem_number || item.id} отмечена как полученная`);
            await loadOrder();
        } catch (updateError) {
            const detail = updateError?.response?.data?.detail;
            message.error(detail || 'Не удалось обновить получение по строке');
        } finally {
            setRowActionLoadingId(null);
        }
    };

    const handleReceiveSelectedItems = async () => {
        const targetItems = items.filter(
            (item) =>
                selectedItemKeys.includes(item.id) &&
                Number(item?.received_quantity || 0) < Number(item?.quantity || 0)
        );
        if (!targetItems.length) {
            message.warning('Выбери хотя бы одну строку, которую ещё нужно принять');
            return;
        }
        setBulkReceiveLoading(true);
        try {
            for (const item of targetItems) {
                await updateTrackingOrderItem('site', item.id, {
                    received_quantity: Number(item.quantity || 0),
                });
            }
            message.success(`Приняты строки: ${targetItems.length}`);
            setSelectedItemKeys([]);
            await loadOrder();
        } catch (updateError) {
            const detail = updateError?.response?.data?.detail;
            message.error(detail || 'Не удалось массово отметить строки как полученные');
        } finally {
            setBulkReceiveLoading(false);
        }
    };

    const handleReceiveAllItems = async () => {
        if (!receivableItems.length) {
            message.info('Все строки заказа уже приняты');
            return;
        }
        setBulkReceiveLoading(true);
        try {
            for (const item of receivableItems) {
                await updateTrackingOrderItem('site', item.id, {
                    received_quantity: Number(item.quantity || 0),
                });
            }
            message.success(`Приняты все неполученные строки: ${receivableItems.length}`);
            setSelectedItemKeys([]);
            await loadOrder();
        } catch (updateError) {
            const detail = updateError?.response?.data?.detail;
            message.error(detail || 'Не удалось принять все неполученные строки');
        } finally {
            setBulkReceiveLoading(false);
        }
    };

    const orderStatusOptions = Object.entries(ORDER_STATUS_LABELS).map(([value, meta]) => ({
        value,
        label: meta.label,
    }));

    const columns = [
        {
            title: 'Позиция',
            key: 'position',
            width: 280,
            render: (_, row) => (
                <div>
                    <div style={{ fontWeight: 700 }}>
                        {row.brand_name || '—'} {row.oem_number || '—'}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                        {row.autopart_name || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 100,
        },
        {
            title: 'Получено',
            dataIndex: 'received_quantity',
            width: 110,
            render: (value) => value ?? '—',
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 120,
            render: (value) => `${formatMoney(value)} руб.`,
        },
        {
            title: 'Срок',
            key: 'lead',
            width: 110,
            render: (_, row) => {
                if (row.min_delivery_day == null && row.max_delivery_day == null) {
                    return '—';
                }
                if (row.min_delivery_day === row.max_delivery_day) {
                    return `${row.min_delivery_day} дн`;
                }
                return `${row.min_delivery_day ?? '—'}-${row.max_delivery_day ?? '—'} дн`;
            },
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 130,
            render: (value) => renderStatusTag(value, ITEM_STATUS_LABELS),
        },
        {
            title: 'Tracking UUID',
            dataIndex: 'tracking_uuid',
            width: 220,
            render: (value) => (
                <Text copyable style={{ fontSize: 12 }}>
                    {value}
                </Text>
            ),
        },
        {
            title: 'Комментарий',
            dataIndex: 'comments',
            width: 200,
            render: (value) => value || '—',
        },
        {
            title: 'Действие',
            key: 'action',
            width: 170,
            render: (_, row) => {
                const receivedQty = Number(row?.received_quantity || 0);
                const totalQty = Number(row?.quantity || 0);
                const isFullyReceived = receivedQty >= totalQty && totalQty > 0;
                return (
                    <Space direction="vertical" size={4}>
                        <Popconfirm
                            title="Отметить строку как полученную полностью?"
                            description={`Будет записано получение ${totalQty} шт.`}
                            disabled={isFullyReceived}
                            onConfirm={() => {
                                void handleReceiveItemFully(row);
                            }}
                        >
                            <Button
                                size="small"
                                type={isFullyReceived ? 'default' : 'primary'}
                                loading={rowActionLoadingId === row.id}
                                disabled={isFullyReceived}
                            >
                                {isFullyReceived ? 'Получено' : 'Принять всё'}
                            </Button>
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space wrap>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate('/orders')}
                        >
                            К списку заказов
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={() => {
                                void loadOrder();
                            }}
                        >
                            Обновить
                        </Button>
                    </Space>
                    {!loading && !error && order ? (
                        <Space wrap>
                            <Select
                                value={selectedOrderStatus}
                                options={orderStatusOptions}
                                style={{ width: 220 }}
                                onChange={(value) => setSelectedOrderStatus(value)}
                            />
                            <Button
                                type="primary"
                                loading={orderStatusSaving}
                                disabled={!selectedOrderStatus || selectedOrderStatus === order.status}
                                onClick={() => {
                                    void handleUpdateOrderStatus(selectedOrderStatus);
                                }}
                            >
                                Обновить статус заказа
                            </Button>
                            <Button
                                loading={orderStatusSaving}
                                onClick={() => {
                                    setSelectedOrderStatus(order.status);
                                }}
                            >
                                Сбросить
                            </Button>
                        </Space>
                    ) : null}
                </Space>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                        <Spin size="large" />
                    </div>
                ) : null}

                {!loading && error ? (
                    <Alert type="error" message={error} showIcon />
                ) : null}

                {!loading && !error && order ? (
                    <>
                        <div>
                            <Title level={3} style={{ marginBottom: 4 }}>
                                Заказ №{order.order_number || order.id}
                            </Title>
                            <Text type="secondary">
                                Карточка обычного заказа, созданного через Dragonzap/API.
                            </Text>
                        </div>

                        <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
                            <Descriptions.Item label="ID заказа">{order.id}</Descriptions.Item>
                            <Descriptions.Item label="Статус">
                                {renderStatusTag(order.status, ORDER_STATUS_LABELS)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Клиент ID">
                                {order.customer_id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Поставщик ID">
                                {order.provider_id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Создан">
                                {formatMoscow(order.created_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Обновлён">
                                {formatMoscow(order.updated_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Позиций">
                                {items.length}
                            </Descriptions.Item>
                            <Descriptions.Item label="Сумма">
                                {`${formatMoney(totalSum)} руб.`}
                            </Descriptions.Item>
                            <Descriptions.Item label="Комментарий">
                                {order.comment || '—'}
                            </Descriptions.Item>
                        </Descriptions>

                        <Space wrap style={{ marginTop: 8 }}>
                            <Text type="secondary">
                                Выбрано строк: {selectedItemKeys.length}
                            </Text>
                            <Button
                                type="primary"
                                loading={bulkReceiveLoading}
                                disabled={!selectedItemKeys.length}
                                onClick={() => {
                                    void handleReceiveSelectedItems();
                                }}
                            >
                                Принять выбранные строки
                            </Button>
                            <Popconfirm
                                title="Принять все неполученные строки заказа?"
                                description={`Будут отмечены как полученные ${receivableItems.length} строк.`}
                                disabled={!receivableItems.length}
                                onConfirm={() => {
                                    void handleReceiveAllItems();
                                }}
                            >
                                <Button
                                    loading={bulkReceiveLoading}
                                    disabled={!receivableItems.length}
                                >
                                    Принять все неполученные
                                </Button>
                            </Popconfirm>
                            <Text type="secondary">
                                Ожидают приёмки: {receivableItems.length}
                            </Text>
                        </Space>

                        <Table
                            rowKey="id"
                            columns={columns}
                            dataSource={items}
                            rowSelection={{
                                selectedRowKeys: selectedItemKeys,
                                onChange: (keys) => setSelectedItemKeys(keys),
                                getCheckboxProps: (record) => ({
                                    disabled:
                                        Number(record?.received_quantity || 0) >= Number(record?.quantity || 0),
                                }),
                            }}
                            pagination={{ pageSize: 20 }}
                            scroll={{ x: 1360 }}
                        />
                    </>
                ) : null}
            </Space>
        </Card>
    );
};

export default OrderDetailPage;
