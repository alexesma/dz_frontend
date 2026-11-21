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
    Segmented,
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
    EditOutlined,
    EyeOutlined,
    MailOutlined,
    LinkOutlined,
    MinusCircleOutlined,
    ReloadOutlined,
    RobotOutlined,
    StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { fetchAllCustomersBrief } from '../api/customers';
import { getAllProviders } from '../api/providers';
import { CategorizeFields, CategoryTag } from './BankCategoryParts';
import {
    categorizeMessage,
    categorizeTransaction,
    initialCategorize,
    useBankCategories,
} from './bankCategoryUtils';

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
const listBankAccounts = ()            => api.get('/finance/bank-accounts');
const updateBankAccount = (id, data)   => api.patch(`/finance/bank-accounts/${id}`, data);
const getSuggestions = (stmtId, txnId) =>
    api.get(`/finance/bank-statements/${stmtId}/transactions/${txnId}/suggestions`);
const assignTransaction = (stmtId, txnId, data) =>
    api.post(`/finance/bank-statements/${stmtId}/transactions/${txnId}/assign`, data);

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—';

const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');

const FORMAT_LABELS = {
    tochka_csv:   'Точка CSV',
    '1c_exchange': '1С',
    alfabank_csv: 'Альфа CSV',
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
// Юридическая форма съедает ширину колонки: показываем ООО / ИП / АО.
const shortName = (value) =>
    value
        ? value
            .replace(/общество с ограниченной ответственностью/i, 'ООО')
            .replace(/индивидуальный предприниматель/i, 'ИП')
            .replace(/публичное акционерное общество/i, 'ПАО')
            .replace(/акционерное общество/i, 'АО')
        : value;
const nowrap = { whiteSpace: 'nowrap' };
const clip = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' };

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
                                    {a.bank_name} · {a.account_number}
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

const MatchModal = ({ open, onClose, onSaved, txn, stmtId, partners, categories, onCategoriesChanged }) => {
    const [mode,        setMode]        = useState('partner'); // 'partner' | 'ignore'
    const [category,    setCategory]    = useState({});
    const [partner,     setPartner]     = useState(null);      // 'customer:12' | 'provider:5'
    const [remember,    setRemember]    = useState(true);
    const [note,        setNote]        = useState('');
    const [saving,      setSaving]      = useState(false);
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (!open || !txn) return;
        setMode(txn.category ? 'ignore' : 'partner');
        setCategory(initialCategorize(txn));
        setPartner(null);
        setRemember(true);
        setNote('');
        setSuggestions([]);
        getSuggestions(stmtId, txn.id)
            .then((res) => setSuggestions(res.data || []))
            .catch(() => setSuggestions([]));
    }, [open, txn, stmtId]);

    const options = [
        { label: 'Клиенты', options: partners.customers.map((p) => ({
            value: `customer:${p.id}`, label: p.name, search: `${p.name} ${p.inn || ''}` })) },
        { label: 'Поставщики', options: partners.providers.map((p) => ({
            value: `provider:${p.id}`, label: p.name, search: `${p.name} ${p.inn || ''}` })) },
    ];
    const ordered = txn?.direction === 'incoming' ? options : [options[1], options[0]];

    const handleSave = async () => {
        setSaving(true);
        try {
            if (mode === 'ignore') {
                if (!category.code) {
                    message.warning('Выберите статью, например «Аренда» или «Сайт»');
                    setSaving(false);
                    return;
                }
                const res = await categorizeTransaction(stmtId, txn.id, {
                    category_code: category.code,
                    remember: category.remember,
                    apply_to_past: true,
                });
                message.success(categorizeMessage(res.data));
            } else {
                if (!partner) {
                    message.warning('Выберите клиента или поставщика');
                    setSaving(false);
                    return;
                }
                const [kind, id] = partner.split(':');
                const res = await assignTransaction(stmtId, txn.id, {
                    [kind === 'customer' ? 'customer_id' : 'provider_id']: Number(id),
                    remember,
                    match_note: note || undefined,
                });
                const also = res.data?.also_matched || 0;
                message.success(also > 0
                    ? `Разнесено. Ещё операций этого контрагента: ${also}`
                    : 'Разнесено');
            }
            onSaved();
            onClose();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    const incoming = txn?.direction === 'incoming';

    return (
        <Modal
            title="Разнести операцию"
            open={open}
            onCancel={onClose}
            onOk={handleSave}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={560}
            destroyOnClose
        >
            {txn && (
                <div className="bank-match-summary">
                    <div className="bank-match-line">
                        <Text strong style={{ color: incoming ? '#27ae60' : '#c0392b' }}>
                            {incoming ? '+' : '−'}{fmt(txn.amount)} ₽
                        </Text>
                        <Text type="secondary">{fmtDate(txn.value_date)}</Text>
                    </div>
                    <div style={{ marginTop: 4 }}><Text strong>{shortName(txn.counterparty_name) || '—'}</Text></div>
                    {txn.counterparty_inn && (
                        <Text type="secondary" style={{ fontSize: 12 }}>ИНН {txn.counterparty_inn}</Text>
                    )}
                    <Paragraph
                        type="secondary"
                        style={{ fontSize: 12, margin: '4px 0 0' }}
                        ellipsis={{ rows: 3, expandable: true, symbol: 'ещё' }}
                    >
                        {txn.purpose || '—'}
                    </Paragraph>
                </div>
            )}

            <Segmented
                block
                value={mode}
                onChange={setMode}
                options={[
                    { value: 'partner', label: 'На клиента / поставщика' },
                    { value: 'ignore',  label: 'Налоги, аренда, сайт…' },
                ]}
                style={{ margin: '12px 0' }}
            />

            {mode === 'partner' && (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {suggestions.length > 0 && (
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>Похоже на:</Text>
                            <div className="bank-match-suggestions">
                                {suggestions.map((s) => {
                                    const value = `${s.type}:${s.id}`;
                                    return (
                                        <Tag.CheckableTag
                                            key={value}
                                            checked={partner === value}
                                            onChange={() => setPartner(value)}
                                        >
                                            {s.name} · {s.type === 'customer' ? 'клиент' : 'поставщик'}
                                        </Tag.CheckableTag>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <Select
                        showSearch
                        allowClear
                        placeholder="Найти клиента или поставщика"
                        style={{ width: '100%' }}
                        value={partner}
                        onChange={setPartner}
                        options={ordered}
                        optionFilterProp="search"
                        filterOption={(input, opt) =>
                            (opt?.search || '').toLowerCase().includes(input.toLowerCase())}
                    />
                    {txn?.counterparty_inn && (
                        <div className="bank-match-line">
                            <Text style={{ fontSize: 13 }}>
                                Запомнить ИНН {txn.counterparty_inn}: следующие платежи разнесутся сами
                            </Text>
                            <Switch size="small" checked={remember} onChange={setRemember} />
                        </div>
                    )}
                </Space>
            )}

            {mode === 'ignore' && (
                <CategorizeFields
                    txn={txn}
                    value={category}
                    onChange={setCategory}
                    categories={categories}
                    onCategoriesChanged={onCategoriesChanged}
                />
            )}

            {mode === 'partner' && (
                <Input.TextArea
                    rows={2}
                    placeholder="Комментарий (необязательно)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ marginTop: 12 }}
                />
            )}
        </Modal>
    );
};

// ── Bank account edit modal ───────────────────────────────────────────────────

const AccountModal = ({ account, onClose, onSaved }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (account) {
            form.setFieldsValue({
                bank_name: account.bank_name === 'Неизвестный банк' ? '' : account.bank_name,
                bik: account.bik || '',
                description: account.description || '',
            });
        }
    }, [account, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            await updateBankAccount(account.id, {
                bank_name: values.bank_name,
                bik: values.bik || null,
                description: values.description || null,
            });
            message.success('Счёт обновлён');
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
            title="Расчётный счёт"
            open={!!account}
            onCancel={onClose}
            onOk={handleOk}
            confirmLoading={saving}
            okText="Сохранить"
            cancelText="Отмена"
            width={460}
            destroyOnClose
        >
            <div style={{ marginBottom: 12 }}>
                <Text type="secondary">Счёт </Text>
                <Text strong style={nowrap}>{account?.account_number}</Text>
            </div>
            <Form form={form} layout="vertical">
                <Form.Item name="bank_name" label="Банк"
                    rules={[{ required: true, message: 'Укажите банк' }]}>
                    <Input placeholder="Например: Банк Точка" />
                </Form.Item>
                <Form.Item name="bik" label="БИК">
                    <Input maxLength={9} placeholder="044525104" />
                </Form.Item>
                <Form.Item name="description" label="Описание" style={{ marginBottom: 0 }}>
                    <Input placeholder="Основной расчётный счёт" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Transactions drawer ───────────────────────────────────────────────────────

const TransactionsDrawer = ({ open, onClose, statement, partners, onChanged }) => {
    const [txns,      setTxns]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [filter,    setFilter]    = useState({ direction: null, status: null });
    const [matchModal, setMatchModal] = useState({ open: false, txn: null });
    const { categories, byCode, reload: reloadCategories } = useBankCategories();

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
            message.success(`Разнесено: ${res.data.matched}, осталось: ${res.data.skipped}`);
            load();
            onChanged();
        } catch {
            message.error('Ошибка авторазноски');
        }
    };

    const columns = [
        {
            title: 'Дата',
            dataIndex: 'value_date',
            width: 88,
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{fmtDate(v)}</Text>,
        },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            width: 128,
            align: 'right',
            render: (v, rec) => (
                <div style={nowrap}>
                    <Text strong style={{ color: rec.direction === 'incoming' ? '#27ae60' : '#c0392b' }}>
                        {rec.direction === 'incoming' ? '+' : '−'}{fmt(v)}
                    </Text>
                    {rec.vat_amount ? (
                        <div style={{ fontSize: 10, color: '#8c8c8c' }}>НДС {fmt(rec.vat_amount)}</div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'counterparty_name',
            width: '27%',
            render: (v, rec) => (
                <div style={{ minWidth: 0 }}>
                    <Tooltip title={v}>
                        <Text style={{ fontSize: 12, ...clip }}>{shortName(v) || '—'}</Text>
                    </Tooltip>
                    {rec.counterparty_inn && (
                        <Text type="secondary" style={{ fontSize: 11, ...clip }}>
                            ИНН {rec.counterparty_inn}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Назначение',
            dataIndex: 'purpose',
            render: (v) => (
                <Tooltip title={v} overlayStyle={{ maxWidth: 480 }}>
                    <div className="bank-purpose">{v || '—'}</div>
                </Tooltip>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 150,
            render: (v, rec) => (
                <div style={{ minWidth: 0 }}>
                    {rec.category ? (
                        <CategoryTag code={rec.category} byCode={byCode} />
                    ) : (
                        <Badge
                            status={STATUS_COLORS[v] === 'success' ? 'success' : STATUS_COLORS[v] === 'warning' ? 'warning' : 'default'}
                            text={<Text style={{ fontSize: 12, ...nowrap }}>{STATUS_LABELS[v] || v}</Text>}
                        />
                    )}
                    {rec.match_note && (
                        <Tooltip title={rec.match_note}>
                            <Text type="secondary" style={{ fontSize: 11, ...clip }}>{rec.match_note}</Text>
                        </Tooltip>
                    )}
                </div>
            ),
        },
        {
            title: '',
            width: 52,
            align: 'center',
            render: (_, rec) => (
                rec.status === 'unmatched' ? (
                    <Tooltip title="Разнести: клиент, поставщик или статья расхода">
                        <Button size="small" type="primary" ghost icon={<LinkOutlined />}
                            onClick={() => setMatchModal({ open: true, txn: rec })} />
                    </Tooltip>
                ) : (
                    <Tooltip title="Изменить разноску">
                        <Button size="small" type="text" icon={<EditOutlined />}
                            onClick={() => setMatchModal({ open: true, txn: rec })} />
                    </Tooltip>
                )
            ),
        },
    ];

    const unmatched = txns.filter((t) => t.status === 'unmatched').length;
    const matched   = txns.filter((t) => t.status === 'matched').length;
    const ignored   = txns.filter((t) => t.status === 'ignored').length;

    return (
        <>
            <Drawer
                title={
                    <span style={nowrap}>
                        Операции
                        {statement && (
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                {statement.bank_account_bank && statement.bank_account_bank !== 'Неизвестный банк' ? `${statement.bank_account_bank} · ` : ''}{fmtDate(statement.period_from)}
                                {statement.period_to !== statement.period_from ? ` — ${fmtDate(statement.period_to)}` : ''}
                            </Text>
                        )}
                    </span>
                }
                open={open}
                onClose={onClose}
                width="min(1100px, 96vw)"
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
                    <div className="bank-drawer-stats">
                        <Tag color="blue">Приход {fmt(statement.total_incoming)} ₽</Tag>
                        <Tag color="red">Расход {fmt(statement.total_outgoing)} ₽</Tag>
                        <Tag color="green">Разнесено {matched}</Tag>
                        {ignored > 0 && <Tag color="gold">Служебных {ignored}</Tag>}
                        {unmatched > 0 && <Tag color="orange">Осталось {unmatched}</Tag>}
                        <Progress
                            percent={txns.length > 0 ? Math.round(((matched + ignored) / txns.length) * 100) : 0}
                            size="small"
                            style={{ width: 160, margin: 0 }}
                            strokeColor="#52c41a"
                        />
                        <span style={{ flex: 1 }} />
                        <Select allowClear placeholder="Направление" style={{ width: 130 }} size="small"
                            value={filter.direction}
                            onChange={(v) => setFilter((f) => ({ ...f, direction: v || null }))}>
                            <Option value="incoming">Приход</Option>
                            <Option value="outgoing">Расход</Option>
                        </Select>
                        <Select allowClear placeholder="Статус" style={{ width: 150 }} size="small"
                            value={filter.status}
                            onChange={(v) => setFilter((f) => ({ ...f, status: v || null }))}>
                            <Option value="unmatched">Не разнесены</Option>
                            <Option value="matched">Разнесены</Option>
                            <Option value="ignored">Пропущены</Option>
                        </Select>
                    </div>
                )}

                <Spin spinning={loading}>
                    <Table
                        className="compact-table bank-txn-table"
                        rowKey="id"
                        size="small"
                        tableLayout="fixed"
                        dataSource={txns}
                        columns={columns}
                        pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
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
                onSaved={() => { load(); onChanged(); setMatchModal({ open: false, txn: null }); }}
                txn={matchModal.txn}
                stmtId={statement?.id}
                partners={partners}
                categories={categories}
                onCategoriesChanged={reloadCategories}
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
    const [editAccount,  setEditAccount]  = useState(null);
    const [partners,     setPartners]     = useState({ customers: [], providers: [] });

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [sRes, aRes] = await Promise.all([listStatements({ limit: 200 }), listBankAccounts()]);
            setStatements(sRes.data);
            setBankAccounts(aRes.data);
        } catch { message.error('Ошибка загрузки'); }
        finally  { setLoading(false); }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Клиенты и поставщики нужны только для ручной разноски: грузим фоном.
    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchAllCustomersBrief().catch(() => []), getAllProviders().catch(() => [])])
            .then(([customers, providers]) => {
                if (!cancelled) setPartners({ customers, providers });
            });
        return () => { cancelled = true; };
    }, []);

    const handleDelete = async (id) => {
        try {
            await deleteStatement(id);
            message.success('Выписка удалена');
            loadAll();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const accountById = Object.fromEntries(bankAccounts.map((a) => [a.id, a]));

    const columns = [
        {
            title: 'Счёт / банк',
            width: '27%',
            render: (_, rec) => {
                const account = accountById[rec.bank_account_id];
                const unknown = !rec.bank_account_bank || rec.bank_account_bank === 'Неизвестный банк';
                return (
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Text strong style={{ fontSize: 13, ...clip, color: unknown ? '#d46b08' : undefined }}>
                                {unknown ? 'Банк не указан' : rec.bank_account_bank}
                            </Text>
                            {account && (
                                <Tooltip title="Изменить банк и БИК">
                                    <Button type="text" size="small" icon={<EditOutlined />}
                                        onClick={() => setEditAccount(account)} />
                                </Tooltip>
                            )}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, ...clip }}>
                            {rec.bank_account_number || '—'}
                        </Text>
                    </div>
                );
            },
        },
        {
            title: 'Период',
            width: 116,
            render: (_, rec) => (
                <div style={nowrap}>
                    <Text style={{ fontSize: 12 }}>{fmtDate(rec.period_from)}</Text>
                    {rec.period_to !== rec.period_from && (
                        <div style={{ fontSize: 11, color: '#8c8c8c' }}>по {fmtDate(rec.period_to)}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Приход / расход',
            render: (_, rec) => (
                <div style={{ fontSize: 12, ...nowrap }}>
                    <div><Text style={{ color: '#27ae60' }}>+{fmt(rec.total_incoming)}</Text></div>
                    <div><Text style={{ color: '#c0392b' }}>−{fmt(rec.total_outgoing)}</Text></div>
                </div>
            ),
        },
        {
            title: 'Разноска',
            width: 118,
            render: (_, rec) => {
                const pct = rec.txn_count > 0
                    ? Math.round((rec.matched_count / rec.txn_count) * 100) : 0;
                return (
                    <div>
                        <Text style={{ fontSize: 12, ...nowrap }}>
                            {rec.matched_count} из {rec.txn_count}
                        </Text>
                        <Progress percent={pct} size="small" showInfo={false}
                            strokeColor={pct === 100 ? '#52c41a' : '#1677ff'} />
                    </div>
                );
            },
        },
        {
            title: 'Источник',
            width: 150,
            render: (_, rec) => (
                <div style={nowrap}>
                    <Tag color={FORMAT_COLORS[rec.format] || 'default'} style={{ fontSize: 11, margin: 0 }}>
                        {FORMAT_LABELS[rec.format] || rec.format}
                    </Tag>
                    {rec.source === 'email' && (
                        <Tooltip title="Получена с почты автоматически">
                            <MailOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                        </Tooltip>
                    )}
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
                        {rec.uploaded_at ? dayjs(rec.uploaded_at).format('DD.MM HH:mm') : '—'}
                    </div>
                </div>
            ),
        },
        {
            title: '',
            width: 76,
            render: (_, rec) => (
                <Space size={4}>
                    <Tooltip title="Операции выписки">
                        <Button size="small" type="primary" ghost icon={<EyeOutlined />}
                            onClick={() => setDrawer({ open: true, statement: rec })} />
                    </Tooltip>
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
                        {statements.length} выписок · приходят с почты автоматически
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
                            Выписки Точки и Альфа-Банка приходят с почты автоматически. Можно загрузить
                            вручную: <strong>1CClientBankExchange (.txt)</strong>, CSV Точки или Альфа-Банка.
                        </div>
                    }
                    style={{ marginBottom: 16 }}
                />
            )}

            <Table
                className="compact-table"
                rowKey="id"
                size="small"
                tableLayout="fixed"
                loading={loading}
                dataSource={statements}
                columns={columns}
                pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
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
                partners={partners}
                onChanged={loadAll}
            />

            <AccountModal
                account={editAccount}
                onClose={() => setEditAccount(null)}
                onSaved={loadAll}
            />
        </>
    );
};

export default BankStatementsTab;
