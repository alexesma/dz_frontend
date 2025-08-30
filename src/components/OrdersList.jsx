// import React, { useEffect, useState } from 'react';
// import { Collapse, Table, Tag, Button, message, Badge, Select, Space } from 'antd';
// import { MailOutlined, ApiOutlined } from '@ant-design/icons';
// import axios from 'axios';
//
// const statusOptions = [
//     { value: 'New', label: 'Новый', color: 'blue' },
//     { value: 'Send', label: 'Отправлен', color: 'orange' },
//     { value: 'Confirmed', label: 'Подтвержден', color: 'green' },
//     { value: 'Rejected', label: 'Отклонен', color: 'red' },
//     { value: 'Fulfilled', label: 'Выполнен', color: 'purple' },
//     { value: 'Error', label: 'Ошибка', color: 'volcano' }
// ];
//
// const OrdersList = () => {
//     const [orders, setOrders] = useState([]);
//     const [loading, setLoading] = useState(false);
//     // Храним выбранные позиции для каждого supplier_id: { [supplier_id]: [tracking_uuid, ...] }
//     const [selectedRowsByOrder, setSelectedRowsByOrder] = useState({});
//
//     useEffect(() => {
//         fetchOrders();
//     }, []);
//
//     const fetchOrders = async () => {
//         setLoading(true);
//         try {
//             const { data } = await axios.get('http://localhost:8000/order/confirmed');
//             setOrders(data);
//         } catch (error) {
//             console.error('Ошибка при загрузке заказов:', error);
//             message.error('Ошибка загрузки заказов.');
//         } finally {
//             setLoading(false);
//         }
//     };
//
//     // Массовое обновление статусов для одного заказа (supplier)
//     const updateSelectedStatuses = async (supplier_id, newStatus) => {
//         const selected = selectedRowsByOrder[supplier_id] || [];
//         if (selected.length === 0) {
//             message.warning('Выберите позиции для обновления');
//             return;
//         }
//
//         try {
//             const response = await axios.patch('http://localhost:8000/order/update_position_status', {
//                 tracking_uuids: selected,
//                 status: newStatus
//             });
//
//             // Обновляем только выбранный заказ, остальные не трогаем
//             const updatedItems = response.data.updated_items || [];
//             setOrders(prevOrders =>
//                 prevOrders.map(order =>
//                     order.supplier_id === supplier_id
//                         ? {
//                             ...order,
//                             positions: order.positions.map(position => {
//                                 const updatedItem = updatedItems.find(
//                                     item => item.tracking_uuid === position.tracking_uuid
//                                 );
//                                 return updatedItem
//                                     ? { ...position, status: updatedItem.new_status }
//                                     : position;
//                             })
//                         }
//                         : order
//                 )
//             );
//             message.success(`Обновлено ${updatedItems.length} позиций`);
//             setSelectedRowsByOrder(prev => ({ ...prev, [supplier_id]: [] }));
//         } catch (error) {
//             console.error('Ошибка при обновлении статусов:', error);
//             message.error('Ошибка обновления статусов');
//         }
//     };
//
//     // Массовое "отправить поставщику" — отправляет все позиции заказа
//     // const sendToSupplier = async (order) => {
//     //     try {
//     //         const trackingUuids = order.positions.map(pos => pos.tracking_uuid);
//     //         setSelectedRowsByOrder(prev => ({ ...prev, [order.supplier_id]: trackingUuids }));
//     //         await updateSelectedStatuses(order.supplier_id, 'Send');
//     //         message.success(`Заказ для ${order.supplier_name} отправлен!`);
//     //     } catch (error) {
//     //         message.error('Ошибка при отправке заказа');
//     //     }
//     // };
//
//     const sendOrdersToAPI = async (orderPositions) => {
//         try {
//             const response = await axios.post('http://localhost:8000/send_api', orderPositions);
//
//             const { total_items, successful_items, failed_items, results } = response.data;
//
//             if (successful_items > 0) {
//                 message.success(`Успешно отправлено ${successful_items} из ${total_items} позиций`);
//             }
//
//             if (failed_items > 0) {
//                 message.warning(`Не удалось отправить ${failed_items} позиций`);
//                 console.log('Детали ошибок:', results.filter(r => r.status === 'error'));
//             }
//
//             return response.data;
//         } catch (error) {
//             message.error('Ошибка при отправке заказов');
//             throw error;
//         }
//     };
//
//     // Общие колонки для таблицы позиций
//     const columns = [
//         { title: 'OEM', dataIndex: 'oem_number', key: 'oem_number' },
//         { title: 'Название детали', dataIndex: 'autopart_name', key: 'autopart_name' },
//         { title: 'Количество', dataIndex: 'quantity', key: 'quantity' },
//         { title: 'Цена за штуку', dataIndex: 'confirmed_price', key: 'confirmed_price' },
//         {
//             title: 'Статус',
//             dataIndex: 'status',
//             key: 'status',
//             render: (status) => {
//                 const statusOption = statusOptions.find(option => option.value === status);
//                 return (
//                     <Tag color={statusOption?.color || 'default'}>
//                         {statusOption?.label || status}
//                     </Tag>
//                 );
//             }
//         },
//         { title: 'Бренд', dataIndex: 'brand_name', key: 'brand_name', render: (brand_name) => brand_name || '-' },
//     ];
//
//     return (
//         <div>
//             <Collapse accordion loading={loading}>
//                 {orders.map((order) => {
//                     const selectedRows = selectedRowsByOrder[order.supplier_id] || [];
//
//                     // rowSelection только для текущего заказа
//                     const rowSelection = {
//                         selectedRowKeys: selectedRows,
//                         onChange: (selectedRowKeys) => {
//                             setSelectedRowsByOrder(prev => ({
//                                 ...prev,
//                                 [order.supplier_id]: selectedRowKeys
//                             }));
//                         },
//                         getCheckboxProps: (record) => ({
//                             name: record.tracking_uuid,
//                         }),
//                     };
//
//                     return (
//                         <Collapse.Panel
//                             key={order.supplier_id}
//                             header={
//                                 <span>
//                                     <Badge status="processing" />
//                                     <strong>{order.supplier_name}</strong>
//                                     &nbsp;| Сумма: <strong>{order.total_sum} ₽</strong>
//                                     &nbsp;| Срок доставки: {order.min_delivery_day}-{order.max_delivery_day} дней
//                                     &nbsp;| Способ отправки: {order.send_method === 'API' ? <ApiOutlined /> : <MailOutlined />}
//                                     &nbsp;| Позиций: {order.positions.length}
//                                 </span>
//                             }
//                         >
//                             {/* Панель массовых действий для этого заказа */}
//                             {selectedRows.length > 0 && (
//                                 <div style={{ marginBottom: 16, padding: 16, background: '#f0f2f5', borderRadius: 6 }}>
//                                     <Space>
//                                         <span>Выбрано позиций: {selectedRows.length}</span>
//                                         <Button
//                                             onClick={() => updateSelectedStatuses(order.supplier_id, 'Send')}
//                                         >
//                                             Отметить как отправленные
//                                         </Button>
//                                         <Button
//                                             onClick={() => updateSelectedStatuses(order.supplier_id, 'Confirmed')}
//                                         >
//                                             Отметить как подтвержденные
//                                         </Button>
//                                         <Select
//                                             style={{ width: 150 }}
//                                             placeholder="Выберите статус"
//                                             onChange={(value) => updateSelectedStatuses(order.supplier_id, value)}
//                                         >
//                                             {statusOptions.map(option => (
//                                                 <Select.Option key={option.value} value={option.value}>
//                                                     <Tag color={option.color}>{option.label}</Tag>
//                                                 </Select.Option>
//                                             ))}
//                                         </Select>
//                                     </Space>
//                                 </div>
//                             )}
//
//                             <Table
//                                 columns={columns}
//                                 dataSource={order.positions}
//                                 pagination={false}
//                                 rowKey="tracking_uuid"
//                                 rowSelection={rowSelection}
//                                 size="small"
//                                 scroll={{ x: true }}
//                             />
//                             <Button
//                                 type="primary"
//                                 style={{ marginTop: 16 }}
//                                 onClick={() => sendOrdersToAPI(order.positions)}
//                             >
//                                 Отправить заказ поставщику
//                             </Button>
//                         </Collapse.Panel>
//                     );
//                 })}
//             </Collapse>
//         </div>
//     );
// };
//
// export default OrdersList;

import React, { useEffect, useState } from 'react';

// --- API КЛИЕНТ ---
const api = {
    get: async (url) => {
        console.log('GET запрос к:', url);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            console.log('Ответ статус:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ошибка ответа:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Полученные данные:', data);
            return { data };
        } catch (error) {
            console.error('Ошибка API GET:', error);
            throw error;
        }
    },

    post: async (url, data, config = {}) => {
        console.log('POST запрос к:', url, 'с данными:', data);
        try {
            const queryParams = config.params ? '?' + new URLSearchParams(config.params).toString() : '';
            const fullUrl = url + queryParams;

            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data),
                mode: 'cors'
            });

            console.log('POST ответ статус:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('POST ошибка ответа:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const responseData = await response.json();
            console.log('POST полученные данные:', responseData);
            return { data: responseData };
        } catch (error) {
            console.error('Ошибка API POST:', error);
            throw error;
        }
    },

    patch: async (url, data) => {
        console.log('PATCH запрос к:', url, 'с данными:', data);
        try {
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data),
                mode: 'cors'
            });

            console.log('PATCH ответ статус:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('PATCH ошибка ответа:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const responseData = await response.json();
            console.log('PATCH полученные данные:', responseData);
            return { data: responseData };
        } catch (error) {
            console.error('Ошибка API PATCH:', error);
            throw error;
        }
    }
};

const statusOptions = [
    { value: 'New', label: 'Новый', color: '#1890ff' },
    { value: 'Send', label: 'Отправлен', color: '#fa8c16' },
    { value: 'Confirmed', label: 'Подтвержден', color: '#52c41a' },
    { value: 'Rejected', label: 'Отклонен', color: '#f5222d' },
    { value: 'Fulfilled', label: 'Выполнен', color: '#722ed1' },
    { value: 'Error', label: 'Ошибка', color: '#fa541c' }
];

const orderStatusOptions = [
    { value: 'ORDERED', label: 'Отправлен поставщику', color: '#fa8c16' },
    { value: 'PROCESSING', label: 'В обработке', color: '#13c2c2' },
    { value: 'CONFIRMED', label: 'Подтвержден', color: '#52c41a' },
    { value: 'ARRIVED', label: 'Прибыл', color: '#722ed1' },
    { value: 'SHIPPED', label: 'Отгружен', color: '#2f54eb' },
    { value: 'TRANSIT', label: 'В пути', color: '#1890ff' },
    { value: 'ACCEPTED', label: 'Принят', color: '#389e0d' },
    { value: 'CANCELLED', label: 'Отменен', color: '#f5222d' },
    { value: 'RETURNED', label: 'Возврат', color: '#d48806' },
    { value: 'ERROR', label: 'Ошибка', color: '#fa541c' },
];

// --- BADGE КОМПОНЕНТ ---
const StatusBadge = ({ status, options }) => {
    const statusOption = options.find(option => option.value === status);
    return (
        <span
            style={{
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: statusOption?.color || '#d9d9d9',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
            }}
        >
            {statusOption?.label || status}
        </span>
    );
};

const OrdersList = () => {
    const [confirmedPositions, setConfirmedPositions] = useState([]);
    const [createdOrders, setCreatedOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('confirmed');
    const [selectedRowsByOrder, setSelectedRowsByOrder] = useState({});
    const [createOrderModal, setCreateOrderModal] = useState(false);
    const [expandedOrders, setExpandedOrders] = useState({});
    const [formData, setFormData] = useState({
        supplier_id: '',
        provider_id: '',
        customer_id: '',
        comment: ''
    });
    const [message, setMessage] = useState({ text: '', type: '' });

    useEffect(() => {
        if (activeTab === 'confirmed') {
            fetchConfirmedPositions();
        } else {
            fetchCreatedOrders();
        }
    }, [activeTab]);

    const showMessage = (text, type = 'info') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    // Получение подтвержденных позиций
    const fetchConfirmedPositions = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('http://localhost:8000/order/confirmed');
            setConfirmedPositions(data || []);
            if (!data || data.length === 0) {
                showMessage('Подтвержденные позиции не найдены', 'info');
            }
        } catch (error) {
            showMessage(`Ошибка загрузки подтвержденных позиций: ${error.message}`, 'error');
            setConfirmedPositions([]);
        } finally {
            setLoading(false);
        }
    };

    // Получение созданных заказов
    const fetchCreatedOrders = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('http://localhost:8000/order');
            setCreatedOrders(data || []);
            if (!data || data.length === 0) {
                showMessage('Созданные заказы не найдены', 'info');
            }
        } catch (error) {
            showMessage(`Ошибка загрузки заказов: ${error.message}`, 'error');
            setCreatedOrders([]);
        } finally {
            setLoading(false);
        }
    };

    // Создание заказа из подтвержденных позиций
    const createOrderFromPositions = async (e) => {
        e.preventDefault();
        const { comment, supplier_id } = formData;
        if (!supplier_id) {
            showMessage('Не выбран поставщик', 'error');
            return;
        }

        const supplierPositions = confirmedPositions.find(order => order.supplier_id === parseInt(supplier_id, 10));
        if (!supplierPositions) {
            showMessage('Позиции поставщика не найдены', 'error');
            return;
        }

        try {
            const response = await api.post('http://localhost:8000/order/send_api', supplierPositions.positions, );

            const { order_id, order_number, successful_items, failed_items, total_items } = response.data;

            if (successful_items > 0) {
                showMessage(
                    `Заказ №${order_number} создан! Успешно отправлено ${successful_items} из ${total_items} позиций`,
                    'success'
                );
                setConfirmedPositions(prev =>
                    prev.filter(order => order.supplier_id !== parseInt(supplier_id, 10))
                );
                setCreateOrderModal(false);
                setFormData({ supplier_id: '', provider_id: '', customer_id: '', comment: '' });
            } else {
                showMessage('Не удалось создать заказ - ни одна позиция не была отправлена', 'error');
            }

            if (failed_items > 0) {
                showMessage(`Не удалось отправить ${failed_items} позиций`, 'warning');
            }
        } catch (error) {
            showMessage('Ошибка при создании заказа', 'error');
        }
    };

    // Обновление статуса заказа
    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            await api.patch(`http://localhost:8000/order/${orderId}/status?status=${encodeURIComponent(newStatus)}`);

            setCreatedOrders(prev =>
                prev.map(order =>
                    order.id === orderId
                        ? { ...order, status: newStatus }
                        : order
                )
            );

            showMessage('Статус заказа обновлен', 'success');
        } catch (error) {
            showMessage('Ошибка при обновлении статуса заказа', 'error');
        }
    };

    // Массовое обновление статусов позиций
    const updateSelectedStatuses = async (supplier_id, newStatus) => {
        const selected = selectedRowsByOrder[supplier_id] || [];
        if (selected.length === 0) {
            showMessage('Выберите позиции для обновления', 'warning');
            return;
        }

        try {
            const response = await api.patch('http://localhost:8000/order/update_position_status', {
                tracking_uuids: selected,
                status: newStatus
            });

            const updatedItems = response.data.updated_items || [];
            setConfirmedPositions(prevOrders =>
                prevOrders.map(order =>
                    order.supplier_id === supplier_id
                        ? {
                            ...order,
                            positions: order.positions.map(position => {
                                const updatedItem = updatedItems.find(
                                    item => item.tracking_uuid === position.tracking_uuid
                                );
                                return updatedItem
                                    ? { ...position, status: updatedItem.new_status }
                                    : position;
                            })
                        }
                        : order
                )
            );
            showMessage(`Обновлено ${updatedItems.length} позиций`, 'success');
            setSelectedRowsByOrder(prev => ({ ...prev, [supplier_id]: [] }));
        } catch (error) {
            showMessage('Ошибка обновления статусов', 'error');
        }
    };

    const toggleExpanded = (id) => {
        setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleRowSelect = (supplier_id, tracking_uuid, checked) => {
        setSelectedRowsByOrder(prev => {
            const currentSelected = prev[supplier_id] || [];
            if (checked) {
                return { ...prev, [supplier_id]: [...currentSelected, tracking_uuid] };
            } else {
                return { ...prev, [supplier_id]: currentSelected.filter(id => id !== tracking_uuid) };
            }
        });
    };

    const styles = {
        container: {
            fontFamily: 'Arial, sans-serif',
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '20px'
        },
        tabs: {
            display: 'flex',
            marginBottom: '20px',
            borderBottom: '2px solid #f0f0f0'
        },
        tab: {
            padding: '12px 24px',
            cursor: 'pointer',
            border: 'none',
            backgroundColor: 'transparent',
            fontSize: '16px',
            fontWeight: 'bold'
        },
        activeTab: {
            borderBottom: '2px solid #1890ff',
            color: '#1890ff'
        },
        card: {
            border: '1px solid #d9d9d9',
            borderRadius: '8px',
            marginBottom: '16px',
            backgroundColor: 'white'
        },
        cardHeader: {
            padding: '16px',
            backgroundColor: '#fafafa',
            borderBottom: '1px solid #d9d9d9',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        cardContent: {
            padding: '16px'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '16px'
        },
        th: {
            padding: '12px 8px',
            textAlign: 'left',
            backgroundColor: '#f5f5f5',
            border: '1px solid #d9d9d9',
            fontWeight: 'bold'
        },
        td: {
            padding: '8px',
            border: '1px solid #d9d9d9'
        },
        button: {
            padding: '8px 16px',
            margin: '4px',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: 'white'
        },
        primaryButton: {
            backgroundColor: '#1890ff',
            color: 'white',
            border: '1px solid #1890ff'
        },
        select: {
            padding: '6px',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            minWidth: '120px'
        },
        modal: {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        },
        modalContent: {
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90vw'
        },
        input: {
            width: '100%',
            padding: '8px',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            marginTop: '4px',
            marginBottom: '16px'
        },
        textarea: {
            width: '100%',
            padding: '8px',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            marginTop: '4px',
            marginBottom: '16px',
            minHeight: '80px',
            resize: 'vertical'
        },
        message: {
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            display: message.text ? 'block' : 'none'
        },
        successMessage: {
            backgroundColor: '#f6ffed',
            border: '1px solid #b7eb8f',
            color: '#389e0d'
        },
        errorMessage: {
            backgroundColor: '#fff2f0',
            border: '1px solid #ffccc7',
            color: '#cf1322'
        },
        warningMessage: {
            backgroundColor: '#fffbe6',
            border: '1px solid #ffe58f',
            color: '#d48806'
        },
        selectedBar: {
            backgroundColor: '#f0f2f5',
            padding: '16px',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap'
        }
    };

    const messageStyle = {
        ...styles.message,
        ...(message.type === 'success' && styles.successMessage),
        ...(message.type === 'error' && styles.errorMessage),
        ...(message.type === 'warning' && styles.warningMessage)
    };

    return (
        <div style={styles.container}>
            <div style={messageStyle}>
                {message.text}
            </div>

            <div style={styles.tabs}>
                <button
                    style={{
                        ...styles.tab,
                        ...(activeTab === 'confirmed' && styles.activeTab)
                    }}
                    onClick={() => setActiveTab('confirmed')}
                >
                    Подтвержденные позиции
                </button>
                <button
                    style={{
                        ...styles.tab,
                        ...(activeTab === 'orders' && styles.activeTab)
                    }}
                    onClick={() => setActiveTab('orders')}
                >
                    Созданные заказы
                </button>
            </div>

            {loading && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    fontSize: '16px',
                    color: '#666'
                }}>
                    <div>⏳ Загрузка...</div>
                    <div style={{fontSize: '14px', marginTop: '8px'}}>
                        Проверьте консоль браузера для отладочной информации
                    </div>
                </div>
            )}

            {/* --- ПОДТВЕРЖДЕННЫЕ ПОЗИЦИИ --- */}
            {!loading && activeTab === 'confirmed' && (
                <div>
                    {confirmedPositions.length !== 0 ? (
                        confirmedPositions.map((order) => {
                            const selectedRows = selectedRowsByOrder[order.supplier_id] || [];
                            const isExpanded = expandedOrders[order.supplier_id];

                            return (
                                <div key={order.supplier_id} style={styles.card}>
                                    <div
                                        style={styles.cardHeader}
                                        onClick={() => toggleExpanded(order.supplier_id)}
                                    >
                                        <span>
                                            <strong>{order.supplier_name}</strong>
                                            {' | Сумма: '}<strong>{order.total_sum} ₽</strong>
                                            {' | Срок доставки: '}{order.min_delivery_day}-{order.max_delivery_day} дней
                                            {' | Способ отправки: '}{order.send_method === 'API' ? '📡' : '📧'}
                                            {' | Позиций: '}{order.positions.length}
                                        </span>
                                        <span>{isExpanded ? '▲' : '▼'}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={styles.cardContent}>
                                            {selectedRows.length > 0 && (
                                                <div style={styles.selectedBar}>
                                                    <span>Выбрано позиций: {selectedRows.length}</span>
                                                    <button
                                                        style={styles.button}
                                                        onClick={() => updateSelectedStatuses(order.supplier_id, 'Send')}
                                                    >
                                                        Отметить как отправленные
                                                    </button>
                                                    <button
                                                        style={styles.button}
                                                        onClick={() => updateSelectedStatuses(order.supplier_id, 'Confirmed')}
                                                    >
                                                        Отметить как подтвержденные
                                                    </button>
                                                    <select
                                                        style={styles.select}
                                                        onChange={(e) => updateSelectedStatuses(order.supplier_id, e.target.value)}
                                                        value=""
                                                    >
                                                        <option value="">Выберите статус</option>
                                                        {statusOptions.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <table style={styles.table}>
                                                <thead>
                                                <tr>
                                                    <th style={styles.th}>✓</th>
                                                    <th style={styles.th}>OEM</th>
                                                    <th style={styles.th}>Название детали</th>
                                                    <th style={styles.th}>Количество</th>
                                                    <th style={styles.th}>Цена за штуку</th>
                                                    <th style={styles.th}>Статус</th>
                                                    <th style={styles.th}>Бренд</th>
                                                </tr>
                                                </thead>
                                                <tbody>
                                                {order.positions.map((position) => (
                                                    <tr key={position.tracking_uuid}>
                                                        <td style={styles.td}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedRows.includes(position.tracking_uuid)}
                                                                onChange={(e) =>
                                                                    handleRowSelect(order.supplier_id, position.tracking_uuid, e.target.checked)
                                                                }
                                                            />
                                                        </td>
                                                        <td style={styles.td}>{position.oem_number}</td>
                                                        <td style={styles.td}>{position.autopart_name}</td>
                                                        <td style={styles.td}>{position.quantity}</td>
                                                        <td style={styles.td}>{position.confirmed_price}</td>
                                                        <td style={styles.td}>
                                                            <StatusBadge status={position.status} options={statusOptions}/>
                                                        </td>
                                                        <td style={styles.td}>{position.brand_name || '-'}</td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>

                                            <button
                                                style={{...styles.button, ...styles.primaryButton}}
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        supplier_id: order.supplier_id.toString()
                                                    }));
                                                    setCreateOrderModal(true);
                                                }}
                                            >
                                                🛒 Создать заказ
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px',
                            backgroundColor: '#f9f9f9',
                            borderRadius: '8px',
                            border: '2px dashed #d9d9d9'
                        }}>
                            <div style={{fontSize: '18px', color: '#666', marginBottom: '8px'}}>
                                📦 Подтвержденные позиции не найдены
                            </div>
                            <div style={{fontSize: '14px', color: '#999'}}>
                                Возможные причины:
                                <ul style={{textAlign: 'left', marginTop: '12px'}}>
                                    <li>Эндпоинт /order/confirmed не существует</li>
                                    <li>CORS ошибки (проверьте консоль)</li>
                                    <li>Сервер недоступен</li>
                                    <li>Нет данных в базе</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- СОЗДАННЫЕ ЗАКАЗЫ --- */}
            {!loading && activeTab === 'orders' && (
                <div>
                    {createdOrders.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px',
                            backgroundColor: '#f9f9f9',
                            borderRadius: '8px',
                            border: '2px dashed #d9d9d9'
                        }}>
                            <div style={{fontSize: '18px', color: '#666', marginBottom: '8px'}}>
                                📋 Созданные заказы не найдены
                            </div>
                            <div style={{fontSize: '14px', color: '#999'}}>
                                Возможные причины:
                                <ul style={{textAlign: 'left', marginTop: '12px'}}>
                                    <li>Эндпоинт /orders не существует</li>
                                    <li>CORS ошибки (проверьте консоль)</li>
                                    <li>Сервер недоступен</li>
                                    <li>Нет созданных заказов</li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        createdOrders.map((order) => {
                            const isExpanded = expandedOrders[order.id];
                            const orderStatus = orderStatusOptions.find(option => option.value === order.status);

                            return (
                                <div key={order.id} style={styles.card}>
                                    <div
                                        style={styles.cardHeader}
                                        onClick={() => toggleExpanded(order.id)}
                                    >
                                        <span>
                                            <strong>Заказ №{order.order_number}</strong>
                                            {' | Поставщик ID: '}{order.provider_id}
                                            {' | Клиент ID: '}{order.customer_id}
                                            {' | Статус: '}<StatusBadge status={order.status} options={orderStatusOptions} />
                                            {' | Позиций: '}{order.order_items?.length || 0}
                                            {' | Создан: '}{new Date(order.created_at).toLocaleString()}
                                        </span>
                                        <span>{isExpanded ? '▲' : '▼'}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={styles.cardContent}>
                                            <div style={{marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center'}}>
                                                <span>Управление заказом:</span>
                                                <select
                                                    style={styles.select}
                                                    value={order.status}
                                                    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                >
                                                    {orderStatusOptions.map(option => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {order.comment && (
                                                <div style={{
                                                    marginBottom: '16px',
                                                    padding: '8px',
                                                    backgroundColor: '#f9f9f9',
                                                    borderRadius: '4px'
                                                }}>
                                                    <strong>Комментарий:</strong> {order.comment}
                                                </div>
                                            )}

                                            <table style={styles.table}>
                                                <thead>
                                                <tr>
                                                    <th style={styles.th}>Tracking UUID</th>
                                                    <th style={styles.th}>Количество</th>
                                                    <th style={styles.th}>Цена</th>
                                                    <th style={styles.th}>Статус позиции</th>
                                                    <th style={styles.th}>Комментарий</th>
                                                </tr>
                                                </thead>
                                                <tbody>
                                                {(order.order_items || []).map((item) => (
                                                    <tr key={item.id}>
                                                        <td style={styles.td}>{item.tracking_uuid}</td>
                                                        <td style={styles.td}>{item.quantity}</td>
                                                        <td style={styles.td}>{item.price}</td>
                                                        <td style={styles.td}>
                                                            <StatusBadge status={item.status} options={statusOptions} />
                                                        </td>
                                                        <td style={styles.td}>{item.comments || '-'}</td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* --- МОДАЛКА СОЗДАНИЯ ЗАКАЗА --- */}
            {createOrderModal && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3>Создать заказ</h3>
                        <form onSubmit={createOrderFromPositions}>

                            <label>
                                Комментарий:
                                <textarea
                                    style={styles.textarea}
                                    value={formData.comment}
                                    onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
                                    placeholder="Дополнительный комментарий к заказу"
                                />
                            </label>

                            <div style={{display: 'flex', gap: '12px'}}>
                                <button
                                    type="submit"
                                    style={{...styles.button, ...styles.primaryButton}}
                                >
                                    ✅ Создать заказ
                                </button>
                                <button
                                    type="button"
                                    style={styles.button}
                                    onClick={() => {
                                        setCreateOrderModal(false);
                                        setFormData({ supplier_id: '', provider_id: '', customer_id: '', comment: '' });
                                    }}
                                >
                                    Отмена
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersList;