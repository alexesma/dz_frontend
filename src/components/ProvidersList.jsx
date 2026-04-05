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
            render: (text, record) => (
                <div className="directory-cell">
                    <div className="directory-cell__title" title={text}>
                        {text}
                    </div>
                    {record.abbr && (
                        <Tag color="blue">{record.abbr}</Tag>
                    )}
                </div>
            ),
        },
        {
            title: 'Входящий email',
            dataIndex: 'email_incoming_price',
            key: 'email_incoming_price',
            width: 176,
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
            width: 170,
            ellipsis: true,
            render: (email) => (
                <span title={email || ''}>
                    {email || <span style={{ color: '#ccc' }}>—</span>}
                </span>
            ),
        },
        {
            title: 'Последний UID',
            key: 'last_email_uid',
            width: 152,
            render: (text, record) => {
                if (!record.last_email_uid) {
                    return <span style={{ color: '#ccc' }}>—</span>;
                }
                const uidText = String(record.last_email_uid.uid || '');
                const compactUid = uidText.length > 12 ? `${uidText.slice(0, 12)}...` : uidText;
                return (
                    <div className="directory-cell">
                        <div
                            className="directory-cell__mono"
                            title={`UID: ${uidText}`}
                        >
                            UID: {compactUid}
                        </div>
                        {record.last_email_uid.updated_at && (
                            <div className="directory-cell__meta">
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
            width: 120,
            render: (text, record) => {
                const priceLists = record.price_lists || [];
                const activeCount = priceLists.filter(pl => pl.is_active).length;
                const totalCount = priceLists.length;

                if (totalCount === 0) {
                    return <Tag color="default">Нет прайсов</Tag>;
                }

                return (
                    <div className="directory-cell">
                        <span>Активных: {activeCount}</span>
                        <span className="directory-cell__meta">Всего: {totalCount}</span>
                    </div>
                );
            },
        },
        {
            title: 'Конфиг',
            key: 'pricelist_config',
            width: 150,
            render: (_, record) => {
                const cfg = record.pricelist_config;
                if (!cfg) return <Tag color="red">Не настроен</Tag>;

                return (
                    <Space direction="vertical" size={2} className="directory-cell">
                        <Tag color="green">Настроен</Tag>
                        <div className="directory-cell__meta">
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
            width: 92,
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
                    className="directory-table"
                    rowKey="id"
                    columns={columns}
                    dataSource={providers}
                    pagination={pagination}
                    onChange={handleTableChange}
                    scroll={{ x: 1080 }}
                    size="small"
                    tableLayout="fixed"
                />
            </Spin>
        </Card>
        </div>
    );
};

export default ProvidersList;
