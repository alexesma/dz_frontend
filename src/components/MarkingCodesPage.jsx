import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Input,
    Modal,
    Popover,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Timeline,
    Typography,
    message,
} from 'antd';
import {
    CloudSyncOutlined,
    LoginOutlined,
    ReloadOutlined,
    SearchOutlined,
    StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    checkGisMtCodes,
    confirmGisMtTask,
    getGisMtStatus,
    getMarkingCodeMovements,
    getMarkingCodesSummary,
    listMarkingCodes,
    listMarkingDiscrepancies,
    setGisMtProductGroup,
    startGisMtAuth,
    startGisMtWithdraw,
} from '../api/marking';

const { Title, Text } = Typography;

const STATUS_META = {
    received: { label: 'Получен', color: 'default' },
    in_stock: { label: 'На складе', color: 'green' },
    reserved: { label: 'В резерве', color: 'blue' },
    shipped: { label: 'Отгружен', color: 'purple' },
    returned_to_supplier: { label: 'Возврат поставщику', color: 'gold' },
    withdrawn: { label: 'Выведен из оборота', color: 'orange' },
    error: { label: 'Ошибка', color: 'red' },
};

const MOVEMENT_LABELS = {
    received: 'Получен из УПД',
    stocked: 'Оприходован на склад',
    reserved: 'Зарезервирован',
    shipped: 'Отгружен',
    unposted: 'Возвращён (отмена отгрузки)',
    returned_from_customer: 'Возврат от клиента',
    returned_to_supplier: 'Возврат поставщику',
    withdrawn: 'Выведен из оборота',
    gis_mt_reported: 'Передан в ГИС МТ',
    error: 'Ошибка',
};

const WITHDRAW_ACTIONS = [
    { value: 'RETAIL', label: 'Розничная продажа' },
    { value: 'OWN_USE', label: 'Собственные нужды' },
    { value: 'EXPIRATION', label: 'Истёк срок годности' },
    { value: 'DAMAGE_LOSS', label: 'Порча / утрата' },
];

const fmtDateTime = (value) =>
    value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—';

const MovementsTimeline = ({ markingCodeId }) => {
    const [items, setItems] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { data } = await getMarkingCodeMovements(
                    markingCodeId
                );
                if (mounted) {
                    setItems(Array.isArray(data) ? data : []);
                }
            } catch {
                if (mounted) {
                    setItems([]);
                }
            }
        })();
        return () => {
            mounted = false;
        };
    }, [markingCodeId]);

    if (items === null) {
        return <Text type="secondary">Загрузка истории…</Text>;
    }
    if (!items.length) {
        return <Text type="secondary">Движений нет</Text>;
    }
    return (
        <Timeline
            items={items.map((movement) => ({
                key: movement.id,
                children: (
                    <Space direction="vertical" size={0}>
                        <Text>
                            {MOVEMENT_LABELS[movement.movement_type] ||
                                movement.movement_type}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {fmtDateTime(movement.created_at)}
                            {movement.shipment_document_id
                                ? ` · отгрузка #${movement.shipment_document_id}`
                                : ''}
                            {movement.supplier_receipt_id
                                ? ` · поступление #${movement.supplier_receipt_id}`
                                : ''}
                        </Text>
                    </Space>
                ),
            }))}
        />
    );
};

const MarkingCodesPage = () => {
    const [summary, setSummary] = useState(null);
    const [rows, setRows] = useState([]);
    const [discrepancies, setDiscrepancies] = useState([]);
    const [gisStatus, setGisStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState(null);
    const [query, setQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [productGroupDraft, setProductGroupDraft] = useState('');
    const [gisBusyKey, setGisBusyKey] = useState(null);
    // SMS-подтверждение (вход в ГИС МТ / вывод из оборота)
    const [smsTask, setSmsTask] = useState(null);
    const [smsCode, setSmsCode] = useState('');
    const [smsSubmitting, setSmsSubmitting] = useState(false);
    // Вывод из оборота
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [withdrawAction, setWithdrawAction] = useState('OWN_USE');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryResponse, listResponse, discResponse, gisResponse] =
                await Promise.all([
                    getMarkingCodesSummary(),
                    listMarkingCodes({
                        status: statusFilter || undefined,
                        q: query.trim() || undefined,
                        limit: 300,
                    }),
                    listMarkingDiscrepancies({ limit: 100 }),
                    getGisMtStatus().catch(() => ({ data: null })),
                ]);
            setSummary(summaryResponse.data || null);
            setRows(
                Array.isArray(listResponse.data) ? listResponse.data : []
            );
            setDiscrepancies(
                Array.isArray(discResponse.data) ? discResponse.data : []
            );
            setGisStatus(gisResponse.data || null);
            setProductGroupDraft(
                gisResponse.data?.product_group || ''
            );
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось загрузить коды маркировки'
            );
        } finally {
            setLoading(false);
        }
    }, [query, statusFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleGisAuth = async () => {
        setGisBusyKey('auth');
        try {
            const { data } = await startGisMtAuth();
            setSmsCode('');
            setSmsTask({
                id: data.task_id,
                title: 'Вход в ГИС МТ (Честный знак)',
            });
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось начать вход в ГИС МТ'
            );
        } finally {
            setGisBusyKey(null);
        }
    };

    const handleGisCheck = async () => {
        setGisBusyKey('check');
        try {
            const { data } = await checkGisMtCodes(
                selectedIds.length ? selectedIds : null
            );
            const mismatched = data?.mismatched || [];
            if (mismatched.length) {
                Modal.warning({
                    title: `Расхождения с ГИС МТ: ${mismatched.length}`,
                    width: 600,
                    content: (
                        <ul>
                            {mismatched.slice(0, 10).map((item) => (
                                <li key={item.id}>
                                    <Text code>{item.code.slice(0, 30)}…</Text>
                                    {' — у нас '}
                                    {item.our_status}, в ГИС {item.gis_status}
                                </li>
                            ))}
                        </ul>
                    ),
                });
            } else {
                message.success(
                    `Сверено ${data?.checked ?? 0} кодов — расхождений нет`
                );
            }
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Сверка не удалась'
            );
        } finally {
            setGisBusyKey(null);
        }
    };

    const handleWithdrawStart = async () => {
        setGisBusyKey('withdraw');
        try {
            const { data } = await startGisMtWithdraw(
                selectedIds,
                withdrawAction
            );
            setWithdrawOpen(false);
            setSmsCode('');
            setSmsTask({
                id: data.task_id,
                title: 'Вывод из оборота (подпись документа)',
            });
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось начать вывод из оборота'
            );
        } finally {
            setGisBusyKey(null);
        }
    };

    const handleSmsConfirm = async () => {
        if (!smsTask) {
            return;
        }
        const code = smsCode.trim();
        if (!code) {
            message.warning('Введите код из SMS');
            return;
        }
        setSmsSubmitting(true);
        try {
            await confirmGisMtTask(smsTask.id, code);
            message.success('Операция подтверждена');
            setSmsTask(null);
            setSmsCode('');
            setSelectedIds([]);
            await load();
        } catch (err) {
            message.error(
                err?.response?.data?.detail ||
                    'Не удалось подтвердить. Проверьте код.'
            );
        } finally {
            setSmsSubmitting(false);
        }
    };

    const handleSaveProductGroup = async () => {
        setGisBusyKey('pg');
        try {
            const { data } = await setGisMtProductGroup(productGroupDraft);
            setGisStatus(data || null);
            message.success('Товарная группа сохранена');
        } catch (err) {
            message.error(
                err?.response?.data?.detail || 'Не удалось сохранить'
            );
        } finally {
            setGisBusyKey(null);
        }
    };

    const byStatus = summary?.by_status || {};
    const tokenActive = Boolean(gisStatus?.token_active);

    const columns = [
        {
            title: 'Код (КИЗ)',
            dataIndex: 'code',
            render: (value) => (
                <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {value}
                </Text>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 170,
            render: (value) => {
                const meta = STATUS_META[value] || {
                    label: value,
                    color: 'default',
                };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'ГИС МТ',
            key: 'gis',
            width: 150,
            render: (_, row) =>
                row.gis_status ? (
                    <Space direction="vertical" size={0}>
                        <Tag
                            color={
                                row.gis_status === 'INTRODUCED'
                                    ? 'green'
                                    : 'orange'
                            }
                        >
                            {row.gis_status}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {fmtDateTime(row.gis_checked_at)}
                        </Text>
                    </Space>
                ) : (
                    <Text type="secondary">не сверялся</Text>
                ),
        },
        {
            title: 'Позиция',
            key: 'position',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>
                        {[row.brand_name, row.oem_number]
                            .filter(Boolean)
                            .join(' ') || '—'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.autopart_name || ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Поступление',
            dataIndex: 'supplier_receipt_id',
            width: 110,
            render: (value) => (value ? `#${value}` : '—'),
        },
        {
            title: 'Отгрузка',
            dataIndex: 'shipment_document_id',
            width: 100,
            render: (value) => (value ? `#${value}` : '—'),
        },
        {
            title: 'Получен',
            dataIndex: 'received_at',
            width: 130,
            render: fmtDateTime,
        },
    ];

    const discrepancyColumns = [
        {
            title: 'Поступление',
            key: 'doc',
            width: 200,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>
                        {row.document_number || `#${row.receipt_id}`}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.provider_name || ''}
                        {row.document_date
                            ? ` · ${dayjs(row.document_date).format('DD.MM.YYYY')}`
                            : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Позиция',
            key: 'position',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>
                        {[row.brand_name, row.oem_number]
                            .filter(Boolean)
                            .join(' ')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.autopart_name || ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Принято, шт',
            dataIndex: 'received_quantity',
            width: 110,
        },
        {
            title: 'Кодов',
            dataIndex: 'codes_count',
            width: 90,
            render: (value, row) => (
                <Tag
                    color={
                        value === row.received_quantity ? 'green' : 'red'
                    }
                >
                    {value}
                </Tag>
            ),
        },
    ];

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Space
                    style={{ justifyContent: 'space-between', width: '100%' }}
                    wrap
                >
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            Маркировка (Честный знак)
                        </Title>
                        <Text type="secondary">
                            Коды идентификации: приёмка из УПД → склад →
                            передача клиенту / вывод из оборота
                        </Text>
                    </div>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={load}
                    >
                        Обновить
                    </Button>
                </Space>

                <Row gutter={[12, 12]}>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Всего кодов"
                            value={summary?.total ?? '—'}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="На складе"
                            value={byStatus.in_stock ?? 0}
                            valueStyle={{ color: '#16a34a' }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Отгружено"
                            value={byStatus.shipped ?? 0}
                            valueStyle={{ color: '#7c3aed' }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Выведено"
                            value={byStatus.withdrawn ?? 0}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Расхождения приёмки"
                            value={discrepancies.length}
                            valueStyle={{
                                color: discrepancies.length
                                    ? '#dc2626'
                                    : undefined,
                            }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic
                            title="Позиций с кодами"
                            value={summary?.autoparts_with_codes ?? 0}
                        />
                    </Col>
                </Row>

                <Card
                    size="small"
                    title="ГИС МТ (Честный знак)"
                    extra={
                        tokenActive ? (
                            <Tag color="green">
                                Токен активен до{' '}
                                {fmtDateTime(gisStatus?.token_expires_at)}
                            </Tag>
                        ) : (
                            <Tag color="red">Нет активного токена</Tag>
                        )
                    }
                >
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Space wrap>
                            <Button
                                type={tokenActive ? 'default' : 'primary'}
                                icon={<LoginOutlined />}
                                loading={gisBusyKey === 'auth'}
                                onClick={handleGisAuth}
                            >
                                Войти в ГИС МТ (SMS)
                            </Button>
                            <Button
                                icon={<CloudSyncOutlined />}
                                disabled={!tokenActive}
                                loading={gisBusyKey === 'check'}
                                onClick={handleGisCheck}
                            >
                                {selectedIds.length
                                    ? `Сверить выбранные (${selectedIds.length})`
                                    : 'Сверить все на складе'}
                            </Button>
                            <Button
                                danger
                                icon={<StopOutlined />}
                                disabled={
                                    !tokenActive || !selectedIds.length
                                }
                                onClick={() => setWithdrawOpen(true)}
                            >
                                Вывести из оборота ({selectedIds.length})
                            </Button>
                            <Popover
                                title="Товарная группа True API"
                                content="Например: autocomponents, tires. Указана в личном кабинете Честного знака."
                            >
                                <Space.Compact>
                                    <Input
                                        placeholder="Товарная группа"
                                        style={{ width: 200 }}
                                        value={productGroupDraft}
                                        onChange={(e) =>
                                            setProductGroupDraft(
                                                e.target.value
                                            )
                                        }
                                    />
                                    <Button
                                        loading={gisBusyKey === 'pg'}
                                        onClick={handleSaveProductGroup}
                                    >
                                        Сохранить
                                    </Button>
                                </Space.Compact>
                            </Popover>
                        </Space>
                        {gisStatus?.last_error ? (
                            <Alert
                                type="error"
                                showIcon
                                message="Последняя ошибка ГИС МТ"
                                description={gisStatus.last_error}
                            />
                        ) : null}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Вход и подпись документов выполняются облачной
                            подписью Диадока (код из SMS). Токен живёт ~10
                            часов.
                            {gisStatus?.last_check_at
                                ? ` Последняя сверка: ${fmtDateTime(gisStatus.last_check_at)}.`
                                : ''}
                        </Text>
                    </Space>
                </Card>

                {discrepancies.length ? (
                    <Card
                        size="small"
                        title={`⚠ Расхождения приёмки (${discrepancies.length}) — кодов не столько, сколько штук`}
                    >
                        <Table
                            rowKey="receipt_item_id"
                            size="small"
                            columns={discrepancyColumns}
                            dataSource={discrepancies}
                            pagination={{ pageSize: 5, hideOnSinglePage: true }}
                        />
                    </Card>
                ) : null}

                <Space wrap>
                    <Input
                        allowClear
                        placeholder="Поиск по коду или артикулу"
                        prefix={<SearchOutlined />}
                        style={{ width: 300 }}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onPressEnter={load}
                    />
                    <Select
                        allowClear
                        placeholder="Статус"
                        style={{ width: 220 }}
                        value={statusFilter}
                        onChange={(value) => setStatusFilter(value || null)}
                        options={Object.entries(STATUS_META).map(
                            ([value, meta]) => ({
                                value,
                                label: meta.label,
                            })
                        )}
                    />
                </Space>

                <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={rows}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    rowSelection={{
                        selectedRowKeys: selectedIds,
                        onChange: (keys) => setSelectedIds(keys),
                    }}
                    expandable={{
                        expandedRowRender: (row) => (
                            <MovementsTimeline markingCodeId={row.id} />
                        ),
                    }}
                    scroll={{ x: 1200 }}
                    locale={{ emptyText: 'Кодов маркировки пока нет' }}
                />
            </Space>

            <Modal
                open={Boolean(smsTask)}
                title={smsTask?.title || 'Подтверждение'}
                okText="Подтвердить"
                cancelText="Отмена"
                confirmLoading={smsSubmitting}
                onOk={handleSmsConfirm}
                onCancel={() => {
                    setSmsTask(null);
                    setSmsCode('');
                }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                        type="info"
                        showIcon
                        message="Отправлено на облачное подписание"
                        description="Введите код подтверждения из SMS, отправленного владельцу Контур.Сертификата."
                    />
                    <Input
                        autoFocus
                        placeholder="Код из SMS"
                        value={smsCode}
                        maxLength={20}
                        onChange={(e) => setSmsCode(e.target.value)}
                        onPressEnter={handleSmsConfirm}
                    />
                </Space>
            </Modal>

            <Modal
                open={withdrawOpen}
                title={`Вывод из оборота: ${selectedIds.length} кодов`}
                okText="Подписать и отправить (SMS)"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                confirmLoading={gisBusyKey === 'withdraw'}
                onOk={handleWithdrawStart}
                onCancel={() => setWithdrawOpen(false)}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>Причина вывода из оборота:</Text>
                    <Select
                        style={{ width: '100%' }}
                        value={withdrawAction}
                        onChange={setWithdrawAction}
                        options={WITHDRAW_ACTIONS}
                    />
                    <Alert
                        type="warning"
                        showIcon
                        message="Будет создан документ «Вывод из оборота» в ГИС МТ"
                        description="Документ подписывается облачной подписью (код из SMS). Коды получат статус «Выведен из оборота»."
                    />
                </Space>
            </Modal>
        </Card>
    );
};

export default MarkingCodesPage;
