import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Form, Input, Button, message, Spin, Space, Select,
    Table, Modal, InputNumber, Popconfirm, Divider, Tag, Switch
} from 'antd';
import {
    SaveOutlined, ArrowLeftOutlined, PlusOutlined,
    EditOutlined, DeleteOutlined, SendOutlined, SettingOutlined
} from '@ant-design/icons';
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
} from '../api/customers';
import { getProviderConfigOptions } from '../api/providers';

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
    const [providerOptions, setProviderOptions] = useState([]);
    const [editingSource, setEditingSource] = useState(null);

    const [customerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [sourceForm] = Form.useForm();

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

    const formatSchedule = (cfg) => {
        const days = (cfg.schedule_days || [])
            .map((d) => dayOptions.find((opt) => opt.value === d)?.label || d)
            .join(', ');
        const times = (cfg.schedule_times || []).join(', ');
        if (!days && !times) return '—';
        if (days && times) return `${days} • ${times}`;
        return days || times;
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

                setCustomerData({
                    customer,
                    pricelist_configs: configs,
                });

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
    }, [isNew, customerId, customerForm, navigate]);

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

    // Работа с конфигурациями
    const openConfigModal = (config = null) => {
        setEditingConfig(config);
        if (config) {
            configForm.setFieldsValue(config);
        } else {
            configForm.resetFields();
        }
        setConfigModalVisible(true);
    };

    const handleConfigSubmit = async (values) => {
        if (!customerId) return;

        try {
            if (editingConfig) {
                await updateCustomerPricelistConfig(customerId, editingConfig.id, values);
                message.success('Конфигурация обновлена');
            } else {
                await createCustomerPricelistConfig(customerId, values);
                message.success('Конфигурация создана');
            }

            setConfigModalVisible(false);
            setEditingConfig(null);
            configForm.resetFields();

            // Обновляем данные
            const { data: configs } = await getCustomerPricelistConfigs(customerId);
            setCustomerData(prev => ({ ...prev, pricelist_configs: configs }));
        } catch (err) {
            console.error(err);
            message.error('Ошибка сохранения конфигурации');
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
            brand_ids: source.brand_filters?.brands || [],
            position_filter_type: source.position_filters?.type || null,
            position_ids: source.position_filters?.autoparts || [],
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

            {/* Модалка конфигурации */}
            <Modal
                title={editingConfig ? 'Редактирование конфигурации' : 'Создание конфигурации'}
                open={configModalVisible}
                onCancel={() => {
                    setConfigModalVisible(false);
                    setEditingConfig(null);
                    configForm.resetFields();
                }}
                footer={null}
                width={700}
                destroyOnClose
            >
                <Form
                    form={configForm}
                    layout="vertical"
                    onFinish={handleConfigSubmit}
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
                            >
                                {editingConfig ? 'Обновить' : 'Создать'}
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
                            <Form.Item name="brand_ids" label="ID брендов">
                                <Select mode="tags" placeholder="1, 2, 3" />
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
                            <Form.Item name="position_ids" label="ID позиций">
                                <Select mode="tags" placeholder="1001, 1002" />
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
