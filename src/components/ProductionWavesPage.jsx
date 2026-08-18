import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Collapse,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
    ScheduleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    cancelProductionWave,
    completeProductionWave,
    createProductionWave,
    getProductionWave,
    listProductionWaveEligible,
    listProductionWaves,
    planProductionWave,
    replanProductionWave,
    startProductionWave,
} from '../api/inventory';
import ProductionWaveLabels from './ProductionWaveLabels';

const { Paragraph, Text, Title } = Typography;

const STATUS = {
    draft: { label: 'Черновик', color: 'default' },
    planned: { label: 'Запланирована', color: 'blue' },
    in_progress: { label: 'В работе', color: 'gold' },
    completed: { label: 'Выпущена', color: 'green' },
    cancelled: { label: 'Отменена', color: 'red' },
};

const SOURCE = {
    manual: { label: 'Вручную', color: 'default' },
    scheduled: { label: 'По расписанию', color: 'cyan' },
};

const money = (value) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(Number(value || 0));

const errorText = (error, fallback) =>
    error?.response?.data?.detail || error?.message || fallback;

const StatusTag = ({ status }) => {
    const meta = STATUS[status] || { label: status, color: 'default' };
    return <Tag color={meta.color}>{meta.label}</Tag>;
};

const ProductionWavesPage = () => {
    const [waves, setWaves] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState(undefined);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [eligible, setEligible] = useState([]);
    const [eligibleLoading, setEligibleLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [creating, setCreating] = useState(false);
    const [labelSummary, setLabelSummary] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: pageSize, offset: (page - 1) * pageSize };
            if (statusFilter) params.status = statusFilter;
            const response = await listProductionWaves(params);
            setWaves(response.data?.items || []);
            setTotal(response.data?.total || 0);
        } catch (error) {
            message.error(errorText(error, 'Не удалось загрузить производственные волны'));
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, statusFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const openDetail = async (id) => {
        setDetailLoading(true);
        setLabelSummary(null);
        try {
            const response = await getProductionWave(id);
            setDetail(response.data);
        } catch (error) {
            message.error(errorText(error, 'Не удалось открыть волну'));
        } finally {
            setDetailLoading(false);
        }
    };

    const openCreate = async () => {
        setCreateOpen(true);
        setEligibleLoading(true);
        setSelectedIds([]);
        form.resetFields();
        try {
            const response = await listProductionWaveEligible({ limit: 500 });
            setEligible(response.data?.items || []);
        } catch (error) {
            message.error(errorText(error, 'Не удалось получить строки для выпуска'));
        } finally {
            setEligibleLoading(false);
        }
    };

    const createWave = async () => {
        if (!selectedIds.length) {
            message.warning('Выберите строки клиентских заказов');
            return;
        }
        const values = await form.validateFields();
        setCreating(true);
        try {
            const response = await createProductionWave({
                stock_order_item_ids: selectedIds,
                notes: values.notes || null,
            });
            message.success('Черновик производственной волны сформирован');
            setCreateOpen(false);
            setDetail(response.data);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Не удалось сформировать волну'));
        } finally {
            setCreating(false);
        }
    };

    const runAction = async (action, successText) => {
        if (!detail) return;
        setActionLoading(true);
        try {
            const response = await action(detail.id);
            setDetail(response.data);
            setLabelSummary(null);
            message.success(successText);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Операция с волной не выполнена'));
        } finally {
            setActionLoading(false);
        }
    };

    const selectedQuantity = useMemo(() => {
        const selected = new Set(selectedIds);
        return eligible
            .filter((row) => selected.has(row.stock_order_item_id))
            .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    }, [eligible, selectedIds]);

    const columns = [
        {
            title: 'Волна',
            dataIndex: 'number',
            render: (value, row) => (
                <Button type="link" onClick={() => void openDetail(row.id)}>{value}</Button>
            ),
        },
        { title: 'Статус', dataIndex: 'status', render: (value) => <StatusTag status={value} /> },
        {
            title: 'Источник',
            dataIndex: 'source',
            render: (value) => {
                const meta = SOURCE[value] || { label: value || '—', color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
            width: 130,
        },
        { title: 'SKU', render: (_, row) => row.items?.length || 0, width: 75 },
        { title: 'План', dataIndex: 'total_planned_quantity', render: (value) => `${value} шт.`, width: 95 },
        { title: 'Выпущено', dataIndex: 'total_produced_quantity', render: (value) => `${value} шт.`, width: 110 },
        { title: 'Себестоимость', dataIndex: 'total_finished_cost', render: (value) => `${money(value)} ₽`, width: 145 },
        {
            title: 'Создана',
            dataIndex: 'created_at',
            render: (value) => dayjs(value).format('DD.MM.YY HH:mm'),
            width: 135,
        },
    ];

    const eligibleColumns = [
        {
            title: 'Клиент / заказ',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.customer_name}</Text>
                    <Text type="secondary">{row.order_number || `Заказ #${row.customer_order_id}`}</Text>
                </Space>
            ),
            width: 180,
        },
        {
            title: 'Как заказал клиент',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.requested_brand} {row.requested_oem}</Text>
                    <Text type="secondary">{row.requested_name || 'Без наименования'}</Text>
                </Space>
            ),
        },
        {
            title: 'Готовый SKU DragonZap',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.finished_brand} {row.finished_oem_number}</Text>
                    <Text type="secondary">{row.finished_name}</Text>
                </Space>
            ),
        },
        { title: 'Кол-во', dataIndex: 'quantity', render: (value) => `${value} шт.`, width: 90 },
    ];

    const detailActions = detail && (
        <Space wrap>
            {detail.status === 'draft' && (
                <>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={actionLoading}
                        onClick={() => void runAction(replanProductionWave, 'План FIFO пересчитан')}
                    >
                        Пересчитать
                    </Button>
                    <Button
                        type="primary"
                        icon={<ScheduleOutlined />}
                        disabled={Boolean(detail.error_message)}
                        loading={actionLoading}
                        onClick={() => void runAction(planProductionWave, 'Партии закреплены за волной')}
                    >
                        Зафиксировать план
                    </Button>
                </>
            )}
            {detail.status === 'planned' && (
                <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    disabled={!labelSummary || labelSummary.pending > 0}
                    loading={actionLoading}
                    onClick={() => void runAction(startProductionWave, 'Переупаковка начата')}
                >
                    {labelSummary?.pending
                        ? `Сначала печать · ${labelSummary.pending} шт.`
                        : 'Начать работу'}
                </Button>
            )}
            {detail.status === 'in_progress' && (
                <Popconfirm
                    title="Провести выпуск?"
                    description="Материал будет списан, а готовые партии поступят на склад."
                    okText="Провести"
                    cancelText="Назад"
                    onConfirm={() => void runAction(completeProductionWave, 'Выпуск проведён')}
                >
                    <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}>
                        Завершить выпуск
                    </Button>
                </Popconfirm>
            )}
            {['draft', 'planned', 'in_progress'].includes(detail.status) && (
                <Popconfirm
                    title="Отменить волну?"
                    description="Строки заказов снова станут доступны для новой волны."
                    okText="Отменить волну"
                    cancelText="Назад"
                    onConfirm={() => void runAction(cancelProductionWave, 'Волна отменена')}
                >
                    <Button danger icon={<CloseCircleOutlined />} loading={actionLoading}>Отменить</Button>
                </Popconfirm>
            )}
        </Space>
    );

    return (
        <div style={{ padding: 24 }}>
            <Card
                style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f5ff 0%, #fff7e6 100%)' }}
                bordered={false}
            >
                <Space direction="vertical" size={4}>
                    <Title level={2} style={{ margin: 0 }}>Производственные волны DragonZap</Title>
                    <Paragraph style={{ margin: 0, maxWidth: 900 }}>
                        Собирайте подтверждённые строки клиентских заказов в одну волну,
                        проверяйте FIFO-партии и себестоимость до списания, затем проводите выпуск.
                    </Paragraph>
                </Space>
            </Card>

            <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreate()}>
                        Сформировать из заказов
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={() => void load()}>Обновить</Button>
                    <Select
                        allowClear
                        placeholder="Все статусы"
                        style={{ width: 190 }}
                        value={statusFilter}
                        onChange={(value) => { setStatusFilter(value); setPage(1); }}
                        options={Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label }))}
                    />
                </Space>
                <Table
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={waves}
                    scroll={{ x: 850 }}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); },
                    }}
                />
            </Card>

            <Modal
                title="Новая производственная волна"
                open={createOpen}
                width={1200}
                okText={`Сформировать · ${selectedQuantity} шт.`}
                cancelText="Отмена"
                okButtonProps={{ disabled: !selectedIds.length }}
                confirmLoading={creating}
                onOk={() => void createWave()}
                onCancel={() => setCreateOpen(false)}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Остатки пока не меняются"
                    description="Будет создан черновик с предварительным FIFO-планом. Партии закрепятся только после команды «Зафиксировать план»."
                />
                <Form form={form} layout="vertical">
                    <Form.Item name="notes" label="Комментарий к волне">
                        <Input.TextArea rows={2} placeholder="Например: утренняя волна, срочные заказы" />
                    </Form.Item>
                </Form>
                <Table
                    rowKey="stock_order_item_id"
                    loading={eligibleLoading}
                    columns={eligibleColumns}
                    dataSource={eligible}
                    size="small"
                    scroll={{ x: 950, y: 430 }}
                    pagination={false}
                    locale={{ emptyText: <Empty description="Нет новых строк для выпуска" /> }}
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
                />
            </Modal>

            <Drawer
                title={detail ? `${detail.number} · ${STATUS[detail.status]?.label || detail.status}` : 'Волна'}
                open={Boolean(detail)}
                loading={detailLoading}
                width="min(1180px, 96vw)"
                onClose={() => { setDetail(null); setLabelSummary(null); }}
                extra={detailActions}
            >
                {detail && (
                    <>
                        {detail.error_message && (
                            <Alert
                                type="error"
                                showIcon
                                message="Волна пока не готова к планированию"
                                description={detail.error_message}
                                style={{ marginBottom: 16 }}
                            />
                        )}
                        <Space size="large" wrap style={{ marginBottom: 20 }}>
                            <Statistic title="План" value={detail.total_planned_quantity} suffix="шт." />
                            <Statistic title="Выпущено" value={detail.total_produced_quantity} suffix="шт." />
                            <Statistic title="Материал" value={money(detail.total_material_cost)} suffix="₽" />
                            <Statistic title="Упаковка" value={money(detail.total_packaging_cost)} suffix="₽" />
                            <Statistic title="Итого" value={money(detail.total_finished_cost)} suffix="₽" />
                        </Space>
                        <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 20 }}>
                            <Descriptions.Item label="Статус"><StatusTag status={detail.status} /></Descriptions.Item>
                            <Descriptions.Item label="Склад">{detail.warehouse_name}</Descriptions.Item>
                            <Descriptions.Item label="Источник">
                                {SOURCE[detail.source]?.label || detail.source || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Отсечка">
                                {detail.cutoff_at ? dayjs(detail.cutoff_at).format('DD.MM.YYYY HH:mm') : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Создал">{detail.created_by_name || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Создана">{dayjs(detail.created_at).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                            <Descriptions.Item label="Комментарий" span={2}>{detail.notes || '—'}</Descriptions.Item>
                        </Descriptions>
                        <Collapse
                            items={(detail.items || []).map((item) => ({
                                key: item.id,
                                label: (
                                    <Space wrap>
                                        <Text strong>{item.finished_brand} {item.finished_oem_number}</Text>
                                        <Tag>{item.planned_quantity} шт.</Tag>
                                        {item.planning_error && <Tag color="red">Требует внимания</Tag>}
                                    </Space>
                                ),
                                children: (
                                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                                        <Text>{item.finished_name}</Text>
                                        {item.planning_error && <Alert type="error" message={item.planning_error} showIcon />}
                                        <div>
                                            <Title level={5}>Для каких заказов</Title>
                                            <Table
                                                rowKey="id"
                                                size="small"
                                                pagination={false}
                                                dataSource={item.demands}
                                                columns={[
                                                    { title: 'Клиент', dataIndex: 'customer_name' },
                                                    { title: 'Заказ', render: (_, row) => row.order_number || `#${row.customer_order_id}` },
                                                    { title: 'Заказанный артикул', render: (_, row) => `${row.requested_brand} ${row.requested_oem}` },
                                                    { title: 'Кол-во', dataIndex: 'quantity', width: 85 },
                                                ]}
                                                scroll={{ x: 650 }}
                                            />
                                        </div>
                                        <div>
                                            <Title level={5}>Какие партии будут использованы</Title>
                                            <Table
                                                rowKey="id"
                                                size="small"
                                                pagination={false}
                                                dataSource={item.allocations}
                                                columns={[
                                                    { title: 'Материал', render: (_, row) => `${row.material_brand || ''} ${row.material_oem_number}` },
                                                    { title: 'Партия', dataIndex: 'stock_lot_id', render: (value) => `#${value}`, width: 85 },
                                                    { title: 'Ячейка', dataIndex: 'storage_location_name' },
                                                    { title: 'ГТД', dataIndex: 'gtd_number', render: (value) => value || '—' },
                                                    { title: 'КИЗ', dataIndex: 'marking_codes_count', width: 70 },
                                                    { title: 'Кол-во', dataIndex: 'planned_quantity', width: 85 },
                                                    { title: 'Цена ед.', dataIndex: 'unit_material_cost', render: (value) => value == null ? '—' : `${money(value)} ₽`, width: 110 },
                                                    { title: 'Готовая партия', dataIndex: 'output_stock_lot_id', render: (value) => value ? `#${value}` : '—', width: 120 },
                                                ]}
                                                scroll={{ x: 900 }}
                                            />
                                        </div>
                                    </Space>
                                ),
                            }))}
                        />
                        <ProductionWaveLabels
                            waveId={detail.id}
                            enabled={['planned', 'in_progress', 'completed'].includes(detail.status)}
                            onSummaryChange={setLabelSummary}
                        />
                    </>
                )}
            </Drawer>
        </div>
    );
};

export default ProductionWavesPage;
