import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    BankOutlined,
    DeleteOutlined,
    DollarOutlined,
    EditOutlined,
    MailOutlined,
    PlusOutlined,
    PrinterOutlined,
    ReloadOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import BankStatementsTab from './BankStatementsTab';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
    createCustomerPayment,
    createInvoice,
    createSupplierPayment,
    deleteCustomerPayment,
    deleteInvoice,
    deleteSupplierPayment,
    getCreditorsReport,
    getDebtorsReport,
    getInvoicePrintUrl,
    listCustomerPayments,
    listInvoices,
    listSupplierPayments,
    sendInvoiceEmail,
    updateInvoice,
} from '../api/finance';
import { getCustomers } from '../api/customers';
import { getProviders } from '../api/providers';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v) =>
    v != null
        ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
        : '—';

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');

const INVOICE_STATUS_LABELS = {
    draft:          'Черновик',
    sent:           'Выставлен',
    partially_paid: 'Частично',
    paid:           'Оплачен',
    cancelled:      'Аннулирован',
    overdue:        'Просрочен',
};
const INVOICE_STATUS_COLORS = {
    draft:          'default',
    sent:           'blue',
    partially_paid: 'orange',
    paid:           'green',
    cancelled:      'red',
    overdue:        'volcano',
};
const PAYMENT_METHOD_LABELS = {
    bank_transfer: 'Безнал',
    cash:          'Наличные',
    card:          'Карта',
    offset:        'Взаимозачёт',
};

// ── Invoice modal ─────────────────────────────────────────────────────────────

const InvoiceModal = ({ open, onClose, onSaved, customers }) => {
    const [form]   = Form.useForm();
    const [saving, setSaving] = useState(false);

    const handleOk = async () => {
        try {
            const vals = await form.validateFields();
            setSaving(true);
            await createInvoice({
                ...vals,
                invoice_date: vals.invoice_date?.format('YYYY-MM-DD'),
                due_date:     vals.due_date?.format('YYYY-MM-DD') || null,
                total_amount: vals.total_amount,
            });
            message.success('Счёт создан');
            form.resetFields();
            onSaved();
            onClose();
        } catch (err) {
            if (err?.errorFields) return; // validation
            const msg = err?.response?.data?.detail || 'Ошибка создания счёта';
            message.error(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Новый счёт на оплату"
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText="Создать"
            cancelText="Отмена"
            width={540}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="customer_id" label="Клиент" rules={[{ required: true }]}>
                    <Select
                        showSearch
                        placeholder="Выберите клиента"
                        filterOption={(input, opt) =>
                            opt.children.toLowerCase().includes(input.toLowerCase())
                        }
                    >
                        {customers.map((c) => (
                            <Option key={c.id} value={c.id}>{c.name}</Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="invoice_number" label="Номер счёта" rules={[{ required: true }]}>
                    <Input placeholder="Напр. С-2026-001" />
                </Form.Item>
                <Form.Item name="invoice_date" label="Дата счёта" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="due_date" label="Срок оплаты">
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="total_amount" label="Сумма, ₽" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} step={100} />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Customer Payment modal ────────────────────────────────────────────────────

const CustomerPaymentModal = ({ open, onClose, onSaved, customers, invoiceId, customerId }) => {
    const [form]   = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            form.setFieldsValue({
                customer_id:    customerId || undefined,
                invoice_id:     invoiceId  || undefined,
                payment_method: 'bank_transfer',
                payment_date:   dayjs(),
            });
        }
    }, [open, customerId, invoiceId, form]);

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
            title="Оплата от клиента"
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={480}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="customer_id" label="Клиент" rules={[{ required: true }]}>
                    <Select showSearch placeholder="Клиент"
                        filterOption={(i, o) => o.children.toLowerCase().includes(i.toLowerCase())}>
                        {customers.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="invoice_id" label="Счёт (необязательно)">
                    <InputNumber style={{ width: '100%' }} placeholder="ID счёта" min={1} />
                </Form.Item>
                <Form.Item name="amount" label="Сумма, ₽" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0.01} precision={2} step={100} />
                </Form.Item>
                <Form.Item name="payment_date" label="Дата" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="payment_method" label="Способ оплаты" rules={[{ required: true }]}>
                    <Select>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                            <Option key={k} value={k}>{v}</Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="reference" label="№ платёжного поручения">
                    <Input />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Supplier Payment modal ────────────────────────────────────────────────────

const SupplierPaymentModal = ({ open, onClose, onSaved, providers }) => {
    const [form]   = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            form.setFieldsValue({ payment_method: 'bank_transfer', payment_date: dayjs() });
        }
    }, [open, form]);

    const handleOk = async () => {
        try {
            const vals = await form.validateFields();
            setSaving(true);
            await createSupplierPayment({
                ...vals,
                payment_date: vals.payment_date?.format('YYYY-MM-DD'),
            });
            message.success('Оплата поставщику записана');
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
            title="Оплата поставщику"
            open={open}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={480}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="provider_id" label="Поставщик" rules={[{ required: true }]}>
                    <Select showSearch placeholder="Поставщик"
                        filterOption={(i, o) => o.children.toLowerCase().includes(i.toLowerCase())}>
                        {providers.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="amount" label="Сумма, ₽" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0.01} precision={2} step={100} />
                </Form.Item>
                <Form.Item name="payment_date" label="Дата" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>
                <Form.Item name="payment_method" label="Способ оплаты" rules={[{ required: true }]}>
                    <Select>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                            <Option key={k} value={k}>{v}</Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="reference" label="№ п/п">
                    <Input />
                </Form.Item>
                <Form.Item name="notes" label="Примечание">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Send email modal ──────────────────────────────────────────────────────────

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
            message.success('Счёт отправлен на ' + (email || 'email клиента'));
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
            okText="Отправить"
            cancelText="Отмена"
        >
            <p style={{ marginBottom: 12, color: '#555' }}>
                Счёт будет отправлен по email в виде HTML-письма.
                Если оставить поле пустым — будет использован email из карточки клиента.
            </p>
            <Input
                placeholder="Email получателя"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                prefix={<MailOutlined />}
            />
        </Modal>
    );
};

// ── Invoices tab ──────────────────────────────────────────────────────────────

const InvoicesTab = ({ customers }) => {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [sendModal,  setSendModal]  = useState({ open: false, invoice: null });
    const [filters,   setFilters]    = useState({ status: null, customer_id: null });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.status)      params.status      = filters.status;
            if (filters.customer_id) params.customer_id = filters.customer_id;
            const res = await listInvoices(params);
            setInvoices(res.data);
        } catch {
            message.error('Ошибка загрузки счетов');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (id) => {
        try {
            await deleteInvoice(id);
            message.success('Счёт удалён');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка удаления');
        }
    };

    const handleStatusChange = async (invoice, newStatus) => {
        try {
            await updateInvoice(invoice.id, { status: newStatus });
            message.success('Статус обновлён');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const columns = [
        {
            title: '№ счёта',
            dataIndex: 'invoice_number',
            render: (v, rec) => (
                <Button type="link" style={{ padding: 0 }}
                    onClick={() => navigate(`/finance/invoices/${rec.id}`)}>
                    {v}
                </Button>
            ),
        },
        {
            title: 'Клиент',
            dataIndex: 'customer_name',
            ellipsis: true,
        },
        {
            title: 'Дата',
            dataIndex: 'invoice_date',
            render: fmtDate,
            sorter: (a, b) => (a.invoice_date || '').localeCompare(b.invoice_date || ''),
            defaultSortOrder: 'descend',
        },
        {
            title: 'До',
            dataIndex: 'due_date',
            render: (v, rec) => {
                if (!v) return '—';
                const overdue = rec.status !== 'paid' && rec.status !== 'cancelled' && dayjs(v).isBefore(dayjs(), 'day');
                return (
                    <span style={overdue ? { color: '#c0392b', fontWeight: 600 } : {}}>
                        {fmtDate(v)}{overdue && ' ⚠'}
                    </span>
                );
            },
        },
        {
            title: 'Сумма',
            dataIndex: 'total_amount',
            render: (v) => <Text strong>{fmt(v)} ₽</Text>,
            align: 'right',
        },
        {
            title: 'Оплачено',
            render: (_, rec) => {
                const total = Number(rec.total_amount) || 0;
                const paid  = Number(rec.paid_amount)  || 0;
                const pct   = total > 0 ? Math.round((paid / total) * 100) : 0;
                return (
                    <div style={{ minWidth: 110 }}>
                        <Text style={{ fontSize: 12 }}>{fmt(paid)} ₽</Text>
                        <Progress percent={pct} size="small" showInfo={false}
                            strokeColor={pct === 100 ? '#52c41a' : '#1677ff'} />
                    </div>
                );
            },
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            render: (v) => (
                <Tag color={INVOICE_STATUS_COLORS[v] || 'default'}>
                    {INVOICE_STATUS_LABELS[v] || v}
                </Tag>
            ),
            filters: Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => ({ text: v, value: k })),
            onFilter: (value, rec) => rec.status === value,
        },
        {
            title: '',
            width: 140,
            render: (_, rec) => (
                <Space size={4}>
                    <Tooltip title="Печать / PDF">
                        <Button size="small" icon={<PrinterOutlined />}
                            onClick={() => window.open(getInvoicePrintUrl(rec.id), '_blank')} />
                    </Tooltip>
                    <Tooltip title="Отправить по email">
                        <Button size="small" icon={<MailOutlined />}
                            onClick={() => setSendModal({ open: true, invoice: rec })} />
                    </Tooltip>
                    <Tooltip title="Открыть">
                        <Button size="small" icon={<EditOutlined />}
                            onClick={() => navigate(`/finance/invoices/${rec.id}`)} />
                    </Tooltip>
                    {(rec.status === 'draft' || rec.status === 'cancelled') && (
                        <Popconfirm title="Удалить счёт?" onConfirm={() => handleDelete(rec.id)}
                            okText="Да" cancelText="Нет">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
                    Новый счёт
                </Button>
                <Select allowClear placeholder="Фильтр по статусу" style={{ width: 180 }}
                    value={filters.status}
                    onChange={(v) => setFilters((f) => ({ ...f, status: v || null }))}>
                    {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                        <Option key={k} value={k}>{v}</Option>
                    ))}
                </Select>
                <Select allowClear showSearch placeholder="Фильтр по клиенту" style={{ width: 200 }}
                    value={filters.customer_id}
                    onChange={(v) => setFilters((f) => ({ ...f, customer_id: v || null }))}
                    filterOption={(i, o) => o.children.toLowerCase().includes(i.toLowerCase())}>
                    {customers.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Select>
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
            </Space>

            <Table
                rowKey="id"
                size="small"
                loading={loading}
                dataSource={invoices}
                columns={columns}
                pagination={{ pageSize: 25, showSizeChanger: true }}
            />

            <InvoiceModal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                onSaved={load}
                customers={customers}
            />

            {sendModal.invoice && (
                <SendEmailModal
                    open={sendModal.open}
                    onClose={() => setSendModal({ open: false, invoice: null })}
                    invoice={sendModal.invoice}
                />
            )}
        </>
    );
};

// ── Customer Payments tab ─────────────────────────────────────────────────────

const CustomerPaymentsTab = ({ customers }) => {
    const [payments, setPayments] = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [showModal, setShowModal] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listCustomerPayments({ limit: 200 });
            setPayments(res.data);
        } catch { message.error('Ошибка загрузки'); }
        finally  { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (id) => {
        try {
            await deleteCustomerPayment(id);
            message.success('Оплата удалена');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const columns = [
        { title: 'Клиент',   dataIndex: 'customer_name', ellipsis: true },
        { title: 'Счёт',     dataIndex: 'invoice_id',
          render: (v) => v ? <Text style={{ color: '#1677ff' }}>#{v}</Text> : <Text type="secondary">Аванс</Text> },
        { title: 'Сумма',    dataIndex: 'amount',
          render: (v) => <Text strong>{fmt(v)} ₽</Text>, align: 'right' },
        { title: 'Дата',     dataIndex: 'payment_date', render: fmtDate,
          sorter: (a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''),
          defaultSortOrder: 'descend' },
        { title: 'Способ',   dataIndex: 'payment_method',
          render: (v) => PAYMENT_METHOD_LABELS[v] || v },
        { title: '№ п/п',    dataIndex: 'reference', ellipsis: true,
          render: (v) => v || '—' },
        {
            title: '',
            width: 60,
            render: (_, rec) => (
                <Popconfirm title="Удалить запись об оплате?" onConfirm={() => handleDelete(rec.id)}
                    okText="Да" cancelText="Нет">
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowModal(true)}>
                    Записать оплату
                </Button>
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
            </Space>
            <Table rowKey="id" size="small" loading={loading}
                dataSource={payments} columns={columns}
                pagination={{ pageSize: 25, showSizeChanger: true }} />
            <CustomerPaymentModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onSaved={load}
                customers={customers}
            />
        </>
    );
};

// ── Supplier Payments tab ─────────────────────────────────────────────────────

const SupplierPaymentsTab = ({ providers }) => {
    const [payments, setPayments] = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [showModal, setShowModal] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listSupplierPayments({ limit: 200 });
            setPayments(res.data);
        } catch { message.error('Ошибка загрузки'); }
        finally  { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (id) => {
        try {
            await deleteSupplierPayment(id);
            message.success('Оплата удалена');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const columns = [
        { title: 'Поставщик', dataIndex: 'provider_name', ellipsis: true },
        { title: 'Заказ',     dataIndex: 'supplier_order_id',
          render: (v) => v ? `#${v}` : '—' },
        { title: 'Сумма',     dataIndex: 'amount',
          render: (v) => <Text strong>{fmt(v)} ₽</Text>, align: 'right' },
        { title: 'Дата',      dataIndex: 'payment_date', render: fmtDate,
          sorter: (a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''),
          defaultSortOrder: 'descend' },
        { title: 'Способ',    dataIndex: 'payment_method',
          render: (v) => PAYMENT_METHOD_LABELS[v] || v },
        { title: '№ п/п',     dataIndex: 'reference', ellipsis: true,
          render: (v) => v || '—' },
        {
            title: '',
            width: 60,
            render: (_, rec) => (
                <Popconfirm title="Удалить?" onConfirm={() => handleDelete(rec.id)}
                    okText="Да" cancelText="Нет">
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowModal(true)}>
                    Записать оплату
                </Button>
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
            </Space>
            <Table rowKey="id" size="small" loading={loading}
                dataSource={payments} columns={columns}
                pagination={{ pageSize: 25, showSizeChanger: true }} />
            <SupplierPaymentModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onSaved={load}
                providers={providers}
            />
        </>
    );
};

// ── Debtors tab ───────────────────────────────────────────────────────────────

const DebtorsTab = ({ customers }) => {
    const [debtors,     setDebtors]     = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [onlyOverdue, setOnlyOverdue] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getDebtorsReport(onlyOverdue);
            setDebtors(res.data);
        } catch { message.error('Ошибка загрузки'); }
        finally  { setLoading(false); }
    }, [onlyOverdue]);

    useEffect(() => { load(); }, [load]);

    const totalDebt = debtors.reduce((s, d) => s + Number(d.debt || 0), 0);
    const totalOverdue = debtors.reduce((s, d) => s + Number(d.overdue_amount || 0), 0);

    const columns = [
        { title: 'Клиент', dataIndex: 'customer_name', ellipsis: true,
          sorter: (a, b) => a.customer_name.localeCompare(b.customer_name) },
        { title: 'Выставлено', dataIndex: 'total_invoiced',
          render: (v) => `${fmt(v)} ₽`, align: 'right' },
        { title: 'Оплачено', dataIndex: 'total_paid',
          render: (v) => <Text style={{ color: '#27ae60' }}>{fmt(v)} ₽</Text>, align: 'right' },
        {
            title: 'Долг',
            dataIndex: 'debt',
            render: (v) => <Text strong style={{ color: '#c0392b' }}>{fmt(v)} ₽</Text>,
            align: 'right',
            sorter: (a, b) => Number(a.debt) - Number(b.debt),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Просрочено',
            dataIndex: 'overdue_amount',
            render: (v) =>
                Number(v) > 0
                    ? <Tag icon={<WarningOutlined />} color="volcano">{fmt(v)} ₽</Tag>
                    : <Text type="secondary">—</Text>,
            align: 'right',
        },
        {
            title: 'Лимит',
            dataIndex: 'credit_limit',
            render: (v, rec) => {
                if (!v) return <Text type="secondary">Нет</Text>;
                const usage = Math.min(100, Math.round((Number(rec.debt) / Number(v)) * 100));
                return (
                    <div style={{ minWidth: 110 }}>
                        <Text style={{ fontSize: 12 }}>{fmt(v)} ₽</Text>
                        <Progress percent={usage} size="small" showInfo={false}
                            strokeColor={usage >= 90 ? '#ff4d4f' : usage >= 70 ? '#faad14' : '#52c41a'} />
                    </div>
                );
            },
        },
        { title: 'Отсрочка', dataIndex: 'payment_terms_days',
          render: (v) => v ? `${v} дн.` : '—', align: 'center' },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <Button
                    type={onlyOverdue ? 'primary' : 'default'}
                    danger={onlyOverdue}
                    icon={<WarningOutlined />}
                    onClick={() => setOnlyOverdue((v) => !v)}
                >
                    {onlyOverdue ? 'Только просроченные' : 'Все должники'}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
                {debtors.length > 0 && (
                    <Space size={16} style={{ marginLeft: 16 }}>
                        <Text>
                            Общий долг: <Text strong style={{ color: '#c0392b' }}>{fmt(totalDebt)} ₽</Text>
                        </Text>
                        {totalOverdue > 0 && (
                            <Text>
                                Просрочено: <Text strong style={{ color: '#cf1322' }}>{fmt(totalOverdue)} ₽</Text>
                            </Text>
                        )}
                    </Space>
                )}
            </Space>

            {debtors.length === 0 && !loading && (
                <Alert
                    type="success"
                    message={onlyOverdue ? 'Нет просроченных задолженностей' : 'Нет дебиторов'}
                    showIcon
                    style={{ marginBottom: 12 }}
                />
            )}

            <Table
                rowKey="customer_id"
                size="small"
                loading={loading}
                dataSource={debtors}
                columns={columns}
                pagination={{ pageSize: 25 }}
                rowClassName={(rec) => Number(rec.overdue_amount) > 0 ? 'ant-table-row-warning' : ''}
            />
        </>
    );
};

// ── Creditors tab ─────────────────────────────────────────────────────────────

const CreditorsTab = () => {
    const [creditors, setCreditors] = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [onlyOwed,  setOnlyOwed]  = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getCreditorsReport(onlyOwed);
            setCreditors(res.data);
        } catch { message.error('Ошибка загрузки кредиторов'); }
        finally  { setLoading(false); }
    }, [onlyOwed]);

    useEffect(() => { load(); }, [load]);

    const totalOwed    = creditors.reduce((s, r) => s + Number(r.owed    || 0), 0);
    const totalOrdered = creditors.reduce((s, r) => s + Number(r.total_ordered || 0), 0);
    const totalPaid    = creditors.reduce((s, r) => s + Number(r.total_paid    || 0), 0);

    const columns = [
        { title: 'Поставщик', dataIndex: 'provider_name', ellipsis: true,
          sorter: (a, b) => a.provider_name.localeCompare(b.provider_name) },
        { title: 'Заказано', dataIndex: 'total_ordered',
          render: (v) => `${fmt(v)} ₽`, align: 'right' },
        { title: 'Оплачено', dataIndex: 'total_paid',
          render: (v) => <Text style={{ color: '#27ae60' }}>{fmt(v)} ₽</Text>, align: 'right' },
        {
            title: 'К оплате',
            dataIndex: 'owed',
            render: (v) =>
                Number(v) > 0
                    ? <Text strong style={{ color: '#c0392b' }}>{fmt(v)} ₽</Text>
                    : <Text type="secondary">—</Text>,
            align: 'right',
            sorter: (a, b) => Number(a.owed) - Number(b.owed),
            defaultSortOrder: 'descend',
        },
        { title: 'Посл. оплата', dataIndex: 'last_payment_date',
          render: fmtDate, align: 'center' },
        { title: 'Отсрочка', dataIndex: 'payment_terms_days',
          render: (v) => v ? `${v} дн.` : '—', align: 'center' },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <Button
                    type={onlyOwed ? 'primary' : 'default'}
                    danger={onlyOwed}
                    icon={<WarningOutlined />}
                    onClick={() => setOnlyOwed((v) => !v)}
                >
                    {onlyOwed ? 'Только с долгом' : 'Все поставщики'}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
                {creditors.length > 0 && (
                    <Space size={16} style={{ marginLeft: 16 }}>
                        <Text>Заказано: <Text strong>{fmt(totalOrdered)} ₽</Text></Text>
                        <Text>Оплачено: <Text strong style={{ color: '#27ae60' }}>{fmt(totalPaid)} ₽</Text></Text>
                        {totalOwed > 0 && (
                            <Text>К оплате: <Text strong style={{ color: '#c0392b' }}>{fmt(totalOwed)} ₽</Text></Text>
                        )}
                    </Space>
                )}
            </Space>

            {creditors.length === 0 && !loading && (
                <Alert
                    type="info"
                    message={onlyOwed ? 'Нет задолженностей перед поставщиками' : 'Нет данных по поставщикам'}
                    showIcon
                    style={{ marginBottom: 12 }}
                />
            )}

            <Table
                rowKey="provider_id"
                size="small"
                loading={loading}
                dataSource={creditors}
                columns={columns}
                pagination={{ pageSize: 25 }}
                rowClassName={(rec) => Number(rec.owed) > 0 ? 'ant-table-row-warning' : ''}
            />
        </>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const FinancePage = () => {
    const [customers,  setCustomers]  = useState([]);
    const [providers,  setProviders]  = useState([]);
    const [loadingRef, setLoadingRef] = useState(false);

    useEffect(() => {
        const fetchRef = async () => {
            setLoadingRef(true);
            try {
                const [cRes, pRes] = await Promise.all([
                    getCustomers(),
                    getProviders(),
                ]);
                setCustomers(cRes.data || []);
                setProviders(pRes.data || []);
            } catch {
                message.error('Ошибка загрузки справочников');
            } finally {
                setLoadingRef(false);
            }
        };
        fetchRef();
    }, []);

    const tabs = [
        {
            key:      'invoices',
            label:    <span><DollarOutlined /> Счета на оплату</span>,
            children: loadingRef
                ? <Spin />
                : <InvoicesTab customers={customers} />,
        },
        {
            key:      'customer-payments',
            label:    'Оплаты от клиентов',
            children: loadingRef
                ? <Spin />
                : <CustomerPaymentsTab customers={customers} />,
        },
        {
            key:      'supplier-payments',
            label:    'Оплаты поставщикам',
            children: loadingRef
                ? <Spin />
                : <SupplierPaymentsTab providers={providers} />,
        },
        {
            key:      'debtors',
            label:    <span><WarningOutlined style={{ color: '#c0392b' }} /> Дебиторка</span>,
            children: <DebtorsTab customers={customers} />,
        },
        {
            key:      'creditors',
            label:    <span><WarningOutlined style={{ color: '#d46b08' }} /> Кредиторка</span>,
            children: <CreditorsTab />,
        },
        {
            key:      'bank-statements',
            label:    <span><BankOutlined /> Выписки банка</span>,
            children: <BankStatementsTab />,
        },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <Title level={4} style={{ marginBottom: 16 }}>
                <DollarOutlined style={{ marginRight: 8 }} />
                Финансы
            </Title>
            <Tabs defaultActiveKey="invoices" items={tabs} destroyInactiveTabPane={false} />
        </div>
    );
};

export default FinancePage;
