import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Input,
    Modal,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import Barcode from 'react-barcode';
import dayjs from 'dayjs';

import {
    listProductionWaveLabels,
    markProductionWaveLabelsPrinted,
} from '../api/inventory';

const { Text, Title } = Typography;
const LABEL_WIDTH_MM = 58;
const LABEL_HEIGHT_MM = 40;

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const buildPrintHtml = (labels, barcodeHtml) => `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Этикетки волны DragonZap</title>
  <style>
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .label {
      width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm;
      padding: 2mm 2.5mm 1.5mm; overflow: hidden;
      display: flex; flex-direction: column; break-after: page;
      page-break-after: always;
    }
    .label:last-child { break-after: auto; page-break-after: auto; }
    .top { display: flex; justify-content: space-between; gap: 2mm; }
    .brand { font-size: 9pt; font-weight: 900; text-transform: uppercase; }
    .seq { font-size: 6pt; white-space: nowrap; }
    .oem { font-size: 13pt; line-height: 1.05; font-weight: 900; margin-top: .5mm;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { height: 6.5mm; font-size: 6.5pt; line-height: 1.1; margin-top: .7mm; overflow: hidden; }
    .meta { display: flex; justify-content: space-between; gap: 2mm; font-size: 6.2pt; font-weight: 700; }
    .order { font-size: 5.8pt; margin-top: .4mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .barcode { height: 10mm; margin-top: .5mm; display: flex; justify-content: center; overflow: hidden; }
    .barcode svg { max-width: 100%; height: 9.5mm; }
    .code { font: 5.5pt "Courier New", monospace; text-align: center; margin-top: -.3mm; }
    @media screen { body { background: #eef2f7; padding: 12px; }
      .label { background: #fff; margin: 0 auto 12px; box-shadow: 0 8px 24px #0002; } }
  </style>
</head>
<body>
${labels.map((label) => `
  <section class="label">
    <div class="top"><div class="brand">${escapeHtml(label.requested_brand)}</div>
      <div class="seq">${label.sequence_number}/${label.total_labels}</div></div>
    <div class="oem">${escapeHtml(label.requested_oem)}</div>
    <div class="name">${escapeHtml(label.requested_name || '')}</div>
    <div class="meta"><span>Кол-во: ${label.quantity}</span><span>${escapeHtml(label.customer_name || '')}</span></div>
    <div class="order">Заказ ${escapeHtml(label.order_number || '—')}${label.order_date ? ` · ${dayjs(label.order_date).format('DD.MM.YYYY')}` : ''}</div>
    <div class="barcode">${barcodeHtml[label.id] || ''}</div>
    <div class="code">${escapeHtml(label.barcode)}</div>
  </section>`).join('\n')}
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

const ProductionWaveLabels = ({ waveId, enabled, onSummaryChange }) => {
    const [labels, setLabels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [reasonOpen, setReasonOpen] = useState(false);
    const [reason, setReason] = useState('');
    const barcodeRefs = useRef({});

    const load = useCallback(async () => {
        if (!waveId || !enabled) return;
        setLoading(true);
        try {
            const response = await listProductionWaveLabels(waveId);
            const rows = response.data || [];
            setLabels(rows);
            setSelectedIds(rows.map((row) => row.id));
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить этикетки');
        } finally {
            setLoading(false);
        }
    }, [enabled, waveId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!enabled) {
            onSummaryChange?.(null);
            return;
        }
        onSummaryChange?.({
            total: labels.length,
            printed: labels.filter((label) => Number(label.print_count || 0) > 0).length,
            pending: labels.filter((label) => Number(label.print_count || 0) === 0).length,
        });
    }, [enabled, labels, onSummaryChange]);

    const selected = labels.filter((label) => selectedIds.includes(label.id));

    const executePrint = async (printReason = null) => {
        if (!selected.length) {
            message.warning('Выберите этикетки');
            return;
        }
        const barcodeHtml = {};
        selected.forEach((label) => {
            barcodeHtml[label.id] = barcodeRefs.current[label.id]?.innerHTML || '';
        });
        const printWindow = window.open('', '_blank', 'width=480,height=640');
        if (!printWindow) {
            message.error('Браузер заблокировал окно печати');
            return;
        }
        printWindow.document.write(buildPrintHtml(selected, barcodeHtml));
        printWindow.document.close();
        setPrinting(true);
        try {
            const response = await markProductionWaveLabelsPrinted(waveId, {
                label_ids: selected.map((label) => label.id),
                reason: printReason,
            });
            setLabels(response.data || []);
            setReasonOpen(false);
            setReason('');
            message.success(`Передано на печать: ${selected.length} этик.`);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось записать историю печати');
        } finally {
            setPrinting(false);
        }
    };

    const requestPrint = () => {
        if (selected.some((label) => Number(label.print_count || 0) > 0)) {
            setReasonOpen(true);
            return;
        }
        void executePrint();
    };

    if (!enabled) {
        return <Alert type="info" showIcon message="Этикетки появятся после фиксации плана волны" />;
    }

    return (
        <div style={{ marginTop: 24 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Этикетки 58×40</Title>
                    <Text type="secondary">
                        Создаются по заказанным клиентом бренду и артикулу · напечатано{' '}
                        {labels.filter((label) => Number(label.print_count || 0) > 0).length}/{labels.length}
                    </Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => void load()}>Обновить</Button>
                    <Button
                        type="primary"
                        icon={<PrinterOutlined />}
                        loading={printing}
                        disabled={!selectedIds.length}
                        onClick={requestPrint}
                    >
                        Печать · {selectedIds.length}
                    </Button>
                </Space>
            </Space>
            <div style={{ position: 'absolute', left: -10000, top: -10000 }}>
                {labels.map((label) => (
                    <div key={label.id} ref={(node) => { if (node) barcodeRefs.current[label.id] = node; }}>
                        <Barcode value={label.barcode} format="CODE128" width={1} height={35} fontSize={0} margin={0} />
                    </div>
                ))}
            </div>
            <Table
                rowKey="id"
                size="small"
                loading={loading}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                dataSource={labels}
                rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
                expandable={{
                    rowExpandable: (row) => Boolean(row.print_history?.length),
                    expandedRowRender: (row) => (
                        <Space direction="vertical" size={2}>
                            {(row.print_history || []).map((event) => (
                                <Text key={event.id} type="secondary">
                                    Печать №{event.print_number} · {dayjs(event.printed_at).format('DD.MM.YYYY HH:mm')} · {event.printed_by_name || '—'}
                                    {event.reason ? ` · ${event.reason}` : ''}
                                </Text>
                            ))}
                        </Space>
                    ),
                }}
                scroll={{ x: 900 }}
                columns={[
                    { title: 'Клиент', dataIndex: 'customer_name' },
                    { title: 'Заказ', dataIndex: 'order_number' },
                    { title: 'Позиция', render: (_, row) => <><Text strong>{row.requested_brand} {row.requested_oem}</Text><br /><Text type="secondary">{row.requested_name}</Text></> },
                    { title: 'Этикетка', render: (_, row) => `${row.sequence_number}/${row.total_labels}`, width: 95 },
                    { title: 'Кол-во', dataIndex: 'quantity', width: 80 },
                    { title: 'Печать', render: (_, row) => row.print_count ? <Tag color="green">Напечатана · {row.print_count}</Tag> : <Tag>Ожидает</Tag>, width: 150 },
                    { title: 'Последняя печать', render: (_, row) => row.last_printed_at ? `${dayjs(row.last_printed_at).format('DD.MM.YY HH:mm')} · ${row.last_printed_by_name || '—'}` : '—', width: 190 },
                ]}
            />
            <Modal
                title="Причина повторной печати"
                open={reasonOpen}
                okText="Повторно напечатать"
                cancelText="Отмена"
                okButtonProps={{ disabled: !reason.trim() }}
                confirmLoading={printing}
                onOk={() => void executePrint(reason.trim())}
                onCancel={() => { setReasonOpen(false); setReason(''); }}
            >
                <Alert type="warning" showIcon message="Часть выбранных этикеток уже печаталась" style={{ marginBottom: 12 }} />
                <Input.TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: этикетка повреждена при упаковке" />
            </Modal>
        </div>
    );
};

export default ProductionWaveLabels;
