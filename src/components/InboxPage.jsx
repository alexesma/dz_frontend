import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Drawer,
    Form,
    Input,
    Modal,
    Radio,
    Select,
    Slider,
    Space,
    Steps,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    FileOutlined,
    InfoCircleOutlined,
    PaperClipOutlined,
    QuestionCircleOutlined,
    ReloadOutlined,
    RobotOutlined,
    SettingOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { getEmailAccounts } from '../api/emailAccounts';
import {
    fetchInboxEmails,
    getInboxEmailDetail,
    getInboxEmails,
    getSetupOptions,
    setupEmailRule,
} from '../api/inbox';
import { formatMoscow } from '../utils/time';

const { Text, Paragraph } = Typography;

// Группы правил для удобства выбора в модальном окне
const RULE_GROUPS = [
    {
        label: '⚙️ Автоматическая обработка',
        description: 'Письмо будет обработано сразу',
        options: [
            {
                value: 'price_list',
                label: '📦 Прайс-лист',
                color: 'blue',
                description: 'Загрузить и обработать прайс-лист поставщика',
            },
            {
                value: 'order_reply',
                label: '📬 Ответ на заказ',
                color: 'green',
                description: 'Ответ поставщика (подтверждение / отказ / частично)',
            },
            {
                value: 'customer_order',
                label: '🛒 Заказ от клиента',
                color: 'cyan',
                description: 'Входящий заказ от клиента — создать CustomerOrder',
            },
            {
                value: 'document',
                label: '📄 Документ',
                color: 'purple',
                description: 'Накладная / счёт / акт / счёт-фактура от поставщика',
            },
            {
                value: 'shipment_notice',
                label: '🚚 Уведомление об отгрузке',
                color: 'geekblue',
                description: 'Поставщик сообщил об отгрузке / прислал трекинг',
            },
        ],
    },
    {
        label: '🔔 Уведомление менеджера',
        description: 'Менеджер получит уведомление, дальнейшая обработка вручную',
        options: [
            {
                value: 'claim',
                label: '⚠️ Претензия / рекламация',
                color: 'red',
                description: 'Жалоба на качество, брак, ошибку в поставке',
            },
            {
                value: 'error_report',
                label: '🐛 Ошибка',
                color: 'orange',
                description: 'Сообщение об ошибке от поставщика или клиента',
            },
            {
                value: 'inquiry',
                label: '❓ Вопрос',
                color: 'gold',
                description: 'Входящий вопрос, требующий ответа',
            },
            {
                value: 'proposal',
                label: '💡 Предложение',
                color: 'lime',
                description: 'Коммерческое предложение или спецусловия',
            },
        ],
    },
    {
        label: '🗑️ Служебные',
        description: 'Письмо не требует обработки',
        options: [
            {
                value: 'spam',
                label: '🚫 Спам',
                color: 'default',
                description: 'Нежелательное письмо, скрыть',
            },
            {
                value: 'ignore',
                label: '⏭️ Игнорировать',
                color: 'default',
                description: 'Нерелевантное письмо, пометить и не трогать',
            },
        ],
    },
];

// Плоский список всех опций для быстрого поиска
const RULE_OPTIONS = RULE_GROUPS.flatMap(g => g.options);

// Автоматически строим из RULE_OPTIONS чтобы не дублировать
const RULE_COLORS = Object.fromEntries(RULE_OPTIONS.map(o => [o.value, o.color]));
const RULE_LABELS = Object.fromEntries(
    RULE_OPTIONS.map(o => [o.value, o.label.replace(/^[\p{Emoji}\s]+/u, '').trim()])
);

// Правила, требующие выбора поставщика на шаге 2
const RULES_WITH_PROVIDER = new Set(['price_list', 'order_reply', 'document', 'shipment_notice']);
// Правила, требующие выбора клиента на шаге 2
const RULES_WITH_CUSTOMER = new Set(['customer_order']);
// Правила с расширенным шагом 2 (и те и другие)
const RULES_NEEDS_CONFIG = new Set([...RULES_WITH_PROVIDER, ...RULES_WITH_CUSTOMER]);

const DEFAULT_DAYS = 3;
const DEFAULT_PAGE_SIZE = 50;

const InboxPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [days, setDays] = useState(DEFAULT_DAYS);
    const [emails, setEmails] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [fetchingFromServer, setFetchingFromServer] = useState(false);

    // Детали письма
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Мастер назначения правила
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [ruleTarget, setRuleTarget] = useState(null);
    const [wizardStep, setWizardStep] = useState(0);   // 0=выбор типа, 1=настройка
    const [ruleType, setRuleType] = useState('price_list');
    const [savePattern, setSavePattern] = useState(true);
    const [assigningRule, setAssigningRule] = useState(false);

    // Данные для шага 2
    const [setupOptions, setSetupOptions] = useState({ providers: [], customers: [] });
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [providerConfig, setProviderConfig] = useState({
        provider_id: null, subject_pattern: '', filename_pattern: '',
    });
    const [customerConfig, setCustomerConfig] = useState({
        customer_id: null, subject_pattern: '', filename_pattern: '',
    });

    // Загрузка почтовых ящиков
    useEffect(() => {
        getEmailAccounts()
            .then(({ data }) => setAccounts(data || []))
            .catch(() => message.error('Не удалось загрузить список ящиков'));
    }, []);

    // Загрузка писем
    const loadEmails = useCallback(
        async (nextPage = 1, nextSize = pageSize) => {
            setLoadingEmails(true);
            try {
                const { data } = await getInboxEmails({
                    email_account_id: selectedAccountId ?? undefined,
                    days,
                    page: nextPage,
                    page_size: nextSize,
                });
                setEmails(data.items || []);
                setTotal(data.total || 0);
            } catch {
                message.error('Не удалось загрузить письма');
            } finally {
                setLoadingEmails(false);
            }
        },
        [selectedAccountId, days, pageSize]
    );

    useEffect(() => {
        setPage(1);
        loadEmails(1, pageSize);
    }, [selectedAccountId, days]); // eslint-disable-line react-hooks/exhaustive-deps

    // Принудительная загрузка с сервера
    const handleFetchFromServer = async () => {
        setFetchingFromServer(true);
        try {
            const { data } = await fetchInboxEmails({
                email_account_id: selectedAccountId ?? null,
                days,
            });
            message.success(
                `Загружено: ${data.fetched} писем, ` +
                `сохранено: ${data.stored}, ` +
                `авто-обработано: ${data.auto_processed}`
            );
            setPage(1);
            await loadEmails(1, pageSize);
        } catch {
            message.error('Ошибка загрузки писем с сервера');
        } finally {
            setFetchingFromServer(false);
        }
    };

    // Открыть детали письма
    const handleOpenDetail = async (emailId) => {
        setDrawerOpen(true);
        setSelectedEmail(null);
        setLoadingDetail(true);
        try {
            const { data } = await getInboxEmailDetail(emailId);
            setSelectedEmail(data);
        } catch {
            message.error('Не удалось загрузить детали письма');
        } finally {
            setLoadingDetail(false);
        }
    };

    // Открыть мастер назначения правила
    const handleOpenRuleModal = async (email, e) => {
        e.stopPropagation();
        const firstAtt = email.attachment_info?.[0]?.name || '';
        setRuleTarget(email);
        setRuleType(email.rule_type || 'price_list');
        setSavePattern(true);
        setWizardStep(0);
        setProviderConfig({ provider_id: null, subject_pattern: email.subject || '', filename_pattern: firstAtt });
        setCustomerConfig({ customer_id: null, subject_pattern: email.subject || '', filename_pattern: firstAtt });
        setRuleModalOpen(true);

        // Загружаем поставщиков/клиентов (кешируем — грузим один раз)
        if (setupOptions.providers.length === 0 && setupOptions.customers.length === 0) {
            setLoadingOptions(true);
            try {
                const { data } = await getSetupOptions();
                setSetupOptions(data || { providers: [], customers: [] });
            } catch {
                message.warning('Не удалось загрузить список поставщиков/клиентов');
            } finally {
                setLoadingOptions(false);
            }
        }
    };

    // Шаг 1 → шаг 2 (или сразу применить для простых правил)
    const handleWizardNext = () => {
        if (RULES_NEEDS_CONFIG.has(ruleType)) {
            setWizardStep(1);
        } else {
            handleApplyRule();
        }
    };

    // Финальное применение правила
    const handleApplyRule = async () => {
        if (!ruleTarget) return;
        setAssigningRule(true);
        try {
            const payload = {
                rule_type: ruleType,
                save_pattern: savePattern,
                provider_config: RULES_WITH_PROVIDER.has(ruleType) ? providerConfig : null,
                customer_config: RULES_WITH_CUSTOMER.has(ruleType) ? customerConfig : null,
            };

            const { data } = await setupEmailRule(ruleTarget.id, payload);

            // Формируем сообщение об успехе
            const configNotes = (data.configs_set || []).map(c => c.note).filter(Boolean);
            const baseMsg = data.processing_error
                ? `Правило назначено, но ошибка обработки: ${data.processing_error}`
                : `Правило «${RULE_LABELS[ruleType]}» применено${data.processed ? ' и обработано' : ''}`;

            message.success(baseMsg, 4);
            if (configNotes.length > 0) {
                configNotes.forEach(note => message.info(note, 6));
            }

            setRuleModalOpen(false);
            setRuleTarget(null);
            setWizardStep(0);
            await loadEmails(page, pageSize);
        } catch {
            message.error('Ошибка применения правила');
        } finally {
            setAssigningRule(false);
        }
    };

    // Колонки таблицы
    const columns = [
        {
            title: 'Статус',
            key: 'status',
            width: 70,
            align: 'center',
            render: (_, record) => {
                if (record.processed) {
                    return (
                        <Tooltip title="Обработано">
                            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                        </Tooltip>
                    );
                }
                if (record.rule_type) {
                    return (
                        <Tooltip title="Правило назначено, ожидает обработки">
                            <ClockCircleOutlined style={{ color: '#faad14', fontSize: 16 }} />
                        </Tooltip>
                    );
                }
                return (
                    <Tooltip title="Без правила">
                        <QuestionCircleOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />
                    </Tooltip>
                );
            },
        },
        {
            title: 'От кого',
            key: 'from',
            width: 220,
            render: (_, record) => (
                <div>
                    {record.from_name && (
                        <div style={{ fontWeight: 500 }}>{record.from_name}</div>
                    )}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.from_email}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Тема',
            key: 'subject',
            render: (_, record) => (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text
                        style={{ cursor: 'pointer', color: '#1677ff' }}
                        onClick={() => handleOpenDetail(record.id)}
                    >
                        {record.subject || '(без темы)'}
                    </Text>
                    {record.has_attachments && (
                        <Space size={4}>
                            <PaperClipOutlined style={{ color: '#8c8c8c' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {record.attachment_info?.length || 0} вложений
                            </Text>
                        </Space>
                    )}
                </Space>
            ),
        },
        {
            title: 'Получено',
            dataIndex: 'received_at',
            key: 'received_at',
            width: 160,
            render: (val) => (
                <Text style={{ fontSize: 12 }}>{formatMoscow(val)}</Text>
            ),
        },
        {
            title: 'Правило',
            key: 'rule',
            width: 160,
            render: (_, record) => {
                if (!record.rule_type) {
                    return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
                }
                return (
                    <Space direction="vertical" size={2}>
                        <Tag color={RULE_COLORS[record.rule_type]}>
                            {RULE_LABELS[record.rule_type]}
                        </Tag>
                        {record.rule_auto_detected && (
                            <Tooltip title="Назначено системой автоматически">
                                <Tag icon={<RobotOutlined />} color="purple" style={{ fontSize: 11 }}>
                                    авто
                                </Tag>
                            </Tooltip>
                        )}
                        {!record.rule_auto_detected && record.rule_set_by_id && (
                            <Tooltip title="Назначено менеджером">
                                <Tag icon={<UserOutlined />} style={{ fontSize: 11 }}>
                                    вручную
                                </Tag>
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Действие',
            key: 'action',
            width: 130,
            render: (_, record) => (
                <Button
                    size="small"
                    type={record.rule_type ? 'default' : 'primary'}
                    onClick={(e) => handleOpenRuleModal(record, e)}
                >
                    {record.rule_type ? 'Изменить правило' : 'Назначить правило'}
                </Button>
            ),
        },
    ];

    const accountOptions = [
        { value: null, label: 'Все ящики' },
        ...accounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.email})`,
        })),
    ];

    return (
        <div style={{ padding: '0 0 24px 0' }}>
            {/* Заголовок и фильтры */}
            <Card
                bodyStyle={{ padding: '16px 20px' }}
                style={{ marginBottom: 16, borderRadius: 8 }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: 16,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Выбор ящика */}
                        <div>
                            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                                Почтовый ящик
                            </div>
                            <Select
                                style={{ minWidth: 260 }}
                                value={selectedAccountId}
                                onChange={(val) => {
                                    setSelectedAccountId(val);
                                }}
                                options={accountOptions}
                                placeholder="Выберите ящик"
                            />
                        </div>

                        {/* Глубина */}
                        <div style={{ minWidth: 220 }}>
                            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                                Глубина: <b>{days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</b>
                            </div>
                            <Slider
                                min={1}
                                max={7}
                                value={days}
                                onChange={setDays}
                                marks={{ 1: '1д', 3: '3д', 7: '7д' }}
                                style={{ margin: '4px 0 0 0' }}
                            />
                        </div>
                    </div>

                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={fetchingFromServer}
                        onClick={handleFetchFromServer}
                    >
                        Загрузить с сервера
                    </Button>
                </div>
            </Card>

            {/* Таблица писем */}
            <Card
                title={
                    <Space>
                        <span>Входящие письма</span>
                        <Badge count={total} style={{ backgroundColor: '#1677ff' }} />
                    </Space>
                }
                bodyStyle={{ padding: 0 }}
                style={{ borderRadius: 8 }}
            >
                <Table
                    rowKey="id"
                    loading={loadingEmails}
                    dataSource={emails}
                    columns={columns}
                    size="middle"
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: ['25', '50', '100'],
                        showTotal: (t) => `Всего ${t} писем`,
                        onChange: (p, size) => {
                            setPage(p);
                            setPageSize(size);
                            loadEmails(p, size);
                        },
                    }}
                    rowClassName={(record) =>
                        !record.rule_type ? 'inbox-row-unprocessed' : ''
                    }
                />
            </Card>

            {/* Drawer: детали письма */}
            <Drawer
                title="Детали письма"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={580}
                extra={
                    selectedEmail && !selectedEmail.rule_type && (
                        <Button
                            type="primary"
                            onClick={(e) => {
                                setDrawerOpen(false);
                                handleOpenRuleModal(selectedEmail, e);
                            }}
                        >
                            Назначить правило
                        </Button>
                    )
                }
            >
                {loadingDetail ? (
                    <div style={{ textAlign: 'center', paddingTop: 48 }}>
                        <Spin size="large" />
                    </div>
                ) : selectedEmail ? (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Text type="secondary">От кого</Text>
                            <div>
                                {selectedEmail.from_name && (
                                    <strong>{selectedEmail.from_name} </strong>
                                )}
                                <Text type="secondary">&lt;{selectedEmail.from_email}&gt;</Text>
                            </div>
                        </div>
                        <div>
                            <Text type="secondary">Тема</Text>
                            <div>
                                <strong>{selectedEmail.subject || '(без темы)'}</strong>
                            </div>
                        </div>
                        <div>
                            <Text type="secondary">Получено</Text>
                            <div>{formatMoscow(selectedEmail.received_at)}</div>
                        </div>

                        {selectedEmail.rule_type && (
                            <div>
                                <Text type="secondary">Правило</Text>
                                <div>
                                    <Tag color={RULE_COLORS[selectedEmail.rule_type]}>
                                        {RULE_LABELS[selectedEmail.rule_type]}
                                    </Tag>
                                    {selectedEmail.rule_auto_detected && (
                                        <Tag icon={<RobotOutlined />} color="purple">авто</Tag>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedEmail.has_attachments && (
                            <div>
                                <Text type="secondary">Вложения</Text>
                                <Space wrap style={{ marginTop: 4 }}>
                                    {(selectedEmail.attachment_info || []).map((att, idx) => (
                                        <Tag key={idx} icon={<FileOutlined />}>
                                            {att.name}
                                            {att.size ? ` (${Math.round(att.size / 1024)} KB)` : ''}
                                        </Tag>
                                    ))}
                                </Space>
                            </div>
                        )}

                        {selectedEmail.processing_result && (
                            <div>
                                <Text type="secondary">Результат обработки</Text>
                                <pre
                                    style={{
                                        background: '#f5f5f5',
                                        padding: 12,
                                        borderRadius: 6,
                                        fontSize: 12,
                                        overflow: 'auto',
                                        maxHeight: 200,
                                    }}
                                >
                                    {JSON.stringify(selectedEmail.processing_result, null, 2)}
                                </pre>
                            </div>
                        )}

                        {selectedEmail.processing_error && (
                            <div>
                                <Text type="danger">Ошибка обработки</Text>
                                <div>
                                    <Text type="danger">{selectedEmail.processing_error}</Text>
                                </div>
                            </div>
                        )}

                        <div>
                            <Text type="secondary">Содержимое письма</Text>
                            <div
                                style={{
                                    marginTop: 8,
                                    padding: 12,
                                    background: '#fafafa',
                                    borderRadius: 6,
                                    border: '1px solid #f0f0f0',
                                    maxHeight: 300,
                                    overflow: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    fontSize: 13,
                                }}
                            >
                                {selectedEmail.body_full ||
                                    selectedEmail.body_preview ||
                                    <Text type="secondary">(пусто)</Text>}
                            </div>
                        </div>
                    </Space>
                ) : null}
            </Drawer>

            {/* Modal: мастер назначения правила */}
            <Modal
                open={ruleModalOpen}
                title={
                    <Space>
                        <SettingOutlined />
                        <span>Настройка правила для письма</span>
                    </Space>
                }
                onCancel={() => { setRuleModalOpen(false); setWizardStep(0); }}
                footer={null}
                width={640}
                destroyOnClose
            >
                {ruleTarget && (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>

                        {/* Карточка письма */}
                        <div style={{ padding: '10px 14px', background: '#f5f5f5', borderRadius: 6 }}>
                            <div><Text type="secondary">От: </Text><strong>{ruleTarget.from_email}</strong></div>
                            <div><Text type="secondary">Тема: </Text>{ruleTarget.subject || '(без темы)'}</div>
                            {ruleTarget.has_attachments && (
                                <div>
                                    <Text type="secondary">Вложения: </Text>
                                    {(ruleTarget.attachment_info || []).map(a => a.name).join(', ')}
                                </div>
                            )}
                        </div>

                        {/* Шаги */}
                        <Steps
                            size="small"
                            current={wizardStep}
                            items={[
                                { title: 'Тип правила' },
                                { title: 'Настройка' },
                            ]}
                        />

                        {/* ─────────────── ШАГ 0: выбор типа правила ─────────────── */}
                        {wizardStep === 0 && (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                {RULE_GROUPS.map((group) => (
                                    <div key={group.label}>
                                        <Divider orientation="left" orientationMargin={0} style={{ margin: '4px 0 8px' }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>{group.label}</Text>
                                        </Divider>
                                        <Radio.Group
                                            value={ruleType}
                                            onChange={(e) => setRuleType(e.target.value)}
                                            style={{ width: '100%' }}
                                        >
                                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                {group.options.map((opt) => (
                                                    <Radio
                                                        key={opt.value}
                                                        value={opt.value}
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderRadius: 6,
                                                            background: ruleType === opt.value ? '#e6f4ff' : 'transparent',
                                                            width: '100%',
                                                        }}
                                                    >
                                                        <Space>
                                                            <Tag color={opt.color} style={{ minWidth: 110, textAlign: 'center' }}>
                                                                {opt.label}
                                                            </Tag>
                                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                                {opt.description}
                                                            </Text>
                                                        </Space>
                                                    </Radio>
                                                ))}
                                            </Space>
                                        </Radio.Group>
                                    </div>
                                ))}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                                    <Button onClick={() => setRuleModalOpen(false)}>Отмена</Button>
                                    <Button
                                        type="primary"
                                        onClick={handleWizardNext}
                                    >
                                        {RULES_NEEDS_CONFIG.has(ruleType) ? 'Далее →' : 'Применить'}
                                    </Button>
                                </div>
                            </Space>
                        )}

                        {/* ─────────────── ШАГ 1: настройка ─────────────── */}
                        {wizardStep === 1 && (
                            <Space direction="vertical" size={14} style={{ width: '100%' }}>

                                {/* Форма для price_list / order_reply / document / shipment_notice */}
                                {RULES_WITH_PROVIDER.has(ruleType) && (
                                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                        <Alert
                                            type="info"
                                            showIcon
                                            icon={<InfoCircleOutlined />}
                                            message={
                                                ruleType === 'price_list'
                                                    ? 'Выберите поставщика. Email будет привязан к нему — следующие прайсы определятся автоматически.'
                                                    : 'Укажите поставщика, чтобы система связывала будущие письма от него с этим правилом.'
                                            }
                                        />

                                        <div>
                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                Поставщик <Text type="danger">*</Text>
                                            </div>
                                            <Select
                                                style={{ width: '100%' }}
                                                loading={loadingOptions}
                                                showSearch
                                                optionFilterProp="label"
                                                placeholder="Выберите поставщика"
                                                value={providerConfig.provider_id}
                                                onChange={(val) => setProviderConfig(p => ({ ...p, provider_id: val }))}
                                                options={setupOptions.providers.map(p => ({
                                                    value: p.id,
                                                    label: p.email
                                                        ? `${p.name} (${p.email})`
                                                        : p.name,
                                                }))}
                                            />
                                        </div>

                                        {ruleType === 'price_list' && (
                                            <>
                                                <div>
                                                    <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                        Паттерн темы письма
                                                        <Tooltip title="Часть темы, по которой система будет узнавать прайс (например: 'Прайс' или 'Price list')">
                                                            <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                                                        </Tooltip>
                                                    </div>
                                                    <Input
                                                        value={providerConfig.subject_pattern}
                                                        onChange={(e) => setProviderConfig(p => ({ ...p, subject_pattern: e.target.value }))}
                                                        placeholder="например: Прайс-лист"
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                        Паттерн имени файла
                                                        <Tooltip title="Часть имени файла, по которой система находит нужный файл во вложении (например: 'price' или 'прайс')">
                                                            <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                                                        </Tooltip>
                                                    </div>
                                                    <Input
                                                        value={providerConfig.filename_pattern}
                                                        onChange={(e) => setProviderConfig(p => ({ ...p, filename_pattern: e.target.value }))}
                                                        placeholder="например: price.xlsx"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </Space>
                                )}

                                {/* Форма для customer_order */}
                                {RULES_WITH_CUSTOMER.has(ruleType) && (
                                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                        <Alert
                                            type="info"
                                            showIcon
                                            icon={<InfoCircleOutlined />}
                                            message="Выберите клиента. Email будет добавлен в его конфигурацию заказов — следующие заказы определятся автоматически."
                                        />

                                        <div>
                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                Клиент <Text type="danger">*</Text>
                                            </div>
                                            <Select
                                                style={{ width: '100%' }}
                                                loading={loadingOptions}
                                                showSearch
                                                optionFilterProp="label"
                                                placeholder="Выберите клиента"
                                                value={customerConfig.customer_id}
                                                onChange={(val) => setCustomerConfig(c => ({ ...c, customer_id: val }))}
                                                options={setupOptions.customers.map(c => ({
                                                    value: c.id,
                                                    label: c.name,
                                                }))}
                                            />
                                        </div>

                                        <div>
                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                Паттерн темы (regex)
                                                <Tooltip title="Регулярное выражение для темы письма. Например: 'Заказ|Order'. Оставьте пустым чтобы принимать все письма от этого клиента.">
                                                    <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                                                </Tooltip>
                                            </div>
                                            <Input
                                                value={customerConfig.subject_pattern}
                                                onChange={(e) => setCustomerConfig(c => ({ ...c, subject_pattern: e.target.value }))}
                                                placeholder="например: Заказ|Order"
                                            />
                                        </div>

                                        <div>
                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                Паттерн файла (regex)
                                                <Tooltip title="Регулярное выражение для имени файла во вложении. Например: '\.xlsx$'">
                                                    <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                                                </Tooltip>
                                            </div>
                                            <Input
                                                value={customerConfig.filename_pattern}
                                                onChange={(e) => setCustomerConfig(c => ({ ...c, filename_pattern: e.target.value }))}
                                                placeholder="например: \.xlsx$"
                                            />
                                        </div>
                                    </Space>
                                )}

                                {/* Запомнить паттерн */}
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        background: '#e6f4ff',
                                        borderRadius: 6,
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        id="save-pattern"
                                        checked={savePattern}
                                        style={{ marginTop: 3 }}
                                        onChange={(e) => setSavePattern(e.target.checked)}
                                    />
                                    <label htmlFor="save-pattern" style={{ cursor: 'pointer', margin: 0 }}>
                                        <strong>Запомнить паттерн</strong> — система будет автоматически
                                        определять похожие письма и обрабатывать их без участия менеджера
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                                    <Button onClick={() => setWizardStep(0)}>← Назад</Button>
                                    <Space>
                                        <Button onClick={() => setRuleModalOpen(false)}>Отмена</Button>
                                        <Button
                                            type="primary"
                                            loading={assigningRule}
                                            onClick={handleApplyRule}
                                        >
                                            Применить и сохранить
                                        </Button>
                                    </Space>
                                </div>
                            </Space>
                        )}

                    </Space>
                )}
            </Modal>

            <style>{`
                .inbox-row-unprocessed td {
                    background: #fffbe6 !important;
                }
                .inbox-row-unprocessed:hover td {
                    background: #fff1b8 !important;
                }
            `}</style>
        </div>
    );
};

export default InboxPage;
