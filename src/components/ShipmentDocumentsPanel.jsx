import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Select, Space, Tag, Typography, message } from 'antd';
import { PrinterOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { getShipmentPrintUrl, listShipmentPrintKinds, listShipments } from '../api/inventory';
import { usePrintDelivery } from '../utils/usePrintDelivery';
import { SHIPMENT_DOCUMENTS } from '../utils/shipmentDocuments';

const { Text } = Typography;

// Раздел «Печатные формы» для документов реализации: УПД, упаковочный лист,
// транспортная накладная. Форма заполняется данными выбранной реализации.
const ShipmentDocumentsPanel = () => {
    const { printUrl } = usePrintDelivery('a4');
    const [kinds, setKinds] = useState([]);
    const [options, setOptions] = useState([]);
    const [shipmentId, setShipmentId] = useState(null);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        listShipmentPrintKinds().then(({ data }) => setKinds(data || [])).catch(() => {});
    }, []);

    const search = useCallback((query = '') => {
        setLoading(true);
        listShipments({ limit: 30, doc_number: query || undefined })
            .then(({ data }) => setOptions((data || []).map((row) => ({
                value: row.id,
                label: `${row.doc_number || `#${row.id}`} · ${row.customer_name || '—'} · `
                    + `${row.doc_date ? dayjs(row.doc_date).format('DD.MM.YYYY') : ''}`
                    + `${row.status === 'draft' ? ' · черновик' : ''}`,
            }))))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { search(''); }, [search]);

    const onSearch = (value) => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => search(value), 300);
    };

    const run = async (entry, mode) => {
        if (!shipmentId) { message.warning('Выберите реализацию'); return; }
        const url = getShipmentPrintUrl(shipmentId, entry.kind, entry.params);
        try {
            if (mode === 'view') {
                if (!window.open(url, '_blank')) message.error('Браузер заблокировал окно');
                return;
            }
            await printUrl(url, `${entry.short} ${shipmentId}`);
        } catch (error) {
            message.error(error?.message || 'Не удалось подготовить печать');
        }
    };

    const basis = (kind) => kinds.find((row) => row.kind === kind)?.legal_basis;

    return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert showIcon type="info"
            message="Документы формируются по данным реализации и реквизитам из раздела «Настройки → Реквизиты организации»."
            description="Для изменения цены или количества после отгрузки откройте «Корректировки реализаций — УКД». Печать идёт на принтер A4 по умолчанию." />
        <Button href="/documents/shipment-corrections">Корректировки реализаций — УКД</Button>
        <Select showSearch allowClear filterOption={false} loading={loading}
            style={{ width: 'min(520px, 100%)' }} placeholder="Реализация: номер, клиент"
            value={shipmentId} options={options} onSearch={onSearch}
            onChange={(value) => setShipmentId(value || null)} />
        <Space wrap align="start" size="middle">
            {SHIPMENT_DOCUMENTS.map((entry) => <Card key={entry.key}
                size="small" title={entry.kind === 'upd' ? 'УПД' : entry.short} style={{ width: 340 }}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {basis(entry.kind) || ''}
                    </Text>
                    {entry.kind === 'transport_waybill' && <Tag color="orange" style={{ whiteSpace: 'normal' }}>
                        С 01.09.2026 транспортная накладная оформляется в электронном виде (ЭТрН);
                        бумажный бланк — только в случаях, допущенных Минтрансом.
                    </Tag>}
                    <Space wrap>
                        <Button type="primary" icon={<PrinterOutlined />} disabled={!shipmentId}
                            onClick={() => void run(entry, 'print')}>Печать</Button>
                        <Button icon={<EyeOutlined />} disabled={!shipmentId}
                            onClick={() => void run(entry, 'view')}>Открыть</Button>
                    </Space>
                </Space>
            </Card>)}
        </Space>
    </Space>;
};

export default ShipmentDocumentsPanel;
