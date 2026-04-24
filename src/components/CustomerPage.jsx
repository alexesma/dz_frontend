// import React, { useEffect, useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import {
//     Card,
//     Form,
//     Input,
//     Button,
//     message,
//     Spin,
//     Divider,
//     Space,
//     Select,
//     InputNumber,
//     Typography,
//     Table,
//     Tag,
//     Modal,
//     Popconfirm,
// } from "antd";
// import {
//     SaveOutlined,
//     PlusOutlined,
//     EditOutlined,
//     DeleteOutlined,
//     ArrowLeftOutlined,
//     CloudDownloadOutlined,
// } from "@ant-design/icons";
//
// import api from "../api.js";
//
// const { Title, Text } = Typography;
//
// const CustomerPage = () => {
//     const { customerId: customerIdParam } = useParams();
//     const navigate = useNavigate();
//
//     const isNew = !customerIdParam || customerIdParam.toLowerCase() === "create";
//     const customerId = !isNew ? Number(customerIdParam) : null;
//
//     const [loading, setLoading] = useState(!isNew);
//     const [generating, setGenerating] = useState({});
//
//     const [saving, setSaving] = useState(false);
//     const [customerData, setCustomerData] = useState(null);
//
//     const [configModalVisible, setConfigModalVisible] = useState(false);
//     const [editingConfig, setEditingConfig] = useState(null);
//
//     const [customerForm] = Form.useForm();
//     const [configForm] = Form.useForm();
//
//     // Загрузка данных при редактировании
//     useEffect(() => {
//         if (isNew) {
//             customerForm.resetFields();
//             setCustomerData(null);
//             setLoading(false);
//             return;
//         }
//
//         if (!customerId || Number.isNaN(customerId)) {
//             message.error("Некорректный идентификатор клиента");
//             navigate("/customers");
//             return;
//         }
//
//         (async () => {
//             setLoading(true);
//             try {
//                 const response = await api.get(`/customers/${customerId}/`);
//                 const data = response.data;
//
//                 setCustomerData(data);
//                 customerForm.setFieldsValue({
//                     name: data.name,
//                     email_contact: data.email_contact,
//                     email_outgoing_price: data.email_outgoing_price,
//                     type_prices: data.type_prices,
//                     description: data.description,
//                     comment: data.comment,
//                 });
//
//                 // Загружаем конфигурации отдельно
//                 const configsResponse = await api.get(`/customers/${customerId}/pricelist-configs/`);
//                 setCustomerData(prev => ({
//                     ...prev,
//                     pricelist_configs: configsResponse.data
//                 }));
//
//             } catch (err) {
//                 message.error(err?.response?.data?.detail || "Ошибка загрузки клиента");
//                 navigate("/customers");
//             } finally {
//                 setLoading(false);
//             }
//         })();
//     }, [isNew, customerId, customerForm, navigate]);
//
//     const handleCustomerSubmit = async (values) => {
//         setSaving(true);
//         try {
//             if (isNew) {
//                 const response = await api.post('/customers/', values);
//                 message.success("Клиент успешно создан");
//                 navigate(`/customers/${response.data.id}/edit`);
//             } else {
//                 await api.patch(`/customers/${customerId}/`, values);
//                 message.success("Данные клиента обновлены");
//
//                 // Обновляем данные на странице
//                 const response = await api.get(`/customers/${customerId}/`);
//                 setCustomerData(response.data);
//             }
//         } catch (err) {
//             console.error(err);
//             message.error(err?.response?.data?.detail || "Ошибка сохранения клиента");
//         } finally {
//             setSaving(false);
//         }
//     };
//
//     // Удалить клиента
//     const handleDeleteCustomer = async () => {
//         if (!customerId) return;
//
//         try {
//             await api.delete(`/customers/${customerId}/`);
//             message.success('Клиент удален');
//             navigate('/customers');
//         } catch (err) {
//             message.error(err?.response?.data?.detail || 'Ошибка удаления клиента');
//         }
//     };
//
//     // Конфигурации прайс-листов
//     const openConfigModal = (config = null) => {
//         setEditingConfig(config);
//         if (config) {
//             configForm.setFieldsValue(config);
//         } else {
//             configForm.resetFields();
//         }
//         setConfigModalVisible(true);
//     };
//
//     const handleConfigSubmit = async (values) => {
//         if (!customerId) return;
//
//         try {
//             if (editingConfig) {
//                 await api.patch(`/customers/${customerId}/pricelist-configs/${editingConfig.id}`, values);
//                 message.success("Конфигурация обновлена");
//             } else {
//                 await api.post(`/customers/${customerId}/pricelist-configs/`, values);
//                 message.success("Конфигурация создана");
//             }
//             setConfigModalVisible(false);
//             setEditingConfig(null);
//             configForm.resetFields();
//
//             // Обновляем данные
//             const configsResponse = await api.get(`/customers/${customerId}/pricelist-configs/`);
//             setCustomerData(prev => ({
//                 ...prev,
//                 pricelist_configs: configsResponse.data
//             }));
//         } catch (err) {
//             console.error(err);
//             message.error(err?.response?.data?.detail || "Ошибка сохранения конфигурации");
//         }
//     };
//
//     const handleDeleteConfig = async (configId) => {
//         if (!customerId) return;
//
//         try {
//             await api.delete(`/customers/${customerId}/pricelist-configs/${configId}`);
//             message.success("Конфигурация удалена");
//
//             // Обновляем данные
//             const configsResponse = await api.get(`/customers/${customerId}/pricelist-configs/`);
//             setCustomerData(prev => ({
//                 ...prev,
//                 pricelist_configs: configsResponse.data
//             }));
//         } catch (err) {
//             console.error(err);
//             message.error(err?.response?.data?.detail || "Ошибка удаления конфигурации");
//         }
//     };
//
//     // Генерация прайс-листа по конфигурации
//     const handleGeneratePricelist = async (configId) => {
//         if (!customerId) return;
//
//         setGenerating(prev => ({ ...prev, [configId]: true }));
//
//         try {
//             await api.post(`/customers/${customerId}/pricelists/`, {
//                 config_id: configId
//             });
//             message.success("Прайс-лист успешно сгенерирован");
//
//             // Обновляем данные клиента
//             const response = await api.get(`/customers/${customerId}/`);
//             setCustomerData(response.data);
//         } catch (err) {
//             console.error(err);
//             message.error(err?.response?.data?.detail || "Ошибка генерации прайс-листа");
//         } finally {
//             setGenerating(prev => ({ ...prev, [configId]: false }));
//         }
//     };
//
//     const getTypePricesLabel = (type) => {
//         const types = {
//             'WHOLESALE': 'Оптовые',
//             'RETAIL': 'Розничные'
//         };
//         return types[type] || type;
//     };
//
//     // Колонки для таблицы конфигураций
//     const configColumns = [
//         {
//             title: "Название",
//             dataIndex: "name",
//             key: "name",
//             render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
//         },
//         {
//             title: "Общая наценка (%)",
//             dataIndex: "general_markup",
//             key: "general_markup",
//             render: (value) => `${(value * 100).toFixed(1)}%`,
//         },
//         {
//             title: "Наценка на наш прайс (%)",
//             dataIndex: "own_price_list_markup",
//             key: "own_price_list_markup",
//             render: (value) => `${(value * 100).toFixed(1)}%`,
//         },
//         {
//             title: "Наценка на сторонние (%)",
//             dataIndex: "third_party_markup",
//             key: "third_party_markup",
//             render: (value) => `${(value * 100).toFixed(1)}%`,
//         },
//         {
//             title: "Фильтры",
//             key: "filters",
//             render: (_, record) => {
//                 const filters = [];
//                 if (record.brand_filters && record.brand_filters.length > 0) {
//                     filters.push(`Бренды: ${record.brand_filters.length}`);
//                 }
//                 if (record.category_filter && record.category_filter.length > 0) {
//                     filters.push(`Категории: ${record.category_filter.length}`);
//                 }
//                 if (record.price_intervals && record.price_intervals.length > 0) {
//                     filters.push(`Ценовые интервалы: ${record.price_intervals.length}`);
//                 }
//
//                 return filters.length > 0 ? (
//                     <div>
//                         {filters.map((filter, i) => (
//                             <Tag key={i} color="blue" size="small">{filter}</Tag>
//                         ))}
//                     </div>
//                 ) : <span style={{ color: "#ccc" }}>—</span>;
//             },
//         },
//         {
//             title: "Действия",
//             key: "actions",
//             width: 150,
//             render: (_, record) => (
//                 <Space size="small">
//                     <Button
//                         type="default"
//                         size="small"
//                         icon={<CloudDownloadOutlined />}
//                         loading={generating[record.id]}
//                         onClick={() => handleGeneratePricelist(record.id)}
//                         title="Сгенерировать прайс-лист"
//                     />
//                     <Button
//                         type="primary"
//                         size="small"
//                         icon={<EditOutlined />}
//                         onClick={() => openConfigModal(record)}
//                     />
//                     <Popconfirm
//                         title="Удалить конфигурацию?"
//                         description="Это действие необратимо"
//                         onConfirm={() => handleDeleteConfig(record.id)}
//                         okText="Да"
//                         cancelText="Нет"
//                     >
//                         <Button type="primary" danger size="small" icon={<DeleteOutlined />} />
//                     </Popconfirm>
//                 </Space>
//             ),
//         },
//     ];
//
//     if (loading) {
//         return (
//             <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
//                 <Spin size="large" />
//             </div>
//         );
//     }
//
//     return (
//         <div style={{ margin: 20 }}>
//             <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
//                 <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
//                     Назад к списку
//                 </Button>
//
//                 {!isNew && (
//                     <Popconfirm
//                         title="Удалить клиента?"
//                         description="Это действие необратимо"
//                         onConfirm={handleDeleteCustomer}
//                         okText="Да"
//                         cancelText="Нет"
//                     >
//                         <Button danger>Удалить клиента</Button>
//                     </Popconfirm>
//                 )}
//             </div>
//
//             <Title level={2}>
//                 {isNew
//                     ? "Создание клиента"
//                     : `Клиент: ${customerData?.name ?? "..."}`}
//             </Title>
//
//             {/* Форма клиента */}
//             <Card title="Основная информация" style={{ marginBottom: 20 }}>
//                 <Form form={customerForm} layout="vertical" onFinish={handleCustomerSubmit}>
//                     <Form.Item
//                         name="name"
//                         label="Название"
//                         rules={[
//                             { required: true, whitespace: true, message: 'Введите название клиента' },
//                             { validator: (_, v) => {
//                                     const val = (v ?? '').trim();
//                                     if (!val) return Promise.reject('Название не может быть пустым');
//                                     return Promise.resolve();
//                                 }
//                             }
//                         ]}
//                         normalize={(v) => (v ?? '').trim()}
//                     >
//                         <Input placeholder="Название клиента" />
//                     </Form.Item>
//
//                     <Form.Item
//                         name="type_prices"
//                         label="Тип цен"
//                         rules={[{ required: true, message: "Выберите тип цен" }]}
//                     >
//                         <Select
//                             options={[
//                                 { value: "WHOLESALE", label: "Оптовые" },
//                                 { value: "RETAIL", label: "Розничные" },
//                             ]}
//                             placeholder="Выберите тип цен"
//                         />
//                     </Form.Item>
//
//                     <Form.Item
//                         name="email_contact"
//                         label="Контактный Email"
//                         rules={[{ type: "email", message: "Введите корректный email" }]}
//                     >
//                         <Input placeholder="contact@client.com" />
//                     </Form.Item>
//
//                     <Form.Item
//                         name="email_outgoing_price"
//                         label="Email исходящих прайсов"
//                         rules={[{ type: "email", message: "Введите корректный email" }]}
//                     >
//                         <Input placeholder="prices@client.com" />
//                     </Form.Item>
//
//                     <Form.Item name="description" label="Описание">
//                         <Input.TextArea rows={3} placeholder="Описание клиента" />
//                     </Form.Item>
//
//                     <Form.Item name="comment" label="Комментарий">
//                         <Input.TextArea rows={2} placeholder="Дополнительные комментарии" />
//                     </Form.Item>
//
//                     <Form.Item>
//                         <Button
//                             type="primary"
//                             htmlType="submit"
//                             loading={saving}
//                             icon={<SaveOutlined />}
//                         >
//                             {isNew ? "Создать клиента" : "Сохранить изменения"}
//                         </Button>
//                     </Form.Item>
//                 </Form>
//             </Card>
//
//             {/* Блоки только для существующего клиента */}
//             {!isNew && customerData && (
//                 <>
//                     {/* Конфигурации прайс-листов */}
//                     <Card
//                         title="Конфигурации прайс-листов"
//                         extra={
//                             <Button type="primary" icon={<PlusOutlined />} onClick={() => openConfigModal()}>
//                                 Добавить конфигурацию
//                             </Button>
//                         }
//                     >
//                         <Table
//                             rowKey="id"
//                             columns={configColumns}
//                             dataSource={customerData.pricelist_configs || []}
//                             pagination={false}
//                             size="middle"
//                             locale={{ emptyText: "Конфигурации не настроены" }}
//                             scroll={{ x: 900 }}
//                         />
//                     </Card>
//
//                     {/* Информация о прайс-листах */}
//                     {customerData.customer_price_lists && customerData.customer_price_lists.length > 0 && (
//                         <Card title="Прайс-листы клиента" style={{ marginTop: 20 }}>
//                             <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
//                                 {customerData.customer_price_lists.map((pricelist) => (
//                                     <div key={pricelist.id} style={{
//                                         border: "1px solid #d9d9d9",
//                                         borderRadius: 6,
//                                         padding: 16,
//                                         minWidth: 200
//                                     }}>
//                                         <div><Text strong>ID:</Text> {pricelist.id}</div>
//                                         <div><Text strong>Дата:</Text> {new Date(pricelist.date).toLocaleDateString()}</div>
//                                         <div><Text strong>Позиций:</Text> {pricelist.autoparts_count}</div>
//                                         <div style={{ marginTop: 8 }}>
//                                             <Tag color={pricelist.is_active ? "green" : "orange"}>
//                                                 {pricelist.is_active ? "Активный" : "Неактивный"}
//                                             </Tag>
//                                         </div>
//                                     </div>
//                                 ))}
//                             </div>
//                         </Card>
//                     )}
//                 </>
//             )}
//
//             {/* Модалка конфигурации */}
//             <Modal
//                 title={editingConfig ? "Редактирование конфигурации" : "Создание конфигурации"}
//                 open={configModalVisible}
//                 onCancel={() => {
//                     setConfigModalVisible(false);
//                     setEditingConfig(null);
//                     configForm.resetFields();
//                 }}
//                 footer={null}
//                 width={800}
//                 destroyOnClose
//             >
//                 <Form form={configForm} layout="vertical" onFinish={handleConfigSubmit}>
//                     <Form.Item
//                         name="name"
//                         label="Название конфигурации"
//                         rules={[{ required: true, message: "Введите название конфигурации" }]}
//                     >
//                         <Input placeholder="Например: Основная конфигурация" />
//                     </Form.Item>
//
//                     <Divider>Настройки наценок (%)</Divider>
//
//                     <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
//                         <Form.Item
//                             name="general_markup"
//                             label="Общая наценка"
//                             initialValue={0}
//                         >
//                             <InputNumber
//                                 min={0}
//                                 max={10}
//                                 step={0.1}
//                                 formatter={value => `${(value * 100).toFixed(1)}%`}
//                                 parser={value => parseFloat(value.replace('%', '')) / 100}
//                                 style={{ width: "100%" }}
//                             />
//                         </Form.Item>
//
//                         <Form.Item
//                             name="own_price_list_markup"
//                             label="Наценка на наш прайс-лист"
//                             initialValue={0}
//                         >
//                             <InputNumber
//                                 min={0}
//                                 max={10}
//                                 step={0.1}
//                                 formatter={value => `${(value * 100).toFixed(1)}%`}
//                                 parser={value => parseFloat(value.replace('%', '')) / 100}
//                                 style={{ width: "100%" }}
//                             />
//                         </Form.Item>
//
//                         <Form.Item
//                             name="third_party_markup"
//                             label="Наценка на сторонние прайс-листы"
//                             initialValue={0}
//                         >
//                             <InputNumber
//                                 min={0}
//                                 max={10}
//                                 step={0.1}
//                                 formatter={value => `${(value * 100).toFixed(1)}%`}
//                                 parser={value => parseFloat(value.replace('%', '')) / 100}
//                                 style={{ width: "100%" }}
//                             />
//                         </Form.Item>
//                     </div>
//
//                     <Divider>Фильтры</Divider>
//
//                     <Form.Item name="brand_filters" label="Фильтр брендов (JSON)">
//                         <Input.TextArea
//                             rows={2}
//                             placeholder='["BMW", "AUDI", "MERCEDES"]'
//                         />
//                     </Form.Item>
//
//                     <Form.Item name="category_filter" label="Фильтр категорий (JSON)">
//                         <Input.TextArea
//                             rows={2}
//                             placeholder='["Двигатель", "Подвеска"]'
//                         />
//                     </Form.Item>
//
//                     <Form.Item name="price_intervals" label="Ценовые интервалы (JSON)">
//                         <Input.TextArea
//                             rows={3}
//                             placeholder='[{"min": 0, "max": 1000, "coefficient": 1.2}, {"min": 1000, "max": 5000, "coefficient": 1.1}]'
//                         />
//                     </Form.Item>
//
//                     <Form.Item>
//                         <Space>
//                             <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
//                                 {editingConfig ? "Обновить" : "Создать"}
//                             </Button>
//                             <Button
//                                 onClick={() => {
//                                     setConfigModalVisible(false);
//                                     setEditingConfig(null);
//                                     configForm.resetFields();
//                                 }}
//                             >
//                                 Отмена
//                             </Button>
//                         </Space>
//                     </Form.Item>
//                 </Form>
//             </Modal>
//         </div>
//     );
// };
//
// export default CustomerPage;

import React from 'react';

const CustomerPage = () => {
    console.log('CustomerPage рендерится');

    return (
        <div style={{ padding: '20px', border: '1px solid blue' }}>
            <h1>Страница клиента</h1>
            <p>Компонент успешно загружен</p>
        </div>
    );
};

export default CustomerPage;