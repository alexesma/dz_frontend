import React, { useEffect, useMemo, useState } from 'react';
import {
    AutoComplete,
    Card,
    Form,
    Input,
    InputNumber,
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

const OEM_HISTORY_KEY = 'autopart_oem_history_v1';
const STATE_STORAGE_KEY = 'autopart_offers_state_v1';

const safeJsonParse = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const AutopartOffers = () => {
    const [form] = Form.useForm();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [remoteOffers, setRemoteOffers] = useState([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [remoteMeta, setRemoteMeta] = useState({ total: 0 });
    const [showCrosses, setShowCrosses] = useState(false);
    const [currentOem, setCurrentOem] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('');
    const [oemHistory, setOemHistory] = useState([]);
    const [localFilters, setLocalFilters] = useState({
        brand: '',
        provider: '',
        minPrice: null,
        maxPrice: null,
        minQty: null,
        maxDelivery: null,
    });
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

    const oemOptions = useMemo(
        () => oemHistory.map((item) => ({ value: item })),
        [oemHistory]
    );

    useEffect(() => {
        const storedHistory = safeJsonParse(
            localStorage.getItem(OEM_HISTORY_KEY),
            []
        );
        if (Array.isArray(storedHistory)) {
            setOemHistory(
                storedHistory
                    .map((item) => String(item || '').trim())
                    .filter((item) => item)
                    .slice(0, 10)
            );
        }

        const storedState = safeJsonParse(
            localStorage.getItem(STATE_STORAGE_KEY),
            null
        );
        if (storedState && typeof storedState === 'object') {
            if (Array.isArray(storedState.offers)) {
                setOffers(storedState.offers);
            }
            if (Array.isArray(storedState.remoteOffers)) {
                setRemoteOffers(storedState.remoteOffers);
            }
            if (storedState.remoteMeta) {
                setRemoteMeta(storedState.remoteMeta);
            }
            setShowCrosses(Boolean(storedState.showCrosses));
            setCurrentOem(storedState.currentOem || '');
            setSelectedBrand(storedState.selectedBrand || '');
            if (storedState.currentOem) {
                form.setFieldsValue({ oem: storedState.currentOem });
            }
        }
    }, [form]);

    useEffect(() => {
        const payload = {
            currentOem,
            selectedBrand,
            showCrosses,
            offers,
            remoteOffers,
            remoteMeta,
        };
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
    }, [currentOem, selectedBrand, showCrosses, offers, remoteOffers, remoteMeta]);

    const pushOemHistory = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) {
            return;
        }
        setOemHistory((prev) => {
            const deduped = prev.filter(
                (item) => item.toLowerCase() !== normalized.toLowerCase()
            );
            const next = [normalized, ...deduped].slice(0, 10);
            localStorage.setItem(OEM_HISTORY_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleSearch = async (values) => {
        const oemValue = (values.oem || '').trim();
        if (!oemValue) {
            message.warning('Введите OEM номер');
            return;
        }
        setLoading(true);
        setRemoteOffers([]);
        setRemoteMeta({ total: 0 });
        try {
            const { data } = await getAutopartOffers(oemValue);
            const list = Array.isArray(data?.offers) ? data.offers : [];
            const filtered = list.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            const sortedByPrice = [...filtered].sort((a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            setOffers(sortedByPrice);
            setCurrentOem(oemValue);
            pushOemHistory(oemValue);
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
            const queryBrands = Array.isArray(data?.query_brands)
                ? data.query_brands
                    .map((brand) => String(brand || '').toLowerCase())
                    .filter((brand) => brand)
                : [];
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
                    const requestedBrand = (
                        item?.sys_info?.requested_make_name ||
                        item?.query_brand ||
                        ''
                    ).toLowerCase();
                    if (queryBrands.length) {
                        return (
                            queryBrands.includes(itemBrand) ||
                            queryBrands.includes(requestedBrand)
                        );
                    }
                    return itemBrand === brandValue.toLowerCase();
                }
                return true;
            });

            const sortedByPrice = [...filtered].sort((a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            setRemoteOffers(sortedByPrice);
            setRemoteMeta({ total: filtered.length });
            if (!sortedByPrice.length) {
                message.info('Dragonzap не вернул данные');
            }
        } catch (error) {
            console.error('Dragonzap request error:', error);
            message.error('Ошибка запроса к dragonzap');
        } finally {
            setRemoteLoading(false);
        }
    };

    const filteredOffers = useMemo(() => {
        const brandNeedle = localFilters.brand.trim().toLowerCase();
        const providerNeedle = localFilters.provider.trim().toLowerCase();
        const minPrice = localFilters.minPrice;
        const maxPrice = localFilters.maxPrice;
        const minQty = localFilters.minQty;
        const maxDelivery = localFilters.maxDelivery;

        return offers.filter((item) => {
            const brandValue = (item.brand_name || '').toLowerCase();
            const providerValue = (item.provider_name || '').toLowerCase();
            const priceValue = Number(item.price ?? Number.NaN);
            const qtyValue = Number(item.quantity ?? Number.NaN);
            const deliveryValue = Number(
                item.min_delivery_day ?? item.max_delivery_day ?? Number.NaN
            );

            if (brandNeedle && !brandValue.includes(brandNeedle)) {
                return false;
            }
            if (providerNeedle && !providerValue.includes(providerNeedle)) {
                return false;
            }
            if (minPrice != null) {
                if (Number.isNaN(priceValue) || priceValue < minPrice) {
                    return false;
                }
            }
            if (maxPrice != null) {
                if (Number.isNaN(priceValue) || priceValue > maxPrice) {
                    return false;
                }
            }
            if (minQty != null) {
                if (Number.isNaN(qtyValue) || qtyValue < minQty) {
                    return false;
                }
            }
            if (maxDelivery != null) {
                if (Number.isNaN(deliveryValue) || deliveryValue > maxDelivery) {
                    return false;
                }
            }
            return true;
        });
    }, [offers, localFilters]);

    const resetLocalFilters = () => {
        setLocalFilters({
            brand: '',
            provider: '',
            minPrice: null,
            maxPrice: null,
            minQty: null,
            maxDelivery: null,
        });
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
            sorter: (a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            },
            defaultSortOrder: 'ascend',
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
            sorter: (a, b) => {
                const aQty = Number(a.quantity ?? Number.NEGATIVE_INFINITY);
                const bQty = Number(b.quantity ?? Number.NEGATIVE_INFINITY);
                return aQty - bQty;
            },
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 140,
            sorter: (a, b) => {
                const aVal = Number(a.min_delivery_day ?? a.max_delivery_day ?? Number.POSITIVE_INFINITY);
                const bVal = Number(b.min_delivery_day ?? b.max_delivery_day ?? Number.POSITIVE_INFINITY);
                return aVal - bVal;
            },
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
            sorter: (a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            },
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
            sorter: (a, b) => {
                const aVal = Number(a.min_delivery_day ?? a.max_delivery_day ?? Number.POSITIVE_INFINITY);
                const bVal = Number(b.min_delivery_day ?? b.max_delivery_day ?? Number.POSITIVE_INFINITY);
                return aVal - bVal;
            },
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
                    <AutoComplete
                        options={oemOptions}
                        style={{ width: 220 }}
                        placeholder="OEM номер"
                        filterOption={(inputValue, option) =>
                            option?.value
                                ?.toLowerCase()
                                .includes(inputValue.toLowerCase())
                        }
                    >
                        <Input />
                    </AutoComplete>
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

            <Space wrap style={{ marginBottom: 12 }}>
                <AutoComplete
                    options={brandOptions}
                    value={localFilters.brand}
                    style={{ width: 220 }}
                    placeholder="Фильтр по бренду"
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, brand: value || '' }))
                    }
                    filterOption={(inputValue, option) =>
                        option?.label
                            ?.toLowerCase()
                            .includes(inputValue.toLowerCase())
                    }
                />
                <Input
                    value={localFilters.provider}
                    onChange={(e) =>
                        setLocalFilters((prev) => ({ ...prev, provider: e.target.value }))
                    }
                    style={{ width: 200 }}
                    placeholder="Фильтр по поставщику"
                />
                <InputNumber
                    value={localFilters.minPrice}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, minPrice: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Цена от"
                />
                <InputNumber
                    value={localFilters.maxPrice}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, maxPrice: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Цена до"
                />
                <InputNumber
                    value={localFilters.minQty}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, minQty: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Мин. кол-во"
                />
                <InputNumber
                    value={localFilters.maxDelivery}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, maxDelivery: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Срок до (дней)"
                />
                <Button onClick={resetLocalFilters}>Сбросить фильтры</Button>
            </Space>

            <Spin spinning={loading}>
                <Table
                    rowKey={(record) =>
                        `${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                    }
                    columns={localColumns}
                    dataSource={filteredOffers}
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
                    {remoteMeta.total > 0 ? (
                        <div style={{ marginBottom: 8, color: '#6b7280' }}>
                            Найдено {remoteMeta.total}. Показаны все предложения.
                        </div>
                    ) : null}
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
