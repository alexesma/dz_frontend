import React, { useEffect, useState } from 'react';
import { Table, Input, Button, message, Spin, Tag, Space, Card, Popconfirm } from 'antd';
import {
    SearchOutlined, ReloadOutlined, EditOutlined,
    DeleteOutlined, PlusOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCustomers, deleteCustomer } from '../api/customers';

const { Search } = Input;

const CustomersList = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const { data } = await getCustomers();
            const list = Array.isArray(data)
                ? data
                : data?.items || data?.results || data?.data || data?.customers || [];
            if (!Array.isArray(list)) {
                console.warn('Unexpected customers payload shape:', data);
                setCustomers([]);
            } else {
                setCustomers(list);
            }
        } catch (error) {
            message.error('Ошибка загрузки клиентов');
            console.error('Fetch customers error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (value) => {
        setSearchText(value);
        // TODO: реализовать поиск на бэкенде если нужно
        fetchCustomers();
    };

    const handleEdit = (id) => {
        navigate(`/customers/${id}/edit`);
    };

    const handleDelete = async (customerId) => {
        try {
            await deleteCustomer(customerId);
            message.success('Клиент удалён');
            fetchCustomers();
        } catch (error) {
            console.error('Delete customer error:', error);
            message.error('Ошибка удаления клиента');
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 70,
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <div style={{ fontWeight: 'bold' }}>{text}</div>,
        },
        {
            title: 'Email исходящих прайсов',
            dataIndex: 'email_outgoing_price',
            key: 'email_outgoing_price',
            render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'Контактный Email',
            dataIndex: 'email_contact',
            key: 'email_contact',
            render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'Тип цен',
            dataIndex: 'type_prices',
            key: 'type_prices',
            render: (type) => (
                <Tag color={type === 'Wholesale' ? 'blue' : 'green'}>
                    {type === 'Wholesale' ? 'Оптовые' : 'Розничные'}
                </Tag>
            ),
        },
        {
            title: 'Прайс-листы',
            key: 'customer_price_lists',
            render: (_, record) => {
                const priceLists = record.customer_price_lists || [];
                const count = priceLists.length;

                if (count === 0) {
                    return <Tag color="default">Нет прайсов</Tag>;
                }

                return <Tag color="blue">Всего: {count}</Tag>;
            },
        },
        {
            title: 'Конфигурации',
            key: 'pricelist_configs',
            render: (_, record) => {
                const configs = record.pricelist_configs || [];
                if (!configs.length) {
                    return <Tag color="default">Нет</Tag>;
                }
                const sourcesCount = configs.reduce(
                    (sum, cfg) => sum + (cfg.sources_count || 0),
                    0
                );
                return (
                    <Space direction="vertical" size={2}>
                        <Tag color="green">Конфигов: {configs.length}</Tag>
                        <Tag color="blue">Источников: {sourcesCount}</Tag>
                    </Space>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record.id)}
                    />
                    <Popconfirm
                        title="Удалить клиента?"
                        description="Это действие необратимо"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button
                            type="primary"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card title="Список клиентов" style={{ margin: '20px' }}>
            <div style={{ marginBottom: 16 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                        <Search
                            placeholder="Поиск по названию клиента"
                            allowClear
                            enterButton={<SearchOutlined />}
                            size="middle"
                            style={{ width: 300 }}
                            onSearch={handleSearch}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchCustomers}
                            loading={loading}
                        >
                            Обновить
                        </Button>
                    </Space>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/customers/create')}
                        size="middle"
                    >
                        Добавить клиента
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={customers}
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 1200 }}
                    size="middle"
                />
            </Spin>
        </Card>
    );
};

export default CustomersList;
