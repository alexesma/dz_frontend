import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert, Button, Card, Input, Popconfirm, Space, Switch, Table, Tag, Typography, message,
} from 'antd';
import { BarcodeOutlined } from '@ant-design/icons';

import {
    autoAssignShipmentMarkingCodes, deleteShipmentMarkingScan, getShipmentMarkingScan,
    scanShipmentMarkingCode,
} from '../api/inventory';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';
import { scanFail, scanOk } from '../utils/scanFeedback';
import GisMtTokenTag from './GisMtTokenTag';

const { Text } = Typography;

// Сканирование кодов маркировки при сборке: в УПД покупателю уходит код
// именно той штуки, что лежит в посылке.
const ShipmentMarkingScan = ({ shipmentId, status, isAdmin }) => {
    const [state, setState] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [manual, setManual] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        try {
            setState((await getShipmentMarkingScan(shipmentId)).data);
        } catch {
            setState(null);
        }
    }, [shipmentId]);
    useEffect(() => { void reload(); }, [reload, status]);
    // коды, отсканированные при раскладке по коробкам
    useEffect(() => {
        const onChange = () => { void reload(); };
        window.addEventListener('shipment-marking-changed', onChange);
        return () => window.removeEventListener('shipment-marking-changed', onChange);
    }, [reload]);

    const onScan = useCallback(async (raw) => {
        const code = String(raw || '').trim();
        if (!code) return;
        try {
            const { data } = await scanShipmentMarkingCode(shipmentId, code);
            setState(data.state);
            if (data.aggregate) {
                if (data.errors_total) scanFail(); else scanOk();
                message.open({ key: 'ship-marking', type: data.errors_total ? 'warning' : 'success', duration: 6,
                    content: `Упаковка: кодов ${data.units}, закреплено ${data.accepted}`
                        + (data.duplicates ? `, уже отсканировано ${data.duplicates}` : '')
                        + (data.errors_total ? `, не подошло ${data.errors_total}: ${data.errors[0].message}` : '') });
            } else if (data.duplicate) {
                scanFail();
                message.warning('Этот код уже отсканирован');
            } else {
                scanOk();
                message.open({ key: 'ship-marking', type: 'success', duration: 2,
                    content: data.replaced_auto_code
                        ? 'Код закреплён за отгрузкой'
                        : 'Код принят' });
            }
        } catch (error) {
            scanFail();
            message.error(error?.response?.data?.detail || 'Не удалось записать код');
        }
    }, [shipmentId]);

    const lines = state?.lines || [];
    const active = scanning && lines.length > 0 && status !== 'cancelled';
    useBarcodeScanner(onScan, active);

    if (!lines.length) return null;

    const removeScan = async (scan) => {
        try {
            setState((await deleteShipmentMarkingScan(shipmentId, scan.id)).data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось убрать скан');
        }
    };
    const autoAssign = async () => {
        setBusy(true);
        try {
            const { data } = await autoAssignShipmentMarkingCodes(shipmentId);
            setState(data.state);
            message.success(`Назначено кодов: ${data.assigned}`);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось назначить коды');
        } finally {
            setBusy(false);
        }
    };
    const submitManual = () => { void onScan(manual); setManual(''); };
    const posted = status === 'posted';
    const missing = state.expected - state.assigned;
    const unscanned = state.expected - state.scanned;

    return (
        <Card
            size="small"
            style={{ marginTop: 16 }}
            title={<Space><BarcodeOutlined />Коды маркировки</Space>}
            extra={(
                <Space>
                    <GisMtTokenTag />
                    {status !== 'cancelled' && <Text type="secondary">Сканер</Text>}
                    {status !== 'cancelled' && <Switch checked={scanning} onChange={setScanning} />}
                </Space>
            )}
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                <Space size={4} wrap>
                    <Tag>нужно {state.expected}</Tag>
                    <Tag color={unscanned ? 'orange' : 'green'}>отсканировано {state.scanned}</Tag>
                    {posted && <Tag color={missing ? 'red' : 'green'}>в УПД пойдёт {state.assigned}</Tag>}
                </Space>
                {posted && missing > 0 && (
                    <Alert
                        type="error"
                        showIcon
                        message={`Не хватает кодов: ${missing}. Отсканируйте коды собранных штук.`}
                    />
                )}
                {posted && missing <= 0 && unscanned > 0 && (
                    <Alert
                        type="warning"
                        showIcon
                        message="Часть кодов назначена автоматически и не подтверждена сканом"
                        description="В УПД могут уйти коды не тех штук, что лежат в посылке. Отсканируйте собранные штуки — код заменится на отсканированный."
                    />
                )}
                {!posted && status === 'draft' && (
                    <Text type="secondary">
                        Отсканированные коды закрепятся за отгрузкой при проведении.
                        {!state.auto_fifo && ' Автоназначение выключено: в УПД пойдут только отсканированные коды.'}
                    </Text>
                )}
                {scanning && (
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            value={manual}
                            onChange={(event) => setManual(event.target.value)}
                            placeholder="Код маркировки сканером или вручную"
                            onPressEnter={submitManual}
                        />
                        <Button onClick={submitManual}>OK</Button>
                    </Space.Compact>
                )}
                <Table
                    size="small"
                    pagination={false}
                    rowKey="item_id"
                    dataSource={lines}
                    expandable={{
                        rowExpandable: (row) => row.scans.length > 0 || row.unscanned_codes.length > 0,
                        expandedRowRender: (row) => (
                            <Space direction="vertical" size={2}>
                                {row.scans.map((scan) => (
                                    <Space key={scan.id} size={4}>
                                        <Tag color="green">скан</Tag>
                                        <Text code style={{ fontSize: 12 }}>{scan.code}</Text>
                                        <Button size="small" type="link" onClick={() => void removeScan(scan)}>
                                            убрать
                                        </Button>
                                    </Space>
                                ))}
                                {row.unscanned_codes.map((code) => (
                                    <Space key={code} size={4}>
                                        <Tag color="orange">авто</Tag>
                                        <Text code style={{ fontSize: 12 }}>{code}</Text>
                                    </Space>
                                ))}
                            </Space>
                        ),
                    }}
                    columns={[
                        {
                            title: 'Позиция',
                            render: (_, row) => (
                                <><Text strong>{row.brand} {row.oem}</Text><br />{row.name}</>
                            ),
                        },
                        { title: 'Штук', dataIndex: 'quantity', width: 80 },
                        {
                            title: 'Отсканировано',
                            width: 130,
                            render: (_, row) => (
                                <Tag color={row.scanned >= row.quantity ? 'green' : (row.scanned ? 'orange' : 'default')}>
                                    {row.scanned}/{row.quantity}
                                </Tag>
                            ),
                        },
                        ...(posted ? [{
                            title: 'В УПД',
                            width: 100,
                            render: (_, row) => (
                                <Tag color={row.assigned === row.quantity ? 'green' : 'red'}>
                                    {row.assigned}/{row.quantity}
                                </Tag>
                            ),
                        }] : []),
                    ]}
                />
                {posted && isAdmin && missing > 0 && (
                    <Popconfirm
                        title="Назначить недостающие коды автоматически?"
                        description="Будут взяты первые свободные коды партии. Они могут не совпасть с кодами штук в посылке."
                        okText="Назначить"
                        cancelText="Отмена"
                        onConfirm={autoAssign}
                    >
                        <Button loading={busy}>Назначить автоматически</Button>
                    </Popconfirm>
                )}
            </Space>
        </Card>
    );
};

export default ShipmentMarkingScan;
