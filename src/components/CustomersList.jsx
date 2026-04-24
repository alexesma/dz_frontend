// import React, { useEffect, useState } from 'react';
// import { Table, Input, Button, message, Spin, Tag, Space, Card } from 'antd';
// import { SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
// import { Link } from 'react-router-dom';
// import api from "../api.js";
// import { useNavigate } from 'react-router-dom';
//
// const { Search } = Input;
//
// const CustomersList = () => {
//     const [customers, setCustomers] = useState([]);
//     const [loading, setLoading] = useState(false);
//     const [pagination, setPagination] = useState({
//         current: 1,
//         pageSize: 10,
//         total: 0,
//         showSizeChanger: true,
//         showQuickJumper: true,
//         pageSizeOptions: ['10', '20', '50', '100'],
//         showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} клиентов`,
//     });
//     const [searchText, setSearchText] = useState('');
//     const navigate = useNavigate();
//
//     useEffect(() => {
//         fetchCustomers();
//     }, []);
//
//     const fetchCustomers = async (page = 1, pageSize = 10, search = '') => {
//         setLoading(true);
//         try {
//             const params = {
//                 page,
//                 page_size: pageSize,
//             };
//
//             if (search) {
//                 params.search = search;
//             }
//
//             const response = await api.get('/customers/', { params });
//
//             // Если API возвращает данные напрямую как массив
//             if (Array.isArray(response.data)) {
//                 setCustomers(response.data);
//                 setPagination(prev => ({
//                     ...prev,
//                     current: page,
//                     pageSize: pageSize,
//                     total: response.data.length,
//                 }));
//             } else {
//                 // Если API возвращает объект с пагинацией
//                 setCustomers(response.data.items || response.data);
//                 setPagination(prev => ({
//                     ...prev,
//                     current: response.data.page || page,
//                     pageSize: response.data.page_size || pageSize,
//                     total: response.data.total || response.data.length,
//                 }));
//             }
//         } catch (error) {
//             message.error('Ошибка загрузки клиентов.');
//             console.error('Fetch customers error:', error);
//         } finally {
//             setLoading(false);
//         }
//     };
//
//     const handleSearch = (value) => {
//         setSearchText(value);
//         setPagination(prev => ({ ...prev, current: 1 }));
//         fetchCustomers(1, pagination.pageSize, value);
//     };
//
//     const handleTableChange = (paginationConfig) => {
//         setPagination(paginationConfig);
//         fetchCustomers(paginationConfig.current, paginationConfig.pageSize, searchText);
//     };
//
//     const handleRefresh = () => {
//         fetchCustomers(pagination.current, pagination.pageSize, searchText);
//     };
//
//     const handleEdit = (id) => {
//         navigate(`/customers/${id}/edit`);
//     };
//
//     const handleDelete = async (customerId) => {
//         try {
//             await api.delete(`/customers/${customerId}/`);
//             message.success('Клиент успешно удален');
//             fetchCustomers(pagination.current, pagination.pageSize, searchText);
//         } catch (error) {
//             message.error('Ошибка при удалении клиента');
//             console.error('Delete customer error:', error);
//         }
//     };
//
//     const handleAddCustomer = () => {
//         navigate('/customers/create');
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
//     const getTypePricesColor = (type) => {
//         const colors = {
//             'WHOLESALE': 'blue',
//             'RETAIL': 'green'
//         };
//         return colors[type] || 'default';
//     };
//
//     const columns = [
//         {
//             title: 'ID',
//             dataIndex: 'id',
//             key: 'id',
//             width: 70,
//             sorter: true,
//         },
//         {
//             title: 'Название',
//             dataIndex: 'name',
//             key: 'name',
//             render: (text, record) => (
//                 <div>
//                     <div style={{ fontWeight: 'bold' }}>{text}</div>
//                     {record.description && (
//                         <div style={{ fontSize: '12px', color: '#666' }}>
//                             {record.description}
//                         </div>
//                     )}
//                 </div>
//             ),
//         },
//         {
//             title: 'Тип цен',
//             dataIndex: 'type_prices',
//             key: 'type_prices',
//             render: (type) => (
//                 <Tag color={getTypePricesColor(type)}>
//                     {getTypePricesLabel(type)}
//                 </Tag>
//             ),
//         },
//         {
//             title: 'Контактный Email',
//             dataIndex: 'email_contact',
//             key: 'email_contact',
//             render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
//         },
//         {
//             title: 'Email исходящих прайсов',
//             dataIndex: 'email_outgoing_price',
//             key: 'email_outgoing_price',
//             render: (email) => email || <span style={{ color: '#ccc' }}>—</span>,
//         },
//         {
//             title: 'Прайс-листы',
//             key: 'price_lists',
//             render: (text, record) => {
//                 const priceLists = record.customer_price_lists || [];
//                 const totalCount = priceLists.length;
//
//                 if (totalCount === 0) {
//                     return <Tag color="default">Нет прайсов</Tag>;
//                 }
//
//                 return (
//                     <div>
//                         <Tag color="blue">Всего: {totalCount}</Tag>
//                         {priceLists.length > 0 && (
//                             <div style={{ fontSize: '12px', color: '#666' }}>
//                                 Последний: {new Date(priceLists[priceLists.length - 1]?.date).toLocaleDateString()}
//                             </div>
//                         )}
//                     </div>
//                 );
//             },
//         },
//         {
//             title: 'Конфигурации прайса',
//             key: 'pricelist_configs',
//             render: (_, record) => {
//                 const configs = record.pricelist_configs || [];
//
//                 if (configs.length === 0) {
//                     return <Tag color="red">Не настроено</Tag>;
//                 }
//
//                 return (
//                     <Space direction="vertical" size={2}>
//                         <Tag color="green">Настроено ({configs.length})</Tag>
//                         {configs.slice(0, 1).map(config => (
//                             <div key={config.id} style={{fontSize: 12}}>
//                                 <Link to={`/customer-configs/${config.id}`}>
//                                     {config.name || `Конфиг #${config.id}`}
//                                 </Link>
//                             </div>
//                         ))}
//                         {configs.length > 1 && (
//                             <div style={{fontSize: 11, color: '#666'}}>
//                                 и ещё {configs.length - 1}
//                             </div>
//                         )}
//                     </Space>
//                 );
//             },
//         },
//         {
//             title: 'Комментарий',
//             dataIndex: 'comment',
//             key: 'comment',
//             render: (comment) => {
//                 if (!comment) return <span style={{ color: '#ccc' }}>—</span>;
//                 return comment.length > 50 ? `${comment.substring(0, 50)}...` : comment;
//             },
//         },
//         {
//             title: 'Действия',
//             key: 'actions',
//             width: 120,
//             render: (text, record) => (
//                 <Space size="small">
//                     <Button
//                         type="primary"
//                         size="small"
//                         icon={<EditOutlined />}
//                         onClick={() => handleEdit(record.id)}
//                     />
//                     <Button
//                         type="primary"
//                         danger
//                         size="small"
//                         icon={<DeleteOutlined />}
//                         onClick={() => handleDelete(record.id)}
//                     />
//                 </Space>
//             ),
//         },
//     ];
//
//     return (
//         <Card title="Список клиентов" style={{ margin: '20px' }}>
//             <div style={{ marginBottom: 16 }}>
//                 <Space style={{ width: '100%', justifyContent: 'space-between' }}>
//                     <Space>
//                         <Search
//                             placeholder="Поиск по названию клиента"
//                             allowClear
//                             enterButton={<SearchOutlined />}
//                             size="middle"
//                             style={{ width: 300 }}
//                             onSearch={handleSearch}
//                             value={searchText}
//                             onChange={(e) => setSearchText(e.target.value)}
//                         />
//                         <Button
//                             icon={<ReloadOutlined />}
//                             onClick={handleRefresh}
//                             loading={loading}
//                         >
//                             Обновить
//                         </Button>
//                     </Space>
//                     <Button
//                         type="primary"
//                         icon={<PlusOutlined />}
//                         onClick={handleAddCustomer}
//                         size="middle"
//                     >
//                         Добавить клиента
//                     </Button>
//                 </Space>
//             </div>
//
//             <Spin spinning={loading}>
//                 <Table
//                     rowKey="id"
//                     columns={columns}
//                     dataSource={customers}
//                     pagination={pagination}
//                     onChange={handleTableChange}
//                     scroll={{ x: 1400 }}
//                     size="middle"
//                 />
//             </Spin>
//         </Card>
//     );
// };
//
// export default CustomersList;

import React from 'react';

const CustomersList = () => {
    console.log('CustomersList рендерится');

    return (
        <div style={{ padding: '20px', border: '1px solid red' }}>
            <h1>Список клиентов</h1>
            <p>Компонент успешно загружен</p>
        </div>
    );
};

export default CustomersList;