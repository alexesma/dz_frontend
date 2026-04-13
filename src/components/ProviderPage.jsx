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
    Radio,
    Alert,
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
    createSupplierResponseConfig,
    updateSupplierResponseConfig,
    deleteSupplierResponseConfig,
    checkSupplierResponseConfigNow,
    classifySupplierResponseMessage,
    getSupplierResponseImportErrors,
    getSupplierResponseMessages,
    retrySupplierResponseImportErrors,
    retrySupplierResponseMessage,
} from "../api/providers";
import { updateCustomerPricelistSource } from "../api/customers";
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

const supplierResponseMessageTypeOptions = [
    { value: "UNKNOWN", label: "Не определено" },
    { value: "IMPORT_ERROR", label: "Ошибка импорта" },
    { value: "RESPONSE_FILE", label: "Файл-ответ" },
    { value: "TEXT_RESPONSE", label: "Текстовый ответ" },
    { value: "SHIPPING_DOC", label: "Документ УПД/накладная" },
    { value: "STATUS", label: "Статусное письмо" },
    { value: "IGNORED", label: "Служебное / игнор" },
    { value: "RETRY_PENDING", label: "Ожидает перепроверки" },
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
    const [responseEmailAccounts, setResponseEmailAccounts] = useState([]);
    const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);

    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);

    const [abbrModalVisible, setAbbrModalVisible] = useState(false);
    const [editingAbbr, setEditingAbbr] = useState(null);

    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadingForConfigId, setUploadingForConfigId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [responseConfigModalVisible, setResponseConfigModalVisible] = useState(false);
    const [editingResponseConfig, setEditingResponseConfig] = useState(null);
    const [responseConfigSaving, setResponseConfigSaving] = useState(false);
    const [checkingResponseConfigId, setCheckingResponseConfigId] = useState(null);
    const [responseImportErrorsLoading, setResponseImportErrorsLoading] = useState(false);
    const [responseImportErrorsRetrying, setResponseImportErrorsRetrying] = useState(false);
    const [responseImportErrors, setResponseImportErrors] = useState([]);
    const [responseMessagesLoading, setResponseMessagesLoading] = useState(false);
    const [responseMessages, setResponseMessages] = useState([]);
    const [responseMessageActionLoadingById, setResponseMessageActionLoadingById] = useState({});
    const [sourceUsageModalVisible, setSourceUsageModalVisible] = useState(false);
    const [editingSourceUsage, setEditingSourceUsage] = useState(null);
    const [sourceUsageSaving, setSourceUsageSaving] = useState(false);
    const [uploadForm] = Form.useForm();
    const [sourceUsageForm] = Form.useForm();
    const [configNumberingFromOne, setConfigNumberingFromOne] = useState(true);
    const [uploadNumberingFromOne, setUploadNumberingFromOne] = useState(true);
    const [excludeUploading, setExcludeUploading] = useState(false);

    const [providerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [responseConfigForm] = Form.useForm();
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

    const parseStringList = (value) => String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const parseSenderEmails = (value) => {
        const seen = new Set();
        return parseStringList(value)
            .map((email) => email.toLowerCase())
            .filter((email) => {
                if (seen.has(email)) return false;
                seen.add(email);
                return true;
            });
    };

    const supplierResponseMessageTypeLabel = (value) => {
        const found = supplierResponseMessageTypeOptions.find(
            (item) => item.value === value
        );
        return found?.label || value || "Не определено";
    };

    const supplierResponseMessageTypeColor = (value) => {
        if (value === "IMPORT_ERROR") return "red";
        if (value === "RESPONSE_FILE") return "blue";
        if (value === "TEXT_RESPONSE") return "cyan";
        if (value === "SHIPPING_DOC") return "green";
        if (value === "STATUS") return "orange";
        if (value === "IGNORED") return "default";
        if (value === "RETRY_PENDING") return "purple";
        return "default";
    };

    const formatSuggestionConfidence = (value) => {
        const number = Number(value);
        if (Number.isNaN(number)) return null;
        const pct = Math.round(Math.max(0, Math.min(1, number)) * 100);
        return `${pct}%`;
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
                const activeAccounts = (data || []).filter(
                    (account) => account.is_active
                );
                const priceInAccounts = (data || []).filter(
                    (account) =>
                        account.is_active
                        && (account.purposes || []).includes("prices_in")
                );
                setPriceInEmailAccounts(priceInAccounts);
                setResponseEmailAccounts(activeAccounts);
            } catch {
                setPriceInEmailAccounts([]);
                setResponseEmailAccounts([]);
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

    const openResponseConfigModal = (config = null) => {
        setEditingResponseConfig(config);
        if (config) {
                responseConfigForm.setFieldsValue({
                    ...config,
                    file_payload_type: config.file_payload_type || "response",
                    auto_confirm_unmentioned_items: !!config.auto_confirm_unmentioned_items,
                    auto_confirm_after_minutes: config.auto_confirm_after_minutes ?? null,
                    sender_emails_text: (config.sender_emails || []).join(", "),
                    confirm_keywords_text: (config.confirm_keywords || []).join(", "),
                    reject_keywords_text: (config.reject_keywords || []).join(", "),
                });
        } else {
            responseConfigForm.resetFields();
                responseConfigForm.setFieldsValue({
                    name: "",
                    is_active: true,
                    response_type: "file",
                    process_shipping_docs: true,
                    auto_confirm_unmentioned_items: false,
                    auto_confirm_after_minutes: null,
                    file_format: "excel",
                    file_payload_type: "response",
                start_row: 1,
                value_after_article_type: "both",
                sender_emails_text: "",
                confirm_keywords_text: "в наличии, есть, отгружаем, собрали, да",
                reject_keywords_text: "нет, 0, отсутствует, не можем, снято с производства",
            });
            setResponseImportErrors([]);
            setResponseMessages([]);
        }
        if (config?.id) {
            loadResponseImportErrors(config.id);
            loadResponseMessages(config.id);
        } else {
            setResponseImportErrors([]);
            setResponseMessages([]);
        }
        setResponseMessageActionLoadingById({});
        setResponseConfigModalVisible(true);
    };

    const handleResponseConfigSubmit = async (values) => {
        if (!providerId) return;
        setResponseConfigSaving(true);
        try {
            const payload = {
                ...values,
                sender_emails: parseSenderEmails(values.sender_emails_text),
                confirm_keywords: parseStringList(values.confirm_keywords_text),
                reject_keywords: parseStringList(values.reject_keywords_text),
            };
            payload.auto_confirm_after_minutes =
                payload.auto_confirm_after_minutes || null;
            delete payload.sender_emails_text;
            delete payload.confirm_keywords_text;
            delete payload.reject_keywords_text;
            if (payload.response_type !== "file") {
                payload.file_format = null;
                payload.file_payload_type = "response";
                payload.start_row = 1;
                payload.oem_col = null;
                payload.brand_col = null;
                payload.qty_col = null;
                payload.status_col = null;
                payload.comment_col = null;
                payload.price_col = null;
                payload.document_number_col = null;
                payload.document_date_col = null;
                payload.gtd_col = null;
                payload.country_code_col = null;
                payload.country_name_col = null;
                payload.total_price_with_vat_col = null;
                payload.filename_pattern = null;
            }
            if (payload.response_type === "file" && payload.file_payload_type !== "document") {
                payload.document_number_col = null;
                payload.document_date_col = null;
                payload.gtd_col = null;
                payload.country_code_col = null;
                payload.country_name_col = null;
                payload.total_price_with_vat_col = null;
            }
            if (payload.response_type !== "text") {
                payload.confirm_keywords = [];
                payload.reject_keywords = [];
                payload.value_after_article_type = "both";
            }
            if (editingResponseConfig) {
                await updateSupplierResponseConfig(
                    providerId,
                    editingResponseConfig.id,
                    payload
                );
                message.success("Конфигурация ответа обновлена");
            } else {
                await createSupplierResponseConfig(providerId, payload);
                message.success("Конфигурация ответа создана");
            }
            setResponseConfigModalVisible(false);
            setEditingResponseConfig(null);
            responseConfigForm.resetFields();
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Ошибка сохранения конфигурации ответа"
            );
        } finally {
            setResponseConfigSaving(false);
        }
    };

    const handleDeleteResponseConfig = async (configId) => {
        if (!providerId) return;
        try {
            await deleteSupplierResponseConfig(providerId, configId);
            message.success("Конфигурация ответа удалена");
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error("Ошибка удаления конфигурации ответа");
        }
    };

    const buildResponseCheckHints = (data = {}) => {
        const fetched = data?.fetched_messages || 0;
        const processed = data?.processed_messages || 0;
        const parsedFiles = data?.parsed_response_files || 0;
        const parsedText = data?.parsed_text_positions || 0;
        const recognized = data?.recognized_positions || 0;
        const hints = [];
        if (fetched > 0 && processed === 0) {
            hints.push("Письма в ящике есть, но они не прошли фильтры конфигурации.");
            hints.push("Проверьте sender_email: нужен точный email из поля From.");
            hints.push("Проверьте inbox_email: письмо должно быть в выбранном ящике и папке INBOX.");
        }
        if (processed > 0 && parsedFiles === 0 && parsedText === 0) {
            hints.push("Письма обработаны, но ответ не извлечен.");
            hints.push("Для типа 'Файл' проверьте шаблон имени файла и формат вложения.");
            hints.push("Для типа 'Текст письма' проверьте словари статусов и правило после артикула.");
        }
        if (processed > 0 && recognized === 0) {
            hints.push("Ответ получен, но позиции не сопоставлены с заказами.");
            hints.push("Проверьте OEM/бренд в ответе и активные заказы поставщику.");
        }
        return hints;
    };

    const loadResponseMessages = async (configId) => {
        if (!providerId || !configId) {
            setResponseMessages([]);
            return;
        }
        setResponseMessagesLoading(true);
        try {
            const { data } = await getSupplierResponseMessages(
                providerId,
                configId,
                { limit: 100 }
            );
            setResponseMessages(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setResponseMessages([]);
            message.error(
                err?.response?.data?.detail
                || "Не удалось загрузить реестр обработанных писем"
            );
        } finally {
            setResponseMessagesLoading(false);
        }
    };

    const loadResponseImportErrors = async (configId) => {
        if (!providerId || !configId) {
            setResponseImportErrors([]);
            return;
        }
        setResponseImportErrorsLoading(true);
        try {
            const { data } = await getSupplierResponseImportErrors(
                providerId,
                configId,
                { limit: 50 }
            );
            setResponseImportErrors(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setResponseImportErrors([]);
            message.error(
                err?.response?.data?.detail
                || "Не удалось загрузить ошибки импорта ответов"
            );
        } finally {
            setResponseImportErrorsLoading(false);
        }
    };

    const setResponseMessageActionLoading = (messageId, value) => {
        setResponseMessageActionLoadingById((prev) => ({
            ...prev,
            [messageId]: value,
        }));
    };

    const handleClassifyResponseMessage = async (messageId, messageType) => {
        if (!providerId || !editingResponseConfig?.id) return;
        setResponseMessageActionLoading(messageId, true);
        try {
            await classifySupplierResponseMessage(
                providerId,
                editingResponseConfig.id,
                messageId,
                messageType
            );
            await loadResponseMessages(editingResponseConfig.id);
            if (messageType !== "IMPORT_ERROR") {
                await loadResponseImportErrors(editingResponseConfig.id);
            }
            message.success("Классификация письма обновлена");
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Не удалось обновить классификацию письма"
            );
        } finally {
            setResponseMessageActionLoading(messageId, false);
        }
    };

    const handleRetryResponseMessage = async (messageId) => {
        if (!providerId || !editingResponseConfig?.id) return;
        setResponseMessageActionLoading(messageId, true);
        try {
            const { data } = await retrySupplierResponseMessage(
                providerId,
                editingResponseConfig.id,
                messageId
            );
            message.success(
                data?.queued
                    ? (
                        "Письмо отправлено в перепроверку. "
                        + `Обработано: ${data?.processed_messages || 0}`
                    )
                    : "Письмо нельзя перепроверить: нет source UID/message id"
            );
            await loadResponseMessages(editingResponseConfig.id);
            await loadResponseImportErrors(editingResponseConfig.id);
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Не удалось перепроверить письмо"
            );
        } finally {
            setResponseMessageActionLoading(messageId, false);
        }
    };

    const handleRetryResponseImportErrors = async () => {
        if (!providerId || !editingResponseConfig?.id) return;
        setResponseImportErrorsRetrying(true);
        try {
            const { data } = await retrySupplierResponseImportErrors(
                providerId,
                editingResponseConfig.id
            );
            message.success(
                `Перепроверка завершена: в очереди ${data?.queued || 0}, `
                + `обработано ${data?.processed_messages || 0}`
            );
            await loadResponseImportErrors(editingResponseConfig.id);
            await loadResponseMessages(editingResponseConfig.id);
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Не удалось перепроверить ошибки импорта ответов"
            );
        } finally {
            setResponseImportErrorsRetrying(false);
        }
    };

    const handleCheckResponseConfigNow = async (configId) => {
        if (!providerId) return;
        setCheckingResponseConfigId(configId);
        try {
            const { data } = await checkSupplierResponseConfigNow(
                providerId,
                configId
            );
            const unresolved = data?.unresolved_examples || [];
            const hints = buildResponseCheckHints(data);
            Modal.info({
                title: "Результат проверки почты",
                width: 700,
                content: (
                    <div>
                        <div>Писем найдено: {data?.fetched_messages || 0}</div>
                        <div>Писем обработано: {data?.processed_messages || 0}</div>
                        <div>Позиции распознано: {data?.recognized_positions || 0}</div>
                        <div>Позиции не разобраны: {data?.unresolved_positions || 0}</div>
                        <div>Создано документов поступления: {data?.created_receipts || 0}</div>
                        <div>Обновлено черновиков поступления: {data?.updated_receipts || 0}</div>
                        <div>Автопроведено по УПД/накладным: {data?.posted_receipts || 0}</div>
                        <div>Строк добавлено в поступления: {data?.receipt_items_added || 0}</div>
                        <div>Автоподтверждено по таймеру: {data?.timeout_auto_confirmed_orders || 0}</div>
                        {hints.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <b>Что проверить в настройке:</b>
                                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                                    {hints.map((item, index) => (
                                        <li key={`${index}_${item}`}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {unresolved.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <b>Не удалось разобрать:</b>
                                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                                    {unresolved.map((item, index) => (
                                        <li key={`${index}_${item}`}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ),
            });
            await loadResponseImportErrors(configId);
            await loadResponseMessages(configId);
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Не удалось выполнить проверку почты"
            );
        } finally {
            setCheckingResponseConfigId(null);
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

    const parseIntListFromText = (value) =>
        String(value || "")
            .split(",")
            .map((item) => Number.parseInt(item.trim(), 10))
            .filter((item) => Number.isFinite(item));

    const normalizeOptionalPositive = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return numeric;
    };

    const parseBrandMarkupsFromText = (value) => {
        const result = {};
        String(value || "")
            .split(/\n|,/)
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((chunk) => {
                const pair = chunk.split(/[:=]/);
                if (pair.length < 2) return;
                const brand = String(pair[0] || "").trim().toUpperCase();
                const numeric = Number(
                    String(pair.slice(1).join(":") || "")
                        .trim()
                        .replace(",", ".")
                );
                if (!brand || !Number.isFinite(numeric) || numeric <= 0) return;
                result[brand] = numeric;
            });
        return result;
    };

    const formatBrandMarkupsToText = (value) => {
        const entries = Object.entries(value || {});
        if (!entries.length) return "";
        return entries
            .map(([brand, markup]) => `${brand}=${markup}`)
            .join(", ");
    };

    const formatSourceUsageFilters = (row) => {
        const lines = [];
        const brandFilter = row?.brand_filters || {};
        const brandType = brandFilter?.type;
        const brandIds = brandFilter?.brands || [];
        if (brandType && brandIds.length) {
            lines.push(
                `Бренды: ${brandType === "include" ? "только" : "исключить"} `
                + `${brandIds.join(", ")}`
            );
        }
        const positionFilter = row?.position_filters || {};
        const positionType = positionFilter?.type;
        const positionIds = positionFilter?.autoparts || [];
        if (positionType && positionIds.length) {
            lines.push(
                `Позиции: ${positionType === "include" ? "только" : "исключить"} `
                + `${positionIds.join(", ")}`
            );
        }
        const minPrice = row?.min_price;
        const maxPrice = row?.max_price;
        if (minPrice !== null && minPrice !== undefined) {
            lines.push(`Мин. цена: ${minPrice}`);
        }
        if (maxPrice !== null && maxPrice !== undefined) {
            lines.push(`Макс. цена: ${maxPrice}`);
        }
        const minQty = row?.min_quantity;
        const maxQty = row?.max_quantity;
        if (minQty !== null && minQty !== undefined) {
            lines.push(`Мин. кол-во: ${minQty}`);
        }
        if (maxQty !== null && maxQty !== undefined) {
            lines.push(`Макс. кол-во: ${maxQty}`);
        }
        const brandMarkups = row?.brand_markups || {};
        const markupEntries = Object.entries(brandMarkups);
        if (markupEntries.length) {
            lines.push(
                (
                    "Наценка по брендам: "
                    + markupEntries
                        .map(([brand, markup]) => `${brand}=${markup}`)
                        .join(", ")
                )
            );
        }
        if (!lines.length) return <span style={{ color: "#999" }}>—</span>;
        return (
            <div>
                {lines.map((line) => (
                    <div key={line}>{line}</div>
                ))}
            </div>
        );
    };

    const openSourceUsageModal = (sourceUsage) => {
        setEditingSourceUsage(sourceUsage);
        sourceUsageForm.setFieldsValue({
            enabled: sourceUsage?.enabled ?? true,
            markup: Number(sourceUsage?.markup || 1.0),
            brand_markups_text: formatBrandMarkupsToText(
                sourceUsage?.brand_markups || {}
            ),
            brand_filter_type: sourceUsage?.brand_filters?.type || null,
            brand_ids_text: (sourceUsage?.brand_filters?.brands || []).join(", "),
            position_filter_type:
                sourceUsage?.position_filters?.type || null,
            position_ids_text:
                (sourceUsage?.position_filters?.autoparts || []).join(", "),
            min_price:
                sourceUsage?.min_price !== null
                && sourceUsage?.min_price !== undefined
                    ? Number(sourceUsage.min_price)
                    : null,
            max_price:
                sourceUsage?.max_price !== null
                && sourceUsage?.max_price !== undefined
                    ? Number(sourceUsage.max_price)
                    : null,
            min_quantity: sourceUsage?.min_quantity ?? null,
            max_quantity: sourceUsage?.max_quantity ?? null,
        });
        setSourceUsageModalVisible(true);
    };

    const handleSourceUsageSubmit = async (values) => {
        if (!editingSourceUsage) return;
        setSourceUsageSaving(true);
        try {
            const markupValue = Number(values.markup);
            const payload = {
                enabled: values.enabled ?? true,
                markup:
                    Number.isFinite(markupValue) && markupValue > 0
                        ? markupValue
                        : 1.0,
                brand_filters: values.brand_filter_type
                    ? {
                        type: values.brand_filter_type,
                        brands: parseIntListFromText(values.brand_ids_text),
                    }
                    : {},
                position_filters: values.position_filter_type
                    ? {
                        type: values.position_filter_type,
                        autoparts: parseIntListFromText(
                            values.position_ids_text
                        ),
                    }
                    : {},
                min_price: normalizeOptionalPositive(values.min_price),
                max_price: normalizeOptionalPositive(values.max_price),
                min_quantity: normalizeOptionalPositive(values.min_quantity),
                max_quantity: normalizeOptionalPositive(values.max_quantity),
                brand_markups: parseBrandMarkupsFromText(
                    values.brand_markups_text
                ),
            };
            await updateCustomerPricelistSource(
                editingSourceUsage.customer_id,
                editingSourceUsage.customer_config_id,
                editingSourceUsage.source_id,
                payload
            );
            message.success("Источник в клиентском прайсе обновлен");
            setSourceUsageModalVisible(false);
            setEditingSourceUsage(null);
            sourceUsageForm.resetFields();
            await refreshProviderData();
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail
                || "Не удалось обновить источник клиентского прайса"
            );
        } finally {
            setSourceUsageSaving(false);
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

    const responseConfigColumns = [
        {
            title: "Название",
            dataIndex: "name",
            key: "name",
        },
        {
            title: "Почтовый ящик",
            dataIndex: "inbox_email_account_id",
            key: "inbox_email_account_id",
            render: (_, record) => {
                const accountName = record?.inbox_email_account_name;
                const accountEmail = record?.inbox_email_account_email;
                if (accountName || accountEmail) {
                    if (accountName && accountEmail) {
                        return `${accountName} (${accountEmail})`;
                    }
                    return accountName || accountEmail;
                }
                const value = record?.inbox_email_account_id;
                if (!value) return <span style={{ color: "#999" }}>По умолчанию (orders_out)</span>;
                const account = responseEmailAccounts.find((item) => item.id === value);
                return account ? `${account.name} (${account.email})` : `ID ${value}`;
            },
        },
        {
            title: "Отправители",
            dataIndex: "sender_emails",
            key: "sender_emails",
            render: (value) => {
                const items = value || [];
                if (!items.length) return <span style={{ color: "#999" }}>Любой</span>;
                return items.join(", ");
            },
        },
        {
            title: "Тип",
            dataIndex: "response_type",
            key: "response_type",
            render: (value) => (value === "file" ? "Файл" : "Текст письма"),
        },
        {
            title: "Режим исключений",
            dataIndex: "auto_confirm_unmentioned_items",
            key: "auto_confirm_unmentioned_items",
            render: (value) => (value ? "Включен" : "Выключен"),
        },
        {
            title: "Таймер без ответа",
            dataIndex: "auto_confirm_after_minutes",
            key: "auto_confirm_after_minutes",
            render: (value) => (value ? `${value} мин` : "—"),
        },
        {
            title: "Режим файла",
            dataIndex: "file_payload_type",
            key: "file_payload_type",
            render: (value, record) => {
                if (record?.response_type !== "file") return "—";
                return value === "document" ? "Документ" : "Ответ";
            },
        },
        {
            title: "Логика после артикула",
            dataIndex: "value_after_article_type",
            key: "value_after_article_type",
            render: (value) => {
                if (value === "number") return "Число";
                if (value === "text") return "Текст";
                return "Число или текст";
            },
        },
        {
            title: "Активна",
            dataIndex: "is_active",
            key: "is_active",
            render: (value) => (
                <Tag color={value ? "green" : "default"}>
                    {value ? "Включена" : "Отключена"}
                </Tag>
            ),
        },
        {
            title: "Действия",
            key: "actions",
            width: 120,
            render: (_, record) => (
                <Space size="small" wrap className="table-actions">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openResponseConfigModal(record)}
                    />
                    <Popconfirm
                        title="Удалить конфигурацию ответа?"
                        description="Действие необратимо"
                        onConfirm={() => handleDeleteResponseConfig(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button type="primary" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const sourceUsageColumns = [
        {
            title: "Клиент",
            key: "customer",
            render: (_, record) => (
                <div>
                    <div>{record.customer_name || `Клиент #${record.customer_id}`}</div>
                    <Text type="secondary">ID: {record.customer_id}</Text>
                </div>
            ),
        },
        {
            title: "Конфиг клиента",
            key: "customer_config",
            render: (_, record) => (
                <div>
                    <div>{record.customer_config_name || `Конфиг #${record.customer_config_id}`}</div>
                    <Text type="secondary">ID: {record.customer_config_id}</Text>
                </div>
            ),
        },
        {
            title: "Конфиг поставщика",
            key: "provider_config",
            render: (_, record) => (
                <div>
                    <div>{record.provider_config_name || `Конфиг #${record.provider_config_id}`}</div>
                    <Text type="secondary">ID: {record.provider_config_id}</Text>
                </div>
            ),
        },
        {
            title: "Наценка",
            dataIndex: "markup",
            key: "markup",
            render: (value) => Number(value || 1).toFixed(3),
        },
        {
            title: "Фильтры",
            key: "filters",
            render: (_, record) => formatSourceUsageFilters(record),
        },
        {
            title: "Включено",
            dataIndex: "enabled",
            key: "enabled",
            render: (value) => (
                <Tag color={value ? "green" : "default"}>
                    {value ? "Да" : "Нет"}
                </Tag>
            ),
        },
        {
            title: "Действия",
            key: "actions",
            width: 90,
            render: (_, record) => (
                <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openSourceUsageModal(record)}
                />
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

                    <Card
                        title="Конфигурации ответов поставщиков"
                        style={{ marginTop: 16 }}
                        extra={
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => openResponseConfigModal()}
                            >
                                Добавить конфигурацию
                            </Button>
                        }
                    >
                        <Table
                            rowKey="id"
                            columns={responseConfigColumns}
                            dataSource={providerData.supplier_response_configs || []}
                            pagination={false}
                            size="middle"
                            locale={{ emptyText: "Конфигурации ответов не настроены" }}
                            scroll={{ x: 'max-content' }}
                        />
                    </Card>

                    <Card
                        title="Использование в прайсах клиентов"
                        style={{ marginTop: 16 }}
                    >
                        <Table
                            rowKey="source_id"
                            columns={sourceUsageColumns}
                            dataSource={
                                providerData.customer_pricelist_sources_usage
                                || []
                            }
                            pagination={{ pageSize: 10 }}
                            size="middle"
                            locale={{
                                emptyText: (
                                    "Этот поставщик пока не добавлен "
                                    + "в источники клиентских прайсов"
                                ),
                            }}
                            scroll={{ x: "max-content" }}
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

            <Modal
                title={
                    editingResponseConfig
                        ? "Редактирование конфигурации ответа"
                        : "Создание конфигурации ответа"
                }
                open={responseConfigModalVisible}
                onCancel={() => {
                    setResponseConfigModalVisible(false);
                    setEditingResponseConfig(null);
                    responseConfigForm.resetFields();
                    setResponseImportErrors([]);
                    setResponseMessages([]);
                    setResponseMessageActionLoadingById({});
                }}
                footer={null}
                width={820}
                destroyOnClose
            >
                <Form
                    form={responseConfigForm}
                    layout="vertical"
                    onFinish={handleResponseConfigSubmit}
                >
                    <Form.Item
                        name="name"
                        label="Название конфигурации"
                        rules={[{ required: true, message: "Введите название" }]}
                    >
                        <Input placeholder="Например: Основной ответ по email" />
                    </Form.Item>

                    <Divider>Почтовые настройки</Divider>

                    <Form.Item
                        name="inbox_email_account_id"
                        label="inbox_email (какой ящик читаем: название + email)"
                        extra="Если не выбран, используется набор ящиков purpose=orders_out."
                    >
                        <Select
                            allowClear
                            placeholder="Выберите почтовый ящик"
                            options={responseEmailAccounts.map((account) => ({
                                value: account.id,
                                label: `${account.name} (${account.email})`,
                            }))}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item
                        name="sender_emails_text"
                        label="sender_email (через запятую)"
                        extra="Допустимо несколько адресов: supplier@a.ru, orders@a.ru"
                    >
                        <Input placeholder="supplier@example.com, orders@example.com" />
                    </Form.Item>

                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Как избежать ошибок при тестовой проверке"
                        description={(
                            <div>
                                <div>1. sender_email должен точно совпадать с адресом в поле From.</div>
                                <div>2. Для типа «Файл» шаблон имени проверяется по части имени (regex, без учета регистра) и с учетом декодирования MIME-имен.</div>
                                <div>3. Кнопка «Проверить почту сейчас» использует уже сохраненную конфигурацию.</div>
                            </div>
                        )}
                    />

                    <Divider>Тип ответа</Divider>

                    <Form.Item
                        name="response_type"
                        label="Тип ответа"
                        rules={[{ required: true, message: "Выберите тип ответа" }]}
                    >
                        <Radio.Group>
                            <Radio.Button value="file">Файл</Radio.Button>
                            <Radio.Button value="text">Текст письма</Radio.Button>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item
                        name="auto_confirm_unmentioned_items"
                        label="Режим исключений (остальные позиции подтверждать)"
                        valuePropName="checked"
                        extra="Если в ответе распознаны позиции, изменения применяются только к ним, а остальные pending-позиции заказа автоматически подтверждаются."
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="auto_confirm_after_minutes"
                        label="Автоподтверждение при отсутствии ответа (мин)"
                        extra="Если ответов по заказу нет дольше этого времени после отправки — позиции автоматически подтверждаются. Пусто = выключено."
                    >
                        <InputNumber min={1} style={{ width: "100%" }} placeholder="Например: 30" />
                    </Form.Item>

                    <Form.Item
                        name="process_shipping_docs"
                        label="Обрабатывать документы УПД/накладные"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                            const responseType = getFieldValue("response_type");
                            if (responseType !== "file") return null;
                            return (
                                <>
                                    <Divider>Настройки файла ответа</Divider>
                                    <Form.Item
                                        name="file_format"
                                        label="Формат файла"
                                        rules={[{ required: true, message: "Выберите формат" }]}
                                    >
                                        <Radio.Group>
                                            <Radio.Button value="excel">Excel</Radio.Button>
                                            <Radio.Button value="csv">CSV</Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>
                                    <Form.Item
                                        name="file_payload_type"
                                        label="Что приходит в файле"
                                        rules={[{ required: true, message: "Выберите тип файла" }]}
                                    >
                                        <Radio.Group>
                                            <Radio.Button value="response">Ответ</Radio.Button>
                                            <Radio.Button value="document">Документ (УПД/накладная)</Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>
                                    <Form.Item
                                        name="filename_pattern"
                                        label="Шаблон имени файла (regex)"
                                    >
                                        <Input placeholder="Например: ^answer_\\d+\\.(xlsx|csv)$" />
                                    </Form.Item>
                                    <div className="responsive-form-grid-compact">
                                        <Form.Item
                                            name="start_row"
                                            label="Начальная строка данных"
                                            rules={[{ required: true, message: "Укажите строку начала" }]}
                                        >
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item
                                            name="oem_col"
                                            label="Колонка OEM"
                                            rules={[{ required: true, message: "Укажите колонку OEM" }]}
                                        >
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item name="brand_col" label="Бренд (опционально)">
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item
                                            name="qty_col"
                                            label="Количество"
                                            rules={[{ required: true, message: "Укажите колонку количества" }]}
                                        >
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item name="status_col" label="Статус (опционально)">
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item name="comment_col" label="Комментарий (опционально)">
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Form.Item name="price_col" label="Цена (опционально)">
                                            <InputNumber min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </div>
                                    <Form.Item noStyle shouldUpdate>
                                        {({ getFieldValue }) => {
                                            const payloadType = getFieldValue("file_payload_type");
                                            if (payloadType !== "document") return null;
                                            return (
                                                <>
                                                    <Divider>Поля документа (опционально)</Divider>
                                                    <div className="responsive-form-grid-compact">
                                                        <Form.Item
                                                            name="document_number_col"
                                                            label="Номер документа"
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="document_date_col"
                                                            label="Дата документа"
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="gtd_col"
                                                            label="ГТД"
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="country_code_col"
                                                            label="Код страны"
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="country_name_col"
                                                            label="Название страны"
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="total_price_with_vat_col"
                                                            label="Сумма с НДС"
                                                            extra="Если цена не заполнена, она вычисляется как (Сумма с НДС / Количество)."
                                                        >
                                                            <InputNumber min={1} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </div>
                                                </>
                                            );
                                        }}
                                    </Form.Item>
                                </>
                            );
                        }}
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                            const responseType = getFieldValue("response_type");
                            if (responseType !== "text") return null;
                            return (
                                <>
                                    <Divider>Словари статусов</Divider>

                                    <Form.Item
                                        name="confirm_keywords_text"
                                        label="Подтверждение (через запятую)"
                                    >
                                        <Input.TextArea
                                            rows={2}
                                            placeholder="в наличии, есть, отгружаем, собрали, да"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="reject_keywords_text"
                                        label="Отказ (через запятую)"
                                    >
                                        <Input.TextArea
                                            rows={2}
                                            placeholder="нет, 0, отсутствует, не можем, снято с производства"
                                        />
                                    </Form.Item>

                                    <Divider>Разбор текста письма</Divider>
                                    <Text type="secondary">
                                        Универсальное правило: артикул в тексте определяется по признаку
                                        «латинские буквы + цифры в одном токене».
                                    </Text>

                                    <Form.Item
                                        name="value_after_article_type"
                                        label="Что ожидаем после артикула"
                                        style={{ marginTop: 10 }}
                                    >
                                        <Radio.Group>
                                            <Radio.Button value="number">Число</Radio.Button>
                                            <Radio.Button value="text">Текст</Radio.Button>
                                            <Radio.Button value="both">Число или текст</Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>
                                </>
                            );
                        }}
                    </Form.Item>

                    <Form.Item
                        name="shipping_doc_filename_pattern"
                        label="Шаблон имени УПД/накладной (regex)"
                    >
                        <Input placeholder="Например: (упд|накладн|invoice)" />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label="Конфигурация активна"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    {editingResponseConfig?.id && (
                        <>
                            <Divider>Ошибки импорта ответов</Divider>
                            <Space style={{ marginBottom: 10 }} wrap>
                                <Button
                                    onClick={() => loadResponseImportErrors(editingResponseConfig.id)}
                                    loading={responseImportErrorsLoading}
                                >
                                    Обновить список ошибок
                                </Button>
                                <Button
                                    type="default"
                                    onClick={handleRetryResponseImportErrors}
                                    loading={responseImportErrorsRetrying}
                                >
                                    Повторить загрузку ошибок
                                </Button>
                            </Space>
                            <Table
                                size="small"
                                rowKey="id"
                                loading={responseImportErrorsLoading}
                                dataSource={responseImportErrors}
                                pagination={false}
                                locale={{
                                    emptyText: "Ошибок импорта не найдено",
                                }}
                                columns={[
                                    {
                                        title: "Дата",
                                        dataIndex: "received_at",
                                        width: 160,
                                        render: (value) => formatMoscow(value),
                                    },
                                    {
                                        title: "Отправитель",
                                        dataIndex: "sender_email",
                                        width: 220,
                                        render: (_, row) => (
                                            <div>
                                                <div>{row?.sender_email || "—"}</div>
                                                {(row?.account_email || row?.account_name) && (
                                                    <Text type="secondary">
                                                        Ящик: {
                                                            row?.account_name
                                                                ? `${row.account_name} (${row.account_email || "—"})`
                                                                : row?.account_email
                                                        }
                                                    </Text>
                                                )}
                                                {(row?.source_folder || row?.source_message_uid) && (
                                                    <div>
                                                        <Text type="secondary">
                                                            {[
                                                                row?.source_folder
                                                                    ? `папка: ${row.source_folder}`
                                                                    : null,
                                                                row?.source_message_uid
                                                                    ? `UID: ${row.source_message_uid}`
                                                                    : null,
                                                            ].filter(Boolean).join(", ")}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: "Тема (как прочитана)",
                                        dataIndex: "subject",
                                        width: 320,
                                        render: (_, row) => (
                                            <div>
                                                <div>{row?.subject || "—"}</div>
                                                {row?.subject_raw && row?.subject_raw !== row?.subject && (
                                                    <Text type="secondary">
                                                        raw: {row.subject_raw}
                                                    </Text>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: "Ошибка",
                                        dataIndex: "import_error_details",
                                        render: (_, row) => (
                                            <div>
                                                <div>
                                                    {row?.import_error_details
                                                        || "Не удалось обработать по текущим настройкам"}
                                                </div>
                                                {(row?.import_error_reasons || []).length > 0 && (
                                                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                                        {(row.import_error_reasons || []).map((item, idx) => (
                                                            <li key={`${row.id}_reason_${idx}`}>{item}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                                {(row?.config_expectations || []).length > 0 && (
                                                    <div style={{ marginTop: 6 }}>
                                                        <Text type="secondary">Ожидалось по конфигу:</Text>
                                                        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                                                            {(row.config_expectations || []).map((item, idx) => (
                                                                <li key={`${row.id}_expect_${idx}`}>
                                                                    <Text type="secondary">{item}</Text>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {(row?.manager_hints || []).length > 0 && (
                                                    <div style={{ marginTop: 6 }}>
                                                        <Text type="secondary">Что проверить:</Text>
                                                        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                                                            {(row.manager_hints || []).map((item, idx) => (
                                                                <li key={`${row.id}_hint_${idx}`}>
                                                                    <Text type="secondary">{item}</Text>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {row?.body_preview && (
                                                    <div style={{ marginTop: 6 }}>
                                                        <Text type="secondary">
                                                            Текст письма (фрагмент): {row.body_preview}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: "Вложения",
                                        dataIndex: "attachment_filenames",
                                        width: 220,
                                        render: (_, row) => {
                                            const details = row?.attachment_details || [];
                                            if (details.length > 0) {
                                                return (
                                                    <div>
                                                        {details.map((item, idx) => (
                                                            <div key={`${row.id}_att_${idx}`}>{item}</div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            return (row?.attachment_filenames || []).join(", ");
                                        },
                                    },
                                ]}
                            />
                        </>
                    )}

                    {editingResponseConfig?.id && (
                        <>
                            <Divider>Реестр обработанных писем</Divider>
                            <Alert
                                type="info"
                                showIcon
                                style={{ marginBottom: 10 }}
                                message={(
                                    "Здесь видны все письма, которые уже "
                                    + "обрабатывались по этой конфигурации. "
                                    + "Можно вручную поправить тип письма "
                                    + "и запустить повторную обработку."
                                )}
                            />
                            <Space style={{ marginBottom: 10 }} wrap>
                                <Button
                                    onClick={() => loadResponseMessages(editingResponseConfig.id)}
                                    loading={responseMessagesLoading}
                                >
                                    Обновить реестр писем
                                </Button>
                            </Space>
                            <Table
                                size="small"
                                rowKey="id"
                                loading={responseMessagesLoading}
                                dataSource={responseMessages}
                                pagination={{ pageSize: 8 }}
                                scroll={{ x: 980 }}
                                locale={{
                                    emptyText: "Писем в реестре пока нет",
                                }}
                                columns={[
                                    {
                                        title: "Дата",
                                        dataIndex: "received_at",
                                        width: 160,
                                        render: (value) => formatMoscow(value),
                                    },
                                    {
                                        title: "Письмо",
                                        dataIndex: "subject",
                                        render: (_, row) => (
                                            <div>
                                                <div><b>{row?.sender_email || "—"}</b></div>
                                                <div>{row?.subject || "—"}</div>
                                                {row?.subject_raw && row?.subject_raw !== row?.subject && (
                                                    <Text type="secondary">raw: {row.subject_raw}</Text>
                                                )}
                                                {(row?.account_email || row?.account_name) && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Ящик: {
                                                                row?.account_name
                                                                    ? `${row.account_name} (${row.account_email || "—"})`
                                                                    : row?.account_email
                                                            }
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: "Классификация",
                                        dataIndex: "message_type",
                                        width: 280,
                                        render: (_, row) => (
                                            <div>
                                                <Tag color={supplierResponseMessageTypeColor(row?.message_type)}>
                                                    {supplierResponseMessageTypeLabel(row?.message_type)}
                                                </Tag>
                                                {row?.suggested_message_type && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Подсказка: {supplierResponseMessageTypeLabel(row.suggested_message_type)}
                                                        </Text>
                                                    </div>
                                                )}
                                                {row?.suggested_source && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Источник подсказки: {
                                                                row.suggested_source === "ai"
                                                                    ? "AI"
                                                                    : "Правила"
                                                            }
                                                        </Text>
                                                    </div>
                                                )}
                                                {formatSuggestionConfidence(row?.suggested_confidence) && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Уверенность: {formatSuggestionConfidence(row?.suggested_confidence)}
                                                        </Text>
                                                    </div>
                                                )}
                                                {row?.suggested_explanation && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Почему: {row.suggested_explanation}
                                                        </Text>
                                                    </div>
                                                )}
                                                {row?.import_error_details && (
                                                    <div>
                                                        <Text type="secondary">
                                                            Ошибка: {row.import_error_details}
                                                        </Text>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: "Вложения",
                                        dataIndex: "attachment_details",
                                        width: 260,
                                        render: (_, row) => (
                                            (row?.attachment_details || []).length > 0
                                                ? (
                                                    <div>
                                                        {(row.attachment_details || []).map((item, idx) => (
                                                            <div key={`${row.id}_msg_att_${idx}`}>{item}</div>
                                                        ))}
                                                    </div>
                                                )
                                                : "—"
                                        ),
                                    },
                                    {
                                        title: "Действия",
                                        key: "actions",
                                        width: 280,
                                        render: (_, row) => (
                                            <Space direction="vertical" size={6}>
                                                <Select
                                                    size="small"
                                                    style={{ width: 250 }}
                                                    value={row?.message_type || "UNKNOWN"}
                                                    options={supplierResponseMessageTypeOptions}
                                                    loading={!!responseMessageActionLoadingById[row.id]}
                                                    onChange={(value) => (
                                                        handleClassifyResponseMessage(row.id, value)
                                                    )}
                                                />
                                                <Button
                                                    size="small"
                                                    loading={!!responseMessageActionLoadingById[row.id]}
                                                    onClick={() => handleRetryResponseMessage(row.id)}
                                                    disabled={!row?.can_retry}
                                                >
                                                    Перепроверить это письмо
                                                </Button>
                                            </Space>
                                        ),
                                    },
                                ]}
                            />
                        </>
                    )}

                    <Form.Item>
                        <Space wrap>
                            <Button
                                onClick={() => (
                                    editingResponseConfig?.id
                                        ? handleCheckResponseConfigNow(
                                            editingResponseConfig.id
                                        )
                                        : message.info(
                                            "Сначала сохраните конфигурацию, затем выполните проверку."
                                        )
                                )}
                                loading={
                                    checkingResponseConfigId
                                    === editingResponseConfig?.id
                                }
                            >
                                Проверить почту сейчас
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={responseConfigSaving}
                            >
                                {editingResponseConfig ? "Сохранить" : "Создать"}
                            </Button>
                            <Button
                                onClick={() => {
                                    setResponseConfigModalVisible(false);
                                    setEditingResponseConfig(null);
                                    responseConfigForm.resetFields();
                                    setResponseImportErrors([]);
                                    setResponseMessages([]);
                                    setResponseMessageActionLoadingById({});
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Редактирование источника клиентского прайса"
                open={sourceUsageModalVisible}
                onCancel={() => {
                    setSourceUsageModalVisible(false);
                    setEditingSourceUsage(null);
                    sourceUsageForm.resetFields();
                }}
                footer={null}
                destroyOnClose
                width={760}
            >
                <Form
                    form={sourceUsageForm}
                    layout="vertical"
                    onFinish={handleSourceUsageSubmit}
                >
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message={
                            editingSourceUsage
                                ? (
                                    `${
                                        editingSourceUsage.customer_name
                                        || `Клиент #${editingSourceUsage.customer_id}`
                                    } / ${
                                        editingSourceUsage.customer_config_name
                                        || (
                                            `Конфиг клиента `
                                            + `#${editingSourceUsage.customer_config_id}`
                                        )
                                    } / ${
                                        editingSourceUsage.provider_config_name
                                        || (
                                            `Конфиг поставщика `
                                            + `#${editingSourceUsage.provider_config_id}`
                                        )
                                    }`
                                )
                                : "Редактирование источника"
                        }
                    />

                    <div className="responsive-form-grid-2">
                        <Form.Item
                            name="markup"
                            label="Наценка"
                            rules={[
                                {
                                    required: true,
                                    message: "Укажите наценку",
                                },
                            ]}
                        >
                            <InputNumber
                                min={0.001}
                                step={0.001}
                                style={{ width: "100%" }}
                            />
                        </Form.Item>
                        <Form.Item
                            name="enabled"
                            label="Включено"
                            valuePropName="checked"
                        >
                            <Switch />
                        </Form.Item>
                        <Form.Item name="min_price" label="Мин. цена">
                            <InputNumber min={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="max_price" label="Макс. цена">
                            <InputNumber min={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="min_quantity" label="Мин. количество">
                            <InputNumber min={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item name="max_quantity" label="Макс. количество">
                            <InputNumber min={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Divider>Фильтр брендов</Divider>
                    <div className="responsive-form-grid-2">
                        <Form.Item name="brand_filter_type" label="Тип">
                            <Select
                                allowClear
                                options={[
                                    { value: "include", label: "Только" },
                                    { value: "exclude", label: "Исключить" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item
                            name="brand_ids_text"
                            label="ID брендов (через запятую)"
                        >
                            <Input placeholder="Например: 12, 45, 90" />
                        </Form.Item>
                    </div>

                    <Divider>Фильтр позиций</Divider>
                    <div className="responsive-form-grid-2">
                        <Form.Item name="position_filter_type" label="Тип">
                            <Select
                                allowClear
                                options={[
                                    { value: "include", label: "Только" },
                                    { value: "exclude", label: "Исключить" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item
                            name="position_ids_text"
                            label="ID позиций (через запятую)"
                        >
                            <Input placeholder="Например: 101, 102, 103" />
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="brand_markups_text"
                        label="Наценка по брендам"
                        extra="Формат: BRAND=10, BRAND2=40 (допустимы разделители = или :)"
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="Например: TOYOTA=10, LEXUS=10, GEELY=40"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Space wrap>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={sourceUsageSaving}
                            >
                                Сохранить
                            </Button>
                            <Button
                                onClick={() => {
                                    setSourceUsageModalVisible(false);
                                    setEditingSourceUsage(null);
                                    sourceUsageForm.resetFields();
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
