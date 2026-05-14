/**
 * BankStatementsTab — вкладка загрузки и разноски банковских выписок.
 *
 * Поддерживаемые форматы:
 *  - Точка Банк CSV (UTF-8)
 *  - 1CClientBankExchange .txt (cp1251)
 *  - Альфа-Банк CSV (cp1251, только сводка)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Descriptions,
    Drawer,
    Form,
    Input,
    Modal,
    Popconfirm,
    Progress,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CloudUploadOutlined,
    DeleteOutlined,
    EyeOutlined,
    LinkOutlined,
    MinusCircleOutlined,
    ReloadOutlined,
    RobotOutlined,
    StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Dragger } = Upload;

// ── API helpers ───────────────────────────────────────────────────────────────

const uploadStatement = (file, bankAccountId, autoMatch) => {
    const form = new FormData();
    form.append('file', file);
    const params = new URLSearchParams({ auto_match: autoMatch });
    if (bankAccountId) params.set('bank_account_id', bankAccountId);
    return api.post(`/finance/bank-statements/upload?${params}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

const listStatements   = (params = {}) => api.get('/finance/bank-statements', { params });
const deleteStatement  = (id)          => api.delete(`/finance/bank-statements/${id}`);
const listTransactions = (id, params)  => api.get(`/finance/bank-statements/${id}/transactions`, { params });
const autoMatchStmt    = (id)          => api.post(`/finance/bank-statements/${id}/auto-match`);
const matchTransaction = (stmtId, txnId, data) =>
    api.patch(`/finance/bank-statements/${stmtId}/transactions/${txnId}`, data);
const listBankAccounts = ()            => api.get('/finance/bank-accounts');

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—';

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');

const FORMAT_LABELS = {
    tochka_csv:   'Точка CSV',
    '1c_exchange': '1С Обмен',
    alfabank_csv: 'Альфа-Банк',
    sberbank_csv: 'Сбербанк',
    unknown:      'Неизвестный',
};
const FORMAT_COLORS = {
    tochka_csv:   'blue',
    '1c_exchange': 'purple',
    alfabank_csv: 'orange',
    sberbank_csv: 'green',
    unknown:      'default',
};
const DIR_LABELS  = { incoming: '↓ Приход', outgoing: '↑ Расход' };
const DIR_COLORS  = { incoming: 'success',  outgoing: 'processing' };
const STATUS_COLORS = { unmatched: 'default', matched: 'success', ignored: 'warning' };
const STATUS_LABELS = { unmatched: 'Не разнесена', matched: 'Разнесена', ignored: 'Пропущена' };

// ── Upload modal ──────────────────────────────────────────────────────────────

const UploadModal = ({ open, onClose, onUploaded, bankAccounts }) => {
    const [fileList,     setFileList]     = useState([]);
    const [autoMatch,    setAutoMatch]    = useState(true);
    const [bankAccId,    setBankAccId]    = useState(null);
    const [uploading,    setUploading]    = useState(false);
    const [result,       setResult]       = useState(null);

    const reset = () => {
        setFileList([]);
        setResult(null);
        setAutoMatch(true);
        setBankAccId(null);
    };

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning('Выберите файл');
            return;
        }
        setUploading(true);
        try {
            const res = await uploadStatement(fileList[0].originFileObj, bankAccId, autoMatch);
            setResult(res.data);
            message.success(`Загружено ${res.data.txn_count} транзакций`);
            onUploaded();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Ошибка загрузки');
        } finally {
            setUploading(false);
        }
    };

    return (
        <Modal
            title="Загрузить выписку банка"
            open={open}
            onCancel={() => { reset(); onClose(); }}
            footer={
                result ? (
                    <Button type="primary" onClick={() => { reset(); onClose(); }}>Готово</Button>
                ) : (
                    <Space>
                        <Button onClick={() => { reset(); onClose(); }}>Отмена</Button>
                        <Button type="primary" loading={uploading} onClick={handleUpload}
                            icon={<CloudUploadOutlined />}>
                            Загрузить
                        </Button>
                    </Space>
                )
            }
            width={560}
            destroyOnClose
        >
            {result ? (
                <div>
                    <Alert
                        type="success"
                        showIcon
                        message={`Выписка загружена: ${result.txn_count} транзакций`}
                        description={
                            <div>
                                <div>Период: {fmtDate(result.period_from)} — {fmtDate(result.period_to)}</div>
                                {result.opening_balance != null && (
                                    <div>Входящий остаток: {fmt(result.opening_balance)} ₽</div>
                                )}
                                {result.closing_balance != null && (
                                    <div>Исходящий остаток: {fmt(result.closing_balance)} ₽</div>
                                )}
                                <div style={{ marginTop: 8 }}>
                                    Разнесено автоматически: <strong>{result.matched_count}</strong> из {result.txn_count}
                                </div>
                            </div>
                        }
                    />
                </div>
            ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Dragger
                        fileList={fileList}
                        beforeUpload={(file) => {
                            setFileList([file]);
                            return false;
                        }}
                        onRemove={() => setFileList([])}
                        accept=".csv,.txt,.xls,.xlsx"
                        maxCount={1}
                    >
                        <p style={{ fontSize: 32, margin: 0 }}>📄</p>
                        <p style={{ fontWeight: 600 }}>Перетащите файл или нажмите для выбора</p>
                        <p style={{ color: '#6b7280', fontSize: 12 }}>
                            Поддерживаются: Точка CSV, 1C Обмен (.txt), Альфа-Банк CSV
                        </p>
                    </Dragger>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text>Авторазноска после загрузки</Text>
                        <Switch checked={autoMatch} onChange={setAutoMatch}
                            checkedChildren="Вкл" unCheckedChildren="Выкл" />
                    </div>

                    {bankAccounts.length > 0 && (
                        <Select allowClear placeholder="Привязать к расчётному счёту (необязательно)"
                            style={{ width: '100%' }} value={bankAccId} onChange={setBankAccId}>
                            {bankAccounts.map((a) => (
                                <Option key={a.id} value={a.id}>
                                    {a.account_number} — {a.bank_name}
                                </Option>
                            ))}
                        </Select>
                    )}
                </Space>
            )}
        </Modal>
    );
};

// ── Match transaction modal ───────────────────────────────────────────────────

const MatchModal = ({ open, onClose, onSaved, txn, stmtId }) => {
    const [mode,         setMode]         = useState('payment'); // 'payment' | 'ignore'
    const [paymentType,  setPaymentType]  = useState('customer'); // 'customer' | 'supplier'
    const [paymentId,    setPaymentId]    = useState('');
    const [note,         setNote]         = useState('');
    const [saving,       setSaving]       = useState(false);

    useEffect(() => {
        if (open) {
            setMode('payment');
            setPaymentType(txn?.direction === 'incoming' ? 'customer' : 'supplier');
            setPaymentId('');
            setNote('');
        }
    }, [open, txn]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = mode === 'ignore'
                ? { ignore: true, match_note: note || 'Пропущено вручную' }
                : paymentType === 'customer'
                    ? { customer_payment_id: parseInt(paymentId), match_note: note }
                    : { supplier_payment_id: parseInt(paymentId), match_note: note };

            await matchTransaction(stmtId, txn.id, data);
            message.success('Разноска сохранена');
            onSaved();
            onClose();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={`Разнести транзакцию № ${txn?.doc_number || txn?.id}`}
            open={open}
            onCancel={onClose}
            onOk={handleSave}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={480}
            destroyOnClose
        >
            {txn && (
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', marginBottom: 16 }}>
                    <div><Text type="secondary">Контрагент: </Text><Text strong>{txn.counterparty_name || '—'}</Text></div>
                    {txn.counterparty_inn && <div><Text type="secondary">ИНН: </Text><Text>{txn.counterparty_inn}</Text></div>}
                    <div><Text type="secondary">Сумма: </Text>
                        <Text strong style={{ color: txn.direction === 'incoming' ? '#27ae60' : '#c0392b' }}>
                            {txn.direction === 'incoming' ? '+' : '−'}{fmt(txn.amount)} ₽
                        </Text>
                    </div>
                    <div><Text type="secondary">Назначение: </Text><Text style={{ fontSize: 12 }}>{txn.purpose || '—'}</Text></div>
                </div>
            )}

            <Space direction="vertical" style={{ width: '100%' }}>
                <Select value={mode} onChange={setMode} style={{ width: '100%' }}>
                    <Option value="payment">Привязать к оплате</Option>
                    <Option value="ignore">Пометить как техническую / пропустить</Option>
                </Select>

                {mode === 'payment' && (
                    <>
                        <Select value={paymentType} onChange={setPaymentType} style={{ width: '100%' }}>
                            <Option value="customer">Оплата от клиента (CustomerPayment ID)</Option>
                            <Option value="supplier">Оплата поставщику (SupplierPayment ID)</Option>
                        </Select>
                        <Input
                            placeholder="ID записи оплаты"
                            value={paymentId}
                            onChange={(e) => setPaymentId(e.target.value)}
                            prefix={<LinkOutlined />}
                        />
                    </>
                )}

                <Input.TextArea
                    rows={2}
                    placeholder="Комментарий (необязательно)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                />
            </Space>
        </Modal>
    );
};

// ── Transactions drawer ───────────────────────────────────────────────────────

const TransactionsDrawer = ({ open, onClose, statement }) => {
    const [txns,      setTxns]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [filter,    setFilter]    = useState({ direction: null, status: null });
    const [matchModal, setMatchModal] = useState({ open: false, txn: null });

    const load = useCallback(async () => {
        if (!statement) return;
        setLoading(true);
        try {
            const params = { limit: 500 };
            if (filter.direction) params.direction = filter.direction;
            if (filter.status)    params.status    = filter.status;
            const res = await listTransactions(statement.id, params);
            setTxns(res.data);
        } catch { message.error('Ошибка загрузки транзакций'); }
        finally  { setLoading(false); }
    }, [statement, filter]);

    useEffect(() => { if (open) load(); }, [open, load]);

    const handleAutoMatch = async () => {
        try {
            const res = await autoMatchStmt(statement.id);
            message.success(`Разнесено: ${res.data.matched}, пропущено: ${res.data.skipped}`);
            load();
        } catch {
            message.error('Ошибка авторазноски');
        }
    };

    const columns = [
        {
            title: 'Дата',
            dataIndex: 'value_date',
            width: 90,
            render: fmtDate,
        },
        {
            title: 'Направление',
            dataIndex: 'direction',
            width: 110,
            render: (v) => (
                <Tag color={DIR_COLORS[v]} style={{ fontSize: 11 }}>
                    {DIR_LABELS[v] || v}
                </Tag>
            ),
        },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            width: 110,
            align: 'right',
            render: (v, rec) => (
                <Text strong style={{ color: rec.direction === 'incoming' ? '#27ae60' : '#c0392b' }}>
                    {rec.direction === 'incoming' ? '+' : '−'}{fmt(v)} ₽
                </Text>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'counterparty_name',
            ellipsis: true,
            render: (v, rec) => (
                <div>
                    <div style={{ fontSize: 12 }}>{v || '—'}</div>
                    {rec.counterparty_inn && (
                        <Text type="secondary" style={{ fontSize: 11 }}>ИНН {rec.counterparty_inn}</Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Назначение',
            dataIndex: 'purpose',
            ellipsis: true,
            render: (v) => <Text style={{ fontSize: 11, color: '#555' }}>{v || '—'}</Text>,
        },
        {
            title: 'НДС',
            dataIndex: 'vat_amount',
            width: 90,
            align: 'right',
            render: (v) => v ? <Text style={{ fontSize: 11 }}>{fmt(v)}</Text> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 120,
            render: (v, rec) => (
                <div>
                    <Badge
                        status={STATUS_COLORS[v] === 'success' ? 'success' : STATUS_COLORS[v] === 'warning' ? 'warning' : 'default'}
                        text={<Text style={{ fontSize: 11 }}>{STATUS_LABELS[v] || v}</Text>}
                    />
                    {rec.match_note && (
                        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{rec.match_note}</div>
                    )}
                </div>
            ),
        },
        {
            title: '',
            width: 50,
            render: (_, rec) =>
                rec.status === 'unmatched' ? (
                    <Button size="small" icon={<LinkOutlined />}
                        onClick={() => setMatchModal({ open: true, txn: rec })}>
                        Разнести
                    </Button>
                ) : (
                    <Tooltip title={rec.match_note}>
                        <CheckCircleOutlined style={{ color: '#27ae60' }} />
                    </Tooltip>
                ),
        },
    ];

    const unmatched = txns.filter((t) => t.status === 'unmatched').length;
    const matched   = txns.filter((t) => t.status === 'matched').length;

    return (
        <>
            <Drawer
                title={
                    <div>
                        Транзакции выписки
                        {statement && (
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                {fmtDate(statement.period_from)} — {fmtDate(statement.period_to)}
                            </Text>
                        )}
                    </div>
                }
                open={open}
                onClose={onClose}
                width={1000}
                extra={
                    <Space>
                        <Button icon={<RobotOutlined />} onClick={handleAutoMatch} type="primary">
                            Авторазноска
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={load} />
                    </Space>
                }
            >
                {statement && (
                    <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <Tag color="blue">Приход: {fmt(statement.total_incoming)} ₽</Tag>
                        <Tag color="red">Расход: {fmt(statement.total_outgoing)} ₽</Tag>
                        <Tag color="green">Разнесено: {matched}</Tag>
                        {unmatched > 0 && <Tag color="orange">Не разнесено: {unmatched}</Tag>}
                        <Progress
                            percent={txns.length > 0 ? Math.round((matched / txns.length) * 100) : 0}
                            size="small"
                            style={{ width: 180 }}
                            strokeColor="#52c41a"
                        />
                    </div>
                )}

                <Space style={{ marginBottom: 10 }}>
                    <Select allowClear placeholder="Направление" style={{ width: 140 }}
                        value={filter.direction}
                        onChange={(v) => setFilter((f) => ({ ...f, direction: v || null }))}>
                        <Option value="incoming">Приход</Option>
                        <Option value="outgoing">Расход</Option>
                    </Select>
                    <Select allowClear placeholder="Статус" style={{ width: 160 }}
                        value={filter.status}
                        onChange={(v) => setFilter((f) => ({ ...f, status: v || null }))}>
                        <Option value="unmatched">Не разнесены</Option>
                        <Option value="matched">Разнесены</Option>
                        <Option value="ignored">Пропущены</Option>
                    </Select>
                </Space>

                <Spin spinning={loading}>
                    <Table
                        rowKey="id"
                        size="small"
                        dataSource={txns}
                        columns={columns}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        rowClassName={(rec) =>
                            rec.status === 'unmatched' ? '' :
                            rec.status === 'matched'   ? 'ant-table-row-matched' : 'ant-table-row-muted'
                        }
                    />
                </Spin>
            </Drawer>

            <MatchModal
                open={matchModal.open}
                onClose={() => setMatchModal({ open: false, txn: null })}
                onSaved={() => { load(); setMatchModal({ open: false, txn: null }); }}
                txn={matchModal.txn}
                stmtId={statement?.id}
            />
        </>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const BankStatementsTab = () => {
    const [statements,   setStatements]   = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading,      setLoading]      = useState(false);
    const [showUpload,   setShowUpload]   = useState(false);
    const [drawer,       setDrawer]       = useState({ open: false, statement: null });

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [sRes, aRes] = await Promise.all([listStatements(), listBankAccounts()]);
            setStatements(sRes.data);
            setBankAccounts(aRes.data);
        } catch { message.error('Ошибка загрузки'); }
        finally  { setLoading(false); }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleDelete = async (id) => {
        try {
            await deleteStatement(id);
            message.success('Выписка удалена');
            loadAll();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const columns = [
        {
            title: 'Счёт / Банк',
            render: (_, rec) => (
                <div>
                    <Text strong style={{ fontSize: 12 }}>
                        {rec.bank_account_number || '—'}
                    </Text>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{rec.bank_account_bank || '—'}</div>
                </div>
            ),
        },
        {
            title: 'Период',
            render: (_, rec) => (
                <Text style={{ fontSize: 12 }}>
                    {fmtDate(rec.period_from)} — {fmtDate(rec.period_to)}
                </Text>
            ),
        },
        {
            title: 'Формат',
            dataIndex: 'format',
            render: (v) => (
                <Tag color={FORMAT_COLORS[v] || 'default'} style={{ fontSize: 11 }}>
                    {FORMAT_LABELS[v] || v}
                </Tag>
            ),
        },
        {
            title: 'Приход / Расход',
            render: (_, rec) => (
                <div style={{ fontSize: 12 }}>
                    <Text style={{ color: '#27ae60' }}>+{fmt(rec.total_incoming)}</Text>
                    {' / '}
                    <Text style={{ color: '#c0392b' }}>−{fmt(rec.total_outgoing)}</Text>
                    {' ₽'}
                </div>
            ),
        },
        {
            title: 'Разноска',
            render: (_, rec) => {
                const pct = rec.txn_count > 0
                    ? Math.round((rec.matched_count / rec.txn_count) * 100) : 0;
                return (
                    <div style={{ minWidth: 120 }}>
                        <Text style={{ fontSize: 11 }}>
                            {rec.matched_count} / {rec.txn_count}
                        </Text>
                        <Progress percent={pct} size="small" showInfo={false}
                            strokeColor={pct === 100 ? '#52c41a' : '#1677ff'} />
                    </div>
                );
            },
        },
        {
            title: 'Загружена',
            dataIndex: 'uploaded_at',
            render: (v) => <Text style={{ fontSize: 11 }}>{v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—'}</Text>,
        },
        {
            title: '',
            width: 120,
            render: (_, rec) => (
                <Space size={4}>
                    <Button size="small" icon={<EyeOutlined />}
                        onClick={() => setDrawer({ open: true, statement: rec })}>
                        Транзакции
                    </Button>
                    <Popconfirm title="Удалить выписку и все транзакции?"
                        onConfirm={() => handleDelete(rec.id)}
                        okText="Удалить" okButtonProps={{ danger: true }} cancelText="Нет">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <Button type="primary" icon={<CloudUploadOutlined />}
                    onClick={() => setShowUpload(true)}>
                    Загрузить выписку
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadAll}>Обновить</Button>
                {statements.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {statements.length} выписок загружено
                    </Text>
                )}
            </Space>

            {statements.length === 0 && !loading && (
                <Alert
                    type="info"
                    showIcon
                    message="Выписки банка не загружены"
                    description={
                        <div>
                            Загрузите выписку в формате <strong>CSV Точка Банк</strong>,{' '}
                            <strong>1CClientBankExchange (.txt)</strong> или <strong>Альфа-Банк CSV</strong>.
                            Система автоматически определит формат и разнесёт входящие платежи по клиентам.
                        </div>
                    }
                    style={{ marginBottom: 16 }}
                />
            )}

            <Table
                rowKey="id"
                size="small"
                loading={loading}
                dataSource={statements}
                columns={columns}
                pagination={{ pageSize: 20 }}
            />

            <UploadModal
                open={showUpload}
                onClose={() => setShowUpload(false)}
                onUploaded={loadAll}
                bankAccounts={bankAccounts}
            />

            <TransactionsDrawer
                open={drawer.open}
                onClose={() => setDrawer({ open: false, statement: null })}
                statement={drawer.statement}
            />
        </>
    );
};

export default BankStatementsTab;
