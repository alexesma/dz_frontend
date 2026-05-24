import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
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
    createInvalidCross,
    deleteInvalidCross,
    listInvalidCrosses,
    updateInvalidCross,
} from '../api/crosses';

const InvalidCrossesPage = () => {
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
            const { data } = await listInvalidCrosses(query ? { q: query } : {});
            setRows(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Load invalid crosses error:', error);
            message.error('Не удалось загрузить неверные кроссы');
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
        setBrandOptions(
            row.invalid_brand_id
                ? [
                      {
                          value: row.invalid_brand_id,
                          label: row.invalid_brand_name || '—',
                      },
                  ]
                : []
        );
        form.setFieldsValue({
            source_autopart_id: row.source_autopart_id,
            invalid_brand_id: row.invalid_brand_id,
            invalid_brand_name: row.invalid_brand_id ? undefined : row.invalid_brand_name,
            invalid_oem_number: row.invalid_oem_number,
            comment: row.comment,
        });
        setModalOpen(true);
    };

    const handleSave = async (values) => {
        setSaving(true);
        try {
            const brandId = values.invalid_brand_id ?? null;
            const brandName = String(values.invalid_brand_name || '').trim();
            if (!brandId && !brandName) {
                message.warning(
                    'Укажи бренд неверного кросса: выбери из справочника или введи вручную'
                );
                return;
            }
            if (editingRow) {
                await updateInvalidCross(editingRow.id, {
                    ...values,
                    invalid_brand_name: brandId ? undefined : brandName,
                });
                message.success('Неверный кросс обновлён');
            } else {
                await createInvalidCross({
                    ...values,
                    invalid_brand_name: brandId ? undefined : brandName,
                });
                message.success('Неверный кросс добавлен');
            }
            setModalOpen(false);
            form.resetFields();
            loadRows();
        } catch (error) {
            console.error('Save invalid cross error:', error);
            message.error(
                error?.response?.data?.detail ||
                    'Не удалось сохранить неверный кросс'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteInvalidCross(id);
            message.success('Неверный кросс удалён');
            loadRows();
        } catch (error) {
            console.error('Delete invalid cross error:', error);
            message.error('Не удалось удалить неверный кросс');
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
                title: 'Исключённый кросс',
                key: 'invalid',
                width: 240,
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 600 }}>
                            {row.invalid_brand_name || '—'} {row.invalid_oem_number}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.invalid_autopart_name || 'Исключение по бренду и OEM'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Статус',
                key: 'status',
                width: 120,
                render: () => <Tag color="red">исключён</Tag>,
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
                            title="Удалить исключение?"
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
        <Card title="Неверные кроссы" style={{ margin: 20 }}>
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
                    Добавить исключение
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
                title={editingRow ? 'Редактирование неверного кросса' : 'Новое исключение'}
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
                        name="invalid_brand_id"
                        label="Бренд неверного кросса"
                    >
                        <Select
                            allowClear
                            showSearch
                            filterOption={false}
                            placeholder="Выбери бренд из справочника, если он уже есть"
                            options={brandOptions}
                            onSearch={loadBrandOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name="invalid_brand_name"
                        label="Или бренд вручную"
                    >
                        <Input placeholder="Например, HOT-PARTS" />
                    </Form.Item>
                    <Form.Item
                        name="invalid_oem_number"
                        label="OEM неверного кросса"
                        rules={[{ required: true, message: 'Введите OEM' }]}
                    >
                        <Input placeholder="Например, SMD323978" />
                    </Form.Item>
                    <Form.Item name="comment" label="Комментарий">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default InvalidCrossesPage;
