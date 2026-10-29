import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { CameraOutlined, DeleteOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import JsBarcode from 'jsbarcode';

import {
    createAssemblyBox,
    deleteAssemblyBox,
    listAssemblyBoxes,
    openAssemblyBox,
    scanIntoAssemblyBox,
    sealAssemblyBox,
    updateAssemblyBox,
} from '../api/customerOrders';
import { buildLabelPrintDocument, escapeHtml } from '../utils/labelPrint';
import { buildCustomLabelDocument, usePrintForm } from '../utils/printFormTemplates';
import { usePrintDelivery } from '../utils/usePrintDelivery';
import { scanFail, scanOk } from '../utils/scanFeedback';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';
import CameraScanModal from './CameraScanModal';

const { Text } = Typography;

const ShipmentBoxes = ({ shipment }) => {
    const printForm = usePrintForm('shipment_box');
    const { printHtml } = usePrintDelivery();
    const [boxes, setBoxes] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
    const [scanBoxId, setScanBoxId] = useState(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [scanText, setScanText] = useState('');
    const items = shipment.items || [];
    const isDraft = shipment.status === 'draft';

    const load = useCallback(async () => {
        try {
            const response = await listAssemblyBoxes(shipment.id);
            const rows = response.data || [];
            setBoxes(rows);
            setDrafts(Object.fromEntries(rows.map((box) => [box.id,
                Object.fromEntries(box.items.map((row) => [row.shipment_item_id, row.quantity]))])));
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить коробки');
        }
    }, [shipment.id]);

    useEffect(() => { void load(); }, [load]);

    const committed = useMemo(() => {
        const map = {};
        boxes.forEach((box) => box.items.forEach((row) => {
            map[row.shipment_item_id] = (map[row.shipment_item_id] || 0) + row.quantity;
        }));
        return map;
    }, [boxes]);
    const complete = items.length > 0 && boxes.length > 0
        && boxes.every((box) => box.sealed_at)
        && items.every((item) => (committed[item.id] || 0) === item.quantity);

    const openBoxes = boxes.filter((box) => !box.sealed_at);
    const targetBox = openBoxes.find((box) => box.id === scanBoxId) || openBoxes[openBoxes.length - 1];
    const scanCode = async (rawCode) => {
        const code = String(rawCode || '').trim();
        if (!code || !targetBox) {
            if (code) message.warning('Нет открытой коробки: добавьте или откройте коробку');
            return;
        }
        try {
            const response = await scanIntoAssemblyBox(shipment.id, targetBox.id, code);
            await load();
            scanOk();
            message.success(`Коробка ${targetBox.number}: ${response.data.title} +${response.data.added} шт.`);
        } catch (error) {
            scanFail();
            message.error(error?.response?.data?.detail || 'Не удалось добавить по скану');
        }
    };
    // на странице черновика скан принадлежит ей, даже если открытых коробок нет
    useBarcodeScanner(scanCode, isDraft);

    const action = async (request, success) => {
        setBusy(true);
        try {
            await request();
            await load();
            if (success) message.success(success);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось изменить коробку');
        } finally { setBusy(false); }
    };

    const boxQuantity = (box) => box.items.reduce((sum, row) => sum + row.quantity, 0);
    const boxBarcodeSvg = (box) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, `DZ-BOX-${shipment.id}-${box.number}`,
            { format: 'CODE128', width: 1, height: 40, displayValue: false, margin: 0 });
        return svg.outerHTML;
    };

    const printBoxes = async (list) => {
        if (!list.length) return;
        const docNumber = shipment.doc_number || `#${shipment.id}`;
        const title = list.length === 1 ? `Коробка ${list[0].number}` : `Коробки (${list.length})`;
        const html = printForm ? buildCustomLabelDocument(printForm, list.map((box) => ({
            customer_name: shipment.customer_name,
            document_number: docNumber,
            box_number: box.number, box_total: boxes.length,
            quantity: boxQuantity(box),
            barcode: `DZ-BOX-${shipment.id}-${box.number}`,
        })), title) : buildLabelPrintDocument({
            title,
            fieldsCss: `.label { padding: 3mm; } .head { font: bold 13pt Arial; }
                .text { font: 8pt Arial; margin-top: 2mm; } svg { max-width: 100%; height: 13mm; }`,
            items: list,
            renderLabel: (box) => `<div class="head">${escapeHtml(shipment.customer_name || '')}</div>
                <div class="text">${escapeHtml(docNumber)} · Коробка ${box.number}/${boxes.length}</div>
                <div class="text">${boxQuantity(box)} шт.</div>
                <div style="margin-top:2mm">${boxBarcodeSvg(box)}</div>`,
        });
        try {
            await printHtml(html, title);
        } catch (error) {
            message.error(error?.response?.data?.detail || error.message);
        }
    };

    const draftEntries = (box) => Object.entries(drafts[box.id] || {})
        .filter(([, qty]) => Number(qty) > 0)
        .map(([id, qty]) => ({ shipment_item_id: Number(id), quantity: Number(qty) }));
    const saveBox = (box, success = 'Состав коробки сохранён') => action(
        () => updateAssemblyBox(shipment.id, box.id, draftEntries(box)), success);
    // «Закрыть» сначала сохраняет введённый состав, иначе несохранённые
    // количества терялись бы при закрытии.
    const sealWithSave = (box) => action(async () => {
        await updateAssemblyBox(shipment.id, box.id, draftEntries(box));
        await sealAssemblyBox(shipment.id, box.id);
    }, 'Коробка сохранена и закрыта');
    const isDirty = (box) => {
        const saved = Object.fromEntries(box.items.map((row) => [row.shipment_item_id, row.quantity]));
        const draft = drafts[box.id] || {};
        const ids = new Set([...Object.keys(saved), ...Object.keys(draft)]);
        return [...ids].some((id) => Number(saved[id] || 0) !== Number(draft[id] || 0));
    };

    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const placedQty = items.reduce((sum, item) => sum + Math.min(item.quantity, committed[item.id] || 0), 0);

    return <Card title={<Space wrap>Коробки реализации <Tag color={complete ? 'green' : 'orange'}>
        {complete ? 'Готово к проведению' : 'Не всё распределено и закрыто'}
    </Tag><Tag>Распределено {placedQty} из {totalQty} шт.</Tag></Space>} style={{ marginTop: 16 }}
        extra={<Space wrap>
            {boxes.length > 1 && <Button icon={<PrinterOutlined />}
                onClick={() => printBoxes(boxes)}>Этикетки всех коробок</Button>}
            {isDraft && <Button icon={<PlusOutlined />} loading={busy}
                onClick={() => action(() => createAssemblyBox(shipment.id), 'Коробка добавлена')}>
                Добавить коробку</Button>}
        </Space>}>
        {isDraft && <Space wrap style={{ marginBottom: 12 }}>
            <Input allowClear style={{ width: 280 }} value={scanText} disabled={!targetBox}
                placeholder={targetBox ? `Скан этикетки → коробка ${targetBox.number}` : 'Добавьте коробку'}
                onChange={(event) => setScanText(event.target.value)}
                onPressEnter={() => { void scanCode(scanText); setScanText(''); }} />
            <Button icon={<CameraOutlined />} disabled={!targetBox}
                onClick={() => setCameraOpen(true)}>Камера</Button>
            {openBoxes.length > 1 && <Space size={4}>В коробку:
                {openBoxes.map((box) => <Button key={box.id} size="small"
                    type={box.id === targetBox?.id ? 'primary' : 'default'}
                    onClick={() => setScanBoxId(box.id)}>{box.number}</Button>)}
            </Space>}
        </Space>}
        <CameraScanModal open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={scanCode} />
        <Alert showIcon type="info" style={{ marginBottom: 12 }}
            message="Перед проведением распределите всё количество из черновика по коробкам и закройте их. Количество в строке черновика можно изменить до упаковки." />
        <Space direction="vertical" style={{ width: '100%' }}>
            {boxes.map((box) => {
                const draft = drafts[box.id] || {};
                const editable = isDraft && !box.sealed_at;
                const tableRows = items.map((item) => {
                    const inOtherBoxes = boxes.filter((other) => other.id !== box.id)
                        .flatMap((other) => other.items)
                        .filter((row) => row.shipment_item_id === item.id)
                        .reduce((sum, row) => sum + row.quantity, 0);
                    return { ...item, maxForBox: Math.max(0, item.quantity - inOtherBoxes) };
                }).filter((row) => (editable
                    // уже полностью разложенное по другим коробкам не предлагаем
                    ? row.maxForBox > 0 || Number(draft[row.id] || 0) > 0
                    : box.items.some((entry) => entry.shipment_item_id === row.id)));
                const hiddenCount = items.length - tableRows.length;
                return <Card key={box.id} size="small" title={<Space>Коробка {box.number}
                    {box.sealed_at ? <Tag color="green">Закрыта</Tag> : <Tag>Открыта</Tag>}
                </Space>} extra={<Space wrap>
                    {isDirty(box) && editable && <Tag color="gold">Есть несохранённые изменения</Tag>}
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => printBoxes([box])}>Этикетка</Button>
                    {editable && <>
                        <Button size="small" onClick={() => setDrafts((prev) => ({ ...prev,
                            [box.id]: Object.fromEntries(tableRows.map((row) => [row.id, row.maxForBox])),
                        }))}>Всё свободное</Button>
                        <Button size="small" type="primary" loading={busy}
                            onClick={() => saveBox(box)}>Сохранить</Button>
                        <Button size="small" disabled={!draftEntries(box).length} loading={busy}
                            onClick={() => sealWithSave(box)}>Закрыть</Button>
                    </>}
                    {isDraft && box.sealed_at && <Button size="small" loading={busy}
                        onClick={() => action(() => openAssemblyBox(shipment.id, box.id))}>Открыть</Button>}
                    {isDraft && <Popconfirm title="Удалить коробку?" onConfirm={() => action(
                        () => deleteAssemblyBox(shipment.id, box.id))}>
                        <Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
                </Space>}>
                    <Table rowKey="id" size="small" pagination={false} dataSource={tableRows}
                        columns={[
                            { title: 'Позиция', render: (_, row) => <><Text strong>{row.customer_brand} {row.customer_oem}</Text><br />{row.customer_name}</> },
                            { title: 'В черновике', dataIndex: 'quantity', width: 100 },
                            { title: 'Свободно', width: 90, render: (_, row) => editable
                                ? Math.max(0, row.maxForBox - Number(draft[row.id] || 0)) : '—' },
                            { title: 'В коробке', width: 140, render: (_, row) => isDraft && !box.sealed_at
                                ? <InputNumber min={0} max={row.maxForBox} value={draft[row.id] || 0}
                                    onChange={(value) => setDrafts((prev) => ({ ...prev,
                                        [box.id]: { ...prev[box.id], [row.id]: value || 0 },
                                    }))} />
                                : box.items.find((entry) => entry.shipment_item_id === row.id)?.quantity || 0 },
                        ]} />
                    {editable && hiddenCount > 0 && <Text type="secondary" style={{ fontSize: 12 }}>
                        Скрыто позиций, уже разложенных по другим коробкам: {hiddenCount}
                    </Text>}
                </Card>;
            })}
            {!boxes.length && <Text type="secondary">Коробок пока нет</Text>}
        </Space>
    </Card>;
};

export default ShipmentBoxes;
