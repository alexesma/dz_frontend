import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Popconfirm,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { getSupplierOrderDetail, sendSupplierOrders } from '../api/customerOrders';

const { Title } = Typography;

const SUPPLIER_STATUS_LABELS = {
    NEW: 'Новый',
    SCHEDULED: 'Запланирован',
    SENT: 'Отправлен',
    ERROR: 'Ошибка',
};

const SUPPLIER_STATUS_COLORS = {
    NEW: 'default',
    SCHEDULED: 'blue',
    SENT: 'green',
    ERROR: 'red',
};

const RESPONSE_STATES = {
    not_sent: { label: 'Не отправлен', color: 'default' },
    awaiting_response: { label: 'Ожидаем ответ', color: 'blue' },
    overdue: { label: 'Ответ просрочен', color: 'orange' },
    confirmed: { label: 'Подтверждён', color: 'green' },
    received: { label: 'Поступил', color: 'green' },
    partially_received: { label: 'Частично поступил', color: 'cyan' },
    partially_received_overdue: { label: 'Остаток просрочен', color: 'orange' },
    rejected: { label: 'Подтверждённый отказ', color: 'red' },
    partially_rejected: { label: 'Частичный отказ', color: 'volcano' },
};

const RESPONSE_SOURCES = {
    supplier: 'Ответ поставщика',
    manager: 'Отметка менеджера',
    automatic: 'Автоматическое подтверждение',
    document_timeout: 'Не вошло в документы за 24 часа',
    recorded: 'Зафиксированное количество',
};

const CustomerSupplierOrderDetailPage = () => {
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const fetchData = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const { data } = await getSupplierOrderDetail(orderId);
            setOrder(data);
        } catch {
            message.error('Не удалось загрузить заказ поставщику');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatDateTime = (value) => {
        if (!value) return '—';
        return dayjs(value).format('DD.MM.YYYY HH:mm');
    };

    const formatMoney = (value) => {
        if (value === null || value === undefined) return '—';
        const num = Number(value);
        if (Number.isNaN(num)) return '—';
        return num.toFixed(2);
    };

    const totals = useMemo(() => {
        const items = order?.items || [];
        let totalSum = 0;
        let totalQty = 0;
        items.forEach((item) => {
            const qty = Number(item.quantity ?? 0);
            const price = Number(item.price ?? 0);
            totalQty += qty;
            totalSum += qty * price;
        });
        return { totalSum, totalQty };
    }, [order]);

    const handleSendNow = async () => {
        if (!order) return;
        setSending(true);
        try {
            const { data: result } = await sendSupplierOrders([order.id]);
            if (Number(result?.sent || 0) < 1) {
                message.error('Письмо не отправлено: проверьте адрес поставщика и настройки почты');
            } else {
                message.success(order.status === 'SENT' ? 'Заказ отправлен повторно' : 'Заказ отправлен');
            }
            fetchData();
        } catch (err) {
            const detail =
                err?.response?.data?.detail || 'Не удалось отправить заказ';
            message.error(detail);
        } finally {
            setSending(false);
        }
    };

    const columns = [
        {
            title: 'OEM',
            dataIndex: 'oem',
            key: 'oem',
            width: 140,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand',
            key: 'brand',
            width: 140,
        },
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            width: 240,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 110,
            render: formatMoney,
        },
        {
            title: 'Отправлен',
            key: 'sent_at',
            width: 150,
            render: () => formatDateTime(order?.sent_at),
        },
        {
            title: 'Заказано',
            dataIndex: 'requested_qty',
            key: 'requested_qty',
            width: 110,
            render: (value) => value ?? '—',
        },
        {
            title: 'Отгрузка',
            dataIndex: 'ship_qty',
            key: 'ship_qty',
            width: 100,
            render: (value) => value ?? '—',
        },
        {
            title: 'Подтверждённый отказ',
            dataIndex: 'explicit_rejected_quantity',
            key: 'explicit_rejected_quantity',
            width: 90,
            render: (value) => value ?? '—',
        },
        {
            title: 'Состояние ответа',
            dataIndex: 'response_state',
            key: 'response_state',
            width: 180,
            render: (value) => {
                const meta = RESPONSE_STATES[value] || RESPONSE_STATES.not_sent;
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Основание',
            key: 'response_basis',
            width: 240,
            render: (_, record) => (
                <div>
                    <div>{RESPONSE_SOURCES[record.response_source] || (
                        ['overdue', 'partially_received_overdue'].includes(record.response_state)
                            ? 'Нет ответа по остатку к сроку' : '—'
                    )}</div>
                    {record.response_status_raw && <div>{record.response_status_raw === 'автоотказ по документу'
                        ? 'Строки нет в документе (историческая отметка)'
                        : record.response_status_raw}</div>}
                    {record.response_comment && !record.response_comment.startsWith('Авто-отказ: позиция отсутствует') && (
                        <div>{record.response_comment}</div>
                    )}
                    {record.confirmed_quantity !== null && record.confirmed_quantity !== undefined && (
                        <div>Подтверждено: {record.confirmed_quantity}</div>
                    )}
                    {Object.entries(record.refusal_sources || {}).map(([source, quantity]) => (
                        <div key={source}>Отказ {RESPONSE_SOURCES[source] || source}: {quantity}</div>
                    ))}
                    {record.pending_quantity > 0 && <div>Ждём: {record.pending_quantity}</div>}
                    {record.document_refusal_due_at && <div>Отказ по документу после: {dayjs(record.document_refusal_due_at).format('DD.MM.YYYY HH:mm')}</div>}
                </div>
            ),
        },
        {
            title: 'Срок ответа',
            dataIndex: 'response_due_at',
            key: 'response_due_at',
            width: 150,
            render: formatDateTime,
        },
        {
            title: 'Подтвердить без ответа',
            dataIndex: 'auto_confirm_at',
            key: 'auto_confirm_at',
            width: 170,
            render: formatDateTime,
        },
        {
            title: 'Ответ получен',
            dataIndex: 'response_at',
            key: 'response_at',
            width: 150,
            render: formatDateTime,
        },
        {
            title: 'Поступление',
            key: 'receipt',
            width: 170,
            render: (_, record) => record.received_quantity
                ? `${record.received_quantity} шт., ${formatDateTime(record.received_at)}`
                : '—',
        },
    ];

    return (
        <div className="page-shell">
            <Card loading={loading}>
                <div className="page-header-actions" style={{ marginBottom: 16 }}>
                    <Button onClick={() => navigate('/customer-orders/suppliers')}>
                        Назад к списку
                    </Button>
                    {order?.status !== 'SENT' ? (
                        <Button
                            type="primary"
                            onClick={handleSendNow}
                            loading={sending}
                        >
                            Отправить сейчас
                        </Button>
                    ) : (
                        <Popconfirm
                            title="Отправить заказ повторно?"
                            description="Письмо уйдёт на текущий адрес из карточки поставщика. Если поставщик уже получил первое письмо, у него будет дубль."
                            okText="Отправить"
                            cancelText="Отмена"
                            onConfirm={handleSendNow}
                        >
                            <Button loading={sending}>Отправить повторно</Button>
                        </Popconfirm>
                    )}
                </div>
                <Title level={3}>Заказ поставщику</Title>
                {order ? (
                    <>
                        <Descriptions
                            bordered
                            size="small"
                            column={{ xs: 1, sm: 1, md: 2 }}
                            style={{ marginBottom: 16 }}
                        >
                            <Descriptions.Item label="Поставщик">
                                {order.provider_name || order.provider_id}
                            </Descriptions.Item>
                            <Descriptions.Item label="Прайс">
                                {order.provider_config_name
                                    || (order.provider_config_id
                                        ? `#${order.provider_config_id}`
                                        : 'Общий заказ')}
                            </Descriptions.Item>
                            <Descriptions.Item label="Статус">
                                <Tag color={SUPPLIER_STATUS_COLORS[order.status] || 'default'}>
                                    {SUPPLIER_STATUS_LABELS[order.status] || order.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Создан">
                                {formatDateTime(order.created_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Запланирован">
                                {formatDateTime(order.scheduled_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отправлен">
                                {formatDateTime(order.sent_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Последняя попытка отправки">
                                {formatDateTime(order.last_send_attempt_at)}
                            </Descriptions.Item>
                            {order.last_send_error && (
                                <Descriptions.Item label="Ошибка отправки" span={2}>
                                    <Typography.Text type="danger">{order.last_send_error}</Typography.Text>
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Кол-во позиций">
                                {totals.totalQty}
                            </Descriptions.Item>
                            <Descriptions.Item label="Сумма заказа">
                                {formatMoney(totals.totalSum)}
                            </Descriptions.Item>
                        </Descriptions>
                        <Table
                            rowKey="id"
                            dataSource={order.items || []}
                            columns={columns}
                            pagination={false}
                            size="small"
                            scroll={{ x: 'max-content' }}
                            rowClassName={(record) =>
                                ['overdue', 'partially_received_overdue'].includes(record.response_state)
                                    ? 'row-auto-refused' : ''
                            }
                        />
                    </>
                ) : (
                    <div>Заказ не найден.</div>
                )}
            </Card>
        </div>
    );
};

export default CustomerSupplierOrderDetailPage;
