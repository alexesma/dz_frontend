import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Input,
    InputNumber,
    Popconfirm,
    Select,
    Segmented,
    Space,
    Table,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    DownloadOutlined,
    PlusOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    createAutoPurchaseRun,
    createAutoPurchaseTopItem,
    excludeAutoPurchaseTopItem,
    importAutoPurchaseTopItems,
    listAutoPurchaseTopItems,
    listCurrentAutoPurchaseTopItems,
    restoreAutoPurchaseTopItem,
    updateAutoPurchaseTopItem,
} from '../api/orderTracking';
import { getBrands } from '../api/brands';

const { Title, Text } = Typography;

const MODE_OPTIONS = [
    { value: 'draft_only', label: 'Только черновики' },
    { value: 'auto_approve_safe', label: 'Автоподтверждение safe' },
    { value: 'disabled', label: 'Отключено' },
];

const formatQty = (value) => {
    if (value == null) {
        return '—';
    }
    return `${value} шт`;
};

const escapeExcelHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatExcelNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
};

const downloadTextFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const isAutopurchaseRunLockedError = (error) => {
    const statusCode = Number(error?.response?.status || 0);
    const detail = String(error?.response?.data?.detail || '').toLowerCase();
    return statusCode === 409 || detail.includes('уже выполняется расчёт автозаказа');
};

const showAutopurchaseRunLockedMessage = () => {
    message.warning(
        'Сейчас уже идёт расчёт автозаказа. Дождись завершения и попробуй снова.'
    );
};

const AutopurchaseTopPage = () => {
    const navigate = useNavigate();
    const [topSource, setTopSource] = useState('file');
    const [topLimit, setTopLimit] = useState(50);
    const [topDays, setTopDays] = useState(365);
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [brandOptions, setBrandOptions] = useState([]);
    const [brandOptionsLoading, setBrandOptionsLoading] = useState(false);
    const [topPayload, setTopPayload] = useState({ rows: [], total_items: 0 });
    const [topLoading, setTopLoading] = useState(false);
    const [topImportLoading, setTopImportLoading] = useState(false);
    const [topActionLoadingId, setTopActionLoadingId] = useState(null);
    const [createLoading, setCreateLoading] = useState(false);
    const [topDrafts, setTopDrafts] = useState({});
    const [filters, setFilters] = useState({
        mode: 'draft_only',
        budget_limit: null,
        position_limit: null,
    });
    const [newTopItem, setNewTopItem] = useState({
        oem_number: '',
        brand_name: '',
        autopart_name: '',
        sold_qty: null,
        target_stock_qty: null,
    });

    const fetchTopItems = useCallback(async () => {
        setTopLoading(true);
        try {
            const normalizedBrand = selectedBrands.length
                ? selectedBrands.join(',')
                : undefined;
            const request = topSource === 'current'
                ? listCurrentAutoPurchaseTopItems({
                    limit: topLimit,
                    days: topDays,
                    brand: normalizedBrand,
                })
                : listAutoPurchaseTopItems({
                    source: 'file',
                    limit: topLimit,
                    active_only: true,
                    brand: normalizedBrand,
                });
            const { data } = await request;
            const rows = Array.isArray(data?.rows) ? data.rows : [];
            setTopPayload({ ...(data || {}), rows });
            setTopDrafts(
                rows.reduce((acc, row) => ({
                    ...acc,
                    [row.id]: {
                        target_stock_qty: row.target_stock_qty,
                        sold_qty: row.sold_qty,
                        note: row.note,
                    },
                }), {})
            );
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить топ-позиции');
        } finally {
            setTopLoading(false);
        }
    }, [selectedBrands, topDays, topLimit, topSource]);

    useEffect(() => {
        let mounted = true;
        const loadBrands = async () => {
            setBrandOptionsLoading(true);
            try {
                const { data } = await getBrands();
                const rows = Array.isArray(data) ? data : [];
                const prepared = rows.map((item) => ({
                    ...item,
                    main_brand: Boolean(item?.main_brand),
                }));
                const hasMainBrands = prepared.some((item) => item.main_brand);
                const options = prepared
                    .filter((item) => (hasMainBrands ? item.main_brand : true))
                    .map((item) => String(item?.name || '').trim())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b, 'ru'))
                    .map((name) => ({ value: name, label: name }));
                if (mounted) {
                    setBrandOptions(options);
                }
            } catch {
                if (mounted) {
                    message.error('Не удалось загрузить справочник брендов');
                }
            } finally {
                if (mounted) {
                    setBrandOptionsLoading(false);
                }
            }
        };
        void loadBrands();
        return () => {
            mounted = false;
        };
    }, []);

    const selectedBrandFilterLabel = useMemo(
        () => (selectedBrands.length ? selectedBrands.join(', ') : 'Все бренды'),
        [selectedBrands]
    );

    useEffect(() => {
        void fetchTopItems();
    }, [fetchTopItems]);

    const handleCreateTopRun = async () => {
        setCreateLoading(true);
        try {
            const { data } = await createAutoPurchaseRun({
                mode: filters.mode,
                limit: topLimit,
                budget_limit: filters.budget_limit || undefined,
                position_limit: filters.position_limit || undefined,
                top_source: topSource,
                top_limit: topLimit,
                top_days: topSource === 'current' ? topDays : undefined,
                top_brand: selectedBrands.length
                    ? selectedBrands.join(',')
                    : undefined,
            });
            message.success(`Запуск автозаказа по топ-${topLimit} создан`);
            navigate('/orders/autopurchase', {
                state: { selectedRunId: data?.id || null },
            });
        } catch (error) {
            if (isAutopurchaseRunLockedError(error)) {
                showAutopurchaseRunLockedMessage();
            } else {
                const detail = error?.response?.data?.detail;
                message.error(detail || 'Не удалось создать запуск по топу');
            }
        } finally {
            setCreateLoading(false);
        }
    };

    const handleImportTopFile = async (file) => {
        setTopImportLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await importAutoPurchaseTopItems(
                formData,
                { source: 'file' }
            );
            message.success(
                `Импортировано: ${data?.imported_count || 0}, обновлено: ${data?.updated_count || 0}`
            );
            await fetchTopItems();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось импортировать топ-позиции');
        } finally {
            setTopImportLoading(false);
        }
        return false;
    };

    const handleCreateTopItem = async () => {
        const oem = String(newTopItem.oem_number || '').trim();
        if (!oem) {
            message.warning('Укажи OEM/артикул');
            return;
        }
        setTopActionLoadingId('new');
        try {
            await createAutoPurchaseTopItem({
                source: 'file',
                ...newTopItem,
                sold_qty: Number(newTopItem.sold_qty || 0),
                target_stock_qty: Number(newTopItem.target_stock_qty || 0),
            });
            message.success('Позиция добавлена в топ');
            setNewTopItem({
                oem_number: '',
                brand_name: '',
                autopart_name: '',
                sold_qty: null,
                target_stock_qty: null,
            });
            await fetchTopItems();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось добавить позицию в топ');
        } finally {
            setTopActionLoadingId(null);
        }
    };

    const handleSaveTopItem = async (row) => {
        if (!row?.id || row.id < 0) {
            return;
        }
        setTopActionLoadingId(row.id);
        try {
            await updateAutoPurchaseTopItem(row.id, topDrafts[row.id] || {});
            message.success('Топ-позиция обновлена');
            await fetchTopItems();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось обновить топ-позицию');
        } finally {
            setTopActionLoadingId(null);
        }
    };

    const buildExclusionPayload = (row) => ({
        autopart_id: row?.autopart_id || undefined,
        oem_number: row?.oem_number || '',
        brand_name: row?.brand_name || null,
        autopart_name: row?.autopart_name || null,
        reason: 'Исключено вручную на странице топ-позиций',
    });

    const handleExcludeTopItem = async (row) => {
        setTopActionLoadingId(row.id);
        try {
            await excludeAutoPurchaseTopItem(buildExclusionPayload(row));
            message.success('Позиция исключена из автозаказа');
            await fetchTopItems();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось исключить позицию из автозаказа');
        } finally {
            setTopActionLoadingId(null);
        }
    };

    const handleRestoreTopItem = async (row) => {
        setTopActionLoadingId(row.id);
        try {
            await restoreAutoPurchaseTopItem(buildExclusionPayload(row));
            message.success('Позиция возвращена в автозаказ');
            await fetchTopItems();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось вернуть позицию в автозаказ');
        } finally {
            setTopActionLoadingId(null);
        }
    };

    const handleExportTopItems = () => {
        const rows = Array.isArray(topPayload.rows) ? topPayload.rows : [];
        if (!rows.length) {
            message.info('Нет строк для выгрузки');
            return;
        }

        const generatedAt = new Date();
        const sourceLabel = topSource === 'current'
            ? `Текущий топ за ${topDays} дней`
            : 'Файл / ручной список';
        const filterLabel = selectedBrandFilterLabel;
        const title = `Топ-${topLimit} позиции для автозаказа`;
        const filename = `autopurchase_top_${topSource}_${topLimit}_${generatedAt
            .toISOString()
            .slice(0, 16)
            .replace(/[-:T]/g, '')}.xls`;

        const header = [
            '#',
            'Статус',
            'Бренд',
            'Артикул / OEM',
            'Наименование',
            'Продано',
            'Цель остатка',
            'Текущий остаток',
            'Провал',
            'Заметка',
        ];
        const tableRows = rows.map((row) => [
            row.rank || '',
            row.excluded_from_autopurchase ? 'Исключена из автозаказа' : 'Активна',
            row.brand_name || '',
            row.oem_number || '',
            row.autopart_name || '',
            formatExcelNumber(row.sold_qty),
            formatExcelNumber(row.target_stock_qty),
            formatExcelNumber(row.current_quantity),
            formatExcelNumber(row.gap_qty),
            row.note || '',
        ]);
        const htmlRows = [header, ...tableRows]
            .map((cells, rowIndex) => {
                const tag = rowIndex === 0 ? 'th' : 'td';
                return `<tr>${cells.map((cell, cellIndex) => {
                    const className = cellIndex >= 5 && cellIndex <= 8
                        ? ' class="num"'
                        : '';
                    return `<${tag}${className}>${escapeExcelHtml(cell)}</${tag}>`;
                }).join('')}</tr>`;
            })
            .join('');

        const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
body { font-family: Arial, sans-serif; color: #172033; }
.title { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.meta { color: #526070; margin-bottom: 14px; }
table { border-collapse: collapse; width: 100%; }
th { background: #17324d; color: #fff; font-weight: 700; text-align: left; }
th, td { border: 1px solid #c8d3df; padding: 8px 10px; vertical-align: top; }
tr:nth-child(even) td { background: #f6f9fc; }
.num { text-align: right; }
</style>
</head>
<body>
<div class="title">${escapeExcelHtml(title)}</div>
<div class="meta">
Источник: ${escapeExcelHtml(sourceLabel)} · Бренд: ${escapeExcelHtml(filterLabel)} ·
Сформировано: ${escapeExcelHtml(generatedAt.toLocaleString('ru-RU'))}
</div>
<table>${htmlRows}</table>
</body>
</html>`;

        downloadTextFile(
            html,
            filename,
            'application/vnd.ms-excel;charset=utf-8'
        );
    };

    const columns = [
            {
                title: '#',
                dataIndex: 'rank',
                width: 64,
                render: (value) => <Text strong>{value || '—'}</Text>,
            },
            {
                title: 'Позиция',
                key: 'position',
                render: (_, row) => (
                    <Space direction="vertical" size={0}>
                        <Text strong>{row.brand_name || '—'} {row.oem_number}</Text>
                        <Text type="secondary">{row.autopart_name || '—'}</Text>
                        {row.excluded_from_autopurchase ? (
                            <Tag color="volcano">
                                Исключена из автозаказа
                            </Tag>
                        ) : null}
                    </Space>
                ),
            },
            {
                title: 'Продано',
                dataIndex: 'sold_qty',
                width: 110,
                render: (value, row) => (
                    topSource === 'file' && row.id > 0 ? (
                        <InputNumber
                            min={0}
                            value={topDrafts[row.id]?.sold_qty ?? value}
                            style={{ width: 90 }}
                            onChange={(nextValue) => {
                                setTopDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                        ...(prev[row.id] || {}),
                                        sold_qty: Number(nextValue || 0),
                                    },
                                }));
                            }}
                        />
                    ) : <Text>{formatQty(value)}</Text>
                ),
            },
            {
                title: 'Цель',
                dataIndex: 'target_stock_qty',
                width: 120,
                render: (value, row) => (
                    topSource === 'file' && row.id > 0 ? (
                        <InputNumber
                            min={0}
                            value={topDrafts[row.id]?.target_stock_qty ?? value}
                            style={{ width: 96 }}
                            onChange={(nextValue) => {
                                setTopDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                        ...(prev[row.id] || {}),
                                        target_stock_qty: Number(nextValue || 0),
                                    },
                                }));
                            }}
                        />
                    ) : <Text>{formatQty(value)}</Text>
                ),
            },
            {
                title: 'Остаток',
                dataIndex: 'current_quantity',
                width: 110,
                render: (value) => formatQty(value),
            },
            {
                title: 'Провал',
                dataIndex: 'gap_qty',
                width: 110,
                render: (value) => (
                    <Tag color={Number(value || 0) > 0 ? 'red' : 'green'}>
                        {formatQty(value)}
                    </Tag>
                ),
            },
            {
                title: 'Действия',
                key: 'actions',
                width: 220,
                render: (_, row) => (
                    <Space wrap>
                        {topSource === 'file' && row.id > 0 ? (
                            <Button
                                size="small"
                                loading={topActionLoadingId === row.id}
                                onClick={() => {
                                    void handleSaveTopItem(row);
                                }}
                            >
                                Сохранить
                            </Button>
                        ) : null}
                        {row.excluded_from_autopurchase ? (
                            <Popconfirm
                                title="Вернуть позицию в автозаказ?"
                                onConfirm={() => {
                                    void handleRestoreTopItem(row);
                                }}
                            >
                                <Button size="small">Вернуть</Button>
                            </Popconfirm>
                        ) : (
                            <Popconfirm
                                title="Исключить позицию из автозаказа?"
                                description="Она останется в списке, но расчёт автозаказа будет её пропускать."
                                onConfirm={() => {
                                    void handleExcludeTopItem(row);
                                }}
                            >
                                <Button size="small" danger>Исключить</Button>
                            </Popconfirm>
                        )}
                    </Space>
                ),
            },
        ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
                <Title level={2} style={{ marginBottom: 4 }}>
                    Топ-позиции для автозаказа
                </Title>
                <Text type="secondary">
                    Большой список из файла сохраняется в базе и будет использоваться
                    в следующие дни, пока позиции активны. Количество к заказу идёт
                    от редактируемой цели остатка, а не слепо от прошлогодних продаж.
                </Text>
            </div>

            <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space wrap>
                            <Segmented
                                value={topSource}
                                options={[
                                    { value: 'file', label: 'Файл / ручной' },
                                    { value: 'current', label: 'Текущий топ' },
                                ]}
                                onChange={(value) => setTopSource(String(value))}
                            />
                            <Segmented
                                value={topLimit}
                                options={[50, 100, 200, 300].map((value) => ({
                                    value,
                                    label: `Топ ${value}`,
                                }))}
                                onChange={(value) => setTopLimit(Number(value))}
                            />
                            {topSource === 'current' ? (
                                <Select
                                    value={topDays}
                                    style={{ width: 160 }}
                                    options={[
                                        { value: 90, label: '90 дней' },
                                        { value: 180, label: '180 дней' },
                                        { value: 365, label: '365 дней' },
                                    ]}
                                    onChange={(value) => setTopDays(Number(value))}
                                />
                            ) : null}
                            <Select
                                mode="multiple"
                                allowClear
                                showSearch
                                loading={brandOptionsLoading}
                                placeholder="Выберите бренды"
                                value={selectedBrands}
                                style={{ minWidth: 300 }}
                                maxTagCount="responsive"
                                options={brandOptions}
                                optionFilterProp="label"
                                filterOption={(inputValue, option) =>
                                    String(option?.label || '')
                                        .toLowerCase()
                                        .includes(inputValue.toLowerCase())
                                }
                                onChange={(values) => {
                                    setSelectedBrands(values);
                                }}
                            />
                        </Space>
                        <Space wrap>
                            {topSource === 'file' ? (
                                <Upload
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        void handleImportTopFile(file);
                                        return false;
                                    }}
                                    accept=".xlsx,.xls,.csv"
                                >
                                    <Button
                                        icon={<UploadOutlined />}
                                        loading={topImportLoading}
                                    >
                                        Импорт CSV/XLSX
                                    </Button>
                                </Upload>
                            ) : null}
                            <Button
                                icon={<ReloadOutlined />}
                                loading={topLoading}
                                onClick={() => {
                                    void fetchTopItems();
                                }}
                            >
                                Обновить
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                disabled={topLoading || !(topPayload.rows || []).length}
                                onClick={handleExportTopItems}
                            >
                                Скачать Excel
                            </Button>
                        </Space>
                    </Space>

                    {topSource === 'file' ? (
                        <Space wrap>
                            <Input
                                placeholder="OEM / артикул"
                                value={newTopItem.oem_number}
                                style={{ width: 170 }}
                                onChange={(event) => setNewTopItem((prev) => ({
                                    ...prev,
                                    oem_number: event.target.value,
                                }))}
                            />
                            <Input
                                placeholder="Бренд"
                                value={newTopItem.brand_name}
                                style={{ width: 140 }}
                                onChange={(event) => setNewTopItem((prev) => ({
                                    ...prev,
                                    brand_name: event.target.value,
                                }))}
                            />
                            <Input
                                placeholder="Название"
                                value={newTopItem.autopart_name}
                                style={{ width: 260 }}
                                onChange={(event) => setNewTopItem((prev) => ({
                                    ...prev,
                                    autopart_name: event.target.value,
                                }))}
                            />
                            <InputNumber
                                min={0}
                                placeholder="Продано"
                                value={newTopItem.sold_qty}
                                style={{ width: 120 }}
                                onChange={(value) => setNewTopItem((prev) => ({
                                    ...prev,
                                    sold_qty: value,
                                }))}
                            />
                            <InputNumber
                                min={0}
                                placeholder="Цель остатка"
                                value={newTopItem.target_stock_qty}
                                style={{ width: 140 }}
                                onChange={(value) => setNewTopItem((prev) => ({
                                    ...prev,
                                    target_stock_qty: value,
                                }))}
                            />
                            <Button
                                icon={<PlusOutlined />}
                                loading={topActionLoadingId === 'new'}
                                onClick={() => {
                                    void handleCreateTopItem();
                                }}
                            >
                                Добавить
                            </Button>
                        </Space>
                    ) : null}

                    <Alert
                        type="info"
                        showIcon
                        message="Как считается количество к заказу"
                        description={
                            topSource === 'file'
                                ? 'Для файла используется редактируемая цель остатка. Автозаказ поднимет свою стандартную цель до этой цифры и закажет только дефицит с учётом текущего остатка и пути.'
                                : 'Текущий топ считается по клиентским заказам. Цель остатка берётся как примерное покрытие на 45 дней по спросу выбранного периода.'
                        }
                    />

                    <Space wrap>
                        <Select
                            value={filters.mode}
                            options={MODE_OPTIONS}
                            style={{ width: 220 }}
                            onChange={(value) => {
                                setFilters((prev) => ({ ...prev, mode: value }));
                            }}
                        />
                        <InputNumber
                            min={1}
                            value={filters.budget_limit}
                            placeholder="Лимит суммы, руб."
                            style={{ width: 180 }}
                            onChange={(value) => {
                                setFilters((prev) => ({
                                    ...prev,
                                    budget_limit: value == null ? null : Number(value),
                                }));
                            }}
                        />
                        <InputNumber
                            min={1}
                            value={filters.position_limit}
                            placeholder="Лимит позиций"
                            style={{ width: 160 }}
                            onChange={(value) => {
                                setFilters((prev) => ({
                                    ...prev,
                                    position_limit: value == null ? null : Number(value),
                                }));
                            }}
                        />
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            loading={createLoading}
                            onClick={handleCreateTopRun}
                        >
                            Запустить автозаказ по топ-{topLimit}
                        </Button>
                    </Space>

                    <Table
                        size="small"
                        rowKey="id"
                        loading={topLoading}
                        columns={columns}
                        dataSource={topPayload.rows || []}
                        pagination={false}
                        scroll={{ x: 900 }}
                    />
                </Space>
            </Card>
        </Space>
    );
};

export default AutopurchaseTopPage;
