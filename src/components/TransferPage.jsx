import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Descriptions,
    Form,
    InputNumber,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    ArrowRightOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { transferAutopart, listStockMovements } from '../api/inventory';
import { searchAutopartsByOem } from '../api/autoparts';
import { getStorageLocations } from '../api/storage';

const { Title, Text } = Typography;

// ── Main Page ─────────────────────────────────────────────────────────────────

const TransferPage = () => {
    const [form]                         = Form.useForm();
    const [apOptions, setApOptions]     = useState([]);
    const [locOptions, setLocOptions]   = useState([]);
    const [searchingAp, setSearchingAp] = useState(false);
    const [submitting, setSubmitting]   = useState(false);
    const [result, setResult]           = useState(null);
    const [recentMovements, setRecentMovements] = useState([]);
    const [loadingMov, setLoadingMov]   = useState(false);
    const searchTimer                    = useRef(null);

    useEffect(() => {
        getStorageLocations({ limit: 500 })
            .then((res) =>
                setLocOptions(
                    (res.data?.items || res.data || []).map((l) => ({
                        value: l.id,
                        label: `${l.name}${l.warehouse_name ? ` (${l.warehouse_name})` : ''}`,
                    }))
                )
            )
            .catch(() => {});
        fetchRecentMovements();
    }, []);

    const fetchRecentMovements = async () => {
        setLoadingMov(true);
        try {
            const res = await listStockMovements({
                movement_type: 'transfer_out',
                limit: 20,
                skip: 0,
            });
            const payload = res.data;
            setRecentMovements(Array.isArray(payload) ? payload : (payload.items || []));
        } catch { /* ignore */ }
        finally { setLoadingMov(false); }
    };

    const handleApSearch = (q) => {
        clearTimeout(searchTimer.current);
        if (!q || q.length < 2) { setApOptions([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearchingAp(true);
            try {
                const res = await searchAutopartsByOem(q, 30);
                setApOptions(
                    (res.data || []).map((ap) => ({
                        value: ap.id,
                        label: `${ap.oem_number} — ${ap.name}${ap.brand_name ? ` [${ap.brand_name}]` : ''}`,
                    }))
                );
            } catch { /* ignore */ }
            finally { setSearchingAp(false); }
        }, 300);
    };

    const handleSubmit = async () => {
        let values;
        try { values = await form.validateFields(); }
        catch { return; }

        if (values.from_location_id === values.to_location_id) {
            message.error('Ячейка-источник и ячейка-назначение должны отличаться');
            return;
        }

        setSubmitting(true);
        setResult(null);
        try {
            const res = await transferAutopart({
                autopart_id:          values.autopart_id,
                from_location_id:     values.from_location_id,
                to_location_id:       values.to_location_id,
                quantity:             values.quantity,
            });
            setResult(res.data);
            message.success('Перемещение выполнено успешно');
            form.resetFields(['quantity']);
            fetchRecentMovements();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Ошибка перемещения');
        } finally {
            setSubmitting(false);
        }
    };

    const movColumns = [
        {
            title: 'Дата',
            dataIndex: 'created_at',
            width: 140,
            render: (d) => dayjs(d).format('DD.MM.YYYY HH:mm'),
        },
        {
            title: 'Запчасть',
            dataIndex: 'autopart_oem',
            render: (oem, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 12 }}>{oem}</Text>
                    {row.autopart_brand && (
                        <Text type="secondary" style={{ fontSize: 11 }}>{row.autopart_brand}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            width: 80,
            align: 'right',
            render: (q) => <Tag color="cyan">{Math.abs(q)}</Tag>,
        },
        {
            title: 'Из ячейки',
            dataIndex: 'storage_location_name',
            width: 150,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Title level={4} style={{ marginBottom: 24 }}>
                <SwapOutlined style={{ marginRight: 8 }} />
                Перемещение товара
            </Title>

            <Row gutter={24}>
                <Col xs={24} md={12}>
                    <Card title="Параметры перемещения">
                        <Form form={form} layout="vertical">
                            <Form.Item
                                name="autopart_id"
                                label="Запчасть"
                                rules={[{ required: true, message: 'Выберите запчасть' }]}
                            >
                                <Select
                                    showSearch
                                    filterOption={false}
                                    onSearch={handleApSearch}
                                    loading={searchingAp}
                                    placeholder="Введите OEM или название"
                                    notFoundContent={searchingAp ? <Spin size="small" /> : 'Ничего не найдено'}
                                    options={apOptions}
                                />
                            </Form.Item>

                            <Row gutter={12} align="middle">
                                <Col span={10}>
                                    <Form.Item
                                        name="from_location_id"
                                        label="Откуда"
                                        rules={[{ required: true, message: 'Выберите ячейку' }]}
                                    >
                                        <Select
                                            showSearch
                                            placeholder="Ячейка-источник"
                                            filterOption={(input, opt) =>
                                                opt.label.toLowerCase().includes(input.toLowerCase())
                                            }
                                            options={locOptions}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={4} style={{ textAlign: 'center', paddingTop: 8 }}>
                                    <ArrowRightOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                                </Col>
                                <Col span={10}>
                                    <Form.Item
                                        name="to_location_id"
                                        label="Куда"
                                        rules={[{ required: true, message: 'Выберите ячейку' }]}
                                    >
                                        <Select
                                            showSearch
                                            placeholder="Ячейка-назначение"
                                            filterOption={(input, opt) =>
                                                opt.label.toLowerCase().includes(input.toLowerCase())
                                            }
                                            options={locOptions}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                name="quantity"
                                label="Количество"
                                rules={[{ required: true, message: 'Укажите количество' }]}
                                initialValue={1}
                            >
                                <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>

                            <Button
                                type="primary"
                                icon={<SwapOutlined />}
                                loading={submitting}
                                onClick={handleSubmit}
                                block
                                size="large"
                            >
                                Выполнить перемещение
                            </Button>
                        </Form>
                    </Card>

                    {result && (
                        <Card style={{ marginTop: 16 }} size="small">
                            <Alert
                                type="success"
                                showIcon
                                message="Перемещение выполнено"
                                description={
                                    <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                                        <Descriptions.Item label="Движений создано">
                                            {result.movements_created ?? result.movement_ids?.length ?? '—'}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="Лотов затронуто">
                                            {result.lots_transferred?.length ?? result.lot_ids?.length ?? '—'}
                                        </Descriptions.Item>
                                    </Descriptions>
                                }
                            />
                        </Card>
                    )}
                </Col>

                <Col xs={24} md={12}>
                    <Card
                        title="Последние перемещения"
                        extra={
                            <Button size="small" onClick={fetchRecentMovements}>
                                Обновить
                            </Button>
                        }
                    >
                        <Table
                            rowKey="id"
                            columns={movColumns}
                            dataSource={recentMovements}
                            loading={loadingMov}
                            size="small"
                            pagination={false}
                            scroll={{ y: 400 }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default TransferPage;
