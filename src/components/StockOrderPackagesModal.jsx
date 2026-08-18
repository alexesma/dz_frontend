import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Row,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    InboxOutlined,
    LockOutlined,
    PlusOutlined,
    PrinterOutlined,
    ScanOutlined,
    UnlockOutlined,
} from '@ant-design/icons';
import Barcode from 'react-barcode';

import {
    createStockOrderPackage,
    deleteStockOrderPackage,
    getStockOrderPacking,
    printStockOrderPackageLabel,
    reopenStockOrderPackage,
    scanStockOrderPackage,
    sealStockOrderPackage,
    updateStockOrderPackageContents,
    verifyStockOrderPackage,
} from '../api/customerOrders';

const { Text, Title } = Typography;

const STATUS_META = {
    open: { color: 'gold', label: 'Открыта' },
    sealed: { color: 'blue', label: 'Закрыта · идёт проверка' },
    verified: { color: 'green', label: 'Проверена' },
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const buildPrintHtml = (packing, box, barcodeHtml) => `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Коробка ${box.sequence_number}</title>
  <style>
    @page { size: 58mm 40mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #111; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .label { width: 58mm; height: 40mm; padding: 2.2mm 2.5mm 1.5mm;
      display: flex; flex-direction: column; overflow: hidden; }
    .customer { font-size: 12pt; font-weight: 900; line-height: 1.05;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .box { font-size: 15pt; font-weight: 900; margin-top: 1mm; }
    .order { font-size: 7pt; margin-top: .8mm; }
    .meta { font-size: 7pt; font-weight: 700; margin-top: .5mm; }
    .barcode { height: 13mm; margin-top: .5mm; display: flex;
      justify-content: center; overflow: hidden; }
    .barcode svg { max-width: 100%; height: 12.5mm; }
    .code { font: 6pt "Courier New", monospace; text-align: center; margin-top: -.5mm; }
    @media screen { body { background: #eef2f7; padding: 12px; }
      .label { background: #fff; margin: auto; box-shadow: 0 8px 24px #0002; } }
  </style>
</head>
<body>
  <section class="label">
    <div class="customer">${escapeHtml(packing.customer_name || 'Клиент')}</div>
    <div class="box">Коробка ${box.sequence_number} / ${box.total_packages}</div>
    <div class="order">Складской заказ #${packing.stock_order_id}</div>
    <div class="meta">Позиций: ${box.items.length} · Количество: ${box.total_quantity} шт.</div>
    <div class="barcode">${barcodeHtml}</div>
    <div class="code">${escapeHtml(box.barcode)}</div>
  </section>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

const StockOrderPackagesModal = ({ orderId, open, onClose, onChanged }) => {
    const [packing, setPacking] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [scanValues, setScanValues] = useState({});
    const [contentsPackage, setContentsPackage] = useState(null);
    const [allocations, setAllocations] = useState({});
    const [reasonAction, setReasonAction] = useState(null);
    const [reason, setReason] = useState('');
    const barcodeRefs = useRef({});

    const load = useCallback(async () => {
        if (!orderId || !open) return;
        setLoading(true);
        try {
            const response = await getStockOrderPacking(orderId);
            setPacking(response.data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить коробки');
        } finally {
            setLoading(false);
        }
    }, [open, orderId]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyResponse = (response) => {
        setPacking(response.data);
        onChanged?.();
    };

    const runAction = async (action, successText) => {
        setActionLoading(true);
        try {
            const response = await action();
            applyResponse(response);
            if (successText) message.success(successText);
            return response.data;
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Операция не выполнена');
            return null;
        } finally {
            setActionLoading(false);
        }
    };

    const createBox = (packAll) => runAction(
        () => createStockOrderPackage(orderId, { pack_all_unallocated: packAll }),
        packAll ? 'Заказ помещён в новую коробку' : 'Пустая коробка создана'
    );

    const openContents = (box) => {
        const current = Object.fromEntries(
            (box.items || []).map((item) => [item.stock_order_item_id, item.quantity])
        );
        setAllocations(current);
        setContentsPackage(box);
    };

    const saveContents = async () => {
        const items = Object.entries(allocations).map(([itemId, quantity]) => ({
            stock_order_item_id: Number(itemId),
            quantity: Number(quantity || 0),
        }));
        const result = await runAction(
            () => updateStockOrderPackageContents(contentsPackage.id, { items }),
            'Состав коробки сохранён'
        );
        if (result) setContentsPackage(null);
    };

    const handleScan = async (box) => {
        const code = String(scanValues[box.id] || '').trim();
        if (!code) return;
        const result = await runAction(
            () => scanStockOrderPackage(box.id, code),
            `Проверено: ${code}`
        );
        if (result) {
            setScanValues((prev) => ({ ...prev, [box.id]: '' }));
        }
    };

    const executePrint = async (box, printReason = null) => {
        const printWindow = window.open('', '_blank', 'width=480,height=640');
        if (!printWindow) {
            message.error('Браузер заблокировал окно печати');
            return;
        }
        const barcodeHtml = barcodeRefs.current[box.id]?.innerHTML || '';
        printWindow.document.write(buildPrintHtml(packing, box, barcodeHtml));
        printWindow.document.close();
        const result = await runAction(
            () => printStockOrderPackageLabel(box.id, printReason),
            `Этикетка коробки ${box.sequence_number} передана на печать`
        );
        if (result) {
            setReasonAction(null);
            setReason('');
        }
    };

    const requestPrint = (box) => {
        if (Number(box.print_count || 0) > 0) {
            setReasonAction({ type: 'print', box });
            setReason('');
            return;
        }
        void executePrint(box);
    };

    const executeReasonAction = async () => {
        if (!reasonAction || !reason.trim()) return;
        if (reasonAction.type === 'print') {
            await executePrint(reasonAction.box, reason.trim());
            return;
        }
        const result = await runAction(
            () => reopenStockOrderPackage(reasonAction.box.id, reason.trim()),
            `Коробка ${reasonAction.box.sequence_number} переоткрыта`
        );
        if (result) {
            setReasonAction(null);
            setReason('');
        }
    };

    const packages = packing?.packages || [];
    const unallocated = (packing?.items || []).filter(
        (item) => Number(item.unallocated_quantity || 0) > 0
    );

    return (
        <>
            <Modal
                title={`Коробки клиента · складской заказ #${orderId || '—'}`}
                open={open}
                onCancel={onClose}
                footer={<Button onClick={onClose}>Закрыть</Button>}
                width={1050}
            >
                {loading || !packing ? (
                    <div style={{ padding: 32, textAlign: 'center' }}>Загрузка…</div>
                ) : (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Alert
                            type={packing.packing_ready ? 'success' : 'info'}
                            showIcon
                            message={packing.packing_ready
                                ? 'Все коробки проверены · заказ готов к отгрузке'
                                : 'Распределите весь собранный товар и проверьте закрытые коробки'}
                            description={`${packing.customer_name || 'Клиент'} · коробок: ${packages.length} · не распределено строк: ${unallocated.length}`}
                        />
                        <Space wrap>
                            <Button
                                type="primary"
                                icon={<InboxOutlined />}
                                disabled={!unallocated.length || actionLoading}
                                onClick={() => void createBox(true)}
                            >
                                Всё оставшееся в новую коробку
                            </Button>
                            <Button
                                icon={<PlusOutlined />}
                                disabled={actionLoading}
                                onClick={() => void createBox(false)}
                            >
                                Пустая коробка
                            </Button>
                        </Space>
                        {unallocated.length > 0 && (
                            <Card size="small" title="Ещё не распределено">
                                <Space wrap>
                                    {unallocated.map((item) => (
                                        <Tag key={item.stock_order_item_id} color="orange">
                                            {item.customer_brand || item.actual_brand || ''}{' '}
                                            {item.customer_oem || item.actual_oem || '—'} ·{' '}
                                            {item.unallocated_quantity} шт.
                                        </Tag>
                                    ))}
                                </Space>
                            </Card>
                        )}
                        {!packages.length ? (
                            <Empty description="Коробки пока не созданы" />
                        ) : packages.map((box) => {
                            const meta = STATUS_META[box.status] || STATUS_META.open;
                            const progress = box.total_quantity
                                ? Math.round(box.verified_quantity * 100 / box.total_quantity)
                                : 0;
                            return (
                                <Card
                                    key={box.id}
                                    size="small"
                                    title={(
                                        <Space wrap>
                                            <Title level={5} style={{ margin: 0 }}>
                                                Коробка {box.sequence_number}/{box.total_packages}
                                            </Title>
                                            <Tag color={meta.color}>{meta.label}</Tag>
                                            <Text code>{box.barcode}</Text>
                                        </Space>
                                    )}
                                    extra={(
                                        <Space wrap>
                                            <Button
                                                icon={<PrinterOutlined />}
                                                onClick={() => requestPrint(box)}
                                            >
                                                Этикетка{box.print_count ? ` · ${box.print_count}` : ''}
                                            </Button>
                                            {box.status === 'open' && (
                                                <>
                                                    <Button icon={<EditOutlined />} onClick={() => openContents(box)}>
                                                        Состав
                                                    </Button>
                                                    <Button
                                                        type="primary"
                                                        icon={<LockOutlined />}
                                                        onClick={() => void runAction(
                                                            () => sealStockOrderPackage(box.id),
                                                            `Коробка ${box.sequence_number} закрыта`
                                                        )}
                                                    >
                                                        Закрыть
                                                    </Button>
                                                    <Popconfirm
                                                        title="Удалить открытую коробку?"
                                                        onConfirm={() => void runAction(
                                                            () => deleteStockOrderPackage(box.id),
                                                            'Коробка удалена'
                                                        )}
                                                    >
                                                        <Button danger icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                </>
                                            )}
                                            {box.status !== 'open' && (
                                                <Button
                                                    icon={<UnlockOutlined />}
                                                    onClick={() => {
                                                        setReasonAction({ type: 'reopen', box });
                                                        setReason('');
                                                    }}
                                                >
                                                    Переоткрыть
                                                </Button>
                                            )}
                                        </Space>
                                    )}
                                >
                                    <div style={{ position: 'absolute', left: -10000, top: -10000 }}>
                                        <div ref={(node) => {
                                            if (node) barcodeRefs.current[box.id] = node;
                                        }}>
                                            <Barcode
                                                value={box.barcode}
                                                format="CODE128"
                                                width={1}
                                                height={42}
                                                fontSize={0}
                                                margin={0}
                                            />
                                        </div>
                                    </div>
                                    <Row gutter={16}>
                                        <Col xs={24} md={16}>
                                            <Table
                                                rowKey="id"
                                                size="small"
                                                pagination={false}
                                                dataSource={box.items || []}
                                                columns={[
                                                    {
                                                        title: 'Позиция клиента',
                                                        render: (_, item) => (
                                                            <>
                                                                <Text strong>
                                                                    {item.customer_brand || ''}{' '}
                                                                    {item.customer_oem || item.actual_oem || '—'}
                                                                </Text>
                                                                <br />
                                                                <Text type="secondary">{item.name || '—'}</Text>
                                                            </>
                                                        ),
                                                    },
                                                    { title: 'В коробке', dataIndex: 'quantity', width: 90 },
                                                    {
                                                        title: 'Проверено',
                                                        width: 110,
                                                        render: (_, item) => (
                                                            <Tag color={item.verified_quantity === item.quantity ? 'green' : 'gold'}>
                                                                {item.verified_quantity}/{item.quantity}
                                                            </Tag>
                                                        ),
                                                    },
                                                ]}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            {box.status === 'sealed' && (
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <Text strong>Финальная скан-проверка</Text>
                                                    <Input
                                                        autoFocus
                                                        prefix={<ScanOutlined />}
                                                        placeholder="Штрихкод или артикул"
                                                        value={scanValues[box.id] || ''}
                                                        onChange={(event) => setScanValues((prev) => ({
                                                            ...prev,
                                                            [box.id]: event.target.value,
                                                        }))}
                                                        onPressEnter={() => void handleScan(box)}
                                                    />
                                                    <Progress percent={progress} size="small" />
                                                    <Button
                                                        type="primary"
                                                        block
                                                        icon={<CheckCircleOutlined />}
                                                        disabled={progress !== 100}
                                                        onClick={() => void runAction(
                                                            () => verifyStockOrderPackage(box.id),
                                                            `Коробка ${box.sequence_number} проверена`
                                                        )}
                                                    >
                                                        Подтвердить коробку
                                                    </Button>
                                                </Space>
                                            )}
                                            {box.status === 'verified' && (
                                                <Alert
                                                    type="success"
                                                    showIcon
                                                    message="Содержимое подтверждено"
                                                    description={box.verified_by_name || 'Сотрудник склада'}
                                                />
                                            )}
                                        </Col>
                                    </Row>
                                </Card>
                            );
                        })}
                    </Space>
                )}
            </Modal>

            <Modal
                title={`Состав коробки ${contentsPackage?.sequence_number || ''}`}
                open={Boolean(contentsPackage)}
                okText="Сохранить состав"
                cancelText="Отмена"
                confirmLoading={actionLoading}
                onOk={() => void saveContents()}
                onCancel={() => setContentsPackage(null)}
                width={760}
            >
                <Table
                    rowKey="stock_order_item_id"
                    size="small"
                    pagination={false}
                    dataSource={packing?.items || []}
                    columns={[
                        {
                            title: 'Позиция',
                            render: (_, item) => (
                                <>
                                    <Text strong>
                                        {item.customer_brand || item.actual_brand || ''}{' '}
                                        {item.customer_oem || item.actual_oem || '—'}
                                    </Text>
                                    <br />
                                    <Text type="secondary">{item.name || '—'}</Text>
                                </>
                            ),
                        },
                        {
                            title: 'Доступно',
                            width: 100,
                            render: (_, item) => (
                                Number(item.unallocated_quantity || 0)
                                + Number(allocations[item.stock_order_item_id] || 0)
                            ),
                        },
                        {
                            title: 'В коробке',
                            width: 130,
                            render: (_, item) => {
                                const current = Number(
                                    allocations[item.stock_order_item_id] || 0
                                );
                                const max = Number(item.unallocated_quantity || 0) + current;
                                return (
                                    <InputNumber
                                        min={0}
                                        max={max}
                                        value={current}
                                        onChange={(value) => setAllocations((prev) => ({
                                            ...prev,
                                            [item.stock_order_item_id]: Number(value || 0),
                                        }))}
                                    />
                                );
                            },
                        },
                    ]}
                />
            </Modal>

            <Modal
                title={reasonAction?.type === 'print'
                    ? 'Причина повторной печати'
                    : 'Причина переоткрытия коробки'}
                open={Boolean(reasonAction)}
                okText={reasonAction?.type === 'print' ? 'Напечатать' : 'Переоткрыть'}
                cancelText="Отмена"
                confirmLoading={actionLoading}
                okButtonProps={{ disabled: !reason.trim() }}
                onOk={() => void executeReasonAction()}
                onCancel={() => { setReasonAction(null); setReason(''); }}
            >
                <Input.TextArea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Укажите причину для истории действий"
                />
            </Modal>
        </>
    );
};

export default StockOrderPackagesModal;
