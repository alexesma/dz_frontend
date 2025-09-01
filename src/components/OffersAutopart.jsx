// import React, { useState } from 'react';
// import { Card, Input, Button } from 'antd';
// import axios from 'axios';
//
// function OffersAutopart() {
//     const [offers, setOffers] = useState([]);
//     const [loading, setLoading] = useState(false);
//     const [oem, setOem] = useState('1003100ED01');
//     const [make, setMake] = useState('GREAT WALL');
//
//     const fetchOffers = () => {
//         setLoading(true);
//         axios
//             .get('http://0.0.0.0:8000/order/get_offers_by_oem_and_make_name', {
//                 params: {
//                     oem: oem,
//                     make_name: make,
//                     without_cross: true,
//                 },
//             })
//             .then((res) => {
//                 setOffers(res.data);
//             })
//             .catch((e) => {
//                 alert('Ошибка запроса');
//             })
//             .finally(() => setLoading(false));
//     };
//
//     return (
//         <div>
//             <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
//                 <Input value={oem} onChange={e => setOem(e.target.value)} placeholder='OEM' />
//                 <Input value={make} onChange={e => setMake(e.target.value)} placeholder='Марка' />
//                 <Button onClick={fetchOffers} loading={loading} type='primary'>
//                     Поиск
//                 </Button>
//             </div>
//             <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
//                 {offers.map((offer) => (
//                     <Card
//                         key={offer.hash_key || offer.price_name + offer.detail_name}
//                         title={offer.price_name || 'Оффер'}
//                         style={{ width: '100%', marginBottom: 20 }}
//                         extra={<span style={{ color: '#888' }}>{offer.oem}</span>}
//                     >
//                         <div style={{ fontWeight: 500, marginBottom: 8 }}>{offer.detail_name}</div>
//                         <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
//                             <span>Цена: <b>{offer.cost}</b></span>
//                             <span>Производитель: {offer.make_name}</span>
//                             <span>Логотип: {offer.sup_logo}</span>
//                         </div>
//                         <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
//                             <span>Остаток: {offer.qnt}</span>
//                             <span>Мин. заказ: {offer.min_qnt}</span>
//                         </div>
//                         <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
//                             <span>Доставка: {offer.min_delivery_day}-{offer.max_delivery_day} дней</span>
//                         </div>
//                         <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
//                             <span>Вес: {offer.weight}</span>
//                             <span>Объем: {offer.volume}</span>
//                         </div>
//                     </Card>
//                 ))}
//             </div>
//         </div>
//     );
// }
//
// export default OffersAutopart;

import React, { useEffect, useState } from 'react';
import { Table, InputNumber, Checkbox, Button, message, Spin, Tag } from 'antd';
import axios from 'axios';

const RestockOffers = () => {
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedOffers, setSelectedOffers] = useState({});

    useEffect(() => {
        fetchOffers();
    }, []);

    const fetchOffers = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://0.0.0.0:8000/order/generate_restock_offers');
            setOffers(response.data.offers);
        } catch (error) {
            console.error('Ошибка загрузки предложений:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (autopart_id, quantity) => {
        setSelectedOffers(prev => ({
            ...prev,
            [autopart_id]: {
                ...prev[autopart_id],
                quantity,
            }
        }));
    };

    const handleCheckboxChange = (autopart_id, checked, offer) => {
        setSelectedOffers(prev => {
            const newSelected = { ...prev };
            if (checked) {
                newSelected[autopart_id] = { ...offer };
            } else {
                delete newSelected[autopart_id];
            }
            return newSelected;
        });
    };

    const handleSubmit = () => {
        const payload = Object.values(selectedOffers);
        axios.post('/api/order/confirm', { offers: payload })
            .then(() => message.success('Заказ успешно отправлен!'))
            .catch(() => message.error('Ошибка при отправке заказа.'));
    };

    const columns = [
        { title: 'OEM', dataIndex: 'oem_number', key: 'oem' },
        { title: 'Деталь', dataIndex: 'autopart_name', key: 'autopart_name' },
        { title: 'Бренд', dataIndex: 'brand_name', key: 'brand_name' },
        { title: 'Поставщик', dataIndex: 'supplier_name', key: 'supplier_name' },
        { title: 'Цена', dataIndex: 'price', key: 'price' },
        { title: 'Мин. заказ', dataIndex: 'min_qnt', key: 'min_qnt' },
        {
            title: 'Срок доставки',
            key: 'delivery',
            render: (text, record) => (
                <Tag>{record.min_delivery_day} - {record.max_delivery_day} дней</Tag>
            ),
        },
        {
            title: 'Количество',
            key: 'quantity',
            render: (text, record) => (
                <InputNumber
                    min={record.min_qnt || 1}
                    defaultValue={record.quantity}
                    onChange={(value) => handleQuantityChange(record.autopart_id, value)}
                />
            ),
        },
        {
            title: 'Выбрать',
            key: 'select',
            render: (text, record) => (
                <Checkbox onChange={(e) => handleCheckboxChange(record.autopart_id, e.target.checked, record)} />
            ),
        },
    ];

    return (
        <Spin spinning={loading}>
            <Table
                rowKey="autopart_id"
                columns={columns}
                dataSource={offers}
                pagination={{ pageSize: 10 }}
            />
            <Button
                type="primary"
                onClick={handleSubmit}
                disabled={Object.keys(selectedOffers).length === 0}
                style={{ marginTop: 20 }}
            >
                Отправить заказ
            </Button>
        </Spin>
    );
};

export default RestockOffers;