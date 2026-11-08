import React, { useCallback, useEffect, useState } from 'react';
import {
    Button, Card, Checkbox, Input, Select, Space, Table, Tabs, Typography, message,
} from 'antd';
import dayjs from 'dayjs';

import { getGtdReport } from '../api/inventory';
import { getAllProviders } from '../api/providers';

const { Title, Text } = Typography;

const fmtDate = (value) => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

const GtdReportPage = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({ items: [], without_gtd: [] });
    const [providers, setProviders] = useState([]);
    const [gtd, setGtd] = useState('');
    const [providerId, setProviderId] = useState(undefined);
    const [onlyRemaining, setOnlyRemaining] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data: result } = await getGtdReport({
                gtd_number: gtd || undefined,
                provider_id: providerId,
                only_remaining: onlyRemaining,
            });
            setData(result);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить отчёт по ГТД');
        } finally {
            setLoading(false);
        }
    }, [gtd, providerId, onlyRemaining]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        getAllProviders()
            .then((items) => setProviders(Array.isArray(items) ? items : []))
            .catch(() => message.error('Не удалось загрузить поставщиков'));
    }, []);

    const itemColumns = [
        { title: 'Номер ГТД', dataIndex: 'gtd_number', key: 'gtd_number' },
        { title: 'Поставщик', dataIndex: 'provider_name', key: 'provider_name' },
        { title: 'Страна', dataIndex: 'country_name', key: 'country_name', render: (v) => v || '—' },
        { title: 'Партий', dataIndex: 'lots', key: 'lots', align: 'right' },
        { title: 'Пришло', dataIndex: 'received', key: 'received', align: 'right' },
        { title: 'Отгружено', dataIndex: 'shipped', key: 'shipped', align: 'right' },
        {
            title: 'Остаток',
            dataIndex: 'remaining',
            key: 'remaining',
            align: 'right',
            render: (v) => <Text strong>{v}</Text>,
        },
        { title: 'Первый приход', dataIndex: 'first_received_at', key: 'first', render: fmtDate },
        { title: 'Последний приход', dataIndex: 'last_received_at', key: 'last', render: fmtDate },
    ];

    const missingColumns = [
        { title: 'Поставщик', dataIndex: 'provider_name', key: 'provider_name' },
        { title: 'Партий без ГТД', dataIndex: 'lots', key: 'lots', align: 'right' },
        { title: 'Пришло', dataIndex: 'received', key: 'received', align: 'right' },
        {
            title: 'Остаток',
            dataIndex: 'remaining',
            key: 'remaining',
            align: 'right',
            render: (v) => <Text strong>{v}</Text>,
        },
    ];

    return (
        <div style={{ padding: 16 }}>
            <Title level={3} style={{ marginTop: 0 }}>Отчёт по ГТД</Title>
            <Card style={{ marginBottom: 16 }}>
                <Space wrap>
                    <Input
                        placeholder="Номер ГТД (часть)"
                        value={gtd}
                        onChange={(e) => setGtd(e.target.value)}
                        onPressEnter={load}
                        style={{ width: 240 }}
                        allowClear
                    />
                    <Select
                        showSearch
                        allowClear
                        placeholder="Поставщик"
                        style={{ width: 240 }}
                        value={providerId}
                        onChange={setProviderId}
                        optionFilterProp="label"
                        options={providers.map((p) => ({ value: p.id, label: p.name }))}
                    />
                    <Checkbox checked={onlyRemaining} onChange={(e) => setOnlyRemaining(e.target.checked)}>
                        Только с остатком
                    </Checkbox>
                    <Button type="primary" onClick={load} loading={loading}>Показать</Button>
                </Space>
            </Card>
            <Tabs
                items={[
                    {
                        key: 'items',
                        label: `По декларациям (${data.items.length})`,
                        children: (
                            <Table
                                size="small"
                                rowKey={(r) => `${r.gtd_number}-${r.provider_id}`}
                                loading={loading}
                                columns={itemColumns}
                                dataSource={data.items}
                                pagination={{ pageSize: 50 }}
                            />
                        ),
                    },
                    {
                        key: 'missing',
                        label: `Без ГТД (${data.without_gtd.length})`,
                        children: (
                            <Table
                                size="small"
                                rowKey="provider_id"
                                loading={loading}
                                columns={missingColumns}
                                dataSource={data.without_gtd}
                                pagination={false}
                            />
                        ),
                    },
                ]}
            />
        </div>
    );
};

export default GtdReportPage;
