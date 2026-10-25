import React from 'react';
import { Button, Dropdown, message } from 'antd';
import { DownOutlined, FileTextOutlined } from '@ant-design/icons';

import { getShipmentPrintUrl } from '../api/inventory';
import { SHIPMENT_DOCUMENTS } from '../utils/shipmentDocuments';
import { usePrintDelivery } from '../utils/usePrintDelivery';

const ShipmentPrintMenu = ({ shipmentId, docNumber, size, disabled }) => {
    const { printUrl } = usePrintDelivery('a4');

    const run = async (entry, mode) => {
        const url = getShipmentPrintUrl(shipmentId, entry.kind, entry.params);
        try {
            if (mode === 'view') {
                if (!window.open(url, '_blank')) message.error('Браузер заблокировал окно');
                return;
            }
            await printUrl(url, `${entry.short} ${docNumber || shipmentId}`);
        } catch (error) {
            message.error(error?.message || 'Не удалось подготовить печать');
        }
    };

    const items = [
        { key: 'g-print', type: 'group', label: 'Печать', children: SHIPMENT_DOCUMENTS.map((entry) => ({
            key: `print:${entry.key}`, label: entry.title,
        })) },
        { type: 'divider' },
        { key: 'g-view', type: 'group', label: 'Открыть на экране', children: SHIPMENT_DOCUMENTS.map((entry) => ({
            key: `view:${entry.key}`, label: entry.short,
        })) },
    ];

    return <Dropdown disabled={disabled} trigger={['click']} menu={{
        items,
        onClick: ({ key }) => {
            const [mode, ...rest] = String(key).split(':');
            const entry = SHIPMENT_DOCUMENTS.find((row) => row.key === rest.join(':'));
            if (entry) void run(entry, mode);
        },
    }}>
        <Button size={size} icon={<FileTextOutlined />}>Документы <DownOutlined /></Button>
    </Dropdown>;
};

export default ShipmentPrintMenu;
