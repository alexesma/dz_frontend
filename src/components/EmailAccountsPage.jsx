import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, message } from 'antd';
import { createEmailAccount, deleteEmailAccount, getEmailAccounts, testEmailAccount, updateEmailAccount } from '../api/emailAccounts';

const purposeOptions = [
    { label: 'Прием заказов (IMAP)', value: 'orders_in' },
    { label: 'Отправка заказов (SMTP)', value: 'orders_out' },
    { label: 'Отчеты (SMTP)', value: 'reports_out' },
    { label: 'Прайсы входящие', value: 'prices_in' },
    { label: 'Прайсы исходящие', value: 'prices_out' },
];

const EmailAccountsPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [testLoading, setTestLoading] = useState(false);
    const [form] = Form.useForm();

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
            form.setFieldsValue(record);
        } else {
            form.resetFields();
        }
        setModalOpen(true);
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
        } catch (err) {
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
            if (data.smtp_ok) {
                lines.push('SMTP: OK');
            } else if (data.smtp_ok === false) {
                lines.push(`SMTP: Ошибка: ${data.smtp_error || 'неизвестно'}`);
            }
            if (data.imap_ok && data.smtp_ok) {
                message.success('IMAP и SMTP успешно проверены');
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
        { title: 'SMTP host', dataIndex: 'smtp_host', key: 'smtp_host' },
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
                    <Form.Item name="password" label="Пароль" rules={[{ required: true }]}> 
                        <Input.Password />
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
                    <Form.Item name="smtp_host" label="SMTP host"> 
                        <Input />
                    </Form.Item>
                    <Form.Item name="smtp_port" label="SMTP port" initialValue={465}> 
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="smtp_use_ssl" label="SMTP SSL" valuePropName="checked" initialValue>
                        <Switch />
                    </Form.Item>
                    <Form.Item name="purposes" label="Назначения">
                        <Select mode="multiple" options={purposeOptions} />
                    </Form.Item>
                    <Form.Item name="is_active" label="Активен" valuePropName="checked" initialValue>
                        <Switch />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {editing ? (
                            <Button onClick={handleTest} loading={testLoading}>
                                Проверить IMAP + SMTP
                            </Button>
                        ) : null}
                        <Button type="primary" htmlType="submit">
                            Сохранить
                        </Button>
                    </div>
                </Form>
            </Modal>
        </Card>
    );
};

export default EmailAccountsPage;
