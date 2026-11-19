import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

import {
    getUnfStockReconciliation, runUnfStockReconciliation, uploadUnfStockReport,
} from '../api/oneC';

const { Text } = Typography;
const fmt = (value) => (value ? new Date(value).toLocaleString('ru-RU') : '—');

// Сверка наших остатков с отчётом по остаткам из УНФ. Отчёт УНФ кладёт на
// FTP сама (рассылка отчётов по расписанию); файл можно загрузить и вручную.
const UnfStockReconciliationCard = () => {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setData((await getUnfStockReconciliation()).data);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить сверку остатков');
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const act = async (request, okText) => {
        setBusy(true);
        try {
            const response = await request();
            setData(response.data);
            message.success(okText(response.data));
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось выполнить сверку');
        } finally {
            setBusy(false);
        }
    };

    const latest = data?.latest;
    const clean = latest && !latest.differences_total && !latest.unmatched_total;

    return (
        <Card
            title="Сверка остатков с УНФ"
            extra={(
                <Space>
                    <Button loading={busy} onClick={() => act(
                        runUnfStockReconciliation,
                        (result) => (result.processed
                            ? `Обработано отчётов: ${result.processed}`
                            : 'Новых отчётов от УНФ в каталоге нет'),
                    )}>
                        Проверить каталог
                    </Button>
                    <Upload
                        accept=".xlsx"
                        showUploadList={false}
                        beforeUpload={(file) => {
                            void act(() => uploadUnfStockReport(file), () => 'Отчёт сверен');
                            return false;
                        }}
                    >
                        <Button icon={<UploadOutlined />} loading={busy}>Загрузить отчёт</Button>
                    </Upload>
                </Space>
            )}
        >
            <Text type="secondary">
                УНФ кладёт отчёт по остаткам (Excel) в каталог <Text code>{data?.report_directory || 'reports'}</Text> на
                FTP обмена — рассылкой отчётов по расписанию. Сверка запускается ночью сама.
            </Text>
            {!latest && (
                <Alert style={{ marginTop: 12 }} showIcon type="info"
                    message="Сверка ещё не выполнялась"
                    description="Настройте в УНФ рассылку отчёта по остаткам на FTP или загрузите файл вручную." />
            )}
            {latest && (
                <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
                    {data.stale && (
                        <Alert showIcon type="warning"
                            message={`УНФ не присылала отчёт дольше ${data.stale_after_hours} часов`} />
                    )}
                    <Space size={4} wrap>
                        <Text>{fmt(latest.created_at)}</Text>
                        <Tag>{latest.source === 'ftp' ? 'от УНФ' : 'загружен вручную'}</Tag>
                        <Text type="secondary">{latest.file_name}</Text>
                    </Space>
                    <Space size={4} wrap>
                        <Tag>строк в отчёте: {latest.rows_total}</Tag>
                        <Tag color="blue">сопоставлено товаров: {latest.matched}</Tag>
                        <Tag color={latest.differences_total ? 'red' : 'green'}>
                            расхождений: {latest.differences_total}
                        </Tag>
                        <Tag color={latest.unmatched_total ? 'orange' : 'default'}>
                            не сопоставлено: {latest.unmatched_total}
                        </Tag>
                    </Space>
                    {clean && <Alert showIcon type="success" message="Остатки совпадают" />}
                    {latest.differences?.length > 0 && (
                        <Table size="small" rowKey="autopart_id" dataSource={latest.differences}
                            pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 700 }}
                            title={() => <Text strong>Расхождения по остаткам</Text>}
                            columns={[
                                { title: 'Товар', render: (_, row) => (
                                    <><Text strong>{row.brand} {row.oem}</Text><br />{row.name}</>
                                ) },
                                { title: 'DragonZap', dataIndex: 'dragonzap', width: 110, align: 'right' },
                                { title: 'УНФ', width: 130, align: 'right',
                                    render: (_, row) => (row.in_report ? row.unf : <Text type="secondary">нет в отчёте</Text>) },
                                { title: 'Разница', width: 100, align: 'right',
                                    render: (_, row) => {
                                        const diff = row.dragonzap - row.unf;
                                        return <Text type={diff > 0 ? 'warning' : 'danger'}>{diff > 0 ? `+${diff}` : diff}</Text>;
                                    } },
                            ]} />
                    )}
                    {latest.unmatched?.length > 0 && (
                        <Table size="small" rowKey={(row, index) => `${row.article}:${index}`}
                            dataSource={latest.unmatched}
                            pagination={{ pageSize: 10, hideOnSinglePage: true }}
                            title={() => <Text strong>Строки отчёта УНФ, которым не нашёлся товар</Text>}
                            columns={[
                                { title: 'Артикул', dataIndex: 'article', width: 160 },
                                { title: 'Наименование в УНФ', dataIndex: 'name' },
                                { title: 'Остаток', dataIndex: 'quantity', width: 100, align: 'right' },
                            ]} />
                    )}
                </Space>
            )}
        </Card>
    );
};

export default UnfStockReconciliationCard;
