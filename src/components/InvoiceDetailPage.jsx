import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Divider,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckOutlined,
    DeleteOutlined,
    EditOutlined,
    MailOutlined,
    PlusOutlined,
    PrinterOutlined,
    SaveOutlined,
    StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
    addInvoiceItem,
    createCustomerPayment,
    deleteCustomerPayment,
    deleteInvoice,
    deleteInvoiceItem,
    getInvoice,
    getInvoicePrintUrl,
    sendInvoiceEmail,
    updateInvoice,
} from '../api/finance';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
    draft:          'Черновик',
    sent:           'Выставлен',
    partially_paid: 'Частично оплачен',
    paid:           'Оплачен',
    cancelled:      'Аннулирован',
    overdue:        'Просрочен',
};
const STATUS_COLORS = {
    draft:          'default',
    sent:           'blue',
    partially_paid: 'orange',
    paid:           'green',
    cancelled:      'red',
    overdue:        'volcano',
};
const PAYMENT_METHOD_LABELS = {
    bank_transfer: 'Безналичный расчёт',
    cash:          'Наличные',
    card:          'Карта',
    offset:        'Взаимозачёт',
};

const fmt     = (v) => v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—';
const fmtDate = (d) => d ? dayjs(d).format('DD.MM.YYYY') : '—';

// ── Add Payment modal ─────────────────────────────────────────────────────────

const AddPaymentModal = ({ open, onClose, onSaved, invoice }) => {
    const [form]   = Form.useForm();
    const [saving, setSaving] = useState(false);

    const remaining = invoice
        ? Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount))
        : 0;

    useEffect(() => {
        if (open) {
            form.setFieldsValue({
                customer_id:    invoice?.customer_id,
                invoice_id:     invoice?.id,
                amount:         remaining > 0 ? remaining : undefined,
                payment_method: 'bank_transfer',
                payment_date:   dayjs(),
            });
        }
    }, [open, invoice, remaining, form]);

    const handleOk = async () => {
        try {
            const vals = await form.validateFields();
            setSaving(true);
            await createCustomerPayment({
                ...vals,
                payment_date: vals.payment_date?.format('YYYY-MM-DD'),
            });
            message.success('Оплата записана');
            form.resetFields();
            onSaved();
            onClose();
        } catch (err) {
            if (err?.errorFields) return;
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Добавить оплату"
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={460}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="customer_id" hidden><Input /></Form.Item>
                <Form.Item name="invoice_id"  hidden><Input /></Form.Item>
                <Form.Item name="amount" label="Сумма оплаты, ₽" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0.01} precision={2} step={100} />
                </Form.Item>
                <Form.Item name="payment_date" label="Дата" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="payment_method" label="Способ" rules={[{ required: true }]}>
                    <Select>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                            <Option key={k} value={k}>{v}</Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="reference" label="№ платёжного поручения">
                    <Input placeholder="Напр. п/п 124 от 12.05.2026" />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Edit modal ────────────────────────────────────────────────────────────────

const EditInvoiceModal = ({ open, onClose, onSaved, invoice }) => {
    const [form]   = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && invoice) {
            form.setFieldsValue({
                invoice_number: invoice.invoice_number,
                invoice_date:   invoice.invoice_date ? dayjs(invoice.invoice_date) : null,
                due_date:       invoice.due_date     ? dayjs(invoice.due_date)     : null,
                total_amount:   Number(invoice.total_amount),
                notes:          invoice.notes || '',
                status:         invoice.status,
            });
        }
    }, [open, invoice, form]);

    const handleOk = async () => {
        try {
            const vals = await form.validateFields();
            setSaving(true);
            await updateInvoice(invoice.id, {
                ...vals,
                invoice_date: vals.invoice_date?.format('YYYY-MM-DD'),
                due_date:     vals.due_date?.format('YYYY-MM-DD') || null,
            });
            message.success('Счёт обновлён');
            onSaved();
            onClose();
        } catch (err) {
            if (err?.errorFields) return;
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Редактировать счёт"
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText={<><SaveOutlined /> Сохранить</>}
            cancelText="Отмена"
            width={520}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="invoice_number" label="Номер счёта" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="invoice_date" label="Дата счёта" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="due_date" label="Срок оплаты">
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="total_amount" label="Сумма, ₽" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} step={100} />
                </Form.Item>
                <Form.Item name="status" label="Статус">
                    <Select>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <Option key={k} value={k}>{v}</Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={3} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Send Email modal ──────────────────────────────────────────────────────────

const SendEmailModal = ({ open, onClose, invoice }) => {
    const [email,   setEmail]   = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (open && invoice?.customer?.email_contact) {
            setEmail(invoice.customer.email_contact);
        }
    }, [open, invoice]);

    const handleSend = async () => {
        setSending(true);
        try {
            await sendInvoiceEmail(invoice.id, email || null);
            message.success('Счёт отправлен' + (email ? ` на ${email}` : ''));
            onClose();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка отправки');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            title={`Отправить счёт № ${invoice?.invoice_number}`}
            open={open}
            onCancel={onClose}
            onOk={handleSend}
            confirmLoading={sending}
            okText={<><MailOutlined /> Отправить</>}
            cancelText="Отмена"
        >
            <p style={{ marginBottom: 12, color: '#6b7280' }}>
                Счёт будет отправлен по email в виде красиво отформатированного
                HTML-письма. Клиент может сохранить его как PDF прямо из браузера.
            </p>
            <Input
                placeholder="Email получателя (оставьте пустым для email из карточки клиента)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                prefix={<MailOutlined />}
            />
            {invoice?.customer?.email_contact && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                    Email клиента: {invoice.customer.email_contact}
                </Text>
            )}
        </Modal>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const InvoiceDetailPage = () => {
    const { invoiceId }              = useParams();
    const navigate                   = useNavigate();
    const [invoice,    setInvoice]   = useState(null);
    const [loading,    setLoading]   = useState(true);
    const [showEdit,      setShowEdit]      = useState(false);
    const [showPay,       setShowPay]       = useState(false);
    const [showEmail,     setShowEmail]     = useState(false);
    const [showAddItem,   setShowAddItem]   = useState(false);
    const [itemForm]                        = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getInvoice(invoiceId);
            setInvoice(res.data);
        } catch {
            message.error('Счёт не найден');
            navigate('/finance');
        } finally {
            setLoading(false);
        }
    }, [invoiceId, navigate]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async () => {
        try {
            await deleteInvoice(invoice.id);
            message.success('Счёт удалён');
            navigate('/finance');
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Нельзя удалить');
        }
    };

    const handleQuickStatus = async (newStatus) => {
        try {
            await updateInvoice(invoice.id, { status: newStatus });
            message.success('Статус обновлён');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const handleDeletePayment = async (payId) => {
        try {
            await deleteCustomerPayment(payId);
            message.success('Оплата удалена');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
    if (!invoice) return null;

    const total    = Number(invoice.total_amount) || 0;
    const paid     = Number(invoice.paid_amount)  || 0;
    const debt     = Math.max(0, total - paid);
    const isOverdue = invoice.due_date
        && invoice.status !== 'paid'
        && invoice.status !== 'cancelled'
        && dayjs(invoice.due_date).isBefore(dayjs(), 'day');

    const paymentColumns = [
        { title: 'Дата',    dataIndex: 'payment_date',   render: fmtDate },
        { title: 'Сумма',   dataIndex: 'amount',         render: (v) => <Text strong>{fmt(v)} ₽</Text>, align: 'right' },
        { title: 'Способ',  dataIndex: 'payment_method', render: (v) => PAYMENT_METHOD_LABELS[v] || v },
        { title: '№ п/п',   dataIndex: 'reference',      render: (v) => v || '—' },
        { title: 'Примечание', dataIndex: 'notes',       ellipsis: true, render: (v) => v || '—' },
        {
            title: '',
            width: 50,
            render: (_, rec) => (
                <Popconfirm title="Удалить запись об оплате?" onConfirm={() => handleDeletePayment(rec.id)}
                    okText="Да" cancelText="Нет">
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Top bar */}
            <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/finance')}>
                        Назад
                    </Button>
                    <Title level={4} style={{ margin: 0 }}>
                        Счёт на оплату № {invoice.invoice_number}
                        <Tag color={STATUS_COLORS[invoice.status]} style={{ marginLeft: 10 }}>
                            {STATUS_LABELS[invoice.status] || invoice.status}
                        </Tag>
                    </Title>
                </Space>
                <Space wrap>
                    {/* Quick status actions */}
                    {invoice.status === 'draft' && (
                        <Button icon={<CheckOutlined />}
                            onClick={() => handleQuickStatus('sent')}>
                            Выставить клиенту
                        </Button>
                    )}
                    {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                        <Popconfirm title="Аннулировать счёт?" onConfirm={() => handleQuickStatus('cancelled')}
                            okText="Да" cancelText="Нет">
                            <Button icon={<StopOutlined />} danger>Аннулировать</Button>
                        </Popconfirm>
                    )}
                    <Divider type="vertical" />
                    <Tooltip title="Открыть версию для печати / сохранить PDF">
                        <Button icon={<PrinterOutlined />}
                            onClick={() => window.open(getInvoicePrintUrl(invoice.id), '_blank')}>
                            Печать / PDF
                        </Button>
                    </Tooltip>
                    <Button icon={<MailOutlined />} onClick={() => setShowEmail(true)}>
                        Отправить по email
                    </Button>
                    <Divider type="vertical" />
                    <Button icon={<EditOutlined />} onClick={() => setShowEdit(true)}>
                        Редактировать
                    </Button>
                    {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
                        <Popconfirm title="Удалить счёт?" onConfirm={handleDelete}
                            okText="Удалить" okButtonProps={{ danger: true }} cancelText="Нет">
                            <Button danger icon={<DeleteOutlined />}>Удалить</Button>
                        </Popconfirm>
                    )}
                </Space>
            </Space>

            {isOverdue && (
                <Alert
                    type="error"
                    showIcon
                    message={`Счёт просрочен — срок оплаты истёк ${fmtDate(invoice.due_date)}`}
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Details grid */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} md={12}>
                    <Card size="small" title="Реквизиты счёта">
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="Клиент">
                                <Text strong>{invoice.customer?.name || `#${invoice.customer_id}`}</Text>
                            </Descriptions.Item>
                            {invoice.customer?.inn && (
                                <Descriptions.Item label="ИНН">
                                    {invoice.customer.inn}
                                </Descriptions.Item>
                            )}
                            {invoice.customer?.email_contact && (
                                <Descriptions.Item label="Email">
                                    <a href={`mailto:${invoice.customer.email_contact}`}>
                                        {invoice.customer.email_contact}
                                    </a>
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Дата счёта">
                                {fmtDate(invoice.invoice_date)}
                            </Descriptions.Item>
                            {invoice.due_date && (
                                <Descriptions.Item label="Срок оплаты">
                                    <Text style={isOverdue ? { color: '#c0392b', fontWeight: 600 } : {}}>
                                        {fmtDate(invoice.due_date)}
                                        {isOverdue && ' ⚠ просрочен'}
                                    </Text>
                                </Descriptions.Item>
                            )}
                            {invoice.shipment_id && (
                                <Descriptions.Item label="Накладная">
                                    #{invoice.shipment_id}
                                </Descriptions.Item>
                            )}
                            {invoice.customer_order_id && (
                                <Descriptions.Item label="Заказ клиента">
                                    <Button type="link" style={{ padding: 0 }}
                                        onClick={() => navigate(`/customer-orders/${invoice.customer_order_id}`)}>
                                        #{invoice.customer_order_id}
                                    </Button>
                                </Descriptions.Item>
                            )}
                            {invoice.notes && (
                                <Descriptions.Item label="Примечание">
                                    {invoice.notes}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card size="small" title="Финансовый итог">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                                <Text>Сумма по счёту:</Text>
                                <Text strong style={{ fontSize: 15 }}>{fmt(total)} ₽</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                                <Text style={{ color: '#27ae60' }}>Оплачено:</Text>
                                <Text strong style={{ color: '#27ae60', fontSize: 15 }}>{fmt(paid)} ₽</Text>
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '10px 12px',
                                background: debt > 0 ? '#fff1f0' : '#f6ffed',
                                borderRadius: 6,
                            }}>
                                <Text strong style={{ color: debt > 0 ? '#c0392b' : '#27ae60' }}>
                                    {debt > 0 ? 'Остаток к оплате:' : 'Полностью оплачен ✓'}
                                </Text>
                                {debt > 0 && (
                                    <Text strong style={{ color: '#c0392b', fontSize: 16 }}>
                                        {fmt(debt)} ₽
                                    </Text>
                                )}
                            </div>
                            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && debt > 0 && (
                                <Button type="primary" icon={<PlusOutlined />}
                                    onClick={() => setShowPay(true)} style={{ marginTop: 4 }}>
                                    Добавить оплату
                                </Button>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Invoice items */}
            {invoice.items && invoice.items.length > 0 && (
                <Card
                    size="small"
                    title={`Позиции счёта (${invoice.items.length})`}
                    style={{ marginBottom: 16 }}
                    extra={
                        invoice.status === 'draft' && (
                            <Button size="small" icon={<PlusOutlined />}
                                onClick={() => setShowAddItem(true)}>
                                Добавить
                            </Button>
                        )
                    }
                >
                    <Table
                        rowKey="id"
                        size="small"
                        dataSource={invoice.items}
                        pagination={false}
                        columns={[
                            { title: '№', dataIndex: 'position', width: 40, align: 'center' },
                            { title: 'Наименование', dataIndex: 'name', ellipsis: true,
                              render: (v, rec) => rec.oem_number ? `${v} (${rec.oem_number})` : v },
                            { title: 'Кол-во', dataIndex: 'quantity', align: 'right',
                              render: (v) => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }) },
                            { title: 'Цена', dataIndex: 'unit_price', align: 'right',
                              render: (v) => `${fmt(v)} ₽` },
                            { title: 'НДС %', dataIndex: 'vat_rate', align: 'right',
                              render: (v) => `${Number(v)}%` },
                            { title: 'Итого', dataIndex: 'total', align: 'right',
                              render: (v) => <Text strong>{fmt(v)} ₽</Text> },
                            invoice.status === 'draft' ? {
                                title: '',
                                width: 50,
                                render: (_, rec) => (
                                    <Popconfirm title="Удалить позицию?"
                                        onConfirm={async () => {
                                            await deleteInvoiceItem(invoice.id, rec.id);
                                            load();
                                        }}
                                        okText="Да" cancelText="Нет">
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                ),
                            } : { width: 0 },
                        ]}
                        summary={(data) => {
                            const total = data.reduce((s, r) => s + Number(r.total || 0), 0);
                            return (
                                <Table.Summary.Row>
                                    <Table.Summary.Cell colSpan={5} align="right">
                                        <Text strong>Итого:</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell align="right">
                                        <Text strong style={{ fontSize: 14 }}>{fmt(total)} ₽</Text>
                                    </Table.Summary.Cell>
                                    {invoice.status === 'draft' && <Table.Summary.Cell />}
                                </Table.Summary.Row>
                            );
                        }}
                    />
                </Card>
            )}
            {invoice.status === 'draft' && (!invoice.items || invoice.items.length === 0) && (
                <Card size="small" style={{ marginBottom: 16, borderStyle: 'dashed' }}>
                    <Space>
                        <Text type="secondary">Позиции счёта не добавлены.</Text>
                        <Button size="small" icon={<PlusOutlined />} onClick={() => setShowAddItem(true)}>
                            Добавить позицию
                        </Button>
                    </Space>
                </Card>
            )}

            {/* Add item modal */}
            <Modal
                title="Добавить позицию"
                open={showAddItem}
                onCancel={() => { setShowAddItem(false); itemForm.resetFields(); }}
                onOk={async () => {
                    try {
                        const vals = await itemForm.validateFields();
                        await addInvoiceItem(invoice.id, vals);
                        message.success('Позиция добавлена');
                        itemForm.resetFields();
                        setShowAddItem(false);
                        load();
                    } catch (err) {
                        if (err?.errorFields) return;
                        message.error(err?.response?.data?.detail || 'Ошибка');
                    }
                }}
                okText="Добавить"
                cancelText="Отмена"
                width={480}
                destroyOnClose
            >
                <Form form={itemForm} layout="vertical" style={{ marginTop: 8 }}>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
                        <Input placeholder="Название запчасти или услуги" />
                    </Form.Item>
                    <Form.Item name="oem_number" label="OEM номер">
                        <Input placeholder="Артикул" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item name="quantity" label="Кол-во" rules={[{ required: true }]}
                                initialValue={1}>
                                <InputNumber style={{ width: '100%' }} min={0.001} precision={3} step={1} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="unit_price" label="Цена, ₽" rules={[{ required: true }]}
                                initialValue={0}>
                                <InputNumber style={{ width: '100%' }} min={0} precision={2} step={100} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="vat_rate" label="НДС %" initialValue={20}>
                                <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* Payments list */}
            <Card
                size="small"
                title={`Оплаты по счёту (${invoice.payments?.length || 0})`}
                extra={
                    invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                        <Button size="small" type="primary" icon={<PlusOutlined />}
                            onClick={() => setShowPay(true)}>
                            Добавить
                        </Button>
                    )
                }
            >
                {invoice.payments && invoice.payments.length > 0 ? (
                    <Table
                        rowKey="id"
                        size="small"
                        dataSource={invoice.payments}
                        columns={paymentColumns}
                        pagination={false}
                    />
                ) : (
                    <Text type="secondary">Оплат по этому счёту нет</Text>
                )}
            </Card>

            {/* Modals */}
            <EditInvoiceModal
                open={showEdit}
                onClose={() => setShowEdit(false)}
                onSaved={load}
                invoice={invoice}
            />
            <AddPaymentModal
                open={showPay}
                onClose={() => setShowPay(false)}
                onSaved={load}
                invoice={invoice}
            />
            <SendEmailModal
                open={showEmail}
                onClose={() => setShowEmail(false)}
                invoice={invoice}
            />
        </div>
    );
};

export default InvoiceDetailPage;
