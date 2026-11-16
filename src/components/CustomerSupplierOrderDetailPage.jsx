import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    addSupplierOrderItem,
    deleteSupplierOrderItem,
    getSupplierOrderCustomerItemOptions,
    getSupplierOrderDetail,
    sendSupplierOrders,
    updateSupplierOrderItem,
} from '../api/customerOrders';
import { getAutopartLookupByOem } from '../api/autoparts';

const { Title, Text } = Typography;

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
    const location = useLocation();
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [savingItem, setSavingItem] = useState(false);
    const [deletingItemId, setDeletingItemId] = useState(null);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [customerOptionsLoading, setCustomerOptionsLoading] = useState(false);
    const [itemForm, setItemForm] = useState({
        oem: '', brand: '', name: '', quantity: 1, price: null,
        customerOrderItemId: null, lookupResults: [],
    });

    const requestedReturnTo = new URLSearchParams(location.search).get('returnTo');
    const returnTo = requestedReturnTo?.startsWith('/customer-orders/suppliers')
        && !requestedReturnTo.match(/^\/customer-orders\/suppliers\/\d+/)
        ? requestedReturnTo
        : '/customer-orders/suppliers';

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

    const editable = Boolean(
        order && !order.sent_at && !['SENT', 'REMOVED'].includes(order.status)
    );

    const loadCustomerOptions = useCallback(async ({ search = '', oem = '', itemId = null } = {}) => {
        if (!orderId) return;
        setCustomerOptionsLoading(true);
        try {
            const { data } = await getSupplierOrderCustomerItemOptions(orderId, {
                q: search || undefined,
                oem: oem || undefined,
                current_item_id: itemId || undefined,
                limit: 30,
            });
            setCustomerOptions(data || []);
        } catch {
            message.error('Не удалось загрузить свежие заказы клиентов');
        } finally {
            setCustomerOptionsLoading(false);
        }
    }, [orderId]);

    const openAddItem = () => {
        setEditingItem(null);
        setItemForm({
            oem: '', brand: '', name: '', quantity: 1, price: null,
            customerOrderItemId: null, lookupResults: [],
        });
        setEditorOpen(true);
        loadCustomerOptions();
    };

    const openEditItem = (item) => {
        setEditingItem(item);
        setItemForm({
            oem: item.oem || '',
            brand: item.brand || '',
            name: item.name || '',
            quantity: Number(item.quantity || 1),
            price: item.price === null || item.price === undefined ? null : Number(item.price),
            customerOrderItemId: item.customer_order_item_id || null,
            lookupResults: [],
        });
        setEditorOpen(true);
        loadCustomerOptions({
            oem: item.oem || '',
            itemId: item.id,
        });
    };

    const handleOemBlur = async () => {
        const oem = itemForm.oem.trim();
        if (!oem) return;
        try {
            const { data } = await getAutopartLookupByOem(oem);
            const rows = data || [];
            setItemForm((prev) => {
                if (rows.length !== 1) return { ...prev, lookupResults: rows };
                return {
                    ...prev,
                    brand: rows[0].brand || prev.brand,
                    name: rows[0].name || prev.name,
                    lookupResults: rows,
                };
            });
            loadCustomerOptions({ oem, itemId: editingItem?.id });
        } catch {
            message.error('Не удалось найти позицию по OEM');
        }
    };

    const handleCustomerItemSelect = (value) => {
        const option = customerOptions.find((row) => row.item_id === value);
        setItemForm((prev) => ({
            ...prev,
            customerOrderItemId: value || null,
            oem: option?.oem || prev.oem,
            brand: option?.brand || prev.brand,
            name: option?.name || prev.name,
            quantity: option ? Number(option.ship_qty || option.requested_qty || 1) : prev.quantity,
        }));
    };

    const handleSaveItem = async () => {
        const payload = {
            quantity: Number(itemForm.quantity),
            price: itemForm.price === null || itemForm.price === ''
                ? undefined : Number(itemForm.price),
            customer_order_item_id: itemForm.customerOrderItemId || null,
        };
        if (!editingItem) {
            payload.oem = itemForm.oem.trim();
            payload.brand = itemForm.brand.trim();
            payload.name = itemForm.name.trim() || null;
            if (!payload.oem || !payload.brand || payload.quantity < 1) {
                message.warning('Укажите OEM, бренд и количество');
                return;
            }
        }
        if (payload.quantity < 1) {
            message.warning('Количество должно быть больше нуля');
            return;
        }
        if (payload.price === undefined) delete payload.price;
        setSavingItem(true);
        try {
            const { data } = editingItem
                ? await updateSupplierOrderItem(order.id, editingItem.id, payload)
                : await addSupplierOrderItem(order.id, payload);
            setOrder(data);
            setEditorOpen(false);
            message.success(editingItem ? 'Позиция обновлена' : 'Позиция добавлена');
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось сохранить позицию');
        } finally {
            setSavingItem(false);
        }
    };

    const handleDeleteItem = async (item) => {
        setDeletingItemId(item.id);
        try {
            const { data } = await deleteSupplierOrderItem(order.id, item.id);
            setOrder(data);
            message.success('Позиция удалена');
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось удалить позицию');
        } finally {
            setDeletingItemId(null);
        }
    };

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

    const hint = (label, text) => (
        <Tooltip title={text}><span style={{ borderBottom: '1px dotted' }}>{label}</span></Tooltip>
    );
    const labelled = (label, value) => (
        <div style={{ whiteSpace: 'nowrap' }}>
            <Text type="secondary">{label}: </Text>{value}
        </div>
    );

    const columns = [
        {
            title: 'Позиция',
            key: 'item',
            render: (_, record) => (
                <div>
                    <Text strong>{record.brand} {record.oem}</Text>
                    <div><Text type="secondary">{record.name || '—'}</Text></div>
                </div>
            ),
        },
        {
            title: hint('Заказ', 'Что заказано у поставщика и по какой цене'),
            key: 'order',
            width: 110,
            render: (_, record) => (
                <div>
                    {labelled('Кол-во', record.quantity)}
                    {labelled('Цена', formatMoney(record.price))}
                </div>
            ),
        },
        {
            title: hint('По заказу клиента', 'Заказано клиентом / сколько подтверждено к отгрузке / подтверждённый отказ'),
            key: 'customer_qty',
            width: 150,
            render: (_, record) => (
                <div>
                    {labelled('Заказано', record.requested_qty ?? '—')}
                    {labelled('Отгрузка', record.ship_qty ?? '—')}
                    {labelled('Отказ', record.explicit_rejected_quantity ?? '—')}
                </div>
            ),
        },
        {
            title: 'Клиент / заказ',
            key: 'customer',
            width: 210,
            render: (_, record) => record.customer_order_id ? (
                <div>
                    <div>{record.customer_name || `Клиент #${record.customer_id}`}</div>
                    <a
                        href={`/customer-orders/${record.customer_order_id}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Заказ {record.customer_order_number || `#${record.customer_order_id}`}
                    </a>
                    <div><Text type="secondary">{formatDateTime(record.customer_received_at)}</Text></div>
                </div>
            ) : <Text type="secondary">Ручная позиция, без клиента</Text>,
        },
        {
            title: hint('Ответ поставщика', 'Состояние ответа и на каком основании оно выставлено'),
            key: 'response',
            width: 280,
            render: (_, record) => {
                const meta = RESPONSE_STATES[record.response_state] || RESPONSE_STATES.not_sent;
                return (
                    <div>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        <div>{RESPONSE_SOURCES[record.response_source] || (
                            ['overdue', 'partially_received_overdue'].includes(record.response_state)
                                ? 'Нет ответа по остатку к сроку' : null
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
                        {record.document_refusal_due_at && <div>Отказ по документу после: {formatDateTime(record.document_refusal_due_at)}</div>}
                    </div>
                );
            },
        },
        {
            title: hint('Сроки', 'Срок ответа — до какого времени поставщик должен ответить. Подтвердить без ответа — если к этому времени ответа нет, позиция считается подтверждённой автоматически. Ответ получен — когда пришёл ответ.'),
            key: 'dates',
            width: 230,
            render: (_, record) => (
                <div>
                    {labelled('Срок ответа', formatDateTime(record.response_due_at))}
                    {labelled('Авто-подтверждение', formatDateTime(record.auto_confirm_at))}
                    {labelled('Ответ получен', formatDateTime(record.response_at))}
                </div>
            ),
        },
        {
            title: 'Поступление',
            key: 'receipt',
            width: 150,
            render: (_, record) => record.received_quantity
                ? <div><div>{record.received_quantity} шт.</div>
                    <Text type="secondary">{formatDateTime(record.received_at)}</Text></div>
                : '—',
        },
        ...(editable ? [{
            title: 'Действия',
            key: 'actions',
            fixed: 'right',
            width: 160,
            render: (_, record) => (
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" onClick={() => openEditItem(record)}>Изменить</Button>
                    <Popconfirm
                        title="Удалить позицию?"
                        description={record.customer_order_id
                            ? 'Для связанной позиции заказа клиента будет зафиксирован отказ менеджера.'
                            : 'Ручная позиция будет удалена из заказа.'}
                        okText="Удалить"
                        cancelText="Отмена"
                        onConfirm={() => handleDeleteItem(record)}
                    >
                        <Button size="small" danger loading={deletingItemId === record.id}>Удалить</Button>
                    </Popconfirm>
                </div>
            ),
        }] : []),
    ];

    return (
        <div className="page-shell">
            <Card loading={loading}>
                <div className="page-header-actions" style={{ marginBottom: 16 }}>
                    <Button onClick={() => navigate(returnTo)}>
                        Назад к списку
                    </Button>
                    {editable && (
                        <Button onClick={openAddItem}>Добавить позицию</Button>
                    )}
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
                            scroll={{ x: 1000 }}
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
            <Modal
                title={editingItem ? 'Изменить позицию' : 'Добавить позицию'}
                open={editorOpen}
                onCancel={() => setEditorOpen(false)}
                onOk={handleSaveItem}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={savingItem}
                width={760}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Select
                        allowClear
                        showSearch
                        filterOption={false}
                        placeholder="Клиент и свежий заказ (необязательно)"
                        value={itemForm.customerOrderItemId || undefined}
                        loading={customerOptionsLoading}
                        onSearch={(search) => loadCustomerOptions({
                            search,
                            oem: itemForm.oem,
                            itemId: editingItem?.id,
                        })}
                        onChange={handleCustomerItemSelect}
                        options={customerOptions.map((row) => ({
                            value: row.item_id,
                            label: `${row.customer_name} · заказ ${row.order_number || `#${row.order_id}`} · ${row.brand} ${row.oem} · ${row.requested_qty} шт.`,
                        }))}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Input
                            placeholder="OEM"
                            value={itemForm.oem}
                            disabled={Boolean(editingItem)}
                            onChange={(event) => setItemForm((prev) => ({
                                ...prev, oem: event.target.value, brand: '', name: '', lookupResults: [],
                            }))}
                            onBlur={handleOemBlur}
                            style={{ width: 180 }}
                        />
                        {itemForm.lookupResults.length > 1 && !editingItem ? (
                            <Select
                                placeholder="Бренд"
                                value={itemForm.brand || undefined}
                                style={{ width: 200 }}
                                onChange={(brand) => {
                                    const match = itemForm.lookupResults.find((row) => row.brand === brand);
                                    setItemForm((prev) => ({
                                        ...prev, brand, name: match?.name || prev.name,
                                    }));
                                }}
                                options={itemForm.lookupResults.map((row) => ({
                                    value: row.brand,
                                    label: row.name ? `${row.brand} — ${row.name}` : row.brand,
                                }))}
                            />
                        ) : (
                            <Input
                                placeholder="Бренд"
                                value={itemForm.brand}
                                disabled={Boolean(editingItem)}
                                onChange={(event) => setItemForm((prev) => ({
                                    ...prev, brand: event.target.value,
                                }))}
                                style={{ width: 180 }}
                            />
                        )}
                        <Input
                            placeholder="Название"
                            value={itemForm.name}
                            disabled={Boolean(editingItem)}
                            onChange={(event) => setItemForm((prev) => ({
                                ...prev, name: event.target.value,
                            }))}
                            style={{ flex: 1, minWidth: 220 }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <InputNumber
                            min={1}
                            value={itemForm.quantity}
                            onChange={(quantity) => setItemForm((prev) => ({ ...prev, quantity }))}
                            addonBefore="Количество"
                        />
                        <InputNumber
                            min={0}
                            precision={2}
                            value={itemForm.price}
                            onChange={(price) => setItemForm((prev) => ({ ...prev, price }))}
                            addonBefore="Цена"
                            placeholder="Из прайса"
                        />
                    </div>
                    {!editingItem && itemForm.price === null && (
                        <Text type="secondary">
                            Цена будет взята из самого свежего активного прайса этого поставщика.
                            Если позиции там нет, система попросит указать цену вручную.
                        </Text>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default CustomerSupplierOrderDetailPage;
