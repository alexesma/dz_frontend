import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Grid,
    Input,
    List,
    Modal,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CameraOutlined,
    CheckOutlined,
    ClearOutlined,
    PlusOutlined,
    ScanOutlined,
} from '@ant-design/icons';

import api from '../api';
import { getCustomersSummary } from '../api/customers';
import {
    getStockOrders,
    updateStockOrderItemPick,
} from '../api/customerOrders';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const getDefaultDateRange = () => {
    const today = dayjs();
    const start = today.day() === 1
        ? today.subtract(3, 'day').startOf('day')
        : today.subtract(1, 'day').startOf('day');
    return [start, today.endOf('day')];
};

const formatCreatedAt = (value) => {
    if (!value) return '—';
    const date = dayjs(value);
    if (!date.isValid()) return value;
    const now = dayjs();
    if (date.isSame(now, 'day')) {
        return `Сегодня ${date.format('HH:mm')}`;
    }
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
        return `Вчера ${date.format('HH:mm')}`;
    }
    return date.format('DD.MM.YY HH:mm');
};

const normalizeScanValue = (value) =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9]/g, '');

const getPickState = (pickedQuantity, quantity) => {
    const picked = Number(pickedQuantity || 0);
    const need = Number(quantity || 0);
    if (picked <= 0) return 'idle';
    if (picked >= need && need > 0) return 'complete';
    return 'partial';
};

const getPickStateLabel = (pickedQuantity, quantity) => {
    const state = getPickState(pickedQuantity, quantity);
    if (state === 'complete') return 'Собрано';
    if (state === 'partial') return 'Частично';
    return 'Не начато';
};

const BarcodeDetectorCtor =
    typeof window !== 'undefined' && 'BarcodeDetector' in window
        ? window.BarcodeDetector
        : null;

const StockOrdersPage = () => {
    const screens = useBreakpoint();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [scanSubmitting, setScanSubmitting] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [brands, setBrands] = useState([]);
    const [storages, setStorages] = useState([]);
    const [filters, setFilters] = useState({
        dateRange: getDefaultDateRange(),
        brandId: null,
        customerId: null,
        storageLocationId: null,
        pickState: 'all',
    });
    const [scanValue, setScanValue] = useState('');
    const [scanMatches, setScanMatches] = useState([]);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const detectorRef = useRef(null);
    const scanTimerRef = useRef(null);

    const cameraSupported = Boolean(
        BarcodeDetectorCtor &&
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices?.getUserMedia &&
        window.isSecureContext
    );

    const fetchMeta = useCallback(async () => {
        try {
            const [customersResp, brandsResp, storagesResp] = await Promise.all([
                getCustomersSummary({ page: 1, page_size: 200 }),
                api.get('/brand/'),
                api.get('/storage/'),
            ]);
            const customersData = customersResp.data?.items || customersResp.data || [];
            setCustomers(customersData);
            setBrands(brandsResp.data || []);
            setStorages(storagesResp.data || []);
        } catch (err) {
            console.error('Failed to load stock filters data', err);
            message.error('Не удалось загрузить справочники для склада');
        }
    }, []);

    useEffect(() => {
        fetchMeta();
    }, [fetchMeta]);

    const brandMap = useMemo(() => {
        const map = {};
        brands.forEach((brand) => {
            map[brand.id] = brand.name;
        });
        return map;
    }, [brands]);

    const customerMap = useMemo(() => {
        const map = {};
        customers.forEach((customer) => {
            map[customer.id] = customer.name;
        });
        return map;
    }, [customers]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.customerId) params.customer_id = filters.customerId;
            if (filters.brandId) params.brand_id = filters.brandId;
            if (filters.storageLocationId) params.storage_location_id = filters.storageLocationId;
            if (filters.dateRange && filters.dateRange.length === 2) {
                params.date_from = filters.dateRange[0].format('YYYY-MM-DD');
                params.date_to = filters.dateRange[1].format('YYYY-MM-DD');
            }
            const resp = await getStockOrders(params);
            setOrders(resp.data || []);
        } catch (err) {
            console.error('Failed to fetch stock orders', err);
            message.error('Не удалось загрузить складские заказы');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const updateLocalPick = useCallback((payload) => {
        setOrders((prev) => prev.map((order) => {
            if (order.id !== payload.stock_order_id) {
                return order;
            }
            return {
                ...order,
                status: payload.stock_order_status,
                items: (order.items || []).map((item) => (
                    item.id === payload.id
                        ? {
                            ...item,
                            picked_quantity: payload.picked_quantity,
                            picked_at: payload.picked_at,
                            picked_by_user_id: payload.picked_by_user_id,
                            picked_by_email: payload.picked_by_email,
                            pick_comment: payload.pick_comment,
                            pick_last_scan_code: payload.pick_last_scan_code,
                        }
                        : item
                )),
            };
        }));
    }, []);

    const dataSource = useMemo(() => {
        const rows = [];
        orders.forEach((order) => {
            (order.items || []).forEach((item) => {
                const storageLocations = item.autopart?.storage_locations || [];
                const row = {
                    key: `${order.id}-${item.id}`,
                    orderId: order.id,
                    stockOrderStatus: order.status,
                    customerId: order.customer_id,
                    customerName: order.customer_name || customerMap[order.customer_id] || '—',
                    createdAt: order.created_at,
                    quantity: item.quantity,
                    pickedQuantity: Number(item.picked_quantity || 0),
                    pickedAt: item.picked_at,
                    pickedByEmail: item.picked_by_email,
                    pickComment: item.pick_comment,
                    barcode: item.autopart?.barcode || '',
                    itemId: item.id,
                    oem: item.autopart?.oem_number || '',
                    brandId: item.autopart?.brand_id || null,
                    name: item.autopart?.name || '',
                    storageLocations,
                    storageText: storageLocations.join(', '),
                };
                row.pickState = getPickState(row.pickedQuantity, row.quantity);
                row.remainingQuantity = Math.max(row.quantity - row.pickedQuantity, 0);
                rows.push(row);
            });
        });
        return rows.filter((row) => {
            if (filters.pickState === 'all') return true;
            return row.pickState === filters.pickState;
        });
    }, [orders, customerMap, filters.pickState]);

    const handlePickUpdate = useCallback(async (row, payload, successMessage = null) => {
        try {
            const response = await updateStockOrderItemPick(row.itemId, payload);
            updateLocalPick(response.data);
            if (successMessage) {
                message.success(successMessage);
            }
            return response.data;
        } catch (err) {
            console.error('Failed to update picked quantity', err);
            message.error(err?.response?.data?.detail || 'Не удалось обновить сборку');
            return null;
        }
    }, [updateLocalPick]);

    const processScanCode = useCallback(async (rawCode, forcedRow = null) => {
        const normalized = normalizeScanValue(rawCode);
        if (!normalized) {
            return;
        }
        const matches = forcedRow
            ? [forcedRow]
            : dataSource.filter((row) => {
                const barcode = normalizeScanValue(row.barcode);
                const oem = normalizeScanValue(row.oem);
                return normalized === barcode || normalized === oem;
            });
        if (!matches.length) {
            message.warning(`Код ${rawCode} не найден среди открытых складских заказов`);
            return;
        }
        if (matches.length > 1 && !forcedRow) {
            setScanMatches(matches);
            return;
        }
        setScanSubmitting(true);
        try {
            const target = matches[0];
            await handlePickUpdate(
                target,
                {
                    increment: 1,
                    scan_code: rawCode,
                },
                `${target.oem || target.name}: +1`
            );
            setScanMatches([]);
            setScanValue('');
        } finally {
            setScanSubmitting(false);
        }
    }, [dataSource, handlePickUpdate]);

    const handleScanSubmit = async () => {
        await processScanCode(scanValue);
    };

    const stopCamera = useCallback(() => {
        if (scanTimerRef.current) {
            window.clearInterval(scanTimerRef.current);
            scanTimerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    useEffect(() => () => {
        stopCamera();
    }, [stopCamera]);

    const startCamera = async () => {
        if (!cameraSupported) {
            message.warning('Камера для сканирования доступна после HTTPS и в поддерживаемом браузере');
            return;
        }
        setCameraError('');
        setCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            detectorRef.current = new BarcodeDetectorCtor({
                formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
            });
            scanTimerRef.current = window.setInterval(async () => {
                if (!videoRef.current || !detectorRef.current) return;
                try {
                    const barcodes = await detectorRef.current.detect(videoRef.current);
                    if (!barcodes?.length) return;
                    const detected = barcodes[0]?.rawValue;
                    if (!detected) return;
                    stopCamera();
                    setCameraOpen(false);
                    await processScanCode(detected);
                } catch (err) {
                    console.error('Camera barcode detect failed', err);
                }
            }, 700);
        } catch (err) {
            console.error('Failed to start camera', err);
            setCameraError('Не удалось открыть камеру. Проверьте разрешения браузера.');
        }
    };

    const pickStateOptions = [
        { label: 'Все', value: 'all' },
        { label: 'Не начато', value: 'idle' },
        { label: 'Частично', value: 'partial' },
        { label: 'Собрано', value: 'complete' },
    ];

    const renderActionButtons = (row) => (
        <Space size={4} wrap>
            <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handlePickUpdate(row, { increment: 1 })}
            />
            <Button
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handlePickUpdate(row, { picked_quantity: row.quantity })}
            >
                Всё
            </Button>
            <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={() => handlePickUpdate(row, { picked_quantity: 0 })}
            />
        </Space>
    );

    const columns = [
        {
            title: 'Заказ',
            dataIndex: 'orderId',
            key: 'orderId',
            width: 76,
        },
        {
            title: 'Клиент',
            dataIndex: 'customerName',
            key: 'customerName',
            width: 160,
            ellipsis: true,
        },
        {
            title: 'OEM',
            dataIndex: 'oem',
            key: 'oem',
            width: 140,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brandId',
            key: 'brandId',
            width: 110,
            ellipsis: true,
            render: (value) => brandMap[value] || value || '—',
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 210,
            ellipsis: true,
        },
        {
            title: 'ШК / код',
            dataIndex: 'barcode',
            key: 'barcode',
            width: 180,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Место',
            dataIndex: 'storageText',
            key: 'storageText',
            width: 160,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Нужно',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 74,
            align: 'right',
        },
        {
            title: 'Собрано',
            dataIndex: 'pickedQuantity',
            key: 'pickedQuantity',
            width: 88,
            align: 'right',
        },
        {
            title: 'Осталось',
            dataIndex: 'remainingQuantity',
            key: 'remainingQuantity',
            width: 88,
            align: 'right',
        },
        {
            title: 'Состояние',
            dataIndex: 'pickState',
            key: 'pickState',
            width: 118,
            render: (_, row) => {
                const state = getPickState(row.pickedQuantity, row.quantity);
                const color =
                    state === 'complete'
                        ? 'green'
                        : state === 'partial'
                            ? 'gold'
                            : 'default';
                return <Tag color={color}>{getPickStateLabel(row.pickedQuantity, row.quantity)}</Tag>;
            },
        },
        {
            title: 'Собрал',
            dataIndex: 'pickedByEmail',
            key: 'pickedByEmail',
            width: 160,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Создан',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 138,
            render: formatCreatedAt,
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 156,
            fixed: 'right',
            render: (_, row) => renderActionButtons(row),
        },
    ];

    const rowClassName = (record) => {
        if (record.pickState === 'complete') return 'stock-pick-row-complete';
        if (record.pickState === 'partial') return 'stock-pick-row-partial';
        return 'stock-pick-row-idle';
    };

    return (
        <div className="page-shell">
            <Card>
                <Title level={3}>Заказы с нашего склада</Title>
                <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <RangePicker
                            style={{ width: '100%' }}
                            value={filters.dateRange}
                            onChange={(value) => setFilters((prev) => ({
                                ...prev,
                                dateRange: value || getDefaultDateRange(),
                            }))}
                            format="DD.MM.YY"
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select
                            allowClear
                            placeholder="Клиент"
                            style={{ width: '100%' }}
                            value={filters.customerId}
                            onChange={(value) => setFilters((prev) => ({ ...prev, customerId: value }))}
                            options={customers.map((c) => ({ label: c.name, value: c.id }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select
                            allowClear
                            placeholder="Бренд"
                            style={{ width: '100%' }}
                            value={filters.brandId}
                            onChange={(value) => setFilters((prev) => ({ ...prev, brandId: value }))}
                            options={brands.map((b) => ({ label: b.name, value: b.id }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select
                            allowClear
                            placeholder="Место хранения"
                            style={{ width: '100%' }}
                            value={filters.storageLocationId}
                            onChange={(value) => setFilters((prev) => ({ ...prev, storageLocationId: value }))}
                            options={storages.map((s) => ({ label: s.name, value: s.id }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select
                            style={{ width: '100%' }}
                            value={filters.pickState}
                            onChange={(value) => setFilters((prev) => ({ ...prev, pickState: value }))}
                            options={pickStateOptions}
                        />
                    </Col>
                </Row>

                <Card size="small" className="stock-scan-panel" style={{ marginBottom: 16 }}>
                    <Space wrap style={{ width: '100%' }}>
                        <Input
                            value={scanValue}
                            onChange={(event) => setScanValue(event.target.value)}
                            onPressEnter={handleScanSubmit}
                            prefix={<ScanOutlined />}
                            placeholder="Сканируйте штрих-код или OEM"
                            style={{ minWidth: screens.md ? 360 : '100%' }}
                            disabled={loading || scanSubmitting}
                        />
                        <Button
                            type="primary"
                            icon={<ScanOutlined />}
                            onClick={handleScanSubmit}
                            loading={scanSubmitting}
                        >
                            Отметить
                        </Button>
                        <Button
                            icon={<CameraOutlined />}
                            onClick={startCamera}
                            disabled={!cameraSupported}
                        >
                            Камера
                        </Button>
                        {!cameraSupported && (
                            <Text type="secondary">
                                Камера станет доступна после HTTPS в поддерживаемом браузере.
                            </Text>
                        )}
                    </Space>
                </Card>

                {loading ? (
                    <Spin />
                ) : !dataSource.length ? (
                    <Empty description="Нет строк для сборки по выбранным фильтрам" />
                ) : screens.md ? (
                    <Table
                        dataSource={dataSource}
                        columns={columns}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        size="small"
                        rowClassName={rowClassName}
                        scroll={{ x: 1600 }}
                    />
                ) : (
                    <List
                        dataSource={dataSource}
                        renderItem={(row) => (
                            <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
                                <Card
                                    size="small"
                                    className={`stock-mobile-card stock-mobile-card-${row.pickState}`}
                                    style={{ width: '100%' }}
                                >
                                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                        <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
                                            <div>
                                                <Text strong>{row.oem || '—'}</Text>
                                                <br />
                                                <Text type="secondary">{brandMap[row.brandId] || '—'}</Text>
                                            </div>
                                            <Tag color={
                                                row.pickState === 'complete'
                                                    ? 'green'
                                                    : row.pickState === 'partial'
                                                        ? 'gold'
                                                        : 'default'
                                            }>
                                                {getPickStateLabel(row.pickedQuantity, row.quantity)}
                                            </Tag>
                                        </Space>
                                        <Text>{row.name || '—'}</Text>
                                        <Text type="secondary">
                                            Клиент: {row.customerName} · Заказ #{row.orderId}
                                        </Text>
                                        <Text type="secondary">
                                            Место: {row.storageText || '—'}
                                        </Text>
                                        <Text type="secondary">
                                            Нужно {row.quantity} · Собрано {row.pickedQuantity} · Осталось {row.remainingQuantity}
                                        </Text>
                                        {row.barcode && (
                                            <Text type="secondary">ШК: {row.barcode}</Text>
                                        )}
                                        {renderActionButtons(row)}
                                    </Space>
                                </Card>
                            </List.Item>
                        )}
                    />
                )}
            </Card>

            <Modal
                open={scanMatches.length > 1}
                footer={null}
                onCancel={() => setScanMatches([])}
                title="Найдено несколько строк"
            >
                <List
                    dataSource={scanMatches}
                    renderItem={(row) => (
                        <List.Item
                            actions={[
                                <Button
                                    key="choose"
                                    type="link"
                                    onClick={async () => {
                                        setScanMatches([]);
                                        await processScanCode(scanValue, row);
                                    }}
                                >
                                    Выбрать
                                </Button>,
                            ]}
                        >
                            <List.Item.Meta
                                title={`${row.oem || '—'} · ${brandMap[row.brandId] || '—'}`}
                                description={(
                                    <>
                                        <div>{row.name || '—'}</div>
                                        <div>Клиент: {row.customerName}</div>
                                        <div>Нужно {row.quantity}, собрано {row.pickedQuantity}</div>
                                    </>
                                )}
                            />
                        </List.Item>
                    )}
                />
            </Modal>

            <Modal
                open={cameraOpen}
                footer={null}
                onCancel={() => {
                    stopCamera();
                    setCameraOpen(false);
                }}
                title="Сканирование камерой"
                width={screens.md ? 720 : '100%'}
            >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {cameraError ? (
                        <Text type="danger">{cameraError}</Text>
                    ) : (
                        <Text type="secondary">
                            Наведите камеру на штрих-код. После распознавания строка будет отмечена автоматически.
                        </Text>
                    )}
                    <video
                        ref={videoRef}
                        style={{
                            width: '100%',
                            minHeight: screens.md ? 360 : 240,
                            background: '#000',
                            borderRadius: 8,
                        }}
                        muted
                        playsInline
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default StockOrdersPage;
