import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Descriptions,
    Form,
    Input,
    Checkbox,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    CloseCircleOutlined,
    CloudSyncOutlined,
    LinkOutlined,
    PrinterOutlined,
    SafetyCertificateOutlined,
    SaveOutlined,
    ReloadOutlined,
    SendOutlined,
    StopOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
    bindDiadocCustomerCounteragent,
    bindDiadocProviderCounteragent,
    getDiadocCounteragents,
    updateDiadocSettings,
    getDiadocInboundAcceptance,
    getDiadocStatus,
    retryDiadocFailedEvents,
    listDiadocInboundDocuments,
    confirmDiadocCloudSignTask,
    downloadDiadocPrintForm,
    listDiadocOutboundDocuments,
    processDiadocInboundDocument,
    resolveDiadocInboundMismatch,
    acknowledgeDiadocInboundMismatch,
    refreshDiadocOutboundDocumentStatus,
    startDiadocInboundReject,
    startDiadocInboundSign,
    startDiadocOutboundRevoke,
    startDiadocOutboundSendSigned,
    syncDiadocInboundDocuments,
    syncDiadocOutboundStatuses,
} from '../api/diadoc';
import { getCustomersSummary } from '../api/customers';
import { getAllProviders } from '../api/providers';
import EtrnPanel from './EtrnPanel';

const { Title, Text } = Typography;

const fmtDateTime = (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—');

const INBOUND_STAGES = [
    { key: 'received', label: 'Получен' },
    { key: 'recognized', label: 'Распознан' },
    { key: 'receipt', label: 'Поступление' },
    { key: 'posted', label: 'Проведён' },
    { key: 'signed', label: 'Подписан' },
];

const ACCEPTANCE_KIND_LABELS = {
    missing: { label: 'Не принято', color: 'error' },
    shortage: { label: 'Недостача', color: 'warning' },
    surplus: { label: 'Излишек', color: 'warning' },
    extra: { label: 'Нет в документе', color: 'warning' },
    marking: { label: 'Маркировка', color: 'error' },
};

const STATUS_COLORS = {
    synced: 'blue',
    registered: 'processing',
    processed: 'success',
    error: 'error',
    technical_error: 'error',
    draft: 'default',
    sent: 'processing',
    delivered: 'blue',
    completed: 'success',
    rejected: 'error',
    revoked: 'warning',
    revocation_requested: 'warning',
    amount_mismatch: 'warning',
    duplicate: 'default',
    skipped: 'default',
    customer_doc: 'purple',
    direction_unknown: 'warning',
    transport: 'cyan',
    service_act: 'default',
    discrepancy_act: 'warning',
    other_doc: 'default',
    possible_return: 'volcano',
};

// Status.Type из внешнего документооборота ГИС ЭПД (перевозочные документы)
const TRANSPORT_STATUS_COLORS = {
    Success: 'success',
    Error: 'error',
    Warning: 'warning',
    Normal: 'blue',
};

const DOCUMENT_KIND_LABELS = {
    upd: 'УПД',
    ukd: 'УКД / КСЧФ',
    kschf: 'КСЧФ',
    torg12: 'ТОРГ-12',
    act: 'Акт / услуги',
    discrepancy_act: 'Акт о расхождениях',
    transport: 'ЭТрН',
    other: 'Прочее',
};

const SYNC_RESULT_LABELS = {
    synced: 'Синхронизирован',
    registered: 'Зарегистрирован',
    processed: 'Обработан',
    error: 'Ошибка',
    technical_error: 'Техническая ошибка',
    draft: 'Черновик',
    sent: 'Отправлен',
    delivered: 'Доставлен',
    completed: 'Завершён',
    rejected: 'Отказ',
    revoked: 'Аннулирован',
    revocation_requested: 'Запрошено аннулирование',
    amount_mismatch: 'Расхождение по сумме',
    duplicate: 'Дубль',
    skipped: 'Не поступление',
    customer_doc: 'По клиенту',
    direction_unknown: 'Направление не определено',
    transport: 'ЭТрН (перевозки)',
    service_act: 'Акт / услуги',
    discrepancy_act: 'Акт о расхождениях',
    other_doc: 'Прочее',
    possible_return: 'Возможный возврат',
};

const BindCounteragentModal = ({
    open,
    onCancel,
    onSubmit,
    submitting,
    targetType,
    counteragent,
    providerOptions,
    customerOptions,
}) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }
        form.setFieldsValue({
            source_system: 'DIADOC_COUNTERAGENT_BOX',
            is_active: true,
            target_id: undefined,
        });
    }, [form, open]);

    const entityOptions = targetType === 'provider'
        ? providerOptions
        : customerOptions;

    const entityLabel = targetType === 'provider' ? 'Поставщик' : 'Клиент';

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            await onSubmit(values);
            form.resetFields();
        } catch {
            // validation handled by antd
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            confirmLoading={submitting}
            okText="Сохранить"
            cancelText="Отмена"
            title={`Привязать контрагента к ${entityLabel.toLowerCase()}`}
        >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                    type="info"
                    showIcon
                    message={counteragent?.full_name || counteragent?.short_name || 'Контрагент'}
                    description={counteragent?.box_id_guid || '—'}
                />
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="target_id"
                        label={entityLabel}
                        rules={[{ required: true, message: `Выберите: ${entityLabel.toLowerCase()}` }]}
                    >
                        <Select
                            showSearch
                            placeholder={`Выберите ${entityLabel.toLowerCase()}`}
                            options={entityOptions}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                </Form>
            </Space>
        </Modal>
    );
};

const DiadocPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [settingsForm] = Form.useForm();
    const [status, setStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(
        searchParams.get('tab') || 'counteragents'
    );

    const [providers, setProviders] = useState([]);
    const [customers, setCustomers] = useState([]);

    const [counteragents, setCounteragents] = useState([]);
    const [counteragentsLoading, setCounteragentsLoading] = useState(false);
    const [counteragentQuery, setCounteragentQuery] = useState('');

    const [bindTargetType, setBindTargetType] = useState('provider');
    const [bindCounteragent, setBindCounteragent] = useState(null);
    const [bindOpen, setBindOpen] = useState(false);
    const [bindLoading, setBindLoading] = useState(false);

    const [inboundRows, setInboundRows] = useState([]);
    const [inboundLoading, setInboundLoading] = useState(false);
    const [inboundFilters, setInboundFilters] = useState({
        providerId: undefined,
        registeredOnly: undefined,
    });
    const [processingDocId, setProcessingDocId] = useState(null);
    const [acceptanceTarget, setAcceptanceTarget] = useState(null);
    const [retryingEvents, setRetryingEvents] = useState(false);

    const [outboundRows, setOutboundRows] = useState([]);
    const [outboundLoading, setOutboundLoading] = useState(false);
    const [outboundStatusSyncLoading, setOutboundStatusSyncLoading] =
        useState(false);
    const [refreshingOutboundId, setRefreshingOutboundId] = useState(null);
    const [quickBindKey, setQuickBindKey] = useState(null);
    // Облачная подпись: задача, ожидающая SMS-код
    const [cloudSignTask, setCloudSignTask] = useState(null);
    const [cloudSignCode, setCloudSignCode] = useState('');
    const [cloudSignSubmitting, setCloudSignSubmitting] = useState(false);
    const [cloudSignStartingKey, setCloudSignStartingKey] = useState(null);
    const [revokeTarget, setRevokeTarget] = useState(null);
    const [revokeComment, setRevokeComment] = useState('');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectComment, setRejectComment] = useState('');
    const [printingKey, setPrintingKey] = useState(null);
    const [outboundFilters, setOutboundFilters] = useState({
        customerId: undefined,
        providerId: undefined,
    });

    const focusedInboundId = useMemo(() => {
        const value = Number(searchParams.get('incomingId'));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const focusedOutboundId = useMemo(() => {
        const value = Number(searchParams.get('outgoingId'));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const providerOptions = useMemo(
        () => (providers || []).map((item) => ({
            value: item.id,
            label: item.name,
        })),
        [providers]
    );

    const customerOptions = useMemo(
        () => (customers || []).map((item) => ({
            value: item.id,
            label: item.name,
        })),
        [customers]
    );

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const response = await getDiadocStatus();
            const nextStatus = response.data;
            setStatus(nextStatus);
            settingsForm.setFieldsValue({
                seller_legal_address: nextStatus?.seller_legal_address || '',
                seller_postal_address: nextStatus?.seller_postal_address || '',
                signer_full_name: nextStatus?.signer_full_name || '',
                signer_position: nextStatus?.signer_position || '',
                signer_basis: nextStatus?.signer_basis || '',
                formalized_default_function: nextStatus?.formalized_default_function || 'ДОП',
                inbound_sync_enabled: nextStatus?.inbound_sync_enabled ?? true,
                inbound_download_content: nextStatus?.inbound_download_content ?? true,
                inbound_process_enabled: nextStatus?.inbound_process_enabled ?? false,
                inbound_sync_count: Math.min(Number(nextStatus?.inbound_sync_count || 50), 100),
            });
        } catch (err) {
            console.error('Failed to load Diadoc status', err);
            message.error('Не удалось загрузить статус Диадока');
        } finally {
            setStatusLoading(false);
        }
    }, [settingsForm]);

    const loadReferenceData = useCallback(async () => {
        try {
            const [providersList, customersResponse] = await Promise.all([
                getAllProviders({ page_size: 100 }),
                getCustomersSummary({ page: 1, page_size: 200 }),
            ]);
            setProviders(providersList || []);
            setCustomers(customersResponse?.data?.items || []);
        } catch (err) {
            console.error('Failed to load providers/customers', err);
            message.error('Не удалось загрузить поставщиков и клиентов');
        }
    }, []);

    const loadCounteragents = useCallback(async (query = counteragentQuery) => {
        setCounteragentsLoading(true);
        try {
            // Диадок отдаёт контрагентов страницами по 100: догружаем остальные.
            let rows = [];
            let afterIndexKey;
            for (let page = 0; page < 20; page += 1) {
                const response = await getDiadocCounteragents({
                    query: query || undefined,
                    page_size: 100,
                    after_index_key: afterIndexKey,
                });
                rows = rows.concat(response.data?.counteragents || []);
                afterIndexKey = response.data?.after_index_key;
                if (!response.data?.has_more_results || !afterIndexKey) break;
            }
            setCounteragents(rows);
        } catch (err) {
            console.error('Failed to load Diadoc counteragents', err);
            message.error('Не удалось загрузить контрагентов Диадока');
        } finally {
            setCounteragentsLoading(false);
        }
    }, [counteragentQuery]);

    const loadInbound = useCallback(async (nextFilters = inboundFilters) => {
        setInboundLoading(true);
        try {
            const response = await listDiadocInboundDocuments({
                document_id: focusedInboundId || undefined,
                provider_id: nextFilters.providerId || undefined,
                registered_only: nextFilters.registeredOnly,
                attention_only: nextFilters.attentionOnly || undefined,
                limit: 100,
            });
            setInboundRows(response.data || []);
        } catch (err) {
            console.error('Failed to load inbound Diadoc docs', err);
            message.error('Не удалось загрузить входящие документы Диадока');
        } finally {
            setInboundLoading(false);
        }
    }, [focusedInboundId, inboundFilters]);

    const loadOutbound = useCallback(async (nextFilters = outboundFilters) => {
        setOutboundLoading(true);
        try {
            const response = await listDiadocOutboundDocuments({
                document_id: focusedOutboundId || undefined,
                customer_id: nextFilters.customerId || undefined,
                provider_id: nextFilters.providerId || undefined,
                limit: 100,
            });
            setOutboundRows(response.data || []);
        } catch (err) {
            console.error('Failed to load outbound Diadoc docs', err);
            message.error('Не удалось загрузить исходящие документы Диадока');
        } finally {
            setOutboundLoading(false);
        }
    }, [focusedOutboundId, outboundFilters]);

    const handleQuickBindByInn = useCallback(async (row, targetType) => {
        const bindKey = `${targetType}:${row.box_id_guid}`;
        setQuickBindKey(bindKey);
        try {
            const payload = {
                counteragent_box_id: row.box_id_guid,
                source_system: 'DIADOC_COUNTERAGENT_BOX',
                is_active: true,
            };
            if (targetType === 'provider') {
                await bindDiadocProviderCounteragent(
                    row.suggested_provider_id,
                    payload
                );
                message.success(
                    `Контрагент привязан к поставщику ${row.suggested_provider_name}`
                );
            } else {
                await bindDiadocCustomerCounteragent(
                    row.suggested_customer_id,
                    payload
                );
                message.success(
                    `Контрагент привязан к клиенту ${row.suggested_customer_name}`
                );
            }
            await loadCounteragents();
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось привязать контрагента'
            );
        } finally {
            setQuickBindKey(null);
        }
    }, [loadCounteragents]);

    const handleStartInboundSign = useCallback(async (row, totalCode = null) => {
        const startKey = `sign:${row.id}`;
        setCloudSignStartingKey(startKey);
        try {
            if (!totalCode) {
                // Подпись подтверждает приёмку: сначала сверяем документ
                // с проведённым поступлением.
                const { data: acceptance } = await getDiadocInboundAcceptance(row.id);
                if (acceptance?.has_discrepancies) {
                    setAcceptanceTarget({ row, acceptance });
                    return;
                }
            }
            const { data } = await startDiadocInboundSign(row.id, {
                include_receipt: true,
                total_code: totalCode || '1',
            });
            setAcceptanceTarget(null);
            setCloudSignCode('');
            setCloudSignTask({
                id: data.id,
                title: `Подписание входящего ${row.document_number || row.file_name || `#${row.id}`}`,
                kind: 'inbound',
            });
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось запустить подписание'
            );
        } finally {
            setCloudSignStartingKey(null);
        }
    }, []);

    const handleStartSendSigned = useCallback(async (row) => {
        const startKey = `send:${row.id}`;
        setCloudSignStartingKey(startKey);
        try {
            const { data } = await startDiadocOutboundSendSigned(row.id);
            setCloudSignCode('');
            setCloudSignTask({
                id: data.id,
                title: `Подпись и отправка ${row.file_name || `#${row.id}`}`,
                kind: 'outbound',
            });
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось запустить подписание черновика'
            );
        } finally {
            setCloudSignStartingKey(null);
        }
    }, []);

    const handleStartRevoke = useCallback(async () => {
        if (!revokeTarget) {
            return;
        }
        const startKey = `revoke:${revokeTarget.id}`;
        setCloudSignStartingKey(startKey);
        try {
            const { data } = await startDiadocOutboundRevoke(
                revokeTarget.id,
                { comment: revokeComment || null }
            );
            setCloudSignCode('');
            setCloudSignTask({
                id: data.id,
                title: `Аннулирование ${revokeTarget.file_name || `#${revokeTarget.id}`}`,
                kind: 'outbound',
            });
            setRevokeTarget(null);
            setRevokeComment('');
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось запустить аннулирование'
            );
        } finally {
            setCloudSignStartingKey(null);
        }
    }, [revokeComment, revokeTarget]);

    const handleConfirmCloudSign = useCallback(async () => {
        if (!cloudSignTask) {
            return;
        }
        const code = String(cloudSignCode || '').trim();
        if (!code) {
            message.warning('Введите код из SMS');
            return;
        }
        setCloudSignSubmitting(true);
        try {
            await confirmDiadocCloudSignTask(cloudSignTask.id, code);
            message.success('Подписано и отправлено в Диадок');
            const finishedKind = cloudSignTask.kind;
            setCloudSignTask(null);
            setCloudSignCode('');
            if (finishedKind === 'inbound') {
                await loadInbound();
            } else {
                await loadOutbound(outboundFilters);
            }
        } catch (err) {
            // Код мог быть неверным — модал не закрываем, можно повторить.
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось подтвердить подпись. Проверьте код.'
            );
        } finally {
            setCloudSignSubmitting(false);
        }
    }, [
        cloudSignCode,
        cloudSignTask,
        loadInbound,
        loadOutbound,
        outboundFilters,
    ]);

    const handleStartInboundReject = useCallback(async () => {
        if (!rejectTarget) {
            return;
        }
        const reason = rejectComment.trim();
        if (!reason) {
            message.warning('Укажите причину отказа');
            return;
        }
        const startKey = `reject:${rejectTarget.id}`;
        setCloudSignStartingKey(startKey);
        try {
            const { data } = await startDiadocInboundReject(
                rejectTarget.id,
                reason
            );
            setRejectTarget(null);
            setRejectComment('');
            setCloudSignCode('');
            setCloudSignTask({
                id: data.id,
                title: `Отказ в подписи ${rejectTarget.document_number || rejectTarget.file_name || `#${rejectTarget.id}`}`,
                kind: 'inbound',
            });
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось начать отказ в подписи'
            );
        } finally {
            setCloudSignStartingKey(null);
        }
    }, [rejectComment, rejectTarget]);

    const handlePrintForm = useCallback(async (row, keyPrefix) => {
        const printKey = `${keyPrefix}:${row.id}`;
        setPrintingKey(printKey);
        try {
            await downloadDiadocPrintForm(row.message_id, row.entity_id);
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось получить печатную форму'
            );
        } finally {
            setPrintingKey(null);
        }
    }, []);

    const handleSyncOutboundStatuses = useCallback(async () => {
        setOutboundStatusSyncLoading(true);
        try {
            const { data } = await syncDiadocOutboundStatuses();
            const errorsCount = (data?.errors || []).length;
            message.success(
                `Статусы обновлены: проверено ${data?.checked ?? 0}, ` +
                `изменилось ${data?.updated ?? 0}` +
                (errorsCount ? `, ошибок ${errorsCount}` : '')
            );
            await loadOutbound(outboundFilters);
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось обновить статусы из Диадока'
            );
        } finally {
            setOutboundStatusSyncLoading(false);
        }
    }, [loadOutbound, outboundFilters]);

    const handleRefreshOutboundDocStatus = useCallback(async (documentId) => {
        setRefreshingOutboundId(documentId);
        try {
            const { data } = await refreshDiadocOutboundDocumentStatus(
                documentId
            );
            setOutboundRows((prev) =>
                prev.map((row) => (row.id === documentId ? data : row))
            );
            message.success(
                `Статус: ${data?.docflow_status_text || SYNC_RESULT_LABELS[data?.status] || data?.status}`
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось обновить статус документа'
            );
        } finally {
            setRefreshingOutboundId(null);
        }
    }, []);

    useEffect(() => {
        loadStatus();
        loadReferenceData();
        loadCounteragents('');
        loadInbound();
        loadOutbound();
    }, [loadCounteragents, loadInbound, loadOutbound, loadReferenceData, loadStatus]);

    useEffect(() => {
        const nextTab = searchParams.get('tab') || 'counteragents';
        setActiveTab(nextTab);
    }, [searchParams]);

    const handleTabChange = (nextTab) => {
        setActiveTab(nextTab);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', nextTab);
        setSearchParams(nextParams);
    };

    const handleSaveFormalizedProfile = async () => {
        try {
            const values = await settingsForm.validateFields();
            setSettingsSaving(true);
            await updateDiadocSettings(values);
            message.success('Профиль формализованного УПД сохранён');
            await loadStatus();
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            console.error('Failed to save Diadoc formalized settings', err);
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить профиль формализованного УПД'
            );
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleSyncInbound = async () => {
        setSyncLoading(true);
        try {
            const response = await syncDiadocInboundDocuments({
                count: Math.max(Number(status?.inbound_sync_count || 50), 1),
                download_content: status?.inbound_download_content ?? true,
                register_supplier_message: status?.inbound_process_enabled ?? true,
                process_supplier_message: status?.inbound_process_enabled ?? true,
            });
            const result = response.data || {};
            message.success(
                `Синхронизация завершена: +${result.created || 0}, обработано ${result.processed_supplier_messages || 0}`
            );
            await Promise.all([loadStatus(), loadInbound()]);
        } catch (err) {
            console.error('Failed to sync Diadoc inbound', err);
            message.error(err?.response?.data?.detail || 'Ошибка синхронизации Диадока');
        } finally {
            setSyncLoading(false);
        }
    };

    const handleRetryFailedEvents = async () => {
        setRetryingEvents(true);
        try {
            const { data } = await retryDiadocFailedEvents();
            message.success(`Возвращено в очередь событий: ${data?.requeued || 0}`);
            await loadStatus();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось вернуть события в очередь');
        } finally {
            setRetryingEvents(false);
        }
    };

    const handleProcessInbound = async (row) => {
        setProcessingDocId(row.id);
        try {
            const response = await processDiadocInboundDocument(row.id, {
                provider_id: row.provider_id || undefined,
                download_content_if_missing: true,
                register_if_needed: true,
            });
            const result = response.data || {};
            message.success(
                result.correction_id
                    ? `КСФ #${result.correction_id} ожидает сопоставления с приходом`
                    : result.already_processed
                    ? 'Документ уже был обработан ранее'
                    : `Документ обработан, поступлений: ${result.receipt_ids?.length || 0}`
            );
            if (result.correction_id) navigate('/documents/corrections');
            await loadInbound();
        } catch (err) {
            console.error('Failed to process inbound Diadoc doc', err);
            message.error(err?.response?.data?.detail || 'Ошибка обработки входящего документа');
        } finally {
            setProcessingDocId(null);
        }
    };

    const handleResolveMismatch = async (row, action) => {
        setProcessingDocId(row.id);
        try {
            const response = await resolveDiadocInboundMismatch(row.id, action);
            message.success(response.data?.detail || 'Готово');
            if (response.data?.correction_id) navigate('/documents/corrections');
            await loadInbound();
        } catch (err) {
            console.error('Failed to resolve mismatch', err);
            message.error(err?.response?.data?.detail || 'Ошибка разрешения расхождения');
        } finally {
            setProcessingDocId(null);
        }
    };

    const handleAcknowledgeMismatch = async (row) => {
        setProcessingDocId(row.id);
        try {
            await acknowledgeDiadocInboundMismatch(row.id);
            message.success('Расхождение отмечено как проверенное');
            await loadInbound();
        } catch (err) {
            console.error('Failed to acknowledge mismatch', err);
            message.error(err?.response?.data?.detail || 'Не удалось отметить расхождение');
        } finally {
            setProcessingDocId(null);
        }
    };

    const handleBindCounteragent = async (values) => {
        if (!bindCounteragent) return;
        setBindLoading(true);
        try {
            if (bindTargetType === 'provider') {
                await bindDiadocProviderCounteragent(values.target_id, {
                    counteragent_box_id: bindCounteragent.box_id_guid,
                    source_system: values.source_system,
                    is_active: true,
                });
            } else {
                await bindDiadocCustomerCounteragent(values.target_id, {
                    counteragent_box_id: bindCounteragent.box_id_guid,
                    source_system: values.source_system,
                    is_active: true,
                });
            }
            message.success('Привязка сохранена');
            setBindOpen(false);
            setBindCounteragent(null);
            await loadCounteragents(counteragentQuery);
        } catch (err) {
            console.error('Failed to bind counteragent', err);
            message.error(err?.response?.data?.detail || 'Ошибка сохранения привязки');
        } finally {
            setBindLoading(false);
        }
    };

    const inboundColumns = [
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 140,
            render: (value, row) => (
                <Space direction="vertical" size={2}>
                    <Tag color={STATUS_COLORS[value] || 'default'}>
                        {SYNC_RESULT_LABELS[value] || value}
                    </Tag>
                    {row.direction === 'supplier' && <Tag color="geekblue">поставщик</Tag>}
                    {row.direction === 'customer' && (
                        <Tooltip title="Документ по нашей продаже клиенту: поступление не создаётся">
                            <Tag color="purple">клиент</Tag>
                        </Tooltip>
                    )}
                    {row.direction === 'unknown' && (
                        <Tooltip title="Контрагент привязан и к поставщику, и к клиенту, а по документу направление не определить. Нужно решение вручную.">
                            <Tag color="warning">не определено</Tag>
                        </Tooltip>
                    )}
                    {row.amount_mismatch_status === 'pending' && (
                        <Tooltip title={`Диадок ${row.total_amount ?? '—'} ₽, второй источник ${row.mismatch_other_total ?? '—'} ₽`}>
                            <Tag color="warning">Расхождение по сумме</Tag>
                        </Tooltip>
                    )}
                    {row.amount_mismatch_status === 'applied' && !row.mismatch_acknowledged_at && (
                        <Tooltip title="Сумма отличалась от письма; применены данные Диадока. Ждёт проверки.">
                            <Tag color="error">Расхождение: применён Диадок</Tag>
                        </Tooltip>
                    )}
                    {row.amount_mismatch_status === 'correction_required' && (
                        <Tag color="error">Требуется корректировка</Tag>
                    )}
                    {row.duplicate_kind === 'email' && (
                        <Tooltip title="Тот же документ уже получен по почте: второе поступление не создано, подпись и статусы — по Диадоку">
                            <Tag color="cyan">Тот же документ (почта)</Tag>
                        </Tooltip>
                    )}
                    {row.duplicate_kind === 'diadoc' && (
                        <Tag>Дубль документа #{row.duplicate_of_document_id}</Tag>
                    )}
                </Space>
            ),
        },
        {
            title: 'Этап',
            key: 'stage',
            width: 170,
            render: (_, row) => {
                const index = INBOUND_STAGES.findIndex((item) => item.key === row.stage);
                return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {row.stage === 'rejected' && <Tag color="error">Отказано в подписи</Tag>}
                        {index >= 0 && (
                            <Tooltip title={INBOUND_STAGES.map((item) => item.label).join(' → ')}>
                                <div>
                                    <Progress
                                        steps={INBOUND_STAGES.length}
                                        percent={((index + 1) / INBOUND_STAGES.length) * 100}
                                        showInfo={false}
                                        size="small"
                                        strokeColor={row.stage === 'signed' ? '#52c41a' : undefined}
                                    />
                                    <div style={{ fontSize: 12 }}>{INBOUND_STAGES[index].label}</div>
                                </div>
                            </Tooltip>
                        )}
                        {!row.stage && <Text type="secondary" style={{ fontSize: 12 }}>не поступление</Text>}
                        {row.attention_reason && (
                            <Text type="warning" style={{ fontSize: 12 }}>
                                {row.attention_reason}
                            </Text>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Документ',
            key: 'document',
            width: 240,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.file_name || row.document_number || `#${row.id}`}</Text>
                    <Text type="secondary">
                        {row.document_number || 'Без номера'}
                        {row.document_date ? ` · ${dayjs(row.document_date).format('DD.MM.YYYY')}` : ''}
                    </Text>
                    {row.document_kind && (
                        <Tag style={{ marginTop: 2 }}>
                            {DOCUMENT_KIND_LABELS[row.document_kind] || row.document_kind}
                        </Tag>
                    )}
                    {row.parsed_details?.correction_id && (
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0 }}
                            onClick={() => navigate('/documents/corrections')}
                        >
                            КСФ #{row.parsed_details.correction_id}
                            {row.parsed_details.state === 'receipt_not_found' ? ' · привязать вручную' : ''}
                            {row.parsed_details.unmatched?.length ? ` · строк без пары: ${row.parsed_details.unmatched.length}` : ''}
                        </Button>
                    )}
                    {row.parsed_details?.reclamation_id && (
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0 }}
                            onClick={() => navigate('/reclamations')}
                        >
                            Рекламация #{row.parsed_details.reclamation_id}
                        </Button>
                    )}
                    {row.parsed_details?.state === 'shipment_not_found' && (
                        <Tag color="warning">реализация не найдена — привязать вручную</Tag>
                    )}
                    {row.total_amount != null && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Сумма: {Number(row.total_amount).toLocaleString('ru-RU')} ₽
                        </Text>
                    )}
                    {row.import_error_details && ['amount_mismatch', 'duplicate', 'skipped'].includes(row.status) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>{row.import_error_details}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Контрагент / поставщик',
            key: 'provider',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.direction === 'customer' ? (row.customer_name || 'Клиент') : (row.provider_name || 'Не сопоставлен')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.counteragent_box_id || '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Получен',
            dataIndex: 'delivery_at',
            width: 160,
            render: fmtDateTime,
        },
        {
            title: 'Связь',
            key: 'links',
            width: 180,
            render: (_, row) => (
                <Space wrap>
                    {Array.isArray(row.supplier_receipt_ids) && row.supplier_receipt_ids.length > 0 ? (
                        <Button
                            size="small"
                            type="link"
                            onClick={() => navigate(`/documents/incoming?openId=${row.supplier_receipt_ids[0]}`)}
                        >
                            Поступление #{row.supplier_receipt_ids[0]}
                        </Button>
                    ) : row.supplier_order_message_id ? (
                        <Tag>msg #{row.supplier_order_message_id}</Tag>
                    ) : (
                        <Text type="secondary">—</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 230,
            render: (_, row) => (
                <Space wrap>
                    {row.amount_mismatch_status === 'pending' && (
                        <>
                            <Popconfirm
                                title="Применить данные Диадока?"
                                description="Непроведённое поступление из письма будет заменено, проведённое — не изменится (создастся КСФ для корректировки)."
                                okText="Применить"
                                cancelText="Отмена"
                                onConfirm={() => handleResolveMismatch(row, 'apply_diadoc')}
                            >
                                <Button size="small" type="primary" loading={processingDocId === row.id}>
                                    Взять данные Диадока
                                </Button>
                            </Popconfirm>
                            <Popconfirm
                                title="Оставить версию из письма?"
                                okText="Оставить"
                                cancelText="Отмена"
                                onConfirm={() => handleResolveMismatch(row, 'keep_existing')}
                            >
                                <Button size="small">Оставить как есть</Button>
                            </Popconfirm>
                        </>
                    )}
                    {['applied', 'correction_required', 'dismissed'].includes(row.amount_mismatch_status)
                        && !row.mismatch_acknowledged_at && (
                        <Tooltip title="Подтвердить, что расхождение просмотрено: всплывающее окно закроется">
                            <Button
                                size="small"
                                type="primary"
                                danger
                                loading={processingDocId === row.id}
                                onClick={() => handleAcknowledgeMismatch(row)}
                            >
                                Проверено
                            </Button>
                        </Tooltip>
                    )}
                    <Button
                        size="small"
                        icon={<SyncOutlined />}
                        loading={processingDocId === row.id}
                        disabled={!row.can_process_supplier_message || !row.provider_id || row.amount_mismatch_status === 'pending'}
                        onClick={() => handleProcessInbound(row)}
                    >
                        Обработать
                    </Button>
                    {row.signed_at ? (
                        <Tooltip title={`Титул покупателя отправлен ${fmtDateTime(row.signed_at)}`}>
                            <Tag color="success">Подписан</Tag>
                        </Tooltip>
                    ) : row.rejected_at ? (
                        <Tooltip title={`Отказ отправлен ${fmtDateTime(row.rejected_at)}`}>
                            <Tag color="error">Отказано</Tag>
                        </Tooltip>
                    ) : (
                        <>
                            <Tooltip title={row.sign_block_reason || "Подписать облачной подписью: титул покупателя + извещение о получении. Понадобится код из SMS."}>
                                <Button
                                    size="small"
                                    icon={<SafetyCertificateOutlined />}
                                    loading={cloudSignStartingKey === `sign:${row.id}`}
                                    disabled={!row.message_id || !row.entity_id || !row.can_sign_incoming}
                                    onClick={() => handleStartInboundSign(row)}
                                >
                                    Подписать
                                </Button>
                            </Tooltip>
                            <Tooltip title="Отказать в подписи (с причиной, код из SMS)">
                                <Button
                                    size="small"
                                    danger
                                    type="text"
                                    icon={<CloseCircleOutlined />}
                                    loading={cloudSignStartingKey === `reject:${row.id}`}
                                    disabled={!row.message_id || !row.entity_id}
                                    onClick={() => {
                                        setRejectComment('');
                                        setRejectTarget(row);
                                    }}
                                />
                            </Tooltip>
                        </>
                    )}
                    <Tooltip title="Скачать печатную форму (PDF)">
                        <Button
                            size="small"
                            type="text"
                            icon={<PrinterOutlined />}
                            loading={printingKey === `in:${row.id}`}
                            disabled={!row.message_id || !row.entity_id}
                            onClick={() => handlePrintForm(row, 'in')}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const outboundColumns = [
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 190,
            render: (value, row) => (
                <Space direction="vertical" size={0}>
                    <Tag color={STATUS_COLORS[value] || 'default'}>
                        {SYNC_RESULT_LABELS[value] || value}
                    </Tag>
                    {row.docflow_status_text ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {row.docflow_status_text}
                        </Text>
                    ) : null}
                    {row.transport_status_text ? (
                        <Tooltip
                            title={[
                                row.transport_mintrans_id
                                    ? `ГИС ЭПД: ${row.transport_mintrans_id}`
                                    : null,
                                row.transport_carriage_id
                                    ? `Перевозка: ${row.transport_carriage_id}`
                                    : null,
                            ].filter(Boolean).join(' · ') || undefined}
                        >
                            <Tag color={TRANSPORT_STATUS_COLORS[
                                row.transport_status_type
                            ] || 'blue'}>
                                {row.transport_status_text}
                            </Tag>
                        </Tooltip>
                    ) : null}
                    {row.status_checked_at ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            проверен {fmtDateTime(row.status_checked_at)}
                        </Text>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Документ',
            key: 'document',
            width: 250,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.file_name || `#${row.id}`}</Text>
                    <Text type="secondary">
                        {row.document_number || 'Без номера'}
                        {row.document_date ? ` · ${dayjs(row.document_date).format('DD.MM.YYYY')}` : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Получатель',
            key: 'recipient',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.customer_name || row.provider_name || 'Не указан'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.to_box_id_guid || '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Источник',
            key: 'source',
            width: 180,
            render: (_, row) => {
                if (row.source_type === 'shipment_document' && row.source_id) {
                    return (
                        <Button
                            size="small"
                            type="link"
                            onClick={() => navigate(`/warehouse/shipments/${row.source_id}`)}
                        >
                            Отгрузка #{row.source_id}
                        </Button>
                    );
                }
                return row.source_type ? (
                    <Tag>{`${row.source_type}${row.source_id ? ` #${row.source_id}` : ''}`}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                );
            },
        },
        {
            title: 'Отправлен',
            dataIndex: 'sent_at',
            width: 160,
            render: fmtDateTime,
        },
        {
            title: '',
            key: 'doc_actions',
            width: 130,
            render: (_, row) => (
                <Space size={4}>
                    {row.message_id && row.entity_id ? (
                        <Tooltip title="Обновить статус из Диадока">
                            <Button
                                size="small"
                                type="text"
                                icon={<ReloadOutlined />}
                                loading={refreshingOutboundId === row.id}
                                onClick={() =>
                                    handleRefreshOutboundDocStatus(row.id)
                                }
                            />
                        </Tooltip>
                    ) : null}
                    {row.message_id && row.entity_id && !row.is_draft ? (
                        <Tooltip title="Скачать печатную форму (PDF)">
                            <Button
                                size="small"
                                type="text"
                                icon={<PrinterOutlined />}
                                loading={printingKey === `out:${row.id}`}
                                onClick={() => handlePrintForm(row, 'out')}
                            />
                        </Tooltip>
                    ) : null}
                    {row.is_draft ? (
                        <Tooltip title="Подписать облачной подписью и отправить контрагенту (код из SMS)">
                            <Button
                                size="small"
                                type="text"
                                icon={<SendOutlined />}
                                loading={cloudSignStartingKey === `send:${row.id}`}
                                onClick={() => handleStartSendSigned(row)}
                            />
                        </Tooltip>
                    ) : null}
                    {!row.is_draft &&
                    row.message_id &&
                    !['revoked', 'revocation_requested'].includes(row.status) ? (
                        <Tooltip title="Запросить аннулирование документа (код из SMS)">
                            <Button
                                size="small"
                                type="text"
                                danger
                                icon={<StopOutlined />}
                                loading={cloudSignStartingKey === `revoke:${row.id}`}
                                onClick={() => {
                                    setRevokeComment('');
                                    setRevokeTarget(row);
                                }}
                            />
                        </Tooltip>
                    ) : null}
                </Space>
            ),
        },
    ];

    const counteragentColumns = [
        {
            title: 'Контрагент',
            key: 'counteragent',
            width: 280,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.full_name || row.short_name || '—'}</Text>
                    <Text type="secondary">{row.box_id_guid || row.box_id || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'ИНН / КПП',
            key: 'tax',
            width: 180,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.inn || '—'}</Text>
                    <Text type="secondary">{row.kpp || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 160,
            render: (value) => value ? <Tag color="processing">{value}</Tag> : '—',
        },
        {
            title: 'Связано',
            key: 'mapped',
            width: 280,
            render: (_, row) => (
                <Space direction="vertical" size={2}>
                    <Text>{row.mapped_provider_name ? `Поставщик: ${row.mapped_provider_name}` : 'Поставщик: —'}</Text>
                    <Text>{row.mapped_customer_name ? `Клиент: ${row.mapped_customer_name}` : 'Клиент: —'}</Text>
                    {row.suggested_provider_id && !row.mapped_provider_name ? (
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, height: 'auto' }}
                            loading={quickBindKey === `provider:${row.box_id_guid}`}
                            onClick={() => handleQuickBindByInn(row, 'provider')}
                        >
                            Совпадение по ИНН: {row.suggested_provider_name} → привязать
                        </Button>
                    ) : null}
                    {row.suggested_customer_id && !row.mapped_customer_name ? (
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, height: 'auto' }}
                            loading={quickBindKey === `customer:${row.box_id_guid}`}
                            onClick={() => handleQuickBindByInn(row, 'customer')}
                        >
                            Совпадение по ИНН: {row.suggested_customer_name} → привязать
                        </Button>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 180,
            render: (_, row) => (
                <Space>
                    <Button
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => {
                            setBindTargetType('provider');
                            setBindCounteragent(row);
                            setBindOpen(true);
                        }}
                    >
                        К поставщику
                    </Button>
                    <Button
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => {
                            setBindTargetType('customer');
                            setBindCounteragent(row);
                            setBindOpen(true);
                        }}
                    >
                        К клиенту
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="page-shell">
            <style>
                {`
                    .diadoc-focused-row > td {
                        background: #fffbe6 !important;
                    }
                `}
            </style>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card loading={statusLoading}>
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                        <Col>
                            <Space direction="vertical" size={4}>
                                <Title level={3} style={{ margin: 0 }}>Диадок</Title>
                                <Text type="secondary">
                                    Отдельный операционный реестр для входящих, исходящих, sync-статусов и привязок контрагентов.
                                </Text>
                            </Space>
                        </Col>
                        <Col>
                            <Space wrap>
                                <Button
                                    icon={<ReloadOutlined />}
                                    onClick={() => {
                                        loadStatus();
                                        loadCounteragents(counteragentQuery);
                                        loadInbound();
                                        loadOutbound();
                                    }}
                                >
                                    Обновить
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<SyncOutlined />}
                                    onClick={handleSyncInbound}
                                    loading={syncLoading}
                                    disabled={!status?.connected}
                                >
                                    Синхронизировать входящие
                                </Button>
                            </Space>
                        </Col>
                    </Row>

                    {!status?.configured && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="warning"
                            showIcon
                            message="Диадок ещё не настроен"
                            description="На backend не хватает OAuth-конфигурации или подключение ещё не завершено."
                        />
                    )}

                    {status?.configured && !status?.connected && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="info"
                            showIcon
                            message="Диадок настроен, но не подключён"
                            description="Сначала нужно пройти OAuth-подключение в админском контуре."
                        />
                    )}

                    <Descriptions
                        style={{ marginTop: 16 }}
                        bordered
                        size="small"
                        column={{ xs: 1, sm: 2, xl: 4 }}
                    >
                        <Descriptions.Item label="Окружение">
                            <Tag color={status?.environment === 'prod' ? 'red' : 'blue'}>
                                {status?.environment || '—'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Подключение">
                            <Tag color={status?.connected ? 'success' : 'default'}>
                                {status?.connected ? 'Подключено' : 'Не подключено'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Организация">
                            {status?.organization_name || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Ящик">
                            {status?.box_id_guid || status?.box_id || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Пользователь">
                            {status?.connected_user_name || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Последнее получение входящих">
                            {fmtDateTime(status?.inbound_last_sync_at || status?.last_sync_at)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Последняя проверка исходящих">
                            {fmtDateTime(status?.outbound_last_sync_at)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Автообработка входящих">
                            <Tag color={status?.inbound_process_enabled ? 'success' : 'default'}>
                                {status?.inbound_process_enabled ? 'Включена' : 'Выключена'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Очередь входящих">
                            <Tag color={status?.inbound_continuation_index_key ? 'processing' : 'success'}>
                                {status?.inbound_continuation_index_key ? 'Дочитывается' : 'Обработана до конца'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Лимит sync">
                            {status?.inbound_sync_count || 0}
                        </Descriptions.Item>
                        <Descriptions.Item label="Лента событий">
                            <Tag color={status?.event_feed_initialized ? 'success' : 'warning'}>
                                {status?.event_feed_initialized ? 'Работает' : 'Не инициализирована'}
                            </Tag>
                            {status?.event_feed_last_polled_at && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {fmtDateTime(status.event_feed_last_polled_at)}
                                </Text>
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="События в очереди">
                            <Space size={4} wrap>
                                <Tag>ждут: {status?.events_pending || 0}</Tag>
                                <Tag color={status?.events_retrying ? 'warning' : 'default'}>
                                    повторяются: {status?.events_retrying || 0}
                                </Tag>
                                <Tag color={status?.events_failed ? 'error' : 'default'}>
                                    остановлены: {status?.events_failed || 0}
                                </Tag>
                            </Space>
                        </Descriptions.Item>
                    </Descriptions>

                    {status?.last_error
                        && status.last_error !== status?.inbound_last_error
                        && status.last_error !== status?.outbound_last_error && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message="Последняя ошибка Диадока"
                            description={status.last_error}
                        />
                        )}
                    {status?.events_failed > 0 && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message={`События Диадока, обработка которых остановлена после повторов: ${status.events_failed}`}
                            description={(
                                <Space direction="vertical" size={2}>
                                    {(status.events_failed_examples || []).map((item) => (
                                        <Text key={item.event_id} style={{ fontSize: 12 }}>
                                            {item.message_id || item.event_id}: {item.error}
                                        </Text>
                                    ))}
                                </Space>
                            )}
                            action={(
                                <Button
                                    size="small"
                                    loading={retryingEvents}
                                    onClick={handleRetryFailedEvents}
                                >
                                    Повторить
                                </Button>
                            )}
                        />
                    )}
                    {status?.inbound_last_error && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message="Ошибка получения входящих"
                            description={status.inbound_last_error}
                        />
                    )}
                    {status?.outbound_last_error && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message="Ошибка проверки исходящих"
                            description={status.outbound_last_error}
                        />
                    )}
                </Card>

                {(focusedInboundId || focusedOutboundId) && (
                    <Alert
                        type="info"
                        showIcon
                        message="Открыта конкретная запись Диадока"
                        description={
                            focusedInboundId
                                ? `Фокус на входящем документе #${focusedInboundId}`
                                : `Фокус на исходящем документе #${focusedOutboundId}`
                        }
                    />
                )}

                <Card
                    title="Профиль формализованного УПД"
                    extra={(
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSaveFormalizedProfile}
                            loading={settingsSaving}
                        >
                            Сохранить профиль
                        </Button>
                    )}
                >
                    <Alert
                        style={{ marginBottom: 16 }}
                        type="info"
                        showIcon
                        message="Этот профиль используется для подготовки формализованного исходящего УПД"
                        description="Юридические реквизиты контрагента заполняются на карточке клиента. Здесь хранятся данные продавца и подписанта."
                    />
                    <Form form={settingsForm} layout="vertical">
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="seller_legal_address"
                                    label="Юридический адрес продавца"
                                >
                                    <Input placeholder="Юридический адрес организации" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="seller_postal_address"
                                    label="Почтовый адрес продавца"
                                >
                                    <Input placeholder="Почтовый адрес организации" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_full_name"
                                    label="ФИО подписанта"
                                >
                                    <Input placeholder="Иванов Иван Иванович" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_position"
                                    label="Должность подписанта"
                                >
                                    <Input placeholder="Генеральный директор" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_basis"
                                    label="Основание полномочий"
                                >
                                    <Input placeholder="Устав / Доверенность №..." />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="formalized_default_function"
                                    label="Функция УПД по умолчанию"
                                >
                                    <Select
                                        options={[
                                            { value: 'ДОП', label: 'ДОП' },
                                            { value: 'СЧФДОП', label: 'СЧФДОП' },
                                            { value: 'СЧФ', label: 'СЧФ' },
                                        ]}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Descriptions
                                    size="small"
                                    bordered
                                    column={1}
                                    style={{ marginTop: 30 }}
                                >
                                    <Descriptions.Item label="Организация Диадока">
                                        {status?.organization_name || '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="ИНН / КПП">
                                        {status?.organization_inn || '—'}
                                        {status?.organization_kpp ? ` / ${status.organization_kpp}` : ''}
                                    </Descriptions.Item>
                                </Descriptions>
                            </Col>
                        </Row>
                        <Card
                            size="small"
                            title="Получение входящих документов"
                            style={{ marginTop: 16 }}
                        >
                            <Alert
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                                message="Синхронизация только загружает документы. Автообработка дополнительно создаёт поступления после сопоставления поставщика и проверки дублей."
                            />
                            <Row gutter={16}>
                                <Col xs={24} md={6}>
                                    <Form.Item
                                        name="inbound_sync_enabled"
                                        label="Автополучение"
                                        valuePropName="checked"
                                    >
                                        <Switch checkedChildren="Включено" unCheckedChildren="Выключено" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item
                                        name="inbound_download_content"
                                        label="Скачивать файлы"
                                        valuePropName="checked"
                                    >
                                        <Switch checkedChildren="Да" unCheckedChildren="Нет" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item
                                        name="inbound_process_enabled"
                                        label="Автообработка"
                                        valuePropName="checked"
                                    >
                                        <Switch checkedChildren="Включена" unCheckedChildren="Выключена" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item
                                        name="inbound_sync_count"
                                        label="Документов на страницу"
                                        rules={[{ required: true }]}
                                    >
                                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                    </Form>
                </Card>

                <Tabs
                    activeKey={activeTab}
                    onChange={handleTabChange}
                    items={[
                        {
                            key: 'counteragents',
                            label: 'Контрагенты',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={16}>
                                            <Input.Search
                                                allowClear
                                                placeholder="Поиск по имени, ИНН, КПП"
                                                value={counteragentQuery}
                                                onChange={(event) => setCounteragentQuery(event.target.value)}
                                                onSearch={(value) => {
                                                    setCounteragentQuery(value);
                                                    loadCounteragents(value);
                                                }}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadCounteragents(counteragentQuery)}
                                                loading={counteragentsLoading}
                                            >
                                                Обновить контрагентов
                                            </Button>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey={(row) => row.box_id_guid || row.box_id}
                                        size="small"
                                        loading={counteragentsLoading}
                                        dataSource={counteragents}
                                        columns={counteragentColumns}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1100 }}
                                    />
                                </Card>
                            ),
                        },
                        {
                            key: 'inbound',
                            label: 'Входящие',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Поставщик"
                                                value={inboundFilters.providerId}
                                                onChange={(value) => setInboundFilters((prev) => ({ ...prev, providerId: value || undefined }))}
                                                options={providerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Checkbox
                                                checked={Boolean(inboundFilters.attentionOnly)}
                                                onChange={(event) => {
                                                    const next = {
                                                        ...inboundFilters,
                                                        attentionOnly: event.target.checked,
                                                    };
                                                    setInboundFilters(next);
                                                    loadInbound(next);
                                                }}
                                            >
                                                Требует внимания
                                            </Checkbox>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Select
                                                style={{ width: '100%' }}
                                                value={String(inboundFilters.registeredOnly ?? 'all')}
                                                onChange={(value) => setInboundFilters((prev) => ({
                                                    ...prev,
                                                    registeredOnly: value === 'all' ? undefined : value === 'true',
                                                }))}
                                                options={[
                                                    { value: 'all', label: 'Все документы' },
                                                    { value: 'true', label: 'Только зарегистрированные' },
                                                    { value: 'false', label: 'Только незарегистрированные' },
                                                ]}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadInbound(inboundFilters)}
                                                loading={inboundLoading}
                                            >
                                                Обновить входящие
                                            </Button>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        loading={inboundLoading}
                                        dataSource={inboundRows}
                                        columns={inboundColumns}
                                        rowClassName={(row) => (
                                            focusedInboundId && row.id === focusedInboundId
                                                ? 'diadoc-focused-row'
                                                : ''
                                        )}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1370 }}
                                    />
                                </Card>
                            ),
                        },
                        {
                            key: 'etrn',
                            label: 'Перевозки (ЭТрН)',
                            children: <EtrnPanel status={status} onStatusChanged={loadStatus} />,
                        },
                        {
                            key: 'outbound',
                            label: 'Исходящие',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Клиент"
                                                value={outboundFilters.customerId}
                                                onChange={(value) => setOutboundFilters((prev) => ({ ...prev, customerId: value || undefined }))}
                                                options={customerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Поставщик"
                                                value={outboundFilters.providerId}
                                                onChange={(value) => setOutboundFilters((prev) => ({ ...prev, providerId: value || undefined }))}
                                                options={providerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={4}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadOutbound(outboundFilters)}
                                                loading={outboundLoading}
                                            >
                                                Обновить список
                                            </Button>
                                        </Col>
                                        <Col xs={24} md={4}>
                                            <Tooltip title="Опросить Диадок по всем незавершённым документам: доставка, подпись, отказ, аннулирование">
                                                <Button
                                                    block
                                                    type="primary"
                                                    ghost
                                                    icon={<CloudSyncOutlined />}
                                                    onClick={handleSyncOutboundStatuses}
                                                    loading={outboundStatusSyncLoading}
                                                >
                                                    Статусы из Диадока
                                                </Button>
                                            </Tooltip>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        loading={outboundLoading}
                                        dataSource={outboundRows}
                                        columns={outboundColumns}
                                        rowClassName={(row) => (
                                            focusedOutboundId && row.id === focusedOutboundId
                                                ? 'diadoc-focused-row'
                                                : ''
                                        )}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1100 }}
                                    />
                                </Card>
                            ),
                        },
                    ]}
                />
            </Space>

            <BindCounteragentModal
                open={bindOpen}
                onCancel={() => {
                    setBindOpen(false);
                    setBindCounteragent(null);
                }}
                onSubmit={handleBindCounteragent}
                submitting={bindLoading}
                targetType={bindTargetType}
                counteragent={bindCounteragent}
                providerOptions={providerOptions}
                customerOptions={customerOptions}
            />

            <Modal
                open={Boolean(cloudSignTask)}
                title={cloudSignTask?.title || 'Подтверждение подписи'}
                okText="Подтвердить"
                cancelText="Отмена"
                confirmLoading={cloudSignSubmitting}
                onOk={handleConfirmCloudSign}
                onCancel={() => {
                    setCloudSignTask(null);
                    setCloudSignCode('');
                }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                        type="info"
                        showIcon
                        message="Файлы переданы на облачное подписание"
                        description="На телефон владельца Контур.Сертификата отправлено SMS с кодом подтверждения. Введите код — документ будет подписан и отправлен."
                    />
                    <Input
                        autoFocus
                        placeholder="Код из SMS"
                        value={cloudSignCode}
                        maxLength={20}
                        onChange={(e) => setCloudSignCode(e.target.value)}
                        onPressEnter={handleConfirmCloudSign}
                    />
                </Space>
            </Modal>

            <Modal
                open={Boolean(revokeTarget)}
                title={`Аннулирование ${revokeTarget?.file_name || ''}`}
                okText="Запросить аннулирование"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                confirmLoading={
                    cloudSignStartingKey === `revoke:${revokeTarget?.id}`
                }
                onOk={handleStartRevoke}
                onCancel={() => {
                    setRevokeTarget(null);
                    setRevokeComment('');
                }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                        type="warning"
                        showIcon
                        message="Контрагент должен подтвердить аннулирование"
                        description="Будет сформирован запрос на аннулирование, подписан облачной подписью (код из SMS) и отправлен контрагенту."
                    />
                    <Input.TextArea
                        rows={3}
                        placeholder="Причина аннулирования (необязательно)"
                        value={revokeComment}
                        maxLength={1000}
                        onChange={(e) => setRevokeComment(e.target.value)}
                    />
                </Space>
            </Modal>

            <Modal
                open={Boolean(acceptanceTarget)}
                width={720}
                title={`Приёмка расходится с документом ${acceptanceTarget?.row?.document_number || acceptanceTarget?.row?.file_name || ''}`}
                onCancel={() => setAcceptanceTarget(null)}
                footer={[
                    <Button key="cancel" onClick={() => setAcceptanceTarget(null)}>
                        Отмена
                    </Button>,
                    <Button
                        key="reject"
                        danger
                        onClick={() => {
                            setRejectComment('');
                            setRejectTarget(acceptanceTarget.row);
                            setAcceptanceTarget(null);
                        }}
                    >
                        Отказать в подписи
                    </Button>,
                    <Button
                        key="sign"
                        type="primary"
                        loading={cloudSignStartingKey === `sign:${acceptanceTarget?.row?.id}`}
                        onClick={() => handleStartInboundSign(
                            acceptanceTarget.row,
                            acceptanceTarget.acceptance?.suggested_total_code || '2',
                        )}
                    >
                        {acceptanceTarget?.acceptance?.suggested_total_code === '3'
                            ? 'Подписать «не принято»'
                            : 'Подписать с расхождениями'}
                    </Button>,
                ]}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                        type="warning"
                        showIcon
                        message="Подписать «принято без расхождений» нельзя"
                        description="Проведённое поступление отличается от УПД. Исправьте поступление, подпишите документ с расхождениями или откажите в подписи."
                    />
                    <Table
                        size="small"
                        rowKey={(line, index) => `${line.kind}:${line.label}:${index}`}
                        dataSource={acceptanceTarget?.acceptance?.lines || []}
                        pagination={false}
                        scroll={{ y: 320 }}
                        columns={[
                            {
                                title: 'Расхождение',
                                dataIndex: 'kind',
                                width: 140,
                                render: (kind) => (
                                    <Tag color={ACCEPTANCE_KIND_LABELS[kind]?.color}>
                                        {ACCEPTANCE_KIND_LABELS[kind]?.label || kind}
                                    </Tag>
                                ),
                            },
                            { title: 'Позиция', dataIndex: 'label' },
                            {
                                title: 'В документе',
                                dataIndex: 'document_quantity',
                                width: 110,
                                align: 'right',
                                render: (value, line) => (
                                    line.kind === 'marking' ? `кодов: ${value}` : value
                                ),
                            },
                            {
                                title: 'Принято',
                                dataIndex: 'received_quantity',
                                width: 90,
                                align: 'right',
                            },
                        ]}
                    />
                    {acceptanceTarget?.acceptance?.lines_total > (acceptanceTarget?.acceptance?.lines || []).length && (
                        <Text type="secondary">
                            Показаны первые {acceptanceTarget.acceptance.lines.length} из {acceptanceTarget.acceptance.lines_total} расхождений
                        </Text>
                    )}
                </Space>
            </Modal>

            <Modal
                open={Boolean(rejectTarget)}
                title={`Отказ в подписи ${rejectTarget?.document_number || rejectTarget?.file_name || ''}`}
                okText="Отправить отказ (SMS)"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                confirmLoading={
                    cloudSignStartingKey === `reject:${rejectTarget?.id}`
                }
                onOk={handleStartInboundReject}
                onCancel={() => {
                    setRejectTarget(null);
                    setRejectComment('');
                }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                        type="warning"
                        showIcon
                        message="Поставщик получит мотивированный отказ"
                        description="Отказ подписывается облачной подписью (код из SMS). Причина обязательна."
                    />
                    <Input.TextArea
                        rows={3}
                        placeholder="Причина отказа (обязательно)"
                        value={rejectComment}
                        maxLength={1000}
                        onChange={(e) => setRejectComment(e.target.value)}
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default DiadocPage;
