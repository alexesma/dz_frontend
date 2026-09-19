import React, { useEffect, useState } from 'react';
import { DatePicker, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';

const CustomerOrderEditModal = ({
    open,
    order,
    customers,
    loading,
    onCancel,
    onSave,
}) => {
    const [customerId, setCustomerId] = useState(null);
    const [orderNumber, setOrderNumber] = useState('');
    const [orderDate, setOrderDate] = useState(null);

    useEffect(() => {
        if (!open || !order) return;
        setCustomerId(order.customer_id || null);
        setOrderNumber(order.order_number || '');
        setOrderDate(order.order_date ? dayjs(order.order_date) : null);
    }, [open, order]);

    return (
        <Modal
            title={`Редактирование заказа #${order?.order_number || order?.id || ''}`}
            open={open}
            confirmLoading={loading}
            okText="Сохранить"
            cancelText="Отмена"
            onCancel={onCancel}
            onOk={() => onSave({
                customer_id: customerId,
                order_number: orderNumber.trim() || null,
                order_date: orderDate ? orderDate.format('YYYY-MM-DD') : null,
            })}
            destroyOnClose
        >
            <div className="responsive-form-grid-2">
                <div>
                    <div className="field-label">Клиент</div>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        value={customerId}
                        options={(customers || []).map((customer) => ({
                            value: customer.id,
                            label: customer.name,
                        }))}
                        onChange={setCustomerId}
                        disabled={order?.status !== 'NEW'}
                        style={{ width: '100%' }}
                    />
                    {order?.status !== 'NEW' && (
                        <div className="field-hint">
                            После обработки клиент фиксируется в складских и закупочных документах.
                        </div>
                    )}
                </div>
                <div>
                    <div className="field-label">Номер заказа</div>
                    <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                </div>
                <div>
                    <div className="field-label">Дата заказа</div>
                    <DatePicker
                        value={orderDate}
                        onChange={setOrderDate}
                        format="DD.MM.YYYY"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default CustomerOrderEditModal;
