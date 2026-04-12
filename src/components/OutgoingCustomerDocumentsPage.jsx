import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { useNavigate } from 'react-router-dom';

import { getCustomerOrders } from '../api/customerOrders';
import { getCustomersSummary } from '../api/customers';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const getDefaultDateRange = () => {
    const today = dayjs();
    return [today.subtract(7, 'day').startOf('day'), today.endOf('day')];
};

const STATUS_META = {
    NEW: { label: 'Новый', color: 'default' },
    PROCESSED: { label: 'Обработан', color: 'blue' },
    SENT: { label: 'Отправлен', color: 'green' },
    ERROR: { label: 'Ошибка', color: 'red' },
};

const OutgoingCustomerDocumentsPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [filters, setFilters] = useState({
        customerId: null,
        status: 'all',
        dateRange: getDefaultDateRange(),
    });

    useEffect(() => {
        const loadCustomers = async () => {
            try {
                const response = await getCustomersSummary({
                    page: 1,
                    page_size: 200,
                });
                setCustomers(response?.data?.items || []);
            } catch (err) {
                console.error('Failed to fetch customers', err);
                message.error('Не удалось загрузить список клиентов');
            }
        };
        loadCustomers();
    }, []);

    const customerMap = useMemo(() => {
        const map = {};
        (customers || []).forEach((customer) => {
            map[customer.id] = customer.name;
        });
        return map;
    }, [customers]);

    const fetchDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.customerId) {
                params.customer_id = filters.customerId;
            }
            if (filters.status !== 'all') {
                params.status = filters.status;
            }
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const response = await getCustomerOrders(params);
            const rows = (response.data || []).filter(
                (row) => !!row.response_file_name || row.status === 'SENT'
            );
            setOrders(rows);
        } catch (err) {
            console.error('Failed to fetch outgoing customer docs', err);
            message.error('Не удалось загрузить исходящие документы');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 90,
            render: (value) => `#${value}`,
        },
        {
            title: 'Получен',
            dataIndex: 'received_at',
            key: 'received_at',
            width: 150,
            render: (value) => (value ? dayjs(value).format('DD.MM.YY HH:mm') : '—'),
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_id',
            key: 'customer_id',
            width: 220,
            ellipsis: true,
            render: (value) => customerMap[value] || `#${value}`,
        },
        {
            title: 'Номер заказа',
            key: 'order_number',
            width: 180,
            render: (_, row) => row.order_number || `#${row.id}`,
        },
        {
            title: 'Письмо-источник',
            dataIndex: 'source_email',
            key: 'source_email',
            width: 220,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Файл ответа',
            dataIndex: 'response_file_name',
            key: 'response_file_name',
            width: 260,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (value) => {
                const meta = STATUS_META[value] || { label: value, color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (_, row) => (
                <Button
                    size="small"
                    onClick={() => navigate(`/customer-orders/${row.id}`)}
                >
                    Открыть
                </Button>
            ),
        },
    ];

    return (
        <div className="page-shell">
            <Card>
                <Title level={3}>Документы: исходящие</Title>
                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Клиент"
                            style={{ width: '100%' }}
                            value={filters.customerId}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                customerId: value || null,
                            }))}
                            options={(customers || []).map((customer) => ({
                                value: customer.id,
                                label: customer.name,
                            }))}
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <RangePicker
                            style={{ width: '100%' }}
                            value={filters.dateRange}
                            format="DD.MM.YY"
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                dateRange: value || getDefaultDateRange(),
                            }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select
                            style={{ width: '100%' }}
                            value={filters.status}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                status: value,
                            }))}
                            options={[
                                { value: 'all', label: 'Все статусы' },
                                { value: 'NEW', label: 'Новые' },
                                { value: 'PROCESSED', label: 'Обработаны' },
                                { value: 'SENT', label: 'Отправлены' },
                                { value: 'ERROR', label: 'Ошибка' },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Space style={{ width: '100%' }}>
                            <Button
                                type="primary"
                                block
                                onClick={fetchDocuments}
                                loading={loading}
                            >
                                Обновить
                            </Button>
                        </Space>
                    </Col>
                </Row>

                {!orders.length && !loading ? (
                    <Empty description="Исходящие документы не найдены" />
                ) : (
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={(orders || []).map((row) => ({ ...row, key: row.id }))}
                        columns={columns}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        scroll={{ x: 1400 }}
                    />
                )}
            </Card>
        </div>
    );
};

export default OutgoingCustomerDocumentsPage;
