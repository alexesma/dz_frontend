import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    EditOutlined,
    PlusOutlined,
    DeleteOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import {
    getCatalog,
    getAutopartDetail,
    updateAutopart,
    createAutopartCatalog,
    addAutopartCross,
    deleteAutopartCross,
    getStorageLocations,
} from '../api/autoparts';
import { lookupBrands } from '../api/brands';
import { getCategories } from '../api/categories';

const { Text } = Typography;

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtPrice = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—';

// ─── component ───────────────────────────────────────────────────────────────

const NomenclaturePage = () => {
    const [searchParams] = useSearchParams();

    // ── list state ────────────────────────────────────────────────────────────
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const [searchQ, setSearchQ] = useState('');
    const searchTimer = useRef(null);

    // ── drawer state ──────────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);   // null = create mode
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    // ── crosses state ─────────────────────────────────────────────────────────
    const [crosses, setCrosses] = useState([]);
    const [crossForm] = Form.useForm();
    const [addingCross, setAddingCross] = useState(false);

    // ── reference data ────────────────────────────────────────────────────────
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [storageLocations, setStorageLocations] = useState([]);

    // ── handle URL params (e.g. ?q=... or ?create=1&oem=...) ─────────────────
    useEffect(() => {
        const q = searchParams.get('q');
        const create = searchParams.get('create');
        const oem = searchParams.get('oem');
        if (q) {
            setSearchQ(q);
            fetchList(q, 1);
        }
        if (create === '1') {
            openCreate();
            if (oem) {
                form.setFieldsValue({ oem_number: oem });
            }
        }
    }, []); // eslint-disable-line

    // ── fetch list ────────────────────────────────────────────────────────────
    const fetchList = useCallback(async (q, pg) => {
        setLoading(true);
        try {
            const { data } = await getCatalog({
                q: q || undefined,
                offset: (pg - 1) * pageSize,
                limit: pageSize,
            });
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch {
            message.error('Ошибка загрузки номенклатуры');
        } finally {
            setLoading(false);
        }
    }, [pageSize]);

    useEffect(() => {
        fetchList(searchQ, page);
    }, [page]); // eslint-disable-line

    // Debounced search
    const handleSearch = (val) => {
        setSearchQ(val);
        setPage(1);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchList(val, 1), 400);
    };

    // ── load reference data ───────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [br, cat, sl] = await Promise.all([
                    lookupBrands('', 300),
                    getCategories(),
                    getStorageLocations(),
                ]);
                setBrands((br.data || []).map((b) => ({ value: b.id, label: b.name })));
                const flatCats = flattenCategories(cat.data || []);
                setCategories(flatCats.map((c) => ({ value: c.id, label: c.name })));
                setStorageLocations((sl.data || []).map((s) => ({ value: s.id, label: s.name })));
            } catch {
                // non-critical
            }
        })();
    }, []);

    // ── open drawer ───────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditingId(null);
        form.resetFields();
        setCrosses([]);
        setDrawerOpen(true);
    };

    const openEdit = async (record) => {
        setEditingId(record.id);
        setDrawerOpen(true);
        setDetailLoading(true);
        form.resetFields();
        setCrosses([]);
        try {
            const { data } = await getAutopartDetail(record.id);
            form.setFieldsValue({
                brand_id: data.brand_id,
                oem_number: data.oem_number,
                name: data.name,
                description: data.description,
                applicability: data.applicability,
                honest_sign_category: data.honest_sign_category,
                purchase_price: data.purchase_price,
                retail_price: data.retail_price,
                wholesale_price: data.wholesale_price,
                multiplicity: data.multiplicity,
                minimum_balance: data.minimum_balance,
                min_balance_auto: data.min_balance_auto ?? false,
                min_balance_user: data.min_balance_user ?? false,
                comment: data.comment,
                width: data.width,
                height: data.height,
                length: data.length,
                weight: data.weight,
                category_ids: (data.categories || []).map((c) =>
                    categories.find((opt) => opt.label === c)?.value
                ).filter(Boolean),
                storage_location_ids: (data.storage_locations || []).map((s) =>
                    storageLocations.find((opt) => opt.label === s)?.value
                ).filter(Boolean),
            });
            setCrosses(data.crosses || []);
        } catch {
            message.error('Ошибка загрузки карточки');
        } finally {
            setDetailLoading(false);
        }
    };

    // ── save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await updateAutopart(editingId, values);
                message.success('Сохранено');
            } else {
                await createAutopartCatalog(values);
                message.success('Позиция создана');
            }
            setDrawerOpen(false);
            fetchList(searchQ, page);
        } catch (err) {
            const detail = err?.response?.data?.detail || 'Ошибка сохранения';
            message.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        } finally {
            setSaving(false);
        }
    };

    // ── crosses ───────────────────────────────────────────────────────────────
    const handleAddCross = async () => {
        if (!editingId) return;
        let values;
        try {
            values = await crossForm.validateFields();
        } catch {
            return;
        }
        setAddingCross(true);
        try {
            const { data } = await addAutopartCross(editingId, values);
            setCrosses((prev) => [...prev, data]);
            crossForm.resetFields();
            message.success('Кросс-номер добавлен');
        } catch (err) {
            const detail = err?.response?.data?.detail || 'Ошибка';
            message.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        } finally {
            setAddingCross(false);
        }
    };

    const handleDeleteCross = async (crossId) => {
        try {
            await deleteAutopartCross(crossId);
            setCrosses((prev) => prev.filter((c) => c.id !== crossId));
            message.success('Удалено');
        } catch {
            message.error('Ошибка удаления');
        }
    };

    // ── table columns ─────────────────────────────────────────────────────────
    const columns = [
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand',
            width: 120,
            render: (v) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Артикул (OEM)',
            dataIndex: 'oem_number',
            key: 'oem',
            width: 150,
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Цена закуп.',
            dataIndex: 'purchase_price',
            key: 'purchase_price',
            width: 110,
            align: 'right',
            render: (v) => fmtPrice(v),
        },
        {
            title: 'Цена розн.',
            dataIndex: 'retail_price',
            key: 'retail_price',
            width: 110,
            align: 'right',
            render: (v) => fmtPrice(v),
        },
        {
            title: 'Мин. остаток',
            dataIndex: 'minimum_balance',
            key: 'min_balance',
            width: 110,
            align: 'center',
            render: (v, record) => (
                <span>
                    {v ?? 0}
                    {record.min_balance_auto && (
                        <Tooltip title="Авто-расчёт">
                            <Tag color="cyan" style={{ marginLeft: 4 }}>A</Tag>
                        </Tooltip>
                    )}
                </span>
            ),
        },
        {
            title: 'ЧЗ',
            dataIndex: 'honest_sign_category',
            key: 'hz',
            width: 100,
            render: (v) => v ? <Tag color="purple">{v}</Tag> : null,
        },
        {
            title: 'Категории',
            dataIndex: 'categories',
            key: 'categories',
            width: 150,
            render: (cats) =>
                (cats || []).map((c) => (
                    <Tag key={c} style={{ marginBottom: 2 }}>{c}</Tag>
                )),
        },
        {
            title: '',
            key: 'actions',
            width: 70,
            render: (_, record) => (
                <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(record)}
                />
            ),
        },
    ];

    // ── cross-numbers table ───────────────────────────────────────────────────
    const crossColumns = [
        {
            title: 'Бренд',
            dataIndex: 'cross_brand_name',
            key: 'brand',
            width: 120,
            render: (v) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Артикул',
            dataIndex: 'cross_oem_number',
            key: 'oem',
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Приоритет',
            dataIndex: 'priority',
            key: 'priority',
            width: 90,
            align: 'center',
        },
        {
            title: 'Комментарий',
            dataIndex: 'comment',
            key: 'comment',
            ellipsis: true,
        },
        {
            title: '',
            key: 'del',
            width: 60,
            render: (_, record) => (
                <Popconfirm
                    title="Удалить кросс-номер?"
                    onConfirm={() => handleDeleteCross(record.id)}
                    okText="Да"
                    cancelText="Нет"
                >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Typography.Title level={4} style={{ margin: 0 }}>Номенклатура</Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Создать позицию
                </Button>
            </div>

            <Input
                placeholder="Поиск по OEM / наименованию / бренду..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQ}
                onChange={(e) => handleSearch(e.target.value)}
                style={{ marginBottom: 16, maxWidth: 420 }}
            />

            <Table
                rowKey="id"
                dataSource={items}
                columns={columns}
                loading={loading}
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p) => setPage(p),
                }}
            />

            {/* ── Drawer ── */}
            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={editingId ? 'Редактирование позиции' : 'Новая позиция'}
                width={680}
                loading={detailLoading}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerOpen(false)}>Отмена</Button>
                        <Button type="primary" onClick={handleSave} loading={saving}>
                            Сохранить
                        </Button>
                    </Space>
                }
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Tabs
                        items={[
                            {
                                key: 'main',
                                label: 'Основное',
                                children: (
                                    <>
                                        <Form.Item
                                            name="brand_id"
                                            label="Бренд"
                                            rules={[{ required: true, message: 'Выберите бренд' }]}
                                        >
                                            <Select
                                                showSearch
                                                optionFilterProp="label"
                                                options={brands}
                                                placeholder="Выберите бренд"
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name="oem_number"
                                            label="Артикул (OEM)"
                                            rules={[{ required: true, message: 'Введите артикул' }]}
                                        >
                                            <Input placeholder="Например: A1234567" />
                                        </Form.Item>
                                        <Form.Item
                                            name="name"
                                            label="Наименование"
                                            rules={[{ required: true, message: 'Введите наименование' }]}
                                        >
                                            <Input placeholder="Например: Фильтр масляный" />
                                        </Form.Item>
                                        <Form.Item name="description" label="Описание">
                                            <Input.TextArea rows={2} />
                                        </Form.Item>
                                        <Form.Item name="applicability" label="Применение (автомобили)">
                                            <Input.TextArea
                                                rows={3}
                                                placeholder="Например: HAVAL F7 2019-2023, H6 2020-2023"
                                            />
                                        </Form.Item>
                                        <Form.Item name="honest_sign_category" label="Категория Честный Знак">
                                            <Input placeholder="Например: Шины, Аккумуляторы" />
                                        </Form.Item>
                                        <Form.Item name="comment" label="Комментарий">
                                            <Input.TextArea rows={2} />
                                        </Form.Item>
                                        <Form.Item name="category_ids" label="Категории">
                                            <Select
                                                mode="multiple"
                                                options={categories}
                                                optionFilterProp="label"
                                                placeholder="Выберите категории"
                                            />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'prices',
                                label: 'Цены',
                                children: (
                                    <>
                                        <Form.Item name="purchase_price" label="Закупочная цена (₽)">
                                            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <Form.Item name="retail_price" label="Розничная цена (₽)">
                                            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <Form.Item name="wholesale_price" label="Оптовая цена (₽)">
                                            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <Form.Item name="multiplicity" label="Кратность">
                                            <InputNumber min={1} style={{ width: '100%' }} />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'stock',
                                label: 'Склад',
                                children: (
                                    <>
                                        <Form.Item name="minimum_balance" label="Минимальный остаток (шт)">
                                            <InputNumber min={0} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <Form.Item
                                            name="min_balance_auto"
                                            label="Авто-расчёт мин. остатка"
                                            valuePropName="checked"
                                        >
                                            <Switch checkedChildren="Авто" unCheckedChildren="Выкл" />
                                        </Form.Item>
                                        <Form.Item
                                            name="min_balance_user"
                                            label="Мин. остаток задан вручную"
                                            valuePropName="checked"
                                        >
                                            <Switch />
                                        </Form.Item>
                                        <Form.Item name="storage_location_ids" label="Места хранения">
                                            <Select
                                                mode="multiple"
                                                options={storageLocations}
                                                optionFilterProp="label"
                                                placeholder="Выберите места хранения"
                                            />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'dims',
                                label: 'Размеры',
                                children: (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <Form.Item name="width" label="Ширина (мм)">
                                                <InputNumber min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Form.Item name="height" label="Высота (мм)">
                                                <InputNumber min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Form.Item name="length" label="Длина (мм)">
                                                <InputNumber min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Form.Item name="weight" label="Вес (кг)">
                                                <InputNumber min={0} precision={3} style={{ width: '100%' }} />
                                            </Form.Item>
                                        </div>
                                        <Form.Item name="barcode" label="Штрих-код (генерируется автоматически)">
                                            <Input disabled style={{ background: '#f5f5f5' }} />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'crosses',
                                label: 'Кросс-номера',
                                disabled: !editingId,
                                children: (
                                    <>
                                        {!editingId && (
                                            <Text type="secondary">
                                                Сначала сохраните позицию, затем добавьте кросс-номера.
                                            </Text>
                                        )}
                                        {editingId && (
                                            <>
                                                <Table
                                                    rowKey="id"
                                                    dataSource={crosses}
                                                    columns={crossColumns}
                                                    size="small"
                                                    pagination={false}
                                                    style={{ marginBottom: 16 }}
                                                    locale={{ emptyText: 'Нет кросс-номеров' }}
                                                />
                                                <Form
                                                    form={crossForm}
                                                    layout="inline"
                                                    style={{ flexWrap: 'wrap', gap: 8 }}
                                                >
                                                    <Form.Item
                                                        name="cross_brand_id"
                                                        rules={[{ required: true, message: 'Выберите бренд' }]}
                                                    >
                                                        <Select
                                                            showSearch
                                                            optionFilterProp="label"
                                                            options={brands}
                                                            placeholder="Бренд"
                                                            style={{ width: 160 }}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        name="cross_oem_number"
                                                        rules={[{ required: true, message: 'Введите артикул' }]}
                                                    >
                                                        <Input placeholder="Артикул" style={{ width: 160 }} />
                                                    </Form.Item>
                                                    <Form.Item name="priority" initialValue={100}>
                                                        <InputNumber
                                                            min={1}
                                                            placeholder="Приоритет"
                                                            style={{ width: 100 }}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item name="comment">
                                                        <Input placeholder="Комментарий" style={{ width: 160 }} />
                                                    </Form.Item>
                                                    <Button
                                                        type="primary"
                                                        onClick={handleAddCross}
                                                        loading={addingCross}
                                                        icon={<PlusOutlined />}
                                                    >
                                                        Добавить
                                                    </Button>
                                                </Form>
                                            </>
                                        )}
                                    </>
                                ),
                            },
                        ]}
                    />
                </Form>
            </Drawer>
        </div>
    );
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function flattenCategories(cats, prefix = '') {
    const result = [];
    for (const cat of cats || []) {
        const label = prefix ? `${prefix} / ${cat.name}` : cat.name;
        result.push({ id: cat.id, name: label });
        if (cat.children?.length) {
            result.push(...flattenCategories(cat.children, label));
        }
    }
    return result;
}

export default NomenclaturePage;
