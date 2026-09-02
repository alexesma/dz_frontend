import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Collapse,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Statistic,
    Switch,
    Table,
    Tag,
    Typography,
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
    createCustomerPricelistSource,
    deleteCustomerPricelistPublicationRule,
    deleteCustomerPricelistSource,
    diagnoseCustomerPricelistPosition,
    downloadCustomerPricelistDraft,
    getCustomerPricelistConfigs,
    getCustomerPricelistSources,
    getCustomersSummary,
    listCustomerPricelistDraftRows,
    listCustomerPricelistDrafts,
    listCustomerPricelistPublicationCrosses,
    listCustomerPricelistPublicationRules,
    rejectCustomerPricelistDraft,
    saveCustomerPricelistPublicationRule,
    searchCustomerPricelistPublicationCandidates,
    updateCustomerPricelistConfig,
    updateCustomerPricelistSource,
} from '../api/customers';
import { getBrands } from '../api/brands';
import { getEmailAccounts } from '../api/emailAccounts';
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
    rejected: { color: 'red', label: 'Отклонён' },
    send_failed: { color: 'volcano', label: 'Ошибка отправки' },
    generated: { color: 'blue', label: 'Сформирован' },
    generating: { color: 'processing', label: 'Формируется' },
};

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
    PUBLICATION_RULES_ONLY_CONFIGURED: true,
    REQUIRE_DRAFT_APPROVAL: true,
    PIPELINE_ORDER: DEFAULT_PIPELINE_ORDER,
};

const safeNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const getErrorText = (error, fallback) => (
    error?.response?.data?.detail || error?.message || fallback
);

const candidateLabel = (item) => (
    `${item.brand} ${item.oem}${item.name ? ` · ${item.name}` : ''}`
);

const CustomerPricelistStudioPage = () => {
    const [settingsForm] = Form.useForm();
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
    const [brandOptions, setBrandOptions] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [configId, setConfigId] = useState(null);
    const [sources, setSources] = useState([]);
    const [sourceToAdd, setSourceToAdd] = useState(null);
    const [addingSource, setAddingSource] = useState(false);
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
    const [buildingDraft, setBuildingDraft] = useState(false);
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [candidateOptions, setCandidateOptions] = useState([]);
    const [crossOptions, setCrossOptions] = useState([]);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [ruleSaving, setRuleSaving] = useState(false);
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
                getBrands(),
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
            const [sourceResponse, ruleResponse, draftResponse] = await Promise.all([
                getCustomerPricelistSources(nextCustomerId, nextConfigId),
                listCustomerPricelistPublicationRules(nextCustomerId, nextConfigId),
                listCustomerPricelistDrafts(nextCustomerId, nextConfigId),
            ]);
            setSources(sourceResponse.data || []);
            setRules(ruleResponse.data || []);
            const nextDrafts = draftResponse.data || [];
            setDrafts(nextDrafts);
            setSelectedDraftId(nextDrafts[0]?.id || null);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось загрузить управление прайсом'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!activeConfig) {
            settingsForm.resetFields();
            return;
        }
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
            outgoing_email_account_id:
                activeConfig.outgoing_email_account_id || null,
            schedule_days: activeConfig.schedule_days || [],
            schedule_times: activeConfig.schedule_times || [],
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
                extra.PUBLICATION_RULES_ONLY_CONFIGURED !== false,
        });
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
        setRules([]);
        setDrafts([]);
        setSelectedDraftId(null);
        await loadCustomerConfigs(value);
    };

    const handleConfigChange = async (value) => {
        setConfigId(value);
        setSourceToAdd(null);
        setDraftRowsPage(1);
        await loadWorkspace(customerId, value);
    };

    const handleSaveSettings = async () => {
        if (!customerId || !configId || !activeConfig) return;
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
                    values.publication_rules_only_configured !== false,
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
                    outgoing_email_account_id:
                        values.outgoing_email_account_id || null,
                    schedule_days: values.schedule_days || [],
                    schedule_times: values.schedule_times || [],
                    additional_filters: additionalFilters,
                }
            );
            setConfigs((previous) => previous.map((item) => (
                item.id === configId ? data : item
            )));
            const requestedAccountId = values.outgoing_email_account_id || null;
            const savedAccountId = data.outgoing_email_account_id || null;
            if (requestedAccountId !== savedAccountId) {
                throw new Error(
                    'Сервер не подтвердил сохранение почты отправителя. Обновите страницу и повторите.'
                );
            }
            const sender = outgoingEmailAccounts.find(
                (account) => account.id === savedAccountId
            );
            message.success(sender
                ? `Настройки сохранены. Отправитель: ${sender.email}`
                : 'Настройки сохранены. Используется почта отправителя по умолчанию');
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
        message.info('Шаблон ZZap заполнен. Выберите контрольные прайсы и сохраните настройки.');
    };

    const handlePipelineDrop = (targetStep) => {
        if (!draggedPipelineStep || draggedPipelineStep === targetStep) return;
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
    };

    const handleAddSource = async () => {
        if (!customerId || !configId || !sourceToAdd) return;
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
            setSources((previous) => [...previous, data]);
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
        try {
            await deleteCustomerPricelistSource(
                customerId,
                configId,
                source.id
            );
            setSources((previous) => previous.filter((item) => item.id !== source.id));
            message.success('Источник отключён от прайса клиента');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось удалить источник'));
        }
    };

    const handleSaveSource = async (source) => {
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
            setSources((previous) => previous.map((item) => (
                item.id === source.id
                    ? {
                        ...data,
                        dz_expand_brands: Boolean(
                            data.additional_filters?.DZ_EXPAND_BRANDS
                        ),
                    }
                    : item
            )));
            message.success(`Источник «${source.provider_config_name || source.provider_name}» сохранён`);
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить источник'));
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

    const handleSaveRule = async () => {
        setRuleSaving(true);
        try {
            const values = await ruleForm.validateFields();
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
            message.success('Правило публикации сохранено');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить правило'));
        } finally {
            setRuleSaving(false);
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
        <Form form={settingsForm} layout="vertical" className="pricelist-studio-form">
            <Form.Item name="profile_template" hidden><Input /></Form.Item>
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
                        <Form.Item name={name} label={label}>
                            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
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
                        name="outgoing_email_account_id"
                        label="Почта отправителя"
                        extra="Письмо будет отправлено именно с выбранного ящика."
                    >
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Использовать ящик по умолчанию"
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

            <Divider orientation="left">Совпадения и контроль</Divider>
            <Row gutter={[18, 0]}>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="duplicate_policy"
                        label="При совпадении Бренд + Артикул"
                        extra="Сначала выбирается минимальная цена. При равной цене — больший остаток, затем исходное оригинальное предложение вместо преобразованного DragonZap."
                    >
                        <Select options={[
                            {
                                value: 'cheapest_then_stock_then_original',
                                label: 'Оставлять самое дешёвое предложение',
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
                    min={0}
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
            width: 110,
            render: (_, row) => (
                <Space size={4}>
                    <Button
                        title="Сохранить источник"
                        icon={<SaveOutlined />}
                        onClick={() => handleSaveSource(row)}
                    />
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
            render: (value) => ({
                only_cross: <Tag color="green">Только выбранный кросс</Tag>,
                add_cross: <Tag color="blue">Добавить кросс</Tag>,
                hide: <Tag color="red">Не публиковать</Tag>,
            }[value] || value),
        },
        {
            title: 'Публиковать как',
            key: 'target',
            width: 390,
            render: (_, row) => row.mode === 'hide' ? '—' : (
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
            width: 130,
            align: 'right',
            render: (value, row) => {
                if (row.mode === 'hide') {
                    return <Text type="secondary">Не применяется</Text>;
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
            width: 150,
            render: (value) => {
                const meta = STATUS_META[value] || { color: 'default', label: value };
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
            title: 'Решение',
            key: 'decision',
            render: (_, row) => row.decision_reason || (
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
            render: (value) => {
                const meta = ROW_TYPE_META[value] || { color: 'default', label: value };
                return <Tag color={meta.color}>{meta.label}</Tag>;
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
                </div>
            </section>

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
                        defaultActiveKey={['settings', 'rules', 'preview']}
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
                                            });
                                            setRuleModalOpen(true);
                                        }}
                                    >
                                        Добавить правило
                                    </Button>
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
                                                        Включено по умолчанию. Позиции без отдельного правила не попадут в клиентский прайс. Правило «Не публиковать» исключит позицию полностью.
                                                    </div>
                                                </div>
                                                <Switch
                                                    checked={publicationOnlyConfigured !== false}
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
                                        <Table
                                            className="publication-rules-table"
                                            rowKey="id"
                                            columns={ruleColumns}
                                            dataSource={rules}
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
                                            scroll={{ x: 1120 }}
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
                        label="Фактическая позиция из собственного наличия"
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
                                label: `${candidateLabel(item)} · ${item.quantity} шт. · ${item.price ?? '—'} ₽`,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item name="mode" label="Режим публикации" rules={[{ required: true }]}>
                        <Select
                            options={[
                                { value: 'only_cross', label: 'Только выбранный кросс' },
                                { value: 'add_cross', label: 'Добавить выбранный кросс' },
                                { value: 'hide', label: 'Не публиковать позицию' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(previous, current) => previous.mode !== current.mode}>
                        {({ getFieldValue }) => getFieldValue('mode') !== 'hide' && (
                            <>
                                <Form.Item
                                    name="target_autopart_ids"
                                    label="Подтверждённые кроссы"
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
                                <Form.Item
                                    name="fixed_price"
                                    label="Фиксированная цена замены, ₽"
                                    extra="Оставьте пустым, чтобы использовать обычный расчёт цены источника и наценок."
                                >
                                    <InputNumber
                                        min={0.01}
                                        max={99999999.99}
                                        precision={2}
                                        decimalSeparator=","
                                        style={{ width: '100%' }}
                                        placeholder="Цена по обычному расчёту"
                                    />
                                </Form.Item>
                            </>
                        )}
                    </Form.Item>
                    <Form.Item name="is_active" label="Правило активно" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CustomerPricelistStudioPage;
