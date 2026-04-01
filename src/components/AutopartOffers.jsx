import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    Tooltip,
} from 'antd';
import {
    SearchOutlined,
    CloudDownloadOutlined,
    LineChartOutlined,
    PlusOutlined,
    ShoppingCartOutlined,
    DeleteOutlined,
    SendOutlined,
    MailOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    getAutopartOffers,
    getDragonzapOffers,
    searchAutopartsByOem,
    sendDragonzapOrder,
} from '../api/autoparts';
import {
    createManualSupplierOrder,
    sendSupplierOrders,
} from '../api/customerOrders';

const OEM_HISTORY_KEY = 'autopart_oem_history_v1';
const STATE_STORAGE_KEY = 'autopart_offers_state_v2';

const buildCartKey = (sourceType, record) => {
    if (sourceType === 'supplier') {
        return [
            'supplier',
            record.provider_id,
            record.provider_config_id || 'base',
            record.autopart_id,
            record.oem_number,
        ].join(':');
    }
    return [
        'dragonzap',
        record.supplier_id ||
            record.provider_id ||
            normalizeSupplierName(
                record.supplier_name || record.sup_logo || record.provider_name
            ) ||
            'unknown',
        record.hash_key || record.api_hash || record.system_hash || record.oem,
        record.oem,
    ].join(':');
};

const clampQty = (value, maxValue) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1;
    }
    if (Number.isFinite(maxValue) && maxValue > 0) {
        return Math.min(parsed, maxValue);
    }
    return parsed;
};

function normalizeSupplierName(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

const extractRequestError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
    }
    if (Array.isArray(detail) && detail.length) {
        return detail
            .map((item) => item?.msg || item?.message || String(item))
            .filter(Boolean)
            .join('; ');
    }
    return fallback;
};

const formatShortDate = (value) => {
    if (!value) {
        return '—';
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    });
};

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

const renderHighlightedOem = (value, query) => {
    const source = String(value || '');
    const needle = String(query || '').trim();
    if (!source || !needle) {
        return source || '—';
    }

    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const matchIndex = lowerSource.indexOf(lowerNeedle);
    if (matchIndex < 0) {
        return source;
    }

    const before = source.slice(0, matchIndex);
    const match = source.slice(matchIndex, matchIndex + needle.length);
    const after = source.slice(matchIndex + needle.length);

    return (
        <>
            {before}
            <mark
                style={{
                    backgroundColor: '#fef3c7',
                    padding: 0,
                }}
            >
                {match}
            </mark>
            {after}
        </>
    );
};

const AutopartOffers = () => {
    const [form] = Form.useForm();
    const [offers, setOffers] = useState([]);
    const [historicalOffers, setHistoricalOffers] = useState([]);
    const [cartItems, setCartItems] = useState([]);
    const [selectedCartKeys, setSelectedCartKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [remoteOffers, setRemoteOffers] = useState([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [cartSubmitting, setCartSubmitting] = useState(false);
    const [remoteMeta, setRemoteMeta] = useState({ total: 0 });
    const [showCrosses, setShowCrosses] = useState(false);
    const [partialSearch, setPartialSearch] = useState(false);
    const [currentOem, setCurrentOem] = useState('');
    const [oemInput, setOemInput] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupResults, setLookupResults] = useState([]);
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
    const lookupRequestIdRef = useRef(0);
    const activeLookupQuery = String(oemInput || '').trim();

    const brandOptions = useMemo(() => {
        const uniqueBrands = new Set(
            [...offers, ...historicalOffers]
                .map((item) => item.brand_name)
                .filter((value) => value && value.trim())
        );
        return Array.from(uniqueBrands).map((brand) => ({
            label: brand,
            value: brand,
        }));
    }, [offers, historicalOffers]);

    const oemOptions = useMemo(() => {
        const seen = new Set();
        const options = [];

        for (const item of oemHistory) {
            const value = String(item || '').trim();
            if (!value) {
                continue;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            options.push({
                value,
                label: (
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {renderHighlightedOem(value, activeLookupQuery)}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            История поиска
                        </div>
                    </div>
                ),
            });
        }

        for (const item of lookupResults) {
            const value = String(item.oem_number || '').trim();
            if (!value) {
                continue;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            options.push({
                value,
                label: (
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {renderHighlightedOem(
                                item.oem_number,
                                activeLookupQuery
                            )}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {[item.brand, item.name].filter(Boolean).join(' · ') || 'Найдено в базе'}
                        </div>
                    </div>
                ),
            });
        }

        return options;
    }, [activeLookupQuery, lookupResults, oemHistory]);

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
            if (Array.isArray(storedState.historicalOffers)) {
                setHistoricalOffers(storedState.historicalOffers);
            }
            if (Array.isArray(storedState.cartItems)) {
                setCartItems(storedState.cartItems);
            }
            if (Array.isArray(storedState.selectedCartKeys)) {
                setSelectedCartKeys(storedState.selectedCartKeys);
            }
            if (Array.isArray(storedState.remoteOffers)) {
                setRemoteOffers(storedState.remoteOffers);
            }
            if (storedState.remoteMeta) {
                setRemoteMeta(storedState.remoteMeta);
            }
            setShowCrosses(Boolean(storedState.showCrosses));
            setPartialSearch(Boolean(storedState.partialSearch));
            setCurrentOem(storedState.currentOem || '');
            setSelectedBrand(storedState.selectedBrand || '');
            if (storedState.currentOem) {
                form.setFieldsValue({ oem: storedState.currentOem });
                setOemInput(storedState.currentOem);
            }
        }
    }, [form]);

    useEffect(() => {
        const payload = {
            currentOem,
            selectedBrand,
            showCrosses,
            partialSearch,
            offers,
            historicalOffers,
            cartItems,
            selectedCartKeys,
            remoteOffers,
            remoteMeta,
        };
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
    }, [
        currentOem,
        selectedBrand,
        showCrosses,
        partialSearch,
        offers,
        historicalOffers,
        cartItems,
        selectedCartKeys,
        remoteOffers,
        remoteMeta,
    ]);

    useEffect(() => {
        const normalized = String(oemInput || '').trim();
        if (normalized.length < 2) {
            setLookupResults([]);
            setLookupLoading(false);
            return undefined;
        }

        const currentRequestId = lookupRequestIdRef.current + 1;
        lookupRequestIdRef.current = currentRequestId;
        setLookupLoading(true);

        const timerId = window.setTimeout(async () => {
            try {
                const { data } = await searchAutopartsByOem(normalized, 12);
                if (lookupRequestIdRef.current !== currentRequestId) {
                    return;
                }
                setLookupResults(Array.isArray(data) ? data : []);
            } catch {
                if (lookupRequestIdRef.current !== currentRequestId) {
                    return;
                }
                setLookupResults([]);
            } finally {
                if (lookupRequestIdRef.current === currentRequestId) {
                    setLookupLoading(false);
                }
            }
        }, 250);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [oemInput]);

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

    const upsertCartItem = (nextItem) => {
        setCartItems((prev) => {
            const existing = prev.find((item) => item.cart_key === nextItem.cart_key);
            if (!existing) {
                return [...prev, nextItem];
            }
            const maxValue = Number(
                nextItem.available_qty ?? existing.available_qty ?? Number.NaN
            );
            return prev.map((item) => {
                if (item.cart_key !== nextItem.cart_key) {
                    return item;
                }
                return {
                    ...item,
                    ...nextItem,
                    order_qty: clampQty(
                        Number(item.order_qty || 1) + 1,
                        maxValue
                    ),
                };
            });
        });
    };

    const addLocalOfferToCart = (record) => {
        upsertCartItem({
            cart_key: buildCartKey('supplier', record),
            source_type: 'supplier',
            autopart_id: record.autopart_id,
            provider_id: record.provider_id,
            provider_name: record.provider_name,
            provider_config_id: record.provider_config_id,
            provider_config_name: record.provider_config_name,
            oem_number: record.oem_number,
            brand_name: record.brand_name,
            name: record.name,
            price: Number(record.price ?? 0),
            available_qty: Number(record.quantity ?? 0),
            order_qty: 1,
            min_delivery_day: record.min_delivery_day,
            max_delivery_day: record.max_delivery_day,
            is_own_price: Boolean(record.is_own_price),
        });
        message.success('Позиция добавлена в корзину');
    };

    const addDragonzapOfferToCart = (record) => {
        const supplierId = record.supplier_id || record.provider_id || null;
        const hashKey = record.hash_key || record.api_hash || null;
        const supplierName = normalizeSupplierName(
            record.supplier_name || record.sup_logo || record.provider_name
        );
        upsertCartItem({
            cart_key: buildCartKey('dragonzap', record),
            source_type: 'dragonzap',
            autopart_id: record.autopart_id ?? null,
            supplier_id: supplierId,
            provider_id: supplierId,
            supplier_name: supplierName,
            provider_name: supplierName || 'Dragonzap',
            oem_number: record.oem || record.oem_number,
            brand_name: record.make_name || record.brand_name,
            name: record.detail_name || record.name,
            price: Number(record.price ?? 0),
            available_qty: Number(record.qnt ?? 0),
            order_qty: 1,
            min_delivery_day: record.min_delivery_day,
            max_delivery_day: record.max_delivery_day,
            hash_key: hashKey,
            system_hash: record.system_hash || null,
        });
        message.success('Позиция добавлена в корзину');
    };

    const updateCartQty = (cartKey, value) => {
        setCartItems((prev) =>
            prev.map((item) => {
                if (item.cart_key !== cartKey) {
                    return item;
                }
                return {
                    ...item,
                    order_qty: clampQty(value, Number(item.available_qty)),
                };
            })
        );
    };

    const removeCartItem = (cartKey) => {
        setCartItems((prev) => prev.filter((item) => item.cart_key !== cartKey));
        setSelectedCartKeys((prev) => prev.filter((key) => key !== cartKey));
    };

    const clearCartItems = (keys) => {
        const keySet = new Set(keys);
        setCartItems((prev) => prev.filter((item) => !keySet.has(item.cart_key)));
        setSelectedCartKeys((prev) => prev.filter((key) => !keySet.has(key)));
    };

    const executeSearch = async (oemValue, usePartialSearch) => {
        if (!oemValue) {
            message.warning('Введите OEM номер');
            return;
        }
        setLoading(true);
        setHistoricalOffers([]);
        setRemoteOffers([]);
        setRemoteMeta({ total: 0 });
        try {
            const { data } = await getAutopartOffers(
                oemValue,
                usePartialSearch
            );
            const list = Array.isArray(data?.offers) ? data.offers : [];
            const historicalList = Array.isArray(data?.historical_offers)
                ? data.historical_offers
                : [];
            const filtered = list.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            const filteredHistorical = historicalList.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            const sortedByPrice = [...filtered].sort((a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            const sortedHistorical = [...filteredHistorical].sort((a, b) => {
                const aDate = String(a.pricelist_date || '');
                const bDate = String(b.pricelist_date || '');
                if (aDate !== bDate) {
                    return bDate.localeCompare(aDate);
                }
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            setOffers(sortedByPrice);
            setHistoricalOffers(sortedHistorical);
            setCurrentOem(oemValue);
            setOemInput(oemValue);
            pushOemHistory(oemValue);
            const fallbackBrand = [...list, ...historicalList].find(
                (item) => item.brand_name
            )?.brand_name;
            setSelectedBrand(fallbackBrand || '');
            if (!filtered.length) {
                if (sortedHistorical.length) {
                    message.info(
                        'В актуальных прайсах ничего не найдено. ' +
                        'Ниже показана последняя история по старым прайсам.'
                    );
                } else {
                    message.info('В актуальных прайсах ничего не найдено');
                }
            }
        } catch (error) {
            console.error('Fetch offers error:', error);
            message.error('Ошибка получения данных');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (values) => {
        const oemValue = (values.oem || '').trim();
        await executeSearch(oemValue, partialSearch);
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
                    normalizeSupplierName(
                        item.supplier_name ??
                            item.supplier ??
                            item.supplier_title ??
                            item.supplier_company ??
                            item.provider ??
                            item.seller_name ??
                            item.price_name ??
                            item.sup_logo
                    );
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
                const supplierId =
                    item.supplier_id ??
                    item.provider_id ??
                    item?.provider?.id ??
                    null;
                const hashKey =
                    item.hash_key ??
                    item.api_hash ??
                    item.system_hash ??
                    null;
                return {
                    ...item,
                    oem,
                    price,
                    supplier_id: supplierId,
                    supplier_name: supplierName,
                    qnt: quantity,
                    detail_name: detailName,
                    make_name: makeName,
                    min_delivery_day: minDelivery,
                    max_delivery_day: maxDelivery,
                    hash_key: hashKey,
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

    const effectiveCartItems = useMemo(() => {
        if (!selectedCartKeys.length) {
            return cartItems;
        }
        const selectedSet = new Set(selectedCartKeys);
        return cartItems.filter((item) => selectedSet.has(item.cart_key));
    }, [cartItems, selectedCartKeys]);

    const selectedSupplierCartItems = useMemo(
        () => effectiveCartItems.filter((item) => item.source_type === 'supplier'),
        [effectiveCartItems]
    );

    const selectedDragonzapCartItems = useMemo(
        () => effectiveCartItems.filter((item) => item.source_type === 'dragonzap'),
        [effectiveCartItems]
    );

    const cartSummary = useMemo(() => {
        return cartItems.reduce(
            (acc, item) => {
                acc.total += 1;
                acc.sum += Number(item.price ?? 0) * Number(item.order_qty ?? 0);
                if (item.source_type === 'supplier') {
                    acc.supplier += 1;
                } else if (item.source_type === 'dragonzap') {
                    acc.dragonzap += 1;
                }
                return acc;
            },
            { total: 0, supplier: 0, dragonzap: 0, sum: 0 }
        );
    }, [cartItems]);

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

    const handleCreateSupplierOrders = async (sendNow = false) => {
        if (!selectedSupplierCartItems.length) {
            message.warning(
                selectedCartKeys.length
                    ? 'В выбранных строках нет позиций из прайсов поставщиков'
                    : 'Добавьте в корзину позиции из прайсов поставщиков'
            );
            return;
        }

        const groups = selectedSupplierCartItems.reduce((acc, item) => {
            const key = String(item.provider_id);
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        const createdOrderIds = [];
        const processedKeys = [];
        const failedProviders = [];

        setCartSubmitting(true);
        try {
            for (const [providerId, items] of Object.entries(groups)) {
                try {
                    const { data } = await createManualSupplierOrder({
                        provider_id: Number(providerId),
                        items: items.map((item) => ({
                            autopart_id: item.autopart_id,
                            oem: item.oem_number,
                            brand: item.brand_name,
                            quantity: Number(item.order_qty),
                            price: Number(item.price),
                        })),
                    });
                    if (data?.id) {
                        createdOrderIds.push(data.id);
                    }
                    processedKeys.push(...items.map((item) => item.cart_key));
                } catch {
                    failedProviders.push(
                        items[0]?.provider_name || `#${providerId}`
                    );
                }
            }

            if (sendNow && createdOrderIds.length) {
                const { data } = await sendSupplierOrders(createdOrderIds);
                message.success(
                    `Создано ${createdOrderIds.length} заказов. Отправлено ${data?.sent || 0}, ошибок ${data?.failed || 0}.`
                );
            } else if (createdOrderIds.length) {
                message.success(
                    `Создано ${createdOrderIds.length} заказов поставщикам.`
                );
            }

            if (failedProviders.length) {
                message.error(
                    `Не удалось создать заказы для: ${failedProviders.join(', ')}`
                );
            }

            if (processedKeys.length) {
                clearCartItems(processedKeys);
            }
        } catch (error) {
            const detail =
                error?.response?.data?.detail ||
                'Не удалось создать заказы поставщикам';
            message.error(detail);
        } finally {
            setCartSubmitting(false);
        }
    };

    const handleSendDragonzapCart = async () => {
        if (!selectedDragonzapCartItems.length) {
            message.warning(
                selectedCartKeys.length
                    ? 'В выбранных строках нет позиций с сайта'
                    : 'Добавьте в корзину позиции с сайта'
            );
            return;
        }

        const invalidItems = selectedDragonzapCartItems.filter(
            (item) =>
                !item.hash_key ||
                (!item.supplier_id && !normalizeSupplierName(item.supplier_name))
        );
        if (invalidItems.length) {
            const invalidPreview = invalidItems
                .slice(0, 3)
                .map((item) => item.oem_number || item.name || item.cart_key)
                .join(', ');
            message.error(
                `У части позиций сайта не хватает данных для заказа (${invalidPreview}). Нужны hash_key и поставщик.`
            );
            return;
        }

        const groups = selectedDragonzapCartItems.reduce((acc, item) => {
            const supplierName = normalizeSupplierName(
                item.supplier_name || item.provider_name
            );
            const key =
                item.supplier_id != null
                    ? `id:${item.supplier_id}`
                    : `name:${supplierName}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        const processedKeys = [];
        const failedSuppliers = [];

        setCartSubmitting(true);
        try {
            for (const [supplierId, items] of Object.entries(groups)) {
                try {
                    const payload = items.map((item) => ({
                        autopart_id: item.autopart_id ?? null,
                        oem_number: item.oem_number,
                        brand_name: item.brand_name,
                        autopart_name: item.name,
                        supplier_id:
                            item.supplier_id != null
                                ? Number(item.supplier_id)
                                : null,
                        supplier_name: normalizeSupplierName(
                            item.supplier_name || item.provider_name
                        ),
                        quantity: Number(item.order_qty),
                        confirmed_price: Number(item.price),
                        min_delivery_day: item.min_delivery_day,
                        max_delivery_day: item.max_delivery_day,
                        status: 'Send',
                        tracking_uuid: item.cart_key,
                        hash_key: item.hash_key,
                        system_hash: item.system_hash,
                    }));
                    const { data } = await sendDragonzapOrder(payload);
                    const successfulKeys = Array.isArray(data?.results)
                        ? data.results
                            .filter((result) => result?.status === 'success')
                            .map((result) => result.tracking_uuid)
                        : [];
                    processedKeys.push(...successfulKeys);
                    if ((data?.successful_items || 0) > 0) {
                        message.success(
                            `Dragonzap: оформлен заказ по поставщику ${items[0]?.provider_name || supplierId} (${data.successful_items} поз.).`
                        );
                    }
                    if ((data?.failed_items || 0) > 0) {
                        failedSuppliers.push(
                            items[0]?.provider_name || `#${supplierId}`
                        );
                    }
                } catch (error) {
                    const errorMessage = extractRequestError(
                        error,
                        'Ошибка отправки на Dragonzap'
                    );
                    failedSuppliers.push(
                        `${items[0]?.provider_name || `#${supplierId}`}: ${errorMessage}`
                    );
                }
            }

            if (processedKeys.length) {
                clearCartItems(processedKeys);
            }
            if (failedSuppliers.length) {
                message.error(
                    `Не удалось оформить заказ через Dragonzap для: ${failedSuppliers.join(', ')}`
                );
            }
        } finally {
            setCartSubmitting(false);
        }
    };

    const localColumns = [
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 112,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 88,
            ellipsis: true,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            width: 180,
        },
        {
            title: 'Источник',
            key: 'source',
            width: 170,
            ellipsis: true,
            render: (_, record) => (
                <div className="autopart-offers-source-cell">
                    <div className="autopart-offers-source-title">{record.provider_name}</div>
                    <div className="autopart-offers-source-meta">
                        {record.provider_config_name || 'Основной прайс'}
                        {record.is_own_price ? ' · Наш прайс' : ''}
                    </div>
                </div>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 82,
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
            width: 62,
            sorter: (a, b) => {
                const aQty = Number(a.quantity ?? Number.NEGATIVE_INFINITY);
                const bQty = Number(b.quantity ?? Number.NEGATIVE_INFINITY);
                return aQty - bQty;
            },
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 72,
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
            width: 86,
            render: (value) => formatShortDate(value),
        },
        {
            title: '',
            key: 'price_history',
            width: 48,
            render: (_, record) => (
                <Tooltip title="График цен">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<LineChartOutlined />}
                        onClick={() => navigate(`/autoparts/price-history?oem=${encodeURIComponent(record.oem_number)}`)}
                    />
                </Tooltip>
            ),
        },
        {
            title: '',
            key: 'add_to_cart',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Добавить в корзину">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<ShoppingCartOutlined />}
                        onClick={() => addLocalOfferToCart(record)}
                    />
                </Tooltip>
            ),
        },
    ];

    const historicalColumns = [
        ...localColumns
            .filter((column) => column.key !== 'add_to_cart')
            .map((column) => {
            if (column.key === 'source') {
                return {
                    ...column,
                    render: (_, record) => (
                        <div>
                            <div style={{ fontWeight: 500 }}>{record.provider_name}</div>
                            <div style={{ color: '#b45309', fontSize: 12 }}>
                                {record.provider_config_name || 'Основной прайс'} ·
                                {' '}нет в свежем прайсе
                            </div>
                        </div>
                    ),
                };
            }
            return column;
        }),
    ];

    const remoteColumns = [
        { title: 'OEM', dataIndex: 'oem', key: 'oem', width: 112 },
        { title: 'Бренд', dataIndex: 'make_name', key: 'make_name', width: 88, ellipsis: true },
        { title: 'Наименование', dataIndex: 'detail_name', key: 'detail_name', ellipsis: true, width: 180 },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 82,
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
            width: 62,
            render: (value) => (value === null || value === undefined ? '—' : value),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 72,
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
            width: 130,
            render: (value) => value || '—',
        },
        { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true, width: 140 },
        {
            title: '',
            key: 'price_history',
            width: 48,
            render: (_, record) => {
                const oem = record.oem || record.oem_number;
                return (
                    <Tooltip title="График цен">
                        <Button
                            size="small"
                            type="text"
                            shape="circle"
                            icon={<LineChartOutlined />}
                            onClick={() => {
                                if (!oem) return;
                                navigate(`/autoparts/price-history?oem=${encodeURIComponent(oem)}`);
                            }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            title: '',
            key: 'add_to_cart',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Добавить в корзину">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<ShoppingCartOutlined />}
                        onClick={() => addDragonzapOfferToCart(record)}
                    />
                </Tooltip>
            ),
        },
    ];

    const cartColumns = [
        {
            title: 'Источник',
            dataIndex: 'source_type',
            key: 'source_type',
            width: 92,
            render: (value) => (
                <Tag color={value === 'dragonzap' ? 'blue' : 'green'}>
                    {value === 'dragonzap' ? 'Сайт' : 'Прайс'}
                </Tag>
            ),
        },
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 130,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 110,
            ellipsis: true,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            ellipsis: true,
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            key: 'provider_name',
            width: 180,
            ellipsis: true,
            render: (value, record) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{value || '—'}</div>
                    {record.provider_config_name ? (
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {record.provider_config_name}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 90,
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Доступно',
            dataIndex: 'available_qty',
            key: 'available_qty',
            width: 82,
            render: (value) => value ?? '—',
        },
        {
            title: 'В заказ',
            dataIndex: 'order_qty',
            key: 'order_qty',
            width: 95,
            render: (value, record) => (
                <InputNumber
                    min={1}
                    max={Number(record.available_qty) > 0 ? Number(record.available_qty) : undefined}
                    value={value}
                    size="small"
                    style={{ width: '100%' }}
                    onChange={(nextValue) => updateCartQty(record.cart_key, nextValue)}
                />
            ),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 90,
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
            title: '',
            key: 'remove',
            width: 64,
            render: (_, record) => (
                <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeCartItem(record.cart_key)}
                />
            ),
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
                        onSearch={(value) => setOemInput(value)}
                        onChange={(value) => setOemInput(value)}
                        onSelect={(value) => {
                            const normalized = String(value || '').trim();
                            form.setFieldsValue({ oem: normalized });
                            setOemInput(normalized);
                            setPartialSearch(false);
                            void executeSearch(normalized, false);
                        }}
                        notFoundContent={
                            lookupLoading ? 'Поиск...' : undefined
                        }
                        filterOption={(inputValue, option) =>
                            option?.value
                                ?.toLowerCase()
                                .includes(inputValue.toLowerCase())
                        }
                    >
                        <Input />
                    </AutoComplete>
                </Form.Item>
                <Form.Item style={{ marginRight: 0 }}>
                    <Checkbox
                        checked={partialSearch}
                        onChange={(e) => setPartialSearch(e.target.checked)}
                    >
                        Искать по части номера
                    </Checkbox>
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
                    className="autopart-offers-table"
                    rowKey={(record) =>
                        `${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                    }
                    columns={localColumns}
                    dataSource={filteredOffers}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    tableLayout="fixed"
                    scroll={{ x: 820 }}
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
                        className="autopart-offers-table"
                        rowKey={(record, index) => record.api_hash || `${record.oem}-${index}`}
                        columns={remoteColumns}
                        dataSource={remoteOffers}
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        tableLayout="fixed"
                        scroll={{ x: 820 }}
                    />
                </Spin>
            </Space>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Корзина заказа
                    </div>
                    <div style={{ color: '#6b7280' }}>
                        Всего позиций: {cartSummary.total} · из прайсов: {cartSummary.supplier} · с сайта: {cartSummary.dragonzap} · сумма: {cartSummary.sum.toFixed(2)}
                        {selectedCartKeys.length
                            ? ` · выбрано: ${selectedCartKeys.length}`
                            : ' · если ничего не выделено, действие применяется ко всей корзине'}
                    </div>
                </div>

                <Space wrap>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!selectedSupplierCartItems.length}
                        loading={cartSubmitting}
                        onClick={() => handleCreateSupplierOrders(false)}
                    >
                        Создать заказы поставщикам
                    </Button>
                    <Button
                        icon={<MailOutlined />}
                        disabled={!selectedSupplierCartItems.length}
                        loading={cartSubmitting}
                        onClick={() => handleCreateSupplierOrders(true)}
                    >
                        Создать и отправить письмом
                    </Button>
                    <Button
                        type="primary"
                        ghost
                        icon={<SendOutlined />}
                        disabled={!selectedDragonzapCartItems.length}
                        loading={cartSubmitting}
                        onClick={handleSendDragonzapCart}
                    >
                        Отправить на Dragonzap
                    </Button>
                    <Button
                        disabled={!cartItems.length}
                        onClick={() => {
                            setCartItems([]);
                            setSelectedCartKeys([]);
                        }}
                    >
                        Очистить корзину
                    </Button>
                </Space>

                <Table
                    rowKey="cart_key"
                    columns={cartColumns}
                    dataSource={cartItems}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    tableLayout="fixed"
                    rowSelection={{
                        selectedRowKeys: selectedCartKeys,
                        onChange: (keys) => setSelectedCartKeys(keys),
                    }}
                    locale={{
                        emptyText: 'Корзина пуста',
                    }}
                    scroll={{ x: 1080 }}
                />
            </Space>

            {historicalOffers.length ? (
                <>
                    <Divider />
                    <Space
                        direction="vertical"
                        style={{ width: '100%' }}
                        size="small"
                    >
                        <div style={{ color: '#6b7280' }}>
                            История по старым прайсам. Эти позиции уже не
                            найдены в свежих прайсах поставщиков, но раньше по
                            ним были предложения.
                        </div>
                        <Table
                            className="autopart-offers-table"
                            rowKey={(record) =>
                                `history-${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                            }
                            columns={historicalColumns}
                            dataSource={historicalOffers}
                            size="small"
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            tableLayout="fixed"
                            scroll={{ x: 820 }}
                        />
                    </Space>
                </>
            ) : null}
        </Card>
    );
};

export default AutopartOffers;
