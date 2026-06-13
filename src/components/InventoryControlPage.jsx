import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Card,
    Col,
    Empty,
    Row,
    Space,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getInventoryControl } from '../api/dashboard';

const { Title, Text } = Typography;

const formatMoney = (value) => {
    if (value == null) {
        return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 0,
    }).format(Number(value));
};

const formatQty = (value) => (value == null ? '—' : `${value} шт`);

const ABC_CLASSES = ['A', 'B', 'C'];
const XYZ_CLASSES = ['X', 'Y', 'Z'];

const KpiCard = ({ title, value, hint, color = '#0f172a' }) => (
    <Card size="small" style={{ height: '100%' }}>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{title}</div>
        <div style={{ color, fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>{value}</div>
        {hint ? (
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{hint}</div>
        ) : null}
    </Card>
);

const positionColumn = {
    title: 'Позиция',
    key: 'position',
    render: (_, row) => (
        <div>
            <div style={{ fontWeight: 600 }}>
                {row.brand_name || '—'} {row.oem_number}
            </div>
            <div style={{ color: '#64748b', fontSize: 12 }}>
                {row.autopart_name || '—'}
                {row.abc_class || row.xyz_class ? (
                    <Tag style={{ marginLeft: 6 }}>
                        {row.abc_class || '—'}/{row.xyz_class || '—'}
                    </Tag>
                ) : null}
            </div>
        </div>
    ),
};

const InventoryControlPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getInventoryControl();
            setPayload(data || null);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить контроль запасов');
            setPayload(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const summary = payload?.summary || {};

    const abcMatrix = useMemo(() => {
        const byCell = {};
        (payload?.abc_xyz_matrix || []).forEach((cell) => {
            byCell[`${cell.abc_class}/${cell.xyz_class}`] = cell;
        });
        return byCell;
    }, [payload]);

    const matrixMaxValue = useMemo(() => {
        const values = (payload?.abc_xyz_matrix || []).map(
            (cell) => Number(cell.stock_value || 0)
        );
        return values.length ? Math.max(...values) : 0;
    }, [payload]);

    const urgentColumns = [
        positionColumn,
        {
            title: 'Остаток',
            dataIndex: 'current_quantity',
            width: 90,
            render: (value) => formatQty(value),
        },
        {
            title: 'В пути',
            dataIndex: 'in_transit_qty',
            width: 90,
            render: (value) => formatQty(value),
        },
        {
            title: 'Запаса',
            dataIndex: 'estimated_days_left',
            width: 100,
            render: (value) =>
                value != null ? (
                    <Tag color={value <= 7 ? 'red' : 'orange'}>{value} дн</Tag>
                ) : '—',
        },
        {
            title: 'Спрос',
            dataIndex: 'avg_daily',
            width: 110,
            render: (value) => (value != null ? `${value} шт/д` : '—'),
        },
        {
            title: '',
            key: 'action',
            width: 110,
            render: () => (
                <Button
                    type="link"
                    size="small"
                    style={{ padding: 0 }}
                    onClick={() => navigate('/orders/autopurchase')}
                >
                    В автозаказ →
                </Button>
            ),
        },
    ];

    const deadColumns = [
        positionColumn,
        {
            title: 'Остаток',
            dataIndex: 'current_quantity',
            width: 90,
            render: (value) => formatQty(value),
        },
        {
            title: 'Заморожено',
            dataIndex: 'frozen_value',
            width: 130,
            render: (value) =>
                value != null ? `${formatMoney(value)} руб.` : '—',
        },
        {
            title: 'Продаж за год',
            dataIndex: 'sold_last_365_days',
            width: 120,
            render: (value) => formatQty(value),
        },
    ];

    const oosColumns = [
        positionColumn,
        {
            title: 'Продаж за год',
            dataIndex: 'sold_last_365_days',
            width: 120,
            render: (value) => formatQty(value),
        },
        {
            title: 'Спрос',
            dataIndex: 'avg_daily',
            width: 110,
            render: (value) => (value != null ? `${value} шт/д` : '—'),
        },
        {
            title: '',
            key: 'action',
            width: 110,
            render: () => (
                <Button
                    type="link"
                    size="small"
                    style={{ padding: 0 }}
                    onClick={() => navigate('/orders/autopurchase')}
                >
                    В автозаказ →
                </Button>
            ),
        },
    ];

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            Контроль запасов и продаж
                        </Title>
                        <Text type="secondary">
                            {payload?.provider_name
                                ? `Наш прайс: ${payload.provider_name}`
                                : 'Аналитика по нашему наличию'}
                        </Text>
                    </div>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={() => fetchData()}
                    >
                        Обновить
                    </Button>
                </Space>

                {payload?.history_pending_note ? (
                    <Alert
                        type="info"
                        showIcon
                        message={payload.history_pending_note}
                    />
                ) : null}

                <Spin spinning={loading}>
                    {!payload ? (
                        <Empty description="Нет данных" />
                    ) : (
                        <Space direction="vertical" size="large" style={{ width: '100%' }}>
                            <Row gutter={[12, 12]}>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Срочно заказать"
                                        value={summary.urgent_count || 0}
                                        hint="≤ 14 дней запаса"
                                        color="#dc2626"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Нет в наличии со спросом"
                                        value={summary.out_of_stock_with_demand_skus || 0}
                                        hint="упущенные продажи"
                                        color="#ea580c"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Мёртвый сток"
                                        value={summary.dead_stock_skus || 0}
                                        hint={`заморожено ${formatMoney(summary.dead_stock_value)} руб.`}
                                        color="#7c3aed"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Уровень сервиса (A/B/C)"
                                        value={
                                            summary.service_level_pct != null
                                                ? `${summary.service_level_pct}%`
                                                : '—'
                                        }
                                        hint="% спросовых позиций в наличии"
                                        color="#16a34a"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Всего позиций"
                                        value={summary.total_skus || 0}
                                        hint={`в наличии ${summary.in_stock_skus || 0}`}
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Деньги на складе"
                                        value={`${formatMoney(summary.stock_value)} руб.`}
                                        hint="по себестоимости"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Оборачиваемость"
                                        value={
                                            summary.inventory_turnover != null
                                                ? `${summary.inventory_turnover}×`
                                                : '—'
                                        }
                                        hint="продажи/сток за год"
                                    />
                                </Col>
                                <Col xs={12} md={6}>
                                    <KpiCard
                                        title="Здоровых позиций"
                                        value={summary.healthy_skus || 0}
                                        hint={`медленных ${summary.slow_stock_skus || 0}`}
                                        color="#16a34a"
                                    />
                                </Col>
                            </Row>

                            <Card size="small" title="ABC / XYZ — структура запаса (деньги на складе)">
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    A — самые ценные по обороту, C — наименее.
                                    X — стабильный спрос, Z — рваный. Цель: держать
                                    высокий сервис в A/X и минимум денег в C/Z.
                                </Text>
                                <table className="inventory-abc-matrix">
                                    <thead>
                                        <tr>
                                            <th />
                                            {XYZ_CLASSES.map((xyz) => (
                                                <th key={xyz}>{xyz}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ABC_CLASSES.map((abc) => (
                                            <tr key={abc}>
                                                <th>{abc}</th>
                                                {XYZ_CLASSES.map((xyz) => {
                                                    const cell = abcMatrix[`${abc}/${xyz}`];
                                                    const value = Number(cell?.stock_value || 0);
                                                    const ratio = matrixMaxValue
                                                        ? value / matrixMaxValue
                                                        : 0;
                                                    return (
                                                        <td
                                                            key={xyz}
                                                            style={{
                                                                background: cell
                                                                    ? `rgba(37,99,235,${0.08 + ratio * 0.32})`
                                                                    : 'transparent',
                                                            }}
                                                        >
                                                            {cell ? (
                                                                <Tooltip
                                                                    title={`${cell.sku_count} поз. · оборот ${formatMoney(cell.annual_sales_value)} руб./год`}
                                                                >
                                                                    <div>
                                                                        <div style={{ fontWeight: 700 }}>
                                                                            {cell.sku_count}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: '#475569' }}>
                                                                            {formatMoney(cell.stock_value)} ₽
                                                                        </div>
                                                                    </div>
                                                                </Tooltip>
                                                            ) : (
                                                                <span style={{ color: '#cbd5e1' }}>—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>

                            <Card
                                size="small"
                                title={`🔴 Срочно заказать (${(payload.urgent_to_order || []).length})`}
                            >
                                <Table
                                    rowKey="oem_number"
                                    size="small"
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={urgentColumns}
                                    dataSource={payload.urgent_to_order || []}
                                    locale={{ emptyText: 'Срочных позиций нет' }}
                                />
                            </Card>

                            <Card
                                size="small"
                                title={`🟠 Нет в наличии, но спрос есть (${(payload.out_of_stock_with_demand || []).length})`}
                            >
                                <Table
                                    rowKey="oem_number"
                                    size="small"
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={oosColumns}
                                    dataSource={payload.out_of_stock_with_demand || []}
                                    locale={{ emptyText: 'Таких позиций нет' }}
                                />
                            </Card>

                            <Card
                                size="small"
                                title={`🟣 Мёртвый сток — лежит без продаж (${(payload.dead_stock || []).length})`}
                            >
                                <Table
                                    rowKey="oem_number"
                                    size="small"
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={deadColumns}
                                    dataSource={payload.dead_stock || []}
                                    locale={{ emptyText: 'Мёртвого стока нет' }}
                                />
                            </Card>

                            <Card
                                size="small"
                                title={`🟡 Медленный / затоваренный сток (${(payload.slow_movers || []).length})`}
                            >
                                <Table
                                    rowKey="oem_number"
                                    size="small"
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={deadColumns}
                                    dataSource={payload.slow_movers || []}
                                    locale={{ emptyText: 'Нет затоваренных позиций' }}
                                />
                            </Card>
                        </Space>
                    )}
                </Spin>
            </Space>
        </Card>
    );
};

export default InventoryControlPage;
