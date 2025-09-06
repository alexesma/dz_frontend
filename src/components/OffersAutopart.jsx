
import React, { useEffect, useState } from 'react';
import { Table, InputNumber, Checkbox, Button, message, Spin, Tag } from 'antd';
import api from '../api';

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
            const response = await api.get('/order/generate_restock_offers');
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
        api.post('/api/order/confirm', { offers: payload })
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