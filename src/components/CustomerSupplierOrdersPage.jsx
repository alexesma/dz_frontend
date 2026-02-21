import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, message, Table, Typography } from 'antd';
import { getSupplierOrders, sendSupplierOrders, sendScheduledSupplierOrders } from '../api/customerOrders';
import { getProviders } from '../api/providers';

const { Title } = Typography;

const CustomerSupplierOrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const providerMap = useMemo(() => {
        const map = {};
        providers.forEach((provider) => {
            map[provider.id] = provider.name;
        });
        return map;
    }, [providers]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const [ordersResp, providersResp] = await Promise.all([
                getSupplierOrders(),
                getProviders({ page: 1, page_size: 200 }),
            ]);
            setOrders(ordersResp.data || []);
            setProviders(providersResp.data?.providers || []);
        } catch {
            message.error('Не удалось загрузить заказы поставщикам');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const dataSource = useMemo(() => {
        const rows = [];
        orders.forEach((order) => {
            (order.items || []).forEach((item) => {
                rows.push({
                    key: `${order.id}-${item.id}`,
                    orderId: order.id,
                    providerId: order.provider_id,
                    status: order.status,
                    createdAt: order.created_at,
                    quantity: item.quantity,
                    price: item.price,
                });
            });
        });
        return rows;
    }, [orders]);

    const columns = [
        { title: 'Заказ', dataIndex: 'orderId', key: 'orderId', width: 90 },
        {
            title: 'Поставщик',
            dataIndex: 'providerId',
            key: 'providerId',
            render: (value) => providerMap[value] || value,
        },
        { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: 'Цена', dataIndex: 'price', key: 'price', width: 120 },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 120 },
        { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
    ];

    const handleSendSelected = async () => {
        if (!selectedRowKeys.length) {
            message.warning('Выберите заказы');
            return;
        }
        const orderIds = Array.from(new Set(selectedRowKeys.map((key) => Number(String(key).split('-')[0]))));
        try {
            await sendSupplierOrders(orderIds);
            message.success('Заказы отправлены');
            setSelectedRowKeys([]);
            fetchOrders();
        } catch {
            message.error('Ошибка отправки заказов');
        }
    };

    const handleSendScheduled = async () => {
        try {
            await sendScheduledSupplierOrders();
            message.success('Запланированные заказы отправлены');
            fetchOrders();
        } catch {
            message.error('Ошибка отправки запланированных заказов');
        }
    };

    return (
        <Card>
            <Title level={3}>Заказы поставщикам (из заказов клиентов)</Title>
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
