// src/components/ProviderPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Card,
    Form,
    Input,
    Button,
    message,
    Spin,
    Divider,
    Space,
    Select,
    InputNumber,
    Typography,
    Table,
    Tag,
    Modal,
    Popconfirm,
    Upload,
    Switch,
} from "antd";
import {
    SaveOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ArrowLeftOutlined,
    UploadOutlined,
    CloudDownloadOutlined,
} from "@ant-design/icons";

import {
    getProviderFullById,
    createProvider,
    updateProvider,
    deleteProviderApi,
    createProviderConfig,
    updateProviderConfig,
    deleteProviderConfig,
    createAbbreviation,
    updateAbbreviation,
    deleteAbbreviation,
    downloadProviderPricelist,
    uploadProviderPricelist,
    parseProviderExcludePositions,
} from "../api/providers";
import { getEmailAccounts } from "../api/emailAccounts";
import { getPriceStaleAlerts } from "../api/settings";
import { formatMoscow } from '../utils/time';
import ProviderPricelistAnalyticsSection from "./ProviderPricelistAnalyticsSection";

const { Title, Text } = Typography;
const providerPriceTypeOptions = [
    { value: "Wholesale", label: "Цена с НДС" },
    { value: "Retail", label: "Цена без НДС" },
    { value: "Cash", label: "Цена за наличные" },
];
const deliveryMethodOptions = [
    { value: "Delivered", label: "Привозят" },
    { value: "Self pickup", label: "Забираем сами" },
    { value: "Courier foot", label: "Курьер пеший" },
    { value: "Courier car", label: "Курьер авто" },
];

const ProviderPage = () => {
    const { providerId: providerIdParam } = useParams();
    const navigate = useNavigate();

    const isNew = !providerIdParam || providerIdParam.toLowerCase() === "create";
    const providerId = !isNew ? Number(providerIdParam) : null;

    const [loading, setLoading] = useState(!isNew);
    const [downloading, setDownloading] = useState({});

    const [saving, setSaving] = useState(false);
    const [providerData, setProviderData] = useState(null);
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [staleAlerts, setStaleAlerts] = useState([]);
    const [priceInEmailAccounts, setPriceInEmailAccounts] = useState([]);
    const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);

    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);

    const [abbrModalVisible, setAbbrModalVisible] = useState(false);
    const [editingAbbr, setEditingAbbr] = useState(null);

    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadingForConfigId, setUploadingForConfigId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [uploadForm] = Form.useForm();
    const [configNumberingFromOne, setConfigNumberingFromOne] = useState(true);
    const [uploadNumberingFromOne, setUploadNumberingFromOne] = useState(true);
    const [excludeUploading, setExcludeUploading] = useState(false);

    const [providerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [abbrForm] = Form.useForm();

    const refreshAnalytics = () => {
        setAnalyticsRefreshKey((prev) => prev + 1);
    };

    const refreshProviderData = async () => {
        if (!providerId) return null;
        const { data } = await getProviderFullById(providerId);
        setProviderData(data);
        refreshAnalytics();
        return data;
    };

    const dayOptions = [
        { label: 'Пн', value: 'mon' },
        { label: 'Вт', value: 'tue' },
        { label: 'Ср', value: 'wed' },
        { label: 'Чт', value: 'thu' },
        { label: 'Пт', value: 'fri' },
        { label: 'Сб', value: 'sat' },
        { label: 'Вс', value: 'sun' },
    ];
    const timeOptions = Array.from({ length: 24 }, (_, i) => {
        const hour = String(i).padStart(2, '0');
        return { label: `${hour}:00`, value: `${hour}:00` };
    });

    const adjustForDisplay = (value, useFromOne) => {
        if (value === null || value === undefined || value === "") return value;
        const num = Number(value);
        if (Number.isNaN(num)) return value;
        return useFromOne ? num + 1 : num;
    };

    const adjustForPayload = (value, useFromOne) => {
        if (value === null || value === undefined || value === "") return value;
        const num = Number(value);
        if (Number.isNaN(num)) return value;
        return useFromOne ? Math.max(num - 1, 0) : num;
    };

    const normalizeExcludeItem = (item) => {
        const brand = String(item?.brand ?? "").trim();
        const oem = String(item?.oem ?? "").trim();
        return { brand, oem };
    };

    const mergeExcludeItems = (currentItems, newItems) => {
        const map = new Map();
        [...currentItems, ...newItems].forEach((item) => {
            const normalized = normalizeExcludeItem(item);
            if (!normalized.brand || !normalized.oem) return;
            const key = `${normalized.brand.toUpperCase()}|${normalized.oem.toUpperCase()}`;
            if (!map.has(key)) {
                map.set(key, normalized);
            }
        });
        return Array.from(map.values());
    };

    const handleExcludeUpload = async (file) => {
        if (!file) return;
        setExcludeUploading(true);
        try {
            const { data } = await parseProviderExcludePositions(file);
            const existing = configForm.getFieldValue("exclude_positions") || [];
            const merged = mergeExcludeItems(existing, data?.items || []);
            configForm.setFieldsValue({ exclude_positions: merged });
            message.success("Список исключений обновлен");
        } catch (err) {
            message.error(err?.response?.data?.detail || "Ошибка загрузки файла исключений");
        } finally {
            setExcludeUploading(false);
        }
    };

    // --- загрузка данных при редактировании ---
    useEffect(() => {
        if (isNew) {
            // режим создания — чистая форма
            providerForm.resetFields();
            providerForm.setFieldsValue({
                type_prices: "Wholesale",
                default_delivery_method: "Delivered",
                is_own_price: false,
                order_schedule_enabled: false,
                order_schedule_days: [],
                order_schedule_times: [],
                supplier_response_allow_shipping_docs: true,
                supplier_response_allow_response_files: true,
                supplier_response_allow_text_status: true,
                supplier_response_start_row: 1,
                supplier_response_filename_pattern: "",
                supplier_shipping_doc_filename_pattern: "",
                supplier_response_oem_col: null,
                supplier_response_brand_col: null,
                supplier_response_qty_col: null,
                supplier_response_price_col: null,
                supplier_response_comment_col: null,
                supplier_response_status_col: null,
            });
            setProviderData(null);
            setLoading(false);
            return;
        }

        // защита от кривого урла /providers/undefined/edit или /providers/abc/edit
        if (!providerId || Number.isNaN(providerId)) {
            message.error("Некорректный идентификатор поставщика");
            navigate("/providers");
            return;
        }

        (async () => {
            setLoading(true);
            try {
                const { data } = await getProviderFullById(providerId);
                setProviderData(data);
                providerForm.setFieldsValue({
                    name: data.provider.name,
                    email_contact: data.provider.email_contact,
                    email_incoming_price: data.provider.email_incoming_price,
                    type_prices: data.provider.type_prices,
                    description: data.provider.description,
                    comment: data.provider.comment,
                    is_virtual: data.provider.is_virtual,
                    is_own_price: data.provider.is_own_price,
                    default_delivery_method:
                        data.provider.default_delivery_method || "Delivered",
                    order_schedule_days: data.provider.order_schedule_days || [],
                    order_schedule_times: data.provider.order_schedule_times || [],
                    order_schedule_enabled: data.provider.order_schedule_enabled || false,
                    supplier_response_allow_shipping_docs:
                        data.provider.supplier_response_allow_shipping_docs
                        ?? true,
                    supplier_response_allow_response_files:
                        data.provider.supplier_response_allow_response_files
                        ?? true,
                    supplier_response_allow_text_status:
                        data.provider.supplier_response_allow_text_status
                        ?? true,
                    supplier_response_start_row:
                        data.provider.supplier_response_start_row || 1,
                    supplier_response_filename_pattern:
                        data.provider.supplier_response_filename_pattern || "",
                    supplier_shipping_doc_filename_pattern:
                        data.provider.supplier_shipping_doc_filename_pattern
                        || "",
                    supplier_response_oem_col:
                        data.provider.supplier_response_oem_col,
                    supplier_response_brand_col:
                        data.provider.supplier_response_brand_col,
                    supplier_response_qty_col:
                        data.provider.supplier_response_qty_col,
                    supplier_response_price_col:
                        data.provider.supplier_response_price_col,
                    supplier_response_comment_col:
                        data.provider.supplier_response_comment_col,
                    supplier_response_status_col:
                        data.provider.supplier_response_status_col,
                });
            } catch (err) {
                message.error(err?.message || "Ошибка загрузки поставщика");
                navigate("/providers");
            } finally {
                setLoading(false);
            }
        })();
    }, [isNew, providerId, providerForm, navigate]);

    useEffect(() => {
        if (!providerId || isNew) return;
        (async () => {
            setAlertsLoading(true);
            try {
                const { data } = await getPriceStaleAlerts({
                    provider_id: providerId,
                    limit: 50,
                });
                setStaleAlerts(data || []);
            } catch {
                setStaleAlerts([]);
            } finally {
                setAlertsLoading(false);
            }
        })();
    }, [providerId, isNew]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await getEmailAccounts();
                const priceInAccounts = (data || []).filter(
                    (account) =>
                        account.is_active
                        && (account.purposes || []).includes("prices_in")
                );
                setPriceInEmailAccounts(priceInAccounts);
            } catch {
                setPriceInEmailAccounts([]);
            }
        })();
    }, []);


    const handleProviderSubmit = async (values) => {
        setSaving(true);
        try {
            if (isNew) {
                const { data } = await createProvider(values);
                message.success("Поставщик успешно создан");
                // после создания переходим на страницу редактирования созданного поставщика
                navigate(`/providers/${data.id}/edit`);
            } else {
                await updateProvider(providerId, values);
                message.success("Данные поставщика обновлены");
                await refreshProviderData();
            }
        } catch (err) {
            console.error(err);
            message.error("Ошибка сохранения поставщика");
        } finally {
            setSaving(false);
        }
    };

    // --- удалить поставщика ---
    const handleDeleteProvider = async () => {
        if (!providerId) return;

        try {
            await deleteProviderApi(providerId);
            message.success('Поставщик удалён');
            navigate('/providers');
        } catch (err) {
            message.error(err?.message || 'Ошибка удаления поставщика');
        }
    };

    // --- конфиги ---
    const openConfigModal = (config = null) => {
        setEditingConfig(config);
        if (config) {
            setConfigNumberingFromOne(true);
            configForm.setFieldsValue({
                ...config,
                exclude_positions: config.exclude_positions || [],
                max_days_without_update: config.max_days_without_update ?? 3,
                is_active: config.is_active ?? true,
                start_row: adjustForDisplay(config.start_row, true),
                oem_col: adjustForDisplay(config.oem_col, true),
                brand_col: adjustForDisplay(config.brand_col, true),
                name_col: adjustForDisplay(config.name_col, true),
                multiplicity_col: adjustForDisplay(
                    config.multiplicity_col,
                    true
                ),
                qty_col: adjustForDisplay(config.qty_col, true),
                price_col: adjustForDisplay(config.price_col, true),
            });
        } else {
            configForm.resetFields();
            setConfigNumberingFromOne(true);
            configForm.setFieldsValue({
                exclude_positions: [],
                max_days_without_update: 3,
                is_active: true,
            });
        }
        setConfigModalVisible(true);
    };

    const handleConfigSubmit = async (values) => {
        if (!providerId) return;

        setConfigSaving(true);
        try {
            const cleanedExcludePositions = (values.exclude_positions || [])
                .map(normalizeExcludeItem)
                .filter((item) => item.brand && item.oem);
            const payload = {
                ...values,
                exclude_positions: cleanedExcludePositions,
                start_row: adjustForPayload(values.start_row, configNumberingFromOne),
                oem_col: adjustForPayload(values.oem_col, configNumberingFromOne),
                brand_col: adjustForPayload(values.brand_col, configNumberingFromOne),
                name_col: adjustForPayload(values.name_col, configNumberingFromOne),
                multiplicity_col: adjustForPayload(
                    values.multiplicity_col,
                    configNumberingFromOne
                ),
                qty_col: adjustForPayload(values.qty_col, configNumberingFromOne),
                price_col: adjustForPayload(values.price_col, configNumberingFromOne),
            };
            if (editingConfig) {
                await updateProviderConfig(providerId, editingConfig.id, payload);
                message.success("Конфигурация обновлена");
            } else {
                await createProviderConfig(providerId, payload);
                message.success("Конфигурация создана");
            }
            setConfigModalVisible(false);
            setEditingConfig(null);
            configForm.resetFields();

            // обновляем данные
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            const detail = err?.response?.data?.detail;
            message.error(detail || "Ошибка сохранения конфигурации");
        } finally {
            setConfigSaving(false);
        }
    };

    const getPriceInMailboxLabel = (accountId) => {
        if (!accountId) return "По умолчанию (.env)";
        const account = priceInEmailAccounts.find((item) => item.id === accountId);
        if (!account) return `ID ${accountId}`;
        return `${account.name} (${account.email})`;
    };

    const handleDeleteConfig = async (configId) => {
        if (!providerId) return;

        try {
            await deleteProviderConfig(providerId, configId);
            message.success("Конфигурация удалена");

            // обновляем данные
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error("Ошибка удаления конфигурации");
        }
    };

    const handleToggleConfigActive = async (configId, checked) => {
        if (!providerId) return;
        try {
            await updateProviderConfig(providerId, configId, {
                is_active: checked,
            });
            message.success(
                checked
                    ? "Конфигурация включена"
                    : "Конфигурация отключена"
            );
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error("Не удалось обновить статус конфигурации");
        }
    };

    // ===== Handlers: Abbreviations =====
    const openAbbrModal = (abbr = null) => {
        setEditingAbbr(abbr);
        if (abbr) {
            abbrForm.setFieldsValue({ abbreviation: abbr.abbreviation });
        } else {
            abbrForm.resetFields();
        }
        setAbbrModalVisible(true);
    };

    const handleAbbrSubmit = async (values) => {
        if (!providerId) return;

        try {
            if (editingAbbr) {
                await updateAbbreviation(
                    providerId,
                    editingAbbr.id,
                    values.abbreviation
                );
                message.success("Аббревиатура обновлена");
            } else {
                await createAbbreviation(providerId, values.abbreviation);
                message.success("Аббревиатура добавлена");
            }
            setAbbrModalVisible(false);
            setEditingAbbr(null);
            abbrForm.resetFields();

            // обновляем данные
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error("Ошибка сохранения аббревиатуры");
        }
    };

    const handleDeleteAbbr = async (abbrId) => {
        if (!providerId) return;

        try {
            await new Promise((resolve, reject) => {
                Modal.confirm({
                    title: "Удалить аббревиатуру?",
                    content: "Это действие необратимо.",
                    okText: "Удалить",
                    cancelText: "Отмена",
                    onOk: resolve,
                    onCancel: () => reject(new Error("cancel")),
                });
            });
            await deleteAbbreviation(providerId, abbrId);
            message.success("Аббревиатура удалена");

            // обновляем данные
            await refreshProviderData();
        } catch (err) {
            if (err?.message === "cancel") return;
            console.error(err);
            message.error("Ошибка удаления аббревиатуры");
        }
    };

    // --------- Загрузка прайс-листа по конфигу ----------
    const handleDownloadPricelist = async (configId) => {
        if (!providerId) return;

        setDownloading(prev => ({ ...prev, [configId]: true }));

        try {
            const { data: downloadData } = await downloadProviderPricelist(providerId, configId);
            if (downloadData?.stats) {
                const stats = downloadData.stats;
                message.success(
                    `Прайс-лист загружен из email. ` +
                    `Строк: ${stats.rows_total}, ` +
                    `после очистки: ${stats.rows_clean}, ` +
                    `после дедупликации: ${stats.rows_deduplicated}`
                );
            } else {
                message.success("Прайс-лист успешно загружен из email и обработан");
            }

            // обновляем данные после загрузки
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(err?.response?.data?.detail || "Ошибка загрузки прайс-листа из email");
        } finally {
            setDownloading(prev => ({ ...prev, [configId]: false }));
        }
    };

    // ===== Upload pricelist from local file =====
    const openUploadModal = (configId) => {
        const config = providerData.pricelist_configs.find(c => c.id === configId);
        setUploadingForConfigId(configId);
        setUploadNumberingFromOne(true);

        // Предзаполняем форму данными из конфигурации
        uploadForm.setFieldsValue({
            use_stored_params: true,
            start_row: adjustForDisplay(config?.start_row ?? 0, true),
            oem_col: adjustForDisplay(config?.oem_col ?? 0, true),
            brand_col: adjustForDisplay(config?.brand_col, true),
            name_col: adjustForDisplay(config?.name_col, true),
            multiplicity_col: adjustForDisplay(
                config?.multiplicity_col,
                true
            ),
            qty_col: adjustForDisplay(config?.qty_col ?? 0, true),
            price_col: adjustForDisplay(config?.price_col ?? 0, true),
        });

        setUploadModalVisible(true);
    };

    const handleUploadPricelist = async () => {
        if (!providerId || !uploadingForConfigId) return;

        try {
            const values = await uploadForm.validateFields();

            const fileList = values.file?.fileList || [];
            if (!fileList.length) {
                message.error("Выберите файл прайс-листа");
                return;
            }
            const fileObj = fileList[0].originFileObj;

            setUploading(true);
            const { data: uploadData } = await uploadProviderPricelist(providerId, uploadingForConfigId, {
                file: fileObj,
                use_stored_params: values.use_stored_params ?? true,
                start_row: adjustForPayload(values.start_row, uploadNumberingFromOne),
                oem_col: adjustForPayload(values.oem_col, uploadNumberingFromOne),
                brand_col: adjustForPayload(values.brand_col, uploadNumberingFromOne),
                name_col: adjustForPayload(values.name_col, uploadNumberingFromOne),
                multiplicity_col: adjustForPayload(
                    values.multiplicity_col,
                    uploadNumberingFromOne
                ),
                qty_col: adjustForPayload(values.qty_col, uploadNumberingFromOne),
                price_col: adjustForPayload(values.price_col, uploadNumberingFromOne),
            });

            if (uploadData?.stats) {
                const stats = uploadData.stats;
                message.success(
                    `Прайс-лист загружен. ` +
                    `Строк: ${stats.rows_total}, ` +
                    `после очистки: ${stats.rows_clean}, ` +
                    `после дедупликации: ${stats.rows_deduplicated}`
                );
            } else {
                message.success("Прайс-лист успешно загружен и обработан");
            }
            setUploadModalVisible(false);
            setUploadingForConfigId(null);
            uploadForm.resetFields();

            // обновляем данные после загрузки
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(err?.response?.data?.detail || "Ошибка загрузки прайс-листа");
        } finally {
            setUploading(false);
        }
    };

    // ===== Table columns for configs =====
    const configColumns = [
        {
            title: "Название прайса",
            dataIndex: "name_price",
            key: "name_price",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "Название письма",
            dataIndex: "name_mail",
            key: "name_mail",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "Почтовый ящик",
            dataIndex: "incoming_email_account_id",
            key: "incoming_email_account_id",
            render: (value) => getPriceInMailboxLabel(value),
        },
        {
            title: "URL файла",
            dataIndex: "file_url",
            key: "file_url",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "Строка начала",
            dataIndex: "start_row",
            key: "start_row",
        },
        {
            title: "Колонки",
            key: "columns",
            render: (_, record) => (
                <div>
                    <div>OEM: {record.oem_col}</div>
                    <div>Кол-во: {record.qty_col}</div>
                    <div>Цена: {record.price_col}</div>
                    {record.multiplicity_col !== null
                        && record.multiplicity_col !== undefined && (
                        <div>Кратность: {record.multiplicity_col}</div>
                    )}
                    {record.name_col !== null && record.name_col !== undefined && (
                        <div>Название: {record.name_col}</div>
                    )}
                    {record.brand_col !== null && record.brand_col !== undefined && (
                        <div>Бренд: {record.brand_col}</div>
                    )}
                </div>
            ),
        },
        {
            title: "Доставка (дни)",
            key: "delivery",
            render: (_, record) => (
                <span>
                    {record.min_delivery_day ?? 1} - {record.max_delivery_day ?? 3}
                </span>
            ),
        },
        {
            title: "Активна",
            dataIndex: "is_active",
            key: "is_active",
            render: (isActive, record) => (
                <Switch
                    checked={Boolean(isActive)}
                    onChange={(checked) =>
                        handleToggleConfigActive(record.id, checked)
                    }
                    checkedChildren="Вкл"
                    unCheckedChildren="Выкл"
                />
            ),
        },
        {
            title: "Последний прайс",
            key: "latest_pricelist",
            render: (_, record) => {
                if (!record.latest_pricelist) {
                    return <Tag color="default">Нет прайсов</Tag>;
                }
                return (
                    <div>
                        <Tag color={record.latest_pricelist.is_active ? "green" : "orange"}>
                            ID: {record.latest_pricelist.id}
                        </Tag>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                            {record.latest_pricelist.date}
                        </div>
                    </div>
                );
            },
        },
        {
            title: "Действия",
            key: "actions",
            width: 220,
            render: (_, record) => (
                <Space size="small" wrap className="table-actions">
                    <Button
                        icon={<UploadOutlined />}
                        size="small"
                        onClick={() => openUploadModal(record.id)}
                    >
                        Загрузить файл
                    </Button>
                    <Button
                        type="default"
                        size="small"
                        icon={<CloudDownloadOutlined />}
                        loading={downloading[record.id]}
                        onClick={() => handleDownloadPricelist(record.id)}
                        title="Скачать прайс-лист из email"
                    />
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openConfigModal(record)}
                    />
                    <Popconfirm
                        title="Удалить конфигурацию?"
                        description="Удалить конфигурацию и связанные прайс-листы? Действие необратимо"
                        onConfirm={() => handleDeleteConfig(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button type="primary" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="page-shell">
            <div className="page-header-actions">
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/providers')}>
                    Назад к списку
                </Button>

                {!isNew && (
                    <Popconfirm
                        title="Удалить поставщика?"
                        description="Это действие необратимо"
                        onConfirm={handleDeleteProvider}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button danger>Удалить поставщика</Button>
                    </Popconfirm>
                )}
            </div>

            <Title level={2}>
                {isNew
                    ? "Создание поставщика"
                    : `Поставщик: ${providerData?.provider?.name ?? "..."}`}
            </Title>

            {/* Форма поставщика */}
            <Card title="Основная информация" style={{ marginBottom: 20 }}>
                <Form
                    form={providerForm}
                    layout="vertical"
                    onFinish={handleProviderSubmit}
                    onFinishFailed={({ errorFields }) => {
                        message.error('Не отправлено: проверьте обязательные поля');
                        if (errorFields?.length) {
                            Modal.error({
                                title: 'Ошибки формы',
                                content: (
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {errorFields.map((field) => (
                                            <li key={field.name.join('.')}>
                                                {field.errors?.[0] || field.name.join('.')}
                                            </li>
                                        ))}
                                    </ul>
                                ),
                            });
                            providerForm.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                >
                    <Form.Item
                        name="name"
                        label="Название"
                        rules={[
                            { required: true, whitespace: true, message: 'Введите название поставщика' },
                            { validator: (_, v) => {
                                    const val = (v ?? '').trim();
                                    if (!val) return Promise.reject('Название не может быть пустым');
                                    if (!/^[A-Za-z0-9 .,_&()\\-]+$/.test(val)) {
                                      return Promise.reject('Разрешены только латинские буквы, цифры и - _ . , & ( )');
                                    }
                                    return Promise.resolve();
                                }
                            }
                        ]}
                        normalize={(v) => (v ?? '').trim()}
                    >
                        <Input placeholder="Название поставщика" />
                    </Form.Item>

                    <Form.Item
                        name="type_prices"
                        label="Тип цены поставщика"
                        rules={[{ required: true, message: "Выберите тип цен" }]}
                    >
                        <Select
                            options={providerPriceTypeOptions}
                            placeholder="Выберите тип цен"
                        />
                    </Form.Item>

                    <Form.Item
                        name="default_delivery_method"
                        label="Способ доставки по умолчанию"
                        rules={[{
                            required: true,
                            message: "Выберите способ доставки",
                        }]}
                        extra="Используется как базовый вариант для этого поставщика."
                    >
                        <Select
                            options={deliveryMethodOptions}
                            placeholder="Выберите способ доставки"
                        />
                    </Form.Item>

                    <Form.Item
                        name="email_contact"
                        label="Контактный Email"
                        rules={[{ type: "email", message: "Введите корректный email" }]}
                    >
                        <Input placeholder="contact@provider.com" />
                    </Form.Item>

                    <Form.Item
                        name="email_incoming_price"
                        label="Email входящих прайсов"
                        rules={[{ type: "email", message: "Введите корректный email" }]}
                    >
                        <Input placeholder="prices@provider.com" />
                    </Form.Item>

                    <Divider>Обработка ответов поставщика</Divider>

                    <Form.Item
                        name="supplier_response_allow_response_files"
                        label="Обрабатывать файлы-ответы"
                        valuePropName="checked"
                        extra="Excel/CSV со статусами и количествами по строкам заказа."
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="supplier_response_allow_shipping_docs"
                        label="Обрабатывать документы УПД/накладные"
                        valuePropName="checked"
                        extra="Распознаём документы по имени вложения (УПД, накладная, invoice и т.д.)."
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="supplier_response_allow_text_status"
                        label="Обрабатывать текстовый ответ в письме"
                        valuePropName="checked"
                        extra="Используется текст темы/тела письма, даже если вложений нет."
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="supplier_response_filename_pattern"
                        label="Шаблон имени файла ответа (regex)"
                        extra="Необязательно. Если указан — обрабатываются только файлы с именем, подходящим под шаблон."
                    >
                        <Input placeholder="Например: ^ответ_заказ_\\d+\\.(xlsx|csv)$" />
                    </Form.Item>

                    <Form.Item
                        name="supplier_shipping_doc_filename_pattern"
                        label="Шаблон имени УПД/накладной (regex)"
                        extra="Необязательно. Если указан — используется для распознавания УПД/накладных вместо ключевых слов."
                    >
                        <Input placeholder="Например: (упд|накладн|invoice)" />
                    </Form.Item>

                    <div className="responsive-form-grid-compact">
                        <Form.Item
                            name="supplier_response_start_row"
                            label="Стартовая строка данных"
                            extra="1 = первая строка."
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_oem_col"
                            label="Колонка OEM"
                            extra="Номер колонки, начиная с 1."
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_brand_col"
                            label="Колонка Бренд"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_qty_col"
                            label="Колонка Кол-во"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_price_col"
                            label="Колонка Цена"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_comment_col"
                            label="Колонка Комментарий"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="supplier_response_status_col"
                            label="Колонка Статус"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={3} placeholder="Описание поставщика" />
                    </Form.Item>

                    <Form.Item name="comment" label="Комментарий">
                        <Input.TextArea rows={2} placeholder="Дополнительные комментарии" />
                    </Form.Item>

                    <Form.Item
                        name="is_own_price"
                        label="Наш прайс"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Divider>Расписание отправки заказов</Divider>
                    <Form.Item
                        name="order_schedule_enabled"
                        label="Автоматическая отправка заказов"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item name="order_schedule_days" label="Дни недели">
                        <Select
                            mode="multiple"
                            options={dayOptions}
                            placeholder="Выберите дни"
                        />
                    </Form.Item>
                    <Form.Item name="order_schedule_times" label="Время (HH:MM)">
                        <Select
                            mode="multiple"
                            options={timeOptions}
                            placeholder="Выберите время"
                        />
                    </Form.Item>

                    <Form.Item>
                        {isNew ? (
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={saving}
                                icon={<SaveOutlined />}
                            >
                                Создать поставщика
                            </Button>
                        ) : (
                            <Popconfirm
                                title="Сохранить изменения поставщика?"
                                description="Проверьте данные перед сохранением."
                                okText="Сохранить"
                                cancelText="Отмена"
                                onConfirm={() => providerForm.submit()}
                            >
                                <Button
                                    type="primary"
                                    loading={saving}
                                    icon={<SaveOutlined />}
                                >
                                    Сохранить изменения
                                </Button>
                            </Popconfirm>
                        )}
                    </Form.Item>
                </Form>
            </Card>

            {/* Блоки только для существующего поставщика */}
            {!isNew && providerData && (
                <>
                    {/* Аббревиатуры */}
                    <Card
                        title="Аббревиатуры"
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openAbbrModal()}>
                                Добавить
                            </Button>
                        }
                        style={{ marginBottom: 20 }}
                    >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {providerData.abbreviations?.length ? (
                                providerData.abbreviations.map((abbr) => (
                                    <Tag
                                        key={abbr.id}
                                        color="blue"
                                        closable
                                        onClose={(e) => {
                                            e.preventDefault();
                                            handleDeleteAbbr(abbr.id);
                                        }}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            cursor: "pointer",
                                            paddingInline: 10,
                                            height: 28,
                                        }}
                                        onClick={() => openAbbrModal(abbr)}
                                    >
                                        {abbr.abbreviation}
                                        <EditOutlined style={{ fontSize: 12 }} />
                                    </Tag>
                                ))
                            ) : (
                                <Text type="secondary">Аббревиатуры не добавлены</Text>
                            )}
                        </div>
                    </Card>

                    {/* Конфигурации прайс-листов */}
                    <Card
                        title="Конфигурации прайс-листов"
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openConfigModal()}>
                                Добавить конфигурацию
                            </Button>
                        }
                    >
                        <Table
                            rowKey="id"
                            columns={configColumns}
                            dataSource={providerData.pricelist_configs || []}
                            pagination={false}
                            size="middle"
                            locale={{ emptyText: "Конфигурации не настроены" }}
                            scroll={{ x: 'max-content' }}
                        />
                    </Card>

                    <ProviderPricelistAnalyticsSection
                        providerId={providerId}
                        refreshKey={analyticsRefreshKey}
                    />

                    <Card title="История оповещений о просрочке" style={{ marginTop: 16 }}>
                        <Table
                            rowKey="id"
                            loading={alertsLoading}
                            dataSource={staleAlerts}
                            pagination={{ pageSize: 10 }}
                            columns={[
                                {
                                    title: "Дата",
                                    dataIndex: "created_at",
                                    key: "created_at",
                                    render: (value) => formatMoscow(value),
                                },
                                {
                                    title: "Прайс",
                                    dataIndex: "provider_config_id",
                                    key: "provider_config_id",
                                    render: (value) => {
                                        const cfg = providerData?.pricelist_configs?.find(
                                            (c) => c.id === value
                                        );
                                        return cfg?.name_price || `#${value}`;
                                    },
                                },
                                {
                                    title: "Дней без обновления",
                                    dataIndex: "days_diff",
                                    key: "days_diff",
                                },
                                {
                                    title: "Последний прайс",
                                    dataIndex: "last_price_date",
                                    key: "last_price_date",
                                },
                            ]}
                            scroll={{ x: 'max-content' }}
                        />
                    </Card>

                    {/* Информация о последнем письме */}
                    {providerData.provider?.last_email_uid && (
                        <Card title="Последний Email UID" style={{ marginTop: 20 }}>
                            <div>
                                <Text strong>UID: </Text>
                                <Text>{providerData.provider.last_email_uid.uid}</Text>
                            </div>
                            {providerData.provider.last_email_uid.updated_at && (
                                <div>
                                    <Text strong>Обновлен: </Text>
                                    <Text>
                                        {formatMoscow(
                                            providerData.provider.last_email_uid.updated_at
                                        )}
                                    </Text>
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}

            {/* Модалка конфигурации */}
            <Modal
                title={editingConfig ? "Редактирование конфигурации" : "Создание конфигурации"}
                open={configModalVisible}
                onCancel={() => {
                    setConfigModalVisible(false);
                    setEditingConfig(null);
                    configForm.resetFields();
                }}
                footer={null}
                width={800}
                destroyOnClose
            >
                <Form
                    form={configForm}
                    layout="vertical"
                    onFinish={handleConfigSubmit}
                    onFinishFailed={() =>
                        message.error("Не отправлено: проверьте обязательные поля")
                    }
                >
                    <Form.Item
                        name="name_price"
                        label="Название прайса"
                        extra="Можно оставить пустым"
                    >
                        <Input placeholder="Например: Основной прайс" />
                    </Form.Item>

                    <Form.Item
                        name="name_mail"
                        label="Название письма"
                        extra="Можно оставить пустым"
                    >
                        <Input placeholder="Шаблон темы письма для поиска" />
                    </Form.Item>

                    <Form.Item
                        name="incoming_email_account_id"
                        label="Почтовый ящик для входящих прайсов"
                        extra="Для принудительной загрузки из почты. Если не выбран — используется ящик из .env."
                    >
                        <Select
                            allowClear
                            placeholder="По умолчанию (.env)"
                            options={priceInEmailAccounts.map((account) => ({
                                value: account.id,
                                label: `${account.name} (${account.email})`,
                            }))}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item name="file_url" label="URL файла">
                        <Input placeholder="http://example.com/pricelist.xlsx" />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label="Конфигурация активна"
                        valuePropName="checked"
                        initialValue={true}
                        extra={
                            "Если отключено: автообновление из email " +
                            "и уведомления о просрочке не выполняются."
                        }
                    >
                        <Switch checkedChildren="Вкл" unCheckedChildren="Выкл" />
                    </Form.Item>

                    <Divider>Настройки парсинга</Divider>

                    <Form.Item label="Нумерация колонок и строк">
                        <Switch
                            checked={configNumberingFromOne}
                            onChange={setConfigNumberingFromOne}
                        />
                        <span style={{ marginLeft: 8 }}>
                            С 1 (1 = первая колонка)
                        </span>
                    </Form.Item>

                    <Form.Item
                        name="start_row"
                        label="Строка начала данных"
                        rules={[{ required: true, message: "Укажите строку начала" }]}
                    >
                        <InputNumber
                            min={configNumberingFromOne ? 1 : 0}
                            placeholder="Номер строки"
                            style={{ width: "100%" }}
                        />
                    </Form.Item>

                    <div className="responsive-form-grid-2">
                        <Form.Item
                            name="oem_col"
                            label="Колонка OEM номера"
                            rules={[{ required: true, message: "Укажите колонку OEM" }]}
                        >
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        <Form.Item name="name_col" label="Колонка названия">
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        <Form.Item name="brand_col" label="Колонка бренда">
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        <Form.Item name="multiplicity_col" label="Колонка кратности">
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        <Form.Item
                            name="qty_col"
                            label="Колонка количества"
                            rules={[{ required: true, message: "Укажите колонку количества" }]}
                        >
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        <Form.Item
                            name="price_col"
                            label="Колонка цены"
                            rules={[{ required: true, message: "Укажите колонку цены" }]}
                        >
                            <InputNumber
                                min={configNumberingFromOne ? 1 : 0}
                                placeholder="Номер колонки"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>
                    </div>

                    <Divider>Фильтры прайс-листа</Divider>

                    <div className="responsive-form-grid-2">
                        <Form.Item name="min_price" label="Минимальная цена">
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="max_price" label="Максимальная цена">
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="min_quantity" label="Минимальный остаток">
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="max_quantity" label="Максимальный остаток">
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            name="max_days_without_update"
                            label="Дней без обновления"
                            extra="Если превышено — уведомление администраторам в программе"
                            initialValue={3}
                        >
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Form.Item
                        label="Загрузить список исключений"
                        extra="Excel: столбец 1 — бренд, столбец 2 — артикул"
                    >
                        <Upload
                            beforeUpload={() => false}
                            maxCount={1}
                            showUploadList={false}
                            onChange={({ file }) =>
                                handleExcludeUpload(file?.originFileObj || file)
                            }
                        >
                            <Button icon={<UploadOutlined />} loading={excludeUploading}>
                                Загрузить файл
                            </Button>
                        </Upload>
                    </Form.Item>

                    <Form.List name="exclude_positions">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map((field) => (
                                    <Space
                                        key={field.key}
                                        style={{ display: "flex", marginBottom: 8 }}
                                        align="baseline"
                                        wrap
                                    >
                                        <Form.Item
                                            {...field}
                                            name={[field.name, "brand"]}
                                            rules={[{ required: true, message: "Бренд" }]}
                                        >
                                            <Input placeholder="Бренд" />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, "oem"]}
                                            rules={[{ required: true, message: "Артикул" }]}
                                        >
                                            <Input placeholder="Артикул" />
                                        </Form.Item>
                                        <Button
                                            icon={<DeleteOutlined />}
                                            onClick={() => remove(field.name)}
                                        />
                                    </Space>
                                ))}
                                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                                    Добавить исключение
                                </Button>
                            </>
                        )}
                    </Form.List>

                    <Divider>Настройки доставки</Divider>

                    <div className="responsive-form-grid-2">
                        <Form.Item name="min_delivery_day" label="Минимум дней доставки" initialValue={1}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item name="max_delivery_day" label="Максимум дней доставки" initialValue={3}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Form.Item>
                        <Space wrap>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={configSaving}
                            >
                                {editingConfig ? "Обновить" : "Создать"}
                            </Button>
                            <Button
                                onClick={() => {
                                    setConfigModalVisible(false);
                                    setEditingConfig(null);
                                    configForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Модалка аббревиатуры */}
            <Modal
                title={editingAbbr ? "Редактирование аббревиатуры" : "Добавление аббревиатуры"}
                open={abbrModalVisible}
                onCancel={() => {
                    setAbbrModalVisible(false);
                    setEditingAbbr(null);
                    abbrForm.resetFields();
                }}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={abbrForm}
                    layout="vertical"
                    onFinish={handleAbbrSubmit}
                    onFinishFailed={({ errorFields }) => {
                        message.error('Не отправлено: проверьте обязательные поля');
                        if (errorFields?.length) {
                            Modal.error({
                                title: 'Ошибки формы',
                                content: (
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {errorFields.map((field) => (
                                            <li key={field.name.join('.')}>
                                                {field.errors?.[0] || field.name.join('.')}
                                            </li>
                                        ))}
                                    </ul>
                                ),
                            });
                            abbrForm.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                >
                    <Form.Item
                        name="abbreviation"
                        label="Аббревиатура"
                        rules={[
                            { required: true, message: "Введите аббревиатуру" },
                            { max: 20, message: "Максимум 20 символов" },
                        ]}
                    >
                        <Input placeholder="Например: ABC" maxLength={20} />
                    </Form.Item>

                    <Form.Item>
                        <Space wrap>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                                {editingAbbr ? "Обновить" : "Добавить"}
                            </Button>
                            <Button
                                onClick={() => {
                                    setAbbrModalVisible(false);
                                    setEditingAbbr(null);
                                    abbrForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
            {/* Модал: загрузка прайс-листа */}
            <Modal
                title="Загрузка прайс-листа"
                open={uploadModalVisible}
                onCancel={() => {
                    setUploadModalVisible(false);
                    setUploadingForConfigId(null);
                    uploadForm.resetFields();
                }}
                footer={null}
                width={600}
                destroyOnClose
            >
                <Form
                    form={uploadForm}
                    layout="vertical"
                    onFinish={handleUploadPricelist}
                    onFinishFailed={({ errorFields }) => {
                        message.error('Не отправлено: проверьте обязательные поля');
                        if (errorFields?.length) {
                            Modal.error({
                                title: 'Ошибки формы',
                                content: (
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {errorFields.map((field) => (
                                            <li key={field.name.join('.')}>
                                                {field.errors?.[0] || field.name.join('.')}
                                            </li>
                                        ))}
                                    </ul>
                                ),
                            });
                            uploadForm.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                >
                    <Form.Item
                        name="file"
                        label="Файл прайс-листа"
                        rules={[{ required: true, message: "Выберите файл" }]}
                    >
                        <Upload
                            accept=".xlsx,.xls,.csv"
                            maxCount={1}
                            beforeUpload={() => false}
                        >
                            <Button icon={<UploadOutlined />}>Выбрать файл</Button>
                        </Upload>
                    </Form.Item>

                    <Form.Item
                        name="use_stored_params"
                        label="Использовать параметры из конфигурации"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <input type="checkbox" />
                        <span style={{ marginLeft: 8 }}>Использовать сохраненные параметры парсинга</span>
                    </Form.Item>

                    <Form.Item label="Нумерация колонок и строк">
                        <Switch
                            checked={uploadNumberingFromOne}
                            onChange={setUploadNumberingFromOne}
                        />
                        <span style={{ marginLeft: 8 }}>
                            С 1 (1 = первая колонка)
                        </span>
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                            const useStoredParams = getFieldValue('use_stored_params');
                            if (useStoredParams) return null;

                            return (
                                <>
                                    <Divider>Параметры парсинга</Divider>

                                    <Form.Item
                                        name="start_row"
                                        label="Строка начала данных"
                                        rules={[{ required: true, message: "Укажите строку начала" }]}
                                    >
                                        <InputNumber
                                            min={uploadNumberingFromOne ? 1 : 0}
                                            style={{ width: "100%" }}
                                        />
                                    </Form.Item>

                                    <div className="responsive-form-grid-2">
                                        <Form.Item
                                            name="oem_col"
                                            label="Колонка OEM"
                                            rules={[{ required: true, message: "Укажите колонку OEM" }]}
                                        >
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>

                                        <Form.Item name="name_col" label="Колонка названия">
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>

                                        <Form.Item name="brand_col" label="Колонка бренда">
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>

                                        <Form.Item
                                            name="multiplicity_col"
                                            label="Колонка кратности"
                                        >
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>

                                        <Form.Item
                                            name="qty_col"
                                            label="Колонка количества"
                                            rules={[{ required: true, message: "Укажите колонку количества" }]}
                                        >
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>

                                        <Form.Item
                                            name="price_col"
                                            label="Колонка цены"
                                            rules={[{ required: true, message: "Укажите колонку цены" }]}
                                        >
                                            <InputNumber
                                                min={uploadNumberingFromOne ? 1 : 0}
                                                style={{ width: "100%" }}
                                            />
                                        </Form.Item>
                                    </div>
                                </>
                            );
                        }}
                    </Form.Item>

                    <Form.Item>
                        <Space wrap>
                            <Button type="primary" htmlType="submit" loading={uploading} icon={<SaveOutlined />}>
                                Загрузить и обработать
                            </Button>
                            <Button
                                onClick={() => {
                                    setUploadModalVisible(false);
                                    setUploadingForConfigId(null);
                                    uploadForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ProviderPage;
