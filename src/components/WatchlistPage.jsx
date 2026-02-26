import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Popconfirm, Table, message } from 'antd';
import { createWatchItem, deleteWatchItem, getWatchItems } from '../api/watchlist';
import { formatMoscow } from '../utils/time';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SEARCH = '';

const WatchlistPage = () => {
    const [form] = Form.useForm();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(DEFAULT_PAGE);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState(DEFAULT_SEARCH);

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
            form.resetFields();
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

    const columns = [
        { title: 'Бренд', dataIndex: 'brand', key: 'brand' },
        { title: 'Артикул', dataIndex: 'oem', key: 'oem' },
        { title: 'Цена ≤', dataIndex: 'max_price', key: 'max_price' },
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
            title: 'Сайт dragonzap',
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
                <Popconfirm
                    title="Удалить позицию?"
                    description="Это действие необратимо"
                    onConfirm={() => handleDelete(record.id)}
                    okText="Да"
                    cancelText="Нет"
                >
                    <Button danger size="small">Удалить</Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <Card title="Отслеживание позиций">
            <Form form={form} layout="inline" onFinish={handleCreate} style={{ marginBottom: 16 }}>
                <Form.Item name="brand" rules={[{ required: true, message: 'Бренд' }]}>
                    <Input placeholder="Бренд" />
                </Form.Item>
                <Form.Item name="oem" rules={[{ required: true, message: 'Артикул' }]}>
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
    );
};

export default WatchlistPage;
