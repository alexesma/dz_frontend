import React, { useState } from 'react';
import { Button, Card, Form, Input, Modal, message, Typography } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../context/useAuth';

const { Title, Text } = Typography;

const LoginPage = () => {
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const [form] = Form.useForm();

    const onFinish = async (values) => {
        setLoading(true);
        try {
            await login(values.email, values.password);
            message.success('Успешный вход');
            navigate('/');
        } catch (err) {
            const detail = err?.response?.data?.detail || 'Ошибка входа';
            message.error(detail);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Card style={{ width: 380 }}>
                <Title level={3}>Вход</Title>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
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
                    <Form.Item
                        label="Email"
                        name="email"
                        rules={[{ required: true, message: 'Введите email' }]}
                    >
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item
                        label="Пароль"
                        name="password"
                        rules={[{ required: true, message: 'Введите пароль' }]}
                    >
                        <Input.Password />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                        Войти
                    </Button>
                </Form>
                <div style={{ marginTop: 12 }}>
                    <Text>Нет аккаунта? </Text>
                    <Link to="/register">Зарегистрироваться</Link>
                </div>
            </Card>
        </div>
    );
};

export default LoginPage;
