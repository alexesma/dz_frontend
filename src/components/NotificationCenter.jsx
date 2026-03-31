import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Badge,
    Button,
    Drawer,
    Empty,
    Grid,
    List,
    Space,
    Tag,
    Typography,
    message,
    notification,
} from 'antd';
import {
    BellOutlined,
    CheckOutlined,
    NotificationOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import {
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '../api/notifications';

const POLL_INTERVAL_MS = 15000;
const MAX_NOTIFICATIONS = 50;

const levelColorMap = {
    info: 'blue',
    success: 'green',
    warning: 'gold',
    error: 'red',
};

const levelLabelMap = {
    info: 'Инфо',
    success: 'Успех',
    warning: 'Внимание',
    error: 'Ошибка',
};

const supportsBrowserNotifications = () => (
    typeof window !== 'undefined' && 'Notification' in window
);

const getBrowserPermission = () => {
    if (!supportsBrowserNotifications()) {
        return 'unsupported';
    }
    return window.Notification.permission;
};

const formatNotificationDate = (value) => dayjs(value).format('DD.MM.YY HH:mm');

const NotificationCenter = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const [notificationApi, contextHolder] = notification.useNotification();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [fetching, setFetching] = useState(false);
    const [browserPermission, setBrowserPermission] = useState(getBrowserPermission);
    const initializedRef = useRef(false);
    const seenIdsRef = useRef(new Set());

    const isAuthenticated = !loading && Boolean(user);
    const drawerPlacement = screens.md ? 'right' : 'bottom';

    const updateReadState = useCallback((notificationId, readAt = new Date().toISOString()) => {
        setItems((current) => current.map((item) => (
            item.id === notificationId ? { ...item, read_at: readAt } : item
        )));
        setUnreadCount((current) => Math.max(0, current - 1));
    }, []);

    const navigateByLink = useCallback((link) => {
        if (!link) {
            return;
        }
        if (/^https?:\/\//.test(link)) {
            window.open(link, '_blank', 'noopener,noreferrer');
            return;
        }
        navigate(link);
    }, [navigate]);

    const openNotificationItem = useCallback(async (item) => {
        if (!item.read_at) {
            try {
                const result = await markNotificationRead(item.id);
                updateReadState(item.id, result.read_at);
            } catch (err) {
                console.error('Failed to mark notification as read', err);
            }
        }
        if (item.link) {
            setDrawerOpen(false);
            navigateByLink(item.link);
        }
    }, [navigateByLink, updateReadState]);

    const showBrowserNotification = useCallback((item) => {
        if (!supportsBrowserNotifications()) {
            return;
        }
        if (browserPermission !== 'granted') {
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            return;
        }
        const nativeNotification = new window.Notification(item.title, {
            body: item.message,
            tag: `app-notification-${item.id}`,
        });
        nativeNotification.onclick = () => {
            window.focus();
            void openNotificationItem(item);
            nativeNotification.close();
        };
    }, [browserPermission, openNotificationItem]);

    const showInAppNotification = useCallback((item) => {
        notificationApi.open({
            key: `app-notification-${item.id}`,
            message: item.title,
            description: (
                <div className="notification-center-toast-body">
                    <Typography.Text>{item.message}</Typography.Text>
                    <Typography.Text type="secondary" className="notification-center-toast-time">
                        {formatNotificationDate(item.created_at)}
                    </Typography.Text>
                </div>
            ),
            placement: screens.md ? 'bottomRight' : 'topRight',
            duration: 6,
            onClick: () => {
                void openNotificationItem(item);
            },
        });
    }, [notificationApi, openNotificationItem, screens.md]);

    const fetchNotificationState = useCallback(async ({ silent = false } = {}) => {
        if (!isAuthenticated) {
            return;
        }
        if (!silent) {
            setFetching(true);
        }
        try {
            const data = await getNotifications({ limit: MAX_NOTIFICATIONS });
            const nextItems = Array.isArray(data.items) ? data.items : [];
            const nextIds = new Set(nextItems.map((item) => item.id));
            setItems(nextItems);
            setUnreadCount(data.unread_count || 0);

            if (!initializedRef.current) {
                initializedRef.current = true;
                seenIdsRef.current = nextIds;
                return;
            }

            const newItems = nextItems
                .filter((item) => !seenIdsRef.current.has(item.id))
                .sort((left, right) => dayjs(left.created_at).valueOf() - dayjs(right.created_at).valueOf());

            if (newItems.length > 0) {
                newItems.forEach((item) => {
                    showInAppNotification(item);
                    showBrowserNotification(item);
                });
            }
            seenIdsRef.current = new Set([...seenIdsRef.current, ...nextIds]);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        } finally {
            if (!silent) {
                setFetching(false);
            }
        }
    }, [isAuthenticated, showBrowserNotification, showInAppNotification]);

    const handleRequestBrowserPermission = useCallback(async () => {
        if (!supportsBrowserNotifications()) {
            message.warning('Браузер не поддерживает системные push-уведомления.');
            return;
        }
        try {
            const permission = await window.Notification.requestPermission();
            setBrowserPermission(permission);
            if (permission === 'granted') {
                message.success('Системные уведомления включены.');
            } else {
                message.warning('Браузер не разрешил системные уведомления.');
            }
        } catch (err) {
            console.error('Failed to request notification permission', err);
            message.error('Не удалось запросить разрешение на push-уведомления.');
        }
    }, []);

    const handleMarkAllRead = useCallback(async () => {
        try {
            await markAllNotificationsRead();
            const readAt = new Date().toISOString();
            setItems((current) => current.map((item) => ({ ...item, read_at: readAt })));
            setUnreadCount(0);
            message.success('Все уведомления отмечены как прочитанные.');
        } catch (err) {
            console.error('Failed to mark all notifications as read', err);
            message.error('Не удалось отметить уведомления как прочитанные.');
        }
    }, []);

    useEffect(() => {
        setBrowserPermission(getBrowserPermission());
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            initializedRef.current = false;
            seenIdsRef.current = new Set();
            setItems([]);
            setUnreadCount(0);
            setDrawerOpen(false);
            return undefined;
        }

        void fetchNotificationState();
        const intervalId = window.setInterval(() => {
            void fetchNotificationState({ silent: true });
        }, POLL_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void fetchNotificationState({ silent: true });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchNotificationState, isAuthenticated]);

    const unreadItems = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

    if (!isAuthenticated) {
        return null;
    }

    return (
        <>
            {contextHolder}
            <div className="notification-center-trigger">
                <Badge count={unreadCount} size="small" overflowCount={99}>
                    <Button
                        type="primary"
                        shape="circle"
                        size="large"
                        icon={<BellOutlined />}
                        onClick={() => setDrawerOpen(true)}
                    />
                </Badge>
            </div>
            <Drawer
                open={drawerOpen}
                placement={drawerPlacement}
                height="70vh"
                width={380}
                onClose={() => setDrawerOpen(false)}
                className="notification-center-drawer"
                title={(
                    <Space size={8}>
                        <NotificationOutlined />
                        <span>Сообщения</span>
                        <Tag color={unreadCount ? 'processing' : 'default'}>
                            Непрочитано: {unreadCount}
                        </Tag>
                    </Space>
                )}
                extra={(
                    <Space wrap>
                        {supportsBrowserNotifications() && browserPermission !== 'granted' && (
                            <Button size="small" onClick={handleRequestBrowserPermission}>
                                Разрешить push
                            </Button>
                        )}
                        <Button
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={handleMarkAllRead}
                            disabled={unreadItems === 0}
                        >
                            Прочитать все
                        </Button>
                    </Space>
                )}
            >
                <List
                    loading={fetching}
                    dataSource={items}
                    locale={{
                        emptyText: <Empty description="Пока сообщений нет" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                    }}
                    className="notification-center-list"
                    renderItem={(item) => {
                        const isUnread = !item.read_at;
                        return (
                            <List.Item
                                className={isUnread ? 'notification-center-item notification-center-item-unread' : 'notification-center-item'}
                                actions={[
                                    <Button
                                        key="open"
                                        type="link"
                                        size="small"
                                        onClick={() => {
                                            void openNotificationItem(item);
                                        }}
                                    >
                                        {item.link ? 'Открыть' : 'Отметить'}
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={(
                                        <Space wrap size={8}>
                                            <Typography.Text strong={isUnread}>{item.title}</Typography.Text>
                                            <Tag color={levelColorMap[item.level] || 'default'}>
                                                {levelLabelMap[item.level] || item.level}
                                            </Tag>
                                            {isUnread && <Tag color="processing">Новое</Tag>}
                                        </Space>
                                    )}
                                    description={(
                                        <div className="notification-center-item-body">
                                            <Typography.Paragraph className="notification-center-item-message">
                                                {item.message}
                                            </Typography.Paragraph>
                                            <Typography.Text type="secondary">
                                                {formatNotificationDate(item.created_at)}
                                            </Typography.Text>
                                        </div>
                                    )}
                                />
                            </List.Item>
                        );
                    }}
                />
            </Drawer>
        </>
    );
};

export default NotificationCenter;
