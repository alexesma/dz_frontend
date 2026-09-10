import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Input,
    message,
    Modal,
    Row,
    Statistic,
    Table,
    Tag,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
    getPartsSoftCustomerCandidates,
    linkPartsSoftCustomer,
    reconcilePartsSoftOrders,
} from '../api/customerOrders';

const { Paragraph, Text } = Typography;

const STATUS = {
    existing_external: { label: 'Уже связан', color: 'green' },
    existing_site_order: { label: 'Заказ с нашего сайта', color: 'green' },
    partial_site_match: { label: 'Частичное совпадение', color: 'orange' },
    order_conflict: { label: 'Конфликт заказов', color: 'red' },
    probable_duplicate: { label: 'Вероятный дубль заказа', color: 'orange' },
    customer_conflict: { label: 'Конфликт клиента', color: 'red' },
    customer_unmatched: { label: 'Клиент не связан', color: 'default' },
    new_order: { label: 'Новый заказ', color: 'blue' },
};

const MATCH_BASIS_LABELS = {
    external_order_id: 'тот же ID заказа сайта',
    tracking_uuid: 'точное совпадение по tracking ID',
    partial_tracking_uuid: 'часть позиций совпала по tracking ID',
    tracking_uuid_multiple_orders: 'позиции найдены в разных заказах',
    customer_order_number: 'тот же клиент и номер заказа',
    customer_date_items: 'тот же клиент, дата и состав заказа',
    external_id: 'постоянная связь клиента',
    inn_kpp: 'ИНН и КПП',
    inn: 'ИНН',
    email: 'email',
    phone: 'телефон',
    name: 'название',
    none: 'совпадений нет',
};

const formatMatchBasis = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    return values
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => MATCH_BASIS_LABELS[item] || item)
        .join(', ') || '—';
};

const PartsSoftOrderReconciliation = () => {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [errorText, setErrorText] = useState('');
    const [linkRow, setLinkRow] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [linkLoading, setLinkLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);

    const runReconciliation = async () => {
        setLoading(true);
        setErrorText('');
        try {
            const response = await reconcilePartsSoftOrders();
            setReport(response.data);
            message.success('Сверка заказов сайта завершена');
        } catch (error) {
            const detail = error?.response?.data?.detail;
            const text = typeof detail === 'string'
                ? detail
                : 'Не удалось выполнить сверку заказов сайта';
            setErrorText(text);
            message.error(text);
        } finally {
            setLoading(false);
        }
    };

    const loadCandidates = async (row, search = '') => {
        setCandidateLoading(true);
        try {
            const response = await getPartsSoftCustomerCandidates({
                name: row.customer_name || '',
                inn: row.customer_inn || '',
                kpp: row.customer_kpp || '',
                email: row.customer_email || '',
                search,
            });
            setCandidates(response.data || []);
        } catch {
            message.error('Не удалось найти клиентов в нашей системе');
            setCandidates([]);
        } finally {
            setCandidateLoading(false);
        }
    };

    const openLink = (row) => {
        setLinkRow(row);
        setSelectedCustomerId(row.local_customer_id || row.suggested_local_customer_id || null);
        setCandidates([]);
        void loadCandidates(row);
    };

    const saveLink = async () => {
        if (!linkRow || !selectedCustomerId) return;
        setLinkLoading(true);
        try {
            const response = await linkPartsSoftCustomer(
                linkRow.external_customer_id,
                selectedCustomerId
            );
            const conflicts = response.data?.conflicting_fields || [];
            if (conflicts.length) {
                message.warning(`Связь сохранена. Проверьте расхождения: ${conflicts.join(', ')}`);
            } else {
                message.success('Клиент Parts-Soft привязан');
            }
            setLinkRow(null);
            setSelectedCustomerId(null);
            await runReconciliation();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось привязать клиента');
        } finally {
            setLinkLoading(false);
        }
    };

    const rows = useMemo(
        () => (report?.orders || []).map((row) => ({ ...row, key: row.external_order_id })),
        [report]
    );
    const filters = useMemo(
        () => Object.entries(STATUS).map(([value, config]) => ({ text: config.label, value })),
        []
    );
    const columns = [
        {
            title: 'ID Parts-Soft',
            dataIndex: 'external_order_id',
            width: 125,
        },
        {
            title: 'Дата',
            dataIndex: 'created_at',
            width: 155,
            render: (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—'),
        },
        {
            title: 'Клиент',
            key: 'customer',
            width: 260,
            render: (_, row) => (
                <div>
                    <div>{row.customer_name || `Parts-Soft #${row.external_customer_id}`}</div>
                    <Text type="secondary">ИНН {row.customer_inn || '—'} · КПП {row.customer_kpp || '—'}</Text>
                </div>
            ),
        },
        {
            title: 'Позиций',
            dataIndex: 'items_count',
            width: 90,
        },
        {
            title: 'Результат',
            dataIndex: 'classification',
            width: 190,
            filters,
            onFilter: (value, row) => row.classification === value,
            render: (value) => {
                const config = STATUS[value] || { label: value, color: 'default' };
                return <Tag color={config.color}>{config.label}</Tag>;
            },
        },
        {
            title: 'Основание',
            dataIndex: 'match_basis',
            width: 180,
            render: formatMatchBasis,
        },
        {
            title: 'Связь у нас',
            key: 'local',
            width: 150,
            render: (_, row) => (
                <div>
                    <div>Клиент: {row.local_customer_id || '—'}</div>
                    <div>Заказ: {row.local_order_id || '—'}</div>
                </div>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            fixed: 'right',
            width: 175,
            render: (_, row) => (
                !row.customer_linked
                    ? (
                        <Button size="small" onClick={() => openLink(row)}>
                            {row.local_customer_id ? 'Подтвердить связь' : 'Привязать'}
                        </Button>
                    )
                    : <Text type="secondary">Связан</Text>
            ),
        },
    ];

    const candidateColumns = [
        {
            title: 'Клиент в нашей системе',
            dataIndex: 'name',
            render: (value, row) => (
                <div>
                    <div>{value}</div>
                    <Text type="secondary">ID {row.id}</Text>
                </div>
            ),
        },
        {
            title: 'Реквизиты',
            key: 'details',
            render: (_, row) => (
                <div>
                    <div>ИНН {row.inn || '—'} · КПП {row.kpp || '—'}</div>
                    <Text type="secondary">{row.email || 'email не указан'}</Text>
                </div>
            ),
        },
        {
            title: 'Почему найден',
            dataIndex: 'match_basis',
            width: 170,
            render: (value) => formatMatchBasis(value) || 'ручной поиск',
        },
    ];

    return (
        <div>
            <Alert
                type="info"
                showIcon
                message="Проверка выполняется только за последние 7 дней"
                description="Показываются заказы всех регионов и всех типов клиентов. Дубли и конфликты остаются здесь и не загружаются в основной список заказов."
                style={{ marginBottom: 16 }}
            />
            <Button type="primary" loading={loading} onClick={runReconciliation}>
                Проверить сайт за 7 дней
            </Button>

            {errorText && (
                <Alert
                    type="error"
                    showIcon
                    message="Сверка не выполнена"
                    description={errorText}
                    style={{ marginTop: 16 }}
                />
            )}

            {report && (
                <>
                    <Paragraph style={{ marginTop: 12 }} type="secondary">
                        Период: {dayjs(report.date_from).format('DD.MM.YYYY HH:mm')} — {dayjs(report.date_to).format('DD.MM.YYYY HH:mm')}
                    </Paragraph>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Всего на сайте" value={report.remote_orders_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Заказов проверено" value={report.qualified_orders} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Позиций" value={report.items_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Требуют проверки" value={(report.orders || []).filter((row) => row.review_required).length} /></Card></Col>
                    </Row>
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={rows}
                        columns={columns}
                        pagination={{ pageSize: 25, showSizeChanger: true }}
                        scroll={{ x: 1280 }}
                    />
                </>
            )}
            <Modal
                title="Привязать клиента Parts-Soft"
                open={Boolean(linkRow)}
                onCancel={() => setLinkRow(null)}
                onOk={saveLink}
                okText="Сохранить связь"
                cancelText="Отмена"
                okButtonProps={{ disabled: !selectedCustomerId }}
                confirmLoading={linkLoading}
                width={900}
                destroyOnClose
            >
                {linkRow && (
                    <Alert
                        type="info"
                        message={linkRow.customer_name}
                        description={(
                            <div>
                                <div>Parts-Soft ID {linkRow.external_customer_id}; ИНН {linkRow.customer_inn || '—'}; КПП {linkRow.customer_kpp || '—'}</div>
                                <div>Сохраняется постоянная связь. Пустые реквизиты клиента будут дополнены, существующие значения не перезаписываются.</div>
                            </div>
                        )}
                        style={{ marginBottom: 12 }}
                    />
                )}
                <Input.Search
                    allowClear
                    placeholder="Название, ИНН, КПП, email или ID клиента"
                    enterButton="Найти"
                    onSearch={(value) => linkRow && loadCandidates(linkRow, value)}
                    style={{ marginBottom: 12 }}
                />
                <Table
                    size="small"
                    loading={candidateLoading}
                    dataSource={candidates.map((row) => ({ ...row, key: row.id }))}
                    columns={candidateColumns}
                    rowSelection={{
                        type: 'radio',
                        selectedRowKeys: selectedCustomerId ? [selectedCustomerId] : [],
                        onChange: (keys) => setSelectedCustomerId(keys[0] || null),
                    }}
                    onRow={(row) => ({ onClick: () => setSelectedCustomerId(row.id) })}
                    pagination={{ pageSize: 10 }}
                />
            </Modal>
        </div>
    );
};

export default PartsSoftOrderReconciliation;
