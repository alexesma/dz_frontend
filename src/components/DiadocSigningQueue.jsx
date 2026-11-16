import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';

import { getDiadocOutboundQueue, runDiadocOutboundQueue } from '../api/diadoc';
import { sendShipmentUpdEmail } from '../api/inventory';

const { Text } = Typography;

const fmt = (value) => (value ? new Date(value).toLocaleString('ru-RU') : '—');

// Очередь исходящих УПД: черновики, которые осталось подписать, и реализации,
// по которым черновик не создался, с причиной.
// Столько черновиков подписывается одной SMS (ограничение сервера).
const MAX_BATCH = 30;

const DiadocSigningQueue = ({ onSign, onSignBatch, signingKey, version }) => {
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [emailingId, setEmailingId] = useState(null);

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
    useEffect(() => { setSelectedIds([]); void load(); }, [load, version]);

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

    // УПД в Excel уходит на почту любому клиенту — с ЭДО и без.
    const sendByEmail = async (row) => {
        setEmailingId(row.shipment_id);
        try {
            const { data } = await sendShipmentUpdEmail(row.shipment_id);
            message.success(`УПД отправлен на ${data.sent_to}`);
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось отправить УПД на почту');
        } finally {
            setEmailingId(null);
        }
    };

    const emailCell = (row) => {
        if (row.emailed_at) {
            return (
                <Tag color="green" title={`${row.emailed_to}, ${fmt(row.emailed_at)}`}>
                    на почте
                </Tag>
            );
        }
        if (!row.customer_email) {
            return <Text type="secondary" style={{ fontSize: 12 }}>нет e-mail у клиента</Text>;
        }
        return (
            <Space size={4} direction="vertical">
                <Popconfirm
                    title={`Отправить УПД в Excel на ${row.customer_email}?`}
                    okText="Отправить"
                    cancelText="Отмена"
                    onConfirm={() => sendByEmail(row)}
                >
                    <Button size="small" loading={emailingId === row.shipment_id}>На почту</Button>
                </Popconfirm>
                {row.email_error && (
                    <Text type="danger" style={{ fontSize: 12 }}>{row.email_error}</Text>
                )}
            </Space>
        );
    };

    const drafts = queue?.drafts || [];
    const blocked = queue?.blocked || [];

    return (
        <Card
            loading={loading && !queue}
            extra={(
                <Space>
                    <Button
                        type="primary"
                        disabled={!selectedIds.length}
                        loading={signingKey === 'send:batch'}
                        onClick={() => onSignBatch(selectedIds)}
                    >
                        Подписать выбранные{selectedIds.length ? ` (${selectedIds.length})` : ''}
                    </Button>
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
            {queue && !queue.email_enabled && (
                <Alert
                    showIcon
                    type="info"
                    style={{ marginBottom: 12 }}
                    message="Автоматическая отправка УПД в Excel на почту выключена"
                    description="Письмо можно отправить кнопкой «На почту». Чтобы оно уходило всем клиентам само после проведения, включите «УПД в Excel на почту» в настройках Диадока."
                />
            )}
            <Table
                size="small"
                rowKey="id"
                rowSelection={{
                    selectedRowKeys: selectedIds,
                    onChange: (keys) => {
                        if (keys.length > MAX_BATCH) {
                            message.warning(`Одной SMS подписывается не больше ${MAX_BATCH} документов`);
                        }
                        setSelectedIds(keys.slice(0, MAX_BATCH));
                    },
                }}
                dataSource={drafts}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                locale={{ emptyText: 'Черновиков к подписи нет' }}
                scroll={{ x: 930 }}
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
                    { title: 'Excel на почту', width: 170, render: (_, row) => emailCell(row) },
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
                        { title: 'Excel на почту', width: 170, render: (_, row) => emailCell(row) },
                    ]}
                />
            )}
        </Card>
    );
};

export default DiadocSigningQueue;
