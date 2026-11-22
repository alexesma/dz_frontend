/**
 * ImportedShipmentLines — строки реализации, загруженной из УПД Диадока.
 *
 * Для каждой строки видно, с какой позицией номенклатуры она связана (бренд,
 * артикул, название), что написано в УПД, НДС, ГТД, страну и коды маркировки.
 * Строки, которые не удалось сопоставить уверенно (артикул есть у другого
 * товара или не найден), стоят отдельным списком «на сопоставление».
 */
import React, { useRef, useState } from 'react';
import { Alert, Button, Card, Popover, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { CheckCircleOutlined, QrcodeOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../api';
import { searchAutopartsByOem } from '../api/autoparts';
import { OpenProductButton } from './AutopartPopup';

const { Text } = Typography;

const money = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// НДС строки: из УПД, а если его там нет — считаем из суммы с НДС и ставки.
const lineVat = (row) => {
    if (row.import_vat_amount != null) return Number(row.import_vat_amount);
    const gross = Number(row.price || 0) * row.quantity;
    const rate = Number(row.vat_rate || 0);
    if (!gross) return null;
    return gross - gross / (1 + rate / 100);
};

const CodesTag = ({ codes }) => {
    const list = codes || [];
    if (!list.length) return <Text type="secondary">—</Text>;
    return (
        <Popover
            title={`Коды маркировки (${list.length})`}
            content={<div style={{ maxHeight: 260, overflow: 'auto', fontSize: 12 }}>{list.map((c) => <div key={c}>{c}</div>)}</div>}
        >
            <Tag icon={<QrcodeOutlined />} color="blue" style={{ cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>{list.length}</Tag>
        </Popover>
    );
};

const ReviewTable = ({ shipment, onChanged }) => {
    const [options, setOptions] = useState([]);
    const [picked, setPicked] = useState({});
    const [saving, setSaving] = useState(null);
    const timer = useRef(null);

    const search = (q) => {
        clearTimeout(timer.current);
        if (!q || q.length < 2) { setOptions([]); return; }
        timer.current = setTimeout(async () => {
            try {
                const res = await searchAutopartsByOem(q, 30);
                setOptions((res.data || []).map((ap) => ({
                    value: ap.id,
                    label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
                })));
            } catch { /* ignore */ }
        }, 300);
    };

    const match = async (index) => {
        const autopartId = picked[index];
        if (!autopartId) { message.warning('Выберите позицию номенклатуры'); return; }
        setSaving(index);
        try {
            await api.post(`/inventory/shipments/${shipment.id}/import-review/${index}/match`, { autopart_id: autopartId });
            message.success('Строка сопоставлена');
            setPicked({});
            onChanged();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось сопоставить');
        } finally {
            setSaving(null);
        }
    };

    const rows = (shipment.import_review || []).map((line, index) => ({ ...line, index }));
    return (
        <Card
            size="small"
            style={{ marginBottom: 12, borderColor: '#faad14' }}
            title={<Space><WarningOutlined style={{ color: '#faad14' }} />На сопоставление: {rows.length}</Space>}
        >
            <Table
                size="small"
                rowKey="index"
                pagination={false}
                tableLayout="fixed"
                className="compact-table"
                dataSource={rows}
                columns={[
                    { title: 'Артикул', dataIndex: 'article', width: 120, render: (v) => <Text strong>{v || '—'}</Text> },
                    { title: 'Название в УПД', dataIndex: 'name', width: '30%', ellipsis: true, render: (v) => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v}</Text></Tooltip> },
                    { title: 'Кол', dataIndex: 'quantity', width: 46, align: 'right' },
                    { title: 'Цена', dataIndex: 'price', width: 84, align: 'right', render: money },
                    { title: 'ГТД', dataIndex: 'gtd', width: 130, ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
                    { title: 'Маркировка', dataIndex: 'marking_codes', width: 110, render: (v) => <CodesTag codes={v} /> },
                    {
                        title: 'Позиция в системе',
                        width: 330,
                        render: (_, row) => (
                            <Space.Compact style={{ width: '100%' }}>
                                <Select
                                    showSearch
                                    filterOption={false}
                                    placeholder="Найти по артикулу"
                                    style={{ width: '100%' }}
                                    options={options}
                                    value={picked[row.index]}
                                    onSearch={search}
                                    onChange={(v) => setPicked((p) => ({ ...p, [row.index]: v }))}
                                />
                                <Button type="primary" style={{ flex: "none" }} loading={saving === row.index} onClick={() => match(row.index)}>
                                    Связать
                                </Button>
                            </Space.Compact>
                        ),
                    },
                ]}
            />
        </Card>
    );
};

const ImportedShipmentLines = ({ shipment, onChanged }) => {
    const items = shipment.items || [];
    const total = items.reduce((sum, it) => sum + Number(it.price || 0) * it.quantity, 0);
    const vatTotal = items.reduce((sum, it) => sum + (lineVat(it) || 0), 0);

    const one = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
    const columns = [
        { title: '№', width: 34, render: (_, __, i) => <Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Text> },
        {
            title: 'Позиция в нашей системе',
            width: '25%',
            render: (_, row) => (
                <div style={{ minWidth: 0 }}>
                    <div style={one}>
                        <Tooltip title={row.import_match === 'manual' ? 'Сопоставлено вручную' : 'Артикул и название совпали'}>
                            <CheckCircleOutlined style={{ color: row.import_match === 'manual' ? '#1677ff' : '#52c41a', marginRight: 6 }} />
                        </Tooltip>
                        <Text strong>{row.stock_autopart_oem}</Text>
                        {row.stock_autopart_brand && <Tag style={{ margin: '0 0 0 6px', fontSize: 11 }}>{row.stock_autopart_brand}</Tag>}
                        <OpenProductButton autopartId={row.autopart_id} onSaved={onChanged} />
                    </div>
                    <Tooltip title={row.stock_autopart_name}>
                        <div style={{ ...one, fontSize: 12, color: '#8c8c8c' }}>{row.stock_autopart_name}</div>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: 'Как в УПД',
            width: '17%',
            render: (_, row) => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ ...one, fontSize: 12 }}>{row.import_article || row.customer_oem}</div>
                    <Tooltip title={row.customer_name}>
                        <div style={{ ...one, fontSize: 12, color: '#8c8c8c' }}>{row.customer_name}</div>
                    </Tooltip>
                </div>
            ),
        },
        { title: 'Кол', dataIndex: 'quantity', width: 46, align: 'right' },
        { title: 'Цена', dataIndex: 'price', width: 80, align: 'right', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{money(v)}</span> },
        {
            title: <Tooltip title="Сумма НДС в строке, под ней ставка"><span>НДС</span></Tooltip>,
            width: 82,
            align: 'right',
            render: (_, row) => (
                <div style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12 }}>{money(lineVat(row))} ₽</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>ставка {Number(row.vat_rate)} %</div>
                </div>
            ),
        },
        { title: 'Сумма', width: 92, align: 'right', render: (_, row) => <span style={{ whiteSpace: 'nowrap' }}>{money(Number(row.price || 0) * row.quantity)}</span> },
        {
            title: 'ГТД / страна',
            width: 160,
            render: (_, row) =>
                row.import_gtd_number || row.import_country_name ? (
                    <div style={{ minWidth: 0 }}>
                        <Tooltip title={row.import_gtd_number}>
                            <div style={{ ...one, fontSize: 12 }}>{row.import_gtd_number || '—'}</div>
                        </Tooltip>
                        <div style={{ ...one, fontSize: 11, color: '#8c8c8c' }}>{row.import_country_name || row.import_country_code || ''}</div>
                    </div>
                ) : <Text type="secondary">—</Text>,
        },
        { title: 'Маркир.', dataIndex: 'import_marking_codes', width: 70, render: (v) => <CodesTag codes={v} /> },
    ];

    return (
        <>
            {(shipment.import_review || []).length > 0 && <ReviewTable shipment={shipment} onChanged={onChanged} />}
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Реализация загружена из УПД Диадока"
                description="Остатки не затронуты, в 1С и ЭДО она повторно не отправляется. Связь со строкой номенклатуры проверяется по артикулу и названию: если название не совпало, строка попадает в «На сопоставление»."
            />
            <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={items}
                columns={columns}
                tableLayout="fixed"
                className="compact-table"
                summary={() => (
                    <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}><Text strong>Итого</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><Text strong>{items.reduce((s, i) => s + i.quantity, 0)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                        <Table.Summary.Cell index={3} align="right"><Text strong>{money(vatTotal)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right"><Text strong>{money(total)}</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} colSpan={2} />
                    </Table.Summary.Row>
                )}
            />
        </>
    );
};

export default ImportedShipmentLines;
