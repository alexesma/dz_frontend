import React, { useEffect, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Switch,
    Typography,
    message,
} from 'antd';
import {
    getPriceCheckLogs,
    getPriceCheckSchedule,
    getCustomerOrderInboxSettings,
    getSchedulerSettings,
    updateCustomerOrderInboxSettings,
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
    const [orderInboxSettings, setOrderInboxSettings] = useState(null);
    const [orderInboxLoading, setOrderInboxLoading] = useState(false);
    const [orderInboxSaving, setOrderInboxSaving] = useState(false);

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
            description: 'Сводка для администраторов в программе по позициям, найденным в прайсах и на сайте.',
        },
        pricelist_stale_notify: {
            title: 'Проблемы с обновлением прайсов',
            description: 'Сводка для администраторов в программе по прайсам, которые давно не обновлялись.',
        },
        pricelist_stale_cleanup: {
            title: 'Очистка истории проблем',
            description: 'Удаляет записи о проблемах с прайсами старше недели.',
        },
        cleanup_old_pricelists: {
            title: 'Очистка старых прайсов',
            description: 'Удаляет старые прайсы, оставляя последние.',
        },
        metrics_snapshot: {
            title: 'Снимки мониторинга',
            description: 'Сохраняет снимок состояния БД и системы для графиков.',
        },
        customer_orders_check: {
            title: 'Проверка заказов клиентов',
            description: 'Проверяет входящую почту с заказами клиентов.',
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

    useEffect(() => {
        (async () => {
            setOrderInboxLoading(true);
            try {
                const { data } = await getCustomerOrderInboxSettings();
                setOrderInboxSettings(data || null);
            } catch (err) {
                console.error('Load order inbox settings failed:', err);
                message.error('Не удалось загрузить настройки почты заказов');
            } finally {
                setOrderInboxLoading(false);
            }
        })();
    }, []);

    const handleOrderInboxSave = async () => {
        if (!orderInboxSettings) return;
        setOrderInboxSaving(true);
        try {
            const payload = {
                lookback_days: orderInboxSettings.lookback_days,
                mark_seen: orderInboxSettings.mark_seen,
                error_file_retention_days:
                    orderInboxSettings.error_file_retention_days,
                supplier_response_lookback_days:
                    orderInboxSettings.supplier_response_lookback_days,
                supplier_order_stub_enabled:
                    orderInboxSettings.supplier_order_stub_enabled,
                supplier_order_stub_email:
                    orderInboxSettings.supplier_order_stub_email,
            };
            const { data } = await updateCustomerOrderInboxSettings(payload);
            setOrderInboxSettings(data);
            message.success('Настройки почты заказов обновлены');
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(detail || 'Ошибка сохранения настроек');
        } finally {
            setOrderInboxSaving(false);
        }
    };

    const handleSave = async (values) => {
        try {
            await updatePriceCheckSchedule(values);
            message.success('Расписание обновлено');
        } catch (error) {
            console.error('Schedule save failed:', error);
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

                <Card title="Ответы поставщиков" style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <Text strong>Глубина проверки ответов (дней)</Text>
                            <div style={{ marginTop: 8 }}>
                                <InputNumber
                                    min={1}
                                    max={60}
                                    value={orderInboxSettings?.supplier_response_lookback_days ?? 14}
                                    onChange={(value) =>
                                        setOrderInboxSettings((prev) => ({
                                            ...(prev || {}),
                                            supplier_response_lookback_days: value ?? 14,
                                        }))
                                    }
                                    disabled={orderInboxLoading}
                                />
                            </div>
                        </div>
                        <div>
                            <Text strong>Заглушка отправки заказов поставщикам</Text>
                            <div style={{ marginTop: 8 }}>
                                <Switch
                                    checked={orderInboxSettings?.supplier_order_stub_enabled ?? true}
                                    onChange={(checked) =>
                                        setOrderInboxSettings((prev) => ({
                                            ...(prev || {}),
                                            supplier_order_stub_enabled: checked,
                                        }))
                                    }
                                    disabled={orderInboxLoading}
                                />
                            </div>
                        </div>
                        <div style={{ minWidth: 320 }}>
                            <Text strong>Email для заглушки</Text>
                            <div style={{ marginTop: 8 }}>
                                <Input
                                    value={orderInboxSettings?.supplier_order_stub_email ?? 'info@dragonzap.ru'}
                                    onChange={(event) =>
                                        setOrderInboxSettings((prev) => ({
                                            ...(prev || {}),
                                            supplier_order_stub_email: event.target.value,
                                        }))
                                    }
                                    disabled={orderInboxLoading}
                                    placeholder="info@dragonzap.ru"
                                />
                            </div>
                        </div>
                        <Button
                            type="primary"
                            loading={orderInboxSaving}
                            onClick={handleOrderInboxSave}
                        >
                            Сохранить
                        </Button>
                    </div>
                </Card>

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

            <Card title="Почта заказов клиентов" style={{ marginTop: 16 }}>
                <Paragraph style={{ marginBottom: 16 }}>
                    Глубина проверки определяет, за сколько последних дней
                    искать письма с заказами (по дате письма). Ошибочные
                    файлы заказов хранятся временно, чтобы их можно было
                    перепроверить после правки настроек.
                </Paragraph>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div>
                        <Text strong>Глубина проверки (дней)</Text>
                        <div style={{ marginTop: 8 }}>
                            <InputNumber
                                min={1}
                                max={30}
                                value={orderInboxSettings?.lookback_days ?? 1}
                                onChange={(value) =>
                                    setOrderInboxSettings((prev) => ({
                                        ...(prev || {}),
                                        lookback_days: value ?? 1,
                                    }))
                                }
                                disabled={orderInboxLoading}
                            />
                        </div>
                    </div>
                    <div>
                        <Text strong>Хранить ошибочные файлы (дней)</Text>
                        <div style={{ marginTop: 8 }}>
                            <InputNumber
                                min={1}
                                max={30}
                                value={
                                    orderInboxSettings?.error_file_retention_days
                                    ?? 5
                                }
                                onChange={(value) =>
                                    setOrderInboxSettings((prev) => ({
                                        ...(prev || {}),
                                        error_file_retention_days: value ?? 5,
                                    }))
                                }
                                disabled={orderInboxLoading}
                            />
                        </div>
                    </div>
                    <div>
                        <Text strong>Отмечать письма прочитанными</Text>
                        <div style={{ marginTop: 8 }}>
                            <Switch
                                checked={orderInboxSettings?.mark_seen ?? false}
                                onChange={(checked) =>
                                    setOrderInboxSettings((prev) => ({
                                        ...(prev || {}),
                                        mark_seen: checked,
                                    }))
                                }
                                disabled={orderInboxLoading}
                            />
                        </div>
                    </div>
                    <Button
                        type="primary"
                        loading={orderInboxSaving}
                        onClick={handleOrderInboxSave}
                    >
                        Сохранить
                    </Button>
                </div>
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
