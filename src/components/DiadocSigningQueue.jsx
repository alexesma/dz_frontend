import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';

import { getDiadocOutboundQueue, runDiadocOutboundQueue } from '../api/diadoc';

const { Text } = Typography;

const fmt = (value) => (value ? new Date(value).toLocaleString('ru-RU') : '—');

// Очередь исходящих УПД: черновики, которые осталось подписать, и реализации,
// по которым черновик не создался, с причиной.
const DiadocSigningQueue = ({ onSign, signingKey, version }) => {
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setQueue((await getDiadocOutboundQueue()).data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить очередь УПД');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load, version]);

    const runNow = async () => {
        setRunning(true);
        try {
            const { data } = await runDiadocOutboundQueue();
            message.success(
                data?.skipped
                    ? 'Конвейер выключен — включите его в настройках Диадока'
                    : `Создано черновиков: ${data.created}, не готово: ${data.blocked}, ошибок: ${data.errors}`,
            );
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось создать черновики');
        } finally {
            setRunning(false);
        }
    };

    const drafts = queue?.drafts || [];
    const blocked = queue?.blocked || [];

    return (
        <Card
            loading={loading && !queue}
            extra={(
                <Space>
                    <Button onClick={() => void load()}>Обновить</Button>
                    <Button loading={running} onClick={runNow}>Создать черновики сейчас</Button>
                </Space>
            )}
            title={`К подписи: ${drafts.length}`}
        >
            {queue && !queue.enabled && (
                <Alert
                    showIcon
                    type="warning"
                    style={{ marginBottom: 12 }}
                    message="Автоматическое создание УПД выключено"
                    description="Включите «УПД после проведения» в настройках Диадока: тогда черновик будет появляться здесь сам через несколько минут после проведения реализации."
                />
            )}
            <Table
                size="small"
                rowKey="id"
                dataSource={drafts}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                locale={{ emptyText: 'Черновиков к подписи нет' }}
                scroll={{ x: 760 }}
                columns={[
                    {
                        title: 'Реализация',
                        render: (_, row) => (
                            <Link to={`/warehouse/shipments/${row.shipment_id}`}>
                                {row.document_number || `#${row.shipment_id}`}
                            </Link>
                        ),
                    },
                    { title: 'Дата', dataIndex: 'document_date', width: 120 },
                    { title: 'Клиент', dataIndex: 'customer_name' },
                    { title: 'Черновик создан', width: 170, render: (_, row) => fmt(row.created_at) },
                    {
                        title: '',
                        width: 200,
                        render: (_, row) => (
                            <Button
                                type="primary"
                                size="small"
                                loading={signingKey === `send:${row.id}`}
                                onClick={() => onSign(row)}
                            >
                                Подписать и отправить
                            </Button>
                        ),
                    },
                ]}
            />
            {blocked.length > 0 && (
                <Table
                    style={{ marginTop: 16 }}
                    size="small"
                    rowKey="shipment_id"
                    title={() => <Text strong>УПД не создан — нужно исправить: {blocked.length}</Text>}
                    dataSource={blocked}
                    pagination={{ pageSize: 20, hideOnSinglePage: true }}
                    scroll={{ x: 760 }}
                    columns={[
                        {
                            title: 'Реализация',
                            width: 160,
                            render: (_, row) => (
                                <Link to={`/warehouse/shipments/${row.shipment_id}`}>
                                    {row.document_number || `#${row.shipment_id}`}
                                </Link>
                            ),
                        },
                        { title: 'Клиент', dataIndex: 'customer_name', width: 200 },
                        {
                            title: 'Что мешает',
                            dataIndex: 'reason',
                            render: (reason) => <Tag color="orange" style={{ whiteSpace: 'normal' }}>{reason}</Tag>,
                        },
                        { title: 'Проверено', width: 170, render: (_, row) => fmt(row.checked_at) },
                    ]}
                />
            )}
        </Card>
    );
};

export default DiadocSigningQueue;
