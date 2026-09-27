import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Divider, Progress, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
    ReloadOutlined,
    RiseOutlined,
    ShoppingCartOutlined,
} from '@ant-design/icons';

import { getAutopartTurnoverSummary } from '../api/autoparts.js';

const { Text } = Typography;
const fmtPrice = (value) => (
    value == null ? '—' : `${Number(value).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ₽`
);
const fmtScore = (value) => Math.round(Number(value || 0));
const fmtDate = (value) => (
    value ? new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU') : '—'
);

const trendLabel = (value) => {
    if (value == null) return null;
    if (value < -0.05) return { text: 'остаток уменьшается', color: '#cf1322' };
    if (value > 0.05) return { text: 'остаток растёт', color: '#3f8600' };
    return { text: 'без заметных изменений', color: '#64748b' };
};

const TurnoverContent = ({ data, loading, error, label, onRetry }) => {
    if (loading) return <Spin size="small" />;
    if (error) {
        return (
            <Space direction="vertical" size={6}>
                <Text type="danger">Не удалось загрузить аналитику</Text>
                <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
                    Повторить
                </Button>
            </Space>
        );
    }
    if (!data) return <Text type="secondary">Нет данных по позиции</Text>;

    const trend = trendLabel(data.supplier_qty_trend_30d);
    const details = (data.supplier_trends || []).slice(0, 3);
    return (
        <div style={{ width: 350, maxWidth: '80vw', fontSize: 12 }}>
            {label && <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>}
            <Space wrap size={[4, 4]}>
                {data.is_top && <Tag color="gold">Топ-рекомендация</Tag>}
                {data.is_market_opportunity && <Tag color="blue">Рыночная возможность</Tag>}
                {data.recommended_order_qty > 0 && (
                    <Tag color="green" icon={<ShoppingCartOutlined />}>
                        заказать {data.recommended_order_qty} шт.
                    </Tag>
                )}
            </Space>
            <div style={{ marginTop: 8 }}>
                Оценка рекомендации: <b>{fmtScore(data.recommendation_score)}/100</b>
                <Progress
                    percent={fmtScore(data.recommendation_score)}
                    showInfo={false}
                    size="small"
                    strokeColor="#1677ff"
                />
            </div>
            <Divider style={{ margin: '7px 0' }} />
            <div><b>Спрос по заказам</b></div>
            <div>30 дней: <b>{data.sold_qty_30d}</b> шт. в {data.order_count_30d} заказах</div>
            <div>90 дней: <b>{data.sold_qty_90d}</b> шт.; активных недель: {data.active_weeks_90d}</div>
            {data.shipments_data_available ? (
                <div>Фактически отгружено: <b>{data.shipped_qty_30d}</b> шт. за 30 дней</div>
            ) : (
                <Text type="secondary">Фактические отгрузки пока не ведутся</Text>
            )}
            <Divider style={{ margin: '7px 0' }} />
            <div><b>Цена и поставщики</b></div>
            <div>
                Минимум: <b>{fmtPrice(data.min_purchase_price)}</b>
                {data.min_price_provider_name ? ` · ${data.min_price_provider_name}` : ''}
            </div>
            <div>
                Прайс: <b>{fmtDate(data.min_price_pricelist_date)}</b>;
                {' '}срок поставки: <b>{data.lead_time_days == null ? '—' : `${Number(data.lead_time_days).toFixed(0)} дн.`}</b>
            </div>
            <div>Медиана актуальных предложений: <b>{fmtPrice(data.median_purchase_price)}</b></div>
            <div>
                К медиане 90 дней:{' '}
                <b>{data.price_vs_90d_pct == null ? '—' : `${Number(data.price_vs_90d_pct).toFixed(1)}%`}</b>
            </div>
            <div>Актуальных поставщиков: <b>{data.supplier_count}</b></div>
            {trend && (
                <div>
                    Рынок: <b style={{ color: trend.color }}>{trend.text}</b>
                    {' '}({Number(data.supplier_qty_trend_30d).toFixed(2)} шт./день),
                    {' '}снижение у {data.declining_supplier_count} из {data.trend_supplier_count}
                </div>
            )}
            {details.map((item) => (
                <div key={`${item.provider_id}-${item.provider_name}`} style={{ color: '#64748b' }}>
                    {item.provider_name}: {Number(item.trend_per_day || 0).toFixed(2)} шт./день
                </div>
            ))}
            <Divider style={{ margin: '7px 0' }} />
            <div><b>Расчёт закупки</b></div>
            <div>
                Остаток: {data.current_stock_qty}; резерв: {data.reserved_qty};{' '}
                свободно: <b>{data.free_stock_qty}</b>
            </div>
            <div>В пути: {data.in_transit_qty}; открытый спрос: {data.open_backlog_qty}</div>
            <div>
                Целевой запас: {data.target_stock_qty}; кратность: {data.multiplicity};{' '}
                <b>к заказу: {data.recommended_order_qty}</b>
            </div>
        </div>
    );
};

const TurnoverTooltip = ({
    autopartId,
    label,
    children,
    isTop = false,
    isMarketOpportunity = false,
}) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        fetchedRef.current = false;
        setData(null);
        setError(false);
    }, [autopartId]);

    const load = useCallback(() => {
        if (!autopartId || loading) return;
        fetchedRef.current = true;
        setLoading(true);
        setError(false);
        getAutopartTurnoverSummary(autopartId)
            .then((response) => setData(response.data))
            .catch(() => {
                fetchedRef.current = false;
                setError(true);
            })
            .finally(() => setLoading(false));
    }, [autopartId, loading]);

    const handleOpenChange = useCallback((open) => {
        if (open && !fetchedRef.current) load();
    }, [load]);

    if (!autopartId) return children;
    const showTop = Boolean(data?.is_top ?? isTop);
    const showMarket = Boolean(data?.is_market_opportunity ?? isMarketOpportunity);

    return (
        <Tooltip
            title={(
                <TurnoverContent
                    data={data}
                    loading={loading}
                    error={error}
                    label={label}
                    onRetry={load}
                />
            )}
            onOpenChange={handleOpenChange}
            mouseEnterDelay={0.35}
            placement="right"
            overlayStyle={{ maxWidth: 390 }}
        >
            <span>
                {showTop && <RiseOutlined style={{ color: '#faad14', marginRight: 4 }} />}
                {showMarket && !showTop && <RiseOutlined style={{ color: '#1677ff', marginRight: 4 }} />}
                {children}
            </span>
        </Tooltip>
    );
};

export default TurnoverTooltip;
