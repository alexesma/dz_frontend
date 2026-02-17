import React, { useMemo, useState } from 'react';
import {
    AutoComplete,
    Card,
    Form,
    Input,
    Button,
    Table,
    Space,
    Tag,
    Divider,
    message,
    Checkbox,
    Spin,
} from 'antd';
import { SearchOutlined, CloudDownloadOutlined, LineChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    getAutopartOffers,
    getDragonzapOffers,
} from '../api/autoparts';

const AutopartOffers = () => {
    const [form] = Form.useForm();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [remoteOffers, setRemoteOffers] = useState([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [showCrosses, setShowCrosses] = useState(false);
    const [currentOem, setCurrentOem] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('');
    const navigate = useNavigate();

    const brandOptions = useMemo(() => {
        const uniqueBrands = new Set(
            offers
                .map((item) => item.brand_name)
                .filter((value) => value && value.trim())
        );
        return Array.from(uniqueBrands).map((brand) => ({
            label: brand,
            value: brand,
        }));
    }, [offers]);

    const handleSearch = async (values) => {
        const oemValue = (values.oem || '').trim();
        if (!oemValue) {
            message.warning('Введите OEM номер');
            return;
        }
        setLoading(true);
        setRemoteOffers([]);
        try {
            const { data } = await getAutopartOffers(oemValue);
            const list = Array.isArray(data?.offers) ? data.offers : [];
            const filtered = list.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            setOffers(filtered);
            setCurrentOem(oemValue);
            const fallbackBrand = list.find((item) => item.brand_name)?.brand_name;
            setSelectedBrand(fallbackBrand || '');
            if (!filtered.length) {
                message.info('В прайс-листах ничего не найдено');
            }
        } catch (error) {
            console.error('Fetch offers error:', error);
            message.error('Ошибка получения данных');
        } finally {
            setLoading(false);
        }
    };

    const handleDragonzapRequest = async () => {
        const oemValue = currentOem || form.getFieldValue('oem');
        const brandValue = selectedBrand;
        if (!oemValue || !brandValue) {
            message.warning(
                'Не удалось определить бренд для запроса. ' +
                'Сначала найдите позицию в локальных прайсах.'
            );
            return;
        }
        setRemoteLoading(true);
        try {
            const { data } = await getDragonzapOffers(
                oemValue,
                brandValue,
                !showCrosses
            );
            const rawList = Array.isArray(data)
                ? data
                : Array.isArray(data?.data)
                    ? data.data
                    : [];

            const normalizedList = rawList.map((item) => {
                const oem =
                    item.oem ??
                    item.oem_number ??
                    item.article ??
                    item.artikul ??
                    item.part_number;
                const price =
                    item.price ??
                    item.price_rub ??
                    item.price_total ??
                    item.price_total_rub ??
                    item.price_with_markup ??
                    item.cost;
                const supplierName =
                    item.supplier_name ??
                    item.supplier ??
                    item.supplier_title ??
                    item.supplier_company ??
                    item.provider ??
                    item.seller_name ??
                    item.price_name ??
                    item.sup_logo;
                const quantity =
                    item.qnt ??
                    item.quantity ??
                    item.qty ??
                    item.balance ??
                    item.stock;
                const detailName =
                    item.detail_name ??
                    item.name ??
                    item.autopart_name ??
                    item.title;
                const makeName =
                    item.make_name ??
                    item.brand ??
                    item.brand_name;
                const minDelivery =
                    item.min_delivery_day ??
                    item.min_delivery ??
                    item.min_delivery_days;
                const maxDelivery =
                    item.max_delivery_day ??
                    item.max_delivery ??
                    item.max_delivery_days;
                return {
                    ...item,
                    oem,
                    price,
                    supplier_name: supplierName,
                    qnt: quantity,
                    detail_name: detailName,
                    make_name: makeName,
                    min_delivery_day: minDelivery,
                    max_delivery_day: maxDelivery,
                };
            });

            const filtered = normalizedList.filter((item) => {
                const qty = Number(item.qnt ?? 0);
                if (Number.isNaN(qty) || qty <= 0) {
                    return false;
                }
                if (!showCrosses && brandValue) {
                    const itemBrand = (item.make_name || '').toLowerCase();
                    return itemBrand === brandValue.toLowerCase();
                }
                return true;
            });

            setRemoteOffers(filtered);
            if (!filtered.length) {
                message.info('Dragonzap не вернул данные');
            }
        } catch (error) {
            console.error('Dragonzap request error:', error);
            message.error('Ошибка запроса к dragonzap');
        } finally {
            setRemoteLoading(false);
        }
    };

    const localColumns = [
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 140,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 140,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            key: 'provider_name',
            width: 180,
        },
        {
            title: 'Прайс',
            dataIndex: 'provider_config_name',
            key: 'provider_config_name',
            width: 180,
            render: (value) => value || 'Основной прайс',
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 100,
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 140,
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'} - ${max ?? '?'}`;
            },
        },
        {
            title: 'Обновлён',
            dataIndex: 'pricelist_date',
            key: 'pricelist_date',
            width: 120,
            render: (value) => value || '—',
        },
        {
            title: 'Наш прайс',
            dataIndex: 'is_own_price',
            key: 'is_own_price',
            width: 120,
            render: (value) =>
                value ? <Tag color="gold">Наш</Tag> : <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'График',
            key: 'price_history',
            width: 110,
            render: (_, record) => (
                <Button
                    size="small"
                    icon={<LineChartOutlined />}
                    onClick={() => navigate(`/autoparts/price-history?oem=${encodeURIComponent(record.oem_number)}`)}
                >
                    Открыть
                </Button>
            ),
        },
    ];

    const remoteColumns = [
        { title: 'OEM', dataIndex: 'oem', key: 'oem', width: 140 },
        { title: 'Бренд', dataIndex: 'make_name', key: 'make_name', width: 140 },
        { title: 'Наименование', dataIndex: 'detail_name', key: 'detail_name', ellipsis: true },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 100,
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Кол-во',
            dataIndex: 'qnt',
            key: 'qnt',
            width: 80,
            render: (value) => (value === null || value === undefined ? '—' : value),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 140,
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'} - ${max ?? '?'}`;
            },
        },
        {
            title: 'Поставщик',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
            width: 180,
            render: (value) => value || '—',
        },
        { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true },
        {
            title: 'График',
            key: 'price_history',
            width: 110,
            render: (_, record) => {
                const oem = record.oem || record.oem_number;
                return (
                    <Button
                        size="small"
                        icon={<LineChartOutlined />}
                        onClick={() => {
                            if (!oem) return;
                            navigate(`/autoparts/price-history?oem=${encodeURIComponent(oem)}`);
                        }}
                    >
                        Открыть
                    </Button>
                );
            },
        },
    ];

    return (
        <Card title="Поиск позиций по артикулу" style={{ margin: '20px' }}>
            <Form
                form={form}
                layout="inline"
                onFinish={handleSearch}
                style={{ marginBottom: 16, rowGap: 12 }}
            >
                <Form.Item
                    name="oem"
                    rules={[{ required: true, message: 'Введите OEM' }]}
                >
                    <Input placeholder="OEM номер" style={{ width: 220 }} />
                </Form.Item>
                <Form.Item>
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        htmlType="submit"
                        loading={loading}
                    >
                        Найти в прайсах
                    </Button>
                </Form.Item>
            </Form>

            {selectedBrand ? (
                <div style={{ marginBottom: 12, color: '#6b7280' }}>
                    Подсказка бренда: <strong>{selectedBrand}</strong>
                </div>
            ) : null}

            <Spin spinning={loading}>
                <Table
                    rowKey={(record) =>
                        `${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                    }
                    columns={localColumns}
                    dataSource={offers}
                    pagination={{ pageSize: 12 }}
                    scroll={{ x: 1200 }}
                />
            </Spin>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Space wrap>
                    <AutoComplete
                        options={brandOptions}
                        value={selectedBrand || ''}
                        style={{ width: 260 }}
                        placeholder="Бренд для запроса на dragonzap"
                        onChange={(value) => setSelectedBrand(value || '')}
                        filterOption={(inputValue, option) =>
                            option?.label
                                ?.toLowerCase()
                                .includes(inputValue.toLowerCase())
                        }
                    />
                </Space>
                <Space wrap>
                    <Checkbox
                        checked={showCrosses}
                        onChange={(e) => setShowCrosses(e.target.checked)}
                    >
                        Показывать кроссы
                    </Checkbox>
                    <Button
                        type="primary"
                        icon={<CloudDownloadOutlined />}
                        onClick={handleDragonzapRequest}
                        loading={remoteLoading}
                    >
                        Запросить на dragonzap
                    </Button>
                </Space>

                <Spin spinning={remoteLoading}>
                    <Table
                        rowKey={(record, index) => record.api_hash || `${record.oem}-${index}`}
                        columns={remoteColumns}
                        dataSource={remoteOffers}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1200 }}
                    />
                </Spin>
            </Space>
        </Card>
    );
};

export default AutopartOffers;
