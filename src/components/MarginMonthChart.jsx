import React, { useMemo, useRef, useState } from 'react';
import { Empty, Typography } from 'antd';

const { Text } = Typography;

// Emphasis-паттерн: текущее окно — акцентный синий, предыдущее — серый
// контекст с пунктиром (второй канал кодирования для ЧБ-печати и CVD).
const CURRENT_COLOR = '#2a78d6';
const PREVIOUS_COLOR = '#898781';
const GRID_COLOR = '#e1e0d9';
const AXIS_TEXT_COLOR = '#898781';

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

const formatCompact = (value, metric) => {
    if (value == null || !Number.isFinite(value)) return '—';
    if (metric === 'margin') return `${value.toFixed(1)}%`;
    const abs = Math.abs(value);
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} млн`;
    if (abs >= 1e3) return `${Math.round(value / 1e3)} тыс.`;
    return `${Math.round(value)}`;
};

const formatTooltipValue = (value, metric) => {
    if (value == null || !Number.isFinite(value)) return '—';
    if (metric === 'margin') return `${value.toFixed(1)}%`;
    return `${new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 0,
    }).format(value)} руб.`;
};

const formatDayDate = (windowStart, dayIndex) => {
    const date = new Date(windowStart.getTime() + dayIndex * DAY_MS);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
    });
};

// Кумулятивная серия по дням окна. metric: revenue | profit | margin.
// Прибыль и маржа считаются только по строкам с известной себестоимостью.
const buildCumulativeSeries = (rows, windowStart, metric) => {
    const perDay = Array.from({ length: WINDOW_DAYS }, () => ({
        revenue: 0,
        costedRevenue: 0,
        profit: 0,
    }));
    let hasData = false;
    (rows || []).forEach((row) => {
        const parsed = new Date(row.period_start);
        if (Number.isNaN(parsed.getTime())) return;
        const offset = Math.floor((parsed.getTime() - windowStart.getTime()) / DAY_MS);
        if (offset < 0 || offset >= WINDOW_DAYS) return;
        const revenue = Number(row.revenue_total || 0);
        const cost = Number(row.cost_total || 0);
        perDay[offset].revenue += revenue;
        if (Number(row.uncosted_quantity || 0) === 0) {
            perDay[offset].costedRevenue += revenue;
            perDay[offset].profit += revenue - cost;
        }
        hasData = true;
    });
    const values = [];
    let cumRevenue = 0;
    let cumCostedRevenue = 0;
    let cumProfit = 0;
    for (let day = 0; day < WINDOW_DAYS; day += 1) {
        cumRevenue += perDay[day].revenue;
        cumCostedRevenue += perDay[day].costedRevenue;
        cumProfit += perDay[day].profit;
        if (metric === 'revenue') {
            values.push(cumRevenue);
        } else if (metric === 'profit') {
            values.push(cumProfit);
        } else {
            values.push(
                cumCostedRevenue > 0
                    ? (cumProfit / cumCostedRevenue) * 100
                    : null
            );
        }
    }
    return { values, hasData };
};

const niceStep = (roughStep) => {
    if (roughStep <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(roughStep));
    const base = roughStep / power;
    if (base <= 1) return power;
    if (base <= 2) return 2 * power;
    if (base <= 5) return 5 * power;
    return 10 * power;
};

const MarginMonthChart = ({ currentRows, prevRows, metric = 'revenue' }) => {
    const containerRef = useRef(null);
    const [hoverDay, setHoverDay] = useState(null);

    const chart = useMemo(() => {
        const currentStart = new Date();
        currentStart.setHours(0, 0, 0, 0);
        currentStart.setDate(currentStart.getDate() - (WINDOW_DAYS - 1));
        const prevStart = new Date(
            currentStart.getTime() - WINDOW_DAYS * DAY_MS
        );
        const current = buildCumulativeSeries(currentRows, currentStart, metric);
        const previous = buildCumulativeSeries(prevRows, prevStart, metric);
        const allValues = [...current.values, ...previous.values].filter(
            (value) => value != null && Number.isFinite(value)
        );
        if (!allValues.length || (!current.hasData && !previous.hasData)) {
            return null;
        }
        let min = Math.min(0, ...allValues);
        let max = Math.max(...allValues);
        if (min === max) max = min + 1;
        const step = niceStep((max - min) / 4);
        min = Math.floor(min / step) * step;
        max = Math.ceil(max / step) * step;
        const ticks = [];
        for (let tick = min; tick <= max + step / 2; tick += step) {
            ticks.push(tick);
        }
        const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
        const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
        const xFor = (day) => (
            PAD_LEFT + (day / (WINDOW_DAYS - 1)) * plotWidth
        );
        const yFor = (value) => (
            PAD_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight
        );
        const toSegments = (values) => {
            const segments = [];
            let segment = [];
            values.forEach((value, day) => {
                if (value == null || !Number.isFinite(value)) {
                    if (segment.length > 1) segments.push(segment);
                    segment = [];
                    return;
                }
                segment.push([xFor(day), yFor(value)]);
            });
            if (segment.length > 1) segments.push(segment);
            return segments;
        };
        return {
            currentStart,
            prevStart,
            currentValues: current.values,
            prevValues: previous.values,
            ticks,
            xFor,
            yFor,
            currentSegments: toSegments(current.values),
            prevSegments: toSegments(previous.values),
        };
    }, [currentRows, prevRows, metric]);

    if (!chart) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Недостаточно данных для графика"
            />
        );
    }

    const handleMouseMove = (event) => {
        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
        const day = Math.round(
            ((x - PAD_LEFT) / (CHART_WIDTH - PAD_LEFT - PAD_RIGHT))
            * (WINDOW_DAYS - 1)
        );
        setHoverDay(Math.min(Math.max(day, 0), WINDOW_DAYS - 1));
    };

    const hoverCurrent = hoverDay != null ? chart.currentValues[hoverDay] : null;
    const hoverPrev = hoverDay != null ? chart.prevValues[hoverDay] : null;
    const tooltipLeftPct = hoverDay != null
        ? (chart.xFor(hoverDay) / CHART_WIDTH) * 100
        : 0;

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 4,
                    fontSize: 12,
                }}
            >
                <span>
                    <svg width="22" height="8" style={{ marginRight: 4 }}>
                        <line x1="0" y1="4" x2="22" y2="4" stroke={CURRENT_COLOR} strokeWidth="2.5" />
                    </svg>
                    <Text>Текущие 30 дней</Text>
                </span>
                <span>
                    <svg width="22" height="8" style={{ marginRight: 4 }}>
                        <line x1="0" y1="4" x2="22" y2="4" stroke={PREVIOUS_COLOR} strokeWidth="2" strokeDasharray="5 4" />
                    </svg>
                    <Text type="secondary">Предыдущие 30 дней</Text>
                </span>
            </div>
            <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverDay(null)}
            >
                {chart.ticks.map((tick) => (
                    <g key={tick}>
                        <line
                            x1={PAD_LEFT}
                            x2={CHART_WIDTH - PAD_RIGHT}
                            y1={chart.yFor(tick)}
                            y2={chart.yFor(tick)}
                            stroke={GRID_COLOR}
                            strokeWidth="1"
                        />
                        <text
                            x={PAD_LEFT - 6}
                            y={chart.yFor(tick) + 3.5}
                            textAnchor="end"
                            fontSize="11"
                            fill={AXIS_TEXT_COLOR}
                        >
                            {formatCompact(tick, metric)}
                        </text>
                    </g>
                ))}
                {[0, 9, 19, 29].map((day) => (
                    <text
                        key={day}
                        x={chart.xFor(day)}
                        y={CHART_HEIGHT - 8}
                        textAnchor="middle"
                        fontSize="11"
                        fill={AXIS_TEXT_COLOR}
                    >
                        {formatDayDate(chart.currentStart, day)}
                    </text>
                ))}
                {chart.prevSegments.map((segment, index) => (
                    <polyline
                        key={`prev-${index}`}
                        points={segment.map((point) => point.join(',')).join(' ')}
                        fill="none"
                        stroke={PREVIOUS_COLOR}
                        strokeWidth="2"
                        strokeDasharray="5 4"
                        strokeLinejoin="round"
                    />
                ))}
                {chart.currentSegments.map((segment, index) => (
                    <polyline
                        key={`cur-${index}`}
                        points={segment.map((point) => point.join(',')).join(' ')}
                        fill="none"
                        stroke={CURRENT_COLOR}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                    />
                ))}
                {hoverDay != null && (
                    <g>
                        <line
                            x1={chart.xFor(hoverDay)}
                            x2={chart.xFor(hoverDay)}
                            y1={PAD_TOP}
                            y2={CHART_HEIGHT - PAD_BOTTOM}
                            stroke={AXIS_TEXT_COLOR}
                            strokeWidth="1"
                            strokeDasharray="3 3"
                        />
                        {hoverPrev != null && Number.isFinite(hoverPrev) && (
                            <circle
                                cx={chart.xFor(hoverDay)}
                                cy={chart.yFor(hoverPrev)}
                                r="4.5"
                                fill={PREVIOUS_COLOR}
                                stroke="#fff"
                                strokeWidth="2"
                            />
                        )}
                        {hoverCurrent != null && Number.isFinite(hoverCurrent) && (
                            <circle
                                cx={chart.xFor(hoverDay)}
                                cy={chart.yFor(hoverCurrent)}
                                r="4.5"
                                fill={CURRENT_COLOR}
                                stroke="#fff"
                                strokeWidth="2"
                            />
                        )}
                    </g>
                )}
            </svg>
            {hoverDay != null && (
                <div
                    style={{
                        position: 'absolute',
                        top: 18,
                        left: `min(max(${tooltipLeftPct}%, 12%), 78%)`,
                        transform: 'translateX(-50%)',
                        background: '#fff',
                        border: '1px solid #e1e0d9',
                        borderRadius: 6,
                        boxShadow: '0 2px 8px rgba(11, 11, 11, 0.12)',
                        padding: '6px 10px',
                        fontSize: 12,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                    }}
                >
                    <div style={{ color: AXIS_TEXT_COLOR, marginBottom: 2 }}>
                        День {hoverDay + 1} окна · нарастающий итог
                    </div>
                    <div>
                        <span style={{ color: CURRENT_COLOR }}>●</span>
                        {` ${formatDayDate(chart.currentStart, hoverDay)}: `}
                        <strong>{formatTooltipValue(hoverCurrent, metric)}</strong>
                    </div>
                    <div>
                        <span style={{ color: PREVIOUS_COLOR }}>●</span>
                        {` ${formatDayDate(chart.prevStart, hoverDay)}: `}
                        <strong>{formatTooltipValue(hoverPrev, metric)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarginMonthChart;
