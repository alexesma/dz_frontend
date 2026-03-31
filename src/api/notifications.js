import api from '../api';

export const getNotifications = async ({ unreadOnly = false, limit = 50 } = {}) => {
    const { data } = await api.get('/notifications', {
        params: {
            unread_only: unreadOnly,
            limit,
        },
    });
    return data;
};

export const markNotificationRead = async (notificationId) => {
    const { data } = await api.post(`/notifications/${notificationId}/read`);
    return data;
};

export const markAllNotificationsRead = async () => {
    const { data } = await api.post('/notifications/read-all');
    return data;
};
