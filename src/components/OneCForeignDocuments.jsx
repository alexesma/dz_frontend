import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Checkbox, Table, Tag, Typography, message } from 'antd';

import { listOneCForeignDocuments, markOneCForeignDocumentReviewed } from '../api/oneC';

const { Text } = Typography;

const REASONS = {
    not_ours: { label: 'заведён в УНФ', color: 'orange' },
    unknown_type: { label: 'тип не разбирается', color: 'red' },
};

// Документы УНФ, которых нет в DragonZap. Обмен из-за них не останавливается,
// но каждый нужно разобрать вручную: в DragonZap такой документ не попал.
const OneCForeignDocuments = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [includeReviewed, setIncludeReviewed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await listOneCForeignDocuments({ include_reviewed: includeReviewed });
            setRows(data || []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить журнал документов УНФ');
        } finally {
            setLoading(false);
        }
    }, [includeReviewed]);
    useEffect(() => { void load(); }, [load]);

    const markReviewed = async (row) => {
        try {
            await markOneCForeignDocumentReviewed(row.id);
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось отметить документ');
        }
    };

    if (!rows.length && !includeReviewed) return null;

    return (
        <Card
            title={`Документы УНФ, которых нет в DragonZap${rows.length ? ` (${rows.length})` : ''}`}
            extra={(
                <Checkbox checked={includeReviewed} onChange={(event) => setIncludeReviewed(event.target.checked)}>
                    Показывать разобранные
                </Checkbox>
            )}
        >
            <Text type="secondary">
                Обмен из-за этих документов не останавливается, но в DragonZap они не загружены.
                Исходное сообщение сохранено в каталоге обмена.
            </Text>
            <Table
                style={{ marginTop: 12 }}
                size="small"
                rowKey="id"
                loading={loading}
                dataSource={rows}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                scroll={{ x: 900 }}
                columns={[
                    { title: 'Сообщение', dataIndex: 'message_no', width: 100 },
                    { title: 'Тип', dataIndex: 'object_type' },
                    { title: 'Номер', dataIndex: 'number', width: 140 },
                    { title: 'Дата', dataIndex: 'document_date', width: 170 },
                    {
                        title: 'Причина',
                        dataIndex: 'reason',
                        width: 170,
                        render: (reason) => (
                            <Tag color={REASONS[reason]?.color}>{REASONS[reason]?.label || reason}</Tag>
                        ),
                    },
                    { title: 'Файл', dataIndex: 'archive_file', ellipsis: true },
                    {
                        title: '',
                        width: 130,
                        render: (_, row) => (row.reviewed_at
                            ? <Tag color="green">разобран</Tag>
                            : <Button size="small" onClick={() => void markReviewed(row)}>Разобран</Button>),
                    },
                ]}
            />
        </Card>
    );
};

export default OneCForeignDocuments;
