import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, message, Row, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { reconcilePartsSoftOrders } from '../api/customerOrders';

const { Paragraph, Text } = Typography;

const STATUS = {
    existing_external: { label: 'Уже связан', color: 'green' },
    existing_site_order: { label: 'Заказ с нашего сайта', color: 'green' },
    partial_site_match: { label: 'Частичное совпадение', color: 'orange' },
    order_conflict: { label: 'Конфликт заказов', color: 'red' },
    probable_duplicate: { label: 'Вероятный дубль', color: 'orange' },
    customer_conflict: { label: 'Конфликт клиента', color: 'red' },
    customer_unmatched: { label: 'Клиент не связан', color: 'default' },
    new_order: { label: 'Новый заказ', color: 'blue' },
};

const PartsSoftOrderReconciliation = () => {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);

    const runReconciliation = async () => {
        setLoading(true);
        try {
            const response = await reconcilePartsSoftOrders();
            setReport(response.data);
            message.success('Сверка Parts-Soft завершена');
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось выполнить сверку Parts-Soft');
        } finally {
            setLoading(false);
        }
    };

    const rows = useMemo(
        () => (report?.orders || []).map((row) => ({ ...row, key: row.external_order_id })),
        [report]
    );
    const filters = useMemo(
        () => Object.entries(STATUS).map(([value, config]) => ({ text: config.label, value })),
        []
    );
    const columns = [
        {
            title: 'ID Parts-Soft',
            dataIndex: 'external_order_id',
            width: 125,
        },
        {
            title: 'Дата',
            dataIndex: 'created_at',
            width: 155,
            render: (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—'),
        },
        {
            title: 'Клиент',
            key: 'customer',
            width: 260,
            render: (_, row) => (
                <div>
                    <div>{row.customer_name || `Parts-Soft #${row.external_customer_id}`}</div>
                    <Text type="secondary">ИНН {row.customer_inn || '—'} · КПП {row.customer_kpp || '—'}</Text>
                </div>
            ),
        },
        {
            title: 'Позиций',
            dataIndex: 'items_count',
            width: 90,
        },
        {
            title: 'Результат',
            dataIndex: 'classification',
            width: 190,
            filters,
            onFilter: (value, row) => row.classification === value,
            render: (value) => {
                const config = STATUS[value] || { label: value, color: 'default' };
                return <Tag color={config.color}>{config.label}</Tag>;
            },
        },
        {
            title: 'Основание',
            dataIndex: 'match_basis',
            width: 180,
            render: (value) => value || '—',
        },
        {
            title: 'Связь у нас',
            key: 'local',
            width: 150,
            render: (_, row) => (
                <div>
                    <div>Клиент: {row.local_customer_id || '—'}</div>
                    <div>Заказ: {row.local_order_id || '—'}</div>
                </div>
            ),
        },
    ];

    return (
        <div>
            <Alert
                type="info"
                showIcon
                message="Проверка выполняется только за последние 7 дней"
                description="Учитываются заказы региона Москва, у клиента должен быть заполнен ИНН. Запуск ничего не создаёт и не изменяет в обеих системах."
                style={{ marginBottom: 16 }}
            />
            <Button type="primary" loading={loading} onClick={runReconciliation}>
                Проверить Parts-Soft за 7 дней
            </Button>

            {report && (
                <>
                    <Paragraph style={{ marginTop: 12 }} type="secondary">
                        Период: {dayjs(report.date_from).format('DD.MM.YYYY HH:mm')} — {dayjs(report.date_to).format('DD.MM.YYYY HH:mm')}
                    </Paragraph>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Всего в Parts-Soft" value={report.remote_orders_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="С ИНН" value={report.qualified_orders} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Позиций" value={report.items_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Без ИНН" value={report.excluded_without_inn} /></Card></Col>
                    </Row>
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={rows}
                        columns={columns}
                        pagination={{ pageSize: 25, showSizeChanger: true }}
                        scroll={{ x: 1150 }}
                    />
                </>
            )}
        </div>
    );
};

export default PartsSoftOrderReconciliation;
