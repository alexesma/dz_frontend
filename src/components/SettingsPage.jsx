import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Modal, Select, Switch, Typography, message } from 'antd';
import {
    getPriceCheckLogs,
    getPriceCheckSchedule,
    getSchedulerSettings,
    updatePriceCheckSchedule,
    updateSchedulerSetting,
} from '../api/settings';
import { formatMoscow } from '../utils/time';

const { Paragraph, Text } = Typography;

const SettingsPage = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const [logs, setLogs] = useState([]);
    const [schedulerSettings, setSchedulerSettings] = useState([]);
    const [schedulerLoading, setSchedulerLoading] = useState(false);
    const [schedulerSaving, setSchedulerSaving] = useState({});

    const dayOptions = [
        { label: 'Пн', value: 'mon' },
        { label: 'Вт', value: 'tue' },
        { label: 'Ср', value: 'wed' },
        { label: 'Чт', value: 'thu' },
        { label: 'Пт', value: 'fri' },
        { label: 'Сб', value: 'sat' },
        { label: 'Вс', value: 'sun' },
    ];
    const timeOptions = Array.from({ length: 24 * 12 }, (_, i) => {
        const hour = String(Math.floor(i / 12)).padStart(2, '0');
        const minute = String((i % 12) * 5).padStart(2, '0');
        return { label: `${hour}:${minute}`, value: `${hour}:${minute}` };
    });
    const timeOptionsHourly = Array.from({ length: 24 }, (_, i) => {
        const hour = String(i).padStart(2, '0');
        return { label: `${hour}:00`, value: `${hour}:00` };
    });

    const schedulerMeta = {
        watchlist_site_check: {
            title: 'Проверка позиций на сайте',
            description: 'Проверяет отслеживаемые позиции на сайте Dragonzap.',
        },
        watchlist_notify: {
            title: 'Уведомления о позициях в прайсах',
            description: 'Сводка позиций, найденных в прайсах и на сайте.',
        },
        pricelist_stale_notify: {
            title: 'Проблемы с обновлением прайсов',
            description: 'Сводка прайсов, которые давно не обновлялись.',
        },
        cleanup_old_pricelists: {
            title: 'Очистка старых прайсов',
            description: 'Удаляет старые прайсы, оставляя последние.',
        },
        metrics_snapshot: {
            title: 'Снимки мониторинга',
            description: 'Сохраняет снимок состояния БД и системы для графиков.',
        },
    };

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

    useEffect(() => {
        (async () => {
            setSchedulerLoading(true);
            try {
                const { data } = await getSchedulerSettings();
                setSchedulerSettings(data || []);
            } catch {
                message.error('Не удалось загрузить расписание уведомлений');
            } finally {
                setSchedulerLoading(false);
            }
        })();
    }, []);

    const handleSave = async (values) => {
        try {
            await updatePriceCheckSchedule(values);
            message.success('Расписание обновлено');
        } catch (err) {
            message.error('Ошибка сохранения расписания');
        }
    };

    const handleSchedulerChange = (key, patch) => {
        setSchedulerSettings((prev) =>
            prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
        );
    };

    const handleSchedulerSave = async (key) => {
        const setting = schedulerSettings.find((item) => item.key === key);
        if (!setting) return;
        setSchedulerSaving((prev) => ({ ...prev, [key]: true }));
        try {
            const payload = {
                enabled: setting.enabled,
                days: setting.days || [],
                times: setting.times || [],
            };
            const { data } = await updateSchedulerSetting(key, payload);
            setSchedulerSettings((prev) =>
                prev.map((item) => (item.key === key ? data : item))
            );
            message.success('Расписание обновлено');
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Ошибка сохранения расписания');
        } finally {
            setSchedulerSaving((prev) => ({ ...prev, [key]: false }));
        }
    };

    return (
        <>
            <Card title="Настройки проверки прайсов">
                <Paragraph style={{ marginBottom: 16 }}>
                    Проверка почты выполняется по общему расписанию. Если дни/время не
                    заданы, проверка выполняется каждый час. В противном случае —
                    только в выбранные дни и часы.
                </Paragraph>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    onFinishFailed={({ errorFields }) => {
                        message.error('Не отправлено: проверьте обязательные поля');
                        if (errorFields?.length) {
                            Modal.error({
                                title: 'Ошибки формы',
                                content: (
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {errorFields.map((field) => (
                                            <li key={field.name.join('.')}>
                                                {field.errors?.[0] || field.name.join('.')}
                                            </li>
                                        ))}
                                    </ul>
                                ),
                            });
                            form.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                >
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
                            options={timeOptionsHourly}
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
                        {lastCheckedAt ? formatMoscow(lastCheckedAt) : 'нет данных'}
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
                                        {formatMoscow(row.checked_at)}
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

            <Card title="Расписание уведомлений" style={{ marginTop: 16 }}>
                {schedulerLoading && (
                    <Text type="secondary">Загрузка настроек...</Text>
                )}
                {!schedulerLoading && schedulerSettings.length === 0 && (
                    <Text type="secondary">Настройки не найдены</Text>
                )}
                {!schedulerLoading &&
                    schedulerSettings
                        .filter((item) => schedulerMeta[item.key])
                        .map((item) => {
                            const meta = schedulerMeta[item.key];
                            return (
                                <Card
                                    key={item.key}
                                    size="small"
                                    style={{ marginBottom: 16 }}
                                    title={meta.title}
                                    extra={(
                                        <Switch
                                            checked={item.enabled}
                                            onChange={(checked) =>
                                                handleSchedulerChange(item.key, { enabled: checked })
                                            }
                                        />
                                    )}
                                >
                                    <Paragraph style={{ marginBottom: 12 }}>
                                        {meta.description}
                                    </Paragraph>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div>
                                            <Text strong>Дни недели</Text>
                                            <Select
                                                mode="multiple"
                                                style={{ width: '100%', marginTop: 4 }}
                                                options={dayOptions}
                                                placeholder="Выберите дни"
                                                value={item.days || []}
                                                onChange={(value) =>
                                                    handleSchedulerChange(item.key, { days: value })
                                                }
                                            />
                                        </div>
                                        <div>
                                            <Text strong>Время (HH:MM)</Text>
                                            <Select
                                                mode="multiple"
                                                style={{ width: '100%', marginTop: 4 }}
                                                options={timeOptions}
                                                placeholder="Выберите время"
                                                value={item.times || []}
                                                onChange={(value) =>
                                                    handleSchedulerChange(item.key, { times: value })
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 12 }}>
                                        <Button
                                            type="primary"
                                            onClick={() => handleSchedulerSave(item.key)}
                                            loading={!!schedulerSaving[item.key]}
                                        >
                                            Сохранить
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
            </Card>
        </>
    );
};

export default SettingsPage;
