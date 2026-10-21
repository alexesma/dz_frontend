import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, InputNumber, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import JsBarcode from 'jsbarcode';

import {
    createAssemblyBox,
    deleteAssemblyBox,
    listAssemblyBoxes,
    openAssemblyBox,
    sealAssemblyBox,
    updateAssemblyBox,
} from '../api/customerOrders';
import { buildLabelPrintDocument, escapeHtml, openLabelPrintWindow } from '../utils/labelPrint';

const { Text } = Typography;

const ShipmentBoxes = ({ shipment }) => {
    const [boxes, setBoxes] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
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

    const printBox = (box) => {
        const barcode = `DZ-BOX-${shipment.id}-${box.number}`;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcode, { format: 'CODE128', width: 1, height: 40, displayValue: false, margin: 0 });
        const html = buildLabelPrintDocument({
            title: `Коробка ${box.number}`,
            fieldsCss: `.label { padding: 3mm; } .head { font: bold 13pt Arial; }
                .text { font: 8pt Arial; margin-top: 2mm; } svg { max-width: 100%; height: 13mm; }`,
            items: [box],
            renderLabel: () => `<div class="head">${escapeHtml(shipment.customer_name || '')}</div>
                <div class="text">${escapeHtml(shipment.doc_number || `#${shipment.id}`)} · Коробка ${box.number}/${boxes.length}</div>
                <div class="text">${box.items.reduce((sum, row) => sum + row.quantity, 0)} шт.</div>
                <div style="margin-top:2mm">${svg.outerHTML}</div>`,
        });
        if (!openLabelPrintWindow(html)) message.error('Браузер заблокировал окно печати');
    };

    return <Card title={<Space>Коробки реализации <Tag color={complete ? 'green' : 'orange'}>
        {complete ? 'Готово к проведению' : 'Не всё распределено и закрыто'}
    </Tag></Space>} style={{ marginTop: 16 }}
        extra={isDraft && <Button icon={<PlusOutlined />} loading={busy}
            onClick={() => action(() => createAssemblyBox(shipment.id), 'Коробка добавлена')}>
            Добавить коробку</Button>}>
        <Alert showIcon type="info" style={{ marginBottom: 12 }}
            message="Перед проведением распределите всё количество из черновика по коробкам и закройте их. Количество в строке черновика можно изменить до упаковки." />
        <Space direction="vertical" style={{ width: '100%' }}>
            {boxes.map((box) => {
                const draft = drafts[box.id] || {};
                const tableRows = items.map((item) => {
                    const inOtherBoxes = boxes.filter((other) => other.id !== box.id)
                        .flatMap((other) => other.items)
                        .filter((row) => row.shipment_item_id === item.id)
                        .reduce((sum, row) => sum + row.quantity, 0);
                    return { ...item, maxForBox: Math.max(0, item.quantity - inOtherBoxes) };
                });
                return <Card key={box.id} size="small" title={<Space>Коробка {box.number}
                    {box.sealed_at ? <Tag color="green">Закрыта</Tag> : <Tag>Открыта</Tag>}
                </Space>} extra={<Space wrap>
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => printBox(box)}>Этикетка</Button>
                    {isDraft && !box.sealed_at && <>
                        <Button size="small" onClick={() => setDrafts((prev) => ({ ...prev,
                            [box.id]: Object.fromEntries(tableRows.map((row) => [row.id, row.maxForBox])),
                        }))}>Всё свободное</Button>
                        <Button size="small" type="primary" loading={busy}
                            onClick={() => action(() => updateAssemblyBox(shipment.id, box.id,
                                Object.entries(draft).filter(([, qty]) => Number(qty) > 0)
                                    .map(([id, qty]) => ({ shipment_item_id: Number(id), quantity: Number(qty) }))),
                            'Состав коробки сохранён')}>Сохранить</Button>
                        <Button size="small" disabled={!box.items.length} loading={busy}
                            onClick={() => action(() => sealAssemblyBox(shipment.id, box.id), 'Коробка закрыта')}>
                            Закрыть</Button>
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
                            { title: 'В черновике', dataIndex: 'quantity', width: 110 },
                            { title: 'В коробке', width: 140, render: (_, row) => isDraft && !box.sealed_at
                                ? <InputNumber min={0} max={row.maxForBox} value={draft[row.id] || 0}
                                    onChange={(value) => setDrafts((prev) => ({ ...prev,
                                        [box.id]: { ...prev[box.id], [row.id]: value || 0 },
                                    }))} />
                                : box.items.find((entry) => entry.shipment_item_id === row.id)?.quantity || 0 },
                        ]} />
                </Card>;
            })}
            {!boxes.length && <Text type="secondary">Коробок пока нет</Text>}
        </Space>
    </Card>;
};

export default ShipmentBoxes;
