import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    DatePicker,
    Divider,
    Form,
    Input,
    Select,
    Space,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getTrackingOrderItems } from '../api/orderTracking';
import { getAllProviders } from '../api/providers';
import TrackingOrderHistoryTable from './TrackingOrderHistoryTable';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const STATUS_OPTIONS = [
    { value: 'NEW',        label: 'Новый' },
    { value: 'SCHEDULED',  label: 'Запланирован' },
    { value: 'SENT',       label: 'Отправлен' },
    { value: 'ERROR',      label: 'Ошибка' },
    { value: 'ORDERED',    label: 'В заказе' },
    { value: 'PROCESSING', label: 'Обрабатывается' },
    { value: 'CONFIRMED',  label: 'Подтвержден' },
    { value: 'TRANSIT',    label: 'В пути' },
    { value: 'ACCEPTED',   label: 'Принят' },
    { value: 'ARRIVED',    label: 'Прибыл' },
    { value: 'SHIPPED',    label: 'Выдан' },
    { value: 'REFUSAL',    label: 'Отказ' },
    { value: 'RETURNED',   label: 'Возврат' },
    { value: 'REMOVED',    label: 'Снят' },
    { value: 'FAILED',     label: 'Ошибка' },
    { value: 'DELIVERED',  label: 'Получено' },
    { value: 'CANCELLED',  label: 'Отменен' },
];

const defaultRange = () => [dayjs().subtract(1, 'year').startOf('day'), dayjs().endOf('day')];

const REFUSAL_STATUSES = new Set(['REFUSAL', 'ERROR', 'FAILED', 'CANCELLED']);

const OrdersTrackingPage = () => {
    const [form] = Form.useForm();
    const [rows, setRows] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const fetchRows = useCallback(async (values) => {
        const nextValues = values || form.getFieldsValue();
        const params = {
            oem: (nextValues.oem || '').trim() || undefined,
            brand: (nextValues.brand || '').trim() || undefined,
            provider_id: nextValues.provider_id || undefined,
            status: nextValues.status || undefined,
            sync_site: true,
            limit: 500,
        };
        const range = nextValues.date_range;
        if (Array.isArray(range) && range.length === 2) {
            params.date_from = range[0]?.format('YYYY-MM-DD');
            params.date_to = range[1]?.format('YYYY-MM-DD');
        }

        setLoading(true);
        try {
            const { data } = await getTrackingOrderItems(params);
            setRows(Array.isArray(data) ? data : []);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось загрузить историю заказов');
        } finally {
            setLoading(false);
        }
    }, [form]);

    useEffect(() => {
        form.setFieldsValue({
            date_range: defaultRange(),
        });
        void fetchRows({
            date_range: defaultRange(),
        });
    }, [fetchRows, form]);

    useEffect(() => {
        const loadProviders = async () => {
            try {
                const items = await getAllProviders({
                    sort_by: 'name',
                    sort_dir: 'asc',
                });
                setProviders(items);
            } catch {
                setProviders([]);
            }
        };
        void loadProviders();
    }, []);

    const providerOptions = useMemo(
        () => providers.map((provider) => ({
            value: provider.id,
            label: provider.name,
        })),
        [providers]
    );

    const refusalRows = useMemo(
        () => rows.filter((r) => REFUSAL_STATUSES.has(r.current_status)),
        [rows]
    );

    const handleReorder = useCallback((record) => {
        const params = new URLSearchParams({
            oem: record.oem_number || '',
            auto: '1',
            replace_item_id: record.item_id,
            replace_source: record.source_type,
        });
        if (record.brand_name) {
            params.set('brand', record.brand_name);
        }
        navigate(`/autoparts/offers?${params.toString()}`);
    }, [navigate]);

    return (
        <Card style={{ margin: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <Title level={3} style={{ marginBottom: 0 }}>
                        Отслеживание наших заказов
                    </Title>
                    <Text type="secondary">
                        Здесь видны только заказы, которые мы создавали через
                        окно поиска по артикулу. По умолчанию показан последний год.
                    </Text>
                    <br />
                    <Text type="secondary">
                        Для заказов с сайта Dragonzap статусы подтягиваются
                        автоматически при открытии страницы и по фоновому
                        опросу. Для заказов из прайсов статус пока ведется
                        вручную. Поле «Получено» можно поправить руками,
                        если факт отличается.
                    </Text>
                </div>

                <Form
                    form={form}
                    layout="inline"
                    size="small"
                    onFinish={fetchRows}
                    style={{ rowGap: 12 }}
                >
                    <Form.Item name="oem">
                        <Input placeholder="OEM" style={{ width: 150 }} allowClear />
                    </Form.Item>
                    <Form.Item name="brand">
                        <Input placeholder="Бренд" style={{ width: 130 }} allowClear />
                    </Form.Item>
                    <Form.Item name="provider_id">
                        <Select
                            allowClear
                            showSearch
                            placeholder="Поставщик"
                            style={{ width: 190 }}
                            options={providerOptions}
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item name="status">
                        <Select
                            allowClear
                            placeholder="Статус"
                            style={{ width: 160 }}
                            options={STATUS_OPTIONS}
                        />
                    </Form.Item>
                    <Form.Item name="date_range">
                        <RangePicker size="small" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit">
                            Показать
                        </Button>
                    </Form.Item>
                    <Form.Item>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => fetchRows()}
                        >
                            Обновить с сайта
                        </Button>
                    </Form.Item>
                </Form>

                <TrackingOrderHistoryTable
                    rows={rows}
                    loading={loading}
                    compact
                    allowEdit
                    onUpdated={() => fetchRows()}
                />

                {refusalRows.length > 0 && (
                    <>
                        <Divider orientation="left" style={{ marginTop: 24 }}>
                            <Typography.Text type="danger" strong>
                                Отказы ({refusalRows.length})
                            </Typography.Text>
                        </Divider>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Позиции со статусом «Отказ» / «Ошибка» / «Отменен».
                            Нажмите «Перезаказать» — откроется поиск по артикулу,
                            а позиция будет помечена как снятая.
                        </Typography.Text>
                        <TrackingOrderHistoryTable
                            rows={refusalRows}
                            loading={loading}
                            compact
                            allowEdit={false}
                            onReorder={handleReorder}
                            emptyText="Отказов нет"
                        />
                    </>
                )}
            </Space>
        </Card>
    );
};

export default OrdersTrackingPage;
