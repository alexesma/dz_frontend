import api from '../api.js';

// ---------------------------------------------------------------------------
// Письма
// ---------------------------------------------------------------------------

/**
 * Список входящих писем.
 * @param {Object} params
 * @param {number|null} params.email_account_id
 * @param {number} params.days  1..7
 * @param {number} params.page
 * @param {number} params.page_size
 * @param {boolean} params.only_unprocessed
 */
export const getInboxEmails = (params = {}) =>
    api.get('/inbox/emails', { params });

/**
 * Детали одного письма.
 */
export const getInboxEmailDetail = (emailId) =>
    api.get(`/inbox/emails/${emailId}`);

/**
 * Принудительно загрузить письма с почтового сервера.
 * @param {Object} data
 * @param {number|null} data.email_account_id  null = все ящики
 * @param {number} data.days  1..7
 */
export const fetchInboxEmails = (data) =>
    api.post('/inbox/emails/fetch', data);

/**
 * Назначить правило письму.
 * @param {number} emailId
 * @param {Object} data
 * @param {string} data.rule_type  'price_list' | 'order_reply' | 'ignore'
 * @param {boolean} data.save_pattern
 */
export const assignRule = (emailId, data) =>
    api.post(`/inbox/emails/${emailId}/rule`, data);

// ---------------------------------------------------------------------------
// Мастер настройки
// ---------------------------------------------------------------------------

/**
 * Получить списки поставщиков и клиентов для выпадающих списков в мастере.
 * @returns {{ providers: [{id, name, email}], customers: [{id, name}] }}
 */
export const getSetupOptions = () =>
    api.get('/inbox/setup-options');

/**
 * Мастер настройки: назначить правило + привязать к конфигам системы.
 * @param {number} emailId
 * @param {Object} data
 * @param {string} data.rule_type
 * @param {boolean} data.save_pattern
 * @param {Object|null} data.provider_config  { provider_id, subject_pattern, filename_pattern }
 * @param {Object|null} data.customer_config  { customer_id, subject_pattern, filename_pattern }
 */
export const setupEmailRule = (emailId, data) =>
    api.post(`/inbox/emails/${emailId}/setup`, data);

// ---------------------------------------------------------------------------
// Паттерны правил
// ---------------------------------------------------------------------------

/**
 * Список паттернов авто-разметки.
 */
export const getRulePatterns = (params = {}) =>
    api.get('/inbox/rule-patterns', { params });

/**
 * Создать паттерн вручную.
 */
export const createRulePattern = (data) =>
    api.post('/inbox/rule-patterns', data);

/**
 * Обновить паттерн.
 */
export const updateRulePattern = (patternId, data) =>
    api.patch(`/inbox/rule-patterns/${patternId}`, data);

/**
 * Удалить паттерн (только admin).
 */
export const deleteRulePattern = (patternId) =>
    api.delete(`/inbox/rule-patterns/${patternId}`);
