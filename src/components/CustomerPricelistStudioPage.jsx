import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    Collapse,
    DatePicker,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Radio,
    Row,
    Select,
    Space,
    Statistic,
    Switch,
    Table,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import {
    CloudDownloadOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    FileSearchOutlined,
    FilterOutlined,
    HolderOutlined,
    PlusOutlined,
    ReloadOutlined,
    SaveOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons';
import {
    approveCustomerPricelistDraft,
    buildCustomerPricelistDraft,
    bulkDeleteCustomerPricelistPublicationRules,
    bulkSaveCustomerPricelistPublicationRules,
    createCustomerPricelistConfig,
    createCustomerPricelistSource,
    deleteCustomerPricelistConfig,
    deleteCustomerPricelistPublicationRule,
    deleteCustomerPricelistSource,
    diagnoseCustomerPricelistPosition,
    downloadCustomerPricelistDraft,
    downloadPublicationRulesImportTemplate,
    getCustomerPricelistConfigs,
    getCustomerPricelistSources,
    getCustomersSummary,
    importCustomerPricelistPublicationRules,
    listCustomerPricelistDraftRows,
    listCustomerPricelistDrafts,
    listCustomerPricelistPublicationCrosses,
    listCustomerPricelistPublicationRules,
    previewCustomerPricelistPublicationRule,
    rejectCustomerPricelistDraft,
    saveCustomerPricelistPublicationRule,
    searchCustomerPricelistPublicationCandidates,
    updateCustomerPricelistConfig,
    updateCustomerPricelistSource,
} from '../api/customers';
import { getCanonicalBrands } from '../api/brands';
import { getEmailAccounts, getEmailRelayHealth } from '../api/emailAccounts';
import { getProviderConfigOptions } from '../api/providers';
import { formatMoscow } from '../utils/time';
import './CustomerPricelistStudioPage.css';

const { Title, Text } = Typography;

const DAY_OPTIONS = [
    { value: 'mon', label: 'Пн' },
    { value: 'tue', label: 'Вт' },
    { value: 'wed', label: 'Ср' },
    { value: 'thu', label: 'Чт' },
    { value: 'fri', label: 'Пт' },
    { value: 'sat', label: 'Сб' },
    { value: 'sun', label: 'Вс' },
];

const STATUS_META = {
    draft: { color: 'gold', label: 'Черновик' },
    sent: { color: 'green', label: 'Отправлен' },
    queued: { color: 'blue', label: 'Ожидает relay' },
    partially_sent: { color: 'orange', label: 'Отправлен частично' },
    superseded: { color: 'default', label: 'Заменён новым' },
    rejected: { color: 'red', label: 'Отклонён' },
    send_failed: { color: 'volcano', label: 'Ошибка отправки' },
    generated: { color: 'blue', label: 'Сформирован' },
    generating: { color: 'processing', label: 'Формируется' },
};

const DELIVERY_STATUS_META = {
    sent: { color: 'green', label: 'Отправлено' },
    queued: { color: 'blue', label: 'Ожидает relay' },
    pending: { color: 'blue', label: 'Ожидает relay' },
    failed: { color: 'red', label: 'Ошибка' },
    error: { color: 'red', label: 'Ошибка' },
    cancelled: { color: 'default', label: 'Отменено' },
};

const effectiveDraftStatus = (row) => (
    row.generation_status === 'rejected'
    && String(row.send_error || '').startsWith('Отменено: сформирован более новый')
        ? 'superseded'
        : row.generation_status
);

const deliveryRecipients = (channel) => (channel.recipients || [])
    .map((item) => (typeof item === 'string' ? item : item?.email))
    .filter(Boolean)
    .join(', ');

const ROW_TYPE_META = {
    direct: { color: 'blue', label: 'Прямая позиция' },
    automatic_cross: { color: 'cyan', label: 'Автоматический кросс' },
    manual_cross: { color: 'green', label: 'Ручная замена' },
    zzap_transform: { color: 'orange', label: 'Преобразование ZZap' },
    transformed_cross: { color: 'gold', label: 'Оригинальный кросс DragonZap' },
};

const PIPELINE_BLOCKS = {
    source_filters: { title: 'Фильтры источников', tone: 'blue' },
    price_control_before: { title: 'Контроль цены до преобразования', tone: 'cyan' },
    dragonzap_crosses: { title: 'Подтверждённые кроссы DragonZap', tone: 'gold' },
    dragonzap_transform: { title: 'Преобразование в оригинал', tone: 'orange' },
    product_labels: { title: 'Метки в наименовании', tone: 'green' },
    price_control_after: { title: 'Контроль цены после преобразования', tone: 'cyan' },
    publication_rules: { title: 'Ручные правила публикации', tone: 'purple' },
    final_filters: { title: 'Финальная фильтрация', tone: 'blue' },
    deduplication: { title: 'Самая дешёвая строка Бренд + Артикул', tone: 'volcano' },
    quality_control: { title: 'Контроль качества', tone: 'red' },
};

const DEFAULT_PIPELINE_ORDER = Object.keys(PIPELINE_BLOCKS);
const PIPELINE_DEPENDENCIES = {
    price_control_before: ['source_filters'],
    dragonzap_crosses: ['source_filters', 'price_control_before'],
    dragonzap_transform: ['dragonzap_crosses'],
    product_labels: ['dragonzap_transform'],
    price_control_after: ['dragonzap_transform'],
    publication_rules: [
        'price_control_before',
        'dragonzap_crosses',
        'dragonzap_transform',
        'product_labels',
        'price_control_after',
    ],
    final_filters: ['publication_rules'],
    deduplication: DEFAULT_PIPELINE_ORDER.filter((step) => (
        !['deduplication', 'quality_control'].includes(step)
    )),
    quality_control: DEFAULT_PIPELINE_ORDER.filter((step) => step !== 'quality_control'),
};

const normalizePipelineOrder = (requested) => {
    const unique = (requested || []).filter((step, index, values) => (
        PIPELINE_BLOCKS[step] && values.indexOf(step) === index
    ));
    DEFAULT_PIPELINE_ORDER.forEach((step) => {
        if (!unique.includes(step)) unique.push(step);
    });
    const ordered = [];
    const pending = [...unique];
    while (pending.length) {
        const availableIndex = pending.findIndex((step) => (
            (PIPELINE_DEPENDENCIES[step] || []).every((dependency) => ordered.includes(dependency))
        ));
        const index = availableIndex >= 0 ? availableIndex : 0;
        ordered.push(pending[index]);
        pending.splice(index, 1);
    }
    return ordered;
};

const ZZAP_TEMPLATE = {
    PIPELINE_V2_ENABLED: true,
    PROFILE_TEMPLATE: 'zzap',
    DZ_ORIGINAL_TRANSFORM_ENABLED: true,
    DZ_TRANSFORM_INCLUDE_CROSSES: true,
    DZ_TRANSFORM_KEEP_DRAGONZAP: false,
    PUBLISH_CONFIRMED_DZ_CROSSES: false,
    PRODUCT_LABELS_ENABLED: true,
    LABEL_ORIGINAL_ENABLED: true,
    LABEL_TRANSFORMED_ENABLED: true,
    LABEL_ORIGINAL_TEXT: '>>Оригинал<<',
    LABEL_TRANSFORMED_TEXT: '>>Неоригинал<<',
    PRICE_CONTROL_ENABLED: true,
    PRICE_CONTROL_STAGES: ['before', 'after'],
    PRICE_CONTROL_MULTIPLIER: 1.2,
    PRICE_CONTROL_ROUNDING_STEP: 10,
    DUPLICATE_POLICY: 'cheapest_then_stock_then_original',
    QUALITY_CONTROL_ENABLED: true,
    FINAL_FILTER_ENABLED: false,
    FINAL_FILTER_POLICY: {
        brand_mode: 'all',
        brands: [],
        position_mode: 'all',
        positions: [],
        min_quantity: null,
    },
    FINAL_FILTER_RULES: [],
    PUBLICATION_RULES_ONLY_CONFIGURED: false,
    REQUIRE_DRAFT_APPROVAL: true,
    PIPELINE_ORDER: DEFAULT_PIPELINE_ORDER,
};

const safeNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const getErrorText = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail
            .map((item) => item?.msg || item?.message || JSON.stringify(item))
            .filter(Boolean)
            .join('; ') || fallback;
    }
    if (typeof detail === 'string' && detail.trim()) return detail;
    return error?.message || fallback;
};

const ruleValidityLabel = (rule) => {
    const today = dayjs().format('YYYY-MM-DD');
    const range = [
        rule.valid_from ? `с ${dayjs(rule.valid_from).format('DD.MM.YYYY')}` : null,
        rule.valid_to ? `по ${dayjs(rule.valid_to).format('DD.MM.YYYY')}` : null,
    ].filter(Boolean).join(' ');
    if (rule.valid_to && rule.valid_to < today) return `${range} · срок истёк`;
    if (rule.valid_from && rule.valid_from > today) return `${range} · ещё не началось`;
    return range;
};

const formatRub = (value) => (
    value == null ? '—' : `${Number(value).toLocaleString('ru-RU')} ₽`
);

const candidateLabel = (item) => (
    `${item.brand} ${item.oem}${item.name ? ` · ${item.name}` : ''}`
);

const CustomerPricelistStudioPage = () => {
    const navigate = useNavigate();
    const [settingsForm] = Form.useForm();
    const [newConfigForm] = Form.useForm();
    const [ruleForm] = Form.useForm();
    const [sourceFilterForm] = Form.useForm();
    const pipelineV2Enabled = Form.useWatch('pipeline_v2_enabled', settingsForm);
    const finalFilterEnabled = Form.useWatch('final_filter_enabled', settingsForm);
    const finalFilterBrandMode = Form.useWatch('final_filter_brand_mode', settingsForm);
    const finalFilterPositionMode = Form.useWatch('final_filter_position_mode', settingsForm);
    const publicationOnlyConfigured = Form.useWatch(
        'publication_rules_only_configured',
        settingsForm
    );
    const [customers, setCustomers] = useState([]);
    const [configs, setConfigs] = useState([]);
    const [providerOptions, setProviderOptions] = useState([]);
    const [outgoingEmailAccounts, setOutgoingEmailAccounts] = useState([]);
    const [relayHealth, setRelayHealth] = useState(null);
    const [brandOptions, setBrandOptions] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [configId, setConfigId] = useState(null);
    const [sources, setSources] = useState([]);
    const [sourceToAdd, setSourceToAdd] = useState(null);
    const [addingSource, setAddingSource] = useState(false);
    const [sourceSavingId, setSourceSavingId] = useState(null);
    const [sourceDeletingId, setSourceDeletingId] = useState(null);
    const [dirtySourceIds, setDirtySourceIds] = useState(() => new Set());
    const [newConfigOpen, setNewConfigOpen] = useState(false);
    const [creatingConfig, setCreatingConfig] = useState(false);
    const [deletingConfig, setDeletingConfig] = useState(false);
    const [rules, setRules] = useState([]);
    const [drafts, setDrafts] = useState([]);
    const [selectedDraftId, setSelectedDraftId] = useState(null);
    const [draftRows, setDraftRows] = useState([]);
    const [draftRowsTotal, setDraftRowsTotal] = useState(0);
    const [draftRowsPage, setDraftRowsPage] = useState(1);
    const [draftRowsPageSize, setDraftRowsPageSize] = useState(50);
    const [draftSearch, setDraftSearch] = useState('');
    const [draftRowType, setDraftRowType] = useState(null);
    const [loading, setLoading] = useState(false);
    const [rowsLoading, setRowsLoading] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [buildingDraft, setBuildingDraft] = useState(false);
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [candidateOptions, setCandidateOptions] = useState([]);
    const [crossOptions, setCrossOptions] = useState([]);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [ruleSaving, setRuleSaving] = useState(false);
    const [rulePreview, setRulePreview] = useState(null);
    const [selectedRuleIds, setSelectedRuleIds] = useState([]);
    const [filteredRules, setFilteredRules] = useState(null);
    const [ruleFiltersActive, setRuleFiltersActive] = useState(false);
    const [ruleDeleting, setRuleDeleting] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkPositionOptions, setBulkPositionOptions] = useState([]);
    const [importOpen, setImportOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importReport, setImportReport] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const [importOverwrite, setImportOverwrite] = useState(false);
    const [bulkForm] = Form.useForm();
    const bulkScope = Form.useWatch('scope', bulkForm);
    const bulkAction = Form.useWatch('action', bulkForm);
    const bulkPriceMode = Form.useWatch('price_mode', bulkForm);
    const watchedRuleSource = Form.useWatch('source_autopart_id', ruleForm);
    const watchedRulePriceMode = Form.useWatch('price_mode', ruleForm);
    const watchedRuleFixed = Form.useWatch('fixed_price', ruleForm);
    const watchedRulePercent = Form.useWatch('price_percent', ruleForm);
    const watchedRuleSourceId = Form.useWatch('price_source_id', ruleForm);
    const watchedRuleRounding = Form.useWatch('price_rounding_step', ruleForm);
    const watchedRuleMode = Form.useWatch('mode', ruleForm);
    const [pipelineOrder, setPipelineOrder] = useState(DEFAULT_PIPELINE_ORDER);
    const [draggedPipelineStep, setDraggedPipelineStep] = useState(null);
    const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
    const [sourceFilterTarget, setSourceFilterTarget] = useState(null);
    const [sourceFilterSaving, setSourceFilterSaving] = useState(false);
    const [sourcePositionOptions, setSourcePositionOptions] = useState([]);
    const [sourcePositionLoading, setSourcePositionLoading] = useState(false);
    const [positionDiagnostic, setPositionDiagnostic] = useState(null);
    const [diagnosticLoading, setDiagnosticLoading] = useState(false);

    const activeConfig = useMemo(
        () => configs.find((item) => item.id === configId) || null,
        [configs, configId]
    );
    const selectedDraft = useMemo(
        () => drafts.find((item) => item.id === selectedDraftId) || null,
        [drafts, selectedDraftId]
    );
    const availableProviderOptions = useMemo(() => {
        const connected = new Set(
            sources.map((source) => Number(source.provider_config_id))
        );
        return providerOptions.filter((item) => !connected.has(Number(item.id)));
    }, [providerOptions, sources]);

    const loadInitial = useCallback(async () => {
        try {
            const [
                customersResponse,
                providerResponse,
                brandsResponse,
                emailAccountsResponse,
            ] = await Promise.all([
                getCustomersSummary({
                    page: 1,
                    page_size: 200,
                    sort_by: 'name',
                    sort_dir: 'asc',
                }),
                getProviderConfigOptions(),
                getCanonicalBrands(),
                getEmailAccounts(),
            ]);
            setCustomers(customersResponse.data?.items || []);
            setProviderOptions(providerResponse.data || []);
            setBrandOptions((brandsResponse.data || []).map((brand) => ({
                value: brand.id,
                label: brand.name,
            })));
            setOutgoingEmailAccounts((emailAccountsResponse.data || []).filter((account) => {
                if (!account?.is_active) return false;
                const purposes = account.purposes || [];
                return ['prices_out', 'orders_out', 'orders_in'].some(
                    (purpose) => purposes.includes(purpose)
                );
            }));
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить справочники'));
        }
    }, []);

    useEffect(() => {
        void loadInitial();
    }, [loadInitial]);

    const loadRelayHealth = useCallback(async () => {
        try {
            const { data } = await getEmailRelayHealth();
            setRelayHealth(data || null);
        } catch (error) {
            console.error('Relay health load failed:', error);
            setRelayHealth(null);
        }
    }, []);

    useEffect(() => {
        void loadRelayHealth();
        const timer = window.setInterval(loadRelayHealth, 60000);
        return () => window.clearInterval(timer);
    }, [loadRelayHealth]);

    const loadCustomerConfigs = useCallback(async (nextCustomerId) => {
        if (!nextCustomerId) return;
        try {
            const { data } = await getCustomerPricelistConfigs(nextCustomerId);
            setConfigs(data || []);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить конфигурации'));
        }
    }, []);

    const loadWorkspace = useCallback(async (nextCustomerId, nextConfigId) => {
        if (!nextCustomerId || !nextConfigId) return;
        setLoading(true);
        try {
            const [sourceResult, ruleResult, draftResult] = await Promise.allSettled([
                getCustomerPricelistSources(nextCustomerId, nextConfigId),
                listCustomerPricelistPublicationRules(nextCustomerId, nextConfigId),
                listCustomerPricelistDrafts(nextCustomerId, nextConfigId),
            ]);
            const failedSections = [];
            if (sourceResult.status === 'fulfilled') {
                setSources(sourceResult.value.data || []);
            } else {
                failedSections.push('источники');
            }
            if (ruleResult.status === 'fulfilled') {
                setRules(ruleResult.value.data || []);
            } else {
                failedSections.push('правила публикации');
            }
            if (draftResult.status === 'fulfilled') {
                const nextDrafts = draftResult.value.data || [];
                setDrafts(nextDrafts);
                setSelectedDraftId(nextDrafts[0]?.id || null);
            } else {
                failedSections.push('история файлов');
            }
            if (failedSections.length) {
                message.warning(`Не удалось загрузить: ${failedSections.join(', ')}. Остальные данные доступны.`);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const reloadSources = useCallback(async () => {
        if (!customerId || !configId) return [];
        const { data } = await getCustomerPricelistSources(customerId, configId);
        const nextSources = data || [];
        setSources(nextSources);
        setDirtySourceIds(new Set());
        return nextSources;
    }, [customerId, configId]);

    useEffect(() => {
        if (!activeConfig) {
            settingsForm.resetFields();
            return;
        }
        // The configuration response already contains its sources. Keep them
        // visible even if publication rules or draft history are temporarily
        // unavailable and the detailed workspace request only partially loads.
        setSources(activeConfig.sources || []);
        const extra = activeConfig.additional_filters || {};
        const finalFilterPolicy = extra.FINAL_FILTER_POLICY || {};
        setPipelineOrder(
            Array.isArray(extra.PIPELINE_ORDER) && extra.PIPELINE_ORDER.length
                ? extra.PIPELINE_ORDER
                : DEFAULT_PIPELINE_ORDER
        );
        settingsForm.setFieldsValue({
            name: activeConfig.name,
            is_active: activeConfig.is_active,
            general_markup: activeConfig.general_markup,
            own_price_list_markup: activeConfig.own_price_list_markup,
            third_party_markup: activeConfig.third_party_markup,
            export_file_name: activeConfig.export_file_name,
            export_file_format: activeConfig.export_file_format || 'xlsx',
            export_file_extension: activeConfig.export_file_extension,
            collapse_duplicates_by_min_price:
                activeConfig.collapse_duplicates_by_min_price !== false,
            emails: activeConfig.emails || [],
            outgoing_email_account_ids:
                activeConfig.outgoing_email_account_ids?.length
                    ? activeConfig.outgoing_email_account_ids
                    : activeConfig.outgoing_email_account_id
                        ? [activeConfig.outgoing_email_account_id]
                        : [],
            schedule_days: activeConfig.schedule_days || [],
            schedule_times: activeConfig.schedule_times || [],
            max_source_age_business_days:
                activeConfig.max_source_age_business_days ?? 1,
            block_stale_sources: activeConfig.block_stale_sources !== false,
            zzap_enabled: Boolean(extra.ZZAP),
            zzap_benchmark_provider_config_id:
                extra.ZZAP_BENCHMARK_PROVIDER_CONFIG_ID || null,
            zzap_min_price_multiplier: safeNumber(
                extra.ZZAP_MIN_PRICE_MULTIPLIER,
                1.2
            ),
            zzap_rounding_step: safeNumber(extra.ZZAP_ROUNDING_STEP, 10),
            zzap_label_products: extra.ZZAP_LABEL_PRODUCTS !== false,
            require_draft_approval: Boolean(extra.REQUIRE_DRAFT_APPROVAL),
            send_pricelist_by_email: Boolean(extra.SEND_PRICELIST_BY_EMAIL),
            publish_confirmed_dz_crosses:
                extra.PUBLISH_CONFIRMED_DZ_CROSSES !== false,
            pipeline_v2_enabled: Boolean(extra.PIPELINE_V2_ENABLED),
            profile_template: extra.PROFILE_TEMPLATE || 'custom',
            dz_transform_enabled: Boolean(extra.DZ_ORIGINAL_TRANSFORM_ENABLED),
            dz_transform_include_crosses: extra.DZ_TRANSFORM_INCLUDE_CROSSES !== false,
            dz_transform_keep_dragonzap: Boolean(extra.DZ_TRANSFORM_KEEP_DRAGONZAP),
            product_labels_enabled: Boolean(extra.PRODUCT_LABELS_ENABLED),
            label_original_enabled: extra.LABEL_ORIGINAL_ENABLED !== false,
            label_transformed_enabled: extra.LABEL_TRANSFORMED_ENABLED !== false,
            label_original_text: extra.LABEL_ORIGINAL_TEXT || '>>Оригинал<<',
            label_transformed_text: extra.LABEL_TRANSFORMED_TEXT || '>>Неоригинал<<',
            price_control_enabled: Boolean(extra.PRICE_CONTROL_ENABLED),
            price_control_provider_config_ids:
                extra.PRICE_CONTROL_PROVIDER_CONFIG_IDS || [],
            price_control_stages: extra.PRICE_CONTROL_STAGES || [],
            price_control_multiplier: safeNumber(extra.PRICE_CONTROL_MULTIPLIER, 1.2),
            price_control_rounding_step:
                safeNumber(extra.PRICE_CONTROL_ROUNDING_STEP, 10),
            duplicate_policy:
                extra.DUPLICATE_POLICY || 'cheapest_then_stock_then_original',
            quality_control_enabled: extra.QUALITY_CONTROL_ENABLED == null
                ? Boolean(extra.PIPELINE_V2_ENABLED)
                : Boolean(extra.QUALITY_CONTROL_ENABLED),
            final_filter_enabled: Boolean(extra.FINAL_FILTER_ENABLED),
            final_filter_brand_mode: finalFilterPolicy.brand_mode || 'all',
            final_filter_brands: finalFilterPolicy.brands || [],
            final_filter_position_mode: finalFilterPolicy.position_mode || 'all',
            final_filter_positions: (finalFilterPolicy.positions || []).map((position) => {
                if (typeof position === 'string') return position;
                return [position?.brand, position?.oem || position?.oem_number]
                    .filter(Boolean)
                    .join(' | ');
            }),
            final_filter_min_quantity: finalFilterPolicy.min_quantity ?? null,
            final_filter_rules: (extra.FINAL_FILTER_RULES || []).map((rule) => ({
                ...rule,
                enabled: rule.enabled !== false,
                action: rule.action || 'exclude',
                oem_match: rule.oem_match || 'exact',
            })),
            publication_rules_only_configured:
                extra.PUBLICATION_RULES_ONLY_CONFIGURED === true,
        });
        setSettingsDirty(false);
    }, [activeConfig, settingsForm]);

    const loadDraftRows = useCallback(async () => {
        if (!customerId || !configId || !selectedDraftId) {
            setDraftRows([]);
            setDraftRowsTotal(0);
            return;
        }
        setRowsLoading(true);
        try {
            const { data } = await listCustomerPricelistDraftRows(
                customerId,
                configId,
                selectedDraftId,
                {
                    page: draftRowsPage,
                    page_size: draftRowsPageSize,
                    search: draftSearch || undefined,
                    row_type: draftRowType || undefined,
                }
            );
            setDraftRows(data.items || []);
            setDraftRowsTotal(data.total || 0);
            if (draftSearch && Number(data.total || 0) === 0) {
                setDiagnosticLoading(true);
                try {
                    const diagnosticResponse = await diagnoseCustomerPricelistPosition(
                        customerId,
                        configId,
                        selectedDraftId,
                        draftSearch
                    );
                    setPositionDiagnostic(diagnosticResponse.data || null);
                } finally {
                    setDiagnosticLoading(false);
                }
            } else {
                setPositionDiagnostic(null);
            }
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить строки черновика'));
        } finally {
            setRowsLoading(false);
        }
    }, [
        customerId,
        configId,
        selectedDraftId,
        draftRowsPage,
        draftRowsPageSize,
        draftSearch,
        draftRowType,
    ]);

    useEffect(() => {
        void loadDraftRows();
    }, [loadDraftRows]);

    const handleCustomerChange = async (value) => {
        setCustomerId(value);
        setConfigId(null);
        setSourceToAdd(null);
        setConfigs([]);
        setSources([]);
        setDirtySourceIds(new Set());
        setRules([]);
        setDrafts([]);
        setSelectedDraftId(null);
        await loadCustomerConfigs(value);
    };

    const handleConfigChange = async (value) => {
        setConfigId(value);
        setSourceToAdd(null);
        setDraftRowsPage(1);
        setDirtySourceIds(new Set());
        await loadWorkspace(customerId, value);
    };

    const handleCreateConfig = async () => {
        if (!customerId) {
            message.error('Сначала выберите клиента');
            return;
        }
        setCreatingConfig(true);
        try {
            const values = await newConfigForm.validateFields();
            const { data } = await createCustomerPricelistConfig(customerId, {
                name: values.name.trim(),
                general_markup: 1,
                own_price_list_markup: 1,
                third_party_markup: 1,
                export_file_format: 'xlsx',
                collapse_duplicates_by_min_price: true,
                max_source_age_business_days: 1,
                block_stale_sources: true,
                is_active: true,
            });
            setConfigs((previous) => [...previous, data]);
            setConfigId(data.id);
            setNewConfigOpen(false);
            newConfigForm.resetFields();
            await loadWorkspace(customerId, data.id);
            message.success(`Конфигурация «${data.name}» создана`);
        } catch (error) {
            if (!error?.errorFields) {
                message.error(getErrorText(error, 'Не удалось создать конфигурацию'));
            }
        } finally {
            setCreatingConfig(false);
        }
    };

    const handleDeleteConfig = async () => {
        if (!customerId || !configId || !activeConfig) return;
        setDeletingConfig(true);
        try {
            const deletedName = activeConfig.name;
            await deleteCustomerPricelistConfig(customerId, configId);
            const { data } = await getCustomerPricelistConfigs(customerId);
            setConfigs(data || []);
            setConfigId(null);
            setSources([]);
            setRules([]);
            setDrafts([]);
            setSelectedDraftId(null);
            message.success(`Конфигурация «${deletedName}» удалена`);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось удалить конфигурацию'));
        } finally {
            setDeletingConfig(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!customerId || !configId || !activeConfig) {
            message.error('Сначала выберите клиента и конфигурацию прайс-листа');
            return;
        }
        setSavingSettings(true);
        try {
            const values = await settingsForm.validateFields();
            const normalizedPipelineOrder = normalizePipelineOrder(pipelineOrder);
            setPipelineOrder(normalizedPipelineOrder);
            const additionalFilters = {
                ...(activeConfig.additional_filters || {}),
                ZZAP: values.pipeline_v2_enabled
                    ? false
                    : Boolean(activeConfig.additional_filters?.ZZAP),
                REQUIRE_DRAFT_APPROVAL: Boolean(values.require_draft_approval),
                SEND_PRICELIST_BY_EMAIL: Boolean(values.send_pricelist_by_email),
                PUBLISH_CONFIRMED_DZ_CROSSES:
                    values.publish_confirmed_dz_crosses !== false,
                PIPELINE_V2_ENABLED: Boolean(values.pipeline_v2_enabled),
                PROFILE_TEMPLATE: values.profile_template || 'custom',
                PIPELINE_ORDER: normalizedPipelineOrder,
                DZ_ORIGINAL_TRANSFORM_ENABLED: Boolean(values.dz_transform_enabled),
                DZ_TRANSFORM_INCLUDE_CROSSES:
                    values.dz_transform_include_crosses !== false,
                DZ_TRANSFORM_KEEP_DRAGONZAP:
                    Boolean(values.dz_transform_keep_dragonzap),
                PRODUCT_LABELS_ENABLED: Boolean(values.product_labels_enabled),
                LABEL_ORIGINAL_ENABLED: values.label_original_enabled !== false,
                LABEL_TRANSFORMED_ENABLED: values.label_transformed_enabled !== false,
                LABEL_ORIGINAL_TEXT: values.label_original_text || '>>Оригинал<<',
                LABEL_TRANSFORMED_TEXT:
                    values.label_transformed_text || '>>Неоригинал<<',
                PRICE_CONTROL_ENABLED: Boolean(values.price_control_enabled),
                PRICE_CONTROL_PROVIDER_CONFIG_IDS:
                    values.price_control_provider_config_ids || [],
                PRICE_CONTROL_STAGES: values.price_control_stages || [],
                PRICE_CONTROL_MULTIPLIER: values.price_control_multiplier ?? 1.2,
                PRICE_CONTROL_ROUNDING_STEP:
                    values.price_control_rounding_step ?? 10,
                DUPLICATE_POLICY:
                    values.duplicate_policy || 'cheapest_then_stock_then_original',
                QUALITY_CONTROL_ENABLED: Boolean(values.quality_control_enabled),
                FINAL_FILTER_ENABLED: Boolean(values.final_filter_enabled),
                FINAL_FILTER_POLICY: {
                    brand_mode: values.final_filter_brand_mode || 'all',
                    brands: values.final_filter_brands || [],
                    position_mode: values.final_filter_position_mode || 'all',
                    positions: (values.final_filter_positions || [])
                        .map((value) => String(value || '').trim())
                        .filter(Boolean),
                    min_quantity: values.final_filter_min_quantity ?? null,
                },
                FINAL_FILTER_RULES: (values.final_filter_rules || []).map((rule, index) => ({
                    ...rule,
                    id: rule.id || `final-${Date.now()}-${index}`,
                    enabled: rule.enabled !== false,
                })),
                PUBLICATION_RULES_ONLY_CONFIGURED:
                    values.publication_rules_only_configured === true,
            };
            const { data } = await updateCustomerPricelistConfig(
                customerId,
                configId,
                {
                    name: values.name,
                    is_active: values.is_active,
                    general_markup: values.general_markup,
                    own_price_list_markup: values.own_price_list_markup,
                    third_party_markup: values.third_party_markup,
                    export_file_name: values.export_file_name || null,
                    export_file_format: values.export_file_format,
                    export_file_extension: values.export_file_extension || null,
                    collapse_duplicates_by_min_price:
                        values.collapse_duplicates_by_min_price,
                    emails: values.emails || [],
                    outgoing_email_account_ids:
                        values.outgoing_email_account_ids || [],
                    schedule_days: values.schedule_days || [],
                    schedule_times: values.schedule_times || [],
                    max_source_age_business_days:
                        values.max_source_age_business_days ?? 1,
                    block_stale_sources: values.block_stale_sources !== false,
                    additional_filters: additionalFilters,
                }
            );
            setConfigs((previous) => previous.map((item) => (
                item.id === configId ? data : item
            )));
            const requestedAccountIds = (values.outgoing_email_account_ids || [])
                .map(Number);
            const savedAccountIds = (data.outgoing_email_account_ids?.length
                ? data.outgoing_email_account_ids
                : data.outgoing_email_account_id
                    ? [data.outgoing_email_account_id]
                    : [])
                .map(Number);
            if (JSON.stringify(requestedAccountIds) !== JSON.stringify(savedAccountIds)) {
                throw new Error(
                    'Сервер не подтвердил сохранение почты отправителя. Обновите страницу и повторите.'
                );
            }
            const markupFields = [
                'general_markup',
                'own_price_list_markup',
                'third_party_markup',
            ];
            const markupWasSaved = markupFields.every((field) => (
                Math.abs(Number(data[field]) - Number(values[field])) < 0.000001
            ));
            if (
                !markupWasSaved
                || Number(data.max_source_age_business_days)
                    !== Number(values.max_source_age_business_days ?? 1)
                || Boolean(data.block_stale_sources)
                    !== Boolean(values.block_stale_sources !== false)
            ) {
                throw new Error(
                    'Сервер не подтвердил сохранение наценок или контроля актуальности'
                );
            }
            const requestedFinalRules = additionalFilters.FINAL_FILTER_RULES || [];
            const savedFinalRules = data.additional_filters?.FINAL_FILTER_RULES || [];
            if (
                Boolean(data.additional_filters?.FINAL_FILTER_ENABLED)
                    !== additionalFilters.FINAL_FILTER_ENABLED
                || savedFinalRules.length !== requestedFinalRules.length
            ) {
                throw new Error(
                    'Сервер не подтвердил сохранение финальных фильтров. Обновите страницу и повторите.'
                );
            }
            const senderEmails = savedAccountIds
                .map((accountId) => outgoingEmailAccounts.find(
                    (account) => Number(account.id) === accountId
                )?.email)
                .filter(Boolean);
            const deliveryText = senderEmails.length
                ? `Отправители: ${senderEmails.join(', ')}`
                : 'Используется почта отправителя по умолчанию';
            message.success(
                `Настройки сохранены. Финальных правил: ${savedFinalRules.length}. ${deliveryText}`
            );
            setSettingsDirty(false);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить настройки'));
        } finally {
            setSavingSettings(false);
        }
    };

    const applyZzapTemplate = () => {
        setPipelineOrder(ZZAP_TEMPLATE.PIPELINE_ORDER);
        settingsForm.setFieldsValue({
            pipeline_v2_enabled: ZZAP_TEMPLATE.PIPELINE_V2_ENABLED,
            profile_template: ZZAP_TEMPLATE.PROFILE_TEMPLATE,
            dz_transform_enabled: ZZAP_TEMPLATE.DZ_ORIGINAL_TRANSFORM_ENABLED,
            dz_transform_include_crosses: ZZAP_TEMPLATE.DZ_TRANSFORM_INCLUDE_CROSSES,
            dz_transform_keep_dragonzap: ZZAP_TEMPLATE.DZ_TRANSFORM_KEEP_DRAGONZAP,
            publish_confirmed_dz_crosses: ZZAP_TEMPLATE.PUBLISH_CONFIRMED_DZ_CROSSES,
            product_labels_enabled: ZZAP_TEMPLATE.PRODUCT_LABELS_ENABLED,
            label_original_enabled: ZZAP_TEMPLATE.LABEL_ORIGINAL_ENABLED,
            label_transformed_enabled: ZZAP_TEMPLATE.LABEL_TRANSFORMED_ENABLED,
            label_original_text: ZZAP_TEMPLATE.LABEL_ORIGINAL_TEXT,
            label_transformed_text: ZZAP_TEMPLATE.LABEL_TRANSFORMED_TEXT,
            price_control_enabled: ZZAP_TEMPLATE.PRICE_CONTROL_ENABLED,
            price_control_stages: ZZAP_TEMPLATE.PRICE_CONTROL_STAGES,
            price_control_multiplier: ZZAP_TEMPLATE.PRICE_CONTROL_MULTIPLIER,
            price_control_rounding_step: ZZAP_TEMPLATE.PRICE_CONTROL_ROUNDING_STEP,
            duplicate_policy: ZZAP_TEMPLATE.DUPLICATE_POLICY,
            quality_control_enabled: ZZAP_TEMPLATE.QUALITY_CONTROL_ENABLED,
            require_draft_approval: ZZAP_TEMPLATE.REQUIRE_DRAFT_APPROVAL,
        });
        setSettingsDirty(true);
        message.info('Шаблон ZZap заполнен. Выберите контрольные прайсы и сохраните настройки.');
    };

    const handlePipelineDrop = (targetStep) => {
        if (!draggedPipelineStep || draggedPipelineStep === targetStep) return;
        setSettingsDirty(true);
        setPipelineOrder((previous) => {
            const next = previous.filter((step) => step !== draggedPipelineStep);
            const targetIndex = next.indexOf(targetStep);
            next.splice(targetIndex, 0, draggedPipelineStep);
            return next;
        });
        setDraggedPipelineStep(null);
    };

    const handleSourceChange = (sourceId, patch) => {
        setSources((previous) => previous.map((source) => (
            source.id === sourceId ? { ...source, ...patch } : source
        )));
        setDirtySourceIds((previous) => new Set(previous).add(sourceId));
    };

    const handleAddSource = async () => {
        if (!customerId || !configId || !sourceToAdd) {
            message.error('Выберите прайс поставщика для подключения');
            return;
        }
        setAddingSource(true);
        try {
            const { data } = await createCustomerPricelistSource(
                customerId,
                configId,
                {
                    provider_config_id: sourceToAdd,
                    enabled: true,
                    markup: 1,
                }
            );
            await reloadSources();
            setSourceToAdd(null);
            message.success(
                `Источник «${data.provider_name} · ${data.provider_config_name || data.provider_config_id}» подключён`
            );
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось подключить источник'));
        } finally {
            setAddingSource(false);
        }
    };

    const handleDeleteSource = async (source) => {
        setSourceDeletingId(source.id);
        try {
            await deleteCustomerPricelistSource(
                customerId,
                configId,
                source.id
            );
            await reloadSources();
            message.success('Источник отключён от прайса клиента');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось удалить источник'));
        } finally {
            setSourceDeletingId(null);
        }
    };

    const handleSaveSource = async (source) => {
        const requestedMarkup = Number(source.markup);
        if (!Number.isFinite(requestedMarkup) || requestedMarkup <= 0) {
            message.error('Коэффициент источника должен быть больше нуля');
            return;
        }
        setSourceSavingId(source.id);
        try {
            const additionalFilters = {
                ...(source.additional_filters || {}),
                DZ_EXPAND_BRANDS: Boolean(source.dz_expand_brands),
            };
            const { data } = await updateCustomerPricelistSource(
                customerId,
                configId,
                source.id,
                {
                    enabled: source.enabled,
                    markup: source.markup,
                    mask_price_quantity: source.mask_price_quantity,
                    additional_filters: additionalFilters,
                }
            );
            const savedMarkup = Number(data.markup);
            if (
                !Number.isFinite(savedMarkup)
                || Math.abs(requestedMarkup - savedMarkup) > 0.000001
                || Boolean(data.enabled) !== Boolean(source.enabled)
                || Boolean(data.mask_price_quantity) !== Boolean(source.mask_price_quantity)
                || Boolean(data.additional_filters?.DZ_EXPAND_BRANDS)
                    !== Boolean(source.dz_expand_brands)
            ) {
                throw new Error('Сервер не подтвердил сохранение параметров источника');
            }
            await reloadSources();
            message.success(`Источник «${source.provider_config_name || source.provider_name}» сохранён`);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить источник'));
        } finally {
            setSourceSavingId(null);
        }
    };

    const openSourceFilters = (source) => {
        const extra = source.additional_filters || {};
        const dragonzapBrandIds = new Set(
            brandOptions
                .filter((brand) => String(brand.label || '').trim().toUpperCase() === 'DRAGONZAP')
                .map((brand) => Number(brand.value))
        );
        const dragonzapIsExcluded = source.brand_filters?.type === 'exclude'
            && (source.brand_filters?.brands || []).some((brandId) => (
                dragonzapBrandIds.has(Number(brandId))
            ));
        const inferredDragonzapMode = (
            settingsForm.getFieldValue('pipeline_v2_enabled')
            && settingsForm.getFieldValue('dz_transform_enabled')
            && dragonzapIsExcluded
        ) ? 'transform_only' : 'normal';
        setSourceFilterTarget(source);
        setSourcePositionOptions(source.position_filters?.items || []);
        sourceFilterForm.setFieldsValue({
            dragonzap_mode: extra.DRAGONZAP_MODE || inferredDragonzapMode,
            brand_filter_type: source.brand_filters?.type || 'exclude',
            brand_filter_ids: source.brand_filters?.brands || [],
            position_filter_type: source.position_filters?.type || 'exclude',
            position_filter_ids: source.position_filters?.autoparts || [],
            min_price: source.min_price ?? null,
            max_price: source.max_price ?? null,
            min_quantity: source.min_quantity ?? null,
            max_quantity: source.max_quantity ?? null,
            brand_rules: extra.BRAND_FILTER_RULES || [],
        });
        setSourceFilterOpen(true);
    };

    const searchSourcePositions = async (value) => {
        if (!sourceFilterTarget || String(value || '').trim().length < 2) return;
        setSourcePositionLoading(true);
        try {
            const { data } = await searchCustomerPricelistPublicationCandidates(
                customerId,
                configId,
                {
                    search: String(value).trim(),
                    limit: 50,
                    provider_config_id: sourceFilterTarget.provider_config_id,
                }
            );
            setSourcePositionOptions((previous) => {
                const merged = new Map(previous.map((item) => [item.autopart_id, item]));
                (data || []).forEach((item) => merged.set(item.autopart_id, item));
                return Array.from(merged.values());
            });
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось найти позиции источника'));
        } finally {
            setSourcePositionLoading(false);
        }
    };

    const saveSourceFilters = async () => {
        if (!sourceFilterTarget) return;
        setSourceFilterSaving(true);
        try {
            const values = await sourceFilterForm.validateFields();
            const additionalFilters = {
                ...(sourceFilterTarget.additional_filters || {}),
                DRAGONZAP_MODE: values.dragonzap_mode || 'normal',
                BRAND_FILTER_RULES: values.brand_rules || [],
            };
            const selectedPositionIds = values.position_filter_ids || [];
            const selectedPositionItems = sourcePositionOptions.filter((item) => (
                selectedPositionIds.includes(item.autopart_id)
            ));
            const { data } = await updateCustomerPricelistSource(
                customerId,
                configId,
                sourceFilterTarget.id,
                {
                    brand_filters: {
                        type: values.brand_filter_type || 'exclude',
                        brands: values.brand_filter_ids || [],
                    },
                    position_filters: {
                        type: values.position_filter_type || 'exclude',
                        autoparts: selectedPositionIds,
                        items: selectedPositionItems,
                    },
                    min_price: values.min_price ?? null,
                    max_price: values.max_price ?? null,
                    min_quantity: values.min_quantity ?? null,
                    max_quantity: values.max_quantity ?? null,
                    additional_filters: additionalFilters,
                }
            );
            setSources((previous) => previous.map((source) => (
                source.id === data.id ? { ...source, ...data } : source
            )));
            setSourceFilterOpen(false);
            message.success('Фильтры источника сохранены');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить фильтры'));
        } finally {
            setSourceFilterSaving(false);
        }
    };

    const sourceOptions = useMemo(() => sources.map((source) => ({
        value: source.id,
        label: `${source.provider_name || 'Поставщик'} · ${source.provider_config_name || `конфигурация ${source.provider_config_id}`}`,
    })), [sources]);

    const normalizedSources = useMemo(() => sources.map((source) => ({
        ...source,
        dz_expand_brands: source.dz_expand_brands ?? Boolean(
            source.additional_filters?.DZ_EXPAND_BRANDS
        ),
    })), [sources]);

    const finalPositionOptions = useMemo(() => {
        const options = new Map();
        for (const row of draftRows || []) {
            const brand = String(row?.advertised_brand || '').trim();
            const oem = String(row?.advertised_oem || '').trim();
            if (!oem) continue;
            const value = brand ? `${brand} | ${oem}` : oem;
            options.set(value, {
                value,
                label: `${value}${row?.advertised_name ? ` · ${row.advertised_name}` : ''}`,
            });
        }
        return Array.from(options.values());
    }, [draftRows]);

    const searchCandidates = async (value) => {
        if (!customerId || !configId || String(value || '').trim().length < 2) return;
        setCandidateLoading(true);
        try {
            const { data } = await searchCustomerPricelistPublicationCandidates(
                customerId,
                configId,
                { search: value, limit: 40 }
            );
            setCandidateOptions(data || []);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось найти позицию'));
        } finally {
            setCandidateLoading(false);
        }
    };

    const handleSourceCandidateChange = async (autopartId) => {
        ruleForm.setFieldValue('target_autopart_ids', []);
        setCrossOptions([]);
        if (!autopartId) return;
        try {
            const { data } = await listCustomerPricelistPublicationCrosses(
                customerId,
                configId,
                autopartId
            );
            setCrossOptions(data || []);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить подтверждённые кроссы'));
        }
    };

    useEffect(() => {
        const priceMode = watchedRulePriceMode;
        const ready = ruleModalOpen && customerId && configId && watchedRuleSource
            && watchedRuleMode !== 'hide'
            && (priceMode === 'fixed' ? Number(watchedRuleFixed) > 0
                : priceMode === 'percent' ? Number(watchedRulePercent) > 0 : false);
        if (!ready) {
            setRulePreview(null);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const { data } = await previewCustomerPricelistPublicationRule(
                    customerId,
                    configId,
                    {
                        source_autopart_id: watchedRuleSource,
                        price_mode: priceMode,
                        fixed_price: priceMode === 'fixed' ? Number(watchedRuleFixed) : null,
                        price_percent: priceMode === 'percent' ? Number(watchedRulePercent) : null,
                        price_source_id: priceMode === 'percent' ? watchedRuleSourceId || null : null,
                        price_rounding_step: priceMode === 'percent' ? watchedRuleRounding || null : null,
                    }
                );
                if (!cancelled) setRulePreview(data);
            } catch {
                if (!cancelled) setRulePreview(null);
            }
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [
        ruleModalOpen, customerId, configId, watchedRuleSource, watchedRulePriceMode,
        watchedRuleFixed, watchedRulePercent, watchedRuleSourceId, watchedRuleRounding,
        watchedRuleMode,
    ]);

    const handleSaveRule = async () => {
        setRuleSaving(true);
        try {
            const { valid_range: validRange, ...formValues } = await ruleForm.validateFields();
            const values = {
                ...formValues,
                valid_from: validRange?.[0] ? validRange[0].format('YYYY-MM-DD') : null,
                valid_to: validRange?.[1] ? validRange[1].format('YYYY-MM-DD') : null,
            };
            await saveCustomerPricelistPublicationRule(
                customerId,
                configId,
                values
            );
            const { data } = await listCustomerPricelistPublicationRules(
                customerId,
                configId
            );
            setRules(data || []);
            setRuleModalOpen(false);
            ruleForm.resetFields();
            setCandidateOptions([]);
            setCrossOptions([]);
            setRulePreview(null);
            message.success('Правило публикации сохранено');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить правило'));
        } finally {
            setRuleSaving(false);
        }
    };

    const refreshRules = async () => {
        const { data } = await listCustomerPricelistPublicationRules(customerId, configId);
        setRules(data || []);
    };

    const handleBulkDeleteRules = async (ruleIds) => {
        if (!ruleIds.length) return;
        setRuleDeleting(true);
        try {
            const { data } = await bulkDeleteCustomerPricelistPublicationRules(
                customerId,
                configId,
                ruleIds
            );
            await refreshRules();
            setSelectedRuleIds([]);
            setFilteredRules((previous) => (
                previous ? previous.filter((rule) => !ruleIds.includes(rule.id)) : previous
            ));
            message.success(`Удалено правил: ${data.deleted}`);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось удалить правила'));
        } finally {
            setRuleDeleting(false);
        }
    };

    const openBulkModal = () => {
        bulkForm.resetFields();
        bulkForm.setFieldsValue({
            scope: 'brand',
            action: 'price_only',
            price_mode: 'percent',
            price_percent: 100,
            overwrite_cross_rules: false,
        });
        setBulkPositionOptions([]);
        setBulkOpen(true);
    };

    const searchBulkPositions = async (value) => {
        if (String(value || '').trim().length < 2) return;
        try {
            const { data } = await searchCustomerPricelistPublicationCandidates(
                customerId,
                configId,
                { search: String(value).trim(), limit: 50 }
            );
            setBulkPositionOptions((previous) => {
                const merged = new Map(previous.map((item) => [item.autopart_id, item]));
                (data || []).forEach((item) => merged.set(item.autopart_id, item));
                return Array.from(merged.values());
            });
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось найти позиции'));
        }
    };

    const handleBulkSave = async () => {
        setBulkSaving(true);
        try {
            const values = await bulkForm.validateFields();
            const priced = values.action === 'price_only';
            const { data } = await bulkSaveCustomerPricelistPublicationRules(customerId, configId, {
                mode: values.action,
                price_mode: priced ? values.price_mode : 'default',
                fixed_price: priced && values.price_mode === 'fixed' ? values.fixed_price : null,
                price_percent: priced && values.price_mode === 'percent' ? values.price_percent : null,
                price_source_id: priced && values.price_mode === 'percent' ? values.price_source_id || null : null,
                price_rounding_step: priced && values.price_mode === 'percent' ? values.price_rounding_step || null : null,
                brand_id: values.scope === 'brand' ? values.brand_id : null,
                autopart_ids: values.scope === 'positions' ? values.autopart_ids : [],
                valid_from: values.valid_range?.[0] ? values.valid_range[0].format('YYYY-MM-DD') : null,
                valid_to: values.valid_range?.[1] ? values.valid_range[1].format('YYYY-MM-DD') : null,
                overwrite_cross_rules: Boolean(values.overwrite_cross_rules),
            });
            await refreshRules();
            setBulkOpen(false);
            message.success(
                `Правил создано: ${data.created}, обновлено: ${data.updated}, пропущено: ${data.skipped}`
            );
        } catch (error) {
            if (error?.errorFields) return;
            message.error(getErrorText(error, 'Не удалось применить правило'));
        } finally {
            setBulkSaving(false);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const { data } = await downloadPublicationRulesImportTemplate(customerId, configId);
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'publication_rules_template.xlsx';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось скачать шаблон'));
        }
    };

    const handleImportRules = async () => {
        if (!importFile) return;
        setImporting(true);
        try {
            const { data } = await importCustomerPricelistPublicationRules(
                customerId,
                configId,
                importFile,
                importOverwrite
            );
            setImportReport(data);
            await refreshRules();
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить файл'));
        } finally {
            setImporting(false);
        }
    };

    const handleEditRule = async (rule) => {
        const existingTargets = rule.targets?.length
            ? rule.targets
            : rule.target_autopart_id
                ? [{
                    autopart_id: rule.target_autopart_id,
                    brand: rule.target_brand,
                    oem: rule.target_oem,
                    name: rule.target_name,
                }]
                : [];
        setCandidateOptions([{
            autopart_id: rule.source_autopart_id,
            brand: rule.source_brand,
            oem: rule.source_oem,
            name: rule.source_name,
            quantity: 0,
            price: null,
        }]);
        setCrossOptions(existingTargets);
        ruleForm.setFieldsValue({
            source_autopart_id: rule.source_autopart_id,
            target_autopart_ids: existingTargets.map((item) => item.autopart_id),
            fixed_price: rule.fixed_price == null ? null : Number(rule.fixed_price),
            price_mode: rule.price_mode || (rule.fixed_price == null ? 'default' : 'fixed'),
            price_percent: rule.price_percent == null ? 100 : Number(rule.price_percent),
            price_source_id: rule.price_source_id ?? null,
            price_rounding_step: rule.price_rounding_step ?? null,
            valid_range: rule.valid_from || rule.valid_to
                ? [rule.valid_from ? dayjs(rule.valid_from) : null, rule.valid_to ? dayjs(rule.valid_to) : null]
                : null,
            mode: rule.mode,
            is_active: rule.is_active,
        });
        setRuleModalOpen(true);
        try {
            const { data } = await listCustomerPricelistPublicationCrosses(
                customerId,
                configId,
                rule.source_autopart_id
            );
            const mergedTargets = [...existingTargets, ...(data || [])].filter(
                (item, index, items) => items.findIndex(
                    (candidate) => candidate.autopart_id === item.autopart_id
                ) === index
            );
            setCrossOptions(mergedTargets);
        } catch {
            // Existing targets remain selectable if refreshing the cross list fails.
        }
    };

    const handleDeleteRule = async (ruleId) => {
        try {
            await deleteCustomerPricelistPublicationRule(
                customerId,
                configId,
                ruleId
            );
            setRules((previous) => previous.filter((rule) => rule.id !== ruleId));
            message.success('Правило удалено');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось удалить правило'));
        }
    };

    const reloadDrafts = async () => {
        try {
            const { data } = await listCustomerPricelistDrafts(customerId, configId);
            const nextDrafts = data || [];
            setDrafts(nextDrafts);
            setSelectedDraftId((current) => (
                nextDrafts.some((item) => item.id === current)
                    ? current
                    : nextDrafts[0]?.id || null
            ));
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось обновить историю прайсов'));
            throw error;
        }
    };

    const handleBuildDraft = async () => {
        setBuildingDraft(true);
        try {
            const { data } = await buildCustomerPricelistDraft(customerId, configId);
            await reloadDrafts();
            setSelectedDraftId(data.id);
            setDraftRowsPage(1);
            message.success(`Черновик №${data.id} сформирован и не отправлен`);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сформировать черновик'));
        } finally {
            setBuildingDraft(false);
        }
    };

    const handleDownload = async (draft) => {
        try {
            const response = await downloadCustomerPricelistDraft(
                customerId,
                configId,
                draft.id
            );
            const url = window.URL.createObjectURL(response.data);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = draft.artifact_filename || `pricelist-${draft.id}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось скачать файл'));
        }
    };

    const handleApprove = async (draft) => {
        try {
            await approveCustomerPricelistDraft(customerId, configId, draft.id);
            await reloadDrafts();
            message.success('Проверенный файл отправлен клиенту');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось отправить прайс'));
        }
    };

    const handleReject = (draft) => {
        let reason = '';
        Modal.confirm({
            title: `Отклонить черновик №${draft.id}`,
            content: (
                <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    placeholder="Укажите причину, чтобы она осталась в истории"
                    onChange={(event) => { reason = event.target.value; }}
                />
            ),
            okText: 'Отклонить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                if (reason.trim().length < 2) {
                    message.warning('Укажите причину отклонения');
                    return Promise.reject();
                }
                try {
                    await rejectCustomerPricelistDraft(
                        customerId,
                        configId,
                        draft.id,
                        reason.trim()
                    );
                    await reloadDrafts();
                    message.success('Черновик отклонён');
                    return undefined;
                } catch (error) {
                    message.error(getErrorText(error, 'Не удалось отклонить черновик'));
                    return Promise.reject(error);
                }
            },
        });
    };

    const settingsPanel = (
        <Form
            form={settingsForm}
            layout="vertical"
            className="pricelist-studio-form"
            onValuesChange={() => setSettingsDirty(true)}
        >
            <Form.Item name="profile_template" hidden><Input /></Form.Item>
            <div className={`settings-save-bar${settingsDirty ? ' is-dirty' : ''}`}>
                <div>
                    <Text strong>
                        {settingsDirty ? 'Есть несохранённые изменения' : 'Настройки синхронизированы'}
                    </Text>
                    <div className="muted-line">
                        {settingsDirty
                            ? 'Сохраните их перед переходом к другой конфигурации.'
                            : 'Наценки, расписание и фильтры загружены с сервера.'}
                    </div>
                </div>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingSettings}
                    onClick={handleSaveSettings}
                >
                    Сохранить изменения
                </Button>
            </div>
            <Row gutter={[18, 0]}>
                <Col xs={24} lg={12}>
                    <Form.Item name="name" label="Название конфигурации" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                </Col>
                <Col xs={12} lg={6}>
                    <Form.Item name="is_active" label="Конфигурация активна" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={12} lg={6}>
                    <Form.Item
                        name="collapse_duplicates_by_min_price"
                        label={pipelineV2Enabled
                            ? 'Сворачивание дублей выполняется конвейером'
                            : 'Сворачивать дубли'}
                        valuePropName="checked"
                    >
                        <Switch disabled={pipelineV2Enabled} />
                    </Form.Item>
                </Col>
            </Row>
            <Divider orientation="left">Наценки</Divider>
            <Row gutter={[18, 0]}>
                {[
                    ['general_markup', 'Общий коэффициент'],
                    ['own_price_list_markup', 'Собственное наличие'],
                    ['third_party_markup', 'Сторонние поставщики'],
                ].map(([name, label]) => (
                    <Col xs={24} md={8} key={name}>
                        <Form.Item
                            name={name}
                            label={label}
                            rules={[{ required: true, message: 'Укажите коэффициент' }]}
                        >
                            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                ))}
            </Row>
            <Divider orientation="left">Файл и расписание</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={8}>
                    <Form.Item name="export_file_name" label="Имя файла">
                        <Input placeholder="zzap_kross" />
                    </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                    <Form.Item name="export_file_format" label="Формат">
                        <Select options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }]} />
                    </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                    <Form.Item name="export_file_extension" label="Расширение">
                        <Input placeholder="xlsx" />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item name="emails" label="Получатели">
                        <Select mode="tags" tokenSeparators={[',', ';']} />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item
                        name="outgoing_email_account_ids"
                        label="Почта отправителя прайсов"
                        extra="Один и тот же прайс будет отправлен с каждого выбранного ящика. Если список пуст, используется ящик по умолчанию."
                    >
                        <Select
                            mode="multiple"
                            allowClear
                            maxTagCount="responsive"
                            showSearch
                            optionFilterProp="label"
                            placeholder="Выберите один или несколько ящиков"
                            options={outgoingEmailAccounts.map((account) => ({
                                value: account.id,
                                label: `${account.name} (${account.email})`,
                            }))}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                    <Form.Item name="schedule_days" label="Дни отправки">
                        <Select mode="multiple" options={DAY_OPTIONS} />
                    </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                    <Form.Item name="schedule_times" label="Время отправки">
                        <Select mode="tags" placeholder="09:00" />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item
                        name="max_source_age_business_days"
                        label="Допустимый возраст источников"
                        extra="Количество рабочих дней. Значение 1 разрешает использовать вчерашний прайс."
                    >
                        <InputNumber min={0} max={30} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item
                        name="block_stale_sources"
                        label="Исключать устаревшие источники"
                        extra="Устаревший источник не попадёт в файл, но остальные прайсы продолжат рассылаться."
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Col>
            </Row>
            <Divider orientation="left">DragonZap и кроссы</Divider>
            <Row gutter={[18, 12]}>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="publish_confirmed_dz_crosses"
                        label="Добавлять подтверждённые кроссы DragonZap"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="require_draft_approval"
                        label="Требовать проверку черновика перед отправкой"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="send_pricelist_by_email"
                        label="Отправлять прайс клиенту по почте по расписанию"
                        valuePropName="checked"
                        extra="Если выключено, прайс собирается и применяется к заказам, но клиенту письмо не уходит. Отправить вручную можно кнопкой «Отправить прайс получателям»"
                    >
                        <Switch />
                    </Form.Item>
                </Col>
            </Row>
            <div className="zzap-settings-block">
                <div className="profile-heading">
                    <div>
                        <Text className="eyebrow">Шаблон независимых настроек</Text>
                        <Title level={4}>Профиль ZZap</Title>
                        <Text type="secondary">
                            Заполняет преобразование, контроль цены, метки и проверку черновика.
                            Каждый параметр после этого можно изменить отдельно.
                        </Text>
                    </div>
                    <Button type="primary" onClick={applyZzapTemplate}>Применить шаблон</Button>
                </div>
                <Form.Item name="pipeline_v2_enabled" label="Новый конвейер" valuePropName="checked">
                    <Switch />
                </Form.Item>
            </div>

            <Divider orientation="left">Преобразование DragonZap</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={8}>
                    <Form.Item name="dz_transform_enabled" label="Преобразовывать в оригинал" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item name="dz_transform_include_crosses" label="Использовать подтверждённые кроссы" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item name="dz_transform_keep_dragonzap" label="Оставлять исходный DragonZap" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
            </Row>

            <Divider orientation="left">Контроль цены по нескольким прайсам</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={6}>
                    <Form.Item name="price_control_enabled" label="Контроль цены" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={18}>
                    <Form.Item name="price_control_provider_config_ids" label="Контрольные прайсы (можно несколько)">
                        <Select
                            mode="multiple"
                            showSearch
                            optionFilterProp="label"
                            options={providerOptions.map((item) => ({
                                value: item.id,
                                label: `${item.provider_name} · ${item.name_price || `конфигурация ${item.id}`}`,
                            }))}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item name="price_control_stages" label="Этапы сравнения">
                        <Select
                            mode="multiple"
                            options={[
                                { value: 'before', label: 'До преобразования' },
                                { value: 'after', label: 'После преобразования' },
                            ]}
                        />
                    </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                    <Form.Item name="price_control_multiplier" label="Мин. коэффициент к их цене">
                        <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                    <Form.Item name="price_control_rounding_step" label="Округление, ₽">
                        <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
                    </Form.Item>
                </Col>
            </Row>

            <Divider orientation="left">Метки в наименовании</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={6}>
                    <Form.Item name="product_labels_enabled" label="Добавлять метки" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
                <Col xs={24} md={9}>
                    <Form.Item name="label_original_text" label="Исходный оригинал">
                        <Input addonBefore="Текст" />
                    </Form.Item>
                    <Form.Item name="label_original_enabled" valuePropName="checked">
                        <Switch checkedChildren="Включено" unCheckedChildren="Выключено" />
                    </Form.Item>
                </Col>
                <Col xs={24} md={9}>
                    <Form.Item name="label_transformed_text" label="Преобразовано из DragonZap">
                        <Input addonBefore="Текст" />
                    </Form.Item>
                    <Form.Item name="label_transformed_enabled" valuePropName="checked">
                        <Switch checkedChildren="Включено" unCheckedChildren="Выключено" />
                    </Form.Item>
                </Col>
            </Row>

            <Divider orientation="left">Финальная фильтрация готового прайса</Divider>
            <Alert
                showIcon
                type={finalFilterEnabled ? 'warning' : 'info'}
                message={finalFilterEnabled
                    ? 'Финальный фильтр действует и изменит отправляемый файл'
                    : 'Финальный фильтр сейчас выключен'}
                description="Фильтры применяются последними — к бренду, артикулу и остатку, которые реально попадут в файл клиента. Белые списки оставляют только выбранное, чёрные исключают выбранное."
                style={{ marginBottom: 12 }}
            />
            <Form.Item name="final_filter_enabled" label="Использовать финальные фильтры" valuePropName="checked">
                <Switch disabled={!pipelineV2Enabled} />
            </Form.Item>
            <div className="final-filter-policy-grid">
                <Card size="small" className="final-filter-policy-card">
                    <Title level={5}>Бренды готового прайса</Title>
                    <Form.Item name="final_filter_brand_mode" label="Режим" initialValue="all">
                        <Select
                            disabled={!finalFilterEnabled}
                            options={[
                                { value: 'all', label: 'Все бренды' },
                                { value: 'include', label: 'Белый список — только выбранные' },
                                { value: 'exclude', label: 'Чёрный список — исключить выбранные' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name="final_filter_brands"
                        label={finalFilterBrandMode === 'exclude' ? 'Исключить бренды' : 'Оставить бренды'}
                        extra="Проверяется итоговый бренд после всех преобразований."
                    >
                        <Select
                            mode="tags"
                            showSearch
                            allowClear
                            disabled={!finalFilterEnabled || finalFilterBrandMode === 'all'}
                            optionFilterProp="label"
                            placeholder="Выберите или введите бренды"
                            options={brandOptions.map((brand) => ({
                                value: brand.label,
                                label: brand.label,
                            }))}
                        />
                    </Form.Item>
                </Card>

                <Card size="small" className="final-filter-policy-card">
                    <Title level={5}>Позиции готового прайса</Title>
                    <Form.Item name="final_filter_position_mode" label="Режим" initialValue="all">
                        <Select
                            disabled={!finalFilterEnabled}
                            options={[
                                { value: 'all', label: 'Все позиции' },
                                { value: 'include', label: 'Белый список — только выбранные' },
                                { value: 'exclude', label: 'Чёрный список — исключить выбранные' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name="final_filter_positions"
                        label={finalFilterPositionMode === 'exclude' ? 'Исключить позиции' : 'Оставить позиции'}
                        extra="Формат: БРЕНД | АРТИКУЛ. Если указать только артикул, правило действует для любого бренда."
                    >
                        <Select
                            mode="tags"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            tokenSeparators={[',', ';']}
                            disabled={!finalFilterEnabled || finalFilterPositionMode === 'all'}
                            placeholder="Например: TOYOTA | 9098012353"
                            options={finalPositionOptions}
                        />
                    </Form.Item>
                </Card>

                <Card size="small" className="final-filter-policy-card final-filter-policy-card--quantity">
                    <Title level={5}>Минимальный остаток</Title>
                    <Form.Item
                        name="final_filter_min_quantity"
                        label="Публиковать от указанного количества"
                        extra="Например, при значении 3 строки с остатком 0, 1 или 2 не попадут в файл."
                    >
                        <InputNumber
                            min={1}
                            precision={0}
                            addonAfter="шт."
                            disabled={!finalFilterEnabled}
                            style={{ width: '100%' }}
                            placeholder="Без ограничения"
                        />
                    </Form.Item>
                </Card>
            </div>

            <Collapse
                className="final-filter-advanced"
                items={[{
                    key: 'advanced-final-filters',
                    label: 'Дополнительные сложные правила',
                    children: (
            <Form.List name="final_filter_rules">
                {(fields, { add, remove }) => (
                    <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 18 }}>
                        {fields.map(({ key, name, ...restField }) => (
                            <Card
                                size="small"
                                key={key}
                                className="final-filter-rule"
                                extra={(
                                    <Button danger type="text" icon={<StopOutlined />} onClick={() => remove(name)}>
                                        Удалить
                                    </Button>
                                )}
                            >
                                <Form.Item {...restField} name={[name, 'id']} hidden><Input /></Form.Item>
                                <Row gutter={[12, 0]}>
                                    <Col xs={24} md={3}>
                                        <Form.Item {...restField} name={[name, 'enabled']} label="Активно" valuePropName="checked" initialValue>
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={9}>
                                        <Form.Item {...restField} name={[name, 'name']} label="Название правила">
                                            <Input placeholder="Например, исключить масла" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={5}>
                                        <Form.Item {...restField} name={[name, 'action']} label="Действие" initialValue="exclude">
                                            <Select options={[
                                                { value: 'exclude', label: 'Исключить совпадения' },
                                                { value: 'include', label: 'Разрешить совпадения' },
                                            ]} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={7}>
                                        <Form.Item {...restField} name={[name, 'brands']} label="Итоговые бренды">
                                            <Select
                                                mode="tags"
                                                showSearch
                                                optionFilterProp="label"
                                                options={brandOptions.map((brand) => ({
                                                    value: brand.label,
                                                    label: brand.label,
                                                }))}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={12} md={5}>
                                        <Form.Item {...restField} name={[name, 'oem_match']} label="Сравнение артикула" initialValue="exact">
                                            <Select options={[
                                                { value: 'exact', label: 'Точное совпадение' },
                                                { value: 'prefix', label: 'Начинается с' },
                                                { value: 'contains', label: 'Содержит' },
                                            ]} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={12} md={7}>
                                        <Form.Item {...restField} name={[name, 'oem']} label="Итоговый артикул">
                                            <Input placeholder="1064001701" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item {...restField} name={[name, 'name_contains']} label="Наименование содержит">
                                            <Input placeholder="масло" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item {...restField} name={[name, 'row_types']} label="Типы строк">
                                            <Select mode="multiple" options={Object.entries(ROW_TYPE_META).map(([value, meta]) => ({ value, label: meta.label }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item {...restField} name={[name, 'origin_types']} label="Происхождение">
                                            <Select mode="multiple" options={[
                                                { value: 'original_source', label: 'Исходное предложение' },
                                                { value: 'dragonzap_source', label: 'DragonZap без преобразования' },
                                                { value: 'dragonzap_transform', label: 'Преобразовано из DragonZap' },
                                            ]} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item {...restField} name={[name, 'provider_config_ids']} label="Исходные прайсы">
                                            <Select
                                                mode="multiple"
                                                showSearch
                                                optionFilterProp="label"
                                                options={providerOptions.map((item) => ({
                                                    value: item.id,
                                                    label: `${item.provider_name} · ${item.name_price || `конфигурация ${item.id}`}`,
                                                }))}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={12} md={4}><Form.Item {...restField} name={[name, 'min_price']} label="Цена от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                    <Col xs={12} md={4}><Form.Item {...restField} name={[name, 'max_price']} label="Цена до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                    <Col xs={12} md={4}><Form.Item {...restField} name={[name, 'min_quantity']} label="Остаток от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                    <Col xs={12} md={4}><Form.Item {...restField} name={[name, 'max_quantity']} label="Остаток до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                </Row>
                            </Card>
                        ))}
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => add({ enabled: true, action: 'exclude', oem_match: 'exact' })}
                        >
                            Добавить финальное правило
                        </Button>
                    </Space>
                )}
            </Form.List>
                    ),
                }]}
            />

            <Alert
                showIcon
                type="info"
                message="Новое или изменённое правило ещё не действует"
                description="Нажмите кнопку ниже, чтобы сохранить правила и применить их к готовому прайсу клиента."
                style={{ marginTop: 12, marginBottom: 12 }}
            />
            <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingSettings}
                onClick={handleSaveSettings}
            >
                Сохранить и применить фильтры
            </Button>

            <Divider orientation="left">Совпадения и контроль</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="duplicate_policy"
                        label="При совпадении Бренд + Артикул"
                        extra="Наше предложение всегда имеет приоритет. Если нашего предложения нет, выбирается минимальная цена; при равной цене — больший остаток."
                    >
                        <Select options={[
                            {
                                value: 'cheapest_then_stock_then_original',
                                label: 'Наше предложение; иначе самое дешёвое',
                            },
                        ]} />
                    </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                    <Form.Item name="quality_control_enabled" label="Контроль качества" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Col>
            </Row>

            <Divider orientation="left">Порядок обработки</Divider>
            <Alert
                showIcon
                type="info"
                message="Перетаскивайте блоки. При сохранении система автоматически соблюдает обязательные зависимости."
                style={{ marginBottom: 12 }}
            />
            <div className="pipeline-board">
                {pipelineOrder.map((step, index) => {
                    const meta = PIPELINE_BLOCKS[step] || { title: step, tone: 'default' };
                    return (
                        <div
                            className={`pipeline-step pipeline-${meta.tone}`}
                            draggable
                            key={step}
                            onDragStart={() => setDraggedPipelineStep(step)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => handlePipelineDrop(step)}
                        >
                            <HolderOutlined />
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>{meta.title}</strong>
                        </div>
                    );
                })}
            </div>
            <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingSettings}
                onClick={handleSaveSettings}
            >
                Сохранить настройки
            </Button>
        </Form>
    );

    const sourceColumns = [
        {
            title: 'Источник',
            key: 'source',
            render: (_, row) => (
                <div>
                    <Text strong>{row.provider_name}</Text>
                    <div className="muted-line">{row.provider_config_name || `Конфигурация ${row.provider_config_id}`}</div>
                </div>
            ),
        },
        {
            title: 'Активен',
            dataIndex: 'enabled',
            width: 90,
            render: (value, row) => (
                <Switch checked={value} onChange={(checked) => handleSourceChange(row.id, { enabled: checked })} />
            ),
        },
        {
            title: 'Коэффициент',
            dataIndex: 'markup',
            width: 140,
            render: (value, row) => (
                <InputNumber
                    min={0.01}
                    step={0.01}
                    value={value}
                    onChange={(next) => handleSourceChange(row.id, { markup: next })}
                    style={{ width: '100%' }}
                />
            ),
        },
        {
            title: 'Маскировать',
            dataIndex: 'mask_price_quantity',
            width: 120,
            render: (value, row) => (
                <Switch checked={value} onChange={(checked) => handleSourceChange(row.id, { mask_price_quantity: checked })} />
            ),
        },
        {
            title: 'Марки автомобилей',
            dataIndex: 'dz_expand_brands',
            width: 160,
            render: (value, row) => (
                <Switch checked={value} onChange={(checked) => handleSourceChange(row.id, { dz_expand_brands: checked })} />
            ),
        },
        {
            title: 'Фильтры',
            width: 190,
            render: (_, row) => (
                <Space direction="vertical" size={4}>
                    <Button icon={<FilterOutlined />} onClick={() => openSourceFilters(row)}>
                        Настроить
                    </Button>
                    {(row.additional_filters?.DRAGONZAP_MODE === 'transform_only'
                        || row.additional_filters?.DRAGONZAP_MODE === 'exclude'
                        || (row.brand_filters?.brands || []).length > 0
                        || (row.position_filters?.autoparts || []).length > 0
                        || row.min_price || row.max_price || row.min_quantity || row.max_quantity
                        || (row.additional_filters?.BRAND_FILTER_RULES || []).length > 0) && (
                        <Tag color="orange">Фильтр действует</Tag>
                    )}
                </Space>
            ),
        },
        {
            title: '',
            width: 230,
            render: (_, row) => (
                <Space size={4}>
                    {dirtySourceIds.has(row.id) && <Tag color="gold">Не сохранено</Tag>}
                    <Button
                        title="Сохранить источник"
                        icon={<SaveOutlined />}
                        type={dirtySourceIds.has(row.id) ? 'primary' : 'default'}
                        loading={sourceSavingId === row.id}
                        disabled={sourceDeletingId === row.id}
                        onClick={() => handleSaveSource(row)}
                    >
                        Сохранить
                    </Button>
                    <Popconfirm
                        title="Отключить источник?"
                        description="Настройки фильтров этого источника будут удалены."
                        okText="Отключить"
                        cancelText="Отмена"
                        onConfirm={() => handleDeleteSource(row)}
                    >
                        <Button
                            danger
                            title="Отключить источник"
                            icon={<DeleteOutlined />}
                            loading={sourceDeletingId === row.id}
                            disabled={sourceSavingId === row.id}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const ruleColumns = [
        {
            title: 'Фактическая позиция',
            key: 'source',
            width: 280,
            filters: Array.from(new Set(rules.map((rule) => rule.source_brand).filter(Boolean)))
                .sort()
                .map((brand) => ({ text: brand, value: brand })),
            filterSearch: true,
            onFilter: (value, row) => row.source_brand === value,
            render: (_, row) => (
                <div className="publication-rule-position">
                    <Text strong className="publication-rule-code">
                        {row.source_brand} {row.source_oem}
                    </Text>
                    <div className="muted-line">{row.source_name || 'Без наименования'}</div>
                </div>
            ),
        },
        {
            title: 'Правило',
            dataIndex: 'mode',
            width: 190,
            filters: [
                { text: 'Только выбранные кроссы', value: 'only_cross' },
                { text: 'Исходная + кроссы', value: 'add_cross' },
                { text: 'Только цена', value: 'price_only' },
                { text: 'Не публиковать', value: 'hide' },
            ],
            onFilter: (value, row) => row.mode === value,
            render: (value, row) => (
                <div>
                    {{
                        only_cross: <Tag color="green">Только выбранные кроссы</Tag>,
                        add_cross: <Tag color="blue">Исходная + кроссы</Tag>,
                        price_only: <Tag color="purple">Только цена</Tag>,
                        hide: <Tag color="red">Не публиковать</Tag>,
                    }[value] || value}
                    {(row.valid_from || row.valid_to) && (
                        <div className="muted-line">
                            {ruleValidityLabel(row)}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Публиковать как',
            key: 'target',
            width: 390,
            render: (_, row) => row.mode === 'hide' ? '—' : row.mode === 'price_only' ? (
                <Text type="secondary">Та же позиция, меняется только цена</Text>
            ) : (
                <div className="publication-rule-targets">
                    {(row.targets?.length ? row.targets : [{
                        brand: row.target_brand,
                        oem: row.target_oem,
                        name: row.target_name,
                    }]).map((target) => (
                        <div
                            className="publication-rule-target"
                            key={`${target.autopart_id || ''}-${target.brand}-${target.oem}`}
                        >
                            <Text strong className="publication-rule-code">
                                {target.brand} {target.oem}
                            </Text>
                            <div className="muted-line">{target.name || 'Без наименования'}</div>
                        </div>
                    ))}
                </div>
            ),
        },
        {
            title: 'Цена замены',
            dataIndex: 'fixed_price',
            width: 190,
            align: 'right',
            render: (value, row) => {
                if (row.mode === 'hide') {
                    return <Text type="secondary">Не применяется</Text>;
                }
                if (row.price_mode === 'percent' && row.price_percent != null) {
                    return (
                        <div>
                            <Text strong>{Number(row.price_percent).toLocaleString('ru-RU')} %</Text>
                            <div className="muted-line">
                                {row.price_source_name
                                    ? `от прайса ${row.price_source_name}`
                                    : 'от итоговой цены'}
                                {row.price_rounding_step ? `, округление до ${row.price_rounding_step} ₽` : ''}
                            </div>
                        </div>
                    );
                }
                return value == null
                    ? <Text type="secondary">По расчёту</Text>
                    : <Text strong>{Number(value).toLocaleString('ru-RU')} ₽</Text>;
            },
        },
        {
            title: 'Изменено',
            key: 'audit',
            width: 180,
            render: (_, row) => (
                <div>
                    <div>{row.updated_by_name || 'Система'}</div>
                    <div className="muted-line">{formatMoscow(row.updated_at)}</div>
                </div>
            ),
        },
        {
            title: '',
            width: 96,
            render: (_, row) => (
                <Space size={0}>
                    <Button
                        type="text"
                        title="Изменить правило"
                        icon={<EditOutlined />}
                        onClick={() => handleEditRule(row)}
                    />
                    <Popconfirm title="Удалить правило?" onConfirm={() => handleDeleteRule(row.id)}>
                        <Button danger type="text" icon={<StopOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const draftColumns = [
        {
            title: 'Версия',
            dataIndex: 'id',
            width: 100,
            render: (value) => <Text strong>№{value}</Text>,
        },
        {
            title: 'Состояние',
            dataIndex: 'generation_status',
            width: 170,
            render: (_, row) => {
                const status = effectiveDraftStatus(row);
                const meta = STATUS_META[status] || { color: 'default', label: status };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Сформирован',
            dataIndex: 'generated_at',
            width: 180,
            render: (value) => formatMoscow(value),
        },
        {
            title: 'Строк',
            dataIndex: 'positions_count',
            width: 110,
            render: (value) => Number(value || 0).toLocaleString('ru-RU'),
        },
        {
            title: 'Каналы доставки',
            key: 'delivery',
            width: 330,
            render: (_, row) => {
                const channels = row.generation_summary?.delivery?.channels || [];
                if (!channels.length) {
                    return row.send_error
                        ? <Text type="secondary">{row.send_error}</Text>
                        : <Text type="secondary">Нет детализации</Text>;
                }
                return (
                    <Space direction="vertical" size={2}>
                        {channels.map((channel, index) => {
                            const meta = DELIVERY_STATUS_META[channel.status]
                                || { color: 'default', label: channel.status };
                            const sender = channel.from_email || (
                                channel.kind === 'relay' ? 'SMTP relay' : 'Прямой канал'
                            );
                            const recipients = deliveryRecipients(channel);
                            return (
                                <div key={`${channel.kind}-${sender}-${index}`}>
                                    <Tag color={meta.color}>{meta.label}</Tag>
                                    <Text>{sender}</Text>
                                    {recipients && (
                                        <div className="muted-line">Кому: {recipients}</div>
                                    )}
                                </div>
                            );
                        })}
                    </Space>
                );
            },
        },
        {
            title: 'Решение',
            key: 'decision',
            render: (_, row) => row.decision_reason || row.send_error || (
                row.approved_by_name ? `Отправил: ${row.approved_by_name}` : '—'
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 330,
            render: (_, row) => (
                <Space wrap>
                    <Button size="small" icon={<FileSearchOutlined />} onClick={() => setSelectedDraftId(row.id)}>
                        Проверить
                    </Button>
                    <Button size="small" icon={<CloudDownloadOutlined />} onClick={() => handleDownload(row)}>
                        Скачать
                    </Button>
                    {['draft', 'send_failed', 'generated'].includes(row.generation_status) && (
                        <>
                            <Popconfirm
                                title="Отправить именно этот сохранённый файл?"
                                onConfirm={() => handleApprove(row)}
                            >
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<SendOutlined />}
                                    disabled={Boolean(row.generation_summary?.quality_control?.enabled)
                                        && row.generation_summary?.quality_control?.status === 'failed'}
                                >
                                    Принять и отправить
                                </Button>
                            </Popconfirm>
                            <Button size="small" danger onClick={() => handleReject(row)}>
                                Отклонить
                            </Button>
                        </>
                    )}
                </Space>
            ),
        },
    ];

    const rowColumns = [
        {
            title: 'Публикуемый бренд и артикул',
            key: 'published',
            width: 250,
            render: (_, row) => (
                <div>
                    <Text strong>{row.advertised_brand} {row.advertised_oem}</Text>
                    <div className="muted-line row-name">{row.advertised_name || 'Без наименования'}</div>
                </div>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 90,
            sorter: false,
        },
        {
            title: 'Кратность',
            dataIndex: 'multiplicity',
            width: 100,
            render: (value) => Number(value || 1),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 110,
            render: (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`,
        },
        {
            title: 'Получено из',
            key: 'actual',
            width: 270,
            render: (_, row) => row.source_autopart_id ? (
                <div>
                    <Text>{row.actual_brand} {row.actual_oem}</Text>
                    <div className="muted-line row-name">{row.actual_name || 'Без наименования'}</div>
                </div>
            ) : <Text type="secondary">Источник не сопоставлен</Text>,
        },
        {
            title: 'Преобразование',
            dataIndex: 'row_type',
            width: 190,
            render: (value, row) => {
                const meta = ROW_TYPE_META[value] || { color: 'default', label: value };
                const rule = row.publication_rule_id
                    ? rules.find((item) => item.id === row.publication_rule_id)
                    : null;
                return (
                    <div>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        {row.publication_rule_id && (
                            <Tag
                                color="purple"
                                style={{ cursor: rule ? 'pointer' : 'default' }}
                                onClick={rule ? () => handleEditRule(rule) : undefined}
                            >
                                {rule ? `Правило №${rule.id}` : `Правило №${row.publication_rule_id} удалено`}
                            </Tag>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="customer-pricelist-studio">
            <section className="studio-hero">
                <div>
                    <Text className="eyebrow">Администрирование продаж</Text>
                    <Title>Управление прайсами клиентов</Title>
                    <Text className="hero-copy">
                        Настройки, ручные замены и точная проверка файла до отправки.
                    </Text>
                </div>
                <div className="hero-selector">
                    <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Выберите клиента"
                        value={customerId}
                        onChange={handleCustomerChange}
                        options={customers.map((item) => ({ value: item.id, label: item.name }))}
                    />
                    <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Выберите конфигурацию"
                        disabled={!customerId}
                        value={configId}
                        onChange={handleConfigChange}
                        options={configs.map((item) => ({ value: item.id, label: item.name }))}
                    />
                    {activeConfig && (
                        <div className="studio-selection-meta">
                            <Tag color={activeConfig.is_active ? 'green' : 'default'}>
                                {activeConfig.is_active ? 'Активна' : 'Выключена'}
                            </Tag>
                            <Text>
                                Последняя отправка: {activeConfig.last_sent_at
                                    ? formatMoscow(activeConfig.last_sent_at)
                                    : 'ещё не было'}
                            </Text>
                            <Text>{sources.length} источников</Text>
                        </div>
                    )}
                    <Space wrap>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            disabled={!customerId}
                            onClick={() => setNewConfigOpen(true)}
                        >
                            Новая конфигурация
                        </Button>
                        <Button
                            icon={<EditOutlined />}
                            disabled={!customerId}
                            onClick={() => navigate(`/customers/${customerId}/edit`)}
                        >
                            Карточка клиента
                        </Button>
                        <Popconfirm
                            title="Удалить конфигурацию?"
                            description="Источники и настройки этой конфигурации будут удалены."
                            okText="Удалить"
                            cancelText="Отмена"
                            okButtonProps={{ danger: true, loading: deletingConfig }}
                            onConfirm={handleDeleteConfig}
                        >
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                disabled={!activeConfig}
                                loading={deletingConfig}
                            >
                                Удалить конфигурацию
                            </Button>
                        </Popconfirm>
                    </Space>
                </div>
            </section>

            {relayHealth?.status === 'offline' && (
                <Alert
                    type="error"
                    showIcon
                    message="Почтовая программа relay не работает"
                    description={(
                        `Ожидают отправки писем: ${Number(relayHealth.pending_count || 0).toLocaleString('ru-RU')}. `
                        + `Последний сигнал: ${relayHealth.last_seen_at ? formatMoscow(relayHealth.last_seen_at) : 'не получен'}. `
                        + 'Письма через прямой сервис могут быть уже отправлены — проверяйте каналы доставки в истории ниже.'
                    )}
                    action={(
                        <Space wrap>
                            <Button size="small" onClick={loadRelayHealth}>Обновить</Button>
                            <Button size="small" type="primary" onClick={() => navigate('/admin/monitor')}>
                                Открыть мониторинг
                            </Button>
                        </Space>
                    )}
                />
            )}
            {relayHealth?.status === 'idle' && Number(relayHealth.pending_count || 0) > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    message="Письма ожидают запуска relay"
                    description={`В очереди: ${Number(relayHealth.pending_count).toLocaleString('ru-RU')}. Последний сигнал от программы ещё не получен.`}
                    action={<Button size="small" onClick={loadRelayHealth}>Обновить</Button>}
                />
            )}

            {!activeConfig ? (
                <Card className="studio-empty">
                    <FileSearchOutlined />
                    <Title level={3}>Выберите клиента и конфигурацию</Title>
                    <Text type="secondary">После выбора появятся все параметры и история файлов.</Text>
                </Card>
            ) : (
                <>
                    <Row gutter={[14, 14]} className="studio-kpis">
                        <Col xs={12} lg={6}><Card><Statistic title="Источников" value={sources.length} /></Card></Col>
                        <Col xs={12} lg={6}><Card><Statistic title="Правил публикации" value={rules.length} /></Card></Col>
                        <Col xs={12} lg={6}><Card><Statistic title="Последний файл" value={drafts[0]?.positions_count || 0} suffix="стр." /></Card></Col>
                        <Col xs={12} lg={6}><Card><Statistic title="Профиль" value={activeConfig.additional_filters?.PROFILE_TEMPLATE === 'zzap' || activeConfig.additional_filters?.ZZAP ? 'ZZap' : 'Стандарт'} /></Card></Col>
                    </Row>

                    <Collapse
                        className="studio-sections"
                        defaultActiveKey={['settings', 'sources']}
                        items={[
                            {
                                key: 'settings',
                                label: 'Параметры формирования и отправки',
                                children: settingsPanel,
                            },
                            {
                                key: 'sources',
                                label: `Источники (${sources.length})`,
                                children: (
                                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                        <Card size="small" title="Подключить прайс поставщика">
                                            <Space wrap style={{ width: '100%' }}>
                                                <Select
                                                    showSearch
                                                    allowClear
                                                    value={sourceToAdd}
                                                    placeholder="Найдите поставщика или название прайса"
                                                    optionFilterProp="label"
                                                    style={{ width: 'min(520px, 100%)', minWidth: 240 }}
                                                    onChange={setSourceToAdd}
                                                    options={availableProviderOptions.map((item) => ({
                                                        value: item.id,
                                                        label: `${item.provider_name} · ${item.name_price || `конфигурация ${item.id}`}`,
                                                    }))}
                                                    notFoundContent={providerOptions.length
                                                        ? 'Все доступные прайсы уже подключены'
                                                        : 'Конфигурации прайсов поставщиков не найдены'}
                                                />
                                                <Button
                                                    type="primary"
                                                    icon={<PlusOutlined />}
                                                    disabled={!sourceToAdd}
                                                    loading={addingSource}
                                                    onClick={handleAddSource}
                                                >
                                                    Подключить источник
                                                </Button>
                                                <Button
                                                    icon={<ReloadOutlined />}
                                                    onClick={loadInitial}
                                                >
                                                    Обновить список прайсов
                                                </Button>
                                            </Space>
                                        </Card>
                                        <Table
                                            rowKey="id"
                                            loading={loading}
                                            columns={sourceColumns}
                                            dataSource={normalizedSources}
                                            pagination={false}
                                            locale={{
                                                emptyText: 'Источники пока не подключены. Выберите прайс выше.',
                                            }}
                                            scroll={{ x: 900 }}
                                        />
                                    </Space>
                                ),
                            },
                            {
                                key: 'rules',
                                label: `Правила публикации позиций (${rules.length})`,
                                extra: (
                                    <Space size={8}>
                                    <Button
                                        size="small"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openBulkModal();
                                        }}
                                    >
                                        Массово
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setImportFile(null);
                                            setImportReport(null);
                                            setImportOpen(true);
                                        }}
                                    >
                                        Импорт из Excel
                                    </Button>
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<PlusOutlined />}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            ruleForm.resetFields();
                                            setCandidateOptions([]);
                                            setCrossOptions([]);
                                            ruleForm.setFieldsValue({
                                                mode: 'only_cross',
                                                is_active: true,
                                                target_autopart_ids: [],
                                                fixed_price: null,
                                                price_mode: 'default',
                                                price_percent: 100,
                                                price_source_id: null,
                                                price_rounding_step: null,
                                                valid_range: null,
                                            });
                                            setRuleModalOpen(true);
                                        }}
                                    >
                                        Добавить правило
                                    </Button>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            showIcon
                                            type="info"
                                            message="Для замены предлагаются только подтверждённые двусторонние кроссы из номенклатуры. Остаток остаётся у исходной позиции, а цену можно оставить расчётной или указать вручную."
                                            style={{ marginBottom: 16 }}
                                        />
                                        <Card
                                            size="small"
                                            className="publication-rule-scope"
                                        >
                                            <div className="publication-rule-scope-control">
                                                <div>
                                                    <Text strong>
                                                        Если есть правила — публиковать только настроенные позиции
                                                    </Text>
                                                    <div className="muted-line">
                                                        По умолчанию правила изменяют только выбранные позиции. Включите режим, только если хотите публиковать исключительно позиции с отдельными правилами.
                                                    </div>
                                                </div>
                                                <Switch
                                                    checked={publicationOnlyConfigured === true}
                                                    onChange={(checked) =>
                                                        settingsForm.setFieldValue(
                                                            'publication_rules_only_configured',
                                                            checked
                                                        )
                                                    }
                                                    checkedChildren="Только по правилам"
                                                    unCheckedChildren="Правила дополняют прайс"
                                                />
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    icon={<SaveOutlined />}
                                                    loading={savingSettings}
                                                    onClick={handleSaveSettings}
                                                >
                                                    Сохранить режим
                                                </Button>
                                            </div>
                                        </Card>
                                        {(selectedRuleIds.length > 0 || ruleFiltersActive) && (
                                            <Space style={{ marginBottom: 12 }} wrap>
                                                <Popconfirm
                                                    title={`Удалить выбранные правила (${selectedRuleIds.length})?`}
                                                    description="Позиции вернутся к обычной публикации. Отменить удаление нельзя."
                                                    okText="Удалить"
                                                    okButtonProps={{ danger: true }}
                                                    onConfirm={() => handleBulkDeleteRules(selectedRuleIds)}
                                                    disabled={!selectedRuleIds.length}
                                                >
                                                    <Button danger size="small" loading={ruleDeleting} disabled={!selectedRuleIds.length}>
                                                        Удалить выбранные ({selectedRuleIds.length})
                                                    </Button>
                                                </Popconfirm>
                                                {ruleFiltersActive && (
                                                    <Popconfirm
                                                        title={`Удалить все правила по текущему фильтру (${(filteredRules || []).length})?`}
                                                        description="Удалятся правила на всех страницах, подходящие под фильтр. Отменить удаление нельзя."
                                                        okText="Удалить"
                                                        okButtonProps={{ danger: true }}
                                                        onConfirm={() => handleBulkDeleteRules((filteredRules || []).map((rule) => rule.id))}
                                                        disabled={!(filteredRules || []).length}
                                                    >
                                                        <Button danger size="small" loading={ruleDeleting} disabled={!(filteredRules || []).length}>
                                                            Удалить все по фильтру ({(filteredRules || []).length})
                                                        </Button>
                                                    </Popconfirm>
                                                )}
                                            </Space>
                                        )}
                                        <Table
                                            className="publication-rules-table"
                                            rowKey="id"
                                            columns={ruleColumns}
                                            dataSource={rules}
                                            rowSelection={{
                                                selectedRowKeys: selectedRuleIds,
                                                onChange: setSelectedRuleIds,
                                            }}
                                            onChange={(_, filters, __, extra) => {
                                                setFilteredRules(extra.currentDataSource);
                                                setRuleFiltersActive(
                                                    Object.values(filters).some((value) => value && value.length)
                                                );
                                            }}
                                            pagination={{ pageSize: 20 }}
                                            tableLayout="fixed"
                                            scroll={{ x: 1250 }}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'preview',
                                label: 'Проверка и история файлов',
                                children: (
                                    <>
                                        <div className="preview-toolbar">
                                            <div>
                                                <Title level={4}>Точный файл клиента</Title>
                                                <Text type="secondary">Черновик сохраняется до отправки и не меняется после подтверждения.</Text>
                                            </div>
                                            <Space>
                                                <Button icon={<ReloadOutlined />} onClick={reloadDrafts}>Обновить</Button>
                                                <Button
                                                    type="primary"
                                                    icon={<FileSearchOutlined />}
                                                    loading={buildingDraft}
                                                    onClick={handleBuildDraft}
                                                >
                                                    Сформировать черновик
                                                </Button>
                                            </Space>
                                        </div>
                                        <Table
                                            rowKey="id"
                                            columns={draftColumns}
                                            dataSource={drafts}
                                            loading={loading}
                                            pagination={{ pageSize: 10 }}
                                            rowClassName={(row) => row.id === selectedDraftId ? 'selected-draft-row' : ''}
                                            scroll={{ x: 1580 }}
                                        />
                                        {selectedDraft && (
                                            <Card className="draft-inspector" title={`Проверка версии №${selectedDraft.id}`}>
                                                <Row gutter={[14, 14]}>
                                                    <Col xs={12} md={6}><Statistic title="Исходных" value={selectedDraft.generation_summary?.base_positions || 0} /></Col>
                                                    <Col xs={12} md={6}><Statistic title="Кроссов" value={selectedDraft.generation_summary?.published_crosses || 0} /></Col>
                                                    <Col xs={12} md={6}><Statistic title="Ручных замен" value={selectedDraft.generation_summary?.manual_aliases || 0} /></Col>
                                                    <Col xs={12} md={6}><Statistic title="Итоговых строк" value={selectedDraft.positions_count || 0} /></Col>
                                                </Row>
                                                {selectedDraft.generation_summary?.quality_control?.enabled && (
                                                    <div className={`quality-panel quality-${selectedDraft.generation_summary.quality_control.status}`}>
                                                        <div className="quality-title">
                                                            <CheckCircleOutlined />
                                                            <strong>
                                                                {selectedDraft.generation_summary.quality_control.status === 'passed'
                                                                    ? 'Контроль качества пройден'
                                                                    : 'Контроль качества не пройден'}
                                                            </strong>
                                                        </div>
                                                        <div className="quality-checks">
                                                            {(selectedDraft.generation_summary.quality_control.checks || []).map((check) => (
                                                                <Tag
                                                                    key={check.key}
                                                                    color={
                                                                        check.status === 'passed'
                                                                            ? 'green'
                                                                            : check.status === 'warning'
                                                                                ? 'orange'
                                                                                : 'red'
                                                                    }
                                                                >
                                                                    {check.message}
                                                                </Tag>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {(selectedDraft.generation_summary?.publication_rule_warnings || []).length > 0 && (
                                                    <Alert
                                                        type="warning"
                                                        showIcon
                                                        message="Предупреждения правил публикации"
                                                        description={selectedDraft.generation_summary.publication_rule_warnings.join('; ')}
                                                        style={{ margin: '16px 0' }}
                                                    />
                                                )}
                                                {(selectedDraft.generation_summary?.source_freshness || [])
                                                    .some((item) => item.excluded_from_delivery) && (
                                                    <Alert
                                                        type="warning"
                                                        showIcon
                                                        message="Устаревшие источники исключены из этого файла"
                                                        description={(selectedDraft.generation_summary.source_freshness || [])
                                                            .filter((item) => item.excluded_from_delivery)
                                                            .map((item) => (
                                                                item.pending_review_filename
                                                                    ? `${item.source_name}: файл ${item.pending_review_filename} ожидает проверки`
                                                                    : `${item.source_name}: последний прайс ${item.pricelist_date || 'не загружался'}`
                                                            ))
                                                            .join('; ')}
                                                        style={{ margin: '16px 0' }}
                                                    />
                                                )}
                                                {selectedDraft.generation_summary?.final_filters?.enabled && (
                                                    <Card
                                                        size="small"
                                                        className="final-filter-summary"
                                                        title="Результат финальной фильтрации"
                                                        style={{ margin: '16px 0' }}
                                                    >
                                                        <Space wrap>
                                                            <Tag color="blue">
                                                                До фильтра: {selectedDraft.generation_summary.final_filters.input_count || 0}
                                                            </Tag>
                                                            <Tag color="green">
                                                                Осталось: {selectedDraft.generation_summary.final_filters.output_count || 0}
                                                            </Tag>
                                                            <Tag color="red">
                                                                Исключено: {selectedDraft.generation_summary.final_filters.excluded_count || 0}
                                                            </Tag>
                                                        </Space>
                                                        {(selectedDraft.generation_summary.final_filters.examples || []).length > 0 && (
                                                            <div className="final-filter-examples">
                                                                {(selectedDraft.generation_summary.final_filters.examples || []).map((item, index) => (
                                                                    <div key={`${item.source_autopart_id || item.oem}-${index}`}>
                                                                        <Text strong>{item.brand} {item.oem}</Text>
                                                                        <Text type="secondary">
                                                                            {item.rule_name ? ` · ${item.rule_name}` : ''} · {item.reason}
                                                                        </Text>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </Card>
                                                )}
                                                <div className="row-filters">
                                                    <Input.Search
                                                        allowClear
                                                        placeholder="Артикул, бренд или наименование"
                                                        onSearch={(value) => {
                                                            setDraftRowsPage(1);
                                                            setDraftSearch(value.trim());
                                                        }}
                                                    />
                                                    <Select
                                                        allowClear
                                                        placeholder="Все преобразования"
                                                        value={draftRowType}
                                                        onChange={(value) => {
                                                            setDraftRowsPage(1);
                                                            setDraftRowType(value);
                                                        }}
                                                        options={Object.entries(ROW_TYPE_META).map(([value, meta]) => ({ value, label: meta.label }))}
                                                    />
                                                </div>
                                                {(diagnosticLoading || positionDiagnostic) && draftSearch && (
                                                    <Card
                                                        size="small"
                                                        className="position-diagnostic"
                                                        loading={diagnosticLoading}
                                                        title={`Диагностика позиции «${draftSearch}»`}
                                                    >
                                                        {positionDiagnostic?.items?.length ? (
                                                            <div className="diagnostic-list">
                                                                {positionDiagnostic.items.map((item, index) => (
                                                                    <div
                                                                        className="diagnostic-item"
                                                                        key={`${item.autopart_id || item.oem}-${index}`}
                                                                    >
                                                                        <div>
                                                                            <Text strong>{item.brand} {item.oem}</Text>
                                                                            <div className="muted-line diagnostic-name">
                                                                                {item.name || 'Без наименования'}
                                                                            </div>
                                                                        </div>
                                                                        <Tag color={{ published: 'green', transformed: 'gold' }[item.status] || 'red'}>
                                                                            {{
                                                                                published: 'В файле',
                                                                                transformed: 'Преобразована',
                                                                            }[item.status] || 'Исключена'}
                                                                        </Tag>
                                                                        <Text>{item.quantity ?? '—'} шт.</Text>
                                                                        <Text>{item.price != null ? `${item.price} ₽` : '—'}</Text>
                                                                        <Text type="secondary">{item.reason || positionDiagnostic.message}</Text>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <Empty
                                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                                description={positionDiagnostic?.message || 'Проверяем источники'}
                                                            />
                                                        )}
                                                    </Card>
                                                )}
                                                <Table
                                                    rowKey="id"
                                                    columns={rowColumns}
                                                    rowClassName={(row) => (
                                                        row.publication_rule_id ? 'publication-rule-row' : ''
                                                    )}
                                                    dataSource={draftRows}
                                                    loading={rowsLoading}
                                                    pagination={{
                                                        current: draftRowsPage,
                                                        pageSize: draftRowsPageSize,
                                                        total: draftRowsTotal,
                                                        showSizeChanger: true,
                                                        showTotal: (total) => `Всего ${total.toLocaleString('ru-RU')}`,
                                                    }}
                                                    onChange={(pagination) => {
                                                        setDraftRowsPage(pagination.current || 1);
                                                        setDraftRowsPageSize(pagination.pageSize || 50);
                                                    }}
                                                    scroll={{ x: 940 }}
                                                />
                                            </Card>
                                        )}
                                    </>
                                ),
                            },
                        ]}
                    />
                </>
            )}

            <Modal
                title="Новая конфигурация прайс-листа"
                open={newConfigOpen}
                onCancel={() => {
                    setNewConfigOpen(false);
                    newConfigForm.resetFields();
                }}
                onOk={handleCreateConfig}
                okText="Создать конфигурацию"
                cancelText="Отмена"
                confirmLoading={creatingConfig}
            >
                <Form form={newConfigForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название конфигурации"
                        rules={[
                            { required: true, whitespace: true, message: 'Введите название' },
                        ]}
                    >
                        <Input placeholder="Например, Основной прайс" autoFocus />
                    </Form.Item>
                    <Alert
                        showIcon
                        type="info"
                        message="Будут установлены безопасные начальные настройки"
                        description="Коэффициенты — 1, формат — XLSX, допустимый возраст источников — 1 рабочий день. После создания подключите нужные прайсы поставщиков."
                    />
                </Form>
            </Modal>

            <Modal
                title={`Фильтры источника${sourceFilterTarget ? ` · ${sourceFilterTarget.provider_name}` : ''}`}
                open={sourceFilterOpen}
                onCancel={() => setSourceFilterOpen(false)}
                onOk={saveSourceFilters}
                okText="Сохранить фильтры"
                confirmLoading={sourceFilterSaving}
                width={880}
            >
                <Form form={sourceFilterForm} layout="vertical">
                    <Alert
                        showIcon
                        type="info"
                        message="Исключение удаляет DragonZap полностью. Режим «только для преобразования» скрывает исходную строку, но разрешает сформировать из неё оригинальное предложение."
                        style={{ marginBottom: 16 }}
                    />
                    <Form.Item name="dragonzap_mode" label="Как обрабатывать DragonZap в этом источнике">
                        <Select options={[
                            { value: 'normal', label: 'Публиковать как обычные позиции' },
                            { value: 'transform_only', label: 'Использовать только для преобразования' },
                            { value: 'exclude', label: 'Полностью исключить' },
                        ]} />
                    </Form.Item>
                    <Divider orientation="left">Общий фильтр брендов</Divider>
                    <Row gutter={[14, 0]}>
                        <Col xs={24} md={7}>
                            <Form.Item name="brand_filter_type" label="Режим">
                                <Select options={[
                                    { value: 'exclude', label: 'Исключить выбранные' },
                                    { value: 'include', label: 'Оставить только выбранные' },
                                ]} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={17}>
                            <Form.Item name="brand_filter_ids" label="Бренды">
                                <Select
                                    mode="multiple"
                                    showSearch
                                    optionFilterProp="label"
                                    options={brandOptions}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Divider orientation="left">Конкретные позиции источника</Divider>
                    <Alert
                        showIcon
                        type="info"
                        message="Поиск выполняется только в последнем активном прайсе этого источника. Выбранные позиции сохраняются по внутреннему ID и продолжат действовать после обновления файла."
                        style={{ marginBottom: 12 }}
                    />
                    <Row gutter={[14, 0]}>
                        <Col xs={24} md={7}>
                            <Form.Item name="position_filter_type" label="Режим">
                                <Select options={[
                                    { value: 'exclude', label: 'Исключить выбранные' },
                                    { value: 'include', label: 'Оставить только выбранные' },
                                ]} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={17}>
                            <Form.Item name="position_filter_ids" label="Позиции">
                                <Select
                                    mode="multiple"
                                    showSearch
                                    filterOption={false}
                                    onSearch={searchSourcePositions}
                                    loading={sourcePositionLoading}
                                    placeholder="Введите бренд, артикул или наименование"
                                    options={sourcePositionOptions.map((item) => ({
                                        value: item.autopart_id,
                                        label: `${candidateLabel(item)} · ${item.quantity ?? 0} шт. · ${item.price ?? '—'} ₽`,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Divider orientation="left">Общие ограничения источника</Divider>
                    <Row gutter={[14, 0]}>
                        <Col xs={12} md={6}><Form.Item name="min_price" label="Цена от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={12} md={6}><Form.Item name="max_price" label="Цена до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={12} md={6}><Form.Item name="min_quantity" label="Остаток от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={12} md={6}><Form.Item name="max_quantity" label="Остаток до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <Divider orientation="left">Отдельные правила для брендов</Divider>
                    <Form.List name="brand_rules">
                        {(fields, { add, remove }) => (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Card
                                        size="small"
                                        key={key}
                                        className="brand-filter-rule"
                                        extra={<Button danger type="text" icon={<StopOutlined />} onClick={() => remove(name)}>Удалить</Button>}
                                    >
                                        <Row gutter={[12, 0]}>
                                            <Col xs={24} md={14}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'brand_ids']}
                                                    label="Бренды"
                                                    rules={[{ required: true, message: 'Выберите хотя бы один бренд' }]}
                                                >
                                                    <Select mode="multiple" showSearch optionFilterProp="label" options={brandOptions} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={10}>
                                                <Form.Item {...restField} name={[name, 'action']} label="Действие" initialValue="include">
                                                    <Select options={[
                                                        { value: 'include', label: 'Оставить в указанных пределах' },
                                                        { value: 'exclude', label: 'Исключить в указанных пределах' },
                                                    ]} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={12} md={6}><Form.Item {...restField} name={[name, 'min_price']} label="Цена от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                            <Col xs={12} md={6}><Form.Item {...restField} name={[name, 'max_price']} label="Цена до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                            <Col xs={12} md={6}><Form.Item {...restField} name={[name, 'min_quantity']} label="Остаток от"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                            <Col xs={12} md={6}><Form.Item {...restField} name={[name, 'max_quantity']} label="Остаток до"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                        </Row>
                                    </Card>
                                ))}
                                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ action: 'include' })}>
                                    Добавить правило бренда
                                </Button>
                            </Space>
                        )}
                    </Form.List>
                </Form>
            </Modal>

            <Modal
                title="Правило публикации позиции"
                open={ruleModalOpen}
                onCancel={() => {
                    setRuleModalOpen(false);
                    ruleForm.resetFields();
                    setCandidateOptions([]);
                    setCrossOptions([]);
                }}
                onOk={handleSaveRule}
                okText="Сохранить правило"
                confirmLoading={ruleSaving}
                width={720}
            >
                <Form form={ruleForm} layout="vertical">
                    <Form.Item
                        name="source_autopart_id"
                        label="Исходная позиция из номенклатуры"
                        extra="Можно выбрать любую позицию из каталога, даже если сейчас её нет в собственном прайсе. Правило начнёт действовать, когда позиция появится в выбранных источниках."
                        rules={[{ required: true }]}
                    >
                        <Select
                            showSearch
                            filterOption={false}
                            onSearch={searchCandidates}
                            onChange={handleSourceCandidateChange}
                            loading={candidateLoading}
                            placeholder="Введите артикул, бренд или название"
                            options={candidateOptions.map((item) => ({
                                value: item.autopart_id,
                                label: item.in_current_price
                                    ? `${candidateLabel(item)} · ${item.quantity} шт. · ${item.price ?? '—'} ₽`
                                    : `${candidateLabel(item)} · нет в текущем собственном прайсе`,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item name="mode" label="Режим публикации" rules={[{ required: true }]}>
                        <Select
                            onChange={(value) => {
                                if (value === 'price_only' && ruleForm.getFieldValue('price_mode') === 'default') {
                                    ruleForm.setFieldsValue({ price_mode: 'percent', price_percent: 100 });
                                }
                            }}
                            options={[
                                {
                                    value: 'only_cross',
                                    label: 'Заменить позицию выбранными кроссами',
                                },
                                {
                                    value: 'add_cross',
                                    label: 'Оставить позицию и добавить выбранные кроссы',
                                },
                                {
                                    value: 'price_only',
                                    label: 'Оставить позицию как есть и изменить только цену',
                                },
                                { value: 'hide', label: 'Не публиковать позицию' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(previous, current) => previous.mode !== current.mode}>
                        {({ getFieldValue }) => getFieldValue('mode') !== 'hide' && (
                            <>
                                {getFieldValue('mode') !== 'price_only' && (
                                <Form.Item
                                    name="target_autopart_ids"
                                    label="Подтверждённые кроссы"
                                    extra="Каждый выбранный кросс попадёт в прайс отдельной строкой с остатком исходной позиции."
                                    rules={[{ required: true }]}
                                >
                                    <Select
                                        mode="multiple"
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder={crossOptions.length ? 'Выберите один или несколько кроссов' : 'У позиции нет подтверждённых кроссов'}
                                        options={crossOptions.map((item) => ({
                                            value: item.autopart_id,
                                            label: candidateLabel(item),
                                        }))}
                                    />
                                </Form.Item>
                                )}
                                <Form.Item
                                    name="price_mode"
                                    label="Цена замены"
                                    extra="Как считать цену выбранных кроссов в прайсе клиента."
                                >
                                    <Radio.Group buttonStyle="solid">
                                        {watchedRuleMode !== 'price_only' && (
                                            <Radio.Button value="default">По расчёту</Radio.Button>
                                        )}
                                        <Radio.Button value="fixed">Фиксированная цена</Radio.Button>
                                        <Radio.Button value="percent">% от цены в прайсе</Radio.Button>
                                    </Radio.Group>
                                </Form.Item>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(previous, current) => (
                                        previous.price_mode !== current.price_mode
                                        || previous.price_percent !== current.price_percent
                                        || previous.price_source_id !== current.price_source_id
                                    )}
                                >
                                    {({ getFieldValue }) => {
                                        const priceMode = getFieldValue('price_mode');
                                        if (priceMode === 'fixed') {
                                            return (
                                                <Form.Item
                                                    name="fixed_price"
                                                    label="Цена, ₽"
                                                    rules={[{ required: true, message: 'Укажите цену' }]}
                                                >
                                                    <InputNumber
                                                        min={0.01}
                                                        max={99999999.99}
                                                        precision={2}
                                                        decimalSeparator=","
                                                        style={{ width: '100%' }}
                                                        placeholder="Например, 1250,00"
                                                    />
                                                </Form.Item>
                                            );
                                        }
                                        if (priceMode === 'percent') {
                                            const percent = Number(getFieldValue('price_percent')) || 0;
                                            const delta = Math.round((percent - 100) * 100) / 100;
                                            const sourceId = getFieldValue('price_source_id');
                                            const sourceLabel = sourceId
                                                ? sourceOptions.find((item) => item.value === sourceId)?.label
                                                : null;
                                            return (
                                                <>
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={10}>
                                                            <Form.Item
                                                                name="price_percent"
                                                                label="Процент от цены, %"
                                                                rules={[{ required: true, message: 'Укажите процент' }]}
                                                            >
                                                                <InputNumber
                                                                    min={1}
                                                                    max={1000}
                                                                    precision={2}
                                                                    decimalSeparator=","
                                                                    addonAfter="%"
                                                                    style={{ width: '100%' }}
                                                                />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={14}>
                                                            <Form.Item
                                                                name="price_source_id"
                                                                label="Прайс, из которого берём цену"
                                                            >
                                                                <Select
                                                                    allowClear
                                                                    showSearch
                                                                    optionFilterProp="label"
                                                                    options={sourceOptions}
                                                                    placeholder="Итоговая цена позиции в прайсе"
                                                                />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Form.Item
                                                        name="price_rounding_step"
                                                        label="Округлять цену вверх до"
                                                        extra="Например, до 10 ₽: 1 045 ₽ станет 1 050 ₽. Так же округляет контроль цены."
                                                    >
                                                        <Select
                                                            allowClear
                                                            placeholder="Без округления"
                                                            options={[5, 10, 50, 100].map((step) => ({
                                                                value: step,
                                                                label: `до ${step} ₽`,
                                                            }))}
                                                        />
                                                    </Form.Item>
                                                    <Alert
                                                        type="info"
                                                        showIcon
                                                        style={{ marginBottom: 16 }}
                                                        message={
                                                            `Цена = ${sourceLabel ? `цена позиции в прайсе «${sourceLabel}»` : 'итоговая цена позиции'} × ${percent.toLocaleString('ru-RU')} %`
                                                            + (delta === 0 ? ' (без изменений)' : delta > 0 ? ` (на ${delta.toLocaleString('ru-RU')} % дороже)` : ` (на ${Math.abs(delta).toLocaleString('ru-RU')} % дешевле)`)
                                                        }
                                                        description="Цена берётся с учётом наценки этого источника. Если позиции нет в выбранном прайсе, используется итоговая цена, а в сводке генерации появится предупреждение."
                                                    />
                                                </>
                                            );
                                        }
                                        return null;
                                    }}
                                </Form.Item>
                                {rulePreview && (
                                    <Alert
                                        type={rulePreview.result_price == null ? 'warning' : 'success'}
                                        showIcon
                                        style={{ marginBottom: 16 }}
                                        message={
                                            rulePreview.result_price == null
                                                ? rulePreview.note
                                                : `Сейчас в прайсе ${formatRub(rulePreview.current_price)}, станет ${formatRub(rulePreview.result_price)}`
                                        }
                                        description={
                                            rulePreview.result_price == null
                                                ? undefined
                                                : (
                                                    <div>
                                                        {(rulePreview.source_prices || []).map((item) => (
                                                            <div key={item.source_id}>
                                                                {item.source_name}: {formatRub(item.price_with_markup)}
                                                            </div>
                                                        ))}
                                                        <div className="muted-line">{rulePreview.note}</div>
                                                    </div>
                                                )
                                        }
                                    />
                                )}
                            </>
                        )}
                    </Form.Item>
                    <Form.Item
                        name="valid_range"
                        label="Срок действия (необязательно)"
                        extra="Без дат правило действует всегда. Для акции укажите начало и конец: после конца цена и публикация вернутся к обычным."
                    >
                        <DatePicker.RangePicker
                            allowEmpty={[true, true]}
                            format="DD.MM.YYYY"
                            placeholder={['С даты', 'По дату']}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                    <Form.Item name="is_active" label="Правило активно" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Массовое правило публикации"
                open={bulkOpen}
                onCancel={() => setBulkOpen(false)}
                onOk={handleBulkSave}
                okText="Применить"
                confirmLoading={bulkSaving}
                width={680}
            >
                <Form form={bulkForm} layout="vertical">
                    <Form.Item name="scope" label="К чему применить" rules={[{ required: true }]}>
                        <Radio.Group buttonStyle="solid">
                            <Radio.Button value="brand">Весь бренд</Radio.Button>
                            <Radio.Button value="positions">Выбранные позиции</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    {bulkScope === 'brand' ? (
                        <Form.Item
                            name="brand_id"
                            label="Бренд"
                            extra="Правило создастся для позиций бренда, которые есть в свежих прайсах источников этой конфигурации."
                            rules={[{ required: true, message: 'Выберите бренд' }]}
                        >
                            <Select
                                showSearch
                                optionFilterProp="label"
                                options={brandOptions.map((brand) => ({ value: brand.id, label: brand.name }))}
                                placeholder="Выберите бренд"
                            />
                        </Form.Item>
                    ) : (
                        <Form.Item
                            name="autopart_ids"
                            label="Позиции"
                            rules={[{ required: true, message: 'Выберите позиции' }]}
                        >
                            <Select
                                mode="multiple"
                                showSearch
                                filterOption={false}
                                onSearch={searchBulkPositions}
                                placeholder="Введите артикул, бренд или название"
                                options={bulkPositionOptions.map((item) => ({
                                    value: item.autopart_id,
                                    label: candidateLabel(item),
                                }))}
                            />
                        </Form.Item>
                    )}
                    <Form.Item name="action" label="Действие" rules={[{ required: true }]}>
                        <Radio.Group buttonStyle="solid">
                            <Radio.Button value="price_only">Изменить цену</Radio.Button>
                            <Radio.Button value="hide">Не публиковать</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    {bulkAction === 'price_only' && (
                        <>
                            <Form.Item name="price_mode" label="Как задать цену">
                                <Radio.Group buttonStyle="solid">
                                    <Radio.Button value="percent">% от цены в прайсе</Radio.Button>
                                    <Radio.Button value="fixed">Фиксированная цена</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                            {bulkPriceMode === 'fixed' ? (
                                <Form.Item name="fixed_price" label="Цена, ₽" rules={[{ required: true, message: 'Укажите цену' }]}>
                                    <InputNumber min={0.01} precision={2} decimalSeparator="," style={{ width: '100%' }} />
                                </Form.Item>
                            ) : (
                                <Row gutter={12}>
                                    <Col xs={24} md={8}>
                                        <Form.Item name="price_percent" label="Процент, %" rules={[{ required: true, message: 'Укажите процент' }]}>
                                            <InputNumber min={1} max={1000} precision={2} decimalSeparator="," addonAfter="%" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={16}>
                                        <Form.Item name="price_source_id" label="Прайс, из которого берём цену">
                                            <Select allowClear showSearch optionFilterProp="label" options={sourceOptions} placeholder="Итоговая цена позиции в прайсе" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item name="price_rounding_step" label="Округлять цену вверх до">
                                            <Select
                                                allowClear
                                                placeholder="Без округления"
                                                options={[5, 10, 50, 100].map((step) => ({ value: step, label: `до ${step} ₽` }))}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            )}
                        </>
                    )}
                    <Form.Item name="valid_range" label="Срок действия (необязательно)">
                        <DatePicker.RangePicker allowEmpty={[true, true]} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="overwrite_cross_rules" valuePropName="checked">
                        <Checkbox>Заменить существующие правила с кроссами (по умолчанию они пропускаются)</Checkbox>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Импорт правил публикации из Excel"
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                onOk={handleImportRules}
                okText="Загрузить"
                okButtonProps={{ disabled: !importFile }}
                confirmLoading={importing}
                width={680}
            >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Alert
                        type="info"
                        showIcon
                        message="Колонки: Бренд, Артикул, Действие (скрыть / цена), Тип цены (фиксированная / процент), Значение, Прайс, Округление, Действует с, Действует по"
                        description="Обязательны первые три. Позиция должна быть в номенклатуре, прайс — подключён к этой конфигурации. Строки с ошибками пропускаются и перечисляются ниже."
                    />
                    <Button icon={<CloudDownloadOutlined />} onClick={handleDownloadTemplate}>
                        Скачать шаблон
                    </Button>
                    <Upload
                        accept=".xlsx"
                        maxCount={1}
                        beforeUpload={(file) => {
                            setImportFile(file);
                            setImportReport(null);
                            return false;
                        }}
                        onRemove={() => {
                            setImportFile(null);
                            setImportReport(null);
                        }}
                    >
                        <Button icon={<PlusOutlined />}>Выбрать файл .xlsx</Button>
                    </Upload>
                    <Checkbox checked={importOverwrite} onChange={(event) => setImportOverwrite(event.target.checked)}>
                        Заменить существующие правила с кроссами
                    </Checkbox>
                    {importReport && (
                        <Alert
                            type={importReport.errors?.length ? 'warning' : 'success'}
                            showIcon
                            message={`Создано: ${importReport.created}, обновлено: ${importReport.updated}, пропущено: ${importReport.skipped}, ошибок: ${importReport.errors?.length || 0}`}
                            description={importReport.errors?.length ? (
                                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                                    {importReport.errors.map((item) => (
                                        <div key={`${item.row}-${item.message}`}>Строка {item.row}: {item.message}</div>
                                    ))}
                                </div>
                            ) : undefined}
                        />
                    )}
                </Space>
            </Modal>
        </div>
    );
};

export default CustomerPricelistStudioPage;
