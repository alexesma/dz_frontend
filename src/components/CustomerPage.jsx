import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Alert,
    Card,
    Collapse,
    Form,
    Input,
    Button,
    message,
    Spin,
    Space,
    Select,
    Table,
    Modal,
    InputNumber,
    Popconfirm,
    Divider,
    Tag,
    Switch,
    Typography,
} from 'antd';
import {
    SaveOutlined, ArrowLeftOutlined, PlusOutlined,
    EditOutlined, DeleteOutlined, SendOutlined, SettingOutlined
} from '@ant-design/icons';

const { Text } = Typography;
import {
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerPricelistConfigs,
    createCustomerPricelistConfig,
    updateCustomerPricelistConfig,
    deleteCustomerPricelistConfig,
    getCustomerPricelistSources,
    createCustomerPricelistSource,
    updateCustomerPricelistSource,
    deleteCustomerPricelistSource,
    sendCustomerPricelistNow,
    getCustomerOrderConfigs,
    createCustomerOrderConfig,
    updateCustomerOrderConfig,
    deleteCustomerOrderConfig,
} from '../api/customers';
import { getProviderConfigOptions } from '../api/providers';
import { getEmailAccounts } from '../api/emailAccounts';
import { testEmailAccount } from '../api/emailAccounts';
import { getBrands, lookupBrands } from '../api/brands';
import { searchAutopartsByOem } from '../api/autoparts';
import {
    processCustomerOrderConfigNow,
    retryCustomerOrderErrorsForConfig,
} from '../api/customerOrders';

const CustomerPage = () => {
    const { customerId: customerIdParam } = useParams();
    const navigate = useNavigate();

    const isNew = !customerIdParam || customerIdParam.toLowerCase() === 'create';
    const customerId = !isNew ? Number(customerIdParam) : null;

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [customerData, setCustomerData] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [loadVersion, setLoadVersion] = useState(0);

    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);
    const [sourcesModalVisible, setSourcesModalVisible] = useState(false);
    const [activeConfig, setActiveConfig] = useState(null);
    const [sources, setSources] = useState([]);
    const [sourcesLoading, setSourcesLoading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [providerOptions, setProviderOptions] = useState([]);
    const [supplierFilterProviders, setSupplierFilterProviders] = useState([]);
    const [editingSource, setEditingSource] = useState(null);
    const [orderConfig, setOrderConfig] = useState(null);
    const [orderConfigs, setOrderConfigs] = useState([]);
    const [selectedPriceConfigId, setSelectedPriceConfigId] = useState(null);
    const [orderConfigLoading, setOrderConfigLoading] = useState(false);
    const [orderInboxAccounts, setOrderInboxAccounts] = useState([]);
    const [priceOutAccounts, setPriceOutAccounts] = useState([]);
    const [brandFilterOptions, setBrandFilterOptions] = useState([]);
    const [markupBrandOptions, setMarkupBrandOptions] = useState([]);
    const [markupBrandLoading, setMarkupBrandLoading] = useState(false);
    const [brandFilterLoading, setBrandFilterLoading] = useState(false);
    const [autopartFilterOptions, setAutopartFilterOptions] = useState([]);
    const [autopartFilterLoading, setAutopartFilterLoading] = useState(false);
    const [orderInboxLoading, setOrderInboxLoading] = useState(false);
    const [orderInboxTestLoading, setOrderInboxTestLoading] = useState(false);
    const [orderProcessNowLoading, setOrderProcessNowLoading] = useState(false);
    const [orderRetryErrorsLoading, setOrderRetryErrorsLoading] = useState(false);
    const autopartSearchRequestRef = useRef(0);
    const autopartSearchTimerRef = useRef(null);

    const [customerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [sourceForm] = Form.useForm();
    const [orderConfigForm] = Form.useForm();

    const extractApiError = useCallback((err, fallback) => {
        const detail = err?.response?.data?.detail;
        if (Array.isArray(detail)) {
            return detail
                .map((item) => item?.msg || item?.message || JSON.stringify(item))
                .filter(Boolean)
                .join('; ') || fallback;
        }
        if (typeof detail === 'string' && detail.trim()) {
            return detail;
        }
        return err?.message || fallback;
    }, []);

    const normalizeSourceMarkup = useCallback((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 1.0;
        }
        return numeric;
    }, []);

    const formatSourceMarkup = useCallback((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return '1.0 (без изменения)';
        }
        if (numeric === 1) {
            return '1.0 (без изменения)';
        }
        return String(value);
    }, []);

    const parseBrandMarkupsFromRows = useCallback((rows) => {
        const result = {};
        (rows || []).forEach((row) => {
            const brand = String(row?.brand || '').trim().toUpperCase();
            const numeric = Number(String(row?.markup ?? '').replace(',', '.'));
            if (!brand || !Number.isFinite(numeric) || numeric <= 0) return;
            result[brand] = numeric;
        });
        return result;
    }, []);

    const formatBrandMarkupsToRows = useCallback((value) => {
        return Object.entries(value || {})
            .map(([brand, markup]) => {
                const numeric = Number(markup);
                if (!Number.isFinite(numeric) || numeric <= 0) return null;
                return {
                    brand: String(brand || '').trim().toUpperCase(),
                    markup: numeric,
                };
            })
            .filter((item) => item?.brand);
    }, []);

    const mapBrandLookupOptions = useCallback((brands = []) => (
        (brands || []).map((brand) => ({
            value: String(brand.id),
            label: `${brand.name} (ID: ${brand.id})`,
        }))
    ), []);

    const mapMarkupBrandOptions = useCallback((brands = []) => {
        const prepared = (brands || [])
            .filter((brand) => brand?.name)
            .map((brand) => ({
                value: String(brand.name).toUpperCase(),
                label: brand.name,
                main_brand: Boolean(brand.main_brand),
            }));
        const hasMainBrands = prepared.some((item) => item.main_brand);
        return prepared
            .filter((item) => (hasMainBrands ? item.main_brand : true))
            .map(({ value, label }) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    }, []);

    const mergeOptionsByValue = useCallback((current = [], incoming = []) => {
        const merged = new Map();
        [...current, ...incoming].forEach((option) => {
            if (!option?.value) return;
            merged.set(String(option.value), {
                value: String(option.value),
                label: option.label,
            });
        });
        return Array.from(merged.values());
    }, []);

    const collectFilterBrandIds = useCallback((filters = {}) => (
        (filters?.brand_filters?.brands || []).map((value) => String(value))
    ), []);

    const collectConfigBrandIds = useCallback((config = {}) => {
        const ids = new Set();
        [
            config?.default_filters,
            config?.own_filters,
            config?.other_filters,
            ...Object.values(config?.supplier_filters || {}),
        ].forEach((filters) => {
            collectFilterBrandIds(filters).forEach((value) => ids.add(value));
        });
        return Array.from(ids);
    }, [collectFilterBrandIds]);

    const ensureBrandFilterOptionsByIds = useCallback(async (ids = []) => {
        const normalizedIds = Array.from(
            new Set((ids || []).map((value) => String(value || '').trim()).filter(Boolean))
        );
        if (!normalizedIds.length) return;
        try {
            const { data } = await lookupBrands('', normalizedIds.length, normalizedIds);
            const options = mapBrandLookupOptions(data || []);
            setBrandFilterOptions((prev) => mergeOptionsByValue(prev, options));
        } catch (err) {
            console.error('Load brand labels by ids failed:', err);
        }
    }, [mapBrandLookupOptions, mergeOptionsByValue]);

    const sourceProviderOptions = useMemo(() => {
        const usedProviderConfigIds = new Set(
            (sources || [])
                .filter((source) => !editingSource || source.id !== editingSource.id)
                .map((source) => Number(source.provider_config_id))
                .filter((value) => Number.isFinite(value))
        );
        return providerOptions.map((opt) => {
            const label = `${opt.provider_name} • ${opt.name_price || `Конфиг #${opt.id}`}${opt.is_own_price ? ' (Наш)' : ''}`;
            const isUsed = usedProviderConfigIds.has(Number(opt.id));
            return {
                value: opt.id,
                label: isUsed ? `${label} — уже добавлен` : label,
                disabled: isUsed,
            };
        });
    }, [editingSource, providerOptions, sources]);

    const applyOrderConfigToForm = useCallback((config) => {
        if (config) {
            const mergedOrderEmails = Array.from(
                new Set(
                    [...(config.order_emails || []), config.order_email]
                        .filter((value) => value)
                        .map((value) => String(value).trim())
                        .filter((value) => value)
                )
            );
            orderConfigForm.setFieldsValue({
                ...config,
                order_emails: mergedOrderEmails.join(', '),
                order_reply_emails: (config.order_reply_emails || []).join(', '),
            });
        } else {
            orderConfigForm.resetFields();
            orderConfigForm.setFieldsValue({
                order_start_row: 1,
                ship_mode: 'REPLACE_QTY',
                price_tolerance_pct: 2,
                price_warning_pct: 5,
                is_active: true,
            });
        }
    }, [orderConfigForm]);

    const refreshOrderConfigs = useCallback(async (priceConfigId = selectedPriceConfigId) => {
        if (!customerId) {
            setOrderConfigs([]);
            setOrderConfig(null);
            applyOrderConfigToForm(null);
            return [];
        }
        const orderResp = await getCustomerOrderConfigs(customerId);
        const configs = orderResp.data || [];
        setOrderConfigs(configs);
        const activeConfig = configs.find(
            (cfg) => cfg.pricelist_config_id === priceConfigId
        );
        setOrderConfig(activeConfig || null);
        applyOrderConfigToForm(activeConfig || null);
        return configs;
    }, [applyOrderConfigToForm, customerId, selectedPriceConfigId]);


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

    useEffect(() => {
        let mounted = true;
        const loadAccounts = async () => {
            setOrderInboxLoading(true);
            try {
                const { data } = await getEmailAccounts();
                const orderInFiltered = (data || []).filter((account) => {
                    if (!account?.is_active) return false;
                    return (account.purposes || []).includes('orders_in');
                });
                const priceOutFiltered = (data || []).filter((account) => {
                    if (!account?.is_active) return false;
                    const purposes = account.purposes || [];
                    return (
                        purposes.includes('prices_out') ||
                        purposes.includes('orders_out') ||
                        purposes.includes('orders_in')
                    );
                });
                if (mounted) {
                    setOrderInboxAccounts(orderInFiltered);
                    setPriceOutAccounts(priceOutFiltered);
                }
            } catch (err) {
                console.error('Load email accounts failed:', err);
            } finally {
                if (mounted) {
                    setOrderInboxLoading(false);
                }
            }
        };
        loadAccounts();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadBrands = async () => {
            setMarkupBrandLoading(true);
            setBrandFilterLoading(true);
            try {
                const { data } = await getBrands();
                if (!mounted) return;
                const brands = data || [];
                setMarkupBrandOptions(mapMarkupBrandOptions(brands));
                setBrandFilterOptions(mapBrandLookupOptions(brands));
            } catch (err) {
                console.error('Load brand options failed:', err);
            } finally {
                if (mounted) {
                    setMarkupBrandLoading(false);
                    setBrandFilterLoading(false);
                }
            }
        };
        loadBrands();
        return () => {
            mounted = false;
        };
    }, [mapBrandLookupOptions, mapMarkupBrandOptions]);

    const brandSelectFilterOption = useCallback((input, option) => {
        const normalizedInput = String(input || '').trim().toLowerCase();
        const normalizedLabel = String(option?.label || '').toLowerCase();
        return normalizedLabel.includes(normalizedInput);
    }, []);

    const handleAutopartFilterSearch = useCallback((rawValue) => {
        const value = String(rawValue || '').trim();
        if (autopartSearchTimerRef.current) {
            clearTimeout(autopartSearchTimerRef.current);
        }
        if (!value || value.length < 2) {
            setAutopartFilterOptions([]);
            setAutopartFilterLoading(false);
            return;
        }
        autopartSearchTimerRef.current = setTimeout(async () => {
            const requestId = autopartSearchRequestRef.current + 1;
            autopartSearchRequestRef.current = requestId;
            setAutopartFilterLoading(true);
            try {
                const { data } = await searchAutopartsByOem(value, 50);
                if (autopartSearchRequestRef.current !== requestId) return;
                const options = (data || []).map((item) => ({
                    value: String(item.id),
                    label: `${item.oem_number} • ${item.brand} • ${item.name || 'Без названия'}`,
                }));
                setAutopartFilterOptions(options);
            } catch (err) {
                if (autopartSearchRequestRef.current !== requestId) return;
                console.error('Autopart lookup failed:', err);
            } finally {
                if (autopartSearchRequestRef.current === requestId) {
                    setAutopartFilterLoading(false);
                }
            }
        }, 250);
    }, []);

    useEffect(() => {
        return () => {
            if (autopartSearchTimerRef.current) {
                clearTimeout(autopartSearchTimerRef.current);
            }
        };
    }, []);

    const formatSchedule = (cfg) => {
        const days = (cfg.schedule_days || [])
            .map((d) => dayOptions.find((opt) => opt.value === d)?.label || d)
            .join(', ');
        const times = (cfg.schedule_times || []).join(', ');
        if (!days && !times) return '—';
        if (days && times) return `${days} • ${times}`;
        return days || times;
    };

    const buildFilterPayload = (group = {}) => {
        const payload = {};
        const minPrice = group.min_price;
        const maxPrice = group.max_price;
        const minQty = group.min_quantity;
        const maxQty = group.max_quantity;

        if (minPrice !== undefined && minPrice !== null && minPrice !== '') {
            payload.min_price = Number(minPrice);
        }
        if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') {
            payload.max_price = Number(maxPrice);
        }
        if (minQty !== undefined && minQty !== null && minQty !== '') {
            payload.min_quantity = Number(minQty);
        }
        if (maxQty !== undefined && maxQty !== null && maxQty !== '') {
            payload.max_quantity = Number(maxQty);
        }

        if (group.brand_filter_type && (group.brand_ids || []).length) {
            payload.brand_filters = {
                type: group.brand_filter_type,
                brands: toIntList(group.brand_ids),
            };
        }
        if (group.position_filter_type && (group.position_ids || []).length) {
            payload.position_filters = {
                type: group.position_filter_type,
                autoparts: toIntList(group.position_ids),
            };
        }

        if (group.price_intervals && group.price_intervals.length) {
            payload.price_intervals = group.price_intervals
                .filter(
                    (item) =>
                        item &&
                        item.min_price !== undefined &&
                        item.max_price !== undefined &&
                        item.coefficient !== undefined
                )
                .map((item) => ({
                    min_price: Number(item.min_price),
                    max_price: Number(item.max_price),
                    coefficient: Number(item.coefficient),
                }));
        }

        if (group.supplier_quantity_filters && group.supplier_quantity_filters.length) {
            payload.supplier_quantity_filters = group.supplier_quantity_filters
                .filter(
                    (item) =>
                        item &&
                        item.provider_id &&
                        item.min_quantity !== undefined &&
                        item.max_quantity !== undefined
                )
                .map((item) => ({
                    provider_id: Number(item.provider_id),
                    min_quantity: Number(item.min_quantity),
                    max_quantity: Number(item.max_quantity),
                }));
        }

        return payload;
    };

    const mapFilterToForm = (filters = {}) => {
        const brandFilters = filters.brand_filters || {};
        const positionFilters = filters.position_filters || {};
        return {
            min_price: filters.min_price ?? null,
            max_price: filters.max_price ?? null,
            min_quantity: filters.min_quantity ?? null,
            max_quantity: filters.max_quantity ?? null,
            brand_filter_type: brandFilters.type,
            brand_ids: (brandFilters.brands || []).map((v) => String(v)),
            position_filter_type: positionFilters.type,
            position_ids: (positionFilters.autoparts || []).map((v) => String(v)),
            price_intervals: filters.price_intervals || [],
            supplier_quantity_filters: filters.supplier_quantity_filters || [],
        };
    };

    const buildSupplierFilters = (list = []) => {
        const mapping = {};
        (list || []).forEach((item) => {
            if (!item?.provider_id) return;
            const { provider_id, ...rest } = item;
            mapping[String(provider_id)] = buildFilterPayload(rest);
        });
        return mapping;
    };

    const renderFilterFields = (namePrefix, options = {}) => {
        const showSupplierQty = options.showSupplierQty ?? true;
        return (
            <>
                <div className="responsive-form-grid-4">
                    <Form.Item name={[...namePrefix, 'min_price']} label="Мин. цена">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={[...namePrefix, 'max_price']} label="Макс. цена">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={[...namePrefix, 'min_quantity']} label="Мин. количество">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={[...namePrefix, 'max_quantity']} label="Макс. количество">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                    </Form.Item>
                </div>

                <Divider>Фильтры по брендам</Divider>
                <div className="responsive-form-grid-key">
                    <Form.Item name={[...namePrefix, 'brand_filter_type']} label="Тип">
                        <Select
                            allowClear
                            options={[
                                { value: 'include', label: 'Только' },
                                { value: 'exclude', label: 'Исключить' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name={[...namePrefix, 'brand_ids']}
                        label="Бренды"
                        extra="Начните вводить название бренда"
                    >
                        <Select
                            mode="multiple"
                            showSearch
                            optionFilterProp="label"
                            filterOption={brandSelectFilterOption}
                            notFoundContent={
                                brandFilterLoading ? <Spin size="small" /> : null
                            }
                            placeholder="Например: TOYOTA"
                            options={brandFilterOptions}
                        />
                    </Form.Item>
                </div>

                <Divider>Фильтры по позициям</Divider>
                <div className="responsive-form-grid-key">
                    <Form.Item name={[...namePrefix, 'position_filter_type']} label="Тип">
                        <Select
                            allowClear
                            options={[
                                { value: 'include', label: 'Только' },
                                { value: 'exclude', label: 'Исключить' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name={[...namePrefix, 'position_ids']}
                        label="Позиции (артикул)"
                        extra="Поиск по артикулу OEM. В подсказке: артикул • бренд • наименование"
                    >
                        <Select
                            mode="multiple"
                            showSearch
                            filterOption={false}
                            onSearch={handleAutopartFilterSearch}
                            notFoundContent={
                                autopartFilterLoading ? <Spin size="small" /> : null
                            }
                            placeholder="Например: 90915YZZN2"
                            options={autopartFilterOptions}
                        />
                    </Form.Item>
                </div>

                <Divider>Интервалы цен</Divider>
                <Form.List name={[...namePrefix, 'price_intervals']}>
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map((field) => (
                                <div
                                    key={field.key}
                                    className="responsive-inline-grid"
                                    style={{ marginBottom: 12 }}
                                >
                                    <Form.Item name={[field.name, 'min_price']} label="От">
                                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name={[field.name, 'max_price']} label="До">
                                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name={[field.name, 'coefficient']} label="Коэф.">
                                        <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Button danger onClick={() => remove(field.name)}>
                                        Удалить
                                    </Button>
                                </div>
                            ))}
                            <Button onClick={() => add()} type="dashed">
                                Добавить интервал
                            </Button>
                        </>
                    )}
                </Form.List>

                {showSupplierQty && (
                    <>
                        <Divider>Фильтры по количеству у поставщиков</Divider>
                        <Form.List name={[...namePrefix, 'supplier_quantity_filters']}>
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map((field) => (
                                        <div
                                            key={field.key}
                                            className="responsive-inline-grid"
                                            style={{ marginBottom: 12 }}
                                        >
                                            <Form.Item name={[field.name, 'provider_id']} label="Поставщик">
                                                <Select
                                                    showSearch
                                                    optionFilterProp="label"
                                                    options={supplierFilterProviders.map((provider) => ({
                                                        value: provider.id,
                                                        label: provider.name,
                                                    }))}
                                                />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'min_quantity']} label="Мин. кол-во">
                                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Form.Item name={[field.name, 'max_quantity']} label="Макс. кол-во">
                                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Button danger onClick={() => remove(field.name)}>
                                                Удалить
                                            </Button>
                                        </div>
                                    ))}
                                    <Button onClick={() => add()} type="dashed">
                                        Добавить фильтр поставщика
                                    </Button>
                                </>
                            )}
                        </Form.List>
                    </>
                )}
            </>
        );
    };

    const toIntList = (values) =>
        (values || [])
            .map((v) => Number.parseInt(v, 10))
            .filter((v) => Number.isFinite(v));

    // Загрузка данных клиента
    useEffect(() => {
        if (isNew) {
            customerForm.resetFields();
            setCustomerData(null);
            setLoadError('');
            setLoading(false);
            return;
        }

        if (!customerId || Number.isNaN(customerId)) {
            message.error('Некорректный идентификатор клиента');
            navigate('/customers');
            return;
        }

        (async () => {
            setLoading(true);
            setLoadError('');
            try {
                const { data: customer } = await getCustomerById(customerId);
                const { data: configs } = await getCustomerPricelistConfigs(customerId);
                let orderCfgs = [];
                try {
                    const orderResp = await getCustomerOrderConfigs(customerId);
                    orderCfgs = orderResp.data || [];
                } catch {
                    orderCfgs = [];
                }

                setCustomerData({
                    customer,
                    pricelist_configs: configs,
                });
                setOrderConfigs(orderCfgs);

                customerForm.setFieldsValue({
                    name: customer.name,
                    email_contact: customer.email_contact,
                    email_outgoing_price: customer.email_outgoing_price,
                    type_prices: customer.type_prices,
                    description: customer.description,
                    comment: customer.comment,
                });
            } catch (err) {
                const detail = extractApiError(
                    err,
                    'Не удалось загрузить клиента',
                );
                console.error(
                    `Failed to load customer ${customerId} edit page:`,
                    err,
                );
                setCustomerData(null);
                setOrderConfigs([]);
                setLoadError(detail);
                message.error(detail);
            } finally {
                setLoading(false);
            }
        })();
    }, [
        applyOrderConfigToForm,
        customerForm,
        customerId,
        extractApiError,
        isNew,
        loadVersion,
        navigate,
        orderConfigForm,
    ]);

    useEffect(() => {
        if (!selectedPriceConfigId) {
            setOrderConfig(null);
            applyOrderConfigToForm(null);
            return;
        }
        const activeConfig = orderConfigs.find(
            (cfg) => cfg.pricelist_config_id === selectedPriceConfigId
        );
        setOrderConfig(activeConfig || null);
        applyOrderConfigToForm(activeConfig || null);
    }, [selectedPriceConfigId, orderConfigs, applyOrderConfigToForm]);

    // Сохранение клиента
    const handleCustomerSubmit = async (values) => {
        setSaving(true);
        try {
            if (isNew) {
                const { data } = await createCustomer(values);
                message.success('Клиент успешно создан');
                navigate(`/customers/${data.id}/edit`);
            } else {
                await updateCustomer(customerId, values);
                message.success('Данные клиента обновлены');

                // Обновляем данные на странице
                const { data: customer } = await getCustomerById(customerId);
                const { data: configs } = await getCustomerPricelistConfigs(customerId);
                setCustomerData({ customer, pricelist_configs: configs });
            }
        } catch (err) {
            console.error(err);
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Ошибка сохранения клиента');
        } finally {
            setSaving(false);
        }
    };

    // Удаление клиента
    const handleDeleteCustomer = async () => {
        if (!customerId) return;

        try {
            await deleteCustomer(customerId);
            message.success('Клиент удалён');
            navigate('/customers');
        } catch (err) {
            message.error(err?.message || 'Ошибка удаления клиента');
        }
    };

    const handleOrderConfigSubmit = async (values) => {
        if (!customerId) return;
        if (!selectedPriceConfigId) {
            message.warning('Выберите конфигурацию прайса');
            return;
        }
        setOrderConfigLoading(true);
        try {
            const payload = {
                ...values,
                customer_id: customerId,
                pricelist_config_id: selectedPriceConfigId,
                order_email: null,
                order_emails: (values.order_emails || '')
                    .split(',')
                    .map((v) => v.trim())
                    .filter((v) => v),
                order_reply_emails: (values.order_reply_emails || '')
                    .split(',')
                    .map((v) => v.trim())
                    .filter((v) => v),
            };
            if (orderConfig) {
                await updateCustomerOrderConfig(orderConfig.id, payload);
                message.success('Конфигурация заказов обновлена');
            } else {
                await createCustomerOrderConfig(payload);
                message.success('Конфигурация заказов создана');
            }
            await refreshOrderConfigs(selectedPriceConfigId);
        } catch (error) {
            console.error(error);
            const detail = error?.response?.data?.detail;
            message.error(
                Array.isArray(detail) ? detail.join('; ') : (
                    detail || 'Ошибка сохранения конфигурации заказов'
                )
            );
        } finally {
            setOrderConfigLoading(false);
        }
    };

    const handleOrderInboxTest = async () => {
        const accountId = orderConfigForm.getFieldValue('email_account_id');
        if (!accountId) {
            message.warning('Выберите почтовый ящик для проверки');
            return;
        }
        setOrderInboxTestLoading(true);
        try {
            const { data } = await testEmailAccount(accountId, {
                imap: true,
                smtp: false,
            });
            if (data.imap_ok) {
                message.success('IMAP доступ подтверждён');
            } else {
                Modal.error({
                    title: 'IMAP проверка не пройдена',
                    content: data.imap_error || 'Неизвестная ошибка',
                });
            }
        } catch (err) {
            console.error('IMAP test failed:', err);
            message.error('Не удалось проверить IMAP доступ');
        } finally {
            setOrderInboxTestLoading(false);
        }
    };

    const handleProcessOrderConfigNow = async () => {
        if (!orderConfig?.id) {
            message.warning('Сначала сохраните конфигурацию обработки заказов');
            return;
        }
        setOrderProcessNowLoading(true);
        try {
            await processCustomerOrderConfigNow(orderConfig.id);
            message.success('Проверка почты запущена');
            await refreshOrderConfigs(orderConfig.pricelist_config_id);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Не удалось запустить проверку почты');
        } finally {
            setOrderProcessNowLoading(false);
        }
    };

    const handleRetryOrderErrors = async () => {
        if (!orderConfig?.id) {
            message.warning('Сначала сохраните конфигурацию обработки заказов');
            return;
        }
        setOrderRetryErrorsLoading(true);
        try {
            const { data } = await retryCustomerOrderErrorsForConfig(
                orderConfig.id
            );
            const succeeded = data?.succeeded ?? 0;
            const failed = data?.failed ?? 0;
            message.success(
                `Перепроверка завершена: успешно ${succeeded}, с ошибкой ${failed}`
            );
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Не удалось перепроверить ошибки');
        } finally {
            setOrderRetryErrorsLoading(false);
        }
    };

    // Работа с конфигурациями
    const openConfigModal = async (config = null) => {
        setEditingConfig(config);
        const configId = config?.id || null;
        setSelectedPriceConfigId(configId);
        if (configId) {
            const linkedOrderConfig = orderConfigs.find(
                (cfg) => cfg.pricelist_config_id === configId
            );
            setOrderConfig(linkedOrderConfig || null);
            applyOrderConfigToForm(linkedOrderConfig || null);
        } else {
            setOrderConfig(null);
            applyOrderConfigToForm(null);
        }
        setSupplierFilterProviders([]);
        if (config) {
            try {
                const { data } = await getCustomerPricelistSources(
                    customerId,
                    config.id
                );
                const providerMap = new Map();
                (data || []).forEach((item) => {
                    if (item.provider_id) {
                        providerMap.set(
                            item.provider_id,
                            item.provider_name || `Поставщик ${item.provider_id}`
                        );
                    }
                });
                setSupplierFilterProviders(
                    Array.from(providerMap.entries()).map(([id, name]) => ({
                        id,
                        name,
                    }))
                );
            } catch {
                setSupplierFilterProviders([]);
            }

            const supplierFilters = config.supplier_filters || {};
            const supplierList = Object.entries(supplierFilters).map(
                ([providerId, filters]) => ({
                    provider_id: Number(providerId),
                    ...mapFilterToForm(filters || {}),
                })
            );
            await ensureBrandFilterOptionsByIds(collectConfigBrandIds(config));
            configForm.setFieldsValue({
                ...config,
                default_filters: mapFilterToForm(config.default_filters || {}),
                own_filters: mapFilterToForm(config.own_filters || {}),
                other_filters: mapFilterToForm(config.other_filters || {}),
                supplier_filters: supplierList,
            });
        } else {
            configForm.resetFields();
            configForm.setFieldsValue({ export_file_format: 'xlsx' });
        }
        setConfigModalVisible(true);
    };

    const handleConfigSubmit = async (values) => {
        if (!customerId) return;

        setConfigSaving(true);
        try {
            const payload = {
                ...values,
                default_filters: buildFilterPayload(values.default_filters),
                own_filters: buildFilterPayload(values.own_filters),
                other_filters: buildFilterPayload(values.other_filters),
                supplier_filters: buildSupplierFilters(values.supplier_filters),
            };

            if (editingConfig) {
                const { data: updatedConfig } = await updateCustomerPricelistConfig(
                    customerId,
                    editingConfig.id,
                    payload,
                );
                message.success('Конфигурация обновлена');
                setEditingConfig(updatedConfig || editingConfig);
                setSelectedPriceConfigId(updatedConfig?.id || editingConfig.id);
            } else {
                const { data: createdConfig } = await createCustomerPricelistConfig(
                    customerId,
                    payload,
                );
                message.success('Конфигурация создана. Настройте обработку заказов ниже.');
                setEditingConfig(createdConfig || null);
                setSelectedPriceConfigId(createdConfig?.id || null);
                if (createdConfig) {
                    await ensureBrandFilterOptionsByIds(collectConfigBrandIds(createdConfig));
                    configForm.setFieldsValue({
                        ...createdConfig,
                        default_filters: mapFilterToForm(createdConfig.default_filters || {}),
                        own_filters: mapFilterToForm(createdConfig.own_filters || {}),
                        other_filters: mapFilterToForm(createdConfig.other_filters || {}),
                        supplier_filters: Object.entries(createdConfig.supplier_filters || {}).map(
                            ([providerId, filters]) => ({
                                provider_id: Number(providerId),
                                ...mapFilterToForm(filters || {}),
                            })
                        ),
                    });
                }
            }

            // Обновляем данные
            const { data: configs } = await getCustomerPricelistConfigs(customerId);
            setCustomerData(prev => ({ ...prev, pricelist_configs: configs }));
        } catch (err) {
            console.error(err);
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Ошибка сохранения конфигурации');
        } finally {
            setConfigSaving(false);
        }
    };

    const handleDeleteConfig = async (configId) => {
        if (!customerId) return;

        try {
            await deleteCustomerPricelistConfig(customerId, configId);
            message.success('Конфигурация удалена');

            // Обновляем данные
            const { data: configs } = await getCustomerPricelistConfigs(customerId);
            setCustomerData(prev => ({ ...prev, pricelist_configs: configs }));
        } catch (err) {
            console.error(err);
            message.error('Ошибка удаления конфигурации');
        }
    };

    const openSourcesModal = async (config) => {
        if (!customerId) return;
        setActiveConfig(config);
        setSourcesModalVisible(true);
        setSourcesLoading(true);
        try {
            const [sourcesResp, providerResp] = await Promise.all([
                getCustomerPricelistSources(customerId, config.id),
                getProviderConfigOptions(),
            ]);
            setSources(sourcesResp.data || []);
            setProviderOptions(providerResp.data || []);
        } catch (err) {
            console.error(err);
            message.error('Ошибка загрузки источников');
        } finally {
            setSourcesLoading(false);
        }
    };

    const closeSourcesModal = () => {
        setSourcesModalVisible(false);
        setActiveConfig(null);
        setSources([]);
        setEditingSource(null);
        sourceForm.resetFields();
    };

    const handleSourceSubmit = async (values) => {
        if (!customerId || !activeConfig) return;

        const duplicate = (sources || []).find(
            (source) =>
                Number(source.provider_config_id) === Number(values.provider_config_id)
                && (!editingSource || source.id !== editingSource.id)
        );
        if (duplicate) {
            message.warning('Этот источник уже добавлен в прайс клиента');
            return;
        }

        const normalizeOptionalPositive = (value) => {
            if (value === null || value === undefined || value === '') return null;
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) return null;
            return numeric;
        };

        const payload = {
            provider_config_id: values.provider_config_id,
            enabled: values.enabled ?? true,
            markup: normalizeSourceMarkup(values.markup),
            brand_markups: parseBrandMarkupsFromRows(values.brand_markups),
            brand_filters: values.brand_filter_type
                ? {
                    type: values.brand_filter_type,
                    brands: toIntList(values.brand_ids),
                }
                : {},
            position_filters: values.position_filter_type
                ? {
                    type: values.position_filter_type,
                    autoparts: toIntList(values.position_ids),
                }
                : {},
            min_price: normalizeOptionalPositive(values.min_price),
            max_price: normalizeOptionalPositive(values.max_price),
            min_quantity: normalizeOptionalPositive(values.min_quantity),
            max_quantity: normalizeOptionalPositive(values.max_quantity),
            additional_filters: {
                DZ_EXPAND_BRANDS: !!values.dz_expand_brands,
            },
        };

        try {
            if (editingSource) {
                await updateCustomerPricelistSource(
                    customerId,
                    activeConfig.id,
                    editingSource.id,
                    payload
                );
                message.success('Источник обновлён');
            } else {
                await createCustomerPricelistSource(
                    customerId,
                    activeConfig.id,
                    payload
                );
                message.success('Источник добавлен');
            }
            const { data } = await getCustomerPricelistSources(
                customerId,
                activeConfig.id
            );
            setSources(data || []);
            setEditingSource(null);
            sourceForm.resetFields();
        } catch (err) {
            console.error(err);
            const detail = err?.response?.data?.detail;
            message.error(
                detail === 'This source is already added to the customer pricelist'
                    ? 'Этот источник уже добавлен в прайс клиента'
                    : 'Ошибка сохранения источника'
            );
        }
    };

    const handleEditSource = async (source) => {
        setEditingSource(source);
        await ensureBrandFilterOptionsByIds(source.brand_filters?.brands || []);
        const brandMarkupsRows = formatBrandMarkupsToRows(source.brand_markups || {});
        setMarkupBrandOptions((prev) => mergeOptionsByValue(
            prev,
            brandMarkupsRows.map((item) => ({
                value: item.brand,
                label: item.brand,
            }))
        ));
        sourceForm.setFieldsValue({
            provider_config_id: source.provider_config_id,
            enabled: source.enabled,
            markup: normalizeSourceMarkup(source.markup),
            brand_markups: brandMarkupsRows,
            brand_filter_type: source.brand_filters?.type || null,
            brand_ids: (source.brand_filters?.brands || []).map((v) => String(v)),
            position_filter_type: source.position_filters?.type || null,
            position_ids: (source.position_filters?.autoparts || []).map((v) => String(v)),
            min_price: source.min_price !== null && source.min_price !== undefined
                ? Number(source.min_price)
                : null,
            max_price: source.max_price !== null && source.max_price !== undefined
                ? Number(source.max_price)
                : null,
            min_quantity: source.min_quantity ?? null,
            max_quantity: source.max_quantity ?? null,
            dz_expand_brands: !!(source.additional_filters?.DZ_EXPAND_BRANDS),
        });
    };

    const handleDeleteSource = async (sourceId) => {
        if (!customerId || !activeConfig) return;
        try {
            await deleteCustomerPricelistSource(
                customerId,
                activeConfig.id,
                sourceId
            );
            message.success('Источник удалён');
            const { data } = await getCustomerPricelistSources(
                customerId,
                activeConfig.id
            );
            setSources(data || []);
        } catch (err) {
            console.error(err);
            message.error('Ошибка удаления источника');
        }
    };

    const handleSendNow = async (configId) => {
        if (!customerId) return;
        try {
            await sendCustomerPricelistNow(customerId, configId);
            message.success('Прайс отправлен');
        } catch (err) {
            console.error(err);
            message.error('Ошибка отправки прайса');
        }
    };


    // Колонки таблицы конфигураций
    const configColumns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Обработка заказов',
            key: 'orders',
            render: (_, record) => {
                const exists = orderConfigs.some(
                    (cfg) => cfg.pricelist_config_id === record.id
                );
                return (
                    <Tag color={exists ? 'green' : 'default'}>
                        {exists ? 'Настроена' : 'Нет'}
                    </Tag>
                );
            },
        },
        {
            title: 'Источники',
            key: 'sources',
            render: (_, record) => (
                <Tag color="blue">
                    {record.sources?.length ?? 0}
                </Tag>
            ),
        },
        {
            title: 'Расписание',
            key: 'schedule',
            render: (_, record) => (
                <span>{formatSchedule(record)}</span>
            ),
        },
        {
            title: 'Активна',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (enabled) => (
                <Tag color={enabled ? 'green' : 'default'}>
                    {enabled ? 'Да' : 'Нет'}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 220,
            render: (_, record) => (
                <Space size="small" wrap className="table-actions">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openConfigModal(record)}
                    />
                    <Button
                        type="default"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => openSourcesModal(record)}
                    />
                    <Button
                        type="primary"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={() => handleSendNow(record.id)}
                    />
                    <Popconfirm
                        title="Удалить конфигурацию?"
                        description="Удалить конфигурацию и связанные прайс-листы? Действие необратимо"
                        onConfirm={() => handleDeleteConfig(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button
                            type="primary"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!isNew && loadError) {
        return (
            <div className="page-shell">
                <div className="page-header-actions">
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/customers')}
                    >
                        Назад к списку
                    </Button>
                    <Button
                        type="primary"
                        onClick={() => setLoadVersion((prev) => prev + 1)}
                    >
                        Повторить загрузку
                    </Button>
                </div>

                <Card title={`Клиент #${customerId}`}>
                    <Alert
                        type="error"
                        showIcon
                        message="Не удалось открыть страницу клиента"
                        description={loadError}
                    />
                </Card>
            </div>
        );
    }

    return (
        <div className="page-shell">
            <div className="page-header-actions">
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate('/customers')}
                >
                    Назад к списку
                </Button>

                {!isNew && (
                    <Popconfirm
                        title="Удалить клиента?"
                        description="Это действие необратимо"
                        onConfirm={handleDeleteCustomer}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button danger>Удалить клиента</Button>
                    </Popconfirm>
                )}
            </div>

            <h2>
                {isNew
                    ? 'Создание клиента'
                    : `Клиент: ${customerData?.customer?.name ?? '...'}`}
            </h2>

            {/* Форма клиента */}
            <Card title="Основная информация" style={{ marginBottom: 20 }}>
                <Form
                    form={customerForm}
                    layout="vertical"
                    onFinish={handleCustomerSubmit}
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
                            customerForm.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                >
                    <Form.Item
                        name="name"
                        label="Название"
                        rules={[
                            { required: true, whitespace: true, message: 'Введите название клиента' },
                        ]}
                    >
                        <Input placeholder="Название клиента" />
                    </Form.Item>

                    <Form.Item
                        name="type_prices"
                        label="Тип цен"
                        rules={[{ required: true, message: 'Выберите тип цен' }]}
                    >
                        <Select
                            options={[
                                { value: 'Wholesale', label: 'Оптовые' },
                                { value: 'Retail', label: 'Розничные' },
                            ]}
                            placeholder="Выберите тип цен"
                        />
                    </Form.Item>

                    <Form.Item
                        name="email_contact"
                        label="Контактный Email"
                        rules={[{ type: 'email', message: 'Введите корректный email' }]}
                    >
                        <Input placeholder="contact@customer.com" />
                    </Form.Item>

                    <Form.Item
                        name="email_outgoing_price"
                        label="Email исходящих прайсов"
                        rules={[{ type: 'email', message: 'Введите корректный email' }]}
                    >
                        <Input placeholder="prices@customer.com" />
                    </Form.Item>

                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={3} placeholder="Описание клиента" />
                    </Form.Item>

                    <Form.Item name="comment" label="Комментарий">
                        <Input.TextArea rows={2} placeholder="Дополнительные комментарии" />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={saving}
                            icon={<SaveOutlined />}
                        >
                            {isNew ? 'Создать клиента' : 'Сохранить изменения'}
                        </Button>
                    </Form.Item>
                </Form>
            </Card>

            {/* Конфигурации прайс-листов */}
            {!isNew && customerData && (
                <Card
                    title="Конфигурации прайс-листов"
                    extra={
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => openConfigModal()}
                        >
                            Добавить конфигурацию
                        </Button>
                    }
                >
                    <Table
                        rowKey="id"
                        columns={configColumns}
                        dataSource={customerData.pricelist_configs || []}
                        pagination={false}
                        size="middle"
                        locale={{ emptyText: 'Конфигурации не настроены' }}
                        scroll={{ x: 'max-content' }}
                    />
                </Card>
            )}

            {/* Конфигурации заказов теперь редактируются внутри конфигурации прайса */}

            {/* Модалка конфигурации */}
            <Modal
                title={editingConfig ? 'Редактирование конфигурации' : 'Создание конфигурации'}
                open={configModalVisible}
                onCancel={() => {
                    setConfigModalVisible(false);
                    setEditingConfig(null);
                    configForm.resetFields();
                    setSelectedPriceConfigId(null);
                    setOrderConfig(null);
                    applyOrderConfigToForm(null);
                }}
                footer={null}
                width={700}
                destroyOnClose
            >
                <Form
                    form={configForm}
                    layout="vertical"
                    onFinish={handleConfigSubmit}
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
                            configForm.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                    initialValues={{
                        general_markup: 1.0,
                        own_price_list_markup: 1.0,
                        third_party_markup: 1.0,
                        export_file_format: 'xlsx',
                        schedule_days: [],
                        schedule_times: [],
                        emails: [],
                        is_active: true,
                    }}
                >
                    <Form.Item
                        name="name"
                        label="Название конфигурации"
                        rules={[{ required: true, message: 'Введите название' }]}
                    >
                        <Input placeholder="Например: ZZAP" />
                    </Form.Item>

                    <Divider>Наценки (коэффициенты)</Divider>

                    <div className="responsive-form-grid-3">
                        <Form.Item
                            name="general_markup"
                            label="Общая наценка"
                            tooltip="1.0 = без наценки, 1.2 = +20%"
                        >
                            <InputNumber
                                min={0}
                                step={0.1}
                                style={{ width: '100%' }}
                                placeholder="1.0"
                            />
                        </Form.Item>

                        <Form.Item
                            name="own_price_list_markup"
                            label="Наценка на свой прайс"
                        >
                            <InputNumber
                                min={0}
                                step={0.1}
                                style={{ width: '100%' }}
                                placeholder="1.0"
                            />
                        </Form.Item>

                        <Form.Item
                            name="third_party_markup"
                            label="Наценка на сторонние"
                        >
                            <InputNumber
                                min={0}
                                step={0.1}
                                style={{ width: '100%' }}
                                placeholder="1.0"
                            />
                        </Form.Item>
                    </div>

                    <Divider>Фильтры прайс-листа</Divider>

                    <Card
                        size="small"
                        style={{
                            marginBottom: 16,
                            backgroundColor: '#f9fafb',
                            borderColor: '#e8e8e8',
                        }}
                        title="Общие настройки (на все прайсы)"
                    >
                        {renderFilterFields(['default_filters'])}
                    </Card>

                    <Card
                        size="small"
                        style={{
                            marginBottom: 16,
                            backgroundColor: '#f7fbff',
                            borderColor: '#e3eefc',
                        }}
                        title="Настройки для нашего прайс-листа"
                    >
                        {renderFilterFields(['own_filters'])}
                    </Card>

                    <Card
                        size="small"
                        style={{
                            marginBottom: 16,
                            backgroundColor: '#f8fbf7',
                            borderColor: '#e4f1e1',
                        }}
                        title="Настройки для остальных прайсов"
                    >
                        {renderFilterFields(['other_filters'])}
                    </Card>

                    <Card
                        size="small"
                        style={{
                            marginBottom: 16,
                            backgroundColor: '#fffaf5',
                            borderColor: '#f2e6db',
                        }}
                        title="Индивидуальные настройки прайсов поставщиков"
                    >
                        {supplierFilterProviders.length === 0 && (
                            <Text type="secondary">
                                Добавьте источники в конфигурации, чтобы появились доступные поставщики.
                            </Text>
                        )}
                        <Form.List name="supplier_filters">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map((field) => (
                                        <Card
                                            key={field.key}
                                            size="small"
                                            style={{ marginBottom: 16 }}
                                            title={`Поставщик #${field.name + 1}`}
                                            extra={(
                                                <Button danger onClick={() => remove(field.name)}>
                                                    Удалить
                                                </Button>
                                            )}
                                        >
                                            <Form.Item
                                                name={[field.name, 'provider_id']}
                                                label="Поставщик"
                                                rules={[{ required: true, message: 'Выберите поставщика' }]}
                                            >
                                                <Select
                                                    showSearch
                                                    optionFilterProp="label"
                                                    options={supplierFilterProviders.map((provider) => ({
                                                        value: provider.id,
                                                        label: provider.name,
                                                    }))}
                                                />
                                            </Form.Item>
                                            {renderFilterFields([field.name])}
                                        </Card>
                                    ))}
                                    <Button type="dashed" onClick={() => add()}>
                                        Добавить поставщика
                                    </Button>
                                </>
                            )}
                        </Form.List>
                    </Card>

                    <Divider>Расписание отправки</Divider>

                    <Form.Item
                        name="schedule_days"
                        label="Дни недели"
                    >
                        <Select
                            mode="multiple"
                            options={dayOptions}
                            placeholder="Выберите дни"
                        />
                    </Form.Item>

                    <Form.Item
                        name="schedule_times"
                        label="Время (HH:MM)"
                        tooltip="Можно указать несколько времени, например 09:00, 18:00"
                    >
                        <Select
                            mode="multiple"
                            options={timeOptions}
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            placeholder="09:00"
                        />
                    </Form.Item>

                    <Form.Item
                        name="emails"
                        label="Email для отправки"
                    >
                        <Select
                            mode="tags"
                            placeholder="prices@customer.com"
                        />
                    </Form.Item>

                    <Form.Item
                        name="outgoing_email_account_id"
                        label="Почта отправителя прайсов"
                        extra="Если не выбрано, используется первый активный ящик с назначением prices_out/orders_out/orders_in или .env."
                    >
                        <Select
                            allowClear
                            placeholder="По умолчанию"
                            options={priceOutAccounts.map((account) => ({
                                value: account.id,
                                label: `${account.name} (${account.email})`,
                            }))}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Divider>Файл прайса</Divider>

                    <div className="responsive-form-grid-3">
                        <Form.Item
                            name="export_file_name"
                            label="Имя файла"
                            extra="Без расширения. Например: motor_price"
                        >
                            <Input placeholder="zzap_kross" />
                        </Form.Item>
                        <Form.Item
                            name="export_file_format"
                            label="Формат файла"
                        >
                            <Select
                                options={[
                                    { value: 'xlsx', label: 'Excel (.xlsx)' },
                                    { value: 'csv', label: 'CSV (.csv)' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item
                            name="export_file_extension"
                            label="Расширение"
                            extra="Можно переопределить отдельно от формата. Например: xls или txt"
                        >
                            <Input placeholder="По умолчанию по формату" />
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="is_active"
                        label="Активна"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item>
                        <Space wrap>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={configSaving}
                            >
                                {editingConfig ? 'Обновить' : 'Создать'}
                            </Button>
                            <Button
                                onClick={() => {
                                    setConfigModalVisible(false);
                                    setEditingConfig(null);
                                    configForm.resetFields();
                                    setSelectedPriceConfigId(null);
                                    setOrderConfig(null);
                                    applyOrderConfigToForm(null);
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
                <Divider>Обработка заказов</Divider>
                {editingConfig ? (
                    <Form
                        form={orderConfigForm}
                        layout="vertical"
                        onFinish={handleOrderConfigSubmit}
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
                                orderConfigForm.scrollToField(errorFields[0].name);
                            }
                        }}
                        scrollToFirstError
                        initialValues={{
                            order_start_row: 1,
                            ship_mode: 'REPLACE_QTY',
                            price_tolerance_pct: 2,
                            price_warning_pct: 5,
                            is_active: true,
                        }}
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="large">
                            <div>
                                <Text strong>Поиск писем</Text>
                                <div className="responsive-form-grid-2" style={{ marginTop: 12 }}>
                                    <Form.Item name="order_emails" label="Почты для заказов (через запятую)">
                                        <Input placeholder="order1@example.com, order2@example.com" />
                                    </Form.Item>
                                    <Form.Item name="order_reply_emails" label="Почты для ответов (через запятую)">
                                        <Input placeholder="reply1@example.com, reply2@example.com" />
                                    </Form.Item>
                                </div>
                                <div className="responsive-form-grid-2">
                                    <Form.Item
                                        label="Почтовый ящик для заказов"
                                        extra="Если не выбрано — ищем письма во всех активных ящиках с назначением «orders_in»."
                                    >
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            <Form.Item name="email_account_id" noStyle>
                                                <Select
                                                    allowClear
                                                    loading={orderInboxLoading}
                                                    placeholder="Любая входящая почта"
                                                    options={orderInboxAccounts.map((account) => {
                                                        const name = account.name || account.email;
                                                        const label = name === account.email
                                                            ? account.email
                                                            : `${name} • ${account.email}`;
                                                        return {
                                                            value: account.id,
                                                            label,
                                                        };
                                                    })}
                                                />
                                            </Form.Item>
                                            <Button
                                                onClick={handleOrderInboxTest}
                                                loading={orderInboxTestLoading}
                                            >
                                                Проверить доступ IMAP
                                            </Button>
                                        </Space>
                                    </Form.Item>
                                    <Form.Item name="order_subject_pattern" label="Шаблон темы письма">
                                        <Input />
                                    </Form.Item>
                                </div>
                                <div className="responsive-form-grid-2">
                                    <Form.Item name="order_filename_pattern" label="Шаблон имени файла">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item
                                        name="order_number_source"
                                        label="Источник номера"
                                    >
                                        <Select
                                            allowClear
                                            placeholder="Выберите источник"
                                            options={[
                                                { value: 'subject', label: 'Тема письма' },
                                                { value: 'body', label: 'Тело письма' },
                                                { value: 'filename', label: 'Имя файла' },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            </div>

                            <div>
                                <Text strong>Номер и дата заказа</Text>
                                <div
                                    className="responsive-form-grid-compact"
                                    style={{ marginTop: 12 }}
                                >
                                    <Form.Item
                                        name="order_number_column"
                                        label="Кол. номера"
                                        tooltip="Колонка номера заказа (с 1)"
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="order_number_row"
                                        label="Стр. номера"
                                        tooltip="Строка номера заказа (с 1)"
                                        extra="Пусто — искать по всем строкам."
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="order_date_column"
                                        label="Кол. даты"
                                        tooltip="Колонка даты заказа (с 1)"
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="order_date_row"
                                        label="Стр. даты"
                                        tooltip="Строка даты заказа (с 1)"
                                        extra="Пусто — искать по всем строкам."
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="order_start_row"
                                        label="Стр. начала"
                                        tooltip="Первая строка с позициями в файле (с 1)"
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                </div>
                                <Collapse
                                    style={{ marginTop: 12, background: '#fafafa' }}
                                    items={[
                                        {
                                            key: 'order-config-advanced',
                                            label: 'Дополнительно: regex, префикс и суффикс',
                                            children: (
                                                <Space
                                                    direction="vertical"
                                                    style={{ width: '100%' }}
                                                    size="middle"
                                                >
                                                    <div className="responsive-form-grid-2">
                                                        <Form.Item
                                                            name="order_number_prefix"
                                                            label="Префикс номера"
                                                        >
                                                            <Input />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="order_number_suffix"
                                                            label="Суффикс номера"
                                                        >
                                                            <Input />
                                                        </Form.Item>
                                                    </div>
                                                    <div className="responsive-form-grid-3">
                                                        <Form.Item
                                                            name="order_number_regex_subject"
                                                            label="Regex номера (тема)"
                                                        >
                                                            <Input />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="order_number_regex_body"
                                                            label="Regex номера (тело письма)"
                                                        >
                                                            <Input />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name="order_number_regex_filename"
                                                            label="Regex номера (имя файла)"
                                                        >
                                                            <Input />
                                                        </Form.Item>
                                                    </div>
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            </div>

                            <div>
                                <Text strong>Колонки файла</Text>
                                <div
                                    className="responsive-form-grid-compact"
                                    style={{ marginTop: 12 }}
                                >
                                    <Form.Item name="oem_col" label="OEM" rules={[{ required: true }]}>
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="brand_col" label="Бренд" rules={[{ required: true }]}>
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="name_col" label="Наим.">
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="qty_col" label="Кол-во" rules={[{ required: true }]}>
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="price_col" label="Цена">
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="ship_qty_col" label="Отгр.">
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="ship_price_col"
                                        label="Цена отгр."
                                        tooltip="Необязательная колонка для цены отгрузки. Если заполнена, при отгрузке сюда записывается цена из заказа."
                                    >
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="reject_qty_col" label="Отказ">
                                        <InputNumber min={1} style={{ width: '100%' }} />
                                    </Form.Item>
                                </div>
                                <div className="responsive-form-grid-2">
                                    <Form.Item name="ship_mode" label="Режим количества">
                                        <Select
                                            options={[
                                                { label: 'Заменить количество', value: 'REPLACE_QTY' },
                                                { label: 'Записать отгрузку', value: 'WRITE_SHIP_QTY' },
                                                { label: 'Записать отказ', value: 'WRITE_REJECT_QTY' },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            </div>

                            <div>
                                <Text strong>Проверка цены</Text>
                                <div
                                    className="responsive-form-grid-compact"
                                    style={{ marginTop: 12 }}
                                >
                                    <Form.Item
                                        name="price_tolerance_pct"
                                        label="Допуск (%)"
                                        tooltip="Допустимое отклонение цены"
                                    >
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="price_warning_pct"
                                        label="Предупр. (%)"
                                        tooltip="Порог предупреждения по цене"
                                    >
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item name="is_active" label="Активно" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </div>
                            </div>
                        </Space>
                        <Divider />
                        <Space wrap>
                            <Button type="primary" htmlType="submit" loading={orderConfigLoading}>
                                Сохранить обработку заказов
                            </Button>
                            <Button
                                onClick={handleProcessOrderConfigNow}
                                loading={orderProcessNowLoading}
                                disabled={!orderConfig}
                            >
                                Проверить почту сейчас
                            </Button>
                            <Button
                                onClick={handleRetryOrderErrors}
                                loading={orderRetryErrorsLoading}
                                disabled={!orderConfig}
                            >
                                Перепроверить ошибки
                            </Button>
                            {orderConfig && (
                                <Button
                                    danger
                                    onClick={async () => {
                                        try {
                                            await deleteCustomerOrderConfig(orderConfig.id);
                                            message.success('Конфигурация удалена');
                                            await refreshOrderConfigs(selectedPriceConfigId);
                                        } catch {
                                            message.error('Не удалось удалить конфигурацию');
                                        }
                                    }}
                                >
                                    Удалить обработку
                                </Button>
                            )}
                        </Space>
                    </Form>
                ) : (
                    <Text type="secondary">
                        Сначала сохраните конфигурацию прайса, затем настройте обработку заказов.
                    </Text>
                )}
            </Modal>

            {/* Модалка источников */}
            <Modal
                title={activeConfig ? `Источники: ${activeConfig.name}` : 'Источники'}
                open={sourcesModalVisible}
                onCancel={closeSourcesModal}
                footer={null}
                width={900}
                destroyOnClose
            >
                <Spin spinning={sourcesLoading}>
                    <Table
                        rowKey="id"
                        dataSource={sources}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: 'Поставщик',
                                dataIndex: 'provider_name',
                                key: 'provider_name',
                                render: (text, record) => (
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{text || '—'}</div>
                                        <div style={{ fontSize: 12, color: '#666' }}>
                                            {record.provider_config_name || `Конфиг #${record.provider_config_id}`}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                title: 'Наценка',
                                dataIndex: 'markup',
                                key: 'markup',
                                render: (value, record) => {
                                    const brandEntries = Object.entries(
                                        record?.brand_markups || {}
                                    );
                                    return (
                                        <div>
                                            <div>{formatSourceMarkup(value)}</div>
                                            {brandEntries.length > 0 && (
                                                <div style={{ fontSize: 12, color: '#666' }}>
                                                    {brandEntries
                                                        .map(([brand, markup]) => `${brand}=${markup}`)
                                                        .join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                },
                            },
                            {
                                title: 'Статус',
                                dataIndex: 'enabled',
                                key: 'enabled',
                                render: (enabled) => (
                                    <Tag color={enabled ? 'green' : 'default'}>
                                        {enabled ? 'Вкл' : 'Выкл'}
                                    </Tag>
                                ),
                            },
                            {
                                title: 'Действия',
                                key: 'actions',
                                width: 140,
                                render: (_, record) => (
                                    <Space size="small" wrap className="table-actions">
                                        <Button
                                            size="small"
                                            icon={<EditOutlined />}
                                            onClick={() => handleEditSource(record)}
                                        />
                                        <Popconfirm
                                            title="Удалить источник?"
                                            onConfirm={() => handleDeleteSource(record.id)}
                                            okText="Да"
                                            cancelText="Нет"
                                        >
                                            <Button
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                            />
                                        </Popconfirm>
                                    </Space>
                                ),
                            },
                        ]}
                        locale={{ emptyText: 'Источники не добавлены' }}
                        style={{ marginBottom: 16 }}
                        scroll={{ x: 'max-content' }}
                    />

                    <Divider>{editingSource ? 'Редактирование источника' : 'Добавление источника'}</Divider>

                    <Form
                        form={sourceForm}
                        layout="vertical"
                        onFinish={handleSourceSubmit}
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
                                sourceForm.scrollToField(errorFields[0].name);
                            }
                        }}
                        scrollToFirstError
                        initialValues={{ enabled: true, markup: 1.0 }}
                    >
                        <Form.Item
                            name="provider_config_id"
                            label="Конфигурация поставщика"
                            rules={[{ required: true, message: 'Выберите конфиг' }]}
                        >
                            <Select
                                placeholder="Выберите конфигурацию поставщика"
                                options={sourceProviderOptions}
                                showSearch
                                optionFilterProp="label"
                            />
                        </Form.Item>

                        <div className="responsive-form-grid-3">
                            <Form.Item
                                name="markup"
                                label="Наценка (коэфф. / %)"
                                extra={(
                                    <>
                                        <div>Как работает поле: `1` — цена без изменений.</div>
                                        <div>`1.55` или `55` — наценка +55% к цене поставщика.</div>
                                        <div>`0`, пустое значение или отрицательное число — тоже без изменений, цена не станет нулевой.</div>
                                    </>
                                )}
                            >
                                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="min_price" label="Мин. цена">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                name="max_price"
                                label="Макс. цена"
                                extra="0 и отрицательные значения не применяются и будут очищены."
                            >
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                        </div>

                        <div className="responsive-form-grid-3">
                            <Form.Item
                                name="min_quantity"
                                label="Мин. количество"
                                extra="0 и отрицательные значения не применяются и будут очищены."
                            >
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="max_quantity" label="Макс. количество">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="enabled" label="Включён" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </div>

                        <Form.Item
                            name="dz_expand_brands"
                            label="Разворачивать бренды DZ"
                            valuePropName="checked"
                            tooltip="Позиции DRAGONZAP разворачиваются в отдельные строки по брендам (Haval, Geely, Chery…) до применения фильтров. Наименования не изменяются."
                        >
                            <Switch />
                        </Form.Item>

                        <Divider>Фильтры по брендам</Divider>
                        <div className="responsive-form-grid-key">
                            <Form.Item name="brand_filter_type" label="Тип">
                                <Select
                                    allowClear
                                    options={[
                                        { value: 'include', label: 'Только' },
                                        { value: 'exclude', label: 'Исключить' },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item
                                name="brand_ids"
                                label="Бренды"
                                extra="Начните вводить название бренда"
                            >
                                <Select
                                    mode="multiple"
                                    showSearch
                                    optionFilterProp="label"
                                    filterOption={brandSelectFilterOption}
                                    notFoundContent={
                                        brandFilterLoading ? <Spin size="small" /> : null
                                    }
                                    placeholder="Например: TOYOTA"
                                    options={brandFilterOptions}
                                />
                            </Form.Item>
                        </div>

                        <Divider>Фильтры по позициям</Divider>
                        <div className="responsive-form-grid-key">
                            <Form.Item name="position_filter_type" label="Тип">
                                <Select
                                    allowClear
                                    options={[
                                        { value: 'include', label: 'Только' },
                                        { value: 'exclude', label: 'Исключить' },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item
                                name="position_ids"
                                label="Позиции (артикул)"
                                extra="Поиск по артикулу OEM. В подсказке: артикул • бренд • наименование"
                            >
                                <Select
                                    mode="multiple"
                                    showSearch
                                    filterOption={false}
                                    onSearch={handleAutopartFilterSearch}
                                    notFoundContent={
                                        autopartFilterLoading ? <Spin size="small" /> : null
                                    }
                                    placeholder="Например: 90915YZZN2"
                                    options={autopartFilterOptions}
                                />
                            </Form.Item>
                        </div>

                        <Divider>Наценка по брендам</Divider>
                        <Form.List name="brand_markups">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map((field) => (
                                        <div
                                            key={field.key}
                                            style={{
                                                marginBottom: 10,
                                                display: 'flex',
                                                gap: 8,
                                                alignItems: 'flex-end',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <Form.Item
                                                name={[field.name, 'brand']}
                                                label="Бренд"
                                                rules={[{ required: true, message: 'Выберите бренд' }]}
                                                style={{ marginBottom: 0, flex: '1 1 260px', minWidth: 220 }}
                                            >
                                                <Select
                                                    showSearch
                                                    optionFilterProp="label"
                                                    placeholder="Бренд"
                                                    options={markupBrandOptions}
                                                    loading={markupBrandLoading}
                                                    style={{ width: '100%' }}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'markup']}
                                                label="Нац."
                                                rules={[{ required: true, message: 'Укажите наценку' }]}
                                                style={{ marginBottom: 0, width: 140 }}
                                            >
                                                <InputNumber
                                                    min={0.01}
                                                    step={0.1}
                                                    style={{ width: '100%' }}
                                                    placeholder="10 / 1.1"
                                                />
                                            </Form.Item>
                                            <Button
                                                danger
                                                size="small"
                                                icon={<DeleteOutlined />}
                                                onClick={() => remove(field.name)}
                                            >
                                                Удал.
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="dashed" onClick={() => add()}>
                                        + Бренд
                                    </Button>
                                    <div>
                                        <Text type="secondary">
                                            Наценка применяется для выбранного бренда и его синонимов.
                                        </Text>
                                    </div>
                                </>
                            )}
                        </Form.List>

                        <Form.Item>
                            <Space wrap>
                                <Button type="primary" htmlType="submit">
                                    {editingSource ? 'Обновить' : 'Добавить'}
                                </Button>
                                <Button
                                    onClick={() => {
                                        setEditingSource(null);
                                        sourceForm.resetFields();
                                    }}
                                >
                                    Отмена
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Spin>
            </Modal>
        </div>
    );
};

export default CustomerPage;
