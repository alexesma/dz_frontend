import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Card, DatePicker, Select, Table, Typography, Row, Col, Spin } from 'antd';

import api from '../api';
import { getCustomersSummary } from '../api/customers';
import { getStockOrders } from '../api/customerOrders';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const getDefaultDateRange = () => {
    const today = dayjs();
    const start = today.day() === 1
        ? today.subtract(3, 'day').startOf('day')
        : today.subtract(1, 'day').startOf('day');
    return [start, today.endOf('day')];
};

const formatCreatedAt = (value) => {
    if (!value) return '—';
    const date = dayjs(value);
    if (!date.isValid()) return value;
    const now = dayjs();
    if (date.isSame(now, 'day')) {
        return `Сегодня ${date.format('HH:mm')}`;
    }
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
        return `Вчера ${date.format('HH:mm')}`;
    }
    return date.format('DD.MM.YY HH:mm');
};

const StockOrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [brands, setBrands] = useState([]);
    const [storages, setStorages] = useState([]);
    const [filters, setFilters] = useState({
        dateRange: getDefaultDateRange(),
        brandId: null,
        customerId: null,
        storageLocationId: null,
    });

    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [customersResp, brandsResp, storagesResp] = await Promise.all([
                    getCustomersSummary({ page: 1, page_size: 200 }),
                    api.get('/brand/'),
                    api.get('/storage/'),
                ]);
                const customersData = customersResp.data?.items || customersResp.data || [];
                setCustomers(customersData);
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
                const storageLocations = item.autopart?.storage_locations || [];
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
                    storageLocations,
                    storageText: storageLocations.join(', '),
                });
            });
        });
        return rows;
    }, [orders]);

    const columns = [
        {
            title: 'Заказ',
            dataIndex: 'orderId',
            key: 'orderId',
            width: 76,
        },
        {
            title: 'Клиент',
            dataIndex: 'customerId',
            key: 'customerId',
            width: 180,
            ellipsis: true,
            render: (value) => customerMap[value] || value,
        },
        {
            title: 'OEM',
            dataIndex: 'oem',
            key: 'oem',
            width: 150,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brandId',
            key: 'brandId',
            width: 110,
            ellipsis: true,
            render: (value) => brandMap[value] || value,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 240,
            ellipsis: true,
        },
        {
            title: 'Место хранения',
            dataIndex: 'storageText',
            key: 'storageText',
            width: 180,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 84,
            align: 'right',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 96,
            ellipsis: true,
        },
        {
            title: 'Создан',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 138,
            render: formatCreatedAt,
        },
    ];

    return (
        <div className="page-shell">
            <Card>
                <Title level={3}>Заказы с нашего склада</Title>
                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <RangePicker
                            style={{ width: '100%' }}
                            value={filters.dateRange}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                dateRange: value || getDefaultDateRange(),
                            }))}
                            format="DD.MM.YY"
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
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        size="small"
                        scroll={{ x: 1180 }}
                    />
                )}
            </Card>
        </div>
    );
};

export default StockOrdersPage;
