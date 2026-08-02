import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
    Tooltip,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    BarChartOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    CloudDownloadOutlined,
    ExclamationCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SendOutlined,
    SyncOutlined,
    UploadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    applyAndSendReclamationReply,
    assignReclamationCustomer,
    assignShortageReviewer,
    checkReclamation,
    confirmReclamationShortage,
    createReclamation,
    downloadReclamationAttachment,
    getReclamation,
    getReclamationEmails,
    getReclamationUkdDraft,
    getReclamationStats,
    getReclamationsSummary,
    getReplyTemplate,
    listReclamations,
    listReclamationAssignees,
    linkReclamationUkdDraftSource,
    notifyReclamationSupplier,
    postponeReclamationShortage,
    rematchReclamationUkdDraft,
    refreshReclamationArmtek,
    refreshReclamationFroza,
    sendReclamationArmtekDecision,
    sendReclamationReply,
    sendReclamationFrozaDecision,
    decideReclamationUkdDraft,
    syncReclamationArmtek,
    syncReclamations,
    updateReclamation,
    updateReclamationItem,
    uploadReclamationShortageEvidence,
} from '../api/reclamations';
import { getCustomersSummary } from '../api/customers';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const downloadAttachment = async (reclamationId, attachment) => {
    const response = await downloadReclamationAttachment(
        reclamationId,
        attachment.id,
    );
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.file_name || `attachment-${attachment.id}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

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

const RETURN_STATUS_META = {
    created: { label: 'Черновик', color: 'default' },
    approved: { label: 'Возврат согласован', color: 'blue' },
    shipped: { label: 'Товар едет на склад', color: 'gold' },
    confirmed: { label: 'Принят складом', color: 'green' },
    rejected: { label: 'Возврат отклонён', color: 'red' },
};

const TYPE_META = {
    customer_refusal: { label: 'Отказ клиента', color: 'blue' },
    defect: { label: 'Брак', color: 'volcano' },
    shortage: { label: 'Недовоз', color: 'gold' },
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
    shortage_evidence: 'Фото/видео проверки недовоза',
    other: 'Прочее',
};

const FROZA_STATE_META = {
    pending: { label: 'Ожидает ответа', color: 'gold' },
    approved: { label: 'Согласовано во Froza', color: 'green' },
    rejected: { label: 'Отклонено во Froza', color: 'red' },
    archived: { label: 'Архив Froza', color: 'default' },
    unknown: { label: 'Неизвестное состояние', color: 'default' },
};

const ARMTEK_STATE_META = {
    pending: { label: 'Ожидает решения', color: 'gold' },
    approved: { label: 'Согласовано в Armtek', color: 'green' },
    rejected: { label: 'Отклонено в Armtek', color: 'red' },
    closed: { label: 'Закрыто в Armtek', color: 'default' },
    unknown: { label: 'Неизвестное состояние', color: 'default' },
};

const EVENT_LABELS = {
    created_from_email: 'Создана из письма',
    created_manually: 'Создана вручную',
    thread_message_received: 'Получен новый ответ клиента',
    customer_assigned: 'Привязан клиент',
    shortage_reviewer_assigned: 'Назначена проверка недовоза',
    shortage_confirmed: 'Проверен недовоз',
    shortage_postponed: 'Проверка отложена',
    shortage_evidence_uploaded: 'Добавлены фото/видео',
    customer_reply_queued: 'Ответ клиенту поставлен в очередь',
    decision_and_reply_queued: 'Решение применено, ответ в очереди',
    supplier_request_queued: 'Запрос поставщику поставлен в очередь',
    email_sent: 'Письмо отправлено',
    email_send_failed: 'Ошибка отправки письма',
    check_run: 'Выполнена проверка',
    froza_refreshed: 'Обновлена заявка Froza',
    froza_decision_sent: 'Решение отправлено во Froza',
    armtek_refreshed: 'Обновлена заявка Armtek',
    armtek_decision_sent: 'Решение отправлено в Armtek',
    reclamation_updated: 'Изменена рекламация',
    item_updated: 'Изменена позиция',
    ukd_draft_created: 'Создан безопасный черновик возврата/УКД',
    ukd_draft_rematched: 'Повторно сопоставлена исходная УПД',
    ukd_source_linked: 'Вручную привязана исходная УПД',
    ukd_return_decided: 'Принято решение по документу возврата',
};

const formatEventDetails = (details) => {
    if (!details || !Object.keys(details).length) {
        return '—';
    }
    return Object.entries(details)
        .map(([key, value]) => {
            const rendered = typeof value === 'object'
                ? JSON.stringify(value)
                : String(value ?? '—');
            return `${key}: ${rendered}`;
        })
        .join(' · ');
};

const isFrozaQuestionLink = (value) => {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:'
            && ['froza.ru', 'www.froza.ru'].includes(url.hostname)
            && url.pathname.replace(/\/$/, '') === '/supplier/one-question'
        );
    } catch {
        return false;
    }
};

const isArmtekReturnLink = (value) => {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:'
            && url.hostname === 'srm.armtek.ru'
            && url.pathname.startsWith('/returns-management/opened/')
            && Boolean(url.searchParams.get('RequestPosition'))
        );
    } catch {
        return false;
    }
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
};

const SUPPLIER_ACTION_META = {
    request_supplier: {
        label: 'Поставщик: запросить согласование',
        alert: 'warning',
    },
    unavailable: {
        label: 'Поставщик: возврат недоступен',
        alert: 'error',
    },
    manual: {
        label: 'Поставщик: требуется уточнение',
        alert: 'info',
    },
    not_required: {
        label: 'Поставщик: согласование не требуется',
        alert: 'success',
    },
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
    { value: 'shortage_confirmed', label: 'Подтверждение недовоза' },
];

const SHORTAGE_STATUS_META = {
    pending_confirmation: { label: 'Ожидает проверки', color: 'gold' },
    confirmed: { label: 'Недовоз подтверждён', color: 'green' },
    not_confirmed: { label: 'Недовоз не подтверждён', color: 'red' },
};

const REJECTION_REASON_OPTIONS = [
    { value: 'Истёк установленный срок возврата', label: 'Истёк срок возврата' },
    {
        value: 'Товар утратил товарный вид',
        label: 'Утрачен товарный вид',
    },
    {
        value: 'Обнаружены следы установки или эксплуатации товара',
        label: 'Следы установки или эксплуатации',
    },
    {
        value: 'Нарушена упаковка или отсутствует часть комплектации',
        label: 'Неполная комплектация или упаковка',
    },
    {
        value: 'Обнаружено механическое повреждение товара',
        label: 'Механическое повреждение',
    },
    {
        value: 'Не подтверждена покупка указанной позиции у нашей компании',
        label: 'Покупка у нас не подтверждена',
    },
    {
        value: 'Заявленная позиция не соответствует данным заказа',
        label: 'Позиция не соответствует заказу',
    },
    {
        value: 'Не предоставлены обязательные документы для рассмотрения брака',
        label: 'Не предоставлены документы',
    },
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

// Во всех очередях сначала показываем самые свежие рекламации.
const QUEUES = [
    {
        key: 'attention',
        label: 'Требуют внимания',
        statuses: ['new', 'recognized'],
        order: 'newest',
    },
    {
        key: 'checked',
        label: 'Проверены',
        statuses: ['checked'],
        order: 'newest',
    },
    {
        key: 'waiting_docs',
        label: 'Ждут документы',
        statuses: ['waiting_docs'],
        order: 'newest',
    },
    {
        key: 'waiting_supplier',
        label: 'Ждут поставщика',
        statuses: ['waiting_supplier'],
        order: 'newest',
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
    const [searchParams] = useSearchParams();
    const [summary, setSummary] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [queueKey, setQueueKey] = useState('attention');
    const [syncing, setSyncing] = useState(false);
    const [armtekSyncing, setArmtekSyncing] = useState(false);
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
    const [frozaLoading, setFrozaLoading] = useState(false);
    const [armtekLoading, setArmtekLoading] = useState(false);
    const [emails, setEmails] = useState([]);
    const [emailsLoading, setEmailsLoading] = useState(false);
    const [supplierSaving, setSupplierSaving] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyKind, setReplyKind] = useState('approved');
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [replyTplLoading, setReplyTplLoading] = useState(false);
    const [replySaving, setReplySaving] = useState(false);
    const [replyPendingAction, setReplyPendingAction] = useState(null);
    const [shortageAssignees, setShortageAssignees] = useState([]);
    const [shortageAssigneeId, setShortageAssigneeId] = useState(null);
    const [shortageComment, setShortageComment] = useState('');
    const [shortageSaving, setShortageSaving] = useState(false);
    const [shortageEvidence, setShortageEvidence] = useState([]);
    const [shortagePostponeMinutes, setShortagePostponeMinutes] = useState(15);
    const [ukdDraft, setUkdDraft] = useState(null);
    const [ukdLoading, setUkdLoading] = useState(false);
    const [ukdSaving, setUkdSaving] = useState(false);
    const [ukdShipmentId, setUkdShipmentId] = useState('');
    const [ukdSourceDocumentId, setUkdSourceDocumentId] = useState('');

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

    const loadCustomerOptions = useCallback(async (search = '') => {
        try {
            const { data } = await getCustomersSummary({
                page: 1,
                page_size: 200,
                search: search.trim() || undefined,
            });
            const items = Array.isArray(data?.items) ? data.items : [];
            setCustomerOptions(
                items.map((customer) => ({
                    value: customer.id,
                    label: `${customer.name} (ID: ${customer.id})`,
                }))
            );
        } catch {
            setCustomerOptions([]);
        }
    }, []);

    useEffect(() => {
        void loadCustomerOptions();
    }, [loadCustomerOptions]);

    useEffect(() => {
        const loadAssignees = async () => {
            try {
                const { data } = await listReclamationAssignees();
                setShortageAssignees(
                    (Array.isArray(data) ? data : []).map((user) => ({
                        value: user.id,
                        label: user.name
                            ? `${user.name} · ${user.email}`
                            : user.email,
                    }))
                );
            } catch {
                setShortageAssignees([]);
            }
        };
        void loadAssignees();
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
            } else if (data?.armtek_errors?.length) {
                message.warning(
                    `Почта проверена, но Armtek не синхронизирован: ${data.armtek_errors.join('; ')}`
                );
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

    const handleArmtekSync = async () => {
        setArmtekSyncing(true);
        try {
            const { data } = await syncReclamationArmtek();
            message.success(
                `Armtek: найдено ${data.found}, новых ${data.created}, обновлено ${data.updated}`
            );
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось загрузить возвраты из Armtek'
            );
        } finally {
            setArmtekSyncing(false);
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

    const loadUkdDraft = async (id) => {
        setUkdLoading(true);
        try {
            const { data } = await getReclamationUkdDraft(id);
            setUkdDraft(data || null);
            setUkdShipmentId(data?.shipment_document_id || '');
            setUkdSourceDocumentId(
                data?.source_diadoc_outgoing_document_id || '',
            );
        } catch (err) {
            if (err?.response?.status !== 404) {
                message.error(
                    err?.response?.data?.detail
                    || 'Не удалось загрузить черновик УКД',
                );
            }
            setUkdDraft(null);
        } finally {
            setUkdLoading(false);
        }
    };

    const refreshCorrespondence = async () => {
        if (!detail) {
            return;
        }
        setEmailsLoading(true);
        try {
            const [emailsResponse, detailResponse] = await Promise.all([
                getReclamationEmails(detail.id),
                getReclamation(detail.id),
            ]);
            setEmails(
                Array.isArray(emailsResponse.data)
                    ? emailsResponse.data
                    : []
            );
            applyDetailUpdate(detailResponse.data);
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось обновить статус переписки'
            );
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
            if (data.customer_id) {
                setCustomerOptions((current) => {
                    if (
                        current.some(
                            (option) => option.value === data.customer_id
                        )
                    ) {
                        return current;
                    }
                    return [
                        {
                            value: data.customer_id,
                            label: `${data.customer_name || 'Клиент'} (ID: ${data.customer_id})`,
                        },
                        ...current,
                    ];
                });
            }
            setRememberEmail(true);
            setResolutionComment(data.resolution_comment || '');
            setShortageAssigneeId(
                data.shortage_assigned_to_user_id || null
            );
            setShortageComment(data.shortage_comment || '');
            setShortageEvidence([]);
            setShortagePostponeMinutes(15);
            setDetailOpen(true);
            void loadEmails(id);
            void loadUkdDraft(id);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось открыть рекламацию'
            );
        }
    };

    const handleUkdRematch = async () => {
        if (!detail) return;
        setUkdSaving(true);
        try {
            const { data } = await rematchReclamationUkdDraft(detail.id);
            setUkdDraft(data);
            setUkdShipmentId(data?.shipment_document_id || '');
            setUkdSourceDocumentId(
                data?.source_diadoc_outgoing_document_id || '',
            );
            message.success('Исходная реализация и УПД проверены повторно');
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось повторить поиск',
            );
        } finally {
            setUkdSaving(false);
        }
    };

    const handleUkdLink = async () => {
        if (!detail) return;
        const shipmentId = Number(ukdShipmentId);
        const sourceId = Number(ukdSourceDocumentId);
        if (!Number.isInteger(shipmentId) || !Number.isInteger(sourceId)) {
            message.warning('Укажите ID реализации и исходящей УПД');
            return;
        }
        setUkdSaving(true);
        try {
            const { data } = await linkReclamationUkdDraftSource(detail.id, {
                shipment_document_id: shipmentId,
                source_diadoc_outgoing_document_id: sourceId,
            });
            setUkdDraft(data);
            message.success('Исходная реализация и УПД привязаны');
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось привязать УПД',
            );
        } finally {
            setUkdSaving(false);
        }
    };

    const handleUkdDecision = async (decision) => {
        if (!detail) return;
        const comment = String(resolutionComment || '').trim();
        if (decision === 'rejected' && !comment) {
            message.warning('Для отказа укажите причину');
            return;
        }
        setUkdSaving(true);
        try {
            const { data } = await decideReclamationUkdDraft(detail.id, {
                decision,
                comment: comment || null,
            });
            setUkdDraft(data);
            const response = await getReclamation(detail.id);
            applyDetailUpdate(response.data);
            message.success(
                decision === 'approved'
                    ? 'Возврат коммерчески согласован'
                    : 'Возврат отклонён',
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось сохранить решение',
            );
        } finally {
            setUkdSaving(false);
        }
    };

    const requestedOpenId = searchParams.get('openId');
    useEffect(() => {
        const reclamationId = Number(requestedOpenId);
        if (Number.isInteger(reclamationId) && reclamationId > 0) {
            void openDetail(reclamationId);
        }
        // openDetail intentionally runs only when the requested id changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedOpenId]);

    const openReplyModal = () => {
        const kind =
            detail?.reclamation_type === 'shortage'
                && detail?.shortage_status === 'confirmed'
                ? 'shortage_confirmed'
                : detail?.resolution === 'rejected'
                ? 'rejected'
                : detail?.resolution === 'approved'
                    ? 'approved'
                    : 'ack';
        setReplyKind(kind);
        setReplySubject('');
        setReplyBody('');
        setReplyPendingAction(null);
        setReplyOpen(true);
        void loadReplyTemplate(
            kind,
            kind === 'rejected' ? resolutionComment : null,
        );
    };

    const openShortageReply = () => {
        setReplyKind('shortage_confirmed');
        setReplySubject('');
        setReplyBody('');
        setReplyPendingAction(null);
        setReplyOpen(true);
        void loadReplyTemplate('shortage_confirmed');
    };

    const loadReplyTemplate = async (kind, commentOverride = null) => {
        if (!detail) {
            return;
        }
        setReplyTplLoading(true);
        try {
            const { data } = await getReplyTemplate(
                detail.id,
                kind,
                commentOverride,
            );
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

    const openActionReply = (action, commentOverride = null) => {
        if (!detail) {
            return;
        }
        const comment = String(
            commentOverride ?? resolutionComment ?? '',
        ).trim();
        if (action === 'rejected' && !comment) {
            message.warning('Для отказа обязательно укажите причину');
            return;
        }
        setReplyKind(action);
        setReplySubject('');
        setReplyBody('');
        setReplyPendingAction({
            action,
            resolution_comment: comment || null,
        });
        setReplyOpen(true);
        void loadReplyTemplate(action, comment || null);
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
            if (replyPendingAction) {
                await applyAndSendReclamationReply(detail.id, {
                    ...replyPendingAction,
                    subject: replySubject || null,
                    body_text: replyBody,
                });
                const { data } = await getReclamation(detail.id);
                applyDetailUpdate(data);
                setResolutionComment(data.resolution_comment || '');
                message.success(
                    replyPendingAction.action === 'request_documents'
                        ? 'Запрос документов поставлен в очередь отправки'
                        : 'Решение сохранено, ответ поставлен в очередь отправки',
                );
            } else {
                await sendReclamationReply(detail.id, {
                    kind: replyKind,
                    subject: replySubject || null,
                    body_text: replyBody,
                });
                message.success('Ответ поставлен в очередь отправки');
            }
            setReplyOpen(false);
            setReplyPendingAction(null);
            await loadEmails(detail.id);
            await load();
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

    const handleAssignShortage = async () => {
        if (!detail || !shortageAssigneeId) {
            message.warning('Выберите ответственного сотрудника');
            return;
        }
        setShortageSaving(true);
        try {
            const { data } = await assignShortageReviewer(detail.id, {
                user_id: shortageAssigneeId,
            });
            applyDetailUpdate(data);
            setShortageComment('');
            message.success(
                'Ответственный назначен, уведомление отправлено'
            );
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось назначить ответственного'
            );
        } finally {
            setShortageSaving(false);
        }
    };

    const handleConfirmShortage = async (confirmed) => {
        if (!detail) {
            return;
        }
        setShortageSaving(true);
        try {
            if (!confirmed && shortageEvidence.length) {
                await uploadReclamationShortageEvidence(
                    detail.id,
                    shortageEvidence
                );
            }
            const { data } = await confirmReclamationShortage(detail.id, {
                confirmed,
                comment: shortageComment.trim() || null,
            });
            applyDetailUpdate(data);
            setShortageEvidence([]);
            setResolutionComment(data.resolution_comment || '');
            message.success(
                confirmed
                    ? 'Недовоз подтверждён'
                    : 'Зафиксировано: недовоз не подтверждён'
            );
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить проверку недовоза'
            );
        } finally {
            setShortageSaving(false);
        }
    };

    const handlePostponeShortage = async () => {
        if (!detail) {
            return;
        }
        setShortageSaving(true);
        try {
            const { data } = await postponeReclamationShortage(detail.id, {
                minutes: shortagePostponeMinutes,
            });
            applyDetailUpdate(data);
            message.success(
                `Проверка отложена на ${shortagePostponeMinutes} мин.`
            );
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отложить проверку недовоза'
            );
        } finally {
            setShortageSaving(false);
        }
    };

    const handleRefreshFroza = async () => {
        if (!detail) {
            return;
        }
        setFrozaLoading(true);
        try {
            const { data } = await refreshReclamationFroza(detail.id);
            applyDetailUpdate(data);
            message.success('Состояние заявки Froza обновлено');
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось проверить заявку во Froza'
            );
        } finally {
            setFrozaLoading(false);
        }
    };

    const handleSendFrozaDecision = async () => {
        if (!detail) {
            return;
        }
        setFrozaLoading(true);
        try {
            const { data } = await sendReclamationFrozaDecision(detail.id, {
                comment: resolutionComment.trim() || null,
            });
            applyDetailUpdate(data);
            message.success('Решение передано во Froza и подтверждено');
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось передать решение во Froza'
            );
        } finally {
            setFrozaLoading(false);
        }
    };

    const handleRefreshArmtek = async () => {
        if (!detail) {
            return;
        }
        setArmtekLoading(true);
        try {
            const { data } = await refreshReclamationArmtek(detail.id);
            applyDetailUpdate(data);
            message.success('Состояние заявки Armtek обновлено');
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось проверить заявку в Armtek'
            );
        } finally {
            setArmtekLoading(false);
        }
    };

    const handleSendArmtekDecision = async () => {
        if (!detail) {
            return;
        }
        setArmtekLoading(true);
        try {
            const { data } = await sendReclamationArmtekDecision(detail.id, {
                comment: resolutionComment.trim() || null,
            });
            applyDetailUpdate(data);
            message.success('Решение передано в Armtek и подтверждено');
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось передать решение в Armtek'
            );
        } finally {
            setArmtekLoading(false);
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

    const handleApplyRecommendationAndReply = () => {
        const code = detail?.check_result?.recommendation_code;
        const action = RECOMMENDATION_ACTION[code];
        const replyAction =
            action?.resolution
            || (code === 'request_documents' ? 'request_documents' : null);
        if (!replyAction) {
            message.info('Эта рекомендация не предполагает готового ответа');
            return;
        }
        const comment =
            resolutionComment
            || detail?.check_result?.summary
            || '';
        openActionReply(replyAction, comment);
    };

    const handleResolve = (resolution) => {
        if (resolution === 'rejected' && !resolutionComment.trim()) {
            message.warning('Для отказа обязательно укажите причину');
            return;
        }
        void patchReclamation(
            {
                resolution,
                resolution_comment: resolutionComment || null,
            },
            resolution === 'approved'
                ? 'Рекламация согласована'
                : 'Рекламация отклонена'
        );
    };

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

    const handleItemProvider = async (item, providerId) => {
        if (!detail) {
            return;
        }
        setItemSavingId(item.id);
        try {
            const { data } = await updateReclamationItem(
                detail.id,
                item.id,
                { source_provider_id: providerId }
            );
            const { data: checkedData } = await checkReclamation(data.id);
            applyDetailUpdate(checkedData);
            message.success('Поставщик позиции сохранён');
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить поставщика позиции'
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
    const latestCustomerReply = emails.find(
        (row) => row.source_type === 'reclamation'
    ) || null;
    const latestSupplierRequest = emails.find(
        (row) => row.source_type === 'reclamation_supplier'
    ) || null;
    const incomingThreadMessages = Array.isArray(
        detail?.extracted_data?.thread_messages,
    )
        ? detail.extracted_data.thread_messages
        : [];
    const customerCandidates = Array.isArray(
        detail?.extracted_data?.customer_candidates,
    )
        ? detail.extracted_data.customer_candidates
        : [];
    const supplierRequestQueued = ['pending', 'sent'].includes(
        latestSupplierRequest?.status,
    );
    const sourceMailboxState = detail?.extracted_data?.mailbox || {};
    const isFrozaReclamation = isFrozaQuestionLink(detail?.source_link);
    const frozaSnapshot = detail?.extracted_data?.froza || null;
    const frozaStateMeta = FROZA_STATE_META[
        frozaSnapshot?.state || 'unknown'
    ];
    const frozaBlockingReasons = Array.isArray(
        frozaSnapshot?.blocking_reasons
    )
        ? frozaSnapshot.blocking_reasons
        : [];
    const frozaDecisionReady =
        Boolean(detail?.resolution)
        && frozaSnapshot?.state === 'pending'
        && frozaBlockingReasons.length === 0
        && !(
            detail?.resolution === 'rejected'
            && !resolutionComment.trim()
        );
    const frozaReplyDisabledReason = !detail?.resolution
        ? 'Сначала сохраните согласование или отказ в блоке «Обработка»'
        : frozaBlockingReasons.length
            ? frozaBlockingReasons.join('. ')
            : detail.resolution === 'rejected'
                && !resolutionComment.trim()
                ? 'Для отказа заполните комментарий к решению'
                : '';
    const isArmtekReclamation = isArmtekReturnLink(detail?.source_link);
    const armtekSnapshot = detail?.extracted_data?.armtek || null;
    const armtekStateMeta = ARMTEK_STATE_META[
        armtekSnapshot?.state || 'unknown'
    ];
    const armtekBlockingReasons = Array.isArray(
        armtekSnapshot?.blocking_reasons
    )
        ? armtekSnapshot.blocking_reasons
        : [];
    const armtekDecisionReady =
        Boolean(detail?.resolution)
        && armtekSnapshot?.state === 'pending'
        && armtekBlockingReasons.length === 0
        && !(
            detail?.resolution === 'rejected'
            && !resolutionComment.trim()
        );

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
                            icon={<SyncOutlined />}
                            loading={armtekSyncing}
                            onClick={handleArmtekSync}
                        >
                            Получить из Armtek
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
                                                <Space wrap>
                                                    <Button
                                                        size="small"
                                                        loading={statusSaving}
                                                        onClick={
                                                            handleApplyRecommendation
                                                        }
                                                    >
                                                        Применить
                                                    </Button>
                                                    {[
                                                        'approve',
                                                        'reject',
                                                        'request_documents',
                                                    ].includes(
                                                        detail.check_result
                                                            .recommendation_code,
                                                    )
                                                        && !isFrozaReclamation
                                                        && !isArmtekReclamation ? (
                                                            <Button
                                                                size="small"
                                                                type="primary"
                                                                icon={
                                                                    <SendOutlined />
                                                                }
                                                                disabled={
                                                                    !canResolve
                                                                    || !detail.sender_email
                                                                }
                                                                onClick={
                                                                    handleApplyRecommendationAndReply
                                                                }
                                                            >
                                                                {detail.check_result
                                                                    .recommendation_code
                                                                    === 'request_documents'
                                                                    ? 'Применить и запросить документы'
                                                                    : 'Применить и ответить'}
                                                            </Button>
                                                        ) : null}
                                                </Space>
                                            ) : null
                                        }
                                    />

                                    {detail.check_result
                                        .supplier_action_code ? (
                                            <Alert
                                                type={
                                                    (SUPPLIER_ACTION_META[
                                                        detail.check_result
                                                            .supplier_action_code
                                                    ] || {}).alert || 'info'
                                                }
                                                showIcon
                                                message={
                                                    (SUPPLIER_ACTION_META[
                                                        detail.check_result
                                                            .supplier_action_code
                                                    ] || {}).label
                                                    || detail.check_result
                                                        .supplier_action_code
                                                }
                                                description={
                                                    [
                                                        detail.check_result
                                                            .supplier_summary,
                                                        latestSupplierRequest
                                                            ? latestSupplierRequest
                                                                .status
                                                                === 'sent'
                                                                ? `Последний запрос отправлен ${fmtDateTime(
                                                                    latestSupplierRequest
                                                                        .sent_at,
                                                                )}.`
                                                                : latestSupplierRequest
                                                                    .status
                                                                    === 'pending'
                                                                    ? 'Последний запрос находится в очереди отправки.'
                                                                    : `Ошибка отправки: ${
                                                                        latestSupplierRequest
                                                                            .last_error
                                                                        || 'причина не указана'
                                                                    }`
                                                            : null,
                                                    ].filter(Boolean).join(' ')
                                                    || null
                                                }
                                                action={
                                                    detail.check_result
                                                        .supplier_action_code
                                                        === 'request_supplier'
                                                        && !supplierRequestQueued ? (
                                                            <Popconfirm
                                                                title="Отправить запрос поставщику?"
                                                                description="Решение клиенту не изменится. Письмо поставщику будет поставлено в очередь локального релея."
                                                                okText="Отправить"
                                                                cancelText="Отмена"
                                                                onConfirm={
                                                                    handleNotifySupplier
                                                                }
                                                            >
                                                                <Button
                                                                    size="small"
                                                                    type="primary"
                                                                    icon={
                                                                        <SendOutlined />
                                                                    }
                                                                    loading={
                                                                        supplierSaving
                                                                    }
                                                                >
                                                                    Запросить у
                                                                    поставщика
                                                                </Button>
                                                            </Popconfirm>
                                                        ) : null
                                                }
                                            />
                                        ) : null}

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

                        {detail.reclamation_type === 'shortage' ? (
                            <Card
                                size="small"
                                title="Проверка недовоза"
                                extra={
                                    detail.shortage_status ? (
                                        <Tag
                                            color={
                                                (
                                                    SHORTAGE_STATUS_META[
                                                        detail.shortage_status
                                                    ] || {}
                                                ).color || 'default'
                                            }
                                        >
                                            {
                                                (
                                                    SHORTAGE_STATUS_META[
                                                        detail.shortage_status
                                                    ] || {}
                                                ).label
                                                || detail.shortage_status
                                            }
                                        </Tag>
                                    ) : null
                                }
                            >
                                <Space
                                    direction="vertical"
                                    size="middle"
                                    style={{ width: '100%' }}
                                >
                                    <Alert
                                        type="info"
                                        showIcon
                                        message="Факт недовоза подтверждает сотрудник"
                                        description="Отсутствие проведённой отгрузки в системе не является автоматическим подтверждением: нужно проверить фактическую комплектацию заказа."
                                    />
                                    <Space.Compact
                                        style={{ width: '100%' }}
                                    >
                                        <Select
                                            showSearch
                                            optionFilterProp="label"
                                            style={{ flex: 1 }}
                                            placeholder="Ответственный сотрудник"
                                            value={shortageAssigneeId}
                                            options={shortageAssignees}
                                            onChange={setShortageAssigneeId}
                                        />
                                        <Button
                                            loading={shortageSaving}
                                            disabled={!shortageAssigneeId}
                                            onClick={handleAssignShortage}
                                        >
                                            Назначить
                                        </Button>
                                    </Space.Compact>
                                    {detail.shortage_assigned_to_user_name ? (
                                        <Text type="secondary">
                                            Назначен:{' '}
                                            <Text strong>
                                                {
                                                    detail.shortage_assigned_to_user_name
                                                }
                                            </Text>
                                            {detail.shortage_assigned_at
                                                ? ` · ${fmtDateTime(detail.shortage_assigned_at)}`
                                                : ''}
                                        </Text>
                                    ) : null}
                                    <Input.TextArea
                                        rows={2}
                                        value={shortageComment}
                                        onChange={(event) =>
                                            setShortageComment(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Комментарий проверяющего (необязательно)"
                                    />
                                    <Upload
                                        accept="image/*,video/*"
                                        multiple
                                        maxCount={5}
                                        beforeUpload={() => false}
                                        fileList={shortageEvidence}
                                        onChange={({ fileList }) =>
                                            setShortageEvidence(fileList)
                                        }
                                    >
                                        <Button icon={<UploadOutlined />}>
                                            Фото или видео отгрузки
                                        </Button>
                                    </Upload>
                                    <Text type="secondary">
                                        При опровержении недовоза файлы
                                        желательны, но не обязательны.
                                    </Text>
                                    <Space wrap>
                                        <Popconfirm
                                            title="Подтвердить факт недовоза?"
                                            okText="Подтвердить"
                                            cancelText="Отмена"
                                            onConfirm={() =>
                                                handleConfirmShortage(true)
                                            }
                                        >
                                            <Button
                                                type="primary"
                                                icon={
                                                    <CheckCircleOutlined />
                                                }
                                                loading={shortageSaving}
                                            >
                                                Недовоз подтверждён
                                            </Button>
                                        </Popconfirm>
                                        <Popconfirm
                                            title="Зафиксировать, что недовоз не подтверждён?"
                                            okText="Зафиксировать"
                                            cancelText="Отмена"
                                            onConfirm={() =>
                                                handleConfirmShortage(false)
                                            }
                                        >
                                            <Button
                                                danger
                                                icon={
                                                    <CloseCircleOutlined />
                                                }
                                                loading={shortageSaving}
                                            >
                                                Недовоз не подтверждён
                                            </Button>
                                        </Popconfirm>
                                        <Space.Compact>
                                            <Select
                                                value={
                                                    shortagePostponeMinutes
                                                }
                                                style={{ width: 130 }}
                                                options={[
                                                    {
                                                        value: 15,
                                                        label: 'На 15 минут',
                                                    },
                                                    {
                                                        value: 30,
                                                        label: 'На 30 минут',
                                                    },
                                                    {
                                                        value: 60,
                                                        label: 'На 1 час',
                                                    },
                                                ]}
                                                onChange={
                                                    setShortagePostponeMinutes
                                                }
                                            />
                                            <Button
                                                icon={
                                                    <ClockCircleOutlined />
                                                }
                                                loading={shortageSaving}
                                                onClick={
                                                    handlePostponeShortage
                                                }
                                            >
                                                Отложить
                                            </Button>
                                        </Space.Compact>
                                        {detail.shortage_status
                                            === 'confirmed' ? (
                                                <Button
                                                    icon={<SendOutlined />}
                                                    onClick={
                                                        openShortageReply
                                                    }
                                                    disabled={
                                                        !detail.sender_email
                                                    }
                                                >
                                                    Ответить с извинениями
                                                </Button>
                                            ) : null}
                                    </Space>
                                    {detail.shortage_snoozed_until ? (
                                        <Text type="secondary">
                                            Отложено до:{' '}
                                            {fmtDateTime(
                                                detail
                                                    .shortage_snoozed_until
                                            )}
                                        </Text>
                                    ) : null}
                                    {detail.shortage_confirmed_by_user_name ? (
                                        <Alert
                                            type={
                                                detail.shortage_status
                                                    === 'confirmed'
                                                    ? 'success'
                                                    : 'warning'
                                            }
                                            showIcon
                                            message={
                                                detail.shortage_status
                                                    === 'confirmed'
                                                    ? 'Недовоз подтверждён'
                                                    : 'Недовоз не подтверждён'
                                            }
                                            description={
                                                <>
                                                    Проверил:{' '}
                                                    {
                                                        detail.shortage_confirmed_by_user_name
                                                    }
                                                    {detail.shortage_confirmed_at
                                                        ? ` · ${fmtDateTime(detail.shortage_confirmed_at)}`
                                                        : ''}
                                                    {detail.shortage_comment
                                                        ? ` · ${detail.shortage_comment}`
                                                        : ''}
                                                </>
                                            }
                                        />
                                    ) : null}
                                </Space>
                            </Card>
                        ) : null}

                        {isFrozaReclamation ? (
                            <Card
                                size="small"
                                title="Заявка Froza"
                                extra={(
                                    <Button
                                        size="small"
                                        icon={<SyncOutlined />}
                                        loading={frozaLoading}
                                        onClick={handleRefreshFroza}
                                    >
                                        Проверить
                                    </Button>
                                )}
                            >
                                {frozaSnapshot ? (
                                    <Space
                                        direction="vertical"
                                        size="middle"
                                        style={{ width: '100%' }}
                                    >
                                        <Descriptions
                                            size="small"
                                            bordered
                                            column={{ xs: 1, sm: 2 }}
                                        >
                                            <Descriptions.Item label="Заявка">
                                                №{frozaSnapshot.question_id || '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Состояние">
                                                <Tag color={frozaStateMeta.color}>
                                                    {frozaStateMeta.label}
                                                </Tag>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Позиция">
                                                <Text strong>
                                                    {frozaSnapshot.brand_name || ''}{' '}
                                                    {frozaSnapshot.oem_number || '—'}
                                                </Text>
                                                {frozaSnapshot.autopart_name
                                                    ? ` · ${frozaSnapshot.autopart_name}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Количество">
                                                {frozaSnapshot.quantity ?? '—'} шт.
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Документ">
                                                {frozaSnapshot.invoice_number || '—'}
                                                {frozaSnapshot.invoice_date
                                                    ? ` от ${dayjs(frozaSnapshot.invoice_date).format('DD.MM.YYYY')}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Проверено">
                                                {fmtDateTime(
                                                    frozaSnapshot.checked_at
                                                )}
                                            </Descriptions.Item>
                                        </Descriptions>

                                        {frozaBlockingReasons.length ? (
                                            <Alert
                                                type="error"
                                                showIcon
                                                message="Решение нельзя отправить"
                                                description={frozaBlockingReasons.join(
                                                    '. '
                                                )}
                                            />
                                        ) : null}

                                        {!detail.resolution
                                            && frozaSnapshot.state === 'pending' ? (
                                                <Alert
                                                    type="info"
                                                    showIcon
                                                    message="Сначала сохраните решение менеджера в блоке «Обработка»"
                                                />
                                            ) : null}

                                        {detail.resolution === 'rejected'
                                            && !resolutionComment.trim()
                                            && frozaSnapshot.state === 'pending' ? (
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    message="Для отказа заполните комментарий к решению"
                                                />
                                            ) : null}

                                        {frozaSnapshot.state === 'pending' ? (
                                            <Popconfirm
                                                title={
                                                    detail.resolution === 'approved'
                                                        ? 'Передать во Froza согласование возврата?'
                                                        : 'Передать во Froza отказ в возврате?'
                                                }
                                                description="После отправки отменить решение через эту форму нельзя."
                                                okText="Передать"
                                                cancelText="Отмена"
                                                onConfirm={
                                                    handleSendFrozaDecision
                                                }
                                                disabled={
                                                    !frozaDecisionReady
                                                    || frozaLoading
                                                }
                                            >
                                                <Button
                                                    type="primary"
                                                    icon={<SendOutlined />}
                                                    loading={frozaLoading}
                                                    disabled={!frozaDecisionReady}
                                                >
                                                    Передать решение во Froza
                                                </Button>
                                            </Popconfirm>
                                        ) : null}
                                    </Space>
                                ) : (
                                    <Alert
                                        type="info"
                                        showIcon
                                        message="Нажмите «Проверить»"
                                        description="Система прочитает заявку Froza, сверит артикул и количество. Решение при проверке не отправляется."
                                    />
                                )}
                            </Card>
                        ) : null}

                        {isArmtekReclamation ? (
                            <Card
                                size="small"
                                title="Заявка Armtek"
                                extra={(
                                    <Button
                                        size="small"
                                        icon={<SyncOutlined />}
                                        loading={armtekLoading}
                                        onClick={handleRefreshArmtek}
                                    >
                                        Проверить
                                    </Button>
                                )}
                            >
                                {armtekSnapshot ? (
                                    <Space
                                        direction="vertical"
                                        size="middle"
                                        style={{ width: '100%' }}
                                    >
                                        <Descriptions
                                            size="small"
                                            bordered
                                            column={{ xs: 1, sm: 2 }}
                                        >
                                            <Descriptions.Item label="Заявка">
                                                №{armtekSnapshot.request_number || '—'}
                                                {armtekSnapshot.request_position
                                                    ? ` / ${armtekSnapshot.request_position}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Состояние">
                                                <Tag color={armtekStateMeta.color}>
                                                    {armtekStateMeta.label}
                                                </Tag>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Позиция">
                                                <Text strong>
                                                    {armtekSnapshot.brand_name || ''}{' '}
                                                    {armtekSnapshot.oem_number || '—'}
                                                </Text>
                                                {armtekSnapshot.autopart_name
                                                    ? ` · ${armtekSnapshot.autopart_name}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Количество">
                                                {armtekSnapshot.quantity ?? '—'} шт.
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Документ">
                                                {armtekSnapshot.invoice_number || '—'}
                                                {armtekSnapshot.invoice_date
                                                    ? ` от ${dayjs(armtekSnapshot.invoice_date).format('DD.MM.YYYY')}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Причина">
                                                {armtekSnapshot.reason || '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Склад Armtek">
                                                {armtekSnapshot.warehouse_name || '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Проверено">
                                                {fmtDateTime(
                                                    armtekSnapshot.checked_at
                                                )}
                                            </Descriptions.Item>
                                        </Descriptions>

                                        {armtekBlockingReasons.length ? (
                                            <Alert
                                                type="error"
                                                showIcon
                                                message="Решение нельзя отправить"
                                                description={armtekBlockingReasons.join(
                                                    '. '
                                                )}
                                            />
                                        ) : null}

                                        {!detail.resolution
                                            && armtekSnapshot.state === 'pending' ? (
                                                <Alert
                                                    type="info"
                                                    showIcon
                                                    message="Сначала сохраните решение менеджера в блоке «Обработка»"
                                                />
                                            ) : null}

                                        {detail.resolution === 'rejected'
                                            && !resolutionComment.trim()
                                            && armtekSnapshot.state === 'pending' ? (
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    message="Для отказа заполните комментарий к решению"
                                                />
                                            ) : null}

                                        {armtekSnapshot.state === 'pending' ? (
                                            <Popconfirm
                                                title={
                                                    detail.resolution === 'approved'
                                                        ? 'Передать в Armtek согласование возврата?'
                                                        : 'Передать в Armtek отказ в возврате?'
                                                }
                                                description="После отправки отменить решение через эту форму нельзя."
                                                okText="Передать"
                                                cancelText="Отмена"
                                                onConfirm={
                                                    handleSendArmtekDecision
                                                }
                                                disabled={
                                                    !armtekDecisionReady
                                                    || armtekLoading
                                                }
                                            >
                                                <Button
                                                    type="primary"
                                                    icon={<SendOutlined />}
                                                    loading={armtekLoading}
                                                    disabled={!armtekDecisionReady}
                                                >
                                                    Передать решение в Armtek
                                                </Button>
                                            </Popconfirm>
                                        ) : null}
                                    </Space>
                                ) : (
                                    <Alert
                                        type="info"
                                        showIcon
                                        message="Нажмите «Проверить»"
                                        description="Система прочитает заявку Armtek и сверит артикул и количество. Решение при проверке не отправляется."
                                    />
                                )}
                            </Card>
                        ) : null}

                        {ukdDraft || ukdLoading ? (
                            <Card
                                size="small"
                                loading={ukdLoading}
                                title="Документ возврата и будущий УКД"
                                extra={ukdDraft ? (
                                    <Tag
                                        color={
                                            RETURN_STATUS_META[ukdDraft.status]
                                                ?.color || 'default'
                                        }
                                    >
                                        {RETURN_STATUS_META[ukdDraft.status]
                                            ?.label || ukdDraft.status}
                                    </Tag>
                                ) : null}
                            >
                                {ukdDraft ? (
                                    <Space
                                        direction="vertical"
                                        size={12}
                                        style={{ width: '100%' }}
                                    >
                                        <Descriptions
                                            bordered
                                            size="small"
                                            column={2}
                                        >
                                            <Descriptions.Item label="Документ клиента">
                                                {ukdDraft.external_document_number
                                                    || 'без номера'}
                                                {ukdDraft.external_document_date
                                                    ? ` от ${dayjs(
                                                        ukdDraft.external_document_date,
                                                    ).format('DD.MM.YYYY')}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Основание из входящего УПД">
                                                {ukdDraft.source_document_number
                                                    || 'не распознано'}
                                                {ukdDraft.source_document_date
                                                    ? ` от ${dayjs(
                                                        ukdDraft.source_document_date,
                                                    ).format('DD.MM.YYYY')}`
                                                    : ''}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Реализация">
                                                {ukdDraft.shipment_document_id
                                                    ? `#${ukdDraft.shipment_document_id}`
                                                    : '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Исходящая УПД Диадока">
                                                {ukdDraft.source_diadoc_outgoing_document_id
                                                    ? `#${ukdDraft.source_diadoc_outgoing_document_id}`
                                                    : '—'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Проверка основания" span={2}>
                                                <Tag
                                                    color={ukdDraft.source_basis_verified
                                                        ? 'success'
                                                        : 'warning'}
                                                >
                                                    {ukdDraft.source_basis_verified
                                                        ? 'Номер и дата совпадают у реализации и нашей УПД'
                                                        : 'Основание ещё не подтверждено'}
                                                </Tag>
                                            </Descriptions.Item>
                                        </Descriptions>

                                        {ukdDraft.blockers?.length ? (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message="УКД пока выпускать нельзя"
                                                description={(
                                                    <ul
                                                        style={{
                                                            margin: 0,
                                                            paddingLeft: 18,
                                                        }}
                                                    >
                                                        {ukdDraft.blockers.map(
                                                            (item) => (
                                                                <li key={item}>
                                                                    {item}
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                )}
                                            />
                                        ) : (
                                            <Alert
                                                type="success"
                                                showIcon
                                                message="Можно сформировать черновик УКД"
                                                description="Количество, цена, НДС 22% и связь с исходящей УПД проверены."
                                            />
                                        )}

                                        <Table
                                            rowKey="return_item_id"
                                            size="small"
                                            pagination={false}
                                            dataSource={ukdDraft.items || []}
                                            columns={[
                                                {
                                                    title: 'Позиция',
                                                    render: (_, row) => (
                                                        <Space
                                                            direction="vertical"
                                                            size={0}
                                                        >
                                                            <Text strong>
                                                                {row.brand_name || ''}{' '}
                                                                {row.oem_number || '—'}
                                                            </Text>
                                                            <Text
                                                                type="secondary"
                                                                ellipsis={{ tooltip: row.name }}
                                                                style={{ maxWidth: 250 }}
                                                            >
                                                                {row.name || '—'}
                                                            </Text>
                                                        </Space>
                                                    ),
                                                },
                                                {
                                                    title: 'Кол-во',
                                                    width: 110,
                                                    render: (_, row) => (
                                                        <Text>
                                                            {row.quantity_before ?? '—'}
                                                            {' → '}
                                                            {row.quantity_after ?? '—'}
                                                            <br />
                                                            <Text type="secondary">
                                                                возврат {row.return_quantity}
                                                            </Text>
                                                        </Text>
                                                    ),
                                                },
                                                {
                                                    title: 'Цена / НДС',
                                                    width: 105,
                                                    render: (_, row) => (
                                                        <Text>
                                                            {row.gross_unit_price
                                                                ? `${Number(
                                                                    row.gross_unit_price,
                                                                ).toLocaleString('ru-RU')} ₽`
                                                                : '—'}
                                                            <br />
                                                            <Text type="secondary">
                                                                НДС {row.vat_rate}%
                                                            </Text>
                                                        </Text>
                                                    ),
                                                },
                                            ]}
                                        />

                                        <Space wrap>
                                            {ukdDraft.status === 'created' ? (
                                                <Button
                                                    type="primary"
                                                    loading={ukdSaving}
                                                    onClick={() =>
                                                        handleUkdDecision('approved')
                                                    }
                                                >
                                                    Согласовать возврат
                                                </Button>
                                            ) : null}
                                            {['created', 'approved'].includes(
                                                ukdDraft.status,
                                            ) ? (
                                                <Popconfirm
                                                    title="Отклонить возврат?"
                                                    description="Причина берётся из комментария решения выше."
                                                    okText="Отклонить"
                                                    cancelText="Отмена"
                                                    onConfirm={() =>
                                                        handleUkdDecision('rejected')
                                                    }
                                                >
                                                    <Button danger loading={ukdSaving}>
                                                        Отклонить
                                                    </Button>
                                                </Popconfirm>
                                            ) : null}
                                            <Button
                                                icon={<ReloadOutlined />}
                                                loading={ukdSaving}
                                                onClick={handleUkdRematch}
                                                disabled={ukdDraft.status !== 'created'}
                                            >
                                                Повторить поиск
                                            </Button>
                                            <Button
                                                onClick={() => window.open(
                                                    `/warehouse/returns/customer/${ukdDraft.return_id}`,
                                                    '_blank',
                                                    'noopener,noreferrer',
                                                )}
                                            >
                                                Открыть складской возврат
                                            </Button>
                                        </Space>

                                        <details>
                                            <summary>
                                                Привязать реализацию и УПД вручную
                                            </summary>
                                            <Space
                                                wrap
                                                style={{ marginTop: 10 }}
                                            >
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    style={{ width: 190 }}
                                                    placeholder="ID реализации"
                                                    value={ukdShipmentId}
                                                    onChange={(event) =>
                                                        setUkdShipmentId(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    style={{ width: 220 }}
                                                    placeholder="ID исходящей УПД"
                                                    value={ukdSourceDocumentId}
                                                    onChange={(event) =>
                                                        setUkdSourceDocumentId(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                                <Button
                                                    loading={ukdSaving}
                                                    onClick={handleUkdLink}
                                                >
                                                    Привязать
                                                </Button>
                                            </Space>
                                        </details>
                                    </Space>
                                ) : null}
                            </Card>
                        ) : null}

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

                                <Select
                                    allowClear
                                    showSearch
                                    optionFilterProp="label"
                                    placeholder="Быстрая причина отказа"
                                    value={
                                        REJECTION_REASON_OPTIONS.some(
                                            (item) =>
                                                item.value
                                                === resolutionComment,
                                        )
                                            ? resolutionComment
                                            : undefined
                                    }
                                    options={REJECTION_REASON_OPTIONS}
                                    onChange={(value) =>
                                        setResolutionComment(value || '')
                                    }
                                />
                                <Input.TextArea
                                    rows={2}
                                    placeholder="Комментарий к решению. Для отказа причина обязательна и попадёт в письмо клиенту."
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
                                    {!isFrozaReclamation
                                        && !isArmtekReclamation ? (
                                            <Button
                                                type="primary"
                                                icon={<SendOutlined />}
                                                disabled={
                                                    !canResolve
                                                    || !detail.sender_email
                                                }
                                                onClick={() =>
                                                    openActionReply(
                                                        'approved',
                                                    )
                                                }
                                            >
                                                Согласовать и ответить
                                            </Button>
                                        ) : null}
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
                                    {!isFrozaReclamation
                                        && !isArmtekReclamation ? (
                                            <Button
                                                danger
                                                icon={<SendOutlined />}
                                                disabled={
                                                    !canResolve
                                                    || !detail.sender_email
                                                }
                                                onClick={() =>
                                                    openActionReply(
                                                        'rejected',
                                                    )
                                                }
                                            >
                                                Отклонить и ответить
                                            </Button>
                                        ) : null}
                                    {!isFrozaReclamation
                                        && !isArmtekReclamation ? (
                                            <Button
                                                icon={
                                                    <ExclamationCircleOutlined />
                                                }
                                                disabled={
                                                    !canResolve
                                                    || !detail.sender_email
                                                }
                                                onClick={() =>
                                                    openActionReply(
                                                        'request_documents',
                                                    )
                                                }
                                            >
                                                Запросить документы
                                            </Button>
                                        ) : null}
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
                                {customerCandidates.length > 1 ? (
                                    <Alert
                                        showIcon
                                        type={
                                            detail.customer_id
                                                ? 'success'
                                                : 'warning'
                                        }
                                        message={
                                            detail.customer_id
                                                ? 'Юридическое лицо определено по заказу'
                                                : 'У адреса несколько юридических лиц'
                                        }
                                        description={customerCandidates
                                            .map(
                                                (candidate) =>
                                                    `${candidate.name} (ID: ${candidate.id})`,
                                            )
                                            .join(' · ')}
                                    />
                                ) : null}
                                {detail.customer_id ? (
                                    <Text>
                                        Сейчас привязан:{' '}
                                        <Text strong>
                                            {detail.customer_name || 'Клиент'} (ID:{' '}
                                            {detail.customer_id})
                                        </Text>
                                    </Text>
                                ) : null}
                                <Select
                                    showSearch
                                    placeholder="Выберите клиента"
                                    style={{ width: '100%' }}
                                    value={assignCustomerId}
                                    onChange={setAssignCustomerId}
                                    options={customerOptions}
                                    filterOption={false}
                                    onSearch={loadCustomerOptions}
                                    onFocus={() => loadCustomerOptions()}
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
                                        {
                                            title: 'Поставщик',
                                            key: 'source_provider',
                                            width: 220,
                                            render: (_, item) => {
                                                const checkedItem = (
                                                    detail.check_result
                                                        ?.items || []
                                                ).find(
                                                    (row) =>
                                                        row.item_id
                                                        === item.id
                                                ) || {};
                                                const candidates = (
                                                    checkedItem
                                                        .supplier_candidates
                                                        || []
                                                );
                                                if (
                                                    candidates.length > 1
                                                    || item.source_provider_id
                                                ) {
                                                    return (
                                                        <Select
                                                            size="small"
                                                            showSearch
                                                            optionFilterProp="label"
                                                            style={{
                                                                width: 210,
                                                            }}
                                                            placeholder="Выберите поставщика"
                                                            value={
                                                                item
                                                                    .source_provider_id
                                                                || undefined
                                                            }
                                                            loading={
                                                                itemSavingId
                                                                === item.id
                                                            }
                                                            options={
                                                                candidates.map(
                                                                    (
                                                                        candidate
                                                                    ) => ({
                                                                        value:
                                                                            candidate
                                                                                .provider_id,
                                                                        label:
                                                                            candidate
                                                                                .provider_name
                                                                            || `ID ${candidate.provider_id}`,
                                                                    })
                                                                )
                                                            }
                                                            onChange={(
                                                                value
                                                            ) =>
                                                                handleItemProvider(
                                                                    item,
                                                                    value
                                                                )
                                                            }
                                                        />
                                                    );
                                                }
                                                return (
                                                    checkedItem
                                                        .supplier_name
                                                    || (
                                                        <Text
                                                            type="secondary"
                                                        >
                                                            не определён
                                                        </Text>
                                                    )
                                                );
                                            },
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
                                        <Space key={att.id} wrap>
                                            <Tag>
                                                {ATTACHMENT_KIND_LABELS[
                                                    att.kind
                                                ] || att.kind}
                                            </Tag>
                                            <Text>{att.file_name}</Text>
                                            <Button
                                                type="link"
                                                size="small"
                                                icon={<CloudDownloadOutlined />}
                                                onClick={() =>
                                                    downloadAttachment(
                                                        detail.id,
                                                        att,
                                                    ).catch((error) => {
                                                        message.error(
                                                            error?.response?.data
                                                                ?.detail ||
                                                                'Не удалось скачать вложение',
                                                        );
                                                    })
                                                }
                                            >
                                                Скачать
                                            </Button>
                                        </Space>
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
                                        icon={<ReloadOutlined />}
                                        loading={emailsLoading}
                                        onClick={refreshCorrespondence}
                                    >
                                        Обновить статус
                                    </Button>
                                    {isFrozaReclamation ? (
                                        !frozaSnapshot
                                        || frozaSnapshot.state === 'unknown' ? (
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    loading={frozaLoading}
                                                    onClick={handleRefreshFroza}
                                                >
                                                    Проверить заявку Froza
                                                </Button>
                                            ) : frozaSnapshot.state === 'pending' ? (
                                                <Popconfirm
                                                    title={
                                                        detail.resolution === 'approved'
                                                            ? 'Согласовать возврат во Froza?'
                                                            : 'Отказать в возврате во Froza?'
                                                    }
                                                    description="Решение и комментарий будут записаны на сайте Froza. Отменить отправку через эту форму нельзя."
                                                    okText="Передать"
                                                    cancelText="Отмена"
                                                    onConfirm={
                                                        handleSendFrozaDecision
                                                    }
                                                    disabled={
                                                        !frozaDecisionReady
                                                        || frozaLoading
                                                    }
                                                >
                                                    <Tooltip
                                                        title={
                                                            !frozaDecisionReady
                                                                ? frozaReplyDisabledReason
                                                                : 'Письмо не отправляется: решение будет передано на портал Froza'
                                                        }
                                                    >
                                                        <span>
                                                            <Button
                                                                size="small"
                                                                type="primary"
                                                                icon={<SendOutlined />}
                                                                loading={frozaLoading}
                                                                disabled={
                                                                    !frozaDecisionReady
                                                                }
                                                            >
                                                                Ответить клиенту во Froza
                                                            </Button>
                                                        </span>
                                                    </Tooltip>
                                                </Popconfirm>
                                            ) : (
                                                <Button size="small" disabled>
                                                    Ответ уже передан во Froza
                                                </Button>
                                            )
                                    ) : (
                                        <Button
                                            size="small"
                                            type="primary"
                                            onClick={openReplyModal}
                                            disabled={!detail.sender_email}
                                        >
                                            Ответить клиенту
                                        </Button>
                                    )}
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
                            {latestCustomerReply ? (
                                <Alert
                                    style={{ marginBottom: 12 }}
                                    showIcon
                                    type={
                                        latestCustomerReply.status === 'sent'
                                            ? sourceMailboxState
                                                .answered_flag_status
                                                === 'error'
                                                ? 'warning'
                                                : 'success'
                                            : latestCustomerReply.status
                                                === 'error'
                                                ? 'error'
                                                : 'info'
                                    }
                                    message={
                                        latestCustomerReply.status === 'sent'
                                            ? `Ответ клиенту отправлен${
                                                latestCustomerReply.sent_at
                                                    ? ` · ${fmtDateTime(
                                                        latestCustomerReply
                                                            .sent_at
                                                    )}`
                                                    : ''
                                            }`
                                            : latestCustomerReply.status
                                                === 'error'
                                                ? 'Ответ клиенту не отправлен'
                                                : 'Ответ ожидает локальный релей'
                                    }
                                    description={
                                        latestCustomerReply.status === 'sent'
                                            ? sourceMailboxState
                                                .answered_flag_status
                                                === 'marked'
                                                ? 'Исходное письмо отмечено как прочитанное, получившее ответ и выделено звёздочкой.'
                                                : sourceMailboxState
                                                    .answered_flag_error
                                                    || 'Статус пометки исходного письма пока не получен.'
                                            : latestCustomerReply.last_error
                                                || 'Оставьте relay.py запущенным и нажмите «Обновить статус».'
                                    }
                                />
                            ) : null}
                            {incomingThreadMessages.length ? (
                                <Table
                                    rowKey={(row, index) =>
                                        row.message_id
                                        || `${row.received_at || 'incoming'}-${index}`
                                    }
                                    size="small"
                                    pagination={false}
                                    style={{ marginBottom: 12 }}
                                    dataSource={incomingThreadMessages}
                                    columns={[
                                        {
                                            title: 'Входящие ответы',
                                            key: 'incoming',
                                            render: (_, row) => (
                                                <Space
                                                    direction="vertical"
                                                    size={0}
                                                >
                                                    <Text strong>
                                                        {row.from_email
                                                            || 'Отправитель не определён'}
                                                    </Text>
                                                    <Text type="secondary">
                                                        {row.subject || 'Без темы'}
                                                    </Text>
                                                    {row.body ? (
                                                        <Paragraph
                                                            ellipsis={{
                                                                rows: 3,
                                                                expandable: true,
                                                                symbol: 'ещё',
                                                            }}
                                                            style={{
                                                                whiteSpace: 'pre-wrap',
                                                                marginBottom: 0,
                                                            }}
                                                        >
                                                            {row.body}
                                                        </Paragraph>
                                                    ) : null}
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: 'Получено',
                                            dataIndex: 'received_at',
                                            width: 140,
                                            render: fmtDateTime,
                                        },
                                    ]}
                                />
                            ) : null}
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

                        <Card size="small" title="История действий">
                            {(detail.events || []).length ? (
                                <Space
                                    direction="vertical"
                                    size={10}
                                    style={{ width: '100%' }}
                                >
                                    {(detail.events || []).map((event) => (
                                        <div
                                            key={event.id}
                                            style={{
                                                border: '1px solid #f0f0f0',
                                                borderRadius: 8,
                                                padding: '10px 12px',
                                                minWidth: 0,
                                            }}
                                        >
                                            <Space
                                                wrap
                                                size={[8, 4]}
                                                style={{
                                                    width: '100%',
                                                    marginBottom: 8,
                                                }}
                                            >
                                                <Text strong>
                                                    {EVENT_LABELS[event.event_type]
                                                        || event.event_type}
                                                </Text>
                                                <Text type="secondary">
                                                    {event.created_at
                                                        ? dayjs(event.created_at).format(
                                                            'DD.MM.YYYY HH:mm',
                                                        )
                                                        : '—'}
                                                </Text>
                                                <Tag>
                                                    {event.actor_user_name || 'Система'}
                                                </Tag>
                                            </Space>
                                            <div
                                                style={{
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    background: '#fafafa',
                                                    color: '#595959',
                                                    lineHeight: 1.5,
                                                    whiteSpace: 'pre-wrap',
                                                    overflowWrap: 'anywhere',
                                                    wordBreak: 'break-word',
                                                    maxWidth: '100%',
                                                }}
                                            >
                                                {formatEventDetails(event.details)}
                                            </div>
                                        </div>
                                    ))}
                                </Space>
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Действия ещё не зафиксированы"
                                />
                            )}
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
                title={
                    replyPendingAction
                        ? replyPendingAction.action === 'request_documents'
                            ? 'Запросить дополнительные документы'
                            : 'Сохранить решение и ответить клиенту'
                        : 'Ответ клиенту'
                }
                okText={
                    replyPendingAction
                        ? 'Сохранить и поставить в очередь'
                        : 'В очередь на отправку'
                }
                cancelText="Отмена"
                confirmLoading={replySaving}
                width={640}
                onOk={handleSendReply}
                onCancel={() => {
                    setReplyOpen(false);
                    setReplyPendingAction(null);
                }}
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
                    {replyPendingAction ? (
                        <Alert
                            type={
                                replyPendingAction.action === 'approved'
                                    ? 'success'
                                    : 'warning'
                            }
                            showIcon
                            message={
                                replyPendingAction.action === 'approved'
                                    ? 'Будет сохранено согласование возврата'
                                    : replyPendingAction.action === 'rejected'
                                        ? 'Будет сохранён отказ в возврате'
                                        : 'Рекламация перейдёт в ожидание документов'
                            }
                            description={
                                replyPendingAction.action === 'rejected'
                                    ? `Причина: ${replyPendingAction.resolution_comment}`
                                    : 'Проверьте текст перед постановкой ответа в очередь.'
                            }
                        />
                    ) : null}
                    <Space wrap>
                        <Text type="secondary">Шаблон:</Text>
                        <Select
                            style={{ width: 260 }}
                            value={replyKind}
                            disabled={Boolean(replyPendingAction)}
                            onChange={(value) => {
                                setReplyKind(value);
                                void loadReplyTemplate(
                                    value,
                                    value === 'rejected'
                                        ? resolutionComment
                                        : null,
                                );
                            }}
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
