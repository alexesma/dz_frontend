import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Descriptions,
    Drawer,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CloudDownloadOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    assignReclamationCustomer,
    createReclamation,
    getReclamation,
    getReclamationsSummary,
    listReclamations,
    syncReclamations,
} from '../api/reclamations';
import { getCustomersSummary } from '../api/customers';

const { Title, Text, Paragraph } = Typography;

const STATUS_META = {
    new: { label: 'Новая', color: 'default' },
    recognized: { label: 'Распознана', color: 'blue' },
    checked: { label: 'Проверена', color: 'cyan' },
    waiting_docs: { label: 'Ждём документы', color: 'orange' },
    waiting_supplier: { label: 'Ждём поставщика', color: 'gold' },
    approved: { label: 'Согласована', color: 'green' },
    rejected: { label: 'Отклонена', color: 'red' },
    closed: { label: 'Закрыта', color: 'default' },
};

const TYPE_META = {
    customer_refusal: { label: 'Отказ клиента', color: 'blue' },
    defect: { label: 'Брак', color: 'volcano' },
    other: { label: 'Прочее', color: 'default' },
};

const SOURCE_LABELS = {
    email: 'Письмо',
    link: 'Ссылка',
    manual: 'Вручную',
};

const ATTACHMENT_KIND_LABELS = {
    removal_order: 'Заказ-наряд на снятие',
    installation_order: 'Заказ-наряд на установку',
    defect_report: 'Дефектовка',
    photo: 'Фото',
    other: 'Прочее',
};

const fmtDateTime = (v) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—');

const ReclamationsPage = () => {
    const [summary, setSummary] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [customerOptions, setCustomerOptions] = useState([]);

    const [detail, setDetail] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [assignCustomerId, setAssignCustomerId] = useState(null);
    const [rememberEmail, setRememberEmail] = useState(true);
    const [assigning, setAssigning] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm] = Form.useForm();
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [sumResp, listResp] = await Promise.all([
                getReclamationsSummary(),
                listReclamations({
                    status: statusFilter || undefined,
                    limit: 300,
                }),
            ]);
            setSummary(sumResp.data || null);
            setRows(Array.isArray(listResp.data) ? listResp.data : []);
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось загрузить рекламации'
            );
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await getCustomersSummary({
                    page: 1,
                    page_size: 500,
                });
                const items = Array.isArray(data?.items) ? data.items : [];
                setCustomerOptions(
                    items.map((c) => ({ value: c.id, label: c.name }))
                );
            } catch {
                setCustomerOptions([]);
            }
        })();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const { data } = await syncReclamations();
            if (data?.note) {
                message.warning(data.note);
            } else {
                message.success(
                    `Проверено писем: ${data.fetched}, новых рекламаций: ${data.created}`
                );
            }
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Синхронизация не удалась'
            );
        } finally {
            setSyncing(false);
        }
    };

    const openDetail = async (id) => {
        try {
            const { data } = await getReclamation(id);
            setDetail(data);
            setAssignCustomerId(data.customer_id || null);
            setRememberEmail(true);
            setDetailOpen(true);
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось открыть рекламацию'
            );
        }
    };

    const handleAssign = async () => {
        if (!detail || !assignCustomerId) {
            message.warning('Выберите клиента');
            return;
        }
        setAssigning(true);
        try {
            const { data } = await assignReclamationCustomer(detail.id, {
                customer_id: assignCustomerId,
                remember_email: rememberEmail,
            });
            setDetail(data);
            message.success('Клиент привязан');
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось привязать клиента'
            );
        } finally {
            setAssigning(false);
        }
    };

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            setCreating(true);
            const { data } = await createReclamation(values);
            message.success('Рекламация создана');
            setCreateOpen(false);
            createForm.resetFields();
            await load();
            await openDetail(data.id);
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error(
                err?.response?.data?.detail || 'Не удалось создать рекламацию'
            );
        } finally {
            setCreating(false);
        }
    };

    const byStatus = summary?.by_status || {};

    const columns = [
        {
            title: '#',
            dataIndex: 'id',
            width: 60,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 150,
            render: (v) => {
                const meta = STATUS_META[v] || { label: v, color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Тип',
            dataIndex: 'reclamation_type',
            width: 130,
            render: (v) =>
                v ? (
                    <Tag color={(TYPE_META[v] || {}).color || 'default'}>
                        {(TYPE_META[v] || {}).label || v}
                    </Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Клиент',
            key: 'customer',
            width: 220,
            render: (_, row) =>
                row.customer_name || (
                    <Tag color="orange">не определён</Tag>
                ),
        },
        {
            title: 'Тема / отправитель',
            key: 'subject',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.email_subject || '—'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.sender_email || ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Документ',
            dataIndex: 'stated_document_number',
            width: 130,
            render: (v) => v || '—',
        },
        {
            title: 'Поз.',
            dataIndex: 'items_count',
            width: 60,
        },
        {
            title: 'Получена',
            dataIndex: 'email_received_at',
            width: 140,
            render: fmtDateTime,
        },
        {
            title: '',
            key: 'action',
            width: 90,
            render: (_, row) => (
                <Button size="small" onClick={() => openDetail(row.id)}>
                    Открыть
                </Button>
            ),
        },
    ];

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Space
                    style={{ justifyContent: 'space-between', width: '100%' }}
                    wrap
                >
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            Рекламации
                        </Title>
                        <Text type="secondary">
                            Претензии клиентов: приём из почты, распознавание,
                            привязка клиента
                        </Text>
                    </div>
                    <Space>
                        <Button
                            icon={<CloudDownloadOutlined />}
                            loading={syncing}
                            onClick={handleSync}
                        >
                            Проверить почту
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Завести вручную
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={load}
                        >
                            Обновить
                        </Button>
                    </Space>
                </Space>

                <Row gutter={[12, 12]}>
                    <Col xs={12} md={4}>
                        <Statistic title="Всего" value={summary?.total ?? 0} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Новые"
                            value={byStatus.new ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Распознаны"
                            value={byStatus.recognized ?? 0}
                            valueStyle={{ color: '#2563eb' }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Ждут документы"
                            value={byStatus.waiting_docs ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Ждут поставщика"
                            value={byStatus.waiting_supplier ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Без клиента"
                            value={summary?.without_customer ?? 0}
                            valueStyle={{
                                color: summary?.without_customer
                                    ? '#ea580c'
                                    : undefined,
                            }}
                        />
                    </Col>
                </Row>

                <Space wrap>
                    <Select
                        allowClear
                        placeholder="Статус"
                        style={{ width: 220 }}
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v || null)}
                        options={Object.entries(STATUS_META).map(
                            ([value, meta]) => ({ value, label: meta.label })
                        )}
                    />
                </Space>

                <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={rows}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: 'Рекламаций пока нет' }}
                />
            </Space>

            <Drawer
                open={detailOpen}
                width={640}
                title={detail ? `Рекламация #${detail.id}` : 'Рекламация'}
                onClose={() => setDetailOpen(false)}
            >
                {detail ? (
                    <Space
                        direction="vertical"
                        size="middle"
                        style={{ width: '100%' }}
                    >
                        {!detail.customer_id ? (
                            <Alert
                                type="warning"
                                showIcon
                                message="Клиент не определён"
                                description="Адрес отправителя не привязан ни к одному клиенту. Выберите клиента ниже."
                            />
                        ) : null}

                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Статус">
                                <Tag
                                    color={
                                        (STATUS_META[detail.status] || {})
                                            .color || 'default'
                                    }
                                >
                                    {(STATUS_META[detail.status] || {}).label ||
                                        detail.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Тип">
                                {detail.reclamation_type
                                    ? (TYPE_META[detail.reclamation_type] || {})
                                          .label || detail.reclamation_type
                                    : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Источник">
                                {SOURCE_LABELS[detail.source] || detail.source}
                                {detail.source_link ? (
                                    <>
                                        {' · '}
                                        <a
                                            href={detail.source_link}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            открыть портал
                                        </a>
                                    </>
                                ) : null}
                            </Descriptions.Item>
                            <Descriptions.Item label="Клиент">
                                {detail.customer_name || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отправитель">
                                {detail.sender_email || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Документ">
                                {detail.stated_document_number || '—'}
                                {detail.stated_document_date
                                    ? ` от ${dayjs(detail.stated_document_date).format('DD.MM.YYYY')}`
                                    : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label="Тема">
                                {detail.email_subject || '—'}
                            </Descriptions.Item>
                        </Descriptions>

                        <Card size="small" title="Привязка клиента">
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Select
                                    showSearch
                                    placeholder="Выберите клиента"
                                    style={{ width: '100%' }}
                                    value={assignCustomerId}
                                    onChange={setAssignCustomerId}
                                    options={customerOptions}
                                    optionFilterProp="label"
                                />
                                <Space>
                                    <Select
                                        style={{ width: 260 }}
                                        value={rememberEmail}
                                        onChange={setRememberEmail}
                                        options={[
                                            {
                                                value: true,
                                                label: 'Запомнить адрес за клиентом',
                                            },
                                            {
                                                value: false,
                                                label: 'Только эту рекламацию',
                                            },
                                        ]}
                                    />
                                    <Button
                                        type="primary"
                                        loading={assigning}
                                        onClick={handleAssign}
                                    >
                                        Привязать
                                    </Button>
                                </Space>
                            </Space>
                        </Card>

                        <Card
                            size="small"
                            title={`Позиции (${(detail.items || []).length})`}
                        >
                            {(detail.items || []).length ? (
                                <Table
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                    dataSource={detail.items}
                                    columns={[
                                        {
                                            title: 'Артикул',
                                            dataIndex: 'oem_number',
                                        },
                                        {
                                            title: 'Наименование',
                                            dataIndex: 'autopart_name',
                                        },
                                        {
                                            title: 'Кол-во',
                                            dataIndex: 'quantity',
                                            width: 70,
                                        },
                                    ]}
                                />
                            ) : (
                                <Text type="secondary">
                                    Артикулы не распознаны — можно уточнить
                                    вручную позже.
                                </Text>
                            )}
                        </Card>

                        {(detail.attachments || []).length ? (
                            <Card size="small" title="Вложения">
                                <Space direction="vertical">
                                    {detail.attachments.map((att) => (
                                        <Text key={att.id}>
                                            <Tag>
                                                {ATTACHMENT_KIND_LABELS[
                                                    att.kind
                                                ] || att.kind}
                                            </Tag>
                                            {att.file_name}
                                        </Text>
                                    ))}
                                </Space>
                            </Card>
                        ) : null}

                        <Card size="small" title="Текст письма">
                            <Paragraph
                                style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
                                type="secondary"
                            >
                                {detail.email_body || '—'}
                            </Paragraph>
                        </Card>
                    </Space>
                ) : null}
            </Drawer>

            <Modal
                open={createOpen}
                title="Завести рекламацию вручную"
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={creating}
                onOk={handleCreate}
                onCancel={() => setCreateOpen(false)}
            >
                <Form form={createForm} layout="vertical">
                    <Form.Item name="customer_id" label="Клиент">
                        <Select
                            allowClear
                            showSearch
                            placeholder="Клиент (если известен)"
                            options={customerOptions}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item name="source_link" label="Ссылка на портал">
                        <Input placeholder="https://portal.client.ru/..." />
                    </Form.Item>
                    <Form.Item name="subject" label="Тема">
                        <Input placeholder="Кратко о рекламации" />
                    </Form.Item>
                    <Form.Item name="body" label="Текст">
                        <Input.TextArea
                            rows={5}
                            placeholder="Вставьте текст рекламации / с портала. Система попробует распознать артикулы, документ и причину."
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default ReclamationsPage;
