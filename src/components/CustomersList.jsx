import React, { useCallback, useEffect, useState } from 'react';
import { Table, Input, Button, message, Spin, Tag, Space, Card, Popconfirm, Select } from 'antd';
import {
    SearchOutlined, ReloadOutlined, EditOutlined,
    DeleteOutlined, PlusOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCustomersSummary, deleteCustomer } from '../api/customers';

const { Search } = Input;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_FILTERS = {
    typePrices: 'all',
    hasPriceLists: 'all',
    hasPricelistConfigs: 'all',
};
const DEFAULT_SORT = {
    sortBy: 'name',
    sortDir: 'asc',
};

const CustomersList = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortState, setSortState] = useState(DEFAULT_SORT);
    const [pagination, setPagination] = useState({
        current: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100', '200'],
        showTotal: (total, range) =>
            `${range[0]}-${range[1]} из ${total} клиентов`,
    });
    const navigate = useNavigate();

    const fetchCustomers = useCallback(async (
        page,
        pageSize,
        nextSearch,
        filtersState,
        sortStateValue
    ) => {
        const effectivePage = page ?? DEFAULT_PAGE;
        const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE;
        const effectiveSearch = nextSearch ?? '';
        const effectiveFilters = filtersState || DEFAULT_FILTERS;
        const effectiveSort = sortStateValue || DEFAULT_SORT;
        setLoading(true);
        try {
            const params = {};
            if (effectiveSearch && effectiveSearch.trim()) {
                params.search = effectiveSearch.trim();
            }
            params.page = effectivePage;
            params.page_size = effectivePageSize;
            if (effectiveFilters.typePrices !== 'all') {
                params.type_prices = effectiveFilters.typePrices;
            }
            if (effectiveFilters.hasPriceLists !== 'all') {
                params.has_price_lists =
                    effectiveFilters.hasPriceLists === 'yes';
            }
            if (effectiveFilters.hasPricelistConfigs !== 'all') {
                params.has_pricelist_configs =
                    effectiveFilters.hasPricelistConfigs === 'yes';
            }
            if (effectiveSort.sortBy) {
                params.sort_by = effectiveSort.sortBy;
                params.sort_dir = effectiveSort.sortDir;
            }

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
    }, []);

    useEffect(() => {
        fetchCustomers(
            DEFAULT_PAGE,
            DEFAULT_PAGE_SIZE,
            '',
            DEFAULT_FILTERS,
            DEFAULT_SORT
        );
    }, [fetchCustomers]);

    const handleSearch = (value) => {
        setSearchText(value);
        setPagination((prev) => ({ ...prev, current: 1 }));
        fetchCustomers(1, pagination.pageSize, value, filters, sortState);
    };

    const handleTableChange = (paginationConfig, tableFilters, sorter) => {
        setPagination(paginationConfig);
        const sortBy = sorter?.field || sortState.sortBy;
        const sortDir = sorter?.order === 'descend' ? 'desc' : 'asc';
        const nextSort = { sortBy, sortDir };
        setSortState(nextSort);
        fetchCustomers(
            paginationConfig.current,
            paginationConfig.pageSize,
            searchText,
            filters,
            nextSort
        );
    };

    const handleEdit = (id) => {
        navigate(`/customers/${id}/edit`);
    };

    const handleDelete = async (customerId) => {
        try {
            await deleteCustomer(customerId);
            message.success('Клиент удалён');
            fetchCustomers(
                pagination.current,
                pagination.pageSize,
                searchText,
                filters,
                sortState
            );
        } catch (error) {
            console.error('Delete customer error:', error);
            message.error('Ошибка удаления клиента');
        }
    };

    const handleFilterChange = (key, value) => {
        const nextFilters = { ...filters, [key]: value };
        setFilters(nextFilters);
        setPagination((prev) => ({ ...prev, current: 1 }));
        fetchCustomers(1, pagination.pageSize, searchText, nextFilters, sortState);
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 56,
            sorter: true,
            sortOrder: sortState.sortBy === 'id' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            sorter: true,
            sortOrder: sortState.sortBy === 'name' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
            ellipsis: true,
            render: (text) => (
                <div className="directory-cell__title" title={text}>
                    {text}
                </div>
            ),
        },
        {
            title: 'Исходящий email',
            dataIndex: 'email_outgoing_price',
            key: 'email_outgoing_price',
            width: 188,
            ellipsis: true,
            render: (email) => (
                <span title={email || ''}>
                    {email || <span style={{ color: '#ccc' }}>—</span>}
                </span>
            ),
        },
        {
            title: 'Контакт',
            dataIndex: 'email_contact',
            key: 'email_contact',
            width: 168,
            ellipsis: true,
            render: (email) => (
                <span title={email || ''}>
                    {email || <span style={{ color: '#ccc' }}>—</span>}
                </span>
            ),
        },
        {
            title: 'Тип цен',
            dataIndex: 'type_prices',
            key: 'type_prices',
            width: 112,
            render: (type) => (
                <Tag color={type === 'Wholesale' ? 'blue' : 'green'}>
                    {type === 'Wholesale' ? 'Оптовые' : 'Розничные'}
                </Tag>
            ),
        },
        {
            title: 'Прайс-листы',
            key: 'customer_price_lists',
            dataIndex: 'price_lists_count',
            width: 112,
            sorter: true,
            sortOrder: sortState.sortBy === 'price_lists_count' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
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
            dataIndex: 'pricelist_configs_count',
            width: 136,
            sorter: true,
            sortOrder: sortState.sortBy === 'pricelist_configs_count' ? (sortState.sortDir === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, record) => {
                const configsCount = record.pricelist_configs_count ?? 0;
                const sourcesCount = record.pricelist_sources_count ?? 0;
                if (!configsCount) {
                    return <Tag color="default">Нет</Tag>;
                }
                return (
                    <Space direction="vertical" size={2} className="directory-cell">
                        <span>Конфигов: {configsCount}</span>
                        <span className="directory-cell__meta">Источников: {sourcesCount}</span>
                    </Space>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 92,
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
                <div className="page-toolbar">
                    <div className="page-toolbar-main">
                        <Search
                            placeholder="Поиск по названию клиента"
                            allowClear
                            enterButton={<SearchOutlined />}
                            size="middle"
                            onSearch={handleSearch}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() =>
                                fetchCustomers(
                                    pagination.current,
                                    pagination.pageSize,
                                    searchText,
                                    filters,
                                    sortState
                                )
                            }
                            loading={loading}
                        >
                            Обновить
                        </Button>
                        <Select
                            value={filters.typePrices}
                            onChange={(value) =>
                                handleFilterChange('typePrices', value)
                            }
                            style={{ width: 190 }}
                            options={[
                                { value: 'all', label: 'Все типы цен' },
                                { value: 'Wholesale', label: 'Оптовые' },
                                { value: 'Retail', label: 'Розничные' },
                            ]}
                        />
                        <Select
                            value={filters.hasPriceLists}
                            onChange={(value) =>
                                handleFilterChange('hasPriceLists', value)
                            }
                            style={{ width: 190 }}
                            options={[
                                { value: 'all', label: 'Все прайсы' },
                                { value: 'yes', label: 'Есть прайсы' },
                                { value: 'no', label: 'Нет прайсов' },
                            ]}
                        />
                        <Select
                            value={filters.hasPricelistConfigs}
                            onChange={(value) =>
                                handleFilterChange('hasPricelistConfigs', value)
                            }
                            style={{ width: 210 }}
                            options={[
                                { value: 'all', label: 'Все конфиги' },
                                { value: 'yes', label: 'Есть конфиги' },
                                { value: 'no', label: 'Без конфигов' },
                            ]}
                        />
                    </div>
                    <div className="page-toolbar-side">
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => navigate('/customers/create')}
                            size="middle"
                        >
                            Добавить клиента
                        </Button>
                    </div>
                </div>
            </div>

            <Spin spinning={loading}>
                <Table
                    className="directory-table"
                    rowKey="id"
                    columns={columns}
                    dataSource={customers}
                    pagination={pagination}
                    onChange={handleTableChange}
                    scroll={{ x: 1040 }}
                    size="small"
                    tableLayout="fixed"
                />
            </Spin>
        </Card>
    );
};

export default CustomersList;
