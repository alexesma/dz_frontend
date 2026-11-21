/**
 * Общие части для статей не торговых операций (налоги, зарплата, аренда, сайт…):
 * загрузка справочника, цветная метка, выбор статьи с добавлением новой,
 * форма «отнести на статью и запомнить контрагента», управление справочником.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Input,
    Modal,
    Popconfirm,
    Radio,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api from '../api';
import {
    KIND_LABELS,
    categorizeMessage,
    categorizeTransaction,
    initialCategorize,
    rememberDefault,
    useBankCategories,
} from './bankCategoryUtils';

const { Text } = Typography;

const DEFAULT_COLOR = '#95a5a6';

export const CategoryTag = ({ code, byCode, style }) => {
    if (!code) return null;
    const category = byCode?.[code];
    const color = category?.color || DEFAULT_COLOR;
    return (
        <Tag
            style={{
                margin: 0,
                fontSize: 11,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color,
                background: `${color}1a`,
                borderColor: `${color}55`,
                ...style,
            }}
        >
            {category?.name || code}
        </Tag>
    );
};

/** Выбор статьи; внизу списка можно сразу завести новую. */
export const CategoryPicker = ({ value, onChange, categories, onCreated, defaultKind = 'expense' }) => {
    const [name, setName] = useState('');
    const [kind, setKind] = useState(defaultKind);
    const [adding, setAdding] = useState(false);

    useEffect(() => setKind(defaultKind), [defaultKind]);

    const options = Object.keys(KIND_LABELS)
        .map((k) => ({
            label: KIND_LABELS[k],
            options: categories
                .filter((c) => c.kind === k && (c.is_active || c.code === value))
                .map((c) => ({ value: c.code, label: c.name, color: c.color })),
        }))
        .filter((group) => group.options.length > 0);

    const addCategory = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setAdding(true);
        try {
            const res = await api.post('/finance/bank-categories', { name: trimmed, kind });
            setName('');
            await onCreated?.();
            onChange(res.data.code);
            message.success(`Статья «${res.data.name}» добавлена`);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось добавить статью');
        } finally {
            setAdding(false);
        }
    };

    return (
        <Select
            showSearch
            placeholder="Выберите статью"
            style={{ width: '100%' }}
            value={value}
            onChange={onChange}
            options={options}
            optionFilterProp="label"
            optionRender={(opt) => (
                <Space size={6}>
                    <span
                        style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: opt.data.color || DEFAULT_COLOR,
                        }}
                    />
                    {opt.label}
                </Space>
            )}
            dropdownRender={(menu) => (
                <>
                    {menu}
                    <div className="exp-picker-add" onMouseDown={(e) => e.stopPropagation()}>
                        <Input
                            size="small"
                            placeholder="Новая статья, например «Сайт»"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onPressEnter={addCategory}
                        />
                        <Radio.Group
                            size="small"
                            value={kind}
                            onChange={(e) => setKind(e.target.value)}
                            optionType="button"
                            options={[
                                { value: 'expense', label: 'Расход' },
                                { value: 'income', label: 'Доход' },
                            ]}
                        />
                        <Button size="small" type="primary" icon={<PlusOutlined />} loading={adding}
                            disabled={!name.trim()} onClick={addCategory}>
                            Добавить
                        </Button>
                    </div>
                </>
            )}
        />
    );
};

/**
 * Поля «статья + запомнить контрагента». Состояние держит родитель:
 * value = { code, remember } (remember: 'inn' | 'name' | null).
 */
export const CategorizeFields = ({ txn, value, onChange, categories, onCategoriesChanged }) => {
    const canRemember = Boolean(rememberDefault(txn));
    const defaultKind = txn?.direction === 'incoming' ? 'income' : 'expense';
    const label = txn?.counterparty_inn
        ? `ИНН ${txn.counterparty_inn}`
        : 'это название контрагента';
    return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <CategoryPicker
                value={value.code}
                onChange={(code) => onChange({ ...value, code })}
                categories={categories}
                onCreated={onCategoriesChanged}
                defaultKind={defaultKind}
            />
            {canRemember && (
                <div className="bank-match-line">
                    <Text style={{ fontSize: 13 }}>
                        Запомнить {label}: прошлые и будущие операции пойдут в эту статью
                    </Text>
                    <Switch
                        size="small"
                        checked={Boolean(value.remember)}
                        onChange={(on) => onChange({ ...value, remember: on ? rememberDefault(txn) : null })}
                    />
                </div>
            )}
        </Space>
    );
};

/** Окно «Изменить статью» для одной операции (используется в детализации). */
export const CategorizeModal = ({ txn, categories, onClose, onSaved, onCategoriesChanged }) => {
    const [value, setValue] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (txn) setValue(initialCategorize(txn)); }, [txn]);

    const save = async (reset = false) => {
        if (!reset && !value.code) {
            message.warning('Выберите статью');
            return;
        }
        setSaving(true);
        try {
            const res = await categorizeTransaction(txn.statement_id, txn.id, {
                category_code: reset ? null : value.code,
                remember: reset ? null : value.remember,
                apply_to_past: true,
            });
            message.success(reset ? 'Статья снята' : categorizeMessage(res.data));
            onSaved?.();
            onClose();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Статья операции"
            open={Boolean(txn)}
            onCancel={onClose}
            width={520}
            destroyOnClose
            footer={[
                txn?.category && (
                    <Button key="reset" onClick={() => save(true)} disabled={saving}>Снять статью</Button>
                ),
                <Button key="cancel" onClick={onClose}>Отмена</Button>,
                <Button key="ok" type="primary" loading={saving} onClick={() => save(false)}>Сохранить</Button>,
            ]}
        >
            {txn && (
                <div className="bank-match-summary">
                    <div className="bank-match-line">
                        <Text strong style={{ color: txn.direction === 'incoming' ? '#27ae60' : '#c0392b' }}>
                            {txn.direction === 'incoming' ? '+' : '−'}
                            {Number(txn.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
                        </Text>
                        <Text type="secondary">{txn.value_date}</Text>
                    </div>
                    <div style={{ marginTop: 4 }}><Text strong>{txn.counterparty_name || '—'}</Text></div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{txn.purpose}</Text>
                </div>
            )}
            <div style={{ marginTop: 12 }}>
                <CategorizeFields
                    txn={txn}
                    value={value}
                    onChange={setValue}
                    categories={categories}
                    onCategoriesChanged={onCategoriesChanged}
                />
            </div>
        </Modal>
    );
};

/** Справочник статей и запомненные правила. */
export const CategoriesManager = ({ open, onClose, onChanged }) => {
    const { categories, reload } = useBankCategories();
    const [rules, setRules] = useState([]);
    const [name, setName] = useState('');
    const [kind, setKind] = useState('expense');
    const [busy, setBusy] = useState(false);

    const loadRules = useCallback(async () => {
        try {
            const res = await api.get('/finance/bank-category-rules');
            setRules(res.data || []);
        } catch {
            setRules([]);
        }
    }, []);

    useEffect(() => { if (open) { reload(); loadRules(); } }, [open, reload, loadRules]);

    const changed = async () => {
        await Promise.all([reload(), loadRules()]);
        onChanged?.();
    };

    const patch = async (id, data) => {
        try {
            await api.patch(`/finance/bank-categories/${id}`, data);
            await changed();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Ошибка');
        }
    };

    const add = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await api.post('/finance/bank-categories', { name: name.trim(), kind });
            setName('');
            await changed();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось добавить');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        try {
            await api.delete(`/finance/bank-categories/${id}`);
            await changed();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось удалить');
        }
    };

    const removeRule = async (id) => {
        await api.delete(`/finance/bank-category-rules/${id}`);
        await changed();
    };

    const applyRules = async () => {
        try {
            const res = await api.post('/finance/bank-category-rules/apply');
            message.success(`Разнесено операций: ${res.data?.updated || 0}`);
            await changed();
        } catch {
            message.error('Не удалось применить правила');
        }
    };

    const categoryColumns = [
        {
            title: '',
            dataIndex: 'color',
            width: 40,
            render: (v, rec) => (
                <input
                    type="color"
                    value={v || DEFAULT_COLOR}
                    onChange={(e) => patch(rec.id, { color: e.target.value })}
                    className="exp-color-input"
                    aria-label="Цвет статьи"
                />
            ),
        },
        {
            title: 'Статья',
            dataIndex: 'name',
            render: (v, rec) => (
                <Input
                    size="small"
                    defaultValue={v}
                    key={`${rec.id}-${v}`}
                    variant="borderless"
                    onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== v) patch(rec.id, { name: next });
                    }}
                    onPressEnter={(e) => e.target.blur()}
                />
            ),
        },
        {
            title: 'Тип',
            dataIndex: 'kind',
            width: 100,
            render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{KIND_LABELS[v]}</Text>,
        },
        {
            title: 'Операций',
            dataIndex: 'operations_count',
            width: 82,
            align: 'right',
            render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>,
        },
        {
            title: 'Показывать',
            dataIndex: 'is_active',
            width: 92,
            align: 'center',
            render: (v, rec) => <Switch size="small" checked={v} onChange={(on) => patch(rec.id, { is_active: on })} />,
        },
        {
            title: '',
            width: 44,
            align: 'center',
            render: (_, rec) =>
                rec.is_system ? null : (
                    <Popconfirm title="Удалить статью?" okText="Удалить" cancelText="Отмена" onConfirm={() => remove(rec.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                ),
        },
    ];

    const ruleColumns = [
        {
            title: 'Если',
            dataIndex: 'match_type',
            width: '44%',
            render: (v, rec) => (
                <Tooltip title={rec.pattern}>
                    <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v === 'inn' ? 'ИНН' : v === 'name' ? 'Название' : 'Назначение'}: {rec.pattern}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: 'То статья',
            dataIndex: 'category_name',
            render: (v, rec) => <Text style={{ fontSize: 12 }}>{v || rec.category_code}</Text>,
        },
        {
            title: '',
            width: 44,
            align: 'center',
            render: (_, rec) => (
                <Tooltip title="Забыть правило">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRule(rec.id)} />
                </Tooltip>
            ),
        },
    ];

    return (
        <Modal
            title="Статьи расходов и доходов"
            open={open}
            onCancel={onClose}
            footer={null}
            width="min(760px, 96vw)"
            destroyOnClose
        >
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                <Input
                    placeholder="Новая статья: аренда склада, юрист, интернет…"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onPressEnter={add}
                />
                <Select
                    value={kind}
                    onChange={setKind}
                    style={{ width: 110 }}
                    options={[
                        { value: 'expense', label: 'Расход' },
                        { value: 'income', label: 'Доход' },
                    ]}
                />
                <Button type="primary" icon={<PlusOutlined />} loading={busy} onClick={add} disabled={!name.trim()}>
                    Добавить
                </Button>
            </Space.Compact>

            <Table
                className="compact-table"
                size="small"
                rowKey="id"
                tableLayout="fixed"
                pagination={false}
                dataSource={categories}
                columns={categoryColumns}
                scroll={{ y: 300 }}
            />

            <div className="exp-rules-head">
                <Text strong>Запомненные правила</Text>
                <Tooltip title="Прогнать правила по всем ещё не разнесённым операциям">
                    <Button size="small" icon={<ThunderboltOutlined />} onClick={applyRules}>Применить ко всем</Button>
                </Tooltip>
            </div>
            <Table
                className="compact-table"
                size="small"
                rowKey="id"
                tableLayout="fixed"
                pagination={false}
                dataSource={rules}
                columns={ruleColumns}
                locale={{ emptyText: 'Правил пока нет: они появляются, когда вы относите операцию на статью с «Запомнить»' }}
                scroll={{ y: 200 }}
            />
        </Modal>
    );
};
