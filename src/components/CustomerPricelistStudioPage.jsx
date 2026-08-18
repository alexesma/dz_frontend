import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Collapse,
    Divider,
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
    FileSearchOutlined,
    PlusOutlined,
    ReloadOutlined,
    SaveOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons';
import {
    approveCustomerPricelistDraft,
    buildCustomerPricelistDraft,
    deleteCustomerPricelistPublicationRule,
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
    const [customers, setCustomers] = useState([]);
    const [configs, setConfigs] = useState([]);
    const [providerOptions, setProviderOptions] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [configId, setConfigId] = useState(null);
    const [sources, setSources] = useState([]);
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

    const activeConfig = useMemo(
        () => configs.find((item) => item.id === configId) || null,
        [configs, configId]
    );
    const selectedDraft = useMemo(
        () => drafts.find((item) => item.id === selectedDraftId) || null,
        [drafts, selectedDraftId]
    );

    const loadInitial = useCallback(async () => {
        try {
            const [customersResponse, providerResponse] = await Promise.all([
                getCustomersSummary({
                    page: 1,
                    page_size: 200,
                    sort_by: 'name',
                    sort_dir: 'asc',
                }),
                getProviderConfigOptions(),
            ]);
            setCustomers(customersResponse.data?.items || []);
            setProviderOptions(providerResponse.data || []);
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
        setConfigs([]);
        setSources([]);
        setRules([]);
        setDrafts([]);
        setSelectedDraftId(null);
        await loadCustomerConfigs(value);
    };

    const handleConfigChange = async (value) => {
        setConfigId(value);
        setDraftRowsPage(1);
        await loadWorkspace(customerId, value);
    };

    const handleSaveSettings = async () => {
        if (!customerId || !configId || !activeConfig) return;
        setSavingSettings(true);
        try {
            const values = await settingsForm.validateFields();
            const additionalFilters = {
                ...(activeConfig.additional_filters || {}),
                ZZAP: Boolean(values.zzap_enabled),
                ZZAP_BENCHMARK_PROVIDER_CONFIG_ID:
                    values.zzap_benchmark_provider_config_id || null,
                ZZAP_MIN_PRICE_MULTIPLIER:
                    values.zzap_min_price_multiplier ?? 1.2,
                ZZAP_ROUNDING_STEP: values.zzap_rounding_step ?? 10,
                ZZAP_LABEL_PRODUCTS: values.zzap_label_products !== false,
                REQUIRE_DRAFT_APPROVAL: Boolean(values.require_draft_approval),
                PUBLISH_CONFIRMED_DZ_CROSSES:
                    values.publish_confirmed_dz_crosses !== false,
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
                    schedule_days: values.schedule_days || [],
                    schedule_times: values.schedule_times || [],
                    additional_filters: additionalFilters,
                }
            );
            setConfigs((previous) => previous.map((item) => (
                item.id === configId ? data : item
            )));
            message.success('Настройки прайса сохранены');
        } catch (error) {
            message.error(getErrorText(error, 'Не удалось сохранить настройки'));
        } finally {
            setSavingSettings(false);
        }
    };

    const handleSourceChange = (sourceId, patch) => {
        setSources((previous) => previous.map((source) => (
            source.id === sourceId ? { ...source, ...patch } : source
        )));
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

    const normalizedSources = useMemo(() => sources.map((source) => ({
        ...source,
        dz_expand_brands: source.dz_expand_brands ?? Boolean(
            source.additional_filters?.DZ_EXPAND_BRANDS
        ),
    })), [sources]);

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
        ruleForm.setFieldValue('target_autopart_id', null);
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
                        label="Сворачивать дубли"
                        valuePropName="checked"
                    >
                        <Switch />
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
                <div>
                    <Text className="eyebrow">Специальный профиль</Text>
                    <Title level={4}>ZZap</Title>
                </div>
                <Form.Item name="zzap_enabled" label="Режим ZZap" valuePropName="checked">
                    <Switch />
                </Form.Item>
                <Row gutter={[18, 0]}>
                    <Col xs={24} lg={12}>
                        <Form.Item
                            name="zzap_benchmark_provider_config_id"
                            label="Контрольный прайс для ограничения цены"
                        >
                            <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                options={providerOptions.map((item) => ({
                                    value: item.id,
                                    label: `${item.provider_name} · ${item.name_price || `конфигурация ${item.id}`}`,
                                }))}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={12} lg={4}>
                        <Form.Item name="zzap_min_price_multiplier" label="Коэффициент">
                            <InputNumber min={1} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col xs={12} lg={4}>
                        <Form.Item name="zzap_rounding_step" label="Округление, ₽">
                            <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} lg={4}>
                        <Form.Item name="zzap_label_products" label="Метки в названии" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>
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
            title: '',
            width: 70,
            render: (_, row) => (
                <Button icon={<SaveOutlined />} onClick={() => handleSaveSource(row)} />
            ),
        },
    ];

    const ruleColumns = [
        {
            title: 'Фактическая позиция',
            key: 'source',
            render: (_, row) => (
                <div>
                    <Text strong>{row.source_brand} {row.source_oem}</Text>
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
            render: (_, row) => row.mode === 'hide' ? '—' : (
                <div>
                    <Text strong>{row.target_brand} {row.target_oem}</Text>
                    <div className="muted-line">{row.target_name || 'Без наименования'}</div>
                </div>
            ),
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
            width: 60,
            render: (_, row) => (
                <Popconfirm title="Удалить правило?" onConfirm={() => handleDeleteRule(row.id)}>
                    <Button danger type="text" icon={<StopOutlined />} />
                </Popconfirm>
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
                                <Button size="small" type="primary" icon={<SendOutlined />}>
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
                        <Col xs={12} lg={6}><Card><Statistic title="Профиль" value={activeConfig.additional_filters?.ZZAP ? 'ZZap' : 'Стандарт'} /></Card></Col>
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
                                    <Table
                                        rowKey="id"
                                        loading={loading}
                                        columns={sourceColumns}
                                        dataSource={normalizedSources}
                                        pagination={false}
                                        scroll={{ x: 820 }}
                                    />
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
                                            ruleForm.setFieldsValue({ mode: 'only_cross', is_active: true });
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
                                            message="Для замены предлагаются только подтверждённые двусторонние кроссы из номенклатуры. Цена и физический остаток остаются у исходной позиции."
                                            style={{ marginBottom: 16 }}
                                        />
                                        <Table
                                            rowKey="id"
                                            columns={ruleColumns}
                                            dataSource={rules}
                                            pagination={{ pageSize: 20 }}
                                            scroll={{ x: 900 }}
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
                                                {(selectedDraft.generation_summary?.publication_rule_warnings || []).length > 0 && (
                                                    <Alert
                                                        type="warning"
                                                        showIcon
                                                        message="Предупреждения правил публикации"
                                                        description={selectedDraft.generation_summary.publication_rule_warnings.join('; ')}
                                                        style={{ margin: '16px 0' }}
                                                    />
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
                title="Новое правило публикации"
                open={ruleModalOpen}
                onCancel={() => setRuleModalOpen(false)}
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
                            <Form.Item
                                name="target_autopart_id"
                                label="Подтверждённый кросс"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    showSearch
                                    optionFilterProp="label"
                                    placeholder={crossOptions.length ? 'Выберите кросс' : 'У позиции нет подтверждённых кроссов'}
                                    options={crossOptions.map((item) => ({
                                        value: item.autopart_id,
                                        label: candidateLabel(item),
                                    }))}
                                />
                            </Form.Item>
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
