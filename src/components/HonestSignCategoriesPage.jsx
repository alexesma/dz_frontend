import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
    createHonestSignCategory,
    deleteHonestSignCategory,
    getHonestSignCategories,
    updateHonestSignCategory,
} from '../api/autoparts';

const { Paragraph, Text, Title } = Typography;

const errorText = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        const messages = detail.map((item) => item?.msg).filter(Boolean);
        if (messages.length) return messages.join('; ');
    }
    return fallback;
};

const HonestSignCategoriesPage = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [form] = Form.useForm();

    const loadCategories = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getHonestSignCategories();
            setCategories(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error(errorText(error, 'Не удалось загрузить категории Честного знака'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCategories();
    }, [loadCategories]);

    const filteredCategories = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase('ru-RU');
        if (!needle) return categories;
        return categories.filter((category) => (
            [category.name, category.code, category.description]
                .some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(needle))
        ));
    }, [categories, search]);

    const usedCategories = useMemo(
        () => categories.filter((category) => Number(category.autopart_count || 0) > 0).length,
        [categories]
    );
    const assignmentCount = useMemo(
        () => categories.reduce(
            (total, category) => total + Number(category.autopart_count || 0),
            0
        ),
        [categories]
    );

    const openEditor = (category = null) => {
        setEditingCategory(category);
        form.setFieldsValue({
            name: category?.name || '',
            code: category?.code || '',
            description: category?.description || '',
        });
        setEditorOpen(true);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setEditingCategory(null);
        form.resetFields();
    };

    const saveCategory = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: String(values.name || '').trim(),
                code: String(values.code || '').trim() || null,
                description: String(values.description || '').trim() || null,
            };
            if (editingCategory) {
                await updateHonestSignCategory(editingCategory.id, payload);
                message.success('Категория обновлена');
            } else {
                await createHonestSignCategory(payload);
                message.success('Категория создана');
            }
            closeEditor();
            await loadCategories();
        } catch (error) {
            message.error(errorText(error, 'Не удалось сохранить категорию'));
        } finally {
            setSaving(false);
        }
    };

    const deleteCategory = async (category) => {
        setDeletingId(category.id);
        try {
            await deleteHonestSignCategory(category.id);
            message.success(`Категория «${category.name}» удалена`);
            await loadCategories();
        } catch (error) {
            message.error(errorText(error, 'Не удалось удалить категорию'));
        } finally {
            setDeletingId(null);
        }
    };

    const columns = [
        {
            title: 'Категория',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'),
            render: (value, row) => (
                <div>
                    <Text strong>{value}</Text>
                    <div>
                        {row.code
                            ? <Tag color="blue" style={{ marginTop: 4 }}>{row.code}</Tag>
                            : <Text type="secondary">Код не указан</Text>}
                    </div>
                </div>
            ),
        },
        {
            title: 'Описание',
            dataIndex: 'description',
            key: 'description',
            responsive: ['md'],
            render: (value) => value || <Text type="secondary">—</Text>,
        },
        {
            title: 'Позиций',
            dataIndex: 'autopart_count',
            key: 'autopart_count',
            width: 120,
            sorter: (a, b) => Number(a.autopart_count || 0) - Number(b.autopart_count || 0),
            render: (value, category) => {
                const count = Number(value || 0);
                const tag = <Tag color={count ? 'green' : 'default'}>{count}</Tag>;
                if (!count) return tag;
                return (
                    <Tooltip title="Показать позиции этой категории в номенклатуре">
                        <Link to={`/autoparts/nomenclature?honest_sign_category_id=${category.id}`}>
                            {tag}
                        </Link>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (_, category) => {
                const count = Number(category.autopart_count || 0);
                return (
                    <Space size={4}>
                        <Tooltip title="Редактировать">
                            <Button
                                aria-label={`Редактировать ${category.name}`}
                                icon={<EditOutlined />}
                                onClick={() => openEditor(category)}
                            />
                        </Tooltip>
                        {count > 0 ? (
                            <Tooltip title={`Удаление запрещено: связано позиций — ${count}`}>
                                <span>
                                    <Button
                                        danger
                                        disabled
                                        aria-label={`Нельзя удалить ${category.name}`}
                                        icon={<DeleteOutlined />}
                                    />
                                </span>
                            </Tooltip>
                        ) : (
                            <Popconfirm
                                title={`Удалить категорию «${category.name}»?`}
                                description="Пустая категория будет удалена без возможности восстановления."
                                okText="Удалить"
                                cancelText="Отмена"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => deleteCategory(category)}
                            >
                                <Tooltip title="Удалить пустую категорию">
                                    <Button
                                        danger
                                        aria-label={`Удалить ${category.name}`}
                                        icon={<DeleteOutlined />}
                                        loading={deletingId === category.id}
                                    />
                                </Tooltip>
                            </Popconfirm>
                        )}
                    </Space>
                );
            },
        },
    ];

    return (
        <div>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <div>
                    <Title level={2} style={{ marginBottom: 4 }}>Категории Честного знака</Title>
                    <Paragraph type="secondary">
                        Справочник категорий маркировки, назначаемых карточкам номенклатуры.
                    </Paragraph>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined />} onClick={loadCategories} loading={loading}>
                        Обновить
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
                        Новая категория
                    </Button>
                </Space>
            </Space>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                    <Card size="small"><Statistic title="Всего категорий" value={categories.length} /></Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small"><Statistic title="Используются" value={usedCategories} /></Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small"><Statistic title="Связей с позициями" value={assignmentCount} /></Card>
                </Col>
            </Row>

            <Alert
                showIcon
                type="info"
                icon={<SafetyCertificateOutlined />}
                message="Удалять можно только пустые категории"
                description="Если категория назначена хотя бы одной позиции, удаление заблокировано. Сначала снимите или замените категорию в карточках номенклатуры."
                style={{ marginBottom: 16 }}
            />

            <Card>
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="Найти по названию, коду или описанию"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    style={{ maxWidth: 520, marginBottom: 16 }}
                />
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredCategories}
                    loading={loading}
                    pagination={{ pageSize: 25, showSizeChanger: false }}
                    locale={{ emptyText: search ? 'Категории не найдены' : 'Категорий пока нет' }}
                    scroll={{ x: 680 }}
                />
            </Card>

            <Modal
                open={editorOpen}
                title={editingCategory ? 'Редактирование категории' : 'Новая категория Честного знака'}
                okText={editingCategory ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                confirmLoading={saving}
                onOk={saveCategory}
                onCancel={closeEditor}
                destroyOnClose
            >
                <Form form={form} layout="vertical" preserve={false}>
                    <Form.Item
                        name="name"
                        label="Название"
                        rules={[
                            { required: true, message: 'Введите название категории' },
                            { max: 200, message: 'Не более 200 символов' },
                        ]}
                    >
                        <Input placeholder="Например: Автомобильные масла" autoFocus />
                    </Form.Item>
                    <Form.Item
                        name="code"
                        label="Код товарной группы"
                        extra="Код из Честного знака, например autofluids или tires."
                        rules={[{ max: 50, message: 'Не более 50 символов' }]}
                    >
                        <Input placeholder="autofluids" />
                    </Form.Item>
                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={3} placeholder="Что относится к этой категории" />
                    </Form.Item>
                    {editingCategory && Number(editingCategory.autopart_count || 0) > 0 && (
                        <Alert
                            showIcon
                            type="warning"
                            message={`Категория используется: позиций — ${editingCategory.autopart_count}`}
                            description="Название можно изменить: оно автоматически обновится в связанных карточках. Удаление доступно только после снятия всех связей."
                        />
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default HonestSignCategoriesPage;
