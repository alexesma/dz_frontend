import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Collapse,
    Descriptions,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
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
    AuditOutlined,
    BarcodeOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlusOutlined,
    PrinterOutlined,
    RetweetOutlined,
    SearchOutlined,
    ScanOutlined,
} from '@ant-design/icons';
import Barcode from 'react-barcode';
import dayjs from 'dayjs';

import {
    createStorageLocation,
    deleteStorageLocation,
    getStorageAutoparts,
    getStorageLocations,
    updateStorageLocation,
} from '../api/storage';
import {
    deleteStockByLocation,
    listStockMovements,
    transferAutopart,
    upsertStockByLocation,
} from '../api/inventory';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCATION_TYPES = {
    shelf:  { label: 'Стеллаж', color: 'blue' },
    pallet: { label: 'Паллет',  color: 'orange' },
    bin:    { label: 'Ящик',    color: 'purple' },
    floor:  { label: 'Пол',     color: 'default' },
    other:  { label: 'Прочее',  color: 'default' },
};

const MOVEMENT_LABELS = {
    receipt:      { label: 'Приход',       color: 'green' },
    shipment:     { label: 'Отгрузка',     color: 'red' },
    transfer_in:  { label: 'Перемещение ←', color: 'blue' },
    transfer_out: { label: 'Перемещение →', color: 'orange' },
    inventory:    { label: 'Инвентаризация', color: 'purple' },
    manual:       { label: 'Ручная правка', color: 'default' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByShelf(locations) {
    const shelves = {};
    for (const loc of locations) {
        const prefix = loc.name.slice(0, 2);
        if (!shelves[prefix]) shelves[prefix] = [];
        shelves[prefix].push(loc);
    }
    return shelves;
}

// ── Label print (58×40 mm) ────────────────────────────────────────────────────

function LabelPrintPreview({ locationName, onClose }) {
    const barcodeRef = useRef(null);

    const handlePrint = () => {
        const style = `
            @page { size: 58mm 40mm; margin: 0; }
            body  { margin: 0; font-family: monospace; }
            .label { width: 58mm; height: 40mm; display: flex; flex-direction: column;
                     align-items: center; justify-content: center; }
            .label-name { font-size: 20pt; font-weight: bold; letter-spacing: 3px; margin-bottom: 2mm; }
        `;
        const win = window.open('', '_blank', 'width=420,height=320');
        win.document.write(`
            <html><head><title>Label</title><style>${style}</style></head>
            <body>
              <div class="label">
                <div class="label-name">${locationName}</div>
                <div>${barcodeRef.current?.innerHTML || ''}</div>
              </div>
            </body></html>
        `);
        win.document.close();
        win.focus();
        win.print();
        win.close();
    };

    return (
        <div style={{ textAlign: 'center' }}>
            <div
                style={{
                    width: 220, height: 150, border: '1px dashed #aaa', borderRadius: 4,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 16px', background: '#fff',
                }}
            >
                <Text strong style={{ fontSize: 22, letterSpacing: 4 }}>{locationName}</Text>
                <div ref={barcodeRef} style={{ marginTop: 4 }}>
                    <Barcode value={locationName} format="CODE128" width={1.4} height={42} fontSize={10} margin={0} />
                </div>
            </div>
            <Space>
                <Button icon={<PrinterOutlined />} type="primary" onClick={handlePrint}>
                    Печать
                </Button>
                <Button onClick={onClose}>Закрыть</Button>
            </Space>
        </div>
    );
}

// ── Movements history drawer ──────────────────────────────────────────────────

function MovementsDrawer({ locationId, locationName, open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [movements, setMovements] = useState([]);

    useEffect(() => {
        if (!open || !locationId) return;
        setLoading(true);
        listStockMovements({ storage_location_id: locationId, limit: 200 })
            .then((r) => setMovements(r.data))
            .catch(() => message.error('Ошибка загрузки'))
            .finally(() => setLoading(false));
    }, [open, locationId]);

    const cols = [
        {
            title: 'Дата',
            dataIndex: 'created_at',
            key: 'date',
            width: 140,
            render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
        },
        {
            title: 'Тип',
            dataIndex: 'movement_type',
            key: 'type',
            width: 140,
            render: (v) => {
                const m = MOVEMENT_LABELS[v] || { label: v, color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
            },
        },
        { title: 'Артикул', dataIndex: 'autopart_oem', key: 'oem', width: 120 },
        { title: 'Наименование', dataIndex: 'autopart_name', key: 'name', ellipsis: true },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'qty',
            width: 80,
            align: 'center',
            render: (v) => (
                <Tag color={v > 0 ? 'green' : 'red'}>
                    {v > 0 ? `+${v}` : v}
                </Tag>
            ),
        },
        {
            title: 'До → После',
            key: 'delta',
            width: 110,
            render: (_, r) =>
                r.qty_before !== null
                    ? `${r.qty_before} → ${r.qty_after}`
                    : '—',
        },
        { title: 'Примечание', dataIndex: 'notes', key: 'notes', ellipsis: true },
    ];

    return (
        <Drawer
            title={`История движений: «${locationName}»`}
            open={open}
            onClose={onClose}
            width={900}
        >
            {loading ? (
                <Spin />
            ) : (
                <Table
                    rowKey="id"
                    columns={cols}
                    dataSource={movements}
                    size="small"
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    locale={{ emptyText: 'Движений нет' }}
                />
            )}
        </Drawer>
    );
}

// ── Transfer modal ────────────────────────────────────────────────────────────

function TransferModal({ autopart, fromLocation, allLocations, open, onClose, onTransferred }) {
    const [destId, setDestId] = useState(null);
    const [qty, setQty] = useState(1);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const maxQty = autopart?.stock_quantity ?? 1;

    useEffect(() => {
        if (open) { setDestId(null); setQty(Math.min(1, maxQty)); setNotes(''); }
    }, [open, maxQty]);

    const handleOk = async () => {
        if (!destId) { message.warning('Выберите место назначения'); return; }
        if (!qty || qty <= 0) { message.warning('Укажите количество'); return; }
        setSaving(true);
        try {
            await transferAutopart({
                autopart_id: autopart.autopart_id,
                from_location_id: fromLocation.id,
                to_location_id: destId,
                quantity: qty,
                notes: notes || null,
            });
            message.success(`Перемещено ${qty} шт.`);
            onTransferred();
            onClose();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка перемещения');
        } finally {
            setSaving(false);
        }
    };

    const availableLocations = allLocations.filter((l) => l.id !== fromLocation?.id);

    return (
        <Modal
            open={open}
            title="Переместить товар"
            onOk={handleOk}
            onCancel={onClose}
            confirmLoading={saving}
            okText="Переместить"
            cancelText="Отмена"
            destroyOnClose
        >
            {autopart && (
                <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="Артикул">{autopart.oem_number}</Descriptions.Item>
                    <Descriptions.Item label="Наименование">{autopart.name}</Descriptions.Item>
                    <Descriptions.Item label="Из места">
                        <Tag>{fromLocation?.name}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Доступно">
                        <Tag color="blue">{maxQty} шт.</Tag>
                    </Descriptions.Item>
                </Descriptions>
            )}
            <Form layout="vertical">
                <Form.Item label="Количество" required>
                    <InputNumber
                        min={1}
                        max={maxQty}
                        value={qty}
                        onChange={setQty}
                        style={{ width: '100%' }}
                        addonAfter="шт."
                    />
                </Form.Item>
                <Form.Item label="Место назначения" required>
                    <Select
                        placeholder="Выберите место"
                        value={destId}
                        onChange={setDestId}
                        showSearch
                        optionFilterProp="children"
                        style={{ width: '100%' }}
                    >
                        {availableLocations.map((l) => (
                            <Option key={l.id} value={l.id}>
                                {l.name}
                                {l.capacity != null ? ` (≤${l.capacity} SKU)` : ''}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item label="Примечание">
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
                </Form.Item>
            </Form>
        </Modal>
    );
}

// ── AutoParts drawer (what is in a location) ──────────────────────────────────

function LocationAutopartsDrawer({ location, allLocations, open, onClose, onChanged }) {
    const [loading, setLoading] = useState(false);
    const [autoparts, setAutoparts] = useState([]);
    const [transferTarget, setTransferTarget] = useState(null);
    // inline edit state: { [sbl_id]: newQty }
    const [editQty, setEditQty] = useState({});
    const [savingQty, setSavingQty] = useState({});

    const load = useCallback(async () => {
        if (!location?.id) return;
        setLoading(true);
        try {
            const r = await getStorageAutoparts(location.id);
            setAutoparts(r.data);
            setEditQty({});
        } catch {
            message.error('Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    }, [location?.id]);

    useEffect(() => { if (open) load(); }, [open, load]);

    const saveQty = async (record) => {
        const newQty = editQty[record.sbl_id];
        if (newQty === undefined || newQty === null) return;
        setSavingQty((s) => ({ ...s, [record.sbl_id]: true }));
        try {
            await upsertStockByLocation({
                autopart_id: record.autopart_id,
                storage_location_id: location.id,
                quantity: newQty,
            });
            message.success('Остаток обновлён');
            setEditQty((s) => { const n = { ...s }; delete n[record.sbl_id]; return n; });
            await load();
            onChanged?.();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка');
        } finally {
            setSavingQty((s) => ({ ...s, [record.sbl_id]: false }));
        }
    };

    const removeRecord = async (record) => {
        try {
            await deleteStockByLocation(record.sbl_id, true);
            message.success('Запись удалена');
            await load();
            onChanged?.();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка удаления');
        }
    };

    const cols = [
        { title: 'Артикул', dataIndex: 'oem_number', key: 'oem', width: 120 },
        { title: 'Бренд', dataIndex: 'brand_name', key: 'brand', width: 90 },
        { title: 'Наименование', dataIndex: 'name', key: 'name', ellipsis: true },
        {
            title: 'Кол-во',
            key: 'qty',
            width: 140,
            align: 'center',
            render: (_, record) => {
                const editing = record.sbl_id in editQty;
                return (
                    <Space.Compact>
                        <InputNumber
                            min={0}
                            size="small"
                            value={editing ? editQty[record.sbl_id] : record.stock_quantity}
                            onChange={(v) =>
                                setEditQty((s) => ({ ...s, [record.sbl_id]: v }))
                            }
                            onPressEnter={() => saveQty(record)}
                            style={{ width: 70 }}
                        />
                        {editing && (
                            <Button
                                size="small"
                                type="primary"
                                loading={savingQty[record.sbl_id]}
                                icon={<CheckCircleOutlined />}
                                onClick={() => saveQty(record)}
                            />
                        )}
                    </Space.Compact>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 130,
            render: (_, record) => (
                <Space size={4}>
                    <Button
                        size="small"
                        icon={<RetweetOutlined />}
                        onClick={() => setTransferTarget(record)}
                        disabled={record.stock_quantity === 0}
                    >
                        Переместить
                    </Button>
                    <Popconfirm
                        title="Убрать из ячейки?"
                        description="Запись о количестве будет удалена."
                        onConfirm={() => removeRecord(record)}
                        okText="Удалить"
                        cancelText="Нет"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer
                title={`Запчасти в «${location?.name}»`}
                open={open}
                onClose={onClose}
                width={700}
                extra={
                    location?.capacity != null && (
                        <Text type="secondary">
                            {autoparts.length} / {location.capacity} SKU
                        </Text>
                    )
                }
            >
                {loading ? (
                    <Spin />
                ) : (
                    <>
                        {location?.capacity != null && (
                            <Progress
                                percent={Math.min(
                                    100,
                                    Math.round((autoparts.length / location.capacity) * 100)
                                )}
                                status={autoparts.length >= location.capacity ? 'exception' : 'normal'}
                                format={() => `${autoparts.length}/${location.capacity}`}
                                style={{ marginBottom: 12 }}
                            />
                        )}
                        <Table
                            rowKey="autopart_id"
                            columns={cols}
                            dataSource={autoparts}
                            size="small"
                            pagination={false}
                            locale={{ emptyText: 'Нет запчастей' }}
                        />
                    </>
                )}
            </Drawer>

            <TransferModal
                open={!!transferTarget}
                autopart={transferTarget}
                fromLocation={location}
                allLocations={allLocations}
                onClose={() => setTransferTarget(null)}
                onTransferred={() => {
                    setTransferTarget(null);
                    load();
                    onChanged?.();
                }}
            />
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StorageLocationsPage() {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [scanInput, setScanInput] = useState('');
    const scanRef = useRef(null);

    // Form modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    // Subsidiary drawers/modals
    const [labelLocation, setLabelLocation] = useState(null);
    const [viewLocation, setViewLocation] = useState(null);
    const [historyLocation, setHistoryLocation] = useState(null);

    const fetchLocations = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getStorageLocations(0, 500);
            setLocations(res.data);
        } catch {
            message.error('Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLocations(); }, [fetchLocations]);

    // ── Barcode scanner: fast keyboard → Enter ────────────────────────────────
    const handleScan = (e) => {
        if (e.key === 'Enter' && scanInput.trim()) {
            const code = scanInput.trim().toUpperCase();
            setScanInput('');
            setSearch(code);
            // Auto-open if exact match
            const match = locations.find((l) => l.name === code);
            if (match) setViewLocation(match);
        }
    };

    // ── filter & group ────────────────────────────────────────────────────────
    const filtered = locations.filter((l) =>
        l.name.toUpperCase().includes(search.toUpperCase())
    );
    const shelves = groupByShelf(filtered);
    const shelfKeys = Object.keys(shelves).sort();

    // ── CRUD ──────────────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditingLocation(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (loc) => {
        setEditingLocation(loc);
        form.setFieldsValue({
            name: loc.name,
            location_type: loc.location_type ?? undefined,
            capacity: loc.capacity ?? undefined,
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        let values;
        try { values = await form.validateFields(); } catch { return; }
        setSaving(true);
        try {
            const payload = {
                name: values.name,
                location_type: values.location_type || null,
                capacity: values.capacity || null,
            };
            if (editingLocation) {
                await updateStorageLocation(editingLocation.id, payload);
                message.success('Обновлено');
            } else {
                await createStorageLocation(payload);
                message.success('Создано');
            }
            setModalOpen(false);
            await fetchLocations();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (loc) => {
        try {
            await deleteStorageLocation(loc.id);
            message.success(`«${loc.name}» удалено`);
            await fetchLocations();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Ошибка удаления');
        }
    };

    // ── Table columns ─────────────────────────────────────────────────────────
    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (name) => <Text strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{name}</Text>,
        },
        {
            title: 'Тип',
            dataIndex: 'location_type',
            key: 'type',
            width: 110,
            render: (v) => {
                if (!v) return null;
                const t = LOCATION_TYPES[v] || { label: v, color: 'default' };
                return <Tag color={t.color}>{t.label}</Tag>;
            },
        },
        {
            title: 'Вместимость',
            key: 'capacity',
            width: 160,
            render: (_, record) => {
                const cnt = record.autoparts?.length ?? 0;
                const cap = record.capacity;
                if (!cap) return <Text type="secondary">{cnt} SKU</Text>;
                const pct = Math.min(100, Math.round((cnt / cap) * 100));
                return (
                    <Tooltip title={`${cnt} / ${cap} SKU`}>
                        <Progress
                            percent={pct}
                            size="small"
                            status={cnt >= cap ? 'exception' : 'normal'}
                            format={() => `${cnt}/${cap}`}
                            style={{ width: 110 }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 230,
            render: (_, record) => (
                <Space size={4}>
                    <Tooltip title="Запчасти">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewLocation(record)} />
                    </Tooltip>
                    <Tooltip title="История движений">
                        <Button size="small" icon={<AuditOutlined />} onClick={() => setHistoryLocation(record)} />
                    </Tooltip>
                    <Tooltip title="Этикетка">
                        <Button size="small" icon={<BarcodeOutlined />} onClick={() => setLabelLocation(record)} />
                    </Tooltip>
                    <Tooltip title="Редактировать">
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                    </Tooltip>
                    <Popconfirm
                        title={`Удалить «${record.name}»?`}
                        description="Невозможно, если в месте есть запчасти."
                        onConfirm={() => handleDelete(record)}
                        okText="Удалить"
                        cancelText="Нет"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Удалить">
                            <Button size="small" icon={<DeleteOutlined />} danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={3} style={{ margin: 0 }}>Места хранения</Title>
                </Col>
                <Col>
                    <Space>
                        {/* Barcode scanner input — receives fast keyboard input from gun scanner */}
                        <Tooltip title="Сканируйте штрихкод места или введите код вручную и нажмите Enter">
                            <Input
                                ref={scanRef}
                                prefix={<ScanOutlined />}
                                placeholder="Сканировать место…"
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                                onKeyDown={handleScan}
                                allowClear
                                style={{ width: 200, fontFamily: 'monospace' }}
                            />
                        </Tooltip>
                        <Input
                            prefix={<SearchOutlined />}
                            placeholder="Поиск…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            allowClear
                            style={{ width: 180 }}
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Добавить место
                        </Button>
                    </Space>
                </Col>
            </Row>

            {loading ? (
                <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
            ) : shelfKeys.length === 0 ? (
                <Alert message="Места хранения не найдены" type="info" showIcon />
            ) : (
                <Collapse defaultActiveKey={shelfKeys.slice(0, 5)}>
                    {shelfKeys.map((shelf) => {
                        const locs = shelves[shelf];
                        const totalCap = locs.reduce((s, l) => s + (l.capacity ?? 0), 0);
                        const totalUsed = locs.reduce((s, l) => s + (l.autoparts?.length ?? 0), 0);
                        return (
                            <Panel
                                key={shelf}
                                header={
                                    <Space>
                                        <Text strong>Стеллаж {shelf}</Text>
                                        <Tag>{locs.length} ячеек</Tag>
                                        {totalCap > 0 && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {totalUsed}/{totalCap} SKU
                                            </Text>
                                        )}
                                    </Space>
                                }
                            >
                                <Table
                                    rowKey="id"
                                    columns={columns}
                                    dataSource={locs}
                                    size="small"
                                    pagination={false}
                                    showHeader={locs.length > 1}
                                />
                            </Panel>
                        );
                    })}
                </Collapse>
            )}

            {/* ── Create / Edit modal ──────────────────────────────────────── */}
            <Modal
                open={modalOpen}
                title={editingLocation ? `Редактировать «${editingLocation.name}»` : 'Новое место хранения'}
                onOk={handleSave}
                onCancel={() => setModalOpen(false)}
                confirmLoading={saving}
                okText="Сохранить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Название / код ячейки"
                        rules={[
                            { required: true, message: 'Введите название' },
                            { pattern: /^[A-Z0-9 /]+$/, message: 'Заглавные буквы, цифры, пробел или /' },
                            { min: 3, message: 'Минимум 3 символа' },
                        ]}
                        extra="Например: AA01. Название используется как штрихкод."
                    >
                        <Input
                            placeholder="AA01"
                            style={{ fontFamily: 'monospace', fontSize: 18, textTransform: 'uppercase' }}
                            onChange={(e) => form.setFieldValue('name', e.target.value.toUpperCase())}
                        />
                    </Form.Item>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="location_type" label="Тип места">
                                <Select placeholder="Не указан" allowClear>
                                    {Object.entries(LOCATION_TYPES).map(([k, v]) => (
                                        <Option key={k} value={k}>{v.label}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="capacity"
                                label="Вместимость (SKU)"
                                extra="Макс. видов товара. Пусто = без ограничений."
                            >
                                <InputNumber min={1} style={{ width: '100%' }} placeholder="∞" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* ── Label modal ──────────────────────────────────────────────── */}
            <Modal
                open={!!labelLocation}
                title={`Этикетка: ${labelLocation?.name}`}
                footer={null}
                onCancel={() => setLabelLocation(null)}
                width={320}
                destroyOnClose
            >
                {labelLocation && (
                    <LabelPrintPreview
                        locationName={labelLocation.name}
                        onClose={() => setLabelLocation(null)}
                    />
                )}
            </Modal>

            {/* ── Autoparts drawer ─────────────────────────────────────────── */}
            <LocationAutopartsDrawer
                location={viewLocation}
                allLocations={locations}
                open={!!viewLocation}
                onClose={() => setViewLocation(null)}
                onChanged={fetchLocations}
            />

            {/* ── Movements history drawer ──────────────────────────────────── */}
            <MovementsDrawer
                locationId={historyLocation?.id}
                locationName={historyLocation?.name ?? ''}
                open={!!historyLocation}
                onClose={() => setHistoryLocation(null)}
            />
        </div>
    );
}
