import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, ConfigProvider, DatePicker, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { useNavigate } from 'react-router-dom';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import JsBarcode from 'jsbarcode';
import { fetchAllCustomersBrief } from '../api/customers';

import {
    cancelOwnStockLabel,
    createAssemblyRealization,
    getCustomerAssembly,
    getOwnStockLabels,
    printOwnStockLabels,
    reprintOwnStockLabel,
    updateStockOrderItemPick,
} from '../api/customerOrders';
import { buildLabelPrintDocument, escapeHtml } from '../utils/labelPrint';
import { buildCustomLabelDocument, usePrintForm } from '../utils/printFormTemplates';
import { usePrintDelivery } from '../utils/usePrintDelivery';

const { Text, Title } = Typography;
dayjs.locale('ru');
const money = (value) => Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const defaultAssemblyDates = () => {
    const today = dayjs().startOf('day');
    return [today.subtract(today.day() === 1 ? 3 : 1, 'day'), today];
};
const openCustomerOrder = (orderId) => {
    window.open(`/customer-orders/${orderId}`, `customer-order-${orderId}`,
        'popup=yes,width=1200,height=850,scrollbars=yes,resizable=yes');
};

const labelHtml = (labels, printForm) => printForm
    ? buildCustomLabelDocument(printForm, labels, 'Этикетки отбора · наш склад')
    : buildLabelPrintDocument({
    title: 'Этикетки отбора · наш склад',
    fieldsCss: `
        .label { padding: 2mm 2.5mm; }
        .brand { font-size: 9pt; font-weight: 900; text-transform: uppercase; }
        .oem { font-size: 13pt; font-weight: 900; }
        .name { height: 7mm; font-size: 6.5pt; overflow: hidden; }
        .meta { font-size: 7pt; font-weight: 700; }
        .barcode { height: 10mm; text-align: center; }
        .barcode svg { height: 10mm; max-width: 100%; }
        .code { font: 6pt monospace; text-align: center; }
    `,
    items: labels,
    renderLabel: (label) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, label.barcode, {
            format: 'CODE128', width: 1, height: 34, displayValue: false, margin: 0,
        });
        return `<div class="brand">${escapeHtml(label.brand)}</div>
            <div class="oem">${escapeHtml(label.oem)}</div>
            <div class="name">${escapeHtml(label.name)}</div>
            <div class="meta">${escapeHtml(label.customer_name)} · Заказ ${escapeHtml(label.order_number)}</div>
            <div class="meta">Место ${escapeHtml(label.location)} · ${label.quantity} шт.</div>
            <div class="barcode">${svg.outerHTML}</div>
            <div class="code">${escapeHtml(label.barcode)}</div>`;
    },
});

const CustomerOrderAssemblyPage = () => {
    const printForm = usePrintForm('own_stock');
    const { printHtml, printers } = usePrintDelivery();
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [customerId, setCustomerId] = useState(null);
    const [dateRange, setDateRange] = useState(defaultAssemblyDates);
    const [query, setQuery] = useState('');
    const [serverQuery, setServerQuery] = useState('');
    const [customerOptions, setCustomerOptions] = useState([]);
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [focusedOrderId, setFocusedOrderId] = useState(null);
    const [selectedStockIds, setSelectedStockIds] = useState([]);
    const [locationFilter, setLocationFilter] = useState(null);
    const [labelModal, setLabelModal] = useState(null);
    const [crossPickInputs, setCrossPickInputs] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 500 };
            if (customerId) params.customer_id = customerId;
            if (dateRange?.length === 2) {
                params.date_from = dateRange[0].format('YYYY-MM-DD');
                params.date_to = dateRange[1].format('YYYY-MM-DD');
            }
            if (serverQuery.trim()) params.search = serverQuery.trim();
            const response = await getCustomerAssembly(params);
            setOrders(response.data || []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить комплектацию');
        } finally {
            setLoading(false);
        }
    }, [customerId, dateRange, serverQuery]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        setSelectedOrderIds([]);
        setFocusedOrderId(null);
        setSelectedStockIds([]);
    }, [customerId, dateRange, serverQuery]);

    useEffect(() => {
        const timer = window.setTimeout(() => setServerQuery(query), 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        fetchAllCustomersBrief({ typePrices: 'Wholesale' }).then((rows) => {
            setCustomerOptions(rows.map((row) => ({ value: row.id, label: row.name })));
        }).catch(() => {});
    }, []);

    const customers = useMemo(() => [...customerOptions]
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')), [customerOptions]);

    const visibleOrders = useMemo(() => orders.filter((order) => {
        if (customerId && order.customer_id !== customerId) return false;
        if (dateRange && dateRange.length === 2) {
            const day = dayjs(order.received_at);
            if (day.isBefore(dateRange[0], 'day') || day.isAfter(dateRange[1], 'day')) return false;
        }
        const search = query.trim().toLowerCase();
        return !search || String(order.number).toLowerCase().includes(search)
            || order.items.some((item) => `${item.brand} ${item.oem} ${item.name || ''}`.toLowerCase().includes(search));
    }), [orders, customerId, dateRange, query]);

    const focused = visibleOrders.find((order) => order.id === focusedOrderId)
        || visibleOrders.find((order) => selectedOrderIds.includes(order.id))
        || null;
    const detailOrders = selectedOrderIds.length > 1
        ? orders.filter((order) => selectedOrderIds.includes(order.id))
        : focused ? [focused] : [];
    const detailRows = detailOrders.flatMap((order) => order.items.map((item) => ({
        ...item, key: `${order.id}-${item.id}`, order_number: order.number,
    })));
    const selectedCustomer = orders.find((order) => order.id === selectedOrderIds[0])?.customer_id;

    const ownRows = visibleOrders.flatMap((order) => order.items.flatMap((item) =>
        (item.stock_items || []).map((stock) => ({
            ...stock, key: stock.id, orderId: order.id, orderNumber: order.number,
            customerId: order.customer_id, customerName: order.customer_name,
            brand: item.brand, oem: item.oem, name: item.name,
        }))));
    const locations = [...new Map(ownRows.flatMap((row) => [
        ...(row.location_choices || []), ...(row.printed_locations || []),
    ]).map((location) => [location.id, {
        value: location.id, label: location.name,
    }])).values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    const visibleOwnRows = ownRows.filter((row) =>
        !locationFilter || [...(row.location_choices || []), ...(row.printed_locations || [])]
            .some((location) => location.id === locationFilter));

    const makeDraft = async () => {
        const ids = selectedOrderIds.length ? selectedOrderIds : focused ? [focused.id] : [];
        if (!ids.length) { message.warning('Выберите заказ клиента'); return; }
        setBusy(true);
        try {
            const response = await createAssemblyRealization(ids);
            message.success('Черновик реализации создан');
            navigate(`/warehouse/shipments/${response.data.id}`);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось создать черновик');
        } finally { setBusy(false); }
    };

    const printLabels = async (stockIds) => {
        const ids = [...new Set(stockIds)].filter((id) =>
            ownRows.some((row) => row.id === id && row.remaining > 0));
        if (!ids.length) { message.info('Все выбранные позиции уже переданы на печать'); return; }
        const direct = (printers?.label || []).some((row) => row.is_default);
        const popup = direct ? null : window.open('', '_blank', 'width=480,height=640');
        if (!direct && !popup) { message.error('Браузер заблокировал окно печати'); return; }
        popup?.document.write('<p>Подготавливаем этикетки…</p>');
        setBusy(true);
        try {
            const labels = [];
            for (let offset = 0; offset < ids.length; offset += 200) {
                const response = await printOwnStockLabels(ids.slice(offset, offset + 200), locationFilter);
                labels.push(...(response.data || []));
            }
            if (!labels.length) {
                popup?.close();
                message.info('Нет свободного остатка для новых этикеток');
            } else {
                await printHtml(labelHtml(labels, printForm), 'Этикетки отбора · наш склад', () => {
                    popup.document.open();
                    popup.document.write(labelHtml(labels, printForm));
                    popup.document.close();
                    return true;
                });
                message.success(`Передано на печать: ${labels.length} этикеток`);
                setSelectedStockIds([]);
                await load();
            }
        } catch (error) {
            popup?.close();
            message.error(error?.response?.data?.detail || 'Не удалось подготовить этикетки');
        } finally { setBusy(false); }
    };

    const openLabels = async (row) => {
        try {
            const response = await getOwnStockLabels(row.id);
            setLabelModal({ row, labels: response.data || [] });
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить этикетки');
        }
    };

    const reprint = async (label) => {
        const direct = (printers?.label || []).some((row) => row.is_default);
        const popup = direct ? null : window.open('', '_blank', 'width=480,height=640');
        if (!direct && !popup) { message.error('Браузер заблокировал окно печати'); return; }
        try {
            await reprintOwnStockLabel(label.id);
            const row = labelModal.row;
            const html = labelHtml([{
                ...label, brand: row.brand, oem: row.oem, name: row.name,
                customer_name: row.customerName, order_number: row.orderNumber,
            }], printForm);
            await printHtml(html, `Повторная этикетка #${label.id}`, () => {
                popup.document.write(html);
                popup.document.close();
                return true;
            });
            await openLabels(row);
        } catch (error) {
            popup?.close();
            message.error(error?.response?.data?.detail || error.message || 'Не удалось повторить печать');
        }
    };

    const cancelLabel = async (label) => {
        try {
            await cancelOwnStockLabel(label.id);
            message.success('Сборка по этикетке отменена');
            await openLabels(labelModal.row);
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось отменить сборку');
        }
    };

    const acceptCross = async (item, quantity) => {
        const rows = item.cross_stock_items || [];
        if (!rows.length) return;
        setBusy(true);
        try {
            let remaining = quantity;
            for (const row of rows) {
                const take = Math.min(remaining, row.quantity);
                await updateStockOrderItemPick(row.id, { picked_quantity: take });
                remaining -= take;
            }
            await load();
            setCrossPickInputs((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось изменить приёмку');
        } finally { setBusy(false); }
    };

    const acceptAllCross = async () => {
        const rows = detailRows.flatMap((item) => item.cross_stock_items || []);
        if (!rows.length) return;
        setBusy(true);
        try {
            for (const row of rows) {
                await updateStockOrderItemPick(row.id, { picked_quantity: row.quantity });
            }
            await load();
            setCrossPickInputs({});
            message.success('Полученные позиции отмечены');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось принять все позиции');
        } finally { setBusy(false); }
    };

    const orderColumns = [
        { title: 'Заказ клиента', dataIndex: 'number', render: (value, row) => (
            <a href={`/customer-orders/${row.id}`} onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openCustomerOrder(row.id);
            }}>{value}</a>
        ) },
        { title: 'Дата', dataIndex: 'received_at', render: (value) => value ? dayjs(value).format('DD.MM.YY HH:mm') : '—' },
        { title: 'Клиент', dataIndex: 'customer_name' },
        { title: 'Сумма заказа', render: (_, row) => money(row.amounts.order) },
        { title: 'Наш склад', render: (_, row) => money(row.amounts.own) },
        { title: 'Кросс-докинг', render: (_, row) => money(row.amounts.cross) },
        { title: 'Позиций', render: (_, row) => row.counts.lines || 0 },
        { title: 'Заказано, шт.', render: (_, row) => row.counts.ordered || 0 },
        { title: 'Поступило', render: (_, row) => row.counts.received || 0 },
        { title: 'Этикетки поставщика, шт.', render: (_, row) => row.counts.cross_labeled || 0 },
        { title: 'Собрано с нашего, шт.', render: (_, row) => row.counts.own_labeled || 0 },
        { title: 'К реализации', render: (_, row) => <Tag color="green">{row.counts.ready || 0}</Tag> },
    ];

    const detailColumns = [
        { title: 'Заказ', dataIndex: 'order_number', width: 110 },
        { title: 'Позиция', render: (_, row) => <><Text strong>{row.brand} {row.oem}</Text><br /><Text type="secondary">{row.name}</Text></> },
        { title: 'Цена', dataIndex: 'price', render: money },
        { title: 'Заказано', dataIndex: 'ordered' },
        { title: 'Наш склад', render: (_, row) => `${row.own_labeled}/${row.own_ordered}` },
        { title: 'Поставщик', render: (_, row) => `${row.cross_labeled}/${row.received}` },
        { title: 'Принято', render: (_, row) => (row.cross_stock_items || []).reduce((sum, item) => sum + Number(item.picked_quantity || 0), 0) },
        { title: 'В реализациях', dataIndex: 'committed' },
        { title: 'Готово', dataIndex: 'ready', render: (value) => <Tag color={value ? 'green' : 'default'}>{value}</Tag> },
        { title: 'Приёмка', render: (_, row) => row.cross_stock_items?.length ? <Space>
            <InputNumber size="small" min={0} max={row.received} style={{ width: 75 }}
                value={crossPickInputs[row.id] ?? (row.cross_stock_items || []).reduce(
                    (sum, item) => sum + Number(item.picked_quantity || 0), 0)}
                onChange={(value) => setCrossPickInputs((prev) => ({ ...prev, [row.id]: value || 0 }))} />
            <Button size="small" disabled={busy} onClick={() => acceptCross(row,
                crossPickInputs[row.id] ?? (row.cross_stock_items || []).reduce(
                    (sum, item) => sum + Number(item.picked_quantity || 0), 0))}>Сохранить</Button>
            <Button size="small" disabled={busy} onClick={() => acceptCross(row, row.received)}>Принять всё</Button>
            <Button size="small" disabled={busy} onClick={() => acceptCross(row, 0)}>Снять</Button>
        </Space> : <Text type="secondary">По этикетке</Text> },
    ];

    const ownColumns = [
        { title: 'Клиент / заказ', render: (_, row) => <><div>{row.customerName}</div><a href={`/customer-orders/${row.orderId}`} onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openCustomerOrder(row.orderId);
        }}>{row.orderNumber}</a></> },
        { title: 'Позиция', render: (_, row) => <><Text strong>{row.brand} {row.oem}</Text><br /><Text type="secondary">{row.name}</Text></> },
        { title: 'Место отбора', render: (_, row) => row.location
            ? <>{row.location}{row.location_split && <Tag style={{ marginLeft: 6 }}>несколько мест</Tag>}</>
            : <Text type="danger">Нет свободного остатка</Text> },
        { title: 'Заказано', dataIndex: 'quantity' },
        { title: 'Этикетки / собрано', render: (_, row) => `${row.labeled}/${row.quantity}` },
        { title: 'Осталось', dataIndex: 'remaining' },
        { title: '', render: (_, row) => <Button size="small" onClick={() => openLabels(row)}>Этикетки</Button> },
    ];

    return <div style={{ padding: 24 }}>
        <Space style={{ marginBottom: 16 }} wrap>
            <Title level={4} style={{ margin: 0 }}>Комплектация заказов клиентов</Title>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
        </Space>
        <Space style={{ marginBottom: 16 }} wrap>
            <Select allowClear showSearch optionFilterProp="label" style={{ width: 260 }}
                placeholder="Клиент" options={customers} value={customerId}
                onChange={(value) => { setCustomerId(value || null); setSelectedOrderIds([]); }} />
            <ConfigProvider locale={ruRU}>
                <DatePicker.RangePicker value={dateRange} onChange={setDateRange} format="DD.MM.YYYY" />
            </ConfigProvider>
            <Input.Search style={{ width: 270 }} allowClear placeholder="Заказ или артикул"
                value={query} onChange={(event) => setQuery(event.target.value)} />
        </Space>
        <Tabs items={[
            { key: 'orders', label: 'Заказы клиентов', children: <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Card size="small" title="Заказы клиентов" extra={<Button type="primary" disabled={busy || !selectedOrderIds.length && !focused}
                    onClick={makeDraft}>Создать черновик реализации</Button>}>
                    <Table rowKey="id" size="small" loading={loading} dataSource={visibleOrders} columns={orderColumns}
                        scroll={{ x: 1500, y: 300 }} pagination={{ pageSize: 20 }}
                        onRow={(row) => ({ onClick: () => setFocusedOrderId(row.id) })}
                        rowSelection={{ selectedRowKeys: selectedOrderIds,
                            getCheckboxProps: (row) => ({ disabled: !!selectedCustomer && row.customer_id !== selectedCustomer }),
                            onChange: setSelectedOrderIds }} />
                </Card>
                <Card size="small" title="Позиции выбранного заказа"
                    extra={<Button size="small" disabled={busy || !detailRows.some((row) => row.cross_stock_items?.length)}
                        onClick={acceptAllCross}>Принять все полученные</Button>}>
                    {detailRows.length ? <Table rowKey="key" size="small" columns={detailColumns}
                        dataSource={detailRows} pagination={{ pageSize: 30 }} scroll={{ x: 1200, y: 380 }} />
                        : <Text type="secondary">Выберите заказ в верхней таблице.</Text>}
                </Card>
            </Space> },
            { key: 'own', label: 'Наш склад: заказы', children: <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert showIcon type="info" message="Собранное количество фиксируется при передаче этикетки на печать. Повторная печать его не увеличивает." />
                <Space wrap>
                    <Select allowClear showSearch optionFilterProp="label" placeholder="Место хранения"
                        style={{ width: 240 }} value={locationFilter}
                        onChange={(value) => { setLocationFilter(value || null); setSelectedStockIds([]); }}
                        options={locations} />
                    <Button icon={<PrinterOutlined />} loading={busy} onClick={() => printLabels(visibleOwnRows.map((row) => row.id))}>
                        Печать всех по фильтрам
                    </Button>
                    <Button type="primary" icon={<PrinterOutlined />} loading={busy} disabled={!selectedStockIds.length}
                        onClick={() => printLabels(selectedStockIds)}>Печать выбранных</Button>
                </Space>
                <Table rowKey="id" size="small" loading={loading} columns={ownColumns}
                    dataSource={visibleOwnRows} pagination={{ pageSize: 40 }} scroll={{ x: 1100 }}
                    rowSelection={{ selectedRowKeys: selectedStockIds, onChange: setSelectedStockIds,
                        getCheckboxProps: (row) => ({ disabled: row.remaining <= 0
                            || !row.location || (locationFilter && !(row.location_choices || [])
                                .some((location) => location.id === locationFilter)) }) }} />
            </Space> },
        ]} />
        <Modal open={!!labelModal} title="Этикетки позиции" footer={null}
            onCancel={() => setLabelModal(null)}>
            {(labelModal?.labels || []).length ? (labelModal?.labels || []).map((label) =>
                <Card key={label.id} size="small" style={{ marginBottom: 8 }}>
                    <Space wrap>
                        <Text>{label.location} · {label.quantity} шт. · {label.barcode}</Text>
                        <Button size="small" onClick={() => reprint(label)}>Повторить печать</Button>
                        <Button size="small" danger onClick={() => Modal.confirm({
                            title: 'Отменить сборку по этикетке?',
                            onOk: () => cancelLabel(label),
                        })}>Отменить сборку</Button>
                    </Space>
                </Card>) : <Text type="secondary">Этикеток ещё нет</Text>}
        </Modal>
    </div>;
};

export default CustomerOrderAssemblyPage;
