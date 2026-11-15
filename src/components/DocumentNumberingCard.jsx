import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Space, Switch, Typography, message } from 'antd';

import { getDocumentNumbering, updateDocumentNumbering } from '../api/inventory';

const { Text } = Typography;

// Собственная нумерация документов: УНФ номера документам по обмену не
// присваивает, поэтому порядковый номер выдаёт DragonZap при проведении.
const DocumentNumberingCard = () => {
    const [rows, setRows] = useState([]);
    const [savingKind, setSavingKind] = useState(null);

    const load = useCallback(async () => {
        try {
            const { data } = await getDocumentNumbering();
            setRows((data || []).map((row) => ({ ...row, continue_from: null })));
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить нумерацию документов');
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const patch = (kind, changes) => setRows((current) => current.map(
        (row) => (row.kind === kind ? { ...row, ...changes } : row),
    ));

    const save = async (row) => {
        setSavingKind(row.kind);
        try {
            await updateDocumentNumbering(row.kind, {
                enabled: row.enabled,
                prefix: row.prefix,
                digits: row.digits,
                last_value: row.continue_from === null ? null : row.continue_from - 1,
            });
            message.success('Нумерация сохранена');
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось сохранить нумерацию');
        } finally {
            setSavingKind(null);
        }
    };

    if (!rows.length) return null;

    return (
        <Card title="Нумерация документов">
            <Alert
                showIcon
                type="info"
                style={{ marginBottom: 12 }}
                message="Порядковый номер выдаёт DragonZap"
                description="УНФ не нумерует документы, полученные по обмену: она сохраняет номер, который передали мы. Этот номер попадает и в УНФ, и в УПД клиенту. Нумерация начинается заново каждый год. Формат согласуйте с бухгалтером до включения."
            />
            {rows.map((row) => {
                const preview = `${row.prefix || ''}${String(
                    row.continue_from ?? row.last_value + 1,
                ).padStart(row.digits || 0, '0')}`;
                return (
                    <Space key={row.kind} direction="vertical" style={{ width: '100%' }}>
                        <Space wrap align="center">
                            <Switch checked={row.enabled} onChange={(value) => patch(row.kind, { enabled: value })} />
                            <Text strong>{row.title}</Text>
                            <Text type="secondary">
                                {row.enabled ? `в ${row.year} году выдано: ${row.last_value}` : 'выключено — номер остаётся прежним'}
                            </Text>
                        </Space>
                        <Space wrap align="end">
                            <span>
                                <Text type="secondary">Префикс</Text><br />
                                <Input style={{ width: 110 }} maxLength={8} value={row.prefix}
                                    onChange={(event) => patch(row.kind, { prefix: event.target.value })} />
                            </span>
                            <span>
                                <Text type="secondary">Цифр</Text><br />
                                <InputNumber min={3} max={9} value={row.digits}
                                    onChange={(value) => patch(row.kind, { digits: value || 6 })} />
                            </span>
                            <span>
                                <Text type="secondary">Следующий номер (необязательно)</Text><br />
                                <InputNumber min={1} style={{ width: 200 }} value={row.continue_from}
                                    placeholder={String(row.last_value + 1)}
                                    onChange={(value) => patch(row.kind, { continue_from: value ?? null })} />
                            </span>
                            <Button type="primary" loading={savingKind === row.kind} onClick={() => void save(row)}>
                                Сохранить
                            </Button>
                        </Space>
                        <Text>
                            Следующий документ получит номер <Text code>{preview}</Text>
                            {preview.length > 11 && (
                                <Text type="danger"> — длиннее 11 символов, в УНФ не поместится</Text>
                            )}
                        </Text>
                    </Space>
                );
            })}
        </Card>
    );
};

export default DocumentNumberingCard;
