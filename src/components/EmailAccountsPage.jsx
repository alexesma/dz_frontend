import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, message } from 'antd';
import {
    createEmailAccount,
    deleteEmailAccount,
    getEmailAccounts,
    disconnectGoogleOAuth,
    initGoogleOAuth,
    saveGoogleOAuthToken,
    testEmailAccount,
    updateEmailAccount,
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
    { label: 'Gmail API', value: 'gmail_api' },
    { label: 'Resend API', value: 'resend_api' },
];

const EmailAccountsPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [testLoading, setTestLoading] = useState(false);
    const [testSendOpen, setTestSendOpen] = useState(false);
    const [tokenLoading, setTokenLoading] = useState(false);
    const [form] = Form.useForm();
    const [testSendForm] = Form.useForm();
    const transport = Form.useWatch('transport', form) || 'smtp';
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
                transport: ['gmail_api', 'resend_api'].includes(record.transport)
                    ? record.transport
                    : 'smtp',
                smtp_use_ssl: true,
                imap_port: 993,
                smtp_port: 465,
                resend_timeout: 20,
                google_refresh_token: '',
                ...record,
            });
        } else {
            form.setFieldsValue({
                transport: 'smtp',
                password: '',
                imap_port: 993,
                smtp_port: 465,
                resend_timeout: 20,
                smtp_use_ssl: true,
                google_refresh_token: '',
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
            const payload = { ...values };
            delete payload.google_refresh_token;
            if (editing) {
                await updateEmailAccount(editing.id, payload);
                message.success('Аккаунт обновлен');
            } else {
                await createEmailAccount(payload);
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

    const handleSaveGoogleToken = async () => {
        if (!editing) return;
        try {
            const values = await form.validateFields(['google_refresh_token']);
            setTokenLoading(true);
            const { data } = await saveGoogleOAuthToken(editing.id, {
                refresh_token: values.google_refresh_token,
            });
            message.success('Google refresh token сохранен');
            setEditing(data);
            form.setFieldsValue({ google_refresh_token: '' });
            fetchAccounts();
        } catch (error) {
            if (error?.errorFields) {
                return;
            }
            console.error('Save Google refresh token failed:', error);
            message.error(
                error?.response?.data?.detail
                || 'Не удалось сохранить Google refresh token'
            );
        } finally {
            setTokenLoading(false);
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
            const inboundLabel = data.outbound_transport === 'resend_api'
                ? 'Входящая почта (Resend receiving)'
                : 'IMAP';
            if (data.imap_ok) {
                lines.push(`${inboundLabel}: OK`);
            } else if (data.imap_ok === false) {
                lines.push(
                    `${inboundLabel}: Ошибка: `
                    + `${data.imap_error || 'неизвестно'}`
                );
            }
            if (data.inbound_note) {
                lines.push(data.inbound_note);
            }
            const outboundLabel = data.outbound_transport === 'gmail_api'
                ? 'Исходящая почта (Gmail API)'
                : data.outbound_transport === 'resend_api'
                    ? 'Исходящая почта (Resend API)'
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
            render: (value) => (
                value === 'gmail_api'
                    ? 'Gmail API'
                    : value === 'resend_api'
                        ? 'Resend API'
                        : 'SMTP'
            ),
        },
        { title: 'SMTP host', dataIndex: 'smtp_host', key: 'smtp_host' },
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
            width: 280,
            render: (_, record) => (
                <Space size="small" wrap className="table-actions">
                    <Button size="small" onClick={() => openModal(record)}>Редактировать</Button>
                    {record.transport === 'gmail_api' && record.oauth_provider ? (
                        <Button size="small" onClick={() => handleDisconnectOAuth(record)}>
                            Отвязать Google
                        </Button>
                    ) : null}
                    {record.transport === 'gmail_api' && !record.oauth_provider ? (
                        <Button size="small" onClick={() => handleGoogleOAuth(record)}>
                            Google OAuth
                        </Button>
                    ) : null}
                    <Popconfirm
                        title="Удалить аккаунт?"
                        description="Это действие необратимо"
                        onConfirm={() => handleDelete(record)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button size="small" danger>Удалить</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="page-shell">
        <Card
            title="Почтовые аккаунты"
            extra={<Button type="primary" onClick={() => openModal()}>Добавить аккаунт</Button>}
        >
            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={accounts}
                scroll={{ x: 'max-content' }}
            />
            <Modal
                open={modalOpen}
                title={editing ? 'Редактировать аккаунт' : 'Новый аккаунт'}
                onCancel={() => setModalOpen(false)}
                footer={null}
                destroyOnClose
                width={720}
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
                        extra="Для Gmail API и Resend API можно оставить пустым, если IMAP/SMTP не используется."
                    >
                        <Input.Password />
                    </Form.Item>
                    <Form.Item
                        name="transport"
                        label="Транспорт исходящей почты"
                        initialValue="smtp"
                        extra="SMTP подходит для обычной отправки. Gmail API нужен для @gmail.com. Resend API подходит для доменов, где отправка и прием идут через Resend по HTTPS."
                    >
                        <Select options={transportOptions} />
                    </Form.Item>
                    {transport !== 'resend_api' ? (
                        <>
                            <Form.Item name="imap_host" label="IMAP host"> 
                                <Input />
                            </Form.Item>
                            <Form.Item name="imap_port" label="IMAP port" initialValue={993}> 
                                <InputNumber style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="imap_folder" label="IMAP папка">
                                <Input placeholder="INBOX" />
                            </Form.Item>
                        </>
                    ) : (
                        <Form.Item
                            label="Resend receiving"
                            extra="Для входящей почты через Resend достаточно email аккаунта и API key. IMAP не нужен."
                        >
                            <Input value="Входящие письма будут забираться через Resend Receiving API" readOnly />
                        </Form.Item>
                    )}
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
                    ) : transport === 'gmail_api' ? (
                        <>
                            <Form.Item
                                label="Gmail API"
                                extra="Можно подключить Gmail двумя способами: через кнопку «Google OAuth» при наличии публичного callback URL или вручную вставить Google refresh token."
                            >
                                <Input
                                    value={
                                        editing?.oauth_provider === 'google'
                                            ? 'Google OAuth подключён'
                                            : 'Google OAuth не подключён'
                                    }
                                    readOnly
                                />
                            </Form.Item>
                            <Form.Item
                                name="google_refresh_token"
                                label="Google refresh token"
                                extra="Для режима без поддомена и без HTTPS callback вставьте сюда refresh token, полученный локально один раз."
                            >
                                <Input.Password
                                    placeholder="1//0g..."
                                    autoComplete="new-password"
                                />
                            </Form.Item>
                        </>
                    ) : transport === 'resend_api' ? (
                        <>
                            <Form.Item
                                name="resend_api_key"
                                label="Resend API key"
                                extra="API key из панели Resend. Для приема писем домен должен быть включен на Receiving, для отправки — Verified на Sending."
                            >
                                <Input.Password
                                    placeholder="re_..."
                                    autoComplete="new-password"
                                />
                            </Form.Item>
                            <Form.Item
                                name="resend_timeout"
                                label="Resend timeout (сек)"
                                initialValue={20}
                            >
                                <InputNumber style={{ width: '100%' }} min={5} max={120} />
                            </Form.Item>
                        </>
                    ) : null}
                    <Form.Item name="purposes" label="Назначения">
                        <Select mode="multiple" options={purposeOptions} />
                    </Form.Item>
                    <Form.Item name="is_active" label="Активен" valuePropName="checked" initialValue>
                        <Switch />
                    </Form.Item>
                    <Space wrap>
                        {editing && transport === 'gmail_api' ? (
                            <Button
                                onClick={handleSaveGoogleToken}
                                loading={tokenLoading}
                            >
                                Сохранить Google token
                            </Button>
                        ) : null}
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
                    </Space>
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
        </div>
    );
};

export default EmailAccountsPage;
