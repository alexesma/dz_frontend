import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Collapse,
    Empty,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Spin,
    Statistic,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DownloadOutlined,
    FilterOutlined,
    ReloadOutlined,
    RiseOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

import {
    exportExplorerRows,
    getExplorerBrands,
    getExplorerPriceHistory,
    getExplorerPricelists,
    getExplorerRows,
} from '../api/providers';
import { PartPhotoBadge } from './PartPhotos';

const { Text } = Typography;

const money = (value) => (
    value === null || value === undefined
        ? '—'
        : Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
);
const int = (value) => (
    value === null || value === undefined ? '—' : Number(value).toLocaleString('ru-RU')
);
const pct = (value) => (
    value === null || value === undefined
        ? '—'
        : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`
);

// Быстрые срезы: один клик — готовый набор фильтров.
const PRESETS = [
    { key: 'up', label: 'Резкий рост цены ≥10%', filters: { price_change: 'up', price_change_min_pct: 10 }, sort: ['price_change_pct', 'desc'] },
    { key: 'down', label: 'Резкое падение цены ≥10%', filters: { price_change: 'down', price_change_min_pct: 10 }, sort: ['price_change_pct', 'asc'] },
    { key: 'new', label: 'Новинки прайса', filters: { price_change: 'new' }, sort: ['stock_value', 'desc'] },
    { key: 'top', label: 'Высокий интерес (ТОП)', filters: { top_only: true }, sort: ['score', 'desc'] },
    { key: 'demand', label: 'Продавались за 30 дней', filters: { sold_30d_min: 1, in_stock: true }, sort: ['sold_30d', 'desc'] },
    { key: 'cheap', label: 'Дешевле рынка', filters: { vs_market_max_pct: -5 }, sort: ['vs_market_pct', 'asc'] },
    { key: 'pricey', label: 'Дороже рынка ≥15%', filters: { vs_market_min_pct: 15 }, sort: ['vs_market_pct', 'desc'] },
    { key: 'qtydrop', label: 'Остаток упал', filters: { quantity_change: 'down' }, sort: ['quantity_change', 'asc'] },
    { key: 'dead', label: 'Нет спроса, большой остаток', filters: { demand: 'without', in_stock: true }, sort: ['stock_value', 'desc'] },
];

const EMPTY_FILTERS = {};

// ── График цены при наведении ───────────────────────────────────────────────
const SPARK_W = 280;
const SPARK_H = 90;

const PriceSparkline = ({ points }) => {
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    const x = (i) => 8 + (i * (SPARK_W - 16)) / Math.max(points.length - 1, 1);
    const y = (price) => 8 + (SPARK_H - 16) * (1 - (price - min) / span);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const first = points[0];
    const trendUp = last.price > first.price;
    const color = last.price === first.price ? '#8c8c8c' : trendUp ? '#cf1322' : '#3f8600';
    return (
        <svg width={SPARK_W} height={SPARK_H} role="img" aria-label="График цены">
            <path d={`${path} L${x(points.length - 1)},${SPARK_H - 4} L${x(0)},${SPARK_H - 4} Z`} fill={color} opacity="0.08" />
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            {points.map((p, i) => (
                <circle key={p.date + i} cx={x(i)} cy={y(p.price)} r={i === points.length - 1 ? 4 : 2.2} fill={color}>
                    <title>{`${p.date}: ${money(p.price)}`}</title>
                </circle>
            ))}
        </svg>
    );
};

const priceHistoryCache = new Map();

const PriceHistoryTip = ({ providerId, configId, row, children }) => {
    const [state, setState] = useState({ loading: false, points: null, error: false });
    const cacheKey = `${providerId}:${configId}:${row.autopart_id}`;

    const load = () => {
        if (priceHistoryCache.has(cacheKey)) {
            setState({ loading: false, points: priceHistoryCache.get(cacheKey), error: false });
            return;
        }
        setState({ loading: true, points: null, error: false });
        getExplorerPriceHistory(providerId, { autopart_id: row.autopart_id, config_id: configId })
            .then(({ data: result }) => {
                priceHistoryCache.set(cacheKey, result.points || []);
                setState({ loading: false, points: result.points || [], error: false });
            })
            .catch(() => setState({ loading: false, points: null, error: true }));
    };

    const { loading, points, error } = state;
    let body;
    if (loading || (!points && !error)) {
        body = <Spin size="small" />;
    } else if (error) {
        body = <Text type="danger">Не удалось загрузить историю цены</Text>;
    } else if (!points.length) {
        body = <Text type="secondary">История цены пока пуста</Text>;
    } else {
        const prices = points.map((p) => p.price);
        body = (
            <div style={{ width: SPARK_W }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.oem_number} · {row.brand_name}</div>
                {points.length > 1 ? <PriceSparkline points={points} /> : (
                    <Text type="secondary">Пока одна точка: {money(points[0].price)}</Text>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{points[0].date}</span>
                    <span>{points[points.length - 1].date}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                    мин. <b>{money(Math.min(...prices))}</b> · макс. <b>{money(Math.max(...prices))}</b>
                    {' '}· точек: {points.length}
                </div>
                <Link
                    style={{ fontSize: 12 }}
                    to={`/autoparts/price-history?oem=${encodeURIComponent(row.oem_number)}`}
                >
                    Подробный график и количество →
                </Link>
            </div>
        );
    }
    return (
        <Tooltip
            color="#fff"
            placement="left"
            mouseEnterDelay={0.3}
            overlayInnerStyle={{ color: 'rgba(0,0,0,0.88)' }}
            title={body}
            onOpenChange={(open) => open && load()}
        >
            <span style={{ cursor: 'help' }}>{children}</span>
        </Tooltip>
    );
};

const ProviderPricelistExplorer = ({ providerId, configs = [] }) => {
    const [pricelists, setPricelists] = useState([]);
    const [configId, setConfigId] = useState(null);
    const [pricelistId, setPricelistId] = useState(null);
    const [brandOptions, setBrandOptions] = useState([]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [activePreset, setActivePreset] = useState(null);
    const [sort, setSort] = useState(['stock_value', 'desc']);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [data, setData] = useState(null);
    const requestSeq = useRef(0);

    // Список загруженных прайсов
    useEffect(() => {
        if (!providerId) return;
        getExplorerPricelists(providerId)
            .then(({ data: list }) => {
                setPricelists(list || []);
                if (list?.length) setConfigId((current) => current ?? list[0].config_id);
            })
            .catch(() => message.error('Не удалось загрузить список прайсов'));
    }, [providerId]);

    const configOptions = useMemo(() => {
        const known = new Map((configs || []).map((c) => [c.id, c.name_price || `Прайс #${c.id}`]));
        const ids = [...new Set(pricelists.map((p) => p.config_id))];
        return ids.map((id) => ({ value: id, label: known.get(id) || `Прайс #${id}` }));
    }, [configs, pricelists]);

    const pricelistOptions = useMemo(
        () => pricelists
            .filter((p) => p.config_id === configId)
            .map((p, i) => ({ value: p.id, label: `${p.date || 'без даты'}${i === 0 ? ' · последний' : ''}` })),
        [pricelists, configId],
    );

    useEffect(() => {
        setPricelistId(null);
        setPage(1);
    }, [configId]);

    const scope = useMemo(
        () => ({ config_id: configId || undefined, pricelist_id: pricelistId || undefined }),
        [configId, pricelistId],
    );

    // Бренды выбранного прайса для фильтра
    useEffect(() => {
        if (!providerId || !configId) return;
        getExplorerBrands(providerId, scope)
            .then(({ data: list }) => setBrandOptions((list || []).map((b) => ({
                value: b.id,
                label: `${b.name} (${b.positions})`,
            }))))
            .catch(() => setBrandOptions([]));
    }, [providerId, configId, scope]);

    const load = useCallback(async () => {
        if (!providerId || !configId) return;
        const seq = ++requestSeq.current;
        setLoading(true);
        try {
            const { data: result } = await getExplorerRows(providerId, {
                ...scope,
                ...filters,
                sort_by: sort[0],
                sort_dir: sort[1],
                limit: pageSize,
                offset: (page - 1) * pageSize,
            });
            if (seq === requestSeq.current) setData(result);
        } catch (err) {
            if (seq === requestSeq.current) {
                message.error(err?.response?.data?.detail || 'Не удалось загрузить позиции прайса');
            }
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, [providerId, configId, scope, filters, sort, page, pageSize]);

    // Небольшая задержка, чтобы не слать запрос на каждую набранную цифру
    useEffect(() => {
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [load]);

    const setFilter = (patch) => {
        setFilters((prev) => ({ ...prev, ...patch }));
        setActivePreset(null);
        setPage(1);
    };

    const applyPreset = (preset) => {
        if (activePreset === preset.key) {
            setFilters(EMPTY_FILTERS);
            setActivePreset(null);
        } else {
            setFilters({ ...preset.filters });
            setSort(preset.sort);
            setActivePreset(preset.key);
        }
        setPage(1);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await exportExplorerRows(providerId, {
                ...scope,
                ...filters,
                sort_by: sort[0],
                sort_dir: sort[1],
            });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pricelist_${providerId}_${data?.pricelist?.date || ''}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            message.error('Не удалось выгрузить в Excel');
        } finally {
            setExporting(false);
        }
    };

    const summary = data?.summary;
    const hasCompare = Boolean(data?.compared_with);

    const columns = [
        {
            title: 'Артикул',
            key: 'oem',
            width: 170,
            sorter: true,
            sortOrder: sort[0] === 'oem' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <span style={{ whiteSpace: 'nowrap' }}>
                    <Link
                        to={`/autoparts/offers?${new URLSearchParams({ oem: row.oem_number, brand: row.brand_name, auto: '1' })}`}
                    >
                        <Text code>{row.oem_number}</Text>
                    </Link>
                    <PartPhotoBadge brand={row.brand_name} oem={row.oem_number} name={row.name} />
                </span>
            ),
        },
        {
            title: 'Бренд / наименование',
            key: 'brand',
            sorter: true,
            sortOrder: sort[0] === 'brand' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <div style={{ minWidth: 160 }}>
                    <div><Text strong>{row.brand_name}</Text></div>
                    <Text type="secondary" ellipsis={{ tooltip: row.name }} style={{ maxWidth: 260, display: 'inline-block' }}>
                        {row.name || '—'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Цена',
            key: 'price',
            align: 'right',
            width: 120,
            sorter: true,
            sortOrder: sort[0] === 'price' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <PriceHistoryTip providerId={providerId} configId={configId} row={row}>
                    <div>{money(row.price)}</div>
                    {hasCompare && row.prev_price != null && (
                        <Text type="secondary" style={{ fontSize: 11 }}>было {money(row.prev_price)}</Text>
                    )}
                </PriceHistoryTip>
            ),
        },
        ...(hasCompare ? [{
            title: 'Δ цены',
            key: 'price_change_pct',
            align: 'right',
            width: 100,
            sorter: true,
            sortOrder: sort[0] === 'price_change_pct' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => {
                if (row.is_new) return <Tag color="blue">новая</Tag>;
                const value = row.price_change_pct;
                if (value === null || value === undefined || Math.abs(value) < 0.05) {
                    return <Text type="secondary">—</Text>;
                }
                const up = value > 0;
                return (
                    <Text type={up ? 'danger' : 'success'} strong={Math.abs(value) >= 10}>
                        {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {pct(value)}
                    </Text>
                );
            },
        }] : []),
        {
            title: 'Остаток',
            key: 'quantity',
            align: 'right',
            width: 110,
            sorter: true,
            sortOrder: sort[0] === 'quantity' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <div>
                    <div>{int(row.quantity)}{row.multiplicity > 1 ? <Text type="secondary" style={{ fontSize: 11 }}> кр.{row.multiplicity}</Text> : null}</div>
                    {hasCompare && row.quantity_change != null && row.quantity_change !== 0 && (
                        <Text type={row.quantity_change > 0 ? 'success' : 'danger'} style={{ fontSize: 11 }}>
                            {row.quantity_change > 0 ? '+' : ''}{row.quantity_change}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Сумма',
            key: 'stock_value',
            align: 'right',
            width: 120,
            sorter: true,
            sortOrder: sort[0] === 'stock_value' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => money(row.stock_value),
        },
        {
            title: <Tooltip title="Проданные нами штуки за 30 / 90 дней">Продано 30/90</Tooltip>,
            key: 'sold_30d',
            align: 'right',
            width: 110,
            sorter: true,
            sortOrder: sort[0] === 'sold_30d' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <Text type={row.sold_qty_90d ? undefined : 'secondary'}>
                    {int(row.sold_qty_30d)} / {int(row.sold_qty_90d)}
                </Text>
            ),
        },
        {
            title: <Tooltip title="Оценка рекомендации из сводки оборота, 0–100">Интерес</Tooltip>,
            key: 'score',
            width: 130,
            sorter: true,
            sortOrder: sort[0] === 'score' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => (
                <Space size={4} wrap>
                    <Text>{Math.round(row.recommendation_score || 0)}</Text>
                    {row.is_top && <Tag color="gold" icon={<RiseOutlined />}>ТОП</Tag>}
                    {row.is_market_opportunity && !row.is_top && <Tag color="blue">рынок</Tag>}
                </Space>
            ),
        },
        {
            title: <Tooltip title="Минимальная цена среди актуальных предложений и цена этой позиции относительно неё">К рынку</Tooltip>,
            key: 'vs_market_pct',
            align: 'right',
            width: 130,
            sorter: true,
            sortOrder: sort[0] === 'vs_market_pct' ? (sort[1] === 'asc' ? 'ascend' : 'descend') : null,
            render: (_, row) => {
                if (row.market_min_price == null) return <Text type="secondary">—</Text>;
                const value = row.vs_market_pct;
                return (
                    <div>
                        <Text type={value > 5 ? 'danger' : value < -5 ? 'success' : undefined}>{pct(value)}</Text>
                        <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                мин. {money(row.market_min_price)}
                            </Text>
                        </div>
                    </div>
                );
            },
        },
    ];

    const onTableChange = (pagination, _filters, sorter) => {
        if (pagination.pageSize !== pageSize) {
            setPageSize(pagination.pageSize);
            setPage(1);
        } else {
            setPage(pagination.current);
        }
        if (sorter?.columnKey && sorter.order) {
            setSort([sorter.columnKey, sorter.order === 'ascend' ? 'asc' : 'desc']);
        }
    };

    const numberInput = (key, placeholder, width = 110) => (
        <InputNumber
            placeholder={placeholder}
            value={filters[key]}
            onChange={(value) => setFilter({ [key]: value ?? undefined })}
            style={{ width }}
        />
    );

    const stat = (title, value, preset, color) => (
        <Col xs={12} sm={8} md={6} lg={4} key={title}>
            <Card
                size="small"
                hoverable={Boolean(preset)}
                onClick={preset ? () => applyPreset(PRESETS.find((p) => p.key === preset)) : undefined}
                style={preset && activePreset === preset ? { borderColor: '#1677ff' } : undefined}
            >
                <Statistic title={title} value={value ?? '—'} valueStyle={{ fontSize: 20, color }} />
            </Card>
        </Col>
    );

    return (
        <Card
            title="Анализ загруженного прайса"
            style={{ marginTop: 16 }}
            extra={(
                <Space wrap>
                    <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
                    <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting} disabled={!data?.total}>
                        Excel
                    </Button>
                </Space>
            )}
        >
            {!pricelists.length ? (
                <Empty description="У поставщика ещё нет загруженных прайсов" />
            ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap>
                        <Select
                            style={{ minWidth: 240 }}
                            value={configId}
                            options={configOptions}
                            onChange={setConfigId}
                            placeholder="Прайс"
                        />
                        <Select
                            style={{ minWidth: 200 }}
                            value={pricelistId ?? data?.pricelist?.id}
                            options={pricelistOptions}
                            onChange={(value) => { setPricelistId(value); setPage(1); }}
                            placeholder="Дата прайса"
                        />
                        {data?.compared_with ? (
                            <Text type="secondary">
                                Сравнение с прайсом от {data.compared_with.date || `#${data.compared_with.id}`}
                            </Text>
                        ) : (
                            <Text type="secondary">Предыдущего прайса для сравнения нет</Text>
                        )}
                    </Space>

                    <Row gutter={[8, 8]}>
                        {stat('Позиций в выборке', summary ? int(summary.positions) : null)}
                        {stat('В наличии', summary ? int(summary.in_stock) : null)}
                        {stat('Сумма остатка', summary ? money(summary.stock_value) : null)}
                        {stat('Средняя цена', summary ? money(summary.avg_price) : null)}
                        {hasCompare && stat('Подорожали', summary ? int(summary.price_up) : null, 'up', '#cf1322')}
                        {hasCompare && stat('Подешевели', summary ? int(summary.price_down) : null, 'down', '#3f8600')}
                        {hasCompare && stat('Новые', summary ? int(summary.new_positions) : null, 'new', '#1677ff')}
                        {hasCompare && stat('Пропали из прайса', summary ? int(summary.removed_positions) : null)}
                        {stat('С продажами за 90 дн.', summary ? int(summary.with_demand) : null)}
                        {stat('ТОП', summary ? int(summary.top_positions) : null, 'top', '#d48806')}
                    </Row>

                    <Space wrap size={[6, 6]}>
                        <FilterOutlined />
                        {PRESETS.filter((p) => hasCompare || !['up', 'down', 'new', 'qtydrop'].includes(p.key)).map((preset) => (
                            <Tag.CheckableTag
                                key={preset.key}
                                checked={activePreset === preset.key}
                                onChange={() => applyPreset(preset)}
                            >
                                {preset.label}
                            </Tag.CheckableTag>
                        ))}
                        {Object.keys(filters).length > 0 && (
                            <Button size="small" type="link" onClick={() => { setFilters(EMPTY_FILTERS); setActivePreset(null); setPage(1); }}>
                                Сбросить фильтры
                            </Button>
                        )}
                    </Space>

                    <Collapse
                        size="small"
                        items={[{
                            key: 'filters',
                            label: 'Фильтры',
                            children: (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                    <Space wrap>
                                        <Input.Search
                                            allowClear
                                            placeholder="Артикул или наименование"
                                            style={{ width: 260 }}
                                            onSearch={(value) => setFilter({ q: value.trim() || undefined })}
                                        />
                                        <Select
                                            mode="multiple"
                                            allowClear
                                            showSearch
                                            optionFilterProp="label"
                                            placeholder="Бренды"
                                            style={{ minWidth: 280 }}
                                            maxTagCount={2}
                                            options={brandOptions}
                                            value={filters.brand_ids || []}
                                            onChange={(value) => setFilter({ brand_ids: value.length ? value : undefined })}
                                        />
                                        <Space size={4}>{numberInput('price_min', 'Цена от')}{numberInput('price_max', 'Цена до')}</Space>
                                        <Space size={4}>{numberInput('qty_min', 'Остаток от')}{numberInput('qty_max', 'Остаток до')}</Space>
                                        <Space size={4}>
                                            <Switch
                                                checked={filters.in_stock === true}
                                                onChange={(checked) => setFilter({ in_stock: checked ? true : undefined })}
                                            />
                                            <Text>Только в наличии</Text>
                                        </Space>
                                    </Space>
                                    {hasCompare && (
                                        <Space wrap>
                                            <Select
                                                allowClear
                                                placeholder="Изменение цены"
                                                style={{ width: 190 }}
                                                value={filters.price_change}
                                                onChange={(value) => setFilter({ price_change: value })}
                                                options={[
                                                    { value: 'up', label: 'Выросла' },
                                                    { value: 'down', label: 'Упала' },
                                                    { value: 'any', label: 'Любое изменение' },
                                                    { value: 'new', label: 'Новая позиция' },
                                                    { value: 'unchanged', label: 'Не менялась' },
                                                ]}
                                            />
                                            {numberInput('price_change_min_pct', 'Не менее, %', 130)}
                                            <Select
                                                allowClear
                                                placeholder="Изменение остатка"
                                                style={{ width: 190 }}
                                                value={filters.quantity_change}
                                                onChange={(value) => setFilter({ quantity_change: value })}
                                                options={[
                                                    { value: 'up', label: 'Вырос' },
                                                    { value: 'down', label: 'Упал' },
                                                    { value: 'appeared', label: 'Появился' },
                                                    { value: 'disappeared', label: 'Закончился' },
                                                ]}
                                            />
                                        </Space>
                                    )}
                                    <Space wrap>
                                        {numberInput('sold_30d_min', 'Продано за 30 дн. от', 170)}
                                        {numberInput('score_min', 'Оценка от (0–100)', 150)}
                                        <Select
                                            allowClear
                                            placeholder="Спрос"
                                            style={{ width: 190 }}
                                            value={filters.demand}
                                            onChange={(value) => setFilter({ demand: value })}
                                            options={[
                                                { value: 'with', label: 'Были продажи (90 дн.)' },
                                                { value: 'without', label: 'Продаж не было' },
                                            ]}
                                        />
                                        <Space size={4}>
                                            {numberInput('vs_market_min_pct', 'К рынку от, %', 130)}
                                            {numberInput('vs_market_max_pct', 'К рынку до, %', 130)}
                                        </Space>
                                        <Space size={4}>
                                            <Switch checked={Boolean(filters.top_only)} onChange={(checked) => setFilter({ top_only: checked || undefined })} />
                                            <Text>Только ТОП</Text>
                                        </Space>
                                        <Space size={4}>
                                            <Switch checked={Boolean(filters.market_only)} onChange={(checked) => setFilter({ market_only: checked || undefined })} />
                                            <Text>Рыночные возможности</Text>
                                        </Space>
                                    </Space>
                                </Space>
                            ),
                        }]}
                    />

                    <Table
                        rowKey="autopart_id"
                        size="small"
                        loading={loading}
                        columns={columns}
                        dataSource={data?.rows || []}
                        onChange={onTableChange}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            current: page,
                            pageSize,
                            total: data?.total || 0,
                            showSizeChanger: true,
                            pageSizeOptions: [25, 50, 100, 200],
                            showTotal: (total) => `Найдено: ${total.toLocaleString('ru-RU')}`,
                        }}
                        locale={{ emptyText: 'По выбранным фильтрам позиций нет' }}
                    />
                </Space>
            )}
        </Card>
    );
};

export default ProviderPricelistExplorer;
