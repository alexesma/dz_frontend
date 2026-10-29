import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Select, Space, Tag, Typography, message } from 'antd';
import { CameraOutlined, CheckOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';

import { listInventorySessions, resolveScanCode, scanCountInventoryItem } from '../api/inventory';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';
import { scanFail, scanOk } from '../utils/scanFeedback';
import CameraScanModal from './CameraScanModal';

const { Text, Title } = Typography;

// Инвентаризация сканером: место → товар → (повторный скан +1 или число) → запись.
const InventoryScanPage = () => {
    const [params, setParams] = useSearchParams();
    const [sessions, setSessions] = useState([]);
    const sessionId = Number(params.get('session')) || null;
    const [location, setLocation] = useState(null);
    const [product, setProduct] = useState(null);
    const [choices, setChoices] = useState([]);
    const [quantity, setQuantity] = useState(0);
    const [log, setLog] = useState([]);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [manual, setManual] = useState('');
    const pendingRef = useRef({ product: null, location: null, quantity: 0 });
    pendingRef.current = { product, location, quantity };
    const busyRef = useRef(Promise.resolve());

    useEffect(() => {
        (async () => {
            try {
                const response = await listInventorySessions({ status: 'active' });
                const rows = (response.data || []).filter((row) => row.status === 'active');
                setSessions(rows);
                if (!sessionId && rows.length === 1) setParams({ session: String(rows[0].id) });
            } catch {
                message.error('Не удалось загрузить сеансы инвентаризации');
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Записи идут по очереди, чтобы быстрые сканы не обгоняли друг друга.
    const commit = useCallback((entry = pendingRef.current) => {
        const { product: part, location: place, quantity: qty } = entry;
        if (!sessionId || !part || !place || !(qty > 0)) return Promise.resolve();
        busyRef.current = busyRef.current.then(async () => {
            try {
                const response = await scanCountInventoryItem(sessionId, {
                    autopart_id: part.autopart_id, storage_location_id: place.storage_location_id,
                    quantity: qty, mode: 'add',
                });
                const item = response.data;
                setLog((prev) => [{
                    key: `${item.id}-${Date.now()}`, title: part.title, location: place.name,
                    added: qty, actual: item.actual_qty, expected: item.expected_qty,
                }, ...prev].slice(0, 30));
            } catch (error) {
                scanFail();
                message.error(error?.response?.data?.detail || `Не записано: ${part.title}`);
            }
        });
        return busyRef.current;
    }, [sessionId]);

    const flush = useCallback(() => {
        const entry = pendingRef.current;
        setProduct(null);
        setQuantity(0);
        return commit(entry);
    }, [commit]);

    const selectProduct = useCallback((part) => {
        const current = pendingRef.current;
        if (current.product?.autopart_id === part.autopart_id) {
            setQuantity((value) => value + 1);
            return;
        }
        if (current.product) void commit(current);
        setProduct(part);
        setQuantity(1);
    }, [commit]);

    const onScan = useCallback(async (raw) => {
        const code = String(raw || '').trim();
        if (!code) return;
        if (!sessionId) { message.warning('Выберите сеанс инвентаризации'); scanFail(); return; }
        try {
            const { data } = await resolveScanCode(code);
            if (data.kind === 'location') {
                if (pendingRef.current.product) await flush();
                setLocation({ storage_location_id: data.storage_location_id, name: data.name });
                scanOk();
            } else if (data.kind === 'autopart') {
                if (!pendingRef.current.location) { message.warning('Сначала отсканируйте место'); scanFail(); return; }
                selectProduct({ autopart_id: data.autopart_id, title: data.title });
                scanOk();
            } else if (data.kind === 'autopart_choice') {
                setChoices(data.options);
            } else {
                message.warning('Этот код не место и не товар');
                scanFail();
            }
        } catch (error) {
            scanFail();
            message.warning(error?.response?.status === 404
                ? `Код ${code} не найден. Привяжите его к товару сканом вне инвентаризации.`
                : 'Не удалось распознать код');
        }
    }, [sessionId, flush, selectProduct]);

    useBarcodeScanner(onScan, true);
    const submitManual = () => { void onScan(manual); setManual(''); };

    return <div style={{ maxWidth: 720, margin: '0 auto', padding: 12 }}>
        <Title level={4} style={{ marginTop: 0 }}>Инвентаризация сканером</Title>
        <Select style={{ width: '100%', marginBottom: 12 }} placeholder="Сеанс инвентаризации"
            value={sessionId} onChange={(value) => setParams({ session: String(value) })}
            options={sessions.map((row) => ({ value: row.id, label: row.name }))} />
        {!sessions.length && <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Нет активных сеансов. Начните инвентаризацию на странице «Инвентаризация»." />}
        <Card size="small" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <div>1. Место: {location ? <Tag color="blue" style={{ fontSize: 18 }}>{location.name}</Tag>
                    : <Text type="secondary">отсканируйте этикетку места</Text>}</div>
                <div>2. Товар: {product ? <Text strong>{product.title}</Text>
                    : <Text type="secondary">отсканируйте товар</Text>}</div>
                <Space>3. Количество:
                    <InputNumber min={0} size="large" value={quantity} disabled={!product}
                        onChange={(value) => setQuantity(value || 0)}
                        onPressEnter={() => void flush()} />
                    <Button type="primary" size="large" icon={<CheckOutlined />}
                        disabled={!product || !(quantity > 0)} onClick={() => void flush()}>Записать</Button>
                </Space>
                {product && <Text type="secondary">
                    Повторный скан того же товара добавляет +1. Следующий товар или место запишет это автоматически.
                </Text>}
            </Space>
        </Card>
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Input value={manual} onChange={(event) => setManual(event.target.value)}
                placeholder="Код вручную или сканером" onPressEnter={submitManual} />
            <Button onClick={submitManual}>OK</Button>
            <Button icon={<CameraOutlined />} onClick={() => setCameraOpen(true)} />
        </Space.Compact>
        <CameraScanModal open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={onScan} />
        {choices.length > 0 && <Card size="small" title="Выберите товар" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                {choices.map((option) => <Button key={option.autopart_id} block onClick={() => {
                    if (!pendingRef.current.location) { message.warning('Сначала отсканируйте место'); return; }
                    selectProduct({ autopart_id: option.autopart_id,
                        title: `${option.brand} ${option.oem} · ${option.name}` });
                    setChoices([]);
                }}>{option.brand} {option.oem} — {option.name}</Button>)}
            </Space>
        </Card>}
        <Card size="small" title="Записано">
            {log.length ? log.map((row) => <div key={row.key} style={{ padding: '4px 0' }}>
                <Text strong>{row.location}</Text> · {row.title} · +{row.added}
                {' '}<Tag color={row.actual === row.expected ? 'green' : 'orange'}>
                    {row.actual} из {row.expected} по учёту</Tag>
            </div>) : <Text type="secondary">Пока ничего</Text>}
        </Card>
    </div>;
};

export default InventoryScanPage;
