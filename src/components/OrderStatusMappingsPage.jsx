import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    EditOutlined,
    LinkOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import {
    createOrderStatusMapping,
    getOrderStatusMappingOptions,
    getOrderStatusMappings,
    getUnmappedExternalStatuses,
    updateOrderStatusMapping,
} from '../api/orderStatusMappings';
import { getProviders } from '../api/providers';

const { Paragraph, Text, Title } = Typography;

const STATUS_COLORS = {
    ORDERED: 'blue',
    PROCESSING: 'gold',
    CONFIRMED: 'cyan',
    TRANSIT: 'orange',
    ACCEPTED: 'lime',
    ARRIVED: 'green',
    SHIPPED: 'green',
    REFUSAL: 'red',
    RETURNED: 'orange',
    REMOVED: 'default',
    ERROR: 'red',
    NEW: 'default',
    SENT: 'blue',
    IN_PROGRESS: 'gold',
    DELIVERED: 'green',
    CANCELLED: 'red',
    FAILED: 'red',
};

const EMPTY_OPTIONS = {
    sources: [],
    match_modes: [],
    order_statuses: [],
    item_statuses: [],
    supplier_response_actions: [],
};

const OrderStatusMappingsPage = () => {
    const [mappingForm] = Form.useForm();
    const [options, setOptions] = useState(EMPTY_OPTIONS);
    const [providers, setProviders] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [unmappedRows, setUnmappedRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('unmapped');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMapping, setEditingMapping] = useState(null);
    const [mappingFilters, setMappingFilters] = useState({
        source_key: undefined,
        provider_id: undefined,
        is_active: undefined,
    });
    const [unmappedFilters, setUnmappedFilters] = useState({
        source_key: undefined,
        provider_id: undefined,
    });

    const providerOptions = useMemo(
        () =>
            providers.map((provider) => ({
                value: provider.id,
                label: provider.name,
            })),
        [providers]
    );

    const sourceOptions = useMemo(() => options.sources || [], [options.sources]);
    const matchModeOptions = useMemo(
        () => options.match_modes || [],
        [options.match_modes]
    );
    const orderStatusOptions = useMemo(
        () => options.order_statuses || [],
        [options.order_statuses]
    );
    const itemStatusOptions = useMemo(
        () => options.item_statuses || [],
        [options.item_statuses]
    );
    const supplierResponseActionOptions = useMemo(
        () => options.supplier_response_actions || [],
        [options.supplier_response_actions]
    );

    const loadProviders = useCallback(async () => {
        try {
            const { data } = await getProviders({ page: 1, page_size: 500 });
            setProviders(data?.items || []);
        } catch {
            setProviders([]);
        }
    }, []);

    const loadOptions = useCallback(async () => {
        const { data } = await getOrderStatusMappingOptions();
        setOptions(data || EMPTY_OPTIONS);
    }, []);

    const loadMappings = useCallback(async (nextFilters = mappingFilters) => {
        const params = {
            source_key: nextFilters.source_key || undefined,
            provider_id: nextFilters.provider_id || undefined,
            is_active:
                nextFilters.is_active === undefined
                    ? undefined
                    : nextFilters.is_active,
        };
        const { data } = await getOrderStatusMappings(params);
        setMappings(Array.isArray(data) ? data : []);
    }, [mappingFilters]);

    const loadUnmapped = useCallback(async (nextFilters = unmappedFilters) => {
        const params = {
            source_key: nextFilters.source_key || undefined,
            provider_id: nextFilters.provider_id || undefined,
            resolved: false,
        };
        const { data } = await getUnmappedExternalStatuses(params);
        setUnmappedRows(Array.isArray(data) ? data : []);
    }, [unmappedFilters]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadOptions(),
                loadProviders(),
                loadMappings(mappingFilters),
                loadUnmapped(unmappedFilters),
            ]);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить настройки статусов');
        } finally {
            setLoading(false);
        }
    }, [loadMappings, loadOptions, loadProviders, loadUnmapped, mappingFilters, unmappedFilters]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const resetModal = useCallback(() => {
        setEditingMapping(null);
        setModalOpen(false);
        mappingForm.resetFields();
    }, [mappingForm]);

    const openCreateFromUnmapped = useCallback((row) => {
        setEditingMapping(null);
        setModalOpen(true);
        mappingForm.setFieldsValue({
            source_key: row.source_key,
            raw_status: row.raw_status,
            match_mode: 'EXACT',
            provider_specific: Boolean(row.provider_id),
            provider_id: row.provider_id || undefined,
            internal_order_status: undefined,
            internal_item_status: undefined,
            supplier_response_action: undefined,
            priority: 100,
            is_active: true,
            apply_existing: true,
            notes: '',
        });
    }, [mappingForm]);

    const openEditModal = useCallback((row) => {
        setEditingMapping(row);
        setModalOpen(true);
        mappingForm.setFieldsValue({
            source_key: row.source_key,
            raw_status: row.raw_status,
            match_mode: row.match_mode,
            provider_specific: Boolean(row.provider_id),
            provider_id: row.provider_id || undefined,
            internal_order_status: row.internal_order_status || undefined,
            internal_item_status: row.internal_item_status || undefined,
            supplier_response_action: row.supplier_response_action || undefined,
            priority: row.priority,
            is_active: row.is_active,
            apply_existing: true,
            notes: row.notes || '',
        });
    }, [mappingForm]);

    const handleSubmit = useCallback(async () => {
        const values = await mappingForm.validateFields();
        const payload = {
            source_key: values.source_key,
            provider_id: values.provider_specific ? values.provider_id ?? null : null,
            raw_status: values.raw_status,
            match_mode: values.match_mode,
            internal_order_status: values.internal_order_status || null,
            internal_item_status: values.internal_item_status || null,
            supplier_response_action: values.supplier_response_action || null,
            priority: values.priority,
            is_active: values.is_active,
            apply_existing: values.apply_existing,
            notes: values.notes || null,
        };
        setSaving(true);
        try {
            if (editingMapping) {
                await updateOrderStatusMapping(editingMapping.id, payload);
                message.success('Правило обновлено');
            } else {
                await createOrderStatusMapping(payload);
                message.success('Правило создано');
            }
            resetModal();
            await Promise.all([loadMappings(), loadUnmapped()]);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось сохранить правило');
        } finally {
            setSaving(false);
        }
    }, [editingMapping, loadMappings, loadUnmapped, mappingForm, resetModal]);

    const handleActiveToggle = useCallback(async (row, checked) => {
        try {
            await updateOrderStatusMapping(row.id, {
                is_active: checked,
                apply_existing: checked,
            });
            message.success(
                checked ? 'Правило включено' : 'Правило выключено'
            );
            await Promise.all([loadMappings(), loadUnmapped()]);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось изменить правило');
        }
    }, [loadMappings, loadUnmapped]);

    const unmappedColumns = useMemo(
        () => [
            {
                title: 'Когда',
                dataIndex: 'last_seen_at',
                key: 'last_seen_at',
                width: 122,
                render: (value) =>
                    value ? new Date(value).toLocaleString('ru-RU') : '—',
            },
            {
                title: 'Источник',
                dataIndex: 'source_label',
                key: 'source_label',
                width: 116,
                render: (value, record) => (
                    <Tooltip title={record.source_key}>
                        <Tag color="blue">{value || record.source_key}</Tag>
                    </Tooltip>
                ),
            },
            {
                title: 'Поставщик',
                dataIndex: 'provider_name',
                key: 'provider_name',
                width: 180,
                ellipsis: true,
                render: (value) => value || 'Все поставщики',
            },
            {
                title: 'Внешний статус',
                dataIndex: 'raw_status',
                key: 'raw_status',
                ellipsis: true,
                render: (value, record) => (
                    <div>
                        <div>{value}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.normalized_status}
                        </Text>
                    </div>
                ),
            },
            {
                title: 'Сколько раз',
                dataIndex: 'seen_count',
                key: 'seen_count',
                width: 94,
            },
            {
                title: 'Пример',
                key: 'sample',
                width: 126,
                render: (_, record) => (
                    <Text type="secondary">
                        {record.sample_order_id
                            ? `Заказ #${record.sample_order_id}`
                            : record.sample_payload?.supplier_order_id
                                ? `Поставщик #${record.sample_payload.supplier_order_id}`
                            : '—'}
                    </Text>
                ),
            },
            {
                title: '',
                key: 'actions',
                width: 118,
                render: (_, record) => (
                    <Button
                        type="link"
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => openCreateFromUnmapped(record)}
                    >
                        Сопоставить
                    </Button>
                ),
            },
        ],
        [openCreateFromUnmapped]
    );

    const mappingColumns = useMemo(
        () => [
            {
                title: 'Источник',
                dataIndex: 'source_key',
                key: 'source_key',
                width: 126,
                render: (value) => (
                    <Tag color="blue">
                        {sourceOptions.find((item) => item.value === value)?.label || value}
                    </Tag>
                ),
            },
            {
                title: 'Поставщик',
                dataIndex: 'provider_name',
                key: 'provider_name',
                width: 180,
                ellipsis: true,
                render: (value) => value || 'Все поставщики',
            },
            {
                title: 'Внешний статус',
                dataIndex: 'raw_status',
                key: 'raw_status',
                ellipsis: true,
                render: (value, record) => (
                    <div>
                        <div>{value}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.match_mode === 'EXACT'
                                ? 'Точное совпадение'
                                : 'Содержит'}
                        </Text>
                    </div>
                ),
            },
            {
                title: 'Наш заказ',
                dataIndex: 'internal_order_status',
                key: 'internal_order_status',
                width: 132,
                render: (value) =>
                    value ? (
                        <Tag color={STATUS_COLORS[value] || 'default'}>
                            {orderStatusOptions.find((item) => item.value === value)?.label || value}
                        </Tag>
                    ) : '—',
            },
            {
                title: 'Наша строка',
                dataIndex: 'internal_item_status',
                key: 'internal_item_status',
                width: 132,
                render: (value) =>
                    value ? (
                        <Tag color={STATUS_COLORS[value] || 'default'}>
                            {itemStatusOptions.find((item) => item.value === value)?.label || value}
                        </Tag>
                    ) : '—',
            },
            {
                title: 'Действие',
                dataIndex: 'supplier_response_action',
                key: 'supplier_response_action',
                width: 170,
                render: (value) =>
                    value ? (
                        <Tag color="purple">
                            {supplierResponseActionOptions.find((item) => item.value === value)?.label || value}
                        </Tag>
                    ) : '—',
            },
            {
                title: 'Активно',
                dataIndex: 'is_active',
                key: 'is_active',
                width: 88,
                render: (value, row) => (
                    <Checkbox
                        checked={value}
                        onChange={(event) =>
                            handleActiveToggle(row, event.target.checked)
                        }
                    />
                ),
            },
            {
                title: '',
                key: 'actions',
                width: 80,
                render: (_, record) => (
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(record)}
                    >
                        Править
                    </Button>
                ),
            },
        ],
        [
            handleActiveToggle,
            itemStatusOptions,
            openEditModal,
            orderStatusOptions,
            sourceOptions,
            supplierResponseActionOptions,
        ]
    );

    const internalStatusColumns = useMemo(
        () => [
            {
                title: 'Код',
                dataIndex: 'value',
                key: 'value',
                width: 150,
            },
            {
                title: 'Название',
                dataIndex: 'label',
                key: 'label',
            },
        ],
        []
    );

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <Title level={3} style={{ marginBottom: 0 }}>
                        Сопоставление внешних статусов
                    </Title>
                    <Text type="secondary">
                        Здесь мы безопасно связываем статусы с сайтов и API с
                        нашими внутренними статусами. Внутренние статусы остаются
                        фиксированными, а незнакомые внешние статусы копятся,
                        пока администратор не создаст правило.
                    </Text>
                </div>

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'unmapped',
                            label: `Не сопоставленные (${unmappedRows.length})`,
                            children: (
                                <Space
                                    direction="vertical"
                                    style={{ width: '100%' }}
                                    size="middle"
                                >
                                    <Space wrap>
                                        <Select
                                            allowClear
                                            placeholder="Источник"
                                            style={{ width: 170 }}
                                            options={sourceOptions}
                                            value={unmappedFilters.source_key}
                                            onChange={(value) =>
                                                setUnmappedFilters((prev) => ({
                                                    ...prev,
                                                    source_key: value,
                                                }))
                                            }
                                        />
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder="Поставщик"
                                            style={{ width: 220 }}
                                            options={providerOptions}
                                            optionFilterProp="label"
                                            value={unmappedFilters.provider_id}
                                            onChange={(value) =>
                                                setUnmappedFilters((prev) => ({
                                                    ...prev,
                                                    provider_id: value,
                                                }))
                                            }
                                        />
                                        <Button
                                            type="primary"
                                            onClick={() => loadUnmapped()}
                                        >
                                            Показать
                                        </Button>
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={() => loadAll()}
                                        >
                                            Обновить
                                        </Button>
                                    </Space>

                                    <Table
                                        size="small"
                                        rowKey="id"
                                        columns={unmappedColumns}
                                        dataSource={unmappedRows}
                                        loading={loading}
                                        pagination={{ pageSize: 10 }}
                                        scroll={{ x: 980 }}
                                    />
                                </Space>
                            ),
                        },
                        {
                            key: 'rules',
                            label: `Правила (${mappings.length})`,
                            children: (
                                <Space
                                    direction="vertical"
                                    style={{ width: '100%' }}
                                    size="middle"
                                >
                                    <Space wrap>
                                        <Select
                                            allowClear
                                            placeholder="Источник"
                                            style={{ width: 170 }}
                                            options={sourceOptions}
                                            value={mappingFilters.source_key}
                                            onChange={(value) =>
                                                setMappingFilters((prev) => ({
                                                    ...prev,
                                                    source_key: value,
                                                }))
                                            }
                                        />
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder="Поставщик"
                                            style={{ width: 220 }}
                                            options={providerOptions}
                                            optionFilterProp="label"
                                            value={mappingFilters.provider_id}
                                            onChange={(value) =>
                                                setMappingFilters((prev) => ({
                                                    ...prev,
                                                    provider_id: value,
                                                }))
                                            }
                                        />
                                        <Select
                                            allowClear
                                            placeholder="Активность"
                                            style={{ width: 150 }}
                                            value={mappingFilters.is_active}
                                            onChange={(value) =>
                                                setMappingFilters((prev) => ({
                                                    ...prev,
                                                    is_active: value,
                                                }))
                                            }
                                            options={[
                                                { value: true, label: 'Только активные' },
                                                { value: false, label: 'Только выключенные' },
                                            ]}
                                        />
                                        <Button
                                            type="primary"
                                            onClick={() => loadMappings()}
                                        >
                                            Показать
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setEditingMapping(null);
                                                setModalOpen(true);
                                                mappingForm.setFieldsValue({
                                                    source_key: sourceOptions[0]?.value,
                                                    match_mode: 'EXACT',
                                                    provider_specific: false,
                                                    priority: 100,
                                                    is_active: true,
                                                    apply_existing: true,
                                                    supplier_response_action: undefined,
                                                });
                                            }}
                                        >
                                            Новое правило
                                        </Button>
                                    </Space>

                                    <Table
                                        size="small"
                                        rowKey="id"
                                        columns={mappingColumns}
                                        dataSource={mappings}
                                        loading={loading}
                                        pagination={{ pageSize: 10 }}
                                        scroll={{ x: 980 }}
                                    />
                                </Space>
                            ),
                        },
                        {
                            key: 'internal',
                            label: 'Наши статусы',
                            children: (
                                <Space
                                    direction="vertical"
                                    style={{ width: '100%' }}
                                    size="middle"
                                >
                                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                        Здесь показаны наши внутренние статусы. В безопасном сценарии
                                        мы не создаем новые внутренние коды на лету, а только
                                        сопоставляем внешние статусы с уже существующими.
                                    </Paragraph>
                                    <Card size="small" title="Статусы заказа">
                                        <Table
                                            size="small"
                                            rowKey="value"
                                            columns={internalStatusColumns}
                                            dataSource={orderStatusOptions}
                                            pagination={false}
                                        />
                                    </Card>
                                    <Card size="small" title="Статусы строки заказа">
                                        <Table
                                            size="small"
                                            rowKey="value"
                                            columns={internalStatusColumns}
                                            dataSource={itemStatusOptions}
                                            pagination={false}
                                        />
                                    </Card>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Space>

            <Modal
                title={editingMapping ? 'Правка правила' : 'Новое правило'}
                open={modalOpen}
                onCancel={resetModal}
                onOk={handleSubmit}
                okText={editingMapping ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                confirmLoading={saving}
                width={680}
                destroyOnHidden
            >
                <Form
                    form={mappingForm}
                    layout="vertical"
                    initialValues={{
                        match_mode: 'EXACT',
                        provider_specific: false,
                        priority: 100,
                        is_active: true,
                        apply_existing: true,
                    }}
                >
                    <Form.Item
                        name="source_key"
                        label="Источник"
                        rules={[{ required: true, message: 'Выберите источник' }]}
                    >
                        <Select
                            options={sourceOptions}
                            disabled={Boolean(editingMapping)}
                        />
                    </Form.Item>
                    <Form.Item
                        name="raw_status"
                        label="Внешний статус"
                        rules={[{ required: true, message: 'Укажите внешний статус' }]}
                    >
                        <Input placeholder="Например: manual review" />
                    </Form.Item>
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            name="match_mode"
                            label="Как сравнивать"
                            rules={[{ required: true, message: 'Выберите тип сравнения' }]}
                            style={{ minWidth: 220 }}
                        >
                            <Select options={matchModeOptions} />
                        </Form.Item>
                        <Form.Item
                            name="priority"
                            label="Приоритет"
                            style={{ minWidth: 140 }}
                        >
                            <InputNumber min={0} max={10000} style={{ width: '100%' }} />
                        </Form.Item>
                    </Space>
                    <Form.Item
                        name="provider_specific"
                        valuePropName="checked"
                        style={{ marginBottom: 8 }}
                    >
                        <Checkbox>Правило только для выбранного поставщика</Checkbox>
                    </Form.Item>
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) =>
                            prev.provider_specific !== next.provider_specific
                        }
                    >
                        {({ getFieldValue }) =>
                            getFieldValue('provider_specific') ? (
                                <Form.Item
                                    name="provider_id"
                                    label="Поставщик"
                                    rules={[{ required: true, message: 'Выберите поставщика' }]}
                                >
                                    <Select
                                        showSearch
                                        optionFilterProp="label"
                                        options={providerOptions}
                                    />
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            name="internal_order_status"
                            label="Наш статус заказа"
                            style={{ minWidth: 280, flex: 1 }}
                        >
                            <Select
                                allowClear
                                options={orderStatusOptions}
                                placeholder="Можно оставить пустым"
                            />
                        </Form.Item>
                        <Form.Item
                            name="internal_item_status"
                            label="Наш статус строки"
                            style={{ minWidth: 280, flex: 1 }}
                        >
                            <Select
                                allowClear
                                options={itemStatusOptions}
                                placeholder="Можно оставить пустым"
                            />
                        </Form.Item>
                    </Space>
                    <Form.Item
                        name="supplier_response_action"
                        label="Действие для ответа поставщика"
                    >
                        <Select
                            allowClear
                            options={supplierResponseActionOptions}
                            placeholder="Нужно для ответов поставщиков по email"
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="Комментарий">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Space size="large">
                        <Form.Item
                            name="is_active"
                            valuePropName="checked"
                            style={{ marginBottom: 0 }}
                        >
                            <Checkbox>Правило активно</Checkbox>
                        </Form.Item>
                        <Form.Item
                            name="apply_existing"
                            valuePropName="checked"
                            style={{ marginBottom: 0 }}
                        >
                            <Checkbox>Сразу применить к накопленным статусам</Checkbox>
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>
        </Card>
    );
};

export default OrderStatusMappingsPage;
