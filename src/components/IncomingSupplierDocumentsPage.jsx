import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Modal,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';

import { getAllProviders } from '../api/providers';
import {
    deleteSupplierReceipt,
    getSupplierReceipts,
    postSupplierReceipt,
    unpostSupplierReceipt,
} from '../api/customerOrders';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const getDefaultDateRange = () => {
    const today = dayjs();
    return [today.subtract(7, 'day').startOf('day'), today.endOf('day')];
};

const IncomingSupplierDocumentsPage = () => {
    const [providers, setProviders] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [postingId, setPostingId] = useState(null);
    const [unpostingId, setUnpostingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [filters, setFilters] = useState({
        providerId: null,
        dateRange: getDefaultDateRange(),
        status: 'all',
    });

    useEffect(() => {
        const loadProviders = async () => {
            try {
                const items = await getAllProviders({
                    sort_by: 'name',
                    sort_dir: 'asc',
                });
                setProviders(items || []);
            } catch (err) {
                console.error('Failed to fetch providers', err);
                message.error('Не удалось загрузить поставщиков');
            }
        };
        loadProviders();
    }, []);

    const fetchDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.providerId) {
                params.provider_id = filters.providerId;
            }
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            if (filters.status === 'draft') {
                params.posted = false;
            } else if (filters.status === 'posted') {
                params.posted = true;
            }
            const response = await getSupplierReceipts(params);
            setRows(response.data || []);
        } catch (err) {
            console.error('Failed to fetch supplier documents', err);
            message.error('Не удалось загрузить документы поступления');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handlePost = async (receiptId) => {
        setPostingId(receiptId);
        try {
            await postSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} проведен`);
            fetchDocuments();
        } catch (err) {
            console.error('Failed to post supplier receipt', err);
            message.error(
                err?.response?.data?.detail || 'Не удалось провести документ'
            );
        } finally {
            setPostingId(null);
        }
    };

    const handleUnpost = async (receiptId) => {
        setUnpostingId(receiptId);
        try {
            await unpostSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} распроведен`);
            fetchDocuments();
        } catch (err) {
            console.error('Failed to unpost supplier receipt', err);
            message.error(
                err?.response?.data?.detail || 'Не удалось распровести документ'
            );
        } finally {
            setUnpostingId(null);
        }
    };

    const performDelete = async (receiptId) => {
        setDeletingId(receiptId);
        try {
            await deleteSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} удален`);
            fetchDocuments();
        } catch (err) {
            console.error('Failed to delete supplier receipt', err);
            message.error(
                err?.response?.data?.detail || 'Не удалось удалить документ'
            );
        } finally {
            setDeletingId(null);
        }
    };

    const confirmDeleteReceipt = (receiptId) => {
        Modal.confirm({
            title: 'Удалить документ?',
            content: 'Это действие необратимо. Продолжить?',
            okText: 'Продолжить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: () => new Promise((resolve) => {
                Modal.confirm({
                    title: `Подтвердите удаление #${receiptId}`,
                    content: 'Документ будет удален без возможности восстановления.',
                    okText: 'Удалить',
                    okButtonProps: { danger: true },
                    cancelText: 'Отмена',
                    onOk: async () => {
                        await performDelete(receiptId);
                        resolve();
                    },
                    onCancel: () => resolve(),
                });
            }),
        });
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 90,
            render: (value) => `#${value}`,
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            key: 'provider_name',
            width: 220,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Статус',
            key: 'posted_at',
            width: 120,
            render: (_, row) => (
                row.posted_at
                    ? <Tag color="green">Проведен</Tag>
                    : <Tag color="gold">Черновик</Tag>
            ),
        },
        {
            title: 'Документ',
            key: 'document',
            width: 220,
            render: (_, row) => {
                const number = row.document_number || 'без номера';
                const docDate = row.document_date
                    ? dayjs(row.document_date).format('DD.MM.YYYY')
                    : 'без даты';
                return `${number} · ${docDate}`;
            },
        },
        {
            title: 'Создан',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 150,
            render: (value) => (value ? dayjs(value).format('DD.MM.YY HH:mm') : '—'),
        },
        {
            title: 'Проведен',
            dataIndex: 'posted_at',
            key: 'posted_at',
            width: 150,
            render: (value) => (value ? dayjs(value).format('DD.MM.YY HH:mm') : '—'),
        },
        {
            title: 'Строк',
            key: 'items_count',
            width: 90,
            align: 'right',
            render: (_, row) => Number(row.items?.length || 0),
        },
        {
            title: 'Кол-во',
            key: 'qty',
            width: 90,
            align: 'right',
            render: (_, row) => (
                row.items || []
            ).reduce((sum, item) => sum + Number(item.received_quantity || 0), 0),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 260,
            render: (_, row) => (
                <Space size="small" wrap>
                    {row.posted_at ? (
                        <Button
                            size="small"
                            onClick={() => handleUnpost(row.id)}
                            loading={unpostingId === row.id}
                        >
                            Распровести
                        </Button>
                    ) : (
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => handlePost(row.id)}
                            loading={postingId === row.id}
                        >
                            Провести
                        </Button>
                    )}
                    <Button
                        size="small"
                        danger
                        loading={deletingId === row.id}
                        onClick={() => confirmDeleteReceipt(row.id)}
                    >
                        Удалить
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="page-shell">
            <Card>
                <Title level={3}>Документы: входящие</Title>
                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Поставщик"
                            style={{ width: '100%' }}
                            value={filters.providerId}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                providerId: value || null,
                            }))}
                            options={providers.map((provider) => ({
                                value: provider.id,
                                label: provider.name,
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
                                { value: 'all', label: 'Все' },
                                { value: 'draft', label: 'Черновики' },
                                { value: 'posted', label: 'Проведенные' },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Button
                            type="primary"
                            block
                            onClick={fetchDocuments}
                            loading={loading}
                        >
                            Обновить
                        </Button>
                    </Col>
                </Row>

                {!rows.length && !loading ? (
                    <Empty description="Документы не найдены" />
                ) : (
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={rows.map((row) => ({ ...row, key: row.id }))}
                        columns={columns}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        scroll={{ x: 1320 }}
                    />
                )}
            </Card>
        </div>
    );
};

export default IncomingSupplierDocumentsPage;
