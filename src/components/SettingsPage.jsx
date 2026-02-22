import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Modal, Select, Switch, Typography, message } from 'antd';
import { getPriceCheckLogs, getPriceCheckSchedule, updatePriceCheckSchedule } from '../api/settings';

const { Paragraph, Text } = Typography;

const SettingsPage = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const [logs, setLogs] = useState([]);

    const dayOptions = [
        { label: 'Пн', value: 'mon' },
        { label: 'Вт', value: 'tue' },
        { label: 'Ср', value: 'wed' },
        { label: 'Чт', value: 'thu' },
        { label: 'Пт', value: 'fri' },
        { label: 'Сб', value: 'sat' },
        { label: 'Вс', value: 'sun' },
    ];
    const timeOptions = Array.from({ length: 24 }, (_, i) => {
        const hour = String(i).padStart(2, '0');
        return { label: `${hour}:00`, value: `${hour}:00` };
    });

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const { data } = await getPriceCheckSchedule();
                form.setFieldsValue({
                    enabled: data.enabled,
                    days: data.days || [],
                    times: data.times || [],
                });
                setLastCheckedAt(data.last_checked_at || null);
            } catch {
                message.error('Не удалось загрузить расписание проверки прайсов');
            } finally {
                setLoading(false);
            }
        })();
    }, [form]);

    useEffect(() => {
        (async () => {
            setLogsLoading(true);
            try {
                const { data } = await getPriceCheckLogs({ limit: 50 });
                setLogs(data || []);
            } catch {
                setLogs([]);
            } finally {
                setLogsLoading(false);
            }
        })();
    }, []);

    const confirmChange = (title) =>
        new Promise((resolve, reject) => {
            Modal.confirm({
                title,
                content: 'Проверьте данные перед сохранением.',
                okText: 'Сохранить',
                cancelText: 'Отмена',
                onOk: resolve,
                onCancel: () => reject(new Error('cancel')),
            });
        });

    const handleSave = async (values) => {
        try {
            await confirmChange('Сохранить расписание проверки прайсов?');
            await updatePriceCheckSchedule(values);
            message.success('Расписание обновлено');
        } catch (err) {
            if (err?.message === 'cancel') return;
            message.error('Ошибка сохранения расписания');
        }
    };

    return (
        <Card title="Настройки проверки прайсов">
            <Paragraph style={{ marginBottom: 16 }}>
                Проверка почты выполняется по общему расписанию. Если дни/время не
                заданы, проверка выполняется каждый час. В противном случае —
                только в выбранные дни и часы.
            </Paragraph>
            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Form.Item name="enabled" label="Включить расписание" valuePropName="checked">
                    <Switch loading={loading} />
                </Form.Item>
                <Form.Item name="days" label="Дни недели">
                    <Select
                        mode="multiple"
                        options={dayOptions}
                        placeholder="Выберите дни"
                    />
                </Form.Item>
                <Form.Item name="times" label="Время (HH:MM)">
                    <Select
                        mode="multiple"
                        options={timeOptions}
                        placeholder="Выберите время"
                    />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>
                    Сохранить
                </Button>
            </Form>

            <div style={{ marginTop: 24 }}>
                <Text type="secondary">
                    Последняя проверка почты:{' '}
                    {lastCheckedAt
                        ? new Date(lastCheckedAt).toLocaleString()
                        : 'нет данных'}
                </Text>
            </div>

            <Card title="Логи проверки прайсов" style={{ marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Время</th>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Статус</th>
                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Сообщение</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logsLoading && (
                            <tr>
                                <td colSpan={3} style={{ padding: '8px' }}>
                                    Загрузка...
                                </td>
                            </tr>
                        )}
                        {!logsLoading && logs.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: '8px' }}>
                                    Логи отсутствуют
                                </td>
                            </tr>
                        )}
                        {logs.map((row) => (
                            <tr key={row.id}>
                                <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>
                                    {new Date(row.checked_at).toLocaleString()}
                                </td>
                                <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>
                                    {row.status}
                                </td>
                                <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>
                                    {row.message || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </Card>
    );
};

export default SettingsPage;
