import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Popconfirm,
    Row,
    Space,
    Statistic,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    DownloadOutlined,
    FileExcelOutlined,
    ReloadOutlined,
    UndoOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    downloadOneCExport,
    getOneCStatus,
    getSalesHistorySummary,
    importSalesHistory,
    resetOneCExport,
} from '../api/oneC';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const OneCExchangePage = () => {
    const [status, setStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [period, setPeriod] = useState([
        dayjs().startOf('month'),
        dayjs(),
    ]);
    const [downloadingKey, setDownloadingKey] = useState(null);
    const [resetting, setResetting] = useState(false);
    const [salesSummary, setSalesSummary] = useState(null);
    const [salesUploading, setSalesUploading] = useState(false);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const { data } = await getOneCStatus();
            setStatus(data || null);
            const salesResponse = await getSalesHistorySummary().catch(
                () => ({ data: null })
            );
            setSalesSummary(salesResponse.data || null);
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось загрузить статус обмена с 1С'
            );
        } finally {
            setStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStatus();
    }, [loadStatus]);

    const periodParams = () => ({
        date_from: period?.[0]
            ? period[0].format('YYYY-MM-DD')
            : undefined,
        date_to: period?.[1] ? period[1].format('YYYY-MM-DD') : undefined,
    });

    const handleDownload = async (key, path, filename, withPeriod) => {
        setDownloadingKey(key);
        try {
            await downloadOneCExport(
                path,
                filename,
                withPeriod ? periodParams() : {}
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось скачать файл'
            );
        } finally {
            setDownloadingKey(null);
        }
    };

    const handleReset = async () => {
        setResetting(true);
        try {
            const { data } = await resetOneCExport(periodParams());
            message.success(
                `Возвращено в очередь выгрузки: ${data?.reset ?? 0} отгрузок`
            );
            await loadStatus();
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось вернуть отгрузки в очередь'
            );
        } finally {
            setResetting(false);
        }
    };

    const exchangeUrl = `${window.location.origin}/api/1c/exchange`;

    const exportButtons = [
        {
            key: 'shipments-xlsx',
            label: 'Реализации (Excel)',
            path: 'shipments.xlsx',
            filename: 'realizatsii_1c.xlsx',
            withPeriod: true,
        },
        {
            key: 'shipments-xml',
            label: 'Реализации (CommerceML XML)',
            path: 'shipments.xml',
            filename: 'orders_1c.xml',
            withPeriod: true,
        },
        {
            key: 'receipts-xlsx',
            label: 'Поступления (Excel)',
            path: 'receipts.xlsx',
            filename: 'postupleniya_1c.xlsx',
            withPeriod: true,
        },
        {
            key: 'counterparties-xlsx',
            label: 'Контрагенты (Excel)',
            path: 'counterparties.xlsx',
            filename: 'kontragenty_1c.xlsx',
            withPeriod: false,
        },
        {
            key: 'nomenclature-xlsx',
            label: 'Номенклатура (Excel)',
            path: 'nomenclature.xlsx',
            filename: 'nomenklatura_1c.xlsx',
            withPeriod: false,
        },
    ];

    return (
        <div style={{ margin: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card
                    title="Автоматический обмен (1С: «Обмен с сайтом»)"
                    extra={
                        <Button
                            icon={<ReloadOutlined />}
                            loading={statusLoading}
                            onClick={loadStatus}
                        >
                            Обновить
                        </Button>
                    }
                >
                    {status && !status.configured ? (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="Обмен не настроен"
                            description="Задайте переменные окружения ONE_C_EXCHANGE_LOGIN и ONE_C_EXCHANGE_PASSWORD на сервере и перезапустите приложение."
                        />
                    ) : null}
                    <Row gutter={[16, 16]}>
                        <Col xs={12} md={6}>
                            <Statistic
                                title="Ожидают выгрузки"
                                value={status?.pending_shipments ?? '—'}
                            />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic
                                title="Выгружено в 1С"
                                value={status?.synced_shipments ?? '—'}
                            />
                        </Col>
                    </Row>
                    <Descriptions
                        column={1}
                        size="small"
                        style={{ marginTop: 16 }}
                        items={[
                            {
                                key: 'url',
                                label: 'Адрес сайта в настройках 1С',
                                children: <Text copyable>{exchangeUrl}</Text>,
                            },
                            {
                                key: 'login',
                                label: 'Логин',
                                children: status?.login || '—',
                            },
                        ]}
                    />
                    <Paragraph type="secondary" style={{ marginTop: 12 }}>
                        В 1С:Управление торговлей: Администрирование → Обмен с
                        сайтом → включить, указать адрес и логин/пароль,
                        отметить «Обмен заказами». 1С будет по расписанию
                        забирать проведённые отгрузки как заказы —
                        реализация создаётся «на основании» заказа. Каждая
                        отгрузка выгружается один раз; если 1С не приняла
                        пакет, верните период в очередь кнопкой ниже.
                    </Paragraph>
                </Card>

                <Card title="Ручные выгрузки для бухгалтерии">
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Space wrap align="center">
                            <Text>Период:</Text>
                            <RangePicker
                                value={period}
                                format="DD.MM.YYYY"
                                onChange={(value) => setPeriod(value)}
                                allowClear={false}
                            />
                        </Space>
                        <Space wrap>
                            {exportButtons.map((item) => (
                                <Button
                                    key={item.key}
                                    icon={
                                        item.key === 'shipments-xml'
                                            ? <DownloadOutlined />
                                            : <FileExcelOutlined />
                                    }
                                    loading={downloadingKey === item.key}
                                    onClick={() =>
                                        handleDownload(
                                            item.key,
                                            item.path,
                                            item.filename,
                                            item.withPeriod
                                        )
                                    }
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </Space>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            Excel-файлы можно загрузить в 1С типовой
                            обработкой «Загрузка данных из табличного
                            документа». Выгрузки «Реализации» и «Поступления»
                            учитывают выбранный период; контрагенты и
                            номенклатура выгружаются целиком.
                        </Paragraph>
                        <Popconfirm
                            title="Вернуть отгрузки периода в очередь?"
                            description="Все выгруженные отгрузки выбранного периода снова уйдут в 1С при следующем обмене."
                            okText="Вернуть"
                            cancelText="Отмена"
                            onConfirm={handleReset}
                        >
                            <Button
                                icon={<UndoOutlined />}
                                loading={resetting}
                                danger
                            >
                                Вернуть период в очередь выгрузки
                            </Button>
                        </Popconfirm>
                    </Space>
                </Card>
                <Card title="История продаж из 1С (разовая загрузка)">
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Row gutter={[16, 16]}>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Строк загружено"
                                    value={salesSummary?.rows ?? 0}
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Уникальных артикулов"
                                    value={salesSummary?.unique_oems ?? 0}
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Период"
                                    value={
                                        salesSummary?.period_from
                                            ? `${dayjs(salesSummary.period_from).format('MM.YYYY')} — ${dayjs(salesSummary.period_to).format('MM.YYYY')}`
                                            : '—'
                                    }
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Всего продано, шт"
                                    value={salesSummary?.total_quantity ?? 0}
                                />
                            </Col>
                        </Row>
                        <Upload
                            accept=".xlsx,.xls"
                            showUploadList={false}
                            customRequest={async ({ file, onSuccess, onError }) => {
                                setSalesUploading(true);
                                try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    const { data } = await importSalesHistory(formData);
                                    message.success(
                                        `Загружено: новых ${data.created}, обновлено ${data.updated}, пропущено ${data.skipped}`
                                    );
                                    onSuccess(data);
                                    await loadStatus();
                                } catch (err) {
                                    message.error(
                                        err?.response?.data?.detail ||
                                            'Не удалось загрузить файл'
                                    );
                                    onError(err);
                                } finally {
                                    setSalesUploading(false);
                                }
                            }}
                        >
                            <Button
                                icon={<UploadOutlined />}
                                loading={salesUploading}
                            >
                                Загрузить Excel из 1С
                            </Button>
                        </Upload>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            Выгрузите из 1С отчёт по продажам за 5 лет с
                            колонками: Период (месяц/дата), Артикул, Бренд,
                            Количество, Выручка (необязательно). Повторная
                            загрузка того же периода безопасна — данные
                            обновятся, а не задвоятся. История используется
                            аналитикой и прогнозом спроса.
                        </Paragraph>
                    </Space>
                </Card>
            </Space>
        </div>
    );
};

export default OneCExchangePage;
