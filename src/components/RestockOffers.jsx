import React, { useState } from 'react';
import { Table, InputNumber, Checkbox, Button, message, Spin, Tag, Form } from 'antd';
import axios from 'axios';

const DEFAULT_PARAMS = {
    budget_limit: 50000,
    months_back: 6,
    threshold_percent: 0.5,
};

const RestockOffers = () => {
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedOffers, setSelectedOffers] = useState({});
    const [confirmedOffers, setConfirmedOffers] = useState(null);
    const [form] = Form.useForm();

    // Функция запроса (вызывается по submit формы)
    const fetchOffers = async (values) => {
        setLoading(true);
        try {
            // Получаем значения из формы
            const params = values || DEFAULT_PARAMS;
            const resp = await axios.get('http://0.0.0.0:8000/order/generate_restock_offers', {
                params: params,
            });
            // supplier_offers или offers
            if (resp.data.supplier_offers) {
                setOffers(Object.values(resp.data.supplier_offers));
            } else if (Array.isArray(resp.data.offers)) {
                setOffers(resp.data.offers);
            } else {
                setOffers([]);
                message.warning('Нет данных для отображения.');
            }
        } catch (err) {
            message.error('Ошибка загрузки предложений.');
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
                newSelected[autopart_id] = { ...offer, quantity: offer.min_qnt || 1 };
            } else {
                delete newSelected[autopart_id];
            }
            return newSelected;
        });
    };

    const handleSubmitOrder = () => {
        const payload = { offers: Object.values(selectedOffers) };
        // console.log('Отправка:', payload);

        axios.post('http://0.0.0.0:8000/order/confirm', payload)
            .then(res => {
                // console.log('Ответ:', res.data);
                message.success('Заказ успешно отправлен!');
                setConfirmedOffers(res.data.confirmed_offers);
                setOffers([]);
            })
            .catch(error => {
                console.error('Ошибка:', error.response ? error.response.data : error);
                message.error('Ошибка при отправке заказа.');
            });
    };

    const columns = [
        { title: 'OEM', dataIndex: 'oem_number', key: 'oem' },
        { title: 'Деталь', dataIndex: 'detail_name', key: 'detail_name' }, // detail_name!
        { title: 'Бренд', dataIndex: 'make_name', key: 'make_name' },      // make_name!
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
                    defaultValue={record.min_qnt || 1}
                    onChange={(value) => handleQuantityChange(record.autopart_id, value)}
                    disabled={!selectedOffers[record.autopart_id]}
                />
            ),
        },
        {
            title: 'Выбрать',
            key: 'select',
            render: (text, record) => (
                <Checkbox
                    onChange={(e) => handleCheckboxChange(record.autopart_id, e.target.checked, record)}
                    checked={!!selectedOffers[record.autopart_id]}
                />
            ),
        },
    ];

    // При первом рендере проставляем дефолтные значения в форму
    React.useEffect(() => {
        form.setFieldsValue(DEFAULT_PARAMS);
    }, [form]);

    // --- Отдельный рендер для подтверждённых заказов ---
    if (confirmedOffers) {
        return (
            <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
                <h2>Заказ отправлен</h2>
                <Table
                    rowKey="autopart_id"
                    columns={[
                        { title: 'ID', dataIndex: 'autopart_id', key: 'autopart_id' },
                        { title: 'Поставщик', dataIndex: 'supplier_id', key: 'supplier_id' },
                        { title: 'Количество', dataIndex: 'quantity', key: 'quantity' },
                        { title: 'Цена', dataIndex: 'confirmed_price', key: 'confirmed_price' },
                        { title: 'Статус', dataIndex: 'status', key: 'status' },
                        { title: 'Отправка', dataIndex: 'send_method', key: 'send_method' },
                    ]}
                    dataSource={confirmedOffers}
                    pagination={false}
                />
                <Button style={{ marginTop: 20 }} onClick={() => {
                    setConfirmedOffers(null);
                    setOffers([]);
                    setSelectedOffers({});
                }}>Новый заказ</Button>
            </div>
        );
    }

    // --- Обычный рендер ---
    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
            {!offers.length ? (
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={fetchOffers}
                    initialValues={DEFAULT_PARAMS}
                    style={{ marginBottom: 32 }}
                >
                    <Form.Item
                        label="Бюджет (budget_limit)"
                        name="budget_limit"
                        rules={[{ required: true, message: 'Укажите бюджет!' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        label="Кол-во месяцев анализа (months_back)"
                        name="months_back"
                        rules={[{ required: true, message: 'Укажите кол-во месяцев!' }]}
                    >
                        <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        label="Порог минимального остатка (%)"
                        name="threshold_percent"
                        rules={[{ required: true, message: 'Укажите порог!' }]}
                    >
                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            Получить предложения
                        </Button>
                    </Form.Item>
                </Form>
            ) : (
                <Spin spinning={loading}>
                    <Table
                        rowKey="autopart_id"
                        columns={columns}
                        dataSource={offers}
                        pagination={{ pageSize: 10 }}
                    />
                    <Button
                        type="primary"
                        onClick={handleSubmitOrder}
                        disabled={Object.keys(selectedOffers).length === 0}
                        style={{ marginTop: 20 }}
                    >
                        Отправить заказ
                    </Button>
                    <Button
                        style={{ marginTop: 20, marginLeft: 12 }}
                        onClick={() => { setOffers([]); setSelectedOffers({}); }}
                    >
                        Назад
                    </Button>
                </Spin>
            )}
        </div>
    );
};

export default RestockOffers;