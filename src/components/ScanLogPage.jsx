import React, { useCallback, useEffect, useState } from 'react';
import { Button, Space, Switch, Table, Tag, Typography, message } from 'antd';

import api from '../api.js';
import { refreshCatalog } from '../utils/scanCatalog';

const { Title, Text } = Typography;

// Журнал сканов: показывает, какие коды не находились, чтобы настроить разбор.
const ScanLogPage = () => {
    const [rows, setRows] = useState([]);
    const [onlyMissed, setOnlyMissed] = useState(true);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/scan/log', { params: { limit: 500, only_missed: onlyMissed } });
            setRows(data || []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить журнал');
        } finally { setLoading(false); }
    }, [onlyMissed]);
    useEffect(() => { void load(); }, [load]);

    const refreshLocal = async () => {
        try { await refreshCatalog(); message.success('Каталог на этом устройстве обновлён'); }
        catch { message.error('Не удалось обновить каталог'); }
    };

    return <div style={{ padding: 12 }}>
        <Title level={4} style={{ marginTop: 0 }}>Журнал сканов</Title>
        <Space style={{ marginBottom: 12 }} wrap>
            <Switch checked={onlyMissed} onChange={setOnlyMissed} /> <Text>Только не найденные</Text>
            <Button onClick={load}>Обновить</Button>
            <Button onClick={refreshLocal}>Обновить каталог на этом устройстве</Button>
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={rows}
            pagination={{ pageSize: 50 }}
            columns={[
                { title: 'Когда', dataIndex: 'created_at', width: 180,
                    render: (value) => new Date(value).toLocaleString('ru-RU') },
                { title: 'Код', dataIndex: 'code', render: (value) => <Text code>{value}</Text> },
                { title: 'Результат', width: 160, render: (_, row) => (row.found
                    ? <Tag color="green">{row.kind}</Tag> : <Tag color="red">не найден</Tag>) },
                { title: 'Где', dataIndex: 'context', width: 120 },
                { title: 'Источник', dataIndex: 'source', width: 100 },
            ]} />
    </div>;
};

export default ScanLogPage;
