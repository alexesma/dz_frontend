import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tabs,
    Tag,
    Tooltip,
    TreeSelect,
    Typography,
    message,
} from 'antd';
import {
    EditOutlined,
    PlusOutlined,
    DeleteOutlined,
    SearchOutlined,
    InfoCircleOutlined,
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
    getHonestSignCategories,
    createHonestSignCategory,
    assignHonestSignCategories,
    getAllApplicabilityNodes,
    createApplicabilityNode,
    assignApplicabilityNodes,
} from '../api/autoparts';
import { lookupBrands } from '../api/brands';
import { getCategories } from '../api/categories';

const { Text } = Typography;

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—';

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

/** Convert flat node list → Ant Design TreeSelect treeData */
function buildTree(nodes) {
    const map = {};
    const roots = [];
    for (const n of nodes) {
        map[n.id] = { title: n.name, value: n.id, key: n.id, children: [] };
    }
    for (const n of nodes) {
        if (n.parent_id && map[n.parent_id]) {
            map[n.parent_id].children.push(map[n.id]);
        } else {
            roots.push(map[n.id]);
        }
    }
    return roots;
}

const makePendingCrossId = () =>
    `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── NomenclaturePage ─────────────────────────────────────────────────────────

const NomenclaturePage = () => {
    const [searchParams] = useSearchParams();

    // ── list state ────────────────────────────────────────────────────────────
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Three separate search fields
    const [qOem, setQOem] = useState('');
    const [qName, setQName] = useState('');
    const [qBrand, setQBrand] = useState('');
    const searchTimer = useRef(null);

    // ── selected row / detail panel ───────────────────────────────────────────
    const [selectedRow, setSelectedRow] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // ── drawer state ──────────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    // ── crosses state ─────────────────────────────────────────────────────────
    const [crosses, setCrosses] = useState([]);
    const [crossForm] = Form.useForm();
    const [addingCross, setAddingCross] = useState(false);

    // ── ЧЗ (HonestSign) state ─────────────────────────────────────────────────
    const [hsCategories, setHsCategories] = useState([]);      // all available
    const [selectedHsIds, setSelectedHsIds] = useState([]);    // selected for current part
    const [savingHs, setSavingHs] = useState(false);
    const [hsModalOpen, setHsModalOpen] = useState(false);
    const [hsModalForm] = Form.useForm();
    const [creatingHs, setCreatingHs] = useState(false);

    // ── Применимость (Applicability) state ────────────────────────────────────
    const [allApplicNodes, setAllApplicNodes] = useState([]);
    const [selectedApplicIds, setSelectedApplicIds] = useState([]);
    const [savingApplic, setSavingApplic] = useState(false);
    const [applicModalOpen, setApplicModalOpen] = useState(false);
    const [applicModalForm] = Form.useForm();
    const [creatingApplic, setCreatingApplic] = useState(false);

    // ── reference data ────────────────────────────────────────────────────────
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [storageLocations, setStorageLocations] = useState([]);

    const applicTreeData = useMemo(() => buildTree(allApplicNodes), [allApplicNodes]);

    // ── init URL params ───────────────────────────────────────────────────────
    useEffect(() => {
        const q = searchParams.get('q');
        const create = searchParams.get('create');
        const oem = searchParams.get('oem');
        if (q) {
            setQOem(q);
            fetchList(q, '', '', 1);
        }
        if (create === '1') {
            openCreate();
            if (oem) form.setFieldsValue({ oem_number: oem });
        }
    }, []); // eslint-disable-line

    // ── fetch list ────────────────────────────────────────────────────────────
    const fetchList = useCallback(async (oem, name, brand, pg) => {
        setLoading(true);
        try {
            const params = { offset: (pg - 1) * pageSize, limit: pageSize };
            if (oem && oem.length >= 3) params.q_oem = oem;
            if (name && name.length >= 3) params.q_name = name;
            if (brand && brand.length >= 3) params.q_brand = brand;
            const { data } = await getCatalog(params);
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch {
            message.error('Ошибка загрузки номенклатуры');
        } finally {
            setLoading(false);
        }
    }, [pageSize]);

    // Initial fetch and page-change fetch
    useEffect(() => {
        fetchList(qOem, qName, qBrand, page);
    }, [page]); // eslint-disable-line

    const triggerSearch = (oem, name, brand) => {
        setPage(1);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchList(oem, name, brand, 1), 400);
    };

    const handleOemChange = (val) => { setQOem(val); triggerSearch(val, qName, qBrand); };
    const handleNameChange = (val) => { setQName(val); triggerSearch(qOem, val, qBrand); };
    const handleBrandChange = (val) => { setQBrand(val); triggerSearch(qOem, qName, val); };

    // ── load reference data ───────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [br, cat, sl, hs, an] = await Promise.all([
                    lookupBrands('', 300),
                    getCategories(),
                    getStorageLocations(),
                    getHonestSignCategories(),
                    getAllApplicabilityNodes(),
                ]);
                setBrands((br.data || []).map((b) => ({ value: b.id, label: b.name })));
                const flatCats = flattenCategories(cat.data || []);
                setCategories(flatCats.map((c) => ({ value: c.id, label: c.name })));
                setStorageLocations((sl.data || []).map((s) => ({ value: s.id, label: s.name })));
                setHsCategories((hs.data || []).map((h) => ({ value: h.id, label: h.name, code: h.code })));
                setAllApplicNodes(an.data || []);
            } catch {
                // non-critical
            }
        })();
    }, []);

    // ── select row → load detail panel ───────────────────────────────────────
    const handleRowSelect = async (record) => {
        if (selectedRow?.id === record.id) {
            setSelectedRow(null);
            setDetail(null);
            return;
        }
        setSelectedRow(record);
        setDetail(null);
        setDetailLoading(true);
        try {
            const { data } = await getAutopartDetail(record.id);
            setDetail(data);
        } catch {
            message.error('Ошибка загрузки данных');
        } finally {
            setDetailLoading(false);
        }
    };

    // ── open drawer ───────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditingId(null);
        form.resetFields();
        crossForm.resetFields();
        setCrosses([]);
        setSelectedHsIds([]);
        setSelectedApplicIds([]);
        setDrawerOpen(true);
    };

    const openEdit = async (record, e) => {
        e?.stopPropagation();
        setEditingId(record.id);
        setDrawerOpen(true);
        setDrawerLoading(true);
        form.resetFields();
        setCrosses([]);
        try {
            const { data } = await getAutopartDetail(record.id);
            form.setFieldsValue({
                brand_id: data.brand_id,
                oem_number: data.oem_number,
                name: data.name,
                description: data.description,
                comment: data.comment,
                purchase_price: data.purchase_price,
                retail_price: data.retail_price,
                wholesale_price: data.wholesale_price,
                multiplicity: data.multiplicity,
                minimum_balance: data.minimum_balance,
                min_balance_auto: data.min_balance_auto ?? false,
                min_balance_user: data.min_balance_user ?? false,
                width: data.width,
                height: data.height,
                length: data.length,
                weight: data.weight,
                barcode: data.barcode,
                category_ids: (data.categories || []).map(
                    (c) => categories.find((opt) => opt.label === c)?.value
                ).filter(Boolean),
                storage_location_ids: (data.storage_locations || []).map(
                    (s) => storageLocations.find((opt) => opt.label === s)?.value
                ).filter(Boolean),
            });
            setCrosses(data.crosses || []);
            setSelectedHsIds((data.honest_sign_categories || []).map((h) => h.id));
            setSelectedApplicIds((data.applicability_nodes || []).map((n) => n.id));
        } catch {
            message.error('Ошибка загрузки карточки');
        } finally {
            setDrawerLoading(false);
        }
    };

    // ── save main form ────────────────────────────────────────────────────────
    const handleSave = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            let partId = editingId;
            if (editingId) {
                await updateAutopart(editingId, values);
            } else {
                const { data } = await createAutopartCatalog(values);
                partId = data.id;
                setEditingId(partId);
            }
            await assignHonestSignCategories(partId, selectedHsIds);
            await assignApplicabilityNodes(partId, selectedApplicIds);
            const pendingCrosses = crosses.filter((cross) => cross._pending);
            for (const cross of pendingCrosses) {
                await addAutopartCross(partId, {
                    cross_brand_id: cross.cross_brand_id,
                    cross_oem_number: cross.cross_oem_number,
                    priority: cross.priority,
                    comment: cross.comment,
                });
            }
            message.success(editingId ? 'Сохранено' : 'Позиция создана');
            setDrawerOpen(false);
            fetchList(qOem, qName, qBrand, page);
            // Refresh detail panel if this was the selected row
            if (selectedRow?.id === partId) {
                const { data } = await getAutopartDetail(partId);
                setDetail(data);
            }
        } catch (err) {
            const detail = err?.response?.data?.detail || 'Ошибка сохранения';
            message.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        } finally {
            setSaving(false);
        }
    };

    // ── save ЧЗ ──────────────────────────────────────────────────────────────
    const handleSaveHs = async () => {
        if (!editingId) {
            message.info('Категории ЧЗ сохранятся вместе с новой позицией');
            return;
        }
        setSavingHs(true);
        try {
            await assignHonestSignCategories(editingId, selectedHsIds);
            message.success('Категории ЧЗ сохранены');
        } catch {
            message.error('Ошибка сохранения ЧЗ');
        } finally {
            setSavingHs(false);
        }
    };

    // ── create new ЧЗ category inline ────────────────────────────────────────
    const handleCreateHs = async () => {
        let vals;
        try { vals = await hsModalForm.validateFields(); } catch { return; }
        setCreatingHs(true);
        try {
            const { data } = await createHonestSignCategory(vals);
            setHsCategories((prev) => [...prev, { value: data.id, label: data.name, code: data.code }]);
            setSelectedHsIds((prev) => [...prev, data.id]);
            hsModalForm.resetFields();
            setHsModalOpen(false);
            message.success('Категория ЧЗ создана');
        } catch (err) {
            const det = err?.response?.data?.detail || 'Ошибка';
            message.error(typeof det === 'string' ? det : JSON.stringify(det));
        } finally {
            setCreatingHs(false);
        }
    };

    // ── save Применимость ─────────────────────────────────────────────────────
    const handleSaveApplic = async () => {
        if (!editingId) {
            message.info('Применимость сохранится вместе с новой позицией');
            return;
        }
        setSavingApplic(true);
        try {
            await assignApplicabilityNodes(editingId, selectedApplicIds);
            message.success('Применимость сохранена');
        } catch {
            message.error('Ошибка сохранения применимости');
        } finally {
            setSavingApplic(false);
        }
    };

    // ── create new Применимость node inline ───────────────────────────────────
    const handleCreateApplic = async () => {
        let vals;
        try { vals = await applicModalForm.validateFields(); } catch { return; }
        setCreatingApplic(true);
        try {
            const { data } = await createApplicabilityNode(vals);
            setAllApplicNodes((prev) => [...prev, data]);
            setSelectedApplicIds((prev) => [...prev, data.id]);
            applicModalForm.resetFields();
            setApplicModalOpen(false);
            message.success('Узел применимости создан');
        } catch (err) {
            const det = err?.response?.data?.detail || 'Ошибка';
            message.error(typeof det === 'string' ? det : JSON.stringify(det));
        } finally {
            setCreatingApplic(false);
        }
    };

    // ── crosses ───────────────────────────────────────────────────────────────
    const handleAddCross = async () => {
        let values;
        try { values = await crossForm.validateFields(); } catch { return; }
        if (!editingId) {
            const brand = brands.find((item) => item.value === values.cross_brand_id);
            setCrosses((prev) => [
                ...prev,
                {
                    id: makePendingCrossId(),
                    cross_brand_id: values.cross_brand_id,
                    cross_brand_name: brand?.label,
                    cross_oem_number: values.cross_oem_number,
                    priority: values.priority ?? 100,
                    comment: values.comment,
                    _pending: true,
                },
            ]);
            crossForm.resetFields();
            message.success('Кросс-номер будет сохранён вместе с позицией');
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
        const cross = crosses.find((item) => item.id === crossId);
        if (cross?._pending) {
            setCrosses((prev) => prev.filter((c) => c.id !== crossId));
            return;
        }
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
            width: 100,
            render: (v) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Артикул (OEM)',
            dataIndex: 'oem_number',
            key: 'oem',
            width: 140,
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Закуп',
            dataIndex: 'purchase_price',
            key: 'purchase_price',
            width: 95,
            align: 'right',
            render: (v) => fmtPrice(v),
        },
        {
            title: 'Розница',
            dataIndex: 'retail_price',
            key: 'retail_price',
            width: 95,
            align: 'right',
            render: (v) => fmtPrice(v),
        },
        {
            title: 'Остаток',
            dataIndex: 'stock_quantity',
            key: 'stock',
            width: 80,
            align: 'center',
            render: (v, record) => {
                const qty = v ?? 0;
                const minBal = record.minimum_balance ?? 0;
                let color = '#000';
                if (minBal > 0) {
                    color = qty === 0 ? '#cf1322' : qty < minBal ? '#d46b08' : '#389e0d';
                }
                return <span style={{ color, fontWeight: 600 }}>{qty}</span>;
            },
        },
        {
            title: 'Мин.остаток',
            dataIndex: 'minimum_balance',
            key: 'min_balance',
            width: 95,
            align: 'center',
            render: (v, record) => (
                <span>
                    {v ?? 0}
                    {record.min_balance_auto && (
                        <Tooltip title="Авто-расчёт">
                            <Tag color="cyan" style={{ marginLeft: 4, fontSize: 10 }}>A</Tag>
                        </Tooltip>
                    )}
                </span>
            ),
        },
        {
            title: 'Место хранения',
            dataIndex: 'storage_locations',
            key: 'storage',
            width: 130,
            render: (locs) =>
                (locs || []).map((l) => (
                    <Tag key={l} style={{ marginBottom: 2, fontSize: 11 }}>{l}</Tag>
                )),
        },
        {
            title: 'Категории',
            dataIndex: 'categories',
            key: 'categories',
            width: 130,
            render: (cats) =>
                (cats || []).map((c) => (
                    <Tag key={c} style={{ marginBottom: 2, fontSize: 11 }}>{c}</Tag>
                )),
        },
        {
            title: 'ЧЗ',
            dataIndex: 'honest_sign_category',
            key: 'hz',
            width: 80,
            render: (v) => v ? <Tag color="purple" style={{ fontSize: 11 }}>{v}</Tag> : null,
        },
        {
            title: '',
            key: 'actions',
            width: 60,
            render: (_, record) => (
                <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(e) => openEdit(record, e)}
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
            width: 110,
            render: (v) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Артикул',
            dataIndex: 'cross_oem_number',
            key: 'oem',
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Приор.',
            dataIndex: 'priority',
            key: 'priority',
            width: 70,
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
            width: 50,
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

    // ── detail panel cross columns (read-only) ────────────────────────────────
    const detailCrossColumns = crossColumns.filter((c) => c.key !== 'del');

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Typography.Title level={4} style={{ margin: 0 }}>Номенклатура</Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Создать позицию
                </Button>
            </div>

            {/* Search row */}
            <Space wrap style={{ marginBottom: 16 }}>
                <Input
                    placeholder="Поиск по OEM (от 3 симв.)"
                    prefix={<SearchOutlined />}
                    allowClear
                    value={qOem}
                    onChange={(e) => handleOemChange(e.target.value)}
                    style={{ width: 220 }}
                />
                <Input
                    placeholder="Поиск по наименованию (от 3 симв.)"
                    prefix={<SearchOutlined />}
                    allowClear
                    value={qName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    style={{ width: 260 }}
                />
                <Input
                    placeholder="Поиск по бренду (от 3 симв.)"
                    prefix={<SearchOutlined />}
                    allowClear
                    value={qBrand}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    style={{ width: 220 }}
                />
            </Space>

            {/* Main table */}
            <Table
                rowKey="id"
                dataSource={items}
                columns={columns}
                loading={loading}
                size="small"
                scroll={{ x: 'max-content' }}
                rowClassName={(record) => record.id === selectedRow?.id ? 'ant-table-row-selected' : ''}
                onRow={(record) => ({
                    onClick: () => handleRowSelect(record),
                    style: { cursor: 'pointer' },
                })}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p) => setPage(p),
                }}
            />

            {/* Detail panel */}
            {selectedRow && (
                <div style={{
                    marginTop: 16,
                    padding: 20,
                    background: '#fafafa',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                }}>
                    {detailLoading ? (
                        <Spin tip="Загрузка..." style={{ display: 'block', textAlign: 'center', padding: 24 }} />
                    ) : detail ? (
                        <>
                            {/* Part header */}
                            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Tag color="blue" style={{ fontSize: 14 }}>{detail.brand_name || '—'}</Tag>
                                <Text code style={{ fontSize: 14 }}>{detail.oem_number}</Text>
                                <Text strong style={{ fontSize: 15 }}>{detail.name}</Text>
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={(e) => openEdit(selectedRow, e)}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    Редактировать
                                </Button>
                            </div>

                            {/* Info row */}
                            <Space wrap style={{ marginBottom: 16 }}>
                                {(detail.categories || []).length > 0 && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Категории: </Text>
                                        {(detail.categories || []).map((c) => (
                                            <Tag key={c}>{c}</Tag>
                                        ))}
                                    </div>
                                )}
                                {(detail.honest_sign_categories || []).length > 0 && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Честный знак: </Text>
                                        {(detail.honest_sign_categories || []).map((h) => (
                                            <Tag key={h.id} color="purple">{h.name}{h.code ? ` (${h.code})` : ''}</Tag>
                                        ))}
                                    </div>
                                )}
                                {(detail.applicability_nodes || []).length > 0 && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Применимость: </Text>
                                        {(detail.applicability_nodes || []).map((n) => (
                                            <Tag key={n.id} color="green">{n.name}</Tag>
                                        ))}
                                    </div>
                                )}
                                {detail.barcode && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Штрих-код: </Text>
                                        <Text code style={{ fontSize: 12 }}>{detail.barcode}</Text>
                                    </div>
                                )}
                                {detail.comment && (
                                    <div>
                                        <Tooltip title={detail.comment}>
                                            <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 4 }} />
                                            <Text type="secondary" style={{ fontSize: 12 }}>Есть комментарий</Text>
                                        </Tooltip>
                                    </div>
                                )}
                            </Space>

                            {/* Cross-numbers table */}
                            {(detail.crosses || []).length > 0 && (
                                <>
                                    <Text strong style={{ marginBottom: 8, display: 'block' }}>
                                        Кросс-номера (аналоги)
                                    </Text>
                                    <Table
                                        rowKey="id"
                                        dataSource={detail.crosses || []}
                                        columns={detailCrossColumns}
                                        size="small"
                                        pagination={false}
                                        style={{ marginBottom: 8 }}
                                    />
                                </>
                            )}
                            {(detail.crosses || []).length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>Кросс-номеров нет</Text>
                            )}
                        </>
                    ) : null}
                </div>
            )}

            {/* ═══ Drawer ═══ */}
            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={editingId ? 'Редактирование позиции' : 'Новая позиция'}
                width={700}
                loading={drawerLoading}
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
                            // ── Основное ──────────────────────────────────────
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
                            // ── Цены ─────────────────────────────────────────
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
                            // ── Склад ─────────────────────────────────────────
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
                            // ── Размеры ───────────────────────────────────────
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
                            // ── Честный знак ──────────────────────────────────
                            {
                                key: 'hs',
                                label: 'Честный знак',
                                children: (
                                    <div>
                                        <div style={{ marginBottom: 12 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Выберите категории маркировки «Честный знак» для данной запчасти.
                                                В новой позиции они сохранятся вместе с основной карточкой.
                                            </Text>
                                        </div>
                                        <Select
                                            mode="multiple"
                                            style={{ width: '100%', marginBottom: 12 }}
                                            placeholder="Выберите категории ЧЗ"
                                            value={selectedHsIds}
                                            onChange={setSelectedHsIds}
                                            options={hsCategories}
                                            optionFilterProp="label"
                                            showSearch
                                            allowClear
                                        />
                                        <Space>
                                            <Button
                                                type="primary"
                                                onClick={handleSaveHs}
                                                loading={savingHs}
                                            >
                                                {editingId ? 'Сохранить ЧЗ' : 'Сохранить вместе с позицией'}
                                            </Button>
                                            <Button
                                                icon={<PlusOutlined />}
                                                onClick={() => setHsModalOpen(true)}
                                            >
                                                Новая категория ЧЗ
                                            </Button>
                                        </Space>
                                    </div>
                                ),
                            },
                            // ── Применимость ──────────────────────────────────
                            {
                                key: 'applic',
                                label: 'Применимость',
                                children: (
                                    <div>
                                        <div style={{ marginBottom: 12 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Выберите узлы применимости (автомобили, типо-размеры).
                                                В новой позиции они сохранятся вместе с основной карточкой.
                                            </Text>
                                        </div>
                                        <TreeSelect
                                            treeData={applicTreeData}
                                            value={selectedApplicIds}
                                            onChange={setSelectedApplicIds}
                                            treeCheckable
                                            showCheckedStrategy={TreeSelect.SHOW_ALL}
                                            placeholder="Выберите применимость"
                                            style={{ width: '100%', marginBottom: 12 }}
                                            treeNodeFilterProp="title"
                                            showSearch
                                            allowClear
                                            maxTagCount={8}
                                        />
                                        <Space>
                                            <Button
                                                type="primary"
                                                onClick={handleSaveApplic}
                                                loading={savingApplic}
                                            >
                                                {editingId ? 'Сохранить применимость' : 'Сохранить вместе с позицией'}
                                            </Button>
                                            <Button
                                                icon={<PlusOutlined />}
                                                onClick={() => setApplicModalOpen(true)}
                                            >
                                                Создать узел
                                            </Button>
                                        </Space>
                                    </div>
                                ),
                            },
                            // ── Кросс-номера ──────────────────────────────────
                            {
                                key: 'crosses',
                                label: 'Кросс-номера',
                                children: (
                                    <>
                                        {!editingId && (
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                                Кросс-номера сохранятся вместе с новой позицией.
                                            </Text>
                                        )}
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
                                ),
                            },
                        ]}
                    />
                </Form>
            </Drawer>

            {/* ── Modal: новая категория ЧЗ ── */}
            <Modal
                open={hsModalOpen}
                title="Новая категория Честного знака"
                onCancel={() => { setHsModalOpen(false); hsModalForm.resetFields(); }}
                onOk={handleCreateHs}
                okText="Создать"
                confirmLoading={creatingHs}
                destroyOnClose
            >
                <Form form={hsModalForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название категории"
                        rules={[{ required: true, message: 'Введите название' }]}
                    >
                        <Input placeholder="Например: Шины" />
                    </Form.Item>
                    <Form.Item name="code" label="Код (необязательно)">
                        <Input placeholder="Например: tires" />
                    </Form.Item>
                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* ── Modal: новый узел применимости ── */}
            <Modal
                open={applicModalOpen}
                title="Новый узел применимости"
                onCancel={() => { setApplicModalOpen(false); applicModalForm.resetFields(); }}
                onOk={handleCreateApplic}
                okText="Создать"
                confirmLoading={creatingApplic}
                destroyOnClose
            >
                <Form form={applicModalForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название"
                        rules={[{ required: true, message: 'Введите название' }]}
                    >
                        <Input placeholder="Например: Toyota Camry XV70 2018-2024" />
                    </Form.Item>
                    <Form.Item name="node_type" label="Тип узла" initialValue="vehicle">
                        <Select
                            options={[
                                { value: 'vehicle', label: 'Автомобиль' },
                                { value: 'part', label: 'Тип детали / размер' },
                                { value: 'other', label: 'Прочее' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="parent_id" label="Родительский узел (необязательно)">
                        <TreeSelect
                            treeData={applicTreeData}
                            placeholder="Не выбрано (корневой)"
                            allowClear
                            showSearch
                            treeNodeFilterProp="title"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default NomenclaturePage;
