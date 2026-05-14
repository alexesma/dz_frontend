import React from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Unhandled frontend error', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    render() {
        const { error, errorInfo } = this.state;

        if (!error) {
            return this.props.children;
        }

        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    background: '#f4f7fc',
                }}
            >
                <Card
                    title="Ошибка интерфейса"
                    style={{ width: '100%', maxWidth: 920 }}
                >
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        <Alert
                            type="error"
                            showIcon
                            message="Фронтенд столкнулся с ошибкой во время загрузки."
                            description="Мы показали технические детали ниже, чтобы быстрее добить проблему."
                        />
                        <div>
                            <Typography.Title level={5}>Сообщение ошибки</Typography.Title>
                            <Typography.Paragraph code style={{ whiteSpace: 'pre-wrap' }}>
                                {error?.message || String(error)}
                            </Typography.Paragraph>
                        </div>
                        {errorInfo?.componentStack ? (
                            <div>
                                <Typography.Title level={5}>Компонентный стек</Typography.Title>
                                <Typography.Paragraph
                                    code
                                    style={{ whiteSpace: 'pre-wrap' }}
                                >
                                    {errorInfo.componentStack}
                                </Typography.Paragraph>
                            </div>
                        ) : null}
                        <Button type="primary" onClick={this.handleReload}>
                            Перезагрузить страницу
                        </Button>
                    </Space>
                </Card>
            </div>
        );
    }
}

export default AppErrorBoundary;
