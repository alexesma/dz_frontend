import React, { useEffect, useState } from 'react';
import { Button, Card, Table, message, Tag } from 'antd';
import api from '../api';

const AdminUsers = () => {
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/admin/users', {
                params: { status: 'pending' },
            });
            setUsers(data);
        } catch (err) {
            message.error('Не удалось загрузить пользователей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const approveUser = async (id) => {
        try {
            await api.post(`/admin/users/${id}/approve`);
            message.success('Пользователь подтвержден');
            loadUsers();
        } catch (err) {
            message.error('Ошибка подтверждения');
        }
    };

    const columns = [
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            render: (role) => <Tag>{role}</Tag>,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status) => <Tag color="orange">{status}</Tag>,
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_, record) => (
                <Button type="primary" onClick={() => approveUser(record.id)}>
                    Подтвердить
                </Button>
            ),
        },
    ];

    return (
        <Card title="Пользователи (ожидают подтверждения)">
            <Table
                rowKey="id"
                columns={columns}
                dataSource={users}
                loading={loading}
                pagination={false}
            />
        </Card>
    );
};

export default AdminUsers;
