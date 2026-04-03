import React, { useCallback, useMemo, useState } from 'react';
import {
    InputNumber,
    Select,
    Table,
    Tag,
    Tooltip,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { updateTrackingOrderItem } from '../api/orderTracking';

const SOURCE_LABELS = {
    supplier: { color: 'green', label: 'Прайс' },
    site: { color: 'blue', label: 'Сайт' },
};

const STATUS_COLORS = {
    NEW: 'default',
    SCHEDULED: 'default',
    SENT: 'blue',
    ERROR: 'red',
    ORDERED: 'blue',
    PROCESSING: 'gold',
    CONFIRMED: 'cyan',
    ARRIVED: 'green',
    SHIPPED: 'green',
    REFUSAL: 'red',
    REMOVED: 'default',
    TRANSIT: 'orange',
    ACCEPTED: 'lime',
    RETURNED: 'orange',
    FAILED: 'red',
    DELIVERED: 'green',
    CANCELLED: 'red',
};

const STATUS_LABELS = {
    NEW: 'Новый',
    SCHEDULED: 'Запланирован',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
    ORDERED: 'В заказе',
    PROCESSING: 'Обрабатывается',
    CONFIRMED: 'Подтвержден',
    ARRIVED: 'Прибыл',
    SHIPPED: 'Выдан',
    REFUSAL: 'Отказ',
    REMOVED: 'Снят',
    TRANSIT: 'В пути',
    ACCEPTED: 'Принят',
    RETURNED: 'Возврат',
    FAILED: 'Ошибка',
    DELIVERED: 'Получено',
    CANCELLED: 'Отменен',
};

const STATUS_OPTIONS_BY_SOURCE = {
    supplier: ['NEW', 'SCHEDULED', 'SENT', 'ERROR'],
    site: [
        'ORDERED',
        'PROCESSING',
        'CONFIRMED',
        'TRANSIT',
        'ACCEPTED',
        'ARRIVED',
        'SHIPPED',
        'REFUSAL',
        'RETURNED',
        'REMOVED',
        'ERROR',
    ],
};

const formatDateTime = (value) => {
    if (!value) {
        return '—';
    }
    return dayjs(value).format('DD.MM.YY HH:mm');
};

const formatMoney = (value) => {
    if (value === null || value === undefined) {
        return '—';
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
        return '—';
    }
    return number.toFixed(2);
};

const formatLeadTime = (record) => {
    if (record.actual_lead_days !== null && record.actual_lead_days !== undefined) {
        return `Факт ${record.actual_lead_days} дн`;
    }
    if (
        record.min_delivery_day !== null &&
        record.min_delivery_day !== undefined &&
        record.max_delivery_day !== null &&
        record.max_delivery_day !== undefined
    ) {
        return `${record.min_delivery_day}-${record.max_delivery_day} дн`;
    }
    if (record.min_delivery_day !== null && record.min_delivery_day !== undefined) {
        return `от ${record.min_delivery_day} дн`;
    }
    if (record.max_delivery_day !== null && record.max_delivery_day !== undefined) {
        return `до ${record.max_delivery_day} дн`;
    }
    return '—';
};

const buildStatusOptions = (sourceType) =>
    (STATUS_OPTIONS_BY_SOURCE[sourceType] || []).map((value) => ({
        value,
        label: STATUS_LABELS[value] || value,
    }));

const SUCCESS_STATUSES = new Set([
    'ACCEPTED',
    'ARRIVED',
    'SHIPPED',
    'DELIVERED',
]);
const PROGRESS_STATUSES = new Set([
    'NEW',
    'SCHEDULED',
    'SENT',
    'ORDERED',
    'PROCESSING',
    'CONFIRMED',
    'TRANSIT',
]);
const WARNING_STATUSES = new Set([
    'RETURNED',
    'REMOVED',
]);
const ERROR_STATUSES = new Set([
    'REFUSAL',
    'ERROR',
    'FAILED',
    'CANCELLED',
]);

const getRowStatusClass = (status) => {
    if (SUCCESS_STATUSES.has(status)) {
        return 'tracking-orders-row-success';
    }
    if (ERROR_STATUSES.has(status)) {
        return 'tracking-orders-row-error';
    }
    if (WARNING_STATUSES.has(status)) {
        return 'tracking-orders-row-warning';
    }
    if (PROGRESS_STATUSES.has(status)) {
        return 'tracking-orders-row-progress';
    }
    return '';
};

const TrackingOrderHistoryTable = ({
    rows,
    loading = false,
    compact = false,
    showOem = true,
    allowEdit = false,
    onUpdated,
    emptyText = 'История заказов пока пуста',
}) => {
    const [drafts, setDrafts] = useState({});
    const [savingKey, setSavingKey] = useState(null);

    const updateDraft = useCallback((rowKey, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [rowKey]: {
                ...prev[rowKey],
                ...patch,
            },
        }));
    }, []);

    const handleSave = useCallback(
        async (
            record,
            extraPatch = {},
            { notifyIfNoChanges = true } = {}
        ) => {
            const rowKey = `${record.source_type}:${record.item_id}`;
            const draft = {
                ...(drafts[rowKey] || {}),
                ...extraPatch,
            };
            const payload = {};
            if (
                draft.status !== undefined &&
                draft.status !== (record.order_status || record.current_status)
            ) {
                payload.status = draft.status;
            }
            if (
                draft.received_quantity !== undefined &&
                Number(draft.received_quantity) !==
                    Number(record.received_quantity ?? 0)
            ) {
                payload.received_quantity = Number(draft.received_quantity);
            }
            if (!Object.keys(payload).length) {
                if (notifyIfNoChanges) {
                    message.info('Нет изменений для сохранения');
                }
                return;
            }
            setSavingKey(rowKey);
            try {
                await updateTrackingOrderItem(
                    record.source_type,
                    record.item_id,
                    payload
                );
                message.success('Данные заказа обновлены');
                setDrafts((prev) => {
                    const next = { ...prev };
                    delete next[rowKey];
                    return next;
                });
                if (onUpdated) {
                    onUpdated();
                }
            } catch (error) {
                const detail = error?.response?.data?.detail;
                message.error(detail || 'Не удалось обновить заказ');
            } finally {
                setSavingKey(null);
            }
        },
        [drafts, onUpdated]
    );

    const columns = useMemo(() => {
        const baseColumns = [
            {
                title: '',
                dataIndex: 'source_type',
                key: 'source_type',
                width: compact ? 66 : 86,
                render: (value) => {
                    const meta = SOURCE_LABELS[value] || {
                        color: 'default',
                        label: value || '—',
                    };
                    return <Tag color={meta.color}>{meta.label}</Tag>;
                },
            },
            {
                title: 'Когда',
                dataIndex: 'created_at',
                key: 'created_at',
                width: compact ? 96 : 128,
                render: formatDateTime,
            },
        ];

        if (showOem) {
            baseColumns.push({
                title: 'OEM',
                dataIndex: 'oem_number',
                key: 'oem_number',
                width: compact ? 112 : 132,
                ellipsis: true,
            });
        }

        baseColumns.push(
            {
                title: 'Бренд',
                dataIndex: 'brand_name',
                key: 'brand_name',
                width: compact ? 96 : 116,
                ellipsis: true,
                render: (value) => value || '—',
            },
            {
                title: 'Наименование',
                dataIndex: 'autopart_name',
                key: 'autopart_name',
                width: compact ? 170 : 220,
                ellipsis: true,
                render: (value) => value || '—',
            },
            {
                title: 'Где / кто',
                key: 'provider_summary',
                width: compact ? 172 : 228,
                render: (_, record) => (
                    <div className="tracking-orders-provider-cell">
                        <div className="tracking-orders-provider-name">
                            {record.provider_name || '—'}
                        </div>
                        <div className="tracking-orders-provider-user">
                            {record.ordered_by_email || 'Система'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Цена',
                dataIndex: 'price',
                key: 'price',
                width: compact ? 70 : 88,
                render: formatMoney,
            },
            {
                title: 'Заказ',
                dataIndex: 'ordered_quantity',
                key: 'ordered_quantity',
                width: compact ? 64 : 82,
            },
            {
                title: (
                    <Tooltip title="Сколько фактически получили по этой строке">
                        <span>Получено</span>
                    </Tooltip>
                ),
                dataIndex: 'received_quantity',
                key: 'received_quantity',
                width: compact ? 82 : 110,
                render: (value, record) => {
                    if (!allowEdit) {
                        if (value === null || value === undefined) {
                            return '—';
                        }
                        return value;
                    }
                    const rowKey = `${record.source_type}:${record.item_id}`;
                    if (
                        record.source_type === 'site' &&
                        (record.current_status || '').trim()
                    ) {
                        const title = (
                            'Количество обычно подставляется автоматически '
                            + 'при статусе "Прибыл" или "Выдан". Если факт '
                            + 'отличается, здесь можно поправить вручную.'
                        );
                        return (
                            <Tooltip title={title}>
                                <InputNumber
                                    min={0}
                                    placeholder="0"
                                    value={
                                        drafts[rowKey]?.received_quantity ??
                                        record.received_quantity
                                    }
                                    size="small"
                                    style={{ width: '100%' }}
                                    disabled={savingKey === rowKey}
                                    onChange={(next) =>
                                        updateDraft(rowKey, {
                                            received_quantity: next,
                                        })
                                    }
                                    onBlur={() => {
                                        void handleSave(
                                            record,
                                            {},
                                            { notifyIfNoChanges: false }
                                        );
                                    }}
                                />
                            </Tooltip>
                        );
                    }
                    return (
                        <InputNumber
                            min={0}
                            placeholder="0"
                            value={
                                drafts[rowKey]?.received_quantity ??
                                record.received_quantity
                            }
                            size="small"
                            style={{ width: '100%' }}
                            disabled={savingKey === rowKey}
                            onChange={(next) =>
                                updateDraft(rowKey, {
                                    received_quantity: next,
                                })
                            }
                            onBlur={() => {
                                void handleSave(
                                    record,
                                    {},
                                    { notifyIfNoChanges: false }
                                );
                            }}
                        />
                    );
                },
            },
            {
                title: 'Срок',
                key: 'lead_time',
                width: compact ? 94 : 114,
                render: (_, record) => formatLeadTime(record),
            },
            {
                title: 'Статус',
                dataIndex: 'current_status',
                key: 'current_status',
                width: compact ? 124 : 154,
                render: (value, record) => {
                    if (!allowEdit) {
                        const className = value ? getRowStatusClass(value) : '';
                        return (
                            <Tooltip
                                title={
                                    record.source_type === 'site'
                                        ? 'Статус синхронизируется с Dragonzap автоматически'
                                        : 'Статус ведется внутри программы'
                                }
                            >
                                <Tag
                                    color={STATUS_COLORS[value] || 'default'}
                                    className={className}
                                >
                                    {STATUS_LABELS[value] || value || '—'}
                                </Tag>
                            </Tooltip>
                        );
                    }
                    const rowKey = `${record.source_type}:${record.item_id}`;
                    if (record.source_type === 'site') {
                        return (
                            <Tooltip title="Статус синхронизируется с Dragonzap автоматически">
                                <Tag color={STATUS_COLORS[value] || 'default'}>
                                    {STATUS_LABELS[value] || value || '—'}
                                </Tag>
                            </Tooltip>
                        );
                    }
                    return (
                        <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={
                                drafts[rowKey]?.status ??
                                record.order_status ??
                                record.current_status
                            }
                            options={buildStatusOptions(record.source_type)}
                            disabled={savingKey === rowKey}
                            onChange={(next) => {
                                updateDraft(rowKey, { status: next });
                                void handleSave(record, { status: next });
                            }}
                        />
                    );
                },
            }
        );

        return baseColumns;
    }, [
        allowEdit,
        compact,
        drafts,
        handleSave,
        savingKey,
        showOem,
        updateDraft,
    ]);

    return (
        <Table
            rowKey={(record) => `${record.source_type}:${record.item_id}`}
            columns={columns}
            dataSource={rows}
            loading={loading}
            className={`tracking-orders-table${compact ? ' tracking-orders-table-compact' : ''}`}
            size="small"
            pagination={{ pageSize: compact ? 8 : 20, showSizeChanger: false }}
            tableLayout="fixed"
            scroll={{ x: compact ? 980 : 1220 }}
            locale={{ emptyText }}
            rowClassName={(record) => getRowStatusClass(record.current_status)}
        />
    );
};

export default TrackingOrderHistoryTable;
