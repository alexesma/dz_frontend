import React, { useCallback, useState } from 'react';
import { Button, Descriptions, Modal, message } from 'antd';
import { useNavigate } from 'react-router-dom';

import api from '../api.js';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';

const KIND_TITLES = {
    shipment_box: 'Коробка реализации',
    own_label: 'Этикетка сборки со склада',
    cross_docking_label: 'Этикетка кросс-докинга',
    production_label: 'Этикетка производственной волны',
    stock_package: 'Коробка клиента',
    autopart: 'Товар',
};

// Универсальный поиск: скан в любом месте, где страница сама сканер не ждёт.
const GlobalScanner = () => {
    const navigate = useNavigate();
    const [result, setResult] = useState(null);

    const onScan = useCallback(async (code) => {
        try {
            const response = await api.get('/scan/resolve', { params: { code } });
            setResult({ code, ...response.data });
        } catch (error) {
            message.warning(error?.response?.status === 404
                ? `Код ${code} не найден`
                : (error?.response?.data?.detail || 'Не удалось распознать код'));
        }
    }, []);
    useBarcodeScanner(onScan, true, { fallback: true });

    return <Modal open={!!result} title={KIND_TITLES[result?.kind] || 'Штрихкод'}
        onCancel={() => setResult(null)}
        footer={[
            <Button key="close" onClick={() => setResult(null)}>Закрыть</Button>,
            <Button key="open" type="primary" onClick={() => {
                const route = result.route;
                setResult(null);
                navigate(route);
            }}>Открыть</Button>,
        ]}>
        {result && <Descriptions size="small" column={1} items={[
            { key: 'title', label: 'Что это', children: result.title },
            { key: 'code', label: 'Код', children: result.code },
            ...(result.quantity ? [{ key: 'qty', label: 'Количество', children: `${result.quantity} шт.` }] : []),
            ...(result.location ? [{ key: 'loc', label: 'Место', children: result.location }] : []),
            ...(result.customer_name ? [{ key: 'cust', label: 'Клиент', children: result.customer_name }] : []),
            ...(result.order_number ? [{ key: 'ord', label: 'Заказ', children: result.order_number }] : []),
            ...(result.cancelled ? [{ key: 'cn', label: 'Статус', children: 'Сборка по этикетке отменена' }] : []),
        ]} />}
    </Modal>;
};

export default GlobalScanner;
