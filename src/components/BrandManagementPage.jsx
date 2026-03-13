import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    addBrandSynonyms,
    createBrand,
    getBrands,
    getMissingBrandsFromPricelists,
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
                <Space>
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
                <Space>
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
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card
                title="Управление брендами и синонимами"
                extra={(
                    <Space>
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
                style={{ margin: '20px' }}
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
                                <Space>
                                    <span>{selectedBrand.name}</span>
                                    <Tag>#{selectedBrand.id}</Tag>
                                </Space>
                            )}
                        >
                            <Space
                                direction="vertical"
                                size="middle"
                                style={{ width: '100%' }}
                            >
                                <Space>
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

                                <Space.Compact style={{ width: '100%' }}>
                                    <Select
                                        mode="multiple"
                                        value={newSynonyms}
                                        onChange={setNewSynonyms}
                                        options={availableSynonyms}
                                        placeholder="Добавьте один или несколько синонимов"
                                        style={{ width: '100%' }}
                                        maxTagCount={4}
                                    />
                                    <Button
                                        type="primary"
                                        onClick={handleAddSynonyms}
                                        loading={saving}
                                        disabled={!newSynonyms.length}
                                    >
                                        Добавить
                                    </Button>
                                </Space.Compact>
                            </Space>
                        </Card>
                    )}
                </Space>
            </Card>
            <Card
                title="Бренды из прайсов, которых нет в справочнике"
                style={{ margin: '0 20px 20px 20px' }}
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
                    scroll={{ x: 1100 }}
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
        </Space>
    );
};

export default BrandManagementPage;
