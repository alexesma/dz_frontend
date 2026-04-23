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
    Modal,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import {
    createSupplierReceipt,
    getSupplierReceiptCandidates,
    getSupplierReceiptProviders,
    processSupplierResponses,
} from '../api/customerOrders';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const getDefaultDateRange = () => {
    const today = dayjs();
    const start = today.day() === 1
        ? today.subtract(3, 'day').startOf('day')
        : today.subtract(1, 'day').startOf('day');
    return [start, today.endOf('day')];
};

// Row state: complete / partial / rejected / idle
const getRowState = (row, draft) => {
    const expected = Number(row.confirmed_quantity ?? row.ordered_quantity ?? 0);
    const alreadyReceived = Number(row.already_received_quantity || 0);
    const currentDraft = draft?.touched ? Number(draft.received_quantity || 0) : 0;
    const totalAfter = alreadyReceived + currentDraft;
    if (draft?.touched && currentDraft === 0 && alreadyReceived === 0) return 'rejected';
    if (totalAfter >= expected && expected > 0) return 'complete';
    if (totalAfter > 0) return 'partial';
    return 'idle';
};

const SupplierReceiptsPage = () => {
    const navigate = useNavigate();
    const [providers, setProviders] = useState([]);
    const [providersLoading, setProvidersLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [rows, setRows] = useState([]);
    const [syncingResponses, setSyncingResponses] = useState(false);
    const [filters, setFilters] = useState({
        providerId: null,
        dateRange: getDefaultDateRange(),
    });
    const [drafts, setDrafts] = useState({});
    const [documentNumber, setDocumentNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(dayjs());
    const [comment, setComment] = useState('');

    const fetchProviders = useCallback(async () => {
        setProvidersLoading(true);
        try {
            const params = {};
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const response = await getSupplierReceiptProviders(params);
            const options = response.data || [];
            setProviders(options);
            setFilters((prev) => {
                if (!prev.providerId) return prev;
                const exists = options.some(
                    (opt) => Number(opt.provider_id) === Number(prev.providerId)
                );
                if (exists) return prev;
                return { ...prev, providerId: null };
            });
        } catch {
            message.error('Не удалось загрузить поставщиков для выбранного периода');
            setProviders([]);
            setFilters((prev) => ({ ...prev, providerId: null }));
        } finally {
            setProvidersLoading(false);
        }
    }, [filters.dateRange]);

    useEffect(() => { fetchProviders(); }, [fetchProviders]);

    const fetchRows = useCallback(async () => {
        if (!filters.providerId) { setRows([]); return; }
        setLoading(true);
        try {
            const params = { provider_id: filters.providerId };
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const response = await getSupplierReceiptCandidates(params);
            setRows(response.data || []);
            setDrafts({});
        } catch {
            message.error('Не удалось загрузить строки для поступления');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    // ── draft helpers ──────────────────────────────────────────────────────────
    const updateDraft = useCallback((row, receivedQuantity) => {
        setDrafts((prev) => ({
            ...prev,
            [row.supplier_order_item_id]: {
                touched: true,
                received_quantity: Math.max(0, receivedQuantity ?? 0),
                comment: prev[row.supplier_order_item_id]?.comment || '',
            },
        }));
    }, []);

    const resetDraft = useCallback((id) => {
        setDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const stepDraft = useCallback((row, delta) => {
        const current = Number(drafts[row.supplier_order_item_id]?.received_quantity || 0);
        const next = Math.max(0, Math.min(row.pending_quantity, current + delta));
        updateDraft(row, next);
    }, [drafts, updateDraft]);

    // ── checkbox selection: check = mark all arrived ───────────────────────────
    const checkedKeys = useMemo(() => (
        rows
            .filter((row) => {
                const draft = drafts[row.supplier_order_item_id];
                if (!draft?.touched) return false;
                const expected = Number(row.confirmed_quantity ?? row.ordered_quantity ?? 0);
                return Number(draft.received_quantity || 0) >= expected && expected > 0;
            })
            .map((row) => row.supplier_order_item_id)
    ), [rows, drafts]);

    const rowSelection = {
        selectedRowKeys: checkedKeys,
        onSelect: (record, selected) => {
            if (selected) {
                const expected = Number(record.confirmed_quantity ?? record.ordered_quantity ?? 0);
                updateDraft(record, expected || record.pending_quantity);
            } else {
                resetDraft(record.supplier_order_item_id);
            }
        },
        onSelectAll: (selected, _selectedRows, changeRows) => {
            if (selected) {
                changeRows.forEach((row) => {
                    const expected = Number(row.confirmed_quantity ?? row.ordered_quantity ?? 0);
                    updateDraft(row, expected || row.pending_quantity);
                });
            } else {
                changeRows.forEach((row) => resetDraft(row.supplier_order_item_id));
            }
        },
    };

    // ── touched rows (have a draft entry) ─────────────────────────────────────
    const touchedRows = useMemo(() => (
        rows.filter((row) => drafts[row.supplier_order_item_id]?.touched)
    ), [drafts, rows]);

    // ── total sum of touched (checked) rows ────────────────────────────────────
    const selectedTotal = useMemo(() => {
        return touchedRows.reduce((sum, row) => {
            const draft = drafts[row.supplier_order_item_id];
            const qty = Number(draft?.received_quantity || 0);
            const price = Number(row.response_price ?? row.price ?? 0);
            return sum + qty * price;
        }, 0);
    }, [touchedRows, drafts]);

    // ── create receipt ─────────────────────────────────────────────────────────
    const handleCreateReceipt = async () => {
        if (!filters.providerId) { message.warning('Сначала выберите поставщика'); return; }
        const items = touchedRows.map((row) => ({
            supplier_order_item_id: row.supplier_order_item_id,
            received_quantity: Number(drafts[row.supplier_order_item_id]?.received_quantity || 0),
            comment: drafts[row.supplier_order_item_id]?.comment || undefined,
        }));
        if (!items.length) { message.warning('Отметьте хотя бы одну строку'); return; }
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
            const receiptId = response.data.id;
            message.success(`Документ #${receiptId} создан (${response.data.items.length} строк)`);
            setDrafts({});
            setDocumentNumber('');
            setComment('');
            setDocumentDate(dayjs());
            fetchRows();
            // Redirect to incoming documents and auto-open this receipt
            navigate(`/documents/incoming?openId=${receiptId}`);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось создать документ');
        } finally {
            setSubmitting(false);
        }
    };

    const handleProcessResponses = async () => {
        setSyncingResponses(true);
        try {
            const params = {};
            if (filters.providerId) params.provider_id = filters.providerId;
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const res = await processSupplierResponses(params);
            const p = res.data || {};
            message.success(
                `Проверено: ${p.fetched_messages || 0}, обработано: ${p.processed_messages || 0}, строк: ${p.updated_items || 0}`
            );
            fetchRows();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось проверить ответы');
        } finally {
            setSyncingResponses(false);
        }
    };

    // ── table columns ──────────────────────────────────────────────────────────
    const columns = [
        {
            title: '№',
            key: 'order_id',
            width: 62,
            render: (_, row) => (
                <Text style={{ fontSize: 13, fontWeight: 600 }}>
                    #{row.supplier_order_id}
                </Text>
            ),
        },
        {
            title: 'Артикул / Бренд',
            key: 'article',
            ellipsis: true,
            render: (_, row) => (
                <div style={{ lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{row.oem_number || '—'}</div>
                    <div style={{ fontSize: 12, color: '#555' }}>{row.brand_name || '—'}</div>
                    {row.autopart_name && (
                        <Tooltip title={row.autopart_name}>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                {row.autopart_name}
                            </div>
                        </Tooltip>
                    )}
                </div>
            ),
        },
        {
            title: 'Заказано',
            dataIndex: 'ordered_quantity',
            key: 'ordered',
            width: 76,
            align: 'center',
            render: (v) => <Text style={{ fontSize: 13, fontWeight: 600 }}>{v ?? '—'}</Text>,
        },
        {
            title: 'Подтв.',
            dataIndex: 'confirmed_quantity',
            key: 'confirmed',
            width: 68,
            align: 'center',
            render: (v, row) => (
                <Text style={{ fontSize: 13, fontWeight: 600 }}>
                    {v ?? row.ordered_quantity ?? '—'}
                </Text>
            ),
        },
        {
            title: 'Получено',
            dataIndex: 'already_received_quantity',
            key: 'received',
            width: 76,
            align: 'center',
            render: (v) => <Text style={{ fontSize: 13, fontWeight: 600 }}>{v ?? 0}</Text>,
        },
        {
            title: 'К приёму',
            dataIndex: 'pending_quantity',
            key: 'pending',
            width: 72,
            align: 'center',
            render: (v) => (
                <Text style={{ fontSize: 13, fontWeight: 600, color: v > 0 ? '#1677ff' : '#aaa' }}>
                    {v ?? 0}
                </Text>
            ),
        },
        {
            title: 'Цена',
            key: 'price',
            width: 80,
            align: 'right',
            render: (_, row) => {
                const price = row.response_price ?? row.price;
                if (price == null) return <Text type="secondary">—</Text>;
                return (
                    <Text style={{ fontSize: 13, fontWeight: 600 }}>
                        {Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                );
            },
        },
        {
            title: 'Сумма',
            key: 'sum',
            width: 90,
            align: 'right',
            render: (_, row) => {
                const draft = drafts[row.supplier_order_item_id];
                const qty = draft?.touched
                    ? Number(draft.received_quantity || 0)
                    : Number(row.pending_quantity || 0);
                const price = Number(row.response_price ?? row.price ?? 0);
                const sum = qty * price;
                if (!price) return <Text type="secondary">—</Text>;
                return (
                    <Text style={{ fontSize: 13, fontWeight: 600, color: draft?.touched ? '#1677ff' : undefined }}>
                        {sum.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                );
            },
        },
        {
            title: 'Принять',
            key: 'accept',
            width: 168,
            render: (_, row) => {
                const draft = drafts[row.supplier_order_item_id];
                const current = draft?.touched ? Number(draft.received_quantity ?? 0) : undefined;
                const disabled = row.pending_quantity <= 0;
                return (
                    <Space size={3}>
                        <Button
                            size="small"
                            icon={<MinusOutlined />}
                            onClick={() => stepDraft(row, -1)}
                            disabled={disabled || !current}
                            style={{ width: 28, padding: 0 }}
                        />
                        <InputNumber
                            size="small"
                            min={0}
                            max={row.pending_quantity}
                            value={current}
                            onChange={(v) => updateDraft(row, v ?? 0)}
                            disabled={disabled}
                            style={{ width: 56 }}
                            controls={false}
                        />
                        <Button
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => stepDraft(row, 1)}
                            disabled={disabled || current >= row.pending_quantity}
                            style={{ width: 28, padding: 0 }}
                        />
                        <Button
                            size="small"
                            danger
                            onClick={() => updateDraft(row, 0)}
                            style={{ width: 28, padding: 0, fontWeight: 700 }}
                            title="Отказ (0)"
                        >
                            0
                        </Button>
                    </Space>
                );
            },
        },
    ];

    const rowClassName = (record) => {
        const state = getRowState(record, drafts[record.supplier_order_item_id]);
        if (state === 'complete') return 'supplier-receipt-row-complete';
        if (state === 'partial') return 'supplier-receipt-row-partial';
        if (state === 'rejected') return 'supplier-receipt-row-rejected';
        return '';
    };

    // ── legend tags ────────────────────────────────────────────────────────────
    const legend = (
        <Space size={8}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: '#b7eb8f', display: 'inline-block' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Всё принято</Text>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: '#ffe58f', display: 'inline-block' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Частично</Text>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: '#ffccc7', display: 'inline-block' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Отказ</Text>
            </span>
        </Space>
    );

    return (
        <div className="page-shell">
            <Card>
                <Title level={3} style={{ marginBottom: 16 }}>Поступления от поставщиков</Title>

                {/* Filters */}
                <Row gutter={12} style={{ marginBottom: 12 }}>
                    <Col xs={24} md={9}>
                        <Select
                            showSearch
                            allowClear
                            loading={providersLoading}
                            placeholder="Поставщик"
                            style={{ width: '100%' }}
                            value={filters.providerId}
                            onChange={(value) => setFilters((prev) => ({ ...prev, providerId: value || null }))}
                            options={providers.map((p) => ({
                                value: p.provider_id,
                                label: `${p.provider_name || `#${p.provider_id}`} (${p.orders_count || 0})`,
                            }))}
                            filterOption={(input, option) =>
                                (option?.label || '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </Col>
                    <Col xs={24} md={9}>
                        <RangePicker
                            style={{ width: '100%' }}
                            value={filters.dateRange}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                dateRange: value || getDefaultDateRange(),
                            }))}
                            format="DD.MM.YY"
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <Space>
                            <Button type="primary" onClick={fetchRows} loading={loading}>
                                Обновить
                            </Button>
                            <Button onClick={handleProcessResponses} loading={syncingResponses}>
                                Проверить почту
                            </Button>
                        </Space>
                    </Col>
                </Row>

                {/* Document header + create button */}
                <Card
                    size="small"
                    style={{ marginBottom: 16, background: '#fafafa' }}
                    styles={{ body: { padding: '10px 12px' } }}
                >
                    <Row gutter={10} align="middle">
                        <Col xs={24} md={5}>
                            <Input
                                placeholder="Номер документа"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value)}
                                size="middle"
                            />
                        </Col>
                        <Col xs={24} md={4}>
                            <DatePicker
                                style={{ width: '100%' }}
                                value={documentDate}
                                onChange={setDocumentDate}
                                format="DD.MM.YYYY"
                                size="middle"
                            />
                        </Col>
                        <Col xs={24} md={9}>
                            <Input
                                placeholder="Комментарий к документу"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                size="middle"
                            />
                        </Col>
                        <Col xs={24} md={6}>
                            <Button
                                type="primary"
                                block
                                onClick={handleCreateReceipt}
                                loading={submitting}
                                disabled={!touchedRows.length}
                            >
                                Создать документ{touchedRows.length ? ` (${touchedRows.length})` : ''}
                            </Button>
                        </Col>
                    </Row>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        {legend}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                            {touchedRows.length > 0 && (
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: '#888', lineHeight: 1.2 }}>Сумма выбранных</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', lineHeight: 1.2 }}>
                                        {selectedTotal.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽
                                    </div>
                                </div>
                            )}
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Отмечено строк: <strong>{touchedRows.length}</strong>
                                {checkedKeys.length > 0 && ` · Полностью принято: ${checkedKeys.length}`}
                            </Text>
                        </div>
                    </div>
                </Card>

                {!filters.providerId ? (
                    <Empty description="Выберите поставщика, чтобы увидеть заказанные позиции" />
                ) : (
                    <Table
                        className="supplier-receipts-table"
                        size="small"
                        loading={loading}
                        rowSelection={rowSelection}
                        dataSource={rows.map((row) => ({ ...row, key: row.supplier_order_item_id }))}
                        columns={columns}
                        rowClassName={rowClassName}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        scroll={{ x: false }}
                        tableLayout="auto"
                    />
                )}
            </Card>
        </div>
    );
};

export default SupplierReceiptsPage;
