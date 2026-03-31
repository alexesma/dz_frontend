import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Badge,
    Button,
    Drawer,
    Empty,
    Grid,
    List,
    Space,
    Switch,
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
const SOUND_ENABLED_KEY = 'notification_center_sound_enabled_v1';
const VIBRATION_ENABLED_KEY = 'notification_center_vibration_enabled_v1';
const DND_ENABLED_KEY = 'notification_center_dnd_enabled_v1';
const IMPORTANT_ONLY_KEY = 'notification_center_important_only_v1';

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

const supportsSecurePush = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    if (window.isSecureContext) {
        return true;
    }
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
};

const getBrowserPermission = () => {
    if (!supportsBrowserNotifications()) {
        return 'unsupported';
    }
    return window.Notification.permission;
};

const formatNotificationDate = (value) => dayjs(value).format('DD.MM.YY HH:mm');

const loadBooleanPreference = (key, fallback = true) => {
    if (typeof window === 'undefined') {
        return fallback;
    }
    const rawValue = window.localStorage.getItem(key);
    if (rawValue === null) {
        return fallback;
    }
    return rawValue === '1';
};

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
    const [soundEnabled, setSoundEnabled] = useState(() => loadBooleanPreference(SOUND_ENABLED_KEY, true));
    const [vibrationEnabled, setVibrationEnabled] = useState(() => loadBooleanPreference(VIBRATION_ENABLED_KEY, true));
    const [dndEnabled, setDndEnabled] = useState(() => loadBooleanPreference(DND_ENABLED_KEY, false));
    const [importantOnlyEnabled, setImportantOnlyEnabled] = useState(() => loadBooleanPreference(IMPORTANT_ONLY_KEY, false));
    const initializedRef = useRef(false);
    const seenIdsRef = useRef(new Set());
    const titleFlashIntervalRef = useRef(null);
    const titleBaseRef = useRef(
        typeof document !== 'undefined' ? document.title : 'Dragonzap'
    );

    const isAuthenticated = !loading && Boolean(user);
    const drawerPlacement = screens.md ? 'right' : 'bottom';
    const securePushAvailable = supportsBrowserNotifications() && supportsSecurePush();

    const stopTitleFlash = useCallback(() => {
        if (titleFlashIntervalRef.current) {
            window.clearInterval(titleFlashIntervalRef.current);
            titleFlashIntervalRef.current = null;
        }
        if (typeof document !== 'undefined') {
            document.title = titleBaseRef.current;
        }
    }, []);

    const startTitleFlash = useCallback((count) => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            return;
        }
        titleBaseRef.current = titleBaseRef.current || document.title;
        if (titleFlashIntervalRef.current) {
            return;
        }
        let showAlert = true;
        titleFlashIntervalRef.current = window.setInterval(() => {
            document.title = showAlert
                ? `(${count}) Новые сообщения`
                : titleBaseRef.current;
            showAlert = !showAlert;
        }, 1000);
    }, []);

    const triggerFallbackAttention = useCallback((count) => {
        if (typeof window === 'undefined') {
            return;
        }
        startTitleFlash(count);
        try {
            if (
                vibrationEnabled
                && typeof window.navigator !== 'undefined'
                && typeof window.navigator.vibrate === 'function'
            ) {
                window.navigator.vibrate([180, 80, 180]);
            }
        } catch (err) {
            console.debug('Vibration is not available', err);
        }

        if (!soundEnabled) {
            return;
        }

        try {
            if (
                typeof window.navigator !== 'undefined'
                && document.visibilityState === 'visible'
            ) {
                return;
            }
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                return;
            }
            const audioContext = new AudioContextClass();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.35);
            oscillator.onended = () => {
                void audioContext.close().catch(() => {});
            };
        } catch (err) {
            console.debug('Audio attention signal is not available', err);
        }
    }, [soundEnabled, startTitleFlash, vibrationEnabled]);

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

    const shouldActivelyNotify = useCallback((item) => {
        if (dndEnabled) {
            return false;
        }
        if (!importantOnlyEnabled) {
            return true;
        }
        return ['warning', 'error'].includes(item?.level);
    }, [dndEnabled, importantOnlyEnabled]);

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
        if (!securePushAvailable) {
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
    }, [browserPermission, openNotificationItem, securePushAvailable]);

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

            const activeItems = newItems.filter(shouldActivelyNotify);

            if (activeItems.length > 0) {
                activeItems.forEach((item) => {
                    showInAppNotification(item);
                    showBrowserNotification(item);
                });
                triggerFallbackAttention(activeItems.length);
            }
            seenIdsRef.current = new Set([...seenIdsRef.current, ...nextIds]);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        } finally {
            if (!silent) {
                setFetching(false);
            }
        }
    }, [isAuthenticated, shouldActivelyNotify, showBrowserNotification, showInAppNotification, triggerFallbackAttention]);

    const handleRequestBrowserPermission = useCallback(async () => {
        if (!supportsBrowserNotifications()) {
            message.warning('Браузер не поддерживает системные push-уведомления.');
            return;
        }
        if (!supportsSecurePush()) {
            message.warning(
                'Для системных push-уведомлений нужен HTTPS. '
                + 'Сейчас работают уведомления внутри страницы, звук и вибрация.'
            );
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
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(
            SOUND_ENABLED_KEY,
            soundEnabled ? '1' : '0'
        );
    }, [soundEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(
            VIBRATION_ENABLED_KEY,
            vibrationEnabled ? '1' : '0'
        );
    }, [vibrationEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(
            DND_ENABLED_KEY,
            dndEnabled ? '1' : '0'
        );
    }, [dndEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(
            IMPORTANT_ONLY_KEY,
            importantOnlyEnabled ? '1' : '0'
        );
    }, [importantOnlyEnabled]);

    useEffect(() => {
        if (!isAuthenticated) {
            initializedRef.current = false;
            seenIdsRef.current = new Set();
            setItems([]);
            setUnreadCount(0);
            setDrawerOpen(false);
            stopTitleFlash();
            return undefined;
        }

        void fetchNotificationState();
        const intervalId = window.setInterval(() => {
            void fetchNotificationState({ silent: true });
        }, POLL_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                stopTitleFlash();
                void fetchNotificationState({ silent: true });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopTitleFlash();
        };
    }, [fetchNotificationState, isAuthenticated, stopTitleFlash]);

    useEffect(() => {
        if (drawerOpen) {
            stopTitleFlash();
        }
    }, [drawerOpen, stopTitleFlash]);

    useEffect(() => {
        if (dndEnabled) {
            stopTitleFlash();
        }
    }, [dndEnabled, stopTitleFlash]);

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
                        className={unreadCount ? 'notification-center-bell notification-center-bell-active' : 'notification-center-bell'}
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
                {!securePushAvailable ? (
                    <div className="notification-center-http-note">
                        Сайт открыт без HTTPS. Поэтому системные push браузера недоступны,
                        но сообщения внутри страницы, звук, вибрация и мигающий заголовок уже работают.
                    </div>
                ) : null}
                <div className="notification-center-settings">
                    <Space wrap size={[12, 8]}>
                        <Space size={6}>
                            <Typography.Text type="secondary">
                                Не беспокоить
                            </Typography.Text>
                            <Switch
                                size="small"
                                checked={dndEnabled}
                                onChange={setDndEnabled}
                            />
                        </Space>
                        <Space size={6}>
                            <Typography.Text type="secondary">
                                Только важные
                            </Typography.Text>
                            <Switch
                                size="small"
                                checked={importantOnlyEnabled}
                                onChange={setImportantOnlyEnabled}
                            />
                        </Space>
                        <Space size={6}>
                            <Typography.Text type="secondary">
                                Звук
                            </Typography.Text>
                            <Switch
                                size="small"
                                checked={soundEnabled}
                                onChange={setSoundEnabled}
                                disabled={dndEnabled}
                            />
                        </Space>
                        <Space size={6}>
                            <Typography.Text type="secondary">
                                Вибрация
                            </Typography.Text>
                            <Switch
                                size="small"
                                checked={vibrationEnabled}
                                onChange={setVibrationEnabled}
                                disabled={
                                    dndEnabled
                                    || (
                                        typeof window !== 'undefined'
                                        && typeof window.navigator !== 'undefined'
                                        && typeof window.navigator.vibrate !== 'function'
                                    )
                                }
                            />
                        </Space>
                    </Space>
                </div>
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
