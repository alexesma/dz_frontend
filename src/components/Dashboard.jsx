import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import {
    Button,
    Card,
    Empty,
    InputNumber,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
    message,
} from 'antd';
import { getSupplierPriceTrends } from '../api/dashboard';

const COLORS = [
    '#1d39c4',
    '#389e0d',
    '#cf1322',
    '#08979c',
    '#d46b08',
    '#531dab',
    '#096dd9',
    '#ad4e00',
    '#7cb305',
    '#13a8a8',
];

const formatValue = (value, digits = 2) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toFixed(digits);
};

const joinLabel = (item) => {
    const provider = item.provider_name || 'Без поставщика';
    const config = item.provider_config_name || `#${item.provider_config_id}`;
    return `${provider} / ${config}`;
};

const LineChartCard = ({
    title,
    subtitle,
    details,
    series,
    valueKey,
    suffix = '',
    digits = 2,
}) => {
    const prepared = useMemo(() => {
        const dateSet = new Set();
        series.forEach((item) => {
            (item.points || []).forEach((point) => {
                if (point?.date) {
                    dateSet.add(point.date);
                }
            });
        });
        const dates = Array.from(dateSet).sort();
        if (!dates.length) {
            return {
                dates: [],
                values: [],
                min: 0,
                max: 0,
            };
        }

        const values = series.map((item, idx) => {
            const pointMap = new Map();
            (item.points || []).forEach((point) => {
                if (point?.date) {
                    pointMap.set(point.date, point);
                }
            });
            return {
                color: COLORS[idx % COLORS.length],
                label: joinLabel(item),
                points: dates.map((date) => {
                    const point = pointMap.get(date) || null;
                    const value = Number(point?.[valueKey]);
                    return {
                        value: Number.isFinite(value) ? value : null,
                        point,
                    };
                }),
            };
        });

        const numeric = [];
        values.forEach((item) => {
            item.points.forEach((value) => {
                if (value.value !== null) {
                    numeric.push(value.value);
                }
            });
        });
        if (!numeric.length) {
            return {
                dates,
                values,
                min: 0,
                max: 0,
            };
        }
        let min = Math.min(...numeric);
        let max = Math.max(...numeric);
        if (min === max) {
            min -= 1;
            max += 1;
        }
        return {
            dates,
            values,
            min,
            max,
        };
    }, [series, valueKey]);

    const width = 980;
    const height = 290;
    const padLeft = 54;
    const padRight = 16;
    const padTop = 20;
    const padBottom = 36;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;
    const dates = prepared.dates;

    const xForIndex = (idx) => {
        if (dates.length <= 1) {
            return padLeft + innerWidth / 2;
        }
        return padLeft + (idx * innerWidth) / (dates.length - 1);
    };
    const yForValue = (value) => {
        const ratio = (value - prepared.min) / (prepared.max - prepared.min);
        return padTop + innerHeight - ratio * innerHeight;
    };
    const yTicks = 5;
    const yLabels = Array.from({ length: yTicks + 1 }).map((_, idx) => {
        const ratio = idx / yTicks;
        const value = prepared.max - ratio * (prepared.max - prepared.min);
        return {
            y: padTop + ratio * innerHeight,
            value,
        };
    });

    return (
        <Card
            title={title}
            style={{ marginBottom: 16 }}
            extra={
                <Typography.Text type="secondary">{subtitle}</Typography.Text>
            }
        >
            {!dates.length ? (
                <Empty description="Нет данных для графика" />
            ) : (
                <>
                    <svg
                        width="100%"
                        viewBox={`0 0 ${width} ${height}`}
                        style={{ border: '1px solid #f0f0f0', borderRadius: 8 }}
                    >
                        {yLabels.map((tick, idx) => (
                            <g key={`y-${idx}`}>
                                <line
                                    x1={padLeft}
                                    y1={tick.y}
                                    x2={width - padRight}
                                    y2={tick.y}
                                    stroke="#f0f0f0"
                                    strokeWidth="1"
                                />
                                <text
                                    x={padLeft - 8}
                                    y={tick.y + 4}
                                    fontSize="11"
                                    fill="#8c8c8c"
                                    textAnchor="end"
                                >
                                    {formatValue(tick.value, digits)}
                                    {suffix}
                                </text>
                            </g>
                        ))}
                        {prepared.values.map((row, rowIdx) => {
                            const segments = [];
                            let current = [];
                            row.points.forEach((item, idx) => {
                                if (item.value === null) {
                                    if (current.length > 1) {
                                        segments.push(current);
                                    }
                                    current = [];
                                    return;
                                }
                                current.push([
                                    xForIndex(idx),
                                    yForValue(item.value),
                                ]);
                            });
                            if (current.length > 1) {
                                segments.push(current);
                            }
                            return (
                                <g key={`line-${rowIdx}`}>
                                    {segments.map((segment, segIdx) => (
                                        <polyline
                                            key={`seg-${segIdx}`}
                                            fill="none"
                                            stroke={row.color}
                                            strokeWidth="2"
                                            points={segment
                                                .map((pair) => `${pair[0]},${pair[1]}`)
                                                .join(' ')}
                                        />
                                    ))}
                                    {row.points.map((item, idx) => {
                                        if (item.value === null) {
                                            return null;
                                        }
                                        const point = item.point || {};
                                        const valueText = (
                                            `${formatValue(item.value, digits)}`
                                            + suffix
                                        );
                                        const tooltipRows = [
                                            row.label,
                                            `Дата: ${dates[idx]}`,
                                            `Значение: ${valueText}`,
                                            `SKU: ${point.sku_count ?? '-'}`,
                                            `Остаток: ${point.stock_total_qty ?? '-'}`,
                                        ];
                                        if (point.coverage_pct !== null
                                            && point.coverage_pct !== undefined) {
                                            tooltipRows.push(
                                                `Покрытие: ${formatValue(point.coverage_pct, 2)}%`
                                            );
                                        }
                                        if (
                                            valueKey === 'step_index_smooth_pct'
                                            && point.step_index_pct !== null
                                            && point.step_index_pct !== undefined
                                        ) {
                                            tooltipRows.push(
                                                `Сырой индекс: ${formatValue(point.step_index_pct, 2)}%`
                                            );
                                        }
                                        return (
                                            <circle
                                                key={`dot-${idx}`}
                                                cx={xForIndex(idx)}
                                                cy={yForValue(item.value)}
                                                r="2.8"
                                                fill={row.color}
                                            >
                                                <title>
                                                    {tooltipRows.join('\n')}
                                                </title>
                                            </circle>
                                        );
                                    })}
                                </g>
                            );
                        })}
                        {dates.map((date, idx) => {
                            const every = Math.max(
                                1,
                                Math.ceil(dates.length / 8)
                            );
                            if (idx % every !== 0 && idx !== dates.length - 1) {
                                return null;
                            }
                            return (
                                <text
                                    key={`x-${date}`}
                                    x={xForIndex(idx)}
                                    y={height - 12}
                                    fontSize="11"
                                    fill="#8c8c8c"
                                    textAnchor="middle"
                                >
                                    {date}
                                </text>
                            );
                        })}
                    </svg>
                    <Space wrap size={[8, 8]} style={{ marginTop: 12 }}>
                        {prepared.values.map((row) => (
                            <Tag key={row.label} color={row.color}>
                                {row.label}
                            </Tag>
                        ))}
                    </Space>
                    {details ? (
                        <Typography.Paragraph
                            type="secondary"
                            style={{ marginTop: 12, marginBottom: 0 }}
                        >
                            {details}
                        </Typography.Paragraph>
                    ) : null}
                </>
            )}
        </Card>
    );
};

const Dashboard = () => {
    const [loading, setLoading] = useState(false);
    const [days, setDays] = useState(30);
    const [pointsLimit, setPointsLimit] = useState(10);
    const [smoothWindow, setSmoothWindow] = useState(3);
    const [series, setSeries] = useState([]);
    const [selectedProviderConfigIds, setSelectedProviderConfigIds] = useState(
        []
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getSupplierPriceTrends({
                days,
                points_limit: pointsLimit,
                smooth_window: smoothWindow,
            });
            setSeries(Array.isArray(data?.series) ? data.series : []);
        } catch {
            message.error('Не удалось загрузить данные Dashboard');
        } finally {
            setLoading(false);
        }
    }, [days, pointsLimit, smoothWindow]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        setSelectedProviderConfigIds((prev) => {
            const availableIds = series.map((item) => item.provider_config_id);
            const kept = prev.filter((id) => availableIds.includes(id));
            if (kept.length) {
                return kept;
            }
            return availableIds;
        });
    }, [series]);

    const providerOptions = useMemo(() => {
        return series.map((item) => ({
            value: item.provider_config_id,
            label: joinLabel(item),
        }));
    }, [series]);

    const visibleSeries = useMemo(() => {
        if (!selectedProviderConfigIds.length) {
            return [];
        }
        const selected = new Set(selectedProviderConfigIds);
        return series.filter((item) => selected.has(item.provider_config_id));
    }, [series, selectedProviderConfigIds]);

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card
                title="Мониторинг прайсов поставщиков"
                extra={
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={loadData}
                        loading={loading}
                    >
                        Обновить
                    </Button>
                }
                style={{ margin: '20px' }}
            >
                <Space wrap size="middle" style={{ marginBottom: 12 }}>
                    <div>
                        <Typography.Text type="secondary">
                            Период, дней
                        </Typography.Text>
                        <br />
                        <InputNumber
                            min={1}
                            max={365}
                            value={days}
                            onChange={(value) => setDays(Number(value || 1))}
                        />
                    </div>
                    <div>
                        <Typography.Text type="secondary">
                            Точек на источник
                        </Typography.Text>
                        <br />
                        <InputNumber
                            min={2}
                            max={40}
                            value={pointsLimit}
                            onChange={(value) =>
                                setPointsLimit(Number(value || 2))
                            }
                        />
                    </div>
                    <div style={{ minWidth: 420 }}>
                        <Typography.Text type="secondary">
                            Отображаемые источники
                        </Typography.Text>
                        <Select
                            mode="multiple"
                            value={selectedProviderConfigIds}
                            onChange={setSelectedProviderConfigIds}
                            options={providerOptions}
                            placeholder="Выберите источники"
                            style={{ width: '100%' }}
                            maxTagCount={3}
                        />
                    </div>
                    <div>
                        <Typography.Text type="secondary">
                            Окно сглаживания индекса
                        </Typography.Text>
                        <br />
                        <InputNumber
                            min={1}
                            max={15}
                            value={smoothWindow}
                            onChange={(value) =>
                                setSmoothWindow(Number(value || 1))
                            }
                        />
                    </div>
                </Space>

                <Typography.Paragraph type="secondary">
                    Шаговый индекс цен считается между двумя соседними
                    загрузками прайса как медиана процента изменения цен по
                    одинаковым SKU. Покрытие показывает долю SKU, которые
                    присутствуют и в текущей, и в предыдущей загрузке.
                </Typography.Paragraph>

                {loading ? (
                    <Spin />
                ) : (
                    <>
                        <LineChartCard
                            title="Количество SKU"
                            subtitle="Позиции с остатком > 0"
                            details={
                                'График показывает число уникальных SKU в каждой загрузке прайса. '
                                + 'Если линия резко падает, поставщик убрал часть позиций, обнулил остатки '
                                + 'или изменил состав файла.'
                            }
                            series={visibleSeries}
                            valueKey="sku_count"
                            digits={0}
                        />
                        <LineChartCard
                            title="Шаговый индекс цен"
                            subtitle="Сглаженный (rolling median)"
                            details={
                                'Индекс считается по SKU, которые есть и в текущей, и в предыдущей загрузке: '
                                + 'медиана((цена_тек / цена_пред - 1) * 100). Значение выше 0% — цены в среднем '
                                + 'растут, ниже 0% — снижаются. Для подавления «дёргания» '
                                + `применяется сглаживание медианой по последним ${smoothWindow} шагам.`
                            }
                            series={visibleSeries}
                            valueKey="step_index_smooth_pct"
                            suffix="%"
                            digits={2}
                        />
                        <LineChartCard
                            title="Покрытие ассортимента"
                            subtitle="Пересечение SKU с прошлой загрузкой"
                            details={
                                'Показывает, какая доля SKU из предыдущей загрузки присутствует в текущей '
                                + '(overlap / SKU_предыдущей * 100). Низкое покрытие означает сильную смену '
                                + 'ассортимента и снижает достоверность сравнения индекса цен.'
                            }
                            series={visibleSeries}
                            valueKey="coverage_pct"
                            suffix="%"
                            digits={2}
                        />
                    </>
                )}
            </Card>
        </Space>
    );
};

export default Dashboard;
