import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Empty,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    ArrowUpOutlined,
    ArrowDownOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import {
    createStockDocument,
    listStockDocuments,
} from '../api/inventory';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS = {
    manual_receipt:  'Оприходование',
    manual_writeoff: 'Списание',
};

const DOC_TYPE_COLORS = {
    manual_receipt:  'green',
    manual_writeoff: 'red',
};

const STATUS_LABELS = {
    draft:     'Черновик',
    posted:    'Проведён',
    cancelled: 'Отменён',
};

const STATUS_COLORS = {
    draft:     'default',
    posted:    'success',
    cancelled: 'error',
};

// ── Component ─────────────────────────────────────────────────────────────────

const StockDocumentsPage = () => {
    const navigate = useNavigate();
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [filterType, setFilterType] = useState(null);
    const [filterStatus, setFilterStatus] = useState(null);

    const fetchDocs = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 200 };
            if (filterType)   params.doc_type = filterType;
            if (filterStatus) params.status   = filterStatus;
            const res = await listStockDocuments(params);
            setDocs(res.data || []);
        } catch {
            message.error('Ошибка загрузки документов');
        } finally {
            setLoading(false);
        }
    }, [filterType, filterStatus]);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    const handleCreate = async (docType) => {
        setCreating(true);
        try {
            const res = await createStockDocument({ doc_type: docType, items: [] });
            message.success('Документ создан');
            navigate(`/warehouse/stock-documents/${res.data.id}`);
        } catch {
            message.error('Ошибка создания документа');
        } finally {
            setCreating(false);
        }
    };

    const columns = [
        {
            title: 'Тип',
            dataIndex: 'doc_type',
            width: 160,
            render: (v) => (
                <Tag color={DOC_TYPE_COLORS[v] || 'default'} icon={
                    v === 'manual_receipt'
                        ? <ArrowUpOutlined />
                        : <ArrowDownOutlined />
                }>
                    {DOC_TYPE_LABELS[v] || v}
                </Tag>
            ),
        },
        {
            title: 'Номер',
            dataIndex: 'document_number',
            width: 140,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Дата',
            dataIndex: 'document_date',
            width: 150,
            render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
            sorter: (a, b) => dayjs(a.document_date).unix() - dayjs(b.document_date).unix(),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 120,
            render: (v) => (
                <Tag color={STATUS_COLORS[v] || 'default'}>
                    {STATUS_LABELS[v] || v}
                </Tag>
            ),
        },
        {
            title: 'Склад',
            dataIndex: 'warehouse_name',
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Причина',
            dataIndex: 'reason',
            ellipsis: true,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Строк',
            dataIndex: 'item_count',
            width: 80,
            align: 'right',
        },
        {
            title: 'Проведён',
            dataIndex: 'posted_at',
            width: 150,
            render: (v) => v ? dayjs(v).format('DD.MM.YYYY HH:mm') : <Text type="secondary">—</Text>,
        },
        {
            title: '',
            key: 'action',
            width: 100,
            render: (_, rec) => (
                <Button
                    size="small"
                    onClick={() => navigate(`/warehouse/stock-documents/${rec.id}`)}
                >
                    Открыть
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={3} style={{ margin: 0 }}>
                        Складские документы
                    </Title>
                    <Text type="secondary">
                        Ручное оприходование и списание товара
                    </Text>
                </Col>
                <Col>
                    <Space>
                        <Tooltip title="Обновить">
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchDocs}
                                loading={loading}
                            />
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<ArrowUpOutlined />}
                            loading={creating}
                            onClick={() => handleCreate('manual_receipt')}
                            style={{ background: '#52c41a', borderColor: '#52c41a' }}
                        >
                            Оприходование
                        </Button>
                        <Button
                            danger
                            icon={<ArrowDownOutlined />}
                            loading={creating}
                            onClick={() => handleCreate('manual_writeoff')}
                        >
                            Списание
                        </Button>
                    </Space>
                </Col>
            </Row>

            {/* Filters */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap>
                    <Select
                        placeholder="Тип документа"
                        allowClear
                        style={{ width: 180 }}
                        value={filterType}
                        onChange={setFilterType}
                    >
                        <Option value="manual_receipt">Оприходование</Option>
                        <Option value="manual_writeoff">Списание</Option>
                    </Select>
                    <Select
                        placeholder="Статус"
                        allowClear
                        style={{ width: 150 }}
                        value={filterStatus}
                        onChange={setFilterStatus}
                    >
                        <Option value="draft">Черновик</Option>
                        <Option value="posted">Проведён</Option>
                        <Option value="cancelled">Отменён</Option>
                    </Select>
                </Space>
            </Card>

            <Card bodyStyle={{ padding: 0 }}>
                <Table
                    rowKey="id"
                    dataSource={docs}
                    columns={columns}
                    loading={loading}
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    size="small"
                    locale={{ emptyText: <Empty description="Документов нет" /> }}
                    onRow={(rec) => ({
                        onClick: () => navigate(`/warehouse/stock-documents/${rec.id}`),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
        </div>
    );
};

export default StockDocumentsPage;
