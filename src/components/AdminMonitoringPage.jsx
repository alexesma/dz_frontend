import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Statistic, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import {
    createMonitorSnapshot,
    getMonitorSnapshots,
    getMonitorSummary,
} from '../api/settings';

const { Title, Text } = Typography;

const formatBytes = (value) => {
    if (value === null || value === undefined) return '—';
    if (value === 0) return '0 B';
    const sign = value < 0 ? '-' : '';
    const absValue = Math.abs(value);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(
        Math.floor(Math.log(absValue) / Math.log(1024)),
        units.length - 1
    );
    const scaled = absValue / 1024 ** idx;
    const formatted = scaled.toFixed(
        scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
    );
    return `${sign}${formatted} ${units[idx]}`;
};

const formatNumber = (value) => {
    if (value === null || value === undefined) return '—';
    return Number(value).toLocaleString('ru-RU');
};

const MiniLineChart = ({ data, valueKey, color = '#1677ff' }) => {
    const points = useMemo(() => {
        if (!data || data.length < 2) return '';
        const values = data.map((item) => Number(item[valueKey] || 0));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        return values
            .map((value, index) => {
                const x = (index / (values.length - 1)) * 100;
                const y = 100 - ((value - min) / range) * 100;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(' ');
    }, [data, valueKey]);

    if (!data || data.length < 2) {
        return <Text type="secondary">Нет данных для графика</Text>;
    }

    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 120 }}>
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={points}
            />
        </svg>
    );
};

const AdminMonitoringPage = () => {
    const [summary, setSummary] = useState(null);
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [snapLoading, setSnapLoading] = useState(false);

    const refresh = async ({ withSnapshot } = { withSnapshot: true }) => {
        setLoading(true);
        try {
            if (withSnapshot) {
                try {
                    await createMonitorSnapshot();
                } catch (err) {
                    message.error('Не удалось сохранить снимок');
                }
            }
            const [summaryResp, snapshotsResp] = await Promise.all([
                getMonitorSummary(),
                getMonitorSnapshots({ limit: 200 }),
            ]);
            setSummary(summaryResp.data);
            setSnapshots(snapshotsResp.data || []);
        } catch (err) {
            message.error('Не удалось загрузить мониторинг');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSnapshot = async () => {
        setSnapLoading(true);
        try {
            await createMonitorSnapshot();
            const snapshotsResp = await getMonitorSnapshots({ limit: 200 });
            setSnapshots(snapshotsResp.data || []);
            message.success('Снимок сохранён');
        } catch (err) {
            message.error('Не удалось сохранить снимок');
        } finally {
            setSnapLoading(false);
        }
    };

    useEffect(() => {
        refresh({ withSnapshot: true });
    }, []);

    const sortedSnapshots = useMemo(() => {
        return [...(snapshots || [])].sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
    }, [snapshots]);

    const latestSnapshot = snapshots?.[0];
    const prevSnapshot = snapshots?.[1];
    const dbDelta =
        latestSnapshot &&
        prevSnapshot &&
        latestSnapshot.db_size_bytes !== null &&
        latestSnapshot.db_size_bytes !== undefined &&
        prevSnapshot.db_size_bytes !== null &&
        prevSnapshot.db_size_bytes !== undefined
            ? latestSnapshot.db_size_bytes - prevSnapshot.db_size_bytes
            : null;

    const dbTables = summary?.db?.tables || [];
    const schedulerRuns = summary?.app?.scheduler_last_runs || [];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Мониторинг системы</Title>
                    <Text type="secondary">
                        Последняя проверка прайсов:{' '}
                        {summary?.app?.last_price_check_at
                            ? dayjs(summary.app.last_price_check_at).format('DD.MM.YYYY HH:mm')
                            : '—'}
                    </Text>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => refresh({ withSnapshot: false })} loading={loading}>
                        Обновить данные
                    </Button>
                    <Button type="primary" onClick={handleManualSnapshot} loading={snapLoading}>
                        Сохранить снимок
                    </Button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
                <Card>
                    <Statistic
                        title="Размер БД"
                        value={formatBytes(summary?.db?.size_bytes)}
                        suffix={dbDelta !== null ? `(${dbDelta >= 0 ? '+' : ''}${formatBytes(dbDelta)})` : ''}
                    />
                    <Text type="secondary">
                        Подключений: {formatNumber(summary?.db?.connections)} / {formatNumber(summary?.db?.max_connections)}
                    </Text>
                </Card>
                <Card>
                    <Statistic
                        title="Свободно на диске"
                        value={formatBytes(summary?.system?.disk_free_bytes)}
                    />
                    <Text type="secondary">
                        Всего: {formatBytes(summary?.system?.disk_total_bytes)}
                    </Text>
                </Card>
                <Card>
                    <Statistic
                        title="Доступно RAM"
                        value={formatBytes(summary?.system?.mem_available_bytes)}
                    />
                    <Text type="secondary">
                        Всего: {formatBytes(summary?.system?.mem_total_bytes)}
                    </Text>
                </Card>
                <Card>
                    <Statistic
                        title="Нагрузка CPU"
                        value={
                            summary?.system?.cpu_load_1 !== null && summary?.system?.cpu_load_1 !== undefined
                                ? `${summary.system.cpu_load_1.toFixed(2)} / ${summary.system.cpu_load_5?.toFixed(2) || '—'} / ${summary.system.cpu_load_15?.toFixed(2) || '—'}`
                                : '—'
                        }
                    />
                    <Text type="secondary">
                        Uptime: {summary?.system?.uptime_seconds ? `${Math.floor(summary.system.uptime_seconds / 3600)} ч` : '—'}
                    </Text>
                </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
                <Card title="Рост базы данных">
                    <MiniLineChart data={sortedSnapshots} valueKey="db_size_bytes" color="#722ed1" />
                    <Text type="secondary">
                        Последний снимок: {latestSnapshot ? dayjs(latestSnapshot.created_at).format('DD.MM.YYYY HH:mm') : '—'}
                    </Text>
                </Card>
                <Card title="Свободное место на диске">
                    <MiniLineChart data={sortedSnapshots} valueKey="disk_free_bytes" color="#52c41a" />
                    <Text type="secondary">
                        Последний снимок: {latestSnapshot ? dayjs(latestSnapshot.created_at).format('DD.MM.YYYY HH:mm') : '—'}
                    </Text>
                </Card>
                <Card title="Доступная память">
                    <MiniLineChart data={sortedSnapshots} valueKey="mem_available_bytes" color="#fa8c16" />
                    <Text type="secondary">
                        Последний снимок: {latestSnapshot ? dayjs(latestSnapshot.created_at).format('DD.MM.YYYY HH:mm') : '—'}
                    </Text>
                </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginTop: 16 }}>
                <Card title="Самые большие таблицы">
                    <Table
                        size="small"
                        rowKey="table"
                        pagination={false}
                        dataSource={dbTables}
                        columns={[
                            { title: 'Таблица', dataIndex: 'table', key: 'table' },
                            { title: 'Размер', dataIndex: 'size_pretty', key: 'size_pretty' },
                            {
                                title: 'Размер (байты)',
                                dataIndex: 'size_bytes',
                                key: 'size_bytes',
                                render: (value) => formatNumber(value),
                            },
                        ]}
                    />
                </Card>
                <Card title="Последние запуски задач">
                    <Table
                        size="small"
                        rowKey="key"
                        pagination={false}
                        dataSource={schedulerRuns}
                        columns={[
                            { title: 'Задача', dataIndex: 'key', key: 'key' },
                            {
                                title: 'Последний запуск',
                                dataIndex: 'last_run_at',
                                key: 'last_run_at',
                                render: (value) => value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—',
                            },
                            {
                                title: 'Вкл',
                                dataIndex: 'enabled',
                                key: 'enabled',
                                render: (value) => (value ? 'Да' : 'Нет'),
                            },
                        ]}
                    />
                </Card>
            </div>
        </div>
    );
};

export default AdminMonitoringPage;
