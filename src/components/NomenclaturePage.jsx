import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Descriptions,
    Form,
    Image,
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
    Upload,
    Typography,
    message,
} from 'antd';
import {
    EditOutlined,
    PlusOutlined,
    DeleteOutlined,
    SearchOutlined,
    InfoCircleOutlined,
    FileTextOutlined,
    PictureOutlined,
    UploadOutlined,
    CarOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import {
    getCatalog,
    getAutopartDetail,
    getAutopartAvailability,
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
    uploadAutopartPhoto,
    replaceAutopartPhoto,
    deleteAutopartPhoto,
} from '../api/autoparts';
import { lookupBrands } from '../api/brands';
import { getCategories } from '../api/categories';

const { Link, Text } = Typography;

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

// ─── Раскрытая строка списка: где позиция есть и почём ────────────────────────
// Прежде это можно было узнать, только открыв карточку и обойдя аналоги
// по одному. Здесь сразу и предложения поставщиков, и наличие аналогов.
const AvailabilityPanel = ({ data, loading, renderStock }) => {
    if (loading) {
        return (
            <div style={{ padding: 12 }}>
                <Spin size="small" /> <Text type="secondary">Загружаем наличие…</Text>
            </div>
        );
    }
    if (!data) return <Text type="secondary">Нет данных</Text>;

    const offerColumns = [
        { title: 'Поставщик', dataIndex: 'provider_name', key: 'provider' },
        {
            title: 'Прайс',
            dataIndex: 'provider_config_name',
            key: 'config',
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            align: 'right',
            width: 110,
            render: (v) => fmtPrice(v),
        },
        {
            title: 'Остаток',
            dataIndex: 'quantity',
            key: 'quantity',
            align: 'right',
            width: 90,
        },
        {
            title: 'Срок, дн.',
            key: 'delivery',
            width: 90,
            align: 'center',
            render: (_, record) => (
                record.min_delivery_day != null || record.max_delivery_day != null
                    ? `${record.min_delivery_day ?? '—'}–${record.max_delivery_day ?? '—'}`
                    : <Text type="secondary">—</Text>
            ),
        },
        {
            title: 'Прайс от',
            dataIndex: 'pricelist_date',
            key: 'date',
            width: 110,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
    ];

    const crossColumns = [
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand',
            width: 120,
            render: (v) => (v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">—</Text>),
        },
        {
            title: 'Артикул',
            dataIndex: 'oem_number',
            key: 'oem',
            render: (v) => <Text code>{v}</Text>,
        },
        {
            title: 'Наличие',
            key: 'stock',
            width: 230,
            render: (_, record) => renderStock(record),
        },
        {
            title: 'Лучшая цена',
            dataIndex: 'best_price',
            key: 'best_price',
            align: 'right',
            width: 110,
            render: (v) => (v != null ? fmtPrice(v) : <Text type="secondary">—</Text>),
        },
        {
            title: 'Место',
            dataIndex: 'storage_locations',
            key: 'storage',
            width: 140,
            ellipsis: true,
            render: (v) => (v?.length
                ? <Tooltip title={v.join(', ')}>{v.join(', ')}</Tooltip>
                : <Text type="secondary">—</Text>),
        },
    ];

    return (
        <div style={{ padding: '4px 0 8px' }}>
            <Text strong>Предложения поставщиков</Text>
            <Table
                rowKey={(row) => `${row.provider_id}-${row.provider_config_id ?? 0}-${row.price}`}
                dataSource={data.offers || []}
                columns={offerColumns}
                size="small"
                pagination={false}
                style={{ marginTop: 6, marginBottom: 12 }}
                locale={{ emptyText: 'Позиции нет ни в одном свежем прайсе' }}
            />
            <Text strong>Аналоги и их наличие</Text>
            <Table
                rowKey={(row) => row.cross_id ?? `${row.brand_name}-${row.oem_number}`}
                dataSource={data.crosses || []}
                columns={crossColumns}
                size="small"
                pagination={false}
                style={{ marginTop: 6 }}
                locale={{ emptyText: 'Аналоги не заведены' }}
            />
        </div>
    );
};

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
    const [sourceFilter, setSourceFilter] = useState('all');
    const [contentFilter, setContentFilter] = useState('all');
    const [linksFilter, setLinksFilter] = useState('all');
    const searchTimer = useRef(null);
    const brandSearchTimer = useRef(null);

    // ── selected row / detail panel ───────────────────────────────────────────
    const [selectedRow, setSelectedRow] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    // Наличие позиции и её аналогов. Ключ — id позиции: одно и то же
    // нужно и раскрытой строке списка, и таблице аналогов в карточке.
    const [availability, setAvailability] = useState({});
    const [availabilityLoading, setAvailabilityLoading] = useState({});
    const [expandedRowKeys, setExpandedRowKeys] = useState([]);

    // ── drawer state ──────────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingDetail, setEditingDetail] = useState(null);
    const [editingPhotos, setEditingPhotos] = useState([]);
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

    const mergeBrandOptions = useCallback((incoming) => {
        setBrands((current) => {
            const byId = new Map(current.map((item) => [Number(item.value), item]));
            (incoming || []).forEach((item) => {
                const value = Number(item.value ?? item.id);
                const label = String(item.label ?? item.name ?? '').trim();
                if (Number.isFinite(value) && label) {
                    byId.set(value, { value, label });
                }
            });
            return Array.from(byId.values()).sort((a, b) => (
                a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' })
            ));
        });
    }, []);

    const searchBrandOptions = useCallback((query = '') => {
        if (brandSearchTimer.current) clearTimeout(brandSearchTimer.current);
        brandSearchTimer.current = setTimeout(async () => {
            try {
                const { data } = await lookupBrands(query.trim(), 100);
                mergeBrandOptions(data);
            } catch {
                // Текущий выбранный бренд остаётся в options; сбой поиска
                // не должен превращать его название обратно в числовой id.
            }
        }, 250);
    }, [mergeBrandOptions]);

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
    const fetchList = useCallback(async (oem, name, brand, pg, source = 'all', content = 'all', links = 'all') => {
        setLoading(true);
        try {
            const params = { offset: (pg - 1) * pageSize, limit: pageSize };
            if (oem && oem.length >= 3) params.q_oem = oem;
            if (name && name.length >= 3) params.q_name = name;
            if (brand && brand.length >= 3) params.q_brand = brand;
            if (source === 'partssoft') params.partssoft = true;
            if (source === 'local') params.partssoft = false;
            if (content !== 'all') params.content = content;
            if (links !== 'all') params.links = links;
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
        fetchList(qOem, qName, qBrand, page, sourceFilter, contentFilter, linksFilter);
    }, [page]); // eslint-disable-line

    const triggerSearch = (oem, name, brand) => {
        setPage(1);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(
            () => fetchList(
                oem, name, brand, 1, sourceFilter, contentFilter, linksFilter,
            ),
            400,
        );
    };

    const handleOemChange = (val) => { setQOem(val); triggerSearch(val, qName, qBrand); };
    const handleNameChange = (val) => { setQName(val); triggerSearch(qOem, val, qBrand); };
    const handleBrandChange = (val) => { setQBrand(val); triggerSearch(qOem, qName, val); };
    const handleSourceFilter = (value) => {
        setSourceFilter(value);
        setPage(1);
        void fetchList(qOem, qName, qBrand, 1, value, contentFilter, linksFilter);
    };
    const handleContentFilter = (value) => {
        setContentFilter(value);
        setPage(1);
        void fetchList(qOem, qName, qBrand, 1, sourceFilter, value, linksFilter);
    };
    const handleLinksFilter = (value) => {
        setLinksFilter(value);
        setPage(1);
        void fetchList(qOem, qName, qBrand, 1, sourceFilter, contentFilter, value);
    };

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
                mergeBrandOptions(br.data);
                const flatCats = flattenCategories(cat.data || []);
                setCategories(flatCats.map((c) => ({ value: c.id, label: c.name })));
                setStorageLocations((sl.data || []).map((s) => ({ value: s.id, label: s.name })));
                setHsCategories((hs.data || []).map((h) => ({ value: h.id, label: h.name, code: h.code })));
                setAllApplicNodes(an.data || []);
            } catch {
                // non-critical
            }
        })();
    }, [mergeBrandOptions]);

    const loadAvailability = useCallback(async (autopartId) => {
        if (!autopartId || availability[autopartId]) return;
        setAvailabilityLoading((prev) => ({ ...prev, [autopartId]: true }));
        try {
            const { data } = await getAutopartAvailability(autopartId);
            setAvailability((prev) => ({ ...prev, [autopartId]: data }));
        } catch {
            message.error('Не удалось загрузить наличие');
        } finally {
            setAvailabilityLoading((prev) => ({ ...prev, [autopartId]: false }));
        }
    }, [availability]);

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
            void loadAvailability(record.id);
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
        setEditingDetail(null);
        setEditingPhotos([]);
        setSelectedHsIds([]);
        setSelectedApplicIds([]);
        setDrawerOpen(true);
    };

    const openEdit = async (record, e) => {
        e?.stopPropagation();
        setEditingId(record.id);
        setSelectedRow(null);
        setDetail(null);
        setDrawerOpen(true);
        setDrawerLoading(true);
        form.resetFields();
        setCrosses([]);
        try {
            const { data } = await getAutopartDetail(record.id);
            let selectedBrandName = String(data.brand_name || '').trim();
            if (data.brand_id && !selectedBrandName) {
                try {
                    const response = await lookupBrands('', 1, [data.brand_id]);
                    selectedBrandName = String(response.data?.[0]?.name || '').trim();
                } catch {
                    // Поле останется выбранным по id; при следующем поиске
                    // подпись восстановится из справочника брендов.
                }
            }
            if (data.brand_id && selectedBrandName) {
                mergeBrandOptions([
                    { value: data.brand_id, label: selectedBrandName },
                ]);
            }
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
                // Обязательные колонки прайса: без них вкладка «Реквизиты»
                // открывалась пустой, хотя данные в карточке есть.
                tnved_code: data.tnved_code,
                okpd2_code: data.okpd2_code,
                certification_required: data.certification_required,
                eac_cert_number: data.eac_cert_number,
                eac_cert_url: data.eac_cert_url,
                eac_cert_valid_until: data.eac_cert_valid_until,
                regulatory_source: data.regulatory_source,
                applicability: data.applicability,
                honest_sign_category: data.honest_sign_category,
                category_ids: (data.categories || []).map(
                    (c) => categories.find((opt) => opt.label === c)?.value
                ).filter(Boolean),
                storage_location_ids: (data.storage_locations || []).map(
                    (s) => storageLocations.find((opt) => opt.label === s)?.value
                ).filter(Boolean),
            });
            setCrosses(data.crosses || []);
            setEditingDetail(data);
            setEditingPhotos(data.photos || []);
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
            fetchList(qOem, qName, qBrand, page, sourceFilter, contentFilter);
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

    const handlePhotoUpload = async ({ file, onSuccess, onError }) => {
        if (!editingId) {
            message.info('Сначала сохраните новую позицию');
            onError?.(new Error('Position is not saved'));
            return;
        }
        try {
            const { data } = await uploadAutopartPhoto(editingId, file);
            setEditingPhotos((current) => [...current, data]);
            message.success('Фотография добавлена');
            onSuccess?.(data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось добавить фотографию');
            onError?.(error);
        }
    };

    const handlePhotoReplace = (photoId) => async ({ file, onSuccess, onError }) => {
        try {
            const { data } = await replaceAutopartPhoto(editingId, photoId, file);
            setEditingPhotos((current) => current.map((photo) => (
                photo.id === photoId ? data : photo
            )));
            message.success('Фотография заменена');
            onSuccess?.(data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось заменить фотографию');
            onError?.(error);
        }
    };

    const handlePhotoDelete = async (photoId) => {
        try {
            await deleteAutopartPhoto(editingId, photoId);
            setEditingPhotos((current) => current.filter((photo) => photo.id !== photoId));
            message.success('Фотография удалена');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось удалить фотографию');
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
            width: 112,
            responsive: ['sm'],
            ellipsis: true,
            render: (v) => (
                <Tooltip title={v}>
                    <Tag
                        color="blue"
                        style={{
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {v}
                    </Tag>
                </Tooltip>
            ),
        },
        {
            title: 'Артикул (OEM)',
            dataIndex: 'oem_number',
            key: 'oem',
            width: 155,
            ellipsis: true,
            render: (v) => (
                <Tooltip title={v}>
                    <Text code style={{ whiteSpace: 'nowrap' }}>{v}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: { showTitle: false },
            render: (v) => <Tooltip title={v}>{v || '—'}</Tooltip>,
        },
        {
            title: 'Карточка',
            key: 'card',
            width: 165,
            render: (_, record) => (
                <Space size={6}>
                    {record.primary_photo_url ? (
                        <Image
                            src={record.primary_photo_url}
                            width={38}
                            height={38}
                            preview
                            style={{ objectFit: 'cover', borderRadius: 6 }}
                        />
                    ) : (
                        <div style={{ width: 38, height: 38, borderRadius: 6, background: '#f5f5f5', display: 'grid', placeItems: 'center' }}>
                            <PictureOutlined style={{ color: '#bfbfbf' }} />
                        </div>
                    )}
                    <div style={{ lineHeight: 1.45 }}>
                        {record.partssoft_product_id ? (
                            <Tooltip title={`ID Parts-Soft: ${record.partssoft_product_id}`}>
                                <Tag color="geekblue" style={{ marginRight: 0 }}>Parts-Soft</Tag>
                            </Tooltip>
                        ) : <Tag style={{ marginRight: 0 }}>Наша</Tag>}
                        <div>
                            <Tooltip title={record.photo_count ? `Фотографий: ${record.photo_count}` : 'Фотографии отсутствуют'}>
                                <Tag color={record.photo_count ? 'cyan' : 'default'} style={{ marginRight: 4 }}>
                                    <PictureOutlined /> {record.photo_count || 0}
                                </Tag>
                            </Tooltip>
                            <Tooltip title={record.has_description ? 'Описание заполнено' : 'Описание отсутствует'}>
                                <Tag color={record.has_description ? 'green' : 'default'} style={{ marginRight: 0 }}>
                                    <FileTextOutlined />
                                </Tag>
                            </Tooltip>
                        </div>
                    </div>
                </Space>
            ),
        },
        {
            // Применимость и кроссы: без них наполненность карточки
            // приходилось проверять, открывая каждый товар по очереди.
            title: 'Связи',
            key: 'links',
            width: 124,
            responsive: ['lg'],
            render: (_, record) => {
                const nodes = record.applicability_names || [];
                const applicabilityCount = record.applicability_count || 0;
                const crossCount = record.cross_count || 0;
                const applicabilityHint = applicabilityCount
                    ? [
                        ...nodes,
                        ...(applicabilityCount > nodes.length
                            ? [`и ещё ${applicabilityCount - nodes.length}`]
                            : []),
                    ].join(', ')
                    : (record.applicability
                        ? `Только текстом: ${record.applicability}`
                        : 'Применимость не указана');
                return (
                    <Space direction="vertical" size={2}>
                        <Tooltip title={applicabilityHint}>
                            <Tag
                                color={applicabilityCount ? 'blue' : 'default'}
                                style={{ marginRight: 0 }}
                            >
                                <CarOutlined /> {applicabilityCount}
                            </Tag>
                        </Tooltip>
                        <Tooltip
                            title={crossCount
                                ? `Кроссов заведено: ${crossCount}`
                                : 'Кроссов нет'}
                        >
                            <Tag
                                color={crossCount ? 'gold' : 'default'}
                                style={{ marginRight: 0 }}
                            >
                                <SwapOutlined /> {crossCount}
                            </Tag>
                        </Tooltip>
                    </Space>
                );
            },
        },
        {
            title: 'Цены',
            key: 'prices',
            width: 132,
            align: 'right',
            responsive: ['md'],
            render: (_, record) => (
                <div style={{ lineHeight: 1.45, whiteSpace: 'nowrap' }}>
                    <div><Text type="secondary">Закуп:</Text> {fmtPrice(record.purchase_price)}</div>
                    <div><Text type="secondary">Розн.:</Text> {fmtPrice(record.retail_price)}</div>
                </div>
            ),
        },
        {
            title: 'Склад',
            key: 'stock',
            width: 145,
            responsive: ['md'],
            render: (_, record) => {
                const qty = record.stock_quantity ?? 0;
                const minBal = record.minimum_balance ?? 0;
                let color = '#000';
                if (minBal > 0) {
                    color = qty === 0 ? '#cf1322' : qty < minBal ? '#d46b08' : '#389e0d';
                }
                const locations = record.storage_locations || [];
                return (
                    <div style={{ lineHeight: 1.45 }}>
                        <div>
                            <Text type="secondary">Ост.:</Text>{' '}
                            <span style={{ color, fontWeight: 600 }}>{qty}</span>
                            <Text type="secondary"> / мин. {minBal}</Text>
                            {record.min_balance_auto && (
                                <Tooltip title="Минимальный остаток рассчитан автоматически">
                                    <Tag color="cyan" style={{ marginLeft: 4, marginRight: 0 }}>A</Tag>
                                </Tooltip>
                            )}
                        </div>
                        <Tooltip title={locations.length ? locations.join(', ') : 'Место не указано'}>
                            <Text type="secondary" ellipsis style={{ display: 'block', maxWidth: 132 }}>
                                {locations.length ? locations.join(', ') : 'Без места'}
                            </Text>
                        </Tooltip>
                    </div>
                );
            },
        },
        {
            title: 'Данные',
            key: 'data',
            width: 150,
            responsive: ['lg'],
            render: (_, record) => {
                // Показываем, чего не хватает для выгрузки прайса: пустые
                // реквизиты попадут в файл клиенту пустыми колонками.
                const missing = [];
                if (!record.tnved_code) missing.push('ТН ВЭД');
                if (!record.okpd2_code) missing.push('ОКПД 2');
                const hasCertificate = Boolean(
                    record.eac_cert_number || record.eac_cert_url
                );
                if (record.certification_required !== false
                    && !hasCertificate) {
                    missing.push('сертификат');
                }
                const categories = record.categories || [];
                const honestSign = record.honest_sign_category;
                const requiredCount = record.certification_required === false ? 2 : 3;
                const filledCount = requiredCount - missing.length;
                return (
                    <div style={{ lineHeight: 1.45 }}>
                        <Tooltip title={categories.length ? categories.join(', ') : 'Категория не указана'}>
                            <Text ellipsis style={{ display: 'block', maxWidth: 138 }}>
                                {categories.length ? categories.join(', ') : 'Без категории'}
                            </Text>
                        </Tooltip>
                        <Space size={4} wrap={false}>
                            {honestSign && <Tag color="purple" style={{ marginRight: 0 }}>ЧЗ</Tag>}
                            {hasCertificate && (
                                <Tooltip
                                    title={record.eac_cert_number
                                        || 'Есть ссылка на сертификат без номера'}
                                >
                                    <Tag color="blue" style={{ marginRight: 0 }}>EAC</Tag>
                                </Tooltip>
                            )}
                            <Tooltip
                                title={missing.length
                                    ? `Не заполнено: ${missing.join(', ')}`
                                    : 'Реквизиты заполнены'}
                            >
                                <Tag color={missing.length ? 'orange' : 'green'} style={{ marginRight: 0 }}>
                                    {`Реквизиты ${filledCount}/${requiredCount}`}
                                </Tag>
                            </Tooltip>
                        </Space>
                    </div>
                );
            },
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
    // Наличие аналога ищем по бренду и артикулу: у кросса без карточки в
    // номенклатуре своего id нет, и связать иначе нечем.
    const availabilityKey = (brand, oem) =>
        `${(brand || '').trim().toUpperCase()}|${(oem || '').trim().toUpperCase()}`;

    const crossAvailabilityMap = useMemo(() => {
        const карта = new Map();
        const свод = selectedRow ? availability[selectedRow.id] : null;
        for (const строка of свод?.crosses || []) {
            карта.set(
                availabilityKey(строка.brand_name, строка.oem_number),
                строка,
            );
        }
        return карта;
    }, [availability, selectedRow]);

    const renderStock = (строка) => {
        if (!строка) return <Text type="secondary">—</Text>;
        const свои = строка.own_quantity || 0;
        const чужие = строка.supplier_quantity || 0;
        if (!свои && !чужие) return <Text type="secondary">нет</Text>;
        return (
            <Space size={4} wrap={false}>
                {свои > 0 && (
                    <Tooltip title="На нашем складе">
                        <Tag color="green" style={{ marginRight: 0 }}>у нас {свои}</Tag>
                    </Tooltip>
                )}
                {чужие > 0 && (
                    <Tooltip title={`Поставщиков с наличием: ${строка.suppliers_count}`}>
                        <Tag color="blue" style={{ marginRight: 0 }}>
                            у поставщиков {чужие}
                        </Tag>
                    </Tooltip>
                )}
            </Space>
        );
    };

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
            title: 'Наличие',
            key: 'stock',
            width: 210,
            render: (_, record) => renderStock(
                crossAvailabilityMap.get(
                    availabilityKey(record.cross_brand_name, record.cross_oem_number),
                ),
            ),
        },
        {
            title: 'Лучшая цена',
            key: 'best_price',
            width: 110,
            align: 'right',
            render: (_, record) => {
                const строка = crossAvailabilityMap.get(
                    availabilityKey(record.cross_brand_name, record.cross_oem_number),
                );
                return строка?.best_price != null
                    ? fmtPrice(строка.best_price)
                    : <Text type="secondary">—</Text>;
            },
        },
        {
            title: 'Место',
            key: 'storage',
            width: 130,
            ellipsis: true,
            render: (_, record) => {
                const места = crossAvailabilityMap.get(
                    availabilityKey(record.cross_brand_name, record.cross_oem_number),
                )?.storage_locations || [];
                return места.length
                    ? <Tooltip title={места.join(', ')}>{места.join(', ')}</Tooltip>
                    : <Text type="secondary">—</Text>;
            },
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
                <Select
                    value={sourceFilter}
                    onChange={handleSourceFilter}
                    style={{ width: 180 }}
                    options={[
                        { value: 'all', label: 'Все источники' },
                        { value: 'partssoft', label: 'Только Parts-Soft' },
                        { value: 'local', label: 'Только наши' },
                    ]}
                />
                <Select
                    value={contentFilter}
                    onChange={handleContentFilter}
                    style={{ width: 210 }}
                    options={[
                        { value: 'all', label: 'Любое наполнение' },
                        { value: 'with_photo', label: 'Есть фотографии' },
                        { value: 'with_description', label: 'Есть описание' },
                        { value: 'complete', label: 'Есть фото и описание' },
                        { value: 'missing_content', label: 'Требует наполнения' },
                    ]}
                />
                <Select
                    value={linksFilter}
                    onChange={handleLinksFilter}
                    style={{ width: 210 }}
                    options={[
                        { value: 'all', label: 'Любые связи' },
                        { value: 'with_applicability', label: 'Есть применимость' },
                        { value: 'without_applicability', label: 'Без применимости' },
                        { value: 'with_crosses', label: 'Есть кроссы' },
                        { value: 'without_crosses', label: 'Без кроссов' },
                    ]}
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
                tableLayout="fixed"
                rowClassName={(record) => record.id === selectedRow?.id ? 'ant-table-row-selected' : ''}
                onRow={(record) => ({
                    onClick: () => handleRowSelect(record),
                    style: { cursor: 'pointer' },
                })}
                expandable={{
                    expandedRowKeys,
                    // Раскрытие — отдельное действие: клик по строке уже
                    // занят открытием карточки.
                    onExpand: (expanded, record) => {
                        setExpandedRowKeys(expanded ? [record.id] : []);
                        if (expanded) void loadAvailability(record.id);
                    },
                    expandedRowRender: (record) => (
                        <AvailabilityPanel
                            data={availability[record.id]}
                            loading={availabilityLoading[record.id]}
                            renderStock={renderStock}
                        />
                    ),
                }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showTotal: (t) => `Всего: ${t}`,
                    onChange: (p) => setPage(p),
                }}
            />

            {/* Large centered product card */}
            {selectedRow && (
                <Modal
                    open
                    centered
                    width={1120}
                    title="Карточка номенклатуры"
                    onCancel={() => { setSelectedRow(null); setDetail(null); }}
                    footer={null}
                    styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
                >
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
                                {detail.partssoft_product_id && (
                                    <Tag color="geekblue">
                                        Parts-Soft #{detail.partssoft_product_id}
                                    </Tag>
                                )}
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

                            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} style={{ marginBottom: 16 }}>
                                <Descriptions.Item label="Закупочная цена">{fmtPrice(detail.purchase_price)} ₽</Descriptions.Item>
                                <Descriptions.Item label="Розничная цена">{fmtPrice(detail.retail_price)} ₽</Descriptions.Item>
                                <Descriptions.Item label="Оптовая цена">{fmtPrice(detail.wholesale_price)} ₽</Descriptions.Item>
                                <Descriptions.Item label="Кратность">{detail.multiplicity ?? '—'}</Descriptions.Item>
                                <Descriptions.Item label="Минимальный остаток">{detail.minimum_balance ?? '—'}</Descriptions.Item>
                                <Descriptions.Item label="Места хранения">{(detail.storage_locations || []).join(', ') || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Размеры, мм">{[detail.length, detail.width, detail.height].filter((v) => v != null).join(' × ') || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Вес">{detail.weight != null ? `${detail.weight} кг` : '—'}</Descriptions.Item>
                                <Descriptions.Item label="Штрих-код">{detail.barcode || '—'}</Descriptions.Item>
                                <Descriptions.Item label="ТН ВЭД">{detail.tnved_code || '—'}</Descriptions.Item>
                                <Descriptions.Item label="ОКПД 2">{detail.okpd2_code || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Сертификация">
                                    {detail.certification_required === false
                                        ? 'Не требуется'
                                        : (detail.eac_cert_number
                                            || (detail.eac_cert_url
                                                ? 'Есть ссылка без номера'
                                                : 'Не заполнено'))}
                                </Descriptions.Item>
                                <Descriptions.Item label="Ссылка на сертификат">
                                    {detail.eac_cert_url ? (
                                        <Link
                                            href={detail.eac_cert_url}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Открыть документ
                                        </Link>
                                    ) : '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Сертификат действует до">{detail.eac_cert_valid_until || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Источник реквизитов">{detail.regulatory_source || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Применимость (текст)">{detail.applicability || '—'}</Descriptions.Item>
                            </Descriptions>

                            {detail.description && (
                                <div style={{ marginBottom: 16 }}>
                                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                                        Описание
                                    </Text>
                                    <Text>{detail.description}</Text>
                                </div>
                            )}

                            {(detail.photo_urls || []).length > 0 && (
                                <Image.PreviewGroup>
                                    <Space wrap style={{ marginBottom: 16 }}>
                                        {detail.photo_urls.map((url) => (
                                            <Image
                                                key={url}
                                                src={url}
                                                width={112}
                                                height={112}
                                                style={{ objectFit: 'cover', borderRadius: 8 }}
                                            />
                                        ))}
                                    </Space>
                                </Image.PreviewGroup>
                            )}

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
                </Modal>
            )}

            {/* ═══ Large edit modal ═══ */}
            <Modal
                open={drawerOpen}
                onCancel={() => setDrawerOpen(false)}
                title={editingId ? 'Редактирование позиции' : 'Новая позиция'}
                centered
                width={1180}
                loading={drawerLoading}
                footer={
                    <Space>
                        <Button onClick={() => setDrawerOpen(false)}>Отмена</Button>
                        <Button type="primary" onClick={handleSave} loading={saving}>
                            Сохранить
                        </Button>
                    </Space>
                }
                styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
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
                                                filterOption={false}
                                                onSearch={searchBrandOptions}
                                                onOpenChange={(open) => {
                                                    if (open) searchBrandOptions('');
                                                }}
                                                options={brands}
                                                placeholder="Начните вводить название бренда"
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
                                            <Input.TextArea rows={5} />
                                        </Form.Item>
                                        <Form.Item name="comment" label="Комментарий">
                                            <Input.TextArea rows={2} />
                                        </Form.Item>
                                        <Form.Item name="applicability" label="Применимость (текстовое описание)">
                                            <Input.TextArea rows={2} />
                                        </Form.Item>
                                        <Form.Item name="honest_sign_category" label="Категория ЧЗ (старое текстовое поле)">
                                            <Input />
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
                            // ── Реквизиты для прайса ──────────────────────────
                            {
                                key: 'regulatory',
                                label: 'Реквизиты',
                                children: (
                                    <>
                                        <div style={{ marginBottom: 12 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Обязательные колонки прайс-листа. Заполняются один раз
                                                и подставляются во все выгрузки автоматически.
                                            </Text>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <Form.Item
                                                name="tnved_code"
                                                label="ТН ВЭД"
                                                tooltip="Эталон — графа 33 ГТД или УПД поставщика"
                                            >
                                                <Input placeholder="10 знаков" />
                                            </Form.Item>
                                            <Form.Item
                                                name="okpd2_code"
                                                label="ОКПД 2"
                                                tooltip="Выводится из ТН ВЭД по переходным ключам, выбор подтверждает человек"
                                            >
                                                <Input placeholder="Например: 29.32.30.390" />
                                            </Form.Item>
                                        </div>
                                        <Form.Item
                                            name="certification_required"
                                            label="Оценка соответствия"
                                        >
                                            <Select
                                                allowClear
                                                placeholder="Не определено"
                                                options={[
                                                    { value: true, label: 'Требует сертификации' },
                                                    { value: false, label: 'Не требует сертификации' },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="eac_cert_number" label="Номер сертификата ЕАС">
                                            <Input placeholder="ЕАЭС RU Д-CN.XXXX.XX.XXXXX/XX" />
                                        </Form.Item>
                                        <Form.Item name="eac_cert_url" label="Ссылка на сертификат">
                                            <Input placeholder="https://pub.fsa.gov.ru/... или https://swis.trade.kg/..." />
                                        </Form.Item>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <Form.Item
                                                name="eac_cert_valid_until"
                                                label="Действует до"
                                                tooltip="По истечении позиция попадёт в отчёт незаполненных"
                                            >
                                                <Input placeholder="ГГГГ-ММ-ДД" />
                                            </Form.Item>
                                            <Form.Item
                                                name="regulatory_source"
                                                label="Источник данных"
                                            >
                                                <Select
                                                    allowClear
                                                    placeholder="Откуда взято"
                                                    options={[
                                                        { value: 'gtd', label: 'ГТД' },
                                                        { value: 'supplier_doc', label: 'Документ поставщика' },
                                                        { value: 'registry', label: 'Реестр ФГИС' },
                                                        { value: 'manual', label: 'Вручную' },
                                                        { value: 'rule', label: 'Правило по названию' },
                                                    ]}
                                                />
                                            </Form.Item>
                                        </div>
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
                            {
                                key: 'photos',
                                label: `Фотографии (${editingPhotos.length})`,
                                children: (
                                    <div>
                                        <Upload
                                            accept="image/jpeg,image/png,image/webp"
                                            multiple
                                            showUploadList={false}
                                            customRequest={handlePhotoUpload}
                                            disabled={!editingId}
                                        >
                                            <Button type="primary" icon={<UploadOutlined />} disabled={!editingId}>
                                                Добавить фотографии
                                            </Button>
                                        </Upload>
                                        {!editingId && (
                                            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                                                Сначала сохраните новую позицию, затем откройте её для добавления фото.
                                            </Text>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginTop: 16 }}>
                                            {editingPhotos.map((photo) => (
                                                <div key={photo.id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 10 }}>
                                                    <Image
                                                        src={photo.url}
                                                        width="100%"
                                                        height={150}
                                                        style={{ objectFit: 'contain', borderRadius: 6 }}
                                                    />
                                                    <Space style={{ marginTop: 8 }}>
                                                        <Upload
                                                            accept="image/jpeg,image/png,image/webp"
                                                            showUploadList={false}
                                                            customRequest={handlePhotoReplace(photo.id)}
                                                        >
                                                            <Button size="small">Заменить</Button>
                                                        </Upload>
                                                        <Popconfirm
                                                            title="Удалить фотографию?"
                                                            onConfirm={() => handlePhotoDelete(photo.id)}
                                                            okText="Удалить"
                                                            cancelText="Отмена"
                                                        >
                                                            <Button size="small" danger>Удалить</Button>
                                                        </Popconfirm>
                                                    </Space>
                                                </div>
                                            ))}
                                        </div>
                                        {!editingPhotos.length && editingId && (
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                Фотографий пока нет.
                                            </Text>
                                        )}
                                    </div>
                                ),
                            },
                            ...(editingDetail?.partssoft_product_id ? [{
                                key: 'partssoft',
                                label: 'Parts-Soft',
                                children: (
                                    <div>
                                        <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                                            <Descriptions.Item label="ID">{editingDetail.partssoft_product_id}</Descriptions.Item>
                                            <Descriptions.Item label="Обновлено в Parts-Soft">{editingDetail.partssoft_product_updated_at || '—'}</Descriptions.Item>
                                            <Descriptions.Item label="Синхронизировано у нас">{editingDetail.partssoft_synced_at || '—'}</Descriptions.Item>
                                        </Descriptions>
                                        <Text strong>Все исходные поля Parts-Soft</Text>
                                        <pre style={{ marginTop: 8, padding: 12, background: '#f6f8fa', borderRadius: 8, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                            {JSON.stringify(editingDetail.partssoft_payload || {}, null, 2)}
                                        </pre>
                                    </div>
                                ),
                            }] : []),
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
            </Modal>

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
