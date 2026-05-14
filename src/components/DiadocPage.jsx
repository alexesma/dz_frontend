import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Descriptions,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    LinkOutlined,
    SaveOutlined,
    ReloadOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
    bindDiadocCustomerCounteragent,
    bindDiadocProviderCounteragent,
    getDiadocCounteragents,
    updateDiadocSettings,
    getDiadocStatus,
    listDiadocInboundDocuments,
    listDiadocOutboundDocuments,
    processDiadocInboundDocument,
    syncDiadocInboundDocuments,
} from '../api/diadoc';
import { getCustomersSummary } from '../api/customers';
import { getAllProviders } from '../api/providers';

const { Title, Text } = Typography;

const fmtDateTime = (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—');

const STATUS_COLORS = {
    synced: 'blue',
    registered: 'processing',
    processed: 'success',
    error: 'error',
    draft: 'default',
    sent: 'success',
};

const SYNC_RESULT_LABELS = {
    synced: 'Синхронизирован',
    registered: 'Зарегистрирован',
    processed: 'Обработан',
    error: 'Ошибка',
    draft: 'Черновик',
    sent: 'Отправлен',
};

const BindCounteragentModal = ({
    open,
    onCancel,
    onSubmit,
    submitting,
    targetType,
    counteragent,
    providerOptions,
    customerOptions,
}) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }
        form.setFieldsValue({
            source_system: 'DIADOC_COUNTERAGENT_BOX',
            is_active: true,
            target_id: undefined,
        });
    }, [form, open]);

    const entityOptions = targetType === 'provider'
        ? providerOptions
        : customerOptions;

    const entityLabel = targetType === 'provider' ? 'Поставщик' : 'Клиент';

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            await onSubmit(values);
            form.resetFields();
        } catch {
            // validation handled by antd
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            confirmLoading={submitting}
            okText="Сохранить"
            cancelText="Отмена"
            title={`Привязать контрагента к ${entityLabel.toLowerCase()}`}
        >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                    type="info"
                    showIcon
                    message={counteragent?.full_name || counteragent?.short_name || 'Контрагент'}
                    description={counteragent?.box_id_guid || '—'}
                />
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="target_id"
                        label={entityLabel}
                        rules={[{ required: true, message: `Выберите: ${entityLabel.toLowerCase()}` }]}
                    >
                        <Select
                            showSearch
                            placeholder={`Выберите ${entityLabel.toLowerCase()}`}
                            options={entityOptions}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                </Form>
            </Space>
        </Modal>
    );
};

const DiadocPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [settingsForm] = Form.useForm();
    const [status, setStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(
        searchParams.get('tab') || 'counteragents'
    );

    const [providers, setProviders] = useState([]);
    const [customers, setCustomers] = useState([]);

    const [counteragents, setCounteragents] = useState([]);
    const [counteragentsLoading, setCounteragentsLoading] = useState(false);
    const [counteragentQuery, setCounteragentQuery] = useState('');

    const [bindTargetType, setBindTargetType] = useState('provider');
    const [bindCounteragent, setBindCounteragent] = useState(null);
    const [bindOpen, setBindOpen] = useState(false);
    const [bindLoading, setBindLoading] = useState(false);

    const [inboundRows, setInboundRows] = useState([]);
    const [inboundLoading, setInboundLoading] = useState(false);
    const [inboundFilters, setInboundFilters] = useState({
        providerId: undefined,
        registeredOnly: undefined,
    });
    const [processingDocId, setProcessingDocId] = useState(null);

    const [outboundRows, setOutboundRows] = useState([]);
    const [outboundLoading, setOutboundLoading] = useState(false);
    const [outboundFilters, setOutboundFilters] = useState({
        customerId: undefined,
        providerId: undefined,
    });

    const focusedInboundId = useMemo(() => {
        const value = Number(searchParams.get('incomingId'));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const focusedOutboundId = useMemo(() => {
        const value = Number(searchParams.get('outgoingId'));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const providerOptions = useMemo(
        () => (providers || []).map((item) => ({
            value: item.id,
            label: item.name,
        })),
        [providers]
    );

    const customerOptions = useMemo(
        () => (customers || []).map((item) => ({
            value: item.id,
            label: item.name,
        })),
        [customers]
    );

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const response = await getDiadocStatus();
            const nextStatus = response.data;
            setStatus(nextStatus);
            settingsForm.setFieldsValue({
                seller_legal_address: nextStatus?.seller_legal_address || '',
                seller_postal_address: nextStatus?.seller_postal_address || '',
                signer_full_name: nextStatus?.signer_full_name || '',
                signer_position: nextStatus?.signer_position || '',
                signer_basis: nextStatus?.signer_basis || '',
                formalized_default_function: nextStatus?.formalized_default_function || 'ДОП',
            });
        } catch (err) {
            console.error('Failed to load Diadoc status', err);
            message.error('Не удалось загрузить статус Диадока');
        } finally {
            setStatusLoading(false);
        }
    }, [settingsForm]);

    const loadReferenceData = useCallback(async () => {
        try {
            const [providersList, customersResponse] = await Promise.all([
                getAllProviders({ page_size: 100 }),
                getCustomersSummary({ page: 1, page_size: 200 }),
            ]);
            setProviders(providersList || []);
            setCustomers(customersResponse?.data?.items || []);
        } catch (err) {
            console.error('Failed to load providers/customers', err);
            message.error('Не удалось загрузить поставщиков и клиентов');
        }
    }, []);

    const loadCounteragents = useCallback(async (query = counteragentQuery) => {
        setCounteragentsLoading(true);
        try {
            const response = await getDiadocCounteragents({
                query: query || undefined,
                page_size: 100,
            });
            setCounteragents(response.data?.counteragents || []);
        } catch (err) {
            console.error('Failed to load Diadoc counteragents', err);
            message.error('Не удалось загрузить контрагентов Диадока');
        } finally {
            setCounteragentsLoading(false);
        }
    }, [counteragentQuery]);

    const loadInbound = useCallback(async (nextFilters = inboundFilters) => {
        setInboundLoading(true);
        try {
            const response = await listDiadocInboundDocuments({
                document_id: focusedInboundId || undefined,
                provider_id: nextFilters.providerId || undefined,
                registered_only: nextFilters.registeredOnly,
                limit: 100,
            });
            setInboundRows(response.data || []);
        } catch (err) {
            console.error('Failed to load inbound Diadoc docs', err);
            message.error('Не удалось загрузить входящие документы Диадока');
        } finally {
            setInboundLoading(false);
        }
    }, [focusedInboundId, inboundFilters]);

    const loadOutbound = useCallback(async (nextFilters = outboundFilters) => {
        setOutboundLoading(true);
        try {
            const response = await listDiadocOutboundDocuments({
                document_id: focusedOutboundId || undefined,
                customer_id: nextFilters.customerId || undefined,
                provider_id: nextFilters.providerId || undefined,
                limit: 100,
            });
            setOutboundRows(response.data || []);
        } catch (err) {
            console.error('Failed to load outbound Diadoc docs', err);
            message.error('Не удалось загрузить исходящие документы Диадока');
        } finally {
            setOutboundLoading(false);
        }
    }, [focusedOutboundId, outboundFilters]);

    useEffect(() => {
        loadStatus();
        loadReferenceData();
        loadCounteragents('');
        loadInbound();
        loadOutbound();
    }, [loadCounteragents, loadInbound, loadOutbound, loadReferenceData, loadStatus]);

    useEffect(() => {
        const nextTab = searchParams.get('tab') || 'counteragents';
        setActiveTab(nextTab);
    }, [searchParams]);

    const handleTabChange = (nextTab) => {
        setActiveTab(nextTab);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', nextTab);
        setSearchParams(nextParams);
    };

    const handleSaveFormalizedProfile = async () => {
        try {
            const values = await settingsForm.validateFields();
            setSettingsSaving(true);
            await updateDiadocSettings(values);
            message.success('Профиль формализованного УПД сохранён');
            await loadStatus();
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            console.error('Failed to save Diadoc formalized settings', err);
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить профиль формализованного УПД'
            );
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleSyncInbound = async () => {
        setSyncLoading(true);
        try {
            const response = await syncDiadocInboundDocuments({
                count: Math.max(Number(status?.inbound_sync_count || 50), 1),
                download_content: status?.inbound_download_content ?? true,
                register_supplier_message: status?.inbound_process_enabled ?? true,
                process_supplier_message: status?.inbound_process_enabled ?? true,
            });
            const result = response.data || {};
            message.success(
                `Синхронизация завершена: +${result.created || 0}, обработано ${result.processed_supplier_messages || 0}`
            );
            await Promise.all([loadStatus(), loadInbound()]);
        } catch (err) {
            console.error('Failed to sync Diadoc inbound', err);
            message.error(err?.response?.data?.detail || 'Ошибка синхронизации Диадока');
        } finally {
            setSyncLoading(false);
        }
    };

    const handleProcessInbound = async (row) => {
        setProcessingDocId(row.id);
        try {
            const response = await processDiadocInboundDocument(row.id, {
                provider_id: row.provider_id || undefined,
                download_content_if_missing: true,
                register_if_needed: true,
            });
            const result = response.data || {};
            message.success(
                result.already_processed
                    ? 'Документ уже был обработан ранее'
                    : `Документ обработан, поступлений: ${result.receipt_ids?.length || 0}`
            );
            await loadInbound();
        } catch (err) {
            console.error('Failed to process inbound Diadoc doc', err);
            message.error(err?.response?.data?.detail || 'Ошибка обработки входящего документа');
        } finally {
            setProcessingDocId(null);
        }
    };

    const handleBindCounteragent = async (values) => {
        if (!bindCounteragent) return;
        setBindLoading(true);
        try {
            if (bindTargetType === 'provider') {
                await bindDiadocProviderCounteragent(values.target_id, {
                    counteragent_box_id: bindCounteragent.box_id_guid,
                    source_system: values.source_system,
                    is_active: true,
                });
            } else {
                await bindDiadocCustomerCounteragent(values.target_id, {
                    counteragent_box_id: bindCounteragent.box_id_guid,
                    source_system: values.source_system,
                    is_active: true,
                });
            }
            message.success('Привязка сохранена');
            setBindOpen(false);
            setBindCounteragent(null);
            await loadCounteragents(counteragentQuery);
        } catch (err) {
            console.error('Failed to bind counteragent', err);
            message.error(err?.response?.data?.detail || 'Ошибка сохранения привязки');
        } finally {
            setBindLoading(false);
        }
    };

    const inboundColumns = [
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 140,
            render: (value) => (
                <Tag color={STATUS_COLORS[value] || 'default'}>
                    {SYNC_RESULT_LABELS[value] || value}
                </Tag>
            ),
        },
        {
            title: 'Документ',
            key: 'document',
            width: 240,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.file_name || row.document_number || `#${row.id}`}</Text>
                    <Text type="secondary">
                        {row.document_number || 'Без номера'}
                        {row.document_date ? ` · ${dayjs(row.document_date).format('DD.MM.YYYY')}` : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Контрагент / поставщик',
            key: 'provider',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.provider_name || 'Не сопоставлен'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.counteragent_box_id || '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Получен',
            dataIndex: 'delivery_at',
            width: 160,
            render: fmtDateTime,
        },
        {
            title: 'Связь',
            key: 'links',
            width: 180,
            render: (_, row) => (
                <Space wrap>
                    {Array.isArray(row.supplier_receipt_ids) && row.supplier_receipt_ids.length > 0 ? (
                        <Button
                            size="small"
                            type="link"
                            onClick={() => navigate(`/documents/incoming?openId=${row.supplier_receipt_ids[0]}`)}
                        >
                            Поступление #{row.supplier_receipt_ids[0]}
                        </Button>
                    ) : row.supplier_order_message_id ? (
                        <Tag>msg #{row.supplier_order_message_id}</Tag>
                    ) : (
                        <Text type="secondary">—</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 170,
            render: (_, row) => (
                <Space>
                    <Button
                        size="small"
                        icon={<SyncOutlined />}
                        loading={processingDocId === row.id}
                        disabled={!row.can_process_supplier_message || !row.provider_id}
                        onClick={() => handleProcessInbound(row)}
                    >
                        Обработать
                    </Button>
                </Space>
            ),
        },
    ];

    const outboundColumns = [
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 120,
            render: (value) => (
                <Tag color={STATUS_COLORS[value] || 'default'}>
                    {SYNC_RESULT_LABELS[value] || value}
                </Tag>
            ),
        },
        {
            title: 'Документ',
            key: 'document',
            width: 250,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.file_name || `#${row.id}`}</Text>
                    <Text type="secondary">
                        {row.document_number || 'Без номера'}
                        {row.document_date ? ` · ${dayjs(row.document_date).format('DD.MM.YYYY')}` : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Получатель',
            key: 'recipient',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.customer_name || row.provider_name || 'Не указан'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.to_box_id_guid || '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Источник',
            key: 'source',
            width: 180,
            render: (_, row) => {
                if (row.source_type === 'shipment_document' && row.source_id) {
                    return (
                        <Button
                            size="small"
                            type="link"
                            onClick={() => navigate(`/warehouse/shipments/${row.source_id}`)}
                        >
                            Отгрузка #{row.source_id}
                        </Button>
                    );
                }
                return row.source_type ? (
                    <Tag>{`${row.source_type}${row.source_id ? ` #${row.source_id}` : ''}`}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                );
            },
        },
        {
            title: 'Отправлен',
            dataIndex: 'sent_at',
            width: 160,
            render: fmtDateTime,
        },
    ];

    const counteragentColumns = [
        {
            title: 'Контрагент',
            key: 'counteragent',
            width: 280,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.full_name || row.short_name || '—'}</Text>
                    <Text type="secondary">{row.box_id_guid || row.box_id || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'ИНН / КПП',
            key: 'tax',
            width: 180,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.inn || '—'}</Text>
                    <Text type="secondary">{row.kpp || '—'}</Text>
                </Space>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 160,
            render: (value) => value ? <Tag color="processing">{value}</Tag> : '—',
        },
        {
            title: 'Связано',
            key: 'mapped',
            width: 260,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.mapped_provider_name ? `Поставщик: ${row.mapped_provider_name}` : 'Поставщик: —'}</Text>
                    <Text>{row.mapped_customer_name ? `Клиент: ${row.mapped_customer_name}` : 'Клиент: —'}</Text>
                </Space>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 180,
            render: (_, row) => (
                <Space>
                    <Button
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => {
                            setBindTargetType('provider');
                            setBindCounteragent(row);
                            setBindOpen(true);
                        }}
                    >
                        К поставщику
                    </Button>
                    <Button
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => {
                            setBindTargetType('customer');
                            setBindCounteragent(row);
                            setBindOpen(true);
                        }}
                    >
                        К клиенту
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="page-shell">
            <style>
                {`
                    .diadoc-focused-row > td {
                        background: #fffbe6 !important;
                    }
                `}
            </style>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card loading={statusLoading}>
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                        <Col>
                            <Space direction="vertical" size={4}>
                                <Title level={3} style={{ margin: 0 }}>Диадок</Title>
                                <Text type="secondary">
                                    Отдельный операционный реестр для входящих, исходящих, sync-статусов и привязок контрагентов.
                                </Text>
                            </Space>
                        </Col>
                        <Col>
                            <Space wrap>
                                <Button
                                    icon={<ReloadOutlined />}
                                    onClick={() => {
                                        loadStatus();
                                        loadCounteragents(counteragentQuery);
                                        loadInbound();
                                        loadOutbound();
                                    }}
                                >
                                    Обновить
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<SyncOutlined />}
                                    onClick={handleSyncInbound}
                                    loading={syncLoading}
                                    disabled={!status?.connected}
                                >
                                    Синхронизировать входящие
                                </Button>
                            </Space>
                        </Col>
                    </Row>

                    {!status?.configured && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="warning"
                            showIcon
                            message="Диадок ещё не настроен"
                            description="На backend не хватает OAuth-конфигурации или подключение ещё не завершено."
                        />
                    )}

                    {status?.configured && !status?.connected && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="info"
                            showIcon
                            message="Диадок настроен, но не подключён"
                            description="Сначала нужно пройти OAuth-подключение в админском контуре."
                        />
                    )}

                    <Descriptions
                        style={{ marginTop: 16 }}
                        bordered
                        size="small"
                        column={{ xs: 1, sm: 2, xl: 4 }}
                    >
                        <Descriptions.Item label="Окружение">
                            <Tag color={status?.environment === 'prod' ? 'red' : 'blue'}>
                                {status?.environment || '—'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Подключение">
                            <Tag color={status?.connected ? 'success' : 'default'}>
                                {status?.connected ? 'Подключено' : 'Не подключено'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Организация">
                            {status?.organization_name || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Ящик">
                            {status?.box_id_guid || status?.box_id || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Пользователь">
                            {status?.connected_user_name || '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Последний sync">
                            {fmtDateTime(status?.last_sync_at)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Автообработка входящих">
                            <Tag color={status?.inbound_process_enabled ? 'success' : 'default'}>
                                {status?.inbound_process_enabled ? 'Включена' : 'Выключена'}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Лимит sync">
                            {status?.inbound_sync_count || 0}
                        </Descriptions.Item>
                    </Descriptions>

                    {status?.last_error && (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message="Последняя ошибка Диадока"
                            description={status.last_error}
                        />
                    )}
                </Card>

                {(focusedInboundId || focusedOutboundId) && (
                    <Alert
                        type="info"
                        showIcon
                        message="Открыта конкретная запись Диадока"
                        description={
                            focusedInboundId
                                ? `Фокус на входящем документе #${focusedInboundId}`
                                : `Фокус на исходящем документе #${focusedOutboundId}`
                        }
                    />
                )}

                <Card
                    title="Профиль формализованного УПД"
                    extra={(
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSaveFormalizedProfile}
                            loading={settingsSaving}
                        >
                            Сохранить профиль
                        </Button>
                    )}
                >
                    <Alert
                        style={{ marginBottom: 16 }}
                        type="info"
                        showIcon
                        message="Этот профиль используется для подготовки формализованного исходящего УПД"
                        description="Юридические реквизиты контрагента заполняются на карточке клиента. Здесь хранятся данные продавца и подписанта."
                    />
                    <Form form={settingsForm} layout="vertical">
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="seller_legal_address"
                                    label="Юридический адрес продавца"
                                >
                                    <Input placeholder="Юридический адрес организации" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="seller_postal_address"
                                    label="Почтовый адрес продавца"
                                >
                                    <Input placeholder="Почтовый адрес организации" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_full_name"
                                    label="ФИО подписанта"
                                >
                                    <Input placeholder="Иванов Иван Иванович" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_position"
                                    label="Должность подписанта"
                                >
                                    <Input placeholder="Генеральный директор" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="signer_basis"
                                    label="Основание полномочий"
                                >
                                    <Input placeholder="Устав / Доверенность №..." />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="formalized_default_function"
                                    label="Функция УПД по умолчанию"
                                >
                                    <Select
                                        options={[
                                            { value: 'ДОП', label: 'ДОП' },
                                            { value: 'СЧФДОП', label: 'СЧФДОП' },
                                            { value: 'СЧФ', label: 'СЧФ' },
                                        ]}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Descriptions
                                    size="small"
                                    bordered
                                    column={1}
                                    style={{ marginTop: 30 }}
                                >
                                    <Descriptions.Item label="Организация Диадока">
                                        {status?.organization_name || '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="ИНН / КПП">
                                        {status?.organization_inn || '—'}
                                        {status?.organization_kpp ? ` / ${status.organization_kpp}` : ''}
                                    </Descriptions.Item>
                                </Descriptions>
                            </Col>
                        </Row>
                    </Form>
                </Card>

                <Tabs
                    activeKey={activeTab}
                    onChange={handleTabChange}
                    items={[
                        {
                            key: 'counteragents',
                            label: 'Контрагенты',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={16}>
                                            <Input.Search
                                                allowClear
                                                placeholder="Поиск по имени, ИНН, КПП"
                                                value={counteragentQuery}
                                                onChange={(event) => setCounteragentQuery(event.target.value)}
                                                onSearch={(value) => {
                                                    setCounteragentQuery(value);
                                                    loadCounteragents(value);
                                                }}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadCounteragents(counteragentQuery)}
                                                loading={counteragentsLoading}
                                            >
                                                Обновить контрагентов
                                            </Button>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey={(row) => row.box_id_guid || row.box_id}
                                        size="small"
                                        loading={counteragentsLoading}
                                        dataSource={counteragents}
                                        columns={counteragentColumns}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1100 }}
                                    />
                                </Card>
                            ),
                        },
                        {
                            key: 'inbound',
                            label: 'Входящие',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Поставщик"
                                                value={inboundFilters.providerId}
                                                onChange={(value) => setInboundFilters((prev) => ({ ...prev, providerId: value || undefined }))}
                                                options={providerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Select
                                                style={{ width: '100%' }}
                                                value={String(inboundFilters.registeredOnly ?? 'all')}
                                                onChange={(value) => setInboundFilters((prev) => ({
                                                    ...prev,
                                                    registeredOnly: value === 'all' ? undefined : value === 'true',
                                                }))}
                                                options={[
                                                    { value: 'all', label: 'Все документы' },
                                                    { value: 'true', label: 'Только зарегистрированные' },
                                                    { value: 'false', label: 'Только незарегистрированные' },
                                                ]}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadInbound(inboundFilters)}
                                                loading={inboundLoading}
                                            >
                                                Обновить входящие
                                            </Button>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        loading={inboundLoading}
                                        dataSource={inboundRows}
                                        columns={inboundColumns}
                                        rowClassName={(row) => (
                                            focusedInboundId && row.id === focusedInboundId
                                                ? 'diadoc-focused-row'
                                                : ''
                                        )}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1200 }}
                                    />
                                </Card>
                            ),
                        },
                        {
                            key: 'outbound',
                            label: 'Исходящие',
                            children: (
                                <Card>
                                    <Row gutter={12} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Клиент"
                                                value={outboundFilters.customerId}
                                                onChange={(value) => setOutboundFilters((prev) => ({ ...prev, customerId: value || undefined }))}
                                                options={customerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Select
                                                allowClear
                                                showSearch
                                                style={{ width: '100%' }}
                                                placeholder="Поставщик"
                                                value={outboundFilters.providerId}
                                                onChange={(value) => setOutboundFilters((prev) => ({ ...prev, providerId: value || undefined }))}
                                                options={providerOptions}
                                                optionFilterProp="label"
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Button
                                                block
                                                icon={<ReloadOutlined />}
                                                onClick={() => loadOutbound(outboundFilters)}
                                                loading={outboundLoading}
                                            >
                                                Обновить исходящие
                                            </Button>
                                        </Col>
                                    </Row>
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        loading={outboundLoading}
                                        dataSource={outboundRows}
                                        columns={outboundColumns}
                                        rowClassName={(row) => (
                                            focusedOutboundId && row.id === focusedOutboundId
                                                ? 'diadoc-focused-row'
                                                : ''
                                        )}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 1100 }}
                                    />
                                </Card>
                            ),
                        },
                    ]}
                />
            </Space>

            <BindCounteragentModal
                open={bindOpen}
                onCancel={() => {
                    setBindOpen(false);
                    setBindCounteragent(null);
                }}
                onSubmit={handleBindCounteragent}
                submitting={bindLoading}
                targetType={bindTargetType}
                counteragent={bindCounteragent}
                providerOptions={providerOptions}
                customerOptions={customerOptions}
            />
        </div>
    );
};

export default DiadocPage;
