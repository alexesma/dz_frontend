/** Хелперы и хук для статей не торговых операций. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import api from '../api';

export const KIND_LABELS = { expense: 'Расходы', income: 'Доходы', transfer: 'Перемещения' };

export const categorizeTransaction = (stmtId, txnId, data) =>
    api.post(`/finance/bank-statements/${stmtId}/transactions/${txnId}/categorize`, data);

export const useBankCategories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/finance/bank-categories');
            setCategories(res.data || []);
        } catch {
            message.error('Не удалось загрузить статьи');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const byCode = useMemo(
        () => Object.fromEntries(categories.map((c) => [c.code, c])),
        [categories],
    );
    return { categories, byCode, reload, loading };
};

export const rememberDefault = (txn) => {
    if (txn?.counterparty_inn) return 'inn';
    if (txn?.counterparty_name) return 'name';
    return null;
};

export const initialCategorize = (txn) => ({
    code: txn?.category || undefined,
    remember: rememberDefault(txn),
});

/** Результат categorize в человеческое сообщение. */
export const categorizeMessage = (data) => {
    const also = data?.also_updated || 0;
    return also > 0 ? `Готово. Ещё операций контрагента: ${also}` : 'Статья назначена';
};

