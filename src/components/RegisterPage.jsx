import React, { useState } from 'react';
import { Button, Card, Form, Input, message, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

const { Title, Text } = Typography;

const RegisterPage = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const onFinish = async (values) => {
        setLoading(true);
        try {
            await api.post('/auth/register', values);
            message.success('Регистрация успешна. Ожидайте подтверждения администратора.');
            navigate('/login');
        } catch (err) {
            const detail = err?.response?.data?.detail || 'Ошибка регистрации';
            message.error(detail);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Card style={{ width: 380 }}>
                <Title level={3}>Регистрация</Title>
                <Form layout="vertical" onFinish={onFinish}>
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
                        Создать аккаунт
                    </Button>
                </Form>
                <div style={{ marginTop: 12 }}>
                    <Text>Уже есть аккаунт? </Text>
                    <Link to="/login">Войти</Link>
                </div>
            </Card>
        </div>
    );
};

export default RegisterPage;
