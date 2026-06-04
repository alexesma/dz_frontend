import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Select,
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
import { getCustomers } from '../api/customers';
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
} from '../api/orderTracking';

const { Title, Text } = Typography;

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
    running: 'В расчёте',
    completed: 'Готов',
    failed: 'Ошибка',
};

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

const formatSupplierBadge = (supplier) => {
    if (!supplier?.provider_name) {
        return '—';
    }
    const bits = [supplier.provider_name];
    if (supplier.current_provider_config_name) {
        bits.push(supplier.current_provider_config_name);
    }
    if (supplier.current_price != null) {
        bits.push(`${formatMoney(supplier.current_price)} руб.`);
    }
    if (supplier.current_qty != null) {
        bits.push(`${supplier.current_qty} шт`);
    }
    if (supplier.effective_lead_days != null) {
        bits.push(`${supplier.effective_lead_days} дн`);
    }
    return bits.join(' · ');
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
    const [showOnlySendableDraftGroups, setShowOnlySendableDraftGroups] = useState(false);
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
            const { data } = await getCustomers();
            const nextRows = Array.isArray(data) ? data : [];
            setCustomerOptions(
                nextRows.map((item) => ({
                    value: item.id,
                    label: item.name || `Клиент #${item.id}`,
                }))
            );
            setSelectedCustomerId((prev) => prev || nextRows[0]?.id || null);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить список клиентов');
        } finally {
            setCustomersLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRuns();
    }, [fetchRuns]);

    useEffect(() => {
        if (!runs.length) {
            setSelectedRunId(null);
            return;
        }
        if (activeRunProgress && runs[0]?.status === 'running') {
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
    }, [fetchRunItems, selectedRunId, filters]);

    useEffect(() => {
        void fetchDraftOrders(selectedRunId);
    }, [fetchDraftOrders, selectedRunId]);

    useEffect(() => {
        if (!activeRunProgress) {
            return undefined;
        }
        const timer = window.setInterval(() => {
            void fetchRuns();
        }, 4000);
        return () => window.clearInterval(timer);
    }, [activeRunProgress, fetchRuns]);

    const run = runPayload?.run || runs.find((item) => item.id === selectedRunId) || null;

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
            message.success('Запуск автозаказа создан');
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
            message.success('Новый запуск автозаказа создан на текущих настройках');
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
        if (!activeRunProgress?.startedAt) {
            setRunElapsedSec(0);
            return undefined;
        }
        setRunElapsedSec(Math.max(0, Math.floor((Date.now() - activeRunProgress.startedAt) / 1000)));
        const timer = window.setInterval(() => {
            setRunElapsedSec(Math.max(0, Math.floor((Date.now() - activeRunProgress.startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [activeRunProgress]);

    const runProgressPercent = useMemo(() => {
        if (!activeRunProgress) {
            return 0;
        }
        return Math.min(95, 8 + Math.round(runElapsedSec * 1.6));
    }, [activeRunProgress, runElapsedSec]);

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
    const visibleRows = useMemo(
        () => (
            showOnlyPendingRows
                ? rows.filter((row) => !row?.sent_to_site_at)
                : rows
        ),
        [rows, showOnlyPendingRows]
    );
    useEffect(() => {
        const availableKeys = new Set(rows.map((row) => row.id));
        setSelectedRowKeys((prev) => prev.filter((key) => availableKeys.has(key)));
    }, [rows]);

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
            const payload = activeItems.map((item) => ({
                autopart_id: item.autopart_id ?? null,
                oem_number: item.oem_number,
                brand_name: item.brand_name,
                autopart_name: item.autopart_name,
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
                title: 'Статус',
                dataIndex: 'decision_status',
                width: 140,
                render: (value, row) => (
                    <Space direction="vertical" size={4}>
                        <Tag color={statusColor[value] || 'default'}>
                            {value === 'blocked'
                                ? 'Заблокировано'
                                : value === 'needs_review'
                                    ? 'На проверку'
                                    : value === 'auto_approved'
                                        ? 'Подтверждено'
                                        : 'Ожидание'}
                        </Tag>
                        {row?.sent_to_site_at ? (
                            <>
                                <Tag color="green">
                                    Отправлено{row?.sent_order_number ? ` · ${row.sent_order_number}` : ''}
                                </Tag>
                                {row?.sent_order_id ? (
                                    <Button
                                        type="link"
                                        size="small"
                                        style={{ padding: 0, height: 'auto' }}
                                        onClick={() => {
                                            navigate(`/orders/${row.sent_order_id}`);
                                        }}
                                    >
                                        Открыть заказ
                                    </Button>
                                ) : null}
                            </>
                        ) : null}
                    </Space>
                ),
            },
            {
                title: 'Позиция',
                key: 'position',
                width: 230,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 700 }}>
                            {row.brand_name || '—'} {row.oem_number}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.autopart_name || '—'}
                        </div>
                        {row.abc_xyz?.abc_class || row.abc_xyz?.xyz_class ? (
                            <div style={{ color: '#64748b', fontSize: 12 }}>
                                {row.abc_xyz?.abc_class || '—'} / {row.abc_xyz?.xyz_class || '—'}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                title: 'Остаток',
                key: 'stock',
                width: 130,
                render: (_, row) => (
                    <div>
                        <div>{formatQty(row.current_quantity)}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            в пути: {formatQty(row.in_transit_qty)}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Спрос',
                key: 'demand',
                width: 140,
                render: (_, row) => (
                    <div>
                        <div>{row.avg_daily_blended != null ? `${row.avg_daily_blended} шт/д` : '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            30д: {row.sold_last_30_days || 0} · 90д: {row.sold_last_90_days || 0}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Точка / цель',
                key: 'target',
                width: 150,
                render: (_, row) => (
                    <div>
                        <div>точка: {row.reorder_point != null ? row.reorder_point : '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            цель: {row.target_stock != null ? formatQty(row.target_stock) : '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'К заказу',
                key: 'recommended',
                width: 120,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 700 }}>
                            {formatQty(row.recommended_order_qty)}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            кратн.: {row.multiplicity || 1}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Поставщик с сайта',
                key: 'supplier',
                width: 260,
                render: (_, row) => (
                    <span>{formatSupplierBadge(row.recommended_supplier)}</span>
                ),
            },
            {
                title: 'Причины',
                dataIndex: 'reason_titles',
                width: 320,
                render: (items) => (
                    <Space wrap size={[4, 4]}>
                        {(items || []).map((item) => (
                            <Tag key={item}>{item}</Tag>
                        ))}
                    </Space>
                ),
            },
            {
                title: 'Действие',
                key: 'actions',
                width: 280,
                fixed: 'right',
                render: (_, row) => {
                    const isSent = Boolean(row?.sent_to_site_at);
                    const approveUnavailableReason = getApproveUnavailableReason(row);
                    const approveDisabled = isSent || Boolean(approveUnavailableReason);
                    return (
                        <Space wrap size={6}>
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
                },
            },
        ],
        [handleItemStatusChange, handleOpenAiExplanation, navigate]
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

                {activeRunProgress ? (
                    <Card size="small" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                            <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                                <Text strong>Идёт расчёт автозаказа</Text>
                                <Text type="secondary">
                                    Прошло: {runElapsedSec} сек.
                                </Text>
                            </Space>
                            <Progress percent={runProgressPercent} status="active" showInfo={false} />
                            <Text type="secondary">
                                Считаем потребность по остаткам и истории, затем запрашиваем
                                Dragonzap по кандидатам и сохраняем новый запуск. Пока backend
                                считает run синхронно, страница обновится только после завершения
                                этого запроса.
                            </Text>
                            <Text type="secondary">
                                Режим: {activeRunProgress.mode} · лимит строк расчёта: {activeRunProgress.limit}
                            </Text>
                        </Space>
                    </Card>
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

                <Table
                    rowKey="id"
                    loading={rowsLoading}
                    columns={columns}
                    dataSource={visibleRows}
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
                    pagination={{ pageSize: 25 }}
                    scroll={{ x: 1380 }}
                />

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
                            меньше дней остатка → больше рекомендуемое количество →
                            больше продажи за 30 дней → OEM по алфавиту.
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
                                onChange={(value) => setSelectedCustomerId(value)}
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
