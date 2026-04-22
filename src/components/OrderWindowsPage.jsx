import React, { useEffect, useState, useCallback } from 'react';
import {
    Card, Table, Tag, Typography, Button, Tooltip, Badge, Space
} from 'antd';
import { ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

const STATUS_CONFIG = {
    received: { color: 'success', text: 'Получен',              bg: '#f6ffed', border: '#b7eb8f' },
    pending:  { color: 'default', text: 'Ожидаем',              bg: '#ffffff', border: '#d9d9d9' },
    partial:  { color: 'orange',  text: 'Получен частично',     bg: '#fff7e6', border: '#ffd591' },
    grace:    { color: 'warning', text: 'Просрочен (ждём ещё)', bg: '#fffbe6', border: '#ffe58f' },
    overdue:  { color: 'error',   text: 'Не получен',           bg: '#fff2f0', border: '#ffccc7' },
};

const OrderWindowsPage = () => {
    const [data, setData] = useState([]);
    const [generatedAt, setGeneratedAt] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await axios.get('/api/admin/order-windows/today');
            setData(resp.data.windows || []);
            setGeneratedAt(resp.data.generated_at);
        } catch (e) {
            console.error('Error loading order windows:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60_000); // refresh every minute
        return () => clearInterval(interval);
    }, [fetchData]);

    const columns = [
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            key: 'customer_name',
            render: (name, record) => (
                <Space>
                    <Text strong>{name}</Text>
                    {record.sample_count && (
                        <Tooltip title={`На основе ${record.sample_count} заказов за 4 недели`}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                ({record.sample_count} заказов)
                            </Text>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        {
            title: 'Ожидаемое окно',
            key: 'window',
            render: (_, record) => (
                <Space>
                    <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
                    <Text>{record.window_start} — {record.window_end}</Text>
                </Space>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status, record) => {
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                const received = record.received_count ?? 0;
                const expected = record.expected_order_count ?? 1;
                const showCount = expected > 1 || received > 0;
                return (
                    <Space>
                        <Tag color={cfg.color}>{cfg.text}</Tag>
                        {showCount && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {received} / {expected}
                            </Text>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Получен в',
            key: 'order_received_at',
            render: (_, record) => {
                const first = record.first_order_received_at;
                const last = record.last_order_received_at;
                if (!first) return <Text type="secondary">—</Text>;
                const fmt = (iso) =>
                    new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                if (last && last !== first) {
                    return <Text>{fmt(first)} – {fmt(last)}</Text>;
                }
                return <Text>{fmt(first)}</Text>;
            },
        },
    ];

    const rowStyle = (record) => {
        const cfg = STATUS_CONFIG[record.status];
        return cfg ? { background: cfg.bg } : {};
    };

    const counts = {
        received: data.filter(d => d.status === 'received').length,
        pending:  data.filter(d => d.status === 'pending').length,
        partial:  data.filter(d => d.status === 'partial').length,
        grace:    data.filter(d => d.status === 'grace').length,
        overdue:  data.filter(d => d.status === 'overdue').length,
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>
                    Окна заказов клиентов — сегодня
                </Title>
                <Space>
                    {generatedAt && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Обновлено: {new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </Text>
                    )}
                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                        Обновить
                    </Button>
                </Space>
            </div>

            <Space size="middle" style={{ marginBottom: 16 }}>
                <Badge color="green"  text={`Получено: ${counts.received}`} />
                <Badge color="grey"   text={`Ожидаем: ${counts.pending}`} />
                {counts.partial > 0 && (
                    <Badge color="orange" text={`Частично: ${counts.partial}`} />
                )}
                <Badge color="gold"  text={`Ожидаем (просроч.): ${counts.grace}`} />
                <Badge color="red"   text={`Не получено: ${counts.overdue}`} />
            </Space>

            {data.length === 0 && !loading ? (
                <Card>
                    <Text type="secondary">
                        Нет данных. Для отображения окон нужны заказы от клиентов за последние 4 недели
                        (минимум 2 заказа в одно время для каждого клиента).
                    </Text>
                </Card>
            ) : (
                <Table
                    dataSource={data}
                    columns={columns}
                    rowKey="customer_id"
                    loading={loading}
                    pagination={false}
                    onRow={(record) => ({ style: rowStyle(record) })}
                    size="middle"
                />
            )}
        </div>
    );
};

export default OrderWindowsPage;
