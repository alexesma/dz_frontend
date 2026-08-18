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
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    DownloadOutlined,
    FileExcelOutlined,
    ReloadOutlined,
    RetweetOutlined,
    UndoOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    downloadOneCExport,
    getOneCStatus,
    getOneCBatches,
    getOneCEvents,
    getSalesHistorySummary,
    importSalesHistory,
    resetOneCExport,
    retryOneCEvent,
} from '../api/oneC';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const EVENT_STATUS = {
    pending: { label: 'Ожидает', color: 'gold' },
    in_flight: { label: 'Передано', color: 'blue' },
    succeeded: { label: 'Подтверждено', color: 'green' },
    error: { label: 'Ошибка', color: 'red' },
};

const BATCH_STATUS = {
    sent: { label: 'Ждёт подтверждения', color: 'blue' },
    succeeded: { label: 'Подтверждён', color: 'green' },
    error: { label: 'Ошибка', color: 'red' },
};

const ENTITY_LABELS = {
    shipment: 'Реализация',
    supplier_receipt: 'Поступление',
    stock_document: 'Складской документ',
    production_wave: 'Выпуск DragonZap',
};

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
    const [events, setEvents] = useState([]);
    const [batches, setBatches] = useState([]);
    const [retryingEventId, setRetryingEventId] = useState(null);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const [statusResponse, eventsResponse, batchesResponse, salesResponse] =
                await Promise.all([
                    getOneCStatus(),
                    getOneCEvents({ limit: 100 }),
                    getOneCBatches({ limit: 50 }),
                    getSalesHistorySummary().catch(() => ({ data: null })),
                ]);
            setStatus(statusResponse.data || null);
            setEvents(eventsResponse.data?.items || []);
            setBatches(batchesResponse.data?.items || []);
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

    const handleRetryEvent = async (eventId) => {
        setRetryingEventId(eventId);
        try {
            await retryOneCEvent(eventId);
            message.success('Событие возвращено в очередь');
            await loadStatus();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось повторить событие'
            );
        } finally {
            setRetryingEventId(null);
        }
    };

    const eventColumns = [
        {
            title: 'Создано',
            dataIndex: 'created_at',
            width: 145,
            render: (value) => dayjs(value).format('DD.MM.YY HH:mm:ss'),
        },
        {
            title: 'Документ',
            key: 'entity',
            width: 190,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{ENTITY_LABELS[row.entity_type] || row.entity_type}</Text>
                    <Text type="secondary">ID {row.entity_id} · {row.event_type}</Text>
                </Space>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 135,
            render: (value) => {
                const meta = EVENT_STATUS[value] || { label: value };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Попыток',
            dataIndex: 'attempt_count',
            width: 85,
            align: 'center',
        },
        {
            title: 'ID в 1С / ошибка',
            key: 'result',
            ellipsis: true,
            render: (_, row) => row.external_id || row.last_error || <Text type="secondary">—</Text>,
        },
        {
            title: '',
            key: 'actions',
            width: 55,
            render: (_, row) => row.status !== 'succeeded' ? (
                <Tooltip title="Вернуть в очередь">
                    <Button
                        type="text"
                        icon={<RetweetOutlined />}
                        loading={retryingEventId === row.id}
                        onClick={() => handleRetryEvent(row.id)}
                    />
                </Tooltip>
            ) : null,
        },
    ];

    const batchColumns = [
        {
            title: 'Отправлен',
            dataIndex: 'sent_at',
            width: 160,
            render: (value) => dayjs(value).format('DD.MM.YY HH:mm:ss'),
        },
        {
            title: 'Канал',
            dataIndex: 'channel',
            width: 130,
            render: (value) => value === 'commerceml' ? 'CommerceML' : 'JSON API',
        },
        {
            title: 'Пакет',
            dataIndex: 'batch_uid',
            ellipsis: true,
            render: (value) => <Text copyable={{ text: value }}>{value}</Text>,
        },
        {
            title: 'Событий',
            dataIndex: 'event_count',
            width: 90,
            align: 'center',
        },
        {
            title: 'Попыток',
            dataIndex: 'attempt_count',
            width: 85,
            align: 'center',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 170,
            render: (value) => {
                const meta = BATCH_STATUS[value] || { label: value };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
    ];

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
                        <Col xs={12} md={6}>
                            <Statistic
                                title="Передано, ждёт ответа"
                                value={status?.in_flight_events ?? '—'}
                            />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic
                                title="Ошибок обмена"
                                value={status?.error_events ?? '—'}
                                valueStyle={status?.error_events ? { color: '#cf1322' } : undefined}
                            />
                        </Col>
                    </Row>
                    {status?.active_batch_uid ? (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginTop: 16 }}
                            message="1С получила пакет, ожидается подтверждение"
                            description={
                                <Text copyable>{status.active_batch_uid}</Text>
                            }
                        />
                    ) : null}
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
                        реализация создаётся «на основании» заказа. Повторный
                        запрос до подтверждения получает тот же
                        пакет. Отгрузка считается синхронизированной только
                        после ответа success от 1С.
                    </Paragraph>
                </Card>

                <Card title="Надёжная очередь и история обмена">
                    <Tabs
                        items={[
                            {
                                key: 'events',
                                label: `События (${events.length})`,
                                children: (
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        columns={eventColumns}
                                        dataSource={events}
                                        pagination={{ pageSize: 15, showSizeChanger: false }}
                                        scroll={{ x: 850 }}
                                    />
                                ),
                            },
                            {
                                key: 'batches',
                                label: `Пакеты (${batches.length})`,
                                children: (
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        columns={batchColumns}
                                        dataSource={batches}
                                        pagination={{ pageSize: 10, showSizeChanger: false }}
                                        scroll={{ x: 850 }}
                                    />
                                ),
                            },
                        ]}
                    />
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
