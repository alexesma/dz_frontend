import React, { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Select, Table, Typography, Row, Col, Spin } from 'antd';
import { getCustomers } from '../api/customers';
import api from '../api';
import { getStockOrders } from '../api/customerOrders';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const StockOrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [brands, setBrands] = useState([]);
    const [storages, setStorages] = useState([]);
    const [filters, setFilters] = useState({
        dateRange: null,
        brandId: null,
        customerId: null,
        storageLocationId: null,
    });

    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [customersResp, brandsResp, storagesResp] = await Promise.all([
                    getCustomers(),
                    api.get('/brand/'),
                    api.get('/storage/'),
                ]);
                setCustomers(customersResp.data || []);
                setBrands(brandsResp.data || []);
                setStorages(storagesResp.data || []);
            } catch (err) {
                console.error('Failed to load filters data', err);
            }
        };
        fetchMeta();
    }, []);

    const brandMap = useMemo(() => {
        const map = {};
        brands.forEach((brand) => {
            map[brand.id] = brand.name;
        });
        return map;
    }, [brands]);

    const customerMap = useMemo(() => {
        const map = {};
        customers.forEach((customer) => {
            map[customer.id] = customer.name;
        });
        return map;
    }, [customers]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.customerId) params.customer_id = filters.customerId;
            if (filters.brandId) params.brand_id = filters.brandId;
            if (filters.storageLocationId) params.storage_location_id = filters.storageLocationId;
            if (filters.dateRange && filters.dateRange.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const resp = await getStockOrders(params);
            setOrders(resp.data || []);
        } catch (err) {
            console.error('Failed to fetch stock orders', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const dataSource = useMemo(() => {
        const rows = [];
        orders.forEach((order) => {
            (order.items || []).forEach((item) => {
                rows.push({
                    key: `${order.id}-${item.id}`,
                    orderId: order.id,
                    customerId: order.customer_id,
                    createdAt: order.created_at,
                    status: order.status,
                    quantity: item.quantity,
                    oem: item.autopart?.oem_number || '',
                    brandId: item.autopart?.brand_id || null,
                    name: item.autopart?.name || '',
                });
            });
        });
        return rows;
    }, [orders]);

    const columns = [
        { title: 'Заказ', dataIndex: 'orderId', key: 'orderId', width: 90 },
        {
            title: 'Клиент',
            dataIndex: 'customerId',
            key: 'customerId',
            render: (value) => customerMap[value] || value,
        },
        { title: 'OEM', dataIndex: 'oem', key: 'oem' },
        {
            title: 'Бренд',
            dataIndex: 'brandId',
            key: 'brandId',
            render: (value) => brandMap[value] || value,
        },
        { title: 'Наименование', dataIndex: 'name', key: 'name' },
        { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 120 },
        { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
    ];

    return (
        <Card>
            <Title level={3}>Заказы с нашего склада</Title>
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} md={8}>
                    <RangePicker
                        style={{ width: '100%' }}
                        value={filters.dateRange}
                        onChange={(value) => setFilters((prev) => ({ ...prev, dateRange: value }))}
                    />
                </Col>
                <Col xs={24} md={5}>
                    <Select
                        allowClear
                        placeholder="Клиент"
                        style={{ width: '100%' }}
                        value={filters.customerId}
                        onChange={(value) => setFilters((prev) => ({ ...prev, customerId: value }))}
                        options={customers.map((c) => ({ label: c.name, value: c.id }))}
                    />
                </Col>
                <Col xs={24} md={5}>
                    <Select
                        allowClear
                        placeholder="Бренд"
                        style={{ width: '100%' }}
                        value={filters.brandId}
                        onChange={(value) => setFilters((prev) => ({ ...prev, brandId: value }))}
                        options={brands.map((b) => ({ label: b.name, value: b.id }))}
                    />
                </Col>
                <Col xs={24} md={6}>
                    <Select
                        allowClear
                        placeholder="Место хранения"
                        style={{ width: '100%' }}
                        value={filters.storageLocationId}
                        onChange={(value) => setFilters((prev) => ({ ...prev, storageLocationId: value }))}
                        options={storages.map((s) => ({ label: s.name, value: s.id }))}
                    />
                </Col>
            </Row>
            {loading ? (
                <Spin />
            ) : (
                <Table
                    dataSource={dataSource}
                    columns={columns}
                    pagination={{ pageSize: 20 }}
                />
            )}
        </Card>
    );
};

export default StockOrdersPage;
