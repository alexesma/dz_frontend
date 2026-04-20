import React, {
    useCallback, useEffect, useRef, useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AutoComplete,
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    FileTextOutlined,
    PlusOutlined,
    PrinterOutlined,
    SaveOutlined,
} from '@ant-design/icons';

import { searchAutopartsByOem } from '../api/autoparts';
import { getAllProviders } from '../api/providers';
import {
    addSupplierReceiptItems,
    createManualSupplierReceipt,
    deleteSupplierReceipt,
    deleteSupplierReceiptItem,
    getSupplierReceipt,
    getSupplierReceipts,
    postSupplierReceipt,
    unpostSupplierReceipt,
    updateSupplierReceipt,
    updateSupplierReceiptItem,
} from '../api/customerOrders';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const VAT_RATE = 0.22;

const getDefaultDateRange = () => {
    const today = dayjs();
    return [today.subtract(7, 'day').startOf('day'), today.endOf('day')];
};

const formatMoney = (value) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (Number.isNaN(num)) return '—';
    return num.toFixed(2);
};

// ─── Label print styles injected once ────────────────────────────────────────
const LABEL_STYLE_ID = 'label-print-style';
function ensureLabelPrintStyle() {
    if (document.getElementById(LABEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LABEL_STYLE_ID;
    style.innerHTML = `
@media print {
    body > *:not(#label-print-root) { display: none !important; }
    #label-print-root { display: block !important; }
    @page { size: 58mm 40mm; margin: 1mm; }
    .label-card {
        width: 56mm; height: 38mm;
        border: 0.3mm solid #000;
        padding: 1.5mm;
        box-sizing: border-box;
        font-family: Arial, sans-serif;
        font-size: 7pt;
        page-break-after: always;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    .label-oem { font-size: 11pt; font-weight: bold; }
    .label-brand { font-size: 9pt; font-weight: bold; }
    .label-name { font-size: 6pt; overflow: hidden; max-height: 8mm; }
    .label-qty { font-size: 9pt; }
    .label-footer { font-size: 5.5pt; color: #333; }
}
@media screen {
    .label-card {
        width: 174px; height: 113px;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        padding: 6px;
        box-sizing: border-box;
        font-family: Arial, sans-serif;
        font-size: 10px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: #fff;
    }
    .label-oem { font-size: 14px; font-weight: bold; }
    .label-brand { font-size: 12px; font-weight: bold; }
    .label-name { font-size: 9px; overflow: hidden; max-height: 24px; line-height: 1.2; }
    .label-qty { font-size: 12px; font-weight: 600; }
    .label-footer { font-size: 8px; color: #666; margin-top: 2px; }
}
    `;
    document.head.appendChild(style);
}

// ─── Single label card ────────────────────────────────────────────────────────
const LabelCard = ({ item, receipt }) => (
    <div className="label-card">
        <div>
            <div className="label-oem">{item.oem_number || '—'}</div>
            <div className="label-brand">{item.brand_name || '—'}</div>
            <div className="label-name">{item.autopart_name || ''}</div>
        </div>
        <div>
            <div className="label-qty">
                Кол-во: <b>{item.received_quantity}</b>
                {item.price ? `  Цена: ${formatMoney(item.price)}` : ''}
            </div>
            <div className="label-footer">
                {receipt.provider_name || ''}
                {receipt.document_number ? ` · УПД ${receipt.document_number}` : ''}
                {receipt.document_date
                    ? ` · ${dayjs(receipt.document_date).format('DD.MM.YYYY')}`
                    : ''}
            </div>
        </div>
    </div>
);

// ─── Label print modal ────────────────────────────────────────────────────────
const LabelModal = ({ open, receipt, onClose }) => {
    useEffect(() => {
        if (open) ensureLabelPrintStyle();
    }, [open]);

    if (!receipt) return null;
    const items = receipt.items || [];

    const handlePrint = () => {
        const root = document.getElementById('label-print-root');
        if (!root) return;
        root.style.display = 'block';
        window.print();
        root.style.display = 'none';
    };

    return (
        <>
            {/* Hidden print root rendered outside modal */}
            <div
                id="label-print-root"
                style={{ display: 'none', position: 'fixed', top: 0, left: 0, zIndex: 99999 }}
            >
                {items.map((item) => (
                    <LabelCard key={item.id} item={item} receipt={receipt} />
                ))}
            </div>

            <Modal
                open={open}
                onCancel={onClose}
                title={`Печать этикеток — документ #${receipt.id}`}
                footer={
                    <Space>
                        <Button icon={<PrinterOutlined />} type="primary" onClick={handlePrint}>
                            Печать ({items.length} этик.)
                        </Button>
                        <Button onClick={onClose}>Закрыть</Button>
                    </Space>
                }
                width={700}
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    Размер этикетки: 58 × 40 мм. Предпросмотр:
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                    {items.map((item) => (
                        <LabelCard key={item.id} item={item} receipt={receipt} />
                    ))}
                </div>
            </Modal>
        </>
    );
};

// ─── Article search cell ───────────────────────────────────────────────────────
const ArticleSearchCell = ({ currentOem, currentBrand, currentName, onSelect }) => {
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    const handleSearch = useCallback((val) => {
        setQuery(val);
        clearTimeout(debounceRef.current);
        if (!val || val.length < 2) { setOptions([]); return; }
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await searchAutopartsByOem(val, 20);
                setOptions((res.data || []).map((part) => ({
                    value: String(part.id),
                    label: (
                        <div style={{ lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{part.oem_number}</span>
                            <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>{part.brand}</span>
                            <br />
                            <span style={{ fontSize: 11, color: '#555' }}>{part.name || '—'}</span>
                        </div>
                    ),
                    data: part,
                })));
            } catch {
                setOptions([]);
            } finally {
                setLoading(false);
            }
        }, 300);
    }, []);

    const handleSelect = (_, option) => {
        onSelect(option.data);
        setSearching(false);
        setQuery('');
        setOptions([]);
    };

    if (searching) {
        return (
            <AutoComplete
                autoFocus
                size="small"
                style={{ width: '100%', minWidth: 200 }}
                options={options}
                value={query}
                placeholder="Введите артикул..."
                onChange={handleSearch}
                onSelect={handleSelect}
                onBlur={() => { setSearching(false); setQuery(''); setOptions([]); }}
                notFoundContent={loading
                    ? <Spin size="small" />
                    : query.length >= 2 ? 'Не найдено' : 'Введите от 2 символов'}
                popupMatchSelectWidth={320}
            />
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ flex: 1, lineHeight: 1.3, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentOem || '—'}
                    {currentBrand && (
                        <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>{currentBrand}</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentName || '—'}
                </div>
            </div>
            <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ fontSize: 11 }} />}
                onClick={() => setSearching(true)}
                style={{ flexShrink: 0, padding: '0 2px' }}
                title="Изменить позицию"
            />
        </div>
    );
};

// ─── Main page ─────────────────────────────────────────────────────────────────
const IncomingSupplierDocumentsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [providers, setProviders] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [postingId, setPostingId] = useState(null);
    const [unpostingId, setUnpostingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [filters, setFilters] = useState({
        providerId: null,
        dateRange: getDefaultDateRange(),
        status: 'all',
    });

    // Detail modal
    const [detailVisible, setDetailVisible] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailReceipt, setDetailReceipt] = useState(null);

    // Edit mode
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [headerForm] = Form.useForm();
    // editedItems: { [itemId]: { price, received_quantity, comment, gtd_code, country_name, oem_number, brand_name, autopart_name } }
    const [editedItems, setEditedItems] = useState({});
    const [newItems, setNewItems] = useState([]); // rows being added
    const newItemKeyRef = useRef(0);

    // Label modal
    const [labelVisible, setLabelVisible] = useState(false);

    // Create document modal
    const [createVisible, setCreateVisible] = useState(false);
    const [createForm] = Form.useForm();
    const [createSaving, setCreateSaving] = useState(false);
    const [createItems, setCreateItems] = useState([]);
    const createItemKeyRef = useRef(0);

    const addCreateItem = useCallback(() => {
        setCreateItems((prev) => [...prev, {
            _key: createItemKeyRef.current++,
            autopart_id: null, oem_number: '', brand_name: '', autopart_name: '',
            received_quantity: 1, price: null, comment: '',
        }]);
    }, []);

    const updateCreateItem = useCallback((key, field, value) => {
        setCreateItems((prev) => prev.map((it) => (it._key === key ? { ...it, [field]: value } : it)));
    }, []);

    const removeCreateItem = useCallback((key) => {
        setCreateItems((prev) => prev.filter((it) => it._key !== key));
    }, []);

    // ── load providers ──────────────────────────────────────────────────────
    useEffect(() => {
        getAllProviders({ sort_by: 'name', sort_dir: 'asc' })
            .then((items) => setProviders(items || []))
            .catch(() => message.error('Не удалось загрузить поставщиков'));
    }, []);

    // ── fetch list ──────────────────────────────────────────────────────────
    const fetchDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.providerId) params.provider_id = filters.providerId;
            if (filters.dateRange?.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            if (filters.status === 'draft') params.posted = false;
            else if (filters.status === 'posted') params.posted = true;
            const response = await getSupplierReceipts(params);
            setRows(response.data || []);
        } catch {
            message.error('Не удалось загрузить документы поступления');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    // ── auto-open receipt from ?openId= URL param (redirect from SupplierReceiptsPage) ──
    useEffect(() => {
        const openId = searchParams.get('openId');
        if (!openId) return;
        // Remove the param so it doesn't re-trigger on re-render
        setSearchParams({}, { replace: true });
        handleOpenDetail(Number(openId));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── open detail ─────────────────────────────────────────────────────────
    const handleOpenDetail = useCallback(async (receiptId) => {
        setDetailVisible(true);
        setDetailLoading(true);
        setDetailReceipt(null);
        setEditMode(false);
        setEditedItems({});
        setNewItems([]);
        try {
            const { data } = await getSupplierReceipt(receiptId);
            setDetailReceipt(data);
        } catch {
            message.error('Не удалось загрузить документ');
            setDetailVisible(false);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const reloadDetail = useCallback(async (receiptId) => {
        try {
            const { data } = await getSupplierReceipt(receiptId);
            setDetailReceipt(data);
            return data;
        } catch {
            message.error('Не удалось обновить документ');
            return null;
        }
    }, []);

    // ── edit mode helpers ───────────────────────────────────────────────────
    const enterEditMode = () => {
        if (!detailReceipt) return;
        headerForm.setFieldsValue({
            document_number: detailReceipt.document_number || '',
            document_date: detailReceipt.document_date
                ? dayjs(detailReceipt.document_date) : null,
            comment: detailReceipt.comment || '',
        });
        const initItems = {};
        (detailReceipt.items || []).forEach((item) => {
            initItems[item.id] = {
                oem_number: item.oem_number || '',
                brand_name: item.brand_name || '',
                autopart_name: item.autopart_name || '',
                received_quantity: item.received_quantity,
                price: item.price != null ? Number(item.price) : null,
                total_price_with_vat: item.total_price_with_vat != null
                    ? Number(item.total_price_with_vat) : null,
                gtd_code: item.gtd_code || '',
                country_name: item.country_name || '',
                comment: item.comment || '',
            };
        });
        setEditedItems(initItems);
        setNewItems([]);
        setEditMode(true);
    };

    const cancelEditMode = () => {
        setEditMode(false);
        setEditedItems({});
        setNewItems([]);
    };

    const setItemField = (itemId, field, value) => {
        setEditedItems((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], [field]: value },
        }));
    };

    const addNewItemRow = () => {
        const key = `new_${newItemKeyRef.current++}`;
        setNewItems((prev) => [...prev, {
            _key: key,
            oem_number: '', brand_name: '', autopart_name: '',
            received_quantity: 1, price: null, total_price_with_vat: null,
            gtd_code: '', country_name: '', comment: '',
        }]);
    };

    const updateNewItem = (key, field, value) => {
        setNewItems((prev) => prev.map((r) => r._key === key ? { ...r, [field]: value } : r));
    };

    const removeNewItem = (key) => {
        setNewItems((prev) => prev.filter((r) => r._key !== key));
    };

    // ── save edit ───────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!detailReceipt) return;
        setSaving(true);
        try {
            const headerVals = await headerForm.validateFields();
            // save header
            await updateSupplierReceipt(detailReceipt.id, {
                document_number: headerVals.document_number || null,
                document_date: headerVals.document_date
                    ? headerVals.document_date.format('YYYY-MM-DD') : null,
                comment: headerVals.comment || null,
            });

            // save changed items
            for (const [idStr, fields] of Object.entries(editedItems)) {
                await updateSupplierReceiptItem(Number(idStr), {
                    autopart_id: fields.autopart_id ?? null,
                    oem_number: fields.oem_number || null,
                    brand_name: fields.brand_name || null,
                    autopart_name: fields.autopart_name || null,
                    received_quantity: fields.received_quantity,
                    price: fields.price != null ? fields.price : null,
                    total_price_with_vat: fields.total_price_with_vat != null
                        ? fields.total_price_with_vat : null,
                    gtd_code: fields.gtd_code || null,
                    country_name: fields.country_name || null,
                    comment: fields.comment || null,
                });
            }

            // add new items
            if (newItems.length > 0) {
                await addSupplierReceiptItems(
                    detailReceipt.id,
                    newItems.map((item) => ({
                        supplier_order_item_id: item.supplier_order_item_id ?? null,
                        autopart_id: item.autopart_id ?? null,
                        oem_number: item.oem_number || null,
                        brand_name: item.brand_name || null,
                        autopart_name: item.autopart_name || null,
                        received_quantity: item.received_quantity,
                        price: item.price != null ? item.price : null,
                        total_price_with_vat: item.total_price_with_vat != null
                            ? item.total_price_with_vat : null,
                        gtd_code: item.gtd_code || null,
                        country_name: item.country_name || null,
                        comment: item.comment || null,
                    })),
                );
            }

            message.success('Документ сохранён');
            setEditMode(false);
            setEditedItems({});
            setNewItems([]);
            await reloadDetail(detailReceipt.id);
            fetchDocuments();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось сохранить');
        } finally {
            setSaving(false);
        }
    };

    // ── delete item ─────────────────────────────────────────────────────────
    const handleDeleteItem = async (itemId) => {
        try {
            const updated = await deleteSupplierReceiptItem(itemId);
            setDetailReceipt(updated.data);
            setEditedItems((prev) => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            message.success('Строка удалена');
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось удалить строку');
        }
    };

    // ── post / unpost ───────────────────────────────────────────────────────
    const handlePost = async (receiptId) => {
        setPostingId(receiptId);
        try {
            await postSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} проведен`);
            fetchDocuments();
            if (detailReceipt?.id === receiptId) await reloadDetail(receiptId);
            // Offer to print labels after posting
            Modal.confirm({
                title: 'Документ проведён',
                content: 'Распечатать этикетки для полученных позиций?',
                okText: 'Печать',
                cancelText: 'Пропустить',
                onOk: () => setLabelVisible(true),
            });
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось провести документ');
        } finally {
            setPostingId(null);
        }
    };

    const handleUnpost = async (receiptId) => {
        setUnpostingId(receiptId);
        try {
            await unpostSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} распроведен`);
            fetchDocuments();
            if (detailReceipt?.id === receiptId) await reloadDetail(receiptId);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось распровести документ');
        } finally {
            setUnpostingId(null);
        }
    };

    // ── delete receipt ──────────────────────────────────────────────────────
    const performDelete = async (receiptId) => {
        setDeletingId(receiptId);
        try {
            await deleteSupplierReceipt(receiptId);
            message.success(`Документ #${receiptId} удален`);
            fetchDocuments();
            if (detailReceipt?.id === receiptId) setDetailVisible(false);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось удалить документ');
        } finally {
            setDeletingId(null);
        }
    };


    // ── create manual receipt ───────────────────────────────────────────────
    const handleCreateSubmit = async () => {
        setCreateSaving(true);
        try {
            const values = await createForm.validateFields();
            const items = createItems.map((item) => ({
                autopart_id: item.autopart_id ?? null,
                oem_number: item.oem_number || null,
                brand_name: item.brand_name || null,
                autopart_name: item.autopart_name || null,
                received_quantity: item.received_quantity || 0,
                price: item.price != null ? item.price : null,
                comment: item.comment || null,
            }));
            const payload = {
                provider_id: values.provider_id,
                document_number: values.document_number || null,
                document_date: values.document_date
                    ? values.document_date.format('YYYY-MM-DD') : null,
                comment: values.comment || null,
                post_now: false,
                items,
            };
            const { data } = await createManualSupplierReceipt(payload);
            message.success(`Документ #${data.id} создан`);
            createForm.resetFields();
            setCreateItems([]);
            setCreateVisible(false);
            fetchDocuments();
            handleOpenDetail(data.id);
        } catch (err) {
            if (err?.errorFields) return; // form validation
            message.error(err?.response?.data?.detail || 'Не удалось создать документ');
        } finally {
            setCreateSaving(false);
        }
    };

    // ── list columns ────────────────────────────────────────────────────────
    const columns = [
        {
            title: 'ID', dataIndex: 'id', key: 'id', width: 70,
            render: (v) => `#${v}`,
        },
        {
            title: 'Поставщик', dataIndex: 'provider_name', key: 'provider_name',
            width: 200, ellipsis: true, render: (v) => v || '—',
        },
        {
            title: 'Статус', key: 'status', width: 110,
            render: (_, row) => row.posted_at
                ? <Tag color="green">Проведен</Tag>
                : <Tag color="gold">Документ</Tag>,
        },
        {
            title: 'Документ', key: 'document', width: 200,
            render: (_, row) => {
                const num = row.document_number || 'б/н';
                const dt = row.document_date ? dayjs(row.document_date).format('DD.MM.YYYY') : '—';
                return `${num} · ${dt}`;
            },
        },
        {
            title: 'Создан', dataIndex: 'created_at', key: 'created_at', width: 130,
            render: (v) => v ? dayjs(v).format('DD.MM.YY HH:mm') : '—',
        },
        {
            title: 'Строк', key: 'items_count', width: 70, align: 'right',
            render: (_, row) => row.items?.length || 0,
        },
        {
            title: 'Кол-во', key: 'qty', width: 70, align: 'right',
            render: (_, row) => (row.items || []).reduce(
                (s, i) => s + Number(i.received_quantity || 0), 0
            ),
        },
        {
            title: 'Действия', key: 'actions', width: 280,
            render: (_, row) => (
                <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<FileTextOutlined />}
                        onClick={() => handleOpenDetail(row.id)}>
                        Открыть
                    </Button>
                    {row.posted_at ? (
                        <Button size="small" onClick={() => handleUnpost(row.id)}
                            loading={unpostingId === row.id}>
                            Распровести
                        </Button>
                    ) : (
                        <Button size="small" type="primary" onClick={() => handlePost(row.id)}
                            loading={postingId === row.id}>
                            Провести
                        </Button>
                    )}
                    {!row.posted_at && (
                        <Popconfirm
                            title="Удалить документ?"
                            okText="Удалить" okButtonProps={{ danger: true }}
                            cancelText="Отмена"
                            onConfirm={() => performDelete(row.id)}
                        >
                            <Button size="small" danger loading={deletingId === row.id}>
                                Удалить
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    // ── detail modal: build item table columns ──────────────────────────────
    const buildItemColumns = (isVatPayer, isDraft) => {
        const baseColsView = [
            {
                title: '№', key: 'idx', width: 45, align: 'center',
                render: (_, __, i) => i + 1,
            },
            {
                title: 'Артикул', dataIndex: 'oem_number', key: 'oem', width: 130,
                render: (v) => v || '—',
            },
            {
                title: 'Бренд', dataIndex: 'brand_name', key: 'brand', width: 110,
                render: (v) => v || '—',
            },
            {
                title: 'Наименование', dataIndex: 'autopart_name', key: 'name', ellipsis: true,
                render: (v) => v || '—',
            },
            {
                title: 'Кол-во', dataIndex: 'received_quantity', key: 'qty',
                width: 80, align: 'right',
            },
            {
                title: 'Цена', dataIndex: 'price', key: 'price',
                width: 100, align: 'right',
                render: (v, row) => {
                    // If total_price_with_vat is stored, derive price-without-VAT
                    // to avoid showing a WITH-VAT price in the "Цена" column
                    if (row.total_price_with_vat != null && row.received_quantity) {
                        return formatMoney(
                            Number(row.total_price_with_vat) / Number(row.received_quantity) / (1 + VAT_RATE),
                        );
                    }
                    return formatMoney(v);
                },
            },
            {
                title: 'Сумма', key: 'sum', width: 110, align: 'right',
                render: (_, row) => {
                    const q = Number(row.received_quantity || 0);
                    if (row.total_price_with_vat != null) {
                        const baseSum = Number(row.total_price_with_vat) / (1 + VAT_RATE);
                        return baseSum > 0 ? formatMoney(baseSum) : '—';
                    }
                    const p = Number(row.price || 0);
                    return q && p ? formatMoney(q * p) : '—';
                },
            },
        ];

        const vatCols = isVatPayer ? [
            {
                title: 'НДС 22%', key: 'vat', width: 110, align: 'right',
                render: (_, row) => {
                    if (row.total_price_with_vat != null) {
                        const total = Number(row.total_price_with_vat);
                        return total > 0 ? formatMoney(total - total / (1 + VAT_RATE)) : '—';
                    }
                    const q = Number(row.received_quantity || 0);
                    const p = Number(row.price || 0);
                    return q && p ? formatMoney(q * p * VAT_RATE) : '—';
                },
            },
            {
                title: 'С НДС', key: 'total_vat', width: 120, align: 'right',
                render: (_, row) => {
                    const val = row.total_price_with_vat != null
                        ? Number(row.total_price_with_vat)
                        : (Number(row.received_quantity || 0) * Number(row.price || 0) * (1 + VAT_RATE));
                    return <Text strong>{formatMoney(val)}</Text>;
                },
            },
        ] : [];

        const extraCols = [
            {
                title: 'ГТД', dataIndex: 'gtd_code', key: 'gtd', width: 130,
                ellipsis: true, render: (v) => v || '—',
            },
            {
                title: 'Страна', dataIndex: 'country_name', key: 'country', width: 100,
                ellipsis: true, render: (v, row) => v || row.country_code || '—',
            },
            {
                title: 'Заказал', key: 'customer', width: 150, ellipsis: true,
                render: (_, row) => {
                    const parts = [];
                    if (row.customer_name) parts.push(row.customer_name);
                    if (row.customer_order_number) parts.push(`№${row.customer_order_number}`);
                    return parts.length ? (
                        <Tooltip title={parts.join(' / ')}>{parts.join(' / ')}</Tooltip>
                    ) : '—';
                },
            },
            {
                title: 'Примечание', dataIndex: 'comment', key: 'comment', width: 140,
                ellipsis: true, render: (v) => v || '—',
            },
        ];

        const actionCol = isDraft ? [{
            title: '',
            key: 'del',
            width: 40,
            render: (_, row) => (
                <Popconfirm
                    title="Удалить строку?"
                    okText="Да" cancelText="Нет"
                    onConfirm={() => handleDeleteItem(row.id)}
                >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        }] : [];

        if (!editMode) {
            return [...baseColsView, ...vatCols, ...extraCols, ...actionCol];
        }

        // Edit mode columns
        const mkInput = (field, itemId, placeholder = '') => (
            <Input
                size="small"
                value={editedItems[itemId]?.[field] ?? ''}
                placeholder={placeholder}
                onChange={(e) => setItemField(itemId, field, e.target.value)}
                style={{ minWidth: 60 }}
            />
        );
        const mkNumber = (field, itemId, min = 0) => (
            <InputNumber
                size="small"
                min={min}
                value={editedItems[itemId]?.[field] ?? null}
                onChange={(v) => setItemField(itemId, field, v)}
                style={{ width: '100%' }}
            />
        );

        return [
            { title: '№', key: 'idx', width: 45, align: 'center', render: (_, __, i) => i + 1 },
            {
                title: 'Позиция', key: 'position', width: 260,
                render: (_, row) => (
                    <ArticleSearchCell
                        currentOem={editedItems[row.id]?.oem_number ?? row.oem_number}
                        currentBrand={editedItems[row.id]?.brand_name ?? row.brand_name}
                        currentName={editedItems[row.id]?.autopart_name ?? row.autopart_name}
                        onSelect={(part) => {
                            setItemField(row.id, 'autopart_id', part.id);
                            setItemField(row.id, 'oem_number', part.oem_number);
                            setItemField(row.id, 'brand_name', part.brand);
                            setItemField(row.id, 'autopart_name', part.name || '');
                        }}
                    />
                ),
            },
            {
                title: 'Кол-во', key: 'qty', width: 90,
                render: (_, row) => mkNumber('received_quantity', row.id, 0),
            },
            {
                title: 'Цена', key: 'price', width: 100,
                render: (_, row) => mkNumber('price', row.id, 0),
            },
            ...(isVatPayer ? [{
                title: 'С НДС', key: 'tvat', width: 110,
                render: (_, row) => mkNumber('total_price_with_vat', row.id, 0),
            }] : []),
            {
                title: 'ГТД', key: 'gtd', width: 120,
                render: (_, row) => mkInput('gtd_code', row.id, 'ГТД'),
            },
            {
                title: 'Страна', key: 'country', width: 100,
                render: (_, row) => mkInput('country_name', row.id, 'Страна'),
            },
            {
                title: 'Примечание', key: 'comment', width: 130,
                render: (_, row) => mkInput('comment', row.id, 'Примечание'),
            },
            {
                title: '',
                key: 'del',
                width: 40,
                render: (_, row) => (
                    <Popconfirm
                        title="Удалить строку?"
                        okText="Да" cancelText="Нет"
                        onConfirm={() => handleDeleteItem(row.id)}
                    >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                ),
            },
        ];
    };

    // New item row columns (edit mode)
    const newItemColumns = (isVatPayer) => [
        { title: '№', key: 'idx', width: 45, align: 'center', render: () => <Text type="secondary">+</Text> },
        {
            title: 'Позиция', key: 'position', width: 260,
            render: (_, row) => (
                <ArticleSearchCell
                    currentOem={row.oem_number}
                    currentBrand={row.brand_name}
                    currentName={row.autopart_name}
                    onSelect={(part) => {
                        updateNewItem(row._key, 'autopart_id', part.id);
                        updateNewItem(row._key, 'oem_number', part.oem_number);
                        updateNewItem(row._key, 'brand_name', part.brand);
                        updateNewItem(row._key, 'autopart_name', part.name || '');
                    }}
                />
            ),
        },
        {
            title: 'Кол-во', key: 'qty', width: 90,
            render: (_, row) => (
                <InputNumber size="small" min={0} value={row.received_quantity}
                    onChange={(v) => updateNewItem(row._key, 'received_quantity', v)}
                    style={{ width: '100%' }} />
            ),
        },
        {
            title: 'Цена', key: 'price', width: 100,
            render: (_, row) => (
                <InputNumber size="small" min={0} value={row.price}
                    onChange={(v) => updateNewItem(row._key, 'price', v)}
                    style={{ width: '100%' }} />
            ),
        },
        ...(isVatPayer ? [{
            title: 'С НДС', key: 'tvat', width: 110,
            render: (_, row) => (
                <InputNumber size="small" min={0} value={row.total_price_with_vat}
                    onChange={(v) => updateNewItem(row._key, 'total_price_with_vat', v)}
                    style={{ width: '100%' }} />
            ),
        }] : []),
        {
            title: 'ГТД', key: 'gtd', width: 120,
            render: (_, row) => (
                <Input size="small" value={row.gtd_code}
                    placeholder="ГТД"
                    onChange={(e) => updateNewItem(row._key, 'gtd_code', e.target.value)} />
            ),
        },
        {
            title: 'Страна', key: 'country', width: 100,
            render: (_, row) => (
                <Input size="small" value={row.country_name}
                    placeholder="Страна"
                    onChange={(e) => updateNewItem(row._key, 'country_name', e.target.value)} />
            ),
        },
        {
            title: 'Примечание', key: 'comment', width: 130,
            render: (_, row) => (
                <Input size="small" value={row.comment}
                    placeholder="Примечание"
                    onChange={(e) => updateNewItem(row._key, 'comment', e.target.value)} />
            ),
        },
        {
            title: '', key: 'del', width: 40,
            render: (_, row) => (
                <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => removeNewItem(row._key)} />
            ),
        },
    ];

    // ── totals calculation ──────────────────────────────────────────────────
    const calcTotals = (items, isVatPayer) => {
        let qty = 0, sum = 0, vat = 0, total = 0;
        (items || []).forEach((item) => {
            const q = Number(item.received_quantity || 0);
            qty += q;
            if (item.total_price_with_vat != null) {
                // total_price_with_vat is the authoritative total WITH VAT
                const lineTotal = Number(item.total_price_with_vat);
                const lineBase = lineTotal / (1 + VAT_RATE);
                sum += lineBase;
                if (isVatPayer) {
                    vat += lineTotal - lineBase;
                    total += lineTotal;
                } else {
                    total += lineBase;
                }
            } else {
                const p = Number(item.price || 0);
                const lineSum = q * p;
                sum += lineSum;
                if (isVatPayer) {
                    const lineTotal = lineSum * (1 + VAT_RATE);
                    vat += lineTotal - lineSum;
                    total += lineTotal;
                } else {
                    total += lineSum;
                }
            }
        });
        return { qty, sum, vat, total };
    };

    // ── render ──────────────────────────────────────────────────────────────
    return (
        <div className="page-shell">
            <Card>
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                    <Col>
                        <Title level={3} style={{ margin: 0 }}>Документы: входящие</Title>
                    </Col>
                    <Col>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                                createForm.resetFields();
                                setCreateItems([]);
                                setCreateVisible(true);
                            }}
                        >
                            Создать документ
                        </Button>
                    </Col>
                </Row>

                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Select showSearch allowClear placeholder="Поставщик"
                            style={{ width: '100%' }}
                            value={filters.providerId}
                            onChange={(v) => setFilters((p) => ({ ...p, providerId: v || null }))}
                            options={providers.map((pr) => ({ value: pr.id, label: pr.name }))}
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <RangePicker style={{ width: '100%' }} value={filters.dateRange}
                            format="DD.MM.YY"
                            onChange={(v) => setFilters((p) => ({
                                ...p, dateRange: v || getDefaultDateRange(),
                            }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select style={{ width: '100%' }} value={filters.status}
                            onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
                            options={[
                                { value: 'all', label: 'Все' },
                                { value: 'draft', label: "Документы (чернов.)" },
                                { value: 'posted', label: 'Проведенные' },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Button type="primary" block onClick={fetchDocuments} loading={loading}>
                            Обновить
                        </Button>
                    </Col>
                </Row>

                {!rows.length && !loading ? (
                    <Empty description="Документы не найдены" />
                ) : (
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={rows.map((r) => ({ ...r, key: r.id }))}
                        columns={columns}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        scroll={{ x: 1200 }}
                        onRow={(row) => ({
                            onClick: (e) => {
                                if (e.target.closest('button, .ant-select, .ant-popover')) return;
                                handleOpenDetail(row.id);
                            },
                            style: { cursor: 'pointer' },
                        })}
                    />
                )}
            </Card>

            {/* ─── Detail / Edit modal ─────────────────────────────────────── */}
            <Modal
                open={detailVisible}
                onCancel={() => {
                    setDetailVisible(false);
                    cancelEditMode();
                }}
                footer={null}
                width="92%"
                style={{ maxWidth: 1500, top: 16 }}
                title={
                    detailReceipt ? (
                        <Space>
                            <span>Документ поступления #{detailReceipt.id}</span>
                            {detailReceipt.posted_at
                                ? <Tag color="green">Проведен</Tag>
                                : <Tag color="gold">Документ</Tag>}
                        </Space>
                    ) : 'Документ поступления'
                }
                destroyOnClose
            >
                {detailLoading && (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                )}

                {!detailLoading && detailReceipt && (() => {
                    const isVatPayer = detailReceipt.provider_is_vat_payer;
                    const isDraft = !detailReceipt.posted_at;
                    const items = detailReceipt.items || [];
                    const { qty, sum, vat, total } = calcTotals(items, isVatPayer);
                    const itemCols = buildItemColumns(isVatPayer, isDraft);
                    const colSpanBase = isVatPayer ? 9 : 8;

                    return (
                        <>
                            {/* Header */}
                            {!editMode ? (
                                <Descriptions size="small" bordered
                                    column={{ xs: 1, sm: 2, md: 3 }}
                                    style={{ marginBottom: 12 }}>
                                    <Descriptions.Item label="Поставщик">
                                        <Text strong>{detailReceipt.provider_name || '—'}</Text>
                                        {isVatPayer && <Tag color="blue" style={{ marginLeft: 8 }}>Плательщик НДС</Tag>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Номер УПД">
                                        {detailReceipt.document_number || '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Дата документа">
                                        {detailReceipt.document_date
                                            ? dayjs(detailReceipt.document_date).format('DD.MM.YYYY')
                                            : '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="НДС">
                                        {isVatPayer ? <Tag color="blue">22%</Tag> : <Tag>Без НДС</Tag>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Создан">
                                        {dayjs(detailReceipt.created_at).format('DD.MM.YYYY HH:mm')}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Создал">
                                        {detailReceipt.created_by_email || '—'}
                                    </Descriptions.Item>
                                    {detailReceipt.comment && (
                                        <Descriptions.Item label="Комментарий" span={3}>
                                            {detailReceipt.comment}
                                        </Descriptions.Item>
                                    )}
                                </Descriptions>
                            ) : (
                                <Form form={headerForm} layout="vertical" style={{ marginBottom: 12 }}>
                                    <Row gutter={12}>
                                        <Col span={6}>
                                            <Form.Item name="document_number" label="Номер УПД">
                                                <Input placeholder="Номер документа" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={6}>
                                            <Form.Item name="document_date" label="Дата документа">
                                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="comment" label="Комментарий к документу">
                                                <TextArea rows={1} placeholder="Комментарий" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Form>
                            )}

                            {/* Items table */}
                            <Table
                                size="small"
                                dataSource={items.map((item, idx) => ({
                                    ...item,
                                    key: item.id ?? idx,
                                }))}
                                columns={itemCols}
                                pagination={false}
                                scroll={{ x: isVatPayer ? 1600 : 1400 }}
                                bordered
                                summary={() => {
                                    if (editMode) return null;
                                    return (
                                        <Table.Summary.Row style={{ fontWeight: 600 }}>
                                            <Table.Summary.Cell index={0} colSpan={4} align="right">
                                                Итого:
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={4} align="right">{qty}</Table.Summary.Cell>
                                            <Table.Summary.Cell index={5} />
                                            <Table.Summary.Cell index={6} align="right">{formatMoney(sum)}</Table.Summary.Cell>
                                            {isVatPayer && (
                                                <Table.Summary.Cell index={7} align="right">{formatMoney(vat)}</Table.Summary.Cell>
                                            )}
                                            <Table.Summary.Cell index={isVatPayer ? 8 : 7} align="right">
                                                {formatMoney(total)}
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={colSpanBase} colSpan={3} />
                                        </Table.Summary.Row>
                                    );
                                }}
                            />

                            {/* New items in edit mode */}
                            {editMode && newItems.length > 0 && (
                                <Table
                                    size="small"
                                    dataSource={newItems.map((r) => ({ ...r, key: r._key }))}
                                    columns={newItemColumns(isVatPayer)}
                                    pagination={false}
                                    scroll={{ x: isVatPayer ? 1600 : 1400 }}
                                    showHeader={false}
                                    bordered
                                    style={{ marginTop: 4 }}
                                />
                            )}

                            {/* Action buttons */}
                            <Row justify="space-between" align="middle" style={{ marginTop: 16 }}>
                                <Col>
                                    {editMode && (
                                        <Button icon={<PlusOutlined />} onClick={addNewItemRow}>
                                            Добавить строку
                                        </Button>
                                    )}
                                </Col>
                                <Col>
                                    <Space>
                                        {!editMode && isDraft && (
                                            <Button icon={<EditOutlined />} onClick={enterEditMode}>
                                                Редактировать
                                            </Button>
                                        )}
                                        {editMode && (
                                            <>
                                                <Button onClick={cancelEditMode} disabled={saving}>
                                                    Отмена
                                                </Button>
                                                <Button type="primary" icon={<SaveOutlined />}
                                                    onClick={handleSave} loading={saving}>
                                                    Сохранить
                                                </Button>
                                            </>
                                        )}
                                        {!editMode && (
                                            <Button icon={<PrinterOutlined />}
                                                onClick={() => setLabelVisible(true)}>
                                                Этикетки
                                            </Button>
                                        )}
                                        {!editMode && isDraft && (
                                            <Button type="primary"
                                                onClick={() => handlePost(detailReceipt.id)}
                                                loading={postingId === detailReceipt.id}>
                                                Провести
                                            </Button>
                                        )}
                                        {!editMode && !isDraft && (
                                            <Button
                                                onClick={() => handleUnpost(detailReceipt.id)}
                                                loading={unpostingId === detailReceipt.id}>
                                                Распровести
                                            </Button>
                                        )}
                                        {!editMode && isDraft && (
                                            <Popconfirm
                                                title="Удалить документ?"
                                                okText="Удалить" okButtonProps={{ danger: true }}
                                                cancelText="Отмена"
                                                onConfirm={() => {
                                                    setDetailVisible(false);
                                                    performDelete(detailReceipt.id);
                                                }}
                                            >
                                                <Button danger>Удалить</Button>
                                            </Popconfirm>
                                        )}
                                        <Button onClick={() => {
                                            setDetailVisible(false);
                                            cancelEditMode();
                                        }}>
                                            Закрыть
                                        </Button>
                                    </Space>
                                </Col>
                            </Row>
                        </>
                    );
                })()}
            </Modal>

            {/* ─── Label print modal ──────────────────────────────────────── */}
            <LabelModal
                open={labelVisible}
                receipt={detailReceipt}
                onClose={() => setLabelVisible(false)}
            />

            {/* ─── Create document modal ───────────────────────────────────── */}
            <Modal
                open={createVisible}
                onCancel={() => { setCreateVisible(false); setCreateItems([]); }}
                title="Создать документ поступления"
                footer={
                    <Space>
                        <Button onClick={() => setCreateVisible(false)} disabled={createSaving}>
                            Отмена
                        </Button>
                        <Button type="primary" onClick={handleCreateSubmit} loading={createSaving}
                            icon={<SaveOutlined />}>
                            Создать
                        </Button>
                    </Space>
                }
                width={900}
                destroyOnClose
            >
                <Form form={createForm} layout="vertical">
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item name="provider_id" label="Поставщик"
                                rules={[{ required: true, message: 'Выберите поставщика' }]}>
                                <Select showSearch placeholder="Выберите поставщика"
                                    options={providers.map((pr) => ({
                                        value: pr.id, label: pr.name,
                                    }))}
                                    filterOption={(input, opt) =>
                                        opt.label.toLowerCase().includes(input.toLowerCase())}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="document_number" label="Номер УПД">
                                <Input placeholder="Номер документа" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="document_date" label="Дата документа">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="comment" label="Комментарий">
                                <TextArea rows={2} placeholder="Комментарий к документу" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Text strong>Позиции:</Text>
                    {createItems.length > 0 && (
                        <Table
                            size="small"
                            dataSource={createItems.map((r) => ({ ...r, key: r._key }))}
                            pagination={false}
                            style={{ marginTop: 8 }}
                            scroll={{ x: 800 }}
                            columns={[
                                {
                                    title: 'Позиция', key: 'position', width: 260,
                                    render: (_, row) => (
                                        <ArticleSearchCell
                                            currentOem={row.oem_number}
                                            currentBrand={row.brand_name}
                                            currentName={row.autopart_name}
                                            onSelect={(part) => {
                                                updateCreateItem(row._key, 'autopart_id', part.id);
                                                updateCreateItem(row._key, 'oem_number', part.oem_number);
                                                updateCreateItem(row._key, 'brand_name', part.brand);
                                                updateCreateItem(row._key, 'autopart_name', part.name || '');
                                            }}
                                        />
                                    ),
                                },
                                {
                                    title: 'Кол-во', key: 'qty', width: 90,
                                    render: (_, row) => (
                                        <InputNumber size="small" min={0} value={row.received_quantity}
                                            onChange={(v) => updateCreateItem(row._key, 'received_quantity', v)}
                                            style={{ width: '100%' }} />
                                    ),
                                },
                                {
                                    title: 'Цена', key: 'price', width: 100,
                                    render: (_, row) => (
                                        <InputNumber size="small" min={0} value={row.price}
                                            onChange={(v) => updateCreateItem(row._key, 'price', v)}
                                            style={{ width: '100%' }} />
                                    ),
                                },
                                {
                                    title: 'Примечание', key: 'comment', width: 150,
                                    render: (_, row) => (
                                        <Input size="small" value={row.comment} placeholder="Примечание"
                                            onChange={(e) => updateCreateItem(row._key, 'comment', e.target.value)} />
                                    ),
                                },
                                {
                                    title: '', key: 'del', width: 40,
                                    render: (_, row) => (
                                        <Button size="small" type="text" danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => removeCreateItem(row._key)} />
                                    ),
                                },
                            ]}
                        />
                    )}
                    <Button
                        type="dashed"
                        block
                        icon={<PlusOutlined />}
                        onClick={addCreateItem}
                        style={{ marginTop: 8 }}
                    >
                        Добавить позицию
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default IncomingSupplierDocumentsPage;
