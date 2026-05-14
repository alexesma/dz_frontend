import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
} from 'antd';
import { EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    createCustomerReturn,
    createSupplierReturn,
    listCustomerReturns,
    listSupplierReturns,
} from '../api/inventory';
import { getCustomers } from '../api/customers';
import { getProviders } from '../api/providers';
import { getWarehouses } from '../api/storage';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;

const STATUS_COLORS = {
    created: 'default',
    approved: 'processing',
    shipped: 'warning',
    confirmed: 'success',
    rejected: 'error',
};

const STATUS_LABELS = {
    created: 'Создан',
    approved: 'Согласован',
    shipped: 'Отправлен',
    confirmed: 'Подтвержден',
    rejected: 'Отклонён',
};

const DIADOC_STATUS_COLORS = {
    draft: 'blue',
    sent: 'processing',
    delivered: 'cyan',
    error: 'error',
};

const DIADOC_STATUS_LABELS = {
    draft: 'Черновик',
    sent: 'Отправлен',
    delivered: 'Доставлен',
    error: 'Ошибка',
};

const RETURN_TABS = [
    { key: 'customer', label: 'От клиентов' },
    { key: 'supplier', label: 'Поставщикам' },
];

const toOptions = (rows = [], labelField = 'name') =>
    rows.map((row) => ({
        value: row.id,
        label: row[labelField] || `#${row.id}`,
    }));

const normalizePagedItems = (payload) => (
    Array.isArray(payload) ? payload : (payload?.items || [])
);

const fmtDate = (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—');

const ReturnsPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState('customer');
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [rows, setRows] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [providers, setProviders] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [filters, setFilters] = useState({});
    const [filterForm] = Form.useForm();
    const [createForm] = Form.useForm();

    const loadReferenceOptions = useCallback(async () => {
        try {
            const [customerRes, providerRes, warehouseRes] = await Promise.all([
                getCustomers({ page_size: 200 }),
                getProviders({ page_size: 200 }),
                getWarehouses({ limit: 200 }),
            ]);
            setCustomers(toOptions(normalizePagedItems(customerRes.data)));
            setProviders(toOptions(normalizePagedItems(providerRes.data)));
            setWarehouses(
                (warehouseRes.data?.items || warehouseRes.data || []).map((item) => ({
                    value: item.id,
                    label: item.name,
                }))
            );
        } catch (err) {
            console.error('Failed to load return reference options', err);
        }
    }, []);

    const loadRows = useCallback(async (tab = activeTab, nextFilters = filters) => {
        setLoading(true);
        try {
            const params = Object.fromEntries(
                Object.entries(nextFilters || {}).filter(
                    ([, value]) => value !== undefined && value !== null && value !== ''
                )
            );
            const response = tab === 'customer'
                ? await listCustomerReturns(params)
                : await listSupplierReturns(params);
            setRows(response.data || []);
        } catch (err) {
            console.error('Failed to load returns', err);
            message.error('Не удалось загрузить возвраты');
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters]);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    useEffect(() => {
        const requestedTab = searchParams.get('tab');
        if (requestedTab === 'customer' || requestedTab === 'supplier') {
            setActiveTab(requestedTab);
        }
        if (searchParams.get('create') === '1') {
            setCreateOpen(true);
        }
    }, [searchParams]);

    useEffect(() => {
        if (createOpen) {
            loadReferenceOptions();
            createForm.resetFields();
        }
    }, [createOpen, createForm, loadReferenceOptions]);

    useEffect(() => {
        if (!createOpen) return;

        const nextValues = {
            warehouse_id: undefined,
            customer_id: undefined,
            shipment_document_id: undefined,
            provider_id: undefined,
            supplier_receipt_id: undefined,
        };

        if (activeTab === 'customer') {
            nextValues.customer_id = searchParams.get('customerId')
                ? Number(searchParams.get('customerId'))
                : undefined;
            nextValues.shipment_document_id = searchParams.get('shipmentId')
                ? Number(searchParams.get('shipmentId'))
                : undefined;
        } else {
            nextValues.provider_id = searchParams.get('providerId')
                ? Number(searchParams.get('providerId'))
                : undefined;
            nextValues.supplier_receipt_id = searchParams.get('supplierReceiptId')
                ? Number(searchParams.get('supplierReceiptId'))
                : undefined;
        }

        createForm.setFieldsValue(nextValues);
    }, [activeTab, createForm, createOpen, searchParams]);

    const closeCreateModal = useCallback(() => {
        setCreateOpen(false);
        if (searchParams.get('create') === '1') {
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const applyFilters = async () => {
        const values = filterForm.getFieldsValue();
        const nextFilters = {
            status: values.status || undefined,
        };
        setFilters(nextFilters);
        await loadRows(activeTab, nextFilters);
    };

    const resetFilters = async () => {
        filterForm.resetFields();
        const nextFilters = {};
        setFilters(nextFilters);
        await loadRows(activeTab, nextFilters);
    };

    const handleCreate = async () => {
        let values;
        try {
            values = await createForm.validateFields();
        } catch {
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                doc_number: values.doc_number || null,
                warehouse_id: values.warehouse_id || null,
                reason: values.reason || null,
                notes: values.notes || null,
            };
            let response;
            if (activeTab === 'customer') {
                response = await createCustomerReturn({
                    ...payload,
                    customer_id: values.customer_id || null,
                    shipment_document_id: values.shipment_document_id || null,
                });
            } else {
                response = await createSupplierReturn({
                    ...payload,
                    provider_id: values.provider_id || null,
                    supplier_receipt_id: values.supplier_receipt_id || null,
                });
            }
            message.success('Возврат создан');
            closeCreateModal();
            await loadRows();
            navigate(
                activeTab === 'customer'
                    ? `/warehouse/returns/customer/${response.data.id}`
                    : `/warehouse/returns/supplier/${response.data.id}`
            );
        } catch (err) {
            console.error('Failed to create return', err);
            message.error(err?.response?.data?.detail || 'Не удалось создать возврат');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = useMemo(() => {
        const partyTitle = activeTab === 'customer' ? 'Клиент' : 'Поставщик';
        const partyField = activeTab === 'customer' ? 'customer_name' : 'provider_name';
        const sourceTitle = activeTab === 'customer' ? 'Отгрузка' : 'Поступление';
        const sourceField = activeTab === 'customer' ? 'shipment_document_id' : 'supplier_receipt_id';
        const baseColumns = [
            {
                title: 'Документ',
                key: 'doc',
                render: (_, record) => (
                    <Space direction="vertical" size={0}>
                        <Text strong>{record.doc_number || `#${record.id}`}</Text>
                        <Text type="secondary">{fmtDate(record.doc_date)}</Text>
                    </Space>
                ),
            },
            {
                title: 'Статус',
                dataIndex: 'status',
                render: (value) => (
                    <Tag color={STATUS_COLORS[value] || 'default'}>
                        {STATUS_LABELS[value] || value}
                    </Tag>
                ),
            },
            {
                title: partyTitle,
                dataIndex: partyField,
                render: (value) => value || '—',
            },
            {
                title: sourceTitle,
                dataIndex: sourceField,
                render: (value) => (value ? `#${value}` : '—'),
            },
            {
                title: 'Количество',
                dataIndex: 'total_quantity',
                width: 120,
            },
            {
                title: 'Причина',
                dataIndex: 'reason',
                render: (value) => value || '—',
            },
        ];

        if (user?.role === 'admin') {
            baseColumns.push({
                title: 'Диадок',
                key: 'diadoc',
                render: (_, record) => {
                    if (!record.diadoc_outgoing_document_id) {
                        return <Text type="secondary">Не отправлен</Text>;
                    }
                    const diadocStatus = record.diadoc_outgoing_status || 'draft';
                    return (
                        <Space direction="vertical" size={0}>
                            <Tag color={DIADOC_STATUS_COLORS[diadocStatus] || 'blue'}>
                                {DIADOC_STATUS_LABELS[diadocStatus] || 'Черновик'}
                            </Tag>
                            <Button
                                type="link"
                                size="small"
                                style={{ padding: 0 }}
                                onClick={() => navigate(
                                    `/documents/diadoc?tab=outgoing&outgoingId=${record.diadoc_outgoing_document_id}`
                                )}
                            >
                                Документ #{record.diadoc_outgoing_document_id}
                            </Button>
                        </Space>
                    );
                },
            });
        }

        baseColumns.push({
                title: 'Действия',
                key: 'actions',
                width: 120,
                render: (_, record) => (
                    <Button
                        icon={<EyeOutlined />}
                        onClick={() => navigate(
                            activeTab === 'customer'
                                ? `/warehouse/returns/customer/${record.id}`
                                : `/warehouse/returns/supplier/${record.id}`
                        )}
                    >
                        Открыть
                    </Button>
                ),
            });

        return baseColumns;
    }, [activeTab, navigate, user?.role]);

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card>
                <Space
                    align="start"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    wrap
                >
                    <div>
                        <Title level={3} style={{ marginBottom: 4 }}>
                            Возвраты
                        </Title>
                        <Text type="secondary">
                            Отдельный поток для возвратов от клиентов и возвратов поставщикам.
                        </Text>
                    </div>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => loadRows()}>
                            Обновить
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Новый возврат
                        </Button>
                    </Space>
                </Space>
            </Card>

            <Card>
                <Tabs
                    activeKey={activeTab}
                    items={RETURN_TABS.map((item) => ({ ...item, children: null }))}
                    onChange={(key) => {
                        setActiveTab(key);
                        setFilters({});
                        filterForm.resetFields();
                        if (searchParams.get('tab')) {
                            setSearchParams({}, { replace: true });
                        }
                        loadRows(key, {});
                    }}
                />

                <Form form={filterForm} layout="inline" style={{ marginBottom: 16 }}>
                    <Form.Item name="status" label="Статус">
                        <Select
                            allowClear
                            placeholder="Любой"
                            style={{ width: 180 }}
                            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                                value,
                                label,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item>
                        <Space>
                            <Button type="primary" onClick={applyFilters}>
                                Применить
                            </Button>
                            <Button onClick={resetFilters}>
                                Сбросить
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>

                <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={rows}
                    columns={columns}
                    pagination={false}
                />
            </Card>

            <Modal
                open={createOpen}
                title={
                    activeTab === 'customer'
                        ? 'Новый возврат от клиента'
                        : 'Новый возврат поставщику'
                }
                onCancel={closeCreateModal}
                onOk={handleCreate}
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={submitting}
                width={640}
            >
                <Form form={createForm} layout="vertical">
                    <Space style={{ width: '100%' }} size={12} align="start">
                        <Form.Item name="doc_number" label="Номер документа" style={{ flex: 1 }}>
                            <Input placeholder="Необязательно" />
                        </Form.Item>
                        <Form.Item name="warehouse_id" label="Склад" style={{ flex: 1 }}>
                            <Select allowClear options={warehouses} />
                        </Form.Item>
                    </Space>

                    {activeTab === 'customer' ? (
                        <Space style={{ width: '100%' }} size={12} align="start">
                            <Form.Item name="customer_id" label="Клиент" style={{ flex: 1 }}>
                                <Select allowClear showSearch options={customers} optionFilterProp="label" />
                            </Form.Item>
                            <Form.Item
                                name="shipment_document_id"
                                label="ID исходной отгрузки"
                                style={{ flex: 1 }}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} />
                            </Form.Item>
                        </Space>
                    ) : (
                        <Space style={{ width: '100%' }} size={12} align="start">
                            <Form.Item name="provider_id" label="Поставщик" style={{ flex: 1 }}>
                                <Select allowClear showSearch options={providers} optionFilterProp="label" />
                            </Form.Item>
                            <Form.Item
                                name="supplier_receipt_id"
                                label="ID исходного поступления"
                                style={{ flex: 1 }}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} />
                            </Form.Item>
                        </Space>
                    )}

                    <Form.Item name="reason" label="Причина возврата">
                        <Input placeholder="Брак, пересорт, не подошло и т.д." />
                    </Form.Item>
                    <Form.Item name="notes" label="Примечание">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Space>
    );
};

export default ReturnsPage;
