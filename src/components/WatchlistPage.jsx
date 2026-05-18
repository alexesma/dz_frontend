import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { EditOutlined } from '@ant-design/icons';
import {
    createWatchItem,
    deleteWatchItem,
    getWatchItems,
    updateWatchItem,
} from '../api/watchlist';
import { formatMoscow } from '../utils/time';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SEARCH = '';

const WatchlistPage = () => {
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [page, setPage] = useState(DEFAULT_PAGE);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState(DEFAULT_SEARCH);
    const [editingItem, setEditingItem] = useState(null);

    const fetchItems = useCallback(async (nextPage, nextSize, nextSearch) => {
        const effectivePage = nextPage ?? DEFAULT_PAGE;
        const effectiveSize = nextSize ?? DEFAULT_PAGE_SIZE;
        const effectiveSearch = nextSearch ?? DEFAULT_SEARCH;
        setLoading(true);
        try {
            const { data } = await getWatchItems({
                page: effectivePage,
                page_size: effectiveSize,
                search: effectiveSearch || undefined,
            });
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch {
            message.error('Не удалось загрузить список');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems(DEFAULT_PAGE, DEFAULT_PAGE_SIZE, DEFAULT_SEARCH);
    }, [fetchItems]);

    const handleCreate = async (values) => {
        try {
            await createWatchItem(values);
            message.success('Позиция добавлена');
            createForm.resetFields();
            fetchItems(1, pageSize, search);
        } catch {
            message.error('Ошибка добавления');
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteWatchItem(id);
            message.success('Позиция удалена');
            fetchItems(page, pageSize, search);
        } catch {
            message.error('Ошибка удаления');
        }
    };

    const handleOpenEdit = (item) => {
        setEditingItem(item);
        editForm.setFieldsValue({
            brand: item.brand,
            oem: item.oem,
            max_price: item.max_price,
        });
    };

    const handleCloseEdit = () => {
        setEditingItem(null);
        editForm.resetFields();
    };

    const handleSaveEdit = async () => {
        if (!editingItem) {
            return;
        }
        try {
            const values = await editForm.validateFields();
            setSavingEdit(true);
            await updateWatchItem(editingItem.id, values);
            message.success('Позиция обновлена');
            handleCloseEdit();
            fetchItems(page, pageSize, search);
        } catch (err) {
            if (err?.errorFields) {
                return;
            }
            message.error('Не удалось обновить позицию');
        } finally {
            setSavingEdit(false);
        }
    };

    const columns = [
        {
            title: 'Бренд',
            dataIndex: 'brand',
            key: 'brand',
            render: (value) => <Typography.Text strong>{value}</Typography.Text>,
        },
        { title: 'Артикул', dataIndex: 'oem', key: 'oem' },
        {
            title: 'Цена ≤',
            dataIndex: 'max_price',
            key: 'max_price',
            render: (value) => (
                value != null ? <Tag color="gold">{value}</Tag> : <Typography.Text type="secondary">Без лимита</Typography.Text>
            ),
        },
        {
            title: 'Прайсы поставщиков',
            key: 'provider',
            render: (_, record) => (
                <>
                    <div>Цена: {record.last_seen_provider_price ?? '-'}</div>
                    <div>Когда: {formatMoscow(record.last_seen_provider_at)}</div>
                </>
            ),
        },
        {
            title: 'Сайт Dragonzap',
            key: 'site',
            render: (_, record) => (
                <>
                    <div>Цена: {record.last_seen_site_price ?? '-'}</div>
                    <div>Когда: {formatMoscow(record.last_seen_site_at)}</div>
                </>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_, record) => (
                <Space wrap>
                    <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEdit(record)}
                    >
                        Редактировать
                    </Button>
                    <Popconfirm
                        title="Удалить позицию?"
                        description="Это действие необратимо"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button danger size="small">Удалить</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Card title="Отслеживание позиций">
                <Form
                    form={createForm}
                    layout="inline"
                    onFinish={handleCreate}
                    style={{ marginBottom: 16 }}
                >
                    <Form.Item
                        name="brand"
                        rules={[{ required: true, message: 'Бренд' }]}
                    >
                        <Input placeholder="Бренд" />
                    </Form.Item>
                    <Form.Item
                        name="oem"
                        rules={[{ required: true, message: 'Артикул' }]}
                    >
                        <Input placeholder="Артикул" />
                    </Form.Item>
                    <Form.Item name="max_price">
                        <InputNumber placeholder="Цена ≤" min={0} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">Добавить</Button>
                </Form>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <Input
                        placeholder="Поиск по бренду или артикулу"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onPressEnter={() => fetchItems(1, pageSize, search)}
                        style={{ maxWidth: 320 }}
                    />
                    <Button onClick={() => fetchItems(1, pageSize, search)}>Найти</Button>
                </div>

                <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={items}
                    columns={columns}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '50', '100'],
                        onChange: (p, size) => {
                            setPage(p);
                            setPageSize(size);
                            fetchItems(p, size, search);
                        },
                    }}
                />
            </Card>

            <Modal
                open={Boolean(editingItem)}
                title="Редактировать отслеживаемую позицию"
                onCancel={handleCloseEdit}
                onOk={handleSaveEdit}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={savingEdit}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item
                        name="brand"
                        label="Бренд"
                        rules={[{ required: true, message: 'Укажите бренд' }]}
                    >
                        <Input placeholder="Бренд" />
                    </Form.Item>
                    <Form.Item
                        name="oem"
                        label="Артикул"
                        rules={[{ required: true, message: 'Укажите артикул' }]}
                    >
                        <Input placeholder="Артикул" />
                    </Form.Item>
                    <Form.Item name="max_price" label="Максимальная цена">
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            placeholder="Без лимита"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default WatchlistPage;
