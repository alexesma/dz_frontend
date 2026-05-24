import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    List,
    Modal,
    Popconfirm,
    Radio,
    Select,
    Space,
    Table,
    Tag,
    message,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { searchAutopartsByOem } from '../api/autoparts';
import {
    createCross,
    deleteCross,
    listCrossGroups,
    listCrosses,
    updateCross,
} from '../api/crosses';

const CrossesPage = () => {
    const [rows, setRows] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [sourceOptions, setSourceOptions] = useState([]);
    const [targetOptions, setTargetOptions] = useState([]);
    const [form] = Form.useForm();

    const loadRows = useCallback(async () => {
        setLoading(true);
        const normalizedQuery = String(query || '').trim();
        try {
            const [rowsResponse, groupsResponse] = await Promise.all([
                listCrosses(normalizedQuery ? { q: normalizedQuery } : {}),
                normalizedQuery
                    ? listCrossGroups({ q: normalizedQuery })
                    : Promise.resolve({ data: [] }),
            ]);
            setRows(Array.isArray(rowsResponse?.data) ? rowsResponse.data : []);
            setGroups(
                Array.isArray(groupsResponse?.data) ? groupsResponse.data : []
            );
        } catch (error) {
            console.error('Load crosses error:', error);
            message.error('Не удалось загрузить кроссы');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    const loadSourceOptions = useCallback(async (search) => {
        const normalized = String(search || '').trim();
        if (!normalized) {
            setSourceOptions([]);
            return;
        }
        try {
            const { data } = await searchAutopartsByOem(normalized, 20);
            setSourceOptions(
                (Array.isArray(data) ? data : []).map((item) => ({
                    value: item.id,
                    label: `${item.brand} ${item.oem_number} · ${item.name || '—'}`,
                }))
            );
        } catch (error) {
            console.error('Load source autoparts error:', error);
        }
    }, []);

    const loadTargetOptions = useCallback(async (search) => {
        const normalized = String(search || '').trim();
        if (!normalized) {
            setTargetOptions([]);
            return;
        }
        try {
            const { data } = await searchAutopartsByOem(normalized, 20);
            setTargetOptions(
                (Array.isArray(data) ? data : []).map((item) => ({
                    value: item.id,
                    label: `${item.brand} ${item.oem_number} · ${item.name || '—'}`,
                }))
            );
        } catch (error) {
            console.error('Load target autoparts error:', error);
        }
    }, []);

    const openCreateModal = () => {
        setEditingRow(null);
        form.resetFields();
        form.setFieldsValue({ is_bidirectional: true });
        setModalOpen(true);
    };

    const openEditModal = (row) => {
        setEditingRow(row);
        setSourceOptions([
            {
                value: row.source_autopart_id,
                label: `${row.source_brand_name || '—'} ${row.source_oem_number} · ${row.source_name || '—'}`,
            },
        ]);
        setTargetOptions(
            row.cross_autopart_id
                ? [
                      {
                          value: row.cross_autopart_id,
                          label: `${row.cross_brand_name || '—'} ${row.cross_oem_number} · ${row.cross_autopart_name || '—'}`,
                      },
                  ]
                : []
        );
        form.setFieldsValue({
            source_autopart_id: row.source_autopart_id,
            cross_autopart_id: row.cross_autopart_id || undefined,
            is_bidirectional: row.is_bidirectional !== false,
            comment: row.comment,
        });
        setModalOpen(true);
    };

    const handleSave = async (values) => {
        setSaving(true);
        try {
            if (editingRow) {
                await updateCross(editingRow.id, values);
                message.success('Кросс обновлён');
            } else {
                await createCross(values);
                message.success('Кросс добавлен');
            }
            setModalOpen(false);
            form.resetFields();
            loadRows();
        } catch (error) {
            console.error('Save cross error:', error);
            message.error(
                error?.response?.data?.detail || 'Не удалось сохранить кросс'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteCross(id);
            message.success('Кросс удалён');
            loadRows();
        } catch (error) {
            console.error('Delete cross error:', error);
            message.error('Не удалось удалить кросс');
        }
    };

    const columns = [
            {
                title: 'Исходная позиция',
                key: 'source',
                width: 260,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 600 }}>
                            {row.source_brand_name || '—'} {row.source_oem_number}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.source_name || '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Кросс',
                key: 'cross',
                width: 220,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 600 }}>
                            {row.cross_brand_name || '—'} {row.cross_oem_number}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.cross_autopart_name || 'Связь по OEM/бренду'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Тип связи',
                key: 'is_bidirectional',
                width: 220,
                render: (_, row) => (
                    <Space size={4} wrap>
                        <Tag color={row.is_bidirectional === false ? 'orange' : 'green'}>
                            {row.is_bidirectional === false ? 'Односторонний' : 'Взаимный'}
                        </Tag>
                        {String(row.comment || '').includes('Автокросс') ? (
                            <Tag>Автокросс</Tag>
                        ) : null}
                    </Space>
                ),
            },
            {
                title: 'Комментарий',
                dataIndex: 'comment',
                key: 'comment',
                ellipsis: true,
            },
            {
                title: '',
                key: 'actions',
                width: 110,
                render: (_, row) => (
                    <Space size="small">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(row)}
                        />
                        <Popconfirm
                            title="Удалить кросс?"
                            okText="Да"
                            cancelText="Нет"
                            onConfirm={() => handleDelete(row.id)}
                        >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Space>
                ),
            },
        ];

    return (
        <Card title="Кроссы" style={{ margin: 20 }}>
            <Space style={{ marginBottom: 16 }} wrap>
                <Input.Search
                    allowClear
                    placeholder="Поиск по OEM, бренду или названию"
                    style={{ width: 320 }}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onSearch={loadRows}
                />
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateModal}
                >
                    Добавить кросс
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
                    Обновить
                </Button>
            </Space>

            {String(query || '').trim() ? (
                <Card
                    size="small"
                    title="Полный список взаимных кроссов по найденной позиции"
                    style={{ marginBottom: 16 }}
                >
                    <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
                        Здесь показана вся связанная группа с транзитивностью для
                        взаимных кроссов. Отдельные строки ниже остаются таблицей
                        для редактирования.
                    </div>
                    {groups.length ? (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            {groups.map((group) => (
                                <Card
                                    key={group.anchor_autopart_id}
                                    type="inner"
                                    size="small"
                                    title={`${group.anchor_brand_name || '—'} ${group.anchor_oem_number}`}
                                    extra={`${group.member_count} связ.`}
                                >
                                    <div
                                        style={{
                                            color: '#64748b',
                                            fontSize: 12,
                                            marginBottom: 8,
                                        }}
                                    >
                                        {group.anchor_name || '—'}
                                    </div>
                                    <List
                                        size="small"
                                        dataSource={group.members || []}
                                        renderItem={(item) => (
                                            <List.Item key={`${item.autopart_id}:${item.brand_id}:${item.oem_number}`}>
                                                <div style={{ width: '100%' }}>
                                                    <div style={{ fontWeight: 600 }}>
                                                        {item.brand_name || '—'} {item.oem_number}
                                                    </div>
                                                    <div
                                                        style={{
                                                            color: '#64748b',
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {item.name || '—'}
                                                    </div>
                                                </div>
                                            </List.Item>
                                        )}
                                    />
                                </Card>
                            ))}
                        </Space>
                    ) : (
                        <div style={{ color: '#64748b' }}>
                            По этому поиску пока не найдено полной взаимной группы.
                        </div>
                    )}
                </Card>
            ) : null}

            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 20 }}
                scroll={{ x: 900 }}
            />

            <Modal
                title={editingRow ? 'Редактирование кросса' : 'Новый кросс'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                okText={editingRow ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item
                        name="source_autopart_id"
                        label="Исходная позиция"
                        rules={[{ required: true, message: 'Выберите исходную позицию' }]}
                    >
                        <Select
                            showSearch
                            filterOption={false}
                            placeholder="Начните вводить OEM или бренд"
                            options={sourceOptions}
                            onSearch={loadSourceOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name="cross_autopart_id"
                        label="Связанная позиция"
                        rules={[{ required: true, message: 'Выберите связанную позицию' }]}
                    >
                        <Select
                            showSearch
                            filterOption={false}
                            placeholder="Начните вводить OEM или бренд связанной позиции"
                            options={targetOptions}
                            onSearch={loadTargetOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name="is_bidirectional"
                        label="Тип связи"
                        initialValue={true}
                    >
                        <Radio.Group>
                            <Radio value={true}>Взаимный</Radio>
                            <Radio value={false}>Односторонний</Radio>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item name="comment" label="Комментарий">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default CrossesPage;
