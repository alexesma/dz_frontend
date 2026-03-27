import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card,
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
import { lookupBrands } from '../api/brands';
import { searchAutopartsByOem } from '../api/autoparts';

const CustomerPage = () => {
    const { customerId: customerIdParam } = useParams();
    const navigate = useNavigate();

    const isNew = !customerIdParam || customerIdParam.toLowerCase() === 'create';
    const customerId = !isNew ? Number(customerIdParam) : null;

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [customerData, setCustomerData] = useState(null);

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
    const [brandFilterLoading, setBrandFilterLoading] = useState(false);
    const [autopartFilterOptions, setAutopartFilterOptions] = useState([]);
    const [autopartFilterLoading, setAutopartFilterLoading] = useState(false);
    const [orderInboxLoading, setOrderInboxLoading] = useState(false);
    const [orderInboxTestLoading, setOrderInboxTestLoading] = useState(false);
    const brandSearchRequestRef = useRef(0);
    const brandSearchTimerRef = useRef(null);
    const autopartSearchRequestRef = useRef(0);
    const autopartSearchTimerRef = useRef(null);

    const [customerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [sourceForm] = Form.useForm();
    const [orderConfigForm] = Form.useForm();

    const applyOrderConfigToForm = useCallback((config) => {
        if (config) {
            orderConfigForm.setFieldsValue({
                ...config,
                order_emails: (config.order_emails || []).join(', '),
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
        const loadBrandOptions = async (query = '') => {
            setBrandFilterLoading(true);
            try {
                const { data } = await lookupBrands(query, 100);
                if (!mounted) return;
                const options = (data || []).map((brand) => ({
                    value: String(brand.id),
                    label: `${brand.name} (ID: ${brand.id})`,
                }));
                setBrandFilterOptions(options);
            } catch (err) {
                console.error('Load brand options failed:', err);
            } finally {
                if (mounted) {
                    setBrandFilterLoading(false);
                }
            }
        };
        loadBrandOptions();
        return () => {
            mounted = false;
        };
    }, []);

    const handleBrandFilterSearch = useCallback((rawValue) => {
        const value = String(rawValue || '').trim();
        if (brandSearchTimerRef.current) {
            clearTimeout(brandSearchTimerRef.current);
        }
        brandSearchTimerRef.current = setTimeout(async () => {
            const requestId = brandSearchRequestRef.current + 1;
            brandSearchRequestRef.current = requestId;
            setBrandFilterLoading(true);
            try {
                const { data } = await lookupBrands(value, 100);
                if (brandSearchRequestRef.current !== requestId) return;
                const options = (data || []).map((brand) => ({
                    value: String(brand.id),
                    label: `${brand.name} (ID: ${brand.id})`,
                }));
                setBrandFilterOptions(options);
            } catch (err) {
                if (brandSearchRequestRef.current !== requestId) return;
                console.error('Brand lookup failed:', err);
            } finally {
                if (brandSearchRequestRef.current === requestId) {
                    setBrandFilterLoading(false);
                }
            }
        }, 250);
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
            if (brandSearchTimerRef.current) {
                clearTimeout(brandSearchTimerRef.current);
            }
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
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
                            filterOption={false}
                            onSearch={handleBrandFilterSearch}
                            notFoundContent={
                                brandFilterLoading ? <Spin size="small" /> : null
                            }
                            placeholder="Например: TOYOTA"
                            options={brandFilterOptions}
                        />
                    </Form.Item>
                </div>

                <Divider>Фильтры по позициям</Divider>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
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
                                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, marginBottom: 12 }}
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
                                            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, marginBottom: 12 }}
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
            message.error(err?.message || 'Ошибка загрузки клиента');
            navigate('/customers');
        } finally {
            setLoading(false);
        }
    })();
    }, [isNew, customerId, customerForm, navigate, orderConfigForm, applyOrderConfigToForm]);

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
            const orderResp = await getCustomerOrderConfigs(customerId);
            const configs = orderResp.data || [];
            setOrderConfigs(configs);
            const activeConfig = configs.find(
                (cfg) => cfg.pricelist_config_id === selectedPriceConfigId
            );
            setOrderConfig(activeConfig || null);
            applyOrderConfigToForm(activeConfig || null);
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
            configForm.setFieldsValue({
                ...config,
                default_filters: mapFilterToForm(config.default_filters || {}),
                own_filters: mapFilterToForm(config.own_filters || {}),
                other_filters: mapFilterToForm(config.other_filters || {}),
                supplier_filters: supplierList,
            });
        } else {
            configForm.resetFields();
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

        const payload = {
            provider_config_id: values.provider_config_id,
            enabled: values.enabled ?? true,
            markup: values.markup ?? 1.0,
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
            min_price: values.min_price ?? null,
            max_price: values.max_price ?? null,
            min_quantity: values.min_quantity ?? null,
            max_quantity: values.max_quantity ?? null,
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
            message.error('Ошибка сохранения источника');
        }
    };

    const handleEditSource = (source) => {
        setEditingSource(source);
        sourceForm.setFieldsValue({
            provider_config_id: source.provider_config_id,
            enabled: source.enabled,
            markup: source.markup,
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
            width: 200,
            render: (_, record) => (
                <Space size="small">
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

    return (
        <div style={{ margin: 20 }}>
            <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
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
                        scroll={{ x: 1000 }}
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

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
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

                    <Form.Item
                        name="is_active"
                        label="Активна"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item>
                        <Space>
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
                            <Form.Item name="order_emails" label="Почты для заказов (через запятую)">
                                <Input placeholder="order1@example.com, order2@example.com" />
                            </Form.Item>
                            <Form.Item name="order_email" label="Почта для заказов (одна)">
                                <Input />
                            </Form.Item>
                            <Form.Item name="order_reply_emails" label="Почты для ответов (через запятую)">
                                <Input placeholder="reply1@example.com, reply2@example.com" />
                            </Form.Item>
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
                            <Form.Item name="order_filename_pattern" label="Шаблон имени файла">
                                <Input />
                            </Form.Item>
                            <Divider />
                            <Form.Item name="order_number_column" label="Колонка номера заказа">
                                <InputNumber min={1} style={{ width: 220 }} />
                            </Form.Item>
                            <Form.Item
                                name="order_number_row"
                                label="Строка номера заказа (с 1)"
                                extra="Можно оставить пустым: номер будет искаться по всем строкам файла."
                            >
                                <InputNumber min={1} style={{ width: 220 }} />
                            </Form.Item>
                            <Form.Item name="order_number_regex_subject" label="Regex номера (тема)">
                                <Input />
                            </Form.Item>
                            <Form.Item name="order_number_regex_body" label="Regex номера (тело письма)">
                                <Input />
                            </Form.Item>
                            <Form.Item name="order_number_regex_filename" label="Regex номера (имя файла)">
                                <Input />
                            </Form.Item>
                            <Form.Item name="order_number_prefix" label="Префикс номера">
                                <Input />
                            </Form.Item>
                            <Form.Item name="order_number_suffix" label="Суффикс номера">
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
                            <Form.Item name="order_date_column" label="Колонка даты заказа">
                                <InputNumber min={1} style={{ width: 220 }} />
                            </Form.Item>
                            <Form.Item
                                name="order_date_row"
                                label="Строка даты заказа (с 1)"
                                extra="Можно оставить пустым: дата будет искаться по всем строкам файла."
                            >
                                <InputNumber min={1} style={{ width: 220 }} />
                            </Form.Item>
                            <Form.Item
                                name="order_start_row"
                                label="Строка начала (с 1)"
                            >
                                <InputNumber min={1} style={{ width: 220 }} />
                            </Form.Item>
                            <Divider />
                            <Form.Item name="oem_col" label="Колонка OEM (с 1)" rules={[{ required: true }]}>
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="brand_col" label="Колонка бренда (с 1)" rules={[{ required: true }]}>
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="name_col" label="Колонка наименования (с 1)">
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="qty_col" label="Колонка количества (с 1)" rules={[{ required: true }]}>
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="price_col" label="Колонка цены (с 1)">
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="ship_qty_col" label="Колонка отгрузки (с 1)">
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="reject_qty_col" label="Колонка отказа (с 1)">
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="ship_mode" label="Режим записи количества">
                                <Select
                                    options={[
                                        { label: 'Заменить количество', value: 'REPLACE_QTY' },
                                        { label: 'Записать отгрузку', value: 'WRITE_SHIP_QTY' },
                                        { label: 'Записать отказ', value: 'WRITE_REJECT_QTY' },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item name="price_tolerance_pct" label="Допустимое отклонение цены (%)">
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="price_warning_pct" label="Порог предупреждения (%)">
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="is_active" label="Активно" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Space>
                        <Divider />
                        <Button type="primary" htmlType="submit" loading={orderConfigLoading}>
                            Сохранить обработку заказов
                        </Button>
                        {orderConfig && (
                            <Button
                                danger
                                style={{ marginLeft: 8 }}
                                onClick={async () => {
                                    try {
                                        await deleteCustomerOrderConfig(orderConfig.id);
                                        message.success('Конфигурация удалена');
                                        const orderResp = await getCustomerOrderConfigs(customerId);
                                        const configs = orderResp.data || [];
                                        setOrderConfigs(configs);
                                        setOrderConfig(null);
                                        applyOrderConfigToForm(null);
                                    } catch {
                                        message.error('Не удалось удалить конфигурацию');
                                    }
                                }}
                            >
                                Удалить обработку
                            </Button>
                        )}
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
                                render: (value) => value ?? '—',
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
                                width: 120,
                                render: (_, record) => (
                                    <Space size="small">
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
                                options={providerOptions.map((opt) => ({
                                    value: opt.id,
                                    label: `${opt.provider_name} • ${opt.name_price || `Конфиг #${opt.id}`}${opt.is_own_price ? ' (Наш)' : ''}`,
                                }))}
                                showSearch
                                optionFilterProp="label"
                            />
                        </Form.Item>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <Form.Item name="markup" label="Наценка (коэфф.)">
                                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="min_price" label="Мин. цена">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="max_price" label="Макс. цена">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <Form.Item name="min_quantity" label="Мин. количество">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="max_quantity" label="Макс. количество">
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="enabled" label="Включён" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </div>

                        <Divider>Фильтры по брендам</Divider>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
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
                                    filterOption={false}
                                    onSearch={handleBrandFilterSearch}
                                    notFoundContent={
                                        brandFilterLoading ? <Spin size="small" /> : null
                                    }
                                    placeholder="Например: TOYOTA"
                                    options={brandFilterOptions}
                                />
                            </Form.Item>
                        </div>

                        <Divider>Фильтры по позициям</Divider>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
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

                        <Form.Item>
                            <Space>
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
