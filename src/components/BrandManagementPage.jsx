import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    ExportOutlined,
    PlusOutlined,
    ReloadOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
    addBrandSynonyms,
    createBrand,
    deleteBrand,
    getBrandAutoparts,
    getBrandUsage,
    getBrands,
    getMissingBrandsFromPricelists,
    moveBrandAutoparts,
    removeBrandSynonyms,
    resolveMissingBrand,
    updateBrand,
} from '../api/brands';

const normalizeSynonyms = (brand) => {
    if (!brand || !Array.isArray(brand.synonyms)) {
        return [];
    }
    return brand.synonyms.filter((item) => item?.id !== brand.id);
};

const COUNTRY_OPTIONS = [
    'USA',
    'UK',
    'Germany',
    'China',
    'France',
    'Italy',
    'Japan',
    'Russia',
    'Spain',
    'Belgium',
    'South Korea',
    'Poland',
    'Taiwan',
    'Turkey',
    'Czechia',
    'Sweden',
    'India',
    'Brazil',
    'Mexico',
    'Canada',
    'Thailand',
    'Austria',
    'Indonesia',
    'Switzerland',
].map((value) => ({ value, label: value }));

const BrandManagementPage = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [brands, setBrands] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedBrandId, setSelectedBrandId] = useState(null);
    const [newSynonyms, setNewSynonyms] = useState([]);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [missingBrands, setMissingBrands] = useState([]);
    const [missingLoading, setMissingLoading] = useState(false);
    const [resolveModalOpen, setResolveModalOpen] = useState(false);
    const [resolvingBrandRow, setResolvingBrandRow] = useState(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [usage, setUsage] = useState(null);
    const [partsLoading, setPartsLoading] = useState(false);
    const [parts, setParts] = useState({ total: 0, items: [] });
    const [partsQuery, setPartsQuery] = useState('');
    const [partsPage, setPartsPage] = useState(1);
    const [selectedPartIds, setSelectedPartIds] = useState([]);
    const [moveModalOpen, setMoveModalOpen] = useState(false);
    const [moveTargetId, setMoveTargetId] = useState(null);
    const [editForm] = Form.useForm();
    const [createForm] = Form.useForm();
    const [resolveForm] = Form.useForm();

    const loadBrands = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getBrands();
            const list = Array.isArray(data) ? data : [];
            const sorted = [...list].sort((a, b) =>
                String(a?.name || '').localeCompare(String(b?.name || ''))
            );
            setBrands(sorted);
        } catch {
            message.error('Не удалось загрузить бренды');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMissingBrands = useCallback(async () => {
        setMissingLoading(true);
        try {
            const { data } = await getMissingBrandsFromPricelists();
            setMissingBrands(Array.isArray(data) ? data : []);
        } catch {
            message.error('Не удалось загрузить отсутствующие бренды');
        } finally {
            setMissingLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBrands();
    }, [loadBrands]);

    useEffect(() => {
        loadMissingBrands();
    }, [loadMissingBrands]);

    const filteredBrands = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) {
            return brands;
        }
        return brands.filter((brand) => {
            const byName = String(brand?.name || '')
                .toLowerCase()
                .includes(needle);
            if (byName) {
                return true;
            }
            return normalizeSynonyms(brand).some((syn) =>
                String(syn?.name || '').toLowerCase().includes(needle)
            );
        });
    }, [brands, search]);

    useEffect(() => {
        if (!filteredBrands.length) {
            setSelectedBrandId(null);
            return;
        }
        const exists = filteredBrands.some((item) => item.id === selectedBrandId);
        if (!exists) {
            setSelectedBrandId(filteredBrands[0].id);
        }
    }, [filteredBrands, selectedBrandId]);

    const selectedBrand = useMemo(
        () => brands.find((item) => item.id === selectedBrandId) || null,
        [brands, selectedBrandId]
    );
    const selectedSynonyms = useMemo(
        () => normalizeSynonyms(selectedBrand),
        [selectedBrand]
    );

    const availableSynonyms = useMemo(() => {
        if (!selectedBrand) {
            return [];
        }
        const blocked = new Set([
            selectedBrand.id,
            ...selectedSynonyms.map((item) => item.id),
        ]);
        return brands
            .filter((item) => !blocked.has(item.id))
            .map((item) => ({
                value: item.name,
                label: `${item.name} (#${item.id})`,
            }));
    }, [brands, selectedBrand, selectedSynonyms]);

    const PARTS_PAGE_SIZE = 10;

    const loadBrandParts = useCallback(async () => {
        if (!selectedBrandId) {
            setParts({ total: 0, items: [] });
            setUsage(null);
            return;
        }
        setPartsLoading(true);
        try {
            const [usageResponse, partsResponse] = await Promise.all([
                getBrandUsage(selectedBrandId),
                getBrandAutoparts(selectedBrandId, {
                    q: partsQuery || undefined,
                    limit: PARTS_PAGE_SIZE,
                    offset: (partsPage - 1) * PARTS_PAGE_SIZE,
                }),
            ]);
            setUsage(usageResponse.data);
            setParts(partsResponse.data);
        } catch {
            message.error('Не удалось загрузить позиции бренда');
        } finally {
            setPartsLoading(false);
        }
    }, [selectedBrandId, partsQuery, partsPage]);

    useEffect(() => {
        loadBrandParts();
    }, [loadBrandParts]);

    useEffect(() => {
        setPartsQuery('');
        setPartsPage(1);
        setSelectedPartIds([]);
    }, [selectedBrandId]);

    const handleOpenEditModal = () => {
        if (!selectedBrand) {
            return;
        }
        editForm.setFieldsValue({
            name: selectedBrand.name,
            country_of_origin: selectedBrand.country_of_origin || undefined,
            website: selectedBrand.website || undefined,
            description: selectedBrand.description || undefined,
            main_brand: Boolean(selectedBrand.main_brand),
        });
        setEditModalOpen(true);
    };

    const handleEditBrand = async () => {
        try {
            const values = await editForm.validateFields();
            setSaving(true);
            await updateBrand(selectedBrand.id, {
                name: String(values.name || '').trim(),
                country_of_origin: values.country_of_origin,
                website: values.website || null,
                description: values.description || null,
                main_brand: Boolean(values.main_brand),
            });
            message.success('Бренд обновлён');
            setEditModalOpen(false);
            await loadBrands();
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error(
                err?.response?.data?.detail || 'Не удалось обновить бренд'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteBrand = async () => {
        if (!selectedBrand) {
            return;
        }
        setSaving(true);
        try {
            await deleteBrand(selectedBrand.id);
            message.success(`Бренд ${selectedBrand.name} удалён`);
            await loadBrands();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось удалить бренд'
            );
            await loadBrandParts();
        } finally {
            setSaving(false);
        }
    };

    const handleMoveParts = async () => {
        if (!selectedBrand || !moveTargetId || !selectedPartIds.length) {
            return;
        }
        setSaving(true);
        try {
            const { data } = await moveBrandAutoparts(
                selectedBrand.id,
                selectedPartIds,
                moveTargetId
            );
            if (data.skipped?.length) {
                Modal.warning({
                    title: `Перенесено: ${data.moved}, пропущено: ${data.skipped.length}`,
                    content: (
                        <div>
                            В целевом бренде уже есть такие артикулы:
                            <div style={{ marginTop: 6 }}>
                                {data.skipped.map((item) => (
                                    <Tag key={item.id}>{item.oem_number}</Tag>
                                ))}
                            </div>
                        </div>
                    ),
                });
            } else {
                message.success(`Перенесено позиций: ${data.moved}`);
            }
            setMoveModalOpen(false);
            setMoveTargetId(null);
            setSelectedPartIds([]);
            await loadBrandParts();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось перенести позиции'
            );
        } finally {
            setSaving(false);
        }
    };

    const partColumns = [
        { title: 'Артикул', dataIndex: 'oem_number', width: 160 },
        { title: 'Наименование', dataIndex: 'name', ellipsis: true },
        {
            title: '',
            key: 'open',
            width: 120,
            render: (_, row) => (
                <Link
                    to={`/autoparts/nomenclature?autopart_id=${row.id}&edit=1`}
                    target="_blank"
                >
                    <ExportOutlined /> Карточка
                </Link>
            ),
        },
    ];

    const handleMainBrandChange = async (checked) => {
        if (!selectedBrand) {
            return;
        }
        setSaving(true);
        try {
            await updateBrand(selectedBrand.id, { main_brand: checked });
            message.success('Признак главного бренда обновлён');
            await loadBrands();
        } catch {
            message.error('Не удалось обновить главный бренд');
        } finally {
            setSaving(false);
        }
    };

    const handleAddSynonyms = async () => {
        if (!selectedBrand || !newSynonyms.length) {
            return;
        }
        setSaving(true);
        try {
            await addBrandSynonyms(selectedBrand.id, newSynonyms);
            message.success('Синонимы добавлены');
            setNewSynonyms([]);
            await loadBrands();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                    || 'Не удалось добавить синонимы'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveSynonym = async (name) => {
        if (!selectedBrand || !name) {
            return;
        }
        setSaving(true);
        try {
            await removeBrandSynonyms(selectedBrand.id, [name]);
            message.success(`Синоним ${name} удалён`);
            await loadBrands();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                    || `Не удалось удалить синоним ${name}`
            );
        } finally {
            setSaving(false);
        }
    };

    const handleOpenCreateModal = () => {
        createForm.setFieldsValue({
            name: '',
            country_of_origin: 'China',
            main_brand: false,
            website: undefined,
            description: undefined,
        });
        setCreateModalOpen(true);
    };

    const handleCreateBrand = async () => {
        try {
            const values = await createForm.validateFields();
            setSaving(true);
            const payload = {
                name: String(values.name || '').trim(),
                country_of_origin: values.country_of_origin,
                main_brand: Boolean(values.main_brand),
                website: values.website || null,
                description: values.description || null,
            };
            const { data } = await createBrand(payload);
            message.success(`Бренд ${data?.name || payload.name} создан`);
            setCreateModalOpen(false);
            createForm.resetFields();
            await loadBrands();
            if (data?.id) {
                setSelectedBrandId(data.id);
            }
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error(
                err?.response?.data?.detail || 'Не удалось создать бренд'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleCreateMissingBrand = async (row) => {
        if (!row?.brand_name) {
            return;
        }
        setSaving(true);
        try {
            await resolveMissingBrand({
                missing_brand_name: row.brand_name,
                action: 'create_brand',
                country_of_origin: 'China',
            });
            message.success(`Бренд ${row.brand_name} создан`);
            await Promise.all([loadBrands(), loadMissingBrands()]);
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                    || 'Не удалось создать бренд'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleOpenResolveModal = (row) => {
        setResolvingBrandRow(row);
        resolveForm.setFieldsValue({
            target_brand_id: undefined,
            country_of_origin: 'China',
        });
        setResolveModalOpen(true);
    };

    const handleResolveAsSynonym = async () => {
        if (!resolvingBrandRow?.brand_name) {
            return;
        }
        try {
            const values = await resolveForm.validateFields();
            setSaving(true);
            await resolveMissingBrand({
                missing_brand_name: resolvingBrandRow.brand_name,
                action: 'set_synonym',
                target_brand_id: values.target_brand_id,
                country_of_origin: values.country_of_origin,
            });
            message.success(
                `Синоним ${resolvingBrandRow.brand_name} сохранён`
            );
            setResolveModalOpen(false);
            setResolvingBrandRow(null);
            resolveForm.resetFields();
            await Promise.all([loadBrands(), loadMissingBrands()]);
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error(
                err?.response?.data?.detail
                    || 'Не удалось сохранить синоним'
            );
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 80,
        },
        {
            title: 'Бренд',
            dataIndex: 'name',
            render: (value, record) => (
                <Space wrap>
                    <span>{value}</span>
                    {record.main_brand ? (
                        <Tag color="green">Главный</Tag>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Синонимы',
            key: 'synonyms',
            render: (_, record) => normalizeSynonyms(record).length,
            width: 120,
        },
    ];

    const missingColumns = [
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            width: 200,
        },
        {
            title: 'Прайс',
            dataIndex: 'provider_config_name',
            render: (value) => value || 'Без названия',
            width: 220,
        },
        {
            title: 'Бренд из прайса',
            dataIndex: 'brand_name',
            width: 180,
        },
        {
            title: 'Позиций',
            dataIndex: 'positions_count',
            width: 110,
        },
        {
            title: 'Дата последнего прайса',
            dataIndex: 'pricelist_date',
            width: 170,
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_, row) => (
                <Space wrap className="table-actions">
                    <Button
                        size="small"
                        onClick={() => handleCreateMissingBrand(row)}
                        loading={saving}
                    >
                        Создать бренд
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        onClick={() => handleOpenResolveModal(row)}
                    >
                        Синоним
                    </Button>
                </Space>
            ),
            width: 230,
        },
    ];

    return (
        <div className="page-shell">
            <Card
                title="Управление брендами и синонимами"
                extra={(
                    <Space wrap>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleOpenCreateModal}
                        >
                            Добавить бренд
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => {
                                loadBrands();
                                loadMissingBrands();
                            }}
                            loading={loading || missingLoading}
                        >
                            Обновить
                        </Button>
                    </Space>
                )}
            >
                <Typography.Paragraph type="secondary">
                    Здесь можно найти бренд, назначить «главный бренд» и
                    связать синонимы. Синонимы учитываются при поиске
                    предложений на сайте в контроле цен.
                </Typography.Paragraph>

                <Space
                    direction="vertical"
                    size="middle"
                    style={{ width: '100%' }}
                >
                    <Input.Search
                        placeholder="Поиск по бренду или синониму"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                    />

                    <Table
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={filteredBrands}
                        loading={loading}
                        pagination={{ pageSize: 12, showSizeChanger: false }}
                        scroll={{ x: 'max-content' }}
                        onRow={(record) => ({
                            onClick: () => setSelectedBrandId(record.id),
                        })}
                        rowClassName={(record) =>
                            record.id === selectedBrandId
                                ? 'ant-table-row-selected'
                                : ''
                        }
                    />

                    {loading ? (
                        <Spin />
                    ) : !selectedBrand ? (
                        <Empty description="Бренд не выбран" />
                    ) : (
                        <Card
                            type="inner"
                            title={(
                                <Space wrap>
                                    <span>{selectedBrand.name}</span>
                                    <Tag>#{selectedBrand.id}</Tag>
                                </Space>
                            )}
                            extra={(
                                <Space wrap>
                                    <Button
                                        icon={<EditOutlined />}
                                        onClick={handleOpenEditModal}
                                    >
                                        Редактировать
                                    </Button>
                                    <Popconfirm
                                        title={`Удалить бренд ${selectedBrand.name}?`}
                                        description="Это действие нельзя отменить."
                                        okText="Удалить"
                                        cancelText="Отмена"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={handleDeleteBrand}
                                        disabled={!usage?.can_delete}
                                    >
                                        <Button
                                            danger
                                            icon={<DeleteOutlined />}
                                            disabled={!usage?.can_delete}
                                            title={
                                                usage && !usage.can_delete
                                                    ? 'Сначала перенесите позиции в другой бренд'
                                                    : undefined
                                            }
                                        >
                                            Удалить
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            )}
                        >
                            <Space
                                direction="vertical"
                                size="middle"
                                style={{ width: '100%' }}
                            >
                                <Space wrap>
                                    <Typography.Text>
                                        Главный бренд:
                                    </Typography.Text>
                                    <Switch
                                        checked={Boolean(selectedBrand.main_brand)}
                                        onChange={handleMainBrandChange}
                                        loading={saving}
                                    />
                                </Space>

                                <div>
                                    <Typography.Text strong>
                                        Синонимы
                                    </Typography.Text>
                                    <div style={{ marginTop: 8 }}>
                                        {selectedSynonyms.length ? (
                                            <Space wrap>
                                                {selectedSynonyms.map((syn) => (
                                                    <Tag
                                                        key={syn.id}
                                                        closable
                                                        onClose={(e) => {
                                                            e.preventDefault();
                                                            handleRemoveSynonym(syn.name);
                                                        }}
                                                    >
                                                        {syn.name}
                                                    </Tag>
                                                ))}
                                            </Space>
                                        ) : (
                                            <Typography.Text type="secondary">
                                                Синонимов пока нет.
                                            </Typography.Text>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <Space wrap style={{ marginBottom: 8 }}>
                                        <Typography.Text strong>
                                            Позиции бренда
                                        </Typography.Text>
                                        <Tag>{parts.total}</Tag>
                                        {usage && (usage.crosses
                                            || usage.substitutions
                                            || usage.invalid_crosses) ? (
                                            <Typography.Text type="secondary">
                                                Используется как бренд кросса:
                                                {' '}
                                                {usage.crosses
                                                    + usage.substitutions
                                                    + usage.invalid_crosses}
                                            </Typography.Text>
                                        ) : null}
                                    </Space>
                                    <Space wrap style={{ marginBottom: 8, width: '100%' }}>
                                        <Input.Search
                                            placeholder="Артикул или наименование"
                                            allowClear
                                            style={{ width: 280 }}
                                            onSearch={(value) => {
                                                setPartsQuery(value.trim());
                                                setPartsPage(1);
                                            }}
                                        />
                                        <Button
                                            icon={<SwapOutlined />}
                                            disabled={!selectedPartIds.length}
                                            onClick={() => setMoveModalOpen(true)}
                                        >
                                            Перенести в другой бренд
                                            {selectedPartIds.length
                                                ? ` (${selectedPartIds.length})`
                                                : ''}
                                        </Button>
                                    </Space>
                                    <Table
                                        rowKey="id"
                                        size="small"
                                        columns={partColumns}
                                        dataSource={parts.items}
                                        loading={partsLoading}
                                        rowSelection={{
                                            selectedRowKeys: selectedPartIds,
                                            onChange: setSelectedPartIds,
                                            preserveSelectedRowKeys: true,
                                        }}
                                        pagination={{
                                            current: partsPage,
                                            pageSize: PARTS_PAGE_SIZE,
                                            total: parts.total,
                                            showSizeChanger: false,
                                            onChange: setPartsPage,
                                        }}
                                        locale={{ emptyText: 'Позиций с этим брендом нет' }}
                                    />
                                </div>

                                <div className="page-toolbar">
                                    <div className="page-toolbar-main">
                                    <Select
                                        mode="multiple"
                                        value={newSynonyms}
                                        onChange={setNewSynonyms}
                                        options={availableSynonyms}
                                        placeholder="Добавьте один или несколько синонимов"
                                        style={{ width: '100%' }}
                                        maxTagCount={4}
                                    />
                                    </div>
                                    <div className="page-toolbar-side">
                                    <Button
                                        type="primary"
                                        onClick={handleAddSynonyms}
                                        loading={saving}
                                        disabled={!newSynonyms.length}
                                    >
                                        Добавить
                                    </Button>
                                    </div>
                                </div>
                            </Space>
                        </Card>
                    )}
                </Space>
            </Card>
            <Card
                title="Бренды из прайсов, которых нет в справочнике"
            >
                <Typography.Paragraph type="secondary">
                    Показываются бренды из последнего загруженного прайса
                    каждого источника. Можно создать новый бренд или
                    привязать как синоним к существующему.
                </Typography.Paragraph>
                <Table
                    rowKey={(row) =>
                        `${row.provider_config_id}-${row.brand_name}`
                    }
                    size="small"
                    columns={missingColumns}
                    dataSource={missingBrands}
                    loading={missingLoading}
                    pagination={{ pageSize: 12, showSizeChanger: false }}
                    locale={{
                        emptyText: 'Нет отсутствующих брендов',
                    }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>
            <Modal
                title="Сохранить как синоним"
                open={resolveModalOpen}
                onCancel={() => {
                    setResolveModalOpen(false);
                    setResolvingBrandRow(null);
                }}
                onOk={handleResolveAsSynonym}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnHidden
            >
                <Typography.Paragraph type="secondary">
                    Бренд из прайса: <strong>
                        {resolvingBrandRow?.brand_name || '-'}
                    </strong>
                </Typography.Paragraph>
                <Form form={resolveForm} layout="vertical">
                    <Form.Item
                        name="target_brand_id"
                        label="Главный бренд"
                        rules={[
                            {
                                required: true,
                                message: 'Выберите бренд',
                            },
                        ]}
                    >
                        <Select
                            showSearch
                            placeholder="Выберите бренд"
                            optionFilterProp="label"
                            options={brands.map((brand) => ({
                                value: brand.id,
                                label: `${brand.name} (#${brand.id})`,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="country_of_origin"
                        label="Страна нового бренда"
                    >
                        <Select
                            showSearch
                            options={COUNTRY_OPTIONS}
                            placeholder="Выберите страну"
                            optionFilterProp="label"
                        />
                    </Form.Item>
                </Form>
            </Modal>
            <Modal
                title="Редактировать бренд"
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                onOk={handleEditBrand}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnHidden
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название бренда"
                        rules={[{ required: true, message: 'Введите название бренда' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="country_of_origin"
                        label="Страна"
                        rules={[{ required: true, message: 'Выберите страну' }]}
                    >
                        <Select
                            showSearch
                            options={COUNTRY_OPTIONS}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item name="website" label="Сайт">
                        <Input placeholder="https://example.com" />
                    </Form.Item>
                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item
                        name="main_brand"
                        label="Главный бренд"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
            <Modal
                title="Перенести позиции в другой бренд"
                open={moveModalOpen}
                onCancel={() => setMoveModalOpen(false)}
                onOk={handleMoveParts}
                okText="Перенести"
                cancelText="Отмена"
                okButtonProps={{ disabled: !moveTargetId }}
                confirmLoading={saving}
                destroyOnHidden
            >
                <Typography.Paragraph type="secondary">
                    Позиций к переносу: <strong>{selectedPartIds.length}</strong>
                    {' '}из бренда <strong>{selectedBrand?.name}</strong>.
                    Если в целевом бренде уже есть такой артикул, позиция
                    будет пропущена.
                </Typography.Paragraph>
                <Select
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="Выберите бренд"
                    optionFilterProp="label"
                    value={moveTargetId}
                    onChange={setMoveTargetId}
                    options={brands
                        .filter((item) => item.id !== selectedBrandId)
                        .map((item) => ({
                            value: item.id,
                            label: `${item.name} (#${item.id})`,
                        }))}
                />
            </Modal>
            <Modal
                title="Новый бренд"
                open={createModalOpen}
                onCancel={() => setCreateModalOpen(false)}
                onOk={handleCreateBrand}
                okText="Создать"
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnHidden
            >
                <Form form={createForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название бренда"
                        rules={[
                            {
                                required: true,
                                message: 'Введите название бренда',
                            },
                        ]}
                    >
                        <Input placeholder="Например: TOYOTA" />
                    </Form.Item>
                    <Form.Item
                        name="country_of_origin"
                        label="Страна"
                        rules={[
                            {
                                required: true,
                                message: 'Выберите страну',
                            },
                        ]}
                    >
                        <Select
                            showSearch
                            options={COUNTRY_OPTIONS}
                            placeholder="Выберите страну"
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item
                        name="website"
                        label="Сайт (необязательно)"
                    >
                        <Input placeholder="https://example.com" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Описание (необязательно)"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item
                        name="main_brand"
                        label="Главный бренд"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default BrandManagementPage;
