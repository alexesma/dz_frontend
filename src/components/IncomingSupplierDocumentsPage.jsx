import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Empty,
    Modal,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

import { getAllProviders } from '../api/providers';
import {
    deleteSupplierReceipt,
    getSupplierReceipt,
    getSupplierReceipts,
    postSupplierReceipt,
    unpostSupplierReceipt,
} from '../api/customerOrders';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const VAT_RATE = 0.22;

const getDefaultDateRange = () => {
    const today = dayjs();
    return [today.subtract(7, 'day').startOf('day'), today.endOf('day')];
};

const formatMoney = (value) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (Number.isNaN(num)) return '—';
    return num.toFixed(2);
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

    // Detail modal state
    const [detailVisible, setDetailVisible] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailReceipt, setDetailReceipt] = useState(null);

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

    const handleOpenDetail = async (receiptId) => {
        setDetailVisible(true);
        setDetailLoading(true);
        setDetailReceipt(null);
        try {
            const { data } = await getSupplierReceipt(receiptId);
            setDetailReceipt(data);
        } catch (err) {
            console.error('Failed to load receipt detail', err);
            message.error('Не удалось загрузить документ');
            setDetailVisible(false);
        } finally {
            setDetailLoading(false);
        }
    };

    const handlePost = async (receiptId) => {
        setPostingId(receiptId);
        try {
            await postSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} проведен`);
            fetchDocuments();
            if (detailReceipt?.id === receiptId) {
                handleOpenDetail(receiptId);
            }
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
            if (detailReceipt?.id === receiptId) {
                handleOpenDetail(receiptId);
            }
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
            width: 80,
            align: 'right',
            render: (_, row) => Number(row.items?.length || 0),
        },
        {
            title: 'Кол-во',
            key: 'qty',
            width: 80,
            align: 'right',
            render: (_, row) => (
                row.items || []
            ).reduce((sum, item) => sum + Number(item.received_quantity || 0), 0),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 300,
            render: (_, row) => (
                <Space size="small" wrap>
                    <Tooltip title="Открыть документ">
                        <Button
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => handleOpenDetail(row.id)}
                        >
                            Открыть
                        </Button>
                    </Tooltip>
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

    // ─── Detail modal columns ────────────────────────────────────────────────

    const buildDetailColumns = (isVatPayer) => [
        {
            title: '№',
            key: 'row_num',
            width: 50,
            align: 'center',
            render: (_, __, index) => index + 1,
        },
        {
            title: 'Артикул',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 140,
            render: (v) => v || '—',
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 120,
            render: (v) => v || '—',
        },
        {
            title: 'Наименование',
            dataIndex: 'autopart_name',
            key: 'autopart_name',
            ellipsis: true,
            render: (v) => v || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'received_quantity',
            key: 'received_quantity',
            width: 80,
            align: 'right',
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 100,
            align: 'right',
            render: formatMoney,
        },
        {
            title: 'Сумма',
            key: 'total',
            width: 110,
            align: 'right',
            render: (_, row) => {
                const qty = Number(row.received_quantity || 0);
                const price = Number(row.price || 0);
                if (!qty || !price) return '—';
                return formatMoney(qty * price);
            },
        },
        ...(isVatPayer ? [
            {
                title: 'НДС 22%',
                key: 'vat',
                width: 110,
                align: 'right',
                render: (_, row) => {
                    const qty = Number(row.received_quantity || 0);
                    const price = Number(row.price || 0);
                    if (!qty || !price) return '—';
                    return formatMoney(qty * price * VAT_RATE);
                },
            },
            {
                title: 'Сумма с НДС',
                key: 'total_vat',
                width: 120,
                align: 'right',
                render: (_, row) => {
                    if (row.total_price_with_vat != null) {
                        return <Text strong>{formatMoney(row.total_price_with_vat)}</Text>;
                    }
                    const qty = Number(row.received_quantity || 0);
                    const price = Number(row.price || 0);
                    if (!qty || !price) return '—';
                    return <Text strong>{formatMoney(qty * price * (1 + VAT_RATE))}</Text>;
                },
            },
        ] : [
            {
                title: 'Сумма итого',
                key: 'total_final',
                width: 120,
                align: 'right',
                render: (_, row) => {
                    if (row.total_price_with_vat != null) {
                        return <Text strong>{formatMoney(row.total_price_with_vat)}</Text>;
                    }
                    const qty = Number(row.received_quantity || 0);
                    const price = Number(row.price || 0);
                    if (!qty || !price) return '—';
                    return <Text strong>{formatMoney(qty * price)}</Text>;
                },
            },
        ]),
        {
            title: 'ГТД',
            dataIndex: 'gtd_code',
            key: 'gtd_code',
            width: 140,
            ellipsis: true,
            render: (v) => v || '—',
        },
        {
            title: 'Страна',
            dataIndex: 'country_name',
            key: 'country_name',
            width: 110,
            ellipsis: true,
            render: (v, row) => v || row.country_code || '—',
        },
        {
            title: 'Заказал',
            key: 'customer',
            width: 160,
            ellipsis: true,
            render: (_, row) => {
                if (!row.customer_name && !row.customer_order_number) return '—';
                const parts = [];
                if (row.customer_name) parts.push(row.customer_name);
                if (row.customer_order_number) parts.push(`№${row.customer_order_number}`);
                return <Tooltip title={parts.join(' / ')}>{parts.join(' / ')}</Tooltip>;
            },
        },
        {
            title: 'Примечание',
            dataIndex: 'comment',
            key: 'comment',
            width: 150,
            ellipsis: true,
            render: (v) => v || '—',
        },
    ];

    const detailTotals = (items, isVatPayer) => {
        let totalQty = 0;
        let totalSum = 0;
        let totalVat = 0;
        let totalWithVat = 0;
        (items || []).forEach((item) => {
            const qty = Number(item.received_quantity || 0);
            const price = Number(item.price || 0);
            totalQty += qty;
            const lineSum = qty * price;
            totalSum += lineSum;
            if (isVatPayer) {
                if (item.total_price_with_vat != null) {
                    totalWithVat += Number(item.total_price_with_vat);
                    totalVat += Number(item.total_price_with_vat) - lineSum;
                } else {
                    totalVat += lineSum * VAT_RATE;
                    totalWithVat += lineSum * (1 + VAT_RATE);
                }
            } else {
                if (item.total_price_with_vat != null) {
                    totalWithVat += Number(item.total_price_with_vat);
                } else {
                    totalWithVat += lineSum;
                }
            }
        });
        return { totalQty, totalSum, totalVat, totalWithVat };
    };

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
                        scroll={{ x: 1400 }}
                        onRow={(row) => ({
                            onClick: (e) => {
                                // don't open detail if clicking action buttons
                                if (e.target.closest('button')) return;
                                handleOpenDetail(row.id);
                            },
                            style: { cursor: 'pointer' },
                        })}
                    />
                )}
            </Card>

            {/* ─── Document Detail Modal ─────────────────────────────────── */}
            <Modal
                open={detailVisible}
                onCancel={() => setDetailVisible(false)}
                footer={null}
                width="90%"
                style={{ maxWidth: 1400, top: 24 }}
                title={
                    detailReceipt
                        ? `Документ поступления #${detailReceipt.id}`
                        : 'Документ поступления'
                }
                destroyOnClose
            >
                {detailLoading && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <Spin size="large" />
                    </div>
                )}
                {!detailLoading && detailReceipt && (() => {
                    const isVatPayer = detailReceipt.provider_is_vat_payer;
                    const items = detailReceipt.items || [];
                    const { totalQty, totalSum, totalVat, totalWithVat } = detailTotals(items, isVatPayer);
                    const detailCols = buildDetailColumns(isVatPayer);

                    return (
                        <>
                            {/* Header info */}
                            <Descriptions
                                size="small"
                                bordered
                                column={{ xs: 1, sm: 2, md: 3 }}
                                style={{ marginBottom: 16 }}
                            >
                                <Descriptions.Item label="Поставщик">
                                    <Text strong>{detailReceipt.provider_name || '—'}</Text>
                                    {isVatPayer && (
                                        <Tag color="blue" style={{ marginLeft: 8 }}>
                                            Плательщик НДС
                                        </Tag>
                                    )}
                                </Descriptions.Item>
                                <Descriptions.Item label="Номер УПД">
                                    {detailReceipt.document_number || '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Дата документа">
                                    {detailReceipt.document_date
                                        ? dayjs(detailReceipt.document_date).format('DD.MM.YYYY')
                                        : '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Статус">
                                    {detailReceipt.posted_at
                                        ? <Tag color="green">Проведен</Tag>
                                        : <Tag color="gold">Черновик</Tag>}
                                </Descriptions.Item>
                                <Descriptions.Item label="Дата проведения">
                                    {detailReceipt.posted_at
                                        ? dayjs(detailReceipt.posted_at).format('DD.MM.YYYY HH:mm')
                                        : '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="НДС">
                                    {isVatPayer
                                        ? <Tag color="blue">22%</Tag>
                                        : <Tag>Без НДС</Tag>}
                                </Descriptions.Item>
                                <Descriptions.Item label="Создан">
                                    {dayjs(detailReceipt.created_at).format('DD.MM.YYYY HH:mm')}
                                </Descriptions.Item>
                                <Descriptions.Item label="Создал">
                                    {detailReceipt.created_by_email || '—'}
                                </Descriptions.Item>
                                {detailReceipt.comment && (
                                    <Descriptions.Item label="Комментарий" span={3}>
                                        {detailReceipt.comment}
                                    </Descriptions.Item>
                                )}
                            </Descriptions>

                            {/* Items table */}
                            <Table
                                size="small"
                                dataSource={items.map((item, idx) => ({
                                    ...item,
                                    key: item.id ?? idx,
                                }))}
                                columns={detailCols}
                                pagination={false}
                                scroll={{ x: isVatPayer ? 1500 : 1400 }}
                                bordered
                                summary={() => (
                                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                                        <Table.Summary.Cell index={0} colSpan={4} align="right">
                                            Итого:
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={4} align="right">
                                            {totalQty}
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={5} />
                                        <Table.Summary.Cell index={6} align="right">
                                            {formatMoney(totalSum)}
                                        </Table.Summary.Cell>
                                        {isVatPayer ? (
                                            <>
                                                <Table.Summary.Cell index={7} align="right">
                                                    {formatMoney(totalVat)}
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={8} align="right">
                                                    {formatMoney(totalWithVat)}
                                                </Table.Summary.Cell>
                                            </>
                                        ) : (
                                            <Table.Summary.Cell index={7} align="right">
                                                {formatMoney(totalWithVat)}
                                            </Table.Summary.Cell>
                                        )}
                                        <Table.Summary.Cell index={isVatPayer ? 9 : 8} colSpan={3} />
                                    </Table.Summary.Row>
                                )}
                            />

                            {/* Action buttons */}
                            <div style={{ marginTop: 16, textAlign: 'right' }}>
                                <Space>
                                    {detailReceipt.posted_at ? (
                                        <Button
                                            onClick={() => handleUnpost(detailReceipt.id)}
                                            loading={unpostingId === detailReceipt.id}
                                        >
                                            Распровести
                                        </Button>
                                    ) : (
                                        <Button
                                            type="primary"
                                            onClick={() => handlePost(detailReceipt.id)}
                                            loading={postingId === detailReceipt.id}
                                        >
                                            Провести
                                        </Button>
                                    )}
                                    <Button onClick={() => setDetailVisible(false)}>
                                        Закрыть
                                    </Button>
                                </Space>
                            </div>
                        </>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default IncomingSupplierDocumentsPage;
