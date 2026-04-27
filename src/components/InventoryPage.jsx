import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Descriptions,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import {
    cancelInventorySession,
    completeInventorySession,
    countInventoryItem,
    getInventorySession,
    listInventorySessions,
    startInventorySession,
} from '../api/inventory';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
    active: 'processing',
    completed: 'success',
    cancelled: 'default',
};

const STATUS_LABELS = {
    active: 'Активен',
    completed: 'Завершён',
    cancelled: 'Отменён',
};

const SCOPE_LABELS = {
    full: 'Весь склад',
    shelf: 'Стеллаж',
    location: 'Место',
};

// ── Session detail drawer ─────────────────────────────────────────────────────

function SessionDetailDrawer({ sessionId, open, onClose, onChanged }) {
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState(null);
    const [rowStates, setRowStates] = useState({}); // itemId → { val, saving }
    const [completing, setCompleting] = useState(false);
    const [applyAdj, setApplyAdj] = useState(true);

    const load = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const res = await getInventorySession(sessionId);
            setSession(res.data);
            // Init row states
            const init = {};
            for (const item of res.data.items) {
                init[item.id] = { val: item.actual_qty ?? '', saving: false };
            }
            setRowStates(init);
        } catch {
            message.error('Ошибка загрузки сеанса');
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const handleCount = async (item) => {
        const state = rowStates[item.id];
        if (state.val === '' || state.val === null) return;
        setRowStates((s) => ({ ...s, [item.id]: { ...s[item.id], saving: true } }));
        try {
            const res = await countInventoryItem(sessionId, item.id, {
                actual_qty: Number(state.val),
            });
            // Update item in session
            setSession((prev) => ({
                ...prev,
                items: prev.items.map((it) => (it.id === item.id ? res.data : it)),
            }));
            setRowStates((s) => ({
                ...s,
                [item.id]: { ...s[item.id], val: res.data.actual_qty, saving: false },
            }));
        } catch {
            message.error('Ошибка');
            setRowStates((s) => ({ ...s, [item.id]: { ...s[item.id], saving: false } }));
        }
    };

    const handleComplete = async () => {
        setCompleting(true);
        try {
            await completeInventorySession(sessionId, applyAdj);
            message.success('Инвентаризация завершена');
            await load();
            onChanged?.();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка завершения');
        } finally {
            setCompleting(false);
        }
    };

    const handleCancel = async () => {
        try {
            await cancelInventorySession(sessionId);
            message.success('Сеанс отменён');
            await load();
            onChanged?.();
        } catch {
            message.error('Ошибка отмены');
        }
    };

    const isActive = session?.status === 'active';
    const countedItems = session?.items.filter((i) => i.actual_qty !== null) ?? [];
    const totalItems = session?.items.length ?? 0;
    const progress = totalItems ? Math.round((countedItems.length / totalItems) * 100) : 0;

    const columns = [
        {
            title: 'Место',
            dataIndex: 'storage_location_name',
            key: 'loc',
            width: 90,
            render: (v) => <Tag>{v}</Tag>,
        },
        {
            title: 'Артикул',
            dataIndex: 'autopart_oem',
            key: 'oem',
            width: 120,
        },
        {
            title: 'Наименование',
            dataIndex: 'autopart_name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Ожидается',
            dataIndex: 'expected_qty',
            key: 'exp',
            width: 90,
            align: 'center',
        },
        {
            title: 'Факт',
            key: 'actual',
            width: 130,
            align: 'center',
            render: (_, record) => {
                const state = rowStates[record.id] || { val: '', saving: false };
                if (!isActive) {
                    return record.actual_qty !== null ? (
                        <Text>{record.actual_qty}</Text>
                    ) : (
                        <Text type="secondary">—</Text>
                    );
                }
                return (
                    <Space.Compact>
                        <InputNumber
                            min={0}
                            value={state.val}
                            onChange={(v) =>
                                setRowStates((s) => ({ ...s, [record.id]: { ...s[record.id], val: v } }))
                            }
                            onPressEnter={() => handleCount(record)}
                            style={{ width: 70 }}
                            size="small"
                        />
                        <Button
                            size="small"
                            type="primary"
                            loading={state.saving}
                            onClick={() => handleCount(record)}
                            icon={<CheckCircleOutlined />}
                        />
                    </Space.Compact>
                );
            },
        },
        {
            title: 'Δ',
            key: 'discrepancy',
            width: 70,
            align: 'center',
            render: (_, record) => {
                if (record.discrepancy === null) return null;
                const d = record.discrepancy;
                if (d === 0) return <Tag color="green">0</Tag>;
                return <Tag color={d > 0 ? 'blue' : 'red'}>{d > 0 ? `+${d}` : d}</Tag>;
            },
        },
    ];

    return (
        <Drawer
            title={session ? `Инвентаризация: ${session.name}` : 'Загрузка…'}
            open={open}
            onClose={onClose}
            width={900}
            extra={
                isActive && (
                    <Space>
                        <Popconfirm
                            title="Отменить сеанс?"
                            description="Все результаты подсчёта будут потеряны."
                            onConfirm={handleCancel}
                            okText="Отменить сеанс"
                            cancelText="Нет"
                            okButtonProps={{ danger: true }}
                        >
                            <Button icon={<CloseCircleOutlined />} danger>
                                Отменить
                            </Button>
                        </Popconfirm>
                        <Button icon={<ReloadOutlined />} onClick={load}>
                            Обновить
                        </Button>
                        <Popconfirm
                            title="Завершить инвентаризацию?"
                            description={
                                <Space direction="vertical">
                                    <Text>Не подсчитанные позиции получат discrepancy = 0.</Text>
                                    <Space>
                                        <Text>Применить корректировки остатков:</Text>
                                        <Switch checked={applyAdj} onChange={setApplyAdj} size="small" />
                                    </Space>
                                </Space>
                            }
                            onConfirm={handleComplete}
                            okText="Завершить"
                            cancelText="Отмена"
                        >
                            <Button type="primary" icon={<CheckCircleOutlined />} loading={completing}>
                                Завершить
                            </Button>
                        </Popconfirm>
                    </Space>
                )
            }
        >
            {loading ? (
                <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
            ) : session ? (
                <>
                    <Descriptions size="small" bordered column={3} style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="Статус">
                            <Badge status={STATUS_COLORS[session.status]} text={STATUS_LABELS[session.status]} />
                        </Descriptions.Item>
                        <Descriptions.Item label="Охват">
                            {SCOPE_LABELS[session.scope_type]}
                            {session.scope_value ? ` (${session.scope_value})` : ''}
                        </Descriptions.Item>
                        <Descriptions.Item label="Начат">
                            {dayjs(session.started_at).format('DD.MM.YYYY HH:mm')}
                        </Descriptions.Item>
                        {session.finished_at && (
                            <Descriptions.Item label="Завершён">
                                {dayjs(session.finished_at).format('DD.MM.YYYY HH:mm')}
                            </Descriptions.Item>
                        )}
                        {session.notes && (
                            <Descriptions.Item label="Примечание" span={3}>
                                {session.notes}
                            </Descriptions.Item>
                        )}
                    </Descriptions>

                    <Progress
                        percent={progress}
                        status={progress === 100 ? 'success' : 'active'}
                        format={() => `${countedItems.length} / ${totalItems}`}
                        style={{ marginBottom: 12 }}
                    />

                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={session.items}
                        size="small"
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        rowClassName={(r) =>
                            r.actual_qty !== null ? 'inv-row-counted' : ''
                        }
                    />
                </>
            ) : null}
        </Drawer>
    );
}

// ── New session modal ─────────────────────────────────────────────────────────

function NewSessionModal({ open, onClose, onCreated }) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const scopeType = Form.useWatch('scope_type', form);

    const handleOk = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            const res = await startInventorySession({
                name: values.name,
                scope_type: values.scope_type,
                scope_value: values.scope_value || null,
                notes: values.notes || null,
            });
            message.success('Сеанс создан');
            form.resetFields();
            onCreated(res.data.id);
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка создания');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Новая инвентаризация"
            onOk={handleOk}
            onCancel={onClose}
            confirmLoading={saving}
            okText="Начать"
            cancelText="Отмена"
            destroyOnClose
        >
            <Form form={form} layout="vertical" initialValues={{ scope_type: 'full' }}>
                <Form.Item
                    name="name"
                    label="Название сеанса"
                    rules={[{ required: true, message: 'Введите название' }]}
                >
                    <Input placeholder="Инвентаризация апрель 2026" />
                </Form.Item>

                <Form.Item name="scope_type" label="Охват">
                    <Select>
                        <Option value="full">Весь склад</Option>
                        <Option value="shelf">Стеллаж (по префиксу)</Option>
                        <Option value="location">Конкретное место</Option>
                    </Select>
                </Form.Item>

                {(scopeType === 'shelf' || scopeType === 'location') && (
                    <Form.Item
                        name="scope_value"
                        label={scopeType === 'shelf' ? 'Префикс стеллажа (напр. AA)' : 'Название места (напр. AA01)'}
                        rules={[{ required: true, message: 'Укажите значение' }]}
                    >
                        <Input
                            placeholder={scopeType === 'shelf' ? 'AA' : 'AA01'}
                            style={{ textTransform: 'uppercase' }}
                            onChange={(e) =>
                                form.setFieldValue('scope_value', e.target.value.toUpperCase())
                            }
                        />
                    </Form.Item>
                )}

                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newModalOpen, setNewModalOpen] = useState(false);
    const [detailId, setDetailId] = useState(null);

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listInventorySessions();
            setSessions(res.data);
        } catch {
            message.error('Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Button type="link" onClick={() => setDetailId(record.id)}>
                    {name}
                </Button>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (s) => (
                <Badge status={STATUS_COLORS[s]} text={STATUS_LABELS[s]} />
            ),
            filters: Object.entries(STATUS_LABELS).map(([k, v]) => ({ text: v, value: k })),
            onFilter: (value, record) => record.status === value,
        },
        {
            title: 'Охват',
            key: 'scope',
            render: (_, r) =>
                r.scope_value ? `${SCOPE_LABELS[r.scope_type]}: ${r.scope_value}` : SCOPE_LABELS[r.scope_type],
        },
        {
            title: 'Прогресс',
            key: 'progress',
            render: (_, r) => {
                const total = r.item_count;
                const counted = r.counted_count;
                const pct = total ? Math.round((counted / total) * 100) : 0;
                return (
                    <Space>
                        <Progress
                            percent={pct}
                            size="small"
                            style={{ width: 100 }}
                            format={() => ''}
                        />
                        <Text type="secondary">
                            {counted}/{total}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Начат',
            dataIndex: 'started_at',
            key: 'started_at',
            render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
        },
        {
            title: 'Завершён',
            dataIndex: 'finished_at',
            key: 'finished_at',
            render: (v) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—'),
        },
        {
            title: '',
            key: 'open',
            render: (_, record) => (
                <Button
                    size="small"
                    type="primary"
                    ghost
                    onClick={() => setDetailId(record.id)}
                >
                    Открыть
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={3} style={{ margin: 0 }}>
                        Инвентаризация
                    </Title>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchSessions}>
                            Обновить
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setNewModalOpen(true)}
                        >
                            Новая инвентаризация
                        </Button>
                    </Space>
                </Col>
            </Row>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={sessions}
                loading={loading}
                size="small"
                pagination={{ pageSize: 20 }}
                locale={{ emptyText: 'Сеансов инвентаризации нет' }}
            />

            <NewSessionModal
                open={newModalOpen}
                onClose={() => setNewModalOpen(false)}
                onCreated={(id) => {
                    setNewModalOpen(false);
                    fetchSessions();
                    setDetailId(id);
                }}
            />

            <SessionDetailDrawer
                sessionId={detailId}
                open={!!detailId}
                onClose={() => setDetailId(null)}
                onChanged={fetchSessions}
            />
        </div>
    );
}
