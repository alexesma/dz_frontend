import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Grid,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Select,
    Segmented,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { PlayCircleOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { sendDragonzapOrder } from '../api/autoparts';
import { getCustomersSummary } from '../api/customers';
import {
    createAutoPurchaseRun,
    getAutoPurchaseRunDraftOrders,
    getAutoPurchaseRunDraftGroupAiExplanation,
    getAutoPurchaseRunItemAiExplanation,
    getAutoPurchaseRunItems,
    listAutoPurchaseRuns,
    markAutoPurchaseRunItemsSent,
    updateAutoPurchaseRunItems,
    updateAutoPurchaseRunItem,
    updateAutoPurchaseRunItemAllocations,
} from '../api/orderTracking';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const MODE_OPTIONS = [
    { value: 'draft_only', label: 'Только черновики' },
    { value: 'auto_approve_safe', label: 'Автоподтверждение safe' },
    { value: 'disabled', label: 'Отключено' },
];

const STATUS_OPTIONS = [
    { value: 'blocked', label: 'Заблокировано' },
    { value: 'needs_review', label: 'На проверку' },
    { value: 'auto_approved', label: 'Автоподтверждено' },
];

const statusColor = {
    blocked: 'red',
    needs_review: 'orange',
    auto_approved: 'green',
};

const RUN_STATUS_LABEL = {
    queued: 'В очереди',
    running: 'В расчёте',
    completed: 'Готов',
    failed: 'Ошибка',
};

const AUTOPURCHASE_DEFAULT_CUSTOMER_NAME = 'Zzap';
const AUTOPURCHASE_CUSTOMER_STORAGE_KEY = 'autopurchase.selectedCustomerId';

const formatMoney = (value) => {
    if (value == null) {
        return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));
};

const formatQty = (value) => {
    if (value == null) {
        return '—';
    }
    return `${value} шт`;
};

const formatMoneyWithRub = (value) => (
    value != null ? `${formatMoney(value)} руб.` : '—'
);

const resolveOrderHeatTone = (value, values) => {
    const numericValue = Number(value || 0);
    if (!numericValue) {
        return 'muted';
    }
    const positiveValues = values
        .map((item) => Number(item || 0))
        .filter((item) => item > 0);
    const maxValue = positiveValues.length ? Math.max(...positiveValues) : 0;
    if (!maxValue) {
        return 'muted';
    }
    const ratio = numericValue / maxValue;
    if (ratio >= 0.85) {
        return 'high';
    }
    if (ratio >= 0.45) {
        return 'mid';
    }
    return 'low';
};

const resolvePriceHeatTone = (value, values) => {
    const numericValue = Number(value || 0);
    if (!numericValue) {
        return 'muted';
    }
    const positiveValues = values
        .map((item) => Number(item || 0))
        .filter((item) => item > 0);
    if (!positiveValues.length) {
        return 'muted';
    }
    const minValue = Math.min(...positiveValues);
    const maxValue = Math.max(...positiveValues);
    if (numericValue === minValue) {
        return 'best';
    }
    if (numericValue === maxValue) {
        return 'worst';
    }
    return 'mid';
};

const decisionStatusLabel = (value) => {
    if (value === 'blocked') {
        return 'Заблокировано';
    }
    if (value === 'needs_review') {
        return 'На проверку';
    }
    if (value === 'auto_approved') {
        return 'Подтверждено';
    }
    return 'Ожидание';
};

const getApproveUnavailableReason = (row) => {
    if (!row) {
        return 'Строка автозаказа не найдена';
    }
    if (!row.recommended_supplier?.provider_name) {
        return 'Нельзя подтвердить строку без найденного site-поставщика';
    }
    if (!row.draft_purchase_order) {
        return 'Нельзя подтвердить строку без подготовленного черновика заказа';
    }
    return null;
};

const buildAutopurchaseTrackingKey = (runId, itemId) =>
    `apr${String(runId || '')}i${String(itemId || '')}`;

const hasSendableIdentity = (item) => Boolean(item?.hash_key || item?.system_hash);

const extractRequestError = (error, fallback) =>
    error?.response?.data?.detail ||
    error?.message ||
    fallback;

const normalizeCustomerName = (value) =>
    String(value || '').trim().toLowerCase();

const readStoredAutopurchaseCustomerId = () => {
    try {
        const rawValue = window.localStorage.getItem(AUTOPURCHASE_CUSTOMER_STORAGE_KEY);
        return rawValue ? Number(rawValue) : null;
    } catch (error) {
        console.warn('Failed to read autopurchase customer from localStorage', error);
        return null;
    }
};

const persistAutopurchaseCustomerId = (customerId) => {
    try {
        if (customerId == null) {
            window.localStorage.removeItem(AUTOPURCHASE_CUSTOMER_STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(
            AUTOPURCHASE_CUSTOMER_STORAGE_KEY,
            String(customerId)
        );
    } catch (error) {
        console.warn('Failed to persist autopurchase customer to localStorage', error);
    }
};

const resolvePreferredAutopurchaseCustomerId = (customers, explicitId = null) => {
    const normalizedDefaultName = normalizeCustomerName(AUTOPURCHASE_DEFAULT_CUSTOMER_NAME);
    const normalizedCustomers = Array.isArray(customers) ? customers : [];

    if (explicitId != null) {
        const existingExplicit = normalizedCustomers.find(
            (item) => Number(item?.id) === Number(explicitId)
        );
        if (existingExplicit?.id != null) {
            return Number(existingExplicit.id);
        }
    }

    const zzapCustomer = normalizedCustomers.find(
        (item) => normalizeCustomerName(item?.name) === normalizedDefaultName
    ) || normalizedCustomers.find(
        (item) => normalizeCustomerName(item?.name).includes(normalizedDefaultName)
    );

    if (zzapCustomer?.id != null) {
        return Number(zzapCustomer.id);
    }

    return normalizedCustomers[0]?.id ?? null;
};

const isAutopurchaseRunLockedError = (error) => {
    const statusCode = Number(error?.response?.status || 0);
    const detail = String(error?.response?.data?.detail || '').toLowerCase();
    return statusCode === 409 || detail.includes('уже выполняется расчёт автозаказа');
};

const showAutopurchaseRunLockedMessage = () => {
    message.warning(
        'Сейчас другой менеджер уже запустил расчёт автозаказа. Дождись его завершения и попробуй снова через несколько секунд.'
    );
};

const SummaryStatCard = ({ title, value, color = '#0f172a' }) => (
    <div
        style={{
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            background: '#fff',
        }}
    >
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{title}</div>
        <div style={{ color, fontWeight: 800, fontSize: 20 }}>{value}</div>
    </div>
);

const AutopurchasePage = () => {
    const screens = useBreakpoint();
    const navigate = useNavigate();
    const [runsLoading, setRunsLoading] = useState(false);
    const [rowsLoading, setRowsLoading] = useState(false);
    const [draftsLoading, setDraftsLoading] = useState(false);
    const [customersLoading, setCustomersLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [sendGroupLoadingKey, setSendGroupLoadingKey] = useState(null);
    const [bulkSendLoading, setBulkSendLoading] = useState(false);
    const [bulkStatusLoading, setBulkStatusLoading] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [rerunLoading, setRerunLoading] = useState(false);
    const [runs, setRuns] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [runPayload, setRunPayload] = useState(null);
    const [draftPayload, setDraftPayload] = useState(null);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [selectedDraftGroupKeys, setSelectedDraftGroupKeys] = useState([]);
    const [showOnlyPendingRows, setShowOnlyPendingRows] = useState(false);
    const [showOnlyNeedsReviewRows, setShowOnlyNeedsReviewRows] = useState(false);
    const [showOnlySendableDraftGroups, setShowOnlySendableDraftGroups] = useState(false);
    const [rowsViewMode, setRowsViewMode] = useState('compact');
    const [expandedRowKeys, setExpandedRowKeys] = useState([]);
    const [activeRunProgress, setActiveRunProgress] = useState(null);
    const [runElapsedSec, setRunElapsedSec] = useState(0);
    const [aiModalState, setAiModalState] = useState({
        open: false,
        kind: 'item',
        row: null,
        group: null,
        payload: null,
    });
    const [filters, setFilters] = useState({
        mode: 'draft_only',
        decision_status: undefined,
        q: '',
        limit: 200,
        budget_limit: null,
        position_limit: null,
    });

    const fetchRuns = useCallback(async () => {
        setRunsLoading(true);
        try {
            const { data } = await listAutoPurchaseRuns({ limit: 50 });
            const nextRuns = Array.isArray(data) ? data : [];
            setRuns(nextRuns);
            if (!selectedRunId && nextRuns.length) {
                setSelectedRunId(nextRuns[0].id);
            }
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить запуски автозаказа');
        } finally {
            setRunsLoading(false);
        }
    }, [selectedRunId]);

    const fetchRunItems = useCallback(async (runId, nextFilters) => {
        if (!runId) {
            setRunPayload(null);
            return;
        }
        setRowsLoading(true);
        try {
            const { data } = await getAutoPurchaseRunItems(runId, {
                decision_status: nextFilters?.decision_status || undefined,
                q: (nextFilters?.q || '').trim() || undefined,
                limit: nextFilters?.limit || 200,
            });
            setRunPayload(data || null);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить строки автозаказа');
            setRunPayload(null);
        } finally {
            setRowsLoading(false);
        }
    }, []);

    const fetchDraftOrders = useCallback(async (runId) => {
        if (!runId) {
            setDraftPayload(null);
            return;
        }
        setDraftsLoading(true);
        try {
            const { data } = await getAutoPurchaseRunDraftOrders(runId);
            setDraftPayload(data || null);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось собрать черновики автозаказа');
            setDraftPayload(null);
        } finally {
            setDraftsLoading(false);
        }
    }, []);

    const fetchCustomers = useCallback(async () => {
        setCustomersLoading(true);
        try {
            const { data } = await getCustomersSummary({
                page: 1,
                page_size: 200,
            });
            const nextRows = Array.isArray(data?.items) ? data.items : [];
            setCustomerOptions(
                nextRows.map((item) => ({
                    value: item.id,
                    label: item.name || `Клиент #${item.id}`,
                }))
            );
            setSelectedCustomerId((prev) => {
                const storedCustomerId = readStoredAutopurchaseCustomerId();
                const preferredId = prev ?? storedCustomerId;
                const nextCustomerId = resolvePreferredAutopurchaseCustomerId(
                    nextRows,
                    preferredId
                );
                persistAutopurchaseCustomerId(nextCustomerId);
                return nextCustomerId;
            });
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить список клиентов');
        } finally {
            setCustomersLoading(false);
        }
    }, []);

    useEffect(() => {
        persistAutopurchaseCustomerId(selectedCustomerId);
    }, [selectedCustomerId]);

    useEffect(() => {
        void fetchRuns();
    }, [fetchRuns]);

    const run = runPayload?.run || runs.find((item) => item.id === selectedRunId) || null;
    const runStatus = run?.status || null;
    const shouldPollRuns = Boolean(activeRunProgress)
        || runs.some((item) => item.status === 'queued' || item.status === 'running')
        || runStatus === 'queued'
        || runStatus === 'running';

    useEffect(() => {
        if (!runs.length) {
            setSelectedRunId(null);
            return;
        }
        if (activeRunProgress && (runs[0]?.status === 'queued' || runs[0]?.status === 'running')) {
            setSelectedRunId(runs[0].id);
            return;
        }
        if (!selectedRunId || !runs.some((item) => item.id === selectedRunId)) {
            setSelectedRunId(runs[0].id);
        }
    }, [activeRunProgress, runs, selectedRunId]);

    useEffect(() => {
        void fetchCustomers();
    }, [fetchCustomers]);

    useEffect(() => {
        void fetchRunItems(selectedRunId, filters);
    }, [fetchRunItems, selectedRunId, filters, runStatus]);

    useEffect(() => {
        void fetchDraftOrders(selectedRunId);
    }, [fetchDraftOrders, selectedRunId, runStatus]);

    useEffect(() => {
        if (!shouldPollRuns) {
            return undefined;
        }
        const timer = window.setInterval(() => {
            void fetchRuns();
        }, 8000);
        return () => window.clearInterval(timer);
    }, [fetchRuns, shouldPollRuns]);

    const progressRunState = useMemo(() => {
        if (activeRunProgress) {
            return activeRunProgress;
        }
        if (!run || (run.status !== 'queued' && run.status !== 'running')) {
            return null;
        }
        const startedAtMs = run.started_at ? Date.parse(run.started_at) : NaN;
        return {
            type: run.status,
            startedAt: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
            limit: run.settings_snapshot?.limit || filters.limit || 300,
            mode: run.settings_snapshot?.mode || run.mode || filters.mode,
            message: run.summary_snapshot?.message
                || (run.status === 'queued'
                    ? 'Запуск автозаказа ожидает обработки scheduler.'
                    : 'Расчёт автозаказа выполняется в scheduler.'),
        };
    }, [activeRunProgress, filters.limit, filters.mode, run]);

    const handleCreateRun = async () => {
        setCreateLoading(true);
        setActiveRunProgress({
            type: 'create',
            startedAt: Date.now(),
            limit: 300,
            mode: filters.mode,
        });
        try {
            const { data } = await createAutoPurchaseRun({
                mode: filters.mode,
                limit: 300,
                budget_limit: filters.budget_limit || undefined,
                position_limit: filters.position_limit || undefined,
            });
            message.success('Запуск автозаказа создан и поставлен в очередь');
            await fetchRuns();
            if (data?.id) {
                setSelectedRunId(data.id);
            }
        } catch (error) {
            if (isAutopurchaseRunLockedError(error)) {
                showAutopurchaseRunLockedMessage();
            } else {
                const detail = error?.response?.data?.detail;
                message.error(detail || 'Не удалось создать запуск автозаказа');
            }
        } finally {
            setCreateLoading(false);
            setActiveRunProgress(null);
        }
    };

    const handleRerunCurrentSettings = useCallback(async () => {
        if (!run) {
            message.warning('Сначала выбери запуск автозаказа');
            return;
        }
        const settings = run.settings_snapshot || {};
        setRerunLoading(true);
        setActiveRunProgress({
            type: 'rerun',
            startedAt: Date.now(),
            limit: settings.limit || filters.limit || 300,
            mode: settings.mode || run.mode || filters.mode,
        });
        try {
            const { data } = await createAutoPurchaseRun({
                own_provider_config_id:
                    settings.own_provider_config_id ?? run.provider_config_id ?? undefined,
                mode: settings.mode || run.mode || filters.mode,
                limit: settings.limit || filters.limit || 300,
                budget_limit: settings.budget_limit || undefined,
                position_limit: settings.position_limit || undefined,
            });
            message.success('Новый запуск автозаказа создан и поставлен в очередь');
            await fetchRuns();
            if (data?.id) {
                setSelectedRunId(data.id);
            }
            setSelectedRowKeys([]);
            setSelectedDraftGroupKeys([]);
        } catch (error) {
            if (isAutopurchaseRunLockedError(error)) {
                showAutopurchaseRunLockedMessage();
            } else {
                const detail = error?.response?.data?.detail;
                message.error(detail || 'Не удалось пересчитать новый запуск автозаказа');
            }
        } finally {
            setRerunLoading(false);
            setActiveRunProgress(null);
        }
    }, [fetchRuns, filters.limit, filters.mode, run]);

    useEffect(() => {
        if (!progressRunState?.startedAt) {
            setRunElapsedSec(0);
            return undefined;
        }
        setRunElapsedSec(Math.max(0, Math.floor((Date.now() - progressRunState.startedAt) / 1000)));
        const timer = window.setInterval(() => {
            setRunElapsedSec(Math.max(0, Math.floor((Date.now() - progressRunState.startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [progressRunState]);

    const runProgressPercent = useMemo(() => {
        if (!progressRunState) {
            return 0;
        }
        const multiplier = progressRunState.type === 'queued' ? 0.8 : 1.6;
        return Math.min(95, 8 + Math.round(runElapsedSec * multiplier));
    }, [progressRunState, runElapsedSec]);

    const handleOpenAiExplanation = useCallback(async (row) => {
        if (!selectedRunId || !row?.id) {
            return;
        }
        setAiModalState({
            open: true,
            kind: 'item',
            row,
            group: null,
            payload: null,
        });
        setAiLoading(true);
        try {
            const { data } = await getAutoPurchaseRunItemAiExplanation(selectedRunId, row.id);
            setAiModalState({
                open: true,
                kind: 'item',
                row,
                group: null,
                payload: data || null,
            });
        } catch (error) {
            const detail = extractRequestError(error, 'Не удалось получить AI-пояснение');
            message.error(detail);
            setAiModalState({
                open: true,
                kind: 'item',
                row,
                group: null,
                payload: null,
            });
        } finally {
            setAiLoading(false);
        }
    }, [selectedRunId]);

    const handleOpenDraftGroupAiExplanation = useCallback(async (group) => {
        if (!selectedRunId || !group?.supplier_key) {
            return;
        }
        setAiModalState({
            open: true,
            kind: 'group',
            row: null,
            group,
            payload: null,
        });
        setAiLoading(true);
        try {
            const { data } = await getAutoPurchaseRunDraftGroupAiExplanation(
                selectedRunId,
                group.supplier_key
            );
            setAiModalState({
                open: true,
                kind: 'group',
                row: null,
                group,
                payload: data || null,
            });
        } catch (error) {
            const detail = extractRequestError(
                error,
                'Не удалось получить AI-пояснение по группе поставщика'
            );
            message.error(detail);
            setAiModalState({
                open: true,
                kind: 'group',
                row: null,
                group,
                payload: null,
            });
        } finally {
            setAiLoading(false);
        }
    }, [selectedRunId]);

    const applyDecisionStatusLocally = useCallback((itemIds, decisionStatus) => {
        const itemIdSet = new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map(Number));
        setRunPayload((prev) => {
            if (!prev?.rows) {
                return prev;
            }
            return {
                ...prev,
                rows: prev.rows.map((row) => (
                    itemIdSet.has(Number(row.id))
                        ? { ...row, decision_status: decisionStatus }
                        : row
                )),
            };
        });
    }, []);

    const refreshSelectedRunData = useCallback(async (runId, nextFilters) => {
        if (!runId) {
            return;
        }
        await Promise.all([
            fetchRuns(),
            fetchRunItems(runId, nextFilters),
            fetchDraftOrders(runId),
        ]);
    }, [fetchDraftOrders, fetchRunItems, fetchRuns]);

    const rows = useMemo(
        () => (Array.isArray(runPayload?.rows) ? runPayload.rows : []),
        [runPayload?.rows]
    );

    const toggleRowSelected = useCallback((rowId, checked) => {
        setSelectedRowKeys((prev) => {
            const normalizedRowId = Number(rowId);
            if (checked) {
                return prev.includes(normalizedRowId)
                    ? prev
                    : [...prev, normalizedRowId];
            }
            return prev.filter((key) => Number(key) !== normalizedRowId);
        });
    }, []);

    const handleItemStatusChange = useCallback(async (itemId, decisionStatus) => {
        if (!selectedRunId) {
            return;
        }
        const row = rows.find((item) => Number(item.id) === Number(itemId));
        if (decisionStatus === 'auto_approved') {
            const unavailableReason = getApproveUnavailableReason(row);
            if (unavailableReason) {
                message.warning(unavailableReason);
                return;
            }
        }
        try {
            await updateAutoPurchaseRunItem(selectedRunId, itemId, {
                decision_status: decisionStatus,
            });
            applyDecisionStatusLocally(itemId, decisionStatus);
            message.success('Статус строки автозаказа обновлён');
            await refreshSelectedRunData(selectedRunId, filters);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось обновить статус строки');
        }
    }, [applyDecisionStatusLocally, filters, refreshSelectedRunData, rows, selectedRunId]);

    const handleBulkStatusChange = useCallback(async (decisionStatus) => {
        if (!selectedRunId) {
            return;
        }
        if (!selectedRowKeys.length) {
            message.warning('Выбери хотя бы одну строку автозаказа');
            return;
        }
        setBulkStatusLoading(true);
        try {
            await updateAutoPurchaseRunItems(selectedRunId, {
                item_ids: selectedRowKeys,
                decision_status: decisionStatus,
            });
            applyDecisionStatusLocally(selectedRowKeys, decisionStatus);
            message.success('Статусы выбранных строк обновлены');
            setSelectedRowKeys([]);
            await refreshSelectedRunData(selectedRunId, filters);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось массово обновить статусы строк');
        } finally {
            setBulkStatusLoading(false);
        }
    }, [
        applyDecisionStatusLocally,
        filters,
        refreshSelectedRunData,
        selectedRowKeys,
        selectedRunId,
    ]);
    const currentRunSettings = run?.settings_snapshot || {};
    const currentBudgetLimit = currentRunSettings.budget_limit ?? null;
    const currentPositionLimit = currentRunSettings.position_limit ?? null;
    const runSummaryMessage = run?.summary_snapshot?.message || null;
    const runFailureMessage = run?.status === 'failed'
        ? (runSummaryMessage
            || 'Расчёт завершился с ошибкой. Проверь логи scheduler-контейнера.')
        : null;
    const runDiagnostics = useMemo(() => (
        Array.isArray(run?.summary_snapshot?.diagnostics)
            ? run.summary_snapshot.diagnostics.filter((item) => Number(item?.value || 0) > 0)
            : []
    ), [run]);
    const visibleRows = useMemo(
        () => (
            rows.filter((row) => {
                if (showOnlyPendingRows && row?.sent_to_site_at) {
                    return false;
                }
                if (showOnlyNeedsReviewRows && row?.decision_status !== 'needs_review') {
                    return false;
                }
                return true;
            })
        ),
        [rows, showOnlyNeedsReviewRows, showOnlyPendingRows]
    );
    useEffect(() => {
        const availableKeys = new Set(rows.map((row) => row.id));
        setSelectedRowKeys((prev) => prev.filter((key) => availableKeys.has(key)));
        setExpandedRowKeys((prev) => prev.filter((key) => availableKeys.has(key)));
    }, [rows]);
    const effectiveExpandedRowKeys = useMemo(
        () => (
            rowsViewMode === 'detailed'
                ? visibleRows.map((row) => row.id)
                : expandedRowKeys
        ),
        [expandedRowKeys, rowsViewMode, visibleRows]
    );
    const isNarrowRowsLayout = !screens.lg;

    const runOptions = runs.map((item) => ({
        value: item.id,
        label: `#${item.id} · ${item.provider_name || '—'} · ${item.mode} · ${RUN_STATUS_LABEL[item.status] || item.status || '—'}`,
    }));

    const draftGroups = useMemo(
        () => (Array.isArray(draftPayload?.groups) ? draftPayload.groups : []),
        [draftPayload?.groups]
    );
    const skippedDraftItems = useMemo(
        () => (Array.isArray(draftPayload?.skipped_items) ? draftPayload.skipped_items : []),
        [draftPayload?.skipped_items]
    );
    const rowsEmptyState = useMemo(() => {
        if (!run || rowsLoading) {
            return null;
        }
        if (rows.length > 0) {
            if (visibleRows.length > 0) {
                return null;
            }
            const localFilterBits = [];
            if (showOnlyPendingRows) {
                localFilterBits.push('только неотправленные');
            }
            if (showOnlyNeedsReviewRows) {
                localFilterBits.push('только на проверку');
            }
            if (localFilterBits.length > 0) {
                return {
                    type: 'info',
                    message: 'Строки есть, но их скрыли быстрые фильтры',
                    description: `Сейчас активны фильтры: ${localFilterBits.join(', ')}.`,
                };
            }
            return null;
        }
        const activeFilterBits = [];
        if (filters.decision_status) {
            const statusLabel = STATUS_OPTIONS.find(
                (item) => item.value === filters.decision_status
            )?.label || filters.decision_status;
            activeFilterBits.push(`статус: ${statusLabel}`);
        }
        if ((filters.q || '').trim()) {
            activeFilterBits.push(`поиск: “${String(filters.q).trim()}”`);
        }
        if (run.total_items > 0 && activeFilterBits.length > 0) {
            return {
                type: 'info',
                message: 'Строки есть, но их скрыли фильтры',
                description: `Сейчас активны фильтры: ${activeFilterBits.join(', ')}. Очисти фильтры сверху, чтобы увидеть все ${run.total_items} строк запуска.`,
            };
        }
        if (run.status === 'queued' || run.status === 'running') {
            return {
                type: 'info',
                message: 'Запуск ещё не завершил расчёт строк',
                description:
                    'Пока scheduler не завершил run, таблица строк может быть пустой.',
            };
        }
        if (run.status === 'failed') {
            return {
                type: 'warning',
                message: `Запуск #${run.id} не сохранил строки`,
                description:
                    run.summary_snapshot?.message
                    || 'Этот запуск завершился ошибкой до сохранения строк автозаказа.',
            };
        }
        return {
            type: 'info',
            message: `В запуске #${run.id} нет сохранённых строк`,
            description:
                'Скорее всего это старый пустой или неудачный запуск. Для работы лучше использовать новый расчёт.',
        };
    }, [
        filters.decision_status,
        filters.q,
        rows,
        rowsLoading,
        run,
        showOnlyNeedsReviewRows,
        showOnlyPendingRows,
        visibleRows.length,
    ]);

    const renderStatusTags = useCallback((row) => (
        <Space wrap size={[4, 4]}>
            <Tag color={statusColor[row?.decision_status] || 'default'}>
                {decisionStatusLabel(row?.decision_status)}
            </Tag>
            {row?.sent_to_site_at ? (
                <Tag color="green">
                    Отправлено{row?.sent_order_number ? ` · ${row.sent_order_number}` : ''}
                </Tag>
            ) : null}
        </Space>
    ), []);

    // Ручной выбор предложений из топ-10: { [itemId]: { [offerIndex]: qty } }
    const [offerSelections, setOfferSelections] = useState({});
    const [allocationsSavingItemId, setAllocationsSavingItemId] = useState(null);

    const toggleOfferSelection = useCallback((row, offerIndex) => {
        setOfferSelections((prev) => {
            const current = { ...(prev[row.id] || {}) };
            if (current[offerIndex] != null) {
                delete current[offerIndex];
            } else {
                const offer = (row.top_site_offers || [])[offerIndex] || {};
                const selectedTotal = Object.values(current).reduce(
                    (sum, qty) => sum + Number(qty || 0),
                    0
                );
                const remaining = Math.max(
                    Number(row.recommended_order_qty || 0) - selectedTotal,
                    0
                );
                const maxQty = Math.max(Number(offer.current_qty || 0), 0);
                const minQty = Math.max(Number(offer.current_min_qnt || 1), 1);
                const desired = remaining > 0 ? remaining : minQty;
                current[offerIndex] = Math.max(
                    Math.min(Math.max(desired, minQty), maxQty),
                    0
                );
            }
            return { ...prev, [row.id]: current };
        });
    }, []);

    const setOfferSelectionQty = useCallback((rowId, offerIndex, qty) => {
        setOfferSelections((prev) => ({
            ...prev,
            [rowId]: {
                ...(prev[rowId] || {}),
                [offerIndex]: Number(qty || 0),
            },
        }));
    }, []);

    const handleApplyAllocations = useCallback(async (row) => {
        const selections = offerSelections[row.id] || {};
        const allocations = Object.entries(selections)
            .map(([offerIndex, quantity]) => ({
                offer_index: Number(offerIndex),
                quantity: Number(quantity || 0),
            }))
            .filter((allocation) => allocation.quantity > 0);
        if (!allocations.length) {
            message.warning('Выберите хотя бы одно предложение и количество');
            return;
        }
        setAllocationsSavingItemId(row.id);
        try {
            await updateAutoPurchaseRunItemAllocations(selectedRunId, row.id, {
                allocations,
            });
            message.success(
                'Выбор сохранён: строка подтверждена с ручным распределением'
            );
            setOfferSelections((prev) => ({ ...prev, [row.id]: {} }));
            await fetchRunItems(selectedRunId, filters);
            await fetchDraftOrders(selectedRunId);
        } catch (error) {
            message.error(
                extractRequestError(error, 'Не удалось сохранить выбор предложений')
            );
        } finally {
            setAllocationsSavingItemId(null);
        }
    }, [
        fetchDraftOrders,
        fetchRunItems,
        filters,
        offerSelections,
        selectedRunId,
    ]);

    const renderExpandedContent = useCallback((row) => {
        const orderValues = [
            row.order_count_30_days,
            row.order_count_90_days,
            row.order_count_180_days,
            row.order_count_365_days,
        ];
        const priceValues = [
            row.min_sale_price_30_days,
            row.min_sale_price_90_days,
            row.min_sale_price_180_days,
            row.min_sale_price_365_days,
            row.latest_price,
        ];

        const renderHeatCell = (value, tone, formatter = (cellValue) => cellValue ?? '—') => (
            <span className={`autopurchase-mini-cell autopurchase-mini-cell--${tone}`}>
                {formatter(value)}
            </span>
        );

        const offers = Array.isArray(row.top_site_offers) ? row.top_site_offers : [];
        const selections = offerSelections[row.id] || {};
        const selectedEntries = Object.entries(selections).filter(
            ([, qty]) => Number(qty || 0) > 0
        );
        const selectedTotalQty = selectedEntries.reduce(
            (sum, [, qty]) => sum + Number(qty || 0),
            0
        );
        const isSent = Boolean(row.sent_to_site_at);
        const recommendedHash = row.recommended_supplier?.hash_key
            || row.recommended_supplier?.system_hash;
        const appliedAllocations = row.draft_purchase_order?.allocations || [];

        return (
            <div className="autopurchase-expanded-grid">
                {row.cross_group?.items?.length ? (
                    <div className="autopurchase-expanded-card autopurchase-expanded-card-wide">
                        <div className="autopurchase-expanded-title">
                            Наличие с кроссами Dragonzap: {row.cross_group.group_quantity} шт
                            <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>
                                свой остаток {row.cross_group.own_quantity} шт
                                {' + '}кроссы {row.cross_group.cross_quantity} шт
                                {Number(row.cross_group.cross_in_transit_qty || 0) > 0
                                    ? ` (+${row.cross_group.cross_in_transit_qty} шт кроссов в пути)`
                                    : ''}
                            </Text>
                        </div>
                        <div className="autopurchase-metric-row">
                            {row.cross_group.items.map((cross) => (
                                <Tooltip
                                    key={cross.oem_number}
                                    title={cross.autopart_name || null}
                                >
                                    <Tag color="geekblue">
                                        {cross.oem_number}: {cross.quantity} шт
                                        {Number(cross.in_transit_qty || 0) > 0
                                            ? ` (+${cross.in_transit_qty} в пути)`
                                            : ''}
                                    </Tag>
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                ) : null}
                {offers.length ? (
                    <div className="autopurchase-expanded-card autopurchase-expanded-card-wide">
                        <div className="autopurchase-expanded-title">
                            Лучшие предложения сайта ({offers.length})
                            {appliedAllocations.length ? (
                                <Tag color="purple" style={{ marginLeft: 8 }}>
                                    Ручное распределение: {appliedAllocations.length} предл.
                                </Tag>
                            ) : null}
                        </div>
                        <Table
                            size="small"
                            rowKey="__idx"
                            pagination={false}
                            dataSource={offers.map((offer, index) => ({
                                ...offer,
                                __idx: index,
                            }))}
                            columns={[
                                {
                                    title: '',
                                    key: 'pick',
                                    width: 44,
                                    render: (_, offer) => (
                                        <Checkbox
                                            checked={selections[offer.__idx] != null}
                                            disabled={isSent}
                                            onChange={() => toggleOfferSelection(row, offer.__idx)}
                                        />
                                    ),
                                },
                                {
                                    title: 'Поставщик',
                                    key: 'provider',
                                    render: (_, offer) => (
                                        <Space size={6} wrap>
                                            <span style={{ fontWeight: 600 }}>
                                                {offer.provider_name || '—'}
                                            </span>
                                            {recommendedHash
                                                && (offer.hash_key === recommendedHash
                                                    || offer.system_hash === recommendedHash) ? (
                                                    <Tag color="green">выбор автозаказа</Tag>
                                                ) : null}
                                        </Space>
                                    ),
                                },
                                {
                                    title: 'Бренд / номер',
                                    key: 'offer_position',
                                    render: (_, offer) => (
                                        <span className="autopurchase-compact-muted">
                                            {offer.current_brand_name || '—'}
                                            {' '}
                                            {offer.current_oem_number || ''}
                                        </span>
                                    ),
                                },
                                {
                                    title: 'Цена',
                                    key: 'price',
                                    width: 110,
                                    render: (_, offer) =>
                                        formatMoneyWithRub(offer.current_price),
                                },
                                {
                                    title: 'Остаток',
                                    key: 'qty',
                                    width: 90,
                                    render: (_, offer) => formatQty(offer.current_qty),
                                },
                                {
                                    title: 'Срок',
                                    key: 'lead',
                                    width: 80,
                                    render: (_, offer) =>
                                        offer.effective_lead_days != null
                                            ? `${offer.effective_lead_days} дн`
                                            : '—',
                                },
                                {
                                    title: 'Мин.',
                                    key: 'min_qnt',
                                    width: 70,
                                    render: (_, offer) => offer.current_min_qnt || 1,
                                },
                                {
                                    title: 'Кол-во',
                                    key: 'alloc_qty',
                                    width: 110,
                                    render: (_, offer) =>
                                        selections[offer.__idx] != null ? (
                                            <InputNumber
                                                size="small"
                                                min={Math.max(Number(offer.current_min_qnt || 1), 1)}
                                                max={Math.max(Number(offer.current_qty || 0), 1)}
                                                value={selections[offer.__idx]}
                                                disabled={isSent}
                                                onChange={(value) =>
                                                    setOfferSelectionQty(row.id, offer.__idx, value)
                                                }
                                            />
                                        ) : null,
                                },
                            ]}
                        />
                        <Space wrap size={8}>
                            <Button
                                type="primary"
                                size="small"
                                disabled={isSent || !selectedEntries.length}
                                loading={allocationsSavingItemId === row.id}
                                onClick={() => {
                                    void handleApplyAllocations(row);
                                }}
                            >
                                Применить выбор
                                {selectedTotalQty > 0 ? ` (${selectedTotalQty} шт)` : ''}
                            </Button>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Потребность: {formatQty(row.recommended_order_qty)}.
                                Можно выбрать одно предложение или распределить
                                количество на несколько.
                            </Text>
                        </Space>
                    </div>
                ) : null}
                <div className="autopurchase-expanded-card autopurchase-expanded-card-wide">
                    <div className="autopurchase-expanded-title">Заказы и цены</div>
                    <div className="autopurchase-metric-row">
                        <span className="autopurchase-metric-label">Заказы:</span>
                        {[
                            ['30д', row.order_count_30_days],
                            ['90д', row.order_count_90_days],
                            ['180д', row.order_count_180_days],
                            ['365д', row.order_count_365_days],
                        ].map(([label, value]) => (
                            <span key={label} className="autopurchase-metric-chip">
                                <span className="autopurchase-metric-chip-label">{label}</span>
                                {renderHeatCell(value || 0, resolveOrderHeatTone(value, orderValues), (cellValue) => cellValue || 0)}
                            </span>
                        ))}
                    </div>
                    <div className="autopurchase-metric-row">
                        <span className="autopurchase-metric-label">Мин. цена:</span>
                        {[
                            ['30д', row.min_sale_price_30_days],
                            ['90д', row.min_sale_price_90_days],
                            ['180д', row.min_sale_price_180_days],
                            ['365д', row.min_sale_price_365_days],
                            ['тек.', row.latest_price],
                        ].map(([label, value]) => (
                            <span key={label} className="autopurchase-metric-chip">
                                <span className="autopurchase-metric-chip-label">{label}</span>
                                {renderHeatCell(value, resolvePriceHeatTone(value, priceValues), formatMoneyWithRub)}
                            </span>
                        ))}
                        {row.last_receipt_price != null ? (
                            <span className="autopurchase-metric-chip">
                                <span className="autopurchase-metric-chip-label">закуп. (поступление)</span>
                                {renderHeatCell(row.last_receipt_price, 'muted', formatMoneyWithRub)}
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="autopurchase-expanded-card autopurchase-expanded-card-wide">
                    <div className="autopurchase-expanded-title">Причины и детали</div>
                    <div className="autopurchase-expanded-reasons">
                        {(row.reasons || []).map((reason) => (
                            <div key={reason.code} className="autopurchase-expanded-reason">
                                <Space wrap size={[4, 4]}>
                                    <Tag color={
                                        reason.severity === 'critical'
                                            ? 'red'
                                            : reason.severity === 'warning'
                                                ? 'orange'
                                                : 'blue'
                                    }>
                                        {reason.title}
                                    </Tag>
                                </Space>
                                <Paragraph
                                    className="autopurchase-reason-text"
                                    ellipsis={{
                                        rows: 2,
                                        expandable: true,
                                        symbol: 'ещё',
                                    }}
                                >
                                    {reason.description}
                                </Paragraph>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }, [
        allocationsSavingItemId,
        handleApplyAllocations,
        offerSelections,
        setOfferSelectionQty,
        toggleOfferSelection,
    ]);

    const renderRowActions = useCallback((row, options = {}) => {
        const { stacked = false } = options;
        const isSent = Boolean(row?.sent_to_site_at);
        const approveUnavailableReason = getApproveUnavailableReason(row);
        const approveDisabled = isSent || Boolean(approveUnavailableReason);
        return (
            <Space wrap size={6} direction={stacked ? 'vertical' : 'horizontal'}>
                <Tooltip title={approveUnavailableReason}>
                    <span>
                        <Popconfirm
                            title="Подтвердить строку автозаказа?"
                            description="Строка попадёт в черновики заказа по выбранному site-поставщику."
                            onConfirm={() => handleItemStatusChange(row.id, 'auto_approved')}
                            disabled={approveDisabled}
                        >
                            <Button
                                type={row.decision_status === 'auto_approved' ? 'primary' : 'default'}
                                size="small"
                                disabled={approveDisabled}
                            >
                                Подтв.
                            </Button>
                        </Popconfirm>
                    </span>
                </Tooltip>
                <Popconfirm
                    title="Вернуть строку на ручную проверку?"
                    onConfirm={() => handleItemStatusChange(row.id, 'needs_review')}
                    disabled={isSent}
                >
                    <Button
                        type={row.decision_status === 'needs_review' ? 'primary' : 'default'}
                        size="small"
                        disabled={isSent}
                    >
                        Проверка
                    </Button>
                </Popconfirm>
                <Popconfirm
                    title="Заблокировать строку?"
                    description="Строка не попадёт в черновик автозаказа."
                    onConfirm={() => handleItemStatusChange(row.id, 'blocked')}
                    disabled={isSent}
                >
                    <Button
                        danger
                        type={row.decision_status === 'blocked' ? 'primary' : 'default'}
                        size="small"
                        disabled={isSent}
                    >
                        Блок
                    </Button>
                </Popconfirm>
                <Button
                    size="small"
                    onClick={() => {
                        void handleOpenAiExplanation(row);
                    }}
                >
                    AI
                </Button>
                <Button
                    type="link"
                    size="small"
                    onClick={() => {
                        const params = new URLSearchParams({
                            oem: row.oem_number || '',
                            auto: '1',
                        });
                        if (row.brand_name) {
                            params.set('brand', row.brand_name);
                        }
                        navigate(`/autoparts/offers?${params.toString()}`);
                    }}
                >
                    Открыть
                </Button>
            </Space>
        );
    }, [handleItemStatusChange, handleOpenAiExplanation, navigate]);
    const draftEmptyState = useMemo(() => {
        if (!run || draftsLoading) {
            return null;
        }
        if (draftGroups.length > 0) {
            return null;
        }
        const readyForDraftMetric = runDiagnostics.find(
            (item) => item.code === 'rows_ready_for_draft_count'
        );
        if (run.status === 'queued' || run.status === 'running') {
            return {
                type: 'info',
                message: 'Черновики появятся после завершения расчёта',
                description:
                    'Пока scheduler считает run, блок черновиков может быть пустым.',
            };
        }
        if (Number(run.auto_approved_count || 0) <= 0) {
            return {
                type: 'info',
                message: 'В этом запуске пока нет подтверждённых строк',
                description: readyForDraftMetric?.value > 0
                    ? `Технически готовы к подтверждению ${readyForDraftMetric.value} строк, но ни одна ещё не переведена в “Автоподтверждено”. Черновики заказов собираются только из подтверждённых строк.`
                    : (
                        runSummaryMessage
                        || 'Черновики заказов собираются только из строк со статусом “Автоподтверждено”.'
                    ),
            };
        }
        if (run.status === 'failed') {
            return {
                type: 'warning',
                message: `Запуск #${run.id} завершился с ошибкой`,
                description:
                    run.summary_snapshot?.message
                    || 'Черновики не были собраны, потому что запуск завершился ошибкой.',
            };
        }
        return {
            type: 'info',
            message: 'Для этого запуска черновики не собраны',
            description:
                'Если строки есть, но черновиков нет, попробуй пересчитать run или проверить статусы строк.',
        };
    }, [draftGroups.length, draftsLoading, run, runDiagnostics, runSummaryMessage]);

    const getSendableGroupItems = useCallback((group) => (
        (group?.items || []).filter(
            (item) =>
                Number(item.proposed_order_qty || 0) > 0 &&
                hasSendableIdentity(item)
        )
    ), []);

    useEffect(() => {
        const availableKeys = new Set(draftGroups.map((group) => group.supplier_key));
        setSelectedDraftGroupKeys((prev) => prev.filter((key) => availableKeys.has(key)));
    }, [draftGroups]);

    const visibleDraftGroups = useMemo(
        () => (
            showOnlySendableDraftGroups
                ? draftGroups.filter((group) => getSendableGroupItems(group).length > 0)
                : draftGroups
        ),
        [draftGroups, getSendableGroupItems, showOnlySendableDraftGroups]
    );

    const selectedCustomerLabel = useMemo(
        () => customerOptions.find((item) => item.value === selectedCustomerId)?.label || null,
        [customerOptions, selectedCustomerId]
    );

    const sendDraftGroupInternal = useCallback(async (
        group,
        { refreshAfter = true, emitSuccessMessage = true } = {}
    ) => {
        if (!selectedCustomerId) {
            message.warning(
                'Выберите клиента, от имени которого нужно оформить заказ на Dragonzap'
            );
            return { successCount: 0, failedCount: 0, skipped: true };
        }

        const activeItems = getSendableGroupItems(group);
        if (!activeItems.length) {
            if (emitSuccessMessage) {
                message.info('В этой группе уже нет неотправленных строк для сайта');
            }
            return { successCount: 0, failedCount: 0, skipped: true };
        }

        setSendGroupLoadingKey(group.supplier_key);
        try {
            const orderComment = `АвтоЗаказ run #${selectedRunId} · ${group.provider_name || 'Dragonzap'}`;
            // Для заказа на сайт используем реквизиты найденного предложения
            // (site_*): для Dragonzap-позиций это бренд-синоним, под которым
            // позиция реально продаётся на сайте.
            const payload = activeItems.map((item) => ({
                autopart_id: item.autopart_id ?? null,
                oem_number: item.site_oem_number || item.oem_number,
                brand_name: item.site_brand_name || item.brand_name,
                autopart_name: item.site_autopart_name || item.autopart_name,
                supplier_id: item.external_supplier_id ?? group.external_supplier_id ?? null,
                supplier_name: group.provider_name,
                quantity: Number(item.proposed_order_qty),
                confirmed_price: Number(item.price),
                min_delivery_day: item.min_delivery_day,
                max_delivery_day: item.max_delivery_day,
                status: 'Send',
                tracking_uuid: buildAutopurchaseTrackingKey(selectedRunId, item.item_id),
                hash_key: item.hash_key,
                system_hash: item.system_hash,
            }));
            const { data } = await sendDragonzapOrder(
                payload,
                selectedCustomerId,
                orderComment
            );
            const successTrackingKeys = Array.isArray(data?.results)
                ? data.results
                    .filter((result) => result?.status === 'success')
                    .map((result) => String(result?.request_tracking_uuid || result?.tracking_uuid || ''))
                    .filter(Boolean)
                : [];

            const successIds = activeItems
                .filter((item) =>
                    successTrackingKeys.includes(
                        buildAutopurchaseTrackingKey(selectedRunId, item.item_id)
                    )
                )
                .map((item) => item.item_id);

            let failedCount = Number(data?.failed_items || 0);

            if (successIds.length) {
                await markAutoPurchaseRunItemsSent(selectedRunId, {
                    item_ids: successIds,
                    order_id: data?.order_id || null,
                    order_number: data?.order_number || null,
                    customer_id: selectedCustomerId,
                    send_result_snapshot: {
                        supplier_key: group.supplier_key,
                        provider_name: group.provider_name,
                        successful_items: data?.successful_items || 0,
                        failed_items: data?.failed_items || 0,
                    },
                });
                if (emitSuccessMessage) {
                    message.success(
                        `Dragonzap: оформлен заказ по поставщику ${group.provider_name} (${successIds.length} поз.). Перезапусти расчёт, чтобы увидеть позиции уже в пути.`
                    );
                }
            }

            if (failedCount > 0) {
                const resultErrors = Array.isArray(data?.results)
                    ? data.results
                        .filter((result) => result?.status !== 'success')
                        .map((result) => String(result?.message || '').trim())
                        .filter(Boolean)
                    : [];
                const uniqueErrors = [...new Set(resultErrors)].slice(0, 3);
                message.warning(
                    uniqueErrors.length
                        ? `Часть строк не ушла: ${uniqueErrors.join(' | ')}`
                        : 'Часть строк не удалось отправить на Dragonzap'
                );
            }
            if (refreshAfter) {
                await fetchRuns();
                await fetchRunItems(selectedRunId, filters);
                await fetchDraftOrders(selectedRunId);
            }
            return {
                successCount: successIds.length,
                failedCount,
                skipped: false,
                orderId: data?.order_id || null,
                orderNumber: data?.order_number || null,
            };
        } catch (error) {
            const detail = extractRequestError(
                error,
                'Не удалось оформить заказ через Dragonzap'
            );
            message.error(detail);
            return {
                successCount: 0,
                failedCount: activeItems.length,
                skipped: false,
                orderId: null,
                orderNumber: null,
            };
        } finally {
            setSendGroupLoadingKey(null);
        }
    }, [
        fetchDraftOrders,
        fetchRunItems,
        fetchRuns,
        filters,
        getSendableGroupItems,
        selectedCustomerId,
        selectedRunId,
    ]);

    const handleSendDraftGroup = useCallback(async (group) => {
        const result = await sendDraftGroupInternal(group, {
            refreshAfter: true,
            emitSuccessMessage: true,
        });
        if (Number(result?.successCount || 0) > 0) {
            await handleRerunCurrentSettings();
        }
    }, [handleRerunCurrentSettings, sendDraftGroupInternal]);

    const handleSendSelectedGroups = useCallback(async () => {
        if (!selectedDraftGroupKeys.length) {
            message.warning('Выбери хотя бы одну группу для отправки');
            return;
        }
        if (!selectedCustomerId) {
            message.warning(
                'Выберите клиента, от имени которого нужно оформить заказ на Dragonzap'
            );
            return;
        }

        const targetGroups = draftGroups.filter((group) =>
            selectedDraftGroupKeys.includes(group.supplier_key)
        );
        if (!targetGroups.length) {
            message.warning('Не удалось найти выбранные группы');
            return;
        }

        setBulkSendLoading(true);
        let totalSuccess = 0;
        let totalFailed = 0;
        let processedGroups = 0;
        let shouldRerun = false;
        try {
            for (const group of targetGroups) {
                const result = await sendDraftGroupInternal(group, {
                    refreshAfter: false,
                    emitSuccessMessage: false,
                });
                if (!result?.skipped) {
                    processedGroups += 1;
                }
                totalSuccess += Number(result?.successCount || 0);
                totalFailed += Number(result?.failedCount || 0);
                if (Number(result?.successCount || 0) > 0) {
                    shouldRerun = true;
                }
            }
            await fetchRuns();
            await fetchRunItems(selectedRunId, filters);
            await fetchDraftOrders(selectedRunId);
            setSelectedDraftGroupKeys([]);
            if (processedGroups > 0 || totalSuccess > 0 || totalFailed > 0) {
                message.success(
                    `Группы Dragonzap обработаны: групп ${processedGroups}, успешно ${totalSuccess}, с ошибками ${totalFailed}.`
                );
            }
            if (shouldRerun) {
                await handleRerunCurrentSettings();
            }
        } finally {
            setBulkSendLoading(false);
        }
    }, [
        fetchDraftOrders,
        fetchRunItems,
        fetchRuns,
        filters,
        handleRerunCurrentSettings,
        draftGroups,
        selectedCustomerId,
        selectedDraftGroupKeys,
        selectedRunId,
        sendDraftGroupInternal,
    ]);

    const handleSendAllGroups = useCallback(async () => {
        if (!selectedCustomerId) {
            message.warning(
                'Выберите клиента, от имени которого нужно оформить заказ на Dragonzap'
            );
            return;
        }

        const targetGroups = draftGroups.filter(
            (group) => getSendableGroupItems(group).length > 0
        );
        if (!targetGroups.length) {
            message.info('Сейчас нет доступных групп для отправки');
            return;
        }

        setBulkSendLoading(true);
        let totalSuccess = 0;
        let totalFailed = 0;
        let processedGroups = 0;
        let shouldRerun = false;
        try {
            for (const group of targetGroups) {
                const result = await sendDraftGroupInternal(group, {
                    refreshAfter: false,
                    emitSuccessMessage: false,
                });
                if (!result?.skipped) {
                    processedGroups += 1;
                }
                totalSuccess += Number(result?.successCount || 0);
                totalFailed += Number(result?.failedCount || 0);
                if (Number(result?.successCount || 0) > 0) {
                    shouldRerun = true;
                }
            }
            await fetchRuns();
            await fetchRunItems(selectedRunId, filters);
            await fetchDraftOrders(selectedRunId);
            setSelectedDraftGroupKeys([]);
            if (processedGroups > 0 || totalSuccess > 0 || totalFailed > 0) {
                message.success(
                    `Все доступные группы обработаны: групп ${processedGroups}, успешно ${totalSuccess}, с ошибками ${totalFailed}.`
                );
            }
            if (shouldRerun) {
                await handleRerunCurrentSettings();
            }
        } finally {
            setBulkSendLoading(false);
        }
    }, [
        draftGroups,
        fetchDraftOrders,
        fetchRunItems,
        fetchRuns,
        filters,
        getSendableGroupItems,
        handleRerunCurrentSettings,
        selectedCustomerId,
        selectedRunId,
        sendDraftGroupInternal,
    ]);

    const columns = useMemo(
        () => [
            {
                title: 'Позиция',
                key: 'position',
                width: '20%',
                render: (_, row) => {
                    const criticalReason = (row.reasons || []).find(
                        (reason) => reason?.severity === 'critical'
                    );
                    return (
                        <div className="autopurchase-compact-stack">
                            <div className="autopurchase-compact-title">
                                {row.brand_name || '—'} {row.oem_number}
                            </div>
                            <div className="autopurchase-compact-muted">
                                {row.autopart_name || '—'}
                            </div>
                            {renderStatusTags(row)}
                            {criticalReason ? (
                                <Tooltip title={criticalReason.description}>
                                    <Tag color="red">{criticalReason.title}</Tag>
                                </Tooltip>
                            ) : null}
                        </div>
                    );
                },
            },
            {
                title: 'Наличие',
                key: 'stock',
                width: '16%',
                render: (_, row) => {
                    const groupQty = row.cross_group?.group_quantity;
                    const daysLeft = row.estimated_days_left_30_days;
                    const daysColor = daysLeft == null
                        ? 'default'
                        : daysLeft <= 7
                            ? 'red'
                            : daysLeft <= 14
                                ? 'orange'
                                : 'green';
                    return (
                        <div className="autopurchase-compact-stack">
                            <div className="autopurchase-compact-title">
                                {groupQty != null && groupQty !== row.current_quantity ? (
                                    <Tooltip
                                        title={`Свой остаток ${row.current_quantity} шт + кроссы Dragonzap ${row.cross_group?.cross_quantity || 0} шт`}
                                    >
                                        {formatQty(groupQty)} с кроссами
                                    </Tooltip>
                                ) : (
                                    formatQty(row.current_quantity)
                                )}
                            </div>
                            <div className="autopurchase-compact-muted">
                                В пути: {formatQty(row.in_transit_qty)}
                            </div>
                            <Space wrap size={[4, 4]}>
                                {daysLeft != null ? (
                                    <Tag color={daysColor}>запаса {daysLeft} дн</Tag>
                                ) : null}
                                {Number(row.open_customer_backlog_qty || 0) > 0 ? (
                                    <Tag color="volcano">
                                        backlog {row.open_customer_backlog_qty} шт
                                    </Tag>
                                ) : null}
                            </Space>
                        </div>
                    );
                },
            },
            {
                title: 'Спрос',
                key: 'demand',
                width: '13%',
                render: (_, row) => (
                    <div className="autopurchase-compact-stack">
                        <div className="autopurchase-compact-title">
                            {row.avg_daily_blended != null
                                ? `${row.avg_daily_blended} шт/день`
                                : '—'}
                        </div>
                        <div className="autopurchase-compact-muted">
                            30д: {row.sold_last_30_days || 0} · 90д: {row.sold_last_90_days || 0}
                        </div>
                        {row.abc_xyz?.abc_class || row.abc_xyz?.xyz_class ? (
                            <div className="autopurchase-compact-muted">
                                {row.abc_xyz?.abc_class || '—'}/{row.abc_xyz?.xyz_class || '—'}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                title: 'План закупки',
                key: 'plan',
                width: '17%',
                render: (_, row) => {
                    const proposed = row.draft_purchase_order?.proposed_order_qty;
                    const price = row.draft_purchase_order?.price
                        ?? row.recommended_supplier?.current_price;
                    const marginPct = price != null
                        && row.latest_price != null
                        && Number(row.latest_price) > 0
                        ? Math.round(
                            ((Number(row.latest_price) - Number(price))
                                / Number(row.latest_price)) * 100
                        )
                        : null;
                    return (
                        <div className="autopurchase-compact-stack">
                            <div className="autopurchase-compact-title">
                                К заказу: {formatQty(row.recommended_order_qty)}
                                {proposed != null
                                    && proposed !== row.recommended_order_qty
                                    ? ` → ${proposed} шт`
                                    : ''}
                            </div>
                            <div className="autopurchase-compact-muted">
                                Цель (1,5 мес): {row.target_stock != null ? formatQty(row.target_stock) : '—'}
                            </div>
                            {price != null ? (
                                <div className="autopurchase-compact-muted">
                                    Закупка: {formatMoney(price)} руб.
                                    {marginPct != null ? (
                                        <Tag
                                            color={marginPct >= 20 ? 'green' : marginPct >= 10 ? 'orange' : 'red'}
                                            style={{ marginLeft: 6 }}
                                        >
                                            маржа {marginPct}%
                                        </Tag>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                },
            },
            {
                title: 'Поставщик',
                key: 'supplier',
                width: '16%',
                render: (_, row) => (
                    <div className="autopurchase-compact-stack">
                        <div className="autopurchase-compact-title">
                            {row.recommended_supplier?.provider_name || '—'}
                        </div>
                        {row.recommended_supplier?.current_brand_name ? (
                            <div className="autopurchase-compact-muted">
                                {row.recommended_supplier.current_brand_name}
                                {' '}
                                {row.recommended_supplier.current_oem_number || ''}
                            </div>
                        ) : null}
                        <div className="autopurchase-compact-muted">
                            {row.recommended_supplier?.current_qty != null
                                ? `${row.recommended_supplier.current_qty} шт`
                                : ''}
                            {row.recommended_supplier?.effective_lead_days != null
                                ? ` · ${row.recommended_supplier.effective_lead_days} дн`
                                : ''}
                        </div>
                        {(row.top_site_offers || []).length > 1 ? (
                            <div className="autopurchase-compact-muted">
                                ещё {(row.top_site_offers || []).length - 1} предл. — разверни строку
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                title: 'Действия',
                key: 'status_actions',
                width: '18%',
                render: (_, row) => {
                    return (
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            {row?.sent_order_id ? (
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0, height: 'auto', alignSelf: 'flex-start' }}
                                    onClick={() => {
                                        navigate(`/orders/${row.sent_order_id}`);
                                    }}
                                >
                                    Открыть заказ
                                </Button>
                            ) : null}
                            {renderRowActions(row)}
                        </Space>
                    );
                },
            },
        ],
        [navigate, renderRowActions, renderStatusTags]
    );

    const draftColumns = useMemo(
        () => [
            {
                title: 'Поставщик',
                key: 'supplier',
                width: 260,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 700 }}>{row.provider_name || '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.provider_config_name || row.sup_logo || 'site'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Строк',
                dataIndex: 'total_items',
                width: 90,
            },
            {
                title: 'К заказу сейчас',
                dataIndex: 'total_quantity',
                width: 140,
                render: (value) => formatQty(value),
            },
            {
                title: 'Сумма',
                dataIndex: 'total_sum',
                width: 140,
                render: (value) => (value != null ? `${formatMoney(value)} руб.` : '—'),
            },
            {
                title: 'Действие',
                key: 'action',
                width: 260,
                render: (_, row) => {
                    const remainingItems = (row.items || []).filter(
                        (item) =>
                            Number(item.proposed_order_qty || 0) > 0 &&
                            hasSendableIdentity(item)
                    );
                    return (
                        <Space direction="vertical" size={4}>
                            <Space wrap size={6}>
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    size="small"
                                    loading={sendGroupLoadingKey === row.supplier_key}
                                    disabled={!remainingItems.length || !selectedCustomerId}
                                    onClick={() => {
                                        void handleSendDraftGroup(row);
                                    }}
                                >
                                    Отправить на сайт
                                </Button>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        void handleOpenDraftGroupAiExplanation(row);
                                    }}
                                >
                                    AI
                                </Button>
                            </Space>
                            {!remainingItems.length ? (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Все строки группы уже отправлены
                                </Text>
                            ) : null}
                        </Space>
                    );
                },
            },
        ],
        [
            handleOpenDraftGroupAiExplanation,
            handleSendDraftGroup,
            selectedCustomerId,
            sendGroupLoadingKey,
        ]
    );

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <Title level={3} style={{ marginBottom: 0 }}>
                        Автозаказ
                    </Title>
                    <Text type="secondary">
                        Потребность в пополнении считается по нашим остаткам и истории,
                        а источник закупки сейчас берётся только с сайта Dragonzap.
                    </Text>
                    {run ? (
                        <>
                            <br />
                            <Text type="secondary">
                                Источник остатка: {run.provider_name}
                                {run.provider_config_name ? ` · ${run.provider_config_name}` : ''}
                                {' · '}
                                режим: {run.mode}
                            </Text>
                            <br />
                            <Text type="secondary">
                                Лимит суммы: {currentBudgetLimit != null
                                    ? `${formatMoney(currentBudgetLimit)} руб.`
                                    : 'без лимита'}
                                {' · '}
                                Лимит позиций: {currentPositionLimit != null
                                    ? `${currentPositionLimit} шт.`
                                    : 'без лимита'}
                            </Text>
                        </>
                    ) : null}
                </div>

                {progressRunState ? (
                    <Card size="small" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                            <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                                <Text strong>
                                    {progressRunState.type === 'queued'
                                        ? 'Запуск автозаказа в очереди'
                                        : progressRunState.type === 'create'
                                            ? 'Запуск автозаказа создаётся'
                                            : progressRunState.type === 'rerun'
                                                ? 'Пересчёт автозаказа создаётся'
                                                : 'Идёт расчёт автозаказа'}
                                </Text>
                                <Text type="secondary">
                                    Прошло: {runElapsedSec} сек.
                                </Text>
                            </Space>
                            <Progress percent={runProgressPercent} status="active" showInfo={false} />
                            <Text type="secondary">
                                {progressRunState.message
                                    || 'Считаем потребность по остаткам и истории, затем запрашиваем Dragonzap по кандидатам и сохраняем новый запуск.'}
                            </Text>
                            <Text type="secondary">
                                Режим: {progressRunState.mode} · лимит строк расчёта: {progressRunState.limit}
                            </Text>
                        </Space>
                    </Card>
                ) : null}

                {runFailureMessage ? (
                    <Alert
                        type="error"
                        showIcon
                        message={`Запуск #${run.id} завершился с ошибкой`}
                        description={runFailureMessage}
                    />
                ) : null}

                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
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
                            onClick={handleCreateRun}
                        >
                            Запустить расчёт
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={runsLoading || rowsLoading}
                            onClick={() => {
                                void fetchRuns();
                                void fetchRunItems(selectedRunId, filters);
                                void fetchDraftOrders(selectedRunId);
                            }}
                        >
                            Обновить
                        </Button>
                    </Space>

                    <Space wrap>
                        <Select
                            allowClear
                            placeholder="Статус"
                            value={filters.decision_status}
                            options={STATUS_OPTIONS}
                            style={{ width: 190 }}
                            onChange={(value) => {
                                setFilters((prev) => ({ ...prev, decision_status: value || undefined }));
                            }}
                        />
                        <Checkbox
                            checked={showOnlyPendingRows}
                            onChange={(event) => setShowOnlyPendingRows(event.target.checked)}
                        >
                            Только неотправленные
                        </Checkbox>
                        <Checkbox
                            checked={showOnlyNeedsReviewRows}
                            onChange={(event) => setShowOnlyNeedsReviewRows(event.target.checked)}
                        >
                            Только на проверке
                        </Checkbox>
                        <Segmented
                            value={rowsViewMode}
                            options={[
                                { value: 'compact', label: 'Компактно' },
                                { value: 'detailed', label: 'Подробно' },
                            ]}
                            onChange={(value) => setRowsViewMode(String(value))}
                        />
                        <Input.Search
                            allowClear
                            placeholder="Поиск OEM / бренда / поставщика"
                            value={filters.q}
                            style={{ width: 280 }}
                            onChange={(event) => {
                                const nextValue = event.target.value;
                                setFilters((prev) => ({ ...prev, q: nextValue }));
                            }}
                        />
                    </Space>
                </Space>

                <Select
                    placeholder="Выберите запуск"
                    options={runOptions}
                    value={selectedRunId}
                    loading={runsLoading}
                    style={{ width: '100%' }}
                    onChange={(value) => setSelectedRunId(value)}
                />

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                    }}
                >
                    <SummaryStatCard
                        title="Всего строк"
                        value={run?.total_items ?? 0}
                    />
                    <SummaryStatCard
                        title="Автоподтверждено"
                        value={run?.auto_approved_count ?? 0}
                        color="#15803d"
                    />
                    <SummaryStatCard
                        title="На проверку"
                        value={run?.needs_review_count ?? 0}
                        color="#c2410c"
                    />
                    <SummaryStatCard
                        title="Заблокировано"
                        value={run?.blocked_count ?? 0}
                        color="#b91c1c"
                    />
                    <SummaryStatCard
                        title="Уже отправлено"
                        value={run?.sent_count ?? 0}
                        color="#0f766e"
                    />
                </div>

                {runDiagnostics.length ? (
                    <Alert
                        type="info"
                        showIcon
                        message="Диагностика последнего расчёта"
                        description={
                            <Space direction="vertical" size={4}>
                                {runSummaryMessage ? (
                                    <Text type="secondary">{runSummaryMessage}</Text>
                                ) : null}
                                {runDiagnostics.map((item) => (
                                    <Text key={item.code}>
                                        <strong>{item.title}:</strong> {item.value}
                                        {item.description ? ` — ${item.description}` : ''}
                                    </Text>
                                ))}
                            </Space>
                        }
                    />
                ) : null}

                <Space wrap>
                    <Text type="secondary">
                        Выбрано строк: {selectedRowKeys.length}
                    </Text>
                    <Popconfirm
                        title="Подтвердить выбранные строки?"
                        description="Они попадут в черновики заказа по найденным site-поставщикам."
                        disabled={!selectedRowKeys.length}
                        onConfirm={() => {
                            void handleBulkStatusChange('auto_approved');
                        }}
                    >
                        <Button
                            type="primary"
                            loading={bulkStatusLoading}
                            disabled={!selectedRowKeys.length}
                        >
                            Подтвердить выбранные
                        </Button>
                    </Popconfirm>
                    <Popconfirm
                        title="Вернуть выбранные строки на ручную проверку?"
                        disabled={!selectedRowKeys.length}
                        onConfirm={() => {
                            void handleBulkStatusChange('needs_review');
                        }}
                    >
                        <Button
                            loading={bulkStatusLoading}
                            disabled={!selectedRowKeys.length}
                        >
                            Вернуть на проверку
                        </Button>
                    </Popconfirm>
                    <Popconfirm
                        title="Заблокировать выбранные строки?"
                        description="Они не попадут в черновики автозаказа."
                        disabled={!selectedRowKeys.length}
                        onConfirm={() => {
                            void handleBulkStatusChange('blocked');
                        }}
                    >
                        <Button
                            danger
                            loading={bulkStatusLoading}
                            disabled={!selectedRowKeys.length}
                        >
                            Блокировать выбранные
                        </Button>
                    </Popconfirm>
                    <Button
                        icon={<PlayCircleOutlined />}
                        loading={rerunLoading}
                        disabled={!run}
                        onClick={() => {
                            void handleRerunCurrentSettings();
                        }}
                    >
                        Новый запуск по текущим настройкам
                    </Button>
                </Space>

                {isNarrowRowsLayout ? (
                    <div className="autopurchase-card-list">
                        {visibleRows.map((row) => {
                            const isExpanded = rowsViewMode === 'detailed'
                                || effectiveExpandedRowKeys.includes(row.id);
                            const isSelected = selectedRowKeys.includes(row.id);
                            const isSent = Boolean(row?.sent_to_site_at);
                            return (
                                <Card
                                    key={row.id}
                                    size="small"
                                    className={`autopurchase-mobile-card ${row?.decision_status === 'needs_review' ? 'autopurchase-mobile-card-review' : ''}`}
                                >
                                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                        <Space
                                            align="start"
                                            style={{ justifyContent: 'space-between', width: '100%' }}
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                disabled={isSent}
                                                onChange={(event) =>
                                                    toggleRowSelected(row.id, event.target.checked)
                                                }
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div className="autopurchase-compact-title">
                                                    {row.brand_name || '—'} {row.oem_number}
                                                </div>
                                                <div className="autopurchase-compact-muted">
                                                    {row.autopart_name || '—'}
                                                </div>
                                            </div>
                                            {renderStatusTags(row)}
                                        </Space>
                                        <div className="autopurchase-mobile-card-grid">
                                            <div className="autopurchase-compact-stack">
                                                <div className="autopurchase-compact-muted">К заказу</div>
                                                <div className="autopurchase-compact-title">
                                                    {formatQty(row.recommended_order_qty)}
                                                </div>
                                            </div>
                                            <div className="autopurchase-compact-stack">
                                                <div className="autopurchase-compact-muted">Спрос</div>
                                                <div className="autopurchase-compact-title">
                                                    {row.avg_daily_blended != null ? `${row.avg_daily_blended} шт/д` : '—'}
                                                </div>
                                            </div>
                                            <div className="autopurchase-compact-stack">
                                                <div className="autopurchase-compact-muted">Поставщик</div>
                                                <div className="autopurchase-compact-title">
                                                    {row.recommended_supplier?.provider_name || '—'}
                                                </div>
                                            </div>
                                            <div className="autopurchase-compact-stack">
                                                <div className="autopurchase-compact-muted">Причины</div>
                                                <div className="autopurchase-compact-title">
                                                    {Array.isArray(row.reason_titles) && row.reason_titles.length
                                                        ? row.reason_titles[0]
                                                        : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        <Space wrap size={[6, 6]}>
                                            {renderRowActions(row)}
                                            {rowsViewMode === 'compact' ? (
                                                <Button
                                                    size="small"
                                                    onClick={() => {
                                                        setExpandedRowKeys((prev) => (
                                                            prev.includes(row.id)
                                                                ? prev.filter((key) => key !== row.id)
                                                                : [...prev, row.id]
                                                        ));
                                                    }}
                                                >
                                                    {isExpanded ? 'Скрыть' : 'Подробнее'}
                                                </Button>
                                            ) : null}
                                        </Space>
                                        {isExpanded ? renderExpandedContent(row) : null}
                                    </Space>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <Table
                        className="autopurchase-runs-table"
                        size="small"
                        rowKey="id"
                        loading={rowsLoading}
                        columns={columns}
                        dataSource={visibleRows}
                        tableLayout="fixed"
                        rowClassName={(record) =>
                            record?.decision_status === 'needs_review' ? 'row-needs-review' : ''
                        }
                        rowSelection={{
                            selectedRowKeys,
                            onChange: (keys) => setSelectedRowKeys(keys),
                            getCheckboxProps: (record) => ({
                                disabled: Boolean(record?.sent_to_site_at),
                            }),
                        }}
                        expandable={{
                            expandedRowRender: renderExpandedContent,
                            expandedRowKeys: effectiveExpandedRowKeys,
                            onExpandedRowsChange: (keys) => {
                                setExpandedRowKeys(keys.map((key) => Number(key)));
                            },
                            showExpandColumn: rowsViewMode !== 'detailed',
                        }}
                        pagination={{ pageSize: 25 }}
                    />
                )}
                {rowsEmptyState ? (
                    <Alert
                        type={rowsEmptyState.type}
                        showIcon
                        message={rowsEmptyState.message}
                        description={rowsEmptyState.description}
                    />
                ) : null}

                <Card
                    size="small"
                    title="Черновики заказов по подтверждённым строкам"
                    extra={
                        <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={draftsLoading}
                            onClick={() => {
                                void fetchDraftOrders(selectedRunId);
                            }}
                        >
                            Пересобрать
                        </Button>
                    }
                >
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Text type="secondary">
                            Если у найденного site-поставщика количества меньше, чем рекомендует
                            расчёт, в черновик попадёт доступный объём сейчас, а остаток
                            потребности будет виден отдельной строкой.
                        </Text>
                        <Text type="secondary">
                            При лимитах строки попадают в отправку по приоритету:
                            меньше дней остатка → при равной срочности выше класс
                            ABC/XYZ (AX приоритетнее AY, затем AZ, BX и далее) →
                            больше рекомендуемое количество → больше продажи за 30
                            дней → OEM по алфавиту.
                            Если строка не помещается в остаток лимита суммы или
                            достигнут лимит позиций, она остаётся в списке
                            “Не вошли в черновики”.
                        </Text>
                        <Space wrap>
                            <Button
                                icon={<PlayCircleOutlined />}
                                loading={rerunLoading}
                                disabled={!run || Number(run?.sent_count || 0) <= 0}
                                onClick={() => {
                                    void handleRerunCurrentSettings();
                                }}
                            >
                                Пересчитать после отправки
                            </Button>
                            <Select
                                placeholder="Клиент для оформления на Dragonzap"
                                value={selectedCustomerId}
                                loading={customersLoading}
                                options={customerOptions}
                                style={{ width: 320 }}
                                optionFilterProp="label"
                                showSearch
                                onChange={(value) => setSelectedCustomerId(value ?? null)}
                            />
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                loading={bulkSendLoading}
                                disabled={!selectedCustomerId || !selectedDraftGroupKeys.length}
                                onClick={() => {
                                    void handleSendSelectedGroups();
                                }}
                            >
                                Отправить выбранные группы
                            </Button>
                            <Button
                                icon={<SendOutlined />}
                                loading={bulkSendLoading}
                                disabled={
                                    !selectedCustomerId ||
                                    !draftGroups.some((group) => getSendableGroupItems(group).length)
                                }
                                onClick={() => {
                                    void handleSendAllGroups();
                                }}
                            >
                                Отправить все доступные
                            </Button>
                            <Checkbox
                                checked={showOnlySendableDraftGroups}
                                onChange={(event) =>
                                    setShowOnlySendableDraftGroups(event.target.checked)
                                }
                            >
                                Только доступные к отправке
                            </Checkbox>
                            <Text type="secondary">
                                Отправка использует текущий рабочий поток Dragonzap, а факт
                                отправки сохраняется в backend и переживает перезагрузку страницы.
                            </Text>
                            <Text type="secondary">
                                По умолчанию автозаказ оформляется на клиента {AUTOPURCHASE_DEFAULT_CUSTOMER_NAME}
                                {selectedCustomerLabel ? ` · сейчас выбран: ${selectedCustomerLabel}` : ''}.
                            </Text>
                        </Space>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: 12,
                            }}
                        >
                            <SummaryStatCard
                                title="Групп поставщиков"
                                value={draftPayload?.total_groups ?? 0}
                            />
                            <SummaryStatCard
                                title="Подтверждённых строк в черновиках"
                                value={draftPayload?.total_items ?? 0}
                                color="#15803d"
                            />
                            <SummaryStatCard
                                title="К заказу сейчас"
                                value={formatQty(draftPayload?.total_quantity ?? 0)}
                                color="#0f766e"
                            />
                            <SummaryStatCard
                                title="Сумма черновиков"
                                value={
                                    draftPayload?.total_sum != null
                                        ? `${formatMoney(draftPayload.total_sum)} руб.`
                                        : '—'
                                }
                            />
                        </div>
                        <Table
                            rowKey="supplier_key"
                            loading={draftsLoading}
                            columns={draftColumns}
                            dataSource={visibleDraftGroups}
                            pagination={false}
                            rowSelection={{
                                selectedRowKeys: selectedDraftGroupKeys,
                                onChange: (keys) => setSelectedDraftGroupKeys(keys),
                                getCheckboxProps: (record) => ({
                                    disabled: !getSendableGroupItems(record).length,
                                }),
                            }}
                            expandable={{
                                expandedRowRender: (group) => (
                                    <Table
                                        rowKey="item_id"
                                        size="small"
                                        pagination={false}
                                        dataSource={group.items || []}
                                        columns={[
                                            {
                                                title: 'Позиция',
                                                key: 'position',
                                                render: (_, item) => (
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>
                                                            {item.brand_name || '—'} {item.oem_number}
                                                        </div>
                                                        <div
                                                            style={{
                                                                color: '#64748b',
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {item.autopart_name || '—'}
                                                        </div>
                                                        {item.site_brand_name
                                                            && item.site_brand_name !== item.brand_name ? (
                                                                <div style={{ marginTop: 2 }}>
                                                                    <Tag color="geekblue">
                                                                        Закажем как: {item.site_brand_name}
                                                                        {' '}
                                                                        {item.site_oem_number || item.oem_number}
                                                                    </Tag>
                                                                </div>
                                                            ) : null}
                                                        {Number(item.open_customer_backlog_qty || 0) > 0 ? (
                                                            <div style={{ marginTop: 2 }}>
                                                                <Tag color="volcano">
                                                                    Клиентский backlog: {item.open_customer_backlog_qty} шт
                                                                </Tag>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ),
                                            },
                                            {
                                                title: 'Реком.',
                                                dataIndex: 'recommended_order_qty',
                                                width: 110,
                                                render: (value) => formatQty(value),
                                            },
                                            {
                                                title: 'Закажем сейчас',
                                                dataIndex: 'proposed_order_qty',
                                                width: 130,
                                                render: (value) => formatQty(value),
                                            },
                                            {
                                                title: 'Остаток потребности',
                                                dataIndex: 'remaining_gap_qty',
                                                width: 150,
                                                render: (value) => formatQty(value),
                                            },
                                            {
                                                title: 'Цена',
                                                dataIndex: 'price',
                                                width: 110,
                                                render: (value) =>
                                                    value != null
                                                        ? `${formatMoney(value)} руб.`
                                                        : '—',
                                            },
                                            {
                                                title: 'Сумма',
                                                dataIndex: 'line_total',
                                                width: 120,
                                                render: (value) =>
                                                    value != null
                                                        ? `${formatMoney(value)} руб.`
                                                        : '—',
                                            },
                                        ]}
                                    />
                                ),
                            }}
                        />
                        {draftEmptyState ? (
                            <Alert
                                type={draftEmptyState.type}
                                showIcon
                                message={draftEmptyState.message}
                                description={draftEmptyState.description}
                            />
                        ) : null}
                        {skippedDraftItems.length ? (
                            <div>
                                <Text strong>Не вошли в черновики / отправку:</Text>
                                <div style={{ marginTop: 8 }}>
                                    <Space wrap size={[6, 6]}>
                                        {skippedDraftItems.map((item) => (
                                            <Tag key={item.item_id} color="default">
                                                {(item.brand_name || '—') + ' ' + item.oem_number}: {item.reason}
                                            </Tag>
                                        ))}
                                    </Space>
                                </div>
                            </div>
                        ) : null}
                    </Space>
                </Card>
            </Space>
            <Modal
                open={aiModalState.open}
                title={
                    aiModalState.kind === 'group'
                        ? `AI-пояснение по группе: ${aiModalState.group?.provider_name || '—'}`
                        : aiModalState.row
                            ? `AI-пояснение: ${aiModalState.row.brand_name || '—'} ${aiModalState.row.oem_number || ''}`
                            : 'AI-пояснение по строке автозаказа'
                }
                footer={null}
                width={760}
                onCancel={() => {
                    setAiModalState({
                        open: false,
                        kind: 'item',
                        row: null,
                        group: null,
                        payload: null,
                    });
                }}
            >
                {aiLoading ? (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Text strong>Запрашиваем AI-пояснение...</Text>
                        <Progress percent={Math.min(90, 15 + runElapsedSec * 3)} status="active" showInfo={false} />
                        <Text type="secondary">
                            AI не влияет на расчёт заказа, а только помогает менеджеру понять готовое решение системы.
                        </Text>
                    </Space>
                ) : aiModalState.payload ? (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Alert
                            type={aiModalState.payload.source === 'ai' ? 'success' : 'info'}
                            showIcon
                            message={
                                aiModalState.payload.source === 'ai'
                                    ? `Ответ от модели ${aiModalState.payload.model}`
                                    : aiModalState.payload.warning_message ||
                                      'AI недоступен, показано резервное пояснение по правилам системы'
                            }
                            description={`${aiModalState.payload.warning_code ? `Код: ${aiModalState.payload.warning_code} · ` : ''}Уверенность: ${Math.round(Number(aiModalState.payload.confidence || 0) * 100)}% · ${
                                aiModalState.payload.requires_human_review
                                    ? 'Требует ручной проверки'
                                    : 'Можно быстро подтверждать'
                            }`}
                        />
                        <div>
                            <Text strong>
                                {aiModalState.kind === 'group'
                                    ? 'Почему система собрала эту группу'
                                    : 'Почему система предлагает эту строку'}
                            </Text>
                            <div style={{ marginTop: 6 }}>
                                <Text>{aiModalState.payload.human_explanation}</Text>
                            </div>
                        </div>
                        <div>
                            <Text strong>Риски</Text>
                            <div style={{ marginTop: 6 }}>
                                <Text>{aiModalState.payload.risk_summary}</Text>
                            </div>
                        </div>
                        <div>
                            <Text strong>
                                {aiModalState.kind === 'group'
                                    ? 'Комментарий менеджеру по группе'
                                    : 'Комментарий менеджеру'}
                            </Text>
                            <div style={{ marginTop: 6 }}>
                                <Text>{aiModalState.payload.manager_note}</Text>
                            </div>
                        </div>
                        <div>
                            <Text strong>
                                {aiModalState.kind === 'group'
                                    ? 'Черновик сообщения поставщику по группе'
                                    : 'Черновик сообщения поставщику'}
                            </Text>
                            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                                <Text>{aiModalState.payload.supplier_message_draft || '—'}</Text>
                            </div>
                        </div>
                    </Space>
                ) : (
                    <Text type="secondary">Пояснение пока не получено.</Text>
                )}
            </Modal>
        </Card>
    );
};

export default AutopurchasePage;
