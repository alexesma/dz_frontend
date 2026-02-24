export const formatMoscow = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
    });
};
