import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    InputNumber,
    Row,
    Select,
    Space,
    Statistic,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    InfoCircleOutlined,
    ReloadOutlined,
    RiseOutlined,
    ShoppingCartOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import { getTurnoverReport, refreshTurnoverReport } from '../api/autoparts';
import { lookupBrands } from '../api/brands';
import { getCategories } from '../api/categories';

const { Title, Text } = Typography;
const fmtPrice = (value) => (
    value == null ? '—' : `${Number(value).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ₽`
);
const fmtDate = (value) => (
    value ? new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU') : '—'
);
const flattenCategories = (items, prefix = '') => (items || []).flatMap((item) => {
    const label = prefix ? `${prefix} / ${item.name}` : item.name;
    return [
        { value: item.id, label },
        ...flattenCategories(item.children || [], label),
    ];
});

const trendPresentation = (value) => {
    if (value == null) return { text: '—', color: undefined };
    if (value < -0.05) return { text: `тает (${Number(value).toFixed(2)}/д.)`, color: '#cf1322' };
    if (value > 0.05) return { text: `растёт (+${Number(value).toFixed(2)}/д.)`, color: '#3f8600' };
    return { text: 'без изменений', color: '#64748b' };
};

const TurnoverReportPage = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [brandId, setBrandId] = useState(null);
    const [categoryId, setCategoryId] = useState(null);
    const [signal, setSignal] = useState('all');
    const [onlyTop, setOnlyTop] = useState(false);
    const [onlyDeclining, setOnlyDeclining] = useState(false);
    const [needsOrder, setNeedsOrder] = useState(false);
    const [minSuppliers, setMinSuppliers] = useState(0);
    const [minScore, setMinScore] = useState(0);
    const [sortBy, setSortBy] = useState('score');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const searchBrands = useCallback((query) => {
        lookupBrands(query, 50).then((response) => {
            setBrands((response.data || []).map((item) => ({
                value: item.id,
                label: item.name,
            })));
        }).catch(() => {});
    }, []);

    useEffect(() => {
        getCategories()
            .then((response) => setCategories(flattenCategories(response.data || [])))
            .catch(() => {});
    }, []);

    const requestParams = useMemo(() => ({
        brand_id: brandId || undefined,
        category_id: categoryId || undefined,
        signal,
        only_top: onlyTop,
        only_declining: onlyDeclining,
        needs_order: needsOrder,
        min_supplier_count: minSuppliers || undefined,
        min_score: minScore || undefined,
        sort_by: sortBy,
        offset: (page - 1) * pageSize,
        limit: pageSize,
    }), [
        brandId, categoryId, signal, onlyTop, onlyDeclining, needsOrder,
        minSuppliers, minScore, sortBy, page, pageSize,
    ]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getTurnoverReport(requestParams);
            setRows(response.data?.items || []);
            setTotal(Number(response.data?.total || 0));
            setUpdatedAt(response.data?.updated_at || null);
        } catch (requestError) {
            setError(
                requestError?.response?.data?.detail
                || 'Не удалось загрузить отчёт оборачиваемости',
            );
        } finally {
            setLoading(false);
        }
    }, [requestParams]);

    useEffect(() => { void load(); }, [load]);

    const resetPage = (setter) => (value) => {
        setPage(1);
        setter(value);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const response = await refreshTurnoverReport();
            message.success(`Пересчитано позиций: ${response.data?.updated_rows || 0}`);
            await load();
        } catch (requestError) {
            message.error(
                requestError?.response?.data?.detail
                || 'Не удалось пересчитать аналитику',
            );
        } finally {
            setRefreshing(false);
        }
    };

    const columns = [
        {
            title: 'Позиция',
            key: 'position',
            width: 210,
            fixed: 'left',
            render: (_, row) => (
                <div>
                    <Space size={4}>
                        {row.is_top && <RiseOutlined style={{ color: '#faad14' }} />}
                        <Text code>{row.oem_number}</Text>
                    </Space>
                    <div><Text type="secondary" ellipsis>{row.brand_name} · {row.name || '—'}</Text></div>
                    <Space size={4} wrap>
                        {row.is_market_opportunity && <Tag color="blue">рынок</Tag>}
                        {row.category_name && <Tag>{row.category_name}</Tag>}
                    </Space>
                </div>
            ),
        },
        {
            title: 'Оценка',
            dataIndex: 'recommendation_score',
            width: 92,
            render: (value, row) => (
                <Tooltip title={`Спрос ${Math.round(row.demand_score)} · рынок ${Math.round(row.market_score)} · цена ${Math.round(row.price_score)}`}>
                    <Tag color={value >= 70 ? 'green' : value >= 45 ? 'gold' : 'default'}>
                        {Math.round(value || 0)}/100
                    </Tag>
                </Tooltip>
            ),
        },
        {
            title: 'Заказы',
            key: 'demand',
            width: 135,
            render: (_, row) => (
                <div>
                    <b>{row.sold_qty_30d} шт.</b> / 30 дн.
                    <div><Text type="secondary">{row.order_count_30d} зак. · {row.active_weeks_90d} нед.</Text></div>
                </div>
            ),
        },
        {
            title: 'Цена сейчас',
            key: 'price',
            width: 160,
            render: (_, row) => (
                <div>
                    <b>{fmtPrice(row.min_purchase_price)}</b>
                    <div><Text type="secondary" ellipsis>{row.min_price_provider_name || '—'}</Text></div>
                    <div>
                        <Text type="secondary">
                            прайс {fmtDate(row.min_price_pricelist_date)}
                            {row.lead_time_days == null ? '' : ` · до ${Number(row.lead_time_days).toFixed(0)} дн.`}
                        </Text>
                    </div>
                    {row.price_vs_90d_pct != null && (
                        <Text type={row.price_vs_90d_pct < 0 ? 'success' : 'secondary'}>
                            {row.price_vs_90d_pct > 0 ? '+' : ''}{Number(row.price_vs_90d_pct).toFixed(1)}% к медиане 90 дн.
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Поставщики',
            key: 'suppliers',
            width: 130,
            render: (_, row) => {
                const trend = trendPresentation(row.supplier_qty_trend_30d);
                return (
                    <div>
                        актуальных: <b>{row.supplier_count}</b>
                        <div style={{ color: trend.color }}>{trend.text}</div>
                        {row.trend_supplier_count > 0 && (
                            <Text type="secondary">
                                снижение: {row.declining_supplier_count}/{row.trend_supplier_count}
                            </Text>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Наш склад',
            key: 'stock',
            width: 125,
            render: (_, row) => (
                <div>
                    свободно: <b>{row.free_stock_qty}</b>
                    <div><Text type="secondary">остаток {row.current_stock_qty} · резерв {row.reserved_qty}</Text></div>
                </div>
            ),
        },
        {
            title: 'Потребность',
            key: 'need',
            width: 130,
            render: (_, row) => (
                <div>
                    открыто: <b>{row.open_backlog_qty}</b>
                    <div><Text type="secondary">в пути {row.in_transit_qty} · цель {row.target_stock_qty}</Text></div>
                </div>
            ),
        },
        {
            title: 'К заказу',
            dataIndex: 'recommended_order_qty',
            width: 105,
            fixed: 'right',
            render: (value) => value > 0 ? (
                <Tag color="green" icon={<ShoppingCartOutlined />}>
                    {value} шт.
                </Tag>
            ) : <Text type="secondary">не требуется</Text>,
        },
    ];

    const marketCount = rows.filter((row) => row.is_market_opportunity).length;
    const orderQty = rows.reduce((sum, row) => sum + Number(row.recommended_order_qty || 0), 0);

    return (
        <div style={{ padding: 20 }}>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                    <Title level={3} style={{ marginBottom: 2 }}>Оборачиваемость и закупка</Title>
                    <Text type="secondary">
                        Спрос по заказам, движение остатков поставщиков, цена и потребность склада.
                        {updatedAt ? ` Обновлено: ${new Date(updatedAt).toLocaleString('ru-RU')}.` : ''}
                    </Text>
                </div>
                <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
                    Пересчитать
                </Button>
            </Space>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    message={String(error)}
                    action={<Button size="small" onClick={load}>Повторить</Button>}
                    style={{ marginTop: 16 }}
                />
            )}

            <Row gutter={12} style={{ marginTop: 16 }}>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Найдено" value={total} /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="На странице: рынок" value={marketCount} /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="К заказу на странице" value={orderQty} suffix="шт." /></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Statistic title="Размер страницы" value={pageSize} /></Card></Col>
            </Row>

            <Card size="small" style={{ marginTop: 12, marginBottom: 12 }}>
                <Space wrap>
                    <Select
                        showSearch allowClear filterOption={false}
                        placeholder="Бренд" style={{ width: 190 }}
                        onSearch={searchBrands} onFocus={() => searchBrands('')}
                        options={brands} value={brandId}
                        onChange={resetPage(setBrandId)}
                    />
                    <Select
                        showSearch allowClear optionFilterProp="label"
                        placeholder="Категория" style={{ width: 220 }}
                        options={categories} value={categoryId}
                        onChange={resetPage(setCategoryId)}
                    />
                    <Select
                        value={signal} style={{ width: 205 }}
                        onChange={resetPage(setSignal)}
                        options={[
                            { value: 'all', label: 'Все сигналы' },
                            { value: 'demand', label: 'Есть наши заказы' },
                            { value: 'market', label: 'Рыночные возможности' },
                        ]}
                    />
                    <Select
                        value={sortBy} style={{ width: 190 }}
                        onChange={resetPage(setSortBy)}
                        options={[
                            { value: 'score', label: 'По общей оценке' },
                            { value: 'demand', label: 'По спросу' },
                            { value: 'market', label: 'По рынку' },
                            { value: 'price', label: 'По выгоде цены' },
                            { value: 'recommended_qty', label: 'По количеству к заказу' },
                        ]}
                    />
                    <Space size={5}><Switch checked={onlyTop} onChange={resetPage(setOnlyTop)} />Только топ</Space>
                    <Space size={5}><Switch checked={onlyDeclining} onChange={resetPage(setOnlyDeclining)} />Остаток тает</Space>
                    <Space size={5}><Switch checked={needsOrder} onChange={resetPage(setNeedsOrder)} />Требуется заказ</Space>
                    <Space size={5}>
                        Поставщиков от
                        <InputNumber min={0} value={minSuppliers} onChange={resetPage(setMinSuppliers)} />
                    </Space>
                    <Space size={5}>
                        Оценка от
                        <InputNumber min={0} max={100} value={minScore} onChange={resetPage(setMinScore)} />
                        <Tooltip title="Оценка складывается из спроса, движения рынка и выгоды цены. Топ требует повторного спроса минимум в трёх неделях или сильного рыночного сигнала минимум от двух поставщиков.">
                            <InfoCircleOutlined />
                        </Tooltip>
                    </Space>
                </Space>
            </Card>

            <Table
                rowKey="autopart_id"
                columns={columns}
                dataSource={rows}
                loading={loading}
                size="small"
                scroll={{ x: 1190 }}
                onRow={(row) => ({
                    // Сразу поиск по артикулу: сайт и наши прайсы одним запросом
                    onClick: () => navigate(`/autoparts/offers?${new URLSearchParams({
                        oem: row.oem_number || '',
                        brand: row.brand_name || '',
                        auto: '1',
                    }).toString()}`),
                    style: { cursor: 'pointer' },
                })}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: [25, 50, 100, 200],
                    showTotal: (value) => `Всего: ${value}`,
                    onChange: (nextPage, nextSize) => {
                        setPage(nextSize !== pageSize ? 1 : nextPage);
                        setPageSize(nextSize);
                    },
                }}
            />
        </div>
    );
};

export default TurnoverReportPage;
