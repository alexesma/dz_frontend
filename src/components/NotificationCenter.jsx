import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Descriptions,
    Drawer,
    Empty,
    Grid,
    Input,
    List,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    Upload,
    message,
    notification,
} from 'antd';
import {
    BellOutlined,
    CheckOutlined,
    CloseOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    NotificationOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import {
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '../api/notifications';
import {
    confirmReclamationShortage,
    postponeReclamationShortage,
    uploadReclamationShortageEvidence,
} from '../api/reclamations';
import {
    approveProviderPricelistReview,
    downloadProviderPricelistReview,
    rejectProviderPricelistReview,
} from '../api/providers';

const POLL_INTERVAL_MS = 30000;
const MAX_NOTIFICATIONS = 50;
const SOUND_ENABLED_KEY = 'notification_center_sound_enabled_v1';
const VIBRATION_ENABLED_KEY = 'notification_center_vibration_enabled_v1';
const DND_ENABLED_KEY = 'notification_center_dnd_enabled_v1';
const IMPORTANT_ONLY_KEY = 'notification_center_important_only_v1';
const WATCHLIST_ONLY_KEY = 'notification_center_watchlist_only_v1';

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

const WATCHLIST_PRICE_PREFIX = 'Подходящая цена:';
const PRICELIST_BLOCKED_PREFIX = 'Прайс заблокирован:';
const SHORTAGE_NOTIFICATION_TYPE = 'reclamation_shortage';

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

const isWatchlistPriceNotification = (item) => (
    Boolean(item)
    && item.link === '/watchlist'
    && String(item.title || '').startsWith(WATCHLIST_PRICE_PREFIX)
);

const isBlockedPricelistNotification = (item) => (
    Boolean(item)
    && item.level === 'error'
    && String(item.title || '').startsWith(PRICELIST_BLOCKED_PREFIX)
);

const getBlockedPricelistReference = (item) => {
    const payload = item?.payload || {};
    const payloadProviderId = Number(payload.provider_id);
    const payloadReviewId = Number(payload.review_id);
    if (payloadProviderId > 0 && payloadReviewId > 0) {
        return {
            providerId: payloadProviderId,
            reviewId: payloadReviewId,
        };
    }
    const match = String(item?.link || '').match(
        /\/providers\/(\d+)\/edit\?pricelist_review=(\d+)/
    );
    return match
        ? { providerId: Number(match[1]), reviewId: Number(match[2]) }
        : null;
};

const getBlockedPricelistGroupKey = (item) => (
    item?.payload?.provider_config_id
        ? `config:${item.payload.provider_config_id}`
        : String(item?.title || '')
);

const getNotificationPriority = (item) => {
    if (isWatchlistPriceNotification(item)) {
        return 2;
    }
    if (item?.level === 'error' || item?.level === 'warning') {
        return 1;
    }
    return 0;
};

const compareNotifications = (left, right) => {
    const priorityDiff = getNotificationPriority(right) - getNotificationPriority(left);
    if (priorityDiff !== 0) {
        return priorityDiff;
    }
    const unreadDiff = Number(!right?.read_at) - Number(!left?.read_at);
    if (unreadDiff !== 0) {
        return unreadDiff;
    }
    const createdDiff = dayjs(right?.created_at).valueOf() - dayjs(left?.created_at).valueOf();
    if (createdDiff !== 0) {
        return createdDiff;
    }
    return Number(right?.id || 0) - Number(left?.id || 0);
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
    const [watchlistOnlyEnabled, setWatchlistOnlyEnabled] = useState(() => loadBooleanPreference(WATCHLIST_ONLY_KEY, false));
    const [shortageComment, setShortageComment] = useState('');
    const [shortageEvidence, setShortageEvidence] = useState([]);
    const [shortagePostponeMinutes, setShortagePostponeMinutes] = useState(15);
    const [shortageActionLoading, setShortageActionLoading] = useState(false);
    const [blockedActionLoading, setBlockedActionLoading] = useState(false);
    const [blockedDownloadLoading, setBlockedDownloadLoading] = useState(false);
    const [blockedRejectOpen, setBlockedRejectOpen] = useState(false);
    const [blockedRejectReason, setBlockedRejectReason] = useState('');
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
            message: (
                <Space wrap size={8}>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    {isWatchlistPriceNotification(item) && (
                        <Tag color="magenta">Подходящая цена</Tag>
                    )}
                </Space>
            ),
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
                .sort(compareNotifications);

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
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(
            WATCHLIST_ONLY_KEY,
            watchlistOnlyEnabled ? '1' : '0'
        );
    }, [watchlistOnlyEnabled]);

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
    const sortedItems = useMemo(() => [...items].sort(compareNotifications), [items]);
    const filteredItems = useMemo(
        () => (
            watchlistOnlyEnabled
                ? sortedItems.filter(isWatchlistPriceNotification)
                : sortedItems
        ),
        [sortedItems, watchlistOnlyEnabled]
    );
    const blockedPricelistItems = useMemo(() => {
        const groups = new Set();
        return sortedItems.filter((item) => {
            if (item.read_at || !isBlockedPricelistNotification(item)) {
                return false;
            }
            const groupKey = getBlockedPricelistGroupKey(item);
            if (groups.has(groupKey)) {
                return false;
            }
            groups.add(groupKey);
            return true;
        });
    }, [sortedItems]);
    const blockedPricelistItem = blockedPricelistItems[0] || null;
    const blockedPricelistPayload = blockedPricelistItem?.payload || {};
    const blockedPricelistReference = useMemo(
        () => getBlockedPricelistReference(blockedPricelistItem),
        [blockedPricelistItem]
    );
    const shortageNotificationItem = useMemo(
        () => sortedItems.find(
            (item) => (
                !item.read_at
                && item.payload?.notification_type
                    === SHORTAGE_NOTIFICATION_TYPE
            )
        ) || null,
        [sortedItems]
    );
    const shortagePayload = shortageNotificationItem?.payload || {};
    const shortagePositions = Array.isArray(shortagePayload.items)
        ? shortagePayload.items
        : [];

    useEffect(() => {
        setShortageComment('');
        setShortageEvidence([]);
        setShortagePostponeMinutes(15);
    }, [shortageNotificationItem?.id]);

    useEffect(() => {
        setBlockedRejectOpen(false);
        setBlockedRejectReason('');
    }, [blockedPricelistItem?.id]);

    const finishShortageNotification = useCallback(async () => {
        if (!shortageNotificationItem) {
            return;
        }
        const result = await markNotificationRead(
            shortageNotificationItem.id
        );
        updateReadState(shortageNotificationItem.id, result.read_at);
    }, [shortageNotificationItem, updateReadState]);

    const handleShortageDecision = useCallback(async (confirmed) => {
        const reclamationId = shortagePayload.reclamation_id;
        if (!reclamationId || !shortageNotificationItem) {
            return;
        }
        setShortageActionLoading(true);
        try {
            if (!confirmed && shortageEvidence.length) {
                await uploadReclamationShortageEvidence(
                    reclamationId,
                    shortageEvidence
                );
            }
            await confirmReclamationShortage(reclamationId, {
                confirmed,
                comment: shortageComment.trim() || null,
            });
            await finishShortageNotification();
            message.success(
                confirmed
                    ? 'Недовоз подтверждён'
                    : 'Зафиксировано: недовоз не подтверждён'
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить решение по недовозу'
            );
        } finally {
            setShortageActionLoading(false);
        }
    }, [
        finishShortageNotification,
        shortageComment,
        shortageEvidence,
        shortageNotificationItem,
        shortagePayload.reclamation_id,
    ]);

    const handlePostponeShortage = useCallback(async () => {
        const reclamationId = shortagePayload.reclamation_id;
        if (!reclamationId || !shortageNotificationItem) {
            return;
        }
        setShortageActionLoading(true);
        try {
            await postponeReclamationShortage(reclamationId, {
                minutes: shortagePostponeMinutes,
            });
            await finishShortageNotification();
            message.success(
                `Напоминание появится через ${shortagePostponeMinutes} мин.`
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось отложить проверку'
            );
        } finally {
            setShortageActionLoading(false);
        }
    }, [
        finishShortageNotification,
        shortageNotificationItem,
        shortagePayload.reclamation_id,
        shortagePostponeMinutes,
    ]);

    const finishBlockedPricelistAction = useCallback(async () => {
        if (!blockedPricelistItem) return;
        try {
            const result = await markNotificationRead(blockedPricelistItem.id);
            updateReadState(blockedPricelistItem.id, result.read_at);
        } catch (err) {
            // Endpoint решения уже закрывает уведомления на сервере. Если
            // локальная отметка не удалась, следующий poll синхронизирует UI.
            console.debug('Pricelist notification was already closed', err);
        }
        await fetchNotificationState({ silent: true });
    }, [
        blockedPricelistItem,
        fetchNotificationState,
        updateReadState,
    ]);

    const handleApproveBlockedPricelist = useCallback(async () => {
        if (!blockedPricelistReference) return;
        setBlockedActionLoading(true);
        try {
            await approveProviderPricelistReview(
                blockedPricelistReference.providerId,
                blockedPricelistReference.reviewId,
                'Проверено и принято из центрального уведомления'
            );
            message.success(
                'Прайс поставлен в очередь публикации. Можно продолжать работу'
            );
            await finishBlockedPricelistAction();
        } catch (err) {
            message.error(
                err?.response?.data?.detail
                || 'Не удалось принять и опубликовать прайс'
            );
        } finally {
            setBlockedActionLoading(false);
        }
    }, [blockedPricelistReference, finishBlockedPricelistAction]);

    const handleRejectBlockedPricelist = useCallback(async () => {
        const reason = blockedRejectReason.trim();
        if (!blockedPricelistReference || reason.length < 3) {
            message.warning('Укажите причину отклонения');
            return;
        }
        setBlockedActionLoading(true);
        try {
            await rejectProviderPricelistReview(
                blockedPricelistReference.providerId,
                blockedPricelistReference.reviewId,
                reason
            );
            setBlockedRejectOpen(false);
            setBlockedRejectReason('');
            message.success('Прайс отклонён, действующий прайс не изменён');
            await finishBlockedPricelistAction();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось отклонить прайс'
            );
        } finally {
            setBlockedActionLoading(false);
        }
    }, [
        blockedPricelistReference,
        blockedRejectReason,
        finishBlockedPricelistAction,
    ]);

    const handleDownloadBlockedPricelist = useCallback(async () => {
        if (!blockedPricelistReference) return;
        setBlockedDownloadLoading(true);
        try {
            const { data } = await downloadProviderPricelistReview(
                blockedPricelistReference.providerId,
                blockedPricelistReference.reviewId
            );
            const objectUrl = URL.createObjectURL(data);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = blockedPricelistPayload.source_filename
                || 'pricelist';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            message.success('Файл скачан без публикации');
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось скачать прайс'
            );
        } finally {
            setBlockedDownloadLoading(false);
        }
    }, [blockedPricelistPayload.source_filename, blockedPricelistReference]);

    if (!isAuthenticated) {
        return null;
    }

    return (
        <>
            {contextHolder}
            <Modal
                open={Boolean(blockedPricelistItem) && !blockedRejectOpen}
                centered
                width={920}
                closable={false}
                maskClosable={false}
                keyboard={false}
                title={`Проверка обновления прайса${
                    blockedPricelistItems.length > 1
                        ? ` · в очереди ${blockedPricelistItems.length}`
                        : ''
                }`}
                footer={(
                    <Space wrap>
                        <Button
                            icon={<DownloadOutlined />}
                            loading={blockedDownloadLoading}
                            disabled={!blockedPricelistReference}
                            onClick={() => void handleDownloadBlockedPricelist()}
                        >
                            Скачать и проверить
                        </Button>
                        <Button
                            danger
                            icon={<CloseOutlined />}
                            disabled={!blockedPricelistReference}
                            onClick={() => setBlockedRejectOpen(true)}
                        >
                            Отклонить
                        </Button>
                        <Popconfirm
                            title="Принять и опубликовать этот файл?"
                            description="Он станет новым действующим прайсом и базой следующего сравнения."
                            okText="Принять"
                            cancelText="Отмена"
                            onConfirm={handleApproveBlockedPricelist}
                        >
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                loading={blockedActionLoading}
                                disabled={!blockedPricelistReference}
                            >
                                Принять и опубликовать
                            </Button>
                        </Popconfirm>
                    </Space>
                )}
            >
                <Typography.Title level={5}>
                    {blockedPricelistItem?.title}
                </Typography.Title>
                <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>
                    {blockedPricelistItem?.message}
                </Typography.Paragraph>
                {(blockedPricelistPayload.examples || []).length > 0 && (
                    <Table
                        style={{ marginTop: 16 }}
                        size="small"
                        rowKey={(row) => `${row.brand}-${row.oem_number}`}
                        pagination={false}
                        dataSource={(blockedPricelistPayload.examples || []).slice(0, 10)}
                        scroll={{ x: 700 }}
                        columns={[
                            {
                                title: 'Бренд',
                                dataIndex: 'brand',
                                width: 130,
                            },
                            {
                                title: 'Артикул / наименование',
                                key: 'position',
                                render: (_, row) => (
                                    <div>
                                        <Typography.Text strong>
                                            {row.oem_number}
                                        </Typography.Text>
                                        <div>{row.name || '—'}</div>
                                    </div>
                                ),
                            },
                            {
                                title: 'Кол-во',
                                dataIndex: 'quantity',
                                width: 85,
                            },
                            {
                                title: 'Цена',
                                dataIndex: 'price',
                                width: 110,
                            },
                            {
                                title: 'Изменение',
                                dataIndex: 'price_change_percent',
                                width: 110,
                                render: (value) => (
                                    value == null ? 'Новая' : `${value > 0 ? '+' : ''}${value}%`
                                ),
                            },
                        ]}
                    />
                )}
                <Alert
                    style={{ marginTop: 16 }}
                    type="warning"
                    showIcon
                    message="Сначала примите или отклоните этот файл"
                    description="Следующий прайс из очереди появится только после сохранения решения. Действующий прайс до принятия не меняется."
                />
            </Modal>
            <Modal
                open={Boolean(blockedPricelistItem) && blockedRejectOpen}
                centered
                title="Отклонить обновление прайса"
                okText="Отклонить"
                okButtonProps={{
                    danger: true,
                    loading: blockedActionLoading,
                    disabled: blockedRejectReason.trim().length < 3,
                }}
                cancelText="Вернуться"
                onOk={() => void handleRejectBlockedPricelist()}
                onCancel={() => setBlockedRejectOpen(false)}
            >
                <Typography.Paragraph>
                    Укажите причину. Она сохранится в истории проверки.
                </Typography.Paragraph>
                <Input.TextArea
                    rows={4}
                    maxLength={4000}
                    value={blockedRejectReason}
                    placeholder="Например: поставщик прислал неполный файл"
                    onChange={(event) => setBlockedRejectReason(event.target.value)}
                />
            </Modal>
            <Modal
                open={Boolean(
                    shortageNotificationItem && !blockedPricelistItem
                )}
                centered
                width={920}
                closable={false}
                maskClosable={false}
                keyboard={false}
                title={`Проверка недовоза · рекламация #${
                    shortagePayload.reclamation_id || ''
                }`}
                footer={null}
            >
                <Space
                    direction="vertical"
                    size="middle"
                    style={{ width: '100%' }}
                >
                    <Alert
                        type="warning"
                        showIcon
                        message="Нужно проверить фактическую комплектацию отгрузки"
                        description="Подтвердите недовоз, опровергните его или отложите вопрос. Фото и видео при опровержении желательны, но не обязательны."
                    />
                    <Descriptions
                        size="small"
                        bordered
                        column={screens.md ? 4 : 1}
                    >
                        <Descriptions.Item label="Клиент">
                            {shortagePayload.customer_name || 'не определён'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Документ">
                            {shortagePayload.document_number || '—'}
                            {shortagePayload.document_date
                                ? ` от ${dayjs(
                                    shortagePayload.document_date
                                ).format('DD.MM.YYYY')}`
                                : ''}
                        </Descriptions.Item>
                        <Descriptions.Item label="Причина">
                            {shortagePayload.reason || 'Недовоз'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Позиций">
                            {shortagePayload.positions_count
                                || shortagePositions.length}
                        </Descriptions.Item>
                    </Descriptions>
                    <Table
                        rowKey="item_id"
                        size="small"
                        pagination={false}
                        scroll={{ x: 760 }}
                        dataSource={shortagePositions}
                        columns={[
                            {
                                title: 'Заказ',
                                key: 'order',
                                width: 125,
                                render: (_, row) => (
                                    <Space direction="vertical" size={0}>
                                        <Typography.Text>
                                            {row.order_date
                                                ? dayjs(row.order_date).format(
                                                    'DD.MM.YYYY'
                                                )
                                                : 'дата не найдена'}
                                        </Typography.Text>
                                        {row.order_number ? (
                                            <Typography.Text
                                                type="secondary"
                                            >
                                                № {row.order_number}
                                            </Typography.Text>
                                        ) : null}
                                    </Space>
                                ),
                            },
                            {
                                title: 'Позиция',
                                key: 'position',
                                render: (_, row) => (
                                    <Space direction="vertical" size={0}>
                                        <Typography.Text strong>
                                            {[row.brand_name, row.oem_number]
                                                .filter(Boolean)
                                                .join(' ') || '—'}
                                        </Typography.Text>
                                        <Typography.Text type="secondary">
                                            {row.autopart_name || '—'}
                                        </Typography.Text>
                                    </Space>
                                ),
                            },
                            {
                                title: 'Кол-во',
                                dataIndex: 'quantity',
                                width: 75,
                                render: (value) => `${value || 0} шт.`,
                            },
                            {
                                title: 'Поставщик',
                                key: 'supplier',
                                width: 190,
                                render: (_, row) => (
                                    row.supplier_name
                                    || (row.supplier_names || []).join(', ')
                                    || (
                                        <Typography.Text type="secondary">
                                            не определён
                                        </Typography.Text>
                                    )
                                ),
                            },
                        ]}
                    />
                    <Input.TextArea
                        rows={2}
                        value={shortageComment}
                        onChange={(event) => setShortageComment(
                            event.target.value
                        )}
                        placeholder="Комментарий проверяющего (необязательно)"
                    />
                    <Upload
                        accept="image/*,video/*"
                        multiple
                        maxCount={5}
                        beforeUpload={() => false}
                        fileList={shortageEvidence}
                        onChange={({ fileList }) => setShortageEvidence(
                            fileList
                        )}
                    >
                        <Button icon={<UploadOutlined />}>
                            Фото или видео отгрузки
                        </Button>
                    </Upload>
                    <Space wrap style={{ justifyContent: 'space-between' }}>
                        <Space wrap>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                loading={shortageActionLoading}
                                onClick={() => {
                                    void handleShortageDecision(true);
                                }}
                            >
                                Подтвердить недовоз
                            </Button>
                            <Button
                                danger
                                loading={shortageActionLoading}
                                onClick={() => {
                                    void handleShortageDecision(false);
                                }}
                            >
                                Не подтвердить
                            </Button>
                        </Space>
                        <Space.Compact>
                            <Select
                                value={shortagePostponeMinutes}
                                style={{ width: 125 }}
                                options={[
                                    { value: 15, label: 'На 15 минут' },
                                    { value: 30, label: 'На 30 минут' },
                                    { value: 60, label: 'На 1 час' },
                                ]}
                                onChange={setShortagePostponeMinutes}
                            />
                            <Button
                                icon={<ClockCircleOutlined />}
                                loading={shortageActionLoading}
                                onClick={() => {
                                    void handlePostponeShortage();
                                }}
                            >
                                Отложить
                            </Button>
                        </Space.Compact>
                    </Space>
                    <Button
                        type="link"
                        style={{ alignSelf: 'flex-start', padding: 0 }}
                        onClick={() => {
                            if (shortageNotificationItem) {
                                void openNotificationItem(
                                    shortageNotificationItem
                                );
                            }
                        }}
                    >
                        Открыть полную рекламацию
                    </Button>
                </Space>
            </Modal>
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
                                Только подходящая цена
                            </Typography.Text>
                            <Switch
                                size="small"
                                checked={watchlistOnlyEnabled}
                                onChange={setWatchlistOnlyEnabled}
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
                    dataSource={filteredItems}
                    locale={{
                        emptyText: <Empty description="Пока сообщений нет" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                    }}
                    className="notification-center-list"
                    renderItem={(item) => {
                        const isUnread = !item.read_at;
                        return (
                            <List.Item
                                className={[
                                    'notification-center-item',
                                    isUnread ? 'notification-center-item-unread' : '',
                                    isWatchlistPriceNotification(item)
                                        ? 'notification-center-item-priority'
                                        : '',
                                ].filter(Boolean).join(' ')}
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
                                            {isWatchlistPriceNotification(item) && (
                                                <Tag color="magenta">Подходящая цена</Tag>
                                            )}
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
