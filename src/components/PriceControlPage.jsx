import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    Divider,
    Form,
    Input,
    InputNumber,
    Select,
    Space,
    Table,
    Tag,
    message,
} from 'antd';
import {
    applyPriceControlRecommendations,
    applyPriceControlSourceRecommendations,
    createPriceControlConfig,
    getPriceControlSourceDiagnostics,
    listPriceControlConfigs,
    listPriceControlSiteApiKeys,
    listPriceControlRecommendations,
    listPriceControlRuns,
    listPriceControlSourceRecommendations,
    resetPriceControlHistory,
    runPriceControlNow,
    updatePriceControlConfig,
} from '../api/priceControl';
import {
    getCustomerPricelistConfigs,
    getCustomerPricelistSources,
    getCustomersSummary,
} from '../api/customers';
import { formatMoscow } from '../utils/time';

const DAY_OPTIONS = [
    { value: 'mon', label: 'Пн' },
    { value: 'tue', label: 'Вт' },
    { value: 'wed', label: 'Ср' },
    { value: 'thu', label: 'Чт' },
    { value: 'fri', label: 'Пт' },
    { value: 'sat', label: 'Сб' },
    { value: 'sun', label: 'Вс' },
];

const DEFAULT_SCHEDULE_TIMES = ['09:00'];

const hoursToDays = (hours) => {
    const value = Number(hours || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.ceil(value / 24);
};

const daysToHours = (days) => {
    const value = Number(days || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 24);
};

const formatNumber = (value, digits = 2) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return '-';
    return num.toFixed(digits);
};

const coefToClientMarkupPct = (value) => {
    const coef = Number(value);
    if (!Number.isFinite(coef) || coef <= 0) return null;
    return ((1 / coef) - 1) * 100;
};

const formatSignedPercent = (value, digits = 2) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(digits)}%`;
};

const rebalanceSources = (rows) => {
    const locked = rows.filter((row) => row.locked);
    const unlocked = rows.filter((row) => !row.locked);
    let lockedSum = locked.reduce(
        (sum, row) => sum + Number(row.weight_pct || 0),
        0
    );
    lockedSum = Math.min(Math.max(lockedSum, 0), 100);
    const remaining = Math.max(100 - lockedSum, 0);
    const per = unlocked.length ? remaining / unlocked.length : 0;
    const updated = rows.map((row) => {
        if (row.locked) {
            return { ...row, weight_pct: Number(row.weight_pct || 0) };
        }
        return { ...row, weight_pct: Number(per.toFixed(2)) };
    });
    const total = updated.reduce(
        (sum, row) => sum + Number(row.weight_pct || 0),
        0
    );
    const diff = Number((100 - total).toFixed(2));
    if (diff !== 0 && unlocked.length) {
        const idx = updated.findIndex((row) => !row.locked);
        if (idx >= 0) {
            updated[idx].weight_pct = Number(
                (updated[idx].weight_pct + diff).toFixed(2)
            );
        }
    }
    return updated;
};

const PriceControlPage = () => {
    const [form] = Form.useForm();
    const [customers, setCustomers] = useState([]);
    const [pricelistConfigs, setPricelistConfigs] = useState([]);
    const [pricelistSources, setPricelistSources] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [pricelistConfigId, setPricelistConfigId] = useState(null);
    const [siteApiKeyOptions, setSiteApiKeyOptions] = useState([]);
    const [siteApiKeyEnv, setSiteApiKeyEnv] = useState(null);
    const [configId, setConfigId] = useState(null);
    const [sources, setSources] = useState([]);
    const [runs, setRuns] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [sourceRecommendations, setSourceRecommendations] = useState([]);
    const [sourceDiagnostics, setSourceDiagnostics] = useState(null);
    const [selectedRecIds, setSelectedRecIds] = useState([]);
    const [selectedSourceRecIds, setSelectedSourceRecIds] = useState([]);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [clientMarkupCoef, setClientMarkupCoef] = useState(1);
    const [clientMarkupSampleSize, setClientMarkupSampleSize] = useState(0);
    const [clientMarkupRecentPct, setClientMarkupRecentPct] = useState([]);
    const [activeStateProfileId, setActiveStateProfileId] = useState(null);
    const [stateProfiles, setStateProfiles] = useState([]);

    const loadCustomers = useCallback(async () => {
        try {
            const { data } = await getCustomersSummary({
                page: 1,
                page_size: 200,
                sort_by: 'name',
                sort_dir: 'asc',
            });
            setCustomers(data.items || []);
        } catch {
            message.error('Не удалось загрузить клиентов');
        }
    }, []);

    const loadSiteApiKeys = useCallback(async () => {
        try {
            const { data } = await listPriceControlSiteApiKeys();
            const options = (data || []).map((item) => ({
                value: item.env_name,
                label: `${item.label} (${item.env_name})`,
            }));
            setSiteApiKeyOptions(options);
            setSiteApiKeyEnv((prev) => {
                if (prev) return prev;
                return options[0]?.value || null;
            });
        } catch {
            message.error('Не удалось загрузить ключи сайта');
        }
    }, []);

    const loadPricelistConfigs = useCallback(async (nextCustomerId) => {
        if (!nextCustomerId) return;
        try {
            const { data } = await getCustomerPricelistConfigs(nextCustomerId);
            setPricelistConfigs(data || []);
        } catch {
            message.error('Не удалось загрузить конфигурации прайса');
        }
    }, []);

    const mergeSources = useCallback((baseSources, configSources) => {
        const map = new Map();
        (configSources || []).forEach((source) => {
            map.set(source.provider_config_id, source);
        });
        const merged = (baseSources || []).map((source) => {
            const existing = map.get(source.provider_config_id);
            return {
                provider_config_id: source.provider_config_id,
                provider_id: source.provider_id,
                provider_name: source.provider_name,
                provider_config_name: source.provider_config_name,
                is_own_price: source.is_own_price,
                weight_pct: existing ? existing.weight_pct : 0,
                min_markup_pct: existing ? existing.min_markup_pct : 0,
                locked: existing ? existing.locked : false,
            };
        });
        return rebalanceSources(merged);
    }, []);

    const loadConfig = useCallback(
        async (nextCustomerId, nextPricelistConfigId) => {
            if (!nextCustomerId || !nextPricelistConfigId) return;
            setLoadingConfig(true);
            try {
                const [sourcesRes, configsRes] = await Promise.all([
                    getCustomerPricelistSources(
                        nextCustomerId,
                        nextPricelistConfigId
                    ),
                    listPriceControlConfigs({
                        customer_id: nextCustomerId,
                        pricelist_config_id: nextPricelistConfigId,
                    }),
                ]);
                const availableSources = sourcesRes.data || [];
                setPricelistSources(availableSources);
                const config = (configsRes.data || [])[0];
                if (config) {
                    setConfigId(config.id);
                    setClientMarkupCoef(Number(config.client_markup_coef ?? 1));
                    setClientMarkupSampleSize(
                        Number(config.client_markup_sample_size ?? 0)
                    );
                    setClientMarkupRecentPct(
                        Array.isArray(config.client_markup_recent_pct)
                            ? config.client_markup_recent_pct
                            : []
                    );
                    setActiveStateProfileId(
                        Number(config.active_state_profile_id ?? 0) || null
                    );
                    setStateProfiles(
                        Array.isArray(config.state_profiles)
                            ? config.state_profiles
                            : []
                    );
                    form.setFieldsValue({
                        is_active: config.is_active,
                        total_daily_count: config.total_daily_count,
                        schedule_days: config.schedule_days || [],
                        schedule_times:
                            config.schedule_times?.length
                                ? config.schedule_times
                                : DEFAULT_SCHEDULE_TIMES,
                        min_stock: config.min_stock,
                        max_delivery_days: config.max_delivery_days,
                        delta_pct: config.delta_pct,
                        target_cheapest_pct: config.target_cheapest_pct,
                        exclude_dragonzap_non_dz:
                            Boolean(config.exclude_dragonzap_non_dz),
                        record_site_history_for_dz:
                            Boolean(config.record_site_history_for_dz),
                        cooldown_days: hoursToDays(config.cooldown_hours),
                        our_offer_field: config.our_offer_field,
                        our_offer_match: config.our_offer_match,
                        own_cost_markup_default:
                            config.own_cost_markup_default,
                        brand_markups: Object.entries(
                            config.own_cost_markup_by_brand || {}
                        ).map(([brand, markup]) => ({
                            brand,
                            markup_pct: markup,
                        })),
                        manual_items: config.manual_items || [],
                    });
                    setSiteApiKeyEnv(
                        config.site_api_key_env || siteApiKeyOptions[0]?.value || null
                    );
                    setSources(
                        mergeSources(availableSources, config.sources || [])
                    );
                } else {
                    setConfigId(null);
                    setClientMarkupCoef(1);
                    setClientMarkupSampleSize(0);
                    setClientMarkupRecentPct([]);
                    setActiveStateProfileId(null);
                    setStateProfiles([]);
                    form.resetFields();
                    form.setFieldsValue({
                        is_active: true,
                        total_daily_count: 100,
                        schedule_days: [],
                        schedule_times: DEFAULT_SCHEDULE_TIMES,
                        delta_pct: 0.2,
                        target_cheapest_pct: 60,
                        exclude_dragonzap_non_dz: false,
                        record_site_history_for_dz: false,
                        cooldown_days: 0,
                        own_cost_markup_default: 20,
                        brand_markups: [],
                        manual_items: [],
                    });
                    setSiteApiKeyEnv(siteApiKeyOptions[0]?.value || null);
                    setSources(mergeSources(availableSources, []));
                }
            } catch {
                message.error('Не удалось загрузить настройки контроля цен');
            } finally {
                setLoadingConfig(false);
            }
        },
        [form, mergeSources, siteApiKeyOptions]
    );

    const loadRuns = useCallback(async (activeConfigId) => {
        if (!activeConfigId) {
            setRuns([]);
            setSelectedRunId(null);
            return;
        }
        setLoadingRuns(true);
        try {
            const { data } = await listPriceControlRuns(activeConfigId, {
                limit: 50,
            });
            setRuns(data || []);
            if (data && data.length) {
                setSelectedRunId(data[0].id);
            } else {
                setSelectedRunId(null);
            }
        } catch {
            message.error('Не удалось загрузить историю запусков');
        } finally {
            setLoadingRuns(false);
        }
    }, []);

    const loadRecommendations = useCallback(async (runId) => {
        if (!runId) {
            setRecommendations([]);
            setSourceRecommendations([]);
            setSourceDiagnostics(null);
            return;
        }
        setLoadingRecs(true);
        try {
            const [recRes, sourceRes, diagRes] = await Promise.all([
                listPriceControlRecommendations(runId),
                listPriceControlSourceRecommendations(runId),
                getPriceControlSourceDiagnostics(runId),
            ]);
            setRecommendations(recRes.data || []);
            setSourceRecommendations(sourceRes.data || []);
            setSourceDiagnostics(diagRes.data || null);
            setSelectedRecIds([]);
            setSelectedSourceRecIds([]);
        } catch {
            message.error('Не удалось загрузить рекомендации');
            setSourceDiagnostics(null);
        } finally {
            setLoadingRecs(false);
        }
    }, []);

    useEffect(() => {
        loadCustomers();
        loadSiteApiKeys();
    }, [loadCustomers, loadSiteApiKeys]);

    useEffect(() => {
        if (!customerId) return;
        loadPricelistConfigs(customerId);
    }, [customerId, loadPricelistConfigs]);

    useEffect(() => {
        if (!customerId || !pricelistConfigId) return;
        loadConfig(customerId, pricelistConfigId);
    }, [customerId, pricelistConfigId, loadConfig]);

    useEffect(() => {
        if (!configId) return;
        loadRuns(configId);
    }, [configId, loadRuns]);

    useEffect(() => {
        if (!selectedRunId) return;
        loadRecommendations(selectedRunId);
    }, [selectedRunId, loadRecommendations]);

    const handleCustomerChange = (value) => {
        setCustomerId(value);
        setPricelistConfigId(null);
        setConfigId(null);
        setPricelistConfigs([]);
        setSources([]);
        setRuns([]);
        setSelectedRunId(null);
        setRecommendations([]);
        setSourceRecommendations([]);
        setSourceDiagnostics(null);
        setStateProfiles([]);
        setActiveStateProfileId(null);
    };

    const handlePricelistConfigChange = (value) => {
        setPricelistConfigId(value);
        setConfigId(null);
        setRuns([]);
        setSelectedRunId(null);
        setRecommendations([]);
        setSourceRecommendations([]);
        setSourceDiagnostics(null);
        setStateProfiles([]);
        setActiveStateProfileId(null);
    };

    const handleSourceChange = (providerConfigId, patch) => {
        setSources((prev) => {
            const updated = prev.map((row) => {
                if (row.provider_config_id !== providerConfigId) return row;
                return { ...row, ...patch };
            });
            return rebalanceSources(updated);
        });
    };

    const handleSaveConfig = async () => {
        if (!customerId || !pricelistConfigId) {
            message.warning('Выберите клиента и конфигурацию прайса');
            return;
        }
        try {
            const values = await form.validateFields();
            const brandMarkup = {};
            (values.brand_markups || []).forEach((row) => {
                if (!row || !row.brand) return;
                const key = String(row.brand).trim().toUpperCase();
                if (!key) return;
                const value = Number(row.markup_pct);
                if (Number.isNaN(value)) return;
                brandMarkup[key] = value;
            });
            const payload = {
                customer_id: customerId,
                pricelist_config_id: pricelistConfigId,
                is_active: values.is_active ?? true,
                total_daily_count: values.total_daily_count ?? 100,
                schedule_days: values.schedule_days || [],
                schedule_times:
                    values.schedule_times?.length
                        ? values.schedule_times
                        : DEFAULT_SCHEDULE_TIMES,
                min_stock: values.min_stock ?? null,
                max_delivery_days: values.max_delivery_days ?? null,
                delta_pct: values.delta_pct ?? 0,
                target_cheapest_pct: values.target_cheapest_pct ?? 60,
                site_api_key_env: siteApiKeyEnv || null,
                exclude_dragonzap_non_dz:
                    values.exclude_dragonzap_non_dz ?? false,
                record_site_history_for_dz:
                    values.record_site_history_for_dz ?? false,
                cooldown_hours: daysToHours(values.cooldown_days),
                our_offer_field: values.our_offer_field || null,
                our_offer_match: values.our_offer_match || null,
                own_cost_markup_default: values.own_cost_markup_default ?? 20,
                own_cost_markup_by_brand: brandMarkup,
                sources: sources.map((source) => ({
                    provider_config_id: source.provider_config_id,
                    weight_pct: Number(source.weight_pct || 0),
                    min_markup_pct: Number(source.min_markup_pct || 0),
                    locked: Boolean(source.locked),
                })),
                manual_items: (values.manual_items || []).filter(
                    (item) => item && item.oem && item.brand
                ),
            };
            let response;
            if (configId) {
                const updatePayload = { ...payload };
                delete updatePayload.customer_id;
                delete updatePayload.pricelist_config_id;
                response = await updatePriceControlConfig(
                    configId,
                    updatePayload
                );
                message.success('Настройки обновлены');
            } else {
                response = await createPriceControlConfig(payload);
                message.success('Настройки сохранены');
            }
            const savedConfig = response?.data;
            if (savedConfig?.id) {
                setConfigId(savedConfig.id);
                setSiteApiKeyEnv(
                    savedConfig.site_api_key_env
                    || siteApiKeyOptions[0]?.value
                    || null
                );
                setClientMarkupCoef(
                    Number(savedConfig.client_markup_coef ?? 1)
                );
                setClientMarkupSampleSize(
                    Number(savedConfig.client_markup_sample_size ?? 0)
                );
                setClientMarkupRecentPct(
                    Array.isArray(savedConfig.client_markup_recent_pct)
                        ? savedConfig.client_markup_recent_pct
                        : []
                );
                setActiveStateProfileId(
                    Number(savedConfig.active_state_profile_id ?? 0) || null
                );
                setStateProfiles(
                    Array.isArray(savedConfig.state_profiles)
                        ? savedConfig.state_profiles
                        : []
                );
                setSources(
                    mergeSources(pricelistSources, savedConfig.sources || [])
                );
                form.setFieldsValue({
                    brand_markups: Object.entries(
                        savedConfig.own_cost_markup_by_brand || {}
                    ).map(([brand, markup]) => ({
                        brand,
                        markup_pct: markup,
                    })),
                });
            }
        } catch {
            message.error('Не удалось сохранить настройки');
        }
    };

    const handleRunNow = async () => {
        if (!configId) {
            message.warning('Сначала сохраните настройки');
            return;
        }
        setRunningNow(true);
        try {
            const { data } = await runPriceControlNow(configId);
            message.success('Проверка запущена');
            if (data?.id) {
                setSelectedRunId(data.id);
            }
            await loadRuns(configId);
        } catch {
            message.error('Не удалось запустить проверку');
        } finally {
            setRunningNow(false);
        }
    };

    const handleResetHistory = async () => {
        if (!configId) return;
        const confirmed = window.confirm(
            'Сбросить историю паузы и коэффициента? После этого снова будут доступны все позиции для проверки.'
        );
        if (!confirmed) return;
        try {
            const { data } = await resetPriceControlHistory(configId);
            setClientMarkupCoef(Number(data?.client_markup_coef ?? 1));
            setClientMarkupSampleSize(
                Number(data?.client_markup_sample_size ?? 0)
            );
            setClientMarkupRecentPct(
                Array.isArray(data?.client_markup_recent_pct)
                    ? data.client_markup_recent_pct
                    : []
            );
            setActiveStateProfileId(
                Number(data?.active_state_profile_id ?? 0) || null
            );
            setStateProfiles(
                Array.isArray(data?.state_profiles)
                    ? data.state_profiles
                    : []
            );
            if (data?.cooldown_hours !== undefined) {
                form.setFieldValue(
                    'cooldown_days',
                    hoursToDays(data.cooldown_hours)
                );
            }
            message.success('История сброшена');
        } catch {
            message.error('Не удалось сбросить историю');
        }
    };

    const handleApplyRecommendations = async () => {
        if (!selectedRunId || !selectedRecIds.length) return;
        try {
            await applyPriceControlRecommendations(selectedRunId, {
                recommendation_ids: selectedRecIds,
            });
            message.success('Рекомендации применены');
            setSelectedRecIds([]);
        } catch {
            message.error('Не удалось применить рекомендации');
        }
    };

    const handleApplySourceRecommendations = async () => {
        if (!selectedRunId || !selectedSourceRecIds.length) return;
        try {
            await applyPriceControlSourceRecommendations(selectedRunId, {
                source_recommendation_ids: selectedSourceRecIds,
            });
            message.success('Наценки применены');
            setSelectedSourceRecIds([]);
        } catch {
            message.error('Не удалось применить наценки');
        }
    };

    const runOptions = useMemo(() => {
        return runs.map((run) => ({
            value: run.id,
            label: `${run.id} • ${formatMoscow(run.run_at)}`,
        }));
    }, [runs]);

    const recommendationColumns = [
        { title: 'OEM', dataIndex: 'oem', key: 'oem', width: 140 },
        { title: 'Бренд', dataIndex: 'brand', key: 'brand', width: 120 },
        { title: 'Наименование', dataIndex: 'name', key: 'name' },
        {
            title: 'Рекомендуемая цена',
            dataIndex: 'target_price',
            key: 'target_price',
            render: (value) => (
                <strong>{formatNumber(value)}</strong>
            ),
        },
        {
            title: 'Наша цена в прайсе',
            dataIndex: 'our_price',
            key: 'our_price',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Наценка клиента, %',
            key: 'effective_client_coef',
            render: (_, record) => {
                const coef = Number(record.effective_client_coef);
                if (!Number.isFinite(coef) || coef <= 0) {
                    return '-';
                }
                // coef = our_price / own_site_price, so client markup to our price is inverse
                const clientMarkupPct = ((1 / coef) - 1) * 100;
                const sign = clientMarkupPct > 0 ? '+' : '';
                return `${sign}${formatNumber(clientMarkupPct)}%`;
            },
        },
        {
            title: 'Примерная цена закупа',
            dataIndex: 'cost_price',
            key: 'cost_price',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Примерная маржа, %',
            key: 'approx_margin_pct',
            render: (_, record) => {
                const target = Number(record.target_price);
                const cost = Number(record.cost_price);
                if (!Number.isFinite(target) || !Number.isFinite(cost) || cost <= 0) {
                    return '-';
                }
                const margin = ((target / cost) - 1) * 100;
                const sign = margin > 0 ? '+' : '';
                return `${sign}${formatNumber(margin)}`;
            },
        },
        {
            title: 'Лучшая цена на сайте',
            dataIndex: 'competitor_price',
            key: 'competitor_price',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Остаток',
            dataIndex: 'competitor_qty',
            key: 'competitor_qty',
            render: (value) => (value ?? '-'),
        },
        {
            title: 'Срок',
            key: 'delivery',
            render: (_, record) => {
                if (
                    record.competitor_min_delivery === null &&
                    record.competitor_max_delivery === null
                ) {
                    return '-';
                }
                if (record.competitor_min_delivery === record.competitor_max_delivery) {
                    return record.competitor_min_delivery;
                }
                return `${record.competitor_min_delivery ?? '-'}-${record.competitor_max_delivery ?? '-'}`;
            },
        },
        {
            title: 'Статус',
            key: 'status',
            render: (_, record) => {
                if (record.missing_in_pricelist) {
                    return <Tag color="default">Нет в прайсе</Tag>;
                }
                if (record.missing_competitor) {
                    return <Tag color="default">Нет конкурентов</Tag>;
                }
                if (
                    (record.below_cost || record.below_min_markup)
                    && Number(record.our_price) > Number(record.competitor_price)
                ) {
                    return <Tag color="orange">Внимание!!!</Tag>;
                }
                if (record.suggested_action === 'lower') {
                    return <Tag color="red">Снизить</Tag>;
                }
                if (record.suggested_action === 'raise') {
                    return <Tag color="blue">Поднять</Tag>;
                }
                return <Tag color="green">Ок</Tag>;
            },
        },
    ];

    const sourceColumns = [
        { title: 'Поставщик', dataIndex: 'provider_name', key: 'provider' },
        {
            title: 'Конфиг',
            dataIndex: 'provider_config_name',
            key: 'provider_config_name',
        },
        {
            title: 'Текущая наценка %',
            dataIndex: 'current_markup_pct',
            key: 'current_markup_pct',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Рекоменд. наценка %',
            dataIndex: 'suggested_markup_pct',
            key: 'suggested_markup_pct',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Покрытие %',
            dataIndex: 'coverage_pct',
            key: 'coverage_pct',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Выборка',
            dataIndex: 'sample_size',
            key: 'sample_size',
        },
        { title: 'Комментарий', dataIndex: 'note', key: 'note' },
    ];

    const diagnosticsColumns = [
        { title: 'Поставщик', dataIndex: 'provider_name', key: 'provider_name' },
        {
            title: 'Конфиг',
            dataIndex: 'provider_config_name',
            key: 'provider_config_name',
        },
        {
            title: 'План',
            dataIndex: 'expected_count',
            key: 'expected_count',
        },
        {
            title: 'Проверено',
            dataIndex: 'checked_count',
            key: 'checked_count',
        },
        {
            title: 'С конкурентом',
            dataIndex: 'with_competitor_count',
            key: 'with_competitor_count',
        },
        {
            title: 'Покрытие %',
            dataIndex: 'coverage_pct',
            key: 'coverage_pct',
            render: (value) => formatNumber(value),
        },
        {
            title: 'Нет конкурента',
            dataIndex: 'missing_competitor_count',
            key: 'missing_competitor_count',
        },
        {
            title: 'Ниже мин.наценки',
            dataIndex: 'below_min_markup_count',
            key: 'below_min_markup_count',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_, record) => (
                `↓ ${record.lower_count || 0} / ↑ ${record.raise_count || 0}`
            ),
        },
        {
            title: 'Комментарий',
            dataIndex: 'note',
            key: 'note',
            render: (value) => value || '-',
        },
    ];

    const stateProfileColumns = [
        {
            title: 'Активный',
            key: 'active',
            render: (_, record) => (
                Number(record.id) === Number(activeStateProfileId)
                    ? <Tag color="green">Да</Tag>
                    : '-'
            ),
        },
        {
            title: 'Ключ сайта',
            dataIndex: 'site_api_key_env',
            key: 'site_api_key_env',
            render: (value) => value || '-',
        },
        {
            title: 'Поле/значение',
            key: 'offer_match',
            render: (_, record) => (
                `${record.our_offer_field || '-'} / ${record.our_offer_match || '-'}`
            ),
        },
        {
            title: 'Наценка клиента, %',
            dataIndex: 'client_markup_coef',
            key: 'client_markup_coef',
            render: (value) => formatSignedPercent(coefToClientMarkupPct(value)),
        },
        {
            title: 'Выборка',
            dataIndex: 'client_markup_sample_size',
            key: 'client_markup_sample_size',
            render: (value) => value ?? 0,
        },
        {
            title: 'Последние 10, %',
            dataIndex: 'client_markup_recent_pct',
            key: 'client_markup_recent_pct',
            render: (value) => (
                Array.isArray(value) && value.length
                    ? value.map((item) => formatNumber(item)).join(', ')
                    : '-'
            ),
        },
        {
            title: 'Пауза (дни)',
            dataIndex: 'cooldown_hours',
            key: 'cooldown_hours',
            render: (value) => hoursToDays(value),
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card title="Контроль цен">
                <Space size="middle" wrap>
                    <Select
                        placeholder="Клиент"
                        style={{ minWidth: 260 }}
                        value={customerId}
                        onChange={handleCustomerChange}
                        options={customers.map((customer) => ({
                            value: customer.id,
                            label: customer.name,
                        }))}
                    />
                    <Select
                        placeholder="Конфигурация прайса"
                        style={{ minWidth: 260 }}
                        value={pricelistConfigId}
                        onChange={handlePricelistConfigChange}
                        options={pricelistConfigs.map((config) => ({
                            value: config.id,
                            label: config.name,
                        }))}
                        disabled={!customerId}
                    />
                    <Select
                        placeholder="Ключ сайта (API_CONTROL_KEY_FOR_...)"
                        style={{ minWidth: 360 }}
                        value={siteApiKeyEnv}
                        onChange={setSiteApiKeyEnv}
                        options={siteApiKeyOptions}
                        allowClear
                        disabled={!customerId}
                    />
                </Space>

                <Divider />
                <div style={{ marginBottom: 12, color: '#595959' }}>
                    Адаптивная наценка клиента: {formatSignedPercent(coefToClientMarkupPct(clientMarkupCoef))}
                    {' '}| Выборка: {clientMarkupSampleSize}
                    {' '}| Последние 10 наценок, %:{' '}
                    {clientMarkupRecentPct.length
                        ? clientMarkupRecentPct
                            .map((value) => formatSignedPercent(value))
                            .join(', ')
                        : '-'}
                </div>
                <div style={{ marginBottom: 12, color: '#8c8c8c' }}>
                    Пример ключа сайта: `API_CONTROL_KEY_FOR_FROZA`. Для нового клиента выберите нужный ключ сверху и сохраните настройки.
                </div>
                <Table
                    rowKey="id"
                    dataSource={stateProfiles}
                    columns={stateProfileColumns}
                    size="small"
                    pagination={false}
                    style={{ marginBottom: 16 }}
                    locale={{ emptyText: 'Профили коэффициентов появятся после первого расчета' }}
                />

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        is_active: true,
                        total_daily_count: 100,
                        schedule_days: [],
                        schedule_times: DEFAULT_SCHEDULE_TIMES,
                        delta_pct: 0.2,
                        target_cheapest_pct: 60,
                        exclude_dragonzap_non_dz: false,
                        record_site_history_for_dz: false,
                        cooldown_days: 0,
                        own_cost_markup_default: 20,
                        manual_items: [],
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 16,
                        }}
                    >
                        <Form.Item name="is_active" valuePropName="checked">
                            <Checkbox>Активно</Checkbox>
                        </Form.Item>
                        <Form.Item
                            name="total_daily_count"
                            label="Позиций в день"
                            tooltip="Сколько позиций брать за один запуск. Пример: 100"
                        >
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="delta_pct"
                            label="Дельта %"
                            tooltip="Насколько дешевле конкурента"
                        >
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="target_cheapest_pct"
                            label="Цель быть дешевле %"
                            tooltip="Целевой процент позиций, где мы должны быть не дороже конкурента. Пример: 60"
                        >
                            <InputNumber min={0} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="min_stock" label="Мин. остаток">
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="max_delivery_days" label="Макс. срок (дн.)">
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="cooldown_days"
                            label="Пауза повторной проверки (дни)"
                            tooltip="Автовыбор не берет позицию повторно в течение N дней. Позиции из списка вручную проверяются всегда."
                        >
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="exclude_dragonzap_non_dz"
                            valuePropName="checked"
                            tooltip="Если включено, позиции бренда DRAGONZAP без префикса DZ (например SMD188435) не участвуют в контроле."
                        >
                            <Checkbox>
                                Исключать DRAGONZAP без DZ (пример: DZSMD188435 - учитывается, SMD188435 - нет)
                            </Checkbox>
                        </Form.Item>
                        <Form.Item
                            name="record_site_history_for_dz"
                            valuePropName="checked"
                            tooltip="Если включено, по позициям DRAGONZAP (которые ищутся на сайте по оригинальному бренду) будет сохраняться лучшая цена сайта в Историю цен под поставщиком «Сайт Dragonzap»."
                        >
                            <Checkbox>
                                Фиксировать цену сайта в истории для DRAGONZAP
                            </Checkbox>
                        </Form.Item>
                    </div>

                    <Divider>Расписание</Divider>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 16,
                        }}
                    >
                        <Form.Item name="schedule_days" label="Дни недели">
                            <Select
                                mode="multiple"
                                allowClear
                                options={DAY_OPTIONS}
                            />
                        </Form.Item>
                        <Form.Item name="schedule_times" label="Время">
                            <Select
                                mode="tags"
                                tokenSeparators={[',']}
                                placeholder="Например 09:00"
                            />
                        </Form.Item>
                    </div>

                    <Divider>Наше предложение</Divider>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 16,
                        }}
                    >
                        <Form.Item
                            name="our_offer_field"
                            label="Поле в ответе"
                            tooltip="По этому полю определяется наше предложение на сайте. Пример: sup_logo"
                        >
                            <Input placeholder="Пример: sup_logo" />
                        </Form.Item>
                        <Form.Item
                            name="our_offer_match"
                            label="Значение"
                            tooltip="Значение поля нашего предложения. Пример: SP8356"
                        >
                            <Input placeholder="Пример: SP8356" />
                        </Form.Item>
                    </div>

                    <Divider>Себестоимость (наш прайс)</Divider>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 16,
                        }}
                    >
                        <Form.Item
                            name="own_cost_markup_default"
                            label="Наценка по умолчанию %"
                        >
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                        </Form.Item>
                    </div>
                    <Form.Item
                        label="Наценка по брендам"
                        extra="Укажите бренд и наценку в процентах"
                    >
                        <Form.List name="brand_markups">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map(({ key, name }) => (
                                        <Space
                                            key={key}
                                            align="baseline"
                                            style={{ marginBottom: 8 }}
                                        >
                                            <Form.Item
                                                name={[name, 'brand']}
                                                rules={[
                                                    {
                                                        required: true,
                                                        message: 'Бренд',
                                                    },
                                                ]}
                                            >
                                                <Input placeholder="Бренд" />
                                            </Form.Item>
                                            <Form.Item
                                                name={[name, 'markup_pct']}
                                                rules={[
                                                    {
                                                        required: true,
                                                        message: 'Наценка %',
                                                    },
                                                ]}
                                            >
                                                <InputNumber
                                                    min={0}
                                                    step={0.1}
                                                    style={{ width: 140 }}
                                                />
                                            </Form.Item>
                                            <Button
                                                danger
                                                onClick={() => remove(name)}
                                            >
                                                Удалить
                                            </Button>
                                        </Space>
                                    ))}
                                    <Button onClick={() => add()} type="dashed">
                                        Добавить бренд
                                    </Button>
                                </>
                            )}
                        </Form.List>
                    </Form.Item>

                    <Divider>Ручные позиции</Divider>

                    <Form.List name="manual_items">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name }) => (
                                    <Space key={key} align="baseline" style={{ marginBottom: 8 }}>
                                        <Form.Item
                                            name={[name, 'oem']}
                                            rules={[{ required: true, message: 'OEM' }]}
                                        >
                                            <Input placeholder="OEM" />
                                        </Form.Item>
                                        <Form.Item
                                            name={[name, 'brand']}
                                            rules={[{ required: true, message: 'Бренд' }]}
                                        >
                                            <Input placeholder="Бренд" />
                                        </Form.Item>
                                        <Button danger onClick={() => remove(name)}>Удалить</Button>
                                    </Space>
                                ))}
                                <Button onClick={() => add()} type="dashed">
                                    Добавить позицию
                                </Button>
                            </>
                        )}
                    </Form.List>

                    <Divider>Источники</Divider>

                    <Table
                        rowKey="provider_config_id"
                        dataSource={sources}
                        pagination={false}
                        loading={loadingConfig}
                        columns={[
                            {
                                title: 'Поставщик',
                                dataIndex: 'provider_name',
                                key: 'provider_name',
                            },
                            {
                                title: 'Конфиг',
                                dataIndex: 'provider_config_name',
                                key: 'provider_config_name',
                            },
                            {
                                title: 'Вес %',
                                key: 'weight_pct',
                                render: (_, record) => (
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={record.weight_pct}
                                        disabled={!record.locked}
                                        onChange={(value) =>
                                            handleSourceChange(record.provider_config_id, {
                                                weight_pct: value,
                                            })
                                        }
                                    />
                                ),
                            },
                            {
                                title: 'Мин. наценка %',
                                key: 'min_markup_pct',
                                render: (_, record) => (
                                    <InputNumber
                                        min={0}
                                        max={200}
                                        step={1}
                                        value={record.min_markup_pct}
                                        onChange={(value) =>
                                            handleSourceChange(record.provider_config_id, {
                                                min_markup_pct: value,
                                            })
                                        }
                                    />
                                ),
                            },
                            {
                                title: 'Фиксировать вес',
                                key: 'locked',
                                render: (_, record) => (
                                    <Checkbox
                                        checked={record.locked}
                                        onChange={(event) =>
                                            handleSourceChange(record.provider_config_id, {
                                                locked: event.target.checked,
                                            })
                                        }
                                    />
                                ),
                            },
                        ]}
                    />

                    <Space style={{ marginTop: 16 }}>
                        <Button type="primary" onClick={handleSaveConfig}>
                            Сохранить
                        </Button>
                        <Button onClick={handleResetHistory} disabled={!configId}>
                            Сбросить историю
                        </Button>
                        <Button
                            onClick={handleRunNow}
                            disabled={!configId}
                            loading={runningNow}
                        >
                            Запустить сейчас
                        </Button>
                    </Space>
                </Form>
            </Card>

            <Card
                title="Результаты проверки"
                loading={loadingRuns}
                extra={
                    <Space>
                        <Select
                            placeholder="Запуск"
                            style={{ minWidth: 220 }}
                            value={selectedRunId}
                            onChange={setSelectedRunId}
                            options={runOptions}
                        />
                        <Button
                            onClick={handleRunNow}
                            disabled={!configId}
                            loading={runningNow}
                        >
                            Запустить сейчас
                        </Button>
                    </Space>
                }
            >
                <Divider>Рекомендации по позициям</Divider>
                <Space style={{ marginBottom: 12 }}>
                    <Button
                        type="primary"
                        disabled={!selectedRecIds.length}
                        onClick={handleApplyRecommendations}
                    >
                        Применить цены
                    </Button>
                </Space>
                <Table
                    rowKey="id"
                    dataSource={recommendations}
                    columns={recommendationColumns}
                    loading={loadingRecs}
                    rowSelection={{
                        selectedRowKeys: selectedRecIds,
                        onChange: setSelectedRecIds,
                    }}
                    rowClassName={(record) => {
                        if (record.below_cost) return 'price-control-row-below-cost';
                        if (record.below_min_markup) return 'price-control-row-below-min';
                        if (record.is_cheapest) return 'price-control-row-best';
                        return '';
                    }}
                    pagination={{ pageSize: 50 }}
                />

                <Divider>Рекомендации по наценкам</Divider>
                <Space style={{ marginBottom: 12 }}>
                    <Button
                        type="primary"
                        disabled={!selectedSourceRecIds.length}
                        onClick={handleApplySourceRecommendations}
                    >
                        Применить наценки
                    </Button>
                </Space>
                <Table
                    rowKey="id"
                    dataSource={sourceRecommendations}
                    columns={sourceColumns}
                    loading={loadingRecs}
                    rowSelection={{
                        selectedRowKeys: selectedSourceRecIds,
                        onChange: setSelectedSourceRecIds,
                    }}
                    pagination={{ pageSize: 20 }}
                />

                <Divider>Диагностика по источникам</Divider>
                <div style={{ marginBottom: 12, color: '#595959' }}>
                    Всего в запуске: {sourceDiagnostics?.total_items ?? 0}
                    {' '}| Ручные: {sourceDiagnostics?.manual_items ?? 0}
                    {' '}| Авто: {sourceDiagnostics?.auto_items ?? 0}
                </div>
                <Table
                    rowKey="provider_config_id"
                    dataSource={sourceDiagnostics?.sources || []}
                    columns={diagnosticsColumns}
                    loading={loadingRecs}
                    pagination={{ pageSize: 20 }}
                />
            </Card>
        </Space>
    );
};

export default PriceControlPage;
