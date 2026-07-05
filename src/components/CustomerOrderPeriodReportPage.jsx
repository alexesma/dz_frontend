import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    InputNumber,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Typography,
    message,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { getBrands } from '../api/brands';
import {
    exportCustomerOrderPeriodReport,
    getCustomerOrderPeriodReport,
} from '../api/orderTracking';

const { RangePicker } = DatePicker;
const { Title, Text, Paragraph } = Typography;

const extractDownloadFilename = (contentDisposition, fallback) => {
    const header = String(contentDisposition || '');
    const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) {
        return decodeURIComponent(utfMatch[1].replace(/"/g, ''));
    }
    const plainMatch = header.match(/filename="?([^";]+)"?/i);
    return plainMatch?.[1] || fallback;
};

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const formatNumber = (value) =>
    Number(value || 0).toLocaleString('ru-RU');

const formatMoney = (value) => {
    if (value === null || value === undefined) {
        return '—';
    }
    return Number(value || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const defaultPeriod1 = () => [
    dayjs().subtract(1, 'year').month(5).date(1),
    dayjs().subtract(1, 'year').month(11).date(31),
];

const defaultPeriod2 = () => [
    dayjs().month(0).date(1),
    dayjs(),
];

const CustomerOrderPeriodReportPage = () => {
    const [period1, setPeriod1] = useState(defaultPeriod1());
    const [period2, setPeriod2] = useState(defaultPeriod2());
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [brandOptions, setBrandOptions] = useState([]);
    const [brandLoading, setBrandLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [reportData, setReportData] = useState(null);
    const [limit, setLimit] = useState(1000);
    const [minTotalQty, setMinTotalQty] = useState(1);
    const [sortBy, setSortBy] = useState('total_desc');

    const selectedBrandLabel = useMemo(() => {
        if (!selectedBrands.length) {
            return 'Все бренды';
        }
        return selectedBrands.join(', ');
    }, [selectedBrands]);

    const fetchBrands = useCallback(async () => {
        setBrandLoading(true);
        try {
            const { data } = await getBrands();
            const rows = Array.isArray(data) ? data : [];
            setBrandOptions(
                rows
                    .filter((brand) => brand?.main_brand !== false)
                    .map((brand) => ({
                        label: brand.name,
                        value: brand.name,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
            );
        } catch (error) {
            message.error(
                error?.response?.data?.detail
                || 'Не удалось загрузить список брендов'
            );
        } finally {
            setBrandLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchBrands();
    }, [fetchBrands]);

    const hasValidPeriods = () => {
        if (!period1?.[0] || !period1?.[1] || !period2?.[0] || !period2?.[1]) {
            message.warning('Выбери оба периода отчёта');
            return false;
        }
        return true;
    };

    const buildParams = () => {
        const params = {
            period1_from: period1?.[0]?.format('YYYY-MM-DD'),
            period1_to: period1?.[1]?.format('YYYY-MM-DD'),
            period2_from: period2?.[0]?.format('YYYY-MM-DD'),
            period2_to: period2?.[1]?.format('YYYY-MM-DD'),
            brand: selectedBrands.length ? selectedBrands.join(',') : undefined,
            limit,
            min_total_qty: minTotalQty,
            sort_by: sortBy,
        };
        return Object.fromEntries(
            Object.entries(params).filter(([, value]) => value !== undefined)
        );
    };

    const handlePreview = async () => {
        if (!hasValidPeriods()) {
            return;
        }
        setPreviewLoading(true);
        try {
            const { data } = await getCustomerOrderPeriodReport(buildParams());
            setReportData(data);
        } catch (error) {
            message.error(
                error?.response?.data?.detail
                || 'Не удалось сформировать отчёт по заказам клиентов'
            );
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleExport = async () => {
        if (!hasValidPeriods()) {
            return;
        }
        setExportLoading(true);
        try {
            const response = await exportCustomerOrderPeriodReport(buildParams());
            const filename = extractDownloadFilename(
                response.headers?.['content-disposition'],
                `customer_order_period_report_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
            );
            downloadBlob(response.data, filename);
        } catch (error) {
            message.error(
                error?.response?.data?.detail
                || 'Не удалось выгрузить отчёт по заказам клиентов'
            );
        } finally {
            setExportLoading(false);
        }
    };

    const reportRows = Array.isArray(reportData?.rows) ? reportData.rows : [];
    const reportColumns = [
        {
            title: 'Артикул',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 150,
            fixed: 'left',
            render: (value) => <Text strong>{value}</Text>,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 150,
            render: (value) => value || '—',
        },
        {
            title: 'Наименование',
            dataIndex: 'autopart_name',
            key: 'autopart_name',
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Остаток',
            dataIndex: 'current_quantity',
            key: 'current_quantity',
            align: 'right',
            width: 120,
            render: formatNumber,
        },
        {
            title: 'Период 1',
            dataIndex: 'period1_qty',
            key: 'period1_qty',
            align: 'right',
            width: 130,
            render: formatNumber,
        },
        {
            title: 'Период 2',
            dataIndex: 'period2_qty',
            key: 'period2_qty',
            align: 'right',
            width: 130,
            render: formatNumber,
        },
        {
            title: 'Всего',
            dataIndex: 'total_qty',
            key: 'total_qty',
            align: 'right',
            width: 120,
            render: (value) => <Text strong>{formatNumber(value)}</Text>,
        },
        {
            title: 'Средняя цена П1',
            dataIndex: 'period1_avg_price',
            key: 'period1_avg_price',
            align: 'right',
            width: 150,
            render: (value) => `${formatMoney(value)} руб.`,
        },
    ];

    return (
        <div>
            <Title level={2}>Отчёт по заказам клиентов</Title>
            <Paragraph type="secondary">
                Отчёт повторяет формат выгрузки “продажи по периодам с
                остатками”, но вместо продаж использует количество,
                запрошенное клиентами в заказах. Остаток берётся из последнего
                нашего прайса.
            </Paragraph>

            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Гибкость отчёта"
                description={(
                    <span>
                        Можно выбрать один или несколько брендов, два любых
                        периода, лимит строк, минимальный суммарный спрос и
                        порядок сортировки. Сейчас выбран бренд: {selectedBrandLabel}.
                    </span>
                )}
            />

            <Card>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <Space wrap size="middle">
                        <Space direction="vertical" size={4}>
                            <Text strong>Период 1</Text>
                            <RangePicker
                                value={period1}
                                onChange={(value) => setPeriod1(value || [])}
                                format="DD.MM.YYYY"
                                allowClear={false}
                            />
                        </Space>
                        <Space direction="vertical" size={4}>
                            <Text strong>Период 2</Text>
                            <RangePicker
                                value={period2}
                                onChange={(value) => setPeriod2(value || [])}
                                format="DD.MM.YYYY"
                                allowClear={false}
                            />
                        </Space>
                    </Space>

                    <Space wrap size="middle">
                        <Space direction="vertical" size={4}>
                            <Text strong>Бренды</Text>
                            <Select
                                mode="multiple"
                                allowClear
                                showSearch
                                loading={brandLoading}
                                placeholder="Все бренды"
                                value={selectedBrands}
                                style={{ minWidth: 360 }}
                                maxTagCount="responsive"
                                options={brandOptions}
                                optionFilterProp="label"
                                filterOption={(inputValue, option) =>
                                    String(option?.label || '')
                                        .toLowerCase()
                                        .includes(inputValue.toLowerCase())
                                }
                                onChange={(values) => setSelectedBrands(values)}
                            />
                        </Space>
                        <Space direction="vertical" size={4}>
                            <Text strong>Лимит строк</Text>
                            <InputNumber
                                min={1}
                                max={10000}
                                value={limit}
                                onChange={(value) => setLimit(Number(value || 1000))}
                                style={{ width: 140 }}
                            />
                        </Space>
                        <Space direction="vertical" size={4}>
                            <Text strong>Мин. заказано всего</Text>
                            <InputNumber
                                min={0}
                                value={minTotalQty}
                                onChange={(value) => setMinTotalQty(Number(value || 0))}
                                style={{ width: 170 }}
                            />
                        </Space>
                        <Space direction="vertical" size={4}>
                            <Text strong>Сортировка</Text>
                            <Select
                                value={sortBy}
                                style={{ width: 260 }}
                                onChange={setSortBy}
                                options={[
                                    { value: 'total_desc', label: 'Всего заказано: по убыванию' },
                                    { value: 'period1_desc', label: 'Период 1: по убыванию' },
                                    { value: 'period2_desc', label: 'Период 2: по убыванию' },
                                    { value: 'brand_oem', label: 'Бренд и артикул' },
                                ]}
                            />
                        </Space>
                    </Space>

                    <Space wrap>
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            loading={previewLoading}
                            onClick={() => {
                                void handlePreview();
                            }}
                        >
                            Сформировать
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => {
                                setPeriod1(defaultPeriod1());
                                setPeriod2(defaultPeriod2());
                                setSelectedBrands([]);
                                setLimit(1000);
                                setMinTotalQty(1);
                                setSortBy('total_desc');
                                setReportData(null);
                            }}
                        >
                            Сбросить
                        </Button>
                        <Button
                            icon={<DownloadOutlined />}
                            loading={exportLoading}
                            onClick={() => {
                                void handleExport();
                            }}
                        >
                            Скачать Excel
                        </Button>
                    </Space>
                </Space>
            </Card>

            <Card
                style={{ marginTop: 16 }}
                title="Сформированный отчёт"
                extra={reportData ? (
                    <Text type="secondary">
                        Строк: {formatNumber(reportData.total_items)}
                    </Text>
                ) : null}
            >
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Период 1"
                            value={reportData?.summary?.period1_qty || 0}
                            formatter={formatNumber}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Период 2"
                            value={reportData?.summary?.period2_qty || 0}
                            formatter={formatNumber}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Всего заказано"
                            value={reportData?.summary?.total_qty || 0}
                            formatter={formatNumber}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Остаток по строкам"
                            value={reportData?.summary?.stock_qty || 0}
                            formatter={formatNumber}
                        />
                    </Col>
                </Row>

                <Table
                    size="small"
                    rowKey={(row) => `${row.brand_name || ''}-${row.oem_number}`}
                    loading={previewLoading}
                    columns={reportColumns}
                    dataSource={reportRows}
                    scroll={{ x: 1180 }}
                    pagination={{
                        pageSize: 50,
                        showSizeChanger: true,
                        pageSizeOptions: ['25', '50', '100', '200'],
                        showTotal: (total) => `Всего строк: ${formatNumber(total)}`,
                    }}
                    locale={{
                        emptyText: reportData
                            ? 'По выбранным условиям строк не найдено'
                            : 'Нажми “Сформировать”, чтобы увидеть отчёт в окне',
                    }}
                />
            </Card>
        </div>
    );
};

export default CustomerOrderPeriodReportPage;
