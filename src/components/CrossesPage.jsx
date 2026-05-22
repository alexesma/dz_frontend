import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
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
import { lookupBrands } from '../api/brands';
import {
    createCross,
    deleteCross,
    listCrosses,
    updateCross,
} from '../api/crosses';

const CrossesPage = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [sourceOptions, setSourceOptions] = useState([]);
    const [brandOptions, setBrandOptions] = useState([]);
    const [form] = Form.useForm();

    const loadRows = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await listCrosses(query ? { q: query } : {});
            setRows(Array.isArray(data) ? data : []);
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

    const loadBrandOptions = useCallback(async (search) => {
        const normalized = String(search || '').trim();
        try {
            const { data } = await lookupBrands(normalized, 30);
            setBrandOptions(
                (Array.isArray(data) ? data : []).map((item) => ({
                    value: item.id,
                    label: item.name,
                }))
            );
        } catch (error) {
            console.error('Load brands error:', error);
        }
    }, []);

    const openCreateModal = () => {
        setEditingRow(null);
        form.resetFields();
        form.setFieldsValue({ priority: 100 });
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
        setBrandOptions([
            {
                value: row.cross_brand_id,
                label: row.cross_brand_name || '—',
            },
        ]);
        form.setFieldsValue({
            source_autopart_id: row.source_autopart_id,
            cross_brand_id: row.cross_brand_id,
            cross_oem_number: row.cross_oem_number,
            priority: row.priority,
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
                title: 'Приоритет',
                dataIndex: 'priority',
                key: 'priority',
                width: 110,
                render: (value) => <Tag color="blue">{value}</Tag>,
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
                        name="cross_brand_id"
                        label="Бренд кросса"
                        rules={[{ required: true, message: 'Выберите бренд кросса' }]}
                    >
                        <Select
                            showSearch
                            filterOption={false}
                            placeholder="Начните вводить бренд"
                            options={brandOptions}
                            onSearch={loadBrandOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name="cross_oem_number"
                        label="OEM кросса"
                        rules={[{ required: true, message: 'Введите OEM кросса' }]}
                    >
                        <Input placeholder="Например, 1002026E00" />
                    </Form.Item>
                    <Form.Item name="priority" label="Приоритет">
                        <InputNumber min={1} style={{ width: '100%' }} />
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
