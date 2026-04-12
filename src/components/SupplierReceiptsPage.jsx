import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Input,
    InputNumber,
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
    createSupplierReceipt,
    getSupplierReceiptCandidates,
    processSupplierResponses,
} from '../api/customerOrders';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const getDefaultSupplierDateRange = () => {
    const today = dayjs();
    const start = today.day() === 1
        ? today.subtract(3, 'day').startOf('day')
        : today.subtract(1, 'day').startOf('day');
    return [start, today.endOf('day')];
};

const getReceiptRowState = (row, draft) => {
    const expected = Number(row.confirmed_quantity ?? row.ordered_quantity ?? 0);
    const alreadyReceived = Number(row.already_received_quantity || 0);
    const currentDraft = draft?.touched ? Number(draft.received_quantity || 0) : 0;
    const totalAfter = alreadyReceived + currentDraft;
    if (draft?.touched && currentDraft === 0 && alreadyReceived === 0) {
        return 'rejected';
    }
    if (totalAfter >= expected && expected > 0) {
        return 'complete';
    }
    if (totalAfter > 0) {
        return 'partial';
    }
    return 'idle';
};

const SupplierReceiptsPage = () => {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [rows, setRows] = useState([]);
    const [syncingResponses, setSyncingResponses] = useState(false);
    const [filters, setFilters] = useState({
        providerId: null,
        dateRange: getDefaultSupplierDateRange(),
    });
    const [drafts, setDrafts] = useState({});
    const [documentNumber, setDocumentNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(dayjs());
    const [comment, setComment] = useState('');

    useEffect(() => {
        const fetchProviders = async () => {
            try {
                const items = await getAllProviders({
                    sort_by: 'name',
                    sort_dir: 'asc',
                });
                setProviders(items);
            } catch (err) {
                console.error('Failed to fetch providers', err);
                message.error('Не удалось загрузить поставщиков');
            }
        };
        fetchProviders();
    }, []);

    const fetchRows = useCallback(async () => {
        if (!filters.providerId) {
            setRows([]);
            return;
        }
        setLoading(true);
        try {
            const params = {
                provider_id: filters.providerId,
            };
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const response = await getSupplierReceiptCandidates(params);
            setRows(response.data || []);
        } catch (err) {
            console.error('Failed to fetch supplier receipt candidates', err);
            message.error('Не удалось загрузить строки для поступления');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const touchedRows = useMemo(() => (
        rows.filter((row) => drafts[row.supplier_order_item_id]?.touched)
    ), [drafts, rows]);

    const updateDraft = (row, receivedQuantity, nextComment = undefined) => {
        setDrafts((prev) => ({
            ...prev,
            [row.supplier_order_item_id]: {
                touched: true,
                received_quantity: receivedQuantity,
                comment: nextComment === undefined
                    ? prev[row.supplier_order_item_id]?.comment || ''
                    : nextComment,
            },
        }));
    };

    const resetDraft = (row) => {
        setDrafts((prev) => {
            const next = { ...prev };
            delete next[row.supplier_order_item_id];
            return next;
        });
    };

    const handleCreateReceipt = async () => {
        if (!filters.providerId) {
            message.warning('Сначала выберите поставщика');
            return;
        }
        const items = rows
            .filter((row) => drafts[row.supplier_order_item_id]?.touched)
            .map((row) => ({
                supplier_order_item_id: row.supplier_order_item_id,
                received_quantity: Number(
                    drafts[row.supplier_order_item_id]?.received_quantity || 0
                ),
                comment: drafts[row.supplier_order_item_id]?.comment || undefined,
            }));
        if (!items.length) {
            message.warning('Отметьте хотя бы одну строку для поступления');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                provider_id: filters.providerId,
                post_now: false,
                document_number: documentNumber || undefined,
                document_date: documentDate ? documentDate.format('YYYY-MM-DD') : undefined,
                comment: comment || undefined,
                items,
            };
            const response = await createSupplierReceipt(payload);
            message.success(
                `Черновик поступления #${response.data.id} создан по ${response.data.items.length} строкам`
            );
            setDrafts({});
            setDocumentNumber('');
            setComment('');
            setDocumentDate(dayjs());
            fetchRows();
        } catch (err) {
            console.error('Failed to create supplier receipt', err);
            message.error(err?.response?.data?.detail || 'Не удалось сформировать поступление');
        } finally {
            setSubmitting(false);
        }
    };

    const handleProcessResponses = async () => {
        setSyncingResponses(true);
        try {
            const params = {};
            if (filters.providerId) {
                params.provider_id = filters.providerId;
            }
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const response = await processSupplierResponses(params);
            const payload = response.data || {};
            message.success(
                `Проверено писем: ${payload.fetched_messages || 0}, ` +
                `обработано: ${payload.processed_messages || 0}, ` +
                `обновлено строк: ${payload.updated_items || 0}`
            );
            fetchRows();
        } catch (err) {
            console.error('Failed to process supplier responses', err);
            message.error(
                err?.response?.data?.detail || 'Не удалось проверить ответы поставщиков'
            );
        } finally {
            setSyncingResponses(false);
        }
    };

    const columns = [
        {
            title: 'Дата заказа',
            dataIndex: 'supplier_order_created_at',
            key: 'supplier_order_created_at',
            width: 128,
            render: (value) => (value ? dayjs(value).format('DD.MM.YY HH:mm') : '—'),
        },
        {
            title: 'Заказ / клиент',
            key: 'order',
            width: 190,
            render: (_, row) => (
                <div>
                    <div>#{row.supplier_order_id}</div>
                    <Text type="secondary">{row.customer_name || '—'}</Text>
                </div>
            ),
        },
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 140,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 100,
            ellipsis: true,
        },
        {
            title: 'Заказано',
            dataIndex: 'ordered_quantity',
            key: 'ordered_quantity',
            width: 82,
            align: 'right',
        },
        {
            title: 'Подтв.',
            dataIndex: 'confirmed_quantity',
            key: 'confirmed_quantity',
            width: 82,
            align: 'right',
            render: (value, row) => value ?? row.ordered_quantity,
        },
        {
            title: 'Получено',
            dataIndex: 'already_received_quantity',
            key: 'already_received_quantity',
            width: 88,
            align: 'right',
        },
        {
            title: 'Сейчас',
            key: 'received_quantity',
            width: 200,
            render: (_, row) => (
                <Space size={4} wrap>
                    <InputNumber
                        min={0}
                        max={row.pending_quantity}
                        value={drafts[row.supplier_order_item_id]?.received_quantity}
                        onChange={(value) => updateDraft(row, value ?? 0)}
                        style={{ width: 84 }}
                        disabled={row.pending_quantity <= 0}
                    />
                    <Button
                        size="small"
                        onClick={() => updateDraft(row, row.pending_quantity)}
                        disabled={row.pending_quantity <= 0}
                    >
                        Всё
                    </Button>
                    <Button
                        size="small"
                        danger
                        onClick={() => updateDraft(row, 0)}
                    >
                        0
                    </Button>
                    <Button size="small" onClick={() => resetDraft(row)}>
                        Сброс
                    </Button>
                </Space>
            ),
        },
        {
            title: 'Остаток',
            dataIndex: 'pending_quantity',
            key: 'pending_quantity',
            width: 86,
            align: 'right',
        },
        {
            title: 'Ответ',
            key: 'response_status_raw',
            width: 160,
            ellipsis: true,
            render: (_, row) => row.response_status_raw || row.response_comment || '—',
        },
    ];

    const rowClassName = (record) => {
        const state = getReceiptRowState(
            record,
            drafts[record.supplier_order_item_id]
        );
        if (state === 'complete') return 'supplier-receipt-row-complete';
        if (state === 'partial') return 'supplier-receipt-row-partial';
        if (state === 'rejected') return 'supplier-receipt-row-rejected';
        return '';
    };

    return (
        <div className="page-shell">
            <Card>
                <Title level={3}>Поступления от поставщиков</Title>
                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Select
                            showSearch
                            allowClear
                            placeholder="Поставщик"
                            style={{ width: '100%' }}
                            value={filters.providerId}
                            onChange={(value) => setFilters((prev) => ({ ...prev, providerId: value || null }))}
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
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                dateRange: value || getDefaultSupplierDateRange(),
                            }))}
                            format="DD.MM.YY"
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <Space wrap style={{ width: '100%' }}>
                            <Button type="primary" onClick={fetchRows} loading={loading}>
                                Обновить
                            </Button>
                            <Button onClick={handleProcessResponses} loading={syncingResponses}>
                                Проверить почту
                            </Button>
                            <Tag color="green">зелёный: закрыто</Tag>
                            <Tag color="gold">жёлтый: частично</Tag>
                            <Tag color="red">красный: отказ</Tag>
                        </Space>
                    </Col>
                </Row>

                <Card size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={12}>
                        <Col xs={24} md={6}>
                            <Input
                                placeholder="Номер документа"
                                value={documentNumber}
                                onChange={(event) => setDocumentNumber(event.target.value)}
                            />
                        </Col>
                        <Col xs={24} md={4}>
                            <DatePicker
                                style={{ width: '100%' }}
                                value={documentDate}
                                onChange={setDocumentDate}
                                format="DD.MM.YYYY"
                            />
                        </Col>
                        <Col xs={24} md={10}>
                            <Input
                                placeholder="Комментарий"
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                            />
                        </Col>
                        <Col xs={24} md={4}>
                            <Button
                                type="primary"
                                block
                                onClick={handleCreateReceipt}
                                loading={submitting}
                            >
                                Сформировать черновик
                            </Button>
                        </Col>
                    </Row>
                    <div style={{ marginTop: 12 }}>
                        <Text type="secondary">
                            Подготовлено строк: {touchedRows.length}
                        </Text>
                    </div>
                </Card>

                {!filters.providerId ? (
                    <Empty description="Выберите поставщика, чтобы увидеть заказанные позиции" />
                ) : (
                    <Table
                        className="supplier-receipts-table"
                        size="small"
                        loading={loading}
                        dataSource={rows.map((row) => ({ ...row, key: row.supplier_order_item_id }))}
                        columns={columns}
                        rowClassName={rowClassName}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        scroll={{ x: 1220 }}
                    />
                )}
            </Card>
        </div>
    );
};

export default SupplierReceiptsPage;
