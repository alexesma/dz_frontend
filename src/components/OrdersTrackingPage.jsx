import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    DatePicker,
    Form,
    Input,
    Select,
    Space,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined } from '@ant-design/icons';
import { getTrackingOrderItems } from '../api/orderTracking';
import { getAllProviders } from '../api/providers';
import TrackingOrderHistoryTable from './TrackingOrderHistoryTable';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const STATUS_OPTIONS = [
    'NEW',
    'SCHEDULED',
    'SENT',
    'ERROR',
    'ORDERED',
    'PROCESSING',
    'CONFIRMED',
    'TRANSIT',
    'ACCEPTED',
    'ARRIVED',
    'SHIPPED',
    'REFUSAL',
    'RETURNED',
    'REMOVED',
].map((value) => ({
    value,
    label: value,
}));

const defaultRange = () => [dayjs().subtract(1, 'year').startOf('day'), dayjs().endOf('day')];

const OrdersTrackingPage = () => {
    const [form] = Form.useForm();
    const [rows, setRows] = useState([]);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);

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
            </Space>
        </Card>
    );
};

export default OrdersTrackingPage;
