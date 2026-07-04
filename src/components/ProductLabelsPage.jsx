import React, { useCallback, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Input,
    InputNumber,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    BarcodeOutlined,
    DeleteOutlined,
    PlusOutlined,
    PrinterOutlined,
} from '@ant-design/icons';
import Barcode from 'react-barcode';

import { getAutopartDetail, searchAutopartsByOem } from '../api/autoparts';

const { Text, Title } = Typography;

const LABEL_WIDTH_MM = 58;
const LABEL_HEIGHT_MM = 40;

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalizeLabelPart = (part = {}) => {
    const brand = part.brand_name || part.brand || '';
    const oem = part.oem_number || '';
    return {
        id: part.id,
        brand_name: brand,
        oem_number: oem,
        name: part.name || '',
        barcode: part.barcode || `${brand} ${oem}`.trim(),
    };
};

const buildPrintHtml = (rows, barcodeHtmlByRowKey) => {
    const labels = [];
    rows.forEach((row) => {
        const copies = Math.max(1, Number(row.copies || 1));
        const barcodeHtml = barcodeHtmlByRowKey[row.key] || '';
        for (let index = 0; index < copies; index += 1) {
            labels.push(`
                <section class="label">
                    <div class="brand">${escapeHtml(row.brand_name || '—')}</div>
                    <div class="oem">${escapeHtml(row.oem_number || '—')}</div>
                    <div class="name">${escapeHtml(row.name || '')}</div>
                    <div class="barcode">${barcodeHtml}</div>
                    <div class="barcode-text">${escapeHtml(row.barcode || '')}</div>
                </section>
            `);
        }
    });

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Печать этикеток ${LABEL_WIDTH_MM}×${LABEL_HEIGHT_MM}</title>
  <style>
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      padding: 2.5mm 3mm 2mm;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }
    .label:last-child { break-after: auto; page-break-after: auto; }
    .brand {
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 0.4mm;
      text-transform: uppercase;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .oem {
      font-size: 14pt;
      font-weight: 900;
      line-height: 1.05;
      margin-top: 0.8mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .name {
      font-size: 7.2pt;
      line-height: 1.15;
      min-height: 8mm;
      max-height: 8mm;
      margin-top: 1mm;
      overflow: hidden;
    }
    .barcode {
      height: 12mm;
      margin-top: 1mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .barcode svg {
      max-width: 100%;
      height: 12mm;
    }
    .barcode-text {
      font-family: "Courier New", monospace;
      font-size: 6.5pt;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.5mm;
    }
    @media screen {
      body { background: #eef2f7; padding: 12px; }
      .label { background: #fff; margin: 0 auto 12px; box-shadow: 0 8px 24px rgba(15,23,42,.16); }
    }
  </style>
</head>
<body>
  ${labels.join('\n')}
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;
};

const ProductLabelsPage = () => {
    const [searchValue, setSearchValue] = useState('');
    const [options, setOptions] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [copies, setCopies] = useState(1);
    const [manual, setManual] = useState({
        brand_name: '',
        oem_number: '',
        name: '',
        barcode: '',
    });
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const barcodeRefs = useRef({});
    const searchTimerRef = useRef(null);

    const searchParts = useCallback((value) => {
        setSearchValue(value);
        if (searchTimerRef.current) {
            window.clearTimeout(searchTimerRef.current);
        }
        const query = String(value || '').trim();
        if (query.length < 2) {
            setOptions([]);
            return;
        }
        searchTimerRef.current = window.setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await searchAutopartsByOem(query, 30);
                setOptions((data || []).map((part) => ({
                    value: part.id,
                    label: `${part.brand || part.brand_name || '—'} ${part.oem_number} · ${part.name || 'Без названия'}`,
                    part,
                })));
            } catch (err) {
                console.error('Autopart label search failed', err);
                message.error('Не удалось выполнить поиск запчастей');
            } finally {
                setLoading(false);
            }
        }, 250);
    }, []);

    const addRow = useCallback((part, rowCopies = copies) => {
        const normalized = normalizeLabelPart(part);
        if (!normalized.oem_number && !normalized.barcode) {
            message.warning('Укажите артикул или штрихкод');
            return;
        }
        const key = `${normalized.id || 'manual'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setRows((prev) => [
            ...prev,
            {
                ...normalized,
                key,
                copies: Math.max(1, Number(rowCopies || 1)),
            },
        ]);
    }, [copies]);

    const handleAddSelected = async () => {
        const option = options.find((item) => item.value === selectedId);
        if (!option) {
            message.warning('Выберите позицию из поиска');
            return;
        }
        let part = option.part;
        try {
            const { data } = await getAutopartDetail(selectedId);
            part = data || part;
        } catch {
            // Search result is enough; detail only enriches barcode.
        }
        addRow(part);
        setSelectedId(null);
        setSearchValue('');
        setOptions([]);
    };

    const handleAddManual = () => {
        addRow({
            ...manual,
            barcode: manual.barcode || `${manual.brand_name} ${manual.oem_number}`.trim(),
        });
        setManual({ brand_name: '', oem_number: '', name: '', barcode: '' });
    };

    const updateRow = (key, patch) => {
        setRows((prev) => prev.map((row) => (
            row.key === key ? { ...row, ...patch } : row
        )));
    };

    const removeRow = (key) => {
        setRows((prev) => prev.filter((row) => row.key !== key));
        delete barcodeRefs.current[key];
    };

    const handlePrint = () => {
        if (!rows.length) {
            message.warning('Добавьте хотя бы одну этикетку');
            return;
        }
        const barcodeHtmlByRowKey = {};
        rows.forEach((row) => {
            barcodeHtmlByRowKey[row.key] = barcodeRefs.current[row.key]?.innerHTML || '';
        });
        const printWindow = window.open('', '_blank', 'width=480,height=640');
        if (!printWindow) {
            message.error('Браузер заблокировал окно печати');
            return;
        }
        printWindow.document.write(buildPrintHtml(rows, barcodeHtmlByRowKey));
        printWindow.document.close();
    };

    const columns = [
        {
            title: 'Позиция',
            key: 'part',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.brand_name || '—'} {row.oem_number || '—'}</Text>
                    <Text type="secondary" ellipsis style={{ maxWidth: 420 }}>
                        {row.name || 'Без названия'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Штрихкод',
            dataIndex: 'barcode',
            width: 220,
            render: (_, row) => (
                <Input
                    value={row.barcode}
                    onChange={(event) => updateRow(row.key, { barcode: event.target.value })}
                />
            ),
        },
        {
            title: 'Копий',
            dataIndex: 'copies',
            width: 110,
            render: (_, row) => (
                <InputNumber
                    min={1}
                    max={500}
                    value={row.copies}
                    onChange={(value) => updateRow(row.key, { copies: value || 1 })}
                    style={{ width: '100%' }}
                />
            ),
        },
        {
            title: 'Превью',
            key: 'preview',
            width: 190,
            render: (_, row) => (
                <div
                    ref={(node) => {
                        if (node) barcodeRefs.current[row.key] = node;
                    }}
                    style={{ width: 160, overflow: 'hidden' }}
                >
                    <Barcode
                        value={row.barcode || `${row.brand_name} ${row.oem_number}`.trim() || 'EMPTY'}
                        format="CODE128"
                        width={1.1}
                        height={36}
                        fontSize={9}
                        margin={0}
                    />
                </div>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 70,
            render: (_, row) => (
                <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRow(row.key)}
                />
            ),
        },
    ];

    const totalLabels = rows.reduce((sum, row) => sum + Number(row.copies || 1), 0);

    return (
        <div style={{ padding: 24 }}>
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>
                        Печать этикеток товара
                    </Title>
                    <Text type="secondary">
                        Формат по умолчанию: {LABEL_WIDTH_MM}×{LABEL_HEIGHT_MM} мм, CODE128.
                    </Text>
                </div>

                <Alert
                    type="info"
                    showIcon
                    message="Печать идёт через браузер"
                    description="В настройках печати выберите термопринтер, размер бумаги 58×40 мм, масштаб 100% и минимальные поля."
                />

                <Card title="Добавить из номенклатуры">
                    <Space wrap align="start">
                        <Select
                            showSearch
                            filterOption={false}
                            value={selectedId}
                            searchValue={searchValue}
                            onSearch={searchParts}
                            onChange={setSelectedId}
                            loading={loading}
                            placeholder="Введите артикул"
                            options={options}
                            style={{ width: 520, maxWidth: '100%' }}
                            notFoundContent={loading ? 'Ищем...' : 'Ничего не найдено'}
                        />
                        <InputNumber
                            min={1}
                            max={500}
                            value={copies}
                            onChange={(value) => setCopies(value || 1)}
                            addonAfter="коп."
                            style={{ width: 130 }}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddSelected}
                        >
                            Добавить
                        </Button>
                    </Space>
                </Card>

                <Card title="Добавить вручную">
                    <Space wrap align="start">
                        <Input
                            placeholder="Бренд"
                            value={manual.brand_name}
                            onChange={(event) => setManual((prev) => ({
                                ...prev,
                                brand_name: event.target.value.toUpperCase(),
                            }))}
                            style={{ width: 160 }}
                        />
                        <Input
                            placeholder="Артикул"
                            value={manual.oem_number}
                            onChange={(event) => setManual((prev) => ({
                                ...prev,
                                oem_number: event.target.value.toUpperCase(),
                            }))}
                            style={{ width: 190 }}
                        />
                        <Input
                            placeholder="Наименование"
                            value={manual.name}
                            onChange={(event) => setManual((prev) => ({
                                ...prev,
                                name: event.target.value,
                            }))}
                            style={{ width: 320 }}
                        />
                        <Input
                            placeholder="Штрихкод, если отличается"
                            value={manual.barcode}
                            onChange={(event) => setManual((prev) => ({
                                ...prev,
                                barcode: event.target.value,
                            }))}
                            style={{ width: 240 }}
                        />
                        <Button icon={<PlusOutlined />} onClick={handleAddManual}>
                            Добавить вручную
                        </Button>
                    </Space>
                </Card>

                <Card
                    title={(
                        <Space>
                            <BarcodeOutlined />
                            <span>Очередь этикеток</span>
                            <Tag color={totalLabels ? 'blue' : 'default'}>
                                {totalLabels} шт.
                            </Tag>
                        </Space>
                    )}
                    extra={(
                        <Button
                            type="primary"
                            icon={<PrinterOutlined />}
                            onClick={handlePrint}
                            disabled={!rows.length}
                        >
                            Печать 58×40
                        </Button>
                    )}
                >
                    <Table
                        rowKey="key"
                        columns={columns}
                        dataSource={rows}
                        size="small"
                        pagination={false}
                        scroll={{ x: 900 }}
                        locale={{ emptyText: 'Добавьте позиции для печати' }}
                    />
                </Card>
            </Space>
        </div>
    );
};

export default ProductLabelsPage;
