import React, { useEffect, useState } from 'react';
import { Table, Input, Button, message, Spin, Tag, Space, Card, Popconfirm } from 'antd';
import {
    SearchOutlined, ReloadOutlined, EditOutlined,
    DeleteOutlined, PlusOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCustomersSummary, deleteCustomer } from '../api/customers';

const { Search } = Input;

const CustomersList = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100', '200'],
        showTotal: (total, range) =>
            `${range[0]}-${range[1]} из ${total} клиентов`,
    });
    const navigate = useNavigate();

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async (
        page = pagination.current,
        pageSize = pagination.pageSize,
        nextSearch = searchText
    ) => {
        setLoading(true);
        try {
            const params = {};
            if (nextSearch && nextSearch.trim()) {
                params.search = nextSearch.trim();
            }
            params.page = page;
            params.page_size = pageSize;

            const { data } = await getCustomersSummary(params);
            const list = Array.isArray(data) ? data : data?.items || [];
            if (!Array.isArray(list)) {
                console.warn('Unexpected customers payload shape:', data);
                setCustomers([]);
            } else {
                setCustomers(list);
            }
            if (data?.page && data?.page_size) {
                setPagination((prev) => ({
                    ...prev,
                    current: data.page,
                    pageSize: data.page_size,
                    total: data.total ?? prev.total,
                }));
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
        setPagination((prev) => ({ ...prev, current: 1 }));
        fetchCustomers(1, pagination.pageSize, value);
    };

    const handleTableChange = (paginationConfig) => {
        setPagination(paginationConfig);
        fetchCustomers(
            paginationConfig.current,
            paginationConfig.pageSize,
            searchText
        );
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
                const count = record.price_lists_count ?? 0;

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
                const configsCount = record.pricelist_configs_count ?? 0;
                const sourcesCount = record.pricelist_sources_count ?? 0;
                if (!configsCount) {
                    return <Tag color="default">Нет</Tag>;
                }
                return (
                    <Space direction="vertical" size={2}>
                        <Tag color="green">Конфигов: {configsCount}</Tag>
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
                    pagination={pagination}
                    onChange={handleTableChange}
                    scroll={{ x: 1200 }}
                    size="middle"
                />
            </Spin>
        </Card>
    );
};

export default CustomersList;
