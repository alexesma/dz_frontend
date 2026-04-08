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
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    BulbOutlined,
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
const AudioContextCtor =
    typeof window !== 'undefined'
        ? window.AudioContext || window.webkitAudioContext
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
    const [cameraEngine, setCameraEngine] = useState('');
    const [lastScannedCode, setLastScannedCode] = useState('');
    const [torchSupported, setTorchSupported] = useState(false);
    const [torchEnabled, setTorchEnabled] = useState(false);
    const [activeItemId, setActiveItemId] = useState(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const detectorRef = useRef(null);
    const scanTimerRef = useRef(null);
    const scannerControlsRef = useRef(null);
    const cameraCaptureLockRef = useRef(false);
    const cameraDetectBusyRef = useRef(false);
    const scanSourceRef = useRef('manual');
    const zxingReaderCtorRef = useRef(null);
    const zxingHintsRef = useRef(null);
    const audioContextRef = useRef(null);
    const lastScanOverlayTimerRef = useRef(null);

    const cameraApiSupported = Boolean(
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices?.getUserMedia
    );
    const secureCameraContext = typeof window !== 'undefined'
        ? window.isSecureContext
        : false;

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

    const playScanSuccessFeedback = useCallback(async () => {
        try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(70);
            }
            if (!AudioContextCtor) {
                return;
            }
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContextCtor();
            }
            const audioContext = audioContextRef.current;
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(
                1046,
                audioContext.currentTime,
            );
            gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                0.05,
                audioContext.currentTime + 0.01,
            );
            gainNode.gain.exponentialRampToValueAtTime(
                0.0001,
                audioContext.currentTime + 0.12,
            );
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.12);
        } catch (err) {
            console.debug('Scan success feedback unavailable', err);
        }
    }, []);

    const clearLastScanOverlay = useCallback(() => {
        if (lastScanOverlayTimerRef.current) {
            window.clearTimeout(lastScanOverlayTimerRef.current);
            lastScanOverlayTimerRef.current = null;
        }
        setLastScannedCode('');
    }, []);

    const showLastScannedCode = useCallback((code) => {
        clearLastScanOverlay();
        setLastScannedCode(code);
        lastScanOverlayTimerRef.current = window.setTimeout(() => {
            setLastScannedCode('');
            lastScanOverlayTimerRef.current = null;
        }, 1600);
    }, [clearLastScanOverlay]);

    const activeMobileRow = useMemo(() => {
        if (screens.md || !activeItemId) {
            return null;
        }
        return dataSource.find((row) => row.itemId === activeItemId) || null;
    }, [activeItemId, dataSource, screens.md]);

    const processScanCode = useCallback(async (rawCode, forcedRow = null, options = {}) => {
        const nextScanValue = String(rawCode || '').trim();
        const normalized = normalizeScanValue(nextScanValue);
        const clearInputOnSuccess = options.clearInputOnSuccess
            ?? scanSourceRef.current !== 'camera';
        if (!normalized) {
            return;
        }
        setScanValue(nextScanValue);
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
            await playScanSuccessFeedback();
            setActiveItemId(target.itemId);
            setScanMatches([]);
            if (clearInputOnSuccess) {
                setScanValue('');
            }
        } finally {
            setScanSubmitting(false);
        }
    }, [dataSource, handlePickUpdate, playScanSuccessFeedback]);

    const handleScanSubmit = async (explicitValue = scanValue) => {
        scanSourceRef.current = 'manual';
        await processScanCode(explicitValue);
    };

    const stopCamera = useCallback(() => {
        clearLastScanOverlay();
        setTorchSupported(false);
        setTorchEnabled(false);
        cameraDetectBusyRef.current = false;
        detectorRef.current = null;
        if (scanTimerRef.current) {
            window.clearInterval(scanTimerRef.current);
            scanTimerRef.current = null;
        }
        if (scannerControlsRef.current) {
            scannerControlsRef.current.stop();
            scannerControlsRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, [clearLastScanOverlay]);

    useEffect(() => () => {
        stopCamera();
    }, [stopCamera]);

    const configureCameraTrack = useCallback(async (mediaStream = null) => {
        const stream =
            mediaStream
            || streamRef.current
            || (
                typeof MediaStream !== 'undefined'
                && videoRef.current?.srcObject instanceof MediaStream
                    ? videoRef.current.srcObject
                    : null
            );
        const track = stream?.getVideoTracks?.()[0];
        if (!track?.applyConstraints) {
            return;
        }

        const capabilities = track.getCapabilities?.() || {};
        const focusModes = Array.isArray(capabilities.focusMode)
            ? capabilities.focusMode
            : [];
        const exposureModes = Array.isArray(capabilities.exposureMode)
            ? capabilities.exposureMode
            : [];
        const whiteBalanceModes = Array.isArray(capabilities.whiteBalanceMode)
            ? capabilities.whiteBalanceMode
            : [];
        const advanced = [];

        if (focusModes.includes('continuous')) {
            advanced.push({ focusMode: 'continuous' });
        } else if (focusModes.includes('single-shot')) {
            advanced.push({ focusMode: 'single-shot' });
        }
        if (exposureModes.includes('continuous')) {
            advanced.push({ exposureMode: 'continuous' });
        }
        if (whiteBalanceModes.includes('continuous')) {
            advanced.push({ whiteBalanceMode: 'continuous' });
        }

        if (!advanced.length) {
            return;
        }

        try {
            await track.applyConstraints({ advanced });
        } catch (err) {
            console.debug('Camera advanced constraints unavailable', err);
        }
    }, []);

    const updateTorchSupport = useCallback((controls = null, mediaStream = null) => {
        let supported = Boolean(controls?.switchTorch);
        const stream =
            mediaStream
            || streamRef.current
            || (
                typeof MediaStream !== 'undefined'
                && videoRef.current?.srcObject instanceof MediaStream
                    ? videoRef.current.srcObject
                    : null
            );
        const track = stream?.getVideoTracks?.()[0];
        const capabilities = track?.getCapabilities?.() || {};
        if (
            capabilities?.torch
            || (
                Array.isArray(capabilities?.fillLightMode)
                && capabilities.fillLightMode.length > 0
            )
        ) {
            supported = true;
        }
        setTorchSupported(Boolean(supported));
    }, []);

    const toggleTorch = useCallback(async () => {
        const nextValue = !torchEnabled;
        try {
            if (scannerControlsRef.current?.switchTorch) {
                await scannerControlsRef.current.switchTorch(nextValue);
                setTorchEnabled(nextValue);
                return;
            }
            const stream =
                streamRef.current
                || (
                    typeof MediaStream !== 'undefined'
                    && videoRef.current?.srcObject instanceof MediaStream
                        ? videoRef.current.srcObject
                        : null
                );
            const track = stream?.getVideoTracks?.()[0];
            if (!track?.applyConstraints) {
                throw new Error('Torch constraints are unavailable');
            }
            await track.applyConstraints({
                advanced: [{ torch: nextValue }],
            });
            setTorchEnabled(nextValue);
        } catch (err) {
            console.error('Failed to toggle torch', err);
            message.warning('Не удалось переключить фонарик на этом устройстве');
        }
    }, [torchEnabled]);

    const completeCameraDetection = useCallback(async (detected) => {
        if (cameraCaptureLockRef.current) {
            return;
        }
        const nextDetected = String(detected || '').trim();
        if (!nextDetected) {
            return;
        }
        cameraCaptureLockRef.current = true;
        scanSourceRef.current = 'camera';
        showLastScannedCode(nextDetected);
        await new Promise((resolve) => {
            window.setTimeout(resolve, 180);
        });
        setCameraOpen(false);
        setCameraEngine('');
        stopCamera();
        await processScanCode(nextDetected);

    }, [processScanCode, showLastScannedCode, stopCamera]);

    const loadZxingFallback = useCallback(async () => {
        if (zxingReaderCtorRef.current && zxingHintsRef.current) {
            return {
                BrowserMultiFormatReader: zxingReaderCtorRef.current,
                hints: zxingHintsRef.current,
            };
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
            await Promise.all([
                import('@zxing/browser'),
                import('@zxing/library'),
            ]);
        const hints = new Map([
            [
                DecodeHintType.POSSIBLE_FORMATS,
                [
                    BarcodeFormat.CODE_128,
                    BarcodeFormat.EAN_13,
                    BarcodeFormat.EAN_8,
                    BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E,
                    BarcodeFormat.QR_CODE,
                ],
            ],
        ]);
        zxingReaderCtorRef.current = BrowserMultiFormatReader;
        zxingHintsRef.current = hints;
        return { BrowserMultiFormatReader, hints };
    }, []);

    const startCamera = async () => {
        if (!cameraApiSupported) {
            message.warning(
                'Этот браузер не поддерживает доступ к камере. На iPhone откройте сайт напрямую в Safari.'
            );
            return;
        }
        if (!secureCameraContext) {
            message.warning(
                'Камера доступна только в защищенном контексте. Откройте сайт напрямую по HTTPS, лучше в Safari, а не во встроенном браузере мессенджера.'
            );
            return;
        }
        setCameraError('');
        setCameraOpen(true);
        setTorchEnabled(false);
        setTorchSupported(false);
        cameraCaptureLockRef.current = false;
        try {
        await new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                if (videoRef.current) return resolve();
                if (++attempts > 30) return reject(new Error('Camera preview is not ready'));
                window.setTimeout(check, 50);
            };
            check();
        });
            if (!videoRef.current) {
                throw new Error('Camera preview is not ready');
            }
            if (BarcodeDetectorCtor) {
                setCameraEngine('native');
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 24, max: 30 },
                    },
                    audio: false,
                });
                streamRef.current = stream;
                await configureCameraTrack(stream);
                updateTorchSupport(null, stream);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                detectorRef.current = new BarcodeDetectorCtor({
                    formats: [
                        'code_128',
                        'ean_13',
                        'ean_8',
                        'upc_a',
                        'upc_e',
                        'qr_code',
                    ],
                });
                scanTimerRef.current = window.setInterval(async () => {
                    if (
                        !videoRef.current
                        || !detectorRef.current
                        || cameraCaptureLockRef.current
                        || cameraDetectBusyRef.current
                        || videoRef.current.readyState < 2
                    ) {
                        return;
                    }
                    cameraDetectBusyRef.current = true;
                    try {
                        const barcodes = await detectorRef.current.detect(videoRef.current);
                        if (!barcodes?.length || cameraCaptureLockRef.current) return;
                        const detected = barcodes[0]?.rawValue;
                        if (!detected) return;
                        await completeCameraDetection(detected);
                    } catch (err) {
                        console.error('Camera barcode detect failed', err);
                    } finally {
                        cameraDetectBusyRef.current = false;
                    }
                }, 220);
                return;
            }

            setCameraEngine('zxing-loading');
            const { BrowserMultiFormatReader, hints } = await loadZxingFallback();
            setCameraEngine('zxing');
            await new Promise((resolve) => {
                if (!videoRef.current || videoRef.current.readyState >= 2) return resolve();
                videoRef.current.addEventListener('canplay', resolve, { once: true });
                window.setTimeout(resolve, 2000); // страховка
            });
            const reader = new BrowserMultiFormatReader(hints);
            scannerControlsRef.current = await reader.decodeFromVideoDevice(
                undefined,
                videoRef.current,
                async (result, error) => {
                    if (result && !cameraCaptureLockRef.current) {
                        await completeCameraDetection(result.getText());
                        return;
                    }
                    if (
                        error &&
                        !String(error?.message || '').toLowerCase().includes('not found')
                    ) {
                        console.error('ZXing camera detect failed', error);
                    }
                }
            );
            updateTorchSupport(
                scannerControlsRef.current,
                (
                    typeof MediaStream !== 'undefined'
                    && videoRef.current?.srcObject instanceof MediaStream
                )
                    ? videoRef.current.srcObject
                    : null,
            );
        } catch (err) {
            console.error('Failed to start camera', err);
            setCameraEngine('');
            const errorName = String(err?.name || '');
            if (errorName === 'NotAllowedError') {
                setCameraError('Браузер не дал доступ к камере. Проверьте разрешения сайта в Safari.');
                return;
            }
            if (errorName === 'NotFoundError') {
                setCameraError('Камера на устройстве не найдена.');
                return;
            }
            if (errorName === 'NotReadableError') {
                setCameraError('Камера сейчас занята другим приложением. Закройте его и попробуйте снова.');
                return;
            }
            setCameraError('Не удалось открыть камеру. На iPhone попробуйте открыть сайт напрямую в Safari и проверьте разрешения камеры.');
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
            <Tooltip title="+1 к собранному">
                <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => handlePickUpdate(row, { increment: 1 })}
                />
            </Tooltip>
            <Tooltip title="Собрать всё">
                <Button
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => handlePickUpdate(row, { picked_quantity: row.quantity })}
                />
            </Tooltip>
            <Tooltip title="Сбросить сборку">
                <Button
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={() => handlePickUpdate(row, { picked_quantity: 0 })}
                />
            </Tooltip>
        </Space>
    );

    const columns = [
        {
            title: 'Заказ',
            key: 'orderMeta',
            width: 150,
            render: (_, row) => (
                <div className="stock-compact-cell">
                    <Text strong>
                        #{row.orderId} · {formatCreatedAt(row.createdAt)}
                    </Text>
                    <Text ellipsis={{ tooltip: row.customerName }}>
                        {row.customerName || '—'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Позиция',
            key: 'position',
            width: 160,
            render: (_, row) => (
                <div className="stock-compact-cell">
                    <Text strong>{row.oem || '—'}</Text>
                    <Text type="secondary">{brandMap[row.brandId] || '—'}</Text>
                </div>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            ellipsis: true,
        },
        {
            title: 'Место',
            dataIndex: 'storageText',
            key: 'storageText',
            width: 120,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            key: 'quantities',
            width: 104,
            render: (_, row) => (
                <div className="stock-compact-cell stock-compact-cell-numeric">
                    <Text strong>
                        {row.pickedQuantity} / {row.quantity} · ост. {row.remainingQuantity}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Состояние',
            dataIndex: 'pickState',
            key: 'pickState',
            width: 132,
            render: (_, row) => {
                const state = getPickState(row.pickedQuantity, row.quantity);
                const color =
                    state === 'complete'
                        ? 'green'
                        : state === 'partial'
                            ? 'gold'
                            : 'default';
                return (
                    <div className="stock-compact-cell">
                        <Tag color={color}>
                            {getPickStateLabel(row.pickedQuantity, row.quantity)}
                        </Tag>
                        <Text
                            type="secondary"
                            ellipsis={{ tooltip: row.pickedByEmail || '—' }}
                        >
                            {row.pickedByEmail || '—'}
                        </Text>
                    </div>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 92,
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
        <div
            className="page-shell"
            style={{
                paddingBottom: !screens.md && activeMobileRow ? 112 : undefined,
            }}
        >
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
                            onPressEnter={(event) => handleScanSubmit(event.currentTarget.value)}
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
                            disabled={!cameraApiSupported}
                        >
                            Камера
                        </Button>
                        {!cameraApiSupported && (
                            <Text type="secondary">
                                Браузер не поддерживает камеру. На iPhone откройте сайт в Safari.
                            </Text>
                        )}
                        {cameraApiSupported && !secureCameraContext && (
                            <Text type="secondary">
                                Откройте страницу напрямую по HTTPS. Во встроенном браузере мессенджера камера может быть недоступна.
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
                        className="stock-orders-table"
                        dataSource={dataSource}
                        columns={columns}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        size="small"
                        rowClassName={rowClassName}
                        scroll={{ x: 980 }}
                    />
                ) : (
                    <List
                        dataSource={dataSource}
                        renderItem={(row) => (
                            <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
                                <Card
                                    size="small"
                                    className={`stock-mobile-card stock-mobile-card-${row.pickState} ${
                                        activeItemId === row.itemId ? 'stock-mobile-card-active' : ''
                                    }`}
                                    style={{ width: '100%' }}
                                    onClick={() => setActiveItemId(row.itemId)}
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
                                            Собрано {row.pickedQuantity} / {row.quantity}
                                        </Text>
                                        {renderActionButtons(row)}
                                    </Space>
                                </Card>
                            </List.Item>
                        )}
                    />
                )}
            </Card>

            {!screens.md && activeMobileRow && (
                <div className="stock-mobile-action-bar">
                    <Space
                        direction="vertical"
                        size={8}
                        style={{ width: '100%' }}
                    >
                        <div className="stock-mobile-action-bar__summary">
                            <Text strong>
                                {activeMobileRow.oem || '—'} ·{' '}
                                {brandMap[activeMobileRow.brandId] || '—'}
                            </Text>
                            <Text type="secondary" ellipsis>
                                {activeMobileRow.name || '—'}
                            </Text>
                            <Text type="secondary">
                                Собрано {activeMobileRow.pickedQuantity} / {activeMobileRow.quantity}
                            </Text>
                        </div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Button
                                icon={<ClearOutlined />}
                                onClick={() => handlePickUpdate(activeMobileRow, { picked_quantity: 0 })}
                            >
                                Сброс
                            </Button>
                            <Button
                                type="default"
                                icon={<PlusOutlined />}
                                onClick={() => handlePickUpdate(activeMobileRow, { increment: 1 })}
                            >
                                +1
                            </Button>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={() => handlePickUpdate(
                                    activeMobileRow,
                                    { picked_quantity: activeMobileRow.quantity },
                                )}
                            >
                                Всё
                            </Button>
                        </Space.Compact>
                    </Space>
                </div>
            )}

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
                wrapClassName={screens.md ? '' : 'stock-camera-modal-mobile'}
                onCancel={() => {
                    stopCamera();
                    setCameraOpen(false);
                    setCameraEngine('');
                }}
                title="Сканирование камерой"
                width={screens.md ? 720 : '100vw'}
                style={screens.md ? undefined : { top: 0, margin: 0, paddingBottom: 0 }}
            >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {cameraError ? (
                        <Text type="danger">{cameraError}</Text>
                    ) : (
                        <Space wrap>
                            <Text type="secondary">
                                Наведите камеру на штрих-код. После распознавания строка будет отмечена автоматически.
                            </Text>
                            <Tag
                                color={
                                    cameraEngine === 'zxing'
                                    || cameraEngine === 'zxing-loading'
                                        ? 'blue'
                                        : 'green'
                                }
                            >
                                {cameraEngine === 'zxing-loading'
                                    ? 'Камера: загрузка ZXing'
                                    : cameraEngine === 'zxing'
                                        ? 'Камера: fallback ZXing'
                                        : 'Камера: BarcodeDetector'}
                            </Tag>
                            {torchSupported && (
                                <Button
                                    size="small"
                                    icon={<BulbOutlined />}
                                    type={torchEnabled ? 'primary' : 'default'}
                                    onClick={toggleTorch}
                                >
                                    {torchEnabled ? 'Фонарик выкл' : 'Фонарик'}
                                </Button>
                            )}
                        </Space>
                    )}
                    <div className="stock-camera-frame">
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
                        <div className="stock-camera-frame__guide" />
                        {lastScannedCode && (
                            <div className="stock-camera-frame__last-code">
                                Найден код: {lastScannedCode}
                            </div>
                        )}
                        <div className="stock-camera-frame__hint">
                            Держите штрих-код внутри рамки
                        </div>
                    </div>
                </Space>
            </Modal>
        </div>
    );
};

export default StockOrdersPage;
