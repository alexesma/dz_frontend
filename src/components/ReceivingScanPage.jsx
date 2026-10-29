import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, InputNumber, Input, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CameraOutlined, CheckOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';

import { getSupplierReceipts } from '../api/customerOrders';
import {
    countReceivedItem, getReceivingPlan, placeReceivedItem, resolveScanCode,
} from '../api/inventory';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';
import { scanFail, scanOk } from '../utils/scanFeedback';
import CameraScanModal from './CameraScanModal';

const { Text, Title } = Typography;
const FLUSH_MS = 700;

// Приёмка сканером. «Сверка»: скан товара → +1 к принятому, сравнение с документом.
// «Размещение»: товар → место → количество, перемещение из зоны приёмки.
const ReceivingScanPage = () => {
    const [params, setParams] = useSearchParams();
    const receiptId = Number(params.get('receipt')) || null;
    const [receipts, setReceipts] = useState([]);
    const [plan, setPlan] = useState(null);
    const [mode, setMode] = useState('count');
    const [location, setLocation] = useState(null);
    const [product, setProduct] = useState(null);
    const [quantity, setQuantity] = useState(0);
    const [choices, setChoices] = useState([]);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [manual, setManual] = useState('');
    const pending = useRef({});
    const timer = useRef(null);
    const queue = useRef(Promise.resolve());
    const state = useRef({});
    state.current = { plan, product, location, quantity, mode };

    useEffect(() => {
        (async () => {
            try {
                const response = await getSupplierReceipts({});
                setReceipts((response.data || []).slice(0, 100));
            } catch { message.error('Не удалось загрузить поступления'); }
        })();
    }, []);

    const reload = useCallback(async () => {
        if (!receiptId) { setPlan(null); return; }
        try {
            setPlan((await getReceivingPlan(receiptId)).data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить поступление');
        }
    }, [receiptId]);
    useEffect(() => { void reload(); }, [reload]);

    const patchLine = (autopartId, patch) => setPlan((prev) => prev && ({
        ...prev,
        lines: prev.lines.map((line) => (line.autopart_id === autopartId ? { ...line, ...patch(line) } : line)),
    }));

    // Сверку копим локально и отправляем пачкой: скан не ждёт ответа сервера.
    const flushCounts = useCallback(() => {
        const batch = pending.current;
        pending.current = {};
        Object.entries(batch).forEach(([autopartId, qty]) => {
            queue.current = queue.current.then(async () => {
                try {
                    await countReceivedItem(receiptId, { autopart_id: Number(autopartId), quantity: qty, mode: 'add' });
                } catch (error) {
                    scanFail();
                    message.error(error?.response?.data?.detail || 'Не записано количество');
                    void reload();
                }
            });
        });
        return queue.current;
    }, [receiptId, reload]);

    const addCount = (line) => {
        patchLine(line.autopart_id, (row) => ({ accepted_qty: row.accepted_qty + 1 }));
        pending.current[line.autopart_id] = (pending.current[line.autopart_id] || 0) + 1;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flushCounts(), FLUSH_MS);
    };

    const place = useCallback(async () => {
        const { product: part, location: spot, quantity: qty } = state.current;
        if (!part || !spot || !(qty > 0)) return;
        setProduct(null);
        setQuantity(0);
        try {
            const { data } = await placeReceivedItem(receiptId, {
                autopart_id: part.autopart_id, storage_location_id: spot.storage_location_id, quantity: qty,
            });
            patchLine(part.autopart_id, () => ({ placed_qty: data.line.placed_qty }));
            message.success(`${spot.name}: +${qty} шт.`);
        } catch (error) {
            scanFail();
            message.error(error?.response?.data?.detail || 'Не удалось разместить');
        }
    }, [receiptId]);

    const pickProduct = useCallback(async (autopartId, title) => {
        const line = state.current.plan?.lines.find((row) => row.autopart_id === autopartId);
        if (!line) { message.warning(`${title}: этого товара нет в документе`); scanFail(); return; }
        if (state.current.mode === 'count') { addCount(line); scanOk(); return; }
        if (!state.current.location) { message.warning('Сначала отсканируйте место'); scanFail(); return; }
        if (state.current.product?.autopart_id === autopartId) {
            setQuantity((value) => value + 1);
        } else {
            if (state.current.product) await place();
            setProduct({ autopart_id: autopartId, title });
            setQuantity(Math.max(1, line.accepted_qty - line.placed_qty || line.document_qty - line.placed_qty));
        }
        scanOk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [place]);

    const onScan = useCallback(async (raw) => {
        const code = String(raw || '').trim();
        if (!code) return;
        if (!state.current.plan) { message.warning('Выберите поступление'); scanFail(); return; }
        try {
            const { data } = await resolveScanCode(code);
            if (data.kind === 'location' && state.current.mode === 'place') {
                if (state.current.product) await place();
                setLocation({ storage_location_id: data.storage_location_id, name: data.name });
                scanOk();
            } else if (data.kind === 'autopart') {
                await pickProduct(data.autopart_id, data.title);
            } else if (data.kind === 'autopart_choice') {
                // в документе обычно один из вариантов — берём его, иначе просим выбрать
                const inDoc = data.options.filter((option) => state.current.plan.lines
                    .some((line) => line.autopart_id === option.autopart_id));
                if (inDoc.length === 1) await pickProduct(inDoc[0].autopart_id, `${inDoc[0].brand} ${inDoc[0].oem}`);
                else setChoices(data.options);
            } else {
                message.warning('Этот код не подходит для приёмки');
                scanFail();
            }
        } catch (error) {
            scanFail();
            message.warning(error?.response?.status === 404 ? `Код ${code} не найден` : 'Не удалось распознать код');
        }
    }, [place, pickProduct]);

    useBarcodeScanner(onScan, true);
    useEffect(() => () => clearTimeout(timer.current), []);
    const submitManual = () => { void onScan(manual); setManual(''); };

    return <div style={{ maxWidth: 900, margin: '0 auto', padding: 12 }}>
        <Title level={4} style={{ marginTop: 0 }}>Приёмка сканером</Title>
        <Select showSearch optionFilterProp="label" style={{ width: '100%', marginBottom: 12 }}
            placeholder="Поступление" value={receiptId}
            onChange={(value) => { setLocation(null); setProduct(null); setParams({ receipt: String(value) }); }}
            options={receipts.map((row) => ({
                value: row.id,
                label: `№${row.document_number || row.id} · ${row.provider_name || ''}${row.posted_at ? '' : ' · не проведено'}`,
            }))} />
        <Segmented block style={{ marginBottom: 12 }} value={mode} onChange={setMode}
            options={[{ value: 'count', label: 'Сверка с документом' }, { value: 'place', label: 'Размещение по местам' }]} />
        {plan && mode === 'place' && !plan.posted && <Alert type="warning" showIcon style={{ marginBottom: 12 }}
            message="Поступление не проведено: товар ещё не на остатке, размещать нечего. Проведите документ." />}
        {mode === 'place' && <Card size="small" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <div>Место: {location ? <Tag color="blue" style={{ fontSize: 18 }}>{location.name}</Tag>
                    : <Text type="secondary">отсканируйте этикетку места</Text>}</div>
                <div>Товар: {product ? <Text strong>{product.title}</Text> : <Text type="secondary">отсканируйте товар</Text>}</div>
                <Space>Количество:
                    <InputNumber min={0} size="large" value={quantity} disabled={!product}
                        onChange={(value) => setQuantity(value || 0)} onPressEnter={() => void place()} />
                    <Button type="primary" size="large" icon={<CheckOutlined />}
                        disabled={!product || !(quantity > 0)} onClick={() => void place()}>Разместить</Button>
                </Space>
            </Space>
        </Card>}
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
                    setChoices([]);
                    void pickProduct(option.autopart_id, `${option.brand} ${option.oem}`);
                }}>{option.brand} {option.oem} — {option.name}</Button>)}
            </Space>
        </Card>}
        {plan && <Table size="small" pagination={false} rowKey={(row) => row.autopart_id ?? row.item_ids[0]}
            dataSource={plan.lines}
            columns={[
                { title: 'Позиция', render: (_, row) => <><Text strong>{row.brand} {row.oem}</Text><br />{row.name}</> },
                { title: 'В документе', dataIndex: 'document_qty', width: 100 },
                { title: 'Принято', width: 110, render: (_, row) => <Tag color={row.accepted_qty === row.document_qty
                    ? 'green' : (row.accepted_qty ? 'orange' : 'default')}>{row.accepted_qty}</Tag> },
                { title: 'Размещено', dataIndex: 'placed_qty', width: 110 },
            ]} />}
    </div>;
};

export default ReceivingScanPage;
