import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    DatePicker,
    Form,
    Progress,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    FilterOutlined,
    LineChartOutlined,
    ReloadOutlined,
    ExportOutlined,
    EyeOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { searchAutopartsByOem } from '../api/autoparts';
import {
    exportShipmentProfitReport,
    getShipmentProfitReport,
} from '../api/inventory';
import { getCustomers } from '../api/customers';
import { getAllProviders } from '../api/providers';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const PERIOD_OPTIONS = [
    { value: 'month', label: 'По месяцам' },
    { value: 'day', label: 'По дням' },
    { value: 'all', label: 'Без периода' },
];

const GROUPING_OPTIONS = [
    { value: 'customer', label: 'По клиентам' },
    { value: 'provider', label: 'По поставщикам' },
    { value: 'brand', label: 'По брендам' },
    { value: 'autopart', label: 'По позициям' },
];

const money = (value) => (
    value != null
        ? Number(value).toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
        : '—'
);

const integer = (value) => Number(value || 0).toLocaleString('ru-RU');

const formatPeriod = (value, period) => {
    if (!value || period === 'all') return 'Весь период';
    const dt = dayjs(value);
    if (!dt.isValid()) return '—';
    if (period === 'day') return dt.format('DD.MM.YYYY');
    return dt.format('MM.YYYY');
};

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const extractDownloadFilename = (headerValue, fallback) => {
    if (!headerValue) return fallback;
    const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        return decodeURIComponent(utf8Match[1]);
    }
    const plainMatch = headerValue.match(/filename="?([^"]+)"?/i);
    return plainMatch?.[1] || fallback;
};

const buildDrilldownRange = (row, filters) => {
    if (filters.period === 'day' && row.period_start) {
        const day = dayjs(row.period_start);
        return {
            from: day.startOf('day'),
            to: day.endOf('day'),
        };
    }
    if (filters.period === 'month' && row.period_start) {
        const month = dayjs(row.period_start);
        return {
            from: month.startOf('month'),
            to: month.endOf('month'),
        };
    }
    if (Array.isArray(filters.date_range) && filters.date_range.length === 2) {
        return {
            from: dayjs(filters.date_range[0]).startOf('day'),
            to: dayjs(filters.date_range[1]).endOf('day'),
        };
    }
    return { from: null, to: null };
};

const ShipmentProfitReportPage = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [filters, setFilters] = useState({
        period: 'month',
        grouping: ['provider', 'autopart'],
    });
    const [providerOptions, setProviderOptions] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [autopartOptions, setAutopartOptions] = useState([]);
    const [searchingAutopart, setSearchingAutopart] = useState(false);
    const searchTimer = useRef(null);

    useEffect(() => {
        form.setFieldsValue({
            period: 'month',
            grouping: ['provider', 'autopart'],
        });
        Promise.all([
            getAllProviders({ page_size: 100 }),
            getCustomers({ page_size: 200 }),
        ])
            .then(([providers, customersResponse]) => {
                setProviderOptions(
                    (providers || []).map((provider) => ({
                        value: provider.id,
                        label: provider.name,
                    }))
                );
                const customers = customersResponse?.data?.items || customersResponse?.data || [];
                setCustomerOptions(
                    (customers || []).map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                    }))
                );
            })
            .catch(() => {});
    }, [form]);

    const buildReportParams = useCallback((nextFilters) => {
        const grouping = nextFilters.grouping || [];
        const dateRange = nextFilters.date_range || [];
        return {
            period: nextFilters.period || 'month',
            group_by_customer: grouping.includes('customer'),
            group_by_provider: grouping.includes('provider'),
            group_by_brand: grouping.includes('brand'),
            group_by_autopart: grouping.includes('autopart'),
            customer_id: nextFilters.customer_id || undefined,
            provider_id: nextFilters.provider_id || undefined,
            autopart_id: nextFilters.autopart_id || undefined,
            date_from: dateRange[0]
                ? dayjs(dateRange[0]).startOf('day').toISOString()
                : undefined,
            date_to: dateRange[1]
                ? dayjs(dateRange[1]).endOf('day').toISOString()
                : undefined,
        };
    }, []);

    const fetchReport = useCallback(async (nextFilters = filters) => {
        setLoading(true);
        try {
            const params = buildReportParams(nextFilters);
            const response = await getShipmentProfitReport(params);
            setRows(response.data || []);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось загрузить отчёт по прибыли'
            );
        } finally {
            setLoading(false);
        }
    }, [buildReportParams, filters]);

    useEffect(() => {
        fetchReport(filters);
    }, [fetchReport, filters]);

    const handleAutopartSearch = (query) => {
        clearTimeout(searchTimer.current);
        if (!query || query.length < 2) {
            setAutopartOptions([]);
            return;
        }
        searchTimer.current = setTimeout(async () => {
            setSearchingAutopart(true);
            try {
                const response = await searchAutopartsByOem(query, 30);
                setAutopartOptions(
                    (response.data || []).map((part) => ({
                        value: part.id,
                        label: `${part.oem_number} — ${part.name}${part.brand_name ? ` [${part.brand_name}]` : ''}`,
                    }))
                );
            } catch {
                setAutopartOptions([]);
            } finally {
                setSearchingAutopart(false);
            }
        }, 250);
    };

    const applyFilters = () => {
        const values = form.getFieldsValue();
        const nextFilters = {
            period: values.period || 'month',
            grouping: values.grouping?.length ? values.grouping : [],
            customer_id: values.customer_id || undefined,
            provider_id: values.provider_id || undefined,
            autopart_id: values.autopart_id || undefined,
            date_range: values.date_range || undefined,
        };
        setFilters(nextFilters);
    };

    const resetFilters = () => {
        const nextFilters = {
            period: 'month',
            grouping: ['provider', 'autopart'],
        };
        form.setFieldsValue({
            period: 'month',
            grouping: ['provider', 'autopart'],
            customer_id: undefined,
            provider_id: undefined,
            autopart_id: undefined,
            date_range: undefined,
        });
        setAutopartOptions([]);
        setFilters(nextFilters);
    };

    const handleExportCsv = () => {
        const headers = [
            'Период',
            'Клиент',
            'Поставщик',
            'Бренд',
            'Позиция OEM',
            'Наименование',
            'Количество',
            'Выручка',
            'Себестоимость',
            'Валовая прибыль',
            'Маржа %',
            'Оценено, шт',
            'Неоценено, шт',
        ];
        const body = rows.map((row) => [
            formatPeriod(row.period_start, filters.period),
            row.customer_name || (row.customer_id == null ? '' : 'Не определён'),
            row.provider_name || (row.provider_id == null ? 'Не определён' : ''),
            row.brand_name || '',
            row.autopart_oem || '',
            row.autopart_name || '',
            row.autopart_brand || row.brand_name || '',
            row.quantity ?? 0,
            row.revenue_total ?? '',
            row.cost_total ?? '',
            row.gross_profit ?? '',
            row.margin_percent ?? '',
            row.costed_quantity ?? 0,
            row.uncosted_quantity ?? 0,
        ].map(csvCell).join(';'));
        const content = `\ufeff${headers.map(csvCell).join(';')}\n${body.join('\n')}`;
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shipment_profit_report_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const response = await exportShipmentProfitReport(buildReportParams(filters));
            const filename = extractDownloadFilename(
                response.headers?.['content-disposition'],
                `shipment_profit_report_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
            );
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось выгрузить Excel-отчёт'
            );
        } finally {
            setExportingExcel(false);
        }
    };

    const handleOpenShipments = (row) => {
        const params = new URLSearchParams();
        params.set('status', 'posted');
        if (filters.customer_id) {
            params.set('customer_id', String(filters.customer_id));
        } else if (row.customer_id != null) {
            params.set('customer_id', String(row.customer_id));
        }
        if (row.autopart_id != null) {
            params.set('autopart_id', String(row.autopart_id));
        }
        if (row.provider_id != null) {
            params.set('provider_id', String(row.provider_id));
        }
        const range = buildDrilldownRange(row, filters);
        if (range.from) {
            params.set('posted_from', range.from.toISOString());
        }
        if (range.to) {
            params.set('posted_to', range.to.toISOString());
        }
        navigate(`/warehouse/shipments?${params.toString()}`);
    };

    const summary = useMemo(() => {
        const totals = rows.reduce((acc, row) => {
            const quantity = Number(row.quantity || 0);
            const costedQuantity = Number(row.costed_quantity || 0);
            const uncostedQuantity = Number(row.uncosted_quantity || 0);
            const revenueTotal = Number(row.revenue_total || 0);
            const costTotal = Number(row.cost_total || 0);
            const confirmedGrossProfit = row.gross_profit != null
                ? Number(row.gross_profit)
                : 0;

            acc.quantity += quantity;
            acc.costedQuantity += costedQuantity;
            acc.uncostedQuantity += uncostedQuantity;
            acc.revenueTotal += revenueTotal;
            acc.costTotal += costTotal;
            acc.confirmedGrossProfit += confirmedGrossProfit;
            if (uncostedQuantity > 0) {
                acc.rowsWithGaps += 1;
            }
            return acc;
        }, {
            quantity: 0,
            costedQuantity: 0,
            uncostedQuantity: 0,
            revenueTotal: 0,
            costTotal: 0,
            confirmedGrossProfit: 0,
            rowsWithGaps: 0,
        });

        totals.coveragePercent = totals.quantity > 0
            ? Math.round((totals.costedQuantity / totals.quantity) * 100)
            : 100;
        return totals;
    }, [rows]);

    const columns = [
        {
            title: 'Период',
            dataIndex: 'period_start',
            width: 130,
            render: (value) => formatPeriod(value, filters.period),
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            width: 220,
            render: (value) => {
                if (!filters.grouping?.includes('customer')) {
                    if (filters.customer_id) {
                        return value || <Text type="secondary">Выбранный клиент</Text>;
                    }
                    return <Text type="secondary">Все клиенты</Text>;
                }
                return value || <Text type="secondary">—</Text>;
            },
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            width: 220,
            render: (value, row) => {
                if (!filters.grouping?.includes('provider')) {
                    return <Text type="secondary">Все поставщики</Text>;
                }
                if (row.provider_id == null) {
                    return (
                        <Tag color="warning" icon={<WarningOutlined />}>
                            Не определён
                        </Tag>
                    );
                }
                return value || <Text type="secondary">—</Text>;
            },
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            width: 180,
            render: (value, row) => {
                if (!filters.grouping?.includes('brand')) {
                    if (filters.grouping?.includes('autopart')) {
                        return row.autopart_brand || <Text type="secondary">—</Text>;
                    }
                    return <Text type="secondary">Все бренды</Text>;
                }
                return value || row.autopart_brand || <Text type="secondary">—</Text>;
            },
        },
        {
            title: 'Позиция',
            width: 320,
            render: (_, row) => {
                if (!filters.grouping?.includes('autopart')) {
                    return <Text type="secondary">Все позиции</Text>;
                }
                return (
                    <Space direction="vertical" size={0}>
                        <Text strong>{row.autopart_oem || '—'}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {row.autopart_name || 'Без названия'}
                            {row.autopart_brand ? ` · ${row.autopart_brand}` : ''}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 110,
            align: 'right',
            render: (value) => integer(value),
            sorter: (a, b) => Number(a.quantity || 0) - Number(b.quantity || 0),
        },
        {
            title: 'Выручка, ₽',
            dataIndex: 'revenue_total',
            width: 140,
            align: 'right',
            render: (value) => money(value),
            sorter: (a, b) => Number(a.revenue_total || 0) - Number(b.revenue_total || 0),
        },
        {
            title: 'Себестоимость, ₽',
            dataIndex: 'cost_total',
            width: 150,
            align: 'right',
            render: (value, row) => (
                <Space direction="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
                    <Text>{money(value)}</Text>
                    {Number(row.uncosted_quantity || 0) > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            не всё оценено
                        </Text>
                    )}
                </Space>
            ),
            sorter: (a, b) => Number(a.cost_total || 0) - Number(b.cost_total || 0),
        },
        {
            title: 'Валовая прибыль',
            dataIndex: 'gross_profit',
            width: 160,
            align: 'right',
            render: (value, row) => {
                if (Number(row.uncosted_quantity || 0) > 0) {
                    return <Tag color="warning">Ждёт полной себестоимости</Tag>;
                }
                const numeric = Number(value || 0);
                const color = numeric >= 0 ? 'success' : 'error';
                return <Tag color={color}>{money(value)}</Tag>;
            },
            sorter: (a, b) => Number(a.gross_profit || 0) - Number(b.gross_profit || 0),
        },
        {
            title: 'Маржа',
            dataIndex: 'margin_percent',
            width: 120,
            align: 'right',
            render: (value, row) => {
                if (Number(row.uncosted_quantity || 0) > 0 || value == null) {
                    return <Text type="secondary">—</Text>;
                }
                const numeric = Number(value || 0);
                const color = numeric >= 25 ? '#389e0d' : numeric >= 10 ? '#d48806' : '#cf1322';
                return <Text style={{ color }}>{money(value)}%</Text>;
            },
            sorter: (a, b) => Number(a.margin_percent || 0) - Number(b.margin_percent || 0),
        },
        {
            title: 'Покрытие себестоимостью',
            width: 190,
            render: (_, row) => {
                const quantity = Number(row.quantity || 0);
                const costedQuantity = Number(row.costed_quantity || 0);
                const percent = quantity > 0 ? Math.round((costedQuantity / quantity) * 100) : 100;
                return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Text style={{ fontSize: 12 }}>
                            {integer(costedQuantity)} / {integer(quantity)}
                        </Text>
                        <Progress
                            percent={percent}
                            size="small"
                            status={percent === 100 ? 'success' : 'active'}
                            showInfo={false}
                        />
                    </Space>
                );
            },
            sorter: (a, b) => Number(a.costed_quantity || 0) - Number(b.costed_quantity || 0),
        },
        {
            title: '',
            key: 'actions',
            width: 120,
            render: (_, row) => (
                <Tooltip title="Показать отгрузки этой строки отчёта">
                    <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => handleOpenShipments(row)}
                    >
                        Отгрузки
                    </Button>
                </Tooltip>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Space align="center">
                        <LineChartOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Валовая прибыль по отгрузкам</Title>
                            <Text type="secondary">
                                Выручка, себестоимость FIFO и рентабельность по периоду, клиенту, поставщику, бренду и позиции
                            </Text>
                        </div>
                    </Space>
                </Col>
                <Col>
                    <Button icon={<ReloadOutlined />} onClick={() => fetchReport(filters)}>
                        Обновить
                    </Button>
                    <Button style={{ marginLeft: 8 }} icon={<ExportOutlined />} onClick={handleExportCsv}>
                        CSV
                    </Button>
                    <Button
                        style={{ marginLeft: 8 }}
                        icon={<ExportOutlined />}
                        loading={exportingExcel}
                        onClick={handleExportExcel}
                    >
                        Excel
                    </Button>
                </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small">
                        <Statistic title="Выручка" value={summary.revenueTotal} precision={2} suffix="₽" />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small">
                        <Statistic title="Известная себестоимость" value={summary.costTotal} precision={2} suffix="₽" />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small">
                        <Statistic
                            title="Валовая прибыль по полностью оценённым строкам"
                            value={summary.confirmedGrossProfit}
                            precision={2}
                            suffix="₽"
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small">
                        <Statistic title="Покрытие себестоимостью" value={summary.coveragePercent} suffix="%" />
                    </Card>
                </Col>
            </Row>

            {summary.uncostedQuantity > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Часть отгрузок ещё без полной себестоимости"
                    description={`Неоценённое количество: ${integer(summary.uncostedQuantity)} шт. Прибыль по таким строкам пока не считается окончательной.`}
                />
            )}

            <Card style={{ marginBottom: 16 }}>
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        period: 'month',
                        grouping: ['provider', 'autopart'],
                    }}
                >
                    <Row gutter={16}>
                        <Col xs={24} md={8} lg={5}>
                            <Form.Item name="period" label="Период агрегации">
                                <Select options={PERIOD_OPTIONS} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={16} lg={7}>
                            <Form.Item name="date_range" label="Диапазон дат">
                                <RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12} lg={6}>
                            <Form.Item name="customer_id" label="Клиент">
                                <Select
                                    allowClear
                                    showSearch
                                    placeholder="Все клиенты"
                                    options={customerOptions}
                                    optionFilterProp="label"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12} lg={6}>
                            <Form.Item name="provider_id" label="Поставщик">
                                <Select
                                    allowClear
                                    showSearch
                                    placeholder="Все поставщики"
                                    options={providerOptions}
                                    filterOption={(input, option) => (
                                        (option?.label || '').toLowerCase().includes(input.toLowerCase())
                                    )}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12} lg={6}>
                            <Form.Item name="autopart_id" label="Позиция">
                                <Select
                                    allowClear
                                    showSearch
                                    placeholder="Все позиции"
                                    options={autopartOptions}
                                    onSearch={handleAutopartSearch}
                                    filterOption={false}
                                    loading={searchingAutopart}
                                    notFoundContent={searchingAutopart ? 'Поиск...' : 'Ничего не найдено'}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16} align="middle">
                        <Col xs={24} lg={12}>
                            <Form.Item name="grouping" label="Разбивка" style={{ marginBottom: 12 }}>
                                <Checkbox.Group options={GROUPING_OPTIONS} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                                <Button icon={<ReloadOutlined />} onClick={resetFilters}>
                                    Сбросить
                                </Button>
                                <Button type="primary" icon={<FilterOutlined />} onClick={applyFilters}>
                                    Применить
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </Form>
            </Card>

            <Card>
                <Table
                    rowKey={(row) => [
                        row.period_start || 'all',
                        row.customer_id ?? 'customer-all',
                        row.provider_id ?? 'provider-all',
                        row.brand_id ?? 'brand-all',
                        row.autopart_id ?? 'autopart-all',
                    ].join(':')}
                    loading={loading}
                    dataSource={rows}
                    columns={columns}
                    size="small"
                    pagination={{
                        pageSize: 100,
                        showSizeChanger: true,
                        pageSizeOptions: ['50', '100', '200'],
                        showTotal: (total) => `Строк: ${total}`,
                    }}
                    rowClassName={(row) => (
                        Number(row.uncosted_quantity || 0) > 0 ? 'shipment-profit-row-warning' : ''
                    )}
                    locale={{ emptyText: 'Нет данных для выбранных фильтров' }}
                />
            </Card>
        </div>
    );
};

export default ShipmentProfitReportPage;
