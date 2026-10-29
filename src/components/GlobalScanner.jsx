import React, { useCallback, useState } from 'react';
import { Button, Descriptions, Modal, Select, message } from 'antd';
import { useNavigate } from 'react-router-dom';

import api from '../api.js';
import { searchAutopartsByOem } from '../api/autoparts';
import { useBarcodeScanner } from '../utils/useBarcodeScanner';

const KIND_TITLES = {
    shipment_box: 'Коробка реализации',
    own_label: 'Этикетка сборки со склада',
    cross_docking_label: 'Этикетка кросс-докинга',
    production_label: 'Этикетка производственной волны',
    stock_package: 'Коробка клиента',
    autopart: 'Товар',
    autopart_choice: 'Несколько товаров с таким артикулом',
};

// Универсальный поиск: скан в любом месте, где страница сама сканер не ждёт.
const GlobalScanner = () => {
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [unknown, setUnknown] = useState(null);

    const search = async (q) => {
        if (!q || q.length < 2) return;
        try {
            const res = await searchAutopartsByOem(q, 30);
            setUnknown((prev) => prev && ({ ...prev, options: (res.data || []).map((ap) => ({
                value: ap.id,
                label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
            })) }));
        } catch { /* ignore */ }
    };
    const bind = async () => {
        try {
            await api.post('/scan/alias', { code: unknown.code, autopart_id: unknown.picked });
            message.success('Код привязан к товару');
            setUnknown(null);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось привязать код');
        }
    };

    const onScan = useCallback(async (code) => {
        try {
            const response = await api.get('/scan/resolve', { params: { code } });
            setResult({ code, ...response.data });
        } catch (error) {
            if (error?.response?.status === 404) setUnknown({ code, options: [], picked: null });
            else message.warning(error?.response?.data?.detail || 'Не удалось распознать код');
        }
    }, []);
    useBarcodeScanner(onScan, true, { fallback: true });

    return <><Modal open={!!unknown} title="Код не найден"
        okText="Привязать" okButtonProps={{ disabled: !unknown?.picked }}
        onOk={bind} onCancel={() => setUnknown(null)}>
        <p>Код <b>{unknown?.code}</b> пока неизвестен. Найдите товар по артикулу, и этот код
            будет находить его сразу.</p>
        <Select showSearch filterOption={false} style={{ width: '100%' }}
            placeholder="Артикул товара" options={unknown?.options || []}
            onSearch={search} onChange={(value) => setUnknown((prev) => ({ ...prev, picked: value }))} />
    </Modal><Modal open={!!result} title={KIND_TITLES[result?.kind] || 'Штрихкод'}
        onCancel={() => setResult(null)}
        footer={[
            <Button key="close" onClick={() => setResult(null)}>Закрыть</Button>,
            <Button key="open" type="primary" onClick={() => {
                const route = result.route;
                setResult(null);
                navigate(route);
            }}>Открыть</Button>,
        ]}>
        {result?.kind === 'autopart_choice' && result.options.map((option) =>
            <div key={option.autopart_id}>{option.brand} {option.oem} — {option.name}</div>)}
        {result && <Descriptions size="small" column={1} items={[
            { key: 'title', label: 'Что это', children: result.title },
            { key: 'code', label: 'Код', children: result.code },
            ...(result.quantity ? [{ key: 'qty', label: 'Количество', children: `${result.quantity} шт.` }] : []),
            ...(result.location ? [{ key: 'loc', label: 'Место', children: result.location }] : []),
            ...(result.customer_name ? [{ key: 'cust', label: 'Клиент', children: result.customer_name }] : []),
            ...(result.order_number ? [{ key: 'ord', label: 'Заказ', children: result.order_number }] : []),
            ...(result.cancelled ? [{ key: 'cn', label: 'Статус', children: 'Сборка по этикетке отменена' }] : []),
        ]} />}
    </Modal></>;
};

export default GlobalScanner;
