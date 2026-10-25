import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, ConfigProvider, DatePicker, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import './CustomerOrderAssemblyPage.css';
import 'dayjs/locale/ru';
import JsBarcode from 'jsbarcode';
import { getCustomerById, getCustomersSummary } from '../api/customers';
import { getPrintJob } from '../api/printJobs';

import {
    approveExactStockSwitch,
    cancelOwnStockLabel,
    createAssemblyRealization,
    getCustomerAssemblyPage,
    getOwnStockLabels,
    keepCrossSource,
    previewAssemblyRealization,
    printOwnStockLabels,
    reprintOwnStockLabel,
    updateCrossPicksBulk,
} from '../api/customerOrders';
import { buildLabelPrintDocument, escapeHtml } from '../utils/labelPrint';
import { buildCustomLabelDocument, usePrintForm } from '../utils/printFormTemplates';
import { usePrintDelivery } from '../utils/usePrintDelivery';

const { Text, Title } = Typography;
dayjs.locale('ru');
const money = (value) => Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const ACTION_LABELS = {
    check_source: 'Проверить источник',
    accept_receipt: 'Принять поступление',
    print_own_labels: 'Этикетки нашего склада',
    print_supplier_labels: 'Этикетки поставщика',
    create_realization: 'Готово к реализации',
    await_supplier: 'Ждём поставщика',
    await_stock: 'Нет свободного остатка',
};
const PRINT_STATUS_LABELS = {
    pending: 'в очереди', claimed: 'обрабатывается',
    printed: 'передано принтеру', error: 'ошибка печати',
};
const defaultAssemblyDates = () => {
    const today = dayjs().startOf('day');
    return [today.subtract(today.day() === 1 ? 3 : 1, 'day'), today];
};
const ASSEMBLY_FILTER_KEY = 'customer-assembly-filters';
const readAssemblyFilters = () => {
    const source = window.location.search || window.sessionStorage.getItem(ASSEMBLY_FILTER_KEY) || '';
    const params = new URLSearchParams(source);
    const fallbackDates = defaultAssemblyDates();
    const from = params.get('date_from');
    const to = params.get('date_to');
    return {
        view: params.get('view') === 'dates' ? 'dates' : 'work',
        customerGroup: ['Retail', 'all'].includes(params.get('customer_group'))
            ? params.get('customer_group') : 'Wholesale',
        customerId: Number(params.get('customer_id')) || null,
        dateRange: from && to && dayjs(from).isValid() && dayjs(to).isValid()
            ? [dayjs(from), dayjs(to)] : fallbackDates,
        query: params.get('search') || '',
        locationFilter: Number(params.get('location_id')) || null,
        activeTab: params.get('tab') === 'own' ? 'own' : 'orders',
        page: Math.max(1, Number(params.get('page')) || 1),
    };
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
    const [initialFilters] = useState(readAssemblyFilters);
    const [searchParams, setSearchParams] = useSearchParams();
    const printForm = usePrintForm('own_stock');
    const { printHtml, printers } = usePrintDelivery();
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [total, setTotal] = useState(0);
    const loadRequestId = useRef(0);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [customerGroup, setCustomerGroup] = useState(initialFilters.customerGroup);
    const [customerId, setCustomerId] = useState(initialFilters.customerId);
    const [dateRange, setDateRange] = useState(initialFilters.dateRange);
    const [view, setView] = useState(initialFilters.view);
    const [activeTab, setActiveTab] = useState(initialFilters.activeTab);
    const [page, setPage] = useState(initialFilters.page);
    const [query, setQuery] = useState(initialFilters.query);
    const [serverQuery, setServerQuery] = useState(initialFilters.query);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerOptions, setCustomerOptions] = useState([]);
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [focusedOrderId, setFocusedOrderId] = useState(null);
    const [selectedStockIds, setSelectedStockIds] = useState([]);
    const [locationFilter, setLocationFilter] = useState(initialFilters.locationFilter);
    const [labelModal, setLabelModal] = useState(null);
    const [preview, setPreview] = useState(null);
    const [printJob, setPrintJob] = useState(null);
    const [lastPrintJobId, setLastPrintJobId] = useState(() =>
        Number(window.sessionStorage.getItem('customer-assembly-print-job')) || null);
    const [crossPickInputs, setCrossPickInputs] = useState({});

    const load = useCallback(async () => {
        const requestId = ++loadRequestId.current;
        setLoading(true);
        try {
            const params = { view, page, page_size: 50 };
            if (customerGroup !== 'all') {
                params.customer_group = customerGroup === 'Retail' ? 'retail' : 'wholesale';
            }
            if (customerId) params.customer_id = customerId;
            if (view === 'dates' && dateRange?.length === 2) {
                params.date_from = dateRange[0].format('YYYY-MM-DD');
                params.date_to = dateRange[1].format('YYYY-MM-DD');
            }
            if (serverQuery.trim()) params.search = serverQuery.trim();
            const response = await getCustomerAssemblyPage(params);
            if (requestId === loadRequestId.current) {
                setOrders(response.data?.items || []);
                setTotal(response.data?.total || 0);
            }
        } catch (error) {
            if (requestId === loadRequestId.current) {
                message.error(error?.response?.data?.detail || 'Не удалось загрузить комплектацию');
            }
        } finally {
            if (requestId === loadRequestId.current) setLoading(false);
        }
    }, [customerGroup, customerId, dateRange, serverQuery, view, page]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        setSelectedOrderIds([]);
        setFocusedOrderId(null);
        setSelectedStockIds([]);
    }, [customerGroup, customerId, dateRange, serverQuery, view, page]);

    useEffect(() => {
        if (query === serverQuery) return undefined;
        const timer = window.setTimeout(() => {
            setPage(1);
            setServerQuery(query);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [query, serverQuery]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (view === 'dates') params.set('view', 'dates');
        if (customerGroup !== 'Wholesale') params.set('customer_group', customerGroup);
        if (customerId) params.set('customer_id', customerId);
        if (dateRange?.length === 2) {
            params.set('date_from', dateRange[0].format('YYYY-MM-DD'));
            params.set('date_to', dateRange[1].format('YYYY-MM-DD'));
        }
        if (query.trim()) params.set('search', query.trim());
        if (locationFilter) params.set('location_id', locationFilter);
        if (activeTab !== 'orders') params.set('tab', activeTab);
        if (page > 1) params.set('page', page);
        const next = params.toString();
        window.sessionStorage.setItem(ASSEMBLY_FILTER_KEY, next);
        if (next !== searchParams.toString()) setSearchParams(params, { replace: true });
    }, [view, customerGroup, customerId, dateRange, query, locationFilter,
        activeTab, page, searchParams, setSearchParams]);

    useEffect(() => {
        let cancelled = false;
        const group = customerGroup === 'all' ? undefined
            : customerGroup === 'Retail' ? 'retail' : 'wholesale';
        const timer = window.setTimeout(() => getCustomersSummary({
            page: 1, page_size: 50, customer_group: group,
            ...(customerSearch.trim() ? { search: customerSearch.trim() } : {}),
        }).then(({ data }) => {
            if (!cancelled) {
                const rows = data?.items || [];
                setCustomerOptions((previous) => {
                    const selected = previous.find((row) => row.value === customerId);
                    return [
                        ...(selected && !rows.some((row) => row.id === selected.value)
                            ? [selected] : []),
                        ...rows.map((row) => ({ value: row.id, label: row.name })),
                    ];
                });
            }
        }).catch(() => {}), 250);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [customerGroup, customerSearch, customerId]);

    useEffect(() => {
        if (!customerId || customerOptions.some((row) => row.value === customerId)) return;
        let cancelled = false;
        getCustomerById(customerId).then(({ data }) => {
            if (!cancelled) setCustomerOptions((rows) => [
                { value: data.id, label: data.name }, ...rows,
            ]);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [customerId, customerOptions]);

    useEffect(() => {
        if (!lastPrintJobId) return undefined;
        let cancelled = false;
        const refresh = () => getPrintJob(lastPrintJobId).then(({ data }) => {
            if (!cancelled) setPrintJob(data);
        }).catch(() => {});
        void refresh();
        if (['printed', 'error'].includes(printJob?.status)) {
            return () => { cancelled = true; };
        }
        const timer = window.setInterval(refresh, 5000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [lastPrintJobId, printJob?.status]);

    const customers = useMemo(() => [...customerOptions]
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')), [customerOptions]);

    const visibleOrders = orders;

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
            customerLabelName: order.customer_label_name || order.customer_name,
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

    const openPreview = async () => {
        const ids = selectedOrderIds.length ? selectedOrderIds : focused ? [focused.id] : [];
        if (!ids.length) { message.warning('Выберите заказ клиента'); return; }
        setBusy(true);
        try {
            const response = await previewAssemblyRealization(ids);
            setPreview({ ...response.data, orderIds: ids });
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось подготовить предпросмотр');
        } finally { setBusy(false); }
    };

    const makeDraft = async () => {
        if (!preview?.orderIds?.length) return;
        setBusy(true);
        try {
            const response = await createAssemblyRealization(preview.orderIds);
            message.success('Черновик реализации создан');
            setPreview(null);
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
        const labels = [];
        try {
            for (let offset = 0; offset < ids.length; offset += 200) {
                const response = await printOwnStockLabels(ids.slice(offset, offset + 200), locationFilter);
                labels.push(...(response.data || []));
            }
            if (!labels.length) {
                popup?.close();
                message.info('Нет свободного остатка для новых этикеток');
            } else {
                const result = await printHtml(labelHtml(labels, printForm), 'Этикетки отбора · наш склад', () => {
                    popup.document.open();
                    popup.document.write(labelHtml(labels, printForm));
                    popup.document.close();
                    return true;
                });
                if (result.queued) {
                    setPrintJob(result.job);
                    setLastPrintJobId(result.job.id);
                    window.sessionStorage.setItem('customer-assembly-print-job', result.job.id);
                }
                message.success(`Создано ${labels.length} этикеток. ${result.queued
                    ? 'Проверяйте состояние задания печати ниже.'
                    : 'Проверьте печать в открытом окне.'}`);
                setSelectedStockIds([]);
                await load();
            }
        } catch (error) {
            popup?.close();
            message.error(labels.length
                ? `Создано ${labels.length} этикеток, но печать не завершена. Откройте этикетки позиции и повторите печать. ${error?.message || ''}`
                : error?.response?.data?.detail || 'Не удалось подготовить этикетки');
            await load();
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
                customer_name: row.customerLabelName || row.customerName, order_number: row.orderNumber,
            }], printForm);
            const result = await printHtml(html, `Повторная этикетка #${label.id}`, () => {
                popup.document.write(html);
                popup.document.close();
                return true;
            });
            if (result.queued) {
                setPrintJob(result.job);
                setLastPrintJobId(result.job.id);
                window.sessionStorage.setItem('customer-assembly-print-job', result.job.id);
            }
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
            let remaining = Number(quantity);
            const updates = rows.map((row) => {
                const take = Math.min(remaining, row.quantity);
                remaining -= take;
                return { id: row.id, picked_quantity: take };
            });
            await updateCrossPicksBulk(updates);
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
            await updateCrossPicksBulk(rows.map((row) => ({
                id: row.id, picked_quantity: row.quantity,
            })));
            await load();
            setCrossPickInputs({});
            message.success('Полученные позиции отмечены');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось принять все позиции');
        } finally { setBusy(false); }
    };

    const decideSourceSwitch = async (row, useExact) => {
        setBusy(true);
        try {
            if (useExact) {
                await approveExactStockSwitch(row.id);
                message.success('Для заказа выбран поступивший товар');
            } else {
                await keepCrossSource(row.id);
                message.info('В заказе оставлен выбранный товар');
            }
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось изменить источник');
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
        { title: 'В реализациях', render: (_, row) => row.counts.committed || 0 },
        { title: 'К реализации', render: (_, row) => <Tag color="green">{row.counts.ready || 0}</Tag> },
        { title: 'Следующий шаг', render: (_, row) => (row.actions || []).length
            ? row.actions.map((action) => <Tag key={action} color={action === 'create_realization' ? 'green' : 'blue'}>
                {ACTION_LABELS[action] || action}
            </Tag>) : <Text type="secondary">Действий нет</Text> },
    ];

    const detailColumns = [
        { title: 'Заказ', dataIndex: 'order_number', width: 110 },
        { title: 'Позиция', render: (_, row) => <><Text strong>{row.brand} {row.oem}</Text><br /><Text type="secondary">{row.name}</Text>
            {row.actual_oem && row.actual_oem !== row.oem && <div><Text type="secondary">Подобрано: {row.actual_brand} {row.actual_oem}</Text></div>}
            {row.source_switch?.status === 'switched' && <div><Tag color="green">
                {row.source_switch.basis === 'exact' ? 'После прихода выбран исходный артикул'
                    : row.source_switch.basis === 'published_dragonzap_cross'
                        ? 'После прихода выбран кросс из прайса клиента'
                        : 'После прихода выбран подтверждённый кросс Dragonzap'}
            </Tag></div>}
            {row.source_switch?.status === 'blocked' && <div>
                <Tag color="orange">Проверьте источник: {row.source_switch.reason}</Tag>
                <Space size="small">
                    <Button size="small" disabled={busy} onClick={() => decideSourceSwitch(row, true)}>Выбрать поступивший</Button>
                    <Button size="small" disabled={busy} onClick={() => decideSourceSwitch(row, false)}>Оставить выбранный</Button>
                </Space>
            </div>}
        </> },
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
        { title: 'Место отбора', render: (_, row) => {
            if (row.location) {
                return <>{row.location}{row.location_split && <Tag style={{ marginLeft: 6 }}>несколько мест</Tag>}</>;
            }
            const printed = [...new Set((row.printed_locations || []).map((location) => location.name).filter(Boolean))].join(', ');
            if (Number(row.remaining) <= 0 && Number(row.labeled) > 0) {
                return <Text type="success">Собрано{printed ? ` (${printed})` : ''}</Text>;
            }
            if (Number(row.labeled) > 0) {
                return <Text type="warning">Собрано {row.labeled} из {row.quantity}, остатка для остального нет</Text>;
            }
            return <Text type="danger">Нет свободного остатка</Text>;
        } },
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
            <Segmented value={view} onChange={(value) => {
                setView(value);
                setPage(1);
            }} options={[
                { value: 'work', label: 'Требуют действия' },
                { value: 'dates', label: 'По датам заказа' },
            ]} />
            <Segmented value={customerGroup} onChange={(value) => {
                setOrders([]);
                setCustomerOptions([]);
                setCustomerGroup(value);
                setCustomerId(null);
                setPage(1);
            }} options={[
                { value: 'Wholesale', label: 'Оптовые клиенты' },
                { value: 'all', label: 'Все клиенты' },
                { value: 'Retail', label: 'Розничные клиенты' },
            ]} />
            <Select allowClear showSearch filterOption={false} style={{ width: 260 }}
                placeholder="Клиент" options={customers} value={customerId}
                onSearch={setCustomerSearch}
                onChange={(value) => { setCustomerId(value || null); setPage(1); setSelectedOrderIds([]); }} />
            {view === 'dates' && <ConfigProvider locale={ruRU}>
                <DatePicker.RangePicker value={dateRange} onChange={(value) => {
                    setDateRange(value); setPage(1);
                }} format="DD.MM.YYYY" />
            </ConfigProvider>}
            <Input.Search style={{ width: 270 }} allowClear placeholder="Заказ или артикул"
                value={query} onChange={(event) => setQuery(event.target.value)} />
        </Space>
        {printJob && <Alert style={{ marginBottom: 16 }} showIcon
            type={printJob.status === 'printed' ? 'success'
                : printJob.status === 'error' ? 'error' : 'warning'}
            message={`Печать этикеток · задание #${printJob.id}: ${PRINT_STATUS_LABELS[printJob.status] || printJob.status}`}
            description={printJob.error || (printJob.status === 'printed'
                ? 'Компьютер печати сообщил об успешной передаче принтеру.'
                : 'Этикетки уже учтены как собранные. Проверьте печать перед реализацией.')}
        />}
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'orders', label: 'Заказы клиентов', children: <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Card size="small" title="Заказы клиентов" extra={<Button type="primary" disabled={busy || !selectedOrderIds.length && !focused}
                    onClick={openPreview}>Создать черновик реализации</Button>}>
                    <Table rowKey="id" size="small" loading={loading} dataSource={visibleOrders} columns={orderColumns}
                        scroll={{ x: 1700, y: 300 }} pagination={{ current: page, pageSize: 50, total,
                            showTotal: (count) => `${count} заказов` }}
                        onChange={(pagination) => setPage(pagination.current)}
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
                <Alert showIcon type="info" message="Количество считается собранным при создании этикетки. Состояние задания печати показано выше; повторная печать не увеличивает собранное количество." />
                <Space wrap>
                    <Select allowClear showSearch optionFilterProp="label" placeholder="Место хранения"
                        style={{ width: 240 }} value={locationFilter}
                        onChange={(value) => { setLocationFilter(value || null); setSelectedStockIds([]); }}
                        options={locations} />
                    <Button icon={<PrinterOutlined />} loading={busy} onClick={() => printLabels(visibleOwnRows.map((row) => row.id))}>
                        Печать по заказам текущей страницы
                    </Button>
                    <Button type="primary" icon={<PrinterOutlined />} loading={busy} disabled={!selectedStockIds.length}
                        onClick={() => printLabels(selectedStockIds)}>Печать выбранных</Button>
                </Space>
                <Table rowKey="id" size="small" loading={loading} columns={ownColumns}
                    dataSource={visibleOwnRows} pagination={{ pageSize: 40 }} scroll={{ x: 1100 }}
                    rowClassName={(row) => (!row.location && Number(row.labeled) > 0
                        ? (Number(row.remaining) <= 0 ? 'assembly-row-done' : 'assembly-row-partial') : '')}
                    rowSelection={{ selectedRowKeys: selectedStockIds, onChange: setSelectedStockIds,
                        getCheckboxProps: (row) => ({ disabled: row.remaining <= 0
                            || !row.location || (locationFilter && !(row.location_choices || [])
                                .some((location) => location.id === locationFilter)) }) }} />
            </Space> },
        ]} />
        <Modal open={!!preview} title={`Предпросмотр реализации · ${preview?.customer_name || ''}`}
            width={900} onCancel={() => setPreview(null)} onOk={makeDraft}
            okText="Создать черновик" okButtonProps={{ disabled: !preview?.ready_total }}
            confirmLoading={busy}>
            <Space style={{ marginBottom: 12 }} wrap>
                <Tag color="green">Готово сейчас: {preview?.ready_total || 0} шт.</Tag>
                <Tag>Останется на следующие реализации: {preview?.remaining_total || 0} шт.</Tag>
            </Space>
            <Table rowKey="item_id"
                size="small" pagination={{ pageSize: 20 }} dataSource={preview?.lines || []}
                columns={[
                    { title: 'Заказ', dataIndex: 'order_number' },
                    { title: 'Позиция', render: (_, row) => `${row.brand} ${row.oem}` },
                    { title: 'Заказано', dataIndex: 'ordered' },
                    { title: 'Уже в реализациях', dataIndex: 'committed' },
                    { title: 'В новый черновик', dataIndex: 'ready' },
                    { title: 'Останется', dataIndex: 'remaining_after_draft' },
                ]} />
        </Modal>
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
