import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, message } from 'antd';
import {
    createEmailAccount,
    deleteEmailAccount,
    getEmailAccounts,
    testEmailAccount,
    updateEmailAccount,
    initGoogleOAuth,
    disconnectGoogleOAuth,
} from '../api/emailAccounts';

const purposeOptions = [
    { label: 'Прием заказов (IMAP)', value: 'orders_in' },
    { label: 'Отправка заказов (исходящая почта)', value: 'orders_out' },
    { label: 'Отчеты (исходящая почта)', value: 'reports_out' },
    { label: 'Прайсы входящие', value: 'prices_in' },
    { label: 'Прайсы исходящие', value: 'prices_out' },
];

const transportOptions = [
    { label: 'SMTP', value: 'smtp' },
    { label: 'HTTP API', value: 'http_api' },
];

const httpApiProviderOptions = [
    { label: 'Resend', value: 'resend' },
    { label: 'Brevo', value: 'brevo' },
];

const EmailAccountsPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [testLoading, setTestLoading] = useState(false);
    const [testSendOpen, setTestSendOpen] = useState(false);
    const [form] = Form.useForm();
    const [testSendForm] = Form.useForm();
    const transport = Form.useWatch('transport', form) || 'smtp';
    const httpApiProvider = Form.useWatch('http_api_provider', form);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const { data } = await getEmailAccounts();
            setAccounts(data || []);
        } catch {
            message.error('Не удалось загрузить почтовые аккаунты');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const openModal = (record = null) => {
        setEditing(record);
        if (record) {
            form.setFieldsValue({
                transport: 'smtp',
                smtp_use_ssl: true,
                imap_port: 993,
                smtp_port: 465,
                http_api_timeout: 20,
                ...record,
            });
        } else {
            form.setFieldsValue({
                transport: 'smtp',
                password: '',
                imap_port: 993,
                smtp_port: 465,
                smtp_use_ssl: true,
                http_api_provider: 'resend',
                http_api_timeout: 20,
                purposes: [],
                is_active: true,
            });
        }
        setModalOpen(true);
    };

    const openTestSendModal = () => {
        if (!editing) return;
        testSendForm.setFieldsValue({
            to_email: editing.email || '',
        });
        setTestSendOpen(true);
    };

    const handleSubmit = async (values) => {
        try {
            if (editing) {
                await updateEmailAccount(editing.id, values);
                message.success('Аккаунт обновлен');
            } else {
                await createEmailAccount(values);
                message.success('Аккаунт создан');
            }
            setModalOpen(false);
            setEditing(null);
            form.resetFields();
            fetchAccounts();
        } catch (error) {
            console.error('Save email account failed:', error);
            message.error('Ошибка сохранения аккаунта');
        }
    };

    const handleTest = async () => {
        if (!editing) return;
        setTestLoading(true);
        try {
            const { data } = await testEmailAccount(editing.id, {
                imap: true,
                smtp: true,
            });
            const lines = [];
            if (data.imap_ok) {
                lines.push('IMAP: OK');
            } else if (data.imap_ok === false) {
                lines.push(`IMAP: Ошибка: ${data.imap_error || 'неизвестно'}`);
            }
            const outboundLabel = data.outbound_transport === 'http_api'
                ? 'Исходящая почта (HTTP API)'
                : 'Исходящая почта (SMTP)';
            if (data.smtp_ok) {
                lines.push(`${outboundLabel}: OK`);
            } else if (data.smtp_ok === false) {
                lines.push(
                    `${outboundLabel}: Ошибка: `
                    + `${data.smtp_error || 'неизвестно'}`
                );
            }
            if (data.outbound_note) {
                lines.push(data.outbound_note);
            }
            if (data.imap_ok && data.smtp_ok) {
                message.success('Проверка учетной записи пройдена');
            } else {
                Modal.info({
                    title: 'Результат проверки',
                    content: (
                        <div>
                            {lines.map((line) => (
                                <div key={line}>{line}</div>
                            ))}
                        </div>
                    ),
                });
            }
        } catch (error) {
            console.error('Test email account failed:', error);
            message.error('Не удалось проверить почту');
        } finally {
            setTestLoading(false);
        }
    };

    const handleRealSendTest = async () => {
        if (!editing) return;
        try {
            const values = await testSendForm.validateFields();
            setTestLoading(true);
            const { data } = await testEmailAccount(editing.id, {
                imap: false,
                smtp: true,
                real_send: true,
                to_email: values.to_email,
            });
            if (data.smtp_ok) {
                message.success(
                    data.outbound_note || 'Тестовое письмо отправлено'
                );
                setTestSendOpen(false);
                testSendForm.resetFields();
            } else {
                Modal.error({
                    title: 'Тестовая отправка не пройдена',
                    content: data.smtp_error || 'Неизвестная ошибка',
                });
            }
        } catch (error) {
            if (error?.errorFields) {
                return;
            }
            console.error('Real send email test failed:', error);
            message.error('Не удалось отправить тестовое письмо');
        } finally {
            setTestLoading(false);
        }
    };

    const handleGoogleOAuth = async (record) => {
        try {
            const { data } = await initGoogleOAuth(record.id);
            const url = data?.auth_url;
            if (!url) {
                message.error('Не удалось получить ссылку авторизации');
                return;
            }
            window.open(url, '_blank', 'width=600,height=700');
            message.info('Откройте окно авторизации Google и завершите вход');
        } catch (error) {
            console.error('Init Google OAuth failed:', error);
            message.error('Не удалось начать авторизацию Google');
        }
    };

    const handleDisconnectOAuth = async (record) => {
        try {
            await disconnectGoogleOAuth(record.id);
            message.success('Google OAuth отключён');
            fetchAccounts();
        } catch (error) {
            console.error('Disconnect OAuth failed:', error);
            message.error('Не удалось отключить OAuth');
        }
    };

    const handleDelete = async (record) => {
        try {
            await deleteEmailAccount(record.id);
            message.success('Аккаунт удален');
            fetchAccounts();
        } catch {
            message.error('Ошибка удаления аккаунта');
        }
    };

    const columns = [
        { title: 'Название', dataIndex: 'name', key: 'name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        { title: 'IMAP host', dataIndex: 'imap_host', key: 'imap_host' },
        {
            title: 'IMAP папка',
            dataIndex: 'imap_folder',
            key: 'imap_folder',
            render: (value) => value || 'INBOX',
        },
        {
            title: 'Транспорт',
            dataIndex: 'transport',
            key: 'transport',
            render: (value) => (value === 'http_api' ? 'HTTP API' : 'SMTP'),
        },
        { title: 'SMTP host', dataIndex: 'smtp_host', key: 'smtp_host' },
        {
            title: 'HTTP API',
            key: 'http_api',
            render: (_, record) => (
                record.transport === 'http_api'
                    ? `${record.http_api_provider || '—'}`
                    : '—'
            ),
        },
        {
            title: 'OAuth',
            key: 'oauth',
            render: (_, record) => (
                record.oauth_provider === 'google'
                    ? 'Google'
                    : (record.oauth_provider || '—')
            ),
        },
        {
            title: 'Назначения',
            dataIndex: 'purposes',
            key: 'purposes',
            render: (value) => (value || []).join(', '),
        },
        {
            title: 'Активен',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (value) => (value ? 'Да' : 'Нет'),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_, record) => (
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" onClick={() => openModal(record)}>Редактировать</Button>
                    {record.oauth_provider ? (
                        <Button size="small" onClick={() => handleDisconnectOAuth(record)}>
                            Отвязать Google
                        </Button>
                    ) : (
                        <Button size="small" onClick={() => handleGoogleOAuth(record)}>
                            Google OAuth
                        </Button>
                    )}
                    <Popconfirm
                        title="Удалить аккаунт?"
                        description="Это действие необратимо"
                        onConfirm={() => handleDelete(record)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button size="small" danger>Удалить</Button>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <Card
            title="Почтовые аккаунты"
            extra={<Button type="primary" onClick={() => openModal()}>Добавить аккаунт</Button>}
        >
            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={accounts}
            />
            <Modal
                open={modalOpen}
                title={editing ? 'Редактировать аккаунт' : 'Новый аккаунт'}
                onCancel={() => setModalOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
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
                    <Form.Item name="name" label="Название" rules={[{ required: true }]}> 
                        <Input />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true }]}> 
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Пароль почты / SMTP"
                        extra="Для HTTP API можно оставить пустым, если IMAP/SMTP не используется."
                    >
                        <Input.Password />
                    </Form.Item>
                    <Form.Item
                        name="transport"
                        label="Транспорт исходящей почты"
                        initialValue="smtp"
                        extra="SMTP подойдет для обычной отправки. HTTP API нужен, когда SMTP-порты недоступны или заблокированы."
                    >
                        <Select options={transportOptions} />
                    </Form.Item>
                    <Form.Item name="imap_host" label="IMAP host"> 
                        <Input />
                    </Form.Item>
                    <Form.Item name="imap_port" label="IMAP port" initialValue={993}> 
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="imap_folder" label="IMAP папка">
                        <Input placeholder="INBOX" />
                    </Form.Item>
                    {transport === 'smtp' ? (
                        <>
                            <Form.Item name="smtp_host" label="SMTP host"> 
                                <Input />
                            </Form.Item>
                            <Form.Item name="smtp_port" label="SMTP port" initialValue={465}> 
                                <InputNumber style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                name="smtp_use_ssl"
                                label="SMTP SSL"
                                valuePropName="checked"
                                initialValue
                            >
                                <Switch />
                            </Form.Item>
                        </>
                    ) : (
                        <>
                            <Form.Item
                                name="http_api_provider"
                                label="HTTP API провайдер"
                                extra="Сейчас поддержаны Resend и Brevo."
                            >
                                <Select options={httpApiProviderOptions} />
                            </Form.Item>
                            <Form.Item
                                name="http_api_url"
                                label="URL API"
                                extra="Можно оставить пустым, будет использован стандартный URL выбранного провайдера."
                            >
                                <Input placeholder="https://api.resend.com/emails" />
                            </Form.Item>
                            <Form.Item
                                name="http_api_key"
                                label="API ключ"
                                extra={
                                    httpApiProvider === 'resend'
                                        ? 'Ключ API из панели Resend.'
                                        : httpApiProvider === 'brevo'
                                            ? 'Ключ API из раздела SMTP & API в кабинете Brevo.'
                                            : 'Ключ исходящей отправки. Используется вместо SMTP-пароля.'
                                }
                            >
                                <Input.Password />
                            </Form.Item>
                            <Form.Item
                                name="http_api_timeout"
                                label="Таймаут HTTP API (сек)"
                                initialValue={20}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item name="purposes" label="Назначения">
                        <Select mode="multiple" options={purposeOptions} />
                    </Form.Item>
                    <Form.Item name="is_active" label="Активен" valuePropName="checked" initialValue>
                        <Switch />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {editing ? (
                            <Button onClick={handleTest} loading={testLoading}>
                                Проверить входящую и исходящую почту
                            </Button>
                        ) : null}
                        {editing ? (
                            <Button onClick={openTestSendModal} loading={testLoading}>
                                Отправить тестовое письмо
                            </Button>
                        ) : null}
                        <Button type="primary" htmlType="submit">
                            Сохранить
                        </Button>
                    </div>
                </Form>
            </Modal>
            <Modal
                open={testSendOpen}
                title="Тестовая отправка"
                onCancel={() => setTestSendOpen(false)}
                onOk={handleRealSendTest}
                confirmLoading={testLoading}
                okText="Отправить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={testSendForm} layout="vertical">
                    <Form.Item
                        name="to_email"
                        label="Кому отправить тест"
                        extra="На этот адрес уйдет реальное письмо через выбранный транспорт."
                        rules={[
                            { required: true, message: 'Укажите email' },
                            { type: 'email', message: 'Некорректный email' },
                        ]}
                    >
                        <Input placeholder="name@example.com" />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default EmailAccountsPage;
