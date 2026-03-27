import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { getSupplierOrderDetail, sendSupplierOrders } from '../api/customerOrders';

const { Title } = Typography;

const SUPPLIER_STATUS_LABELS = {
    NEW: 'Новый',
    SCHEDULED: 'Запланирован',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
};

const SUPPLIER_STATUS_COLORS = {
    NEW: 'default',
    SCHEDULED: 'blue',
    SENT: 'green',
    ERROR: 'red',
};

const CustomerSupplierOrderDetailPage = () => {
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const fetchData = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const { data } = await getSupplierOrderDetail(orderId);
            setOrder(data);
        } catch {
            message.error('Не удалось загрузить заказ поставщику');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    const totals = useMemo(() => {
        const items = order?.items || [];
        let totalSum = 0;
        let totalQty = 0;
        items.forEach((item) => {
            const qty = Number(item.quantity ?? 0);
            const price = Number(item.price ?? 0);
            totalQty += qty;
            totalSum += qty * price;
        });
        return { totalSum, totalQty };
    }, [order]);

    const handleSendNow = async () => {
        if (!order) return;
        setSending(true);
        try {
            await sendSupplierOrders([order.id]);
            message.success('Заказ отправлен');
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось отправить заказ';
            message.error(detail);
        } finally {
            setSending(false);
        }
    };

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
            width: 240,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 110,
            render: formatMoney,
        },
        {
            title: 'Заказано',
            dataIndex: 'requested_qty',
            key: 'requested_qty',
            width: 110,
            render: (value) => value ?? '—',
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
    ];

    return (
        <div className="page-shell">
            <Card loading={loading}>
                <div className="page-header-actions" style={{ marginBottom: 16 }}>
                    <Button onClick={() => navigate('/customer-orders/suppliers')}>
                        Назад к списку
                    </Button>
                    {order?.status !== 'SENT' && (
                        <Button
                            type="primary"
                            onClick={handleSendNow}
                            loading={sending}
                        >
                            Отправить сейчас
                        </Button>
                    )}
                </div>
                <Title level={3}>Заказ поставщику</Title>
                {order ? (
                    <>
                        <Descriptions
                            bordered
                            size="small"
                            column={{ xs: 1, sm: 1, md: 2 }}
                            style={{ marginBottom: 16 }}
                        >
                            <Descriptions.Item label="Поставщик">
                                {order.provider_name || order.provider_id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Статус">
                                <Tag color={SUPPLIER_STATUS_COLORS[order.status] || 'default'}>
                                    {SUPPLIER_STATUS_LABELS[order.status] || order.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Создан">
                                {formatDateTime(order.created_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Запланирован">
                                {formatDateTime(order.scheduled_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отправлен">
                                {formatDateTime(order.sent_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Кол-во позиций">
                                {totals.totalQty}
                            </Descriptions.Item>
                            <Descriptions.Item label="Сумма заказа">
                                {formatMoney(totals.totalSum)}
                            </Descriptions.Item>
                        </Descriptions>
                        <Table
                            rowKey="id"
                            dataSource={order.items || []}
                            columns={columns}
                            pagination={false}
                            size="small"
                            scroll={{ x: 'max-content' }}
                        />
                    </>
                ) : (
                    <div>Заказ не найден.</div>
                )}
            </Card>
        </div>
    );
};

export default CustomerSupplierOrderDetailPage;
