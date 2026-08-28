import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    LinkOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { getBrands } from '../api/brands';
import {
    applyCertificateToBrand,
    createCertificate,
    deleteCertificate,
    getCertificateAutoparts,
    getCertificates,
    unlinkAutopart,
    updateCertificate,
} from '../api/certificates';

const { Text, Title } = Typography;

// Откуда взялась привязка — важно при разборе спорной позиции.
const SOURCE_LABELS = {
    supplier_doc: 'документ поставщика',
    brand_certificate: 'сертификат на бренд',
    rule: 'правило по названию',
    manual: 'вручную',
    registry: 'реестр',
};

const formatDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString('ru-RU');
};

const CertificatesPage = () => {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [search, setSearch] = useState('');
    const [onlyExpiring, setOnlyExpiring] = useState(false);
    const [brands, setBrands] = useState([]);

    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const [partsOf, setPartsOf] = useState(null);
    const [parts, setParts] = useState([]);
    const [partsTotal, setPartsTotal] = useState(0);
    const [partsPage, setPartsPage] = useState(1);
    const [partsLoading, setPartsLoading] = useState(false);

    const [brandOpen, setBrandOpen] = useState(false);
    const [brandTarget, setBrandTarget] = useState(null);
    const [brandId, setBrandId] = useState(null);
    const [onlyUndetermined, setOnlyUndetermined] = useState(true);
    const [preview, setPreview] = useState(null);
    const [applying, setApplying] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getCertificates({
                page,
                page_size: pageSize,
                search: search || undefined,
                only_expiring: onlyExpiring || undefined,
            });
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось загрузить список'
            );
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, onlyExpiring]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        getBrands()
            .then(({ data }) => {
                const rows = Array.isArray(data) ? data : data?.items || [];
                setBrands(rows.map((b) => ({ value: b.id, label: b.name })));
            })
            .catch(() => setBrands([]));
    }, []);

    const openEdit = (record) => {
        setEditing(record || null);
        form.setFieldsValue(
            record
                ? {
                    number: record.number,
                    url: record.url,
                    brand_id: record.brand_id,
                    valid_until: record.valid_until,
                    applicant: record.applicant,
                    scope: record.scope,
                }
                : {
                    number: '', url: '', brand_id: null,
                    valid_until: '', applicant: '', scope: '',
                }
        );
        setEditOpen(true);
    };

    const submitEdit = async () => {
        let values;
        try { values = await form.validateFields(); } catch { return; }
        // Пустая строка означает «очистить», поэтому шлём null, а не "".
        const payload = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
                key,
                value === '' ? null : value,
            ])
        );
        try {
            if (editing) {
                await updateCertificate(editing.id, payload);
                message.success('Сертификат обновлён');
            } else {
                await createCertificate(payload);
                message.success('Сертификат добавлен');
            }
            setEditOpen(false);
            await load();
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось сохранить'
            );
        }
    };

    const loadParts = useCallback(async (certificate, nextPage = 1) => {
        setPartsLoading(true);
        try {
            const { data } = await getCertificateAutoparts(certificate.id, {
                page: nextPage,
                page_size: 50,
            });
            setParts(data.items || []);
            setPartsTotal(data.total || 0);
            setPartsPage(nextPage);
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось загрузить позиции'
            );
        } finally {
            setPartsLoading(false);
        }
    }, []);

    const openParts = (record) => {
        setPartsOf(record);
        void loadParts(record, 1);
    };

    const openBrand = (record) => {
        setBrandTarget(record);
        setBrandId(record.brand_id ?? null);
        setOnlyUndetermined(true);
        setPreview(null);
        setBrandOpen(true);
    };

    // Предпросмотр и применение — один эндпоинт, отличается только dry_run.
    const runBrand = async (dryRun) => {
        if (!brandId) {
            message.warning('Выберите бренд');
            return;
        }
        setApplying(true);
        try {
            const { data } = await applyCertificateToBrand(brandTarget.id, {
                brand_id: brandId,
                dry_run: dryRun,
                only_undetermined: onlyUndetermined,
            });
            setPreview(data);
            if (!dryRun) {
                message.success(`Привязано позиций: ${data.linked}`);
                setBrandOpen(false);
                await load();
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось применить'
            );
        } finally {
            setApplying(false);
        }
    };

    const columns = [
        {
            title: 'Номер',
            dataIndex: 'number',
            render: (value, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong copyable={{ text: value }}>{value}</Text>
                    {row.url ? (
                        <a href={row.url} target="_blank" rel="noreferrer">
                            <LinkOutlined /> проверить в реестре
                        </a>
                    ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            ссылка не заполнена
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            width: 150,
            render: (value, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{value || '—'}</Text>
                    {row.covers_whole_brand ? (
                        <Tag color="blue">на весь бренд</Tag>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Действует до',
            dataIndex: 'valid_until',
            width: 140,
            render: (value, row) => (
                row.is_expired
                    ? <Tag color="red">истёк {formatDate(value)}</Tag>
                    : <Text>{formatDate(value)}</Text>
            ),
        },
        {
            title: 'Позиций',
            dataIndex: 'autopart_count',
            width: 110,
            render: (value, row) => (
                <Button type="link" size="small" onClick={() => openParts(row)}>
                    {value}
                </Button>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 150,
            render: (_, row) => (
                <Space size={4}>
                    <Tooltip title="Редактировать">
                        <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEdit(row)}
                        />
                    </Tooltip>
                    <Tooltip title="Применить к бренду">
                        <Button
                            size="small"
                            onClick={() => openBrand(row)}
                        >
                            бренд
                        </Button>
                    </Tooltip>
                    <Popconfirm
                        title="Удалить сертификат?"
                        description="Связи с позициями и номер в их карточках будут сняты."
                        okText="Удалить"
                        cancelText="Отмена"
                        okButtonProps={{ danger: true }}
                        onConfirm={async () => {
                            try {
                                await deleteCertificate(row.id);
                                message.success('Удалён');
                                await load();
                            } catch (error) {
                                message.error(
                                    error?.response?.data?.detail
                                    || 'Не удалось удалить'
                                );
                            }
                        }}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const partColumns = [
        { title: 'Артикул', dataIndex: 'oem_number', width: 170 },
        { title: 'Бренд', dataIndex: 'brand_name', width: 130 },
        { title: 'Наименование', dataIndex: 'name', ellipsis: true },
        {
            title: 'Источник',
            dataIndex: 'regulatory_source',
            width: 180,
            render: (value) => (
                value
                    ? <Tag>{SOURCE_LABELS[value] || value}</Tag>
                    : <Text type="secondary">—</Text>
            ),
        },
        {
            title: '',
            key: 'unlink',
            width: 50,
            render: (_, row) => (
                <Popconfirm
                    title="Отвязать позицию от сертификата?"
                    okText="Отвязать"
                    cancelText="Отмена"
                    onConfirm={async () => {
                        await unlinkAutopart(partsOf.id, row.autopart_id);
                        message.success('Отвязано');
                        await loadParts(partsOf, partsPage);
                        await load();
                    }}
                >
                    <Button size="small" type="text" danger
                        icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
            }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        Сертификаты соответствия
                    </Title>
                    <Text type="secondary">
                        Номера и ссылки ФГИС для обязательных колонок прайса
                    </Text>
                </div>
                <Space wrap>
                    <Input.Search
                        allowClear
                        placeholder="Номер, заявитель, объект"
                        style={{ width: 260 }}
                        onSearch={(value) => { setPage(1); setSearch(value); }}
                    />
                    <Space size={6}>
                        <Switch
                            checked={onlyExpiring}
                            onChange={(value) => {
                                setPage(1);
                                setOnlyExpiring(value);
                            }}
                        />
                        <Text>Истекающие</Text>
                    </Space>
                    <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                        Обновить
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => openEdit(null)}
                    >
                        Добавить
                    </Button>
                </Space>
            </div>

            <Card size="small">
                <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={items}
                    scroll={{ x: 900 }}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        onChange: (nextPage, nextSize) => {
                            setPage(nextPage);
                            setPageSize(nextSize);
                        },
                    }}
                />
            </Card>

            <Modal
                open={editOpen}
                title={editing ? 'Сертификат' : 'Новый сертификат'}
                onCancel={() => setEditOpen(false)}
                onOk={submitEdit}
                okText="Сохранить"
                cancelText="Отмена"
                width={640}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Номер приводится к кириллице автоматически: с латинскими двойниками документ не найдётся в реестре."
                />
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="number"
                        label="Номер"
                        rules={[{ required: true, message: 'Введите номер' }]}
                    >
                        <Input placeholder="ЕАЭС RU С-BE.НВ07.В.00826/23" />
                    </Form.Item>
                    <Form.Item name="url" label="Ссылка ФГИС">
                        <Input placeholder="https://pub.fsa.gov.ru/rss/certificate/view/.../baseInfo" />
                    </Form.Item>
                    <Form.Item name="brand_id" label="Бренд">
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={brands}
                            placeholder="Бренд документа"
                        />
                    </Form.Item>
                    <Form.Item name="valid_until" label="Действует до">
                        <Input placeholder="ГГГГ-ММ-ДД" />
                    </Form.Item>
                    <Form.Item name="applicant" label="Заявитель">
                        <Input />
                    </Form.Item>
                    <Form.Item name="scope" label="Объект сертификации">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={Boolean(partsOf)}
                title={`Позиции: ${partsOf?.number || ''}`}
                onCancel={() => setPartsOf(null)}
                footer={null}
                width={900}
            >
                <Table
                    rowKey="autopart_id"
                    size="small"
                    loading={partsLoading}
                    columns={partColumns}
                    dataSource={parts}
                    scroll={{ x: 700 }}
                    pagination={{
                        current: partsPage,
                        pageSize: 50,
                        total: partsTotal,
                        showSizeChanger: false,
                        onChange: (nextPage) => loadParts(partsOf, nextPage),
                    }}
                />
            </Modal>

            <Modal
                open={brandOpen}
                title={`Применить к бренду: ${brandTarget?.number || ''}`}
                onCancel={() => setBrandOpen(false)}
                footer={null}
                width={620}
            >
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        options={brands}
                        value={brandId}
                        onChange={(value) => { setBrandId(value); setPreview(null); }}
                        placeholder="Выберите бренд"
                        style={{ width: '100%' }}
                    />
                    <Space size={8}>
                        <Switch
                            checked={onlyUndetermined}
                            onChange={(value) => {
                                setOnlyUndetermined(value);
                                setPreview(null);
                            }}
                        />
                        <Text>
                            Только позиции без определённого признака
                        </Text>
                    </Space>
                    {!onlyUndetermined && (
                        <Alert
                            type="warning"
                            showIcon
                            message="Будут перезаписаны позиции с сертификатом поставщика и с пометкой «не требует сертификации». Ручной ввод сохраняется."
                        />
                    )}
                    {preview && (
                        <Alert
                            type={preview.linked ? 'success' : 'info'}
                            showIcon
                            message={
                                preview.linked
                                    ? `Привязано позиций: ${preview.linked}`
                                    : `Будет затронуто позиций: ${preview.positions}`
                            }
                            description={
                                preview.normalized
                                    ? `Номер приведён к виду ${preview.certificate}`
                                    : undefined
                            }
                        />
                    )}
                    <Space>
                        <Button
                            onClick={() => runBrand(true)}
                            loading={applying}
                        >
                            Предпросмотр
                        </Button>
                        <Button
                            type="primary"
                            disabled={!preview}
                            loading={applying}
                            onClick={() => runBrand(false)}
                        >
                            Применить
                        </Button>
                    </Space>
                </Space>
            </Modal>
        </Space>
    );
};

export default CertificatesPage;
