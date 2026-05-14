import React, { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Input,
    Modal,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    LinkOutlined,
    ReloadOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import {
    bindDiadocCustomerCounteragent,
    bindDiadocProviderCounteragent,
    getDiadocCounteragents,
} from '../api/diadoc';

const { Text } = Typography;

const DIADOC_SOURCE_SYSTEMS = new Set([
    'DIADOC_COUNTERAGENT_BOX',
    'DIADOC_BOX',
    'DIADOC_CUSTOMER_BOX',
]);

const DIADOC_STATUS_COLORS = {
    Active: 'success',
    IsMyCounteragent: 'success',
    WaitForResponse: 'processing',
    Rejected: 'error',
};

const extractBindingValue = (binding) => (
    binding?.external_supplier_name
    || binding?.external_customer_name
    || binding?.external_supplier_id
    || binding?.external_customer_id
    || null
);

const DiadocBindingCard = ({
    title = 'Диадок',
    targetType,
    targetId,
    entityName,
    bindings = [],
    onBound,
    disabled = false,
}) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [counteragents, setCounteragents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [bindingBoxId, setBindingBoxId] = useState(null);

    const activeBindings = useMemo(
        () => (bindings || []).filter((item) => (
            item?.is_active
            && DIADOC_SOURCE_SYSTEMS.has(
                String(item?.source_system || '').trim().toUpperCase()
            )
        )),
        [bindings]
    );

    const loadCounteragents = useCallback(async (searchValue = query) => {
        setLoading(true);
        try {
            const response = await getDiadocCounteragents({
                query: searchValue || undefined,
                page_size: 50,
            });
            setCounteragents(response.data?.counteragents || []);
        } catch (err) {
            console.error('Failed to load Diadoc counteragents', err);
            message.error('Не удалось загрузить контрагентов Диадока');
        } finally {
            setLoading(false);
        }
    }, [query]);

    const openModal = async () => {
        setOpen(true);
        await loadCounteragents(query);
    };

    const handleBind = async (row) => {
        const counteragentBoxId = String(row?.box_id_guid || '').trim();
        if (!counteragentBoxId) {
            message.error('У контрагента нет box_id_guid');
            return;
        }
        setBindingBoxId(counteragentBoxId);
        try {
            const payload = {
                source_system: 'DIADOC_COUNTERAGENT_BOX',
                counteragent_box_id: counteragentBoxId,
                is_active: true,
            };
            if (targetType === 'provider') {
                await bindDiadocProviderCounteragent(targetId, payload);
            } else {
                await bindDiadocCustomerCounteragent(targetId, payload);
            }
            message.success(
                `${entityName || 'Сущность'} привязана к контрагенту Диадока`
            );
            setOpen(false);
            await onBound?.();
        } catch (err) {
            console.error('Failed to bind Diadoc counteragent', err);
            message.error(
                err?.response?.data?.detail
                || 'Не удалось сохранить привязку Диадока'
            );
        } finally {
            setBindingBoxId(null);
        }
    };

    const columns = [
        {
            title: 'Контрагент',
            key: 'name',
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{row.full_name || row.short_name || 'Без названия'}</Text>
                    {row.short_name && row.full_name && row.short_name !== row.full_name && (
                        <Text type="secondary">{row.short_name}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Box',
            dataIndex: 'box_id_guid',
            key: 'box_id_guid',
            width: 260,
            render: (value) => value || '—',
        },
        {
            title: 'ИНН / КПП',
            key: 'inn_kpp',
            width: 170,
            render: (_, row) => [row.inn, row.kpp].filter(Boolean).join(' / ') || '—',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (value) => (
                value
                    ? <Tag color={DIADOC_STATUS_COLORS[value] || 'default'}>{value}</Tag>
                    : '—'
            ),
        },
        {
            title: 'Уже связано',
            key: 'mapped',
            width: 220,
            render: (_, row) => {
                if (targetType === 'provider' && row.mapped_provider_name) {
                    return <Tag color="blue">{row.mapped_provider_name}</Tag>;
                }
                if (targetType === 'customer' && row.mapped_customer_name) {
                    return <Tag color="blue">{row.mapped_customer_name}</Tag>;
                }
                return <Text type="secondary">—</Text>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 120,
            render: (_, row) => (
                <Button
                    type="primary"
                    size="small"
                    loading={bindingBoxId === row.box_id_guid}
                    onClick={() => handleBind(row)}
                >
                    Привязать
                </Button>
            ),
        },
    ];

    return (
        <>
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Контрагенты Диадока"
                description={(
                    <>
                        Привязка хранится как внешняя ссылка и используется для
                        автоматического импорта и отправки документов через Диадок.
                    </>
                )}
            />

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                    <Text strong>Текущие привязки:</Text>
                    <div style={{ marginTop: 8 }}>
                        {activeBindings.length ? (
                            <Space wrap>
                                {activeBindings.map((binding) => (
                                    <Tag key={binding.id} color="blue">
                                        {extractBindingValue(binding) || `Связка #${binding.id}`}
                                    </Tag>
                                ))}
                            </Space>
                        ) : (
                            <Text type="secondary">Привязки Диадока пока не настроены</Text>
                        )}
                    </div>
                </div>

                <Space wrap>
                    <Button
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={openModal}
                        disabled={disabled}
                    >
                        Подобрать контрагента
                    </Button>
                    <Button onClick={() => navigate('/documents/diadoc')}>
                        Открыть реестр Диадока
                    </Button>
                </Space>
            </Space>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                width={1080}
                title={`${title}: подбор контрагента`}
                destroyOnClose
            >
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Input.Search
                        allowClear
                        enterButton={<><SearchOutlined /> Найти</>}
                        placeholder="Название, ИНН или box_id_guid"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onSearch={(value) => loadCounteragents(value)}
                    />

                    <div>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={() => loadCounteragents(query)}
                        >
                            Обновить
                        </Button>
                    </div>

                    <Table
                        rowKey="box_id_guid"
                        loading={loading}
                        dataSource={counteragents}
                        columns={columns}
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        locale={{ emptyText: 'Контрагенты Диадока не найдены' }}
                        scroll={{ x: 'max-content' }}
                    />
                </Space>
            </Modal>
        </>
    );
};

export default DiadocBindingCard;
