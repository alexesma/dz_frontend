import React, { useCallback, useMemo, useState } from 'react';
import {
    Button,
    InputNumber,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { CheckOutlined } from '@ant-design/icons';
import { updateTrackingOrderItem } from '../api/orderTracking';

const SOURCE_LABELS = {
    supplier: { color: 'green', label: 'Прайс' },
    site: { color: 'blue', label: 'Сайт' },
};

const STATUS_COLORS = {
    NEW: 'default',
    SCHEDULED: 'blue',
    SENT: 'cyan',
    ERROR: 'red',
    ORDERED: 'blue',
    PROCESSING: 'gold',
    CONFIRMED: 'green',
    ARRIVED: 'green',
    SHIPPED: 'green',
    REFUSAL: 'red',
    REMOVED: 'default',
    TRANSIT: 'cyan',
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
        async (record) => {
            const rowKey = `${record.source_type}:${record.item_id}`;
            const draft = drafts[rowKey] || {};
            const payload = {};
            if (
                draft.status &&
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
                message.info('Нет изменений для сохранения');
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
                title: 'Где заказали',
                dataIndex: 'provider_name',
                key: 'provider_name',
                width: compact ? 140 : 180,
                ellipsis: true,
                render: (value) => value || '—',
            },
            {
                title: 'Кто',
                dataIndex: 'ordered_by_email',
                key: 'ordered_by_email',
                width: compact ? 140 : 180,
                ellipsis: true,
                render: (value) => value || 'Система',
            },
            {
                title: 'Цена',
                dataIndex: 'price',
                key: 'price',
                width: compact ? 78 : 92,
                render: formatMoney,
            },
            {
                title: 'Заказ',
                dataIndex: 'ordered_quantity',
                key: 'ordered_quantity',
                width: compact ? 70 : 86,
            },
            {
                title: 'Получено',
                dataIndex: 'received_quantity',
                key: 'received_quantity',
                width: compact ? 90 : 116,
                render: (value, record) => {
                    if (!allowEdit) {
                        return value ?? '—';
                    }
                    const rowKey = `${record.source_type}:${record.item_id}`;
                    return (
                        <InputNumber
                            min={0}
                            value={
                                drafts[rowKey]?.received_quantity ??
                                record.received_quantity
                            }
                            size="small"
                            style={{ width: '100%' }}
                            onChange={(next) =>
                                updateDraft(rowKey, {
                                    received_quantity: next ?? 0,
                                })
                            }
                        />
                    );
                },
            },
            {
                title: 'Срок',
                key: 'lead_time',
                width: compact ? 104 : 118,
                render: (_, record) => formatLeadTime(record),
            },
            {
                title: 'Статус',
                dataIndex: 'current_status',
                key: 'current_status',
                width: compact ? 120 : 160,
                render: (value, record) => {
                    if (!allowEdit) {
                        return (
                            <Tag color={STATUS_COLORS[value] || 'default'}>
                                {STATUS_LABELS[value] || value || '—'}
                            </Tag>
                        );
                    }
                    const rowKey = `${record.source_type}:${record.item_id}`;
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
                            onChange={(next) => updateDraft(rowKey, { status: next })}
                        />
                    );
                },
            }
        );

        if (allowEdit) {
            baseColumns.push({
                title: '',
                key: 'save',
                width: 54,
                render: (_, record) => {
                    const rowKey = `${record.source_type}:${record.item_id}`;
                    return (
                        <Tooltip title="Сохранить">
                            <Button
                                type="text"
                                shape="circle"
                                icon={<CheckOutlined />}
                                loading={savingKey === rowKey}
                                onClick={() => handleSave(record)}
                            />
                        </Tooltip>
                    );
                },
            });
        }

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
            size="small"
            pagination={{ pageSize: compact ? 8 : 20, showSizeChanger: false }}
            tableLayout="fixed"
            scroll={{ x: compact ? 1120 : 1380 }}
            locale={{ emptyText }}
        />
    );
};

export default TrackingOrderHistoryTable;
