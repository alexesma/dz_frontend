import React, { useCallback, useEffect, useState } from 'react';
import { Table, Input, Button, message, Spin, Tag, Space, Card, Popconfirm, Select } from 'antd';
import { SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import api from "../api.js";
import { formatMoscow } from '../utils/time';
import { useNavigate } from 'react-router-dom';

const { Search } = Input;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_FILTERS = {
    hasActivePricelists: 'all',
    hasPricelistConfig: 'all',
    isVirtual: 'all',
};
const DEFAULT_SORT = { sortBy: 'name', sortDir: 'asc' };

const ProvidersList = () => {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortState, setSortState] = useState(DEFAULT_SORT);
    const [pagination, setPagination] = useState({
        current: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} поставщиков`,
    });
    const [searchText, setSearchText] = useState('');
    const navigate = useNavigate();

    const fetchProviders = useCallback(async (
        page,
        pageSize,
        search,
        filtersState,
        sortStateValue
    ) => {
        const effectivePage = page ?? DEFAULT_PAGE;
        const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE;
        const effectiveSearch = search ?? '';
        const effectiveFilters = filtersState || DEFAULT_FILTERS;
        const effectiveSort = sortStateValue || DEFAULT_SORT;
        setLoading(true);
        try {
            const params = {
                page: effectivePage,
                page_size: effectivePageSize,
            };

            if (effectiveSearch) {
                params.search = effectiveSearch;
            }
            if (effectiveFilters.hasActivePricelists !== 'all') {
                params.has_active_pricelists =
                    effectiveFilters.hasActivePricelists === 'yes';
            }
            if (effectiveFilters.hasPricelistConfig !== 'all') {
                params.has_pricelist_config =
                    effectiveFilters.hasPricelistConfig === 'yes';
            }
            if (effectiveFilters.isVirtual !== 'all') {
                params.is_virtual = effectiveFilters.isVirtual === 'yes';
            }
            if (effectiveSort.sortBy) {
                params.sort_by = effectiveSort.sortBy;
                params.sort_dir = effectiveSort.sortDir;
            }

            const response = await api.get('/providers/', { params });

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
    }, []);

    useEffect(() => {
        fetchProviders(
            DEFAULT_PAGE,
            DEFAULT_PAGE_SIZE,
            '',
            DEFAULT_FILTERS,
            DEFAULT_SORT
        );
    }, [fetchProviders]);

    const handleSearch = (value) => {
        setSearchText(value);
        setPagination(prev => ({ ...prev, current: 1 }));
        fetchProviders(1, pagination.pageSize, value, filters, sortState);
    };

    const handleTableChange = (paginationConfig, tableFilters, sorter) => {
        setPagination(paginationConfig);
        const sortBy = sorter?.field || sortState.sortBy;
        const sortDir = sorter?.order === 'descend' ? 'desc' : 'asc';
        const nextSort = {
            sortBy,
            sortDir,
        };
        setSortState(nextSort);
        fetchProviders(
            paginationConfig.current,
            paginationConfig.pageSize,
            searchText,
            filters,
            nextSort
        );
    };

    const handleRefresh = () => {
        fetchProviders(
            pagination.current,
            pagination.pageSize,
            searchText,
            filters,
            sortState
        );
    };

    const handleFilterChange = (key, value) => {
        const nextFilters = { ...filters, [key]: value };
        setFilters(nextFilters);
        setPagination(prev => ({ ...prev, current: 1 }));
        fetchProviders(1, pagination.pageSize, searchText, nextFilters, sortState);
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
            sortOrder: sortState.sortBy === 'id' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            sorter: true,
            sortOrder: sortState.sortBy === 'name' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
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
                                {formatMoscow(record.last_email_uid.updated_at)}
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
            width: 140,
            render: (text, record) => (
                <Space size="small" wrap className="table-actions">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record.id)}
                    />
                    <Popconfirm
                        title="Удалить поставщика?"
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
        <div className="page-shell">
        <Card title="Список поставщиков">
            <div style={{ marginBottom: 16 }}>
                <div className="page-toolbar">
                    <div className="page-toolbar-main">
                        <Search
                            placeholder="Поиск по названию поставщика"
                            allowClear
                            enterButton={<SearchOutlined />}
                            size="middle"
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
                        <Select
                            value={filters.hasActivePricelists}
                            onChange={(value) =>
                                handleFilterChange('hasActivePricelists', value)
                            }
                            style={{ width: 220 }}
                            options={[
                                { value: 'all', label: 'Все прайсы' },
                                { value: 'yes', label: 'Есть активные прайсы' },
                                { value: 'no', label: 'Нет активных прайсов' },
                            ]}
                        />
                        <Select
                            value={filters.hasPricelistConfig}
                            onChange={(value) =>
                                handleFilterChange('hasPricelistConfig', value)
                            }
                            style={{ width: 210 }}
                            options={[
                                { value: 'all', label: 'Все конфиги' },
                                { value: 'yes', label: 'Есть конфиг' },
                                { value: 'no', label: 'Без конфига' },
                            ]}
                        />
                        <Select
                            value={filters.isVirtual}
                            onChange={(value) =>
                                handleFilterChange('isVirtual', value)
                            }
                            style={{ width: 190 }}
                            options={[
                                { value: 'all', label: 'Все поставщики' },
                                { value: 'yes', label: 'Виртуальные' },
                                { value: 'no', label: 'Обычные' },
                            ]}
                        />
                    </div>
                    <div className="page-toolbar-side">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddProvider}
                        size="middle"
                    >
                        Добавить поставщика
                    </Button>
                    </div>
                </div>
            </div>

            <Spin spinning={loading}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={providers}
                    pagination={pagination}
                    onChange={handleTableChange}
                    scroll={{ x: 'max-content' }}
                    size="middle"
                />
            </Spin>
        </Card>
        </div>
    );
};

export default ProvidersList;
