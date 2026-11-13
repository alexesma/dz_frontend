import React, { useEffect, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';

import { getGisMtStatus } from '../api/marking';

const fmtTime = (value) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// Индикатор входа в ГИС МТ: без действующего токена коды маркировки
// не сверяются с Честным знаком.
const GisMtTokenTag = () => {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const { data } = await getGisMtStatus();
                if (!cancelled) setStatus(data);
            } catch {
                if (!cancelled) setStatus(null);
            }
        };
        void load();
        const timer = window.setInterval(load, 5 * 60 * 1000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, []);

    if (!status) return null;
    const pending = (status.pending_receipts || 0) + (status.pending_shipments || 0);
    const hint = status.token_active
        ? `Вход в ГИС МТ действует до ${fmtTime(status.token_expires_at)}. Коды сверяются с Честным знаком.`
        : `Вход в ГИС МТ не выполнен: статус и владелец кодов не проверяются.${
            pending ? ` Документов с кодами в работе: ${pending}.` : ''} Нажмите, чтобы войти.`;
    return (
        <Tooltip title={hint}>
            <Link to="/warehouse/marking">
                <Tag color={status.token_active ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
                    {status.token_active ? `ГИС МТ до ${fmtTime(status.token_expires_at)}` : 'ГИС МТ: нужен вход'}
                </Tag>
            </Link>
        </Tooltip>
    );
};

export default GisMtTokenTag;
