import React from 'react';
import { Tag, Tooltip } from 'antd';

export const MARKING_STATUS_META = {
    error: { color: 'red', label: 'КИЗ: расхождения' },
    warning: { color: 'orange', label: 'КИЗ: замечания' },
    ok: { color: 'green', label: 'КИЗ сверены' },
    unchecked: { color: 'default', label: 'КИЗ не проверены' },
};

// Метка «N КИЗ» под количеством в строке документа.
export const markingItemBadge = (row) => {
    const count = (row.marking_codes || []).length;
    if (!count) return null;
    const meta = MARKING_STATUS_META[row.marking_check?.status] || MARKING_STATUS_META.unchecked;
    return (
        <Tooltip title={meta.label}>
            <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{count} КИЗ</Tag>
        </Tooltip>
    );
};
