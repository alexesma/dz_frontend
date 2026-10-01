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
    ArrowRightOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
    createHonestSignCategory,
    deleteHonestSignCategory,
    getCatalog,
    getHonestSignCategories,
    updateHonestSignCategory,
} from '../api/autoparts';

const { Paragraph, Text, Title } = Typography;
const POSITIONS_PAGE_SIZE = 20;

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
    const [positionsCategory, setPositionsCategory] = useState(null);
    const [positions, setPositions] = useState([]);
    const [positionsTotal, setPositionsTotal] = useState(0);
    const [positionsPage, setPositionsPage] = useState(1);
    const [positionsLoading, setPositionsLoading] = useState(false);
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

    const loadCategoryPositions = async (category, page = 1) => {
        if (!category?.id) return;
        setPositionsCategory(category);
        setPositionsPage(page);
        setPositionsLoading(true);
        try {
            const { data } = await getCatalog({
                honest_sign_category_id: category.id,
                offset: (page - 1) * POSITIONS_PAGE_SIZE,
                limit: POSITIONS_PAGE_SIZE,
            });
            setPositions(data?.items || []);
            setPositionsTotal(Number(data?.total || 0));
        } catch (error) {
            message.error(errorText(error, 'Не удалось загрузить позиции категории'));
        } finally {
            setPositionsLoading(false);
        }
    };

    const closeCategoryPositions = () => {
        setPositionsCategory(null);
        setPositions([]);
        setPositionsTotal(0);
        setPositionsPage(1);
    };

    const positionColumns = [
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 150,
            render: (value) => value || <Text type="secondary">—</Text>,
        },
        {
            title: 'Артикул',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 180,
            render: (value, position) => (
                <Link
                    to={`/autoparts/nomenclature?honest_sign_category_id=${positionsCategory?.id}&autopart_id=${position.id}&edit=1`}
                >
                    <Text code>{value}</Text>
                </Link>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (value) => value || <Text type="secondary">Без наименования</Text>,
        },
        {
            title: 'Остаток',
            dataIndex: 'stock_quantity',
            key: 'stock_quantity',
            width: 100,
            align: 'right',
            render: (value) => Number(value || 0),
        },
        {
            title: '',
            key: 'open',
            width: 130,
            render: (_, position) => (
                <Link
                    to={`/autoparts/nomenclature?honest_sign_category_id=${positionsCategory?.id}&autopart_id=${position.id}&edit=1`}
                >
                    <Button type="primary" ghost size="small" icon={<EditOutlined />}>
                        Открыть
                    </Button>
                </Link>
            ),
        },
    ];

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
                        <Button
                            type="link"
                            onClick={() => loadCategoryPositions(category, 1)}
                            style={{ height: 'auto', padding: 0 }}
                        >
                            {tag}
                        </Button>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 160,
            render: (_, category) => {
                const count = Number(category.autopart_count || 0);
                return (
                    <Space size={4}>
                        <Tooltip title={count ? 'Показать позиции' : 'В категории нет позиций'}>
                            <Button
                                disabled={!count}
                                aria-label={`Показать позиции ${category.name}`}
                                icon={<UnorderedListOutlined />}
                                onClick={() => loadCategoryPositions(category, 1)}
                            />
                        </Tooltip>
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
                open={Boolean(positionsCategory)}
                centered
                width={1050}
                title={positionsCategory
                    ? `Позиции категории «${positionsCategory.name}»`
                    : 'Позиции категории'}
                onCancel={closeCategoryPositions}
                footer={positionsCategory ? (
                    <Space>
                        <Button onClick={closeCategoryPositions}>Закрыть</Button>
                        <Link
                            to={`/autoparts/nomenclature?honest_sign_category_id=${positionsCategory.id}`}
                        >
                            <Button type="primary" icon={<ArrowRightOutlined />}>
                                Открыть все в Номенклатуре
                            </Button>
                        </Link>
                    </Space>
                ) : null}
                destroyOnClose
            >
                <Paragraph type="secondary">
                    Нажмите на артикул или «Открыть», чтобы перейти прямо к редактированию
                    карточки товара.
                </Paragraph>
                <Table
                    rowKey="id"
                    size="small"
                    columns={positionColumns}
                    dataSource={positions}
                    loading={positionsLoading}
                    scroll={{ x: 760 }}
                    pagination={{
                        current: positionsPage,
                        pageSize: POSITIONS_PAGE_SIZE,
                        total: positionsTotal,
                        showSizeChanger: false,
                        showTotal: (total) => `Всего позиций: ${total}`,
                        onChange: (page) => loadCategoryPositions(positionsCategory, page),
                    }}
                    locale={{ emptyText: 'В категории нет позиций' }}
                />
            </Modal>

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
