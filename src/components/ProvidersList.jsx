import React, { useEffect, useState } from 'react';
import { Table, Input, Button, message, Spin, Tag, Space, Card } from 'antd';
import { SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Search } = Input;

const ProvidersList = () => {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} поставщиков`,
    });
    const [searchText, setSearchText] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchProviders();
    }, []);

    const fetchProviders = async (page = 1, pageSize = 10, search = '') => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
            };

            if (search) {
                params.search = search;
            }

            const response = await axios.get('http://0.0.0.0:8000/providers/', { params });

            setProviders(response.data.items);
            setPagination(prev => ({
                ...prev,
                current: response.data.page,
                pageSize: response.data.page_size,
                total: response.data.total,
            }));
        } catch (error) {
            message.error('Ошибка загрузки поставщиков.');
            console.error('Fetch providers error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (value) => {
        setSearchText(value);
        setPagination(prev => ({ ...prev, current: 1 }));
        fetchProviders(1, pagination.pageSize, value);
    };

    const handleTableChange = (paginationConfig) => {
        setPagination(paginationConfig);
        fetchProviders(paginationConfig.current, paginationConfig.pageSize, searchText);
    };

    const handleRefresh = () => {
        fetchProviders(pagination.current, pagination.pageSize, searchText);
    };

    const handleEdit = (id) => {
        navigate(`/providers/${id}/edit`);
    };

    const handleDelete = (providerId) => {
        // Логика удаления поставщика
        message.info(`Удаление поставщика ID: ${providerId}`);
    };

    const handleAddProvider = () => {
        navigate('/providers/create');
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 70,
            sorter: true,
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>{text}</div>
                    {record.abbr && (
                        <Tag color="blue" size="small">{record.abbr}</Tag>
                    )}
                </div>
            ),
        },
        {
            title: 'Email входящих прайсов',
            dataIndex: 'email_incoming_price',
            key: 'email_incoming_price',
            render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'Контактный Email',
            dataIndex: 'email_contact',
            key: 'email_contact',
            render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'Последний Email UID',
            key: 'last_email_uid',
            render: (text, record) => {
                if (!record.last_email_uid) {
                    return <span style={{ color: '#ccc' }}>—</span>;
                }
                return (
                    <div>
                        <div>UID: {record.last_email_uid.uid}</div>
                        {record.last_email_uid.updated_at && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                {new Date(record.last_email_uid.updated_at).toLocaleString()}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Прайс-листы',
            key: 'price_lists',
            render: (text, record) => {
                const priceLists = record.price_lists || [];
                const activeCount = priceLists.filter(pl => pl.is_active).length;
                const totalCount = priceLists.length;

                if (totalCount === 0) {
                    return <Tag color="default">Нет прайсов</Tag>;
                }

                return (
                    <div>
                        <Tag color={activeCount > 0 ? "green" : "orange"}>
                            Активных: {activeCount}
                        </Tag>
                        <Tag color="blue">Всего: {totalCount}</Tag>
                    </div>
                );
            },
        },
        {
            title: 'Конфигурация прайса',
            key: 'pricelist_config',
            render: (_, record) => {
                const cfg = record.pricelist_config;
                if (!cfg) return <Tag color="red">Не настроен</Tag>;

                return (
                    <Space direction="vertical" size={2}>
                        <Tag color="green">Настроен</Tag>
                        <div style={{fontSize: 12}}>
                            <Link to={`/provider-configs/${cfg.id}`}>
                                {cfg.name_price || `Конфиг #${cfg.id}`}
                            </Link>
                        </div>
                    </Space>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (text, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record.id)}
                    />
                    <Button
                        type="primary"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <Card title="Список поставщиков" style={{ margin: '20px' }}>
            <div style={{ marginBottom: 16 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                        <Search
                            placeholder="Поиск по названию поставщика"
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
                            onClick={handleRefresh}
                            loading={loading}
                        >
                            Обновить
                        </Button>
                    </Space>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddProvider}
                        size="middle"
                    >
                        Добавить поставщика
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={providers}
                    pagination={pagination}
                    onChange={handleTableChange}
                    scroll={{ x: 1200 }}
                    size="middle"
                />
            </Spin>
        </Card>
    );
};

export default ProvidersList;