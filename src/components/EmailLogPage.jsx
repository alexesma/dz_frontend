import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getEmailLog, retryEmail } from '../api/emailLog';

const { Title, Text } = Typography;

const STATUS = {
    sent: { label: 'Отправлено', color: 'green' },
    retry: { label: 'Повтор', color: 'orange' },
    failed: { label: 'Не отправлено', color: 'red' },
};

const SOURCES = {
    supplier_order: 'Заказ поставщику',
    customer_reply: 'Ответ по заказу клиента',
    customer_forward: 'Пересылка заказа',
    pricelist: 'Прайс клиенту',
    shipment_upd: 'УПД клиенту',
    supplier_receipt_upd: 'УПД поставщику',
    invoice: 'Счёт',
    restock_report: 'Отчёт по пополнению',
};

const formatTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return date.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
};

export default function EmailLogPage() {
    const [data, setData] = useState({ items: [], total: 0, counters: {} });
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ status: undefined, source: undefined, q: '' });
    const [page, setPage] = useState(1);
    const [retrying, setRetrying] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data: response } = await getEmailLog({
                page,
                page_size: 50,
                status: filters.status,
                source: filters.source,
                q: filters.q || undefined,
            });
            setData(response);
        } catch {
            message.error('Не удалось загрузить журнал писем');
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const timer = setInterval(load, 30000);
        return () => clearInterval(timer);
    }, [load]);

    const handleRetry = async (row) => {
        setRetrying(row.id);
        try {
            await retryEmail(row.id);
            message.success('Письмо поставлено на повтор, результат появится через минуту');
            load();
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось поставить на повтор');
        } finally {
            setRetrying(null);
        }
    };

    const columns = [
        { title: 'Время', dataIndex: 'created_at', width: 130, render: formatTime },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 130,
            render: (value, row) => (
                <Tooltip
                    title={value === 'retry' && row.next_retry_at
                        ? `Следующая попытка: ${formatTime(row.next_retry_at)}` : null}
                >
                    <Tag color={(STATUS[value] || {}).color}>{(STATUS[value] || {}).label || value}</Tag>
                </Tooltip>
            ),
        },
        { title: 'Попыток', dataIndex: 'attempts', width: 80, align: 'right' },
        {
            title: 'Что',
            dataIndex: 'source',
            width: 170,
            render: (value, row) => (
                <div>
                    <div>{SOURCES[value] || value || '—'}</div>
                    {row.source_id && <Text type="secondary" style={{ fontSize: 11 }}>№ {row.source_id}</Text>}
                </div>
            ),
        },
        { title: 'Кому', dataIndex: 'to_email', ellipsis: true, width: 220 },
        { title: 'Тема', dataIndex: 'subject', ellipsis: true },
        {
            title: 'Что произошло',
            dataIndex: 'last_error',
            ellipsis: true,
            render: (value, row) => {
                const history = (row.events || []).map((event) => (
                    `${formatTime(event.at)} — ${event.ok ? 'отправлено' : `ошибка: ${event.error || ''}`}`
                ));
                const text = value || (row.status === 'sent' ? `Отправлено ${formatTime(row.sent_at)}` : '—');
                return (
                    <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{history.join('\n') || text}</div>}>
                        <Text type={row.status === 'failed' ? 'danger' : undefined}>{text}</Text>
                    </Tooltip>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 110,
            render: (_, row) => (row.can_retry ? (
                <Button size="small" loading={retrying === row.id} onClick={() => handleRetry(row)}>
                    Повторить
                </Button>
            ) : null),
        },
    ];

    return (
        <Card>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Title level={3} style={{ margin: 0 }}>Журнал писем</Title>
                <Space wrap>
                    <Text type="secondary">
                        Отправлено: {data.counters.sent || 0} · Повторяется: {data.counters.retry || 0}
                        {' '}· Не ушло: <Text type={data.counters.failed ? 'danger' : undefined}>
                            {data.counters.failed || 0}
                        </Text>
                    </Text>
                    <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
                </Space>
            </Space>
            <Space wrap style={{ margin: '12px 0' }}>
                <Select
                    allowClear
                    placeholder="Статус"
                    style={{ width: 160 }}
                    value={filters.status}
                    onChange={(value) => { setPage(1); setFilters((prev) => ({ ...prev, status: value })); }}
                    options={Object.entries(STATUS).map(([value, item]) => ({ value, label: item.label }))}
                />
                <Select
                    allowClear
                    placeholder="Что отправлялось"
                    style={{ width: 220 }}
                    value={filters.source}
                    onChange={(value) => { setPage(1); setFilters((prev) => ({ ...prev, source: value })); }}
                    options={Object.entries(SOURCES).map(([value, label]) => ({ value, label }))}
                />
                <Input.Search
                    allowClear
                    placeholder="Адрес или тема"
                    style={{ width: 260 }}
                    onSearch={(value) => { setPage(1); setFilters((prev) => ({ ...prev, q: value })); }}
                />
            </Space>
            <Table
                size="small"
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={data.items}
                tableLayout="fixed"
                pagination={{
                    current: page,
                    pageSize: 50,
                    total: data.total,
                    showSizeChanger: false,
                    onChange: setPage,
                }}
            />
        </Card>
    );
}
