import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    InputNumber,
    Modal,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import {
    ApartmentOutlined,
    EditOutlined,
    ReloadOutlined,
    SettingOutlined,
    UndoOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    listProductionGroups,
    resetProductionMaterial,
    syncProductionGroups,
    updateProductionGroup,
    updateProductionMaterial,
} from '../api/inventory';
import useAuth from '../context/useAuth';

const { Paragraph, Text, Title } = Typography;

const errorText = (error, fallback) =>
    error?.response?.data?.detail || error?.message || fallback;

const ProductionGroupsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [groups, setGroups] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filters, setFilters] = useState({ q: '', is_active: undefined });
    const [groupModal, setGroupModal] = useState(null);
    const [materialModal, setMaterialModal] = useState(null);
    const [saving, setSaving] = useState(false);
    const [groupForm] = Form.useForm();
    const [materialForm] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                limit: pageSize,
                offset: (page - 1) * pageSize,
            };
            if (filters.q) params.q = filters.q;
            if (filters.is_active !== undefined) params.is_active = filters.is_active;
            const response = await listProductionGroups(params);
            setGroups(response.data?.items || []);
            setTotal(response.data?.total || 0);
            if (response.data?.synced_groups) {
                message.success(`Добавлено групп из кроссов: ${response.data.synced_groups}`);
            }
        } catch (error) {
            message.error(errorText(error, 'Не удалось загрузить группы выпуска'));
        } finally {
            setLoading(false);
        }
    }, [filters, page, pageSize]);

    useEffect(() => {
        void load();
    }, [load]);

    const openGroup = (group) => {
        setGroupModal(group);
        groupForm.setFieldsValue({
            is_active: group.is_active,
            packaging_cost: Number(group.packaging_cost || 0),
            packaging_description: group.packaging_description,
            notes: group.notes,
        });
    };

    const saveGroup = async () => {
        const values = await groupForm.validateFields();
        setSaving(true);
        try {
            await updateProductionGroup(groupModal.id, values);
            message.success('Настройки группы сохранены');
            setGroupModal(null);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Не удалось сохранить группу'));
        } finally {
            setSaving(false);
        }
    };

    const openMaterial = (group, material) => {
        setMaterialModal({ group, material });
        materialForm.setFieldsValue({
            priority: material.priority,
            is_allowed: material.is_allowed,
            reason: material.reason,
        });
    };

    const saveMaterial = async () => {
        const values = await materialForm.validateFields();
        setSaving(true);
        try {
            await updateProductionMaterial(
                materialModal.group.id,
                materialModal.material.autopart_id,
                values,
            );
            message.success('Правило материала сохранено');
            setMaterialModal(null);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Не удалось сохранить материал'));
        } finally {
            setSaving(false);
        }
    };

    const resetMaterial = async () => {
        setSaving(true);
        try {
            await resetProductionMaterial(
                materialModal.group.id,
                materialModal.material.autopart_id,
            );
            message.success('Возвращены настройки из каталога кроссов');
            setMaterialModal(null);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Не удалось сбросить настройку'));
        } finally {
            setSaving(false);
        }
    };

    const runSync = async () => {
        setSyncing(true);
        try {
            const response = await syncProductionGroups();
            message.success(
                `Группы обновлены: новых ${response.data?.created || 0}, всего ${response.data?.total || 0}`,
            );
            setPage(1);
            await load();
        } catch (error) {
            message.error(errorText(error, 'Не удалось обновить группы из кроссов'));
        } finally {
            setSyncing(false);
        }
    };

    const materialColumns = (group) => [
        {
            title: 'Материал',
            key: 'part',
            render: (_, row) => (
                <div style={{ minWidth: 0 }}>
                    <Space size={6} wrap>
                        <Text strong>{row.brand}</Text>
                        <Text code>{row.oem_number}</Text>
                        {!row.is_allowed && <Tag color="red">Исключён</Tag>}
                    </Space>
                    <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2, tooltip: row.name }}
                        style={{ margin: '3px 0 0', maxWidth: 520 }}
                    >
                        {row.name || 'Без наименования'}
                    </Paragraph>
                </div>
            ),
        },
        {
            title: 'Доступно',
            dataIndex: 'available_material_quantity',
            width: 110,
            render: (value, row) => (
                <Tooltip title={`Активных партий материала: ${row.active_lots_count}`}>
                    <Tag color={value > 0 ? 'green' : 'default'}>{value} шт.</Tag>
                </Tooltip>
            ),
        },
        {
            title: 'Приоритет',
            dataIndex: 'priority',
            width: 100,
            responsive: ['md'],
        },
        {
            title: 'Настройка',
            key: 'audit',
            width: 190,
            responsive: ['lg'],
            render: (_, row) => row.has_override ? (
                <div>
                    <Tag color="gold">Изменена вручную</Tag>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{row.updated_by_name || 'Администратор'}</Text></div>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{row.updated_at ? dayjs(row.updated_at).format('DD.MM.YYYY HH:mm') : ''}</Text></div>
                </div>
            ) : <Text type="secondary">Из кроссов</Text>,
        },
        {
            title: '',
            key: 'actions',
            width: 52,
            render: (_, row) => isAdmin && (
                <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label="Настроить материал"
                    onClick={() => openMaterial(group, row)}
                />
            ),
        },
    ];

    const columns = [
        {
            title: 'Готовый SKU DragonZap',
            key: 'finished',
            render: (_, group) => (
                <div>
                    <Space size={7} wrap>
                        <Text strong>{group.finished_brand}</Text>
                        <Text code>{group.finished_oem_number}</Text>
                        <Tag color={group.is_active ? 'green' : 'default'}>
                            {group.is_active ? 'Выпуск разрешён' : 'Отключена'}
                        </Tag>
                    </Space>
                    <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2, tooltip: group.finished_name }}
                        style={{ margin: '4px 0 0', maxWidth: 520 }}
                    >
                        {group.finished_name || 'Без наименования'}
                    </Paragraph>
                    {group.graph_truncated && (
                        <Tag color="red">Слишком большой граф кроссов</Tag>
                    )}
                </div>
            ),
        },
        {
            title: 'Материалы',
            key: 'materials',
            width: 150,
            render: (_, group) => (
                <Space direction="vertical" size={0}>
                    <Text>{group.allowed_candidates_count} разрешено</Text>
                    <Text type="secondary">из {group.candidates_count}</Text>
                </Space>
            ),
        },
        {
            title: 'Доступно к выпуску',
            dataIndex: 'available_material_quantity',
            width: 155,
            render: (value) => (
                <Tag color={value > 0 ? 'green' : 'orange'} style={{ fontSize: 14 }}>
                    {value} шт.
                </Tag>
            ),
        },
        {
            title: 'Упаковка',
            key: 'packaging',
            width: 180,
            responsive: ['lg'],
            render: (_, group) => (
                <div>
                    <Text>{Number(group.packaging_cost || 0).toFixed(2)} ₽ / шт.</Text>
                    <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 1, tooltip: group.packaging_description }}
                        style={{ margin: 0 }}
                    >
                        {group.packaging_description || 'Без описания'}
                    </Paragraph>
                </div>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 58,
            render: (_, group) => isAdmin && (
                <Button
                    type="text"
                    icon={<SettingOutlined />}
                    aria-label="Настройки группы"
                    onClick={() => openGroup(group)}
                />
            ),
        },
    ];

    return (
        <div style={{ maxWidth: 1500, margin: '0 auto' }}>
            <Card
                bordered={false}
                style={{
                    marginBottom: 18,
                    background: 'linear-gradient(118deg, #0d3b35 0%, #176b5c 62%, #d98524 160%)',
                    color: '#fff',
                    overflow: 'hidden',
                }}
            >
                <Row gutter={[20, 16]} align="middle" justify="space-between">
                    <Col flex="auto">
                        <Space align="start" size={14}>
                            <ApartmentOutlined style={{ fontSize: 32, color: '#f6c66c', marginTop: 5 }} />
                            <div>
                                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                                    Группы выпуска DragonZap
                                </Title>
                                <Paragraph style={{ color: 'rgba(255,255,255,.8)', margin: '6px 0 0', maxWidth: 780 }}>
                                    Связь готового SKU с допустимыми материалами строится автоматически из проверенных кроссов. Здесь сохраняются только производственные исключения и приоритеты.
                                </Paragraph>
                            </div>
                        </Space>
                    </Col>
                    {isAdmin && (
                        <Col>
                            <Button
                                size="large"
                                icon={<ReloadOutlined spin={syncing} />}
                                loading={syncing}
                                onClick={runSync}
                            >
                                Обновить из кроссов
                            </Button>
                        </Col>
                    )}
                </Row>
            </Card>

            <Alert
                showIcon
                type="info"
                style={{ marginBottom: 16 }}
                message="Каталог кроссов остаётся главным источником"
                description="Удалённая или изменённая связь сразу перестаёт участвовать в группе. Для выпуска позже будут использоваться только разрешённые позиции и партии с ролью «Материал для DragonZap»."
            />

            <Card bordered={false} style={{ marginBottom: 16 }}>
                <Row gutter={[12, 12]}>
                    <Col xs={24} md={14} lg={10}>
                        <Input.Search
                            allowClear
                            placeholder="Артикул, наименование или бренд"
                            enterButton="Найти"
                            onSearch={(value) => {
                                setFilters((current) => ({ ...current, q: value.trim() }));
                                setPage(1);
                            }}
                        />
                    </Col>
                    <Col xs={24} sm={12} md={6} lg={4}>
                        <Select
                            allowClear
                            placeholder="Все состояния"
                            style={{ width: '100%' }}
                            options={[
                                { value: true, label: 'Выпуск разрешён' },
                                { value: false, label: 'Отключённые' },
                            ]}
                            onChange={(value) => {
                                setFilters((current) => ({ ...current, is_active: value }));
                                setPage(1);
                            }}
                        />
                    </Col>
                </Row>
            </Card>

            <Table
                rowKey="id"
                loading={loading}
                dataSource={groups}
                columns={columns}
                expandable={{
                    rowExpandable: (group) => group.candidates_count > 0,
                    expandedRowRender: (group) => (
                        <div style={{ padding: '4px 0 8px' }}>
                            {group.graph_truncated && (
                                <Alert
                                    type="error"
                                    showIcon
                                    message="Граф кроссов превышает безопасный размер. Сначала исправьте ошибочную связь."
                                    style={{ marginBottom: 10 }}
                                />
                            )}
                            <Table
                                size="small"
                                rowKey="autopart_id"
                                pagination={false}
                                columns={materialColumns(group)}
                                dataSource={group.materials}
                            />
                        </div>
                    ),
                }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: [10, 20, 50],
                    showTotal: (value) => `Всего групп: ${value}`,
                    onChange: (nextPage, nextSize) => {
                        setPage(nextSize !== pageSize ? 1 : nextPage);
                        setPageSize(nextSize);
                    },
                }}
            />

            <Modal
                title={groupModal ? `Группа ${groupModal.finished_oem_number}` : 'Настройки группы'}
                open={Boolean(groupModal)}
                onCancel={() => setGroupModal(null)}
                onOk={saveGroup}
                confirmLoading={saving}
                okText="Сохранить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={groupForm} layout="vertical">
                    <Form.Item name="is_active" label="Разрешить выпуск" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="packaging_cost"
                        label="Стоимость упаковки на единицу"
                        rules={[{ required: true, message: 'Укажите стоимость' }]}
                    >
                        <InputNumber min={0} precision={4} addonAfter="₽" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="packaging_description" label="Упаковка">
                        <Input placeholder="Пакет, коробка, этикетка" maxLength={255} />
                    </Form.Item>
                    <Form.Item name="notes" label="Комментарий">
                        <Input.TextArea rows={3} maxLength={2000} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={materialModal ? `${materialModal.material.brand} ${materialModal.material.oem_number}` : 'Материал'}
                open={Boolean(materialModal)}
                onCancel={() => setMaterialModal(null)}
                onOk={saveMaterial}
                confirmLoading={saving}
                okText="Сохранить"
                cancelText="Отмена"
                destroyOnClose
                footer={[
                    <Button
                        key="reset"
                        danger={materialModal?.material?.has_override}
                        disabled={!materialModal?.material?.has_override}
                        icon={<UndoOutlined />}
                        loading={saving}
                        onClick={resetMaterial}
                        style={{ marginRight: 'auto' }}
                    >
                        Сбросить настройку
                    </Button>,
                    <Button key="cancel" onClick={() => setMaterialModal(null)}>
                        Отмена
                    </Button>,
                    <Button key="save" type="primary" loading={saving} onClick={saveMaterial}>
                        Сохранить
                    </Button>,
                ]}
            >
                <Form form={materialForm} layout="vertical">
                    <Form.Item name="is_allowed" label="Разрешить использовать" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="priority"
                        label="Приоритет (меньше используется раньше)"
                        rules={[{ required: true, message: 'Укажите приоритет' }]}
                    >
                        <InputNumber min={1} max={10000} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="reason" label="Причина настройки">
                        <Input.TextArea
                            rows={3}
                            maxLength={1000}
                            placeholder="Например: поставляется как оригинальный товар, не использовать как материал"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ProductionGroupsPage;
