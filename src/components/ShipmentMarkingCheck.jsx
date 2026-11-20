import React, { useState } from 'react';
import {
    Alert, Button, Space, Typography, message,
} from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { checkDiadocShipmentMarking } from '../api/diadoc';

const { Text } = Typography;
const gisStatus = {
    no_codes: 'В отгрузке отсутствуют назначенные коды.',
    verified: 'ГИС МТ подтвердил статус и владельца каждого кода.',
    rejected: 'ГИС МТ не подтвердил статус или владельца одного или нескольких кодов.',
    deferred: 'Проверка ГИС МТ отложена. Отправка УПД заблокирована.',
};

// Проверка кодов маркировки отгрузки перед отправкой УПД клиенту.
const ShipmentMarkingCheck = ({ shipmentId }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const run = async () => {
        setResult(null);
        setLoading(true);
        try {
            const { data } = await checkDiadocShipmentMarking(shipmentId);
            setResult(data);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось проверить КИЗ');
        } finally {
            setLoading(false);
        }
    };

    const type = result
        ? ({ error: 'error', warning: 'warning' }[result.status] || 'success')
        : 'info';

    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
                <Button icon={<SafetyCertificateOutlined />} loading={loading} onClick={run}>
                    Проверить КИЗ
                </Button>
                <Text type="secondary">
                    Перед подписью и отправкой УПД проверяются сканы, статус кодов и ИНН владельца в ГИС МТ.
                </Text>
            </Space>
            {result && (result.status === 'none' ? (
                <Alert type="info" showIcon message="В отгрузке нет маркированных товаров" />
            ) : (
                <Alert
                    type={type}
                    showIcon
                    message={
                        result.issues.length
                            ? `Кодов: ${result.codes_total}, замечаний: ${result.issues.length}`
                            : `Кодов: ${result.codes_total}, расхождений нет`
                    }
                    description={(
                        <Space direction="vertical" size={4}>
                            <Text type="secondary">
                                {gisStatus[result.gis_state] || (result.gis_checked ? 'Получен ответ ГИС МТ.' : 'Сверка с ГИС МТ не выполнена.')}
                            </Text>
                            {result.issues.length > 0 && (
                                <ul style={{ paddingLeft: 18, margin: 0 }}>
                                    {result.issues.map((issue, i) => (
                                        <li key={`${issue.reason}-${issue.code || ''}-${i}`}>
                                            {issue.message}
                                            {issue.code && <Text code copyable style={{ marginLeft: 6 }}>{issue.code}</Text>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Space>
                    )}
                />
            ))}
        </Space>
    );
};

export default ShipmentMarkingCheck;
