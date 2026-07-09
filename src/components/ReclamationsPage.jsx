import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Segmented,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    BarChartOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CloudDownloadOutlined,
    ExclamationCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    assignReclamationCustomer,
    checkReclamation,
    createReclamation,
    getReclamation,
    getReclamationEmails,
    getReclamationStats,
    getReclamationsSummary,
    getReplyTemplate,
    listReclamations,
    notifyReclamationSupplier,
    sendReclamationReply,
    syncReclamations,
    updateReclamation,
    updateReclamationItem,
} from '../api/reclamations';
import { getCustomersSummary } from '../api/customers';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const STATUS_META = {
    new: { label: 'Новая', color: 'default' },
    recognized: { label: 'Распознана', color: 'blue' },
    checked: { label: 'Проверена', color: 'cyan' },
    waiting_docs: { label: 'Ждём документы', color: 'orange' },
    waiting_supplier: { label: 'Ждём поставщика', color: 'gold' },
    approved: { label: 'Согласована', color: 'green' },
    rejected: { label: 'Отклонена', color: 'red' },
    closed: { label: 'Закрыта', color: 'default' },
};

const TYPE_META = {
    customer_refusal: { label: 'Отказ клиента', color: 'blue' },
    defect: { label: 'Брак', color: 'volcano' },
    other: { label: 'Прочее', color: 'default' },
};

const SOURCE_LABELS = {
    email: 'Письмо',
    link: 'Ссылка',
    manual: 'Вручную',
};

const ATTACHMENT_KIND_LABELS = {
    removal_order: 'Заказ-наряд на снятие',
    installation_order: 'Заказ-наряд на установку',
    defect_report: 'Дефектовка',
    photo: 'Фото',
    other: 'Прочее',
};

const ITEM_SOURCE_OPTIONS = [
    { value: 'unknown', label: 'Не определён' },
    { value: 'our_stock', label: 'Наш склад' },
    { value: 'supplier_transit', label: 'Транзит поставщика' },
];

const RECOMMENDATION_META = {
    approve: {
        label: 'Можно согласовать возврат',
        alert: 'success',
    },
    reject: {
        label: 'Рекомендуется отклонить',
        alert: 'error',
    },
    request_documents: {
        label: 'Запросить документы у клиента',
        alert: 'warning',
    },
    request_supplier: {
        label: 'Запросить согласование у поставщика',
        alert: 'warning',
    },
    manual: {
        label: 'Требуется ручная проверка',
        alert: 'info',
    },
};

// Действие, которое ставит рекомендация при «Применить»
const RECOMMENDATION_ACTION = {
    approve: { resolution: 'approved' },
    reject: { resolution: 'rejected' },
    request_documents: { status: 'waiting_docs' },
    request_supplier: { status: 'waiting_supplier' },
};

const OUTBOX_STATUS_META = {
    pending: { label: 'В очереди', color: 'gold' },
    sent: { label: 'Отправлено', color: 'green' },
    error: { label: 'Ошибка', color: 'red' },
    cancelled: { label: 'Отменено', color: 'default' },
};

const REPLY_KIND_OPTIONS = [
    { value: 'ack', label: 'Подтверждение получения' },
    { value: 'approved', label: 'Согласование возврата' },
    { value: 'rejected', label: 'Отказ' },
    { value: 'request_documents', label: 'Запрос документов (брак)' },
];

const checkStatusIcon = (status) => {
    if (status === 'ok') {
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
    if (status === 'warn') {
        return <WarningOutlined style={{ color: '#faad14' }} />;
    }
    return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
};

// Очередь по этапам обработки. active-очереди сортируем FIFO (сначала старые).
const QUEUES = [
    {
        key: 'attention',
        label: 'Требуют внимания',
        statuses: ['new', 'recognized'],
        order: 'oldest',
    },
    {
        key: 'checked',
        label: 'Проверены',
        statuses: ['checked'],
        order: 'oldest',
    },
    {
        key: 'waiting_docs',
        label: 'Ждут документы',
        statuses: ['waiting_docs'],
        order: 'oldest',
    },
    {
        key: 'waiting_supplier',
        label: 'Ждут поставщика',
        statuses: ['waiting_supplier'],
        order: 'oldest',
    },
    {
        key: 'done',
        label: 'Завершённые',
        statuses: ['approved', 'rejected', 'closed'],
        order: 'newest',
    },
    { key: 'all', label: 'Все', statuses: [], order: 'newest' },
];

// Быстрые переходы статуса в зависимости от текущего этапа
const STATUS_TRANSITIONS = {
    new: ['recognized', 'checked'],
    recognized: ['checked', 'waiting_docs'],
    checked: ['waiting_docs', 'waiting_supplier'],
    waiting_docs: ['checked', 'waiting_supplier'],
    waiting_supplier: ['checked'],
    approved: ['closed'],
    rejected: ['closed'],
    closed: [],
};

const fmtDateTime = (v) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—');

const ReclamationsPage = () => {
    const [summary, setSummary] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [queueKey, setQueueKey] = useState('attention');
    const [syncing, setSyncing] = useState(false);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [statsOpen, setStatsOpen] = useState(false);
    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsPeriod, setStatsPeriod] = useState([]);

    const [detail, setDetail] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [assignCustomerId, setAssignCustomerId] = useState(null);
    const [rememberEmail, setRememberEmail] = useState(true);
    const [assigning, setAssigning] = useState(false);
    const [statusSaving, setStatusSaving] = useState(false);
    const [resolutionComment, setResolutionComment] = useState('');
    const [itemSavingId, setItemSavingId] = useState(null);
    const [checking, setChecking] = useState(false);
    const [emails, setEmails] = useState([]);
    const [emailsLoading, setEmailsLoading] = useState(false);
    const [supplierSaving, setSupplierSaving] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyKind, setReplyKind] = useState('approved');
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [replyTplLoading, setReplyTplLoading] = useState(false);
    const [replySaving, setReplySaving] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm] = Form.useForm();
    const [creating, setCreating] = useState(false);

    const activeQueue =
        QUEUES.find((q) => q.key === queueKey) || QUEUES[0];

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const queue = QUEUES.find((q) => q.key === queueKey) || QUEUES[0];
            const [sumResp, listResp] = await Promise.all([
                getReclamationsSummary(),
                listReclamations({
                    status: queue.statuses.length
                        ? queue.statuses.join(',')
                        : undefined,
                    order: queue.order,
                    limit: 300,
                }),
            ]);
            setSummary(sumResp.data || null);
            setRows(Array.isArray(listResp.data) ? listResp.data : []);
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось загрузить рекламации'
            );
        } finally {
            setLoading(false);
        }
    }, [queueKey]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await getCustomersSummary({
                    page: 1,
                    page_size: 500,
                });
                const items = Array.isArray(data?.items) ? data.items : [];
                setCustomerOptions(
                    items.map((c) => ({ value: c.id, label: c.name }))
                );
            } catch {
                setCustomerOptions([]);
            }
        })();
    }, []);

    const queueCount = (queue) => {
        const byStatus = summary?.by_status || {};
        if (!queue.statuses.length) {
            return summary?.total ?? 0;
        }
        return queue.statuses.reduce(
            (sum, st) => sum + (byStatus[st] || 0),
            0
        );
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const { data } = await syncReclamations();
            if (data?.note) {
                message.warning(data.note);
            } else {
                message.success(
                    `Проверено писем: ${data.fetched}, новых рекламаций: ${data.created}`
                );
            }
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Синхронизация не удалась'
            );
        } finally {
            setSyncing(false);
        }
    };

    const loadEmails = async (id) => {
        setEmailsLoading(true);
        try {
            const { data } = await getReclamationEmails(id);
            setEmails(Array.isArray(data) ? data : []);
        } catch {
            setEmails([]);
        } finally {
            setEmailsLoading(false);
        }
    };

    const loadStats = useCallback(async (period) => {
        setStatsLoading(true);
        try {
            const params = {};
            if (period?.[0]) {
                params.date_from = period[0].format('YYYY-MM-DD');
            }
            if (period?.[1]) {
                params.date_to = period[1].format('YYYY-MM-DD');
            }
            const { data } = await getReclamationStats(params);
            setStats(data || null);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось загрузить статистику'
            );
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const openStats = () => {
        setStatsOpen(true);
        void loadStats(statsPeriod);
    };

    const openDetail = async (id) => {
        try {
            const { data } = await getReclamation(id);
            setDetail(data);
            setAssignCustomerId(data.customer_id || null);
            setRememberEmail(true);
            setResolutionComment(data.resolution_comment || '');
            setDetailOpen(true);
            void loadEmails(id);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось открыть рекламацию'
            );
        }
    };

    const openReplyModal = () => {
        setReplyKind(
            detail?.resolution === 'rejected'
                ? 'rejected'
                : detail?.resolution === 'approved'
                    ? 'approved'
                    : 'ack'
        );
        setReplySubject('');
        setReplyBody('');
        setReplyOpen(true);
    };

    const loadReplyTemplate = async (kind) => {
        if (!detail) {
            return;
        }
        setReplyTplLoading(true);
        try {
            const { data } = await getReplyTemplate(detail.id, kind);
            setReplySubject(data.subject || '');
            setReplyBody(data.body_text || '');
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось получить шаблон'
            );
        } finally {
            setReplyTplLoading(false);
        }
    };

    const handleSendReply = async () => {
        if (!detail) {
            return;
        }
        if (!replyBody.trim()) {
            message.warning('Заполните текст письма');
            return;
        }
        setReplySaving(true);
        try {
            await sendReclamationReply(detail.id, {
                kind: replyKind,
                subject: replySubject || null,
                body_text: replyBody,
            });
            message.success('Ответ поставлен в очередь отправки');
            setReplyOpen(false);
            await loadEmails(detail.id);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось поставить ответ'
            );
        } finally {
            setReplySaving(false);
        }
    };

    const handleNotifySupplier = async () => {
        if (!detail) {
            return;
        }
        setSupplierSaving(true);
        try {
            const { data } = await notifyReclamationSupplier(detail.id);
            message.success(
                `Запрос поставщику поставлен в очередь: ${
                    Array.isArray(data) ? data.length : 1
                } письмо`
            );
            await loadEmails(detail.id);
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось поставить запрос поставщику'
            );
        } finally {
            setSupplierSaving(false);
        }
    };

    const applyDetailUpdate = (data) => {
        setDetail(data);
        setRows((prev) =>
            prev.map((row) =>
                row.id === data.id
                    ? {
                          ...row,
                          status: data.status,
                          reclamation_type: data.reclamation_type,
                          resolution: data.resolution,
                          customer_id: data.customer_id,
                          customer_name: data.customer_name,
                      }
                    : row
            )
        );
    };

    const handleAssign = async () => {
        if (!detail || !assignCustomerId) {
            message.warning('Выберите клиента');
            return;
        }
        setAssigning(true);
        try {
            const { data } = await assignReclamationCustomer(detail.id, {
                customer_id: assignCustomerId,
                remember_email: rememberEmail,
            });
            applyDetailUpdate(data);
            message.success('Клиент привязан');
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось привязать клиента'
            );
        } finally {
            setAssigning(false);
        }
    };

    const patchReclamation = async (payload, successText) => {
        if (!detail) {
            return;
        }
        setStatusSaving(true);
        try {
            const { data } = await updateReclamation(detail.id, payload);
            applyDetailUpdate(data);
            if (successText) {
                message.success(successText);
            }
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось обновить рекламацию'
            );
        } finally {
            setStatusSaving(false);
        }
    };

    const handleCheck = async () => {
        if (!detail) {
            return;
        }
        setChecking(true);
        try {
            const { data } = await checkReclamation(detail.id);
            applyDetailUpdate(data);
            const code = data?.check_result?.recommendation_code;
            message.success(
                'Проверка выполнена'
                + (code && RECOMMENDATION_META[code]
                    ? `: ${RECOMMENDATION_META[code].label}`
                    : '')
            );
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось выполнить проверку'
            );
        } finally {
            setChecking(false);
        }
    };

    const handleApplyRecommendation = async () => {
        const code = detail?.check_result?.recommendation_code;
        const action = RECOMMENDATION_ACTION[code];
        if (!action) {
            message.info('Для этой рекомендации нет автодействия');
            return;
        }
        const payload = { ...action };
        if (payload.resolution) {
            payload.resolution_comment =
                resolutionComment
                || detail?.check_result?.summary
                || null;
        }
        await patchReclamation(payload, 'Рекомендация применена');
    };

    const handleResolve = (resolution) =>
        patchReclamation(
            {
                resolution,
                resolution_comment: resolutionComment || null,
            },
            resolution === 'approved'
                ? 'Рекламация согласована'
                : 'Рекламация отклонена'
        );

    const handleItemSource = async (item, value) => {
        if (!detail) {
            return;
        }
        setItemSavingId(item.id);
        try {
            const { data } = await updateReclamationItem(detail.id, item.id, {
                item_source: value,
            });
            setDetail(data);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось обновить позицию'
            );
        } finally {
            setItemSavingId(null);
        }
    };

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            setCreating(true);
            const { data } = await createReclamation(values);
            message.success('Рекламация создана');
            setCreateOpen(false);
            createForm.resetFields();
            await load();
            await openDetail(data.id);
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error(
                err?.response?.data?.detail || 'Не удалось создать рекламацию'
            );
        } finally {
            setCreating(false);
        }
    };

    const byStatus = summary?.by_status || {};

    const columns = [
        {
            title: '#',
            dataIndex: 'id',
            width: 56,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 140,
            render: (v) => {
                const meta = STATUS_META[v] || { label: v, color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Тип',
            dataIndex: 'reclamation_type',
            width: 120,
            render: (v) =>
                v ? (
                    <Tag color={(TYPE_META[v] || {}).color || 'default'}>
                        {(TYPE_META[v] || {}).label || v}
                    </Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Клиент',
            key: 'customer',
            width: 200,
            ellipsis: true,
            render: (_, row) =>
                row.customer_name || <Tag color="orange">не определён</Tag>,
        },
        {
            title: 'Тема / отправитель',
            key: 'subject',
            ellipsis: true,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.email_subject || '—'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.sender_email || ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Документ',
            dataIndex: 'stated_document_number',
            width: 120,
            render: (v) => v || '—',
        },
        {
            title: 'Поз.',
            dataIndex: 'items_count',
            width: 56,
        },
        {
            title: 'Получена',
            dataIndex: 'email_received_at',
            width: 140,
            render: fmtDateTime,
        },
        {
            title: '',
            key: 'action',
            width: 84,
            render: (_, row) => (
                <Button size="small" onClick={() => openDetail(row.id)}>
                    Открыть
                </Button>
            ),
        },
    ];

    const canResolve =
        detail && !['approved', 'rejected', 'closed'].includes(detail.status);

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Space
                    style={{ justifyContent: 'space-between', width: '100%' }}
                    wrap
                >
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            Рекламации
                        </Title>
                        <Text type="secondary">
                            Очередь обработки претензий: приём, распознавание,
                            проверка, решение
                        </Text>
                    </div>
                    <Space>
                        <Button
                            icon={<BarChartOutlined />}
                            onClick={openStats}
                        >
                            Статистика
                        </Button>
                        <Button
                            icon={<CloudDownloadOutlined />}
                            loading={syncing}
                            onClick={handleSync}
                        >
                            Проверить почту
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Завести вручную
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={load}
                        >
                            Обновить
                        </Button>
                    </Space>
                </Space>

                <Row gutter={[12, 12]}>
                    <Col xs={12} md={4}>
                        <Statistic title="Всего" value={summary?.total ?? 0} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic title="Новые" value={byStatus.new ?? 0} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Распознаны"
                            value={byStatus.recognized ?? 0}
                            valueStyle={{ color: '#2563eb' }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Ждут документы"
                            value={byStatus.waiting_docs ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Ждут поставщика"
                            value={byStatus.waiting_supplier ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Без клиента"
                            value={summary?.without_customer ?? 0}
                            valueStyle={{
                                color: summary?.without_customer
                                    ? '#ea580c'
                                    : undefined,
                            }}
                        />
                    </Col>
                </Row>

                <div style={{ overflowX: 'auto' }}>
                    <Segmented
                        value={queueKey}
                        onChange={(val) => setQueueKey(val)}
                        options={QUEUES.map((q) => ({
                            value: q.key,
                            label: (
                                <Space size={6}>
                                    {q.label}
                                    <Badge
                                        count={queueCount(q)}
                                        showZero
                                        overflowCount={999}
                                        style={{
                                            backgroundColor:
                                                queueKey === q.key
                                                    ? '#1677ff'
                                                    : '#bfbfbf',
                                        }}
                                    />
                                </Space>
                            ),
                        }))}
                    />
                </div>

                <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={rows}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    scroll={{ x: 1000 }}
                    locale={{
                        emptyText:
                            activeQueue.key === 'attention'
                                ? 'В очереди пусто — всё разобрано 🎉'
                                : 'Рекламаций в этой очереди нет',
                    }}
                />
            </Space>

            <Drawer
                open={detailOpen}
                width={680}
                title={detail ? `Рекламация #${detail.id}` : 'Рекламация'}
                onClose={() => setDetailOpen(false)}
            >
                {detail ? (
                    <Space
                        direction="vertical"
                        size="middle"
                        style={{ width: '100%' }}
                    >
                        {!detail.customer_id ? (
                            <Alert
                                type="warning"
                                showIcon
                                message="Клиент не определён"
                                description="Адрес отправителя не привязан ни к одному клиенту. Выберите клиента ниже."
                            />
                        ) : null}

                        <Card
                            size="small"
                            title={
                                <Space>
                                    <SafetyCertificateOutlined />
                                    Проверка и рекомендация
                                </Space>
                            }
                            extra={
                                <Button
                                    size="small"
                                    type="primary"
                                    ghost
                                    icon={<SafetyCertificateOutlined />}
                                    loading={checking}
                                    onClick={handleCheck}
                                >
                                    {detail.check_result?.checked_at
                                        ? 'Перепроверить'
                                        : 'Проверить'}
                                </Button>
                            }
                        >
                            {detail.check_result?.recommendation_code ? (
                                <Space
                                    direction="vertical"
                                    size="small"
                                    style={{ width: '100%' }}
                                >
                                    <Alert
                                        type={
                                            (RECOMMENDATION_META[
                                                detail.check_result
                                                    .recommendation_code
                                            ] || {}).alert || 'info'
                                        }
                                        showIcon
                                        message={
                                            (RECOMMENDATION_META[
                                                detail.check_result
                                                    .recommendation_code
                                            ] || {}).label ||
                                            detail.check_result
                                                .recommendation_code
                                        }
                                        description={
                                            detail.check_result.summary || null
                                        }
                                        action={
                                            RECOMMENDATION_ACTION[
                                                detail.check_result
                                                    .recommendation_code
                                            ] ? (
                                                <Button
                                                    size="small"
                                                    loading={statusSaving}
                                                    onClick={
                                                        handleApplyRecommendation
                                                    }
                                                >
                                                    Применить
                                                </Button>
                                            ) : null
                                        }
                                    />

                                    {(detail.check_result.documents?.missing
                                        ?.length || 0) > 0 ? (
                                        <Text type="warning">
                                            <ExclamationCircleOutlined />{' '}
                                            Не хватает документов:{' '}
                                            {(
                                                detail.check_result.documents
                                                    .missing_labels ||
                                                detail.check_result.documents
                                                    .missing
                                            ).join(', ')}
                                        </Text>
                                    ) : null}

                                    {(detail.check_result.items || []).map(
                                        (it) => (
                                            <div
                                                key={it.item_id}
                                                style={{
                                                    borderTop:
                                                        '1px solid #f0f0f0',
                                                    paddingTop: 6,
                                                }}
                                            >
                                                <Text strong>
                                                    {it.oem_number || '—'}
                                                </Text>{' '}
                                                <Text type="secondary">
                                                    {it.brand_name || ''}
                                                </Text>
                                                <div>
                                                    {(it.checks || []).map(
                                                        (chk, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    fontSize: 13,
                                                                }}
                                                            >
                                                                {checkStatusIcon(
                                                                    chk.status
                                                                )}{' '}
                                                                <Text
                                                                    type="secondary"
                                                                >
                                                                    {chk.label}:
                                                                </Text>{' '}
                                                                {chk.detail}
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    )}

                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 12 }}
                                    >
                                        Проверено:{' '}
                                        {fmtDateTime(
                                            detail.check_result.checked_at
                                        )}
                                    </Text>
                                </Space>
                            ) : (
                                <Text type="secondary">
                                    Проверка ещё не выполнялась. Нажмите
                                    «Проверить», чтобы система сверила отгрузку,
                                    срок возврата, источник и документы.
                                </Text>
                            )}
                        </Card>

                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Статус">
                                <Tag
                                    color={
                                        (STATUS_META[detail.status] || {})
                                            .color || 'default'
                                    }
                                >
                                    {(STATUS_META[detail.status] || {}).label ||
                                        detail.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Источник">
                                {SOURCE_LABELS[detail.source] || detail.source}
                                {detail.source_link ? (
                                    <>
                                        {' · '}
                                        <a
                                            href={detail.source_link}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            открыть портал
                                        </a>
                                    </>
                                ) : null}
                            </Descriptions.Item>
                            <Descriptions.Item label="Клиент">
                                {detail.customer_name || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отправитель">
                                {detail.sender_email || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Документ">
                                {detail.stated_document_number || '—'}
                                {detail.stated_document_date
                                    ? ` от ${dayjs(detail.stated_document_date).format('DD.MM.YYYY')}`
                                    : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label="Получена">
                                {fmtDateTime(detail.email_received_at)}
                            </Descriptions.Item>
                        </Descriptions>

                        <Card size="small" title="Обработка">
                            <Space
                                direction="vertical"
                                size="middle"
                                style={{ width: '100%' }}
                            >
                                <Space wrap align="center">
                                    <Text type="secondary">Тип:</Text>
                                    <Select
                                        size="small"
                                        style={{ width: 180 }}
                                        value={detail.reclamation_type || undefined}
                                        placeholder="Не определён"
                                        disabled={statusSaving}
                                        onChange={(val) =>
                                            patchReclamation(
                                                { reclamation_type: val },
                                                'Тип обновлён'
                                            )
                                        }
                                        options={Object.entries(TYPE_META).map(
                                            ([value, meta]) => ({
                                                value,
                                                label: meta.label,
                                            })
                                        )}
                                    />
                                    <Text type="secondary">Статус:</Text>
                                    <Select
                                        size="small"
                                        style={{ width: 180 }}
                                        value={detail.status}
                                        disabled={statusSaving}
                                        onChange={(val) =>
                                            patchReclamation(
                                                { status: val },
                                                'Статус обновлён'
                                            )
                                        }
                                        options={Object.entries(
                                            STATUS_META
                                        ).map(([value, meta]) => ({
                                            value,
                                            label: meta.label,
                                        }))}
                                    />
                                </Space>

                                {(STATUS_TRANSITIONS[detail.status] || [])
                                    .length ? (
                                    <Space wrap>
                                        <Text type="secondary">
                                            Быстрый переход:
                                        </Text>
                                        {(
                                            STATUS_TRANSITIONS[detail.status] ||
                                            []
                                        ).map((st) => (
                                            <Button
                                                key={st}
                                                size="small"
                                                loading={statusSaving}
                                                onClick={() =>
                                                    patchReclamation(
                                                        { status: st },
                                                        'Статус обновлён'
                                                    )
                                                }
                                            >
                                                → {(STATUS_META[st] || {}).label ||
                                                    st}
                                            </Button>
                                        ))}
                                    </Space>
                                ) : null}

                                <Input.TextArea
                                    rows={2}
                                    placeholder="Комментарий к решению (виден в карточке)"
                                    value={resolutionComment}
                                    onChange={(e) =>
                                        setResolutionComment(e.target.value)
                                    }
                                />
                                <Space wrap>
                                    <Popconfirm
                                        title="Согласовать рекламацию?"
                                        okText="Согласовать"
                                        cancelText="Отмена"
                                        onConfirm={() =>
                                            handleResolve('approved')
                                        }
                                        disabled={!canResolve || statusSaving}
                                    >
                                        <Button
                                            type="primary"
                                            icon={<CheckCircleOutlined />}
                                            loading={statusSaving}
                                            disabled={!canResolve}
                                        >
                                            Согласовать
                                        </Button>
                                    </Popconfirm>
                                    <Popconfirm
                                        title="Отклонить рекламацию?"
                                        okText="Отклонить"
                                        okButtonProps={{ danger: true }}
                                        cancelText="Отмена"
                                        onConfirm={() =>
                                            handleResolve('rejected')
                                        }
                                        disabled={!canResolve || statusSaving}
                                    >
                                        <Button
                                            danger
                                            icon={<CloseCircleOutlined />}
                                            loading={statusSaving}
                                            disabled={!canResolve}
                                        >
                                            Отклонить
                                        </Button>
                                    </Popconfirm>
                                    {detail.resolution ? (
                                        <Tag
                                            color={
                                                detail.resolution === 'approved'
                                                    ? 'green'
                                                    : 'red'
                                            }
                                        >
                                            Решение:{' '}
                                            {detail.resolution === 'approved'
                                                ? 'согласовано'
                                                : 'отклонено'}
                                            {detail.resolved_at
                                                ? ` · ${fmtDateTime(detail.resolved_at)}`
                                                : ''}
                                        </Tag>
                                    ) : null}
                                </Space>
                            </Space>
                        </Card>

                        <Card size="small" title="Привязка клиента">
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Select
                                    showSearch
                                    placeholder="Выберите клиента"
                                    style={{ width: '100%' }}
                                    value={assignCustomerId}
                                    onChange={setAssignCustomerId}
                                    options={customerOptions}
                                    optionFilterProp="label"
                                />
                                <Space>
                                    <Select
                                        style={{ width: 260 }}
                                        value={rememberEmail}
                                        onChange={setRememberEmail}
                                        options={[
                                            {
                                                value: true,
                                                label: 'Запомнить адрес за клиентом',
                                            },
                                            {
                                                value: false,
                                                label: 'Только эту рекламацию',
                                            },
                                        ]}
                                    />
                                    <Button
                                        type="primary"
                                        loading={assigning}
                                        onClick={handleAssign}
                                    >
                                        Привязать
                                    </Button>
                                </Space>
                            </Space>
                        </Card>

                        <Card
                            size="small"
                            title={`Позиции (${(detail.items || []).length})`}
                        >
                            {(detail.items || []).length ? (
                                <Table
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                    dataSource={detail.items}
                                    columns={[
                                        {
                                            title: 'Артикул',
                                            dataIndex: 'oem_number',
                                            width: 120,
                                        },
                                        {
                                            title: 'Наименование',
                                            dataIndex: 'autopart_name',
                                            ellipsis: true,
                                        },
                                        {
                                            title: 'Кол-во',
                                            dataIndex: 'quantity',
                                            width: 64,
                                        },
                                        {
                                            title: 'Источник',
                                            key: 'item_source',
                                            width: 190,
                                            render: (_, item) => (
                                                <Select
                                                    size="small"
                                                    style={{ width: 180 }}
                                                    value={
                                                        item.item_source ||
                                                        'unknown'
                                                    }
                                                    loading={
                                                        itemSavingId === item.id
                                                    }
                                                    onChange={(val) =>
                                                        handleItemSource(
                                                            item,
                                                            val
                                                        )
                                                    }
                                                    options={
                                                        ITEM_SOURCE_OPTIONS
                                                    }
                                                />
                                            ),
                                        },
                                    ]}
                                />
                            ) : (
                                <Text type="secondary">
                                    Артикулы не распознаны — можно уточнить
                                    вручную позже.
                                </Text>
                            )}
                        </Card>

                        {(detail.attachments || []).length ? (
                            <Card size="small" title="Вложения">
                                <Space direction="vertical">
                                    {detail.attachments.map((att) => (
                                        <Text key={att.id}>
                                            <Tag>
                                                {ATTACHMENT_KIND_LABELS[
                                                    att.kind
                                                ] || att.kind}
                                            </Tag>
                                            {att.file_name}
                                        </Text>
                                    ))}
                                </Space>
                            </Card>
                        ) : null}

                        <Card
                            size="small"
                            title="Переписка"
                            extra={
                                <Space>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={openReplyModal}
                                        disabled={!detail.sender_email}
                                    >
                                        Ответить клиенту
                                    </Button>
                                    <Popconfirm
                                        title="Отправить запрос поставщику?"
                                        okText="Отправить"
                                        cancelText="Отмена"
                                        onConfirm={handleNotifySupplier}
                                    >
                                        <Button
                                            size="small"
                                            loading={supplierSaving}
                                        >
                                            Запросить у поставщика
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            }
                        >
                            <Table
                                rowKey="id"
                                size="small"
                                loading={emailsLoading}
                                pagination={false}
                                dataSource={emails}
                                locale={{ emptyText: 'Писем пока нет' }}
                                columns={[
                                    {
                                        title: 'Статус',
                                        dataIndex: 'status',
                                        width: 110,
                                        render: (v) => {
                                            const meta =
                                                OUTBOX_STATUS_META[v] || {
                                                    label: v,
                                                    color: 'default',
                                                };
                                            return (
                                                <Tag color={meta.color}>
                                                    {meta.label}
                                                </Tag>
                                            );
                                        },
                                    },
                                    {
                                        title: 'Кому',
                                        dataIndex: 'to_email',
                                        ellipsis: true,
                                        render: (v, row) => (
                                            <Space direction="vertical" size={0}>
                                                <Text>{v}</Text>
                                                <Text
                                                    type="secondary"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    {row.source_type ===
                                                    'reclamation_supplier'
                                                        ? 'поставщику'
                                                        : 'клиенту'}
                                                    {' · '}
                                                    {row.subject || ''}
                                                </Text>
                                            </Space>
                                        ),
                                    },
                                    {
                                        title: '',
                                        dataIndex: 'sent_at',
                                        width: 120,
                                        render: (v, row) =>
                                            v ? (
                                                fmtDateTime(v)
                                            ) : row.last_error ? (
                                                <Text
                                                    type="danger"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    попыток: {row.attempts}
                                                </Text>
                                            ) : (
                                                '—'
                                            ),
                                    },
                                ]}
                            />
                        </Card>

                        <Card size="small" title="Текст письма">
                            <Paragraph
                                style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
                                type="secondary"
                            >
                                {detail.email_body || '—'}
                            </Paragraph>
                        </Card>
                    </Space>
                ) : null}
            </Drawer>

            <Drawer
                open={statsOpen}
                width={760}
                title="Статистика возвратов"
                onClose={() => setStatsOpen(false)}
                extra={
                    <Space>
                        <RangePicker
                            value={statsPeriod}
                            format="DD.MM.YYYY"
                            onChange={(v) => {
                                const period = v || [];
                                setStatsPeriod(period);
                                void loadStats(period);
                            }}
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            loading={statsLoading}
                            onClick={() => loadStats(statsPeriod)}
                        />
                    </Space>
                }
            >
                {stats ? (
                    <Space
                        direction="vertical"
                        size="large"
                        style={{ width: '100%' }}
                    >
                        <Row gutter={[12, 12]}>
                            <Col xs={12} md={6}>
                                <Statistic title="Всего" value={stats.total} />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Ср. решение, дн."
                                    value={
                                        stats.avg_resolution_days ?? '—'
                                    }
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Согласовано"
                                    value={stats.by_resolution?.approved ?? 0}
                                    valueStyle={{ color: '#16a34a' }}
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Отклонено"
                                    value={stats.by_resolution?.rejected ?? 0}
                                    valueStyle={{ color: '#dc2626' }}
                                />
                            </Col>
                        </Row>

                        <Space wrap size={[4, 4]}>
                            <Text type="secondary">По типу:</Text>
                            {Object.entries(stats.by_type || {}).map(
                                ([k, v]) => (
                                    <Tag
                                        key={k}
                                        color={
                                            (TYPE_META[k] || {}).color ||
                                            'default'
                                        }
                                    >
                                        {(TYPE_META[k] || {}).label || k}: {v}
                                    </Tag>
                                )
                            )}
                            {!Object.keys(stats.by_type || {}).length ? (
                                <Text type="secondary">—</Text>
                            ) : null}
                        </Space>
                        <Space wrap size={[4, 4]}>
                            <Text type="secondary">По статусу:</Text>
                            {Object.entries(stats.by_status || {}).map(
                                ([k, v]) => (
                                    <Tag
                                        key={k}
                                        color={
                                            (STATUS_META[k] || {}).color ||
                                            'default'
                                        }
                                    >
                                        {(STATUS_META[k] || {}).label || k}: {v}
                                    </Tag>
                                )
                            )}
                        </Space>

                        <Card size="small" title="Топ клиентов">
                            <Table
                                rowKey={(r) => r.customer_id || r.customer_name}
                                size="small"
                                pagination={false}
                                dataSource={stats.top_customers}
                                locale={{ emptyText: 'Нет данных' }}
                                columns={[
                                    {
                                        title: 'Клиент',
                                        dataIndex: 'customer_name',
                                        render: (v) => v || '—',
                                    },
                                    {
                                        title: 'Всего',
                                        dataIndex: 'count',
                                        width: 80,
                                        align: 'right',
                                    },
                                    {
                                        title: 'Согл.',
                                        dataIndex: 'approved',
                                        width: 70,
                                        align: 'right',
                                    },
                                    {
                                        title: 'Откл.',
                                        dataIndex: 'rejected',
                                        width: 70,
                                        align: 'right',
                                    },
                                ]}
                            />
                        </Card>

                        <Card
                            size="small"
                            title="Топ поставщиков (транзитные возвраты)"
                        >
                            <Table
                                rowKey={(r) => r.provider_id || r.provider_name}
                                size="small"
                                pagination={false}
                                dataSource={stats.top_suppliers}
                                locale={{ emptyText: 'Нет данных' }}
                                columns={[
                                    {
                                        title: 'Поставщик',
                                        dataIndex: 'provider_name',
                                        render: (v) => v || '—',
                                    },
                                    {
                                        title: 'Рекламаций',
                                        dataIndex: 'reclamations',
                                        width: 110,
                                        align: 'right',
                                    },
                                    {
                                        title: 'Позиций',
                                        dataIndex: 'items',
                                        width: 90,
                                        align: 'right',
                                    },
                                ]}
                            />
                        </Card>

                        <Card size="small" title="Топ брендов">
                            <Table
                                rowKey={(r) => r.brand_name}
                                size="small"
                                pagination={false}
                                dataSource={stats.top_brands}
                                locale={{ emptyText: 'Нет данных' }}
                                columns={[
                                    {
                                        title: 'Бренд',
                                        dataIndex: 'brand_name',
                                        render: (v) => v || '—',
                                    },
                                    {
                                        title: 'Рекламаций',
                                        dataIndex: 'reclamations',
                                        width: 110,
                                        align: 'right',
                                    },
                                    {
                                        title: 'Кол-во',
                                        dataIndex: 'quantity',
                                        width: 90,
                                        align: 'right',
                                    },
                                ]}
                            />
                        </Card>

                        <Card size="small" title="По месяцам">
                            {(stats.by_month || []).length ? (
                                <Space
                                    direction="vertical"
                                    size={4}
                                    style={{ width: '100%' }}
                                >
                                    {stats.by_month.map((m) => {
                                        const max = Math.max(
                                            ...stats.by_month.map(
                                                (x) => x.count
                                            ),
                                            1
                                        );
                                        return (
                                            <div
                                                key={m.month}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        width: 64,
                                                        fontSize: 12,
                                                    }}
                                                    type="secondary"
                                                >
                                                    {m.month}
                                                </Text>
                                                <div
                                                    style={{
                                                        height: 14,
                                                        borderRadius: 3,
                                                        background: '#1677ff',
                                                        width: `${(m.count / max) * 100}%`,
                                                        minWidth: 2,
                                                    }}
                                                />
                                                <Text style={{ fontSize: 12 }}>
                                                    {m.count}
                                                </Text>
                                            </div>
                                        );
                                    })}
                                </Space>
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Нет данных"
                                />
                            )}
                        </Card>
                    </Space>
                ) : (
                    <Empty description="Нет данных за период" />
                )}
            </Drawer>

            <Modal
                open={createOpen}
                title="Завести рекламацию вручную"
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={creating}
                onOk={handleCreate}
                onCancel={() => setCreateOpen(false)}
            >
                <Form form={createForm} layout="vertical">
                    <Form.Item name="customer_id" label="Клиент">
                        <Select
                            allowClear
                            showSearch
                            placeholder="Клиент (если известен)"
                            options={customerOptions}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item name="source_link" label="Ссылка на портал">
                        <Input placeholder="https://portal.client.ru/..." />
                    </Form.Item>
                    <Form.Item name="subject" label="Тема">
                        <Input placeholder="Кратко о рекламации" />
                    </Form.Item>
                    <Form.Item name="body" label="Текст">
                        <Input.TextArea
                            rows={5}
                            placeholder="Вставьте текст рекламации / с портала. Система попробует распознать артикулы, документ и причину."
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={replyOpen}
                title="Ответ клиенту"
                okText="В очередь на отправку"
                cancelText="Отмена"
                confirmLoading={replySaving}
                width={640}
                onOk={handleSendReply}
                onCancel={() => setReplyOpen(false)}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Alert
                        type="info"
                        showIcon
                        message="Письмо уйдёт с адреса ящика рекламаций через внешний релей"
                        description={
                            detail?.sender_email
                                ? `Получатель: ${detail.sender_email}`
                                : 'У рекламации нет адреса отправителя'
                        }
                    />
                    <Space wrap>
                        <Text type="secondary">Шаблон:</Text>
                        <Select
                            style={{ width: 260 }}
                            value={replyKind}
                            onChange={setReplyKind}
                            options={REPLY_KIND_OPTIONS}
                        />
                        <Button
                            loading={replyTplLoading}
                            onClick={() => loadReplyTemplate(replyKind)}
                        >
                            Подставить шаблон
                        </Button>
                    </Space>
                    <Input
                        placeholder="Тема письма (по умолчанию Re: тема рекламации)"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                    />
                    <Input.TextArea
                        rows={10}
                        placeholder="Текст письма — нажмите «Подставить шаблон» и при необходимости отредактируйте"
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                    />
                </Space>
            </Modal>
        </Card>
    );
};

export default ReclamationsPage;
