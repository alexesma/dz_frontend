import React, { useState } from 'react';
import {
    Alert, Button, Collapse, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { checkSupplierReceiptMarking } from '../api/customerOrders';
import { MARKING_STATUS_META } from './receiptMarkingUtils';

const { Text } = Typography;

// Бейдж для списка документов; для документов без кодов ничего не рисуем.
export const ReceiptMarkingBadge = ({ receipt }) => {
    const meta = MARKING_STATUS_META[receipt?.marking_status];
    if (!meta) return null;
    const errors = receipt.marking_error_count || 0;
    const warnings = receipt.marking_warning_count || 0;
    const gis = receipt.marking_gis_checked
        ? 'Сверено с ГИС МТ.' : 'ГИС МТ не проверялся (нужен вход в ГИС МТ).';
    return (
        <Tooltip title={`Ошибок: ${errors}, замечаний: ${warnings}. ${gis}`}>
            <Tag color={meta.color}>{meta.label}{errors ? ` (${errors})` : ''}</Tag>
        </Tooltip>
    );
};

const REASON_TITLES = {
    quantity_mismatch: 'Количество кодов',
    duplicate_in_item: 'Дубль в строке',
    duplicate_in_document: 'Дубль в документе',
    invalid_format: 'Не код маркировки',
    already_in_registry: 'Уже в учёте',
    gtin_mismatch: 'GTIN другого товара',
    gis_not_found: 'Нет в ГИС МТ',
    gis_status: 'Статус в ГИС МТ',
    gis_owner: 'Чужой владелец',
    gis_gtin: 'GTIN не совпал',
    gis_unavailable: 'ГИС МТ недоступен',
    supplier_inn_missing: 'Нет ИНН поставщика',
};

const ReceiptMarkingPanel = ({ receipt, onChanged }) => {
    const [loading, setLoading] = useState(false);
    if (!receipt || receipt.marking_status === 'none') return null;

    const rows = [];
    (receipt.items || []).forEach((item, index) => {
        (item.marking_check?.issues || []).forEach((issue, i) => {
            rows.push({
                key: `${item.id}-${i}`,
                line: index + 1,
                oem: item.oem_number,
                ...issue,
            });
        });
    });
    const errors = receipt.marking_error_count || 0;
    const warnings = receipt.marking_warning_count || 0;
    const type = errors ? 'error' : (warnings ? 'warning' : 'success');

    const recheck = async () => {
        setLoading(true);
        try {
            const { data } = await checkSupplierReceiptMarking(receipt.id);
            message.success(
                data.marking_gis_checked
                    ? 'КИЗ сверены с ГИС МТ'
                    : 'Локальная проверка выполнена. Для сверки с ГИС МТ войдите в ГИС МТ (страница маркировки)',
            );
            if (onChanged) onChanged(data);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось проверить КИЗ');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'Стр.', dataIndex: 'line', width: 55 },
        { title: 'Артикул', dataIndex: 'oem', width: 120, render: (v) => v || '—' },
        {
            title: 'Проблема', dataIndex: 'reason', width: 170,
            render: (v, row) => (
                <Tag color={row.severity === 'error' ? 'red' : 'orange'}>
                    {REASON_TITLES[v] || v}
                </Tag>
            ),
        },
        {
            title: 'Код', dataIndex: 'code', width: 300,
            render: (v) => (v ? <Text code copyable>{v}</Text> : '—'),
        },
        { title: 'Описание', dataIndex: 'message' },
    ];

    return (
        <Alert
            style={{ marginBottom: 12 }}
            type={type}
            showIcon
            message={
                errors || warnings
                    ? `Сверка КИЗ: расхождений ${errors}, замечаний ${warnings}. Проведение не заблокировано — решение за вами.`
                    : 'Сверка КИЗ: расхождений не найдено.'
            }
            description={
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">
                        {receipt.marking_gis_checked
                            ? 'Коды сверены с ГИС МТ (статус, владелец, GTIN).'
                            : 'Сверка с ГИС МТ не выполнялась — выполнен только локальный контроль (количество, дубли, учёт, GTIN).'}
                    </Text>
                    {rows.length > 0 && (
                        <Collapse
                            size="small"
                            defaultActiveKey={errors ? ['issues'] : []}
                            items={[{
                                key: 'issues',
                                label: `Список расхождений (${rows.length})`,
                                children: (
                                    <Table
                                        size="small"
                                        rowKey="key"
                                        dataSource={rows}
                                        columns={columns}
                                        pagination={rows.length > 20 ? { pageSize: 20 } : false}
                                    />
                                ),
                            }]}
                        />
                    )}
                    <Button
                        size="small"
                        icon={<SafetyCertificateOutlined />}
                        loading={loading}
                        onClick={recheck}
                    >
                        Перепроверить (ГИС МТ)
                    </Button>
                </Space>
            }
        />
    );
};

export default ReceiptMarkingPanel;
