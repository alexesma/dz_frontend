import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, message } from 'antd';
import api from '../api';

const ROLE_OPTIONS = [
    { value: 'manager', label: 'manager' },
    { value: 'admin', label: 'admin' },
];

const STATUS_OPTIONS = [
    { value: 'pending', label: 'pending' },
    { value: 'active', label: 'active' },
    { value: 'disabled', label: 'disabled' },
];

const FILTER_OPTIONS = [
    { value: 'pending', label: 'Ожидают подтверждения' },
    { value: 'active', label: 'Активные' },
    { value: 'disabled', label: 'Отключенные' },
    { value: 'all', label: 'Все' },
];

const STATUS_COLORS = {
    pending: 'orange',
    active: 'green',
    disabled: 'red',
};

const toDraft = (user) => ({
    name: user?.name || '',
    role: user?.role || 'manager',
    status: user?.status || 'pending',
});

const AdminUsers = () => {
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [drafts, setDrafts] = useState({});
    const [savingById, setSavingById] = useState({});

    const loadUsers = async (nextFilter = statusFilter) => {
        setLoading(true);
        try {
            const params = nextFilter === 'all'
                ? {}
                : { status: nextFilter };
            const { data } = await api.get('/admin/users', { params });
            setUsers(data);
            const nextDrafts = {};
            data.forEach((user) => {
                nextDrafts[user.id] = toDraft(user);
            });
            setDrafts(nextDrafts);
        } catch (err) {
            console.error('Failed to load users', err);
            message.error('Не удалось загрузить пользователей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const setDraftField = (id, field, value) => {
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                ...(prev[id] || {}),
                [field]: value,
            },
        }));
    };

    const saveUser = async (id, overrides = {}) => {
        const draft = drafts[id] || {};
        const payload = {
            name: (overrides.name ?? draft.name ?? '').trim() || null,
            role: overrides.role ?? draft.role ?? 'manager',
            status: overrides.status ?? draft.status ?? 'pending',
        };
        setSavingById((prev) => ({ ...prev, [id]: true }));
        try {
            await api.patch(`/admin/users/${id}`, payload);
            message.success('Пользователь обновлен');
            await loadUsers(statusFilter);
        } catch (err) {
            console.error('Failed to update user', err);
            const detail = err?.response?.data?.detail || 'Ошибка обновления';
            message.error(detail);
        } finally {
            setSavingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    const approveUser = async (id) => {
        setDraftField(id, 'status', 'active');
        await saveUser(id, { status: 'active' });
    };

    const columns = [
        {
            title: 'Имя',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (_, record) => (
                <Input
                    value={drafts[record.id]?.name || ''}
                    onChange={(e) => setDraftField(
                        record.id,
                        'name',
                        e.target.value,
                    )}
                    placeholder="Имя"
                />
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            width: 160,
            render: (_, record) => (
                <Select
                    value={drafts[record.id]?.role || 'manager'}
                    style={{ width: '100%' }}
                    options={ROLE_OPTIONS}
                    onChange={(value) => setDraftField(record.id, 'role', value)}
                />
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 180,
            render: (_, record) => (
                <Select
                    value={drafts[record.id]?.status || 'pending'}
                    style={{ width: '100%' }}
                    options={STATUS_OPTIONS}
                    onChange={(value) => setDraftField(
                        record.id,
                        'status',
                        value,
                    )}
                />
            ),
        },
        {
            title: 'Текущий',
            dataIndex: 'status',
            key: 'status_tag',
            width: 120,
            render: (status) => (
                <Tag color={STATUS_COLORS[status] || 'default'}>{status}</Tag>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 250,
            render: (_, record) => (
                <Space>
                    <Button
                        type="primary"
                        loading={Boolean(savingById[record.id])}
                        onClick={() => saveUser(record.id)}
                    >
                        Сохранить
                    </Button>
                    {record.status !== 'active' && (
                        <Button
                            onClick={() => approveUser(record.id)}
                            loading={Boolean(savingById[record.id])}
                        >
                            Подтвердить
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Card title="Пользователи">
            <Space style={{ marginBottom: 12 }}>
                <span>Фильтр:</span>
                <Select
                    value={statusFilter}
                    options={FILTER_OPTIONS}
                    style={{ width: 260 }}
                    onChange={setStatusFilter}
                />
            </Space>
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
