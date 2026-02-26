import React from 'react';
import { Button, Card } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const Dashboard = () => {
    const handleRefresh = () => {
        window.location.reload();
    };

    return (
        <Card
            title="Dashboard"
            extra={
                <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                    Обновить
                </Button>
            }
            style={{ margin: '20px' }}
        >
            <h2>Добро пожаловать в систему управления заказами</h2>
            <p>Используйте боковое меню для навигации.</p>
        </Card>
    );
};

export default Dashboard;
