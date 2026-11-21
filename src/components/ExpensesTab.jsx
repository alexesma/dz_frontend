/**
 * ExpensesTab — расходы и доходы не по торговле: налоги, зарплата, аренда,
 * сайт и др. Итоги по статьям, динамика по месяцам, сравнение с прошлым
 * периодом и детализация операций с быстрой перекраской статьи.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Segmented, Space, Table, Tooltip, Typography, message } from 'antd';
import { EditOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { CategoriesManager, CategorizeModal, CategoryTag } from './BankCategoryParts';
import { useBankCategories } from './bankCategoryUtils';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const fmt = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtInt = (v) => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');
const nowrap = { whiteSpace: 'nowrap' };
const clip = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const FALLBACK = '#95a5a6';

const PRESETS = [
    { label: '6 месяцев', value: () => [dayjs().subtract(5, 'month').startOf('month'), dayjs()] },
    { label: 'Этот месяц', value: () => [dayjs().startOf('month'), dayjs()] },
    { label: 'Прошлый месяц', value: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
    { label: 'С начала года', value: () => [dayjs().startOf('year'), dayjs()] },
    { label: '12 месяцев', value: () => [dayjs().subtract(11, 'month').startOf('month'), dayjs()] },
];

const shortName = (value) =>
    value
        ? value
            .replace(/Общество с ограниченной ответственностью/gi, 'ООО')
            .replace(/Индивидуальный предприниматель/gi, 'ИП')
            .replace(/Акционерное общество/gi, 'АО')
        : value;

const monthLabel = (ym) => dayjs(`${ym}-01`).format('MMM YY').replace('.', '');

// ── График: столбцы по месяцам или линии по статьям ─────────────────────────

const niceMax = (value) => {
    if (value <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(value));
    const n = value / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
};
const compact = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)} млн`;
    if (abs >= 1e3) return `${Math.round(v / 1e3)} тыс`;
    return `${Math.round(v)}`;
};

const W = 720;
const H = 250;
const PAD = { l: 52, r: 10, t: 12, b: 26 };

const TrendChart = ({ months, items, mode }) => {
    const [hover, setHover] = useState(null);
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const clamp = (v) => Math.max(Number(v) || 0, 0);

    const totals = months.map((_, i) => items.reduce((s, c) => s + clamp(c.by_month[i]), 0));
    const peak = mode === 'bars'
        ? Math.max(...totals, 0)
        : Math.max(...items.flatMap((c) => c.by_month.map(clamp)), 0);
    const max = niceMax(peak);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
    const band = innerW / Math.max(months.length, 1);
    const barW = Math.min(56, band * 0.62);
    const x = (i) => PAD.l + band * i + band / 2;
    const y = (v) => PAD.t + innerH - (clamp(v) / max) * innerH;
    const labelEvery = months.length > 12 ? 2 : 1;

    if (!items.length || peak === 0) {
        return <div className="exp-chart-empty">За период нет разнесённых операций</div>;
    }

    return (
        <div className="exp-chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Динамика по месяцам" onMouseLeave={() => setHover(null)}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e6e8ec" strokeWidth="1" />
                        <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#8c8c8c">{compact(t)}</text>
                    </g>
                ))}
                {mode === 'bars' && months.map((m, i) => {
                    let acc = 0;
                    return (
                        <g key={m}>
                            {items.map((c) => {
                                const v = clamp(c.by_month[i]);
                                if (!v) return null;
                                const h = (v / max) * innerH;
                                const top = PAD.t + innerH - ((acc + v) / max) * innerH;
                                acc += v;
                                return (
                                    <rect key={c.code} x={x(i) - barW / 2} y={top} width={barW} height={Math.max(h - 1, 0.5)}
                                        rx="2" fill={c.color || FALLBACK} />
                                );
                            })}
                        </g>
                    );
                })}
                {mode === 'lines' && items.map((c) => (
                    <g key={c.code}>
                        <polyline fill="none" stroke={c.color || FALLBACK} strokeWidth="2" strokeLinejoin="round"
                            points={months.map((_, i) => `${x(i)},${y(c.by_month[i])}`).join(' ')} />
                        {months.map((m, i) => (
                            <circle key={m} cx={x(i)} cy={y(c.by_month[i])} r="2.5" fill={c.color || FALLBACK} />
                        ))}
                    </g>
                ))}
                {months.map((m, i) => (
                    <g key={m}>
                        {i % labelEvery === 0 && (
                            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8c8c8c">{monthLabel(m)}</text>
                        )}
                        <rect x={PAD.l + band * i} y={PAD.t} width={band} height={innerH} fill="transparent"
                            onMouseEnter={() => setHover(i)} />
                    </g>
                ))}
                {hover != null && (
                    <rect x={PAD.l + band * hover} y={PAD.t} width={band} height={innerH} fill="#2a78d6" opacity="0.06" pointerEvents="none" />
                )}
            </svg>
            {hover != null && (
                <div className="exp-tooltip" style={{ left: `${((PAD.l + band * (hover + 0.5)) / W) * 100}%` }}>
                    <div className="exp-tooltip-title">{monthLabel(months[hover])}</div>
                    {items
                        .filter((c) => clamp(c.by_month[hover]) > 0)
                        .sort((a, b) => clamp(b.by_month[hover]) - clamp(a.by_month[hover]))
                        .map((c) => (
                            <div key={c.code} className="exp-tooltip-row">
                                <span className="exp-dot" style={{ background: c.color || FALLBACK }} />
                                <span className="exp-tooltip-name">{c.name}</span>
                                <span>{fmtInt(c.by_month[hover])}</span>
                            </div>
                        ))}
                    <div className="exp-tooltip-row exp-tooltip-total">
                        <span className="exp-tooltip-name">Итого</span>
                        <span>{fmtInt(totals[hover])} ₽</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const Metric = ({ label, value, hint, accent, onClick }) => (
    <div
        className={`deposit-metric${onClick ? ' exp-metric-click' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
    >
        <div className="deposit-metric-label">{label}</div>
        <div className="deposit-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
        {hint && <div className="deposit-metric-hint">{hint}</div>}
    </div>
);

const Delta = ({ value }) => {
    if (value == null) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
    const n = Number(value);
    if (n === 0) return <Text type="secondary" style={{ fontSize: 12 }}>0 %</Text>;
    return (
        <Text style={{ fontSize: 12, color: n > 0 ? '#c0392b' : '#27ae60', ...nowrap }}>
            {n > 0 ? '▲' : '▼'} {Math.abs(n).toFixed(1)} %
        </Text>
    );
};

// ── Детализация операций ─────────────────────────────────────────────────────

const OperationsDrawer = ({ target, range, categories, byCode, onClose, onChanged, onCategoriesChanged }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = useCallback(async () => {
        if (!target) return;
        setLoading(true);
        try {
            const params = { limit: 500 };
            if (target.uncategorized) params.uncategorized = true;
            else params.category = target.code;
            if (range?.[0]) params.date_from = range[0].format('YYYY-MM-DD');
            if (range?.[1]) params.date_to = range[1].format('YYYY-MM-DD');
            const res = await api.get('/finance/bank-operations', { params });
            setRows(res.data || []);
        } catch {
            message.error('Не удалось загрузить операции');
        } finally {
            setLoading(false);
        }
    }, [target, range]);

    useEffect(() => { load(); }, [load]);

    const columns = [
        { title: 'Дата', dataIndex: 'value_date', width: 88, render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{fmtDate(v)}</Text> },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            width: 116,
            align: 'right',
            render: (v, rec) => (
                <Text strong style={{ fontSize: 12, color: rec.direction === 'incoming' ? '#27ae60' : '#c0392b', ...nowrap }}>
                    {rec.direction === 'incoming' ? '+' : '−'}{fmt(v)}
                </Text>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'counterparty_name',
            width: '30%',
            render: (v, rec) => (
                <div style={{ minWidth: 0 }}>
                    <Tooltip title={v}><Text style={{ fontSize: 12, ...clip }}>{shortName(v) || '—'}</Text></Tooltip>
                    {rec.counterparty_inn && <Text type="secondary" style={{ fontSize: 11, ...clip }}>ИНН {rec.counterparty_inn}</Text>}
                </div>
            ),
        },
        {
            title: 'Назначение',
            dataIndex: 'purpose',
            render: (v) => (
                <Tooltip title={v} overlayStyle={{ maxWidth: 480 }}><div className="bank-purpose">{v || '—'}</div></Tooltip>
            ),
        },
        {
            title: 'Статья',
            dataIndex: 'category',
            width: 150,
            render: (v) => (v ? <CategoryTag code={v} byCode={byCode} /> : <Text type="secondary" style={{ fontSize: 12 }}>не задана</Text>),
        },
        {
            title: '',
            width: 44,
            align: 'center',
            render: (_, rec) => (
                <Tooltip title="Изменить статью">
                    <Button size="small" type={target?.uncategorized ? 'primary' : 'default'} ghost={target?.uncategorized}
                        icon={<EditOutlined />} onClick={() => setEditing(rec)} />
                </Tooltip>
            ),
        },
    ];

    return (
        <>
            <Drawer
                title={target ? <span style={nowrap}>{target.title}</span> : ''}
                open={Boolean(target)}
                onClose={onClose}
                width="min(1000px, 96vw)"
                destroyOnClose
            >
                {target?.uncategorized && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="Здесь операции, которые ещё никуда не разнесены"
                        description="Отнесите на статью расход вроде аренды или сайта. Платежи клиентов и поставщиков разносятся на вкладке «Выписки»."
                    />
                )}
                <Table
                    className="compact-table"
                    size="small"
                    rowKey="id"
                    tableLayout="fixed"
                    loading={loading}
                    dataSource={rows}
                    columns={columns}
                    pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
                    locale={{ emptyText: 'Операций нет' }}
                />
            </Drawer>
            <CategorizeModal
                txn={editing}
                categories={categories}
                onClose={() => setEditing(null)}
                onSaved={() => { load(); onChanged(); }}
                onCategoriesChanged={onCategoriesChanged}
            />
        </>
    );
};

// ── Вкладка ──────────────────────────────────────────────────────────────────

const ExpensesTab = () => {
    const [range, setRange] = useState([dayjs().subtract(5, 'month').startOf('month'), dayjs()]);
    const [kind, setKind] = useState('expense');
    const [mode, setMode] = useState('bars');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hidden, setHidden] = useState([]);
    const [drawer, setDrawer] = useState(null);
    const [manage, setManage] = useState(false);
    const { categories, byCode, reload: reloadCategories } = useBankCategories();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (range?.[0]) params.date_from = range[0].format('YYYY-MM-DD');
            if (range?.[1]) params.date_to = range[1].format('YYYY-MM-DD');
            const res = await api.get('/finance/bank-analytics/categories', { params });
            setData(res.data);
        } catch {
            message.error('Не удалось загрузить аналитику');
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { load(); }, [load]);

    const items = useMemo(
        () => (data?.categories || [])
            .filter((c) => c.kind === kind && (Number(c.total) !== 0 || Number(c.prev_total) !== 0))
            .sort((a, b) => Number(b.total) - Number(a.total)),
        [data, kind],
    );
    const shown = items.filter((c) => !hidden.includes(c.code));
    const totals = data?.totals;
    const kindTotal = kind === 'expense' ? totals?.expense_total : totals?.income_total;
    const maxTotal = Math.max(...items.map((c) => Number(c.total)), 1);

    const openCategory = (rec) => setDrawer({ code: rec.code, title: `${rec.name}: операции за период` });

    const columns = [
        {
            title: 'Статья',
            dataIndex: 'name',
            width: '34%',
            render: (v, rec) => (
                <Space size={6} style={{ minWidth: 0 }}>
                    <span className="exp-dot" style={{ background: rec.color || FALLBACK }} />
                    <Text style={{ fontSize: 13, ...clip }}>{v}</Text>
                </Space>
            ),
        },
        {
            title: 'За период',
            dataIndex: 'total',
            align: 'right',
            width: 120,
            render: (v) => <Text strong style={{ fontSize: 13, ...nowrap }}>{fmt(v)}</Text>,
        },
        {
            title: 'Доля',
            dataIndex: 'share_percent',
            render: (v, rec) => (
                <div className="exp-share">
                    <div className="exp-share-bar">
                        <div style={{ width: `${Math.max((Number(rec.total) / maxTotal) * 100, 1)}%`, background: rec.color || FALLBACK }} />
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, ...nowrap }}>{v != null ? `${Number(v).toFixed(1)} %` : '—'}</Text>
                </div>
            ),
        },
        {
            title: <Tooltip title="К предыдущему периоду такой же длины"><span style={nowrap}>К прошлому</span></Tooltip>,
            dataIndex: 'change_percent',
            width: 112,
            align: 'right',
            render: (v) => <Delta value={v} />,
        },
        { title: 'Операций', dataIndex: 'count', width: 96, align: 'right', render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <RangePicker
                    value={range}
                    onChange={(value) => setRange(value || [null, null])}
                    format="DD.MM.YYYY"
                    allowClear
                    presets={PRESETS}
                />
                <Segmented
                    value={kind}
                    onChange={setKind}
                    options={[{ value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }]}
                />
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
                <Button icon={<SettingOutlined />} onClick={() => setManage(true)}>Статьи и правила</Button>
            </Space>

            {totals && (
                <div className="deposit-metrics">
                    <Metric label="Расходы вне торговли" value={`${fmt(totals.expense_total)} ₽`} accent="#c0392b"
                        hint="налоги, зарплата, аренда, сайт…" />
                    <Metric label="Прочие доходы" value={`+${fmt(totals.income_total)} ₽`} accent="#27ae60"
                        hint="проценты банка и депозитов" />
                    <Metric label="Итог" value={`${Number(totals.net) >= 0 ? '+' : '−'}${fmt(Math.abs(Number(totals.net)))} ₽`}
                        accent={Number(totals.net) >= 0 ? '#27ae60' : '#c0392b'} hint="доходы минус расходы" />
                    <Metric
                        label="Не разнесено"
                        value={totals.unmatched_count}
                        accent={totals.unmatched_count ? '#d48806' : undefined}
                        hint={totals.unmatched_count ? `расход ${fmt(totals.unmatched_outgoing)} ₽ — нажмите` : 'всё разнесено'}
                        onClick={totals.unmatched_count ? () => setDrawer({ uncategorized: true, title: 'Не разнесённые операции за период' }) : undefined}
                    />
                </div>
            )}

            <div className="exp-chart-head">
                <Text strong>{kind === 'expense' ? 'Расходы по месяцам' : 'Доходы по месяцам'}</Text>
                <Segmented
                    size="small"
                    value={mode}
                    onChange={setMode}
                    options={[{ value: 'bars', label: 'Столбцы' }, { value: 'lines', label: 'Линии' }]}
                />
            </div>
            {data && <TrendChart months={data.months} items={shown} mode={mode} />}
            {items.length > 0 && (
                <div className="exp-legend">
                    {items.map((c) => {
                        const off = hidden.includes(c.code);
                        return (
                            <button
                                type="button"
                                key={c.code}
                                className={`exp-legend-item${off ? ' off' : ''}`}
                                onClick={() => setHidden((h) => (off ? h.filter((x) => x !== c.code) : [...h, c.code]))}
                            >
                                <span className="exp-dot" style={{ background: c.color || FALLBACK }} />
                                {c.name}
                            </button>
                        );
                    })}
                </div>
            )}

            <Table
                className="compact-table"
                size="small"
                rowKey="code"
                tableLayout="fixed"
                loading={loading}
                dataSource={items}
                columns={columns}
                pagination={false}
                onRow={(rec) => ({ onClick: () => openCategory(rec), style: { cursor: 'pointer' } })}
                locale={{ emptyText: 'За период нет операций по статьям. Разнесите операции в «Выписках» или откройте «Не разнесено».' }}
                summary={() => items.length > 0 && (
                    <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><Text strong style={{ fontSize: 13 }}>Всего</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><Text strong style={{ fontSize: 13, ...nowrap }}>{fmt(kindTotal)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} colSpan={3} />
                    </Table.Summary.Row>
                )}
            />

            {totals && (Number(totals.trade_income) > 0 || Number(totals.trade_expense) > 0) && (
                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                    Для сравнения, торговля за период: поступления от клиентов {fmt(totals.trade_income)} ₽,
                    оплата поставщикам {fmt(totals.trade_expense)} ₽ — в эти расходы не входят.
                    Депозиты (открытие и возврат) — перемещение своих денег, учитываются на вкладке «Депозиты».
                </Text>
            )}

            <OperationsDrawer
                target={drawer}
                range={range}
                categories={categories}
                byCode={byCode}
                onClose={() => setDrawer(null)}
                onChanged={load}
                onCategoriesChanged={reloadCategories}
            />
            <CategoriesManager
                open={manage}
                onClose={() => setManage(false)}
                onChanged={() => { reloadCategories(); load(); }}
            />
        </>
    );
};

export default ExpensesTab;
