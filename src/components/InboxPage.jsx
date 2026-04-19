import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Collapse,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
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
    forceProcessInboxEmail,
    fetchInboxEmails,
    getAttachmentPreview,
    getInboxEmailDetail,
    getInboxEmails,
    getProviderConfigs,
    getSetupOptions,
    setupEmailRule,
} from '../api/inbox';
import {
    getCustomerOrderConfigs,
    getCustomerPricelistConfigs,
} from '../api/customers';
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
const FORCE_PROCESS_RULES = new Set(['order_reply', 'customer_order', 'document']);
// Правила с расширенным шагом 2 (и те и другие)
const RULES_NEEDS_CONFIG = new Set([...RULES_WITH_PROVIDER, ...RULES_WITH_CUSTOMER]);

const DEFAULT_DAYS = 3;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_CONFIRM_KEYWORDS_TEXT = 'в наличии, есть, отгружаем, собрали, да';
const DEFAULT_REJECT_KEYWORDS_TEXT = 'нет, 0, отсутствует, не можем, снято с производства';
const DEFAULT_NEW_ORDER_CONFIG = {
    pricelist_config_id: null,
    order_start_row: 1,
    oem_col: null,
    brand_col: null,
    qty_col: null,
    name_col: null,
    price_col: null,
    ship_qty_col: null,
    reject_qty_col: null,
    order_number_column: null,
    order_number_row: null,
    order_date_column: null,
    order_date_row: null,
    order_number_source: null,
    order_number_regex_subject: '',
    order_number_regex_body: '',
    order_number_regex_filename: '',
    order_number_prefix: '',
    order_number_suffix: '',
    ship_mode: 'REPLACE_QTY',
    price_tolerance_pct: 2,
    price_warning_pct: 5,
    is_active: true,
};

const InboxPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [days, setDays] = useState(DEFAULT_DAYS);
    const [subjectContains, setSubjectContains] = useState('');
    const [senderContains, setSenderContains] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [selectedProviderId, setSelectedProviderId] = useState(null);
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
    const [wizardStep, setWizardStep] = useState(0);   // 0=тип, 1=настройка, 2=конфигурация
    const [ruleType, setRuleType] = useState('price_list');
    const [savePattern, setSavePattern] = useState(true);
    const [assigningRule, setAssigningRule] = useState(false);
    const [forceProcessingIds, setForceProcessingIds] = useState({});

    // Данные для шага 2
    const [setupOptions, setSetupOptions] = useState({ providers: [], customers: [] });
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [providerConfig, setProviderConfig] = useState({
        provider_id: null,
        subject_pattern: '',
        filename_pattern: '',
        response_type: 'file',
        confirm_keywords_text: DEFAULT_CONFIRM_KEYWORDS_TEXT,
        reject_keywords_text: DEFAULT_REJECT_KEYWORDS_TEXT,
        value_after_article_type: 'both',
        config_mode: 'skip',
        config_id: null,
        config_name: '',
        start_row: 1,
        oem_col: null,
        qty_col: null,
        price_col: null,
        brand_col: null,
        multiplicity_col: null,
        name_col: null,
        status_col: null,
        comment_col: null,
        document_number_col: null,
        document_date_col: null,
    });
    const [customerConfig, setCustomerConfig] = useState({
        customer_id: null,
        config_mode: 'existing',
        config_id: null,
        subject_pattern: '',
        filename_pattern: '',
        order_config: { ...DEFAULT_NEW_ORDER_CONFIG },
    });
    const [customerOrderConfigs, setCustomerOrderConfigs] = useState([]);
    const [customerPricelistConfigs, setCustomerPricelistConfigs] = useState([]);
    const [loadingCustomerSetupConfigs, setLoadingCustomerSetupConfigs] = useState(false);
    const [providerConfigs, setProviderConfigs] = useState([]);
    const [loadingProviderConfigs, setLoadingProviderConfigs] = useState(false);

    // Предпросмотр вложения
    const [attachmentPreview, setAttachmentPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [activeVisualField, setActiveVisualField] = useState('oem_col');

    // Загрузка почтовых ящиков
    useEffect(() => {
        getEmailAccounts()
            .then(({ data }) => setAccounts(data || []))
            .catch(() => message.error('Не удалось загрузить список ящиков'));

        setLoadingOptions(true);
        getSetupOptions()
            .then(({ data }) => {
                setSetupOptions(data || { providers: [], customers: [] });
            })
            .catch(() => {
                // Для страницы это не критично: можно загрузить позже из мастера.
            })
            .finally(() => setLoadingOptions(false));
    }, []);

    // Загрузка писем
    const loadEmails = useCallback(
        async (nextPage = 1, nextSize = pageSize, overrides = {}) => {
            setLoadingEmails(true);
            try {
                const effectiveSubject =
                    overrides.subjectContains ?? subjectContains;
                const effectiveSender = overrides.senderContains ?? senderContains;
                const effectiveCustomerId =
                    overrides.selectedCustomerId ?? selectedCustomerId;
                const effectiveProviderId =
                    overrides.selectedProviderId ?? selectedProviderId;
                const { data } = await getInboxEmails({
                    email_account_id: selectedAccountId ?? undefined,
                    days,
                    page: nextPage,
                    page_size: nextSize,
                    subject_contains: effectiveSubject.trim() || undefined,
                    sender_contains: effectiveSender.trim() || undefined,
                    customer_id: effectiveCustomerId ?? undefined,
                    provider_id: effectiveProviderId ?? undefined,
                });
                setEmails(data.items || []);
                setTotal(data.total || 0);
            } catch {
                message.error('Не удалось загрузить письма');
            } finally {
                setLoadingEmails(false);
            }
        },
        [
            selectedAccountId,
            days,
            pageSize,
            subjectContains,
            senderContains,
            selectedCustomerId,
            selectedProviderId,
        ]
    );

    useEffect(() => {
        setPage(1);
        loadEmails(1, pageSize);
    }, [selectedAccountId, days]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleApplySearchFilters = () => {
        setPage(1);
        loadEmails(1, pageSize);
    };

    const handleResetSearchFilters = () => {
        setSubjectContains('');
        setSenderContains('');
        setSelectedCustomerId(null);
        setSelectedProviderId(null);
        setPage(1);
        loadEmails(1, pageSize, {
            subjectContains: '',
            senderContains: '',
            selectedCustomerId: null,
            selectedProviderId: null,
        });
    };

    const loadCustomerSetupConfigs = async (customerId) => {
        if (!customerId) {
            setCustomerOrderConfigs([]);
            setCustomerPricelistConfigs([]);
            return;
        }
        setLoadingCustomerSetupConfigs(true);
        try {
            const [{ data: orderConfigs }, { data: pricelistConfigs }] = await Promise.all([
                getCustomerOrderConfigs(customerId),
                getCustomerPricelistConfigs(customerId),
            ]);
            const configs = orderConfigs || [];
            setCustomerOrderConfigs(configs);
            setCustomerPricelistConfigs(pricelistConfigs || []);

            // Автовыбор: если есть ровно одна конфигурация — сразу выбираем её
            if (configs.length === 1) {
                const cfg = configs[0];
                setCustomerConfig(c => ({
                    ...c,
                    config_mode: 'existing',
                    config_id: cfg.id,
                    order_config: {
                        pricelist_config_id: cfg.pricelist_config_id || null,
                        order_start_row: cfg.order_start_row || 1,
                        oem_col: cfg.oem_col || null,
                        brand_col: cfg.brand_col || null,
                        qty_col: cfg.qty_col || null,
                        name_col: cfg.name_col || null,
                        price_col: cfg.price_col || null,
                        ship_qty_col: cfg.ship_qty_col || null,
                        reject_qty_col: cfg.reject_qty_col || null,
                    },
                }));
            } else if (configs.length === 0) {
                // Нет конфигураций — переключаем в режим создания
                setCustomerConfig(c => ({
                    ...c,
                    config_mode: 'new',
                    config_id: null,
                }));
            }
        } catch {
            setCustomerOrderConfigs([]);
            setCustomerPricelistConfigs([]);
            message.warning('Не удалось загрузить конфигурации клиента');
        } finally {
            setLoadingCustomerSetupConfigs(false);
        }
    };

    // Загрузка конфигураций поставщика (для price_list / order_reply / document)
    const loadProviderConfigs = async (providerId, currentRuleType) => {
        const configRules = ['price_list', 'order_reply', 'document'];
        if (!providerId || !configRules.includes(currentRuleType)) {
            setProviderConfigs([]);
            return;
        }
        setLoadingProviderConfigs(true);
        try {
            const { data } = await getProviderConfigs(providerId, currentRuleType);
            const configs = data || [];
            setProviderConfigs(configs);
            if (configs.length === 1) {
                const cfg = configs[0];
                setProviderConfig(p => ({
                    ...p,
                    config_mode: 'existing',
                    config_id: cfg.id,
                    config_name: cfg.name_price || cfg.name || '',
                    filename_pattern: cfg.filename_pattern || '',
                    response_type: cfg.response_type || 'file',
                    confirm_keywords_text: (cfg.confirm_keywords || []).join(', ') || DEFAULT_CONFIRM_KEYWORDS_TEXT,
                    reject_keywords_text: (cfg.reject_keywords || []).join(', ') || DEFAULT_REJECT_KEYWORDS_TEXT,
                    value_after_article_type: cfg.value_after_article_type || 'both',
                    start_row: cfg.start_row || 1,
                    oem_col: cfg.oem_col || null,
                    qty_col: cfg.qty_col || null,
                    price_col: cfg.price_col || null,
                    brand_col: cfg.brand_col || null,
                    multiplicity_col: cfg.multiplicity_col || null,
                    name_col: cfg.name_col || null,
                    status_col: cfg.status_col || null,
                    comment_col: cfg.comment_col || null,
                    document_number_col: cfg.document_number_col || null,
                    document_date_col: cfg.document_date_col || null,
                }));
            } else if (configs.length > 1) {
                // При нескольких конфигах просим выбрать конкретный,
                // чтобы настройки не терялись в режиме "Не настраивать".
                setProviderConfig(p => ({
                    ...p,
                    config_mode: 'existing',
                    config_id: null,
                    config_name: '',
                    multiplicity_col: null,
                }));
            } else if (configs.length === 0) {
                setProviderConfig(p => ({
                    ...p,
                    config_mode: 'new',
                    config_id: null,
                    config_name: '',
                    filename_pattern: '',
                    response_type: currentRuleType === 'order_reply' ? 'file' : p.response_type,
                    confirm_keywords_text: DEFAULT_CONFIRM_KEYWORDS_TEXT,
                    reject_keywords_text: DEFAULT_REJECT_KEYWORDS_TEXT,
                    value_after_article_type: 'both',
                    multiplicity_col: null,
                }));
            }
        } catch {
            setProviderConfigs([]);
            message.warning('Не удалось загрузить конфигурации поставщика');
        } finally {
            setLoadingProviderConfigs(false);
        }
    };

    // Загрузка предпросмотра вложения
    const loadAttachmentPreview = async (email) => {
        const emailId = email?.id;
        if (!emailId) return;
        setLoadingPreview(true);
        setAttachmentPreview(null);
        setPreviewError('');
        const attachmentInfo = email?.attachment_info || [];
        const previewableIndexes = attachmentInfo
            .map((att, idx) => ({ idx, name: (att?.name || '').toLowerCase() }))
            .filter(({ name }) => (
                name.endsWith('.xlsx')
                || name.endsWith('.xls')
                || name.endsWith('.csv')
            ))
            .map(({ idx }) => idx);
        if (previewableIndexes.length === 0) {
            setPreviewError(
                'Во вложениях нет поддерживаемых файлов (XLS/XLSX/CSV). ' +
                'Добавьте шаблон файла и перезагрузите письмо.'
            );
            setLoadingPreview(false);
            return;
        }

        const errors = [];
        try {
            for (const idx of previewableIndexes) {
                try {
                    const { data } = await getAttachmentPreview(emailId, idx);
                    setAttachmentPreview(data);
                    return;
                } catch (err) {
                    const detail = err?.response?.data?.detail || err?.message;
                    errors.push(`#${idx + 1}: ${detail || 'ошибка чтения файла'}`);
                }
            }
            setPreviewError(
                'Не удалось прочитать ни одно вложение. ' +
                errors.slice(0, 2).join(' | ')
            );
        } catch (err) {
            setAttachmentPreview(null);
            const detail = err?.response?.data?.detail || err?.message;
            setPreviewError(
                `Ошибка предпросмотра вложения: ${detail || 'неизвестная ошибка'}`
            );
        } finally {
            setLoadingPreview(false);
        }
    };

    // Авто-загрузка предпросмотра при выборе правила требующего файл
    // (customer_order — шаги 1 и 2; price_list/order_reply/document — шаг 1)
    useEffect(() => {
        const isCustomerRule = RULES_WITH_CUSTOMER.has(ruleType);
        const providerNeedsFilePreview = (
            ['price_list', 'document'].includes(ruleType)
            || (ruleType === 'order_reply' && providerConfig.response_type !== 'text')
        );
        const shouldLoad = ruleTarget?.has_attachments
            && ruleTarget?.id
            && (
                (isCustomerRule && (wizardStep === 1 || wizardStep === 2))
                || (providerNeedsFilePreview && wizardStep === 1)
            );
        if (shouldLoad && !attachmentPreview && !loadingPreview) {
            loadAttachmentPreview(ruleTarget);
        }
    }, [wizardStep, ruleTarget?.id, ruleType, providerConfig.response_type]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setAttachmentPreview(null);
        setLoadingPreview(false);
        setProviderConfig({
            provider_id: null,
            subject_pattern: email.subject || '',
            filename_pattern: firstAtt,
            response_type: 'file',
            confirm_keywords_text: DEFAULT_CONFIRM_KEYWORDS_TEXT,
            reject_keywords_text: DEFAULT_REJECT_KEYWORDS_TEXT,
            value_after_article_type: 'both',
            config_mode: 'skip',
            config_id: null,
            config_name: '',
            start_row: 1,
            oem_col: null,
            qty_col: null,
            price_col: null,
            brand_col: null,
            multiplicity_col: null,
            name_col: null,
            status_col: null,
            comment_col: null,
            document_number_col: null,
            document_date_col: null,
        });
        setProviderConfigs([]);
        setCustomerConfig({
            customer_id: null,
            config_mode: 'existing',
            config_id: null,
            subject_pattern: email.subject || '',
            filename_pattern: firstAtt,
            order_config: { ...DEFAULT_NEW_ORDER_CONFIG },
        });
        setCustomerOrderConfigs([]);
        setCustomerPricelistConfigs([]);
        setAttachmentPreview(null);
        setPreviewError('');
        setActiveVisualField('oem_col');
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

    const handleForceProcess = async (email, e, allowReprocess) => {
        e.stopPropagation();
        if (!email?.id) return;
        const mode = allowReprocess ? 'reprocess' : 'check';

        setForceProcessingIds((prev) => ({ ...prev, [email.id]: mode }));
        try {
            const { data } = await forceProcessInboxEmail(email.id, {
                allow_reprocess: allowReprocess,
            });
            const result = data?.processing_result || {};
            const status = String(result.status || '');
            const triggeredCount = (result.triggered_config_ids || []).length;
            const failedCount = (result.failed_configs || []).length;
            const reason = result.reason || result.note || '';
            const missingConfig = status === 'missing_config';
            const partial = status === 'partially_triggered';
            const failed = status === 'failed';
            const prefix = allowReprocess ? 'Повторная обработка' : 'Проверка';

            if (data?.processing_error) {
                message.warning(
                    `${prefix}: выполнено с ошибками: ${data.processing_error}`
                );
            } else if (missingConfig) {
                message.warning(
                    reason || 'Не найден подходящий активный конфиг. Проверьте настройки.'
                );
            } else if (failed) {
                message.error(
                    reason || `${prefix}: не удалось выполнить обработку`
                );
            } else if (partial) {
                message.warning(
                    `${prefix}: частично выполнено: успешно ${triggeredCount}, `
                    + `ошибок ${failedCount}`
                );
            } else {
                message.success(
                    `${prefix}: запущено по конфигурациям ${triggeredCount}`
                );
            }
            await loadEmails(page, pageSize);
            if (drawerOpen && selectedEmail?.id === email.id) {
                const { data: detail } = await getInboxEmailDetail(email.id);
                setSelectedEmail(detail);
            }
        } catch {
            message.error('Ошибка принудительной обработки письма');
        } finally {
            setForceProcessingIds((prev) => {
                const next = { ...prev };
                delete next[email.id];
                return next;
            });
        }
    };

    // Навигация мастера по шагам
    const handleWizardNext = () => {
        if (wizardStep === 0) {
            if (RULES_NEEDS_CONFIG.has(ruleType)) {
                setWizardStep(1);
                return;
            }
            handleApplyRule();
            return;
        }
        if (wizardStep === 1) {
            if (RULES_WITH_CUSTOMER.has(ruleType)) {
                if (!customerConfig.customer_id) {
                    message.warning('Выберите клиента');
                    return;
                }
                setWizardStep(2);
                return;
            }
            handleApplyRule();
        }
    };

    const parseCommaSeparated = (value) =>
        String(value || '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);

    // Финальное применение правила
    const handleApplyRule = async () => {
        if (!ruleTarget) return;
        if (RULES_WITH_PROVIDER.has(ruleType)) {
            if (!providerConfig.provider_id) {
                message.warning('Выберите поставщика');
                return;
            }
            if (ruleType === 'price_list') {
                if (loadingProviderConfigs) {
                    message.warning(
                        'Подождите, загружаются конфигурации поставщика'
                    );
                    return;
                }
                if (providerConfig.config_mode === 'skip') {
                    message.warning(
                        'Для прайс-листа выберите режим: '
                        + '«Обновить готовую» или «Создать новую»'
                    );
                    return;
                }
            }
            if (['price_list', 'order_reply', 'document'].includes(ruleType)) {
                if (
                    providerConfig.config_mode === 'existing'
                    && !providerConfig.config_id
                ) {
                    message.warning('Выберите конфигурацию поставщика');
                    return;
                }
                if (
                    providerConfig.config_mode === 'new'
                    && ruleType === 'price_list'
                ) {
                    if (!String(providerConfig.config_name || '').trim()) {
                        message.warning(
                            'Для новой конфигурации прайс-листа укажите имя конфигурации'
                        );
                        return;
                    }
                    if (
                        !providerConfig.oem_col
                        || !providerConfig.qty_col
                        || !providerConfig.price_col
                    ) {
                        message.warning(
                            'Для новой конфигурации прайс-листа заполните: OEM, Кол-во и Цена'
                        );
                        return;
                    }
                }
            }
        }
        if (RULES_WITH_CUSTOMER.has(ruleType)) {
            if (!customerConfig.customer_id) {
                message.warning('Выберите клиента');
                return;
            }
            if (customerConfig.config_mode === 'existing' && !customerConfig.config_id) {
                message.warning('Выберите конфигурацию обработки заказа');
                return;
            }
            if (customerConfig.config_mode === 'new') {
                const oc = customerConfig.order_config || {};
                if (!oc.pricelist_config_id || !oc.oem_col || !oc.brand_col || !oc.qty_col) {
                    message.warning(
                        'Для новой конфигурации заполните: прайс клиента, OEM, Бренд и Кол-во'
                    );
                    return;
                }
            }
        }
        setAssigningRule(true);
        try {
            let payloadCustomerConfig = customerConfig;
            if (RULES_WITH_CUSTOMER.has(ruleType)) {
                payloadCustomerConfig = {
                    customer_id: customerConfig.customer_id,
                    config_mode: customerConfig.config_mode,
                    config_id: customerConfig.config_mode === 'existing'
                        ? customerConfig.config_id
                        : null,
                    subject_pattern: customerConfig.subject_pattern || null,
                    filename_pattern: customerConfig.filename_pattern || null,
                    order_config: customerConfig.config_mode === 'new'
                        ? customerConfig.order_config
                        : null,
                };
            }
            let payloadProviderConfig = providerConfig;
            if (RULES_WITH_PROVIDER.has(ruleType)) {
                payloadProviderConfig = {
                    ...providerConfig,
                    subject_pattern: String(providerConfig.subject_pattern || '').trim() || null,
                    filename_pattern: String(providerConfig.filename_pattern || '').trim() || null,
                    config_name: String(providerConfig.config_name || '').trim() || null,
                };
                if (ruleType === 'order_reply') {
                    payloadProviderConfig.confirm_keywords = parseCommaSeparated(
                        providerConfig.confirm_keywords_text
                    );
                    payloadProviderConfig.reject_keywords = parseCommaSeparated(
                        providerConfig.reject_keywords_text
                    );
                    payloadProviderConfig.value_after_article_type = (
                        providerConfig.value_after_article_type || 'both'
                    );
                }
                delete payloadProviderConfig.confirm_keywords_text;
                delete payloadProviderConfig.reject_keywords_text;
            }
            const payload = {
                rule_type: ruleType,
                save_pattern: savePattern,
                provider_config: RULES_WITH_PROVIDER.has(ruleType) ? payloadProviderConfig : null,
                customer_config: RULES_WITH_CUSTOMER.has(ruleType)
                    ? payloadCustomerConfig
                    : null,
            };

            const { data } = await setupEmailRule(ruleTarget.id, payload);

            // Формируем сообщение об успехе
            const configNotes = (data.configs_set || []).map(c => c.note).filter(Boolean);
            const queuedByScheduler = (
                data?.processing_result?.status === 'queued'
                || (data.configs_set || []).some(
                    c => c.action === 'queued' || c.action === 'queue_error'
                )
            );
            const baseMsg = data.processing_error
                ? `Правило назначено, но ошибка обработки: ${data.processing_error}`
                : queuedByScheduler
                    ? 'Настройки приняты. Обработка письма запустится чуть позже.'
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
            width: 360,
            render: (_, record) => {
                const mode = forceProcessingIds[record.id];
                const loadingCheck = mode === 'check';
                const loadingReprocess = mode === 'reprocess';
                const loadingAny = Boolean(mode);
                return (
                    <Space size={8} wrap>
                        <Button
                            size="small"
                            type={record.rule_type ? 'default' : 'primary'}
                            onClick={(e) => handleOpenRuleModal(record, e)}
                        >
                            {record.rule_type ? 'Изменить правило' : 'Назначить правило'}
                        </Button>
                        {FORCE_PROCESS_RULES.has(record.rule_type) && (
                            <>
                                <Tooltip title="Запустить обработку без сброса дедупликации">
                                    <Button
                                        size="small"
                                        loading={loadingCheck}
                                        disabled={loadingAny}
                                        onClick={(e) => handleForceProcess(record, e, false)}
                                    >
                                        Проверить
                                    </Button>
                                </Tooltip>
                                <Tooltip title="Запустить повторную обработку со сбросом дедупликации">
                                    <Button
                                        size="small"
                                        icon={<ReloadOutlined />}
                                        loading={loadingReprocess}
                                        disabled={loadingAny}
                                        onClick={(e) => handleForceProcess(record, e, true)}
                                    >
                                        Повторно обработать
                                    </Button>
                                </Tooltip>
                            </>
                        )}
                    </Space>
                );
            },
        },
    ];

    const accountOptions = [
        { value: null, label: 'Все ящики' },
        ...accounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.email})`,
        })),
    ];
    const providerFilterOptions = setupOptions.providers.map((p) => ({
        value: p.id,
        label: p.email ? `${p.name} (${p.email})` : p.name,
    }));
    const customerFilterOptions = setupOptions.customers.map((c) => ({
        value: c.id,
        label: c.name,
    }));

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

                <div
                    style={{
                        marginTop: 12,
                        display: 'flex',
                        gap: 12,
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                    }}
                >
                    <div style={{ minWidth: 220, flex: '1 1 280px' }}>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                            Тема содержит
                        </div>
                        <Input
                            allowClear
                            value={subjectContains}
                            placeholder="Например: заказ, прайс, ответ"
                            onChange={(e) => setSubjectContains(e.target.value)}
                            onPressEnter={handleApplySearchFilters}
                        />
                    </div>

                    <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                            Адрес отправителя
                        </div>
                        <Input
                            allowClear
                            value={senderContains}
                            placeholder="Например: @yandex.ru"
                            onChange={(e) => setSenderContains(e.target.value)}
                            onPressEnter={handleApplySearchFilters}
                        />
                    </div>

                    <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                            Клиент
                        </div>
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            loading={loadingOptions}
                            value={selectedCustomerId}
                            placeholder="Любой клиент"
                            options={customerFilterOptions}
                            onChange={(val) => setSelectedCustomerId(val)}
                        />
                    </div>

                    <div style={{ minWidth: 220, flex: '1 1 300px' }}>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                            Поставщик
                        </div>
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            loading={loadingOptions}
                            value={selectedProviderId}
                            placeholder="Любой поставщик"
                            options={providerFilterOptions}
                            onChange={(val) => setSelectedProviderId(val)}
                        />
                    </div>

                    <Space>
                        <Button type="primary" onClick={handleApplySearchFilters}>
                            Найти
                        </Button>
                        <Button onClick={handleResetSearchFilters}>
                            Сбросить
                        </Button>
                    </Space>
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
                width={820}
                destroyOnClose
                styles={{ body: { maxHeight: '85vh', overflowY: 'auto' } }}
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
                            items={
                                RULES_WITH_CUSTOMER.has(ruleType)
                                    ? [
                                        { title: 'Тип правила' },
                                        { title: 'Настройка' },
                                        { title: 'Конфигурация' },
                                    ]
                                    : [
                                        { title: 'Тип правила' },
                                        { title: 'Настройка' },
                                    ]
                            }
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
                                                onChange={(val) => {
                                                    setProviderConfig(p => ({
                                                        ...p,
                                                        provider_id: val,
                                                        config_id: null,
                                                        config_mode: 'skip',
                                                        config_name: '',
                                                        response_type: ruleType === 'order_reply' ? 'file' : p.response_type,
                                                        confirm_keywords_text: DEFAULT_CONFIRM_KEYWORDS_TEXT,
                                                        reject_keywords_text: DEFAULT_REJECT_KEYWORDS_TEXT,
                                                        value_after_article_type: 'both',
                                                        multiplicity_col: null,
                                                    }));
                                                    loadProviderConfigs(val, ruleType);
                                                }}
                                                options={setupOptions.providers.map(p => ({
                                                    value: p.id,
                                                    label: p.email
                                                        ? `${p.name} (${p.email})`
                                                        : p.name,
                                                }))}
                                            />
                                        </div>

                                        {/* Паттерны (тема и файл) */}
                                        <div>
                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                Паттерн темы письма
                                                <Tooltip title="Часть темы, по которой система будет узнавать письма (например: 'Прайс' или 'Price list')">
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
                                                <Tooltip title="Часть имени файла, по которой система находит нужный файл во вложении">
                                                    <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c' }} />
                                                </Tooltip>
                                            </div>
                                            <Input
                                                value={providerConfig.filename_pattern}
                                                onChange={(e) => setProviderConfig(p => ({ ...p, filename_pattern: e.target.value }))}
                                                placeholder="например: price.xlsx"
                                            />
                                        </div>

                                        {ruleType === 'order_reply' && providerConfig.provider_id && (
                                            <div>
                                                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                                                    Тип ответа
                                                </div>
                                                <Radio.Group
                                                    value={providerConfig.response_type || 'file'}
                                                    onChange={(e) => setProviderConfig(p => ({
                                                        ...p,
                                                        response_type: e.target.value,
                                                    }))}
                                                >
                                                    <Radio.Button value="file">
                                                        Файл
                                                    </Radio.Button>
                                                    <Radio.Button value="text">
                                                        Текст письма
                                                    </Radio.Button>
                                                </Radio.Group>
                                            </div>
                                        )}

                                        {/* Конфигурация столбцов (price_list / order_reply / document) */}
                                        {['price_list', 'order_reply', 'document'].includes(ruleType)
                                            && providerConfig.provider_id && (
                                            <>
                                                <Divider style={{ margin: '4px 0' }}>
                                                    <Text style={{ fontSize: 12 }} type="secondary">
                                                        {ruleType === 'order_reply'
                                                            && providerConfig.response_type === 'text'
                                                            ? 'Настройка ответа поставщика'
                                                            : 'Настройка столбцов файла'}
                                                    </Text>
                                                </Divider>

                                                {/* Режим конфигурации */}
                                                <div>
                                                    <div style={{ marginBottom: 6, fontWeight: 500 }}>
                                                        Режим конфигурации
                                                    </div>
                                                    <Radio.Group
                                                        value={providerConfig.config_mode}
                                                        onChange={(e) => setProviderConfig(p => ({
                                                            ...p,
                                                            config_mode: e.target.value,
                                                            config_id: null,
                                                        }))}
                                                    >
                                                        <Radio.Button value="skip">
                                                            Не настраивать
                                                        </Radio.Button>
                                                        <Radio.Button
                                                            value="existing"
                                                            disabled={providerConfigs.length === 0}
                                                        >
                                                            Обновить готовую
                                                        </Radio.Button>
                                                        <Radio.Button value="new">
                                                            Создать новую
                                                        </Radio.Button>
                                                    </Radio.Group>
                                                    {loadingProviderConfigs && (
                                                        <Spin size="small" style={{ marginLeft: 12 }} />
                                                    )}
                                                </div>

                                                {/* Существующая конфигурация */}
                                                {providerConfig.config_mode === 'existing'
                                                    && providerConfigs.length > 0 && (
                                                    <div>
                                                        <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                            Конфигурация <Text type="danger">*</Text>
                                                        </div>
                                                        <Select
                                                            style={{ width: '100%' }}
                                                            loading={loadingProviderConfigs}
                                                            placeholder="Выберите конфигурацию"
                                                            value={providerConfig.config_id}
                                                            onChange={(val) => {
                                                                const cfg = providerConfigs.find(
                                                                    c => c.id === val
                                                                );
                                                                setProviderConfig(p => ({
                                                                    ...p,
                                                                    config_id: val,
                                                                    config_name:
                                                                        cfg?.name_price
                                                                        || cfg?.name
                                                                        || '',
                                                                    filename_pattern:
                                                                        cfg?.filename_pattern || '',
                                                                    response_type:
                                                                        cfg?.response_type || p.response_type || 'file',
                                                                    confirm_keywords_text:
                                                                        (cfg?.confirm_keywords || []).join(', ')
                                                                        || DEFAULT_CONFIRM_KEYWORDS_TEXT,
                                                                    reject_keywords_text:
                                                                        (cfg?.reject_keywords || []).join(', ')
                                                                        || DEFAULT_REJECT_KEYWORDS_TEXT,
                                                                    value_after_article_type:
                                                                        cfg?.value_after_article_type || 'both',
                                                                    start_row: cfg?.start_row || 1,
                                                                    oem_col: cfg?.oem_col || null,
                                                                    qty_col: cfg?.qty_col || null,
                                                                    price_col: cfg?.price_col || null,
                                                                    brand_col: cfg?.brand_col || null,
                                                                    multiplicity_col:
                                                                        cfg?.multiplicity_col || null,
                                                                    name_col: cfg?.name_col || null,
                                                                    status_col: cfg?.status_col || null,
                                                                    comment_col: cfg?.comment_col || null,
                                                                    document_number_col:
                                                                        cfg?.document_number_col || null,
                                                                    document_date_col:
                                                                        cfg?.document_date_col || null,
                                                                }));
                                                            }}
                                                            options={providerConfigs.map(cfg => ({
                                                                value: cfg.id,
                                                                label: ruleType === 'order_reply'
                                                                    ? `${cfg.label || cfg.name || `Конфигурация #${cfg.id}`} • ${cfg.response_type === 'text' ? 'Текст' : 'Файл'}`
                                                                    : (cfg.label
                                                                        || cfg.name
                                                                        || `Конфигурация #${cfg.id}`),
                                                            }))}
                                                        />
                                                    </div>
                                                )}

                                                {/* Название для новой конфигурации */}
                                                {providerConfig.config_mode === 'new' && (
                                                    <div>
                                                        <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                            {ruleType === 'price_list'
                                                                ? (
                                                                    <>Имя новой конфигурации прайс-листа <Text type="danger">*</Text></>
                                                                )
                                                                : 'Название новой конфигурации'}
                                                        </div>
                                                        <Input
                                                            value={providerConfig.config_name}
                                                            onChange={(e) => setProviderConfig(
                                                                p => ({ ...p, config_name: e.target.value })
                                                            )}
                                                            placeholder={
                                                                ruleType === 'price_list'
                                                                    ? 'например: Прайс-лист AVTEK (XLS)'
                                                                    : 'например: Ответ на заказ — основной'
                                                            }
                                                        />
                                                    </div>
                                                )}

                                                {/* Поля столбцов (new или existing+выбрана) */}
                                                {(providerConfig.config_mode === 'new'
                                                    || (providerConfig.config_mode === 'existing'
                                                        && providerConfig.config_id))
                                                    && ruleType === 'order_reply'
                                                    && providerConfig.response_type === 'text' && (
                                                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                        <Alert
                                                            type="info"
                                                            showIcon
                                                            message="Для текстового ответа настройка колонок файла не требуется."
                                                            description="Укажите ключевые слова подтверждения/отказа и режим разбора значения после артикула."
                                                        />

                                                        <div>
                                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                                Подтверждение (через запятую)
                                                            </div>
                                                            <Input.TextArea
                                                                rows={2}
                                                                value={providerConfig.confirm_keywords_text}
                                                                onChange={(e) => setProviderConfig(p => ({
                                                                    ...p,
                                                                    confirm_keywords_text: e.target.value,
                                                                }))}
                                                                placeholder="в наличии, есть, отгружаем, собрали, да"
                                                            />
                                                        </div>

                                                        <div>
                                                            <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                                Отказ (через запятую)
                                                            </div>
                                                            <Input.TextArea
                                                                rows={2}
                                                                value={providerConfig.reject_keywords_text}
                                                                onChange={(e) => setProviderConfig(p => ({
                                                                    ...p,
                                                                    reject_keywords_text: e.target.value,
                                                                }))}
                                                                placeholder="нет, 0, отсутствует, не можем, снято с производства"
                                                            />
                                                        </div>

                                                        <div>
                                                            <div style={{ marginBottom: 6, fontWeight: 500 }}>
                                                                Значение после артикула
                                                            </div>
                                                            <Radio.Group
                                                                value={providerConfig.value_after_article_type || 'both'}
                                                                onChange={(e) => setProviderConfig(p => ({
                                                                    ...p,
                                                                    value_after_article_type: e.target.value,
                                                                }))}
                                                            >
                                                                <Radio.Button value="both">
                                                                    И число, и текст
                                                                </Radio.Button>
                                                                <Radio.Button value="number">
                                                                    Только число
                                                                </Radio.Button>
                                                                <Radio.Button value="text">
                                                                    Только текст
                                                                </Radio.Button>
                                                            </Radio.Group>
                                                        </div>
                                                    </Space>
                                                )}

                                                {(providerConfig.config_mode === 'new'
                                                    || (providerConfig.config_mode === 'existing'
                                                        && providerConfig.config_id))
                                                    && (
                                                    ruleType !== 'order_reply'
                                                    || providerConfig.response_type === 'file'
                                                ) && (() => {
                                                    // Список полей по типу правила
                                                    const baseFields = [
                                                        { key: 'start_row', label: 'Строка начала' },
                                                        { key: 'oem_col', label: 'OEM' },
                                                        { key: 'brand_col', label: 'Бренд' },
                                                        {
                                                            key: 'multiplicity_col',
                                                            label: 'Кратность',
                                                        },
                                                        { key: 'qty_col', label: 'Кол-во' },
                                                        { key: 'price_col', label: 'Цена' },
                                                    ];
                                                    const extraFields = ruleType === 'price_list'
                                                        ? [{ key: 'name_col', label: 'Наименование' }]
                                                        : ruleType === 'order_reply'
                                                            ? [
                                                                { key: 'status_col', label: 'Статус' },
                                                                { key: 'comment_col', label: 'Коммент' },
                                                            ]
                                                            : [
                                                                {
                                                                    key: 'document_number_col',
                                                                    label: '№ документа',
                                                                },
                                                                {
                                                                    key: 'document_date_col',
                                                                    label: 'Дата',
                                                                },
                                                            ];
                                                    const allFields = [...baseFields, ...extraFields];

                                                    // Подсветки столбцов
                                                    const pc = providerConfig;
                                                    const colHL = {};
                                                    [
                                                        [pc.oem_col, '#e6fffb'],
                                                        [pc.brand_col, '#f6ffed'],
                                                        [pc.multiplicity_col, '#fff1f0'],
                                                        [pc.qty_col, '#fff7e6'],
                                                        [pc.price_col, '#f9f0ff'],
                                                        [pc.name_col, '#fff2e8'],
                                                        [pc.status_col, '#e6f7ff'],
                                                        [pc.comment_col, '#fffbe6'],
                                                        [pc.document_number_col, '#f0f5ff'],
                                                        [pc.document_date_col, '#fcffe6'],
                                                    ].forEach(([col, color]) => {
                                                        if (col) colHL[col] = color;
                                                    });

                                                    // Столбцы таблицы предпросмотра
                                                    const previewCols = attachmentPreview
                                                        ? Array.from(
                                                            { length: attachmentPreview.columns },
                                                            (_, i) => ({
                                                                title: `Кол. ${i + 1}`,
                                                                dataIndex: i,
                                                                key: i,
                                                                width: 130,
                                                                ellipsis: true,
                                                                render: (value) => {
                                                                    const text = value == null
                                                                        ? ''
                                                                        : String(value);
                                                                    return (
                                                                        <Tooltip title={text || '(пусто)'}>
                                                                            <span style={{
                                                                                display: 'block',
                                                                                whiteSpace: 'nowrap',
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                            }}>
                                                                                {text || '\u00A0'}
                                                                            </span>
                                                                        </Tooltip>
                                                                    );
                                                                },
                                                                onHeaderCell: () => ({
                                                                    style: colHL[i + 1]
                                                                        ? {
                                                                            background: colHL[i + 1],
                                                                            fontWeight: 700,
                                                                            cursor: activeVisualField !== 'start_row'
                                                                                ? 'pointer' : 'default',
                                                                        }
                                                                        : {
                                                                            cursor: activeVisualField !== 'start_row'
                                                                                ? 'pointer' : 'default',
                                                                        },
                                                                    onClick: () => {
                                                                        if (activeVisualField === 'start_row') return;
                                                                        setProviderConfig(p => ({
                                                                            ...p,
                                                                            [activeVisualField]: i + 1,
                                                                        }));
                                                                    },
                                                                }),
                                                                onCell: () => ({
                                                                    style: {
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        lineHeight: 1.2,
                                                                        paddingTop: 4,
                                                                        paddingBottom: 4,
                                                                        ...(colHL[i + 1]
                                                                            ? { background: colHL[i + 1] }
                                                                            : {}),
                                                                    },
                                                                }),
                                                            })
                                                        )
                                                        : [];
                                                    const previewDS = attachmentPreview
                                                        ? attachmentPreview.rows.map((row, idx) => ({
                                                            key: idx,
                                                            ...Object.fromEntries(
                                                                row.map((cell, ci) => [ci, cell])
                                                            ),
                                                        }))
                                                        : [];

                                                    return (
                                                        <>
                                                            {/* Сообщение об ошибке предпросмотра */}
                                                            {!!previewError && (
                                                                <Alert
                                                                    type="warning"
                                                                    showIcon
                                                                    message="Предпросмотр вложения недоступен"
                                                                    description={previewError}
                                                                />
                                                            )}

                                                            {/* Визуальный выбор поля */}
                                                            {attachmentPreview && (
                                                                <div>
                                                                    <div style={{
                                                                        marginBottom: 4,
                                                                        fontWeight: 500,
                                                                    }}>
                                                                        Визуальный выбор
                                                                    </div>
                                                                    <div style={{
                                                                        marginBottom: 6,
                                                                        fontSize: 12,
                                                                        color: '#8c8c8c',
                                                                    }}>
                                                                        Выберите поле → кликните
                                                                        по заголовку колонки в таблице.
                                                                        Для строки начала — кликните
                                                                        по нужной строке.
                                                                    </div>
                                                                    <Radio.Group
                                                                        value={activeVisualField}
                                                                        onChange={(e) => setActiveVisualField(
                                                                            e.target.value
                                                                        )}
                                                                        size="small"
                                                                        style={{
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            gap: 6,
                                                                        }}
                                                                    >
                                                                        {allFields.map(f => (
                                                                            <Radio.Button
                                                                                key={f.key}
                                                                                value={f.key}
                                                                            >
                                                                                {f.label}
                                                                            </Radio.Button>
                                                                        ))}
                                                                    </Radio.Group>
                                                                </div>
                                                            )}

                                                            {/* Предпросмотр файла */}
                                                            {(loadingPreview || attachmentPreview) && (
                                                                <Collapse
                                                                    defaultActiveKey={
                                                                        attachmentPreview ? ['prev'] : []
                                                                    }
                                                                    size="small"
                                                                    items={[{
                                                                        key: 'prev',
                                                                        label: attachmentPreview
                                                                            ? `Файл вложения: ${attachmentPreview.filename}`
                                                                            : 'Загрузка файла...',
                                                                        children: loadingPreview ? (
                                                                            <div style={{
                                                                                textAlign: 'center',
                                                                                padding: 12,
                                                                            }}>
                                                                                <Spin size="small" />
                                                                                <span style={{
                                                                                    marginLeft: 8,
                                                                                    color: '#8c8c8c',
                                                                                }}>
                                                                                    Чтение файла...
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                <div style={{
                                                                                    marginBottom: 6,
                                                                                    fontSize: 12,
                                                                                    color: '#8c8c8c',
                                                                                }}>
                                                                                    Показано{' '}
                                                                                    {attachmentPreview.rows.length}{' '}
                                                                                    из{' '}
                                                                                    {attachmentPreview.total_rows}{' '}
                                                                                    строк.
                                                                                    Кликните заголовок — задать колонку.
                                                                                    Кликните строку — задать строку начала.
                                                                                </div>
                                                                                <Table
                                                                                    size="small"
                                                                                    tableLayout="fixed"
                                                                                    scroll={{ x: true, y: 280 }}
                                                                                    pagination={false}
                                                                                    dataSource={previewDS}
                                                                                    columns={previewCols}
                                                                                    onRow={(_, rowIndex) => {
                                                                                        const idx = (rowIndex ?? 0) + 1;
                                                                                        const isStart = (
                                                                                            providerConfig.start_row
                                                                                            === idx
                                                                                        );
                                                                                        return {
                                                                                            onClick: () => {
                                                                                                setProviderConfig(
                                                                                                    p => ({
                                                                                                        ...p,
                                                                                                        start_row: idx,
                                                                                                    })
                                                                                                );
                                                                                            },
                                                                                            style: isStart
                                                                                                ? {
                                                                                                    outline: '2px solid #40a9ff',
                                                                                                }
                                                                                                : { cursor: 'pointer' },
                                                                                        };
                                                                                    }}
                                                                                    bordered
                                                                                    style={{ fontSize: 11 }}
                                                                                />
                                                                            </>
                                                                        ),
                                                                    }]}
                                                                />
                                                            )}

                                                            {/* Сетка столбцов */}
                                                            <div style={{
                                                                background: '#fafafa',
                                                                border: '1px solid #e8e8e8',
                                                                borderRadius: 6,
                                                                padding: 12,
                                                            }}>
                                                                <div style={{
                                                                    marginBottom: 8,
                                                                    fontWeight: 600,
                                                                    color: '#555',
                                                                }}>
                                                                    Номера столбцов (начиная с 1)
                                                                </div>
                                                                <div style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: '1fr 1fr 1fr',
                                                                    gap: 8,
                                                                }}>
                                                                    {allFields.map(({ key, label }) => (
                                                                        <div key={key}>
                                                                            <div style={{
                                                                                marginBottom: 4,
                                                                                fontWeight: 500,
                                                                                fontSize: 12,
                                                                            }}>
                                                                                {label}
                                                                            </div>
                                                                            <InputNumber
                                                                                min={1}
                                                                                style={{ width: '100%' }}
                                                                                value={providerConfig[key]}
                                                                                onChange={(val) =>
                                                                                    setProviderConfig(p => ({
                                                                                        ...p,
                                                                                        [key]: val || null,
                                                                                    }))
                                                                                }
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
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
                                            message="Выберите клиента и конфигурацию обработки заказа. Можно выбрать готовую или создать новую прямо здесь."
                                        />
                                        {!ruleTarget?.has_attachments && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message="В выбранном письме нет вложений"
                                                description="Для визуального выбора столбцов нужен файл XLS/XLSX/CSV во вложении."
                                            />
                                        )}

                                        {!!previewError && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message="Не удалось показать предпросмотр файла"
                                                description={previewError}
                                            />
                                        )}

                                        {/* Превью файла вложения */}
                                        {(loadingPreview || attachmentPreview) && (() => {
                                            const oc = customerConfig.order_config || {};
                                            const colHighlights = {
                                                [oc.oem_col]: '#e6fffb',
                                                [oc.brand_col]: '#f6ffed',
                                                [oc.qty_col]: '#fff7e6',
                                                [oc.price_col]: '#f9f0ff',
                                            };
                                            const previewCols = attachmentPreview
                                                ? Array.from({ length: attachmentPreview.columns }, (_, i) => ({
                                                    title: `Кол. ${i + 1}`,
                                                    dataIndex: i,
                                                    key: i,
                                                    width: 140,
                                                    ellipsis: true,
                                                    render: (value) => {
                                                        const text = value === null || value === undefined
                                                            ? ''
                                                            : String(value);
                                                        return (
                                                            <Tooltip title={text || '(пусто)'}>
                                                                <span
                                                                    style={{
                                                                        display: 'block',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                    }}
                                                                >
                                                                    {text || '\u00A0'}
                                                                </span>
                                                            </Tooltip>
                                                        );
                                                    },
                                                    onHeaderCell: () => ({
                                                        style: colHighlights[i + 1]
                                                            ? { background: colHighlights[i + 1], fontWeight: 700 }
                                                            : {},
                                                    }),
                                                    onCell: () => ({
                                                        style: {
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            lineHeight: 1.2,
                                                            paddingTop: 4,
                                                            paddingBottom: 4,
                                                            ...(colHighlights[i + 1]
                                                                ? { background: colHighlights[i + 1] }
                                                                : {}),
                                                        },
                                                    }),
                                                }))
                                                : [];
                                            const previewDS = attachmentPreview
                                                ? attachmentPreview.rows.map((row, idx) => ({
                                                    key: idx,
                                                    ...Object.fromEntries(row.map((cell, ci) => [ci, cell])),
                                                }))
                                                : [];
                                            const panelLabel = attachmentPreview
                                                ? `Файл вложения: ${attachmentPreview.filename} (${attachmentPreview.total_rows} строк)`
                                                : 'Загрузка файла...';
                                            return (
                                                <Collapse
                                                    defaultActiveKey={['preview']}
                                                    size="small"
                                                    items={[{
                                                        key: 'preview',
                                                        label: panelLabel,
                                                        children: loadingPreview ? (
                                                            <div style={{ textAlign: 'center', padding: 12 }}>
                                                                <Spin size="small" />
                                                                <span style={{ marginLeft: 8, color: '#8c8c8c' }}>
                                                                    Чтение файла...
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div style={{ marginBottom: 6, fontSize: 12, color: '#8c8c8c' }}>
                                                                    Первые {attachmentPreview.rows.length} строк из {attachmentPreview.total_rows}.
                                                                    Номер столбца = заголовок «Кол. N».
                                                                    Цвета столбцов отражают настройки ниже.
                                                                </div>
                                                                <Table
                                                                    size="small"
                                                                    tableLayout="fixed"
                                                                    scroll={{ x: true, y: 320 }}
                                                                    pagination={false}
                                                                    dataSource={previewDS}
                                                                    columns={previewCols}
                                                                    bordered
                                                                    style={{ fontSize: 11 }}
                                                                />
                                                            </>
                                                        ),
                                                    }]}
                                                />
                                            );
                                        })()}

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
                                                onChange={async (val) => {
                                                    setCustomerConfig(c => ({
                                                        ...c,
                                                        customer_id: val,
                                                        config_id: null,
                                                        order_config: {
                                                            ...c.order_config,
                                                            pricelist_config_id: null,
                                                        },
                                                    }));
                                                    await loadCustomerSetupConfigs(val);
                                                }}
                                                options={setupOptions.customers.map(c => ({
                                                    value: c.id,
                                                    label: c.name,
                                                }))}
                                            />
                                        </div>

                                        <Alert
                                            type="info"
                                            showIcon
                                            message="На следующем шаге выберите готовую конфигурацию или создайте новую."
                                        />

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

                                {!RULES_WITH_CUSTOMER.has(ruleType) && (
                                    <>
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
                                    </>
                                )}
                                {RULES_WITH_CUSTOMER.has(ruleType) && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                                        <Button onClick={() => setWizardStep(0)}>← Назад</Button>
                                        <Space>
                                            <Button onClick={() => setRuleModalOpen(false)}>Отмена</Button>
                                            <Button type="primary" onClick={handleWizardNext}>
                                                Далее →
                                            </Button>
                                        </Space>
                                    </div>
                                )}
                            </Space>
                        )}

                        {/* ─────────────── ШАГ 2: конфигурация заказа клиента ─────────────── */}
                        {wizardStep === 2 && RULES_WITH_CUSTOMER.has(ruleType) && (
                            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                {customerOrderConfigs.length === 0 && !loadingCustomerSetupConfigs ? (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="У клиента нет конфигураций обработки заказов"
                                        description="Создайте новую конфигурацию ниже, заполнив номера столбцов файла заказа."
                                    />
                                ) : (
                                    <Alert
                                        type="info"
                                        showIcon
                                        message="Выберите готовую конфигурацию или создайте новую для обработки входящего заказа."
                                    />
                                )}

                                {!!previewError && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Предпросмотр вложения недоступен"
                                        description={previewError}
                                    />
                                )}
                                {!ruleTarget?.has_attachments && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="В письме нет вложений для предпросмотра"
                                    />
                                )}

                                {customerOrderConfigs.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                            Режим конфигурации <Text type="danger">*</Text>
                                        </div>
                                        <Radio.Group
                                            value={customerConfig.config_mode}
                                            onChange={(e) => setCustomerConfig(c => ({
                                                ...c,
                                                config_mode: e.target.value,
                                                config_id: null,
                                                order_config: { ...DEFAULT_NEW_ORDER_CONFIG },
                                            }))}
                                        >
                                            <Radio.Button value="existing">Редактировать готовую</Radio.Button>
                                            <Radio.Button value="new">Создать новую</Radio.Button>
                                        </Radio.Group>
                                    </div>
                                )}

                                {/* --- Выбор существующей конфигурации --- */}
                                {customerConfig.config_mode === 'existing' && customerOrderConfigs.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                            Конфигурация заказа <Text type="danger">*</Text>
                                        </div>
                                        <Select
                                            style={{ width: '100%' }}
                                            loading={loadingCustomerSetupConfigs}
                                            placeholder="Выберите конфигурацию"
                                            value={customerConfig.config_id}
                                            onChange={(val) => {
                                                const cfg = customerOrderConfigs.find(c => c.id === val);
                                                setCustomerConfig(c => ({
                                                    ...c,
                                                    config_id: val,
                                                    // Заполняем поля из выбранной конфигурации
                                                    order_config: cfg ? {
                                                        pricelist_config_id: cfg.pricelist_config_id || null,
                                                        order_start_row: cfg.order_start_row || 1,
                                                        oem_col: cfg.oem_col || null,
                                                        brand_col: cfg.brand_col || null,
                                                        qty_col: cfg.qty_col || null,
                                                        name_col: cfg.name_col || null,
                                                        price_col: cfg.price_col || null,
                                                        ship_qty_col: cfg.ship_qty_col || null,
                                                        reject_qty_col: cfg.reject_qty_col || null,
                                                    } : { ...DEFAULT_NEW_ORDER_CONFIG },
                                                }));
                                            }}
                                            options={(customerOrderConfigs || []).map(cfg => ({
                                                value: cfg.id,
                                                label: cfg.pricelist_config_name
                                                    ? `#${cfg.id} • ${cfg.pricelist_config_name}`
                                                    : `Конфигурация #${cfg.id}`,
                                            }))}
                                        />
                                    </div>
                                )}

                                {/* --- Поля конфигурации (для обоих режимов) --- */}
                                {(customerConfig.config_mode === 'new' || customerConfig.config_id) && (
                                    <>
                                        {customerConfig.config_mode === 'new' && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message="Новая конфигурация будет создана и сразу использована для пробной загрузки этого письма."
                                            />
                                        )}
                                        {customerConfig.config_mode === 'existing' && customerConfig.config_id && (
                                            <Alert
                                                type="success"
                                                showIcon
                                                message="Вы можете изменить настройки столбцов — они будут обновлены в существующей конфигурации."
                                            />
                                        )}

                                        {/* Прайс клиента (только для новой конфигурации) */}
                                        {customerConfig.config_mode === 'new' && (
                                            <div>
                                                <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                    Прайс клиента <Text type="danger">*</Text>
                                                </div>
                                                <Select
                                                    style={{ width: '100%' }}
                                                    loading={loadingCustomerSetupConfigs}
                                                    placeholder="Выберите прайс клиента"
                                                    value={customerConfig.order_config?.pricelist_config_id}
                                                    onChange={(val) => setCustomerConfig(c => ({
                                                        ...c,
                                                        order_config: {
                                                            ...c.order_config,
                                                            pricelist_config_id: val,
                                                        },
                                                    }))}
                                                    options={(customerPricelistConfigs || []).map(cfg => ({
                                                        value: cfg.id,
                                                        label: cfg.name || `#${cfg.id}`,
                                                    }))}
                                                />
                                            </div>
                                        )}

                                        {/* Визуальный выбор колонок */}
                                        {attachmentPreview && (
                                            <div>
                                                <div style={{ marginBottom: 4, fontWeight: 500 }}>
                                                    Визуальный выбор
                                                </div>
                                                <div style={{ marginBottom: 6, fontSize: 12, color: '#8c8c8c' }}>
                                                    Выберите поле ниже и кликните по заголовку нужной колонки в таблице.
                                                    Для строки начала кликните по нужной строке в таблице.
                                                </div>
                                                <Radio.Group
                                                    value={activeVisualField}
                                                    onChange={(e) => setActiveVisualField(e.target.value)}
                                                    size="small"
                                                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                                                >
                                                    <Radio.Button value="oem_col">OEM</Radio.Button>
                                                    <Radio.Button value="brand_col">Бренд</Radio.Button>
                                                    <Radio.Button value="qty_col">Кол-во</Radio.Button>
                                                    <Radio.Button value="name_col">Наименование</Radio.Button>
                                                    <Radio.Button value="price_col">Цена</Radio.Button>
                                                    <Radio.Button value="ship_qty_col">Отгружено</Radio.Button>
                                                    <Radio.Button value="reject_qty_col">Отказ</Radio.Button>
                                                    <Radio.Button value="order_start_row">Строка начала</Radio.Button>
                                                </Radio.Group>
                                            </div>
                                        )}

                                        {/* Предпросмотр файла вложения */}
                                        {(loadingPreview || attachmentPreview) && (() => {
                                            const oc = customerConfig.order_config || {};
                                            const colHighlights = {
                                                [oc.oem_col]: '#e6fffb',
                                                [oc.brand_col]: '#f6ffed',
                                                [oc.qty_col]: '#fff7e6',
                                                [oc.price_col]: '#f9f0ff',
                                            };
                                            const previewColumns = attachmentPreview
                                                ? Array.from(
                                                    { length: attachmentPreview.columns },
                                                    (_, i) => ({
                                                        title: `Кол. ${i + 1}`,
                                                        dataIndex: i,
                                                        key: i,
                                                        width: 140,
                                                        ellipsis: true,
                                                        render: (value) => {
                                                            const text = value === null || value === undefined
                                                                ? ''
                                                                : String(value);
                                                            return (
                                                                <Tooltip title={text || '(пусто)'}>
                                                                    <span
                                                                        style={{
                                                                            display: 'block',
                                                                            whiteSpace: 'nowrap',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                        }}
                                                                    >
                                                                        {text || '\u00A0'}
                                                                    </span>
                                                                </Tooltip>
                                                            );
                                                        },
                                                        onHeaderCell: () => ({
                                                            style: colHighlights[i + 1]
                                                                ? {
                                                                    background: colHighlights[i + 1],
                                                                    fontWeight: 700,
                                                                    cursor: activeVisualField !== 'order_start_row'
                                                                        ? 'pointer'
                                                                        : 'default',
                                                                }
                                                                : {
                                                                    cursor: activeVisualField !== 'order_start_row'
                                                                        ? 'pointer'
                                                                        : 'default',
                                                                },
                                                            onClick: () => {
                                                                if (activeVisualField === 'order_start_row') {
                                                                    return;
                                                                }
                                                                setCustomerConfig(c => ({
                                                                    ...c,
                                                                    order_config: {
                                                                        ...c.order_config,
                                                                        [activeVisualField]: i + 1,
                                                                    },
                                                                }));
                                                            },
                                                        }),
                                                        onCell: () => ({
                                                            style: {
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                lineHeight: 1.2,
                                                                paddingTop: 4,
                                                                paddingBottom: 4,
                                                                ...(colHighlights[i + 1]
                                                                    ? { background: colHighlights[i + 1] }
                                                                    : {}),
                                                            },
                                                        }),
                                                    })
                                                )
                                                : [];
                                            const previewDataSource = attachmentPreview
                                                ? attachmentPreview.rows.map((row, idx) => ({
                                                    key: idx,
                                                    ...Object.fromEntries(row.map((cell, ci) => [ci, cell])),
                                                }))
                                                : [];
                                            const panelLabel = attachmentPreview
                                                ? `Просмотр файла заказа (${attachmentPreview.filename})`
                                                : 'Просмотр файла заказа';
                                            return (
                                                <Collapse
                                                    defaultActiveKey={attachmentPreview ? ['preview'] : []}
                                                    size="small"
                                                    items={[{
                                                        key: 'preview',
                                                        label: panelLabel,
                                                        children: loadingPreview ? (
                                                            <div style={{ textAlign: 'center', padding: 16 }}>
                                                                <Spin size="small" />
                                                                <span style={{ marginLeft: 8, color: '#8c8c8c' }}>
                                                                    Загрузка файла...
                                                                </span>
                                                            </div>
                                                        ) : attachmentPreview ? (
                                                            <>
                                                                <div style={{ marginBottom: 6, fontSize: 12, color: '#8c8c8c' }}>
                                                                    Показано {attachmentPreview.rows.length} из {attachmentPreview.total_rows} строк,
                                                                    {attachmentPreview.columns} столбцов.
                                                                    Выделение отражает текущие настройки столбцов ниже.
                                                                    Клик по заголовку задаёт номер колонки для выбранного поля.
                                                                    Клик по строке задаёт «Строка начала».
                                                                </div>
                                                                <Table
                                                                    size="small"
                                                                    tableLayout="fixed"
                                                                    scroll={{ x: true, y: 360 }}
                                                                    pagination={false}
                                                                    dataSource={previewDataSource}
                                                                    columns={previewColumns}
                                                                    onRow={(_, rowIndex) => {
                                                                        const index = (rowIndex ?? 0) + 1;
                                                                        const isActiveStartRow = (
                                                                            customerConfig.order_config?.order_start_row
                                                                            === index
                                                                        );
                                                                        return {
                                                                            onClick: () => {
                                                                                setCustomerConfig(c => ({
                                                                                    ...c,
                                                                                    order_config: {
                                                                                        ...c.order_config,
                                                                                        order_start_row: index,
                                                                                    },
                                                                                }));
                                                                            },
                                                                            style: isActiveStartRow
                                                                                ? { outline: '2px solid #40a9ff' }
                                                                                : {
                                                                                    cursor: 'pointer',
                                                                                },
                                                                        };
                                                                    }}
                                                                    bordered
                                                                    style={{ fontSize: 12 }}
                                                                />
                                                            </>
                                                        ) : null,
                                                    }]}
                                                />
                                            );
                                        })()}

                                        {/* Сетка столбцов */}
                                        <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: 12 }}>
                                            <div style={{ marginBottom: 8, fontWeight: 600, color: '#555' }}>
                                                Номера столбцов в файле заказа (начиная с 1)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                {[
                                                    { key: 'order_start_row', label: 'Строка начала', required: false, min: 1 },
                                                    { key: 'oem_col', label: 'OEM', required: true },
                                                    { key: 'brand_col', label: 'Бренд', required: true },
                                                    { key: 'qty_col', label: 'Кол-во', required: true },
                                                    { key: 'name_col', label: 'Наименование', required: false },
                                                    { key: 'price_col', label: 'Цена', required: false },
                                                    { key: 'ship_qty_col', label: 'Отгружено', required: false },
                                                    { key: 'reject_qty_col', label: 'Отказ', required: false },
                                                ].map(({ key, label, required }) => (
                                                    <div key={key}>
                                                        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>
                                                            {label}{required && <Text type="danger"> *</Text>}
                                                        </div>
                                                        <InputNumber
                                                            min={1}
                                                            style={{ width: '100%' }}
                                                            value={customerConfig.order_config?.[key]}
                                                            onChange={(val) => setCustomerConfig(c => ({
                                                                ...c,
                                                                order_config: {
                                                                    ...c.order_config,
                                                                    [key]: val || null,
                                                                },
                                                            }))}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

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
                                        id="save-pattern-step3"
                                        checked={savePattern}
                                        style={{ marginTop: 3 }}
                                        onChange={(e) => setSavePattern(e.target.checked)}
                                    />
                                    <label htmlFor="save-pattern-step3" style={{ cursor: 'pointer', margin: 0 }}>
                                        <strong>Запомнить паттерн</strong> — система будет автоматически
                                        определять похожие письма и обрабатывать их без участия менеджера
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                                    <Button onClick={() => setWizardStep(1)}>← Назад</Button>
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
